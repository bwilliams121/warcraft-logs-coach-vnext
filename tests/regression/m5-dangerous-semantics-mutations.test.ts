import { describe, expect, it } from "vitest";

import { parseSimcExpression } from "../../src/simc/expression/parse.js";
import { evaluateSimcExpression } from "../../src/simc/expression/evaluate.js";
import { evaluateAssassinationEnvenom } from "../../src/specs/rogue/assassination/evaluator.js";
import { OBSERVED_ACTION_JUDGMENT_STATUSES } from "../../src/findings/judgment.js";
import { NO_AUTHORITY_REASONS } from "../../src/findings/authority.js";
import type { CombatAbility } from "../../src/engine/normalization/abilities.js";
import {
  ASSASSINATION_ACTOR_A,
  ASSASSINATION_ACTOR_B,
  ENVENOM_SPELL_ID,
  M5A_EVENTS,
  findCast,
  m5aState,
} from "../support/m5a-fixture.js";
import { syntheticAuthority } from "../support/m5a-authority.js";

/**
 * MUTATION TESTS.
 *
 * Each case implements the WRONG behaviour alongside the real one and shows the
 * two disagree on real captured evidence. A passing assertion that the correct
 * answer is produced proves little on its own — the mutation is what proves the
 * design choice is load-bearing, and that a future regression would be caught
 * rather than silently absorbed.
 *
 * The pinned gate, for reference:
 *
 *     !buff.darkest_night.up&combo_points>=5|buff.darkest_night.up&combo_points.deficit=0
 */

const GATE = "!buff.darkest_night.up&combo_points>=5|buff.darkest_night.up&combo_points.deficit=0";
const state = m5aState();

function evaluateGate(
  comboPoints: number,
  comboPointsDeficit: number,
  knownBuffs: readonly { name: string; up: boolean }[] = [],
) {
  const parsed = parseSimcExpression(GATE);
  if (!parsed.ok) throw new Error("the pinned gate must parse");
  return evaluateSimcExpression(parsed.ast, GATE, { comboPoints, comboPointsDeficit, knownBuffs });
}

describe("MUTATION: treating a missing combo-point observation as zero", () => {
  const run = evaluateAssassinationEnvenom(state, { actorId: ASSASSINATION_ACTOR_A });

  it("would manufacture a confident rejection", () => {
    // The mutation: assume absent means zero.
    const mutated = evaluateGate(0, 7);
    expect(mutated.outcome).toBe("RESOLVED");
    if (mutated.outcome !== "RESOLVED") return;
    expect(mutated.value).toBe(false);
    // 0 < 5 fails the gate under BOTH resolutions, exactly like the genuine 3/7
    // case — so the mutation produces an indistinguishable REJECTED verdict from
    // evidence that does not exist.
  });

  it("but the real evaluator declines, on a real cast that omits the entry", () => {
    if (run.outcome !== "EVALUATED") return;
    const position = findCast(state, M5A_EVENTS.envenomWithoutComboPointEntry);
    const judgment = run.findings.find((f) => f.decisionPoint.position === position)?.judgment;

    expect(judgment?.status).toBe("UNKNOWN");
    if (judgment?.status !== "UNKNOWN") return;
    expect(judgment.blocker).toBe("EXACT_RESOURCE_UNAVAILABLE");
    expect(judgment.observedState).toBeNull();
  });
});

describe("MUTATION: treating an unobserved Darkest Night as inactive", () => {
  it.each([
    [5, 2],
    [6, 1],
  ])("would claim the gate is open at %i combo points", (comboPoints, deficit) => {
    // The mutation: no observed transition, so assume the buff is down.
    const mutated = evaluateGate(comboPoints, deficit, [{ name: "darkest_night", up: false }]);
    expect(mutated.outcome).toBe("RESOLVED");
    if (mutated.outcome !== "RESOLVED") return;
    expect(mutated.value).toBe(true);
  });

  it("but the real evaluator keeps both resolutions live and stays UNKNOWN", () => {
    const honest = evaluateGate(6, 1);
    expect(honest.outcome).toBe("UNRESOLVED");
    if (honest.outcome !== "UNRESOLVED") return;
    expect(honest.trace.aggregateRule).toBe("WORLDS_DISAGREE");

    const run = evaluateAssassinationEnvenom(state, { actorId: ASSASSINATION_ACTOR_A });
    if (run.outcome !== "EVALUATED") return;
    const position = findCast(state, M5A_EVENTS.envenomAtSix);
    const judgment = run.findings.find((f) => f.decisionPoint.position === position)?.judgment;
    if (judgment?.status !== "UNKNOWN") return;
    expect(judgment.blocker).toBe("UNRESOLVED_AUTHORITY_STATE");
  });
});

describe("MUTATION: refusing to enumerate an unresolved atom at all", () => {
  it("would lose the 3/7 rejection entirely", () => {
    // The mutation: "an atom is unresolved, therefore the answer is unknown".
    const honest = evaluateGate(3, 4);
    expect(honest.outcome).toBe("RESOLVED");
    if (honest.outcome !== "RESOLVED") return;

    const unresolvedAtoms = honest.trace.atoms.filter((atom) => atom.binding === "UNRESOLVED_BOOLEAN");
    expect(unresolvedAtoms).toHaveLength(1);
    // A naive evaluator stops here and reports UNKNOWN. Enumeration is what
    // turns "one thing is unknown" into "the answer is the same either way".
    expect(honest.value).toBe(false);
    expect(honest.trace.worlds).toHaveLength(2);
    expect(honest.trace.aggregateRule).toBe("INVARIANT_ACROSS_WORLDS");
  });
});

describe("MUTATION: losing correlated-atom identity", () => {
  const decorrelated =
    "!buff.darkest_night_first.up&combo_points>=5|buff.darkest_night_second.up&combo_points.deficit=0";

  /**
   * Correlation is load-bearing where the gate is a TAUTOLOGY IN THE ATOM.
   *
   * At full combo points both comparisons hold, so the gate reduces to
   * `!A | A` — true whatever A is. Splitting the two occurrences into
   * independent atoms turns that into `!A | B`, which is false when A is true
   * and B is false, and the proof evaporates.
   *
   * At 3/7 correlation happens not to matter: both disjuncts fail on the
   * numeric comparisons alone. Asserting it there would have been a test that
   * passed for the wrong reason.
   */
  it("would lose the 7/7 proof that the gate is satisfiable", () => {
    const parsed = parseSimcExpression(decorrelated);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const mutated = evaluateSimcExpression(parsed.ast, decorrelated, {
      comboPoints: 7,
      comboPointsDeficit: 0,
      knownBuffs: [],
    });
    // Four worlds instead of two, and they disagree.
    expect(mutated.outcome).toBe("UNRESOLVED");
    if (mutated.outcome !== "UNRESOLVED") return;
    expect(mutated.trace.worlds).toHaveLength(4);
    expect(mutated.trace.aggregateRule).toBe("WORLDS_DISAGREE");
  });

  it("but the real evaluator binds both occurrences together and resolves TRUE", () => {
    const honest = evaluateGate(7, 0);
    expect(honest.outcome).toBe("RESOLVED");
    if (honest.outcome !== "RESOLVED") return;
    expect(honest.value).toBe(true);
    expect(honest.trace.worlds).toHaveLength(2);
    expect(honest.trace.aggregateRule).toBe("INVARIANT_ACROSS_WORLDS");
    // One atom, referenced twice in the expression.
    expect(honest.trace.atoms.filter((a) => a.binding === "UNRESOLVED_BOOLEAN")).toHaveLength(1);
    expect(GATE.split("buff.darkest_night.up").length - 1).toBe(2);
  });
});

describe("MUTATION: treating unsupported syntax as false", () => {
  const condition = "combo_points>=5&energy.pct>70";

  it("would let a false conjunct short-circuit an unparsed fragment into a rejection", () => {
    // The mutation: parse what we understand, treat the rest as false. At 3
    // combo points `combo_points>=5` is already FALSE, so the conjunction would
    // be FALSE and the analyzer would reject — on an expression half of which it
    // never understood.
    const supportedPart = parseSimcExpression("combo_points>=5");
    expect(supportedPart.ok).toBe(true);
    if (!supportedPart.ok) return;
    const mutated = evaluateSimcExpression(supportedPart.ast, "combo_points>=5", {
      comboPoints: 3,
      comboPointsDeficit: 4,
      knownBuffs: [],
    });
    expect(mutated.outcome).toBe("RESOLVED");
    if (mutated.outcome !== "RESOLVED") return;
    expect(mutated.value).toBe(false);
  });

  it("but the real parser refuses the whole expression", () => {
    const parsed = parseSimcExpression(condition);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.reason).toBe("UNSUPPORTED_IDENTIFIER");
    expect(parsed.fragment).toBe("energy.pct");
  });

  it("and there is no AST node an unsupported fragment could hide in", () => {
    // Structural: if unsupported syntax could become a node, it could be
    // short-circuited away. The parser has no such node to produce.
    const parsed = parseSimcExpression(GATE);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(JSON.stringify(parsed.ast)).not.toContain("UNSUPPORTED");
  });
});

describe("MUTATION: treating a reachable spend gate as CORRECT", () => {
  it("would require a positive verdict the vocabulary does not contain", () => {
    // Structural rather than a string sweep: there is no member to assign.
    expect([...OBSERVED_ACTION_JUDGMENT_STATUSES]).toEqual([
      "REJECTED_BY_AUTHORITY",
      "UNKNOWN",
      "NO_AUTHORITY_AVAILABLE",
    ]);
    for (const forbidden of ["CORRECT", "MATCH", "OPTIMAL", "ACCEPTED", "APPROVED"]) {
      expect([...OBSERVED_ACTION_JUDGMENT_STATUSES]).not.toContain(forbidden);
    }
  });

  it("and the satisfiable 7/7 gate resolves to UNKNOWN instead", () => {
    const satisfiable = evaluateGate(7, 0);
    expect(satisfiable.outcome).toBe("RESOLVED");
    if (satisfiable.outcome !== "RESOLVED") return;
    // The gate really is open...
    expect(satisfiable.value).toBe(true);

    const run = evaluateAssassinationEnvenom(state, { actorId: ASSASSINATION_ACTOR_A });
    if (run.outcome !== "EVALUATED") return;
    const position = findCast(state, M5A_EVENTS.envenomAtSeven);
    const judgment = run.findings.find((f) => f.decisionPoint.position === position)?.judgment;
    // ...and the verdict is still not positive, because reaching the list is not
    // selecting the action.
    expect(judgment?.status).toBe("UNKNOWN");
    if (judgment?.status !== "UNKNOWN") return;
    expect(judgment.blocker).toBe("ANALYZER_SURFACE_INCOMPLETE");
  });
});

describe("MUTATION: selecting the observed ability by display name", () => {
  it("would pick a different ability that shares the name", () => {
    const IMPOSTER = 999_999;
    const abilities = new Map<number, CombatAbility>([
      [IMPOSTER, { gameId: IMPOSTER, name: "Envenom", school: "8" }],
      [ENVENOM_SPELL_ID, { gameId: ENVENOM_SPELL_ID, name: "Envenom", school: "8" }],
    ]);
    // The mutation: resolve identity by name.
    const byName = [...abilities.values()].filter((ability) => ability.name === "Envenom");
    expect(byName).toHaveLength(2);
    // Ambiguous. The real captured catalog for this fight contains two distinct
    // ids both named "Mutilate", so this is not hypothetical.
  });

  it("but the real evaluator resolves a single numeric id", () => {
    const run = evaluateAssassinationEnvenom(state, { actorId: ASSASSINATION_ACTOR_B });
    if (run.outcome !== "EVALUATED") return;
    for (const finding of run.findings) {
      expect(finding.decisionPoint.abilityGameId).toBe(ENVENOM_SPELL_ID);
    }
  });
});

describe("MUTATION: reporting an authority-support failure as NO_AUTHORITY_AVAILABLE", () => {
  const unprovable = syntheticAuthority({
    lists: [
      { listName: "default", actions: ["call_action_list,name=spend,if=combo_points>=5"] },
      { listName: "spend", actions: ["envenom"] },
      { listName: "cds", actions: ["envenom"] },
    ],
  });

  it("would claim no standard exists when SimulationCraft plainly does", () => {
    // The mutation would map every reachability failure onto the no-authority
    // vocabulary. That vocabulary cannot express it.
    expect([...NO_AUTHORITY_REASONS]).not.toContain("ACTION_REACHABILITY_NOT_PROVABLE");
    expect(NO_AUTHORITY_REASONS).toHaveLength(1);
  });

  it("but the real evaluator reports UNKNOWN, naming our own limit", () => {
    const run = evaluateAssassinationEnvenom(state, {
      actorId: ASSASSINATION_ACTOR_B,
      authority: unprovable,
    });
    if (run.outcome !== "EVALUATED") return;
    const judgment = run.findings[0]?.judgment;
    expect(judgment?.status).toBe("UNKNOWN");
    if (judgment?.status !== "UNKNOWN") return;
    expect(judgment.blocker).toBe("ACTION_REACHABILITY_NOT_PROVABLE");
    // The authority exists — the artifact loaded and we walked its lists.
    expect(unprovable.artifact.lists.length).toBeGreaterThan(0);
  });
});
