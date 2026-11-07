/**
 * THE REPORTABLE FINDING RECORD (M15-A): what finding aggregation and
 * prioritization is allowed to read.
 *
 * WHY A RESTATED RECORD, AND NOT THE PRODUCERS' OWN TYPES
 *
 * Findings come from several producers that answer different questions: a
 * specialization's observed-decision view, the preparation consumable status,
 * later the healer and support evaluators. Their vocabularies are owned by
 * the producer and differ on purpose. Ranking must not branch on any of them,
 * or it becomes a universal evaluator rebuilt one report at a time. So each
 * producer's output is RESTATED, by a reviewed adapter (`restatement.ts`),
 * into this one record, and ranking reads nothing else. The record states
 * what the producer already concluded; nothing here re-evaluates a finding.
 *
 * WHAT A RECORD SAYS
 *
 *   disposition   what kind of conclusion the producer reached (below)
 *   authority     the explicit authority it rests on; NO_AUTHORITY_AVAILABLE
 *                 exactly when the disposition says so
 *   stateEvidence whether the state the conclusion rests on was PROVEN, or read
 *                 under the pinned SimC profile (SIMC_PROFILE_RELATIVE)
 *   actionability what evidence there is that the decision was possible
 *   evidence      locators, references only, never copied events
 *   aggregationKey the producer's own statement of which findings are "the
 *                 same pattern"; null means never aggregate. Shared code
 *                 compares the key for equality and never parses it.
 *
 * THE DISPOSITIONS
 *
 *   AUTHORITY_DIVERGENCE    the authority cannot select what the player did
 *                           (an APL REJECTED). The ONLY disposition that can
 *                           rank as a coaching candidate, and only with
 *                           PROVEN or SIMC_PROFILE_RELATIVE state and at least
 *                           one evidence locator.
 *   AUTHORITY_CONSISTENT    authority-compatible (MATCH, ASSIGNMENT_MET).
 *                           Never a failure, never an endorsement.
 *   OBSERVED_FACT           an observed fact with no verdict (consumable use
 *                           counts). Informational.
 *   SUPPRESSED              structurally kept, with a named environmental
 *                           reason (the evidence proved the decision was not
 *                           possible). Never a failure.
 *   UNKNOWN                 an authority exists, the evidence was insufficient.
 *   NO_AUTHORITY_AVAILABLE  no trustworthy standard for the question.
 *   UNSUPPORTED             the analyzer does not support the decision.
 *
 * There is deliberately no separate negative-actionability disposition: the
 * project admits no negative actionability vocabulary in `src/` beyond one
 * assignment outcome (`tests/contracts/m5c1-gcd-semantics.test.ts`). A proven
 * restriction is carried as SUPPRESSED with its named reason. How the M12-D
 * assignment outcome restates is left to its own reviewed adapter.
 *
 * There is NO confidence field, no severity, no score and no impact. Those
 * are not established by any producer (M15-C and M15-E are owner decisions),
 * and a ranking that invented one would be the "lowering confidence is
 * suppression" failure in reverse.
 */

import type { EvidenceLocator } from "../engine/evidence/locator.js";

/** The decision categories of CLAUDE.md "Decision Categories", plus PREPARATION. */
export const REPORTING_CATEGORIES = [
  "ROTATION",
  "RESOURCE",
  "COOLDOWN",
  "DEFENSIVE",
  "ASSIGNMENT",
  "HEALING_DECISION",
  "SUPPORT_TARGETING",
  "SUPPORT_TIMING",
  "PREPARATION",
] as const;
export type ReportingCategory = (typeof REPORTING_CATEGORIES)[number];

export const FINDING_DISPOSITIONS = [
  "AUTHORITY_DIVERGENCE",
  "AUTHORITY_CONSISTENT",
  "OBSERVED_FACT",
  "SUPPRESSED",
  "UNKNOWN",
  "NO_AUTHORITY_AVAILABLE",
  "UNSUPPORTED",
] as const;
export type FindingDisposition = (typeof FINDING_DISPOSITIONS)[number];

/** The dispositions that are not an assessment of play. Each needs a reason code. */
export const NON_ASSESSMENT_DISPOSITIONS = [
  "SUPPRESSED",
  "UNKNOWN",
  "NO_AUTHORITY_AVAILABLE",
  "UNSUPPORTED",
] as const satisfies readonly FindingDisposition[];

/**
 * Whether the state a conclusion rests on was proven. INCOMPLETE is never
 * ranked as a divergence: a producer that diverged on unproven state is
 * refused, not trusted.
 *
 * SIMC_PROFILE_RELATIVE (SIMC-FB-B): the conclusion is fully resolved, and part
 * of the encounter state it read came from the pinned SimC profile, not from
 * the fight. Weaker evidence than PROVEN and listed after it, so it ranks after
 * every PROVEN item; it remains authority-backed, and it is never stated as
 * observed.
 */
export const STATE_EVIDENCE_STATES = ["PROVEN", "SIMC_PROFILE_RELATIVE", "INCOMPLETE"] as const;
export type StateEvidenceState = (typeof STATE_EVIDENCE_STATES)[number];

/**
 * What evidence there is that the decision was possible, strongest first.
 *
 *   DECISION_PROVEN_ACTIONABLE  positive evidence the authority's decision
 *                               itself was possible at that moment
 *   OBSERVED_EXECUTION_ONLY     the player's OBSERVED action executed, which
 *                               proves that one ability usable and nothing
 *                               about the authority's alternative
 *   NOT_EVALUATED               no actionability evidence was gathered
 *   UNKNOWN                     evaluated, and could not be established
 *
 * There is no ACTIONABLE default: absence of a restriction is not evidence.
 * A proven restriction is the SUPPRESSED disposition, not a level here.
 */
export const ACTIONABILITY_LEVELS = [
  "DECISION_PROVEN_ACTIONABLE",
  "OBSERVED_EXECUTION_ONLY",
  "NOT_EVALUATED",
  "UNKNOWN",
] as const;
export type ActionabilityLevel = (typeof ACTIONABILITY_LEVELS)[number];

/**
 * CLAUDE.md's named environmental reasons, the only permitted suppression
 * reasons. Declared here rather than imported, so the post-hoc
 * comparison-facts domain keeps its single outside reader (M14-F);
 * `tests/unit/m15a-finding-prioritization.test.ts` pins this list equal to
 * M14-C's `EnvironmentalReason`.
 */
export const SUPPRESSION_REASONS = [
  "INTERMISSION",
  "TARGET_UNAVAILABLE",
  "FORCED_DOWNTIME",
  "PHASE_TRANSITION",
] as const;
export type SuppressionReason = (typeof SUPPRESSION_REASONS)[number];

/** Authority strings with a fixed meaning. Any other non-empty string names an authority. */
export const NO_AUTHORITY = "NO_AUTHORITY_AVAILABLE" as const;

export interface ReportableFinding {
  /** Unique within one prioritization call. */
  readonly findingId: string;
  /** Which producer restated it (`OBSERVED_DECISION_VIEW`, `PREPARATION_CONSUMABLE_STATUS`, ...). */
  readonly producer: string;
  readonly category: ReportingCategory;
  /** The specialization the producer was about, or null for a specialization-independent producer. */
  readonly specId: string | null;
  readonly disposition: FindingDisposition;
  /** Explicit, never empty. `NO_AUTHORITY_AVAILABLE` exactly when the disposition is. */
  readonly authority: string;
  /**
   * The producer's own status word, verbatim (REJECTED, MATCH, OBSERVED...).
   * Carried for traceability; ranking never reads it.
   */
  readonly producerStatus: string;
  /**
   * Required for every non-assessment disposition: the producer's reason
   * code (a blocker, a not-actionable reason, an unknown code). Carried,
   * compared for aggregation, never interpreted.
   */
  readonly reasonCode: string | null;
  /** Required exactly when the disposition is SUPPRESSED. */
  readonly suppressionReason: SuppressionReason | null;
  readonly stateEvidence: StateEvidenceState;
  readonly actionability: ActionabilityLevel;
  /** Fight-relative instant of the decision, or null for a whole-fight fact. */
  readonly fightTimeMs: number | null;
  readonly evidence: readonly EvidenceLocator[];
  /** Null: never aggregated. Otherwise equal keys (with equal standing) may form a pattern. */
  readonly aggregationKey: string | null;
  /**
   * What the finding is about, as the producer named it (the observed action
   * token for a decision), or null. Carried verbatim for display (M15-B) and
   * compared for aggregation, so a pattern has one subject. Never ranked on,
   * never parsed.
   */
  readonly subjectToken: string | null;
  /**
   * SIMC_PROFILE_RELATIVE state only: the token the authority selected under the
   * profile, or null when it established only that the observed action could not
   * be selected. Carried for display and compared for aggregation, never ranked.
   */
  readonly profileSelectedToken?: string | null;
}
