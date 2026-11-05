/**
 * What Unholy Death Knight reads from the shared pet state (ONB-X5, a consumer of ONB-S6).
 *
 * THE SPECIALIZATION OWNS WHAT THE ANSWERS MEAN. The shared state answers "which actors are this entity" and "was one up at t". This file
 * says which atom each answer feeds:
 *
 *     pet.army_ghoul.active          presence of `army_ghoul`, as a truth
 *     pet.gargoyle.active            presence of `gargoyle`, as a truth
 *     pet.lord_of_the_dead.active    presence of `lord_of_the_dead`, as a truth
 *
 * An undecided presence binds nothing, so the truth is enumerated, never false.
 *
 * ASKED AT THE DECISION'S OWN CAST. Every press this list names has a pinned cast time of zero (`observed-analysis.ts`), so a decision's
 * instant is its cast. A decision's pets are the pets at that instant.
 *
 * NEITHER ANSWER IS EVER DERIVED FROM A LATER EVENT, by the shared state's own rule (O2).
 *
 * WHAT IS NOT DERIVED. `pet.lord_of_the_dead.remains` stays unbound: no row proves a life's bounds. The count of ghouls is not read by the list.
 */

import {
  buildPetState,
  definePetMappingProfile,
  type PetMappingProfile,
  type PetPresence,
  type PetState,
} from "../../../engine/game-state/pets/pet-state.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import { petPresenceAtom } from "../../../simc/expression/pet-atoms.js";
import type { SpecAtomBinding } from "../../../simc/expression/spec-vocabulary.js";
import { UNHOLY_DEATH_KNIGHT_PET_ROWS } from "../../../data/game/deathknight-unholy-pet-semantics.js";
import { UNHOLY_DEATH_KNIGHT_SPEC_ID } from "./spec.js";
import { PET_ARMY_GHOUL_ACTIVE, PET_GARGOYLE_ACTIVE, PET_LORD_OF_THE_DEAD_ACTIVE } from "./vocabulary.js";

const ARMY_GHOUL = "army_ghoul";
const GARGOYLE = "gargoyle";
const LORD_OF_THE_DEAD = "lord_of_the_dead";

const PROFILE: PetMappingProfile = definePetMappingProfile(
  UNHOLY_DEATH_KNIGHT_SPEC_ID,
  UNHOLY_DEATH_KNIGHT_PET_ROWS,
);

/** The reviewed profile. A build constant: a malformed one fails to load. */
export function unholyDeathKnightPetProfile(): PetMappingProfile {
  return PROFILE;
}

/** The shared pet state of one actor, under this specialization's profile. */
export function unholyDeathKnightPetStateOf(
  state: CombatState,
  actorId: number,
  profile = PROFILE,
): PetState {
  return buildPetState({ state, ownerActorId: actorId, profile });
}

/** What the pets answered at one decision, kept as evidence, whichever way it came out. */
export interface UnholyDeathKnightPetReading {
  readonly reportTimeMs: number;
  readonly armyGhoul: PetPresence;
  readonly gargoyle: PetPresence;
  readonly lordOfTheDead: PetPresence;
}

export function unholyDeathKnightPetReadingAt(
  pets: PetState,
  reportTimeMs: number,
): UnholyDeathKnightPetReading {
  return {
    reportTimeMs,
    armyGhoul: pets.presenceAt(ARMY_GHOUL, reportTimeMs),
    gargoyle: pets.presenceAt(GARGOYLE, reportTimeMs),
    lordOfTheDead: pets.presenceAt(LORD_OF_THE_DEAD, reportTimeMs),
  };
}

/** What one reading binds: a truth per decided presence, and nothing for an undecided one. */
export function unholyDeathKnightPetAtomsOf(
  reading: UnholyDeathKnightPetReading,
): readonly SpecAtomBinding[] {
  return [
    petPresenceAtom(PET_ARMY_GHOUL_ACTIVE, reading.armyGhoul),
    petPresenceAtom(PET_GARGOYLE_ACTIVE, reading.gargoyle),
    petPresenceAtom(PET_LORD_OF_THE_DEAD_ACTIVE, reading.lordOfTheDead),
  ].filter((atom): atom is SpecAtomBinding => atom !== null);
}

/** One reading as coverage keys: the answer, and why it stopped there. */
export function unholyDeathKnightPetReadingKeys(reading: UnholyDeathKnightPetReading): readonly string[] {
  const key = (name: string, presence: PetPresence): string =>
    `${name}: ${presence.state === "UNKNOWN" ? `UNKNOWN ${presence.reason}` : presence.state}`;
  return [
    key(ARMY_GHOUL, reading.armyGhoul),
    key(GARGOYLE, reading.gargoyle),
    key(LORD_OF_THE_DEAD, reading.lordOfTheDead),
  ];
}
