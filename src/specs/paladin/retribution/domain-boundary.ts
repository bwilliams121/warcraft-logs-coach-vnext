/**
 * The class/spec authority boundary of the Retribution analyzer (M11-A4).
 *
 * THE POLICY, adopted by the product owner on 2026-09-18: the analyzer
 * evaluates class/spec/hero-talent ROTATIONAL gameplay. Entries of the pinned
 * list that are not class/spec actions — racial actions, potions, item uses,
 * profession actions, externally supplied buffs, other non-class/spec
 * preparation entries — are OUTSIDE THE ROTATIONAL DECISION DOMAIN and
 * cannot preempt a supported class/spec action. They stay in the pinned
 * artifact for provenance and are classified non-domain BEFORE rotational
 * authority selection.
 *
 * WHAT THIS IS, AND IS NOT
 *
 * A DOMAIN-BOUNDARY DECISION. It is not a claim that the player could not
 * have used a potion or that the trinket was on cooldown; nothing here reads
 * race, faction, gear or consumables, and nothing here infers any of them.
 * The scan skips a non-domain entry exactly as it skips a background action
 * (`OUTSIDE_SUPPORTED_DECISION_DOMAIN`, recorded on the step), and the
 * meaning of MATCH follows: the observed class/spec action is compatible
 * with the pinned class/spec rotational authority AFTER the non-domain
 * entries are excluded — never "the exact next action the complete
 * SimulationCraft profile would execute including racials, items and
 * consumables".
 *
 * GENERIC BY CONSTRUCTION. The classification is by TOKEN CATEGORY, read off
 * the pinned shared sources; the tables live in `src/simc/non-domain-tokens.ts`
 * (promoted there verbatim in M11-B2 when a second specialization needed the
 * identical classification) and are re-exported here unchanged. No race, no
 * actor and no item is special-cased. What stays HERE is Retribution's
 * verdict: the policy in this analyzer's words, recorded on its scan steps.
 */

import type { AplAction } from "../../../simc/apl-authority.js";
import { notApplicable, type ActionApplicability } from "../../../simc/action-applicability.js";
import { nonDomainCategoryOf } from "../../../simc/non-domain-tokens.js";

export {
  CONSUMABLE_TOKENS,
  EXTERNAL_BUFF_TOKENS,
  ITEM_USE_TOKENS,
  nonDomainCategoryOf,
  PROFESSION_ACTION_TOKENS,
  RACIAL_ACTION_TOKENS,
  type NonDomainCategory,
} from "../../../simc/non-domain-tokens.js";

const POLICY =
  "M11-A4 class/spec authority boundary (2026-09-18): the Retribution analyzer evaluates class/spec " +
  "rotational gameplay, and an entry of this category cannot preempt a class/spec action. This is a " +
  "domain-boundary decision, not an availability claim: the entry may have been usable, and nothing about " +
  "race, faction, gear or consumables was read or inferred.";

/**
 * The applicability verdict for a non-domain entry, or `null` for a
 * class/spec entry (which the ordinary rules then decide).
 */
export function nonDomainApplicabilityFor(action: AplAction): ActionApplicability | null {
  const category = nonDomainCategoryOf(action.actionToken);
  if (category === null) return null;
  return notApplicable("OUTSIDE_SUPPORTED_DECISION_DOMAIN", {
    itemId: null,
    slot: null,
    pinnedBehaviour: `${category}: '${action.actionToken}' is outside the rotational decision domain. ${POLICY}`,
  });
}
