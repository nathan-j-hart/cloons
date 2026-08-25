# Keeper checker

Checks each team's keeper candidates against League Constitution **4.7
Keepers**, using the Sleeper API. It figures out how a player was acquired,
what round the team would forfeit to keep them, whether the two-keepers-
same-round bump applies, and whether the player was added before the Week 11
trade deadline.

**Not covered:** 4.7.6, the two-consecutive-year keeper limit. That's tracked
manually per league request — nothing here stops you from "keeping" a player
for a third year, so cross-check that yourself before submitting.

## How the rules map to code

| Rule | What it means | Where |
| --- | --- | --- |
| 4.7.1 | Up to 3 keepers per team | `rules.MAX_KEEPERS_PER_TEAM`; the report warns if more than 3 candidates are evaluated for one team, it does not pick for you |
| 4.7.2 | Must be on the roster at the Week 17 snapshot | checked against the *current* `/rosters` response — see **Timing assumption** below |
| 4.7.3 | Forfeited round depends on how the player was acquired | `rules.classifyAcquisition` |
| 4.7.4 | Two keepers landing on the same round both bump (round, round-1) | `rules.resolveRoundCollisions` |
| 4.7.5 | Must be added before the Week 11 trade deadline | `rules.checkTradeDeadlineEligibility` |
| 4.7.6 | Two-year keeper limit | **manual**, not implemented |
| 4.7.7 | Keepers designated in Sleeper | reads `roster.keepers` as the candidate list by default |

### How 4.7.3 is resolved

Sleeper marks a draft pick used to slot in a keeper with `is_keeper: true`.
That means the *real* draft event for a player — the one 4.7.3 actually cares
about — is the newest **non**-keeper pick for that player anywhere in the
league's history. To find it, the tool walks the league's `previous_league_id`
chain (each Sleeper season is a new league object linked back to the last)
looking for that pick:

- **Found, and it's on the team asking to keep them** → self-drafted →
  forfeit `round - 2`.
- **Found, but drafted by a different roster** → acquired via trade/waiver →
  forfeit the original round, no adjustment.
- **Not found anywhere in the history searched** → undrafted → forfeit
  `ADP round + 2` (see the ADP caveat below).

This also means a player kept in back-to-back years still resolves to the
round they were *actually* drafted in, not the round they were slotted into
as a keeper last year.

`--max-seasons` (default 6) bounds how far back the walk goes. If a player
isn't found before hitting that limit, the result is reported as
**inconclusive**, not "undrafted" — those are different things, and the tool
won't guess. Raise `--max-seasons` if you see that.

### The ADP caveat

4.7.3 requires "Sleeper's ADP, 1 week prior to the draft" for undrafted
players. Sleeper's public API (https://docs.sleeper.com/) does not document
an endpoint for a *historical* ADP snapshot — it's not the kind of thing you
can ask for after the fact. So this tool does not auto-fetch ADP; it requires
you to supply it yourself in `config.json` under `adpOverrides`, either as a
round directly or as an overall pick + team count:

```json
"adpOverrides": {
  "4046": { "round": 9 },
  "6794": { "overallPick": 34, "teamCount": 12 }
}
```

Snapshot whatever your league agrees counts as "Sleeper's ADP" (e.g. Sleeper's
mock-draft ADP view) yourself, a week before the draft, and drop it in here.
A player with no override present is reported as unresolved rather than
silently skipped or wrongly costed.

### Timing assumption

Rule 4.7.2 is "on your roster at the conclusion of Week 17." This tool reads
the *live* `/rosters` endpoint, which reflects whatever the roster looks like
right now. Run it promptly after Week 17 ends and before any offseason
roster moves, or the snapshot it's checking against won't match what 4.7.2
means. There's no built-in way to reconstruct a past roster state — if you
need that, it'd have to be rebuilt from the transaction log, which isn't
implemented here.

## Usage

```sh
cd keepers
cp config.example.json config.json   # fill in adpOverrides / candidates as needed
node check-keepers.js <league_id> --config config.json
```

Useful options:

- `--all` — evaluate every rostered player instead of just Sleeper's
  `roster.keepers` designations (handy before anyone's designated anything).
- `--names` — fetch the full player directory so the report shows names
  instead of Sleeper player IDs. Slow, multi-MB download.
- `--deadline-week <n>` — override the trade-deadline week (defaults to the
  league's own `settings.trade_deadline`, then 11).
- `--max-seasons <n>` — how far back to search for a player's real draft
  pick (default 6).
- `--refresh` — bypass the on-disk cache in `keepers/.cache/`.
- `--json <path>` — also write the full result as JSON.

## Tests

Pure-logic tests, no network:

```sh
cd keepers
node --test
```

## Layout

- `sleeper-client.js` — raw `fetch` + on-disk JSON cache for any Sleeper API path.
- `sleeper.js` — the specific endpoints this tool needs, as an injectable client.
- `history.js` — walks league history, finds a player's real draft pick, finds same-season add transactions.
- `rules.js` — pure functions implementing 4.7.1–4.7.5, 4.7.7.
- `report.js` — console report formatting.
- `check-keepers.js` — CLI entry point.
- `test/` — `node:test` unit tests against fixtures (see `test/fixtures/fake-client.js`).
