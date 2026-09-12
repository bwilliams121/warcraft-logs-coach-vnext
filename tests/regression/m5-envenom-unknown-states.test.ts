import { describe, expect, it } from "vitest";

import { evaluateAssassinationEnvenom } from "../../src/specs/rogue/assassination/evaluator.js";
import type { Finding } from "../../src/findings/finding.js";
import { ASSASSINATION_ACTOR_A, M5A_EVENTS, findCast, m5aState } from "../support/m5a-fixture.js";

/**
 * The UNKNOWN states, all on real captured Envenom casts.
 *
 * Each is a different reason the analyzer declines, and the distinction is the
 * point — "we could not tell" is only useful when it says which thing was
 * missing.
 *
 *     5/7 and 6/7   the gate's value genuinely depends on Darkest Night
 *     7/7           the gate is satisfiable, and that is not a positive verdict
 *     no type-4     the observation is absent, which is not zero combo points
 */

const state = m5aState();
const run = evaluateAssassinationEnvenom(state, { actorId: ASSASSINATION_ACTOR_A });

function findingAt(reportTimeMs: number): Finding {
  if (run.outcome !== "EVALUATED") throw new Error("run was not evaluated");
  const position = findCast(state, { actorId: ASSASSINATION_ACTOR_A, reportTimeMs });
  const finding = run.findings.find((entry) => entry.decisionPoint.position === position);
  if (finding === undefined) throw new Error(`no finding for the cast at ${reportTimeMs}`);
  return finding;
}

describe("every in-scope Envenom cast produces exactly one structured result", () => {
  it("evaluates the run", () => {
    expect(run.outcome).toBe("EVALUATED");
  });

  it("emits one finding per observed cast, with no silent skips", () => {
    if (run.outcome !== "EVALUATED") return;
    // The fixture holds four Envenom casts for this actor: 7/7, 6/7, 5/7 and
    // one whose snapshot omits combo points entirely.
    expect(run.findings).toHaveLength(4);
    expect(run.coverage.observedEnvenomCastsInScope).toBe(4);
    const positions = run.findings.map((finding) => finding.decisionPoint.position);
    expect(new Set(positions).size).toBe(4);
  });

  it("counts coverage without overclaiming completeness", () => {
    if (run.outcome !== "EVALUATED") return;
    expect(run.coverage.withExactPreCostComboPoints).toBe(3);
    expect(run.coverage.missingExactComboPoints).toBe(1);
    expect(run.coverage.rejectedByAuthority).toBe(0);
    expect(run.coverage.castCoverage).toBe("COMPLETE");
    expect(run.coverage.resourceCoverage).toBe("COMPLETE");
    expect(run.coverage.coverageIsIncomplete).toBe(false);
    // JSON-safe: an array of entries, never a Map.
    expect(Array.isArray(run.coverage.unknownByBlocker)).toBe(true);
    expect(JSON.parse(JSON.stringify(run.coverage))).toEqual(run.coverage);
  });
});

describe("a mid-range combo-point state stays UNKNOWN", () => {
  it.each([
    ["5 of 7", M5A_EVENTS.envenomAtFive.reportTimeMs, 5, 2],
    ["6 of 7", M5A_EVENTS.envenomAtSix.reportTimeMs, 6, 1],
  ])("%s resolves to UNRESOLVED_AUTHORITY_STATE", (_label, reportTimeMs, amount, deficit) => {
    const judgment = findingAt(reportTimeMs).judgment;
    expect(judgment.status).toBe("UNKNOWN");
    if (judgment.status !== "UNKNOWN") return;
    expect(judgment.blocker).toBe("UNRESOLVED_AUTHORITY_STATE");
    expect(judgment.observedState?.observedAmount).toBe(amount);
    expect(judgment.observedState?.derivedDeficit).toBe(deficit);

    // The two Darkest Night resolutions genuinely disagree here, which is
    // exactly why the answer is UNKNOWN rather than a branch we picked.
    expect(judgment.trace?.aggregate).toBe("UNRESOLVED");
    expect(judgment.trace?.aggregateRule).toBe("WORLDS_DISAGREE");
    expect(judgment.trace?.worlds.map((world) => world.result).sort()).toEqual([false, true]);
  });

  it("never resolves the disagreement by assuming Darkest Night is absent", () => {
    const judgment = findingAt(M5A_EVENTS.envenomAtSix.reportTimeMs).judgment;
    if (judgment.status !== "UNKNOWN") return;
    // The DN=false world evaluates TRUE at 6/7. Had the evaluator treated an
    // unobserved buff as inactive, this would have become a positive result.
    const withoutDarkestNight = judgment.trace?.worlds.find((world) =>
      world.assignment.some((entry) => entry.atom === "buff.darkest_night.up" && !entry.up),
    );
    expect(withoutDarkestNight?.result).toBe(true);
    expect(judgment.blocker).not.toBe("ANALYZER_SURFACE_INCOMPLETE");
  });
});

describe("a satisfiable gate is never a positive verdict", () => {
  const judgment = findingAt(M5A_EVENTS.envenomAtSeven.reportTimeMs).judgment;

  it("resolves 7/7 to UNKNOWN with ANALYZER_SURFACE_INCOMPLETE", () => {
    expect(judgment.status).toBe("UNKNOWN");
    if (judgment.status !== "UNKNOWN") return;
    expect(judgment.blocker).toBe("ANALYZER_SURFACE_INCOMPLETE");
    expect(judgment.observedState?.observedAmount).toBe(7);
    expect(judgment.observedState?.derivedDeficit).toBe(0);
    // The gate IS satisfiable under both resolutions...
    expect(judgment.trace?.aggregate).toBe("TRUE");
    expect(judgment.trace?.aggregateRule).toBe("INVARIANT_ACROSS_WORLDS");
  });

  it("...and that still does not establish the selected action", () => {
    // Reaching the spend list does not mean the APL reaches this line, nor that
    // Envenom's own conditions hold, nor that Envenom is what would be selected.
    const serialized = JSON.stringify(judgment).toUpperCase();
    for (const forbidden of ["CORRECT", "MATCH", "OPTIMAL", "APPROVED", "CONFIRMED"]) {
      expect(serialized, `judgment claims ${forbidden}`).not.toContain(forbidden);
    }
  });
});

describe("a missing combo-point observation is never zero", () => {
  const finding = findingAt(M5A_EVENTS.envenomWithoutComboPointEntry.reportTimeMs);

  it("resolves to UNKNOWN with EXACT_RESOURCE_UNAVAILABLE", () => {
    expect(finding.judgment.status).toBe("UNKNOWN");
    if (finding.judgment.status !== "UNKNOWN") return;
    expect(finding.judgment.blocker).toBe("EXACT_RESOURCE_UNAVAILABLE");
  });

  it("asserts no combo-point value at all", () => {
    if (finding.judgment.status !== "UNKNOWN") return;
    // This is a REAL captured Envenom that plainly happened — it carries an
    // Energy cost of 35 — whose snapshot simply omits the combo-point entry.
    // Reading that absence as "0 combo points" would manufacture the sharpest
    // possible false rejection, since 0 < 5 fails the gate under both
    // resolutions exactly like the genuine 3/7 case does.
    expect(finding.judgment.observedState).toBeNull();
    expect(finding.judgment.trace).toBeNull();
    expect(JSON.stringify(finding.judgment)).not.toContain("observedAmount");
  });

  it("is not counted as an exact observation", () => {
    if (run.outcome !== "EVALUATED") return;
    expect(run.coverage.missingExactComboPoints).toBe(1);
    expect(run.coverage.unknownByBlocker).toContainEqual({
      blocker: "EXACT_RESOURCE_UNAVAILABLE",
      count: 1,
    });
  });
});
