/**
 * The class/spec authority boundary of the Unholy Death Knight analyzer (ONB-X5).
 *
 * The policy every rotational specialization applies: the analyzer evaluates
 * class/spec/hero-talent ROTATIONAL gameplay, and an entry of the pinned list that is not a
 * class/spec action cannot preempt one. The tables are the shared class-neutral ones
 * (`src/simc/non-domain-tokens.ts`); the verdict recorded on the scan step is this
 * specialization's.
 *
 * A DOMAIN-BOUNDARY DECISION, not an availability claim: nothing here reads race, faction,
 * gear or consumables.
 *
 * ONE RACIAL THE SHARED TABLE DOES NOT LIST. That table reads `player_t::get_racial_actions()`, and `arcane_pulse_t` is a `racial_spell_t` the same factory builds
 * (player.cpp:9299, :11054-11055). `racials[1]` presses it by name, ahead of every class action. Racial abilities are excluded from analysis, so this
 * specialization classifies it here, as Outlaw and Feral do Shadowmeld.
 */

import type { AplAction } from "../../../simc/apl-authority.js";
import { notApplicable, type ActionApplicability } from "../../../simc/action-applicability.js";
import { nonDomainCategoryOf } from "../../../simc/non-domain-tokens.js";

const POLICY =
  "class/spec authority boundary, applied by the Unholy Death Knight analyzer: it evaluates class/spec rotational gameplay, " +
  "and an entry of this category cannot preempt a class/spec action. This is a domain-boundary decision, not an " +
  "availability claim: the entry may have been usable, and nothing about race, faction, gear or consumables was " +
  "read or inferred.";

/** The applicability verdict for a non-domain entry, or `null` for a class/spec entry. */
export function unholyDeathKnightNonDomainApplicabilityFor(action: AplAction): ActionApplicability | null {
  const category =
    action.actionToken === "arcane_pulse" ? "RACIAL_ACTION" : nonDomainCategoryOf(action.actionToken);
  if (category === null) return null;
  return notApplicable("OUTSIDE_SUPPORTED_DECISION_DOMAIN", {
    itemId: null,
    slot: null,
    pinnedBehaviour: `${category}: '${action.actionToken}' is outside the rotational decision domain. ${POLICY}`,
  });
}
