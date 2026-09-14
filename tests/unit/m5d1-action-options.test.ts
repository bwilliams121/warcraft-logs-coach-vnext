/**
 * Action options are first-class syntax, and an unsupported one is a refusal.
 *
 * THE HAZARD M5-D1 CLOSED
 *
 * `core_dot[2]` is `garrote,cycle_targets=1,if=…`. Until M5-D1 the traversal read
 * the token and the `,if=` value and IGNORED `cycle_targets=1` entirely — which
 * was harmless only because the condition also contained `refreshable` and failed
 * the parser. The moment `refreshable` became supported, that line would have
 * been evaluated against the ONE implicit target, silently answering a
 * multi-target question as a single-target one.
 *
 * THE ONE EXCEPTION, AND IT IS A PROOF
 *
 * `action_t::ready()` re-runs `action_ready()` per candidate target
 * (action.cpp:2463-2488). A conjunct built only from PLAYER-scoped atoms has the
 * same value for every candidate, so a FALSE one makes the whole condition FALSE
 * for all of them and the loop finds none ready. No target is enumerated to
 * establish that.
 */

import { describe, expect, it } from "vitest";

import {
  actionOptionSupport,
  deriveActionOptionKeys,
  loadAplAuthority,
} from "../../src/simc/apl-authority.js";
import { selectAcrossLists } from "../../src/simc/nested-selection.js";
import { proveTargetIndependentFalsehood } from "../../src/simc/target-independence.js";
import { knownNumber, unknownNumber, type AtomBindings } from "../../src/simc/expression/evaluate.js";
import { syntheticAuthority, type SyntheticListSpec } from "../support/m5a-authority.js";

const BINDINGS: AtomBindings = {
  comboPoints: knownNumber(7),
  comboPointsDeficit: knownNumber(0),
  energyPct: knownNumber(100),
  dotRemainsSecondsByAction: [],
  knownBuffs: [],
  knownTalents: [{ name: "crimson_tempest", taken: true }],
};

function traverse(lists: readonly SyntheticListSpec[], usable: readonly string[] = []) {
  return selectAcrossLists({
    authority: syntheticAuthority({ lists: lists as SyntheticListSpec[] }),
    entryListName: "default",
    bindings: BINDINGS,
    usabilityFor: (action) =>
      usable.includes(action.actionToken) ? { kind: "PROVEN_USABLE" as const } : { kind: "UNKNOWN" as const },
  });
}

function actionOf(verbatim: string) {
  const loaded = loadAplAuthority({
    artifactVersion: 1,
    authorityId: "TEST",
    artifactRevision: "test-1",
    spec: { className: "rogue", specName: "assassination" },
    entryListName: "default",
    provenance: {
      repository: "https://github.com/simulationcraft/simc",
      branch: "midnight",
      commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
      commitDate: "2026-09-12",
      sourcePath: "engine/class_modules/apl/apl_rogue.cpp",
      sourceSha256: "a74e4daa8376197d94f8449555035b3fd67634db450d2f7cb16bf84233939eb3",
      sourceByteLength: 26_074,
      regionStartMarker: "//assassination_apl_start",
      regionEndMarker: "//assassination_apl_end",
      extractedOn: "2026-09-12",
      extractorVersion: 1,
    },
    lists: [
      {
        listName: "default",
        receiverIdentifier: "default_",
        actions: [{ priorityOrdinal: 0, actionStringVerbatim: verbatim, comment: null, sourceLine: 1 }],
      },
    ],
  });
  if (!loaded.ok) throw new Error(`authority did not load: ${loaded.reason} ${loaded.detail}`);
  const list = loaded.authority.actionsInList("default");
  if (!list.found) throw new Error("no list");
  const action = list.actions[0];
  if (action === undefined) throw new Error("no action");
  return action;
}

describe("option keys are derived and classified", () => {
  it("reads every key=value segment after the token, never the token itself", () => {
    expect(deriveActionOptionKeys("garrote,cycle_targets=1,if=x")).toEqual(["cycle_targets", "if"]);
    expect(deriveActionOptionKeys("crimson_tempest,target_if=max:dot.rupture.remains,if=x")).toEqual([
      "target_if",
      "if",
    ]);
    // A bare token has no options, and the leading segment is never one.
    expect(deriveActionOptionKeys("mutilate")).toEqual([]);
    expect(deriveActionOptionKeys("use_items,slots=trinket1")).toEqual(["slots"]);
  });

  it("recognises cycle_targets and target_if as UNSUPPORTED_TARGETING", () => {
    expect(actionOptionSupport("cycle_targets")).toBe("UNSUPPORTED_TARGETING");
    expect(actionOptionSupport("target_if")).toBe("UNSUPPORTED_TARGETING");
    expect(actionOptionSupport("max_cycle_targets")).toBe("UNSUPPORTED_TARGETING");
  });

  it("fails closed on an option key nobody has decided about", () => {
    // The pinned Assassination APL contains none of these. If one appears, it
    // must stop the scan rather than be ignored.
    expect(actionOptionSupport("chain")).toBe("UNRECOGNISED");
    expect(actionOptionSupport("line_cd")).toBe("UNRECOGNISED");
    expect(actionOptionSupport("interrupt_if")).toBe("UNRECOGNISED");
  });

  it("leaves an ordinary entry with no unsupported options", () => {
    expect(actionOf("envenom,if=energy.pct>70").unsupportedOptions).toEqual([]);
    // `use_off_gcd` is SUPPORTED: it adds a scheduling opportunity during a
    // running GCD and is not an execution lane. The first-GCD query terminates
    // before that pass is reachable.
    expect(actionOf("blood_fury,use_off_gcd=1,if=debuff.deathmark.up").unsupportedOptions).toEqual([]);
  });
});

describe("an unsupported targeting option refuses the entry", () => {
  it("blocks a cycling entry whose condition cannot be settled target-independently", () => {
    // `energy.pct>70` is TRUE here and is player-scoped — but a TRUE conjunct
    // proves nothing. Only a FALSE one does.
    const result = traverse([{ listName: "default", actions: ["garrote,cycle_targets=1,if=energy.pct>70"] }]);
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("UNSUPPORTED_ACTION_OPTION");
    expect(result.blockedAt?.targetingRefusal?.kind).toBe("REFUSED");
  });

  it("names the blocker as an OPTION problem, never as a parser problem", () => {
    // The remedies differ. `UNSUPPORTED_AUTHORITY_EXPRESSION` points at the
    // parser, and widening it would not help here at all.
    const result = traverse([{ listName: "default", actions: ["garrote,cycle_targets=1,if=energy.pct>70"] }]);
    if (result.kind !== "UNKNOWN") throw new Error("expected UNKNOWN");
    expect(result.blocker).not.toBe("UNSUPPORTED_AUTHORITY_EXPRESSION");
  });

  it("refuses target_if, and does not route it through the cycle rule", () => {
    // `target_if` SCORES candidates and RETARGETS. Even a target-independent
    // false conjunct would not settle it, because the retarget changes what
    // every later atom in the scan reads.
    const result = traverse([
      {
        listName: "default",
        actions: ["crimson_tempest,target_if=max:dot.rupture.remains,if=combo_points<5"],
      },
    ]);
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("UNSUPPORTED_ACTION_OPTION");
    // `combo_points<5` at 7 combo points IS a false player-scoped conjunct, and
    // it still does not rescue the entry.
    expect(result.blockedAt?.targetingRefusal?.kind).toBe("REFUSED");
  });

  it("never evaluates a cycling entry's condition against the implicit target", () => {
    const result = traverse([{ listName: "default", actions: ["garrote,cycle_targets=1,if=energy.pct>70"] }]);
    if (result.kind !== "UNKNOWN") throw new Error("expected UNKNOWN");
    // The condition is NOT_EVALUATED, so nothing downstream can read a truth
    // value that was never computed for the right target.
    expect(result.blockedAt?.gate).toEqual({ kind: "NOT_EVALUATED", why: "UNSUPPORTED_TARGETING" });
  });
});

describe("a target-INDEPENDENT false conjunct eliminates a cycling entry", () => {
  it("eliminates when a player-scoped conjunct is FALSE", () => {
    // `!talent.crimson_tempest` with the talent taken is FALSE for every
    // candidate target, so the cycle loop finds none ready.
    const result = traverse(
      [
        {
          listName: "default",
          actions: [
            "garrote,cycle_targets=1,if=!talent.crimson_tempest&remains<=4",
            "envenom,if=energy.pct>70",
          ],
        },
      ],
      ["envenom"],
    );
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("envenom");

    const cycling = result.steps.find((step) => step.priorityOrdinal === 0);
    expect(cycling?.outcome).toBe("TARGET_INDEPENDENT_ELIMINATION_CONTINUE");
    expect(cycling?.targetingRefusal?.kind).toBe("ELIMINATED_FOR_EVERY_TARGET");
  });

  it("carries the proving conjunct and its atoms as evidence", () => {
    const action = actionOf("garrote,cycle_targets=1,if=!talent.crimson_tempest&remains<=4");
    const proof = proveTargetIndependentFalsehood(action, BINDINGS);
    expect(proof.kind).toBe("ELIMINATED_FOR_EVERY_TARGET");
    if (proof.kind !== "ELIMINATED_FOR_EVERY_TARGET") return;
    expect(proof.conjunctIndex).toBe(0);
    expect(proof.conjunctAtomKeys).toEqual(["talent.crimson_tempest"]);
    expect(proof.trace.aggregate).toBe("FALSE");
  });

  it("does NOT eliminate on a TARGET-scoped false conjunct", () => {
    // `remains` addresses the acting action's DoT ON ITS TARGET, so its value
    // differs per candidate. A false one there proves nothing about the others.
    const action = actionOf("garrote,cycle_targets=1,if=remains<=4&talent.crimson_tempest");
    const proof = proveTargetIndependentFalsehood(action, {
      ...BINDINGS,
      dotRemainsSecondsByAction: [{ actionToken: "garrote", remainsSeconds: knownNumber(19) }],
    });
    expect(proof.kind).toBe("NOT_PROVEN");
    if (proof.kind !== "NOT_PROVEN") return;
    expect(proof.failure).toBe("NO_TARGET_INDEPENDENT_CONJUNCT_IS_FALSE");
  });

  it("does NOT eliminate on an UNRESOLVED player-scoped conjunct", () => {
    // The talent is unbound, so the conjunct is enumerated and the worlds
    // disagree. An undecided conjunct is not a false one.
    const action = actionOf("garrote,cycle_targets=1,if=!talent.crimson_tempest&remains<=4");
    const proof = proveTargetIndependentFalsehood(action, {
      ...BINDINGS,
      knownTalents: [],
    });
    expect(proof.kind).toBe("NOT_PROVEN");
    if (proof.kind !== "NOT_PROVEN") return;
    expect(proof.failure).toBe("NO_TARGET_INDEPENDENT_CONJUNCT_IS_FALSE");
  });

  it("never descends into an OR to find its conjunct", () => {
    // `FALSE | x` is `x`, not FALSE. Splitting a disjunction would produce
    // fragments whose falsehood proves nothing about the whole.
    const action = actionOf("garrote,cycle_targets=1,if=!talent.crimson_tempest|remains<=4");
    const proof = proveTargetIndependentFalsehood(action, BINDINGS);
    expect(proof.kind).toBe("NOT_PROVEN");
  });

  it("refuses an unconditional cycling entry rather than eliminating it", () => {
    // No condition means no conjunct, and an unconditional cycling action is
    // ready for whichever target comes first.
    const action = actionOf("garrote,cycle_targets=1");
    const proof = proveTargetIndependentFalsehood(action, BINDINGS);
    expect(proof.kind).toBe("NOT_PROVEN");
    if (proof.kind !== "NOT_PROVEN") return;
    expect(proof.failure).toBe("NO_CONDITION");
  });

  it("enumerates no targets to reach its verdict", () => {
    // STRUCTURAL. If this module ever learns about a target list, the whole
    // argument for the rule collapses.
    const proof = proveTargetIndependentFalsehood(
      actionOf("garrote,cycle_targets=1,if=!talent.crimson_tempest"),
      BINDINGS,
    );
    expect(proof.kind).toBe("ELIMINATED_FOR_EVERY_TARGET");
    if (proof.kind !== "ELIMINATED_FOR_EVERY_TARGET") return;
    // The evidence names atoms and a conjunct index, and nothing target-shaped.
    expect(JSON.stringify(proof)).not.toContain("targetActorId");
    expect(JSON.stringify(proof)).not.toContain("enem");
    expect(JSON.stringify(proof)).not.toContain("spell_targets");
  });
});

describe("entries without options are unchanged", () => {
  it("still evaluates an ordinary entry's condition normally", () => {
    const result = traverse([{ listName: "default", actions: ["envenom,if=energy.pct>70"] }], ["envenom"]);
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.selectingStep.gate.kind).toBe("EVALUATED");
    expect(result.selectingStep.targetingRefusal).toBeNull();
  });

  it("leaves an ordinary FALSE condition reported as a condition, not a targeting refusal", () => {
    const result = traverse(
      [
        {
          listName: "default",
          actions: ["garrote,if=combo_points<5", "envenom,if=energy.pct>70"],
        },
      ],
      ["envenom"],
    );
    if (result.kind !== "SELECTED") throw new Error("expected a selection");
    const eliminated = result.steps.find((step) => step.priorityOrdinal === 0);
    expect(eliminated?.outcome).toBe("ELIMINATED_CONTINUE");
    expect(eliminated?.outcome).not.toBe("TARGET_INDEPENDENT_ELIMINATION_CONTINUE");
    expect(eliminated?.targetingRefusal).toBeNull();
  });
});

const _unusedBindings: AtomBindings = { ...BINDINGS, energyPct: unknownNumber("STATE_NOT_ESTABLISHED") };
void _unusedBindings;
