/**
 * RUNNER SERVICE CONFIGURATION (M11-G3-5), read once from the process
 * environment. Secrets come only from here (the deployment's secret store
 * injects them); nothing in this module logs or returns a secret value, and
 * every error names the variable, never its content.
 *
 *   SIMC_RUNNER_HMAC_KEYS     keyId:base64secret[,keyId:base64secret]   (secret, required)
 *   SIMC_RUNNER_LAUNCHER      DIRECT | DOCKER                           (required)
 *   SIMC_RUNNER_ENGINE        DIRECT: engine executable (default /opt/simc/simc)
 *   SIMC_RUNNER_IMAGE         DOCKER: sha256:<id> or name@sha256:<digest> (tags refused)
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
import { MIN_SECRET_BYTES } from "../../src/simulation/runner-protocol.js";
import { RUNNER_CAPACITIES, type RunnerCapacity } from "./capacity.js";
import { parseKeyRing } from "./auth.js";

export type LauncherConfig =
  | { readonly mode: "DIRECT"; readonly executable: string }
  | { readonly mode: "DOCKER"; readonly imageRef: string; readonly dockerExecutable: string };

export interface RunnerConfig {
  readonly keys: ReadonlyMap<string, Uint8Array>;
  readonly launcher: LauncherConfig;
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
    launcher = { mode, executable: env.SIMC_RUNNER_ENGINE ?? "/opt/simc/simc" };
  } else if (mode === "DOCKER") {
    const imageRef = env.SIMC_RUNNER_IMAGE;
    if (imageRef === undefined) throw new Error("runner config: SIMC_RUNNER_IMAGE is required for DOCKER");
    launcher = { mode, imageRef, dockerExecutable: env.SIMC_RUNNER_DOCKER ?? "docker" };
  } else {
    throw new Error("runner config: SIMC_RUNNER_LAUNCHER must be DIRECT or DOCKER");
  }
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
