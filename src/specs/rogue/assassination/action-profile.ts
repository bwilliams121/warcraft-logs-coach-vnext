/**
 * The Assassination reading of applicability and negative usability.
 *
 * WHAT THIS COMPOSES
 *
 *     src/simc/authority-profile      the two profiles and their provenance
 *     src/simc/action-applicability   the generic verdict vocabulary
 *     src/data/game/rogue-item-effects the pinned ON_USE facts
 *     engine/game-state/cooldowns     the derivation and the readiness bridge
 *
 * None of those knows what `use_items,slots=trinket2` means. This module is
 * where the specialization says which pinned SimulationCraft behaviour each APL
 * entry shape corresponds to.
 *
 * THE THREE ENTRY SHAPES C3c2 CLASSIFIES
 *
 *     use_item,name=<token>        applicable iff the actor equips that item id
 *     use_items,slots=<slot>       applicable iff the slot's item has an ON_USE
 *                                  effect — an ON_EQUIP-only trinket yields no
 *                                  selectable action at all
 *     invoke_external_buff         always applicable; never ready under an empty
 *                                  external-buff pool
 *
 * Everything else is APPLICABLE, which is the honest default: this module models
 * no race, so it makes no claim about racials, and an entry it does not
 * recognise is not one it has grounds to skip.
 *
 * WHY UNEQUIPPED IS NOT "ON COOLDOWN"
 *
 * A named item the actor never equipped produces `background = true` in
 * SimulationCraft's `use_item_t` constructor, and the scan skips background
 * actions before any readiness check. Reporting that as a cooldown would turn a
 * fact about the player's gear into a fact about timing, and would invite a
 * later reader to ask when it "comes off cooldown".
 */

import type { AplAction } from "../../../simc/apl-authority.js";
import {
  applicable,
  notApplicable,
  provenUnusable,
  unknownApplicability,
  unknownUsability,
  type ActionApplicability,
  type ActionUsabilityVerdict,
} from "../../../simc/action-applicability.js";
import {
  isItemEquipped,
  slotOccupancy,
  type AuthorityPlayerProfile,
} from "../../../simc/authority-profile.js";
import { itemEffectForItemId, itemEffectForToken } from "../../../data/game/rogue-item-effects.js";
import { STEALTH_READINESS_AUTHORITY } from "../../../data/game/stealth-readiness-authority.js";
import { bindStealthedRogue, VANISH_BUFF_ABILITY_ID } from "./stealth-state.js";
import { bindCombatEngagement, STEALTH_IN_COMBAT_AUTHORITY } from "./combat-engagement.js";
import { deriveCooldown } from "./cooldown-bindings.js";
import { cooldownReadinessAt } from "../../../engine/game-state/cooldowns/cooldown-usability.js";
import {
  cooldownRemainingAt,
  type CooldownModifierPolicy,
  type CooldownState,
} from "../../../engine/game-state/cooldowns/cooldown-state.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import { EXTERNAL_BUFF_AUTHORITY } from "../../../data/game/external-buff-authority.js";

/** The APL tokens whose applicability this module decides. */
const USE_ITEM_TOKEN = "use_item";
const USE_ITEMS_TOKEN = "use_items";
const INVOKE_EXTERNAL_BUFF_TOKEN = "invoke_external_buff";
const STEALTH_TOKEN = "stealth";
const VANISH_TOKEN = "vanish";

/** The pinned guard the Vanish claim rests on. Author-written, never interpolated. */
const VANISH_READY_GUARD = "sc_rogue.cpp:6046-6052";

/**
 * `stealth` usability when the player is NOT proven stealthed (M5-D1).
 *
 * The second half of `stealth_t::ready()`. See `combat-engagement.ts` for the
 * pinned control flow and for why both facts are established positively rather
 * than inferred from the absence of a restriction.
 *
 * `targetActorId` is not on `ActionProfileInput`, and adding it would widen a
 * type five other rules do not need. The enemy proof therefore searches the
 * DEBUFF the analysed player holds on the enemy the decision is about, which the
 * caller already supplies to the DoT derivation — see `resolveUsability`'s
 * `engagementTargetActorId`.
 */
function restealthUsability(input: ActionProfileInput): ActionUsabilityVerdict {
  const targetActorId = input.engagementTargetActorId;
  if (targetActorId === undefined) return unknownUsability();

  const engagement = bindCombatEngagement({
    state: input.state,
    actorId: input.actorId,
    targetActorId,
    position: input.position,
  });
  if (engagement.state !== "ENGAGED") return unknownUsability();

  return provenUnusable("RESTEALTH_NOT_PERMITTED_IN_COMBAT", {
    abilityGameId: engagement.enemy.abilityGameId,
    itemId: null,
    // NOT a timing claim. Stealth's own cooldown is irrelevant here: the guard
    // returns false before `action_t::ready()` is ever consulted.
    provenRemainingAtLeastMs: null,
    cooldownToleranceMs: null,
    detail:
      "the player is in combat with at least one living enemy — proven by a debuff this player holds on " +
      `actor ${String(engagement.enemy.enemyActorId)} at this instant — and ` +
      `${STEALTH_IN_COMBAT_AUTHORITY.readyGuard} enables re-stealth only when every enemy is asleep or ` +
      "dead, because that is the sole place restealth_allowed is ever set",
  });
}

/** The Vanish BUFF, when M4 proves it active. `null` otherwise — never a false. */
function bindVanishBuffActive(input: ActionProfileInput): { readonly abilityGameId: number } | null {
  const stealthed = bindStealthedRogue({
    state: input.state,
    actorId: input.actorId,
    position: input.position,
  });
  // The stealth binding names WHICH contributor proved TRUE, so the Vanish buff
  // can be identified without a second aura query. Any other contributor — plain
  // Stealth, Subterfuge — satisfies the MASK and does not satisfy this guard.
  if (stealthed.value !== "TRUE") return null;
  if (stealthed.provenBy.abilityGameId !== VANISH_BUFF_ABILITY_ID) return null;
  return { abilityGameId: stealthed.provenBy.abilityGameId };
}

/** `name=` and `slots=` parameters, read from the verbatim action string. */
function namedParameter(actionStringVerbatim: string, key: string): string | null {
  const match = new RegExp(`(?:^|,)${key}=([A-Za-z0-9_]+)`).exec(actionStringVerbatim);
  return match?.[1] ?? null;
}

export interface ActionProfileInput {
  readonly state: CombatState;
  readonly actorId: number;
  /** Canonical index of the decision point. Never an ingestion ordinal. */
  readonly position: number;
  readonly profile: AuthorityPlayerProfile;
  /**
   * The enemy the decision is about, for M5-D1's in-combat stealth proof.
   *
   * OPTIONAL, and its absence is a real state: without it the engagement proof
   * has no target to look for a debuff on, so `stealth` stays UNKNOWN rather
   * than being claimed unusable. Every pre-M5-D1 caller omits it and gets
   * exactly its previous behaviour.
   */
  readonly engagementTargetActorId?: number;
}

/**
 * Whether an APL entry is a selectable foreground action for this player.
 *
 * Returns APPLICABLE for anything this module has no grounds to exclude. That
 * default is deliberate: a missing rule must not become a negative claim.
 */
export function resolveApplicability(input: ActionProfileInput, action: AplAction): ActionApplicability {
  if (action.actionToken === USE_ITEM_TOKEN) {
    const token = namedParameter(action.actionStringVerbatim, "name");
    if (token === null) return applicable();
    const identity = itemEffectForToken(token);
    // An item the pinned dataset does not carry cannot be resolved to a number,
    // so whether the actor equips it is unknowable — not false.
    if (identity === null) return applicable();
    if (isItemEquipped(input.profile.observed, identity.itemId)) return applicable();
    return notApplicable("ITEM_NOT_EQUIPPED", {
      itemId: identity.itemId,
      slot: null,
      pinnedBehaviour:
        "use_item_t constructor: find_item_by_name returned null, so background = true " +
        "(player.cpp:9874-9884) and select_action skips it before any readiness check",
    });
  }

  if (action.actionToken === USE_ITEMS_TOKEN) {
    const slot = namedParameter(action.actionStringVerbatim, "slots");
    if (slot === null) return applicable();
    const occupancy = slotOccupancy(input.profile.observed, slot);
    if (occupancy.state === "NOT_RESOLVED") {
      // The profile cannot read this slot. That is NOT an empty slot, and the
      // difference is the whole reason `slotOccupancy` has three states: an
      // unreadable slot might hold a usable trinket, so the entry stays live.
      return unknownApplicability(
        `the slot '${slot}' is not resolved by the observed profile, so whether this entry is a ` +
          "selectable action cannot be established",
      );
    }
    if (occupancy.state === "EMPTY") {
      return notApplicable("NO_ON_USE_EFFECT", {
        itemId: null,
        slot,
        pinnedBehaviour:
          "use_items_t::init: no sub-actions created for an empty slot, so background = true " +
          "(player.cpp:10285-10290)",
      });
    }
    const equipped = occupancy.item;
    const identity = itemEffectForItemId(equipped.itemId);
    // An equipped item the dataset does not carry: we cannot tell whether it has
    // an on-use effect, so we do not claim it has none.
    if (identity === null) return applicable();
    if (identity.onUseEffect !== null) return applicable();
    return notApplicable("NO_ON_USE_EFFECT", {
      itemId: equipped.itemId,
      slot,
      pinnedBehaviour:
        "use_item_t::init found no SPECIAL_EFFECT_USE, so background = true and the entry is erased " +
        "from the foreground action list (player.cpp:10024-10029)",
    });
  }

  return applicable();
}

/** What a cooldown-based refusal is ABOUT. Identity only; the rule reads none of it. */
interface CooldownSubject {
  readonly abilityGameId: number | null;
  readonly itemId: number | null;
  readonly detail: string;
}

/**
 * The ONE cooldown -> negative-usability translation, shared by every caller.
 *
 * Deliberately takes a `CooldownState` and a tolerance and nothing else. It does
 * not know whether the cooldown belongs to a trinket, a class ability or
 * anything else, and it must not learn: a bridge that branched on a token would
 * mean each new supported ability needed a new rule, and the rule is the same
 * one every time.
 *
 * `subject` is carried into the evidence and never read by the comparison.
 */
function usabilityFromCooldown(
  cooldown: CooldownState,
  cooldownToleranceMs: number | null,
  reason: "ACTIVE_COOLDOWN",
  subject: CooldownSubject,
): ActionUsabilityVerdict {
  const readiness = cooldownReadinessAt({ cooldown, cooldownToleranceMs });
  // Every UNKNOWN reason lands here: unestablished tolerance, underivable
  // cooldown, a remainder inside the queueing tolerance, and a charge system
  // this project does not model. None of them is a readiness claim.
  if (readiness.state !== "PROVEN_NOT_READY") return unknownUsability();
  return provenUnusable(reason, {
    abilityGameId: subject.abilityGameId,
    itemId: subject.itemId,
    provenRemainingAtLeastMs: readiness.provenRemainingAtLeastMs,
    cooldownToleranceMs: readiness.cooldownToleranceMs,
    detail: subject.detail,
  });
}

/**
 * Whether an applicable entry is proven unable to fire.
 *
 * Each claim comes from positive evidence. Everything else is UNKNOWN, including
 * every action this module has no readiness model for.
 */
export function resolveUsability(
  input: ActionProfileInput,
  action: AplAction,
  observedAbilityGameId: number,
  abilityIdFor: (token: string) => number | null,
): ActionUsabilityVerdict {
  // ---- Stealth: unready precisely because the player is already stealthed ----
  //
  // The cheapest proof in the milestone. `stealth_t::ready()` opens by testing
  // `stealthed( STEALTH_BASIC | STEALTH_ROGUE )`, and the APL expression
  // `stealthed.rogue` passes the IDENTICAL mask to the IDENTICAL function. So
  // M5-C2's existing TRUE is already a readiness proof and no new state is read.
  //
  // The asymmetry matters: only TRUE proves anything. An UNKNOWN stealth state
  // leaves the verdict UNKNOWN, because `ready()` has further guards below this
  // one that this module does not model.
  if (action.actionToken === STEALTH_TOKEN) {
    const stealthed = bindStealthedRogue({
      state: input.state,
      actorId: input.actorId,
      position: input.position,
    });
    if (stealthed.value !== "TRUE") {
      // NOT STEALTHED, OR UNKNOWN. The first guard says nothing, so fall to the
      // in-combat one (M5-D1) — which is what makes `default[0]` decidable at
      // the 40 of 42 real actor-19 decision points where stealth is not proven.
      //
      // Both guards return false, so their ORDER is a reporting choice rather
      // than a correctness one, and the stealthed proof stays first because it
      // is the more specific claim.
      return restealthUsability(input);
    }
    return provenUnusable("ALREADY_STEALTHED", {
      abilityGameId: stealthed.provenBy.abilityGameId,
      itemId: null,
      // NOT a timing claim. Nothing is waiting to recharge, so there is no
      // remainder and no tolerance to compare it against.
      provenRemainingAtLeastMs: null,
      cooldownToleranceMs: null,
      detail:
        "stealthed.rogue is proven TRUE, and stealth_t::ready() is guarded on the same " +
        `'${STEALTH_READINESS_AUTHORITY.sharedMaskExpression}' mask passed to the same function, so the ` +
        "guard returns false before any other condition is reached",
    });
  }

  // ---- Vanish: unready while its own buff is already up (M5-D1) ----
  //
  // `vanish_t::ready()` opens with `if ( p()->buffs.vanish->check() ) return
  // false;`. M4 already proves that buff ACTIVE at the C3c2-era decision point,
  // so this costs no new state — and it is a DIFFERENT claim from
  // `ALREADY_STEALTHED`, which tests a four-aura mask in a different function.
  if (action.actionToken === VANISH_TOKEN) {
    const active = bindVanishBuffActive(input);
    if (active !== null) {
      return provenUnusable("VANISH_BUFF_ALREADY_ACTIVE", {
        abilityGameId: active.abilityGameId,
        itemId: null,
        // NOT a timing claim. The buff is up; nothing is recharging.
        provenRemainingAtLeastMs: null,
        cooldownToleranceMs: null,
        detail:
          "the Vanish buff is proven ACTIVE from an observed application, and vanish_t::ready() " +
          `(${VANISH_READY_GUARD}) returns false before any other condition is reached`,
      });
    }
    // Not proven active. Fall through to the ordinary cooldown path below, which
    // is what M5-D1's one-charge recharge model makes answerable.
  }

  // ---- the external buff: statically unready under an empty pool ----
  if (action.actionToken === INVOKE_EXTERNAL_BUFF_TOKEN) {
    const buffName = namedParameter(action.actionStringVerbatim, "name");
    const pool = input.profile.simulation.externalBuffPool;
    const configured = buffName !== null && pool.some((entry) => entry.buffName === buffName);
    if (configured) {
      // A pool that names this buff gives the action real invocation cooldowns,
      // which this milestone does not model. UNKNOWN, not usable and not unusable.
      return unknownUsability();
    }
    return provenUnusable("STATIC_READY_FALSE", {
      abilityGameId: null,
      itemId: null,
      provenRemainingAtLeastMs: null,
      cooldownToleranceMs: null,
      detail:
        `the authority simulation profile configures no external-buff source for ` +
        `'${buffName ?? "(unnamed)"}', so ${EXTERNAL_BUFF_AUTHORITY.readyBehaviour}`,
    });
  }

  // ---- an equipped on-use item, still on its individual cooldown ----
  if (action.actionToken === USE_ITEMS_TOKEN) {
    const slot = namedParameter(action.actionStringVerbatim, "slots");
    const occupancy = slot === null ? null : slotOccupancy(input.profile.observed, slot);
    const equipped = occupancy !== null && occupancy.state === "OCCUPIED" ? occupancy.item : null;
    const identity = equipped === null ? null : itemEffectForItemId(equipped.itemId);
    const onUse = identity?.onUseEffect ?? null;
    if (identity === null || onUse === null) return unknownUsability();

    const cooldown = deriveItemCooldown(input, onUse.effectSpellId, onUse.baseCooldownMs);
    return usabilityFromCooldown(cooldown, input.profile.simulation.cooldownToleranceMs, "ACTIVE_COOLDOWN", {
      abilityGameId: onUse.effectSpellId,
      itemId: identity.itemId,
      detail:
        "the item's own use cooldown is proven to exceed the queueing tolerance, so use_item_t::ready " +
        "cannot succeed. The shared category cooldown was not consulted and is not needed.",
    });
  }

  // ---- an ordinary ability whose cooldown we derived ----
  const abilityGameId = abilityIdFor(action.actionToken);
  if (abilityGameId !== null && abilityGameId === observedAbilityGameId) {
    // The observed cast proves this one WAS usable. Positive evidence wins, and
    // it is checked BEFORE the cooldown so a derivation can never contradict an
    // observation.
    return { kind: "PROVEN_USABLE" };
  }

  // Any token the pinned cooldown dataset carries, with no token named here.
  // `deriveCooldown` returns null for everything else, so widening the supported
  // set is a data change rather than a code change.
  const derived = deriveCooldown(
    { state: input.state, actorId: input.actorId, position: input.position },
    action.actionToken,
  );
  if (derived !== null) {
    // A DERIVATION MUST NEVER CONTRADICT AN OBSERVATION.
    //
    // The short-circuit above only fires for tokens the ability dataset can
    // resolve, and most cannot. The cooldown dataset resolves its own token to a
    // number, so check that one too: if the action observed at this decision
    // point IS this ability, it demonstrably fired, whatever a cooldown anchored
    // on an EARLIER cast would say about it.
    if (derived.abilityGameId === observedAbilityGameId) return { kind: "PROVEN_USABLE" };

    return usabilityFromCooldown(
      derived.cooldown,
      input.profile.simulation.cooldownToleranceMs,
      "ACTIVE_COOLDOWN",
      {
        abilityGameId: derived.abilityGameId,
        itemId: null,
        detail:
          "the ability's own cooldown is proven to exceed the queueing tolerance, so action_t::ready " +
          "cannot succeed. The bound is a LOWER bound and is compared as one; nothing here claims the " +
          "exact remaining time.",
      },
    );
  }

  return unknownUsability();
}

/**
 * The modifier policy for an ITEM-use cooldown.
 *
 * Deliberately NOT the Kingsbane policy. That proof is about one named rogue
 * cooldown object; an item-use cooldown is a different object entirely, obtained
 * through `player->get_cooldown( e->cooldown_name() )`. The claims below are
 * recorded in the item artifact's `actionSemantics` and re-stated here so the
 * derivation carries them.
 */
function itemCooldownPolicy(): CooldownModifierPolicy {
  return {
    kind: "NO_MODIFIERS_PROVEN_ABSENT",
    sourcePath: "engine/class_modules/sc_rogue.cpp",
    sourceSha256: EXTERNAL_BUFF_AUTHORITY.rogueModuleSha256,
    claims: ["NO_ROGUE_MODIFIER_APPLIES_TO_AN_ITEM_USE_COOLDOWN"],
  };
}

/** Derives an item-use cooldown from the observed cast of its effect spell. */
export function deriveItemCooldown(
  input: ActionProfileInput,
  effectSpellId: number,
  baseCooldownMs: number,
): CooldownState {
  return cooldownRemainingAt({
    state: input.state,
    actorId: input.actorId,
    // The observed anchor is a cast of the EFFECT spell, which is what Warcraft
    // Logs records when an on-use item fires.
    abilityGameId: effectSpellId,
    baseCooldownMs,
    // An item-use effect has no charge cooldown in the pinned data; a future one
    // that does would refuse here rather than be modelled wrongly.
    chargeCooldownMs: 0,
    modifierPolicy: itemCooldownPolicy(),
    position: input.position,
  });
}
