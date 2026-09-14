/**
 * Milestone 5, pinned as a whole.
 *
 * The individual milestones each guard their own piece. This file guards the
 * SHAPE OF THE WHOLE — the small number of facts that, taken together, are what
 * "Milestone 5 is complete" actually means. It is the file to read first when a
 * later milestone starts changing things.
 *
 * HOW TO READ A FAILURE HERE
 *
 * A failure is not automatically a bug. Coverage improving is legitimate and
 * expected: a real new primitive can turn one of the deliberate UNKNOWNs into a
 * resolved decision, and that is progress.
 *
 * What is NOT legitimate is that happening SILENTLY. Each pinned number below is
 * a reviewed claim about what the evidence supports. Changing one means someone
 * looked at why it changed and decided the new claim is earned — so the contract
 * is designed to require that conversation, never to make improvement
 * impossible. The failure messages say which of the two is happening.
 *
 * The reverse direction is a plain regression: an UNKNOWN that used to be exact,
 * or a deliberate refusal that has decayed into a parser failure, is the
 * analyzer getting worse while still looking green.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { censusOf } from "../../src/specs/rogue/assassination/decision-coverage.js";
import { M5D2_CORPUS, runCase, runCorpus, stepAt } from "../support/m5d2-corpus.js";
import { analyzeObservedAssassinationDecisions } from "../../src/specs/rogue/assassination/observed-analysis.js";
import { ASSASSINATION_SPEC_ID } from "../../src/specs/rogue/assassination/evaluator.js";
import { M5D2_ACTOR, M5D2_TARGET, m5d2State } from "../support/m5d2-fixture.js";
import { ASSASSINATION_ACTOR_B, m5aState } from "../support/m5a-fixture.js";
import { STATE_CERTAINTIES, UNKNOWN_REASONS } from "../../src/engine/state/state-result.js";

const REVIEW =
  "This is a REVIEWED claim about what the evidence supports. If the analyzer genuinely improved, " +
  "update this contract deliberately and say why. Do not adjust it to make a run green.";

const runs = runCorpus();
const census = censusOf(runs.map((r) => r.classified));

describe("the D2 corpus keeps its measured shape", () => {
  it("resolves exactly one of seven cases", () => {
    expect(census.byCoverage, REVIEW).toStrictEqual({
      EXACT_ENTRY: 1,
      TOKEN_CONVERGED: 0,
      NO_ACTION: 0,
      UNKNOWN: 6,
    });
  });

  it("keeps the blocker census exactly as reviewed", () => {
    // Pinned WITH the total on purpose. A refusal weakened into an answer moves
    // the total; a refusal weakened into a DIFFERENT refusal does not, and only
    // this catches that.
    expect(census.byBlockerClass, REVIEW).toStrictEqual({
      OBSERVED_STATE_MISSING: 4,
      DIVERGENT_WORLDS: 2,
      TARGET_COUNT: 0,
      PREDICTIVE_STATE: 0,
      TARGETING_NOT_MODELLED: 0,
      USABILITY_NOT_PROVEN: 0,
      OTHER: 0,
    });
  });

  it("keeps Q an exact Garrote selection", () => {
    // The regression direction. If this becomes UNKNOWN, something got worse.
    const run = runs.find((r) => r.kase.id === 1);
    expect(run?.classified.coverage).toBe("EXACT_ENTRY");
    expect(run?.classified.actionToken).toBe("garrote");
    expect(run?.classified.entry).toStrictEqual({ listName: "core_dot", priorityOrdinal: 0 });
  });
});

describe("the deliberate refusals stay deliberate", () => {
  it("keeps case 2 a PRE-CAST USABILITY boundary, not a parser or state failure", () => {
    // The distinction is the whole value of the case. An UNKNOWN that arrives
    // for a different reason still passes a naive check and measures nothing.
    const kase = M5D2_CORPUS.find((c) => c.id === 2);
    if (kase === undefined) throw new Error("corpus case 2 missing");
    const step = stepAt(runCase(kase), "core_dot", 0);
    expect(step?.gate.kind).toBe("EVALUATED");
    if (step?.gate.kind !== "EVALUATED") return;
    expect(step.gate.truth, "the condition must still resolve TRUE").toBe("TRUE");
    expect(step.usability, "usability must still be what is missing").toBe("UNKNOWN");
  });

  it("keeps Deathmark refused on PREDICTIVE state", () => {
    const kase = M5D2_CORPUS.find((c) => c.id === 6);
    if (kase === undefined) throw new Error("corpus case 6 missing");
    const step = stepAt(runCase(kase), "cds", 0);
    expect(step?.usability).toBe("PROVEN_USABLE");
    expect(step?.gate.kind).toBe("EVALUATED");
    if (step?.gate.kind !== "EVALUATED") return;
    expect(step.gate.truth).toBe("UNKNOWN_STATE");
    expect(step.actionStringVerbatim).toContain("target.time_to_die");
    expect(step.actionStringVerbatim).toContain("fight_remains");
  });

  it("keeps Fan of Knives refused on TARGET COUNT", () => {
    const kase = M5D2_CORPUS.find((c) => c.id === 7);
    if (kase === undefined) throw new Error("corpus case 7 missing");
    const step = stepAt(runCase(kase), "generate", 0);
    expect(step?.outcome).toBe("BLOCKED");
    expect(step?.actionStringVerbatim).toContain("spell_targets.fan_of_knives");
  });

  it("keeps the literal one-scan at Q distinct from the first-GCD answer", () => {
    // Two queries, two answers, both correct. Collapsing them would make the
    // exact result look like something it is not.
    const kase = M5D2_CORPUS.find((c) => c.id === 1);
    if (kase === undefined) throw new Error("corpus case 1 missing");
    const run = runCase(kase);
    expect(run.classified.coverage).toBe("EXACT_ENTRY");
    // The one-scan reaches a definite winner only because an unresolved NON_GCD
    // prefix precedes it; the prefix entries are still unresolved.
    expect(stepAt(run, "default", 1)?.outcome).toBe("MAY_SELECT");
    expect(stepAt(run, "default", 3)?.outcome).toBe("MAY_SELECT");
  });
});

describe("the observed-decision comparison keeps its measured shape", () => {
  const analysis = analyzeObservedAssassinationDecisions({
    state: m5d2State(),
    actorId: M5D2_ACTOR,
    specId: ASSASSINATION_SPEC_ID,
    targetActorId: M5D2_TARGET,
  });

  it("matches the real Garrote decision and nothing else", () => {
    if (analysis.status !== "ANALYZED") throw new Error("expected ANALYZED");
    expect(analysis.coverage.match, REVIEW).toBe(1);
    expect(analysis.coverage.exactEntryMatches).toBe(1);
    const matched = analysis.comparisons.filter((c) => c.outcome === "MATCH");
    expect(matched.map((c) => c.decision.observedToken)).toEqual(["garrote"]);
  });

  it("rejects the real low-combo-point Envenom", () => {
    const rejected = analyzeObservedAssassinationDecisions({
      state: m5aState(),
      actorId: ASSASSINATION_ACTOR_B,
      specId: ASSASSINATION_SPEC_ID,
      targetActorId: null,
    });
    if (rejected.status !== "ANALYZED") throw new Error("expected ANALYZED");
    expect(rejected.coverage.rejected, REVIEW).toBe(1);
    expect(rejected.comparisons[0]?.basis).toBe("OBSERVED_ACTION_REJECTED_BY_AUTHORITY");
  });

  it("keeps the eligible denominator and its partition intact", () => {
    if (analysis.status !== "ANALYZED") throw new Error("expected ANALYZED");
    const c = analysis.coverage;
    expect(c.match + c.rejected + c.unknown).toBe(c.eligibleDecisions);
    expect(c.eligibleDecisions, REVIEW).toBe(11);
  });
});

describe("an unsupported specialization never reaches the Assassination analyzer", () => {
  it("is the only supported spec in Milestone 5", () => {
    expect(ASSASSINATION_SPEC_ID).toBe("rogue/assassination");
  });

  it("refuses every other spec before evaluating anything", () => {
    for (const spec of ["rogue/outlaw", "rogue/subtlety", "paladin/protection", "priest/discipline"]) {
      const result = analyzeObservedAssassinationDecisions({
        state: m5d2State(),
        actorId: M5D2_ACTOR,
        specId: spec,
        targetActorId: M5D2_TARGET,
      });
      expect(`${spec}=${result.status}`).toBe(`${spec}=SPEC_NOT_SUPPORTED`);
    }
  });
});

describe("the M4 state vocabulary is untouched by everything above", () => {
  it("still declares exactly the certainties M4 defined", () => {
    // M5 consumes M4 facts and must never redefine them. Restated at closeout
    // because five milestones of judgment work is exactly when a vocabulary
    // starts acquiring a convenient extra member.
    expect([...STATE_CERTAINTIES]).toEqual(["EXACT", "BOUNDED", "STALE", "UNKNOWN"]);
  });

  it("still declares the same unknown reasons", () => {
    expect(UNKNOWN_REASONS.length).toBeGreaterThan(0);
    for (const reason of UNKNOWN_REASONS) expect(reason).toMatch(/^[A-Z][A-Z_]+$/);
  });
});

describe("the /v1/analysis wiring decision is what the code does", () => {
  const service = readFileSync("src/services/analysis-service.ts", "utf8");

  it("is wired now, and says nothing to the contrary", () => {
    // M5-E deliberately kept 501 rather than rush the composition; M6-E built
    // it. What survives from that decision is the rule it protected: the
    // service must never claim less capability than it has, and never more.
    expect(service).not.toContain("ANALYSIS_NOT_IMPLEMENTED");
    expect(service).not.toContain("no analyzer is enabled, so no combat events are retrieved");
    expect(service).not.toContain("This deployment is a Milestone 2 foundation.");
    expect(service).not.toContain("not yet wired");
  });

  it("reaches the analyzer only through the registry", () => {
    // Composed, but still not by naming a specialization evaluator here. The
    // service selects a registration and calls its facade.
    expect(service).toContain("analyzer.analyze(");
    expect(service).not.toContain("analyzeObservedAssassinationDecisions(");
  });
});

describe("no coaching vocabulary reaches the M5 output layer", () => {
  const OUTPUT_LAYER = [
    "src/specs/rogue/assassination/observed-comparison.ts",
    "src/specs/rogue/assassination/observed-analysis.ts",
    "src/specs/rogue/assassination/decision-coverage.ts",
  ];

  it("declares no correctness, optimality or severity vocabulary", () => {
    for (const path of OUTPUT_LAYER) {
      const code = readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const banned of [
        '"CORRECT"',
        '"OPTIMAL"',
        '"MISTAKE"',
        "severity",
        "shouldHave",
        "parseQuality",
        "minorMistake",
        "majorMistake",
      ]) {
        expect(`${path} declares ${banned}: ${String(code.includes(banned))}`).toBe(
          `${path} declares ${banned}: false`,
        );
      }
    }
  });
});
