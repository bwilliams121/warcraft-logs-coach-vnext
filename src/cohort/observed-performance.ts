/**
 * The subject's OBSERVED performance (M11-G1): Warcraft Logs' own DPS for the
 * player in the fight, the fight duration, and Warcraft Logs' item level.
 *
 * ACTUAL_DPS IS READ, NEVER RECONSTRUCTED
 *
 * It is Warcraft Logs' DamageDone table `total` for the player's report actor,
 * divided by the table's `totalTime` in seconds. The G1 capture of report
 * b1PmaKrd6CDfzngc fight 48 pinned what that means:
 *
 *   - `totalTime` equals the fight's `endTime - startTime` (345,177 ms);
 *   - `total / totalTime` equals the ranked dps `amount` for EVERY player
 *     present in both surfaces (19 of 19), including a player who died and
 *     was resurrected — so the denominator is the full fight, not active time;
 *   - the table `itemLevel` equals the ranking `bracketData` (19 of 19).
 *
 * It is never computed from normalized raw `amount` events: the same capture
 * shows that sum (45,709,411) is NOT the Warcraft Logs total (45,802,009),
 * and M1 remains NOT_YET_PROVEN. M11-G4-4 reconciled `total` to the unit for
 * the canonical subject (owner + owned pets, amount + absorbed, hostile NPCs
 * only, minus damage credited to another player); nothing here depends on it.
 *
 * The subject's own ranking row is NOT required. When it exists and its
 * amount disagrees with the table, the surfaces no longer mean what the
 * capture pinned, and ACTUAL_DPS fails closed.
 */

import type { DecodeOutcome, SubjectPerformanceSurfaces } from "../wcl/cohort/cohort-decoders.js";

export const ACTUAL_DPS_SOURCE = "WCL_DAMAGE_DONE_TABLE_TOTAL_PER_FIGHT_SECOND";
export const ITEM_LEVEL_SOURCE = "WCL_DAMAGE_DONE_TABLE_ITEM_LEVEL";
/** Ranked amount and table DPS may differ only by floating-point representation. */
const RANKED_AGREEMENT_TOLERANCE = 0.01;

export type SubjectEligibility =
  | { readonly status: "ELIGIBLE" }
  | {
      readonly status: "NOT_ELIGIBLE";
      readonly reason:
        | "NOT_KILL"
        | "KILL_UNKNOWN"
        | "SPEC_UNRESOLVED"
        | "REPORT_NOT_ACCESSIBLE"
        | "FIGHT_NOT_FOUND"
        | "SURFACE_UNRECOGNISED";
    };

export type ActualDps =
  | {
      readonly status: "OBSERVED";
      readonly value: number;
      readonly source: typeof ACTUAL_DPS_SOURCE;
      readonly evidence: {
        readonly total: number;
        readonly totalTimeMs: number;
        readonly fightDurationMs: number;
        readonly rankedAmount: number | null;
        readonly rankedAgreement: "EQUAL" | "NOT_RANKED";
      };
    }
  | {
      readonly status: "UNAVAILABLE";
      readonly reason:
        | "SURFACE_UNAVAILABLE"
        | "NO_DAMAGE_DONE_ENTRY"
        | "TABLE_TIME_IS_NOT_FIGHT_DURATION"
        | "RANKED_AMOUNT_DISAGREES";
    };

export type ObservedItemLevel =
  | { readonly status: "OBSERVED"; readonly value: number; readonly source: typeof ITEM_LEVEL_SOURCE }
  | { readonly status: "UNAVAILABLE"; readonly reason: "SURFACE_UNAVAILABLE" | "NOT_SUPPLIED" };

export interface ObservedPerformance {
  readonly actualDps: ActualDps;
  readonly durationMs: number | null;
  readonly itemLevel: ObservedItemLevel;
  readonly eligibility: SubjectEligibility;
  /** The subject fight's ranking partition, when its report rankings carry one. */
  readonly partition: number | null;
}

export interface SubjectIdentity {
  readonly actorId: number;
  readonly name: string;
  readonly serverName: string | null;
  /** Whether the analysis resolved the subject's specialization. */
  readonly specResolved: boolean;
}

export function observedPerformanceOf(
  decoded: DecodeOutcome<SubjectPerformanceSurfaces>,
  subject: SubjectIdentity,
): ObservedPerformance {
  if (decoded.outcome !== "DECODED") {
    const reason =
      decoded.outcome === "REPORT_NOT_ACCESSIBLE"
        ? "REPORT_NOT_ACCESSIBLE"
        : decoded.outcome === "FIGHT_NOT_FOUND"
          ? "FIGHT_NOT_FOUND"
          : "SURFACE_UNRECOGNISED";
    return {
      actualDps: { status: "UNAVAILABLE", reason: "SURFACE_UNAVAILABLE" },
      durationMs: null,
      itemLevel: { status: "UNAVAILABLE", reason: "SURFACE_UNAVAILABLE" },
      eligibility: { status: "NOT_ELIGIBLE", reason },
      partition: null,
    };
  }
  const { fight, damageDone, rankings } = decoded.value;
  const fightDurationMs = fight.endTimeMs - fight.startTimeMs;
  const eligibility: SubjectEligibility =
    fight.kill === null
      ? { status: "NOT_ELIGIBLE", reason: "KILL_UNKNOWN" }
      : !fight.kill
        ? { status: "NOT_ELIGIBLE", reason: "NOT_KILL" }
        : !subject.specResolved
          ? { status: "NOT_ELIGIBLE", reason: "SPEC_UNRESOLVED" }
          : { status: "ELIGIBLE" };

  const entry = damageDone.entries.find((candidate) => candidate.actorId === subject.actorId);
  const ranked =
    rankings?.characters.find(
      (character) =>
        character.name === subject.name &&
        (subject.serverName === null ||
          character.serverName === null ||
          character.serverName === subject.serverName),
    ) ?? null;

  let actualDps: ActualDps;
  if (entry === undefined) {
    actualDps = { status: "UNAVAILABLE", reason: "NO_DAMAGE_DONE_ENTRY" };
  } else if (damageDone.totalTimeMs !== fightDurationMs) {
    actualDps = { status: "UNAVAILABLE", reason: "TABLE_TIME_IS_NOT_FIGHT_DURATION" };
  } else {
    const value = entry.total / (damageDone.totalTimeMs / 1000);
    if (ranked !== null && Math.abs(ranked.amount - value) > RANKED_AGREEMENT_TOLERANCE) {
      actualDps = { status: "UNAVAILABLE", reason: "RANKED_AMOUNT_DISAGREES" };
    } else {
      actualDps = {
        status: "OBSERVED",
        value,
        source: ACTUAL_DPS_SOURCE,
        evidence: {
          total: entry.total,
          totalTimeMs: damageDone.totalTimeMs,
          fightDurationMs,
          rankedAmount: ranked?.amount ?? null,
          rankedAgreement: ranked === null ? "NOT_RANKED" : "EQUAL",
        },
      };
    }
  }

  return {
    actualDps,
    durationMs: fightDurationMs,
    itemLevel:
      entry?.itemLevel === undefined || entry.itemLevel === null
        ? { status: "UNAVAILABLE", reason: "NOT_SUPPLIED" }
        : { status: "OBSERVED", value: entry.itemLevel, source: ITEM_LEVEL_SOURCE },
    eligibility,
    partition: rankings?.partition ?? null,
  };
}
