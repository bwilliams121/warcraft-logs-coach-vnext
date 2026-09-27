import { describe, expect, it } from "vitest";

import { exactObserved, staleObservation, unknownState } from "../../src/engine/state/state-result.js";
import type { ResourceAmountObservation } from "../../src/engine/resources/resource-observations.js";
import type { PinnedCooldownAbility } from "../../src/data/game/ability-cooldown-artifact.js";
import { brewmasterCooldownAbilitiesFor } from "../../src/data/game/monk-brewmaster-cooldowns.js";
import {
  concludePositiveUsability,
  notApplicableDimension,
  provenDimension,
  unknownDimension,
  USABILITY_DIMENSIONS,
  UsabilityObligationsIncomplete,
  type UsabilityObligations,
} from "../../src/findings/usability/usability-completeness.js";
import {
  cooldownUpperBoundMs,
  proveCooldownReadyByUpperBound,
} from "../../src/findings/usability/cooldown-positive-readiness.js";
import { proveAffordableByBaseCost } from "../../src/findings/usability/base-cost-affordability.js";
import { corroborateRangeBySameTarget } from "../../src/findings/usability/range-corroboration.js";
import { loadCommittedEvidenceArchive } from "../support/corpus/evidence-archive.js";
import { corpusState, positionOfCast, stateOfBundle } from "../support/corpus/fight.js";

/**
 * M11-C4i: the shared POSITIVE usability primitives, each on its own — the
 * completeness contract, the cooldown upper-bound proof, the base-cost
 * affordability proof and the strict same-target range corroboration. Every
 * refusal is an UNKNOWN, never a negative verdict.
 */

const GTKB = "wcl-brewmaster-monk-gtkb-opener";
const ACTOR = 4;
const FIGHT_START = 2415041;
const [KEG_SMASH, TIGER_PALM, BLACKOUT_KICK] = [121253, 100780, 205523];

const locator = {
  streamId: "all",
  pageOrdinal: 0,
  indexInPage: 0,
  ingestionOrdinal: 0,
  rawType: "cast",
  reportTimeMs: 2424688,
};

function allProven(): UsabilityObligations {
  const proven = provenDimension("TEST", "every dimension proven");
  return Object.fromEntries(
    USABILITY_DIMENSIONS.map((dimension) => [dimension, proven]),
  ) as UsabilityObligations;
}

// ---------------------------------------------------------------------------
// The completeness contract
// ---------------------------------------------------------------------------

describe("the completeness contract: PROVEN_READY is never PROVEN_USABLE on its own", () => {
  it("every dimension PROVEN or NOT_APPLICABLE concludes PROVEN_USABLE", () => {
    const dimensions = {
      ...allProven(),
      RESOURCE_AFFORDABILITY: notApplicableDimension("NO_POWER_ROW", "free"),
    };
    expect(concludePositiveUsability("keg_smash", dimensions).kind).toBe("PROVEN_USABLE");
  });

  it("a cooldown proven ready with range UNKNOWN is NOT_PROVEN, naming the unresolved dimension", () => {
    const conclusion = concludePositiveUsability("keg_smash", {
      ...allProven(),
      RANGE_TARGET: unknownDimension("CANDIDATE_UNTARGETED", "no range proof"),
    });
    expect(conclusion.kind).toBe("NOT_PROVEN");
    if (conclusion.kind === "NOT_PROVEN") expect(conclusion.unresolved).toEqual(["RANGE_TARGET"]);
  });

  it("any single UNKNOWN dimension keeps the action NOT_PROVEN", () => {
    for (const dimension of USABILITY_DIMENSIONS) {
      const conclusion = concludePositiveUsability("x", {
        ...allProven(),
        [dimension]: unknownDimension("R", "d"),
      });
      expect(conclusion.kind, dimension).toBe("NOT_PROVEN");
    }
  });

  it("a record missing a dimension, or naming one that does not exist, is refused — never a silent PROVEN_USABLE", () => {
    const { MOVEMENT_CAST: _dropped, ...missing } = allProven();
    expect(() => concludePositiveUsability("x", missing as unknown as UsabilityObligations)).toThrow(
      UsabilityObligationsIncomplete,
    );
    expect(() =>
      concludePositiveUsability("x", {
        ...allProven(),
        RACIAL: provenDimension("T", "t"),
      } as unknown as UsabilityObligations),
    ).toThrow(UsabilityObligationsIncomplete);
    expect(() =>
      concludePositiveUsability("x", {
        ...allProven(),
        GCD: { state: "MAYBE" },
      } as unknown as UsabilityObligations),
    ).toThrow(UsabilityObligationsIncomplete);
  });
});

// ---------------------------------------------------------------------------
// Cooldown upper-bound readiness
// ---------------------------------------------------------------------------

describe("the cooldown upper-bound proof", () => {
  const state = corpusState(GTKB);
  const kegSmash = brewmasterCooldownAbilitiesFor("keg_smash")[0] as PinnedCooldownAbility;
  const at = (reportTimeMs: number, abilityGameId: number) => {
    const found = positionOfCast(state, { actorId: ACTOR, reportTimeMs, abilityGameId });
    if (!found.ok) throw new Error(found.detail);
    return found.position;
  };
  const prove = (ability: PinnedCooldownAbility, position: number, relevant = [ability.abilityGameId]) =>
    proveCooldownReadyByUpperBound({
      state,
      actorId: ACTOR,
      position,
      ability,
      relevantAbilityGameIds: relevant,
      observedTalents: [],
      toleranceMs: 250,
    });
  const withUpperBound = (upperBoundMs: number): PinnedCooldownAbility => ({
    ...kegSmash,
    baseCooldownMs: 0,
    charges: 1,
    chargeCooldownMs: upperBoundMs,
    passiveModifiers: [],
    knownDynamicMutations: [],
  });

  it("the Keg Smash upper bound is its 8,000 ms charge cooldown", () => {
    expect(cooldownUpperBoundMs(kegSmash)).toBe(8000);
  });

  it("inside the upper-bound window a cast is NOT positively ready — UNKNOWN, never unusable", () => {
    // Keg Smash at 2,425,704; the next decision one second later.
    const resolution = prove(kegSmash, at(2427076, 115181));
    expect(resolution).toMatchObject({ state: "UNKNOWN", reason: "INSIDE_UPPER_BOUND_WINDOW" });
  });

  it("the tolerance boundary: elapsed exactly U + 250 is proven; one millisecond short is not", () => {
    // The Tiger Palm at 2,424,688 is 9,465 ms after the Keg Smash at 2,415,223.
    const position = at(2424688, TIGER_PALM);
    expect(prove(withUpperBound(9215), position)).toMatchObject({
      state: "PROVEN",
      evidence: {
        basis: "COOLDOWN_UPPER_BOUND_ELAPSED",
        facts: { elapsedMs: 9465, requiredElapsedMs: 9465 },
      },
    });
    expect(prove(withUpperBound(9216), position)).toMatchObject({
      state: "UNKNOWN",
      reason: "INSIDE_UPPER_BOUND_WINDOW",
    });
  });

  it("no cast since the fight start proves nothing until the upper bound has passed since the pull (possible pre-pull use)", () => {
    const niuzao = brewmasterCooldownAbilitiesFor("invoke_niuzao")[0] as PinnedCooldownAbility;
    // Before the subject's first Invoke Niuzao, 2.6 s into the fight: a pre-pull use would still be recharging.
    expect(prove(niuzao, at(2417682, BLACKOUT_KICK))).toMatchObject({
      state: "UNKNOWN",
      reason: "POSSIBLE_PRE_PULL_USE",
    });
    // An ability never cast whose bound is short: proven from the fight start, over complete coverage.
    const neverCast = { ...withUpperBound(1000), abilityGameId: 999999 };
    expect(prove(neverCast, at(2423448, BLACKOUT_KICK))).toMatchObject({
      state: "PROVEN",
      evidence: {
        basis: "COOLDOWN_UPPER_BOUND_SINCE_FIGHT_START",
        facts: { sinceFightStartMs: 2423448 - FIGHT_START },
      },
    });
  });

  it("a cast of a category sibling counts as a relevant cast", () => {
    // Treat Tiger Palm as a sibling: its cast at 2,424,688 is inside any window ending at 2,425,704.
    const position = at(2425704, KEG_SMASH);
    expect(prove(withUpperBound(2000), position, [999999])).toMatchObject({ state: "PROVEN" });
    expect(prove(withUpperBound(2000), position, [999999, TIGER_PALM])).toMatchObject({
      state: "UNKNOWN",
      reason: "INSIDE_UPPER_BOUND_WINDOW",
    });
  });

  it("a coverage gap between the last cast and the decision refuses the proof", async () => {
    // The subject's opener, then the archive's 165-285 s segment with the 20-165 s segment MISSING and
    // declared a hole. The Tiger Palm at 2,580,092 precedes the segment's first Keg Smash, so the last
    // OBSERVED Keg Smash lies in the opener — and a later one could hide in the hole.
    const loaded = await loadCommittedEvidenceArchive();
    if (!loaded.ok) throw new Error("archive");
    const gapped = stateOfBundle(
      loaded.archive,
      [GTKB, "wcl-brewmaster-monk-gtkb-full-fight.seg-165-285"],
      [{ fromReportTimeMs: 2435042, toReportTimeMs: 2580041 }],
    );
    const found = positionOfCast(gapped, {
      actorId: ACTOR,
      reportTimeMs: 2580092,
      abilityGameId: TIGER_PALM,
    });
    if (!found.ok) throw new Error(found.detail);
    const resolution = proveCooldownReadyByUpperBound({
      state: gapped,
      actorId: ACTOR,
      position: found.position,
      ability: withUpperBound(8000),
      relevantAbilityGameIds: [KEG_SMASH],
      observedTalents: [],
      toleranceMs: 250,
    });
    expect(resolution).toMatchObject({ state: "UNKNOWN", reason: "CAST_COVERAGE_NOT_COMPLETE" });
  });

  it("a modifier that may LENGTHEN the interval (or remove a charge) refuses the upper bound", () => {
    const position = at(2424688, TIGER_PALM);
    const passive = {
      origin: "SPEC_PASSIVE" as const,
      talentSpellId: 1,
      displayNameEn: "Synthetic",
      tree: null,
      traitNodeId: null,
      traitEntryId: null,
      nodeType: null,
      alternativeEntries: [],
      effectIndex: 0,
      subtype: 107,
      subtypeName: "A_ADD_FLAT_MODIFIER",
      matchedBy: "CLASS_FLAGS",
    };
    for (const modifier of [
      { ...passive, kind: "FLAT_MS" as const, value: 1000, direction: "LENGTHENS" as const },
      { ...passive, kind: "CHARGES" as const, value: -1, direction: "CHANGES_CHARGES" as const },
    ]) {
      expect(prove({ ...withUpperBound(8000), passiveModifiers: [modifier] }, position)).toMatchObject({
        state: "UNKNOWN",
        reason: "UPPER_BOUND_NOT_ESTABLISHED",
      });
    }
  });

  it("shortening modifiers, haste and resets never change the bound, so the proof stays exactly as sound", () => {
    // The real Keg Smash record: +1 charge, a hasted category, two RESET_TO_READY mutations.
    const position = at(2424688, TIGER_PALM);
    expect(cooldownUpperBoundMs(kegSmash)).toBe(cooldownUpperBoundMs(withUpperBound(8000)));
    expect(prove(kegSmash, position)).toEqual(prove(withUpperBound(8000), position));
    expect(prove(kegSmash, position)).toMatchObject({ state: "PROVEN" });
  });
});

// ---------------------------------------------------------------------------
// Base-cost affordability
// ---------------------------------------------------------------------------

function energy(
  timing: "PRE_COST" | "EVENT_ASSOCIATED",
  amount: number,
  cost: number | null,
): ResourceAmountObservation {
  return {
    position: 0,
    locator,
    side: "SOURCE",
    actor: { actorId: ACTOR, instanceId: null },
    resourceType: 3,
    observedAmount: amount,
    observedMax: 100,
    observedCost: cost,
    timing,
    attachedToRawType: "cast",
    reportTimeMs: 2424688,
    fightTimeMs: 9647,
  };
}

describe("the base-cost affordability proof never infers unaffordability", () => {
  const base = {
    observedCastBaseCost: 50,
    candidateBaseCost: 40,
    candidateCostCannotIncrease: true,
    costBoundBasis: "census: decreases only",
  };

  it("a PRE_COST observation in corroborated units, at least the base cost, with no possible increase: PROVEN", () => {
    const resolution = proveAffordableByBaseCost({
      ...base,
      observation: exactObserved(energy("PRE_COST", 100, 50), [locator], "RESOURCES"),
    });
    expect(resolution).toMatchObject({
      state: "PROVEN",
      evidence: {
        basis: "PRE_COST_AT_LEAST_BASE_COST",
        facts: { observedAmount: 100, candidateBaseCost: 40 },
      },
    });
  });

  it("no observation, a stale one, or an EVENT_ASSOCIATED one is UNKNOWN", () => {
    for (const observation of [
      unknownState<ResourceAmountObservation>("NO_OBSERVATION", [], "RESOURCES"),
      staleObservation(energy("PRE_COST", 100, 50), 2424000, 2424688, [locator], "RESOURCES"),
      exactObserved(energy("EVENT_ASSOCIATED", 100, null), [locator], "RESOURCES"),
    ]) {
      expect(proveAffordableByBaseCost({ ...base, observation })).toMatchObject({
        state: "UNKNOWN",
        reason: "RESOURCE_NOT_OBSERVED_PRE_COST",
      });
    }
  });

  it("units not corroborated by the decision cast's own wire cost are UNKNOWN (unsupported PRE_COST semantics)", () => {
    expect(
      proveAffordableByBaseCost({
        ...base,
        observation: exactObserved(energy("PRE_COST", 100, 25), [locator], "RESOURCES"),
      }),
    ).toMatchObject({ state: "UNKNOWN", reason: "RESOURCE_UNITS_NOT_CORROBORATED" });
    expect(
      proveAffordableByBaseCost({
        ...base,
        observedCastBaseCost: null,
        observation: exactObserved(energy("PRE_COST", 100, 50), [locator], "RESOURCES"),
      }),
    ).toMatchObject({ state: "UNKNOWN", reason: "RESOURCE_UNITS_NOT_CORROBORATED" });
  });

  it("a base cost above the observed amount is UNKNOWN — reductions may apply — never unaffordable", () => {
    const resolution = proveAffordableByBaseCost({
      ...base,
      observation: exactObserved(energy("PRE_COST", 36, 50), [locator], "RESOURCES"),
    });
    expect(resolution).toMatchObject({ state: "UNKNOWN", reason: "BASE_COST_ABOVE_OBSERVED_AMOUNT" });
  });

  it("a cost that pinned mechanics cannot bound by its base is UNKNOWN", () => {
    const resolution = proveAffordableByBaseCost({
      ...base,
      candidateCostCannotIncrease: false,
      costBoundBasis: "a census row increases it",
      observation: exactObserved(energy("PRE_COST", 100, 50), [locator], "RESOURCES"),
    });
    expect(resolution).toMatchObject({ state: "UNKNOWN", reason: "COST_MAY_EXCEED_BASE" });
  });
});

// ---------------------------------------------------------------------------
// Strict same-target range corroboration
// ---------------------------------------------------------------------------

describe("the strict same-target range corroboration", () => {
  const tigerPalm = {
    spellId: TIGER_PALM,
    targetMode: "ENEMY_UNIT_TARGET" as const,
    minRangeYd: 0,
    maxRangeYd: 5,
  };
  const kegSmash = {
    spellId: KEG_SMASH,
    targetMode: "ENEMY_UNIT_TARGET" as const,
    minRangeYd: 0,
    maxRangeYd: 15,
  };
  const observed = { ...tigerPalm, casterActorId: ACTOR, targetActorId: 9, locator };

  it("a same-target candidate whose pinned range contains the observed spell's is PROVEN", () => {
    expect(
      corroborateRangeBySameTarget({ candidate: kegSmash, observed, decisionTargetActorId: 9 }),
    ).toMatchObject({
      state: "PROVEN",
      evidence: { basis: "SAME_TARGET_RANGE_CONTAINED", facts: { targetActorId: 9, candidateRange: "0-15" } },
    });
  });

  it("an untargeted candidate receives no proof", () => {
    const cone = { spellId: 115181, targetMode: "UNTARGETED" as const, minRangeYd: 0, maxRangeYd: 0 };
    expect(
      corroborateRangeBySameTarget({ candidate: cone, observed, decisionTargetActorId: 9 }),
    ).toMatchObject({
      state: "UNKNOWN",
      reason: "CANDIDATE_UNTARGETED",
    });
  });

  it("an untargeted or incompatible corroborating cast establishes no target", () => {
    for (const targetMode of ["UNTARGETED", "ENEMY_TARGET_DESTINATION"] as const) {
      expect(
        corroborateRangeBySameTarget({
          candidate: kegSmash,
          observed: { ...observed, targetMode },
          decisionTargetActorId: 9,
        }),
      ).toMatchObject({ state: "UNKNOWN", reason: "CORROBORATOR_NOT_ENEMY_UNIT_TARGET" });
    }
    for (const targetActorId of [null, ACTOR]) {
      expect(
        corroborateRangeBySameTarget({
          candidate: kegSmash,
          observed: { ...observed, targetActorId },
          decisionTargetActorId: 9,
        }),
      ).toMatchObject({ state: "UNKNOWN", reason: "CORROBORATOR_TARGET_NOT_ESTABLISHED" });
    }
  });

  it("evidence about a DIFFERENT target refuses corroboration", () => {
    expect(
      corroborateRangeBySameTarget({ candidate: kegSmash, observed, decisionTargetActorId: 12 }),
    ).toMatchObject({
      state: "UNKNOWN",
      reason: "DIFFERENT_TARGET",
    });
  });

  it("a candidate whose pinned range does not contain the observed one receives no proof — no range assumption", () => {
    const observedKegSmash = { ...kegSmash, casterActorId: ACTOR, targetActorId: 9, locator };
    expect(
      corroborateRangeBySameTarget({
        candidate: tigerPalm,
        observed: observedKegSmash,
        decisionTargetActorId: 9,
      }),
    ).toMatchObject({ state: "UNKNOWN", reason: "RANGE_NOT_CONTAINED" });
  });
});
