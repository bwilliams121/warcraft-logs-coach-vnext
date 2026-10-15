/**
 * The specializations whose logged characters this runner reconstructs
 * (M11-G3-2). Composition root, like spec-bindings.ts: each specialization's
 * tree owns its binding.
 */

import type { CharacterSpecBinding } from "../src/character-profile/binding.js";
import { BLOOD_CHARACTER_BINDING } from "../src/specs/deathknight/blood/character-binding.js";

export const RUNNER_CHARACTER_BINDINGS: readonly CharacterSpecBinding[] = [BLOOD_CHARACTER_BINDING];
