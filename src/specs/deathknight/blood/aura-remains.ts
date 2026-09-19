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
 * THE ONE AMBIGUOUS SHAPE, AND WHY IT IS A LOWER BOUND. The Blood corpus
 * shows a `refreshbuff` beside a Bone Shield `removebuffstack` at 7 of 25
 * charge consumptions (each at a melee hit taken, beside a Coagulating Blood
 * dose). The pinned decrement does not refresh, so what that refresh did to
 * the expiry is NOT pinned: either it reset the duration (expiry later) or it
 * did nothing (expiry unchanged). Under BOTH hypotheses the expiry is at least
 * the earlier unambiguous gain's time plus the duration — a DURATION refresh
 * can only move an expiry LATER — so that is bound as `BOUNDED_NUMBER
 * { atLeast }` and nothing more. No interpretation is chosen, and "the aura is
 * still active, so the refresh must have reset it" is a deduction this
 * tranche explicitly does NOT make: an `atLeast` that has already run out is
 * UNKNOWN.
 *
 * NO FUTURE ORACLE, NO WINDOW ORACLE. Every query is `BEFORE_EVENT` at the
 * decision, and a transition of the identity inside the Blood pre-decision
 * window ahead of the decision refuses the binding outright — the same
 * policy `.up` and `.stack` apply (`aura-bindings.ts`).
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
 * on a sub-tolerance margin unjustified. A BOUND is not subject to it: a
 * bound decides only when the whole undecided side lies beyond the
 * threshold, and the margin of a bound is not a distance nobody measured.
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
  | "GAIN_ANCHOR_BOUNDED";

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
  /** The exact remainder lies within the tolerance of a threshold the pinned list compares this atom against. */
  | "WITHIN_TIMING_TOLERANCE_OF_THRESHOLD";

/** The gain a bound value rests on. */
export interface BloodRemainsAnchor {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly operation: AuraObservation["operation"];
  readonly isStackChange: boolean;
  readonly reportTimeMs: number;
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
      /** MILLISECONDS, as derived: the exact remainder, or the lower bound for GAIN_ANCHOR_BOUNDED; null for zero/permanent proofs. */
      readonly remainsMs: number | null;
      /** The pinned duration applied, MILLISECONDS; null for the build proofs. */
      readonly durationMs: number | null;
      /** The gain (or presence anchor) the value rests on; null for the build proofs. */
      readonly anchor: BloodRemainsAnchor | null;
      /** Observations walked through between the anchor and the decision (stack losses; an ambiguous refresh). */
      readonly walkedThrough: number;
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
 * Whether a REFRESHED gain is of UNPINNED cause: a `refreshbuff` whose
 * same-millisecond companions on this identity's track include a stack
 * REMOVAL and no application. Beside a stack GAIN it is the ordinary
 * companion of a trigger; alone it is a trigger (an observed full reset:
 * three Visceral Strength expiries and one Essence expiry in the corpus
 * fall exactly one duration after a lone refresh).
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
  return removal;
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
 *   3. build impossibility -> 0   4. pre-decision window refusal
 *   5. M4 presence EXACT          6. INACTIVE -> 0
 *   7. PERMANENT + ACTIVE -> sentinel
 *   8. gain history under continuity from the gain
 *   9. intervening transitions classified
 *  10. exact, or a lower bound past an ambiguous refresh
 *  11. contradiction check       12. threshold tolerance
 */
export function bindBloodRemains(input: BloodAuraInput, atomName: string): BloodRemainsBinding {
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
      basis: `${impossible.basis}; an inactive aura's remains is 0 (buff.cpp:2020-2023)`,
    };
  }

  // 4. The pre-decision window.
  const windowTransition = preDecisionWindowTransition(input, identity);
  if (windowTransition !== null) {
    return unbound(atomName, "PRE_DECISION_WINDOW_TRANSITION", identity.abilityGameId, { windowTransition });
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
            ? "the last gain is a refresh of unpinned cause and no earlier gain is observed"
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
          `whether the refresh of unpinned cause at ${ambiguousRefreshes.map((r) => String(r.reportTimeMs)).join(", ")} reset the duration is not decided from later presence`,
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
      basis:
        `${describeGain(gain)} under continuity; a refresh of unpinned cause at report time ` +
        `${ambiguousRefreshes.map((r) => String(r.reportTimeMs)).join(", ")} (beside a stack removal) either reset the ` +
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
