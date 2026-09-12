/**
 * The resource-observation query surface.
 *
 * Three answers exist here and no fourth:
 *
 *     EXACT   — the observation itself, at the instant it was observed
 *     STALE   — a real earlier observation, with its age disclosed
 *     UNKNOWN — we cannot say
 *
 * What is NOT here is the whole point. There is no passive regeneration for
 * Energy, Focus, Mana or anything else; no spec-specific regeneration model; no
 * interpolated intermediate value; no bounded interval. The failure this
 * prevents:
 *
 *     observed Energy = 43 at O
 *     query 800 ms later
 *
 *     this layer  -> STALE 43, observedAt O, asOf query
 *     NOT         -> EXACT 51, because ~10 Energy/s was assumed
 *
 * M4 reports the AGE of an observation. It does not decide whether that age is
 * acceptable, because acceptability depends on the resource, the spec and the
 * decision — none of which is knowable here. There is therefore deliberately no
 * staleness threshold in this module.
 *
 * NO DELTA REPLAY. THIS IS PERMANENT.
 *
 * An observation is authoritative for ITS OWN observational point and for
 * nothing else. Between two observations the amount is UNKNOWN, and it stays
 * UNKNOWN even though every ingredient for a plausible reconstruction is sitting
 * right here: an exact anchor, observed `resourceChange` deltas, observed
 * `cost`s and a `max`.
 *
 * This is not a gap waiting to be filled. Live captures were measured against
 * exactly that reconstruction and it does not reconcile — snapshots appear whose
 * value disagrees with the anchor plus the intervening observed deltas. Two
 * explanations survive the evidence, and neither can be ruled out: not every
 * resource change emits an event, and same-timestamp retrieval order is not
 * guaranteed to be causal order. Either one is fatal to replay.
 *
 * So none of the following exists, and none may be added:
 *
 *     amount at an arbitrary instant     delta replay from an anchor
 *     passive regeneration               synthesized missing changes
 *     interpolation between observations a running current-resource ledger
 *
 * Knowing that a costed cast's amount is PRE_COST does not soften this. It makes
 * one more INSTANT exactly knowable; it makes nothing BETWEEN instants knowable.
 *
 * OBSERVATIONAL QUERIES ARE NOT CONTINUITY CLAIMS
 *
 * `latestObservedAtOrBefore` answers a question about OUR EVIDENCE:
 *
 *     "the latest matching observation present in our evidence is 43, made at
 *      10.000s, and you asked about 12.000s"
 *
 * That sentence is true whatever happened between the two instants, so it needs
 * no coverage. What it deliberately does NOT say is "Energy was 43 at 12.000s" —
 * and STALE rather than EXACT is precisely how it declines to say it.
 *
 * The stronger claim — "no later observation or change existed between the
 * anchor and the query" — is a continuity/absence claim and DOES require
 * coverage. It is not offered here, and must not be smuggled into this query by
 * a caller reading STALE as current state.
 */

import type { EvidenceCategory } from "../../wcl/evidence-capability.js";
import { exactObserved, staleObservation, unknownState, type StateResult } from "../state/state-result.js";
import { gateContinuityClaim, type StateEnvironment } from "../state/state-environment.js";
import { lastPositionAtOrBefore, type TemporalPosition } from "../state/temporal.js";
import {
  buildResourceIndexes,
  healthObservationAt,
  resourceObservationAt,
  standaloneChangeAt,
  type HealthAmountObservation,
  type ResourceAmountObservation,
  type ResourceIndexes,
  type StandaloneResourceChangeObservation,
} from "./resource-observations.js";

const RESOURCES: EvidenceCategory = "RESOURCES";
const NO_POSITIONS: readonly number[] = [];

export interface ResourceObservationQuery {
  /** The actor the SNAPSHOT must describe, not merely the event's source. */
  readonly actorId: number;
  readonly resourceType: number;
  readonly at: TemporalPosition;
}

export interface ResourceStateView {
  readonly indexes: ResourceIndexes;

  /** Ascending canonical positions of snapshots describing this actor and resource. */
  snapshotPositionsFor(actorId: number, resourceType: number): readonly number[];
  /** Ascending canonical positions of standalone changes sourced by this actor. */
  standaloneChangePositionsFor(actorId: number, resourceType: number): readonly number[];

  /**
   * The exact resource observation carried ON the event at a position.
   *
   * Named for what it is: an observation carried on this event. WHEN it was
   * sampled travels with the value, as `timing`, rather than in the accessor's
   * name — `PRE_COST` on a completed cast with a positive cost, and
   * `EVENT_ASSOCIATED` everywhere else, including `resourcechange`.
   *
   * PRE_COST is the amount before that cost. It is NOT an invitation to compute
   * the amount after: see the delta-replay prohibition in this module's header.
   *
   * Needs no coverage: the event is in hand. `NO_OBSERVATION` when that event
   * carries no snapshot for this actor and resource.
   */
  observationOnEvent(
    position: number,
    actorId: number,
    resourceType: number,
  ): StateResult<ResourceAmountObservation>;

  /**
   * The latest matching observation PRESENT IN OUR EVIDENCE at or before a
   * temporal position.
   *
   * `EXACT` when the observation IS the instant asked about. `STALE` when it is
   * earlier, carrying `observedAtReportTimeMs` and `asOfReportTimeMs` so the
   * caller can see exactly what gap it is being asked to tolerate.
   *
   * Purely OBSERVATIONAL, and therefore ungated. An incomplete stretch between
   * the observation and the query does not un-observe the observation, and an
   * UNVERIFIED capability does not erase evidence already in hand — it only
   * means we cannot claim nothing newer existed, which this result never claims.
   *
   * The name carries "observed" for that reason: the value is a report about our
   * evidence, never the resource's state at the query position.
   */
  latestObservedAtOrBefore(query: ResourceObservationQuery): StateResult<ResourceAmountObservation>;

  /**
   * The health fields of the snapshot on the event at a position.
   *
   * Deliberately on-event only. There is no `latestHealthAtOrBefore`: carrying
   * a health number forward invites reading it as current, and this layer models
   * no health continuity, no unchanged-between-observations inference, and no
   * death state.
   */
  healthObservationOnEvent(position: number, actorId: number): StateResult<HealthAmountObservation>;
  healthPositionsFor(actorId: number): readonly number[];

  /**
   * The standalone `resourcechange` observation at a position.
   *
   * Structurally separate from attached snapshots, and never combined with one.
   * Its `resourceChange` delta is reported as observed and is never replayed
   * onto a snapshot amount to produce a later exact value.
   */
  standaloneChangeOnEvent(position: number): StateResult<StandaloneResourceChangeObservation>;
}

export function createResourceState(environment: StateEnvironment): ResourceStateView {
  const { fight } = environment;
  const indexes = buildResourceIndexes(fight);

  function snapshotPositionsFor(actorId: number, resourceType: number): readonly number[] {
    return indexes.snapshotPositionsByActor.get(actorId)?.get(resourceType) ?? NO_POSITIONS;
  }

  function standaloneChangePositionsFor(actorId: number, resourceType: number): readonly number[] {
    return indexes.standaloneChangePositionsBySource.get(actorId)?.get(resourceType) ?? NO_POSITIONS;
  }

  function observationOnEvent(
    position: number,
    actorId: number,
    resourceType: number,
  ): StateResult<ResourceAmountObservation> {
    if (environment.eventAt(position) === null) {
      return unknownState("UNSUPPORTED_DERIVATION", [], RESOURCES);
    }
    const observation = resourceObservationAt(fight, position, actorId, resourceType);
    if (observation === null) {
      // We hold the event and it carries no such snapshot. That is an observed
      // fact about this one event, stronger than any coverage claim — and it is
      // still not a resource VALUE, so it stays UNKNOWN.
      return unknownState("NO_OBSERVATION", [], RESOURCES);
    }
    return exactObserved(observation, [observation.locator], RESOURCES);
  }

  function latestObservedAtOrBefore(query: ResourceObservationQuery): StateResult<ResourceAmountObservation> {
    const resolution = environment.resolveTemporalPosition(query.at);
    if (!resolution.ok) {
      return unknownState(resolution.reason, [], RESOURCES);
    }
    const { lastIncludedPosition, boundaryReportTimeMs } = resolution.prefix;

    const candidates = snapshotPositionsFor(query.actorId, query.resourceType);
    const found = lastPositionAtOrBefore(candidates, lastIncludedPosition);

    if (found === null) {
      // Nothing found. "Our evidence contains no matching observation" is the
      // one branch here that IS an absence claim, so it is gated: with complete
      // coverage it is NO_OBSERVATION — we looked and there is none — and
      // otherwise the gate's reason, which is more useful than pretending we
      // looked.
      const gate = gateContinuityClaim(environment, {
        category: RESOURCES,
        fromReportTimeMs: fight.fight.startTimeMs,
        toReportTimeMs: boundaryReportTimeMs,
        actorId: query.actorId,
      });
      return unknownState(gate.ok ? "NO_OBSERVATION" : gate.reason, [], RESOURCES);
    }

    const observation = resourceObservationAt(fight, found, query.actorId, query.resourceType);
    if (observation === null) {
      // Unreachable while the index is built from these same events.
      return unknownState("UNSUPPORTED_DERIVATION", [], RESOURCES);
    }

    // The observation IS the instant asked about: nothing lies between, so it is
    // exact. This is the positive-observation asymmetry.
    if (found === lastIncludedPosition && observation.reportTimeMs === boundaryReportTimeMs) {
      return exactObserved(observation, [observation.locator], RESOURCES);
    }

    // STALE asserts that the observation PRECEDES the query instant. That is the
    // only ordering claim this result makes, and it is checked directly on the
    // two timestamps rather than by requiring global monotonicity — a disordered
    // fight does not un-observe a value, it only makes some orderings
    // unstatable.
    if (observation.reportTimeMs > boundaryReportTimeMs) {
      return unknownState("NON_MONOTONIC_TIME", [observation.locator], RESOURCES);
    }

    // Deliberately ungated. The claim is about our evidence — "this is the
    // latest matching observation we hold, made then" — which an uncovered
    // stretch cannot falsify. The stronger claim that nothing newer existed is
    // a continuity question, and this query does not answer it.
    return staleObservation(
      observation,
      observation.reportTimeMs,
      boundaryReportTimeMs,
      [observation.locator],
      RESOURCES,
    );
  }

  function healthObservationOnEvent(position: number, actorId: number): StateResult<HealthAmountObservation> {
    if (environment.eventAt(position) === null) {
      return unknownState("UNSUPPORTED_DERIVATION", [], RESOURCES);
    }
    const observation = healthObservationAt(fight, position, actorId);
    if (observation === null) {
      return unknownState("NO_OBSERVATION", [], RESOURCES);
    }
    return exactObserved(observation, [observation.locator], RESOURCES);
  }

  function standaloneChangeOnEvent(position: number): StateResult<StandaloneResourceChangeObservation> {
    if (environment.eventAt(position) === null) {
      return unknownState("UNSUPPORTED_DERIVATION", [], RESOURCES);
    }
    const observation = standaloneChangeAt(fight, position);
    if (observation === null) {
      return unknownState("NO_OBSERVATION", [], RESOURCES);
    }
    return exactObserved(observation, [observation.locator], RESOURCES);
  }

  return {
    indexes,
    snapshotPositionsFor,
    standaloneChangePositionsFor,
    observationOnEvent,
    latestObservedAtOrBefore,
    healthObservationOnEvent,
    healthPositionsFor: (actorId) => indexes.healthPositionsByActor.get(actorId) ?? NO_POSITIONS,
    standaloneChangeOnEvent,
  };
}
