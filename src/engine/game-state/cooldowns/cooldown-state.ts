/**
 * Derived cooldown state: how long until this ability is usable again?
 *
 * WHY THIS IS NOT IN M4
 *
 * M4 owns OBSERVED combat state — auras, resources, casts, encounter events. It
 * reconstructs what Warcraft Logs saw. A cooldown is a different kind of thing:
 * Warcraft Logs never reports one. There is no cooldown event stream, no
 * "cooldown started" record and no "cooldown ready" record. A remaining cooldown
 * is DERIVED by combining one observed cast with a pinned game rule.
 *
 * That makes it a game-state derivation rather than an observation, so it lives
 * beside M4 rather than inside it. M4's vocabulary and semantics are untouched.
 *
 * WHAT THIS MODULE NEEDS, AND WHY EACH PIECE IS REQUIRED
 *
 *     an observed cast        M4 supplies it, with canonical position
 *     a base cooldown         pinned game data
 *     a modifier policy       the caller's proof that nothing changes it
 *     a query position        the decision point
 *
 * The modifier policy is the one that looks optional and is not. Without it,
 * `base - elapsed` is an assumption that nothing reset or reduced the cooldown
 * in between — and this module has no way to observe that, because the events
 * do not exist. So the caller must state the policy, and a caller who cannot
 * gets UNKNOWN.
 *
 * THREE EPISTEMIC OUTCOMES
 *
 *     EXACT     every input is established and nothing can have changed it
 *     BOUNDED   a rigorous lower bound on the remaining time, and no more
 *     UNKNOWN   we cannot say
 *
 * BOUNDED exists because a lower bound is often all a decision needs:
 * `cooldown.x.remains<=2` is answerable from "at least 57 seconds remain"
 * without ever committing to an exact figure. Offering it stops a caller from
 * reaching for EXACT when only a bound is defensible.
 *
 * AND A CAST-ANCHORED DERIVATION IS BOUNDED, NOT EXACT.
 *
 * SimulationCraft does not start a cooldown at the execution instant. It starts
 * it with a delay (action.cpp:2342-2360):
 *
 *     delay = rng().gauss( player->world_lag );
 *     if ( delay > 400_ms ) delay -= 400_ms; else delay = 0_ms;
 *     cooldown->start( this, cd_duration, delay );
 *
 * That delay is SAMPLED, not computed, and `world_lag` is configurable per sim
 * and per player (sim.cpp:3847, player.cpp:719). Its default is a gaussian with
 * mean 100 ms and stddev 10 ms (sim.cpp:1430, sim.cpp:2660), so under defaults
 * it is zero with overwhelming probability — but "overwhelmingly probable" is
 * not "proven", and a profile with a larger `world_lag` makes it positive
 * routinely. The `!background && !proc` guard means the path applies to any
 * player-cast action.
 *
 * The delay is non-negative, so it can only push the ready time LATER. That
 * makes `base - elapsed` a sound LOWER BOUND and not an equality:
 *
 *     ready     = cast + base + delay,  delay >= 0
 *     remaining = ready - query        >= base - elapsed
 *
 * There is a second, independent reason for the same conclusion: we derive from
 * a real server-side log, and nothing here proves the real cooldown began at
 * exactly the millisecond the cast event carries.
 *
 * So this function returns BOUNDED. EXACT stays in the vocabulary for a future
 * derivation that can prove a zero-delay start; nothing produces it today, and
 * claiming it would be the overstatement the three states exist to prevent.
 *
 * ONE CHARGE IS THE ORDINARY CASE WEARING A DIFFERENT HAT (M5-D1)
 *
 * SimulationCraft branches on the CHARGE COOLDOWN, not the charge count
 * (action.cpp:710-724):
 *
 *     if ( spell_data.charge_cooldown() > 0 )
 *     {
 *       cooldown->category = true;
 *       cooldown->duration = spell_data.charge_cooldown();
 *       cooldown->charges  = spell_data.charges();
 *       ...internal_cooldown->duration = spell_data.cooldown();
 *     }
 *     else if ( spell_data.cooldown() > 0 )
 *       cooldown->duration = spell_data.cooldown();
 *
 * and `cooldown_t` is CONSTRUCTED with `charges( 1 )` and `current_charge( 1 )`
 * (cooldown_impl.cpp:101,110). So a charge system with `charges == 1` sets the
 * charge count to the value it already had: it is arithmetically identical to an
 * ordinary cooldown whose duration is the CHARGE cooldown.
 *
 * That equivalence — and only that one — is supported. `charges >= 2` genuinely
 * needs a charge model, because "remaining" stops being one number: an ability at
 * one of two charges is usable NOW and recharging at the same time.
 *
 * NOTE WHICH FIELD BECOMES THE DURATION. For a charge ability the ordinary
 * `_cooldown` is NOT the recharge; it becomes the internal cooldown. Vanish
 * carries `_cooldown` 1000 and `_charge_cooldown` 120000, so reading the nominal
 * field would claim a one-second recharge for a two-minute ability.
 *
 * WHAT THIS MODULE REFUSES TO DO
 *
 * It models no multi-charge system, no resets, no reduction and no haste
 * scaling. Each is a real mechanic; none is guessed at. An ability with two or
 * more charges, or whose modifier policy is not proven absent, returns UNKNOWN
 * rather than a number derived from rules that do not apply to it.
 *
 * It also produces no gameplay verdict. "Remaining cooldown" is a fact; whether
 * that means an action was unusable is a decision for a layer that owns
 * actionability.
 */

import type { CombatState, ObservedCast } from "../../state/combat-state.js";
import type { EvidenceLocator } from "../../evidence/locator.js";
import type { UnknownReason } from "../../state/state-result.js";

/**
 * The caller's proof about what can change this cooldown.
 *
 * `NO_MODIFIERS_PROVEN_ABSENT` is a POSITIVE claim, carrying the evidence that
 * established it. It is not "we saw no reset event" — no such event exists to
 * see. It is "we read the authority and there is no mechanism".
 *
 * `MODIFIERS_POSSIBLE` is everything else, and yields UNKNOWN. There is no
 * middle member: a partially-reviewed ability is an unreviewed one.
 */
export type CooldownModifierPolicy =
  | {
      readonly kind: "NO_MODIFIERS_PROVEN_ABSENT";
      /** Where the absence proof came from, for the audit trail. */
      readonly sourcePath: string;
      readonly sourceSha256: string;
      /** The claims that were checked, verbatim from the pinned artifact. */
      readonly claims: readonly string[];
    }
  | { readonly kind: "MODIFIERS_POSSIBLE"; readonly detail: string };

/** Why a cooldown could not be derived. */
export type CooldownUnknownReason =
  /** No cast of this ability by this actor was observed at or before the query. */
  | "NO_OBSERVED_CAST"
  /** M4 could not answer the cast question. Carries its reason separately. */
  | "CAST_STATE_UNKNOWN"
  /** The caller supplied no base cooldown. */
  | "BASE_COOLDOWN_NOT_MODELLED"
  /**
   * The ability has TWO OR MORE charges, which this module does not model.
   *
   * Narrowed at M5-D1 from "has charges". A one-charge system is the ordinary
   * case and IS supported; see the module header. The name is unchanged because
   * the meaning a caller acts on — "we do not model this charge system" — is.
   */
  | "CHARGES_NOT_MODELLED"
  /** The caller could not prove modifiers absent. */
  | "MODIFIERS_NOT_PROVEN_ABSENT"
  /** The query position names no event, so there is no time to measure to. */
  | "QUERY_POSITION_UNRESOLVED"
  /** Time runs backwards between the cast and the query. */
  | "NON_MONOTONIC_TIME";

/** The observed cast a derivation rests on. */
export interface CooldownAnchor {
  readonly abilityGameId: number;
  readonly actorId: number;
  readonly position: number;
  readonly castFightTimeMs: number;
  readonly locator: EvidenceLocator;
}

export type CooldownState =
  | {
      /** Every input established; nothing can have changed it. */
      readonly state: "EXACT";
      /** MILLISECONDS remaining. Never negative; a finished cooldown is 0. */
      readonly remainingMs: number;
      readonly baseCooldownMs: number;
      readonly elapsedMs: number;
      readonly queryFightTimeMs: number;
      readonly anchor: CooldownAnchor;
      readonly modifierPolicy: CooldownModifierPolicy;
    }
  | {
      /**
       * A rigorous LOWER BOUND on the remaining time, and nothing more.
       *
       * `atLeastRemainingMs` may be relied on; the true value may be larger.
       * There is deliberately no upper bound field: this module has no mechanism
       * that could establish one, and an unused field would invite inventing it.
       */
      readonly state: "BOUNDED";
      readonly atLeastRemainingMs: number;
      readonly baseCooldownMs: number;
      readonly elapsedMs: number;
      readonly queryFightTimeMs: number;
      readonly anchor: CooldownAnchor;
      readonly modifierPolicy: CooldownModifierPolicy;
    }
  | {
      readonly state: "UNKNOWN";
      readonly reason: CooldownUnknownReason;
      /** The M4 reason, when the refusal came from M4 rather than from here. */
      readonly castStateReason: UnknownReason | null;
      /** The anchor that was found but could not be used, when one was. */
      readonly anchor: CooldownAnchor | null;
    };

export interface CooldownQuery {
  readonly state: CombatState;
  /** The acting player. A cooldown belongs to one actor. */
  readonly actorId: number;
  readonly abilityGameId: number;
  /** MILLISECONDS. `null` when the pinned dataset carries no entry. */
  readonly baseCooldownMs: number | null;
  /**
   * `spell_data_t::_charge_cooldown`, in MILLISECONDS. THE charge discriminator.
   *
   * SimulationCraft decides whether an ability uses the charge system by testing
   * the CHARGE COOLDOWN, not the charge count (action.cpp:710-724):
   *
   *     if ( spell_data.charge_cooldown() > 0 ) { cooldown->charges = spell_data.charges(); … }
   *     else if ( spell_data.cooldown() > 0 )   { cooldown->duration = spell_data.cooldown(); }
   *
   * A DBC `_charges` of 0 therefore means "no charge system", NOT "zero charges
   * available" — `cooldown_t` constructs with `charges( 1 )` and stays there for
   * an ordinary cooldown. Guarding on `_charges` would read a perfectly normal
   * ability as one the player can never cast.
   */
  readonly chargeCooldownMs: number;
  /**
   * `spell_data_t::_charges`. Read ONLY when `chargeCooldownMs > 0` (M5-D1).
   *
   * A DBC `_charges` of 0 on a non-charge ability means "no charge system", NOT
   * "zero charges available", which is why this is never consulted on the
   * ordinary path. On the charge path it is the discriminator between the one
   * case that is provably equivalent to an ordinary cooldown and every case that
   * is not.
   *
   * OPTIONAL, defaulting to a value that REFUSES. A caller that supplies a charge
   * cooldown but forgets the count gets `CHARGES_NOT_MODELLED`, never the
   * supported one-charge path.
   */
  readonly charges?: number;
  readonly modifierPolicy: CooldownModifierPolicy;
  /** Canonical index of the decision point. Never an ingestion ordinal. */
  readonly position: number;
}

function unknown(
  reason: CooldownUnknownReason,
  castStateReason: UnknownReason | null = null,
  anchor: CooldownAnchor | null = null,
): CooldownState {
  return { state: "UNKNOWN", reason, castStateReason, anchor };
}

function anchorFrom(cast: ObservedCast): CooldownAnchor {
  return {
    abilityGameId: cast.abilityGameId ?? 0,
    actorId: cast.actorId,
    position: cast.position,
    castFightTimeMs: cast.fightTimeMs,
    locator: cast.locator,
  };
}

/**
 * Derives an ability's remaining cooldown at one decision position.
 *
 * The anchor is the LAST COMPLETE cast of this ability by this actor at or
 * before the query, which is what `lastObservedCast` returns. Three properties
 * of that come for free and all three matter:
 *
 *   - it is scoped by CANONICAL POSITION, not timestamp, so a cast sharing the
 *     query's timestamp anchors only if it genuinely precedes it in the stream
 *   - it returns the MOST RECENT such cast, so an older cast never wins
 *   - it fails closed on non-monotonic time
 *
 * A BEGIN cast is not accepted. The pinned cooldown starts inside
 * `action_t::execute()`, and only a COMPLETE cast evidences execution.
 */
export function cooldownRemainingAt(query: CooldownQuery): CooldownState {
  const { state, actorId, abilityGameId, chargeCooldownMs, modifierPolicy, position } = query;

  // WHICH FIELD IS THE RECHARGE, decided the way SimulationCraft decides it.
  //
  // On the charge path the ordinary `_cooldown` is demoted to an internal
  // cooldown and the CHARGE cooldown becomes `cooldown->duration`. Reading the
  // nominal field there would claim Vanish recharges in one second.
  const isChargeSystem = chargeCooldownMs > 0;
  const baseCooldownMs = isChargeSystem ? chargeCooldownMs : query.baseCooldownMs;

  if (isChargeSystem) {
    // Two or more charges changes what "remaining" even MEANS: an ability at one
    // of two charges is usable now AND recharging. Rather than pick a reading,
    // refuse. One charge is the ordinary case — see the module header — and a
    // caller that omits the count lands here rather than in it.
    if (query.charges !== 1) {
      return unknown("CHARGES_NOT_MODELLED");
    }
  }

  if (baseCooldownMs === null || !(baseCooldownMs > 0)) {
    return unknown("BASE_COOLDOWN_NOT_MODELLED");
  }
  if (modifierPolicy.kind !== "NO_MODIFIERS_PROVEN_ABSENT") {
    return unknown("MODIFIERS_NOT_PROVEN_ABSENT");
  }

  const queryEvent = state.eventAt(position);
  if (queryEvent === null) {
    return unknown("QUERY_POSITION_UNRESOLVED");
  }
  const queryFightTimeMs = queryEvent.fightTimeMs;

  const lastCast = state.lastObservedCast({
    actorId,
    abilityGameId,
    castPhase: "COMPLETE",
    before: { anchor: "BEFORE_EVENT", position },
  });

  if (lastCast.certainty !== "EXACT") {
    return unknown("CAST_STATE_UNKNOWN", "reason" in lastCast ? lastCast.reason : null);
  }
  if (lastCast.value === null) {
    // A PROVEN absence of any prior cast. That is not a ready cooldown: the
    // ability may have been used before the capture began, and this module has
    // no coverage claim that would license reading silence as "never cast".
    return unknown("NO_OBSERVED_CAST");
  }

  const anchor = anchorFrom(lastCast.value);

  // Time must move forwards from the cast to the query. `lastObservedCast` scopes
  // by canonical position; this is the independent check that the two orders agree
  // for these two specific events.
  if (queryFightTimeMs < anchor.castFightTimeMs) {
    return unknown("NON_MONOTONIC_TIME", "NON_MONOTONIC_TIME", anchor);
  }

  const elapsedMs = queryFightTimeMs - anchor.castFightTimeMs;
  // A finished cooldown bounds at zero, never below. A negative "remaining"
  // would compare as less than every threshold in the pinned APL.
  //
  // Once elapsed exceeds the base duration the bound degrades to "at least 0",
  // which is true and decides nothing — so a comparison against it comes back
  // UNKNOWN. That is the honest outcome: the sampled start delay could still be
  // holding the cooldown out, and no evidence here rules that out.
  const atLeastRemainingMs = Math.max(0, baseCooldownMs - elapsedMs);

  return {
    state: "BOUNDED",
    atLeastRemainingMs,
    baseCooldownMs,
    elapsedMs,
    queryFightTimeMs,
    anchor,
    modifierPolicy,
  };
}

/**
 * The remaining time a caller may rely on, in MILLISECONDS, or `null`.
 *
 * Collapses EXACT and BOUNDED to the strongest LOWER bound each supports, which
 * is what a `remains <= threshold` comparison needs. `null` for UNKNOWN — never
 * zero, which would read as "ready now".
 */
export function guaranteedRemainingMs(cooldown: CooldownState): number | null {
  switch (cooldown.state) {
    case "EXACT":
      return cooldown.remainingMs;
    case "BOUNDED":
      return cooldown.atLeastRemainingMs;
    case "UNKNOWN":
      return null;
  }
}
