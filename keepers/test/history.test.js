'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { makeFakeClient } = require('./fixtures/fake-client');
const { walkDraftHistory, findOriginalDraftPick, findLatestAddWeek } = require('../history');

function buildFixtureClient() {
  return makeFakeClient({
    leagues: {
      '2025L': { league_id: '2025L', season: '2025', draft_id: '2025D', previous_league_id: '2024L' },
      '2024L': { league_id: '2024L', season: '2024', draft_id: '2024D', previous_league_id: '0' },
    },
    draftPicks: {
      // P1 was kept into 2025 (is_keeper pick, should be ignored) - its real
      // draft was in 2024, round 8, by roster 1.
      '2025D': [{ player_id: 'P1', round: 6, roster_id: 1, is_keeper: true }],
      '2024D': [
        { player_id: 'P1', round: 8, roster_id: 1, is_keeper: false },
        { player_id: 'P2', round: 5, roster_id: 2, is_keeper: false },
      ],
    },
    rosters: {},
    users: {},
    transactions: {
      '2025L': {
        5: [{ status: 'complete', adds: { P4: 1 } }],
        14: [{ status: 'complete', adds: { P5: 1 } }],
        6: [{ status: 'complete', adds: { P4: 3 } }], // different roster, ignored for roster 1 lookups
      },
    },
  });
}

test('walkDraftHistory follows previous_league_id and stops at the end of the chain', async () => {
  const client = buildFixtureClient();
  const { seasons, truncated } = await walkDraftHistory(client, '2025L', { maxSeasons: 6 });
  assert.equal(truncated, false);
  assert.deepEqual(
    seasons.map((s) => s.leagueId),
    ['2025L', '2024L']
  );
});

test('walkDraftHistory reports truncated when maxSeasons cuts the walk short', async () => {
  const client = buildFixtureClient();
  const { seasons, truncated } = await walkDraftHistory(client, '2025L', { maxSeasons: 1 });
  assert.equal(truncated, true);
  assert.equal(seasons.length, 1);
});

test('findOriginalDraftPick skips keeper picks and finds the genuine draft season', async () => {
  const client = buildFixtureClient();
  const { seasons } = await walkDraftHistory(client, '2025L', { maxSeasons: 6 });

  const p1 = findOriginalDraftPick(seasons, 'P1');
  assert.equal(p1.season.season, '2024');
  assert.equal(p1.pick.round, 8);
  assert.equal(p1.pick.roster_id, 1);

  const p2 = findOriginalDraftPick(seasons, 'P2');
  assert.equal(p2.pick.round, 5);
  assert.equal(p2.pick.roster_id, 2);

  const p3 = findOriginalDraftPick(seasons, 'P3');
  assert.equal(p3, null);
});

test('findLatestAddWeek returns the latest matching week, or null if never added this season', async () => {
  const client = buildFixtureClient();
  const txns = {
    5: await client.getTransactionsWeek('2025L', 5),
    6: await client.getTransactionsWeek('2025L', 6),
    14: await client.getTransactionsWeek('2025L', 14),
  };

  assert.equal(findLatestAddWeek(txns, 'P4', 1), 5);
  assert.equal(findLatestAddWeek(txns, 'P4', 3), 6);
  assert.equal(findLatestAddWeek(txns, 'P5', 1), 14);
  assert.equal(findLatestAddWeek(txns, 'P6', 1), null);
});
