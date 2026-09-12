/**
 * Run-level evaluation outcome and coverage.
 *
 * THE PROBLEM THIS SOLVES: zero findings is ambiguous.
 *
 * An empty finding list can mean "we evaluated the fight and every decision was
 * fine" or "we could not evaluate anything at all". Those read identically to a
 * consumer and mean opposite things. The historical failure is an unsupported
 * specialization producing a well-formed empty report that a player reads as
 * confirmation of clean play.
 *
 * So a run is a discriminated union. `NOT_EVALUATED` carries a reason and has no
 * `findings` field at all, which makes "iterate the findings of a run that never
 * happened" a compile error rather than an empty loop.
 *
 * WHERE THE LINE SITS
 *
 * `NOT_EVALUATED` is for prerequisites needed even to IDENTIFY the decision
 * surface: without the ability identity we cannot find the casts, and without
 * the resource wire contract we cannot read the state of any of them.
 *
 * A missing observation on an individual cast is NOT that. The decision point is
 * identified; the state is missing. That belongs INSIDE an `EVALUATED` run as an
 * UNKNOWN judgment, so it is counted, disclosed and attributable.
 *
 * Everything here is JSON-safe: arrays and scalars, no Map.
 */

import type { CoverageState } from "../engine/evidence/coverage.js";
import type { Finding } from "./finding.js";
import type { JudgmentBlocker } from "./judgment.js";

/** Why a run could not begin. Each is a prerequisite for identifying decisions. */
export type NotEvaluatedReason =
  "ABILITY_IDENTITY_UNAVAILABLE" | "INCOMPATIBLE_RESOURCE_WIRE_VERSION" | "AUTHORITY_ARTIFACT_UNUSABLE";

export const NOT_EVALUATED_REASONS = [
  "ABILITY_IDENTITY_UNAVAILABLE",
  "INCOMPATIBLE_RESOURCE_WIRE_VERSION",
  "AUTHORITY_ARTIFACT_UNUSABLE",
] as const satisfies readonly NotEvaluatedReason[];

export interface BlockerCount {
  readonly blocker: JudgmentBlocker;
  readonly count: number;
}

/**
 * What the run actually looked at.
 *
 * Names say "observed ... in scope", never "total". We counted the Envenom casts
 * our evidence contains for one actor; that is not the number of Envenom casts
 * in the fight, and the difference is exactly what an honest coverage report
 * must not blur. `castCoverage` and `resourceCoverage` expose the underlying
 * completeness so an incomplete run cannot present itself as a full one.
 */
export interface AnalysisCoverage {
  readonly actorId: number;
  /** Envenom casts identified in the retrieved, in-scope evidence. Not a fight total. */
  readonly observedEnvenomCastsInScope: number;
  readonly withExactPreCostComboPoints: number;
  readonly missingExactComboPoints: number;
  readonly rejectedByAuthority: number;
  readonly unknownByBlocker: readonly BlockerCount[];
  /** COMPLETE / PARTIAL / ABSENT for the categories this run depended on. */
  readonly castCoverage: CoverageState | null;
  readonly resourceCoverage: CoverageState | null;
  /** True when either dependency is not COMPLETE, so consumers cannot miss it. */
  readonly coverageIsIncomplete: boolean;
}

export type EvaluationRun =
  | {
      readonly outcome: "EVALUATED";
      readonly findings: readonly Finding[];
      readonly coverage: AnalysisCoverage;
    }
  | { readonly outcome: "NOT_EVALUATED"; readonly reason: NotEvaluatedReason; readonly detail: string };
