/**
 * SPEC_MISTWEAVER_MONK executors (HEAL-B1): the INTERNAL_ONLY Mistweaver Monk
 * registration, as orchestration holds it.
 *
 * Driven through the production catalog's internal lookup and `runAnalyzer`,
 * so what is pinned is the registration row — its derived requirement, its
 * own authority access and its ownership-checked result — not a direct call
 * to the evaluator. The public lookup is asserted to find nothing.
 */

import {
  analyzerForSpec,
  internalAnalyzerForSpec,
  PRODUCTION_CATALOG,
  runAnalyzer,
} from "../../../../src/services/analyzer-registry.js";
import type { MistweaverMonkAnalysis } from "../../../../src/specs/monk/mistweaver/registration.js";
import { stateOf } from "../fight.js";
import type { LoadedArtifact, LoadedCorpus } from "../loader.js";
import { fail, pass, type AssertionOutcome } from "./outcome.js";
import type { ParamsOf } from "./params.js";

const SPEC_ID = "monk/mistweaver";

export function registrationResult(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_MISTWEAVER_MONK.REGISTRATION_RESULT">,
): AssertionOutcome {
  const registration = internalAnalyzerForSpec(SPEC_ID, PRODUCTION_CATALOG);
  if (registration === null) {
    return fail("the production catalog carries no Mistweaver Monk registration", {
      expected: { registered: true },
      actual: { registered: false },
    });
  }
  if (analyzerForSpec(SPEC_ID, PRODUCTION_CATALOG) !== null) {
    return fail("the public lookup selects the INTERNAL_ONLY Mistweaver Monk registration", {
      expected: { publicAnalyzer: null },
      actual: { publicAnalyzer: registration.analyzerId },
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
  const analysis = run.analysis as unknown as MistweaverMonkAnalysis;
  const subject = analysis.subjectSpecialization;
  const findings = analysis.healerFindings;
  const actual = {
    requiredScope: registration.requirement.requiredScope,
    status: analysis.status,
    domains: analysis.domains.map((entry) => ({ domain: entry.domain, resolution: entry.resolution })),
    subjectSpecialization: subject.state === "STATED" ? "STATED" : subject.reason,
    evaluationState: analysis.evaluation?.state ?? null,
    healerFindings: findings.assessment === "ASSESSED" ? "ASSESSED" : findings.reason,
  };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the registration answered differently than the case pins", {
      expected: params.expected,
      actual,
    });
  }
  return pass();
}
