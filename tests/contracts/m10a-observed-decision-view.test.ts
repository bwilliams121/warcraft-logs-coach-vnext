/**
 * M10-A: the shared observed-decision view carries no specialization-specific
 * vocabulary, and its fields are exactly the public schema's.
 *
 * The view is the one shape shared projectors read. If it named an Envenom, a
 * combo point or a stealth state, shared orchestration would be pretending a
 * Rogue-specific payload is a universal analyzer result. Two proofs: a sweep
 * of the module's CODE for specialization tokens, and a runtime comparison of
 * the keys the Assassination adapter actually emits against the frozen
 * schema-v1 key sets.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CoverageSchema, DecisionSchema, ExclusionSchema } from "../../src/contracts/analysis-contract.js";
import { assassinationObservedDecisionView } from "../../src/specs/rogue/assassination/registration.js";
import { analyzeObservedAssassinationDecisions } from "../../src/specs/rogue/assassination/observed-analysis.js";
import { corpusState } from "../support/corpus/fight.js";

const MODULE = "src/findings/observed-decision-view.ts";

function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("the view module names no specialization concept", () => {
  const code = codeOf(MODULE);

  it.each([
    "envenom",
    "combo",
    "energy",
    "stealth",
    "garrote",
    "rupture",
    "kingsbane",
    "deathmark",
    "mutilate",
    "rogue",
    "assassination",
    "paladin",
    "holy",
    "mitigation",
    "dot",
    "bleed",
    "poison",
  ])("its code does not mention `%s`", (token) => {
    expect(code.toLowerCase()).not.toContain(token);
  });

  it("exports exactly the five view shapes and nothing else", () => {
    const exported = [...code.matchAll(/^export\s+(?:interface|type|const|function|class)\s+(\w+)/gm)].map(
      (match) => match[1],
    );
    expect(exported.sort()).toEqual(
      [
        "ExcludedCastRecord",
        "ObservedDecisionCoverageRecord",
        "ObservedDecisionRecord",
        "ObservedDecisionView",
        "ViewTally",
      ].sort(),
    );
  });

  it("imports only the evidence locator", () => {
    const specifiers = [...code.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
    expect(specifiers).toEqual(["../engine/evidence/locator.js"]);
  });
});

describe("the view's fields are exactly the public schema's", () => {
  const analysis = analyzeObservedAssassinationDecisions({
    state: corpusState("wcl-assassination-d2-decision-corpus"),
    actorId: 19,
    specId: "rogue/assassination",
    targetActorId: null,
  });
  if (analysis.status !== "ANALYZED") throw new Error("expected ANALYZED");
  const view = assassinationObservedDecisionView(analysis);

  it("is built from a real analysis with decisions and exclusions", () => {
    expect(view.decisions.length).toBeGreaterThan(0);
    expect(view.exclusions.length).toBeGreaterThan(0);
  });

  it("a decision record has the schema's decision keys, no more and no fewer", () => {
    for (const decision of view.decisions) {
      expect(Object.keys(decision).sort()).toEqual(Object.keys(DecisionSchema.shape).sort());
    }
  });

  it("an exclusion record has the schema's exclusion keys", () => {
    for (const exclusion of view.exclusions) {
      expect(Object.keys(exclusion).sort()).toEqual(Object.keys(ExclusionSchema.shape).sort());
    }
  });

  it("the coverage record has the schema's coverage keys", () => {
    expect(Object.keys(view.coverage).sort()).toEqual(Object.keys(CoverageSchema.shape).sort());
  });

  it("carries none of the withheld internals", () => {
    const serialized = JSON.stringify(view);
    for (const withheld of ["rawBlocker", "observedActionRejected", '"actorId"']) {
      expect(serialized).not.toContain(withheld);
    }
    // The Assassination-specific coverage counters stay in the payload.
    expect(serialized).not.toContain("observedEnvenomCastsInScope");
    expect(serialized).not.toContain("withExactPreCostComboPoints");
  });
});
