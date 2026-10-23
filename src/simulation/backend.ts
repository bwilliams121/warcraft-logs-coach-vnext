/**
 * SIMULATION BACKENDS (M11-G3-5): how an application service obtains a
 * SimulationResult. Two implementations with ONE contract:
 *
 *   LOCAL   runner/local-backend.ts — the runner service in this process
 *   REMOTE  remote-client.ts        — the private runner over signed HTTP
 *
 * Both finish through `settleTicket`, which re-derives everything it trusts
 * from the job: the semantic key, the job class (and so publishability) and
 * the full result identity (result-verification.ts). A ticket that disagrees
 * with the job — a different key, a class the job does not have, a result for
 * another model, profile, environment, policy or parser — is refused with a
 * typed failure. So LOCAL and REMOTE cannot differ in what they accept.
 *
 * How the result was served (MISS / HIT / COALESCED) travels BESIDE the
 * outcome and never changes it. Worker-safe.
 */

import { fail, type SimulationFailure, type SimulationOutcome } from "./failures.js";
import { classifySimulationJob, isPublishableClass, type SimulationJobClass } from "./job-class.js";
import type { SimulationResult } from "./result.js";
import { verifySimulationResult, type ExpectedResultIdentity } from "./result-verification.js";
import type { ReadinessAttestation } from "./readiness-attestation.js";
import type { CacheStatus, SimulationTicketView } from "./runner-protocol.js";

export type BackendKind = "LOCAL" | "REMOTE";

/** Where a REMOTE failure arose, when it was the transport rather than the runner. */
export type TransportFailureKind =
  "NETWORK" | "AUTH_REJECTED" | "BAD_RESPONSE" | "TICKET_LOST" | "CLIENT_DEADLINE" | "REQUEST_REFUSED";

export interface BackendRun {
  readonly backend: BackendKind;
  readonly outcome: SimulationOutcome<SimulationResult>;
  /** Present when the runner accepted the job (a ticket existed). */
  readonly served?: {
    readonly cacheStatus: CacheStatus;
    readonly cacheKey: string;
    readonly jobClass: SimulationJobClass;
    readonly publishable: boolean;
  };
  readonly transport?: TransportFailureKind;
}

export interface SimulationRequest {
  readonly job: unknown;
  readonly readiness?: ReadinessAttestation;
}

export interface SimulationBackend {
  readonly kind: BackendKind;
  simulate(request: SimulationRequest, signal?: AbortSignal): Promise<BackendRun>;
}

const TERMINAL = new Set(["SUCCEEDED", "FAILED", "CANCELLED"]);

/** Accepts a terminal ticket for `expected`'s job only if it is consistent with that job. */
export function settleTicket(
  backend: BackendKind,
  ticket: SimulationTicketView,
  expected: ExpectedResultIdentity,
): BackendRun {
  const refuse = (code: SimulationFailure["code"], detail: string): BackendRun => ({
    backend,
    outcome: fail(code, detail),
    transport: "BAD_RESPONSE",
  });
  const jobClass = classifySimulationJob(expected.prepared.job);
  if (!TERMINAL.has(ticket.status)) return refuse("SIMULATION_OUTPUT_MALFORMED", "ticket is not terminal");
  if (ticket.cacheKey !== expected.prepared.keys.parsedResultKey) {
    return refuse("MODEL_PROVENANCE_MISMATCH", "ticket cacheKey does not match the job");
  }
  if (ticket.jobClass !== jobClass || ticket.publishable !== isPublishableClass(jobClass)) {
    return refuse("MODEL_PROVENANCE_MISMATCH", "ticket job class does not match the job");
  }
  const served = {
    cacheStatus: ticket.cacheStatus,
    cacheKey: ticket.cacheKey,
    jobClass,
    publishable: isPublishableClass(jobClass),
  };
  if (ticket.status === "SUCCEEDED") {
    if (ticket.failure !== undefined)
      return refuse("SIMULATION_OUTPUT_MALFORMED", "succeeded ticket carries a failure");
    const verified = verifySimulationResult(ticket.result, expected);
    return verified.ok
      ? { backend, outcome: verified, served }
      : { backend, outcome: verified, served, transport: "BAD_RESPONSE" };
  }
  if (ticket.result !== undefined || ticket.failure === undefined) {
    return refuse(
      "SIMULATION_OUTPUT_MALFORMED",
      `${ticket.status} ticket must carry a failure and no result`,
    );
  }
  if ((ticket.status === "CANCELLED") !== (ticket.failure.code === "CANCELLED")) {
    return refuse("SIMULATION_OUTPUT_MALFORMED", "ticket status and failure code disagree");
  }
  return { backend, outcome: fail(ticket.failure.code, ticket.failure.detail), served };
}
