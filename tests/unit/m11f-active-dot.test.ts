import { describe, expect, it } from "vitest";

import { casterAuraCarriersAt } from "../../src/engine/auras/aura-carriers.js";
import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import { createNormalizer } from "../../src/engine/normalization/event-normalizer.js";
import { sourceRef } from "../../src/engine/normalization/normalized-events.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  resurrectionContractFor,
  SUPPORTED_TYPE_CONTRACTS,
  type SupportedTypeContract,
} from "../../src/engine/normalization/supported-families.js";
import { createCombatState, type CombatState } from "../../src/engine/state/combat-state.js";
import { afterEvent } from "../../src/engine/state/temporal.js";
import { ROGUE_ABILITIES } from "../../src/data/game/rogue-abilities.js";
import {
  activeDotAtoms,
  activeDotBinding,
  activeDotIdentifiers,
} from "../../src/simc/expression/active-dot.js";
import { isBuiltinIdentifier, parseSimcExpression } from "../../src/simc/expression/parse.js";
import { defineSpecAtomVocabulary } from "../../src/simc/expression/spec-vocabulary.js";
import {
  assassinationActiveDotAtoms,
  assassinationActiveDotMappings,
  assassinationDotCarriers,
} from "../../src/specs/rogue/assassination/active-dot.js";
import aplArtifact from "../../src/simc/data/rogue-assassination.apl.json";
import { corpusState } from "../support/corpus/fight.js";
import { observableCategory, syntheticFight, UNVERIFIED_CATEGORY } from "../support/synthetic-fight.js";

/**
 * M11-F: `active_dot.X` / `dot.X.active_dots` — the number of target
 * instances carrying THIS caster's DoT. Proven lower bounds only; never a
 * value from silence; positive deaths end a DoT, the absence of one does not.
 */

type Raw = Record<string, unknown>;
const START = 1_000;
const END = 60_000;
const CASTER = 15;
const OTHER = 16;
const DOT = 703;

function stateOf(
  raw: readonly Raw[],
  options: { auras?: boolean; extra?: readonly SupportedTypeContract[] } = {},
): CombatState {
  const normalizer = createNormalizer({
    fightStartTimeMs: START,
    requestedRange: inclusiveRange(START, END),
    contracts: indexContracts([...SUPPORTED_TYPE_CONTRACTS, ...(options.extra ?? [])]),
    directionFields: VERIFIED_DIRECTION_FIELDS,
  });
  normalizer.accept({
    streamId: "all",
    pageOrdinal: 0,
    requestedStartTimeMs: START,
    nextPageTimestamp: null,
    events: raw,
  });
  const output = normalizer.finish();
  return createCombatState(
    syntheticFight({
      events: output.events,
      startTimeMs: START,
      endTimeMs: END,
      categories: {
        AURAS:
          options.auras === false
            ? UNVERIFIED_CATEGORY
            : observableCategory(inclusiveRange(START, END), null),
      },
    }),
  );
}

const aura = (
  timestamp: number,
  type: string,
  target: number,
  instance: number,
  source = CASTER,
  ability = DOT,
): Raw => ({
  timestamp,
  type,
  sourceID: source,
  targetID: target,
  targetInstance: instance,
  abilityGameID: ability,
  fight: 1,
});
const death = (timestamp: number, target: number, instance: number): Raw => ({
  timestamp,
  type: "death",
  sourceID: -1,
  targetID: target,
  targetInstance: instance,
  abilityGameID: 0,
  fight: 1,
});
const lastPosition = (state: CombatState) => afterEvent(state.fight.events.length - 1);
const carriersOf = (state: CombatState, at = lastPosition(state)) =>
  casterAuraCarriersAt(state, {
    caster: sourceRef(CASTER, null),
    auraAbilityGameIds: [DOT],
    auraClass: "DEBUFF",
    at,
  });
const summary = (state: CombatState, at = lastPosition(state)) => {
  const result = carriersOf(state, at);
  return {
    targets: result.targets.map((entry) => [
      `${String(entry.target.actorId)}#${String(entry.target.instanceId)}`,
      entry.state,
      entry.basis,
    ]),
    count: result.count,
    upperBound: result.upperBound,
  };
};

describe("the caster's carrier count", () => {
  it("counts proven-active targets as a LOWER bound, per target instance, never with an upper bound", () => {
    const state = stateOf([
      aura(2_000, "applydebuff", 180, 1),
      aura(2_100, "applydebuff", 180, 2),
      aura(2_200, "applydebuff", 161, 0),
      aura(3_000, "removedebuff", 180, 2),
      aura(3_100, "cast", 180, 1),
    ]);
    expect(summary(state)).toEqual({
      targets: [
        ["180#1", "PROVEN_ACTIVE", "AURA_PRESENCE_ACTIVE"],
        ["180#2", "PROVEN_INACTIVE", "AURA_PRESENCE_INACTIVE"],
        ["161#0", "PROVEN_ACTIVE", "AURA_PRESENCE_ACTIVE"],
      ],
      count: { kind: "AT_LEAST", lowerBound: 2 },
      upperBound: "NOT_ESTABLISHED",
    });
  });

  it("is caster-specific: another source's DoT on the same target is a different aura and is not counted", () => {
    const state = stateOf([
      aura(2_000, "applydebuff", 180, 1, OTHER),
      aura(2_100, "removedebuff", 180, 1, OTHER),
    ]);
    expect(summary(state).targets).toEqual([]);
    expect(summary(state).count).toEqual({ kind: "UNKNOWN", reason: "NO_PROVEN_CARRIER" });
  });

  it("never reads silence: without aura coverage an observed application proves nothing past itself", () => {
    const state = stateOf([aura(2_000, "applydebuff", 180, 1), aura(5_000, "cast", 999, 1, OTHER)], {
      auras: false,
    });
    expect(summary(state).targets).toEqual([["180#1", "UNKNOWN", "AURA_PRESENCE_UNKNOWN"]]);
    expect(summary(state).count.kind).toBe("UNKNOWN");
  });

  it("a POSITIVE death of the target after the anchor ends that target's DoT; the absence of one changes nothing", () => {
    const state = stateOf([
      aura(2_000, "applydebuff", 180, 1),
      aura(2_100, "applydebuff", 180, 2),
      death(3_000, 180, 1),
      aura(4_000, "cast", 999, 1, OTHER),
    ]);
    expect(summary(state).targets).toEqual([
      ["180#1", "PROVEN_INACTIVE", "ENDED_BY_POSITIVE_DEATH"],
      ["180#2", "PROVEN_ACTIVE", "AURA_PRESENCE_ACTIVE"],
    ]);
    expect(summary(state).count).toEqual({ kind: "AT_LEAST", lowerBound: 1 });
  });

  it("a death in the anchor's own millisecond, or at the query millisecond, leaves that target UNKNOWN", () => {
    const sameAsAnchor = stateOf([aura(2_000, "applydebuff", 180, 1), death(2_000, 180, 1)]);
    expect(summary(sameAsAnchor).targets).toEqual([["180#1", "UNKNOWN", "DEATH_STATE_UNRESOLVED"]]);
    const atQuery = stateOf([aura(2_000, "applydebuff", 180, 1), death(3_000, 180, 1)]);
    expect(summary(atQuery).targets).toEqual([["180#1", "UNKNOWN", "DEATH_STATE_UNRESOLVED"]]);
  });

  it("a resurrection does not recreate a DoT the death ended", () => {
    const resurrect = resurrectionContractFor({
      kind: "SANITIZED_CAPTURE",
      fixtureId: "test-only",
      capturedOn: "2026-10-06",
    });
    const state = stateOf(
      [
        aura(2_000, "applydebuff", 180, 1),
        death(3_000, 180, 1),
        {
          timestamp: 4_000,
          type: "resurrect",
          sourceID: 19,
          targetID: 180,
          targetInstance: 1,
          abilityGameID: 61999,
          fight: 1,
        },
        aura(5_000, "cast", 999, 1, OTHER),
      ],
      { extra: [resurrect] },
    );
    expect(summary(state).targets).toEqual([["180#1", "PROVEN_INACTIVE", "ENDED_BY_POSITIVE_DEATH"]]);
  });

  it("contradicting life evidence after the death makes that target UNKNOWN", () => {
    const state = stateOf([
      aura(2_000, "applydebuff", 180, 1),
      death(3_000, 180, 1),
      {
        timestamp: 4_000,
        type: "damage",
        sourceID: OTHER,
        targetID: 180,
        targetInstance: 1,
        abilityGameID: 1,
        fight: 1,
        hitType: 1,
        amount: 10,
        resourceActor: 2,
        classResources: [],
        hitPoints: 5_000,
        maxHitPoints: 10_000,
      },
    ]);
    expect(summary(state).targets).toEqual([["180#1", "UNKNOWN", "DEATH_STATE_UNRESOLVED"]]);
  });

  it("no future evidence: applications and deaths after the position are not read", () => {
    const state = stateOf([
      aura(2_000, "applydebuff", 180, 1),
      aura(4_000, "applydebuff", 180, 2),
      death(5_000, 180, 1),
    ]);
    expect(summary(state, afterEvent(0))).toEqual({
      targets: [["180#1", "PROVEN_ACTIVE", "AURA_PRESENCE_ACTIVE"]],
      count: { kind: "AT_LEAST", lowerBound: 1 },
      upperBound: "NOT_ESTABLISHED",
    });
  });
});

describe("the SimulationCraft binding", () => {
  it("binds a proven lower bound as BOUNDED_NUMBER under both identifiers, and nothing else as a value", () => {
    expect(activeDotIdentifiers("garrote")).toEqual(["active_dot.garrote", "dot.garrote.active_dots"]);
    expect(activeDotBinding({ kind: "AT_LEAST", lowerBound: 2 })).toEqual({
      state: "BOUNDED_NUMBER",
      atLeast: 2,
      reason: "STATE_NOT_ESTABLISHED",
    });
    expect(activeDotBinding({ kind: "AT_LEAST", lowerBound: 0 })).toEqual({
      state: "UNKNOWN_NUMBER",
      reason: "STATE_NOT_ESTABLISHED",
    });
    expect(activeDotBinding({ kind: "UNKNOWN", reason: "NO_PROVEN_CARRIER" })).toEqual({
      state: "UNKNOWN_NUMBER",
      reason: "STATE_NOT_ESTABLISHED",
    });
    const mapping = {
      simcToken: "x",
      auraAbilityGameIds: [1],
      auraClass: "DEBUFF" as const,
      provenance: "test",
    };
    expect(
      activeDotAtoms(mapping, { kind: "AT_LEAST", lowerBound: 1 }).map((atom) => [
        atom.key,
        atom.actionToken,
      ]),
    ).toEqual([
      ["active_dot.x", null],
      ["dot.x.active_dots", null],
    ]);
  });
});

describe("Assassination's pinned mappings", () => {
  it("maps Garrote and Rupture to the pinned DEBUFF identities, agreeing with ROGUE_ABILITIES", () => {
    const mappings = assassinationActiveDotMappings();
    expect(
      mappings.map((mapping) => [mapping.simcToken, mapping.auraAbilityGameIds, mapping.auraClass]),
    ).toEqual([
      ["garrote", [703], "DEBUFF"],
      ["rupture", [1943], "DEBUFF"],
    ]);
    for (const mapping of mappings) {
      const ability = ROGUE_ABILITIES.find((entry) => entry.simcToken === mapping.simcToken);
      expect(mapping.auraAbilityGameIds).toEqual([ability?.spellId]);
      expect(mapping.provenance).toContain("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    }
  });

  it("reads the committed Garrote evidence: actor 19's Garrote on boss 21 is a proven carrier once applied", () => {
    const state = corpusState("wcl-assassination-garrote-dot-remains");
    const [garrote] = assassinationActiveDotMappings();
    if (garrote === undefined) throw new Error("no garrote mapping");
    const firstApply = state.fight.events.findIndex(
      (event) =>
        event.kind === "AURA" &&
        event.operation === "APPLIED" &&
        event.abilityGameId === 703 &&
        event.source?.actorId === 19 &&
        event.target?.actorId === 21,
    );
    expect(firstApply).toBeGreaterThanOrEqual(0);
    // Before any application by 19 there is no candidate, so nothing is proven.
    expect(
      assassinationDotCarriers(state, 19, garrote, afterEvent(Math.max(0, firstApply - 1))).count.kind,
    ).toBe("UNKNOWN");
    const after = assassinationDotCarriers(state, 19, garrote, afterEvent(firstApply));
    expect(after.targets.map((entry) => [entry.target.actorId, entry.state])).toEqual([
      [21, "PROVEN_ACTIVE"],
    ]);
    expect(after.count).toEqual({ kind: "AT_LEAST", lowerBound: 1 });
    expect(after.upperBound).toBe("NOT_ESTABLISHED");
    const atoms = assassinationActiveDotAtoms(state, 19, afterEvent(firstApply));
    expect(atoms.find((atom) => atom.key === "active_dot.garrote")?.value).toEqual({
      kind: "MAGNITUDE",
      binding: { state: "BOUNDED_NUMBER", atLeast: 1, reason: "STATE_NOT_ESTABLISHED" },
    });
  });

  it("changes no public decision: the only pinned line reading active_dot also needs spell_targets, which stays refused", () => {
    const lines = JSON.stringify(aplArtifact).match(/"crimson_tempest,[^"]*active_dot[^"]*"/g) ?? [];
    expect(lines).toHaveLength(1);
    const line = JSON.parse(lines[0] ?? '""') as string;
    const condition = line.slice(line.indexOf(",if=") + 4);
    // Assassination's subset refuses the condition whole …
    expect(parseSimcExpression(condition)).toMatchObject({ ok: false, reason: "UNSUPPORTED_IDENTIFIER" });
    // … and even with both active_dot atoms declared, spell_targets refuses it.
    const vocabulary = defineSpecAtomVocabulary(
      "rogue/assassination",
      ["active_dot.garrote", "active_dot.rupture"].map((identifier) => ({
        identifier,
        shape: "NUMERIC" as const,
        scope: "PLAYER_SCOPED" as const,
        selfAddressing: false,
      })),
      isBuiltinIdentifier,
    );
    expect(parseSimcExpression(condition, vocabulary)).toMatchObject({
      ok: false,
      reason: "UNSUPPORTED_IDENTIFIER",
      fragment: "spell_targets.fan_of_knives",
    });
  });
});
