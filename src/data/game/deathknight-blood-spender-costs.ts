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
import { POWER_RUNE_KEY } from "./deathknight-blood-rune-cost-authority.js";
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

/**
 * The power-type enumerator the artifact's provenance records for Runes
 * (`powerTypes.POWER_RUNE`), or `null` when it is not recorded as an integer.
 *
 * Read from THIS artifact's provenance rather than assumed: the class-neutral
 * parser surfaces Holy Power only, and the number 5 belongs to the pinned
 * enumeration, not to Blood code (M11-B7).
 */
export function bloodRunePowerType(): number | null {
  if (!load().ok) return null;
  const powerTypes: unknown = artifact.provenance.powerTypes;
  if (typeof powerTypes !== "object" || powerTypes === null) return null;
  const value: unknown = (powerTypes as Record<string, unknown>)[POWER_RUNE_KEY];
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

/**
 * `spell_data_t::cost( POWER_RUNE )` for one pinned record: the FIRST Rune
 * row in table order, per the artifact's own cost rule, or `null` when the
 * record carries no Rune row. The base row only; no modifier is applied here.
 */
export function bloodRuneCostOf(spell: SpenderCostIdentity): number | null {
  const runeType = bloodRunePowerType();
  if (runeType === null) return null;
  const first = spell.powerRows.find((row) => row.powerType === runeType);
  return first === undefined ? null : first.cost;
}
