/**
 * M11-G3-4: which pinned consumable engine tokens the APPROVED engine
 * actually accepts.
 *
 * A token that matches an item is not proof the engine can build its effect
 * (a feast resolved by name failed with "could not deduce a proper consumable
 * to create"). So representability is decided here, on the binary: every
 * UNAMBIGUOUS rank-option token in src/data/game/consumables.json is set,
 * alone, on the development Blood job (one deterministic iteration — engine
 * initialization is the question, not DPS) and recorded ACCEPTED when the run
 * completes, REFUSED with the engine's message otherwise.
 *
 * M11 model registry: the run is for ONE named simulation model (MODEL_ID),
 * on that model's registered image, against that model's consumables. With
 * WRITE_GOLDEN=1 the result is written to that model's bundle,
 * src/data/simulation-models/<dir>/consumable-token-acceptance.json; otherwise
 * the run must equal the committed file.
 *
 *     MODEL_ID=<registered id> SIMC_IMAGE=sha256:<id> [WRITE_GOLDEN=1] npx vitest run --config scripts/bench/vitest.config.ts scripts/bench/m11g34-consumable-tokens.bench.ts
 */

import { readFileSync, writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { DockerLauncher } from "../../runner/engine-launcher.js";
import { DEFAULT_RUNNER_LIMITS } from "../../runner/limits.js";
import { RUNNER_SPEC_BINDINGS } from "../../runner/spec-bindings.js";
import { consumablesSchema } from "../../src/data/simulation-models/consumables.js";
import { simulationModelById } from "../../src/simulation/model-registry.js";
import { prepareSimulation } from "../../src/simulation/prepare.js";
import { devBloodJob, jsonBytes } from "../../tests/support/simulation/dev-blood-job.js";

declare const process: any;

const IMAGE: string | undefined = process.env["SIMC_IMAGE"];
const MODEL_ID: string = process.env["MODEL_ID"] ?? "";
/** Registered model id -> its data bundle directory. */
const BUNDLE_DIR: Record<string, string> = {
  SIMC_33622E9D_LIVE_12_1_0_69587: "src/data/simulation-models/simc-33622e9d",
  SIMC_0A72E6A7_LIVE_12_1_0_69933: "src/data/simulation-models/simc-0a72e6a7",
};
const OPTION: Record<string, string> = {
  FLASK: "flask",
  FOOD: "food",
  POTION: "potion",
  OTHER: "augmentation",
};

describe.skipIf(IMAGE === undefined)(
  "M11-G3-4 consumable token acceptance on a named simulation model",
  () => {
    it("records which pinned tokens the engine accepts", { timeout: 3_600_000 }, async () => {
      const model = simulationModelById(MODEL_ID);
      const dir = BUNDLE_DIR[MODEL_ID];
      if (model === undefined || dir === undefined)
        throw new Error("MODEL_ID must name a registered simulation model");
      if (IMAGE !== model.imageId) throw new Error("SIMC_IMAGE must be the model's registered image id");
      const artifact = model.artifact;
      const OUT = `${dir}/consumable-token-acceptance.json`;
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
      const parsed = consumablesSchema.safeParse(JSON.parse(readFileSync(`${dir}/consumables.json`, "utf8")));
      if (!parsed.success) throw new Error("invalid consumables artifact");
      const loaded = { data: parsed.data };

      const job = devBloodJob("BENCHMARK_300_T1", "ELITE_REALISTIC_V1", MODEL_ID) as Record<string, any>;
      Object.assign(job["character"].consumables, {
        potion: "NONE",
        flask: "NONE",
        food: "NONE",
        augmentation: "NONE",
        temporaryEnchants: [],
      });
      const prepared = await prepareSimulation(job, jsonBytes(job), artifact, RUNNER_SPEC_BINDINGS);
      if (!prepared.ok) throw new Error(prepared.failure.detail);
      const base = prepared.value.input.replace("\niterations=300\n", "\niterations=1\n");
      if (base === prepared.value.input) throw new Error("iterations anchor missing");

      const tokens = loaded.data.consumableAuras
        .flatMap((aura) =>
          aura.rankOptions
            .filter((option) => option.unambiguous)
            .map((option) => ({
              kind: aura.kind,
              spellId: aura.spellId,
              itemLevel: option.itemLevel,
              token: option.token,
            })),
        )
        .sort((a, b) => (a.token < b.token ? -1 : a.token > b.token ? 1 : a.kind < b.kind ? -1 : 1));
      const results = [];
      for (const entry of tokens) {
        const option = OPTION[entry.kind];
        if (option === undefined) continue;
        const input = base.replace(`\n${option}=disabled\n`, `\n${option}=${entry.token}\n`);
        if (input === base) throw new Error(`${option} anchor missing`);
        const launched = await launcher.launch({ input, timeoutMs: 120_000 });
        const detail =
          launched.kind === "COMPLETED"
            ? null
            : ("detail" in launched ? String(launched.detail) : launched.kind)
                .replace(/\s+/g, " ")
                .slice(0, 240);
        results.push({ ...entry, accepted: launched.kind === "COMPLETED", detail });
      }
      const artifactOut = {
        artifactVersion: 1,
        datasetId: "SIMC_CONSUMABLE_TOKEN_ACCEPTANCE",
        // -2: measured against consumables extractor v4 (provenance-only
        // correction of the source label; verdicts identical to -1).
        artifactRevision: `simc-${artifact.model.simcCommit.slice(0, 8)}-2`,
        provenance: {
          commitSha: artifact.model.simcCommit,
          clientDataWowVersion: artifact.model.gameDataBuild,
          binarySha256: artifact.binarySha256,
          consumablesRevision: loaded.data.artifactRevision,
          method: "ENGINE_RUN_PER_TOKEN",
          bench: "scripts/bench/m11g34-consumable-tokens.bench.ts",
        },
        tokens: results,
      };
      if (process.env["WRITE_GOLDEN"] === "1") {
        writeFileSync(OUT, `${JSON.stringify(artifactOut, null, 2)}\n`, "utf8");
      } else {
        expect(JSON.parse(readFileSync(OUT, "utf8"))).toEqual(artifactOut);
      }
    });
  },
);
