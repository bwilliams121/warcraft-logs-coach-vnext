/**
 * Protection Paladin's pinned spender costs (M10-C4): the `SpellPower` rows
 * of Shield of the Righteous and Word of Glory from the same SimulationCraft
 * commit as every other Paladin dataset, with the spell's own cooldown, GCD
 * and charge scalars.
 *
 * THE COST RULE IS THE AUTHORITY'S. `spell_data_t::cost( pt )` returns the
 * FIRST power row of the requested type in table order (spell_data.hpp), so
 * the aura-conditioned variant of Shield of the Righteous (aura 1277162,
 * Instrument of the Divine) is recorded but is not what `cost()` returns;
 * the pinned Paladin module reads that talent through `cost() > 3.0` in a
 * damage multiplier, not through the base cost.
 *
 * NO MODIFIER IS APPLIED HERE. A free cast (Divine Purpose, Shining Light on
 * Word of Glory) is a specialization reading, recorded in the transition
 * authority with its source; this module states the base.
 */

import artifact from "./paladin-protection-spender-costs.json";
import {
  parseSpenderCostArtifact,
  type SpenderCostIdentity,
  type SpenderCostLoad,
  type SpenderPowerRow,
} from "./spender-cost-artifact.js";

export type { SpenderCostIdentity, SpenderCostLoad, SpenderPowerRow };

export const PROTECTION_PALADIN_SPENDER_DATASET_ID = "SIMC_DBC_PALADIN_PROTECTION_SPENDER_COSTS";

let cached: SpenderCostLoad | null = null;

/** The class-neutral parser (M11-A4) over THIS specialization's committed artifact. */
function load(): SpenderCostLoad {
  cached ??= parseSpenderCostArtifact(artifact, PROTECTION_PALADIN_SPENDER_DATASET_ID);
  return cached;
}

/** The pinned dataset, or the reason it could not be used. */
export function pinnedProtectionPaladinSpenderCosts(): SpenderCostLoad {
  return load();
}

/** Test seam. */
export function resetProtectionPaladinSpenderCostCache(): void {
  cached = null;
}

/** The pinned cost identity for an APL token, or `null` when the token is not pinned. */
export function protectionSpenderCostFor(simcToken: string): SpenderCostIdentity | null {
  const loaded = load();
  if (!loaded.ok) return null;
  return loaded.spells.find((spell) => spell.simcToken === simcToken) ?? null;
}
