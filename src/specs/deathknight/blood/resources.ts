/**
 * Runes and Runic Power at a Blood decision (M11-B2) — OBSERVATIONS, never a
 * replay, never a regeneration model.
 *
 * WHAT THE WIRE CARRIES — MEASURED, NOT ASSUMED. A cast carries ONE
 * `classResources` entry. When the cast costs a resource, the entry is that
 * resource with the amount BEFORE its own cost (M4's `PRE_COST` sampling
 * contract, corroborated for both Death Knight resources by
 * `resource-types.ts`): a Death Strike carries a type-6 (Runic Power) entry
 * costed 450; a Heart Strike, Vampiric Strike, Marrowrend, Death's Caress
 * or Death and Decay carries a type-5 (Runes) entry costed 1 or 2 and NO
 * Runic Power entry at all. When the cast costs nothing — Blood Boil, a
 * Rune-free Heart Strike, the melee swings — the entry is the actor's
 * Runic Power pool UNCOSTED, and M4 grades it EVENT_ASSOCIATED: it rode in
 * on the event, and its ordering relative to the event's own energize is
 * NOT established. This module reads that as NO_OBSERVATION. So
 * `runic_power.deficit` is KNOWN at Death Strike decisions only and `rune`
 * at Rune-costed decisions only; that asymmetry is a measured limit of the
 * slice, not a modelling choice.
 *
 * TWO ENCODINGS, CONVERTED ONCE. The wire reports Runic Power in TENTHS of
 * a point (max 1250 for a 125-point bar; Death Strike's DBC `_cost` 450 is
 * 45 points, power_type_data.inc row 6 divisor 10) and Runes in whole runes
 * (max 6). SimulationCraft's `runic_power.deficit` is `resources.max -
 * resources.current` in POINTS (player.cpp:12585-12587) and `rune` is a
 * whole count. The conversion lives here and nowhere else.
 *
 * WHAT THIS MODULE READS, AND WHAT IT REFUSES TO
 *
 *   EXACT_PRE_COST      the amount on the wire at THIS cast — the value bound
 *                       to `runic_power.deficit` (from a Runic Power entry)
 *                       or `rune` (from a Runes entry) for this decision
 *   NO_OBSERVATION      no entry, an entry M4 does not grade EXACT/OBSERVED,
 *                       or an EVENT_ASSOCIATED entry — the atom stays UNKNOWN
 *
 * No generator press is replayed, no gain is read from `resourcechange`, no
 * Rune regeneration is modelled (the wire carries no Rune change events at
 * all), and no amount is carried from one decision to the next.
 *
 * THE COST FIELD IS NOT THE COST. The wire's `cost` on a Death Strike cast
 * is the DBC base cost (450); the deduction this build actually pays is 350
 * (Improved Death Strike, Ossuary — cost modifiers this slice does not
 * model), and the second subject cast Death Strike with 440 and 390 on the
 * wire against a reported 450. No affordability or INSUFFICIENT_RESOURCE
 * proof is built on the field, in either direction, anywhere in this
 * module or the action profile.
 */

import type { CombatState } from "../../../engine/state/combat-state.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import { resourceWireTypeFor } from "../../../data/wcl-wire/resource-types.js";
import type { FightCompatibilityKeys } from "../../../data/provenance.js";
import { RUNES_RESOURCE_ID, RUNIC_POWER_RESOURCE_ID } from "./spec.js";

/** power_type_data.inc row 6: Runic Power's DBC and wire encoding is tenths of a point. */
export const RUNIC_POWER_WIRE_DIVISOR = 10;

/**
 * The amount a cast OBSERVED of one resource. An observation record, never a
 * state.
 */
export type BloodResourceObservation =
  | {
      readonly state: "EXACT_PRE_COST";
      /** In the WIRE encoding, verbatim. */
      readonly amount: number;
      readonly max: number | null;
      readonly cost: number | null;
    }
  | { readonly state: "NO_OBSERVATION"; readonly reason: string };

export interface BloodCastResources {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  readonly runes: BloodResourceObservation;
  readonly runicPower: BloodResourceObservation;
}

/** The fight's parser-version keys, read from ingestion provenance and nowhere else. */
export function bloodWireKeys(state: CombatState): FightCompatibilityKeys {
  return {
    gameVersion: state.fight.provenance.gameVersion,
    logVersion: state.fight.provenance.logVersion,
  };
}

export type BloodResourceWireTypes =
  | { readonly ok: true; readonly runes: number; readonly runicPower: number }
  | { readonly ok: false; readonly reason: string };

/**
 * The wire types carrying Runes and Runic Power FOR THIS FIGHT'S PARSER
 * VERSION (M11-B12).
 *
 * Both resources resolve through the shared version-scoped resolver, with the
 * capture's own `gameVersion` / `logVersion`. A contract that is not pinned
 * for the resource, or is pinned for a version this capture is not, FAILS
 * CLOSED: there is no fallback to the contract's number, because a wire type
 * read from the wrong parser version would not be an approximation of this
 * log's encoding — it would be a different field, and every Rune and Runic
 * Power fact downstream (affordability, deficits, the decisions they decide)
 * would be fabricated from it. M11-B2 through M11-B10 read the contract list
 * directly, which was invisible while the corpus was one parser version and
 * wrong the moment a capture was not; promotion is where that stopped being
 * acceptable.
 */
export function bloodResourceWireTypes(keys: FightCompatibilityKeys): BloodResourceWireTypes {
  const runes = resourceWireTypeFor(RUNES_RESOURCE_ID, keys);
  const runicPower = resourceWireTypeFor(RUNIC_POWER_RESOURCE_ID, keys);
  for (const [resourceId, resolution] of [
    [RUNES_RESOURCE_ID, runes],
    [RUNIC_POWER_RESOURCE_ID, runicPower],
  ] as const) {
    if (!resolution.ok) {
      return {
        ok: false,
        reason:
          resolution.reason === "NO_CONTRACT_FOR_RESOURCE"
            ? `no wire contract is declared for ${resourceId}`
            : `the ${resourceId} wire contract is not established for this log's gameVersion/logVersion`,
      };
    }
  }
  if (!runes.ok || !runicPower.ok) {
    // Unreachable: the loop above returns first. Present so the narrowing is
    // established by the compiler rather than by a comment.
    return { ok: false, reason: "a wire contract is not established for this log" };
  }
  return { ok: true, runes: runes.wireType, runicPower: runicPower.wireType };
}

/** One resource a cast carried, read once through M4's observation accessor. */
export function bloodResourceOn(
  state: CombatState,
  position: number,
  actorId: number,
  wireType: number,
): BloodResourceObservation {
  const result = state.resources.observationOnEvent(position, actorId, wireType);
  if (result.certainty === "UNKNOWN") return { state: "NO_OBSERVATION", reason: result.reason };
  if (result.certainty !== "EXACT" || result.derivation !== "OBSERVED") {
    return { state: "NO_OBSERVATION", reason: `observation was ${result.certainty}/${result.derivation}` };
  }
  if (result.value.timing !== "PRE_COST") {
    return { state: "NO_OBSERVATION", reason: `observation timing is ${result.value.timing}, not PRE_COST` };
  }
  return {
    state: "EXACT_PRE_COST",
    amount: result.value.observedAmount,
    max: result.value.observedMax,
    cost: result.value.observedCost,
  };
}

/**
 * `runic_power.deficit` in POINTS from a PRE_COST Runic Power observation,
 * or `null` when the observation does not support one (no observation, or
 * no `max` on the wire — a deficit without a maximum is not a number).
 */
export function runicPowerDeficitPoints(observation: BloodResourceObservation): number | null {
  if (observation.state !== "EXACT_PRE_COST" || observation.max === null) return null;
  return (observation.max - observation.amount) / RUNIC_POWER_WIRE_DIVISOR;
}

/** `rune` from a PRE_COST Runes observation, or `null`. Whole runes; no conversion. */
export function runeCount(observation: BloodResourceObservation): number | null {
  if (observation.state !== "EXACT_PRE_COST") return null;
  return observation.amount;
}
