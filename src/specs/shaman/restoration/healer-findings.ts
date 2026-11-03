/**
 * Restoration Shaman's evaluation, in the shared healer finding shape (HEAL-A).
 *
 * The specialization decides what its evaluation means; this module only
 * restates it in `src/findings/healer-finding.ts` form, adding no judgement.
 * Since HEAL-B1 the restatement is the shared `healer-finding-projection.ts`,
 * which every healer specialization calls with its own evaluation and id:
 *
 * - ASSIGNMENT. No plan, or another fight's plan: NO_AUTHORITY_AVAILABLE.
 *   A plan whose binding cannot be established: UNKNOWN. A bound plan:
 *   EVALUATED_AGAINST_PLAN, with one finding per entry for this player.
 * - COOLDOWN. OBSERVED, with the evaluator's listing completeness, and one
 *   finding per observed use whose evidence is the cast.
 * - HEALING_DECISION. NO_AUTHORITY_AVAILABLE, no finding.
 */

import type { HealerFindingSet } from "../../../findings/healer-finding.js";
import { healerFindingSetOf } from "../../../findings/healer-finding-projection.js";
import type { RaidCooldownPlan } from "../../../raid-plan/raid-cooldown-plan.js";
import type { RestorationShamanEvaluation } from "./evaluator.js";
import { RESTORATION_SHAMAN_SPEC_ID } from "./spec.js";

type Evaluated = Extract<RestorationShamanEvaluation, { state: "EVALUATED" }>;

/**
 * The finding set of an EVALUATED result. `plan` is the plan the evaluator was
 * handed; the evaluation never names a plan it was not given.
 */
export function restorationShamanHealerFindings(
  evaluation: Evaluated,
  plan: RaidCooldownPlan | null,
): HealerFindingSet {
  return healerFindingSetOf(RESTORATION_SHAMAN_SPEC_ID, evaluation, plan);
}
