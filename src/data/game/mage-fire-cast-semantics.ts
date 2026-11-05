/**
 * How each Fire Mage action executes, as the pinned data states it (ONB-X1).
 *
 * THE INPUT THE SPECIALIZATION OWNS UNDER ONB-S4. The shared anchor knows no spell: it asks the
 * specialization which of its abilities are instant, cast-time or channelled.
 *
 * EVERY ROW IS A HAND-REVIEWED READING of `_cast_time` in the pinned sc_spell_data.inc, at the same commit
 * as every other dataset of this specialization. Nothing reads this table to learn a haste value: a positive base is only ever a
 * proof that a cast has a cast time, and never a duration.
 *
 * WHICH ROWS MAY BE INSTANT, read off every mage-family effect of the pinned data with `_misc_value` P_CAST_TIME
 * (10, data_enums.hh:631) whose class mask matches each row's spell. The family holds such effects on aura subtypes 4, 108 and 218. The 4 and 218 rows carry no class mask here. Of the
 * 108 rows matching these spells, Pyroclasm's is 0, and Flame Accelerant's, Slick Ice's and Thermal Conditioning's do not reach -100%, alone or together. These do:
 *
 *     Pyroblast, Flamestrike   Hot Streak! 48108, Firestorm 333100, Hyperthermia 383874
 *     Scorch                   Heat Shimmer 458964
 *     Frostfire Bolt           Frostfire Empowerment 431177
 *     Fireball                 none
 *
 * THE PROC CHAIN IS THE POINT OF THOSE ROWS. A Pyroblast may be a Hot Streak press or a hard cast, and the log's begin does not say which: the retained subject logs a begin before
 * every Pyroblast, 62 of 76 under 100 ms before its completion. Hot Streak's own aura could tell them apart, and this slice does not read it.
 *
 * A ROW THAT EXISTS IS NOT NARROWED HERE. Hot Streak is baseline (specialization_spells.inc row 195283), so no build excludes it. Heat Shimmer and Frostfire Empowerment are talent
 * effects a later slice could prove not taken on a build. This slice makes no such reading: each row keeps its execution UNKNOWN on every build (agent/follow-ups.md "After ONB-X1").
 * The scope of this reading is the mage family's class masks; it says nothing of an effect outside that family.
 */

export type FireCastRule =
  /** A cast time of zero. No proc is involved. */
  | "INSTANT"
  /** A positive base, and no -100% cast-time row of the family matches the spell. */
  | "HARD_CAST"
  /** A positive base, and a -100% row matches, so any one execution may have been instant. */
  | "INSTANT_ROW_NOT_EXCLUDED";

export interface FireCastRow {
  readonly simcToken: string;
  readonly abilityGameId: number;
  /** `_cast_time` in the pinned sc_spell_data.inc, in milliseconds. */
  readonly baseCastMs: number;
  readonly rule: FireCastRule;
}

export const FIRE_CAST_PROVENANCE = Object.freeze({
  repository: "https://github.com/simulationcraft/simc",
  commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  sourcePath: "engine/dbc/generated/sc_spell_data.inc",
  field: "spell_data_t::_cast_time (engine/dbc/spell_data.hpp)",
  clientDataWowVersion: "12.1.0.69587",
  reviewedOn: "2026-11-04",
});

export const FIRE_CAST_ROWS: readonly FireCastRow[] = Object.freeze([
  { simcToken: "pyroblast", abilityGameId: 11366, baseCastMs: 4000, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "flamestrike", abilityGameId: 2120, baseCastMs: 3500, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "flamestrike", abilityGameId: 1254851, baseCastMs: 3500, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "scorch", abilityGameId: 2948, baseCastMs: 1500, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "fireball", abilityGameId: 431044, baseCastMs: 1750, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "fireball", abilityGameId: 133, baseCastMs: 1750, rule: "HARD_CAST" },
  { simcToken: "combustion", abilityGameId: 190319, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "fire_blast", abilityGameId: 108853, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "meteor", abilityGameId: 153561, baseCastMs: 0, rule: "INSTANT" },
]);

const BY_ABILITY: ReadonlyMap<number, FireCastRow> = new Map(
  FIRE_CAST_ROWS.map((row) => [row.abilityGameId, row]),
);

/** The reviewed row of an ability, or `null` when the specialization has not reviewed it. */
export function fireCastRowFor(abilityGameId: number): FireCastRow | null {
  return BY_ABILITY.get(abilityGameId) ?? null;
}
