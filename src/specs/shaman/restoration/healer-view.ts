/**
 * Restoration Shaman's healer view (HEAL-AP): its finding set and the factual
 * context each finding rests on, in the shared `healer-view.ts` form.
 *
 * Restatement only. Every record is a finding of the set built by
 * `healer-findings.ts`, joined to the evaluator's own result for the same plan
 * entry or cast: the planned window an outcome was judged in, and each
 * cooldown use's overlapping damage episodes with their coverage. Since
 * HEAL-B1P the restatement is the shared `healer-view-projection.ts`, which
 * every public healer specialization calls with its own evaluation.
 */

import type { HealerFindingSet } from "../../../findings/healer-finding.js";
import type { HealerView } from "../../../findings/healer-view.js";
import { healerViewOfEvaluation } from "../../../findings/healer-view-projection.js";
import type { RestorationShamanEvaluation } from "./evaluator.js";

type Evaluated = Extract<RestorationShamanEvaluation, { state: "EVALUATED" }>;

/** The view of an EVALUATED result and the finding set built from it. */
export function restorationShamanHealerView(evaluation: Evaluated, set: HealerFindingSet): HealerView {
  return healerViewOfEvaluation(evaluation, set);
}
