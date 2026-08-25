// Builds the data a keeper decision needs from Sleeper: the multi-season
// draft-pick history for a league lineage (walking `previous_league_id`),
// and the current season's rosters/users/transactions.
//
// Every function here takes a `client` (see sleeper.js's createSleeperClient)
// so it can be exercised in tests against a fake client with fixture data,
// with no network involved.

'use strict';

const DEFAULT_MAX_SEASONS = 6;
// Sleeper regular seasons run through week 17 or 18 depending on league
// settings; scanning a bit past that is harmless (empty transaction lists).
const DEFAULT_WEEKS_TO_SCAN = 18;

function hasPreviousLeague(league) {
  return Boolean(league.previous_league_id) && league.previous_league_id !== '0';
}

/**
 * Walk a league's `previous_league_id` chain, newest season first, fetching
 * each season's league record and draft picks.
 *
 * @returns {Promise<{seasons: Array<{leagueId: string, season: string, league: object, draftId: string|null, picks: object[]}>, truncated: boolean}>}
 *   `truncated: true` means the walk stopped because it hit `maxSeasons`,
 *   not because it found the league's actual first season - callers should
 *   treat an "undrafted" verdict as inconclusive in that case.
 */
async function walkDraftHistory(client, currentLeagueId, { maxSeasons = DEFAULT_MAX_SEASONS } = {}) {
  const seasons = [];
  let leagueId = currentLeagueId;
  let truncated = false;

  while (leagueId) {
    if (seasons.length >= maxSeasons) {
      truncated = true;
      break;
    }
    const league = await client.getLeague(leagueId);
    let picks = [];
    if (league.draft_id) {
      picks = await client.getDraftPicks(league.draft_id);
    }
    seasons.push({
      leagueId,
      season: league.season,
      league,
      draftId: league.draft_id || null,
      picks,
    });
    leagueId = hasPreviousLeague(league) ? league.previous_league_id : null;
  }

  return { seasons, truncated };
}

/**
 * Find the newest genuine (non-keeper) draft pick for a player across a
 * season chain from walkDraftHistory(). Keeper-slot picks (is_keeper: true)
 * are skipped so a player kept multiple years in a row still resolves to
 * the round they were *actually* drafted in, per constitution 4.7.3.
 *
 * @returns {{pick: object, season: object} | null}
 */
function findOriginalDraftPick(seasons, playerId) {
  for (const season of seasons) {
    const pick = season.picks.find((p) => p.player_id === playerId && !p.is_keeper);
    if (pick) return { pick, season };
  }
  return null;
}

/**
 * Fetch the current season's league, rosters, users, and transactions
 * (all weeks 1..weeksToScan, or up to the league's playoff start if known).
 */
async function getCurrentSeasonData(client, leagueId, { weeksToScan } = {}) {
  const league = await client.getLeague(leagueId);
  const rosters = await client.getRosters(leagueId);
  const users = await client.getUsers(leagueId);

  const lastWeek =
    weeksToScan ||
    (league.settings && league.settings.last_scored_leg) ||
    DEFAULT_WEEKS_TO_SCAN;

  const transactionsByWeek = {};
  for (let week = 1; week <= lastWeek; week += 1) {
    transactionsByWeek[week] = await client.getTransactionsWeek(leagueId, week);
  }

  return { league, rosters, users, transactionsByWeek };
}

/**
 * The latest week (across all fetched weeks) in which a completed
 * transaction added `playerId` onto `rosterId`. Returns null if no such
 * transaction exists this season (e.g. drafted this season, or held over
 * continuously from a prior season with no same-season move).
 */
function findLatestAddWeek(transactionsByWeek, playerId, rosterId) {
  let latest = null;
  for (const [weekStr, txns] of Object.entries(transactionsByWeek)) {
    const week = Number(weekStr);
    for (const txn of txns) {
      if (txn.status !== 'complete') continue;
      if (!txn.adds) continue;
      if (txn.adds[playerId] === rosterId) {
        if (latest === null || week > latest) latest = week;
      }
    }
  }
  return latest;
}

module.exports = {
  walkDraftHistory,
  findOriginalDraftPick,
  getCurrentSeasonData,
  findLatestAddWeek,
  hasPreviousLeague,
};
