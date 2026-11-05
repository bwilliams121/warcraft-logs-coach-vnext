/**
 * What the pinned data and the retained wire prove about the two pets the Demonology Warlock list reads (ONB-X4).
 *
 * THE FIRST REVIEWED PET ROWS OF ONB-S6. The lifetimes are absence claims' inputs, and a guessed bound is worse than none, so
 * each one is stated with what it rests on, and a bound nothing proves is `null`.
 *
 * THE DEMONIC TYRANT, `pet.demonic_tyrant.active`.
 *
 *   gameIDs   135002 and 250289: Summon Demonic Tyrant 265187's two summon effects, read by Antoran Armaments (sc_warlock_pets.cpp:1513). Every retained Tyrant is 250289.
 *   minimum   none. `spawn( data().duration() + gauss<380, 220>() )` (sc_warlock_actions.cpp:3583-3584) is a distribution, not a floor, and nothing proves an encounter cannot kill one or that it outlives its owner.
 *   maximum   none. 265187's duration is 15,000 ms and the spawn adds that distribution. Of the 32 retained Tyrants, 31 source events 18,941 to 20,622 ms after their summon and one 11,252 ms. Dead actors can source delayed damage (M11-ED), so those numbers bound nothing either, and no ceiling is claimed.
 *   start     every retained press has its `summon`, the module spawns one only from this action, and no retained Tyrant key sources a cast before one.
 *
 * THE WILD IMPS, `buff.wild_imps.stack`, the module's own count of the live pool (sc_warlock_pets.cpp:921, :945).
 *
 *   gameIDs   55659 (104317, Hand of Gul'dan) and 143622 (279910, the other sources), one spawner (sc_warlock_actions.cpp:2567).
 *   minimum   none. An imp ends early by Implosion, by Power Siphon, and on running out of energy.
 *   maximum   40,000 ms, the longer of the two spells' durations (104317 is 40,000, 279910 is 20,000). The spawner takes that duration and the module never reschedules an imp, unlike a Dreadstalker (:3597). The longest retained gap from a summon to a cast of the same key is 15,009 ms.
 *   start     every retained imp cast follows a `summon` of its key, except casts in the first 9 s of each pull. Those are imps summoned before it, whose `summon` is outside the capture, and the shared state already refuses absence and ceilings while one could still be alive.
 *
 * EVERYTHING ELSE IS NOT READ. The list reads no other pet, so Dreadstalkers, the rituals' demons, the grimoires' and the permanent pet are unclassified owned actors: disclosed by the shared state, never assigned.
 *
 * Not a claim about any other pin, and no later data is assumed to agree (agent/follow-ups.md "After ONB-X4").
 */

export interface DemonologyPetRow {
  readonly simcName: string;
  readonly wclGameIds: readonly number[];
  readonly minLifetimeMs: number | null;
  readonly maxLifetimeMs: number | null;
  readonly instancesBeginWithSummon: boolean;
  readonly provenance: string;
}

export const DEMONOLOGY_PET_PROVENANCE = Object.freeze({
  repository: "https://github.com/simulationcraft/simc",
  commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  sourcePaths: [
    "engine/dbc/generated/sc_spell_data.inc",
    "engine/class_modules/warlock/sc_warlock_actions.cpp",
    "engine/class_modules/warlock/sc_warlock_pets.cpp",
  ],
  clientDataWowVersion: "12.1.0.69587",
  wireEvidence:
    "b1PmaKrd6CDfzngc fight 48, gtKb2xHn87pNcFfW fight 22, rXAfw9t1q8YpmkKD fight 13 (first 165 s), uncommitted",
  reviewedOn: "2026-11-05",
});

export const DEMONOLOGY_PET_ROWS: readonly DemonologyPetRow[] = Object.freeze([
  {
    simcName: "demonic_tyrant",
    wclGameIds: [135002, 250289],
    minLifetimeMs: null,
    maxLifetimeMs: null,
    instancesBeginWithSummon: true,
    provenance:
      "265187's summon effects; no floor or ceiling: the spawn adds a distribution, and retained Tyrants outlast the pinned 15,000 ms (warlock-demonology-pet-semantics.ts)",
  },
  {
    simcName: "wild_imps",
    wclGameIds: [55659, 143622],
    minLifetimeMs: null,
    maxLifetimeMs: 40000,
    instancesBeginWithSummon: true,
    provenance:
      "104317's and 279910's summon effects and durations, one spawner, never rescheduled; no floor: Implosion, Power Siphon and energy end an imp early (warlock-demonology-pet-semantics.ts)",
  },
]);
