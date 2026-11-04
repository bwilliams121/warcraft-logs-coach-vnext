/**
 * How each Elemental Shaman action executes, as the pinned data states it (ONB-D2).
 *
 * THE INPUT THE SPECIALIZATION OWNS UNDER ONB-S4. The shared anchor knows no spell: it asks the
 * specialization which of its abilities are instant, cast-time or channelled.
 *
 * EVERY ROW IS A HAND-REVIEWED READING of `_cast_time` in the pinned sc_spell_data.inc, at the same commit
 * as every other dataset of this specialization, and of the constructor for a channel. Nothing reads this table to learn a
 * haste value: a positive base is only ever a proof that a cast has a cast time, and never a duration.
 *
 * WHICH ROWS MAY BE INSTANT, read off every shaman-family effect of the pinned data with `_misc_value` P_CAST_TIME
 * (10, data_enums.hh:631) whose class mask matches each row's spell. The family holds such effects on aura subtypes 0, 4, 107 and 108, and only the 108 rows reach -100%, so no label-keyed modifier is involved:
 *
 *     Lightning Bolt       Stormkeeper 191634, 205495, 383009, Nature's Swiftness 378081, Ancestral Swiftness 443454, Arc Discharge 455097
 *     Chain Lightning      those, and Tectonic Thunder 286976, Chains of Devastation 336736, Arc Discharge 470532
 *     Lava Burst           Lava Surge 77762, Ancestral Swiftness 443454
 *     Elemental Blast      Nature's Swiftness 378081, Ancestral Swiftness 443454
 *     Tempest              Nature's Swiftness 378081
 *     Stormkeeper          none
 *
 * A ROW THAT EXISTS IS NOT EXCLUDED BY NOT BEING NAMED. Some of these appear in neither the pinned module nor the
 * pinned talent data, but no pinned source proves them unavailable on a live character, so each keeps its execution
 * UNKNOWN on every build, and no talent reading narrows it.
 * The scope of this reading is the shaman family's class masks; it says nothing of an effect outside that family.
 */

export type ElementalCastRule =
  /** A cast time of zero. No proc is involved. */
  | "INSTANT"
  /** A positive base, and no -100% cast-time row of the family matches the spell. */
  | "HARD_CAST"
  /** A positive base, and a -100% row matches, so any one execution may have been instant. */
  | "INSTANT_ROW_NOT_EXCLUDED";

export interface ElementalCastRow {
  readonly simcToken: string;
  readonly abilityGameId: number;
  /** `_cast_time` in the pinned sc_spell_data.inc, in milliseconds. */
  readonly baseCastMs: number;
  readonly rule: ElementalCastRule;
}

export const ELEMENTAL_CAST_PROVENANCE = Object.freeze({
  repository: "https://github.com/simulationcraft/simc",
  commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  sourcePath: "engine/dbc/generated/sc_spell_data.inc",
  field: "spell_data_t::_cast_time (engine/dbc/spell_data.hpp)",
  clientDataWowVersion: "12.1.0.69587",
  reviewedOn: "2026-11-04",
});

export const ELEMENTAL_CAST_ROWS: readonly ElementalCastRow[] = Object.freeze([
  { simcToken: "lightning_bolt", abilityGameId: 188196, baseCastMs: 2500, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "chain_lightning", abilityGameId: 188443, baseCastMs: 2000, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "lava_burst", abilityGameId: 51505, baseCastMs: 2000, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "elemental_blast", abilityGameId: 117014, baseCastMs: 2000, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "tempest", abilityGameId: 452201, baseCastMs: 2000, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "stormkeeper", abilityGameId: 191634, baseCastMs: 1500, rule: "HARD_CAST" },
  { simcToken: "flame_shock", abilityGameId: 470411, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "voltaic_blaze", abilityGameId: 470057, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "earth_shock", abilityGameId: 8042, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "earthquake", abilityGameId: 61882, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "earthquake", abilityGameId: 462620, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "frost_shock", abilityGameId: 196840, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "ascendance", abilityGameId: 114050, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "ascendance", abilityGameId: 1219480, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "lightning_shield", abilityGameId: 192106, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "spiritwalkers_grace", abilityGameId: 79206, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "wind_shear", abilityGameId: 57994, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "natures_swiftness", abilityGameId: 378081, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "ancestral_swiftness", abilityGameId: 443454, baseCastMs: 0, rule: "INSTANT" },
]);

const BY_ABILITY: ReadonlyMap<number, ElementalCastRow> = new Map(
  ELEMENTAL_CAST_ROWS.map((row) => [row.abilityGameId, row]),
);

/** The reviewed row of an ability, or `null` when the specialization has not reviewed it. */
export function elementalCastRowFor(abilityGameId: number): ElementalCastRow | null {
  return BY_ABILITY.get(abilityGameId) ?? null;
}
