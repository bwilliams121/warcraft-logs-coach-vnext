/**
 * Warcraft Logs boundary vocabulary.
 *
 * Everything above the WCL boundary (the application service, the API) imports
 * from this module only. Raw GraphQL response shapes never travel upward, so a
 * WCL schema change cannot ripple through the analyzer.
 *
 * Milestone 2 retrieves identity metadata only: no combat events, no
 * pagination, no gameplay interpretation.
 */

import type { WclCredentials } from "../config/env.js";

/**
 * Injected fetch.
 *
 * Core logic never closes over the global. The real `fetch` is bound exactly
 * once, at the composition root in `preflight.ts`, which is what makes every
 * test offline by construction rather than by convention.
 */
export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

/**
 * A `FetchLike` that counts the outbound requests made through it.
 *
 * DIAGNOSTIC ONLY (M11-A5 post-deploy). A raid night makes dozens of outbound
 * requests through one bound `fetch`; when one of them fails, knowing WHICH
 * ordinal it was (the 3rd or the 55th) is the difference between "the upstream
 * refused this query" and "something happened after N subrequests". The count
 * is read by the GraphQL client at failure time and recorded in the failure's
 * fixed-shape diagnostics. It changes nothing about what is sent.
 */
export interface OutboundCountingFetch extends FetchLike {
  /** How many requests have been issued through this function so far. */
  readonly outboundCount: () => number;
}

export function countOutbound(fetch: FetchLike): OutboundCountingFetch {
  let count = 0;
  const counting = ((input: string, init: RequestInit): Promise<Response> => {
    count += 1;
    return fetch(input, init);
  }) as OutboundCountingFetch;
  Object.defineProperty(counting, "outboundCount", { value: () => count, enumerable: true });
  return counting;
}

/** The ordinal of the most recent outbound request, when the fetch counts; else undefined. */
export function outboundIndexOf(fetch: FetchLike): number | undefined {
  const candidate = (fetch as Partial<OutboundCountingFetch>).outboundCount;
  return typeof candidate === "function" ? candidate() : undefined;
}

/**
 * Why a Warcraft Logs preflight did not produce an identity.
 *
 * These are factual retrieval/identity outcomes. None of them is a gameplay
 * judgement, and none of them may be softened into missing data.
 */
export type WclFailureReason =
  /** No such report, or it is private. Public + unlisted access only. */
  | "REPORT_NOT_ACCESSIBLE"
  | "FIGHT_NOT_FOUND"
  | "SOURCE_NOT_FOUND"
  /** The source ID resolves to a pet or NPC rather than a player. */
  | "SOURCE_NOT_A_PLAYER"
  /** A real player in the report who did not participate in the requested fight. */
  | "SOURCE_NOT_IN_FIGHT"
  /** WCL supplied the actor and the fight but not a usable name/class/spec. */
  | "IDENTITY_UNRESOLVED"
  | "UPSTREAM_DATA_INVALID"
  | "UPSTREAM_AUTH_FAILED"
  | "UPSTREAM_RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  /** Configured credentials cannot be encoded as HTTP Basic. */
  | "CREDENTIALS_NOT_ENCODABLE";

export const WCL_FAILURE_REASONS = [
  "REPORT_NOT_ACCESSIBLE",
  "FIGHT_NOT_FOUND",
  "SOURCE_NOT_FOUND",
  "SOURCE_NOT_A_PLAYER",
  "SOURCE_NOT_IN_FIGHT",
  "IDENTITY_UNRESOLVED",
  "UPSTREAM_DATA_INVALID",
  "UPSTREAM_AUTH_FAILED",
  "UPSTREAM_RATE_LIMITED",
  "UPSTREAM_UNAVAILABLE",
  "CREDENTIALS_NOT_ENCODABLE",
] as const satisfies readonly WclFailureReason[];

export type WclFailureStage = "TOKEN" | "TRANSPORT" | "DECODE" | "IDENTITY";

/**
 * The CLOSED vocabulary of thrown-error names a diagnostic may record.
 *
 * An error's `name` is a class name, not upstream prose — but nothing stops a
 * runtime (or a wrapped fetch) from throwing an object whose `name` carries
 * arbitrary text. So the name is admitted only when it is one of these, and
 * anything else is recorded as `OTHER`. The distinction that matters most is
 * `TimeoutError` (the client's own `AbortSignal.timeout`) versus everything
 * else: a query that ran out of its budget and a fetch the platform refused
 * are different conditions with different remedies.
 */
export const THROWN_ERROR_NAMES = [
  "TimeoutError",
  "AbortError",
  "TypeError",
  "DOMException",
  "NetworkError",
  "RangeError",
  "SyntaxError",
  "Error",
  "OTHER",
] as const;

export type ThrownErrorName = (typeof THROWN_ERROR_NAMES)[number];

export interface ThrownFetchDiagnostics {
  readonly errorName: ThrownErrorName;
  /** `AbortSignal.timeout` rejects with TimeoutError (older runtimes: AbortError). */
  readonly isTimeout: boolean;
}

/**
 * Reduces a caught value to its closed-vocabulary name and a timeout flag.
 *
 * Reads `name` ONLY. The message, the stack, the cause and any other property
 * are never read, so nothing an upstream or a platform put into an exception
 * can travel further than this function.
 */
export function describeThrown(error: unknown): ThrownFetchDiagnostics {
  const raw =
    typeof error === "object" && error !== null && typeof (error as { name?: unknown }).name === "string"
      ? (error as { name: string }).name
      : "OTHER";
  const errorName: ThrownErrorName = (THROWN_ERROR_NAMES as readonly string[]).includes(raw)
    ? (raw as ThrownErrorName)
    : "OTHER";
  return { errorName, isTimeout: errorName === "TimeoutError" || errorName === "AbortError" };
}

/**
 * Fixed-shape diagnostics.
 *
 * Deliberately holds no free text: no upstream message, no caught exception, no
 * header, no body. Upstream prose could carry anything, and this project's rule
 * is that only author-written strings reach a caller. The three fields added in
 * M11-A5 keep that rule: a closed-vocabulary error name, a boolean, an integer.
 */
export interface WclDiagnostics {
  readonly stage: WclFailureStage;
  readonly httpStatus: number | undefined;
  readonly graphqlErrorCount: number | undefined;
  /** Set only when `fetch` itself threw; the name is from `THROWN_ERROR_NAMES`. */
  readonly errorName: ThrownErrorName | undefined;
  /** Set only when `fetch` itself threw. */
  readonly isTimeout: boolean | undefined;
  /** The ordinal of the failing outbound request, when the bound fetch counts (see `countOutbound`). */
  readonly outboundIndex: number | undefined;
}

export interface WclFailure {
  readonly reason: WclFailureReason;
  readonly diagnostics: WclDiagnostics;
}

export function wclFailure(
  reason: WclFailureReason,
  stage: WclFailureStage,
  detail?: {
    readonly httpStatus?: number | undefined;
    readonly graphqlErrorCount?: number | undefined;
    readonly thrown?: ThrownFetchDiagnostics | undefined;
    readonly outboundIndex?: number | undefined;
  },
): WclFailure {
  return {
    reason,
    diagnostics: {
      stage,
      httpStatus: detail?.httpStatus,
      graphqlErrorCount: detail?.graphqlErrorCount,
      errorName: detail?.thrown?.errorName,
      isTimeout: detail?.thrown?.isTimeout,
      outboundIndex: detail?.outboundIndex,
    },
  };
}

/**
 * Operational metadata about this deployment's API client.
 *
 * Internal only. It is not gameplay data and it is not the caller's business,
 * so it never appears in an API response.
 */
export interface RateLimitSnapshot {
  readonly limitPerHour: number;
  readonly pointsSpentThisHour: number;
  readonly pointsResetIn: number;
}

/**
 * Factual identity of one player in one fight, as reported by Warcraft Logs.
 *
 * There is no partially-populated variant of this type. Either every field was
 * supplied by WCL, or resolution failed with a typed reason. That is the
 * structural fix for the old analyzer's half-hydrated actors, where a spec
 * resolved while name and class became null.
 *
 * `gameVersion` is nullable in the WCL schema, so it is nullable here. It is
 * recorded honestly and never invented; a null game version does not by itself
 * prevent identity resolution.
 */
export interface FightIdentity {
  readonly report: {
    readonly code: string;
    readonly revision: number;
    readonly startTime: number;
    readonly endTime: number;
  };
  readonly data: {
    readonly logVersion: number;
    readonly gameVersion: number | null;
  };
  readonly fight: {
    readonly id: number;
    readonly name: string;
    /** 0 identifies trash rather than an encounter. Recorded, not judged. */
    readonly encounterId: number;
    readonly difficulty: number | null;
    readonly startTime: number;
    readonly endTime: number;
  };
  readonly player: {
    readonly sourceId: number;
    readonly name: string;
    /** From `ReportActor.subType`, which is the class for players. */
    readonly className: string;
    /** From `friendlySpecs` at the player's index in `friendlyPlayers`. */
    readonly specName: string;
  };
}

export interface PreflightRequest {
  readonly reportCode: string;
  readonly fightId: number;
  readonly sourceId: number;
}

export type PreflightResult =
  | {
      readonly ok: true;
      readonly identity: FightIdentity;
      readonly rateLimit: RateLimitSnapshot | undefined;
    }
  | { readonly ok: false; readonly failure: WclFailure };

/**
 * The port the application service depends on.
 *
 * The service holds this function type and nothing else from the WCL layer, so
 * it cannot reach the network on its own.
 */
export type PreflightPort = (
  request: PreflightRequest,
  credentials: WclCredentials,
) => Promise<PreflightResult>;
