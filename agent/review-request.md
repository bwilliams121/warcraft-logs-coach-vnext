# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-X3P: Vengeance Demon Hunter (public). Branch `autopilot/onb-x3p`, from main at 2a4f456. **Outcome: not promoted. It stays INTERNAL_ONLY, because it cannot pass the rotational gates: no decision resolves and no retained capture holds one of its events.**

- **Warcraft Logs: NONE.** No request or probe. The census reads retained files offline.
- **Public contract: declared EXPECTED, actual change NONE**, because nothing passes. Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public DemonHunter/Vengeance request is SPEC_NOT_SUPPORTED, as before, with preparation and partial coverage.
- **Production code: no change.** The only file under `src/` is the specialization's README.
- **Tests:** one new assertion row, DemonHunter/Vengeance in `analysis-composition-refusals`, which had none. The gate-search pin only has its comment changed. No assertion is weakened.
- **Queue bookkeeping:** ONB-X3 is recorded MERGED (PR #81, 2a4f456b…), and ONB-X3P is set to PR_OPEN. The supervisor's whole merged list was compared by script (see Validation).

## The things to check first

**1. Is "not promoted" right, and is it not an owner stop?** Onboarding rule 4 says a public entry that cannot pass stays INTERNAL_ONLY, and rule 7 records missing evidence rather than fetching it. OBSERVATION needs a real MATCH and DISCRIMINATION a real REJECTED or a control flipping a real MATCH, and there is no real decision. ONB-EV already names this specialization and is queued as the owner's. The precedents are ONB-C2P and ONB-D4P. The gates are not touched.

**2. Is the census sound?** ONB-X3's read only `cast` and `combatantinfo`, so this one reads any event type. Its pinned route reads the ids from the data file, 17, and adds Shear 203782, which ONB-X3's held and the data does not name. Its output shows them.

## The evidence

**Census** (`.probe/onbx3p/census.cjs`, `census.txt`, `census-read.txt`, `actors.cjs`, `actors.txt`): 5,715 JSON files, 5,714 parsed (the unparsed one is `.probe/m11d2c/bad.json`). Controls: Mortal Strike, 985 events, 559 casts; 31 specIDs in combatant info, including Havoc's 577 and Devourer's 1480.

- Combatant info with specID 581: none.
- The 21 ids master data gives the signature abilities: no event of any type.
- The 18 pinned ids: fifteen have no event of any type. Only Immolation Aura 258920, Vengeful Retreat 198793 and Felblade 232893 appear, in 17 files.
- Every source of those three resolves to another specialization: A7R6 actor 18, b1Pm actor 18, M13-A actors 15 and 16, G2 `diagnose` actors 52 and 192 are Havoc; gtKb actor 32 and M11-C4f actors 20 and 79 are Devourer.
- Reports naming a Vengeance player: LYwF actor 19, g34m actor 13, zpry actor 741. Only `.probe/m13a/discovery.json`, `candidates.json` and the earlier census output `.probe/onbd2p/census-files.json` name them, and none holds an event.

Limits: it does not read JSON files of 500 bytes or less, or log and text output. Ability routes match those ids only; the combatant-info route does not depend on them. An actor with no context, no combatant info and none of those ids would not appear.

## Decisions a reviewer might reject

1. **A new test row in a "not promoted" entry.** The refusal list held no Vengeance row, and every earlier not-promoted specialization has one, so this adds it, as ONB-C1P added a missing pin. It runs through the same loop and asserts SPEC_NOT_SUPPORTED, one retrieval and no dispatch.
2. **No code for the first stops.** `auto_attack`, Disrupt, Infernal Strike, Demon Spikes and the `%` programme stay recorded in "After ONB-X3" as inputs to a later entry.
3. **No new public entry queued**, matching ONB-C2P and ONB-D4P. The architecture section says what one must do.

## What changed

- Docs: `agent/architecture.md` "ONB-X3P", `agent/follow-ups.md` "After ONB-X3", `agent/spec-onboarding-inventory.md`, `agent/testing.md`, `agent/autopilot-queue.md`, `agent/review-request.md`, `src/specs/demonhunter/vengeance/README.md`.
- Tests: `tests/unit/analysis-composition-refusals.test.ts` (one row), `tests/contracts/m11-promotion-evidence-gate.test.ts` (comment).

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus`: PASSED. `npm run test:evidence`: PASSED. Both ran in sequence, with no suite beside them.
- Full suite, parallel, 60 s timeout: 18,362 tests, 18,361 passed, 1 failed: `m9b-corpus-harness` SPEC_PROTECTION_PALADIN. It is on the recorded list of parallel-load failures, and this change touches none of its code. It passes rerun without the full suite beside it, so I infer load. The whole suite has not run clean in one pass.
- `m9b-corpus-harness`, `analysis-composition-refusals`, `m11-promotion-evidence-gate`, the `onb-x3` suite, `m10d-public-registration` and `m10a-spec-partition` rerun together: 185 passed (185), 6 files.
- Queue compared by script with the supervisor's whole merged list: 62 compared, 1 written (ONB-X3), 0 missing, and a second run wrote nothing.
- No network to Warcraft Logs.

## What is not here

No promotion, no public change, no new evidence, no production change, no Warcraft Logs request.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
