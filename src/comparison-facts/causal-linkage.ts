/**
 * CAUSAL EVIDENCE LINKAGE (M14-E): which decision-level evidence about the
 * SUBJECT's own play touches each M14-D damage-delta component. Post-hoc, like
 * the decomposition it reads.
 *
 * It answers "for this observed difference, what decision-level evidence
 * exists in the same component and window, and what limits it?" and never
 * "did this decision cause that difference". A link is a join, not a cause:
 * it states which records exist, never how much of a delta they account for
 * and never that a decision was a mistake. Turning a link into a coaching
 * statement is the reviewed projection's job (M14-F), and only where an
 * authority-backed finding and its link both exist.
 *
 * TWO MODULES, NEVER FEEDING EACH OTHER
 *
 *   The authority verifier (specialization evaluators, SimulationCraft)
 *   produces decision-level results. This module never imports it: the caller
 *   restates each result as a `DecisionEvidenceRecord`, plain data, in the
 *   same way `attachStrategyContext` takes only a finding id and a time. The
 *   record's own status is carried verbatim and never read; the linkage reads
 *   only its resolution, its scope and its interval. Nothing here is
 *   returned to the authority branch (tests/contracts/
 *   m11g2-comparison-facts-layering.test.ts), and nothing here re-evaluates a
 *   decision.
 *
 * WHAT A LINK NEEDS, per (delta row, comparison pair)
 *
 *   1. a PROVEN direction for the pair (SUBJECT_LOWER / SUBJECT_HIGHER):
 *      an UNDECIDED or EQUAL delta has nothing to link to
 *   2. the subject's own window placed (an UNKNOWN slice links nothing)
 *   3. at least one RESOLVED record whose scope covers the component and
 *      whose interval meets the subject window
 *
 *   Otherwise the pair stays OBSERVATION_ONLY with a named cause. UNKNOWN and
 *   NO_AUTHORITY_AVAILABLE records in scope are carried, kept distinct, and
 *   never count toward a link: an unresolved decision cannot support a cause.
 *
 * SCOPE, by component dimension
 *
 *   TOTAL, BY_WCL_TARGET_TYPE   only WHOLE_OUTPUT records: one ability's
 *                               decision never explains a total (no residual
 *                               is computed, M14-D)
 *   BY_SOURCE <kind>            SOURCE <kind>, WHOLE_OUTPUT
 *   BY_ABILITY <kind, id>       ABILITY <kind> naming that id, SOURCE <kind>,
 *                               WHOLE_OUTPUT
 *   BY_TARGET_CLASS <class>     TARGET_CLASS <class>, WHOLE_OUTPUT
 *
 *   Ability identity is the exact game id the record names. Which ids a
 *   decision concerns (a cast id and its damage ids) is the producer's
 *   meaning, stated in the record, never guessed here.
 *
 * SUBJECT ONLY. Decision evidence comes from the subject fight alone: no
 * comparison player's decisions are evaluated, and a record naming another
 * fight is REFUSED. Comparison behavior is never decision evidence.
 *
 * WHAT IT NEVER DOES
 *
 *   No causal claim, no magnitude attribution, no confidence field, no
 *   suppression, no verdict. Comparison figures decide only whether a
 *   direction is proven; they never move a record's resolution.
 */

import type { EvidenceLocator } from "../engine/evidence/locator.js";
import {
  decomposeDamageDeltas,
  type AlignedWindowRequest,
  type DecompositionRefusal,
  type DeltaComponent,
  type DeltaDirection,
  type DeltaMeasure,
  type DeltaRow,
  type DeltaValue,
  type SourceKind,
  type TargetClass,
} from "./damage-delta.js";
import type { PostHocDefinition } from "./fight-facts.js";
import type { AlignmentInput } from "./timing-alignment.js";

// ---------------------------------------------------------------------------
// Decision evidence, as the caller restates it
// ---------------------------------------------------------------------------

/** The decision-level evidence families of the M14-E scope. */
export type DecisionEvidenceKind =
  | "APL_DECISION_OUTCOME"
  | "CAST_OPPORTUNITY"
  | "UPTIME"
  | "RESOURCE_STATE"
  | "BUFF_WINDOW"
  | "TARGET_CHOICE"
  | "COOLDOWN_ALIGNMENT"
  | "ENCOUNTER_ACTIONABILITY";

export const DECISION_EVIDENCE_KINDS: readonly DecisionEvidenceKind[] = [
  "APL_DECISION_OUTCOME",
  "CAST_OPPORTUNITY",
  "UPTIME",
  "RESOURCE_STATE",
  "BUFF_WINDOW",
  "TARGET_CHOICE",
  "COOLDOWN_ALIGNMENT",
  "ENCOUNTER_ACTIONABILITY",
];

/** An authority's decision result, or an observed fact with no verdict. */
export type DecisionEvidenceBasis = "AUTHORITY_BACKED" | "OBSERVED_FACT";

/**
 * Whether the producer reached a result. UNKNOWN (a standard, too little
 * evidence) and NO_AUTHORITY_AVAILABLE (no standard) are never merged, and
 * only an AUTHORITY_BACKED record can lack an authority.
 */
export type DecisionEvidenceResolution = "RESOLVED" | "UNKNOWN" | "NO_AUTHORITY_AVAILABLE";

export type DecisionEvidenceScope =
  | { readonly kind: "ABILITY"; readonly sourceKind: SourceKind; readonly abilityGameIds: readonly number[] }
  | { readonly kind: "SOURCE"; readonly sourceKind: SourceKind }
  | { readonly kind: "TARGET_CLASS"; readonly targetClass: TargetClass }
  | { readonly kind: "WHOLE_OUTPUT" };

export interface DecisionEvidenceRecord {
  /** Unique within one call. */
  readonly evidenceId: string;
  /** Must be the subject's fight ref. */
  readonly fightRef: string;
  readonly kind: DecisionEvidenceKind;
  readonly basis: DecisionEvidenceBasis;
  /** The producer's recorded authority, verbatim. */
  readonly authority: string;
  /** Who produced it, e.g. a specialization evaluator id. */
  readonly producer: string;
  /** The producer's own status word, carried verbatim and never read here. */
  readonly producerStatus: string;
  readonly resolution: DecisionEvidenceResolution;
  /** Report time, half-open `[startMs, endMs)`; an instant has `endMs === startMs`. */
  readonly interval: { readonly startMs: number; readonly endMs: number };
  readonly scope: DecisionEvidenceScope;
  /** References to the producer's evidence; carried, never resolved here. */
  readonly locators: readonly EvidenceLocator[];
}

// ---------------------------------------------------------------------------
// The linkage
// ---------------------------------------------------------------------------

export type LinkStatus = "LINKED" | "OBSERVATION_ONLY";

export type ObservationOnlyCause =
  | "DIRECTION_UNDECIDED"
  | "DIRECTION_EQUAL"
  | "SUBJECT_WINDOW_UNKNOWN"
  | "NO_DECISION_EVIDENCE_IN_SCOPE"
  | "DECISION_EVIDENCE_UNRESOLVED";

/** What a link does not establish, machine-readable. */
export type LinkLimit =
  /** Comparison captures are uncertified (M11-G2): their figures are bounds at best. */
  | "COMPARISON_COVERAGE_UNCERTIFIED"
  /** Decision evidence is the subject's alone; no comparison decision was evaluated. */
  | "COMPARISON_DECISIONS_NOT_EVALUATED"
  /** The pair's delta is NO_MORE_THAN / NO_LESS_THAN, not EXACT. */
  | "DELTA_IS_A_BOUND"
  /** A count of damage events, not an amount of damage (After M14-D). */
  | "EVENT_COUNT_NOT_DAMAGE_AMOUNT"
  /** The subject's component list in this window is OBSERVED_ONLY. */
  | "SUBJECT_COMPONENTS_OBSERVED_ONLY"
  /** Unresolved records share the scope with the resolved ones. */
  | "UNRESOLVED_EVIDENCE_IN_SCOPE"
  /** Every resolved record is an observed fact; none is authority-backed. */
  | "NO_AUTHORITY_BACKED_EVIDENCE";

export interface PairLink {
  readonly comparisonFightRef: string;
  readonly perMinuteDirection: DeltaDirection;
  readonly perMinuteDelta: DeltaValue;
  readonly status: LinkStatus;
  /** Set only for OBSERVATION_ONLY. */
  readonly cause: ObservationOnlyCause | null;
  readonly limits: readonly LinkLimit[];
}

export interface UnresolvedInScope {
  readonly evidenceId: string;
  readonly resolution: Exclude<DecisionEvidenceResolution, "RESOLVED">;
}

export interface ComponentLinkage {
  readonly rowId: string;
  readonly windowId: string;
  readonly measure: DeltaMeasure;
  readonly componentKey: string;
  readonly component: DeltaComponent;
  /** The subject's own slice for this window, or why it is not placed. */
  readonly subjectWindow:
    | { readonly kind: "PLACED"; readonly startMs: number; readonly endMs: number }
    | { readonly kind: "UNKNOWN"; readonly reason: string };
  /** RESOLVED records in scope, in record order. */
  readonly resolvedEvidenceIds: readonly string[];
  /** Of those, the AUTHORITY_BACKED ones. */
  readonly authorityBackedEvidenceIds: readonly string[];
  /** UNKNOWN and NO_AUTHORITY_AVAILABLE records in scope, kept distinct. */
  readonly unresolved: readonly UnresolvedInScope[];
  /** One per comparison fight, in the decomposition's order. */
  readonly pairs: readonly PairLink[];
}

export type LinkageRefusal =
  | { readonly reason: "DECOMPOSITION_REFUSED"; readonly decomposition: DecompositionRefusal }
  | { readonly reason: "DUPLICATE_EVIDENCE_ID"; readonly evidenceId: string }
  | { readonly reason: "EVIDENCE_NOT_FROM_SUBJECT_FIGHT"; readonly evidenceId: string }
  | { readonly reason: "UNKNOWN_EVIDENCE_KIND"; readonly evidenceId: string }
  | { readonly reason: "INVALID_EVIDENCE_INTERVAL"; readonly evidenceId: string }
  | { readonly reason: "EVIDENCE_OUTSIDE_SUBJECT_FIGHT"; readonly evidenceId: string }
  | { readonly reason: "EMPTY_ABILITY_SCOPE"; readonly evidenceId: string }
  | { readonly reason: "OBSERVED_FACT_CANNOT_LACK_AUTHORITY"; readonly evidenceId: string };

export type CausalEvidenceLinkage =
  | {
      readonly kind: "LINKED_EVIDENCE";
      readonly encounterId: number;
      readonly difficulty: number;
      readonly subjectFightRef: string;
      readonly comparisonFightRefs: readonly string[];
      /** The records, sorted by interval start then id. */
      readonly evidence: readonly DecisionEvidenceRecord[];
      readonly components: readonly ComponentLinkage[];
      /** Records that fall in no row's scope and window. */
      readonly evidenceInNoComponent: readonly string[];
      readonly decisionEvidenceSide: "SUBJECT_ONLY";
      readonly comparisonCoverage: "AT_LEAST_UNCERTIFIED";
      readonly use: "LINKAGE_ONLY";
      readonly causalClaim: "NONE";
      readonly magnitudeAttribution: "NONE";
      /** Nothing here flows into an authority verdict, nor out of one into a delta. */
      readonly verdictFlow: "NONE";
      readonly findingEffect: { readonly suppression: "NONE"; readonly confidence: "NONE" };
    }
  | ({ readonly kind: "REFUSED" } & LinkageRefusal);

// ---------------------------------------------------------------------------

function covers(scope: DecisionEvidenceScope, component: DeltaComponent): boolean {
  if (scope.kind === "WHOLE_OUTPUT") return true;
  switch (component.dimension) {
    case "TOTAL":
    case "BY_WCL_TARGET_TYPE":
      return false;
    case "BY_SOURCE":
      return scope.kind === "SOURCE" && scope.sourceKind === component.sourceKind;
    case "BY_ABILITY":
      if (scope.kind === "SOURCE") return scope.sourceKind === component.sourceKind;
      return (
        scope.kind === "ABILITY" &&
        scope.sourceKind === component.sourceKind &&
        component.abilityGameId !== null &&
        scope.abilityGameIds.includes(component.abilityGameId)
      );
    case "BY_TARGET_CLASS":
      return scope.kind === "TARGET_CLASS" && scope.targetClass === component.targetClass;
  }
}

/** An instant meets `[start, end)` when inside it; an interval when they overlap. */
function meets(
  interval: DecisionEvidenceRecord["interval"],
  window: { startMs: number; endMs: number },
): boolean {
  if (interval.endMs === interval.startMs)
    return interval.startMs >= window.startMs && interval.startMs < window.endMs;
  return interval.startMs < window.endMs && interval.endMs > window.startMs;
}

function validate(
  records: readonly DecisionEvidenceRecord[],
  subjectFightRef: string,
  fight: { readonly startMs: number; readonly endMs: number },
): LinkageRefusal | null {
  const ids = new Set<string>();
  for (const record of records) {
    const evidenceId = record.evidenceId;
    if (ids.has(evidenceId)) return { reason: "DUPLICATE_EVIDENCE_ID", evidenceId };
    ids.add(evidenceId);
    if (record.fightRef !== subjectFightRef) return { reason: "EVIDENCE_NOT_FROM_SUBJECT_FIGHT", evidenceId };
    if (!DECISION_EVIDENCE_KINDS.includes(record.kind))
      return { reason: "UNKNOWN_EVIDENCE_KIND", evidenceId };
    const { startMs, endMs } = record.interval;
    if (!Number.isSafeInteger(startMs) || !Number.isSafeInteger(endMs) || endMs < startMs)
      return { reason: "INVALID_EVIDENCE_INTERVAL", evidenceId };
    if (startMs < fight.startMs || endMs > fight.endMs)
      return { reason: "EVIDENCE_OUTSIDE_SUBJECT_FIGHT", evidenceId };
    if (record.scope.kind === "ABILITY" && record.scope.abilityGameIds.length === 0)
      return { reason: "EMPTY_ABILITY_SCOPE", evidenceId };
    if (record.basis === "OBSERVED_FACT" && record.resolution === "NO_AUTHORITY_AVAILABLE")
      return { reason: "OBSERVED_FACT_CANNOT_LACK_AUTHORITY", evidenceId };
  }
  return null;
}

/**
 * Link each M14-D delta component to the subject's decision-level evidence.
 *
 * Like `decomposeDamageDeltas`, the decomposition is recomputed from these
 * inputs and never accepted from the caller.
 */
export function linkCausalEvidence(
  input: AlignmentInput,
  definition: PostHocDefinition,
  alignedWindows: readonly AlignedWindowRequest[],
  records: readonly DecisionEvidenceRecord[],
): CausalEvidenceLinkage {
  const decomposition = decomposeDamageDeltas(input, definition, alignedWindows);
  if (decomposition.kind === "REFUSED")
    return { kind: "REFUSED", reason: "DECOMPOSITION_REFUSED", decomposition: decomposition.reason };
  const subjectFight = input.subject.fight.fight;
  const refusal = validate(records, decomposition.subjectFightRef, {
    startMs: subjectFight.startTimeMs,
    endMs: subjectFight.endTimeMs,
  });
  if (refusal !== null) return { kind: "REFUSED", ...refusal };

  const evidence = [...records].sort(
    (left, right) =>
      left.interval.startMs - right.interval.startMs ||
      (left.evidenceId < right.evidenceId ? -1 : left.evidenceId > right.evidenceId ? 1 : 0),
  );
  const windows = new Map(decomposition.windows.map((window) => [window.windowId, window]));
  const touched = new Set<string>();

  const components = decomposition.rows.map((row: DeltaRow): ComponentLinkage => {
    const window = windows.get(row.windowId);
    const slice = window?.slices[0];
    const claim = window?.componentLists[0]?.claim ?? null;
    const subjectWindow: ComponentLinkage["subjectWindow"] =
      slice === undefined
        ? { kind: "UNKNOWN", reason: "WINDOW_NOT_DECOMPOSED" }
        : slice.kind === "SLICED"
          ? { kind: "PLACED", startMs: slice.startMs, endMs: slice.endMs }
          : { kind: "UNKNOWN", reason: slice.reason };
    const inScope =
      subjectWindow.kind === "PLACED"
        ? evidence.filter(
            (record) => covers(record.scope, row.component) && meets(record.interval, subjectWindow),
          )
        : [];
    for (const record of inScope) touched.add(record.evidenceId);
    const resolved = inScope.filter((record) => record.resolution === "RESOLVED");
    const authorityBacked = resolved.filter((record) => record.basis === "AUTHORITY_BACKED");
    const unresolved = inScope.flatMap((record): UnresolvedInScope[] =>
      record.resolution === "RESOLVED"
        ? []
        : [{ evidenceId: record.evidenceId, resolution: record.resolution }],
    );

    const pairs = row.pairs.map((pair): PairLink => {
      const limits: LinkLimit[] = ["COMPARISON_COVERAGE_UNCERTIFIED", "COMPARISON_DECISIONS_NOT_EVALUATED"];
      if (pair.perMinute.kind === "NO_MORE_THAN" || pair.perMinute.kind === "NO_LESS_THAN")
        limits.push("DELTA_IS_A_BOUND");
      if (row.measure === "DAMAGE_EVENT_COUNT") limits.push("EVENT_COUNT_NOT_DAMAGE_AMOUNT");
      if (claim === "OBSERVED_ONLY") limits.push("SUBJECT_COMPONENTS_OBSERVED_ONLY");
      if (unresolved.length > 0) limits.push("UNRESOLVED_EVIDENCE_IN_SCOPE");
      if (resolved.length > 0 && authorityBacked.length === 0) limits.push("NO_AUTHORITY_BACKED_EVIDENCE");
      const cause: ObservationOnlyCause | null =
        pair.perMinuteDirection === "UNDECIDED"
          ? "DIRECTION_UNDECIDED"
          : pair.perMinuteDirection === "EQUAL"
            ? "DIRECTION_EQUAL"
            : subjectWindow.kind === "UNKNOWN"
              ? "SUBJECT_WINDOW_UNKNOWN"
              : inScope.length === 0
                ? "NO_DECISION_EVIDENCE_IN_SCOPE"
                : resolved.length === 0
                  ? "DECISION_EVIDENCE_UNRESOLVED"
                  : null;
      return {
        comparisonFightRef: pair.comparisonFightRef,
        perMinuteDirection: pair.perMinuteDirection,
        perMinuteDelta: pair.perMinute,
        status: cause === null ? "LINKED" : "OBSERVATION_ONLY",
        cause,
        limits,
      };
    });

    return {
      rowId: row.rowId,
      windowId: row.windowId,
      measure: row.measure,
      componentKey: row.componentKey,
      component: row.component,
      subjectWindow,
      resolvedEvidenceIds: resolved.map((record) => record.evidenceId),
      authorityBackedEvidenceIds: authorityBacked.map((record) => record.evidenceId),
      unresolved,
      pairs,
    };
  });

  return {
    kind: "LINKED_EVIDENCE",
    encounterId: decomposition.encounterId,
    difficulty: decomposition.difficulty,
    subjectFightRef: decomposition.subjectFightRef,
    comparisonFightRefs: decomposition.comparisonFightRefs,
    evidence,
    components,
    evidenceInNoComponent: evidence
      .filter((record) => !touched.has(record.evidenceId))
      .map((record) => record.evidenceId),
    decisionEvidenceSide: "SUBJECT_ONLY",
    comparisonCoverage: "AT_LEAST_UNCERTIFIED",
    use: "LINKAGE_ONLY",
    causalClaim: "NONE",
    magnitudeAttribution: "NONE",
    verdictFlow: "NONE",
    findingEffect: { suppression: "NONE", confidence: "NONE" },
  };
}
