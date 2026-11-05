/**
 * The class/spec authority boundary of the Arcane Mage analyzer (ONB-D3).
 *
 * The policy every rotational specialization applies: the analyzer evaluates
 * class/spec/hero-talent ROTATIONAL gameplay, and an entry of the pinned list that is not a
 * class/spec action cannot preempt one. The tables are the shared class-neutral ones
 * (`src/simc/non-domain-tokens.ts`); the verdict recorded on the scan step is this
 * specialization's.
 *
 * A DOMAIN-BOUNDARY DECISION, not an availability claim: nothing here reads race, faction,
 * gear or consumables.
 */

import type { AplAction } from "../../../simc/apl-authority.js";
import { notApplicable, type ActionApplicability } from "../../../simc/action-applicability.js";
import { nonDomainCategoryOf } from "../../../simc/non-domain-tokens.js";

const POLICY =
  "class/spec authority boundary, applied by the Arcane Mage analyzer: it evaluates class/spec rotational gameplay, " +
  "and an entry of this category cannot preempt a class/spec action. This is a domain-boundary decision, not an " +
  "availability claim: the entry may have been usable, and nothing about race, faction, gear or consumables was " +
  "read or inferred.";

/** The applicability verdict for a non-domain entry, or `null` for a class/spec entry. */
export function arcaneNonDomainApplicabilityFor(action: AplAction): ActionApplicability | null {
  const category = nonDomainCategoryOf(action.actionToken);
  if (category === null) return null;
  return notApplicable("OUTSIDE_SUPPORTED_DECISION_DOMAIN", {
    itemId: null,
    slot: null,
    pinnedBehaviour: `${category}: '${action.actionToken}' is outside the rotational decision domain. ${POLICY}`,
  });
}
