/**
 * M5-C3b, against the real capture.
 *
 * THE RESULT, AND IT IS AN UNKNOWN ON PURPOSE
 *
 *     From the M5-C1 rotational boundary, nested traversal of the pinned
 *     authority at the real actor-19 post-Vanish decision Q reaches
 *     `cds[0] deathmark` and stops there. The global answer is UNKNOWN.
 *
 * That is a SUCCESSFUL milestone result, not a shortfall. `cds[0]`'s condition
 * reads cooldown and DoT state this project deliberately does not model, and it
 * sits at higher priority than anything below it. Reporting an action from
 * further down would be the priority short-circuit this project exists to
 * prevent.
 *
 * THE JUXTAPOSITION THAT MATTERS
 *
 *     scoped, within `core_dot`      ->  exactly Garrote        (M5-C3a)
 *     global, from the boundary      ->  UNKNOWN at `cds[0]`    (M5-C3b)
 *
 * Both are true at the same instant, and neither overrides the other. `core_dot`
 * is reached only through `default[6]`, which is BELOW the `cds` call — so an
 * exact answer inside it cannot decide the global question while something
 * above it might fire. This file asserts both, together, so a future change that
 * collapses them is a test failure.
 */

import { describe, expect, it } from "vitest";

import {
  m5c3aState,
  garroteDecisionPosition,
  observedTalentEntries,
  M5C3A_ACTOR,
  M5C3A_TARGET,
  M5C3A_IDS,
} from "../support/m5c3a-fixture.js";
import {
  traverseRotationalAuthority,
  ROTATIONAL_ENTRY_LIST,
  type RotationalTraversal,
} from "../../src/specs/rogue/assassination/rotational-traversal.js";
import { selectCoreDotActionAt } from "../../src/specs/rogue/assassination/core-dot-selection.js";
import { narrowToRotationalSlot } from "../../src/specs/rogue/assassination/rotational-slot.js";
import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";
import { resolveTalentSelection } from "../../src/data/game/rogue-talents.js";
import { RESOURCE_WIRE_CONTRACTS } from "../../src/data/wcl-wire/resource-types.js";
import { parseSimcExpression } from "../../src/simc/expression/parse.js";
import { evaluateSimcExpression, knownNumber, unknownNumber } from "../../src/simc/expression/evaluate.js";

function authorityOrThrow() {
  const loaded = pinnedAssassinationAuthority();
  if (!loaded.ok) throw new Error(`pinned authority did not load: ${loaded.reason}`);
  return loaded.authority;
}

function wireTypeFor(resourceId: string): number {
  const contract = RESOURCE_WIRE_CONTRACTS.find((entry) => entry.resourceId === resourceId);
  if (contract === undefined) throw new Error(`no wire contract for ${resourceId}`);
  return contract.wireType;
}

/** Talents resolved from the fixture's own `combatantinfo`. UNKNOWN ones are omitted. */
function knownTalentsFrom(state: ReturnType<typeof m5c3aState>) {
  const entries = observedTalentEntries(state);
  return [
    "improved_garrote",
    "shrouded_suffocation",
    "blindside",
    "improved_ambush",
    "scent_of_blood",
    "crimson_tempest",
    "razor_wire",
    "darkest_night",
  ]
    .map((name) => resolveTalentSelection(entries, name))
    .filter((resolution) => resolution.selection !== "UNKNOWN")
    .map((resolution) => ({ name: resolution.simcName, taken: resolution.selection === "SELECTED" }));
}

function traverseAtQ(): RotationalTraversal {
  const state = m5c3aState();
  return traverseRotationalAuthority({
    state,
    actorId: M5C3A_ACTOR,
    targetActorId: M5C3A_TARGET,
    position: garroteDecisionPosition(state),
    observedAbilityGameId: M5C3A_IDS.garrote,
    authority: authorityOrThrow(),
    comboPointWireType: wireTypeFor("COMBO_POINTS"),
    energyWireType: wireTypeFor("ENERGY"),
    comboPointResourceId: "COMBO_POINTS",
    energyResourceId: "ENERGY",
    knownTalents: knownTalentsFrom(state),
  });
}

/** The traversal result, or a thrown error. Keeps each test's intent readable. */
function resultAtQ() {
  const traversal = traverseAtQ();
  if (traversal.status !== "TRAVERSED") {
    throw new Error(`expected a traversal, got ${traversal.blocker}`);
  }
  return traversal;
}

function stepLabels(traversal: ReturnType<typeof resultAtQ>): readonly string[] {
  return traversal.result.steps.map(
    (step) => `${step.listName}[${String(step.priorityOrdinal)}] ${step.actionToken}`,
  );
}

describe("the rotational boundary is C1's proof, not a convenience", () => {
  it("starts at the ordinal C1 independently narrows to", () => {
    const traversal = resultAtQ();
    const narrowing = narrowToRotationalSlot(authorityOrThrow(), ROTATIONAL_ENTRY_LIST);
    expect(narrowing.kind).toBe("NARROWED");
    if (narrowing.kind !== "NARROWED") return;

    // Not a literal, and not a constant in the traversal module: the boundary IS
    // the C1 result, so the two cannot drift.
    expect(traversal.boundary.startOrdinal).toBe(narrowing.firstEligibleOrdinal);
    expect(traversal.boundary.startOrdinal).toBe(4);
  });

  it("carries a proof covering every ordinal it skips", () => {
    const traversal = resultAtQ();
    expect([...traversal.boundary.provenExcludedOrdinals].sort()).toEqual([0, 1, 2, 3]);
  });

  it("does NOT claim default[0..3] are false or unusable", () => {
    // The claim is structural and narrow: `stealth`, `kick` and `thistle_tea`
    // are NON_GCD and `variable` executes-and-continues, so none of them can be
    // the action that FILLS the rotational GCD slot. Any of them might have
    // fired. Nothing in this result says otherwise.
    const traversal = resultAtQ();
    expect(traversal.boundary.justification).toContain("NOT a claim");

    // Structurally: no skipped entry appears in the trace with any outcome at
    // all, so there is nowhere for a false "eliminated" verdict to live.
    const visited = traversal.result.steps.filter((step) => step.listName === ROTATIONAL_ENTRY_LIST);
    for (const step of visited) {
      expect(step.priorityOrdinal).toBeGreaterThanOrEqual(4);
    }
    expect(stepLabels(traversal).some((label) => label.includes("stealth"))).toBe(false);
    expect(stepLabels(traversal).some((label) => label.includes("kick"))).toBe(false);
    expect(stepLabels(traversal).some((label) => label.includes("thistle_tea"))).toBe(false);
  });

  it("refuses to traverse at all if C1 cannot narrow the list", () => {
    // The dependency is load-bearing in both directions: with no proven boundary
    // there is no justified place to start, and starting anywhere would assert
    // something about the entries above it.
    const state = m5c3aState();
    const traversal = traverseRotationalAuthority({
      state,
      actorId: M5C3A_ACTOR,
      targetActorId: M5C3A_TARGET,
      position: garroteDecisionPosition(state),
      observedAbilityGameId: M5C3A_IDS.garrote,
      authority: null,
      comboPointWireType: wireTypeFor("COMBO_POINTS"),
      energyWireType: wireTypeFor("ENERGY"),
      comboPointResourceId: "COMBO_POINTS",
      energyResourceId: "ENERGY",
      knownTalents: [],
    });
    expect(traversal.status).toBe("UNAVAILABLE");
    if (traversal.status !== "UNAVAILABLE") return;
    expect(traversal.blocker).toBe("NO_AUTHORITY_AVAILABLE");
  });
});

describe("the real traversal reaches cds[0] and stops", () => {
  it("is UNKNOWN, blocked at cds[0] deathmark", () => {
    const traversal = resultAtQ();
    expect(traversal.result.kind).toBe("UNKNOWN");
    if (traversal.result.kind !== "UNKNOWN") return;

    expect(traversal.result.blocker).toBe("UNSUPPORTED_AUTHORITY_EXPRESSION");
    expect(traversal.result.blockedAt?.listName).toBe("cds");
    expect(traversal.result.blockedAt?.priorityOrdinal).toBe(0);
    expect(traversal.result.blockedAt?.actionToken).toBe("deathmark");
  });

  it("keeps the caller in the blocking path: default[5] -> cds[0]", () => {
    const traversal = resultAtQ();
    if (traversal.result.kind !== "UNKNOWN") throw new Error("expected UNKNOWN");
    expect(
      traversal.result.blockedAt?.path.map((entry) => `${entry.listName}[${String(entry.priorityOrdinal)}]`),
    ).toEqual(["default[5]", "cds[0]"]);
  });

  it("walks exactly default[4] -> default[5] -> cds[0]", () => {
    const traversal = resultAtQ();
    expect(stepLabels(traversal)).toEqual([
      "default[4] ambush",
      "default[5] call_action_list",
      "cds[0] deathmark",
    ]);
  });

  it("eliminates default[4] Ambush from the M5-C2 verdict, and continues", () => {
    // C2 proved this FALSE: the player is stealthed, but Improved Ambush is
    // NOT_SELECTED, so the build condition fails. Stealth does not imply Ambush.
    const traversal = resultAtQ();
    const ambush = traversal.result.steps.find((step) => step.actionToken === "ambush");
    expect(ambush?.outcome).toBe("ELIMINATED_CONTINUE");
    expect(ambush?.gate.kind).toBe("EVALUATED");
    if (ambush?.gate.kind !== "EVALUATED") return;
    expect(ambush.gate.truth).toBe("FALSE");
  });

  it("recurses into cds despite an UNPARSEABLE call gate", () => {
    // `default[5]`'s gate contains `buff.scent_of_blood.stack`,
    // `spell_targets.fan_of_knives` and `>?`, none of which are supported. We
    // cannot tell whether the list is entered, so we must consider that it is —
    // and the callee is where the real blocker turns out to be.
    const traversal = resultAtQ();
    const call = traversal.result.steps.find(
      (step) => step.listName === "default" && step.priorityOrdinal === 5,
    );
    expect(call?.actionToken).toBe("call_action_list");
    expect(call?.gate.kind).toBe("UNSUPPORTED");
    expect(call?.outcome).toBe("BLOCKED");
  });

  it("never reaches core_dot", () => {
    // `default[6]` calls `core_dot`, and it is BELOW the `cds` call. An exact
    // answer inside it cannot be reported while something above might fire.
    const traversal = resultAtQ();
    expect(stepLabels(traversal).some((label) => label.startsWith("core_dot"))).toBe(false);
    expect(traversal.result.steps.some((step) => step.listName === "core_dot")).toBe(false);
  });

  it("never reaches the generate or spend lists either", () => {
    const traversal = resultAtQ();
    for (const listName of ["generate", "spend", "items", "misc_cds", "vanish"]) {
      expect(traversal.result.steps.some((step) => step.listName === listName)).toBe(false);
    }
  });

  it("makes no global claim about Garrote", () => {
    // Note what is NOT asserted here: the string "garrote" DOES appear in the
    // trace, because `cds[0]`'s verbatim pinned condition reads
    // `dot.garrote.ticking`. That is authority text being quoted, not a claim.
    // The invariant is about the VERDICT: no action is selected, and no step is
    // permitted to name garrote as one that fires.
    const traversal = resultAtQ();
    expect(traversal.result.kind).not.toBe("SELECTED");
    for (const step of traversal.result.steps) {
      if (step.actionToken !== "garrote") continue;
      expect(step.outcome).not.toBe("SELECTED");
      expect(step.outcome).not.toBe("CALL_SELECTED");
    }
  });
});

describe("the earliest blocker is cds[0], derived rather than assumed", () => {
  it("is the first entry of the first list the traversal could not get past", () => {
    // Derived from the authority: `cds[0]` is the first entry of `cds`, and the
    // `cds` call is the first entry after the boundary that is not eliminated.
    const authority = authorityOrThrow();
    const cds = authority.actionsInList("cds");
    expect(cds.found).toBe(true);
    if (!cds.found) return;
    expect(cds.actions[0]?.actionToken).toBe("deathmark");

    const traversal = resultAtQ();
    if (traversal.result.kind !== "UNKNOWN") throw new Error("expected UNKNOWN");
    expect(traversal.result.blockedAt?.actionStringVerbatim).toBe(cds.actions[0]?.actionStringVerbatim);
  });

  it("blocks on syntax C3b deliberately does not implement", () => {
    // `dot.garrote.ticking`, `cooldown.kingsbane.remains`, `buff.envenom.remains`
    // and `target.time_to_die`. C3b is control flow only; none of these atoms is
    // added here, and the traversal says so rather than guessing.
    const traversal = resultAtQ();
    if (traversal.result.kind !== "UNKNOWN") throw new Error("expected UNKNOWN");
    const gate = traversal.result.blockedAt?.gate;
    expect(gate?.kind).toBe("UNSUPPORTED");
    if (gate?.kind !== "UNSUPPORTED") return;
    expect(gate.reason).toBe("UNSUPPORTED_IDENTIFIER");
    expect(gate.fragment).toBe("dot.garrote.ticking");
  });

  it("outranks the exact core_dot result below it", () => {
    // §33 in one assertion: a callee's entry is earlier than any entry below its
    // call site, so `default[5] -> cds[0]` is earlier than `default[6] -> core_dot[0]`
    // even though the latter is exactly decidable.
    const authority = authorityOrThrow();
    const defaultList = authority.actionsInList("default");
    if (!defaultList.found) throw new Error("default must exist");
    const cdsCall = defaultList.actions.find((action) => action.callsListName === "cds");
    const coreDotCall = defaultList.actions.find((action) => action.callsListName === "core_dot");
    expect(cdsCall?.priorityOrdinal).toBeLessThan(coreDotCall?.priorityOrdinal ?? -1);
  });
});

describe("the scoped and global answers coexist without overriding each other", () => {
  it("C3a still proves Garrote EXACTLY within core_dot", () => {
    const state = m5c3aState();
    const scoped = selectCoreDotActionAt({
      state,
      actorId: M5C3A_ACTOR,
      targetActorId: M5C3A_TARGET,
      position: garroteDecisionPosition(state),
      observedAbilityGameId: M5C3A_IDS.garrote,
      authority: authorityOrThrow(),
      knownTalents: knownTalentsFrom(state),
    });
    expect(scoped.status).toBe("SELECTED_BY_AUTHORITY");
    if (scoped.status !== "SELECTED_BY_AUTHORITY") return;
    expect(scoped.selectedAction.simcToken).toBe("garrote");
    expect(scoped.selectedAction.abilityGameId).toBe(703);
  });

  it("and the global traversal is UNKNOWN at the same instant", () => {
    // Both true, neither overriding the other. This is the shape of an honest
    // partial answer: exact where the evidence reaches, unknown where it does not.
    const traversal = resultAtQ();
    expect(traversal.result.kind).toBe("UNKNOWN");
  });

  it("does not let the scoped result decide the global one", () => {
    // The forbidden inference is "cds is unknown, but core_dot is exactly
    // Garrote, therefore Garrote". Priority forbids it, and structurally the
    // traversal never even visits core_dot — so there is nothing to combine.
    const traversal = resultAtQ();
    if (traversal.result.kind !== "UNKNOWN") throw new Error("expected UNKNOWN");
    expect(traversal.result.steps.some((step) => step.listName === "core_dot")).toBe(false);
    expect(traversal.result.blockedAt?.listName).toBe("cds");
  });
});

describe("no negative actionability, and no observation inversion", () => {
  it("does not treat the observed Garrote cast as proof that Deathmark was unusable", () => {
    // The observed cast at Q is Garrote. That is positive evidence about Garrote
    // and about nothing else. Deathmark is higher priority, and the traversal
    // must not conclude anything about its availability from a lower-priority
    // observation.
    const traversal = resultAtQ();
    const deathmark = traversal.result.steps.find((step) => step.actionToken === "deathmark");
    expect(deathmark?.usability).toBe("UNKNOWN");
    expect(deathmark?.outcome).not.toBe("ELIMINATED_CONTINUE");
  });

  it("uses the observed cast only as POSITIVE usability, for the observed ability", () => {
    const traversal = resultAtQ();
    for (const step of traversal.result.steps) {
      if (step.usability !== "PROVEN_USABLE") continue;
      // Only an action whose numeric identity matches the observed cast may be
      // proven usable. Nothing else can acquire that status.
      expect(step.actionToken).toBe("garrote");
    }
  });
});

describe("NO combo-point magnitude is fabricated at the real Q", () => {
  it("reports that combo points could not be established", () => {
    // Warcraft Logs reports Energy on this cast and no combo-point resource at
    // all. The traversal says so rather than quietly binding a number.
    const traversal = resultAtQ();
    expect(traversal.comboPointsEstablished).toBe(false);
  });

  it("binds them as UNKNOWN_NUMBER, not as any magnitude", () => {
    // THE CORRECTION. An earlier version bound a concrete zero and relied on a
    // post-hoc trace inspection to discard the result if it turned out to
    // matter. That is fail-closed only after the invented value has already
    // participated in control flow.
    const traversal = resultAtQ();
    expect(traversal.bindings.comboPoints.state).toBe("UNKNOWN_NUMBER");
    expect(traversal.bindings.comboPointsDeficit.state).toBe("UNKNOWN_NUMBER");
  });

  it("does not become 0, and carries no numeric value at all", () => {
    const traversal = resultAtQ();
    expect(traversal.bindings.comboPoints).not.toHaveProperty("value");
    expect(traversal.bindings.comboPointsDeficit).not.toHaveProperty("value");
  });

  it("does not become a maximum either", () => {
    // The mirror failure. An unknown that silently became 5 or 7 would satisfy
    // `combo_points>=5` and open the spend gate on evidence that does not exist.
    const traversal = resultAtQ();
    for (const binding of [traversal.bindings.comboPoints, traversal.bindings.comboPointsDeficit]) {
      expect(binding.state).toBe("UNKNOWN_NUMBER");
      if (binding.state !== "UNKNOWN_NUMBER") return;
      expect(binding.reason).toBe("STATE_NOT_ESTABLISHED");
    }
  });

  it("still reaches default[4], default[5] and cds[0], which need no combo points", () => {
    // The unknown is not a dead end: none of the conditions the traversal
    // actually consults mentions combo points, so the answer is unaffected.
    const traversal = resultAtQ();
    expect(stepLabels(traversal)).toEqual([
      "default[4] ambush",
      "default[5] call_action_list",
      "cds[0] deathmark",
    ]);
  });

  it("never consulted a combo-point atom on the real path", () => {
    // Asserted from the traces themselves rather than from a production guard.
    // `default[7]` and `default[8]` are the entries that read one, and they sit
    // below the blocker.
    const traversal = resultAtQ();
    for (const step of traversal.result.steps) {
      if (step.gate.kind !== "EVALUATED") continue;
      for (const atom of step.gate.trace.atoms) {
        expect(["combo_points", "combo_points.deficit"]).not.toContain(atom.key);
      }
    }
  });

  it("binds energy from the real observation, so only the missing value is unknown", () => {
    const traversal = resultAtQ();
    expect(traversal.bindings.energyPct.state).toBe("KNOWN_NUMBER");
  });

  it("no longer exposes the post-hoc consulted-atom guard", async () => {
    // The production guard is GONE, not merely unused. If it reappears, this
    // fails and whoever added it has to justify evaluating with a placeholder.
    // The companion source-level prohibition lives in the M5 boundary contract,
    // which runs in the pool that can read files.
    const module: Record<string, unknown> =
      await import("../../src/specs/rogue/assassination/rotational-traversal.js");
    expect(Object.keys(module)).not.toContain("consultedAnUnestablishedAtom");
    expect(Object.keys(module)).not.toContain("COMBO_POINT_ATOM_KEYS");
  });
});

describe("an unavailable combo-point count fails closed AT the atom", () => {
  const ALL_UNKNOWN = {
    comboPoints: unknownNumber("STATE_NOT_ESTABLISHED"),
    comboPointsDeficit: unknownNumber("STATE_NOT_ESTABLISHED"),
    energyPct: unknownNumber("STATE_NOT_ESTABLISHED"),
    dotRemainsSeconds: unknownNumber("STATE_NOT_ESTABLISHED"),
    knownBuffs: [],
  } as const;

  function evaluateWith(source: string, bindings: Record<string, unknown> = {}) {
    const parsed = parseSimcExpression(source);
    expect(parsed.ok, `${source} must parse`).toBe(true);
    if (!parsed.ok) throw new Error("unreachable");
    return evaluateSimcExpression(parsed.ast, source, { ...ALL_UNKNOWN, ...bindings });
  }

  it("makes combo_points>=5 UNKNOWN_STATE rather than FALSE", () => {
    // If the traversal ever does reach such a condition, this is what happens:
    // the atom resolves UNKNOWN_NUMBER and the comparison is undecided. It is
    // never quietly false, which would eliminate a line that might have fired.
    const evaluation = evaluateWith("combo_points>=5");
    expect(evaluation.outcome).toBe("UNRESOLVED");
    if (evaluation.outcome !== "UNRESOLVED") return;
    expect(evaluation.trace.worlds.every((world) => world.result === "UNKNOWN_STATE")).toBe(true);

    const atom = evaluation.trace.atoms.find((entry) => entry.key === "combo_points");
    expect(atom?.binding).toBe("UNKNOWN_NUMBER");
    expect(atom?.value).toBeNull();
  });

  it("treats combo_points.deficit the same way", () => {
    const evaluation = evaluateWith("combo_points.deficit=0");
    expect(evaluation.outcome).toBe("UNRESOLVED");
  });

  it("is never enumerated, because a magnitude has no two-valued world", () => {
    // Enumerating a magnitude over {0, 1} would invent two combo-point counts
    // and could make a comparison come out decidable from neither of them.
    const evaluation = evaluateWith("combo_points>=5");
    if (evaluation.outcome !== "UNRESOLVED") throw new Error("expected UNRESOLVED");
    expect(evaluation.trace.worlds).toHaveLength(1);
  });

  it("STILL resolves FALSE when another branch makes the answer invariant", () => {
    // The Kleene behaviour the correction had to preserve. `FALSE & unknown` is
    // FALSE, so an unavailable magnitude does not destroy an answer that never
    // depended on it. Statically refusing every expression containing an
    // unavailable atom would have thrown this away.
    const evaluation = evaluateWith("talent.improved_ambush&combo_points>=5", {
      knownTalents: [{ name: "improved_ambush", taken: false }],
    });
    expect(evaluation.outcome).toBe("RESOLVED");
    if (evaluation.outcome !== "RESOLVED") return;
    expect(evaluation.value).toBe(false);
  });

  it("resolves exactly as before when combo points ARE known", () => {
    // M5-A and M5-B supply real observations, and nothing about them changed.
    const atFive = evaluateWith("combo_points>=5", {
      comboPoints: knownNumber(5),
      comboPointsDeficit: knownNumber(2),
    });
    const atThree = evaluateWith("combo_points>=5", {
      comboPoints: knownNumber(3),
      comboPointsDeficit: knownNumber(4),
    });
    expect(atFive.outcome === "RESOLVED" && atFive.value).toBe(true);
    expect(atThree.outcome === "RESOLVED" && atThree.value).toBe(false);
  });
});

describe("C3b added no gameplay state", () => {
  it("still refuses every cds condition, because no cooldown or DoT model exists", () => {
    // A regression guard on scope: if any of these starts parsing, C3c has
    // landed and this milestone's claim needs re-examining.
    const authority = authorityOrThrow();
    const cds = authority.actionsInList("cds");
    expect(cds.found).toBe(true);
    if (!cds.found) return;

    const traversal = resultAtQ();
    if (traversal.result.kind !== "UNKNOWN") throw new Error("expected UNKNOWN");
    expect(traversal.result.blockedAt?.gate.kind).toBe("UNSUPPORTED");
  });
});
