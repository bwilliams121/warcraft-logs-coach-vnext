import { describe, expect, it } from "vitest";

import { selectAssassinationSpendAction } from "../../src/specs/rogue/assassination/evaluator.js";
import type { Finding } from "../../src/findings/finding.js";
import {
  ASSASSINATION_ACTOR_A,
  ENVENOM_SPELL_ID,
  M5A_EVENTS,
  M5A_FIXTURE_PROVENANCE,
  findCast,
  m5aState,
  scopedSelectionOf,
} from "../support/m5a-fixture.js";

/**
 * THE FIRST EXACT POSITIVE CONCLUSION THIS ANALYZER MAKES.
 *
 * A real Assassination Rogue cast Envenom holding 7 of 7 combo points with
 * Energy at 250 of 250. The pinned SimulationCraft APL reaches Envenom through
 * exactly one path — `default[8]`'s conditional call to `spend` — and at full
 * combo points that gate is TRUE under BOTH Darkest Night resolutions:
 *
 *     DN = false  ->  (!false & 7>=5) | (false & 0=0)  ->  true  | false -> TRUE
 *     DN = true   ->  (!true  & 7>=5) | (true  & 0=0)  ->  false | true  -> TRUE
 *
 * So the list IS entered. Inside it:
 *
 *     spend[0]  envenom,if=buff.envenom.remains<=1|buff.deathmark.up
 *               the aura duration is an unknown magnitude, so the DN-false world
 *               is undecided -> POSSIBLE, token envenom
 *
 *     spend[1]  envenom,if=energy.pct>70|fight_remains<15
 *               100 > 70 is TRUE, and TRUE | UNKNOWN_STATE = TRUE regardless of
 *               how long the fight had left -> condition TRUE
 *               the observed COMPLETE Envenom proves the action was usable
 *               -> DEFINITE_WINNER
 *
 * Either spend[0] fires or spend[1] does. Both are Envenom. So the SELECTED
 * ACTION is exact even though the selecting LINE is not, and spend[2] — which
 * this analyzer cannot parse — is never reached.
 *
 * WHAT THIS IS NOT. It is not a claim that Envenom was the globally ideal
 * action: higher-priority `default` entries are unevaluated, and several are
 * unevaluable. It is not a claim that the player played correctly. It is not a
 * claim about any other action's availability. The scope field says so
 * structurally, and `m5b-ordered-selection-never-overclaims.test.ts` holds the
 * line.
 */

const state = m5aState();
const run = selectAssassinationSpendAction(state, { actorId: ASSASSINATION_ACTOR_A });

function findingAt(reportTimeMs: number): Finding {
  if (run.outcome !== "EVALUATED") throw new Error("run was not evaluated");
  const position = findCast(state, { actorId: ASSASSINATION_ACTOR_A, reportTimeMs });
  const finding = run.findings.find((entry) => entry.decisionPoint.position === position);
  if (finding === undefined) throw new Error(`no scoped finding for the cast at ${reportTimeMs}`);
  return finding;
}

describe.each([
  ["at 100% Energy (250 of 250)", M5A_EVENTS.envenomAtSevenFullEnergy.reportTimeMs, 250, 100],
  ["at 93.2% Energy (233 of 250)", M5A_EVENTS.envenomAtSevenHighEnergy.reportTimeMs, 233, 93.2],
])("the spend sub-list selects Envenom %s", (_label, reportTimeMs, amount, percent) => {
  const finding = findingAt(reportTimeMs);
  const selection = scopedSelectionOf(finding);

  it("selects by authority", () => {
    expect(selection.status).toBe("SELECTED_BY_AUTHORITY");
  });

  it("names the action by SimulationCraft token AND numeric game id", () => {
    if (selection.status !== "SELECTED_BY_AUTHORITY") return;
    expect(selection.selectedAction).toEqual({ simcToken: "envenom", abilityGameId: ENVENOM_SPELL_ID });
    // The id comes from runtime game data, never from the authority string.
    expect(selection.selectingLine.actionStringVerbatim).not.toContain(String(ENVENOM_SPELL_ID));
  });

  it("is scoped to the spend sub-list, entered through default[8]", () => {
    if (selection.status !== "SELECTED_BY_AUTHORITY") return;
    expect(selection.scope.kind).toBe("APL_SUBLIST");
    expect(selection.scope.listName).toBe("spend");
    expect(selection.scope.entryGate.listName).toBe("default");
    expect(selection.scope.entryGate.priorityOrdinal).toBe(8);
    expect(selection.scope.entryGate.actionStringVerbatim).toBe(
      "call_action_list,name=spend,if=!buff.darkest_night.up&combo_points>=5|buff.darkest_night.up&combo_points.deficit=0",
    );
  });

  it("proves the gate was TRUE under every Darkest Night resolution", () => {
    if (selection.status !== "SELECTED_BY_AUTHORITY") return;
    expect(selection.gateTrace.aggregate).toBe("TRUE");
    expect(selection.gateTrace.aggregateRule).toBe("INVARIANT_ACROSS_WORLDS");
    expect(selection.gateTrace.worlds).toHaveLength(2);
    expect(selection.gateTrace.worlds.map((world) => world.result)).toEqual(["TRUE", "TRUE"]);
  });

  it("selects on spend[1] and converges over spend[0] and spend[1]", () => {
    if (selection.status !== "SELECTED_BY_AUTHORITY") return;
    expect(selection.selectingLine.listName).toBe("spend");
    expect(selection.selectingLine.priorityOrdinal).toBe(1);
    expect(selection.selectingLine.actionStringVerbatim).toBe("envenom,if=energy.pct>70|fight_remains<15");
    expect(selection.convergedOver.map((ref) => ref.priorityOrdinal)).toEqual([0, 1]);
    // Every converged line names the SAME action. That is what makes the answer
    // exact despite the line being uncertain.
    expect(new Set(selection.lines.map((line) => line.actionToken))).toEqual(new Set(["envenom"]));
  });

  it("leaves spend[0] possible rather than deciding it", () => {
    if (selection.status !== "SELECTED_BY_AUTHORITY") return;
    const first = selection.lines.find((line) => line.priorityOrdinal === 0);
    expect(first?.outcome).toBe("POSSIBLE");
    expect(first?.condition.kind).toBe("EVALUATED");
    if (first?.condition.kind !== "EVALUATED") return;
    expect(first.condition.truth).toBe("UNKNOWN_STATE");
    // Because the aura DURATION is an unknown magnitude, not because the buff
    // was assumed absent.
    const remains = first.condition.trace.atoms.find((atom) => atom.key === "buff.envenom.remains");
    expect(remains?.binding).toBe("UNKNOWN_NUMBER");
  });

  it("never evaluates spend[2], which it cannot parse", () => {
    if (selection.status !== "SELECTED_BY_AUTHORITY") return;
    expect(selection.lines).toHaveLength(2);
    expect(selection.lines.some((line) => line.priorityOrdinal === 2)).toBe(false);
  });

  it("records the exact Energy observation the percentage came from", () => {
    if (selection.status !== "SELECTED_BY_AUTHORITY") return;
    const energy = selection.observedState.find((entry) => entry.resourceId === "ENERGY");
    expect(energy).toEqual({
      resourceId: "ENERGY",
      wireType: 3,
      observedAmount: amount,
      observedMax: 250,
      derivedDeficit: 250 - amount,
      timing: "PRE_COST",
    });
    // The percentage itself, recomputed from the recorded pair.
    expect(((energy?.observedAmount ?? 0) / (energy?.observedMax ?? 1)) * 100).toBeCloseTo(percent, 10);
  });

  it("records the exact combo-point observation alongside it", () => {
    if (selection.status !== "SELECTED_BY_AUTHORITY") return;
    expect(selection.observedState.find((entry) => entry.resourceId === "COMBO_POINTS")).toEqual({
      resourceId: "COMBO_POINTS",
      wireType: 4,
      observedAmount: 7,
      observedMax: 7,
      derivedDeficit: 0,
      timing: "PRE_COST",
    });
  });

  it("cites the pinned authority by commit and source hash", () => {
    if (selection.status !== "SELECTED_BY_AUTHORITY") return;
    expect(selection.authority.ref.kind).toBe("SIMC_APL");
    expect(selection.authority.provenance.commitSha).toMatch(/^[0-9a-f]{40}$/);
    expect(selection.authority.provenance.sourcePath).toBe("engine/class_modules/apl/apl_rogue.cpp");
    expect(selection.authority.provenance.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("attaches actionability for Envenom alone, at this exact position", () => {
    expect(finding.actionability).toEqual({
      status: "PROVEN_ACTIONABLE_BY_OBSERVED_EXECUTION",
      abilityGameId: ENVENOM_SPELL_ID,
      position: finding.decisionPoint.position,
      locator: finding.decisionPoint.locator,
    });
  });

  it("carries a finding id distinct from the M5-A id at the same position", () => {
    expect(finding.findingId).toContain("SCOPED_ACTION_SELECTION");
    expect(finding.findingId).toContain("spend");
    expect(finding.findingId).not.toBe(
      `rogue/assassination:ROTATION:${String(finding.decisionPoint.position)}`,
    );
  });

  it("references evidence by locator and copies no event", () => {
    expect(finding.evidence.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(finding);
    expect(serialized).not.toContain("classResources");
    expect(serialized).not.toContain("attachedResources");
  });

  it("is version-scoped to the capture the fixture came from", () => {
    expect(state.fight.provenance.gameVersion).toBe(M5A_FIXTURE_PROVENANCE.gameVersion);
    expect(state.fight.provenance.logVersion).toBe(M5A_FIXTURE_PROVENANCE.logVersion);
  });
});

describe("the 93.2% case proves arithmetic rather than a cap special case", () => {
  const atCap = scopedSelectionOf(findingAt(M5A_EVENTS.envenomAtSevenFullEnergy.reportTimeMs));
  const belowCap = scopedSelectionOf(findingAt(M5A_EVENTS.envenomAtSevenHighEnergy.reportTimeMs));

  it("selects in both, and only one of them is at cap", () => {
    // An implementation that special-cased `amount == max` would pass the 100%
    // case and fail the 93.2% one. Both are real captured events.
    expect(atCap.status).toBe("SELECTED_BY_AUTHORITY");
    expect(belowCap.status).toBe("SELECTED_BY_AUTHORITY");
    if (atCap.status !== "SELECTED_BY_AUTHORITY") return;
    if (belowCap.status !== "SELECTED_BY_AUTHORITY") return;

    const capped = atCap.observedState.find((entry) => entry.resourceId === "ENERGY");
    const uncapped = belowCap.observedState.find((entry) => entry.resourceId === "ENERGY");
    expect(capped?.observedAmount).toBe(capped?.observedMax);
    expect(uncapped?.observedAmount).not.toBe(uncapped?.observedMax);
    expect(uncapped?.derivedDeficit).toBe(17);
  });
});

describe("the run discloses what it looked at", () => {
  it("evaluates rather than declining", () => {
    expect(run.outcome).toBe("EVALUATED");
  });

  it("counts scoped outcomes without conflating them", () => {
    if (run.outcome !== "EVALUATED") return;
    expect(run.coverage.listName).toBe("spend");
    expect(run.coverage.actorId).toBe(ASSASSINATION_ACTOR_A);
    // Six observed Envenom casts for this actor in the fixture; two of them
    // resolve to an exact selection and the rest to explicit UNKNOWNs.
    expect(run.coverage.scopedSelectionDecisionPoints).toBe(6);
    expect(run.coverage.selectedByAuthority).toBe(2);
    expect(run.coverage.noActionSelected).toBe(0);
    expect(run.coverage.notApplicable).toBe(0);
    expect(run.coverage.castCoverage).toBe("COMPLETE");
    expect(run.coverage.resourceCoverage).toBe("COMPLETE");
    expect(run.coverage.coverageIsIncomplete).toBe(false);
  });

  it("emits one finding per decision point, with no silent skips", () => {
    if (run.outcome !== "EVALUATED") return;
    expect(run.findings).toHaveLength(run.coverage.scopedSelectionDecisionPoints);
    const positions = run.findings.map((finding) => finding.decisionPoint.position);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it("never reports a count as a fight total", () => {
    if (run.outcome !== "EVALUATED") return;
    expect(Object.keys(run.coverage).join(" ")).not.toMatch(/total|all|every/i);
  });

  it("stays JSON-safe, with no Map, Set or undefined anywhere", () => {
    const walk = (value: unknown, path: string): void => {
      expect(value, `${path} is undefined`).not.toBeUndefined();
      expect(value, `${path} is a Map`).not.toBeInstanceOf(Map);
      expect(value, `${path} is a Set`).not.toBeInstanceOf(Set);
      if (Array.isArray(value)) {
        value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
        return;
      }
      if (typeof value === "object" && value !== null) {
        for (const [key, entry] of Object.entries(value)) walk(entry, `${path}.${key}`);
      }
    };
    walk(run, "run");
    expect(JSON.parse(JSON.stringify(run))).toEqual(run);
  });
});
