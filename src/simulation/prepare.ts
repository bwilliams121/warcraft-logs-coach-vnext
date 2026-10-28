/**
 * PREPARE a simulation (M11-G3-1): the single pure path from an untrusted job
 * to engine input. The local runner, a remote runner and tests all call this
 * one function — there is no second builder or validator.
 *
 * Order: payload/schema validation (JOB_REJECTED / UNSUPPORTED_SPEC /
 * ENVIRONMENT_NOT_REPRESENTABLE) -> requested model, resolved through the
 * simulation-model registry (UNSUPPORTED_MODEL_VERSION), and the caller's
 * artifact for exactly that model (RUNNER_UNAVAILABLE) -> execution profile and policy resolved from
 * the versioned registries, where the job's policy must equal the registry
 * entry exactly (JOB_REJECTED) -> input text and cache keys.
 */

import { simulationCacheKeys, type SimulationCacheKeys } from "./cache-key.js";
import { executionProfileById, type ExecutionProfile } from "./execution-profiles.js";
import { fail, succeed, type SimulationOutcome } from "./failures.js";
import { buildSimcInput } from "./input-builder.js";
import { validateSimulationJob, type SimulationJob } from "./job.js";
import type { ApprovedEngineArtifact } from "./model.js";
import { resolveSimulationModel, type SimulationModel } from "./model-registry.js";
import { simulationPolicyById, type SimulationPolicy } from "./simulation-policy.js";
import type { SimulationSpecBinding } from "./spec-binding.js";

export interface PreparedSimulation {
  readonly job: SimulationJob;
  readonly binding: SimulationSpecBinding;
  readonly profile: ExecutionProfile;
  readonly policy: SimulationPolicy;
  readonly input: string;
  readonly keys: SimulationCacheKeys;
  /** The registered simulation model the job names. */
  readonly model: SimulationModel;
  /** The caller's artifact for that model (the one keys and verification use). */
  readonly artifact: ApprovedEngineArtifact;
}

export async function prepareSimulation(
  value: unknown,
  rawByteLength: number,
  artifacts: ApprovedEngineArtifact | readonly ApprovedEngineArtifact[],
  bindings: readonly SimulationSpecBinding[],
): Promise<SimulationOutcome<PreparedSimulation>> {
  if (typeof value === "object" && value !== null) {
    const targets = (value as { environment?: { additionalTargets?: unknown } }).environment
      ?.additionalTargets;
    if (Array.isArray(targets) && targets.length > 0) {
      return fail(
        "ENVIRONMENT_NOT_REPRESENTABLE",
        "environment.additionalTargets: no approved target-availability evidence contract",
      );
    }
  }
  const validated = validateSimulationJob(value, rawByteLength, bindings);
  if (!validated.ok) return validated;
  const { job, binding } = validated.value;

  const model = resolveSimulationModel(job.model);
  if (!model.ok) return model;
  const hosted: readonly ApprovedEngineArtifact[] = Array.isArray(artifacts)
    ? artifacts
    : [artifacts as ApprovedEngineArtifact];
  const artifact = hosted.find(
    (candidate) =>
      candidate.model.simcCommit === model.value.pin.simcCommit &&
      candidate.model.gameDataBuild === model.value.pin.gameDataBuild,
  );
  if (artifact === undefined) {
    return fail("RUNNER_UNAVAILABLE", "no approved engine artifact for the requested model");
  }

  const profile = executionProfileById(job.executionProfileId);
  if (profile === undefined)
    return fail("JOB_REJECTED", `executionProfileId: unknown ${job.executionProfileId}`);
  const policy = simulationPolicyById(job.simulationPolicy.policyId);
  if (policy === undefined)
    return fail("JOB_REJECTED", `simulationPolicy.policyId: unknown ${job.simulationPolicy.policyId}`);
  const requested = job.simulationPolicy;
  if (
    requested.iterations !== policy.iterations ||
    requested.seed !== policy.seed ||
    requested.threads !== policy.threads ||
    requested.timeoutMs !== policy.timeoutMs
  ) {
    return fail(
      "JOB_REJECTED",
      `simulationPolicy: does not match registered ${policy.id} v${String(policy.version)}`,
    );
  }

  const input = buildSimcInput(job, binding, profile, policy);
  const keys = await simulationCacheKeys(job, binding, artifact, profile, policy);
  return succeed({ job, binding, profile, policy, input, keys, model: model.value, artifact });
}
