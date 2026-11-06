/**
 * How each Beast Mastery Hunter action executes, as the pinned data states it (ONB-T2).
 *
 * THE INPUT THE SPECIALIZATION OWNS UNDER ONB-S4. The shared anchor knows no spell: it asks the
 * specialization which of its abilities are instant, cast-time or channelled.
 *
 * EVERY ROW IS A HAND-REVIEWED READING of `_cast_time` in the pinned sc_spell_data.inc, at the same commit
 * as every other dataset of this specialization, and of the constructor for a channel. Nothing reads this table to learn a
 * haste value: a positive base is only ever a proof that a cast has a cast time, and never a duration.
 *
 * ONE ROW HAS A POSITIVE CAST TIME, Wailing Arrow. Marksmanship's review of every hunter-family effect with `_misc_value` P_CAST_TIME (hunter-marksmanship-cast-semantics.ts) found no -100% row matching it. Cobra Shot is `_cast_time` 0, and none of the 228 Cobra Shots of the retained subjects logs a begin.
 */

export type BeastMasteryCastRule =
  /** A cast time of zero. No proc is involved. */
  | "INSTANT"
  /** A positive base, and no -100% cast-time row of the family matches the spell. */
  | "HARD_CAST"
  /** A positive base, and a -100% row matches, so any one execution may have been instant. */
  | "INSTANT_ROW_NOT_EXCLUDED"
  /** The constructor sets `channeled`, so its `cast` is its start. */
  | "CHANNEL";

export interface BeastMasteryCastRow {
  readonly simcToken: string;
  readonly abilityGameId: number;
  /** `_cast_time` in the pinned sc_spell_data.inc, in milliseconds. */
  readonly baseCastMs: number;
  readonly rule: BeastMasteryCastRule;
}

export const BEAST_MASTERY_CAST_PROVENANCE = Object.freeze({
  repository: "https://github.com/simulationcraft/simc",
  commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  sourcePath: "engine/dbc/generated/sc_spell_data.inc",
  field: "spell_data_t::_cast_time (engine/dbc/spell_data.hpp)",
  clientDataWowVersion: "12.1.0.69587",
  reviewedOn: "2026-11-06",
});

export const BEAST_MASTERY_CAST_ROWS: readonly BeastMasteryCastRow[] = Object.freeze([
  { simcToken: "wailing_arrow", abilityGameId: 392060, baseCastMs: 1000, rule: "HARD_CAST" },
  { simcToken: "barbed_shot", abilityGameId: 217200, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "bestial_wrath", abilityGameId: 19574, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "black_arrow", abilityGameId: 466930, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "cobra_shot", abilityGameId: 193455, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "kill_command", abilityGameId: 34026, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "wild_thrash", abilityGameId: 1264359, baseCastMs: 0, rule: "INSTANT" },
]);

const BY_ABILITY: ReadonlyMap<number, BeastMasteryCastRow> = new Map(
  BEAST_MASTERY_CAST_ROWS.map((row) => [row.abilityGameId, row]),
);

/** The reviewed row of an ability, or `null` when the specialization has not reviewed it. */
export function beastMasteryCastRowFor(abilityGameId: number): BeastMasteryCastRow | null {
  return BY_ABILITY.get(abilityGameId) ?? null;
}
