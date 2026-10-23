/**
 * SIMULATION RESULT CACHE (M11-G3-5).
 *
 * Keyed by the G3-1 PARSED-RESULT key (engine-run key + parser revision), so a
 * new model pin, input-builder revision, execution profile revision, policy,
 * profile, environment or parser produces a different key: there is no mutable
 * invalidation, and "clear on deploy" is never a correctness mechanism.
 *
 * A cache entry is DATA, never trust: the service re-verifies every entry
 * against the identity recomputed from the submitted job
 * (src/simulation/result-verification.ts) before serving it, and drops one
 * that fails. Adapters only store and fetch.
 *
 * Final hardening: schema 2 adds `resultMac` (cache-integrity.ts), checked
 * before the provenance verification. A schema-1 entry (no MAC) is refused
 * and recomputed like any other invalid entry.
 */

import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

import type { SimulationResult } from "../../src/simulation/result.js";

export const CACHE_ENTRY_SCHEMA = "simulation-cache-entry/2";

export interface CachedSimulation {
  readonly schema: typeof CACHE_ENTRY_SCHEMA;
  readonly cacheKey: string;
  readonly engineRunKey: string;
  readonly result: SimulationResult;
  /** HMAC-SHA256 (cache-integrity key) over the canonical {scheme, cacheKey, engineRunKey, result}. */
  readonly resultMac: string;
  readonly createdAt: string;
  readonly modelIdentity: SimulationResult["model"];
  readonly parserRevision: string;
}

export interface SimulationCache {
  readonly kind: string;
  get(cacheKey: string): Promise<CachedSimulation | null>;
  put(entry: CachedSimulation): Promise<void>;
  delete(cacheKey: string): Promise<void>;
  /** Null when usable; otherwise why the service must not become ready. */
  configurationProblem(): string | null;
}

const KEY = /^[0-9a-f]{64}$/;

export class MemorySimulationCache implements SimulationCache {
  readonly kind = "MEMORY";
  private readonly entries = new Map<string, CachedSimulation>();

  async get(cacheKey: string): Promise<CachedSimulation | null> {
    return this.entries.get(cacheKey) ?? null;
  }

  async put(entry: CachedSimulation): Promise<void> {
    this.entries.set(entry.cacheKey, entry);
  }

  async delete(cacheKey: string): Promise<void> {
    this.entries.delete(cacheKey);
  }

  configurationProblem(): string | null {
    return null;
  }

  get size(): number {
    return this.entries.size;
  }
}

/**
 * A durable local adapter: one JSON file per key, written to a temporary name
 * and renamed into place (no torn reads). A production store (object storage,
 * KV) implements the same interface.
 */
export class FileSystemSimulationCache implements SimulationCache {
  readonly kind = "FILESYSTEM";

  constructor(private readonly directory: string) {}

  private path(cacheKey: string): string {
    if (!KEY.test(cacheKey)) throw new Error("cache: invalid key");
    return join(this.directory, `${cacheKey}.json`);
  }

  async get(cacheKey: string): Promise<CachedSimulation | null> {
    const path = this.path(cacheKey);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf8")) as CachedSimulation;
    } catch {
      return null;
    }
  }

  async put(entry: CachedSimulation): Promise<void> {
    mkdirSync(this.directory, { recursive: true });
    const path = this.path(entry.cacheKey);
    const temporary = `${path}.${String(process.pid)}.${crypto.randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(entry), "utf8");
    renameSync(temporary, path);
  }

  async delete(cacheKey: string): Promise<void> {
    rmSync(this.path(cacheKey), { recursive: false, force: true });
  }

  configurationProblem(): string | null {
    try {
      mkdirSync(this.directory, { recursive: true });
      const probe = join(this.directory, `.probe-${crypto.randomUUID()}`);
      writeFileSync(probe, "ok", "utf8");
      rmSync(probe, { recursive: false, force: true });
      return null;
    } catch (error) {
      return `cache directory not writable: ${(error as Error).message}`.slice(0, 200);
    }
  }
}
