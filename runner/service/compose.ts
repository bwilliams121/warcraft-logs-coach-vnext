/**
 * Composition root for the runner service (M11-G3-5): ONE way to wire the
 * service, used by main.ts, the LOCAL backend and the tests, so every entry
 * point runs the same allowlist, cache verification and startup self-test.
 *
 * M11 model registry: the caller lists the ENGINES the runner hosts — each an
 * approved artifact for one registered simulation model plus its launcher.
 * There is no default engine and no default model; every engine runs its own
 * startup self-test, naming its own model.
 */

import type { EngineLauncher } from "../engine-launcher.js";
import { DEFAULT_RUNNER_LIMITS, type RunnerLimits } from "../limits.js";
import { RUNNER_MODEL_VALIDATIONS, RUNNER_SPEC_BINDINGS } from "../spec-bindings.js";
import type { SpecSimulationModelValidations } from "../../src/simulation/model-registry.js";
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
  type ServiceEngine,
} from "./service.js";

export interface EngineOption {
  /** The approved artifact this engine must prove it is (production: from APPROVED_ENGINE_ARTIFACTS). */
  readonly artifact: ApprovedEngineArtifact;
  readonly launcher: EngineLauncher;
  /** Runs before the self-test (e.g. DockerLauncher.resolveBinarySha256). */
  readonly prepareLauncher?: () => Promise<void>;
}

export interface ComposeOptions {
  /** The engines this runner hosts: at least one, at most one per simulation model. */
  readonly engines: readonly EngineOption[];
  readonly cache: SimulationCache;
  /** Required argument; null (no key configured) keeps the service NOT READY. */
  readonly cacheIntegrity: CacheIntegrity | null;
  /** Defaults to PRODUCTION only; development/test deployments enable more explicitly. */
  readonly allowedJobClasses?: ServiceDependencies["allowedJobClasses"];
  readonly capacity: RunnerCapacity;
  readonly bindings?: readonly SimulationSpecBinding[];
  /** Defaults to the spec-owned validations the runner is composed with. */
  readonly modelValidations?: readonly SpecSimulationModelValidations[];
  readonly baseLimits?: RunnerLimits;
  readonly hostLogicalCpu?: number;
  readonly clock?: ServiceDependencies["clock"];
  readonly newId?: ServiceDependencies["newId"];
  readonly log?: ServiceDependencies["log"];
  readonly setTimer?: ServiceDependencies["setTimer"];
}

export function composeSimulationService(options: ComposeOptions): SimulationService {
  const bindings = options.bindings ?? RUNNER_SPEC_BINDINGS;
  const limits = limitsForCapacity(options.capacity, options.baseLimits ?? DEFAULT_RUNNER_LIMITS);
  const engines: ServiceEngine[] = options.engines.map((option) => {
    const execute = createExecutor(option.artifact, option.launcher, bindings, limits);
    const selfTest = selfTestStartupCheck(execute, option.artifact, bindings);
    return {
      artifact: option.artifact,
      execute,
      startupCheck: async () => {
        try {
          await option.prepareLauncher?.();
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
    };
  });
  return new SimulationService({
    engines,
    bindings,
    modelValidations: options.modelValidations ?? RUNNER_MODEL_VALIDATIONS,
    capacity: options.capacity,
    policy: SERVICE_POLICY_V1,
    cache: options.cache,
    cacheIntegrity: options.cacheIntegrity,
    allowedJobClasses: options.allowedJobClasses ?? PRODUCTION_JOB_CLASSES,
    ...(options.hostLogicalCpu === undefined ? {} : { hostLogicalCpu: options.hostLogicalCpu }),
    ...(options.clock === undefined ? {} : { clock: options.clock }),
    ...(options.newId === undefined ? {} : { newId: options.newId }),
    ...(options.log === undefined ? {} : { log: options.log }),
    ...(options.setTimer === undefined ? {} : { setTimer: options.setTimer }),
  });
}
