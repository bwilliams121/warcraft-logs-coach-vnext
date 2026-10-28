/**
 * M11-G3-1: exact-pin VERIFICATION and BENCHMARK for the SimulationCraft runner.
 *
 * Runs the real application path — prepareSimulation -> DockerLauncher ->
 * parseSimcJson — against the Docker image built from runner/simc-build/ at
 * the approved pin. Nothing here makes a network request: the container runs
 * with `--network none`, and this config loads no credentials.
 *
 * It establishes, in order, and stops at the first failure:
 *   1. the image's engine binary hashes to the build record's SHA-256;
 *   2. the engine's OWN JSON identity is the pin (git_revision prefix,
 *      client data 12.1.0.69587, networking compiled out) — any mismatch is
 *      MODEL_PROVENANCE_MISMATCH and the run stops;
 *   3. determinism: the same job twice reproduces semantically (multi-thread)
 *      and bit-identically (single thread);
 *   4. precision/runtime at 2k / 5k / 10k iterations (12 threads) and for the
 *      candidate STANDARD_SIM_V1 / PRECISION_ESCALATED_V1 policies;
 *   5. the three execution profiles under STANDARD_SIM_V1.
 *
 * Output: .probe/m11g3/pin-bench/report.json (gitignored), plus the raw
 * engine JSON of the first STANDARD run for golden-artifact review.
 *
 * Run deliberately (Docker Desktop running, image built):
 *
 * M11 model registry: MODEL_ID names the simulation model to verify (default:
 * the historical 33622e9d model). The model's OWN build record and registered
 * identity are checked; output goes to .probe/m11g3/pin-bench/<short commit>/.
 *
 *     [MODEL_ID=<id>] SIMC_IMAGE=sha256:<image id> npx vitest run --config scripts/bench/vitest.config.ts scripts/bench/m11g3-simc-exact-pin.bench.ts
 */

import { cpus, availableParallelism } from "node:os";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BUILD_RECIPE_REVISION } from "../../runner/approved-artifacts.js";
import { DockerLauncher } from "../../runner/engine-launcher.js";
import { DEFAULT_RUNNER_LIMITS } from "../../runner/limits.js";
import { RUNNER_SPEC_BINDINGS } from "../../runner/spec-bindings.js";
import type { ApprovedEngineArtifact } from "../../src/simulation/model.js";
import { simulationModelById } from "../../src/simulation/model-registry.js";
import { prepareSimulation } from "../../src/simulation/prepare.js";
import { parseSimcJson } from "../../src/simulation/result-parser.js";
import { firstSemanticDifference, type SimulationResult } from "../../src/simulation/result.js";
import { RESULT_REPRODUCIBILITY_TOLERANCE } from "../../src/simulation/simulation-policy.js";
import { devBloodJob, jsonBytes } from "../../tests/support/simulation/dev-blood-job.js";

declare const process: any;

const IMAGE: string | undefined = process.env["SIMC_IMAGE"];
const MODEL_ID: string = process.env["MODEL_ID"] ?? "SIMC_33622E9D_LIVE_12_1_0_69587";
const MODEL = simulationModelById(MODEL_ID);
if (MODEL === undefined) throw new Error(`MODEL_ID ${MODEL_ID} is not a registered simulation model`);
const OUT = join(".probe", "m11g3", "pin-bench", MODEL.pin.simcCommit.slice(0, 8));

interface RunRecord {
  readonly label: string;
  readonly policyId: string;
  readonly executionProfileId: string;
  readonly ok: boolean;
  readonly failure?: string;
  readonly wallMs?: number;
  readonly jsonBytes?: number;
  readonly result?: SimulationResult;
}

describe.skipIf(IMAGE === undefined)("M11-G3-1 exact-pin SimulationCraft runner", () => {
  it(
    "verifies the pin, then measures determinism, precision and runtime",
    { timeout: 1_800_000 },
    async () => {
      mkdirSync(OUT, { recursive: true });
      const record = JSON.parse(readFileSync(MODEL.buildRecord, "utf8")) as {
        binarySha256: string;
        simcCommit: string;
        imageId: string;
      };
      expect(record.simcCommit).toBe(MODEL.pin.simcCommit);
      expect(record.imageId).toBe(MODEL.imageId);
      expect(record.binarySha256).toBe(MODEL.artifact.binarySha256);
      expect(IMAGE).toBe(record.imageId);

      const limits = { ...DEFAULT_RUNNER_LIMITS, maxWallClockMs: 120_000 };
      const launcher = new DockerLauncher(
        {
          imageRef: IMAGE ?? "",
          dockerExecutable: process.env["DOCKER_EXE"] ?? "docker",
          cpus: availableParallelism(),
          cliEnv: process.env,
        },
        limits,
      );
      const executedSha = await launcher.resolveBinarySha256();
      expect(executedSha, "image binary vs build record").toBe(record.binarySha256);
      const artifact: ApprovedEngineArtifact = {
        model: MODEL.pin,
        binarySha256: record.binarySha256,
        buildRecipeRevision: BUILD_RECIPE_REVISION,
      };

      const runs: RunRecord[] = [];
      const runOnce = async (
        label: string,
        policyId: string,
        executionProfileId: string,
        keepRaw = false,
      ) => {
        const job = devBloodJob(policyId, executionProfileId, MODEL_ID);
        const prepared = await prepareSimulation(job, jsonBytes(job), artifact, RUNNER_SPEC_BINDINGS);
        if (!prepared.ok) throw new Error(`${label}: ${prepared.failure.code} ${prepared.failure.detail}`);
        const launched = await launcher.launch({ input: prepared.value.input, timeoutMs: 120_000 });
        if (launched.kind !== "COMPLETED") {
          const detail = "detail" in launched ? launched.detail : "";
          runs.push({
            label,
            policyId,
            executionProfileId,
            ok: false,
            failure: `${launched.kind} ${detail}`,
          });
          return null;
        }
        if (keepRaw) writeFileSync(join(OUT, `raw-${label}.json`), launched.json, "utf8");
        const parsed = parseSimcJson(launched.json, launched.jsonBytes, {
          job: prepared.value.job,
          binding: prepared.value.binding,
          profile: prepared.value.profile,
          policy: prepared.value.policy,
          approved: artifact,
          executedBinarySha256: launched.executedBinarySha256,
          profileHash: prepared.value.keys.profileHash,
          environmentHash: prepared.value.keys.environmentHash,
          executionProfileRevision: prepared.value.keys.executionProfileRevision,
        });
        if (!parsed.ok) {
          writeFileSync(join(OUT, `raw-failed-${label}.json`), launched.json, "utf8");
          runs.push({
            label,
            policyId,
            executionProfileId,
            ok: false,
            failure: `${parsed.failure.code} ${parsed.failure.detail}`,
          });
          return null;
        }
        runs.push({
          label,
          policyId,
          executionProfileId,
          ok: true,
          wallMs: launched.wallMs,
          jsonBytes: launched.jsonBytes,
          result: parsed.value,
        });
        return parsed.value;
      };
      const save = (stage: string) =>
        writeFileSync(
          join(OUT, "report.json"),
          JSON.stringify(
            {
              stage,
              host: { cpu: cpus()[0]?.model ?? "unknown", logicalCores: availableParallelism() },
              image: IMAGE,
              binarySha256: executedSha,
              runs,
            },
            null,
            2,
          ),
          "utf8",
        );

      // 1-2. Provenance first: a mismatch stops everything.
      const first = await runOnce("standard-a", "STANDARD_SIM_V1", "SIMC_DEFAULT_PINNED", true);
      save("provenance");
      expect(runs[0]?.failure).toBeUndefined();
      if (first === null) return;

      // 3. Determinism.
      const second = await runOnce("standard-b", "STANDARD_SIM_V1", "SIMC_DEFAULT_PINNED");
      const singleA = await runOnce("single-a", "BENCHMARK_300_T1", "SIMC_DEFAULT_PINNED");
      const singleB = await runOnce("single-b", "BENCHMARK_300_T1", "SIMC_DEFAULT_PINNED");
      save("determinism");
      expect(second && firstSemanticDifference(first, second, RESULT_REPRODUCIBILITY_TOLERANCE)).toBe(null);
      expect(singleA && singleB && firstSemanticDifference(singleA, singleB, 0)).toBe(null);

      // 4. Precision and runtime.
      for (const policyId of [
        "BENCHMARK_2K_T12",
        "BENCHMARK_5K_T12",
        "BENCHMARK_10K_T12",
        "PRECISION_ESCALATED_V1",
      ]) {
        await runOnce(policyId.toLowerCase(), policyId, "SIMC_DEFAULT_PINNED");
        save("precision");
      }

      // 5. Execution profiles.
      for (const profileId of ["ELITE_REALISTIC_V1"]) {
        await runOnce(`standard-${profileId.toLowerCase()}`, "STANDARD_SIM_V1", profileId);
      }
      save("complete");
      expect(runs.filter((run) => !run.ok)).toEqual([]);
    },
  );
});
