/**
 * M11-G3-5 test support: the runner service composed over the FAKE engine
 * (fake-simc.mjs), clearly fake HMAC keys, job variants per class, a
 * controllable executor for deterministic queue tests, and an in-process
 * `fetch` that drives the HTTP handler without a socket.
 *
 * The keys below are TEST-ONLY constants; they authorize nothing anywhere.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DirectLauncher, type EngineLauncher, type LaunchRequest } from "../../../runner/engine-launcher.js";
import { DEFAULT_RUNNER_LIMITS, type RunnerLimits } from "../../../runner/limits.js";
import { RUNNER_SPEC_BINDINGS } from "../../../runner/spec-bindings.js";
import { RequestAuthenticator } from "../../../runner/service/auth.js";
import { MemorySimulationCache, type SimulationCache } from "../../../runner/service/cache.js";
import { CacheIntegrity } from "../../../runner/service/cache-integrity.js";
import { DEV_LOCAL_CAPACITY_V1, type RunnerCapacity } from "../../../runner/service/capacity.js";
import { composeSimulationService } from "../../../runner/service/compose.js";
import { createExecutor, limitsForCapacity } from "../../../runner/service/engine.js";
import { RunnerHttpHandler, type HttpEvent } from "../../../runner/service/http.js";
import { selfTestStartupCheck } from "../../../runner/service/self-test.js";
import {
  SERVICE_POLICY_V1,
  SimulationService,
  type ExecuteJob,
  type ServiceEvent,
} from "../../../runner/service/service.js";
import { PROFILE_READINESS_GATE_REVISION } from "../../../src/character-profile/fidelity.js";
import { ENVIRONMENT_PUBLISHABILITY_GATE_REVISION } from "../../../src/environment/publishability.js";
import { fail } from "../../../src/simulation/failures.js";
import { SIMULATION_JOB_CLASSES, type SimulationJobClass } from "../../../src/simulation/job-class.js";
import { prepareSimulation } from "../../../src/simulation/prepare.js";
import {
  READINESS_ATTESTATION_SCHEMA_VERSION,
  type ReadinessAttestation,
} from "../../../src/simulation/readiness-attestation.js";
import { APPROVED_SIMC_MODEL, type ApprovedEngineArtifact } from "../../../src/simulation/model.js";
import { signRunnerRequest, newNonce } from "../../../src/simulation/runner-protocol.js";
import { devBloodJob, jsonBytes } from "./dev-blood-job.js";

declare const process: { execPath: string; cwd(): string };

export const FAKE = join(process.cwd(), "tests", "support", "simulation", "fake-simc.mjs");
export const FAKE_SHA = createHash("sha256").update(readFileSync(FAKE)).digest("hex");
export const FAKE_ARTIFACT: ApprovedEngineArtifact = {
  model: APPROVED_SIMC_MODEL,
  binarySha256: FAKE_SHA,
  buildRecipeRevision: "fake",
};

/** TEST-ONLY HMAC material (>= 32 bytes). Not a secret; authorizes nothing. */
export const TEST_KEY_ID = "test-key-1";
export const TEST_SECRET = new TextEncoder().encode("TEST-ONLY-runner-hmac-key-0001-not-a-secret");
export const TEST_KEY_ID_2 = "test-key-2";
export const TEST_SECRET_2 = new TextEncoder().encode("TEST-ONLY-runner-hmac-key-0002-not-a-secret");
export const TEST_KEYS: ReadonlyMap<string, Uint8Array> = new Map([[TEST_KEY_ID, TEST_SECRET]]);

/** TEST-ONLY cache-integrity key: distinct from every request key above. */
export const TEST_CACHE_MAC_SECRET = new TextEncoder().encode(
  "TEST-ONLY-cache-integrity-key-0001-not-a-secret",
);
export const testCacheIntegrity = async (): Promise<CacheIntegrity> =>
  await CacheIntegrity.fromSecret(TEST_CACHE_MAC_SECRET);

/** Development/test deployments enable every class EXPLICITLY; production runs PRODUCTION only. */
export const ALL_JOB_CLASSES: readonly SimulationJobClass[] = SIMULATION_JOB_CLASSES;

/**
 * A current PRODUCTION readiness attestation for `job`, built the way the Worker
 * would from its gate results and the gate-owned revisions. `overrides` patch it.
 */
export async function attestationFor(
  job: unknown,
  overrides: (attestation: Record<string, any>) => void = () => undefined,
): Promise<ReadinessAttestation> {
  const prepared = await prepareSimulation(job, jsonBytes(job), FAKE_ARTIFACT, RUNNER_SPEC_BINDINGS);
  if (!prepared.ok) throw new Error(prepared.failure.detail);
  const attestation: Record<string, any> = {
    schemaVersion: READINESS_ATTESTATION_SCHEMA_VERSION,
    jobClass: "PRODUCTION",
    profile: {
      hash: prepared.value.keys.profileHash,
      status: "SIMULATION_READY",
      gateRevision: PROFILE_READINESS_GATE_REVISION,
    },
    environment: {
      hash: prepared.value.keys.environmentHash,
      status: "PUBLISHABLE",
      gateRevision: ENVIRONMENT_PUBLISHABILITY_GATE_REVISION,
    },
  };
  overrides(attestation);
  return attestation as ReadinessAttestation;
}

/** Two 8-thread jobs on a declared 16-CPU test host; shallow queue for overload tests. */
export const TEST_CAPACITY: RunnerCapacity = {
  ...DEV_LOCAL_CAPACITY_V1,
  id: "TEST_CAPACITY",
  logicalCpu: 16,
  maxConcurrentJobs: 2,
  maxQueueDepth: 2,
  maxQueueWaitMs: 60_000,
};

export const TEST_LIMITS: RunnerLimits = limitsForCapacity(TEST_CAPACITY, DEFAULT_RUNNER_LIMITS);

/** A fake-engine launcher whose mode can change between launches. */
export class ModeLauncher implements EngineLauncher {
  launches = 0;
  constructor(
    public mode = "ok",
    private readonly limits: RunnerLimits = TEST_LIMITS,
  ) {}
  async launch(request: LaunchRequest) {
    this.launches += 1;
    const launcher = new DirectLauncher(
      { executable: process.execPath, leadingArgs: [FAKE, this.mode], binaryToHash: FAKE },
      this.limits,
    );
    return await launcher.launch(request);
  }
}

type Json = Record<string, any>;

/** A DEVELOPMENT Blood job on the production execution profile; `variant` changes the environment key. */
export function devJob(variant = 0, policyId = "STANDARD_SIM_V1"): Json {
  const job = devBloodJob(policyId, "ELITE_REALISTIC_V1") as Json;
  job.environment.durationMs = 60_000 + variant * 1_000;
  return job;
}

/** A PRODUCTION-class job: logged reconstruction, every provenance ACTUAL_OBSERVED. */
export function productionJob(variant = 0): Json {
  const job = devJob(variant);
  job.character.profileKind = "LOGGED_RECONSTRUCTION";
  job.character.consumables.provenance = "ACTUAL_OBSERVED";
  job.environment.raidBuffs.provenance = "ACTUAL_OBSERVED";
  job.environment.bloodlust.provenance = "ACTUAL_OBSERVED";
  return job;
}

/** A DIAGNOSTIC_RECONSTRUCTION job (never publishable). */
export function diagnosticJob(variant = 0): Json {
  const job = devJob(variant);
  job.character.profileKind = "LOGGED_RECONSTRUCTION";
  job.character.consumables.provenance = "DIAGNOSTIC_RECONSTRUCTION";
  job.environment.raidBuffs.provenance = "DIAGNOSTIC_RECONSTRUCTION";
  job.environment.bloodlust.provenance = "DIAGNOSTIC_RECONSTRUCTION";
  return job;
}

export const bytesOf = jsonBytes;

export interface Harness {
  readonly service: SimulationService;
  readonly launcher: ModeLauncher;
  readonly cache: SimulationCache;
  readonly events: ServiceEvent[];
}

/** The service as main.ts composes it, over the fake engine. */
export async function startedService(
  options: {
    mode?: string;
    cache?: SimulationCache;
    capacity?: RunnerCapacity;
    artifact?: ApprovedEngineArtifact;
    start?: boolean;
    hostLogicalCpu?: number;
    setTimer?: (callback: () => void, ms: number) => { cancel(): void };
    clock?: () => number;
    /** Default: the TEST-ONLY integrity key. Pass null to model a missing key. */
    cacheIntegrity?: CacheIntegrity | null;
    /** Default: every class (explicit development/test configuration). */
    allowedJobClasses?: readonly SimulationJobClass[];
  } = {},
): Promise<Harness> {
  const launcher = new ModeLauncher(options.mode ?? "ok");
  const cache = options.cache ?? new MemorySimulationCache();
  const events: ServiceEvent[] = [];
  const service = composeSimulationService({
    launcher,
    cache,
    cacheIntegrity:
      options.cacheIntegrity === undefined ? await testCacheIntegrity() : options.cacheIntegrity,
    allowedJobClasses: options.allowedJobClasses ?? ALL_JOB_CLASSES,
    capacity: options.capacity ?? TEST_CAPACITY,
    artifact: options.artifact ?? FAKE_ARTIFACT,
    log: (event) => events.push(event),
    ...(options.hostLogicalCpu === undefined ? {} : { hostLogicalCpu: options.hostLogicalCpu }),
    ...(options.setTimer === undefined ? {} : { setTimer: options.setTimer }),
    ...(options.clock === undefined ? {} : { clock: options.clock }),
  });
  if (options.start !== false) await service.start();
  return { service, launcher, cache, events };
}

/**
 * A controllable executor: every call waits until the test releases it (or
 * its signal aborts), then runs the REAL fake-engine executor. Lets queue tests
 * decide completion order deterministically.
 */
export class GatedExecutor {
  readonly calls: { key: number; release: () => void; signal: AbortSignal }[] = [];
  private readonly real: ExecuteJob;
  constructor(launcher: EngineLauncher = new ModeLauncher("ok")) {
    this.real = createExecutor(FAKE_ARTIFACT, launcher, RUNNER_SPEC_BINDINGS, TEST_LIMITS);
  }
  readonly execute: ExecuteJob = async (job, rawByteLength, signal) => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
      signal.addEventListener("abort", () => resolve());
    });
    this.calls.push({ key: (job as Json).environment.durationMs, release, signal });
    await gate;
    if (signal.aborted) return fail("CANCELLED", "cancelled by the caller");
    return await this.real(job, rawByteLength, signal);
  };
  get running(): number {
    return this.calls.filter((call) => !call.signal.aborted).length;
  }
}

/** A service with a GatedExecutor and a manual timer (queue-wait expiry under test control). */
export async function gatedService(
  capacity: RunnerCapacity = TEST_CAPACITY,
  cache: SimulationCache = new MemorySimulationCache(),
) {
  const gated = new GatedExecutor();
  const timers: { at: number; callback: () => void; cancelled: boolean }[] = [];
  let now = 1_000_000;
  const events: ServiceEvent[] = [];
  const service = new SimulationService({
    artifact: FAKE_ARTIFACT,
    bindings: RUNNER_SPEC_BINDINGS,
    capacity,
    policy: SERVICE_POLICY_V1,
    cache,
    cacheIntegrity: await testCacheIntegrity(),
    allowedJobClasses: ALL_JOB_CLASSES,
    execute: gated.execute,
    startupCheck: selfTestStartupCheck(
      createExecutor(FAKE_ARTIFACT, new ModeLauncher("ok"), RUNNER_SPEC_BINDINGS, TEST_LIMITS),
      FAKE_ARTIFACT,
      RUNNER_SPEC_BINDINGS,
    ),
    clock: () => now,
    log: (event) => events.push(event),
    setTimer: (callback, ms) => {
      const timer = { at: now + ms, callback, cancelled: false };
      timers.push(timer);
      return {
        cancel: () => {
          timer.cancelled = true;
        },
      };
    },
  });
  await service.start();
  const advance = (ms: number) => {
    now += ms;
    for (const timer of timers) {
      if (!timer.cancelled && timer.at <= now) {
        timer.cancelled = true;
        timer.callback();
      }
    }
  };
  return { service, gated, cache, events, advance };
}

/** Lets pending promise callbacks (service bookkeeping) run. */
export const settle = async (rounds = 5): Promise<void> => {
  for (let index = 0; index < rounds; index += 1) await new Promise((resolve) => setTimeout(resolve, 0));
};

export interface HttpHarness extends Harness {
  readonly handler: RunnerHttpHandler;
  readonly httpEvents: HttpEvent[];
  readonly authenticator: RequestAuthenticator;
}

export async function httpService(
  options: Parameters<typeof startedService>[0] & {
    keys?: ReadonlyMap<string, Uint8Array>;
    authClock?: () => number;
  } = {},
): Promise<HttpHarness> {
  const harness = await startedService(options);
  const httpEvents: HttpEvent[] = [];
  const authenticator = new RequestAuthenticator(options.keys ?? TEST_KEYS, undefined, options.authClock);
  const handler = new RunnerHttpHandler(harness.service, authenticator, (event) => httpEvents.push(event));
  return { ...harness, handler, httpEvents, authenticator };
}

/** A signed request for the handler. */
export async function signedRequest(
  method: string,
  path: string,
  body: unknown,
  options: { keyId?: string; secret?: Uint8Array; timestampMs?: number; nonce?: string } = {},
) {
  const bytes = body === undefined ? new Uint8Array(0) : new TextEncoder().encode(JSON.stringify(body));
  const headers = await signRunnerRequest({
    keyId: options.keyId ?? TEST_KEY_ID,
    secret: options.secret ?? TEST_SECRET,
    method,
    path,
    body: bytes,
    timestampMs: options.timestampMs ?? Date.now(),
    nonce: options.nonce ?? newNonce(),
  });
  return { method, target: path, headers: { ...headers } as Record<string, string | undefined>, body: bytes };
}

/** `fetch` that routes into a handler (no socket). `current()` lets a test swap the handler (restart). */
export function inProcessFetch(
  current: () => RunnerHttpHandler,
  seen: { method: string; path: string }[] = [],
): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    seen.push({ method, path: url.pathname });
    const headers: Record<string, string | undefined> = {};
    for (const [name, value] of Object.entries((init?.headers ?? {}) as Record<string, string>)) {
      headers[name.toLowerCase()] = value;
    }
    const body =
      init?.body === undefined || init.body === null ? new Uint8Array(0) : (init.body as Uint8Array);
    const response = await current().handle({ method, target: url.pathname + url.search, headers, body });
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  }) as typeof fetch;
}
