/**
 * How each Affliction Warlock action executes, as the pinned data states it (ONB-D4).
 *
 * THE INPUT THE SPECIALIZATION OWNS UNDER ONB-S4. The shared anchor knows no spell: it asks the
 * specialization which of its abilities are instant, cast-time or channelled.
 *
 * EVERY ROW IS A HAND-REVIEWED READING of `_cast_time` in the pinned sc_spell_data.inc, at the same commit
 * as every other dataset of this specialization, and of the constructor for a channel. Nothing reads this table to learn a
 * haste value: a positive base is only ever a proof that a cast has a cast time, and never a duration.
 *
 * WHICH ROWS MAY BE INSTANT, read off every warlock-family effect of the pinned data with `_misc_value` P_CAST_TIME
 * (10, data_enums.hh:631) whose class mask matches each row's spell. The family holds such effects on aura subtypes 4, 107 and 108. The 4 rows carry no class mask here. The 107 rows matching these spells are flat, Improved Haunt -300 ms, Seeds of Destruction -200 ms and Xavius' Gambit -150 ms, and none reaches its spell's base. Of the 108 rows, Improved Shadow Bolt -15% and Rune of Shadows -10% do not reach -100%. These do:
 *
 *     Shadow Bolt            Shadowy Inspiration 196606, Nightfall 264571 and 1260279
 *     Seed of Corruption     Shard Instability 1260269, Nightfall 1260279
 *     Unstable Affliction    Shard Instability 1260269
 *     Haunt                  none
 *
 * A ROW THAT EXISTS IS NOT EXCLUDED BY NOT BEING NAMED. Shadowy Inspiration is in neither the pinned module nor the pinned talent data, and Nightfall and Shard Instability are
 * effects of talents a later slice could read. This slice narrows none of them: each keeps its execution UNKNOWN on every build (agent/follow-ups.md "After ONB-D4").
 * The scope of this reading is the warlock family's class masks; it says nothing of an effect outside that family.
 */

export type AfflictionCastRule =
  /** A cast time of zero. No proc is involved. */
  | "INSTANT"
  /** A positive base, and no -100% cast-time row of the family matches the spell. */
  | "HARD_CAST"
  /** A positive base, and a -100% row matches, so any one execution may have been instant. */
  | "INSTANT_ROW_NOT_EXCLUDED"
  /** The constructor sets `channeled`, so its `cast` is its start. */
  | "CHANNEL";

export interface AfflictionCastRow {
  readonly simcToken: string;
  readonly abilityGameId: number;
  /** `_cast_time` in the pinned sc_spell_data.inc, in milliseconds. */
  readonly baseCastMs: number;
  readonly rule: AfflictionCastRule;
}

export const AFFLICTION_CAST_PROVENANCE = Object.freeze({
  repository: "https://github.com/simulationcraft/simc",
  commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  sourcePath: "engine/dbc/generated/sc_spell_data.inc",
  field: "spell_data_t::_cast_time (engine/dbc/spell_data.hpp)",
  clientDataWowVersion: "12.1.0.69587",
  reviewedOn: "2026-11-04",
});

export const AFFLICTION_CAST_ROWS: readonly AfflictionCastRow[] = Object.freeze([
  { simcToken: "shadow_bolt", abilityGameId: 686, baseCastMs: 2000, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  {
    simcToken: "seed_of_corruption",
    abilityGameId: 27243,
    baseCastMs: 2000,
    rule: "INSTANT_ROW_NOT_EXCLUDED",
  },
  {
    simcToken: "unstable_affliction",
    abilityGameId: 1259790,
    baseCastMs: 1500,
    rule: "INSTANT_ROW_NOT_EXCLUDED",
  },
  { simcToken: "haunt", abilityGameId: 48181, baseCastMs: 1500, rule: "HARD_CAST" },
  { simcToken: "agony", abilityGameId: 980, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "corruption", abilityGameId: 172, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "malevolence", abilityGameId: 442726, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "summon_darkglare", abilityGameId: 205180, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "wither", abilityGameId: 445468, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "dark_harvest", abilityGameId: 1257052, baseCastMs: 0, rule: "CHANNEL" },
  { simcToken: "drain_soul", abilityGameId: 198590, baseCastMs: 0, rule: "CHANNEL" },
  { simcToken: "malefic_grasp", abilityGameId: 1261153, baseCastMs: 0, rule: "CHANNEL" },
]);

const BY_ABILITY: ReadonlyMap<number, AfflictionCastRow> = new Map(
  AFFLICTION_CAST_ROWS.map((row) => [row.abilityGameId, row]),
);

/** The reviewed row of an ability, or `null` when the specialization has not reviewed it. */
export function afflictionCastRowFor(abilityGameId: number): AfflictionCastRow | null {
  return BY_ABILITY.get(abilityGameId) ?? null;
}
