/**
 * `runic_power.deficit` at a Blood decision whose own cast carries no PRE_COST
 * Runic Power — the Blood-owned reading of causally prior resource evidence
 * (M11-B5).
 *
 * THE QUESTION THIS ANSWERS
 *
 *     What exact value or one-sided bound on Runic Power follows from
 *     causally prior OBSERVED resource states under proven coverage, without
 *     inventing any unobserved gain, spend, refund, decay or overflow?
 *
 * WHAT THIS COMPOSES
 *
 *     src/engine/resources (through M4 state)   `observationOnEvent` (the own-cast
 *                                               PRE_COST path, unchanged),
 *                                               `resourceHistoryAt` (the latest
 *                                               observation and everything since,
 *                                               under RESOURCES continuity from it),
 *                                               `observationsWithinBefore` (the
 *                                               pre-decision window evidence)
 *     resource-types.ts                         wire type 6 = Runic Power, tenths
 *     state-result.ts `gateAbsenceClaim`        CASTS continuity over the same
 *                                               interval — a spend is a cast
 *
 * WHAT AN OBSERVATION IS WORTH — PINNED BY M4'S TIMING TAGS
 *
 *     PRE_COST        a costed cast: the exact amount BEFORE its cost. The
 *                     amount after is NOT knowable: the wire's `cost` is the
 *                     DBC base (450) and the deduction this build pays is 350,
 *                     or 250 under Blood Draw — not on the wire, and this
 *                     module never computes `pre - cost`, `pre - 350` or any
 *                     other number for it. The state is UNKNOWN until the
 *                     next observation.
 *     POST_CHANGE     a `resourcechange` of type 6: the exact amount AFTER the
 *                     change. Read, never computed: the `resourceChange`
 *                     delta beside it is a rounded whole number where Anti-
 *                     Magic Shell moved a fraction, and the amount is exact
 *                     where the delta is not. The delta is read only for its
 *                     SIGN.
 *     EVENT_ASSOCIATED an uncosted attachment (a melee swing, a Blood Boil, a
 *                     free Heart Strike): the exact amount at that instant.
 *                     A cast's own gain is a separate later `resourcechange`,
 *                     so this is never read as including it.
 *
 * NO IN-COMBAT REGENERATION OR DECAY EXISTS TO MODEL. Runic Power decays
 * only out of combat (`runic_power_decay_event_t` guards on `!in_combat`,
 * sc_death_knight.cpp:6350-6375) and every in-combat change is a discrete
 * `resource_gain` (a `resourcechange`) or an action cost (a costed cast).
 * The Blood corpus bears that out: carrying the latest exact observation
 * forward reproduces every later Death Strike PRE_COST amount (50 of 50) and
 * every later uncosted attachment (175 of 175) — zero hidden changes.
 *
 * THE PROOFS, IN THE FIXED ORDER
 *
 *   OWN_PRE_COST     the decision's own costed cast (a Death Strike): exact,
 *                    the M11-B2 path, untouched
 *   CARRIED_EXACT    the latest observation before the decision, walked
 *                    forward through every observation since under RESOURCES
 *                    and CASTS continuity — each `resourcechange` REPLACES the
 *                    state with its POST_CHANGE amount, each uncosted
 *                    attachment must AGREE with it, each costed cast reads
 *                    its PRE_COST against it and then leaves it unknown until
 *                    the next observation — with nothing inside the
 *                    pre-decision window: exact
 *   WINDOW_BOUNDED   observations of the actor's Runic Power sit ahead of the
 *                    decision within `BLOOD_RESOURCE_PRE_DECISION_WINDOW_MS`.
 *                    The corpus shows what these are — a Heart Strike's or
 *                    Vampiric Strike's own Heartbreaker gain, logged 0-1 ms
 *                    BEFORE the cast that caused it (78 of 78), and Relish in
 *                    Blood ahead of Death and Decay (9 of 9) — and this module
 *                    does not attribute them. If every window observation is
 *                    a non-negative change with an exact POST_CHANGE amount
 *                    (or an uncosted snapshot), then under BOTH readings the
 *                    pre-decision Runic Power is at most the last of those
 *                    amounts: a gain cannot lower it. That is bound as
 *                    `runic_power.deficit >= (max - A) / 10`, the existing
 *                    `BOUNDED_NUMBER`, and nothing more. No exact value, no
 *                    upper bound on the deficit, no choice of reading.
 *
 * WHAT IS REFUSED, BY NAME. No anchor; a RESOURCES or CASTS gap from the
 * anchor; a costed cast with no observation after it (POST_SPEND_NOT_
 * OBSERVED — the deferred bound is deliberately not built); an uncosted
 * snapshot that disagrees with the carried state (EVIDENCE_CONTRADICTS_CARRY
 * — never re-anchored around); a negative or unattached change; a spend or a
 * negative change inside the window; a missing or changing `max`;
 * non-monotonic time.
 *
 * UNITS. The wire carries tenths (`RUNIC_POWER_WIRE_DIVISOR`); SimulationCraft's
 * `runic_power.deficit` is `resources.max - resources.current` in points. The
 * two divisions in this file are the only conversions.
 */

import { inclusiveRange } from "../../../engine/evidence/coverage.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import type {
  ResourceAmountObservation,
  ResourceObservationTiming,
} from "../../../engine/resources/resource-observations.js";
import type { ResourceHistoryEntry } from "../../../engine/resources/resource-state.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import { gateAbsenceClaim, type UnknownReason } from "../../../engine/state/state-result.js";
import {
  boundedBelowNumber,
  knownNumber,
  unknownNumber,
  type NumericBinding,
} from "../../../simc/expression/evaluate.js";
import {
  bloodResourceOn,
  bloodResourceWireTypes,
  bloodWireKeys,
  RUNIC_POWER_WIRE_DIVISOR,
} from "./resources.js";

/**
 * How far ahead of an observed Blood decision a RESOURCE observation is of
 * unpinned attribution, in MILLISECONDS, inclusive: lead 0 and 1 inside, 2
 * outside. Derived from the resource census of the Blood corpus (a cast's
 * own proc gains lead it by 0 or 1 ms; every independent gain lay 7 ms or
 * more away), NOT from the 50 ms aura window and never aliased to it.
 */
export const BLOOD_RESOURCE_PRE_DECISION_WINDOW_MS = 1;

export type BloodRunicPowerProof = "OWN_PRE_COST" | "CARRIED_EXACT" | "WINDOW_BOUNDED";

export type BloodRunicPowerUnboundReason =
  /** No pinned wire contract for Runic Power in this log's schema. */
  | "WIRE_CONTRACT_NOT_PINNED"
  /** No Runic Power observation of the actor precedes the decision. */
  | "NO_ANCHOR"
  /** RESOURCES coverage from the anchor to the decision is not COMPLETE (or an unattributed snapshot lies between). */
  | "CONTINUITY_FROM_ANCHOR_UNKNOWN"
  /** CASTS coverage from the anchor to the decision is not COMPLETE: a costed cast could have been missed. */
  | "CASTS_CONTINUITY_UNKNOWN"
  /** A costed cast follows the last exact state and no observation establishes the state after it. */
  | "POST_SPEND_NOT_OBSERVED"
  /** An uncosted snapshot disagrees with the carried state and nothing observed explains the difference. */
  | "EVIDENCE_CONTRADICTS_CARRY"
  /** A costed cast sits inside the pre-decision window: the spend's side of the decision is not pinned. */
  | "WINDOW_SPEND_AMBIGUOUS"
  /** A `resourcechange` with a negative delta: its direction is not one this module has pinned. */
  | "NEGATIVE_CHANGE_UNPINNED"
  /** A `resourcechange` of the actor's Runic Power carries no POST_CHANGE attachment to read. */
  | "CHANGE_WITHOUT_POST_STATE"
  /** The anchor carries no `max`. */
  | "MAX_NOT_ESTABLISHED"
  /** Two observations in the interval report different maxima. */
  | "MAX_CHANGED"
  /** The decision precedes the anchor in time, or the capture is not monotonic. */
  | "NON_MONOTONIC_TIME";

/** One observation walked through or refused, as the diagnostics carry it. */
export interface BloodRunicPowerEntry {
  readonly position: number;
  readonly reportTimeMs: number;
  /** `POST_CHANGE` / `PRE_COST` / `EVENT_ASSOCIATED` of the snapshot, or `CHANGE_ONLY` for a change with no snapshot. */
  readonly shape: ResourceObservationTiming | "CHANGE_ONLY";
  /** The attached amount, wire units. */
  readonly amount: number | null;
  /** The standalone change's SIGN, when the event is one. The magnitude is never read here. */
  readonly changeSign: "NON_NEGATIVE" | "NEGATIVE" | null;
}

export interface BloodRunicPowerAnchor {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly reportTimeMs: number;
  readonly timing: ResourceObservationTiming;
  /** Wire units. */
  readonly amount: number;
  readonly max: number;
}

export type BloodRunicPowerState =
  | {
      readonly state: "BOUND";
      readonly proof: BloodRunicPowerProof;
      /** `runic_power.deficit` in POINTS: exact for the two exact proofs, a lower bound for WINDOW_BOUNDED. */
      readonly binding: NumericBinding;
      /** The exact current amount, wire units; null for WINDOW_BOUNDED. */
      readonly currentWire: number | null;
      /** The proven upper limit of the current amount, wire units, for WINDOW_BOUNDED; null otherwise. */
      readonly atMostWire: number | null;
      readonly maxWire: number;
      readonly anchor: BloodRunicPowerAnchor;
      /** Observations walked through between the anchor and the window/decision, in order. */
      readonly traversed: readonly BloodRunicPowerEntry[];
      /** Observations inside the pre-decision window, with their leads. */
      readonly windowEntries: readonly (BloodRunicPowerEntry & { readonly leadMs: number })[];
      /** `decision.reportTimeMs - anchor.reportTimeMs`. */
      readonly carryMs: number;
      /** `decision.position - anchor.position`. */
      readonly carryEvents: number;
      readonly basis: string;
    }
  | {
      readonly state: "UNBOUND";
      readonly reason: BloodRunicPowerUnboundReason;
      readonly stateReason: UnknownReason | null;
      readonly anchor: BloodRunicPowerAnchor | null;
      readonly detail: string | null;
    };

function unbound(
  reason: BloodRunicPowerUnboundReason,
  extra: {
    readonly stateReason?: UnknownReason | null;
    readonly anchor?: BloodRunicPowerAnchor | null;
    readonly detail?: string | null;
  } = {},
): BloodRunicPowerState {
  return {
    state: "UNBOUND",
    reason,
    stateReason: extra.stateReason ?? null,
    anchor: extra.anchor ?? null,
    detail: extra.detail ?? null,
  };
}

function anchorOf(observation: ResourceAmountObservation, max: number): BloodRunicPowerAnchor {
  return {
    position: observation.position,
    locator: observation.locator,
    reportTimeMs: observation.reportTimeMs,
    timing: observation.timing,
    amount: observation.observedAmount,
    max,
  };
}

function entryOf(entry: ResourceHistoryEntry): BloodRunicPowerEntry {
  return {
    position: entry.position,
    reportTimeMs: entry.snapshot?.reportTimeMs ?? entry.change?.reportTimeMs ?? -1,
    shape: entry.snapshot?.timing ?? "CHANGE_ONLY",
    amount: entry.snapshot?.observedAmount ?? null,
    changeSign: entry.changeSign,
  };
}

/** The running state while walking forward from the anchor. */
type Carried =
  | { readonly kind: "EXACT"; readonly wire: number }
  /** A costed cast was observed; the amount after its cost is not. */
  | { readonly kind: "AFTER_SPEND"; readonly preWire: number };

/** The `max` an entry reports, if any — the snapshot's, else the change's. */
function maxOf(entry: ResourceHistoryEntry): number | null {
  return entry.snapshot?.observedMax ?? entry.change?.maxResourceAmount ?? null;
}

/** Applies one observation to the carried state, or names the refusal. */
function step(
  carried: Carried,
  entry: ResourceHistoryEntry,
):
  | { readonly ok: true; readonly carried: Carried }
  | { readonly ok: false; readonly reason: BloodRunicPowerUnboundReason; readonly detail: string } {
  const at = String(entry.snapshot?.reportTimeMs ?? entry.change?.reportTimeMs ?? "?");
  if (entry.change !== null) {
    if (entry.changeSign === "NEGATIVE") {
      return {
        ok: false,
        reason: "NEGATIVE_CHANGE_UNPINNED",
        detail: `a negative resourcechange at ${at}`,
      };
    }
    if (entry.snapshot === null || entry.snapshot.timing !== "POST_CHANGE") {
      return {
        ok: false,
        reason: "CHANGE_WITHOUT_POST_STATE",
        detail: `the resourcechange at ${at} carries no POST_CHANGE attachment of the changed type`,
      };
    }
    // The state after the change is READ off the attachment. The delta is not
    // added to anything; it was consulted only for its sign above.
    return { ok: true, carried: { kind: "EXACT", wire: entry.snapshot.observedAmount } };
  }
  const snapshot = entry.snapshot;
  if (snapshot === null) {
    return { ok: false, reason: "CHANGE_WITHOUT_POST_STATE", detail: `an empty history entry at ${at}` };
  }
  if (snapshot.timing === "PRE_COST") {
    // The amount before this cast's cost is an exact observation of the state
    // at that instant: it must agree with what was carried (if anything was),
    // and after the cast the state is unknown until something observes it.
    if (carried.kind === "EXACT" && carried.wire !== snapshot.observedAmount) {
      return {
        ok: false,
        reason: "EVIDENCE_CONTRADICTS_CARRY",
        detail: `the costed cast at ${at} reports ${String(snapshot.observedAmount)} before its cost; the carried state was ${String(carried.wire)}`,
      };
    }
    return { ok: true, carried: { kind: "AFTER_SPEND", preWire: snapshot.observedAmount } };
  }
  if (snapshot.timing === "POST_CHANGE") {
    // A post-change attachment whose change is not this actor's standalone
    // entry (never seen in the corpus): still an exact observed state.
    return { ok: true, carried: { kind: "EXACT", wire: snapshot.observedAmount } };
  }
  // EVENT_ASSOCIATED: an uncosted snapshot. It corroborates an exact carry or
  // re-establishes the state after a spend; it never silently re-anchors an
  // exact state it disagrees with.
  if (carried.kind === "EXACT" && carried.wire !== snapshot.observedAmount) {
    return {
      ok: false,
      reason: "EVIDENCE_CONTRADICTS_CARRY",
      detail: `the uncosted snapshot at ${at} reports ${String(snapshot.observedAmount)}; the carried state was ${String(carried.wire)} and no observed change explains the difference`,
    };
  }
  return { ok: true, carried: { kind: "EXACT", wire: snapshot.observedAmount } };
}

export interface BloodRunicPowerInput {
  readonly state: CombatState;
  readonly actorId: number;
  /** Canonical index of the decision point. Never an ingestion ordinal. */
  readonly position: number;
}

/**
 * Binds `runic_power.deficit` at a decision, in the fixed conservative order:
 *
 *   1. wire contract pinned        2. the decision's own PRE_COST (exact)
 *   3. history: anchor + everything since, RESOURCES continuity from the anchor
 *   4. CASTS continuity over the same interval
 *   5. max established at the anchor and unchanged since
 *   6. walk every observation outside the window (exact / after-spend / refuse)
 *   7. the window: empty -> exact or POST_SPEND_NOT_OBSERVED;
 *      all non-negative -> lower bound; a spend or negative change -> refuse
 */
export function bindBloodRunicPower(input: BloodRunicPowerInput): BloodRunicPowerState {
  const { state, actorId, position } = input;
  // M11-B12: the contract must be pinned FOR THIS CAPTURE'S parser version.
  const wire = bloodResourceWireTypes(bloodWireKeys(state));
  if (!wire.ok) return unbound("WIRE_CONTRACT_NOT_PINNED", { detail: wire.reason });
  const decision = state.eventAt(position);
  if (decision === null) return unbound("NO_ANCHOR", { detail: "the decision position holds no event" });

  // 2. The decision's own costed cast — the M11-B2 path, unchanged.
  const own = bloodResourceOn(state, position, actorId, wire.runicPower);
  if (own.state === "EXACT_PRE_COST") {
    if (own.max === null)
      return unbound("MAX_NOT_ESTABLISHED", { detail: "the decision's own PRE_COST entry carries no max" });
    const observation = state.resources.observationOnEvent(position, actorId, wire.runicPower);
    const locator = observation.certainty === "EXACT" ? observation.value.locator : decision.locator;
    return {
      state: "BOUND",
      proof: "OWN_PRE_COST",
      binding: knownNumber((own.max - own.amount) / RUNIC_POWER_WIRE_DIVISOR),
      currentWire: own.amount,
      atMostWire: null,
      maxWire: own.max,
      anchor: {
        position,
        locator,
        reportTimeMs: decision.reportTimeMs,
        timing: "PRE_COST",
        amount: own.amount,
        max: own.max,
      },
      traversed: [],
      windowEntries: [],
      carryMs: 0,
      carryEvents: 0,
      basis: `the decision's own costed cast reports ${String(own.amount)} of ${String(own.max)} (wire tenths) before its cost`,
    };
  }

  // 3. The history under RESOURCES continuity from the anchor.
  const history = state.resources.resourceHistoryAt({
    actorId,
    resourceType: wire.runicPower,
    at: { anchor: "BEFORE_EVENT", position },
  });
  if (history.certainty !== "EXACT") {
    const reason: UnknownReason = history.certainty === "UNKNOWN" ? history.reason : "UNSUPPORTED_DERIVATION";
    if (reason === "NON_MONOTONIC_TIME") return unbound("NON_MONOTONIC_TIME", { stateReason: reason });
    if (reason === "NO_OBSERVATION" || reason === "AMBIGUOUS_INITIAL_STATE") {
      return unbound("NO_ANCHOR", { stateReason: reason });
    }
    return unbound("CONTINUITY_FROM_ANCHOR_UNKNOWN", { stateReason: reason });
  }
  const { anchor: anchorObservation, since } = history.value;
  if (anchorObservation.observedMax === null) {
    return unbound("MAX_NOT_ESTABLISHED", { detail: "the anchor observation carries no max" });
  }
  const max = anchorObservation.observedMax;
  const anchor = anchorOf(anchorObservation, max);
  if (decision.reportTimeMs < anchor.reportTimeMs) {
    return unbound("NON_MONOTONIC_TIME", { anchor, stateReason: "NON_MONOTONIC_TIME" });
  }

  // 4. CASTS continuity over the same interval: a missed costed cast is a
  // missed spend, and a spend is a cast, not a resource event.
  const casts = gateAbsenceClaim({
    completeness: state.fight.completeness,
    category: "CASTS",
    range: inclusiveRange(anchor.reportTimeMs, decision.reportTimeMs),
    actorId,
  });
  if (!casts.ok) {
    return unbound("CASTS_CONTINUITY_UNKNOWN", { anchor, stateReason: casts.reason });
  }

  // 4b. An uncosted anchor is corroborated against the exact state before it
  // when that state carries to it cleanly: two consecutive observations that
  // disagree with no observed change between them would mean a change this
  // model has no event for, and the carry is refused rather than re-anchored.
  if (anchorObservation.timing === "EVENT_ASSOCIATED") {
    const prior = state.resources.resourceHistoryAt({
      actorId,
      resourceType: wire.runicPower,
      at: { anchor: "BEFORE_EVENT", position: anchor.position },
    });
    if (
      prior.certainty === "EXACT" &&
      prior.value.anchor.timing !== "PRE_COST" &&
      prior.value.since.length === 0 &&
      prior.value.anchor.observedAmount !== anchorObservation.observedAmount
    ) {
      return unbound("EVIDENCE_CONTRADICTS_CARRY", {
        anchor,
        detail:
          `the uncosted snapshot at ${String(anchor.reportTimeMs)} reports ${String(anchor.amount)}; the ${prior.value.anchor.timing} ` +
          `observation at ${String(prior.value.anchor.reportTimeMs)} reports ${String(prior.value.anchor.observedAmount)} and no ` +
          "observed change lies between them",
      });
    }
  }

  // 5. Max, at the anchor and everywhere since.
  for (const entry of since) {
    const reported = maxOf(entry);
    if (reported !== null && reported !== max) {
      return unbound("MAX_CHANGED", {
        anchor,
        detail: `the anchor reports max ${String(max)}; the observation at position ${String(entry.position)} reports ${String(reported)}`,
      });
    }
  }

  // 6. Split the history at the window and walk everything before it.
  const window = state.resources.observationsWithinBefore(
    actorId,
    wire.runicPower,
    position,
    BLOOD_RESOURCE_PRE_DECISION_WINDOW_MS,
  );
  // The primitive returns every observation ahead of the decision inside the
  // window — the anchor itself included when it is that close.
  const windowPositions = new Set(window.map((item) => item.entry.position));

  let carried: Carried =
    anchorObservation.timing === "PRE_COST"
      ? { kind: "AFTER_SPEND", preWire: anchorObservation.observedAmount }
      : { kind: "EXACT", wire: anchorObservation.observedAmount };
  const traversed: BloodRunicPowerEntry[] = [];
  for (const entry of since) {
    if (windowPositions.has(entry.position)) continue;
    const next = step(carried, entry);
    if (!next.ok) return unbound(next.reason, { anchor, detail: next.detail });
    carried = next.carried;
    traversed.push(entryOf(entry));
  }

  // 7. The window.
  const windowEntries: (BloodRunicPowerEntry & { readonly leadMs: number })[] = [];
  const windowItems = window.map((item) => ({ entry: item.entry, leadMs: item.leadMs }));
  if (windowItems.length === 0) {
    if (carried.kind !== "EXACT") {
      return unbound("POST_SPEND_NOT_OBSERVED", {
        anchor,
        detail: `a costed cast reporting ${String(carried.preWire)} before its cost is the last observation; the amount after it was not observed`,
      });
    }
    return {
      state: "BOUND",
      proof: "CARRIED_EXACT",
      binding: knownNumber((max - carried.wire) / RUNIC_POWER_WIRE_DIVISOR),
      currentWire: carried.wire,
      atMostWire: null,
      maxWire: max,
      anchor,
      traversed,
      windowEntries: [],
      carryMs: decision.reportTimeMs - anchor.reportTimeMs,
      carryEvents: position - anchor.position,
      basis:
        `the ${anchor.timing} observation at ${String(anchor.reportTimeMs)} (${String(anchor.amount)} of ${String(max)}) carried ` +
        `through ${String(traversed.length)} observation(s) under RESOURCES and CASTS continuity; every resourcechange replaced the ` +
        `state with its read POST_CHANGE amount, every uncosted snapshot agreed; ${String(carried.wire)} of ${String(max)} at the decision`,
    };
  }
  let atMost: number | null = null;
  for (const item of windowItems) {
    const entry = item.entry;
    if (entry.changeSign === "NEGATIVE") {
      return unbound("NEGATIVE_CHANGE_UNPINNED", {
        anchor,
        detail: `a negative resourcechange ${String(item.leadMs)} ms ahead of the decision`,
      });
    }
    if (entry.snapshot?.timing === "PRE_COST") {
      return unbound("WINDOW_SPEND_AMBIGUOUS", {
        anchor,
        detail: `a costed cast ${String(item.leadMs)} ms ahead of the decision`,
      });
    }
    if (entry.snapshot === null) {
      return unbound("CHANGE_WITHOUT_POST_STATE", {
        anchor,
        detail: `a resourcechange ${String(item.leadMs)} ms ahead carries no attachment`,
      });
    }
    atMost = entry.snapshot.observedAmount;
    windowEntries.push({ ...entryOf(entry), leadMs: item.leadMs });
  }
  if (atMost === null) return unbound("CHANGE_WITHOUT_POST_STATE", { anchor });
  return {
    state: "BOUND",
    proof: "WINDOW_BOUNDED",
    binding: boundedBelowNumber((max - atMost) / RUNIC_POWER_WIRE_DIVISOR, "STATE_NOT_ESTABLISHED"),
    currentWire: null,
    atMostWire: atMost,
    maxWire: max,
    anchor,
    traversed,
    windowEntries,
    carryMs: decision.reportTimeMs - anchor.reportTimeMs,
    carryEvents: position - anchor.position,
    basis:
      `${String(windowEntries.length)} non-negative resource observation(s) sit 0-${String(BLOOD_RESOURCE_PRE_DECISION_WINDOW_MS)} ms ahead of the decision ` +
      `(leads ${windowEntries.map((w) => String(w.leadMs)).join(",")}); whether they precede or follow the decision is not pinned, and under both ` +
      `readings the Runic Power before it is at most the last read amount ${String(atMost)} of ${String(max)}: deficit >= ${String((max - atMost) / RUNIC_POWER_WIRE_DIVISOR)}`,
  };
}

/** The `runic_power.deficit` binding: the proof's number, or an explicit modelled-but-unestablished unknown. */
export function bloodRunicPowerDeficitBinding(rp: BloodRunicPowerState): NumericBinding {
  return rp.state === "BOUND" ? rp.binding : unknownNumber("STATE_NOT_ESTABLISHED");
}
