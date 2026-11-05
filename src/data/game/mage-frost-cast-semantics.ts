/**
 * How each Frost Mage action executes, as the pinned data states it (ONB-D3).
 *
 * THE INPUT THE SPECIALIZATION OWNS UNDER ONB-S4. The shared anchor knows no spell: it asks the
 * specialization which of its abilities are instant, cast-time or channelled.
 *
 * EVERY ROW IS A HAND-REVIEWED READING of `_cast_time` in the pinned sc_spell_data.inc, at the same commit
 * as every other dataset of this specialization, and of the constructor for a channel. Nothing reads this table to learn a
 * haste value: a positive base is only ever a proof that a cast has a cast time, and never a duration.
 *
 * WHICH ROWS MAY BE INSTANT, read off every mage-family effect of the pinned data with `_misc_value` P_CAST_TIME
 * (10, data_enums.hh:631) whose class mask matches each row's spell. The family holds such effects on aura subtypes 4, 108 and 218. The 4 and 218 rows carry no class mask here, and of the 108 rows matching these spells, Slick Ice, Flame Accelerant and Thermal Conditioning do not reach -100%. These do:
 *
 *     Blizzard             Freezing Rain 270232
 *     Frostfire Bolt       Frostfire Empowerment 431177
 *     Frostbolt, Glacial Spike   none
 *
 * A ROW THAT EXISTS IS NOT NARROWED HERE. Each of these is a talent or hero-talent effect, so a later slice could prove one not taken on a
 * build. This slice makes no such reading: each keeps its execution UNKNOWN on every build (agent/follow-ups.md "After ONB-D3").
 * The scope of this reading is the mage family's class masks; it says nothing of an effect outside that family.
 */

export type FrostCastRule =
  /** A cast time of zero. No proc is involved. */
  | "INSTANT"
  /** A positive base, and no -100% cast-time row of the family matches the spell. */
  | "HARD_CAST"
  /** A positive base, and a -100% row matches, so any one execution may have been instant. */
  | "INSTANT_ROW_NOT_EXCLUDED"
  /** The constructor sets `channeled`, so its `cast` is its start. */
  | "CHANNEL";

export interface FrostCastRow {
  readonly simcToken: string;
  readonly abilityGameId: number;
  /** `_cast_time` in the pinned sc_spell_data.inc, in milliseconds. */
  readonly baseCastMs: number;
  readonly rule: FrostCastRule;
}

export const FROST_CAST_PROVENANCE = Object.freeze({
  repository: "https://github.com/simulationcraft/simc",
  commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  sourcePath: "engine/dbc/generated/sc_spell_data.inc",
  field: "spell_data_t::_cast_time (engine/dbc/spell_data.hpp)",
  clientDataWowVersion: "12.1.0.69587",
  reviewedOn: "2026-11-04",
});

export const FROST_CAST_ROWS: readonly FrostCastRow[] = Object.freeze([
  { simcToken: "blizzard", abilityGameId: 190356, baseCastMs: 2000, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "blizzard", abilityGameId: 1248829, baseCastMs: 2000, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "frostbolt", abilityGameId: 431044, baseCastMs: 1750, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "frostbolt", abilityGameId: 116, baseCastMs: 1750, rule: "HARD_CAST" },
  { simcToken: "glacial_spike", abilityGameId: 199786, baseCastMs: 1750, rule: "HARD_CAST" },
  { simcToken: "comet_storm", abilityGameId: 153595, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "cone_of_cold", abilityGameId: 120, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "flurry", abilityGameId: 44614, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "frozen_orb", abilityGameId: 84714, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "ice_lance", abilityGameId: 30455, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "ice_nova", abilityGameId: 157997, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "ray_of_frost", abilityGameId: 205021, baseCastMs: 0, rule: "CHANNEL" },
]);

const BY_ABILITY: ReadonlyMap<number, FrostCastRow> = new Map(
  FROST_CAST_ROWS.map((row) => [row.abilityGameId, row]),
);

/** The reviewed row of an ability, or `null` when the specialization has not reviewed it. */
export function frostCastRowFor(abilityGameId: number): FrostCastRow | null {
  return BY_ABILITY.get(abilityGameId) ?? null;
}
