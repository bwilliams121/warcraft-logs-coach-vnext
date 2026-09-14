/**
 * Offline dependencies for driving real analysis through EITHER transport.
 *
 * REST and MCP both take an application runner and a rate limiter as injected
 * ports, so a test can exercise the genuine path on both — real schema, real
 * projection, real error mapping — without a network, a Cloudflare limiter, or
 * a live Warcraft Logs call.
 *
 * Shared between the two transports on purpose: a consistency test that built
 * its REST and MCP inputs separately could pass while the two transports
 * disagreed about which fixture they were analysing.
 *
 * The runner here is NOT a stub analysis. It is the actual M6-B service
 * composing M2 -> M3 -> M4 -> M5 over the trusted M5-D2 fixture, with only the
 * two I/O ports faked. That means a test asserting coverage numbers through MCP
 * is asserting them through the whole engine, not against a canned object.
 */

import { analyzeFight, type AnalysisServiceDeps } from "../../src/services/analysis-service.js";
import type { CombatIngestionPort } from "../../src/services/ingestion-port.js";
import type { AnalysisServiceResult } from "../../src/services/result.js";
import type { RateLimiterPort } from "../../src/runtime/rate-limit.js";
import type { AnalysisRunner } from "../../src/services/analysis-runner.js";
import type { Env } from "../../src/config/env.js";
import type { WorkerDeps } from "../../src/api/worker.js";
import { handleMcpRequest } from "../../src/mcp/server.js";
import type { FightIdentity, PreflightPort } from "../../src/wcl/types.js";
import { M5D2_ACTOR, m5d2Fight } from "./m5d2-fixture.js";
import { ASSASSINATION_ACTOR_B, m5aFight } from "./m5a-fixture.js";

/**
 * The one credential both analysis surfaces require.
 *
 * Matches the pool binding in `vitest.config.ts`. An obvious sentinel — no real
 * token appears anywhere in this repository.
 */
export const ANALYSIS_TEST_TOKEN = "fake-analysis-token-not-real";

/** Authorization for either transport. One principal, two surfaces. */
export function authHeaders(token: string = ANALYSIS_TEST_TOKEN): Record<string, string> {
  return { authorization: `Bearer ${token}` };
}

export const MCP_TEST_ENV: Env = {
  ENVIRONMENT: "test",
  WCL_CLIENT_ID: "fake-client-id-not-real",
  WCL_CLIENT_SECRET: "fake-client-secret-not-real",
  ANALYSIS_AUTH_TOKEN: "fake-analysis-token-not-real",
};

const D2_FIGHT = m5d2Fight();

/** The identifiers a caller must supply to reach the D2 fixture. */
export const D2_REQUEST = {
  reportCode: D2_FIGHT.report.code,
  fightId: D2_FIGHT.fight.id,
  sourceId: M5D2_ACTOR,
} as const;

function identityFrom(
  fight: ReturnType<typeof m5d2Fight>,
  sourceId: number,
  className: string,
  specName: string,
): FightIdentity {
  return {
    report: {
      code: fight.report.code,
      revision: fight.report.revision,
      startTime: fight.report.startTimeUnixMs,
      endTime: fight.report.endTimeUnixMs,
    },
    data: fight.data,
    fight: {
      id: fight.fight.id,
      name: fight.fight.name,
      encounterId: fight.fight.encounterId,
      difficulty: fight.fight.difficulty,
      startTime: fight.fight.startTimeMs,
      endTime: fight.fight.endTimeMs,
    },
    player: { sourceId, name: "Fixtureplayer", className, specName },
  };
}

export interface RunnerOptions {
  readonly className?: string;
  readonly specName?: string;
  /** Swap the fixture so a test can reach the M5-A rejection corpus. */
  readonly fixture?: "d2" | "m5a";
}

/**
 * A runner backed by the real service over a real fixture.
 *
 * Only `preflight` and `ingest` are faked — everything between them is the
 * production path.
 */
export function fixtureAnalysisRunner(options: RunnerOptions = {}): AnalysisRunner {
  const useM5a = options.fixture === "m5a";
  const fight = useM5a ? m5aFight() : m5d2Fight();
  const sourceId = useM5a ? ASSASSINATION_ACTOR_B : M5D2_ACTOR;
  const identity = identityFrom(
    fight,
    sourceId,
    options.className ?? "Rogue",
    options.specName ?? "Assassination",
  );

  const preflight: PreflightPort = async () => ({ ok: true, identity, rateLimit: undefined });
  const ingest: CombatIngestionPort = async () => ({
    ok: true,
    fight: useM5a ? m5aFight() : m5d2Fight(),
    rateLimit: undefined,
  });
  const deps: AnalysisServiceDeps = { env: MCP_TEST_ENV, preflight, ingest };

  return async (input: unknown): Promise<AnalysisServiceResult> => await analyzeFight(input, deps);
}

/** The identifiers that reach the M5-A rejection fixture. */
export function m5aRequest(): { reportCode: string; fightId: number; sourceId: number } {
  const fight = m5aFight();
  return { reportCode: fight.report.code, fightId: fight.fight.id, sourceId: ASSASSINATION_ACTOR_B };
}

/** A runner that always fails with one application error code. */
export function failingRunner(error: AnalysisServiceResult): AnalysisRunner {
  return async () => error;
}

export const ALLOWING_LIMITER: RateLimiterPort = { limit: async () => ({ success: true }) };
export const DENYING_LIMITER: RateLimiterPort = { limit: async () => ({ success: false }) };
export const THROWING_LIMITER: RateLimiterPort = {
  limit: async () => {
    throw new Error("limiter unreachable");
  },
};

/**
 * A limiter that genuinely counts, so a test can exhaust it.
 *
 * Deliberately simple: this is a test double for Cloudflare's distributed
 * counter, not a reimplementation of it. Production uses the real binding.
 */
export function countingLimiter(limit: number): RateLimiterPort & { readonly keys: string[] } {
  const keys: string[] = [];
  return {
    keys,
    limit: async ({ key }) => {
      keys.push(key);
      return { success: keys.length <= limit };
    },
  };
}

/**
 * Worker dependencies wired to one runner and one limiter.
 *
 * The SAME limiter instance reaches REST and MCP, which is what lets a test
 * prove the two transports share a budget rather than each having their own.
 */
export function workerDepsFor(options: {
  readonly analyze: AnalysisRunner;
  readonly rateLimiter?: RateLimiterPort | undefined;
  readonly mcp?: WorkerDeps["mcp"];
}): WorkerDeps {
  return {
    analysisRunner: () => options.analyze,
    rateLimiter: () => options.rateLimiter ?? ALLOWING_LIMITER,
    mcp: options.mcp ?? defaultTestMcp,
    version: "0.1.0",
  };
}

/** Routes `/mcp` through the same runner and limiter the Worker holds. */
const defaultTestMcp: WorkerDeps["mcp"] = async (request, env, deps) =>
  await handleMcpRequest(request, env, {
    analyze: deps.analysisRunner(env),
    rateLimiter: deps.rateLimiter(env),
  });
