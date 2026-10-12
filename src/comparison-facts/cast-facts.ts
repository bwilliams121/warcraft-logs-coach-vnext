/**
 * Observed CAST-EVENT facts (M11-G2): per-ability counts per phase, and the
 * sequence. `begincast` and `cast` are separate events and never merged; a
 * count of cast events is not a count of actions, GCDs or opportunities, and
 * it says nothing about whether more would have been better. Events that
 * share a report millisecond keep retrieval order, marked as NOT PROVEN to be
 * execution order.
 */

import type { CombatFight } from "../engine/normalization/combat-fight.js";
import type { CastPhase } from "../engine/normalization/normalized-events.js";
import type { Proven } from "../combat-facts/coverage.js";
import {
  observationsOf,
  type ActorKey,
  type CastObservation,
  type FightObservations,
  type ObservedSide,
} from "../combat-facts/observations.js";
import {
  collectionUnder,
  countUnder,
  factStateOf,
  type EvidenceBasis,
  type FactCollection,
  type FactState,
} from "./evidence-basis.js";

const CACHE = new WeakMap<CombatFight, FightObservations>();

/** `observationsOf`, computed once per fight. */
export function cachedObservations(fight: CombatFight): FightObservations {
  const cached = CACHE.get(fight);
  if (cached !== undefined) return cached;
  const computed = observationsOf(fight);
  CACHE.set(fight, computed);
  return computed;
}

export interface AbilityCastEvents {
  readonly abilityGameId: number | null;
  readonly beginEventCount: Proven<number>;
  readonly completeEventCount: Proven<number>;
}

export type CastOrder = "UNIQUE_TIMESTAMP" | "RETRIEVAL_ORDER_NOT_PROVEN_AUTHORITATIVE";

export interface CastSequenceEntry {
  readonly reportTimeMs: number;
  readonly source: ActorKey;
  readonly target: ObservedSide;
  readonly abilityGameId: number | null;
  readonly phase: CastPhase;
  readonly order: CastOrder;
}

export interface CastSummary {
  readonly sourceActorIds: readonly number[];
  readonly slice: { readonly startMs: number; readonly endMs: number };
  readonly state: FactState;
  readonly beginEventCount: Proven<number>;
  readonly completeEventCount: Proven<number>;
  readonly byAbility: FactCollection<AbilityCastEvents>;
  readonly sequence: FactCollection<CastSequenceEntry>;
}

export function castsFrom(
  fight: CombatFight,
  sourceActorIds: readonly number[],
  slice: { startMs: number; endMs: number },
): CastObservation[] {
  const members = new Set(sourceActorIds);
  return cachedObservations(fight).casts.filter(
    (event) =>
      event.source.kind === "ACTOR" &&
      members.has(event.source.key.actorId) &&
      event.reportTimeMs >= slice.startMs &&
      event.reportTimeMs < slice.endMs,
  );
}

export function summarizeCasts(
  fight: CombatFight,
  basis: EvidenceBasis,
  sourceActorIds: readonly number[],
  slice: { startMs: number; endMs: number },
): CastSummary {
  const casts = castsFrom(fight, sourceActorIds, slice);
  const state = factStateOf(fight, basis, ["CASTS"], slice, sourceActorIds);
  const byAbility = new Map<number | null, CastObservation[]>();
  for (const cast of casts) {
    const list = byAbility.get(cast.abilityGameId);
    if (list === undefined) byAbility.set(cast.abilityGameId, [cast]);
    else list.push(cast);
  }
  const ordered = [...casts].sort(
    (left, right) =>
      left.reportTimeMs - right.reportTimeMs ||
      left.locator.ingestionOrdinal - right.locator.ingestionOrdinal,
  );
  const tied = new Map<number, number>();
  for (const cast of ordered) tied.set(cast.reportTimeMs, (tied.get(cast.reportTimeMs) ?? 0) + 1);
  const phaseCount = (list: readonly CastObservation[], phase: CastPhase) =>
    countUnder(state, list.filter((cast) => cast.phase === phase).length);
  return {
    sourceActorIds: [...new Set(sourceActorIds)].sort((a, b) => a - b),
    slice: { startMs: slice.startMs, endMs: slice.endMs },
    state,
    beginEventCount: phaseCount(casts, "BEGIN"),
    completeEventCount: phaseCount(casts, "COMPLETE"),
    byAbility: collectionUnder(
      state,
      [...byAbility]
        .map(([abilityGameId, list]) => ({
          abilityGameId,
          beginEventCount: phaseCount(list, "BEGIN"),
          completeEventCount: phaseCount(list, "COMPLETE"),
        }))
        .sort((left, right) => (left.abilityGameId ?? -1) - (right.abilityGameId ?? -1)),
    ),
    sequence: collectionUnder(
      state,
      ordered.map((cast) => ({
        reportTimeMs: cast.reportTimeMs,
        source: (cast.source as Extract<ObservedSide, { kind: "ACTOR" }>).key,
        target: cast.target,
        abilityGameId: cast.abilityGameId,
        phase: cast.phase,
        order:
          (tied.get(cast.reportTimeMs) ?? 0) > 1
            ? "RETRIEVAL_ORDER_NOT_PROVEN_AUTHORITATIVE"
            : "UNIQUE_TIMESTAMP",
      })),
    ),
  };
}
