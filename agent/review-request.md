# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-X1: Fire Mage (internal, own representative). Branch `autopilot/onb-x1`, from main at 72d0d54. **Outcome: registered INTERNAL_ONLY, and no decision resolves.**

- **Warcraft Logs: NONE.** No request or probe. The census and replay read retained files offline, the replay through a fake transport.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public Mage/Fire request is SPEC_NOT_SUPPORTED, as before.
- **Shared production code: NONE.** The only `src` changes outside `src/specs/mage/fire/` and the new data files are the id in `src/findings/spec-id.ts` and the row in `src/services/analyzer-registry.ts`.
- **Queue bookkeeping:** ONB-D4P is recorded MERGED (PR #76, 72d0d548…), ONB-X1 is set to PR_OPEN with its outcome, and ONB-X2's scope notes the sentinel it owes. The supervisor's merged list was compared by script (see Validation).

## The three things to check first

1. **The queue entry says Combustion windows and the Hot Streak chain "need proc-state handling of their own", and this tranche writes none.** Is that a sound narrowing? Measured: every scan stops at `default[7]`, the Combustion dispatch, on `time`, `variable.combustion_delay`, the Combustion and Meteor cooldowns, `gcd.max` and `buff.combustion.up`. No line reading Hot Streak or Heating Up is reached, on the real subject or on synthetic builds, so a binding would change no decision. CLAUDE.md "First Vertical Slice" says narrowing is the right response. The proc conditions are pinned UNRESOLVED, and `agent/follow-ups.md` "After ONB-X1" lists what they need, in order. `variable.combustion_delay` reads `expected_combat_length`, so getting past the dispatch is an authority question, not an implementation one, and it is recorded rather than decided here.
2. **The sentinel migration.** Fire Mage was the unsupported-path subject, and the guard in `tests/contracts/m11a2-unsupported-subject.test.ts` demands that the subject is no `SpecId`. It moved to A7R6 fight 7 actor 11, Devastation Evoker, proven from the same committed context, before `mage/fire` was added. Please check that every changed assertion states the new identity and that none was weakened. The corpus case ids were renamed, and the identity assertion's `playerName` is `Actor11`, from the committed master data.
3. **Fire Blast's two readings.** The talent replaces the class spell (trait_data.inc:1738), and the action is on the talent's row off the GCD, or the class row 319836, `_gcd` 1500 (sc_mage.cpp:4528). Only 108853 is bound. Applicability is APPLICABLE with the talent SELECTED and UNKNOWN otherwise, including proven-absent: the action still exists, on a lane nothing binds, so background would be false.

## The evidence

**Replay** (`.probe/onbx1/m/`), at this tree, through production ingestion and the facade:

| Subject | Hero tree | Span | Eligible | MATCH | REJECTED | UNKNOWN | Excluded |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| A7R6kxPJ1hC8YQ4w fight 7 actor 17 | Sunfury | first 165 s of 424.5 s | 113 | 0 | 0 | 113 | 58 |

76 Pyroblast, 23 Fireball, 9 Scorch, 5 Meteor. Excluded: 52 Fire Blast and 2 Combustion, off the GCD; 3 Shimmer and 1 Blazing Barrier, no lane. Anchors: 85 `BEGINCAST_PAIRING_AMBIGUOUS` (every Pyroblast and Scorch), 23 `OBSERVED_BEGINCAST` (Fireball), 5 `INSTANT_COMPLETION` (Meteor). Stops: all 113 at `default[7] run_action_list`, `UNDECIDED_RUN_GATE`; the query reports that for 28, and the other 85 have no anchor.

**The begin really does not prove the moment.** Begin-to-completion gaps on the subject: Pyroblast median 0 ms, 62 of 76 under 100 ms; Scorch 4 of 9 under 100 ms; Fireball 930 to 1,322 ms. The wire logs a begin in front of an instant press.

**Census** (`.probe/onbx1/census.cjs`): 5,714 of 5,715 JSON files over 500 bytes under `.probe/` and `tests/`, by context, combatant-info specID 63 and ability id, with Mortal Strike as the positive control (559 casts). One subject has combatant info. Contexts name 24XJ fight 23 actor 17, VwGz fights 3 and 4 actor 10 and 6gTF actor 12 with no events retained. The other Meteor and Fire Blast hits are Primal Fire Elemental pets, 117588 and 57984 (A7R6 actors 24 and 33 resolved against master data). Limits: it does not read files of 500 bytes or less, or log and text output.

## Decisions a reviewer might reject

1. **Possibly-instant rows are not narrowed.** Pyroblast, Flamestrike, Scorch and Frostfire Bolt stay `INSTANT_ROW_NOT_EXCLUDED` on every build. Hot Streak is baseline (`specialization_spells.inc` row 195283), so it cannot be excluded for the first two.
2. **The `CHANNEL` cast rule is removed**, unlike Arcane's clone source, because the pinned list presses no channel. `channelDurationAt` stays, since the shared profile interface requires it.
3. **`flamestrike` is always UNKNOWN**, on a choice of two rows, as Frost's Blizzard is.
4. **`scorch_execute.active` and `firestarter.active` are declared and never bound.** Each reads target health (sc_mage.cpp:6909-6913).
5. **Next sentinel.** ONB-X2 owes the migration to actor 20, Beast Mastery Hunter, the fight's last. Its `friendlySpecs` spelling does not lower-case to its roster key, so the guard needs that mapping then. It is recorded, not built now.

## What changed

- Spec: `src/specs/mage/fire/` (14 files), cloned from Arcane's shape with Fire's own vocabulary, applicability and cast review.
- Data: `src/simc/data/mage-fire.apl.json`, `src/data/game/mage-fire-{gcd-semantics,talents}.json` and their loaders, `mage-fire-cast-semantics.ts`, `mage-fire-transition-authority.ts`, with the extractor targets in `scripts/authority/`.
- Registration: `src/findings/spec-id.ts`, `src/services/analyzer-registry.ts`.
- Tests: `tests/unit/specs/onb-x1-fire-mage.test.ts` (81), the mechanical pins for a new row, two corpus cases and their executor, and the sentinel migration across `tests/`, `scripts/corpus/build-manifest.mjs` and `scripts/bench/`.
- Docs: `agent/architecture.md` "ONB-X1", `agent/follow-ups.md` "After ONB-X1", `agent/testing.md`, `agent/deployment-smoke.md` (the sentinel), both inventories, `scripts/authority/README.md`, `agent/autopilot-queue.md`.

## Validation run

- `npm run typecheck`: clean. `npm run format:check`: clean. `git diff --check`: clean. These were first run before two fixes (an unused test import and Prettier on six files), and were rerun clean after them.
- Corpus gate: PASSED. Evidence gate: PASSED. Both in sequence, with no suite beside them, and each wrote its report.
- Full suite, parallel, 60 s timeout: 17,820 tests, 17,818 passed, 2 failed: `m9b-corpus-harness` SPEC_PROTECTION_PALADIN and `runner-service-queue` W, both on the recorded list of parallel-load failures (ONB-D1P, ONB-D4P). The two fixes above landed while it was starting, and it was not rerun after them; CI runs the committed tree.
- Rerun alone, in one vitest process: `m9b-corpus-harness`, `runner-service-queue`, `onb-x1-fire-mage`, `raid-night-preparation`, `m7f-raid-night-orchestration`, `m15f-integrated-report-hardening`: 203 of 203 passed.
- Queue compared by script with the supervisor's whole merged list: 57 compared, 1 written (ONB-D4P), 0 missing, and a second run wrote nothing.
- After review cycle 1 (a P2: the invariance bench still had bare actor 17 and `Mage`): `scripts/bench/m10d-public-invariance.bench.ts` now reads `CURRENT_UNSUPPORTED_SUBJECT`, with its subject labelled `unsupported`, so a capture from before this tranche does not compare on that one subject. Every migrated file was then audited for a stale actor or class beside the new identity; four test comments were corrected and no other code was stale. Bench run: 20 of 20 passed. Its captures show actor 11, Evoker/Devastation, SPEC_NOT_SUPPORTED on the single fight and in both mixed raid nights. It was not compared against a baseline capture. typecheck, format and `git diff --check` were rerun clean. The full suite was not rerun for this change, since only the bench and comments moved.
- No network to Warcraft Logs.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
