/**
 * What the pinned data and the retained wire prove about the pets the Unholy Death Knight list reads (ONB-X5).
 *
 * THE LIFETIMES ARE ABSENCE CLAIMS' INPUTS, and a guessed bound is worse than none, so each one is stated with what it rests on, and a
 * bound nothing proves is `null`. Not one of these rows proves a floor or a ceiling, so no answer here is PRESENT or NOT_PRESENT.
 *
 * THE LORD OF THE DEAD, `pet.lord_of_the_dead.active`.
 *
 *   gameID    264321: 1292072's summon effect and the pet's own `npc_id` (sc_death_knight.cpp:4629). Every retained summon of actor 18 reads it.
 *   minimum   none. Nothing proves an encounter cannot kill one or that it outlives its owner.
 *   maximum   none. The spawner's default is Lord of the Dead's second effect, 15,000 ms (:14702), and 1292072's own duration is 20,000 ms. Of the 13 retained summons, the 12 that end inside the capture log a death 15,021 to 16,173 ms later, and completed casts run to 15,349 ms and begins to 15,494 ms, so the pinned 15,000 ms is contradicted by the wire. Dead actors can source delayed damage (M11-ED), so those numbers bound nothing either, and no ceiling is claimed.
 *   start     all 13 retained instances have their `summon`, and the module spawns one only from `summon_lotd_t` (:6824).
 *
 * THE ARMY GHOULS, `pet.army_ghoul.active`, AND EVERY OTHER LESSER GHOUL.
 *
 *   gameID    237409 for both. Army of the Dead's 1294026 and the ordinary 275430 each summon it, and the retained actor 90 takes summons by 275430, 1282535, 1294026 and 1294029, the middle two not named by the pinned data at all.
 *   So the log cannot say which ghoul is the army's. `lesser_ghoul` is declared, though the list never reads it, so the shared state reports the pair as AMBIGUOUS. Mapping `army_ghoul` alone would call every ordinary ghoul an army.
 *
 * THE GARGOYLE, `pet.gargoyle.active`.
 *
 *   gameID    27829: 49206's summon effect. No retained fight's catalog holds that actor, so nothing corroborates it.
 *   minimum, maximum, start  none. 49206's duration is 25,000 ms, but Army of the Dead spawns one for a shorter time (:8993), and no retained summon exists to read.
 *
 * EVERYTHING ELSE IS NOT READ. The list reads no other pet, so the ghoul, the magi, the Abomination and the Riders are unclassified owned actors: disclosed by the shared state, never assigned.
 *
 * Not a claim about any other pin, and no later data is assumed to agree (agent/follow-ups.md "After ONB-X5").
 */

export interface UnholyDeathKnightPetRow {
  readonly simcName: string;
  readonly wclGameIds: readonly number[];
  readonly minLifetimeMs: number | null;
  readonly maxLifetimeMs: number | null;
  readonly instancesBeginWithSummon: boolean;
  readonly provenance: string;
}

export const UNHOLY_DEATH_KNIGHT_PET_PROVENANCE = Object.freeze({
  repository: "https://github.com/simulationcraft/simc",
  commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
  sourcePaths: ["engine/dbc/generated/sc_spell_data.inc", "engine/class_modules/sc_death_knight.cpp"],
  clientDataWowVersion: "12.1.0.69587",
  wireEvidence: "rXAfw9t1q8YpmkKD fight 13 actor 18 (first 165 s), uncommitted",
  reviewedOn: "2026-11-05",
});

export const UNHOLY_DEATH_KNIGHT_PET_ROWS: readonly UnholyDeathKnightPetRow[] = Object.freeze([
  {
    simcName: "lord_of_the_dead",
    wclGameIds: [264321],
    minLifetimeMs: null,
    maxLifetimeMs: null,
    instancesBeginWithSummon: true,
    provenance:
      "1292072's summon effect and the pet's npc_id; no floor or ceiling: retained casts outlast the pinned 15,000 ms (deathknight-unholy-pet-semantics.ts)",
  },
  {
    simcName: "army_ghoul",
    wclGameIds: [237409],
    minLifetimeMs: null,
    maxLifetimeMs: null,
    instancesBeginWithSummon: false,
    provenance:
      "1294026's summon effect; the same gameID as every other lesser ghoul, so AMBIGUOUS (deathknight-unholy-pet-semantics.ts)",
  },
  {
    simcName: "lesser_ghoul",
    wclGameIds: [237409],
    minLifetimeMs: null,
    maxLifetimeMs: null,
    instancesBeginWithSummon: false,
    provenance:
      "275430's summon effect. Never read by the list: declared so the shared gameID is reported, not guessed at (deathknight-unholy-pet-semantics.ts)",
  },
  {
    simcName: "gargoyle",
    wclGameIds: [27829],
    minLifetimeMs: null,
    maxLifetimeMs: null,
    instancesBeginWithSummon: false,
    provenance:
      "49206's summon effect, uncorroborated: no retained catalog holds the actor (deathknight-unholy-pet-semantics.ts)",
  },
]);
