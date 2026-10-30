/**
 * The committed preparation consumable identities
 * (src/data/game/preparation-consumables.json): provenance, the classes
 * the current content needs, independent corroboration, and fail-closed
 * loading.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import artifact from "../../../src/data/game/preparation-consumables.json";
import { loadPreparationConsumables } from "../../../src/data/game/preparation-consumables.js";
import simcConsumables from "../../../src/data/simulation-models/simc-0a72e6a7/consumables.json";

type Json = Record<string, unknown>;

function loaded() {
  const load = loadPreparationConsumables();
  if (!load.ok) throw new Error(load.detail);
  return load;
}

describe("committed identities", () => {
  it("load, with SimulationCraft provenance on the analyzer authority model (33622e9d)", () => {
    const load = loaded();
    expect(load.data.provenance).toMatchObject({
      commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
      clientDataWowVersion: "12.1.0.69587",
      method: "MACHINE_EXTRACTED_SHARED_COOLDOWN_CLASSIFICATION",
    });
    expect(load.data.provenance.sources.map((source) => source.path)).toEqual([
      "engine/dbc/generated/sc_spell_data.inc",
      "engine/dbc/generated/racial_spells.inc",
      "engine/dbc/generated/client_data_version.inc",
    ]);
  });

  it("classify the current content's health potions, healthstones and combat potions", () => {
    const kindOf = (spellId: number) => loaded().bySpellId.get(spellId)?.kind;
    for (const id of [1234768, 1295247, 1238009, 431416])
      expect(kindOf(id), String(id)).toBe("HEALTH_POTION");
    for (const id of [6262, 452930]) expect(kindOf(id), String(id)).toBe("HEALTHSTONE");
    for (const id of [1236616, 1236994, 1236998, 1238443, 1295015, 1295132]) {
      expect(kindOf(id), String(id)).toBe("COMBAT_POTION");
    }
  });

  it("do not classify the healthstone talent modifiers or any racial ability", () => {
    const { bySpellId } = loaded();
    for (const id of [1271699, 262031, 262080, 387636]) expect(bySpellId.has(id), String(id)).toBe(false);
    // Racial abilities from the pinned racial_spells.inc (Blood Fury, Gift of
    // the Naaru, Will to Survive, The Human Spirit, Berserking, Fireblood).
    for (const id of [33697, 33702, 20572, 28880, 59752, 20598, 26297, 265221]) {
      expect(bySpellId.has(id), String(id)).toBe(false);
    }
  });

  it("the longest combat-potion buff bounds a hidden pre-pull potion (60 s at this data)", () => {
    expect(loaded().maxCombatPotionAuraDurationMs).toBe(60000);
  });

  it("agrees with the independent item-effect extraction: every simulation-model POTION aura is a combat potion", () => {
    const potions = (simcConsumables.consumableAuras as { spellId: number; kind: string }[]).filter(
      (aura) => aura.kind === "POTION",
    );
    expect(potions.length).toBeGreaterThan(0);
    for (const potion of potions) {
      expect(loaded().bySpellId.get(potion.spellId)?.kind, String(potion.spellId)).toBe("COMBAT_POTION");
    }
  });

  it("names match Warcraft Logs' own ability names in committed report master data", () => {
    const root = "tests/corpus/artifacts/wcl-graphql";
    const names = new Map<number, string>();
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value !== null && typeof value === "object") {
        const node = value as Json;
        if (typeof node["gameID"] === "number" && typeof node["name"] === "string") {
          names.set(node["gameID"], node["name"]);
        }
        Object.values(node).forEach(walk);
      }
    };
    for (const file of readdirSync(root, { recursive: false, withFileTypes: false }).filter((name) =>
      name.startsWith("wcl-fight-context-"),
    )) {
      walk(JSON.parse(readFileSync(join(root, file), "utf8")));
    }
    const corroborated = [6262, 452930, 1234768, 1295247, 1236616, 1236994, 1295132];
    for (const id of corroborated) {
      expect(names.get(id), String(id)).toBe(loaded().bySpellId.get(id)?.name);
    }
  });
});

describe("fail-closed loading", () => {
  const clone = (): Json => structuredClone(artifact) as unknown as Json;

  it("a malformed artifact is a load failure, never an empty table", () => {
    expect(loadPreparationConsumables({}).ok).toBe(false);
    const empty = clone();
    empty["consumables"] = [];
    expect(loadPreparationConsumables(empty).ok).toBe(false);
  });

  it("a duplicated spell, a misclassified anchor or a missing kind fails", () => {
    const duplicated = clone();
    const list = duplicated["consumables"] as Json[];
    duplicated["consumables"] = [...list, list[0]];
    expect(loadPreparationConsumables(duplicated)).toMatchObject({
      ok: false,
      detail: "a spell id is listed twice",
    });

    const anchor = clone();
    anchor["consumables"] = (anchor["consumables"] as Json[]).map((entry) =>
      entry["spellId"] === 6262 ? { ...entry, kind: "HEALTH_POTION" } : entry,
    );
    expect(loadPreparationConsumables(anchor)).toMatchObject({ ok: false });

    const noHealthstones = clone();
    noHealthstones["consumables"] = (noHealthstones["consumables"] as Json[]).filter(
      (entry) => entry["kind"] !== "HEALTHSTONE",
    );
    noHealthstones["anchors"] = (noHealthstones["anchors"] as Json[]).filter(
      (entry) => entry["kind"] !== "HEALTHSTONE",
    );
    expect(loadPreparationConsumables(noHealthstones)).toMatchObject({ ok: false });
  });
});
