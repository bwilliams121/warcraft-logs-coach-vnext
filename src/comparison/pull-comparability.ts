/**
 * Whether two pulls may be compared at all.
 *
 * THE PRECEDENCE, AND WHY IT IS IN THIS ORDER
 *
 *     1. any hard dimension INCOMPATIBLE   -> NOT_COMPARABLE
 *     2. any hard dimension UNKNOWN        -> UNKNOWN
 *     3. caveats present                   -> COMPARABLE_WITH_CAVEATS
 *     4. otherwise                         -> COMPARABLE
 *
 * Step 1 runs before step 2 deliberately, and the distinction is easy to get
 * backwards. An observed incompatibility is POSITIVE evidence: if the encounter
 * ids are 3420 and 2900, these are different bosses and no amount of missing
 * difficulty data makes that less true. Reporting UNKNOWN there would withhold a
 * fact we actually hold.
 *
 * What the review required — and what step 2 provides — is the other direction:
 * a dimension that could not be resolved must never contribute an
 * incompatibility of its own. That guarantee does not live here. It lives in
 * each dimension function, every one of which tests its unresolved case BEFORE
 * testing for inequality, so UNKNOWN can never be handed to this function
 * disguised as INCOMPATIBLE. This function cannot manufacture one either: it
 * only counts the three verdicts it is given.
 *
 * WHY CAVEATS CANNOT REACH STEPS 1 AND 2
 *
 * They are a different parameter with a different type. `caveats` is consulted
 * by exactly one comparison in this file — is it empty — and there is no
 * arithmetic, no weighting and no threshold anywhere for one to accumulate
 * through. A raid-size difference cannot become an incompatibility because
 * there is no code path along which it could travel.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * No similarity score, no percentage, no confidence value, no weight, and no
 * field one could be stored in. Four named states and two lists of named
 * dimensions. A consumer wanting to know how comparable something is reads which
 * dimensions and which caveats, which is a sentence rather than a number.
 */

import { COMPARISON_EVIDENCE_CLASS, type ComparisonEvidence } from "./evidence-class.js";
import type { DimensionCompatibility } from "./dimension.js";
import { deriveCaveats, type ComparisonCaveat } from "./caveats.js";
import {
  assessDifficultyCompatibility,
  assessEncounterCompatibility,
  type DifficultyCompatibilityAssessment,
  type EncounterCompatibilityAssessment,
  type PullContext,
} from "./pull-identity.js";
import { assessVersionCompatibility, type VersionCompatibilityAssessment } from "./version-evidence.js";

/**
 * The dimensions that gate comparability, in canonical order.
 *
 * Declaration order is the order of the two reported dimension lists, so those
 * arrays never reflect evaluation order or object-key iteration.
 *
 * SPEC AND ANALYSIS PROVENANCE ARE ABSENT, and that is not an omission. They
 * gate the question "may these two players' analysis counts be compared", which
 * is a different question about different inputs; `analysis-comparability.ts`
 * answers it and keeps its own verdict. Merging them here would make a pull-level
 * comparison unavailable whenever a player happened to be absent from one pull.
 */
export const HARD_DIMENSIONS = ["encounter", "difficulty", "version"] as const;

export type HardDimension = (typeof HARD_DIMENSIONS)[number];

/**
 * How comparable two pulls are.
 *
 * Distinct from M7's `Comparability` (`SAME | DIFFERENT | UNKNOWN`) in both name
 * and vocabulary, because it answers a different question — see `dimension.ts`.
 * The two must never be aliased.
 */
export type PullComparability = "COMPARABLE" | "COMPARABLE_WITH_CAVEATS" | "NOT_COMPARABLE" | "UNKNOWN";

export const PULL_COMPARABILITY_VALUES = [
  "COMPARABLE",
  "COMPARABLE_WITH_CAVEATS",
  "NOT_COMPARABLE",
  "UNKNOWN",
] as const satisfies readonly PullComparability[];

export interface PullComparabilityAssessment extends ComparisonEvidence {
  readonly comparability: PullComparability;
  readonly encounter: EncounterCompatibilityAssessment;
  readonly difficulty: DifficultyCompatibilityAssessment;
  readonly version: VersionCompatibilityAssessment;
  /** Canonical order, from `COMPARISON_CAVEATS`. Never gates the verdict. */
  readonly caveats: readonly ComparisonCaveat[];
  /** Hard dimensions observed INCOMPATIBLE. Canonical order. */
  readonly incompatibleDimensions: readonly HardDimension[];
  /** Hard dimensions that could not be resolved. Canonical order. Disjoint from above. */
  readonly unresolvedDimensions: readonly HardDimension[];
}

export function assessPullComparability(
  subject: PullContext,
  reference: PullContext,
): PullComparabilityAssessment {
  const encounter = assessEncounterCompatibility(subject.identity, reference.identity);
  const difficulty = assessDifficultyCompatibility(subject.identity, reference.identity);
  const version = assessVersionCompatibility(subject.identity, reference.identity);

  const byDimension: Readonly<Record<HardDimension, DimensionCompatibility>> = {
    encounter: encounter.compatibility,
    difficulty: difficulty.compatibility,
    version: version.compatibility,
  };

  // Built by filtering the canonical list, so both arrays are canonically
  // ordered without a sort and independently of how the record above is keyed.
  const incompatibleDimensions = HARD_DIMENSIONS.filter(
    (dimension) => byDimension[dimension] === "INCOMPATIBLE",
  );
  const unresolvedDimensions = HARD_DIMENSIONS.filter((dimension) => byDimension[dimension] === "UNKNOWN");

  const caveats = deriveCaveats(subject, reference);

  const comparability = ((): PullComparability => {
    if (incompatibleDimensions.length > 0) {
      return "NOT_COMPARABLE";
    }
    if (unresolvedDimensions.length > 0) {
      return "UNKNOWN";
    }
    return caveats.length > 0 ? "COMPARABLE_WITH_CAVEATS" : "COMPARABLE";
  })();

  return {
    evidenceClass: COMPARISON_EVIDENCE_CLASS,
    comparability,
    encounter,
    difficulty,
    version,
    caveats,
    incompatibleDimensions,
    unresolvedDimensions,
  };
}
