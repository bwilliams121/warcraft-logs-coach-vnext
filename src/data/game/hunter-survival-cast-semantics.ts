/**
 * How each Survival Hunter action executes, as the pinned data states it (ONB-T2).
 *
 * THE INPUT THE SPECIALIZATION OWNS UNDER ONB-S4. The shared anchor knows no spell: it asks the
 * specialization which of its abilities are instant, cast-time or channelled.
 *
 * EVERY ROW IS A HAND-REVIEWED READING of `_cast_time` in the pinned sc_spell_data.inc, at the same commit
 * as every other dataset of this specialization, and of the constructor for a channel. Nothing reads this table to learn a
 * haste value: a positive base is only ever a proof that a cast has a cast time, and never a duration.
 *
 * EVERY ROW IS INSTANT OR A CHANNEL. No press of this list has a positive `_cast_time`, so this table claims no cast time at all, and no -100% cast-time row can change a row's reading. Boomstick is the one channel, by its constructor.
 */

export type SurvivalCastRule =
  /** A cast time of zero. No proc is involved. */
  | "INSTANT"
  /** A positive base, and no -100% cast-time row of the family matches the spell. */
  | "HARD_CAST"
  /** A positive base, and a -100% row matches, so any one execution may have been instant. */
  | "INSTANT_ROW_NOT_EXCLUDED"
  /** The constructor sets `channeled`, so its `cast` is its start. */
  | "CHANNEL";

export interface SurvivalCastRow {
  readonly simcToken: string;
  readonly abilityGameId: number;
  /** `_cast_time` in the pinned sc_spell_data.inc, in milliseconds. */
  readonly baseCastMs: number;
  readonly rule: SurvivalCastRule;
}

export const SURVIVAL_CAST_PROVENANCE = Object.freeze({
  repository: "https://github.com/simulationcraft/simc",
  commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  sourcePath: "engine/dbc/generated/sc_spell_data.inc",
  field: "spell_data_t::_cast_time (engine/dbc/spell_data.hpp)",
  clientDataWowVersion: "12.1.0.69587",
  reviewedOn: "2026-11-06",
});

export const SURVIVAL_CAST_ROWS: readonly SurvivalCastRow[] = Object.freeze([
  { simcToken: "aspect_of_the_eagle", abilityGameId: 186289, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "kill_command", abilityGameId: 259489, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "moonlight_chakram", abilityGameId: 1264949, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "muzzle", abilityGameId: 187707, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "raptor_strike", abilityGameId: 186270, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "takedown", abilityGameId: 1250646, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "wildfire_bomb", abilityGameId: 259495, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "boomstick", abilityGameId: 1261193, baseCastMs: 0, rule: "CHANNEL" },
]);

const BY_ABILITY: ReadonlyMap<number, SurvivalCastRow> = new Map(
  SURVIVAL_CAST_ROWS.map((row) => [row.abilityGameId, row]),
);

/** The reviewed row of an ability, or `null` when the specialization has not reviewed it. */
export function survivalCastRowFor(abilityGameId: number): SurvivalCastRow | null {
  return BY_ABILITY.get(abilityGameId) ?? null;
}
