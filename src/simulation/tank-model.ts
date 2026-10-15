/**
 * STANDARD_TANK_LOAD_V1 (M11-G3-1): the standardized incoming-damage model
 * for Blood simulations.
 *
 * This is EXPLICITLY A STANDARDIZED INPUT. It does not reconstruct the damage
 * the player actually took, and nothing may describe it as doing so. It puts
 * every Blood simulation under the same, documented load so that results are
 * comparable and Blood's damage-taken-driven mechanics are exercised at all.
 *
 * Mechanics at the pin (engine/class_modules/sc_enemy.cpp:1160-1245): the
 * target is a `tank_dummy_enemy_t` of type MYTHIC — level = max player level
 * + 3, the Mythic armor coefficient, the engine-generated Mythic tank-dummy
 * melee/spell action list, and the engine-generated `tank_heal` raid event
 * for that type. The directives are runner-owned; no caller field reaches
 * them.
 */

import type { TANK_MODELS } from "./job.js";

export type TankModelId = (typeof TANK_MODELS)[number];

/** Directives written immediately after `tank_dummy=<target>`. */
export const TANK_MODEL_DIRECTIVES: Readonly<Record<TankModelId, readonly string[]>> = {
  STANDARD_TANK_LOAD_V1: ["tank_dummy_type=mythic"],
};

export const TANK_MODEL_DISCLOSURE =
  "Incoming damage uses SimulationCraft's standardized Mythic tank dummy (STANDARD_TANK_LOAD_V1). It is a standardized input, not a reconstruction of the damage taken in the analysed fight.";
