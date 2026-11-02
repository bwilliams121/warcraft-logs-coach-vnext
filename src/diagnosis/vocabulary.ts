/**
 * The diagnosis projection's vocabularies as runtime lists (M14-F).
 *
 * The post-hoc domain states these as type unions only. The public contract
 * declares its own lists independently and `tests/contracts/
 * m14f-diagnosis-contract.test.ts` pins each equal to the list here; the
 * guards below pin each list here to its union in both directions. A member
 * added to an internal union therefore fails the compile here, then the
 * contract test, and reaches the wire only by a reviewed edit.
 */

import type { LinkLimit, ObservationOnlyCause } from "../comparison-facts/causal-linkage.js";
import type {
  DeltaDimension,
  DeltaDirection,
  DeltaMeasure,
  DeltaUnknownReason,
  DeltaValue,
  TargetClass,
} from "../comparison-facts/damage-delta.js";
import type { EnvironmentalReason } from "../comparison-facts/strategy-context.js";

type Exhaustive<Union, List extends readonly unknown[]> = [Exclude<Union, List[number]>] extends [never]
  ? true
  : never;

export const DIAGNOSIS_DELTA_MEASURES = [
  "DAMAGE_EVENT_COUNT",
  "RAW_AMOUNT_FIELD_SUM",
  "WCL_TABLE_AMOUNT",
] as const satisfies readonly DeltaMeasure[];
const _measures: Exhaustive<DeltaMeasure, typeof DIAGNOSIS_DELTA_MEASURES> = true;

export const DIAGNOSIS_DELTA_DIMENSIONS = [
  "TOTAL",
  "BY_SOURCE",
  "BY_ABILITY",
  "BY_TARGET_CLASS",
  "BY_WCL_TARGET_TYPE",
] as const satisfies readonly DeltaDimension[];
const _dimensions: Exhaustive<DeltaDimension, typeof DIAGNOSIS_DELTA_DIMENSIONS> = true;

export const DIAGNOSIS_TARGET_CLASSES = [
  "BOSS_SUBTYPE",
  "NON_BOSS_NPC",
  "PLAYER_TARGET",
  "OTHER_TARGET",
] as const satisfies readonly TargetClass[];
const _targetClasses: Exhaustive<TargetClass, typeof DIAGNOSIS_TARGET_CLASSES> = true;

export const DIAGNOSIS_DELTA_BOUND_KINDS = [
  "EXACT",
  "NO_MORE_THAN",
  "NO_LESS_THAN",
] as const satisfies readonly Exclude<DeltaValue, { kind: "UNKNOWN" }>["kind"][];
const _boundKinds: Exhaustive<
  Exclude<DeltaValue, { kind: "UNKNOWN" }>["kind"],
  typeof DIAGNOSIS_DELTA_BOUND_KINDS
> = true;

export const DIAGNOSIS_DELTA_UNKNOWN_REASONS = [
  "SUBJECT_FIGURE_UNKNOWN",
  "COMPARISON_FIGURE_UNKNOWN",
  "BOTH_FIGURES_LOWER_BOUNDS",
  "RAW_AMOUNT_MEANING_NOT_PROVEN",
  "LOG_VERSION_DIFFERS",
] as const satisfies readonly DeltaUnknownReason[];
const _unknownReasons: Exhaustive<DeltaUnknownReason, typeof DIAGNOSIS_DELTA_UNKNOWN_REASONS> = true;

export const DIAGNOSIS_DIRECTIONS = [
  "SUBJECT_LOWER",
  "SUBJECT_HIGHER",
  "EQUAL",
  "UNDECIDED",
] as const satisfies readonly DeltaDirection[];
const _directions: Exhaustive<DeltaDirection, typeof DIAGNOSIS_DIRECTIONS> = true;

export const DIAGNOSIS_LINK_LIMITS = [
  "COMPARISON_COVERAGE_UNCERTIFIED",
  "COMPARISON_DECISIONS_NOT_EVALUATED",
  "DELTA_IS_A_BOUND",
  "EVENT_COUNT_NOT_DAMAGE_AMOUNT",
  "SUBJECT_COMPONENTS_OBSERVED_ONLY",
  "UNRESOLVED_EVIDENCE_IN_SCOPE",
  "NO_AUTHORITY_BACKED_EVIDENCE",
] as const satisfies readonly LinkLimit[];
const _limits: Exhaustive<LinkLimit, typeof DIAGNOSIS_LINK_LIMITS> = true;

export const DIAGNOSIS_ENVIRONMENTAL_REASONS = [
  "INTERMISSION",
  "TARGET_UNAVAILABLE",
  "FORCED_DOWNTIME",
  "PHASE_TRANSITION",
] as const satisfies readonly EnvironmentalReason[];
const _reasons: Exhaustive<EnvironmentalReason, typeof DIAGNOSIS_ENVIRONMENTAL_REASONS> = true;

/**
 * Why a (row, comparison) pair is an observation and not a coaching
 * statement. The first five are M14-E's linkage causes, unchanged; the last
 * two are this projection's own:
 *
 *   NO_AUTHORITY_FINDING_IN_LINK     the link rests only on authority-compatible
 *                                    (MATCH) decisions: evidence exists, but no
 *                                    authority finding does. A link is not a fault.
 *   FINDINGS_DO_NOT_MATCH_DIRECTION  rejected observed casts of an ability can
 *                                    bear only on that ability occurring MORE
 *                                    often than the authority would select; they
 *                                    never explain the subject's figure being lower.
 */
export const DIAGNOSIS_OBSERVATION_CAUSES = [
  "DIRECTION_UNDECIDED",
  "DIRECTION_EQUAL",
  "SUBJECT_WINDOW_UNKNOWN",
  "NO_DECISION_EVIDENCE_IN_SCOPE",
  "DECISION_EVIDENCE_UNRESOLVED",
  "NO_AUTHORITY_FINDING_IN_LINK",
  "FINDINGS_DO_NOT_MATCH_DIRECTION",
] as const;
const _causes: Exhaustive<ObservationOnlyCause, typeof DIAGNOSIS_OBSERVATION_CAUSES> = true;
export type DiagnosisObservationCause = (typeof DIAGNOSIS_OBSERVATION_CAUSES)[number];

/**
 * Why diagnosis was not assessed. Nothing is claimed about the fight's damage
 * or its causes; each is a disclosed gap.
 *
 *   COMPARISON_EVIDENCE_NOT_RETRIEVED       no comparison evidence was supplied
 *                                           for this fight (the deployed service
 *                                           retrieves none)
 *   COMPARISON_RETRIEVAL_FAILED             the comparison evidence source failed
 *   COMPARISON_EVIDENCE_NOT_FOR_THIS_FIGHT  the supplied subject is not the
 *                                           analyzed report revision, fight,
 *                                           player and specialization
 *   COMPARISON_NOT_COMPARABLE               the comparison fights do not align
 *                                           with the subject (encounter,
 *                                           difficulty, duplicate refs)
 *   DECISION_EVIDENCE_NOT_USABLE            the analyzed decisions could not be
 *                                           restated as decision evidence
 */
export const DIAGNOSIS_NOT_ASSESSED_REASONS = [
  "COMPARISON_EVIDENCE_NOT_RETRIEVED",
  "COMPARISON_RETRIEVAL_FAILED",
  "COMPARISON_EVIDENCE_NOT_FOR_THIS_FIGHT",
  "COMPARISON_NOT_COMPARABLE",
  "DECISION_EVIDENCE_NOT_USABLE",
] as const;
export type DiagnosisNotAssessedReason = (typeof DIAGNOSIS_NOT_ASSESSED_REASONS)[number];

void [
  _measures,
  _dimensions,
  _targetClasses,
  _boundKinds,
  _unknownReasons,
  _directions,
  _limits,
  _reasons,
  _causes,
];
