/**
 * SPEC_FURY_WARRIOR executor (ONB-A2): the one assertion this INTERNAL_ONLY slice has without real
 * evidence, the facade's refusal of every other specialization. No retained capture holds this
 * specialization's events, so no decision case exists (agent/follow-ups.md "After ONB-A2").
 */

import { stateOf } from "../fight.js";
import { analyzeObservedFuryWarriorDecisions } from "../../../../src/specs/warrior/fury/observed-analysis.js";
import type { LoadedArtifact, LoadedCorpus } from "../loader.js";
import { fail, pass, type AssertionOutcome } from "./outcome.js";
import type { ParamsOf } from "./params.js";

export function specGate(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_FURY_WARRIOR.SPEC_GATE">,
): AssertionOutcome {
  const analysis = analyzeObservedFuryWarriorDecisions({
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
