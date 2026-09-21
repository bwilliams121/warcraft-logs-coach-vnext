/**
 * `buff.<name>.remains` — the Blood-owned reading of an aura's remaining
 * duration at a decision (M11-B4).
 *
 * THE QUESTION THIS ANSWERS
 *
 *     What can be proved about the remaining duration of this aura at the
 *     instant immediately before this observed decision, using ONLY pinned
 *     mechanics and causally prior Warcraft Logs evidence?
 *
 * WHAT THIS COMPOSES
 *
 *     src/engine/auras (through M4 state)      `presenceAt` (ACTIVE / INACTIVE
 *                                              from an OBSERVED transition),
 *                                              `gainHistoryAt` (the last gain
 *                                              and everything since, under a
 *                                              continuity claim FROM the gain),
 *                                              `transitionsWithinBefore` (the
 *                                              pre-decision window evidence)
 *     deathknight-blood-aura-authority         which spell an atom reads, and
 *                                              the build proofs
 *     deathknight-blood-aura-durations         the pinned duration SimulationCraft
 *                                              resolves for Blood and the
 *                                              remains model it applies
 *     remains-thresholds                       the literals the pinned list
 *                                              compares each atom against
 *
 * WHAT THE EXPRESSION MEANS (pinned, buff.cpp:2018-2029 at 33622e9d)
 *
 *     inactive                          0
 *     active, expiration scheduled      expiry time minus now, in seconds
 *     active, no expiration (permanent) timespan_t::min() — a huge negative
 *                                       number, nonzero, so TRUE as a truth
 *
 * WARCRAFT LOGS DOES NOT REPORT IT. It reports that an aura was APPLIED,
 * gained a stack, was REFRESHED, lost a stack, or was REMOVED, at a time. A
 * remainder is DERIVED from an observed gain, the pinned duration and the
 * pinned refresh semantics:
 *
 *     FIXED_DURATION_RESET_ON_GAIN
 *         remainsMs = gainTimeMs + finalDurationMs - decisionTimeMs
 *
 *         where the GAIN is the last APPLIED (with or without a stack
 *         number) or REFRESHED transition. Every `buff_t::trigger` on an
 *         active buff of this model is a DURATION refresh that reschedules
 *         the expiry to the FULL duration (buff.cpp:1900-1906, 2532-2578);
 *         an application starts it (buff.cpp:2428-2470). A stack LOSS
 *         (`decrement`, buff.cpp:2246-2290) never touches the expiry, so
 *         `removebuffstack` transitions between the gain and the decision
 *         are walked THROUGH, not anchored on.
 *
 *     PERMANENT
 *         ACTIVE binds `SIMC_PERMANENT_BUFF_REMAINS_SECONDS`; nothing else
 *         is derived, because nothing else is defined.
 *
 * THE AMBIGUOUS REFRESH, AND WHY IT IS A LOWER BOUND. A `refreshbuff` is an
 * exact observation that the aura was refreshed; what it did to the expiry
 * is pinned only when the refresh is the pinned producer's trigger. Two
 * shapes are NOT that, and each identity's `remainsPolicy` (the aura
 * authority data) says which applies:
 *
 *   - PINNED_TRIGGER_RESET (M11-B4; Bone Shield, Crimson Scourge, Visceral
 *     Strength): a lone refresh is the trigger's DURATION refresh and anchors
 *     exactly — except beside a stack REMOVAL, a shape the pinned decrement
 *     does not produce (7 of 25 Bone Shield charge consumptions in the
 *     corpus, each at a melee hit taken).
 *   - UNPROVEN_CAUSE (M11-B8; Essence of the Blood Queen): the wire carries
 *     refreshes of this aura for a cause the pinned module has no producer
 *     for (one at every Gift of the San'layn edge, with no Vampiric Strike
 *     cast near it), so NO lone refresh — one without a same-millisecond
 *     `applybuff` / `applybuffstack` companion — is assigned a cause, not by
 *     the cast 0-1 ms after it, not by the Gift edge beside it, not by the
 *     absence of any other visible producer. A refresh beside an exact gain
 *     is that gain's companion; the gain anchors, exactly as before.
 *
 * Under EITHER shape the expiry is at least the earlier unambiguous gain's
 * time plus the duration — the refresh either reset the duration (expiry
 * later) or did nothing (expiry unchanged), and a DURATION refresh can only
 * move an expiry LATER — so that is bound as `BOUNDED_NUMBER { atLeast }`
 * and nothing more. No interpretation is chosen, and "the aura is still
 * active, so the refresh must have reset it" is a deduction this module
 * explicitly does NOT make: an `atLeast` that has already run out is
 * UNKNOWN (`AMBIGUOUS_REFRESH_BEYOND_BASE_DURATION`).
 *
 * NO FUTURE ORACLE, NO WINDOW ORACLE. Every query is `BEFORE_EVENT` at the
 * decision, and a transition of the identity inside the Blood pre-decision
 * window ahead of the decision refuses every EXACT reading — the same
 * policy `.up` and `.stack` apply (`aura-bindings.ts`).
 *
 * THE ORDER-INVARIANT WINDOW BOUND (M11-B8, `.remains` only, identities whose
 * policy admits it). The window exists because Warcraft Logs may write a
 * cast's own aura effect 0-50 ms BEFORE the cast, so a transition inside it
 * belongs to one of two orderings nobody can tell apart from the wire:
 *
 *     H1  the transition followed the decision (it is the decision's own
 *         effect): the state that governed is the chain BEFORE the window
 *         cluster, projected forward by the elapsed milliseconds — derived
 *         by this module's ordinary rules at the cluster's first position,
 *         so every refusal (coverage, ambiguous initial state, chain
 *         exhaustion, non-monotonic time, unpinned shape, the lone-refresh
 *         policy) applies to it unchanged;
 *     H2  the transition preceded the decision: if it was a duration reset
 *         the aura then had the full duration minus the lead; if it was a
 *         refresh that reset nothing, the state is H1 again.
 *
 * When every transition in the cluster is a stack gain or a refresh — the
 * shapes under which BOTH orderings leave the aura active — the remainder
 * is at least `min(H1, H2)` whichever ordering is true. That is what is
 * bound (`WINDOW_ORDER_INVARIANT_BOUNDED`, a `BOUNDED_NUMBER`), and it is
 * not an ordering choice, not an attribution of the transition to the cast,
 * and never a KNOWN value. A cluster holding a plain application (the two
 * orderings are inactive versus fully active), any removal, or a shape this
 * module does not foresee stays `PRE_DECISION_WINDOW_TRANSITION`; so does a
 * cluster whose H1 the ordinary rules cannot establish, and a bound that has
 * run out. The window constant is not touched.
 *
 * COVERAGE FROM THE GAIN. `presenceAt` earns continuity from its own anchor,
 * which may be a later stack loss; a missed refresh in the gap between the
 * gain and that loss would UNDERSTATE the remainder — the direction that
 * makes `remains<1.5` read TRUE for an aura that was just refreshed.
 * `gainHistoryAt` earns continuity from the gain itself, and a gap there is
 * UNKNOWN.
 *
 * THRESHOLD TOLERANCE. An exact remainder within
 * `BLOOD_REMAINS_THRESHOLD_TOLERANCE_MS` of a literal the pinned list compares
 * THIS atom against is refused: the measured aura-versus-cast timestamp
 * skew (0 / 1 / 20 ms) and expiry jitter (-7..+12 ms) make a verdict resting
 * on a sub-tolerance margin unjustified. The M11-B4 gain-anchored BOUND is
 * not subject to it: a bound decides only when the whole undecided side lies
 * beyond the threshold, and the margin of a bound is not a distance nobody
 * measured. The order-invariant window bound IS subject to it (M11-B8): its
 * edge is exact arithmetic on the same skewed timestamps, and an edge inside
 * the tolerance of a threshold must not be the thing that decides that
 * comparison, so the binding is refused (`WITHIN_TIMING_TOLERANCE_OF_
 * THRESHOLD`, margin recorded) rather than narrowed.
 *
 * UNITS. Evidence and the artifact are MILLISECONDS; the expression is
 * SECONDS. The single `/ 1000` in this file is the only place they meet.
 */

import type { AuraObservation } from "../../../engine/auras/aura-observations.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import type { UnknownReason } from "../../../engine/state/state-result.js";
import {
  bloodAuraIdentityFor,
  type BloodAuraIdentity,
} from "../../../data/game/deathknight-blood-aura-authority.js";
import { bloodAuraDurationForAtom } from "../../../data/game/deathknight-blood-aura-durations.js";
import type { BloodAuraDurationIdentity } from "../../../data/game/deathknight-blood-aura-duration-artifact.js";
import {
  boundedBelowNumber,
  knownNumber,
  SIMC_PERMANENT_BUFF_REMAINS_SECONDS,
  unknownNumber,
  type NumericBinding,
} from "../../../simc/expression/evaluate.js";
import {
  BLOOD_PRE_DECISION_WINDOW_MS,
  identityQuery,
  impossibleByBuild,
  preDecisionWindowTransition,
  type BloodAuraInput,
  type BloodWindowTransition,
} from "./aura-bindings.js";
import { pinnedRemainsThresholdSecondsFor } from "./remains-thresholds.js";

/**
 * How close an EXACT remainder may lie to a pinned threshold and still be
 * bound, in MILLISECONDS, inclusive. Separate from the pre-decision window
 * and never aliased to it: one is about which transitions may be read, the
 * other about which verdicts a read value may carry.
 */
export const BLOOD_REMAINS_THRESHOLD_TOLERANCE_MS = 50;

/** The atoms the slice reads as `buff.<name>.remains`. */
export const SUPPORTED_BLOOD_REMAINS_ATOMS = [
  "bone_shield",
  "essence_of_the_blood_queen",
  "vampiric_strike",
  "crimson_scourge",
  "visceral_strength",
] as const;

export type BloodRemainsProof =
  | "HERO_TREE_EXCLUDED"
  | "TALENT_NOT_SELECTED"
  | "PROVEN_INACTIVE"
  | "PERMANENT_ACTIVE"
  | "GAIN_ANCHOR_EXACT"
  | "GAIN_ANCHOR_BOUNDED"
  /** The lower bound both orderings of the pre-decision window cluster agree on (M11-B8). */
  | "WINDOW_ORDER_INVARIANT_BOUNDED";

export type BloodRemainsUnboundReason =
  /** No pinned identity carries this atom name. */
  | "IDENTITY_NOT_PINNED"
  /** The duration artifact carries no entry for this atom (or disagrees with the identity). */
  | "DURATION_NOT_MODELLED"
  /** A transition of this identity sits inside the pre-decision window ahead of the decision. */
  | "PRE_DECISION_WINDOW_TRANSITION"
  /** M4 could not establish presence. Carries M4's reason. */
  | "AURA_STATE_UNKNOWN"
  /** ACTIVE, but no APPLIED/REFRESHED transition precedes the decision in the observed history. */
  | "NO_GAIN_OBSERVED"
  /** A gain exists, but the interval from it to the decision is not COMPLETE for this identity. */
  | "CONTINUITY_FROM_GAIN_UNKNOWN"
  /** A transition between the gain and the decision has no pinned effect on the expiry. */
  | "UNPINNED_TRANSITION_SHAPE"
  /** The ambiguous refresh's lower bound from the earlier gain has already run out. */
  | "AMBIGUOUS_REFRESH_BEYOND_BASE_DURATION"
  /** Presence says ACTIVE; the pinned duration says expired. Both cannot be right. */
  | "DURATION_MODEL_CONTRADICTS_EVIDENCE"
  /** The decision precedes the gain in time; the capture's ordering cannot carry arithmetic. */
  | "NON_MONOTONIC_TIME"
  /** The exact remainder (or the order-invariant bound's exact edge) lies within the tolerance of a threshold the pinned list compares this atom against. */
  | "WITHIN_TIMING_TOLERANCE_OF_THRESHOLD";

/** The gain a bound value rests on. */
export interface BloodRemainsAnchor {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly operation: AuraObservation["operation"];
  readonly isStackChange: boolean;
  readonly reportTimeMs: number;
}

/**
 * The two orderings an order-invariant window bound was taken over
 * (M11-B8). Recorded so the evidence shows the value is the minimum of both,
 * not a reading of either.
 */
export interface BloodWindowOrderInvariance {
  /** Every transition of the identity inside the window, earliest first. */
  readonly cluster: readonly BloodWindowTransition[];
  /** H1: the chain before the cluster, projected to the decision, MILLISECONDS. */
  readonly beforeClusterMs: number;
  /** Whether H1 is itself an exact remainder or a lower bound. */
  readonly beforeClusterProof: "GAIN_ANCHOR_EXACT" | "GAIN_ANCHOR_BOUNDED";
  /** H2: the full duration minus the latest transition's lead, MILLISECONDS. */
  readonly resetInClusterMs: number;
}

/** The refused threshold proximity, for WITHIN_TIMING_TOLERANCE_OF_THRESHOLD. */
export interface BloodRemainsThresholdMargin {
  readonly thresholdSeconds: number;
  readonly remainsMs: number;
  /** `|remainsMs - thresholdSeconds * 1000|`, milliseconds. */
  readonly marginMs: number;
}

export type BloodRemainsBinding =
  | {
      readonly atomName: string;
      readonly state: "BOUND";
      readonly abilityGameId: number;
      readonly proof: BloodRemainsProof;
      /** SECONDS: the one converted value, exactly what the expression binding carries. */
      readonly binding: NumericBinding;
      /** MILLISECONDS, as derived: the exact remainder, or the lower bound for the two BOUNDED proofs; null for zero/permanent proofs. */
      readonly remainsMs: number | null;
      /** The pinned duration applied, MILLISECONDS; null for the build proofs. */
      readonly durationMs: number | null;
      /** The gain (or presence anchor) the value rests on; null for the build proofs. */
      readonly anchor: BloodRemainsAnchor | null;
      /** Observations walked through between the anchor and the decision (stack losses; an ambiguous refresh). */
      readonly walkedThrough: number;
      /** The two orderings a WINDOW_ORDER_INVARIANT_BOUNDED value is the minimum over; null for every other proof. */
      readonly windowOrderInvariance: BloodWindowOrderInvariance | null;
      readonly basis: string;
    }
  | {
      readonly atomName: string;
      readonly state: "UNBOUND";
      readonly reason: BloodRemainsUnboundReason;
      readonly abilityGameId: number | null;
      readonly auraReason: UnknownReason | null;
      readonly windowTransition: BloodWindowTransition | null;
      readonly thresholdMargin: BloodRemainsThresholdMargin | null;
      readonly detail: string | null;
    };

function unbound(
  atomName: string,
  reason: BloodRemainsUnboundReason,
  abilityGameId: number | null,
  extra: {
    readonly auraReason?: UnknownReason | null;
    readonly windowTransition?: BloodWindowTransition | null;
    readonly thresholdMargin?: BloodRemainsThresholdMargin | null;
    readonly detail?: string | null;
  } = {},
): BloodRemainsBinding {
  return {
    atomName,
    state: "UNBOUND",
    reason,
    abilityGameId,
    auraReason: extra.auraReason ?? null,
    windowTransition: extra.windowTransition ?? null,
    thresholdMargin: extra.thresholdMargin ?? null,
    detail: extra.detail ?? null,
  };
}

function anchorOf(observation: AuraObservation): BloodRemainsAnchor {
  return {
    position: observation.position,
    locator: observation.locator,
    operation: observation.operation,
    isStackChange: observation.isStackChange,
    reportTimeMs: observation.reportTimeMs,
  };
}

/**
 * Whether a REFRESHED gain is of UNPROVEN cause under the identity's
 * `remainsPolicy.loneRefresh`, read off its same-millisecond companions on
 * the track (positions strictly before the query position):
 *
 *   - beside an APPLIED companion (an application or a stack gain) it is
 *     that gain's companion under BOTH policies: never ambiguous, and the
 *     gain is what anchors;
 *   - PINNED_TRIGGER_RESET: ambiguous only beside a stack REMOVAL (M11-B4);
 *     alone it is the pinned trigger's DURATION refresh;
 *   - UNPROVEN_CAUSE: ambiguous whenever no APPLIED companion exists
 *     (M11-B8) — the cast 0-1 ms after it, the Gift edge beside it, or the
 *     absence of any other visible producer names no cause.
 */
function isAmbiguousRefresh(
  input: BloodAuraInput,
  identity: BloodAuraIdentity,
  gain: AuraObservation,
): boolean {
  if (gain.operation !== "REFRESHED" || gain.isStackChange) return false;
  const track = input.state.auras.trackFor(identityQuery(input, identity));
  if (track === null) return false;
  let removal = false;
  for (const position of track.positions) {
    if (position >= input.position) break;
    const companion = input.state.auras.observationAt(position);
    if (
      companion === null ||
      companion.reportTimeMs !== gain.reportTimeMs ||
      companion.position === gain.position
    )
      continue;
    if (companion.operation === "APPLIED") return false;
    if (companion.operation === "REMOVED" && companion.isStackChange) removal = true;
  }
  return identity.remainsPolicy.loneRefresh === "UNPROVEN_CAUSE" || removal;
}

/** How the basis names an ambiguous refresh under the identity's policy. */
function describeAmbiguousRefresh(identity: BloodAuraIdentity): string {
  return identity.remainsPolicy.loneRefresh === "UNPROVEN_CAUSE"
    ? "a refresh of unproven cause (no same-millisecond gain companion; this aura is refreshed by causes the pinned module has no producer for)"
    : "a refresh of unpinned cause (beside a stack removal)";
}

/** Whether every observation walked through has a pinned "does not move the expiry" meaning. */
function unpinnedShapeAmong(since: readonly AuraObservation[]): AuraObservation | null {
  for (const observation of since) {
    // A stack loss is pinned (decrement leaves the expiry alone). Nothing else
    // can sit between the LAST gain and an ACTIVE presence — a full removal
    // would have made presence INACTIVE — but a shape this code did not
    // foresee is refused rather than walked through.
    if (observation.operation === "REMOVED" && observation.isStackChange) continue;
    return observation;
  }
  return null;
}

/**
 * Binds one pinned `buff.<name>.remains` atom at a decision position, in
 * the conservative proof order the M11-B4 design fixed:
 *
 *   1. identity pinned            2. duration modelled
 *   3. build impossibility -> 0   4. pre-decision window refusal, or the
 *                                    order-invariant bound (M11-B8)
 *   5. M4 presence EXACT          6. INACTIVE -> 0
 *   7. PERMANENT + ACTIVE -> sentinel
 *   8. gain history under continuity from the gain
 *   9. intervening transitions classified
 *  10. exact, or a lower bound past an ambiguous refresh
 *  11. contradiction check       12. threshold tolerance
 */
export function bindBloodRemains(input: BloodAuraInput, atomName: string): BloodRemainsBinding {
  return bindBloodRemainsAt(input, atomName, true);
}

/**
 * The binding proper. `windowBoundAdmitted` is true for the decision itself
 * and FALSE for the H1 leg of the order-invariant window bound, so a cluster
 * whose own chain runs into a second window is refused rather than bounded
 * recursively: one disjunction over one cluster, never a chain of them.
 */
function bindBloodRemainsAt(
  input: BloodAuraInput,
  atomName: string,
  windowBoundAdmitted: boolean,
): BloodRemainsBinding {
  const identity = bloodAuraIdentityFor(atomName);
  if (identity === null || identity.auraClass === "DEBUFF") {
    return unbound(atomName, "IDENTITY_NOT_PINNED", identity?.abilityGameId ?? null);
  }
  const duration = bloodAuraDurationForAtom(atomName);
  if (duration === null || duration.abilityGameId !== identity.abilityGameId) {
    return unbound(atomName, "DURATION_NOT_MODELLED", identity.abilityGameId, {
      detail:
        duration === null
          ? "the pinned Blood aura-duration artifact carries no entry for this atom"
          : `the duration artifact pins spell ${String(duration.abilityGameId)} for this atom; the identity pins ${String(identity.abilityGameId)}`,
    });
  }

  // 3. A build proof: the aura is impossible, so it is inactive, so zero.
  const impossible = impossibleByBuild(identity, input);
  if (impossible !== null) {
    return {
      atomName,
      state: "BOUND",
      abilityGameId: identity.abilityGameId,
      proof: impossible.proof,
      binding: knownNumber(0),
      remainsMs: null,
      durationMs: null,
      anchor: null,
      walkedThrough: 0,
      windowOrderInvariance: null,
      basis: `${impossible.basis}; an inactive aura's remains is 0 (buff.cpp:2020-2023)`,
    };
  }

  // 4. The pre-decision window: every exact reading is refused. For an
  // identity whose policy admits it, the one fact true under both orderings
  // of the cluster may still be bound (M11-B8); otherwise, or when that fact
  // cannot be established, the refusal stands with the reason recorded.
  const windowTransition = preDecisionWindowTransition(input, identity);
  if (windowTransition !== null) {
    if (!windowBoundAdmitted || !identity.remainsPolicy.windowOrderInvariantBound) {
      return unbound(atomName, "PRE_DECISION_WINDOW_TRANSITION", identity.abilityGameId, {
        windowTransition,
      });
    }
    return orderInvariantWindowBound(input, identity, duration, windowTransition);
  }

  // 5-6. Presence, and the one zero path an observation can prove.
  const query = identityQuery(input, identity);
  const at = { anchor: "BEFORE_EVENT", position: input.position } as const;
  const presence = input.state.auras.presenceAt({ ...query, at });
  if (presence.certainty !== "EXACT") {
    return unbound(atomName, "AURA_STATE_UNKNOWN", identity.abilityGameId, {
      auraReason: "reason" in presence ? presence.reason : null,
    });
  }
  if (presence.value.presence === "INACTIVE") {
    return {
      atomName,
      state: "BOUND",
      abilityGameId: identity.abilityGameId,
      proof: "PROVEN_INACTIVE",
      binding: knownNumber(0),
      remainsMs: null,
      durationMs: null,
      anchor: anchorOf(presence.value.anchor),
      walkedThrough: 0,
      windowOrderInvariance: null,
      basis: `M4 presence EXACT INACTIVE, anchored on the removal observed at report time ${String(presence.value.anchor.reportTimeMs)}; an inactive aura's remains is 0 (buff.cpp:2020-2023)`,
    };
  }

  // 7. A permanent aura that is up.
  if (duration.remainsModel === "PERMANENT") {
    return {
      atomName,
      state: "BOUND",
      abilityGameId: identity.abilityGameId,
      proof: "PERMANENT_ACTIVE",
      binding: knownNumber(SIMC_PERMANENT_BUFF_REMAINS_SECONDS),
      remainsMs: null,
      durationMs: 0,
      anchor: anchorOf(presence.value.anchor),
      walkedThrough: 0,
      windowOrderInvariance: null,
      basis:
        `M4 presence EXACT ACTIVE (anchor at report time ${String(presence.value.anchor.reportTimeMs)}); the pinned ` +
        "_duration is non-positive, no expiration is scheduled, and remains() is timespan_t::min() (buff.cpp:2024-2028)",
    };
  }

  // 8. The gain and everything since, under continuity from the gain.
  const decision = input.state.eventAt(input.position);
  if (decision === null) {
    return unbound(atomName, "AURA_STATE_UNKNOWN", identity.abilityGameId, { auraReason: "NO_OBSERVATION" });
  }
  return deriveFromGain(input, identity, duration, decision.reportTimeMs, input.position, [], 0);
}

/** The shapes under which BOTH orderings of a window transition leave the aura active with a known floor. */
function isOrderInvariantShape(observation: AuraObservation): boolean {
  return (
    (observation.operation === "APPLIED" && observation.isStackChange) ||
    (observation.operation === "REFRESHED" && !observation.isStackChange)
  );
}

/**
 * The order-invariant lower bound inside the pre-decision window (M11-B8).
 *
 *     H1 = the ordinary derivation at the cluster's FIRST position (the state
 *          before any transition of the cluster), minus the milliseconds from
 *          that transition to the decision
 *     H2 = the pinned duration minus the LATEST transition's lead
 *     atLeast = min(H1, H2)
 *
 * H1 is computed with the window bound NOT admitted, so it carries every
 * ordinary refusal and can only be an exact remainder or the gain-anchored
 * bound. Nothing here decides which ordering happened; the value is what
 * both leave.
 */
function orderInvariantWindowBound(
  input: BloodAuraInput,
  identity: BloodAuraIdentity,
  duration: BloodAuraDurationIdentity,
  latest: BloodWindowTransition,
): BloodRemainsBinding {
  const refuse = (detail: string): BloodRemainsBinding =>
    unbound(identity.atomName, "PRE_DECISION_WINDOW_TRANSITION", identity.abilityGameId, {
      windowTransition: latest,
      detail,
    });
  if (duration.remainsModel !== "FIXED_DURATION_RESET_ON_GAIN") {
    return refuse("the order-invariant bound is defined for the FIXED_DURATION_RESET_ON_GAIN model only");
  }
  const found = input.state.auras.transitionsWithinBefore(
    identityQuery(input, identity),
    input.position,
    BLOOD_PRE_DECISION_WINDOW_MS,
  );
  const cluster: BloodWindowTransition[] = found.map((entry) => ({
    position: entry.observation.position,
    reportTimeMs: entry.observation.reportTimeMs,
    operation: entry.observation.operation,
    isStackChange: entry.observation.isStackChange,
    leadMs: entry.leadMs,
  }));
  const first = found[0];
  if (first === undefined) return refuse("no transition of the identity was found inside the window");
  const offending = found.find((entry) => !isOrderInvariantShape(entry.observation));
  if (offending !== undefined) {
    const shape = `${offending.observation.operation}${offending.observation.isStackChange ? " (stack)" : ""}`;
    return refuse(
      `the window cluster holds a ${shape} transition at report time ${String(offending.observation.reportTimeMs)}; ` +
        "the two orderings of that shape do not share a positive floor (inactive against active, or expired against active), so no order-invariant bound exists",
    );
  }
  const decision = input.state.eventAt(input.position);
  if (decision === null) return refuse("the decision position holds no event");

  // H1: the ordinary derivation immediately before the cluster, window bound
  // not admitted, then projected to the decision by the elapsed time.
  const before = bindBloodRemainsAt(
    { ...input, position: first.observation.position },
    identity.atomName,
    false,
  );
  if (before.state === "UNBOUND" && before.reason === "WITHIN_TIMING_TOLERANCE_OF_THRESHOLD") {
    // H1 itself sits inside the tolerance band at the cluster's first
    // transition (0-50 ms before the decision): the same refusal, carried.
    return unbound(identity.atomName, "WITHIN_TIMING_TOLERANCE_OF_THRESHOLD", identity.abilityGameId, {
      windowTransition: latest,
      thresholdMargin: before.thresholdMargin,
      detail: `the chain before the cluster: ${before.detail ?? "within tolerance of a pinned threshold"}`,
    });
  }
  if (
    before.state !== "BOUND" ||
    (before.proof !== "GAIN_ANCHOR_EXACT" && before.proof !== "GAIN_ANCHOR_BOUNDED") ||
    before.remainsMs === null
  ) {
    return refuse(
      `the chain before the cluster does not establish the aura's remainder (${
        before.state === "BOUND" ? before.proof : before.reason
      }), so the ordering in which the cluster followed the decision has no floor`,
    );
  }
  const elapsedMs = decision.reportTimeMs - first.observation.reportTimeMs;
  if (elapsedMs < 0) {
    return unbound(identity.atomName, "NON_MONOTONIC_TIME", identity.abilityGameId, {
      auraReason: "NON_MONOTONIC_TIME",
      windowTransition: latest,
    });
  }
  const beforeClusterMs = before.remainsMs - elapsedMs;
  // H2: a reset at the latest transition leaves the full duration minus its lead.
  const resetInClusterMs = duration.finalDurationMs - latest.leadMs;
  const atLeastMs = Math.min(beforeClusterMs, resetInClusterMs);
  if (atLeastMs <= 0) {
    return refuse(
      `the floor shared by both orderings has run out (before the cluster ${String(beforeClusterMs)} ms, reset in the cluster ${String(resetInClusterMs)} ms)`,
    );
  }
  // The edge is exact arithmetic on the same skewed timestamps an exact
  // remainder is: inside the tolerance of a threshold it decides nothing.
  for (const thresholdSeconds of pinnedRemainsThresholdSecondsFor(identity.atomName)) {
    const marginMs = Math.abs(atLeastMs - thresholdSeconds * 1000);
    if (marginMs <= BLOOD_REMAINS_THRESHOLD_TOLERANCE_MS) {
      return unbound(identity.atomName, "WITHIN_TIMING_TOLERANCE_OF_THRESHOLD", identity.abilityGameId, {
        windowTransition: latest,
        thresholdMargin: { thresholdSeconds, remainsMs: atLeastMs, marginMs },
        detail: `the order-invariant floor ${String(atLeastMs)} ms lies ${String(marginMs)} ms from the pinned ${String(thresholdSeconds)} s threshold; within the ${String(BLOOD_REMAINS_THRESHOLD_TOLERANCE_MS)} ms tolerance`,
      });
    }
  }
  return {
    atomName: identity.atomName,
    state: "BOUND",
    abilityGameId: identity.abilityGameId,
    proof: "WINDOW_ORDER_INVARIANT_BOUNDED",
    // THE ONE MILLISECONDS -> SECONDS CONVERSION (order-invariant branch).
    binding: boundedBelowNumber(atLeastMs / 1000, "STATE_NOT_ESTABLISHED"),
    remainsMs: atLeastMs,
    durationMs: duration.finalDurationMs,
    anchor: before.anchor,
    walkedThrough: before.walkedThrough + found.length,
    windowOrderInvariance: {
      cluster,
      beforeClusterMs,
      beforeClusterProof: before.proof,
      resetInClusterMs,
    },
    basis:
      `${String(found.length)} transition(s) of the identity (${cluster.map((entry) => `${entry.operation}${entry.isStackChange ? " (stack)" : ""} at ${String(entry.reportTimeMs)}`).join(", ")}) ` +
      `sit inside the ${String(BLOOD_PRE_DECISION_WINDOW_MS)} ms pre-decision window and no ordering against the decision is chosen: ` +
      `had they followed it, the chain before them gives ${before.proof === "GAIN_ANCHOR_EXACT" ? "exactly" : "at least"} ${String(beforeClusterMs)} ms at the decision; ` +
      `had they preceded it, a duration reset at the latest leaves ${String(resetInClusterMs)} ms and a refresh that reset nothing leaves the former; ` +
      `under every ordering remains >= ${String(atLeastMs)} ms`,
  };
}

/**
 * Derives from the last gain strictly before `beforePosition`. Called again
 * on an ambiguous refresh's own position to reach the earlier unambiguous
 * gain; `walked` carries what was already stepped through.
 */
function deriveFromGain(
  input: BloodAuraInput,
  identity: BloodAuraIdentity,
  duration: BloodAuraDurationIdentity,
  decisionTimeMs: number,
  beforePosition: number,
  ambiguousRefreshes: readonly AuraObservation[],
  walked: number,
): BloodRemainsBinding {
  const query = identityQuery(input, identity);
  const history = input.state.auras.gainHistoryAt({
    ...query,
    at: { anchor: "BEFORE_EVENT", position: beforePosition },
  });
  if (history.certainty !== "EXACT") {
    const reason: UnknownReason = history.certainty === "UNKNOWN" ? history.reason : "UNSUPPORTED_DERIVATION";
    if (reason === "NON_MONOTONIC_TIME") {
      return unbound(identity.atomName, "NON_MONOTONIC_TIME", identity.abilityGameId, { auraReason: reason });
    }
    if (reason === "AMBIGUOUS_INITIAL_STATE" || reason === "NO_OBSERVATION") {
      return unbound(identity.atomName, "NO_GAIN_OBSERVED", identity.abilityGameId, {
        auraReason: reason,
        detail:
          ambiguousRefreshes.length > 0
            ? "the last gain is an ambiguous refresh and no earlier gain is observed"
            : "the aura is ACTIVE by a later observation, but no application or refresh precedes the decision in the observed history",
      });
    }
    return unbound(identity.atomName, "CONTINUITY_FROM_GAIN_UNKNOWN", identity.abilityGameId, {
      auraReason: reason,
    });
  }

  const { gain, since } = history.value;
  const unpinned = unpinnedShapeAmong(since);
  if (unpinned !== null) {
    return unbound(identity.atomName, "UNPINNED_TRANSITION_SHAPE", identity.abilityGameId, {
      detail: `a ${unpinned.operation}${unpinned.isStackChange ? " (stack)" : ""} transition at report time ${String(unpinned.reportTimeMs)} follows the gain; its effect on the expiry is not pinned`,
    });
  }
  if (decisionTimeMs < gain.reportTimeMs) {
    return unbound(identity.atomName, "NON_MONOTONIC_TIME", identity.abilityGameId, {
      auraReason: "NON_MONOTONIC_TIME",
    });
  }

  // 9. An ambiguous refresh: walk back to the previous gain, keeping this one.
  if (isAmbiguousRefresh(input, identity, gain)) {
    return deriveFromGain(
      input,
      identity,
      duration,
      decisionTimeMs,
      gain.position,
      [...ambiguousRefreshes, gain],
      walked + since.length + 1,
    );
  }

  // 10-11. The arithmetic, in milliseconds.
  const durationMs = duration.finalDurationMs;
  const remainsMs = gain.reportTimeMs + durationMs - decisionTimeMs;
  const walkedThrough = walked + since.length;

  if (ambiguousRefreshes.length > 0) {
    if (remainsMs <= 0) {
      return unbound(identity.atomName, "AMBIGUOUS_REFRESH_BEYOND_BASE_DURATION", identity.abilityGameId, {
        detail:
          `the lower bound from the last unambiguous gain (report time ${String(gain.reportTimeMs)}) is ${String(remainsMs)} ms; ` +
          `whether ${describeAmbiguousRefresh(identity)} at ${ambiguousRefreshes.map((r) => String(r.reportTimeMs)).join(", ")} reset the duration is not decided from later presence`,
      });
    }
    return {
      atomName: identity.atomName,
      state: "BOUND",
      abilityGameId: identity.abilityGameId,
      proof: "GAIN_ANCHOR_BOUNDED",
      // THE ONE MILLISECONDS -> SECONDS CONVERSION (bounded branch).
      binding: boundedBelowNumber(remainsMs / 1000, "STATE_NOT_ESTABLISHED"),
      remainsMs,
      durationMs,
      anchor: anchorOf(gain),
      walkedThrough,
      windowOrderInvariance: null,
      basis:
        `${describeGain(gain)} under continuity; ${describeAmbiguousRefresh(identity)} at report time ` +
        `${ambiguousRefreshes.map((r) => String(r.reportTimeMs)).join(", ")} either reset the ` +
        `${String(durationMs)} ms duration or did nothing, and under both the expiry is at least the gain plus the duration: ` +
        `remains >= ${String(remainsMs)} ms`,
    };
  }

  if (remainsMs <= 0) {
    return unbound(identity.atomName, "DURATION_MODEL_CONTRADICTS_EVIDENCE", identity.abilityGameId, {
      detail: `M4 proves the aura ACTIVE, but ${describeGain(gain)} plus ${String(durationMs)} ms expired ${String(-remainsMs)} ms before the decision`,
    });
  }

  // 12. Threshold tolerance, for the thresholds the pinned list compares THIS atom against.
  for (const thresholdSeconds of pinnedRemainsThresholdSecondsFor(identity.atomName)) {
    const marginMs = Math.abs(remainsMs - thresholdSeconds * 1000);
    if (marginMs <= BLOOD_REMAINS_THRESHOLD_TOLERANCE_MS) {
      return unbound(identity.atomName, "WITHIN_TIMING_TOLERANCE_OF_THRESHOLD", identity.abilityGameId, {
        thresholdMargin: { thresholdSeconds, remainsMs, marginMs },
        detail: `the exact remainder ${String(remainsMs)} ms lies ${String(marginMs)} ms from the pinned ${String(thresholdSeconds)} s threshold; within the ${String(BLOOD_REMAINS_THRESHOLD_TOLERANCE_MS)} ms tolerance`,
      });
    }
  }

  return {
    atomName: identity.atomName,
    state: "BOUND",
    abilityGameId: identity.abilityGameId,
    proof: "GAIN_ANCHOR_EXACT",
    // THE ONE MILLISECONDS -> SECONDS CONVERSION (exact branch).
    binding: knownNumber(remainsMs / 1000),
    remainsMs,
    durationMs,
    anchor: anchorOf(gain),
    walkedThrough,
    windowOrderInvariance: null,
    basis:
      `${describeGain(gain)} under continuity to the decision, ${String(since.length)} stack loss(es) walked through ` +
      `(decrement never moves the expiry); the pinned ${String(durationMs)} ms duration resets on every gain: ` +
      `remains = ${String(gain.reportTimeMs)} + ${String(durationMs)} - ${String(decisionTimeMs)} = ${String(remainsMs)} ms`,
  };
}

function describeGain(gain: AuraObservation): string {
  const shape =
    gain.operation === "APPLIED" ? (gain.isStackChange ? "stack gain" : "application") : "refresh";
  return `the ${shape} observed at report time ${String(gain.reportTimeMs)}`;
}

export function bindSupportedBloodRemains(input: BloodAuraInput): readonly BloodRemainsBinding[] {
  return SUPPORTED_BLOOD_REMAINS_ATOMS.map((atomName) => bindBloodRemains(input, atomName));
}

/**
 * The `knownBuffRemainsSeconds` shape. A BOUND atom carries its binding; a
 * MODELLED atom that could not be established carries an explicit
 * `UNKNOWN_NUMBER` / `STATE_NOT_ESTABLISHED`, so the shared trace says "a
 * model exists and the evidence fell short" rather than "no model". An atom
 * with no identity or no duration entry is omitted — that IS "no model".
 */
export function bloodRemainsBindingsFrom(
  bindings: readonly BloodRemainsBinding[],
): readonly { readonly name: string; readonly remainsSeconds: NumericBinding }[] {
  const known: { name: string; remainsSeconds: NumericBinding }[] = [];
  for (const binding of bindings) {
    if (binding.state === "BOUND") {
      known.push({ name: binding.atomName, remainsSeconds: binding.binding });
      continue;
    }
    if (binding.reason === "IDENTITY_NOT_PINNED" || binding.reason === "DURATION_NOT_MODELLED") continue;
    known.push({ name: binding.atomName, remainsSeconds: unknownNumber("STATE_NOT_ESTABLISHED") });
  }
  return known;
}
