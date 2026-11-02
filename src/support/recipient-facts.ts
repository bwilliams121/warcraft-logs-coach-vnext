/**
 * RECIPIENT FACTS (M13-A): what is observable about the recipients of
 * support windows — their deaths, their own cooldown casts, and how much
 * support time is proven.
 *
 * Shared, fact-only, like `support-aura-windows.ts`. A question that needs
 * the buff to have been ON the recipient throughout a stretch (cooldown
 * overlap, support time, concurrency) uses a window's `activeSpan` only,
 * which exists only when continuity is established. A death between two
 * observed transitions is a fact whatever the continuity, so survival reads
 * the `observedSpan`. An unobserved bound is never filled in.
 *
 * WHAT IT NEVER SAYS
 *
 * - Never "alive". The death-state contract has no alive state: no death
 *   event is not survival (M11-F). A window either holds an observed death of
 *   its recipient instance, or says NO_DEATH_OBSERVED, which is not a claim.
 * - Never which recipient abilities are cooldowns. The caller supplies that
 *   identity per recipient, from reviewed runtime data. A recipient without
 *   one is NO_COOLDOWN_IDENTITY, never an empty overlap.
 * - Never "no cooldown overlapped". An empty overlap list is complete only
 *   when the recipient's CASTS coverage over the span is COMPLETE.
 * - Never a verdict on timing or recipient choice.
 * - Never an exact support total. Complete transition coverage does not
 *   resolve INITIAL state: a buff applied before the range (a pre-pull
 *   Prescience, say) stays on its recipient with no transition inside it, and
 *   "no aura event" is never "inactive" (`src/engine/auras/aura-state.ts`).
 *   So `proven` is AT_LEAST the active spans' time, with its caveats, and
 *   UNKNOWN — never "at least 0" — when nothing is proven. Peak concurrency
 *   is likewise a lower bound.
 */

import type { TimeRangeMs } from "../engine/evidence/coverage.js";
import type { EvidenceLocator } from "../engine/evidence/locator.js";
import type { CombatFight } from "../engine/normalization/combat-fight.js";
import type { ActorRef } from "../engine/normalization/normalized-events.js";
import { observedDeathsOf } from "../engine/state/death-state.js";
import { gateAbsenceClaim, type UnknownReason } from "../engine/state/state-result.js";

import type { SupportAuraWindow, SupportAuraWindows } from "./support-aura-windows.js";

export const RECIPIENT_FACTS_REVISION = "support-recipient-facts/1" as const;

const sameInstance = (left: ActorRef, right: ActorRef): boolean =>
  left.actorId === right.actorId && left.instanceId === right.instanceId;

const within = (span: TimeRangeMs, time: number): boolean =>
  time >= span.fromReportTimeMs && time <= span.toReportTimeMs;

const atBound = (span: TimeRangeMs, time: number): boolean =>
  time === span.fromReportTimeMs || time === span.toReportTimeMs;

// ---------------------------------------------------------------------------
// Survival
// ---------------------------------------------------------------------------

export interface RecipientDeath {
  readonly reportTimeMs: number;
  readonly locator: EvidenceLocator;
  /** Same report millisecond as a span bound: which came first is not known. */
  readonly atSpanBound: boolean;
}

export interface RecipientSurvival {
  readonly inSpan:
    | { readonly state: "DEATH_OBSERVED_IN_SPAN"; readonly deaths: readonly RecipientDeath[] }
    /** Positive-only: no death event was seen. NOT "alive", NOT "survived". */
    | { readonly state: "NO_DEATH_OBSERVED" };
  /**
   * The recipient instance's first observed death AFTER the window's observed
   * end. In real logs Warcraft Logs removes a buff a few milliseconds before
   * the holder's death event, so a death that ended a window lies here, not in
   * the span. A fact with its distance, never a cause and never a threshold.
   * END_NOT_OBSERVED when the window's end was not observed: then "after the
   * end" has no anchor.
   */
  readonly nextDeathAfterEnd:
    | {
        readonly state: "OBSERVED";
        readonly reportTimeMs: number;
        readonly msAfterObservedEnd: number;
        readonly locator: EvidenceLocator;
      }
    | { readonly state: "NONE_OBSERVED" }
    | { readonly state: "END_NOT_OBSERVED" };
}

/** The recipient instance's observed deaths inside the window's observed span, and the first after its end. */
export function recipientSurvivalDuring(fight: CombatFight, window: SupportAuraWindow): RecipientSurvival {
  const own = observedDeathsOf(fight).observed.filter((death) => sameInstance(death.actor, window.recipient));
  const deaths = own
    .filter((death) => within(window.observedSpan, death.reportTimeMs))
    .map((death) => ({
      reportTimeMs: death.reportTimeMs,
      locator: death.locator,
      atSpanBound: atBound(window.observedSpan, death.reportTimeMs),
    }));
  const inSpan: RecipientSurvival["inSpan"] =
    deaths.length === 0 ? { state: "NO_DEATH_OBSERVED" } : { state: "DEATH_OBSERVED_IN_SPAN", deaths };
  const { end } = window;
  if (end.kind !== "OBSERVED") return { inSpan, nextDeathAfterEnd: { state: "END_NOT_OBSERVED" } };
  const next = own
    .filter((death) => death.reportTimeMs > end.reportTimeMs)
    .sort((left, right) => left.reportTimeMs - right.reportTimeMs || left.position - right.position)[0];
  return {
    inSpan,
    nextDeathAfterEnd:
      next === undefined
        ? { state: "NONE_OBSERVED" }
        : {
            state: "OBSERVED",
            reportTimeMs: next.reportTimeMs,
            msAfterObservedEnd: next.reportTimeMs - end.reportTimeMs,
            locator: next.locator,
          },
  };
}

// ---------------------------------------------------------------------------
// Recipient cooldown overlap
// ---------------------------------------------------------------------------

/** Reviewed cooldown ability ids per recipient actor, supplied by the caller. */
export type RecipientCooldownIdentity = ReadonlyMap<number, readonly number[]>;

export interface OverlappingCast {
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  readonly locator: EvidenceLocator;
  /** Same report millisecond as a span bound: whether it fell inside is not known. */
  readonly atSpanBound: boolean;
}

export type CooldownOverlap =
  | { readonly state: "NO_COOLDOWN_IDENTITY" }
  /** The buff is not proven on the recipient between its observations, so "during the buff" cannot be said. */
  | {
      readonly state: "CONTINUITY_NOT_ESTABLISHED";
      readonly reason: Extract<SupportAuraWindow["continuity"], { state: "NOT_ESTABLISHED" }>["reason"];
    }
  | {
      readonly state: "LISTED";
      readonly casts: readonly OverlappingCast[];
      readonly listing:
        | { readonly state: "COMPLETE" }
        | { readonly state: "OBSERVED_ONLY"; readonly reason: UnknownReason }
        /**
         * Completed casts inside the span that could be a listed cooldown of
         * this recipient but cannot be attributed: the recipient instance's
         * casts with no ability id, and casts of a listed id (or no id) whose
         * source is not stated or whose instance cannot be told apart.
         */
        | {
            readonly state: "OBSERVED_ONLY";
            readonly reason: "AMBIGUOUS_CASTS";
            readonly unidentifiedCasts: number;
            readonly unattributedCasts: number;
          };
    };

/**
 * The recipient instance's own completed casts of its identified cooldowns
 * inside the window's ACTIVE span. A cast by another instance of the same
 * actor is that instance's; a pet recipient's casts are its own, and nothing
 * is credited to an owner.
 */
export function recipientCooldownOverlap(
  fight: CombatFight,
  window: SupportAuraWindow,
  identity: RecipientCooldownIdentity,
): CooldownOverlap {
  const ids = identity.get(window.recipient.actorId);
  if (ids === undefined) return { state: "NO_COOLDOWN_IDENTITY" };
  const span = window.activeSpan;
  if (span === null || window.continuity.state !== "ESTABLISHED") {
    return {
      state: "CONTINUITY_NOT_ESTABLISHED",
      reason: window.continuity.state === "ESTABLISHED" ? "INSUFFICIENT_COVERAGE" : window.continuity.reason,
    };
  }
  const wanted = new Set(ids);
  const casts: OverlappingCast[] = [];
  let unidentifiedCasts = 0;
  let unattributedCasts = 0;
  for (const event of fight.events) {
    if (event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    if (!within(span, event.reportTimeMs)) continue;
    const relevantAbility = event.abilityGameId === null || wanted.has(event.abilityGameId);
    // A cast that might be this recipient's but cannot be shown to be.
    const unresolved =
      event.source === null ||
      (event.source.actorId === window.recipient.actorId &&
        event.source.instanceId !== window.recipient.instanceId &&
        (event.source.instanceId === null || window.recipient.instanceId === null));
    if (unresolved) {
      if (relevantAbility) unattributedCasts += 1;
      continue;
    }
    if (event.source === null || !sameInstance(event.source, window.recipient)) continue;
    if (event.abilityGameId === null) {
      unidentifiedCasts += 1;
      continue;
    }
    if (!wanted.has(event.abilityGameId)) continue;
    casts.push({
      abilityGameId: event.abilityGameId,
      reportTimeMs: event.reportTimeMs,
      locator: event.locator,
      atSpanBound: atBound(span, event.reportTimeMs),
    });
  }
  const gate = gateAbsenceClaim({
    completeness: fight.completeness,
    category: "CASTS",
    range: span,
    actorId: window.recipient.actorId,
  });
  return {
    state: "LISTED",
    casts,
    listing: !gate.ok
      ? { state: "OBSERVED_ONLY", reason: gate.reason }
      : unidentifiedCasts > 0 || unattributedCasts > 0
        ? { state: "OBSERVED_ONLY", reason: "AMBIGUOUS_CASTS", unidentifiedCasts, unattributedCasts }
        : { state: "COMPLETE" },
  };
}

// ---------------------------------------------------------------------------
// Proven support time
// ---------------------------------------------------------------------------

export type ProvenAmount =
  /** Real, but possibly less than the truth: never read as the total. */
  | { readonly bound: "AT_LEAST"; readonly ms: number; readonly why: readonly ProvenAmountCaveat[] }
  /** Nothing proven and the listing cannot say there was nothing: never "at least 0". */
  | { readonly bound: "UNKNOWN"; readonly why: readonly ProvenAmountCaveat[] };

export type ProvenAmountCaveat =
  | "INITIAL_STATE_NOT_RESOLVED"
  | "LISTING_OBSERVED_ONLY"
  | "UNOBSERVED_WINDOW_BOUND"
  | "CONTINUITY_NOT_ESTABLISHED";

export interface RecipientSupportTime {
  readonly recipient: ActorRef;
  readonly windows: number;
  readonly proven: ProvenAmount;
}

export interface SupportTime {
  readonly revision: typeof RECIPIENT_FACTS_REVISION;
  /** The union of every window's ACTIVE span, whichever recipient: time ANY recipient is proven to have held the buff. */
  readonly anyRecipient: ProvenAmount;
  readonly byRecipient: readonly RecipientSupportTime[];
  /**
   * The most windows whose ACTIVE spans are proven to overlap at one instant
   * (one ability: one window per recipient). One span ending at the very
   * millisecond another starts is NOT a proven overlap: their order in that
   * millisecond is not established. Always a lower bound: a carried-in buff
   * with no transition in range may add to it.
   */
  readonly peakConcurrentWindows:
    { readonly bound: "AT_LEAST"; readonly count: number } | { readonly bound: "UNKNOWN" };
}

function unionMs(spans: readonly TimeRangeMs[]): number {
  const sorted = [...spans].sort((a, b) => a.fromReportTimeMs - b.fromReportTimeMs);
  let coveredMs = 0;
  let from: number | null = null;
  let to = 0;
  for (const span of sorted) {
    if (from === null || span.fromReportTimeMs > to) {
      if (from !== null) coveredMs += to - from;
      from = span.fromReportTimeMs;
      to = span.toReportTimeMs;
    } else if (span.toReportTimeMs > to) {
      to = span.toReportTimeMs;
    }
  }
  if (from !== null) coveredMs += to - from;
  return coveredMs;
}

function amountOf(
  windows: readonly SupportAuraWindow[],
  listing: SupportAuraWindows["listing"],
): ProvenAmount {
  // Only established active spans count; an unproven stretch adds nothing.
  const ms = unionMs(windows.flatMap((window) => (window.activeSpan === null ? [] : [window.activeSpan])));
  const why: ProvenAmountCaveat[] = [];
  // Always: a recipient may carry this buff with no transition in range.
  why.push("INITIAL_STATE_NOT_RESOLVED");
  if (listing.state !== "COMPLETE") why.push("LISTING_OBSERVED_ONLY");
  if (windows.some((window) => window.start.kind !== "OBSERVED" || window.end.kind !== "OBSERVED")) {
    why.push("UNOBSERVED_WINDOW_BOUND");
  }
  if (windows.some((window) => window.activeSpan === null)) why.push("CONTINUITY_NOT_ESTABLISHED");
  return ms > 0 ? { bound: "AT_LEAST", ms, why } : { bound: "UNKNOWN", why };
}

/**
 * The largest number of spans active at one instant, inclusive bounds. A span
 * of a single millisecond always counts itself; `order` decides only how
 * DIFFERENT spans meeting at one millisecond are taken.
 */
function peakOf(spans: readonly TimeRangeMs[], order: "ENDS_FIRST" | "STARTS_FIRST"): number {
  let peak = spans.length > 0 ? 1 : 0;
  const points = spans.flatMap((span, index) => [
    { time: span.fromReportTimeMs, delta: 1, index },
    { time: span.toReportTimeMs, delta: -1, index },
  ]);
  points.sort((a, b) => {
    if (a.time !== b.time) return a.time - b.time;
    // A span's own start always precedes its own end.
    if (a.index === b.index) return b.delta - a.delta;
    return order === "ENDS_FIRST" ? a.delta - b.delta : b.delta - a.delta;
  });
  let current = 0;
  for (const point of points) {
    current += point.delta;
    peak = Math.max(peak, current);
  }
  return peak;
}

/** Proven support time over a set of windows (for example: one ability's). */
export function supportTimeOf(windows: SupportAuraWindows, abilityGameIds: readonly number[]): SupportTime {
  const ids = new Set(abilityGameIds);
  const selected = windows.windows.filter((window) => ids.has(window.abilityGameId));
  const recipients = new Map<string, { recipient: ActorRef; windows: SupportAuraWindow[] }>();
  for (const window of selected) {
    const key = `${String(window.recipient.actorId)}:${String(window.recipient.instanceId)}`;
    const entry = recipients.get(key) ?? { recipient: window.recipient, windows: [] };
    entry.windows.push(window);
    recipients.set(key, entry);
  }
  const byRecipient = [...recipients.values()]
    .sort(
      (left, right) =>
        left.recipient.actorId - right.recipient.actorId ||
        (left.recipient.instanceId ?? -1) - (right.recipient.instanceId ?? -1),
    )
    .map((entry) => ({
      recipient: entry.recipient,
      windows: entry.windows.length,
      proven: amountOf(entry.windows, windows.listing),
    }));

  const spans = selected.flatMap((window) => (window.activeSpan === null ? [] : [window.activeSpan]));
  // Proven: at an equal millisecond every end is taken before every start.
  const proven = peakOf(spans, "ENDS_FIRST");
  const anyRecipient = amountOf(selected, windows.listing);
  return {
    revision: RECIPIENT_FACTS_REVISION,
    anyRecipient,
    byRecipient,
    peakConcurrentWindows: proven > 0 ? { bound: "AT_LEAST", count: proven } : { bound: "UNKNOWN" },
  };
}
