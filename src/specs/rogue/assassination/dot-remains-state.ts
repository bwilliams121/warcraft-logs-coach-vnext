/**
 * `remains` — the Assassination-owned reading of the ACTING action's own DoT.
 *
 * WHAT THE EXPRESSION MEANS
 *
 * Written bare in the pinned `core_dot` lines, `remains` is `dot->remains()`
 * (dot.cpp:480-486): the time left on THIS action's DoT, on THIS action's
 * target, in SECONDS. It is not `fight_remains`, not `target.time_to_die`, and
 * not a cooldown.
 *
 * PER ACTION, AND THAT IS THE M5-D1 CORRECTNESS FIX
 *
 * This module was `garrote-dot-state.ts` and answered for one ability. The
 * bindings it fed carried ONE scalar, so `core_dot[3]` — which is RUPTURE —
 * would have read Garrote's remaining time the moment that line became
 * parseable. Both are plausible numbers of seconds, so nothing would have looked
 * wrong. The derivation is now keyed by SimulationCraft action token, top to
 * bottom, and an unbound token resolves UNKNOWN rather than borrowing.
 *
 * WARCRAFT LOGS DOES NOT REPORT IT.
 *
 * Warcraft Logs reports that a debuff was APPLIED at a time. A remaining
 * duration is DERIVED, from two facts and nothing else:
 *
 *     an observed application       WCL, authoritative for what happened
 *     the DoT's duration            pinned DBC, `rogue-dot-durations.json`
 *
 *     remains = (applicationTime + duration) - queryTime
 *
 * That is derived state, not fabricated state: both inputs are evidence, and the
 * arithmetic is stated. What makes it honest is everything it REFUSES to do when
 * either input is weaker than the derivation needs.
 *
 * TWO DURATION MODELS, BECAUSE THE PINNED SOURCE HAS TWO
 *
 *     FIXED                 Garrote. `composite_dot_duration` returns the base.
 *     COMBO_POINT_SCALED    Rupture. `data().duration() * ( 1 + combo_points )`
 *                           (sc_rogue.cpp:5161-5167).
 *
 * A combo-point-scaled DoT therefore needs the combo points the APPLYING CAST
 * was made with — not the combo points now, which is a different number at a
 * different instant. This module finds the cast that caused the application and
 * reads the cost off it, and refuses when it cannot link the two. Hard-coding a
 * single Rupture duration would have been the alternative, and it would be wrong
 * for every cast below maximum combo points.
 *
 * WHY A REFRESH IS NOT AN ANCHOR (THE SHARPEST RULE HERE)
 *
 * `refreshdebuff` proves the DoT existed at that instant. It does NOT supply the
 * resulting duration, because a refresh in this game is not "duration resets to
 * base": the pinned `calculate_dot_refresh_duration` carries part of the
 * REMAINING duration forward, so the result depends on how much was left — which
 * is the very quantity being derived. This project has no refresh model, so a
 * refresh anchor returns UNKNOWN.
 *
 * WHY AN INTERVENING REMOVAL IS NOT SURVIVABLE
 *
 * If the DoT was removed between the anchor and the query, the anchor's expiry
 * arithmetic describes an aura that no longer exists. M4's `presenceAt` already
 * fails closed on this, and this module requires ACTIVE presence rather than
 * merely finding an earlier application.
 *
 * EXPIRY IS NOT REMOVAL, AND IS NOT ASSUMED EITHER
 *
 * A DoT that ran out produces a `removedebuff`, so a still-ACTIVE aura whose
 * computed remainder is negative is a CONTRADICTION between the two inputs, not
 * a DoT with negative time left. It is reported as unknown rather than clamped
 * to zero.
 *
 * WHY BASE DURATION IS ENOUGH, AND HOW THAT WAS ESTABLISHED
 *
 * SimulationCraft scales a DoT's duration by `1 / exsanguinated_rate`, so a base
 * duration would be wrong for an exsanguinated DoT. At the pinned commit it
 * cannot be:
 *
 *     sc_rogue.cpp:1253   void do_exsanguinate( dot_t*, double );   declaration
 *     sc_rogue.cpp:7759   [[maybe_unused]] rogue_t::do_exsanguinate definition
 *                         ...and NO call site anywhere in the module
 *     sc_rogue.cpp:7773   the ONLY set_exsanguinated_rate call, inside that
 *                         unreachable function
 *     sc_rogue.cpp:1479   the field is constructed at 1.0, and reset to 1.0
 *
 * So the rate never leaves 1.0 and the scaling is a no-op. This is recorded
 * because it is the kind of fact that silently stops being true.
 *
 * UNITS ARE CONVERTED EXACTLY ONCE, HERE.
 *
 * Evidence and DBC are in MILLISECONDS. SimulationCraft expressions are in
 * SECONDS. The single `/ 1000` in this file is the only place those meet, and
 * the result is named `remainsSeconds` so a caller cannot mistake it.
 */

import { fromSource } from "../../../engine/auras/aura-state.js";
import type { AuraOperation } from "../../../engine/normalization/normalized-events.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import { sourceRef, targetRef } from "../../../engine/normalization/normalized-events.js";
import type { UnknownReason } from "../../../engine/state/state-result.js";
import { dotDurationForToken } from "../../../data/game/rogue-dot-durations.js";
import type { DotDurationIdentity } from "../../../data/game/dot-duration-artifact.js";
import { knownNumber, type NumericBinding } from "../../../simc/expression/evaluate.js";

/** The SimulationCraft action tokens whose own DoT this module can derive. */
export const GARROTE_SIMC_TOKEN = "garrote";
export const RUPTURE_SIMC_TOKEN = "rupture";

/**
 * The DoTs a rotational decision may need `remains` for.
 *
 * Exactly the two the pinned `core_dot` list can select. Entries appear when a
 * decision needs them, never speculatively — and a token absent from the pinned
 * duration artifact simply yields no binding.
 */
export const SUPPORTED_DOT_TOKENS = [GARROTE_SIMC_TOKEN, RUPTURE_SIMC_TOKEN] as const;

export interface DotRemainsInput {
  readonly state: CombatState;
  /** The acting player. The DoT's SOURCE — never the target. */
  readonly actorId: number;
  /** The enemy the DoT is on. The DoT's TARGET. */
  readonly targetActorId: number;
  /** Optional target instance, as Warcraft Logs reports it. `null` when unspecified. */
  readonly targetInstance?: number | null;
  /** Canonical index into `CombatFight.events`. Never an ingestion ordinal. */
  readonly position: number;
  /**
   * The Warcraft Logs wire type for combo points.
   *
   * Required only by a COMBO_POINT_SCALED DoT, and passed in rather than
   * hard-coded for the same reason every other wire type is: the mapping is an
   * evidence contract that lives in `src/data/wcl-wire`, not a constant this
   * module gets to know.
   */
  readonly comboPointWireType?: number;
}

/**
 * Why a remaining duration could not be derived.
 *
 * Each member names a DIFFERENT missing thing, because the remedies differ: a
 * wider capture fixes `AURA_STATE_UNKNOWN`, and nothing short of a refresh model
 * fixes `REFRESH_ANCHOR_HAS_NO_DERIVABLE_DURATION`.
 */
export type DotRemainsBlocker =
  /** The pinned dataset carries no duration for this token. */
  | "DOT_DURATION_NOT_MODELLED"
  /** M4 could not establish the aura's presence. Carries the underlying reason. */
  | "AURA_STATE_UNKNOWN"
  /** M4 proved the aura was NOT on the target. A real answer, but not a duration. */
  | "DOT_NOT_ACTIVE"
  /** The anchor is a refresh. See the module header: refresh carry-over is not modelled. */
  | "REFRESH_ANCHOR_HAS_NO_DERIVABLE_DURATION"
  /** The anchor is a removal, which cannot anchor an active DoT's remainder. */
  | "REMOVAL_ANCHOR_HAS_NO_DURATION"
  /** Query time precedes the anchor, so the capture's ordering cannot be trusted. */
  | "NON_MONOTONIC_TIME"
  /** Aura says ACTIVE, arithmetic says expired. The two inputs disagree. */
  | "DURATION_MODEL_CONTRADICTS_EVIDENCE"
  /**
   * A combo-point-scaled DoT whose applying cast could not be identified, or
   * which carried no combo-point cost (M5-D1).
   *
   * NOT a duration of zero combo points. The pinned formula is
   * `base * ( 1 + combo_points )`, so guessing zero would understate Rupture by
   * up to five times — and understating a remainder is the direction that makes
   * a refresh look due when it is not.
   */
  | "COMBO_POINTS_AT_APPLICATION_UNKNOWN";

/** The observed application a derived remainder rests on. */
export interface DotRemainsAnchor {
  readonly abilityGameId: number;
  readonly operation: AuraOperation;
  readonly position: number;
  readonly appliedAtFightTimeMs: number;
  readonly locator: EvidenceLocator;
}

/**
 * How this DoT's duration was computed, kept so a reader can check the formula
 * rather than trust the number.
 */
export type DotDurationDerivation =
  | { readonly kind: "FIXED"; readonly baseDurationMs: number }
  | {
      readonly kind: "COMBO_POINT_SCALED";
      readonly baseDurationMs: number;
      /** The combo points the APPLYING cast was made with, read off its cost. */
      readonly comboPointsAtApplication: number;
      /** The cast the combo points were read from. */
      readonly castLocator: EvidenceLocator;
    };

/**
 * A derived remaining duration, or a refusal.
 *
 * `KNOWN` carries the whole derivation — every input and the query time — so a
 * finding can show its work rather than asserting a number.
 */
export type DotRemainsBinding =
  | {
      readonly state: "KNOWN";
      /** SECONDS, for a SimulationCraft expression. The only converted value. */
      readonly remainsSeconds: number;
      /** MILLISECONDS, as derived. Kept so the conversion is auditable. */
      readonly remainsMs: number;
      /** The FULL duration this DoT was applied for, after any scaling. */
      readonly appliedDurationMs: number;
      readonly baseDurationMs: number;
      readonly derivation: DotDurationDerivation;
      readonly queryFightTimeMs: number;
      readonly anchor: DotRemainsAnchor;
    }
  | {
      readonly state: "UNKNOWN";
      readonly blocker: DotRemainsBlocker;
      /** The M4 reason, when the refusal came from M4 rather than this module. */
      readonly auraReason: UnknownReason | null;
      /** The anchor that was found but could not be used, when one was. */
      readonly anchor: DotRemainsAnchor | null;
    };

/** One supported DoT's state at a decision position, keyed by its action token. */
export interface DerivedDotState {
  readonly simcToken: string;
  readonly abilityGameId: number;
  readonly remains: DotRemainsBinding;
}

function unknown(
  blocker: DotRemainsBlocker,
  auraReason: UnknownReason | null = null,
  anchor: DotRemainsAnchor | null = null,
): DotRemainsBinding {
  return { state: "UNKNOWN", blocker, auraReason, anchor };
}

/**
 * The combo points the cast that applied this DoT was made with.
 *
 * FOUND BY CAUSATION, NOT BY PROXIMITY. The cast must be a COMPLETE cast of the
 * same ability by the same actor at or before the application, AND share its
 * fight time — because the application is that cast's own consequence and
 * Warcraft Logs emits the two at the same millisecond. A cast at a different
 * timestamp is a DIFFERENT cast, and reading its cost would attribute one
 * application's duration to another's combo points.
 *
 * The count itself is the observed `cost` on the combo-point entry. M5-A's
 * evidence contract establishes that a cast's `classResources[].amount` is
 * PRE_COST and its `cost` is what the cast spent, which for a finisher is
 * exactly `rs->get_combo_points()`.
 */
function comboPointsAtApplication(
  input: DotRemainsInput,
  anchor: DotRemainsAnchor,
): { readonly comboPoints: number; readonly castLocator: EvidenceLocator } | null {
  const wireType = input.comboPointWireType;
  if (wireType === undefined) return null;

  const cast = input.state.lastObservedCast({
    actorId: input.actorId,
    abilityGameId: anchor.abilityGameId,
    castPhase: "COMPLETE",
    // AFTER_EVENT so the application's own instant is included: the cast sits at
    // or before it in canonical order and shares its timestamp.
    before: { anchor: "AFTER_EVENT", position: anchor.position },
  });
  if (cast.certainty !== "EXACT" || cast.value === null) return null;
  if (cast.value.fightTimeMs !== anchor.appliedAtFightTimeMs) return null;

  const observation = input.state.resources.observationOnEvent(cast.value.position, input.actorId, wireType);
  if (observation.certainty !== "EXACT") return null;
  const cost = observation.value.observedCost;
  // A cast with no combo-point cost entry establishes nothing. M5-A's fixture
  // carries a real Envenom whose combo-point entry is simply absent, so this is
  // an observed failure mode rather than a hypothetical one.
  if (cost === null || !Number.isFinite(cost) || cost <= 0) return null;
  return { comboPoints: cost, castLocator: observation.value.locator };
}

/**
 * Derives one supported DoT's remaining duration at one decision position.
 *
 * The query is `BEFORE_EVENT`: the state as it stood when the decision was made,
 * excluding the event at that position. A decision cannot be justified by its own
 * consequences, and for the verified capture that is not a theoretical concern —
 * the real sequence re-applies Garrote at the very instant being judged.
 *
 * `fromSource` is not optional here. Two rogues can each hold a Garrote on the
 * same boss; they are two independent auras, and the acting player's `remains`
 * must not be answered from somebody else's application.
 */
export function bindDotRemains(input: DotRemainsInput, simcToken: string): DotRemainsBinding {
  const { state, actorId, targetActorId, position } = input;
  const targetInstance = input.targetInstance ?? null;

  const identity = dotDurationForToken(simcToken);
  if (identity === null) return unknown("DOT_DURATION_NOT_MODELLED");

  const presence = state.auras.presenceAt({
    target: targetRef(targetActorId, targetInstance),
    abilityGameId: identity.abilityGameId,
    auraClass: "DEBUFF",
    source: fromSource(sourceRef(actorId, null)),
    at: { anchor: "BEFORE_EVENT", position },
  });

  if (presence.certainty !== "EXACT") {
    return unknown("AURA_STATE_UNKNOWN", "reason" in presence ? presence.reason : null);
  }

  const anchorObservation = presence.value.anchor;
  const anchor: DotRemainsAnchor = {
    abilityGameId: anchorObservation.abilityGameId,
    operation: anchorObservation.operation,
    position: anchorObservation.position,
    appliedAtFightTimeMs: anchorObservation.fightTimeMs,
    locator: anchorObservation.locator,
  };

  // INACTIVE is a real, proven answer — and still not a duration. A DoT that is
  // not on the target has no remainder to report, and reporting zero would let
  // `remains<=14` come out TRUE for a DoT that is simply absent.
  if (presence.value.presence !== "ACTIVE") {
    return unknown("DOT_NOT_ACTIVE", null, anchor);
  }

  // The anchor must be an APPLICATION. See the module header for why a refresh
  // is refused rather than approximated.
  if (anchorObservation.operation === "REFRESHED") {
    return unknown("REFRESH_ANCHOR_HAS_NO_DERIVABLE_DURATION", null, anchor);
  }
  if (anchorObservation.operation !== "APPLIED") {
    return unknown("REMOVAL_ANCHOR_HAS_NO_DURATION", null, anchor);
  }

  // A stack transition can also prove ACTIVE, and it is not an application. It
  // supplies no application time, so it cannot anchor this derivation either.
  if (anchorObservation.isStackChange) {
    return unknown("REMOVAL_ANCHOR_HAS_NO_DURATION", null, anchor);
  }

  const queryFightTimeMs = queryFightTime(state, position);
  if (queryFightTimeMs === null) {
    return unknown("AURA_STATE_UNKNOWN", "NO_OBSERVATION", anchor);
  }
  // Time must move forwards from the anchor to the query. A capture that says
  // otherwise is one whose ordering cannot carry an arithmetic claim.
  if (queryFightTimeMs < anchorObservation.fightTimeMs) {
    return unknown("NON_MONOTONIC_TIME", "NON_MONOTONIC_TIME", anchor);
  }

  const derivation = deriveDuration(input, identity, anchor);
  if (derivation === null) {
    return unknown("COMBO_POINTS_AT_APPLICATION_UNKNOWN", null, anchor);
  }

  const appliedDurationMs = appliedDurationOf(derivation);
  const expiresAtMs = anchorObservation.fightTimeMs + appliedDurationMs;
  const remainsMs = expiresAtMs - queryFightTimeMs;

  // M4 says the DoT is on the target; the duration model says it already
  // expired. Both cannot be right, and this module does not pick a winner.
  if (remainsMs <= 0) {
    return unknown("DURATION_MODEL_CONTRADICTS_EVIDENCE", null, anchor);
  }

  return {
    state: "KNOWN",
    // THE ONE MILLISECONDS -> SECONDS CONVERSION. SimulationCraft expressions
    // are in seconds; everything above this line is in milliseconds.
    remainsSeconds: remainsMs / 1000,
    remainsMs,
    appliedDurationMs,
    baseDurationMs: identity.baseDurationMs,
    derivation,
    queryFightTimeMs,
    anchor,
  };
}

/** The pinned duration model for one DoT, applied. `null` when an input is missing. */
function deriveDuration(
  input: DotRemainsInput,
  identity: DotDurationIdentity,
  anchor: DotRemainsAnchor,
): DotDurationDerivation | null {
  if (identity.durationModel.kind === "FIXED") {
    return { kind: "FIXED", baseDurationMs: identity.baseDurationMs };
  }
  const combo = comboPointsAtApplication(input, anchor);
  if (combo === null) return null;
  return {
    kind: "COMBO_POINT_SCALED",
    baseDurationMs: identity.baseDurationMs,
    comboPointsAtApplication: combo.comboPoints,
    castLocator: combo.castLocator,
  };
}

/** The full duration the DoT was applied for, in MILLISECONDS. */
function appliedDurationOf(derivation: DotDurationDerivation): number {
  if (derivation.kind === "FIXED") return derivation.baseDurationMs;
  // `data().duration() * ( 1 + rs->get_combo_points() )` — sc_rogue.cpp:5161-5167.
  return derivation.baseDurationMs * (1 + derivation.comboPointsAtApplication);
}

/**
 * Every supported DoT's state at one position.
 *
 * Returns an entry per supported token, INCLUDING the ones that came back
 * UNKNOWN, so a caller auditing a refusal can see which DoT failed and why. The
 * binding builder below is what drops the unknown ones.
 */
export function deriveSupportedDotStates(input: DotRemainsInput): readonly DerivedDotState[] {
  const derived: DerivedDotState[] = [];
  for (const token of SUPPORTED_DOT_TOKENS) {
    const identity = dotDurationForToken(token);
    if (identity === null) continue;
    derived.push({
      simcToken: token,
      abilityGameId: identity.abilityGameId,
      remains: bindDotRemains(input, token),
    });
  }
  return derived;
}

/** One supported DoT's remainder, by token. A token nobody derived is UNKNOWN. */
export function dotRemainsFor(states: readonly DerivedDotState[], simcToken: string): DotRemainsBinding {
  return (
    states.find((entry) => entry.simcToken === simcToken)?.remains ?? unknown("DOT_DURATION_NOT_MODELLED")
  );
}

/**
 * The expression-binding shape, built from the DoTs that are actually known.
 *
 * An UNKNOWN DoT is OMITTED rather than bound, so its `remains` atom stays
 * UNKNOWN_NUMBER. That is the honest answer and, unlike a zero, is not read as
 * "about to expire".
 */
export function dotRemainsBindingsFrom(
  states: readonly DerivedDotState[],
): readonly { readonly actionToken: string; readonly remainsSeconds: NumericBinding }[] {
  const bindings: { actionToken: string; remainsSeconds: NumericBinding }[] = [];
  for (const entry of states) {
    if (entry.remains.state !== "KNOWN") continue;
    bindings.push({
      actionToken: entry.simcToken,
      remainsSeconds: knownNumber(entry.remains.remainsSeconds),
    });
  }
  return bindings;
}

/**
 * Garrote's remainder, by name.
 *
 * Kept as a named entry point because C3a's callers and tests ask about Garrote
 * specifically, and because a reader looking for the C3a derivation should find
 * it rather than have to know it was generalised.
 */
export function bindGarroteRemains(input: DotRemainsInput): DotRemainsBinding {
  return bindDotRemains(input, GARROTE_SIMC_TOKEN);
}

/**
 * The fight time of the event at a canonical position.
 *
 * `null` when the position names no event. Deliberately not defaulted to zero:
 * a missing query time would otherwise make every DoT look freshly applied.
 */
function queryFightTime(state: CombatState, position: number): number | null {
  return state.eventAt(position)?.fightTimeMs ?? null;
}
