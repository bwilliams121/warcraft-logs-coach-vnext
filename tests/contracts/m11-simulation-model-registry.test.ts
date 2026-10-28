/**
 * M11 SIMULATION-MODEL REGISTRY contracts.
 *
 * - The registry holds exactly the approved simulation models; the historical
 *   33622e9d model is never removed or changed.
 * - Approved artifacts, build records and simulation-model data bundles agree
 *   with the registry, field for field.
 * - ANALYZER AUTHORITY and SIMULATION MODEL are separate concepts: every
 *   analyzer authority artifact is on ANALYZER_AUTHORITY_MODEL; neither side
 *   imports the other; no production code carries a global default model.
 *
 * All checks run on code with comments stripped where code is inspected.
 */

import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ANALYZER_AUTHORITY_MODEL } from "../../src/simc/analyzer-authority-model.js";
import { APPROVED_ENGINE_ARTIFACTS } from "../../src/simulation/approved-artifacts.js";
import { SIMULATION_MODELS } from "../../src/simulation/model-registry.js";
import { SIMULATION_MODEL_DATA_IDS, simulationModelData } from "../../src/data/simulation-models/index.js";
import { RUNNER_MODEL_VALIDATIONS } from "../../runner/spec-bindings.js";

declare const process: { cwd(): string };
const ROOT = process.cwd();

const tsFiles = (dir: string): string[] =>
  readdirSync(join(ROOT, dir), { recursive: true, withFileTypes: false })
    .filter((file) => file.endsWith(".ts"))
    .map((file) => join(dir, file).replace(/\\/g, "/"));

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

const code = (file: string): string =>
  readFileSync(join(ROOT, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

const importsOf = (file: string): string[] =>
  [...code(file).matchAll(/(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/g)].map(
    (match) => match[1] ?? "",
  );

describe("M11 simulation-model registry", () => {
  it("registers exactly the approved models; the historical model is unchanged", () => {
    expect(
      SIMULATION_MODELS.map((model) => ({
        id: model.id,
        pin: model.pin,
        lineage: model.lineage,
        engineRevision: model.engineRevision,
        binary: model.artifact.binarySha256,
        recipe: model.artifact.buildRecipeRevision,
        image: model.imageId,
        approval: model.approval.status,
      })),
    ).toEqual([
      {
        id: "SIMC_33622E9D_LIVE_12_1_0_69587",
        pin: { simcCommit: "33622e9d1662ff0e451691edf85a6b49cc9d11d9", gameDataBuild: "12.1.0.69587" },
        lineage: "LIVE",
        engineRevision: "33622e9d16",
        binary: "41347bc4203bd1b073a617cd9cd147a96c9c09a36f8c7af5c013ca7be273cb77",
        recipe: "simc-build/1",
        image: "sha256:8ab91e722bd4c6e50a58a38a1244d2688bdaf3ddc68e09cd2aa59877f8b7aaf4",
        approval: "APPROVED",
      },
      {
        id: "SIMC_0A72E6A7_LIVE_12_1_0_69933",
        pin: { simcCommit: "0a72e6a74684d23c989b2d76143e429d2b4f1c91", gameDataBuild: "12.1.0.69933" },
        lineage: "LIVE",
        engineRevision: "0a72e6a746",
        binary: "79bf5a406b0ca16eb8e828ef017603b60fdee576a5cb3cf4acaacf93a08eea36",
        recipe: "simc-build/1",
        image: "sha256:efea14b4fd0694831af5bab945788be2c382f3e2ed20fce1d0597ba8bf504d59",
        approval: "APPROVED",
      },
    ]);
    for (const model of SIMULATION_MODELS) {
      expect(model.artifact.model, model.id).toEqual(model.pin);
      expect(model.pin.simcCommit.startsWith(model.engineRevision), model.id).toBe(true);
    }
  });

  it("approved artifacts are exactly the registry's, one per model", () => {
    expect(APPROVED_ENGINE_ARTIFACTS).toEqual(SIMULATION_MODELS.map((model) => model.artifact));
  });

  it("every model has a VERIFIED build record matching its identity", () => {
    for (const model of SIMULATION_MODELS) {
      const record = JSON.parse(readFileSync(join(ROOT, model.buildRecord), "utf8")) as Record<string, any>;
      expect(record["simcCommit"], model.id).toBe(model.pin.simcCommit);
      expect(record["imageId"], model.id).toBe(model.imageId);
      expect(record["binarySha256"], model.id).toBe(model.artifact.binarySha256);
      expect(record["buildRecipeRevision"], model.id).toBe(model.artifact.buildRecipeRevision);
      expect(record["verification"]?.status, model.id).toBe("VERIFIED");
      expect(record["verification"]?.reportedGameDataBuild, model.id).toBe(model.pin.gameDataBuild);
      expect(record["verification"]?.dbcVersionUsed, model.id).toBe("Live");
      expect(record["verification"]?.noNetworking, model.id).toBe(true);
    }
  });

  it("every model has a simulation-data bundle that loads and matches the registry", () => {
    expect(SIMULATION_MODEL_DATA_IDS).toEqual(SIMULATION_MODELS.map((model) => model.id));
    for (const model of SIMULATION_MODELS) {
      const loaded = simulationModelData(model.id);
      if (!loaded.ok) throw new Error(loaded.detail);
      expect(loaded.data.manifest, model.id).toEqual({
        manifestVersion: 2,
        modelId: model.id,
        simcCommit: model.pin.simcCommit,
        gameDataBuild: model.pin.gameDataBuild,
        binarySha256: model.artifact.binarySha256,
        hotfixDate: model.clientData.hotfixDate,
        snapshotCommittedAtUtc: model.clientData.snapshotCommittedAtUtc,
        dataHistory: loaded.data.manifest.dataHistory,
      });
    }
    expect(simulationModelData("SIMC_NOT_REGISTERED").ok).toBe(false);
  });

  it("consumable provenance is truthful: real source paths, history recorded, semantics unchanged", () => {
    for (const model of SIMULATION_MODELS) {
      const loaded = simulationModelData(model.id);
      if (!loaded.ok) throw new Error(loaded.detail);
      const { consumables, tokenAcceptance, manifest } = loaded.data;
      const paths = consumables.provenance.sources.map((source) => source.path);
      expect(paths, model.id).toContain("engine/player/consumable.cpp");
      expect(paths, model.id).not.toContain("engine/item/consumable.cpp");
      expect(consumables.provenance.extractorVersion, model.id).toBe(4);
      expect(consumables.artifactRevision, model.id).toBe(`simc-${model.pin.simcCommit.slice(0, 8)}-4`);
      expect(tokenAcceptance.provenance.consumablesRevision, model.id).toBe(consumables.artifactRevision);
      // The provenance-only corrections are recorded, newest last, ending at the loaded revisions.
      expect(
        manifest.dataHistory.map((entry) => [entry.datasetId, entry.fromRevision, entry.toRevision]),
        model.id,
      ).toEqual([
        ["SIMC_CONSUMABLES", `simc-${model.pin.simcCommit.slice(0, 8)}-3`, consumables.artifactRevision],
        [
          "SIMC_CONSUMABLE_TOKEN_ACCEPTANCE",
          `simc-${model.pin.simcCommit.slice(0, 8)}-1`,
          tokenAcceptance.artifactRevision,
        ],
      ]);
      expect(
        manifest.dataHistory.every((entry) => !entry.semanticContentChanged),
        model.id,
      ).toBe(true);
    }
    // Semantic content (everything but provenance and revision) is the committed
    // v3 historical artifact's, for both models; token verdicts likewise.
    for (const model of SIMULATION_MODELS) {
      const loaded = simulationModelData(model.id);
      if (!loaded.ok) throw new Error(loaded.detail);
      const { provenance: _p, artifactRevision: _r, ...semantic } = loaded.data.consumables;
      expect(sha256(JSON.stringify(semantic)), model.id).toBe(
        "816773ecf58170959a15137a8a95fa0f843ce2c03282e6ed277aad1d8aec3bb6",
      );
      expect(sha256(JSON.stringify(loaded.data.tokenAcceptance.tokens)), model.id).toBe(
        "18267722fc61e666127e6c32e673a2d1d1bfbbe44b6865b0448970a020e2bdd8",
      );
    }
    // The historical model's source hashes are the ones its v3 artifact recorded.
    const historical = simulationModelData("SIMC_33622E9D_LIVE_12_1_0_69587");
    if (!historical.ok) throw new Error(historical.detail);
    expect(
      historical.data.consumables.provenance.sources.find((source) => source.path.endsWith("consumable.cpp"))
        ?.sha256,
    ).toBe("1a2ad7ed821bcda3f7b588e0d1e8caf5f8e027f1ad83312886965dca4f6ee941");
  });

  it("spec validations name only registered models, with evidence-bounded windows", () => {
    const ids = new Set(SIMULATION_MODELS.map((model) => model.id));
    for (const spec of RUNNER_MODEL_VALIDATIONS) {
      for (const validation of spec.validations) {
        expect(ids.has(validation.modelId), validation.modelId).toBe(true);
        const model = SIMULATION_MODELS.find((entry) => entry.id === validation.modelId);
        expect(validation.gameBuild, validation.modelId).toBe(model?.pin.gameDataBuild);
        expect(Date.parse(validation.window.fromUtc)).toBeLessThan(Date.parse(validation.window.toUtc));
        // A window never starts before the model's own data snapshot.
        expect(Date.parse(validation.window.fromUtc)).toBeGreaterThanOrEqual(
          Date.parse(model?.clientData.snapshotCommittedAtUtc ?? ""),
        );
      }
    }
  });
});

describe("M11 analyzer authority vs simulation model", () => {
  it("every analyzer authority artifact is on the analyzer authority model", () => {
    const commits = new Set<string>();
    for (const file of readdirSync(join(ROOT, "src/simc/data"), { recursive: false, withFileTypes: false })) {
      const json = JSON.parse(readFileSync(join(ROOT, "src/simc/data", file), "utf8")) as Record<string, any>;
      commits.add(json["provenance"]?.commitSha);
    }
    for (const file of readdirSync(join(ROOT, "src/data/game"), {
      recursive: false,
      withFileTypes: false,
    }).filter((name) => name.endsWith(".json"))) {
      const json = JSON.parse(readFileSync(join(ROOT, "src/data/game", file), "utf8")) as Record<string, any>;
      const commit = json["provenance"]?.commitSha ?? json["provenance"]?.pinnedSource?.commitSha;
      if (commit !== undefined) commits.add(commit);
    }
    expect([...commits]).toEqual([ANALYZER_AUTHORITY_MODEL.simcCommit]);
  });

  it("simulation code never imports analyzer authority, and analyzer authority never imports simulation-model selection", () => {
    const simulationSide = [
      ...tsFiles("src/simulation"),
      ...tsFiles("src/simulation-client"),
      ...tsFiles("src/data/simulation-models"),
      ...tsFiles("runner"),
    ];
    for (const file of simulationSide) {
      for (const spec of importsOf(file)) {
        expect(spec, `${file} imports ${spec}`).not.toMatch(/(^|\/)simc\/|analyzer-authority-model/);
      }
    }
    for (const file of tsFiles("src/simc")) {
      for (const spec of importsOf(file)) {
        expect(spec, `${file} imports ${spec}`).not.toMatch(
          /simulation\/|simulation-models\/|simulation-client\//,
        );
      }
    }
  });

  it("no production code has a global default simulation model", () => {
    for (const file of [...tsFiles("src"), ...tsFiles("runner")]) {
      expect(code(file), file).not.toMatch(/APPROVED_SIMC_MODEL|checkRequestedModel/);
      expect(code(file), file).not.toMatch(/APPROVED_ENGINE_ARTIFACTS\[\s*\d+\s*\]/);
    }
    // Simulation commits appear as values only in the registry (and nowhere a model could be picked implicitly).
    for (const file of [...tsFiles("src/simulation"), ...tsFiles("runner")]) {
      if (file === "src/simulation/model-registry.ts") continue;
      expect(code(file), file).not.toMatch(
        /33622e9d1662ff0e451691edf85a6b49cc9d11d9|0a72e6a74684d23c989b2d76143e429d2b4f1c91/,
      );
    }
  });
});
