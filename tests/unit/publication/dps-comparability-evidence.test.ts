/**
 * M11-G4-4: the evidence that observed and simulated DPS count the same
 * things, and the per-publication comparability rule built on it.
 *
 * Warcraft Logs (canonical subject, committed full-fight owned-pet events
 * plus the G1 DamageDone table, log version 17), reconciled to the unit:
 *
 *   table total = Σ (amount + absorbed) over the player and its owned pets,
 *                 against hostile NPCs
 *               − damage Warcraft Logs credits to another player (Bombardments)
 *
 * Friendly-target damage (redirected Blessing of Sacrifice) is excluded, and
 * `amount` excludes overkill.
 *
 * Engine (real 0a72e6a7 golden): player DPS × duration = own damage actions
 * + pet damage. Healing and absorbs are not counted.
 */

import { describe, expect, it } from "vitest";

import { ACTUAL_DPS_SOURCE } from "../../../src/cohort/observed-performance.js";
import {
  assessDpsComparability,
  WCL_DAMAGE_DONE_TABLE_SOURCE,
} from "../../../src/publication/comparability.js";
import {
  reconcileObservedAttribution,
  type ObservedAttribution,
} from "../../../src/publication/attribution.js";
import type { ObservedDps } from "../../../src/publication/record.js";
import {
  canonicalAttributionInput,
  canonicalObservedDps,
} from "../../support/publication/canonical-observed.js";
import engineGolden from "../../fixtures/simulation/simc-0a72e6a7-blood-consumption.json";
import { artifactJson, SUBJECT } from "../../support/m11/g2-four-fights.js";

type Json = Record<string, any>;

const OWNER = 15;
const PETS = [44, 45, 47];
const BOMBARDMENTS = 434481;
const BLESSING_OF_SACRIFICE = 6940;

const events: Json[] = SUBJECT.segmentIds.flatMap((id) => artifactJson(id) as Json[]);
const context = artifactJson(SUBJECT.contextId) as Json;
const actors = new Map<number, Json>(
  (context["reportData"]["report"]["masterData"]["actors"] as Json[]).map((actor) => [actor["id"], actor]),
);
const table = (artifactJson("wcl-g1-subject-performance-b1pm-fight-48") as Json)["reportData"]["report"][
  "damageDone"
]["data"];
const entry = (table["entries"] as Json[]).find((candidate) => candidate["id"] === OWNER) as Json;

const damageBy = (sources: readonly number[]) =>
  events.filter((event) => event["type"] === "damage" && sources.includes(event["sourceID"]));
const toHostile = (event: Json) => actors.get(event["targetID"])?.["type"] === "NPC";
const effective = (list: readonly Json[]) =>
  list.reduce((sum, event) => sum + (event["amount"] ?? 0) + (event["absorbed"] ?? 0), 0);

describe("Warcraft Logs: the DamageDone table total, reconciled to the unit", () => {
  it("the table is log version 17 and the subject's total is 45,802,009", () => {
    expect(table["logVersion"]).toBe(17);
    expect(entry["total"]).toBe(45_802_009);
  });

  it("every owned pet's table total is its own events' amount + absorbed against hostile NPCs", () => {
    const pets = new Map<number, number>((entry["pets"] as Json[]).map((pet) => [pet["id"], pet["total"]]));
    expect([...pets.keys()].sort((a, b) => a - b)).toEqual(PETS);
    for (const pet of PETS) {
      expect(effective(damageBy([pet]).filter(toHostile)), `pet ${String(pet)}`).toBe(pets.get(pet));
    }
  });

  it("each add's table row is owner + pets amount + absorbed; the boss row also excludes Bombardments", () => {
    const all = damageBy([OWNER, ...PETS]).filter(toHostile);
    const byTarget = new Map<number, number>();
    for (const event of all)
      byTarget.set(event["targetID"], (byTarget.get(event["targetID"]) ?? 0) + effective([event]));
    const rows = (entry["targets"] as Json[])
      .map((target) => target["total"])
      .sort((a: number, b: number) => a - b);
    const bombardments = effective(all.filter((event) => event["abilityGameID"] === BOMBARDMENTS));
    expect(bombardments).toBe(190_342);
    const reconstructed = [...byTarget.entries()].map(([target, total]) =>
      actors.get(target)?.["subType"] === "Boss" ? total - bombardments : total,
    );
    expect(reconstructed.sort((a, b) => a - b)).toEqual(rows);
  });

  it("the total is exactly owner + pets (amount + absorbed) to hostile NPCs minus Bombardments; friendly damage is excluded", () => {
    const all = damageBy([OWNER, ...PETS]);
    const friendly = all.filter((event) => !toHostile(event));
    expect(new Set(friendly.map((event) => event["abilityGameID"]))).toEqual(
      new Set([BLESSING_OF_SACRIFICE]),
    );
    const hostile = all.filter(toHostile);
    const bombardments = effective(hostile.filter((event) => event["abilityGameID"] === BOMBARDMENTS));
    expect(effective(hostile) - bombardments).toBe(entry["total"]);
  });

  it("G1's open 92,598 gap (raw-amount rollup vs table) decomposes exactly", () => {
    const all = damageBy([OWNER, ...PETS]);
    const rawAmount = all.reduce((sum, event) => sum + (event["amount"] ?? 0), 0);
    expect(rawAmount).toBe(45_709_411);
    const absorbedToHostile = all.filter(toHostile).reduce((sum, event) => sum + (event["absorbed"] ?? 0), 0);
    const redirectedAmount = all
      .filter((event) => event["abilityGameID"] === BLESSING_OF_SACRIFICE)
      .reduce((sum, event) => sum + (event["amount"] ?? 0), 0);
    const bombardments = effective(all.filter((event) => event["abilityGameID"] === BOMBARDMENTS));
    expect([absorbedToHostile, redirectedAmount, bombardments]).toEqual([2_092_963, 1_810_023, 190_342]);
    expect(rawAmount + absorbedToHostile - redirectedAmount - bombardments).toBe(entry["total"]);
  });

  it("amount excludes overkill (the one overkill event's amount is below its overkill)", () => {
    const overkill = damageBy([OWNER, ...PETS]).filter((event) => (event["overkill"] ?? 0) > 0);
    expect(overkill).toHaveLength(1);
    expect(overkill[0]?.["amount"]).toBeLessThan(overkill[0]?.["overkill"]);
  });
});

describe("engine: player DPS includes pets (real 0a72e6a7 golden)", () => {
  it("DPS × duration = own damage actions + pet damage; healing and absorbs are not counted", () => {
    const player = (engineGolden as Json)["sim"]["players"][0];
    const duration = 345.177;
    const byType = new Map<string, number>();
    for (const action of player["stats"] as Json[]) {
      byType.set(action["type"], (byType.get(action["type"]) ?? 0) + (action["compound_amount"] ?? 0));
    }
    let pets = 0;
    for (const actions of Object.values(player["stats_pets"] as Record<string, Json[]>)) {
      for (const action of actions) if (action["type"] === "damage") pets += action["compound_amount"] ?? 0;
    }
    const engineDamage = player["collected_data"]["dps"]["mean"] * duration;
    expect(pets).toBeGreaterThan(0);
    expect(Math.abs((byType.get("damage") ?? 0) + pets - engineDamage) / engineDamage).toBeLessThan(1e-12);
    // Without the pets, or with healing, it does not reconcile.
    expect(Math.abs((byType.get("damage") ?? 0) - engineDamage) / engineDamage).toBeGreaterThan(0.05);
    expect(byType.get("heal") ?? 0).toBeGreaterThan(0);
  });
});

describe("observed attribution: each observation reconciled against its own events", () => {
  it("the canonical observation reconciles exactly, excluding only Bombardments", () => {
    expect(reconcileObservedAttribution(canonicalAttributionInput())).toEqual({
      state: "RECONCILED",
      excluded: [{ abilityId: BOMBARDMENTS, amount: 190_342 }],
    });
  });

  it("an unexplained difference, even of one unit, is UNRECONCILED", () => {
    const input = canonicalAttributionInput();
    for (const tableTotal of [input.tableTotal + 1, input.tableTotal - 1]) {
      expect(reconcileObservedAttribution({ ...input, tableTotal }).state).toBe("UNRECONCILED");
    }
  });

  it("a credited ability the total did NOT exclude is a different attribution rule: UNRECONCILED", () => {
    const input = canonicalAttributionInput();
    const withCredit = input.tableTotal + 190_342;
    expect(reconcileObservedAttribution({ ...input, tableTotal: withCredit }).state).toBe("UNRECONCILED");
  });

  it("incomplete owner or pet coverage is UNRECONCILED", () => {
    for (const coverage of ["PARTIAL", "ABSENT"] as const) {
      expect(reconcileObservedAttribution({ ...canonicalAttributionInput(), coverage })).toEqual({
        state: "UNRECONCILED",
        reason: `owner and pet damage coverage is ${coverage}`,
      });
    }
  });

  it("dropping a pet from the reconciled actors breaks the reconciliation (pets are counted)", () => {
    const input = canonicalAttributionInput();
    expect(
      reconcileObservedAttribution({
        ...input,
        ownerAndPetIds: input.ownerAndPetIds.filter((id) => id !== 44),
      }).state,
    ).toBe("UNRECONCILED");
  });
});

describe("the per-publication comparability rule", () => {
  const reconciled = { state: "RECONCILED" as const, excluded: [] };
  const known = (
    overrides: Partial<{
      source: string;
      logVersion: number | null;
      targetCount: number | null;
      attribution: ObservedAttribution;
    }>,
  ): ObservedDps => ({
    state: "KNOWN",
    dps: 132_691.37,
    source: WCL_DAMAGE_DONE_TABLE_SOURCE,
    logVersion: 17,
    targetCount: 1,
    attribution: reconciled,
    ...overrides,
  });

  it("the publication source constant is the cohort's ACTUAL_DPS source", () => {
    expect(WCL_DAMAGE_DONE_TABLE_SOURCE).toBe(ACTUAL_DPS_SOURCE);
  });

  it("PROVEN only with a reconciled attribution, the table source, an evidenced log version and one target", () => {
    expect(assessDpsComparability(known({}))).toEqual({ state: "PROVEN", reasons: [] });
    expect(assessDpsComparability(known({ source: "SOMETHING_ELSE" })).state).toBe("NOT_PROVEN");
    expect(assessDpsComparability(known({ logVersion: 18 })).state).toBe("NOT_PROVEN");
    expect(assessDpsComparability(known({ logVersion: null })).state).toBe("NOT_PROVEN");
    expect(assessDpsComparability(known({ targetCount: 3 })).reasons).toEqual([
      "observed damage covers 3 targets; a simulation job is single target",
    ]);
    expect(assessDpsComparability(known({ targetCount: null })).state).toBe("NOT_PROVEN");
    expect(assessDpsComparability({ state: "UNKNOWN", reason: "x" })).toEqual({
      state: "NOT_PROVEN",
      reasons: ["observed DPS is not known"],
    });
  });

  it("metadata alone never proves it: same source, version and one target, but unreconciled attribution", () => {
    const unreconciled = known({ attribution: { state: "UNRECONCILED", reason: "difference unexplained" } });
    expect(assessDpsComparability(unreconciled)).toEqual({
      state: "NOT_PROVEN",
      reasons: ["observed attribution is not reconciled: difference unexplained"],
    });
  });

  it("the canonical subject reconciles but hit three targets: NOT_PROVEN", () => {
    const canonical = canonicalObservedDps();
    if (canonical.state !== "KNOWN") throw new Error("observed");
    expect(canonical.attribution.state).toBe("RECONCILED");
    expect(assessDpsComparability(canonical).reasons).toEqual([
      "observed damage covers 3 targets; a simulation job is single target",
    ]);
  });
});
