# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-X1P: Fire Mage (public). Branch `autopilot/onb-x1p`, from main at fc86588. **Outcome: not promoted. It stays INTERNAL_ONLY, because it cannot pass the rotational promotion gates.**

- **Warcraft Logs: NONE.** No request or probe. The census and replay read retained files offline, the replay through a fake transport.
- **Public contract: declared EXPECTED; actual change NONE, because nothing passes.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public Mage/Fire request is SPEC_NOT_SUPPORTED, as before, with preparation still run and partial coverage disclosed.
- **Production code: NONE.** The only non-doc changes are in a refusal test (one row restored, one duplicate dropped, one comment corrected) and one test comment.
- **Queue bookkeeping:** ONB-X1 is recorded MERGED (PR #77, fc86588e…), and ONB-X1P is set to PR_OPEN. The supervisor's whole merged list was compared by script (see Validation).

## The thing to check first: is "not promoted" the right call, rather than an owner stop?

Onboarding rule 4: a specialization that cannot pass stays INTERNAL_ONLY, with its reason in the inventory. ONB-B1P, ONB-B3P, ONB-C1P, ONB-D1P, ONB-D2P and ONB-D3P decided the same shape, so this tranche asks the owner nothing new. What `variable.combustion_delay` should mean in a real fight is an authority question for a later promotion. It does not need answering to record that Fire does not pass today, since that value is one input of several at the first stop.

Please check that the gates are not weakened. They are not touched. OBSERVATION and DISCRIMINATION both start from a real resolved decision, and Fire has none.

## The evidence

**Replay** (`.probe/onbx1p/m/`), at this base, through production ingestion and the facade:

| Subject | Hero tree | Span | Eligible | MATCH | REJECTED | UNKNOWN | Excluded |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| A7R6 fight 7 actor 17 | Sunfury | first 165 s of 424.5 s | 113 | 0 | 0 | 113 | 58 |

The output file is byte-identical to the one saved during ONB-X1 (`fc /b`). 28 decisions have an anchor and stop at `default[7] run_action_list`. The other 85 have no anchor, and their scans stop at the same line.

**Census** (`.probe/onbx1p/census.cjs`, `census-pinned.txt`, `census-read.txt`, `actors.cjs`, `samples.cjs`, `samples2.cjs`): 5,715 JSON files over 500 bytes under `.probe/` and `tests/`, skipping tool output and worktree copies; 5,714 parsed (the other is `.probe/m11d2c/bad.json`). Positive control, Mortal Strike: 559 casts. Three routes:

1. **Combatant info.** The only `combatantinfo` event with specID 63 is actor 17's, in `m10b-pages.json`. Control: 31 specIDs appear.
2. **Named abilities**, as ONB-X1.
3. **Pinned ids, new in this tranche.** ONB-X1's census had this route's list empty. Every id in `mage-fire-gcd-semantics.json`. The one id names do not already cover, Flamestrike 1254851, has no cast. The per-file hit list is byte-identical to the one saved without the route.

Every hit source resolved against its report's actors:

- A7R6 actor 17, `m10b` and `m10c5` pages: the subject.
- A7R6 actor 17, `m9c-pages` and its corpus artifacts: the same subject, a five-page sample of 226 events over 454 ms, with one Pyroblast at timestamp 2,176,038, inside fight 7 (2,004,589 to 2,429,103). The manifest names that report and fight.
- A7R6 actors 24, 33; gtKb 51, 54; rXAf 37; b1Pm 25, 29: Primal Fire Elemental pets, read from each actor row. Their Meteor and Fire Blast hits are 117588 and 57984.

Contexts for 24XJ fight 23 actor 17, VwGz actor 10 and 6gTF actor 12 name a player and carry no retained cast of that player.

Limits: it does not read JSON files of 500 bytes or less, or log and text output. Its cast routes match named and pinned ids, so a file holding only other abilities would not appear; the combatant-info route does not depend on them.

## Decisions a reviewer might reject

1. **A test row is corrected in a "no change" tranche.** ONB-X1's sentinel migration rewrote `["Mage", "Fire"]` to a second `["Evoker", "Devastation"]` and left "actor 17" in the comment. So the public refusal of Fire was not pinned there, which is this tranche's pin. Restoring it is in scope. A search of tests and benches for a duplicated Evoker row, or Devastation beside a 17, finds only these two.
2. **Fire is not added to ONB-EV.** Evidence is not its first gap: more subjects would stop at the same dispatch. Frostfire and Flamestrike are unmeasured, and a later promotion must measure or refuse them.
3. **The proc chain is not bound to raise coverage.** No line reading it is reached, so binding it would change no decision.
4. **`fightTimeMs` readers are not audited.** The follow-up asks a public promotion to check them. No promotion happens here, so that stays with the later entry.

## What changed

- Docs: `agent/architecture.md` "ONB-X1P", `agent/follow-ups.md` "After ONB-X1", `agent/testing.md`, `agent/spec-onboarding-inventory.md` (the note and one row; counts unchanged), `agent/autopilot-queue.md`, `src/specs/mage/fire/README.md`.
- Tests: `tests/unit/analysis-composition-refusals.test.ts`, `tests/contracts/m11-promotion-evidence-gate.test.ts` (one comment only).

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus`: PASSED. `npm run test:evidence`: PASSED. Both ran in sequence, with no suite beside them.
- Full suite, parallel, 60 s timeout: 17,820 tests, 17,818 passed, 2 failed: `m9b-corpus-harness` SPEC_PROTECTION_PALADIN and `runner-service-queue` W (a job directory left behind). Both are on the recorded list of parallel-load failures, and this change touches neither one's code. Both pass rerun without the full suite beside them, so I infer load. The whole suite has not run clean in one pass.
- `m9b-corpus-harness`, `runner-service-queue`, `analysis-composition-refusals`, `m11-promotion-evidence-gate`, the `onb-x1` suite, `m10d-public-registration` and `m10a-spec-partition` rerun together: 241 passed (241), 7 files. This run also covers the restored Mage/Fire row.
- Queue compared by script with the supervisor's whole merged list: 58 compared, 1 written (ONB-X1), 0 missing, and a second run wrote nothing.
- No network to Warcraft Logs.

## What is not here

No promotion, no gate change, no public change, no new evidence, no production code, no Warcraft Logs request.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
