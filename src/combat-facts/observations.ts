/**
 * Observed combat facts: the canonical per-event observations (M11-E1).
 *
 * WHAT THIS DOMAIN ANSWERS, AND WHAT IT NEVER DOES
 *
 * "What did the observed combat evidence establish?" — nothing more. There is
 * no damage done, no effective anything, no crit, no direct hit, no enemy, no
 * target availability, no better or worse. Those are either NOT YET PROVEN
 * (the raw field semantics, follow-ups M1–M3) or belong to later reviewed
 * models (M11-ED/F enemy sets, M11-G causal analysis).
 *
 * It is POST-HOC infrastructure. The authority branch (`src/simc`,
 * `src/specs`) must never read it, so a future outcome can never satisfy a
 * past decision's `fight_remains`, `time_to_die` or target availability; a
 * contract test enforces both import directions.
 *
 * THE CANONICAL FACT IS THE EVENT
 *
 * Every aggregate in `window-query.ts` is derived from these observations and
 * can be traced back to their locators. Raw component fields are kept verbatim
 * and named by the raw v2 key they came from (`amountField`, not "damage"), so
 * a later reviewed mapping — e.g. once M1 pins what `amount` means — is a new
 * measure over existing observations, not a normalization redesign.
 */

import type { CombatFight } from "../engine/normalization/combat-fight.js";
import type {
  ActorAbsence,
  ActorRef,
  CastPhase,
  TickFieldState,
} from "../engine/normalization/normalized-events.js";
import type { EvidenceLocator } from "../engine/evidence/locator.js";

// ---------------------------------------------------------------------------
// Actor identity
// ---------------------------------------------------------------------------

/**
 * One actor instance. `instanceId: null` means Warcraft Logs supplied none,
 * which is a different fact from instance 0; the two never group together.
 * Never keyed by name.
 */
export interface ActorKey {
  readonly actorId: number;
  readonly instanceId: number | null;
}

export function actorKeyOf(ref: ActorRef): ActorKey {
  return { actorId: ref.actorId, instanceId: ref.instanceId };
}

/** Total order: actor id, then instance with `null` first. */
export function compareActorKeys(left: ActorKey, right: ActorKey): number {
  if (left.actorId !== right.actorId) return left.actorId - right.actorId;
  if (left.instanceId === right.instanceId) return 0;
  if (left.instanceId === null) return -1;
  if (right.instanceId === null) return 1;
  return left.instanceId - right.instanceId;
}

/** A stable grouping key. `#-` marks "no instance supplied", never instance 0. */
export function actorKeyString(key: ActorKey): string {
  return `${String(key.actorId)}#${key.instanceId === null ? "-" : String(key.instanceId)}`;
}

export function sameActorKey(left: ActorKey, right: ActorKey): boolean {
  return left.actorId === right.actorId && left.instanceId === right.instanceId;
}

// ---------------------------------------------------------------------------
// Observations
// ---------------------------------------------------------------------------

/** One side of an event: an actor, or the recorded reason there is none. */
export type ObservedSide =
  | { readonly kind: "ACTOR"; readonly key: ActorKey }
  | { readonly kind: "NO_ACTOR"; readonly absence: ActorAbsence };

/**
 * The raw damage components, each named by the raw v2 key it was read from.
 *
 * `null` is ABSENCE (the key was not supplied, or was not a finite number) —
 * never 0. No algebraic relation among these is assumed: `amountField` is not
 * "damage done", and no sum of these fields is a gameplay quantity until a
 * reviewed milestone proves it (follow-up M1).
 */
export interface RawDamageComponents {
  /** Raw `amount`. Always present: the decoder requires it. */
  readonly amountField: number;
  readonly absorbedField: number | null;
  readonly mitigatedField: number | null;
  readonly unmitigatedAmountField: number | null;
  readonly blockedField: number | null;
  /** Raw `overkill`. Unobserved in every current capture, so `null` today. */
  readonly overkillField: number | null;
  readonly isAoEField: boolean | null;
  /** Raw Augmentation attribution (`supportID`). Never used to move damage (M6). */
  readonly supportActorIdField: number | null;
  readonly subtractsFromSupportedActorField: boolean | null;
}

export interface DamageObservation {
  readonly kind: "DAMAGE";
  readonly locator: EvidenceLocator;
  readonly reportTimeMs: number;
  readonly fightTimeMs: number;
  readonly source: ObservedSide;
  readonly target: ObservedSide;
  readonly abilityGameId: number | null;
  readonly raw: RawDamageComponents;
  /** Raw numeric `hitType`. No numeric value is mapped to crit/hit/miss (M2). */
  readonly hitTypeRaw: number | null;
  /** Raw `tick` state. NOT_SUPPLIED is not "direct" (M3). */
  readonly tickField: TickFieldState;
  readonly outsideRequestedRange: boolean;
}

export interface CastObservation {
  readonly kind: "CAST";
  readonly locator: EvidenceLocator;
  readonly reportTimeMs: number;
  readonly fightTimeMs: number;
  readonly source: ObservedSide;
  readonly target: ObservedSide;
  readonly abilityGameId: number | null;
  /** `begincast` and `cast` are separate facts and are never merged. */
  readonly phase: CastPhase;
  readonly outsideRequestedRange: boolean;
}

function sideOf(ref: ActorRef | null, absence: ActorAbsence | null): ObservedSide {
  if (ref !== null) return { kind: "ACTOR", key: actorKeyOf(ref) };
  return { kind: "NO_ACTOR", absence: absence ?? "NOT_SUPPLIED" };
}

/** The canonical observations of one fight, in retrieval order (never re-sorted). */
export interface FightObservations {
  readonly damage: readonly DamageObservation[];
  readonly casts: readonly CastObservation[];
}

export function observationsOf(fight: CombatFight): FightObservations {
  const damage: DamageObservation[] = [];
  const casts: CastObservation[] = [];
  for (const event of fight.events) {
    if (event.kind === "DAMAGE") {
      damage.push({
        kind: "DAMAGE",
        locator: event.locator,
        reportTimeMs: event.reportTimeMs,
        fightTimeMs: event.fightTimeMs,
        source: sideOf(event.source, event.sourceAbsence),
        target: sideOf(event.target, event.targetAbsence),
        abilityGameId: event.abilityGameId,
        raw: {
          amountField: event.amount,
          absorbedField: event.absorbedAmount,
          mitigatedField: event.mitigatedAmount,
          unmitigatedAmountField: event.unmitigatedAmount,
          blockedField: event.blockedAmount,
          overkillField: event.overkillAmount,
          isAoEField: event.isAoE,
          supportActorIdField: event.supportActorId,
          subtractsFromSupportedActorField: event.subtractsFromSupportedActor,
        },
        hitTypeRaw: event.hitType,
        tickField: event.tickField,
        outsideRequestedRange: event.outsideRequestedRange,
      });
    } else if (event.kind === "CAST") {
      casts.push({
        kind: "CAST",
        locator: event.locator,
        reportTimeMs: event.reportTimeMs,
        fightTimeMs: event.fightTimeMs,
        source: sideOf(event.source, event.sourceAbsence),
        target: sideOf(event.target, event.targetAbsence),
        abilityGameId: event.abilityGameId,
        phase: event.castPhase,
        outsideRequestedRange: event.outsideRequestedRange,
      });
    }
  }
  return { damage, casts };
}
