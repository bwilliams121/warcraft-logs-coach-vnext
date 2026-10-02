/**
 * The M5-D2 real single-target decision corpus, on real Warcraft Logs evidence.
 *
 * Seven decisions from one real pull. ONE resolves to an exact authority entry.
 * Six stay UNKNOWN, each for a different, named, defensible reason.
 *
 * THAT RATIO IS THE RESULT, NOT A SHORTFALL TO HIDE. The corpus exists to pin
 * where this build's honesty boundary actually sits, so it cannot drift in
 * either direction: a refusal must not quietly become an answer, and the one
 * exact answer must not quietly become a refusal.
 *
 * Every assertion here is about what the AUTHORITY selects and what the evidence
 * supports. None of them says the player was right or wrong.
 */

import { describe, expect, it } from "vitest";

import {
  M5D2_CORPUS,
  SUPPRESSED_OBSERVATION,
  runCase,
  runCorpus,
  stepAt,
  type CorpusRun,
} from "../support/m5d2-corpus.js";
import { M5D2_ANCHORS, M5D2_IDS, m5d2State, m5d2StateWithoutEvent } from "../support/m5d2-fixture.js";

const runs = runCorpus();
const byId = new Map<number, CorpusRun>(runs.map((run) => [run.kase.id, run]));

function run(id: number): CorpusRun {
  const found = byId.get(id);
  if (found === undefined) throw new Error(`no corpus case ${String(id)}`);
  return found;
}

describe("the corpus is what it claims to be", () => {
  it("has exactly seven cases with unique ids", () => {
    expect(M5D2_CORPUS).toHaveLength(7);
    expect(new Set(M5D2_CORPUS.map((c) => c.id)).size).toBe(7);
  });

  it("every case records how it was selected, so the choice is re-derivable", () => {
    for (const c of M5D2_CORPUS) {
      expect(c.selectionRule.length).toBeGreaterThan(20);
      expect(c.rationale.length).toBeGreaterThan(40);
    }
  });

  it("carries the cooldown and DoT anchors its decisions depend on", () => {
    // The D2 §76 rule: a cooldown must never read as ready merely because its
    // anchor fell outside the slice. The defence is checking the anchors are IN.
    const state = m5d2State();
    const times = new Set(state.fight.events.map((e) => e.reportTimeMs));
    for (const anchor of Object.values(M5D2_ANCHORS)) expect(times.has(anchor)).toBe(true);
  });

  it("every case lands on the outcome the corpus declares", () => {
    for (const r of runs) {
      expect(`case${String(r.kase.id)}=${r.classified.coverage}`).toBe(
        `case${String(r.kase.id)}=${r.kase.expectedCoverage}`,
      );
      expect(`case${String(r.kase.id)}=${String(r.classified.blockerClass)}`).toBe(
        `case${String(r.kase.id)}=${String(r.kase.expectedBlockerClass)}`,
      );
    }
  });

  it("resolves exactly one decision, and it is case 1", () => {
    const exact = runs.filter((r) => r.classified.coverage === "EXACT_ENTRY");
    expect(exact.map((r) => r.kase.id)).toEqual([1]);
    // No case may claim the weaker token convergence either, silently or not.
    expect(runs.filter((r) => r.classified.coverage === "TOKEN_CONVERGED")).toHaveLength(0);
    expect(runs.filter((r) => r.classified.coverage === "NO_ACTION")).toHaveLength(0);
  });
});

describe("case 1 — the regression anchor stays exact", () => {
  it("names the same entry M5-C3c3c proved, on the wider slice", () => {
    const result = run(1).result;
    expect(result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    if (result.kind !== "ROTATIONAL_GCD_SELECTED") return;
    expect(result.actionToken).toBe("garrote");
    expect(result.selectingStep.listName).toBe("core_dot");
    expect(result.selectingStep.priorityOrdinal).toBe(0);
    expect(result.selectingEntry.map((e) => `${e.listName}[${String(e.priorityOrdinal)}]`)).toEqual([
      "default[6]",
      "core_dot[0]",
    ]);
  });

  it("is positive because the observed execution proved usability, and says so", () => {
    // Stated out loud rather than left implicit. This is authority VERIFICATION
    // of a decision the player actually made; it is not a prediction that would
    // have held at a moment when Garrote was not cast. Case 2 is that moment.
    const step = stepAt(run(1), "core_dot", 0);
    expect(step?.usability).toBe("PROVEN_USABLE");
    expect(step?.gate.kind).toBe("EVALUATED");
  });

  it("never entered the unsupported vanish list, because stealth made the gate FALSE", () => {
    const gate = stepAt(run(1), "cds", 5)?.gate;
    expect(gate?.kind).toBe("EVALUATED");
    if (gate?.kind !== "EVALUATED") return;
    expect(gate.truth).toBe("FALSE");
    expect(stepAt(run(1), "vanish", 0)).toBeNull();
  });
});

describe("case 2 — the epistemic boundary", () => {
  const r = run(2);

  it("queries strictly between the factual Vanish and the factual Garrote", () => {
    const state = r.state;
    const at = state.fight.events[r.position];
    expect(at?.reportTimeMs).toBe(2_176_491);
    expect(at?.reportTimeMs).toBeGreaterThan(M5D2_ANCHORS.vanishCast);
    expect(at?.reportTimeMs).toBeLessThan(2_176_580);
    // The query point is NOT the Garrote cast, and no Garrote observation is fed in.
    expect(r.kase.observedAbilityGameId).toBe(SUPPRESSED_OBSERVATION);
  });

  it("resolves the core_dot[0] Garrote CONDITION to TRUE on real state", () => {
    // The whole point. Everything the D1 primitives were built for works here:
    // per-action `remains`, one-sided `refreshable`, in-combat Stealth, the
    // target-independent eliminations, the Deathmark/Kingsbane/item cooldowns.
    const step = stepAt(r, "core_dot", 0);
    expect(step?.actionToken).toBe("garrote");
    expect(step?.gate.kind).toBe("EVALUATED");
    if (step?.gate.kind !== "EVALUATED") return;
    expect(step.gate.truth).toBe("TRUE");
  });

  it("still refuses, and the reason is usability rather than the condition", () => {
    expect(r.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    const step = stepAt(r, "core_dot", 0);
    expect(step?.usability).toBe("UNKNOWN");
    expect(step?.outcome).toBe("MAY_SELECT");
  });

  it("is NOT blocked by the parser, by an unsupported option, or by missing state on that entry", () => {
    // The negative half, and the reason this case is worth committing. If the
    // refusal ever came from a parse failure or an unread condition instead, the
    // case would still be UNKNOWN and would silently stop measuring anything.
    const step = stepAt(r, "core_dot", 0);
    expect(step?.gate.kind).not.toBe("UNSUPPORTED");
    expect(step?.gate.kind).not.toBe("NOT_EVALUATED");
    // Not an undecided condition either: it evaluated, and it evaluated TRUE.
    if (step?.gate.kind === "EVALUATED") expect(step.gate.truth).not.toBe("UNKNOWN_STATE");
    expect(step?.targetingRefusal).toBeNull();
    if (r.result.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
    expect(r.result.blocker).not.toBe("UNREAD_CONDITION_ON_GCD_ACTION");
    expect(r.result.scanBlocker).not.toBe("UNSUPPORTED_AUTHORITY_EXPRESSION");
    expect(r.result.scanBlocker).not.toBe("UNSUPPORTED_ACTION_OPTION");
  });

  it("is not caused by priority contamination from an earlier entry either", () => {
    // Everything ahead of core_dot[0] that could have decided the scan is either
    // eliminated or is an off-GCD candidate the first-GCD engine converges over.
    // The one thing that is NOT resolved is Garrote's own usability.
    for (const [list, ordinal] of [
      ["default", 0],
      ["cds", 0],
      ["cds", 1],
      ["cds", 4],
      ["items", 5],
    ] as const) {
      expect(`${list}[${String(ordinal)}]=${String(stepAt(r, list, ordinal)?.usability)}`).toBe(
        `${list}[${String(ordinal)}]=PROVEN_UNUSABLE`,
      );
    }
    expect(stepAt(r, "cds", 5)?.gate.kind).toBe("EVALUATED");
  });

  it("gives the same answer whether or not the later Garrote cast is in the fixture", () => {
    // Removing the future observation must change NOTHING, because the case
    // already refuses to use it. If this ever diverges, hindsight has leaked in.
    const withoutFuture = m5d2StateWithoutEvent({
      type: "cast",
      abilityGameId: M5D2_IDS.garrote,
      reportTimeMs: 2_176_580,
    });
    // Prove the removal actually took, so the comparison below cannot pass by
    // having changed nothing.
    const stillThere = withoutFuture.fight.events.some(
      (e) => e.kind === "CAST" && e.abilityGameId === M5D2_IDS.garrote && e.reportTimeMs === 2_176_580,
    );
    expect(stillThere).toBe(false);

    const again = runCase(r.kase, withoutFuture);
    expect(again.classified.coverage).toBe(r.classified.coverage);
    expect(again.classified.rawBlocker).toBe(r.classified.rawBlocker);
    const before = stepAt(r, "core_dot", 0);
    const after = stepAt(again, "core_dot", 0);
    expect(after?.gate).toStrictEqual(before?.gate);
    expect(after?.usability).toBe(before?.usability);
  });
});

describe("cases 3 and 4 — observed max-combo-point Envenom", () => {
  for (const id of [3, 4]) {
    const r = run(id);

    it(`case ${String(id)}: reaches the spend list and finds Envenom there`, () => {
      // The scan really does get to the spender: 7 of 7 combo points make
      // default[7] FALSE and default[8] TRUE, and the observed cast proves
      // Envenom usable. Everything about the SPENDER decision resolved.
      expect(stepAt(r, "default", 8)?.gate.kind).toBe("EVALUATED");
      const spend1 = stepAt(r, "spend", 1);
      expect(spend1?.actionToken).toBe("envenom");
      expect(spend1?.usability).toBe("PROVEN_USABLE");
      expect(spend1?.outcome).toBe("SELECTED");
    });

    it(`case ${String(id)}: the Vanish CHARGE cooldown eliminates the vanish list`, () => {
      // Read against the nominal 1,000 ms `_cooldown` instead of the 120,000 ms
      // charge cooldown, these entries would have re-opened. They do not.
      expect(stepAt(r, "vanish", 0)?.usability).toBe("PROVEN_UNUSABLE");
      expect(stepAt(r, "vanish", 1)?.usability).toBe("PROVEN_UNUSABLE");
    });

    it(`case ${String(id)}: still refuses, because the post-Tea rescan cannot read Energy`, () => {
      // The spender is not selected, and must not be. core_dot[0] Garrote is
      // still undecided ahead of it, and a world in which Thistle Tea fires
      // first must rescan. Tea's contract writes PLAYER_ENERGY without
      // establishing the new amount, so since M11-D3-0 that rescan reads
      // `energy.pct` as not established and blocks at default[3]'s Energy-
      // dependent Tea condition. Before, it reused the pre-Tea PRE_COST Energy,
      // fired Tea again, and diverged between Garrote and Rupture
      // (DIVERGENT_GCD_OUTCOMES at core_dot[0]) — a divergence that rested on a
      // stale value. Choosing the lower-priority entry would be exactly the
      // priority short-circuit CLAUDE.md forbids.
      expect(r.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
      if (r.result.kind !== "ROTATIONAL_GCD_UNKNOWN") return;
      expect(r.result.blocker).toBe("ONE_SCAN_BLOCKED");
      expect(r.result.scanBlocker).toBe("NO_DEFINITE_WINNER");
      expect(r.result.blockedAt?.listName).toBe("default");
      expect(r.result.blockedAt?.priorityOrdinal).toBe(3);
      expect(r.result.blockedAt?.actionToken).toBe("thistle_tea");
      expect(stepAt(r, "core_dot", 0)?.outcome).toBe("MAY_SELECT");
    });
  }
});

describe("case 5 — Rupture DoT maintenance", () => {
  const r = run(5);

  it("reaches core_dot[3] with Rupture proven usable by the observed cast", () => {
    const step = stepAt(r, "core_dot", 3);
    expect(step?.actionToken).toBe("rupture");
    expect(step?.usability).toBe("PROVEN_USABLE");
  });

  it("cannot decide it, because the DoT anchor is a refresh with no derivable duration", () => {
    // The condition PARSED and was EVALUATED — this is not a syntax refusal.
    // It came back UNKNOWN_STATE because `refreshable` has no value here.
    const gate = stepAt(r, "core_dot", 3)?.gate;
    expect(gate?.kind).toBe("EVALUATED");
    if (gate?.kind !== "EVALUATED") return;
    expect(gate.truth).toBe("UNKNOWN_STATE");
    expect(r.classified.coverage).toBe("UNKNOWN");
  });

  it("does not invent a Rupture duration to get past it", () => {
    // The negative case. An UNKNOWN remainder must stay UNKNOWN; a refresh event
    // does not license assuming the DoT was re-applied at full duration.
    expect(stepAt(r, "core_dot", 3)?.outcome).toBe("MAY_SELECT");
    expect(stepAt(r, "core_dot", 3)?.outcome).not.toBe("SELECTED");
  });
});

describe("case 6 — a major cooldown the player really used stays UNKNOWN", () => {
  const r = run(6);

  it("reaches cds[0] Deathmark as a live, usable candidate", () => {
    const step = stepAt(r, "cds", 0);
    expect(step?.actionToken).toBe("deathmark");
    expect(step?.usability).toBe("PROVEN_USABLE");
    expect(step?.outcome).toBe("MAY_SELECT");
  });

  it("cannot evaluate it, because the entry ends in permanently predictive state", () => {
    const step = stepAt(r, "cds", 0);
    // Evaluated, not refused: the parser handled the line and the enumeration
    // ran. It is the predictive disjunction that cannot resolve in any world.
    expect(step?.gate.kind).toBe("EVALUATED");
    if (step?.gate.kind !== "EVALUATED") return;
    expect(step.gate.truth).toBe("UNKNOWN_STATE");
    // The atoms responsible, quoted from the authority's own line.
    expect(step?.actionStringVerbatim).toContain("target.time_to_die");
    expect(step?.actionStringVerbatim).toContain("fight_remains");
  });

  it("does not use the real fight outcome to resolve it", () => {
    // Hindsight would make this entry decidable and would blame a player for
    // information they did not have. The refusal is the requirement.
    expect(r.classified.coverage).toBe("UNKNOWN");
    expect(stepAt(r, "cds", 0)?.outcome).not.toBe("SELECTED");
    expect(stepAt(r, "cds", 0)?.outcome).not.toBe("ELIMINATED_CONTINUE");
  });
});

describe("case 7 — an observed Fan of Knives does not reveal a target count", () => {
  const r = run(7);

  it("refuses before any builder entry can be evaluated", () => {
    expect(r.classified.coverage).toBe("UNKNOWN");
    const crimson = stepAt(r, "generate", 0);
    expect(crimson?.actionToken).toBe("crimson_tempest");
    expect(crimson?.outcome).toBe("BLOCKED");
  });

  it("never selects Fan of Knives merely because Fan of Knives was cast", () => {
    // The observed cast proves the ACTION was usable. It does not prove the
    // CONDITION, and `spell_targets.fan_of_knives` counts a simulation roster
    // that Warcraft Logs does not record. Reading the count back out of the
    // observation would be inventing the evidence the refusal exists to protect.
    for (const step of r.steps) expect(step.outcome).not.toBe("SELECTED");
    expect(r.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
  });

  it("keeps the generate list gated on the target-count atom", () => {
    const generateCall = stepAt(r, "default", 7);
    expect(generateCall?.actionToken).toBe("call_action_list");
    expect(stepAt(r, "generate", 0)?.actionStringVerbatim).toContain("spell_targets.fan_of_knives");
  });
});
