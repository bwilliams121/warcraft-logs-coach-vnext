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
 * Knowing that a `resourcechange` attachment is POST_CHANGE (M11-B5) does not
 * soften it either: it makes THAT instant exactly knowable, from a number that
 * was read, and the delta beside it is still never added to anything.
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
 * coverage. It is not offered by that query, and must not be smuggled into it
 * by a caller reading STALE as current state.
 *
 * CONTINUITY IS OFFERED IN EXACTLY ONE PLACE (M11-B5)
 *
 * `resourceHistoryAt` is the only query here that claims anything about the
 * interval between an observation and the query position, and it claims only
 * this: the observation is the latest one present, and the interval from it to
 * the position is COMPLETE for RESOURCES for that actor — so every resource
 * observation the log would have carried in between is in the list it returns.
 * It hands back the observations, in order, EACH WITH ITS OWN OBSERVED AMOUNT
 * and timing tag. It does not derive an amount at the position, does not add a
 * delta, and does not say what any of the entries mean; a specialization that
 * knows which entries are gains, which are spends and which are ambiguous reads
 * the list under its own pinned semantics. A sequence of exact observed states
 * under proven coverage is not a ledger, and the moment a caller adds two of
 * these numbers together it has left what this layer establishes.
 */

import type { EvidenceCategory } from "../../wcl/evidence-capability.js";
import {
  exactDerived,
  exactObserved,
  staleObservation,
  unknownState,
  type StateResult,
} from "../state/state-result.js";
import { gateContinuityClaim, type StateEnvironment } from "../state/state-environment.js";
import { lastPositionAtOrBefore, type TemporalPosition } from "../state/temporal.js";
import {
  buildResourceIndexes,
  healthObservationAt,
  ownershipCouldBe,
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
  /**
   * Ascending canonical positions of standalone changes to THIS ACTOR'S POOL
   * of this resource — not the changes the actor caused (M11-D2-A3). A change
   * whose owner the event does not establish is in no actor's list.
   */
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

  /**
   * The latest attached observation of one actor's resource at or before a
   * position, with every observation of that actor's resource since it, under
   * a continuity claim FROM THE ANCHOR (M11-B5).
   *
   * The anchor is whichever attached observation is latest — PRE_COST,
   * POST_CHANGE or EVENT_ASSOCIATED; its timing tag travels with it and the
   * caller decides what the anchor's amount is good for. `since` holds every
   * later observation up to the position in canonical order: an attached
   * snapshot (with its timing), a standalone change (with its delta and, when
   * the same event carries the changed type's snapshot, that POST_CHANGE
   * observation beside it), or both on one event. The delta is carried for
   * classification and corroboration; nothing here adds it to anything.
   *
   * CONTINUITY IS EARNED FROM THE ANCHOR: `[anchor.reportTimeMs, boundary]`
   * must be COMPLETE for RESOURCES for the actor. A specialization that also
   * needs to know no COSTED CAST was missed in the interval gates CASTS
   * itself — a spend is a cast, not a resource event, and this layer does not
   * compose the two categories.
   *
   * No anchor in the prefix is UNKNOWN: `NO_OBSERVATION` when coverage from
   * the fight start proves the log carried none, otherwise the coverage
   * reason.
   *
   * A standalone change counts as this actor's only when the change is to
   * this actor's POOL (M11-D2-A3). A change of this resource after the anchor
   * whose pool the event does not establish, and which could be this actor's,
   * makes the history UNSUPPORTED_DERIVATION — exactly as an unattributed
   * snapshot does — rather than being dropped from it.
   */
  resourceHistoryAt(query: ResourceObservationQuery): StateResult<ResourceHistory>;

  /**
   * The resource observations of one actor's resource that sit AHEAD of a
   * position in canonical order and no more than `windowMs` before its report
   * time (M11-B5). INCLUSIVE at both edges, exactly as the aura primitive.
   * Evidence for a caller's ordering policy; the window is the caller's.
   */
  observationsWithinBefore(
    actorId: number,
    resourceType: number,
    position: number,
    windowMs: number,
  ): readonly ResourcePrecedingObservation[];
}

/** One observation in a resource history (M11-B5). */
export interface ResourceHistoryEntry {
  readonly position: number;
  /** The attached snapshot of the queried resource on this event, if it carries one. */
  readonly snapshot: ResourceAmountObservation | null;
  /** The standalone change of the queried resource on this event, if it is one. */
  readonly change: StandaloneResourceChangeObservation | null;
  /**
   * The SIGN of the standalone change, or null when the event is not one.
   *
   * Offered so a consumer can classify a change as a gain or a loss without
   * ever reading the delta's magnitude — the one thing about a delta that
   * invites arithmetic. A gain of zero is NON_NEGATIVE: it lowers nothing.
   */
  readonly changeSign: "NON_NEGATIVE" | "NEGATIVE" | null;
}

/** What `resourceHistoryAt` found (M11-B5). */
export interface ResourceHistory {
  readonly anchor: ResourceAmountObservation;
  /** Every observation of the actor's resource after the anchor, up to the position, in canonical order. */
  readonly since: readonly ResourceHistoryEntry[];
}

/** One observation ahead of a position inside a caller's window (M11-B5). */
export interface ResourcePrecedingObservation {
  readonly entry: ResourceHistoryEntry;
  /** `position.reportTimeMs - entry report time`, milliseconds; 0 for the same millisecond. */
  readonly leadMs: number;
  readonly reportTimeMs: number;
}

export function createResourceState(environment: StateEnvironment): ResourceStateView {
  const { fight } = environment;
  const indexes = buildResourceIndexes(fight);

  function snapshotPositionsFor(actorId: number, resourceType: number): readonly number[] {
    return indexes.snapshotPositionsByActor.get(actorId)?.get(resourceType) ?? NO_POSITIONS;
  }

  function standaloneChangePositionsFor(actorId: number, resourceType: number): readonly number[] {
    return indexes.standaloneChangePositionsByOwner.get(actorId)?.get(resourceType) ?? NO_POSITIONS;
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

  /**
   * The ascending positions at which this actor's resource is observed at all
   * — an attached snapshot, a standalone change, or both on one event.
   */
  function observationPositionsFor(actorId: number, resourceType: number): readonly number[] {
    const merged = new Set<number>([
      ...snapshotPositionsFor(actorId, resourceType),
      ...standaloneChangePositionsFor(actorId, resourceType),
    ]);
    return [...merged].sort((a, b) => a - b);
  }

  function entryAt(position: number, actorId: number, resourceType: number): ResourceHistoryEntry | null {
    const snapshot = resourceObservationAt(fight, position, actorId, resourceType);
    const change = standaloneChangeAt(fight, position);
    // The change to this actor's POOL, never merely one this actor caused.
    const ownChange =
      change !== null &&
      change.resourceType === resourceType &&
      change.ownership.state === "RESOLVED" &&
      change.ownership.owner.actorId === actorId
        ? change
        : null;
    if (snapshot === null && ownChange === null) return null;
    const changeSign =
      ownChange === null
        ? null
        : ownChange.resourceChange < 0
          ? ("NEGATIVE" as const)
          : ("NON_NEGATIVE" as const);
    return { position, snapshot, change: ownChange, changeSign };
  }

  function resourceHistoryAt(query: ResourceObservationQuery): StateResult<ResourceHistory> {
    const resolution = environment.resolveTemporalPosition(query.at);
    if (!resolution.ok) {
      return unknownState(resolution.reason, [], RESOURCES);
    }
    const { lastIncludedPosition, boundaryReportTimeMs } = resolution.prefix;

    const anchorPosition = lastPositionAtOrBefore(
      snapshotPositionsFor(query.actorId, query.resourceType),
      lastIncludedPosition,
    );
    if (anchorPosition === null) {
      const gate = gateContinuityClaim(environment, {
        category: RESOURCES,
        fromReportTimeMs: fight.fight.startTimeMs,
        toReportTimeMs: boundaryReportTimeMs,
        actorId: query.actorId,
      });
      return unknownState(gate.ok ? "NO_OBSERVATION" : gate.reason, [], RESOURCES);
    }
    const anchor = resourceObservationAt(fight, anchorPosition, query.actorId, query.resourceType);
    if (anchor === null) {
      return unknownState("UNSUPPORTED_DERIVATION", [], RESOURCES);
    }
    // Continuity from the ANCHOR. The gate also refuses non-monotonic time and
    // an inverted interval.
    const gate = gateContinuityClaim(environment, {
      category: RESOURCES,
      fromReportTimeMs: anchor.reportTimeMs,
      toReportTimeMs: boundaryReportTimeMs,
      actorId: query.actorId,
    });
    if (!gate.ok) {
      return unknownState(gate.reason, [anchor.locator], RESOURCES);
    }
    // An unattributed snapshot in the interval could have been this actor's.
    const unattributed = lastPositionAtOrBefore(indexes.unattributedSnapshotPositions, lastIncludedPosition);
    if (unattributed !== null && unattributed > anchorPosition) {
      return unknownState("UNSUPPORTED_DERIVATION", [anchor.locator], RESOURCES);
    }
    // So could a change of this resource whose pool the event does not
    // establish (M11-D2-A3): the history cannot claim to hold every change to
    // this actor's pool while one might be missing from it.
    for (const position of indexes.unresolvedOwnershipChangePositions) {
      if (position <= anchorPosition) continue;
      if (position > lastIncludedPosition) break;
      const change = standaloneChangeAt(fight, position);
      if (
        change !== null &&
        change.resourceType === query.resourceType &&
        ownershipCouldBe(change.ownership, query.actorId)
      ) {
        return unknownState("UNSUPPORTED_DERIVATION", [anchor.locator, change.locator], RESOURCES);
      }
    }

    const since: ResourceHistoryEntry[] = [];
    for (const position of observationPositionsFor(query.actorId, query.resourceType)) {
      if (position <= anchorPosition) continue;
      if (position > lastIncludedPosition) break;
      const entry = entryAt(position, query.actorId, query.resourceType);
      if (entry === null) {
        return unknownState("UNSUPPORTED_DERIVATION", [anchor.locator], RESOURCES);
      }
      since.push(entry);
    }
    const locators = [
      anchor.locator,
      ...since
        .map((entry) => entry.snapshot?.locator ?? entry.change?.locator)
        .filter((l) => l !== undefined),
    ];
    return exactDerived({ anchor, since }, locators, RESOURCES);
  }

  function observationsWithinBefore(
    actorId: number,
    resourceType: number,
    position: number,
    windowMs: number,
  ): readonly ResourcePrecedingObservation[] {
    const event = environment.eventAt(position);
    if (event === null) return [];
    const found: ResourcePrecedingObservation[] = [];
    for (const candidate of observationPositionsFor(actorId, resourceType)) {
      if (candidate >= position) break;
      const entry = entryAt(candidate, actorId, resourceType);
      if (entry === null) continue;
      const reportTimeMs = entry.snapshot?.reportTimeMs ?? entry.change?.reportTimeMs;
      if (reportTimeMs === undefined) continue;
      const leadMs = event.reportTimeMs - reportTimeMs;
      if (leadMs < 0 || leadMs > windowMs) continue;
      found.push({ entry, leadMs, reportTimeMs });
    }
    return found;
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
    resourceHistoryAt,
    observationsWithinBefore,
  };
}
