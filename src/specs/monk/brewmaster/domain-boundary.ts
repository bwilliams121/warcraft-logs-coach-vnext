/**
 * The class/spec authority boundary of the Brewmaster analyzer (M11-C2).
 *
 * THE SAME POLICY the M11-A4 Paladin analyzer adopted on 2026-09-18, stated
 * in this analyzer's words: the analyzer evaluates class/spec/hero-talent
 * ROTATIONAL gameplay, and an entry of the pinned Brewmaster list that is not
 * a class/spec action — the `potion` entries (precombat[1], default[1]), the
 * `use_items` entry (item_actions[0]) and the seven racial entries
 * (race_actions[0..6], Arcane Torrent among them) — is OUTSIDE THE ROTATIONAL
 * DECISION DOMAIN and cannot preempt a supported class/spec action. The
 * tables are the shared class-neutral ones (`src/simc/non-domain-tokens.ts`),
 * which already name every one of these tokens; the verdict recorded on the
 * scan step is Brewmaster's.
 *
 * WHAT THIS IS, AND IS NOT. A DOMAIN-BOUNDARY DECISION, not an availability
 * claim: nothing here reads race, faction, gear or consumables, and nothing
 * infers them. The scan skips a non-domain entry exactly as it skips a
 * background action (`OUTSIDE_SUPPORTED_DECISION_DOMAIN`), and MATCH means
 * the observed class/spec action is compatible with the pinned class/spec
 * rotational authority AFTER those entries are excluded.
 *
 * ONE BREWMASTER-SPECIFIC CONSEQUENCE worth naming. Both `call_action_list`
 * entries of `default` (race_actions, item_actions) dispatch into lists made
 * entirely of non-domain entries, so each call returns having selected
 * nothing, and every scan reaches the two hero-tree `run_action_list`
 * entries with only `auto_attack` behind it.
 */

import type { AplAction } from "../../../simc/apl-authority.js";
import { notApplicable, type ActionApplicability } from "../../../simc/action-applicability.js";
import { nonDomainCategoryOf } from "../../../simc/non-domain-tokens.js";

export { nonDomainCategoryOf, type NonDomainCategory } from "../../../simc/non-domain-tokens.js";

const POLICY =
  "M11-A4 class/spec authority boundary (2026-09-18), applied by the Brewmaster analyzer: it evaluates " +
  "class/spec rotational gameplay, and an entry of this category cannot preempt a class/spec action. This is " +
  "a domain-boundary decision, not an availability claim: the entry may have been usable, and nothing about " +
  "race, faction, gear or consumables was read or inferred.";

/**
 * The applicability verdict for a non-domain entry, or `null` for a
 * class/spec entry (which the ordinary rules then decide).
 */
export function brewmasterNonDomainApplicabilityFor(action: AplAction): ActionApplicability | null {
  const category = nonDomainCategoryOf(action.actionToken);
  if (category === null) return null;
  return notApplicable("OUTSIDE_SUPPORTED_DECISION_DOMAIN", {
    itemId: null,
    slot: null,
    pinnedBehaviour: `${category}: '${action.actionToken}' is outside the rotational decision domain. ${POLICY}`,
  });
}
