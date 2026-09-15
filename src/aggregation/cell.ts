/**
 * One player, one fight — the unit a raid night is assembled from.
 *
 * WHY A CELL EXISTS AT ALL
 *
 * A raid night is many single-fight analyses, and a single-fight analysis is
 * large: the production Assassination result is roughly 456 KB because it
 * publishes every decision and every excluded cast. A hundred of those held at
 * once is tens of megabytes for facts that collapse to a few dozen integers.
 *
 * So a cell is what SURVIVES projection. The heavy analysis object is read once,
 * reduced here, and released. Everything an aggregate can honestly say is
 * derivable from what is below; anything not below cannot be said at all.
 *
 * THE UNION IS THE SAFETY MECHANISM
 *
 * These four variants are not a convenience. They make contradictions
 * unrepresentable rather than merely discouraged:
 *
 *     an ABSENT player cannot carry decision counts — there is no field
 *     an unsupported spec cannot carry zero counts — there is no field
 *     an ingestion failure cannot carry UNKNOWN decisions — there is no field
 *     only an ANALYZED cell has counts, and it always has them
 *
 * The failure this prevents is specific and it is the one that matters: a player
 * who sat out a pull, or whose spec this build cannot analyze, appearing in a
 * summary with `match: 0, rejected: 0` — which reads as "did nothing right" and
 * is a claim nobody made.
 *
 * WHAT IS DELIBERATELY ABSENT FROM EVERY VARIANT
 *
 * No score, no grade, no rate, no percentage, no severity, no priority. Not by
 * convention — there is nowhere to put one. `match` is named `match` and not
 * `correctCount`, because MATCH means authority-compatible and nothing more.
 */

/**
 * One tallied key and how often it occurred.
 *
 * `key` is an opaque string by design. The aggregator must stay spec-neutral, so
 * it can count and group these without knowing that a Rogue token or a blocker
 * class is inside one. Composing the key is the projection's job.
 */
export interface CellTally {
  readonly key: string;
  readonly count: number;
}

/**
 * The integer facts an ANALYZED cell contributes.
 *
 * INTEGERS ONLY, AND THAT IS STRUCTURAL. There is no field here that could hold
 * a ratio, and a consumer wanting one would have to compute it from two numbers
 * — which is exactly the friction that keeps `match / eligibleDecisions` from
 * being printed as a percentage of correct play. It is not one: on the measured
 * production fight, eligible decisions were 7% of the player's observed casts.
 */
export interface CellCounts {
  readonly eligibleDecisions: number;
  /** Authority-compatible only. Never "correct", "optimal" or "successful". */
  readonly match: number;
  readonly rejected: number;
  /** A first-class result. Never a miss, never neutral, never scored. */
  readonly unknown: number;
  /** MATCH + REJECTED. */
  readonly resolvedComparisons: number;
  readonly exactEntryMatches: number;
  readonly tokenConvergedMatches: number;
  readonly excludedCastCount: number;
  readonly selectionPrecision: readonly CellTally[];
  readonly unknownBases: readonly CellTally[];
  readonly unknownBlockerClasses: readonly CellTally[];
  readonly exclusions: readonly CellTally[];
}

/**
 * Which analysis world produced this cell.
 *
 * CARRIED PER CELL, NEVER ONCE PER NIGHT. Two analyzed pulls may have run under
 * different authority artifacts — they certainly will once a second
 * specialization exists — so a single report-level authority sha would be a
 * claim the snapshot cannot support. Comparability across two points is decided
 * by comparing these, which is only possible if each point carries its own.
 *
 * Every field is read from something the analysis actually produced. Nothing is
 * defaulted, and `normalizationRevision` is supplied explicitly by the caller
 * that held the normalized fight, because `FightAnalysis` does not carry it.
 */
export interface CellAnalysisProvenance {
  readonly analyzerId: string;
  readonly specId: string;
  readonly normalizationRevision: string;
  readonly authorityId: string;
  readonly authorityArtifactRevision: string;
  readonly authorityCommitSha: string;
}

/**
 * The patterns this cell observed, already separated by what they mean.
 *
 * THREE COLLECTIONS, AND THEY MAY NEVER MERGE. Only `rejectedPatterns` carries
 * evidence about the PLAYER: the authority positively established the observed
 * action was not selectable. The other two are about the ANALYZER — one says it
 * could not prove a decision, the other says it never looked at a cast. Summing
 * them would turn the engine's own limits into someone's mistakes, which is the
 * single most dangerous thing an aggregate can do with this data.
 */
export interface CellRecurrence {
  /** From decisions whose outcome was REJECTED. Gameplay evidence. */
  readonly rejectedPatterns: readonly CellTally[];
  /** From decisions whose outcome was UNKNOWN. Analyzer limits, not player faults. */
  readonly evidenceLimitations: readonly CellTally[];
  /** From casts the analyzer excluded. Coverage limits, not player faults. */
  readonly exclusionPatterns: readonly CellTally[];
}

/**
 * Gameplay analysis statuses that are not ANALYZED.
 *
 * M6's vocabulary, unchanged and deliberately so. Each is a truthful
 * analysis-domain result: the service ran and the honest answer is that it could
 * not evaluate. None of them is a failure, and none is a judgement about play.
 */
export type NonAnalyzedStatus =
  "SPEC_NOT_SUPPORTED" | "AUTHORITY_NOT_AVAILABLE" | "PROFILE_NOT_RESOLVED" | "INSUFFICIENT_EVIDENCE";

export const NON_ANALYZED_STATUSES = [
  "SPEC_NOT_SUPPORTED",
  "AUTHORITY_NOT_AVAILABLE",
  "PROFILE_NOT_RESOLVED",
  "INSUFFICIENT_EVIDENCE",
] as const satisfies readonly NonAnalyzedStatus[];

/**
 * Why no gameplay analysis exists for a player who WAS in the fight.
 *
 * KEPT APART FROM `NonAnalyzedStatus` ON PURPOSE. Those four are gameplay-domain
 * answers — an analyzer was selected, it looked, and it truthfully concluded
 * nothing. These are the cases where NO ANALYZER EVER RAN, so there is no
 * gameplay judgement of any kind to report. Folding them together would let
 * "nothing was attempted" be read as a statement about a specialization, or about
 * a player.
 *
 * NOT AN INFRASTRUCTURE-ONLY CATEGORY. It was, when `FIGHT_INGESTION_FAILED` was
 * the only member, and describing it that way is now wrong:
 * `SPECIALIZATION_UNRESOLVED` is missing upstream IDENTITY data, not an outage.
 * What the two share is narrower and is the actual definition —
 *
 *     participation is known, and analysis could not be performed anyway,
 *     because a precondition for selecting an analyzer was never met.
 *
 * Whatever the reason, the guarantees are identical and structural: no gameplay
 * counts, no fabricated UNKNOWN decisions, and never a statement about how the
 * player performed.
 */
export type AnalysisUnavailableReason =
  /**
   * The required fight evidence could not be obtained.
   *
   * A retrieval failure, and the only member of this union that is one.
   */
  | "FIGHT_INGESTION_FAILED"
  /**
   * Warcraft Logs supplied no usable specialization for this participant.
   *
   * ADDED IN M7-F. NOT A GAMEPLAY STATUS, AND NOT AN OUTAGE EITHER. M7-C
   * preserves an unusable `friendlySpecs` entry as `specName: null` rather than
   * guessing, and a raid night must produce a cell for that player anyway.
   * Participation is known; what is missing is a usable specialization identity,
   * so no analyzer could truthfully be selected.
   *
   * `SPEC_NOT_SUPPORTED` would be the lie to avoid: it asserts we identified a
   * specialization and have no analyzer for it. Here we never identified one, so
   * whether an analyzer exists is a question that was never reached. This states
   * the actual fact — the specialization could not be resolved — and leaves
   * coverage to say so.
   */
  | "SPECIALIZATION_UNRESOLVED";

/**
 * The canonical list.
 *
 * Exists so a public contract can assert parity against THIS array rather than
 * maintaining a second copy of the vocabulary that could silently drift.
 */
export const ANALYSIS_UNAVAILABLE_REASONS = [
  "FIGHT_INGESTION_FAILED",
  "SPECIALIZATION_UNRESOLVED",
] as const satisfies readonly AnalysisUnavailableReason[];

/**
 * One (fight, player) cell.
 *
 * `playerKey` is M7-C's within-report key. `sourceId` is carried alongside it
 * because ordering is numeric and parsing it back out of a string would be a
 * second definition of identity.
 */
interface CellIdentity {
  readonly fightId: number;
  readonly playerKey: string;
  readonly sourceId: number;
}

export type PlayerFightResult =
  /**
   * On the night's roster, not in this pull.
   *
   * A FACT. It has no counts because there is no analysis object — not because
   * the analysis found nothing. It also has no specialization: a player who was
   * not there played nothing, and recording a spec would invent participation.
   */
  | ({ readonly kind: "ABSENT" } & CellIdentity)
  /** Present, analyzed, with real counts and the provenance that produced them. */
  | ({
      readonly kind: "ANALYZED";
      /**
       * The specialization Warcraft Logs reported for this fight.
       *
       * `null` when it supplied none — the documented case for an unresolved
       * spec. It mirrors M7-C's per-fight fact exactly and is never invented; a
       * cell that guessed a specialization here would be attributing play to a
       * build nobody observed.
       */
      readonly specName: string | null;
      readonly provenance: CellAnalysisProvenance;
      readonly counts: CellCounts;
      readonly recurrence: CellRecurrence;
    } & CellIdentity)
  /** Present; the analyzer ran or was selected, and truthfully concluded nothing. */
  | ({
      readonly kind: "NOT_ANALYZED";
      /** M7-C's per-fight fact. `null` when Warcraft Logs supplied none. */
      readonly specName: string | null;
      readonly status: NonAnalyzedStatus;
      /** The author-written explanation the analysis produced. */
      readonly detail: string;
    } & CellIdentity)
  /**
   * Present, participation known, and no analyzer ran — see
   * `AnalysisUnavailableReason` for the two ways that happens. Carries no counts
   * and no decisions, because none were ever produced.
   */
  | ({
      readonly kind: "ANALYSIS_UNAVAILABLE";
      /** M7-C's per-fight fact. `null` when Warcraft Logs supplied none. */
      readonly specName: string | null;
      readonly reason: AnalysisUnavailableReason;
    } & CellIdentity);

/** The discriminants of `PlayerFightResult`. Canonical, for parity assertions. */
export type PlayerFightResultKind = PlayerFightResult["kind"];

export const PLAYER_FIGHT_RESULT_KINDS = [
  "ABSENT",
  "ANALYZED",
  "NOT_ANALYZED",
  "ANALYSIS_UNAVAILABLE",
] as const satisfies readonly PlayerFightResultKind[];
