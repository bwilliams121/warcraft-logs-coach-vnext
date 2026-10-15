/**
 * Blood Death Knight's SIMULATION BINDING (M11-G3-1): what this
 * specialization means to the pinned SimulationCraft engine.
 *
 * The shared simulation runtime (`src/simulation/`) is spec-agnostic; this is
 * the only place the engine's Blood tokens live. It carries no gameplay
 * judgment — a simulated number is an input to later analysis, not a
 * decision — and the runtime never consults Blood's APL authority.
 *
 * Blood is a tank, so every Blood job runs under the standardized incoming-
 * damage model (STANDARD_TANK_LOAD_V1), which is a standardized input, never
 * a reconstruction of the damage the player took.
 */

import type { SimulationSpecBinding } from "../../../simulation/spec-binding.js";

import { BLOOD_DEATH_KNIGHT_DISPLAY_NAME, BLOOD_DEATH_KNIGHT_SPEC_ID } from "./spec.js";

export const BLOOD_SIMULATION_BINDING: SimulationSpecBinding = {
  specKey: BLOOD_DEATH_KNIGHT_SPEC_ID,
  simcClassToken: "deathknight",
  simcSpecToken: "blood",
  // engine/player/player.cpp writes `util::specialization_string(spec)`; for
  // Blood that is the roster display name.
  reportedSpecialization: BLOOD_DEATH_KNIGHT_DISPLAY_NAME,
  simcRole: "tank",
  requiresTankModel: true,
};
