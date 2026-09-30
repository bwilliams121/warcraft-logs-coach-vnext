/**
 * SPEC_BREWMASTER_MONK executors (M11-C2; PUBLIC since M11-C4j): the real Brewmaster
 * Monk registration over a real corpus artifact.
 *
 * The analysis is obtained through the REGISTRATION — `registration.analyze`,
 * which checks input and result ownership and hands the facade the
 * registration's own authority access — never by calling the facade with a
 * hand-built authority. No transport, no service, no network: the corpus
 * fight builder supplies the state, and everything between it and the
 * outcome is production code from `src/specs/monk/brewmaster/`.
 *
 * ONE REAL ANALYSIS PER INPUT PER RUN, memoised through the run's own
 * `CorpusExecutionContext` exactly as the other specialization executors do.
 * The aggregate kinds (coverage summary, measurement distribution, state
 * evidence census, M11-C4) and decision coverage (M11-C4e) also accept a
 * bundle (`historyArtifactIds` + `declaredHoles`), composed through the
 * shared bundle composer exactly as the Blood executors compose theirs; every
 * other kind reads one artifact. A bundle part may be a regression-corpus
 * artifact when the case lives in the evidence archive.
 */

import type { CombatState } from "../../../../src/engine/state/combat-state.js";
import { BREWMASTER_MONK_SPEC_ID } from "../../../../src/specs/monk/brewmaster/spec.js";
import {
  analyzeObservedBrewmasterMonkDecisions,
  type BrewmasterMonkAnalysis,
} from "../../../../src/specs/monk/brewmaster/observed-analysis.js";
import { BREWMASTER_MONK_REGISTRATION } from "../../../../src/specs/monk/brewmaster/registration.js";
import {
  resolveBrewmasterApplicability,
  type BrewmasterBuildFacts,
} from "../../../../src/specs/monk/brewmaster/action-profile.js";
import { pinnedBrewmasterMonkAuthority } from "../../../../src/specs/monk/brewmaster/pinned-authority.js";
import type { CorpusExecutionContext } from "../execution-context.js";
import { BundleCompositionError, positionOfCast, stateOf, stateOfBundle, type BundleHole } from "../fight.js";
import type { LoadedArtifact, LoadedCase, LoadedCorpus } from "../loader.js";
import { fail, pass, type AssertionOutcome } from "./outcome.js";
import type { ParamsOf } from "./params.js";

type Analyzed = Extract<BrewmasterMonkAnalysis, { status: "ANALYZED" }>;

function analysisFacts(analysis: BrewmasterMonkAnalysis): unknown {
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
  bundle: BundleRequest | null = null,
): { readonly state: CombatState; readonly analysis: BrewmasterMonkAnalysis } {
  const key =
    bundle === null
      ? JSON.stringify({
          derivation: "BREWMASTER_MONK_REGISTRATION.analyze",
          analyzerId: BREWMASTER_MONK_REGISTRATION.analyzerId,
          artifactId: artifact.record.artifactId,
          artifactSha256: artifact.record.sha256,
          provenance: artifact.record.provenance,
          actorId,
          specId: BREWMASTER_MONK_SPEC_ID,
          targetActorId,
        })
      : JSON.stringify({
          derivation: "BREWMASTER_MONK_REGISTRATION.analyze",
          analyzerId: BREWMASTER_MONK_REGISTRATION.analyzerId,
          parts: partsOf(corpus, artifact, bundle).map((part) => ({
            artifactId: part.record.artifactId,
            artifactSha256: part.record.sha256,
            provenance: part.record.provenance,
          })),
          declaredHoles: bundle.declaredHoles,
          actorId,
          specId: BREWMASTER_MONK_SPEC_ID,
          targetActorId,
        });
  return context.memo.once(key, () => {
    const state =
      bundle === null
        ? stateOf(corpus, artifact)
        : stateOfBundle(
            corpus,
            partsOf(corpus, artifact, bundle).map((part) => part.record.artifactId),
            bundle.declaredHoles,
          );
    const analysis = BREWMASTER_MONK_REGISTRATION.analyze({
      state,
      actorId,
      specId: BREWMASTER_MONK_SPEC_ID,
      targetActorId,
    }) as BrewmasterMonkAnalysis;
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

function resolvedAt(
  run: { readonly state: CombatState; readonly analysis: Analyzed },
  actorId: number,
  cast: { readonly reportTimeMs: number; readonly abilityGameId: number },
):
  | { readonly ok: true; readonly position: number; readonly resolved: Analyzed["resolved"][number] }
  | { readonly ok: false; readonly outcome: AssertionOutcome } {
  const found = positionOfCast(run.state, { actorId, ...cast });
  if (!found.ok) return { ok: false, outcome: fail(found.detail, { expected: cast }) };
  const resolved = run.analysis.resolved.find((entry) => entry.position === found.position);
  if (resolved === undefined) {
    const excluded = run.analysis.excluded.find((entry) => entry.position === found.position);
    return {
      ok: false,
      outcome: fail("the observed cast is not an eligible decision", {
        expected: { eligible: true },
        actual: excluded === undefined ? { eligible: false } : { eligible: false, reason: excluded.reason },
        locator: run.state.locatorAt(found.position),
      }),
    };
  }
  return { ok: true, position: found.position, resolved };
}

const sorted = (entries: Iterable<readonly [string, unknown]>) =>
  Object.fromEntries([...entries].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)));

const rows = (tally: readonly { readonly key: string; readonly count: number }[]) =>
  sorted(tally.map((row) => [row.key, row.count] as const));

export function authorityProvenance(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BREWMASTER_MONK.AUTHORITY_PROVENANCE">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId);
  if (!run.ok) return run.outcome;
  const { authority } = run.analysis;
  const loaded = pinnedBrewmasterMonkAuthority();
  const selector = loaded.ok ? (loaded.authority.artifact.provenance.regionSelector ?? null) : null;
  const actual = {
    authorityId: authority.authorityId,
    artifactRevision: authority.artifactRevision,
    commitSha: authority.commitSha,
    sourcePath: authority.sourcePath,
    sourceSha256: authority.sourceSha256,
    regionSelector:
      selector === null
        ? null
        : {
            kind: selector.kind,
            enclosingNamespace: selector.enclosingNamespace,
            functionHeader: selector.functionHeader,
            playerIdentifier: selector.playerIdentifier,
          },
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
  params: ParamsOf<"SPEC_BREWMASTER_MONK.DECISION_COVERAGE">,
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
  const found = resolvedAt(run, params.actorId, params.observedCast);
  if (!found.ok) return found.outcome;
  const comparison = run.analysis.comparisons.find((entry) => entry.decision.position === found.position);
  if (comparison === undefined) {
    return fail("the eligible decision carries no comparison", {
      locator: run.state.locatorAt(found.position),
    });
  }
  const { selection, unselectability } = found.resolved;
  const stop = selection.stoppingPoint;
  const actual = {
    outcome: comparison.outcome,
    basis: comparison.basis,
    authorityCoverage: comparison.authorityCoverage,
    authorityToken: comparison.authorityToken,
    selectionPrecision: comparison.selectionPrecision,
    decisiveBlocker: comparison.decisiveBlocker,
    rawBlocker: comparison.rawBlocker,
    unresolvedAt: selection.blockedAt,
    observedActionRejected: comparison.observedActionRejected,
    unselectabilityProven: unselectability.proven,
    unselectabilityRefusal: unselectability.refusal,
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
  params: ParamsOf<"SPEC_BREWMASTER_MONK.COVERAGE_SUMMARY">,
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
  const tallied = coverage.exclusions.reduce((sum, row) => sum + row.count, 0);
  if (tallied !== coverage.excludedCastCount) {
    return fail("the exclusion tally does not cover every excluded cast", {
      expected: { excludedCastCount: coverage.excludedCastCount },
      actual: { tallied },
    });
  }
  return pass();
}

export function measurementDistribution(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BREWMASTER_MONK.MEASUREMENT_DISTRIBUTION">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const { coverage, comparisons, resolved } = run.analysis;
  for (const comparison of comparisons) {
    if (comparison.outcome !== "UNKNOWN") continue;
    const entry = resolved.find((row) => row.position === comparison.decision.position);
    if (entry === undefined || entry.selection.blockedAt === null) {
      return fail("an UNKNOWN decision carries no engine refusal entry", {
        actual: { outcome: comparison.outcome, rawBlocker: comparison.rawBlocker },
        locator: comparison.decision.locator,
      });
    }
  }
  const actual = {
    match: coverage.match,
    rejected: coverage.rejected,
    exactEntryMatches: coverage.exactEntryMatches,
    tokenConvergedMatches: coverage.tokenConvergedMatches,
    eligibleTokens: rows(coverage.eligibleTokens),
    unresolvedAt: rows(coverage.unresolvedAt),
    unknownBlockerClasses: rows(coverage.unknownBlockerClasses),
    stoppingEntries: rows(coverage.stoppingEntries),
    stoppingAtoms: rows(coverage.stoppingAtoms),
    dispatchOutcomes: rows(coverage.dispatchOutcomes),
    undecidedGcdCandidates: rows(coverage.undecidedGcdCandidates),
    undecidedNonGcdCandidates: rows(coverage.undecidedNonGcdCandidates),
    gcdDistribution: rows(coverage.gcdDistribution),
  };
  const expected = {
    match: params.expected.match,
    rejected: params.expected.rejected,
    exactEntryMatches: params.expected.exactEntryMatches,
    tokenConvergedMatches: params.expected.tokenConvergedMatches,
    eligibleTokens: sorted(Object.entries(params.expected.eligibleTokens)),
    unresolvedAt: sorted(Object.entries(params.expected.unresolvedAt)),
    unknownBlockerClasses: sorted(Object.entries(params.expected.unknownBlockerClasses)),
    stoppingEntries: sorted(Object.entries(params.expected.stoppingEntries)),
    stoppingAtoms: sorted(Object.entries(params.expected.stoppingAtoms)),
    dispatchOutcomes: sorted(Object.entries(params.expected.dispatchOutcomes)),
    undecidedGcdCandidates: sorted(Object.entries(params.expected.undecidedGcdCandidates)),
    undecidedNonGcdCandidates: sorted(Object.entries(params.expected.undecidedNonGcdCandidates)),
    gcdDistribution: sorted(Object.entries(params.expected.gcdDistribution)),
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return fail("the measurement distributes differently than the case pins", { expected, actual });
  }
  const stopped = Object.values(actual.stoppingEntries).reduce(
    (sum: number, count) => sum + Number(count),
    0,
  );
  if (stopped !== comparisons.length) {
    return fail("the stopping entries do not cover the eligible population", {
      expected: { stopped: comparisons.length },
      actual: { stopped },
    });
  }
  return pass();
}

export function stateEvidenceCensus(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BREWMASTER_MONK.STATE_EVIDENCE_CENSUS">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const { coverage } = run.analysis;
  const actual = {
    auraEvidence: rows(coverage.auraEvidence),
    readinessAuraEvidence: rows(coverage.readinessAuraEvidence),
    cooldownReadiness: rows(coverage.cooldownReadiness),
    positiveUsability: rows(coverage.positiveUsability),
  };
  const expected = {
    auraEvidence: sorted(Object.entries(params.expected.auraEvidence)),
    readinessAuraEvidence: sorted(Object.entries(params.expected.readinessAuraEvidence)),
    cooldownReadiness: sorted(Object.entries(params.expected.cooldownReadiness)),
    positiveUsability: sorted(Object.entries(params.expected.positiveUsability)),
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return fail("the state evidence distributes differently than the case pins", { expected, actual });
  }
  return pass();
}

export function dispatchTraceAt(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BREWMASTER_MONK.DISPATCH_TRACE_AT">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId);
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

export function auraBindingAt(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BREWMASTER_MONK.AURA_BINDING_AT">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId);
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
    aura.state === "UNBOUND"
      ? {
          state: aura.state,
          up: null,
          abilityGameId: aura.abilityGameId,
          proof: null,
          anchorReportTimeMs: null,
          reason: aura.reason,
          auraReason: aura.auraReason,
        }
      : {
          state: aura.state,
          up: aura.up,
          abilityGameId: aura.abilityGameId,
          proof: aura.proof,
          anchorReportTimeMs: aura.proof === "OBSERVED" ? aura.anchorLocator.reportTimeMs : null,
          reason: null,
          auraReason: null,
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

export function cooldownReadinessAt(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_BREWMASTER_MONK.COOLDOWN_READINESS_AT">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId);
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
  const anchored = cooldown.perAbility.find((entry) => entry.cooldown.state !== "UNKNOWN") ?? null;
  const base = cooldown.perAbility[0]?.effectiveBase ?? null;
  const actual = {
    readiness: cooldown.readiness.state,
    provenRemainingAtLeastMs:
      cooldown.readiness.state === "PROVEN_NOT_READY" ? cooldown.readiness.provenRemainingAtLeastMs : null,
    anchorReportTimeMs:
      anchored !== null && anchored.cooldown.state !== "UNKNOWN"
        ? anchored.cooldown.anchorLocator.reportTimeMs
        : null,
    anchorAbilityGameId: anchored?.abilityGameId ?? null,
    effectiveBaseMs: base !== null && base.state !== "REFUSED" ? base.ms : null,
    unknownReason: cooldown.readiness.state === "UNKNOWN" ? cooldown.readiness.reason : null,
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
  params: ParamsOf<"SPEC_BREWMASTER_MONK.DOMAIN_RESULT">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId);
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
    sharesActionsWithOffensive:
      "sharesActionsWithOffensive" in domain ? [...domain.sharesActionsWithOffensive] : null,
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
  params: ParamsOf<"SPEC_BREWMASTER_MONK.BUILD_RESOLUTION">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId);
  if (!run.ok) return run.outcome;
  const { build, resolved } = run.analysis;
  const diagnostics = resolved[0]?.diagnostics ?? null;
  const actual = {
    talents: sorted(
      Object.entries(build.talents).map(([name, resolution]) => [name, resolution.selection] as const),
    ),
    heroTree: build.heroTree.state === "RESOLVED" ? build.heroTree.simcName : null,
    apex1: build.apex1.selection,
    apex3: build.apex3.selection,
    buildStaticAtoms: diagnostics === null ? null : sorted(Object.entries(diagnostics.buildStatic)),
  };
  const expected = {
    talents: sorted(Object.entries(params.expected.talents)),
    heroTree: params.expected.heroTree,
    apex1: params.expected.apex1,
    apex3: params.expected.apex3,
    buildStaticAtoms: sorted(Object.entries(params.expected.buildStaticAtoms)),
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
  params: ParamsOf<"SPEC_BREWMASTER_MONK.NON_DOMAIN_ENTRIES">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId);
  if (!run.ok) return run.outcome;
  const loaded = pinnedBrewmasterMonkAuthority();
  if (!loaded.ok) return fail("the pinned authority did not load", { actual: { reason: loaded.reason } });
  const facts: BrewmasterBuildFacts = {
    talents: run.analysis.build.talents,
    heroTree: run.analysis.build.heroTree,
  };
  const actual: string[] = [];
  for (const action of loaded.authority.actions) {
    if (action.entryKind !== "PLAYER_ACTION") continue;
    const verdict = resolveBrewmasterApplicability(facts, action);
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
  params: ParamsOf<"SPEC_BREWMASTER_MONK.SPEC_GATE">,
): AssertionOutcome {
  const analysis = analyzeObservedBrewmasterMonkDecisions({
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
