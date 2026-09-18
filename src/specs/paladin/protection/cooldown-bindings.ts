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
 * PASSIVE ORIGINS (M10-C5 Phase B). A modifier the census attributes to a
 * SPEC_PASSIVE or CLASS_PASSIVE spell is always active for the
 * specialization and is treated as SELECTED without consulting the tree. A
 * HASTED modifier from any origin REFUSES the derivation: Avenger's Shield
 * and Consecration are hasted by the "Protection Paladin" spec aura, and a
 * lower bound on their remaining cooldown would need an upper bound on the
 * actor's haste, which nothing here establishes.
 *
 * OBSERVABLE RESETS. A declared RESET_TO_READY mutation with an aura
 * signature (Grand Crusader → 85416) is proven absent over [anchor, query]
 * only when M4 observed no application or refresh of that aura on the actor
 * in the interval under COMPLETE AURAS coverage; otherwise the derivation
 * refuses. (On this build the hasted refusal comes first for Avenger's
 * Shield; the reset policy is implemented so the refusal is stated for the
 * right reason, and so a future unhasted reset-bearing ability is handled.)
 *
 * GROUND EFFECT. `consecration.up` is the HARDCAST Consecration's ground
 * effect being alive: TRUE when the actor's last observed Consecration cast
 * is younger than the pinned duration folded with its LENGTHENING modifiers
 * in the shortest-duration direction (a lengthening modifier of unknown
 * selection is ignored for TRUE); FALSE when no cast lies within the longest
 * admissible duration under COMPLETE CASTS coverage over that span and the
 * span lies inside the log (a pre-pull Consecration cannot be excluded before
 * pull + longest duration); UNKNOWN otherwise.
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
import { gateAbsenceClaim } from "../../../engine/state/state-result.js";
import { inclusiveRange } from "../../../engine/evidence/coverage.js";
import { targetRef } from "../../../engine/normalization/normalized-events.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
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

/** The tokens whose cooldowns this specialization can currently establish (or refuse for a stated reason). */
export const SUPPORTED_PROTECTION_COOLDOWN_TOKENS = [
  "divine_toll",
  "avenging_wrath",
  "avengers_shield",
  "consecration",
] as const;

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
  const ms = Math.round((ability.baseCooldownMs + flatMs) * pctFactor);
  if (!(ms > 0)) {
    return { base: { state: "REFUSED", reason: "the folded base is not positive" }, accounting };
  }
  return { base: { state: lowerBound ? "LOWER_BOUND" : "EXACT", ms }, accounting };
}

/**
 * Whether every declared in-combat mutation is proven absent between the
 * anchor and the query. PRECOMBAT_ONLY mutations never apply in combat; a
 * RESET_TO_READY mutation is absent only when its aura signature was not
 * applied or refreshed on the actor in the interval under COMPLETE AURAS
 * coverage. Returns the claims to carry, or the refusal.
 */
export function dynamicMutationsAbsent(
  ability: ProtectionCooldownAbility,
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
    // Protection's pinned mutations declare application signatures only; the
    // stack-change kind (M11-A4) is another specialization's, and this
    // module does not read it rather than guessing what it would mean here.
    if (signature.kind !== "AURA_APPLICATION_ON_ACTOR") {
      return {
        ok: false,
        reason: `${mutation.member} in ${mutation.site} declares a ${signature.kind} signature this module does not model`,
      };
    }
    const range = inclusiveRange(anchorEvent.reportTimeMs, queryEvent.reportTimeMs);
    const gate = gateAbsenceClaim({
      completeness: state.fight.completeness,
      category: "AURAS",
      range,
      actorId,
    });
    if (!gate.ok) {
      return {
        ok: false,
        reason: `AURAS coverage is ${gate.reason} over the interval, so the reset signature ${String(signature.abilityGameId)} cannot be proven absent`,
      };
    }
    // Every source's track for the signature on the actor; an application or
    // refresh by ANY source between the anchor and the decision is a reset.
    const group = state.auras.groupFor({
      target: targetRef(actorId, null),
      abilityGameId: signature.abilityGameId,
      auraClass: "BUFF",
      source: { kind: "ANY_SOURCE" },
    });
    const positions = (group?.tracks ?? []).flatMap((track) => track.positions);
    // No transition anywhere is fine only under the coverage gate above.
    const applied = positions.filter((position) => {
      if (position <= anchorPosition || position >= queryPosition) return false;
      const event = state.eventAt(position);
      return event?.kind === "AURA" && (event.operation === "APPLIED" || event.operation === "REFRESHED");
    });
    if (applied.length > 0) {
      return {
        ok: false,
        reason: `the reset signature ${String(signature.abilityGameId)} was applied ${String(applied.length)} time(s) between the anchor and the decision`,
      };
    }
    claims.push(
      `OBSERVABLE_RESET_ABSENT:${mutation.member}:${String(signature.abilityGameId)}:[${String(range.fromReportTimeMs)}..${String(range.toReportTimeMs)}]`,
    );
  }
  return { ok: true, claims };
}

function policyFor(
  ability: ProtectionCooldownAbility,
  accounting: readonly StaticModifierAccounting[],
  extraClaims: readonly string[] = [],
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
    let cooldown: CooldownState;
    if (base.state === "REFUSED") {
      cooldown = {
        state: "UNKNOWN",
        reason: "MODIFIERS_NOT_PROVEN_ABSENT",
        castStateReason: null,
        anchor: null,
      };
    } else {
      const query = {
        state: input.state,
        actorId: input.actorId,
        abilityGameId: ability.abilityGameId,
        baseCooldownMs: base.ms,
        chargeCooldownMs: ability.chargeCooldownMs,
        charges: ability.charges,
        position: input.position,
      };
      // First pass finds the anchor under the static policy; a declared
      // in-combat mutation is then proven absent over [anchor, query], and
      // only then is the derivation kept.
      const first = cooldownRemainingAt({ ...query, modifierPolicy: policyFor(ability, accounting) });
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
          ? cooldownRemainingAt({ ...query, modifierPolicy: policyFor(ability, accounting, absent.claims) })
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

// --------------------------------------------------------------------------
// Ground effect: `consecration.up`
// --------------------------------------------------------------------------

/**
 * `consecration.up` is SimulationCraft's `active_consecration != nullptr`,
 * and that pointer lives until the ground effect's LAST PULSE, not its nominal
 * duration (M10-C5 Phase B2 audit; `GroundEffectLifetime`): the last pulse
 * falls inside (D − tick, D] with the tick hasted downwards from the pinned
 * base. Without a haste model the narrowest truthful reading is
 *
 *     elapsed ≤ shortest − pulseBaseMs   TRUE
 *     shortest − pulseBaseMs < elapsed ≤ longest   UNKNOWN (last-pulse allowance,
 *                                          duration-modifier uncertainty, or the
 *                                          exact boundary)
 *     elapsed > longest                  FALSE (under complete CASTS coverage)
 */
export type GroundEffectPresence =
  | {
      readonly state: "BOUND";
      readonly up: boolean;
      readonly anchorPosition: number | null;
      readonly anchorLocator: EvidenceLocator | null;
      /** The duration the answer used: the shortest admissible for TRUE, the longest for FALSE. */
      readonly durationMs: number;
      /** The last-pulse allowance subtracted from the shortest duration for TRUE. */
      readonly lastPulseAllowanceMs: number;
      readonly elapsedMs: number | null;
    }
  | { readonly state: "UNKNOWN"; readonly reason: string };

/** The [shortest, longest] ground-effect duration the build admits, from the pinned duration and its modifiers. */
export function groundEffectDurationBounds(
  ability: ProtectionCooldownAbility,
  observedTalents: readonly ObservedTalentEntry[],
): {
  readonly shortestMs: number;
  readonly longestMs: number;
  readonly accounting: readonly StaticModifierAccounting[];
} | null {
  const ground = ability.groundEffect;
  if (ground === null) return null;
  let shortest = ground.durationMs;
  let longest = ground.durationMs;
  const accounting: StaticModifierAccounting[] = [];
  for (const modifier of ground.durationModifiers) {
    const selection = modifierSelection(modifier, observedTalents);
    const apply = (ms: number): number =>
      modifier.kind === "FLAT_MS" ? ms + modifier.value : Math.round(ms * (1 + modifier.value / 100));
    let treatment: StaticModifierAccounting["treatment"];
    if (modifier.kind === "HASTED" || modifier.kind === "CHARGES") {
      treatment = "REFUSED";
    } else if (selection === "SELECTED") {
      shortest = apply(shortest);
      longest = apply(longest);
      treatment = "APPLIED_EXACTLY";
    } else if (selection === "NOT_SELECTED") {
      treatment = "IGNORED_NOT_SELECTED";
    } else {
      // Unknown selection: widen the interval in the modifier's direction only.
      if (modifier.value < 0) shortest = apply(shortest);
      else longest = apply(longest);
      treatment = "APPLIED_AS_WORST_CASE";
    }
    accounting.push({
      displayNameEn: modifier.displayNameEn,
      origin: modifier.origin,
      traitEntryId: modifier.traitEntryId,
      kind: modifier.kind,
      value: modifier.value,
      selection,
      treatment,
    });
    if (treatment === "REFUSED") return null;
  }
  return { shortestMs: shortest, longestMs: longest, accounting };
}

/** Binds `<token>.up` for a pinned ground effect at a decision position. */
/** The lifetime rule at one elapsed time, pure: what the binder decides once the cast and the bounds are known. */
export function groundEffectVerdictAtElapsed(
  elapsedMs: number,
  shortestMs: number,
  longestMs: number,
  lastPulseAllowanceMs: number,
):
  | { readonly kind: "TRUE" }
  | { readonly kind: "FALSE" }
  | { readonly kind: "UNKNOWN"; readonly reason: string } {
  if (elapsedMs <= shortestMs - lastPulseAllowanceMs) return { kind: "TRUE" };
  // The last pulse may already have fired (tick ≤ allowance, haste unknown).
  if (elapsedMs < shortestMs) return { kind: "UNKNOWN", reason: "ELAPSED_INSIDE_LAST_PULSE_ALLOWANCE" };
  if (elapsedMs < longestMs) return { kind: "UNKNOWN", reason: "ELAPSED_INSIDE_DURATION_UNCERTAINTY" };
  // At exactly the longest duration the last pulse event and the decision
  // share a millisecond, and their order is not established.
  if (elapsedMs === longestMs) return { kind: "UNKNOWN", reason: "ELAPSED_AT_DURATION_BOUNDARY" };
  return { kind: "FALSE" };
}

export function bindGroundEffectPresence(
  input: ProtectionCooldownInput,
  simcToken: string,
): GroundEffectPresence {
  const ability = protectionCooldownAbilitiesFor(simcToken).find((entry) => entry.groundEffect !== null);
  if (ability === undefined) return { state: "UNKNOWN", reason: "NO_PINNED_GROUND_EFFECT" };
  const bounds = groundEffectDurationBounds(ability, input.observedTalents);
  if (bounds === null) return { state: "UNKNOWN", reason: "DURATION_MODIFIER_NOT_MODELLED" };
  const queryEvent = input.state.eventAt(input.position);
  if (queryEvent === null) return { state: "UNKNOWN", reason: "QUERY_POSITION_UNRESOLVED" };
  const lastCast = input.state.lastObservedCast({
    actorId: input.actorId,
    abilityGameId: ability.abilityGameId,
    castPhase: "COMPLETE",
    before: { anchor: "BEFORE_EVENT", position: input.position },
  });
  if (lastCast.certainty !== "EXACT") {
    return {
      state: "UNKNOWN",
      reason: "reason" in lastCast ? `CAST_STATE_${lastCast.reason}` : "CAST_STATE_UNKNOWN",
    };
  }
  const queryMs = queryEvent.reportTimeMs;
  const allowance = ability.groundEffect?.lifetime.pulseBaseMs ?? null;
  if (allowance === null) return { state: "UNKNOWN", reason: "GROUND_EFFECT_LIFETIME_NOT_PINNED" };
  if (lastCast.value !== null) {
    const elapsed = queryMs - lastCast.value.reportTimeMs;
    if (elapsed < 0) return { state: "UNKNOWN", reason: "NON_MONOTONIC_TIME" };
    const verdict = groundEffectVerdictAtElapsed(elapsed, bounds.shortestMs, bounds.longestMs, allowance);
    if (verdict.kind === "TRUE") {
      return {
        state: "BOUND",
        up: true,
        anchorPosition: lastCast.value.position,
        anchorLocator: lastCast.value.locator,
        durationMs: bounds.shortestMs,
        lastPulseAllowanceMs: allowance,
        elapsedMs: elapsed,
      };
    }
    if (verdict.kind === "UNKNOWN") return { state: "UNKNOWN", reason: verdict.reason };
  }
  // FALSE needs the whole longest duration before the decision to be inside
  // the log and completely covered for the actor's casts.
  const from = queryMs - bounds.longestMs;
  if (from < input.state.fight.fight.startTimeMs) {
    return { state: "UNKNOWN", reason: "PRE_PULL_GROUND_EFFECT_NOT_EXCLUDED" };
  }
  const gate = gateAbsenceClaim({
    completeness: input.state.fight.completeness,
    category: "CASTS",
    range: inclusiveRange(from, queryMs),
    actorId: input.actorId,
  });
  if (!gate.ok) return { state: "UNKNOWN", reason: `CASTS_${gate.reason}` };
  return {
    state: "BOUND",
    up: false,
    anchorPosition: lastCast.value?.position ?? null,
    anchorLocator: lastCast.value?.locator ?? null,
    durationMs: bounds.longestMs,
    lastPulseAllowanceMs: allowance,
    elapsedMs: lastCast.value === null ? null : queryMs - lastCast.value.reportTimeMs,
  };
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
