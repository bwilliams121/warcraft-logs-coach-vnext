/**
 * CERTIFIED PREDICATE COVERAGE (M13-D): completeness that a filtered capture
 * earned by an exact certificate against a trusted Warcraft Logs table, for
 * ONE stated predicate only.
 *
 * WHY A SEPARATE SHAPE
 *
 * Category coverage (`CategoryCoverage`) says "every event of this family, for
 * these actors, over these ranges, was retrieved". A server-filtered capture can
 * never earn that: the M13-A aura stream holds fifteen ability ids, so an AURAS
 * grant would vouch for every other aura too. The owner rule of 2026-10-11
 * (restated 2026-11-02, agent/autopilot-queue.md "M13-D") lets a filtered
 * capture earn coverage only where a trusted table proves the SAME facts over
 * the same report, fight, interval, actor scope, family and predicate. So the
 * coverage carries its predicate, and a claim is admitted only when it states a
 * predicate inside it. A claim that states none (every existing caller) is
 * decided by category coverage alone, exactly as before.
 *
 * TWO PREDICATES, EACH THE EXACT SHAPE A TABLE CAN PROVE
 *
 *   AURA_WINDOWS     one buff ability. A LISTING over every friendly target
 *                    is proven when `excludedTargetActorIds` is empty: the
 *                    Friendlies table holds every friendly holder. ONE
 *                    target's track is proven only for an actor in
 *                    `provenTargetActorIds`: one the Friendlies table itself
 *                    LISTS, whose observed windows ARE its computed bands and
 *                    whose applications plus refreshes are its uses. An actor
 *                    the table does not list (hostile, unresolved, or never
 *                    examined) is never proven one at a time; a target the
 *                    table cannot show per instance is excluded.
 *   COMPLETED_CASTS  one source actor: for each listed ability, the completed
 *                    `cast` events are the table's count. An ability the table
 *                    does not list is never included (the table omits whole
 *                    abilities), so a zero is never certified.
 *
 * WHAT IT NEVER IS
 *
 * - Never gameplay authority: it proves retrieval completeness for its
 *   predicate, nothing about recipient quality, timing or play.
 * - Never widened: no tolerance, no similar predicate, no inference from a
 *   neighbouring ability or target.
 * - Never attached in production today: no production path retrieves the
 *   tables. It is attached only by `withCertifiedCoverage` from a reviewed
 *   certification of the fight's own events.
 */

import { classifyCoverage, intersectRangeLists, type TimeRangeMs } from "./coverage.js";

export const CERTIFIED_COVERAGE_REVISION = "certified-coverage/1" as const;

export type CertifiedCoverage =
  | {
      readonly kind: "AURA_WINDOWS";
      readonly abilityGameId: number;
      /** Buffs on friendly targets only: both the capture and the table are `hostilityType: Friendlies`. */
      readonly targetHostility: "FRIENDLIES";
      /** Targets the certificate examined and could not prove. Empty: the listing over every friendly target is proven. */
      readonly excludedTargetActorIds: readonly number[];
      /** Ascending. Targets the Friendlies table lists AND the certificate matched: the only ones a ONE_TARGET claim may name. */
      readonly provenTargetActorIds: readonly number[];
      readonly range: TimeRangeMs;
      /** The certificate this coverage rests on, for "why is this COMPLETE?". */
      readonly certificateId: string;
    }
  | {
      readonly kind: "COMPLETED_CASTS";
      readonly sourceActorId: number;
      /** Ascending. Only abilities the table lists with an equal count. */
      readonly abilityGameIds: readonly number[];
      readonly range: TimeRangeMs;
      readonly certificateId: string;
    };

/** The predicate a claim states. Its category is implied: AURAS or CASTS. */
export type ClaimPredicate =
  | {
      readonly kind: "AURA_WINDOWS";
      readonly abilityGameIds: readonly number[];
      /** EVERY_FRIENDLY_TARGET: a listing over every recipient; ONE_TARGET: one recipient's track. */
      readonly targets:
        | { readonly kind: "EVERY_FRIENDLY_TARGET" }
        | { readonly kind: "ONE_TARGET"; readonly actorId: number };
    }
  | {
      readonly kind: "COMPLETED_CASTS";
      readonly sourceActorId: number;
      readonly abilityGameIds: readonly number[];
    };

export const CATEGORY_OF_PREDICATE = { AURA_WINDOWS: "AURAS", COMPLETED_CASTS: "CASTS" } as const;

function rangeInside(range: TimeRangeMs, covered: TimeRangeMs): boolean {
  return classifyCoverage(intersectRangeLists([covered], [range]), range) === "COMPLETE";
}

/** Whether ONE certified coverage proves the claim for one ability. */
function coversAbility(
  coverage: CertifiedCoverage,
  predicate: ClaimPredicate,
  abilityGameId: number,
): boolean {
  if (coverage.kind === "AURA_WINDOWS" && predicate.kind === "AURA_WINDOWS") {
    if (coverage.abilityGameId !== abilityGameId) return false;
    return predicate.targets.kind === "EVERY_FRIENDLY_TARGET"
      ? coverage.excludedTargetActorIds.length === 0
      : coverage.provenTargetActorIds.includes(predicate.targets.actorId);
  }
  if (coverage.kind === "COMPLETED_CASTS" && predicate.kind === "COMPLETED_CASTS") {
    return (
      coverage.sourceActorId === predicate.sourceActorId && coverage.abilityGameIds.includes(abilityGameId)
    );
  }
  return false;
}

/**
 * Whether the certified coverages prove a claim over `range`: EVERY ability the
 * predicate names must be proven over the WHOLE range by one coverage. An empty
 * ability list proves nothing.
 */
export function certifiedCoverageCovers(
  coverages: readonly CertifiedCoverage[],
  predicate: ClaimPredicate,
  range: TimeRangeMs,
): boolean {
  if (predicate.abilityGameIds.length === 0) return false;
  return predicate.abilityGameIds.every((abilityGameId) =>
    coverages.some(
      (coverage) => coversAbility(coverage, predicate, abilityGameId) && rangeInside(range, coverage.range),
    ),
  );
}
