/**
 * M11 model registry: the known engine-contract difference of the 0a72e6a7
 * simulation model — Consumption's release action is created as
 * `consumption_release` and registered as a CHILD of the empowered
 * `consumption` action (sc_death_knight.cpp, upstream 5f3f05020a) — exercised
 * on a Blood job that ACTUALLY casts Consumption, on BOTH registered models.
 *
 *   1. On each model, the engine itself writes a Consumption loadout: the
 *      development job's input plus `spec_talents=consumption:1`; the engine
 *      regenerates the import string (player.cpp generate_traits_hash) and
 *      echoes it. Nothing about the talent encoding is hand-made.
 *   2. That loadout runs through the PRODUCTION path (prepareSimulation ->
 *      DockerLauncher -> parseSimcJson) with the model's own identity, and the
 *      result re-verifies against the identity recomputed from the job.
 *   3. JSON representation, parent/child breakdown and the parser's
 *      actionBreakdown are recorded for both models.
 *   4. With WRITE_GOLDEN=1, per-model golden projections are cut
 *      (tests/fixtures/simulation/simc-<short>-blood-consumption.json) for the
 *      offline regression test (tests/unit/simulation/consumption-release.test.ts).
 *
 * Docker `--network none`. No Warcraft Logs.
 *
 *     PIN_IMAGE=sha256:<33622e9d image> NEW_IMAGE=sha256:<0a72e6a7 image> [WRITE_GOLDEN=1] \
 *       npx vitest run --config scripts/bench/vitest.config.ts scripts/bench/m11-consumption-release.bench.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DockerLauncher } from "../../runner/engine-launcher.js";
import { DEFAULT_RUNNER_LIMITS } from "../../runner/limits.js";
import { RUNNER_SPEC_BINDINGS } from "../../runner/spec-bindings.js";
import { simulationModelById } from "../../src/simulation/model-registry.js";
import { prepareSimulation } from "../../src/simulation/prepare.js";
import { parseSimcJson } from "../../src/simulation/result-parser.js";
import { expectedResultIdentity, verifySimulationResult } from "../../src/simulation/result-verification.js";
import { devBloodJob, jsonBytes } from "../../tests/support/simulation/dev-blood-job.js";
import { goldenProjection } from "../../tests/support/simulation/golden.js";

declare const process: any;

type Json = Record<string, any>;
const PIN_IMAGE: string | undefined = process.env["PIN_IMAGE"];
const NEW_IMAGE: string | undefined = process.env["NEW_IMAGE"];
const OUT = join(".probe", "m11-model-pin", "consumption");

const flatStats = (nodes: readonly Json[], parent: string | null = null): Json[] =>
  nodes.flatMap((node) => [
    {
      name: node["name"],
      id: node["id"],
      parent,
      amount: node["compound_amount"],
      executes: node["num_executes"]?.mean ?? null,
    },
    ...flatStats((node["children"] as Json[] | undefined) ?? [], node["name"] as string),
  ]);

describe.skipIf(PIN_IMAGE === undefined || NEW_IMAGE === undefined)(
  "M11 Consumption / consumption_release on both simulation models",
  () => {
    it(
      "runs a Consumption loadout through the production path on each model",
      { timeout: 3_600_000 },
      async () => {
        mkdirSync(OUT, { recursive: true });
        const report: Json = {};
        for (const [id, image] of [
          ["SIMC_33622E9D_LIVE_12_1_0_69587", PIN_IMAGE],
          ["SIMC_0A72E6A7_LIVE_12_1_0_69933", NEW_IMAGE],
        ] as const) {
          const model = simulationModelById(id);
          if (model === undefined) throw new Error(id);
          expect(image).toBe(model.imageId);
          const launcher = new DockerLauncher(
            {
              imageRef: image ?? "",
              dockerExecutable: process.env["DOCKER_EXE"] ?? "docker",
              cpus: 8,
              cliEnv: process.env,
            },
            { ...DEFAULT_RUNNER_LIMITS, maxWallClockMs: 120_000 },
          );
          expect(await launcher.resolveBinarySha256()).toBe(model.artifact.binarySha256);

          // 1. The engine writes the Consumption loadout.
          const base = devBloodJob("BENCHMARK_300_T1", "ELITE_REALISTIC_V1", id) as Json;
          const basePrepared = await prepareSimulation(
            base,
            jsonBytes(base),
            model.artifact,
            RUNNER_SPEC_BINDINGS,
          );
          if (!basePrepared.ok) throw new Error(basePrepared.failure.detail);
          const talentLine = basePrepared.value.input.split("\n").find((line) => line.startsWith("talents="));
          if (talentLine === undefined) throw new Error("no talents line");
          const withConsumption = basePrepared.value.input.replace(
            `${talentLine}\n`,
            `${talentLine}\nspec_talents=consumption:1\n`,
          );
          const harvested = await launcher.launch({ input: withConsumption, timeoutMs: 120_000 });
          if (harvested.kind !== "COMPLETED") throw new Error(`harvest ${harvested.kind}`);
          const importString = (JSON.parse(harvested.json) as Json)["sim"].players[0].talents as string;

          // 2. Production path with that loadout.
          const job = devBloodJob("STANDARD_SIM_V1", "ELITE_REALISTIC_V1", id) as Json;
          job["character"].talents = { importString };
          const prepared = await prepareSimulation(job, jsonBytes(job), model.artifact, RUNNER_SPEC_BINDINGS);
          if (!prepared.ok) throw new Error(`${prepared.failure.code} ${prepared.failure.detail}`);
          const launched = await launcher.launch({ input: prepared.value.input, timeoutMs: 120_000 });
          if (launched.kind !== "COMPLETED") throw new Error(`run ${launched.kind}`);
          const parsed = parseSimcJson(launched.json, launched.jsonBytes, {
            job: prepared.value.job,
            binding: prepared.value.binding,
            profile: prepared.value.profile,
            policy: prepared.value.policy,
            approved: model.artifact,
            executedBinarySha256: launched.executedBinarySha256,
            profileHash: prepared.value.keys.profileHash,
            environmentHash: prepared.value.keys.environmentHash,
            executionProfileRevision: prepared.value.keys.executionProfileRevision,
          });
          const expected = await expectedResultIdentity(
            job,
            jsonBytes(job),
            model.artifact,
            RUNNER_SPEC_BINDINGS,
          );
          if (!expected.ok) throw new Error(expected.failure.detail);
          const verified = parsed.ok ? verifySimulationResult(parsed.value, expected.value) : parsed;
          const stats = flatStats((JSON.parse(launched.json) as Json)["sim"].players[0].stats as Json[]);
          report[id] = {
            importString,
            parse: parsed.ok ? "OK" : parsed.failure,
            verify: verified.ok ? "OK" : verified.failure,
            consumptionStats: stats.filter((entry) => String(entry.name).startsWith("consumption")),
            breakdown: parsed.ok
              ? (parsed.value.actionBreakdown ?? []).filter((entry) =>
                  entry.actionName.startsWith("consumption"),
                )
              : null,
            mean: parsed.ok ? parsed.value.dps.mean : null,
            parsedResultKey: prepared.value.keys.parsedResultKey,
          };
          writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 1), "utf8");
          if (process.env["WRITE_GOLDEN"] === "1") {
            const golden = goldenProjection(launched.json, {
              source: `simulation model ${model.id} (binary ${model.artifact.binarySha256})`,
              job: `devBloodJob('STANDARD_SIM_V1', 'ELITE_REALISTIC_V1', '${id}') with the engine-written Consumption loadout`,
              jobProfileHash: prepared.value.keys.profileHash,
              talentImportString: importString,
            });
            writeFileSync(
              join(
                "tests",
                "fixtures",
                "simulation",
                `simc-${model.pin.simcCommit.slice(0, 8)}-blood-consumption.json`,
              ),
              `${JSON.stringify(golden, null, 1)}\n`,
              "utf8",
            );
          }
          expect(parsed.ok).toBe(true);
          expect(verified.ok).toBe(true);
        }
      },
    );
  },
);
