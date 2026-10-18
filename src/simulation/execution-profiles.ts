/**
 * Versioned EXECUTION PROFILES (M11-G3-1, frozen at M11-G3-3): the execution
 * conditions under which the APL's decision policy is simulated.
 *
 *   APL                = decision policy (what to do)
 *   execution profile  = execution conditions (how promptly it gets done)
 *
 * A profile never changes decisions: skill stays 1 (no false-positive /
 * false-negative action rolls), brain lag stays 0, nothing is skipped.
 *
 * EVERY timing-relevant engine option is written explicitly, including the
 * pinned engine's own defaults, so a profile's meaning cannot drift if a future
 * engine changes a default. Times are INTEGER milliseconds — the engine's
 * effective values: the pinned engine stores timespans as truncated integer
 * milliseconds (util/timespan.hpp:74), so a derived "25% of 150 ms" is 37 ms,
 * never 37.5 ms.
 *
 * IMMUTABILITY. A profile is identified by id + version and by its revision
 * hash (`executionProfileRevision`). Every definition below is deep-frozen;
 * changing any effective setting of ELITE_REALISTIC_V1 requires a NEW id or
 * version (ELITE_REALISTIC_V2), never an edit in place.
 *
 * ELITE_REALISTIC_V1 is the one PRODUCTION profile (M11-G3-3): the pinned
 * engine's server, queue and cooldown-queue semantics, which already model an
 * excellent player using WoW's spell queue, plus a versioned elite proc-
 * reaction policy. The other entries are a diagnostic reference
 * (SIMC_DEFAULT_PINNED) and EVALUATED_CANDIDATEs kept for benchmark
 * reproducibility; they are not production choices. None of these names is
 * public product output.
 */

export interface ExecutionSimSettings {
  readonly strictGcdQueue: boolean;
  readonly queueLagMs: number;
  readonly queueLagStddevMs: number;
  readonly gcdLagMs: number;
  readonly gcdLagStddevMs: number;
  readonly channelLagMs: number;
  readonly channelLagStddevMs: number;
  readonly queueGcdReductionMs: number;
  readonly worldLagMs: number;
  readonly worldLagStddevMs: number;
  readonly cooldownToleranceMs: number;
  readonly auraDelayMs: number;
  readonly auraDelayStddevMs: number;
  readonly simReactionTimeMs: number;
  readonly defaultSkill: number;
  readonly travelVariance: number;
}

export interface ExecutionPlayerSettings {
  readonly reactionTimeMeanMs: number;
  readonly reactionTimeStddevMs: number;
  readonly reactionTimeNuMs: number;
  readonly reactionTimeOffsetMs: number;
  readonly reactionTimeMaxMs: number;
  readonly brainLagMs: number;
  readonly brainLagStddevMs: number;
  readonly skill: number;
  /** player `enable_spell_queue`: choose the next action `spellQueueWindowMs` before a cast-time spell ends. */
  readonly enableSpellQueue: boolean;
  readonly spellQueueWindowMs: number;
  /** player `ready_trigger`: re-evaluate on resource/aura events instead of polling (~100 ± 10 ms). */
  readonly readyTrigger: boolean;
}

export type ExecutionAssumptionKind =
  "PINNED_ENGINE_SEMANTICS" | "PRODUCT_EXECUTION_ASSUMPTION" | "STANDARDIZED_ENVIRONMENT_ASSUMPTION";

export interface ExecutionAssumption {
  readonly fields: readonly string[];
  readonly kind: ExecutionAssumptionKind;
  readonly statement: string;
}

export interface ExecutionProfile {
  readonly id: string;
  readonly version: number;
  readonly status: "PRODUCTION" | "PINNED_ENGINE_REFERENCE" | "EVALUATED_CANDIDATE";
  readonly sim: ExecutionSimSettings;
  readonly player: ExecutionPlayerSettings;
  readonly assumptions: readonly ExecutionAssumption[];
  readonly notes: string;
}

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/**
 * The pinned engine's effective defaults, written out (engine/sim/sim.cpp
 * 1422-1490 and 2657-2660 for derived stddevs; engine/player/player.cpp
 * 985, 1017-1026, 1166, 1455).
 */
const pinnedSim = (): ExecutionSimSettings => ({
  strictGcdQueue: false,
  queueLagMs: 5,
  queueLagStddevMs: 1,
  gcdLagMs: 150,
  gcdLagStddevMs: 37,
  channelLagMs: 250,
  channelLagStddevMs: 62,
  queueGcdReductionMs: 100,
  worldLagMs: 100,
  worldLagStddevMs: 10,
  cooldownToleranceMs: 250,
  auraDelayMs: 30,
  auraDelayStddevMs: 5,
  simReactionTimeMs: 500,
  defaultSkill: 1,
  travelVariance: 0,
});

const pinnedPlayer = (): ExecutionPlayerSettings => ({
  reactionTimeMeanMs: 250,
  reactionTimeStddevMs: 50,
  reactionTimeNuMs: 150,
  reactionTimeOffsetMs: 100,
  reactionTimeMaxMs: 1400,
  brainLagMs: 0,
  brainLagStddevMs: 0,
  skill: 1,
  enableSpellQueue: false,
  spellQueueWindowMs: 400,
  readyTrigger: false,
});

/** The elite proc-reaction policy: 100 ms + ExGauss(μ 200 ms, σ 40 ms, ν 100 ms), mean 400 ms, cap 1.4 s. */
const ELITE_REACTION = {
  reactionTimeMeanMs: 200,
  reactionTimeStddevMs: 40,
  reactionTimeNuMs: 100,
  reactionTimeOffsetMs: 100,
  reactionTimeMaxMs: 1400,
} as const;

/** A deliberately imperfect queue: 30 ± 10 ms after each GCD (evaluated, rejected). */
const IMPERFECT_QUEUE = { queueLagMs: 30, queueLagStddevMs: 10 } as const;

const ELITE_ASSUMPTIONS: readonly ExecutionAssumption[] = [
  {
    fields: [
      "strictGcdQueue",
      "queueLagMs",
      "queueLagStddevMs",
      "gcdLagMs",
      "gcdLagStddevMs",
      "queueGcdReductionMs",
    ],
    kind: "PINNED_ENGINE_SEMANTICS",
    statement:
      "strict_gcd_queue OFF: every GCD action is treated as queued and starts queue_lag (5 ± 1 ms) after the GCD/cast becomes available (player.cpp:6942-6990) — an excellent player using WoW's spell queue. gcd_lag and queue_gcd_reduction apply only with strict_gcd_queue ON and are written for completeness.",
  },
  {
    fields: [
      "reactionTimeMeanMs",
      "reactionTimeStddevMs",
      "reactionTimeNuMs",
      "reactionTimeOffsetMs",
      "reactionTimeMaxMs",
    ],
    kind: "PRODUCT_EXECUTION_ASSUMPTION",
    statement:
      "Elite proc reaction: 100 ms + ExGauss(μ 200, σ 40, ν 100) ms, mean 400 ms, capped at 1.4 s (player.cpp:7763). The engine's generic default is 500 ms mean; the elite policy keeps its shape and 20% σ/μ ratio and assumes a 20% faster mean. It applies only to buff.<x>.react / react_pct (buff.cpp:480-530, :2697), after the server aura delay, which is modelled separately. Not fitted to any DPS or log.",
  },
  {
    fields: [
      "worldLagMs",
      "worldLagStddevMs",
      "auraDelayMs",
      "auraDelayStddevMs",
      "cooldownToleranceMs",
      "simReactionTimeMs",
    ],
    kind: "STANDARDIZED_ENVIRONMENT_ASSUMPTION",
    statement:
      "Server/network behaviour is the pinned engine's, standardized for every player (no player latency is read): world lag 100 ± 10 ms, aura application delay 30 ± 5 ms, 250 ms cooldown queue tolerance (the in-game queue window for cooldowns), 500 ms sim-level reaction for non-player auras.",
  },
  {
    fields: [
      "channelLagMs",
      "channelLagStddevMs",
      "enableSpellQueue",
      "spellQueueWindowMs",
      "readyTrigger",
      "travelVariance",
    ],
    kind: "PINNED_ENGINE_SEMANTICS",
    statement:
      "Pinned behaviour kept: 250 ± 62 ms after a channel completes; no early next-action selection during casts (decisions on current state); ~100 ± 10 ms resource polling while waiting (player.cpp:7130); no travel-time variance.",
  },
  {
    fields: ["brainLagMs", "brainLagStddevMs", "skill", "defaultSkill"],
    kind: "PRODUCT_EXECUTION_ASSUMPTION",
    statement:
      "No added cognitive delay (brain_lag only feeds the cast_delay APL expression) and skill 1 (no false-positive or false-negative action rolls, action.cpp:1326-1365): the APL is executed correctly.",
  },
];

export const EXECUTION_PROFILES: readonly ExecutionProfile[] = deepFreeze([
  {
    id: "SIMC_DEFAULT_PINNED",
    version: 2,
    status: "PINNED_ENGINE_REFERENCE",
    sim: pinnedSim(),
    player: pinnedPlayer(),
    assumptions: [],
    notes:
      "The pinned engine's effective defaults, written out (diagnostic reference). v2 adds the explicit spell-queue and ready-trigger defaults; effective behaviour is unchanged from v1.",
  },
  {
    id: "ELITE_REALISTIC_V1",
    version: 1,
    status: "PRODUCTION",
    // A complete literal, deliberately NOT built from the pinned-default helpers:
    // a future engine default (or an edit to pinnedSim/pinnedPlayer) can never
    // change V1's meaning. Any change here is ELITE_REALISTIC_V2.
    sim: {
      strictGcdQueue: false,
      queueLagMs: 5,
      queueLagStddevMs: 1,
      gcdLagMs: 150,
      gcdLagStddevMs: 37,
      channelLagMs: 250,
      channelLagStddevMs: 62,
      queueGcdReductionMs: 100,
      worldLagMs: 100,
      worldLagStddevMs: 10,
      cooldownToleranceMs: 250,
      auraDelayMs: 30,
      auraDelayStddevMs: 5,
      simReactionTimeMs: 500,
      defaultSkill: 1,
      travelVariance: 0,
    },
    player: {
      reactionTimeMeanMs: 200,
      reactionTimeStddevMs: 40,
      reactionTimeNuMs: 100,
      reactionTimeOffsetMs: 100,
      reactionTimeMaxMs: 1400,
      brainLagMs: 0,
      brainLagStddevMs: 0,
      skill: 1,
      enableSpellQueue: false,
      spellQueueWindowMs: 400,
      readyTrigger: false,
    },
    assumptions: ELITE_ASSUMPTIONS,
    notes:
      "M11-G3-3. An elite player executing the pinned APL under realistic, standardized game/input timing. Frozen: any effective change is ELITE_REALISTIC_V2.",
  },
  {
    id: "ELITE_CANDIDATE_QUEUE",
    version: 1,
    status: "EVALUATED_CANDIDATE",
    sim: { ...pinnedSim(), ...IMPERFECT_QUEUE },
    player: pinnedPlayer(),
    assumptions: [],
    notes:
      "Evaluated and rejected at M11-G3-3: adds a deliberately imperfect 30 ± 10 ms gap after every GCD.",
  },
  {
    id: "ELITE_CANDIDATE_REACTION",
    version: 1,
    status: "EVALUATED_CANDIDATE",
    sim: pinnedSim(),
    player: { ...pinnedPlayer(), ...ELITE_REACTION },
    assumptions: [],
    notes: "Evaluated at M11-G3-3: the elite reaction policy alone. Adopted as ELITE_REALISTIC_V1.",
  },
  {
    id: "ELITE_CANDIDATE_COMBINED",
    version: 1,
    status: "EVALUATED_CANDIDATE",
    sim: { ...pinnedSim(), ...IMPERFECT_QUEUE },
    player: { ...pinnedPlayer(), ...ELITE_REACTION },
    assumptions: [],
    notes: "Evaluated and rejected at M11-G3-3: imperfect queueing plus elite reaction.",
  },
]);

export function executionProfileById(id: string): ExecutionProfile | undefined {
  return EXECUTION_PROFILES.find((profile) => profile.id === id);
}

/** The one production execution profile. */
export const PRODUCTION_EXECUTION_PROFILE_ID = "ELITE_REALISTIC_V1";
