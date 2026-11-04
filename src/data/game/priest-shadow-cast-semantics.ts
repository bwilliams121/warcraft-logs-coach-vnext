/**
 * How each Shadow Priest action executes, as the pinned data states it (ONB-D2).
 *
 * THE INPUT THE SPECIALIZATION OWNS UNDER ONB-S4. The shared anchor knows no spell: it asks the
 * specialization which of its abilities are instant, cast-time or channelled.
 *
 * EVERY ROW IS A HAND-REVIEWED READING of `_cast_time` in the pinned sc_spell_data.inc, at the same commit
 * as every other dataset of this specialization, and of the constructor for a channel. Nothing reads this table to learn a
 * haste value: a positive base is only ever a proof that a cast has a cast time, and never a duration.
 *
 * WHICH ROWS MAY BE INSTANT, read off every priest-family effect of the pinned data with `_misc_value` P_CAST_TIME
 * (10, data_enums.hh:631) whose class mask matches each row's spell. The family holds such effects on aura subtypes 4, 77, 107 and 108, and only the 108 rows reach -100%, so no label-keyed modifier is involved:
 *
 *     Mind Blast           Shadowy Insight 375981
 *     Void Blast           Shadowy Insight 375981
 *     Vampiric Touch, Halo, Voidform   none
 *
 * A ROW THAT EXISTS IS NOT EXCLUDED BY NOT BEING NAMED. Some of these appear in neither the pinned module nor the
 * pinned talent data, but no pinned source proves them unavailable on a live character, so each keeps its execution
 * UNKNOWN on every build, and no talent reading narrows it.
 * The scope of this reading is the priest family's class masks; it says nothing of an effect outside that family.
 */

export type ShadowCastRule =
  /** A cast time of zero. No proc is involved. */
  | "INSTANT"
  /** A positive base, and no -100% cast-time row of the family matches the spell. */
  | "HARD_CAST"
  /** A positive base, and a -100% row matches, so any one execution may have been instant. */
  | "INSTANT_ROW_NOT_EXCLUDED"
  /** The constructor sets `channeled`, so its `cast` is its start. */
  | "CHANNEL";

export interface ShadowCastRow {
  readonly simcToken: string;
  readonly abilityGameId: number;
  /** `_cast_time` in the pinned sc_spell_data.inc, in milliseconds. */
  readonly baseCastMs: number;
  readonly rule: ShadowCastRule;
}

export const SHADOW_CAST_PROVENANCE = Object.freeze({
  repository: "https://github.com/simulationcraft/simc",
  commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  sourcePath: "engine/dbc/generated/sc_spell_data.inc",
  field: "spell_data_t::_cast_time (engine/dbc/spell_data.hpp)",
  clientDataWowVersion: "12.1.0.69587",
  reviewedOn: "2026-11-04",
});

export const SHADOW_CAST_ROWS: readonly ShadowCastRow[] = Object.freeze([
  { simcToken: "mind_blast", abilityGameId: 8092, baseCastMs: 1500, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "void_blast", abilityGameId: 450983, baseCastMs: 1500, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "vampiric_touch", abilityGameId: 34914, baseCastMs: 1500, rule: "HARD_CAST" },
  { simcToken: "halo", abilityGameId: 120644, baseCastMs: 1500, rule: "HARD_CAST" },
  { simcToken: "voidform", abilityGameId: 228260, baseCastMs: 1500, rule: "HARD_CAST" },
  { simcToken: "shadow_word_madness", abilityGameId: 335467, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "tentacle_slam", abilityGameId: 1227280, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "void_volley", abilityGameId: 1242173, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "shadow_word_death", abilityGameId: 32379, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "shadow_word_pain", abilityGameId: 589, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "holy_nova", abilityGameId: 132157, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "power_infusion", abilityGameId: 10060, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "desperate_prayer", abilityGameId: 19236, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "mind_flay", abilityGameId: 15407, baseCastMs: 0, rule: "CHANNEL" },
  { simcToken: "mind_flay_insanity", abilityGameId: 391403, baseCastMs: 0, rule: "CHANNEL" },
  { simcToken: "void_torrent", abilityGameId: 263165, baseCastMs: 0, rule: "CHANNEL" },
]);

const BY_ABILITY: ReadonlyMap<number, ShadowCastRow> = new Map(
  SHADOW_CAST_ROWS.map((row) => [row.abilityGameId, row]),
);

/** The reviewed row of an ability, or `null` when the specialization has not reviewed it. */
export function shadowCastRowFor(abilityGameId: number): ShadowCastRow | null {
  return BY_ABILITY.get(abilityGameId) ?? null;
}
