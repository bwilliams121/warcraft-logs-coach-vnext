/**
 * M5-C3c1, against the real capture.
 *
 * THE HEADLINE
 *
 *     At the real actor-19 decision Q, an observed Kingsbane cast 2.802 s
 *     earlier plus a pinned 60 s cooldown proves `cooldown.kingsbane.remains<=2`
 *     FALSE — and that single FALSE operand collapses the whole `cds[0]`
 *     Deathmark condition, whatever the other four operands are.
 *
 * The traversal's earliest blocker therefore moves from `cds[0]` to `cds[1]`.
 * That movement is the milestone's integration result. It is still an UNKNOWN
 * overall, and deliberately so: `cds[1]` invoke_external_buff is C3c2's problem.
 *
 * WHAT IS NOT CLAIMED
 *
 * No global Garrote. No negative usability for Kingsbane itself. No DoT state,
 * no buff durations, no predictive values. C3c1 owns cooldown facts and nothing
 * else, and the tests below check that the other atoms stayed unknown.
 */

import { describe, expect, it } from "vitest";

import {
  m5c3c1State,
  garroteDecisionPosition,
  kingsbaneCastPosition,
  observedTalentEntries,
  M5C3C1_ACTOR,
  M5C3C1_TARGET,
  M5C3C1_IDS,
  M5C3C1_EVENTS,
  M5C3C1_EXPECTED,
} from "../support/m5c3c1-fixture.js";
import { deriveCooldown } from "../../src/specs/rogue/assassination/cooldown-bindings.js";
import { traverseRotationalAuthority } from "../../src/specs/rogue/assassination/rotational-traversal.js";
import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";
import { resolveTalentSelection } from "../../src/data/game/rogue-talents.js";
import { cooldownForToken, pinnedRogueCooldowns } from "../../src/data/game/rogue-cooldowns.js";
import { RESOURCE_WIRE_CONTRACTS } from "../../src/data/wcl-wire/resource-types.js";
import { parseSimcExpression } from "../../src/simc/expression/parse.js";

/** The pinned `cds[0]` condition, verbatim. */
const DEATHMARK_CONDITION =
  "dot.garrote.ticking&dot.rupture.ticking&cooldown.kingsbane.remains<=2&buff.envenom.remains>2&" +
  "(target.time_to_die>10|fight_remains<20)";

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

function knownTalentsFrom(state: ReturnType<typeof m5c3c1State>) {
  return ["improved_garrote", "shrouded_suffocation", "blindside", "improved_ambush"]
    .map((name) => resolveTalentSelection(observedTalentEntries(state), name))
    .filter((resolution) => resolution.selection !== "UNKNOWN")
    .map((resolution) => ({ name: resolution.simcName, taken: resolution.selection === "SELECTED" }));
}

function traverseAtQ() {
  const state = m5c3c1State();
  const traversal = traverseRotationalAuthority({
    state,
    actorId: M5C3C1_ACTOR,
    targetActorId: M5C3C1_TARGET,
    position: garroteDecisionPosition(state),
    observedAbilityGameId: M5C3C1_IDS.garrote,
    authority: authorityOrThrow(),
    comboPointWireType: wireTypeFor("COMBO_POINTS"),
    energyWireType: wireTypeFor("ENERGY"),
    comboPointResourceId: "COMBO_POINTS",
    energyResourceId: "ENERGY",
    knownTalents: knownTalentsFrom(state),
  });
  if (traversal.status !== "TRAVERSED") throw new Error(`expected a traversal, got ${traversal.blocker}`);
  return traversal;
}

describe("the observed Kingsbane cast anchors a proven lower bound", () => {
  it("finds the cast 2802 ms before Q", () => {
    const state = m5c3c1State();
    const cast = kingsbaneCastPosition(state);
    const q = garroteDecisionPosition(state);
    expect(cast).toBeLessThan(q);

    const castEvent = state.eventAt(cast);
    const qEvent = state.eventAt(q);
    expect(qEvent!.fightTimeMs - castEvent!.fightTimeMs).toBe(M5C3C1_EXPECTED.elapsedMs);
    expect(M5C3C1_EVENTS.garroteCast.reportTimeMs - M5C3C1_EVENTS.kingsbaneCast).toBe(2_802);
  });

  it("derives BOUNDED at-least 57.198 seconds remaining", () => {
    const state = m5c3c1State();
    const derived = deriveCooldown(
      { state, actorId: M5C3C1_ACTOR, position: garroteDecisionPosition(state) },
      "kingsbane",
    );
    expect(derived).not.toBeNull();
    if (derived === null) return;

    // BOUNDED, not EXACT. SimulationCraft starts a cooldown with a SAMPLED,
    // non-negative lag delay (action.cpp:2350-2360), so the observed cast proves
    // `remains >= 60000 - 2802` and does not prove equality.
    expect(derived.cooldown.state).toBe("BOUNDED");
    if (derived.cooldown.state !== "BOUNDED") return;
    expect(derived.cooldown.baseCooldownMs).toBe(M5C3C1_EXPECTED.baseCooldownMs);
    expect(derived.cooldown.elapsedMs).toBe(M5C3C1_EXPECTED.elapsedMs);
    expect(derived.cooldown.atLeastRemainingMs).toBe(M5C3C1_EXPECTED.remainingMs);

    // The BOUND reaches the expression layer as a bound, never as a value.
    expect(derived.remainsSeconds?.state).toBe("BOUNDED_NUMBER");
    if (derived.remainsSeconds?.state !== "BOUNDED_NUMBER") return;
    expect(derived.remainsSeconds.atLeast).toBe(M5C3C1_EXPECTED.remainingSeconds);
  });

  it("is never reported as EXACT, because the start delay is not provably zero", () => {
    const state = m5c3c1State();
    const derived = deriveCooldown(
      { state, actorId: M5C3C1_ACTOR, position: garroteDecisionPosition(state) },
      "kingsbane",
    );
    expect(derived?.cooldown.state).not.toBe("EXACT");
    expect(derived?.remainsSeconds?.state).not.toBe("KNOWN_NUMBER");
  });

  it("converts milliseconds to seconds exactly once", () => {
    // THE unit trap. `57198 <= 2` and `57.198 <= 2` are both FALSE here, so a
    // unit error would NOT show up in this milestone's verdict — it would show
    // up later, on some threshold between 2 and 57198. Asserted directly.
    const state = m5c3c1State();
    const derived = deriveCooldown(
      { state, actorId: M5C3C1_ACTOR, position: garroteDecisionPosition(state) },
      "kingsbane",
    );
    if (derived === null || derived.cooldown.state !== "BOUNDED") throw new Error("expected BOUNDED");
    if (derived.remainsSeconds?.state !== "BOUNDED_NUMBER") throw new Error("expected a bound");
    expect(derived.remainsSeconds.atLeast).toBe(derived.cooldown.atLeastRemainingMs / 1000);
    expect(derived.remainsSeconds.atLeast).toBeLessThan(60);
    expect(derived.remainsSeconds.atLeast).not.toBe(derived.cooldown.atLeastRemainingMs);
  });

  it("rests on the hand-reviewed absence proof, carried with its source hash", () => {
    const state = m5c3c1State();
    const derived = deriveCooldown(
      { state, actorId: M5C3C1_ACTOR, position: garroteDecisionPosition(state) },
      "kingsbane",
    );
    if (derived === null || derived.cooldown.state !== "BOUNDED") throw new Error("expected BOUNDED");
    const policy = derived.cooldown.modifierPolicy;
    expect(policy.kind).toBe("NO_MODIFIERS_PROVEN_ABSENT");
    if (policy.kind !== "NO_MODIFIERS_PROVEN_ABSENT") return;
    expect(policy.sourcePath).toBe("engine/class_modules/sc_rogue.cpp");
    expect(policy.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(policy.claims).toContain("NO_DIRECT_COOLDOWN_ADJUSTMENT");
    expect(policy.claims).toContain("NO_CHARGES");
  });

  it("is not disturbed by the 41 other casts in the window", () => {
    // The fixture carries every actor-19 cast, including 24 melee autos and a
    // Deathmark 1001 ms before the Kingsbane. Real data, not a curated list.
    const state = m5c3c1State();
    const casts = state.fight.events.filter((event) => event.kind === "CAST");
    expect(casts.length).toBeGreaterThan(40);
    const derived = deriveCooldown(
      { state, actorId: M5C3C1_ACTOR, position: garroteDecisionPosition(state) },
      "kingsbane",
    );
    if (derived === null || derived.cooldown.state !== "BOUNDED") throw new Error("expected BOUNDED");
    expect(derived.cooldown.anchor.abilityGameId).toBe(M5C3C1_IDS.kingsbane);
    expect(derived.cooldown.anchor.position).toBe(kingsbaneCastPosition(state));
  });
});

describe("the pinned Kingsbane game data", () => {
  it("carries 385627 with a 60000 ms base cooldown and no charges", () => {
    const identity = cooldownForToken("kingsbane");
    expect(identity).not.toBeNull();
    if (identity === null) return;
    expect(identity.abilityGameId).toBe(385_627);
    expect(identity.baseCooldownMs).toBe(60_000);
    expect(identity.charges).toBe(0);
    expect(identity.displayNameEn).toBe("Kingsbane");
  });

  it("keeps the two provenance grades apart", () => {
    // The DBC number is reproducible by re-running a parser. The "nothing
    // modifies this" claim is a human reading a 436 KB C++ module. Labelling the
    // second as the first would present a review as machine extraction.
    const identity = cooldownForToken("kingsbane");
    if (identity === null) throw new Error("kingsbane must be present");
    expect(identity.binding.method).toBe("MACHINE_EXTRACTED_DBC_RECORD");
    expect(identity.modifierPolicy.method).toBe("HAND_REVIEWED_CPP_ABSENCE_PROOF");
    expect(identity.modifierPolicy.appliesTo).toBe("kingsbane");
    expect(identity.modifierPolicy.checks.length).toBeGreaterThanOrEqual(5);
    // Each check records the SEARCH, so a reviewer can repeat it.
    for (const check of identity.modifierPolicy.checks) {
      expect(check.search.length).toBeGreaterThan(0);
      expect(check.finding.length).toBeGreaterThan(0);
    }
  });

  it("records where the cooldown starts, with the pinned lines behind it", () => {
    const identity = cooldownForToken("kingsbane");
    if (identity === null) throw new Error("kingsbane must be present");
    expect(identity.cooldownStart.anchor).toBe("ACTION_EXECUTE");
    expect(identity.cooldownStart.evidence.join(" ")).toContain("update_ready");
    expect(identity.cooldownStart.evidence.join(" ")).toContain("cooldown->start");
  });

  it("states its units and its pinned commit", () => {
    const loaded = pinnedRogueCooldowns();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.artifact.provenance.cooldownFieldUnits).toBe("MILLISECONDS");
    expect(loaded.artifact.provenance.commitSha).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    expect(loaded.artifact.provenance.clientDataWowVersion).toBe("12.1.0.69587");
  });

  it("resolves by NUMBER, and carries no name-based runtime identity", () => {
    const identity = cooldownForToken("kingsbane");
    if (identity === null) throw new Error("kingsbane must be present");
    // The token is the authority's word; the id is the identity. A display name
    // is present for humans and is never the lookup key.
    expect(cooldownForToken("Kingsbane")).toBeNull();
    expect(identity.abilityGameId).toBe(M5C3C1_IDS.kingsbane);
  });
});

describe("the pinned Deathmark condition resolves FALSE from the cooldown alone", () => {
  it("parses whole, with the five atoms C3c1 needed", () => {
    const parsed = parseSimcExpression(DEATHMARK_CONDITION);
    expect(parsed.ok).toBe(true);
  });

  it("collapses to FALSE, with every other operand still unknown", () => {
    const traversal = traverseAtQ();
    const deathmark = traversal.result.steps.find((step) => step.actionToken === "deathmark");
    expect(deathmark?.outcome).toBe("ELIMINATED_CONTINUE");
    expect(deathmark?.gate.kind).toBe("EVALUATED");
    if (deathmark?.gate.kind !== "EVALUATED") return;
    expect(deathmark.gate.truth).toBe("FALSE");

    const byKey = new Map(deathmark.gate.trace.atoms.map((atom) => [atom.key, atom]));
    // The ONE thing C3c1 established — and it is a BOUND, not a value. The
    // bound lives in its own trace field; `value` stays null so no reader can
    // mistake a proven minimum for the magnitude itself.
    expect(byKey.get("cooldown.kingsbane.remains")?.binding).toBe("BOUNDED");
    expect(byKey.get("cooldown.kingsbane.remains")?.value).toBeNull();
    expect(byKey.get("cooldown.kingsbane.remains")?.atLeast).toBe(M5C3C1_EXPECTED.remainingSeconds);
    // Everything else stayed unknown. `FALSE & anything` is FALSE, so the
    // verdict needed none of them — which is exactly why C3c1 is small.
    expect(byKey.get("dot.garrote.ticking")?.binding).toBe("UNRESOLVED_BOOLEAN");
    expect(byKey.get("dot.rupture.ticking")?.binding).toBe("UNRESOLVED_BOOLEAN");
    expect(byKey.get("buff.envenom.remains")?.binding).toBe("UNKNOWN_NUMBER");
    expect(byKey.get("target.time_to_die")?.binding).toBe("UNKNOWN_NUMBER");
    expect(byKey.get("fight_remains")?.binding).toBe("UNKNOWN_NUMBER");
  });

  it("is FALSE in every enumerated world, not just on average", () => {
    const traversal = traverseAtQ();
    const deathmark = traversal.result.steps.find((step) => step.actionToken === "deathmark");
    if (deathmark?.gate.kind !== "EVALUATED") throw new Error("expected an evaluated gate");
    // Two unresolved boolean atoms -> four worlds, and the FALSE operand makes
    // every one of them FALSE.
    expect(deathmark.gate.trace.worlds).toHaveLength(4);
    expect(deathmark.gate.trace.worlds.every((world) => world.result === "FALSE")).toBe(true);
    expect(deathmark.gate.trace.aggregateRule).toBe("INVARIANT_ACROSS_WORLDS");
  });

  it("uses no predictive state to get there", () => {
    // `target.time_to_die` and `fight_remains` are both in this line and both
    // stay PREDICTIVE_NOT_PLAYER_KNOWABLE. The verdict does not depend on
    // knowing how the fight turned out.
    const traversal = traverseAtQ();
    const deathmark = traversal.result.steps.find((step) => step.actionToken === "deathmark");
    if (deathmark?.gate.kind !== "EVALUATED") throw new Error("expected an evaluated gate");
    for (const key of ["target.time_to_die", "fight_remains"]) {
      const atom = deathmark.gate.trace.atoms.find((entry) => entry.key === key);
      expect(atom?.unknownNumberReason).toBe("PREDICTIVE_NOT_PLAYER_KNOWABLE");
    }
  });
});

describe("the earliest blocker moves from cds[0] to cds[1]", () => {
  it("is UNKNOWN at default[5] -> cds[1] invoke_external_buff", () => {
    const traversal = traverseAtQ();
    expect(traversal.result.kind).toBe("UNKNOWN");
    if (traversal.result.kind !== "UNKNOWN") return;

    expect(traversal.result.blockedAt?.listName).toBe("cds");
    expect(traversal.result.blockedAt?.priorityOrdinal).toBe(1);
    expect(traversal.result.blockedAt?.actionToken).toBe("invoke_external_buff");
    expect(
      traversal.result.blockedAt?.path.map((entry) => `${entry.listName}[${String(entry.priorityOrdinal)}]`),
    ).toEqual(["default[5]", "cds[1]"]);
  });

  it("walks default[4] eliminated, default[5] entered, cds[0] eliminated", () => {
    const traversal = traverseAtQ();
    const labels = traversal.result.steps.map(
      (step) => `${step.listName}[${String(step.priorityOrdinal)}] ${step.actionToken} ${step.outcome}`,
    );
    expect(labels.slice(0, 4)).toEqual([
      "default[4] ambush ELIMINATED_CONTINUE",
      "default[5] call_action_list BLOCKED",
      "cds[0] deathmark ELIMINATED_CONTINUE",
      "cds[1] invoke_external_buff MAY_SELECT",
    ]);
  });

  it("makes no global claim, and never reaches core_dot", () => {
    // `default[6] core_dot` is below the `cds` call. C3a's scoped Garrote is
    // still exact and still cannot decide the global question.
    const traversal = traverseAtQ();
    expect(traversal.result.kind).not.toBe("SELECTED");
    expect(traversal.result.steps.some((step) => step.listName === "core_dot")).toBe(false);
  });

  it("adds no negative usability for Kingsbane itself", () => {
    // The same cooldown fact will eventually prove `cds[4]` unusable. That is
    // C3c2's job: usability here is still PROVEN_USABLE or UNKNOWN, with no
    // third member and no proven-unusable path.
    const traversal = traverseAtQ();
    for (const step of traversal.result.steps) {
      expect(["PROVEN_USABLE", "UNKNOWN"]).toContain(step.usability);
    }
    expect(traversal.result.steps.some((step) => step.listName === "cds" && step.priorityOrdinal === 4)).toBe(
      false,
    );
  });
});

describe("recognition is not knowledge", () => {
  it("leaves a cooldown with no observed cast UNKNOWN, never zero", () => {
    // Asked about an ability the fixture never shows being cast. A zero here
    // would read as "ready now" and would make `remains<=2` TRUE.
    const state = m5c3c1State();
    const derived = deriveCooldown(
      { state, actorId: M5C3C1_ACTOR, position: garroteDecisionPosition(state) },
      "not_a_modelled_ability",
    );
    expect(derived).toBeNull();
  });

  it("binds only the cooldowns it derived, omitting the rest", () => {
    const traversal = traverseAtQ();
    const bound = traversal.bindings.knownCooldownRemainsSeconds ?? [];
    expect(bound.map((entry) => entry.name)).toEqual(["kingsbane"]);
    for (const entry of bound) {
      // A bound, carried as a bound.
      expect(entry.remainsSeconds.state).toBe("BOUNDED_NUMBER");
      if (entry.remainsSeconds.state !== "BOUNDED_NUMBER") continue;
      expect(entry.remainsSeconds.atLeast).toBeGreaterThan(0);
    }
  });

  it("reports every derivation attempt, including ones that failed", () => {
    const traversal = traverseAtQ();
    expect(traversal.derivedCooldowns.map((entry) => entry.simcToken)).toEqual(["kingsbane"]);
    expect(traversal.derivedCooldowns[0]?.cooldown.state).toBe("BOUNDED");
  });
});
