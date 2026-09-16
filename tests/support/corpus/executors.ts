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
import type { LoadedAssertion, LoadedCase, LoadedCorpus } from "./loader.js";
import * as applicationService from "./executors/application-service.js";
import * as combatState from "./executors/combat-state.js";
import * as normalization from "./executors/normalization.js";
import type { AssertionOutcome } from "./executors/outcome.js";
import type { ParamsOf } from "./executors/params.js";
import * as publicContract from "./executors/public-contract.js";
import * as spec from "./executors/spec-assassination.js";
import * as transport from "./executors/wcl-transport.js";

export type { AssertionOutcome } from "./executors/outcome.js";

/**
 * Runs one assertion. Payload-kind compatibility and parameter validity were
 * established by the loader, so a mismatch here is a programming error and
 * throws rather than failing softly.
 */
export async function executeAssertion(
  corpus: LoadedCorpus,
  kase: LoadedCase,
  assertion: LoadedAssertion,
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
  "PUBLIC_CONTRACT.REST_MCP_PARITY",
];
