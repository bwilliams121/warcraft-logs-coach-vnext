/**
 * M11-G3-1: the runner process boundary and the fail-closed result parser,
 * exercised end to end against a FAKE engine (tests/support/simulation/
 * fake-simc.mjs). The fake parses the builder's text independently and
 * echoes it the way the pinned report writer does; it is never a source of
 * DPS. The real-engine golden artifact is covered separately.
 *
 * Every deliberate fault must end in its typed failure — never a number.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { DirectLauncher, DockerLauncher, type LaunchOutcome } from "../../../runner/engine-launcher.js";
import { DEFAULT_RUNNER_LIMITS, JobSlots, type RunnerLimits } from "../../../runner/limits.js";
import { runSimulationJob } from "../../../runner/run-simulation.js";
import { RUNNER_SPEC_BINDINGS } from "../../../runner/spec-bindings.js";
import { executionProfileById } from "../../../src/simulation/execution-profiles.js";
import type { SimulationJob } from "../../../src/simulation/job.js";
import { APPROVED_SIMC_MODEL, type ApprovedEngineArtifact } from "../../../src/simulation/model.js";
import { prepareSimulation } from "../../../src/simulation/prepare.js";
import {
  MAX_ENGINE_OUTPUT_BYTES,
  parseSimcJson,
  type ParseContext,
} from "../../../src/simulation/result-parser.js";
import { firstSemanticDifference, type SimulationResult } from "../../../src/simulation/result.js";
import {
  RESULT_REPRODUCIBILITY_TOLERANCE,
  simulationPolicyById,
} from "../../../src/simulation/simulation-policy.js";
import { devBloodJob, jsonBytes } from "../../support/simulation/dev-blood-job.js";

declare const process: { execPath: string; cwd(): string };

const FAKE = join(process.cwd(), "tests", "support", "simulation", "fake-simc.mjs");
const FAKE_SHA = createHash("sha256").update(readFileSync(FAKE)).digest("hex");
const ARTIFACT: ApprovedEngineArtifact = {
  model: APPROVED_SIMC_MODEL,
  binarySha256: FAKE_SHA,
  buildRecipeRevision: "fake",
};
const LIMITS: RunnerLimits = { ...DEFAULT_RUNNER_LIMITS, maxConcurrentJobs: 4 };

const fake = (mode: string, limits: RunnerLimits = LIMITS) =>
  new DirectLauncher({ executable: process.execPath, leadingArgs: [FAKE, mode], binaryToHash: FAKE }, limits);

const deps = (
  mode: string,
  overrides: Partial<{ limits: RunnerLimits; slots: JobSlots; artifact: ApprovedEngineArtifact | null }> = {},
) => ({
  artifact: overrides.artifact === undefined ? ARTIFACT : overrides.artifact,
  launcher: fake(mode, overrides.limits ?? LIMITS),
  bindings: RUNNER_SPEC_BINDINGS,
  limits: overrides.limits ?? LIMITS,
  slots: overrides.slots ?? new JobSlots(4),
});

const run = async (mode: string, job: unknown = devBloodJob(), overrides = {}) =>
  await runSimulationJob(job, jsonBytes(job), deps(mode, overrides));

const codeOf = (report: Awaited<ReturnType<typeof run>>) =>
  report.outcome.ok ? "OK" : report.outcome.failure.code;

const leftoverJobDirs = () =>
  readdirSync(tmpdir(), { recursive: false, withFileTypes: false }).filter((name) =>
    name.startsWith("wlc-simc-"),
  );

describe("M11-G3-1 runner: one job, end to end through the fake engine", () => {
  it("S. a valid job produces a typed result with identity, precision and provenance", async () => {
    const report = await run("ok");
    expect(report.outcome.ok).toBe(true);
    if (!report.outcome.ok) return;
    const result = report.outcome.value;
    expect(result.schemaVersion).toBe("simulation-result/1");
    expect(result.model).toEqual({
      requestedSimcCommit: APPROVED_SIMC_MODEL.simcCommit,
      reportedGitRevision: "33622e9",
      gameDataBuild: "12.1.0.69587",
      binarySha256: FAKE_SHA,
      buildRecipeRevision: "fake",
    });
    expect(result.iterations).toEqual({ requested: 2_000, counted: 1_992 });
    expect(result.dps.mean).toBe(50_000);
    expect(result.dps.ci95.lower).toBeLessThan(result.dps.mean);
    expect(result.dps.ci95.upper).toBeGreaterThan(result.dps.mean);
    expect(result.executionProfile).toEqual({ id: "SIMC_DEFAULT_PINNED", version: 1 });
    expect(result.simulationPolicy).toEqual({ id: "STANDARD_SIM_V1", version: 1 });
    expect(result.provenance.durationAssumption).toBe("EXACT_OBSERVED_DURATION_CEILING_ASSUMPTION");
    expect(result.provenance.tankModel).toBe("STANDARD_TANK_LOAD_V1");
    expect(result.provenance.consumablesProvenance).toBe("DEVELOPMENT_FIXTURE");
    expect(result.actionBreakdown?.[0]?.actionName).toBe("heart_strike");
    expect(result.petBreakdown).toEqual([{ petName: "bloodworm", meanDamagePerIteration: 10_000 }]);
    expect(JSON.stringify(result)).not.toMatch(/MATCH|REJECTED|wlc-simc-|[A-Za-z]:\\\\/);
  });

  it("V. the engine gets exactly <dir>/job.simc and json2=<dir>/out.json, an empty environment, and the builder's text", async () => {
    const prepared = await prepareSimulation(
      devBloodJob(),
      jsonBytes(devBloodJob()),
      ARTIFACT,
      RUNNER_SPEC_BINDINGS,
    );
    if (!prepared.ok) throw new Error("prepare");
    const launched = await fake("echo-args").launch({ input: prepared.value.input, timeoutMs: 20_000 });
    expect(launched.kind).toBe("COMPLETED");
    if (launched.kind !== "COMPLETED") return;
    const echoed = JSON.parse(launched.json) as { argv: string[]; env: string[]; cwd: string };
    const [mode, jobPath, jsonArg, ...rest] = echoed.argv;
    expect(mode).toBe("echo-args");
    expect(rest).toEqual([]);
    expect(jobPath).toBe(join(echoed.cwd, "job.simc"));
    expect(jsonArg).toBe(`json2=${join(echoed.cwd, "out.json")}`);
    expect(echoed.cwd.startsWith(tmpdir())).toBe(true);
    // The runner passes an EMPTY environment. On Windows, libuv always adds its
    // fixed set of required variables to a child; on Linux nothing is added.
    // Either way no runner or caller variable (e.g. WCL_*) reaches the engine.
    const LIBUV_WINDOWS_REQUIRED =
      /^(HOMEDRIVE|HOMEPATH|LOGONSERVER|PATH|SYSTEMDRIVE|SYSTEMROOT|TEMP|USERDOMAIN|USERNAME|USERPROFILE|WINDIR)$/i;
    expect(echoed.env.filter((key) => !LIBUV_WINDOWS_REQUIRED.test(key))).toEqual([]);
  });

  it("U. the per-job directory is removed after success and after failure", async () => {
    const before = leftoverJobDirs().length;
    await run("ok");
    await run("exit-nonzero");
    expect(leftoverJobDirs().length).toBe(before);
  });

  it("U. engine faults map to typed failures, never to a number", async () => {
    expect(codeOf(await run("exit-nonzero"))).toBe("SIMULATION_ENGINE_FAILED");
    expect(codeOf(await run("no-output"))).toBe("SIMULATION_ENGINE_FAILED");
    expect(codeOf(await run("oversize"))).toBe("SIMULATION_OUTPUT_MALFORMED");
    expect(codeOf(await run("zero-dps"))).toBe("SIMULATION_OUTPUT_MALFORMED");
    expect(codeOf(await run("wrong-revision"))).toBe("MODEL_PROVENANCE_MISMATCH");
  });

  it("U. an engine failure detail never carries the host temp path", async () => {
    const report = await run("exit-nonzero");
    expect(report.outcome.ok).toBe(false);
    if (report.outcome.ok) return;
    expect(report.outcome.failure.detail).toContain("<job>");
    expect(report.outcome.failure.detail).not.toContain(tmpdir());
  });

  it("U. a hung engine is killed at the wall-clock cap: SIMULATION_TIMEOUT", async () => {
    const limits = { ...LIMITS, maxWallClockMs: 1_500 };
    const started = Date.now();
    expect(codeOf(await run("hang", devBloodJob(), { limits }))).toBe("SIMULATION_TIMEOUT");
    expect(Date.now() - started).toBeLessThan(15_000);
  });

  it("U. cancellation is CANCELLED", async () => {
    const controller = new AbortController();
    const pending = runSimulationJob(
      devBloodJob(),
      jsonBytes(devBloodJob()),
      deps("hang"),
      controller.signal,
    );
    setTimeout(() => controller.abort(), 300);
    expect(codeOf(await pending)).toBe("CANCELLED");
  });

  it("U. a missing engine is RUNNER_UNAVAILABLE; a runner with no artifact is RUNNER_UNAVAILABLE", async () => {
    const missing = new DirectLauncher({ executable: join(tmpdir(), "no-such-simc-binary") }, LIMITS);
    const report = await runSimulationJob(devBloodJob(), jsonBytes(devBloodJob()), {
      ...deps("ok"),
      launcher: missing,
    });
    expect(codeOf(report)).toBe("RUNNER_UNAVAILABLE");
    expect(codeOf(await run("ok", devBloodJob(), { artifact: null }))).toBe("RUNNER_UNAVAILABLE");
  });

  it("U. a full runner is RUNNER_OVERLOADED; threads above the core limit are JOB_REJECTED", async () => {
    const slots = new JobSlots(1);
    const release = slots.tryAcquire();
    expect(codeOf(await run("ok", devBloodJob(), { slots }))).toBe("RUNNER_OVERLOADED");
    release?.();
    expect(codeOf(await run("ok", devBloodJob(), { slots }))).toBe("OK");
    expect(slots.inUse).toBe(0);
    expect(codeOf(await run("ok", devBloodJob(), { limits: { ...LIMITS, coreLimit: 4 } }))).toBe(
      "JOB_REJECTED",
    );
  });

  it("U. the Docker launcher refuses image tags; only digest references run", () => {
    const options = { dockerExecutable: "docker", cpus: 8, cliEnv: {} };
    expect(() => new DockerLauncher({ ...options, imageRef: "wlc-simc:33622e9d" }, LIMITS)).toThrow(/digest/);
    expect(() => new DockerLauncher({ ...options, imageRef: "wlc-simc:latest" }, LIMITS)).toThrow(/digest/);
    expect(() => new DockerLauncher({ ...options, imageRef: `sha256:${"a".repeat(63)}` }, LIMITS)).toThrow(
      /digest/,
    );
    expect(
      () => new DockerLauncher({ ...options, imageRef: `wlc-simc@sha256:${"a".repeat(64)}` }, LIMITS),
    ).not.toThrow();
    expect(
      () => new DockerLauncher({ ...options, imageRef: `sha256:${"a".repeat(64)}` }, LIMITS),
    ).not.toThrow();
  });
});

describe("M11-G3-1 result parser: fail closed on anything but the job that was run", () => {
  let baseJson = "";
  let context: ParseContext;

  beforeAll(async () => {
    const job = devBloodJob();
    const prepared = await prepareSimulation(job, jsonBytes(job), ARTIFACT, RUNNER_SPEC_BINDINGS);
    if (!prepared.ok) throw new Error("prepare");
    const launched: LaunchOutcome = await fake("ok").launch({
      input: prepared.value.input,
      timeoutMs: 20_000,
    });
    if (launched.kind !== "COMPLETED") throw new Error(launched.kind);
    baseJson = launched.json;
    context = {
      job: prepared.value.job,
      binding: prepared.value.binding,
      profile: prepared.value.profile,
      policy: prepared.value.policy,
      approved: ARTIFACT,
      executedBinarySha256: FAKE_SHA,
      profileHash: prepared.value.keys.profileHash,
      environmentHash: prepared.value.keys.environmentHash,
    };
  });

  const parseMutated = (mutate: (report: Record<string, any>) => void, ctx: ParseContext = context) => {
    const report = JSON.parse(baseJson) as Record<string, any>;
    mutate(report);
    const text = JSON.stringify(report);
    return parseSimcJson(text, text.length, ctx);
  };
  const code = (outcome: ReturnType<typeof parseSimcJson>) => (outcome.ok ? "OK" : outcome.failure.code);

  it("the unmodified fake report parses", () => {
    expect(code(parseMutated(() => undefined))).toBe("OK");
  });

  it("format: not JSON, unknown report version, missing fields and oversize are MALFORMED", () => {
    expect(code(parseSimcJson("{", 1, context))).toBe("SIMULATION_OUTPUT_MALFORMED");
    expect(code(parseSimcJson(baseJson, MAX_ENGINE_OUTPUT_BYTES + 1, context))).toBe(
      "SIMULATION_OUTPUT_MALFORMED",
    );
    expect(code(parseMutated((r) => (r["report_version"] = "3.0.0")))).toBe("SIMULATION_OUTPUT_MALFORMED");
    expect(code(parseMutated((r) => delete r["sim"].players[0].collected_data))).toBe(
      "SIMULATION_OUTPUT_MALFORMED",
    );
    expect(code(parseMutated((r) => (r["sim"].options.iterations = "2000")))).toBe(
      "SIMULATION_OUTPUT_MALFORMED",
    );
  });

  it("provenance: revision, game data, PTR data, networking and binary hash", () => {
    expect(code(parseMutated((r) => delete r["git_revision"]))).toBe("MODEL_PROVENANCE_MISMATCH");
    expect(code(parseMutated((r) => (r["git_revision"] = "af05b9e")))).toBe("MODEL_PROVENANCE_MISMATCH");
    expect(code(parseMutated((r) => (r["sim"].options.dbc.Live.wow_version = "12.1.0.69933")))).toBe(
      "MODEL_PROVENANCE_MISMATCH",
    );
    expect(code(parseMutated((r) => (r["sim"].options.dbc.version_used = "PTR")))).toBe(
      "MODEL_PROVENANCE_MISMATCH",
    );
    expect(code(parseMutated((r) => delete r["no_networking"]))).toBe("MODEL_PROVENANCE_MISMATCH");
    expect(code(parseMutated(() => undefined, { ...context, executedBinarySha256: "2".repeat(64) }))).toBe(
      "MODEL_PROVENANCE_MISMATCH",
    );
  });

  it("echo: the engine must have run the job's settings", () => {
    const faults: [string, (r: Record<string, any>) => void][] = [
      ["iterations", (r) => (r["sim"].options.iterations = 1_000)],
      ["threads", (r) => (r["sim"].options.threads = 12)],
      ["deterministic", (r) => (r["sim"].options.deterministic = 0)],
      ["target_error", (r) => (r["sim"].options.target_error = 0.05)],
      ["max_time", (r) => (r["sim"].options.max_time = 345.176)],
      ["fixed_time", (r) => (r["sim"].options.fixed_time = false)],
      ["vary_combat_length", (r) => (r["sim"].options.vary_combat_length = 0.2)],
      ["optimal_raid", (r) => (r["sim"].options.optimal_raid = 1)],
      ["gcd_lag", (r) => (r["sim"].options.gcd_lag = 0.2)],
      ["queue_lag_stddev", (r) => (r["sim"].options.queue_lag_stddev = 0)],
      ["reaction_time", (r) => (r["sim"].options.reaction_time = 0.4)],
      ["a buff the job did not list", (r) => (r["sim"].overrides.battle_shout = 1)],
      ["lust off", (r) => delete r["sim"].overrides.bloodlust],
      ["lust time", (r) => (r["sim"].overrides.bloodlust_time = 0)],
    ];
    for (const [label, fault] of faults)
      expect(code(parseMutated(fault)), label).toBe("SIMULATION_OUTPUT_MALFORMED");
  });

  it("the reported seed is not an echo: deterministic=1 reseeds every iteration (pinned sim.cpp:1810)", () => {
    // Observed on the exact-pin engine: seed=20261014 is reported as 7596449901710748000.
    expect(code(parseMutated((r) => (r["sim"].options.seed = 20261014)))).toBe("OK");
    expect(code(parseMutated((r) => (r["sim"].options.seed = 1)))).toBe("OK");
  });

  it("stat-less cosmetic slots may be absent from the gear echo, but must match when present", () => {
    // The pinned report skips items without stats (report_json.cpp:387); the exact-pin
    // engine echoed 15 of the development job's 17 items, without shirt and tabard.
    expect(code(parseMutated(() => undefined))).toBe("OK");
    const wrongShirt = parseMutated((r) => (r["sim"].players[0].gear.shirt = { encoded_item: "x,id=1" }));
    expect(code(wrongShirt)).toBe("SIMULATION_OUTPUT_MALFORMED");
    const rightTabard = parseMutated(
      (r) => (r["sim"].players[0].gear.tabard = { encoded_item: "x,id=167811" }),
    );
    expect(code(rightTabard)).toBe("OK");
    const missingStatSlot = parseMutated((r) => delete r["sim"].players[0].gear.back);
    expect(code(missingStatSlot)).toBe("SIMULATION_OUTPUT_MALFORMED");
  });

  it("actors: one Blood DK with the job's identity, one target, no foreign raid event", () => {
    const faults: [string, (r: Record<string, any>) => void][] = [
      ["second player", (r) => r["sim"].players.push(r["sim"].players[0])],
      ["spec", (r) => (r["sim"].players[0].specialization = "Frost Death Knight")],
      ["race", (r) => (r["sim"].players[0].race = "human")],
      ["level", (r) => (r["sim"].players[0].level = 80)],
      ["talents", (r) => (r["sim"].players[0].talents = "CoPAAAAAAAAAAAAAAAAAAAAAAwYWmZmxMmZmhZZ")],
      ["gear", (r) => (r["sim"].players[0].gear.head.encoded_item = "item,id=249970")],
      ["missing gear", (r) => delete r["sim"].players[0].gear.trinket1],
      ["second target", (r) => r["sim"].targets.push({ name: "Add" })],
      ["default target", (r) => (r["sim"].targets[0].name = "Fluffy_Pillow")],
      ["adds event", (r) => r["sim"].raid_events.push({ name: "adds" })],
      ["player reaction", (r) => (r["sim"].players[0].reaction_mean = 0.15)],
      ["player world lag", (r) => (r["sim"].players[0].world_lag = 0.05)],
      ["player brain lag", (r) => (r["sim"].players[0].brain_lag = 0.1)],
      ["class-default potion", (r) => (r["sim"].players[0].potion = "tempered_potion_3")],
      ["temporary enchant", (r) => delete r["sim"].players[0].temporary_enchant],
    ];
    for (const [label, fault] of faults)
      expect(code(parseMutated(fault)), label).toBe("SIMULATION_OUTPUT_MALFORMED");
  });

  it("run: engine errors, a varying length, a bad count and a non-positive DPS fail closed", () => {
    expect(code(parseMutated((r) => (r["logs"] = [{ level: "error", message: "boom" }])))).toBe(
      "SIMULATION_ENGINE_FAILED",
    );
    expect(code(parseMutated((r) => (r["sim"].statistics.simulation_length.min = 300)))).toBe(
      "SIMULATION_OUTPUT_MALFORMED",
    );
    expect(code(parseMutated((r) => (r["sim"].players[0].collected_data.dps.count = 1_000)))).toBe(
      "SIMULATION_OUTPUT_MALFORMED",
    );
    expect(code(parseMutated((r) => (r["sim"].players[0].collected_data.dps.mean = 0)))).toBe(
      "SIMULATION_OUTPUT_MALFORMED",
    );
    expect(code(parseMutated((r) => (r["sim"].players[0].collected_data.dps.mean = -5)))).toBe(
      "SIMULATION_OUTPUT_MALFORMED",
    );
  });

  it("precision: a result noisier than the policy allows is SIMULATION_PRECISION_NOT_MET", () => {
    expect(code(parseMutated((r) => (r["sim"].players[0].collected_data.dps.mean_std_dev = 500)))).toBe(
      "SIMULATION_PRECISION_NOT_MET",
    );
  });

  it("outputs are present only when requested, and a missing execute count is null, not 0", () => {
    const bare = {
      ...context,
      job: {
        ...context.job,
        requestedOutputs: { actionBreakdown: false, petBreakdown: false },
      } as SimulationJob,
    };
    const outcome = parseMutated(() => undefined, bare);
    expect(outcome.ok && "actionBreakdown" in outcome.value).toBe(false);
    expect(outcome.ok && "petBreakdown" in outcome.value).toBe(false);
    const noExecutes = parseMutated((r) => delete r["sim"].players[0].stats[0].num_executes);
    expect(noExecutes.ok && noExecutes.value.actionBreakdown?.[0]?.meanExecutesPerIteration).toBe(null);
  });

  it("T. semantic comparison ignores diagnostics and applies the reproducibility tolerance", () => {
    const a = parseMutated(() => undefined);
    const b = parseMutated((r) => {
      r["sim"].statistics.elapsed_time_seconds = 99;
      r["build_date"] = "Feb  2 2026";
      r["timestamp"] = 2;
    });
    const c = parseMutated((r) => (r["sim"].players[0].collected_data.dps.mean = 50_001));
    if (!a.ok || !b.ok || !c.ok) throw new Error("parse");
    expect(firstSemanticDifference(a.value, b.value, RESULT_REPRODUCIBILITY_TOLERANCE)).toBe(null);
    expect(firstSemanticDifference(a.value, c.value, RESULT_REPRODUCIBILITY_TOLERANCE)).toMatch(/^\.dps\./);
    const changed: SimulationResult = { ...a.value, profileHash: "other" };
    expect(firstSemanticDifference(a.value, changed, RESULT_REPRODUCIBILITY_TOLERANCE)).toBe(".profileHash");
  });

  it("the policy and profile registries resolve the job's ids", () => {
    expect(simulationPolicyById("STANDARD_SIM_V1")?.iterations).toBe(2_000);
    expect(executionProfileById("SIMC_DEFAULT_PINNED")?.status).toBe("PINNED_ENGINE_DEFAULT");
  });
});
