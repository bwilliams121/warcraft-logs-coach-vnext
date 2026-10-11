/**
 * Selecting the comparable elite cohort (M11-G1). Pure functions: no request,
 * no clock, no randomness, and no API retrieval order.
 *
 * WHAT A COHORT IS FOR, AND WHAT IT IS NOT
 *
 * A barometer: observed DPS, item level, duration and build context of up to
 * three high-performing kills of the same encounter, difficulty and spec. It
 * never sets the subject's ceiling, never measures execution loss, never
 * yields an APL verdict and never scales anything (owner decision).
 *
 * THE ORDER, EXACTLY
 *
 * Among candidates passing the current rung, the highest ranked DPS first;
 * ties by report code, then fight id, then character name — code-point order
 * throughout. The three HIGHEST qualifying candidates are the cohort, never
 * the three nearest in duration.
 */

import type { HeroTreeResolution } from "../data/game/talent-selection.js";
import type { GearPiece } from "../engine/normalization/normalized-events.js";
import type { CandidateContext, DecodeOutcome, RankedCohortRow } from "../wcl/cohort/cohort-decoders.js";
import type { CohortRung } from "./cohort-config.js";

export type CandidateExclusion =
  | "HIDDEN"
  | "ANONYMOUS"
  | "SUBJECT_ITSELF"
  | "SOURCE_UNRESOLVED"
  | "SOURCE_AMBIGUOUS"
  | "SPEC_MISMATCH"
  | "NOT_KILL"
  | "DIED_BEFORE_END"
  | "DURATION_OUTSIDE_WINDOW"
  | "ILVL_OUTSIDE_WINDOW"
  | "CONTEXT_UNAVAILABLE"
  | "MALFORMED_EVIDENCE";

export const CANDIDATE_EXCLUSIONS = [
  "HIDDEN",
  "ANONYMOUS",
  "SUBJECT_ITSELF",
  "SOURCE_UNRESOLVED",
  "SOURCE_AMBIGUOUS",
  "SPEC_MISMATCH",
  "NOT_KILL",
  "DIED_BEFORE_END",
  "DURATION_OUTSIDE_WINDOW",
  "ILVL_OUTSIDE_WINDOW",
  "CONTEXT_UNAVAILABLE",
  "MALFORMED_EVIDENCE",
] as const satisfies readonly CandidateExclusion[];

/** What the cohort is compared against. */
export interface CohortSubject {
  readonly reportCode: string;
  readonly fightId: number;
  readonly encounterId: number;
  readonly difficulty: number;
  readonly className: string;
  readonly specName: string;
  readonly durationMs: number;
  readonly itemLevel: number;
}

export interface CandidateKey {
  readonly reportCode: string;
  readonly fightId: number;
  readonly name: string;
  readonly serverName: string | null;
}

export function candidateKeyOf(row: RankedCohortRow): CandidateKey {
  return { reportCode: row.reportCode, fightId: row.fightId, name: row.name, serverName: row.serverName };
}

export function candidateKeyString(key: CandidateKey): string {
  return `${key.reportCode}#${String(key.fightId)}#${key.name}#${key.serverName ?? "-"}`;
}

const codePoint = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

/** Highest ranked DPS first; ties by report code, fight id, name. */
export function orderCandidates(rows: readonly RankedCohortRow[]): readonly RankedCohortRow[] {
  return [...rows].sort(
    (left, right) =>
      right.amount - left.amount ||
      codePoint(left.reportCode, right.reportCode) ||
      left.fightId - right.fightId ||
      codePoint(left.name, right.name),
  );
}

const withinDuration = (durationMs: number, subject: CohortSubject, rung: CohortRung): boolean =>
  Math.abs(durationMs - subject.durationMs) <= rung.durationFraction * subject.durationMs;

const withinItemLevel = (itemLevel: number, subject: CohortSubject, rung: CohortRung): boolean =>
  Math.abs(itemLevel - subject.itemLevel) <= rung.itemLevelWindow;

/**
 * The checks a ranking row alone can decide. `null` passes the row to
 * qualification; a reason excludes it at this rung.
 */
export function rowExclusion(
  row: RankedCohortRow,
  subject: CohortSubject,
  rung: CohortRung,
): CandidateExclusion | null {
  if (row.hidden) return "HIDDEN";
  if (row.name === "Anonymous" || row.reportCode.startsWith("a:")) return "ANONYMOUS";
  if (row.reportCode === subject.reportCode && row.fightId === subject.fightId) return "SUBJECT_ITSELF";
  if (row.className !== subject.className || row.specName !== subject.specName) return "SPEC_MISMATCH";
  if (row.bracketData === null) return "MALFORMED_EVIDENCE";
  if (!withinDuration(row.durationMs, subject, rung)) return "DURATION_OUTSIDE_WINDOW";
  if (!withinItemLevel(row.bracketData, subject, rung)) return "ILVL_OUTSIDE_WINDOW";
  return null;
}

/** One qualified comparable kill. */
export interface CohortMember {
  readonly comparisonRef: { readonly reportCode: string; readonly fightId: number; readonly actorId: number };
  /** Live identity, for a user-facing reference. Committed evidence holds pseudonyms only. */
  readonly liveIdentity: { readonly name: string; readonly serverName: string | null };
  /** The ranked dps amount: the same basis as the subject's ACTUAL_DPS (pinned). */
  readonly dps: number;
  readonly durationMs: number;
  readonly itemLevel: number;
  readonly gear: readonly GearPiece[];
  readonly talentTree: readonly { readonly id: number; readonly nodeId: number | null }[];
  readonly heroTree: HeroTreeResolution;
  /** Positive-only: the fight's Deaths table holds no entry for this actor. Never "survived". */
  readonly deathCheck: "NO_DEATHS_TABLE_ENTRY";
}

export type CandidateQualification =
  | { readonly status: "QUALIFIED"; readonly member: CohortMember }
  | { readonly status: "EXCLUDED"; readonly reason: CandidateExclusion };

/** Ranked amounts on the board and in the report's own rankings may differ only by representation. */
const AMOUNT_TOLERANCE = 0.01;

/**
 * Qualifies one candidate from its fetched context. Every check is a fact
 * from the candidate's own report; nothing about how well they played.
 */
export function qualifyCandidate(
  row: RankedCohortRow,
  context: DecodeOutcome<CandidateContext>,
  subject: CohortSubject,
  rung: CohortRung,
  resolveHeroTree: (
    entries: readonly { readonly id: number; readonly nodeId: number | null }[],
  ) => HeroTreeResolution,
): CandidateQualification {
  const excluded = (reason: CandidateExclusion): CandidateQualification => ({ status: "EXCLUDED", reason });
  if (context.outcome === "REPORT_NOT_ACCESSIBLE" || context.outcome === "FIGHT_NOT_FOUND") {
    return excluded("CONTEXT_UNAVAILABLE");
  }
  if (context.outcome === "PAYLOAD_UNRECOGNISED") return excluded("MALFORMED_EVIDENCE");
  const { fight, players, rankings, playerDetails, deaths } = context.value;
  if (fight.encounterId !== subject.encounterId || fight.difficulty !== subject.difficulty) {
    return excluded("MALFORMED_EVIDENCE");
  }
  if (fight.kill !== true) return excluded("NOT_KILL");

  // Identity, the M8-F rule: a server-qualified match first; with none, a unique
  // name-only match; more than one match at either stage is AMBIGUOUS.
  const named = players.filter((player) => player.name === row.name);
  const exact = row.serverName === null ? [] : named.filter((player) => player.serverName === row.serverName);
  if (exact.length > 1) return excluded("SOURCE_AMBIGUOUS");
  const pool = exact.length === 1 ? exact : named;
  if (pool.length === 0) return excluded("SOURCE_UNRESOLVED");
  if (pool.length > 1) return excluded("SOURCE_AMBIGUOUS");
  const actor = pool[0];
  if (actor === undefined) return excluded("SOURCE_UNRESOLVED");

  const detail = playerDetails.find((entry) => entry.actorId === actor.actorId);
  if (detail === undefined) return excluded("CONTEXT_UNAVAILABLE");
  if (detail.specs.length !== 1 || detail.specs[0] !== subject.specName) return excluded("SPEC_MISMATCH");

  const durationMs = fight.endTimeMs - fight.startTimeMs;
  if (!withinDuration(durationMs, subject, rung)) return excluded("DURATION_OUTSIDE_WINDOW");
  if (row.bracketData === null || !withinItemLevel(row.bracketData, subject, rung))
    return excluded("ILVL_OUTSIDE_WINDOW");

  const ranked = rankings?.characters.find(
    (character) =>
      character.name === row.name && (row.serverName === null || character.serverName === row.serverName),
  );
  if (ranked !== undefined && Math.abs(ranked.amount - row.amount) > AMOUNT_TOLERANCE)
    return excluded("MALFORMED_EVIDENCE");

  if (deaths.some((death) => death.actorId === actor.actorId && death.timestampMs <= fight.endTimeMs)) {
    return excluded("DIED_BEFORE_END");
  }
  if (detail.gear === null || detail.talentTree === null) return excluded("CONTEXT_UNAVAILABLE");

  return {
    status: "QUALIFIED",
    member: {
      comparisonRef: { reportCode: row.reportCode, fightId: row.fightId, actorId: actor.actorId },
      liveIdentity: { name: actor.name, serverName: actor.serverName },
      dps: row.amount,
      durationMs,
      itemLevel: row.bracketData,
      gear: detail.gear,
      talentTree: detail.talentTree,
      heroTree: resolveHeroTree(detail.talentTree),
      deathCheck: "NO_DEATHS_TABLE_ENTRY",
    },
  };
}

export type CohortStatus = "OK" | "RANGE_ONLY" | "INSUFFICIENT";

export interface CohortSummary {
  readonly status: CohortStatus;
  readonly medianDps: number | null;
  readonly minDps: number | null;
  readonly maxDps: number | null;
}

/**
 * Three members: OK, median and range. Two: RANGE_ONLY, the range and no
 * median — two values support no outlier claim. Fewer: INSUFFICIENT.
 */
export function summarizeCohort(members: readonly CohortMember[]): CohortSummary {
  const dps = members.map((member) => member.dps).sort((left, right) => left - right);
  if (dps.length < 2) return { status: "INSUFFICIENT", medianDps: null, minDps: null, maxDps: null };
  const min = dps[0] ?? null;
  const max = dps[dps.length - 1] ?? null;
  if (dps.length === 2) return { status: "RANGE_ONLY", medianDps: null, minDps: min, maxDps: max };
  return { status: "OK", medianDps: dps[Math.floor(dps.length / 2)] ?? null, minDps: min, maxDps: max };
}
