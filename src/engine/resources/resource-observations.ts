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
 * one has `resourceChange: 10` and an attached `classResources[{amount: 100}]` —
 * and whether that 100 is the amount before or after the change is an
 * UNESTABLISHED evidence contract. Merging them would require picking one.
 *
 * SAMPLING TIMING IS A TAG, NOT A NAME
 *
 * Exactly one sampling order is established: a COMPLETED cast carrying a
 * positive `cost` reports the amount BEFORE that cost. Every other attachment
 * — `resourcechange` included — has no established order.
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
  ResourceSide,
  SourceRef,
  TargetRef,
} from "../normalization/normalized-events.js";

/**
 * When an observed amount was sampled, relative to its own event.
 *
 * Two members, because exactly two states are honest. There is deliberately no
 * `POST_COST` and no `POST_CHANGE`:
 *
 * - `POST_COST` is not observed anywhere. It could only be computed, and
 *   computing it is the delta replay this layer refuses.
 * - `POST_CHANGE` for a `resourcechange` attachment is EMPIRICALLY FAVOURED but
 *   NOT ESTABLISHED. The supporting evidence relies on same-timestamp retrieval
 *   adjacency standing in for causal order, which M3/M4-A deliberately do not
 *   guarantee, and whole-window reconciliation was incomplete. Adding the member
 *   would let that assumption spread by autocomplete.
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
   * An exact observation associated with the event, with no established
   * before/after relationship to anything the event did.
   *
   * The conservative default. Every attachment that is not a positively costed
   * completed cast lands here, including `resourcechange`.
   */
  | "EVENT_ASSOCIATED";

export const RESOURCE_OBSERVATION_TIMINGS = [
  "PRE_COST",
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
 * death — `DEATHS` capability is UNVERIFIED.
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
 * One standalone `resourcechange` observation.
 *
 * `source` and `target` are M3's branded references, carried through. Which of
 * them "gained" the resource is not asserted here: M3 owns attribution, and this
 * layer reports the envelope it was given.
 */
export interface StandaloneResourceChangeObservation {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly source: SourceRef | null;
  readonly target: TargetRef | null;
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
  /** Standalone changes: SOURCE actor -> resource type -> ascending positions. */
  readonly standaloneChangePositionsBySource: ReadonlyMap<number, ReadonlyMap<number, readonly number[]>>;
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
  const standaloneChangePositionsBySource = new Map<number, Map<number, number[]>>();
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
      if (event.source !== null) {
        appendNested(standaloneChangePositionsBySource, event.source.actorId, event.resourceType, position);
      }
    }
  }

  return {
    snapshotPositionsByActor,
    unattributedSnapshotPositions,
    healthPositionsByActor,
    standaloneChangePositionsBySource,
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
 * Everything else — `resourcechange`, `damage`, `heal` — is EVENT_ASSOCIATED,
 * and that is the DEFAULT rather than a listed set, so a raw type nobody has
 * considered yet cannot fall into PRE_COST.
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
    resourceType: event.resourceType,
    resourceChange: event.resourceChange,
    otherResourceChange: event.otherResourceChange,
    maxResourceAmount: event.maxResourceAmount,
    reportedWasteAmount: event.reportedWasteAmount,
    reportTimeMs: event.reportTimeMs,
    fightTimeMs: event.fightTimeMs,
  };
}
