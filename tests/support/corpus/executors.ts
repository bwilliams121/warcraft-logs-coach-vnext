/**
 * Dispatch: one registered assertion kind → one executor, in the layer that
 * owns it.
 *
 * Executors live one module per owning layer under `./executors/`, each
 * driving the REAL production path for that layer over the artifact's bytes.
 * No executor reimplements the layer it tests, and no executor may consult a
 * case's prose. The registry in `contract.ts` says which kinds are EXECUTABLE;
 * `EXECUTABLE_KINDS` below must match it exactly, and a contract test checks
 * that it does.
 *
 * Layers that need transport or service composition — WCL_TRANSPORT and
 * PUBLIC_CONTRACT — reach it only through the repository's offline test
 * doubles. There is no path from here to a live Warcraft Logs call.
 */

import type { AssertionKind } from "./contract.js";
import type { CorpusExecutionContext } from "./execution-context.js";
import type { LoadedAssertion, LoadedCase, LoadedCorpus } from "./loader.js";
import * as applicationService from "./executors/application-service.js";
import * as combatState from "./executors/combat-state.js";
import * as normalization from "./executors/normalization.js";
import type { AssertionOutcome } from "./executors/outcome.js";
import type { ParamsOf } from "./executors/params.js";
import * as publicContract from "./executors/public-contract.js";
import * as spec from "./executors/spec-assassination.js";
import * as protection from "./executors/spec-protection-paladin.js";
import * as retribution from "./executors/spec-retribution-paladin.js";
import * as blood from "./executors/spec-blood-death-knight.js";
import * as sharedEngine from "./executors/shared-decision-engine.js";
import * as transport from "./executors/wcl-transport.js";

export type { AssertionOutcome } from "./executors/outcome.js";

/**
 * Runs one assertion. Payload-kind compatibility and parameter validity were
 * established by the loader, so a mismatch here is a programming error and
 * throws rather than failing softly.
 *
 * `context` is the run's own scope (see `execution-context.ts`): an executor
 * that derives one expensive value for many assertions derives it once per run
 * there. It is created by the harness per run and is never module state.
 */
export async function executeAssertion(
  corpus: LoadedCorpus,
  kase: LoadedCase,
  assertion: LoadedAssertion,
  context: CorpusExecutionContext,
): Promise<AssertionOutcome> {
  const { artifact } = kase;
  const params = assertion.params;
  switch (assertion.kind) {
    case "NORMALIZATION.EVENT_COUNT_PRESERVED":
      return normalization.eventCountPreserved(artifact, params as ParamsOf<typeof assertion.kind>);
    case "NORMALIZATION.INPUT_ORDER_PRESERVED":
      return normalization.inputOrderPreserved(artifact);
    case "NORMALIZATION.TIMESTAMP_RUN_RETAINED":
      return normalization.timestampRunRetained(artifact, params as ParamsOf<typeof assertion.kind>);
    case "NORMALIZATION.ALL_TYPES_RECOGNISED":
      return normalization.allTypesRecognised(artifact);
    case "NORMALIZATION.SOURCE_ABSENCE":
      return normalization.sourceAbsence(artifact, params as ParamsOf<typeof assertion.kind>);
    case "NORMALIZATION.SIDE_REFERENCE":
      return normalization.sideReference(artifact, params as ParamsOf<typeof assertion.kind>);
    case "NORMALIZATION.ATTACHED_RESOURCE_SIDE":
      return normalization.attachedResourceSide(artifact, params as ParamsOf<typeof assertion.kind>);
    case "NORMALIZATION.EVENT_FACTS":
      return normalization.eventFacts(artifact, params as ParamsOf<typeof assertion.kind>);
    case "NORMALIZATION.ACTOR_EVENT_CENSUS":
      return normalization.actorEventCensus(artifact, params as ParamsOf<typeof assertion.kind>);
    case "NORMALIZATION.NO_ACTOR_REF_HOLDS":
      return normalization.noActorRefHolds(artifact, params as ParamsOf<typeof assertion.kind>);
    case "NORMALIZATION.UNSUPPORTED_TYPE_COUNTED":
      return normalization.unsupportedTypeCounted(artifact, params as ParamsOf<typeof assertion.kind>);
    case "NORMALIZATION.ACTOR_CATALOG":
      return normalization.actorCatalog(artifact, params as ParamsOf<typeof assertion.kind>);
    case "NORMALIZATION.FIGHT_HEADER":
      return normalization.fightHeader(artifact, params as ParamsOf<typeof assertion.kind>);
    case "WCL_DECODE.EVENT_PAGE_OUTCOME":
      return transport.eventPageOutcome(artifact, params as ParamsOf<typeof assertion.kind>);
    case "WCL_PAGINATION.STREAM_OUTCOME":
      return await transport.paginationStreamOutcome(artifact, params as ParamsOf<typeof assertion.kind>);
    case "WCL_PAGINATION.PAGE_ENVELOPE_FACTS":
      return transport.pageEnvelopeFacts(artifact, params as ParamsOf<typeof assertion.kind>);
    case "WCL_TRANSPORT.FIGHT_IDENTITY":
      return transport.fightIdentity(artifact, params as ParamsOf<typeof assertion.kind>);
    case "SHARED_DECISION_ENGINE.SCAN_SELECTS_DEFINITELY":
      return sharedEngine.scanSelectsDefinitely(artifact, params as ParamsOf<typeof assertion.kind>);
    case "SHARED_DECISION_ENGINE.SCAN_UNDECIDED_BY_HIGHER_PRIORITY":
      return sharedEngine.scanUndecidedByHigherPriority(artifact, params as ParamsOf<typeof assertion.kind>);
    case "SHARED_DECISION_ENGINE.SCAN_REFUSES_UNSUPPORTED_EXPRESSION":
      return sharedEngine.scanRefusesUnsupportedExpression(
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SHARED_DECISION_ENGINE.SCAN_SELECTS_NOTHING":
      return sharedEngine.scanSelectsNothing(artifact, params as ParamsOf<typeof assertion.kind>);
    case "SHARED_DECISION_ENGINE.SCAN_BLOCKED_WITH":
      return sharedEngine.scanBlockedWith(artifact, params as ParamsOf<typeof assertion.kind>);
    case "APPLICATION_SERVICE.FIGHT_ANALYSIS":
      return await applicationService.fightAnalysis(
        corpus,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "COMBAT_STATE.LAST_OBSERVED_CAST_PROVEN_ABSENT":
      return combatState.lastObservedCastProvenAbsent(
        corpus,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "COMBAT_STATE.LAST_OBSERVED_CAST_UNKNOWN":
      return combatState.lastObservedCastUnknown(corpus, artifact, params as ParamsOf<typeof assertion.kind>);
    case "COMBAT_STATE.LAST_OBSERVED_CAST_AT":
      return combatState.lastObservedCastAt(corpus, artifact, params as ParamsOf<typeof assertion.kind>);
    case "COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST":
      return combatState.resourceObservationOnCast(
        corpus,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "COMBAT_STATE.LATEST_RESOURCE_OBSERVATION":
      return combatState.latestResourceObservation(
        corpus,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "COMBAT_STATE.AURA_PRESENCE":
      return combatState.auraPresence(corpus, artifact, params as ParamsOf<typeof assertion.kind>);
    case "COMBAT_STATE.ACTOR_INDEX_CENSUS":
      return combatState.actorIndexCensus(corpus, artifact, params as ParamsOf<typeof assertion.kind>);
    case "COMBAT_STATE.AURA_STACK_OBSERVATION":
      return combatState.auraStackObservation(corpus, artifact, params as ParamsOf<typeof assertion.kind>);
    case "SPEC_ASSASSINATION.DECISION_COVERAGE":
      return spec.decisionCoverage(corpus, kase, artifact, params as ParamsOf<typeof assertion.kind>);
    case "SPEC_ASSASSINATION.SPEC_GATE":
      return spec.specGate(corpus, artifact, params as ParamsOf<typeof assertion.kind>);
    case "SPEC_ASSASSINATION.AUTHORITY_UNAVAILABLE_IS_NOT_REJECTION":
      return spec.authorityUnavailableIsNotRejection(
        corpus,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_ASSASSINATION.TALENT_RESOLUTION":
      return spec.talentResolution(corpus, artifact, params as ParamsOf<typeof assertion.kind>);
    case "SPEC_ASSASSINATION.DOT_REMAINS":
      return spec.dotRemains(corpus, artifact, params as ParamsOf<typeof assertion.kind>);
    case "SPEC_PROTECTION_PALADIN.AUTHORITY_PROVENANCE":
      return protection.authorityProvenance(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_PROTECTION_PALADIN.DECISION_COVERAGE":
      return protection.decisionCoverage(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_PROTECTION_PALADIN.COVERAGE_SUMMARY":
      return protection.coverageSummary(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_PROTECTION_PALADIN.HOLY_POWER_OBSERVATION":
      return protection.holyPowerObservation(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_PROTECTION_PALADIN.HOLY_POWER_NOT_OBSERVED":
      return protection.holyPowerNotObserved(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_PROTECTION_PALADIN.DOMAIN_RESULT":
      return protection.domainResult(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_PROTECTION_PALADIN.BUILD_RESOLUTION":
      return protection.buildResolution(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_PROTECTION_PALADIN.USE_ITEMS_SUB_ACTION_SET":
      return protection.useItemsSubActionSet(corpus, artifact, params as ParamsOf<typeof assertion.kind>);
    case "SPEC_PROTECTION_PALADIN.COOLDOWN_READINESS_AT":
      return protection.cooldownReadinessAt(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_PROTECTION_PALADIN.AURA_BINDING_AT":
      return protection.auraBindingAt(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_PROTECTION_PALADIN.UNKNOWN_BLOCKER_DISTRIBUTION":
      return protection.unknownBlockerDistribution(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_PROTECTION_PALADIN.ARMAMENT_STATE_AT":
      return protection.armamentStateAt(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "NORMALIZATION.BUNDLE_COMPOSITION":
      return protection.bundleComposition(corpus, artifact, params as ParamsOf<typeof assertion.kind>);
    case "SPEC_PROTECTION_PALADIN.RESOLVED_ATOM":
      return protection.resolvedAtom(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_PROTECTION_PALADIN.SPEC_GATE":
      return protection.specGate(corpus, artifact, params as ParamsOf<typeof assertion.kind>);
    case "SPEC_PROTECTION_PALADIN.PUBLIC_PROJECTION":
      return protection.publicProjection(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_RETRIBUTION_PALADIN.AUTHORITY_PROVENANCE":
      return retribution.authorityProvenance(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_RETRIBUTION_PALADIN.DECISION_COVERAGE":
      return retribution.decisionCoverage(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_RETRIBUTION_PALADIN.COVERAGE_SUMMARY":
      return retribution.coverageSummary(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_RETRIBUTION_PALADIN.UNKNOWN_BLOCKER_DISTRIBUTION":
      return retribution.unknownBlockerDistribution(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_RETRIBUTION_PALADIN.HOLY_POWER_OBSERVATION":
      return retribution.holyPowerObservation(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_RETRIBUTION_PALADIN.AURA_BINDING_AT":
      return retribution.auraBindingAt(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_RETRIBUTION_PALADIN.STACK_BINDING_AT":
      return retribution.stackBindingAt(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_RETRIBUTION_PALADIN.DS_CASTABLE_AT":
      return retribution.dsCastableAt(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_RETRIBUTION_PALADIN.COOLDOWN_READINESS_AT":
      return retribution.cooldownReadinessAt(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_RETRIBUTION_PALADIN.DOMAIN_RESULT":
      return retribution.domainResult(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_RETRIBUTION_PALADIN.BUILD_RESOLUTION":
      return retribution.buildResolution(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_RETRIBUTION_PALADIN.NON_DOMAIN_ENTRIES":
      return retribution.nonDomainEntries(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_RETRIBUTION_PALADIN.ANALYSIS_STATUS":
      return retribution.analysisStatus(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_RETRIBUTION_PALADIN.SPEC_GATE":
      return retribution.specGate(corpus, artifact, params as ParamsOf<typeof assertion.kind>);
    case "SPEC_RETRIBUTION_PALADIN.PUBLIC_PROJECTION":
      return retribution.publicProjection(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_BLOOD_DEATH_KNIGHT.AUTHORITY_PROVENANCE":
      return blood.authorityProvenance(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_BLOOD_DEATH_KNIGHT.DECISION_COVERAGE":
      return blood.decisionCoverage(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_BLOOD_DEATH_KNIGHT.COVERAGE_SUMMARY":
      return blood.coverageSummary(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_BLOOD_DEATH_KNIGHT.STOPPING_POINT_DISTRIBUTION":
      return blood.stoppingPointDistribution(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_BLOOD_DEATH_KNIGHT.DISPATCH_TRACE_AT":
      return blood.dispatchTraceAt(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_BLOOD_DEATH_KNIGHT.RESOURCE_OBSERVATION":
      return blood.resourceObservation(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_BLOOD_DEATH_KNIGHT.AURA_BINDING_AT":
      return blood.auraBindingAt(context, corpus, kase, artifact, params as ParamsOf<typeof assertion.kind>);
    case "SPEC_BLOOD_DEATH_KNIGHT.STACK_BINDING_AT":
      return blood.stackBindingAt(context, corpus, kase, artifact, params as ParamsOf<typeof assertion.kind>);
    case "SPEC_BLOOD_DEATH_KNIGHT.COOLDOWN_READINESS_AT":
      return blood.cooldownReadinessAt(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_BLOOD_DEATH_KNIGHT.DOMAIN_RESULT":
      return blood.domainResult(context, corpus, kase, artifact, params as ParamsOf<typeof assertion.kind>);
    case "SPEC_BLOOD_DEATH_KNIGHT.BUILD_RESOLUTION":
      return blood.buildResolution(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_BLOOD_DEATH_KNIGHT.NON_DOMAIN_ENTRIES":
      return blood.nonDomainEntries(
        context,
        corpus,
        kase,
        artifact,
        params as ParamsOf<typeof assertion.kind>,
      );
    case "SPEC_BLOOD_DEATH_KNIGHT.ANALYSIS_STATUS":
      return blood.analysisStatus(context, corpus, kase, artifact, params as ParamsOf<typeof assertion.kind>);
    case "SPEC_BLOOD_DEATH_KNIGHT.SPEC_GATE":
      return blood.specGate(corpus, artifact, params as ParamsOf<typeof assertion.kind>);
    case "APPLICATION_SERVICE.INTERNAL_REGISTRATION":
      return applicationService.internalRegistration(params as ParamsOf<typeof assertion.kind>);
    case "PUBLIC_CONTRACT.REST_MCP_PARITY":
      return await publicContract.restMcpParity(corpus, artifact, params as ParamsOf<typeof assertion.kind>);
  }
}

/** The kinds this file can execute. Checked against the registry by a contract test. */
export const EXECUTABLE_KINDS: readonly AssertionKind[] = [
  "NORMALIZATION.EVENT_COUNT_PRESERVED",
  "NORMALIZATION.INPUT_ORDER_PRESERVED",
  "NORMALIZATION.TIMESTAMP_RUN_RETAINED",
  "NORMALIZATION.ALL_TYPES_RECOGNISED",
  "NORMALIZATION.SOURCE_ABSENCE",
  "NORMALIZATION.SIDE_REFERENCE",
  "NORMALIZATION.ATTACHED_RESOURCE_SIDE",
  "NORMALIZATION.EVENT_FACTS",
  "NORMALIZATION.ACTOR_EVENT_CENSUS",
  "NORMALIZATION.NO_ACTOR_REF_HOLDS",
  "NORMALIZATION.UNSUPPORTED_TYPE_COUNTED",
  "NORMALIZATION.ACTOR_CATALOG",
  "NORMALIZATION.FIGHT_HEADER",
  "NORMALIZATION.BUNDLE_COMPOSITION",
  "WCL_DECODE.EVENT_PAGE_OUTCOME",
  "WCL_PAGINATION.STREAM_OUTCOME",
  "WCL_PAGINATION.PAGE_ENVELOPE_FACTS",
  "WCL_TRANSPORT.FIGHT_IDENTITY",
  "APPLICATION_SERVICE.FIGHT_ANALYSIS",
  "COMBAT_STATE.LAST_OBSERVED_CAST_PROVEN_ABSENT",
  "COMBAT_STATE.LAST_OBSERVED_CAST_UNKNOWN",
  "COMBAT_STATE.LAST_OBSERVED_CAST_AT",
  "COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST",
  "COMBAT_STATE.LATEST_RESOURCE_OBSERVATION",
  "COMBAT_STATE.AURA_PRESENCE",
  "COMBAT_STATE.ACTOR_INDEX_CENSUS",
  "COMBAT_STATE.AURA_STACK_OBSERVATION",
  "SPEC_ASSASSINATION.DECISION_COVERAGE",
  "SPEC_ASSASSINATION.SPEC_GATE",
  "SPEC_ASSASSINATION.AUTHORITY_UNAVAILABLE_IS_NOT_REJECTION",
  "SPEC_ASSASSINATION.TALENT_RESOLUTION",
  "SPEC_ASSASSINATION.DOT_REMAINS",
  "SPEC_PROTECTION_PALADIN.AUTHORITY_PROVENANCE",
  "SPEC_PROTECTION_PALADIN.DECISION_COVERAGE",
  "SPEC_PROTECTION_PALADIN.COVERAGE_SUMMARY",
  "SPEC_PROTECTION_PALADIN.HOLY_POWER_OBSERVATION",
  "SPEC_PROTECTION_PALADIN.HOLY_POWER_NOT_OBSERVED",
  "SPEC_PROTECTION_PALADIN.DOMAIN_RESULT",
  "SPEC_PROTECTION_PALADIN.BUILD_RESOLUTION",
  "SPEC_PROTECTION_PALADIN.USE_ITEMS_SUB_ACTION_SET",
  "SPEC_PROTECTION_PALADIN.COOLDOWN_READINESS_AT",
  "SPEC_PROTECTION_PALADIN.AURA_BINDING_AT",
  "SPEC_PROTECTION_PALADIN.UNKNOWN_BLOCKER_DISTRIBUTION",
  "SPEC_PROTECTION_PALADIN.RESOLVED_ATOM",
  "SPEC_PROTECTION_PALADIN.ARMAMENT_STATE_AT",
  "SPEC_PROTECTION_PALADIN.SPEC_GATE",
  "SPEC_PROTECTION_PALADIN.PUBLIC_PROJECTION",
  "SHARED_DECISION_ENGINE.SCAN_SELECTS_DEFINITELY",
  "SHARED_DECISION_ENGINE.SCAN_UNDECIDED_BY_HIGHER_PRIORITY",
  "SHARED_DECISION_ENGINE.SCAN_REFUSES_UNSUPPORTED_EXPRESSION",
  "SHARED_DECISION_ENGINE.SCAN_SELECTS_NOTHING",
  "SHARED_DECISION_ENGINE.SCAN_BLOCKED_WITH",
  "SPEC_RETRIBUTION_PALADIN.AUTHORITY_PROVENANCE",
  "SPEC_RETRIBUTION_PALADIN.DECISION_COVERAGE",
  "SPEC_RETRIBUTION_PALADIN.COVERAGE_SUMMARY",
  "SPEC_RETRIBUTION_PALADIN.UNKNOWN_BLOCKER_DISTRIBUTION",
  "SPEC_RETRIBUTION_PALADIN.HOLY_POWER_OBSERVATION",
  "SPEC_RETRIBUTION_PALADIN.AURA_BINDING_AT",
  "SPEC_RETRIBUTION_PALADIN.STACK_BINDING_AT",
  "SPEC_RETRIBUTION_PALADIN.DS_CASTABLE_AT",
  "SPEC_RETRIBUTION_PALADIN.COOLDOWN_READINESS_AT",
  "SPEC_RETRIBUTION_PALADIN.DOMAIN_RESULT",
  "SPEC_RETRIBUTION_PALADIN.BUILD_RESOLUTION",
  "SPEC_RETRIBUTION_PALADIN.NON_DOMAIN_ENTRIES",
  "SPEC_RETRIBUTION_PALADIN.ANALYSIS_STATUS",
  "SPEC_RETRIBUTION_PALADIN.SPEC_GATE",
  "SPEC_RETRIBUTION_PALADIN.PUBLIC_PROJECTION",
  "SPEC_BLOOD_DEATH_KNIGHT.AUTHORITY_PROVENANCE",
  "SPEC_BLOOD_DEATH_KNIGHT.DECISION_COVERAGE",
  "SPEC_BLOOD_DEATH_KNIGHT.COVERAGE_SUMMARY",
  "SPEC_BLOOD_DEATH_KNIGHT.STOPPING_POINT_DISTRIBUTION",
  "SPEC_BLOOD_DEATH_KNIGHT.DISPATCH_TRACE_AT",
  "SPEC_BLOOD_DEATH_KNIGHT.RESOURCE_OBSERVATION",
  "SPEC_BLOOD_DEATH_KNIGHT.AURA_BINDING_AT",
  "SPEC_BLOOD_DEATH_KNIGHT.STACK_BINDING_AT",
  "SPEC_BLOOD_DEATH_KNIGHT.COOLDOWN_READINESS_AT",
  "SPEC_BLOOD_DEATH_KNIGHT.DOMAIN_RESULT",
  "SPEC_BLOOD_DEATH_KNIGHT.BUILD_RESOLUTION",
  "SPEC_BLOOD_DEATH_KNIGHT.NON_DOMAIN_ENTRIES",
  "SPEC_BLOOD_DEATH_KNIGHT.ANALYSIS_STATUS",
  "SPEC_BLOOD_DEATH_KNIGHT.SPEC_GATE",
  "APPLICATION_SERVICE.INTERNAL_REGISTRATION",
  "PUBLIC_CONTRACT.REST_MCP_PARITY",
];
