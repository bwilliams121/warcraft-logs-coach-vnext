/**
 * Synthetic `CombatFight` construction for M4 state-engine tests.
 *
 * M3 has real committed captures, and tests that establish M3 contracts use
 * them. This builder exists for the state engine's EDGE CASES — ordinal gaps,
 * non-monotonic input, absent coverage, out-of-scope actors — which are
 * situations a capture cannot be relied on to contain and which a fixture
 * should not be doctored to produce.
 *
 * THE DEFAULT IS FAIL-CLOSED. Every evidence category starts UNVERIFIED, which
 * carries no coverage at all, so a default fight can prove that something
 * HAPPENED but never that something did NOT. A test that needs to establish an
 * absence must name the evidence it is relying on:
 *
 *     syntheticFight({ observedCategories: ["CASTS"] })   // precise
 *     fullyObservedFight({ ... })                          // everything observed
 *
 * The alternative — defaulting to OBSERVABLE/COMPLETE — makes perfect evidence
 * the thing a test author gets by forgetting. That is the one default a
 * fail-closed analyzer must not have in its fixtures, because a test written
 * against it passes for the wrong reason and stops protecting anything.
 *
 * Note that `completeness.streams` still reports a retrieved stream while the
 * categories are UNVERIFIED. That combination is not a contradiction — it is
 * the real-world case the architecture is built around: a fully retrieved All
 * stream says nothing about whether Warcraft Logs emits a given category.
 */

import type { EvidenceCategory, CapabilityRecord } from "../../src/wcl/evidence-capability.js";
import { EVIDENCE_CATEGORIES } from "../../src/wcl/evidence-capability.js";
import type { HostilitySelector } from "../../src/wcl/retrieval-plan.js";
import type { IngestionScope } from "../../src/services/ingestion-scope.js";
import { inclusiveRange, type TimeRangeMs } from "../../src/engine/evidence/coverage.js";
import type { EvidenceLocator } from "../../src/engine/evidence/locator.js";
import {
  NORMALIZATION_REVISION,
  type CombatFight,
  type CombatPhase,
  type FightFinality,
} from "../../src/engine/normalization/combat-fight.js";
import type { CategoryEvidence, FightCompleteness } from "../../src/engine/normalization/completeness.js";
import type {
  NormalizedFightCore,
  TalentImportObservation,
} from "../../src/engine/normalization/fight-core.js";
import type { EncounterOutcomeFacts, ZoneMetadata } from "../../src/engine/normalization/encounter-facts.js";
import type { StreamCompleteness } from "../../src/wcl/retrieval-types.js";
import type { CombatActor } from "../../src/engine/normalization/actors.js";
import type { CombatAbility } from "../../src/engine/normalization/abilities.js";
import {
  sourceRef,
  targetRef,
  type ActorAbsence,
  type AttachedResourceObservation,
  type AuraClass,
  type AuraEvent,
  type AuraOperation,
  type CastEvent,
  type CastPhase,
  type ClassResourceObservation,
  type CombatEvent,
  type CombatEventBase,
  type DamageEvent,
  type MalformedRawObservation,
  type ResourceChangeEvent,
  type ResourceSide,
  type SummonEvent,
  type UnsupportedEvent,
} from "../../src/engine/normalization/normalized-events.js";

export const FIGHT_START_MS = 1000;
export const FIGHT_END_MS = 5000;

const SYNTHETIC_CAPABILITY: CapabilityRecord = {
  capability: "OBSERVABLE",
  retrievalSource: "EVENTS_ALL_STREAM",
  evidence: { kind: "SANITIZED_CAPTURE", fixtureId: "synthetic", capturedOn: "2026-09-11" },
  logVersionObserved: 17,
  gameVersionObserved: 1,
};

/** An OBSERVABLE category covering exactly `range`, vouching for `actorScope`. */
export function observableCategory(
  range: TimeRangeMs,
  actorScope: readonly number[] | null = null,
): CategoryEvidence {
  return {
    capability: "OBSERVABLE",
    source: SYNTHETIC_CAPABILITY,
    coverage: {
      state: "COMPLETE",
      reason: "COMPLETED_NORMALLY",
      coveredRanges: [range],
      sourceStreamIds: ["all"],
      actorScope,
    },
  };
}

/** An OBSERVABLE category with real PARTIAL coverage. */
export function partialCategory(
  coveredRanges: readonly TimeRangeMs[],
  actorScope: readonly number[] | null = null,
): CategoryEvidence {
  return {
    capability: "OBSERVABLE",
    source: SYNTHETIC_CAPABILITY,
    coverage: {
      state: "PARTIAL",
      reason: "UPSTREAM_UNAVAILABLE",
      coveredRanges,
      sourceStreamIds: ["all"],
      actorScope,
    },
  };
}

export function absentCategory(actorScope: readonly number[] | null = null): CategoryEvidence {
  return {
    capability: "OBSERVABLE",
    source: SYNTHETIC_CAPABILITY,
    coverage: {
      state: "ABSENT",
      reason: "UPSTREAM_UNAVAILABLE",
      coveredRanges: [],
      sourceStreamIds: ["all"],
      actorScope,
    },
  };
}

export const UNVERIFIED_CATEGORY: CategoryEvidence = { capability: "UNVERIFIED" };

export const NOT_OBSERVABLE_CATEGORY: CategoryEvidence = {
  capability: "NOT_OBSERVABLE",
  source: {
    capability: "NOT_OBSERVABLE",
    retrievalSource: "EVENTS_ALL_STREAM",
    evidence: { kind: "DOCUMENTED_UNSUPPORTED", citation: "synthetic", verifiedOn: "2026-09-11" },
  },
};

// --------------------------------------------------------------------------
// Events
// --------------------------------------------------------------------------

export interface EventOptions {
  readonly ordinal: number;
  readonly reportTimeMs: number;
  readonly rawType?: string | undefined;
  /** `null` means no source. Pair with `sourceAbsence` to say WHY. */
  readonly sourceActorId?: number | null | undefined;
  readonly sourceInstanceId?: number | null | undefined;
  readonly sourceAbsence?: ActorAbsence | undefined;
  readonly targetActorId?: number | null | undefined;
  readonly targetInstanceId?: number | null | undefined;
  readonly targetAbsence?: ActorAbsence | undefined;
  readonly abilityGameId?: number | null | undefined;
  readonly streamId?: string | undefined;
  readonly pageOrdinal?: number | undefined;
  readonly indexInPage?: number | undefined;
  /** An attached resource snapshot, exactly as M3 would have normalized one. */
  readonly attachedResources?: AttachedResourceObservation | null | undefined;
}

export function locatorFor(options: EventOptions, rawType: string): EvidenceLocator {
  return {
    streamId: options.streamId ?? "all",
    pageOrdinal: options.pageOrdinal ?? 0,
    indexInPage: options.indexInPage ?? options.ordinal,
    ingestionOrdinal: options.ordinal,
    rawType,
    reportTimeMs: options.reportTimeMs,
  };
}

function baseEvent(options: EventOptions, defaultRawType: string): CombatEventBase {
  const rawType = options.rawType ?? defaultRawType;
  const sourceActorId = options.sourceActorId ?? null;
  const targetActorId = options.targetActorId ?? null;
  return {
    locator: locatorFor(options, rawType),
    ingestionOrdinal: options.ordinal,
    reportTimeMs: options.reportTimeMs,
    fightTimeMs: options.reportTimeMs - FIGHT_START_MS,
    rawType,
    source: sourceActorId === null ? null : sourceRef(sourceActorId, options.sourceInstanceId ?? null),
    target: targetActorId === null ? null : targetRef(targetActorId, options.targetInstanceId ?? null),
    sourceAbsence: sourceActorId === null ? (options.sourceAbsence ?? "NOT_SUPPLIED") : null,
    targetAbsence: targetActorId === null ? (options.targetAbsence ?? "NOT_SUPPLIED") : null,
    abilityGameId: options.abilityGameId ?? null,
    attachedResources: options.attachedResources ?? null,
    outsideRequestedRange: false,
  };
}

export function castEvent(options: EventOptions & { readonly castPhase: CastPhase }): CastEvent {
  return {
    ...baseEvent(options, options.castPhase === "BEGIN" ? "begincast" : "cast"),
    kind: "CAST",
    castPhase: options.castPhase,
    isMelee: null,
  };
}

export function damageEvent(options: EventOptions & { readonly amount?: number | undefined }): DamageEvent {
  return {
    ...baseEvent(options, "damage"),
    kind: "DAMAGE",
    amount: options.amount ?? 100,
    unmitigatedAmount: null,
    mitigatedAmount: null,
    absorbedAmount: null,
    blockedAmount: null,
    hitType: null,
    isAoE: null,
    isTick: false,
    supportActorId: null,
    subtractsFromSupportedActor: null,
  };
}

/**
 * An aura transition.
 *
 * `rawType` defaults to the string Warcraft Logs would actually have sent for
 * the requested operation/class/stack combination, so a synthetic event's
 * locator reads like a real one.
 */
export function auraEvent(
  options: EventOptions & {
    readonly operation: AuraOperation;
    readonly auraClass: AuraClass;
    readonly isStackChange?: boolean | undefined;
    readonly stacks?: number | null | undefined;
  },
): AuraEvent {
  const isStackChange = options.isStackChange ?? false;
  const verb =
    options.operation === "APPLIED" ? "apply" : options.operation === "REFRESHED" ? "refresh" : "remove";
  const noun = options.auraClass === "BUFF" ? "buff" : "debuff";
  return {
    ...baseEvent(options, `${verb}${noun}${isStackChange ? "stack" : ""}`),
    kind: "AURA",
    operation: options.operation,
    auraClass: options.auraClass,
    isStackChange,
    stacks: options.stacks ?? null,
    absorbAmount: null,
  };
}

/** `summon`. Source summoned target; no attribution is implied by M3 or here. */
export function summonEvent(options: EventOptions): SummonEvent {
  return { ...baseEvent(options, "summon"), kind: "SUMMON" };
}

export function resourceChangeEvent(
  options: EventOptions & {
    readonly resourceType: number;
    readonly resourceChange: number;
    readonly otherResourceChange?: number | null | undefined;
    readonly maxResourceAmount?: number | null | undefined;
    readonly reportedWasteAmount?: number | null | undefined;
  },
): ResourceChangeEvent {
  return {
    ...baseEvent(options, "resourcechange"),
    kind: "RESOURCE_CHANGE",
    resourceType: options.resourceType,
    resourceChange: options.resourceChange,
    otherResourceChange: options.otherResourceChange ?? null,
    maxResourceAmount: options.maxResourceAmount ?? null,
    reportedWasteAmount: options.reportedWasteAmount ?? null,
  };
}

/**
 * An attached resource snapshot.
 *
 * `side` and `actor` are supplied separately and deliberately: M3 takes the side
 * from the verified `resourceActor` discriminator and binds the actor on THAT
 * side, so a test can construct a target-side snapshot on a source-side actor
 * only by saying so explicitly.
 */
export function attachedResources(options: {
  readonly side: ResourceSide;
  readonly actorId: number | null;
  readonly instanceId?: number | null | undefined;
  readonly classResources?: readonly ClassResourceObservation[] | undefined;
  readonly hitPoints?: number | null | undefined;
  readonly maxHitPoints?: number | null | undefined;
  readonly absorb?: number | null | undefined;
}): AttachedResourceObservation {
  return {
    side: options.side,
    actor:
      options.actorId === null ? null : { actorId: options.actorId, instanceId: options.instanceId ?? null },
    classResources: options.classResources ?? [],
    hitPoints: options.hitPoints ?? null,
    maxHitPoints: options.maxHitPoints ?? null,
    attackPower: null,
    spellPower: null,
    armor: null,
    absorb: options.absorb ?? null,
    itemLevel: null,
    position: null,
  };
}

export function classResource(
  resourceType: number,
  amount: number,
  extra: { readonly max?: number | null | undefined; readonly cost?: number | null | undefined } = {},
): ClassResourceObservation {
  return {
    resourceType,
    amount,
    max: extra.max ?? null,
    cost: extra.cost ?? null,
  };
}

export function unsupportedEvent(options: EventOptions): UnsupportedEvent {
  return {
    ...baseEvent(options, "somethingnew"),
    kind: "UNSUPPORTED_TYPE",
    reason: "UNKNOWN_EVENT_TYPE",
  };
}

export function malformedObservation(
  ordinal: number,
  extra: { readonly rawType?: string | undefined; readonly streamId?: string | undefined } = {},
): MalformedRawObservation {
  return {
    position: {
      streamId: extra.streamId ?? "all",
      pageOrdinal: 0,
      indexInPage: ordinal,
      ingestionOrdinal: ordinal,
    },
    problems: [{ field: "timestamp", problem: "MISSING" }],
    ...(extra.rawType === undefined ? {} : { rawType: extra.rawType }),
  };
}

/**
 * One phase transition.
 *
 * `isIntermission` must be passed explicitly, including `null`. There is no
 * default, because a default would be the exact tri-state collapse the phase
 * layer exists to prevent — a forgotten argument must not silently mean "not an
 * intermission".
 */
export function phase(options: {
  readonly phaseId: number;
  readonly startTimeMs: number;
  readonly isIntermission: boolean | null;
  readonly name?: string | null | undefined;
  readonly fightStartTimeMs?: number | undefined;
}): CombatPhase {
  return {
    phaseId: options.phaseId,
    name: options.name ?? null,
    isIntermission: options.isIntermission,
    startTimeMs: options.startTimeMs,
    fightTimeMs: options.startTimeMs - (options.fightStartTimeMs ?? FIGHT_START_MS),
  };
}

// --------------------------------------------------------------------------
// Fight
// --------------------------------------------------------------------------

export interface SyntheticFightOptions {
  readonly events?: readonly CombatEvent[] | undefined;
  readonly malformedObservations?: readonly MalformedRawObservation[] | undefined;
  readonly startTimeMs?: number | undefined;
  readonly endTimeMs?: number | undefined;
  readonly focusActorId?: number | undefined;
  readonly scope?: IngestionScope | undefined;
  readonly hostilityStreams?: readonly HostilitySelector[] | undefined;
  readonly actors?: ReadonlyMap<number, CombatActor> | undefined;
  readonly abilities?: ReadonlyMap<number, CombatAbility> | undefined;
  readonly phases?: readonly CombatPhase[] | undefined;
  /** Whether the FIGHT finished. Entirely separate from whether we retrieved it. */
  readonly finality?: FightFinality | undefined;
  /**
   * Categories to make OBSERVABLE with COMPLETE coverage over the fight.
   *
   * Opt-in, and empty by default. Naming a category here is a test saying "this
   * is the evidence my assertion rests on", which is exactly what an absence
   * claim has to be explicit about.
   */
  readonly observedCategories?: readonly EvidenceCategory[] | undefined;
  /** Exact per-category evidence. Takes precedence over `observedCategories`. */
  readonly categories?: Partial<Record<EvidenceCategory, CategoryEvidence>> | undefined;
  /** Actor scope applied to every category built from `observedCategories`. `null` means all actors. */
  readonly actorScope?: readonly number[] | null | undefined;
}

export function syntheticFight(options: SyntheticFightOptions = {}): CombatFight {
  const startTimeMs = options.startTimeMs ?? FIGHT_START_MS;
  const endTimeMs = options.endTimeMs ?? FIGHT_END_MS;
  const range = inclusiveRange(startTimeMs, endTimeMs);
  const actorScope = options.actorScope === undefined ? null : options.actorScope;
  const hostilityStreams = options.hostilityStreams ?? (["UNSPECIFIED"] as readonly HostilitySelector[]);
  const finality: FightFinality = options.finality ?? "COMPLETED";

  const observed = new Set(options.observedCategories ?? []);
  const categories = {} as Record<EvidenceCategory, CategoryEvidence>;
  for (const category of EVIDENCE_CATEGORIES) {
    const exact = options.categories?.[category];
    if (exact !== undefined) {
      categories[category] = exact;
      continue;
    }
    // Unnamed categories stay UNVERIFIED. Nothing is granted by omission.
    categories[category] = observed.has(category)
      ? observableCategory(range, actorScope)
      : UNVERIFIED_CATEGORY;
  }

  const completeness: FightCompleteness = {
    streams: [
      {
        streamId: "all",
        state: "COMPLETE",
        reason: "COMPLETED_NORMALLY",
        requestedRange: range,
        coveredRanges: [range],
        pagesRequested: 1,
        pagesRetrieved: 1,
        eventsRetrieved: options.events?.length ?? 0,
      },
    ],
    categories,
  };

  return {
    provenance: {
      // The real constant, not a copy. A synthetic fight stands in for a
      // retrieved one, and a hand-written revision here would keep claiming an
      // old model shape after the model changed.
      normalizationRevision: NORMALIZATION_REVISION,
      reportCode: "aBcDeFgH12345678",
      reportRevision: 1,
      reportStartTimeUnixMs: 1_700_000_000_000,
      fightId: 6,
      logVersion: 17,
      gameVersion: 1,
      retrievedAtUnixMs: 1_700_000_900_000,
      plan: {
        dataType: "All",
        limit: 5000,
        includeResources: false,
        hostility: hostilityStreams,
        translate: true,
        useActorIDs: true,
        useAbilityIDs: true,
        requestedStartTimeMs: startTimeMs,
        requestedEndTimeMs: endTimeMs,
      },
      streams: [],
      source: "WARCRAFT_LOGS_V2_CLIENT",
      unsupportedEventTypes: new Map(),
      malformedEventTypes: new Map(),
      malformedEnvelopeCount: options.malformedObservations?.length ?? 0,
      hostilityStreams,
    },
    breadth: {
      scope: options.scope ?? "PLAYER_CONTEXT",
      focusActorIds: [options.focusActorId ?? 5],
      friendlyActorsInScope: [],
    },
    completeness,
    report: {
      code: "aBcDeFgH12345678",
      revision: 1,
      startTimeUnixMs: 1_700_000_000_000,
      endTimeUnixMs: 1_700_000_900_000,
    },
    data: { logVersion: 17, gameVersion: 1 },
    fight: {
      id: 6,
      name: "Test Boss",
      encounterId: 2900,
      difficulty: 5,
      size: 20,
      kill: true,
      startTimeMs,
      endTimeMs,
      durationMs: endTimeMs - startTimeMs,
      finality,
      // Kept consistent with the mapping M3 uses, so a test cannot construct a
      // fight whose raw flag contradicts its finality.
      inProgressRaw: finality === "UNKNOWN" ? null : finality === "IN_PROGRESS",
    },
    actors: options.actors ?? new Map(),
    abilities: options.abilities ?? new Map(),
    talentImportCode: null,
    phases: options.phases ?? [],
    events: options.events ?? [],
    malformedObservations: options.malformedObservations ?? [],
  };
}

// --------------------------------------------------------------------------
// Actor-independent core
// --------------------------------------------------------------------------

export interface SyntheticCoreOptions {
  readonly events?: readonly CombatEvent[] | undefined;
  readonly malformedObservations?: readonly MalformedRawObservation[] | undefined;
  readonly startTimeMs?: number | undefined;
  readonly endTimeMs?: number | undefined;
  readonly actors?: ReadonlyMap<number, CombatActor> | undefined;
  readonly abilities?: ReadonlyMap<number, CombatAbility> | undefined;
  readonly phases?: readonly CombatPhase[] | undefined;
  /** `ReportFight.friendlyPlayers`. Drives which actors count as ally raid state. */
  readonly friendlyPlayers?: readonly number[] | undefined;
  /** The one actor `talentImportCode(actorID:)` was requested for. */
  readonly talentImport?: TalentImportObservation | undefined;
  /** M8-C pull-level context. Defaults to "Warcraft Logs supplied nothing". */
  readonly encounterOutcome?: EncounterOutcomeFacts | undefined;
  /** M8-C report-level context. Defaults to no zone. */
  readonly zone?: ZoneMetadata | undefined;
}

/**
 * Every outcome fact unresolved.
 *
 * The honest default for a synthetic core: a test that has not said what
 * Warcraft Logs reported is a test where Warcraft Logs reported nothing. Note
 * that no production code path can produce this by defaulting — `normalizeEncounterOutcome`
 * always reads the payload.
 */
export const NO_ENCOUNTER_OUTCOME_FACTS: EncounterOutcomeFacts = {
  lastPhase: null,
  lastPhaseAsAbsoluteIndex: null,
  lastPhaseIsIntermission: null,
  bossPercentageRaw: null,
  fightPercentageRaw: null,
  wipeCalledReportTimeMs: null,
};

/**
 * A synthetic `NormalizedFightCore`.
 *
 * NOTE WHAT IT CANNOT TAKE: `scope`, `focusActorId`, `actorScope`, `categories`.
 * None of those are retrieval facts, so a core has nowhere to put them — which
 * is the property this builder exists to make visible at the call site. Evidence
 * categories are DERIVED by `focusedFightFor` from the real capability registry
 * and the streams below, exactly as production does it, so a test cannot hand
 * itself a capability the registry does not actually grant.
 *
 * Two streams, both COMPLETE over the fight. `all` serves the fight-wide
 * sources; `context:typed:actor` serves the PER-ACTOR typed source and models
 * the one round trip that answered about a single player. That second stream is
 * what lets a test tell "queried this actor and got null" apart from "never
 * queried this actor" — `focusedFightFor` withholds it from every view whose
 * focus actor is not `talentImport.actorId`.
 *
 * This models a fully retrieved fight; tests about partial retrieval belong on
 * `syntheticFight`, which can state a coverage state directly.
 */
export function syntheticFightCore(options: SyntheticCoreOptions = {}): NormalizedFightCore {
  const startTimeMs = options.startTimeMs ?? FIGHT_START_MS;
  const endTimeMs = options.endTimeMs ?? FIGHT_END_MS;
  const range = inclusiveRange(startTimeMs, endTimeMs);
  const hostilityStreams: readonly HostilitySelector[] = ["UNSPECIFIED"];

  const completeStream = (streamId: string, eventsRetrieved: number): StreamCompleteness => ({
    streamId,
    state: "COMPLETE",
    reason: "COMPLETED_NORMALLY",
    requestedRange: range,
    coveredRanges: [range],
    pagesRequested: 1,
    pagesRetrieved: 1,
    eventsRetrieved,
  });

  const streams: readonly StreamCompleteness[] = [
    completeStream("all", options.events?.length ?? 0),
    completeStream("context:typed:actor", 0),
  ];

  return {
    provenance: {
      normalizationRevision: NORMALIZATION_REVISION,
      reportCode: "aBcDeFgH12345678",
      reportRevision: 1,
      reportStartTimeUnixMs: 1_700_000_000_000,
      fightId: 6,
      logVersion: 17,
      gameVersion: 1,
      retrievedAtUnixMs: 1_700_000_900_000,
      plan: {
        dataType: "All",
        limit: 5000,
        includeResources: false,
        hostility: hostilityStreams,
        translate: true,
        useActorIDs: true,
        useAbilityIDs: true,
        requestedStartTimeMs: startTimeMs,
        requestedEndTimeMs: endTimeMs,
      },
      streams: [],
      source: "WARCRAFT_LOGS_V2_CLIENT",
      unsupportedEventTypes: new Map(),
      malformedEventTypes: new Map(),
      malformedEnvelopeCount: options.malformedObservations?.length ?? 0,
      hostilityStreams,
    },
    report: {
      code: "aBcDeFgH12345678",
      revision: 1,
      startTimeUnixMs: 1_700_000_000_000,
      endTimeUnixMs: 1_700_000_900_000,
    },
    data: { logVersion: 17, gameVersion: 1 },
    fight: {
      id: 6,
      name: "Test Boss",
      encounterId: 2900,
      difficulty: 5,
      size: 20,
      kill: true,
      startTimeMs,
      endTimeMs,
      durationMs: endTimeMs - startTimeMs,
      finality: "COMPLETED",
      inProgressRaw: false,
    },
    actors: options.actors ?? new Map(),
    abilities: options.abilities ?? new Map(),
    phases: options.phases ?? [],
    events: options.events ?? [],
    malformedObservations: options.malformedObservations ?? [],
    streams,
    streamIdsBySource: {
      EVENTS_ALL_STREAM: ["all"],
      TYPED_GRAPHQL_FIELD: ["all"],
      TYPED_GRAPHQL_FIELD_PER_ACTOR: ["context:typed:actor"],
      REPORT_MASTER_DATA: ["all"],
    },
    degradedCategories: new Set(),
    streamsWithUntypedDefects: new Set(),
    friendlyPlayers: options.friendlyPlayers ?? [],
    encounterOutcome: options.encounterOutcome ?? NO_ENCOUNTER_OUTCOME_FACTS,
    zone: options.zone ?? null,
    talentImport: options.talentImport ?? { actorId: 5, code: null },
  };
}

/**
 * A fight with every category OBSERVABLE and COMPLETE.
 *
 * For tests whose subject is not the evidence state — index construction,
 * temporal resolution, position arithmetic — but which still need a query to
 * reach its answer. The name is the disclosure: a reader can see at the call
 * site that this test is standing on perfect evidence.
 *
 * Prefer `syntheticFight({ observedCategories: [...] })` when only one category
 * matters. Naming it is more precise, and it keeps the test honest about which
 * evidence it actually depends on.
 */
export function fullyObservedFight(options: SyntheticFightOptions = {}): CombatFight {
  return syntheticFight({
    ...options,
    observedCategories: options.observedCategories ?? EVIDENCE_CATEGORIES,
  });
}
