/**
 * How each Demonology Warlock action executes, as the pinned data states it (ONB-X4).
 *
 * THE INPUT THE SPECIALIZATION OWNS UNDER ONB-S4. The shared anchor knows no spell: it asks the
 * specialization which of its abilities are instant, cast-time or channelled.
 *
 * EVERY ROW IS A HAND-REVIEWED READING of `_cast_time` in the pinned sc_spell_data.inc, at the same commit
 * as every other dataset of this specialization, and of the constructor for a channel. Nothing reads this table to learn a
 * haste value: a positive base is only ever a proof that a cast has a cast time, and never a duration.
 *
 * WHICH ROWS MAY BE INSTANT, read off every warlock-family effect of the pinned data with `_misc_value` P_CAST_TIME
 * (10, data_enums.hh:631) whose class mask matches each row's spell. The family holds such effects on aura subtypes 4, 107 and 108. The 4 rows carry no class mask here. The 107 row matching these spells is flat, Master Summoner -500 ms on Summon Demonic Tyrant, and does not reach its base. Of the 108 rows, Demonic Calling -50% on Call Dreadstalkers and the -30% and smaller rows on Infernal Bolt do not reach -100%. These do:
 *
 *     Shadow Bolt            Shadowy Inspiration 196606, Nightfall 264571 and 1260279
 *     Hand of Gul'dan        Blazing Meteor 394776
 *     Demonbolt              Shadowy Inspiration 196606, Demonic Core 264173
 *     Ruination              Blazing Meteor 394776
 *     Infernal Bolt          Shadowy Inspiration 196606, Nightfall 264571 and 1260279, Chaotic Inferno 279673 and 1244860, Soul Fire 335004, Backlash 387385
 *     Summon Demonic Tyrant  none
 *     Call Dreadstalkers     none, and the wire disagrees (below)
 *
 * A ROW THAT EXISTS IS NOT EXCLUDED BY NOT BEING NAMED. Several of these belong to another specialization's talents, and retained sources hold no set-bonus table, so none is proven dead. This slice narrows none of them: each keeps its execution UNKNOWN on every build (agent/follow-ups.md "After ONB-X4").
 * The scope of this reading is the warlock family's class masks; it says nothing of an effect outside that family.
 *
 * THE PINNED DATA AND THE WIRE DISAGREE ON CALL DREADSTALKERS. Its `_cast_time` is 2000 and only Demonic Calling's -50% row matches it, so the data says about a second. Of its 89 retained presses, across seven subjects, 75 log a begin within 1 ms of the completion, and the 14 of gtKb fight 22 actor 10 log no begin at all. None shows a gap. Neither source is overruled: the row claims no cast time, so the shared timeline treats every press as possibly instant.
 */

export type DemonologyCastRule =
  /** A cast time of zero. No proc is involved. */
  | "INSTANT"
  /** A positive base, and no -100% cast-time row of the family matches the spell. */
  | "HARD_CAST"
  /** A positive base, and a -100% row matches, so any one execution may have been instant. */
  | "INSTANT_ROW_NOT_EXCLUDED"
  /** A positive base and no -100% row, yet no retained press shows a gap between its begin and its completion. */
  | "WIRE_CONTRADICTS_POSITIVE_BASE";

export interface DemonologyCastRow {
  readonly simcToken: string;
  readonly abilityGameId: number;
  /** `_cast_time` in the pinned sc_spell_data.inc, in milliseconds. */
  readonly baseCastMs: number;
  readonly rule: DemonologyCastRule;
}

export const DEMONOLOGY_CAST_PROVENANCE = Object.freeze({
  repository: "https://github.com/simulationcraft/simc",
  commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  sourcePath: "engine/dbc/generated/sc_spell_data.inc",
  field: "spell_data_t::_cast_time (engine/dbc/spell_data.hpp)",
  clientDataWowVersion: "12.1.0.69587",
  reviewedOn: "2026-11-05",
});

export const DEMONOLOGY_CAST_ROWS: readonly DemonologyCastRow[] = Object.freeze([
  { simcToken: "shadow_bolt", abilityGameId: 686, baseCastMs: 2000, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "hand_of_guldan", abilityGameId: 105174, baseCastMs: 1500, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "demonbolt", abilityGameId: 264178, baseCastMs: 4500, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "ruination", abilityGameId: 434635, baseCastMs: 1500, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  { simcToken: "infernal_bolt", abilityGameId: 434506, baseCastMs: 2000, rule: "INSTANT_ROW_NOT_EXCLUDED" },
  {
    simcToken: "call_dreadstalkers",
    abilityGameId: 104316,
    baseCastMs: 2000,
    rule: "WIRE_CONTRADICTS_POSITIVE_BASE",
  },
  { simcToken: "summon_demonic_tyrant", abilityGameId: 265187, baseCastMs: 2000, rule: "HARD_CAST" },
  { simcToken: "implosion", abilityGameId: 196277, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "power_siphon", abilityGameId: 264130, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "grimoire_imp_lord", abilityGameId: 1276452, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "grimoire_fel_ravager", abilityGameId: 1276467, baseCastMs: 0, rule: "INSTANT" },
  { simcToken: "summon_doomguard", abilityGameId: 1276672, baseCastMs: 0, rule: "INSTANT" },
]);

const BY_ABILITY: ReadonlyMap<number, DemonologyCastRow> = new Map(
  DEMONOLOGY_CAST_ROWS.map((row) => [row.abilityGameId, row]),
);

/** The reviewed row of an ability, or `null` when the specialization has not reviewed it. */
export function demonologyCastRowFor(abilityGameId: number): DemonologyCastRow | null {
  return BY_ABILITY.get(abilityGameId) ?? null;
}
