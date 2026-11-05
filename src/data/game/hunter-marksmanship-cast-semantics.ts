/**
 * How each Marksmanship Hunter action executes, as the pinned data states it (ONB-D4).
 *
 * THE INPUT THE SPECIALIZATION OWNS UNDER ONB-S4. The shared anchor knows no spell: it asks the
 * specialization which of its abilities are instant, cast-time or channelled.
 *
 * EVERY ROW IS A HAND-REVIEWED READING of `_cast_time` in the pinned sc_spell_data.inc, at the same commit
 * as every other dataset of this specialization, and of the constructor for a channel. Nothing reads this table to learn a
 * haste value: a positive base is only ever a proof that a cast has a cast time, and never a duration.
 *
 * WHICH ROWS MAY BE INSTANT, read off every hunter-family effect of the pinned data with `_misc_value` P_CAST_TIME
 * (10, data_enums.hh:631) whose class mask matches each row's spell. The family holds such effects on aura subtype 108 only: three rows. Trueshot's has a value of 0 and Streamline's is -20%, so one reaches -100%:
 *
 *     Aimed Shot             Lock and Load 194594
 *     Steady Shot, Wailing Arrow   none
 *
 * A ROW THAT EXISTS IS NOT NARROWED HERE. Lock and Load is a talent's effect, so a later slice could prove it not taken on a build. This slice makes no such
 * reading: Aimed Shot keeps its execution UNKNOWN on every build (agent/follow-ups.md "After ONB-D4").
 * The scope of this reading is the hunter family's class masks; it says nothing of an effect outside that family.
 */

export type MarksmanshipCastRule =
  /** A cast time of zero. No proc is involved. */
  | "INSTANT"
  /** A positive base, and no -100% cast-time row of the family matches the spell. */
  | "HARD_CAST"
  /** A positive base, and a -100% row matches, so any one execution may have been instant. */
  | "INSTANT_ROW_NOT_EXCLUDED"
  /** The constructor sets `channeled`, so its `cast` is its start. */
  | "CHANNEL";

export interface MarksmanshipCastRow {
  readonly simcToken: string;
  readonly abilityGameId: number;
  /** `_cast_time` in the pinned sc_spell_data.inc, in milliseconds. */
  readonly baseCastMs: number;
  readonly rule: MarksmanshipCastRule;
}

export const MARKSMANSHIP_CAST_PROVENANCE = Object.freeze({
  repository: "https://github.com/simulationcraft/simc",
  commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  sourcePath: "engine/dbc/generated/sc_spell_data.inc",
  field: "spell_data_t::_cast_time (engine/dbc/spell_data.hpp)",
  clientDataWowVersion: "12.1.0.69587",
  reviewedOn: "2026-11-04",
});

export const MARKSMANSHIP_CAST_ROWS: readonly MarksmanshipCastRow[] = Object.freeze([
  { simcToken: "aimed_shot", abilityGameId: 19434, baseCastMs: 2500, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "steady_shot", abilityGameId: 56641, baseCastMs: 1700, rule: "HARD_CAST" },
  { simcToken: "wailing_arrow", abilityGameId: 392060, baseCastMs: 1000, rule: "HARD_CAST" },
  { simcToken: "arcane_shot", abilityGameId: 185358, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "black_arrow", abilityGameId: 466930, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "explosive_shot", abilityGameId: 212431, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "kill_shot", abilityGameId: 53351, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "moonlight_chakram", abilityGameId: 1264949, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "multishot", abilityGameId: 257620, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "trueshot", abilityGameId: 288613, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "volley", abilityGameId: 260243, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "rapid_fire", abilityGameId: 257044, baseCastMs: 0, rule: "CHANNEL" },
]);

const BY_ABILITY: ReadonlyMap<number, MarksmanshipCastRow> = new Map(
  MARKSMANSHIP_CAST_ROWS.map((row) => [row.abilityGameId, row]),
);

/** The reviewed row of an ability, or `null` when the specialization has not reviewed it. */
export function marksmanshipCastRowFor(abilityGameId: number): MarksmanshipCastRow | null {
  return BY_ABILITY.get(abilityGameId) ?? null;
}
