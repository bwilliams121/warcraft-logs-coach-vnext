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
 * With WRITE_GOLDEN=1 the result is written to
 * src/data/game/consumable-token-acceptance.json (runtime data the environment
 * reads); otherwise the run must equal the committed file.
 *
 *     SIMC_IMAGE=sha256:<id> [WRITE_GOLDEN=1] npx vitest run --config scripts/bench/vitest.config.ts scripts/bench/m11g34-consumable-tokens.bench.ts
 */

import { readFileSync, writeFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { APPROVED_ENGINE_ARTIFACTS } from "../../runner/approved-artifacts.js";
import { DockerLauncher } from "../../runner/engine-launcher.js";
import { DEFAULT_RUNNER_LIMITS } from "../../runner/limits.js";
import { RUNNER_SPEC_BINDINGS } from "../../runner/spec-bindings.js";
import { pinnedConsumables } from "../../src/data/game/consumables.js";
import { prepareSimulation } from "../../src/simulation/prepare.js";
import { devBloodJob, jsonBytes } from "../../tests/support/simulation/dev-blood-job.js";

declare const process: any;

const IMAGE: string | undefined = process.env["SIMC_IMAGE"];
const OUT = "src/data/game/consumable-token-acceptance.json";
const OPTION: Record<string, string> = {
  FLASK: "flask",
  FOOD: "food",
  POTION: "potion",
  OTHER: "augmentation",
};

describe.skipIf(IMAGE === undefined)("M11-G3-4 consumable token acceptance on the exact pin", () => {
  it("records which pinned tokens the engine accepts", { timeout: 3_600_000 }, async () => {
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
    const loaded = pinnedConsumables();
    if (!loaded.ok) throw new Error(loaded.detail);

    const job = devBloodJob("BENCHMARK_300_T1", "ELITE_REALISTIC_V1") as Record<string, any>;
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
      artifactRevision: `simc-${artifact.model.simcCommit.slice(0, 8)}-1`,
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
});
