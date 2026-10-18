/**
 * M11-G3-1: the typed simulation job and the deterministic input builder.
 *
 * The caller can express only structured data; every SimulationCraft
 * directive is runner-owned. These tests prove both directions: a valid job
 * builds exactly the expected, byte-stable text, and every way of smuggling a
 * directive, a path or an "ideal raid" default is refused with a typed
 * failure.
 */

import { describe, expect, it } from "vitest";

import { EXECUTION_PROFILES, executionProfileById } from "../../../src/simulation/execution-profiles.js";
import { buildSimcInput, millisecondsToSecondsText } from "../../../src/simulation/input-builder.js";
import {
  JOB_LIMITS,
  RAID_BUFFS,
  validateSimulationJob,
  type SimulationJob,
} from "../../../src/simulation/job.js";
import { prepareSimulation } from "../../../src/simulation/prepare.js";
import { simulationPolicyById } from "../../../src/simulation/simulation-policy.js";
import { TANK_MODEL_DISCLOSURE } from "../../../src/simulation/tank-model.js";
import { RUNNER_SPEC_BINDINGS } from "../../../runner/spec-bindings.js";
import { BLOOD_SIMULATION_BINDING } from "../../../src/specs/deathknight/blood/simulation-binding.js";
import { devBloodJob, jsonBytes, TEST_ARTIFACT } from "../../support/simulation/dev-blood-job.js";

type Mutable = Record<string, unknown> & ReturnType<typeof devBloodJob>;

const clone = (): Mutable => JSON.parse(JSON.stringify(devBloodJob())) as Mutable;

async function prepare(job: unknown) {
  return await prepareSimulation(job, jsonBytes(job), TEST_ARTIFACT, RUNNER_SPEC_BINDINGS);
}

async function preparedInput(job: unknown): Promise<string> {
  const prepared = await prepare(job);
  if (!prepared.ok) throw new Error(`${prepared.failure.code}: ${prepared.failure.detail}`);
  return prepared.value.input;
}

const failureOf = async (job: unknown) => {
  const prepared = await prepare(job);
  return prepared.ok ? null : prepared.failure;
};

/** Every option key the builder may ever write. Anything else is a defect. */
const ALLOWED_KEYS = new Set([
  "strict_parsing",
  "ptr",
  "iterations",
  "threads",
  "seed",
  "deterministic",
  "target_error",
  "average_range",
  "average_gauss",
  "max_time",
  "fixed_time",
  "vary_combat_length",
  "optimal_raid",
  ...RAID_BUFFS.map((buff) => `override.${buff}`),
  "override.bloodlust",
  "bloodlust_percent",
  "bloodlust_time",
  "strict_gcd_queue",
  "queue_lag",
  "queue_lag_stddev",
  "gcd_lag",
  "gcd_lag_stddev",
  "channel_lag",
  "channel_lag_stddev",
  "queue_gcd_reduction",
  "default_world_lag",
  "default_world_lag_stddev",
  "default_cooldown_tolerance",
  "default_aura_delay",
  "default_aura_delay_stddev",
  "reaction_time",
  "default_skill",
  "travel_variance",
  "tank_dummy",
  "tank_dummy_type",
  "deathknight",
  "spec",
  "level",
  "race",
  "role",
  "talents",
  "potion",
  "flask",
  "food",
  "augmentation",
  "temporary_enchant",
  "head",
  "neck",
  "shoulders",
  "shirt",
  "chest",
  "waist",
  "legs",
  "feet",
  "wrists",
  "hands",
  "finger1",
  "finger2",
  "trinket1",
  "trinket2",
  "back",
  "main_hand",
  "off_hand",
  "tabard",
  "reaction_time_mean",
  "reaction_time_stddev",
  "reaction_time_nu",
  "reaction_time_offset",
  "reaction_time_max",
  "brain_lag",
  "brain_lag_stddev",
  "world_lag",
  "world_lag_stddev",
  "skill",
  "enable_spell_queue",
  "spell_queue_window",
  "ready_trigger",
]);

describe("M11-G3-1 simulation job: structured data only", () => {
  it("A. the development Blood job validates and prepares", async () => {
    const prepared = await prepare(devBloodJob());
    expect(prepared.ok).toBe(true);
  });

  it("B. unknown keys are rejected at every level (no smuggled actions/input/json2)", async () => {
    const smuggles: [string, (job: Mutable) => void][] = [
      ["root actions", (job) => (job["actions"] = "heart_strike")],
      ["root input", (job) => (job["input"] = "/etc/passwd")],
      ["character json2", (job) => ((job.character as Record<string, unknown>)["json2"] = "/tmp/x")],
      [
        "environment raid_events",
        (job) => ((job.environment as Record<string, unknown>)["raid_events"] = "adds"),
      ],
      [
        "policy target_error",
        (job) => ((job.simulationPolicy as Record<string, unknown>)["targetError"] = 0.1),
      ],
      ["gear override", (job) => ((job.character.gear[0] as Record<string, unknown>)["override"] = "x")],
    ];
    for (const [label, mutate] of smuggles) {
      const job = clone();
      mutate(job);
      expect((await failureOf(job))?.code, label).toBe("JOB_REJECTED");
    }
  });

  it("C. identifier fields cannot carry directives, paths, templates or whitespace", async () => {
    const hostile = [
      "x\njson2=/tmp/out.json",
      "a=b",
      "$(potion)",
      "../../etc/passwd",
      "draught of rampant abandon",
      "input=/tmp/x",
      "DRAUGHT",
      "",
    ];
    for (const value of hostile) {
      const job = clone();
      job.character.consumables.potion = value;
      expect((await failureOf(job))?.code, JSON.stringify(value)).toBe("JOB_REJECTED");
      const tench = clone();
      tench.character.consumables.temporaryEnchants = [{ slot: "main_hand", enchant: value }];
      expect((await failureOf(tench))?.code, JSON.stringify(value)).toBe("JOB_REJECTED");
    }
    const talents = clone();
    talents.character.talents.importString = "AAAAAAAAAAAAAAAAAAAAAAAA\nactions=heart_strike";
    expect((await failureOf(talents))?.code).toBe("JOB_REJECTED");
    const slot = clone();
    (slot.character.gear[0] as { slot: string }).slot = "json2";
    expect((await failureOf(slot))?.code).toBe("JOB_REJECTED");
  });

  it("D. the built input contains only allow-listed keys and no forbidden directive", async () => {
    const input = await preparedInput(devBloodJob());
    const lines = input.trimEnd().split("\n");
    for (const line of lines) {
      const at = line.indexOf("=");
      expect(at, `bare token: ${line}`).toBeGreaterThan(0);
      expect(ALLOWED_KEYS.has(line.slice(0, at)), `key: ${line}`).toBe(true);
      expect(line).not.toMatch(/\$\(|\s/);
    }
    const forbidden =
      /^(input|output|json|json2|html|log|debug|save\w*|armory|guild|wowhead|local_json|player|proxy|item_db_source|spell_query\w*|profileset\S*|actions\+?|raid_events\+?|override\.(spell_data|target_health)|allow_experimental\w*|ptr=1)=/m;
    expect(input).not.toMatch(forbidden);
  });

  it("E. the builder is deterministic and carries no names, report ids, paths or timestamps", async () => {
    const first = await preparedInput(devBloodJob());
    const second = await preparedInput(JSON.parse(JSON.stringify(devBloodJob())));
    expect(second).toBe(first);
    expect(first).not.toMatch(/b1PmaKrd6CDfzngc|Vashnik|[A-Za-z]:\\|\/tmp\/|\/home\/|20\d\d-\d\d-\d\d/);
    expect(first).toContain("deathknight=Subject\n");
    expect(first).toContain("tank_dummy=Target\n");
  });

  it("F. strict parsing is on, PTR off, and the tank model precedes the player", async () => {
    const lines = (await preparedInput(devBloodJob())).split("\n");
    expect(lines.slice(0, 2)).toEqual(["strict_parsing=1", "ptr=0"]);
    const target = lines.indexOf("tank_dummy=Target");
    expect(lines[target + 1]).toBe("tank_dummy_type=mythic");
    expect(target).toBeLessThan(lines.indexOf("deathknight=Subject"));
    expect(TANK_MODEL_DISCLOSURE).toMatch(/standardized input, not a reconstruction/);
  });

  it("G. an unsupported spec is UNSUPPORTED_SPEC, not a Blood job", async () => {
    const job = clone();
    (job.character as { spec: string }).spec = "deathknight/frost";
    expect((await failureOf(job))?.code).toBe("UNSUPPORTED_SPEC");
    // A runner composed without the Blood binding cannot simulate Blood.
    const unbound = await prepareSimulation(devBloodJob(), jsonBytes(devBloodJob()), TEST_ARTIFACT, []);
    expect(unbound.ok ? "OK" : unbound.failure.code).toBe("UNSUPPORTED_SPEC");
    // The spec's own binding supplies the engine tokens and the reported identity.
    const input = await preparedInput(devBloodJob());
    expect(input).toContain(
      `\n${BLOOD_SIMULATION_BINDING.simcClassToken}=Subject\nspec=${BLOOD_SIMULATION_BINDING.simcSpecToken}\n`,
    );
    expect(input).toContain("\nrole=tank\n");
  });

  it("H. any model other than the pin is UNSUPPORTED_MODEL_VERSION", async () => {
    const job = clone();
    job.model.simcCommit = "af05b9e000000000000000000000000000000000";
    expect((await failureOf(job))?.code).toBe("UNSUPPORTED_MODEL_VERSION");
    const data = clone();
    data.model.gameDataBuild = "12.1.0.69933";
    expect((await failureOf(data))?.code).toBe("UNSUPPORTED_MODEL_VERSION");
  });

  it("I. additional targets are ENVIRONMENT_NOT_REPRESENTABLE (no engagement span becomes availability)", async () => {
    const job = clone();
    (job.environment as { additionalTargets: unknown[] }).additionalTargets = [
      { kind: "OBSERVED_ENGAGEMENT_SPAN", firstHitMs: 30_000, lastHitMs: 60_000 },
    ];
    expect((await failureOf(job))?.code).toBe("ENVIRONMENT_NOT_REPRESENTABLE");
  });

  it("L. limits: payload, iterations, threads and policy drift are JOB_REJECTED", async () => {
    const job = devBloodJob();
    expect(
      (await prepareSimulation(job, JOB_LIMITS.maxPayloadBytes + 1, TEST_ARTIFACT, RUNNER_SPEC_BINDINGS)).ok,
    ).toBe(false);
    const huge = clone();
    huge.simulationPolicy.iterations = JOB_LIMITS.maxIterations + 1;
    expect((await failureOf(huge))?.code).toBe("JOB_REJECTED");
    const drift = clone();
    drift.simulationPolicy.iterations = 1_999;
    expect((await failureOf(drift))?.code).toBe("JOB_REJECTED");
    const seed = clone();
    seed.simulationPolicy.seed = 7;
    expect((await failureOf(seed))?.code).toBe("JOB_REJECTED");
    const threads = clone();
    threads.simulationPolicy.threads = 64;
    expect((await failureOf(threads))?.code).toBe("JOB_REJECTED");
    const nondeterministic = clone();
    (nondeterministic.simulationPolicy as { deterministic: boolean }).deterministic = false;
    expect((await failureOf(nondeterministic))?.code).toBe("JOB_REJECTED");
    const profile = clone();
    profile.executionProfileId = "ELITE_REALISTIC_V2";
    expect((await failureOf(profile))?.code).toBe("JOB_REJECTED");
  });
});

describe("M11-G3-1 input builder: observed environment, no ideal defaults", () => {
  it("N. no raid buff is present unless listed; optimal_raid=0 comes first", async () => {
    const lines = (await preparedInput(devBloodJob())).split("\n");
    const optimal = lines.indexOf("optimal_raid=0");
    expect(optimal).toBeGreaterThan(0);
    for (const buff of RAID_BUFFS) {
      const at = lines.indexOf(`override.${buff}=0`);
      expect(at, buff).toBeGreaterThan(optimal);
    }
    const listed = clone();
    listed.environment.raidBuffs.active = ["battle_shout", "mystic_touch"] as never[];
    const input = await preparedInput(listed);
    expect(input).toContain("override.battle_shout=1\n");
    expect(input).toContain("override.mystic_touch=1\n");
    expect(input).toContain("override.arcane_intellect=0\n");
    const duplicate = clone();
    duplicate.environment.raidBuffs.active = ["battle_shout", "battle_shout"] as never[];
    expect((await failureOf(duplicate))?.code).toBe("JOB_REJECTED");
  });

  it("N. Bloodlust is the observed time, or explicitly off — never lust-at-pull by default", async () => {
    const at = await preparedInput(devBloodJob());
    expect(at).toContain("override.bloodlust=1\nbloodlust_percent=0\nbloodlust_time=5\n");
    const none = clone();
    (none.environment as { bloodlust: unknown }).bloodlust = { kind: "NONE", provenance: "ACTUAL_OBSERVED" };
    const off = await preparedInput(none);
    expect(off).toContain("override.bloodlust=0\n");
    expect(off).not.toContain("bloodlust_time");
    const late = clone();
    (late.environment as { bloodlust: unknown }).bloodlust = {
      kind: "AT",
      provenance: "ACTUAL_OBSERVED",
      atMs: 400_000,
    };
    expect((await failureOf(late))?.code).toBe("JOB_REJECTED");
    const missing = clone();
    delete (missing.environment as { bloodlust?: unknown }).bloodlust;
    expect((await failureOf(missing))?.code).toBe("JOB_REJECTED");
  });

  it("O. a NONE consumable is written as disabled, never omitted (omission = class default)", async () => {
    const job = clone();
    Object.assign(job.character.consumables, {
      potion: "NONE",
      flask: "NONE",
      food: "NONE",
      augmentation: "NONE",
      temporaryEnchants: [],
    });
    const input = await preparedInput(job);
    for (const key of ["potion", "flask", "food", "augmentation", "temporary_enchant"]) {
      expect(input).toContain(`\n${key}=disabled\n`);
    }
    const missing = clone();
    delete (missing.character.consumables as { flask?: unknown }).flask;
    expect((await failureOf(missing))?.code).toBe("JOB_REJECTED");
  });

  it("O. gear writes ids only: bonus/gem/enchant ids when KNOWN, nothing invented when KNOWN_NONE", async () => {
    const input = await preparedInput(devBloodJob());
    expect(input).toContain(
      "\nhead=,id=271474,bonus_id=6652/13696/13440/13692/13698/12846,enchant_id=7991\n",
    );
    expect(input).toContain(
      "\nneck=,id=268265,bonus_id=6652/13668/13334/13987/12854/13696,gem_id=240983/240916\n",
    );
    expect(input).toContain("\ntabard=,id=167811\n");
    const unknownEnchant = clone();
    (unknownEnchant.character.gear[0] as { enchant: unknown }).enchant = { kind: "UNKNOWN" };
    expect((await failureOf(unknownEnchant))?.code).toBe("JOB_REJECTED");
    const duplicate = clone();
    duplicate.character.gear.push(duplicate.character.gear[0] as never);
    expect((await failureOf(duplicate))?.code).toBe("JOB_REJECTED");
  });

  it("P. times are written so the engine's truncating parse recovers the exact millisecond", () => {
    expect(millisecondsToSecondsText(345_177)).toBe("345.177");
    expect(millisecondsToSecondsText(5)).toBe("0.005");
    expect(millisecondsToSecondsText(1_400)).toBe("1.4");
    expect(millisecondsToSecondsText(0)).toBe("0");
    // "1.001" * 1000 truncates to 1000 in IEEE doubles: the midpoint is written instead.
    expect(Math.trunc(Number("1.001") * 1000)).toBe(1000);
    expect(millisecondsToSecondsText(1_001)).toBe("1.0015");
    const mismatches: number[] = [];
    for (let ms = 0; ms <= 1_200_000; ms += 1) {
      if (Math.trunc(Number(millisecondsToSecondsText(ms)) * 1000) !== ms) mismatches.push(ms);
    }
    expect(mismatches).toEqual([]);
    expect(() => millisecondsToSecondsText(37.5)).toThrow(RangeError);
    expect(() => millisecondsToSecondsText(-1)).toThrow(RangeError);
  });

  it("Q. every execution option is explicit, and distinct settings give distinct input", async () => {
    const bySettings = new Map<string, string>();
    for (const profile of EXECUTION_PROFILES) {
      const input = await preparedInput(devBloodJob("STANDARD_SIM_V1", profile.id));
      const settings = JSON.stringify({ sim: profile.sim, player: profile.player });
      // The input depends only on the settings; identity lives in the revision and cache key.
      if (bySettings.has(settings)) expect(input, profile.id).toBe(bySettings.get(settings));
      bySettings.set(settings, input);
      for (const key of [
        "queue_lag",
        "gcd_lag",
        "channel_lag",
        "default_world_lag",
        "default_cooldown_tolerance",
        "reaction_time_mean",
        "reaction_time_nu",
        "reaction_time_max",
        "brain_lag",
        "skill",
        "enable_spell_queue",
        "spell_queue_window",
        "ready_trigger",
      ]) {
        expect(input, `${profile.id} ${key}`).toMatch(new RegExp(`\\n${key}=`));
      }
      for (const value of [...Object.values(profile.sim), ...Object.values(profile.player)]) {
        if (typeof value === "number")
          expect(Number.isInteger(value) || value <= 1, `${profile.id} ${String(value)}`).toBe(true);
      }
    }
    expect(new Set(bySettings.values()).size).toBe(bySettings.size);
    const elite = executionProfileById("ELITE_REALISTIC_V1");
    expect(elite?.status).toBe("PRODUCTION");
  });

  it("Q. the pinned profile writes the effective (integer-ms) engine defaults", async () => {
    const input = await preparedInput(devBloodJob());
    for (const line of [
      "queue_lag=0.005",
      "queue_lag_stddev=0.001",
      "gcd_lag=0.15",
      "gcd_lag_stddev=0.037",
      "channel_lag=0.25",
      "channel_lag_stddev=0.062",
      "queue_gcd_reduction=0.1",
      "default_world_lag=0.1",
      "default_world_lag_stddev=0.01",
      "default_cooldown_tolerance=0.25",
      "default_aura_delay=0.03",
      "default_aura_delay_stddev=0.005",
      "reaction_time=0.5",
      "reaction_time_mean=0.25",
      "reaction_time_stddev=0.05",
      "reaction_time_nu=0.15",
      "reaction_time_offset=0.1",
      "reaction_time_max=1.4",
      "strict_gcd_queue=0",
    ]) {
      expect(input).toContain(`\n${line}\n`);
    }
  });

  it("R. policies are deterministic, fixed, and never target_error", async () => {
    const input = await preparedInput(devBloodJob());
    const policy = simulationPolicyById("STANDARD_SIM_V1");
    expect(input).toContain(
      `\niterations=${String(policy?.iterations)}\nthreads=${String(policy?.threads)}\nseed=${String(policy?.seed)}\ndeterministic=1\ntarget_error=0\n`,
    );
    expect(input).toContain("\nmax_time=345.177\nfixed_time=1\nvary_combat_length=0\n");
  });

  it("validateSimulationJob is the same gate prepare uses", () => {
    const job = devBloodJob() as unknown as SimulationJob;
    expect(validateSimulationJob(job, jsonBytes(job), RUNNER_SPEC_BINDINGS).ok).toBe(true);
    const policy = simulationPolicyById("STANDARD_SIM_V1");
    const profile = executionProfileById("SIMC_DEFAULT_PINNED");
    if (policy === undefined || profile === undefined) throw new Error("registry");
    expect(buildSimcInput(job, BLOOD_SIMULATION_BINDING, profile, policy).endsWith("\n")).toBe(true);
  });
});
