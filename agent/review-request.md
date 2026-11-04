# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-B3P: Devourer Demon Hunter (public). Branch `autopilot/onb-b3p`, from main at 1608df1. **Outcome: not promoted.**

- **Warcraft Logs: NONE.** No request or probe. The numbers replay retained pages through production ingestion over a fake transport, offline.
- **Public contract: declared EXPECTED, actual change NONE.** The queue declares EXPECTED because a promotion would change the public list. Nothing passes, so nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed, and a public Demon Hunter/Devourer request is SPEC_NOT_SUPPORTED, as before.
- **No production code changed.** The only file under `src/` is the slice's README.
- **Queue bookkeeping:** ONB-B3 is recorded MERGED (PR #63, 1608df15…). The other 44 merged tranches the supervisor listed were compared by script and already match. ONB-B3P is set to PR_OPEN.

## The thing to check first: is "not promoted" the right result, and the right stop?

The entry is titled public and has no scope text beyond it. Onboarding rule 4 says a specialization that cannot pass the gates stays INTERNAL_ONLY. I applied it and did not stop for the owner, as ONB-A2P, ONB-B1P and ONB-B2P did, because the decision that could change the result (ONB-S3) is already queued as the owner's. Please check that.

Measured at this base commit, offline:

| Subject | Hero tree | Retained span | Result | Eligible | MATCH | REJECTED | UNKNOWN | Excluded |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| gtKb2xHn87pNcFfW fight 22 actor 32 | Void-Scarred | whole fight | ANALYZED | 98 | 0 | 0 | 98 | 602 |
| rXAfw9t1q8YpmkKD fight 13 actor 20 | Void-Scarred | first 165.0 s of 271.8 s | ANALYZED | 81 | 0 | 0 | 81 | 394 |
| rXAfw9t1q8YpmkKD fight 13 actor 79 | Void-Scarred | first 165.0 s of 271.8 s | ANALYZED | 72 | 0 | 0 | 72 | 377 |

All 251 decisions stop on one atom: `voidscarred_melee[0] run_action_list | active_enemies`. OBSERVATION needs a real MATCH, and DISCRIMINATION needs a real REJECTED or a control that flips a real MATCH, so neither can be met. The numbers equal ONB-B3's.

## Decisions a reviewer might reject

1. **Not put on ONB-EV.** A whole-fight subject with combatant info is retained, and new evidence would stop at the same atom. Same call as Arms and Frost.
2. **No new gate, no weakened gate, no new queue entry.** A later public entry follows ONB-S3 and the list in `agent/follow-ups.md` "After ONB-B3". None is queued.

## Limits of the measurement

- **Census scope.** It parsed every JSON file over 500 bytes under `.probe/` and `tests/`, skipping tool output and worktree copies (5,645 parsed), by signature abilities named in the contexts' master data, with Mortal Strike as a positive control. Signature casts come only from actors 32 (gtKb) and 20 and 79 (rXAf). Contexts in seven other reports name a Devourer (2xpt, FPp6, yzH9, 24XJ, xBFW, 6xZN, hqvr), and no parsed file holds a signature cast of theirs. A subject with no signature cast in a retained span would not appear.
- **Chaining.** gtKb's three captures are joined by the first timestamp of the next file, as in ONB-B1P. That is a replay's join, not a coverage proof. It is not committed, and nothing resolves either way.
- **Two of the three are prefixes.** The rXAf pages end at 165.0 s of 271.8 s.
- **One build family, one encounter.** All are Void-Scarred with The Hunt, on Sszorak. Annihilator and `voidscarred_ranged` have no real subject, so a later promotion must measure or refuse them.

## What changed

- `tests/unit/analysis-composition-refusals.test.ts`: holds `DemonHunter`/`Devourer`: SPEC_NOT_SUPPORTED, one retrieval for preparation alone, no dispatch. `DemonHunter` is the token both Demon Hunter registrations name, so the row reaches the real lookup rather than failing on a misspelling.
- `tests/contracts/m11-promotion-evidence-gate.test.ts`: a comment only. The ONB-B3 gate search is unchanged and now names the outcome.
- Docs: `agent/architecture.md` "ONB-B3P", `agent/follow-ups.md` "After ONB-B3", `agent/testing.md`, `agent/spec-onboarding-inventory.md`, `agent/autopilot-queue.md`, `src/specs/demonhunter/devourer/README.md`.

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus`: PASSED (215 cases, 810 assertions). `npm run test:evidence`: PASSED (32 cases, 80 assertions). Run in sequence, with no suite beside them.
- Full suite, parallel, 60 s timeout: 14,724 tests, 14,721 passed, 3 failed: `m9b-corpus-harness` SPEC_PROTECTION_PALADIN (a timeout-shaped error), `runner-and-parser` U (174 vs 175 job directories) and `runner-service-queue` W (a leftover job directory). All three are on ONB-B2P's list of parallel-load failures, and this change touches none of that code. I infer interference; I did not prove it.
- Those three files rerun serially: Tests 76 passed (76). The whole suite has not run clean in one pass.
- Focused, before the full run: `analysis-composition-refusals`, `m11-promotion-evidence-gate`, `m10d-public-registration`, `onb-b3-devourer-demon-hunter`: Tests 111 passed (111).
- Queue compared by script with the supervisor's list: 45 compared, 0 mismatched.
- Offline census and replay (`.probe/onbb3p/`, not committed): the table above. No network to Warcraft Logs.

## What is not here

No promotion, no gate change, no public change, no new evidence, no production code, no new queue entry.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
