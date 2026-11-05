/**
 * How each Devastation Evoker action executes, as the pinned data states it (ONB-X2).
 *
 * THE INPUT THE SPECIALIZATION OWNS UNDER ONB-S4. The shared anchor knows no spell: it asks the
 * specialization which of its abilities are instant, cast-time or channelled.
 *
 * EVERY ROW IS A HAND-REVIEWED READING of `_cast_time` in the pinned sc_spell_data.inc, at the same commit
 * as every other dataset of this specialization, and of the constructor for a channel. Nothing reads this table to learn a
 * haste value: a positive base is only ever a proof that a cast has a cast time, and never a duration.
 *
 * AN EMPOWERED SPELL IS A CHANNEL HERE, AND THAT IS THE REVIEW. `empowered_charge_t` sets `channeled = true` (sc_evoker.cpp:3519), and the wire agrees on all three retained subjects: `empowerstart` and
 * `cast` in one millisecond, or one apart, and `empowerend` at the release, from 485 to 2,340 ms later, carrying `empowermentLevel`. Tip the Scales gives a `cast` alone: the 8 empowered casts with no `empowerstart` beside them each follow one of the 8 Tip the Scales presses, by 177 to 951 ms. So the `cast` is the start, which is what the shared
 * CHANNEL kind says of a channel's `cast`, whether the hold was long, short or none at all. The moment of the decision does not depend on the hold, so no empowered kind is added to the shared anchor.
 * What the kind does not say is the rank. The rank is the question `empower_to` asks, this table does not answer it, and nothing reads `empowerend`.
 *
 * WHICH ROWS MAY BE INSTANT, read off every evoker-family effect of the pinned data with `_misc_value` P_CAST_TIME
 * (10, data_enums.hh:631) whose class mask matches each row's spell. The family holds such effects on aura subtypes 0, 107, 108, 218 and 232. Of the rows matching Living Flame, the one row with a positive base, the subtype 107 rows are
 * flat milliseconds (Engulfing Blaze -300, Chronal Dynamo -200) and Ancient Flame's is -40%. These reach -100%:
 *
 *     Living Flame         Burnout 375802, Lifespark 394552 and 443176
 *
 * A ROW THAT EXISTS IS NOT NARROWED HERE. Each of these is a talent or hero-talent effect, so a later slice could prove one not taken on a
 * build. This slice makes no such reading: Living Flame keeps its execution UNKNOWN on every build (agent/follow-ups.md "After ONB-X2").
 * The scope of this reading is the evoker family's class masks; it says nothing of an effect outside that family.
 */

export type DevastationCastRule =
  /** A cast time of zero. No proc is involved. */
  | "INSTANT"
  /** A positive base, and no -100% cast-time row of the family matches the spell. */
  | "HARD_CAST"
  /** A positive base, and a -100% row matches, so any one execution may have been instant. */
  | "INSTANT_ROW_NOT_EXCLUDED"
  /** The constructor sets `channeled`, so its `cast` is its start. */
  | "CHANNEL"
  /** The empowered charge sets `channeled`, so its `cast` is its start, and a Tip the Scales press is a `cast` alone at the same moment. */
  | "EMPOWERED";

export interface DevastationCastRow {
  readonly simcToken: string;
  readonly abilityGameId: number;
  /** `_cast_time` in the pinned sc_spell_data.inc, in milliseconds. */
  readonly baseCastMs: number;
  readonly rule: DevastationCastRule;
}

export const DEVASTATION_CAST_PROVENANCE = Object.freeze({
  repository: "https://github.com/simulationcraft/simc",
  commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  sourcePath: "engine/dbc/generated/sc_spell_data.inc",
  field: "spell_data_t::_cast_time (engine/dbc/spell_data.hpp)",
  clientDataWowVersion: "12.1.0.69587",
  reviewedOn: "2026-11-04",
});

export const DEVASTATION_CAST_ROWS: readonly DevastationCastRow[] = Object.freeze([
  { simcToken: "living_flame", abilityGameId: 361469, baseCastMs: 2000, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "azure_strike", abilityGameId: 362969, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "azure_sweep", abilityGameId: 1265872, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "dragonrage", abilityGameId: 375087, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "emerald_blossom", abilityGameId: 355913, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "hover", abilityGameId: 358267, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "pyre", abilityGameId: 357211, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "quell", abilityGameId: 351338, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "tip_the_scales", abilityGameId: 370553, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "unbound_flame", abilityGameId: 1292321, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "verdant_embrace", abilityGameId: 360995, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "deep_breath", abilityGameId: 357210, baseCastMs: 0, rule: "CHANNEL" },
  { simcToken: "deep_breath", abilityGameId: 433874, baseCastMs: 0, rule: "CHANNEL" },
  { simcToken: "disintegrate", abilityGameId: 356995, baseCastMs: 0, rule: "CHANNEL" },
  { simcToken: "eternity_surge", abilityGameId: 359073, baseCastMs: 0, rule: "EMPOWERED" },
  { simcToken: "eternity_surge", abilityGameId: 382411, baseCastMs: 0, rule: "EMPOWERED" },
  { simcToken: "fire_breath", abilityGameId: 357208, baseCastMs: 0, rule: "EMPOWERED" },
  { simcToken: "fire_breath", abilityGameId: 382266, baseCastMs: 0, rule: "EMPOWERED" },
]);

const BY_ABILITY: ReadonlyMap<number, DevastationCastRow> = new Map(
  DEVASTATION_CAST_ROWS.map((row) => [row.abilityGameId, row]),
);

/** The reviewed row of an ability, or `null` when the specialization has not reviewed it. */
export function devastationCastRowFor(abilityGameId: number): DevastationCastRow | null {
  return BY_ABILITY.get(abilityGameId) ?? null;
}
