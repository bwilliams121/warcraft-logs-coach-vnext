/**
 * Composition root for the runner service (M11-G3-5): ONE way to wire the
 * service, used by main.ts, the LOCAL backend and the tests, so every entry
 * point runs the same allowlist, cache verification and startup self-test.
 */

import { APPROVED_ENGINE_ARTIFACTS } from "../approved-artifacts.js";
import type { EngineLauncher } from "../engine-launcher.js";
import { DEFAULT_RUNNER_LIMITS, type RunnerLimits } from "../limits.js";
import { RUNNER_SPEC_BINDINGS } from "../spec-bindings.js";
import type { ApprovedEngineArtifact } from "../../src/simulation/model.js";
import type { SimulationSpecBinding } from "../../src/simulation/spec-binding.js";
import type { SimulationCache } from "./cache.js";
import type { CacheIntegrity } from "./cache-integrity.js";
import type { RunnerCapacity } from "./capacity.js";
import { createExecutor, limitsForCapacity } from "./engine.js";
import { selfTestStartupCheck } from "./self-test.js";
import {
  PRODUCTION_JOB_CLASSES,
  SERVICE_POLICY_V1,
  SimulationService,
  type ServiceDependencies,
} from "./service.js";

export interface ComposeOptions {
  readonly launcher: EngineLauncher;
  readonly cache: SimulationCache;
  /** Required argument; null (no key configured) keeps the service NOT READY. */
  readonly cacheIntegrity: CacheIntegrity | null;
  /** Defaults to PRODUCTION only; development/test deployments enable more explicitly. */
  readonly allowedJobClasses?: ServiceDependencies["allowedJobClasses"];
  readonly capacity: RunnerCapacity;
  /** Defaults to the single approved artifact; tests pass a fake-engine artifact. */
  readonly artifact?: ApprovedEngineArtifact;
  readonly bindings?: readonly SimulationSpecBinding[];
  readonly baseLimits?: RunnerLimits;
  /** Runs before the self-test (e.g. DockerLauncher.resolveBinarySha256). */
  readonly prepareLauncher?: () => Promise<void>;
  readonly hostLogicalCpu?: number;
  readonly clock?: ServiceDependencies["clock"];
  readonly newId?: ServiceDependencies["newId"];
  readonly log?: ServiceDependencies["log"];
  readonly setTimer?: ServiceDependencies["setTimer"];
}

export function composeSimulationService(options: ComposeOptions): SimulationService {
  const artifact = options.artifact ?? APPROVED_ENGINE_ARTIFACTS[0];
  if (artifact === undefined) throw new Error("runner: no approved engine artifact");
  const bindings = options.bindings ?? RUNNER_SPEC_BINDINGS;
  const limits = limitsForCapacity(options.capacity, options.baseLimits ?? DEFAULT_RUNNER_LIMITS);
  const execute = createExecutor(artifact, options.launcher, bindings, limits);
  const selfTest = selfTestStartupCheck(execute, artifact, bindings);
  return new SimulationService({
    artifact,
    bindings,
    capacity: options.capacity,
    policy: SERVICE_POLICY_V1,
    cache: options.cache,
    cacheIntegrity: options.cacheIntegrity,
    allowedJobClasses: options.allowedJobClasses ?? PRODUCTION_JOB_CLASSES,
    execute,
    startupCheck: async () => {
      try {
        await options.prepareLauncher?.();
      } catch (error) {
        return {
          ok: false,
          failure: {
            code: "RUNNER_UNAVAILABLE",
            detail: `launcher: ${(error as Error).message}`.slice(0, 300),
          },
        };
      }
      return await selfTest();
    },
    ...(options.hostLogicalCpu === undefined ? {} : { hostLogicalCpu: options.hostLogicalCpu }),
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    ...(options.newId === undefined ? {} : { newId: options.newId }),
    ...(options.log === undefined ? {} : { log: options.log }),
    ...(options.setTimer === undefined ? {} : { setTimer: options.setTimer }),
  });
}
