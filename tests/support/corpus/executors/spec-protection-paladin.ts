/**
 * SPEC_PROTECTION_PALADIN executors (M10-C): the real internal Protection
 * Paladin registration over a real corpus artifact.
 *
 * The analysis is obtained through the REGISTRATION — `registration.analyze`,
 * which checks input and result ownership and hands the facade the
 * registration's own authority access — never by calling the facade with a
 * hand-built authority. No transport, no service, no network: the corpus
 * fight builder supplies the state, and everything between it and the
 * outcome is production code from `src/specs/paladin/protection/`.
 *
 * ONE REAL ANALYSIS PER INPUT PER RUN. Thirty-odd assertions read the same
 * analysis of the same artifact and actor. `analyzedOrFail` derives it once
 * per corpus execution through the run's own `CorpusExecutionContext`, keyed
 * by every input the analysis has, and every assertion then checks what it
 * checks against that one frozen result. The gap derivative is a different
 * artifact with a different digest and is analyzed on its own. Nothing is
 * memoized in production code, and nothing survives the run.
 *
 * BUNDLES (M10-C5 Phase B). A case whose params carry `historyArtifactIds`
 * is analyzed over ONE fight composed from those artifacts, in order, with
 * the case's own artifact last, and exactly the `declaredHoles` left as
 * PARTIAL coverage (`stateOfBundle`). The memo key then names every part's
 * id, digest and provenance plus the holes, so a bundle with one segment
 * swapped, re-cut or re-ordered is a different analysis. `evaluationWindow`
 * restricts the population an aggregate assertion counts to decisions whose
 * report time lies inside it; it never changes the analysis itself.
 */

import type { CombatState } from "../../../../src/engine/state/combat-state.js";
import type { GearPiece } from "../../../../src/engine/normalization/normalized-events.js";
import { PublicAnalysisResultSchema } from "../../../../src/contracts/analysis-contract.js";
import { projectAnalysisResult } from "../../../../src/contracts/analysis-projection.js";
import { PROTECTION_PALADIN_ANALYZER_ID } from "../../../../src/specs/paladin/protection/spec.js";
import {
  analyzeObservedProtectionPaladinDecisions,
  summarizeProtectionDecisions,
  type ProtectionBuildResolution,
  type ProtectionPaladinAnalysis,
} from "../../../../src/specs/paladin/protection/observed-analysis.js";
import { PROTECTION_PALADIN_REGISTRATION } from "../../../../src/specs/paladin/protection/registration.js";
import { resolveProtectionAtoms } from "../../../../src/specs/paladin/protection/resolver.js";
import {
  resolveProtectionApplicability,
  USE_ITEM_TOKEN,
  USE_ITEMS_TOKEN,
  wornSubActionSet,
  type ProtectionBuildFacts,
} from "../../../../src/specs/paladin/protection/action-profile.js";
import { initialProtectionState } from "../../../../src/specs/paladin/protection/first-gcd-state.js";
import { pinnedProtectionPaladinAuthority } from "../../../../src/specs/paladin/protection/pinned-authority.js";
import {
  DIVINE_INSPIRATION_DISPLAY_NAME,
  resolveProtectionHeroEntry,
} from "../../../../src/specs/paladin/protection/subaction-candidates.js";
import { PROTECTION_PALADIN_SPEC_ID } from "../../../../src/specs/paladin/protection/spec.js";
import type { CorpusExecutionContext } from "../execution-context.js";
import {
  bundleOf,
  BundleCompositionError,
  positionOfCast,
  stateOf,
  stateOfBundle,
  type BundleHole,
} from "../fight.js";
import type { LoadedArtifact, LoadedCase, LoadedCorpus } from "../loader.js";
import { fail, pass, type AssertionOutcome } from "./outcome.js";
import type { ParamsOf } from "./params.js";

type Analyzed = Extract<ProtectionPaladinAnalysis, { status: "ANALYZED" }>;

function analysisFacts(analysis: ProtectionPaladinAnalysis): unknown {
  return analysis.status === "ANALYZED"
    ? {
        status: analysis.status,
        comparisons: analysis.comparisons.length,
        artifactRevision: analysis.authority.artifactRevision,
      }
    : { status: analysis.status, detail: analysis.detail };
}

/** The bundle a case asks for, or null for a single-artifact analysis. */
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

/**
 * The registration's analysis of one actor over one artifact — or one bundle
 * — derived once per run. The key names every input: the code path, every
 * part in order (id, digest and provenance — the events and the coverage the
 * fight is granted), the declared holes, the actor, the specialization and
 * the target.
 */
function analysisOf(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  actorId: number,
  targetActorId: number | null,
  bundle: BundleRequest | null,
): { readonly state: CombatState; readonly analysis: ProtectionPaladinAnalysis } {
  const parts = bundle === null ? [artifact] : partsOf(corpus, artifact, bundle);
  const key = JSON.stringify({
    derivation: "PROTECTION_PALADIN_REGISTRATION.analyze",
    analyzerId: PROTECTION_PALADIN_REGISTRATION.analyzerId,
    parts: parts.map((part) => ({
      artifactId: part.record.artifactId,
      artifactSha256: part.record.sha256,
      provenance: part.record.provenance,
    })),
    declaredHoles: bundle?.declaredHoles ?? [],
    actorId,
    specId: PROTECTION_PALADIN_SPEC_ID,
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
    const analysis = PROTECTION_PALADIN_REGISTRATION.analyze({
      state,
      actorId,
      specId: PROTECTION_PALADIN_SPEC_ID,
      targetActorId,
    }) as ProtectionPaladinAnalysis;
    return { state, analysis };
  });
}

/** Runs the registration, checks the pinned revision, and narrows to ANALYZED. */
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

export function authorityProvenance(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.AUTHORITY_PROVENANCE">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId);
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
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.DECISION_COVERAGE">,
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
  const actual = {
    outcome: comparison.outcome,
    basis: comparison.basis,
    authorityCoverage: comparison.authorityCoverage,
    authorityToken: comparison.authorityToken,
    selectionPrecision: comparison.selectionPrecision,
    decisiveBlocker: comparison.decisiveBlocker,
    rawBlocker: comparison.rawBlocker,
    observedActionRejected: comparison.observedActionRejected,
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

/**
 * M11-C4h: the Protection tokens whose applicability reads combatant-snapshot
 * facts — worn gear, malformed gear rows, Divine Inspiration — that the
 * production analysis does not expose on its payload (`use_item` reads worn
 * gear; `use_items` reads all three). Every other token's applicability reads
 * only the talent and hero-tree resolutions the analysis DOES expose
 * (`analysis.build`), which `m11c4h-protection-applicability-parity` proves
 * by invariance over the whole pinned authority. OBSERVED_TOKEN_APPLICABILITY
 * refuses these tokens rather than answer from facts it cannot take from the
 * production analysis.
 */
/** The pinned Protection authority, typed through the specialization's own loader (no direct src/simc import). */
type ProtectionAuthority = Extract<
  ReturnType<typeof pinnedProtectionPaladinAuthority>,
  { ok: true }
>["authority"];

export const SNAPSHOT_READING_APPLICABILITY_TOKENS: readonly string[] = [USE_ITEM_TOKEN, USE_ITEMS_TOKEN];

/**
 * The build facts OBSERVED_TOKEN_APPLICABILITY hands the production
 * `resolveProtectionApplicability`. The four talent and hero-tree facts ARE the
 * production analysis's own resolution objects (`analysis.build`, by
 * reference — the same objects `observed-analysis.ts` puts in its build
 * facts). The snapshot-derived facts are read from the actor's combatant info
 * the same way the analysis reads it; they matter only to
 * SNAPSHOT_READING_APPLICABILITY_TOKENS, which the assertion refuses.
 */
export function protectionApplicabilityBuildFacts(
  state: CombatState,
  actorId: number,
  build: ProtectionBuildResolution,
): ProtectionBuildFacts | null {
  for (const at of state.positionsOfKind("COMBATANT_INFO")) {
    const event = state.eventAt(at);
    if (event?.kind !== "COMBATANT_INFO" || event.snapshot.actorId !== actorId) continue;
    const talents = event.snapshot.talentTree.map((entry) => ({ id: entry.id, nodeId: entry.nodeId }));
    return {
      blessedHammer: build.blessedHammer,
      sentinel: build.sentinel,
      avengingWrath: build.avengingWrath,
      heroTree: build.heroTree,
      wornGear: event.snapshot.gear,
      malformedGearRows: event.snapshot.malformedGearRows,
      divineInspiration: resolveProtectionHeroEntry(talents, DIVINE_INSPIRATION_DISPLAY_NAME).selection,
    };
  }
  return null;
}

/**
 * Every pinned PLAYER_ACTION entry naming `token`, with the production
 * applicability verdict under `facts` in the neutral race world the
 * unselectability proof uses (`observed-action-gate.ts`). Refused for a
 * snapshot-reading token.
 */
export function observedTokenApplicabilityEntries(
  facts: ProtectionBuildFacts,
  authority: ProtectionAuthority,
  token: string,
):
  | {
      readonly ok: true;
      readonly entries: readonly {
        readonly listName: string;
        readonly priorityOrdinal: number;
        readonly applicability: string;
      }[];
    }
  | { readonly ok: false; readonly reason: string } {
  if (SNAPSHOT_READING_APPLICABILITY_TOKENS.includes(token)) {
    return {
      ok: false,
      reason: `${token} applicability reads combatant-snapshot facts the production analysis does not expose; this assertion answers only from the analysis's own build resolution`,
    };
  }
  const neutral = initialProtectionState("OTHER");
  return {
    ok: true,
    entries: authority.actions
      .filter((action) => action.entryKind === "PLAYER_ACTION" && action.actionToken === token)
      .map((action) => ({
        listName: action.listName,
        priorityOrdinal: action.priorityOrdinal,
        applicability: resolveProtectionApplicability(facts, neutral, action).kind,
      })),
  };
}

/**
 * M11-C4h: the applicability, under the actor's PROVEN build, of every pinned
 * entry naming the observed action's token — the fact a negative control needs
 * so its REJECTED cannot rest on the action being background for the build.
 * The verdict is the production `resolveProtectionApplicability` over the
 * production analysis's own build resolution (`protectionApplicabilityBuildFacts`).
 */
export function observedTokenApplicability(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.OBSERVED_TOKEN_APPLICABILITY">,
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
    return fail("the observed cast is not an eligible decision", {
      expected: { eligible: true },
      locator: run.state.locatorAt(position.position),
    });
  }
  const loaded = pinnedProtectionPaladinAuthority();
  if (!loaded.ok) return fail("the pinned Protection authority does not load", { actual: loaded.reason });
  const facts = protectionApplicabilityBuildFacts(run.state, params.actorId, run.analysis.build);
  if (facts === null)
    return fail("no combatant info for the actor", { expected: { actorId: params.actorId } });
  const observedToken = comparison.decision.observedToken;
  const resolved = observedTokenApplicabilityEntries(facts, loaded.authority, observedToken);
  if (!resolved.ok) return fail(resolved.reason, { expected: params.expected });
  const actual = { observedToken, entries: resolved.entries };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the observed token's applicability differs from the case", {
      expected: params.expected,
      actual,
      locator: comparison.decision.locator,
    });
  }
  return pass();
}

function insideWindow(
  reportTimeMs: number,
  window: { readonly fromReportTimeMs: number; readonly toReportTimeMs: number },
): boolean {
  return reportTimeMs >= window.fromReportTimeMs && reportTimeMs <= window.toReportTimeMs;
}

export function coverageSummary(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.COVERAGE_SUMMARY">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const window = params.evaluationWindow ?? null;
  const coverage =
    window === null
      ? run.analysis.coverage
      : summarizeProtectionDecisions(
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

function holyPowerRecordFor(
  run: { readonly state: CombatState; readonly analysis: Analyzed },
  actorId: number,
  cast: { readonly reportTimeMs: number; readonly abilityGameId: number },
) {
  const position = castPosition(run.state, actorId, cast);
  if (!position.ok) return position;
  const record = run.analysis.holyPower.find((entry) => entry.position === position.position);
  if (record === undefined) {
    return {
      ok: false as const,
      outcome: fail("the evaluator recorded no Holy Power observation for this cast", {
        expected: cast,
        locator: run.state.locatorAt(position.position),
      }),
    };
  }
  return { ok: true as const, record };
}

export function holyPowerObservation(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.HOLY_POWER_OBSERVATION">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId);
  if (!run.ok) return run.outcome;
  const found = holyPowerRecordFor(run, params.actorId, params.cast);
  if (!found.ok) return found.outcome;
  if (JSON.stringify(found.record.observation) !== JSON.stringify(params.expected)) {
    return fail("the Holy Power observation on this cast differs from the case", {
      expected: params.expected,
      actual: found.record.observation,
      locator: found.record.locator,
    });
  }
  return pass();
}

export function holyPowerNotObserved(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.HOLY_POWER_NOT_OBSERVED">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId);
  if (!run.ok) return run.outcome;
  const found = holyPowerRecordFor(run, params.actorId, params.cast);
  if (!found.ok) return found.outcome;
  if (found.record.observation.state !== "NO_OBSERVATION") {
    return fail("the evaluator recorded a Holy Power value where the case pins NO_OBSERVATION", {
      expected: { state: "NO_OBSERVATION" },
      actual: found.record.observation,
      locator: found.record.locator,
    });
  }
  return pass();
}

export function domainResult(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.DOMAIN_RESULT">,
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
  };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the domain result differs from the case", { expected: params.expected, actual });
  }
  return pass();
}

export function useItemsSubActionSet(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.USE_ITEMS_SUB_ACTION_SET">,
): AssertionOutcome {
  const state = stateOf(corpus, artifact);
  let gear: readonly GearPiece[] | null = null;
  let malformedGearRows: readonly number[] = [];
  let talents: readonly { readonly id: number; readonly nodeId: number | null }[] = [];
  for (const position of state.positionsOfKind("COMBATANT_INFO")) {
    const event = state.eventAt(position);
    if (event?.kind === "COMBATANT_INFO" && event.snapshot.actorId === params.actorId) {
      gear = event.snapshot.gear;
      malformedGearRows = event.snapshot.malformedGearRows;
      talents = event.snapshot.talentTree.map((entry) => ({ id: entry.id, nodeId: entry.nodeId }));
      break;
    }
  }
  if (gear === null) {
    return fail("no combatant info for the actor", { expected: { actorId: params.actorId } });
  }
  const divineInspiration = resolveProtectionHeroEntry(talents, DIVINE_INSPIRATION_DISPLAY_NAME).selection;
  const set = wornSubActionSet(gear, divineInspiration, malformedGearRows);
  const counts = new Map<string, number>();
  for (const slot of set.open) counts.set(slot.reason, (counts.get(slot.reason) ?? 0) + 1);
  const actual = {
    onUseItemIds: set.onUse.map((item) => item.itemId),
    open: [...counts.entries()].map(([reason, count]) => ({ reason, count })),
    openSlotIndices: set.open.map((slot) => slot.slotIndex),
    provenIrrelevant: set.provenIrrelevant.length,
    divineInspiration,
  };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the use_items sub-action set differs from the case", { expected: params.expected, actual });
  }
  return pass();
}

export function cooldownReadinessAt(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.COOLDOWN_READINESS_AT">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const position = castPosition(run.state, params.actorId, params.observedCast);
  if (!position.ok) return position.outcome;
  const resolved = run.analysis.resolved.find((entry) => entry.position === position.position);
  const cooldown = resolved?.cooldowns.find((entry) => entry.simcToken === params.simcToken);
  if (resolved === undefined || cooldown === undefined) {
    return fail("the evaluator derived no cooldown for this token at this decision", {
      expected: { simcToken: params.simcToken },
      locator: run.state.locatorAt(position.position),
    });
  }
  const anchored = cooldown.perAbility.find(
    (entry) => entry.abilityGameId === cooldown.readinessAbilityGameId,
  );
  const anchorCooldown = anchored?.cooldown;
  const first = cooldown.perAbility[0];
  const actual = {
    readiness: cooldown.readiness.state,
    provenRemainingAtLeastMs:
      cooldown.readiness.state === "PROVEN_NOT_READY" ? cooldown.readiness.provenRemainingAtLeastMs : null,
    anchorReportTimeMs:
      anchorCooldown !== undefined && anchorCooldown.state !== "UNKNOWN"
        ? anchorCooldown.anchorLocator.reportTimeMs
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
      locator: run.state.locatorAt(position.position),
    });
  }
  return pass();
}

export function auraBindingAt(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.AURA_BINDING_AT">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const position = castPosition(run.state, params.actorId, params.observedCast);
  if (!position.ok) return position.outcome;
  const resolved = run.analysis.resolved.find((entry) => entry.position === position.position);
  const aura = resolved?.auras.find((entry) => entry.atomName === params.atomName);
  if (resolved === undefined || aura === undefined) {
    return fail("the evaluator bound no aura atom of this name at this decision", {
      expected: { atomName: params.atomName },
      locator: run.state.locatorAt(position.position),
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
      : aura.state === "BOUND_BY_BUILD"
        ? {
            state: aura.state,
            up: aura.up,
            abilityGameId: aura.abilityGameId,
            anchorReportTimeMs: null,
            reason: aura.gate,
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
      locator: run.state.locatorAt(position.position),
    });
  }
  return pass();
}

export function unknownBlockerDistribution(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.UNKNOWN_BLOCKER_DISTRIBUTION">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const window = params.evaluationWindow ?? null;
  const comparisons =
    window === null
      ? run.analysis.comparisons
      : run.analysis.comparisons.filter((entry) => insideWindow(entry.decision.reportTimeMs, window));
  const blockedAt = new Map<string, number>();
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
  }
  const actual = {
    match,
    rejected,
    blockedAt: Object.fromEntries(
      [...blockedAt.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
    ),
  };
  const expected = {
    match: params.expected.match,
    rejected: params.expected.rejected,
    blockedAt: Object.fromEntries(
      Object.entries(params.expected.blockedAt).sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)),
    ),
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    return fail("the UNKNOWN blocker distribution differs from the case", { expected, actual });
  }
  const unknown = [...blockedAt.values()].reduce((sum, count) => sum + count, 0);
  if (match + rejected + unknown !== comparisons.length) {
    return fail("the blockers and the resolved counts do not partition the eligible decisions", {
      actual: { match, rejected, unknown, eligible: comparisons.length },
    });
  }
  return pass();
}

export function armamentStateAt(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.ARMAMENT_STATE_AT">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const position = castPosition(run.state, params.actorId, params.observedCast);
  if (!position.ok) return position.outcome;
  const resolved = run.analysis.resolved.find((entry) => entry.position === position.position);
  if (resolved === undefined) {
    return fail("the observed cast is not an eligible decision, so no armament state was resolved there", {
      expected: params.observedCast,
      locator: run.state.locatorAt(position.position),
    });
  }
  const armament = resolved.diagnostics.armament;
  if (armament === null) {
    return fail("the hero tree is not Lightsmith, so the alternation is not consulted", {
      expected: params.expected,
      actual: { heroTree: resolved.diagnostics.heroTree },
      locator: run.state.locatorAt(position.position),
    });
  }
  const actual =
    armament.state === "KNOWN"
      ? {
          state: armament.state,
          nextArmament: armament.nextArmament,
          anchorReportTimeMs: armament.anchorReportTimeMs,
          anchorAbilityGameId: armament.anchorAbilityGameId,
          reason: null,
        }
      : {
          state: armament.state,
          nextArmament: null,
          anchorReportTimeMs: null,
          anchorAbilityGameId: null,
          reason: armament.reason,
        };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the Lightsmith alternation at this decision differs from the case", {
      expected: params.expected,
      actual,
      locator: run.state.locatorAt(position.position),
    });
  }
  return pass();
}

export function buildResolution(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.BUILD_RESOLUTION">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId);
  if (!run.ok) return run.outcome;
  const { build } = run.analysis;
  const talents: Record<string, string> = {
    righteous_protector: build.righteousProtector.selection,
    sentinel: build.sentinel.selection,
    avenging_wrath: build.avengingWrath.selection,
    blessed_hammer: build.blessedHammer.selection,
  };
  const actualTalents = Object.fromEntries(
    Object.keys(params.expected.talents).map((name) => [
      name,
      talents[name] ?? "NOT_MODELLED_BY_THE_PAYLOAD",
    ]),
  );
  const heroTree =
    build.heroTree.state === "RESOLVED"
      ? { state: "RESOLVED", simcName: build.heroTree.simcName }
      : { state: build.heroTree.state };
  const actual = { talents: actualTalents, heroTree };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the build resolution differs from the case", { expected: params.expected, actual });
  }
  return pass();
}

export function resolvedAtom(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.RESOLVED_ATOM">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId, null, bundleRequestOf(params));
  if (!run.ok) return run.outcome;
  const position = castPosition(run.state, params.actorId, params.observedCast);
  if (!position.ok) return position.outcome;
  // The resolver over the SAME state and tree the evaluator used, at the
  // decision's position. Player-scoped atoms only: a self-addressing atom is
  // keyed by action and is asserted through the evaluator's traversal instead.
  const observedTalents = talentEntriesOf(run.state, params.actorId);
  const resolution = resolveProtectionAtoms({
    state: run.state,
    actorId: params.actorId,
    position: position.position,
    observedTalents,
    actionTokens: [],
  });
  const declared = resolution.specAtoms.vocabulary.lookup(params.atom);
  if (declared === null) {
    return fail("the case names an identifier the Protection vocabulary does not declare", {
      expected: { atom: params.atom },
    });
  }
  const binding = resolution.specAtoms.bound.find(
    (entry) => entry.key === params.atom && entry.actionToken === null,
  );
  const actual =
    binding === undefined
      ? { kind: "UNBOUND" }
      : binding.value.kind === "TRUTH"
        ? { kind: "TRUTH", value: binding.value.value }
        : {
            kind: "MAGNITUDE",
            state: binding.value.binding.state,
            value: binding.value.binding.state === "KNOWN_NUMBER" ? binding.value.binding.value : null,
            reason: binding.value.binding.state === "KNOWN_NUMBER" ? null : binding.value.binding.reason,
          };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the resolver bound the identifier differently than the case pins", {
      expected: params.expected,
      actual,
      locator: run.state.locatorAt(position.position),
    });
  }
  return pass();
}

function talentEntriesOf(state: CombatState, actorId: number) {
  for (const position of state.positionsOfKind("COMBATANT_INFO")) {
    const event = state.eventAt(position);
    if (event?.kind === "COMBATANT_INFO" && event.snapshot.actorId === actorId) {
      return event.snapshot.talentTree.map((entry) => ({ id: entry.id, nodeId: entry.nodeId }));
    }
  }
  return [];
}

export function specGate(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.SPEC_GATE">,
): AssertionOutcome {
  const analysis = analyzeObservedProtectionPaladinDecisions({
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

/** Every property name appearing anywhere in a JSON value. */
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
  "observedActionRejected",
  "actorId",
  "domains",
  "holyPower",
  "build",
  "resolved",
  "diagnostics",
  "scope",
];
/** Internal-only vocabulary; none may appear as a public value. */
const INTERNAL_STRINGS = [
  "MELEE_SWING",
  "TRANSITION_UNSUPPORTED",
  "DIVERGENT_GCD_OUTCOMES",
  "NO_PINNED_AUTHORITY_FOR_DOMAIN",
  "AUTHORITY_LOAD_FAILED",
  "DOMAIN_NOT_DECLARED",
];

/**
 * SPEC_PROTECTION_PALADIN.PUBLIC_PROJECTION (M10-D): the registration's
 * analysis through its own view and the real public projection.
 *
 * The application envelope is assembled here exactly as the service
 * assembles it (spec id, analyzer id, the registration's view); the
 * projection and the schema are the production ones. The identity is the
 * artifact's synthetic header with the case's actor — the document's
 * identity block is not what this kind asserts.
 */
export function publicProjection(
  context: CorpusExecutionContext,
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.PUBLIC_PROJECTION">,
): AssertionOutcome {
  const run = analyzedOrFail(context, corpus, kase, artifact, params.actorId);
  if (!run.ok) return run.outcome;
  const { state, analysis } = run;
  const { fight } = state;
  // The projection's own input type, so this executor names the contract it
  // drives and never reaches the services layer (the M9-A layering guard).
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
        specName: "Protection",
      },
    },
    specId: PROTECTION_PALADIN_SPEC_ID,
    analyzerId: PROTECTION_PALADIN_ANALYZER_ID,
    scope: "PLAYER_CONTEXT",
    analysis,
    observedDecisions: PROTECTION_PALADIN_REGISTRATION.observedDecisionView(analysis),
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
  if (projected.status !== "ANALYZED") {
    return fail("the projected document is not ANALYZED", {
      expected: { status: "ANALYZED" },
      actual: { status: projected.status },
    });
  }

  const exclusions: Record<string, number> = {};
  for (const row of projected.coverage.exclusions) exclusions[row.key] = row.count;
  const actual = {
    specId: projected.specialization.specId,
    analyzerId: projected.analyzerId,
    eligibleDecisions: projected.coverage.eligibleDecisions,
    match: projected.coverage.match,
    rejected: projected.coverage.rejected,
    unknown: projected.coverage.unknown,
    excludedCastCount: projected.coverage.excludedCastCount,
    exclusions,
  };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the projected totals differ from what the case pins", { expected: params.expected, actual });
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

/**
 * NORMALIZATION.BUNDLE_COMPOSITION: the composer over these parts, in order,
 * with the case's artifact last. Not memoized: a composition assertion is the
 * one place the composition itself is under test.
 */
export function bundleComposition(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"NORMALIZATION.BUNDLE_COMPOSITION">,
): AssertionOutcome {
  const ids = [...params.historyArtifactIds, artifact.record.artifactId];
  let composed: ReturnType<typeof bundleOf>;
  try {
    composed = bundleOf(corpus, ids, params.declaredHoles);
  } catch (error) {
    if (error instanceof BundleCompositionError) {
      return fail(error.message, { expected: { composed: true }, actual: { composed: false } });
    }
    throw error;
  }
  const { fight } = composed;
  const coverage = Object.fromEntries(
    Object.keys(params.expected.coverage).map((category) => [
      category,
      (
        fight.completeness.categories as Record<
          string,
          { readonly coverage?: { readonly state: string } } | undefined
        >
      )[category]?.coverage?.state ?? "ABSENT",
    ]),
  );
  const castRanges = (composed.coveredRanges.CASTS ?? []).map((range) => ({
    fromReportTimeMs: range.fromReportTimeMs,
    toReportTimeMs: range.toReportTimeMs,
  }));
  const actual = {
    events: composed.events,
    coverage,
    castRanges,
    windowFromReportTimeMs: fight.fight.startTimeMs,
    windowToReportTimeMs: fight.fight.endTimeMs,
  };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the composed bundle differs from the case", { expected: params.expected, actual });
  }
  return pass();
}
