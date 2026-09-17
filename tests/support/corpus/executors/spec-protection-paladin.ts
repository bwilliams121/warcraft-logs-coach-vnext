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
 */

import type { CombatState } from "../../../../src/engine/state/combat-state.js";
import type { GearPiece } from "../../../../src/engine/normalization/normalized-events.js";
import { InternalSpecExposureError, requirePublicSpecId } from "../../../../src/findings/spec-id.js";
import {
  analyzeObservedProtectionPaladinDecisions,
  type ProtectionPaladinAnalysis,
} from "../../../../src/specs/paladin/protection/observed-analysis.js";
import { PROTECTION_PALADIN_REGISTRATION } from "../../../../src/specs/paladin/protection/registration.js";
import { resolveProtectionAtoms } from "../../../../src/specs/paladin/protection/resolver.js";
import { wornSubActionSet } from "../../../../src/specs/paladin/protection/action-profile.js";
import {
  DIVINE_INSPIRATION_DISPLAY_NAME,
  resolveProtectionHeroEntry,
} from "../../../../src/specs/paladin/protection/subaction-candidates.js";
import { PROTECTION_PALADIN_SPEC_ID } from "../../../../src/specs/paladin/protection/spec.js";
import { positionOfCast, stateOf } from "../fight.js";
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

/** Runs the registration, checks the pinned revision, and narrows to ANALYZED. */
function analyzedOrFail(
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  actorId: number,
  targetActorId: number | null = null,
):
  | { readonly ok: true; readonly state: CombatState; readonly analysis: Analyzed }
  | { readonly ok: false; readonly outcome: AssertionOutcome } {
  const state = stateOf(corpus, artifact);
  const analysis = PROTECTION_PALADIN_REGISTRATION.analyze({
    state,
    actorId,
    specId: PROTECTION_PALADIN_SPEC_ID,
    targetActorId,
  }) as ProtectionPaladinAnalysis;
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
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.AUTHORITY_PROVENANCE">,
): AssertionOutcome {
  const run = analyzedOrFail(corpus, kase, artifact, params.actorId);
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
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.DECISION_COVERAGE">,
): AssertionOutcome {
  const run = analyzedOrFail(corpus, kase, artifact, params.actorId, params.targetActorId);
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

export function coverageSummary(
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.COVERAGE_SUMMARY">,
): AssertionOutcome {
  const run = analyzedOrFail(corpus, kase, artifact, params.actorId);
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
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.HOLY_POWER_OBSERVATION">,
): AssertionOutcome {
  const run = analyzedOrFail(corpus, kase, artifact, params.actorId);
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
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.HOLY_POWER_NOT_OBSERVED">,
): AssertionOutcome {
  const run = analyzedOrFail(corpus, kase, artifact, params.actorId);
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
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.DOMAIN_RESULT">,
): AssertionOutcome {
  const run = analyzedOrFail(corpus, kase, artifact, params.actorId);
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

export function buildResolution(
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.BUILD_RESOLUTION">,
): AssertionOutcome {
  const run = analyzedOrFail(corpus, kase, artifact, params.actorId);
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
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.RESOLVED_ATOM">,
): AssertionOutcome {
  const run = analyzedOrFail(corpus, kase, artifact, params.actorId);
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

export function notPubliclyProjectable(
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_PROTECTION_PALADIN.NOT_PUBLICLY_PROJECTABLE">,
): AssertionOutcome {
  const run = analyzedOrFail(corpus, kase, artifact, params.actorId);
  if (!run.ok) return run.outcome;
  try {
    requirePublicSpecId(run.analysis.specId);
  } catch (error: unknown) {
    if (error instanceof InternalSpecExposureError) return pass();
    return fail("the public narrowing boundary threw something other than InternalSpecExposureError", {
      actual: { name: error instanceof Error ? error.name : typeof error },
    });
  }
  return fail("the analyzed internal result was narrowed to a public specialization", {
    expected: { thrown: "InternalSpecExposureError" },
    actual: { specId: run.analysis.specId },
  });
}
