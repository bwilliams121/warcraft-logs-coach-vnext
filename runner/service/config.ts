/**
 * RUNNER SERVICE CONFIGURATION (M11-G3-5), read once from the process
 * environment. Secrets come only from here (the deployment's secret store
 * injects them); nothing in this module logs or returns a secret value, and
 * every error names the variable, never its content.
 *
 *   SIMC_RUNNER_HMAC_KEYS     keyId:base64secret[,keyId:base64secret]   (secret, required)
 *   SIMC_RUNNER_LAUNCHER      DIRECT | DOCKER                           (required)
 *   SIMC_RUNNER_MODELS        MODEL_ID=target[,MODEL_ID=target]         (required)
 *                             the simulation models this runner hosts (M11 model
 *                             registry), each a REGISTERED model id, at most once.
 *                             DOCKER: target must equal the model's registered
 *                             immutable image id; DIRECT: the engine executable.
 *                             Either way the binary hash is proven at startup.
 *   SIMC_RUNNER_DOCKER        DOCKER: docker CLI (default docker)
 *   SIMC_RUNNER_CACHE_DIR     durable cache directory                   (required)
 *   SIMC_RUNNER_CACHE_MAC_KEY base64 cache-integrity key, >= 32 bytes    (secret; absent -> NOT READY)
 *                             must differ from every HMAC request key (refused at load)
 *   SIMC_RUNNER_JOB_CLASSES   comma list of job classes (default PRODUCTION; development
 *                             and test deployments may add DEVELOPMENT, FIDELITY_PROBE,
 *                             DIAGNOSTIC explicitly)
 *   SIMC_RUNNER_CAPACITY      a RUNNER_CAPACITIES id (default DEV_LOCAL_CAPACITY_V1)
 *   SIMC_RUNNER_HOST          listen address (default 127.0.0.1)
 *   SIMC_RUNNER_PORT          listen port (default 8787)
 *
 * Operator configuration selects WHICH approved engine runs; a caller never
 * does. The engine's identity is still proven per run by its binary hash.
 */

import { SIMULATION_JOB_CLASSES, type SimulationJobClass } from "../../src/simulation/job-class.js";
import { simulationModelById, type SimulationModel } from "../../src/simulation/model-registry.js";
import { MIN_SECRET_BYTES } from "../../src/simulation/runner-protocol.js";
import { RUNNER_CAPACITIES, type RunnerCapacity } from "./capacity.js";
import { parseKeyRing } from "./auth.js";

export type LauncherConfig =
  { readonly mode: "DIRECT" } | { readonly mode: "DOCKER"; readonly dockerExecutable: string };

/** One hosted simulation model and where its engine is. */
export interface HostedModelConfig {
  readonly model: SimulationModel;
  /** DOCKER: the registered image id; DIRECT: the executable path. */
  readonly target: string;
}

export interface RunnerConfig {
  readonly keys: ReadonlyMap<string, Uint8Array>;
  readonly launcher: LauncherConfig;
  readonly models: readonly HostedModelConfig[];
  readonly cacheDirectory: string;
  /** Null when SIMC_RUNNER_CACHE_MAC_KEY is absent: the service reports NOT READY. */
  readonly cacheMacKey: Uint8Array | null;
  readonly allowedJobClasses: readonly SimulationJobClass[];
  readonly capacity: RunnerCapacity;
  readonly host: string;
  readonly port: number;
}

export function loadRunnerConfig(env: Readonly<Record<string, string | undefined>>): RunnerConfig {
  const keys = parseKeyRing(env.SIMC_RUNNER_HMAC_KEYS);
  const mode = env.SIMC_RUNNER_LAUNCHER;
  let launcher: LauncherConfig;
  if (mode === "DIRECT") {
    launcher = { mode };
  } else if (mode === "DOCKER") {
    launcher = { mode, dockerExecutable: env.SIMC_RUNNER_DOCKER ?? "docker" };
  } else {
    throw new Error("runner config: SIMC_RUNNER_LAUNCHER must be DIRECT or DOCKER");
  }
  const models = parseHostedModels(env.SIMC_RUNNER_MODELS, launcher.mode);
  const cacheDirectory = env.SIMC_RUNNER_CACHE_DIR;
  if (cacheDirectory === undefined || cacheDirectory === "") {
    throw new Error("runner config: SIMC_RUNNER_CACHE_DIR is required");
  }
  const capacityId = env.SIMC_RUNNER_CAPACITY ?? "DEV_LOCAL_CAPACITY_V1";
  const capacity = RUNNER_CAPACITIES.find((entry) => entry.id === capacityId);
  if (capacity === undefined) throw new Error("runner config: SIMC_RUNNER_CAPACITY names no known capacity");
  const port = Number(env.SIMC_RUNNER_PORT ?? "8787");
  if (!Number.isInteger(port) || port < 0 || port > 65_535)
    throw new Error("runner config: SIMC_RUNNER_PORT is invalid");
  const cacheMacKey = parseCacheMacKey(env.SIMC_RUNNER_CACHE_MAC_KEY, keys);
  const allowedJobClasses = parseJobClasses(env.SIMC_RUNNER_JOB_CLASSES);
  return {
    keys,
    launcher,
    models,
    cacheDirectory,
    cacheMacKey,
    allowedJobClasses,
    capacity,
    host: env.SIMC_RUNNER_HOST ?? "127.0.0.1",
    port,
  };
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.byteLength === b.byteLength && a.every((byte, index) => byte === b[index]);

/** The cache-integrity key: dedicated, never one of the request-authentication keys. */
export function parseCacheMacKey(
  value: string | undefined,
  requestKeys: ReadonlyMap<string, Uint8Array>,
): Uint8Array | null {
  if (value === undefined || value.trim() === "") return null;
  const key = Uint8Array.from(Buffer.from(value.trim(), "base64"));
  if (key.byteLength < MIN_SECRET_BYTES) {
    throw new Error(
      `runner config: SIMC_RUNNER_CACHE_MAC_KEY is shorter than ${String(MIN_SECRET_BYTES)} bytes`,
    );
  }
  if ([...requestKeys.values()].some((requestKey) => sameBytes(requestKey, key))) {
    throw new Error("runner config: SIMC_RUNNER_CACHE_MAC_KEY must not reuse an HMAC request key");
  }
  return key;
}

export function parseJobClasses(value: string | undefined): readonly SimulationJobClass[] {
  if (value === undefined || value.trim() === "") return ["PRODUCTION"];
  const classes = value.split(",").map((entry) => entry.trim());
  for (const entry of classes) {
    if (!(SIMULATION_JOB_CLASSES as readonly string[]).includes(entry)) {
      throw new Error("runner config: SIMC_RUNNER_JOB_CLASSES names an unknown job class");
    }
  }
  return [...new Set(classes)] as SimulationJobClass[];
}

/**
 * `SIMC_RUNNER_MODELS`: which registered simulation models this runner hosts.
 * An unregistered id, a repeated id, or (DOCKER) an image that is not the
 * model's registered immutable image id is refused at load — no arbitrary
 * commit or image can be configured.
 */
export function parseHostedModels(
  value: string | undefined,
  mode: "DIRECT" | "DOCKER",
): readonly HostedModelConfig[] {
  if (value === undefined || value.trim() === "")
    throw new Error("runner config: SIMC_RUNNER_MODELS is required");
  const hosted: HostedModelConfig[] = [];
  for (const entry of value.split(",")) {
    const at = entry.indexOf("=");
    const id = entry.slice(0, at).trim();
    const target = entry.slice(at + 1).trim();
    const model = at > 0 ? simulationModelById(id) : undefined;
    if (model === undefined)
      throw new Error("runner config: SIMC_RUNNER_MODELS names an unregistered simulation model");
    if (hosted.some((other) => other.model.id === model.id)) {
      throw new Error("runner config: SIMC_RUNNER_MODELS repeats a simulation model");
    }
    if (target === "") throw new Error("runner config: SIMC_RUNNER_MODELS has an empty target");
    if (mode === "DOCKER" && target !== model.imageId) {
      throw new Error(
        `runner config: SIMC_RUNNER_MODELS image for ${model.id} is not its registered image id`,
      );
    }
    hosted.push({ model, target });
  }
  return hosted;
}
