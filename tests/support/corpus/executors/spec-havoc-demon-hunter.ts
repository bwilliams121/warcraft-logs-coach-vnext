/**
 * SPEC_HAVOC_DEMON_HUNTER executors (ONB-A1; INTERNAL_ONLY): the internal Havoc
 * Demon Hunter evaluator over a sanitized capture, driven through the registration
 * as orchestration holds it, under the committed pinned authority.
 *
 * Everything an assertion pins comes off the payload the facade returned. Nothing
 * here derives a verdict.
 */

import { positionOfCast, stateOf, stateOfBundle, BundleCompositionError, type BundleHole } from "../fight.js";
import type { CombatState } from "../../../../src/engine/state/combat-state.js";
import {
  analyzeObservedHavocDemonHunterDecisions,
  type HavocDemonHunterAnalysis,
} from "../../../../src/specs/demonhunter/havoc/observed-analysis.js";
import { HAVOC_DEMON_HUNTER_REGISTRATION } from "../../../../src/specs/demonhunter/havoc/registration.js";
import { HAVOC_DEMON_HUNTER_SPEC_ID } from "../../../../src/specs/demonhunter/havoc/spec.js";
import type { CorpusExecutionContext } from "../execution-context.js";
import type { LoadedArtifact, LoadedCase, LoadedCorpus } from "../loader.js";
import { fail, pass, type AssertionOutcome } from "./outcome.js";
import type { ParamsOf } from "./params.js";

type Analyzed = Extract<HavocDemonHunterAnalysis, { status: "ANALYZED" }>;

interface BundleRequest {
  readonly historyArtifactIds: readonly string[];
  readonly declaredHoles: readonly BundleHole[];
}

function bundleRequestOf(params: {
  readonly historyArtifactIds?: readonly string[] | undefined;
  readonly declaredHoles?: readonly BundleHole[] | undefined;
}): BundleRequest | null {
  if (params.historyArtifactIds === undefined || params.historyArtifactIds.length === 0) return null;
  return { historyArtifactIds: params.historyArtifactIds, declaredHoles: params.declaredHoles ?? [] };
}

function partIdsOf(artifact: LoadedArtifact, bundle: BundleRequest): readonly string[] {
  return [...bundle.historyArtifactIds, artifact.record.artifactId];
}

function analysisOf(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  actorId: number,
  targetActorId: number | null,
  bundle: BundleRequest | null,
): { readonly state: CombatState; readonly analysis: HavocDemonHunterAnalysis } {
  const key = JSON.stringify({
    derivation: "HAVOC_DEMON_HUNTER_REGISTRATION.analyze",
    analyzerId: HAVOC_DEMON_HUNTER_REGISTRATION.analyzerId,
    artifactSha256: artifact.record.sha256,
    parts: bundle === null ? [artifact.record.artifactId] : partIdsOf(artifact, bundle),
    actorId,
    targetActorId,
  });
  return context.memo.once(key, () => {
    const state =
      bundle === null
        ? stateOf(corpus, artifact)
        : stateOfBundle(corpus, partIdsOf(artifact, bundle), bundle.declaredHoles);
    const analysis = HAVOC_DEMON_HUNTER_REGISTRATION.analyze({
      state,
      actorId,
      specId: HAVOC_DEMON_HUNTER_SPEC_ID,
      targetActorId,
    }) as HavocDemonHunterAnalysis;
    return { state, analysis };
  });
}

function analyzedOrFail(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  actorId: number,
  targetActorId: number | null,
  bundle: BundleRequest | null,
):
  | { readonly ok: true; readonly state: CombatState; readonly analysis: Analyzed }
  | { readonly ok: false; readonly outcome: AssertionOutcome } {
  let derived: ReturnType<typeof analysisOf>;
  try {
    derived = analysisOf(context, corpus, artifact, actorId, targetActorId, bundle);
  } catch (error) {
    if (error instanceof BundleCompositionError) {
      return { ok: false, outcome: fail(error.message, { expected: { composed: true } }) };
    }
    throw error;
  }
  const { state, analysis } = derived;
  if (analysis.status !== "ANALYZED") {
    return {
      ok: false,
      outcome: fail("the registration did not analyze the actor", {
        expected: { status: "ANALYZED" },
        actual: { status: analysis.status, detail: analysis.detail },
      }),
    };
  }
  const pinned = kase.record.authority?.artifactRevision ?? null;
  if (pinned !== analysis.authority.artifactRevision) {
    return {
      ok: false,
      outcome: fail("the analysis ran under a different authority revision than the case pins", {
        expected: { artifactRevision: pinned },
        actual: { artifactRevision: analysis.authority.artifactRevision },
      }),
    };
  }
  return { ok: true, state, analysis };
}

export function decisionCoverage(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_HAVOC_DEMON_HUNTER.DECISION_COVERAGE">,
): AssertionOutcome {
  const run = analyzedOrFail(
    context,
    corpus,
    kase,
    artifact,
    params.actorId,
    params.targetActorId,
    bundleRequestOf(params),
  );
  if (!run.ok) return run.outcome;
  const found = positionOfCast(run.state, {
    actorId: params.actorId,
    reportTimeMs: params.observedCast.reportTimeMs,
    abilityGameId: params.observedCast.abilityGameId,
  });
  if (!found.ok) return fail(found.detail, { expected: params.observedCast });
  const index = run.analysis.comparisons.findIndex((entry) => entry.decision.position === found.position);
  const comparison = run.analysis.comparisons[index];
  const resolved = run.analysis.resolved[index];
  if (comparison === undefined || resolved === undefined) {
    return fail("the observed cast is not an eligible decision", { expected: params.observedCast });
  }
  const { selection, unselectability } = resolved;
  const actual = {
    outcome: comparison.outcome,
    basis: comparison.basis,
    authorityToken: comparison.authorityToken,
    selectionPrecision: comparison.selectionPrecision,
    decisiveBlocker: comparison.decisiveBlocker,
    rawBlocker: comparison.rawBlocker,
    unresolvedAt: selection.blockedAt,
    selectedEntry: selection.selectedEntry,
    unselectabilityProven: unselectability.proven,
    unselectabilityRefusal: unselectability.refusal,
  };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the evaluator compared the observed cast differently than the case pins", {
      expected: params.expected,
      actual,
      locator: comparison.decision.locator,
    });
  }
  return pass();
}

export function coverageSummary(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_HAVOC_DEMON_HUNTER.COVERAGE_SUMMARY">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const { coverage } = run.analysis;
  const actual = {
    eligibleDecisions: coverage.eligibleDecisions,
    match: coverage.match,
    rejected: coverage.rejected,
    unknown: coverage.unknown,
    exclusions: Object.fromEntries(coverage.exclusions.map((row) => [row.key, row.count])),
    unresolvedAt: Object.fromEntries(coverage.unresolvedAt.map((row) => [row.key, row.count])),
  };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the evaluator's coverage disclosure differs from the case", {
      expected: params.expected,
      actual,
    });
  }
  if (coverage.match + coverage.rejected + coverage.unknown !== coverage.eligibleDecisions) {
    return fail("the three outcomes do not partition the eligible decisions", { actual: coverage });
  }
  return pass();
}

export function specGate(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_HAVOC_DEMON_HUNTER.SPEC_GATE">,
): AssertionOutcome {
  const analysis = analyzeObservedHavocDemonHunterDecisions({
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
