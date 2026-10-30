/**
 * The public analysis contract.
 *
 * WHAT THIS FILE IS
 *
 * The one shape every interface publishes analysis through. MCP and REST will
 * both project into it, so there is exactly one public description of what the
 * engine proved — not a Rogue-shaped MCP payload and a different REST one that
 * drift apart and disagree about the same fight.
 *
 * WHY IT IS DECLARED HERE RATHER THAN DERIVED FROM INTERNAL TYPES
 *
 * Every field below is spelled out. None of it is `typeof someInternalType`, no
 * internal object is spread in, and no internal const array is imported to
 * become a public enum. That is deliberate and it costs some duplication:
 *
 *   - M5 can be refactored without silently reshaping the public contract.
 *   - An internal enum gaining a member does NOT quietly become a public value.
 *     It fails a test instead, and somebody decides whether to publish it.
 *
 * The duplication is the point. A contract that tracks its implementation
 * automatically is not a contract.
 *
 * WHAT IS DELIBERATELY ABSENT
 *
 * No score, no percentage, no correctness. Not as a naming convention — as a
 * structural fact. There is nowhere in this schema to put one, so no projection
 * can emit one and no consumer can read one. See `CAPABILITY`, which states the
 * same limits in machine-readable form rather than trusting prose.
 *
 * Also absent: every internal evaluation trace. A reader gets stable
 * conclusions, stable evidence identity and stable provenance — enough to
 * explain what the engine proved, and not enough to re-litigate it against
 * machinery they cannot see.
 */

import * as z from "zod";

import type { PublicSpecId, SpecId } from "../findings/finding.js";

/**
 * The public analysis schema version.
 *
 * THIS VERSIONS THE WIRE SHAPE AND ITS SEMANTICS. Nothing else. It is not the
 * SimulationCraft commit (see `authority.commitSha`), not the Worker build, not
 * the MCP protocol revision, and not the World of Warcraft game version.
 *
 * THE RULE: any backwards-incompatible change to the public shape OR to what a
 * field means requires a new version. Removing a field, narrowing an enum,
 * making an optional field required, or changing what `MATCH` asserts are all
 * version changes. Adding a new optional field is not.
 *
 * One literal is enough for M6. There is no negotiation, no range and no
 * content type — a consumer reads this string and knows what it is holding.
 */
export const PUBLIC_ANALYSIS_SCHEMA_VERSION = "warcraft-logs-coach.analysis/1";

/**
 * Specializations this contract may name.
 *
 * DECLARED INDEPENDENTLY of the internal partition (`src/findings/spec-id.ts`),
 * like every other public vocabulary in this file, and pinned equal to it by
 * `tests/contracts/m10a-spec-partition.test.ts`. `satisfies` proves every
 * entry is a real `SpecId`; the two guards below prove that this list is
 * exactly the PUBLIC half of the partition — no public id missing, no
 * internal-only id present. An internal-only specialization therefore cannot
 * reach this enum by being added to `SpecId`: it reaches it only by a reviewed
 * move into the public partition, and the compile fails until the two agree.
 */
export const PUBLIC_SPEC_IDS = [
  "rogue/assassination",
  "paladin/protection",
  "paladin/retribution",
  "deathknight/blood",
  "monk/brewmaster",
] as const satisfies readonly SpecId[];

type ListedSpecId = (typeof PUBLIC_SPEC_IDS)[number];
/** Compile-time guard: fails when a PUBLIC `SpecId` exists that this contract does not list. */
const _everyPublicSpecIdIsListed: [Exclude<PublicSpecId, ListedSpecId>] extends [never] ? true : never = true;
void _everyPublicSpecIdIsListed;
/** Compile-time guard: fails when this contract lists an id the partition keeps internal. */
const _nothingInternalIsListed: [Exclude<ListedSpecId, PublicSpecId>] extends [never] ? true : never = true;
void _nothingInternalIsListed;

// ---------------------------------------------------------------------------
// Public vocabularies
//
// Declared independently of the internal unions. `tests/contracts/` asserts each
// list equals its internal counterpart exactly, so an internal change surfaces
// as a failing test rather than as a silent public contract change.
// ---------------------------------------------------------------------------

/** The three comparison outcomes. None of them is a grade. */
export const PUBLIC_COMPARISON_OUTCOMES = ["MATCH", "REJECTED", "UNKNOWN"] as const;

export const PUBLIC_COMPARISON_BASES = [
  "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
  "OBSERVED_ACTION_REJECTED_BY_AUTHORITY",
  "AUTHORITY_SELECTED_DIFFERENT_TOKEN",
  "AUTHORITY_SELECTION_UNRESOLVED",
  "INCONSISTENT_AUTHORITY_RESULTS",
  "AUTHORITY_SELECTED_NO_ACTION_DESPITE_OBSERVED_GCD",
] as const;

/** How completely the authority selection itself landed. Never merged with outcome. */
export const PUBLIC_AUTHORITY_COVERAGES = ["EXACT_ENTRY", "TOKEN_CONVERGED", "NO_ACTION", "UNKNOWN"] as const;

export const PUBLIC_SELECTION_PRECISIONS = ["EXACT_ENTRY", "TOKEN_CONVERGED"] as const;

export const PUBLIC_DECISION_BLOCKER_CLASSES = [
  "OBSERVED_STATE_MISSING",
  "DIVERGENT_WORLDS",
  "TARGET_COUNT",
  "PREDICTIVE_STATE",
  "TARGETING_NOT_MODELLED",
  "USABILITY_NOT_PROVEN",
  "OTHER",
] as const;

export const PUBLIC_USABILITY_PROVENANCES = ["OBSERVED_EXECUTION", "NOT_ESTABLISHED"] as const;

/**
 * Why an observed cast was not an eligible decision.
 *
 * The first three are the M6 vocabulary and keep their exact meaning: the
 * cast does not consume a global cooldown; the pinned data establishes no
 * execution lane for it; it has a lane but binds to no authority token.
 *
 * `OUTSIDE_SUPPORTED_SLICE` joined under `analysis/1` in M11-A5, by the same
 * additive-widening precedent as `paladin/protection` joining the `specId`
 * enum in M10-D: no existing document changes, no field changes meaning, and
 * a consumer holding the older list sees a new value only in documents of an
 * analyzer whose slice is narrower than its authority. It means: the observed
 * action is a rotational, authority-bound, global-cooldown decision that is
 * INTENTIONALLY outside the analyzer's currently supported decision slice.
 * It is not a rotational judgment. It must not be read as MATCH, as REJECTED,
 * as UNKNOWN-for-missing-state, or as a performance error — the analyzer did
 * not evaluate it, by design, and says so. The value is spec-neutral: any
 * analyzer whose documented slice is narrower than its authority's action set
 * publishes it for the in-domain decisions it does not judge.
 */
export const PUBLIC_EXCLUSION_REASONS = [
  "NON_GCD_ACTION",
  "EXECUTION_LANE_NOT_ESTABLISHED",
  "NO_AUTHORITY_TOKEN_BINDING",
  "OUTSIDE_SUPPORTED_SLICE",
] as const;

export const PUBLIC_ANALYSIS_STATUSES = [
  "ANALYZED",
  "SPEC_NOT_SUPPORTED",
  "AUTHORITY_NOT_AVAILABLE",
  "PROFILE_NOT_RESOLVED",
  "INSUFFICIENT_EVIDENCE",
] as const;

// No public evidence-scope vocabulary exists: ingestion scope is not published.
// See the note on `commonFields`.

// ---------------------------------------------------------------------------
// Capability semantics
// ---------------------------------------------------------------------------

/**
 * What this analysis IS, stated so a machine cannot misread it.
 *
 * These are constants rather than prose because prose is the first thing a
 * summarising agent discards. A model that drops the description still has
 * `predictsArbitraryNextAction: false` in the payload it is reasoning over.
 *
 * Every boolean is phrased so the SAFE answer is the literal value. There is no
 * way to express "this does score performance" in this schema, because
 * `scoresPerformance` is pinned to `false` by the literal type.
 */
export const CapabilitySchema = z
  .object({
    /**
     * The engine verifies decisions the player ALREADY MADE against a pinned
     * authority. It is not a rotation recommender and not a next-action engine.
     */
    analysisKind: z.literal("OBSERVED_DECISION_AUTHORITY_VERIFICATION"),
    /**
     * `MATCH` means the supported authority analysis resolved the same action
     * token that was observed. It does not mean correct, optimal, ideal, best,
     * recommended or mistake-free.
     */
    matchMeaning: z.literal("AUTHORITY_COMPATIBLE_ONLY"),
    /** Only observed decisions are evaluated. Moments of inaction are not. */
    verifiesObservedDecisionsOnly: z.literal(true),
    /** The engine cannot say what should have been pressed at an arbitrary moment. */
    predictsArbitraryNextAction: z.literal(false),
    /** There is no score, grade, rank or accuracy anywhere in this contract. */
    scoresPerformance: z.literal(false),
    /** `UNKNOWN` is a legitimate answer, never a failure and never a negative. */
    unknownIsFirstClass: z.literal(true),
    /** Coverage is deliberately narrow; a result is not a complete assessment. */
    partialCoverageIsExpected: z.literal(true),
  })
  .strict();

export type Capability = z.infer<typeof CapabilitySchema>;

/** The single capability value. Frozen so a projection cannot vary it per call. */
export const CAPABILITY: Capability = Object.freeze({
  analysisKind: "OBSERVED_DECISION_AUTHORITY_VERIFICATION",
  matchMeaning: "AUTHORITY_COMPATIBLE_ONLY",
  verifiesObservedDecisionsOnly: true,
  predictsArbitraryNextAction: false,
  scoresPerformance: false,
  unknownIsFirstClass: true,
  partialCoverageIsExpected: true,
});

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * Factual Warcraft Logs identity, as preflight established it.
 *
 * `startTimeMs`/`endTimeMs` are renamed from the internal `startTime`/`endTime`
 * purely to state the unit at the boundary. The values are unchanged.
 *
 * The report's own wall-clock window is NOT published. Decision timing is
 * expressed in fight-relative and report-relative milliseconds, which is what a
 * reader needs; an absolute anchor would only invite converting analysis times
 * into timestamps that mean nothing to the analysis.
 */
export const IdentitySchema = z
  .object({
    report: z.object({ code: z.string(), revision: z.number().int() }).strict(),
    fight: z
      .object({
        id: z.number().int(),
        name: z.string(),
        /** `0` identifies trash rather than an encounter. Recorded, not judged. */
        encounterId: z.number().int(),
        difficulty: z.number().int().nullable(),
        startTimeMs: z.number(),
        endTimeMs: z.number(),
      })
      .strict(),
    player: z
      .object({
        sourceId: z.number().int(),
        name: z.string(),
        /** The class Warcraft Logs reported, verbatim. */
        className: z.string(),
        /** The specialization Warcraft Logs reported, verbatim. */
        specName: z.string(),
      })
      .strict(),
    data: z.object({ logVersion: z.number().int(), gameVersion: z.number().int().nullable() }).strict(),
  })
  .strict();

/**
 * Which specialization the engine RECOGNIZED, as opposed to what Warcraft Logs
 * reported.
 *
 * These are different questions and the split is load-bearing. An Arms
 * Warrior has a perfectly good factual identity in `identity.player`, and
 * `specId: null` here — because this build has no internal name for that
 * specialization. Inventing `warrior/arms` to fill the gap would claim
 * recognition the engine does not have.
 *
 * WIDENING THIS ENUM IS NOT A SCHEMA VERSION CHANGE. `paladin/protection`
 * joined it in M10-D, `paladin/retribution` in M11-A5, `deathknight/blood`
 * in M11-B12 and `monk/brewmaster` in M11-C4j, all under `analysis/1`: the shape is unchanged, the meaning of
 * both fields is unchanged, the `status` discriminant is unchanged, and no
 * document a consumer had already received changes — the only documents that
 * differ are those of the newly supported specialization, which previously
 * carried `SPEC_NOT_SUPPORTED`. The versioning rule above forbids NARROWING
 * an enum; growing this one is how supported specializations arrive. M11-B12
 * widened this enum and NOTHING ELSE: no outcome, basis, blocker, exclusion
 * reason, status or capability value moved for Blood; M11-C4j likewise for
 * Brewmaster.
 */
export const SpecializationSchema = z
  .object({
    /** The internal id, or `null` when the identity maps to no known specialization. */
    specId: z.enum(PUBLIC_SPEC_IDS).nullable(),
    /** Whether a registered analyzer exists for this specialization and ran. */
    gameplaySupported: z.boolean(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Authority provenance
// ---------------------------------------------------------------------------

/**
 * Where the rotational authority came from, exactly.
 *
 * Every field is read from the committed artifact, so a reader can open the
 * pinned source at the recorded commit and see the text a verdict rested on.
 *
 * Nothing here is invented. There is deliberately no authority-kind enum, no
 * analyzer hash, no profile hash and no talent or game-data provenance —
 * the analysis result does not carry them, and a contract that named them would
 * be describing metadata the engine cannot supply.
 */
export const AuthoritySchema = z
  .object({
    authorityId: z.string(),
    artifactRevision: z.string(),
    repository: z.string(),
    branch: z.string(),
    commitSha: z.string(),
    sourcePath: z.string(),
    sourceSha256: z.string(),
    specName: z.string(),
    className: z.string(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Decisions and exclusions
// ---------------------------------------------------------------------------

/**
 * Stable identity for one observed event.
 *
 * THIS IS THE DECISION IDENTITY FOR SCHEMA v1. There is deliberately no flat
 * string id alongside it: no exported canonical formatter exists in the
 * repository with tested collision semantics, and inventing a concatenation
 * scheme here would freeze an arbitrary one into the public contract forever.
 *
 * The four retrieval fields identify the observation uniquely. Time alone does
 * NOT — equal timestamps are real in this data.
 */
export const EvidenceLocatorSchema = z
  .object({
    streamId: z.string(),
    pageOrdinal: z.number().int(),
    indexInPage: z.number().int(),
    ingestionOrdinal: z.number().int(),
    /** Warcraft Logs' own event type string, verbatim. */
    rawType: z.string(),
    /** Report-relative timestamp, exactly as supplied. Never rounded. */
    reportTimeMs: z.number(),
  })
  .strict();

/**
 * One observed rotational decision, compared against the authority.
 *
 * `outcome` and `authorityCoverage`/`selectionPrecision` are separate axes and
 * are never collapsed: a decision can resolve at exact-entry precision and
 * still be REJECTED, and a token-level agreement must never be readable as an
 * entry-level one.
 *
 * `rawBlocker` is NOT here. The engine's internal blocker string is debugging
 * evidence about where a scan stopped; `decisiveBlocker` is the stable,
 * countable vocabulary a reader can act on.
 */
export const DecisionSchema = z
  .object({
    locator: EvidenceLocatorSchema,
    /** Canonical index in the normalized fight. Never an ingestion ordinal. */
    position: z.number().int(),
    /** Milliseconds from the start of the fight. */
    fightTimeMs: z.number(),
    /** The enemy this decision was about, where the event established one. */
    targetActorId: z.number().int().nullable(),
    observedAbilityGameId: z.number().int(),
    /** The SimulationCraft token the observed ability binds to. */
    observedToken: z.string(),
    outcome: z.enum(PUBLIC_COMPARISON_OUTCOMES),
    basis: z.enum(PUBLIC_COMPARISON_BASES),
    authorityCoverage: z.enum(PUBLIC_AUTHORITY_COVERAGES),
    /** The token the authority resolved, when it resolved one. */
    authorityToken: z.string().nullable(),
    /** Set only when the authority resolved a token. */
    selectionPrecision: z.enum(PUBLIC_SELECTION_PRECISIONS).nullable(),
    /** Set only when `outcome` is UNKNOWN and a blocker was recorded. */
    decisiveBlocker: z.enum(PUBLIC_DECISION_BLOCKER_CLASSES).nullable(),
    /**
     * Where the positive usability behind a resolved selection came from.
     *
     * Usually `OBSERVED_EXECUTION`: the cast demonstrably fired, which is what
     * proves the action was usable. It is also the reason a comparison is a
     * verification rather than a prediction, so it is published rather than left
     * for a reader to infer.
     */
    usabilityProvenance: z.enum(PUBLIC_USABILITY_PROVENANCES),
    // THERE IS DELIBERATELY NO `observedActionRejected` BOOLEAN HERE.
    //
    // The internal observed-action judgment has three states — proven rejected,
    // unknown, and no authority available — and no positive one. Collapsing that
    // to a boolean would publish `false` for "rejection was not proven", which a
    // consumer reads as "the action was not rejected". Those are different
    // claims, and the second is one this engine never makes.
    //
    // `UNKNOWN must never become false` is M5's standing rule; a two-state field
    // over a three-state judgment breaks it at the boundary. A rejection that
    // came from that rule stays fully visible through `outcome: "REJECTED"` with
    // `basis: "OBSERVED_ACTION_REJECTED_BY_AUTHORITY"`, which says more than the
    // boolean did and says it without inventing a negative.
  })
  .strict();

/**
 * An observed cast that is not an eligible rotational decision.
 *
 * Published rather than dropped. A reader who cannot see the exclusions cannot
 * tell a small honest denominator from a cherry-picked one.
 */
export const ExclusionSchema = z
  .object({
    locator: EvidenceLocatorSchema,
    position: z.number().int(),
    abilityGameId: z.number().int(),
    reportTimeMs: z.number(),
    reason: z.enum(PUBLIC_EXCLUSION_REASONS),
  })
  .strict();

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

function tallyOf<T extends readonly [string, ...string[]]>(values: T) {
  return z.array(z.object({ key: z.enum(values), count: z.number().int().nonnegative() }).strict());
}

/**
 * What the analysis could resolve, and over what.
 *
 * THE DENOMINATOR IS `eligibleDecisions` AND NOTHING ELSE. Not all casts, not
 * all GCDs in the fight, not the player's whole performance. It is the observed
 * rotational-GCD decisions this comparison could legitimately be asked about.
 *
 * INTEGERS ONLY, BY DESIGN. There is no percentage, no rate and no resolution
 * ratio. A consumer that wants one computes it from two integers, which makes
 * it hard to print accidentally and impossible to mistake for a grade — and
 * note that even `match + rejected == eligibleDecisions` would mean only that
 * every decision in this narrow supported slice resolved, never that the
 * player's gameplay was fully examined.
 */
export const CoverageSchema = z
  .object({
    eligibleDecisions: z.number().int().nonnegative(),
    match: z.number().int().nonnegative(),
    rejected: z.number().int().nonnegative(),
    unknown: z.number().int().nonnegative(),
    /** MATCH + REJECTED. */
    resolvedComparisons: z.number().int().nonnegative(),
    exactEntryMatches: z.number().int().nonnegative(),
    tokenConvergedMatches: z.number().int().nonnegative(),
    /** Authority precision across eligible decisions, independent of outcome. */
    selectionPrecision: tallyOf(PUBLIC_AUTHORITY_COVERAGES),
    unknownBases: tallyOf(PUBLIC_COMPARISON_BASES),
    unknownBlockerClasses: tallyOf(PUBLIC_DECISION_BLOCKER_CLASSES),
    exclusions: tallyOf(PUBLIC_EXCLUSION_REASONS),
    excludedCastCount: z.number().int().nonnegative(),
  })
  .strict();

// ---------------------------------------------------------------------------
// Preparation: consumable status (PREP-2)
// ---------------------------------------------------------------------------

/** Why a consumable count is UNKNOWN. Never a negative; each is a stated limit. */
export const PUBLIC_CONSUMABLE_UNKNOWN_CODES = [
  "CAST_COVERAGE",
  "AURA_COVERAGE",
  "FIGHT_SHORTER_THAN_LONGEST_COMBAT_POTION_BUFF",
  "UNCLASSIFIED_CANDIDATE",
  "IDENTITY_DATA_UNAVAILABLE",
] as const;

/** Which coverage check failed, for CAST_COVERAGE / AURA_COVERAGE. */
export const PUBLIC_COVERAGE_GATES = [
  "CAPABILITY_UNVERIFIED",
  "CAPABILITY_NOT_OBSERVABLE",
  "INSUFFICIENT_SCOPE",
  "INSUFFICIENT_COVERAGE",
] as const;

/**
 * When a use happened. UNRESOLVED: a combat-potion buff removal with no
 * in-fight cast or application seen, under incomplete coverage — a use, with
 * no claim about when it was taken.
 */
export const PUBLIC_CONSUMABLE_USE_TIMINGS = ["IN_FIGHT", "BEFORE_PULL", "UNRESOLVED"] as const;

/** Why preparation was not assessed. Nothing is claimed about consumables. */
export const PUBLIC_PREPARATION_NOT_ASSESSED_REASONS = ["NO_FIGHT_RETRIEVED", "RETRIEVAL_FAILED"] as const;

const ConsumableUseSchema = z
  .object({
    spellId: z.number().int().positive(),
    /** The spell's name in the pinned game data. */
    name: z.string().min(1),
    timing: z.enum(PUBLIC_CONSUMABLE_USE_TIMINGS),
    /** The cast, or the buff removal that reveals the use. */
    evidence: EvidenceLocatorSchema,
  })
  .strict();

const ConsumableUnknownReasonSchema = z.discriminatedUnion("code", [
  z.object({ code: z.literal("CAST_COVERAGE"), gate: z.enum(PUBLIC_COVERAGE_GATES) }).strict(),
  z.object({ code: z.literal("AURA_COVERAGE"), gate: z.enum(PUBLIC_COVERAGE_GATES) }).strict(),
  z
    .object({
      code: z.literal("FIGHT_SHORTER_THAN_LONGEST_COMBAT_POTION_BUFF"),
      fightDurationMs: z.number().int().nonnegative(),
      longestBuffMs: z.number().int().positive(),
    })
    .strict(),
  z
    .object({
      code: z.literal("UNCLASSIFIED_CANDIDATE"),
      spellId: z.number().int().positive(),
      abilityName: z.string().min(1),
    })
    .strict(),
  z.object({ code: z.literal("IDENTITY_DATA_UNAVAILABLE") }).strict(),
]);

/**
 * One consumable's status. The discriminators are `countState` and (on the
 * block) `assessment`, never `state`: that key is reserved from the wire so
 * no internal state object can be mistaken for part of the contract.
 *
 *   OBSERVED  `count` is complete. Zero is reported only under COMPLETE
 *             coverage for the player over the whole fight.
 *   UNKNOWN   the count could not be established. `observedAtLeast` is the
 *             uses actually seen: a lower bound, never a count.
 */
export const ConsumableStatusSchema = z.discriminatedUnion("countState", [
  z
    .object({
      countState: z.literal("OBSERVED"),
      count: z.number().int().nonnegative(),
      uses: z.array(ConsumableUseSchema),
    })
    .strict(),
  z
    .object({
      countState: z.literal("UNKNOWN"),
      reasons: z.array(ConsumableUnknownReasonSchema).min(1),
      observedAtLeast: z.number().int().nonnegative(),
      uses: z.array(ConsumableUseSchema),
    })
    .strict(),
]);

/**
 * The consumable status every report carries (product intent "Always-Report
 * Consumables"). It is SPECIALIZATION-INDEPENDENT: produced by the shared
 * preparation producer from the observed fight, never from gameplay
 * evaluation, so it appears on every status, unsupported specializations
 * included.
 *
 * - A use is any use of the shared cooldown slot (owner decision): every
 *   spell on the health-potion cooldown is a health potion use, every spell on
 *   the combat-potion cooldown a combat potion use, and each use is named.
 * - Uses are observed Warcraft Logs facts (`WCL_OBSERVED_FACT`). Which spell is
 *   which consumable is runtime game data (`RUNTIME_GAME_DATA`), identified by
 *   revision and client build.
 * - There is no judgment here: no "should have used", no score.
 */
export const PreparationSchema = z.discriminatedUnion("assessment", [
  z
    .object({
      assessment: z.literal("ASSESSED"),
      category: z.literal("PREPARATION"),
      authority: z.literal("WCL_OBSERVED_FACT"),
      identityData: z
        .object({
          authority: z.literal("RUNTIME_GAME_DATA"),
          artifactRevision: z.string().min(1),
          clientDataWowVersion: z.string().min(1),
        })
        .strict()
        .nullable(),
      /** All three, always. A consumable is never omitted. */
      statuses: z
        .object({
          healthPotion: ConsumableStatusSchema,
          healthstone: ConsumableStatusSchema,
          combatPotion: ConsumableStatusSchema,
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

// ---------------------------------------------------------------------------
// The result
// ---------------------------------------------------------------------------

const commonFields = {
  schemaVersion: z.literal(PUBLIC_ANALYSIS_SCHEMA_VERSION),
  identity: IdentitySchema,
  specialization: SpecializationSchema,
  capability: CapabilitySchema,
  /** Which registered analyzer ran, or `null` when none did. */
  analyzerId: z.string().nullable(),
  /**
   * Consumable status (PREP-2). OPTIONAL IN THE SCHEMA ONLY, so adding it is
   * not a version change (the rule above). This build always emits it, on
   * every status.
   */
  preparation: PreparationSchema.optional(),
  // THERE IS DELIBERATELY NO `evidenceScope` HERE.
  //
  // Ingestion scope tells the application which evidence to RETRIEVE. It is not
  // a conclusion, not authority provenance, and not a measure of how much of the
  // fight was analyzed — the coverage block is the only thing that says that.
  // Publishing `PLAYER_CONTEXT` invites reading a retrieval setting as analysis
  // completeness, and it would pin schema v1 to an internal abstraction that
  // healer and support analyzers are expected to change.
  //
  // It stays where it belongs: on the analyzer's registration, consumed by the
  // application service. See `src/services/analyzer-registry.ts`.
};

/**
 * A completed analysis.
 *
 * The only variant carrying decisions, coverage or authority — which is what
 * makes the non-analyzed variants structurally impossible to mistake for a
 * clean result.
 */
export const AnalyzedResultSchema = z
  .object({
    ...commonFields,
    status: z.literal("ANALYZED"),
    authority: AuthoritySchema,
    decisions: z.array(DecisionSchema),
    exclusions: z.array(ExclusionSchema),
    coverage: CoverageSchema,
  })
  .strict();

/**
 * Builds one non-analyzed variant.
 *
 * These carry `detail` and NOTHING analysis-shaped. No `decisions: []`, no
 * `coverage` with zeroes, no `authority`. An empty decision list with a zero
 * denominator reads to a player as "no mistakes found", and the only reliable
 * defence is that the fields do not exist to be misread.
 *
 * `preparation` (in the common fields) is deliberately NOT gameplay-shaped and
 * is allowed here (PREP-2). It reports observed consumable use, not
 * evaluation: it makes no claim about rotation and has no zero-denominator
 * reading. Product intent requires it on every report, and it is what makes
 * an unsupported specialization's report useful rather than empty.
 */
function unanalyzedResult<T extends (typeof PUBLIC_ANALYSIS_STATUSES)[number]>(status: T) {
  return z
    .object({
      ...commonFields,
      status: z.literal(status),
      /** Author-written explanation of what was not done, and why. */
      detail: z.string().min(1),
    })
    .strict();
}

export const SpecNotSupportedResultSchema = unanalyzedResult("SPEC_NOT_SUPPORTED");
export const AuthorityNotAvailableResultSchema = unanalyzedResult("AUTHORITY_NOT_AVAILABLE");
export const ProfileNotResolvedResultSchema = unanalyzedResult("PROFILE_NOT_RESOLVED");
export const InsufficientEvidenceResultSchema = unanalyzedResult("INSUFFICIENT_EVIDENCE");

/**
 * The public analysis result.
 *
 * Discriminated on `status`, using the analysis-domain vocabulary unchanged.
 * These are ANALYSIS states — none of them is a transport error, and a future
 * MCP or HTTP failure must never be expressed as one of these.
 */
export const PublicAnalysisResultSchema = z.discriminatedUnion("status", [
  AnalyzedResultSchema,
  SpecNotSupportedResultSchema,
  AuthorityNotAvailableResultSchema,
  ProfileNotResolvedResultSchema,
  InsufficientEvidenceResultSchema,
]);

export type PublicAnalysisResult = z.infer<typeof PublicAnalysisResultSchema>;
export type PublicAnalyzedResult = z.infer<typeof AnalyzedResultSchema>;
export type PublicIdentity = z.infer<typeof IdentitySchema>;
export type PublicDecision = z.infer<typeof DecisionSchema>;
export type PublicExclusion = z.infer<typeof ExclusionSchema>;
export type PublicCoverage = z.infer<typeof CoverageSchema>;
export type PublicAuthority = z.infer<typeof AuthoritySchema>;
export type PublicEvidenceLocator = z.infer<typeof EvidenceLocatorSchema>;
