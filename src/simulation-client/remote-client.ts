/**
 * REMOTE SIMULATION BACKEND (M11-G3-5): the Worker-side client of the private
 * runner (`simc-runner-api/1`). Worker-safe: fetch, WebCrypto, timers.
 *
 * It lives in src/simulation-client/, not src/simulation/, because it performs
 * network I/O: src/simulation stays pure (no network), and this layer imports
 * only zod-free protocol and verification code from it.
 *
 *   1. Prepare the job LOCALLY (same `prepareSimulation` as the runner). A job
 *      the runner would refuse is refused here without a request, and the
 *      expected result identity is computed from the job, not from a response.
 *   2. Sign and POST it. Every request carries a fresh nonce and timestamp.
 *   3. Poll the ticket until it is terminal or the client deadline passes.
 *      A deadline or an abort sends a signed DELETE and reports
 *      SIMULATION_TIMEOUT / CANCELLED — never a partial result.
 *   4. A poll answering NOT_FOUND means the runner lost the ticket (restart,
 *      retention). The client re-submits the same job, at most
 *      `maxResubmits` times: identity is semantic, so the re-submission is
 *      served from the durable cache or re-run to the same key.
 *   5. Settle through `settleTicket`: key, class, publishability and the full
 *      result identity are re-checked. HTTP 200 is never trust.
 *
 * Failures keep the runner's typed codes; when the TRANSPORT failed, the run
 * also says how (`transport`). Neither the secret nor a header is ever placed
 * in a failure detail.
 */

import {
  settleTicket,
  type BackendRun,
  type SimulationBackend,
  type SimulationRequest,
  type TransportFailureKind,
} from "../simulation/backend.js";
import { fail, type SimulationFailureCode } from "../simulation/failures.js";
import type { ApprovedEngineArtifact } from "../simulation/model.js";
import { expectedResultIdentity } from "../simulation/result-verification.js";
import {
  newNonce,
  RUNNER_PATHS,
  RUNNER_PROTOCOL,
  signRunnerRequest,
  simulationTicketSchema,
  submissionRejectedSchema,
  TERMINAL_STATUSES,
  type SimulationTicketView,
} from "../simulation/runner-protocol.js";
import type { SimulationSpecBinding } from "../simulation/spec-binding.js";

export interface RemoteRunnerOptions {
  /** e.g. https://simc-runner.internal.example — no trailing slash. */
  readonly baseUrl: string;
  readonly keyId: string;
  /** From the Worker's secret binding; never logged or echoed. */
  readonly secret: Uint8Array;
  /**
   * The approved artifacts the client verifies against (production:
   * APPROVED_ENGINE_ARTIFACTS). The job names its simulation model; a result is
   * verified only as that model's artifact.
   */
  readonly artifacts: readonly ApprovedEngineArtifact[];
  readonly bindings: readonly SimulationSpecBinding[];
  readonly pollIntervalMs: number;
  /** Whole-call deadline, including queueing. */
  readonly deadlineMs: number;
  readonly maxResubmits: number;
  readonly fetch?: typeof fetch;
  readonly clock?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
}

export const DEFAULT_REMOTE_TIMING = { pollIntervalMs: 1_000, deadlineMs: 300_000, maxResubmits: 2 } as const;

/** Decodes a base64 secret from a Worker secret binding (no Buffer in Workers). */
export function decodeRunnerSecret(base64: string): Uint8Array {
  const binary = atob(base64.trim());
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

type Reply =
  | { readonly kind: "TICKET"; readonly ticket: SimulationTicketView }
  | {
      readonly kind: "FAILED";
      readonly code: SimulationFailureCode;
      readonly detail: string;
      readonly transport?: TransportFailureKind;
    }
  | { readonly kind: "NOT_FOUND" };

export class RemoteSimulationBackend implements SimulationBackend {
  readonly kind = "REMOTE";
  private readonly fetchImpl: typeof fetch;
  private readonly clock: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(private readonly options: RemoteRunnerOptions) {
    this.fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
    this.clock = options.clock ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  async simulate(request: SimulationRequest, signal?: AbortSignal): Promise<BackendRun> {
    const jobBytes = new TextEncoder().encode(JSON.stringify(request.job) ?? "").byteLength;
    const expected = await expectedResultIdentity(
      request.job,
      jobBytes,
      this.options.artifacts,
      this.options.bindings,
    );
    if (!expected.ok) return { backend: "REMOTE", outcome: expected };
    const body = new TextEncoder().encode(
      JSON.stringify({
        protocol: RUNNER_PROTOCOL,
        job: request.job,
        ...(request.readiness === undefined ? {} : { readiness: request.readiness }),
      }),
    );
    const deadline = this.clock() + this.options.deadlineMs;
    let resubmits = 0;

    let reply = await this.send("POST", RUNNER_PATHS.simulations, body);
    for (;;) {
      if (reply.kind === "FAILED") {
        return {
          backend: "REMOTE",
          outcome: fail(reply.code, reply.detail),
          ...(reply.transport === undefined ? {} : { transport: reply.transport }),
        };
      }
      if (reply.kind === "NOT_FOUND") {
        if (resubmits >= this.options.maxResubmits) {
          return {
            backend: "REMOTE",
            outcome: fail("RUNNER_UNAVAILABLE", "runner lost the ticket"),
            transport: "TICKET_LOST",
          };
        }
        resubmits += 1;
        reply = await this.send("POST", RUNNER_PATHS.simulations, body);
        continue;
      }
      const ticket = reply.ticket;
      if (TERMINAL_STATUSES.includes(ticket.status)) return settleTicket("REMOTE", ticket, expected.value);
      if (signal?.aborted === true) {
        await this.send("DELETE", RUNNER_PATHS.simulation(ticket.jobId), new Uint8Array(0));
        return { backend: "REMOTE", outcome: fail("CANCELLED", "cancelled by the caller") };
      }
      if (this.clock() >= deadline) {
        await this.send("DELETE", RUNNER_PATHS.simulation(ticket.jobId), new Uint8Array(0));
        return {
          backend: "REMOTE",
          outcome: fail("SIMULATION_TIMEOUT", `no result within ${String(this.options.deadlineMs)} ms`),
          transport: "CLIENT_DEADLINE",
        };
      }
      await this.sleep(this.options.pollIntervalMs);
      reply = await this.send("GET", RUNNER_PATHS.simulation(ticket.jobId), new Uint8Array(0));
    }
  }

  private async send(method: "GET" | "POST" | "DELETE", path: string, body: Uint8Array): Promise<Reply> {
    const headers = await signRunnerRequest({
      keyId: this.options.keyId,
      secret: this.options.secret,
      method,
      path,
      body,
      timestampMs: this.clock(),
      nonce: newNonce(),
    });
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.options.baseUrl}${path}`, {
        method,
        headers: { ...headers, ...(method === "POST" ? { "content-type": "application/json" } : {}) },
        ...(method === "POST" ? { body } : {}),
      });
    } catch {
      return {
        kind: "FAILED",
        code: "RUNNER_UNAVAILABLE",
        detail: "runner unreachable",
        transport: "NETWORK",
      };
    }
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      return {
        kind: "FAILED",
        code: "SIMULATION_OUTPUT_MALFORMED",
        detail: `runner answered ${String(response.status)} without JSON`,
        transport: "BAD_RESPONSE",
      };
    }
    if (response.status === 200 || response.status === 202) {
      const ticket = simulationTicketSchema.safeParse(value);
      return ticket.success
        ? { kind: "TICKET", ticket: ticket.data as SimulationTicketView }
        : {
            kind: "FAILED",
            code: "SIMULATION_OUTPUT_MALFORMED",
            detail: "runner ticket is malformed",
            transport: "BAD_RESPONSE",
          };
    }
    if (response.status === 422 || response.status === 503) {
      const rejected = submissionRejectedSchema.safeParse(value);
      return rejected.success
        ? { kind: "FAILED", code: rejected.data.failure.code, detail: rejected.data.failure.detail }
        : {
            kind: "FAILED",
            code: "RUNNER_UNAVAILABLE",
            detail: `runner answered ${String(response.status)}`,
            transport: "BAD_RESPONSE",
          };
    }
    if (response.status === 404 && method !== "POST") return { kind: "NOT_FOUND" };
    if (response.status === 401) {
      return {
        kind: "FAILED",
        code: "RUNNER_UNAVAILABLE",
        detail: "runner refused the client's credentials",
        transport: "AUTH_REJECTED",
      };
    }
    if (response.status === 413 || response.status === 400) {
      return {
        kind: "FAILED",
        code: "JOB_REJECTED",
        detail: `runner refused the request (${String(response.status)})`,
        transport: "REQUEST_REFUSED",
      };
    }
    return {
      kind: "FAILED",
      code: "RUNNER_UNAVAILABLE",
      detail: `runner answered ${String(response.status)}`,
      transport: "BAD_RESPONSE",
    };
  }
}
