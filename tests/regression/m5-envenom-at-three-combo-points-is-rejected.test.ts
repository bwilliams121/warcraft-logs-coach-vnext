import { describe, expect, it } from "vitest";

import { evaluateAssassinationEnvenom } from "../../src/specs/rogue/assassination/evaluator.js";
import { parseSimcExpression } from "../../src/simc/expression/parse.js";
import { evaluateSimcExpression, unknownNumber } from "../../src/simc/expression/evaluate.js";
import {
  ASSASSINATION_ACTOR_B,
  ENVENOM_SPELL_ID,
  M5A_EVENTS,
  M5A_FIXTURE_PROVENANCE,
  findCast,
  m5aState,
} from "../support/m5a-fixture.js";

/**
 * THE FIRST EXACT M5 GAMEPLAY JUDGMENT.
 *
 * A real Assassination Rogue cast Envenom holding 3 of 7 combo points. The
 * pinned SimulationCraft Assassination APL reaches Envenom through exactly one
 * path — the `default` list's conditional call to `spend`:
 *
 *     !buff.darkest_night.up&combo_points>=5|buff.darkest_night.up&combo_points.deficit=0
 *
 * Darkest Night's state is NOT established. It does not need to be, because the
 * gate is false under BOTH resolutions:
 *
 *     DN = false  ->  (!false & 3>=5) | (false & 4=0)  ->  false | false  ->  FALSE
 *     DN = true   ->  (!true  & 3>=5) | (true  & 4=0)  ->  false | false  ->  FALSE
 *
 * A false gate means the `spend` list is never entered, whatever the higher-
 * priority lines above it do — so the observed Envenom is unreachable through
 * the authority's only path to it. That is REJECTED_BY_AUTHORITY.
 *
 * WHAT THIS VERDICT IS NOT. It does not identify what should have been cast
 * instead; the globally ideal action stays UNKNOWN. It does not evaluate
 * actionability. It is not a statement that the player made a mistake.
 */

const state = m5aState();
const run = evaluateAssassinationEnvenom(state, { actorId: ASSASSINATION_ACTOR_B });

describe("the real 3/7 Envenom is rejected by the pinned authority", () => {
  it("evaluates the run rather than declining it", () => {
    expect(run.outcome).toBe("EVALUATED");
  });

  it("produces exactly one judgment for the one in-scope Envenom cast", () => {
    if (run.outcome !== "EVALUATED") return;
    expect(run.findings).toHaveLength(1);
    expect(run.coverage.observedEnvenomCastsInScope).toBe(1);
    expect(run.coverage.rejectedByAuthority).toBe(1);
    expect(run.coverage.unknownByBlocker).toEqual([]);
  });

  it("rejects it, with no blocker", () => {
    if (run.outcome !== "EVALUATED") return;
    const judgment = run.findings[0]?.judgment;
    expect(judgment?.status).toBe("REJECTED_BY_AUTHORITY");
    // The union has no `blocker` on this branch at all — a rejection is a
    // verdict, not a failure to reach one.
    expect(judgment).not.toHaveProperty("blocker");
  });

  it("rests on the exact observed state, read from the cast itself", () => {
    if (run.outcome !== "EVALUATED") return;
    const judgment = run.findings[0]?.judgment;
    if (judgment?.status !== "REJECTED_BY_AUTHORITY") return;
    expect(judgment.observedState).toEqual({
      resourceId: "COMBO_POINTS",
      wireType: 4,
      observedAmount: 3,
      observedMax: 7,
      derivedDeficit: 4,
      timing: "PRE_COST",
    });
  });

  it("proves the rejection across both Darkest Night resolutions", () => {
    if (run.outcome !== "EVALUATED") return;
    const judgment = run.findings[0]?.judgment;
    if (judgment?.status !== "REJECTED_BY_AUTHORITY") return;

    expect(judgment.trace.aggregate).toBe("FALSE");
    expect(judgment.trace.aggregateRule).toBe("INVARIANT_ACROSS_WORLDS");
    // Exactly two worlds: one unresolved boolean atom, enumerated both ways.
    expect(judgment.trace.worlds).toHaveLength(2);
    expect(judgment.trace.worlds.map((world) => world.result)).toEqual(["FALSE", "FALSE"]);
    expect(judgment.trace.worlds.map((world) => world.assignment)).toEqual([
      [{ atom: "buff.darkest_night.up", up: false }],
      [{ atom: "buff.darkest_night.up", up: true }],
    ]);
  });

  it("records Darkest Night as one unresolved atom, not two independent unknowns", () => {
    if (run.outcome !== "EVALUATED") return;
    const judgment = run.findings[0]?.judgment;
    if (judgment?.status !== "REJECTED_BY_AUTHORITY") return;

    const unresolved = judgment.trace.atoms.filter((atom) => atom.binding === "UNRESOLVED_BOOLEAN");
    // The condition references buff.darkest_night.up TWICE. One atom.
    expect(judgment.trace.expressionRaw.split("buff.darkest_night.up").length - 1).toBe(2);
    expect(unresolved).toEqual([
      {
        key: "buff.darkest_night.up",
        shape: "BOOLEAN",
        binding: "UNRESOLVED_BOOLEAN",
        value: null,
        unknownNumberReason: null,
      },
    ]);
  });

  it("cites the exact pinned authority line", () => {
    if (run.outcome !== "EVALUATED") return;
    const judgment = run.findings[0]?.judgment;
    if (judgment?.status !== "REJECTED_BY_AUTHORITY") return;

    expect(judgment.authority.ref.kind).toBe("SIMC_APL");
    expect(judgment.authority.ref.listName).toBe("default");
    expect(judgment.authority.ref.actionStringVerbatim).toBe(
      "call_action_list,name=spend,if=!buff.darkest_night.up&combo_points>=5|buff.darkest_night.up&combo_points.deficit=0",
    );
    expect(judgment.authority.provenance.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(judgment.authority.provenance.sourcePath).toBe("engine/class_modules/apl/apl_rogue.cpp");
    expect(judgment.authority.provenance.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("references evidence by locator and copies no event", () => {
    if (run.outcome !== "EVALUATED") return;
    const finding = run.findings[0];
    if (finding === undefined) return;

    const position = findCast(state, M5A_EVENTS.envenomAtThree);
    expect(finding.decisionPoint.position).toBe(position);
    expect(finding.decisionPoint.abilityGameId).toBe(ENVENOM_SPELL_ID);
    expect(finding.evidence.length).toBeGreaterThan(0);

    // No normalized event may be embedded: a finding holds references.
    const serialized = JSON.stringify(finding);
    expect(serialized).not.toContain("classResources");
    expect(serialized).not.toContain("attachedResources");
    expect(serialized).not.toContain('ingestionOrdinal":null');
    for (const locator of finding.evidence) {
      expect(locator.rawType).toBe("cast");
    }
  });

  it("does not present the rejection as a player mistake", () => {
    if (run.outcome !== "EVALUATED") return;
    const finding = run.findings[0];
    // M5-A gathers no environmental evidence, so actionability stays the
    // explicit NOT_EVALUATED. It is a structured value rather than a bare string
    // as of M5-B, and it must carry no evidence fields on this branch.
    expect(finding?.actionability).toEqual({ status: "NOT_EVALUATED" });
    expect(finding?.actionability).not.toHaveProperty("abilityGameId");

    const serialized = JSON.stringify(finding).toLowerCase();
    for (const forbidden of ["mistake", "error", "wrong", "should have", "severity", "score", "penalt"]) {
      expect(serialized, `finding mentions '${forbidden}'`).not.toContain(forbidden);
    }
  });

  it("is version-scoped to the capture the fixture came from", () => {
    expect(state.fight.provenance.gameVersion).toBe(M5A_FIXTURE_PROVENANCE.gameVersion);
    expect(state.fight.provenance.logVersion).toBe(M5A_FIXTURE_PROVENANCE.logVersion);
  });
});

describe("both Darkest Night resolutions reject the event independently", () => {
  const condition = "!buff.darkest_night.up&combo_points>=5|buff.darkest_night.up&combo_points.deficit=0";

  it.each([
    ["Darkest Night resolved FALSE", false],
    ["Darkest Night resolved TRUE", true],
  ])("%s still rejects 3 of 7", (_label, darkestNightUp) => {
    const parsed = parseSimcExpression(condition);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const evaluation = evaluateSimcExpression(parsed.ast, condition, {
      comboPoints: 3,
      comboPointsDeficit: 4,
      // The pinned gate mentions no energy or DoT duration; both are stated
      // explicitly, never omitted.
      energyPct: unknownNumber("STATE_NOT_ESTABLISHED"),
      dotRemainsSeconds: unknownNumber("STATE_NOT_ESTABLISHED"),
      knownBuffs: [{ name: "darkest_night", up: darkestNightUp }],
    });

    expect(evaluation.outcome).toBe("RESOLVED");
    if (evaluation.outcome !== "RESOLVED") return;
    expect(evaluation.value).toBe(false);
    // With the buff resolved there is nothing left to enumerate.
    expect(evaluation.trace.aggregateRule).toBe("NO_UNRESOLVED_ATOMS");
    expect(evaluation.trace.worlds).toHaveLength(1);
  });
});
