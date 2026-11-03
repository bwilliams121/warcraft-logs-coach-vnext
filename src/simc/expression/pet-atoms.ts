/**
 * Pet-state atom bindings (ONB-S6).
 *
 * The shared pet primitive (`src/engine/game-state/pets/pet-state.ts`)
 * answers presence and instance counts. This module only turns those answers
 * into the binding a specialization resolver supplies for ITS declared atom.
 * Which atom a pet answer feeds (`pet.X.active`, a count, an aura on the pet)
 * is the specialization's decision; nothing here knows a pet or an atom name.
 *
 * The inputs are structural, so the SimulationCraft layer stays independent
 * of the engine; the engine results satisfy them as they are.
 *
 *     presence PRESENT / NOT_PRESENT   TRUTH true / false
 *     presence UNKNOWN                 no binding: the truth is enumerated
 *     count EXACT                      KNOWN_NUMBER
 *     count BOUNDED with a ceiling     ONE_OF_NUMBERS over [atLeast, atMost]
 *     count BOUNDED with no ceiling    BOUNDED_NUMBER at least `atLeast`
 *     count UNKNOWN                    UNKNOWN_NUMBER / STATE_NOT_ESTABLISHED
 *
 * An unknown is never a false and never a zero.
 */

import { boundedBelowNumber, knownNumber, oneOfNumbers, unknownNumber } from "./evaluate.js";
import type { SpecAtomBinding } from "./spec-vocabulary.js";

export type PetPresenceInput =
  { readonly state: "PRESENT" } | { readonly state: "NOT_PRESENT" } | { readonly state: "UNKNOWN" };

export type PetCountInput =
  | { readonly kind: "EXACT"; readonly value: number }
  | { readonly kind: "BOUNDED"; readonly atLeast: number; readonly atMost: number | null }
  | { readonly kind: "UNKNOWN" };

/** A TRUTH binding when presence is decided, else `null` (the atom stays unbound). */
export function petPresenceAtom(
  key: string,
  presence: PetPresenceInput,
  actionToken: string | null = null,
): SpecAtomBinding | null {
  if (presence.state === "UNKNOWN") return null;
  return { key, actionToken, value: { kind: "TRUTH", value: presence.state === "PRESENT" } };
}

export function petCountAtom(
  key: string,
  count: PetCountInput,
  actionToken: string | null = null,
): SpecAtomBinding {
  const binding =
    count.kind === "EXACT"
      ? knownNumber(count.value)
      : count.kind === "UNKNOWN"
        ? unknownNumber("STATE_NOT_ESTABLISHED")
        : count.atMost === null
          ? boundedBelowNumber(count.atLeast, "STATE_NOT_ESTABLISHED")
          : oneOfNumbers(rangeOf(count.atLeast, count.atMost), "STATE_NOT_ESTABLISHED");
  return { key, actionToken, value: { kind: "MAGNITUDE", binding } };
}

function rangeOf(from: number, to: number): number[] {
  if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from) {
    throw new Error(`petCountAtom: [${String(from)}, ${String(to)}] is not a count range`);
  }
  return Array.from({ length: to - from + 1 }, (_, index) => from + index);
}
