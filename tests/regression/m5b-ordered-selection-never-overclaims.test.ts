import { describe, expect, it } from "vitest";

import { selectAssassinationSpendAction } from "../../src/specs/rogue/assassination/evaluator.js";
import { evaluateAssassinationEnvenom } from "../../src/specs/rogue/assassination/evaluator.js";
import { ACTIONABILITY_STATUSES } from "../../src/findings/actionability.js";
import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";
import { parseSimcExpression } from "../../src/simc/expression/parse.js";
import { evaluateSimcExpression, knownNumber } from "../../src/simc/expression/evaluate.js";
import { DECISION_SCOPE_KINDS } from "../../src/findings/scoped-selection.js";
import type { Finding } from "../../src/findings/finding.js";
import {
  ASSASSINATION_ACTOR_A,
  ASSASSINATION_ACTOR_B,
  ENVENOM_SPELL_ID,
  M5A_EVENTS,
  findCast,
  m5aState,
  observedActionJudgmentOf,
  scopedSelectionOf,
} from "../support/m5a-fixture.js";

/**
 * THE LIMITS OF THE FIRST POSITIVE RESULT.
 *
 * M5-B makes an exact claim for the first time, and every test here exists to
 * stop that claim from being read as a larger one. A scoped selection says what
 * ONE sub-list selects. It does not say what the APL selects, what the player
 * should have done, or anything at all about actions other than the one named.
 */

const state = m5aState();
const scopedA = selectAssassinationSpendAction(state, { actorId: ASSASSINATION_ACTOR_A });
const scopedB = selectAssassinationSpendAction(state, { actorId: ASSASSINATION_ACTOR_B });

function allScopedFindings(): readonly Finding[] {
  const findings: Finding[] = [];
  for (const run of [scopedA, scopedB]) {
    if (run.outcome === "EVALUATED") findings.push(...run.findings);
  }
  return findings;
}

function scopedAt(actorId: number, reportTimeMs: number): Finding {
  const run = actorId === ASSASSINATION_ACTOR_A ? scopedA : scopedB;
  if (run.outcome !== "EVALUATED") throw new Error("run was not evaluated");
  const position = findCast(state, { actorId, reportTimeMs });
  const finding = run.findings.find((entry) => entry.decisionPoint.position === position);
  if (finding === undefined) throw new Error(`no scoped finding at ${reportTimeMs}`);
  return finding;
}

describe("a provably false entry gate is knowledge, not uncertainty", () => {
  // The real 3/7 Envenom. Both Darkest Night resolutions make the gate FALSE, so
  // the spend list was PROVABLY not entered.
  const selection = scopedSelectionOf(
    scopedAt(ASSASSINATION_ACTOR_B, M5A_EVENTS.envenomAtThree.reportTimeMs),
  );

  it("reports NOT_APPLICABLE with ENTRY_GATE_FALSE, never UNKNOWN", () => {
    // Reporting a proof as a shortfall would be the same conflation that
    // NO_AUTHORITY_AVAILABLE and UNKNOWN exist to prevent one level up: we know
    // exactly what happened here, and a reader must be able to tell that from a
    // case where we do not.
    expect(selection.status).toBe("NOT_APPLICABLE");
    if (selection.status !== "NOT_APPLICABLE") return;
    expect(selection.reason).toBe("ENTRY_GATE_FALSE");
    expect(selection).not.toHaveProperty("blocker");
  });

  it("carries the proof that the gate was false under every resolution", () => {
    if (selection.status !== "NOT_APPLICABLE") return;
    expect(selection.gateTrace.aggregate).toBe("FALSE");
    expect(selection.gateTrace.aggregateRule).toBe("INVARIANT_ACROSS_WORLDS");
    expect(selection.gateTrace.worlds.map((world) => world.result)).toEqual(["FALSE", "FALSE"]);
  });

  it("selects nothing and names nothing", () => {
    expect(selection).not.toHaveProperty("selectedAction");
    expect(selection).not.toHaveProperty("selectingLine");
    // NOT the same as NO_ACTION_SELECTED, which means the list WAS entered.
    expect(selection.status).not.toBe("NO_ACTION_SELECTED");
  });

  it("is counted as applicability, not as an unknown", () => {
    if (scopedB.outcome !== "EVALUATED") return;
    expect(scopedB.coverage.notApplicable).toBe(1);
    expect(scopedB.coverage.scopedUnknownByBlocker).toEqual([]);
    expect(scopedB.coverage.selectedByAuthority).toBe(0);
    expect(scopedB.coverage.noActionSelected).toBe(0);
  });
});

describe("an undecided entry gate is UNKNOWN, not NOT_APPLICABLE", () => {
  it.each([
    ["5 of 7", M5A_EVENTS.envenomAtFive.reportTimeMs],
    ["6 of 7", M5A_EVENTS.envenomAtSix.reportTimeMs],
  ])("%s blocks on UNRESOLVED_AUTHORITY_STATE at the gate", (_label, reportTimeMs) => {
    // Darkest Night genuinely decides the gate here. We do not know whether the
    // list was entered, so we cannot say it was not.
    const selection = scopedSelectionOf(scopedAt(ASSASSINATION_ACTOR_A, reportTimeMs));
    expect(selection.status).toBe("UNKNOWN");
    if (selection.status !== "UNKNOWN") return;
    expect(selection.blocker).toBe("UNRESOLVED_AUTHORITY_STATE");
    expect(selection.blockedBy?.priorityOrdinal).toBe(8);
    expect(selection.gateTrace?.aggregateRule).toBe("WORLDS_DISAGREE");
  });
});

describe("a real FALSE | UNKNOWN_STATE line stays possible rather than firing", () => {
  // The 7/7 cast at 147/250 Energy = 58.8%. `energy.pct>70` is FALSE, but
  // `fight_remains<15` is an unknown magnitude, so spend[1] is UNDECIDED rather
  // than eliminated — and the walk therefore reaches the unparseable spend[2].
  const selection = scopedSelectionOf(
    scopedAt(ASSASSINATION_ACTOR_A, M5A_EVENTS.envenomAtSeven.reportTimeMs),
  );

  it("does not select, and says the parser is what stopped it", () => {
    expect(selection.status).toBe("UNKNOWN");
    if (selection.status !== "UNKNOWN") return;
    expect(selection.blocker).toBe("UNSUPPORTED_AUTHORITY_EXPRESSION");
    expect(selection.blockedBy?.priorityOrdinal).toBe(2);
  });

  it("does not eliminate spend[1] merely because its energy half is false", () => {
    if (selection.status !== "UNKNOWN") return;
    const line = selection.lines.find((entry) => entry.priorityOrdinal === 1);
    expect(line?.outcome).toBe("POSSIBLE");
    if (line?.condition.kind !== "EVALUATED") return;
    expect(line.condition.truth).toBe("UNKNOWN_STATE");
  });

  it("does not report NO_ACTION_SELECTED with a possible winner outstanding", () => {
    expect(selection.status).not.toBe("NO_ACTION_SELECTED");
  });
});

describe("a scoped selection never becomes a global verdict", () => {
  it("has exactly one decision scope kind, and it is not global", () => {
    expect([...DECISION_SCOPE_KINDS]).toEqual(["APL_SUBLIST"]);
  });

  it("declares no GLOBAL vocabulary anywhere in a scoped result", () => {
    for (const finding of allScopedFindings()) {
      expect(JSON.stringify(finding).toUpperCase()).not.toContain("GLOBAL");
    }
  });

  it("claims nothing about correctness, optimality or a match", () => {
    for (const finding of allScopedFindings()) {
      const serialized = JSON.stringify(finding).toUpperCase();
      for (const forbidden of ["CORRECT", "OPTIMAL", "IDEAL", "MATCH", "APPROVED", "MISTAKE"]) {
        expect(serialized, `${finding.findingId} claims ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("carries no confidence, severity or score", () => {
    for (const finding of allScopedFindings()) {
      expect(finding).not.toHaveProperty("confidence");
      expect(finding).not.toHaveProperty("severity");
      expect(finding).not.toHaveProperty("score");
      expect(finding).not.toHaveProperty("suppression");
      // The judgment union is the single source of the verdict.
      expect(finding).not.toHaveProperty("status");
      expect(finding).not.toHaveProperty("blocker");
    }
  });

  it("always names the sub-list it is scoped to", () => {
    for (const finding of allScopedFindings()) {
      const selection = scopedSelectionOf(finding);
      if (selection.status === "NO_AUTHORITY_AVAILABLE") continue;
      if (selection.status === "UNKNOWN" && selection.scope === null) continue;
      expect(selection.scope?.kind).toBe("APL_SUBLIST");
      expect(selection.scope?.listName).toBe("spend");
    }
  });
});

describe("observed execution proves actionability for ONE ability only", () => {
  const finding = scopedAt(ASSASSINATION_ACTOR_A, M5A_EVENTS.envenomAtSevenFullEnergy.reportTimeMs);

  it("names exactly the observed ability, numerically", () => {
    expect(finding.actionability.status).toBe("PROVEN_ACTIONABLE_BY_OBSERVED_EXECUTION");
    if (finding.actionability.status !== "PROVEN_ACTIONABLE_BY_OBSERVED_EXECUTION") return;
    expect(finding.actionability.abilityGameId).toBe(ENVENOM_SPELL_ID);
    expect(finding.actionability.abilityGameId).toBe(finding.decisionPoint.abilityGameId);
  });

  it("mentions no other ability id anywhere in the actionability record", () => {
    const serialized = JSON.stringify(finding.actionability);
    for (const otherAbility of [1329, 27576, 703, 1943, 8676]) {
      expect(serialized).not.toContain(String(otherAbility));
    }
  });

  it("is anchored to the exact observed cast, not to the decision point at large", () => {
    if (finding.actionability.status !== "PROVEN_ACTIONABLE_BY_OBSERVED_EXECUTION") return;
    expect(finding.actionability.position).toBe(finding.decisionPoint.position);
    expect(finding.actionability.locator).toEqual(finding.decisionPoint.locator);
    expect(finding.actionability.locator.rawType).toBe("cast");
  });

  it("has no negative counterpart to infer into", () => {
    // Absence of an observed cast is not evidence of unavailability. There is no
    // member that could express it.
    expect([...ACTIONABILITY_STATUSES]).toEqual(["NOT_EVALUATED", "PROVEN_ACTIONABLE_BY_OBSERVED_EXECUTION"]);
  });

  it("does not let the selected action's usability leak onto other lines", () => {
    const selection = scopedSelectionOf(finding);
    if (selection.status !== "SELECTED_BY_AUTHORITY") return;
    // Every line in the real spend list IS envenom, so all are proven usable
    // here. What matters is that usability is decided per line from identity,
    // never granted wholesale.
    for (const line of selection.lines) {
      expect(["PROVEN_USABLE", "UNKNOWN"]).toContain(line.usability);
    }
  });

  it("stores no second evidence-bearing copy inside the selection itself", () => {
    // One canonical record, on the finding. A duplicate inside the judgment
    // could drift from it.
    const selection = scopedSelectionOf(finding);
    expect(selection).not.toHaveProperty("actionability");
    expect(JSON.stringify(selection)).not.toContain("PROVEN_ACTIONABLE_BY_OBSERVED_EXECUTION");
  });
});

describe("M5-A is completely unaffected by M5-B", () => {
  const m5a = evaluateAssassinationEnvenom(state, { actorId: ASSASSINATION_ACTOR_B });

  it("still rejects the real 3/7 Envenom", () => {
    if (m5a.outcome !== "EVALUATED") return;
    const finding = m5a.findings[0];
    if (finding === undefined) return;
    expect(observedActionJudgmentOf(finding).status).toBe("REJECTED_BY_AUTHORITY");
  });

  it("keeps the M5-A finding id format byte-for-byte", () => {
    if (m5a.outcome !== "EVALUATED") return;
    const finding = m5a.findings[0];
    if (finding === undefined) return;
    expect(finding.findingId).toBe(`rogue/assassination:ROTATION:${String(finding.decisionPoint.position)}`);
    expect(finding.findingId).not.toContain("SCOPED_ACTION_SELECTION");
  });

  it("keeps M5-A actionability at the explicit NOT_EVALUATED", () => {
    if (m5a.outcome !== "EVALUATED") return;
    for (const finding of m5a.findings) {
      expect(finding.actionability).toEqual({ status: "NOT_EVALUATED" });
    }
  });

  it("emits the two families into separate runs, never one merged stream", () => {
    if (m5a.outcome !== "EVALUATED" || scopedB.outcome !== "EVALUATED") return;
    for (const finding of m5a.findings) {
      expect(finding.judgment.kind).toBe("OBSERVED_ACTION_JUDGMENT");
    }
    for (const finding of scopedB.findings) {
      expect(finding.judgment.kind).toBe("SCOPED_ACTION_SELECTION");
    }
    // Same decision point, two different findings, two different ids.
    const position = findCast(state, M5A_EVENTS.envenomAtThree);
    const fromA = m5a.findings.find((f) => f.decisionPoint.position === position);
    const fromB = scopedB.findings.find((f) => f.decisionPoint.position === position);
    expect(fromA?.findingId).not.toBe(fromB?.findingId);
  });

  it("keeps the two coverage shapes structurally distinct", () => {
    if (m5a.outcome !== "EVALUATED" || scopedB.outcome !== "EVALUATED") return;
    expect(m5a.coverage).toHaveProperty("observedEnvenomCastsInScope");
    expect(m5a.coverage).not.toHaveProperty("scopedSelectionDecisionPoints");
    expect(scopedB.coverage).toHaveProperty("scopedSelectionDecisionPoints");
    expect(scopedB.coverage).not.toHaveProperty("observedEnvenomCastsInScope");
    expect(scopedB.coverage).not.toHaveProperty("rejectedByAuthority");
  });
});

describe("the global-selection non-goal, pinned against the real default list", () => {
  const loaded = pinnedAssassinationAuthority();

  function defaultLine(priorityOrdinal: number) {
    if (!loaded.ok) throw new Error("the pinned authority must load");
    const lookup = loaded.authority.actionsInList("default");
    if (!lookup.found) throw new Error("the pinned authority must contain a default list");
    const action = lookup.actions.find((entry) => entry.priorityOrdinal === priorityOrdinal);
    if (action === undefined) throw new Error(`no default[${String(priorityOrdinal)}]`);
    return action;
  }

  it("now PARSES the generate call condition, which `>` used to refuse", () => {
    // Before M5-B this string was refused for using `>`. It is supported now, so
    // the old refusal no longer demonstrates fail-closed behaviour — which is
    // why the tests that relied on it were re-pointed rather than deleted.
    const generate = defaultLine(7);
    expect(generate.callsListName).toBe("generate");
    const parsed = parseSimcExpression(generate.conditionRaw ?? "");
    expect(parsed.ok).toBe(true);
  });

  it("evaluates the generate gate FALSE at 7/7 under BOTH Darkest Night worlds", () => {
    // At full combo points neither disjunct can hold: `combo_points<5` is false,
    // and `combo_points.deficit>0` is false at deficit 0. So the generator list
    // is provably not entered — the one `default` entry above `spend` that M5-B
    // can actually resolve.
    const generate = defaultLine(7);
    const condition = generate.conditionRaw ?? "";
    const parsed = parseSimcExpression(condition);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const evaluated = evaluateSimcExpression(parsed.ast, condition, {
      comboPoints: 7,
      comboPointsDeficit: 0,
      energyPct: knownNumber(100),
      knownBuffs: [],
    });
    expect(evaluated.outcome).toBe("RESOLVED");
    if (evaluated.outcome !== "RESOLVED") return;
    expect(evaluated.value).toBe(false);
    expect(evaluated.trace.aggregateRule).toBe("INVARIANT_ACROSS_WORLDS");
    expect(evaluated.trace.worlds.map((world) => world.result)).toEqual(["FALSE", "FALSE"]);
  });

  it("still cannot evaluate the higher-priority default entries", () => {
    // Resolving `generate` does NOT bring a global verdict within reach. These
    // are the blockers that remain, each for a different reason, and M5-B solves
    // none of them.
    //
    //   default[0] stealth            unconditional; action readiness unmodelled
    //   default[1] kick               unconditional; interruptibility unmodelled
    //   default[2] variable           an assignment, not an action
    //   default[6] call core_dot      UNCONDITIONAL, so always entered
    for (const ordinal of [0, 1, 2, 6]) {
      expect(defaultLine(ordinal).conditionRaw, `default[${String(ordinal)}] gained a condition`).toBeNull();
    }
    expect(defaultLine(6).callsListName).toBe("core_dot");

    //   default[3] thistle_tea        parses now, but fight_remains is unknowable
    const thistleTea = parseSimcExpression(defaultLine(3).conditionRaw ?? "");
    expect(thistleTea.ok).toBe(true);
    if (thistleTea.ok) {
      const evaluated = evaluateSimcExpression(thistleTea.ast, defaultLine(3).conditionRaw ?? "", {
        comboPoints: 7,
        comboPointsDeficit: 0,
        energyPct: knownNumber(100),
        knownBuffs: [],
      });
      // energy.pct<30 is FALSE at 100%, and FALSE | UNKNOWN_STATE stays unknown.
      expect(evaluated.outcome).toBe("UNRESOLVED");
    }

    //   default[4] ambush   PARSES since M5-C2, but is not a global verdict
    //
    // RE-POINTED for M5-C2. `stealthed.rogue`, `talent.<name>` and
    // `variable.single_target` became supported atoms, so this line parses now.
    // That is the milestone's point and it does NOT weaken this test's claim:
    // parsing one higher-priority line is not a global selection, and M5-C2
    // still evaluates none of the other blockers below.
    const ambush = parseSimcExpression(defaultLine(4).conditionRaw ?? "");
    expect(ambush.ok, "default[4] should parse since M5-C2").toBe(true);

    //   default[5] cds     still outside the supported subset
    // `buff.scent_of_blood.stack` is a stack reference, which remains refused
    // even though the `variable.` and `talent.` conjuncts around it now parse.
    const cds = parseSimcExpression(defaultLine(5).conditionRaw ?? "");
    expect(cds.ok, "default[5] became evaluable").toBe(false);
  });

  it("does not turn a parsed default[4] into a global Ambush claim", () => {
    // The specific overclaim M5-C2 could invite. `default[4]` parsing means the
    // Ambush GATE is evaluable at a decision point; it does not mean the APL
    // selects Ambush, and nothing in M5-B or M5-C2 produces a global selection.
    if (!loaded.ok) return;
    const lookup = loaded.authority.actionsInList("default");
    if (!lookup.found) return;

    // Still no global traversal exists to be fooled: the scoped walk refuses to
    // leave its own list, and `default` is not a list M5-B ever selects within.
    const nested = lookup.actions.filter((action) => action.callsListName !== null);
    expect(nested.length).toBeGreaterThan(0);
  });

  it("cannot evaluate the core_dot list that is unconditionally entered above spend", () => {
    if (!loaded.ok) return;
    const coreDot = loaded.authority.actionsInList("core_dot");
    expect(coreDot.found).toBe(true);
    if (!coreDot.found) return;
    expect(coreDot.actions.length).toBeGreaterThan(0);
    for (const action of coreDot.actions) {
      const parsed = parseSimcExpression(action.conditionRaw ?? "");
      expect(parsed.ok, `core_dot[${String(action.priorityOrdinal)}] became evaluable`).toBe(false);
    }
  });
});
