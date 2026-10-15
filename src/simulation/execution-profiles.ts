/**
 * Versioned EXECUTION PROFILES (M11-G3-1): the human-execution conditions
 * under which the APL's decision policy is simulated. The APL says WHAT to
 * do; an execution profile says how quickly and precisely it gets done.
 *
 * Every execution-semantic option is set explicitly — no implicit runner or
 * engine default. Where a value equals the pinned SimC default, the default
 * is written out, with the pinned source location, including the standard
 * deviations SimC would otherwise DERIVE at init (e.g. queue_lag_stddev = 0
 * means "25% of the mean" at engine/sim/sim.cpp:2657, so the effective value
 * is written instead of 0).
 *
 * Times are INTEGER milliseconds: the pinned engine stores every timespan as
 * integer milliseconds, truncating (util/timespan.hpp:74). A derived 25% of
 * 150 ms is therefore 37 ms, not 37.5 ms — the values below are the effective
 * engine values, and the JSON options echo reports exactly these.
 *
 * SIMC_DEFAULT_PINNED is the engine's own assumptions at the pin. The
 * ELITE_REALISTIC candidates are PROVISIONAL and internal: G3-3 chooses
 * ELITE_REALISTIC_V1. None of these names is public product output.
 */

export interface ExecutionProfile {
  readonly id: string;
  readonly version: number;
  readonly status: "PINNED_ENGINE_DEFAULT" | "PROVISIONAL_CANDIDATE";
  readonly sim: {
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
  };
  readonly player: {
    readonly reactionTimeMeanMs: number;
    readonly reactionTimeStddevMs: number;
    readonly reactionTimeNuMs: number;
    readonly reactionTimeOffsetMs: number;
    readonly reactionTimeMaxMs: number;
    readonly brainLagMs: number;
    readonly brainLagStddevMs: number;
    readonly skill: number;
  };
  readonly notes: string;
}

/** The pinned engine defaults (engine/sim/sim.cpp:1422-1490, :2657-2660; engine/player/player.cpp:1017-1023, :1225, :1455). */
const PINNED_SIM = {
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
} as const;

const PINNED_PLAYER = {
  reactionTimeMeanMs: 250,
  reactionTimeStddevMs: 50,
  reactionTimeNuMs: 150,
  reactionTimeOffsetMs: 100,
  reactionTimeMaxMs: 1400,
  brainLagMs: 0,
  brainLagStddevMs: 0,
  skill: 1,
} as const;

export const EXECUTION_PROFILES: readonly ExecutionProfile[] = [
  {
    id: "SIMC_DEFAULT_PINNED",
    version: 1,
    status: "PINNED_ENGINE_DEFAULT",
    sim: PINNED_SIM,
    player: PINNED_PLAYER,
    notes:
      "Exactly the pinned engine's defaults, written out. Proc reaction averages ~500 ms (100 ms offset + ExGauss(250 +/- 50 ms, nu 150 ms), capped at 1.4 s).",
  },
  {
    id: "ELITE_REALISTIC_CANDIDATE_A",
    version: 1,
    status: "PROVISIONAL_CANDIDATE",
    sim: PINNED_SIM,
    player: { ...PINNED_PLAYER, reactionTimeMeanMs: 150, reactionTimeStddevMs: 30, reactionTimeNuMs: 100 },
    notes:
      "G3-0 proposal: pinned server/queue behaviour, faster proc reaction averaging ~350 ms. Provisional: not tuned against any DPS; G3-3 decides.",
  },
  {
    id: "ELITE_REALISTIC_CANDIDATE_B",
    version: 1,
    status: "PROVISIONAL_CANDIDATE",
    sim: PINNED_SIM,
    player: { ...PINNED_PLAYER, reactionTimeMeanMs: 200, reactionTimeStddevMs: 40, reactionTimeNuMs: 125 },
    notes: "A more conservative provisional candidate: proc reaction averaging ~425 ms. G3-3 decides.",
  },
];

export function executionProfileById(id: string): ExecutionProfile | undefined {
  return EXECUTION_PROFILES.find((profile) => profile.id === id);
}
