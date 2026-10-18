/**
 * M11-G3-3: execution-profile evidence on the APPROVED exact-pin engine.
 *
 * Descriptive only: nothing here selects ELITE_REALISTIC_V1 by DPS.
 *
 *   1. millisecond truncation re-check: a 37.5 ms text runs as 37 ms;
 *   2. Blood candidate benchmark (development job, STANDARD_SIM_V1): mean,
 *      relative difference vs the pinned reference, precision, runtime, and
 *      per-action execute counts;
 *   3. Blood option activity: from ELITE_REALISTIC_V1, change ONE field at a
 *      time on a single-threaded deterministic run (bit-reproducible) — an
 *      unchanged result confirms the semantic INACTIVE classification, a
 *      changed one confirms ACTIVE;
 *   4. non-Blood sanity (probe-only raw input, the engine's own default APL and
 *      default talents, no gear): Fire Mage (`buff.hot_streak.react`) reaction
 *      sensitivity and Arcane Mage (Arcane Missiles channel) channel-lag
 *      sensitivity;
 *   5. with WRITE_GOLDEN=1, re-cut the G3-1 development golden under the
 *      pinned reference profile.
 *
 * Output: .probe/m11g3/g33/report.json. Docker `--network none`.
 *
 *     SIMC_IMAGE=sha256:<id> npx vitest run --config scripts/bench/vitest.config.ts scripts/bench/m11g33-execution-profiles.bench.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APPROVED_ENGINE_ARTIFACTS } from "../../runner/approved-artifacts.js";
import { DockerLauncher } from "../../runner/engine-launcher.js";
import { DEFAULT_RUNNER_LIMITS } from "../../runner/limits.js";
import { RUNNER_SPEC_BINDINGS } from "../../runner/spec-bindings.js";
import { EXECUTION_PROFILES } from "../../src/simulation/execution-profiles.js";
import { prepareSimulation } from "../../src/simulation/prepare.js";
import { parseSimcJson } from "../../src/simulation/result-parser.js";
import { devBloodJob, jsonBytes } from "../../tests/support/simulation/dev-blood-job.js";
import { goldenProjection } from "../../tests/support/simulation/golden.js";

declare const process: any;

const IMAGE: string | undefined = process.env["SIMC_IMAGE"];
const OUT = join(".probe", "m11g3", "g33");
const GOLDEN = join("tests", "fixtures", "simulation", "simc-33622e9d-blood-dev-standard.json");

type Json = Record<string, any>;

describe.skipIf(IMAGE === undefined)("M11-G3-3 execution profiles on the exact pin", () => {
  it("measures, never selects", { timeout: 3_600_000 }, async () => {
    mkdirSync(OUT, { recursive: true });
    const artifact = APPROVED_ENGINE_ARTIFACTS[0];
    if (artifact === undefined) throw new Error("no approved artifact");
    const launcher = new DockerLauncher(
      {
        imageRef: IMAGE ?? "",
        dockerExecutable: process.env["DOCKER_EXE"] ?? "docker",
        cpus: 8,
        cliEnv: process.env,
      },
      { ...DEFAULT_RUNNER_LIMITS, maxWallClockMs: 120_000 },
    );
    expect(await launcher.resolveBinarySha256()).toBe(artifact.binarySha256);
    const report: Json = { binarySha256: artifact.binarySha256 };
    const save = () => writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 1), "utf8");

    const raw = async (input: string): Promise<Json> => {
      const launched = await launcher.launch({ input, timeoutMs: 120_000 });
      if (launched.kind !== "COMPLETED")
        throw new Error(`${launched.kind} ${"detail" in launched ? launched.detail : ""}`);
      return {
        json: JSON.parse(launched.json) as Json,
        text: launched.json,
        bytes: launched.jsonBytes,
        wallMs: launched.wallMs,
      };
    };
    const inputFor = async (policyId: string, profileId: string) => {
      const job = devBloodJob(policyId, profileId);
      const prepared = await prepareSimulation(job, jsonBytes(job), artifact, RUNNER_SPEC_BINDINGS);
      if (!prepared.ok) throw new Error(prepared.failure.detail);
      return prepared.value;
    };

    // 1. Truncation re-check.
    const truncInput = (await inputFor("BENCHMARK_300_T1", "SIMC_DEFAULT_PINNED")).input.replace(
      "\ngcd_lag_stddev=0.037\n",
      "\ngcd_lag_stddev=0.0375\n",
    );
    const trunc = await raw(truncInput);
    report.truncation = { configuredText: "0.0375", echoedSeconds: trunc.json["sim"].options.gcd_lag_stddev };
    save();

    // 2. Blood candidates, through the full parser path.
    report.blood = [];
    for (const profile of EXECUTION_PROFILES) {
      const prepared = await inputFor("STANDARD_SIM_V1", profile.id);
      const run = await raw(prepared.input);
      const parsed = parseSimcJson(run.text, run.bytes, {
        job: prepared.job,
        binding: prepared.binding,
        profile: prepared.profile,
        policy: prepared.policy,
        approved: artifact,
        executedBinarySha256: artifact.binarySha256,
        profileHash: prepared.keys.profileHash,
        environmentHash: prepared.keys.environmentHash,
        executionProfileRevision: prepared.keys.executionProfileRevision,
      });
      if (!parsed.ok) throw new Error(`${profile.id}: ${parsed.failure.code} ${parsed.failure.detail}`);
      const executes = Object.fromEntries(
        (run.json["sim"].players[0].stats as Json[])
          .filter((s) => s["num_executes"])
          .map((s) => [s["name"], s["num_executes"].mean]),
      );
      report.blood.push({
        profileId: profile.id,
        status: profile.status,
        revision: prepared.keys.executionProfileRevision,
        dps: parsed.value.dps,
        engineSeconds: parsed.value.diagnostics.engineWallSeconds,
        wallMs: run.wallMs,
        executes,
      });
      save();
      if (profile.id === "SIMC_DEFAULT_PINNED" && process.env["WRITE_GOLDEN"] === "1") {
        const golden = goldenProjection(run.text, {
          source: `approved engine ${artifact.binarySha256}`,
          job: "devBloodJob('STANDARD_SIM_V1', 'SIMC_DEFAULT_PINNED')",
          jobProfileHash: prepared.keys.profileHash,
        });
        writeFileSync(GOLDEN, `${JSON.stringify(golden, null, 1)}\n`, "utf8");
      }
    }

    // 3. Blood option activity: one field at a time from ELITE_REALISTIC_V1, single thread.
    const base = (await inputFor("BENCHMARK_300_T1", "ELITE_REALISTIC_V1")).input;
    const perturbations: [string, string, string][] = [
      ["queueLagMs", "queue_lag=0.005", "queue_lag=0.05"],
      ["gcdLagMs", "gcd_lag=0.15", "gcd_lag=0.3"],
      ["queueGcdReductionMs", "queue_gcd_reduction=0.1", "queue_gcd_reduction=0.05"],
      ["channelLagMs", "channel_lag=0.25", "channel_lag=0.5"],
      ["worldLagMs (player)", "\nworld_lag=0.1\n", "\nworld_lag=0.2\n"],
      ["cooldownToleranceMs", "default_cooldown_tolerance=0.25", "default_cooldown_tolerance=0"],
      ["auraDelayMs", "default_aura_delay=0.03", "default_aura_delay=0.1"],
      ["simReactionTimeMs", "\nreaction_time=0.5\n", "\nreaction_time=1\n"],
      ["reactionTimeMeanMs", "reaction_time_mean=0.2", "reaction_time_mean=0.4"],
      ["brainLagMs", "\nbrain_lag=0\n", "\nbrain_lag=0.3\n"],
      ["readyTrigger", "ready_trigger=0", "ready_trigger=1"],
      ["enableSpellQueue", "enable_spell_queue=0", "enable_spell_queue=1"],
      ["strictGcdQueue", "strict_gcd_queue=0", "strict_gcd_queue=1"],
      ["travelVariance", "travel_variance=0", "travel_variance=0.5"],
    ];
    const baseRun = await raw(base);
    const baseDps = baseRun.json["sim"].players[0].collected_data.dps.mean as number;
    report.activity = [];
    for (const [field, from, to] of perturbations) {
      if (!base.includes(from)) throw new Error(`perturbation anchor missing: ${from}`);
      const run = await raw(base.replace(from, to));
      const dps = run.json["sim"].players[0].collected_data.dps.mean as number;
      report.activity.push({
        field,
        change: `${from.trim()} -> ${to.trim()}`,
        identical: dps === baseDps,
        relative: dps / baseDps - 1,
      });
      save();
    }

    // 4. Non-Blood sanity: engine default APL + default talents, probe-only raw input.
    const lines = base.split("\n");
    const simLines = lines.slice(0, lines.indexOf("tank_dummy=Target"));
    const execPlayer = lines.filter((line) =>
      /^(reaction_time_(mean|stddev|nu|offset|max)|brain_lag|brain_lag_stddev|world_lag|world_lag_stddev|skill|enable_spell_queue|spell_queue_window|ready_trigger)=/.test(
        line,
      ),
    );
    const mage = (spec: string, edits: [string, string][]) => {
      let text = [
        ...simLines,
        "enemy=Target",
        "mage=Probe",
        `spec=${spec}`,
        "level=90",
        "race=human",
        "role=spell",
        "load_default_talents=1",
        "potion=disabled",
        "flask=disabled",
        "food=disabled",
        "augmentation=disabled",
        "temporary_enchant=disabled",
        ...execPlayer,
      ].join("\n");
      for (const [from, to] of edits) text = text.replace(from, to);
      return `${text}\n`;
    };
    const mageRun = async (label: string, spec: string, edits: [string, string][]) => {
      const run = await raw(mage(spec, edits));
      const player = run.json["sim"].players[0];
      return {
        label,
        logs: run.json["logs"] ?? null,
        dps: player.collected_data.dps.mean as number,
        reactionEcho: player.reaction_mean,
        channelEcho: run.json["sim"].options.channel_lag,
        arcaneMissiles:
          ((player.stats ?? []) as Json[]).find((s) => s["name"] === "arcane_missiles")?.["num_executes"]
            ?.mean ?? null,
      };
    };
    report.nonBlood = [
      await mageRun("fire / reaction elite (V1)", "fire", []),
      await mageRun("fire / reaction pinned 500 ms", "fire", [
        ["reaction_time_mean=0.2", "reaction_time_mean=0.25"],
        ["reaction_time_nu=0.1", "reaction_time_nu=0.15"],
        ["reaction_time_stddev=0.04", "reaction_time_stddev=0.05"],
      ]),
      await mageRun("arcane / channel lag 250 ms (V1)", "arcane", []),
      await mageRun("arcane / channel lag 0 ms", "arcane", [
        ["channel_lag=0.25", "channel_lag=0"],
        ["channel_lag_stddev=0.062", "channel_lag_stddev=0"],
      ]),
    ];
    save();
  });
});
