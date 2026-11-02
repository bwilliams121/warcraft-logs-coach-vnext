/**
 * SUPPORT AURA WINDOWS (M13-A): when one supporter's buff was observed on
 * each recipient, and who that recipient was.
 *
 * The first shared support primitive (agent/architecture.md "Augmentation
 * Architecture"). `src/support/` reconstructs FACTS about buffs one actor
 * places on others. It never decides whether a recipient was a good choice,
 * whether a window was well timed, or what the supporter should have done: a
 * specialization evaluator does that under its own authority, and for
 * recipient quality no authority exists (SUPPORT_TARGETING is
 * NO_AUTHORITY_AVAILABLE).
 *
 * The caller names the supporter and the aura ability ids. This module knows
 * no spell: which ids are Ebon Might or Prescience is the specialization's
 * runtime data.
 *
 * WHAT A WINDOW IS
 *
 * The observed aura transitions of ONE (recipient instance, ability) track,
 * sourced by the supporter, read in retrieval order:
 *
 *   applied          opens a window with an OBSERVED start
 *   refreshed/stack  proves the aura active at that instant; opens a window
 *                    with an UNOBSERVED start when none is open
 *   removed          closes the open window with an OBSERVED end, or forms a
 *                    window with an UNOBSERVED start
 *   applied again    while a window is open: the open window's end is
 *                    UNOBSERVED (no removal was seen), and a new one opens
 *
 * A window still open after the last event ends UNOBSERVED. Nothing is
 * extended to a nominal duration or to the fight end: a missing removal is
 * never an expiry time.
 *
 * OBSERVED SPAN IS NOT ACTIVE SPAN
 *
 * `observedSpan` is the stretch between the window's earliest and latest
 * OBSERVED transition. The aura is proven active only AT those instants.
 * Between them it is proven continuously active only when continuity is
 * ESTABLISHED: the engine's continuity gate (`gateContinuityClaim`) holds —
 * retrieval order is a timeline (monotonic time) and the supporter's AURAS
 * coverage over the whole observed span is COMPLETE, so no transition of this
 * track can be missing — no transition inside it is a stack removal that does
 * not prove the aura survived (a resulting count of zero, or none stated:
 * `src/engine/auras/aura-state.ts` fails those closed too), and no
 * same-ability transition with an unstated source lies inside it (so none can
 * have been this track's removal). Only then is `activeSpan` set, and only
 * an active span may be read as "the buff was on this recipient throughout"
 * by any consumer (support time, concurrency, cooldown overlap).
 *
 * WHAT IT NEVER SAYS
 *
 * - No "the buff was down". An empty or short list is complete only when the
 *   supporter's AURAS coverage over the asked range is COMPLETE (the shared
 *   absence gate). Otherwise `listing` is OBSERVED_ONLY with the reason.
 * - No recipient owner by inference. A pet's owner is WCL `petOwner` only; a
 *   pet without one is OWNER_NOT_STATED, never guessed.
 * - No other source's aura, and no guess about an ambiguous one. A buff
 *   transition that MIGHT be one of this supporter's tracks but cannot be
 *   attributed — the asked ability with no stated source, the supporter's (or
 *   an unstated source's) buff with no ability id, or the supporter's asked
 *   ability with no stated target, or with no stated recipient instance
 *   while that actor's instances are elsewhere told apart — is listed as
 *   ambiguous. An unstated instance could be any instance of its actor, and a
 *   recipient whose own instance is unstated could be any of them, so either
 *   side being unstated makes two references possibly the same. Any ambiguous
 *   transition in range keeps the listing OBSERVED_ONLY (it might be a window
 *   nobody can see), and one that could touch a window's recipient inside its
 *   observed span keeps that window's continuity NOT_ESTABLISHED.
 */

import { inclusiveRange, type TimeRangeMs } from "../engine/evidence/coverage.js";
import type { EvidenceLocator } from "../engine/evidence/locator.js";
import type { CombatActorType } from "../engine/normalization/actors.js";
import type { CombatFight } from "../engine/normalization/combat-fight.js";
import type { ActorRef, AuraEvent } from "../engine/normalization/normalized-events.js";
import { createCombatState } from "../engine/state/combat-state.js";
import { gateContinuityClaim } from "../engine/state/state-environment.js";
import { gateAbsenceClaim, type UnknownReason } from "../engine/state/state-result.js";

export const SUPPORT_AURA_WINDOWS_REVISION = "support-aura-windows/1" as const;

export interface SupportAuraQuery {
  readonly supporterActorId: number;
  /** The aura ability ids to read, from the caller's own runtime data. */
  readonly auraAbilityGameIds: readonly number[];
}

export interface ObservedTransition {
  readonly reportTimeMs: number;
  readonly rawType: string;
  readonly locator: EvidenceLocator;
}

export type WindowBound =
  | ({ readonly kind: "OBSERVED" } & ObservedTransition)
  | {
      readonly kind: "NOT_OBSERVED";
      readonly reason:
        | "FIRST_OBSERVED_TRANSITION_IS_NOT_AN_APPLICATION"
        | "NO_REMOVAL_OBSERVED"
        | "REAPPLIED_WITHOUT_OBSERVED_REMOVAL";
    };

/** Who received the buff, from the fight's actor catalog only. */
export type RecipientIdentity =
  | { readonly catalog: "NOT_IN_CATALOG" }
  | {
      readonly catalog: "LISTED";
      readonly actorType: CombatActorType;
      /** Class for players, verbatim. */
      readonly subType: string | null;
      readonly ownership:
        | { readonly kind: "NOT_A_PET" }
        | { readonly kind: "OWNED_BY"; readonly ownerActorId: number }
        | { readonly kind: "OWNER_NOT_STATED" };
      readonly isSupporter: boolean;
    };

export interface SupportAuraWindow {
  readonly recipient: ActorRef;
  readonly recipientIdentity: RecipientIdentity;
  readonly abilityGameId: number;
  readonly start: WindowBound;
  readonly end: WindowBound;
  /** Refreshes and stack changes inside the window. Each proves the aura active then, except a stack removal to zero or to an unstated count. */
  readonly activeObservations: readonly ObservedTransition[];
  /** Earliest to latest OBSERVED transition of the window, inclusive. Active only AT those instants unless continuity is established. */
  readonly observedSpan: TimeRangeMs;
  /**
   * Both bounds observed: the distance between them. A duration ONLY when
   * `continuity` is ESTABLISHED; otherwise a gap between two facts.
   */
  readonly boundsDistanceMs: number | null;
  readonly continuity:
    | { readonly state: "ESTABLISHED" }
    | {
        readonly state: "NOT_ESTABLISHED";
        readonly reason: UnknownReason | "AMBIGUOUS_TRANSITION_INSIDE" | "UNPROVEN_STACK_REMOVAL_INSIDE";
      };
  /** `observedSpan` when continuity is ESTABLISHED, else null: the only span proven continuously active. */
  readonly activeSpan: TimeRangeMs | null;
}

export type WindowListing =
  | { readonly state: "COMPLETE" }
  | { readonly state: "OBSERVED_ONLY"; readonly reason: UnknownReason | "AMBIGUOUS_TRANSITIONS" };

/** Why a buff transition might be one of the supporter's tracks without being attributable to one. */
export type AmbiguityKind =
  | "SOURCE_NOT_STATED"
  | "ABILITY_NOT_STATED"
  | "TARGET_NOT_STATED"
  /** No recipient instance stated, while the same actor's instances are elsewhere told apart: it could be any of them. */
  | "INSTANCE_NOT_STATED";

export interface AmbiguousTransition extends ObservedTransition {
  readonly ambiguity: AmbiguityKind;
  /** The stated target; null when Warcraft Logs stated none (it could then be any recipient). */
  readonly target: ActorRef | null;
}

export interface SupportAuraWindows {
  readonly revision: typeof SUPPORT_AURA_WINDOWS_REVISION;
  readonly supporterActorId: number;
  readonly range: TimeRangeMs;
  /** Windows in order of their first observed transition. */
  readonly windows: readonly SupportAuraWindow[];
  /** Whether `windows` is every window of these abilities from the supporter in `range`. */
  readonly listing: WindowListing;
  /** Transitions that might be the supporter's tracks but cannot be attributed: never read as such. */
  readonly ambiguousTransitions: readonly AmbiguousTransition[];
}

const keyOf = (actor: ActorRef): string => `${String(actor.actorId)}:${String(actor.instanceId)}`;

/** Whether two recipient references could be the same actor instance. */
const couldBeSame = (left: ActorRef, right: ActorRef): boolean =>
  left.actorId === right.actorId &&
  (left.instanceId === right.instanceId || left.instanceId === null || right.instanceId === null);

function identityOf(fight: CombatFight, actorId: number, supporterActorId: number): RecipientIdentity {
  const actor = fight.actors.get(actorId);
  if (actor === undefined) return { catalog: "NOT_IN_CATALOG" };
  const ownership =
    actor.actorType !== "PET"
      ? ({ kind: "NOT_A_PET" } as const)
      : actor.petOwnerActorId === null
        ? ({ kind: "OWNER_NOT_STATED" } as const)
        : ({ kind: "OWNED_BY", ownerActorId: actor.petOwnerActorId } as const);
  return {
    catalog: "LISTED",
    actorType: actor.actorType,
    subType: actor.subType,
    ownership,
    isSupporter: actorId === supporterActorId,
  };
}

const transitionOf = (event: AuraEvent): ObservedTransition => ({
  reportTimeMs: event.reportTimeMs,
  rawType: event.rawType,
  locator: event.locator,
});

interface OpenWindow {
  recipient: ActorRef;
  abilityGameId: number;
  start: WindowBound;
  activeObservations: ObservedTransition[];
  /** A stack removal whose resulting count does not prove the aura survived it. */
  unprovenStackRemoval: boolean;
}

/** A stack removal proves the aura survived only with a positive resulting count. */
const unprovenStackRemoval = (event: AuraEvent): boolean =>
  event.isStackChange && event.operation === "REMOVED" && !(event.stacks !== null && event.stacks > 0);

/** The supporter's buff windows on every recipient, for the given ability ids. */
export function supportAuraWindowsOf(
  fight: CombatFight,
  query: SupportAuraQuery,
  range: TimeRangeMs = inclusiveRange(fight.fight.startTimeMs, fight.fight.endTimeMs),
): SupportAuraWindows {
  const abilities = new Set(query.auraAbilityGameIds);
  const open = new Map<string, OpenWindow>();
  const closed: { window: OpenWindow; end: WindowBound }[] = [];
  const ambiguous: AmbiguousTransition[] = [];

  const inRange = (time: number): boolean =>
    time >= range.fromReportTimeMs &&
    (range.upperBound === "INCLUSIVE" ? time <= range.toReportTimeMs : time < range.toReportTimeMs);

  // Which (actor, ability) tracks state an instance on some transitions and none on others.
  const instancesSeen = new Map<string, Set<number | null>>();
  for (const event of fight.events) {
    if (event.kind !== "AURA" || event.auraClass !== "BUFF" || !inRange(event.reportTimeMs)) continue;
    if (event.source?.actorId !== query.supporterActorId || event.target === null) continue;
    if (event.abilityGameId === null || !abilities.has(event.abilityGameId)) continue;
    const key = `${String(event.target.actorId)}|${String(event.abilityGameId)}`;
    const seen = instancesSeen.get(key) ?? new Set<number | null>();
    seen.add(event.target.instanceId);
    instancesSeen.set(key, seen);
  }
  const instanceMixed = (actorId: number, abilityGameId: number): boolean => {
    const seen = instancesSeen.get(`${String(actorId)}|${String(abilityGameId)}`);
    return seen !== undefined && seen.has(null) && seen.size > 1;
  };

  for (const event of fight.events) {
    if (event.kind !== "AURA" || event.auraClass !== "BUFF") continue;
    if (!inRange(event.reportTimeMs)) continue;
    const fromSupporter = event.source !== null && event.source.actorId === query.supporterActorId;
    const ambiguity: AmbiguityKind | null =
      event.abilityGameId === null
        ? event.source === null || fromSupporter
          ? "ABILITY_NOT_STATED"
          : null
        : !abilities.has(event.abilityGameId)
          ? null
          : event.source === null
            ? "SOURCE_NOT_STATED"
            : fromSupporter && event.target === null
              ? "TARGET_NOT_STATED"
              : fromSupporter &&
                  event.target !== null &&
                  event.target.instanceId === null &&
                  instanceMixed(event.target.actorId, event.abilityGameId)
                ? "INSTANCE_NOT_STATED"
                : null;
    if (ambiguity !== null) {
      ambiguous.push({ ...transitionOf(event), ambiguity, target: event.target });
      continue;
    }
    if (event.abilityGameId === null || !abilities.has(event.abilityGameId)) continue;
    if (!fromSupporter || event.target === null) continue;
    const recipient: ActorRef = { actorId: event.target.actorId, instanceId: event.target.instanceId };
    const trackKey = `${keyOf(recipient)}|${String(event.abilityGameId)}`;
    const current = open.get(trackKey);
    const observed = { kind: "OBSERVED", ...transitionOf(event) } as const;

    if (event.isStackChange || event.operation === "REFRESHED") {
      if (current !== undefined) {
        current.activeObservations.push(transitionOf(event));
        if (unprovenStackRemoval(event)) current.unprovenStackRemoval = true;
      } else {
        open.set(trackKey, {
          recipient,
          abilityGameId: event.abilityGameId,
          start: { kind: "NOT_OBSERVED", reason: "FIRST_OBSERVED_TRANSITION_IS_NOT_AN_APPLICATION" },
          activeObservations: [transitionOf(event)],
          unprovenStackRemoval: unprovenStackRemoval(event),
        });
      }
      continue;
    }
    if (event.operation === "APPLIED") {
      if (current !== undefined) {
        closed.push({
          window: current,
          end: { kind: "NOT_OBSERVED", reason: "REAPPLIED_WITHOUT_OBSERVED_REMOVAL" },
        });
      }
      open.set(trackKey, {
        recipient,
        abilityGameId: event.abilityGameId,
        start: observed,
        activeObservations: [],
        unprovenStackRemoval: false,
      });
      continue;
    }
    // REMOVED
    if (current !== undefined) {
      closed.push({ window: current, end: observed });
      open.delete(trackKey);
    } else {
      closed.push({
        window: {
          recipient,
          abilityGameId: event.abilityGameId,
          start: { kind: "NOT_OBSERVED", reason: "FIRST_OBSERVED_TRANSITION_IS_NOT_AN_APPLICATION" },
          activeObservations: [],
          unprovenStackRemoval: false,
        },
        end: observed,
      });
    }
  }
  for (const window of open.values()) {
    closed.push({ window, end: { kind: "NOT_OBSERVED", reason: "NO_REMOVAL_OBSERVED" } });
  }

  // The engine's continuity gate: monotonic time, then coverage.
  const state = createCombatState(fight);
  const windows = closed.map(({ window, end }): SupportAuraWindow => {
    const times = [
      ...(window.start.kind === "OBSERVED" ? [window.start.reportTimeMs] : []),
      ...window.activeObservations.map((observation) => observation.reportTimeMs),
      ...(end.kind === "OBSERVED" ? [end.reportTimeMs] : []),
    ];
    const from = Math.min(...times);
    const to = Math.max(...times);
    const observedSpan = inclusiveRange(from, to);
    // An ambiguous transition with no stated target could be any recipient's;
    // one with an unstated instance could be any instance of its actor.
    const inside = ambiguous.some(
      (transition) =>
        (transition.target === null || couldBeSame(transition.target, window.recipient)) &&
        transition.reportTimeMs >= from &&
        transition.reportTimeMs <= to,
    );
    // No transition of this track may be missing between the observations,
    // and retrieval order must be a timeline for the span to mean anything.
    const gate = gateContinuityClaim(state, {
      category: "AURAS",
      fromReportTimeMs: from,
      toReportTimeMs: to,
      actorId: query.supporterActorId,
    });
    const continuity: SupportAuraWindow["continuity"] = !gate.ok
      ? { state: "NOT_ESTABLISHED", reason: gate.reason }
      : window.unprovenStackRemoval
        ? { state: "NOT_ESTABLISHED", reason: "UNPROVEN_STACK_REMOVAL_INSIDE" }
        : inside
          ? { state: "NOT_ESTABLISHED", reason: "AMBIGUOUS_TRANSITION_INSIDE" }
          : { state: "ESTABLISHED" };
    return {
      recipient: window.recipient,
      recipientIdentity: identityOf(fight, window.recipient.actorId, query.supporterActorId),
      abilityGameId: window.abilityGameId,
      start: window.start,
      end,
      activeObservations: window.activeObservations,
      observedSpan,
      boundsDistanceMs:
        window.start.kind === "OBSERVED" && end.kind === "OBSERVED"
          ? end.reportTimeMs - window.start.reportTimeMs
          : null,
      continuity,
      activeSpan: continuity.state === "ESTABLISHED" ? observedSpan : null,
    };
  });
  windows.sort(
    (left, right) =>
      left.observedSpan.fromReportTimeMs - right.observedSpan.fromReportTimeMs ||
      left.recipient.actorId - right.recipient.actorId ||
      left.abilityGameId - right.abilityGameId,
  );

  const gate = gateAbsenceClaim({
    completeness: fight.completeness,
    category: "AURAS",
    range,
    actorId: query.supporterActorId,
  });
  return {
    revision: SUPPORT_AURA_WINDOWS_REVISION,
    supporterActorId: query.supporterActorId,
    range,
    windows,
    listing: !gate.ok
      ? { state: "OBSERVED_ONLY", reason: gate.reason }
      : ambiguous.length > 0
        ? { state: "OBSERVED_ONLY", reason: "AMBIGUOUS_TRANSITIONS" }
        : { state: "COMPLETE" },
    ambiguousTransitions: ambiguous,
  };
}
