import { describe, expect, it } from "vitest";

import { STATE_CERTAINTIES, UNKNOWN_REASONS } from "../../src/engine/state/state-result.js";
import { NO_AUTHORITY_REASONS, DECISION_AUTHORITY_KINDS } from "../../src/findings/authority.js";
import { JUDGMENT_BLOCKERS, OBSERVED_ACTION_JUDGMENT_STATUSES } from "../../src/findings/judgment.js";
import { NOT_EVALUATED_REASONS } from "../../src/findings/run-result.js";
import { evaluateAssassinationEnvenom } from "../../src/specs/rogue/assassination/evaluator.js";
import { ASSASSINATION_ACTOR_A, ASSASSINATION_ACTOR_B, m5aState } from "../support/m5a-fixture.js";

/**
 * M4 certainty and M5 judgment are different vocabularies.
 *
 * M4 answers "what was the state, and how sure are we?". M5 answers "what does
 * the authority say about this observed action?". Facts flow one way: M4 into
 * M5, never back. Sharing a member between the two unions would be the first
 * step toward an evidence condition being reported as an authority verdict, or
 * a verdict being read as a certainty.
 */

describe("the two vocabularies are disjoint", () => {
  it("shares only UNKNOWN between certainty and judgment status", () => {
    // UNKNOWN legitimately appears in both, because each layer genuinely has a
    // "we do not know" answer. What must not happen is the two being the same
    // TYPE, or M4's other certainties leaking into a verdict: a judgment is
    // never EXACT, BOUNDED or STALE, because those describe evidence quality
    // rather than what the authority says.
    const overlap = STATE_CERTAINTIES.filter((value) =>
      (OBSERVED_ACTION_JUDGMENT_STATUSES as readonly string[]).includes(value),
    );
    expect(overlap).toEqual(["UNKNOWN"]);
    for (const certainty of ["EXACT", "BOUNDED", "STALE"]) {
      expect([...OBSERVED_ACTION_JUDGMENT_STATUSES]).not.toContain(certainty);
    }
  });

  it("shares no member between M4 unknown reasons and M5 blockers", () => {
    const overlap = UNKNOWN_REASONS.filter((value) =>
      (JUDGMENT_BLOCKERS as readonly string[]).includes(value),
    );
    expect(overlap).toEqual([]);
  });

  it("keeps NO_AUTHORITY_AVAILABLE out of M4's evidence vocabulary", () => {
    expect([...UNKNOWN_REASONS]).not.toContain("NO_AUTHORITY_AVAILABLE");
    expect([...STATE_CERTAINTIES]).not.toContain("NO_AUTHORITY_AVAILABLE");
  });

  it("keeps our own support limits out of the no-authority vocabulary", () => {
    // "No trustworthy standard exists" and "we could not apply the standard"
    // are different claims. Reporting the second as the first would present the
    // analyzer's incompleteness as a fact about the game.
    for (const blocker of JUDGMENT_BLOCKERS) {
      expect([...NO_AUTHORITY_REASONS]).not.toContain(blocker);
    }
    expect(NO_AUTHORITY_REASONS).toEqual(["NO_PINNED_AUTHORITY_FOR_SPEC"]);
  });

  it("treats only SimulationCraft as a decision authority", () => {
    // Warcraft Logs observations are evidence; runtime game data is semantics.
    // Neither is entitled to say what correct play is.
    expect(DECISION_AUTHORITY_KINDS).toEqual(["SIMC_APL"]);
    for (const forbidden of ["WCL_OBSERVED_FACT", "RUNTIME_GAME_DATA", "TOP_LOGS", "COMPARISON"]) {
      expect([...DECISION_AUTHORITY_KINDS]).not.toContain(forbidden);
    }
  });

  it("keeps run-level reasons distinct from per-decision blockers", () => {
    for (const reason of NOT_EVALUATED_REASONS) {
      expect([...JUDGMENT_BLOCKERS]).not.toContain(reason);
    }
  });
});

describe("judgments carry no M4 certainty fields", () => {
  const state = m5aState();
  const run = evaluateAssassinationEnvenom(state, { actorId: ASSASSINATION_ACTOR_B });

  it("exposes no certainty, derivation or value on a judgment", () => {
    if (run.outcome !== "EVALUATED") return;
    for (const finding of run.findings) {
      expect(finding.judgment).not.toHaveProperty("certainty");
      expect(finding.judgment).not.toHaveProperty("derivation");
      expect(finding.judgment).not.toHaveProperty("value");
      expect(finding.judgment).not.toHaveProperty("lowerBound");
      expect(finding.judgment).not.toHaveProperty("upperBound");
    }
  });

  it("exposes no confidence anywhere on a finding", () => {
    if (run.outcome !== "EVALUATED") return;
    for (const finding of run.findings) {
      expect(finding).not.toHaveProperty("confidence");
      expect(finding).not.toHaveProperty("severity");
      expect(finding).not.toHaveProperty("score");
      expect(finding).not.toHaveProperty("suppression");
      expect(finding).not.toHaveProperty("status");
      expect(finding).not.toHaveProperty("blocker");
    }
  });
});

describe("exported result shapes serialize deterministically", () => {
  const state = m5aState();
  const runs = [
    evaluateAssassinationEnvenom(state, { actorId: ASSASSINATION_ACTOR_A }),
    evaluateAssassinationEnvenom(state, { actorId: ASSASSINATION_ACTOR_B }),
    evaluateAssassinationEnvenom(state, { actorId: ASSASSINATION_ACTOR_B, authority: null }),
  ];

  it("round-trips through JSON unchanged", () => {
    for (const run of runs) {
      expect(JSON.parse(JSON.stringify(run))).toEqual(run);
    }
  });

  it("exposes no Map or Set in any public result shape", () => {
    const walk = (value: unknown, path: string): void => {
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
    for (const run of runs) walk(run, "run");
  });

  it("exposes no undefined, which JSON would silently drop", () => {
    const walk = (value: unknown, path: string): void => {
      expect(value, `${path} is undefined`).not.toBeUndefined();
      if (Array.isArray(value)) {
        value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
        return;
      }
      if (typeof value === "object" && value !== null) {
        for (const [key, entry] of Object.entries(value)) walk(entry, `${path}.${key}`);
      }
    };
    for (const run of runs) walk(run, "run");
  });

  it("distinguishes a run that produced nothing from a run that never happened", () => {
    const notEvaluated = runs.find((run) => run.outcome === "NOT_EVALUATED");
    // All three runs here DO evaluate; the point is structural.
    expect(notEvaluated).toBeUndefined();
    for (const run of runs) {
      expect(run.outcome).toBe("EVALUATED");
      if (run.outcome !== "EVALUATED") continue;
      // An evaluated run always discloses what it looked at.
      expect(run.coverage.observedEnvenomCastsInScope).toBe(run.findings.length);
    }
  });
});
