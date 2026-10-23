/**
 * CACHE RESULT INTEGRITY (M11-G3-5 final hardening).
 *
 * Provenance verification proves a cached result belongs to the job; it cannot
 * prove its NUMBERS were not edited in storage. Every cache record therefore
 * carries an HMAC-SHA256 under a DEDICATED cache-integrity key (never the HTTP
 * request-authentication key; config refuses to start if they are equal):
 *
 *   resultMac = HMAC(cacheKey', canonicalJson({ scheme, cacheKey, engineRunKey, result }))
 *
 * `scheme` is a domain-separation label, distinct from the request-signing
 * scheme, and the MAC binds the record's keys as well as the result, so a valid
 * record cannot be replayed under another key. Verification is WebCrypto
 * `verify` (constant-time). The service checks the MAC FIRST and only then runs
 * the semantic/provenance verification; an entry failing either is never
 * returned. The key is held as a non-extractable CryptoKey and never logged.
 */

import { canonicalJson } from "../../src/simulation/canonical.js";
import { MIN_SECRET_BYTES } from "../../src/simulation/runner-protocol.js";
import type { SimulationResult } from "../../src/simulation/result.js";

export const CACHE_MAC_SCHEME = "WLC-SIMC-CACHE-MAC-SHA256-1";

export interface MacSubject {
  readonly cacheKey: string;
  readonly engineRunKey: string;
  readonly result: SimulationResult;
}

const hex = (bytes: ArrayBuffer): string =>
  [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

/** The exact bytes the MAC covers. Throws on a non-canonical value (treated as corrupt). */
export function cacheMacInput(subject: MacSubject): Uint8Array {
  return new TextEncoder().encode(
    canonicalJson({
      scheme: CACHE_MAC_SCHEME,
      cacheKey: subject.cacheKey,
      engineRunKey: subject.engineRunKey,
      result: subject.result,
    }),
  );
}

export class CacheIntegrity {
  private constructor(private readonly key: CryptoKey) {}

  static async fromSecret(secret: Uint8Array): Promise<CacheIntegrity> {
    if (secret.byteLength < MIN_SECRET_BYTES) {
      throw new Error(`cache integrity: key is shorter than ${String(MIN_SECRET_BYTES)} bytes`);
    }
    const key = await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, [
      "sign",
      "verify",
    ]);
    return new CacheIntegrity(key);
  }

  async mac(subject: MacSubject): Promise<string> {
    return hex(await crypto.subtle.sign("HMAC", this.key, cacheMacInput(subject)));
  }

  /** Constant-time; false for a malformed MAC or a non-canonical record. */
  async verify(subject: MacSubject, resultMac: unknown): Promise<boolean> {
    if (typeof resultMac !== "string" || !/^[0-9a-f]{64}$/.test(resultMac)) return false;
    let input: Uint8Array;
    try {
      input = cacheMacInput(subject);
    } catch {
      return false;
    }
    const signature = new Uint8Array(32);
    for (let index = 0; index < 32; index += 1) {
      signature[index] = Number.parseInt(resultMac.slice(index * 2, index * 2 + 2), 16);
    }
    return await crypto.subtle.verify("HMAC", this.key, signature, input);
  }
}
