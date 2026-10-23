/**
 * The PRIVATE SIMULATION RUNNER protocol (M11-G3-5): `simc-runner-api/1`.
 *
 * Shared by the runner service (Node) and the Worker-side client, so the two
 * cannot drift. Worker-safe: zod and WebCrypto only.
 *
 * The request carries the EXISTING typed SimulationJob — never SimC text — plus
 * an optional readiness attestation for PRODUCTION jobs. The response carries
 * the EXISTING SimulationResult or SimulationFailure; there is no second result
 * schema. Job ids are opaque transport tickets: they never enter a hash, a
 * cache key or a result.
 *
 * AUTHENTICATION: HMAC-SHA256 over a canonical string (see `canonicalSigningString`):
 *
 *   WLC-SIMC-HMAC-SHA256-1 \n keyId \n timestampMs \n nonce \n METHOD \n path \n sha256(body)
 *
 * sent as `x-wlc-key-id`, `x-wlc-timestamp`, `x-wlc-nonce`, `x-wlc-signature`
 * (lowercase hex). The body hash binds the job; the timestamp bounds replay to
 * the server's tolerance window and the nonce makes each request single-use
 * within it. Keys are versioned by id, so a new key is added beside the old
 * one, clients move, and the old one is removed (rotation without downtime).
 */

import { z } from "zod";

import { SIMULATION_FAILURE_CODES, type SimulationFailure } from "./failures.js";
import { SIMULATION_JOB_CLASSES, type SimulationJobClass } from "./job-class.js";
import type { SimulationResult } from "./result.js";

export const RUNNER_PROTOCOL = "simc-runner-api/1";
/** Bump when the service's transport behaviour changes. Transport provenance only — never model provenance. */
export const RUNNER_SERVICE_REVISION = "simc-runner-service/1";

export const RUNNER_PATHS = {
  simulations: "/v1/simulations",
  simulation: (jobId: string) => `/v1/simulations/${jobId}`,
  metrics: "/v1/metrics",
  readiness: "/v1/readiness",
  liveness: "/livez",
} as const;

/** Request body cap: the G3-1 job cap plus a small envelope. */
export const MAX_RUNNER_REQUEST_BYTES = 256 * 1024 + 4 * 1024;

export const JOB_ID_PATTERN = /^[0-9a-f-]{36}$/;

export const SIMULATION_JOB_STATUSES = ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "CANCELLED"] as const;
export type SimulationJobStatus = (typeof SIMULATION_JOB_STATUSES)[number];
export const TERMINAL_STATUSES: readonly SimulationJobStatus[] = ["SUCCEEDED", "FAILED", "CANCELLED"];

/** How the ticket was served. Recorded beside the result, never inside it. */
export const CACHE_STATUSES = ["MISS", "HIT", "COALESCED"] as const;
export type CacheStatus = (typeof CACHE_STATUSES)[number];

/**
 * `readiness` is a PRODUCTION job's attestation (readiness-attestation.ts). The
 * envelope carries it opaquely: the SERVICE validates it with typed failures,
 * so an in-process LOCAL submission and an HTTP one are judged identically.
 */
export const submitSimulationRequestSchema = z
  .object({
    protocol: z.literal(RUNNER_PROTOCOL),
    job: z.unknown(),
    readiness: z.unknown().optional(),
  })
  .strict();
export type SubmitSimulationRequest = z.infer<typeof submitSimulationRequestSchema>;

const failureSchema = z.object({ code: z.enum(SIMULATION_FAILURE_CODES), detail: z.string() }).strict();

/** A ticket's view. `result` exactly when SUCCEEDED; `failure` exactly when FAILED or CANCELLED. */
export const simulationTicketSchema = z
  .object({
    protocol: z.literal(RUNNER_PROTOCOL),
    serviceRevision: z.string(),
    jobId: z.string().regex(JOB_ID_PATTERN),
    status: z.enum(SIMULATION_JOB_STATUSES),
    jobClass: z.enum(SIMULATION_JOB_CLASSES),
    publishable: z.boolean(),
    cacheStatus: z.enum(CACHE_STATUSES),
    /** The semantic parsed-result key: identifies the work, not the ticket. */
    cacheKey: z.string().regex(/^[0-9a-f]{64}$/),
    result: z.unknown().optional(),
    failure: failureSchema.optional(),
  })
  .strict();

export interface SimulationTicketView {
  readonly protocol: typeof RUNNER_PROTOCOL;
  readonly serviceRevision: string;
  readonly jobId: string;
  readonly status: SimulationJobStatus;
  readonly jobClass: SimulationJobClass;
  readonly publishable: boolean;
  readonly cacheStatus: CacheStatus;
  readonly cacheKey: string;
  readonly result?: SimulationResult;
  readonly failure?: SimulationFailure;
}

/** A submission refused before any ticket exists (validation, policy, overload, readiness). */
export const submissionRejectedSchema = z
  .object({
    protocol: z.literal(RUNNER_PROTOCOL),
    serviceRevision: z.string(),
    status: z.literal("REFUSED"),
    failure: failureSchema,
  })
  .strict();
export type SubmissionRejected = z.infer<typeof submissionRejectedSchema>;

export const TRANSPORT_ERROR_CODES = [
  "AUTH_REJECTED",
  "NOT_FOUND",
  "PAYLOAD_TOO_LARGE",
  "BAD_REQUEST",
  "METHOD_NOT_ALLOWED",
] as const;
export type TransportErrorCode = (typeof TRANSPORT_ERROR_CODES)[number];

export const transportErrorSchema = z
  .object({
    protocol: z.literal(RUNNER_PROTOCOL),
    serviceRevision: z.string(),
    error: z.object({ code: z.enum(TRANSPORT_ERROR_CODES), detail: z.string() }).strict(),
  })
  .strict();
export type TransportError = z.infer<typeof transportErrorSchema>;

// ---------------------------------------------------------------------------
// Request signing (WebCrypto; Worker- and Node-safe)
// ---------------------------------------------------------------------------

export const RUNNER_AUTH_SCHEME = "WLC-SIMC-HMAC-SHA256-1";
export const AUTH_HEADERS = {
  keyId: "x-wlc-key-id",
  timestamp: "x-wlc-timestamp",
  nonce: "x-wlc-nonce",
  signature: "x-wlc-signature",
} as const;
export const KEY_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
export const NONCE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
/** A secret must carry at least this many bytes of key material. */
export const MIN_SECRET_BYTES = 32;

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

export async function sha256HexOfBytes(bytes: Uint8Array): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", bytes));
}

export function canonicalSigningString(parts: {
  readonly keyId: string;
  readonly timestampMs: number;
  readonly nonce: string;
  readonly method: string;
  readonly path: string;
  readonly bodySha256: string;
}): string {
  return [
    RUNNER_AUTH_SCHEME,
    parts.keyId,
    String(parts.timestampMs),
    parts.nonce,
    parts.method.toUpperCase(),
    parts.path,
    parts.bodySha256,
  ].join("\n");
}

async function hmacKey(secret: Uint8Array, usage: "sign" | "verify"): Promise<CryptoKey> {
  return await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

export interface SignedRequestHeaders {
  readonly [AUTH_HEADERS.keyId]: string;
  readonly [AUTH_HEADERS.timestamp]: string;
  readonly [AUTH_HEADERS.nonce]: string;
  readonly [AUTH_HEADERS.signature]: string;
}

export async function signRunnerRequest(request: {
  readonly keyId: string;
  readonly secret: Uint8Array;
  readonly method: string;
  readonly path: string;
  readonly body: Uint8Array;
  readonly timestampMs: number;
  readonly nonce: string;
}): Promise<SignedRequestHeaders> {
  if (!KEY_ID_PATTERN.test(request.keyId)) throw new Error("runner auth: invalid key id");
  if (request.secret.byteLength < MIN_SECRET_BYTES) throw new Error("runner auth: secret too short");
  if (!NONCE_PATTERN.test(request.nonce)) throw new Error("runner auth: invalid nonce");
  const canonical = canonicalSigningString({
    keyId: request.keyId,
    timestampMs: request.timestampMs,
    nonce: request.nonce,
    method: request.method,
    path: request.path,
    bodySha256: await sha256HexOfBytes(request.body),
  });
  const signature = await crypto.subtle.sign(
    "HMAC",
    await hmacKey(request.secret, "sign"),
    new TextEncoder().encode(canonical),
  );
  return {
    [AUTH_HEADERS.keyId]: request.keyId,
    [AUTH_HEADERS.timestamp]: String(request.timestampMs),
    [AUTH_HEADERS.nonce]: request.nonce,
    [AUTH_HEADERS.signature]: hex(signature),
  };
}

/** Constant-time verification (WebCrypto `verify`). */
export async function verifyRunnerSignature(
  secret: Uint8Array,
  canonical: string,
  signatureHex: string,
): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(signatureHex)) return false;
  const signature = new Uint8Array(32);
  for (let index = 0; index < 32; index += 1) {
    signature[index] = Number.parseInt(signatureHex.slice(index * 2, index * 2 + 2), 16);
  }
  return await crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret, "verify"),
    signature,
    new TextEncoder().encode(canonical),
  );
}

/** A fresh nonce (Worker and Node both expose `crypto.getRandomValues`). */
export function newNonce(): string {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export const failureView = (failure: SimulationFailure): SimulationFailure => ({
  code: failure.code,
  detail: failure.detail,
});
