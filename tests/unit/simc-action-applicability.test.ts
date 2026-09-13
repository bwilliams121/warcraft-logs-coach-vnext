/**
 * Applicability and negative usability as CONTROL FLOW, on synthetic lists.
 *
 * The real APL exercises one shape of this. These lists supply the rest, and in
 * particular the ones the pinned authority happens not to contain: an unknown
 * applicability, a proven-unusable entry standing above one that fires, and an
 * inapplicable entry whose condition could not have been parsed at all.
 *
 * THE PROPERTY UNDER TEST THROUGHOUT
 *
 *     applicability  ->  usability  ->  condition
 *
 * which is the pinned order. `select_action` skips background actions before
 * anything else (player.cpp:14229-14230), and `action_ready()` checks `ready()`
 * before `if_expr` (action.cpp:2567). A decided entry therefore never has its
 * condition evaluated — asserted here with syntax that would REFUSE to parse, so
 * the claim cannot pass by coincidence.
 */

import { describe, expect, it } from "vitest";

import {
  applicable,
  notApplicable,
  provenUnusable,
  provenUsable,
  unknownApplicability,
  unknownUsability,
  type ActionApplicability,
  type ActionUsabilityVerdict,
} from "../../src/simc/action-applicability.js";
import { selectAcrossLists, type TraversalResult } from "../../src/simc/nested-selection.js";
import { knownNumber, unknownNumber, type AtomBindings } from "../../src/simc/expression/evaluate.js";
import type { AplAction } from "../../src/simc/apl-authority.js";
import { syntheticAuthority, type SyntheticListSpec } from "../support/m5a-authority.js";

/** Makes `combo_points>=5` definitely TRUE and `combo_points<5` definitely FALSE. */
const BINDINGS: AtomBindings = {
  comboPoints: knownNumber(7),
  comboPointsDeficit: unknownNumber("STATE_NOT_ESTABLISHED"),
  energyPct: unknownNumber("STATE_NOT_ESTABLISHED"),
  dotRemainsSeconds: unknownNumber("STATE_NOT_ESTABLISHED"),
  knownBuffs: [],
};

const TRUE_COND = "combo_points>=5";
const FALSE_COND = "combo_points<5";
/** Real pinned syntax outside the supported subset. Parsing it REFUSES. */
const UNSUPPORTED_COND = "refreshable";

const NOT_EQUIPPED = notApplicable("ITEM_NOT_EQUIPPED", {
  itemId: 193_701,
  slot: null,
  pinnedBehaviour: "use_item_t constructor set background = true",
});

const ON_COOLDOWN = provenUnusable("ACTIVE_COOLDOWN", {
  abilityGameId: 1_293_316,
  itemId: 273_796,
  provenRemainingAtLeastMs: 116_146,
  cooldownToleranceMs: 250,
  detail: "the item's own use cooldown is proven to exceed the queueing tolerance",
});

interface TraverseOptions {
  readonly notApplicableTokens?: readonly string[];
  readonly unknownApplicabilityTokens?: readonly string[];
  readonly unusableTokens?: readonly string[];
  readonly usableTokens?: readonly string[];
  /** Records the order in which the two resolvers were consulted. */
  readonly calls?: string[];
}

function traverse(lists: readonly SyntheticListSpec[], options: TraverseOptions = {}): TraversalResult {
  const applicabilityFor = (action: AplAction): ActionApplicability => {
    options.calls?.push(`applicability:${action.actionToken}`);
    if (options.notApplicableTokens?.includes(action.actionToken) === true) return NOT_EQUIPPED;
    if (options.unknownApplicabilityTokens?.includes(action.actionToken) === true) {
      return unknownApplicability("the profile does not resolve this entry");
    }
    return applicable();
  };
  const usabilityFor = (action: AplAction): ActionUsabilityVerdict => {
    options.calls?.push(`usability:${action.actionToken}`);
    if (options.unusableTokens?.includes(action.actionToken) === true) return ON_COOLDOWN;
    if (options.usableTokens?.includes(action.actionToken) === true) return provenUsable();
    return unknownUsability();
  };

  return selectAcrossLists({
    authority: syntheticAuthority({ lists: lists as SyntheticListSpec[] }),
    entryListName: "default",
    bindings: BINDINGS,
    usabilityFor,
    applicabilityFor,
  });
}

function labels(result: TraversalResult): readonly string[] {
  return result.steps.map((step) => `${step.actionToken} ${step.outcome}`);
}

describe("an inapplicable entry is stepped over without being judged", () => {
  it("continues past it and selects the entry below", () => {
    const result = traverse([{ listName: "default", actions: [`mutilate,if=${TRUE_COND}`, "envenom"] }], {
      notApplicableTokens: ["mutilate"],
      usableTokens: ["envenom"],
    });
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("envenom");
    expect(labels(result)).toEqual(["mutilate NOT_APPLICABLE_CONTINUE", "envenom SELECTED"]);
  });

  it("does NOT evaluate its condition, even when that condition cannot parse", () => {
    // THE consequence that makes the pinned `items` list traversable. If the
    // order were condition-first this would block, because `refreshable` is
    // outside the supported subset.
    const result = traverse(
      [{ listName: "default", actions: [`mutilate,if=${UNSUPPORTED_COND}`, "envenom"] }],
      { notApplicableTokens: ["mutilate"], usableTokens: ["envenom"] },
    );
    expect(result.kind).toBe("SELECTED");
    const step = result.steps[0];
    expect(step?.gate).toEqual({ kind: "NOT_EVALUATED", why: "NOT_APPLICABLE" });
  });

  it("never even asks whether it was usable", () => {
    // There is no action to be ready. Asking would invite an answer, and an
    // answer would imply the entry exists.
    const calls: string[] = [];
    traverse([{ listName: "default", actions: ["mutilate", "envenom"] }], {
      notApplicableTokens: ["mutilate"],
      usableTokens: ["envenom"],
      calls,
    });
    expect(calls).toContain("applicability:mutilate");
    expect(calls).not.toContain("usability:mutilate");
  });

  it("carries the evidence that established the skip", () => {
    const result = traverse([{ listName: "default", actions: ["mutilate", "envenom"] }], {
      notApplicableTokens: ["mutilate"],
      usableTokens: ["envenom"],
    });
    const step = result.steps[0];
    expect(step?.applicability.kind).toBe("NOT_APPLICABLE");
    if (step?.applicability.kind !== "NOT_APPLICABLE") return;
    expect(step.applicability.reason).toBe("ITEM_NOT_EQUIPPED");
    expect(step.applicability.evidence.itemId).toBe(193_701);
  });
});

describe("UNKNOWN applicability is never read as NOT_APPLICABLE", () => {
  it("blocks rather than stepping over the entry", () => {
    // There is a world in which the action exists and fires, so everything
    // below it is contaminated. This is the racial case: race is unknowable
    // from Warcraft Logs, so a racial cannot be skipped.
    const result = traverse([{ listName: "default", actions: ["blood_fury", "envenom"] }], {
      unknownApplicabilityTokens: ["blood_fury"],
      usableTokens: ["envenom"],
    });
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("APPLICABILITY_NOT_ESTABLISHED");
    expect(result.blockedAt?.actionToken).toBe("blood_fury");
  });

  it("does not let a lower entry be selected past it", () => {
    const result = traverse([{ listName: "default", actions: ["blood_fury", `envenom,if=${TRUE_COND}`] }], {
      unknownApplicabilityTokens: ["blood_fury"],
      usableTokens: ["envenom"],
    });
    expect(result.kind).not.toBe("SELECTED");
    expect(result.steps.some((step) => step.actionToken === "envenom")).toBe(false);
  });
});

describe("a proven-unusable entry is stepped over, and stays distinguishable", () => {
  it("continues past it and selects the entry below", () => {
    const result = traverse([{ listName: "default", actions: [`mutilate,if=${TRUE_COND}`, "envenom"] }], {
      unusableTokens: ["mutilate"],
      usableTokens: ["envenom"],
    });
    expect(result.kind).toBe("SELECTED");
    expect(labels(result)).toEqual(["mutilate PROVEN_UNUSABLE_CONTINUE", "envenom SELECTED"]);
  });

  it("does NOT evaluate its condition, even when that condition cannot parse", () => {
    const result = traverse(
      [{ listName: "default", actions: [`mutilate,if=${UNSUPPORTED_COND}`, "envenom"] }],
      { unusableTokens: ["mutilate"], usableTokens: ["envenom"] },
    );
    expect(result.kind).toBe("SELECTED");
    expect(result.steps[0]?.gate).toEqual({ kind: "NOT_EVALUATED", why: "PROVEN_UNUSABLE" });
  });

  it("is NOT the same outcome as a condition proven false", () => {
    // Both continue the scan. They are not the same fact: one says the action
    // could not fire, the other says the authority did not want it. A report
    // that conflated them would explain the wrong thing to the player.
    const result = traverse(
      [{ listName: "default", actions: ["mutilate", `rupture,if=${FALSE_COND}`, "envenom"] }],
      { unusableTokens: ["mutilate"], usableTokens: ["envenom"] },
    );
    expect(labels(result)).toEqual([
      "mutilate PROVEN_UNUSABLE_CONTINUE",
      "rupture ELIMINATED_CONTINUE",
      "envenom SELECTED",
    ]);
    expect(result.steps[0]?.gate.kind).toBe("NOT_EVALUATED");
    expect(result.steps[1]?.gate.kind).toBe("EVALUATED");
  });

  it("carries the cooldown evidence onto the step", () => {
    const result = traverse([{ listName: "default", actions: ["mutilate", "envenom"] }], {
      unusableTokens: ["mutilate"],
      usableTokens: ["envenom"],
    });
    const verdict = result.steps[0]?.usabilityVerdict;
    expect(verdict?.kind).toBe("PROVEN_UNUSABLE");
    if (verdict?.kind !== "PROVEN_UNUSABLE") return;
    expect(verdict.evidence.provenRemainingAtLeastMs).toBe(116_146);
    expect(verdict.evidence.cooldownToleranceMs).toBe(250);
  });
});

describe("the two resolvers are consulted in the pinned order", () => {
  it("asks applicability before usability for every entry", () => {
    const calls: string[] = [];
    traverse([{ listName: "default", actions: ["mutilate", "envenom"] }], {
      usableTokens: ["envenom"],
      calls,
    });
    expect(calls).toEqual([
      "applicability:mutilate",
      "usability:mutilate",
      "applicability:envenom",
      "usability:envenom",
    ]);
  });
});

describe("a caller that models no profile gets exactly the old behaviour", () => {
  it("treats every entry as applicable when no resolver is supplied", () => {
    const result = selectAcrossLists({
      authority: syntheticAuthority({
        lists: [{ listName: "default", actions: [`mutilate,if=${FALSE_COND}`, "envenom"] }],
      }),
      entryListName: "default",
      bindings: BINDINGS,
      usabilityFor: (action) => (action.actionToken === "envenom" ? provenUsable() : unknownUsability()),
    });
    expect(result.kind).toBe("SELECTED");
    for (const step of result.steps) {
      expect(step.applicability.kind).toBe("APPLICABLE");
      // No verdict is fabricated for a step nobody asked a negative about.
      expect(step.outcome).not.toBe("NOT_APPLICABLE_CONTINUE");
      expect(step.outcome).not.toBe("PROVEN_UNUSABLE_CONTINUE");
    }
  });
});

describe("applicability and usability cross list boundaries intact", () => {
  it("skips decided entries inside a called list and resumes in the caller", () => {
    const result = traverse(
      [
        { listName: "default", actions: ["call_action_list,name=child", "envenom"] },
        { listName: "child", actions: [`mutilate,if=${UNSUPPORTED_COND}`, `rupture,if=${UNSUPPORTED_COND}`] },
      ],
      {
        notApplicableTokens: ["mutilate"],
        unusableTokens: ["rupture"],
        usableTokens: ["envenom"],
      },
    );
    // Both callee entries were decided without their unsupported conditions
    // being read, the call returned nothing, and the scan resumed below it.
    expect(result.kind).toBe("SELECTED");
    if (result.kind !== "SELECTED") return;
    expect(result.actionToken).toBe("envenom");
    expect(labels(result)).toEqual([
      "call_action_list CALL_RETURNED_NO_ACTION_CONTINUE",
      "mutilate NOT_APPLICABLE_CONTINUE",
      "rupture PROVEN_UNUSABLE_CONTINUE",
      "envenom SELECTED",
    ]);
  });

  it("propagates an unknown applicability out of a called list", () => {
    const result = traverse(
      [
        { listName: "default", actions: ["call_action_list,name=child", "envenom"] },
        { listName: "child", actions: ["blood_fury"] },
      ],
      { unknownApplicabilityTokens: ["blood_fury"], usableTokens: ["envenom"] },
    );
    expect(result.kind).toBe("UNKNOWN");
    if (result.kind !== "UNKNOWN") return;
    expect(result.blocker).toBe("APPLICABILITY_NOT_ESTABLISHED");
    expect(result.blockedAt?.listName).toBe("child");
  });
});
