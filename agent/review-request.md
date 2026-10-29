# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M11-G4-6: the reproducible engine recipe (`simc-build/3`) and functional
reproduction. Branch `m11-g4-6-reproducible-engine-recipe`, from main at
1d3b3d1 (G4-5 merged).

This follows the G4-5 finding that `simc-build/2` pins every input but two
`--no-cache` builds still produced different binaries. No model is
registered or changed. Analyzer authority, model selection and approval by
binary hash are unchanged.

## Review cycle 2: response to CHANGES_REQUIRED (cycle 1)

1. **The comparator lost structure.** Fixed.
   - The bench now uses `tests/support/simulation/engine-json.ts`
     `differingPaths`, a full structural comparison. Container kinds (object,
     array, null, primitive), array lengths, own key sets, empty containers
     and every primitive (`Object.is`) must agree.
   - The exclusions are unchanged: `timestamp`, `build_date`/`build_time`,
     `sim.statistics`.
   - New `tests/unit/simulation/engine-json-compare.test.ts` (9 tests) pins
     the demonstrated false positives as differences:
     - `{logs:[]}` vs `{}`;
     - `[1]` vs `{"0":1}`;
     - `[1]` vs `[1,{}]`;
     - `null` vs `{}`;
     - prototype-named keys (own keys only);
     - exact primitives.
   - It also checks that the view removes only the excluded fields.
   - All three benches were rerun with it. A vs B and A vs v2: 0 differing
     paths in both execution profiles. The negative control vs 0a72e6a7
     fails (29,842 paths).
2. **Claims exceeded the evidence.** Scoped in `agent/architecture.md`
   (status, bench, evidence, "What this means"), `agent/follow-ups.md`, the
   contract test header and the bench header.
   - Functional equivalence is stated only for the tested builds and the
     development Blood jobs (two execution profiles).
   - General profile independence, for other specs, inputs or future
     rebuilds, is stated as unproven.
   - Every rebuilt artifact still needs its own approval by binary hash.
3. **Stale staging note.** Corrected below: the test-file rename is staged.

## Intended change

1. **`runner/simc-build/v3/`.** This is simc-build/2 plus:
   - `SOURCE_DATE_EPOCH` = the checked-out commit's committer time, exported
     for both compiles. The pinned clang 22.1.3 was verified to honour it for
     `__DATE__`/`__TIME__`.
   - A single-threaded PGO training run (`threads=1`).
   - The image carries the epoch and the merged PGO profile's SHA-256.
   - `build.mjs` writes `simc-build-record/3` and accepts
     `--expect-binary <sha256>`. A mismatch is recorded and then fails
     `NOT_REPRODUCED`.
   - Digest and lock entries are reused unchanged from v2.
2. **`scripts/bench/m11g46-functional-reproduction.bench.ts`.**
   - Runs the same prepared single-threaded dev Blood jobs on two images.
   - Requires the same git revision and a full structural match of the raw
     engine JSON (`tests/support/simulation/engine-json.ts`, unit-tested).
     Only wall-clock statistics, `timestamp` and build-host time are
     excluded.
   - A pass is evidence for the jobs it ran.
3. **Contract test** `tests/contracts/m11g4-simc-build-recipes.test.ts`
   (renamed from the G4-5 file):
   - the v2 checks now run for v2 and v3 (`describe.each`);
   - v3-specific checks: reused inputs, the epoch from the commit exported
     before both makes, the exact training options, the record and
     `NOT_REPRODUCED`;
   - v1 and v2 recipes are frozen by hash (v2 = the G4-5 candidate record's
     `4005f4d4…`).
4. **Docs:** `agent/architecture.md` "M11-G4-6", `agent/follow-ups.md`
   (G4-5 item partly resolved), `agent/testing.md`.

## Results (evidence in `.probe/g46/`)

- **Two `--no-cache` v3 builds of ec3422d6, from identical inputs** (recipe
  `bf82d406…`, locks, installed sets, epoch):
  - A: binary `9805c832…`, PGO profile `307e2abe…`.
  - B: binary `8b2ee5b5…`, PGO profile `f5fe2bd5…`.
  - B failed `NOT_REPRODUCED`.
  - **Build time fixed:** both embed `Oct 23 2026 21:06:16`, the commit's
    time.
  - **Binary NOT bit-identical:** the PGO profile itself varies between runs
    despite one thread and fixed seeds. The cause is not identified.
- **For the tested jobs, engine output is identical across profiles.**
  Single-threaded engine JSON:
  - 2,000 iterations, ad hoc: A, A again, B and the G4-5 v2 candidate
    `b1913546…` (45,947 leaves, 0 differing);
  - committed bench at 300 iterations under both execution profiles,
    structural comparison: A vs B and A vs v2, 0 differing paths over 45,691
    primitive leaves.
  - Not shown for other specs, inputs or future rebuilds.
- **Negative control:** against the approved 0a72e6a7 engine the bench FAILS
  (identity differs; 29,842 paths differ).
- **Multi-threaded output is not a reproduction test.** The same binary
  differs from itself in the last bits of about 6,000 leaves at `threads=8`
  (merge order). This matches the existing exact-pin contract:
  multi-threaded runs reproduce within tolerance, single-threaded runs
  bit-identically.

## Decision made (please assess)

There is no general reproducibility guarantee. The binary is not
bit-identical, and functional equivalence is shown only for the tested builds
and jobs. The bench lets a future rebuild's approval cite equivalence for the
jobs it runs.

- Approval stays by binary hash; a rebuild remains a new artifact.
- `threads=1` on the training run is kept, but it is not credited with
  stabilising the profile.
- Bit-identical binaries would need the PGO profile distributed as a pinned
  input, or PGO removed (slower, off the official recipe). That is recorded
  as an optional follow-up, not done.

## Files / surfaces changed

- `runner/simc-build/v3/{Dockerfile,build.mjs,alpine.digest,toolchain-build.lock,toolchain-runtime.lock}` (new).
- `scripts/bench/m11g46-functional-reproduction.bench.ts` (new).
- `tests/support/simulation/engine-json.ts` and
  `tests/unit/simulation/engine-json-compare.test.ts` (new).
- `tests/contracts/m11g4-simc-build-recipes.test.ts` (renamed from
  `m11g45-simc-build-recipe.test.ts`, extended).
- `agent/{architecture,follow-ups,testing,review-request}.md`.

## Validation

- **Recipe contract:** 15/15 pass, covering v2 and v3 shared checks, v3
  specifics and frozen v1/v2.
- **Engine JSON comparator:** 9/9 pass.
- **Benches (real Docker, rerun with the structural comparator):** A vs B
  pass; A vs v2 candidate pass; the negative control vs 0a72e6a7 fails as
  intended.
- **Contracts suite in parallel:** 4 unrelated Protection tests hit the
  default 5 s timeout under parallel load. Alone they pass, and the full
  suite passes. No timeout was changed.
- **Public digests unchanged:** 600/600 byte-identical.
- **Checks:** typecheck clean; prettier clean; `git diff --check` clean.
- **Full suite** (`npm test -- --maxWorkers=1 --testTimeout=30000`):
  341 files, 9,898 tests, all pass (994 s).

## External / network activity

- No Warcraft Logs requests.
- Build reads: Docker Hub (Alpine by digest), Alpine mirrors (exact
  versions), GitHub (SimC clone).
- Local Docker: two v3 builds; engine runs with `--network none`.

## Known limitations

- The PGO profile's variable counters are not identified.
- Functional reproduction is shown for the Blood dev jobs (two execution
  profiles), not for every spec or input.

## Owner questions

None blocking. Optional: whether bit-identical binaries (a pinned PGO profile
or no PGO) are ever wanted beyond functional reproduction.

## Staged / committed

Only the test-file rename (`git mv`) is staged. Nothing is committed.
