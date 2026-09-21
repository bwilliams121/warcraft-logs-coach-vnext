/**
 * Marrowrend's Rune affordability at one Blood decision (M11-B7) — a FACT
 * about the decision's own cast and the pinned authority, never a state.
 *
 * WHAT THIS READS
 *
 *   the decision cast's own attached Rune snapshot, and only when M4 graded
 *   it EXACT / OBSERVED / PRE_COST (`resources.ts`, `EXACT_PRE_COST`) — the
 *   same observation `resolver.ts` already binds to the `rune` atom;
 *
 *   the pinned Marrowrend record of `deathknight-blood-spender-costs.json`:
 *   its Rune row's cost through the artifact's own cost rule, and its
 *   cooldown, charge, internal, category and cast-time scalars;
 *
 *   the hero-tree resolution, through
 *   `deathknight-blood-rune-cost-authority.ts`, which is the ONLY thing that
 *   can prove the pinned row is the cost the actor pays.
 *
 * WHAT IT PROVES, AND IN ONE DIRECTION ONLY
 *
 *   OWN_PRE_COST_AFFORDABLE   the exact count is at or above the pinned cost,
 *                             the modifier is excluded and the record is
 *                             cooldown-free: `action_t::ready()` cannot fail
 *                             on `cost_affordable()`, `cooldown->is_ready()`
 *                             or `internal_cooldown->down()`; the remaining
 *                             conjuncts (GCD, target, range, movement) are
 *                             the same for Marrowrend as for the melee GCD
 *                             cast that demonstrably fired at this instant
 *   OWN_PRE_COST_BELOW_COST   the exact count is below the pinned cost —
 *                             RECORDED, NOT ACTED ON. M11-B7 deliberately
 *                             builds no INSUFFICIENT_RESOURCE from it;
 *                             usability stays UNKNOWN unless an existing
 *                             proof settles it (Candidate B, deferred)
 *   NO_RUNE_OBSERVATION       the cast carries no exact PRE_COST Rune entry
 *                             (Death Strike, Blood Boil, a free Heart Strike)
 *   MODIFIER_UNPROVEN         the hero tree is UNKNOWN, CONTRADICTORY or
 *                             RESOLVED Deathbringer: the pinned row may not
 *                             be the cost, so no count is compared to it
 *   AUTHORITY_NOT_PINNED      the artifact did not validate, has no single
 *                             Marrowrend record, or the record is not the
 *                             spell / Rune row / cooldown-free shape the proof
 *                             requires
 *
 * WHY THIS CANNOT SIMULATE OR CARRY. The only Rune number it ever reads rode
 * in on the decision event itself. Runes have no standalone `resourcechange`
 * on the wire (`resource-types.ts`), so there is nothing to carry from one
 * decision to the next, nothing to add a delta to, and no separate event
 * whose ordering against the cast could need a safety window: a Death Strike
 * one GCD after a Heart Strike at 4 Runes is NO_RUNE_OBSERVATION, not 3, not
 * 4, not "at least 3". `observation.cost` — the wire's cost field — is never
 * read for the mechanical cost (M11-B2: the wire's cost is not the cost);
 * it is carried in the fact for identity corroboration only.
 */

import type { HeroTreeResolution } from "../../../data/game/talent-selection.js";
import {
  MARROWREND_SPELL_ID,
  marrowrendRuneCostModifiersExcluded,
} from "../../../data/game/deathknight-blood-rune-cost-authority.js";
import { bloodRuneCostOf, bloodSpenderCostsFor } from "../../../data/game/deathknight-blood-spender-costs.js";
import type { SpenderCostIdentity } from "../../../data/game/spender-cost-artifact.js";
import type { BloodResourceObservation } from "./resources.js";

/** The APL token the proof is allowlisted for. No other token reads this fact. */
export const MARROWREND_TOKEN = "marrowrend";

export type BloodRuneAffordabilityEvidence =
  | "OWN_PRE_COST_AFFORDABLE"
  | "OWN_PRE_COST_BELOW_COST"
  | "NO_RUNE_OBSERVATION"
  | "MODIFIER_UNPROVEN"
  | "AUTHORITY_NOT_PINNED";

export const BLOOD_RUNE_AFFORDABILITY_EVIDENCE = [
  "OWN_PRE_COST_AFFORDABLE",
  "OWN_PRE_COST_BELOW_COST",
  "NO_RUNE_OBSERVATION",
  "MODIFIER_UNPROVEN",
  "AUTHORITY_NOT_PINNED",
] as const satisfies readonly BloodRuneAffordabilityEvidence[];

/** The exact Rune count the decision's own cast carried, or why none is established. */
export type BloodRuneCount =
  | {
      readonly state: "EXACT";
      /** Whole runes, verbatim from the PRE_COST entry. */
      readonly amount: number;
      readonly max: number | null;
      /** The wire's cost field on the SAME entry: identity corroboration only, never the mechanical cost. */
      readonly wireCost: number | null;
    }
  | { readonly state: "NOT_ESTABLISHED"; readonly reason: string };

/** The pinned Marrowrend record as the proof read it, or why it could not be used. */
export type BloodMarrowrendPin =
  | {
      readonly state: "PINNED";
      readonly spellId: number;
      /** `spell_data_t::cost( POWER_RUNE )`: the first Rune row's cost. */
      readonly runeCost: number;
      /** cooldown, charge cooldown, internal cooldown and category cooldown all zero. */
      readonly cooldownFree: boolean;
      readonly castTimeMs: number;
    }
  | { readonly state: "NOT_PINNED"; readonly reason: string };

export interface BloodRuneAffordability {
  readonly runes: BloodRuneCount;
  /** True only when the hero tree RESOLVES to a sub-tree that does not own Exterminate. */
  readonly costModifiersExcluded: boolean;
  readonly marrowrend: BloodMarrowrendPin;
  readonly evidence: BloodRuneAffordabilityEvidence;
}

/** The pinned Marrowrend record, read once and checked for the shape the proof needs. */
export function pinnedMarrowrend(): BloodMarrowrendPin {
  const records = bloodSpenderCostsFor(MARROWREND_TOKEN);
  const record = records[0];
  if (records.length !== 1 || record === undefined) {
    return {
      state: "NOT_PINNED",
      reason: `the artifact pins ${String(records.length)} marrowrend records, not one`,
    };
  }
  return marrowrendPinOf(record);
}

/**
 * The pin one spender-cost record yields. Separated from the artifact read so
 * the guard can be shown against a record that is NOT the pinned shape.
 */
export function marrowrendPinOf(record: SpenderCostIdentity): BloodMarrowrendPin {
  if (record.simcToken !== MARROWREND_TOKEN || record.spellId !== MARROWREND_SPELL_ID) {
    return { state: "NOT_PINNED", reason: "the pinned marrowrend record is not spell 195182" };
  }
  const runeCost = bloodRuneCostOf(record);
  if (runeCost === null || !Number.isInteger(runeCost) || runeCost <= 0) {
    return { state: "NOT_PINNED", reason: "the pinned marrowrend record carries no positive Rune row" };
  }
  return {
    state: "PINNED",
    spellId: record.spellId,
    runeCost,
    cooldownFree:
      record.cooldownMs === 0 &&
      record.chargeCooldownMs === 0 &&
      record.internalCooldownMs === 0 &&
      record.categoryCooldownMs === 0,
    castTimeMs: record.castTimeMs,
  };
}

function runeCountOf(observation: BloodResourceObservation): BloodRuneCount {
  if (observation.state !== "EXACT_PRE_COST") return { state: "NOT_ESTABLISHED", reason: observation.reason };
  return { state: "EXACT", amount: observation.amount, max: observation.max, wireCost: observation.cost };
}

/**
 * The affordability fact for one decision, from that decision's own Rune
 * observation and the build's hero-tree resolution. Total: every input shape
 * lands on exactly one evidence class.
 */
export function bloodRuneAffordability(
  observation: BloodResourceObservation,
  heroTree: HeroTreeResolution,
  pin: BloodMarrowrendPin = pinnedMarrowrend(),
): BloodRuneAffordability {
  const runes = runeCountOf(observation);
  const costModifiersExcluded = marrowrendRuneCostModifiersExcluded(heroTree);
  const evidence = ((): BloodRuneAffordabilityEvidence => {
    if (runes.state !== "EXACT") return "NO_RUNE_OBSERVATION";
    if (pin.state !== "PINNED" || !pin.cooldownFree || pin.castTimeMs !== 0) return "AUTHORITY_NOT_PINNED";
    if (!costModifiersExcluded) return "MODIFIER_UNPROVEN";
    return runes.amount >= pin.runeCost ? "OWN_PRE_COST_AFFORDABLE" : "OWN_PRE_COST_BELOW_COST";
  })();
  return { runes, costModifiersExcluded, marrowrend: pin, evidence };
}

/** No fact: the shape a caller passes when it computed nothing. Proves nothing. */
export const NO_RUNE_AFFORDABILITY: BloodRuneAffordability = Object.freeze<BloodRuneAffordability>({
  runes: { state: "NOT_ESTABLISHED", reason: "no Rune affordability fact was computed for this decision" },
  costModifiersExcluded: false,
  marrowrend: { state: "NOT_PINNED", reason: "no Rune affordability fact was computed for this decision" },
  evidence: "NO_RUNE_OBSERVATION",
});

/**
 * Whether the fact proves Marrowrend's `ready()` cannot fail on cost or
 * cooldown at this decision. Re-checks every conjunct rather than trusting
 * the evidence tag, so a fact assembled by hand cannot prove more than its
 * parts do.
 */
export function marrowrendAffordabilityProven(fact: BloodRuneAffordability): boolean {
  return (
    fact.evidence === "OWN_PRE_COST_AFFORDABLE" &&
    fact.runes.state === "EXACT" &&
    fact.costModifiersExcluded &&
    fact.marrowrend.state === "PINNED" &&
    fact.marrowrend.spellId === MARROWREND_SPELL_ID &&
    fact.marrowrend.cooldownFree &&
    fact.marrowrend.castTimeMs === 0 &&
    fact.runes.amount >= fact.marrowrend.runeCost
  );
}
