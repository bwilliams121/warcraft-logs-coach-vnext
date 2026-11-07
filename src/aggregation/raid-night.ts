/**
 * The internal raid-night domain, and the gate that guards entry to it.
 *
 * WHAT THIS IS
 *
 * Types the aggregation domain needs in order to be correct — not types a wire
 * format will eventually want. There is no `schemaVersion`, no Zod schema, no
 * capability object and no transport shape anywhere below. A public contract is
 * a separate decision made by a separate layer against this one; building it
 * here would freeze a wire format around whatever the domain happened to look
 * like first.
 *
 * THE REVISION GATE, AND WHY IT IS A TYPE
 *
 * A raid night assembled from two revisions of a report describes two different
 * worlds. That is not partial evidence, and it is not representable as UNKNOWN
 * or INSUFFICIENT_EVIDENCE — those mean "we could not see enough of one world".
 *
 * M7-C's `checkReportRevision` answers MATCHES / CHANGED / UNVERIFIED, and the
 * dangerous outcome is UNVERIFIED: a caller who could not confirm the revision
 * has confirmed nothing, and the natural mistake is to treat "no answer" as "no
 * change". Documenting that rule would leave it to be remembered.
 *
 * So the aggregator does not accept a revision check at all. It accepts a
 * `VerifiedRaidNightInput`, carrying a module-private brand that only
 * `verifyRaidNightInput` attaches — and it attaches it only after the revision
 * matched THIS snapshot and the facts proved internally coherent.
 *
 * The private brand prevents accidental structural construction at compile time.
 * The aggregator ALSO checks the private runtime brand, so a forged TypeScript
 * assertion that did not pass through `verifyRaidNightInput` fails closed at
 * runtime. Both halves are needed: TypeScript permits a deliberate cast, and a
 * compile-time-only guard would let one through.
 *
 * THE OTHER HALF OF THE GATE IS TOPOLOGY
 *
 * Revision integrity proves the facts describe ONE export of the report. It says
 * nothing about whether they describe it COMPLETELY. Orchestration supplies one
 * cell per (included fight × roster player), and an omitted cell would silently
 * shrink `cellsTotal` — turning an incomplete 79 into a confident, wrong 80. So
 * the gate also proves the cell matrix and the processing records are exactly
 * what the snapshot requires, and only then is the brand attached.
 */

import type { RevisionCheck } from "../wcl/report-revision.js";
import { participationFor, playerKeyOf } from "../wcl/roster-snapshot.js";
import type { ReportRosterSnapshot, RosterParticipation } from "../wcl/roster-snapshot.js";
import type { PlayerFightResult, SimcProfileRelativeCounts } from "./cell.js";

// ---------------------------------------------------------------------------
// Fight processing and batch failures
// ---------------------------------------------------------------------------

/**
 * What happened to a fight that the report actually contained.
 *
 * A fight the report does NOT contain has no outcome here, because it has no
 * metadata to describe — it appears only as a batch failure. Inventing a summary
 * for it would create a pull that never happened.
 *
 * `NOT_INGESTED` WAS ADDED IN M7-F, AND WHY MATTERS
 *
 * Orchestration must not retrieve a fight no selected player needs — since
 * PREP-3, that means EVERYBODY ABSENT. A present player always needs the fight,
 * even with an unsupported or unresolved specialization, because every report
 * carries their consumable status (owner decision). Until PREP-3, a fight whose
 * present players were all unsupported was skipped too; that saving was traded
 * for the always-reported status.
 *
 * But it left the vocabulary unable to state what happened. `INGESTED` would be
 * a plain lie: no event request was issued. `INGESTION_FAILED` would be worse,
 * inventing an outage to explain a deliberate decision. So the third value says
 * what occurred and nothing about why — the cells themselves carry the reason.
 */
export type FightProcessingOutcome = "INGESTED" | "NOT_INGESTED" | "INGESTION_FAILED";

/** The canonical list, for parity assertions against a public vocabulary. */
export const FIGHT_PROCESSING_OUTCOMES = [
  "INGESTED",
  "NOT_INGESTED",
  "INGESTION_FAILED",
] as const satisfies readonly FightProcessingOutcome[];

export interface FightProcessingRecord {
  readonly fightId: number;
  readonly outcome: FightProcessingOutcome;
}

/**
 * Something that went wrong with a FIGHT, never with a player.
 *
 * Kept in its own collection precisely so it cannot be mistaken for one. A
 * failed ingestion is not twenty players playing badly, and a requested fight
 * the report lacks is not twenty absences.
 */
export type BatchFailureReason = "FIGHT_NOT_FOUND" | "FIGHT_INGESTION_FAILED";

export const BATCH_FAILURE_REASONS = [
  "FIGHT_NOT_FOUND",
  "FIGHT_INGESTION_FAILED",
] as const satisfies readonly BatchFailureReason[];

export interface BatchFailure {
  readonly fightId: number;
  readonly reason: BatchFailureReason;
}

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

/** Factual fight metadata plus what processing it received. No interpretation. */
export interface FightSummary {
  readonly fightId: number;
  readonly name: string;
  /** `0` identifies trash rather than an encounter. Recorded, not judged. */
  readonly encounterId: number;
  readonly difficulty: number | null;
  readonly size: number | null;
  /** Factual. A wipe is not a verdict about anyone. */
  readonly kill: boolean | null;
  readonly startTimeMs: number;
  readonly endTimeMs: number;
  readonly durationMs: number;
  readonly participantCount: number;
  readonly analyzedCount: number;
  readonly processingOutcome: FightProcessingOutcome;
}

/**
 * One player across the night.
 *
 * `observedSpecNames` is ordered by first appearance across ascending fight ids,
 * and `specChanged` is simply whether there is more than one. Neither is a
 * judgement: swapping specialization is a thing raiders do, not a regression.
 */
export interface PlayerSummary {
  readonly playerKey: string;
  readonly sourceId: number;
  readonly name: string;
  readonly className: string;
  readonly server: string | null;
  readonly observedSpecNames: readonly string[];
  readonly specChanged: boolean;
  readonly fightsPresent: number;
  readonly fightsAbsent: number;
}

/**
 * Integer totals and their denominators, stated explicitly.
 *
 * NO PERCENTAGE, NO RATIO, NO HIDDEN DENOMINATOR. Every number below is a count
 * of things, and a reader who wants a proportion must pick both numbers
 * deliberately — which is the point. `matchTotal / eligibleDecisionsTotal` is
 * not a measure of play, because eligible decisions are a narrow slice of what a
 * player actually did.
 */
export interface CoverageSummary {
  readonly cellsTotal: number;
  readonly cellsAnalyzed: number;
  readonly cellsAbsent: number;
  readonly cellsSpecNotSupported: number;
  readonly cellsAuthorityNotAvailable: number;
  readonly cellsProfileNotResolved: number;
  readonly cellsInsufficientEvidence: number;
  /**
   * Present players for whom no analyzer ran at all.
   *
   * Both reasons land here — the fight's evidence could not be obtained, and no
   * usable specialization identity was available — because from a coverage
   * standpoint they say the same thing: this participant contributed no gameplay
   * analysis, for a reason that is not about how they played.
   */
  readonly cellsAnalysisUnavailable: number;

  /** Summed over ANALYZED cells only. Never padded with zeroes from other kinds. */
  readonly eligibleDecisionsTotal: number;
  readonly matchTotal: number;
  readonly rejectedTotal: number;
  readonly unknownTotal: number;
  readonly resolvedComparisonsTotal: number;
  readonly excludedCastCountTotal: number;
  /**
   * SIMC-FB-B: how much of the totals above was evaluated under the pinned SimC
   * profile. A part of them, never an addition. Absent means none.
   */
  readonly simcProfileRelative?: SimcProfileRelativeCounts;

  readonly fightsRequested: number;
  readonly fightsIncluded: number;
  readonly fightsMissing: number;
  readonly fightsIngested: number;
  /**
   * Included fights no selected player required event evidence for.
   *
   * Its own count rather than folded into either neighbour, so the identity
   * `fightsIncluded === fightsIngested + fightsNotIngested + fightsFailed`
   * holds and a reader can see that a small `fightsIngested` was a deliberate
   * saving rather than a retrieval problem.
   */
  readonly fightsNotIngested: number;
  readonly fightsFailed: number;
}

// ---------------------------------------------------------------------------
// Recurrence
// ---------------------------------------------------------------------------

/**
 * One repeated pattern, as counts and identifiers.
 *
 * NO THRESHOLD, NO `isRecurring`, NO SEVERITY, NO RANK. How many occurrences
 * make something "recurring" is a judgement that depends on context this layer
 * does not have — fight count, roster size, what the group is working on. The
 * facts are here; the judgement is somebody else's, later.
 */
export interface RecurrenceGroup {
  readonly key: string;
  readonly occurrenceCount: number;
  /** Ascending, distinct. */
  readonly fightIds: readonly number[];
  readonly fightCount: number;
  /** Ascending by source id, distinct. */
  readonly playerKeys: readonly string[];
}

/**
 * Three collections that may never be summed together.
 *
 * Only `rejectedPatterns` says anything about a player. `evidenceLimitations`
 * says the analyzer could not prove a decision, and `exclusionPatterns` says it
 * never examined a cast — both are reports on the engine's own coverage, and on
 * today's data they dominate by a wide margin. Merging them would convert the
 * analyzer's limits into somebody's mistakes.
 */
export interface RecurrenceSummary {
  readonly rejectedPatterns: readonly RecurrenceGroup[];
  readonly evidenceLimitations: readonly RecurrenceGroup[];
  readonly exclusionPatterns: readonly RecurrenceGroup[];
  /**
   * SIMC-FB-B: rejections read under the pinned SimC profile, whose encounter
   * state is modeled. Never summed with `rejectedPatterns`. Absent when none.
   */
  readonly simcProfileRelativeRejectedPatterns?: readonly RecurrenceGroup[];
}

// ---------------------------------------------------------------------------
// Trend evidence
// ---------------------------------------------------------------------------

/**
 * Whether two adjacent points share a property.
 *
 * TRI-STATE, NOT BOOLEAN, AND THAT IS A CORRECTION. If one pull was ABSENT it
 * had no analyzer at all, so "did both points use the same analyzer?" has no
 * answer — and `false` would assert they used DIFFERENT ones, which is a claim
 * about a comparison that was never possible. `UNKNOWN` says the relationship is
 * not knowable, which is the truth.
 */
export type Comparability = "SAME" | "DIFFERENT" | "UNKNOWN";

/** The canonical list, for parity assertions against a public vocabulary. */
export const COMPARABILITY_VALUES = [
  "SAME",
  "DIFFERENT",
  "UNKNOWN",
] as const satisfies readonly Comparability[];

/**
 * How two adjacent points in a player's series relate.
 *
 * Every field is a fact about the two points, never about their quality. There
 * is deliberately no "better", "worse" or "changed by" field: a reader sees the
 * movement in the points themselves and sees, in the same object, every reason
 * the two may not be comparable at all.
 */
export interface PointComparability {
  readonly fromFightId: number;
  readonly toFightId: number;
  readonly sameEncounter: Comparability;
  readonly sameDifficulty: Comparability;
  readonly sameSpec: Comparability;
  readonly sameAnalyzerId: Comparability;
  readonly sameAuthorityRevision: Comparability;
  readonly sameNormalizationRevision: Comparability;
}

/** One pull, from one player's point of view. Facts only. */
export interface SeriesPoint {
  readonly fightId: number;
  readonly encounterId: number;
  readonly difficulty: number | null;
  readonly durationMs: number;
  readonly kill: boolean | null;
  /** The cell this point describes, carrying its own kind and any counts. */
  readonly cell: PlayerFightResult;
}

/**
 * A player's pulls in order.
 *
 * ORDERED, AND NOTHING MORE. There is no trend label, no slope, no direction,
 * and no field that could hold one. M7-A measured why: on the production fight,
 * eligible decisions were 7% of observed casts and 2.3% of them resolved, so a
 * movement in these counts tracks analyzer coverage at least as much as it
 * tracks play. Calling that "improving" would be inventing a claim the data
 * cannot support.
 */
export interface PlayerSeries {
  readonly playerKey: string;
  readonly sourceId: number;
  /** Ascending by fight id. */
  readonly points: readonly SeriesPoint[];
  /** Between adjacent points, in the same order. */
  readonly comparability: readonly PointComparability[];
}

export interface TrendEvidence {
  /** Ascending by source id. */
  readonly series: readonly PlayerSeries[];
}

// ---------------------------------------------------------------------------
// The aggregate
// ---------------------------------------------------------------------------

/**
 * Whether this night contains any gameplay analysis at all.
 *
 * `NO_ANALYZED_CELLS` is a legitimate, complete result — every player
 * unsupported, every player absent, every fight's evidence unavailable. It
 * exists so that outcome cannot present as a clean night: an aggregate with no
 * findings and no disclosure reads as "nothing to fix", and absence of analysis
 * is not evidence of good play.
 */
export type RaidNightStatus = "ANALYZED" | "NO_ANALYZED_CELLS";

export const RAID_NIGHT_STATUSES = [
  "ANALYZED",
  "NO_ANALYZED_CELLS",
] as const satisfies readonly RaidNightStatus[];

export interface RaidNightAnalysis {
  /** M7-C's factual snapshot identity, reused unchanged. */
  readonly identity: ReportRosterSnapshot["identity"];
  readonly status: RaidNightStatus;
  /** Ascending by fight id. Included fights only. */
  readonly fights: readonly FightSummary[];
  /** Ascending by source id. */
  readonly roster: readonly PlayerSummary[];
  /** Ascending by (fight id, source id). */
  readonly cells: readonly PlayerFightResult[];
  readonly coverage: CoverageSummary;
  readonly recurrence: RecurrenceSummary;
  readonly trendEvidence: TrendEvidence;
  /** Ascending by (fight id, reason). Fight-level only, never player-level. */
  readonly partialFailures: readonly BatchFailure[];
}

// ---------------------------------------------------------------------------
// The verified input gate
// ---------------------------------------------------------------------------

/** The facts an aggregation needs, before they have been vouched for. */
export interface RaidNightInputFacts {
  readonly snapshot: ReportRosterSnapshot;
  /** One record per INCLUDED fight. Missing fights have none. */
  readonly fightOutcomes: readonly FightProcessingRecord[];
  readonly cells: readonly PlayerFightResult[];
}

/**
 * The private runtime brand.
 *
 * WHAT IT ACTUALLY GUARANTEES, STATED PRECISELY
 *
 * At COMPILE TIME the symbol is not exported, so `VerifiedRaidNightInput` cannot
 * be produced by an object literal — accidental structural construction does not
 * type-check.
 *
 * That is NOT the whole story, and an earlier version of this comment overstated
 * it. TypeScript permits `facts as unknown as VerifiedRaidNightInput`, so a
 * deliberate assertion CAN produce the type. TypeScript is a compile-time tool,
 * not a runtime integrity boundary.
 *
 * So the brand is a real runtime value, attached by `verifyRaidNightInput` only
 * after every check below has passed, and `aggregateRaidNight` re-checks it
 * before doing anything. A forged assertion that never passed through
 * verification therefore fails closed at runtime rather than silently producing
 * an aggregate over unvalidated facts.
 */
const VERIFIED_REVISION: unique symbol = Symbol("aggregation.verifiedRaidNightInput");

export interface VerifiedRaidNightInput extends RaidNightInputFacts {
  readonly [VERIFIED_REVISION]: true;
}

/**
 * Whether a value genuinely came through `verifyRaidNightInput`.
 *
 * Exported for the aggregator alone. It reads the private symbol, which no other
 * module can name, so nothing outside this file can fabricate a value that
 * satisfies it.
 */
export function isVerifiedRaidNightInput(value: RaidNightInputFacts): value is VerifiedRaidNightInput {
  return (value as { readonly [VERIFIED_REVISION]?: unknown })[VERIFIED_REVISION] === true;
}

/**
 * Precisely which structural rule refused the input.
 *
 * Diagnostic detail on ONE caller-visible reason — the supplied facts are not
 * internally coherent — rather than a hierarchy. Every value names a specific
 * contradiction between the factual roster snapshot and what orchestration
 * supplied, and each maps to a test.
 */
export type RaidNightInputDefect =
  /** An included fight has no processing record. */
  | "PROCESSING_RECORD_MISSING"
  /** Two records claim one fight. */
  | "PROCESSING_RECORD_DUPLICATE"
  /** A record names a fight the snapshot does not include. */
  | "PROCESSING_RECORD_FOREIGN_FIGHT"
  /** An (included fight, roster player) pair has no cell. */
  | "CELL_MISSING"
  /** Two cells claim one (fight, player) pair. */
  | "CELL_DUPLICATE"
  /** A cell names a fight the snapshot does not include. */
  | "CELL_FOREIGN_FIGHT"
  /** A cell names a player the roster does not contain. */
  | "CELL_FOREIGN_PLAYER"
  /** A cell's key disagrees with the canonical key for its own source id. */
  | "PLAYER_KEY_MISMATCH"
  /** A cell claims presence the snapshot denies, or absence it contradicts. */
  | "PARTICIPATION_MISMATCH"
  /** A cell's specialization disagrees with the snapshot's per-fight fact. */
  | "SPEC_MISMATCH"
  /** A cell's kind contradicts its fight's processing outcome. */
  | "PROCESSING_CELL_MISMATCH";

export type RaidNightRejection =
  /** The report was re-exported. The night spans two worlds. */
  | "REPORT_REVISION_CHANGED"
  /**
   * The revision could not be confirmed.
   *
   * NOT a softer version of MATCHES. A check that returned no answer establishes
   * nothing, and accepting on "probably unchanged" is exactly how a
   * mixed-revision aggregate gets built.
   */
  | "REPORT_REVISION_UNVERIFIED"
  /**
   * The facts are internally incoherent.
   *
   * Kept apart from the two revision outcomes above: those mean the evidence
   * describes the wrong world, this means the supplied description of one world
   * contradicts itself.
   */
  | "RAID_NIGHT_INPUT_INVALID";

export type RaidNightVerification =
  | { readonly ok: true; readonly verified: VerifiedRaidNightInput }
  | {
      readonly ok: false;
      readonly reason: RaidNightRejection;
      /** Present only for `RAID_NIGHT_INPUT_INVALID`. Names the rule that fired. */
      readonly defect?: RaidNightInputDefect;
      readonly fightId?: number;
      readonly sourceId?: number;
    };

function invalid(
  defect: RaidNightInputDefect,
  scope?: { readonly fightId?: number; readonly sourceId?: number },
): RaidNightVerification {
  return {
    ok: false,
    reason: "RAID_NIGHT_INPUT_INVALID",
    defect,
    ...(scope?.fightId === undefined ? {} : { fightId: scope.fightId }),
    ...(scope?.sourceId === undefined ? {} : { sourceId: scope.sourceId }),
  };
}

/** `fightId:sourceId`. Numeric parts only, so actor id 0 is a real key. */
function cellKey(fightId: number, sourceId: number): string {
  return `${String(fightId)}:${String(sourceId)}`;
}

/**
 * Proves every included fight has exactly one processing record.
 *
 * A missing record would let the aggregator fall back to a default outcome for a
 * fight nobody reported on; a foreign one would describe processing for a fight
 * that is not in the aggregate at all.
 */
function checkProcessingRecords(facts: RaidNightInputFacts): RaidNightVerification | null {
  const included = new Set(facts.snapshot.identity.includedFightIds);
  const seen = new Set<number>();

  for (const record of facts.fightOutcomes) {
    if (!included.has(record.fightId)) {
      return invalid("PROCESSING_RECORD_FOREIGN_FIGHT", { fightId: record.fightId });
    }
    if (seen.has(record.fightId)) {
      return invalid("PROCESSING_RECORD_DUPLICATE", { fightId: record.fightId });
    }
    seen.add(record.fightId);
  }

  for (const fightId of included) {
    if (!seen.has(fightId)) {
      return invalid("PROCESSING_RECORD_MISSING", { fightId });
    }
  }
  return null;
}

/**
 * Proves a cell agrees with M7-C about whether the player was there, and about
 * what they played.
 *
 * This is what stops orchestration laundering a missing analysis as an absence,
 * or an absence as an unsupported specialization. M7-D resolves nothing here —
 * it checks a supplied fact against the factual roster snapshot.
 */
function checkAgainstParticipation(
  cell: PlayerFightResult,
  participation: RosterParticipation,
): RaidNightInputDefect | null {
  if (participation.kind === "PRESENT") {
    if (cell.kind === "ABSENT") {
      return "PARTICIPATION_MISMATCH";
    }
    // Including the `null` case: when Warcraft Logs supplied no usable
    // specialization a cell may not invent one, and a cell may not report `null`
    // for a player whose specialization the snapshot does know.
    return cell.specName === participation.specName ? null : "SPEC_MISMATCH";
  }

  // The snapshot says this player was not in this pull. Nothing else is
  // representable: an analysis of a player who was not there is not evidence,
  // it is a contradiction.
  return cell.kind === "ABSENT" ? null : "PARTICIPATION_MISMATCH";
}

/**
 * Proves a cell's kind is consistent with what happened to its fight.
 *
 * A fight whose evidence never arrived cannot contain an analysis, and a fight
 * that WAS ingested cannot contain a cell claiming ingestion failed. Both
 * directions matter: the first prevents fabricated analysis, the second prevents
 * a real analysis being hidden behind an infrastructure excuse.
 */
function checkAgainstProcessing(
  cell: PlayerFightResult,
  outcome: FightProcessingOutcome | undefined,
): RaidNightInputDefect | null {
  // Absence is a roster fact and is unaffected by what happened to the fight.
  if (cell.kind === "ABSENT") {
    return null;
  }
  if (outcome === undefined) {
    // Unreachable once `checkProcessingRecords` has run. Reported rather than
    // assumed: a cell whose fight has no recorded outcome cannot be checked, and
    // silently passing it would be the fail-open case.
    return "PROCESSING_RECORD_MISSING";
  }

  // NOT_INGESTED: retrieval was deliberately skipped because no selected player
  // needed it. Since PREP-3 that is only coherent when nobody was present:
  // every present player needs the fight for their consumable status, whatever
  // their specialization. Absent cells returned above, so ANY present cell here
  // means orchestration skipped a retrieval a player needed. It is refused,
  // whatever its kind, before the identity-only exception below. An ANALYZED
  // cell would claim decisions from evidence never fetched; a SPEC_NOT_SUPPORTED
  // or unresolved cell would carry no assessed consumable status.
  if (outcome === "NOT_INGESTED") {
    return "PROCESSING_CELL_MISMATCH";
  }

  // A cell whose analysis was unavailable for a reason UNRELATED to the fight is
  // consistent with either retrieval outcome. `SPECIALIZATION_UNRESOLVED` is a
  // fact about the participant's own identity data, and it is true whether or
  // not events were retrieved — so it is judged on its own meaning rather than
  // against the fight.
  if (cell.kind === "ANALYSIS_UNAVAILABLE" && cell.reason === "SPECIALIZATION_UNRESOLVED") {
    return null;
  }

  switch (outcome) {
    case "INGESTION_FAILED":
      // Nothing was retrieved, so nothing could have been analyzed. The only
      // truthful cell for a present player is the matching unavailability.
      return cell.kind === "ANALYSIS_UNAVAILABLE" && cell.reason === "FIGHT_INGESTION_FAILED"
        ? null
        : "PROCESSING_CELL_MISMATCH";

    case "INGESTED":
      // Evidence was retrieved, so claiming it never arrived contradicts the
      // fight fact and would hide a real analysis behind an infrastructure
      // excuse. Every other kind is legitimate here.
      return cell.kind === "ANALYSIS_UNAVAILABLE" && cell.reason === "FIGHT_INGESTION_FAILED"
        ? "PROCESSING_CELL_MISMATCH"
        : null;
  }
}

/**
 * Proves one cell exists for every (included fight × roster player) pair, and
 * that each one agrees with the factual snapshot.
 *
 * THE DENOMINATOR IS THE POINT. Without this, an orchestration bug that omitted
 * a cell would silently shrink `cellsTotal`, and every coverage number computed
 * against it would be quietly wrong — 79 cells reported as a complete 79 rather
 * than an incomplete 80. Lengths are not compared; the (fightId, sourceId) KEYS
 * are, because one duplicate plus one omission has the right length.
 */
function checkCellMatrix(facts: RaidNightInputFacts): RaidNightVerification | null {
  const { snapshot } = facts;
  const included = new Set(snapshot.identity.includedFightIds);
  const rosterSourceIds = new Set(snapshot.players.map((player) => player.sourceId));
  const outcomeByFightId = new Map(
    facts.fightOutcomes.map((record) => [record.fightId, record.outcome] as const),
  );

  const seen = new Set<string>();

  for (const cell of facts.cells) {
    // Foreign checks first: participation cannot be looked up for a fight or a
    // player the snapshot does not contain.
    if (!included.has(cell.fightId)) {
      return invalid("CELL_FOREIGN_FIGHT", { fightId: cell.fightId, sourceId: cell.sourceId });
    }
    if (!rosterSourceIds.has(cell.sourceId)) {
      return invalid("CELL_FOREIGN_PLAYER", { fightId: cell.fightId, sourceId: cell.sourceId });
    }

    const key = cellKey(cell.fightId, cell.sourceId);
    if (seen.has(key)) {
      return invalid("CELL_DUPLICATE", { fightId: cell.fightId, sourceId: cell.sourceId });
    }
    seen.add(key);

    // The canonical key, recomputed rather than trusted. A caller-supplied key
    // that disagreed with its own source id would make one player appear as two
    // in recurrence groups and in every later projection.
    if (cell.playerKey !== playerKeyOf(snapshot.identity.reportCode, cell.sourceId)) {
      return invalid("PLAYER_KEY_MISMATCH", { fightId: cell.fightId, sourceId: cell.sourceId });
    }

    const participationDefect = checkAgainstParticipation(
      cell,
      participationFor(snapshot, cell.fightId, cell.sourceId),
    );
    if (participationDefect !== null) {
      return invalid(participationDefect, { fightId: cell.fightId, sourceId: cell.sourceId });
    }

    const processingDefect = checkAgainstProcessing(cell, outcomeByFightId.get(cell.fightId));
    if (processingDefect !== null) {
      return invalid(processingDefect, { fightId: cell.fightId, sourceId: cell.sourceId });
    }
  }

  // Every required pair, built from INCLUDED fights — never from requested ones.
  // A missing requested fight has no cells by design, and expecting some would
  // demand exactly the fabrication the missing-fight policy forbids.
  for (const fightId of snapshot.identity.includedFightIds) {
    for (const player of snapshot.players) {
      if (!seen.has(cellKey(fightId, player.sourceId))) {
        return invalid("CELL_MISSING", { fightId, sourceId: player.sourceId });
      }
    }
  }
  return null;
}

/**
 * Admits facts to aggregation only when the revision was positively confirmed
 * AND the facts are internally coherent.
 *
 * PURE. It performs no I/O and issues no query — it inspects a `RevisionCheck`
 * some caller already obtained. That separation is deliberate: M7-C owns asking
 * Warcraft Logs, and this module owns what the answer permits.
 *
 * ORDER IS DELIBERATE. Revision integrity runs first: if the evidence describes
 * the wrong export of the report, whether it is internally consistent does not
 * matter, and reporting a topology defect would send a reader looking for an
 * orchestration bug that is not there.
 *
 * The brand is attached last, and only here.
 */
export function verifyRaidNightInput(
  revisionCheck: RevisionCheck,
  facts: RaidNightInputFacts,
): RaidNightVerification {
  switch (revisionCheck.outcome) {
    case "CHANGED":
      return { ok: false, reason: "REPORT_REVISION_CHANGED" };
    case "UNVERIFIED":
      return { ok: false, reason: "REPORT_REVISION_UNVERIFIED" };
    case "MATCHES":
      // Also proves the check was about THIS snapshot rather than another one.
      if (revisionCheck.revision !== facts.snapshot.identity.reportRevision) {
        return { ok: false, reason: "REPORT_REVISION_UNVERIFIED" };
      }
      break;
  }

  const processingDefect = checkProcessingRecords(facts);
  if (processingDefect !== null) {
    return processingDefect;
  }

  const cellDefect = checkCellMatrix(facts);
  if (cellDefect !== null) {
    return cellDefect;
  }

  return { ok: true, verified: { ...facts, [VERIFIED_REVISION]: true } };
}
