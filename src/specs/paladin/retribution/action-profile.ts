/**
 * The Retribution Paladin reading of applicability and usability (M11-A4).
 *
 * WHAT THIS COMPOSES
 *
 *     src/simc/action-applicability             the generic verdict vocabulary
 *     ./domain-boundary                         the class/spec authority boundary
 *     src/data/game/paladin-retribution-talents the pinned build facts
 *     src/data/game/paladin-retribution-gcd-…   the pinned token identities
 *     src/data/game/paladin-retribution-item-…  the pinned main-hand facts
 *     src/data/game/paladin-retribution-spender-costs
 *                                               the pinned Holy Power costs
 *
 * APPLICABILITY, IN THE PINNED ORDER
 *
 * The domain boundary is decided FIRST: a racial, a potion, an item use, an
 * external buff is `OUTSIDE_SUPPORTED_DECISION_DOMAIN` before any build fact
 * is read (`domain-boundary.ts`). Then the constructor readings, each a
 * `background = true` site of the pinned module:
 *
 *     talent-built actions      `action_t::action_t` marks an action built on
 *                               `spell_data_t::not_found()` background
 *                               (action.cpp:541-549); a talent that is not
 *                               taken yields exactly that. Divine Storm,
 *                               Wake of Ashes and Execution Sentence also
 *                               say so explicitly (sc_paladin_retribution.cpp
 *                               :549-550, :810-811, :221-222); Blade of
 *                               Justice and Divine Toll rely on the shared
 *                               rule.
 *     hammer_of_light           background unless the Templar tree is active
 *                               (sc_paladin.cpp:2149)
 *     crusader_strike           background under Crusading Strikes or Templar
 *                               Strikes (sc_paladin.cpp:1072-1075)
 *     templar_strike, _slash    background without Templar Strikes
 *                               (sc_paladin_retribution.cpp:962-963)
 *     templars_verdict          background unless the main hand is a
 *                               two-handed weapon (sc_paladin_retribution.cpp
 *                               :675-676). A two-handed weapon equips ONLY in
 *                               the main hand, so a worn item the dataset
 *                               pins as INVTYPE_2HWEAPON proves the action
 *                               foreground without a slot-index convention;
 *                               nothing pinned leaves it UNKNOWN
 *     avenging_wrath            background without the talent or under
 *                               Radiant Glory (sc_paladin.cpp:286-293). The
 *                               two other guards there — Avenging Crusader,
 *                               Sentinel — are Holy and Protection
 *                               specialization-tree talents; a Retribution
 *                               actor (the identity the caller has already
 *                               validated) cannot hold either
 *     hammer_of_wrath, judgment built on `find_spell(24275)` / `find_spell(20271)`
 *                               (sc_paladin.cpp:3407-3421): no guard, applicable
 *
 * Everything else is APPLICABLE, the honest default, and an UNKNOWN build
 * fact never excludes anything.
 *
 * ONE PINNED FACT MAY SETTLE AN OPEN CONSTRUCTOR READING — AND NOTHING
 * GENERIC DOES. A reading that comes out UNKNOWN (Avenging Wrath under a
 * Radiant Glory the three-way talent rule cannot disprove: a NORMAL node
 * absent from the observed tree is UNKNOWN, never false) is settled
 * APPLICABLE only when a hand-reviewed FOREGROUND-ONLY execution fact
 * exists for the token (`paladin-retribution-foreground-execution-
 * authority.ts`) and the actor was observed casting exactly the spell record
 * that fact names. For `avenging_wrath` the pinned module executes 31884
 * only through the foreground constructor — its background/triggered wings
 * is a different record, 454351 — so an observed 31884 cast is a foreground
 * execution under the pinned mechanics, and a foreground execution is
 * impossible while the action is background. An observed cast of any OTHER
 * ability proves nothing about any token: a background or triggered action
 * executes too, and the game emits cast events for such executions
 * (Crusading Strikes 408385 in this very evidence). There is no "cast
 * observed ⇒ selectable" rule. The fact never overrides a reading that came
 * out BACKGROUND: an observed foreground-only cast under a build the pinned
 * model reads as background is a CONTRADICTION, reported UNKNOWN. And an
 * UNKNOWN reading with no such fact, or with no such cast, stays UNKNOWN.
 *
 * USABILITY: THE PROOFS, AND NOTHING IN BETWEEN
 *
 *     SIMULATED_PREFIX_EXECUTION   this branch already fired the entry (counterfactual, named so)
 *     PROVEN_USABLE                the observed cast itself; or a spender whose
 *                                  pinned cost is KNOWN affordable and which the
 *                                  dataset pins with NO cooldown of any kind, or
 *                                  Divine Purpose proven up (sc_paladin.hpp:1471-1487)
 *     ACTIVE_COOLDOWN              a derived cooldown proven past the tolerance
 *     REQUIRED_AURA_INACTIVE       Hammer of Wrath with its readiness aura
 *                                  PROVEN down (sc_paladin.cpp:1799-1802)
 *     INSUFFICIENT_RESOURCE        a spender with Holy Power KNOWN below every
 *                                  pinned cost and Divine Purpose PROVEN down
 *
 * Judgment's own `action_ready()` requires the readiness aura ABSENT
 * (sc_paladin.cpp:1536-1539). A4 does not prove that direction: it would
 * need a new shared reason, and it is never decisive on the spender path —
 * `generators[5] call_action_list,name=finishers` is unconditional and
 * precedes `generators[9] judgment`. Judgment stays UNKNOWN.
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
import type { GearPiece } from "../../../engine/normalization/normalized-events.js";
import type { CooldownReadiness } from "../../../engine/game-state/cooldowns/cooldown-usability.js";
import { isEmptyGearSlot } from "../../../engine/normalization/combatant-info.js";
import type { HeroTreeResolution, TalentResolution } from "../../../data/game/talent-selection.js";
import { retributionTokenBinding } from "../../../data/game/paladin-retribution-gcd-semantics.js";
import {
  INVENTORY_TYPE_TWO_HAND_WEAPON,
  retributionItemForItemId,
} from "../../../data/game/paladin-retribution-item-effects.js";
import { retributionSpenderCostsFor } from "../../../data/game/paladin-retribution-spender-costs.js";
import { retributionForegroundOnlyExecutionFor } from "../../../data/game/paladin-retribution-foreground-execution-authority.js";
import { nonDomainApplicabilityFor } from "./domain-boundary.js";
import { hasExecuted, type ExecutedEntry, type RetributionFirstGcdState } from "./first-gcd-state.js";
import { UNKNOWN_SPENDER_FACTS, type RetributionSpenderFacts } from "./holy-power.js";

export const HAMMER_OF_LIGHT_TOKEN = "hammer_of_light";
export const CRUSADER_STRIKE_TOKEN = "crusader_strike";
export const TEMPLAR_STRIKE_TOKEN = "templar_strike";
export const TEMPLAR_SLASH_TOKEN = "templar_slash";
export const TEMPLARS_VERDICT_TOKEN = "templars_verdict";
export const DIVINE_STORM_TOKEN = "divine_storm";
export const AVENGING_WRATH_TOKEN = "avenging_wrath";
export const HAMMER_OF_WRATH_TOKEN = "hammer_of_wrath";
export const JUDGMENT_TOKEN = "judgment";

export const TEMPLAR_HERO_TREE_NAME = "templar";

/** Token → the pinned talent whose absence makes the action `not_found()`-background (action.cpp:541-549). */
export const TALENT_BUILT_TOKENS: Readonly<Record<string, string>> = Object.freeze({
  divine_storm: "divine_storm",
  wake_of_ashes: "wake_of_ashes",
  execution_sentence: "execution_sentence",
  blade_of_justice: "blade_of_justice",
  divine_toll: "divine_toll",
});

/** The proven build facts the applicability rules read. Resolved once per actor. */
export interface RetributionBuildFacts {
  /** Every modelled talent's three-way resolution, by SimulationCraft name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  readonly heroTree: HeroTreeResolution;
  /** The actor's combatant-info gear rows, positional, placeholders included. */
  readonly wornGear: readonly GearPiece[];
  /**
   * Every ability the actor was OBSERVED casting (COMPLETE, non-melee) in
   * this fight's evidence. Read ONLY against the pinned foreground-only
   * execution facts; never as a generic proof that any action is selectable.
   */
  readonly observedCastAbilityIds: ReadonlySet<number>;
}

function background(pinnedBehaviour: string): ActionApplicability {
  return notApplicable("BACKGROUND_UNDER_PROVEN_BUILD", { itemId: null, slot: null, pinnedBehaviour });
}

function selectionOf(facts: RetributionBuildFacts, simcName: string): TalentResolution["selection"] {
  return facts.talents[simcName]?.selection ?? "UNKNOWN";
}

/** Whether the hero tree is RESOLVED to a named tree, or unknown. */
function heroTreeIs(facts: RetributionBuildFacts, simcName: string): boolean | null {
  if (facts.heroTree.state !== "RESOLVED") return null;
  return facts.heroTree.simcName === simcName;
}

/**
 * Whether a worn item is PINNED as a two-handed weapon. A positive answer
 * proves the main hand holds one (nothing else can hold a two-hander);
 * `null` means no worn item is pinned, so nothing is proved either way.
 */
export function wornTwoHandedWeapon(gear: readonly GearPiece[]): { readonly itemId: number } | null {
  for (const piece of gear) {
    if (isEmptyGearSlot(piece)) continue;
    const identity = retributionItemForItemId(piece.itemId);
    if (identity !== null && identity.inventoryType === INVENTORY_TYPE_TWO_HAND_WEAPON) {
      return { itemId: identity.itemId };
    }
  }
  return null;
}

/**
 * Whether an APL entry is a selectable foreground action for this player.
 *
 * Returns APPLICABLE for anything this module has no grounds to exclude, and
 * UNKNOWN when the deciding build fact is unresolved.
 */
export function resolveRetributionApplicability(
  facts: RetributionBuildFacts,
  action: AplAction,
): ActionApplicability {
  // The domain boundary, before any build fact.
  const nonDomain = nonDomainApplicabilityFor(action);
  if (nonDomain !== null) return nonDomain;

  const reading = constructorReading(facts, action);
  // Only a pinned foreground-only execution fact may refine the reading, and
  // only in one direction: UNKNOWN → APPLICABLE. Every other token, and every
  // other observed ability, leaves the reading exactly as the constructor
  // semantics gave it.
  const fact = retributionForegroundOnlyExecutionFor(action.actionToken);
  if (fact === null || !facts.observedCastAbilityIds.has(fact.abilityGameId)) return reading;
  if (reading.kind === "UNKNOWN") return applicable();
  if (reading.kind === "NOT_APPLICABLE") {
    return unknownApplicability(
      `the pinned build reads '${action.actionToken}' as background, yet the actor was observed casting ` +
        `${String(fact.abilityGameId)}, which the pinned module executes only through the foreground ` +
        "constructor; the pinned model and the log contradict each other, and neither is resolved",
    );
  }
  return reading;
}

/** Whether a pinned foreground-only execution fact settles this token for this actor (diagnostic). */
export function foregroundProvenByObservedExecution(
  facts: RetributionBuildFacts,
  actionToken: string,
): { readonly abilityGameId: number } | null {
  const fact = retributionForegroundOnlyExecutionFor(actionToken);
  if (fact === null || !facts.observedCastAbilityIds.has(fact.abilityGameId)) return null;
  return { abilityGameId: fact.abilityGameId };
}

/** The constructor reading alone: what the pinned module says of the action under the proven build. */
function constructorReading(facts: RetributionBuildFacts, action: AplAction): ActionApplicability {
  const { actionToken } = action;

  const talentBuilt = TALENT_BUILT_TOKENS[actionToken];
  if (talentBuilt !== undefined) {
    const selection = selectionOf(facts, talentBuilt);
    if (selection === "SELECTED") return applicable();
    if (selection === "NOT_SELECTED") {
      return background(
        `the action is built on talents.${talentBuilt}, which resolves NOT_SELECTED in the observed tree; ` +
          "an action built on spell_data_t::not_found() is background (action.cpp:541-549)",
      );
    }
    return unknownApplicability(
      `the action is built on talents.${talentBuilt}, and the observed talent tree does not resolve it`,
    );
  }

  if (actionToken === HAMMER_OF_LIGHT_TOKEN) {
    const templar = heroTreeIs(facts, TEMPLAR_HERO_TREE_NAME);
    if (templar === null) {
      return unknownApplicability(
        "hammer_of_light_t is background unless the Templar tree is active (sc_paladin.cpp:2149), and the " +
          "observed talent tree resolves no pinned hero sub-tree",
      );
    }
    if (templar) return applicable();
    return background(
      "hammer_of_light_t constructor: background = !p->templar() (sc_paladin.cpp:2149); the observed " +
        "talent tree resolves to a different pinned hero sub-tree",
    );
  }

  if (actionToken === CRUSADER_STRIKE_TOKEN) {
    const crusading = selectionOf(facts, "crusading_strikes");
    const templarStrikes = selectionOf(facts, "templar_strikes");
    if (crusading === "SELECTED" || templarStrikes === "SELECTED") {
      return background(
        "crusader_strike_t constructor: if ( p->talents.crusading_strikes->ok() || p->talents.templar_strikes->ok() ) " +
          "background = true (sc_paladin.cpp:1072-1075); one of them is SELECTED in the observed tree",
      );
    }
    if (crusading === "NOT_SELECTED" && templarStrikes === "NOT_SELECTED") return applicable();
    return unknownApplicability(
      "crusader_strike is background under Crusading Strikes or Templar Strikes (sc_paladin.cpp:1072-1075), " +
        "and the observed talent tree leaves at least one of them unresolved",
    );
  }

  if (actionToken === TEMPLAR_STRIKE_TOKEN || actionToken === TEMPLAR_SLASH_TOKEN) {
    const templarStrikes = selectionOf(facts, "templar_strikes");
    if (templarStrikes === "SELECTED") return applicable();
    if (templarStrikes === "NOT_SELECTED") {
      return background(
        "base_templar_strike_t constructor: if ( !p->talents.templar_strikes->ok() ) background = true " +
          "(sc_paladin_retribution.cpp:962-963); Templar Strikes is NOT_SELECTED in the observed tree",
      );
    }
    return unknownApplicability(
      "templar_strike and templar_slash are background without Templar Strikes (sc_paladin_retribution.cpp:962-963), " +
        "and the observed talent tree does not resolve it",
    );
  }

  if (actionToken === TEMPLARS_VERDICT_TOKEN) {
    const twoHander = wornTwoHandedWeapon(facts.wornGear);
    if (twoHander !== null) return applicable();
    return unknownApplicability(
      "templars_verdict_t is background unless the main hand is INVTYPE_2HWEAPON (sc_paladin_retribution.cpp:675-676), " +
        "and no worn item is pinned as a two-handed weapon in the Retribution item dataset",
    );
  }

  if (actionToken === AVENGING_WRATH_TOKEN) {
    const wings = selectionOf(facts, "avenging_wrath");
    const radiantGlory = selectionOf(facts, "radiant_glory");
    if (wings === "NOT_SELECTED" || radiantGlory === "SELECTED") {
      return background(
        "avenging_wrath_t constructor: background = true without talents.avenging_wrath or under " +
          "talents.radiant_glory (sc_paladin.cpp:286-293); the observed tree proves one of those",
      );
    }
    if (wings === "SELECTED" && radiantGlory === "NOT_SELECTED") return applicable();
    return unknownApplicability(
      "avenging_wrath_t is background without the talent or under Radiant Glory (sc_paladin.cpp:286-293), " +
        "and the observed talent tree leaves at least one of them unresolved",
    );
  }

  return applicable();
}

/**
 * What is known about cooldown READINESS at this decision, per APL token —
 * derived by the specialization's cooldown bindings from OBSERVED prior casts.
 * Only PROVEN_NOT_READY is ever acted on. A token absent from the list has no
 * readiness fact.
 */
export interface RetributionReadinessFact {
  readonly simcToken: string;
  readonly readiness: CooldownReadiness;
  readonly abilityGameId: number | null;
}

/**
 * An action whose own `ready()` requires an aura the evidence has PROVEN
 * inactive at this decision: Hammer of Wrath outside wings. Only a BOUND
 * `up: false` from an observed removal produces one; silence never does.
 */
export interface RetributionAuraGateFact {
  readonly simcToken: string;
  readonly requiredAuraAbilityGameId: number;
  readonly anchorReportTimeMs: number;
}

export const NO_READINESS_FACTS: readonly RetributionReadinessFact[] = [];
export const NO_AURA_GATE_FACTS: readonly RetributionAuraGateFact[] = [];

/** The pinned costs of a spender token, and whether the dataset pins it cooldown-free. */
function spenderPin(actionToken: string): {
  readonly minCost: number;
  readonly maxCost: number;
  readonly spellIds: readonly number[];
  readonly cooldownFree: boolean;
} | null {
  const rows = retributionSpenderCostsFor(actionToken).filter((row) => row.holyPowerCost !== null);
  if (rows.length === 0) return null;
  const costs = rows.map((row) => row.holyPowerCost ?? 0);
  return {
    minCost: Math.min(...costs),
    maxCost: Math.max(...costs),
    spellIds: rows.map((row) => row.spellId),
    cooldownFree: rows.every(
      (row) =>
        row.cooldownMs === 0 &&
        row.chargeCooldownMs === 0 &&
        row.internalCooldownMs === 0 &&
        row.categoryCooldownMs === 0,
    ),
  };
}

export function resolveRetributionUsability(
  state: RetributionFirstGcdState,
  action: AplAction,
  observedAbilityGameId: number,
  spender: RetributionSpenderFacts = UNKNOWN_SPENDER_FACTS,
  readiness: readonly RetributionReadinessFact[] = NO_READINESS_FACTS,
  auraGates: readonly RetributionAuraGateFact[] = NO_AURA_GATE_FACTS,
): ActionUsabilityVerdict {
  const entry: ExecutedEntry = {
    listName: action.listName,
    priorityOrdinal: action.priorityOrdinal,
    actionToken: action.actionToken,
    sourceLine: action.sourceLine,
  };

  // HYPOTHETICAL FIRST, under its own reason.
  if (hasExecuted(state, entry)) {
    return provenUnusable("SIMULATED_PREFIX_EXECUTION", {
      abilityGameId: null,
      itemId: null,
      provenRemainingAtLeastMs: null,
      cooldownToleranceMs: null,
      detail:
        "HYPOTHETICAL, not observed: in this explored branch this authority entry has already been " +
        "selected once, and nothing returns it at zero elapsed time. This says nothing about what the " +
        "player actually did.",
    });
  }

  // OBSERVED SECOND. The cast that demonstrably fired demonstrably was usable.
  const binding = retributionTokenBinding(action.actionToken);
  const candidates =
    binding.kind === "KNOWN_ONE"
      ? [binding.abilityGameId]
      : binding.kind === "KNOWN_SET"
        ? binding.abilityGameIds
        : [];
  if (candidates.includes(observedAbilityGameId)) return { kind: "PROVEN_USABLE" };

  // A DERIVED cooldown proven to exceed the queueing tolerance.
  const fact = readiness.find((row) => row.simcToken === action.actionToken);
  if (fact !== undefined && fact.readiness.state === "PROVEN_NOT_READY") {
    return provenUnusable("ACTIVE_COOLDOWN", {
      abilityGameId: fact.abilityGameId,
      itemId: null,
      provenRemainingAtLeastMs: fact.readiness.provenRemainingAtLeastMs,
      cooldownToleranceMs: fact.readiness.cooldownToleranceMs,
      detail:
        "the ability's own cooldown, anchored on the actor's last OBSERVED cast before this decision under " +
        "the pinned base and the reviewed modifier policy, is proven to exceed the queueing tolerance, so " +
        "action_t::ready cannot succeed. The bound is a LOWER bound and is compared as one.",
    });
  }

  // Hammer of Wrath: `judgment_base_t::action_ready() && p()->buffs.hammer_of_wrath->up()`
  // (sc_paladin.cpp:1799-1802). The fact comes from a BOUND `up: false`
  // reading of the readiness aura, never from silence.
  const gate = auraGates.find((row) => row.simcToken === action.actionToken);
  if (gate !== undefined) {
    return provenUnusable("REQUIRED_AURA_INACTIVE", {
      abilityGameId: gate.requiredAuraAbilityGameId,
      itemId: null,
      provenRemainingAtLeastMs: null,
      cooldownToleranceMs: null,
      detail:
        `action_ready() requires aura ${String(gate.requiredAuraAbilityGameId)} up, and M4 proved it INACTIVE ` +
        `from the removal observed at ${String(gate.anchorReportTimeMs)}; the action cannot fire whatever its cooldown says.`,
    });
  }

  // The Holy Power spenders, under the pinned cost and the free-cast route.
  const pin = spenderPin(action.actionToken);
  if (pin !== null) {
    const pool = spender.holyPower;
    const known = pool.state === "KNOWN_NUMBER" ? pool.value : null;
    // Divine Purpose proven UP: holy_power_consumer_t::cost() returns 0
    // (sc_paladin.hpp:1471-1487), and the dataset pins no cooldown to wait on.
    if (spender.divinePurposeUp === true && pin.cooldownFree) return { kind: "PROVEN_USABLE" };
    // Affordable against EVERY pinned cost of the token, and cooldown-free.
    if (known !== null && known >= pin.maxCost && pin.cooldownFree) return { kind: "PROVEN_USABLE" };
    // Below EVERY pinned cost, with the free route disproved. Divine Storm
    // has a SECOND free route, Empyrean Power (sc_paladin.hpp:1478-1480),
    // that nothing here disproves, so the claim is never made for it.
    if (
      known !== null &&
      known < pin.minCost &&
      spender.freeCastExcluded &&
      action.actionToken !== DIVINE_STORM_TOKEN
    ) {
      return provenUnusable("INSUFFICIENT_RESOURCE", {
        abilityGameId: pin.spellIds[0] ?? null,
        itemId: null,
        provenRemainingAtLeastMs: null,
        cooldownToleranceMs: null,
        detail:
          `Holy Power is KNOWN ${String(known)} and the pinned cost is ${String(pin.minCost)}; Divine Purpose ` +
          "is PROVEN down, so action_t::ready() fails cost_affordable()",
      });
    }
  }

  return unknownUsability();
}
