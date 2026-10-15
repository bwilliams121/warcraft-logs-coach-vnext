/**
 * The SimulationCraft INPUT BUILDER (M11-G3-1).
 *
 * Turns a validated `SimulationJob` into the engine's option text. This is the
 * ONLY place SimC text is written; every line comes from a fixed template and
 * a value that the job schema already constrained to an enum, a bounded
 * integer or a `[a-z0-9_]` identifier. The output is byte-identical for the
 * same job: no timestamps, paths, hostnames, secrets, names from the request
 * or report identifiers.
 *
 * Output destinations are NOT written here. The runner appends its own
 * `json2=` argument pointing into its per-job temp directory.
 *
 * Pinned-engine facts the builder relies on (33622e9d):
 * - `strict_parsing=1` makes an unknown option an error (sim.cpp:3862).
 * - `optimal_raid=0` clears every raid buff/debuff override AND Bloodlust
 *   (sim.cpp:3535-3549); each override is then written explicitly, so no
 *   buff is present unless the job lists it.
 * - Bloodlust is checked at 0 s and then every 1 s once
 *   `override.bloodlust=1` (sim.cpp:1155-1200, :1948): the effective time is
 *   the first whole second at or after `bloodlust_time`.
 * - `fixed_time=1` + `vary_combat_length=0` + `max_time` gives the exact
 *   observed duration. This is a CEILING ASSUMPTION: the simulated player's
 *   APL can see `fight_remains` exactly, which the real player could not.
 * - `tank_dummy` + `tank_dummy_type=mythic` is STANDARD_TANK_LOAD_V1 (see
 *   tank-model.ts). It is declared before the player so it is the primary
 *   target (`sim->target`).
 * - The player copies `world_lag` from the sim when it is constructed
 *   (player.cpp:1022), so the player's latency is written on the player.
 * - An empty consumable string means "class default" (player.cpp:12910), so
 *   NONE is written as `disabled`, never omitted.
 */

import type { ExecutionProfile } from "./execution-profiles.js";
import { RAID_BUFFS, type SimulationJob } from "./job.js";
import type { SimulationPolicy } from "./simulation-policy.js";
import type { SimulationSpecBinding } from "./spec-binding.js";
import { TANK_MODEL_DIRECTIVES } from "./tank-model.js";

/** Bump when the emitted text changes for the same job. Part of every cache key. */
export const INPUT_BUILDER_REVISION = "simc-input-builder/1";

/** The fixed actor names. Never the player's name. */
export const SIMULATED_PLAYER_NAME = "Subject";
export const SIMULATED_TARGET_NAME = "Target";

/**
 * Formats integer milliseconds as SimC seconds text. The pinned engine parses
 * a timespan as `static_cast<int64>(to_double(text) * 1000)` — truncation in
 * IEEE doubles (util/timespan.hpp:74; `std::stod` is correctly rounded, like
 * JavaScript's `Number`). About 1% of exact decimal texts land a hair under
 * the integer and truncate one millisecond short (e.g. "1.001" -> 1000 ms),
 * so for those the half-millisecond midpoint ("1.0015") is written, which
 * truncates to exactly the intended value. Either way the text is emitted
 * only if the engine's computation recovers the same integer.
 */
export function millisecondsToSecondsText(ms: number): string {
  if (!Number.isSafeInteger(ms) || ms < 0) {
    throw new RangeError(
      `millisecondsToSecondsText: ${String(ms)} is not a non-negative integer millisecond value`,
    );
  }
  const engineMillis = (text: string): number => Math.trunc(Number(text) * 1000);
  const whole = String(Math.floor(ms / 1000));
  const millis = String(ms % 1000).padStart(3, "0");
  const trimmed = millis.replace(/0+$/, "");
  const exact = trimmed === "" ? whole : `${whole}.${trimmed}`;
  if (engineMillis(exact) === ms) return exact;
  const midpoint = `${whole}.${millis}5`;
  if (engineMillis(midpoint) === ms) return midpoint;
  throw new RangeError(`millisecondsToSecondsText: no text parses back to ${String(ms)} ms in the engine`);
}

const seconds = millisecondsToSecondsText;
const flag = (value: boolean): string => (value ? "1" : "0");

function simulationLines(policy: SimulationPolicy): string[] {
  return [
    `iterations=${String(policy.iterations)}`,
    `threads=${String(policy.threads)}`,
    `seed=${String(policy.seed)}`,
    `deterministic=${flag(policy.deterministic)}`,
    "target_error=0",
    `average_range=${flag(policy.averageRange)}`,
    `average_gauss=${flag(policy.averageGauss)}`,
  ];
}

function environmentLines(environment: SimulationJob["environment"]): string[] {
  const active = new Set<string>(environment.raidBuffs.active);
  const lines = [
    `max_time=${seconds(environment.durationMs)}`,
    "fixed_time=1",
    "vary_combat_length=0",
    "optimal_raid=0",
    ...RAID_BUFFS.map((buff) => `override.${buff}=${active.has(buff) ? "1" : "0"}`),
  ];
  const lust = environment.bloodlust;
  if (lust.kind === "AT") {
    lines.push("override.bloodlust=1", "bloodlust_percent=0", `bloodlust_time=${seconds(lust.atMs)}`);
  } else {
    lines.push("override.bloodlust=0");
  }
  return lines;
}

function executionSimLines(sim: ExecutionProfile["sim"]): string[] {
  return [
    `strict_gcd_queue=${flag(sim.strictGcdQueue)}`,
    `queue_lag=${seconds(sim.queueLagMs)}`,
    `queue_lag_stddev=${seconds(sim.queueLagStddevMs)}`,
    `gcd_lag=${seconds(sim.gcdLagMs)}`,
    `gcd_lag_stddev=${seconds(sim.gcdLagStddevMs)}`,
    `channel_lag=${seconds(sim.channelLagMs)}`,
    `channel_lag_stddev=${seconds(sim.channelLagStddevMs)}`,
    `queue_gcd_reduction=${seconds(sim.queueGcdReductionMs)}`,
    `default_world_lag=${seconds(sim.worldLagMs)}`,
    `default_world_lag_stddev=${seconds(sim.worldLagStddevMs)}`,
    `default_cooldown_tolerance=${seconds(sim.cooldownToleranceMs)}`,
    `default_aura_delay=${seconds(sim.auraDelayMs)}`,
    `default_aura_delay_stddev=${seconds(sim.auraDelayStddevMs)}`,
    `reaction_time=${seconds(sim.simReactionTimeMs)}`,
    `default_skill=${String(sim.defaultSkill)}`,
    `travel_variance=${String(sim.travelVariance)}`,
  ];
}

function executionPlayerLines(profile: ExecutionProfile): string[] {
  const { player, sim } = profile;
  return [
    `reaction_time_mean=${seconds(player.reactionTimeMeanMs)}`,
    `reaction_time_stddev=${seconds(player.reactionTimeStddevMs)}`,
    `reaction_time_nu=${seconds(player.reactionTimeNuMs)}`,
    `reaction_time_offset=${seconds(player.reactionTimeOffsetMs)}`,
    `reaction_time_max=${seconds(player.reactionTimeMaxMs)}`,
    `brain_lag=${seconds(player.brainLagMs)}`,
    `brain_lag_stddev=${seconds(player.brainLagStddevMs)}`,
    `world_lag=${seconds(sim.worldLagMs)}`,
    `world_lag_stddev=${seconds(sim.worldLagStddevMs)}`,
    `skill=${String(player.skill)}`,
  ];
}

function characterLines(character: SimulationJob["character"], binding: SimulationSpecBinding): string[] {
  const consumables = character.consumables;
  const consumable = (value: string): string => (value === "NONE" ? "disabled" : value);
  const temporary =
    consumables.temporaryEnchants.length === 0
      ? "disabled"
      : consumables.temporaryEnchants.map((entry) => `${entry.slot}:${entry.enchant}`).join("/");
  const gear = character.gear.map((entry) => {
    const parts = [`${entry.slot}=`, `id=${String(entry.itemId)}`];
    if (entry.bonusIds.length > 0) parts.push(`bonus_id=${entry.bonusIds.join("/")}`);
    if (entry.gems.kind === "KNOWN") parts.push(`gem_id=${entry.gems.gemIds.join("/")}`);
    if (entry.enchant.kind === "KNOWN") parts.push(`enchant_id=${String(entry.enchant.enchantId)}`);
    return parts.join(",");
  });
  return [
    `level=${String(character.level)}`,
    `race=${character.race}`,
    `role=${binding.simcRole}`,
    `talents=${character.talents.importString}`,
    `potion=${consumable(consumables.potion)}`,
    `flask=${consumable(consumables.flask)}`,
    `food=${consumable(consumables.food)}`,
    `augmentation=${consumable(consumables.augmentation)}`,
    `temporary_enchant=${temporary}`,
    ...gear,
  ];
}

/**
 * Builds the engine input for a job already validated by
 * `validateSimulationJob` (which resolved its spec `binding`) and resolved
 * against the policy and execution profile registries. Ends with a newline;
 * lines are `\n`-separated.
 */
export function buildSimcInput(
  job: SimulationJob,
  binding: SimulationSpecBinding,
  profile: ExecutionProfile,
  policy: SimulationPolicy,
): string {
  const lines = [
    "strict_parsing=1",
    "ptr=0",
    ...simulationLines(policy),
    ...environmentLines(job.environment),
    ...executionSimLines(profile.sim),
    `tank_dummy=${SIMULATED_TARGET_NAME}`,
    ...TANK_MODEL_DIRECTIVES[job.environment.tankModel],
    `${binding.simcClassToken}=${SIMULATED_PLAYER_NAME}`,
    `spec=${binding.simcSpecToken}`,
    ...characterLines(job.character, binding),
    ...executionPlayerLines(profile),
  ];
  return `${lines.join("\n")}\n`;
}
