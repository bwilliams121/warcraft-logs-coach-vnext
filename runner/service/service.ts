/**
 * The PRIVATE SIMULATION SERVICE core (M11-G3-5): transport-agnostic. HTTP
 * (http.ts) and the in-process LOCAL backend (../local-backend.ts) both drive
 * THIS object, and it executes every job through the unchanged G3-1 path
 * (`runSimulationJob`: prepare -> builder -> launcher -> parseSimcJson). There
 * is no second simulation implementation.
 *
 * SUBMISSION (all before any engine work):
 *   1. prepareSimulation — schema, spec, model pin, profile/policy registries,
 *      keys (typed G3-1 failures: JOB_REJECTED, UNSUPPORTED_SPEC, ...)
 *   2. service policy — the deployment's job-class allowlist (production
 *      default: PRODUCTION only), execution-profile and policy allowlists per
 *      class, thread cap; PRODUCTION needs a current, revision-bound readiness
 *      attestation (src/simulation/readiness-attestation.ts). Refusals here
 *      happen before the cache is consulted.
 *   3. cache — the parsed-result key; an entry is served only after its MAC
 *      verifies (cache-integrity.ts) AND it re-passes result verification
 *      against the identity recomputed from THIS job
 *   4. coalescing — an in-flight execution with the same key gets the ticket
 *   5. queue — bounded FIFO; full -> RUNNER_OVERLOADED (no ticket)
 *
 * EXECUTION: at most `maxConcurrentJobs` engine runs; FIFO; a QUEUED execution
 * waiting longer than `maxQueueWaitMs` fails RUNNER_OVERLOADED.
 *
 * MODELS (M11 model registry): the service hosts one ENGINE per approved
 * simulation model it is configured with. A job names its model (`job.model`);
 * prepare resolves it through the registry and the service runs it on THAT
 * model's engine only. The service never picks a model, never substitutes
 * another, and a PRODUCTION job's spec must have validated the model
 * (SIMULATION_MODEL_NOT_VALIDATED_FOR_SPEC) and its attestation must name it.
 *
 * TICKETS vs EXECUTIONS: a ticket (the opaque job id) is one caller's handle;
 * an execution is the semantic work, shared by every ticket with the same key.
 * Cancelling a ticket detaches it; the execution is aborted only when no live
 * ticket remains (a QUEUED one is removed, a RUNNING one has its engine killed).
 * The race is decided by event order: a cancel processed before the
 * execution's terminal transition makes THAT ticket CANCELLED forever (never a
 * partial result); a cancel after it is a no-op and the result stands. A run
 * that completes despite a lost race is still cached — it is a full, valid run.
 *
 * NOT DURABLE: queued/running executions and tickets live in memory. A restart
 * loses them (polls answer NOT_FOUND); the client re-submits the same job,
 * which is safe because identity is semantic: it is served from the durable
 * cache or re-run to the same key.
 */

import { fail, type SimulationFailure, type SimulationOutcome } from "../../src/simulation/failures.js";
import {
  classifySimulationJob,
  isPublishableClass,
  type SimulationJobClass,
} from "../../src/simulation/job-class.js";
import type { ApprovedEngineArtifact } from "../../src/simulation/model.js";
import type { PreparedSimulation } from "../../src/simulation/prepare.js";
import { RESULT_PARSER_REVISION } from "../../src/simulation/result-parser.js";
import type { SimulationResult } from "../../src/simulation/result.js";
import {
  isModelValidatedForSpec,
  type SpecSimulationModelValidations,
} from "../../src/simulation/model-registry.js";
import { checkReadinessAttestation } from "../../src/simulation/readiness-attestation.js";
import {
  expectedResultIdentity,
  verifySimulationResult,
  type ExpectedResultIdentity,
} from "../../src/simulation/result-verification.js";
import {
  RUNNER_PROTOCOL,
  RUNNER_SERVICE_REVISION,
  type CacheStatus,
  type SimulationJobStatus,
  type SimulationTicketView,
  type SubmissionRejected,
} from "../../src/simulation/runner-protocol.js";
import type { SimulationSpecBinding } from "../../src/simulation/spec-binding.js";
import { CACHE_ENTRY_SCHEMA, type CachedSimulation, type SimulationCache } from "./cache.js";
import type { CacheIntegrity } from "./cache-integrity.js";
import { capacityProblem, hostCapacityProblem, type RunnerCapacity } from "./capacity.js";

/** Execution profile and policy allowlists per job class. */
export interface ServicePolicy {
  readonly id: string;
  readonly byClass: Readonly<
    Record<
      SimulationJobClass,
      { readonly executionProfiles: readonly string[]; readonly policies: readonly string[] }
    >
  >;
}

/** v1: the production profile and the two approved policies; fidelity probes keep their own. */
export const SERVICE_POLICY_V1: ServicePolicy = {
  id: "SERVICE_POLICY_V1",
  byClass: {
    PRODUCTION: {
      executionProfiles: ["ELITE_REALISTIC_V1"],
      policies: ["STANDARD_SIM_V1", "PRECISION_ESCALATED_V1"],
    },
    DIAGNOSTIC: {
      executionProfiles: ["ELITE_REALISTIC_V1"],
      policies: ["STANDARD_SIM_V1", "PRECISION_ESCALATED_V1"],
    },
    DEVELOPMENT: {
      executionProfiles: ["ELITE_REALISTIC_V1"],
      policies: ["STANDARD_SIM_V1", "PRECISION_ESCALATED_V1"],
    },
    FIDELITY_PROBE: { executionProfiles: ["SIMC_DEFAULT_PINNED"], policies: ["FIDELITY_PROBE_V1"] },
  },
};

/** Production deployment default: only publishable work runs. */
export const PRODUCTION_JOB_CLASSES: readonly SimulationJobClass[] = ["PRODUCTION"];

/** Why a cache entry was refused. It is dropped and the job recomputed; never served. */
export const CACHE_REJECTION_CODES = [
  "CACHE_ENTRY_MALFORMED",
  "CACHE_INTEGRITY_FAILED",
  "CACHE_RESULT_UNVERIFIED",
] as const;
export type CacheRejectionCode = (typeof CACHE_REJECTION_CODES)[number];

export type CacheReadOutcome =
  | { readonly kind: "ABSENT" }
  | { readonly kind: "VALID"; readonly result: SimulationResult }
  | { readonly kind: "REFUSED"; readonly code: CacheRejectionCode; readonly detail: string };

/** One engine run for a prepared job: the G3-1 path (see local-backend / main for the binding). */
export type ExecuteJob = (
  job: unknown,
  rawByteLength: number,
  signal: AbortSignal,
) => Promise<SimulationOutcome<SimulationResult>>;

export interface ServiceEvent {
  readonly event:
    | "SUBMISSION_REFUSED"
    | "CACHE_HIT"
    | "CACHE_REJECTED"
    | "COALESCED"
    | "QUEUED"
    | "STARTED"
    | "FINISHED"
    | "TICKET_CANCELLED"
    | "QUEUE_WAIT_EXPIRED"
    | "STARTUP_VERIFIED"
    | "STARTUP_FAILED"
    | "SHUTDOWN";
  /** Ticket id (transport identifier). */
  readonly jobId?: string;
  /** The first 12 hex characters of the semantic key — never the job. */
  readonly key?: string;
  readonly status?: SimulationJobStatus;
  readonly code?: string;
  readonly queueWaitMs?: number;
  readonly runtimeMs?: number;
}

/** One hosted engine: an approved artifact, how to run a job on it, and how to verify it at startup. */
export interface ServiceEngine {
  readonly artifact: ApprovedEngineArtifact;
  readonly execute: ExecuteJob;
  /** Verifies the engine artifact at startup (a self-test job through `execute`). */
  readonly startupCheck: () => Promise<SimulationOutcome<unknown>>;
}

export interface ServiceDependencies {
  /** The engines this runner hosts, at most one per simulation model. */
  readonly engines: readonly ServiceEngine[];
  readonly bindings: readonly SimulationSpecBinding[];
  /** Spec-owned production validations of simulation models (the composition root's set). */
  readonly modelValidations: readonly SpecSimulationModelValidations[];
  readonly capacity: RunnerCapacity;
  readonly policy: ServicePolicy;
  readonly cache: SimulationCache;
  /** Null when no cache-integrity key is configured: the service is then NOT READY. */
  readonly cacheIntegrity: CacheIntegrity | null;
  /** Job classes this deployment runs (production: PRODUCTION_JOB_CLASSES). */
  readonly allowedJobClasses: readonly SimulationJobClass[];
  readonly clock?: () => number;
  readonly newId?: () => string;
  readonly log?: (event: ServiceEvent) => void;
  readonly setTimer?: (callback: () => void, ms: number) => { cancel(): void };
  /** The host's logical CPUs; a capacity claiming more is NOT READY. Omit only in tests. */
  readonly hostLogicalCpu?: number;
}

export interface SubmitInput {
  readonly job: unknown;
  readonly rawByteLength: number;
  /** Untrusted; validated by checkReadinessAttestation for PRODUCTION jobs. */
  readonly readiness?: unknown;
}

export type Submission =
  | { readonly accepted: true; readonly ticket: SimulationTicketView }
  | { readonly accepted: false; readonly rejected: SubmissionRejected };

interface Execution {
  readonly id: string;
  /** The engine of the model the job names. */
  readonly engine: ServiceEngine;
  readonly key: string;
  readonly engineRunKey: string;
  readonly job: unknown;
  readonly rawByteLength: number;
  readonly jobClass: SimulationJobClass;
  status: SimulationJobStatus;
  outcome: SimulationOutcome<SimulationResult> | null;
  readonly controller: AbortController;
  readonly tickets: Set<string>;
  readonly queuedAt: number;
  startedAt: number | null;
  expiry: { cancel(): void } | null;
  readonly settled: Promise<void>;
  settle: () => void;
}

interface Ticket {
  readonly id: string;
  readonly executionId: string;
  readonly cacheStatus: CacheStatus;
  cancelled: boolean;
  readonly createdAt: number;
}

export interface ServiceMetrics {
  readonly queueDepth: number;
  readonly running: number;
  readonly counters: Readonly<Record<string, number>>;
  readonly queueWaitMs: { readonly count: number; readonly total: number; readonly max: number };
  readonly runtimeMs: { readonly count: number; readonly total: number; readonly max: number };
}

export interface ServiceReadiness {
  readonly ready: boolean;
  readonly checks: {
    readonly startupVerification: "PENDING" | "PASSED" | "FAILED";
    readonly capacity: "OK" | "INVALID";
    readonly cache: "OK" | "INVALID";
    readonly jobClasses: "OK" | "INVALID";
    readonly accepting: boolean;
  };
  readonly detail: readonly string[];
}

const short = (key: string): string => key.slice(0, 12);

export class SimulationService {
  private readonly clock: () => number;
  private readonly newId: () => string;
  private readonly log: (event: ServiceEvent) => void;
  private readonly setTimer: (callback: () => void, ms: number) => { cancel(): void };
  private readonly executions = new Map<string, Execution>();
  private readonly tickets = new Map<string, Ticket>();
  private readonly inFlightByKey = new Map<string, string>();
  private readonly queue: string[] = [];
  private running = 0;
  private accepting = true;
  private startup: "PENDING" | "PASSED" | "FAILED" = "PENDING";
  private startupDetail = "";
  private readonly counters: Record<string, number> = {};
  private readonly waits = { count: 0, total: 0, max: 0 };
  private readonly runtimes = { count: 0, total: 0, max: 0 };

  constructor(private readonly deps: ServiceDependencies) {
    this.clock = deps.clock ?? Date.now;
    this.newId = deps.newId ?? (() => crypto.randomUUID());
    this.log = deps.log ?? (() => undefined);
    this.setTimer =
      deps.setTimer ??
      ((callback, ms) => {
        const handle = setTimeout(callback, ms);
        return { cancel: () => clearTimeout(handle) };
      });
  }

  // ---------------------------------------------------------------- lifecycle

  private capacityIssue(): string | null {
    return (
      capacityProblem(this.deps.capacity) ??
      (this.deps.hostLogicalCpu === undefined
        ? null
        : hostCapacityProblem(this.deps.capacity, this.deps.hostLogicalCpu))
    );
  }

  /** Verifies the engine artifact before the service reports READY. */
  async start(): Promise<ServiceReadiness> {
    const capacity = this.capacityIssue();
    if (capacity !== null) {
      this.startup = "FAILED";
      this.startupDetail = `capacity: ${capacity}`;
      this.log({ event: "STARTUP_FAILED", code: "CAPACITY" });
      return this.readiness();
    }
    const models = this.deps.engines.map(
      (engine) => `${engine.artifact.model.simcCommit}/${engine.artifact.model.gameDataBuild}`,
    );
    if (this.deps.engines.length === 0 || new Set(models).size !== models.length) {
      this.startup = "FAILED";
      this.startupDetail = "engines: at least one, and at most one per simulation model";
      this.log({ event: "STARTUP_FAILED", code: "ENGINES" });
      return this.readiness();
    }
    // Every hosted engine must verify; one failing engine keeps the whole runner NOT READY.
    const failures: string[] = [];
    for (const engine of this.deps.engines) {
      const checked = await engine.startupCheck();
      if (!checked.ok) {
        failures.push(
          `${engine.artifact.model.simcCommit.slice(0, 8)}: ${checked.failure.code}: ${checked.failure.detail}`,
        );
        this.log({ event: "STARTUP_FAILED", code: checked.failure.code });
      }
    }
    if (failures.length === 0) {
      this.startup = "PASSED";
      this.log({ event: "STARTUP_VERIFIED" });
    } else {
      this.startup = "FAILED";
      this.startupDetail = failures.join(" | ").slice(0, 600);
    }
    return this.readiness();
  }

  readiness(): ServiceReadiness {
    const capacity = this.capacityIssue();
    const cache =
      this.deps.cache.configurationProblem() ??
      (this.deps.cacheIntegrity === null ? "cache integrity key not configured" : null);
    const jobClasses =
      this.deps.allowedJobClasses.length === 0 ? "no job class is enabled on this runner" : null;
    const detail = [
      ...(this.startup === "FAILED" ? [`startup verification: ${this.startupDetail}`] : []),
      ...(capacity === null ? [] : [`capacity: ${capacity}`]),
      ...(cache === null ? [] : [`cache: ${cache}`]),
      ...(jobClasses === null ? [] : [`job classes: ${jobClasses}`]),
      ...(this.accepting ? [] : ["shutting down"]),
    ];
    return {
      ready:
        this.startup === "PASSED" &&
        capacity === null &&
        cache === null &&
        jobClasses === null &&
        this.accepting,
      checks: {
        startupVerification: this.startup,
        capacity: capacity === null ? "OK" : "INVALID",
        cache: cache === null ? "OK" : "INVALID",
        jobClasses: jobClasses === null ? "OK" : "INVALID",
        accepting: this.accepting,
      },
      detail,
    };
  }

  /**
   * Graceful shutdown: refuse new work, let running executions finish for up
   * to `graceMs`, then cancel everything left (killing engines) and wait for
   * every execution to settle, so no engine process or temp directory is left.
   */
  async shutdown(graceMs: number): Promise<void> {
    this.accepting = false;
    this.log({ event: "SHUTDOWN" });
    for (const id of [...this.queue]) this.abortExecution(id, "service shutting down");
    const running = [...this.executions.values()].filter((execution) => execution.status === "RUNNING");
    await Promise.race([
      Promise.all(running.map((execution) => execution.settled)),
      new Promise<void>((resolve) => {
        this.setTimer(resolve, graceMs);
      }),
    ]);
    for (const execution of this.executions.values()) {
      if (execution.status === "RUNNING") execution.controller.abort();
    }
    await Promise.all([...this.executions.values()].map((execution) => execution.settled));
  }

  // ---------------------------------------------------------------- submit

  async submit(input: SubmitInput): Promise<Submission> {
    if (!this.readiness().ready) {
      return this.reject(fail("RUNNER_UNAVAILABLE", "runner is not ready"));
    }
    const expected = await expectedResultIdentity(
      input.job,
      input.rawByteLength,
      this.deps.engines.map((engine) => engine.artifact),
      this.deps.bindings,
    );
    if (!expected.ok) return this.reject(expected);
    const prepared = expected.value.prepared;
    const policyFailure = this.policyFailure(prepared, input.readiness);
    if (policyFailure !== null) return this.reject(policyFailure);
    const jobClass = classifySimulationJob(prepared.job);
    const key = prepared.keys.parsedResultKey;
    this.prune();

    // Cache: served only after the MAC and the re-verification against THIS job's identity.
    const cached = await this.readCache(expected.value);
    if (cached.kind === "VALID") {
      const execution = this.newExecution(prepared, input, jobClass);
      this.finish(execution, { ok: true, value: cached.result });
      this.count("cacheHits");
      const ticket = this.newTicket(execution, "HIT");
      this.log({ event: "CACHE_HIT", jobId: ticket.id, key: short(key) });
      return { accepted: true, ticket: this.view(ticket) };
    }
    if (cached.kind === "REFUSED") {
      this.count("cacheRejected");
      if (cached.code === "CACHE_INTEGRITY_FAILED") this.count("cacheIntegrityFailures");
      this.log({ event: "CACHE_REJECTED", key: short(key), code: cached.code });
      await this.deps.cache.delete(key);
    }

    // Coalesce onto in-flight work with the same semantic key.
    const inFlight = this.inFlightByKey.get(key);
    if (inFlight !== undefined) {
      const execution = this.executions.get(inFlight);
      if (execution !== undefined && (execution.status === "QUEUED" || execution.status === "RUNNING")) {
        const ticket = this.newTicket(execution, "COALESCED");
        this.count("coalesced");
        this.log({ event: "COALESCED", jobId: ticket.id, key: short(key) });
        return { accepted: true, ticket: this.view(ticket) };
      }
    }

    if (this.queue.length >= this.deps.capacity.maxQueueDepth) {
      this.count("rejectedOverload");
      return this.reject(
        fail("RUNNER_OVERLOADED", `queue full (${String(this.deps.capacity.maxQueueDepth)})`),
      );
    }
    const execution = this.newExecution(prepared, input, jobClass);
    this.inFlightByKey.set(key, execution.id);
    this.queue.push(execution.id);
    execution.expiry = this.setTimer(() => {
      if (execution.status !== "QUEUED") return;
      this.removeQueued(execution.id);
      this.finish(
        execution,
        fail("RUNNER_OVERLOADED", `queued longer than ${String(this.deps.capacity.maxQueueWaitMs)} ms`),
      );
      this.log({ event: "QUEUE_WAIT_EXPIRED", key: short(key) });
    }, this.deps.capacity.maxQueueWaitMs);
    this.count("cacheMisses");
    const ticket = this.newTicket(execution, "MISS");
    this.log({ event: "QUEUED", jobId: ticket.id, key: short(key) });
    this.pump();
    return { accepted: true, ticket: this.view(ticket) };
  }

  /**
   * The typed cache read: shape -> MAC (constant-time) -> result verification.
   * Anything but VALID is never served.
   */
  private async readCache(expected: ExpectedResultIdentity): Promise<CacheReadOutcome> {
    const keys = expected.prepared.keys;
    let entry: CachedSimulation | null;
    try {
      entry = await this.deps.cache.get(keys.parsedResultKey);
    } catch {
      return { kind: "REFUSED", code: "CACHE_ENTRY_MALFORMED", detail: "cache read failed" };
    }
    if (entry === null) return { kind: "ABSENT" };
    const record = entry as Partial<CachedSimulation> | null;
    if (
      typeof record !== "object" ||
      record === null ||
      record.schema !== CACHE_ENTRY_SCHEMA ||
      record.cacheKey !== keys.parsedResultKey ||
      record.engineRunKey !== keys.engineRunKey ||
      typeof record.result !== "object" ||
      record.result === null
    ) {
      return { kind: "REFUSED", code: "CACHE_ENTRY_MALFORMED", detail: "cache entry schema or keys" };
    }
    const integrity = this.deps.cacheIntegrity;
    const subject = {
      cacheKey: keys.parsedResultKey,
      engineRunKey: keys.engineRunKey,
      result: record.result,
    };
    if (integrity === null || !(await integrity.verify(subject, record.resultMac))) {
      return { kind: "REFUSED", code: "CACHE_INTEGRITY_FAILED", detail: "cache entry MAC does not verify" };
    }
    const verified = verifySimulationResult(record.result, expected);
    return verified.ok
      ? { kind: "VALID", result: verified.value }
      : {
          kind: "REFUSED",
          code: "CACHE_RESULT_UNVERIFIED",
          detail: `${verified.failure.code}: ${verified.failure.detail}`.slice(0, 300),
        };
  }

  /** The hosted engine for the prepared job's model (prepare already proved one exists). */
  private engineFor(prepared: PreparedSimulation): ServiceEngine {
    const engine = this.deps.engines.find((candidate) => candidate.artifact === prepared.artifact);
    if (engine === undefined) throw new Error("prepared artifact is not hosted");
    return engine;
  }

  private policyFailure(prepared: PreparedSimulation, readiness: unknown): SimulationOutcome<never> | null {
    const job = prepared.job;
    const jobClass = classifySimulationJob(job);
    if (!this.deps.allowedJobClasses.includes(jobClass)) {
      return fail("JOB_REJECTED", `job class ${jobClass} is not enabled on this runner`);
    }
    const allowed = this.deps.policy.byClass[jobClass];
    if (!allowed.executionProfiles.includes(job.executionProfileId)) {
      return fail(
        "JOB_REJECTED",
        `executionProfileId: ${job.executionProfileId} is not allowed for ${jobClass} jobs`,
      );
    }
    if (!allowed.policies.includes(job.simulationPolicy.policyId)) {
      return fail(
        "JOB_REJECTED",
        `simulationPolicy: ${job.simulationPolicy.policyId} is not allowed for ${jobClass} jobs`,
      );
    }
    if (prepared.policy.threads > this.deps.capacity.threadsPerJob) {
      return fail(
        "JOB_REJECTED",
        `threads ${String(prepared.policy.threads)} exceed the runner's ${String(this.deps.capacity.threadsPerJob)}`,
      );
    }
    if (prepared.policy.timeoutMs > this.deps.capacity.maxWallTimeMs) {
      return fail("JOB_REJECTED", "policy timeout exceeds the runner's wall-time limit");
    }
    if (jobClass !== "PRODUCTION") {
      return readiness === undefined
        ? null
        : fail("JOB_REJECTED", `a ${jobClass} job carries no readiness attestation`);
    }
    if (!isModelValidatedForSpec(this.deps.modelValidations, job.character.spec, prepared.model.id)) {
      return fail(
        "SIMULATION_MODEL_NOT_VALIDATED_FOR_SPEC",
        `${job.character.spec} has not validated simulation model ${prepared.model.id} for production`,
      );
    }
    return checkReadinessAttestation(readiness, { ...prepared.keys, simulationModelId: prepared.model.id });
  }

  // ---------------------------------------------------------------- status / cancel

  status(jobId: string): SimulationTicketView | null {
    this.prune();
    const ticket = this.tickets.get(jobId);
    return ticket === undefined ? null : this.view(ticket);
  }

  /** Resolves when the ticket is terminal (CANCELLED as soon as it is cancelled). */
  async waitFor(jobId: string): Promise<SimulationTicketView | null> {
    const ticket = this.tickets.get(jobId);
    if (ticket === undefined) return null;
    const execution = this.executions.get(ticket.executionId);
    if (execution !== undefined && !ticket.cancelled) await execution.settled;
    return this.view(ticket);
  }

  cancel(jobId: string): SimulationTicketView | null {
    const ticket = this.tickets.get(jobId);
    if (ticket === undefined) return null;
    const execution = this.executions.get(ticket.executionId);
    if (execution === undefined || ticket.cancelled) return this.view(ticket);
    if (execution.status !== "QUEUED" && execution.status !== "RUNNING") return this.view(ticket); // result stands
    ticket.cancelled = true;
    this.count("cancellations");
    this.log({ event: "TICKET_CANCELLED", jobId, key: short(execution.key), status: execution.status });
    const live = [...execution.tickets].some((id) => this.tickets.get(id)?.cancelled === false);
    if (!live) this.abortExecution(execution.id, "cancelled by the caller");
    return this.view(ticket);
  }

  private abortExecution(executionId: string, detail: string): void {
    const execution = this.executions.get(executionId);
    if (execution === undefined) return;
    if (execution.status === "QUEUED") {
      this.removeQueued(execution.id);
      this.finish(execution, fail("CANCELLED", detail));
    } else if (execution.status === "RUNNING") {
      execution.controller.abort();
    }
  }

  // ---------------------------------------------------------------- execution

  private pump(): void {
    while (this.running < this.deps.capacity.maxConcurrentJobs && this.queue.length > 0) {
      const id = this.queue.shift();
      const execution = id === undefined ? undefined : this.executions.get(id);
      if (execution === undefined || execution.status !== "QUEUED") continue;
      this.start_(execution);
    }
  }

  private start_(execution: Execution): void {
    execution.status = "RUNNING";
    execution.expiry?.cancel();
    execution.startedAt = this.clock();
    this.running += 1;
    const waited = execution.startedAt - execution.queuedAt;
    this.observe(this.waits, waited);
    this.log({ event: "STARTED", key: short(execution.key), queueWaitMs: waited });
    void execution.engine
      .execute(execution.job, execution.rawByteLength, execution.controller.signal)
      .catch((error: unknown) =>
        fail<SimulationResult>(
          "SIMULATION_ENGINE_FAILED",
          `runner: ${String((error as Error)?.message ?? error)}`.slice(0, 300),
        ),
      )
      .then(async (outcome) => {
        this.running -= 1;
        const runtime = this.clock() - (execution.startedAt ?? this.clock());
        this.observe(this.runtimes, runtime);
        const integrity = this.deps.cacheIntegrity;
        if (outcome.ok && integrity !== null) {
          await integrity
            .mac({ cacheKey: execution.key, engineRunKey: execution.engineRunKey, result: outcome.value })
            .then((resultMac) =>
              this.deps.cache.put({
                schema: CACHE_ENTRY_SCHEMA,
                cacheKey: execution.key,
                engineRunKey: execution.engineRunKey,
                result: outcome.value,
                resultMac,
                createdAt: new Date(this.clock()).toISOString(),
                modelIdentity: outcome.value.model,
                parserRevision: RESULT_PARSER_REVISION,
              }),
            )
            .catch(() => this.count("cacheWriteFailures"));
        }
        this.finish(execution, outcome);
        this.log({
          event: "FINISHED",
          key: short(execution.key),
          status: execution.status,
          ...(outcome.ok ? {} : { code: outcome.failure.code }),
          runtimeMs: runtime,
        });
        this.pump();
      });
  }

  private finish(execution: Execution, outcome: SimulationOutcome<SimulationResult>): void {
    if (execution.status === "SUCCEEDED" || execution.status === "FAILED" || execution.status === "CANCELLED")
      return;
    execution.expiry?.cancel();
    execution.outcome = outcome;
    execution.status = outcome.ok
      ? "SUCCEEDED"
      : outcome.failure.code === "CANCELLED"
        ? "CANCELLED"
        : "FAILED";
    if (this.inFlightByKey.get(execution.key) === execution.id) this.inFlightByKey.delete(execution.key);
    if (!outcome.ok) {
      const code = outcome.failure.code;
      this.count(
        code === "SIMULATION_TIMEOUT"
          ? "timeouts"
          : code === "SIMULATION_ENGINE_FAILED"
            ? "engineFailures"
            : `failed:${code}`,
      );
    } else {
      this.count("succeeded");
    }
    execution.settle();
  }

  private removeQueued(executionId: string): void {
    const index = this.queue.indexOf(executionId);
    if (index >= 0) this.queue.splice(index, 1);
  }

  // ---------------------------------------------------------------- records

  private newExecution(
    prepared: PreparedSimulation,
    input: SubmitInput,
    jobClass: SimulationJobClass,
  ): Execution {
    let settle: () => void = () => undefined;
    const settled = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const execution: Execution = {
      id: this.newId(),
      key: prepared.keys.parsedResultKey,
      engineRunKey: prepared.keys.engineRunKey,
      engine: this.engineFor(prepared),
      job: input.job,
      rawByteLength: input.rawByteLength,
      jobClass,
      status: "QUEUED",
      outcome: null,
      controller: new AbortController(),
      tickets: new Set(),
      queuedAt: this.clock(),
      startedAt: null,
      expiry: null,
      settled,
      settle,
    };
    this.executions.set(execution.id, execution);
    return execution;
  }

  private newTicket(execution: Execution, cacheStatus: CacheStatus): Ticket {
    const ticket: Ticket = {
      id: this.newId(),
      executionId: execution.id,
      cacheStatus,
      cancelled: false,
      createdAt: this.clock(),
    };
    this.tickets.set(ticket.id, ticket);
    execution.tickets.add(ticket.id);
    this.count("submitted");
    return ticket;
  }

  private view(ticket: Ticket): SimulationTicketView {
    const execution = this.executions.get(ticket.executionId);
    if (execution === undefined) throw new Error("ticket without execution");
    const base = {
      protocol: RUNNER_PROTOCOL,
      serviceRevision: RUNNER_SERVICE_REVISION,
      jobId: ticket.id,
      jobClass: execution.jobClass,
      publishable: isPublishableClass(execution.jobClass),
      cacheStatus: ticket.cacheStatus,
      cacheKey: execution.key,
    } as const;
    if (ticket.cancelled) {
      // Cancelled before the execution finished: this ticket never returns a (late) result.
      return {
        ...base,
        status: "CANCELLED",
        failure: { code: "CANCELLED", detail: "cancelled by the caller" },
      };
    }
    const outcome = execution.outcome;
    if (outcome === null) return { ...base, status: execution.status };
    return outcome.ok
      ? { ...base, status: "SUCCEEDED", result: outcome.value }
      : { ...base, status: execution.status, failure: outcome.failure };
  }

  private reject(outcome: SimulationOutcome<unknown>): Submission {
    const failure: SimulationFailure = outcome.ok
      ? { code: "JOB_REJECTED", detail: "unexpected" }
      : outcome.failure;
    this.count(`rejected:${failure.code}`);
    this.log({ event: "SUBMISSION_REFUSED", code: failure.code });
    return {
      accepted: false,
      rejected: {
        protocol: RUNNER_PROTOCOL,
        serviceRevision: RUNNER_SERVICE_REVISION,
        status: "REFUSED",
        failure,
      },
    };
  }

  /** Forgets terminal tickets past retention, oldest first, and executions no ticket references. */
  private prune(): void {
    const now = this.clock();
    const terminal = (ticket: Ticket) => {
      const execution = this.executions.get(ticket.executionId);
      return (
        ticket.cancelled ||
        execution === undefined ||
        !(execution.status === "QUEUED" || execution.status === "RUNNING")
      );
    };
    const removable = [...this.tickets.values()].filter(terminal);
    const excess = this.tickets.size - this.deps.capacity.maxRetainedTickets;
    removable.forEach((ticket, index) => {
      if (now - ticket.createdAt > this.deps.capacity.ticketRetentionMs || index < excess) {
        this.tickets.delete(ticket.id);
        this.executions.get(ticket.executionId)?.tickets.delete(ticket.id);
      }
    });
    for (const [id, execution] of this.executions) {
      const live = execution.status === "QUEUED" || execution.status === "RUNNING";
      if (!live && execution.tickets.size === 0) this.executions.delete(id);
    }
  }

  // ---------------------------------------------------------------- metrics

  private count(name: string): void {
    this.counters[name] = (this.counters[name] ?? 0) + 1;
  }

  private observe(target: { count: number; total: number; max: number }, value: number): void {
    target.count += 1;
    target.total += value;
    target.max = Math.max(target.max, value);
  }

  metrics(): ServiceMetrics {
    return {
      queueDepth: this.queue.length,
      running: this.running,
      counters: { ...this.counters },
      queueWaitMs: { ...this.waits },
      runtimeMs: { ...this.runtimes },
    };
  }

  /** For tests and shutdown checks: executions that hold capacity. */
  get liveExecutions(): number {
    return [...this.executions.values()].filter(
      (execution) => execution.status === "QUEUED" || execution.status === "RUNNING",
    ).length;
  }
}
