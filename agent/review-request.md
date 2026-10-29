# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M11-G4-5: the 12.1.5 compatibility review. Branch
`m11-g4-5-1215-compatibility-review`, from main at 5604b14 (G4-4 merged).

This is a REVIEW tranche, not a promotion. The owner said: "Do not register
12.1.5 yet". The deliverable ends with a register-or-not recommendation and
the owner decisions promotion would need. Nothing is registered; analyzer
authority and every existing model and window are unchanged.

## Intended change

1. **Hardened engine recipe `simc-build/2`** (`runner/simc-build/v2/`).
   This is the owner's closeout requirement for the next build.
   - Committed Alpine digest; no tag is resolved.
   - Both stages install an exact full-closure lockfile and fail unless the
     installed set equals it.
   - Deterministic PGO training run.
   - `SIMC_COMMIT` has no default.
   - The build script verifies commit, binary and both locks offline, then
     writes `simc-build-record/2`.
   - simc-build/1 is unchanged.
2. **Refreshed deploy-calendar evidence.**
   - The US restart of 2026-10-27 (Blizzard Watch, same form and class as
     the existing three).
   - The build observations recaptured: only retrieval times changed; no new
     build.
   - Result: Live 12.1.5.70575 has a proven US interval
     `[2026-10-28T03:00Z, 2026-10-29T01:28:51Z)`.
   - With no 70575 model registered, such a fight now fails closed at
     selection (`SIMULATION_MODEL_NOT_AVAILABLE`), not at resolution, and is
     never sent to 0a72e6a7.
3. **Bench defect fixed.** `m11g3-simc-exact-pin.bench.ts` stamped every
   artifact with the global `BUILD_RECIPE_REVISION` ("simc-build/1").
   - Found because it mislabelled the first simc-build/2 artifact.
   - It now uses the model's own `artifact.buildRecipeRevision` and checks it
     against the build record.
   - The production path already took the revision per model from the
     registry.
4. **Documentation of the review and its findings** (`agent/architecture.md`
   "M11-G4-5", `agent/follow-ups.md`, `agent/testing.md`).

## Review findings (evidence in `.probe/g4/`, scratch worktree not committed)

- **Candidate:** SimC `ec3422d640`, the first Live 70575 snapshot.
  - The four Live 70575 snapshots are Blood-equivalent: between them only
    other classes' spells and the version file change.
  - Built with simc-build/2: image `8de515f4…`, binary `b1913546…`.
  - **Exact pin verified.** Deterministic. STANDARD RSE 7.79e-4,
    ESCALATED 3.96e-4.
  - **Data regenerated:**
    - consumables and raid environment semantic hashes equal to 0a72's;
    - token acceptance 22/67, identical;
    - fidelity MATCH, as at 0a72;
    - execution profiles pass;
    - environment materiality classes all unchanged;
    - synthetic publication PUBLISHED.
- **Blood, 69933 → 70575:**
  - APL identical;
  - DK module diff Unholy-only;
  - two DK data changes, with effects unchanged: Gift of the San'layn labels,
    and Transfusion's duration (infinite → 10 s).
- **Decisive finding: the standardized tank load changes meaning.**
  - 12.1.5 data moved the Mythic-raid expected-stat modifiers from difficulty
    16 to 233; the rows are identical, including armor-constant ×1.649.
  - SimC still reads 16 for the Mythic tank dummy (`sc_enemy.cpp`), and no
    upstream fix exists.
  - Under the candidate, the dummy's physical hits are 35% weaker, incoming
    DPS is −24%, Blood healing is −10…−45%, and Blood DPS is −0.44%.
  - So STANDARD_TANK_LOAD_V1 would mean a different load on a 12.1.5 model.
- **Applicability: no overlap.**
  - The candidate's snapshot-bounded Blood window can reach at most
    2026-10-28T00:32:44Z, the last Live snapshot.
  - The resolver cannot prove 70575 before 2026-10-28T03:00Z.
  - Registering now would cover no fight, and each extension waits for an
    upstream snapshot.
  - EU: no restart evidence.
- **Reproducibility: NOT bit-reproducible.**
  - A second `--no-cache` build used identical recipe, locks, installed
    package sets and commit. It gave binary `1fa9954e…` against `b1913546…`
    (57 KB apart).
  - Causes: the embedded `__DATE__`/`__TIME__`, and a multi-threaded PGO
    training run (engine default `threads=0`). `deterministic=1` fixes
    seeds, not scheduling.
  - Documented, with a simc-build/3 follow-up. It blocks nothing: artifacts
    are approved by binary hash, and a rebuild is a new artifact, as at
    simc-build/1.
  - The Dockerfile was left byte-identical to the recipe that built the
    candidate, so the candidate's record (`recipeSha256 4005f4d4…`) still
    matches the committed recipe.

## Recommendation

Do NOT register a 12.1.5 model now. The review shows it would cover no fight
under the current window basis. It would also change the meaning of
STANDARD_TANK_LOAD_V1 for Blood.

## Owner decisions needed before promotion

1. **Tank load.** Choose one:
   - wait for an upstream fix and pin a later snapshot;
   - accept a new, separately named, engine-specific tank model.
   A local engine patch is not recommended.
2. **Window basis.** Choose one:
   - wait for a later Live 70575 snapshot, verified Blood-equivalent, to
     bound the window past the deployment start;
   - approve a new window basis, for example "no newer Live snapshot as of a
     recorded check".
3. **EU coverage**, if wanted: EU restart evidence is a separate capture.

## Files / surfaces changed

- `runner/simc-build/v2/{Dockerfile,build.mjs,alpine.digest,toolchain-build.lock,toolchain-runtime.lock}` (new).
- `tests/contracts/m11g45-simc-build-recipe.test.ts` (new).
- `src/data/simulation-context/{regional-restarts,build-observations}.json`.
- `tests/unit/simulation-context/resolver.test.ts`:
  - the pinned interval list gains 70575;
  - a new test: a 70575 fight → `SIMULATION_MODEL_NOT_AVAILABLE`, never
    0a72e6a7.
- `scripts/bench/m11g3-simc-exact-pin.bench.ts`; the
  `src/simulation/approved-artifacts.ts` comment.
- `agent/{architecture,follow-ups,testing,review-request}.md`.

## Validation

- **Focused:** recipe contract 6/6; simulation-context, publication and
  profile-echo transport, 6 files, all pass.
- **Candidate benches** (real Docker, candidate image, `--network none`):
  exact pin, profile fidelity, execution profiles and publication pass.
- **Environment bench, corrected account (review cycle 1).**
  - The first run used a placeholder: the scratch registry mapped the
    candidate to 0a72's committed facts. It FAILED at the fact-mismatch
    assertion (`m11g34-environment.bench.ts:385`, 15 fields differ from
    0a72's values). The stat-revisit, token and round-trip assertions after
    it did not run.
  - The candidate's own measured values were then written as scratch facts
    (`MEASURED_EC3422D6`, uncommitted), and the bench was rerun on the
    candidate image (`.probe/g4/bench-cand-m11g34-environment-2.log`).
  - Rerun: passes, with **0 fact mismatches**, so the measurements reproduce
    exactly. The stat-revisit, rank-token and round-trip assertions now ran
    and pass.
  - Every field keeps its ENVIRONMENT_MATERIALITY_V1 class relative to 0a72.
  - No committed facts or existing model assertions were changed.
- **Public digests unchanged:** 600/600 bundles byte-identical to the
  previous baseline.
- **Checks:** typecheck clean; prettier clean on changed code;
  `git diff --check` clean.
- **Full suite** (`npm test -- --maxWorkers=1 --testTimeout=30000`):
  340 files, 9,878 tests, all pass (810 s).

## External / network activity

- **No Warcraft Logs requests.**
- **Reads:**
  - wago.tools builds API and Blizzard CDN configs (observation recapture,
    existing script);
  - the Blizzard Watch article for 2026-10-27;
  - GitHub (SimC source, `git fetch`);
  - Alpine mirrors and Docker Hub (base by digest, exact packages).
- **Local Docker:** two candidate builds (one `--no-cache`) and the benches
  with `--network none`.

## Known limitations

- The −0.44% DPS change is not split between the tank load and the 70575
  data.
- EU stays unresolved.
- Recaptured observations bound 70575 at their retrieval time. Later fights
  need another recapture.

## Staged / committed

Nothing is staged or committed.
