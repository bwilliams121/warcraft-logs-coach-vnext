/**
 * The class/spec authority boundary of the Windwalker Monk analyzer (ONB-T1).
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
 * THREE RACIALS THE SHARED TABLE DOES NOT LIST. That table reads `player_t::get_racial_actions()`, and `arcane_pulse_t`, `haymaker_t` and `rocket_barrage_t` are `racial_spell_t`s the same factory builds
 * (player.cpp:9299, :9426, :9181; :11054, :11068, :11072). `default[16]`, `[18]` and `[19]` press them by name. Racial abilities are excluded from analysis, so this
 * specialization classifies them here, as Unholy Death Knight does Arcane Pulse.
 */

import type { AplAction } from "../../../simc/apl-authority.js";
import { notApplicable, type ActionApplicability } from "../../../simc/action-applicability.js";
import { nonDomainCategoryOf } from "../../../simc/non-domain-tokens.js";

const UNLISTED_RACIALS: ReadonlySet<string> = new Set(["arcane_pulse", "haymaker", "rocket_barrage"]);

const POLICY =
  "class/spec authority boundary, applied by the Windwalker Monk analyzer: it evaluates class/spec rotational gameplay, " +
  "and an entry of this category cannot preempt a class/spec action. This is a domain-boundary decision, not an " +
  "availability claim: the entry may have been usable, and nothing about race, faction, gear or consumables was " +
  "read or inferred.";

/** The applicability verdict for a non-domain entry, or `null` for a class/spec entry. */
export function windwalkerMonkNonDomainApplicabilityFor(action: AplAction): ActionApplicability | null {
  const category = UNLISTED_RACIALS.has(action.actionToken)
    ? "RACIAL_ACTION"
    : nonDomainCategoryOf(action.actionToken);
  if (category === null) return null;
  return notApplicable("OUTSIDE_SUPPORTED_DECISION_DOMAIN", {
    itemId: null,
    slot: null,
    pinnedBehaviour: `${category}: '${action.actionToken}' is outside the rotational decision domain. ${POLICY}`,
  });
}
