/**
 * Establishing an external reference pull's factual identity — and nothing more.
 *
 * WHAT "QUALIFIED" MEANS HERE, PRECISELY
 *
 *     we established this external reference's factual identity and context
 *
 * It does NOT mean we established it as gameplay-comparable. Those are different
 * claims and M8-F makes only the first. Comparability is M8-B's answer, it is
 * computed from the qualified facts rather than assumed from them, and across
 * reports it is currently UNKNOWN — because `version-evidence.ts` permits no raw
 * version field to establish compatibility in either direction.
 *
 * That UNKNOWN is the correct output of this checkpoint, not a gap in it. A
 * candidate that matches on encounter, difficulty, requested partition and
 * duration still comes back UNKNOWN, and there is deliberately no external
 * special case that could make it say otherwise.
 *
 * METADATA ONLY
 *
 * Nothing here retrieves, decodes or reasons about a combat event. This module
 * imports no event query, no paginator, no ingestion function and no
 * `CombatState`, and a layering test asserts that for the whole domain. If a
 * fact needs external events, it is deferred rather than fetched: M8-A measured
 * one external full-event ingestion at 202 subrequests against a budget already
 * spending 810 on a four-pull raid night.
 */

import { normalizeFightContext } from "../engine/normalization/fight-context.js";
import type { EncounterOutcomeFacts, ZoneMetadata } from "../engine/normalization/encounter-facts.js";
import type { CombatActor } from "../engine/normalization/actors.js";
import {
  assessPullComparability,
  type PullComparabilityAssessment,
} from "../comparison/pull-comparability.js";
import { pullOutcomeOf, type PullContext } from "../comparison/pull-identity.js";
import type { RawFightContextReport } from "../wcl/fight-context-query.js";
import type { ExternalCandidateDescriptor } from "./candidate-pool.js";

/**
 * Why one candidate could not be established.
 *
 * CANDIDATE-LOCAL, ALWAYS. None of these fails the discovery, the other
 * candidates, or — emphatically — the local same-report progression context,
 * which is computed entirely without this module.
 */
export type CandidateFailureReason =
  /** Warcraft Logs served no report for that code, or will not serve it to us. */
  | "REPORT_NOT_ACCESSIBLE"
  /** Archived and not accessible to a client-credentials token. */
  | "REPORT_ARCHIVED_INACCESSIBLE"
  /** The report is readable; the fight id is not in it. */
  | "FIGHT_NOT_FOUND"
  /** The typed fight metadata could not be normalized. */
  | "FIGHT_METADATA_INVALID"
  /** The fight is a different encounter from the one we searched. */
  | "ENCOUNTER_MISMATCH"
  /** The fight is a different difficulty from the one we searched. */
  | "DIFFICULTY_MISMATCH"
  /** No actor matched the ranking row's identity. */
  | "SOURCE_UNRESOLVED"
  /** More than one actor matched. Never resolved by taking the first. */
  | "SOURCE_AMBIGUOUS";

export const CANDIDATE_FAILURE_REASONS = [
  "REPORT_NOT_ACCESSIBLE",
  "REPORT_ARCHIVED_INACCESSIBLE",
  "FIGHT_NOT_FOUND",
  "FIGHT_METADATA_INVALID",
  "ENCOUNTER_MISMATCH",
  "DIFFICULTY_MISMATCH",
  "SOURCE_UNRESOLVED",
  "SOURCE_AMBIGUOUS",
] as const satisfies readonly CandidateFailureReason[];

/**
 * Deterministic provenance for one established reference.
 *
 * NO WALL CLOCK, NO GENERATED ID, NO RETRIEVAL TIMESTAMP. Every value is either
 * a Warcraft Logs fact or a query parameter we chose. `reportRevision` is the
 * external report's own revision — its snapshot identity, which is NOT shared
 * with our subject report and must never be compared as though it were.
 */
export interface ExternalReferenceProvenance {
  readonly reportCode: string;
  readonly reportRevision: number;
  readonly fightId: number;
  /** Only after a UNIQUE identity match. `null` is never a guess. */
  readonly sourceId: number | null;
  readonly gameVersion: number | null;
  readonly logVersion: number | null;
}

export interface QualifiedExternalReference {
  readonly descriptor: ExternalCandidateDescriptor;
  readonly provenance: ExternalReferenceProvenance;
  /** Typed fight facts, normalized by M3's rules rather than a parallel decoder. */
  readonly encounterId: number;
  readonly difficulty: number | null;
  readonly durationMs: number;
  readonly kill: boolean | null;
  readonly encounterFacts: EncounterOutcomeFacts;
  readonly zone: ZoneMetadata | null;
  /**
   * M8-B's verdict against the subject pull.
   *
   * Computed, never assumed, and never bypassed. Expect UNKNOWN across reports
   * while cross-report version semantics remain unproven.
   */
  readonly comparability: PullComparabilityAssessment;
}

export type CandidateQualification =
  | { readonly outcome: "QUALIFIED"; readonly reference: QualifiedExternalReference }
  | {
      readonly outcome: "FAILED";
      readonly reportCode: string;
      readonly fightId: number;
      readonly reason: CandidateFailureReason;
    };

/**
 * How a ranking row's player was matched to a report actor.
 *
 * `NAME_AND_SERVER` is the strong form and is preferred whenever the ranking row
 * carried a server — M8-A measured 92 of 100 rows carrying one.
 *
 * `NAME_ONLY` is the fallback for a row with no server, and it is recorded so a
 * reader can see which rows rest on the weaker intersection. It still requires
 * a UNIQUE match: a name shared by two actors resolves to AMBIGUOUS, never to
 * the first one.
 *
 * Region is deliberately not part of the intersection: `CombatActor` carries a
 * server NAME and no region, so there is no region on our side to match against.
 * Inventing one would be a fabricated identity field.
 */
export type SourceMatchBasis = "NAME_AND_SERVER" | "NAME_ONLY";

export type SourceResolution =
  | { readonly kind: "RESOLVED"; readonly sourceId: number; readonly basis: SourceMatchBasis }
  | { readonly kind: "UNRESOLVED" }
  | { readonly kind: "AMBIGUOUS"; readonly matchCount: number };

/**
 * Resolves a ranking row's player against the report's actor catalog.
 *
 * THE COUNT DECIDES, NOT THE POSITION. Exactly one match resolves; zero is
 * UNRESOLVED; more than one is AMBIGUOUS. Nothing takes `matches[0]`, and player
 * names are not assumed globally unique — M8-A resolved three candidates
 * uniquely, including one in a 1,364-actor cross-realm report, which is
 * encouraging evidence and not a guarantee.
 */
export function resolveSourceActor(
  actors: ReadonlyMap<number, CombatActor>,
  descriptor: ExternalCandidateDescriptor,
): SourceResolution {
  const players = [...actors.values()].filter(
    (actor) => actor.actorType === "PLAYER" && actor.name === descriptor.playerName,
  );

  if (descriptor.serverName !== null) {
    const exact = players.filter((actor) => actor.server === descriptor.serverName);
    if (exact.length === 1) {
      const only = exact[0];
      if (only !== undefined) {
        return { kind: "RESOLVED", sourceId: only.actorId, basis: "NAME_AND_SERVER" };
      }
    }
    if (exact.length > 1) {
      return { kind: "AMBIGUOUS", matchCount: exact.length };
    }
    // Zero server-qualified matches. Fall through to the name-only test rather
    // than concluding: the report may simply record no server for this actor.
  }

  if (players.length === 1) {
    const only = players[0];
    if (only !== undefined) {
      return { kind: "RESOLVED", sourceId: only.actorId, basis: "NAME_ONLY" };
    }
  }
  return players.length === 0 ? { kind: "UNRESOLVED" } : { kind: "AMBIGUOUS", matchCount: players.length };
}

export interface CandidateQualificationInput {
  readonly descriptor: ExternalCandidateDescriptor;
  /** The typed metadata response, or `null` when the report was not served. */
  readonly report: RawFightContextReport | null;
  /** What the discovery searched for. A mismatch is a candidate-local failure. */
  readonly expectedEncounterId: number;
  readonly expectedDifficulty: number | null;
  /** The subject pull, for M8-B. Supplied by the caller; never rebuilt here. */
  readonly subject: PullContext;
}

function failed(
  descriptor: ExternalCandidateDescriptor,
  reason: CandidateFailureReason,
): CandidateQualification {
  return {
    outcome: "FAILED",
    reportCode: descriptor.reportCode,
    fightId: descriptor.fightId,
    reason,
  };
}

/**
 * Qualifies one candidate from its typed metadata. Pure.
 *
 * Retrieval happens in `external-discovery.ts`; this function only interprets a
 * response, which is what makes every case below testable without a transport.
 */
export function qualifyCandidate(input: CandidateQualificationInput): CandidateQualification {
  const { descriptor, report } = input;

  if (report === null) {
    return failed(descriptor, "REPORT_NOT_ACCESSIBLE");
  }

  // Archive gate, mirroring the ingestion path's rule: archived AND inaccessible
  // is a refusal, and the schema documents `isAccessible` as always false
  // without user authentication.
  if (
    report.archiveStatus !== null &&
    report.archiveStatus.isArchived &&
    !report.archiveStatus.isAccessible
  ) {
    return failed(descriptor, "REPORT_ARCHIVED_INACCESSIBLE");
  }

  if (report.fights.length === 0) {
    return failed(descriptor, "FIGHT_NOT_FOUND");
  }

  // M3's normalizer, unchanged. External candidates get the same null handling,
  // the same range validation and the same M8-C outcome facts as a local fight.
  const normalized = normalizeFightContext(report, descriptor.fightId);
  if (!normalized.ok) {
    return failed(
      descriptor,
      normalized.reason === "FIGHT_NOT_FOUND" ? "FIGHT_NOT_FOUND" : "FIGHT_METADATA_INVALID",
    );
  }

  const fight = normalized.fight;

  // The ranking board said this pull was our encounter and difficulty. Verify it
  // against typed evidence rather than trusting the untyped board.
  if (fight.encounterId !== input.expectedEncounterId) {
    return failed(descriptor, "ENCOUNTER_MISMATCH");
  }
  if (input.expectedDifficulty !== null && fight.difficulty !== input.expectedDifficulty) {
    return failed(descriptor, "DIFFICULTY_MISMATCH");
  }

  const source = resolveSourceActor(normalized.actors.actors, descriptor);
  if (source.kind === "UNRESOLVED") {
    return failed(descriptor, "SOURCE_UNRESOLVED");
  }
  if (source.kind === "AMBIGUOUS") {
    return failed(descriptor, "SOURCE_AMBIGUOUS");
  }

  // M8-B, called rather than bypassed. The external reference is described as a
  // `PullContext` exactly like a local pull, so the same rules apply to it — and
  // the version dimension resolves UNKNOWN across reports, which is the point.
  const reference: PullContext = {
    identity: {
      reportCode: report.code,
      reportRevision: report.revision,
      fightId: fight.id,
      encounterId: fight.encounterId,
      difficulty: fight.difficulty,
      version: {
        gameVersion: report.gameVersion,
        logVersion: report.logVersion,
        // Not a typed field on any report or fight. The ranking PARTITION we
        // requested is a retrieval filter and is not evidence about this pull.
        partition: null,
      },
    },
    outcome: pullOutcomeOf(fight.kill),
    durationMs: fight.durationMs,
    raidSize: fight.size,
  };

  return {
    outcome: "QUALIFIED",
    reference: {
      descriptor,
      provenance: {
        reportCode: report.code,
        reportRevision: report.revision,
        fightId: fight.id,
        sourceId: source.sourceId,
        gameVersion: report.gameVersion,
        logVersion: report.logVersion,
      },
      encounterId: fight.encounterId,
      difficulty: fight.difficulty,
      durationMs: fight.durationMs,
      kill: fight.kill,
      encounterFacts: fight.outcome,
      zone: normalized.zone,
      comparability: assessPullComparability(input.subject, reference),
    },
  };
}
