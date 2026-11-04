/**
 * How each Balance Druid action executes, as the pinned data states it (ONB-D2).
 *
 * THE INPUT THE SPECIALIZATION OWNS UNDER ONB-S4. The shared anchor knows no spell: it asks the
 * specialization which of its abilities are instant, cast-time or channelled.
 *
 * EVERY ROW IS A HAND-REVIEWED READING of `_cast_time` in the pinned sc_spell_data.inc, at the same commit
 * as every other dataset of this specialization, and of the constructor for a channel. Nothing reads this table to learn a
 * haste value: a positive base is only ever a proof that a cast has a cast time, and never a duration.
 *
 * WHICH ROWS MAY BE INSTANT, read off every druid-family effect of the pinned data with `_misc_value` P_CAST_TIME
 * (10, data_enums.hh:631) whose class mask matches each row's spell. The family holds such effects on aura subtypes 0, 4, 77, 108 and 275. Of the two that could reach -100%, the 108 rows are listed below, and the three 275 rows (Predatory Swiftness 69369, Nature's Swiftness 132158) match no row here:
 *
 *     Wrath                Incarnation: Tree of Life 5420, Blooming Infusion 429474, Ascendant Fires 1263363
 *     Starfire             Owlkin Frenzy 157228, Blooming Infusion 429474, Ascendant Fires 1263363
 *     New, Half, Full Moon none
 *
 * A ROW THAT EXISTS IS NOT EXCLUDED BY NOT BEING NAMED. Some of these appear in neither the pinned module nor the
 * pinned talent data, but no pinned source proves them unavailable on a live character, so each keeps its execution
 * UNKNOWN on every build, and no talent reading narrows it.
 * The scope of this reading is the druid family's class masks; it says nothing of an effect outside that family.
 */

export type BalanceCastRule =
  /** A cast time of zero. No proc is involved. */
  | "INSTANT"
  /** A positive base, and no -100% cast-time row of the family matches the spell. */
  | "HARD_CAST"
  /** A positive base, and a -100% row matches, so any one execution may have been instant. */
  | "INSTANT_ROW_NOT_EXCLUDED"
  /** The constructor sets `channeled`, so its `cast` is its start. */
  | "CHANNEL";

export interface BalanceCastRow {
  readonly simcToken: string;
  readonly abilityGameId: number;
  /** `_cast_time` in the pinned sc_spell_data.inc, in milliseconds. */
  readonly baseCastMs: number;
  readonly rule: BalanceCastRule;
}

export const BALANCE_CAST_PROVENANCE = Object.freeze({
  repository: "https://github.com/simulationcraft/simc",
  commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  sourcePath: "engine/dbc/generated/sc_spell_data.inc",
  field: "spell_data_t::_cast_time (engine/dbc/spell_data.hpp)",
  clientDataWowVersion: "12.1.0.69587",
  reviewedOn: "2026-11-04",
});

export const BALANCE_CAST_ROWS: readonly BalanceCastRow[] = Object.freeze([
  { simcToken: "wrath", abilityGameId: 190984, baseCastMs: 1500, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "starfire", abilityGameId: 194153, baseCastMs: 2250, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "new_moon", abilityGameId: 274281, baseCastMs: 1000, rule: "HARD_CAST" },
  { simcToken: "half_moon", abilityGameId: 274282, baseCastMs: 2000, rule: "HARD_CAST" },
  { simcToken: "full_moon", abilityGameId: 274283, baseCastMs: 3000, rule: "HARD_CAST" },
  { simcToken: "moonfire", abilityGameId: 8921, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "sunfire", abilityGameId: 93402, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "starsurge", abilityGameId: 78674, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "starfall", abilityGameId: 191034, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "fury_of_elune", abilityGameId: 202770, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "force_of_nature", abilityGameId: 205636, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "wild_mushroom", abilityGameId: 88747, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "eclipse", abilityGameId: 1233272, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "eclipse", abilityGameId: 1233346, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "celestial_alignment", abilityGameId: 194223, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "celestial_alignment", abilityGameId: 102560, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "convoke_the_spirits", abilityGameId: 391528, baseCastMs: 0, rule: "CHANNEL" },
]);

const BY_ABILITY: ReadonlyMap<number, BalanceCastRow> = new Map(
  BALANCE_CAST_ROWS.map((row) => [row.abilityGameId, row]),
);

/** The reviewed row of an ability, or `null` when the specialization has not reviewed it. */
export function balanceCastRowFor(abilityGameId: number): BalanceCastRow | null {
  return BY_ABILITY.get(abilityGameId) ?? null;
}
