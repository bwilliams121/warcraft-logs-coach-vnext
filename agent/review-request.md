# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M11-G4-3: the profile echo travels through the runner. Branch
`m11-g4-3-remote-profile-echo`, from main at a09be25 (G4-2 merged).

## Intended change

This resolves the first G4-2 follow-up. Production could not evaluate the
publication CHARACTER gate, because the runner returned no profile echo.
Now:

- a LOGGED_FIDELITY_PROBE result carries the engine's profile echo;
- verification requires the echo exactly on probes;
- publication gets `backendProfileEchoSource(backend)`.

Deployment policy is unchanged: the production job-class default stays
PRODUCTION only.

## Files / surfaces changed

- **Simulation core:**
  - `src/simulation/profile-echo.ts`: new strict `profileEchoSchema` for the
    transported echo.
  - `src/simulation/result.ts`: optional `profileEcho` on `SimulationResult`,
    documented as probe-only.
  - `src/simulation/result-parser.ts`: `RESULT_PARSER_REVISION`
    `SIMC_JSON_2_PARSER_V2` → `V3`. A probe result gets
    `extractProfileEcho(text)`; a failed extraction is that typed failure.
  - `src/simulation/result-verification.ts`: the schema accepts the echo
    (strict), and presence must equal "job is a probe" (else
    MODEL_PROVENANCE_MISMATCH).
- **Publication.** `src/publication/pipeline.ts`: `backendProfileEchoSource`
  runs the probe on a backend and returns the verified echo. A probe served
  as another class, or a result without an echo, is a typed failure. The
  docs and reason text were updated.
- **Fake engine.** `tests/support/simulation/fake-simc.mjs` emits item
  `ilevel` and `collected_data.buffed_stats`, so a fake probe yields an echo.
- **Tests:**
  - new `tests/unit/simulation/profile-echo-transport.test.ts` (6);
  - parser-revision pins updated:
    - `model-registry.test.ts`: V3, with a note that G4-3 moved it
      deliberately;
    - `runner-service-cache.test.ts`: the "another parser" hypothetical is
      now V2.
- **New bench:** `scripts/bench/m11g43-remote-profile-echo.bench.ts`.
- **Docs:** `agent/architecture.md` (new section "M11-G4-3", plus a G4-2
  pointer), `agent/testing.md`, `agent/follow-ups.md` (the G4-2 echo
  follow-up is RESOLVED; the deployment choice remains).

## Decisions made

- **Where the echo is attached.** In the parser, which already holds the
  raw engine JSON, rather than in the service or transport layer.
- **Parser revision bump.** It changes every parsed-result key, so no
  cached V2 probe result without an echo is ever served.
- **`RUNNER_PROTOCOL` not bumped.** Verification already fails closed on a
  `provenance.parserRevision` mismatch, so a V2 runner with a V3 Worker (or
  the reverse) cannot exchange results.
- **Production job-class default unchanged.** Enabling FIDELITY_PROBE in a
  publication deployment is left to the owner-controlled deployment.

## Validation

- **New transport tests (6, pass):**
  - parser V3 attaches exactly the direct `extractProfileEcho` reading of the
    committed 0a72e6a7 probe golden, and no echo on the dev standard golden;
  - verification accepts a probe with its echo, and refuses a probe without
    one, a malformed echo, and an echo on a non-probe;
  - LOCAL and REMOTE (in-process HTTP) deliver equal echoes;
  - a PRODUCTION-only runner refuses the probe (JOB_REJECTED);
  - stage A through a probe-enabled fake runner reaches CHARACTER /
    PROFILE_NOT_SIMULATION_READY on the transported, synthetic fake echo.
- **Real engine** (Docker 0a72e6a7, PRODUCTION + FIDELITY_PROBE): canonical
  stage A gives CHARACTER SIMULATION_READY on the transported real-engine
  echo, and the first failing gate is ENVIRONMENT
  (TARGET_SCHEDULE_UNRESOLVED, SETUP_AURA_UNCLASSIFIED,
  PINNED_MODEL_MISSING_OBSERVED_EFFECT, …), in 1.3 s.
- **Focused suites:** publication, simulation-context, simulation,
  environment, character-profile, all contracts and the remote-client
  integration: 122 files, 5,182 tests, pass.
- **Public digests unchanged:** 600/600.
- **Checks:** typecheck clean; prettier clean; `git diff --check` clean.
- **Earlier timing failure.** One focused run while developing showed
  `runner-service-queue` "graceful shutdown…" failing once. It passed alone
  (12/12) and in the focused run above; it is a timing-sensitive test.
- **Full suite** (`npm test -- --maxWorkers=1 --testTimeout=30000`): 338
  files, 9,845 tests, all pass (877 s), including `runner-service-queue`.

## External / network activity

Local Docker engine runs (bench). No Warcraft Logs requests.

## Known limitations

- A publication deployment must enable FIDELITY_PROBE (owner, at deploy
  time).
- No real subject passes ENVIRONMENT, so publication still produces nothing
  on real logs (G4-2 follow-up).

## Owner questions

None.

## Staged / committed

Nothing is staged or committed.
