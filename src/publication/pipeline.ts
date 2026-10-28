/**
 * M11-G4-2 SIMULATION PUBLICATION pipeline (internal; agent/architecture.md
 * "M11-G4-2"). Shared and spec-agnostic: a specialization supplies its
 * bindings and facts; the caller supplies the subject's evidence builders.
 *
 * Stage A, readiness (no simulation of the fight itself):
 *   CONTEXT      resolveSimulationContext -> selectSimulationModel
 *   CHARACTER    profile on that model -> fidelity probe echo -> SIMULATION_READY
 *   ENVIRONMENT  environment on that model -> PUBLISHABLE -> CURRENT_SETUP translation
 * Stage B, simulation:
 *   SIMULATION   one PRODUCTION job per consumable variant, attested; one
 *                precision escalation, only on SIMULATION_PRECISION_NOT_MET
 *
 * The first failing gate stops the pipeline: NOT_PUBLISHED with that gate's
 * code and reasons. Nothing past it runs.
 */

import type { CharacterSpecBinding } from "../character-profile/binding.js";
import { assessProfileFidelity, PROFILE_READINESS_GATE_REVISION } from "../character-profile/fidelity.js";
import type { CharacterProfile } from "../character-profile/profile.js";
import { reconstructCharacterProfile, type ReconstructionInput } from "../character-profile/reconstruct.js";
import { fidelityProbeJob, loggedJobCharacter } from "../character-profile/simulation-character.js";
import { simulationModelData, type SimulationModelData } from "../data/simulation-models/index.js";
import type { EnvironmentSpecFacts } from "../environment/materiality.js";
import {
  assessEnvironmentPublishability,
  ceilingEligibility,
  ENVIRONMENT_PUBLISHABILITY_GATE_REVISION,
} from "../environment/publishability.js";
import { reconstructEnvironment, type EnvironmentReconstructionInput } from "../environment/reconstruct.js";
import type { ValidatedModelApplicability } from "../environment/model.js";
import {
  translateEnvironment,
  type ConsumableVariant,
  type EnvironmentTranslation,
} from "../environment/translate.js";
import type { SimulationBackend } from "../simulation/backend.js";
import type { SimulationOutcome } from "../simulation/failures.js";
import { SIMULATION_JOB_SCHEMA_VERSION, type SimulationJob } from "../simulation/job.js";
import type { ApprovedEngineArtifact } from "../simulation/model.js";
import {
  selectSimulationModel,
  type SimulationModel,
  type SimulationModelApplicability,
  type SpecSimulationModelValidations,
} from "../simulation/model-registry.js";
import { prepareSimulation } from "../simulation/prepare.js";
import type { ProfileEcho } from "../simulation/profile-echo.js";
import {
  READINESS_ATTESTATION_SCHEMA_VERSION,
  type ReadinessAttestation,
} from "../simulation/readiness-attestation.js";
import { simulationPolicyById } from "../simulation/simulation-policy.js";
import type { SimulationSpecBinding } from "../simulation/spec-binding.js";
import type { DeployCalendarEvidenceLoad } from "../simulation-context/evidence.js";
import { resolveSimulationContext, type SimulationContextFight } from "../simulation-context/resolve.js";
import { attainmentOf, envelopeOf } from "./attainment.js";
import {
  PUBLICATION_REVISION,
  SIMULATION_PUBLICATION_SCHEMA_VERSION,
  type DpsComparability,
  type ObservedDps,
  type PublicationGateFailure,
  type SimulationPublication,
  type VariantSimulation,
} from "./record.js";

export const PUBLICATION_EXECUTION_PROFILE_ID = "ELITE_REALISTIC_V1";
/** Owner decision 2026-10-28: the standard policy, then exactly one escalation. */
export const PUBLICATION_POLICY_ID = "STANDARD_SIM_V1";
export const PUBLICATION_ESCALATION_POLICY_ID = "PRECISION_ESCALATED_V1";

/**
 * Observed G1 ACTUAL_DPS vs the engine's "player DPS including pets": pet
 * inclusion is corroborated, not proven (G1), so attainment stays UNKNOWN.
 */
export const ACTUAL_DPS_ENGINE_COMPARABILITY: DpsComparability = "NOT_PROVEN";

/** A specialization's publication inputs. */
export interface PublicationSpecBinding {
  readonly specKey: string;
  readonly character: CharacterSpecBinding;
  readonly environmentFactsByModel: Readonly<Record<string, EnvironmentSpecFacts>>;
}

/**
 * Reads a fidelity probe's engine echo. The remote runner protocol carries no
 * echo and production runners refuse FIDELITY_PROBE jobs (G3-5), so production
 * has no source yet: callers pass `NO_PROFILE_ECHO_SOURCE` and the CHARACTER
 * gate fails closed.
 */
export type ProfileEchoSource = (
  job: SimulationJob,
  model: SimulationModel,
) => Promise<SimulationOutcome<ProfileEcho>> | null;

export const NO_PROFILE_ECHO_SOURCE: ProfileEchoSource = () => null;

/** The subject's evidence, as builders over the SELECTED model's data. */
export interface PublicationSubject {
  readonly fight: SimulationContextFight;
  readonly characterInputFor: (model: SimulationModelData) => ReconstructionInput;
  readonly environmentInputFor: (
    model: SimulationModelData,
    applicability: ValidatedModelApplicability,
    profile: CharacterProfile,
  ) => EnvironmentReconstructionInput;
  readonly observed: ObservedDps;
}

export interface PublicationDeps {
  readonly deployEvidence: DeployCalendarEvidenceLoad;
  readonly modelValidations: readonly SpecSimulationModelValidations[];
  readonly profileEcho: ProfileEchoSource;
  readonly backend: SimulationBackend;
  readonly artifacts: readonly ApprovedEngineArtifact[];
  readonly simulationBindings: readonly SimulationSpecBinding[];
}

/** Everything stage B needs; built by stage A, or synthetically by a test. */
export interface PublicationPlan {
  readonly specKey: string;
  readonly context: SimulationPublication["context"];
  readonly model: SimulationModel;
  readonly applicability: SimulationModelApplicability;
  readonly profile: CharacterProfile;
  readonly character: CharacterSpecBinding;
  readonly translation: EnvironmentTranslation;
  readonly observed: ObservedDps;
}

export type ReadinessOutcome =
  | { readonly ok: true; readonly plan: PublicationPlan }
  | { readonly ok: false; readonly publication: SimulationPublication };

const GATE_REVISIONS = {
  profile: PROFILE_READINESS_GATE_REVISION,
  environment: ENVIRONMENT_PUBLISHABILITY_GATE_REVISION,
};

function notPublished(
  gate: PublicationGateFailure,
  context: SimulationPublication["context"],
  observed: ObservedDps,
  extra: {
    readonly modelId?: string;
    readonly profileHash?: string;
    readonly environmentHashes?: readonly string[];
    readonly variants?: readonly VariantSimulation[];
  } = {},
): SimulationPublication {
  return {
    schemaVersion: SIMULATION_PUBLICATION_SCHEMA_VERSION,
    revision: PUBLICATION_REVISION,
    status: "NOT_PUBLISHED",
    gate,
    context,
    simulationModelId: extra.modelId ?? null,
    variants: extra.variants ?? [],
    simulated: null,
    observed,
    attainment: attainmentOf(observed, null, ACTUAL_DPS_ENGINE_COMPARABILITY),
    provenance: {
      executionProfileId: extra.variants === undefined ? null : PUBLICATION_EXECUTION_PROFILE_ID,
      executionProfileRevisions: [],
      profileHash: extra.profileHash ?? null,
      environmentHashes: extra.environmentHashes ?? [],
      gateRevisions: GATE_REVISIONS,
    },
  };
}

const SELECTION_CODES: Readonly<Record<string, PublicationGateFailure["code"]>> = {
  SIMULATION_MODEL_CONTEXT_UNRESOLVED: "CONTEXT_UNRESOLVED",
  SIMULATION_MODEL_NOT_AVAILABLE: "MODEL_NOT_AVAILABLE",
  SIMULATION_MODEL_NOT_VALIDATED_FOR_SPEC: "MODEL_NOT_VALIDATED_FOR_SPEC",
};

/** Stage A. */
export async function assessPublicationReadiness(
  binding: PublicationSpecBinding,
  subject: PublicationSubject,
  deps: PublicationDeps,
): Promise<ReadinessOutcome> {
  const observed = subject.observed;
  const resolution = resolveSimulationContext(
    { specKey: binding.specKey, fight: subject.fight },
    deps.deployEvidence,
  );
  const context = resolution.context;
  const stop = (
    gate: PublicationGateFailure,
    extra?: Parameters<typeof notPublished>[3],
  ): ReadinessOutcome => ({
    ok: false,
    publication: notPublished(gate, context, observed, extra),
  });

  // CONTEXT
  if (resolution.status !== "RESOLVED") {
    return stop({
      gate: "CONTEXT",
      code: "CONTEXT_UNRESOLVED",
      reasons: [`${resolution.reason ?? "UNRESOLVED"}: ${resolution.detail}`],
    });
  }
  const selected = selectSimulationModel(context, deps.modelValidations);
  if (!selected.ok) {
    return stop({
      gate: "CONTEXT",
      code: SELECTION_CODES[selected.failure.code] ?? "CONTEXT_UNRESOLVED",
      reasons: [`${selected.failure.code}: ${selected.failure.detail}`],
    });
  }
  const { model, applicability } = selected.value;
  const data = simulationModelData(model.id);
  if (!data.ok) {
    return stop(
      { gate: "CONTEXT", code: "MODEL_DATA_UNAVAILABLE", reasons: [data.detail] },
      { modelId: model.id },
    );
  }

  // CHARACTER
  const characterInput = subject.characterInputFor(data.data);
  const profile = reconstructCharacterProfile(characterInput, binding.character);
  const probe = fidelityProbeJob(profile, binding.character, model.pin);
  if (!probe.ok) {
    return stop(
      {
        gate: "CHARACTER",
        code: "PROFILE_RECONSTRUCTION_FAILED",
        reasons: [`${probe.failure.code}: ${probe.failure.detail}`],
      },
      { modelId: model.id },
    );
  }
  const pendingEcho = deps.profileEcho(probe.value, model);
  if (pendingEcho === null) {
    return stop(
      {
        gate: "CHARACTER",
        code: "FIDELITY_PROBE_UNAVAILABLE",
        reasons: [
          "no profile-echo source: the runner protocol carries no echo and production runners refuse FIDELITY_PROBE jobs",
        ],
      },
      { modelId: model.id },
    );
  }
  const echo = await pendingEcho;
  if (!echo.ok) {
    return stop(
      {
        gate: "CHARACTER",
        code: "FIDELITY_PROBE_FAILED",
        reasons: [`${echo.failure.code}: ${echo.failure.detail}`],
      },
      { modelId: model.id },
    );
  }
  const pullFacts =
    characterInput.pullFacts !== null && characterInput.pullFacts.actorId === characterInput.subject.actorId
      ? characterInput.pullFacts.facts
      : null;
  const fidelity = assessProfileFidelity(profile, binding.character, echo.value, pullFacts);
  if (fidelity.readiness !== "SIMULATION_READY") {
    return stop(
      {
        gate: "CHARACTER",
        code: "PROFILE_NOT_SIMULATION_READY",
        reasons: [`fidelity ${fidelity.status}`, ...fidelity.blockers],
      },
      { modelId: model.id },
    );
  }

  // ENVIRONMENT
  const facts = binding.environmentFactsByModel[model.id];
  if (facts === undefined) {
    return stop(
      {
        gate: "ENVIRONMENT",
        code: "SPEC_FACTS_UNAVAILABLE_FOR_MODEL",
        reasons: [`${binding.specKey} has no facts for ${model.id}`],
      },
      { modelId: model.id },
    );
  }
  const environment = reconstructEnvironment(subject.environmentInputFor(data.data, applicability, profile));
  const publishability = assessEnvironmentPublishability(environment, facts);
  if (publishability.status !== "PUBLISHABLE") {
    return stop(
      {
        gate: "ENVIRONMENT",
        code: "ENVIRONMENT_NOT_PUBLISHABLE",
        reasons: publishability.blockers.map((blocker) => `${blocker.code}: ${blocker.detail}`),
      },
      { modelId: model.id },
    );
  }
  const translation = translateEnvironment(environment, publishability, "CURRENT_SETUP");
  if (!translation.ok) {
    return stop(
      { gate: "ENVIRONMENT", code: "ENVIRONMENT_TRANSLATION_FAILED", reasons: [...translation.problems] },
      { modelId: model.id },
    );
  }
  return {
    ok: true,
    plan: {
      specKey: binding.specKey,
      context,
      model,
      applicability,
      profile,
      character: binding.character,
      translation: translation.translation,
      observed,
    },
  };
}

/** The PRODUCTION job for one consumable variant. */
export function currentSetupJob(
  plan: PublicationPlan,
  variant: ConsumableVariant,
  policyId: string,
): SimulationOutcome<SimulationJob> {
  const character = loggedJobCharacter(plan.profile, plan.character);
  if (!character.ok) return character;
  if (!character.value.raceResolved) {
    return { ok: false, failure: { code: "PROFILE_RECONSTRUCTION_FAILED", detail: "race is not resolved" } };
  }
  const policy = simulationPolicyById(policyId);
  if (policy === undefined) {
    return { ok: false, failure: { code: "JOB_REJECTED", detail: `unknown policy ${policyId}` } };
  }
  return {
    ok: true,
    value: {
      schemaVersion: SIMULATION_JOB_SCHEMA_VERSION,
      model: { simcCommit: plan.model.pin.simcCommit, gameDataBuild: plan.model.pin.gameDataBuild },
      character: {
        profileKind: "LOGGED_RECONSTRUCTION",
        spec: character.value.spec,
        level: character.value.level,
        race: character.value.race,
        talents: character.value.talents,
        gear: [...character.value.gear],
        consumables: variant.consumables,
      },
      environment: plan.translation.environment,
      executionProfileId: PUBLICATION_EXECUTION_PROFILE_ID,
      simulationPolicy: {
        policyId: policy.id,
        iterations: policy.iterations,
        seed: policy.seed,
        threads: policy.threads,
        deterministic: true,
        timeoutMs: policy.timeoutMs,
      },
      requestedOutputs: { actionBreakdown: false, petBreakdown: false },
    },
  };
}

const byteLength = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).length;

type VariantRun =
  | {
      readonly ok: true;
      readonly result: VariantSimulation;
      readonly profileHash: string;
      readonly environmentHash: string;
      readonly executionProfileRevision: string;
    }
  | { readonly ok: false; readonly gate: PublicationGateFailure };

/**
 * Transport kinds that mean the runner or the network could not serve the job.
 * BAD_RESPONSE is NOT among them: `settleTicket` attaches it to a response
 * that failed verification (e.g. MODEL_PROVENANCE_MISMATCH), which is an
 * invalid result, not an unavailable runner.
 */
const UNAVAILABLE_TRANSPORTS: ReadonlySet<string> = new Set([
  "NETWORK",
  "AUTH_REJECTED",
  "TICKET_LOST",
  "CLIENT_DEADLINE",
  "REQUEST_REFUSED",
]);
const UNAVAILABLE_CODES: ReadonlySet<string> = new Set(["RUNNER_UNAVAILABLE", "SIMULATION_TIMEOUT"]);

async function runVariant(
  plan: PublicationPlan,
  variant: ConsumableVariant,
  policyId: string,
  deps: PublicationDeps,
): Promise<VariantRun> {
  const failure = (code: PublicationGateFailure["code"], reasons: string[]): VariantRun => ({
    ok: false,
    gate: { gate: "SIMULATION", code, reasons: [`variant ${variant.id}`, ...reasons] },
  });
  const job = currentSetupJob(plan, variant, policyId);
  if (!job.ok) return failure("JOB_CONSTRUCTION_FAILED", [`${job.failure.code}: ${job.failure.detail}`]);
  const eligibility = ceilingEligibility(job.value);
  if (!eligibility.eligible) return failure("NOT_CEILING_ELIGIBLE", [...eligibility.reasons]);
  const prepared = await prepareSimulation(
    job.value,
    byteLength(job.value),
    deps.artifacts,
    deps.simulationBindings,
  );
  if (!prepared.ok)
    return failure("JOB_PREPARATION_FAILED", [`${prepared.failure.code}: ${prepared.failure.detail}`]);
  const readiness: ReadinessAttestation = {
    schemaVersion: READINESS_ATTESTATION_SCHEMA_VERSION,
    jobClass: "PRODUCTION",
    simulationModelId: plan.model.id,
    profile: {
      hash: prepared.value.keys.profileHash,
      status: "SIMULATION_READY",
      gateRevision: GATE_REVISIONS.profile,
    },
    environment: {
      hash: prepared.value.keys.environmentHash,
      status: "PUBLISHABLE",
      gateRevision: GATE_REVISIONS.environment,
    },
  };
  const run = await deps.backend.simulate({ job: job.value, readiness });
  if (!run.outcome.ok) {
    const { code, detail } = run.outcome.failure;
    const reason = `${code}: ${detail}`;
    const transport = run.transport === undefined ? [] : [`transport ${run.transport}`];
    if (code === "SIMULATION_PRECISION_NOT_MET")
      return failure("PRECISION_INSUFFICIENT", [reason, ...transport]);
    if (run.transport === "BAD_RESPONSE") return failure("SIMULATION_RESULT_INVALID", [reason, ...transport]);
    if (
      (run.transport !== undefined && UNAVAILABLE_TRANSPORTS.has(run.transport)) ||
      UNAVAILABLE_CODES.has(code)
    ) {
      return failure("SIMULATION_UNAVAILABLE", [reason, ...transport]);
    }
    return failure("SIMULATION_RESULT_INVALID", [reason, ...transport]);
  }
  const result = run.outcome.value;
  // The verified result names the execution profile it ran; it must be the prepared one.
  if (result.executionProfile.revision !== prepared.value.keys.executionProfileRevision) {
    return failure("SIMULATION_RESULT_INVALID", [
      `execution profile revision ${result.executionProfile.revision} is not the prepared ${prepared.value.keys.executionProfileRevision}`,
    ]);
  }
  return {
    ok: true,
    profileHash: prepared.value.keys.profileHash,
    environmentHash: prepared.value.keys.environmentHash,
    executionProfileRevision: result.executionProfile.revision,
    result: {
      variantId: variant.id,
      policyId,
      escalated: policyId === PUBLICATION_ESCALATION_POLICY_ID,
      mean: result.dps.mean,
      ci95: result.dps.ci95,
      relativeStandardError: result.dps.relativeStandardError,
      iterations: result.iterations.counted,
    },
  };
}

/** Stage B. Every variant must publish, or nothing does. */
export async function runPublication(
  plan: PublicationPlan,
  deps: PublicationDeps,
): Promise<SimulationPublication> {
  const variants: VariantSimulation[] = [];
  const environmentHashes = new Set<string>();
  const executionProfileRevisions = new Set<string>();
  let profileHash: string | undefined;
  for (const variant of plan.translation.consumableVariants) {
    let run = await runVariant(plan, variant, PUBLICATION_POLICY_ID, deps);
    // The one permitted escalation: precision only, never any other failure.
    if (!run.ok && run.gate.code === "PRECISION_INSUFFICIENT") {
      run = await runVariant(plan, variant, PUBLICATION_ESCALATION_POLICY_ID, deps);
    }
    if (!run.ok) {
      return notPublished(run.gate, plan.context, plan.observed, {
        modelId: plan.model.id,
        variants,
        ...(profileHash === undefined ? {} : { profileHash }),
        environmentHashes: [...environmentHashes],
      });
    }
    variants.push(run.result);
    profileHash = run.profileHash;
    environmentHashes.add(run.environmentHash);
    executionProfileRevisions.add(run.executionProfileRevision);
  }
  const simulated = envelopeOf(variants);
  if (simulated === null) {
    return notPublished(
      {
        gate: "SIMULATION",
        code: "JOB_CONSTRUCTION_FAILED",
        reasons: ["the translation carries no consumable variant"],
      },
      plan.context,
      plan.observed,
      { modelId: plan.model.id, variants },
    );
  }
  return {
    schemaVersion: SIMULATION_PUBLICATION_SCHEMA_VERSION,
    revision: PUBLICATION_REVISION,
    status: "PUBLISHED",
    gate: null,
    context: plan.context,
    simulationModelId: plan.model.id,
    variants,
    simulated,
    observed: plan.observed,
    attainment: attainmentOf(plan.observed, simulated, ACTUAL_DPS_ENGINE_COMPARABILITY),
    provenance: {
      executionProfileId: PUBLICATION_EXECUTION_PROFILE_ID,
      executionProfileRevisions: [...executionProfileRevisions].sort(),
      profileHash: profileHash ?? null,
      environmentHashes: [...environmentHashes].sort(),
      gateRevisions: GATE_REVISIONS,
    },
  };
}

/** Stage A then stage B. */
export async function publishSimulation(
  binding: PublicationSpecBinding,
  subject: PublicationSubject,
  deps: PublicationDeps,
): Promise<SimulationPublication> {
  const readiness = await assessPublicationReadiness(binding, subject, deps);
  return readiness.ok ? runPublication(readiness.plan, deps) : readiness.publication;
}
