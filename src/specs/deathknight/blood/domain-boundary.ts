/**
 * The class/spec authority boundary of the Blood analyzer (M11-B2).
 *
 * THE SAME POLICY the M11-A4 Paladin analyzer adopted on 2026-09-18, stated
 * in this analyzer's words: the analyzer evaluates class/spec/hero-talent
 * ROTATIONAL gameplay, and an entry of the pinned Blood list that is not a
 * class/spec action — the five `use_item`/`use_items` entries, the four
 * racial entries and Arcane Torrent, the `potion` — is OUTSIDE THE
 * ROTATIONAL DECISION DOMAIN and cannot preempt a supported class/spec
 * action. The tables are the shared class-neutral ones
 * (`src/simc/non-domain-tokens.ts`); the verdict recorded on the scan step
 * is Blood's.
 *
 * WHAT THIS IS, AND IS NOT. A DOMAIN-BOUNDARY DECISION, not an availability
 * claim: nothing here reads race, faction, gear or consumables, and nothing
 * infers them. The scan skips a non-domain entry exactly as it skips a
 * background action (`OUTSIDE_SUPPORTED_DECISION_DOMAIN`), and MATCH means
 * the observed class/spec action is compatible with the pinned class/spec
 * rotational authority AFTER those entries are excluded.
 *
 * ONE BLOOD-SPECIFIC CONSEQUENCE worth naming. Eleven of the seventeen
 * `default` entries are non-domain; of the six that remain, `auto_attack`,
 * `vampiric_blood` and the three dispatches are what every Blood scan
 * actually walks. The measurement (`observed-analysis.ts`) reports where
 * those stop.
 */

import type { AplAction } from "../../../simc/apl-authority.js";
import { notApplicable, type ActionApplicability } from "../../../simc/action-applicability.js";
import { nonDomainCategoryOf } from "../../../simc/non-domain-tokens.js";

export { nonDomainCategoryOf, type NonDomainCategory } from "../../../simc/non-domain-tokens.js";

const POLICY =
  "M11-A4 class/spec authority boundary (2026-09-18), applied by the Blood analyzer: it evaluates class/spec " +
  "rotational gameplay, and an entry of this category cannot preempt a class/spec action. This is a " +
  "domain-boundary decision, not an availability claim: the entry may have been usable, and nothing about " +
  "race, faction, gear or consumables was read or inferred.";

/**
 * The applicability verdict for a non-domain entry, or `null` for a
 * class/spec entry (which the ordinary rules then decide).
 */
export function bloodNonDomainApplicabilityFor(action: AplAction): ActionApplicability | null {
  const category = nonDomainCategoryOf(action.actionToken);
  if (category === null) return null;
  return notApplicable("OUTSIDE_SUPPORTED_DECISION_DOMAIN", {
    itemId: null,
    slot: null,
    pinnedBehaviour: `${category}: '${action.actionToken}' is outside the rotational decision domain. ${POLICY}`,
  });
}
