# Review request

Rolling file: overwritten for each review cycle.

## Change

ONB-D4: Affliction Warlock and Marksmanship Hunter (internal, Cohort D). Branch `autopilot/onb-d4`, from main at 9b77166. **Outcome: both registered INTERNAL_ONLY. No decision of either resolves, and neither has a real subject, so both join ONB-EV.**

- **Warcraft Logs: NONE.** No request or probe. The census and replay read retained files offline, the replay through a fake transport.
- **Public contract: NONE.** Nothing under `src/contracts/`, `src/api/` or `src/mcp/` changed. A public request for either is SPEC_NOT_SUPPORTED, as before.
- **Shared behaviour: NONE.** New spec trees, pinned data, extractor targets, registry rows, the two ids in `spec-id.ts`, tests and docs. No engine, parser or timeline change.
- **Queue bookkeeping:** ONB-D4 is PR_OPEN. The supervisor's merged list was compared by script (55 entries, all already recorded). I also recorded ONB-D3P as MERGED (PR #74, 9b771666…): it was not on the supervisor's list, but `gh pr view 74` reports it merged and it is in main's history, while its queue entry still said PR_OPEN.

## The thing to check first: is INTERNAL_ONLY with no real evidence the right result?

The queue entry says these have no known retained events, "so record them for ONB-EV if needed". Frost Mage set the precedent in ONB-D3. So there is no owner stop, and ONB-EV is already the owner's.

**The evidence, measured.** A census of 5,704 JSON files over 500 bytes under `.probe/` and `tests/` (5,703 parsed; Mortal Strike as positive control, 559 casts) finds real casts only in the filtered M13-A capture. Replayed offline through production ingestion and each facade (`.probe/onbd4/m/`):

| Subject | Spec | Casts, begins | Result |
| --- | --- | ---: | --- |
| Gw2k fight 1 actor 20 | Affliction | 116, 91 | `PROFILE_NOT_RESOLVED` |
| Gw2k fight 1 actor 14 | Marksmanship | 83, 25 | `PROFILE_NOT_RESOLVED` |
| Gw2k fight 1 actor 18 | Marksmanship | 93, 28 | `PROFILE_NOT_RESOLVED` |

Limits of the census: it does not read JSON files of 500 bytes or less, or log and text output, and it matches ability ids named in retained master data.

**Every stop below is synthetic.** They are pinned by tests on synthetic builds, not measured on a real decision:

| Spec | Engine refusal | Root scan stops at |
| --- | --- | --- |
| Affliction, either tree | `end_of_fight[0] unstable_affliction` | `end_of_fight[2] drain_soul`, talent unresolved |
| Affliction, Drain Soul proven absent | same | `HC_cleave[1]` or `SH_cleave[1] seed_of_corruption`, too many unresolved atoms |
| Marksmanship, either tree | `default[2] retarget` | same, on its `target_if` |
| Marksmanship, fight style stated false by a test | `default[3] auto_shot` | `sentaoe[0]` or `draoe[0] explosive_shot` |

## Decisions a reviewer might reject

1. **Cast readings.** Hard casts are only Haunt, Steady Shot and Wailing Arrow. Shadow Bolt, Seed of Corruption, Unstable Affliction and Aimed Shot each have a -100% subtype 108 row and stay possibly instant on every build. Haunt has Improved Haunt on subtype 107, a flat -300 ms against a 1500 ms base, so I read it as a hard cast. Please check that reading of subtype 107 as flat milliseconds. Script: `.probe/onbd4/rows.cjs`. The scope is each family's class masks, as for every earlier follower.
2. **Constructor readings beyond the plain talent table.** Corruption is built only without Wither (sc_warlock_actions.cpp:785) and Shadow Bolt only without Drain Soul (:829). Kill Shot needs its own talent and Black Arrow proven absent (sc_hunter.cpp:4357). Wailing Arrow is built on Wailing Dead (:7925).
3. **Bindings that are not the talent row.** Drain Soul 198590, Malefic Grasp 1261153, Black Arrow 466930, Moonlight Chakram 1264949. The filtered capture logs 1261153 and 1264949. Black Arrow and Drain Soul have no real cast retained, so theirs rest on the module alone.
4. **`auto_shot` has a meta lane and no contract; `retarget` has no binding.** Arms has an `auto_attack` contract. I wrote none here because `auto_shot` sits behind `retarget`, where every scan already stops. It refuses, so it fails closed.
5. **`fight_style.dungeonroute` is declared and never bound.** One test states it false to show what is behind it, and that test says only a test may.
6. **`hero_tree.*` is bound only on a resolved tree**, as Devourer does. On an unresolved tree it has no row.
7. **Marksmanship is `PTR_BODY_DIFFERS`.** The pinned list is the live branch, and the hunter dispatch chooses by a multi-line `if ( is_ptr() )`.
8. **The analysis-composition refusal rows are left to ONB-D4P**, as ONB-D3 left them to ONB-D3P.

## What changed

- Spec trees: `src/specs/warlock/affliction/`, `src/specs/hunter/marksmanship/`, each with a README.
- Pinned data: `src/simc/data/{warlock-affliction,hunter-marksmanship}.apl.json`, and `src/data/game/` GCD, talent, cast and transition files for each.
- Extractors: new targets in `scripts/authority/extract-simc-{apl,gcd,talents}.mjs`; `HUNTER_SOURCES` added. Corpus: `scripts/corpus/build-manifest.mjs`, four cases, two executors.
- Registry and ids: `src/services/analyzer-registry.ts`, `src/findings/spec-id.ts`.
- Tests: `tests/unit/specs/onb-d4-*.test.ts`, plus mechanical pins in the roster, registry, partition and transport tests.
- Docs: `agent/architecture.md` "ONB-D4", `agent/follow-ups.md` "After ONB-D4", `agent/testing.md`, `agent/spec-onboarding-inventory.md`, `agent/m11-spec-coaching-inventory.md`, `agent/autopilot-queue.md` (ONB-EV appended), `scripts/authority/README.md`.

## Validation run

- Extraction: all three extractors verified required facts for both targets, against the hash-pinned sources.
- `npm run typecheck`: clean. `npm run test:corpus` equivalent (`scripts/corpus/gate.mjs`): PASSED. Evidence gate: PASSED.
- First full suite, parallel, 60 s timeout: 17,527 tests, 17,524 passed, 3 failed.
  - `m10a-cross-spec-isolation`: a real pin of mine, two rows out of sort order. Fixed.
  - `m9b-corpus-harness` SPEC_PROTECTION_PALADIN and `runner-service-queue` W: both on the recorded list of parallel-load failures. See the focused rerun.
- `format:check` failed on `tests/support/m11/coaching-inventory.json` in that run. Fixed with prettier.
- After the fixes: `format:check` clean, `git diff --check` clean. `m10a-cross-spec-isolation`, `m9b-corpus-harness`, `runner-service-queue`, `m11-promotion-evidence-gate`, `m11d2c-pinned-extraction-preflight` and both `onb-d4` suites rerun together: 1,478 passed (1,478). So the two load suspects pass without the full suite beside them, which is why I infer load, not proof. The whole suite has not run clean in one pass, and I did not rerun it after the two fixes, which touched one test's row order and one JSON file's formatting.

## What is not here

No promotion, no gate change, no public change, no new evidence committed, no shared code change, no Warcraft Logs request.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
