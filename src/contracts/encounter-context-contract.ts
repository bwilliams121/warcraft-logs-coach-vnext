/**
 * `warcraft-logs-coach.encounter-context/1` — the public encounter-context
 * document.
 *
 * A NEW CONTRACT, FROZEN INDEPENDENTLY. `analysis/1` and `raid-night/1` are not
 * touched: a consumer of either sees byte-identical documents after this
 * checkpoint, and a test asserts it. Sharing a version would have coupled the
 * stability of two proven contracts to the least-proven semantics in the
 * project.
 *
 * WHAT THIS DOCUMENT IS FOR, IN FOUR SEPARATE SECTIONS
 *
 *     identity            which report snapshot everything below came from
 *     encounters          local same-report progression (M8-D), per encounter
 *     unresolvedPulls     pulls no encounter sequence could claim
 *     externalReferences  bounded rankings-derived context (M8-F), optional
 *
 * They stay separate on purpose. Merging local progression facts and external
 * reference facts into one "findings" list is exactly how an external player's
 * behaviour would end up reading as a statement about the subject.
 *
 * WHAT IT IS NOT
 *
 * Not a scorecard. There is no score, rating, grade, accuracy, percentage of
 * anything, parse quality, rank, percentile, or "better"/"worse"/"improved"
 * field anywhere below — not by convention, but because no schema here declares
 * one. `WIPE_TO_KILL` is a named factual transition and is never rendered as
 * an improvement.
 */

import { z } from "zod";

import {
  PublicCellSchema,
  PublicRecurrenceSummarySchema,
  RaidNightIdentitySchema,
} from "./raid-night-contract.js";

/**
 * The public schema version.
 *
 * Independent of the other two `/1` versions. Removing a field, narrowing an
 * enum or changing what a field means requires a new version; adding a new
 * optional field does not.
 */
export const PUBLIC_ENCOUNTER_CONTEXT_SCHEMA_VERSION = "warcraft-logs-coach.encounter-context/1";

// ---------------------------------------------------------------------------
// Vocabularies
// ---------------------------------------------------------------------------

export const PUBLIC_PULL_OUTCOMES = ["KILL", "WIPE", "UNRESOLVED"] as const;

export const PUBLIC_DURATION_CHANGES = ["INCREASED", "DECREASED", "SAME", "UNKNOWN"] as const;

export const PUBLIC_OUTCOME_CHANGES = [
  "KILL_TO_KILL",
  "KILL_TO_WIPE",
  "WIPE_TO_KILL",
  "WIPE_TO_WIPE",
  "UNRESOLVED",
] as const;

export const PUBLIC_FIGHT_PROCESSING_OUTCOMES = ["INGESTED", "NOT_INGESTED", "INGESTION_FAILED"] as const;

export const PUBLIC_PULL_COMPARABILITIES = [
  "COMPARABLE",
  "COMPARABLE_WITH_CAVEATS",
  "NOT_COMPARABLE",
  "UNKNOWN",
] as const;

export const PUBLIC_DIMENSION_COMPATIBILITIES = ["COMPATIBLE", "INCOMPATIBLE", "UNKNOWN"] as const;

export const PUBLIC_HARD_DIMENSIONS = ["encounter", "difficulty", "version"] as const;

export const PUBLIC_COMPARISON_CAVEATS = [
  "DIFFERENT_ENCOUNTER_OUTCOME",
  "ENCOUNTER_OUTCOME_UNRESOLVED",
  "DIFFERENT_FIGHT_DURATION",
  "FIGHT_DURATION_UNRESOLVED",
  "DIFFERENT_RAID_SIZE",
  "RAID_SIZE_UNRESOLVED",
  "EXTERNAL_REPORT",
] as const;

export const PUBLIC_VERSION_COMPATIBILITY_BASES = [
  "SAME_REPORT_REVISION",
  "EVIDENCE_CONTRADICTION",
  "OBSERVED_FIELD_DIFFERENCE",
  "OBSERVED_FIELD_EQUALITY",
  "FIELD_SEMANTICS_UNPROVEN",
] as const;

export const PUBLIC_ANALYSIS_COMPARABILITIES = [
  "COMPATIBLE",
  "NOT_COMPATIBLE",
  "NOT_APPLICABLE",
  "UNKNOWN",
] as const;

/**
 * The status of the external-reference section.
 *
 * `COMPLETED` covers a discovery that ran, INCLUDING one that qualified nothing.
 * That is different from every failure below, and the difference is the whole
 * reason this enum is not a boolean.
 *
 * There is deliberately no `NO_COMPARABLE_LOGS`: no external pull is currently
 * proven comparable, so a status asserting their absence would be a claim about
 * something this product has never established.
 */
export const PUBLIC_EXTERNAL_REFERENCE_STATUSES = [
  /** The caller did not ask. Costs nothing and means nothing about the world. */
  "NOT_REQUESTED",
  /** The named subject pull belongs to no encounter sequence, so no board could be searched. */
  "SUBJECT_PULL_NOT_IN_A_SEQUENCE",
  /** A discovery ran. `qualified` may still be empty. */
  "COMPLETED",
  /** Warcraft Logs declined the ranking request, in-payload. */
  "REQUEST_REJECTED",
  /** The ranking payload was not a shape we hold evidence for. The pool is UNKNOWN. */
  "PAYLOAD_UNRECOGNISED",
  /** Warcraft Logs knows no such encounter. Not an empty pool. */
  "ENCOUNTER_NOT_FOUND",
] as const;

export const PUBLIC_CANDIDATE_FAILURE_REASONS = [
  "REPORT_NOT_ACCESSIBLE",
  "REPORT_ARCHIVED_INACCESSIBLE",
  "FIGHT_NOT_FOUND",
  "FIGHT_METADATA_INVALID",
  "ENCOUNTER_MISMATCH",
  "DIFFICULTY_MISMATCH",
  "SOURCE_UNRESOLVED",
  "SOURCE_AMBIGUOUS",
] as const;

export const PUBLIC_CANDIDATE_INELIGIBILITIES = ["HIDDEN_CHARACTER", "DUPLICATE_PULL_COORDINATE"] as const;

export const PUBLIC_PARTITION_MODES = ["PINNED", "LATEST"] as const;

export const PUBLIC_ENCOUNTER_REASONS = [
  "ENCOUNTER_IDS_EQUAL",
  "ENCOUNTER_IDS_DIFFER",
  "ENCOUNTER_UNRESOLVED",
  "NOT_AN_ENCOUNTER",
] as const;

export const PUBLIC_DIFFICULTY_REASONS = [
  "DIFFICULTY_EQUAL",
  "DIFFICULTY_DIFFERS",
  "DIFFICULTY_UNRESOLVED",
] as const;

// ---------------------------------------------------------------------------
// Capability
// ---------------------------------------------------------------------------

export const EncounterContextCapabilitySchema = z
  .object({
    /** What local progression is, and is not. */
    localProgression: z.literal("FACTUAL_SAME_REPORT_PROGRESSION"),
    /** What external references are, and are not. */
    externalReferences: z.literal("COMPARISON_CONTEXT_ONLY_NEVER_GAMEPLAY_AUTHORITY"),
    referencePool: z.literal("RANKINGS_DERIVED_REFERENCE_POOL_NOT_A_REPRESENTATIVE_POPULATION"),
    unknownHandling: z.literal("UNKNOWN_IS_FIRST_CLASS_AND_IS_NEVER_A_FAILURE"),
    scoring: z.literal("NO_SCORE_NO_RATING_NO_RANKING"),
    prediction: z.literal("NO_NEXT_ACTION_PREDICTION"),
  })
  .strict();

export type EncounterContextCapability = z.infer<typeof EncounterContextCapabilitySchema>;

/**
 * The capability object, frozen.
 *
 * Six statements, each naming something a reader might otherwise assume. This
 * is deliberately NOT the M6 `CAPABILITY` object: that one describes what an
 * analyzed DECISION means, and no decision appears in this document.
 */
export const ENCOUNTER_CONTEXT_CAPABILITY: EncounterContextCapability = Object.freeze({
  localProgression: "FACTUAL_SAME_REPORT_PROGRESSION",
  externalReferences: "COMPARISON_CONTEXT_ONLY_NEVER_GAMEPLAY_AUTHORITY",
  referencePool: "RANKINGS_DERIVED_REFERENCE_POOL_NOT_A_REPRESENTATIVE_POPULATION",
  unknownHandling: "UNKNOWN_IS_FIRST_CLASS_AND_IS_NEVER_A_FAILURE",
  scoring: "NO_SCORE_NO_RATING_NO_RANKING",
  prediction: "NO_NEXT_ACTION_PREDICTION",
});

// ---------------------------------------------------------------------------
// Local progression
// ---------------------------------------------------------------------------

const ZoneSchema = z
  .object({
    id: z.number().int(),
    name: z.string(),
    /** A Warcraft Logs caching fact. Never a quality signal. */
    frozen: z.boolean(),
    expansion: z.object({ id: z.number().int(), name: z.string() }).strict().nullable(),
  })
  .strict();

/**
 * M8-C's two phase-summary integers, kept apart.
 *
 * NEVER RECONCILED INTO ONE "PHASE REACHED". The frozen Warcraft Logs schema
 * counts them on different bases — `lastPhase` from 1 within a phase TYPE,
 * `lastPhaseAsAbsoluteIndex` from 0 across every phase — and M8-A measured them
 * disagreeing (1 against 4) on one real kill. There is no `furthestPhase` and no
 * `phaseProgress` field, and no direction is derived between pulls.
 *
 * `null` throughout means Warcraft Logs supplied no usable value; the reason is
 * not recoverable and is never inferred.
 */
const PhaseSummarySchema = z
  .object({
    lastPhase: z.number().int().nullable(),
    lastPhaseAsAbsoluteIndex: z.number().int().nullable(),
    lastPhaseIsIntermission: z.boolean().nullable(),
  })
  .strict();

/**
 * What changed between two adjacent pulls of one encounter.
 *
 * Exactly two derived directions, both total orders over facts: milliseconds,
 * and a pair of named outcomes. `durationDeltaMs` is a SUBTRACTION — there is
 * deliberately no percentage change, because dividing two durations produces the
 * first number in this document that would read as a performance measure.
 *
 * NO PHASE OR PERCENTAGE DIRECTION EXISTS. M8-C established that the two phase
 * fields count differently and that `bossPercentage`/`fightPercentage` both read
 * `0.04` on a KILL — so their direction is not merely unproven but
 * counter-intuitive. Nothing here carries one.
 */
const AdjacentChangeSchema = z
  .object({
    fromFightId: z.number().int(),
    toFightId: z.number().int(),
    fromDurationMs: z.number().int().nullable(),
    toDurationMs: z.number().int().nullable(),
    durationChange: z.enum(PUBLIC_DURATION_CHANGES),
    durationDeltaMs: z.number().int().nullable(),
    fromOutcome: z.enum(PUBLIC_PULL_OUTCOMES),
    toOutcome: z.enum(PUBLIC_PULL_OUTCOMES),
    /** A named transition. `WIPE_TO_KILL` is a fact, not an achievement. */
    outcomeChange: z.enum(PUBLIC_OUTCOME_CHANGES),
  })
  .strict();

const PublicPullSchema = z
  .object({
    fightId: z.number().int(),
    /** Report-relative. The canonical ordering key. */
    startTimeMs: z.number().int(),
    durationMs: z.number().int(),
    outcome: z.enum(PUBLIC_PULL_OUTCOMES),
    raidSize: z.number().int().nullable(),
    /** What processing this fight received. Never a judgement about anyone. */
    processingOutcome: z.enum(PUBLIC_FIGHT_PROCESSING_OUTCOMES),
    /** `null` when no M8-C facts were supplied — an un-ingested fight has none. */
    phaseSummary: PhaseSummarySchema.nullable(),
    /** `null` for the first pull of the sequence. */
    changeFromPrevious: AdjacentChangeSchema.nullable(),
  })
  .strict();

const AnalysisComparabilitySchema = z
  .object({
    comparability: z.enum(PUBLIC_ANALYSIS_COMPARABILITIES),
    reason: z.string(),
    /** Canonical order. Non-empty only for NOT_COMPATIBLE. */
    differingFields: z.array(z.string()),
  })
  .strict();

const PublicProgressionPointSchema = z
  .object({
    fightId: z.number().int(),
    /** M7's compact cell, reused rather than restated. */
    cell: PublicCellSchema,
    /**
     * Whether this point's analysis may be placed beside the previous point's.
     *
     * `null` for the first point. NOT_APPLICABLE and UNKNOWN are both refusals
     * — for different reasons — and neither says anything about how anyone
     * played.
     */
    analysisComparabilityToPrevious: AnalysisComparabilitySchema.nullable(),
  })
  .strict();

const PublicPlayerProgressionSchema = z
  .object({
    playerKey: z.string(),
    sourceId: z.number().int(),
    points: z.array(PublicProgressionPointSchema),
    fightsPresent: z.number().int(),
    fightsAbsent: z.number().int(),
    /** Ascending. Normally empty; a visible hole rather than a fabricated absence. */
    pullsWithoutCell: z.array(z.number().int()),
  })
  .strict();

const PublicEncounterProgressionSchema = z
  .object({
    encounterId: z.number().int().nullable(),
    difficulty: z.number().int().nullable(),
    zone: ZoneSchema.nullable(),
    /** Canonical chronological order: start time, then fight id. */
    pulls: z.array(PublicPullSchema),
    /** Ascending by source id. Every roster player, including never-present ones. */
    players: z.array(PublicPlayerProgressionSchema),
    /** M7's three collections, scoped to this encounter. They may never be summed. */
    recurrence: PublicRecurrenceSummarySchema,
  })
  .strict();

/**
 * A pull no encounter sequence could claim.
 *
 * NOT A FAILURE. Trash lands here, and so does a fight whose difficulty Warcraft
 * Logs did not report. The reasons are M8-B's own vocabulary.
 */
const PublicUnresolvedPullSchema = z
  .object({
    fightId: z.number().int(),
    startTimeMs: z.number().int(),
    encounterReason: z.enum(PUBLIC_ENCOUNTER_REASONS),
    difficultyReason: z.enum(PUBLIC_DIFFICULTY_REASONS),
    unresolvedDimensions: z.array(z.enum(PUBLIC_HARD_DIMENSIONS)),
  })
  .strict();

// ---------------------------------------------------------------------------
// External references
// ---------------------------------------------------------------------------

/**
 * Which ranking partition was requested.
 *
 * `LATEST` is recorded as a distinct mode rather than as a partition number,
 * because it is NOT reproducible: Warcraft Logs resolves it at query time and
 * the answer moves across a partition rollover. A caller choosing it is choosing
 * that, and this field is where a reader can see they did.
 *
 * Neither mode says anything about gameplay version compatibility. That is
 * `comparability`'s answer, and it is currently UNKNOWN across reports.
 */
const PartitionSelectionSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("PINNED"), partition: z.number().int() }).strict(),
  z.object({ mode: z.literal("LATEST") }).strict(),
]);

/**
 * How the candidate pool was obtained.
 *
 * Enough to judge the retrieval, and nothing that could rank anybody. There is
 * no position, no `amount`, no percentile: the decoder never read them.
 */
const ReferencePoolProvenanceSchema = z
  .object({
    source: z.literal("RANKINGS_DERIVED_REFERENCE_POOL"),
    encounterId: z.number().int(),
    difficulty: z.number().int(),
    className: z.string(),
    specName: z.string(),
    metric: z.string(),
    partition: PartitionSelectionSchema,
    /** Always 1. One bounded page was considered; no pagination loop exists. */
    page: z.number().int(),
    /** The board's own count, verbatim. Never the number of rows we kept. */
    reportedCount: z.number().int().nullable(),
    /** Warcraft Logs said more pages exist. Disclosed; never followed. */
    hasMorePages: z.boolean(),
    rowsDecoded: z.number().int(),
    rowsEligible: z.number().int(),
  })
  .strict();

const VersionCompatibilitySchema = z
  .object({
    compatibility: z.enum(PUBLIC_DIMENSION_COMPATIBILITIES),
    basis: z.enum(PUBLIC_VERSION_COMPATIBILITY_BASES),
    differingFields: z.array(z.string()),
    unresolvedFields: z.array(z.string()),
  })
  .strict();

/**
 * M8-B's verdict, projected faithfully.
 *
 * For a cross-report reference this is expected to be UNKNOWN with
 * `unresolvedDimensions: ["version"]` and basis `FIELD_SEMANTICS_UNPROVEN`.
 * That is not suppressed, not softened, and never replaced by "similar",
 * "close match" or "reference quality". There is no numeric score.
 */
const PublicComparabilityAssessmentSchema = z
  .object({
    comparability: z.enum(PUBLIC_PULL_COMPARABILITIES),
    encounter: z
      .object({
        compatibility: z.enum(PUBLIC_DIMENSION_COMPATIBILITIES),
        reason: z.enum(PUBLIC_ENCOUNTER_REASONS),
      })
      .strict(),
    difficulty: z
      .object({
        compatibility: z.enum(PUBLIC_DIMENSION_COMPATIBILITIES),
        reason: z.enum(PUBLIC_DIFFICULTY_REASONS),
      })
      .strict(),
    version: VersionCompatibilitySchema,
    caveats: z.array(z.enum(PUBLIC_COMPARISON_CAVEATS)),
    incompatibleDimensions: z.array(z.enum(PUBLIC_HARD_DIMENSIONS)),
    unresolvedDimensions: z.array(z.enum(PUBLIC_HARD_DIMENSIONS)),
  })
  .strict();

/**
 * One established external reference.
 *
 * `qualification` and `comparability` ARE DIFFERENT FACTS AND THE SCHEMA SAYS
 * SO. Qualification means we established this pull and player's identity and
 * metadata. Comparability means M8-B judged whether it may be compared — and it
 * currently answers UNKNOWN across reports. A reference is routinely
 * `QUALIFIED` and `UNKNOWN` at the same time.
 *
 * Coordinates are published so a caller can ask the existing `analysis/1`
 * interface about this pull directly. The full analysis is NOT embedded.
 */
const PublicExternalReferenceSchema = z
  .object({
    qualification: z.literal("QUALIFIED"),
    reportCode: z.string(),
    /** The EXTERNAL report's own revision. Not shared with the subject snapshot. */
    reportRevision: z.number().int(),
    fightId: z.number().int(),
    /** Only after a unique (name, server) identity match. */
    sourceId: z.number().int(),
    playerName: z.string(),
    className: z.string(),
    specName: z.string(),
    serverName: z.string().nullable(),
    serverRegion: z.string().nullable(),
    encounterId: z.number().int(),
    difficulty: z.number().int().nullable(),
    durationMs: z.number().int(),
    kill: z.boolean().nullable(),
    raidSize: z.number().int().nullable(),
    /** Item-level context, raw and uninterpreted under its Warcraft Logs name. */
    bracketData: z.number().int().nullable(),
    hardModeLevel: z.number().int().nullable(),
    gameVersion: z.number().int().nullable(),
    logVersion: z.number().int().nullable(),
    phaseSummary: PhaseSummarySchema,
    zone: ZoneSchema.nullable(),
    comparability: PublicComparabilityAssessmentSchema,
  })
  .strict();

const PublicCandidateFailureSchema = z
  .object({
    reportCode: z.string(),
    fightId: z.number().int(),
    reason: z.enum(PUBLIC_CANDIDATE_FAILURE_REASONS),
  })
  .strict();

const PublicIneligibleRowSchema = z
  .object({
    reportCode: z.string(),
    fightId: z.number().int(),
    reason: z.enum(PUBLIC_CANDIDATE_INELIGIBILITIES),
  })
  .strict();

/**
 * The external-reference section.
 *
 * `provenance`, `qualified`, `failures` and `ineligible` are present only when a
 * discovery ran — `status: COMPLETED`. Every other status is a skip or a
 * retrieval failure, and carrying empty arrays for those would make "nothing was
 * found" indistinguishable from "nothing was attempted".
 */
const PublicExternalReferenceSectionSchema = z.discriminatedUnion("status", [
  z
    .object({
      status: z.literal("COMPLETED"),
      provenance: ReferencePoolProvenanceSchema,
      /** At most 5. Ascending by (reportCode, fightId) — identity, not merit. */
      qualified: z.array(PublicExternalReferenceSchema),
      /** Selected candidates that could not be established. Candidate-local. */
      failures: z.array(PublicCandidateFailureSchema),
      /** Rows excluded before qualification, with a structural reason. */
      ineligible: z.array(PublicIneligibleRowSchema),
    })
    .strict(),
  z.object({ status: z.literal("NOT_REQUESTED") }).strict(),
  z.object({ status: z.literal("SUBJECT_PULL_NOT_IN_A_SEQUENCE") }).strict(),
  z.object({ status: z.literal("REQUEST_REJECTED"), message: z.string() }).strict(),
  z.object({ status: z.literal("PAYLOAD_UNRECOGNISED") }).strict(),
  z.object({ status: z.literal("ENCOUNTER_NOT_FOUND") }).strict(),
]);

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

export const PublicEncounterContextResultSchema = z
  .object({
    schemaVersion: z.literal(PUBLIC_ENCOUNTER_CONTEXT_SCHEMA_VERSION),
    capability: EncounterContextCapabilitySchema,
    /** M7-C's factual snapshot identity, reused unchanged. */
    identity: RaidNightIdentitySchema,
    /** Ordered by each sequence's first pull, chronologically. */
    encounters: z.array(PublicEncounterProgressionSchema),
    /** Canonical chronological order. Never a failure. */
    unresolvedPulls: z.array(PublicUnresolvedPullSchema),
    externalReferences: PublicExternalReferenceSectionSchema,
  })
  .strict();

export type PublicEncounterContextResult = z.infer<typeof PublicEncounterContextResultSchema>;
export type PublicEncounterProgression = z.infer<typeof PublicEncounterProgressionSchema>;
export type PublicExternalReferenceSection = z.infer<typeof PublicExternalReferenceSectionSchema>;
export type PublicExternalReference = z.infer<typeof PublicExternalReferenceSchema>;
export type PublicPull = z.infer<typeof PublicPullSchema>;
export type PublicUnresolvedPull = z.infer<typeof PublicUnresolvedPullSchema>;
