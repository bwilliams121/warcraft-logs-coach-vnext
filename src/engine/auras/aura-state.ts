/**
 * Derived aura state.
 *
 * The one rule this module exists to enforce:
 *
 *     no aura event  !=  aura inactive
 *
 * That distinction is load-bearing. A pre-pull buff produces no event inside the
 * fight, a failed page produces no event either, and an unverified capability
 * produces no event as well — and none of the three is evidence that an aura was
 * absent. So `presenceAt` can only ever answer from a TRANSITION it actually
 * observed, and returns UNKNOWN when it has none.
 *
 * THREE SEPARATE QUESTIONS, THREE SEPARATE ANSWERS
 *
 * - `lastObservedTransition` — "what transition did we see?" An observational
 *   fact. `EXACT null` is a real answer, but only once coverage earns it.
 * - `presenceAt` — "was it on the target then?" A DERIVED state. It never
 *   returns null and never reports INACTIVE from silence.
 * - `latestStackObservation` — "what stack number was last observed?" The
 *   number, verbatim, attached to its own observation. Never a stack count at
 *   the query position.
 *
 * SOURCE IS PART OF THE IDENTITY, NOT A FILTER
 *
 * Two rogues can both keep Rupture on the same boss. Those are two independent
 * auras in the game, and `aura-observations.ts` gives them two independent
 * tracks. So a `fromSource` question takes its ANCHOR from one track alone:
 * Rogue B refreshing or dropping their Rupture is a fact about Rogue B's aura,
 * and it can neither end nor obscure Rogue A's.
 *
 * A transition whose SOURCE was not supplied is a different matter, and the
 * asymmetry is the point:
 *
 *     known different source  ->  a different aura. Independent.
 *     unknown source          ->  MIGHT be this aura. Fail closed.
 *
 * An unowned `removedebuff` on the same target and ability could have been this
 * source's, so an earlier application cannot be carried confidently through it.
 *
 * The union question — "is this aura on the target from anyone?" — is weaker,
 * because the set of sources that might hold it is not observable. It is
 * therefore derived from the member tracks per query and can prove ACTIVE but
 * not INACTIVE. See `presenceFromGroup`.
 *
 * WHAT A REFRESH PROVES, AND WHAT IT DOES NOT
 *
 * `REFRESHED` proves the aura existed at that instant, so it is a perfectly good
 * known-active anchor. It supplies no duration, no expiry, no pandemic window
 * and no future removal time, and this module invents none. An aura here does
 * not expire — it stays ACTIVE until an observed transition says otherwise, or
 * until coverage runs out and the answer becomes UNKNOWN.
 *
 * WHAT A STACK REMOVAL PROVES
 *
 * `stack` is the absolute count REMAINING after its own event, so a stack
 * removal reporting a positive number proves the aura survived it. A
 * `removebuffstack` reading 2 is a known-ACTIVE anchor for the same reason an
 * application is: the aura is observed holding stacks.
 *
 * Only the positive direction follows. A resulting count of zero has no observed
 * form — full removal arrives as `removebuff` / `removedebuff` — so zero fails
 * closed rather than becoming INACTIVE.
 */

import type { EvidenceCategory } from "../../wcl/evidence-capability.js";
import { inclusiveRange } from "../evidence/coverage.js";
import type { EvidenceLocator } from "../evidence/locator.js";
import type { AuraClass, SourceRef, TargetRef } from "../normalization/normalized-events.js";
import { actorInstanceKey, gateContinuityClaim, type StateEnvironment } from "../state/state-environment.js";
import {
  exactDerived,
  exactObserved,
  gateAbsenceClaim,
  unknownState,
  type StateResult,
  type UnknownReason,
} from "../state/state-result.js";
import {
  isMonotonic,
  lastPositionAtOrBefore,
  type ResolvedPrefix,
  type TemporalPosition,
} from "../state/temporal.js";
import {
  auraGroupKey,
  auraObservationAt,
  auraSourceKey,
  buildAuraIndexes,
  type AuraGroup,
  type AuraIndexes,
  type AuraObservation,
  type AuraTrack,
} from "./aura-observations.js";

const AURAS: EvidenceCategory = "AURAS";
const NO_POSITIONS: readonly number[] = [];

/**
 * Which aura history a query addresses.
 *
 * `FROM_SOURCE` names ONE identity — one source's aura on one target — and is
 * the precise question a spec evaluator asks ("was MY Rupture up?").
 * `ANY_SOURCE` asks about the union of every source's identity on that target,
 * which is a genuinely weaker question and is answered differently below.
 *
 * An explicit union rather than a nullable `SourceRef`, because "any source" and
 * "the transitions that carried no source" are different questions and a `null`
 * would have had to mean both.
 */
export type AuraSourceFilter =
  { readonly kind: "ANY_SOURCE" } | { readonly kind: "FROM_SOURCE"; readonly source: SourceRef };

export function anySource(): AuraSourceFilter {
  return { kind: "ANY_SOURCE" };
}

export function fromSource(source: SourceRef): AuraSourceFilter {
  return { kind: "FROM_SOURCE", source };
}

/**
 * One aura identity, addressed for a query.
 *
 * `target` is M3's branded `TargetRef`. Passing a `SourceRef` here does not
 * compile, which is how the historical direction inversion — reading a debuff ON
 * a player as a debuff applied BY that player — stays impossible in the derived
 * layer and not only in normalization.
 */
export interface AuraIdentityQuery {
  readonly target: TargetRef;
  readonly abilityGameId: number;
  readonly auraClass: AuraClass;
  readonly source: AuraSourceFilter;
}

export interface AuraStateQuery extends AuraIdentityQuery {
  readonly at: TemporalPosition;
}

export type AuraPresence = "ACTIVE" | "INACTIVE";

export interface AuraPresenceState {
  readonly presence: AuraPresence;
  /** The observed transition the answer rests on. */
  readonly anchor: AuraObservation;
  /**
   * True when the anchor IS the observation asked about.
   *
   * Distinguishes "we saw this happen here" from "we saw this happen earlier and
   * proved nothing since contradicted it". Both are EXACT; only the second one
   * required coverage to earn.
   */
  readonly anchorIsQueryPosition: boolean;
}

export interface AuraStateView {
  readonly indexes: AuraIndexes;

  /** The group sharing a target, ability and aura class, or `null` when none was observed. */
  groupFor(identity: AuraIdentityQuery): AuraGroup | null;

  /**
   * One source's independent history for an identity.
   *
   * `null` for an `ANY_SOURCE` query — there is no single track to return — and
   * `null` when that source was never observed transitioning this aura.
   */
  trackFor(identity: AuraIdentityQuery): AuraTrack | null;

  /** The aura observation at a canonical position, or `null` if that position holds none. */
  observationAt(position: number): AuraObservation | null;

  /**
   * The last observed transition matching the query at or before a position.
   *
   * `EXACT` with a value  — an observation. Needs no coverage: it happened.
   * `EXACT` with `null`   — a PROVEN absence of any transition in the interval.
   * `UNKNOWN`             — we could not look properly.
   *
   * Note what `EXACT null` does and does not mean: no transition was OBSERVED.
   * It is emphatically not "the aura was inactive", which is why the presence
   * question is a different method.
   */
  lastObservedTransition(query: AuraStateQuery): StateResult<AuraObservation | null>;

  /**
   * Whether the aura was on the target at a position.
   *
   * Never returns a value for "we saw nothing". There is no `null` branch,
   * because the absence of a transition cannot establish either presence state.
   *
   * A `FROM_SOURCE` query anchors on that source's transitions alone. Another
   * KNOWN source's application, refresh or removal of the same ability on the
   * same target is a fact about a DIFFERENT aura and cannot change this answer.
   *
   * A transition whose SOURCE WAS NOT SUPPLIED is the exception, and it is not
   * another source — it is ambiguity. One sitting between the anchor and the
   * query might have belonged to the queried source, so the claim fails closed
   * with `UNSUPPORTED_DERIVATION` rather than carrying through it.
   *
   * An `ANY_SOURCE` query can prove ACTIVE — one source's aura being up means
   * the aura is up — but cannot prove INACTIVE, because the set of sources that
   * might hold it is not observable. See `presenceFromGroup`.
   *
   * Anchors that prove ACTIVE: an application, a refresh, and a stack removal
   * reporting a positive resulting count. Only a NON-stack removal proves
   * INACTIVE. A stack removal reporting zero proves neither.
   */
  presenceAt(query: AuraStateQuery): StateResult<AuraPresenceState>;

  /**
   * The most recent transition at or before a position that carried a `stack`
   * number.
   *
   * The value is the OBSERVATION, not a number, and deliberately so: the result
   * describes what was seen and when, and makes no claim about a stack count at
   * the query position.
   *
   * The observed number IS the absolute resulting count after its own
   * transition, and `presenceAt` uses a positive one as a known-ACTIVE anchor.
   * There is still no `stacksAt`, and the reason has simply moved. Answering
   * "how many stacks at an arbitrary instant" needs three more things this layer
   * does not have:
   *
   *     what count a plain `applybuff` establishes   — carries no `stack` field
   *     what a `refreshbuff` does to the count       — carries no `stack` field
   *     when stacks decay or expire unobserved       — no duration authority
   *
   * A stack count is therefore EXACT at a transition that reported one, and
   * UNKNOWN between transitions — the same shape as the resource surface, for
   * the same reason.
   */
  latestStackObservation(query: AuraStateQuery): StateResult<AuraObservation>;
}

export function createAuraState(environment: StateEnvironment): AuraStateView {
  const { fight } = environment;
  const indexes = buildAuraIndexes(fight);

  function groupFor(identity: AuraIdentityQuery): AuraGroup | null {
    return (
      indexes.groups.get(auraGroupKey(identity.target, identity.abilityGameId, identity.auraClass)) ?? null
    );
  }

  function trackFor(identity: AuraIdentityQuery): AuraTrack | null {
    if (identity.source.kind === "ANY_SOURCE") {
      return null;
    }
    const group = groupFor(identity);
    return group === null ? null : (group.tracksBySource.get(auraSourceKey(identity.source.source)) ?? null);
  }

  /**
   * The positions a query admits.
   *
   * `FROM_SOURCE` reads ONE track's own list. It is not a filter over a shared
   * list — the scan segmented the history by source, so there is nothing here to
   * filter and nothing another source could contaminate.
   */
  function candidatePositions(identity: AuraIdentityQuery): readonly number[] {
    if (identity.source.kind === "ANY_SOURCE") {
      return groupFor(identity)?.allPositions ?? NO_POSITIONS;
    }
    return trackFor(identity)?.positions ?? NO_POSITIONS;
  }

  function observationAt(position: number): AuraObservation | null {
    return auraObservationAt(fight, position);
  }

  /**
   * Whether an unidentifiable aura observation on this target sits inside
   * `(afterPosition, throughPosition]`.
   *
   * An aura event whose ability id was not supplied could have been a transition
   * for the queried identity. Ignoring it would be fail-open in exactly the way
   * this project exists to prevent, so its presence in the interval disqualifies
   * a carried-forward claim.
   */
  function unidentifiedObservationBetween(
    target: TargetRef,
    afterPosition: number,
    throughPosition: number,
  ): boolean {
    const positions =
      indexes.unidentifiedPositionsByTarget.get(actorInstanceKey(target.actorId, target.instanceId)) ??
      NO_POSITIONS;
    const last = lastPositionAtOrBefore(positions, throughPosition);
    return last !== null && last > afterPosition;
  }

  /**
   * Whether a transition of UNCERTAIN OWNERSHIP relative to `track` sits inside
   * `(afterPosition, throughPosition]`.
   *
   * This is the distinction the source-specific architecture has to get right,
   * and it is not symmetric with "another source":
   *
   *     known different source  ->  a different aura. Independent. Ignored.
   *     unknown source          ->  MIGHT be this aura. Ambiguity. Fail closed.
   *
   * So for a known-source track, the sourceless transitions are the hazard: a
   * `removedebuff` on the same target and ability whose source Warcraft Logs did
   * not supply could have been THIS source's removal, and carrying an earlier
   * application through it would report a confident ACTIVE built on missing
   * identity evidence.
   *
   * The mirror holds for the sourceless track itself. Its own transitions have no
   * known owner, so ANY known source's later transition on the same aura could
   * have been about them — and since the anchor is by construction that track's
   * last position in the prefix, every group position inside the interval belongs
   * to some other track. Hence the whole-group test in that branch.
   *
   * Deliberately blind to the operation. Reasoning separately about whether an
   * unidentified APPLY versus REMOVE could actually change this track's state
   * would recover a few more answers and is exactly the clever inference this
   * layer should not be doing on ambiguous identity.
   */
  function ambiguousOwnershipBetween(
    group: AuraGroup,
    track: AuraTrack,
    afterPosition: number,
    throughPosition: number,
  ): boolean {
    const positions =
      track.source === null ? group.allPositions : (group.sourcelessTrack?.positions ?? NO_POSITIONS);
    const last = lastPositionAtOrBefore(positions, throughPosition);
    return last !== null && last > afterPosition;
  }

  function lastObservedTransition(query: AuraStateQuery): StateResult<AuraObservation | null> {
    const resolution = environment.resolveTemporalPosition(query.at);
    if (!resolution.ok) {
      return unknownState(resolution.reason, [], AURAS);
    }
    const { lastIncludedPosition, boundaryReportTimeMs } = resolution.prefix;

    const found = lastPositionAtOrBefore(candidatePositions(query), lastIncludedPosition);

    if (found !== null) {
      const observation = observationAt(found);
      if (observation === null) {
        // Unreachable while the index is built from these same events. Reported
        // rather than asserted: a confident answer from an index that disagrees
        // with the fight would be worse than admitting confusion.
        return unknownState("UNSUPPORTED_DERIVATION", [], AURAS);
      }
      return exactObserved(observation, [observation.locator], AURAS);
    }

    // Nothing found. Saying so is an absence claim, and absence claims are
    // earned. Monotonicity is required for the same reason it is in
    // `lastObservedCast`: the prefix is a range of positions being read as a
    // time interval.
    if (!isMonotonic(environment.temporalIntegrity)) {
      return unknownState("NON_MONOTONIC_TIME", [], AURAS);
    }
    const gate = gateAbsenceClaim({
      completeness: fight.completeness,
      category: AURAS,
      range: inclusiveRange(fight.fight.startTimeMs, boundaryReportTimeMs),
      actorId: query.target.actorId,
    });
    if (!gate.ok) {
      return unknownState(gate.reason, [], AURAS);
    }
    return exactObserved(null, [], AURAS);
  }

  /**
   * One track's presence.
   *
   * `NO_ANCHOR` means this identity has no transition at or before the position.
   *
   * The ANCHOR is taken from this track's history alone: another KNOWN source's
   * transitions are facts about another aura and cannot make this one's state
   * either known or unknown. The CONTINUITY claim additionally consults
   * transitions whose ownership is uncertain, which is a different thing — see
   * `ambiguousOwnershipBetween`.
   */
  type TrackPresence =
    | {
        readonly kind: "KNOWN";
        /** The value, reachable without narrowing the result union. */
        readonly state: AuraPresenceState;
        readonly result: StateResult<AuraPresenceState>;
      }
    | {
        readonly kind: "UNKNOWN";
        readonly reason: UnknownReason;
        readonly locators: readonly EvidenceLocator[];
      }
    | { readonly kind: "NO_ANCHOR" };

  function presenceFromTrack(group: AuraGroup, track: AuraTrack, prefix: ResolvedPrefix): TrackPresence {
    const { lastIncludedPosition, boundaryReportTimeMs } = prefix;
    const anchorPosition = lastPositionAtOrBefore(track.positions, lastIncludedPosition);
    if (anchorPosition === null) {
      return { kind: "NO_ANCHOR" };
    }

    const anchor = observationAt(anchorPosition);
    if (anchor === null) {
      // Unreachable while the index is built from these same events.
      return { kind: "UNKNOWN", reason: "UNSUPPORTED_DERIVATION", locators: [] };
    }

    // What a stack REMOVAL proves, now that `stack` is the absolute resulting
    // count after its own event.
    //
    //     removebuffstack stack=2  ->  exactly two stacks REMAIN  ->  ACTIVE
    //     removebuffstack stack=1  ->  exactly one stack REMAINS   ->  ACTIVE
    //
    // That is an observation, not a gameplay inference: the event reports the
    // count the aura was left holding, and an aura holding stacks is on the
    // target. It is a positive anchor exactly like an application.
    //
    // A resulting count of ZERO is deliberately NOT read as INACTIVE. No capture
    // contains one — full removal comes through the ordinary `removebuff` /
    // `removedebuff` family instead — so "the stack removal that ends the aura"
    // has no established form. A synthetic or future zero therefore fails closed
    // rather than inventing a contract nothing has evidenced. Same for a missing
    // count, which M3 already rejects as a malformed family event.
    //
    // A stack APPLICATION needs no such test: adding a stack to an aura cannot
    // have removed it, whatever the number says.
    if (
      anchor.isStackChange &&
      anchor.operation === "REMOVED" &&
      !(anchor.observedStacks !== null && anchor.observedStacks > 0)
    ) {
      return { kind: "UNKNOWN", reason: "UNSUPPORTED_DERIVATION", locators: [anchor.locator] };
    }
    const presence: AuraPresence =
      anchor.operation === "REMOVED" && !anchor.isStackChange ? "INACTIVE" : "ACTIVE";

    // The anchor IS the observation asked about: nothing lies between them, so
    // there is no absence to prove and no coverage to require. This is M4-A's
    // positive-observation asymmetry — we saw it happen, here.
    if (anchorPosition === lastIncludedPosition && anchor.reportTimeMs === boundaryReportTimeMs) {
      const state: AuraPresenceState = { presence, anchor, anchorIsQueryPosition: true };
      return { kind: "KNOWN", state, result: exactObserved(state, [anchor.locator], AURAS) };
    }

    // Carrying the anchor forward asserts that nothing in THIS track
    // contradicted it in between, which needs complete coverage of the interval.
    const gate = gateContinuityClaim(environment, {
      category: AURAS,
      fromReportTimeMs: anchor.reportTimeMs,
      toReportTimeMs: boundaryReportTimeMs,
      actorId: track.target.actorId,
    });
    if (!gate.ok) {
      return { kind: "UNKNOWN", reason: gate.reason, locators: [anchor.locator] };
    }

    // An aura observation we could not identify at all could have been this
    // aura's next transition.
    if (unidentifiedObservationBetween(track.target, anchorPosition, lastIncludedPosition)) {
      return { kind: "UNKNOWN", reason: "UNSUPPORTED_DERIVATION", locators: [anchor.locator] };
    }

    // A matching transition on this exact aura whose SOURCE was not supplied
    // could have been this source's. It is ambiguity, not another independent
    // source, so the anchor cannot be carried confidently through it.
    if (ambiguousOwnershipBetween(group, track, anchorPosition, lastIncludedPosition)) {
      return { kind: "UNKNOWN", reason: "UNSUPPORTED_DERIVATION", locators: [anchor.locator] };
    }

    const state: AuraPresenceState = { presence, anchor, anchorIsQueryPosition: false };
    return { kind: "KNOWN", state, result: exactDerived(state, [anchor.locator], AURAS) };
  }

  /**
   * The reason to report when no track supplied an anchor.
   *
   * If we could not have seen a transition, say that. If we provably could have
   * and did not, the aura's pre-observation state is simply not establishable —
   * a pre-pull application leaves no event inside the fight.
   */
  function noAnchorReason(target: TargetRef, boundaryReportTimeMs: number): UnknownReason {
    const gate = gateContinuityClaim(environment, {
      category: AURAS,
      fromReportTimeMs: fight.fight.startTimeMs,
      toReportTimeMs: boundaryReportTimeMs,
      actorId: target.actorId,
    });
    return gate.ok ? "AMBIGUOUS_INITIAL_STATE" : gate.reason;
  }

  /**
   * Any-source presence, derived from the member tracks each time.
   *
   * The union is answerable in ONE direction only.
   *
   * ACTIVE is directly provable: if any source's aura is up, the aura is on the
   * target. That holds however many other tracks exist and whatever they say, so
   * a single ACTIVE track settles it.
   *
   * INACTIVE is NOT provable. Every observed source having last removed it does
   * not establish that no source holds it, because the set of sources that could
   * have applied it is not observable — a source with a pre-pull application and
   * no transition inside the retrieved window leaves no track at all. That is
   * the same irreducible pre-observation ambiguity a zero-track query reports,
   * applied to the union, so the answer is `AMBIGUOUS_INITIAL_STATE` rather than
   * an aggregate state machine that assumes the members cannot overlap.
   *
   * Spec evaluators that need a decidable answer should ask `fromSource`, which
   * names one identity and can prove both directions.
   *
   * The sourceless track is an ordinary member here. Its own APPLIED or
   * REFRESHED observation does prove that SOME source has the aura up, which is
   * exactly what the union asks — and no attribution is attempted from it. Its
   * continuity is constrained in the mirror of the known-source case, so an
   * unowned application cannot be carried through a known source's later removal
   * that may have been about it.
   */
  function presenceFromGroup(
    group: AuraGroup,
    target: TargetRef,
    prefix: ResolvedPrefix,
  ): StateResult<AuraPresenceState> {
    let active: StateResult<AuraPresenceState> | null = null;
    let activeAnchorPosition = -1;
    let blocked: { reason: UnknownReason; locators: readonly EvidenceLocator[] } | null = null;
    let anchoredTracks = 0;

    for (const track of group.tracks) {
      const outcome = presenceFromTrack(group, track, prefix);
      if (outcome.kind === "NO_ANCHOR") {
        continue;
      }
      anchoredTracks += 1;
      if (outcome.kind === "UNKNOWN") {
        blocked ??= { reason: outcome.reason, locators: outcome.locators };
        continue;
      }
      // Keep the latest-anchored ACTIVE track, so the provenance points at the
      // most recent observation that proves the aura is up.
      if (outcome.state.presence === "ACTIVE" && outcome.state.anchor.position > activeAnchorPosition) {
        activeAnchorPosition = outcome.state.anchor.position;
        active = outcome.result;
      }
    }

    if (active !== null) {
      return active;
    }
    if (blocked !== null) {
      return unknownState(blocked.reason, blocked.locators, AURAS);
    }
    if (anchoredTracks === 0) {
      return unknownState(noAnchorReason(target, prefix.boundaryReportTimeMs), [], AURAS);
    }
    // Every anchored track resolved INACTIVE. See the note above: that does not
    // establish that the aura was absent.
    return unknownState("AMBIGUOUS_INITIAL_STATE", [], AURAS);
  }

  function presenceAt(query: AuraStateQuery): StateResult<AuraPresenceState> {
    const resolution = environment.resolveTemporalPosition(query.at);
    if (!resolution.ok) {
      return unknownState(resolution.reason, [], AURAS);
    }

    if (query.source.kind === "ANY_SOURCE") {
      const group = groupFor(query);
      if (group === null) {
        return unknownState(noAnchorReason(query.target, resolution.prefix.boundaryReportTimeMs), [], AURAS);
      }
      return presenceFromGroup(group, query.target, resolution.prefix);
    }

    const group = groupFor(query);
    const track = trackFor(query);
    if (group === null || track === null) {
      return unknownState(noAnchorReason(query.target, resolution.prefix.boundaryReportTimeMs), [], AURAS);
    }

    const outcome = presenceFromTrack(group, track, resolution.prefix);
    if (outcome.kind === "KNOWN") {
      return outcome.result;
    }
    if (outcome.kind === "UNKNOWN") {
      return unknownState(outcome.reason, outcome.locators, AURAS);
    }
    return unknownState(noAnchorReason(query.target, resolution.prefix.boundaryReportTimeMs), [], AURAS);
  }

  function latestStackObservation(query: AuraStateQuery): StateResult<AuraObservation> {
    const resolution = environment.resolveTemporalPosition(query.at);
    if (!resolution.ok) {
      return unknownState(resolution.reason, [], AURAS);
    }
    const { lastIncludedPosition, boundaryReportTimeMs } = resolution.prefix;

    // A source-specific query reads that track's own stack list; an any-source
    // query reads the group roll-up. Either way the list is ascending, so the
    // last entry at or before the position is the answer.
    const stackPositions =
      query.source.kind === "ANY_SOURCE"
        ? (groupFor(query)?.stackObservationPositions ?? NO_POSITIONS)
        : (trackFor(query)?.stackObservationPositions ?? NO_POSITIONS);

    const found = lastPositionAtOrBefore(stackPositions, lastIncludedPosition);
    if (found !== null) {
      const observation = observationAt(found);
      if (observation === null) {
        return unknownState("UNSUPPORTED_DERIVATION", [], AURAS);
      }
      return exactObserved(observation, [observation.locator], AURAS);
    }

    // No stack number was observed. That is an absence claim about the interval,
    // so it needs coverage — and once earned, the reason is NO_OBSERVATION and
    // not AMBIGUOUS_INITIAL_STATE: the question asked for an observation, and
    // there provably is none. No state was claimed, so no initial state is at
    // issue.
    const gate = gateContinuityClaim(environment, {
      category: AURAS,
      fromReportTimeMs: fight.fight.startTimeMs,
      toReportTimeMs: boundaryReportTimeMs,
      actorId: query.target.actorId,
    });
    return unknownState(gate.ok ? "NO_OBSERVATION" : gate.reason, [], AURAS);
  }

  return {
    indexes,
    groupFor,
    trackFor,
    observationAt,
    lastObservedTransition,
    presenceAt,
    latestStackObservation,
  };
}
