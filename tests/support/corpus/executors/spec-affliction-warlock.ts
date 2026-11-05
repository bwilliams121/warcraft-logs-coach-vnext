/**
 * SPEC_AFFLICTION_WARLOCK executor (ONB-D4): the one assertion this INTERNAL_ONLY slice has without committed
 * events, the facade's refusal of every other specialization. It has no retained subject with combatant info, and its events
 * resolve nothing, so no decision case exists (agent/follow-ups.md "After ONB-D4").
 */

import { stateOf } from "../fight.js";
import { analyzeObservedAfflictionWarlockDecisions } from "../../../../src/specs/warlock/affliction/observed-analysis.js";
import type { LoadedArtifact, LoadedCorpus } from "../loader.js";
import { fail, pass, type AssertionOutcome } from "./outcome.js";
import type { ParamsOf } from "./params.js";

export function specGate(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_AFFLICTION_WARLOCK.SPEC_GATE">,
): AssertionOutcome {
  const analysis = analyzeObservedAfflictionWarlockDecisions({
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
