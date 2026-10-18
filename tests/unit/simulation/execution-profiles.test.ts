/**
 * M11-G3-3: ELITE_REALISTIC_V1 — one frozen, explicit, versioned execution
 * profile, whose identity travels with every result.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { RUNNER_SPEC_BINDINGS } from "../../../runner/spec-bindings.js";
import { simulationCacheKeys } from "../../../src/simulation/cache-key.js";
import { aplExecutionFacts, classifyExecutionActivity } from "../../../src/simulation/execution-activity.js";
import {
  EXECUTION_PROFILES,
  executionProfileById,
  PRODUCTION_EXECUTION_PROFILE_ID,
  type ExecutionProfile,
} from "../../../src/simulation/execution-profiles.js";
import { executionProfileRevision } from "../../../src/simulation/execution-revision.js";
import { buildSimcInput, millisecondsToSecondsText } from "../../../src/simulation/input-builder.js";
import type { SimulationJob } from "../../../src/simulation/job.js";
import { prepareSimulation } from "../../../src/simulation/prepare.js";
import { simulationPolicyById } from "../../../src/simulation/simulation-policy.js";
import {
  BLOOD_APL_EXECUTION_FACTS,
  BLOOD_SPEC_EXECUTION_FACTS,
} from "../../../src/specs/deathknight/blood/execution-facts.js";
import { BLOOD_SIMULATION_BINDING } from "../../../src/specs/deathknight/blood/simulation-binding.js";
import { devBloodJob, jsonBytes, TEST_ARTIFACT } from "../../support/simulation/dev-blood-job.js";

declare const process: { execPath: string; cwd(): string };

const V1 = executionProfileById("ELITE_REALISTIC_V1") as ExecutionProfile;
const PINNED = executionProfileById("SIMC_DEFAULT_PINNED") as ExecutionProfile;
const POLICY = simulationPolicyById("STANDARD_SIM_V1");
if (POLICY === undefined) throw new Error("policy");

/** The frozen meaning of ELITE_REALISTIC_V1, written out independently of the source. */
const V1_EXPECTED = {
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
};

const V1_REVISION = "5692cfece9870b95028ed41ebada3bf858c624e5a8d784ce677eada203d9190c";

const job = (profileId: string) => devBloodJob("STANDARD_SIM_V1", profileId) as unknown as SimulationJob;
const inputFor = (profile: ExecutionProfile) =>
  buildSimcInput(job(profile.id), BLOOD_SIMULATION_BINDING, profile, POLICY);

describe("M11-G3-3 ELITE_REALISTIC_V1", () => {
  it("is the one PRODUCTION profile; the pinned defaults stay a reference", () => {
    expect(EXECUTION_PROFILES.filter((profile) => profile.status === "PRODUCTION").map((p) => p.id)).toEqual([
      "ELITE_REALISTIC_V1",
    ]);
    expect(PRODUCTION_EXECUTION_PROFILE_ID).toBe("ELITE_REALISTIC_V1");
    expect(PINNED.status).toBe("PINNED_ENGINE_REFERENCE");
    expect(V1.version).toBe(1);
  });

  it("A. is immutable: deep-frozen, and its revision is pinned", async () => {
    expect(Object.isFrozen(V1)).toBe(true);
    expect(Object.isFrozen(V1.sim)).toBe(true);
    expect(Object.isFrozen(V1.player)).toBe(true);
    expect(() => {
      (V1.player as { reactionTimeMeanMs: number }).reactionTimeMeanMs = 1;
    }).toThrow(TypeError);
    expect(await executionProfileRevision(V1)).toBe(V1_REVISION);
  });

  it("B/E. every field is explicit, and V1 is its own literal — not the pinned defaults", () => {
    expect({ sim: V1.sim, player: V1.player }).toEqual(V1_EXPECTED);
    for (const profile of EXECUTION_PROFILES) {
      expect(Object.keys(profile.sim).sort()).toEqual(Object.keys(V1_EXPECTED.sim).sort());
      expect(Object.keys(profile.player).sort()).toEqual(Object.keys(V1_EXPECTED.player).sort());
      for (const value of [...Object.values(profile.sim), ...Object.values(profile.player)]) {
        expect(value === undefined || value === null).toBe(false);
      }
    }
    // A different pinned reference (e.g. a future engine default) does not move V1.
    expect(V1.sim).not.toBe(PINNED.sim);
    expect(V1.player).not.toBe(PINNED.player);
    const source = readFileSync(join(process.cwd(), "src/simulation/execution-profiles.ts"), "utf8");
    const v1Block = source.slice(
      source.indexOf('id: "ELITE_REALISTIC_V1"'),
      source.indexOf('id: "ELITE_CANDIDATE_QUEUE"'),
    );
    expect(v1Block).not.toMatch(/pinnedSim\(|pinnedPlayer\(|ELITE_REACTION|\.\.\./);
  });

  it("C/D. the revision is deterministic, and every effective setting moves it", async () => {
    expect(await executionProfileRevision(structuredClone(V1))).toBe(await executionProfileRevision(V1));
    const seen = new Set([await executionProfileRevision(V1)]);
    for (const group of ["sim", "player"] as const) {
      for (const [field, value] of Object.entries(V1[group])) {
        const changed = typeof value === "boolean" ? !value : (value as number) + 1;
        const variant = { ...V1, [group]: { ...V1[group], [field]: changed } } as ExecutionProfile;
        const revision = await executionProfileRevision(variant);
        expect(seen.has(revision), `${group}.${field}`).toBe(false);
        seen.add(revision);
      }
    }
    expect(seen.has(await executionProfileRevision({ ...V1, version: 2 }))).toBe(false);
    expect(seen.has(await executionProfileRevision({ ...V1, id: "ELITE_REALISTIC_V2" }))).toBe(false);
  });

  it("F. every V1 time is an integer engine millisecond the builder writes exactly", () => {
    for (const [field, value] of [...Object.entries(V1.sim), ...Object.entries(V1.player)]) {
      if (typeof value !== "number" || !field.endsWith("Ms")) continue;
      expect(Number.isInteger(value), field).toBe(true);
      expect(Math.trunc(Number(millisecondsToSecondsText(value)) * 1000), field).toBe(value);
    }
    // The engine runs a derived 25% of 150 ms as 37 ms (truncation), and that is what V1 states.
    expect(inputFor(V1)).toContain("\ngcd_lag_stddev=0.037\n");
  });

  it("G/H. reaction is INACTIVE for Blood (no .react) and ACTIVE for a .react APL", () => {
    expect(BLOOD_APL_EXECUTION_FACTS).toEqual({ usesReact: false, usesCastDelay: false });
    const blood = Object.fromEntries(
      classifyExecutionActivity(V1, BLOOD_APL_EXECUTION_FACTS, BLOOD_SPEC_EXECUTION_FACTS).map((f) => [
        f.field,
        f.activity,
      ]),
    );
    expect(blood["reactionTimeMeanMs"]).toBe("INACTIVE_FOR_THIS_APL");
    expect(blood["brainLagMs"]).toBe("INACTIVE_FOR_THIS_APL");
    expect(blood["queueLagMs"]).toBe("ACTIVE_FOR_THIS_APL");
    expect(blood["gcdLagMs"]).toBe("INACTIVE_FOR_THIS_APL");
    expect(blood["channelLagMs"]).toBe("CONDITIONAL");
    expect(blood["auraDelayMs"]).toBe("ENGINE_GLOBAL");
    const reactive = aplExecutionFacts(["pyroblast,if=buff.hot_streak.react", "fireball"]);
    expect(reactive.usesReact).toBe(true);
    const fire = classifyExecutionActivity(V1, reactive, {
      channeledActions: [],
      castTimeActions: ["fireball"],
      basis: "fixture",
    });
    expect(fire.find((f) => f.field === "reactionTimeMeanMs")?.activity).toBe("ACTIVE_FOR_THIS_APL");
    expect(fire.find((f) => f.field === "channelLagMs")?.activity).toBe("INACTIVE_FOR_THIS_APL");
    const strict = classifyExecutionActivity({ ...V1, sim: { ...V1.sim, strictGcdQueue: true } }, reactive, {
      channeledActions: [],
      castTimeActions: [],
      basis: "fixture",
    });
    expect(strict.find((f) => f.field === "gcdLagMs")?.activity).toBe("ACTIVE_FOR_THIS_APL");
  });

  it("I/J/K/L/M. queue lag, strict GCD queue, server delays, brain lag and skill reach the engine input", () => {
    const input = inputFor(V1);
    for (const line of [
      "strict_gcd_queue=0",
      "queue_lag=0.005",
      "queue_lag_stddev=0.001",
      "default_world_lag=0.1",
      "default_world_lag_stddev=0.01",
      "world_lag=0.1",
      "world_lag_stddev=0.01",
      "default_aura_delay=0.03",
      "default_aura_delay_stddev=0.005",
      "default_cooldown_tolerance=0.25",
      "reaction_time=0.5",
      "brain_lag=0",
      "brain_lag_stddev=0",
      "skill=1",
      "default_skill=1",
      "reaction_time_mean=0.2",
      "reaction_time_stddev=0.04",
      "reaction_time_nu=0.1",
      "enable_spell_queue=0",
      "spell_queue_window=0.4",
      "ready_trigger=0",
    ]) {
      expect(input, line).toContain(`\n${line}\n`);
    }
    const queued = { ...V1, sim: { ...V1.sim, queueLagMs: 30 } };
    expect(buildSimcInput(job(V1.id), BLOOD_SIMULATION_BINDING, queued, POLICY)).toContain(
      "\nqueue_lag=0.03\n",
    );
  });

  it("N/O. no player-specific latency can be supplied, and the profile reads nothing from a log", async () => {
    const withLatency = { ...devBloodJob("STANDARD_SIM_V1", "ELITE_REALISTIC_V1"), latencyMs: 80 };
    const refused = await prepareSimulation(
      withLatency,
      jsonBytes(withLatency),
      TEST_ARTIFACT,
      RUNNER_SPEC_BINDINGS,
    );
    expect(refused.ok ? "OK" : refused.failure.code).toBe("JOB_REJECTED");
    const env = devBloodJob("STANDARD_SIM_V1", "ELITE_REALISTIC_V1") as unknown as {
      environment: Record<string, unknown>;
    };
    const withWorldLag = { ...env, environment: { ...env.environment, worldLagMs: 80 } };
    const refusedEnv = await prepareSimulation(
      withWorldLag,
      jsonBytes(withWorldLag),
      TEST_ARTIFACT,
      RUNNER_SPEC_BINDINGS,
    );
    expect(refusedEnv.ok ? "OK" : refusedEnv.failure.code).toBe("JOB_REJECTED");
    for (const file of ["execution-profiles.ts", "execution-revision.ts", "execution-activity.ts"]) {
      const text = readFileSync(join(process.cwd(), "src/simulation", file), "utf8");
      expect(text, file).not.toMatch(/from ["'][^"']*(wcl|engine\/normalization|character-profile)/);
    }
  });

  it("P. the execution profile changes only execution lines — never talents, gear or environment", () => {
    const pinned = inputFor(PINNED).split("\n");
    const elite = inputFor(V1).split("\n");
    const differing = elite.filter((line) => !pinned.includes(line)).map((line) => line.split("=")[0]);
    expect(differing.sort()).toEqual(["reaction_time_mean", "reaction_time_nu", "reaction_time_stddev"]);
  });

  // R (provenance of a real run) lives in runner-and-parser.test.ts: it launches the
  // fake engine, and that file's temp-directory assertions must not race it.

  it("Q. a profile change changes job and cache identity — even between identical settings", async () => {
    const keys = async (profileId: string) => {
      const profile = executionProfileById(profileId) as ExecutionProfile;
      return await simulationCacheKeys(
        job(profileId),
        BLOOD_SIMULATION_BINDING,
        TEST_ARTIFACT,
        profile,
        POLICY,
      );
    };
    const v1 = await keys("ELITE_REALISTIC_V1");
    expect((await keys("SIMC_DEFAULT_PINNED")).engineRunKey).not.toBe(v1.engineRunKey);
    const sameSettings = await keys("ELITE_CANDIDATE_REACTION");
    expect(sameSettings.executionProfileRevision).not.toBe(v1.executionProfileRevision);
    expect(sameSettings.engineRunKey).not.toBe(v1.engineRunKey);
  });
});
