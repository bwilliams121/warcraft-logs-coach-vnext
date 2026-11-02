/**
 * DAMAGE-DELTA DECOMPOSITION (M14-D): how the subject's damage figures differ
 * from each comparison fight's, broken down by component, as OBSERVATIONS.
 * Post-hoc, like the alignment it reads.
 *
 * It answers "where, by ability, target class, window and sub-actor, did the
 * figures differ?" and never "why". "Damage events per minute from ability X
 * were lower in the subject fight" is an observation; "the player did not
 * use X enough" is a causal claim this module cannot make: a delta with no
 * decision-level evidence stays an observation (CLAUDE.md "Damage Output
 * Diagnosis"; the link to decision evidence is M14-E).
 *
 * THREE MEASURES, NEVER MIXED
 *
 *   DAMAGE_EVENT_COUNT    observed damage events: EXACT under COMPLETE
 *                         coverage, AT_LEAST for an uncertified capture
 *                         (M11-G2), never "at least 0"
 *   RAW_AMOUNT_FIELD_SUM  the raw `amount` field per fight, shown as M11-G2
 *                         holds it. Its meaning is NOT_YET_PROVEN (follow-up
 *                         M1), so its delta is always UNKNOWN: a difference of
 *                         unproven fields is not a damage difference
 *   WCL_TABLE_AMOUNT      a Warcraft Logs-computed table amount over the whole
 *                         fight (the raid entry, its pets and target types,
 *                         and the per-actor DamageDone leaves where held). A
 *                         delta needs the SAME table surface on both sides and
 *                         the same log version (M11-G4-4: a table figure is
 *                         read under an evidenced log version)
 *
 *   A delta compares like with like: one measure, one component, one window.
 *   Nothing converts a count into an amount or a raw sum into a table amount.
 *
 * A DELTA IS EXACT, A BOUND OR UNKNOWN
 *
 *   subject EXACT  - comparison EXACT     EXACT
 *   subject EXACT  - comparison AT_LEAST  NO_MORE_THAN  (the comparison may be larger)
 *   subject AT_LEAST - comparison EXACT   NO_LESS_THAN
 *   anything else                         UNKNOWN, with the reason
 *
 *   A DIRECTION (SUBJECT_LOWER / SUBJECT_HIGHER / EQUAL) is stated only where
 *   the delta or its bound proves it, compared in exact integer arithmetic so
 *   no floating-point boundary decides it. Otherwise UNDECIDED.
 *
 * WINDOWS
 *
 *   WHOLE_FIGHT     each fight's recorded interval; rates use each fight's
 *                   own duration (a table's own stated duration for a table)
 *   ALIGNED_MOMENT  [landmark + from, landmark + to) through M14-A: only an
 *                   EXACT anchor places it, and a window outside the recorded
 *                   fight is UNKNOWN, never clipped. No table surface exists
 *                   for an aligned moment, so it carries no table rows.
 *
 * WHAT IT NEVER DOES
 *
 *   No mean, sum or "consensus" across comparison fights: each pair is its
 *   own delta. No residual: components are not claimed to explain a total,
 *   and an uncertified capture's component list is OBSERVED_ONLY. No
 *   ranking, no causal claim, no finding effect.
 *
 * POST-HOC. Nothing on the authority branch imports it
 * (tests/contracts/m11g2-comparison-facts-layering.test.ts).
 */

import type { CombatFight } from "../engine/normalization/combat-fight.js";
import type { Proven } from "../combat-facts/coverage.js";
import { actorsOwnedBy } from "../combat-facts/descriptors.js";
import type { DamageObservation } from "../combat-facts/observations.js";
import type { RawFieldSum } from "../combat-facts/window-query.js";
import { damageFrom } from "./damage-ledger.js";
import {
  countUnder,
  factStateOf,
  rawAmountFieldSumUnder,
  RAW_AMOUNT_MEANING,
  type FactCollectionClaim,
} from "./evidence-basis.js";
import type { ComparisonFightInput, PostHocDefinition } from "./fight-facts.js";
import { describeTargetActor, type TargetLabel } from "./target-classification.js";
import {
  alignFights,
  factsAtAlignedMoment,
  type AlignmentInput,
  type MomentOffsets,
} from "./timing-alignment.js";

export type DeltaMeasure = "DAMAGE_EVENT_COUNT" | "RAW_AMOUNT_FIELD_SUM" | "WCL_TABLE_AMOUNT";

export type DeltaDimension = "TOTAL" | "BY_SOURCE" | "BY_ABILITY" | "BY_TARGET_CLASS" | "BY_WCL_TARGET_TYPE";

/**
 * A comparable target class. The subject's enemy list is not held, so the
 * enemy-listed and other non-boss NPC labels are merged: a class must mean the
 * same thing in every fight.
 */
export type TargetClass = "BOSS_SUBTYPE" | "NON_BOSS_NPC" | "PLAYER_TARGET" | "OTHER_TARGET";

/** `FOCUS`, a definition-named sub-actor kind, or UNCLASSIFIED_OWNED_ACTOR. */
export type SourceKind = string;

export type DeltaComponent =
  | { readonly dimension: "TOTAL" }
  | { readonly dimension: "BY_SOURCE"; readonly sourceKind: SourceKind }
  | {
      readonly dimension: "BY_ABILITY";
      readonly sourceKind: SourceKind;
      readonly abilityGameId: number | null;
    }
  | { readonly dimension: "BY_TARGET_CLASS"; readonly targetClass: TargetClass }
  | { readonly dimension: "BY_WCL_TARGET_TYPE"; readonly wclTargetType: string };

export type FigureUnknownReason =
  | "ANCHOR_NOT_EXACT"
  | "ANCHOR_UNKNOWN"
  | "WINDOW_OUTSIDE_RECORDED_FIGHT"
  | "NO_RAID_ENTRY"
  | "NO_PER_ACTOR_TABLE"
  | "NOT_LISTED_IN_TABLE"
  | "TABLE_STATES_NO_FOCUS_ONLY_AMOUNT"
  | "TABLE_DURATION_NOT_HELD"
  | Extract<Proven<number>, { kind: "UNKNOWN" }>["reason"];

export type FigureValue =
  | { readonly kind: "EXACT" | "AT_LEAST"; readonly value: number }
  | { readonly kind: "UNKNOWN"; readonly reason: FigureUnknownReason };

export interface FightFigure {
  readonly fightRef: string;
  readonly value: FigureValue;
  /** The duration a rate divides by: the window's, or the table's own. `null` when not held. */
  readonly durationMs: number | null;
  /** value × 60000 / durationMs, with the value's own state. */
  readonly perMinute: FigureValue;
  /** RAW_AMOUNT_FIELD_SUM only: the raw sum as M11-G2 holds it. */
  readonly rawAmountFieldSum?: Proven<RawFieldSum>;
}

export type DeltaUnknownReason =
  | "SUBJECT_FIGURE_UNKNOWN"
  | "COMPARISON_FIGURE_UNKNOWN"
  | "BOTH_FIGURES_LOWER_BOUNDS"
  | "RAW_AMOUNT_MEANING_NOT_PROVEN"
  | "LOG_VERSION_DIFFERS";

export type DeltaValue =
  | { readonly kind: "EXACT" | "NO_MORE_THAN" | "NO_LESS_THAN"; readonly value: number }
  | { readonly kind: "UNKNOWN"; readonly reason: DeltaUnknownReason };

export type DeltaDirection = "SUBJECT_LOWER" | "SUBJECT_HIGHER" | "EQUAL" | "UNDECIDED";

export interface PairDelta {
  readonly comparisonFightRef: string;
  readonly comparison: FightFigure;
  /** subject − comparison. */
  readonly absolute: DeltaValue;
  readonly perMinute: DeltaValue;
  /** Of the per-minute rates; stated only where the delta or its bound proves it. */
  readonly perMinuteDirection: DeltaDirection;
}

export type MeasureAuthority =
  "OBSERVED_DAMAGE_EVENTS" | "RAW_AMOUNT_FIELD_SUM" | "WCL_RAID_DAMAGE_DONE_TABLE" | "WCL_DAMAGE_DONE_TABLE";

export interface DeltaRow {
  /** `<windowId>|<measure>|<componentKey>`. */
  readonly rowId: string;
  readonly windowId: string;
  readonly measure: DeltaMeasure;
  readonly authority: MeasureAuthority;
  readonly componentKey: string;
  readonly component: DeltaComponent;
  readonly subject: FightFigure;
  /** One per comparison fight, in input order. Never combined. */
  readonly pairs: readonly PairDelta[];
}

export interface AlignedWindowRequest {
  readonly windowId: string;
  readonly landmarkId: string;
  readonly offsets: MomentOffsets;
}

export type WindowSlice =
  | { readonly fightRef: string; readonly kind: "SLICED"; readonly startMs: number; readonly endMs: number }
  | {
      readonly fightRef: string;
      readonly kind: "UNKNOWN";
      readonly reason: "ANCHOR_NOT_EXACT" | "ANCHOR_UNKNOWN" | "WINDOW_OUTSIDE_RECORDED_FIGHT";
    };

export interface DecomposedWindow {
  readonly windowId: string;
  readonly kind: "WHOLE_FIGHT" | "ALIGNED_MOMENT";
  readonly landmarkId: string | null;
  readonly offsets: MomentOffsets | null;
  readonly slices: readonly WindowSlice[];
  /**
   * Per fight: whether its observed components are every component of the
   * window (EXHAUSTIVE) or only those observed (OBSERVED_ONLY). An
   * OBSERVED_ONLY fight may hold components no row names.
   */
  readonly componentLists: readonly {
    readonly fightRef: string;
    readonly claim: FactCollectionClaim | null;
  }[];
}

export type DecompositionRefusal =
  "ALIGNMENT_REFUSED" | "DUPLICATE_WINDOW_ID" | "RESERVED_WINDOW_ID" | "UNKNOWN_LANDMARK" | "INVALID_OFFSETS";

export type DamageDeltaDecomposition =
  | {
      readonly kind: "DECOMPOSED";
      readonly encounterId: number;
      readonly difficulty: number;
      readonly subjectFightRef: string;
      readonly comparisonFightRefs: readonly string[];
      readonly windows: readonly DecomposedWindow[];
      readonly rows: readonly DeltaRow[];
      readonly rawAmountMeaning: typeof RAW_AMOUNT_MEANING;
      /** M11-G2: comparison counts stay AT_LEAST; nothing here certifies a capture. */
      readonly comparisonCoverage: "AT_LEAST_UNCERTIFIED";
      readonly use: "OBSERVATION_ONLY";
      readonly causalClaim: "NONE";
      readonly acrossComparisons: "NOT_COMBINED";
      readonly residual: "NOT_COMPUTED";
      readonly findingEffect: { readonly suppression: "NONE"; readonly confidence: "NONE" };
    }
  | { readonly kind: "REFUSED"; readonly reason: DecompositionRefusal };

export const WHOLE_FIGHT_WINDOW_ID = "WHOLE_FIGHT";

const MEASURES: readonly DeltaMeasure[] = ["DAMAGE_EVENT_COUNT", "RAW_AMOUNT_FIELD_SUM", "WCL_TABLE_AMOUNT"];
const DIMENSIONS: readonly DeltaDimension[] = [
  "TOTAL",
  "BY_SOURCE",
  "BY_ABILITY",
  "BY_TARGET_CLASS",
  "BY_WCL_TARGET_TYPE",
];
const FOCUS: SourceKind = "FOCUS";
const UNCLASSIFIED: SourceKind = "UNCLASSIFIED_OWNED_ACTOR";

export function componentKeyOf(component: DeltaComponent): string {
  switch (component.dimension) {
    case "TOTAL":
      return "TOTAL";
    case "BY_SOURCE":
      return `BY_SOURCE:${component.sourceKind}`;
    case "BY_ABILITY":
      return `BY_ABILITY:${component.sourceKind}:${component.abilityGameId === null ? "none" : String(component.abilityGameId)}`;
    case "BY_TARGET_CLASS":
      return `BY_TARGET_CLASS:${component.targetClass}`;
    case "BY_WCL_TARGET_TYPE":
      return `BY_WCL_TARGET_TYPE:${component.wclTargetType}`;
  }
}

function compareComponents(left: DeltaComponent, right: DeltaComponent): number {
  const byDimension = DIMENSIONS.indexOf(left.dimension) - DIMENSIONS.indexOf(right.dimension);
  if (byDimension !== 0) return byDimension;
  if (left.dimension === "BY_ABILITY" && right.dimension === "BY_ABILITY") {
    if (left.sourceKind !== right.sourceKind) return left.sourceKind < right.sourceKind ? -1 : 1;
    return (left.abilityGameId ?? -1) - (right.abilityGameId ?? -1);
  }
  const a = componentKeyOf(left);
  const b = componentKeyOf(right);
  return a < b ? -1 : a > b ? 1 : 0;
}

function targetClassOf(label: TargetLabel | "NO_TARGET_ACTOR"): TargetClass {
  switch (label) {
    case "WCL_BOSS_SUBTYPE":
      return "BOSS_SUBTYPE";
    case "WCL_ENEMY_NPC_CLASSIFIED":
    case "OBSERVED_NPC_OTHER":
      return "NON_BOSS_NPC";
    case "OBSERVED_PLAYER_TARGET":
      return "PLAYER_TARGET";
    default:
      return "OTHER_TARGET";
  }
}

/** The focus or the definition kind of one of its owned actors, by catalog game id. */
function sourceKindResolver(
  fight: CombatFight,
  focusActorId: number,
  definition: PostHocDefinition,
): (actorId: number) => SourceKind {
  return (actorId) => {
    if (actorId === focusActorId) return FOCUS;
    const gameId = fight.actors.get(actorId)?.gameId ?? null;
    return (
      definition.subActorKinds.find((entry) => gameId !== null && entry.gameIds.includes(gameId))?.kind ??
      UNCLASSIFIED
    );
  };
}

// ---------------------------------------------------------------------------
// Per-fight figures
// ---------------------------------------------------------------------------

interface FightComponents {
  readonly claim: FactCollectionClaim;
  readonly components: ReadonlyMap<string, DeltaComponent>;
  figureOf(component: DeltaComponent): { readonly count: Proven<number>; readonly raw: Proven<RawFieldSum> };
}

/** The observed damage of the focus and its owned actors over one slice, per component. */
function eventComponents(
  input: ComparisonFightInput,
  definition: PostHocDefinition,
  slice: { readonly startMs: number; readonly endMs: number },
): FightComponents {
  const { fight, basis, focusActorId, enemyNpcs } = input;
  const tree = [focusActorId, ...actorsOwnedBy(fight, focusActorId)];
  const state = factStateOf(fight, basis, ["DAMAGE"], slice, tree, true);
  const kindOf = sourceKindResolver(fight, focusActorId, definition);
  const groups = new Map<string, DamageObservation[]>();
  const components = new Map<string, DeltaComponent>();
  const add = (component: DeltaComponent, event: DamageObservation): void => {
    const key = componentKeyOf(component);
    components.set(key, component);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [event]);
    else group.push(event);
  };
  for (const event of damageFrom(fight, tree, slice)) {
    if (event.source.kind !== "ACTOR") continue;
    const sourceKind = kindOf(event.source.key.actorId);
    const label =
      event.target.kind === "ACTOR"
        ? describeTargetActor(fight, event.target.key.actorId, enemyNpcs).label
        : "NO_TARGET_ACTOR";
    add({ dimension: "TOTAL" }, event);
    add({ dimension: "BY_SOURCE", sourceKind }, event);
    add({ dimension: "BY_ABILITY", sourceKind, abilityGameId: event.abilityGameId }, event);
    add({ dimension: "BY_TARGET_CLASS", targetClass: targetClassOf(label) }, event);
  }
  components.set("TOTAL", { dimension: "TOTAL" });
  return {
    claim: state.state === "COMPLETE" ? "EXHAUSTIVE" : "OBSERVED_ONLY",
    components,
    figureOf(component) {
      const events = groups.get(componentKeyOf(component)) ?? [];
      return {
        count: countUnder(state, events.length),
        raw: rawAmountFieldSumUnder(
          state,
          events.map((event) => event.raw.amountField),
        ),
      };
    },
  };
}

interface TableFigures {
  readonly components: ReadonlyMap<string, DeltaComponent>;
  figureOf(component: DeltaComponent): {
    readonly value: FigureValue;
    readonly durationMs: number | null;
    readonly authority: MeasureAuthority;
  };
}

/** The whole-fight Warcraft Logs table amounts held for one fight, per component. */
function tableFigures(input: ComparisonFightInput, definition: PostHocDefinition): TableFigures {
  const { fight, focusActorId, wcl } = input;
  const kindOf = sourceKindResolver(fight, focusActorId, definition);
  const components = new Map<string, DeltaComponent>();
  const amounts = new Map<string, number>();
  const put = (component: DeltaComponent, total: number): void => {
    const key = componentKeyOf(component);
    components.set(key, component);
    amounts.set(key, (amounts.get(key) ?? 0) + total);
  };
  const raid = wcl.raidEntry;
  if (raid !== null) {
    put({ dimension: "TOTAL" }, raid.total);
    // The raid entry's total includes the pets; it states no focus-only amount.
    components.set(componentKeyOf({ dimension: "BY_SOURCE", sourceKind: FOCUS }), {
      dimension: "BY_SOURCE",
      sourceKind: FOCUS,
    });
    for (const pet of raid.pets) put({ dimension: "BY_SOURCE", sourceKind: kindOf(pet.actorId) }, pet.total);
    for (const entry of raid.targetTypes)
      put({ dimension: "BY_WCL_TARGET_TYPE", wclTargetType: entry.type }, entry.total);
  }
  const focusTable = wcl.tables?.damageDone.get(focusActorId);
  if (focusTable !== undefined) {
    for (const leaf of focusTable.leaves) {
      put(
        {
          dimension: "BY_ABILITY",
          sourceKind: kindOf(leaf.actorId ?? focusActorId),
          abilityGameId: leaf.abilityGameId,
        },
        leaf.total,
      );
    }
  }
  const positive = (ms: number | null | undefined): number | null =>
    ms !== null && ms !== undefined && Number.isSafeInteger(ms) && ms > 0 ? ms : null;
  return {
    components,
    figureOf(component) {
      const key = componentKeyOf(component);
      if (component.dimension === "BY_ABILITY") {
        const authority = "WCL_DAMAGE_DONE_TABLE" as const;
        if (focusTable === undefined)
          return { value: { kind: "UNKNOWN", reason: "NO_PER_ACTOR_TABLE" }, durationMs: null, authority };
        const durationMs = positive(focusTable.totalTimeMs);
        const total = amounts.get(key);
        return {
          value:
            total === undefined
              ? { kind: "UNKNOWN", reason: "NOT_LISTED_IN_TABLE" }
              : durationMs === null
                ? { kind: "UNKNOWN", reason: "TABLE_DURATION_NOT_HELD" }
                : { kind: "EXACT", value: total },
          durationMs,
          authority,
        };
      }
      const authority = "WCL_RAID_DAMAGE_DONE_TABLE" as const;
      if (raid === null)
        return { value: { kind: "UNKNOWN", reason: "NO_RAID_ENTRY" }, durationMs: null, authority };
      const durationMs = positive(wcl.raidTotalTimeMs);
      if (component.dimension === "BY_SOURCE" && component.sourceKind === FOCUS)
        return {
          value: { kind: "UNKNOWN", reason: "TABLE_STATES_NO_FOCUS_ONLY_AMOUNT" },
          durationMs,
          authority,
        };
      const total = amounts.get(key);
      return {
        value:
          total === undefined
            ? { kind: "UNKNOWN", reason: "NOT_LISTED_IN_TABLE" }
            : durationMs === null
              ? { kind: "UNKNOWN", reason: "TABLE_DURATION_NOT_HELD" }
              : { kind: "EXACT", value: total },
        durationMs,
        authority,
      };
    },
  };
}

function perMinuteOf(value: FigureValue, durationMs: number | null): FigureValue {
  if (value.kind === "UNKNOWN") return value;
  if (durationMs === null) return { kind: "UNKNOWN", reason: "TABLE_DURATION_NOT_HELD" };
  return { kind: value.kind, value: (value.value * 60_000) / durationMs };
}

function figureOfCount(fightRef: string, count: Proven<number>, durationMs: number | null): FightFigure {
  const value: FigureValue = count.kind === "UNKNOWN" ? { kind: "UNKNOWN", reason: count.reason } : count;
  return { fightRef, value, durationMs, perMinute: perMinuteOf(value, durationMs) };
}

function unknownFigure(fightRef: string, reason: FigureUnknownReason): FightFigure {
  return {
    fightRef,
    value: { kind: "UNKNOWN", reason },
    durationMs: null,
    perMinute: { kind: "UNKNOWN", reason },
  };
}

// ---------------------------------------------------------------------------
// Deltas
// ---------------------------------------------------------------------------

/**
 * Exact sign of a/da − b/db, as integers: never decided by a floating-point
 * boundary. `null` when an operand is not a safe integer.
 */
function rateSign(a: number, da: number, b: number, db: number): -1 | 0 | 1 | null {
  if (![a, da, b, db].every(Number.isSafeInteger)) return null;
  const left = BigInt(a) * BigInt(db);
  const right = BigInt(b) * BigInt(da);
  return left < right ? -1 : left > right ? 1 : 0;
}

function deltaOf(subject: FigureValue, comparison: FigureValue): DeltaValue {
  if (subject.kind === "UNKNOWN") return { kind: "UNKNOWN", reason: "SUBJECT_FIGURE_UNKNOWN" };
  if (comparison.kind === "UNKNOWN") return { kind: "UNKNOWN", reason: "COMPARISON_FIGURE_UNKNOWN" };
  const value = subject.value - comparison.value;
  if (subject.kind === "EXACT" && comparison.kind === "EXACT") return { kind: "EXACT", value };
  if (subject.kind === "EXACT") return { kind: "NO_MORE_THAN", value };
  if (comparison.kind === "EXACT") return { kind: "NO_LESS_THAN", value };
  return { kind: "UNKNOWN", reason: "BOTH_FIGURES_LOWER_BOUNDS" };
}

function directionOf(subject: FightFigure, comparison: FightFigure, perMinute: DeltaValue): DeltaDirection {
  if (perMinute.kind === "UNKNOWN") return "UNDECIDED";
  if (subject.value.kind === "UNKNOWN" || comparison.value.kind === "UNKNOWN") return "UNDECIDED";
  if (subject.durationMs === null || comparison.durationMs === null) return "UNDECIDED";
  const sign = rateSign(
    subject.value.value,
    subject.durationMs,
    comparison.value.value,
    comparison.durationMs,
  );
  if (sign === null) return "UNDECIDED";
  if (perMinute.kind === "EXACT") return sign < 0 ? "SUBJECT_LOWER" : sign > 0 ? "SUBJECT_HIGHER" : "EQUAL";
  // A bound decides only a strict inequality on its own side.
  if (perMinute.kind === "NO_MORE_THAN") return sign < 0 ? "SUBJECT_LOWER" : "UNDECIDED";
  return sign > 0 ? "SUBJECT_HIGHER" : "UNDECIDED";
}

function pairOf(
  measure: DeltaMeasure,
  subject: FightFigure,
  comparison: FightFigure,
  logVersions: { readonly subject: number; readonly comparison: number },
): PairDelta {
  const refuse = (reason: DeltaUnknownReason): PairDelta => ({
    comparisonFightRef: comparison.fightRef,
    comparison,
    absolute: { kind: "UNKNOWN", reason },
    perMinute: { kind: "UNKNOWN", reason },
    perMinuteDirection: "UNDECIDED",
  });
  if (measure === "RAW_AMOUNT_FIELD_SUM") return refuse("RAW_AMOUNT_MEANING_NOT_PROVEN");
  if (
    measure === "WCL_TABLE_AMOUNT" &&
    subject.value.kind !== "UNKNOWN" &&
    comparison.value.kind !== "UNKNOWN" &&
    logVersions.subject !== logVersions.comparison
  )
    return refuse("LOG_VERSION_DIFFERS");
  const perMinute = deltaOf(subject.perMinute, comparison.perMinute);
  return {
    comparisonFightRef: comparison.fightRef,
    comparison,
    absolute: deltaOf(subject.value, comparison.value),
    perMinute,
    perMinuteDirection: directionOf(subject, comparison, perMinute),
  };
}

// ---------------------------------------------------------------------------
// The decomposition
// ---------------------------------------------------------------------------

const AUTHORITY: Record<Exclude<DeltaMeasure, "WCL_TABLE_AMOUNT">, MeasureAuthority> = {
  DAMAGE_EVENT_COUNT: "OBSERVED_DAMAGE_EVENTS",
  RAW_AMOUNT_FIELD_SUM: "RAW_AMOUNT_FIELD_SUM",
};

/**
 * Decompose the subject-versus-comparison damage differences, per pair, over
 * the whole fight and any requested aligned moments.
 *
 * Like `factsAtAlignedMoment`, the alignment is recomputed from these inputs
 * and never accepted from the caller.
 */
export function decomposeDamageDeltas(
  input: AlignmentInput,
  definition: PostHocDefinition,
  alignedWindows: readonly AlignedWindowRequest[] = [],
): DamageDeltaDecomposition {
  const ids = new Set<string>();
  for (const request of alignedWindows) {
    if (request.windowId === WHOLE_FIGHT_WINDOW_ID) return { kind: "REFUSED", reason: "RESERVED_WINDOW_ID" };
    if (ids.has(request.windowId)) return { kind: "REFUSED", reason: "DUPLICATE_WINDOW_ID" };
    ids.add(request.windowId);
  }
  const alignment = alignFights(input, definition);
  if (alignment.kind === "REFUSED") return { kind: "REFUSED", reason: "ALIGNMENT_REFUSED" };
  const fights = [input.subject, ...input.comparisons];

  const windows: DecomposedWindow[] = [];
  const rows: DeltaRow[] = [];

  const emit = (
    windowId: string,
    measure: DeltaMeasure,
    perFight: readonly {
      readonly components: ReadonlyMap<string, DeltaComponent>;
      readonly figure: (component: DeltaComponent) => { figure: FightFigure; authority: MeasureAuthority };
    }[],
  ): void => {
    const union = new Map<string, DeltaComponent>();
    for (const entry of perFight) for (const [key, component] of entry.components) union.set(key, component);
    for (const component of [...union.values()].sort(compareComponents)) {
      const figures = perFight.map((entry) => entry.figure(component));
      const subject = figures[0] as (typeof figures)[number];
      rows.push({
        rowId: `${windowId}|${measure}|${componentKeyOf(component)}`,
        windowId,
        measure,
        authority: subject.authority,
        componentKey: componentKeyOf(component),
        component,
        subject: subject.figure,
        pairs: figures.slice(1).map((entry, index) =>
          pairOf(measure, subject.figure, entry.figure, {
            subject: input.subject.fight.data.logVersion,
            comparison: (input.comparisons[index] as ComparisonFightInput).fight.data.logVersion,
          }),
        ),
      });
    }
  };

  const eventRows = (
    windowId: string,
    slices: readonly WindowSlice[],
  ): DecomposedWindow["componentLists"] => {
    const perFight = fights.map((entry, index) => {
      const slice = slices[index] as WindowSlice;
      if (slice.kind === "UNKNOWN") return { entry, slice, components: null };
      return { entry, slice, components: eventComponents(entry, definition, slice) };
    });
    for (const measure of ["DAMAGE_EVENT_COUNT", "RAW_AMOUNT_FIELD_SUM"] as const) {
      emit(
        windowId,
        measure,
        perFight.map(({ entry, slice, components }) => ({
          components: components?.components ?? new Map(),
          figure: (component) => {
            const authority = AUTHORITY[measure];
            if (slice.kind === "UNKNOWN")
              return { figure: unknownFigure(entry.fightRef, slice.reason), authority };
            if (components === null)
              return { figure: unknownFigure(entry.fightRef, "ANCHOR_UNKNOWN"), authority };
            const durationMs = slice.endMs - slice.startMs;
            const held = components.figureOf(component);
            if (measure === "DAMAGE_EVENT_COUNT")
              return { figure: figureOfCount(entry.fightRef, held.count, durationMs), authority };
            const value: FigureValue =
              held.raw.kind === "UNKNOWN"
                ? { kind: "UNKNOWN", reason: held.raw.reason }
                : { kind: held.raw.kind, value: held.raw.value.sumOfSuppliedValues };
            return {
              figure: {
                fightRef: entry.fightRef,
                value,
                durationMs,
                perMinute: perMinuteOf(value, durationMs),
                rawAmountFieldSum: held.raw,
              },
              authority,
            };
          },
        })),
      );
    }
    return perFight.map(({ entry, components }) => ({
      fightRef: entry.fightRef,
      claim: components?.claim ?? null,
    }));
  };

  // ---- The whole fight ----
  const wholeSlices: WindowSlice[] = fights.map((entry) => ({
    fightRef: entry.fightRef,
    kind: "SLICED",
    startMs: entry.fight.fight.startTimeMs,
    endMs: entry.fight.fight.endTimeMs,
  }));
  const wholeLists = eventRows(WHOLE_FIGHT_WINDOW_ID, wholeSlices);
  const tables = fights.map((entry) => ({ entry, tables: tableFigures(entry, definition) }));
  emit(
    WHOLE_FIGHT_WINDOW_ID,
    "WCL_TABLE_AMOUNT",
    tables.map(({ entry, tables: held }) => ({
      components: held.components,
      figure: (component) => {
        const { value, durationMs, authority } = held.figureOf(component);
        return {
          figure: { fightRef: entry.fightRef, value, durationMs, perMinute: perMinuteOf(value, durationMs) },
          authority,
        };
      },
    })),
  );
  windows.push({
    windowId: WHOLE_FIGHT_WINDOW_ID,
    kind: "WHOLE_FIGHT",
    landmarkId: null,
    offsets: null,
    slices: wholeSlices,
    componentLists: wholeLists,
  });

  // ---- Aligned moments ----
  for (const request of alignedWindows) {
    const moment = factsAtAlignedMoment(input, definition, request.landmarkId, request.offsets);
    if (moment.kind === "REFUSED")
      return {
        kind: "REFUSED",
        reason:
          moment.reason === "INVALID_OFFSETS"
            ? "INVALID_OFFSETS"
            : moment.reason === "UNKNOWN_LANDMARK"
              ? "UNKNOWN_LANDMARK"
              : "ALIGNMENT_REFUSED",
      };
    const slices: WindowSlice[] = moment.fights.map((entry) =>
      entry.kind === "SLICED"
        ? {
            fightRef: entry.fightRef,
            kind: "SLICED",
            startMs: entry.window.startMs,
            endMs: entry.window.endMs,
          }
        : { fightRef: entry.fightRef, kind: "UNKNOWN", reason: entry.reason },
    );
    const lists = eventRows(request.windowId, slices);
    windows.push({
      windowId: request.windowId,
      kind: "ALIGNED_MOMENT",
      landmarkId: request.landmarkId,
      offsets: request.offsets,
      slices,
      componentLists: lists,
    });
  }

  rows.sort((left, right) => {
    const byWindow =
      windows.findIndex((w) => w.windowId === left.windowId) -
      windows.findIndex((w) => w.windowId === right.windowId);
    if (byWindow !== 0) return byWindow;
    const byMeasure = MEASURES.indexOf(left.measure) - MEASURES.indexOf(right.measure);
    return byMeasure !== 0 ? byMeasure : compareComponents(left.component, right.component);
  });

  return {
    kind: "DECOMPOSED",
    encounterId: alignment.encounterId,
    difficulty: alignment.difficulty,
    subjectFightRef: input.subject.fightRef,
    comparisonFightRefs: input.comparisons.map((entry) => entry.fightRef),
    windows,
    rows,
    rawAmountMeaning: RAW_AMOUNT_MEANING,
    comparisonCoverage: "AT_LEAST_UNCERTIFIED",
    use: "OBSERVATION_ONLY",
    causalClaim: "NONE",
    acrossComparisons: "NOT_COMBINED",
    residual: "NOT_COMPUTED",
    findingEffect: { suppression: "NONE", confidence: "NONE" },
  };
}

// ---------------------------------------------------------------------------
// Observation wording
// ---------------------------------------------------------------------------

const MEASURE_WORDS: Record<DeltaMeasure, string> = {
  DAMAGE_EVENT_COUNT: "damage events per minute",
  RAW_AMOUNT_FIELD_SUM: "raw amount field per minute",
  WCL_TABLE_AMOUNT: "Warcraft Logs table damage per minute",
};

function componentWords(component: DeltaComponent, abilityNames: ReadonlyMap<number, string>): string {
  const ability = (id: number | null) =>
    id === null ? "events naming no ability" : (abilityNames.get(id) ?? `ability ${String(id)}`);
  switch (component.dimension) {
    case "TOTAL":
      return "Total";
    case "BY_SOURCE":
      return component.sourceKind === FOCUS ? "Focus-own" : component.sourceKind;
    case "BY_ABILITY":
      return component.sourceKind === FOCUS
        ? ability(component.abilityGameId)
        : `${component.sourceKind} ${ability(component.abilityGameId)}`;
    case "BY_TARGET_CLASS":
      return `${component.targetClass} target`;
    case "BY_WCL_TARGET_TYPE":
      return `Target type ${component.wclTargetType}`;
  }
}

/**
 * One factual sentence for a pair, only where the direction is proven, e.g.
 * "Rupture damage events per minute were lower in S than in C1." `null` when
 * UNDECIDED: an undecided delta has no sentence. The sentence states a
 * difference in a figure; it names no cause and no action.
 */
export function observationSentence(
  row: DeltaRow,
  pair: PairDelta,
  subjectLabel: string,
  abilityNames: ReadonlyMap<number, string> = new Map(),
): string | null {
  if (pair.perMinuteDirection === "UNDECIDED") return null;
  const subject = `${componentWords(row.component, abilityNames)} ${MEASURE_WORDS[row.measure]}`;
  const verb = row.measure === "DAMAGE_EVENT_COUNT" ? "were" : "was";
  if (pair.perMinuteDirection === "EQUAL")
    return `${subject} ${verb} equal in ${subjectLabel} and ${pair.comparisonFightRef}.`;
  const relation = pair.perMinuteDirection === "SUBJECT_LOWER" ? "lower" : "higher";
  return `${subject} ${verb} ${relation} in ${subjectLabel} than in ${pair.comparisonFightRef}.`;
}
