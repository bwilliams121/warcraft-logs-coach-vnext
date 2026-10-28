/**
 * M11-G4-2 simulation publication (internal; owner decisions 2026-10-28).
 *
 * Stage A on the REAL canonical evidence: every gate in order, the first
 * failing gate recorded exactly. The canonical fight resolves CONTEXT to
 * 0a72e6a7, passes CHARACTER only with the owner's race statement and a
 * fidelity echo, and stops at ENVIRONMENT with its real blockers.
 *
 * Stage B on a SYNTHETIC plan (owner decision: synthetic gate inputs prove
 * orchestration, not real-log fidelity):
 * - through the REAL runner service (fake engine), which must accept the
 *   pipeline's PRODUCTION job and its readiness attestation;
 * - through a scripted backend, covering every variant, the one precision
 *   escalation, and failures that are never retried.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { LocalSimulationBackend } from "../../../runner/local-backend.js";
import { RUNNER_MODEL_VALIDATIONS, RUNNER_SPEC_BINDINGS } from "../../../runner/spec-bindings.js";
import type { CharacterProfile } from "../../../src/character-profile/profile.js";
import { reconstructCharacterProfile } from "../../../src/character-profile/reconstruct.js";
import type { EnvironmentReconstructionInput } from "../../../src/environment/reconstruct.js";
import type { EnvironmentTranslation } from "../../../src/environment/translate.js";
import { attainmentOf, envelopeOf } from "../../../src/publication/attainment.js";
import {
  ACTUAL_DPS_ENGINE_COMPARABILITY,
  assessPublicationReadiness,
  NO_PROFILE_ECHO_SOURCE,
  PUBLICATION_ESCALATION_POLICY_ID,
  PUBLICATION_POLICY_ID,
  publishSimulation,
  runPublication,
  type ProfileEchoSource,
  type PublicationDeps,
  type PublicationPlan,
  type PublicationSpecBinding,
  type PublicationSubject,
} from "../../../src/publication/pipeline.js";
import type { ObservedDps, VariantSimulation } from "../../../src/publication/record.js";
import { ENVIRONMENT_PUBLISHABILITY_GATE_REVISION } from "../../../src/environment/publishability.js";
import { PROFILE_READINESS_GATE_REVISION } from "../../../src/character-profile/fidelity.js";
import type { BackendRun, SimulationBackend, SimulationRequest } from "../../../src/simulation/backend.js";
import { simulationModelById } from "../../../src/simulation/model-registry.js";
import { extractProfileEcho } from "../../../src/simulation/profile-echo.js";
import { prepareSimulation } from "../../../src/simulation/prepare.js";
import { settleTicket } from "../../../src/simulation/backend.js";
import { executionProfileById } from "../../../src/simulation/execution-profiles.js";
import { executionProfileRevision } from "../../../src/simulation/execution-revision.js";
import { expectedResultIdentity } from "../../../src/simulation/result-verification.js";
import { COMMITTED_DEPLOY_CALENDAR_EVIDENCE } from "../../../src/simulation-context/evidence.js";
import { BLOOD_CHARACTER_BINDING } from "../../../src/specs/deathknight/blood/character-binding.js";
import { BLOOD_ENVIRONMENT_FACTS_BY_MODEL } from "../../../src/specs/deathknight/blood/environment-facts.js";
import userRaceGolden from "../../fixtures/simulation/simc-0a72e6a7-blood-subject-fidelity-user-race.json";
import unstatedGolden from "../../fixtures/simulation/simc-0a72e6a7-blood-subject-fidelity.json";
import {
  reconstructionInputOf,
  subjectEvidence,
  withOwnerStatements,
  type FightEvidence,
} from "../../support/character/subject.js";
import {
  subjectContextFight,
  subjectEnvironmentInput,
  subjectRegion,
} from "../../support/environment/subject-environment.js";
import { subjectObservedPerformance } from "../../support/m11/g2-four-fights.js";
import {
  FAKE_ARTIFACT,
  FAKE_ARTIFACT_NEW,
  NEW_MODEL_ID,
  productionJob,
  startedService,
} from "../../support/simulation/runner-service.js";
import { jsonBytes } from "../../support/simulation/dev-blood-job.js";

type Json = Record<string, any>;
const BLOOD = "deathknight/blood";
const model = simulationModelById(NEW_MODEL_ID);
if (model === undefined) throw new Error("registry");

const BINDING: PublicationSpecBinding = {
  specKey: BLOOD,
  character: BLOOD_CHARACTER_BINDING,
  environmentFactsByModel: BLOOD_ENVIRONMENT_FACTS_BY_MODEL,
};

let evidence: FightEvidence;
let environmentInput: EnvironmentReconstructionInput;
let stated: CharacterProfile;

beforeAll(async () => {
  evidence = await subjectEvidence();
  environmentInput = await subjectEnvironmentInput(NEW_MODEL_ID);
  stated = reconstructCharacterProfile(
    withOwnerStatements(reconstructionInputOf(evidence, NEW_MODEL_ID)),
    BLOOD_CHARACTER_BINDING,
  );
});

/** The canonical subject's G1 ACTUAL_DPS, as the caller establishes it. */
function canonicalObserved(): ObservedDps {
  const performance = subjectObservedPerformance() as { actualDps: Json };
  const actual = performance.actualDps;
  return actual["status"] === "OBSERVED"
    ? { state: "KNOWN", dps: actual["value"], source: actual["source"] }
    : { state: "UNKNOWN", reason: String(actual["status"]) };
}

function canonicalSubject(options: {
  ownerStatements: boolean;
  region?: PublicationSubject["fight"]["report"]["region"];
}): PublicationSubject {
  const { fight, reportStartUnixMs } = subjectContextFight();
  return {
    fight: {
      report: { startTimeUnixMs: reportStartUnixMs, region: options.region ?? subjectRegion() },
      fight: { startTimeMs: fight.startTime },
    },
    characterInputFor: (data) => {
      const input = reconstructionInputOf(evidence, data.manifest.modelId);
      return options.ownerStatements ? withOwnerStatements(input) : input;
    },
    environmentInputFor: (data, applicability) => {
      if (data.manifest.modelId !== NEW_MODEL_ID) throw new Error("unexpected model");
      return { ...environmentInput, modelApplicability: applicability };
    },
    observed: canonicalObserved(),
  };
}

/** The committed engine echo for exactly this probe job (checked by profile hash). */
const goldenEcho =
  (golden: Json): ProfileEchoSource =>
  async (job) => {
    const prepared = await prepareSimulation(
      job,
      jsonBytes(job),
      [FAKE_ARTIFACT, FAKE_ARTIFACT_NEW],
      RUNNER_SPEC_BINDINGS,
    );
    if (!prepared.ok) throw new Error(prepared.failure.detail);
    // The golden was cut from exactly this probe job, or it is not its echo.
    expect(prepared.value.keys.profileHash).toBe(golden["_golden"].jobProfileHash);
    return extractProfileEcho(JSON.stringify(golden));
  };

const unusedBackend: SimulationBackend = {
  kind: "LOCAL",
  simulate: () => {
    throw new Error("stage A must not simulate the fight");
  },
};

const deps = (overrides: Partial<PublicationDeps> = {}): PublicationDeps => ({
  deployEvidence: COMMITTED_DEPLOY_CALENDAR_EVIDENCE,
  modelValidations: RUNNER_MODEL_VALIDATIONS,
  profileEcho: NO_PROFILE_ECHO_SOURCE,
  backend: unusedBackend,
  artifacts: [FAKE_ARTIFACT, FAKE_ARTIFACT_NEW],
  simulationBindings: RUNNER_SPEC_BINDINGS,
  ...overrides,
});

describe("stage A on the real canonical evidence", () => {
  it("CONTEXT: the region capture resolves 69933 and selects 0a72e6a7; without a region nothing resolves", async () => {
    const unresolved = await assessPublicationReadiness(
      BINDING,
      canonicalSubject({ ownerStatements: true, region: { state: "NOT_RETRIEVED" } }),
      deps(),
    );
    expect(unresolved.ok).toBe(false);
    if (unresolved.ok) return;
    expect(unresolved.publication).toMatchObject({
      status: "NOT_PUBLISHED",
      gate: { gate: "CONTEXT", code: "CONTEXT_UNRESOLVED" },
      simulationModelId: null,
      variants: [],
      simulated: null,
      attainment: { state: "UNKNOWN", reason: "SIMULATION_NOT_PUBLISHED" },
    });
    expect(unresolved.publication.gate?.reasons[0]).toContain("REGION_UNRESOLVED");
  });

  it("CHARACTER fails closed without a profile-echo source (production today)", async () => {
    const outcome = await assessPublicationReadiness(
      BINDING,
      canonicalSubject({ ownerStatements: true }),
      deps(),
    );
    if (outcome.ok) throw new Error("expected NOT_PUBLISHED");
    expect(outcome.publication).toMatchObject({
      gate: { gate: "CHARACTER", code: "FIDELITY_PROBE_UNAVAILABLE" },
      context: { gameBuild: "12.1.0.69933" },
      simulationModelId: NEW_MODEL_ID,
    });
  });

  it("CHARACTER: an echo failure is FIDELITY_PROBE_FAILED with its code, never 'not ready'", async () => {
    const outcome = await assessPublicationReadiness(
      BINDING,
      canonicalSubject({ ownerStatements: true }),
      deps({
        profileEcho: async () => ({
          ok: false,
          failure: { code: "SIMULATION_OUTPUT_MALFORMED", detail: "x" },
        }),
      }),
    );
    if (outcome.ok) throw new Error("expected NOT_PUBLISHED");
    expect(outcome.publication.gate).toEqual({
      gate: "CHARACTER",
      code: "FIDELITY_PROBE_FAILED",
      reasons: ["SIMULATION_OUTPUT_MALFORMED: x"],
    });
  });

  it("CHARACTER: without the owner's race statement the profile is not SIMULATION_READY", async () => {
    const outcome = await assessPublicationReadiness(
      BINDING,
      canonicalSubject({ ownerStatements: false }),
      deps({ profileEcho: goldenEcho(unstatedGolden) }),
    );
    if (outcome.ok) throw new Error("expected NOT_PUBLISHED");
    expect(outcome.publication.gate?.gate).toBe("CHARACTER");
    expect(outcome.publication.gate?.code).toBe("PROFILE_NOT_SIMULATION_READY");
  });

  it("ENVIRONMENT: with a ready character the canonical fight stops at its real blockers", async () => {
    const outcome = await assessPublicationReadiness(
      BINDING,
      canonicalSubject({ ownerStatements: true }),
      deps({ profileEcho: goldenEcho(userRaceGolden) }),
    );
    if (outcome.ok) throw new Error("expected NOT_PUBLISHED");
    expect(outcome.publication.gate?.gate).toBe("ENVIRONMENT");
    expect(outcome.publication.gate?.code).toBe("ENVIRONMENT_NOT_PUBLISHABLE");
    const codes = outcome.publication.gate?.reasons.map((reason) => reason.split(":")[0]) ?? [];
    for (const code of ["TARGET_SCHEDULE_UNRESOLVED", "MATERIAL_CONSUMABLE_UNKNOWN"]) {
      expect(codes, code).toContain(code);
    }
    // Observed DPS is carried, but nothing was simulated.
    expect(outcome.publication.observed.state).toBe("KNOWN");
    expect(outcome.publication.simulated).toBeNull();
  });

  it("publishSimulation over the canonical fight is NOT_PUBLISHED and never reaches the backend", async () => {
    const publication = await publishSimulation(
      BINDING,
      canonicalSubject({ ownerStatements: true }),
      deps({ profileEcho: goldenEcho(userRaceGolden) }),
    );
    expect(publication.status).toBe("NOT_PUBLISHED");
    expect(publication.gate?.gate).toBe("ENVIRONMENT");
  });
});

// ---------------------------------------------------------------------------
// Stage B: a SYNTHETIC plan (owner decision 3). The environment is the
// development job's, relabelled ACTUAL_OBSERVED for this test only.
// ---------------------------------------------------------------------------

function syntheticPlan(variantCount = 1): PublicationPlan {
  const job = productionJob(0, NEW_MODEL_ID);
  const translation: EnvironmentTranslation = {
    purpose: "CURRENT_SETUP",
    environment: job["environment"],
    consumableVariants: Array.from({ length: variantCount }, (_, index) => ({
      id: `synthetic-${String(index)}`,
      ranks: [],
      consumables: job["character"]["consumables"],
    })),
    ledger: [],
  };
  return {
    specKey: BLOOD,
    context: { specKey: BLOOD, gameBuild: "12.1.0.69933", fightStartUtc: "2026-10-01T03:05:22.921Z" },
    model: model as NonNullable<typeof model>,
    applicability: {
      modelId: NEW_MODEL_ID,
      specKey: BLOOD,
      gameBuild: "12.1.0.69933",
      fightStartUtc: "2026-10-01T03:05:22.921Z",
      window: { fromUtc: "2026-09-22T20:05:35Z", toUtc: "2026-10-01T23:06:26Z" },
      windowBasis: "SNAPSHOTS_VERIFIED_EQUIVALENT_FOR_SPEC",
    },
    profile: stated,
    character: BLOOD_CHARACTER_BINDING,
    translation,
    observed: { state: "KNOWN", dps: 45_000, source: "SYNTHETIC" },
  };
}

/** A backend that answers each call from a script, recording every request. */
class ScriptedBackend implements SimulationBackend {
  readonly kind = "LOCAL";
  readonly requests: SimulationRequest[] = [];
  constructor(
    private readonly script: ((request: SimulationRequest) => BackendRun | Promise<BackendRun>)[],
  ) {}
  async simulate(request: SimulationRequest): Promise<BackendRun> {
    this.requests.push(request);
    const next = this.script[this.requests.length - 1];
    if (next === undefined) throw new Error("unscripted call");
    return next(request);
  }
}

/** ELITE_REALISTIC_V1's revision, as prepare computes it. */
let ELITE_REVISION = "";
beforeAll(async () => {
  const profile = executionProfileById("ELITE_REALISTIC_V1");
  if (profile === undefined) throw new Error("profile");
  ELITE_REVISION = await executionProfileRevision(profile);
});

const success =
  (mean: number, halfWidth: number, revision?: string) =>
  (request: SimulationRequest): BackendRun => {
    const job = request.job as Json;
    return {
      backend: "LOCAL",
      outcome: {
        ok: true,
        value: {
          executionProfile: { revision: revision ?? ELITE_REVISION },
          dps: {
            mean,
            standardDeviation: 1,
            standardError: halfWidth / 1.96,
            relativeStandardError: halfWidth / 1.96 / mean,
            ci95: { lower: mean - halfWidth, upper: mean + halfWidth },
          },
          iterations: {
            requested: job["simulationPolicy"]["iterations"],
            counted: job["simulationPolicy"]["iterations"],
          },
        } as never,
      },
    };
  };
const failure = (code: string, transport?: BackendRun["transport"]) => (): BackendRun => ({
  backend: "LOCAL",
  outcome: { ok: false, failure: { code: code as never, detail: "scripted" } },
  ...(transport === undefined ? {} : { transport }),
});

/** The real `settleTicket` refusal for a ticket whose cache key is not the job's. */
const settledWithWrongCacheKey = async (request: SimulationRequest): Promise<BackendRun> => {
  const bytes = new TextEncoder().encode(JSON.stringify(request.job)).length;
  const expected = await expectedResultIdentity(
    request.job,
    bytes,
    [FAKE_ARTIFACT, FAKE_ARTIFACT_NEW],
    RUNNER_SPEC_BINDINGS,
  );
  if (!expected.ok) throw new Error(expected.failure.detail);
  return settleTicket("REMOTE", { status: "SUCCEEDED", cacheKey: "0".repeat(64) } as never, expected.value);
};

describe("stage B on a synthetic plan", () => {
  it("the REAL runner service accepts the pipeline's PRODUCTION job and attestation, and the result publishes", async () => {
    const harness = await startedService({ models: ["NEW"], allowedJobClasses: ["PRODUCTION"] });
    const backend = new LocalSimulationBackend(harness.service, [FAKE_ARTIFACT_NEW], RUNNER_SPEC_BINDINGS);
    const publication = await runPublication(syntheticPlan(), deps({ backend }));
    expect(publication.status).toBe("PUBLISHED");
    expect(publication.gate).toBeNull();
    expect(publication.simulationModelId).toBe(NEW_MODEL_ID);
    expect(publication.variants).toHaveLength(1);
    expect(publication.variants[0]).toMatchObject({
      variantId: "synthetic-0",
      policyId: PUBLICATION_POLICY_ID,
      escalated: false,
    });
    expect(publication.simulated?.meanRange.min).toBe(publication.variants[0]?.mean);
    expect(publication.provenance).toMatchObject({
      executionProfileId: "ELITE_REALISTIC_V1",
      gateRevisions: {
        profile: PROFILE_READINESS_GATE_REVISION,
        environment: ENVIRONMENT_PUBLISHABILITY_GATE_REVISION,
      },
    });
    expect(publication.provenance.profileHash).toMatch(/^[0-9a-f]{64}$/);
    // The verified result's execution profile revision, cross-checked against the prepared job.
    expect(publication.provenance.executionProfileRevisions).toEqual([ELITE_REVISION]);
    // Owner decision 1: the ratio stays UNKNOWN until comparability is proven.
    expect(ACTUAL_DPS_ENGINE_COMPARABILITY).toBe("NOT_PROVEN");
    expect(publication.attainment).toEqual({ state: "UNKNOWN", reason: "ATTAINMENT_NOT_COMPARABLE" });
  });

  it("every PRODUCTION request carries an attestation bound to the job's model and the current gate revisions", async () => {
    const backend = new ScriptedBackend([success(50_000, 60)]);
    await runPublication(syntheticPlan(), deps({ backend }));
    const request = backend.requests[0];
    const job = request?.job as Json;
    expect(job["character"]["profileKind"]).toBe("LOGGED_RECONSTRUCTION");
    expect(job["executionProfileId"]).toBe("ELITE_REALISTIC_V1");
    expect(job["simulationPolicy"]["policyId"]).toBe(PUBLICATION_POLICY_ID);
    expect(request?.readiness).toMatchObject({
      jobClass: "PRODUCTION",
      simulationModelId: NEW_MODEL_ID,
      profile: { status: "SIMULATION_READY", gateRevision: PROFILE_READINESS_GATE_REVISION },
      environment: { status: "PUBLISHABLE", gateRevision: ENVIRONMENT_PUBLISHABILITY_GATE_REVISION },
    });
  });

  it("every consumable variant runs; the envelope spans them all", async () => {
    const backend = new ScriptedBackend([success(50_000, 60), success(51_000, 80), success(49_500, 50)]);
    const publication = await runPublication(syntheticPlan(3), deps({ backend }));
    expect(backend.requests).toHaveLength(3);
    expect(publication.status).toBe("PUBLISHED");
    expect(publication.simulated).toEqual({
      low: 49_450,
      high: 51_080,
      meanRange: { min: 49_500, max: 51_000 },
    });
  });

  it("one failing variant means nothing publishes", async () => {
    const backend = new ScriptedBackend([success(50_000, 60), failure("MODEL_PROVENANCE_MISMATCH")]);
    const publication = await runPublication(syntheticPlan(2), deps({ backend }));
    expect(publication.status).toBe("NOT_PUBLISHED");
    expect(publication.simulated).toBeNull();
    expect(publication.gate).toMatchObject({ gate: "SIMULATION", code: "SIMULATION_RESULT_INVALID" });
  });

  it("precision: exactly one escalation, only on SIMULATION_PRECISION_NOT_MET", async () => {
    const escalated = new ScriptedBackend([failure("SIMULATION_PRECISION_NOT_MET"), success(50_000, 30)]);
    const recovered = await runPublication(syntheticPlan(), deps({ backend: escalated }));
    expect(recovered.status).toBe("PUBLISHED");
    expect(recovered.variants[0]).toMatchObject({
      policyId: PUBLICATION_ESCALATION_POLICY_ID,
      escalated: true,
    });
    expect((escalated.requests[1]?.job as Json)["simulationPolicy"]["policyId"]).toBe(
      PUBLICATION_ESCALATION_POLICY_ID,
    );

    const twice = new ScriptedBackend([
      failure("SIMULATION_PRECISION_NOT_MET"),
      failure("SIMULATION_PRECISION_NOT_MET"),
    ]);
    const refused = await runPublication(syntheticPlan(), deps({ backend: twice }));
    expect(twice.requests).toHaveLength(2);
    expect(refused).toMatchObject({
      status: "NOT_PUBLISHED",
      simulated: null,
      gate: { code: "PRECISION_INSUFFICIENT" },
    });
  });

  it("verification and transport failures keep their codes and are never retried as precision", async () => {
    for (const [code, transport, expected] of [
      ["MODEL_PROVENANCE_MISMATCH", undefined, "SIMULATION_RESULT_INVALID"],
      ["SIMULATION_OUTPUT_MALFORMED", undefined, "SIMULATION_RESULT_INVALID"],
      ["RUNNER_UNAVAILABLE", undefined, "SIMULATION_UNAVAILABLE"],
      ["RUNNER_UNAVAILABLE", "NETWORK", "SIMULATION_UNAVAILABLE"],
      ["RUNNER_UNAVAILABLE", "CLIENT_DEADLINE", "SIMULATION_UNAVAILABLE"],
      ["SIMULATION_TIMEOUT", undefined, "SIMULATION_UNAVAILABLE"],
      ["MODEL_PROVENANCE_MISMATCH", "BAD_RESPONSE", "SIMULATION_RESULT_INVALID"],
    ] as const) {
      const backend = new ScriptedBackend([failure(code, transport)]);
      const publication = await runPublication(syntheticPlan(), deps({ backend }));
      expect(backend.requests, code).toHaveLength(1);
      expect(publication.gate?.code, code).toBe(expected);
      expect(publication.gate?.reasons.join(" "), code).toContain(code);
    }
  });

  it("a verification refusal from the real settleTicket (BAD_RESPONSE) is SIMULATION_RESULT_INVALID, never unavailable or retried", async () => {
    const backend = new ScriptedBackend([settledWithWrongCacheKey]);
    const publication = await runPublication(syntheticPlan(), deps({ backend }));
    expect(backend.requests).toHaveLength(1);
    expect(publication.gate?.code).toBe("SIMULATION_RESULT_INVALID");
    expect(publication.gate?.reasons).toContain("transport BAD_RESPONSE");
    expect(publication.gate?.reasons.join(" ")).toContain("MODEL_PROVENANCE_MISMATCH");
  });

  it("a result naming another execution profile revision is SIMULATION_RESULT_INVALID", async () => {
    const backend = new ScriptedBackend([success(50_000, 60, "f".repeat(64))]);
    const publication = await runPublication(syntheticPlan(), deps({ backend }));
    expect(publication.status).toBe("NOT_PUBLISHED");
    expect(publication.gate?.code).toBe("SIMULATION_RESULT_INVALID");
    expect(publication.gate?.reasons.join(" ")).toContain("execution profile revision");
  });

  it("a profile whose race is unresolved never becomes a PRODUCTION job", async () => {
    const unstated = reconstructCharacterProfile(
      reconstructionInputOf(evidence, NEW_MODEL_ID),
      BLOOD_CHARACTER_BINDING,
    );
    const backend = new ScriptedBackend([]);
    const publication = await runPublication({ ...syntheticPlan(), profile: unstated }, deps({ backend }));
    expect(backend.requests).toHaveLength(0);
    expect(publication.gate).toMatchObject({ gate: "SIMULATION", code: "JOB_CONSTRUCTION_FAILED" });
  });
});

describe("derived values", () => {
  const variant = (mean: number, lower: number, upper: number): VariantSimulation => ({
    variantId: "v",
    policyId: PUBLICATION_POLICY_ID,
    escalated: false,
    mean,
    ci95: { lower, upper },
    relativeStandardError: 0.001,
    iterations: 2_000,
  });

  it("attainment is an interval over the envelope only when observed is KNOWN and comparability PROVEN", () => {
    const envelope = envelopeOf([variant(50_000, 49_000, 51_000)]);
    const observed: ObservedDps = { state: "KNOWN", dps: 40_800, source: "x" };
    expect(attainmentOf(observed, envelope, "PROVEN")).toEqual({
      state: "KNOWN",
      low: 0.8,
      high: 40_800 / 49_000,
    });
    expect(attainmentOf(observed, envelope, "NOT_PROVEN")).toEqual({
      state: "UNKNOWN",
      reason: "ATTAINMENT_NOT_COMPARABLE",
    });
    expect(attainmentOf({ state: "UNKNOWN", reason: "x" }, envelope, "PROVEN")).toEqual({
      state: "UNKNOWN",
      reason: "OBSERVED_DPS_UNKNOWN",
    });
    expect(attainmentOf(observed, null, "PROVEN")).toEqual({
      state: "UNKNOWN",
      reason: "SIMULATION_NOT_PUBLISHED",
    });
    expect(attainmentOf(observed, envelopeOf([variant(10, 0, 20)]), "PROVEN")).toEqual({
      state: "UNKNOWN",
      reason: "SIMULATED_ENVELOPE_NOT_POSITIVE",
    });
  });

  it("no variants, no envelope", () => {
    expect(envelopeOf([])).toBeNull();
  });
});
