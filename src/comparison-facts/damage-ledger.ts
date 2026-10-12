/**
 * The OBSERVED-DAMAGE LEDGER and target participation (M11-G2).
 *
 * TWO AMOUNT AUTHORITIES, NEVER ONE NUMBER
 *
 *   RAW_AMOUNT_FIELD_SUM     the sum of the raw event `amount` field over the
 *                            events a cell holds. NOT damage done, effective
 *                            damage, Warcraft Logs damage or a rate: what
 *                            `amount` means is NOT_YET_PROVEN (M1).
 *   WCL_DAMAGE_DONE_TABLE    a Warcraft Logs-computed table amount (per actor,
 *   WCL_RAID_DAMAGE_DONE_TABLE  per ability, per window, or the raid-wide
 *                            entry), with its own pinned semantics and its own
 *                            interval. Never re-derived from events.
 *
 * A cell is keyed by (slice, source ActorKey, ability, target ActorKey) and
 * keeps its event count, raw sum, raw hitType distribution (no mapping, M2)
 * and first/last observation. Participation is a post-hoc FACT about which
 * targets were hit — never which targets were available, attackable, or
 * ought to have been hit.
 */

import type { CombatFight } from "../engine/normalization/combat-fight.js";
import type { Proven } from "../combat-facts/coverage.js";
import {
  actorKeyString,
  compareActorKeys,
  type ActorKey,
  type DamageObservation,
} from "../combat-facts/observations.js";
import { cachedObservations } from "./cast-facts.js";
import type { RawFieldSum } from "../combat-facts/window-query.js";
import {
  collectionUnder,
  countUnder,
  factStateOf,
  rawAmountFieldSumUnder,
  RAW_AMOUNT_MEANING,
  type EvidenceBasis,
  type FactCollection,
  type FactState,
} from "./evidence-basis.js";
import {
  describeTargetActor,
  type EnemyNpcList,
  type TargetDescription,
  type TargetLabel,
} from "./target-classification.js";

export type DamageAmountAuthority =
  "RAW_AMOUNT_FIELD_SUM" | "WCL_DAMAGE_DONE_TABLE" | "WCL_RAID_DAMAGE_DONE_TABLE";

/** A report-relative half-open slice [startMs, endMs). */
export interface LedgerSlice {
  readonly sliceId: string;
  readonly startMs: number;
  readonly endMs: number;
}

export interface HitTypeRawCount {
  /** The raw numeric value, or `null` when absent. Never mapped (M2). */
  readonly hitTypeRaw: number | null;
  readonly observedEventCount: number;
}

export interface ObservedDamageCell {
  readonly sliceId: string;
  readonly source: ActorKey;
  readonly abilityGameId: number | null;
  /** `null` when the event named no target actor. */
  readonly target: ActorKey | null;
  readonly targetLabel: TargetLabel | "NO_TARGET_ACTOR";
  readonly firstObservedAtMs: number;
  readonly lastObservedAtMs: number;
  readonly eventCount: Proven<number>;
  readonly amountAuthority: "RAW_AMOUNT_FIELD_SUM";
  readonly rawAmountFieldSum: Proven<RawFieldSum>;
  readonly rawAmountMeaning: typeof RAW_AMOUNT_MEANING;
  readonly hitTypeRaw: FactCollection<HitTypeRawCount>;
}

export interface ObservedDamageLedger {
  readonly basis: EvidenceBasis["kind"];
  readonly slices: readonly LedgerSlice[];
  readonly sourceActorIds: readonly number[];
  /** Sorted by slice, source, ability, target. OBSERVED_ONLY unless every cell's state is COMPLETE. */
  readonly cells: FactCollection<ObservedDamageCell>;
}

const inSlice = (reportTimeMs: number, slice: { startMs: number; endMs: number }): boolean =>
  reportTimeMs >= slice.startMs && reportTimeMs < slice.endMs;

function hitTypeCounts(events: readonly DamageObservation[]): HitTypeRawCount[] {
  const counts = new Map<number | null, number>();
  for (const event of events) counts.set(event.hitTypeRaw, (counts.get(event.hitTypeRaw) ?? 0) + 1);
  return [...counts]
    .map(([hitTypeRaw, observedEventCount]) => ({ hitTypeRaw, observedEventCount }))
    .sort((left, right) =>
      left.hitTypeRaw === right.hitTypeRaw
        ? 0
        : left.hitTypeRaw === null
          ? -1
          : right.hitTypeRaw === null
            ? 1
            : left.hitTypeRaw - right.hitTypeRaw,
    );
}

function sourceOf(event: DamageObservation): ActorKey | null {
  return event.source.kind === "ACTOR" ? event.source.key : null;
}

function targetOf(event: DamageObservation): ActorKey | null {
  return event.target.kind === "ACTOR" ? event.target.key : null;
}

/** The damage observations whose source is one of `sourceActorIds`, inside `slice`. */
export function damageFrom(
  fight: CombatFight,
  sourceActorIds: readonly number[],
  slice: { startMs: number; endMs: number },
): DamageObservation[] {
  const members = new Set(sourceActorIds);
  return cachedObservations(fight).damage.filter((event) => {
    const source = sourceOf(event);
    return source !== null && members.has(source.actorId) && inSlice(event.reportTimeMs, slice);
  });
}

export function buildDamageLedger(
  fight: CombatFight,
  basis: EvidenceBasis,
  sourceActorIds: readonly number[],
  slices: readonly LedgerSlice[],
  enemyNpcs: EnemyNpcList,
): ObservedDamageLedger {
  const cells: ObservedDamageCell[] = [];
  let allComplete = true;
  for (const slice of slices) {
    const groups = new Map<string, DamageObservation[]>();
    for (const event of damageFrom(fight, sourceActorIds, slice)) {
      const source = sourceOf(event);
      const target = targetOf(event);
      if (source === null) continue;
      const key = `${actorKeyString(source)}|${String(event.abilityGameId)}|${target === null ? "none" : actorKeyString(target)}`;
      const group = groups.get(key);
      if (group === undefined) groups.set(key, [event]);
      else group.push(event);
    }
    for (const events of groups.values()) {
      const first = events[0];
      if (first === undefined) continue;
      const source = sourceOf(first) as ActorKey;
      const target = targetOf(first);
      const state = factStateOf(fight, basis, ["DAMAGE"], slice, [source.actorId], target !== null);
      if (state.state !== "COMPLETE") allComplete = false;
      cells.push({
        sliceId: slice.sliceId,
        source,
        abilityGameId: first.abilityGameId,
        target,
        targetLabel:
          target === null ? "NO_TARGET_ACTOR" : describeTargetActor(fight, target.actorId, enemyNpcs).label,
        firstObservedAtMs: Math.min(...events.map((event) => event.reportTimeMs)),
        lastObservedAtMs: Math.max(...events.map((event) => event.reportTimeMs)),
        eventCount: countUnder(state, events.length),
        amountAuthority: "RAW_AMOUNT_FIELD_SUM",
        rawAmountFieldSum: rawAmountFieldSumUnder(
          state,
          events.map((event) => event.raw.amountField),
        ),
        rawAmountMeaning: RAW_AMOUNT_MEANING,
        hitTypeRaw: collectionUnder(state, hitTypeCounts(events)),
      });
    }
  }
  cells.sort(
    (left, right) =>
      (left.sliceId < right.sliceId ? -1 : left.sliceId > right.sliceId ? 1 : 0) ||
      compareActorKeys(left.source, right.source) ||
      (left.abilityGameId ?? -1) - (right.abilityGameId ?? -1) ||
      (left.target === null ? -1 : right.target === null ? 1 : compareActorKeys(left.target, right.target)),
  );
  return {
    basis: basis.kind,
    slices,
    sourceActorIds: [...new Set(sourceActorIds)].sort((a, b) => a - b),
    cells: { items: cells, claim: allComplete ? "EXHAUSTIVE" : "OBSERVED_ONLY" },
  };
}

// ---------------------------------------------------------------------------
// Summaries and participation
// ---------------------------------------------------------------------------

export interface TargetParticipation {
  readonly target: ActorKey;
  readonly description: TargetDescription;
  readonly firstObservedHitMs: number;
  readonly lastObservedHitMs: number;
  readonly damageEventCount: Proven<number>;
  /** Source instances observed hitting it, sorted. */
  readonly sources: readonly ActorKey[];
}

export interface LabelSplit {
  readonly label: TargetLabel | "NO_TARGET_ACTOR";
  readonly damageEventCount: Proven<number>;
  readonly rawAmountFieldSum: Proven<RawFieldSum>;
}

export interface AbilityDamage {
  readonly abilityGameId: number | null;
  readonly damageEventCount: Proven<number>;
  readonly rawAmountFieldSum: Proven<RawFieldSum>;
}

/** One source set's observed damage over one slice: counts, raw sums, targets, splits. */
export interface DamageSummary {
  readonly sourceActorIds: readonly number[];
  readonly slice: { readonly startMs: number; readonly endMs: number };
  readonly state: FactState;
  readonly damageEventCount: Proven<number>;
  readonly amountAuthority: "RAW_AMOUNT_FIELD_SUM";
  readonly rawAmountFieldSum: Proven<RawFieldSum>;
  readonly rawAmountMeaning: typeof RAW_AMOUNT_MEANING;
  readonly hitTypeRaw: FactCollection<HitTypeRawCount>;
  readonly byAbility: FactCollection<AbilityDamage>;
  readonly byTargetLabel: FactCollection<LabelSplit>;
  /** Distinct target ActorKeys observed. */
  readonly distinctTargets: Proven<number>;
  readonly participation: FactCollection<TargetParticipation>;
}

export function summarizeDamage(
  fight: CombatFight,
  basis: EvidenceBasis,
  sourceActorIds: readonly number[],
  slice: { startMs: number; endMs: number },
  enemyNpcs: EnemyNpcList,
): DamageSummary {
  const events = damageFrom(fight, sourceActorIds, slice);
  const state = factStateOf(fight, basis, ["DAMAGE"], slice, sourceActorIds, true);
  const raw = (subset: readonly DamageObservation[]) =>
    rawAmountFieldSumUnder(
      state,
      subset.map((event) => event.raw.amountField),
    );

  const byAbilityMap = new Map<number | null, DamageObservation[]>();
  const byLabelMap = new Map<TargetLabel | "NO_TARGET_ACTOR", DamageObservation[]>();
  const byTarget = new Map<string, { key: ActorKey; events: DamageObservation[] }>();
  for (const event of events) {
    const ability = byAbilityMap.get(event.abilityGameId);
    if (ability === undefined) byAbilityMap.set(event.abilityGameId, [event]);
    else ability.push(event);
    const target = targetOf(event);
    const label =
      target === null ? "NO_TARGET_ACTOR" : describeTargetActor(fight, target.actorId, enemyNpcs).label;
    const labelled = byLabelMap.get(label);
    if (labelled === undefined) byLabelMap.set(label, [event]);
    else labelled.push(event);
    if (target !== null) {
      const key = actorKeyString(target);
      const entry = byTarget.get(key);
      if (entry === undefined) byTarget.set(key, { key: target, events: [event] });
      else entry.events.push(event);
    }
  }
  const participation: TargetParticipation[] = [...byTarget.values()]
    .map(({ key, events: hits }) => {
      const sources = new Map<string, ActorKey>();
      for (const hit of hits) {
        const source = sourceOf(hit);
        if (source !== null) sources.set(actorKeyString(source), source);
      }
      return {
        target: key,
        description: describeTargetActor(fight, key.actorId, enemyNpcs),
        firstObservedHitMs: Math.min(...hits.map((hit) => hit.reportTimeMs)),
        lastObservedHitMs: Math.max(...hits.map((hit) => hit.reportTimeMs)),
        damageEventCount: countUnder(state, hits.length),
        sources: [...sources.values()].sort(compareActorKeys),
      };
    })
    .sort((left, right) => compareActorKeys(left.target, right.target));

  return {
    sourceActorIds: [...new Set(sourceActorIds)].sort((a, b) => a - b),
    slice: { startMs: slice.startMs, endMs: slice.endMs },
    state,
    damageEventCount: countUnder(state, events.length),
    amountAuthority: "RAW_AMOUNT_FIELD_SUM",
    rawAmountFieldSum: raw(events),
    rawAmountMeaning: RAW_AMOUNT_MEANING,
    hitTypeRaw: collectionUnder(state, hitTypeCounts(events)),
    byAbility: collectionUnder(
      state,
      [...byAbilityMap]
        .map(([abilityGameId, hits]) => ({
          abilityGameId,
          damageEventCount: countUnder(state, hits.length),
          rawAmountFieldSum: raw(hits),
        }))
        .sort((left, right) => (left.abilityGameId ?? -1) - (right.abilityGameId ?? -1)),
    ),
    byTargetLabel: collectionUnder(
      state,
      [...byLabelMap]
        .map(([label, hits]) => ({
          label,
          damageEventCount: countUnder(state, hits.length),
          rawAmountFieldSum: raw(hits),
        }))
        .sort((left, right) => (left.label < right.label ? -1 : left.label > right.label ? 1 : 0)),
    ),
    distinctTargets: countUnder(state, participation.length),
    participation: collectionUnder(state, participation),
  };
}
