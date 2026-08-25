// Pure functions implementing League Constitution section 4.7 (Keepers).
// No network access here - everything takes already-fetched data so it can
// be unit tested with fixtures. Rule numbers in comments refer to 4.7.n.

'use strict';

const MAX_KEEPERS_PER_TEAM = 3; // 4.7.1

/**
 * Classify how a roster acquired a player and compute the *base* forfeited
 * round (before the same-round collision bump in rule 4). Implements 4.7.3.
 *
 * @param {Array} seasons - season chain from history.walkDraftHistory(), newest first
 * @param {boolean} truncated - true if the chain walk was cut off by maxSeasons
 * @param {string} playerId
 * @param {number} currentRosterId
 * @param {object} [adpLookup] - see resolveAdpRound()
 * @returns {object} classification result, see shapes below
 */
function classifyAcquisition(seasons, truncated, playerId, currentRosterId, adpLookup) {
  const found = require('./history').findOriginalDraftPick(seasons, playerId);

  if (!found) {
    if (truncated) {
      return {
        type: 'inconclusive',
        reason:
          'No genuine draft pick found for this player within the seasons searched, ' +
          'but the league history walk was truncated (--max-seasons) before reaching ' +
          "the league's first season. Increase --max-seasons to get a definitive answer.",
      };
    }
    const adp = resolveAdpRound(playerId, adpLookup);
    if (!adp) {
      return {
        type: 'undrafted-needs-adp',
        reason:
          'Player was never drafted in this league (in any season on record). ' +
          '4.7.3 requires their Sleeper ADP from one week before the draft to compute ' +
          'the forfeited round (ADP round + 2), and no ADP was supplied.',
      };
    }
    return {
      type: 'undrafted',
      adpRound: adp.round,
      adpSource: adp.source,
      baseRound: adp.round + 2,
    };
  }

  const { pick, season } = found;
  if (pick.roster_id === currentRosterId) {
    return {
      type: 'self-drafted',
      draftedRound: pick.round,
      draftedSeason: season.season,
      baseRound: pick.round - 2,
    };
  }
  return {
    type: 'acquired',
    draftedRound: pick.round,
    draftedSeason: season.season,
    draftedByRosterId: pick.roster_id,
    baseRound: pick.round,
  };
}

/**
 * Resolve an ADP round for an undrafted player from a manual override table
 * (the only trustworthy source right now - see README's ADP caveat).
 *
 * @param {object} [adpLookup] - `{ [playerId]: { round } | { overallPick, teamCount } }`
 */
function resolveAdpRound(playerId, adpLookup) {
  if (!adpLookup || !adpLookup[playerId]) return null;
  const entry = adpLookup[playerId];
  if (entry.round != null) {
    return { round: entry.round, source: 'manual-round' };
  }
  if (entry.overallPick != null && entry.teamCount) {
    return {
      round: Math.ceil(entry.overallPick / entry.teamCount),
      source: 'manual-overall-pick',
    };
  }
  return null;
}

/**
 * 4.7.5: only players added to the roster before the Week 11 trade deadline
 * are keeper eligible. Returns { eligible, addedWeek } - addedWeek is null
 * when no same-season add transaction exists (drafted this season, or held
 * over from a prior season without a same-season move - both trivially
 * satisfy this rule).
 */
function checkTradeDeadlineEligibility(transactionsByWeek, playerId, rosterId, deadlineWeek) {
  const { findLatestAddWeek } = require('./history');
  const addedWeek = findLatestAddWeek(transactionsByWeek, playerId, rosterId);
  if (addedWeek === null) return { eligible: true, addedWeek: null };
  return { eligible: addedWeek <= deadlineWeek, addedWeek };
}

/**
 * 4.7.4: if two of a team's keepers land on the same forfeited round, that
 * round and the round ahead of it (round - 1) are both forfeited. Extends
 * to a third collision by continuing to bump down. Order among colliding
 * keepers is arbitrary (the rule only fixes the *set* of rounds forfeited);
 * ties are broken by input order for determinism, and callers should treat
 * `finalRound` as "the round this keeper's slot ended up needing", not as
 * a claim about which specific keeper "really" belongs to which round.
 *
 * @param {Array<{id: string, baseRound: number}>} keepers - one team's keepers
 * @returns {Array<{id: string, baseRound: number, finalRound: number, bumped: boolean, belowFloor: boolean}>}
 */
function resolveRoundCollisions(keepers) {
  const used = new Set();
  return keepers.map((k) => {
    let round = k.baseRound;
    while (used.has(round)) round -= 1;
    used.add(round);
    return {
      ...k,
      finalRound: round,
      bumped: round !== k.baseRound,
      belowFloor: round < 1,
    };
  });
}

module.exports = {
  MAX_KEEPERS_PER_TEAM,
  classifyAcquisition,
  resolveAdpRound,
  checkTradeDeadlineEligibility,
  resolveRoundCollisions,
};
