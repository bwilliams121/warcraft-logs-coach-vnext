/**
 * `cooldown.<token>.remains` and cooldown READINESS — the Protection-owned
 * reading of cooldown state (M10-C5 Phase A).
 *
 * WHAT THIS COMPOSES
 *
 *     src/engine/game-state/cooldowns          the generic derivation: one
 *                                              observed cast, one base, one
 *                                              modifier policy, one position
 *     src/data/game/paladin-protection-cooldowns
 *                                              the pinned DBC record, the
 *                                              passive-modifier CENSUS and the
 *                                              hand-reviewed dynamic absence
 *                                              proof for each ability
 *     the observed talent tree                 which censused modifiers this
 *                                              actor demonstrably took
 *
 * Neither the engine primitive nor the artifact knows the other; this module
 * is where the specialization says what the facts mean for ONE actor at ONE
 * decision point.
 *
 * STATIC MODIFIERS ARE FOLDED INTO THE BASE, IN THE ONLY SAFE DIRECTION
 *
 * SimulationCraft applies a selected passive trait's cooldown effect to the
 * DBC row before the action reads it, so the "base" the engine should start
 * from is the base AFTER the actor's static modifiers. For each censused
 * modifier the actor's tree is consulted through the shared three-way talent
 * rule:
 *
 *     SELECTED       apply the value exactly (a known shortening or lengthening)
 *     NOT_SELECTED   ignore it
 *     UNKNOWN        apply it ONLY if it shortens — the derivation then rests on
 *                    the shortest base any world admits, which keeps "at least
 *                    this much remains" true in every world; a lengthening
 *                    modifier of unknown selection is dropped for the same
 *                    reason (dropping it can only make the bound smaller)
 *
 * A haste or charge-count modifier that is SELECTED or UNKNOWN is REFUSED:
 * neither is modelled, and neither has a safe direction to fold. A base that
 * rests on any UNKNOWN selection is a LOWER BOUND and the result is tagged so.
 *
 * The composition of a flat and a percent modifier on one ability is not
 * pinned (it lives in `player_t::modified_value_t`, outside the sources this
 * project reviews), so an ability that would need both is REFUSED rather than
 * composed in a guessed order. Neither pinned ability needs both.
 *
 * ALIAS GROUPS ARE ONE COOLDOWN
 *
 * `avenging_wrath` resolves to Sentinel (389539) under the Sentinel talent and
 * to Avenging Wrath (31884) otherwise; the two share DBC category 1550 and only
 * one of them is castable in any build. A cast of EITHER member anchors the
 * token's cooldown, and the token's readiness is the strongest bound any
 * member establishes.
 *
 * NO FUTURE ORACLE. The engine anchors on the last COMPLETE cast strictly
 * BEFORE the decision position; a later cast is never consulted.
 *
 * MILLISECONDS TO SECONDS, EXACTLY ONCE, GRADE PRESERVED — as in the Rogue
 * module this mirrors.
 */

import {
  cooldownRemainingAt,
  type CooldownModifierPolicy,
  type CooldownState,
} from "../../../engine/game-state/cooldowns/cooldown-state.js";
import {
  cooldownReadinessAt,
  type CooldownReadiness,
} from "../../../engine/game-state/cooldowns/cooldown-usability.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import { PINNED_DEFAULT_COOLDOWN_TOLERANCE_MS } from "../../../data/game/external-buff-authority.js";
import {
  protectionCooldownAbilitiesFor,
  type PassiveCooldownModifier,
  type ProtectionCooldownAbility,
} from "../../../data/game/paladin-protection-cooldowns.js";
import {
  resolveTalentIdentity,
  type ObservedTalentEntry,
  type TalentSelection,
} from "../../../data/game/talent-selection.js";
import { boundedBelowNumber, knownNumber, type NumericBinding } from "../../../simc/expression/evaluate.js";

/** The tokens whose cooldowns this specialization can currently establish. */
export const SUPPORTED_PROTECTION_COOLDOWN_TOKENS = ["divine_toll", "avenging_wrath"] as const;

export interface ProtectionCooldownInput {
  readonly state: CombatState;
  readonly actorId: number;
  /** Canonical index of the decision point. Never an ingestion ordinal. */
  readonly position: number;
  /** The actor's observed talent tree, for the censused static modifiers. */
  readonly observedTalents: readonly ObservedTalentEntry[];
}

/** How one censused modifier was treated for this actor. */
export interface StaticModifierAccounting {
  readonly displayNameEn: string;
  readonly traitEntryId: number;
  readonly kind: PassiveCooldownModifier["kind"];
  readonly value: number;
  readonly selection: TalentSelection;
  readonly treatment:
    | "APPLIED_EXACTLY"
    | "APPLIED_AS_WORST_CASE"
    | "IGNORED_NOT_SELECTED"
    | "IGNORED_CANNOT_SHORTEN"
    | "REFUSED";
}

export type EffectiveBase =
  | { readonly state: "EXACT" | "LOWER_BOUND"; readonly ms: number }
  | { readonly state: "REFUSED"; readonly reason: string };

/** One ability's derivation, with everything that fed it kept for auditing. */
export interface ProtectionDerivedCooldown {
  readonly abilityGameId: number;
  readonly displayNameEn: string;
  readonly effectiveBase: EffectiveBase;
  readonly staticModifiers: readonly StaticModifierAccounting[];
  readonly cooldown: CooldownState;
}

export interface ProtectionTokenCooldown {
  readonly simcToken: string;
  readonly perAbility: readonly ProtectionDerivedCooldown[];
  /** The strongest readiness claim any member establishes. Never a readiness claim. */
  readonly readiness: CooldownReadiness;
  /** The ability whose derivation `readiness` rests on, when it is PROVEN_NOT_READY. */
  readonly readinessAbilityGameId: number | null;
  /** SECONDS, grade preserved; `null` when nothing was derivable. */
  readonly remainsSeconds: NumericBinding | null;
}

/** Folds the actor's static modifiers into the pinned base, or refuses. */
export function effectiveBaseFor(
  ability: ProtectionCooldownAbility,
  observedTalents: readonly ObservedTalentEntry[],
): { readonly base: EffectiveBase; readonly accounting: readonly StaticModifierAccounting[] } {
  const accounting: StaticModifierAccounting[] = [];
  let flatMs = 0;
  let pctFactor = 1;
  let flatApplied = false;
  let pctApplied = false;
  let lowerBound = false;
  let refusal: string | null = null;

  for (const modifier of ability.passiveModifiers) {
    const resolution = resolveTalentIdentity(observedTalents, {
      simcName: modifier.displayNameEn,
      displayNameEn: modifier.displayNameEn,
      tree: modifier.tree,
      traitNodeId: modifier.traitNodeId,
      traitEntryId: modifier.traitEntryId,
      talentSpellId: modifier.talentSpellId,
      nodeType: modifier.nodeType,
      alternativeEntries: modifier.alternativeEntries,
      binding: `census: ${modifier.subtypeName} via ${modifier.matchedBy}`,
    });
    const selection = resolution.selection;
    const record = (treatment: StaticModifierAccounting["treatment"]): void => {
      accounting.push({
        displayNameEn: modifier.displayNameEn,
        traitEntryId: modifier.traitEntryId,
        kind: modifier.kind,
        value: modifier.value,
        selection,
        treatment,
      });
    };
    if (selection === "NOT_SELECTED") {
      record("IGNORED_NOT_SELECTED");
      continue;
    }
    if (modifier.kind === "HASTED" || modifier.kind === "CHARGES") {
      record("REFUSED");
      refusal ??= `${modifier.displayNameEn} (${modifier.kind}) is ${selection} and neither haste nor charge modification is modelled`;
      continue;
    }
    const shortens = modifier.value < 0;
    if (selection === "UNKNOWN" && !shortens) {
      record("IGNORED_CANNOT_SHORTEN");
      continue;
    }
    if (selection === "UNKNOWN") lowerBound = true;
    if (modifier.kind === "FLAT_MS") {
      flatMs += modifier.value;
      flatApplied = true;
    } else {
      pctFactor *= 1 + modifier.value / 100;
      pctApplied = true;
    }
    record(selection === "SELECTED" ? "APPLIED_EXACTLY" : "APPLIED_AS_WORST_CASE");
  }

  if (refusal !== null) return { base: { state: "REFUSED", reason: refusal }, accounting };
  if (flatApplied && pctApplied) {
    return {
      base: {
        state: "REFUSED",
        reason: "a flat and a percent modifier both apply and their composition order is not pinned",
      },
      accounting,
    };
  }
  const ms = Math.round((ability.baseCooldownMs + flatMs) * pctFactor);
  if (!(ms > 0)) {
    return { base: { state: "REFUSED", reason: "the folded base is not positive" }, accounting };
  }
  return { base: { state: lowerBound ? "LOWER_BOUND" : "EXACT", ms }, accounting };
}

function policyFor(
  ability: ProtectionCooldownAbility,
  accounting: readonly StaticModifierAccounting[],
): CooldownModifierPolicy {
  // The reviewed class module and its measured hash travel with the policy;
  // the loader has already checked the hash against the recorded sources.
  const classModule =
    ability.dynamicModifierPolicy.sourcePaths[0] ?? "engine/class_modules/paladin/sc_paladin.cpp";
  return {
    kind: "NO_MODIFIERS_PROVEN_ABSENT",
    sourcePath: classModule,
    sourceSha256: ability.dynamicModifierPolicy.sourceSha256["classModule"] ?? "",
    claims: [
      ...ability.dynamicModifierPolicy.checks.map((check) => check.claim),
      ...accounting.map(
        (entry) =>
          `STATIC_PASSIVE_MODIFIER:${entry.displayNameEn}:${entry.kind}:${String(entry.value)}:${entry.selection}:${entry.treatment}`,
      ),
    ],
  };
}

function bindingFrom(cooldown: CooldownState): NumericBinding | null {
  switch (cooldown.state) {
    case "EXACT":
      return knownNumber(cooldown.remainingMs / 1000);
    case "BOUNDED":
      return boundedBelowNumber(cooldown.atLeastRemainingMs / 1000, "STATE_NOT_ESTABLISHED");
    case "UNKNOWN":
      return null;
  }
}

/** Derives one supported token's cooldown at a decision position, or `null` for an unpinned token. */
export function deriveProtectionCooldown(
  input: ProtectionCooldownInput,
  simcToken: string,
): ProtectionTokenCooldown | null {
  const abilities = protectionCooldownAbilitiesFor(simcToken);
  if (abilities.length === 0) return null;

  const perAbility: ProtectionDerivedCooldown[] = [];
  for (const ability of abilities) {
    const { base, accounting } = effectiveBaseFor(ability, input.observedTalents);
    const cooldown: CooldownState =
      base.state === "REFUSED"
        ? { state: "UNKNOWN", reason: "MODIFIERS_NOT_PROVEN_ABSENT", castStateReason: null, anchor: null }
        : cooldownRemainingAt({
            state: input.state,
            actorId: input.actorId,
            abilityGameId: ability.abilityGameId,
            baseCooldownMs: base.ms,
            chargeCooldownMs: ability.chargeCooldownMs,
            charges: ability.charges,
            modifierPolicy: policyFor(ability, accounting),
            position: input.position,
          });
    perAbility.push({
      abilityGameId: ability.abilityGameId,
      displayNameEn: ability.displayNameEn,
      effectiveBase: base,
      staticModifiers: accounting,
      cooldown,
    });
  }

  // The strongest bound any member establishes. A member with no observed cast
  // says nothing; it cannot weaken another member's bound.
  let readiness: CooldownReadiness = { state: "UNKNOWN", reason: "COOLDOWN_STATE_UNKNOWN" };
  let readinessAbilityGameId: number | null = null;
  let remainsSeconds: NumericBinding | null = null;
  for (const derived of perAbility) {
    const candidate = cooldownReadinessAt({
      cooldown: derived.cooldown,
      cooldownToleranceMs: PINNED_DEFAULT_COOLDOWN_TOLERANCE_MS,
    });
    if (candidate.state === "PROVEN_NOT_READY") {
      if (
        readiness.state !== "PROVEN_NOT_READY" ||
        candidate.provenRemainingAtLeastMs > readiness.provenRemainingAtLeastMs
      ) {
        readiness = candidate;
        readinessAbilityGameId = derived.abilityGameId;
        remainsSeconds = bindingFrom(derived.cooldown);
      }
    } else if (readiness.state !== "PROVEN_NOT_READY" && derived.cooldown.state !== "UNKNOWN") {
      // Derived but inside the queueing tolerance: still a binding, not a readiness claim.
      readiness = candidate;
      remainsSeconds = bindingFrom(derived.cooldown);
    }
  }

  return { simcToken, perAbility, readiness, readinessAbilityGameId, remainsSeconds };
}

/** Every supported token, derived; tokens that derived nothing are still listed so the payload can say why. */
export function deriveSupportedProtectionCooldowns(
  input: ProtectionCooldownInput,
): readonly ProtectionTokenCooldown[] {
  const derived: ProtectionTokenCooldown[] = [];
  for (const token of SUPPORTED_PROTECTION_COOLDOWN_TOKENS) {
    const entry = deriveProtectionCooldown(input, token);
    if (entry !== null) derived.push(entry);
  }
  return derived;
}

/** The expression-binding shape, from the derived cooldowns that bound a number. */
export function protectionCooldownBindingsFrom(
  derived: readonly ProtectionTokenCooldown[],
): readonly { readonly name: string; readonly remainsSeconds: NumericBinding }[] {
  const bindings: { name: string; remainsSeconds: NumericBinding }[] = [];
  for (const entry of derived) {
    if (entry.remainsSeconds === null) continue;
    bindings.push({ name: entry.simcToken, remainsSeconds: entry.remainsSeconds });
  }
  return bindings;
}
