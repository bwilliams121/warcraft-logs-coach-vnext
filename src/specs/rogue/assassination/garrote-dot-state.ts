/**
 * `remains` — the Assassination-owned reading of the acting action's own DoT.
 *
 * WHAT THE EXPRESSION MEANS
 *
 * Written bare in the pinned `core_dot` lines, `remains` is `dot->remains()`
 * (dot.cpp:480-486): the time left on THIS action's DoT, on THIS action's
 * target, in SECONDS. It is not `fight_remains`, not `target.time_to_die`, and
 * not a cooldown.
 *
 * WARCRAFT LOGS DOES NOT REPORT IT.
 *
 * Warcraft Logs reports that a debuff was APPLIED at a time. A remaining
 * duration is DERIVED, from two facts and nothing else:
 *
 *     an observed application       WCL, authoritative for what happened
 *     the DoT's base duration       pinned DBC, `rogue-dot-durations.json`
 *
 *     remains = (applicationTime + baseDuration) - queryTime
 *
 * That is derived state, not fabricated state: both inputs are evidence, and the
 * arithmetic is stated. What makes it honest is everything it REFUSES to do
 * when either input is weaker than the derivation needs.
 *
 * WHY A REFRESH IS NOT AN ANCHOR (THE SHARPEST RULE HERE)
 *
 * `refreshdebuff` proves the DoT existed at that instant. It does NOT supply the
 * resulting duration, because a refresh in this game is not "duration resets to
 * base": pandemic carries up to 30% of the REMAINING duration forward, so the
 * result depends on how much was left — which is the very quantity being
 * derived. Treating a refresh as a fresh application would understate a
 * pandemic-refreshed DoT by up to 5.4 seconds on an 18-second Garrote, and the
 * error points in the direction that makes `remains<=14` spuriously TRUE.
 *
 * This project has no pandemic model, so a refresh anchor returns UNKNOWN. That
 * is option B of the C3a design, chosen over a bounded interval because the
 * bound would need the same missing model to be trustworthy.
 *
 * WHY AN INTERVENING REMOVAL IS NOT SURVIVABLE
 *
 * If the DoT was removed between the anchor and the query, the anchor's
 * expiry arithmetic describes an aura that no longer exists. M4's `presenceAt`
 * already fails closed on this, and this module requires ACTIVE presence rather
 * than merely finding an earlier application — so a removal, or an ambiguous
 * unowned removal, blocks the derivation instead of being stepped over.
 *
 * EXPIRY IS NOT REMOVAL, AND IS NOT ASSUMED EITHER
 *
 * A DoT that ran out produces a `removedebuff`, so a still-ACTIVE aura whose
 * computed remainder is negative is a CONTRADICTION between the two inputs, not
 * a DoT with negative time left. It is reported as unknown rather than clamped
 * to zero: clamping would silently convert "our duration model disagrees with
 * the evidence" into "the DoT is about to expire", which reads as a real answer.
 *
 * WHY BASE DURATION IS ENOUGH, AND HOW THAT WAS ESTABLISHED
 *
 * SimulationCraft scales a DoT's remaining time by `exsanguinated_rate`
 * (`dot->remains() * 1.0/rate`), so a base duration would be wrong for an
 * exsanguinated DoT. At the pinned commit it cannot be:
 *
 *     sc_rogue.cpp:1253   void do_exsanguinate( dot_t*, double );   declaration
 *     sc_rogue.cpp:7759   [[maybe_unused]] rogue_t::do_exsanguinate definition
 *                         ...and NO call site anywhere in the module
 *     sc_rogue.cpp:7773   the ONLY set_exsanguinated_rate call, inside that
 *                         unreachable function
 *     sc_rogue.cpp:1479   the field is constructed at 1.0, and reset to 1.0
 *
 * So the rate never leaves 1.0 and the scaling is a no-op. This is recorded
 * because it is the kind of fact that silently stops being true: if a future
 * pinned commit reintroduces a call site, this derivation needs the model.
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

/** The SimulationCraft action token this module answers for. */
export const GARROTE_SIMC_TOKEN = "garrote";

export interface GarroteRemainsInput {
  readonly state: CombatState;
  /** The acting player. The DoT's SOURCE — never the target. */
  readonly actorId: number;
  /** The enemy the DoT is on. The DoT's TARGET. */
  readonly targetActorId: number;
  /** Optional target instance, as Warcraft Logs reports it. `null` when unspecified. */
  readonly targetInstance?: number | null;
  /** Canonical index into `CombatFight.events`. Never an ingestion ordinal. */
  readonly position: number;
}

/**
 * Why a remaining duration could not be derived.
 *
 * Each member names a DIFFERENT missing thing, because the remedies differ: a
 * wider capture fixes `INSUFFICIENT_SCOPE`, and nothing short of a pandemic
 * model fixes `REFRESH_ANCHOR_HAS_NO_DERIVABLE_DURATION`.
 */
export type GarroteRemainsBlocker =
  /** The pinned dataset carries no duration for this token. */
  | "DOT_DURATION_NOT_MODELLED"
  /** M4 could not establish the aura's presence. Carries the underlying reason. */
  | "AURA_STATE_UNKNOWN"
  /** M4 proved the aura was NOT on the target. A real answer, but not a duration. */
  | "DOT_NOT_ACTIVE"
  /** The anchor is a refresh. See the module header: pandemic is not modelled. */
  | "REFRESH_ANCHOR_HAS_NO_DERIVABLE_DURATION"
  /** The anchor is a removal, which cannot anchor an active DoT's remainder. */
  | "REMOVAL_ANCHOR_HAS_NO_DURATION"
  /** Query time precedes the anchor, so the capture's ordering cannot be trusted. */
  | "NON_MONOTONIC_TIME"
  /** Aura says ACTIVE, arithmetic says expired. The two inputs disagree. */
  | "DURATION_MODEL_CONTRADICTS_EVIDENCE";

/** The observed application a derived remainder rests on. */
export interface GarroteRemainsAnchor {
  readonly abilityGameId: number;
  readonly operation: AuraOperation;
  readonly position: number;
  readonly appliedAtFightTimeMs: number;
  readonly locator: EvidenceLocator;
}

/**
 * A derived remaining duration, or a refusal.
 *
 * `KNOWN` carries the whole derivation — both inputs and the query time — so a
 * finding can show its work rather than asserting a number.
 */
export type GarroteRemainsBinding =
  | {
      readonly state: "KNOWN";
      /** SECONDS, for a SimulationCraft expression. The only converted value. */
      readonly remainsSeconds: number;
      /** MILLISECONDS, as derived. Kept so the conversion is auditable. */
      readonly remainsMs: number;
      readonly baseDurationMs: number;
      readonly queryFightTimeMs: number;
      readonly anchor: GarroteRemainsAnchor;
    }
  | {
      readonly state: "UNKNOWN";
      readonly blocker: GarroteRemainsBlocker;
      /** The M4 reason, when the refusal came from M4 rather than from this module. */
      readonly auraReason: UnknownReason | null;
      /** The anchor that was found but could not be used, when one was. */
      readonly anchor: GarroteRemainsAnchor | null;
    };

function unknown(
  blocker: GarroteRemainsBlocker,
  auraReason: UnknownReason | null = null,
  anchor: GarroteRemainsAnchor | null = null,
): GarroteRemainsBinding {
  return { state: "UNKNOWN", blocker, auraReason, anchor };
}

/**
 * Derives Garrote's remaining duration at one decision position.
 *
 * The query is `BEFORE_EVENT`: the state as it stood when the decision was
 * made, excluding the event at that position. A decision cannot be justified by
 * its own consequences, and for this sequence that is not a theoretical concern
 * — the real capture applies Improved Garrote at the very instant being judged.
 *
 * `fromSource` is not optional here. Two rogues can each hold a Garrote on the
 * same boss; they are two independent auras, and the acting player's `remains`
 * must not be answered from somebody else's application.
 */
export function bindGarroteRemains(input: GarroteRemainsInput): GarroteRemainsBinding {
  const { state, actorId, targetActorId, position } = input;
  const targetInstance = input.targetInstance ?? null;

  const identity = dotDurationForToken(GARROTE_SIMC_TOKEN);
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
  const anchor: GarroteRemainsAnchor = {
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

  const expiresAtMs = anchorObservation.fightTimeMs + identity.baseDurationMs;
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
    baseDurationMs: identity.baseDurationMs,
    queryFightTimeMs,
    anchor,
  };
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
