import { describe, expect, it } from "vitest";

import { NO_AUTHORITY_REASONS } from "../../src/findings/authority.js";
import { evaluateAssassinationEnvenom } from "../../src/specs/rogue/assassination/evaluator.js";
import type { ObservedActionJudgment } from "../../src/findings/judgment.js";
import type { AplAuthority } from "../../src/simc/apl-authority.js";
import { ASSASSINATION_ACTOR_B, m5aState } from "../support/m5a-fixture.js";
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
  const judgment = run.findings[0]?.judgment;
  if (judgment === undefined) throw new Error("expected one finding");
  return judgment;
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
  it.each([
    ["an unsupported identifier", "combo_points>=5&energy.pct>70"],
    ["the > operator", "combo_points.deficit>0"],
    [
      "the real generate condition, which uses >",
      "!buff.darkest_night.up&combo_points<5|buff.darkest_night.up&combo_points.deficit>0",
    ],
    ["arithmetic", "combo_points>=5-2"],
    ["a talent reference", "talent.darkest_night&combo_points>=5"],
    ["a decimal literal", "combo_points>=5.5"],
    ["!=", "combo_points!=5"],
    ["<=", "combo_points<=5"],
  ])("%s yields UNSUPPORTED_AUTHORITY_EXPRESSION", (_label, condition) => {
    const judgment = judge(authorityWithGateCondition(condition));
    expect(judgment.status).toBe("UNKNOWN");
    if (judgment.status !== "UNKNOWN") return;
    expect(judgment.blocker).toBe("UNSUPPORTED_AUTHORITY_EXPRESSION");
    expect(judgment.trace).toBeNull();
  });

  it("refuses the WHOLE expression even when a supported conjunct is already false", () => {
    // This is the sharpest form. At 3 combo points `combo_points>=5` is FALSE,
    // so a three-valued short-circuit would compute `false & unsupported` as
    // FALSE and emit a confident rejection resting on a fragment nobody parsed.
    const judgment = judge(authorityWithGateCondition("combo_points>=5&energy.pct>70"));
    expect(judgment.status).not.toBe("REJECTED_BY_AUTHORITY");
    if (judgment.status !== "UNKNOWN") return;
    expect(judgment.blocker).toBe("UNSUPPORTED_AUTHORITY_EXPRESSION");
  });

  it("still evaluates a fully supported condition", () => {
    const judgment = judge(authorityWithGateCondition("combo_points>=5"));
    expect(judgment.status).toBe("REJECTED_BY_AUTHORITY");
  });
});
