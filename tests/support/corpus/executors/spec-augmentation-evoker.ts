/**
 * SPEC_AUGMENTATION_EVOKER executors (M13-E; PUBLIC since M13-F): the
 * Augmentation Evoker registration, as orchestration holds it.
 *
 * Driven through the production catalog's internal lookup and `runAnalyzer`,
 * so what is pinned is the registration row — its derived requirement, its
 * own authority access and its ownership-checked result — not a direct call
 * to the evaluator. Since M13-F the public lookup must find the SAME row.
 */

import {
  analyzerForSpec,
  internalAnalyzerForSpec,
  PRODUCTION_CATALOG,
  runAnalyzer,
} from "../../../../src/services/analyzer-registry.js";
import type { AugmentationEvokerAnalysis } from "../../../../src/specs/evoker/augmentation/registration.js";
import { stateOf } from "../fight.js";
import type { LoadedArtifact, LoadedCorpus } from "../loader.js";
import { fail, pass, type AssertionOutcome } from "./outcome.js";
import type { ParamsOf } from "./params.js";

const SPEC_ID = "evoker/augmentation";

export function registrationResult(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_AUGMENTATION_EVOKER.REGISTRATION_RESULT">,
): AssertionOutcome {
  const registration = internalAnalyzerForSpec(SPEC_ID, PRODUCTION_CATALOG);
  if (registration === null) {
    return fail("the production catalog carries no Augmentation registration", {
      expected: { registered: true },
      actual: { registered: false },
    });
  }
  const publicRow = analyzerForSpec(SPEC_ID, PRODUCTION_CATALOG);
  if (publicRow !== registration) {
    return fail("the public lookup does not select the same Augmentation registration", {
      expected: { publicAnalyzer: registration.analyzerId },
      actual: { publicAnalyzer: publicRow?.analyzerId ?? null },
    });
  }
  const run = runAnalyzer(registration, {
    state: stateOf(corpus, artifact),
    actorId: params.actorId,
    specId: SPEC_ID,
    targetActorId: null,
  });
  if (!run.ok) {
    return fail("the registration returned a result it does not own", {
      expected: { ok: true },
      actual: { ok: false, detail: run.detail },
    });
  }
  if (run.analysis.status === "ANALYZED") {
    return fail("an authority-free registration returned ANALYZED", {
      expected: { status: params.expected.status },
      actual: { status: run.analysis.status },
    });
  }
  // The payload is read here, in the specialization's own layer, and nowhere in shared code.
  const analysis = run.analysis as unknown as AugmentationEvokerAnalysis;
  const subject = analysis.subjectSpecialization;
  const actual = {
    requiredScope: registration.requirement.requiredScope,
    status: analysis.status,
    domains: analysis.domains.map((entry) => ({ domain: entry.domain, resolution: entry.resolution })),
    subjectSpecialization: subject.state === "STATED" ? "STATED" : subject.reason,
    evaluationState: analysis.evaluation?.state ?? null,
  };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the registration answered differently than the case pins", {
      expected: params.expected,
      actual,
    });
  }
  return pass();
}
