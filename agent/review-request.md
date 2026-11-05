# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-X4P: Demonology Warlock (public). Branch `autopilot/onb-x4p`, from main at f21be56. **Outcome: not promoted. It stays INTERNAL_ONLY, because it cannot pass the rotational gates: all 1,391 decisions of its seven retained subjects stay UNKNOWN.**

- **Warcraft Logs: NONE.** No request or probe. The replays and the census read retained files offline.
- **Public contract: declared EXPECTED, actual change NONE**, because nothing passes. Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public Warlock/Demonology request is SPEC_NOT_SUPPORTED, as before, with preparation and partial coverage.
- **Production code: no change.** The only file under `src/` is the specialization's README.
- **Tests:** one new assertion row, Warlock/Demonology in `analysis-composition-refusals`, which had none. The gate-search pin only has its comment changed. No assertion is weakened.
- **Queue bookkeeping:** ONB-X4 is recorded MERGED (PR #83, f21be56b…), and ONB-X4P is set to PR_OPEN. The supervisor's whole merged list was compared by script (see Validation).

## The things to check first

**1. Is "not promoted" right, and is it not an owner stop?** Onboarding rule 4 says a public entry that cannot pass stays INTERNAL_ONLY. OBSERVATION needs a real MATCH and DISCRIMINATION a real REJECTED or a control flipping a real MATCH, and there is no real resolved decision. The precedents are ONB-X1P and ONB-X2P. The gates are not touched.

**2. Is it right to leave it off ONB-EV?** Seven real subjects exist, and they stop on inputs rather than on evidence: 1,245 have no established anchor, and the other 146 refuse at `diabolist[1] hand_of_guldan`. Devastation, also with one hero tree retained, stayed off ONB-EV the same way (ONB-X2P). The missing Soul Harvester subject is recorded as "measure or refuse" for a later promotion.

**3. Is the census sound?** ONB-X2's and ONB-X1's clones of it ran the pinned route empty, so this one throws if the named or pinned route is empty. Its output shows 18 named ids and 12 pinned ids.

## The evidence

**Replay** (`.probe/onbx4p/m/`): seven subjects, 1,391 eligible, 0 MATCH, 0 REJECTED, 1,391 UNKNOWN, 99 excluded. `out.json` is byte-identical to ONB-X4's (sha256 f4bcc42d…).

**One correction to ONB-X4's picture.** ONB-X4 says seven subjects, and does not name Gw2kXrTfLWcDdhFY fight 1 actor 19 of the filtered M13-A capture, which has 103 casts and 90 begins. Replayed through the facade it returns `PROFILE_NOT_RESOLVED`, because that capture holds no `combatantinfo` event, so it adds no decision. The inventory row now names it.

**Census** (`.probe/onbx4p/census.cjs`, `census.txt`, `census-read.txt`, `actors.cjs`): 5,715 JSON files, 5,714 parsed (the unparsed one is `.probe/m11d2c/bad.json`). Controls: Mortal Strike, 985 events, 559 casts; 31 specIDs in combatant info.

- Combatant info with specID 266: 13 events, naming the seven subjects and gBMC fight 33 actors 30 and 201 (`m11g2` `diagnose`, `diagnose2`).
- Casts of named or pinned ids: the seven subjects, M13-A actor 19, and M13-A actor 20, an Affliction Warlock casting only Shadow Bolt.
- Non-cast hits outside the subjects: gBMC actor 30 and qJ1p fight 6 source 15 (`wcl-pull-window-with-resources`), each one resource change and one summon. qJ1p's context names Demonology without an actor, so that source is unresolved and is recorded as such.
- Power Siphon and Summon Doomguard have no event of any type. No source is Soul Harvester.

Limits: it does not read JSON files of 500 bytes or less, or log and text output. Ability routes match those ids only; the combatant-info route does not depend on them. An actor with no context, no combatant info and none of those ids would not appear.

## Decisions a reviewer might reject

1. **A new test row in a "not promoted" entry.** The refusal list held no Demonology row, and every earlier not-promoted specialization has one, so this adds it, as ONB-X3P did. It runs through the same loop and asserts SPEC_NOT_SUPPORTED, one retrieval and no dispatch.
2. **No code for the first stops.** `buff.dominion_of_argus.up`, Summon Doomguard's lone node and the rest stay recorded in "After ONB-X4" as inputs to a later entry.
3. **No new public entry queued**, matching ONB-X1P and ONB-X2P. The architecture section says what one must do.

## What changed

- Docs: `agent/architecture.md` "ONB-X4P", `agent/follow-ups.md` "After ONB-X4", `agent/spec-onboarding-inventory.md`, `agent/testing.md`, `agent/autopilot-queue.md`, `agent/review-request.md`, `src/specs/warlock/demonology/README.md`.
- Tests: `tests/unit/analysis-composition-refusals.test.ts` (one row), `tests/contracts/m11-promotion-evidence-gate.test.ts` (comment).

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean.
- `npm run test:corpus`: PASSED. `npm run test:evidence`: PASSED. Both ran in sequence, with no suite beside them.
- Full suite, parallel, 60 s timeout: 18,705 tests, 18,703 passed, 2 failed: `m9b-corpus-harness` SPEC_PROTECTION_PALADIN and `runner-service-queue` W. Both are on the recorded list of parallel-load failures, and this change touches none of their code. Both pass rerun without the full suite beside them, so I infer load. The whole suite has not run clean in one pass.
- `m9b-corpus-harness`, `runner-service-queue`, `analysis-composition-refusals`, `m11-promotion-evidence-gate`, the `onb-x4` suite, `m10d-public-registration` and `m10a-spec-partition` rerun together: 278 passed (278), 7 files.
- Queue compared by script with the supervisor's whole merged list: 64 compared, 1 written (ONB-X4), 0 missing, and a second run wrote nothing.
- No network to Warcraft Logs.

## What is not here

No promotion, no public change, no new evidence, no production change, no Warcraft Logs request.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
