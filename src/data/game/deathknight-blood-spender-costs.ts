/**
 * Blood Death Knight's pinned resource costs (M11-B2): the `SpellPower` rows
 * of Death Strike (49998), Heart Strike (206930) and its Vampiric Strike
 * execution (433895), Marrowrend (195182), Death's Caress (195292) and Death
 * and Decay (43265), from the same SimulationCraft commit as every other
 * dataset, produced by `extract-simc-power-costs.mjs --target
 * deathknight-blood` and parsed by the class-neutral `spender-cost-artifact.ts`.
 *
 * TWO ENCODINGS, ONE FACT EACH. A Runic Power row's `_cost` is in TENTHS of
 * a point — `power_type_data.inc` row 6 carries divisor 10.0 and
 * `spellpower_data_t::cost()` divides by it (spell_data.cpp:88-100) — and the
 * Warcraft Logs cast snapshot reports Runic Power in the SAME encoding
 * (Death Strike casts carry `cost` 450 against `max` 1250 on both M11-B2
 * subjects). A Rune row's `_cost` is whole runes (divisor 1.0) and the wire
 * reports whole runes (`cost` 1 or 2 against `max` 6). The Blood resource
 * module (`src/specs/deathknight/blood/resources.ts`) converts once, at the
 * boundary, and never mixes the two.
 *
 * NO MODIFIER IS APPLIED HERE. Improved Death Strike, Ossuary and every other
 * cost change are specialization readings the slice does not yet make; this
 * module states the base rows.
 */

import artifact from "./deathknight-blood-spender-costs.json";
import {
  parseSpenderCostArtifact,
  type SpenderCostIdentity,
  type SpenderCostLoad,
} from "./spender-cost-artifact.js";

export const BLOOD_DEATH_KNIGHT_SPENDER_DATASET_ID = "SIMC_DBC_DEATHKNIGHT_BLOOD_SPENDER_COSTS";

let cached: SpenderCostLoad | null = null;

function load(): SpenderCostLoad {
  cached ??= parseSpenderCostArtifact(artifact, BLOOD_DEATH_KNIGHT_SPENDER_DATASET_ID);
  return cached;
}

/** The pinned dataset, or the reason it could not be used. */
export function pinnedBloodDeathKnightSpenderCosts(): SpenderCostLoad {
  return load();
}

/** Test seam. */
export function resetBloodDeathKnightSpenderCostCache(): void {
  cached = null;
}

/** The pinned cost identity for one spell id, or `null` when the spell is not pinned. */
export function bloodSpenderCostForSpell(spellId: number): SpenderCostIdentity | null {
  const loaded = load();
  if (!loaded.ok) return null;
  return loaded.spells.find((spell) => spell.spellId === spellId) ?? null;
}

/** Every pinned record for an APL token, in artifact order. Empty when the token is not pinned. */
export function bloodSpenderCostsFor(simcToken: string): readonly SpenderCostIdentity[] {
  const loaded = load();
  if (!loaded.ok) return [];
  return loaded.spells.filter((spell) => spell.simcToken === simcToken);
}
