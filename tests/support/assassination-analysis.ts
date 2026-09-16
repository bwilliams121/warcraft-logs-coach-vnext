/**
 * Typed access to Assassination's payload from a spec-neutral envelope.
 *
 * Since M10-A `FightAnalysis.analysis` is the envelope every analyzer shares,
 * and the Rogue payload (comparisons, exclusions, coverage) is Assassination's
 * own. A test that legitimately reads that payload — because it is asserting
 * about Assassination — narrows through here, which checks the envelope really
 * is Assassination's before handing the payload back. No production module
 * narrows this way; production reads the registration's view.
 */

import type { SpecAnalysisEnvelope } from "../../src/findings/analysis-envelope.js";
import type { FightAnalysis } from "../../src/services/result.js";
import { ASSASSINATION_SPEC_ID } from "../../src/specs/rogue/assassination/evaluator.js";
import type { ObservedAssassinationAnalysis } from "../../src/specs/rogue/assassination/observed-analysis.js";

export type AnalyzedAssassination = Extract<ObservedAssassinationAnalysis, { status: "ANALYZED" }>;

/** The envelope as Assassination's own result. Throws for any other specialization. */
export function asAssassinationAnalysis(analysis: SpecAnalysisEnvelope): ObservedAssassinationAnalysis {
  if (analysis.status === "ANALYZED" && analysis.specId !== ASSASSINATION_SPEC_ID) {
    throw new Error(`expected an Assassination analysis, got one for '${analysis.specId}'`);
  }
  return analysis as ObservedAssassinationAnalysis;
}

/** The analyzed Assassination payload. Throws when the analysis did not analyze. */
export function analyzedAssassination(analysis: SpecAnalysisEnvelope): AnalyzedAssassination {
  const narrowed = asAssassinationAnalysis(analysis);
  if (narrowed.status !== "ANALYZED") {
    throw new Error(`expected an ANALYZED result, got ${narrowed.status}`);
  }
  return narrowed;
}

/** The analyzed Assassination payload of a `FightAnalysis`. */
export function analyzedAssassinationOf(fightAnalysis: FightAnalysis): AnalyzedAssassination {
  return analyzedAssassination(fightAnalysis.analysis);
}
