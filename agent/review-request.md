# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M11: simulation-model registry plus the 69933 Blood promotion, final closeout.

## Intended change

The whole working tree is one uncommitted tranche. The owner approved its
architecture on 2026-10-23; that part is summarised in `agent/architecture.md`,
"M11 — simulation-model registry and 69933 Blood promotion". This cycle adds
the owner's closeout corrections (subsection "Closeout (2026-10-28)"):

1. **Historical consumables provenance (metadata only).**
   - The 33622e9d consumables artifact recorded `engine/item/consumable.cpp`,
     a path that does not exist at that commit. Its hash was of
     `engine/player/consumable.cpp`.
   - Consumables extractor v3 → v4: real path label, fail-closed source
     checks.
   - Both models' bundles were regenerated: consumables `-3` → `-4`, and token
     acceptance `-1` → `-2`, re-measured on each model's Docker engine.
2. **Model chronology vs validated applicability.**
   - `selectSimulationModel` returns `{model, applicability}`: the single
     matching spec validation. Two matching windows now give
     CONTEXT_UNRESOLVED even for the same model.
   - `reconstructEnvironment` takes an explicit `modelApplicability | null`.
     When it names this model and build and its window contains the fight
     start, the age-only MODEL_BUILD_LAG becomes the informational
     MODEL_SNAPSHOT_PRECEDES_LOG.
   - Otherwise MODEL_BUILD_LAG is unchanged.
   - PINNED_MODEL_MISSING_OBSERVED_EFFECT blockers are never affected.
3. **Owner decisions recorded** in architecture.md and follow-ups.md:
   - the 33622e9d window stays narrow;
   - build and fight-context resolution is a G4 `SimulationContextResolver`
     prerequisite;
   - 12.1.5 is not registered and gets a compatibility review after the G4
     foundation;
   - no rebuild for package pinning, but a hardened recipe revision comes
     before the next model build;
   - no cross-model Consumption normalization yet.

## Files / surfaces changed in this closeout

- **Data:**
  - `scripts/authority/extract-simc-consumables.mjs` (v4);
  - `src/data/simulation-models/simc-*/{consumables,consumable-token-acceptance,model}.json`;
  - `src/data/simulation-models/{index,consumables}.ts`: manifest v2
    `dataHistory`, a load-time check that the history ends at the loaded
    revisions, provenance `sources` and `extractorVersion` validated, and
    `loadSimulationModelBundle` exported for tests;
  - `scripts/bench/m11g34-consumable-tokens.bench.ts` (token revision `-2`).
- **Selection and chronology:**
  - `src/simulation/model-registry.ts`;
  - `src/environment/model.ts`: `ValidatedModelApplicability`, the new
    diagnostic code, and provenance `modelApplicability`;
  - `src/environment/reconstruct.ts`: `coversFight` and the discharge logic.
- **Gate:** `tests/contracts/m11g35-readiness-gate-revisions.test.ts`.
  - The environment fingerprint is re-pinned to `12b31359…` at the SAME
    revision `environment-publishability-gate/1`, with a history note.
  - PUBLISHABLE's meaning is unchanged: publishability never blocks on
    diagnostics, and a test proves identical status, blockers, materiality and
    hash with and without applicability.
- **Tests:**
  - `tests/unit/simulation/model-data-bundle.test.ts` (new);
  - `tests/unit/simulation/model-0a72e6a7-canonical.test.ts`;
  - `tests/unit/simulation/model-registry.test.ts`;
  - `tests/contracts/m11-simulation-model-registry.test.ts`: real source
    paths, extractor v4, history, and a semantic hash equal to the committed
    v3 content;
  - `tests/support/environment/subject-environment.ts`: applicability comes
    from real selection over `RUNNER_MODEL_VALIDATIONS`.
- **Docs:** `agent/architecture.md`, `agent/testing.md`, `agent/follow-ups.md`.
- **Review infrastructure** (approved in the previous cycle, still
  uncommitted): `agent/openai-review-policy.md`, `agent/review-request.md`,
  `scripts/review/openai-review.ps1`.

## Validation

- **Semantic content.** Consumables content (everything except provenance and
  revision) has sha256 `816773ec…` for the HEAD v3 artifact and both v4
  artifacts. Token verdicts have sha256 `18267722…` for HEAD and both models.
- **Token bench.** It reproduces both models' token files exactly (Docker,
  read mode).
- **Canonical Blood fight:**
  - selects 0a72e6a7 with `coversFight: true`;
  - has no MODEL_BUILD_LAG;
  - has exactly one MODEL_SNAPSHOT_PRECEDES_LOG;
  - keeps the three PINNED_MODEL_MISSING_OBSERVED_EFFECT blockers (1296934,
    1303184, 1285644);
  - stays NOT_REPRESENTABLE / BLOCKED.
- **Negatives.** These keep MODEL_BUILD_LAG: a null applicability, another
  model, another build, a window ending at the start, a window after the fight,
  and an unparseable window. The historical model on this fight has no
  applicability and keeps MODEL_BUILD_LAG.
- **Fail-closed selection is unchanged:** 12.1.5, outside a window, an
  unresolved build or time, and an unvalidated spec.
- **Analyzer authority** stays 33622e9d (registry contract).
- **Checks run:** typecheck clean; prettier check clean; `git diff --check`
  clean.
- **Focused tests** (simulation, environment, character-profile, all
  contracts, remote-client integration): 116 files, 5104 tests, pass.
- **Final quiet full suite** `npm.cmd test -- --maxWorkers=1 --testTimeout=30000`:
  332 files, 9767 tests, pass (945 s).
- **Public digests unchanged:** restricted `ddd1629c…681d`, full
  `d8d4376f…054a1`, 600/600 analyses, none changed.
- **Corpus** not rerun: no analyzer or corpus module imports anything changed,
  and the digests prove the analyzer output is identical.
- **Evidence gate** not run: no evidence surface changed.
- **Engine benches** were not rerun for chronology (diagnostics are not in any
  golden, and the environment hash is proven unchanged). The token-acceptance
  bench was rerun.

## External / network activity

- Docker engine runs (local, `--network none`) for token acceptance.
- `git show` against the local blobless SimC clone may have fetched blobs from
  GitHub.
- No Warcraft Logs requests.

## Known limitations

- The 0a72e6a7 consumables also moved to revision `-4`, although its label was
  already correct, so that both artifacts are reproducible by the current
  extractor. This goes beyond "correct the 33622e9d artifact"; flag it if
  unwanted.
- Applicability is supplied by the caller. Nothing in production resolves a
  log's context yet (that is G4 `SimulationContextResolver`).

## Owner questions

None.

## Staged / committed

Nothing is staged or committed.
