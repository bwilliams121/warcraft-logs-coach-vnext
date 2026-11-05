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
import type { RaidNightRunner, RaidNightRunResult } from "../../src/services/raid-night-runner.js";
import type { EncounterContextRunner } from "../../src/services/encounter-context-runner.js";
import type { RaidNightRequest } from "../../src/services/raid-night-request.js";
import type { RaidNightAnalysis } from "../../src/aggregation/raid-night.js";
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
  playerName = "Fixtureplayer",
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
    player: { sourceId, name: playerName, className, specName },
  };
}

export interface RunnerOptions {
  /**
   * The identity preflight reports. Defaults to Rogue/Assassination, the
   * subject the fixture fight actually describes.
   *
   * ONLY PAIR AN UNSUPPORTED IDENTITY WITH THIS FIXTURE. The fight is the
   * Rogue's; a supported identity other than the Rogue's (Paladin/Protection
   * since M10-D) would dispatch a real analyzer over another class's events,
   * which is an identity/evidence mismatch and not a transport test. The
   * canonical unsupported identity is Evoker/Devastation (A7R6 fight 7, actor 11).
   */
  readonly className?: string;
  readonly specName?: string;
  /** Swap the fixture so a test can reach the M5-A rejection corpus. */
  readonly fixture?: "d2" | "m5a";
  /**
   * The name Warcraft Logs reported for the player.
   *
   * Overridable so a transport test can carry real non-ASCII text end to end.
   * The analysis itself never reads a name — identity flows through `sourceId` —
   * which is precisely why a name is the right probe for an ENCODING defect: it
   * is carried, never interpreted.
   */
  readonly playerName?: string;
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
    options.playerName ?? "Fixtureplayer",
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
 * counter, not a reimplementation of it. The real binding is permissive and
 * eventually consistent, with per-location counters and no globally serialized
 * accounting — so what a test built on this may assert is OUR call behaviour
 * (how many, under which key, and what we do with a refusal), never an exact
 * global admission count. Production uses the real binding.
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
 * A raid-night runner that returns ONE prepared aggregate, and counts.
 *
 * The count is the point. Two transports sharing one runner is an architectural
 * claim, and the only way to prove the claim rather than restate it is to hand
 * both adapters the SAME instance and check it was entered twice.
 *
 * It records the requests it received too, so a test can prove a transport passed
 * the caller's selection through unchanged rather than substituting its own.
 */
export interface CountingRaidNightRunner {
  readonly runner: RaidNightRunner;
  calls(): number;
  requests(): readonly RaidNightRequest[];
}

export function fixedRaidNightRunner(
  result: RaidNightAnalysis | RaidNightRunResult,
): CountingRaidNightRunner {
  const outcome: RaidNightRunResult = "ok" in result ? result : { ok: true, aggregate: result };
  const requests: RaidNightRequest[] = [];
  return {
    runner: async (request) => {
      requests.push(request);
      return outcome;
    },
    calls: () => requests.length,
    requests: () => [...requests],
  };
}

/** A raid-night runner that must never be entered. Fails the test if it is. */
export const FORBIDDEN_RAID_NIGHT_RUNNER: RaidNightRunner = async () => {
  throw new Error("the raid-night runner was entered when the request should have been refused");
};

/**
 * Worker dependencies wired to one runner and one limiter.
 *
 * The SAME limiter instance reaches REST and MCP, which is what lets a test
 * prove the two transports share a budget rather than each having their own.
 */
export function workerDepsFor(options: {
  readonly analyze?: AnalysisRunner;
  readonly raidNight?: RaidNightRunner;
  readonly encounterContext?: EncounterContextRunner;
  readonly rateLimiter?: RateLimiterPort | undefined;
  readonly mcp?: WorkerDeps["mcp"];
}): WorkerDeps {
  return {
    analysisRunner: () => options.analyze ?? UNBOUND_ANALYSIS,
    // Stubbed fail-closed rather than omitted, so a test that forgot to bind it
    // cannot silently reach a runner it did not choose.
    raidNightRunner: () => options.raidNight ?? UNBOUND_RAID_NIGHT,
    encounterContextRunner: () => options.encounterContext ?? UNBOUND_ENCOUNTER_CONTEXT,
    rateLimiter: () => options.rateLimiter ?? ALLOWING_LIMITER,
    mcp: options.mcp ?? defaultTestMcp,
    version: "0.1.0",
  };
}

const UNBOUND_ANALYSIS: AnalysisRunner = async () => ({
  ok: false as const,
  error: { code: "INTERNAL_ERROR" as const, message: "analysis runner not bound here" },
});

const UNBOUND_RAID_NIGHT: RaidNightRunner = async () => ({
  ok: false as const,
  error: { code: "INTERNAL_ERROR" as const, message: "raid-night runner not bound here" },
});

const UNBOUND_ENCOUNTER_CONTEXT: EncounterContextRunner = async () => ({
  ok: false as const,
  error: { code: "INTERNAL_ERROR" as const, message: "encounter-context runner not bound here" },
});

/**
 * Routes `/mcp` through the same runners and limiter the Worker holds.
 *
 * Reads them off `deps` rather than closing over the test's own values, because
 * that is exactly what the production wiring does — so a test driving SELF
 * through /mcp exercises the real sharing rather than a parallel arrangement.
 */
const defaultTestMcp: WorkerDeps["mcp"] = async (request, env, deps) =>
  await handleMcpRequest(request, env, {
    analyze: deps.analysisRunner(env),
    analyzeRaidNight: deps.raidNightRunner(env),
    analyzeEncounterContext: deps.encounterContextRunner(env),
    rateLimiter: deps.rateLimiter(env),
  });
