/**
 * SPEC_RETRIBUTION_PALADIN executors (M11-A4; PUBLIC since M11-A5): the real
 * Retribution Paladin registration over a real corpus artifact.
 *
 * The analysis is obtained through the REGISTRATION — `registration.analyze`,
 * which checks input and result ownership and hands the facade the
 * registration's own authority access — never by calling the facade with a
 * hand-built authority. No transport, no service, no network: the corpus
 * fight builder supplies the state, and everything between it and the
 * outcome is production code from `src/specs/paladin/retribution/`.
 *
 * ONE REAL ANALYSIS PER INPUT PER RUN, memoised through the run's own
 * `CorpusExecutionContext` exactly as the Protection executors do; bundles
 * (`historyArtifactIds` + `declaredHoles`) compose one fight through the
 * shared bundle composer, and `evaluationWindow` only restricts what an
 * aggregate assertion counts.
 */

import {
  PUBLIC_ANALYSIS_SCHEMA_VERSION,
  PublicAnalysisResultSchema,
} from "../../../../src/contracts/analysis-contract.js";
import { projectAnalysisResult } from "../../../../src/contracts/analysis-projection.js";
import type { CombatState } from "../../../../src/engine/state/combat-state.js";
import {
  RETRIBUTION_PALADIN_ANALYZER_ID,
  RETRIBUTION_PALADIN_SPEC_ID,
} from "../../../../src/specs/paladin/retribution/spec.js";
import {
  analyzeObservedRetributionPaladinDecisions,
  summarizeRetributionDecisions,
  type RetributionPaladinAnalysis,
} from "../../../../src/specs/paladin/retribution/observed-analysis.js";
import { RETRIBUTION_PALADIN_REGISTRATION } from "../../../../src/specs/paladin/retribution/registration.js";
import {
  resolveRetributionApplicability,
  type RetributionBuildFacts,
} from "../../../../src/specs/paladin/retribution/action-profile.js";
import { pinnedRetributionPaladinAuthority } from "../../../../src/specs/paladin/retribution/pinned-authority.js";
import type { CorpusExecutionContext } from "../execution-context.js";
import { BundleCompositionError, positionOfCast, stateOf, stateOfBundle, type BundleHole } from "../fight.js";
import type { LoadedArtifact, LoadedCase, LoadedCorpus } from "../loader.js";
import { fail, pass, type AssertionOutcome } from "./outcome.js";
import type { ParamsOf } from "./params.js";

type Analyzed = Extract<RetributionPaladinAnalysis, { status: "ANALYZED" }>;

function analysisFacts(analysis: RetributionPaladinAnalysis): unknown {
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
    const part = corpus.referenceableArtifacts.find((entry) => entry.record.artifactId === artifactId);
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
): { readonly state: CombatState; readonly analysis: RetributionPaladinAnalysis } {
  const parts = bundle === null ? [artifact] : partsOf(corpus, artifact, bundle);
  const key = JSON.stringify({
    derivation: "RETRIBUTION_PALADIN_REGISTRATION.analyze",
    analyzerId: RETRIBUTION_PALADIN_REGISTRATION.analyzerId,
    parts: parts.map((part) => ({
      artifactId: part.record.artifactId,
      artifactSha256: part.record.sha256,
      provenance: part.record.provenance,
    })),
    declaredHoles: bundle?.declaredHoles ?? [],
    actorId,
    specId: RETRIBUTION_PALADIN_SPEC_ID,
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
    const analysis = RETRIBUTION_PALADIN_REGISTRATION.analyze({
      state,
      actorId,
      specId: RETRIBUTION_PALADIN_SPEC_ID,
      targetActorId,
    }) as RetributionPaladinAnalysis;
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
      outcome: fail("the observed cast is not an eligible spender decision", {
        expected: { eligible: true },
        actual: excluded === undefined ? { eligible: false } : { eligible: false, reason: excluded.reason },
        locator: run.state.locatorAt(position.position),
      }),
    };
  }
  return { ok: true, position: position.position, resolved };
}

export function authorityProvenance(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_RETRIBUTION_PALADIN.AUTHORITY_PROVENANCE">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const { authority } = run.analysis;
  const actual = {
    authorityId: authority.authorityId,
    artifactRevision: authority.artifactRevision,
    commitSha: authority.commitSha,
    sourcePath: authority.sourcePath,
    sourceSha256: authority.sourceSha256,
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
  params: ParamsOf<"SPEC_RETRIBUTION_PALADIN.DECISION_COVERAGE">,
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
  params: ParamsOf<"SPEC_RETRIBUTION_PALADIN.COVERAGE_SUMMARY">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const window = params.evaluationWindow ?? null;
  const coverage =
    window === null
      ? run.analysis.coverage
      : summarizeRetributionDecisions(
          params.actorId,
          run.analysis.comparisons.filter((entry) => insideWindow(entry.decision.reportTimeMs, window)),
          run.analysis.excluded.filter((entry) => insideWindow(entry.reportTimeMs, window)),
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

export function unknownBlockerDistribution(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_RETRIBUTION_PALADIN.UNKNOWN_BLOCKER_DISTRIBUTION">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const window = params.evaluationWindow ?? null;
  const comparisons =
    window === null
      ? run.analysis.comparisons
      : run.analysis.comparisons.filter((entry) => insideWindow(entry.decision.reportTimeMs, window));
  const blockedAt = new Map<string, number>();
  const rootScanBlockedAt = new Map<string, number>();
  let match = 0;
  let rejected = 0;
  for (const comparison of comparisons) {
    if (comparison.outcome === "MATCH") {
      match += 1;
      continue;
    }
    if (comparison.outcome === "REJECTED") {
      rejected += 1;
      continue;
    }
    const resolved = run.analysis.resolved.find((entry) => entry.position === comparison.decision.position);
    const key = resolved?.selection.blockedAt ?? null;
    if (key === null) {
      return fail("an UNKNOWN decision carries no engine blocker", {
        actual: { outcome: comparison.outcome, rawBlocker: comparison.rawBlocker },
        locator: comparison.decision.locator,
      });
    }
    blockedAt.set(key, (blockedAt.get(key) ?? 0) + 1);
    const root = resolved?.selection.rootScanBlockedAt ?? "(root scan resolved)";
    rootScanBlockedAt.set(root, (rootScanBlockedAt.get(root) ?? 0) + 1);
  }
  const sorted = (entries: Iterable<[string, number]>) =>
    Object.fromEntries([...entries].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));
  const actual = {
    match,
    rejected,
    blockedAt: sorted(blockedAt.entries()),
    rootScanBlockedAt: sorted(rootScanBlockedAt.entries()),
  };
  const expected = {
    match: params.expected.match,
    rejected: params.expected.rejected,
    blockedAt: sorted(Object.entries(params.expected.blockedAt)),
    rootScanBlockedAt: sorted(Object.entries(params.expected.rootScanBlockedAt)),
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return fail("the UNKNOWN blockers distribute differently than the case pins", { expected, actual });
  }
  return pass();
}

export function holyPowerObservation(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_RETRIBUTION_PALADIN.HOLY_POWER_OBSERVATION">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const position = castPosition(run.state, params.actorId, params.cast);
  if (!position.ok) return position.outcome;
  const record = run.analysis.holyPower.find((entry) => entry.position === position.position);
  if (record === undefined) {
    return fail("the evaluator recorded no Holy Power observation for this cast", {
      expected: params.cast,
      locator: run.state.locatorAt(position.position),
    });
  }
  const actual =
    record.observation.state === "EXACT_PRE_COST"
      ? {
          state: record.observation.state,
          amount: record.observation.amount,
          max: record.observation.max,
          cost: record.observation.cost,
        }
      : { state: record.observation.state, amount: null, max: null, cost: null };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the Holy Power observation on this cast differs from the case", {
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
  params: ParamsOf<"SPEC_RETRIBUTION_PALADIN.AURA_BINDING_AT">,
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
          anchorReportTimeMs: aura.anchorLocator.reportTimeMs,
          reason: null,
        }
      : {
          state: aura.state,
          up: null,
          abilityGameId: aura.abilityGameId,
          anchorReportTimeMs: null,
          reason: aura.reason,
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
  params: ParamsOf<"SPEC_RETRIBUTION_PALADIN.STACK_BINDING_AT">,
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
    stack.state === "BOUND_ZERO"
      ? { state: stack.state, stack: 0, proof: stack.proof, abilityGameId: stack.abilityGameId, reason: null }
      : {
          state: stack.state,
          stack: null,
          proof: null,
          abilityGameId: stack.abilityGameId,
          reason: stack.reason,
        };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the exact-zero stack binding at this decision differs from the case", {
      expected: params.expected,
      actual,
      locator: run.state.locatorAt(found.position),
    });
  }
  return pass();
}

export function dsCastableAt(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_RETRIBUTION_PALADIN.DS_CASTABLE_AT">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const found = resolvedAt(run, params.actorId, params.observedCast);
  if (!found.ok) return found.outcome;
  const { dsCastable } = found.resolved.diagnostics;
  const actual =
    dsCastable.state === "BOUND"
      ? { state: dsCastable.state, value: dsCastable.value, reason: null }
      : { state: dsCastable.state, value: null, reason: dsCastable.reason };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("variable.ds_castable resolved differently at this decision than the case pins", {
      expected: params.expected,
      actual,
      locator: run.state.locatorAt(found.position),
    });
  }
  return pass();
}

export function cooldownReadinessAt(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_RETRIBUTION_PALADIN.COOLDOWN_READINESS_AT">,
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
  params: ParamsOf<"SPEC_RETRIBUTION_PALADIN.DOMAIN_RESULT">,
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
  params: ParamsOf<"SPEC_RETRIBUTION_PALADIN.BUILD_RESOLUTION">,
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
    twoHandedWeaponItemId: build.twoHandedWeaponItemId,
  };
  const expected = {
    talents: Object.fromEntries(
      Object.entries(params.expected.talents).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
    ),
    heroTree: params.expected.heroTree,
    twoHandedWeaponItemId: params.expected.twoHandedWeaponItemId,
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
  params: ParamsOf<"SPEC_RETRIBUTION_PALADIN.NON_DOMAIN_ENTRIES">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const loaded = pinnedRetributionPaladinAuthority();
  if (!loaded.ok) return fail("the pinned authority did not load", { actual: { reason: loaded.reason } });
  const observed = new Set<number>();
  for (const position of run.state.positionsBySourceActor(params.actorId)) {
    const event = run.state.eventAt(position);
    if (
      event?.kind === "CAST" &&
      event.castPhase === "COMPLETE" &&
      event.isMelee !== true &&
      event.abilityGameId !== null
    ) {
      observed.add(event.abilityGameId);
    }
  }
  const facts: RetributionBuildFacts = {
    talents: run.analysis.build.talents,
    heroTree: run.analysis.build.heroTree,
    wornGear: [],
    observedCastAbilityIds: observed,
  };
  const actual: string[] = [];
  for (const action of loaded.authority.actions) {
    if (action.entryKind !== "PLAYER_ACTION") continue;
    const verdict = resolveRetributionApplicability(facts, action);
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
  params: ParamsOf<"SPEC_RETRIBUTION_PALADIN.SPEC_GATE">,
): AssertionOutcome {
  const analysis = analyzeObservedRetributionPaladinDecisions({
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
  params: ParamsOf<"SPEC_RETRIBUTION_PALADIN.ANALYSIS_STATUS">,
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

// ---------------------------------------------------------------------------
// SPEC_RETRIBUTION_PALADIN.PUBLIC_PROJECTION (M11-A5)
// ---------------------------------------------------------------------------

function keysOf(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((entry) => keysOf(entry, into));
  else if (value !== null && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      into.add(key);
      keysOf(entry, into);
    }
  }
  return into;
}

/** Payload fields the view withholds; none may reach a public document. */
const WITHHELD_KEYS = [
  "rawBlocker",
  "rootScanBlockedAt",
  "rootScanBlocker",
  "observedActionRejected",
  "unselectability",
  "actorId",
  "domains",
  "holyPower",
  "build",
  "resolved",
  "diagnostics",
  "foregroundProvenByObservedExecution",
  "observedCastAbilityIds",
  "scope",
];
/** Internal-only vocabulary; none may appear as a public value. */
const INTERNAL_STRINGS = [
  "MELEE_SWING",
  "OUTSIDE_FIRST_SLICE",
  "NO_PINNED_AUTHORITY_FOR_DOMAIN",
  "AUTHORITY_LOAD_FAILED",
  "DOMAIN_NOT_DECLARED",
  "AUTHORITY_HAS_UNMODELLED_DISPATCH",
  "APPLICABILITY_UNKNOWN",
  "CONDITION_NOT_PROVEN_FALSE",
  "TALENT_NOT_DISPROVED",
  "PROVEN_INACTIVE",
];

/**
 * The registration's analysis through its own view and the real public
 * projection — the envelope assembled exactly as the service assembles it,
 * the projection and the schema the production ones — with the totals, the
 * named decisions and the named excluded casts read back from the PROJECTED
 * document, never from the payload.
 */
export function publicProjection(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_RETRIBUTION_PALADIN.PUBLIC_PROJECTION">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const { state, analysis } = run;
  const { fight } = state;
  const envelope: Parameters<typeof projectAnalysisResult>[0] = {
    identity: {
      report: {
        code: fight.report.code,
        revision: fight.report.revision,
        startTime: fight.report.startTimeUnixMs,
        endTime: fight.report.endTimeUnixMs,
      },
      data: fight.data,
      fight: {
        id: fight.fight.id,
        name: fight.fight.name,
        encounterId: fight.fight.encounterId,
        difficulty: fight.fight.difficulty,
        startTime: fight.fight.startTimeMs,
        endTime: fight.fight.endTimeMs,
      },
      player: {
        sourceId: params.actorId,
        name: "Corpusplayer",
        className: "Paladin",
        specName: "Retribution",
      },
    },
    specId: RETRIBUTION_PALADIN_SPEC_ID,
    analyzerId: RETRIBUTION_PALADIN_ANALYZER_ID,
    scope: "PLAYER_CONTEXT",
    analysis,
    observedDecisions: RETRIBUTION_PALADIN_REGISTRATION.observedDecisionView(analysis),
  };

  let projected: ReturnType<typeof projectAnalysisResult>;
  try {
    projected = projectAnalysisResult(envelope);
  } catch (error: unknown) {
    return fail("the public projection threw", {
      expected: { projected: true },
      actual: { error: error instanceof Error ? error.message : String(error) },
    });
  }
  const parsed = PublicAnalysisResultSchema.safeParse(projected);
  if (!parsed.success) {
    return fail("the projected document does not validate against the frozen public schema", {
      expected: "schema-valid document",
      actual: parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.map(String).join(".")}: ${issue.message}`),
    });
  }
  if (projected.schemaVersion !== PUBLIC_ANALYSIS_SCHEMA_VERSION) {
    return fail("the projected document carries a different schema version", {
      expected: { schemaVersion: PUBLIC_ANALYSIS_SCHEMA_VERSION },
      actual: { schemaVersion: projected.schemaVersion },
    });
  }
  if (projected.status !== "ANALYZED") {
    return fail("the projected document is not ANALYZED", {
      expected: { status: "ANALYZED" },
      actual: { status: projected.status },
    });
  }

  const exclusions: Record<string, number> = {};
  for (const row of projected.coverage.exclusions) exclusions[row.key] = row.count;
  const { decisions: expectedDecisions, excluded: expectedExcluded, ...expectedTotals } = params.expected;
  const actualTotals = {
    specId: projected.specialization.specId,
    analyzerId: projected.analyzerId,
    eligibleDecisions: projected.coverage.eligibleDecisions,
    match: projected.coverage.match,
    rejected: projected.coverage.rejected,
    unknown: projected.coverage.unknown,
    excludedCastCount: projected.coverage.excludedCastCount,
    exclusions,
  };
  if (JSON.stringify(actualTotals) !== JSON.stringify(expectedTotals)) {
    return fail("the projected totals differ from what the case pins", {
      expected: expectedTotals,
      actual: actualTotals,
    });
  }
  const tallySum = projected.coverage.exclusions.reduce((sum, row) => sum + row.count, 0);
  if (tallySum !== projected.coverage.excludedCastCount || projected.exclusions.length !== tallySum) {
    return fail("the projected exclusion tally does not reconcile with the excluded count", {
      expected: {
        tallySum: projected.coverage.excludedCastCount,
        exclusions: projected.coverage.excludedCastCount,
      },
      actual: { tallySum, exclusions: projected.exclusions.length },
    });
  }

  // Named decisions, read from the PROJECTED document by cast time and ability.
  for (const expected of expectedDecisions) {
    const found = projected.decisions.filter(
      (decision) =>
        decision.locator.reportTimeMs === expected.reportTimeMs &&
        decision.observedAbilityGameId === expected.abilityGameId,
    );
    const decision = found[0];
    if (found.length !== 1 || decision === undefined) {
      return fail("the named cast is not exactly one projected decision", {
        expected: {
          reportTimeMs: expected.reportTimeMs,
          abilityGameId: expected.abilityGameId,
          decisions: 1,
        },
        actual: { decisions: found.length },
      });
    }
    const actual = {
      reportTimeMs: decision.locator.reportTimeMs,
      abilityGameId: decision.observedAbilityGameId,
      outcome: decision.outcome,
      basis: decision.basis,
      authorityCoverage: decision.authorityCoverage,
      authorityToken: decision.authorityToken,
      selectionPrecision: decision.selectionPrecision,
      decisiveBlocker: decision.decisiveBlocker,
    };
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      return fail("a named decision projects differently than the case pins", { expected, actual });
    }
  }
  // Named excluded casts, the same way.
  for (const expected of expectedExcluded) {
    const found = projected.exclusions.filter(
      (cast) => cast.reportTimeMs === expected.reportTimeMs && cast.abilityGameId === expected.abilityGameId,
    );
    const cast = found[0];
    if (found.length !== 1 || cast === undefined) {
      return fail("the named cast is not exactly one projected exclusion", {
        expected: {
          reportTimeMs: expected.reportTimeMs,
          abilityGameId: expected.abilityGameId,
          exclusions: 1,
        },
        actual: { exclusions: found.length },
      });
    }
    const actual = {
      reportTimeMs: cast.reportTimeMs,
      abilityGameId: cast.abilityGameId,
      reason: cast.reason,
    };
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      return fail("a named excluded cast projects differently than the case pins", { expected, actual });
    }
  }

  const json = JSON.stringify(projected);
  const leaked = INTERNAL_STRINGS.filter((internal) => json.includes(internal));
  if (leaked.length > 0) {
    return fail("an internal-only vocabulary string reached the public document", {
      expected: [],
      actual: leaked,
    });
  }
  const keys = keysOf(projected);
  const withheld = WITHHELD_KEYS.filter((key) => keys.has(key));
  if (withheld.length > 0) {
    return fail("a withheld payload field reached the public document", { expected: [], actual: withheld });
  }
  return pass();
}
