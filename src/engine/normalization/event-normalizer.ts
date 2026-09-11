/**
 * The raw -> normalized boundary.
 *
 * Raw Warcraft Logs JSON terminates here. Above this module nothing sees
 * `unknown`, a page, or a GraphQL shape.
 *
 * Pages are accepted one at a time, in retrieval order, and released by the
 * caller immediately afterwards, so peak memory stays at O(one page) +
 * O(normalized fight).
 *
 * Decoding is OPEN-WORLD for unknown extra fields (Warcraft Logs may add keys
 * without notice, and that must not break a usable fight) and STRICT for
 * required fields (a renamed key must surface as a defect, not as silence).
 */

import type { EvidenceCategory } from "../../wcl/evidence-capability.js";
import type { RawEventPage } from "../../wcl/retrieval-types.js";
import { isFiniteNumber, isRecord, isSafeInteger, isUsableString } from "../../wcl/decode.js";
import { rangeContains, type TimeRangeMs } from "../evidence/coverage.js";
import type { EvidenceLocator, RetrievalPosition } from "../evidence/locator.js";
import type {
  ActorAbsence,
  ActorRef,
  AttachedResourceObservation,
  ClassResourceObservation,
  CombatEvent,
  CombatEventBase,
  FieldProblem,
  MalformedRawObservation,
  ResourcePosition,
  SourceRef,
  TargetRef,
} from "./normalized-events.js";
import { sourceRef, targetRef } from "./normalized-events.js";
import {
  ENVELOPE_FIELDS,
  NO_ACTOR_SENTINEL,
  RESOURCE_ACTOR_SOURCE,
  RESOURCE_ACTOR_TARGET,
  RESOURCE_FIELDS,
  type DirectionFieldNames,
} from "./raw-event-fields.js";
import type { SupportedTypeContract } from "./supported-families.js";

export interface NormalizationContext {
  readonly fightStartTimeMs: number;
  readonly requestedRange: TimeRangeMs;
  /** Raw type -> contract. Only evidence-backed types appear. */
  readonly contracts: ReadonlyMap<string, SupportedTypeContract>;
  /**
   * Raw key names for source/target/ability.
   *
   * `null` records direction as ABSENT rather than guessing it. It is never
   * inferred from which query returned the event.
   */
  readonly directionFields: DirectionFieldNames | null;
}

export interface NormalizationOutput {
  readonly events: readonly CombatEvent[];
  readonly malformedObservations: readonly MalformedRawObservation[];
  readonly unsupportedTypeCounts: ReadonlyMap<string, number>;
  readonly malformedFamilyCountsByType: ReadonlyMap<string, number>;
  /** Observations whose envelope could not be established at all. */
  readonly malformedEnvelopeCount: number;
  /** Categories whose coverage must degrade to PARTIAL. */
  readonly degradedCategories: ReadonlySet<EvidenceCategory>;
  /**
   * Streams that produced an untyped, untimed observation.
   *
   * Such an observation could belong to any family, so every category fed by
   * that stream degrades. Harsh and correct — the alternative is deciding it
   * probably did not matter.
   */
  readonly streamsWithUntypedDefects: ReadonlySet<string>;
}

export interface Normalizer {
  accept(page: RawEventPage): void;
  finish(): NormalizationOutput;
}

function increment(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

interface ActorSideReading {
  readonly actorId: number | null;
  readonly instanceId: number | null;
  readonly absence: ActorAbsence | null;
}

function readOptionalInteger(raw: Record<string, unknown>, key: string): number | null {
  const value = raw[key];
  return isSafeInteger(value) ? value : null;
}

function readOptionalNumber(raw: Record<string, unknown>, key: string): number | null {
  const value = raw[key];
  return isFiniteNumber(value) ? value : null;
}

/**
 * Reads one side of an event without ever inventing an actor.
 *
 * Three absences are distinguished and none of them produces a reference:
 *
 * - the key was missing
 * - the key held the verified `-1` no-actor sentinel
 * - the key held something no actor could be
 *
 * Only `-1` carries the sentinel's meaning. Other negative values are recorded
 * as unusable rather than being folded into it, because no evidence supports
 * generalising the sentinel.
 */
function readActorSide(raw: Record<string, unknown>, idKey: string, instanceKey: string): ActorSideReading {
  if (!(idKey in raw)) {
    return { actorId: null, instanceId: null, absence: "NOT_SUPPLIED" };
  }
  const value = raw[idKey];
  if (value === NO_ACTOR_SENTINEL) {
    return { actorId: null, instanceId: null, absence: "NO_ACTOR_SENTINEL" };
  }
  if (!isSafeInteger(value) || value < 0) {
    return { actorId: null, instanceId: null, absence: "UNUSABLE_VALUE" };
  }
  return { actorId: value, instanceId: readOptionalInteger(raw, instanceKey), absence: null };
}

function readClassResources(value: unknown): readonly ClassResourceObservation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const resources: ClassResourceObservation[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const resourceType = readOptionalInteger(entry, "type");
    const amount = readOptionalNumber(entry, "amount");
    if (resourceType === null || amount === null) {
      continue;
    }
    resources.push({
      resourceType,
      amount,
      max: readOptionalNumber(entry, "max"),
      cost: readOptionalNumber(entry, "cost"),
    });
  }
  return resources;
}

function readPosition(raw: Record<string, unknown>): ResourcePosition | null {
  const x = readOptionalNumber(raw, RESOURCE_FIELDS.x);
  const y = readOptionalNumber(raw, RESOURCE_FIELDS.y);
  if (x === null || y === null) {
    return null;
  }
  return {
    x,
    y,
    facing: readOptionalNumber(raw, RESOURCE_FIELDS.facing),
    mapId: readOptionalInteger(raw, RESOURCE_FIELDS.mapId),
  };
}

/**
 * Reads the flattened resource snapshot, if one is attached.
 *
 * Gated entirely on `resourceActor`. That gate is load-bearing: `armor`,
 * `absorb` and `avoidance` also appear as unrelated top-level keys on
 * `combatantinfo` and on some aura events, and reading them unconditionally
 * would manufacture resource snapshots out of unrelated fields.
 *
 * The side comes from the discriminator, never from an assumption that a
 * snapshot belongs to the event's source.
 */
function readAttachedResources(
  raw: Record<string, unknown>,
  source: SourceRef | null,
  target: TargetRef | null,
): AttachedResourceObservation | null {
  const discriminator = raw[RESOURCE_FIELDS.resourceActor];
  if (discriminator !== RESOURCE_ACTOR_SOURCE && discriminator !== RESOURCE_ACTOR_TARGET) {
    return null;
  }
  const side = discriminator === RESOURCE_ACTOR_SOURCE ? "SOURCE" : "TARGET";
  // When that side has no concrete actor, the snapshot is still a fact; the
  // actor behind it simply was not stated. Nothing is substituted.
  const actor: ActorRef | null = side === "SOURCE" ? source : target;

  return {
    side,
    actor,
    classResources: readClassResources(raw[RESOURCE_FIELDS.classResources]),
    hitPoints: readOptionalNumber(raw, RESOURCE_FIELDS.hitPoints),
    maxHitPoints: readOptionalNumber(raw, RESOURCE_FIELDS.maxHitPoints),
    attackPower: readOptionalNumber(raw, RESOURCE_FIELDS.attackPower),
    spellPower: readOptionalNumber(raw, RESOURCE_FIELDS.spellPower),
    armor: readOptionalNumber(raw, RESOURCE_FIELDS.armor),
    absorb: readOptionalNumber(raw, RESOURCE_FIELDS.absorb),
    itemLevel: readOptionalNumber(raw, RESOURCE_FIELDS.itemLevel),
    position: readPosition(raw),
  };
}

export function createNormalizer(context: NormalizationContext): Normalizer {
  const events: CombatEvent[] = [];
  const malformedObservations: MalformedRawObservation[] = [];
  const unsupportedTypeCounts = new Map<string, number>();
  const malformedFamilyCountsByType = new Map<string, number>();
  const degradedCategories = new Set<EvidenceCategory>();
  const streamsWithUntypedDefects = new Set<string>();
  let malformedEnvelopeCount = 0;
  let ingestionOrdinal = 0;

  function recordMalformedObservation(
    position: RetrievalPosition,
    problems: readonly FieldProblem[],
    decoded: { readonly rawType?: string; readonly reportTimeMs?: number },
  ): void {
    malformedEnvelopeCount += 1;
    malformedObservations.push({
      position,
      problems,
      ...(decoded.rawType === undefined ? {} : { rawType: decoded.rawType }),
      ...(decoded.reportTimeMs === undefined ? {} : { reportTimeMs: decoded.reportTimeMs }),
    });

    // A type we recognise pins the defect to one category. Anything else could
    // be any family, so the whole stream's categories are affected.
    const contract = decoded.rawType === undefined ? undefined : context.contracts.get(decoded.rawType);
    if (contract === undefined) {
      streamsWithUntypedDefects.add(position.streamId);
      return;
    }
    degradedCategories.add(contract.category);
  }

  function normalizeEvent(raw: unknown, position: RetrievalPosition): void {
    if (!isRecord(raw)) {
      recordMalformedObservation(position, [{ field: "<event>", problem: "WRONG_TYPE" }], {});
      return;
    }

    const rawTimestamp = raw[ENVELOPE_FIELDS.timestamp];
    const rawTypeValue = raw[ENVELOPE_FIELDS.type];
    const timestampOk = isFiniteNumber(rawTimestamp);
    const typeOk = isUsableString(rawTypeValue);

    if (!timestampOk || !typeOk) {
      // The envelope could not be established, so this is NOT an event. It gets
      // a retrieval position and the fields that genuinely decoded — and no
      // fabricated timestamp, type, source or target.
      const problems: FieldProblem[] = [];
      if (!timestampOk) {
        problems.push({
          field: ENVELOPE_FIELDS.timestamp,
          problem: ENVELOPE_FIELDS.timestamp in raw ? "WRONG_TYPE" : "MISSING",
        });
      }
      if (!typeOk) {
        problems.push({
          field: ENVELOPE_FIELDS.type,
          problem: ENVELOPE_FIELDS.type in raw ? "WRONG_TYPE" : "MISSING",
        });
      }
      recordMalformedObservation(position, problems, {
        ...(typeOk ? { rawType: rawTypeValue } : {}),
        ...(timestampOk ? { reportTimeMs: rawTimestamp } : {}),
      });
      return;
    }

    const reportTimeMs = rawTimestamp;
    const rawType = rawTypeValue;

    let source: SourceRef | null = null;
    let target: TargetRef | null = null;
    let sourceAbsence: ActorAbsence | null = "NOT_SUPPLIED";
    let targetAbsence: ActorAbsence | null = "NOT_SUPPLIED";
    let abilityGameId: number | null = null;
    let attachedResources: AttachedResourceObservation | null = null;

    const fields = context.directionFields;
    if (fields !== null) {
      const sourceReading = readActorSide(raw, fields.sourceId, fields.sourceInstance);
      const targetReading = readActorSide(raw, fields.targetId, fields.targetInstance);
      source =
        sourceReading.actorId === null ? null : sourceRef(sourceReading.actorId, sourceReading.instanceId);
      target =
        targetReading.actorId === null ? null : targetRef(targetReading.actorId, targetReading.instanceId);
      sourceAbsence = sourceReading.absence;
      targetAbsence = targetReading.absence;
      abilityGameId = readOptionalInteger(raw, fields.abilityGameId);
      attachedResources = readAttachedResources(raw, source, target);
    }

    const locator: EvidenceLocator = { ...position, rawType, reportTimeMs };
    const base: CombatEventBase = {
      locator,
      ingestionOrdinal: position.ingestionOrdinal,
      reportTimeMs,
      // Preserved alongside, never instead of, the report-relative timestamp.
      fightTimeMs: reportTimeMs - context.fightStartTimeMs,
      rawType,
      source,
      target,
      sourceAbsence,
      targetAbsence,
      abilityGameId,
      attachedResources,
      // Kept and flagged. Clamping would fabricate precision; dropping would
      // fabricate absence. The requested range is closed at the top, so an
      // event at exactly `endTime` is inside it.
      outsideRequestedRange: !rangeContains(context.requestedRange, reportTimeMs),
    };

    const contract = context.contracts.get(rawType);
    if (contract === undefined) {
      increment(unsupportedTypeCounts, rawType);
      events.push({ ...base, kind: "UNSUPPORTED_TYPE", reason: "UNKNOWN_EVENT_TYPE" });
      return;
    }

    if (contract.handling === "ENVELOPE_ONLY") {
      events.push({ ...base, kind: "ENVELOPE_ONLY" });
      return;
    }

    const decoded = contract.decode(base, raw);
    if (decoded.ok) {
      events.push(decoded.event);
      return;
    }

    // A recognised type with bad family fields is NOT an unknown type. Our
    // contract broke, so the category degrades — but the envelope is valid, so
    // the defect stays localisable to a known instant.
    increment(malformedFamilyCountsByType, rawType);
    degradedCategories.add(contract.category);
    events.push({ ...base, kind: "MALFORMED_FAMILY", claimedType: rawType, problems: decoded.problems });
  }

  return {
    accept(page: RawEventPage): void {
      page.events.forEach((raw, indexInPage) => {
        normalizeEvent(raw, {
          streamId: page.streamId,
          pageOrdinal: page.pageOrdinal,
          indexInPage,
          ingestionOrdinal: ingestionOrdinal,
        });
        ingestionOrdinal += 1;
      });
    },
    finish(): NormalizationOutput {
      return {
        events,
        malformedObservations,
        unsupportedTypeCounts,
        malformedFamilyCountsByType,
        malformedEnvelopeCount,
        degradedCategories,
        streamsWithUntypedDefects,
      };
    },
  };
}
