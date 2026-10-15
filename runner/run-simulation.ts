/**
 * RUN ONE SIMULATION JOB (M11-G3-1): untrusted job -> typed result or typed
 * failure. The same function serves a local runner and a remote one; only the
 * launcher differs.
 *
 *   prepareSimulation (validate, resolve, build, key)
 *     -> runner limits (threads <= core limit)       JOB_REJECTED
 *     -> a free job slot                              RUNNER_OVERLOADED
 *     -> launcher (no shell, temp dir, timeout)       RUNNER_UNAVAILABLE /
 *                                                     SIMULATION_TIMEOUT /
 *                                                     SIMULATION_ENGINE_FAILED /
 *                                                     CANCELLED
 *     -> parseSimcJson (provenance, echo, precision)  MODEL_PROVENANCE_MISMATCH /
 *                                                     SIMULATION_OUTPUT_MALFORMED /
 *                                                     SIMULATION_PRECISION_NOT_MET
 */

import { fail, type SimulationOutcome } from "../src/simulation/failures.js";
import type { ApprovedEngineArtifact } from "../src/simulation/model.js";
import type { SimulationSpecBinding } from "../src/simulation/spec-binding.js";
import { prepareSimulation } from "../src/simulation/prepare.js";
import { parseSimcJson } from "../src/simulation/result-parser.js";
import type { SimulationResult } from "../src/simulation/result.js";

import type { EngineLauncher } from "./engine-launcher.js";
import type { JobSlots, RunnerLimits } from "./limits.js";

export interface RunnerDependencies {
  /** The approved artifact this runner hosts, or null when it hosts none. */
  readonly artifact: ApprovedEngineArtifact | null;
  readonly launcher: EngineLauncher;
  /** The specializations this runner simulates (see runner/spec-bindings.ts). */
  readonly bindings: readonly SimulationSpecBinding[];
  readonly limits: RunnerLimits;
  readonly slots: JobSlots;
}

export interface RunReport {
  readonly outcome: SimulationOutcome<SimulationResult>;
  /** Present when the engine ran: wall time and output size, for benchmarks. */
  readonly run?: { readonly wallMs: number; readonly jsonBytes: number };
  readonly engineRunKey?: string;
}

export async function runSimulationJob(
  value: unknown,
  rawByteLength: number,
  dependencies: RunnerDependencies,
  signal?: AbortSignal,
): Promise<RunReport> {
  if (dependencies.artifact === null) {
    return { outcome: fail("RUNNER_UNAVAILABLE", "this runner hosts no approved engine artifact") };
  }
  const prepared = await prepareSimulation(
    value,
    rawByteLength,
    dependencies.artifact,
    dependencies.bindings,
  );
  if (!prepared.ok) return { outcome: prepared };
  const { job, binding, profile, policy, input, keys } = prepared.value;
  if (policy.threads > dependencies.limits.coreLimit) {
    return {
      outcome: fail(
        "JOB_REJECTED",
        `threads ${String(policy.threads)} exceeds the runner core limit ${String(dependencies.limits.coreLimit)}`,
      ),
    };
  }

  const release = dependencies.slots.tryAcquire();
  if (release === null) return { outcome: fail("RUNNER_OVERLOADED", "all job slots are busy") };
  try {
    const launched = await dependencies.launcher.launch({
      input,
      timeoutMs: policy.timeoutMs,
      ...(signal === undefined ? {} : { signal }),
    });
    switch (launched.kind) {
      case "UNAVAILABLE":
        return { outcome: fail("RUNNER_UNAVAILABLE", launched.detail) };
      case "TIMEOUT":
        return { outcome: fail("SIMULATION_TIMEOUT", `stopped after ${String(launched.wallMs)} ms`) };
      case "CANCELLED":
        return { outcome: fail("CANCELLED", "cancelled by the caller") };
      case "ENGINE_FAILED":
        return { outcome: fail("SIMULATION_ENGINE_FAILED", launched.detail) };
      case "OUTPUT_TOO_LARGE":
        return {
          outcome: fail(
            "SIMULATION_OUTPUT_MALFORMED",
            `output: ${String(launched.bytes)} bytes exceeds the cap`,
          ),
        };
      case "COMPLETED": {
        const outcome = parseSimcJson(launched.json, launched.jsonBytes, {
          job,
          binding,
          profile,
          policy,
          approved: dependencies.artifact,
          executedBinarySha256: launched.executedBinarySha256,
          profileHash: keys.profileHash,
          environmentHash: keys.environmentHash,
        });
        return {
          outcome,
          run: { wallMs: launched.wallMs, jsonBytes: launched.jsonBytes },
          engineRunKey: keys.engineRunKey,
        };
      }
    }
  } finally {
    release();
  }
}
