#!/usr/bin/env node
// CLI entry point: evaluate keeper eligibility and forfeited-round cost for
// every team in a Sleeper league, per League Constitution 4.7.
//
// Usage:
//   node check-keepers.js <league_id> [options]
//
// Options:
//   --config <path>       JSON config file (see config.example.json)
//   --deadline-week <n>   Override the Week 11 trade-deadline cutoff (4.7.5)
//   --max-seasons <n>     How many seasons back to search for a player's
//                         true original draft pick (default 6)
//   --all                 Evaluate every rostered player, not just players
//                         designated as keepers in Sleeper (roster.keepers)
//   --names               Fetch the full player directory to print names
//                         instead of raw player IDs (slow, multi-MB)
//   --refresh             Bypass the on-disk cache
//   --json <path>         Also write the full result as JSON to this path
//
// This tool does NOT track the 4.7.6 two-consecutive-year keeper limit -
// that's tracked manually per the project owner's request. It also assumes
// it's being run against the roster/transaction state shortly after Week 17
// concludes; run it later and you're checking a different snapshot than
// 4.7.2 describes.

'use strict';

const fs = require('fs');
const path = require('path');

const { createSleeperClient } = require('./sleeper');
const { walkDraftHistory, getCurrentSeasonData } = require('./history');
const { classifyAcquisition, checkTradeDeadlineEligibility, resolveRoundCollisions } = require('./rules');
const { printReport } = require('./report');

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--all' || arg === '--names' || arg === '--refresh') {
      args[arg.slice(2)] = true;
    } else if (arg.startsWith('--')) {
      args[arg.slice(2)] = argv[i + 1];
      i += 1;
    } else {
      args._.push(arg);
    }
  }
  return args;
}

function loadConfig(configPath) {
  if (!configPath) return {};
  const resolved = path.resolve(configPath);
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const leagueId = args._[0];
  if (!leagueId) {
    console.error('Usage: node check-keepers.js <league_id> [options]');
    console.error('Run with --help-full or see the header comment in check-keepers.js for all options.');
    process.exit(1);
  }

  const config = loadConfig(args.config);
  const maxSeasons = Number(args['max-seasons'] || config.maxSeasons || 6);
  const client = createSleeperClient();

  console.error(`Fetching league chain (up to ${maxSeasons} seasons back)...`);
  const { seasons, truncated } = await walkDraftHistory(client, leagueId, { maxSeasons });

  console.error('Fetching current season rosters/users/transactions...');
  const current = await getCurrentSeasonData(client, leagueId);

  const deadlineWeek = Number(
    args['deadline-week'] || config.tradeDeadlineWeek || (current.league.settings && current.league.settings.trade_deadline) || 11
  );

  const usersById = new Map(current.users.map((u) => [u.user_id, u]));
  const nameByPlayerId = new Map();
  if (args.names) {
    console.error('Fetching player directory for names (this is a large download)...');
    try {
      const players = await client.getPlayersMeta();
      for (const [id, meta] of Object.entries(players)) {
        if (meta && meta.full_name) nameByPlayerId.set(id, meta.full_name);
      }
    } catch (err) {
      console.error(`Warning: could not fetch player names (${err.message}); falling back to player IDs.`);
    }
  }

  const teams = [];
  for (const roster of current.rosters) {
    const owner = usersById.get(roster.owner_id);
    const teamName = (owner && (owner.metadata?.team_name || owner.display_name)) || `roster ${roster.roster_id}`;
    const notes = [];

    let candidateIds;
    if (config.candidates && config.candidates[roster.roster_id]) {
      candidateIds = config.candidates[roster.roster_id];
      notes.push('candidate list from config.candidates');
    } else if (Array.isArray(roster.keepers) && roster.keepers.length) {
      candidateIds = roster.keepers;
      notes.push('candidate list from Sleeper roster.keepers designation (4.7.7)');
    } else if (args.all) {
      candidateIds = roster.players || [];
      notes.push('no keepers designated - evaluating full roster (--all)');
    } else {
      candidateIds = [];
      notes.push('no keepers designated in Sleeper and no config.candidates entry - pass --all to explore, or set config.candidates');
    }

    const rosterPlayers = new Set(roster.players || []);
    const evaluations = candidateIds.map((playerId) => {
      const onRoster = rosterPlayers.has(playerId);
      const classification = classifyAcquisition(seasons, truncated, playerId, roster.roster_id, config.adpOverrides);
      const deadline = checkTradeDeadlineEligibility(current.transactionsByWeek, playerId, roster.roster_id, deadlineWeek);
      const classificationOk = classification.type !== 'undrafted-needs-adp' && classification.type !== 'inconclusive';
      const eligible = onRoster && deadline.eligible && classificationOk;
      return {
        playerId,
        playerName: nameByPlayerId.get(playerId),
        onRoster,
        classification,
        deadline,
        eligible,
        baseRound: classification.baseRound,
      };
    });

    // 4.7.4 round-collision bump only applies among this team's eligible keepers.
    const eligibleForCollision = evaluations.filter((e) => e.eligible);
    const bumped = resolveRoundCollisions(eligibleForCollision.map((e) => ({ id: e.playerId, baseRound: e.baseRound })));
    const finalRoundById = new Map(bumped.map((b) => [b.id, b.finalRound]));
    for (const evaluation of evaluations) {
      evaluation.finalRound = finalRoundById.has(evaluation.playerId) ? finalRoundById.get(evaluation.playerId) : null;
    }

    teams.push({
      rosterId: roster.roster_id,
      teamName,
      deadlineWeek,
      notes,
      keepers: evaluations,
    });
  }

  printReport(teams);

  if (truncated) {
    console.error(
      `\nWarning: league history walk hit the --max-seasons limit (${maxSeasons}) without reaching this league's first season. ` +
        'Any "undrafted" verdicts above marked UNRESOLVED need a deeper search to confirm.'
    );
  }

  if (args.json) {
    const outPath = path.resolve(args.json);
    fs.writeFileSync(outPath, JSON.stringify({ deadlineWeek, truncated, teams }, null, 2));
    console.error(`\nWrote full JSON result to ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err.stack || err.message);
  process.exit(1);
});
