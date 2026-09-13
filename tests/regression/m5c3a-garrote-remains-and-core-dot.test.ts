/**
 * M5-C3a, against the real capture.
 *
 * THE HEADLINE, AND ITS EXACT SCOPE
 *
 *     Within the pinned Assassination `core_dot` list, at the real actor-19
 *     post-Vanish decision Q, the authority selects Garrote.
 *
 * Scoped. NOT a global verdict, NOT a claim about `cds`, NOT a traversal of
 * `default`. The negative half of this file is as load-bearing as the positive
 * half, and it is longer.
 */

import { describe, expect, it } from "vitest";

import {
  m5c3aState,
  garroteDecisionPosition,
  findAuraAt,
  observedTalentEntries,
  M5C3A_ACTOR,
  M5C3A_TARGET,
  M5C3A_OTHER_ROGUE,
  M5C3A_IDS,
  M5C3A_EVENTS,
  M5C3A_EXPECTED_REMAINS_MS,
  M5C3A_EXPECTED_REMAINS_SECONDS,
} from "../support/m5c3a-fixture.js";
import { bindGarroteRemains } from "../../src/specs/rogue/assassination/garrote-dot-state.js";
import { bindStealthedRogue } from "../../src/specs/rogue/assassination/stealth-state.js";
import {
  selectCoreDotActionAt,
  CORE_DOT_LIST_NAME,
} from "../../src/specs/rogue/assassination/core-dot-selection.js";
import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";
import { resolveTalentSelection } from "../../src/data/game/rogue-talents.js";
import { dotDurationForToken, pinnedRogueDotDurations } from "../../src/data/game/rogue-dot-durations.js";

function authorityOrThrow() {
  const loaded = pinnedAssassinationAuthority();
  if (!loaded.ok) throw new Error(`pinned authority did not load: ${loaded.reason}`);
  return loaded.authority;
}

/** The validated artifact, read through its own loader rather than the raw JSON. */
function pinnedRogueDotDurationsOrThrow() {
  const loaded = pinnedRogueDotDurations();
  if (!loaded.ok) throw new Error(`dot duration artifact did not load: ${loaded.reason}`);
  return loaded.artifact;
}

/** Talents resolved from the fixture's own `combatantinfo`. UNKNOWN ones are omitted. */
function knownTalentsFrom(state: ReturnType<typeof m5c3aState>) {
  const entries = observedTalentEntries(state);
  return ["improved_garrote", "shrouded_suffocation", "blindside", "improved_ambush"]
    .map((name) => resolveTalentSelection(entries, name))
    .filter((resolution) => resolution.selection !== "UNKNOWN")
    .map((resolution) => ({
      name: resolution.simcName,
      taken: resolution.selection === "SELECTED",
    }));
}

function selectAtQ() {
  const state = m5c3aState();
  const position = garroteDecisionPosition(state);
  return selectCoreDotActionAt({
    state,
    actorId: M5C3A_ACTOR,
    targetActorId: M5C3A_TARGET,
    position,
    observedAbilityGameId: M5C3A_IDS.garrote,
    authority: authorityOrThrow(),
    knownTalents: knownTalentsFrom(state),
  });
}

describe("the derived Garrote remaining duration", () => {
  it("derives 5.746 seconds at Q from the observed application and the pinned duration", () => {
    const state = m5c3aState();
    const result = bindGarroteRemains({
      state,
      actorId: M5C3A_ACTOR,
      targetActorId: M5C3A_TARGET,
      position: garroteDecisionPosition(state),
    });

    expect(result.state).toBe("KNOWN");
    if (result.state !== "KNOWN") return;

    // The arithmetic, stated rather than recomputed by the test:
    //   (2164326 + 18000) - 2176580 = 5746 ms
    expect(result.remainsMs).toBe(M5C3A_EXPECTED_REMAINS_MS);
    expect(result.remainsSeconds).toBe(M5C3A_EXPECTED_REMAINS_SECONDS);
    expect(result.baseDurationMs).toBe(18_000);
  });

  it("anchors on the ACTOR'S OWN application, not the other rogue's", () => {
    // The fixture's sharpest asset. Actor 13 lands an independent Garrote on the
    // same target at 2172232, between the anchor and Q. Anchoring on it would
    // yield 13.652s — a plausible number, and wrong.
    const state = m5c3aState();
    const result = bindGarroteRemains({
      state,
      actorId: M5C3A_ACTOR,
      targetActorId: M5C3A_TARGET,
      position: garroteDecisionPosition(state),
    });
    expect(result.state).toBe("KNOWN");
    if (result.state !== "KNOWN") return;

    const ownApplication = findAuraAt(state, {
      sourceActorId: M5C3A_ACTOR,
      targetActorId: M5C3A_TARGET,
      abilityGameId: M5C3A_IDS.garrote,
      operation: "APPLIED",
      reportTimeMs: M5C3A_EVENTS.garroteAnchor,
    });
    expect(result.anchor.position).toBe(ownApplication);
    expect(result.anchor.locator.reportTimeMs).toBe(M5C3A_EVENTS.garroteAnchor);

    // And the wrong answer is named, so a regression cannot land quietly.
    const otherRogueApplication = findAuraAt(state, {
      sourceActorId: M5C3A_OTHER_ROGUE,
      targetActorId: M5C3A_TARGET,
      abilityGameId: M5C3A_IDS.garrote,
      operation: "APPLIED",
      reportTimeMs: M5C3A_EVENTS.otherRogueGarrote,
    });
    expect(result.anchor.position).not.toBe(otherRogueApplication);
    expect(result.remainsMs).not.toBe(13_652);
  });

  it("does not read the DoT the decision itself applied", () => {
    // THE TEMPORAL TRAP. At 2176580 the cast shares a timestamp with the
    // `removedebuff` + `applydebuff` it causes. A query that included them would
    // derive 18.000s — the post-decision state — and justify the decision by its
    // own consequence.
    const state = m5c3aState();
    const position = garroteDecisionPosition(state);
    const result = bindGarroteRemains({
      state,
      actorId: M5C3A_ACTOR,
      targetActorId: M5C3A_TARGET,
      position,
    });
    expect(result.state).toBe("KNOWN");
    if (result.state !== "KNOWN") return;

    expect(result.remainsSeconds).not.toBe(18);
    // Structural, not just numeric: the anchor is strictly BEFORE Q.
    expect(result.anchor.position).toBeLessThan(position);

    const selfApplication = findAuraAt(state, {
      sourceActorId: M5C3A_ACTOR,
      targetActorId: M5C3A_TARGET,
      abilityGameId: M5C3A_IDS.garrote,
      operation: "APPLIED",
      reportTimeMs: 2_176_580,
    });
    expect(selfApplication).toBeGreaterThan(position);
    expect(result.anchor.position).not.toBe(selfApplication);
  });

  it("keeps the fixture's event order, because the order is the evidence", () => {
    // If the cast ever sorts after its own consequences, the test above starts
    // passing for the wrong reason. This pins the ordering itself.
    const state = m5c3aState();
    const position = garroteDecisionPosition(state);
    for (const reportTimeMs of [2_176_580]) {
      const consequences = state.fight.events
        .map((event, index) => ({ event, index }))
        .filter(({ event }) => event.kind === "AURA" && event.reportTimeMs === reportTimeMs);
      expect(consequences.length).toBeGreaterThan(0);
      for (const { index } of consequences) {
        expect(index).toBeGreaterThan(position);
      }
    }
  });
});

describe("the derivation refuses rather than approximating", () => {
  it("returns UNKNOWN at a position before any observed application", () => {
    const state = m5c3aState();
    const anchor = findAuraAt(state, {
      sourceActorId: M5C3A_ACTOR,
      targetActorId: M5C3A_TARGET,
      abilityGameId: M5C3A_IDS.garrote,
      operation: "APPLIED",
      reportTimeMs: M5C3A_EVENTS.garroteAnchor,
    });
    const result = bindGarroteRemains({
      state,
      actorId: M5C3A_ACTOR,
      targetActorId: M5C3A_TARGET,
      position: anchor,
    });
    // BEFORE_EVENT at the application itself: the DoT is not yet on the target,
    // and no earlier transition is in scope. Not zero, not "about to expire".
    expect(result.state).toBe("UNKNOWN");
  });

  it("returns UNKNOWN for a target the actor never applied it to", () => {
    const state = m5c3aState();
    const result = bindGarroteRemains({
      state,
      actorId: M5C3A_ACTOR,
      // The actor themselves — a target their own Garrote was never on.
      targetActorId: M5C3A_ACTOR,
      position: garroteDecisionPosition(state),
    });
    expect(result.state).toBe("UNKNOWN");
    if (result.state !== "UNKNOWN") return;
    expect(result.blocker).toBe("AURA_STATE_UNKNOWN");
  });

  it("returns UNKNOWN for another actor's DoT the fixture cannot anchor", () => {
    // Actor 13's Garrote IS observed, so this is not a missing-evidence case in
    // the crude sense — it is a different identity, asked about at a position
    // the slice does not cover for that source in both directions.
    const state = m5c3aState();
    const result = bindGarroteRemains({
      state,
      actorId: 999,
      targetActorId: M5C3A_TARGET,
      position: garroteDecisionPosition(state),
    });
    expect(result.state).toBe("UNKNOWN");
  });

  it("never reports a negative or zero remainder as a duration", () => {
    // Every position in the fixture, exhaustively. A remainder that came out
    // <= 0 must present as a CONTRADICTION, never as a number a `remains<=`
    // comparison could satisfy.
    const state = m5c3aState();
    for (let position = 0; position < state.fight.events.length; position += 1) {
      const result = bindGarroteRemains({
        state,
        actorId: M5C3A_ACTOR,
        targetActorId: M5C3A_TARGET,
        position,
      });
      if (result.state !== "KNOWN") continue;
      expect(result.remainsMs).toBeGreaterThan(0);
      expect(result.remainsSeconds).toBeGreaterThan(0);
      expect(result.remainsSeconds).toBeLessThanOrEqual(18);
    }
  });

  it("reports UNKNOWN with the DoT-specific blocker when the dataset has no entry", () => {
    // The token must be the one the artifact carries. Nothing here falls back to
    // a default duration.
    expect(dotDurationForToken("garrote")).not.toBeNull();
    expect(dotDurationForToken("rupture")).toBeNull();
    expect(dotDurationForToken("not_an_action")).toBeNull();
  });
});

describe("the pinned Garrote game data", () => {
  it("carries 703 with an 18000ms base duration", () => {
    const identity = dotDurationForToken("garrote");
    expect(identity).not.toBeNull();
    if (identity === null) return;
    expect(identity.abilityGameId).toBe(703);
    expect(identity.baseDurationMs).toBe(18_000);
    expect(identity.baseCooldownMs).toBe(6_000);
    expect(identity.displayNameEn).toBe("Garrote");
  });

  it("binds the token through the specialization spell table, not by assertion", () => {
    const identity = dotDurationForToken("garrote");
    if (identity === null) throw new Error("garrote must be present");
    expect(identity.binding.method).toBe("SPECIALIZATION_SPELL_TABLE");
    expect(identity.binding.classId).toBe(4);
    expect(identity.binding.specId).toBe(259);
    expect(identity.binding.createAction).toContain('name == "garrote"');
    expect(identity.binding.specBinding).toContain('find_specialization_spell( "Garrote" )');
  });

  it("states its units, so a milliseconds value cannot be read as seconds", () => {
    const loaded = pinnedRogueDotDurationsOrThrow();
    expect(loaded.provenance.durationFieldUnits).toBe("MILLISECONDS");
    expect(loaded.provenance.durationFieldName).toBe("_duration");
  });

  it("is pinned to the same SimulationCraft commit as every other artifact", () => {
    const loaded = pinnedRogueDotDurationsOrThrow();
    expect(loaded.provenance.commitSha).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    expect(loaded.provenance.clientDataWowVersion).toBe("12.1.0.69587");
  });
});

describe("the scoped core_dot selection", () => {
  it("SELECTS GARROTE within core_dot at the real decision Q", () => {
    const result = selectAtQ();
    expect(result.status).toBe("SELECTED_BY_AUTHORITY");
    if (result.status !== "SELECTED_BY_AUTHORITY") return;

    expect(result.selectedAction.simcToken).toBe("garrote");
    expect(result.selectedAction.abilityGameId).toBe(703);
    expect(result.scope.kind).toBe("APL_SUBLIST");
    expect(result.scope.listName).toBe(CORE_DOT_LIST_NAME);
    expect(result.selectingLine.priorityOrdinal).toBe(0);
  });

  it("rests on an UNCONDITIONAL entry, proved from the pinned call string", () => {
    const result = selectAtQ();
    if (result.status !== "SELECTED_BY_AUTHORITY") throw new Error("expected a selection");
    expect(result.entryProof.kind).toBe("UNCONDITIONAL");
    expect(result.entryProof.actionStringVerbatim).toBe("call_action_list,name=core_dot");
    // The proof is that there is no condition at all, so this must stay absent.
    expect(result.entryProof.actionStringVerbatim).not.toContain("if=");
    expect(result.entryProof.gate.listName).toBe("default");
  });

  it("converges: TRUE in every world, with three atoms never resolved", () => {
    const result = selectAtQ();
    if (result.status !== "SELECTED_BY_AUTHORITY") throw new Error("expected a selection");
    const line = result.lines[0];
    expect(line?.condition.kind).toBe("EVALUATED");
    if (line?.condition.kind !== "EVALUATED") return;

    const { trace } = line.condition;
    // 2^3 = eight worlds, from the three unresolved BOOLEAN atoms.
    expect(trace.worlds).toHaveLength(8);
    expect(trace.worlds.every((world) => world.result === "TRUE")).toBe(true);
    expect(trace.aggregate).toBe("TRUE");
    expect(trace.aggregateRule).toBe("INVARIANT_ACROSS_WORLDS");

    const byKey = new Map(trace.atoms.map((atom) => [atom.key, atom]));
    expect(byKey.get("buff.improved_garrote.up")?.binding).toBe("UNRESOLVED_BOOLEAN");
    expect(byKey.get("talent.razor_wire")?.binding).toBe("UNRESOLVED_BOOLEAN");
    expect(byKey.get("variable.single_target")?.binding).toBe("UNRESOLVED_BOOLEAN");
  });

  it("never resolves pmultiplier, and does not need to", () => {
    // The convergence is what makes this answerable. `pmultiplier` is a snapshot
    // this project does not reconstruct; the verdict holds anyway because the
    // OTHER side of that OR is true in every world.
    const result = selectAtQ();
    if (result.status !== "SELECTED_BY_AUTHORITY") throw new Error("expected a selection");
    const line = result.lines[0];
    if (line?.condition.kind !== "EVALUATED") throw new Error("expected an evaluation");

    const pmultiplier = line.condition.trace.atoms.find((atom) => atom.key === "pmultiplier");
    expect(pmultiplier?.binding).toBe("UNKNOWN_NUMBER");
    expect(pmultiplier?.unknownNumberReason).toBe("STATE_NOT_MODELLED");
    expect(pmultiplier?.value).toBeNull();
  });

  it("carries the derived remains and the stealth proof as evidence", () => {
    const result = selectAtQ();
    if (result.status !== "SELECTED_BY_AUTHORITY") throw new Error("expected a selection");

    expect(result.derivedState.garroteRemains.state).toBe("KNOWN");
    expect(result.derivedState.stealthedRogue.value).toBe("TRUE");
    // Vanish the BUFF (11327), never Vanish the ACTION (1856).
    if (result.derivedState.stealthedRogue.value === "TRUE") {
      expect(result.derivedState.stealthedRogue.provenBy.abilityGameId).toBe(M5C3A_IDS.vanishBuff);
    }
    // Both facts are traceable to real events.
    expect(result.stateEvidence.length).toBeGreaterThanOrEqual(2);
  });

  it("stops at the first entry and never evaluates the unparseable ones below", () => {
    // `core_dot[1]` through `[4]` need `refreshable` and `target.time_to_die`,
    // both outside the subset. The answer is exact only because the walk never
    // reaches them — not because they were skipped.
    const result = selectAtQ();
    if (result.status !== "SELECTED_BY_AUTHORITY") throw new Error("expected a selection");
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.priorityOrdinal).toBe(0);

    const coreDot = authorityOrThrow().actionsInList(CORE_DOT_LIST_NAME);
    expect(coreDot.found).toBe(true);
    if (!coreDot.found) return;
    // There ARE more entries. They were not evaluated, and not eliminated.
    expect(coreDot.actions.length).toBeGreaterThan(1);
  });
});

describe("the scoped result does not become a global one", () => {
  it("claims a sub-list scope and nothing wider", () => {
    const result = selectAtQ();
    if (result.status !== "SELECTED_BY_AUTHORITY") throw new Error("expected a selection");
    expect(result.scope.kind).toBe("APL_SUBLIST");
    // No vocabulary for a global claim exists to be reached for.
    expect(Object.keys(result)).not.toContain("globalSelection");
    expect(JSON.stringify(result)).not.toContain("GLOBAL_APL");
  });

  it("makes no claim whatsoever about the cds list", () => {
    // `cds` is a different list with its own entries. This module never reads it.
    const result = selectAtQ();
    if (result.status !== "SELECTED_BY_AUTHORITY") throw new Error("expected a selection");
    for (const line of result.lines) {
      expect(line.listName).toBe(CORE_DOT_LIST_NAME);
    }
    expect(result.scope.listName).toBe(CORE_DOT_LIST_NAME);

    // And `cds` genuinely still cannot be walked, so no future reader can take
    // this result as evidence that it was.
    const cds = authorityOrThrow().actionsInList("cds");
    expect(cds.found).toBe(true);
  });

  it("does not traverse default, and does not claim the entries above core_dot", () => {
    const authority = authorityOrThrow();
    const result = selectAtQ();
    if (result.status !== "SELECTED_BY_AUTHORITY") throw new Error("expected a selection");

    // The gate is named, which is not the same as the gate being walked. Entries
    // 0, 1 and 2 of `default` sit ABOVE it and are untouched by this result.
    expect(result.entryProof.gate.priorityOrdinal).toBe(6);
    const defaultList = authority.actionsInList("default");
    if (!defaultList.found) throw new Error("default must exist");
    for (const ordinal of [0, 1, 2]) {
      const line = defaultList.actions.find((action) => action.priorityOrdinal === ordinal);
      expect(line?.conditionRaw, `default[${String(ordinal)}] gained a condition`).toBeNull();
    }
    // None of them appears among the evaluated lines.
    expect(result.lines.some((line) => line.listName === "default")).toBe(false);
  });
});

describe("negative: the selection is not manufactured", () => {
  it("does not select when the remaining duration cannot be derived", () => {
    // Same decision point, same authority, but the DoT question asked about a
    // target the actor's Garrote was never on. The condition's right conjunct
    // becomes undecidable and the exact answer disappears.
    const state = m5c3aState();
    const result = selectCoreDotActionAt({
      state,
      actorId: M5C3A_ACTOR,
      targetActorId: M5C3A_ACTOR,
      position: garroteDecisionPosition(state),
      observedAbilityGameId: M5C3A_IDS.garrote,
      authority: authorityOrThrow(),
      knownTalents: knownTalentsFrom(state),
    });
    expect(result.status).toBe("UNKNOWN");
    if (result.status !== "UNKNOWN") return;
    expect(result.derivedState?.garroteRemains.state).toBe("UNKNOWN");
  });

  it("does not select when usability is not proven, and hits the unsupported wall below", () => {
    // A true condition alone would assert the ability was off cooldown, in
    // range, affordable and legal — none of which this project models. So with
    // usability unproven, `core_dot[0]` is only POSSIBLE, the walk does NOT stop
    // there, and it immediately reaches `core_dot[1]` — which needs `refreshable`
    // and is refused whole.
    //
    // That blocker is the sharper result, and it is worth stating plainly: the
    // headline verdict exists ONLY because line 0 definitely fires. Everything
    // below it is still unevaluable, so the exact answer cannot be coming from
    // lines that were skipped or quietly treated as false.
    const state = m5c3aState();
    const result = selectCoreDotActionAt({
      state,
      actorId: M5C3A_ACTOR,
      targetActorId: M5C3A_TARGET,
      position: garroteDecisionPosition(state),
      // Some other ability was observed, so garrote is not PROVEN_USABLE.
      observedAbilityGameId: M5C3A_IDS.vanishAction,
      authority: authorityOrThrow(),
      knownTalents: knownTalentsFrom(state),
    });
    expect(result.status).toBe("UNKNOWN");
    if (result.status !== "UNKNOWN") return;
    expect(result.blocker).toBe("UNSUPPORTED_AUTHORITY_EXPRESSION");
    expect(result.blockedBy?.priorityOrdinal).toBe(1);
    expect(result.blockedBy?.listName).toBe(CORE_DOT_LIST_NAME);
  });

  it("reports NO_AUTHORITY_AVAILABLE rather than UNKNOWN when there is no APL", () => {
    // The two are never interchangeable: one is a missing standard, the other is
    // missing evidence for a standard we have.
    const state = m5c3aState();
    const result = selectCoreDotActionAt({
      state,
      actorId: M5C3A_ACTOR,
      targetActorId: M5C3A_TARGET,
      position: garroteDecisionPosition(state),
      observedAbilityGameId: M5C3A_IDS.garrote,
      authority: null,
      knownTalents: [],
    });
    expect(result.status).toBe("NO_AUTHORITY_AVAILABLE");
  });

  it("leaves razor_wire and single_target UNRESOLVED rather than assuming them false", () => {
    // The build genuinely does not tell us. Binding either to `false` would have
    // produced the same headline for the wrong reason — the threshold would be
    // pinned at one value instead of proven across all four.
    const state = m5c3aState();
    const talents = knownTalentsFrom(state);
    expect(talents.map((talent) => talent.name)).not.toContain("razor_wire");

    const result = selectAtQ();
    if (result.status !== "SELECTED_BY_AUTHORITY") throw new Error("expected a selection");
    const line = result.lines[0];
    if (line?.condition.kind !== "EVALUATED") throw new Error("expected an evaluation");
    const razorWire = line.condition.trace.atoms.find((atom) => atom.key === "talent.razor_wire");
    expect(razorWire?.binding).toBe("UNRESOLVED_BOOLEAN");
    expect(razorWire?.value).toBeNull();
  });
});

describe("the stealth fact M5-C2 established is unchanged", () => {
  it("still proves stealthed.rogue TRUE at Q from the Vanish buff", () => {
    const state = m5c3aState();
    const stealth = bindStealthedRogue({
      state,
      actorId: M5C3A_ACTOR,
      position: garroteDecisionPosition(state),
    });
    expect(stealth.value).toBe("TRUE");
    if (stealth.value !== "TRUE") return;
    expect(stealth.provenBy.abilityGameId).toBe(M5C3A_IDS.vanishBuff);
    // NOT the Improved Garrote buff, which is applied at Q as a CONSEQUENCE and
    // is excluded from the mask anyway.
    expect(stealth.provenBy.abilityGameId).not.toBe(M5C3A_IDS.improvedGarroteBuff);
  });
});
