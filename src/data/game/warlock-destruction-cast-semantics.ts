/**
 * How each Destruction Warlock action executes, as the pinned data states it (ONB-D1).
 *
 * THE INPUT THE SPECIALIZATION OWNS UNDER ONB-S4. The shared anchor knows no spell: it asks the
 * specialization which of its abilities are instant, cast-time or channelled.
 *
 * EVERY ROW IS A HAND-REVIEWED READING of `_cast_time` in the pinned sc_spell_data.inc, at the same commit
 * as every other dataset of this specialization. Nothing reads this table to learn a haste value: a positive
 * base is only ever a proof that a cast has a cast time, and never a duration.
 *
 * WHICH ROWS MAY BE INSTANT, read off every warlock-family effect of the pinned data with `_misc_value` P_CAST_TIME
 * (10, data_enums.hh:631) whose class mask matches each row's spell. The family holds such effects on aura subtypes
 * 4, 107 and 108 only, so no label-keyed modifier is involved:
 *
 *     Chaos Bolt                  281440, 364349 (-100%)
 *     Incinerate                  279673, 335004, 387385, 1244860 (-100%)
 *     Infernal Bolt               those four, and 196606, 264571, 1260279 (-100%)
 *     Ruination                   394776 (-100%)
 *     Soul Fire, Immolate, Cataclysm   none
 *
 * A ROW THAT EXISTS IS NOT EXCLUDED BY NOT BEING NAMED. Several of these appear in neither the pinned module nor the
 * pinned talent data, but no pinned source proves them unavailable on a live character, so each keeps its execution
 * UNKNOWN on every build. No talent reading narrows it: the question is not only Chaotic Inferno and Backlash.
 * The scope of this reading is the warlock family's class masks; it says nothing of an effect outside that family.
 */

export type DestructionCastRule =
  /** A cast time of zero. No proc is involved. */
  | "INSTANT"
  /** A positive base, and no -100% cast-time row of the family matches the spell. */
  | "HARD_CAST"
  /** A positive base, and a -100% row matches, so any one execution may have been instant. */
  | "INSTANT_ROW_NOT_EXCLUDED";

export interface DestructionCastRow {
  readonly simcToken: string;
  readonly abilityGameId: number;
  /** `_cast_time` in the pinned sc_spell_data.inc, in milliseconds. */
  readonly baseCastMs: number;
  readonly rule: DestructionCastRule;
}

export const DESTRUCTION_CAST_PROVENANCE = Object.freeze({
  repository: "https://github.com/simulationcraft/simc",
  commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  sourcePath: "engine/dbc/generated/sc_spell_data.inc",
  field: "spell_data_t::_cast_time (engine/dbc/spell_data.hpp)",
  clientDataWowVersion: "12.1.0.69587",
  reviewedOn: "2026-11-04",
});

export const DESTRUCTION_CAST_ROWS: readonly DestructionCastRow[] = Object.freeze([
  { simcToken: "chaos_bolt", abilityGameId: 116858, baseCastMs: 3000, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "incinerate", abilityGameId: 29722, baseCastMs: 2000, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  {
    simcToken: "infernal_bolt",
    abilityGameId: 434506,
    baseCastMs: 2000,
    rule: "INSTANT_ROW_NOT_EXCLUDED",
  },
  { simcToken: "soul_fire", abilityGameId: 6353, baseCastMs: 3000, rule: "HARD_CAST" },
  { simcToken: "immolate", abilityGameId: 348, baseCastMs: 1500, rule: "HARD_CAST" },
  { simcToken: "cataclysm", abilityGameId: 152108, baseCastMs: 2000, rule: "HARD_CAST" },
  { simcToken: "ruination", abilityGameId: 434635, baseCastMs: 1500, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "conflagrate", abilityGameId: 17962, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "shadowburn", abilityGameId: 17877, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "wither", abilityGameId: 445468, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "summon_infernal", abilityGameId: 1122, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "malevolence", abilityGameId: 442726, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "havoc", abilityGameId: 80240, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "rain_of_fire", abilityGameId: 5740, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "rain_of_fire", abilityGameId: 1214467, baseCastMs: 0, rule: "INSTANT" },
]);

const BY_ABILITY: ReadonlyMap<number, DestructionCastRow> = new Map(
  DESTRUCTION_CAST_ROWS.map((row) => [row.abilityGameId, row]),
);

/** The reviewed row of an ability, or `null` when the specialization has not reviewed it. */
export function destructionCastRowFor(abilityGameId: number): DestructionCastRow | null {
  return BY_ABILITY.get(abilityGameId) ?? null;
}
