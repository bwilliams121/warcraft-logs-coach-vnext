import { describe, expect, it } from "vitest";

import bloodCosts from "../../src/data/game/deathknight-blood-spender-costs.json";
import brewmasterCosts from "../../src/data/game/monk-brewmaster-spender-costs.json";
import retributionCosts from "../../src/data/game/paladin-retribution-spender-costs.json";
import {
  POWER_TYPE_DATA_SOURCE,
  RESOURCE_WIRE_CONTRACTS,
  resourceWireTypeFor,
  type ResourceId,
} from "../../src/data/wcl-wire/resource-types.js";
import { corpusState } from "../support/corpus/fight.js";

/**
 * M11-D2-A1 — every resource wire contract states its unit scale, and each
 * `wireEncoding` claim is re-checked here against committed evidence rather
 * than trusted as prose.
 *
 * The divisors are the `power_type_data.inc` column of the pinned SimC commit
 * (sha256 recorded in `POWER_TYPE_DATA_SOURCE`); the file itself is not
 * committed, so its rows are pinned here by value, exactly as the contract
 * records them.
 */

const EXPECTED: Readonly<
  Record<ResourceId, { wireType: number; name: string; divisor: number; whole: boolean }>
> = {
  COMBO_POINTS: { wireType: 4, name: "Combo_points", divisor: 1, whole: true },
  ENERGY: { wireType: 3, name: "Energy", divisor: 1, whole: false },
  HOLY_POWER: { wireType: 9, name: "Holy_power", divisor: 1, whole: true },
  RUNES: { wireType: 5, name: "Runes", divisor: 1, whole: true },
  RUNIC_POWER: { wireType: 6, name: "Runic_power", divisor: 10, whole: false },
  // M11-D2-A2. None is an indivisible count: the pinned row type has no such
  // field, and the rows themselves show a 10.0 divisor (Rage), 5.0/s
  // regeneration (Focus) and -1.0/s decay (Fury).
  RAGE: { wireType: 1, name: "Rage", divisor: 10, whole: false },
  FOCUS: { wireType: 2, name: "Focus", divisor: 1, whole: false },
  FURY: { wireType: 17, name: "Fury", divisor: 1, whole: false },
};

describe("every resource wire contract states its unit scale", () => {
  it("covers exactly the eight modelled resources", () => {
    expect(RESOURCE_WIRE_CONTRACTS.map((contract) => contract.resourceId).sort()).toEqual(
      Object.keys(EXPECTED).sort(),
    );
  });

  it.each(Object.entries(EXPECTED))(
    "%s carries the pinned power_type_data row and divisor",
    (resourceId, expected) => {
      const contract = RESOURCE_WIRE_CONTRACTS.find((entry) => entry.resourceId === resourceId);
      expect(contract).toBeDefined();
      if (contract === undefined) return;
      expect(contract.wireType).toBe(expected.wireType);
      // The power_type_data row IS the wire type, and its divisor IS the contract's.
      expect(contract.unitScale.powerTypeData).toEqual({
        id: expected.wireType,
        name: expected.name,
        divisor: expected.divisor,
      });
      expect(contract.unitScale.divisor).toBe(contract.unitScale.powerTypeData.divisor);
      expect(contract.unitScale.wholeUnits).toBe(expected.whole);
      expect(contract.unitScale.wireEncoding.length).toBeGreaterThan(0);
    },
  );

  it("names one pinned game-data source at the pinned commit and client build", () => {
    expect(POWER_TYPE_DATA_SOURCE).toEqual({
      repository: "https://github.com/simulationcraft/simc",
      commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
      sourcePath: "engine/dbc/generated/power_type_data.inc",
      sourceSha256: "c5e8e2327005f47d4aa31b64fc3e59572b39c291624b3ad3221682e8fb9055ee",
      sourceByteLength: 2614,
      gameBuild: "12.1.0.69587",
      retrievedOn: "2026-09-30",
    });
  });

  it("keeps version handling fail-closed: the scale is reachable only through a compatible lookup", () => {
    for (const resourceId of Object.keys(EXPECTED) as ResourceId[]) {
      const compatible = resourceWireTypeFor(resourceId, { gameVersion: 1, logVersion: 17 });
      expect(compatible.ok && compatible.contract.unitScale.divisor).toBe(EXPECTED[resourceId].divisor);
      expect(resourceWireTypeFor(resourceId, { gameVersion: 1, logVersion: 18 }).ok).toBe(false);
      expect(resourceWireTypeFor(resourceId, { gameVersion: null, logVersion: 17 }).ok).toBe(false);
      expect(resourceWireTypeFor(resourceId, { gameVersion: 2, logVersion: 17 }).ok).toBe(false);
    }
  });
});

/** Every positive wire cost of one resource on one actor's completed casts of one ability, with the PRE_COST amount. */
function costedCasts(artifactId: string, actorId: number, abilityGameId: number, wireType: number) {
  const state = corpusState(artifactId);
  const rows: { cost: number; amount: number; max: number | null }[] = [];
  for (const event of state.fight.events) {
    if (event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    if (event.source?.actorId !== actorId || event.abilityGameId !== abilityGameId) continue;
    const entry = event.attachedResources?.classResources.find(
      (resource) => resource.resourceType === wireType,
    );
    if (entry === undefined || entry.cost === null || entry.cost <= 0) continue;
    rows.push({ cost: entry.cost, amount: entry.amount, max: entry.max });
  }
  return rows;
}

/** The pinned DBC `_cost` of one power type on one spell of a committed spender-cost dataset. */
function pinnedCost(
  dataset: {
    readonly spells: readonly { readonly spellId: number; readonly powerRows?: readonly unknown[] }[];
  },
  spellId: number,
  powerType: number,
): number {
  const spell = dataset.spells.find((entry) => entry.spellId === spellId);
  const row = (spell?.powerRows ?? []).find(
    (entry) => (entry as { readonly powerType?: unknown }).powerType === powerType,
  ) as { readonly cost?: unknown } | undefined;
  if (typeof row?.cost !== "number")
    throw new Error(`no pinned cost for ${String(spellId)} power ${String(powerType)}`);
  return row.cost;
}

describe("each contract's wireEncoding claim holds on the committed evidence it names", () => {
  it("Energy: Tiger Palm and Keg Smash wire costs equal their pinned DBC costs", () => {
    for (const spellId of [100_780, 121_253]) {
      const rows = costedCasts("wcl-brewmaster-monk-gtkb-opener", 4, spellId, 3);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row.cost).toBe(pinnedCost(brewmasterCosts, spellId, 3));
    }
  });

  it("Holy Power: Divine Storm and Final Verdict wire costs equal their pinned DBC costs", () => {
    for (const spellId of [53_385, 383_328]) {
      const rows = costedCasts("wcl-retribution-paladin-a7r6-rotational-45s", 6, spellId, 9);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.cost).toBe(pinnedCost(retributionCosts, spellId, 9));
        expect(row.max).toBe(5);
      }
    }
  });

  it("Runes: Marrowrend and Heart Strike wire costs equal their pinned DBC costs", () => {
    for (const spellId of [195_182, 206_930]) {
      const rows = costedCasts("wcl-blood-death-knight-a7r6-rotational-45s", 14, spellId, 5);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row.cost).toBe(pinnedCost(bloodCosts, spellId, 5));
        expect(row.max).toBe(6);
      }
    }
  });

  it("Runic Power: the Death Strike wire cost equals its pinned DBC cost, in tenths", () => {
    const rows = costedCasts("wcl-blood-death-knight-a7r6-rotational-45s", 14, 49_998, 6);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.cost).toBe(pinnedCost(bloodCosts, 49_998, 6));
      expect(row.max).toBe(1250);
    }
  });

  it("Combo points: every Envenom's wire cost is the whole amount spent, against a maximum of 7", () => {
    const rows = costedCasts("wcl-assassination-envenom-combo-points", 19, 32_645, 4);
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.cost).toBe(row.amount);
      expect(Number.isSafeInteger(row.amount)).toBe(true);
      expect(row.max).toBe(7);
    }
  });
  /**
   * M11-D2-A2. No committed dataset carries Warrior, Hunter or Demon Hunter
   * spell costs, so the pinned DBC rows are stated here by value, exactly as
   * read from SimulationCraft 33622e9d engine/dbc/generated/sc_spell_data.inc
   * (sha256 d8e3d1970520f2161de6d5a59aa5ea0e7c81eaef14c6bc980d5a208ed33b4c62,
   * the hash every committed spender-cost dataset records), table
   * __spellpower_data: [spell id, power row id, power type, _cost].
   */
  const PINNED_POWER_ROWS: readonly (readonly [number, number, number, number])[] = [
    [845, 99, 1, 200], // Cleave, Rage
    [12_294, 9599, 1, 300], // Mortal Strike, Rage
    [34_026, 1470, 2, 30], // Kill Command, Focus
    [193_455, 10_443, 2, 35], // Cobra Shot, Focus
    [198_013, 10_720, 17, 30], // Eye Beam, Fury
    [201_427, 10_809, 17, 40], // Annihilation, Fury
  ];

  it.each([
    ["Rage", 4, 1, 1300],
    ["Focus", 20, 2, 100],
    ["Fury", 18, 17, 170],
  ] as const)(
    "%s: every retained cast's wire cost equals its spell's pinned DBC cost",
    (_name, actorId, wireType, max) => {
      const rows = PINNED_POWER_ROWS.filter(([, , powerType]) => powerType === wireType);
      expect(rows).toHaveLength(2);
      for (const [spellId, , , cost] of rows) {
        const casts = costedCasts("wcl-rage-fury-focus-pre-cost", actorId, spellId, wireType);
        expect(casts, String(spellId)).toHaveLength(1);
        expect(casts[0]?.cost).toBe(cost);
        expect(casts[0]?.max).toBe(max);
      }
    },
  );

  it("Rage: the wire carries tenths, so a retained amount is not a whole number of Rage", () => {
    // Cleave at 464 is 46.4 Rage: only the divisor 10 reading is consistent
    // with a 200 (= 20 Rage) cost against a 1300 (= 130 Rage) maximum.
    const [cleave] = costedCasts("wcl-rage-fury-focus-pre-cost", 4, 845, 1);
    expect(cleave?.amount).toBe(464);
    expect((cleave?.amount ?? 0) / 10).toBe(46.4);
  });
});
