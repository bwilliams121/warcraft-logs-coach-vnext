/**
 * One resource, as OBSERVED on one actor's own completed cast (M11-D2-A1).
 *
 * The shared form of a reader the public specializations each wrote for
 * themselves (the list, and the proof of equivalence with every one of them,
 * is tests/contracts/m11d2a1-own-cast-resource-parity.test.ts). This module
 * names no specialization: it is shared infrastructure. It answers exactly one
 * question — what did this actor's own completed cast report about this
 * resource, before paying for itself — and answers it only when the evidence
 * on that event establishes it.
 *
 * WHAT IT ESTABLISHES, AND ONLY WHEN
 *
 *   the event is a CAST, COMPLETED, sourced by the actor
 *   the resource's wire type resolves for THIS fight's gameVersion/logVersion
 *   the event carries that resource for the actor, on the CASTER's side
 *   M4 grades it EXACT / OBSERVED, and its timing is PRE_COST
 *   the amount and the maximum are usable numbers on the SAME observation,
 *   whole numbers where the resource is a count, amount <= maximum
 *
 * Then, and only then, it reports the wire values verbatim together with the
 * contract's unit divisor and the amount, maximum and deficit in the unit
 * SimulationCraft expressions read. Every other case is a REFUSAL naming why.
 *
 * WHAT IT NEVER DOES
 *
 * No regeneration, no carry from another observation, no delta replay, no
 * default — a missing entry is a refusal, never zero. No affordability claim
 * in either direction: the `cost` is reported, and the contract prose records
 * that it is the DBC BASE cost, which a cast may not actually pay. No other
 * actor's pool: a snapshot on someone else's cast, or on the target side of
 * the actor's own cast, is refused. No unit is guessed: the divisor is the
 * contract's, and a resource without a contract is refused.
 *
 * STRICTER THAN THE READERS IT GENERALIZES, NEVER LOOSER. Those readers
 * accepted whatever `observationOnEvent` graded EXACT/OBSERVED/PRE_COST and
 * relied on their callers to pass only the actor's own completed casts; this
 * one checks the cast itself. Two of them also looked the wire type up
 * without the fight's version keys; this one never does.
 *
 * A SIMULATED PREFIX DOES NOT UPDATE WHAT THIS RETURNS. The value describes
 * the real event at the real decision. A caller evaluating a hypothetical
 * prefix in which a transition WRITES this resource (a contract declaring
 * e.g. `PLAYER_ENERGY` or `HOLY_POWER_SPEND`) must stop treating the value as
 * that branch's state — forget it, or replace it with a state the
 * specialization proves — before evaluating anything after the transition.
 * This module does neither for it: it simulates nothing.
 */

import type { CombatState } from "../../engine/state/combat-state.js";
import type { EvidenceLocator } from "../../engine/evidence/locator.js";
import type { ResourceAmountObservation } from "../../engine/resources/resource-observations.js";
import {
  resourceWireTypeFor,
  type ResourceId,
  type WireUnitScale,
} from "../../data/wcl-wire/resource-types.js";
import type { CompatibilityOutcome, FightCompatibilityKeys } from "../../data/provenance.js";

/** Why no exact own-cast observation was established. Each names a different missing fact. */
export type OwnCastResourceRefusalReason =
  /** No event at the position, or it is not a cast. */
  | "NOT_A_CAST"
  /** A `begincast`: no resource contract was ever established on one. */
  | "CAST_NOT_COMPLETED"
  /** The cast was sourced by someone else, or by nobody. */
  | "NOT_THE_ACTORS_OWN_CAST"
  | "NO_CONTRACT_FOR_RESOURCE"
  | "INCOMPATIBLE_VERSION"
  /** The event carries no such resource for the actor. An absence of evidence, never zero. */
  | "NO_OBSERVATION"
  /** M4 did not grade the observation EXACT / OBSERVED. */
  | "NOT_EXACT_OBSERVED"
  /** The snapshot describes the actor from the TARGET side of the event, not as the caster. */
  | "NOT_THE_CASTERS_SNAPSHOT"
  /** Not a costed completed cast: the amount has no established relationship to the cast. */
  | "NOT_PRE_COST"
  | "AMOUNT_UNUSABLE"
  | "MAX_UNKNOWN"
  | "MAX_UNUSABLE"
  | "AMOUNT_ABOVE_MAX";

export const OWN_CAST_RESOURCE_REFUSAL_REASONS = [
  "NOT_A_CAST",
  "CAST_NOT_COMPLETED",
  "NOT_THE_ACTORS_OWN_CAST",
  "NO_CONTRACT_FOR_RESOURCE",
  "INCOMPATIBLE_VERSION",
  "NO_OBSERVATION",
  "NOT_EXACT_OBSERVED",
  "NOT_THE_CASTERS_SNAPSHOT",
  "NOT_PRE_COST",
  "AMOUNT_UNUSABLE",
  "MAX_UNKNOWN",
  "MAX_UNUSABLE",
  "AMOUNT_ABOVE_MAX",
] as const satisfies readonly OwnCastResourceRefusalReason[];

export type OwnCastResource =
  | {
      readonly state: "EXACT_PRE_COST";
      readonly resourceId: ResourceId;
      readonly wireType: number;
      /** The M4 observation itself: position, locator, side, actor, timing — the evidence. */
      readonly observation: ResourceAmountObservation;
      /** `amount`, verbatim, in the WIRE encoding. */
      readonly wireAmount: number;
      /** `max`, verbatim, in the WIRE encoding. From the SAME observation. */
      readonly wireMax: number;
      /** `cost`, verbatim. The DBC base cost: identity corroboration, never an amount paid. */
      readonly wireCost: number | null;
      /** The contract's scale, carried so the conversion below can be checked. */
      readonly unitScale: WireUnitScale;
      /** `wireAmount / divisor`: the amount before the cast's own cost, in expression units. */
      readonly amount: number;
      /** `wireMax / divisor`. */
      readonly max: number;
      /** `(wireMax - wireAmount) / divisor`, both from the same observation. */
      readonly deficit: number;
    }
  | {
      readonly state: "REFUSED";
      readonly resourceId: ResourceId;
      readonly reason: OwnCastResourceRefusalReason;
      readonly detail: string;
      /** The event the question was asked about, when there is one. */
      readonly locators: readonly EvidenceLocator[];
      /** Set only for INCOMPATIBLE_VERSION. */
      readonly compatibility?: CompatibilityOutcome;
    };

export interface OwnCastResourceQuery {
  /** The canonical position of the cast. */
  readonly position: number;
  /** The actor whose own cast, and whose own pool, the question is about. */
  readonly actorId: number;
  readonly resourceId: ResourceId;
}

/** The fight's parser-version keys, read from ingestion provenance and nowhere else. */
export function fightWireKeys(state: CombatState): FightCompatibilityKeys {
  return {
    gameVersion: state.fight.provenance.gameVersion,
    logVersion: state.fight.provenance.logVersion,
  };
}

/** Reads one resource off one actor's own completed cast. Total: every case is a result, never a throw. */
export function ownCastResourceAt(state: CombatState, query: OwnCastResourceQuery): OwnCastResource {
  const { position, actorId, resourceId } = query;
  const event = state.eventAt(position);
  const locators: readonly EvidenceLocator[] = event === null ? [] : [event.locator];
  const refuse = (
    reason: OwnCastResourceRefusalReason,
    detail: string,
    compatibility?: CompatibilityOutcome,
  ): OwnCastResource => ({
    state: "REFUSED",
    resourceId,
    reason,
    detail,
    locators,
    ...(compatibility === undefined ? {} : { compatibility }),
  });

  if (event === null || event.kind !== "CAST") {
    return refuse("NOT_A_CAST", "the position holds no cast event");
  }
  if (event.castPhase !== "COMPLETE") {
    return refuse("CAST_NOT_COMPLETED", "the cast is not a completed cast");
  }
  if (event.source === null || event.source.actorId !== actorId) {
    return refuse("NOT_THE_ACTORS_OWN_CAST", `the cast is not sourced by actor ${String(actorId)}`);
  }

  const resolution = resourceWireTypeFor(resourceId, fightWireKeys(state));
  if (!resolution.ok) {
    return resolution.reason === "NO_CONTRACT_FOR_RESOURCE"
      ? refuse("NO_CONTRACT_FOR_RESOURCE", `no wire contract is declared for ${resourceId}`)
      : refuse(
          "INCOMPATIBLE_VERSION",
          `the ${resourceId} wire contract is not established for this log's gameVersion/logVersion`,
          resolution.outcome,
        );
  }
  const { wireType, contract } = resolution;
  const { unitScale } = contract;

  const result = state.resources.observationOnEvent(position, actorId, wireType);
  if (result.certainty === "UNKNOWN") {
    return result.reason === "NO_OBSERVATION"
      ? refuse("NO_OBSERVATION", `the cast carries no ${resourceId} entry for the actor`)
      : refuse("NO_OBSERVATION", `no observation was established (${result.reason})`);
  }
  if (result.certainty !== "EXACT" || result.derivation !== "OBSERVED") {
    return refuse("NOT_EXACT_OBSERVED", `the observation is ${result.certainty}/${result.derivation}`);
  }
  const observation = result.value;
  if (observation.side !== "SOURCE") {
    return refuse("NOT_THE_CASTERS_SNAPSHOT", `the snapshot is on the ${observation.side} side of the cast`);
  }
  if (observation.timing !== "PRE_COST") {
    return refuse(
      "NOT_PRE_COST",
      `the observation's timing is ${observation.timing}; only PRE_COST describes the amount before the cast's own cost`,
    );
  }

  const { observedAmount, observedMax } = observation;
  const isValue = (value: number): boolean =>
    unitScale.wholeUnits ? Number.isSafeInteger(value) : Number.isFinite(value);
  if (!isValue(observedAmount) || observedAmount < 0) {
    return refuse("AMOUNT_UNUSABLE", `the observed amount ${String(observedAmount)} is not a usable amount`);
  }
  if (observedMax === null) {
    return refuse("MAX_UNKNOWN", "the observation carries no maximum");
  }
  if (!isValue(observedMax) || observedMax <= 0) {
    return refuse("MAX_UNUSABLE", `the observed maximum ${String(observedMax)} is not a usable capacity`);
  }
  if (observedMax < observedAmount) {
    return refuse(
      "AMOUNT_ABOVE_MAX",
      `the observed maximum ${String(observedMax)} is below the observed amount ${String(observedAmount)}`,
    );
  }

  const { divisor } = unitScale;
  return {
    state: "EXACT_PRE_COST",
    resourceId,
    wireType,
    observation,
    wireAmount: observedAmount,
    wireMax: observedMax,
    wireCost: observation.observedCost,
    unitScale,
    amount: observedAmount / divisor,
    max: observedMax / divisor,
    deficit: (observedMax - observedAmount) / divisor,
  };
}
