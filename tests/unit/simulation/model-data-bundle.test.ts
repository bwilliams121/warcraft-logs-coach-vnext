/**
 * M11 model registry: a simulation-model data bundle loads only when its
 * artifacts are this model's and its recorded data history ends at the
 * artifacts actually present. A correction moves the revision; it never
 * rewrites an artifact under its old revision.
 */

import { describe, expect, it } from "vitest";

import { loadSimulationModelBundle, simulationModelData } from "../../../src/data/simulation-models/index.js";
import manifest from "../../../src/data/simulation-models/simc-33622e9d/model.json";
import consumables from "../../../src/data/simulation-models/simc-33622e9d/consumables.json";
import tokens from "../../../src/data/simulation-models/simc-33622e9d/consumable-token-acceptance.json";
import raid from "../../../src/data/simulation-models/simc-33622e9d/raid-environment.json";

type Json = Record<string, any>;
const clone = <T>(value: T): T => structuredClone(value);
const raw = () => ({
  manifest: clone(manifest),
  consumables: clone(consumables),
  tokens: clone(tokens),
  raid: clone(raid),
});

describe("simulation-model data bundle validation", () => {
  it("the corrected historical bundle loads and is the one production reads", () => {
    const loaded = loadSimulationModelBundle(raw());
    if (!loaded.ok) throw new Error(loaded.detail);
    const production = simulationModelData("SIMC_33622E9D_LIVE_12_1_0_69587");
    if (!production.ok) throw new Error(production.detail);
    expect(production.data).toEqual(loaded.data);
    expect(loaded.data.revisions).toEqual([
      { datasetId: "SIMC_CONSUMABLES", revision: "simc-33622e9d-4" },
      { datasetId: "SIMC_CONSUMABLE_TOKEN_ACCEPTANCE", revision: "simc-33622e9d-2" },
      { datasetId: "SIMC_RAID_ENVIRONMENT", revision: loaded.data.raidEnvironment.artifactRevision },
    ]);
  });

  it("the uncorrected v3 consumables (old revision) no longer load: the history ends elsewhere", () => {
    const bundle = raw();
    (bundle.consumables as Json)["artifactRevision"] = "simc-33622e9d-3";
    (bundle.tokens as Json)["provenance"].consumablesRevision = "simc-33622e9d-3";
    expect(loadSimulationModelBundle(bundle)).toEqual({
      ok: false,
      detail:
        "SIMC_33622E9D_LIVE_12_1_0_69587: SIMC_CONSUMABLES history ends at simc-33622e9d-4, artifact is simc-33622e9d-3",
    });
  });

  it("token acceptance measured against another consumables revision does not load", () => {
    const bundle = raw();
    (bundle.tokens as Json)["provenance"].consumablesRevision = "simc-33622e9d-3";
    expect(loadSimulationModelBundle(bundle)).toMatchObject({
      ok: false,
      detail: expect.stringContaining("token acceptance does not describe this consumables revision"),
    });
  });

  it("an artifact from another model, or a v1 manifest without history, does not load", () => {
    const foreign = raw();
    (foreign.consumables as Json)["provenance"].clientDataWowVersion = "12.1.0.69933";
    expect(loadSimulationModelBundle(foreign)).toMatchObject({
      ok: false,
      detail: expect.stringContaining("consumables provenance is not this model"),
    });
    const v1 = raw();
    (v1.manifest as Json)["manifestVersion"] = 1;
    delete (v1.manifest as Json)["dataHistory"];
    expect(loadSimulationModelBundle(v1)).toEqual({
      ok: false,
      detail: "invalid simulation-model data manifest",
    });
  });

  it("consumables provenance must name its sources", () => {
    const bundle = raw();
    (bundle.consumables as Json)["provenance"].sources = [];
    expect(loadSimulationModelBundle(bundle)).toMatchObject({
      ok: false,
      detail: expect.stringContaining("invalid consumables artifact"),
    });
  });
});
