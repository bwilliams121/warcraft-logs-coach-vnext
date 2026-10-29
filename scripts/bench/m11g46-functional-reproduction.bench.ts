/**
 * M11-G4-6: FUNCTIONAL REPRODUCTION of a SimulationCraft engine build.
 *
 * Two images built from the same commit (for example two `--no-cache` builds
 * of runner/simc-build/v3/) may differ as binaries: the LLVM PGO training
 * profile varies from run to run, and with it the optimised code. This bench
 * checks whether they give the same ENGINE OUTPUT for the jobs below; a pass
 * is evidence for those jobs only, not for every input. The same prepared jobs run on
 * both images, SINGLE-THREADED (a multi-threaded run merges per-thread
 * results in a scheduling-dependent order, so it differs in the last bits
 * even on one binary). The raw engine JSON must be identical in every leaf
 * except (tests/support/simulation/engine-json.ts, a full structural
 * comparison: container kinds, array lengths, key sets, empty containers):
 * - wall-clock statistics (`sim.statistics`) and `timestamp`;
 * - `build_date`/`build_time`, which simc-build/1 and /2 take from the build
 *   host's clock.
 *
 * Both images must report the same git revision; the client data identity
 * (`sim.options.dbc`) is part of the structural comparison. Nothing here
 * approves an artifact: approval stays the registered binary hash.
 *
 * The jobs are the development Blood job under BENCHMARK_300_T1 (single
 * thread) with each execution profile. MODEL_ID only names the registered model
 * used to PREPARE the job; the engine input does not depend on it.
 *
 *     SIMC_IMAGE_A=sha256:<id> SIMC_IMAGE_B=sha256:<id> [MODEL_ID=<id>] npx vitest run --config scripts/bench/vitest.config.ts scripts/bench/m11g46-functional-reproduction.bench.ts
 *
 * Output: .probe/m11g46/functional-reproduction.json (gitignored). Docker
 * `--network none`.
 */

import { availableParallelism } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DockerLauncher } from "../../runner/engine-launcher.js";
import { DEFAULT_RUNNER_LIMITS } from "../../runner/limits.js";
import { RUNNER_SPEC_BINDINGS } from "../../runner/spec-bindings.js";
import { APPROVED_ENGINE_ARTIFACTS } from "../../src/simulation/approved-artifacts.js";
import { prepareSimulation } from "../../src/simulation/prepare.js";
import { devBloodJob, jsonBytes } from "../../tests/support/simulation/dev-blood-job.js";
import {
  differingPaths,
  engineView,
  primitiveLeafCount,
} from "../../tests/support/simulation/engine-json.js";

declare const process: any;

const IMAGE_A: string | undefined = process.env["SIMC_IMAGE_A"];
const IMAGE_B: string | undefined = process.env["SIMC_IMAGE_B"];
const MODEL_ID: string = process.env["MODEL_ID"] ?? "SIMC_0A72E6A7_LIVE_12_1_0_69933";
const OUT = join(".probe", "m11g46");
const EXECUTION_PROFILES = ["SIMC_DEFAULT_PINNED", "ELITE_REALISTIC_V1"] as const;

type Json = Record<string, unknown>;

describe.skipIf(IMAGE_A === undefined || IMAGE_B === undefined)(
  "M11-G4-6 functional reproduction of two engine builds",
  () => {
    it(
      "the same single-threaded jobs give identical engine output on both images",
      { timeout: 1_800_000 },
      async () => {
        mkdirSync(OUT, { recursive: true });
        const launcher = (imageRef: string) =>
          new DockerLauncher(
            {
              imageRef,
              dockerExecutable: process.env["DOCKER_EXE"] ?? "docker",
              cpus: availableParallelism(),
              cliEnv: process.env,
            },
            { ...DEFAULT_RUNNER_LIMITS, maxWallClockMs: 300_000 },
          );
        const engines = { a: launcher(IMAGE_A ?? ""), b: launcher(IMAGE_B ?? "") };
        const binaries = {
          a: await engines.a.resolveBinarySha256(),
          b: await engines.b.resolveBinarySha256(),
        };

        const comparisons: Json[] = [];
        for (const executionProfileId of EXECUTION_PROFILES) {
          const job = devBloodJob("BENCHMARK_300_T1", executionProfileId, MODEL_ID);
          const prepared = await prepareSimulation(
            job,
            jsonBytes(job),
            APPROVED_ENGINE_ARTIFACTS,
            RUNNER_SPEC_BINDINGS,
          );
          if (!prepared.ok) throw new Error(`${prepared.failure.code} ${prepared.failure.detail}`);
          expect(prepared.value.input).toMatch(/^threads=1$/m);
          const outputs: Record<"a" | "b", Json> = { a: {}, b: {} };
          for (const side of ["a", "b"] as const) {
            const launched = await engines[side].launch({ input: prepared.value.input, timeoutMs: 300_000 });
            if (launched.kind !== "COMPLETED")
              throw new Error(`${side} ${executionProfileId}: ${launched.kind}`);
            outputs[side] = engineView(launched.json);
          }
          const differing = differingPaths(outputs.a, outputs.b);
          comparisons.push({
            executionProfileId,
            leaves: primitiveLeafCount(outputs.a),
            differing: differing.length,
            firstDiffering: differing.slice(0, 10),
            gitRevision: [outputs.a["git_revision"], outputs.b["git_revision"]],
          });
          writeFileSync(
            join(OUT, "functional-reproduction.json"),
            JSON.stringify(
              { images: { a: IMAGE_A, b: IMAGE_B }, binaries, modelId: MODEL_ID, comparisons },
              null,
              2,
            ),
            "utf8",
          );
          // Same engine identity, then the whole normalized structure.
          expect(outputs.a["git_revision"]).toBe(outputs.b["git_revision"]);
          expect(differing, executionProfileId).toEqual([]);
        }
      },
    );
  },
);
