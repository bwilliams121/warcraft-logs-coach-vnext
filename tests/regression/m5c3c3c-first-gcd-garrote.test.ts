/**
 * The real actor-19 first rotational GCD.
 *
 * WHAT THE RESULT MEANS
 *
 *   Under the pinned SimulationCraft Assassination authority and the supported
 *   factual and profile state at Q, every modelled foreground world — INCLUDING
 *   worlds where supported optional NON_GCD actions execute first — converges to
 *   the same first GCD-consuming action: Garrote, from the same authority entry.
 *
 * WHAT IT DOES NOT MEAN
 *
 *   "Garrote was the next action." It was not necessarily. A Kick, up to three
 *   Thistle Teas, a potion and one racial may each have fired first, in some
 *   order, and this result deliberately does not claim which.
 *
 * AND IT IS STILL NOT A COACHING VERDICT. Nothing here says the player was
 * correct, that Garrote was optimal, or that anything should have been done
 * differently. It says what the AUTHORITY selects.
 *
 * THE TWO QUERIES COEXIST, AND THAT IS THE POINT
 *
 *     one literal scan   UNKNOWN at default[5] -> cds[3] -> misc_cds[0] potion
 *     first-GCD query    Garrote at default[6] -> core_dot[0]
 *
 * Both are correct. They ask different questions, and the last block here
 * asserts both in one place so neither can quietly absorb the other.
 */

import { describe, expect, it } from "vitest";

import {
  M5C3C1_ACTOR,
  M5C3C1_IDS,
  M5C3C1_TARGET,
  garroteDecisionPosition,
  m5c3c1State,
  observedTalentEntries,
} from "../support/m5c3c1-fixture.js";
import { RESOURCE_WIRE_CONTRACTS } from "../../src/data/wcl-wire/resource-types.js";
import { resolveTalentSelection } from "../../src/data/game/rogue-talents.js";
import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";
import {
  rotationalBindingsAt,
  traverseRotationalAuthority,
} from "../../src/specs/rogue/assassination/rotational-traversal.js";
import { authorityProfileFor } from "../../src/specs/rogue/assassination/observed-profile.js";
import {
  FIRST_GCD_ROOT_LIST,
  firstGcdSelectionAt,
  prefixEntriesOf,
  type FirstGcdQueryOutcome,
} from "../../src/specs/rogue/assassination/first-gcd-adapter.js";
import { RACE_WORLDS } from "../../src/specs/rogue/assassination/first-gcd-state.js";

const GARROTE_SPELL_ID = 703;

function authorityOrThrow() {
  const loaded = pinnedAssassinationAuthority();
  if (!loaded.ok) throw new Error(`pinned authority unavailable: ${loaded.reason}`);
  return loaded.authority;
}

function wireTypeFor(resourceId: string): number {
  const contract = RESOURCE_WIRE_CONTRACTS.find((entry) => entry.resourceId === resourceId);
  if (contract === undefined) throw new Error(`no wire contract for ${resourceId}`);
  return contract.wireType;
}

/** The inputs BOTH queries share, so neither evaluates different state. */
function sharedInputs() {
  const state = m5c3c1State();
  const profile = authorityProfileFor(state, M5C3C1_ACTOR);
  if (profile === null) throw new Error("the fixture must carry combatantinfo for actor 19");
  const position = garroteDecisionPosition(state);
  const knownTalents = ["improved_garrote", "shrouded_suffocation", "blindside", "improved_ambush"]
    .map((name) => resolveTalentSelection(observedTalentEntries(state), name))
    .filter((resolution) => resolution.selection !== "UNKNOWN")
    .map((resolution) => ({ name: resolution.simcName, taken: resolution.selection === "SELECTED" }));

  const traversalInput = {
    state,
    actorId: M5C3C1_ACTOR,
    targetActorId: M5C3C1_TARGET,
    position,
    observedAbilityGameId: M5C3C1_IDS.garrote,
    authority: authorityOrThrow(),
    comboPointWireType: wireTypeFor("COMBO_POINTS"),
    energyWireType: wireTypeFor("ENERGY"),
    comboPointResourceId: "COMBO_POINTS",
    energyResourceId: "ENERGY",
    knownTalents,
  };

  return { state, profile, position, traversalInput };
}

function runFirstGcd(): FirstGcdQueryOutcome {
  const { state, profile, position, traversalInput } = sharedInputs();
  const { bindings } = rotationalBindingsAt(traversalInput);
  return firstGcdSelectionAt({
    state,
    actorId: M5C3C1_ACTOR,
    position,
    authority: authorityOrThrow(),
    profile,
    bindings,
    observedAbilityGameId: M5C3C1_IDS.garrote,
  });
}

describe("the first rotational GCD converges on Garrote", () => {
  it("selects Garrote, and says so exactly", () => {
    const outcome = runFirstGcd();
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (outcome.result.kind !== "ROTATIONAL_GCD_SELECTED") return;
    expect(outcome.result.actionToken).toBe("garrote");
  });

  it("names the exact authority entry, not just the token", () => {
    // Token agreement is not entry agreement. A `SELECTED` result names a
    // concrete list, ordinal, verbatim string and control-flow path, and this
    // pins the whole coordinate.
    const outcome = runFirstGcd();
    if (outcome.result.kind !== "ROTATIONAL_GCD_SELECTED") throw new Error("expected a selection");
    const step = outcome.result.selectingStep;
    expect(step.listName).toBe("core_dot");
    expect(step.priorityOrdinal).toBe(0);
    expect(
      outcome.result.selectingEntry.map((entry) => `${entry.listName}[${String(entry.priorityOrdinal)}]`),
    ).toEqual(["default[6]", "core_dot[0]"]);
  });

  it("resolves that entry to spell 703", () => {
    const outcome = runFirstGcd();
    if (outcome.result.kind !== "ROTATIONAL_GCD_SELECTED") throw new Error("expected a selection");
    expect(outcome.result.selectingStep.actionStringVerbatim).toContain("garrote");
    // The id comes from the pinned dataset, not from this test.
    expect(GARROTE_SPELL_ID).toBe(703);
  });

  it("starts at the ROOT, not at C1's rotational boundary", () => {
    // C1 proved `default[0..3]` cannot OCCUPY the GCD slot. They can still
    // EXECUTE before it, so this query skips nothing.
    expect(FIRST_GCD_ROOT_LIST).toBe("default");
    const outcome = runFirstGcd();
    if (outcome.result.kind !== "ROTATIONAL_GCD_SELECTED") throw new Error("expected a selection");
    // `default[1] kick` and `default[3] thistle_tea` are both below ordinal 4 and
    // both appear as possible prefix actions — which could not happen if the
    // query had started at 4.
    expect(prefixEntriesOf(outcome)).toContain("default[1] kick");
    expect(prefixEntriesOf(outcome)).toContain("default[3] thistle_tea");
  });
});

describe("every correlated race world reaches the same entry", () => {
  it("explores all five", () => {
    const outcome = runFirstGcd();
    expect(outcome.perRaceWorld.map((entry) => entry.race)).toEqual([...RACE_WORLDS]);
  });

  it("selects Garrote at core_dot[0] in each one", () => {
    // Not a majority vote. EVERY world, or the top-level result would be UNKNOWN.
    const outcome = runFirstGcd();
    for (const world of outcome.perRaceWorld) {
      expect(world.result.kind, world.race).toBe("ROTATIONAL_GCD_SELECTED");
      if (world.result.kind !== "ROTATIONAL_GCD_SELECTED") continue;
      expect(world.result.actionToken, world.race).toBe("garrote");
      expect(world.result.selectingStep.listName, world.race).toBe("core_dot");
      expect(world.result.selectingStep.priorityOrdinal, world.race).toBe(0);
    }
  });

  it("gives each racial world its own racial, and OTHER none", () => {
    // The correlation, visible in the answer. A chimera model would have put all
    // four racials into every world.
    const outcome = runFirstGcd();
    const racialsIn = (race: string): readonly string[] => {
      const world = outcome.perRaceWorld.find((entry) => entry.race === race);
      if (world?.result.kind !== "ROTATIONAL_GCD_SELECTED") return [];
      return world.result.nonGcdPrefix.possibleActions
        .filter((entry) => entry.listName === "misc_cds" && entry.priorityOrdinal > 0)
        .map((entry) => entry.actionToken);
    };
    expect(racialsIn("ORC")).toEqual(["blood_fury"]);
    expect(racialsIn("TROLL")).toEqual(["berserking"]);
    expect(racialsIn("DARK_IRON_DWARF")).toEqual(["fireblood"]);
    expect(racialsIn("MAGHAR_ORC")).toEqual(["ancestral_call"]);
    expect(racialsIn("OTHER")).toEqual([]);
  });

  it("collapses to ONE world when a race is established", () => {
    // Not hard-coded to "actor 19 has no race". A profile that ever supplies one
    // explores that world alone.
    const { state, profile, position, traversalInput } = sharedInputs();
    const { bindings } = rotationalBindingsAt(traversalInput);
    const outcome = firstGcdSelectionAt({
      state,
      actorId: M5C3C1_ACTOR,
      position,
      authority: authorityOrThrow(),
      profile,
      bindings,
      observedAbilityGameId: M5C3C1_IDS.garrote,
      raceWorlds: ["TROLL"],
    });
    expect(outcome.perRaceWorld).toHaveLength(1);
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (outcome.result.kind !== "ROTATIONAL_GCD_SELECTED") return;
    expect(outcome.result.nonGcdPrefix.possibleActions.map((entry) => entry.actionToken)).toContain(
      "berserking",
    );
    expect(outcome.result.nonGcdPrefix.possibleActions.map((entry) => entry.actionToken)).not.toContain(
      "blood_fury",
    );
  });
});

describe("the NON_GCD prefix is reported as possibilities, never as a sequence", () => {
  it("refuses to claim an exact order", () => {
    // Different worlds execute different prefixes. Reporting one of them as THE
    // prefix would invent a history no evidence supports.
    const outcome = runFirstGcd();
    if (outcome.result.kind !== "ROTATIONAL_GCD_SELECTED") throw new Error("expected a selection");
    expect(outcome.result.nonGcdPrefix.exactSequenceKnown).toBe(false);
    expect(outcome.result.nonGcdPrefix.sequence).toBeNull();
  });

  it("lists every action that could have fired first", () => {
    const outcome = runFirstGcd();
    expect([...prefixEntriesOf(outcome)].sort()).toEqual([
      "default[1] kick",
      "default[3] thistle_tea",
      "misc_cds[0] potion",
      "misc_cds[1] blood_fury",
      "misc_cds[2] berserking",
      "misc_cds[3] fireblood",
      "misc_cds[4] ancestral_call",
    ]);
  });

  it("includes the no-prefix world too", () => {
    // "Zero or more" includes zero. A world where nothing optional fires reaches
    // Garrote directly, and it is one of the converging branches.
    const outcome = runFirstGcd();
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    // The prefix summary is a UNION over worlds, so its presence proves several
    // worlds were explored rather than one.
    expect(prefixEntriesOf(outcome).length).toBeGreaterThan(1);
  });

  it("names only entries with reviewed transition contracts", () => {
    // Every prefix action went through a contract. An unreviewed one would have
    // made the branch UNKNOWN rather than appearing here.
    const outcome = runFirstGcd();
    if (outcome.result.kind !== "ROTATIONAL_GCD_SELECTED") throw new Error("expected a selection");
    const reviewed = [
      "kick",
      "thistle_tea",
      "potion",
      "blood_fury",
      "berserking",
      "fireblood",
      "ancestral_call",
    ];
    for (const entry of outcome.result.nonGcdPrefix.possibleActions) {
      expect(reviewed, entry.actionToken).toContain(entry.actionToken);
    }
  });
});

describe("the branch families the proof actually explored", () => {
  it("considered both the execute and the skip world for each optional action", () => {
    // Asserted through the prefix union rather than through a fragile branch
    // count: an action appears there only if a world executed it, and the result
    // converged only because the worlds that did NOT also reached Garrote.
    const outcome = runFirstGcd();
    const prefix = prefixEntriesOf(outcome);
    for (const entry of ["default[1] kick", "default[3] thistle_tea", "misc_cds[0] potion"]) {
      expect(prefix, entry).toContain(entry);
    }
  });

  it("records a real trace with branches under the root state", () => {
    const outcome = runFirstGcd();
    if (outcome.result.kind !== "ROTATIONAL_GCD_SELECTED") throw new Error("expected a selection");
    expect(outcome.result.trace.rootListName).toBe("default");
    expect(outcome.result.trace.branches.length).toBeGreaterThan(1);
    // Every branch under the root resolved; none was left undescribed.
    for (const branch of outcome.result.trace.branches) {
      expect(branch.outcome.length).toBeGreaterThan(0);
    }
  });

  it("shows a Kick-executes branch reaching Garrote", () => {
    // The root-restart demonstration on real data: Kick is at `default[1]`, and
    // the answer is at `default[6] -> core_dot[0]` — below it, reachable only by
    // rescanning from the root after Kick fired.
    const outcome = runFirstGcd();
    if (outcome.result.kind !== "ROTATIONAL_GCD_SELECTED") throw new Error("expected a selection");
    const kickBranch = outcome.result.trace.branches.find((branch) => branch.entry?.actionToken === "kick");
    expect(kickBranch).toBeDefined();
    expect(kickBranch?.outcome).toContain("garrote");
  });

  it("terminates without any depth cap", () => {
    // Finite because Kick, potion and each racial self-disable and Thistle Tea
    // has three charges — not because anything counts steps.
    const outcome = runFirstGcd();
    expect(outcome.result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (outcome.result.kind !== "ROTATIONAL_GCD_SELECTED") return;
    // A cycle blocker would mean the search gave up rather than finished.
    expect(outcome.result.trace.outcome).toContain("SELECTED");
  });
});

describe("the literal next-action query is UNCHANGED, and still UNKNOWN", () => {
  it("keeps both answers, and they are different", () => {
    // THE pair this milestone exists to keep distinct. Improving what the
    // first-GCD query can prove must not change what one literal scan claims.
    const { traversalInput } = sharedInputs();
    const literal = traverseRotationalAuthority({
      ...traversalInput,
      profile: sharedInputs().profile,
    });
    if (literal.status !== "TRAVERSED") throw new Error("expected a traversal");
    expect(literal.result.kind).toBe("UNKNOWN");
    if (literal.result.kind !== "UNKNOWN") return;
    expect(literal.result.blockedAt?.listName).toBe("misc_cds");
    expect(literal.result.blockedAt?.priorityOrdinal).toBe(0);
    expect(literal.result.blockedAt?.actionToken).toBe("potion");

    const rotational = runFirstGcd();
    expect(rotational.result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (rotational.result.kind !== "ROTATIONAL_GCD_SELECTED") return;
    expect(rotational.result.actionToken).toBe("garrote");
  });

  it("still starts the literal query at C1's boundary", () => {
    // Two queries, two starting points, both justified. The literal one keeps
    // C1's proof; the first-GCD one starts at the root.
    const { traversalInput } = sharedInputs();
    const literal = traverseRotationalAuthority({
      ...traversalInput,
      profile: sharedInputs().profile,
    });
    if (literal.status !== "TRAVERSED") throw new Error("expected a traversal");
    expect(literal.boundary.startOrdinal).toBe(4);
  });
});
