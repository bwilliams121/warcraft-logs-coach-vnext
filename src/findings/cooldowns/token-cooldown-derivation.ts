/**
 * `cooldown.<token>.remains` and cooldown READINESS for one pinned ability
 * token — the class-neutral derivation (M11-B2, promoted verbatim from the
 * second Paladin specialization's bindings of M11-A4).
 *
 * WHY THIS IS SHARED. Those bindings composed nothing that named a
 * Paladin: the generic cooldown primitive, the generic pinned-cooldown
 * artifact shape, the generic talent-selection rule and the generic aura
 * indexes. The only specialization-owned inputs were WHICH dataset supplies
 * the pinned records and WHICH tokens the slice asks about. A third
 * specialization (Blood Death Knight) needed the identical calculation, and
 * `CLAUDE.md` is explicit: a low-level calculation independently
 * implemented in many specializations belongs in the shared primitive
 * library. So the calculation moved here and takes the dataset accessor as
 * an argument; the meaning of a token, the choice of tokens and the dataset
 * stay per specialization.
 *
 * THE RULES, restated because they are the rules of the shared primitive, not
 * of one class: static modifiers fold into the base in the only safe
 * direction (SELECTED exactly; UNKNOWN only if it shortens; a spec or class
 * passive is always active); a HASTED or CHARGES modifier of SELECTED or
 * UNKNOWN selection REFUSES; a flat and a percent modifier on one ability
 * refuse (composition order unpinned); the derived remainder is a LOWER
 * bound; the anchor is the last COMPLETE cast strictly before the decision,
 * never a later one.
 *
 * ONE-CHARGE SYSTEMS. An ability with `_charges` 1, a `_charge_cooldown` and
 * a zero `_cooldown` has SimulationCraft read the charge cooldown as the
 * duration on that path (action.cpp:710-724), and so does the generic
 * primitive. The static fold therefore runs on the CHARGE cooldown for a
 * charge system and on the ordinary cooldown otherwise.
 *
 * OBSERVABLE RESETS. A declared RESET_TO_READY mutation is proven absent over
 * [anchor, query] only when M4 observed none of its signature events on the
 * actor in the interval under COMPLETE AURAS coverage: an APPLICATION
 * signature is an apply or refresh of one aura; a STACK-CHANGE signature is
 * ANY transition of any of its auras. Otherwise the derivation refuses.
 *
 * MILLISECONDS TO SECONDS, EXACTLY ONCE, GRADE PRESERVED.
 */

import {
  cooldownRemainingAt,
  type CooldownModifierPolicy,
  type CooldownState,
} from "../../engine/game-state/cooldowns/cooldown-state.js";
import {
  cooldownReadinessAt,
  type CooldownReadiness,
} from "../../engine/game-state/cooldowns/cooldown-usability.js";
import type { CombatState } from "../../engine/state/combat-state.js";
import { gateAbsenceClaim } from "../../engine/state/state-result.js";
import { inclusiveRange } from "../../engine/evidence/coverage.js";
import { targetRef } from "../../engine/normalization/normalized-events.js";
import { PINNED_DEFAULT_COOLDOWN_TOLERANCE_MS } from "../../data/game/external-buff-authority.js";
import type {
  PassiveCooldownModifier,
  PinnedCooldownAbility,
} from "../../data/game/ability-cooldown-artifact.js";
import {
  resolveTalentIdentity,
  type ObservedTalentEntry,
  type TalentSelection,
} from "../../data/game/talent-selection.js";
import { boundedBelowNumber, knownNumber, type NumericBinding } from "../../simc/expression/evaluate.js";

export interface TokenCooldownInput {
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
  readonly origin: PassiveCooldownModifier["origin"];
  readonly traitEntryId: number | null;
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
export interface DerivedTokenCooldown {
  readonly abilityGameId: number;
  readonly displayNameEn: string;
  readonly effectiveBase: EffectiveBase;
  readonly staticModifiers: readonly StaticModifierAccounting[];
  readonly cooldown: CooldownState;
}

export interface TokenCooldown {
  readonly simcToken: string;
  readonly perAbility: readonly DerivedTokenCooldown[];
  /** The strongest readiness claim any member establishes. Never a readiness claim. */
  readonly readiness: CooldownReadiness;
  /** The ability whose derivation `readiness` rests on, when it is PROVEN_NOT_READY. */
  readonly readinessAbilityGameId: number | null;
  /** SECONDS, grade preserved; `null` when nothing was derivable. */
  readonly remainsSeconds: NumericBinding | null;
}

/** A TRAIT resolves by the three-way rule; a spec or class passive is always active. */
function modifierSelection(
  modifier: PassiveCooldownModifier,
  observedTalents: readonly ObservedTalentEntry[],
): TalentSelection {
  if (modifier.origin !== "TRAIT") return "SELECTED";
  if (
    modifier.tree === null ||
    modifier.traitNodeId === null ||
    modifier.traitEntryId === null ||
    modifier.nodeType === null
  ) {
    return "UNKNOWN";
  }
  return resolveTalentIdentity(observedTalents, {
    simcName: modifier.displayNameEn,
    displayNameEn: modifier.displayNameEn,
    tree: modifier.tree,
    traitNodeId: modifier.traitNodeId,
    traitEntryId: modifier.traitEntryId,
    talentSpellId: modifier.talentSpellId,
    nodeType: modifier.nodeType,
    alternativeEntries: modifier.alternativeEntries,
    binding: `census: ${modifier.subtypeName} via ${modifier.matchedBy}`,
  }).selection;
}

/** The field SimulationCraft reads as the duration: the charge cooldown on the charge path. */
function pinnedBaseMs(ability: PinnedCooldownAbility): number {
  return ability.chargeCooldownMs > 0 ? ability.chargeCooldownMs : ability.baseCooldownMs;
}

/** Folds the actor's static modifiers into the pinned base, or refuses. */
export function effectiveBaseFor(
  ability: PinnedCooldownAbility,
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
    const selection = modifierSelection(modifier, observedTalents);
    const record = (treatment: StaticModifierAccounting["treatment"]): void => {
      accounting.push({
        displayNameEn: modifier.displayNameEn,
        origin: modifier.origin,
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
  const ms = Math.round((pinnedBaseMs(ability) + flatMs) * pctFactor);
  if (!(ms > 0)) {
    return { base: { state: "REFUSED", reason: "the folded base is not positive" }, accounting };
  }
  return { base: { state: lowerBound ? "LOWER_BOUND" : "EXACT", ms }, accounting };
}

/**
 * Whether every declared in-combat mutation is proven absent between the
 * anchor and the query. Returns the claims to carry, or the refusal.
 */
export function dynamicMutationsAbsent(
  ability: PinnedCooldownAbility,
  state: CombatState,
  actorId: number,
  anchorPosition: number,
  queryPosition: number,
):
  | { readonly ok: true; readonly claims: readonly string[] }
  | { readonly ok: false; readonly reason: string } {
  const claims: string[] = [];
  const anchorEvent = state.eventAt(anchorPosition);
  const queryEvent = state.eventAt(queryPosition);
  for (const mutation of ability.knownDynamicMutations) {
    if (mutation.effect === "PRECOMBAT_ONLY") {
      claims.push(`DECLARED_MUTATION_PRECOMBAT_ONLY:${mutation.member}:${mutation.site}`);
      continue;
    }
    const signature = mutation.observableSignature;
    if (signature === undefined || anchorEvent === null || queryEvent === null) {
      return { ok: false, reason: `${mutation.member} in ${mutation.site} has no observable signature` };
    }
    const range = inclusiveRange(anchorEvent.reportTimeMs, queryEvent.reportTimeMs);
    const gate = gateAbsenceClaim({
      completeness: state.fight.completeness,
      category: "AURAS",
      range,
      actorId,
    });
    const auraIds =
      signature.kind === "AURA_APPLICATION_ON_ACTOR" ? [signature.abilityGameId] : signature.abilityGameIds;
    if (!gate.ok) {
      return {
        ok: false,
        reason: `AURAS coverage is ${gate.reason} over the interval, so the reset signature ${auraIds.join("/")} cannot be proven absent`,
      };
    }
    for (const abilityGameId of auraIds) {
      const group = state.auras.groupFor({
        target: targetRef(actorId, null),
        abilityGameId,
        auraClass: "BUFF",
        source: { kind: "ANY_SOURCE" },
      });
      const positions = (group?.tracks ?? []).flatMap((track) => track.positions);
      const hits = positions.filter((position) => {
        if (position <= anchorPosition || position >= queryPosition) return false;
        const event = state.eventAt(position);
        if (event?.kind !== "AURA") return false;
        // An application signature fires on apply/refresh; a stack-change signature on ANY transition.
        return signature.kind === "AURA_STACK_CHANGE_ON_ACTOR"
          ? true
          : event.operation === "APPLIED" || event.operation === "REFRESHED";
      });
      if (hits.length > 0) {
        return {
          ok: false,
          reason: `the reset signature ${String(abilityGameId)} fired ${String(hits.length)} time(s) between the anchor and the decision`,
        };
      }
    }
    claims.push(
      `OBSERVABLE_RESET_ABSENT:${mutation.member}:${auraIds.join("/")}:[${String(range.fromReportTimeMs)}..${String(range.toReportTimeMs)}]`,
    );
  }
  return { ok: true, claims };
}

function policyFor(
  ability: PinnedCooldownAbility,
  accounting: readonly StaticModifierAccounting[],
  fallbackSourcePath: string,
  extraClaims: readonly string[] = [],
): CooldownModifierPolicy {
  const classModule = ability.dynamicModifierPolicy.sourcePaths[0] ?? fallbackSourcePath;
  return {
    kind: "NO_MODIFIERS_PROVEN_ABSENT",
    sourcePath: classModule,
    sourceSha256: ability.dynamicModifierPolicy.sourceSha256["classModule"] ?? "",
    claims: [
      ...ability.dynamicModifierPolicy.checks.map((check) => check.claim),
      ...extraClaims,
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

/**
 * The specialization-owned half: which pinned records answer for a token.
 * `abilitiesFor` returns the dataset's records for one APL token (empty when
 * the token is not pinned); `fallbackSourcePath` names the class module the
 * modifier policy cites when a record carries no source path of its own.
 */
export interface TokenCooldownDataset {
  readonly abilitiesFor: (simcToken: string) => readonly PinnedCooldownAbility[];
  readonly fallbackSourcePath: string;
}

/** Derives one token's cooldown at a decision position, or `null` for an unpinned token. */
export function deriveTokenCooldown(
  dataset: TokenCooldownDataset,
  input: TokenCooldownInput,
  simcToken: string,
): TokenCooldown | null {
  const abilities = dataset.abilitiesFor(simcToken);
  if (abilities.length === 0) return null;

  const perAbility: DerivedTokenCooldown[] = [];
  for (const ability of abilities) {
    const { base, accounting } = effectiveBaseFor(ability, input.observedTalents);
    let cooldown: CooldownState;
    if (base.state === "REFUSED") {
      cooldown = {
        state: "UNKNOWN",
        reason: "MODIFIERS_NOT_PROVEN_ABSENT",
        castStateReason: null,
        anchor: null,
      };
    } else {
      const chargeSystem = ability.chargeCooldownMs > 0;
      const query = {
        state: input.state,
        actorId: input.actorId,
        abilityGameId: ability.abilityGameId,
        baseCooldownMs: chargeSystem ? ability.baseCooldownMs : base.ms,
        chargeCooldownMs: chargeSystem ? base.ms : 0,
        charges: ability.charges,
        position: input.position,
      };
      const first = cooldownRemainingAt({
        ...query,
        modifierPolicy: policyFor(ability, accounting, dataset.fallbackSourcePath),
      });
      if (first.state === "UNKNOWN" || ability.knownDynamicMutations.length === 0) {
        cooldown = first;
      } else {
        const absent = dynamicMutationsAbsent(
          ability,
          input.state,
          input.actorId,
          first.anchor.position,
          input.position,
        );
        cooldown = absent.ok
          ? cooldownRemainingAt({
              ...query,
              modifierPolicy: policyFor(ability, accounting, dataset.fallbackSourcePath, absent.claims),
            })
          : {
              state: "UNKNOWN",
              reason: "MODIFIERS_NOT_PROVEN_ABSENT",
              castStateReason: null,
              anchor: first.anchor,
            };
      }
    }
    perAbility.push({
      abilityGameId: ability.abilityGameId,
      displayNameEn: ability.displayNameEn,
      effectiveBase: base,
      staticModifiers: accounting,
      cooldown,
    });
  }

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
      readiness = candidate;
      remainsSeconds = bindingFrom(derived.cooldown);
    }
  }

  return { simcToken, perAbility, readiness, readinessAbilityGameId, remainsSeconds };
}

/** Every listed token at one decision, in declaration order, skipping unpinned ones. */
export function deriveTokenCooldowns(
  dataset: TokenCooldownDataset,
  input: TokenCooldownInput,
  tokens: readonly string[],
): readonly TokenCooldown[] {
  const derived: TokenCooldown[] = [];
  for (const token of tokens) {
    const entry = deriveTokenCooldown(dataset, input, token);
    if (entry !== null) derived.push(entry);
  }
  return derived;
}

/** The `knownCooldownRemainsSeconds` shape, from the tokens that derived a remainder. */
export function tokenCooldownBindingsFrom(
  cooldowns: readonly TokenCooldown[],
): readonly { readonly name: string; readonly remainsSeconds: NumericBinding }[] {
  const known: { name: string; remainsSeconds: NumericBinding }[] = [];
  for (const entry of cooldowns) {
    if (entry.remainsSeconds !== null)
      known.push({ name: entry.simcToken, remainsSeconds: entry.remainsSeconds });
  }
  return known;
}
