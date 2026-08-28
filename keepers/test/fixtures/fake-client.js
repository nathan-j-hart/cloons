// A fake Sleeper client for tests: same method shapes as
// sleeper.js#createSleeperClient, backed by an in-memory fixture instead of
// the network.

'use strict';

function makeFakeClient({ leagues, draftPicks, rosters, users, transactions }) {
  return {
    async getLeague(leagueId) {
      const league = leagues[leagueId];
      if (!league) throw new Error(`fixture missing league ${leagueId}`);
      return league;
    },
    async getRosters(leagueId) {
      return rosters[leagueId] || [];
    },
    async getUsers(leagueId) {
      return users[leagueId] || [];
    },
    async getTransactionsWeek(leagueId, week) {
      return (transactions[leagueId] && transactions[leagueId][week]) || [];
    },
    async getDraft() {
      throw new Error('not used by history.js');
    },
    async getDraftPicks(draftId) {
      return draftPicks[draftId] || [];
    },
    async getPlayersMeta() {
      return {};
    },
  };
}

module.exports = { makeFakeClient };
