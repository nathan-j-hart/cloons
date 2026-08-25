// Formats a keeper-check run into a console report and a JSON-serializable
// structure.

'use strict';

function formatClassification(c) {
  switch (c.type) {
    case 'self-drafted':
      return `self-drafted R${c.draftedRound} (${c.draftedSeason}) -> forfeit R${c.baseRound}`;
    case 'acquired':
      return `acquired via trade/waiver, originally drafted R${c.draftedRound} (${c.draftedSeason}) by roster ${c.draftedByRosterId} -> forfeit R${c.baseRound}`;
    case 'undrafted':
      return `undrafted, ADP round ${c.adpRound} [${c.adpSource}] -> forfeit R${c.baseRound}`;
    case 'undrafted-needs-adp':
      return `UNRESOLVED: ${c.reason}`;
    case 'inconclusive':
      return `UNRESOLVED: ${c.reason}`;
    default:
      return `unknown classification: ${JSON.stringify(c)}`;
  }
}

function printReport(teams) {
  for (const team of teams) {
    console.log(`\n=== ${team.teamName} (roster ${team.rosterId}) ===`);
    if (team.notes.length) {
      for (const note of team.notes) console.log(`  note: ${note}`);
    }
    if (!team.keepers.length) {
      console.log('  (no keeper candidates evaluated)');
      continue;
    }
    for (const k of team.keepers) {
      const name = k.playerName || k.playerId;
      const status = k.eligible ? 'ELIGIBLE' : 'INELIGIBLE';
      console.log(`  [${status}] ${name}`);
      console.log(`      ${formatClassification(k.classification)}`);
      if (k.finalRound != null && k.finalRound !== k.classification.baseRound) {
        console.log(`      round-collision bump -> forfeit R${k.finalRound} instead`);
      }
      if (k.finalRound != null && k.finalRound < 1) {
        console.log(`      WARNING: forfeited round fell below Round 1 - needs commissioner ruling`);
      }
      if (!k.onRoster) {
        console.log(`      INELIGIBLE: not on the roster (4.7.2 requires being rostered at the Week 17 snapshot used for this run)`);
      }
      if (k.deadline && !k.deadline.eligible) {
        console.log(`      INELIGIBLE: added on week ${k.deadline.addedWeek}, after the Week ${team.deadlineWeek} trade deadline (4.7.5)`);
      }
    }
    if (team.keepers.length > 3) {
      console.log(`  WARNING: ${team.keepers.length} candidates evaluated, but 4.7.1 caps keepers at 3 - team must choose.`);
    }
    const forfeited = team.keepers
      .filter((k) => k.eligible)
      .map((k) => k.finalRound)
      .sort((a, b) => a - b);
    if (forfeited.length) {
      console.log(`  Rounds forfeited if all eligible keepers above are kept: ${forfeited.join(', ')}`);
    }
  }
}

module.exports = { printReport, formatClassification };
