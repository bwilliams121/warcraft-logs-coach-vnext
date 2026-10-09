/**
 * Observed resource facts, indexed by actor and resource type.
 *
 * This is an OBSERVATION layer, not a simulator. It answers "what resource
 * numbers were actually seen, for whom, and when", and it answers nothing else.
 * There is no regeneration model here, no interpolation, no derived intermediate
 * value, and no bounded interval — bounded continuous resources need a
 * versioned, evidence-backed game-data model that does not exist yet, and a
 * point estimate in its place would be the fabrication this project exists to
 * prevent.
 *
 * TWO OBSERVATION SHAPES, KEPT APART
 *
 * Warcraft Logs produces resource evidence in two structurally different ways,
 * and M3 keeps them in two different places:
 *
 * - an ATTACHED SNAPSHOT, flattened onto some other event under
 *   `includeResources`, carrying `classResources[]` amounts for ONE side of that
 *   event
 * - a STANDALONE `resourcechange` event, carrying a delta, a max and Warcraft
 *   Logs' own `waste` number
 *
 * They are indexed separately here and never merged into a synthetic combined
 * event. The same `resourcechange` event frequently carries BOTH — a captured
 * one has `resourceChange: 10` and an attached `classResources[{amount: 100}]`.
 * Since M11-B5 the 100 is ESTABLISHED as the amount AFTER the change, for the
 * one attachment whose type is the type being changed (`POST_CHANGE` below);
 * the two observations are still kept apart, and the delta is never applied
 * to anything.
 *
 * SAMPLING TIMING IS A TAG, NOT A NAME
 *
 * Exactly two sampling orders are established: a COMPLETED cast carrying a
 * positive `cost` reports the amount BEFORE that cost, and a `resourcechange`
 * whose attachment is of the changed resource's type reports the amount AFTER
 * that change. Every other attachment has no established order.
 *
 * That distinction is carried as `ResourceObservationTiming` on the observation
 * rather than baked into accessor names. An accessor called
 * `resourceBeforeCast` would apply one event's contract to every event that
 * reaches it, and `EVENT_ASSOCIATED` would have nowhere to live. A tag lets a
 * consumer branch on what is actually known, and lets the unknown case stay
 * visibly unknown.
 *
 * Knowing that an amount is PRE_COST still does not make the POST-cost amount
 * knowable. `amount - cost` is arithmetic across an instant nothing observed,
 * and live captures contain costed casts where the next observation disagrees
 * with it. See `resource-state.ts`.
 */

import type { EvidenceLocator } from "../evidence/locator.js";
import type { CombatFight } from "../normalization/combat-fight.js";
import type {
  ActorRef,
  ClassResourceObservation,
  CombatEvent,
  ResourceChangeEvent,
  ResourceSide,
  SourceRef,
  TargetRef,
} from "../normalization/normalized-events.js";

/**
 * When an observed amount was sampled, relative to its own event.
 *
 * Three members, because exactly three states are honest. There is
 * deliberately no `POST_COST`: it is not observed anywhere, it could only be
 * computed, and computing it is the delta replay this layer refuses.
 *
 * `POST_CHANGE` was withheld until M11-B5 because its evidence had rested on
 * same-timestamp retrieval adjacency and an incomplete reconciliation. The
 * Blood Death Knight corpus settled it by WHOLE-WINDOW reconciliation, not by
 * adjacency: over 165 s + 20 s of one actor's Runic Power, the attached
 * amount on every `resourcechange` equals the previous exact state plus the
 * change (clamped at the reported max) at 246 of 246 integer gains, is the
 * capped max at every cap event, and is exact even at the 20 Anti-Magic
 * Shell gains whose `resourceChange` is a rounded whole number — and every
 * later costed cast's PRE_COST amount (50 of 50) and every later uncosted
 * attachment (175 of 175) equals the state so carried. A PRE_CHANGE reading
 * matches none of them. Evidence: the Blood corpus artifacts and the
 * `COMBAT_STATE.RESOURCE_CHANGE_POST_CHANGE_CONTRACT` assertions
 * (tests/corpus/manifest.json).
 */
export type ResourceObservationTiming =
  /**
   * The amount BEFORE the event's own cost was paid.
   *
   * Established for `gameVersion` 1 / `logVersion` 17 from live captures, and
   * used for exactly one case: a COMPLETED cast whose entry carries a positive
   * `cost`. Evidence: corpus artifact `wcl-cast-resource-pre-cost` (tests/corpus/manifest.json).
   */
  | "PRE_COST"
  /**
   * The amount AFTER the event's own change was applied (M11-B5).
   *
   * Established for `gameVersion` 1 / `logVersion` 17, and used for exactly
   * one case: an attachment on a `RESOURCE_CHANGE` event whose resource type
   * IS the type that event changed. The attachment of any OTHER type riding
   * on the same event (a snapshot of a second pool) establishes nothing about
   * the change and stays EVENT_ASSOCIATED.
   *
   * THIS IS AN OBSERVED STATE, NOT A COMPUTED ONE. The amount is read; the
   * `resourceChange` delta is never added to anything to produce it, and
   * never may be — the delta is a rounded whole number where the game moved
   * a fraction, and the attachment is exact where the delta is not.
   */
  | "POST_CHANGE"
  /**
   * An exact observation associated with the event, with no established
   * before/after relationship to anything the event did.
   *
   * The conservative default. Every attachment that is neither a positively
   * costed completed cast nor the changed type on a `resourcechange` lands
   * here.
   */
  | "EVENT_ASSOCIATED";

export const RESOURCE_OBSERVATION_TIMINGS = [
  "PRE_COST",
  "POST_CHANGE",
  "EVENT_ASSOCIATED",
] as const satisfies readonly ResourceObservationTiming[];

/**
 * One resource amount, as observed on one event.
 *
 * `side` and `actor` come straight from M3, which took `side` from the verified
 * `resourceActor` discriminator. This module does not look at `resourceActor`
 * itself: a captured `damage` event from a player to the boss carries the BOSS's
 * pool, and re-deciding attribution here would be a second chance to get it
 * backwards.
 */
export interface ResourceAmountObservation {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly side: ResourceSide;
  /** The actor the snapshot describes. `null` when that side carried no actor. */
  readonly actor: ActorRef | null;
  readonly resourceType: number;
  /** `amount`, verbatim. `timing` says what instant it describes. */
  readonly observedAmount: number;
  readonly observedMax: number | null;
  /** `cost`, observed on cast events only. An observed number, not a verdict. */
  readonly observedCost: number | null;
  /**
   * What instant `observedAmount` describes, relative to this event.
   *
   * Decided once, here, from M3's normalized model — never re-derived downstream
   * from the raw type string.
   */
  readonly timing: ResourceObservationTiming;
  /** The raw type of the event the snapshot rode in on, for context. */
  readonly attachedToRawType: string;
  readonly reportTimeMs: number;
  readonly fightTimeMs: number;
}

/**
 * The health fields an attached snapshot also carries.
 *
 * Exposed because preserving them is free once the snapshot walk exists, and
 * SPARSE on purpose. There is deliberately no "latest health at position"
 * accessor: health moves continuously, a carried-forward value would be read as
 * current, and that is the first step toward a health simulator. Nothing here
 * infers that health was unchanged between observations, and nothing here infers
 * death: deaths are POSITIVE `DEATH` events read by `death-state.ts` (M11-F),
 * never a health value of zero.
 */
export interface HealthAmountObservation {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly side: ResourceSide;
  readonly actor: ActorRef | null;
  readonly hitPoints: number;
  readonly maxHitPoints: number | null;
  readonly absorb: number | null;
  readonly attachedToRawType: string;
  readonly reportTimeMs: number;
  readonly fightTimeMs: number;
}

/**
 * Whose resource POOL a standalone `resourcechange` changed (M11-D2-A3).
 *
 * The event's SOURCE is the actor that caused the change. It is not, in
 * general, the actor whose pool changed: one captured Hunter ability that
 * restores Focus is sourced by the Hunter on four events at one millisecond —
 * the Hunter's own pool and three pets' pools. Until M11-D2-A3 the standalone
 * index filed every change under its source, so the pets' changes read as the
 * Hunter's own Focus history.
 *
 * Ownership is read from evidence ON THE EVENT, never from who the actors are,
 * and an event that does not establish it stays UNRESOLVED — it is never
 * defaulted to the source, the target, or a pet's owner.
 */
export type StandaloneChangeOwnership =
  | {
      readonly state: "RESOLVED";
      /** The actor whose pool changed. A plain reference: neither the source nor the target brand. */
      readonly owner: ActorRef;
      readonly basis: StandaloneChangeOwnershipBasis;
    }
  | {
      readonly state: "UNRESOLVED";
      readonly reason: UnresolvedChangeOwnershipReason;
      /** The concrete actors on the event's two sides, ascending and distinct. */
      readonly candidateActorIds: readonly number[];
      /**
       * False when a side carried no concrete actor: the pool may then belong
       * to an actor the event does not name, and no actor can be ruled out.
       */
      readonly candidatesComplete: boolean;
    };

export type StandaloneChangeOwnershipBasis =
  /**
   * The event's own snapshot — on the side its `resourceActor` discriminator
   * names — carries an entry of the CHANGED resource type, and that side has a
   * concrete actor. That entry is the changed pool after the change
   * (POST_CHANGE, M11-B5), so its actor owns the pool. Read off the
   * discriminator M3 already verified, never off the actors' roles. Evidence:
   * corpus artifact `wcl-resource-change-pool-ownership`
   * (tests/corpus/manifest.json).
   */
  | "ATTACHED_CHANGED_POOL"
  /**
   * The event's source and target are one concrete actor instance. Both sides
   * name the same actor, so the owner is that actor under either reading.
   */
  | "SAME_ACTOR_BOTH_SIDES";

export const STANDALONE_CHANGE_OWNERSHIP_BASES = [
  "ATTACHED_CHANGED_POOL",
  "SAME_ACTOR_BOTH_SIDES",
] as const satisfies readonly StandaloneChangeOwnershipBasis[];

export type UnresolvedChangeOwnershipReason =
  /** No snapshot rides on the event, and its two sides are not one actor. */
  | "NO_ATTACHED_POOL"
  /** A snapshot rides on the event but carries no entry of the changed type, and the sides differ. */
  | "ATTACHMENT_LACKS_CHANGED_TYPE"
  /** The changed type's entry rides on a side with no concrete actor, and the sides differ. */
  | "ATTACHED_SIDE_HAS_NO_ACTOR";

export const UNRESOLVED_CHANGE_OWNERSHIP_REASONS = [
  "NO_ATTACHED_POOL",
  "ATTACHMENT_LACKS_CHANGED_TYPE",
  "ATTACHED_SIDE_HAS_NO_ACTOR",
] as const satisfies readonly UnresolvedChangeOwnershipReason[];

function sameActorInstance(a: ActorRef | null, b: ActorRef | null): boolean {
  return a !== null && b !== null && a.actorId === b.actorId && a.instanceId === b.instanceId;
}

/**
 * Decides whose pool one standalone change changed, from the event alone.
 *
 * Two bases, in this order, and nothing else:
 *
 *     the changed type's entry on a named side   -> that side's actor
 *     source and target are one actor instance   -> that actor
 *     otherwise                                  -> UNRESOLVED
 *
 * There is deliberately no rule about pets, owners, classes or resource types.
 * Actor id `0` is real; only an absent actor is absent.
 */
export function standaloneChangeOwnershipOf(event: ResourceChangeEvent): StandaloneChangeOwnership {
  const attached = event.attachedResources;
  const carriesChangedType =
    attached !== null && attached.classResources.some((entry) => entry.resourceType === event.resourceType);
  if (carriesChangedType && attached.actor !== null) {
    return {
      state: "RESOLVED",
      owner: { actorId: attached.actor.actorId, instanceId: attached.actor.instanceId },
      basis: "ATTACHED_CHANGED_POOL",
    };
  }
  if (event.source !== null && sameActorInstance(event.source, event.target)) {
    return {
      state: "RESOLVED",
      owner: { actorId: event.source.actorId, instanceId: event.source.instanceId },
      basis: "SAME_ACTOR_BOTH_SIDES",
    };
  }
  const candidates = new Set<number>();
  if (event.source !== null) candidates.add(event.source.actorId);
  if (event.target !== null) candidates.add(event.target.actorId);
  return {
    state: "UNRESOLVED",
    reason:
      attached === null
        ? "NO_ATTACHED_POOL"
        : carriesChangedType
          ? "ATTACHED_SIDE_HAS_NO_ACTOR"
          : "ATTACHMENT_LACKS_CHANGED_TYPE",
    candidateActorIds: [...candidates].sort((a, b) => a - b),
    candidatesComplete: event.source !== null && event.target !== null,
  };
}

/**
 * Whether an actor's pool could be the one an ownership describes: the owner
 * itself; for an UNRESOLVED change any candidate, and every actor when the
 * candidates are incomplete.
 */
export function ownershipCouldBe(ownership: StandaloneChangeOwnership, actorId: number): boolean {
  if (ownership.state === "RESOLVED") return ownership.owner.actorId === actorId;
  return !ownership.candidatesComplete || ownership.candidateActorIds.includes(actorId);
}

/**
 * One standalone `resourcechange` observation.
 *
 * `source` and `target` are M3's branded references, carried through
 * unchanged: the source is still the actor that CAUSED the change. Whose POOL
 * changed is a separate fact, `ownership`, decided once from the event's own
 * evidence (M11-D2-A3).
 */
export interface StandaloneResourceChangeObservation {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly source: SourceRef | null;
  readonly target: TargetRef | null;
  readonly ownership: StandaloneChangeOwnership;
  readonly resourceType: number;
  readonly resourceChange: number;
  readonly otherResourceChange: number | null;
  readonly maxResourceAmount: number | null;
  /**
   * Warcraft Logs' own `waste` number, verbatim.
   *
   * An OBSERVED FIELD. It is not "resource wasted", not an overcap verdict, and
   * not a mistake. Resource at cap is also not resource waste. Whether any of
   * this means anything about gameplay is a specialization evaluator's call.
   */
  readonly reportedWasteAmount: number | null;
  readonly reportTimeMs: number;
  readonly fightTimeMs: number;
}

export interface ResourceIndexes {
  /**
   * Attached snapshots: actor -> resource type -> ascending canonical positions.
   *
   * Keyed by the actor the SNAPSHOT describes, which is the actor on the side
   * `resourceActor` named — not necessarily the event's source.
   */
  readonly snapshotPositionsByActor: ReadonlyMap<number, ReadonlyMap<number, readonly number[]>>;
  /**
   * Snapshots whose side carried no actor.
   *
   * Preserved, never attributed. The snapshot is still a fact even when the
   * actor behind it was not stated, and inventing one would be worse than
   * reporting it unattributed.
   */
  readonly unattributedSnapshotPositions: readonly number[];
  /** Actor -> ascending positions of snapshots carrying `hitPoints`. */
  readonly healthPositionsByActor: ReadonlyMap<number, readonly number[]>;
  /**
   * Standalone changes: POOL OWNER -> resource type -> ascending positions.
   *
   * Keyed by the actor whose pool changed (`standaloneChangeOwnershipOf`), not
   * by the event's source (M11-D2-A3).
   */
  readonly standaloneChangePositionsByOwner: ReadonlyMap<number, ReadonlyMap<number, readonly number[]>>;
  /**
   * Standalone changes whose pool owner the event does not establish.
   *
   * Preserved, never attributed — the standalone counterpart of
   * `unattributedSnapshotPositions`. Filing one under its source would be the
   * defect M11-D2-A3 removed.
   */
  readonly unresolvedOwnershipChangePositions: readonly number[];
  /** Every standalone change position, in canonical order. */
  readonly standaloneChangePositions: readonly number[];
}

function appendNested(
  index: Map<number, Map<number, number[]>>,
  outer: number,
  inner: number,
  position: number,
): void {
  let byInner = index.get(outer);
  if (byInner === undefined) {
    byInner = new Map();
    index.set(outer, byInner);
  }
  const existing = byInner.get(inner);
  if (existing === undefined) {
    byInner.set(inner, [position]);
    return;
  }
  existing.push(position);
}

function append(index: Map<number, number[]>, key: number, position: number): void {
  const existing = index.get(key);
  if (existing === undefined) {
    index.set(key, [position]);
    return;
  }
  existing.push(position);
}

/**
 * Builds the resource indexes in one forward scan.
 *
 * Positions are appended in canonical order, so every list is ascending BY
 * CONSTRUCTION. An event can contribute to several lists at once: a
 * `resourcechange` with an attached snapshot appears in the standalone index AND
 * in the snapshot index, because it genuinely carries both observations.
 *
 * Actor tests are explicit `null` comparisons throughout. Actor id `0` is real.
 */
export function buildResourceIndexes(fight: CombatFight): ResourceIndexes {
  const snapshotPositionsByActor = new Map<number, Map<number, number[]>>();
  const unattributedSnapshotPositions: number[] = [];
  const healthPositionsByActor = new Map<number, number[]>();
  const standaloneChangePositionsByOwner = new Map<number, Map<number, number[]>>();
  const unresolvedOwnershipChangePositions: number[] = [];
  const standaloneChangePositions: number[] = [];

  for (let position = 0; position < fight.events.length; position += 1) {
    const event = fight.events[position];
    if (event === undefined) {
      continue;
    }

    const attached = event.attachedResources;
    if (attached !== null) {
      const actor = attached.actor;
      if (actor === null) {
        unattributedSnapshotPositions.push(position);
      } else {
        for (const resource of attached.classResources) {
          appendNested(snapshotPositionsByActor, actor.actorId, resource.resourceType, position);
        }
        if (attached.hitPoints !== null) {
          append(healthPositionsByActor, actor.actorId, position);
        }
      }
    }

    if (event.kind === "RESOURCE_CHANGE") {
      standaloneChangePositions.push(position);
      const ownership = standaloneChangeOwnershipOf(event);
      if (ownership.state === "RESOLVED") {
        appendNested(standaloneChangePositionsByOwner, ownership.owner.actorId, event.resourceType, position);
      } else {
        unresolvedOwnershipChangePositions.push(position);
      }
    }
  }

  return {
    snapshotPositionsByActor,
    unattributedSnapshotPositions,
    healthPositionsByActor,
    standaloneChangePositionsByOwner,
    unresolvedOwnershipChangePositions,
    standaloneChangePositions,
  };
}

/**
 * Classifies one attached entry's sampling timing.
 *
 * PRE_COST requires BOTH halves of the established contract and nothing less:
 *
 *     a COMPLETED cast   +   a positive observed cost on THIS resource entry
 *
 * `castPhase === "COMPLETE"` is M3's normalized form of the raw type `cast`,
 * which is the only type the contract was established on. `begincast` shares
 * `kind: "CAST"` and is deliberately excluded — no capture has shown it carrying
 * an attachment at all, so extending the contract to it would be an assumption.
 *
 * A cast entry with no cost, or a zero cost, is EVENT_ASSOCIATED. Zero is an
 * observed cost of nothing, which establishes no ordering: there is no deduction
 * for the amount to precede.
 *
 * POST_CHANGE requires BOTH halves of its contract and nothing less (M11-B5):
 *
 *     a RESOURCE_CHANGE event   +   an entry whose type IS the changed type
 *
 * A second pool's snapshot riding on the same event is EVENT_ASSOCIATED: the
 * event changed a different resource, and says nothing about this one.
 *
 * Everything else — `damage`, `heal`, an unconsidered raw type — is
 * EVENT_ASSOCIATED, and that is the DEFAULT rather than a listed set, so a raw
 * type nobody has considered yet cannot fall into either established timing.
 */
function timingOf(event: CombatEvent, resource: ClassResourceObservation): ResourceObservationTiming {
  if (
    event.kind === "CAST" &&
    event.castPhase === "COMPLETE" &&
    resource.cost !== null &&
    resource.cost > 0
  ) {
    return "PRE_COST";
  }
  if (event.kind === "RESOURCE_CHANGE" && resource.resourceType === event.resourceType) {
    return "POST_CHANGE";
  }
  return "EVENT_ASSOCIATED";
}

/**
 * Reads one resource amount off the snapshot at a canonical position.
 *
 * `null` when that position holds no snapshot for that actor and resource type.
 * The actor is matched against the snapshot's OWN actor, so a source-side
 * snapshot is never returned for a target-side question.
 */
export function resourceObservationAt(
  fight: CombatFight,
  position: number,
  actorId: number,
  resourceType: number,
): ResourceAmountObservation | null {
  const event = fight.events[position];
  const attached = event?.attachedResources;
  if (event === undefined || attached === null || attached === undefined) {
    return null;
  }
  if (attached.actor === null || attached.actor.actorId !== actorId) {
    return null;
  }
  const resource = attached.classResources.find((entry) => entry.resourceType === resourceType);
  if (resource === undefined) {
    return null;
  }
  return {
    position,
    locator: event.locator,
    side: attached.side,
    actor: attached.actor,
    resourceType: resource.resourceType,
    observedAmount: resource.amount,
    observedMax: resource.max,
    observedCost: resource.cost,
    timing: timingOf(event, resource),
    attachedToRawType: event.rawType,
    reportTimeMs: event.reportTimeMs,
    fightTimeMs: event.fightTimeMs,
  };
}

export function healthObservationAt(
  fight: CombatFight,
  position: number,
  actorId: number,
): HealthAmountObservation | null {
  const event = fight.events[position];
  const attached = event?.attachedResources;
  if (event === undefined || attached === null || attached === undefined) {
    return null;
  }
  if (attached.actor === null || attached.actor.actorId !== actorId || attached.hitPoints === null) {
    return null;
  }
  return {
    position,
    locator: event.locator,
    side: attached.side,
    actor: attached.actor,
    hitPoints: attached.hitPoints,
    maxHitPoints: attached.maxHitPoints,
    absorb: attached.absorb,
    attachedToRawType: event.rawType,
    reportTimeMs: event.reportTimeMs,
    fightTimeMs: event.fightTimeMs,
  };
}

export function standaloneChangeAt(
  fight: CombatFight,
  position: number,
): StandaloneResourceChangeObservation | null {
  const event = fight.events[position];
  if (event === undefined || event.kind !== "RESOURCE_CHANGE") {
    return null;
  }
  return {
    position,
    locator: event.locator,
    source: event.source,
    target: event.target,
    ownership: standaloneChangeOwnershipOf(event),
    resourceType: event.resourceType,
    resourceChange: event.resourceChange,
    otherResourceChange: event.otherResourceChange,
    maxResourceAmount: event.maxResourceAmount,
    reportedWasteAmount: event.reportedWasteAmount,
    reportTimeMs: event.reportTimeMs,
    fightTimeMs: event.fightTimeMs,
  };
}
