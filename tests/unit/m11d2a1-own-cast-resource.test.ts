import { describe, expect, it } from "vitest";

import { resourceWireTypeFor, type ResourceId } from "../../src/data/wcl-wire/resource-types.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import type { CombatEvent } from "../../src/engine/normalization/normalized-events.js";
import { ownCastResourceAt, type OwnCastResource } from "../../src/findings/resources/own-cast-resource.js";
import {
  attachedResources,
  castEvent,
  classResource,
  damageEvent,
  syntheticFight,
} from "../support/synthetic-fight.js";

/**
 * M11-D2-A1 — the shared own-cast resource reader, case by case, over
 * synthetic fights. Every refusal is exercised; the committed-corpus
 * differential against the specialization readers lives in
 * tests/contracts/m11d2a1-own-cast-resource-parity.test.ts.
 */

const ACTOR = 14;
const OTHER = 20;
const KEYS = { gameVersion: 1, logVersion: 17 } as const;

function wire(resourceId: ResourceId): number {
  const resolved = resourceWireTypeFor(resourceId, KEYS);
  if (!resolved.ok) throw new Error(`no contract for ${resourceId}`);
  return resolved.wireType;
}

const RUNIC_POWER = wire("RUNIC_POWER");
const RUNES = wire("RUNES");
const COMBO_POINTS = wire("COMBO_POINTS");
const ENERGY = wire("ENERGY");

function stateOf(events: readonly CombatEvent[], provenance: { readonly logVersion?: number } = {}) {
  const fight = syntheticFight({ observedCategories: ["RESOURCES", "CASTS"], events });
  return createCombatState(
    provenance.logVersion === undefined
      ? fight
      : { ...fight, provenance: { ...fight.provenance, logVersion: provenance.logVersion } },
  );
}

function ownCast(
  resources: ReturnType<typeof classResource>[],
  options: {
    readonly castPhase?: "BEGIN" | "COMPLETE";
    readonly source?: number;
    readonly side?: "SOURCE" | "TARGET";
  } = {},
): CombatEvent {
  return castEvent({
    ordinal: 0,
    reportTimeMs: 1200,
    castPhase: options.castPhase ?? "COMPLETE",
    sourceActorId: options.source ?? ACTOR,
    abilityGameId: 49_998,
    attachedResources: attachedResources({
      side: options.side ?? "SOURCE",
      actorId: ACTOR,
      classResources: resources,
    }),
  });
}

function read(events: readonly CombatEvent[], resourceId: ResourceId, logVersion?: number): OwnCastResource {
  return ownCastResourceAt(stateOf(events, logVersion === undefined ? {} : { logVersion }), {
    position: 0,
    actorId: ACTOR,
    resourceId,
  });
}

function refusalOf(result: OwnCastResource): string {
  return result.state === "REFUSED" ? result.reason : "ACCEPTED";
}

describe("accepts an exact PRE_COST observation on the actor's own completed cast", () => {
  it("divides Runic Power by the contract's divisor 10, from one observation", () => {
    const result = read(
      [ownCast([classResource(RUNIC_POWER, 440, { max: 1250, cost: 450 })])],
      "RUNIC_POWER",
    );
    expect(result.state).toBe("EXACT_PRE_COST");
    if (result.state !== "EXACT_PRE_COST") return;
    expect(result.wireAmount).toBe(440);
    expect(result.wireMax).toBe(1250);
    expect(result.wireCost).toBe(450);
    expect(result.unitScale.divisor).toBe(10);
    expect(result.amount).toBe(44);
    expect(result.max).toBe(125);
    expect(result.deficit).toBe(81);
    expect(result.observation.timing).toBe("PRE_COST");
    expect(result.observation.locator.ingestionOrdinal).toBe(0);
  });

  it("leaves a unit-1 resource unchanged", () => {
    const runes = read([ownCast([classResource(RUNES, 3, { max: 6, cost: 2 })])], "RUNES");
    expect(runes.state === "EXACT_PRE_COST" && [runes.amount, runes.max, runes.deficit]).toEqual([3, 6, 3]);
    const combo = read([ownCast([classResource(COMBO_POINTS, 5, { max: 7, cost: 5 })])], "COMBO_POINTS");
    expect(combo.state === "EXACT_PRE_COST" && [combo.amount, combo.deficit]).toEqual([5, 2]);
  });

  it("derives the deficit from the SAME snapshot's maximum", () => {
    // A second pool on the same event carries a different maximum; it is never read.
    const result = read(
      [
        ownCast([
          classResource(RUNIC_POWER, 1000, { max: 1000, cost: 350 }),
          classResource(RUNES, 2, { max: 6, cost: 1 }),
        ]),
      ],
      "RUNIC_POWER",
    );
    expect(result.state === "EXACT_PRE_COST" && result.deficit).toBe(0);
  });

  it("accepts a fractional amount only where the resource is not a count", () => {
    const energy = read([ownCast([classResource(ENERGY, 57.5, { max: 100, cost: 40 })])], "ENERGY");
    expect(energy.state === "EXACT_PRE_COST" && energy.amount).toBe(57.5);
    const combo = read([ownCast([classResource(COMBO_POINTS, 4.5, { max: 7, cost: 4 })])], "COMBO_POINTS");
    expect(refusalOf(combo)).toBe("AMOUNT_UNUSABLE");
  });
});

describe("refuses everything it cannot establish", () => {
  const exact = [classResource(RUNIC_POWER, 440, { max: 1250, cost: 450 })];

  it("another actor's cast, and a cast with no source", () => {
    expect(refusalOf(read([ownCast(exact, { source: OTHER })], "RUNIC_POWER"))).toBe(
      "NOT_THE_ACTORS_OWN_CAST",
    );
    const unsourced = castEvent({
      ordinal: 0,
      reportTimeMs: 1200,
      castPhase: "COMPLETE",
      sourceActorId: null,
      attachedResources: attachedResources({ side: "SOURCE", actorId: ACTOR, classResources: exact }),
    });
    expect(refusalOf(read([unsourced], "RUNIC_POWER"))).toBe("NOT_THE_ACTORS_OWN_CAST");
  });

  it("the actor's pool seen from the TARGET side of its own cast", () => {
    expect(refusalOf(read([ownCast(exact, { side: "TARGET" })], "RUNIC_POWER"))).toBe(
      "NOT_THE_CASTERS_SNAPSHOT",
    );
  });

  it("a begincast, and a non-cast event", () => {
    expect(refusalOf(read([ownCast(exact, { castPhase: "BEGIN" })], "RUNIC_POWER"))).toBe(
      "CAST_NOT_COMPLETED",
    );
    const damage = damageEvent({
      ordinal: 0,
      reportTimeMs: 1200,
      sourceActorId: ACTOR,
      attachedResources: attachedResources({ side: "SOURCE", actorId: ACTOR, classResources: exact }),
    });
    expect(refusalOf(read([damage], "RUNIC_POWER"))).toBe("NOT_A_CAST");
    expect(
      refusalOf(ownCastResourceAt(stateOf([]), { position: 3, actorId: ACTOR, resourceId: "RUNIC_POWER" })),
    ).toBe("NOT_A_CAST");
  });

  it("a missing observation, never zero", () => {
    const result = read([ownCast([classResource(RUNES, 2, { max: 6, cost: 1 })])], "RUNIC_POWER");
    expect(refusalOf(result)).toBe("NO_OBSERVATION");
    expect(result.state === "REFUSED" && result.locators).toHaveLength(1);
  });

  it("an uncosted entry, which is not PRE_COST", () => {
    const result = read([ownCast([classResource(RUNIC_POWER, 440, { max: 1250, cost: 0 })])], "RUNIC_POWER");
    expect(refusalOf(result)).toBe("NOT_PRE_COST");
  });

  it("unusable amounts and maxima", () => {
    const cases: readonly [ReturnType<typeof classResource>, string][] = [
      [classResource(RUNIC_POWER, -10, { max: 1250, cost: 450 }), "AMOUNT_UNUSABLE"],
      [classResource(RUNIC_POWER, Number.NaN, { max: 1250, cost: 450 }), "AMOUNT_UNUSABLE"],
      [classResource(RUNIC_POWER, 440, { max: null, cost: 450 }), "MAX_UNKNOWN"],
      [classResource(RUNIC_POWER, 440, { max: 0, cost: 450 }), "MAX_UNUSABLE"],
      [classResource(RUNIC_POWER, 1300, { max: 1250, cost: 450 }), "AMOUNT_ABOVE_MAX"],
      [classResource(RUNES, 2, { max: 6.5, cost: 1 }), "MAX_UNUSABLE"],
    ];
    for (const [entry, reason] of cases) {
      const resourceId: ResourceId = entry.resourceType === RUNES ? "RUNES" : "RUNIC_POWER";
      expect(refusalOf(read([ownCast([entry])], resourceId)), JSON.stringify(entry)).toBe(reason);
    }
  });

  it("a log version the contract is not established for", () => {
    const result = read([ownCast(exact)], "RUNIC_POWER", 18);
    expect(refusalOf(result)).toBe("INCOMPATIBLE_VERSION");
    expect(result.state === "REFUSED" && result.compatibility?.compatible).toBe(false);
  });

  it("a resource with no contract", () => {
    const result = ownCastResourceAt(stateOf([ownCast(exact)]), {
      position: 0,
      actorId: ACTOR,
      resourceId: "MAELSTROM" as ResourceId,
    });
    expect(refusalOf(result)).toBe("NO_CONTRACT_FOR_RESOURCE");
  });
});
