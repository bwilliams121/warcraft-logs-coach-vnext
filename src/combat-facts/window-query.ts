/**
 * One generic window aggregation over observed facts (M11-E1).
 *
 * A query names a half-open report-relative window `[startMs, endMs)` — an
 * event at exactly `endMs` is outside it — a source scope, optional filters,
 * and measures. Each measure carries ITS OWN coverage: complete cast coverage
 * never makes a damage measure exact, and complete player scope never makes an
 * owner view exact while an owned pet is not vouched for.
 *
 * It decides nothing. Not whether the window was good, whether more was
 * better, whether an aura's uptime sufficed, or whether anyone should copy
 * anyone. A cooldown window is supplied by a caller; this module does not
 * know which windows matter.
 *
 * SOURCE SCOPES
 *
 *   DIRECT_PLAYER   events whose source is the player actor itself
 *   SOURCE_ACTORS   events whose source is one of the named actors
 *   OWNER_ROLLUP    the owner's own events plus those of every actor whose
 *                   Warcraft Logs master data states `petOwner` = owner.
 *                   A factual grouping by STATED ownership — not a claim that
 *                   the pet's events "count toward" the owner in any gameplay
 *                   sense. Never includes an unstated or summon-inferred owner;
 *                   such sources, when observed, are disclosed instead.
 *
 * Every result keeps the per-source breakdown (by actor instance) and a
 * per-member total; the rollup total never replaces either.
 *
 * MEASURES
 *
 * Event counts are scalars: EXACT under COMPLETE coverage, AT_LEAST under
 * PARTIAL. Sets, distributions and sequences are `ObservedCollection`s:
 * EXHAUSTIVE under COMPLETE coverage, otherwise OBSERVED_ONLY — never "at
 * least" a set and never a prefix of a sequence. Raw-field sums are sums of ONE
 * raw v2 key, named for that key (`RAW_AMOUNT_FIELD_SUM` is the sum of the raw
 * `amount` scalar — not "damage done", which is NOT YET PROVEN, follow-up M1).
 * A raw sum reports the events that supplied the field and those that did
 * not; an absent field is never added as 0. No relation among raw fields is
 * assumed, and no field is substituted for another. When a reviewed mapping
 * is proven, it becomes one more measure over the same observations — not a
 * normalization change.
 */

import type { CombatFight } from "../engine/normalization/combat-fight.js";
import type { EvidenceLocator } from "../engine/evidence/locator.js";
import type { CastPhase, TickFieldState } from "../engine/normalization/normalized-events.js";
import type { EvidenceCategory } from "../wcl/evidence-capability.js";
import {
  catalogCoverage,
  combineCoverage,
  eventCategoryCoverage,
  observedCollection,
  observationsOnly,
  provenCount,
  type CategoryFactCoverage,
  type FactCoverage,
  type FactWindow,
  type ObservedCollection,
  type Proven,
} from "./coverage.js";
import { NO_ACTOR_SENTINEL } from "../engine/normalization/raw-event-fields.js";
import { actorsOwnedBy, bossSubtypeOf } from "./descriptors.js";
import {
  actorKeyString,
  compareActorKeys,
  observationsOf,
  sameActorKey,
  type ActorKey,
  type CastObservation,
  type DamageObservation,
  type ObservedSide,
  type RawDamageComponents,
} from "./observations.js";

// ---------------------------------------------------------------------------
// The query
// ---------------------------------------------------------------------------

export type SourceScope =
  | { readonly kind: "DIRECT_PLAYER"; readonly playerActorId: number }
  | { readonly kind: "SOURCE_ACTORS"; readonly actorIds: readonly number[] }
  | { readonly kind: "OWNER_ROLLUP"; readonly ownerActorId: number };

/** Raw-field sums, each over exactly one raw v2 key — named here as that key. */
export const RAW_FIELD_SUMS = {
  RAW_AMOUNT_FIELD_SUM: { rawField: "amount", select: (raw: RawDamageComponents) => raw.amountField },
  RAW_ABSORBED_FIELD_SUM: { rawField: "absorbed", select: (raw: RawDamageComponents) => raw.absorbedField },
  RAW_MITIGATED_FIELD_SUM: {
    rawField: "mitigated",
    select: (raw: RawDamageComponents) => raw.mitigatedField,
  },
  RAW_UNMITIGATED_AMOUNT_FIELD_SUM: {
    rawField: "unmitigatedAmount",
    select: (raw: RawDamageComponents) => raw.unmitigatedAmountField,
  },
  RAW_BLOCKED_FIELD_SUM: { rawField: "blocked", select: (raw: RawDamageComponents) => raw.blockedField },
  RAW_OVERKILL_FIELD_SUM: { rawField: "overkill", select: (raw: RawDamageComponents) => raw.overkillField },
} as const satisfies Record<
  string,
  { readonly rawField: string; readonly select: (raw: RawDamageComponents) => number | null }
>;

export type RawFieldSumMeasure = keyof typeof RAW_FIELD_SUMS;
export type RawFieldName = (typeof RAW_FIELD_SUMS)[RawFieldSumMeasure]["rawField"];

/**
 * The measures. Cast-family measures count or list cast EVENTS, per phase — a
 * `begincast` and its `cast` are two events that may describe one gameplay
 * cast, and nothing here merges them or calls them casts, actions or GCDs. A
 * reviewed later contract may derive gameplay actions from these events.
 */
export type Measure =
  | "CAST_BEGIN_EVENT_COUNT"
  | "CAST_COMPLETE_EVENT_COUNT"
  | "CAST_EVENT_SEQUENCE"
  | "DAMAGE_EVENT_COUNT"
  | RawFieldSumMeasure
  | "TICK_TRUE_COUNT"
  | "TICK_NOT_SUPPLIED_COUNT"
  | "HITTYPE_RAW_DISTRIBUTION"
  | "DISTINCT_TARGETS_OBSERVED";

export const MEASURES: readonly Measure[] = [
  "CAST_BEGIN_EVENT_COUNT",
  "CAST_COMPLETE_EVENT_COUNT",
  "CAST_EVENT_SEQUENCE",
  "DAMAGE_EVENT_COUNT",
  ...(Object.keys(RAW_FIELD_SUMS) as RawFieldSumMeasure[]),
  "TICK_TRUE_COUNT",
  "TICK_NOT_SUPPLIED_COUNT",
  "HITTYPE_RAW_DISTRIBUTION",
  "DISTINCT_TARGETS_OBSERVED",
];

export interface WindowQuery {
  readonly startMs: number;
  readonly endMs: number;
  readonly sourceScope: SourceScope;
  /** Ability ids to keep; `null` in the list keeps events with no ability. */
  readonly abilityGameIds?: readonly (number | null)[];
  /** Target actor instances to keep, matched exactly (instance `null` ≠ 0). */
  readonly targets?: readonly ActorKey[];
  /** Keep only targets catalogued with WCL subType Boss (metadata only). */
  readonly targetMetadata?: "WCL_BOSS_SUBTYPE";
  readonly measures: readonly Measure[];
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

export interface RawFieldSum {
  /** Exact integer sum of the values that were supplied. */
  readonly sumOfSuppliedValues: number;
  readonly eventsSupplyingField: number;
  /** Events where the key was absent — counted, never added as 0. */
  readonly eventsNotSupplyingField: number;
}

export interface HitTypeRawBucket {
  /** The raw numeric value, or `null` when the key was absent. No mapping. */
  readonly hitTypeRaw: number | null;
  /** Events observed with this raw value. Exhaustive only if the collection is. */
  readonly observedEventCount: number;
}

export type SequenceOrderStatus =
  /** No other event in the sequence shares this report time. */
  | "UNIQUE_TIMESTAMP"
  /** Ties at this report time are listed in RETRIEVAL order, which is not proven to be execution order. */
  | "RETRIEVAL_ORDER_NOT_PROVEN_AUTHORITATIVE";

/** One observed cast-family EVENT. Not a cast, an action or a GCD. */
export interface CastEventSequenceEntry {
  readonly reportTimeMs: number;
  readonly locator: EvidenceLocator;
  readonly source: ActorKey;
  readonly target: ObservedSide;
  readonly abilityGameId: number | null;
  readonly phase: CastPhase;
  readonly order: SequenceOrderStatus;
}

/**
 * One measure's value. Scalars are `Proven` (EXACT / AT_LEAST for counts only /
 * UNKNOWN); collections are `ObservedCollection`s, EXHAUSTIVE only under
 * COMPLETE coverage and otherwise OBSERVED_ONLY — never "at least" a set, a
 * map or a sequence.
 */
export type MeasureValue =
  | {
      readonly shape: "EVENT_COUNT";
      /** Which events were counted. */
      readonly eventFamily: "DAMAGE" | "CAST";
      /** The cast phase counted; `null` for damage events. */
      readonly castPhase: CastPhase | null;
      /** The raw `tick` state counted; `null` when not filtered by it. */
      readonly tickField: TickFieldState | null;
      readonly value: Proven<number>;
    }
  | { readonly shape: "RAW_FIELD_SUM"; readonly rawField: RawFieldName; readonly value: Proven<RawFieldSum> }
  | { readonly shape: "HITTYPE_RAW_DISTRIBUTION"; readonly buckets: ObservedCollection<HitTypeRawBucket> }
  | {
      readonly shape: "OBSERVED_TARGETS";
      /** Targets positively observed; "all targets" only when EXHAUSTIVE. Not "targets available". */
      readonly targets: ObservedCollection<ActorKey>;
      /** Events in scope that named no target actor — a count. */
      readonly eventsWithNoTargetActor: Proven<number>;
    }
  | { readonly shape: "CAST_EVENT_SEQUENCE"; readonly events: ObservedCollection<CastEventSequenceEntry> };

export interface SourceBreakdownEntry {
  readonly source: ActorKey;
  readonly value: MeasureValue;
}

export interface MemberTotal {
  readonly actorId: number;
  /** This member's own coverage: its own vouch, not the scope's. */
  readonly coverage: FactCoverage;
  readonly value: MeasureValue;
}

export interface MeasureResult {
  readonly measure: Measure;
  readonly coverage: FactCoverage;
  readonly total: MeasureValue;
  /** Per observed source instance; never replaced by the total. */
  readonly bySource: readonly SourceBreakdownEntry[];
  /** Per scope member (every instance of that actor). */
  readonly byMember: readonly MemberTotal[];
}

export type WindowQueryResult =
  | {
      readonly ok: true;
      readonly window: FactWindow;
      /** The resolved source scope, sorted. */
      readonly memberActorIds: readonly number[];
      /**
       * OWNER_ROLLUP only: source instances observed in the window whose
       * ownership Warcraft Logs did not state (a PET with no `petOwner`, or an
       * actor outside the catalog). NOT in the rollup, and not guessed into it.
       * Observed only: it never claims these are all such sources.
       */
      readonly unresolvedOwnershipObserved: ObservedCollection<ActorKey>;
      /** Sorted by measure. */
      readonly measures: readonly MeasureResult[];
    }
  | { readonly ok: false; readonly reason: "EMPTY_OR_INVERTED_WINDOW" | "NO_MEASURES" };

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

const CAST_MEASURES: ReadonlySet<Measure> = new Set([
  "CAST_BEGIN_EVENT_COUNT",
  "CAST_COMPLETE_EVENT_COUNT",
  "CAST_EVENT_SEQUENCE",
]);

function categoryOf(measure: Measure): EvidenceCategory {
  return CAST_MEASURES.has(measure) ? "CASTS" : "DAMAGE";
}

function membersOf(fight: CombatFight, scope: SourceScope): readonly number[] {
  switch (scope.kind) {
    case "DIRECT_PLAYER":
      return [scope.playerActorId];
    case "SOURCE_ACTORS":
      return [...new Set(scope.actorIds)].sort((left, right) => left - right);
    case "OWNER_ROLLUP":
      return [scope.ownerActorId, ...actorsOwnedBy(fight, scope.ownerActorId)].sort(
        (left, right) => left - right,
      );
  }
}

function inWindow(reportTimeMs: number, window: FactWindow): boolean {
  return reportTimeMs >= window.startMs && reportTimeMs < window.endMs;
}

function sourceKey(side: ObservedSide): ActorKey | null {
  return side.kind === "ACTOR" ? side.key : null;
}

function passesFilters(
  fight: CombatFight,
  query: WindowQuery,
  abilityGameId: number | null,
  target: ObservedSide,
): boolean {
  if (query.abilityGameIds !== undefined && !query.abilityGameIds.includes(abilityGameId)) return false;
  if (query.targets !== undefined) {
    if (target.kind !== "ACTOR") return false;
    const key = target.key;
    if (!query.targets.some((wanted) => sameActorKey(wanted, key))) return false;
  }
  if (query.targetMetadata === "WCL_BOSS_SUBTYPE") {
    if (target.kind !== "ACTOR") return false;
    if (bossSubtypeOf(fight, target.key.actorId) !== "WCL_BOSS_SUBTYPE") return false;
  }
  return true;
}

function checkedSum(values: readonly number[]): number | null {
  let total = 0;
  for (const value of values) {
    if (!Number.isSafeInteger(value)) return null;
    total += value;
    if (!Number.isSafeInteger(total)) return null;
  }
  return total;
}

function damageCount(
  coverage: FactCoverage,
  damage: readonly DamageObservation[],
  tickField: TickFieldState | null,
): MeasureValue {
  const counted = tickField === null ? damage : damage.filter((event) => event.tickField === tickField);
  return {
    shape: "EVENT_COUNT",
    eventFamily: "DAMAGE",
    castPhase: null,
    tickField,
    value: provenCount(coverage.state, counted.length),
  };
}

function castCount(
  coverage: FactCoverage,
  casts: readonly CastObservation[],
  castPhase: CastPhase,
): MeasureValue {
  return {
    shape: "EVENT_COUNT",
    eventFamily: "CAST",
    castPhase,
    tickField: null,
    value: provenCount(coverage.state, casts.filter((event) => event.phase === castPhase).length),
  };
}

/** The value of one measure over a set of observations, under one coverage. */
function valueOf(
  measure: Measure,
  coverage: FactCoverage,
  damage: readonly DamageObservation[],
  casts: readonly CastObservation[],
): MeasureValue {
  switch (measure) {
    case "CAST_BEGIN_EVENT_COUNT":
      return castCount(coverage, casts, "BEGIN");
    case "CAST_COMPLETE_EVENT_COUNT":
      return castCount(coverage, casts, "COMPLETE");
    case "DAMAGE_EVENT_COUNT":
      return damageCount(coverage, damage, null);
    case "TICK_TRUE_COUNT":
      return damageCount(coverage, damage, "TRUE");
    case "TICK_NOT_SUPPLIED_COUNT":
      return damageCount(coverage, damage, "NOT_SUPPLIED");
    case "HITTYPE_RAW_DISTRIBUTION": {
      const counts = new Map<number | null, number>();
      for (const event of damage) counts.set(event.hitTypeRaw, (counts.get(event.hitTypeRaw) ?? 0) + 1);
      const buckets: HitTypeRawBucket[] = [...counts]
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
      return { shape: "HITTYPE_RAW_DISTRIBUTION", buckets: observedCollection(coverage, buckets) };
    }
    case "DISTINCT_TARGETS_OBSERVED": {
      const byKey = new Map<string, ActorKey>();
      let eventsWithNoTargetActor = 0;
      for (const event of damage) {
        if (event.target.kind === "ACTOR") byKey.set(actorKeyString(event.target.key), event.target.key);
        else eventsWithNoTargetActor += 1;
      }
      return {
        shape: "OBSERVED_TARGETS",
        targets: observedCollection(coverage, [...byKey.values()].sort(compareActorKeys)),
        eventsWithNoTargetActor: provenCount(coverage.state, eventsWithNoTargetActor),
      };
    }
    case "CAST_EVENT_SEQUENCE": {
      const ordered = [...casts].sort(
        (left, right) =>
          left.reportTimeMs - right.reportTimeMs ||
          left.locator.ingestionOrdinal - right.locator.ingestionOrdinal,
      );
      const tied = new Map<number, number>();
      for (const cast of ordered) tied.set(cast.reportTimeMs, (tied.get(cast.reportTimeMs) ?? 0) + 1);
      const entries: CastEventSequenceEntry[] = ordered.map((cast) => ({
        reportTimeMs: cast.reportTimeMs,
        locator: cast.locator,
        source: (cast.source as Extract<ObservedSide, { kind: "ACTOR" }>).key,
        target: cast.target,
        abilityGameId: cast.abilityGameId,
        phase: cast.phase,
        order:
          (tied.get(cast.reportTimeMs) ?? 0) > 1
            ? "RETRIEVAL_ORDER_NOT_PROVEN_AUTHORITATIVE"
            : "UNIQUE_TIMESTAMP",
      }));
      return { shape: "CAST_EVENT_SEQUENCE", events: observedCollection(coverage, entries) };
    }
    default: {
      // A raw-field sum: EXACT under COMPLETE only. Under PARTIAL no lower
      // bound exists, because no raw field's sign is proven.
      const { rawField, select } = RAW_FIELD_SUMS[measure];
      const state = coverage.state;
      if (state === "PARTIAL") {
        return {
          shape: "RAW_FIELD_SUM",
          rawField,
          value: { kind: "UNKNOWN", reason: "FIELD_DOMAIN_NOT_PROVEN" },
        };
      }
      if (state !== "COMPLETE") {
        return {
          shape: "RAW_FIELD_SUM",
          rawField,
          value: { kind: "UNKNOWN", reason: "COVERAGE_INSUFFICIENT" },
        };
      }
      const supplied: number[] = [];
      let eventsNotSupplyingField = 0;
      for (const event of damage) {
        const value = select(event.raw);
        if (value === null) eventsNotSupplyingField += 1;
        else supplied.push(value);
      }
      const sum = checkedSum(supplied);
      if (sum === null) {
        return {
          shape: "RAW_FIELD_SUM",
          rawField,
          value: { kind: "UNKNOWN", reason: "UNSAFE_INTEGER_ARITHMETIC" },
        };
      }
      return {
        shape: "RAW_FIELD_SUM",
        rawField,
        value: {
          kind: "EXACT",
          value: { sumOfSuppliedValues: sum, eventsSupplyingField: supplied.length, eventsNotSupplyingField },
        },
      };
    }
  }
}

export function evaluateWindowQuery(fight: CombatFight, query: WindowQuery): WindowQueryResult {
  if (!(query.startMs < query.endMs)) return { ok: false, reason: "EMPTY_OR_INVERTED_WINDOW" };
  if (query.measures.length === 0) return { ok: false, reason: "NO_MEASURES" };

  const window: FactWindow = { startMs: query.startMs, endMs: query.endMs };
  const members = membersOf(fight, query.sourceScope);
  const memberSet = new Set(members);
  const needsCatalog = query.sourceScope.kind === "OWNER_ROLLUP" || query.targetMetadata !== undefined;

  const all = observationsOf(fight);
  const selectedDamage: DamageObservation[] = [];
  const selectedCasts: CastObservation[] = [];
  const unresolved = new Map<string, ActorKey>();

  const consider = (source: ObservedSide, reportTimeMs: number): ActorKey | null => {
    if (!inWindow(reportTimeMs, window)) return null;
    const key = sourceKey(source);
    if (key === null) return null;
    if (memberSet.has(key.actorId)) return key;
    if (query.sourceScope.kind === "OWNER_ROLLUP" && key.actorId !== NO_ACTOR_SENTINEL) {
      // Disclosed, never rolled up: a pet whose owner WCL did not state, or an
      // actor outside the catalog. An NPC with no owner is not disclosed — it is
      // not a candidate pet of anyone.
      const actor = fight.actors.get(key.actorId);
      if (actor === undefined || (actor.actorType === "PET" && actor.petOwnerActorId === null)) {
        unresolved.set(actorKeyString(key), key);
      }
    }
    return null;
  };
  for (const event of all.damage) {
    if (consider(event.source, event.reportTimeMs) === null) continue;
    if (passesFilters(fight, query, event.abilityGameId, event.target)) selectedDamage.push(event);
  }
  for (const event of all.casts) {
    if (consider(event.source, event.reportTimeMs) === null) continue;
    if (passesFilters(fight, query, event.abilityGameId, event.target)) selectedCasts.push(event);
  }

  const catalog = needsCatalog ? [catalogCoverage(fight)] : [];
  const coverageFor = (measure: Measure, actorIds: readonly number[]): FactCoverage =>
    combineCoverage([eventCategoryCoverage(fight, categoryOf(measure), window, actorIds), ...catalog]);

  const sourceKeys = new Map<string, ActorKey>();
  for (const event of [...selectedDamage, ...selectedCasts]) {
    const key = sourceKey(event.source);
    if (key !== null) sourceKeys.set(actorKeyString(key), key);
  }
  const orderedSources = [...sourceKeys.values()].sort(compareActorKeys);

  const measures = [...new Set(query.measures)].sort().map((measure): MeasureResult => {
    const coverage = coverageFor(measure, members);
    const forSource = (match: (key: ActorKey) => boolean) => ({
      damage: selectedDamage.filter((event) => {
        const key = sourceKey(event.source);
        return key !== null && match(key);
      }),
      casts: selectedCasts.filter((event) => {
        const key = sourceKey(event.source);
        return key !== null && match(key);
      }),
    });
    const bySource = orderedSources.map((source): SourceBreakdownEntry => {
      // An observed instance is attributed under its actor's own coverage.
      const own = coverageFor(measure, [source.actorId]);
      const subset = forSource((key) => sameActorKey(key, source));
      return { source, value: valueOf(measure, own, subset.damage, subset.casts) };
    });
    const byMember = members.map((actorId): MemberTotal => {
      const own = coverageFor(measure, [actorId]);
      const subset = forSource((key) => key.actorId === actorId);
      return { actorId, coverage: own, value: valueOf(measure, own, subset.damage, subset.casts) };
    });
    return {
      measure,
      coverage,
      total: valueOf(measure, coverage, selectedDamage, selectedCasts),
      bySource,
      byMember,
    };
  });

  return {
    ok: true,
    window,
    memberActorIds: members,
    unresolvedOwnershipObserved: observationsOnly([...unresolved.values()].sort(compareActorKeys)),
    measures,
  };
}

/** Re-exported for callers that only need the per-category view. */
export type { CategoryFactCoverage };
