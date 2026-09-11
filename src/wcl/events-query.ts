/**
 * The event retrieval query and its paginator decoder.
 *
 * Two query documents exist rather than one with a nullable `hostilityType`
 * variable, because passing an explicit `null` for an optional enum argument is
 * not reliably the same as omitting it. Probe question P1 asks what omitting it
 * actually returns; until that is answered, "omitted" must genuinely mean
 * omitted.
 *
 * `dataType: All` is written as a literal in the document, not passed as a
 * variable. It is a decision, not a parameter.
 */

import { isFiniteNumber, isRecord, readArray, readRecord } from "./decode.js";
import type { DecodeOutcome } from "./graphql-client.js";
import { HOSTILITY_TYPE_VALUES, type EventRetrievalPlan, type HostilitySelector } from "./retrieval-plan.js";

const PAGINATOR_SELECTION = `{
        data
        nextPageTimestamp
      }`;

const EVENT_ARGUMENTS = `fightIDs: $fightIDs
        startTime: $startTime
        endTime: $endTime
        dataType: All
        limit: $limit
        includeResources: $includeResources
        translate: true
        useActorIDs: true
        useAbilityIDs: true`;

/**
 * Deliberately absent arguments: sourceID, targetID, sourceInstanceID,
 * targetInstanceID, sourceClass, targetClass, filterExpression, killType,
 * wipeCutoff, death, viewOptions, and every aura filter.
 *
 * Each of those silently shrinks the result set in a way that is
 * indistinguishable from "nothing happened". A contract test asserts none of
 * them appears in either document.
 */
export const EVENTS_QUERY = `query CoachFightEvents($code: String!, $fightIDs: [Int], $startTime: Float!, $endTime: Float!, $limit: Int!, $includeResources: Boolean!) {
  rateLimitData {
    limitPerHour
    pointsSpentThisHour
    pointsResetIn
  }
  reportData {
    report(code: $code, allowUnlisted: true) {
      events(
        ${EVENT_ARGUMENTS}
      ) ${PAGINATOR_SELECTION}
    }
  }
}`;

export const EVENTS_QUERY_WITH_HOSTILITY = `query CoachFightEventsByHostility($code: String!, $fightIDs: [Int], $startTime: Float!, $endTime: Float!, $limit: Int!, $includeResources: Boolean!, $hostilityType: HostilityType!) {
  rateLimitData {
    limitPerHour
    pointsSpentThisHour
    pointsResetIn
  }
  reportData {
    report(code: $code, allowUnlisted: true) {
      events(
        ${EVENT_ARGUMENTS}
        hostilityType: $hostilityType
      ) ${PAGINATOR_SELECTION}
    }
  }
}`;

export function eventsQueryFor(hostility: HostilitySelector): string {
  return hostility === "UNSPECIFIED" ? EVENTS_QUERY : EVENTS_QUERY_WITH_HOSTILITY;
}

/**
 * Builds the variables for one page.
 *
 * `startTimeMs` is the cursor for pages after the first, passed through exactly
 * as Warcraft Logs supplied it.
 */
export function eventsVariables(
  plan: EventRetrievalPlan,
  hostility: HostilitySelector,
  startTimeMs: number,
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    code: plan.reportCode,
    fightIDs: [plan.fightId],
    startTime: startTimeMs,
    endTime: plan.endTimeMs,
    limit: plan.limit,
    includeResources: plan.includeResources,
  };
  if (hostility === "UNSPECIFIED") {
    return base;
  }
  return { ...base, hostilityType: HOSTILITY_TYPE_VALUES[hostility] };
}

/**
 * What one paginator response turned out to be.
 *
 * `MALFORMED_PAGINATOR` is distinct from a transport-level decode failure: the
 * envelope arrived and was shaped like a response, but the paginator itself was
 * unusable. That distinction is what lets the caller record MALFORMED_PAGE
 * rather than a generic upstream-invalid failure.
 */
export type RawPaginatorPayload =
  | { readonly kind: "REPORT_NOT_ACCESSIBLE" }
  | { readonly kind: "MALFORMED_PAGINATOR" }
  | {
      readonly kind: "PAGE";
      readonly events: readonly unknown[];
      readonly nextPageTimestamp: number | null;
    };

/**
 * Decodes the paginator envelope only.
 *
 * Individual events stay `unknown`. They are interpreted in
 * `src/engine/normalization/`, where a single malformed event must not fail a
 * page that is otherwise usable.
 *
 * `nextPageTimestamp` is read as a finite number or an explicit null. Warcraft
 * Logs types it `Float`, so no integrality is assumed or enforced.
 */
export function decodeEventPage(data: unknown): DecodeOutcome<RawPaginatorPayload> {
  if (!isRecord(data)) {
    return { ok: false };
  }

  const reportData = readRecord(data, "reportData");
  if (reportData === undefined || !("report" in reportData)) {
    return { ok: false };
  }

  const report = reportData["report"];
  if (report === null) {
    return { ok: true, value: { kind: "REPORT_NOT_ACCESSIBLE" } };
  }
  if (!isRecord(report)) {
    return { ok: false };
  }

  if (!("events" in report)) {
    return { ok: false };
  }
  const paginator = report["events"];
  if (paginator === null || !isRecord(paginator)) {
    return { ok: true, value: { kind: "MALFORMED_PAGINATOR" } };
  }

  // `data: JSON` is nullable upstream. A null or non-array payload is a
  // malformed page, never an empty one — "we could not read your events" must
  // not become "you produced no events".
  const events = readArray(paginator, "data");
  if (events === undefined) {
    return { ok: true, value: { kind: "MALFORMED_PAGINATOR" } };
  }

  const rawCursor = "nextPageTimestamp" in paginator ? paginator["nextPageTimestamp"] : null;
  if (rawCursor !== null && rawCursor !== undefined && !isFiniteNumber(rawCursor)) {
    return { ok: true, value: { kind: "MALFORMED_PAGINATOR" } };
  }
  const nextPageTimestamp = isFiniteNumber(rawCursor) ? rawCursor : null;

  return { ok: true, value: { kind: "PAGE", events, nextPageTimestamp } };
}
