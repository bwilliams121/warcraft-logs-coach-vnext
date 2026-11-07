/**
 * The public raid-night contract.
 *
 * WHAT THIS FILE IS
 *
 * The one shape every interface publishes a raid night through. It is a SEPARATE
 * contract family from `warcraft-logs-coach.analysis/1`, which remains the
 * single-fight document and is not touched by anything here.
 *
 * WHY SEPARATE RATHER THAN A WIDER v1
 *
 * A single-fight result answers "what did this player do in this pull". A raid
 * night answers "what happened across these pulls, for this roster". Widening v1
 * to carry both would change what its existing fields mean for every consumer
 * already reading it, which is exactly what a version exists to prevent.
 *
 * WHY THE CELLS CARRY REFERENCES AND NOT DOCUMENTS
 *
 * The measured production single-fight response is roughly 456 KB, because it
 * publishes every decision and every excluded cast. A hundred of those nested
 * inside one aggregate is tens of megabytes for a summary nobody can load. So a
 * cell publishes counts plus an `analysisRef`, and a consumer who wants the
 * decisions fetches that one fight through the existing single-fight product.
 *
 * SEMANTICS THAT ARE EASY TO MISREAD, STATED ONCE
 *
 *   MATCH                 authority-compatible only. NOT correct, optimal, best
 *                         or mistake-free.
 *   REJECTED              the authority positively established the observed
 *                         action was not selectable in the proven state.
 *   UNKNOWN               the analyzer could not prove the comparison. A
 *                         first-class result, never a miss and never a fault.
 *   ABSENT                the player did not participate in that fight. Not poor
 *                         performance, not missing evidence.
 *   SPEC_NOT_SUPPORTED    this build has no analyzer for that specialization.
 *                         A coverage limit, not a statement about play.
 *   ANALYSIS_UNAVAILABLE  participation is known, and analysis could not be
 *                         performed for that player at all. `reason` says which
 *                         precondition was missing: FIGHT_INGESTION_FAILED (the
 *                         required fight evidence could not be obtained) or
 *                         SPECIALIZATION_UNRESOLVED (no usable specialization
 *                         identity, so no analyzer could truthfully be selected).
 *                         Not infrastructure-only, never poor performance, and
 *                         carrying no counts and no UNKNOWN decisions.
 *   NOT_INGESTED          an included fight whose events were deliberately not
 *                         retrieved, because no selected player needed them.
 *                         A saving, not an outage.
 *   evidenceLimitations   why the ANALYZER could not conclude. Says nothing
 *                         about the player.
 *   exclusionPatterns     casts the analyzer did not evaluate. Coverage, not
 *                         gameplay failure.
 *   NO_ANALYZED_CELLS     a complete, truthful aggregate containing no gameplay
 *                         analysis. It does NOT mean clean play.
 *
 * WHAT IS DELIBERATELY ABSENT
 *
 * No score, no grade, no rate, no percentage, no severity, no priority, no
 * "improving". Not as a naming convention — there is nowhere in this schema to
 * put one, so no projection can emit one and no consumer can read one.
 */

import * as z from "zod";

import {
  CapabilitySchema,
  PUBLIC_CONSUMABLE_UNKNOWN_CODES,
  PUBLIC_PREPARATION_NOT_ASSESSED_REASONS,
  SimcProfileRelativeCountsSchema,
} from "./analysis-contract.js";
import {
  ANALYSIS_UNAVAILABLE_REASONS,
  NON_ANALYZED_STATUSES,
  PLAYER_FIGHT_RESULT_KINDS,
} from "../aggregation/cell.js";
import {
  BATCH_FAILURE_REASONS,
  COMPARABILITY_VALUES,
  FIGHT_PROCESSING_OUTCOMES,
  RAID_NIGHT_STATUSES,
} from "../aggregation/raid-night.js";

/**
 * The public raid-night schema version.
 *
 * THIS VERSIONS THE WIRE SHAPE AND ITS SEMANTICS. Nothing else. It is not the
 * SimulationCraft commit, not the normalization revision, not the Warcraft Logs
 * report revision, and not the Worker build.
 *
 * THE RULE: any backwards-incompatible change to the public shape OR to what a
 * field means requires a new version. Removing a field, narrowing an enum,
 * making an optional field required, or changing what `ABSENT` asserts are all
 * version changes. Adding a new optional field is not.
 *
 * CHANGING A PUBLIC VOCABULARY IS A DELIBERATE CONTRACT DECISION
 *
 * Every discriminant, status and reason value below is machine-readable
 * semantics, not decoration. A consumer writing an exhaustive switch over
 * `cell.kind` does not GAIN anything from a fifth variant appearing — it gets a
 * silent fall-through. The same holds for an unavailable reason, a processing
 * outcome and a comparability value.
 *
 * So the set of published values may not change merely because an internal
 * domain vocabulary evolved. When the domain grows a case, exactly two answers
 * are honest:
 *
 *   A. `/1` KEEPS ITS VOCABULARY, and the projection maps the new internal case
 *      onto an existing truthful public value.
 *   B. `/1` CHANGES DELIBERATELY, through contract review.
 *
 * Whether a particular additive wire change warrants a new version is a decision
 * for the checkpoint that faces it. What is settled here is that internal
 * evolution cannot make it silently. `tests/contracts/
 * m7e-raid-night-v1-vocabulary-freeze.test.ts` pins the published values
 * literally so the choice has to be made out loud.
 *
 * One literal, no negotiation. A consumer reads this string and knows what it is
 * holding.
 */
export const PUBLIC_RAID_NIGHT_SCHEMA_VERSION = "warcraft-logs-coach.raid-night/1";

// ---------------------------------------------------------------------------
// Public vocabularies
//
// Each is derived from the canonical internal tuple rather than retyped, so the
// public wire cannot silently DISAGREE with the domain: a renamed internal value
// is a compile error here, and `tests/contracts/m7e-raid-night-contract.test.ts`
// asserts exact equality.
//
// Derivation alone is NOT a freeze, and it is important not to mistake it for
// one. It propagates internal growth outward — a new internal case would widen
// the published enum with both sides still agreeing. The literal freeze in
// `m7e-raid-night-v1-vocabulary-freeze.test.ts` is what catches that, and the
// two tests exist for genuinely different reasons:
//
//     parity  the wire must not disagree with the domain
//     freeze  the wire must not move just because the domain did
// ---------------------------------------------------------------------------

export const PUBLIC_RAID_NIGHT_STATUSES = RAID_NIGHT_STATUSES;
export const PUBLIC_CELL_KINDS = PLAYER_FIGHT_RESULT_KINDS;
export const PUBLIC_NON_ANALYZED_STATUSES = NON_ANALYZED_STATUSES;
export const PUBLIC_ANALYSIS_UNAVAILABLE_REASONS = ANALYSIS_UNAVAILABLE_REASONS;
export const PUBLIC_FIGHT_PROCESSING_OUTCOMES = FIGHT_PROCESSING_OUTCOMES;
export const PUBLIC_BATCH_FAILURE_REASONS = BATCH_FAILURE_REASONS;
export const PUBLIC_COMPARABILITY_VALUES = COMPARABILITY_VALUES;

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * Which Warcraft Logs snapshot every fact in this document came from.
 *
 * `reportRevision` is the revision the roster discovery observed, and every
 * fight in this aggregate was verified against it. A night whose fights spanned
 * two revisions is not partially valid and is never produced.
 *
 * NOTE WHAT IS ABSENT. No generated id, no request id and no wall-clock
 * generation time: the identity of a raid night is the report and revision it
 * was taken from, and inventing one would give two identical runs two different
 * identities. No single authority commit or normalization revision either —
 * different specializations may be analyzed against different artifacts, so
 * that provenance lives on each analyzed cell where it is actually true.
 */
export const RaidNightIdentitySchema = z
  .object({
    reportCode: z.string(),
    /** The Warcraft Logs report revision. Never a local version of any kind. */
    reportRevision: z.number().int(),
    logVersion: z.number().int(),
    /** Nullable in the Warcraft Logs schema. Recorded, never inferred. */
    gameVersion: z.number().int().nullable(),
    reportStartTimeUnixMs: z.number(),
    reportEndTimeUnixMs: z.number(),
    /** Ascending. The fights actually found, which may be fewer than requested. */
    includedFightIds: z.array(z.number().int()),
  })
  .strict();

/**
 * Where to fetch the single-fight analysis behind a cell.
 *
 * A RETRIEVAL COORDINATE, NOT AN IMMUTABLE SNAPSHOT REFERENCE. It is the
 * identifier triple the existing single-fight product already understands, and
 * calling that product with it returns a document produced from whatever the
 * report looks like AT THAT MOMENT.
 *
 * This aggregate is pinned to `identity.reportRevision`. If the report is
 * re-uploaded afterwards, a later single-fight call may observe the newer
 * revision and differ. Nothing here guarantees byte-identical replay, and the
 * single-fight API has no mechanism that could provide one.
 */
export const AnalysisRefSchema = z
  .object({
    reportCode: z.string(),
    fightId: z.number().int(),
    sourceId: z.number().int(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Counts and provenance
// ---------------------------------------------------------------------------

const TallySchema = z.object({ key: z.string(), count: z.number().int().nonnegative() }).strict();

/**
 * The integer facts an analyzed cell contributes.
 *
 * INTEGERS ONLY, BY DESIGN. There is no field that could hold a ratio, and a
 * consumer wanting one must compute it from two numbers it chose deliberately.
 * `match / eligibleDecisions` is NOT a measure of play: eligible decisions are a
 * narrow slice of what a player actually did, and on the measured production
 * fight they were about 7% of observed casts.
 *
 * `match` is named `match`, never `correct`. See the header.
 */
export const CellCountsSchema = z
  .object({
    eligibleDecisions: z.number().int().nonnegative(),
    /** Authority-compatible only. */
    match: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    /** A first-class result. Never a miss, never neutral, never scored. */
    unknown: z.number().int().nonnegative(),
    /** MATCH + REJECTED. */
    resolvedComparisons: z.number().int().nonnegative(),
    exactEntryMatches: z.number().int().nonnegative(),
    tokenConvergedMatches: z.number().int().nonnegative(),
    excludedCastCount: z.number().int().nonnegative(),
    selectionPrecision: z.array(TallySchema),
    unknownBases: z.array(TallySchema),
    unknownBlockerClasses: z.array(TallySchema),
    exclusions: z.array(TallySchema),
  })
  .strict();

/**
 * Which analysis world produced an analyzed cell.
 *
 * PER CELL, NEVER ONCE PER NIGHT. Two analyzed pulls may have run under
 * different authority artifacts — they certainly will once a second
 * specialization exists — so comparing two points requires each to carry its
 * own.
 */
export const CellProvenanceSchema = z
  .object({
    analyzerId: z.string(),
    specId: z.string(),
    normalizationRevision: z.string(),
    authorityId: z.string(),
    authorityArtifactRevision: z.string(),
    authorityCommitSha: z.string(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Cell consumable status (PREP-3)
// ---------------------------------------------------------------------------

/**
 * One consumable, COMPACT: a complete count, or UNKNOWN with the lower bound
 * and its reason codes. An UNKNOWN never carries a `count`. The named uses and
 * their evidence stay in the single-fight document at `analysisRef`, the same
 * way the decision arrays do.
 */
const CellConsumableStatusSchema = z.discriminatedUnion("countState", [
  z.object({ countState: z.literal("OBSERVED"), count: z.number().int().nonnegative() }).strict(),
  z
    .object({
      countState: z.literal("UNKNOWN"),
      observedAtLeast: z.number().int().nonnegative(),
      reasonCodes: z.array(z.enum(PUBLIC_CONSUMABLE_UNKNOWN_CODES)).min(1),
    })
    .strict(),
]);

/**
 * A present player's consumable status in this pull (owner decision, PREP-3):
 * health potion, healthstone and combat potion, never omitted. It is
 * specialization-independent, so it is on every present cell kind, an
 * unsupported or unresolved specialization included. It is NOT_ASSESSED only
 * when the fight's retrieval failed.
 *
 * OPTIONAL IN THE SCHEMA ONLY (an additive v1 field); this build always emits
 * it on present cells.
 */
export const CellPreparationSchema = z.discriminatedUnion("assessment", [
  z
    .object({
      assessment: z.literal("ASSESSED"),
      statuses: z
        .object({
          healthPotion: CellConsumableStatusSchema,
          healthstone: CellConsumableStatusSchema,
          combatPotion: CellConsumableStatusSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      assessment: z.literal("NOT_ASSESSED"),
      reason: z.enum(PUBLIC_PREPARATION_NOT_ASSESSED_REASONS),
    })
    .strict(),
]);

export type PublicCellPreparation = z.infer<typeof CellPreparationSchema>;

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

const cellIdentityFields = {
  fightId: z.number().int(),
  /** Report-scoped. Never a cross-report identity. */
  playerKey: z.string(),
  sourceId: z.number().int(),
};

/**
 * A player on the night's roster who was not in this pull.
 *
 * Carries ONLY enough to locate the matrix position. No specialization, because
 * a player who was not there played nothing; no counts, because there is no
 * analysis object; no `analysisRef`, because no single-fight analysis exists to
 * point at. Absence is a participation fact and nothing else.
 */
export const AbsentCellSchema = z.object({ kind: z.literal("ABSENT"), ...cellIdentityFields }).strict();

/**
 * How much of a cell was evaluated under the pinned SimC profile, and from which
 * profile (SIMC-FB-B). The per-decision facts and the cited engine statements are
 * in the fight's own document (`analysisRef`). Absent means no decision read it.
 */
export const CellSimcProfileEvaluationSchema = z
  .object({
    basis: z.literal("SIMC_PROFILE_RELATIVE"),
    encounterStateObserved: z.literal(false),
    coverage: SimcProfileRelativeCountsSchema,
    sources: z
      .array(
        z
          .object({
            datasetRevision: z.string().min(1),
            simcCommit: z.string().min(1),
            clientBuild: z.string().min(1),
            environmentCommit: z.string().min(1),
            aplAuthorityId: z.string().min(1),
            profilePath: z.string().min(1),
            profileSha256: z.string().min(1),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

/**
 * A present, analyzed player.
 *
 * The only variant carrying counts — which is what makes the other three
 * structurally impossible to mistake for a zeroed result.
 *
 * The decision and excluded-cast arrays are NOT here. They remain available
 * through the single-fight contract at `analysisRef`.
 */
export const AnalyzedCellSchema = z
  .object({
    kind: z.literal("ANALYZED"),
    ...cellIdentityFields,
    /** The specialization Warcraft Logs reported. `null` when it supplied none. */
    specName: z.string().nullable(),
    provenance: CellProvenanceSchema,
    counts: CellCountsSchema,
    simcProfileEvaluation: CellSimcProfileEvaluationSchema.optional(),
    analysisRef: AnalysisRefSchema,
    preparation: CellPreparationSchema.optional(),
  })
  .strict();

/**
 * A present player whose analysis truthfully concluded nothing.
 *
 * Carries `status` and the analyzer's own explanation, and NO counts. A zeroed
 * counts object would read as "did nothing right", which is a claim nobody made
 * — the only reliable defence is that the field does not exist.
 */
export const NotAnalyzedCellSchema = z
  .object({
    kind: z.literal("NOT_ANALYZED"),
    ...cellIdentityFields,
    specName: z.string().nullable(),
    status: z.enum(PUBLIC_NON_ANALYZED_STATUSES),
    /** Author-written explanation of what was not done, and why. */
    detail: z.string().min(1),
    analysisRef: AnalysisRefSchema,
    preparation: CellPreparationSchema.optional(),
  })
  .strict();

/**
 * A present player for whom analysis could not be performed at all.
 *
 * PARTICIPATION IS KNOWN; ANALYSIS WAS NOT POSSIBLE. `reason` says which
 * precondition was missing, and the two are genuinely different kinds of fact:
 *
 *     FIGHT_INGESTION_FAILED       the required fight evidence could not be
 *                                  obtained.
 *     SPECIALIZATION_UNRESOLVED    participation is known, but no usable
 *                                  specialization identity was available, so no
 *                                  gameplay analyzer could truthfully be
 *                                  selected.
 *
 * This cell kind is therefore NOT infrastructure-only — it was while
 * `FIGHT_INGESTION_FAILED` stood alone, and saying so now would misdescribe a
 * missing-identity fact as an outage.
 *
 * KEPT APART FROM EVERY GAMEPLAY STATUS, whichever reason applies. No analyzer
 * ran, so there are no counts and — crucially — no UNKNOWN decisions: UNKNOWN
 * means the authority could not prove a specific comparison, and manufacturing
 * one per cast to represent an unrun analysis would put a non-gameplay problem
 * into the gameplay vocabulary.
 *
 * It is never poor performance, and never a statement about play.
 *
 * No `analysisRef` either: there is no completed single-fight analysis to point
 * at, and publishing one would imply a document that does not exist.
 */
export const AnalysisUnavailableCellSchema = z
  .object({
    kind: z.literal("ANALYSIS_UNAVAILABLE"),
    ...cellIdentityFields,
    specName: z.string().nullable(),
    reason: z.enum(PUBLIC_ANALYSIS_UNAVAILABLE_REASONS),
    preparation: CellPreparationSchema.optional(),
  })
  .strict();

export const PublicCellSchema = z.discriminatedUnion("kind", [
  AbsentCellSchema,
  AnalyzedCellSchema,
  NotAnalyzedCellSchema,
  AnalysisUnavailableCellSchema,
]);

// ---------------------------------------------------------------------------
// Summaries
// ---------------------------------------------------------------------------

/** Factual fight metadata plus what processing it received. No interpretation. */
export const PublicFightSummarySchema = z
  .object({
    fightId: z.number().int(),
    name: z.string(),
    /** `0` identifies trash rather than an encounter. Recorded, not judged. */
    encounterId: z.number().int(),
    difficulty: z.number().int().nullable(),
    size: z.number().int().nullable(),
    /** Factual. A wipe is not a verdict about anyone. */
    kill: z.boolean().nullable(),
    startTimeMs: z.number(),
    endTimeMs: z.number(),
    durationMs: z.number(),
    participantCount: z.number().int().nonnegative(),
    analyzedCount: z.number().int().nonnegative(),
    processingOutcome: z.enum(PUBLIC_FIGHT_PROCESSING_OUTCOMES),
  })
  .strict();

/**
 * One player across the night.
 *
 * `specChanged` is a fact, not a regression: raiders change specialization.
 * `observedSpecNames` is ordered by first appearance across ascending fight ids.
 */
export const PublicPlayerSummarySchema = z
  .object({
    playerKey: z.string(),
    sourceId: z.number().int(),
    /** Disclosure. Two raiders may legitimately share a name; identity is the id. */
    name: z.string(),
    className: z.string(),
    server: z.string().nullable(),
    observedSpecNames: z.array(z.string()),
    specChanged: z.boolean(),
    fightsPresent: z.number().int().nonnegative(),
    fightsAbsent: z.number().int().nonnegative(),
  })
  .strict();

/**
 * Integer totals and their denominators, stated explicitly.
 *
 * NO PERCENTAGE, NO RATIO, NO HIDDEN DENOMINATOR.
 *
 * `cellsTotal` is a PROVEN complete matrix of included fights × roster players —
 * the aggregation gate refuses an input whose cells are not exactly that
 * Cartesian product, so this denominator cannot have silently shrunk.
 *
 * The decision totals are summed over ANALYZED cells ONLY. No other cell kind
 * contributes, not even a zero: a zero read as an observation would claim
 * something was examined and found empty.
 */
export const PublicCoverageSummarySchema = z
  .object({
    cellsTotal: z.number().int().nonnegative(),
    cellsAnalyzed: z.number().int().nonnegative(),
    cellsAbsent: z.number().int().nonnegative(),
    cellsSpecNotSupported: z.number().int().nonnegative(),
    cellsAuthorityNotAvailable: z.number().int().nonnegative(),
    cellsProfileNotResolved: z.number().int().nonnegative(),
    cellsInsufficientEvidence: z.number().int().nonnegative(),
    cellsAnalysisUnavailable: z.number().int().nonnegative(),

    eligibleDecisionsTotal: z.number().int().nonnegative(),
    matchTotal: z.number().int().nonnegative(),
    rejectedTotal: z.number().int().nonnegative(),
    unknownTotal: z.number().int().nonnegative(),
    resolvedComparisonsTotal: z.number().int().nonnegative(),
    excludedCastCountTotal: z.number().int().nonnegative(),
    /**
     * SIMC-FB-B: how much of the totals above was evaluated under the pinned SimC
     * profile. A part of them, never an addition. Absent means none.
     */
    simcProfileRelative: SimcProfileRelativeCountsSchema.optional(),

    fightsRequested: z.number().int().nonnegative(),
    fightsIncluded: z.number().int().nonnegative(),
    fightsMissing: z.number().int().nonnegative(),
    fightsIngested: z.number().int().nonnegative(),
    /**
     * Included fights no selected player required event evidence for.
     *
     * `fightsIncluded === fightsIngested + fightsNotIngested + fightsFailed`.
     * Published separately so a small `fightsIngested` reads as a deliberate
     * saving — every present player's specialization was unsupported — rather
     * than as a retrieval problem.
     */
    fightsNotIngested: z.number().int().nonnegative(),
    fightsFailed: z.number().int().nonnegative(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Recurrence
// ---------------------------------------------------------------------------

/**
 * One repeated pattern, as counts and identifiers.
 *
 * NO THRESHOLD, NO `isRecurring`, NO SEVERITY, NO RANK, NO RECOMMENDATION. How
 * many occurrences make something "recurring" depends on context this contract
 * does not have. The facts are published; the judgement is the reader's.
 */
export const PublicRecurrenceGroupSchema = z
  .object({
    key: z.string(),
    occurrenceCount: z.number().int().nonnegative(),
    /** Ascending, distinct. */
    fightIds: z.array(z.number().int()),
    fightCount: z.number().int().nonnegative(),
    /** Ascending by source id, distinct. */
    playerKeys: z.array(z.string()),
  })
  .strict();

/**
 * THREE COLLECTIONS THAT MAY NEVER BE SUMMED TOGETHER.
 *
 * Only `rejectedPatterns` says anything about a player. `evidenceLimitations`
 * says the analyzer could not prove a decision; `exclusionPatterns` says it
 * never examined a cast. Both are reports on the engine's own coverage, and on
 * today's data they dominate by a wide margin. Merging them into one `issues[]`
 * would convert the analyzer's limits into somebody's mistakes.
 */
export const PublicRecurrenceSummarySchema = z
  .object({
    rejectedPatterns: z.array(PublicRecurrenceGroupSchema),
    evidenceLimitations: z.array(PublicRecurrenceGroupSchema),
    exclusionPatterns: z.array(PublicRecurrenceGroupSchema),
    /**
     * SIMC-FB-B: rejections read under the pinned SimC profile, whose encounter
     * state is modeled. Kept out of `rejectedPatterns`, never summed with it, and
     * absent when there are none.
     */
    simcProfileRelativeRejectedPatterns: z.array(PublicRecurrenceGroupSchema).optional(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Trend evidence
// ---------------------------------------------------------------------------

/**
 * How two adjacent points relate.
 *
 * TRI-STATE, NOT BOOLEAN. If one pull was ABSENT it had no analyzer at all, so
 * "did both points use the same analyzer?" has no answer — and `false` would
 * assert they used DIFFERENT ones, a claim about a comparison that was never
 * possible. `UNKNOWN` says the relationship is not knowable, which is the truth.
 */
export const PublicComparabilitySchema = z
  .object({
    fromFightId: z.number().int(),
    toFightId: z.number().int(),
    sameEncounter: z.enum(PUBLIC_COMPARABILITY_VALUES),
    sameDifficulty: z.enum(PUBLIC_COMPARABILITY_VALUES),
    sameSpec: z.enum(PUBLIC_COMPARABILITY_VALUES),
    sameAnalyzerId: z.enum(PUBLIC_COMPARABILITY_VALUES),
    sameAuthorityRevision: z.enum(PUBLIC_COMPARABILITY_VALUES),
    sameNormalizationRevision: z.enum(PUBLIC_COMPARABILITY_VALUES),
  })
  .strict();

/**
 * One pull, from one player's point of view.
 *
 * `cellKind` is the discriminant only. The cell's counts and provenance are
 * published ONCE, in `cells`, and a consumer joins on `(fightId, sourceId)`
 * using this series' own `sourceId`. Embedding the cell again would put two
 * copies of one fact on the wire, which is both larger and a thing that can
 * disagree with itself.
 */
export const PublicSeriesPointSchema = z
  .object({
    fightId: z.number().int(),
    encounterId: z.number().int(),
    difficulty: z.number().int().nullable(),
    durationMs: z.number(),
    kill: z.boolean().nullable(),
    cellKind: z.enum(PUBLIC_CELL_KINDS),
  })
  .strict();

/**
 * A player's pulls in order.
 *
 * ORDERED, AND NOTHING MORE. There is no trend label, no slope, no direction and
 * no field that could hold one. A movement in these counts tracks analyzer
 * coverage at least as much as it tracks play, so calling it "improving" would
 * be a claim the data cannot support.
 */
export const PublicPlayerSeriesSchema = z
  .object({
    playerKey: z.string(),
    sourceId: z.number().int(),
    /** Ascending by fight id. */
    points: z.array(PublicSeriesPointSchema),
    /** Between adjacent points, in the same order. */
    comparability: z.array(PublicComparabilitySchema),
  })
  .strict();

export const PublicTrendEvidenceSchema = z.object({ series: z.array(PublicPlayerSeriesSchema) }).strict();

// ---------------------------------------------------------------------------
// Partial failures
// ---------------------------------------------------------------------------

/**
 * Something that went wrong with a FIGHT, never with a player.
 *
 * A failed ingestion is not twenty players playing badly, and a requested fight
 * the report lacks is not twenty absences. No transport diagnostics appear here:
 * no HTTP status, no GraphQL error count, no upstream message.
 */
export const PublicBatchFailureSchema = z
  .object({
    fightId: z.number().int(),
    reason: z.enum(PUBLIC_BATCH_FAILURE_REASONS),
  })
  .strict();

// ---------------------------------------------------------------------------
// Coverage disclosure (M15-F)
// ---------------------------------------------------------------------------

/**
 * What a raid night does not establish. Declared independently of the
 * aggregation module's list and pinned equal to it by
 * `tests/contracts/m15f-coverage-disclosure-contract.test.ts`.
 */
export const PUBLIC_RAID_NIGHT_DISCLOSURES = [
  "NO_CELL_ANALYZED",
  "ONLY_OBSERVED_DECISIONS_VERIFIED",
  "DECISIONS_UNKNOWN",
  "CASTS_EXCLUDED",
  "CELLS_SPEC_NOT_SUPPORTED",
  "CELLS_NOT_ANALYZED",
  "CELLS_ANALYSIS_UNAVAILABLE",
  "FIGHTS_MISSING",
  "FIGHTS_FAILED",
  "CONSUMABLE_COUNT_UNKNOWN",
  "PREPARATION_NOT_ASSESSED",
  "DECISIONS_EVALUATED_UNDER_SIMC_PROFILE",
  "PER_FIGHT_PRESENTATION_NOT_INCLUDED",
] as const;

/**
 * The night's coverage disclosure (M15-F), the counterpart of the single-fight
 * TLDR's coverage line: `assessmentScope` is always PARTIAL, `disclosures` is
 * never empty, and the first of `lines` is always the coverage sentence. It
 * is derived from `coverage` and the cells' preparation only. It names no
 * score, rate or ranking, and NO_CELL_ANALYZED is not clean play.
 *
 * `lines` are author-templated sentences over the same counts; the codes are
 * the contract.
 */
export const RaidNightCoverageDisclosureSchema = z
  .object({
    revision: z.literal("raid-night-coverage-disclosure/1"),
    assessmentScope: z.literal("PARTIAL"),
    disclosures: z.array(z.enum(PUBLIC_RAID_NIGHT_DISCLOSURES)).min(1),
    lines: z.array(z.string().min(1)).min(1),
  })
  .strict();

// ---------------------------------------------------------------------------
// The result
// ---------------------------------------------------------------------------

/**
 * One raid night.
 *
 * `status` distinguishes an aggregate containing gameplay analysis from one
 * containing none. `NO_ANALYZED_CELLS` is complete and truthful — every player
 * unsupported, every player absent, or every fight's evidence unavailable — and
 * it must never be read as clean play. Absence of analysis is not evidence of
 * good play, and `coverage` is what says which of those it was.
 *
 * `capability` is the SAME object the single-fight contract publishes, imported
 * rather than restated. It describes what analyzed decision evidence means in
 * this product; it does not claim every cell here was analyzed.
 */
export const PublicRaidNightResultSchema = z
  .object({
    schemaVersion: z.literal(PUBLIC_RAID_NIGHT_SCHEMA_VERSION),
    status: z.enum(PUBLIC_RAID_NIGHT_STATUSES),
    capability: CapabilitySchema,
    identity: RaidNightIdentitySchema,
    /** Ascending by fight id. Included fights only. */
    fights: z.array(PublicFightSummarySchema),
    /** Ascending by source id. */
    roster: z.array(PublicPlayerSummarySchema),
    /** Ascending by (fight id, source id). A proven complete matrix. */
    cells: z.array(PublicCellSchema),
    coverage: PublicCoverageSummarySchema,
    /**
     * M15-F. Optional in the schema only (an additive v1 field, per the rule
     * above); this build always emits it.
     */
    coverageDisclosure: RaidNightCoverageDisclosureSchema.optional(),
    recurrence: PublicRecurrenceSummarySchema,
    trendEvidence: PublicTrendEvidenceSchema,
    /** Ascending by (fight id, reason). Fight-level only, never player-level. */
    partialFailures: z.array(PublicBatchFailureSchema),
  })
  .strict();

export type PublicRaidNightResult = z.infer<typeof PublicRaidNightResultSchema>;
export type PublicRaidNightIdentity = z.infer<typeof RaidNightIdentitySchema>;
export type PublicCell = z.infer<typeof PublicCellSchema>;
export type PublicAnalysisRef = z.infer<typeof AnalysisRefSchema>;
export type PublicCellCounts = z.infer<typeof CellCountsSchema>;
export type PublicFightSummary = z.infer<typeof PublicFightSummarySchema>;
export type PublicPlayerSummary = z.infer<typeof PublicPlayerSummarySchema>;
export type PublicCoverageSummary = z.infer<typeof PublicCoverageSummarySchema>;
export type PublicRecurrenceGroup = z.infer<typeof PublicRecurrenceGroupSchema>;
export type PublicTrendEvidence = z.infer<typeof PublicTrendEvidenceSchema>;
export type PublicBatchFailure = z.infer<typeof PublicBatchFailureSchema>;
export type PublicRaidNightCoverageDisclosure = z.infer<typeof RaidNightCoverageDisclosureSchema>;
