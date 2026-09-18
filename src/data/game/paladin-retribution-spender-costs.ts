/**
 * Retribution Paladin's pinned spender costs (M11-A4): the `SpellPower` rows
 * of Divine Storm (53385), Templar's Verdict (85256) and Final Verdict
 * (383328) from the same SimulationCraft commit as every other Paladin
 * dataset, produced by `extract-simc-power-costs.mjs --target
 * paladin-retribution` and parsed by the class-neutral
 * `spender-cost-artifact.ts`.
 *
 * WHY TWO RECORDS FOR ONE TOKEN. `templars_verdict_t` is built on 383328 and
 * named "final_verdict" when the Final Verdict talent is taken, and on the
 * specialization spell 85256 otherwise (sc_paladin_retribution.cpp:662-669).
 * Both cost 3 Holy Power at the pin; `retributionSpenderCostFor` returns the
 * record for a SPELL ID, so the caller names the record the build resolved
 * rather than the first row that happens to carry the token.
 *
 * NO MODIFIER IS APPLIED HERE. The free route (Divine Purpose) is a
 * specialization reading in `holy-power.ts`; this module states the base.
 */

import artifact from "./paladin-retribution-spender-costs.json";
import {
  parseSpenderCostArtifact,
  type SpenderCostIdentity,
  type SpenderCostLoad,
} from "./spender-cost-artifact.js";

export const RETRIBUTION_PALADIN_SPENDER_DATASET_ID = "SIMC_DBC_PALADIN_RETRIBUTION_SPENDER_COSTS";

let cached: SpenderCostLoad | null = null;

function load(): SpenderCostLoad {
  cached ??= parseSpenderCostArtifact(artifact, RETRIBUTION_PALADIN_SPENDER_DATASET_ID);
  return cached;
}

/** The pinned dataset, or the reason it could not be used. */
export function pinnedRetributionPaladinSpenderCosts(): SpenderCostLoad {
  return load();
}

/** Test seam. */
export function resetRetributionPaladinSpenderCostCache(): void {
  cached = null;
}

/** The pinned cost identity for one spell id, or `null` when the spell is not pinned. */
export function retributionSpenderCostForSpell(spellId: number): SpenderCostIdentity | null {
  const loaded = load();
  if (!loaded.ok) return null;
  return loaded.spells.find((spell) => spell.spellId === spellId) ?? null;
}

/** Every pinned record for an APL token, in artifact order. Empty when the token is not pinned. */
export function retributionSpenderCostsFor(simcToken: string): readonly SpenderCostIdentity[] {
  const loaded = load();
  if (!loaded.ok) return [];
  return loaded.spells.filter((spell) => spell.simcToken === simcToken);
}
