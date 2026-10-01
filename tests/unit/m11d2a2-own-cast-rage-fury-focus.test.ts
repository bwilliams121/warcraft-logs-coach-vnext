import { describe, expect, it } from "vitest";

import { resourceWireTypeFor, type ResourceId } from "../../src/data/wcl-wire/resource-types.js";
import { createCombatState, type CombatState } from "../../src/engine/state/combat-state.js";
import type { CombatEvent } from "../../src/engine/normalization/normalized-events.js";
import { ownCastResourceAt, type OwnCastResource } from "../../src/findings/resources/own-cast-resource.js";
import { corpusFight, corpusState, positionOfCast } from "../support/corpus/fight.js";
import { loadCommittedCorpus } from "../support/corpus/loader.js";
import { committedIdentity } from "../support/corpus/promotion-evidence.js";
import {
  attachedResources,
  castEvent,
  classResource,
  resourceChangeEvent,
  syntheticFight,
} from "../support/synthetic-fight.js";

/**
 * M11-D2-A2 — the shared own-cast reader interprets Rage, Focus and Fury from
 * committed evidence, with no specialization reader involved.
 *
 * WHAT A2 ESTABLISHES, AND WHAT IT DOES NOT
 *
 *   ESTABLISHED  an EXACT, PRE_COST observation of Rage, Focus or Fury on the
 *                actor's OWN completed cast is interpreted correctly: the wire
 *                values verbatim, and the amount, maximum and deficit in the
 *                unit SimulationCraft expressions read.
 *
 *   NOT          any Rage, Focus or Fury state BETWEEN casts. Rage gained from
 *                melee is not on the wire as a resource change; Focus
 *                regenerates; Fury drains for some specializations; and
 *                standalone resource changes a Hunter causes to its PET's
 *                Focus are currently indexed under the Hunter by source — the
 *                open D2-A3 defect. General Hunter Focus history is therefore
 *                NOT sound, and nothing here claims it is.
 *
 * Fixture: wcl-rage-fury-focus-pre-cost (A7R6kxPJ1hC8YQ4w fight 7, revision
 * 30), six own completed casts, no resource change event.
 */

const FIXTURE = "wcl-rage-fury-focus-pre-cost";

interface Case {
  readonly resourceId: ResourceId;
  readonly actorId: number;
  readonly className: string;
  readonly specName: string;
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  readonly wire: { readonly amount: number; readonly max: number; readonly cost: number };
  readonly divisor: number;
  readonly units: { readonly amount: number; readonly max: number; readonly deficit: number };
}

const CASES: readonly Case[] = [
  {
    resourceId: "RAGE",
    actorId: 4,
    className: "Warrior",
    specName: "Arms",
    abilityGameId: 845,
    reportTimeMs: 2_006_029,
    wire: { amount: 464, max: 1300, cost: 200 },
    divisor: 10,
    units: { amount: 46.4, max: 130, deficit: 83.6 },
  },
  {
    resourceId: "RAGE",
    actorId: 4,
    className: "Warrior",
    specName: "Arms",
    abilityGameId: 12_294,
    reportTimeMs: 2_012_524,
    wire: { amount: 1300, max: 1300, cost: 300 },
    divisor: 10,
    units: { amount: 130, max: 130, deficit: 0 },
  },
  {
    resourceId: "FOCUS",
    actorId: 20,
    className: "Hunter",
    specName: "BeastMastery",
    abilityGameId: 34_026,
    reportTimeMs: 2_007_928,
    wire: { amount: 100, max: 100, cost: 30 },
    divisor: 1,
    units: { amount: 100, max: 100, deficit: 0 },
  },
  {
    resourceId: "FOCUS",
    actorId: 20,
    className: "Hunter",
    specName: "BeastMastery",
    abilityGameId: 193_455,
    reportTimeMs: 2_010_916,
    wire: { amount: 98, max: 100, cost: 35 },
    divisor: 1,
    units: { amount: 98, max: 100, deficit: 2 },
  },
  {
    resourceId: "FURY",
    actorId: 18,
    className: "DemonHunter",
    specName: "Havoc",
    abilityGameId: 198_013,
    reportTimeMs: 2_008_277,
    wire: { amount: 44, max: 170, cost: 30 },
    divisor: 1,
    units: { amount: 44, max: 170, deficit: 126 },
  },
  {
    resourceId: "FURY",
    actorId: 18,
    className: "DemonHunter",
    specName: "Havoc",
    abilityGameId: 201_427,
    reportTimeMs: 2_012_753,
    wire: { amount: 109, max: 170, cost: 40 },
    divisor: 1,
    units: { amount: 109, max: 170, deficit: 61 },
  },
];

function positionIn(state: CombatState, c: Case): number {
  const found = positionOfCast(state, {
    actorId: c.actorId,
    reportTimeMs: c.reportTimeMs,
    abilityGameId: c.abilityGameId,
  });
  if (!found.ok) throw new Error(found.detail);
  return found.position;
}

function stateWithKeys(keys: {
  readonly gameVersion: number | null;
  readonly logVersion: number;
}): CombatState {
  const fight = corpusFight(FIXTURE);
  return createCombatState({ ...fight, provenance: { ...fight.provenance, ...keys } });
}

describe("the committed fixture is what the contracts say it is", () => {
  it("holds six own completed casts on the caster's side, and no resource change event", () => {
    const state = corpusState(FIXTURE);
    expect(state.fight.events).toHaveLength(6);
    for (const event of state.fight.events) {
      expect(event.kind).toBe("CAST");
      if (event.kind !== "CAST") continue;
      expect(event.castPhase).toBe("COMPLETE");
      expect(event.attachedResources?.side).toBe("SOURCE");
      expect(event.attachedResources?.actor?.actorId).toBe(event.source?.actorId);
    }
  });

  it("names actors whose identities the committed fight context proves", async () => {
    const loaded = await loadCommittedCorpus();
    if (!loaded.ok) throw new Error("the committed corpus does not load");
    const tiers = [{ rootId: "REGRESSION_CORPUS" as const, corpus: loaded.corpus, report: null }];
    for (const c of CASES) {
      expect(committedIdentity(tiers, "A7R6kxPJ1hC8YQ4w", 7, c.actorId)).toEqual({
        className: c.className,
        specName: c.specName,
      });
    }
  });
});

describe("ownCastResourceAt reads Rage, Focus and Fury from the fixture", () => {
  it.each(CASES.map((c) => [`${c.resourceId} ${String(c.abilityGameId)}`, c] as const))(
    "%s: wire values verbatim, expression units by the contract's divisor, deficit from the same snapshot",
    (_label, c) => {
      const state = corpusState(FIXTURE);
      const result = ownCastResourceAt(state, {
        position: positionIn(state, c),
        actorId: c.actorId,
        resourceId: c.resourceId,
      });
      expect(result.state).toBe("EXACT_PRE_COST");
      if (result.state !== "EXACT_PRE_COST") return;
      expect([result.wireAmount, result.wireMax, result.wireCost]).toEqual([
        c.wire.amount,
        c.wire.max,
        c.wire.cost,
      ]);
      expect(result.unitScale.divisor).toBe(c.divisor);
      expect(result.amount).toBeCloseTo(c.units.amount, 10);
      expect(result.max).toBe(c.units.max);
      expect(result.deficit).toBeCloseTo(c.units.deficit, 10);
      expect(result.deficit).toBeCloseTo((result.wireMax - result.wireAmount) / c.divisor, 10);
      expect(result.observation.timing).toBe("PRE_COST");
      expect(result.observation.side).toBe("SOURCE");
      const wire = resourceWireTypeFor(c.resourceId, { gameVersion: 1, logVersion: 17 });
      expect(wire.ok && wire.wireType).toBe(result.wireType);
    },
  );

  it("refuses each resource on a cast that is not the asking actor's own", () => {
    const state = corpusState(FIXTURE);
    const mortalStrike = CASES[1];
    if (mortalStrike === undefined) throw new Error("case");
    for (const [resourceId, actorId] of [
      ["FOCUS", 20],
      ["FURY", 18],
    ] as const) {
      const result = ownCastResourceAt(state, {
        position: positionIn(state, mortalStrike),
        actorId,
        resourceId,
      });
      expect(result.state === "REFUSED" && result.reason).toBe("NOT_THE_ACTORS_OWN_CAST");
    }
  });

  it("refuses a resource the cast does not carry, never reading it as zero", () => {
    const state = corpusState(FIXTURE);
    for (const c of CASES) {
      const other: ResourceId = c.resourceId === "RAGE" ? "FURY" : "RAGE";
      const result = ownCastResourceAt(state, {
        position: positionIn(state, c),
        actorId: c.actorId,
        resourceId: other,
      });
      expect(result.state === "REFUSED" && result.reason).toBe("NO_OBSERVATION");
    }
  });

  it.each([
    ["a later parser version", { gameVersion: 1, logVersion: 18 }],
    ["an absent game version", { gameVersion: null, logVersion: 17 }],
    ["another game version", { gameVersion: 2, logVersion: 17 }],
  ] as const)("fails closed for all three under %s", (_label, keys) => {
    const state = stateWithKeys(keys);
    for (const c of CASES) {
      const result: OwnCastResource = ownCastResourceAt(state, {
        position: positionIn(state, c),
        actorId: c.actorId,
        resourceId: c.resourceId,
      });
      expect(result.state === "REFUSED" && result.reason).toBe("INCOMPATIBLE_VERSION");
    }
  });
});

describe("the Focus boundary after A2: own-cast observations only", () => {
  // A Hunter (20) casts, causes a standalone change to its PET's (37) Focus,
  // and casts again. The reader at each cast reads that cast's own snapshot
  // and nothing else: the standalone change — which the resource index today
  // files under the Hunter by SOURCE (the D2-A3 defect) — never enters it.
  const HUNTER = 20;
  const PET = 37;
  const FOCUS = 2;
  const events: readonly CombatEvent[] = [
    castEvent({
      ordinal: 0,
      reportTimeMs: 1000,
      castPhase: "COMPLETE",
      sourceActorId: HUNTER,
      abilityGameId: 34_026,
      attachedResources: attachedResources({
        side: "SOURCE",
        actorId: HUNTER,
        classResources: [classResource(FOCUS, 100, { max: 100, cost: 30 })],
      }),
    }),
    resourceChangeEvent({
      ordinal: 1,
      reportTimeMs: 1100,
      sourceActorId: HUNTER,
      targetActorId: PET,
      resourceType: FOCUS,
      resourceChange: 10,
      attachedResources: attachedResources({
        side: "TARGET",
        actorId: PET,
        classResources: [classResource(FOCUS, 60, { max: 100 })],
      }),
    }),
    castEvent({
      ordinal: 2,
      reportTimeMs: 1200,
      castPhase: "COMPLETE",
      sourceActorId: HUNTER,
      abilityGameId: 193_455,
      attachedResources: attachedResources({
        side: "SOURCE",
        actorId: HUNTER,
        classResources: [classResource(FOCUS, 72, { max: 100, cost: 35 })],
      }),
    }),
  ];

  it("reads each cast's own snapshot, and refuses the pet-pool change outright", () => {
    const state = createCombatState(syntheticFight({ observedCategories: ["RESOURCES", "CASTS"], events }));
    const first = ownCastResourceAt(state, { position: 0, actorId: HUNTER, resourceId: "FOCUS" });
    const second = ownCastResourceAt(state, { position: 2, actorId: HUNTER, resourceId: "FOCUS" });
    expect(first.state === "EXACT_PRE_COST" && first.amount).toBe(100);
    expect(second.state === "EXACT_PRE_COST" && second.amount).toBe(72);
    expect(refusal(ownCastResourceAt(state, { position: 1, actorId: HUNTER, resourceId: "FOCUS" }))).toBe(
      "NOT_A_CAST",
    );
    expect(refusal(ownCastResourceAt(state, { position: 1, actorId: PET, resourceId: "FOCUS" }))).toBe(
      "NOT_A_CAST",
    );
  });
});

function refusal(result: OwnCastResource): string {
  return result.state === "REFUSED" ? result.reason : "ACCEPTED";
}
