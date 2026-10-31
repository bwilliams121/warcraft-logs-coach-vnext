# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M12-C: Healer Foundation, healing and absorbs received during damage
episodes (internal). Autopilot queue entry M12-C. Branch `autopilot/m12-c`,
from main at c6722ee.

- Warcraft Logs: none. No request was made or planned.
- Public contract: none. Nothing under `src/contracts/`, `src/api/` or
  `src/mcp/` changed.
- Corpus and evidence-archive bytes: unchanged.

## What changed

- **New:** `src/healing/received-during-episodes.ts` (revision
  `healing-received-during-episodes/1`, authority `WCL_OBSERVED_FACT`).
  `receivedDuringEpisodesOf(fight, { gapMs, trailingMs })` runs M12-B's
  `damageEpisodesOf`. For each episode it reports:
  - a window from the first hit to the last hit plus `trailingMs` (default
    2 000), cut at the fight's end with `clampedBy: "FIGHT_END"`;
  - for each roster player the episode hit, every HEALING and ABSORB event
    targeting that player in the window, grouped by reported source (actor
    then instance order, `null` last), with raw fields verbatim;
  - per-player HEALING and ABSORBS coverage from the shared absence gate
    (`gateAbsenceClaim`) over that player and window.
- **Fail-closed points:**
  - no roster means `ROSTER_NOT_IN_SCOPE`, with no list;
  - an empty list is "nothing received" only under COMPLETE;
  - the player set's completeness is the episode's own DAMAGE coverage,
    carried unchanged in `episode`;
  - pets are never folded into owners;
  - heal absorbs stay distinct from damage absorbs;
  - no totals (follow-up M1), no healer identity, no verdict.
- **Layering:** `tests/contracts/m12a-healing-layering.test.ts` names the new
  module. Every rule applies to it: engine-only imports, no clock or
  network, the forbidden vocabulary, and no production importer.
- **Docs:**
  - `agent/architecture.md` "M12-C";
  - `agent/follow-ups.md` "After M12-C" (owner attribution, healer identity
    for M12-D, pre-episode shields, M1);
  - `agent/testing.md`;
  - the queue entry set to PR_OPEN.

## Tests

`tests/unit/healing/received-during-episodes.test.ts`:

- **Synthetic:**
  - no FULL_RAID roster;
  - window edges: before the first hit is out, the same millisecond as the
    first hit is in, the trailing edge is in, one past it is out;
  - a player the episode did not hit is not listed;
  - pet source `170#3`, a null source, the player's own heal, and a heal
    absorb;
  - an empty list under COMPLETE;
  - `INSUFFICIENT_SCOPE` and `INSUFFICIENT_COVERAGE`;
  - a gap outside the window stays COMPLETE;
  - the FIGHT_END clamp;
  - trailing-span sensitivity and input validation;
  - an UNKNOWN episode carried through;
  - one heal listed under two overlapping episodes;
  - no total-like key.
- **Real evidence** (M12-B archive segments). The expected values come from
  a standalone script that reads the raw segment JSON. It counts
  `heal`/`absorbed`/`healabsorbed` events whose `targetID` is in the roster
  and whose `timestamp` falls in the window, by type and by
  `sourceID`/`sourceInstance`. It does not use the normalizer or the
  primitive. Results:
  - episode 1,282,525: window [7,510,308, 7,512,313], 20 players, 356 heals,
    44 absorbed, 1 healabsorbed, all COMPLETE; per-source counts for players
    5 and 3;
  - episode 1,285,979: window to 7,513,098, 779 / 127 / 2; per-source counts
    for players 3 (including guardian `129#4`) and 16.

## Validation

- `npx vitest run tests/unit/healing tests/contracts/m12a-healing-layering.test.ts`:
  4 files, 463 tests passed.
- `npm run typecheck`: clean.
- `npm run format:check`: clean.
- `npm run test:corpus`: PASSED (183 cases, 778 assertions, two workerd runs
  byte-identical, committed report matches).
- `npm run test:evidence`: PASSED (12 cases, 30 assertions, byte-identical).
- `npm test`: 10,546 passed and 15 failed. The machine was heavily loaded
  (other desktop apps and Docker): 14 failures were `Test timed out in
  5000ms/20000ms`, and one was the SimC runner temp-directory leftover
  assertion. None touch `src/healing/`. The same files run on a clean
  worktree of main (c6722ee) under the same load fail the same way (6 of 9
  files), so they predate this tranche. GitHub CI is the clean-machine check.
