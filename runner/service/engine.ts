/**
 * The service's EXECUTOR (M11-G3-5): binds `ExecuteJob` to the unchanged G3-1
 * `runSimulationJob` with one launcher. The service queue already bounds
 * concurrency; `runSimulationJob`'s own JobSlots are sized to the same limit,
 * so a scheduling defect surfaces as RUNNER_OVERLOADED instead of an extra
 * engine process.
 */

import type { ApprovedEngineArtifact } from "../../src/simulation/model.js";
import type { SimulationSpecBinding } from "../../src/simulation/spec-binding.js";
import type { EngineLauncher } from "../engine-launcher.js";
import { JobSlots, type RunnerLimits } from "../limits.js";
import { runSimulationJob } from "../run-simulation.js";
import type { RunnerCapacity } from "./capacity.js";
import type { ExecuteJob } from "./service.js";

/** Runner limits derived from a capacity description (threads, wall time, memory). */
export function limitsForCapacity(capacity: RunnerCapacity, base: RunnerLimits): RunnerLimits {
  return {
    ...base,
    coreLimit: capacity.threadsPerJob,
    maxConcurrentJobs: capacity.maxConcurrentJobs,
    maxWallClockMs: capacity.maxWallTimeMs,
    memoryBytes: capacity.maxMemoryPerJobBytes,
  };
}

export function createExecutor(
  artifact: ApprovedEngineArtifact,
  launcher: EngineLauncher,
  bindings: readonly SimulationSpecBinding[],
  limits: RunnerLimits,
): ExecuteJob {
  const slots = new JobSlots(limits.maxConcurrentJobs);
  return async (job, rawByteLength, signal) =>
    (await runSimulationJob(job, rawByteLength, { artifact, launcher, bindings, limits, slots }, signal))
      .outcome;
}
