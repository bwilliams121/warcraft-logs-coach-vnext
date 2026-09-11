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
 * Fixed-shape diagnostics.
 *
 * Deliberately holds no free text: no upstream message, no caught exception, no
 * header, no body. Upstream prose could carry anything, and this project's rule
 * is that only author-written strings reach a caller.
 */
export interface WclDiagnostics {
  readonly stage: WclFailureStage;
  readonly httpStatus: number | undefined;
  readonly graphqlErrorCount: number | undefined;
}

export interface WclFailure {
  readonly reason: WclFailureReason;
  readonly diagnostics: WclDiagnostics;
}

export function wclFailure(
  reason: WclFailureReason,
  stage: WclFailureStage,
  detail?: { readonly httpStatus?: number | undefined; readonly graphqlErrorCount?: number | undefined },
): WclFailure {
  return {
    reason,
    diagnostics: {
      stage,
      httpStatus: detail?.httpStatus,
      graphqlErrorCount: detail?.graphqlErrorCount,
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
