/**
 * What Demonology Warlock reads from the shared pet state (ONB-X4, the first consumer of ONB-S6).
 *
 * THE SPECIALIZATION OWNS WHAT THE ANSWERS MEAN. The shared state answers "which actors are this entity" and "how many at t". This file
 * says which atom each answer feeds:
 *
 *     pet.demonic_tyrant.active    presence of `demonic_tyrant`, as a truth; an undecided presence binds nothing
 *     buff.wild_imps.stack         the count of `wild_imps`, as a stack binding; never zero by default
 *
 * ASKED AT THE ANCHOR, AND ONLY THERE. A decision's pets are the pets at the instant it was made. With no established anchor nothing is read, so
 * nothing can answer a moment nobody established, and a completion's pets are never called the decision's.
 *
 * NEITHER ANSWER IS EVER DERIVED FROM A LATER EVENT, by the shared state's own rule (O2).
 *
 * WHAT IS NOT DERIVED. A summon is not a setup verdict: `tyrant-setup` stays a recorded question, and nothing here reads what a Tyrant empowered.
 */

import {
  buildPetState,
  definePetMappingProfile,
  type PetInstanceCount,
  type PetMappingProfile,
  type PetPresence,
  type PetState,
} from "../../../engine/game-state/pets/pet-state.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import type { NumericBinding } from "../../../simc/expression/evaluate.js";
import { petCountAtom, petPresenceAtom } from "../../../simc/expression/pet-atoms.js";
import type { SpecAtomBinding } from "../../../simc/expression/spec-vocabulary.js";
import { DEMONOLOGY_PET_ROWS } from "../../../data/game/warlock-demonology-pet-semantics.js";
import { DEMONOLOGY_WARLOCK_SPEC_ID } from "./spec.js";
import { PET_DEMONIC_TYRANT_ACTIVE } from "./vocabulary.js";

const DEMONIC_TYRANT = "demonic_tyrant";
/** The module's tracking buff, and the name the pinned list reads its count by. */
export const WILD_IMPS = "wild_imps";

const PROFILE: PetMappingProfile = definePetMappingProfile(DEMONOLOGY_WARLOCK_SPEC_ID, DEMONOLOGY_PET_ROWS);

/** The reviewed profile. A build constant: a malformed one fails to load. */
export function demonologyPetProfile(): PetMappingProfile {
  return PROFILE;
}

/** The shared pet state of one actor, under this specialization's profile. */
export function demonologyPetStateOf(state: CombatState, actorId: number, profile = PROFILE): PetState {
  return buildPetState({ state, ownerActorId: actorId, profile });
}

/** What the pets answered at one decision, kept as evidence, whichever way it came out. */
export interface DemonologyPetReading {
  readonly reportTimeMs: number;
  readonly demonicTyrant: PetPresence;
  readonly wildImps: PetInstanceCount;
}

/** What one reading binds. */
export interface DemonologyPetBindings {
  /** The presence atom, or none when the presence is undecided: the truth is then enumerated. */
  readonly specAtoms: readonly SpecAtomBinding[];
  /** The stack binding, which is explicit even when unknown. */
  readonly knownBuffStacks: readonly { readonly name: string; readonly stack: NumericBinding }[];
}

export function demonologyPetReadingAt(pets: PetState, reportTimeMs: number): DemonologyPetReading {
  return {
    reportTimeMs,
    demonicTyrant: pets.presenceAt(DEMONIC_TYRANT, reportTimeMs),
    wildImps: pets.instanceCountAt(WILD_IMPS, reportTimeMs),
  };
}

export function demonologyPetBindingsOf(reading: DemonologyPetReading): DemonologyPetBindings {
  const presence = petPresenceAtom(PET_DEMONIC_TYRANT_ACTIVE, reading.demonicTyrant);
  const stack = petCountAtom(`buff.${WILD_IMPS}.stack`, reading.wildImps).value;
  if (stack.kind !== "MAGNITUDE") throw new Error("a pet count is always a magnitude");
  return {
    specAtoms: presence === null ? [] : [presence],
    knownBuffStacks: [{ name: WILD_IMPS, stack: stack.binding }],
  };
}

/** One reading as a coverage key: the answer, and why it stopped there. */
export function demonologyPetReadingKeys(reading: DemonologyPetReading): readonly string[] {
  const tyrant = reading.demonicTyrant;
  const imps = reading.wildImps;
  return [
    `${DEMONIC_TYRANT}: ${tyrant.state === "UNKNOWN" ? `UNKNOWN ${tyrant.reason}` : tyrant.state}`,
    `${WILD_IMPS}: ${imps.kind === "EXACT" ? "EXACT" : `${imps.kind} ${imps.reason}`}`,
  ];
}
