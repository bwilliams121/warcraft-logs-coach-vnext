/**
 * SPEC_BLOOD_DEATH_KNIGHT executors (M11-B2, INTERNAL_ONLY): the real Blood
 * Death Knight registration over a real corpus artifact.
 *
 * The analysis is obtained through the REGISTRATION — `registration.analyze`,
 * which checks input and result ownership and hands the facade the
 * registration's own authority access — never by calling the facade with a
 * hand-built authority. No transport, no service, no network: the corpus
 * fight builder supplies the state, and everything between it and the
 * outcome is production code from `src/specs/deathknight/blood/`.
 *
 * ONE REAL ANALYSIS PER INPUT PER RUN, memoised through the run's own
 * `CorpusExecutionContext` exactly as the Paladin executors do; bundles
 * (`historyArtifactIds` + `declaredHoles`) compose one fight through the
 * shared bundle composer, and `evaluationWindow` only restricts what an
 * aggregate assertion counts.
 */

import type { CombatState } from "../../../../src/engine/state/combat-state.js";
import { BLOOD_DEATH_KNIGHT_SPEC_ID } from "../../../../src/specs/deathknight/blood/spec.js";
import {
  analyzeObservedBloodDeathKnightDecisions,
  summarizeBloodDecisions,
  type BloodDeathKnightAnalysis,
} from "../../../../src/specs/deathknight/blood/observed-analysis.js";
import { BLOOD_DEATH_KNIGHT_REGISTRATION } from "../../../../src/specs/deathknight/blood/registration.js";
import {
  resolveBloodApplicability,
  type BloodBuildFacts,
} from "../../../../src/specs/deathknight/blood/action-profile.js";
import { pinnedBloodDeathKnightAuthority } from "../../../../src/specs/deathknight/blood/pinned-authority.js";
import { marrowrendAffordabilityProven } from "../../../../src/specs/deathknight/blood/rune-affordability.js";
import { bloodDebtTransitionCensus } from "../../m11/blood-debt-census.js";
import type { CorpusExecutionContext } from "../execution-context.js";
import { BundleCompositionError, positionOfCast, stateOf, stateOfBundle, type BundleHole } from "../fight.js";
import type { LoadedArtifact, LoadedCase, LoadedCorpus } from "../loader.js";
import { fail, pass, type AssertionOutcome } from "./outcome.js";
import type { ParamsOf } from "./params.js";

type Analyzed = Extract<BloodDeathKnightAnalysis, { status: "ANALYZED" }>;

function analysisFacts(analysis: BloodDeathKnightAnalysis): unknown {
  return analysis.status === "ANALYZED"
    ? {
        status: analysis.status,
        comparisons: analysis.comparisons.length,
        artifactRevision: analysis.authority.artifactRevision,
      }
    : { status: analysis.status, detail: analysis.detail };
}

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

function partsOf(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  bundle: BundleRequest,
): readonly LoadedArtifact[] {
  const parts = bundle.historyArtifactIds.map((artifactId) => {
    const part = corpus.artifacts.find((entry) => entry.record.artifactId === artifactId);
    if (part === undefined) throw new BundleCompositionError(`unknown artifact ${artifactId}`);
    return part;
  });
  return [...parts, artifact];
}

function analysisOf(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  actorId: number,
  targetActorId: number | null,
  bundle: BundleRequest | null,
): { readonly state: CombatState; readonly analysis: BloodDeathKnightAnalysis } {
  const parts = bundle === null ? [artifact] : partsOf(corpus, artifact, bundle);
  const key = JSON.stringify({
    derivation: "BLOOD_DEATH_KNIGHT_REGISTRATION.analyze",
    analyzerId: BLOOD_DEATH_KNIGHT_REGISTRATION.analyzerId,
    parts: parts.map((part) => ({
      artifactId: part.record.artifactId,
      artifactSha256: part.record.sha256,
      provenance: part.record.provenance,
    })),
    declaredHoles: bundle?.declaredHoles ?? [],
    actorId,
    specId: BLOOD_DEATH_KNIGHT_SPEC_ID,
    targetActorId,
  });
  return context.memo.once(key, () => {
    const state =
      bundle === null
        ? stateOf(corpus, artifact)
        : stateOfBundle(
            corpus,
            parts.map((part) => part.record.artifactId),
            bundle.declaredHoles,
          );
    const analysis = BLOOD_DEATH_KNIGHT_REGISTRATION.analyze({
      state,
      actorId,
      specId: BLOOD_DEATH_KNIGHT_SPEC_ID,
      targetActorId,
    }) as BloodDeathKnightAnalysis;
    return { state, analysis };
  });
}

function analyzedOrFail(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  actorId: number,
  targetActorId: number | null = null,
  bundle: BundleRequest | null = null,
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
        actual: analysisFacts(analysis),
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

function castPosition(
  state: CombatState,
  actorId: number,
  cast: { readonly reportTimeMs: number; readonly abilityGameId: number },
):
  | { readonly ok: true; readonly position: number }
  | { readonly ok: false; readonly outcome: AssertionOutcome } {
  const found = positionOfCast(state, { actorId, ...cast });
  if (!found.ok) return { ok: false, outcome: fail(found.detail, { expected: cast }) };
  return found;
}

function insideWindow(
  reportTimeMs: number,
  window: { readonly fromReportTimeMs: number; readonly toReportTimeMs: number },
): boolean {
  return reportTimeMs >= window.fromReportTimeMs && reportTimeMs <= window.toReportTimeMs;
}

function resolvedAt(
  run: { readonly state: CombatState; readonly analysis: Analyzed },
  actorId: number,
  cast: { readonly reportTimeMs: number; readonly abilityGameId: number },
):
  | { readonly ok: true; readonly position: number; readonly resolved: Analyzed["resolved"][number] }
  | { readonly ok: false; readonly outcome: AssertionOutcome } {
  const position = castPosition(run.state, actorId, cast);
  if (!position.ok) return position;
  const resolved = run.analysis.resolved.find((entry) => entry.position === position.position);
  if (resolved === undefined) {
    const excluded = run.analysis.excluded.find((entry) => entry.position === position.position);
    return {
      ok: false,
      outcome: fail("the observed cast is not an eligible decision", {
        expected: { eligible: true },
        actual: excluded === undefined ? { eligible: false } : { eligible: false, reason: excluded.reason },
        locator: run.state.locatorAt(position.position),
      }),
    };
  }
  return { ok: true, position: position.position, resolved };
}

const sorted = (entries: Iterable<[string, number]>) =>
  Object.fromEntries([...entries].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));

export function authorityProvenance(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BLOOD_DEATH_KNIGHT.AUTHORITY_PROVENANCE">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const { authority } = run.analysis;
  const loaded = pinnedBloodDeathKnightAuthority();
  const guards = loaded.ok
    ? (loaded.authority.artifact.provenance.conditionalCompilation?.guards.length ?? null)
    : null;
  const actual = {
    authorityId: authority.authorityId,
    artifactRevision: authority.artifactRevision,
    commitSha: authority.commitSha,
    sourcePath: authority.sourcePath,
    sourceSha256: authority.sourceSha256,
    conditionalCompilationGuards: guards,
  };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the analysis cites different authority provenance than the case pins", {
      expected: params.expected,
      actual,
    });
  }
  return pass();
}

export function decisionCoverage(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BLOOD_DEATH_KNIGHT.DECISION_COVERAGE">,
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
  const position = castPosition(run.state, params.actorId, params.observedCast);
  if (!position.ok) return position.outcome;
  const comparison = run.analysis.comparisons.find((entry) => entry.decision.position === position.position);
  if (comparison === undefined) {
    const excluded = run.analysis.excluded.find((entry) => entry.position === position.position);
    return fail("the observed cast is not an eligible decision", {
      expected: { eligible: true },
      actual: excluded === undefined ? { eligible: false } : { eligible: false, reason: excluded.reason },
      locator: run.state.locatorAt(position.position),
    });
  }
  const resolved = run.analysis.resolved.find((entry) => entry.position === position.position);
  const stop = resolved?.selection.stoppingPoint ?? null;
  const actual = {
    outcome: comparison.outcome,
    basis: comparison.basis,
    authorityCoverage: comparison.authorityCoverage,
    authorityToken: comparison.authorityToken,
    selectionPrecision: comparison.selectionPrecision,
    decisiveBlocker: comparison.decisiveBlocker,
    rawBlocker: comparison.rawBlocker,
    observedActionRejected: comparison.observedActionRejected,
    unselectabilityProven: resolved?.unselectability.proven ?? null,
    unselectabilityRefusal: resolved?.unselectability.refusal ?? null,
    stoppingAt: stop === null ? null : stop.at,
    stoppingAtoms: stop === null ? [] : [...stop.atoms],
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
  params: ParamsOf<"SPEC_BLOOD_DEATH_KNIGHT.COVERAGE_SUMMARY">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const window = params.evaluationWindow ?? null;
  const coverage =
    window === null
      ? run.analysis.coverage
      : summarizeBloodDecisions(
          params.actorId,
          run.analysis.comparisons.filter((entry) => insideWindow(entry.decision.reportTimeMs, window)),
          run.analysis.excluded.filter((entry) => insideWindow(entry.reportTimeMs, window)),
          run.analysis.resolved.filter((entry) =>
            run.analysis.comparisons.some(
              (comparison) =>
                comparison.decision.position === entry.position &&
                insideWindow(comparison.decision.reportTimeMs, window),
            ),
          ),
        );
  const actual = {
    eligibleDecisions: coverage.eligibleDecisions,
    match: coverage.match,
    rejected: coverage.rejected,
    unknown: coverage.unknown,
    exclusions: Object.fromEntries(coverage.exclusions.map((row) => [row.key, row.count])),
  };
  const expected = {
    ...params.expected,
    exclusions: Object.fromEntries(Object.entries(params.expected.exclusions)),
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return fail("the evaluator's coverage disclosure differs from the case", { expected, actual });
  }
  if (coverage.match + coverage.rejected + coverage.unknown !== coverage.eligibleDecisions) {
    return fail("the three outcomes do not partition the eligible decisions", { actual: coverage });
  }
  return pass();
}

export function stoppingPointDistribution(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BLOOD_DEATH_KNIGHT.STOPPING_POINT_DISTRIBUTION">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const window = params.evaluationWindow ?? null;
  const comparisons =
    window === null
      ? run.analysis.comparisons
      : run.analysis.comparisons.filter((entry) => insideWindow(entry.decision.reportTimeMs, window));
  const resolved = run.analysis.resolved.filter((entry) =>
    comparisons.some((comparison) => comparison.decision.position === entry.position),
  );
  const coverage = summarizeBloodDecisions(params.actorId, comparisons, [], resolved);
  for (const comparison of comparisons) {
    if (comparison.outcome !== "UNKNOWN") continue;
    const entry = resolved.find((row) => row.position === comparison.decision.position);
    if (entry === undefined || entry.selection.blockedAt === null) {
      return fail("an UNKNOWN decision carries no engine blocker", {
        actual: { outcome: comparison.outcome, rawBlocker: comparison.rawBlocker },
        locator: comparison.decision.locator,
      });
    }
  }
  const actual = {
    match: coverage.match,
    rejected: coverage.rejected,
    stoppingEntries: sorted(coverage.stoppingEntries.map((row) => [row.key, row.count])),
    stoppingAtoms: sorted(coverage.stoppingAtoms.map((row) => [row.key, row.count])),
    dispatchOutcomes: sorted(coverage.dispatchOutcomes.map((row) => [row.key, row.count])),
    undecidedGcdCandidates: sorted(coverage.undecidedGcdCandidates.map((row) => [row.key, row.count])),
  };
  const expected = {
    match: params.expected.match,
    rejected: params.expected.rejected,
    stoppingEntries: sorted(Object.entries(params.expected.stoppingEntries)),
    stoppingAtoms: sorted(Object.entries(params.expected.stoppingAtoms)),
    dispatchOutcomes: sorted(Object.entries(params.expected.dispatchOutcomes)),
    undecidedGcdCandidates: sorted(Object.entries(params.expected.undecidedGcdCandidates)),
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return fail("the stopping points distribute differently than the case pins", { expected, actual });
  }
  const stopped = Object.values(actual.stoppingEntries).reduce((sum, count) => sum + count, 0);
  if (stopped !== comparisons.length) {
    return fail("the stopping entries do not cover the eligible population", {
      expected: { stopped: comparisons.length },
      actual: { stopped },
    });
  }
  return pass();
}

export function dispatchTraceAt(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BLOOD_DEATH_KNIGHT.DISPATCH_TRACE_AT">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const found = resolvedAt(run, params.actorId, params.observedCast);
  if (!found.ok) return found.outcome;
  const actual = found.resolved.selection.dispatches.map((step) => ({
    at: step.at,
    actionToken: step.actionToken,
    calleeListName: step.calleeListName,
    outcome: step.outcome,
    gate: step.gate,
  }));
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the root scan's dispatch trace at this decision differs from the case", {
      expected: params.expected,
      actual,
      locator: run.state.locatorAt(found.position),
    });
  }
  return pass();
}

export function resourceObservation(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BLOOD_DEATH_KNIGHT.RESOURCE_OBSERVATION">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const position = castPosition(run.state, params.actorId, params.cast);
  if (!position.ok) return position.outcome;
  const record = run.analysis.resources.find((entry) => entry.position === position.position);
  if (record === undefined) {
    return fail("the evaluator recorded no resource observation for this cast", {
      expected: params.cast,
      locator: run.state.locatorAt(position.position),
    });
  }
  const shape = (observation: typeof record.runes) =>
    observation.state === "EXACT_PRE_COST"
      ? { state: observation.state, amount: observation.amount, max: observation.max, cost: observation.cost }
      : { state: observation.state, amount: null, max: null, cost: null };
  const resolved = run.analysis.resolved.find((entry) => entry.position === position.position);
  const actual = {
    runes: shape(record.runes),
    runicPower: shape(record.runicPower),
    runicPowerDeficit: resolved?.diagnostics.runicPowerDeficit ?? null,
    rune: resolved?.diagnostics.rune ?? null,
  };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the resource observations on this cast differ from the case", {
      expected: params.expected,
      actual,
      locator: record.locator,
    });
  }
  return pass();
}

export function auraBindingAt(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BLOOD_DEATH_KNIGHT.AURA_BINDING_AT">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const found = resolvedAt(run, params.actorId, params.observedCast);
  if (!found.ok) return found.outcome;
  const aura = found.resolved.auras.find((entry) => entry.atomName === params.atomName);
  if (aura === undefined) {
    return fail("the evaluator bound no aura atom of this name at this decision", {
      expected: { atomName: params.atomName },
      locator: run.state.locatorAt(found.position),
    });
  }
  const actual =
    aura.state === "BOUND"
      ? {
          state: aura.state,
          up: aura.up,
          abilityGameId: aura.abilityGameId,
          proof: aura.proof,
          anchorReportTimeMs: aura.anchorLocator?.reportTimeMs ?? null,
          reason: null,
          auraReason: null,
        }
      : {
          state: aura.state,
          up: null,
          abilityGameId: aura.abilityGameId,
          proof: null,
          anchorReportTimeMs: null,
          reason: aura.reason,
          auraReason: aura.auraReason,
        };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the aura binding at this decision differs from the case", {
      expected: params.expected,
      actual,
      locator: run.state.locatorAt(found.position),
    });
  }
  return pass();
}

export function stackBindingAt(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BLOOD_DEATH_KNIGHT.STACK_BINDING_AT">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const found = resolvedAt(run, params.actorId, params.observedCast);
  if (!found.ok) return found.outcome;
  const stack = found.resolved.stacks.find((entry) => entry.atomName === params.atomName);
  if (stack === undefined) {
    return fail("the evaluator bound no stack atom of this name at this decision", {
      expected: { atomName: params.atomName },
      locator: run.state.locatorAt(found.position),
    });
  }
  const actual =
    stack.state === "BOUND"
      ? {
          state: stack.state,
          stack: stack.stack,
          proof: stack.proof,
          abilityGameId: stack.abilityGameId,
          reason: null,
          possibleStacks: null,
          windowOrderInvariance: null,
        }
      : stack.state === "BOUND_SET"
        ? {
            state: stack.state,
            stack: null,
            proof: stack.proof,
            abilityGameId: stack.abilityGameId,
            reason: null,
            possibleStacks: [...stack.possibleStacks],
            windowOrderInvariance: {
              cluster: stack.windowOrderInvariance.cluster.map((entry) => ({
                reportTimeMs: entry.reportTimeMs,
                operation: entry.operation,
                isStackChange: entry.isStackChange,
                leadMs: entry.leadMs,
              })),
              beforeClusterStack: stack.windowOrderInvariance.beforeClusterStack,
              beforeClusterProof: stack.windowOrderInvariance.beforeClusterProof,
              afterClusterStack: stack.windowOrderInvariance.afterClusterStack,
            },
          }
        : {
            state: stack.state,
            stack: null,
            proof: null,
            abilityGameId: stack.abilityGameId,
            reason: stack.reason,
            possibleStacks: null,
            windowOrderInvariance: null,
          };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the stack binding at this decision differs from the case", {
      expected: params.expected,
      actual,
      locator: run.state.locatorAt(found.position),
    });
  }
  return pass();
}

export function remainsBindingAt(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BLOOD_DEATH_KNIGHT.REMAINS_BINDING_AT">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const found = resolvedAt(run, params.actorId, params.observedCast);
  if (!found.ok) return found.outcome;
  const remains = found.resolved.remains.find((entry) => entry.atomName === params.atomName);
  if (remains === undefined) {
    return fail("the evaluator bound no remains atom of this name at this decision", {
      expected: { atomName: params.atomName },
      locator: run.state.locatorAt(found.position),
    });
  }
  const actual =
    remains.state === "BOUND"
      ? {
          state: remains.state,
          proof: remains.proof,
          bindingState: remains.binding.state === "UNKNOWN_NUMBER" ? null : remains.binding.state,
          remainsMs: remains.remainsMs,
          anchorReportTimeMs: remains.anchor?.reportTimeMs ?? null,
          reason: null,
          windowLeadMs: null,
          windowOrderInvariance:
            remains.windowOrderInvariance === null
              ? null
              : {
                  cluster: remains.windowOrderInvariance.cluster.map((entry) => ({
                    reportTimeMs: entry.reportTimeMs,
                    operation: entry.operation,
                    isStackChange: entry.isStackChange,
                    leadMs: entry.leadMs,
                  })),
                  beforeClusterMs: remains.windowOrderInvariance.beforeClusterMs,
                  beforeClusterProof: remains.windowOrderInvariance.beforeClusterProof,
                  resetInClusterMs: remains.windowOrderInvariance.resetInClusterMs,
                },
        }
      : {
          state: remains.state,
          proof: null,
          bindingState: null,
          remainsMs: null,
          anchorReportTimeMs: null,
          reason: remains.reason,
          windowLeadMs: remains.windowTransition?.leadMs ?? null,
          windowOrderInvariance: null,
        };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the remains binding at this decision differs from the case", {
      expected: params.expected,
      actual,
      locator: run.state.locatorAt(found.position),
    });
  }
  return pass();
}

export function runicPowerStateAt(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BLOOD_DEATH_KNIGHT.RUNIC_POWER_STATE_AT">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const found = resolvedAt(run, params.actorId, params.observedCast);
  if (!found.ok) return found.outcome;
  const rp = found.resolved.runicPower;
  const actual =
    rp.state === "BOUND"
      ? {
          state: rp.state,
          proof: rp.proof,
          bindingState: rp.binding.state === "UNKNOWN_NUMBER" ? null : rp.binding.state,
          deficitPoints:
            rp.binding.state === "KNOWN_NUMBER"
              ? rp.binding.value
              : rp.binding.state === "BOUNDED_NUMBER"
                ? rp.binding.atLeast
                : null,
          currentWire: rp.currentWire,
          atMostWire: rp.atMostWire,
          maxWire: rp.maxWire,
          anchorReportTimeMs: rp.anchor.reportTimeMs,
          anchorTiming: rp.anchor.timing,
          windowLeadsMs: rp.windowEntries.map((entry) => entry.leadMs),
          reason: null,
        }
      : {
          state: rp.state,
          proof: null,
          bindingState: null,
          deficitPoints: null,
          currentWire: null,
          atMostWire: null,
          maxWire: null,
          anchorReportTimeMs: rp.anchor?.reportTimeMs ?? null,
          anchorTiming: rp.anchor?.timing ?? null,
          windowLeadsMs: [],
          reason: rp.reason,
        };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the Runic Power state at this decision differs from the case", {
      expected: params.expected,
      actual,
      locator: run.state.locatorAt(found.position),
    });
  }
  return pass();
}

export function runicPowerEvidenceCensus(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BLOOD_DEATH_KNIGHT.RUNIC_POWER_EVIDENCE_CENSUS">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const window = params.evaluationWindow ?? null;
  const comparisons =
    window === null
      ? run.analysis.comparisons
      : run.analysis.comparisons.filter((entry) => insideWindow(entry.decision.reportTimeMs, window));
  const resolved = run.analysis.resolved.filter((entry) =>
    comparisons.some((comparison) => comparison.decision.position === entry.position),
  );
  const coverage = summarizeBloodDecisions(params.actorId, comparisons, [], resolved);
  const actual = {
    runicPowerEvidence: sorted(coverage.runicPowerEvidence.map((row) => [row.key, row.count])),
    runicPowerWindowLeads: sorted(coverage.runicPowerWindowLeads.map((row) => [row.key, row.count])),
  };
  const expected = {
    runicPowerEvidence: sorted(Object.entries(params.expected.runicPowerEvidence)),
    runicPowerWindowLeads: sorted(Object.entries(params.expected.runicPowerWindowLeads)),
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return fail("the Runic Power evidence distributes differently than the case pins", { expected, actual });
  }
  const total = Object.values(actual.runicPowerEvidence).reduce((sum, count) => sum + count, 0);
  if (total !== comparisons.length) {
    return fail("the Runic Power evidence does not cover the eligible population", {
      expected: { total: comparisons.length },
      actual: { total },
    });
  }
  return pass();
}

export function runeAffordabilityAt(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BLOOD_DEATH_KNIGHT.RUNE_AFFORDABILITY_AT">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const found = resolvedAt(run, params.actorId, params.observedCast);
  if (!found.ok) return found.outcome;
  const fact = found.resolved.runeAffordability;
  const actual = {
    evidence: fact.evidence,
    runes: fact.runes.state === "EXACT" ? fact.runes.amount : null,
    runesMax: fact.runes.state === "EXACT" ? fact.runes.max : null,
    wireCost: fact.runes.state === "EXACT" ? fact.runes.wireCost : null,
    pinnedRuneCost: fact.marrowrend.state === "PINNED" ? fact.marrowrend.runeCost : null,
    pinnedSpellId: fact.marrowrend.state === "PINNED" ? fact.marrowrend.spellId : null,
    cooldownFree: fact.marrowrend.state === "PINNED" ? fact.marrowrend.cooldownFree : null,
    costModifiersExcluded: fact.costModifiersExcluded,
    marrowrendProvenUsable: marrowrendAffordabilityProven(fact),
  };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the Rune affordability at this decision differs from the case", {
      expected: params.expected,
      actual,
      locator: run.state.locatorAt(found.position),
    });
  }
  // The count, when EXACT, is the decision cast's own recorded observation, verbatim.
  const record = run.analysis.resources.find((entry) => entry.position === found.position);
  const own = record?.runes.state === "EXACT_PRE_COST" ? record.runes.amount : null;
  if (own !== actual.runes) {
    return fail("the Rune affordability count is not the decision cast's own observation", {
      expected: { runes: own },
      actual: { runes: actual.runes },
      locator: run.state.locatorAt(found.position),
    });
  }
  return pass();
}

export function runeAffordabilityCensus(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BLOOD_DEATH_KNIGHT.RUNE_AFFORDABILITY_CENSUS">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const window = params.evaluationWindow ?? null;
  const comparisons =
    window === null
      ? run.analysis.comparisons
      : run.analysis.comparisons.filter((entry) => insideWindow(entry.decision.reportTimeMs, window));
  const resolved = run.analysis.resolved.filter((entry) =>
    comparisons.some((comparison) => comparison.decision.position === entry.position),
  );
  const coverage = summarizeBloodDecisions(params.actorId, comparisons, [], resolved);
  const actual = {
    runeAffordabilityEvidence: sorted(coverage.runeAffordabilityEvidence.map((row) => [row.key, row.count])),
    runeCounts: sorted(coverage.runeCounts.map((row) => [row.key, row.count])),
  };
  const expected = {
    runeAffordabilityEvidence: sorted(Object.entries(params.expected.runeAffordabilityEvidence)),
    runeCounts: sorted(Object.entries(params.expected.runeCounts)),
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return fail("the Rune affordability evidence distributes differently than the case pins", {
      expected,
      actual,
    });
  }
  const total = Object.values(actual.runeAffordabilityEvidence).reduce((sum, count) => sum + count, 0);
  if (total !== comparisons.length) {
    return fail("the Rune affordability evidence does not cover the eligible population", {
      expected: { total: comparisons.length },
      actual: { total },
    });
  }
  return pass();
}

export function stackEvidenceCensus(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BLOOD_DEATH_KNIGHT.STACK_EVIDENCE_CENSUS">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const window = params.evaluationWindow ?? null;
  const comparisons =
    window === null
      ? run.analysis.comparisons
      : run.analysis.comparisons.filter((entry) => insideWindow(entry.decision.reportTimeMs, window));
  const resolved = run.analysis.resolved.filter((entry) =>
    comparisons.some((comparison) => comparison.decision.position === entry.position),
  );
  const coverage = summarizeBloodDecisions(params.actorId, comparisons, [], resolved);
  const actual = {
    stackEvidence: sorted(coverage.stackEvidence.map((row) => [row.key, row.count])),
    stackValues: sorted(coverage.stackValues.map((row) => [row.key, row.count])),
  };
  const expected = {
    stackEvidence: sorted(Object.entries(params.expected.stackEvidence)),
    stackValues: sorted(Object.entries(params.expected.stackValues)),
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return fail("the stack evidence distributes differently than the case pins", { expected, actual });
  }
  // Each atom's rows sum to the eligible population: no decision is uncounted.
  const perAtom = new Map<string, number>();
  for (const [key, count] of Object.entries(actual.stackEvidence)) {
    const atom = key.split(" | ")[0] ?? key;
    perAtom.set(atom, (perAtom.get(atom) ?? 0) + count);
  }
  for (const [atom, total] of perAtom) {
    if (total !== comparisons.length) {
      return fail("the stack evidence does not cover the eligible population", {
        expected: { atom, total: comparisons.length },
        actual: { atom, total },
      });
    }
  }
  return pass();
}

export function bloodDebtTransitionCensusCase(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BLOOD_DEATH_KNIGHT.BLOOD_DEBT_TRANSITION_CENSUS">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const window = params.evaluationWindow ?? null;
  const comparisons =
    window === null
      ? run.analysis.comparisons
      : run.analysis.comparisons.filter((entry) => insideWindow(entry.decision.reportTimeMs, window));
  const census = bloodDebtTransitionCensus(
    run.state,
    params.actorId,
    comparisons.map((entry) => entry.decision.reportTimeMs),
  );
  const actual = {
    transitions: census.transitions,
    stackValues: census.stackValues,
    sameMillisecondPairs: census.sameMillisecondPairs,
    precedingOwnCast: census.precedingOwnCast,
    lagMs: census.lagMs,
    minGapToNextDecisionMs: census.minGapToNextDecisionMs,
    validation: {
      points: census.validation.points,
      consistent: census.validation.consistent,
      inconsistent: census.validation.inconsistent.length,
    },
  };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the Blood Debt transition census differs from the case", {
      expected: params.expected,
      actual: { ...actual, inconsistentDetail: census.validation.inconsistent },
    });
  }
  return pass();
}

export function remainsEvidenceCensus(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BLOOD_DEATH_KNIGHT.REMAINS_EVIDENCE_CENSUS">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const window = params.evaluationWindow ?? null;
  const comparisons =
    window === null
      ? run.analysis.comparisons
      : run.analysis.comparisons.filter((entry) => insideWindow(entry.decision.reportTimeMs, window));
  const resolved = run.analysis.resolved.filter((entry) =>
    comparisons.some((comparison) => comparison.decision.position === entry.position),
  );
  const coverage = summarizeBloodDecisions(params.actorId, comparisons, [], resolved);
  const actual = {
    remainsEvidence: sorted(coverage.remainsEvidence.map((row) => [row.key, row.count])),
    preDecisionWindowRefusals: sorted(coverage.preDecisionWindowRefusals.map((row) => [row.key, row.count])),
  };
  const expected = {
    remainsEvidence: sorted(Object.entries(params.expected.remainsEvidence)),
    preDecisionWindowRefusals: sorted(Object.entries(params.expected.preDecisionWindowRefusals)),
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return fail("the remains evidence distributes differently than the case pins", { expected, actual });
  }
  // Each modelled atom's rows partition the eligible population.
  const perAtom = new Map<string, number>();
  for (const [key, count] of Object.entries(actual.remainsEvidence)) {
    const atom = key.split(" | ")[0] ?? key;
    perAtom.set(atom, (perAtom.get(atom) ?? 0) + count);
  }
  for (const [atom, total] of perAtom) {
    if (total !== comparisons.length) {
      return fail("a modelled aura's remains evidence does not cover the eligible population", {
        expected: { atom, total: comparisons.length },
        actual: { atom, total },
      });
    }
  }
  return pass();
}

export function cooldownReadinessAt(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BLOOD_DEATH_KNIGHT.COOLDOWN_READINESS_AT">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const found = resolvedAt(run, params.actorId, params.observedCast);
  if (!found.ok) return found.outcome;
  const cooldown = found.resolved.cooldowns.find((entry) => entry.simcToken === params.simcToken);
  if (cooldown === undefined) {
    return fail("the evaluator derived no cooldown for this token at this decision", {
      expected: { simcToken: params.simcToken },
      locator: run.state.locatorAt(found.position),
    });
  }
  const anchored = cooldown.perAbility.find(
    (entry) => entry.abilityGameId === cooldown.readinessAbilityGameId,
  );
  const first = cooldown.perAbility[0];
  const actual = {
    readiness: cooldown.readiness.state,
    provenRemainingAtLeastMs:
      cooldown.readiness.state === "PROVEN_NOT_READY" ? cooldown.readiness.provenRemainingAtLeastMs : null,
    anchorReportTimeMs:
      anchored !== undefined && anchored.cooldown.state !== "UNKNOWN"
        ? anchored.cooldown.anchorLocator.reportTimeMs
        : null,
    anchorAbilityGameId: cooldown.readinessAbilityGameId,
    effectiveBaseMs:
      anchored !== undefined && anchored.effectiveBase.state !== "REFUSED" ? anchored.effectiveBase.ms : null,
    unknownReason:
      cooldown.readiness.state === "PROVEN_NOT_READY" ||
      first === undefined ||
      first.cooldown.state !== "UNKNOWN"
        ? null
        : first.cooldown.reason,
  };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the cooldown readiness at this decision differs from the case", {
      expected: params.expected,
      actual,
      locator: run.state.locatorAt(found.position),
    });
  }
  return pass();
}

export function domainResult(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BLOOD_DEATH_KNIGHT.DOMAIN_RESULT">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const domain = run.analysis.domains.find((entry) => entry.domain === params.domain);
  if (domain === undefined) {
    return fail("the payload carries no result for this domain", { expected: { domain: params.domain } });
  }
  const actual = {
    resolution: domain.resolution,
    authorityId: "authorityId" in domain ? domain.authorityId : null,
    offensiveAuthorityGoverns:
      "offensiveAuthorityGoverns" in domain ? domain.offensiveAuthorityGoverns : null,
    evidenceFamily: "evidenceFamily" in domain ? domain.evidenceFamily : null,
    deathStrikeDualRole: "deathStrikeDualRole" in domain ? domain.deathStrikeDualRole : null,
    sharesActionWithOffensive:
      "sharesActionWithOffensive" in domain ? domain.sharesActionWithOffensive : null,
  };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the domain result differs from the case", { expected: params.expected, actual });
  }
  return pass();
}

export function buildResolution(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BLOOD_DEATH_KNIGHT.BUILD_RESOLUTION">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const { build } = run.analysis;
  const actual = {
    talents: Object.fromEntries(
      Object.entries(build.talents)
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .map(([name, resolution]) => [name, resolution.selection]),
    ),
    heroTree: build.heroTree.state === "RESOLVED" ? build.heroTree.simcName : null,
  };
  const expected = {
    talents: Object.fromEntries(
      Object.entries(params.expected.talents).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
    ),
    heroTree: params.expected.heroTree,
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return fail("the build resolution differs from the case", { expected, actual });
  }
  return pass();
}

/**
 * The domain boundary over the pinned authority under THIS actor's build:
 * every entry the applicability rules classify OUTSIDE_SUPPORTED_DECISION_DOMAIN,
 * as `list[ordinal] token`, exact and exhaustive.
 */
export function nonDomainEntries(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BLOOD_DEATH_KNIGHT.NON_DOMAIN_ENTRIES">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const loaded = pinnedBloodDeathKnightAuthority();
  if (!loaded.ok) return fail("the pinned authority did not load", { actual: { reason: loaded.reason } });
  const facts: BloodBuildFacts = {
    talents: run.analysis.build.talents,
    heroTree: run.analysis.build.heroTree,
  };
  const actual: string[] = [];
  for (const action of loaded.authority.actions) {
    if (action.entryKind !== "PLAYER_ACTION") continue;
    const verdict = resolveBloodApplicability(facts, action);
    if (verdict.kind === "NOT_APPLICABLE" && verdict.reason === "OUTSIDE_SUPPORTED_DECISION_DOMAIN") {
      actual.push(`${action.listName}[${String(action.priorityOrdinal)}] ${action.actionToken}`);
    }
  }
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the non-domain entries of the pinned authority differ from the case", {
      expected: params.expected,
      actual,
    });
  }
  return pass();
}

export function specGate(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BLOOD_DEATH_KNIGHT.SPEC_GATE">,
): AssertionOutcome {
  const analysis = analyzeObservedBloodDeathKnightDecisions({
    state: stateOf(corpus, artifact),
    actorId: params.actorId,
    specId: params.specId,
    targetActorId: null,
  });
  if (analysis.status !== "SPEC_NOT_SUPPORTED") {
    return fail("the facade did not refuse the specialization", {
      expected: { status: "SPEC_NOT_SUPPORTED" },
      actual: analysisFacts(analysis),
    });
  }
  if (analysis.specId !== params.specId) {
    return fail("the refusal names a different specialization", {
      expected: { specId: params.specId },
      actual: { specId: analysis.specId },
    });
  }
  return pass();
}

export function analysisStatus(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BLOOD_DEATH_KNIGHT.ANALYSIS_STATUS">,
): AssertionOutcome {
  void kase;
  let derived: ReturnType<typeof analysisOf>;
  try {
    derived = analysisOf(context, corpus, artifact, params.actorId, null, bundleRequestOf(params));
  } catch (error) {
    if (error instanceof BundleCompositionError) return fail(error.message, { expected: { composed: true } });
    throw error;
  }
  if (derived.analysis.status !== params.expected) {
    return fail("the registration reported a different status than the case pins", {
      expected: { status: params.expected },
      actual: analysisFacts(derived.analysis),
    });
  }
  return pass();
}
