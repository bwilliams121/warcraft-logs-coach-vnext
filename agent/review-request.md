# Review request

Rolling file: overwritten for each review cycle.

## Tranche

M11-G4-2: internal simulation publication, the implementation of the
APPROVED settled design. Branch `m11-g4-2-publication-design`, from main at
8effb78.

## Review cycle 2: responses to CHANGES_REQUIRED (cycle 1)

1. **Failure classification.**
   - `settleTicket` refusals tagged transport BAD_RESPONSE are now
     SIMULATION_RESULT_INVALID.
   - SIMULATION_UNAVAILABLE covers only NETWORK, AUTH_REJECTED,
     TICKET_LOST, CLIENT_DEADLINE and REQUEST_REFUSED transports, plus
     RUNNER_UNAVAILABLE and SIMULATION_TIMEOUT.
   - The transport is kept in the reasons.
   - New regression: the scripted backend returns the REAL `settleTicket`
     output for a ticket whose cache key is not the job's (via
     `expectedResultIdentity`). The result is SIMULATION_RESULT_INVALID with
     MODEL_PROVENANCE_MISMATCH and "transport BAD_RESPONSE", from exactly one
     call. The classification table also gains CLIENT_DEADLINE,
     SIMULATION_TIMEOUT and MODEL_PROVENANCE_MISMATCH + BAD_RESPONSE.
2. **Execution profile revision.**
   - The record's provenance gains `executionProfileRevisions`, the
     verified result's `executionProfile.revision`.
   - It is cross-checked against each prepared job's
     `keys.executionProfileRevision`; a mismatch is SIMULATION_RESULT_INVALID
     (new test).
   - The real-runner test asserts `[ELITE_REALISTIC_V1 revision]`.
   - The real-engine bench was re-run: PUBLISHED with
     `["5692cfece9870b95028ed41ebada3bf858c624e5a8d784ce677eada203d9190c"]`,
     ELITE_REALISTIC_V1's frozen revision. The 60 s case is still
     PRECISION_INSUFFICIENT.
3. **Validation after the fixes:**
   - publication unit and contract tests: 21 pass;
   - focused suites: 121 files, 5,175 tests, pass;
   - full suite: 337 files, 9,838 tests, all pass (968 s);
   - typecheck, prettier and `git diff --check` clean.

## Intended change

Implement `agent/architecture.md` "M11-G4-2 — simulation publication
(internal)" as approved:

- a shared, spec-agnostic, internal pipeline;
- stage A readiness: CONTEXT, CHARACTER, ENVIRONMENT;
- stage B simulation: one attested PRODUCTION job per consumable variant,
  with one precision escalation;
- an observation-only `simulation-publication/1` record.

## Files / surfaces changed

- **New `src/publication/`:**
  - `record.ts`: record, gate and failure codes;
  - `attainment.ts`: envelope and attainment;
  - `pipeline.ts`: `assessPublicationReadiness`, `runPublication`,
    `publishSimulation`, `currentSetupJob`, `NO_PROFILE_ECHO_SOURCE`.
- **`src/character-profile/simulation-character.ts`:** extracted
  `loggedJobCharacter` (the one G3-2 level, race, talents and gear mapping),
  now used by `fidelityProbeJob` and the production job.
  - Behavior-preserving: the fidelity-probe profile hashes and goldens are
    unchanged.
  - This file is not in a gate fingerprint.
- **Tests:**
  - new `tests/unit/publication/pipeline.test.ts` (15) and
    `tests/contracts/m11g4-publication-layering.test.ts`;
  - amended layering contracts, so that `src/publication/` may compose
    them: `m11g3-simulation-layering`, `m11g34-environment-layering` and
    `m11g4-simulation-context-layering`. The new publication contract then
    forbids any importer of `src/publication/`.
- **New bench:** `scripts/bench/m11g42-publication.bench.ts` (real engine,
  Docker).
- **Docs:** `agent/architecture.md` (status, implementation amendment,
  results), `agent/testing.md`, `agent/follow-ups.md`.

## Design amendment found during implementation (please assess)

The approved design said the CHARACTER gate runs the fidelity probe "through
the backend". That is not possible today:

- the G3-5 runner protocol returns a `SimulationResult` with no profile echo
  (the echo is read from raw engine JSON runner-side, in
  `runner/run-fidelity.ts`);
- production runners refuse FIDELITY_PROBE jobs (PRODUCTION-only default).

The implementation therefore:

- reads the echo through a `ProfileEchoSource` port;
- passes `NO_PROFILE_ECHO_SOURCE` in production, so every log fails closed
  at CHARACTER / FIDELITY_PROBE_UNAVAILABLE;
- records the protocol extension and the FIDELITY_PROBE deployment as a
  follow-up, rather than changing the G3-5 protocol and deployment policy
  inside this tranche;
- in tests, accepts a committed engine echo only when the probe job's
  profile hash equals the golden's.

## Validation

- **Unit (15, pass):**
  - canonical stage A on real evidence: no region → CONTEXT; no echo source →
    CHARACTER / FIDELITY_PROBE_UNAVAILABLE (0a72e6a7 selected); echo failure →
    FIDELITY_PROBE_FAILED; no race statement → PROFILE_NOT_SIMULATION_READY;
    ready character → ENVIRONMENT / ENVIRONMENT_NOT_PUBLISHABLE with
    TARGET_SCHEDULE_UNRESOLVED and MATERIAL_CONSUMABLE_UNKNOWN among its
    blockers, and the backend is never called;
  - the REAL runner service (fake engine, PRODUCTION-only) accepts the
    pipeline's job and attestation, and the result publishes;
  - the attestation fields are checked;
  - all variants run; the envelope is computed; one failing variant means
    NOT_PUBLISHED;
  - exactly one escalation, then PRECISION_INSUFFICIENT;
  - verification and transport failures are never retried;
  - an unresolved race never becomes a job;
  - the attainment interval is gated on PROVEN comparability.
- **Real engine** (Docker 0a72e6a7, production job-class default, synthetic
  plan):
  - 345,177 ms PUBLISHED: 82,113 DPS, CI [81,988, 82,238], RSE 7.8e-4 at
    STANDARD_SIM_V1.
  - 60,000 ms PRECISION_INSUFFICIENT after one escalation (RSE 9.03e-4 >
    6e-4).
- **Focused suites:** publication, simulation-context, simulation,
  environment, character-profile, all contracts and the remote-client
  integration: 121 files, 5,173 tests, pass.
- **Public digests unchanged:** restricted `ddd1629c…681d`, full
  `d8d4376f…054a1`, 600/600 analyses.
- **Gates not run:** the corpus and evidence gates; no ingestion, corpus or
  evidence surface changed. CI runs both.
- **Checks:** typecheck clean; prettier check clean; `git diff --check`
  clean.
- **Full suite** (`npm test -- --maxWorkers=1 --testTimeout=30000`): 337
  files, 9,836 tests, all pass (978 s).

## External / network activity

Local Docker engine runs (bench). No Warcraft Logs requests.

## Known limitations

These are in `agent/follow-ups.md`, "After M11-G4-2":

- no production fidelity echo;
- no real subject publishes;
- attainment is always UNKNOWN today;
- precision bounds refuse short fights;
- nothing calls the pipeline, and the runner has no deployed host.

## Owner questions

None.

## Staged / committed

Nothing is staged or committed.
