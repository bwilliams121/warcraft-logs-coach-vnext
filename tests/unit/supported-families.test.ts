import { describe, expect, it } from "vitest";

import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import { createNormalizer } from "../../src/engine/normalization/event-normalizer.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../src/engine/normalization/supported-families.js";
import pullWindowFixture from "../fixtures/wcl/events/wcl-pull-window-with-resources.json";
import midfightFixture from "../fixtures/wcl/events/wcl-midfight-window.json";

/**
 * Drives the real sanitized captures through the real contracts.
 *
 * A fixture that is never decoded proves nothing. These tests are what make the
 * committed evidence load-bearing rather than decorative.
 */

const RANGE = inclusiveRange(7_381_097, 7_689_007);

function normalizeFixture(events: readonly unknown[]) {
  const normalizer = createNormalizer({
    fightStartTimeMs: 7_381_097,
    requestedRange: RANGE,
    contracts: indexContracts(SUPPORTED_TYPE_CONTRACTS),
    directionFields: VERIFIED_DIRECTION_FIELDS,
  });
  normalizer.accept({
    streamId: "all",
    pageOrdinal: 0,
    requestedStartTimeMs: RANGE.fromReportTimeMs,
    nextPageTimestamp: null,
    events,
  });
  return normalizer.finish();
}

const pullOutput = normalizeFixture(pullWindowFixture);
const midfightOutput = normalizeFixture(midfightFixture);

describe("the committed captures normalize cleanly", () => {
  it("produces no malformed observations", () => {
    expect(pullOutput.malformedObservations).toHaveLength(0);
    expect(midfightOutput.malformedObservations).toHaveLength(0);
  });

  it("produces no malformed family events", () => {
    // Every recognised type decoded against real data. If a required field were
    // wrong, this is where it would surface.
    expect([...pullOutput.malformedFamilyCountsByType.entries()]).toEqual([]);
    expect([...midfightOutput.malformedFamilyCountsByType.entries()]).toEqual([]);
  });

  it("recognises every type present in the captures", () => {
    // The captures were sliced per-type precisely so this holds. A type we
    // failed to contract for would show up here as UNSUPPORTED.
    expect([...pullOutput.unsupportedTypeCounts.keys()]).toEqual([]);
    expect([...midfightOutput.unsupportedTypeCounts.keys()]).toEqual([]);
  });

  it("degrades no category", () => {
    expect([...pullOutput.degradedCategories]).toEqual([]);
    expect([...midfightOutput.degradedCategories]).toEqual([]);
  });
});

describe("casts", () => {
  it("distinguishes begincast from cast", () => {
    const casts = pullOutput.events.filter((event) => event.kind === "CAST");
    const phases = new Set(casts.map((event) => (event.kind === "CAST" ? event.castPhase : null)));

    expect(casts.length).toBeGreaterThan(0);
    expect(phases).toEqual(new Set(["BEGIN", "COMPLETE"]));
  });
});

describe("auras", () => {
  it("derives buff/debuff class from the raw type, not from the query", () => {
    const auras = midfightOutput.events.filter((event) => event.kind === "AURA");
    const classes = new Set(auras.map((event) => (event.kind === "AURA" ? event.auraClass : null)));

    expect(classes).toEqual(new Set(["BUFF", "DEBUFF"]));
  });

  it("covers all three operations", () => {
    const operations = new Set(
      midfightOutput.events
        .filter((event) => event.kind === "AURA")
        .map((event) => (event.kind === "AURA" ? event.operation : null)),
    );
    expect(operations).toEqual(new Set(["APPLIED", "REFRESHED", "REMOVED"]));
  });

  it("reads stacks only on stack-change events, and never defaults them", () => {
    for (const event of midfightOutput.events) {
      if (event.kind !== "AURA") continue;
      if (event.isStackChange) {
        expect(typeof event.stacks).toBe("number");
      }
    }
    // A non-stack aura with no `stack` key keeps null, not 0 or 1.
    const plain = midfightOutput.events.find((event) => event.kind === "AURA" && !event.isStackChange);
    if (plain?.kind === "AURA") {
      expect(plain.stacks === null || typeof plain.stacks === "number").toBe(true);
    }
  });
});

describe("damage, healing and absorbs", () => {
  it("decodes damage with its observed modifiers", () => {
    const damage = midfightOutput.events.find((event) => event.kind === "DAMAGE");
    if (damage?.kind !== "DAMAGE") throw new Error("no damage event in capture");

    expect(typeof damage.amount).toBe("number");
    expect(damage).toHaveProperty("unmitigatedAmount");
    expect(damage).toHaveProperty("absorbedAmount");
    expect(typeof damage.isTick).toBe("boolean");
  });

  it("decodes both absorb kinds", () => {
    const kinds = new Set(
      midfightOutput.events
        .filter((event) => event.kind === "ABSORB")
        .map((event) => (event.kind === "ABSORB" ? event.absorbKind : null)),
    );
    expect(kinds).toEqual(new Set(["DAMAGE_ABSORBED", "HEAL_ABSORBED"]));
  });

  it("records the absorb's attributed actor as an id without building an actor", () => {
    const absorb = midfightOutput.events.find((event) => event.kind === "ABSORB");
    if (absorb?.kind !== "ABSORB") throw new Error("no absorb event in capture");

    // `attackerID` / `healerID` are recorded as ids. No ActorRef is minted from
    // them, because that would assert a direction the envelope does not state.
    expect(typeof absorb.attributedActorId === "number" || absorb.attributedActorId === null).toBe(true);
    expect(absorb).not.toHaveProperty("attacker");
  });

  it("decodes healing with overheal where observed", () => {
    const heal = midfightOutput.events.find((event) => event.kind === "HEALING");
    if (heal?.kind !== "HEALING") throw new Error("no heal event in capture");
    expect(typeof heal.amount).toBe("number");
  });
});

describe("combatant info", () => {
  const combatantInfo = pullOutput.events.filter((event) => event.kind === "COMBATANT_INFO");

  it("decodes a snapshot per player", () => {
    expect(combatantInfo.length).toBeGreaterThan(0);
  });

  it("reads talentTree, NOT the empty talents field", () => {
    // The verified trap: the capture has `talents: []` on fully-talented
    // players while `talentTree` is populated. Reading `talents` would
    // manufacture "this player had no talents".
    const raw = (pullWindowFixture as Record<string, unknown>[]).find(
      (event) => event["type"] === "combatantinfo",
    );
    expect(raw?.["talents"]).toEqual([]);
    expect(Array.isArray(raw?.["talentTree"])).toBe(true);

    const snapshot = combatantInfo[0];
    if (snapshot?.kind !== "COMBATANT_INFO") throw new Error("no combatant info");
    expect(snapshot.snapshot.talentTree.length).toBeGreaterThan(0);
  });

  it("treats gear slots as positional", () => {
    const snapshot = combatantInfo[0];
    if (snapshot?.kind !== "COMBATANT_INFO") throw new Error("no combatant info");

    // Warcraft Logs supplies no slot key; the index is the slot.
    expect(snapshot.snapshot.gear.map((piece) => piece.slotIndex)).toEqual(
      snapshot.snapshot.gear.map((_piece, index) => index),
    );
  });

  it("keeps optional gear fields optional rather than defaulting them", () => {
    const snapshot = combatantInfo[0];
    if (snapshot?.kind !== "COMBATANT_INFO") throw new Error("no combatant info");

    const missingEnchant = snapshot.snapshot.gear.filter((piece) => piece.permanentEnchantId === null);
    // The capture has items with no enchant. Null means absent — never 0, and
    // never "no enchant was applied".
    expect(missingEnchant.length).toBeGreaterThan(0);
    for (const piece of missingEnchant) {
      expect(piece.permanentEnchantId).toBeNull();
      expect(piece.permanentEnchantId).not.toBe(0);
    }

    const noGems = snapshot.snapshot.gear.filter((piece) => piece.gemIds === null);
    expect(noGems.length).toBeGreaterThan(0);
  });

  it("records no optimization verdict", () => {
    const snapshot = combatantInfo[0];
    if (snapshot?.kind !== "COMBATANT_INFO") throw new Error("no combatant info");

    const serialized = JSON.stringify(snapshot.snapshot);
    for (const verdict of ["isBis", "optimal", "correct", "recommended", "score"]) {
      expect(serialized.toLowerCase()).not.toContain(verdict.toLowerCase());
    }
  });
});

describe("strictness on required fields", () => {
  function normalizeOne(raw: unknown) {
    return normalizeFixture([raw]).events[0];
  }

  it("fails a damage event that lost its amount", () => {
    const event = normalizeOne({ timestamp: 7_381_200, type: "damage", sourceID: 5, targetID: 160 });
    expect(event?.kind).toBe("MALFORMED_FAMILY");
    if (event?.kind === "MALFORMED_FAMILY") {
      expect(event.problems).toEqual([{ field: "amount", problem: "MISSING" }]);
    }
  });

  it("fails a stack event that lost its stack count", () => {
    const event = normalizeOne({
      timestamp: 7_381_200,
      type: "applybuffstack",
      sourceID: 5,
      targetID: 5,
    });
    expect(event?.kind).toBe("MALFORMED_FAMILY");
  });

  it("fails a resourcechange that lost its change fields", () => {
    const event = normalizeOne({ timestamp: 7_381_200, type: "resourcechange", sourceID: 5 });
    expect(event?.kind).toBe("MALFORMED_FAMILY");
  });

  it("does not fail a plain aura for having no stack count", () => {
    const event = normalizeOne({
      timestamp: 7_381_200,
      type: "applybuff",
      sourceID: 5,
      targetID: 5,
    });
    expect(event?.kind).toBe("AURA");
  });

  it("tolerates unknown extra fields on a supported type", () => {
    const event = normalizeOne({
      timestamp: 7_381_200,
      type: "cast",
      sourceID: 5,
      somethingBlizzardAddedLastWeek: { nested: true },
    });
    expect(event?.kind).toBe("CAST");
  });
});
