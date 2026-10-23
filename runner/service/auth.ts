/**
 * RUNNER REQUEST AUTHENTICATION (M11-G3-5), server side of the HMAC scheme in
 * src/simulation/runner-protocol.ts.
 *
 * A request is accepted only when ALL hold:
 *   - every auth header is present and well-formed;
 *   - the key id is in the configured key ring (rotation: several ids may be
 *     active at once; remove an id to revoke it);
 *   - the timestamp is within ±toleranceMs of the server clock;
 *   - the HMAC over the canonical string (method, path, body hash) verifies;
 *   - the (keyId, nonce) pair has not been seen inside the tolerance window.
 *
 * The nonce store is bounded: entries expire with the tolerance window, and a
 * full store refuses new requests rather than forgetting live nonces (a replay
 * window can never be reopened by flooding). Nothing here logs a header, a
 * signature or a secret; rejections carry a reason code only.
 */

import {
  AUTH_HEADERS,
  canonicalSigningString,
  KEY_ID_PATTERN,
  MIN_SECRET_BYTES,
  NONCE_PATTERN,
  sha256HexOfBytes,
  verifyRunnerSignature,
} from "../../src/simulation/runner-protocol.js";

export type AuthRejection =
  | "MISSING_HEADERS"
  | "MALFORMED_HEADERS"
  | "UNKNOWN_KEY"
  | "STALE_TIMESTAMP"
  | "BAD_SIGNATURE"
  | "REPLAYED_NONCE"
  | "NONCE_STORE_FULL";

export type AuthResult =
  { readonly ok: true; readonly keyId: string } | { readonly ok: false; readonly reason: AuthRejection };

export interface AuthOptions {
  readonly toleranceMs: number;
  readonly maxNonces: number;
}

export const DEFAULT_AUTH_OPTIONS: AuthOptions = { toleranceMs: 300_000, maxNonces: 100_000 };

/** Parses `SIMC_RUNNER_HMAC_KEYS` = `keyId:base64secret[,keyId:base64secret]`. Throws on anything malformed. */
export function parseKeyRing(value: string | undefined): ReadonlyMap<string, Uint8Array> {
  if (value === undefined || value.trim() === "") throw new Error("runner auth: no HMAC keys configured");
  const ring = new Map<string, Uint8Array>();
  for (const entry of value.split(",")) {
    const at = entry.indexOf(":");
    const keyId = entry.slice(0, at).trim();
    const secret = Uint8Array.from(Buffer.from(entry.slice(at + 1).trim(), "base64"));
    if (at <= 0 || !KEY_ID_PATTERN.test(keyId)) throw new Error("runner auth: malformed key id");
    if (secret.byteLength < MIN_SECRET_BYTES)
      throw new Error(`runner auth: key ${keyId} is shorter than ${String(MIN_SECRET_BYTES)} bytes`);
    if (ring.has(keyId)) throw new Error(`runner auth: duplicate key id ${keyId}`);
    ring.set(keyId, secret);
  }
  return ring;
}

export interface AuthRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: Readonly<Record<string, string | undefined>>;
  readonly body: Uint8Array;
}

export class RequestAuthenticator {
  private readonly nonces = new Map<string, number>();

  constructor(
    private readonly keys: ReadonlyMap<string, Uint8Array>,
    private readonly options: AuthOptions = DEFAULT_AUTH_OPTIONS,
    private readonly clock: () => number = Date.now,
  ) {}

  async authenticate(request: AuthRequest): Promise<AuthResult> {
    const keyId = request.headers[AUTH_HEADERS.keyId];
    const timestamp = request.headers[AUTH_HEADERS.timestamp];
    const nonce = request.headers[AUTH_HEADERS.nonce];
    const signature = request.headers[AUTH_HEADERS.signature];
    if (keyId === undefined || timestamp === undefined || nonce === undefined || signature === undefined) {
      return { ok: false, reason: "MISSING_HEADERS" };
    }
    if (
      !KEY_ID_PATTERN.test(keyId) ||
      !/^\d{1,16}$/.test(timestamp) ||
      !NONCE_PATTERN.test(nonce) ||
      !/^[0-9a-f]{64}$/.test(signature)
    ) {
      return { ok: false, reason: "MALFORMED_HEADERS" };
    }
    const secret = this.keys.get(keyId);
    if (secret === undefined) return { ok: false, reason: "UNKNOWN_KEY" };
    const now = this.clock();
    const timestampMs = Number(timestamp);
    if (Math.abs(now - timestampMs) > this.options.toleranceMs)
      return { ok: false, reason: "STALE_TIMESTAMP" };
    const canonical = canonicalSigningString({
      keyId,
      timestampMs,
      nonce,
      method: request.method,
      path: request.path,
      bodySha256: await sha256HexOfBytes(request.body),
    });
    if (!(await verifyRunnerSignature(secret, canonical, signature)))
      return { ok: false, reason: "BAD_SIGNATURE" };
    // Replay check only after the signature verifies: an attacker cannot fill the store.
    this.prune(now);
    const seen = `${keyId}:${nonce}`;
    if (this.nonces.has(seen)) return { ok: false, reason: "REPLAYED_NONCE" };
    if (this.nonces.size >= this.options.maxNonces) return { ok: false, reason: "NONCE_STORE_FULL" };
    this.nonces.set(seen, timestampMs + this.options.toleranceMs);
    return { ok: true, keyId };
  }

  private prune(now: number): void {
    for (const [seen, expiresAt] of this.nonces) {
      if (expiresAt < now) this.nonces.delete(seen);
    }
  }

  get rememberedNonces(): number {
    return this.nonces.size;
  }
}
