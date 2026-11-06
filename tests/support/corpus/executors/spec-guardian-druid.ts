/**
 * SPEC_GUARDIAN_DRUID executor (ONB-T2): the one assertion this INTERNAL_ONLY slice has without committed
 * events, the facade's refusal of every other specialization. It has no retained subject, and it resolves nothing, so no decision case exists (agent/follow-ups.md "After ONB-T2").
 */

import { stateOf } from "../fight.js";
import { analyzeObservedGuardianDruidDecisions } from "../../../../src/specs/druid/guardian/observed-analysis.js";
import type { LoadedArtifact, LoadedCorpus } from "../loader.js";
import { fail, pass, type AssertionOutcome } from "./outcome.js";
import type { ParamsOf } from "./params.js";

export function specGate(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_GUARDIAN_DRUID.SPEC_GATE">,
): AssertionOutcome {
  const analysis = analyzeObservedGuardianDruidDecisions({
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
