/**
 * A POSITIVE cooldown-readiness proof (M11-C4i): the COOLDOWN_READINESS
 * dimension of the positive usability contract, and nothing else.
 *
 * THE ARGUMENT
 *
 * The negative derivation (`token-cooldown-derivation.ts`) proves a cooldown
 * is NOT ready from a LOWER bound on what remains. This proves a cooldown —
 * or at least one charge — IS ready from an UPPER bound on how long it can
 * take:
 *
 *     U  = the pinned record's longest interval: its base cooldown, its
 *          charge (recharge) cooldown, its category cooldown and its internal
 *          cooldown, whichever is largest.
 *     If every censused modifier that could LENGTHEN that interval (or REMOVE
 *     a charge) is proven NOT selected, and every declared dynamic mutation
 *     only RESETS it, then no real cooldown is longer than U.
 *     If no relevant cast — the ability or any spell sharing its category —
 *     occurred in (t - U - tolerance, t), the ability is ready at t:
 *       - a single-charge ability's last cast is at least U + tolerance ago;
 *       - for a charge ability, the recharge timer that was running when the
 *         last charge was spent started no later than that spend, so it
 *         completed by t and returned at least one charge.
 *     Shortening modifiers, haste and resets only move readiness EARLIER, so
 *     they never make the argument unsound, and none is assumed.
 *
 * THE EVIDENCE IT NEEDS
 *
 *     - the last COMPLETED relevant cast before the decision (M4
 *       `lastObservedCast`), and COMPLETE CASTS coverage for the actor from
 *       that cast to the decision, so nothing unobserved lies in between;
 *     - or M4's PROVEN absence of every relevant cast since the fight start,
 *       and at least U + tolerance since the fight start (a pre-pull use is
 *       outside the log, and is covered only by that margin).
 *
 * Anything else is UNKNOWN. Never PROVEN_UNUSABLE: that is the negative
 * derivation's job, with its own reason.
 *
 * NOT A CHARGE SIMULATOR. It never says how many charges are ready, when the
 * next one returns, or what `charges_fractional` is — only that one is.
 */

import type { CombatState } from "../../engine/state/combat-state.js";
import { gateAbsenceClaim } from "../../engine/state/state-result.js";
import { inclusiveRange } from "../../engine/evidence/coverage.js";
import type { EvidenceLocator } from "../../engine/evidence/locator.js";
import type { PinnedCooldownAbility } from "../../data/game/ability-cooldown-artifact.js";
import type { ObservedTalentEntry } from "../../data/game/talent-selection.js";
import { modifierSelection } from "../cooldowns/token-cooldown-derivation.js";
import { provenDimension, unknownDimension, type DimensionResolution } from "./usability-completeness.js";

export interface CooldownReadinessProofInput {
  readonly state: CombatState;
  readonly actorId: number;
  /** The decision's canonical position. Only casts strictly before it are read. */
  readonly position: number;
  /** The pinned cooldown record of the candidate action. */
  readonly ability: PinnedCooldownAbility;
  /** Every spell whose cast spends this cooldown: the ability and its category siblings. */
  readonly relevantAbilityGameIds: readonly number[];
  readonly observedTalents: readonly ObservedTalentEntry[];
  /** The pinned queueing tolerance, applied symmetrically with the negative derivation. */
  readonly toleranceMs: number;
}

/** The longest interval the pinned record can impose, before any modifier. */
export function cooldownUpperBoundMs(ability: PinnedCooldownAbility): number {
  return Math.max(
    ability.baseCooldownMs,
    ability.charges > 0 ? ability.chargeCooldownMs : 0,
    ability.categoryCooldownMs,
    ability.internalCooldownMs,
  );
}

/**
 * Why the pinned upper bound might NOT be an upper bound for this actor, or
 * `null` when it is: a lengthening (or charge-removing) census modifier that
 * is not proven NOT_SELECTED, or a dynamic mutation that is not a reset.
 */
export function upperBoundRefusal(
  ability: PinnedCooldownAbility,
  observedTalents: readonly ObservedTalentEntry[],
): string | null {
  for (const modifier of ability.passiveModifiers) {
    const lengthens =
      modifier.direction === "LENGTHENS" || (modifier.direction === "CHANGES_CHARGES" && modifier.value < 0);
    if (!lengthens) continue;
    const selection = modifierSelection(modifier, observedTalents);
    if (selection !== "NOT_SELECTED") {
      return `the censused modifier ${modifier.displayNameEn} (${modifier.subtypeName} ${String(modifier.value)}) may lengthen the interval and is ${selection}`;
    }
  }
  for (const mutation of ability.knownDynamicMutations) {
    if (mutation.effect !== "RESET_TO_READY" && mutation.effect !== "PRECOMBAT_ONLY") {
      return `the declared dynamic mutation ${mutation.member} in ${mutation.site} is not a reset`;
    }
  }
  return null;
}

export function proveCooldownReadyByUpperBound(input: CooldownReadinessProofInput): DimensionResolution {
  const { state, actorId, position, ability, relevantAbilityGameIds, observedTalents, toleranceMs } = input;
  const decision = state.eventAt(position);
  if (decision === null)
    return unknownDimension("DECISION_NOT_FOUND", "the decision position resolves to no event");
  if (!Number.isFinite(toleranceMs) || toleranceMs < 0) {
    return unknownDimension(
      "COOLDOWN_TOLERANCE_NOT_ESTABLISHED",
      "no usable queueing tolerance was supplied",
    );
  }
  const refusal = upperBoundRefusal(ability, observedTalents);
  if (refusal !== null) return unknownDimension("UPPER_BOUND_NOT_ESTABLISHED", refusal);

  const upperBoundMs = cooldownUpperBoundMs(ability);
  const requiredMs = upperBoundMs + toleranceMs;
  const t = decision.reportTimeMs;

  // The latest COMPLETED relevant cast strictly before the decision.
  let latest: {
    readonly reportTimeMs: number;
    readonly locator: EvidenceLocator;
    readonly abilityGameId: number;
  } | null = null;
  let everyAbsenceProven = true;
  for (const abilityGameId of relevantAbilityGameIds) {
    const result = state.lastObservedCast({
      actorId,
      abilityGameId,
      castPhase: "COMPLETE",
      before: { anchor: "BEFORE_EVENT", position },
    });
    if (result.certainty !== "EXACT") {
      everyAbsenceProven = false;
      continue;
    }
    const cast = result.value;
    if (cast !== null && (latest === null || cast.reportTimeMs > latest.reportTimeMs)) {
      latest = { reportTimeMs: cast.reportTimeMs, locator: cast.locator, abilityGameId };
    }
  }

  const facts = {
    upperBoundMs,
    toleranceMs,
    requiredElapsedMs: requiredMs,
    relevantAbilityGameIds: relevantAbilityGameIds.join("/"),
  };

  if (latest !== null) {
    const elapsedMs = t - latest.reportTimeMs;
    if (elapsedMs < requiredMs) {
      return unknownDimension(
        "INSIDE_UPPER_BOUND_WINDOW",
        `the last relevant cast was ${String(elapsedMs)} ms before the decision; readiness is proven only after ${String(requiredMs)} ms`,
      );
    }
    // Nothing unobserved may lie between that cast and the decision.
    const gate = gateAbsenceClaim({
      completeness: state.fight.completeness,
      category: "CASTS",
      range: inclusiveRange(latest.reportTimeMs, t),
      actorId,
    });
    if (!gate.ok) {
      return unknownDimension(
        "CAST_COVERAGE_NOT_COMPLETE",
        `CASTS coverage is ${gate.reason} between the last relevant cast and the decision, so a later cast cannot be excluded`,
      );
    }
    return provenDimension(
      "COOLDOWN_UPPER_BOUND_ELAPSED",
      "the last completed relevant cast lies at least the pinned upper-bound interval plus the queueing tolerance before the decision, CASTS coverage is complete in between, and no censused modifier or declared mutation can lengthen the interval",
      {
        ...facts,
        elapsedMs,
        anchorReportTimeMs: latest.reportTimeMs,
        anchorAbilityGameId: latest.abilityGameId,
      },
      [latest.locator],
    );
  }

  if (!everyAbsenceProven) {
    return unknownDimension(
      "NO_RELEVANT_CAST_NOT_PROVEN",
      "no relevant cast was observed before the decision, but CASTS coverage does not prove there was none",
    );
  }
  const sinceFightStartMs = t - state.fight.fight.startTimeMs;
  if (sinceFightStartMs < requiredMs) {
    return unknownDimension(
      "POSSIBLE_PRE_PULL_USE",
      `no relevant cast occurred since the fight start, but only ${String(sinceFightStartMs)} ms have passed; a use before the pull is outside the log and is covered only after ${String(requiredMs)} ms`,
    );
  }
  return provenDimension(
    "COOLDOWN_UPPER_BOUND_SINCE_FIGHT_START",
    "no relevant cast occurred since the fight start (proven over COMPLETE CASTS coverage), and more than the pinned upper-bound interval plus the queueing tolerance has passed since it, so even a use just before the pull has recovered",
    { ...facts, sinceFightStartMs },
  );
}
