/**
 * How each Guardian Druid action executes, as the pinned data states it (ONB-T2).
 *
 * THE INPUT THE SPECIALIZATION OWNS UNDER ONB-S4. The shared anchor knows no spell: it asks the
 * specialization which of its abilities are instant, cast-time or channelled.
 *
 * EVERY ROW IS A HAND-REVIEWED READING of `_cast_time` in the pinned sc_spell_data.inc, at the same commit
 * as every other dataset of this specialization, and of the constructor for a channel. Nothing reads this table to learn a
 * haste value: a positive base is only ever a proof that a cast has a cast time, and never a duration.
 *
 * EVERY ROW IS INSTANT OR A CHANNEL. No press of this list has a positive `_cast_time`, so this table claims no cast time at all, and no -100% cast-time row can change a row's reading. Convoke the Spirits is the one channel, by its constructor.
 */

export type GuardianCastRule =
  /** A cast time of zero. No proc is involved. */
  | "INSTANT"
  /** A positive base, and no -100% cast-time row of the family matches the spell. */
  | "HARD_CAST"
  /** A positive base, and a -100% row matches, so any one execution may have been instant. */
  | "INSTANT_ROW_NOT_EXCLUDED"
  /** The constructor sets `channeled`, so its `cast` is its start. */
  | "CHANNEL";

export interface GuardianCastRow {
  readonly simcToken: string;
  readonly abilityGameId: number;
  /** `_cast_time` in the pinned sc_spell_data.inc, in milliseconds. */
  readonly baseCastMs: number;
  readonly rule: GuardianCastRule;
}

export const GUARDIAN_CAST_PROVENANCE = Object.freeze({
  repository: "https://github.com/simulationcraft/simc",
  commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  sourcePath: "engine/dbc/generated/sc_spell_data.inc",
  field: "spell_data_t::_cast_time (engine/dbc/spell_data.hpp)",
  clientDataWowVersion: "12.1.0.69587",
  reviewedOn: "2026-11-06",
});

export const GUARDIAN_CAST_ROWS: readonly GuardianCastRow[] = Object.freeze([
  { simcToken: "barkskin", abilityGameId: 22812, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "bear_form", abilityGameId: 5487, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "berserk", abilityGameId: 50334, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "berserk", abilityGameId: 102558, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "bristling_fur", abilityGameId: 155835, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "cat_form", abilityGameId: 768, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "ferocious_bite", abilityGameId: 22568, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "heart_of_the_wild", abilityGameId: 1261867, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "ironfur", abilityGameId: 192081, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "lunar_beam", abilityGameId: 204066, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "mangle", abilityGameId: 33917, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "maul", abilityGameId: 6807, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "maul", abilityGameId: 400254, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "moonfire", abilityGameId: 8921, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "moonkin_form", abilityGameId: 24858, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "moonkin_form", abilityGameId: 197625, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "rake", abilityGameId: 1822, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "red_moon", abilityGameId: 1252871, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "rip", abilityGameId: 1079, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "shred", abilityGameId: 5221, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "sundering_roar", abilityGameId: 1253799, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "swipe_bear", abilityGameId: 213771, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "thrash", abilityGameId: 77758, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "convoke_the_spirits", abilityGameId: 391528, baseCastMs: 0, rule: "CHANNEL" },
]);

const BY_ABILITY: ReadonlyMap<number, GuardianCastRow> = new Map(
  GUARDIAN_CAST_ROWS.map((row) => [row.abilityGameId, row]),
);

/** The reviewed row of an ability, or `null` when the specialization has not reviewed it. */
export function guardianCastRowFor(abilityGameId: number): GuardianCastRow | null {
  return BY_ABILITY.get(abilityGameId) ?? null;
}
