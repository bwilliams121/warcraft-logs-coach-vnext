# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-T2P: Guardian Druid, Beast Mastery Hunter and Survival Hunter (public), `agent/autopilot-queue.md`. Branch `autopilot/onb-t2p`, from main at 3cbc6d1.

**Outcome: not promoted, all three.** Each stays INTERNAL_ONLY under onboarding rule 4.

- **Warcraft Logs: NONE.** Every measurement replays or reads retained captures. No request, no probe config.
- **Public contract: declared EXPECTED; actual change NONE.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public Druid/Guardian, Hunter/BeastMastery or Hunter/Survival request is SPEC_NOT_SUPPORTED, exactly as before, and still runs preparation with partial coverage. The declaration allowed a promotion; none happens because the gates do not pass.
- **No production code changed.** The tranche is two test rows, three test comments, three README notes and records.

## What changed

- `tests/unit/analysis-composition-refusals.test.ts`: new rows, Druid/Guardian and Hunter/Survival. The test held none for them; Hunter/BeastMastery's row already existed. The tokens are the ones each `registration.ts` names.
- `tests/contracts/m11-promotion-evidence-gate.test.ts`: the three ONB-T2 gate-search pins are unchanged; their comments now name the outcome.
- `agent/architecture.md`, `agent/testing.md`, `agent/follow-ups.md`, `agent/spec-onboarding-inventory.md` and the three specs' `README.md`: the outcome. The counts in the inventory's progress block do not move.
- `agent/autopilot-queue.md`: ONB-T2 recorded MERGED (PR #92), ONB-T2P PR_OPEN with its outcome.

## Why they cannot pass

OBSERVATION needs a real MATCH over several distinct tokens, and DISCRIMINATION a real REJECTED or a control that flips a real MATCH. None of the three has a resolved decision. Beast Mastery alone has subjects to replay (`.probe/onbt2p/m/`), production ingestion and facade over a fake transport, at this base:

| Subject | Hero tree | Span | Eligible | MATCH | REJECTED | UNKNOWN | Excluded |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| A7R6 fight 7 actor 20 | Pack Leader | first 165 s | 119 | 0 | 0 | 119 | 27 |
| gtKb fight 22 actor 13 | Pack Leader | whole, 285 s | 214 | 0 | 0 | 214 | 45 |
| rXAf fight 13 actor 15 | Pack Leader | first 165 s | 139 | 0 | 0 | 139 | 24 |
| b1Pm fight 48 actor 164 | Pack Leader | whole, 345 s | 235 | 0 | 0 | 235 | 31 |

Total 707 UNKNOWN, 127 excluded. A script compared each subject's output with ONB-T2's saved one, with the wall-clock `ms` field removed: all four are identical. Engine refusal and root scan stop are `default[0] retarget`, all 707, on `ACTION_OPTION:target_if`. Guardian's and Survival's stops stay the synthetic ones ONB-T2 recorded; I did not re-run them, because no production code changed and no real decision of either exists.

## Census

5,744 retained JSON files over 500 bytes, 5,743 parsed (`.probe/m11d2c/bad.json` is not JSON), with worktree copies skipped. Mortal Strike control: 985 events, 559 casts. Any event type. Three routes: combatant info (specID 253: 7 events, actors 20, 15, 164, 13, 141; specID 104: 2 events, actor 91; specID 255: none; 31 specIDs in the distribution as a control), 44 named ids from retained master data, and every id in the three GCD data files, read from each file (24, 7, 8). The script throws on an empty named or pinned route.

Each source was resolved by its report's context or its fixture's manifest (`.probe/onbt2p/actors.cjs`, `census-read.cjs`):

- Beast Mastery: the four subjects and their pets. Committed fixtures hold only stray rows of them, from A7R6 and gtKb by their manifests. gBMC 33 a141 holds combatant info and one Barbed Shot with its rows in a diagnostic sample. Not a subject.
- Guardian: gBMC 33 a91, the same sample: combatant info, one cast off the list (77764) with buff rows, three resource changes, one Red Moon damage row. Not a subject. The other Druid-id hits are Feral (A7R6 a1, b1Pm a170), Restoration (gtKb a2) and Balance (gtKb a27, rXAf a13 and a9, Gw2k a3). The Pulverize hits are Primal Earth Elementals, owners b1Pm 17 and 8.
- Survival: no combatant info, none of its ten listed names in any retained master data, and one id hit: Moonlight Chakram, by Marksmanship actors Gw2k 14 and 18.

Limits are in `agent/architecture.md` "ONB-T2P": files of 500 bytes or less, log and text output, and an actor with neither context nor combatant info holding none of these ids.

## Decisions a reviewer should check

- **Not an owner stop.** Rule 4 decides a failed promotion, as in ONB-T1P and its neighbours. No gate changed and no subject was added.
- **Who is on ONB-EV.** Guardian and Survival stay on it: neither has a subject. Beast Mastery is not: four subjects, two of them whole fights, resolve nothing, so its first gap is decision inputs. Dark Ranger still has no subject, and a capture would be ONB-EV's owner decision.
- **Beast Mastery's promotion path.** Recorded, not done: `tests/support/unsupported-subject.ts` still stands on this row, and its guard fails the day the row becomes PUBLIC, so a later promotion must first move those proofs.
- **Nothing reads as clean play.** The refusal rows pin SPEC_NOT_SUPPORTED, one retrieval for preparation and no dispatch.

## Validation

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus`: PASSED. `npm run test:evidence`: PASSED. Both ran in sequence, with no suite beside them.
- Full suite, parallel, 60 s timeout: 20,129 total, 20,127 passed, 2 failed: `m9b-corpus-harness` SPEC_PROTECTION_PALADIN and `runner-and-parser` "U. the per-job directory is removed after success and after failure" (expected 174 to be 173, a directory count). Both are the same two tests that failed in ONB-T2's full run, and on the recorded list of parallel-load failures. Both passed rerun without the suite beside them (2 files, 83 tests), so I infer load and a shared temp directory; I did not observe the race. The whole suite has not run clean in one pass.
- `analysis-composition-refusals`, `m11-promotion-evidence-gate`, `m11a2-unsupported-subject`, `m10a-spec-partition`, `m10d-public-registration` and the three `onb-t2` suites, rerun together: 289 passed (289), 8 files.
- Real replay at this base: Beast Mastery's four subjects, 707 eligible, 127 excluded, 0 MATCH, 0 REJECTED, 707 UNKNOWN.
- Queue compared by script with the supervisor's whole merged list: 72 compared, 1 written (ONB-T2), 0 missing, and a second run wrote nothing.
- No network to Warcraft Logs.

## Not done

- No promotion, no gate weakened, no capture, no pet state, and no new reader.
- No new public entry queued. A later one must first answer the stops in `agent/follow-ups.md` "After ONB-T2".

🤖 Generated with [Claude Code](https://claude.com/claude-code)
