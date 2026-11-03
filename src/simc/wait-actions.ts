/**
 * The tokens of SimulationCraft's waiting actions (ONB-S5).
 *
 * Built by name in `player_t::create_action` (engine/player/player.cpp:
 * 11115-11126 at 33622e9d1662ff0e451691edf85a6b49cc9d11d9). There is no
 * `wait_for` token at the pinned commit. Kept apart from `pooling.ts`, which
 * holds their semantics, so the single-list walker can recognise them without
 * importing the module that imports it.
 */

export type WaitActionKind = "POOL_RESOURCE" | "WAIT" | "WAIT_UNTIL_READY" | "WAIT_FOR_COOLDOWN";

export const WAIT_ACTION_KINDS = [
  "POOL_RESOURCE",
  "WAIT",
  "WAIT_UNTIL_READY",
  "WAIT_FOR_COOLDOWN",
] as const satisfies readonly WaitActionKind[];

/** The waiting action an APL token denotes, or `null`. Keyed on the token alone, as SimulationCraft builds it. */
export function waitActionOf(actionToken: string): WaitActionKind | null {
  if (actionToken === "pool_resource") return "POOL_RESOURCE";
  if (actionToken === "wait") return "WAIT";
  if (actionToken === "wait_until_ready") return "WAIT_UNTIL_READY";
  if (actionToken === "wait_for_cooldown") return "WAIT_FOR_COOLDOWN";
  return null;
}
