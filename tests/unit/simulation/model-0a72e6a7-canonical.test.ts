/**
 * M11 model registry: the canonical Blood subject on the PROMOTED simulation
 * model (0a72e6a7 / Live 12.1.0.69933), from that model's committed goldens —
 * offline. Proves:
 *
 * - the model's development golden is its own engine (identity) and parses
 *   through the unchanged production parser;
 * - the canonical character (owner-stated dwarf) reconstructs identically from
 *   the model's data and is fidelity MATCH / SIMULATION_READY on its echo;
 * - the canonical environment stays NOT_REPRESENTABLE / BLOCKED, with exactly
 *   the historical model's blockers: the promotion fixes none of them;
 * - the canonical fight SELECTS this model, inside Blood's validated
 *   applicability window, so model chronology is discharged: no
 *   MODEL_BUILD_LAG, only the informational MODEL_SNAPSHOT_PRECEDES_LOG;
 * - the three concrete missing-effect blockers remain, naming THIS model's
 *   build; applicability never resolves a specific missing effect;
 * - an applicability that does not cover this model and fight discharges
 *   nothing (MODEL_BUILD_LAG stays).
 */

import { beforeAll, describe, expect, it } from "vitest";

import { RUNNER_SPEC_BINDINGS } from "../../../runner/spec-bindings.js";
import { assessProfileFidelity, GATED_CHECKS } from "../../../src/character-profile/fidelity.js";
import type { CharacterProfile } from "../../../src/character-profile/profile.js";
import { readCombatantPullFacts } from "../../../src/character-profile/pull-facts.js";
import { reconstructCharacterProfile } from "../../../src/character-profile/reconstruct.js";
import { fidelityProbeJob } from "../../../src/character-profile/simulation-character.js";
import { assessEnvironmentPublishability } from "../../../src/environment/publishability.js";
import { reconstructEnvironment } from "../../../src/environment/reconstruct.js";
import { approvedArtifactForPin } from "../../../src/simulation/approved-artifacts.js";
import { selectSimulationModel, simulationModelById } from "../../../src/simulation/model-registry.js";
import { simulationEnvironmentHash } from "../../../src/environment/hash.js";
import { RUNNER_MODEL_VALIDATIONS } from "../../../runner/spec-bindings.js";
import { prepareSimulation } from "../../../src/simulation/prepare.js";
import { extractProfileEcho } from "../../../src/simulation/profile-echo.js";
import { parseSimcJson } from "../../../src/simulation/result-parser.js";
import { BLOOD_CHARACTER_BINDING } from "../../../src/specs/deathknight/blood/character-binding.js";
import { BLOOD_ENVIRONMENT_FACTS_BY_MODEL } from "../../../src/specs/deathknight/blood/environment-facts.js";
import devGolden from "../../fixtures/simulation/simc-0a72e6a7-blood-dev-standard.json";
import historicalDevGolden from "../../fixtures/simulation/simc-33622e9d-blood-dev-standard.json";
import userRaceGolden from "../../fixtures/simulation/simc-0a72e6a7-blood-subject-fidelity-user-race.json";
import roundTrip from "../../fixtures/environment/simc-0a72e6a7-subject-diagnostic-roundtrip.json";
import {
  reconstructionInputOf,
  subjectEvidence,
  withOwnerStatements,
} from "../../support/character/subject.js";
import {
  subjectEnvironmentInput,
  subjectGameContext,
} from "../../support/environment/subject-environment.js";
import { devBloodJob, jsonBytes } from "../../support/simulation/dev-blood-job.js";

const NEW = "SIMC_0A72E6A7_LIVE_12_1_0_69933";
const OLD = "SIMC_33622E9D_LIVE_12_1_0_69587";
const model = simulationModelById(NEW);
if (model === undefined) throw new Error("registry");
const artifact = approvedArtifactForPin(model.pin);
if (artifact === undefined) throw new Error("artifact");
const binding = BLOOD_CHARACTER_BINDING;

let stated: CharacterProfile;
let statedHistorical: CharacterProfile;
let pull: ReturnType<typeof readCombatantPullFacts>;

beforeAll(async () => {
  const evidence = await subjectEvidence();
  stated = reconstructCharacterProfile(withOwnerStatements(reconstructionInputOf(evidence, NEW)), binding);
  statedHistorical = reconstructCharacterProfile(
    withOwnerStatements(reconstructionInputOf(evidence, OLD)),
    binding,
  );
  pull = readCombatantPullFacts(evidence.rawCombatantInfo);
}, 120_000);

describe("M11 promoted model: development golden", () => {
  it("is the 0a72e6a7 engine's own identity, and parses through the unchanged parser", async () => {
    expect(devGolden.git_revision).toBe("0a72e6a746");
    expect(devGolden.no_networking).toBe(true);
    expect(devGolden.sim.options.dbc.version_used).toBe("Live");
    expect(devGolden.sim.options.dbc.Live.wow_version).toBe("12.1.0.69933");
    expect(devGolden._golden.source).toContain(model.artifact.binarySha256);
    const job = devBloodJob("STANDARD_SIM_V1", "SIMC_DEFAULT_PINNED", NEW);
    const prepared = await prepareSimulation(job, jsonBytes(job), artifact, RUNNER_SPEC_BINDINGS);
    if (!prepared.ok) throw new Error(prepared.failure.detail);
    const text = JSON.stringify(devGolden);
    const parsed = parseSimcJson(text, text.length, {
      job: prepared.value.job,
      binding: prepared.value.binding,
      profile: prepared.value.profile,
      policy: prepared.value.policy,
      approved: artifact,
      executedBinarySha256: artifact.binarySha256,
      profileHash: prepared.value.keys.profileHash,
      environmentHash: prepared.value.keys.environmentHash,
      executionProfileRevision: prepared.value.keys.executionProfileRevision,
    });
    if (!parsed.ok) throw new Error(`${parsed.failure.code} ${parsed.failure.detail}`);
    expect(parsed.value.model).toEqual({
      requestedSimcCommit: "0a72e6a74684d23c989b2d76143e429d2b4f1c91",
      reportedGitRevision: "0a72e6a746",
      gameDataBuild: "12.1.0.69933",
      binarySha256: "79bf5a406b0ca16eb8e828ef017603b60fdee576a5cb3cf4acaacf93a08eea36",
      buildRecipeRevision: "simc-build/1",
    });
    // The historical golden cannot be read as this model.
    const historicalText = JSON.stringify(historicalDevGolden);
    const asNew = parseSimcJson(historicalText, historicalText.length, {
      job: prepared.value.job,
      binding: prepared.value.binding,
      profile: prepared.value.profile,
      policy: prepared.value.policy,
      approved: artifact,
      executedBinarySha256: artifact.binarySha256,
      profileHash: prepared.value.keys.profileHash,
      environmentHash: prepared.value.keys.environmentHash,
      executionProfileRevision: prepared.value.keys.executionProfileRevision,
    });
    expect(asNew).toMatchObject({ ok: false, failure: { code: "MODEL_PROVENANCE_MISMATCH" } });
  });
});

describe("M11 promoted model: canonical Blood character", () => {
  it("reconstructs identically from the promoted model's data (no field appears or disappears)", () => {
    // M11-G4-1: the compatibility note names EACH model's own build (it was
    // hard-coded to 12.1.0.69587); everything else is identical.
    const versionNote = (profile: CharacterProfile) =>
      profile.diagnostics.find((issue) => issue.code === "MODEL_VERSION_COMPATIBILITY_UNKNOWN")?.detail;
    expect(versionNote(stated)).toContain("compatibility with client data 12.1.0.69933 is unknown");
    expect(versionNote(statedHistorical)).toContain("compatibility with client data 12.1.0.69587 is unknown");
    const withoutVersionNote = (profile: CharacterProfile) => ({
      ...profile,
      diagnostics: profile.diagnostics.filter(
        (issue) => issue.code !== "MODEL_VERSION_COMPATIBILITY_UNKNOWN",
      ),
    });
    expect(withoutVersionNote(stated)).toEqual(withoutVersionNote(statedHistorical));
    expect(stated.blockers).toEqual([]);
  });

  it("the golden is the promoted engine running the stated subject's probe job", async () => {
    const job = fidelityProbeJob(stated, binding, model.pin);
    if (!job.ok) throw new Error(job.failure.detail);
    const prepared = await prepareSimulation(job.value, jsonBytes(job.value), artifact, [binding.simulation]);
    if (!prepared.ok) throw new Error(prepared.failure.detail);
    expect(prepared.value.keys.profileHash).toBe(userRaceGolden._golden.jobProfileHash);
    expect(userRaceGolden.git_revision).toBe("0a72e6a746");
  });

  it("fidelity on the promoted model's echo: every gated check MATCHes — SIMULATION_READY", () => {
    const extracted = extractProfileEcho(JSON.stringify(userRaceGolden));
    if (!extracted.ok) throw new Error(extracted.failure.detail);
    const result = assessProfileFidelity(stated, binding, extracted.value, pull);
    for (const name of GATED_CHECKS) expect(result.checks[name].state, name).toBe("MATCH");
    expect(result.status).toBe("MATCH");
    expect(result.readiness).toBe("SIMULATION_READY");
    expect(result.blockers).toEqual([]);
    expect(result.checks.stats.state).toBe("STAT_RECONCILIATION_NOT_PROVEN");
  });
});

describe("M11 promoted model: canonical environment", () => {
  it("stays NOT_REPRESENTABLE / BLOCKED with exactly the historical model's blockers", async () => {
    const facts = BLOOD_ENVIRONMENT_FACTS_BY_MODEL[NEW];
    const historicalFacts = BLOOD_ENVIRONMENT_FACTS_BY_MODEL[OLD];
    if (facts === undefined || historicalFacts === undefined) throw new Error("facts");
    const environment = reconstructEnvironment(await subjectEnvironmentInput(NEW));
    const historical = reconstructEnvironment(await subjectEnvironmentInput(OLD));
    expect(environment.status).toBe("NOT_REPRESENTABLE");
    const gate = assessEnvironmentPublishability(environment, facts);
    const historicalGate = assessEnvironmentPublishability(historical, historicalFacts);
    expect(gate.status).toBe("BLOCKED");
    expect(gate.blockers.map((blocker) => blocker.code)).toEqual(
      historicalGate.blockers.map((blocker) => blocker.code),
    );
    // The promotion resolves none of the named blockers.
    const codes = environment.blockers.map((blocker) => blocker.code);
    for (const code of ["TARGET_SCHEDULE_UNRESOLVED", "PINNED_MODEL_MISSING_OBSERVED_EFFECT"]) {
      expect(codes, code).toContain(code);
    }
    // Same materiality classes on both models (only magnitudes moved).
    expect(gate.materiality.map((m) => [m.field, m.classification])).toEqual(
      historicalGate.materiality.map((m) => [m.field, m.classification]),
    );
  });

  it("the canonical fight selects THIS model, and its applicability window covers the fight", async () => {
    const selected = selectSimulationModel(subjectGameContext(), RUNNER_MODEL_VALIDATIONS);
    if (!selected.ok) throw new Error(selected.failure.detail);
    expect(selected.value.model.id).toBe(NEW);
    const environment = reconstructEnvironment(await subjectEnvironmentInput(NEW));
    expect(environment.provenance.modelApplicability).toEqual({
      supplied: selected.value.applicability,
      coversFight: true,
    });
  });

  it("inside the validated window chronology is discharged; the three absent auras still block, naming THIS model", async () => {
    const environment = reconstructEnvironment(await subjectEnvironmentInput(NEW));
    const missing = environment.blockers.filter(
      (blocker) => blocker.code === "PINNED_MODEL_MISSING_OBSERVED_EFFECT",
    );
    expect(missing.map((blocker) => blocker.detail)).toEqual(
      [1296934, 1303184, 1285644].map(
        (spellId) =>
          `subject pull aura ${String(spellId)} is absent from the pinned spell data (client data 12.1.0.69933, hotfix 2026-09-22; log 2026-10-01): its effect cannot be represented`,
      ),
    );
    const codes = [...environment.blockers, ...environment.diagnostics].map((issue) => issue.code);
    expect(codes).not.toContain("MODEL_BUILD_LAG");
    const precedes = environment.diagnostics.filter((issue) => issue.code === "MODEL_SNAPSHOT_PRECEDES_LOG");
    expect(precedes.map((issue) => issue.detail)).toEqual([
      "informational: log 2026-10-01 follows the model's client-data snapshot (hotfix 2026-09-22, 12.1.0.69933); the fight is inside the validated applicability window [2026-09-22T20:05:35Z, 2026-10-01T23:06:26Z) for deathknight/blood (SNAPSHOTS_VERIFIED_EQUIVALENT_FOR_SPEC): model chronology discharged",
    ]);
    expect(environment.blockers.map((blocker) => blocker.code)).not.toContain("MODEL_SNAPSHOT_PRECEDES_LOG");
    expect(environment.provenance.model).toEqual(model.pin);
  });

  it("discharging chronology changes nothing else: same status, blockers, environment hash and publishability", async () => {
    const facts = BLOOD_ENVIRONMENT_FACTS_BY_MODEL[NEW];
    if (facts === undefined) throw new Error("facts");
    const covered = reconstructEnvironment(await subjectEnvironmentInput(NEW));
    const uncovered = reconstructEnvironment({
      ...(await subjectEnvironmentInput(NEW)),
      modelApplicability: null,
    });
    expect(covered.status).toBe(uncovered.status);
    expect(covered.blockers).toEqual(uncovered.blockers);
    expect(await simulationEnvironmentHash(covered.environment)).toBe(
      await simulationEnvironmentHash(uncovered.environment),
    );
    const coveredGate = assessEnvironmentPublishability(covered, facts);
    const uncoveredGate = assessEnvironmentPublishability(uncovered, facts);
    expect(coveredGate.status).toBe("BLOCKED");
    expect(coveredGate.blockers).toEqual(uncoveredGate.blockers);
    expect(coveredGate.materiality).toEqual(uncoveredGate.materiality);
  });

  it("an applicability that does not cover THIS model and fight discharges nothing: MODEL_BUILD_LAG stays", async () => {
    const input = await subjectEnvironmentInput(NEW);
    const supplied = input.modelApplicability;
    if (supplied === null) throw new Error("applicability");
    const lagOf = (applicability: typeof supplied | null) => {
      const environment = reconstructEnvironment({ ...input, modelApplicability: applicability });
      return {
        lag: environment.diagnostics.filter((issue) => issue.code === "MODEL_BUILD_LAG").length,
        precedes: environment.diagnostics.filter((issue) => issue.code === "MODEL_SNAPSHOT_PRECEDES_LOG")
          .length,
        covers: environment.provenance.modelApplicability.coversFight,
      };
    };
    const undischarged = { lag: 1, precedes: 0, covers: false };
    expect(lagOf(null)).toEqual(undischarged);
    expect(lagOf({ ...supplied, modelId: OLD })).toEqual(undischarged);
    expect(lagOf({ ...supplied, gameBuild: "12.1.0.69587" })).toEqual(undischarged);
    // The window is half-open: a window ending at the fight start does not cover it.
    expect(
      lagOf({ ...supplied, window: { fromUtc: supplied.window.fromUtc, toUtc: supplied.fightStartUtc } }),
    ).toEqual(undischarged);
    expect(
      lagOf({ ...supplied, window: { fromUtc: "2026-10-02T00:00:00Z", toUtc: "2026-10-09T00:00:00Z" } }),
    ).toEqual(undischarged);
    expect(lagOf({ ...supplied, window: { fromUtc: "not a time", toUtc: supplied.window.toUtc } })).toEqual(
      undischarged,
    );
    // The historical model has no validated window for this fight: chronology is not discharged there.
    const historical = reconstructEnvironment(await subjectEnvironmentInput(OLD));
    expect(historical.provenance.modelApplicability).toEqual({ supplied: null, coversFight: false });
    expect(historical.diagnostics.map((issue) => issue.code)).toContain("MODEL_BUILD_LAG");
    expect(historical.diagnostics.map((issue) => issue.code)).not.toContain("MODEL_SNAPSHOT_PRECEDES_LOG");
  });

  it("the diagnostic round-trip golden is this model's engine echoing the translated environment", () => {
    expect(roundTrip._golden.source).toContain(NEW);
    expect(roundTrip.purpose).toBe("BOSS_ONLY_DIAGNOSTIC");
    expect(roundTrip.echoes).toHaveLength(4);
    for (const echo of roundTrip.echoes) {
      expect(echo.targets).toBe(1);
      expect(echo.raidEvents).toEqual(["tank_heal"]);
      expect(echo.simulationLength).toEqual({ min: 345.177, max: 345.177 });
      expect(echo.bloodlust).toEqual([{ spell: 2825, startCount: 1 }]);
    }
  });
});
