/**
 * SIMC_JSON_2_PARSER_V1 (M11-G3-1): SimulationCraft `json2` report -> typed
 * `SimulationResult`.
 *
 * Fail-closed. The parser accepts exactly report format 2.0.0 from the
 * approved engine and checks, before reading any number, that the engine
 * actually ran the job it was given:
 *
 * 1. size cap, JSON syntax, known format (`report_version` "2.0.0");
 * 2. provenance — `git_revision`, the live client-data build, networking
 *    compiled out and the runner-computed binary hash (MODEL_PROVENANCE_MISMATCH);
 * 3. the options ECHO — iterations, threads, seed, determinism, duration,
 *    `fixed_time`, `vary_combat_length`, `target_error`, every execution
 *    timing, raid-buff overrides and Bloodlust;
 * 4. the actors — exactly one player of the bound specialization and role
 *    with the job's level, race, talents and gear, exactly one target, and no raid event
 *    other than the tank model's own heal;
 * 5. no engine error log, a fixed simulated length equal to the duration,
 *    a sane counted-iteration total and a positive finite DPS;
 * 6. the precision gate (SIMULATION_PRECISION_NOT_MET).
 *
 * Any disagreement is a typed failure. Nothing defaults to zero.
 */

import { z } from "zod";

import type { ExecutionProfile } from "./execution-profiles.js";
import { fail, succeed, type SimulationOutcome } from "./failures.js";
import { INPUT_BUILDER_REVISION, SIMULATED_PLAYER_NAME, SIMULATED_TARGET_NAME } from "./input-builder.js";
import type { SimulationJob } from "./job.js";
import { verifyEngineIdentity, type ApprovedEngineArtifact } from "./model.js";
import {
  SIMULATION_RESULT_SCHEMA_VERSION,
  type SimulationActionBreakdownEntry,
  type SimulationPetBreakdownEntry,
  type SimulationResult,
} from "./result.js";
import type { SimulationPolicy } from "./simulation-policy.js";
import type { SimulationSpecBinding } from "./spec-binding.js";

export const RESULT_PARSER_REVISION = "SIMC_JSON_2_PARSER_V1";
export const SUPPORTED_REPORT_VERSION = "2.0.0";
export const MAX_ENGINE_OUTPUT_BYTES = 5 * 1024 * 1024;

/** The overrides the pinned report writes (report_json.cpp:1241-1252); the others are not echoed. */
const ECHOED_RAID_BUFFS = new Set([
  "arcane_intellect",
  "battle_shout",
  "power_word_fortitude",
  "chaos_brand",
  "mystic_touch",
  "mortal_wounds",
  "bleeding",
]);

/** Slots whose items carry no stats and so may be absent from the report's gear echo. */
const STATLESS_COSMETIC_SLOTS = new Set(["shirt", "tabard"]);

/** Raid events the tank model itself creates; anything else means the environment was not the job's. */
const TANK_MODEL_RAID_EVENTS = new Set(["tank_heal"]);

const sample = z.object({
  count: z.number(),
  mean: z.number(),
  std_dev: z.number(),
  mean_std_dev: z.number(),
  min: z.number(),
  max: z.number(),
});

const actionStats = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
  compound_amount: z.number(),
  num_executes: z.object({ mean: z.number() }).optional(),
});

const reportSchema = z.object({
  report_version: z.string(),
  version: z.string(),
  git_revision: z.string().optional(),
  no_networking: z.literal(true).optional(),
  logs: z.array(z.object({ level: z.string(), message: z.string() })).optional(),
  sim: z.object({
    options: z.object({
      iterations: z.number(),
      threads: z.number(),
      seed: z.number(),
      deterministic: z.number(),
      target_error: z.number(),
      max_time: z.number(),
      fixed_time: z.boolean(),
      vary_combat_length: z.number(),
      optimal_raid: z.number(),
      average_range: z.number(),
      average_gauss: z.number(),
      confidence: z.number(),
      confidence_estimator: z.number(),
      strict_gcd_queue: z.boolean(),
      queue_lag: z.number(),
      queue_lag_stddev: z.number(),
      gcd_lag: z.number(),
      gcd_lag_stddev: z.number(),
      channel_lag: z.number(),
      channel_lag_stddev: z.number(),
      queue_gcd_reduction: z.number(),
      world_lag: z.number(),
      world_lag_stddev: z.number(),
      default_aura_delay: z.number(),
      default_aura_delay_stddev: z.number(),
      reaction_time: z.number(),
      default_skill: z.number(),
      travel_variance: z.number(),
      dbc: z.object({
        version_used: z.string(),
        Live: z.object({ wow_version: z.string(), hotfix_hash: z.string() }),
      }),
    }),
    overrides: z.record(z.string(), z.number()).optional(),
    statistics: z.object({
      elapsed_cpu_seconds: z.number(),
      elapsed_time_seconds: z.number(),
      total_events_processed: z.number(),
      simulation_length: sample,
    }),
    players: z.array(
      z.object({
        name: z.string(),
        race: z.string(),
        level: z.number(),
        role: z.string(),
        specialization: z.string(),
        talents: z.string(),
        reaction_offset: z.number(),
        reaction_max: z.number(),
        reaction_mean: z.number(),
        reaction_stddev: z.number(),
        reaction_nu: z.number(),
        world_lag: z.number(),
        world_lag_stddev: z.number(),
        brain_lag: z.number(),
        brain_lag_stddev: z.number(),
        potion: z.string().optional(),
        flask: z.string().optional(),
        food: z.string().optional(),
        augmentation: z.string().optional(),
        temporary_enchant: z.string().optional(),
        collected_data: z.object({ dps: sample }),
        stats: z.array(actionStats).optional(),
        stats_pets: z.record(z.string(), z.array(actionStats)).optional(),
        gear: z.record(z.string(), z.object({ encoded_item: z.string() })),
      }),
    ),
    targets: z.array(z.object({ name: z.string() })),
    raid_events: z.array(z.object({ name: z.string() })).optional(),
  }),
});

type Report = z.infer<typeof reportSchema>;

export interface ParseContext {
  readonly job: SimulationJob;
  readonly binding: SimulationSpecBinding;
  readonly profile: ExecutionProfile;
  readonly policy: SimulationPolicy;
  readonly approved: ApprovedEngineArtifact;
  /** SHA-256 of the binary the runner actually executed, computed by the runner. */
  readonly executedBinarySha256: string;
  readonly profileHash: string;
  readonly environmentHash: string;
}

const malformed = <T>(detail: string): SimulationOutcome<T> => fail("SIMULATION_OUTPUT_MALFORMED", detail);

/** Seconds (engine echo) equals integer milliseconds within float noise. */
const sameMillis = (seconds: number, ms: number): boolean => Math.abs(seconds * 1000 - ms) < 1e-6;

export function parseSimcJson(
  text: string,
  byteLength: number,
  context: ParseContext,
): SimulationOutcome<SimulationResult> {
  if (byteLength > MAX_ENGINE_OUTPUT_BYTES) {
    return malformed(`output: ${String(byteLength)} bytes exceeds ${String(MAX_ENGINE_OUTPUT_BYTES)}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return malformed("output: not JSON");
  }
  if (
    typeof raw !== "object" ||
    raw === null ||
    (raw as { report_version?: unknown }).report_version !== SUPPORTED_REPORT_VERSION
  ) {
    return malformed(`report_version: expected ${SUPPORTED_REPORT_VERSION}`);
  }
  const parsed = reportSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return malformed(`shape: ${issue?.path.join(".") ?? "(root)"} ${issue?.code ?? "invalid"}`);
  }
  const report = parsed.data;
  const options = report.sim.options;

  if (options.dbc.version_used !== "Live")
    return fail("MODEL_PROVENANCE_MISMATCH", "dbc.version_used: not Live");
  const identity = verifyEngineIdentity(
    {
      reportedGitRevision: report.git_revision ?? null,
      reportedGameDataBuild: options.dbc.Live.wow_version,
      binarySha256: context.executedBinarySha256,
      networkingCompiledOut: report.no_networking === true,
    },
    context.approved,
  );
  if (!identity.ok) return identity;

  const echo = checkEcho(report, context);
  if (echo !== null) return malformed(`echo: ${echo}`);
  const actors = checkActors(report, context.job, context.binding, context.profile);
  if (actors !== null) return malformed(`actors: ${actors}`);

  if (report.logs !== undefined && report.logs.length > 0) {
    return fail(
      "SIMULATION_ENGINE_FAILED",
      `engine log: ${report.logs[0]?.level ?? ""} ${report.logs[0]?.message ?? ""}`.slice(0, 500),
    );
  }
  const length = report.sim.statistics.simulation_length;
  const durationMs = context.job.environment.durationMs;
  if (!sameMillis(length.min, durationMs) || !sameMillis(length.max, durationMs)) {
    return malformed("statistics.simulation_length: not the fixed duration");
  }

  const player = report.sim.players[0];
  if (player === undefined) return malformed("players: none");
  const dps = player.collected_data.dps;
  const requested = context.policy.iterations;
  if (
    !Number.isInteger(dps.count) ||
    dps.count < requested - context.policy.threads ||
    dps.count > requested
  ) {
    return malformed(`dps.count: ${String(dps.count)} for ${String(requested)} iterations`);
  }
  if (
    !Number.isFinite(dps.mean) ||
    dps.mean <= 0 ||
    !Number.isFinite(dps.mean_std_dev) ||
    dps.mean_std_dev < 0
  ) {
    return malformed("dps: not a positive finite mean");
  }
  if (options.confidence !== 0.95) return malformed("confidence: not 0.95");
  const relativeStandardError = dps.mean_std_dev / dps.mean;
  if (relativeStandardError > context.policy.maxRelativeStandardError) {
    return fail(
      "SIMULATION_PRECISION_NOT_MET",
      `relative standard error ${relativeStandardError.toExponential(3)} > ${String(context.policy.maxRelativeStandardError)}`,
    );
  }
  const halfWidth = options.confidence_estimator * dps.mean_std_dev;
  const job = context.job;

  const result: SimulationResult = {
    schemaVersion: SIMULATION_RESULT_SCHEMA_VERSION,
    model: {
      requestedSimcCommit: job.model.simcCommit,
      reportedGitRevision: identity.value.reportedGitRevision,
      gameDataBuild: identity.value.gameDataBuild,
      binarySha256: identity.value.binarySha256,
      buildRecipeRevision: identity.value.buildRecipeRevision,
    },
    profileHash: context.profileHash,
    environmentHash: context.environmentHash,
    executionProfile: { id: context.profile.id, version: context.profile.version },
    simulationPolicy: { id: context.policy.id, version: context.policy.version },
    iterations: { requested, counted: dps.count },
    dps: {
      mean: dps.mean,
      standardDeviation: dps.std_dev,
      standardError: dps.mean_std_dev,
      relativeStandardError,
      ci95: { lower: dps.mean - halfWidth, upper: dps.mean + halfWidth },
    },
    ...(job.requestedOutputs.actionBreakdown ? { actionBreakdown: actionBreakdown(player.stats ?? []) } : {}),
    ...(job.requestedOutputs.petBreakdown ? { petBreakdown: petBreakdown(player.stats_pets ?? {}) } : {}),
    diagnostics: {
      engineWallSeconds: report.sim.statistics.elapsed_time_seconds,
      engineCpuSeconds: report.sim.statistics.elapsed_cpu_seconds,
      eventsProcessed: report.sim.statistics.total_events_processed,
    },
    provenance: {
      parserRevision: RESULT_PARSER_REVISION,
      inputBuilderRevision: INPUT_BUILDER_REVISION,
      reportVersion: report.report_version,
      engineVersion: report.version,
      hotfixHash: options.dbc.Live.hotfix_hash,
      networkingCompiledOut: true,
      simulatedDurationMs: durationMs,
      durationAssumption: "EXACT_OBSERVED_DURATION_CEILING_ASSUMPTION",
      tankModel: job.environment.tankModel,
      consumablesProvenance: job.character.consumables.provenance,
      raidBuffsProvenance: job.environment.raidBuffs.provenance,
      bloodlustProvenance: job.environment.bloodlust.provenance,
    },
  };
  return succeed(result);
}

/** Returns the first options-echo disagreement, or null. */
function checkEcho(report: Report, context: ParseContext): string | null {
  const o = report.sim.options;
  const { policy, profile, job } = context;
  const sim = profile.sim;
  const exact: [string, unknown, unknown][] = [
    ["iterations", o.iterations, policy.iterations],
    ["threads", o.threads, policy.threads],
    // NOT `seed`: with deterministic=1 the pinned engine overwrites `seed`
    // with `rng().reseed()` at every iteration reset (sim.cpp:1810), so the
    // report's `options.seed` is the last iteration's reseed, never the
    // configured value. The configured seed is written by the builder and its
    // effect is proven by reproduction (same job -> same result).
    ["deterministic", o.deterministic, 1],
    ["target_error", o.target_error, 0],
    ["fixed_time", o.fixed_time, true],
    ["vary_combat_length", o.vary_combat_length, 0],
    ["optimal_raid", o.optimal_raid, 0],
    ["average_range", o.average_range, policy.averageRange ? 1 : 0],
    ["average_gauss", o.average_gauss, policy.averageGauss ? 1 : 0],
    ["strict_gcd_queue", o.strict_gcd_queue, sim.strictGcdQueue],
    ["default_skill", o.default_skill, sim.defaultSkill],
    ["travel_variance", o.travel_variance, sim.travelVariance],
  ];
  for (const [name, actual, expected] of exact) if (actual !== expected) return name;
  const timings: [string, number, number][] = [
    ["max_time", o.max_time, job.environment.durationMs],
    ["queue_lag", o.queue_lag, sim.queueLagMs],
    ["queue_lag_stddev", o.queue_lag_stddev, sim.queueLagStddevMs],
    ["gcd_lag", o.gcd_lag, sim.gcdLagMs],
    ["gcd_lag_stddev", o.gcd_lag_stddev, sim.gcdLagStddevMs],
    ["channel_lag", o.channel_lag, sim.channelLagMs],
    ["channel_lag_stddev", o.channel_lag_stddev, sim.channelLagStddevMs],
    ["queue_gcd_reduction", o.queue_gcd_reduction, sim.queueGcdReductionMs],
    ["world_lag", o.world_lag, sim.worldLagMs],
    ["world_lag_stddev", o.world_lag_stddev, sim.worldLagStddevMs],
    ["default_aura_delay", o.default_aura_delay, sim.auraDelayMs],
    ["default_aura_delay_stddev", o.default_aura_delay_stddev, sim.auraDelayStddevMs],
    ["reaction_time", o.reaction_time, sim.simReactionTimeMs],
  ];
  for (const [name, seconds, ms] of timings) if (!sameMillis(seconds, ms)) return name;

  const overrides = report.sim.overrides ?? {};
  const requested = new Set<string>(job.environment.raidBuffs.active);
  for (const buff of ECHOED_RAID_BUFFS) {
    if ((overrides[buff] ?? 0) !== (requested.has(buff) ? 1 : 0)) return `overrides.${buff}`;
  }
  const lust = job.environment.bloodlust;
  if ((overrides["bloodlust"] ?? 0) !== (lust.kind === "AT" ? 1 : 0)) return "overrides.bloodlust";
  if (lust.kind === "AT" && lust.atMs > 0 && !sameMillis(overrides["bloodlust_time"] ?? -1, lust.atMs)) {
    return "overrides.bloodlust_time";
  }
  return null;
}

/** Returns the first actor disagreement, or null. */
function checkActors(
  report: Report,
  job: SimulationJob,
  binding: SimulationSpecBinding,
  profile: ExecutionProfile,
): string | null {
  const players = report.sim.players;
  if (players.length !== 1) return `players: ${String(players.length)}`;
  const player = players[0];
  if (player === undefined) return "players: none";
  if (player.name !== SIMULATED_PLAYER_NAME) return "player.name";
  if (player.specialization !== binding.reportedSpecialization) return "player.specialization";
  if (player.role !== binding.simcRole) return "player.role";
  if (player.level !== job.character.level) return "player.level";
  if (player.race !== job.character.race) return "player.race";
  if (player.talents !== job.character.talents.importString) return "player.talents";
  const timings: [string, number, number][] = [
    ["reaction_mean", player.reaction_mean, profile.player.reactionTimeMeanMs],
    ["reaction_stddev", player.reaction_stddev, profile.player.reactionTimeStddevMs],
    ["reaction_nu", player.reaction_nu, profile.player.reactionTimeNuMs],
    ["reaction_offset", player.reaction_offset, profile.player.reactionTimeOffsetMs],
    ["reaction_max", player.reaction_max, profile.player.reactionTimeMaxMs],
    ["brain_lag", player.brain_lag, profile.player.brainLagMs],
    ["brain_lag_stddev", player.brain_lag_stddev, profile.player.brainLagStddevMs],
    ["world_lag", player.world_lag, profile.sim.worldLagMs],
    ["world_lag_stddev", player.world_lag_stddev, profile.sim.worldLagStddevMs],
  ];
  for (const [name, seconds, ms] of timings) if (!sameMillis(seconds, ms)) return `player.${name}`;
  // A named consumable must be echoed as named. How the pinned report echoes
  // a DISABLED one is not yet confirmed on real output, so NONE is not
  // asserted here (agent/follow-ups.md, M11-G3-1).
  const consumables = job.character.consumables;
  const named: [string, string | undefined, string][] = [
    ["potion", player.potion, consumables.potion],
    ["flask", player.flask, consumables.flask],
    ["food", player.food, consumables.food],
    ["augmentation", player.augmentation, consumables.augmentation],
    [
      "temporary_enchant",
      player.temporary_enchant,
      consumables.temporaryEnchants.map((entry) => `${entry.slot}:${entry.enchant}`).join("/") || "NONE",
    ],
  ];
  for (const [name, echoed, requested] of named) {
    if (requested !== "NONE" && echoed !== requested) return `player.${name}`;
  }
  for (const slot of job.character.gear) {
    const encoded = player.gear[slot.slot]?.encoded_item;
    // The pinned report omits items without stats (report_json.cpp:387), so a
    // cosmetic shirt or tabard may be absent; when echoed it must still match.
    // Every other requested slot must be echoed with its item id.
    if (encoded === undefined && STATLESS_COSMETIC_SLOTS.has(slot.slot)) continue;
    if (encoded === undefined || !encoded.split(",").includes(`id=${String(slot.itemId)}`))
      return `gear.${slot.slot}`;
  }
  const targets = report.sim.targets;
  if (targets.length !== 1 || targets[0]?.name !== SIMULATED_TARGET_NAME) return "targets";
  for (const event of report.sim.raid_events ?? []) {
    if (!TANK_MODEL_RAID_EVENTS.has(event.name)) return `raid_events.${event.name}`;
  }
  return null;
}

function actionBreakdown(stats: readonly z.infer<typeof actionStats>[]): SimulationActionBreakdownEntry[] {
  return stats
    .filter((entry) => entry.type === "damage")
    .map((entry) => ({
      actionName: entry.name,
      spellId: entry.id,
      meanDamagePerIteration: entry.compound_amount,
      meanExecutesPerIteration: entry.num_executes?.mean ?? null,
    }))
    .sort((a, b) =>
      a.actionName < b.actionName ? -1 : a.actionName > b.actionName ? 1 : a.spellId - b.spellId,
    );
}

function petBreakdown(
  pets: Readonly<Record<string, readonly z.infer<typeof actionStats>[]>>,
): SimulationPetBreakdownEntry[] {
  return Object.entries(pets)
    .map(([petName, stats]) => ({
      petName,
      meanDamagePerIteration: stats
        .filter((entry) => entry.type === "damage")
        .reduce((total, entry) => total + entry.compound_amount, 0),
    }))
    .sort((a, b) => (a.petName < b.petName ? -1 : a.petName > b.petName ? 1 : 0));
}
