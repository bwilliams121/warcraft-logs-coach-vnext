# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-X5P: Unholy Death Knight (public). Branch `autopilot/onb-x5p`, from main at e80f30a. **Outcome: not promoted. It stays INTERNAL_ONLY, because it cannot pass the rotational gates: all 147 decisions of its one retained subject stay UNKNOWN.**

- **Warcraft Logs: NONE.** No request or probe. The replay and the census read retained files offline.
- **Public contract: declared EXPECTED, actual change NONE**, because nothing passes. Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public DeathKnight/Unholy request is SPEC_NOT_SUPPORTED, as before, with preparation and partial coverage.
- **Production code: no change.** The only file under `src/` is the specialization's README.
- **Tests:** one new assertion row, DeathKnight/Unholy in `analysis-composition-refusals`, which had none. The gate-search pin only has its comment changed. No assertion is weakened.
- **Queue bookkeeping:** ONB-X5 is recorded MERGED (PR #85, e80f30a3…), and ONB-X5P is set to PR_OPEN. The supervisor's whole merged list was compared by script (see Validation).

## The things to check first

**1. Is "not promoted" right, and is it not an owner stop?** Onboarding rule 4 says a public entry that cannot pass stays INTERNAL_ONLY. OBSERVATION needs a real MATCH and DISCRIMINATION a real REJECTED or a control flipping a real MATCH, and there is no real resolved decision. The precedents are ONB-X1P, ONB-X2P and ONB-X4P. The gates are not touched.

**2. Is it right to leave it off ONB-EV?** One real subject exists, and it stops on inputs before evidence: the engine refuses every decision at `default[0] auto_attack`, with Outbreak, Army of the Dead and Dark Transformation open behind it. Fire Mage, also with one retained subject, stayed off ONB-EV the same way (ONB-X1P). A second subject, a whole fight and San'layn would each need a capture, and those are recorded for a later promotion as ONB-EV's owner decision.

**3. Is the census sound?** Its named and pinned routes are not empty (17 and 15 ids), and it throws if either is. Its pinned route includes two ids a Blood Death Knight also casts, Death and Decay 43265 and Vampiric Strike 433895, so most of its hits are not Unholy's. I resolved every source holding a hit to its report's context rather than reading the id as the specialization. See `.probe/onbx5p/actors.txt` and `actors2.cjs`.

## The evidence

**Replay** (`.probe/onbx5p/m/`): one subject, rXAf fight 13 actor 18, first 165 s, Rider of the Apocalypse. 147 eligible, 0 MATCH, 0 REJECTED, 147 UNKNOWN, 85 excluded. `out.json` is byte-identical to ONB-X5's (sha256 bffc3f80…). Engine: all 147 `ROTATIONAL_GCD_UNKNOWN` at `default[0] auto_attack`. Root scan: all 147 at `aoe[0] death_and_decay`, on `%`. Pets: all 147 UNKNOWN, `army_ghoul` `ENTITY_MAPPING_AMBIGUOUS`, `gargoyle` `INSTANCE_START_NOT_PINNED`, `lord_of_the_dead` `OWNERSHIP_NOT_STATED`.

**Census** (`.probe/onbx5p/census.cjs`, `census.txt`, `census-read.txt`, `actors.txt`): 5,718 JSON files, 5,717 parsed (the unparsed one is `.probe/m11d2c/bad.json`). Controls: Mortal Strike, 985 events, 559 casts; 31 specIDs in combatant info.

- Combatant info with specID 252: 6 events, naming actor 18 and gBMC fight 33 actors 195 and 199 (`m11g2` `diagnose`, `diagnose2`).
- gBMC actors 195 and 199: one Outbreak cast and one resource change each, in a 62-event diagnostic sample, so neither is a subject.
- rXAf actor 174: actor 18's own pet (gameID 221634), 17 Scourge Strikes under the pet's id 445508.
- Death and Decay and Vampiric Strike elsewhere: A7R6 f7 a14, gtKb f22 a14, b1Pm f48 a15, rXAf f13 a77, Gw2k f1 a12, gBMC f33 a7, xBFW f64 a332 and 6xZN f31 a6, each Blood by context. Vampiric Strike damage from actors 40, 58, 86, 44, 364, 15 and 166, each a gameID 27893 pet of one of those.
- The retained contexts hold 40 rows naming Unholy, over 11 report codes, three of them sanitized stand-ins. Apart from these sources they hold no event of these ids. No source is San'layn.

Limits: it does not read JSON files of 500 bytes or less, or log and text output. Ability routes match those ids only; the combatant-info route does not depend on them. An actor with no context, no combatant info and none of those ids would not appear.

## Decisions a reviewer might reject

1. **A new test row in a "not promoted" entry.** The refusal list held no Unholy row, and ONB-X3P and ONB-X4P each added their own, so this adds it. It runs through the same loop and asserts SPEC_NOT_SUPPORTED, one retrieval and no dispatch.
2. **No code for the first stops.** The swing's entry, the three cooldown lines and the rest stay recorded in "After ONB-X5" as inputs to a later entry.
3. **No new public entry queued**, matching ONB-X1P, ONB-X2P and ONB-X4P. The architecture section says what one must do.
4. **The diagnostics were not replayed.** gBMC actors 195 and 199 have one cast each of a press the list names, and no page chain, so they are not subjects. They could not supply several action tokens even if one resolved.

## What changed

- Docs: `agent/architecture.md` "ONB-X5P", `agent/follow-ups.md` "After ONB-X5", `agent/spec-onboarding-inventory.md`, `agent/testing.md`, `agent/autopilot-queue.md`, `agent/review-request.md`, `src/specs/deathknight/unholy/README.md`.
- Tests: `tests/unit/analysis-composition-refusals.test.ts` (one row), `tests/contracts/m11-promotion-evidence-gate.test.ts` (comment).

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus`: PASSED. `npm run test:evidence`: PASSED. Both ran in sequence, with no suite beside them.
- Full suite, parallel, 60 s timeout: 18,979 tests, 18,977 passed, 2 failed: `m9b-corpus-harness` SPEC_PROTECTION_PALADIN and `runner-and-parser` "U. the per-job directory is removed" (expected 175 to be 174). The first is on the recorded list of parallel-load failures. The second is not on that list: it counts job directories in the shared OS temp directory before and after its own runs, so I infer another worker's job was alive between the counts, which I did not observe directly. This change touches neither's code. Both pass rerun without the full suite beside them. The whole suite has not run clean in one pass.
- `analysis-composition-refusals`, `m11-promotion-evidence-gate` and the `onb-x5` suite, with `m10a-spec-partition` and `m10d-public-registration`, rerun together: 162 passed (162), 5 files. `m9b-corpus-harness`, `runner-service-queue`, `m10a-spec-partition` and `m10d-public-registration`: 100 passed (100), 4 files. `runner-and-parser`, alone: 23 passed (23).
- Queue compared by script with the supervisor's whole merged list: 66 compared, 1 written (ONB-X5), 0 missing, and a second run wrote nothing.
- No network to Warcraft Logs.

## What is not here

No promotion, no public change, no new evidence, no production change, no Warcraft Logs request.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
