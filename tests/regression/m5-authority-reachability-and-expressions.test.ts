import { describe, expect, it } from "vitest";

import { NO_AUTHORITY_REASONS } from "../../src/findings/authority.js";
import { evaluateAssassinationEnvenom } from "../../src/specs/rogue/assassination/evaluator.js";
import type { ObservedActionJudgment } from "../../src/findings/judgment.js";
import type { AplAuthority } from "../../src/simc/apl-authority.js";
import { ASSASSINATION_ACTOR_B, m5aState, observedActionJudgmentOf } from "../support/m5a-fixture.js";
import { authorityWithGateCondition, syntheticAuthority } from "../support/m5a-authority.js";

/**
 * Reachability and expression support are OUR limits, not gaps in the standard.
 *
 * The distinction this file defends:
 *
 *     NO_AUTHORITY_AVAILABLE   no applicable trustworthy standard exists
 *     UNKNOWN                  a standard exists; our support fell short
 *
 * Collapsing them would let the analyzer report its own incompleteness as
 * "nobody knows what correct play is here", which sounds authoritative and is
 * false. Every reachability and expression failure below must land on UNKNOWN.
 *
 * All of these run against the REAL 3/7 Envenom, which the real authority
 * rejects. So any test here that produced REJECTED_BY_AUTHORITY would be
 * reaching the right answer for the wrong reason — the shape of the authority is
 * what is under test, not the arithmetic.
 */

const state = m5aState();

function judge(authority: AplAuthority | null): ObservedActionJudgment {
  const run = evaluateAssassinationEnvenom(state, { actorId: ASSASSINATION_ACTOR_B, authority });
  if (run.outcome !== "EVALUATED") throw new Error(`expected EVALUATED, got ${run.outcome}`);
  const finding = run.findings[0];
  if (finding === undefined) throw new Error("expected one finding");
  return observedActionJudgmentOf(finding);
}

describe("no pinned authority is NO_AUTHORITY_AVAILABLE", () => {
  const judgment = judge(null);

  it("reports the absence of a standard, not a blocker", () => {
    expect(judgment.status).toBe("NO_AUTHORITY_AVAILABLE");
    if (judgment.status !== "NO_AUTHORITY_AVAILABLE") return;
    expect(judgment.reason).toBe("NO_PINNED_AUTHORITY_FOR_SPEC");
    // The union gives this branch no blocker and no trace: nothing was attempted.
    expect(judgment).not.toHaveProperty("blocker");
    expect(judgment).not.toHaveProperty("trace");
  });

  it("still produces a structured result rather than skipping the cast", () => {
    const run = evaluateAssassinationEnvenom(state, { actorId: ASSASSINATION_ACTOR_B, authority: null });
    if (run.outcome !== "EVALUATED") return;
    expect(run.findings).toHaveLength(1);
  });
});

describe("an unprovable call graph is UNKNOWN, never NO_AUTHORITY_AVAILABLE", () => {
  const cases: readonly (readonly [string, AplAuthority])[] = [
    [
      "envenom appears in two lists",
      syntheticAuthority({
        lists: [
          { listName: "default", actions: ["call_action_list,name=spend,if=combo_points>=5"] },
          { listName: "spend", actions: ["envenom"] },
          { listName: "cds", actions: ["envenom"] },
        ],
      }),
    ],
    [
      "the spend list has a second incoming edge",
      syntheticAuthority({
        lists: [
          {
            listName: "default",
            actions: ["call_action_list,name=cds", "call_action_list,name=spend,if=combo_points>=5"],
          },
          { listName: "cds", actions: ["call_action_list,name=spend"] },
          { listName: "spend", actions: ["envenom"] },
        ],
      }),
    ],
    [
      "the gate is unconditional",
      syntheticAuthority({
        lists: [
          { listName: "default", actions: ["call_action_list,name=spend"] },
          { listName: "spend", actions: ["envenom"] },
        ],
      }),
    ],
    [
      "an unmodelled run_action_list exists",
      syntheticAuthority({
        lists: [
          {
            listName: "default",
            actions: ["run_action_list,name=cds", "call_action_list,name=spend,if=combo_points>=5"],
          },
          { listName: "cds", actions: ["kick"] },
          { listName: "spend", actions: ["envenom"] },
        ],
      }),
    ],
    [
      "a call references a list that does not exist",
      syntheticAuthority({
        lists: [
          {
            listName: "default",
            actions: ["call_action_list,name=ghost", "call_action_list,name=spend,if=combo_points>=5"],
          },
          { listName: "spend", actions: ["envenom"] },
        ],
      }),
    ],
    [
      "envenom sits directly in the entry list",
      syntheticAuthority({ lists: [{ listName: "default", actions: ["envenom"] }] }),
    ],
    [
      "envenom is absent from the authority entirely",
      syntheticAuthority({
        lists: [
          { listName: "default", actions: ["call_action_list,name=spend,if=combo_points>=5"] },
          { listName: "spend", actions: ["rupture"] },
        ],
      }),
    ],
  ];

  it.each(cases)("%s yields UNKNOWN / ACTION_REACHABILITY_NOT_PROVABLE", (_label, authority) => {
    const judgment = judge(authority);
    expect(judgment.status).toBe("UNKNOWN");
    if (judgment.status !== "UNKNOWN") return;
    expect(judgment.blocker).toBe("ACTION_REACHABILITY_NOT_PROVABLE");
    // The 3/7 arithmetic would reject. It must not, because the authority's
    // shape does not license the inference.
    expect(judgment.trace).toBeNull();
  });

  it("keeps reachability out of the no-authority vocabulary entirely", () => {
    // Structural, not a string check: the reason cannot be expressed.
    expect(NO_AUTHORITY_REASONS).toEqual(["NO_PINNED_AUTHORITY_FOR_SPEC"]);
    expect([...NO_AUTHORITY_REASONS]).not.toContain("ACTION_REACHABILITY_NOT_PROVABLE");
  });
});

describe("unsupported authority syntax never becomes false", () => {
  /**
   * RE-POINTED for M5-B.
   *
   * Four rows here previously used constructs that M5-B deliberately added:
   * `energy.pct`, `>`, `<=`, and the pinned `generate` condition that needed
   * `>`. Those rows would now parse, so they no longer demonstrate anything
   * about unsupported syntax. Each has been re-aimed at a construct that is
   * STILL outside the subset — including three real pinned authority lines —
   * so the fail-closed invariant keeps being guarded by evidence rather than by
   * a string nobody uses.
   *
   * What must never change: an expression this analyzer cannot parse produces
   * UNKNOWN with UNSUPPORTED_AUTHORITY_EXPRESSION and NO trace. It must never
   * become false, and it must never become UNRESOLVED_AUTHORITY_STATE — those
   * are "we did not understand the question" and "we lack the state", and they
   * have different remedies.
   */
  it.each([
    ["an unsupported identifier", "combo_points>=5&energy.regen_combined>40"],
    ["the >? max operator", "combo_points.deficit>?0"],
    [
      "the real pinned cds call condition",
      "variable.single_target|!talent.scent_of_blood|buff.scent_of_blood.stack>=2",
    ],
    ["the real pinned thistle_tea condition's sibling identifier", "dot.rupture.ticking&combo_points>=5"],
    ["arithmetic", "combo_points>=5-2"],
    // RE-POINTED for M5-C2: `talent.<name>` is a supported atom now, so the
    // still-unsupported neighbours are a talent RANK and a snapshot multiplier.
    ["a talent rank reference", "talent.scent_of_blood.rank>=2&combo_points>=5"],
    ["a snapshot multiplier", "pmultiplier<=1&combo_points>=5"],
    ["a decimal literal", "combo_points>=5.5"],
    ["!=", "combo_points!=5"],
    ["<?", "combo_points<?5"],
    ["a buff stack reference", "buff.darkest_night.stack>=2"],
  ])("%s yields UNSUPPORTED_AUTHORITY_EXPRESSION", (_label, condition) => {
    const judgment = judge(authorityWithGateCondition(condition));
    expect(judgment.status).toBe("UNKNOWN");
    if (judgment.status !== "UNKNOWN") return;
    expect(judgment.blocker).toBe("UNSUPPORTED_AUTHORITY_EXPRESSION");
    expect(judgment.trace).toBeNull();
  });

  it("refuses the WHOLE expression even when a supported conjunct is already false", () => {
    // This is the sharpest form, and it matters MORE after M5-B, not less.
    //
    // At 3 combo points `combo_points>=5` is FALSE. M5-B's evaluator implements
    // Kleene AND, under which `FALSE & UNKNOWN_STATE = FALSE` — a legitimate
    // rule for state we understand but do not know. If an UNPARSED fragment
    // could enter that domain, the same rule would emit a confident rejection
    // resting on syntax nobody understood.
    //
    // It cannot, because the refusal happens at parse time and produces no AST.
    // RE-POINTED twice: `energy.pct` became supported in M5-B, and
    // `talent.<name>` became supported in M5-C2. `pmultiplier` is a real
    // identifier from the pinned `core_dot` list that remains outside the subset.
    const judgment = judge(authorityWithGateCondition("combo_points>=5&pmultiplier<=1"));
    expect(judgment.status).not.toBe("REJECTED_BY_AUTHORITY");
    expect(judgment.status).toBe("UNKNOWN");
    if (judgment.status !== "UNKNOWN") return;
    expect(judgment.blocker).toBe("UNSUPPORTED_AUTHORITY_EXPRESSION");
    // Not UNRESOLVED_AUTHORITY_STATE: nothing was evaluated, so there is no
    // trace and no world.
    expect(judgment.trace).toBeNull();
  });

  it("separates unsupported syntax from a supported expression with unknown state", () => {
    // The two blockers must stay distinct. `fight_remains<15` is SUPPORTED
    // syntax whose magnitude is unknowable, so it evaluates and reports
    // UNRESOLVED_AUTHORITY_STATE with a real trace. The case above reports
    // UNSUPPORTED_AUTHORITY_EXPRESSION with no trace at all.
    const judgment = judge(authorityWithGateCondition("fight_remains<15"));
    expect(judgment.status).toBe("UNKNOWN");
    if (judgment.status !== "UNKNOWN") return;
    expect(judgment.blocker).toBe("UNRESOLVED_AUTHORITY_STATE");
    expect(judgment.trace).not.toBeNull();
    expect(judgment.trace?.atoms.find((atom) => atom.key === "fight_remains")?.binding).toBe(
      "UNKNOWN_NUMBER",
    );
  });

  it("still evaluates a fully supported condition", () => {
    const judgment = judge(authorityWithGateCondition("combo_points>=5"));
    expect(judgment.status).toBe("REJECTED_BY_AUTHORITY");
  });
});
