/**
 * Nested authority traversal of the ROTATIONAL-GCD region of the pinned APL.
 *
 * WHAT THIS ANSWERS, AND THE WORD "ROTATIONAL" IS DOING REAL WORK
 *
 *     starting from the first entry of `default` that could occupy the next
 *     rotational GCD slot, and following every `call_action_list` from there,
 *     which action does the pinned authority select?
 *
 * It is NOT a literal all-foreground-actions scan from `default[0]`. The real
 * `default` begins with `stealth` and `kick`, whose readiness this project does
 * not model, so an absolute scan would block on entry 0 and say nothing at all.
 *
 * THE BOUNDARY IS A PROOF, NOT A CONVENIENCE
 *
 * The starting ordinal comes from M5-C1's `narrowToRotationalSlot`, which
 * establishes STRUCTURALLY — from pinned APL text plus pinned DBC, with no
 * combat state — that `default[0..3]` cannot themselves occupy the rotational
 * GCD slot: `stealth`, `kick` and `thistle_tea` are NON_GCD, and `variable`
 * executes and continues rather than ever being returned.
 *
 * WHAT THAT DOES AND DOES NOT CLAIM. It does NOT claim those entries were
 * unusable, would not have fired, or were proven false. Every one of them might
 * have executed. The claim is narrower and entirely structural: none of them can
 * be the action that FILLS the rotational GCD slot, so a question about that
 * slot may begin below them. A zero-GCD action that fires still ends its own
 * scan and is followed by a NEW scan — and it is that later scan this traversal
 * is about.
 *
 * The generic engine enforces the honesty of this. `ScanStartBoundary` carries
 * the proven-excluded ordinals, and the engine refuses any boundary whose proof
 * does not cover exactly what it skips. A start ordinal cannot be asserted here
 * without C1 having proved every entry above it.
 *
 * WHY COMBO POINTS ARE HANDLED THE WAY THEY ARE
 *
 * At the verified decision point Warcraft Logs reports Energy on the cast and no
 * combo-point resource at all, so combo points genuinely cannot be established.
 *
 * They are bound as UNKNOWN_NUMBER, exactly like every other unavailable
 * magnitude in this project. NO PLACEHOLDER NUMBER IS CONSTRUCTED ANYWHERE IN
 * THIS MODULE. An unestablished magnitude never enters evaluation as an invented
 * value, so there is nothing for a later check to detect and nothing to discard.
 *
 * An earlier version of this module did the opposite: it bound a concrete zero,
 * ran the traversal, then inspected the trace and threw the result away if a
 * combo-point atom turned out to have been read. That is fail-closed only after
 * the fabricated value has already participated in control flow, and it is the
 * behaviour M5-C3b's hardening pass removed.
 *
 * The unknown is not a dead end either. `combo_points>=5` against an unknown
 * magnitude is UNKNOWN_STATE, not FALSE, and Kleene evaluation still resolves a
 * condition whose answer does not depend on it — the same treatment
 * `pmultiplier` gets. So the traversal keeps whatever answers the evidence
 * genuinely supports and refuses only the ones it does not.
 */

import type { CombatState } from "../../../engine/state/combat-state.js";
import type { AplAction, AplAuthority } from "../../../simc/apl-authority.js";
import { knownNumber, unknownNumber, type AtomBindings } from "../../../simc/expression/evaluate.js";
import {
  applicable,
  unknownUsability,
  type ActionApplicability,
  type ActionUsabilityVerdict,
} from "../../../simc/action-applicability.js";
import type { AuthorityPlayerProfile } from "../../../simc/authority-profile.js";
import {
  selectAcrossLists,
  type ScanStartBoundary,
  type TraversalResult,
} from "../../../simc/nested-selection.js";
import { resolveApplicability, resolveUsability } from "./action-profile.js";
import { narrowToRotationalSlot } from "./rotational-slot.js";
import { acceptExactPreCost, adaptComboPoints, adaptEnergyPct } from "./envenom-decision.js";
import { bindStealthedRogue } from "./stealth-state.js";
import {
  deriveSupportedDotStates,
  dotRemainsBindingsFrom,
  type DerivedDotState,
} from "./dot-remains-state.js";
import {
  deriveRefreshableStates,
  refreshableBindingsFrom,
  type DerivedRefreshableState,
} from "./dot-refreshable.js";
import { cooldownBindingsFrom, deriveSupportedCooldowns, type DerivedCooldown } from "./cooldown-bindings.js";
import { tryAbilityIdentityFor } from "../../../data/game/rogue-abilities.js";

/** The list the rotational query begins in. */
export const ROTATIONAL_ENTRY_LIST = "default";

export type RotationalTraversalBlocker =
  /** C1 could not narrow the list, so there is no justified starting boundary. */
  | "ROTATIONAL_BOUNDARY_NOT_PROVEN"
  /** No pinned authority was supplied. */
  | "NO_AUTHORITY_AVAILABLE";

export interface RotationalTraversalInput {
  readonly state: CombatState;
  /** The acting player. */
  readonly actorId: number;
  /** The enemy the decision targets, for the DoT-state adapter. */
  readonly targetActorId: number;
  readonly targetInstance?: number | null;
  /** Canonical index of the decision point. */
  readonly position: number;
  /** The spell id observed cast here. Positive usability evidence only. */
  readonly observedAbilityGameId: number;
  readonly authority: AplAuthority | null;
  readonly comboPointWireType: number;
  readonly energyWireType: number;
  readonly comboPointResourceId: string;
  readonly energyResourceId: string;
  /** Talent selections already resolved by the caller. UNKNOWN ones are omitted. */
  readonly knownTalents: readonly { readonly name: string; readonly taken: boolean }[];
  /**
   * The player and simulation profile (M5-C3c2). OPTIONAL, and its absence is a
   * real state rather than a default to fill in.
   *
   * Omitted, the traversal makes NO applicability claim about any entry and no
   * negative usability claim beyond the observed cast — which is exactly the
   * pre-C3c2 behaviour. A profile is what licenses "this item is not equipped"
   * and "this cooldown exceeds the queueing tolerance"; without one, neither
   * sentence has anything behind it, so neither is said.
   */
  readonly profile?: AuthorityPlayerProfile;
}

export type RotationalTraversal =
  | {
      readonly kind: "ROTATIONAL_TRAVERSAL";
      readonly status: "TRAVERSED";
      /** The generic engine's verdict, verbatim. */
      readonly result: TraversalResult;
      readonly boundary: ScanStartBoundary;
      /** The bindings the traversal ran against, kept so a reader can audit them. */
      readonly bindings: AtomBindings;
      /** Cooldown derivations, including any that came back UNKNOWN. */
      readonly derivedCooldowns: readonly DerivedCooldown[];
      /** Per-action DoT derivations, including any that came back UNKNOWN. */
      readonly derivedDotStates: readonly DerivedDotState[];
      /** Per-action `refreshable` verdicts, including any that came back UNKNOWN. */
      readonly derivedRefreshableStates: readonly DerivedRefreshableState[];
      /** False when combo points could not be observed. Never silently true. */
      readonly comboPointsEstablished: boolean;
    }
  | {
      readonly kind: "ROTATIONAL_TRAVERSAL";
      readonly status: "UNAVAILABLE";
      readonly blocker: RotationalTraversalBlocker;
      /** Safe, author-written detail. Never interpolated from upstream data. */
      readonly detail: string;
    };

/**
 * The bindings one decision point evaluates against, and the two facts that come
 * with them.
 *
 * SPLIT OUT AT M5-C3c3c, verbatim and with no semantic change. Two queries now
 * evaluate the same decision — the rotational-suffix traversal and the first-GCD
 * rescan query — and they must evaluate against the SAME state. Copying this
 * construction into the second one would let the two drift, and a divergence
 * between them would be invisible: both would still return a well-formed answer.
 */
export interface RotationalBindings {
  readonly bindings: AtomBindings;
  /** Cooldown derivations, including any that came back UNKNOWN. */
  readonly derivedCooldowns: readonly DerivedCooldown[];
  /** Per-action DoT derivations, including any that came back UNKNOWN. */
  readonly derivedDotStates: readonly DerivedDotState[];
  /** Per-action `refreshable` verdicts, including any that came back UNKNOWN. */
  readonly derivedRefreshableStates: readonly DerivedRefreshableState[];
  /** False when combo points could not be observed. Never silently true. */
  readonly comboPointsEstablished: boolean;
}

export function rotationalBindingsAt(input: RotationalTraversalInput): RotationalBindings {
  const { state, actorId, targetActorId, position } = input;

  // ---- resource state, bound only where it was observed ----
  // An adaptation can fail even when the observation was exact — an unknown
  // resource maximum makes a percentage underivable. Both failures land on the
  // same honest answer: the value is not established, and is stated as such.
  const energyResult = state.resources.observationOnEvent(position, actorId, input.energyWireType);
  const energyAccepted = acceptExactPreCost(energyResult);
  const energyAdapted = energyAccepted.accepted
    ? adaptEnergyPct(energyAccepted.observation, input.energyResourceId)
    : null;
  const energyPct =
    energyAdapted !== null && energyAdapted.ok
      ? knownNumber(energyAdapted.percent)
      : unknownNumber("STATE_NOT_ESTABLISHED");

  const comboResult = state.resources.observationOnEvent(position, actorId, input.comboPointWireType);
  const comboAccepted = acceptExactPreCost(comboResult);
  const comboAdapted = comboAccepted.accepted
    ? adaptComboPoints(comboAccepted.observation, input.comboPointResourceId)
    : null;
  const combo = comboAdapted !== null && comboAdapted.ok ? comboAdapted : null;

  // ---- derived cooldown state (M5-C3c1) ----
  //
  // Only cooldowns that were actually derived are bound. An UNKNOWN one is
  // omitted, so its expression atom stays UNKNOWN_NUMBER rather than becoming a
  // zero that reads as "ready now".
  const derivedCooldowns = deriveSupportedCooldowns({ state, actorId, position });

  // ---- the derived facts M5-C2, M5-C3a and M5-D1 established ----
  const stealthedRogue = bindStealthedRogue({ state, actorId, position });
  const dotStates = deriveSupportedDotStates({
    state,
    actorId,
    targetActorId,
    targetInstance: input.targetInstance ?? null,
    position,
    comboPointWireType: input.comboPointWireType,
  });
  const refreshableStates = deriveRefreshableStates(dotStates);

  // ---- bindings: only what is POSITIVELY established ----
  //
  // An unbound BOOLEAN atom becomes an enumerated world, not `false`. An unknown
  // NUMERIC atom becomes UNKNOWN_NUMBER and is never enumerated.
  const bindings: AtomBindings = {
    // No placeholder. An unobserved combo-point count is UNKNOWN_NUMBER, and the
    // evaluator carries it as one rather than as a magnitude.
    comboPoints:
      combo === null ? unknownNumber("STATE_NOT_ESTABLISHED") : knownNumber(combo.state.observedAmount),
    comboPointsDeficit:
      combo === null ? unknownNumber("STATE_NOT_ESTABLISHED") : knownNumber(combo.state.derivedDeficit),
    energyPct,
    // KEYED BY ACTION TOKEN since M5-D1, and this is the site the keying was
    // introduced for. One scalar here meant `core_dot[3]`'s Rupture `remains`
    // would have read Garrote's number the moment that line became parseable.
    dotRemainsSecondsByAction: dotRemainsBindingsFrom(dotStates),
    // Also keyed by action, and also one-sided: only a PROVEN `refreshable`
    // appears here. An undecided one is omitted so its atom is enumerated.
    dotRefreshableByAction: refreshableBindingsFrom(refreshableStates),
    knownBuffs: [],
    knownTalents: input.knownTalents,
    knownCooldownRemainsSeconds: cooldownBindingsFrom(derivedCooldowns),
    // Positive-only. A stealth binding that is not TRUE is left OUT entirely, so
    // the atom is enumerated rather than bound to a `false` nobody proved.
    ...(stealthedRogue.value === "TRUE" ? { stealthedRogue: true as const } : {}),
  };

  return {
    bindings,
    derivedCooldowns,
    derivedDotStates: dotStates,
    derivedRefreshableStates: refreshableStates,
    comboPointsEstablished: combo !== null,
  };
}

/**
 * Traverses the pinned authority from the rotational boundary.
 *
 * Never returns nothing: every decision point gets an explicit structured
 * result, because a silently skipped point is indistinguishable from one that
 * was fine.
 */
export function traverseRotationalAuthority(input: RotationalTraversalInput): RotationalTraversal {
  const { state, actorId, targetActorId, position, authority } = input;

  if (authority === null) {
    return {
      kind: "ROTATIONAL_TRAVERSAL",
      status: "UNAVAILABLE",
      blocker: "NO_AUTHORITY_AVAILABLE",
      detail: "no pinned SimulationCraft APL is available for this specialization",
    };
  }

  // ---- the boundary, from M5-C1's structural proof ----
  const narrowing = narrowToRotationalSlot(authority, ROTATIONAL_ENTRY_LIST);
  if (narrowing.kind !== "NARROWED") {
    return {
      kind: "ROTATIONAL_TRAVERSAL",
      status: "UNAVAILABLE",
      blocker: "ROTATIONAL_BOUNDARY_NOT_PROVEN",
      detail:
        "the entry list could not be narrowed to a first rotational-slot candidate, so there is no " +
        "proven boundary to start from and starting anywhere else would assert entries do not fire",
    };
  }
  const boundary: ScanStartBoundary = {
    startOrdinal: narrowing.firstEligibleOrdinal,
    provenExcludedOrdinals: narrowing.provenIneligibleOrdinals,
    justification:
      "M5-C1 rotational-slot narrowing: every ordinal below the start is structurally incapable of " +
      "occupying the rotational GCD slot. This is NOT a claim that those entries do not fire.",
  };

  const { bindings, derivedCooldowns, derivedDotStates, derivedRefreshableStates, comboPointsEstablished } =
    rotationalBindingsAt(input);

  // ---- applicability and usability ----
  //
  // The observed cast proves ONE action was usable here. It proves nothing about
  // any other action, and in particular observing a lower-priority cast is not
  // evidence that a higher-priority one was unavailable.
  //
  // With a profile, the spec adapter may additionally prove the NEGATIVE
  // direction — an unequipped item, an on-use item still on cooldown, an
  // external buff with no configured source. Without one, every entry stays
  // APPLICABLE and nothing is proven unusable.
  const profile = input.profile;

  const abilityIdFor = (token: string): number | null => tryAbilityIdentityFor(token)?.spellId ?? null;

  const observedCastVerdict = (action: AplAction): ActionUsabilityVerdict => {
    const spellId = abilityIdFor(action.actionToken);
    if (spellId !== null && spellId === input.observedAbilityGameId) return { kind: "PROVEN_USABLE" };
    return unknownUsability();
  };

  const profileInput =
    profile === undefined
      ? null
      : // The enemy the decision is about, so M5-D1's in-combat stealth proof has a
        // target to look for this player's debuff on.
        { state, actorId, position, profile, engagementTargetActorId: targetActorId };

  const usabilityFor = (action: AplAction): ActionUsabilityVerdict =>
    profileInput === null
      ? observedCastVerdict(action)
      : resolveUsability(profileInput, action, input.observedAbilityGameId, abilityIdFor);

  const applicabilityFor = (action: AplAction): ActionApplicability =>
    profileInput === null ? applicable() : resolveApplicability(profileInput, action);

  const result = selectAcrossLists({
    authority,
    entryListName: ROTATIONAL_ENTRY_LIST,
    bindings,
    usabilityFor,
    applicabilityFor,
    startBoundary: boundary,
  });

  return {
    kind: "ROTATIONAL_TRAVERSAL",
    status: "TRAVERSED",
    result,
    boundary,
    bindings,
    derivedCooldowns,
    derivedDotStates,
    derivedRefreshableStates,
    comboPointsEstablished,
  };
}
