/**
 * The shared cast and channel decision anchor (ONB-S4).
 *
 * WHAT IT ANSWERS
 *
 * For one actor's observed foreground casts:
 *
 *     WHEN was each action decided?       its decision anchor
 *     WAS the actor casting at instant t? its cast occupancy
 *
 * An instant action is decided when it lands, so its anchor is the observed
 * `cast`. A cast-time action is decided when the cast BEGINS, so its anchor
 * is the observed `begincast` that the completion pairs with — or, when no
 * begin can be observed, the completion minus an exact reviewed cast time. A
 * channel is decided when it starts, and Warcraft Logs records a channel's
 * start as its `cast` (see "Pinned wire facts").
 *
 * Shared plumbing only. Nothing here knows a spell. The CALLER — the
 * specialization — supplies a `CastAnchorProfile`: which of its abilities are
 * instant, cast-time or channelled, and, per completion, what it can prove
 * about that execution's cast time (haste, instant-cast procs, talents). The
 * specialization owns that meaning; this file owns only the pairing and the
 * fail-closed rules.
 *
 * PINNED WIRE FACTS
 *
 * - `begincast` and `cast` are separate observations (M3 `castPhase` BEGIN
 *   and COMPLETE). A hard cast records a begin, then a completion of the same
 *   ability by the same source (the retained Restoration Shaman and Mage
 *   slices of b1PmaKrd6CDfzngc fight 48).
 * - A channel's only cast observation is its `cast`, at channel start: the
 *   retained Mage slice records Arcane Missiles as `cast` with no `begincast`.
 * - The retrieval order of two events in the SAME millisecond is not proven
 *   (agent/testing.md, M11-G2 "begincast + cast / equal ms"). The retained
 *   Restoration Shaman slice shows both shapes: a completion followed by the
 *   next begin of the same spell in one millisecond, and a begin with its own
 *   completion in one millisecond. Nothing here reads canonical order inside
 *   a millisecond.
 *
 * NOT proven, and therefore never used as a proof: that Warcraft Logs records
 * a begin for EVERY hard cast. A cast-time completion with no observable begin
 * is never inferred to have been instant; it is UNKNOWN unless the caller
 * proves the execution instant, or supplies an exact cast time to derive from.
 *
 * PAIRING, ORDER-INVARIANTLY
 *
 * Per ability, completions c_1 < c_2 < … partition time into windows. Begins
 * strictly inside a window are placed. A begin in the same millisecond as a
 * completion may sit on either side of it, so each such begin is one unknown
 * bit. A completion pairs with the latest begin that precedes it and follows
 * the previous completion (a later begin supersedes an interrupted earlier
 * one). Every placement of the bits that is CONSISTENT is enumerated for the
 * completion and its neighbours; the anchor is established only when every
 * consistent placement gives the same one:
 *
 *     a POSITIVE cast time cannot complete in the millisecond it began
 *     an INSTANT execution is decided at its completion, whatever the bits
 *     an UNKNOWN cast time may be either, so no earlier begin proves its moment
 *
 * AN EXECUTION THAT MAY HAVE BEEN INSTANT (moved here from Destruction by ONB-D2).
 * If the caller cannot say the cast took time, a begin before the completion may
 * be an attempt that was abandoned, and the decision the completion's. So an
 * earlier begin is only ever a candidate: the anchor is
 * BEGINCAST_PAIRING_AMBIGUOUS, with the completion among its candidates, and
 * the begin is not consumed. This is why a CASTING span needs a POSITIVE fact.
 *
 * Neighbour consistency is checked one completion either side. That admits
 * placements a global check might exclude — so it can only report MORE
 * ambiguity, never a wrong anchor.
 *
 * WHAT IT NEVER DOES
 *
 * - Never treats a channel as provably still running: a channel can be
 *   cancelled, so its span is "possibly in progress" and occupancy inside it
 *   is UNKNOWN — never NOT_CASTING, and so never an idle opportunity.
 * - Never claims NOT_CASTING without COMPLETE cast coverage for the actor from
 *   the pull to the instant asked about. A missing page is not idle time.
 * - Never models the GCD. Whether an instant occupies a global cooldown is the
 *   specialization's lane data; this is the cast and channel layer only.
 */

import { inclusiveRange } from "../../evidence/coverage.js";
import type { EvidenceLocator } from "../../evidence/locator.js";
import type { CastEvent } from "../../normalization/normalized-events.js";
import type { CombatState } from "../../state/combat-state.js";
import { gateAbsenceClaim, type UnknownReason } from "../../state/state-result.js";
import { isMonotonic } from "../../state/temporal.js";

// ---------------------------------------------------------------------------
// The caller's profile
// ---------------------------------------------------------------------------

/** How an ability executes, as the specialization's reviewed data states it. */
export type CastExecution = "INSTANT" | "CAST_TIME" | "CHANNEL";

export const CAST_EXECUTIONS = [
  "INSTANT",
  "CAST_TIME",
  "CHANNEL",
] as const satisfies readonly CastExecution[];

/**
 * What the caller can prove about ONE cast-time execution's cast time.
 *
 *     INSTANT    this execution had no cast time (for example an instant-cast
 *                proc the specialization established was consumed)
 *     POSITIVE   this execution had a cast time above zero. `exactMs` is the
 *                exact hasted cast time when every input is known, else null
 *     UNKNOWN    neither is established (a proc that may have made it instant)
 */
export type CastDurationFact =
  | { readonly kind: "INSTANT" }
  | { readonly kind: "POSITIVE"; readonly exactMs: number | null }
  | { readonly kind: "UNKNOWN"; readonly reason: string };

/** A proven upper bound on one channel's duration, or nothing. */
export type ChannelDurationFact =
  | { readonly kind: "AT_MOST"; readonly maxMs: number }
  | { readonly kind: "UNKNOWN"; readonly reason: string };

/** One observed completion, as the profile is asked about it. */
export interface ObservedCompletion {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  readonly fightTimeMs: number;
}

/** The specialization-owned input. Every judgement about a spell lives behind it. */
export interface CastAnchorProfile {
  /** The reviewed execution of an ability, or `null` when the specialization has not reviewed it. */
  executionOf(abilityGameId: number): CastExecution | null;
  /** Consulted for CAST_TIME completions only. */
  castTimeAt(completion: ObservedCompletion): CastDurationFact;
  /** Consulted for CHANNEL completions only. */
  channelDurationAt(completion: ObservedCompletion): ChannelDurationFact;
}

/** The cast speed the caller established: SimulationCraft's `composite_spell_cast_speed()`, or nothing. */
export type CastSpeed =
  { readonly state: "KNOWN"; readonly multiplier: number } | { readonly state: "UNKNOWN" };

/**
 * The shared hasted-cast-time arithmetic: `base × cast speed`.
 *
 * A zero base is INSTANT. A positive base is POSITIVE whatever the haste —
 * haste shortens a cast, it never removes it — and carries the exact time
 * only when the cast speed is KNOWN. Anything that is not a finite,
 * non-negative base or a finite, positive multiplier is UNKNOWN, never a
 * clamped value. Instant-cast procs are not haste and are the caller's to
 * apply before or instead of this.
 */
export function hastedCastTime(baseMs: number, speed: CastSpeed): CastDurationFact {
  if (!Number.isFinite(baseMs) || baseMs < 0) return { kind: "UNKNOWN", reason: "BASE_CAST_TIME_INVALID" };
  if (baseMs === 0) return { kind: "INSTANT" };
  if (speed.state === "UNKNOWN") return { kind: "POSITIVE", exactMs: null };
  if (!Number.isFinite(speed.multiplier) || speed.multiplier <= 0)
    return { kind: "UNKNOWN", reason: "CAST_SPEED_INVALID" };
  return { kind: "POSITIVE", exactMs: baseMs * speed.multiplier };
}

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

/** Where an established anchor came from. */
export type CastAnchorSource =
  /** An instant execution: decided when it landed. */
  | "INSTANT_COMPLETION"
  /** A hard cast paired with its observed begin, in every consistent placement. */
  | "OBSERVED_BEGINCAST"
  /** A channel: its `cast` is its start. */
  | "CHANNEL_START"
  /** No begin could be observed; completion minus the caller's exact cast time. */
  | "DERIVED_FROM_COMPLETION";

export const CAST_ANCHOR_SOURCES = [
  "INSTANT_COMPLETION",
  "OBSERVED_BEGINCAST",
  "CHANNEL_START",
  "DERIVED_FROM_COMPLETION",
] as const satisfies readonly CastAnchorSource[];

/** Why an anchor could not be established. Each is a different remedy. */
export type CastAnchorUnknownReason =
  /** The specialization has not reviewed how this ability executes. */
  | "EXECUTION_NOT_REVIEWED"
  /** No begin is usable and no exact cast time was supplied (haste unknown, or coverage incomplete). */
  | "CAST_TIME_UNKNOWN"
  /** Coverage was complete and no begin was observed for a cast that was not proven instant. */
  | "BEGINCAST_NOT_OBSERVED"
  /** Consistent same-millisecond placements give different anchors. */
  | "BEGINCAST_PAIRING_AMBIGUOUS"
  /** The evidence contradicts the reviewed execution, or no placement is consistent. */
  | "CAST_EVIDENCE_CONFLICT"
  /** The canonical order is not ordered by time. */
  | "NON_MONOTONIC_TIME";

export const CAST_ANCHOR_UNKNOWN_REASONS = [
  "EXECUTION_NOT_REVIEWED",
  "CAST_TIME_UNKNOWN",
  "BEGINCAST_NOT_OBSERVED",
  "BEGINCAST_PAIRING_AMBIGUOUS",
  "CAST_EVIDENCE_CONFLICT",
  "NON_MONOTONIC_TIME",
] as const satisfies readonly CastAnchorUnknownReason[];

export type CastDecisionAnchorState =
  | {
      readonly state: "ESTABLISHED";
      readonly source: CastAnchorSource;
      readonly reportTimeMs: number;
      /** The paired begin, for OBSERVED_BEGINCAST, and for an instant whose begin shares its millisecond when that is proven. */
      readonly beginPosition: number | null;
      readonly beginLocator: EvidenceLocator | null;
    }
  | {
      readonly state: "UNKNOWN";
      readonly reason: CastAnchorUnknownReason;
      /** The evidence condition behind CAST_TIME_UNKNOWN, when one applies. */
      readonly evidenceReason: UnknownReason | null;
      /** Every anchor a consistent placement gives, ascending, for BEGINCAST_PAIRING_AMBIGUOUS. */
      readonly candidateReportTimesMs: readonly number[];
      readonly detail: string;
    };

/** One observed foreground completion and the instant its decision was made. */
export interface CastDecisionAnchor {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly abilityGameId: number;
  readonly completionReportTimeMs: number;
  /** `null` when the specialization did not review the ability. */
  readonly execution: CastExecution | null;
  readonly anchor: CastDecisionAnchorState;
}

/**
 * Why an unpaired begin is not called interrupted.
 *
 *     PAIRING_NOT_PROVEN      some consistent placement pairs it and another
 *                             does not, or it contradicts the reviewed
 *                             execution
 *     EXECUTION_NOT_REVIEWED  its ability completes but was never reviewed,
 *                             so it was never paired
 *     (an evidence reason)    a page may hide its completion
 */
export type UnpairedBeginUnknownReason = UnknownReason | "PAIRING_NOT_PROVEN" | "EXECUTION_NOT_REVIEWED";

/**
 * A begin that not every consistent placement pairs with a completion. It
 * may still have been running after any completion it was a candidate for,
 * so it keeps a possible span to the actor's next cast start.
 */
export interface UnpairedBegin {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly abilityGameId: number | null;
  readonly reportTimeMs: number;
  /**
   * INTERRUPTED only when no placement pairs it and coverage proves no
   * completion followed before the actor's next cast start (or the fight end).
   */
  readonly outcome:
    | { readonly state: "INTERRUPTED" }
    | { readonly state: "UNKNOWN"; readonly reason: UnpairedBeginUnknownReason };
}

/** Why the actor may have been casting at an instant. */
export type PossibleCastReason =
  /** A channel may run to its bound, or may have been cancelled. */
  | "CHANNEL_END_UNKNOWN"
  /** A begin with no completion: when the attempt ended is not observed. */
  | "UNPAIRED_BEGIN_END_UNKNOWN"
  /** A cast-time completion whose start could not be established. */
  | "CAST_START_UNKNOWN"
  /** A completion of an ability the specialization has not reviewed. */
  | "EXECUTION_NOT_REVIEWED";

export const POSSIBLE_CAST_REASONS = [
  "CHANNEL_END_UNKNOWN",
  "UNPAIRED_BEGIN_END_UNKNOWN",
  "CAST_START_UNKNOWN",
  "EXECUTION_NOT_REVIEWED",
] as const satisfies readonly PossibleCastReason[];

/**
 * A span the actor was, or may have been, casting. Half-open: `[from, to)`.
 * A POSSIBLE span's `from` or `to` is `null` when no observation bounds it on
 * that side.
 */
export type CastSpan =
  | {
      readonly kind: "CASTING";
      readonly fromReportTimeMs: number;
      readonly toReportTimeMs: number;
      readonly completionPosition: number;
      readonly basis: "OBSERVED_BEGINCAST" | "DERIVED_FROM_COMPLETION";
    }
  | {
      readonly kind: "POSSIBLE";
      /** `null` when no observation bounds the span below. */
      readonly fromReportTimeMs: number | null;
      readonly toReportTimeMs: number | null;
      readonly position: number;
      readonly reason: PossibleCastReason;
    };

/** Whether the actor was casting at one instant. */
export type CastOccupancy =
  | { readonly state: "CASTING"; readonly span: Extract<CastSpan, { kind: "CASTING" }> }
  | { readonly state: "NOT_CASTING" }
  | {
      readonly state: "UNKNOWN";
      readonly reason: PossibleCastReason | null;
      readonly evidenceReason: UnknownReason | null;
      readonly span: Extract<CastSpan, { kind: "POSSIBLE" }> | null;
    };

export interface CastTimeline {
  readonly actorId: number;
  /** Every foreground completion (melee swings and id-less casts excluded), in canonical order. */
  readonly anchors: readonly CastDecisionAnchor[];
  readonly unpairedBegins: readonly UnpairedBegin[];
  readonly spans: readonly CastSpan[];
  /** The anchor of the completion at a canonical position, or `null` when that position is not one. */
  anchorAt(position: number): CastDecisionAnchor | null;
  /** Never NOT_CASTING without positive coverage; never CASTING inside a channel. */
  occupancyAt(reportTimeMs: number): CastOccupancy;
}

export interface CastTimelineInput {
  readonly state: CombatState;
  readonly actorId: number;
  readonly profile: CastAnchorProfile;
}

/**
 * The anchor state of one completion on a timeline. A position the timeline does not hold is a
 * refusal, never a time to judge at.
 */
export function decisionAnchorStateAt(timeline: CastTimeline, position: number): CastDecisionAnchorState {
  const anchor = timeline.anchorAt(position);
  if (anchor !== null) return anchor.anchor;
  return {
    state: "UNKNOWN",
    reason: "EXECUTION_NOT_REVIEWED",
    evidenceReason: null,
    candidateReportTimesMs: [],
    detail: "the shared timeline holds no anchor for this completion",
  };
}

/** A coverage key for one anchor: its source, or why it is not established. */
export function castAnchorKey(state: CastDecisionAnchorState): string {
  return state.state === "ESTABLISHED" ? state.source : state.reason;
}

/** A coverage key for one unpaired begin: `INTERRUPTED`, or why that is not established. */
export function unpairedBeginKey(begin: UnpairedBegin): string {
  return begin.outcome.state === "INTERRUPTED" ? "INTERRUPTED" : begin.outcome.reason;
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

interface OwnCast {
  readonly position: number;
  readonly event: CastEvent;
  readonly abilityGameId: number | null;
  readonly t: number;
}

/** One cast-time completion's pairing world model, per ability. */
interface Chain {
  readonly completions: readonly OwnCast[];
  readonly facts: readonly CastDurationFact[];
  /** Begins of this ability, ascending by time. */
  readonly begins: readonly OwnCast[];
}

interface WorldAnchor {
  /** `null` is "no begin pairs in this placement". */
  readonly begin: OwnCast | null;
  readonly t: number | null;
  /** The placement: whether the begin in the previous / own completion's millisecond precedes it. */
  readonly previousBit: boolean;
  readonly ownBit: boolean;
}

function unknownAnchor(
  reason: CastAnchorUnknownReason,
  detail: string,
  evidenceReason: UnknownReason | null = null,
  candidates: readonly number[] = [],
): CastDecisionAnchorState {
  return { state: "UNKNOWN", reason, evidenceReason, candidateReportTimesMs: candidates, detail };
}

function established(source: CastAnchorSource, t: number, begin: OwnCast | null): CastDecisionAnchorState {
  return {
    state: "ESTABLISHED",
    source,
    reportTimeMs: t,
    beginPosition: begin?.position ?? null,
    beginLocator: begin?.event.locator ?? null,
  };
}

function completionOf(cast: OwnCast): ObservedCompletion {
  return {
    position: cast.position,
    locator: cast.event.locator,
    abilityGameId: cast.abilityGameId!,
    reportTimeMs: cast.t,
    fightTimeMs: cast.event.fightTimeMs,
  };
}

/** The begins at exactly one millisecond. */
function beginsAt(begins: readonly OwnCast[], t: number): readonly OwnCast[] {
  return begins.filter((begin) => begin.t === t);
}

/**
 * Pairs every completion of one cast-time ability.
 *
 * `bit[j]` is whether the begin in completion j's own millisecond precedes it.
 * It exists only when exactly one such begin exists; two begins of one ability
 * in one millisecond make the completion and its successor ambiguous outright.
 */
function pairChain(chain: Chain): {
  readonly perCompletion: readonly (readonly WorldAnchor[] | "AMBIGUOUS_GROUP" | "NO_WORLD")[];
  /** Positions of the begins every consistent placement pairs with some completion. */
  readonly surelyPaired: ReadonlySet<number>;
} {
  const { completions, facts, begins } = chain;
  const n = completions.length;
  const time = (j: number): number => completions[j]!.t;

  const ownBegin: (OwnCast | null)[] = [];
  const brokenGroup = new Set<number>();
  for (let j = 0; j < n; j += 1) {
    const at = beginsAt(begins, time(j));
    ownBegin.push(at.length === 1 ? at[0]! : null);
    if (at.length > 1) {
      brokenGroup.add(j);
      brokenGroup.add(j + 1);
    }
    // Two begins in the latest millisecond strictly inside the window: which
    // one is the latest is not proven, so neither may be named the pair.
    const lowerBound = j === 0 ? Number.NEGATIVE_INFINITY : time(j - 1);
    const insideTimes = begins
      .filter((begin) => begin.t > lowerBound && begin.t < time(j))
      .map((begin) => begin.t);
    if (insideTimes.length > 0) {
      const latest = Math.max(...insideTimes);
      if (insideTimes.filter((t) => t === latest).length > 1) brokenGroup.add(j);
    }
    if (j > 0 && time(j) === time(j - 1)) {
      // Two completions of one ability in one millisecond: their order, and
      // so which window each begin belongs to, is not proven.
      for (const k of [j - 2, j - 1, j, j + 1]) brokenGroup.add(k);
    }
  }

  const bitsFor = (j: number): readonly boolean[] =>
    j < 0 || j >= n || ownBegin[j] === null ? [false] : [false, true];

  const inside = (j: number): OwnCast | null => {
    const lower = j === 0 ? Number.NEGATIVE_INFINITY : time(j - 1);
    let latest: OwnCast | null = null;
    for (const begin of begins) {
      if (begin.t > lower && begin.t < time(j) && (latest === null || begin.t >= latest.t)) latest = begin;
    }
    return latest;
  };

  const anchorIn = (j: number, previousBit: boolean, ownBit: boolean): WorldAnchor => {
    const fact = facts[j]!;
    const bits = { previousBit, ownBit };
    if (fact.kind === "INSTANT") return { begin: ownBit ? ownBegin[j]! : null, t: time(j), ...bits };
    if (ownBit) return { begin: ownBegin[j]!, t: time(j), ...bits };
    const placed = inside(j);
    if (placed !== null) return { begin: placed, t: placed.t, ...bits };
    if (j > 0 && ownBegin[j - 1] !== null && !previousBit)
      return { begin: ownBegin[j - 1]!, t: time(j - 1), ...bits };
    return { begin: null, t: null, ...bits };
  };

  const consistent = (j: number, previousBit: boolean, ownBit: boolean): boolean => {
    if (j < 0 || j >= n) return true;
    const fact = facts[j]!;
    const anchor = anchorIn(j, previousBit, ownBit);
    // A positive cast time cannot complete in the millisecond it began.
    return !(fact.kind === "POSITIVE" && anchor.t === time(j));
  };

  const results: (readonly WorldAnchor[] | "AMBIGUOUS_GROUP" | "NO_WORLD")[] = [];
  for (let k = 0; k < n; k += 1) {
    if (brokenGroup.has(k)) {
      results.push("AMBIGUOUS_GROUP");
      continue;
    }
    const worlds: WorldAnchor[] = [];
    for (const previousBit of bitsFor(k - 1)) {
      for (const ownBit of bitsFor(k)) {
        if (!consistent(k, previousBit, ownBit)) continue;
        if (k > 0 && !bitsFor(k - 2).some((bit) => consistent(k - 1, bit, previousBit))) continue;
        if (k + 1 < n && !bitsFor(k + 1).some((bit) => consistent(k + 1, ownBit, bit))) continue;
        worlds.push(anchorIn(k, previousBit, ownBit));
      }
    }
    results.push(worlds.length === 0 ? "NO_WORLD" : worlds);
  }

  // A begin is SURELY paired only when every consistent placement pairs it.
  // Any other begin may still have been in progress after the completion it
  // was a candidate for, so the caller keeps it as possibly running.
  const pairsIt = (begin: OwnCast) => (world: WorldAnchor) => world.begin === begin;
  const surelyPaired = new Set<number>();
  for (const begin of begins) {
    const own = completions.findIndex((completion) => completion.t === begin.t);
    if (own !== -1) {
      // In its completion's millisecond: either that completion takes it, or
      // the next one must in every placement where it follows.
      const worlds = results[own];
      if (ownBegin[own] !== begin || !Array.isArray(worlds)) continue;
      const next = results[own + 1];
      const followers = Array.isArray(next) ? next.filter((world) => !world.previousBit) : [];
      const sure = worlds.every(
        (world) => world.ownBit || (followers.length > 0 && followers.every(pairsIt(begin))),
      );
      if (sure) surelyPaired.add(begin.position);
      continue;
    }
    const window = completions.findIndex((completion) => completion.t > begin.t);
    const worlds = window === -1 ? undefined : results[window];
    if (Array.isArray(worlds) && worlds.every(pairsIt(begin))) surelyPaired.add(begin.position);
  }
  return { perCompletion: results, surelyPaired };
}

// ---------------------------------------------------------------------------
// The timeline
// ---------------------------------------------------------------------------

/**
 * Builds one actor's cast timeline: a decision anchor for every foreground
 * completion, the begins nothing completed, and the spans the actor was or
 * may have been casting.
 */
export function buildCastTimeline(input: CastTimelineInput): CastTimeline {
  const { state, actorId, profile } = input;
  const { fight } = state;
  const monotonic = isMonotonic(state.temporalIntegrity);

  const begins: OwnCast[] = [];
  const completions: OwnCast[] = [];
  for (const position of state.positionsBySourceActor(actorId)) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "CAST" || event.source?.actorId !== actorId) continue;
    const own: OwnCast = { position, event, abilityGameId: event.abilityGameId, t: event.reportTimeMs };
    if (event.castPhase === "BEGIN") begins.push(own);
    else if (event.isMelee !== true && event.abilityGameId !== null) completions.push(own);
  }

  const coverageGate = (from: number, to: number): UnknownReason | null => {
    if (from > to) return null;
    const gate = gateAbsenceClaim({
      completeness: fight.completeness,
      category: "CASTS",
      range: inclusiveRange(from, to),
      actorId,
    });
    return gate.ok ? null : gate.reason;
  };

  const executions = new Map<number, CastExecution | null>();
  const executionOf = (abilityGameId: number): CastExecution | null => {
    if (!executions.has(abilityGameId)) executions.set(abilityGameId, profile.executionOf(abilityGameId));
    return executions.get(abilityGameId) ?? null;
  };

  const channelStarts = completions.filter((cast) => executionOf(cast.abilityGameId!) === "CHANNEL");
  /** The next observed start of a hard cast or a channel strictly after `t`: either ends whatever ran before. */
  const nextCastStartAfter = (t: number): number | null => {
    let next: number | null = null;
    for (const cast of [...begins, ...channelStarts]) {
      if (cast.t > t && (next === null || cast.t < next)) next = cast.t;
    }
    return next;
  };

  const anchorByPosition = new Map<number, CastDecisionAnchor>();
  /** Begins some placement pairs, or that contradict a review: never called interrupted. */
  const referencedBegins = new Set<number>();
  /** Begins every consistent placement pairs: the only ones that cannot still be running. */
  const surelyPaired = new Set<number>();
  /** Each completion's previous completion of the same ability: how far back an unknown start reaches. */
  const windowStartByCompletion = new Map<number, number | null>();
  const spans: CastSpan[] = [];

  const record = (cast: OwnCast, execution: CastExecution | null, anchor: CastDecisionAnchorState): void => {
    anchorByPosition.set(cast.position, {
      position: cast.position,
      locator: cast.event.locator,
      abilityGameId: cast.abilityGameId!,
      completionReportTimeMs: cast.t,
      execution,
      anchor,
    });
  };

  // ---- per ability ----
  const byAbility = new Map<number, OwnCast[]>();
  for (const cast of completions) {
    const list = byAbility.get(cast.abilityGameId!) ?? [];
    list.push(cast);
    byAbility.set(cast.abilityGameId!, list);
  }

  for (const [abilityGameId, chainCompletions] of byAbility) {
    const execution = executionOf(abilityGameId);
    const abilityBegins = begins.filter((begin) => begin.abilityGameId === abilityGameId);
    const previousTime = (j: number): number | null => (j === 0 ? null : chainCompletions[j - 1]!.t);
    chainCompletions.forEach((cast, j) => windowStartByCompletion.set(cast.position, previousTime(j)));

    if (!monotonic) {
      for (const cast of chainCompletions)
        record(
          cast,
          execution,
          unknownAnchor("NON_MONOTONIC_TIME", "The canonical order is not ordered by time."),
        );
      continue;
    }

    if (execution === null) {
      chainCompletions.forEach((cast, j) => {
        record(
          cast,
          null,
          unknownAnchor(
            "EXECUTION_NOT_REVIEWED",
            "The specialization has not reviewed how this ability executes.",
          ),
        );
        // Unreviewed, it may have been a hard cast before its completion or a
        // channel after it: possibly casting back to the previous completion
        // and on to the next cast start.
        spans.push({
          kind: "POSSIBLE",
          fromReportTimeMs: previousTime(j),
          toReportTimeMs: nextCastStartAfter(cast.t),
          position: cast.position,
          reason: "EXECUTION_NOT_REVIEWED",
        });
      });
      continue;
    }

    if (execution === "INSTANT" || execution === "CHANNEL") {
      /** A channel may run from its cast to its bound or the next cast start, whichever is first. */
      const channelSpan = (cast: OwnCast, bound: ChannelDurationFact): void => {
        const ends = [
          nextCastStartAfter(cast.t),
          bound.kind === "AT_MOST" ? cast.t + bound.maxMs : null,
        ].filter((value): value is number => value !== null);
        spans.push({
          kind: "POSSIBLE",
          fromReportTimeMs: cast.t,
          toReportTimeMs: ends.length === 0 ? null : Math.min(...ends),
          position: cast.position,
          reason: "CHANNEL_END_UNKNOWN",
        });
      };
      chainCompletions.forEach((cast, j) => {
        const lower = previousTime(j) ?? Number.NEGATIVE_INFINITY;
        const contradicting = abilityBegins.filter((begin) => begin.t >= lower && begin.t <= cast.t);
        for (const begin of contradicting) referencedBegins.add(begin.position);
        if (contradicting.length > 0) {
          record(
            cast,
            execution,
            unknownAnchor(
              "CAST_EVIDENCE_CONFLICT",
              `A begincast of this ability was observed, but its reviewed execution is ${execution}.`,
            ),
          );
          spans.push({
            kind: "POSSIBLE",
            // Contradicted evidence bounds nothing: unknown back to the previous completion.
            fromReportTimeMs: previousTime(j),
            toReportTimeMs: cast.t,
            position: cast.position,
            reason: "CAST_START_UNKNOWN",
          });
          // The review is contradicted, so neither "instant" nor its channel
          // bound is relied on: only a later cast start ends what may still be
          // channelling.
          channelSpan(cast, { kind: "UNKNOWN", reason: "REVIEW_CONTRADICTED" });
          return;
        }
        if (execution === "INSTANT") {
          record(cast, execution, established("INSTANT_COMPLETION", cast.t, null));
          return;
        }
        record(cast, execution, established("CHANNEL_START", cast.t, null));
        channelSpan(cast, profile.channelDurationAt(completionOf(cast)));
      });
      continue;
    }

    // ---- CAST_TIME ----
    const facts = chainCompletions.map((cast) => profile.castTimeAt(completionOf(cast)));
    const chain = pairChain({ completions: chainCompletions, facts, begins: abilityBegins });
    const paired = chain.perCompletion;
    for (const position of chain.surelyPaired) surelyPaired.add(position);

    chainCompletions.forEach((cast, j) => {
      const fact = facts[j]!;
      const lower = previousTime(j);
      const worlds = paired[j]!;
      // A completion that may have been instant consumes no begin, in any placement: each stays possibly running.
      if (fact.kind === "UNKNOWN" && Array.isArray(worlds)) {
        for (const world of worlds) if (world.begin !== null) surelyPaired.delete(world.begin.position);
      }
      const possibleFrom = (from: number | null): void => {
        spans.push({
          kind: "POSSIBLE",
          fromReportTimeMs: from,
          toReportTimeMs: cast.t,
          position: cast.position,
          reason: "CAST_START_UNKNOWN",
        });
      };

      if (worlds === "AMBIGUOUS_GROUP" || worlds === "NO_WORLD") {
        for (const begin of abilityBegins)
          if (begin.t >= (lower ?? Number.NEGATIVE_INFINITY) && begin.t <= cast.t)
            referencedBegins.add(begin.position);
        record(
          cast,
          execution,
          worlds === "NO_WORLD"
            ? unknownAnchor(
                "CAST_EVIDENCE_CONFLICT",
                "No placement of the same-millisecond begins is consistent.",
              )
            : unknownAnchor(
                "BEGINCAST_PAIRING_AMBIGUOUS",
                "Several begins or completions of this ability share a millisecond; their order is not proven.",
              ),
        );
        possibleFrom(lower);
        return;
      }

      for (const world of worlds) if (world.begin !== null) referencedBegins.add(world.begin.position);
      const times = [...new Set(worlds.map((world) => world.t))];
      if (times.length > 1) {
        const candidates = [...times, ...(fact.kind === "UNKNOWN" ? [cast.t] : [])]
          .map((t) => t ?? Number.NaN)
          .filter((t, index, all) => !Number.isNaN(t) && all.indexOf(t) === index)
          .sort((a, b) => a - b);
        record(
          cast,
          execution,
          unknownAnchor(
            "BEGINCAST_PAIRING_AMBIGUOUS",
            times.includes(null)
              ? "In one consistent placement no begin pairs with this completion; in another one does."
              : "Consistent same-millisecond placements pair this completion with different begins.",
            null,
            candidates,
          ),
        );
        // A placement with no paired begin leaves the start unknown back to
        // the previous completion, so the earliest candidate does not bound it.
        possibleFrom(times.includes(null) ? lower : (candidates[0] ?? lower));
        return;
      }

      const world = worlds[0]!;
      if (fact.kind === "INSTANT") {
        // Decided at completion in every placement. The begin in its own
        // millisecond is reported only when every placement consumes it.
        const begin = worlds.every((entry) => entry.begin !== null) ? world.begin : null;
        record(cast, execution, established("INSTANT_COMPLETION", cast.t, begin));
        return;
      }

      if (world.t !== null && world.begin !== null) {
        const anchorTime = world.t;
        if (anchorTime === cast.t) {
          // Zero-length, and not proven instant: only an UNKNOWN-cast-time
          // execution reaches here. The decision instant is the same either way.
          record(cast, execution, established("OBSERVED_BEGINCAST", anchorTime, world.begin));
          return;
        }
        // A start in the begin's own millisecond counts: its order against
        // the begin is not proven, so it may have interrupted it.
        // Another hard cast completing inside it contradicts it as well.
        const interleaved =
          [...begins, ...channelStarts].some(
            (other) => other.abilityGameId !== abilityGameId && other.t >= anchorTime && other.t < cast.t,
          ) ||
          completions.some(
            (other) =>
              other.abilityGameId !== abilityGameId &&
              executionOf(other.abilityGameId!) === "CAST_TIME" &&
              other.t > anchorTime &&
              other.t < cast.t,
          );
        if (interleaved) {
          record(
            cast,
            execution,
            unknownAnchor(
              "CAST_EVIDENCE_CONFLICT",
              "Another cast or channel started, or another hard cast completed, between this completion and the begin it would pair with.",
            ),
          );
          // Contradicted evidence bounds nothing: the start is unknown back to
          // the previous completion, and the begin may still have been running.
          surelyPaired.delete(world.begin.position);
          possibleFrom(lower);
          return;
        }
        // The latest begin is only the latest if no unobserved begin follows it.
        const gap = coverageGate(anchorTime, cast.t);
        if (gap !== null) {
          record(
            cast,
            execution,
            unknownAnchor(
              "CAST_TIME_UNKNOWN",
              "A later begin may be missing from incomplete cast coverage.",
              gap,
            ),
          );
          possibleFrom(anchorTime);
          return;
        }
        if (fact.kind === "UNKNOWN") {
          record(
            cast,
            execution,
            unknownAnchor(
              "BEGINCAST_PAIRING_AMBIGUOUS",
              `A begin precedes this completion, but the cast time is not established (${fact.reason}), so the execution may have been instant and the begin an abandoned attempt.`,
              null,
              [anchorTime, cast.t],
            ),
          );
          possibleFrom(anchorTime);
          return;
        }
        record(cast, execution, established("OBSERVED_BEGINCAST", anchorTime, world.begin));
        spans.push({
          kind: "CASTING",
          fromReportTimeMs: anchorTime,
          toReportTimeMs: cast.t,
          completionPosition: cast.position,
          basis: "OBSERVED_BEGINCAST",
        });
        return;
      }

      // No begin pairs in any placement.
      const gap = lower === null ? "INSUFFICIENT_COVERAGE" : coverageGate(lower, cast.t);
      if (gap === null) {
        record(
          cast,
          execution,
          unknownAnchor(
            "BEGINCAST_NOT_OBSERVED",
            "Cast coverage was complete and no begin was observed; the execution was not proven instant.",
          ),
        );
        possibleFrom(lower);
        return;
      }
      if (fact.kind === "POSITIVE" && fact.exactMs !== null) {
        const derived = cast.t - fact.exactMs;
        // A derived start must not contradict what WAS observed: it cannot
        // precede the previous completion of this ability, and no other cast
        // or channel may start, nor another hard cast complete, inside it. A
        // start in the derived millisecond counts, as for an observed begin:
        // its order against the derived start is not proven.
        const contradicted =
          (lower !== null && derived < lower) ||
          [...begins, ...channelStarts].some((other) => other.t >= derived && other.t < cast.t) ||
          completions.some(
            (other) =>
              other !== cast &&
              executionOf(other.abilityGameId!) === "CAST_TIME" &&
              other.t > derived &&
              other.t < cast.t,
          );
        if (contradicted) {
          record(
            cast,
            execution,
            unknownAnchor(
              "CAST_EVIDENCE_CONFLICT",
              "The start derived from the exact cast time contradicts an observed cast or completion.",
            ),
          );
          possibleFrom(lower);
          return;
        }
        // Where the derived cast itself was fully covered, its begin should
        // have been observed: that is a missing begin, not a derivation.
        if (coverageGate(derived, cast.t) === null) {
          record(
            cast,
            execution,
            unknownAnchor(
              "BEGINCAST_NOT_OBSERVED",
              "Cast coverage was complete over the derived cast and no begin was observed.",
            ),
          );
          possibleFrom(lower);
          return;
        }
        record(cast, execution, established("DERIVED_FROM_COMPLETION", derived, null));
        spans.push({
          kind: "CASTING",
          fromReportTimeMs: derived,
          toReportTimeMs: cast.t,
          completionPosition: cast.position,
          basis: "DERIVED_FROM_COMPLETION",
        });
        return;
      }
      record(
        cast,
        execution,
        unknownAnchor(
          "CAST_TIME_UNKNOWN",
          fact.kind === "UNKNOWN"
            ? `No begin was observed and the cast time is not established (${fact.reason}).`
            : "No begin was observed and the exact cast time is not established.",
          gap,
        ),
      );
      possibleFrom(lower);
    });
  }

  // ---- no two proven casts may overlap ----
  // One actor hard-casts one spell at a time. Two CASTING spans that overlap,
  // observed or derived, cannot both be right, and which is wrong is not
  // established: both become conflicts. Their begins are released, so each
  // may still have been running after its completion.
  const casting = spans.filter(
    (span): span is Extract<CastSpan, { kind: "CASTING" }> => span.kind === "CASTING",
  );
  const overlapping = casting.filter((span) =>
    casting.some(
      (other) =>
        other !== span &&
        other.fromReportTimeMs < span.toReportTimeMs &&
        other.toReportTimeMs > span.fromReportTimeMs,
    ),
  );
  for (const span of overlapping) {
    const entry = anchorByPosition.get(span.completionPosition)!;
    if (entry.anchor.state === "ESTABLISHED" && entry.anchor.beginPosition !== null)
      surelyPaired.delete(entry.anchor.beginPosition);
    anchorByPosition.set(span.completionPosition, {
      ...entry,
      anchor: unknownAnchor(
        "CAST_EVIDENCE_CONFLICT",
        "This cast overlaps another proven cast by the same actor.",
      ),
    });
    spans.splice(spans.indexOf(span), 1, {
      kind: "POSSIBLE",
      fromReportTimeMs: windowStartByCompletion.get(span.completionPosition) ?? null,
      toReportTimeMs: span.toReportTimeMs,
      position: span.completionPosition,
      reason: "CAST_START_UNKNOWN",
    });
  }

  // ---- begins no completion surely took ----
  const unpairedBegins: UnpairedBegin[] = [];
  for (const begin of begins) {
    if (surelyPaired.has(begin.position)) continue;
    const end = nextCastStartAfter(begin.t);
    const reviewed = begin.abilityGameId === null ? null : executionOf(begin.abilityGameId);
    const completed = completions.some((cast) => cast.abilityGameId === begin.abilityGameId);
    const outcome: UnpairedBegin["outcome"] = !monotonic
      ? { state: "UNKNOWN", reason: "NON_MONOTONIC_TIME" }
      : referencedBegins.has(begin.position)
        ? { state: "UNKNOWN", reason: "PAIRING_NOT_PROVEN" }
        : reviewed === null && completed
          ? { state: "UNKNOWN", reason: "EXECUTION_NOT_REVIEWED" }
          : (() => {
              const gap = coverageGate(begin.t, end ?? fight.fight.endTimeMs);
              return gap === null ? { state: "INTERRUPTED" } : { state: "UNKNOWN", reason: gap };
            })();
    unpairedBegins.push({
      position: begin.position,
      locator: begin.event.locator,
      abilityGameId: begin.abilityGameId,
      reportTimeMs: begin.t,
      outcome,
    });
    spans.push({
      kind: "POSSIBLE",
      fromReportTimeMs: begin.t,
      toReportTimeMs: end,
      position: begin.position,
      reason: "UNPAIRED_BEGIN_END_UNKNOWN",
    });
  }

  const anchors = completions.map((cast) => anchorByPosition.get(cast.position)!);
  unpairedBegins.sort((a, b) => a.position - b.position);
  const spanKey = (span: CastSpan): number =>
    span.kind === "CASTING" ? span.completionPosition : span.position;
  spans.sort(
    (a, b) =>
      (a.fromReportTimeMs ?? Number.NEGATIVE_INFINITY) - (b.fromReportTimeMs ?? Number.NEGATIVE_INFINITY) ||
      spanKey(a) - spanKey(b),
  );

  function occupancyAt(reportTimeMs: number): CastOccupancy {
    if (!monotonic)
      return { state: "UNKNOWN", reason: null, evidenceReason: "NON_MONOTONIC_TIME", span: null };
    const inSpan = (span: CastSpan): boolean =>
      (span.fromReportTimeMs === null || span.fromReportTimeMs <= reportTimeMs) &&
      (span.toReportTimeMs === null || reportTimeMs < span.toReportTimeMs);
    for (const span of spans) {
      if (span.kind === "CASTING" && inSpan(span)) return { state: "CASTING", span };
    }
    for (const span of spans) {
      if (span.kind === "POSSIBLE" && inSpan(span))
        return { state: "UNKNOWN", reason: span.reason, evidenceReason: null, span };
    }
    // Nothing observed covers the instant. That is an ABSENCE claim: a cast
    // whose begin fell in a missing page would cover it unseen.
    const gap =
      reportTimeMs < fight.fight.startTimeMs
        ? "INSUFFICIENT_COVERAGE"
        : coverageGate(fight.fight.startTimeMs, reportTimeMs);
    if (gap !== null) return { state: "UNKNOWN", reason: null, evidenceReason: gap, span: null };
    return { state: "NOT_CASTING" };
  }

  return {
    actorId,
    anchors,
    unpairedBegins,
    spans,
    anchorAt: (position) => anchorByPosition.get(position) ?? null,
    occupancyAt,
  };
}
