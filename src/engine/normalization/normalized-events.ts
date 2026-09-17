/**
 * The factual normalized event vocabulary.
 *
 * Everything here describes WHAT WAS OBSERVED. Nothing here describes what
 * should have happened. There is no `wasActive`, no `wasWasted`, no `wasLate`,
 * no `expected` — a contract test enforces that, because the moment a gameplay
 * adjective lands in this file the normalizer has started coaching.
 *
 * Three structural decisions carry most of the weight:
 *
 * 1. DIRECTION IS BRANDED. `SourceRef` and `TargetRef` are not mutually
 *    assignable, so the historical regression — reading a debuff ON a player as
 *    a debuff APPLIED BY that player — becomes a compile error rather than a
 *    silent swap.
 *
 * 2. AN EVENT EITHER HAS A VALID ENVELOPE OR IT IS NOT AN EVENT. Observations
 *    whose timestamp/type could not be established live in
 *    `MalformedRawObservation`, outside `events[]`, so no code path has to
 *    fabricate a timestamp to satisfy a type.
 *
 * 3. A RESOURCE SNAPSHOT KNOWS WHICH SIDE IT DESCRIBES. Warcraft Logs attaches
 *    one snapshot per event and says, via `resourceActor`, whether it belongs to
 *    the source or the target. It is never assumed to be the source's.
 */

import type { EvidenceLocator, RetrievalPosition } from "../evidence/locator.js";

declare const SOURCE_BRAND: unique symbol;
declare const TARGET_BRAND: unique symbol;

/**
 * A reference to one actor instance.
 *
 * `actorId` and `instanceId` are never collapsed. `instanceId: null` means
 * Warcraft Logs supplied none, which is a different fact from instance 0.
 */
export interface ActorRef {
  readonly actorId: number;
  readonly instanceId: number | null;
}

/** An actor observed as the SOURCE of an event. Not assignable to `TargetRef`. */
export type SourceRef = ActorRef & { readonly [SOURCE_BRAND]: true };

/** An actor observed as the TARGET of an event. Not assignable to `SourceRef`. */
export type TargetRef = ActorRef & { readonly [TARGET_BRAND]: true };

export function sourceRef(actorId: number, instanceId: number | null): SourceRef {
  return { actorId, instanceId } as SourceRef;
}

export function targetRef(actorId: number, instanceId: number | null): TargetRef {
  return { actorId, instanceId } as TargetRef;
}

/**
 * Why an event has no actor on one side.
 *
 * Recorded so "Warcraft Logs said there is no actor here" stays distinguishable
 * from "Warcraft Logs did not tell us". Neither ever produces an actor.
 */
export type ActorAbsence =
  /** The key was not present on the raw event. */
  | "NOT_SUPPLIED"
  /** The verified `-1` no-actor sentinel. */
  | "NO_ACTOR_SENTINEL"
  /** Present, but not a value any actor could have. Never given the sentinel's meaning. */
  | "UNUSABLE_VALUE";

export type ResourceSide = "SOURCE" | "TARGET";

export interface ClassResourceObservation {
  readonly resourceType: number;
  /**
   * `amount`, verbatim.
   *
   * WHEN this was sampled relative to its own event depends on the event, and
   * only one case is established. On a COMPLETED cast carrying a positive
   * `cost`, `amount` is the actor's amount BEFORE that cost was paid. Everywhere
   * else — including a `resourcechange` attachment — the sampling order is NOT
   * ESTABLISHED.
   *
   * M4 carries that distinction as `ResourceObservationTiming` so no consumer
   * has to re-derive it from the raw type. See
   * `src/engine/resources/resource-observations.ts`.
   */
  readonly amount: number;
  readonly max: number | null;
  /**
   * Observed on `cast` events only. An observed number, not a gameplay verdict.
   *
   * It is not subtracted from `amount` anywhere. `amount - cost` looks like the
   * post-cost amount and is not one: live captures contain costed casts whose
   * following observation differs from that arithmetic, so the difference would
   * be a reconstruction, not an observation.
   */
  readonly cost: number | null;
}

export interface ResourcePosition {
  readonly x: number;
  readonly y: number;
  readonly facing: number | null;
  readonly mapId: number | null;
}

/**
 * A resource snapshot Warcraft Logs attached to an event.
 *
 * `side` is taken from the verified `resourceActor` discriminator, never
 * assumed. `actor` is the concrete actor on that side when there is one — it is
 * `null` when that side carried the no-actor sentinel or no id at all, because
 * the snapshot is still a fact even when the actor behind it is not stated.
 */
export interface AttachedResourceObservation {
  readonly side: ResourceSide;
  readonly actor: ActorRef | null;
  readonly classResources: readonly ClassResourceObservation[];
  readonly hitPoints: number | null;
  readonly maxHitPoints: number | null;
  readonly attackPower: number | null;
  readonly spellPower: number | null;
  readonly armor: number | null;
  readonly absorb: number | null;
  readonly itemLevel: number | null;
  readonly position: ResourcePosition | null;
}

/**
 * The common envelope every normalized event carries.
 *
 * The identity-bearing fields are nullable because Warcraft Logs does not
 * supply them for every event. Null means "no actor here" and is never
 * defaulted to the focus player, the boss, or the other end of the event.
 */
export interface CombatEventBase {
  readonly locator: EvidenceLocator;
  /** Monotonic across the fight, in retrieval order. Never re-sorted. */
  readonly ingestionOrdinal: number;
  /** Report-relative, exactly as supplied. Never rounded, never clamped. */
  readonly reportTimeMs: number;
  /** `reportTimeMs - fight.startTime`. Does not replace `reportTimeMs`. */
  readonly fightTimeMs: number;
  /** Warcraft Logs' own type string, verbatim. */
  readonly rawType: string;
  readonly source: SourceRef | null;
  readonly target: TargetRef | null;
  /** Set exactly when `source` is null. */
  readonly sourceAbsence: ActorAbsence | null;
  /** Set exactly when `target` is null. */
  readonly targetAbsence: ActorAbsence | null;
  readonly abilityGameId: number | null;
  /** Present only under `includeResources`. Carries its own side. */
  readonly attachedResources: AttachedResourceObservation | null;
  /** True when the timestamp fell outside the requested range. Kept, not clamped. */
  readonly outsideRequestedRange: boolean;
}

export type CastPhase = "BEGIN" | "COMPLETE";

/** `cast` and `begincast`. */
export interface CastEvent extends CombatEventBase {
  readonly kind: "CAST";
  readonly castPhase: CastPhase;
  /** From the observed `melee` flag. Null when not supplied. */
  readonly isMelee: boolean | null;
}

export type AuraOperation = "APPLIED" | "REFRESHED" | "REMOVED";
export type AuraClass = "BUFF" | "DEBUFF";

/**
 * The ten aura types.
 *
 * `auraClass` comes from the raw type string, never from which query returned
 * the event. Direction is `source` -> `target` on the envelope, and the brands
 * make an inversion a compile error.
 */
export interface AuraEvent extends CombatEventBase {
  readonly kind: "AURA";
  readonly operation: AuraOperation;
  readonly auraClass: AuraClass;
  /** True when the raw type was a `*stack` variant. */
  readonly isStackChange: boolean;
  /**
   * From `stack`. Null when not supplied — never defaulted to 0 or 1.
   *
   * On a stack-change event this is the ABSOLUTE RESULTING STACK COUNT AFTER
   * that event, established from live captures for `gameVersion` 1 /
   * `logVersion` 17. It is not a delta, not the prior count, and not an amount
   * to add or subtract.
   *
   * Present ONLY on the `*stack` variants. The non-stack aura types carry no
   * `stack` at all, so a null here is an absence, never a count of zero.
   *
   * Knowing what the number means does not make the count at an arbitrary later
   * instant knowable: that needs an initial-application count, refresh and
   * expiry behaviour, none of which is established. See
   * `src/engine/auras/aura-state.ts`.
   */
  readonly stacks: number | null;
  /** From the observed `absorb` field on some aura events. */
  readonly absorbAmount: number | null;
}

export interface DamageEvent extends CombatEventBase {
  readonly kind: "DAMAGE";
  readonly amount: number;
  readonly unmitigatedAmount: number | null;
  readonly mitigatedAmount: number | null;
  readonly absorbedAmount: number | null;
  readonly blockedAmount: number | null;
  readonly hitType: number | null;
  readonly isAoE: boolean | null;
  readonly isTick: boolean;
  /** Augmentation support attribution, as reported. Not interpreted here. */
  readonly supportActorId: number | null;
  readonly subtractsFromSupportedActor: boolean | null;
}

export interface HealingEvent extends CombatEventBase {
  readonly kind: "HEALING";
  readonly amount: number;
  readonly overhealAmount: number | null;
  readonly absorbedAmount: number | null;
  readonly hitType: number | null;
  readonly isTick: boolean;
}

export type AbsorbKind = "DAMAGE_ABSORBED" | "HEAL_ABSORBED";

/** `absorbed` and `healabsorbed`. */
export interface AbsorbEvent extends CombatEventBase {
  readonly kind: "ABSORB";
  readonly absorbKind: AbsorbKind;
  readonly amount: number;
  /** `extraAbilityGameID` — the ability that was absorbed. */
  readonly absorbedAbilityGameId: number | null;
  /** `attackerID` for damage absorbs, `healerID` for heal absorbs. */
  readonly attributedActorId: number | null;
}

/**
 * `resourcechange`.
 *
 * Standalone, and kept structurally distinct from `attachedResources` so the
 * two observation shapes can never be confused for one another.
 */
export interface ResourceChangeEvent extends CombatEventBase {
  readonly kind: "RESOURCE_CHANGE";
  readonly resourceType: number;
  readonly resourceChange: number;
  readonly otherResourceChange: number | null;
  readonly maxResourceAmount: number | null;
  /**
   * Warcraft Logs' own `waste` number, preserved verbatim.
   *
   * An OBSERVED FIELD, not a gameplay verdict. It is not "resource wasted", and
   * being at cap is not waste. M4/M5 decide what it means.
   */
  readonly reportedWasteAmount: number | null;
}

/** `summon`. Source summoned target. No attribution is implied. */
export interface SummonEvent extends CombatEventBase {
  readonly kind: "SUMMON";
}

/**
 * The ONE dated Warcraft Logs contract this project holds for the optional
 * identity fields of a `combatantinfo` gear row (M10-C4).
 *
 * PROVENANCE. On 2026-09-17 Warcraft Logs answered a written question about
 * `permanentEnchant`, `temporaryEnchant` and `gems`: "the value of those
 * fields is the value we use for the UI on warcraftlogs. no further
 * guarantees are made. the interpretations you posted are currently
 * correct." The interpretations posted were: an omitted `permanentEnchant`
 * means no permanent enchant is applied; an omitted `temporaryEnchant` means
 * no temporary enchant is active; an omitted `gems` means no gems are
 * installed, without proving whether the item has sockets.
 *
 * WHAT THAT IS AND IS NOT. It is a statement of CURRENT UI behaviour, made
 * in writing, and it is the only reason an omission is read as "none". It is
 * not a GraphQL schema guarantee, not a frozen API contract, and it carries
 * no promise about future payloads. Every reading of it is tagged with this
 * revision identifier so that when the payload drifts, the drift is
 * localised to `combatant-info.ts` and to this name.
 */
export const WCL_GEAR_UI_SEMANTICS_REVISION = "WCL_COMBATANT_INFO_GEAR_UI_SEMANTICS_2026_09_17";

/** Why a present optional gear field could not be read. Never collapsed to "none". */
export type GearFieldUnknownReason = "NULL_VALUE" | "ZERO_VALUE" | "MALFORMED_VALUE";

/**
 * One optional identity on a gear row, normalised ONCE at the adapter
 * boundary. Consumers read this and never the raw key.
 *
 *     KNOWN        present with a valid identity
 *     KNOWN_NONE   the key was OMITTED on a valid row: none, under the dated contract
 *     UNKNOWN      present but null, zero or malformed: nothing is claimed
 */
export type GearEnchantState =
  | { readonly state: "KNOWN"; readonly enchantId: number }
  | { readonly state: "KNOWN_NONE"; readonly contract: typeof WCL_GEAR_UI_SEMANTICS_REVISION }
  | { readonly state: "UNKNOWN"; readonly reason: GearFieldUnknownReason };

/**
 * The installed gems of a gear row. `KNOWN` with an empty list is an OBSERVED
 * empty array; `KNOWN_NONE` is an omitted key under the dated contract. Both
 * mean no installed gems; neither says whether the item has sockets — no
 * field here does, and no consumer may infer it.
 */
export type GearGemsState =
  | { readonly state: "KNOWN"; readonly gemIds: readonly number[] }
  | { readonly state: "KNOWN_NONE"; readonly contract: typeof WCL_GEAR_UI_SEMANTICS_REVISION }
  | { readonly state: "UNKNOWN"; readonly reason: GearFieldUnknownReason };

export interface GearPiece {
  /** Positional: Warcraft Logs supplies no slot key, so this is the array index. */
  readonly slotIndex: number;
  readonly itemId: number;
  readonly itemLevel: number | null;
  readonly quality: number | null;
  readonly permanentEnchant: GearEnchantState;
  readonly temporaryEnchant: GearEnchantState;
  readonly gems: GearGemsState;
  readonly bonusIds: readonly number[] | null;
  readonly setId: number | null;
}

export interface TalentTreeEntry {
  readonly id: number;
  readonly rank: number | null;
  readonly nodeId: number | null;
}

/**
 * Factual gear and build observation from a `combatantinfo` event.
 *
 * Deliberately NOT read: the raw `talents` array. A live capture showed
 * `talents: []` on a fully-talented player whose `talentTree` was populated, so
 * reading `talents` would manufacture "this player had no talents" — exactly
 * the missing-data-becomes-negative-evidence failure this project exists to
 * prevent.
 *
 * Nothing here is a verdict: no BIS, no quality judgement, no optimality.
 */
export interface CombatantSnapshot {
  readonly actorId: number;
  readonly specId: number | null;
  readonly gear: readonly GearPiece[];
  /**
   * Array positions of the raw `gear` collection that were not a readable row
   * (not an object, or no integer `id`). Such a row is ABSENT from `gear` and
   * is UNKNOWN: a consumer that needs the whole equipment must refuse while
   * this is non-empty.
   */
  readonly malformedGearRows: readonly number[];
  readonly talentTree: readonly TalentTreeEntry[];
}

export interface CombatantInfoEvent extends CombatEventBase {
  readonly kind: "COMBATANT_INFO";
  readonly snapshot: CombatantSnapshot;
}

/**
 * A raw type we recognise by name but deliberately decode no family fields for.
 *
 * Recognition still requires committed evidence for the exact type string —
 * envelope-only handling is not an evidence exemption. The difference from
 * `UnsupportedEvent` is a claim we are making: we assert this type exists and
 * that we are choosing not to read its payload, rather than admitting we do not
 * know what it is.
 */
export interface EnvelopeOnlyEvent extends CombatEventBase {
  readonly kind: "ENVELOPE_ONLY";
}

/**
 * A recognised event type whose family-specific fields could not be read.
 *
 * Distinct from `UnsupportedEvent` on purpose, and the asymmetry matters: an
 * unknown TYPE is expected churn in a non-frozen API and costs us nothing,
 * whereas a malformed KNOWN event means our contract broke and must degrade
 * that category's coverage.
 *
 * It keeps a real envelope, so the damage is localisable to a known instant —
 * which is exactly what a `MalformedRawObservation` cannot offer.
 */
export interface MalformedFamilyEvent extends CombatEventBase {
  readonly kind: "MALFORMED_FAMILY";
  readonly claimedType: string;
  readonly problems: readonly FieldProblem[];
}

/**
 * A valid envelope carrying a type we do not claim to support.
 *
 * Preserved and counted, never dropped. Warcraft Logs can add an event type
 * without notice, and an otherwise usable fight must not fail because it did.
 */
export interface UnsupportedEvent extends CombatEventBase {
  readonly kind: "UNSUPPORTED_TYPE";
  readonly reason: "UNKNOWN_EVENT_TYPE";
}

export type CombatEvent =
  | CastEvent
  | AuraEvent
  | DamageEvent
  | HealingEvent
  | AbsorbEvent
  | ResourceChangeEvent
  | SummonEvent
  | CombatantInfoEvent
  | EnvelopeOnlyEvent
  | UnsupportedEvent
  | MalformedFamilyEvent;

export type FieldProblemKind = "MISSING" | "WRONG_TYPE" | "OUT_OF_RANGE";

export interface FieldProblem {
  readonly field: string;
  readonly problem: FieldProblemKind;
}

/**
 * A raw observation whose common envelope could not be established.
 *
 * Lives OUTSIDE `events[]`, because without a timestamp it has no position in a
 * chronological sequence and cannot honestly be placed in one.
 *
 * Both optional fields appear only when they actually decoded. There is no
 * default timestamp, no default type, no placeholder actor — the entire reason
 * this type exists separately is so nothing has to be invented.
 */
export interface MalformedRawObservation {
  readonly position: RetrievalPosition;
  readonly problems: readonly FieldProblem[];
  readonly rawType?: string;
  readonly reportTimeMs?: number;
}
