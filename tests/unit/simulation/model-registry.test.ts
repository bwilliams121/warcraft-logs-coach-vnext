/**
 * M11 simulation-model registry: selection, preparation, cache identity and
 * result verification across the two approved models. Offline (no engine).
 */

import { describe, expect, it } from "vitest";

import { RUNNER_MODEL_VALIDATIONS, RUNNER_SPEC_BINDINGS } from "../../../runner/spec-bindings.js";
import {
  APPROVED_ENGINE_ARTIFACTS,
  approvedArtifactForPin,
} from "../../../src/simulation/approved-artifacts.js";
import {
  isModelValidatedForSpec,
  resolveSimulationModel,
  selectSimulationModel,
  SIMULATION_MODELS,
  type SpecSimulationModelValidations,
} from "../../../src/simulation/model-registry.js";
import { ENVIRONMENT_PUBLISHABILITY_GATE_REVISION } from "../../../src/environment/publishability.js";
import { PROFILE_READINESS_GATE_REVISION } from "../../../src/character-profile/fidelity.js";
import { executionProfileById } from "../../../src/simulation/execution-profiles.js";
import { executionProfileRevision } from "../../../src/simulation/execution-revision.js";
import { INPUT_BUILDER_REVISION } from "../../../src/simulation/input-builder.js";
import { prepareSimulation } from "../../../src/simulation/prepare.js";
import { RESULT_PARSER_REVISION } from "../../../src/simulation/result-parser.js";
import { devBloodJob, jsonBytes } from "../../support/simulation/dev-blood-job.js";

const OLD = "SIMC_33622E9D_LIVE_12_1_0_69587";
const NEW = "SIMC_0A72E6A7_LIVE_12_1_0_69933";
const BLOOD = "deathknight/blood";
/** The canonical subject's resolved game context (b1PmaKrd6CDfzngc #48; M11 model-pin investigation). */
const CANONICAL = { specKey: BLOOD, gameBuild: "12.1.0.69933", fightStartUtc: "2026-10-01T01:01:26.629Z" };

const select = (
  context: { specKey?: string; gameBuild?: string | null; fightStartUtc?: string | null },
  validations = RUNNER_MODEL_VALIDATIONS,
) => selectSimulationModel({ ...CANONICAL, ...context } as never, validations);
const codeOf = (outcome: { ok: boolean; failure?: { code: string } }) =>
  outcome.ok ? "OK" : outcome.failure?.code;

describe("M11 model selection from the log's resolved game context", () => {
  it("the canonical Blood fight (Live 69933, 2026-10-01) selects the 0a72e6a7 model", () => {
    const selected = select({});
    expect(selected.ok && selected.value.model.id).toBe(NEW);
    // The selection carries WHY the model applies: Blood's validated 69933 window.
    expect(selected.ok && selected.value.applicability).toEqual({
      modelId: NEW,
      specKey: BLOOD,
      gameBuild: "12.1.0.69933",
      fightStartUtc: CANONICAL.fightStartUtc,
      window: { fromUtc: "2026-09-22T20:05:35Z", toUtc: "2026-10-01T23:06:26Z" },
      windowBasis: "SNAPSHOTS_VERIFIED_EQUIVALENT_FOR_SPEC",
    });
  });

  it("a 69587 context inside its window selects the 33622e9d model — and never the newer one", () => {
    const selected = select({ gameBuild: "12.1.0.69587", fightStartUtc: "2026-09-11T20:00:00Z" });
    expect(selected.ok && selected.value.model.id).toBe(OLD);
    expect(selected.ok && selected.value.applicability.windowBasis).toBe(
      "SINGLE_SNAPSHOT_UNTIL_NEXT_LIVE_SNAPSHOT",
    );
  });

  it("two validations of the SAME model matching one fight are CONTEXT_UNRESOLVED (applicability must cite one window)", () => {
    const blood = RUNNER_MODEL_VALIDATIONS[0]?.validations ?? [];
    const promoted = blood.find((v) => v.modelId === NEW);
    if (promoted === undefined) throw new Error("validation");
    const doubled: SpecSimulationModelValidations[] = [{ specKey: BLOOD, validations: [...blood, promoted] }];
    expect(codeOf(select({}, doubled))).toBe("SIMULATION_MODEL_CONTEXT_UNRESOLVED");
  });

  it("an unsupported later context (12.1.5) fails closed — no fallback to an older model", () => {
    expect(codeOf(select({ gameBuild: "12.1.5.70340", fightStartUtc: "2026-10-20T20:00:00Z" }))).toBe(
      "SIMULATION_MODEL_NOT_AVAILABLE",
    );
    expect(codeOf(select({ gameBuild: "12.1.5.70529", fightStartUtc: "2026-10-23T20:00:00Z" }))).toBe(
      "SIMULATION_MODEL_NOT_AVAILABLE",
    );
  });

  it("a 69933 fight outside the validated snapshot window is NOT_AVAILABLE — build equality alone is not enough", () => {
    expect(codeOf(select({ fightStartUtc: "2026-10-05T20:00:00Z" }))).toBe("SIMULATION_MODEL_NOT_AVAILABLE");
    expect(codeOf(select({ fightStartUtc: "2026-09-22T19:00:00Z" }))).toBe("SIMULATION_MODEL_NOT_AVAILABLE");
    // The window is half-open and exactly the evidence: [0a72 snapshot, 698c snapshot).
    expect(select({ fightStartUtc: "2026-09-22T20:05:35Z" }).ok).toBe(true);
    expect(codeOf(select({ fightStartUtc: "2026-10-01T23:06:26Z" }))).toBe("SIMULATION_MODEL_NOT_AVAILABLE");
  });

  it("an unresolved build or fight time is CONTEXT_UNRESOLVED, never a guess", () => {
    expect(codeOf(select({ gameBuild: null }))).toBe("SIMULATION_MODEL_CONTEXT_UNRESOLVED");
    expect(codeOf(select({ fightStartUtc: null }))).toBe("SIMULATION_MODEL_CONTEXT_UNRESOLVED");
    expect(codeOf(select({ fightStartUtc: "not a time" }))).toBe("SIMULATION_MODEL_CONTEXT_UNRESOLVED");
  });

  it("a spec that has not validated the model gets NOT_VALIDATED_FOR_SPEC (approval is per spec)", () => {
    expect(codeOf(select({ specKey: "paladin/protection" }))).toBe("SIMULATION_MODEL_NOT_VALIDATED_FOR_SPEC");
    expect(
      codeOf(
        select({
          specKey: "rogue/assassination",
          gameBuild: "12.1.0.69587",
          fightStartUtc: "2026-09-11T20:00:00Z",
        }),
      ),
    ).toBe("SIMULATION_MODEL_NOT_VALIDATED_FOR_SPEC");
    const withoutNew: SpecSimulationModelValidations[] = [
      {
        specKey: BLOOD,
        validations: RUNNER_MODEL_VALIDATIONS[0]?.validations.filter((v) => v.modelId !== NEW) ?? [],
      },
    ];
    expect(codeOf(select({}, withoutNew))).toBe("SIMULATION_MODEL_NOT_VALIDATED_FOR_SPEC");
    expect(isModelValidatedForSpec(RUNNER_MODEL_VALIDATIONS, BLOOD, NEW)).toBe(true);
    expect(isModelValidatedForSpec(withoutNew, BLOOD, NEW)).toBe(false);
  });
});

describe("M11 model resolution, preparation and cache identity", () => {
  it("only an exact registered pin resolves; cross-pairing commit and build is unsupported", () => {
    expect(
      resolveSimulationModel({
        simcCommit: SIMULATION_MODELS[1]?.pin.simcCommit ?? "",
        gameDataBuild: "12.1.0.69933",
      }).ok,
    ).toBe(true);
    for (const pin of [
      { simcCommit: "0a72e6a74684d23c989b2d76143e429d2b4f1c91", gameDataBuild: "12.1.0.69587" },
      { simcCommit: "33622e9d1662ff0e451691edf85a6b49cc9d11d9", gameDataBuild: "12.1.0.69933" },
      { simcCommit: "cc01837ffb90ae5641a40f17ca56b78b602befa1", gameDataBuild: "12.1.5.70529" },
    ]) {
      expect(codeOf(resolveSimulationModel(pin)), JSON.stringify(pin)).toBe("UNSUPPORTED_MODEL_VERSION");
    }
  });

  it("each model prepares only with ITS artifact; the wrong artifact is RUNNER_UNAVAILABLE, never substituted", async () => {
    const oldArtifact = approvedArtifactForPin(
      SIMULATION_MODELS[0]?.pin ?? { simcCommit: "", gameDataBuild: "" },
    );
    const newArtifact = approvedArtifactForPin(
      SIMULATION_MODELS[1]?.pin ?? { simcCommit: "", gameDataBuild: "" },
    );
    if (oldArtifact === undefined || newArtifact === undefined) throw new Error("artifacts");
    const newJob = devBloodJob("STANDARD_SIM_V1", "ELITE_REALISTIC_V1", NEW);
    const oldJob = devBloodJob("STANDARD_SIM_V1", "ELITE_REALISTIC_V1", OLD);
    expect(
      codeOf(await prepareSimulation(newJob, jsonBytes(newJob), oldArtifact, RUNNER_SPEC_BINDINGS)),
    ).toBe("RUNNER_UNAVAILABLE");
    expect(
      codeOf(await prepareSimulation(oldJob, jsonBytes(oldJob), newArtifact, RUNNER_SPEC_BINDINGS)),
    ).toBe("RUNNER_UNAVAILABLE");
    const both = await prepareSimulation(
      newJob,
      jsonBytes(newJob),
      APPROVED_ENGINE_ARTIFACTS,
      RUNNER_SPEC_BINDINGS,
    );
    expect(both.ok && both.value.model.id).toBe(NEW);
    expect(both.ok && both.value.artifact).toEqual(newArtifact);
  });

  it("old and new cache identities never collide; job semantics (profile, environment, execution) are model-independent", async () => {
    const oldJob = devBloodJob("STANDARD_SIM_V1", "ELITE_REALISTIC_V1", OLD);
    const newJob = devBloodJob("STANDARD_SIM_V1", "ELITE_REALISTIC_V1", NEW);
    const a = await prepareSimulation(
      oldJob,
      jsonBytes(oldJob),
      APPROVED_ENGINE_ARTIFACTS,
      RUNNER_SPEC_BINDINGS,
    );
    const b = await prepareSimulation(
      newJob,
      jsonBytes(newJob),
      APPROVED_ENGINE_ARTIFACTS,
      RUNNER_SPEC_BINDINGS,
    );
    if (!a.ok || !b.ok) throw new Error("prepare");
    expect(a.value.keys.engineRunKey).not.toBe(b.value.keys.engineRunKey);
    expect(a.value.keys.parsedResultKey).not.toBe(b.value.keys.parsedResultKey);
    expect(a.value.keys.profileHash).toBe(b.value.keys.profileHash);
    expect(a.value.keys.environmentHash).toBe(b.value.keys.environmentHash);
    expect(a.value.keys.executionProfileRevision).toBe(b.value.keys.executionProfileRevision);
    // The engine input is identical: the model is identity, not input.
    expect(a.value.input).toBe(b.value.input);
  });

  it("adding a model moved no unrelated revision: parser, input builder, execution profile, gates", async () => {
    expect(RESULT_PARSER_REVISION).toBe("SIMC_JSON_2_PARSER_V2");
    expect(INPUT_BUILDER_REVISION).toBe("simc-input-builder/2");
    const elite = executionProfileById("ELITE_REALISTIC_V1");
    if (elite === undefined) throw new Error("profile");
    expect(await executionProfileRevision(elite)).toBe(
      "5692cfece9870b95028ed41ebada3bf858c624e5a8d784ce677eada203d9190c",
    );
    expect(PROFILE_READINESS_GATE_REVISION).toBe("profile-readiness-gate/1");
    expect(ENVIRONMENT_PUBLISHABILITY_GATE_REVISION).toBe("environment-publishability-gate/1");
  });
});
