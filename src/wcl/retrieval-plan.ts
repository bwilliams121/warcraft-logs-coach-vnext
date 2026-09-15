import type { BoundKind } from "../engine/evidence/coverage.js";

/**
 * Event retrieval plans.
 *
 * A plan declares WHAT evidence to retrieve. It is deliberately incapable of
 * expressing the things that would quietly shrink the event set:
 *
 * - there is no `sourceID` / `targetID` field, so `PLAYER_CONTEXT` can never
 *   degrade into "only events sourced by the player" — the reading that removes
 *   the enemy and environment evidence actionability depends on
 * - there is no `wipeCutoff`, `filterExpression`, `killType`, `death` or aura
 *   filter, each of which truncates results in a way indistinguishable from
 *   absence
 *
 * Those arguments are not merely unused. They are absent from the type, so a
 * later change cannot set one without an obvious, reviewable edit here.
 *
 * The strategy is ONE chronological `dataType: All` stream per fight, not
 * filtered by actor. That gives native chronology, no cross-stream overlap to
 * deduplicate, and — because the stream is not parameterised by player — a
 * single fetch that a future raid-night mode can reuse across every raider
 * rather than re-downloading the same fight once per person.
 */

/**
 * Which hostility view to request.
 *
 * `UNSPECIFIED` omits the argument entirely, and it is what the analyzer uses.
 *
 * VERIFIED by live probe over a mid-fight window (7,550,000-7,560,000) where
 * combat was unambiguously active:
 *
 * - the unfiltered stream carried 202 boss-sourced events alongside 4,339
 *   player-sourced and 377 pet-sourced ones, plus environment events
 * - `Friendlies` and `Enemies` returned arrays IDENTICAL to the unfiltered one
 *
 * So `hostilityType` is inert for `dataType: All`, and the unfiltered stream is
 * already complete. An earlier probe that saw no enemy sources sampled only the
 * first 1.3 seconds of the pull, before the boss had acted — an artifact of the
 * window, not a property of the API.
 *
 * `FRIENDLY` and `ENEMY` are retained only so the plan can express a hostility
 * view if a future need is demonstrated. Nothing uses them.
 */
export type HostilitySelector = "UNSPECIFIED" | "FRIENDLY" | "ENEMY";

/** Verified `HostilityType` enum values from the public schema. */
export const HOSTILITY_TYPE_VALUES = {
  FRIENDLY: "Friendlies",
  ENEMY: "Enemies",
} as const;

/**
 * Events per page.
 *
 * Verified range is 100-10000; the API default is 300, which would need ~1000
 * requests for a large mythic pull and is not viable.
 *
 * MEASURED at this value, ingesting one full 24-player heroic pull
 * (qJ1pgB49ZrRNVmCd fight 6, 307,910 ms) with `includeResources: true`:
 *
 *     pages                 40
 *     events           196,366
 *     wall clock       ~8.2 s
 *     decoded JSON     ~54.8 MB
 *     largest page     ~1.45 MB
 *     point delta           41  (bracketed measurement, ~1 point per request)
 *
 * Note that `limit` is a SOFT cap: pages returned as many as 5,030 events,
 * because Warcraft Logs completes a millisecond rather than splitting a
 * timestamp group across pages.
 *
 * This is an evidence-supported initial operating value, NOT a claim of
 * optimality. The measurement suggests cost tracks requests rather than data
 * volume, which would favour a larger limit — but one measurement at one limit
 * is not a basis for changing it, and no comparison run has been made.
 */
export const EVENT_PAGE_LIMIT = 5000;

/**
 * Safety ceilings.
 *
 * These are guardrails against an unbounded loop, never a truncation policy.
 * Hitting any of them produces PARTIAL completeness with reason
 * SAFETY_LIMIT_REACHED, and can never produce COMPLETE.
 *
 * MAX_PAGES was sized against a 1000-subrequest working budget, and 200 pages
 * plus the token request sits well inside it. At EVENT_PAGE_LIMIT that is up to a
 * million events, comfortably above a large mythic pull.
 *
 * THE 1000 IS OURS, NOT CLOUDFLARE'S. An earlier revision of this comment called
 * it the current paid platform allowance; that is stale. Cloudflare Workers Paid
 * currently documents 10,000 subrequests per invocation, and M7 keeps the
 * stricter 1000 deliberately — see `RAID_NIGHT_SUBREQUEST_SAFETY_BUDGET` in
 * `src/services/raid-night-request.ts`, which records the reasoning and is what
 * the raid-night fight cap is derived from.
 *
 * This is a comment correction only. `MAX_PAGES` and every retrieval, pagination
 * and completeness semantic below are unchanged: the ceiling is still a guardrail
 * against an unbounded loop, still produces PARTIAL with SAFETY_LIMIT_REACHED,
 * and still never produces COMPLETE.
 *
 * MAX_ELAPSED_MS bounds wall clock so a slow upstream degrades into honest
 * PARTIAL evidence rather than a Worker timeout that yields nothing at all.
 */
export const MAX_PAGES = 200;
export const MAX_EVENTS = 1_000_000;
export const MAX_ELAPSED_MS = 25_000;

/**
 * Whether `events(endTime:)` includes events at exactly that instant.
 *
 * VERIFIED INCLUSIVE by live probe on 2026-09-11 against report
 * qJ1pgB49ZrRNVmCd fight 6. With `startTime: t-1`:
 *
 *     endTime = t-1  ->  0 events
 *     endTime = t    ->  4 events, all at exactly t, max timestamp = t
 *     endTime = t+1  ->  9 events, 4 of them still at t
 *
 * The same probe established that `startTime` is inclusive: a pagination cursor
 * passed back as `startTime` returns the event at exactly that timestamp. The
 * request window is therefore a fully closed interval.
 *
 * This is why a terminal page's covered range is `[start, endTime]` while a
 * non-terminal page's is `[start, cursor)` — the cursor is the first timestamp
 * NOT returned, which is a different thing from the requested end.
 */
export const EVENTS_END_TIME_BOUND: BoundKind = "INCLUSIVE";

export interface EventRetrievalPlan {
  readonly reportCode: string;
  readonly fightId: number;
  /**
   * Report-relative. Warcraft Logs treats both ends INCLUSIVELY, so this is the
   * closed interval `[startTimeMs, endTimeMs]`.
   */
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  /** Always `All`. Narrower data types cannot express targetability or unknown future types. */
  readonly dataType: "All";
  /** Declared by analyzer requirements, never hand-picked. Adds substantial bandwidth. */
  readonly includeResources: boolean;
  readonly limit: number;
  readonly hostility: readonly HostilitySelector[];
  /** Set explicitly rather than relied on as a default, so fixtures are reproducible. */
  readonly translate: true;
  /** Keeps events as compact ID references; names resolve from master data. */
  readonly useActorIDs: true;
  readonly useAbilityIDs: true;
}

export interface EventRetrievalPlanInput {
  readonly reportCode: string;
  readonly fightId: number;
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  readonly includeResources: boolean;
  readonly hostility?: readonly HostilitySelector[];
  readonly limit?: number;
}

export function createEventRetrievalPlan(input: EventRetrievalPlanInput): EventRetrievalPlan {
  return {
    reportCode: input.reportCode,
    fightId: input.fightId,
    startTimeMs: input.startTimeMs,
    endTimeMs: input.endTimeMs,
    dataType: "All",
    includeResources: input.includeResources,
    limit: input.limit ?? EVENT_PAGE_LIMIT,
    hostility: input.hostility ?? ["UNSPECIFIED"],
    translate: true,
    useActorIDs: true,
    useAbilityIDs: true,
  };
}

/** Stable stream identifier, used in every evidence locator. */
export function streamIdFor(hostility: HostilitySelector): string {
  switch (hostility) {
    case "UNSPECIFIED":
      return "all";
    case "FRIENDLY":
      return "all:friendlies";
    case "ENEMY":
      return "all:enemies";
  }
}

/** A plan summary safe to record in provenance. Carries no credential. */
export interface EventRetrievalPlanSummary {
  readonly dataType: "All";
  readonly limit: number;
  readonly includeResources: boolean;
  readonly hostility: readonly HostilitySelector[];
  readonly translate: true;
  readonly useActorIDs: true;
  readonly useAbilityIDs: true;
  readonly requestedStartTimeMs: number;
  readonly requestedEndTimeMs: number;
}

export function summarizePlan(plan: EventRetrievalPlan): EventRetrievalPlanSummary {
  return {
    dataType: plan.dataType,
    limit: plan.limit,
    includeResources: plan.includeResources,
    hostility: plan.hostility,
    translate: plan.translate,
    useActorIDs: plan.useActorIDs,
    useAbilityIDs: plan.useAbilityIDs,
    requestedStartTimeMs: plan.startTimeMs,
    requestedEndTimeMs: plan.endTimeMs,
  };
}
