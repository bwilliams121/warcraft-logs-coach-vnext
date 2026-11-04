/**
 * SPEC_ARMS_WARRIOR executors (ONB-B1): the facade's refusal of every other specialization, and the
 * real first seconds of fight 48's Arms Warrior, where no decision resolves and an open debuff window
 * is not counted (agent/follow-ups.md "After ONB-B1").
 */

import { stateOf } from "../fight.js";
import { analyzeObservedArmsWarriorDecisions } from "../../../../src/specs/warrior/arms/observed-analysis.js";
import type { LoadedArtifact, LoadedCorpus } from "../loader.js";
import { fail, pass, type AssertionOutcome } from "./outcome.js";
import type { ParamsOf } from "./params.js";

export function coverageSummary(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_ARMS_WARRIOR.COVERAGE_SUMMARY">,
): AssertionOutcome {
  const analysis = analyzeObservedArmsWarriorDecisions({
    state: stateOf(corpus, artifact),
    actorId: params.actorId,
    specId: "warrior/arms",
    targetActorId: null,
  });
  if (analysis.status !== "ANALYZED") {
    return fail("the facade did not analyze the capture", {
      expected: { status: "ANALYZED" },
      actual: { status: analysis.status },
    });
  }
  const { coverage, colossusSmashWindows, build } = analysis;
  const notEstablished: Record<string, number> = {};
  let established = 0;
  for (const window of colossusSmashWindows.windows) {
    if (window.state === "ESTABLISHED") established += 1;
    else notEstablished[window.reason] = (notEstablished[window.reason] ?? 0) + 1;
  }
  const actual = {
    heroTree: build.heroTree.state === "RESOLVED" ? build.heroTree.simcName : build.heroTree.state,
    eligibleDecisions: coverage.eligibleDecisions,
    match: coverage.match,
    rejected: coverage.rejected,
    unknown: coverage.unknown,
    exclusions: Object.fromEntries(coverage.exclusions.map((row) => [row.key, row.count])),
    eligibleTokens: Object.fromEntries(coverage.eligibleTokens.map((row) => [row.key, row.count])),
    unresolvedAt: Object.fromEntries(coverage.unresolvedAt.map((row) => [row.key, row.count])),
    stoppingAtoms: Object.fromEntries(coverage.stoppingAtoms.map((row) => [row.key, row.count])),
    colossusSmashWindows: { status: colossusSmashWindows.status, established, notEstablished },
  };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the evaluator's coverage disclosure differs from the case", {
      expected: params.expected,
      actual,
    });
  }
  return pass();
}

export function specGate(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_ARMS_WARRIOR.SPEC_GATE">,
): AssertionOutcome {
  const analysis = analyzeObservedArmsWarriorDecisions({
    state: stateOf(corpus, artifact),
    actorId: params.actorId,
    specId: params.specId,
    targetActorId: null,
  });
  if (analysis.status !== "SPEC_NOT_SUPPORTED") {
    return fail("the facade did not refuse the specialization", {
      expected: { status: "SPEC_NOT_SUPPORTED" },
      actual: { status: analysis.status },
    });
  }
  return analysis.specId === params.specId
    ? pass()
    : fail("the refusal names a different specialization", {
        expected: { specId: params.specId },
        actual: { specId: analysis.specId },
      });
}
