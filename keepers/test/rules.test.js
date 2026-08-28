'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyAcquisition,
  checkTradeDeadlineEligibility,
  resolveRoundCollisions,
} = require('../rules');

function seasonsWithPick(pick) {
  return [{ season: '2025', picks: [pick] }];
}

test('4.7.3: self-drafted player forfeits round drafted minus 2', () => {
  const seasons = seasonsWithPick({ player_id: 'P1', round: 8, roster_id: 1, is_keeper: false });
  const result = classifyAcquisition(seasons, false, 'P1', 1);
  assert.equal(result.type, 'self-drafted');
  assert.equal(result.baseRound, 6);
});

test('4.7.3: player drafted by someone else and acquired via trade/waiver forfeits the original round', () => {
  const seasons = seasonsWithPick({ player_id: 'P1', round: 8, roster_id: 1, is_keeper: false });
  const result = classifyAcquisition(seasons, false, 'P1', /* currentRosterId */ 2);
  assert.equal(result.type, 'acquired');
  assert.equal(result.baseRound, 8);
  assert.equal(result.draftedByRosterId, 1);
});

test('4.7.3: undrafted player uses ADP round + 2, from a manual round override', () => {
  const seasons = [{ season: '2025', picks: [] }];
  const adpOverrides = { P9: { round: 9 } };
  const result = classifyAcquisition(seasons, false, 'P9', 1, adpOverrides);
  assert.equal(result.type, 'undrafted');
  assert.equal(result.adpRound, 9);
  assert.equal(result.baseRound, 11);
});

test('4.7.3: undrafted player ADP can be given as an overall pick + team count', () => {
  const seasons = [{ season: '2025', picks: [] }];
  const adpOverrides = { P9: { overallPick: 34, teamCount: 12 } };
  const result = classifyAcquisition(seasons, false, 'P9', 1, adpOverrides);
  assert.equal(result.type, 'undrafted');
  assert.equal(result.adpRound, 3); // ceil(34/12)
  assert.equal(result.baseRound, 5);
});

test('4.7.3: undrafted player with no ADP data is reported unresolved, not guessed', () => {
  const seasons = [{ season: '2025', picks: [] }];
  const result = classifyAcquisition(seasons, false, 'P9', 1, {});
  assert.equal(result.type, 'undrafted-needs-adp');
});

test('a truncated history search with no draft pick found is inconclusive, not undrafted', () => {
  const seasons = [{ season: '2025', picks: [] }];
  const result = classifyAcquisition(seasons, /* truncated */ true, 'P9', 1, {});
  assert.equal(result.type, 'inconclusive');
});

test('4.7.5: player added before the deadline week is eligible', () => {
  const txns = { 5: [{ status: 'complete', adds: { P1: 1 } }] };
  const result = checkTradeDeadlineEligibility(txns, 'P1', 1, 11);
  assert.equal(result.eligible, true);
  assert.equal(result.addedWeek, 5);
});

test('4.7.5: player added after the deadline week is ineligible', () => {
  const txns = { 14: [{ status: 'complete', adds: { P1: 1 } }] };
  const result = checkTradeDeadlineEligibility(txns, 'P1', 1, 11);
  assert.equal(result.eligible, false);
  assert.equal(result.addedWeek, 14);
});

test('4.7.5: a player never added this season (drafted, or held over) is eligible', () => {
  const txns = {};
  const result = checkTradeDeadlineEligibility(txns, 'P1', 1, 11);
  assert.equal(result.eligible, true);
  assert.equal(result.addedWeek, null);
});

test('4.7.4: two keepers landing on the same round forfeit that round and the one ahead of it', () => {
  const result = resolveRoundCollisions([
    { id: 'A', baseRound: 10 },
    { id: 'B', baseRound: 10 },
  ]);
  assert.equal(result[0].finalRound, 10);
  assert.equal(result[0].bumped, false);
  assert.equal(result[1].finalRound, 9);
  assert.equal(result[1].bumped, true);
});

test('4.7.4: a three-way collision cascades down another round', () => {
  const result = resolveRoundCollisions([
    { id: 'A', baseRound: 10 },
    { id: 'B', baseRound: 10 },
    { id: 'C', baseRound: 10 },
  ]);
  assert.deepEqual(
    result.map((r) => r.finalRound),
    [10, 9, 8]
  );
});

test('non-colliding keepers are left at their base round', () => {
  const result = resolveRoundCollisions([
    { id: 'A', baseRound: 10 },
    { id: 'B', baseRound: 7 },
  ]);
  assert.deepEqual(
    result.map((r) => r.finalRound),
    [10, 7]
  );
});

test('a collision cascading past Round 1 is flagged for a commissioner ruling', () => {
  const result = resolveRoundCollisions([
    { id: 'A', baseRound: 1 },
    { id: 'B', baseRound: 1 },
  ]);
  assert.equal(result[1].finalRound, 0);
  assert.equal(result[1].belowFloor, true);
});
