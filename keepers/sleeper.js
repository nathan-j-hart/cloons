// Typed-ish accessors for the specific Sleeper endpoints the keeper checker
// needs. Kept separate from sleeper-client.js's raw GET so history.js can be
// unit-tested against a fake client instead of the network.

'use strict';

const { sleeperGet } = require('./sleeper-client');

const HOUR = 60 * 60 * 1000;

function createSleeperClient() {
  return {
    // Live/mutable data: short cache TTL.
    getLeague: (leagueId) =>
      sleeperGet(`/league/${leagueId}`, { cacheKey: `league_${leagueId}`, maxAgeMs: HOUR }),

    getRosters: (leagueId) =>
      sleeperGet(`/league/${leagueId}/rosters`, { cacheKey: `rosters_${leagueId}`, maxAgeMs: 15 * 60 * 1000 }),

    getUsers: (leagueId) =>
      sleeperGet(`/league/${leagueId}/users`, { cacheKey: `users_${leagueId}`, maxAgeMs: HOUR }),

    // Transactions for a single week ("round" in Sleeper's own docs, but it
    // means week number here, not draft round).
    getTransactionsWeek: (leagueId, week) =>
      sleeperGet(`/league/${leagueId}/transactions/${week}`, { cacheKey: `txns_${leagueId}_${week}` }),

    // Past-season draft data never changes once the draft is complete, so
    // these cache indefinitely (pass refresh:true via --refresh to bust).
    getDraft: (draftId) =>
      sleeperGet(`/draft/${draftId}`, { cacheKey: `draft_${draftId}` }),

    getDraftPicks: (draftId) =>
      sleeperGet(`/draft/${draftId}/picks`, { cacheKey: `draftpicks_${draftId}` }),

    // Large (multi-MB) full player dump, used only for human-readable names.
    getPlayersMeta: () =>
      sleeperGet(`/players/nfl`, { cacheKey: `players_nfl`, maxAgeMs: 24 * HOUR }),
  };
}

module.exports = { createSleeperClient };
