/**
 * M11-G2: the bounded full-fight OFFENSIVE-EVIDENCE capture of the three
 * comparison fights G1 selected. A capture tool, never an analyzer path: the
 * production retrieval plan still issues one UNFILTERED `dataType: All`
 * stream and nothing in analysis imports this module (layering test).
 *
 * PER FIGHT, AT MOST 1 + maxEventPagesPerFight + 1 REQUESTS
 *
 *   1  FIGHT_CONTEXT_QUERY, the production document unchanged: identity
 *      (Player / DeathKnight / Blood at the focus's friendlySpecs index, a kill
 *      of the expected encounter and difficulty) and the catalog the actor set
 *      is derived from — the focus plus every actor whose WCL `petOwner` is
 *      exactly the focus. Nothing else enters the set.
 *   2+ COMPARISON_EVENTS_QUERY pages over the whole fight: the production
 *      event arguments plus ONE server-side filter, the E2.1 owned-pet slice
 *      predicate verbatim — an event of a retained family whose source OR
 *      target is in the set, or a retained actorless family. Heal, absorb,
 *      drain, dispel, interrupt and resurrect events are never requested.
 *      Pagination follows `nextPageTimestamp`; a fight that has not reached a
 *      terminal page by its page cap STOPS, recorded as truncated.
 *   n  ONE composed table request: the report revision (re-checked), the
 *      raid-wide DamageDone table (G1's ACTUAL_DPS surface) and, over the SAME
 *      fight interval, per-actor Casts / DamageDone / DamageTaken tables for
 *      every actor in the set, the Deaths table, the focus's Buffs and Debuffs
 *      tables, and focus + owned DamageDone over each requested window. These
 *      certify (or fail to certify) the filtered stream per category; a
 *      category whose certificate fails receives no coverage grant (owner
 *      decision, M11-G2).
 *
 * The run refuses before any request if a fight is the subject's report, and
 * there is no rankings, cohort or unfiltered-stream port at all.
 */

import { isRecord, readArray, readInteger, readRecord, readString } from "../decode.js";

export const COMPARISON_CAPTURE_REVISION = "g2-comparison-capture-1";

/** The 22 raw types the E2.1 owned-pet slice retains, in its order. */
export const COMPARISON_EVENT_FAMILIES = [
  "cast",
  "begincast",
  "empowerstart",
  "empowerend",
  "damage",
  "extraattacks",
  "summon",
  "applybuff",
  "applydebuff",
  "applybuffstack",
  "applydebuffstack",
  "refreshbuff",
  "refreshdebuff",
  "removebuff",
  "removedebuff",
  "removebuffstack",
  "removedebuffstack",
  "resourcechange",
  "combatantinfo",
  "encounterstart",
  "encounterend",
  "death",
] as const;

/**
 * The raw types never requested (E2.1's excluded families, plus interrupts).
 * The server filter EXCLUDES these rather than listing the retained ones,
 * because the expression language does not type missed damage as "damage"
 * (see `comparisonSliceFilter`).
 */
export const COMPARISON_EXCLUDED_TYPES = [
  "heal",
  "absorbed",
  "healabsorbed",
  "drain",
  "dispel",
  "resurrect",
  "aurabroken",
  "interrupt",
] as const;

/** Families retained without an actor: they carry neither sourceID nor targetID. */
export const COMPARISON_ACTORLESS_FAMILIES = ["encounterstart", "encounterend"] as const;

export interface ComparisonCaptureLimits {
  readonly maxGraphqlRequests: number;
  readonly maxEventPagesPerFight: number;
  readonly eventPageLimit: number;
}

/**
 * Owner budget: 36 GraphQL requests. After the two diagnostic requests of
 * 2026-10-11 and the first (empty-filter) fight-1 attempt, the page cap is 6:
 * 3 fights x (1 + 6 + 1) = 24, within the 31 left.
 */
export const COMPARISON_CAPTURE_LIMITS: ComparisonCaptureLimits = {
  maxGraphqlRequests: 36,
  maxEventPagesPerFight: 6,
  eventPageLimit: 10_000,
};

const RATE_LIMIT = "rateLimitData { limitPerHour pointsSpentThisHour pointsResetIn }";

/**
 * The production event arguments (`src/wcl/events-query.ts`) plus exactly
 * one filter. `hostilityType` stays omitted, as in production.
 */
export const COMPARISON_EVENTS_QUERY = `query CoachComparisonEvents($code: String!, $fightIDs: [Int], $startTime: Float!, $endTime: Float!, $limit: Int!, $filterExpression: String!) {
  ${RATE_LIMIT}
  reportData {
    report(code: $code, allowUnlisted: true) {
      events(
        fightIDs: $fightIDs
        startTime: $startTime
        endTime: $endTime
        dataType: All
        limit: $limit
        includeResources: true
        translate: true
        useActorIDs: true
        useAbilityIDs: true
        filterExpression: $filterExpression
      ) {
        data
        nextPageTimestamp
      }
    }
  }
}`;

const quoted = (values: readonly string[]): string => values.map((value) => `"${value}"`).join(", ");

/**
 * A SUPERSET of the E2.1 slice predicate in Warcraft Logs' query language.
 *
 * PINNED BY LIVE DIAGNOSIS (2026-10-11, two requests over COHORT246#33): in
 * the expression language `source.id` / `target.id` are the catalog
 * `gameID`, NOT the report actor id — `source.id = 7` matched nothing while
 * `source.id = <actor 7's gameID>` matched exactly actor 7's events — and
 * `source.owner.id = <gameID>` matched the focus AND its owned pets. A first
 * capture written with report actor ids returned only the two actorless
 * events, silently: the reason a filtered capture earns coverage only through
 * table certification.
 *
 * A SECOND diagnosis (one request, same fight) found that the expression
 * language does not type MISSED damage as "damage": the raw events are
 * `type: "damage"` with hitType 10 / 8, `type = "damage"` drops them, and
 * `type = "miss"` returns the immune ones. Over the whole fight the only
 * owner-scoped events outside the 22 families and the excluded types were
 * those misses — no heal leaked. The filter therefore EXCLUDES the never-
 * requested types instead of listing the retained ones.
 *
 * So the server filter addresses the focus by its player gameID (unique to
 * the character) and its pets through `owner`. The filter is only a bound:
 * the committed slice is re-cut offline with the exact actor-id predicate
 * (`scripts/sanitize-probe.mjs --actor-slice-with-owned-pets`), so anything
 * extra it serves is dropped, and anything it MISSES is caught by the table
 * certificates (no grant).
 */
export function comparisonSliceFilter(focusGameId: number): string {
  if (!Number.isSafeInteger(focusGameId) || focusGameId <= 0) {
    throw new Error("a comparison slice needs the focus player's catalog gameID");
  }
  const g = String(focusGameId);
  return (
    `((source.id = ${g} or source.owner.id = ${g} or target.id = ${g} or target.owner.id = ${g}) and not type in (${quoted(COMPARISON_EXCLUDED_TYPES)}))` +
    ` or type in (${quoted(COMPARISON_ACTORLESS_FAMILIES)})`
  );
}

export function comparisonEventsVariables(
  reportCode: string,
  fightId: number,
  startTimeMs: number,
  endTimeMs: number,
  filterExpression: string,
  limit: number,
): Record<string, unknown> {
  return {
    code: reportCode,
    fightIDs: [fightId],
    startTime: startTimeMs,
    endTime: endTimeMs,
    limit,
    filterExpression,
  };
}

export interface TableWindow {
  readonly label: string;
  readonly fromMs: number;
  readonly toMs: number;
}

const alias = (prefix: string, id: number): string => `${prefix}_${String(id)}`;

/**
 * The composed certification/table request. Every per-actor table uses the
 * same `fightIDs` and the same `startTime`/`endTime` as the event capture;
 * window tables use the window's bounds. Ids are integers by construction.
 */
export function comparisonTablesQuery(
  focusActorId: number,
  scope: readonly number[],
  windows: readonly TableWindow[],
): string {
  if (!scope.includes(focusActorId)) throw new Error("the focus must be in the actor set");
  for (const id of scope) if (!Number.isSafeInteger(id)) throw new Error("actor ids must be integers");
  const interval = "fightIDs: $fightIDs, startTime: $startTime, endTime: $endTime";
  const perActor = scope.flatMap((id) => [
    `${alias("casts", id)}: table(dataType: Casts, ${interval}, sourceID: ${String(id)})`,
    `${alias("damageDone", id)}: table(dataType: DamageDone, ${interval}, sourceID: ${String(id)})`,
    `${alias("damageTaken", id)}: table(dataType: DamageTaken, ${interval}, sourceID: ${String(id)})`,
  ]);
  const perWindow = windows.flatMap((window, index) => {
    if (!Number.isFinite(window.fromMs) || !Number.isFinite(window.toMs) || window.toMs < window.fromMs) {
      throw new Error(`window ${window.label} is not a valid interval`);
    }
    return scope.map(
      (id) =>
        `window${String(index)}_${String(id)}: table(dataType: DamageDone, fightIDs: $fightIDs, startTime: ${String(window.fromMs)}, endTime: ${String(window.toMs)}, sourceID: ${String(id)})`,
    );
  });
  return `query CoachComparisonTables($code: String!, $fightIDs: [Int]!, $startTime: Float!, $endTime: Float!) {
  ${RATE_LIMIT}
  reportData {
    report(code: $code, allowUnlisted: true) {
      code
      revision
      raidDamageDone: table(dataType: DamageDone, fightIDs: $fightIDs)
      deaths: table(dataType: Deaths, ${interval})
      buffs: table(dataType: Buffs, ${interval}, sourceID: ${String(focusActorId)})
      debuffs: table(dataType: Debuffs, ${interval}, sourceID: ${String(focusActorId)})
      ${[...perActor, ...perWindow].join("\n      ")}
    }
  }
}`;
}

// ---------------------------------------------------------------------------
// Identity and the actor set, from the production fight context
// ---------------------------------------------------------------------------

export interface ComparisonFightRequest {
  /** The committed G1 identity, e.g. `COHORT246AAAAAAA#33`. */
  readonly comparisonRef: string;
  readonly reportCode: string;
  readonly fightId: number;
  readonly focusActorId: number;
  readonly encounterId: number;
  readonly difficulty: number;
  readonly className: string;
  readonly specName: string;
}

export type ContextCheck =
  | {
      readonly ok: true;
      readonly revision: number;
      readonly fightStartMs: number;
      readonly fightEndMs: number;
      readonly focusGameId: number;
      /** Focus first, then the owned actors ascending. */
      readonly scope: readonly number[];
      readonly owned: readonly number[];
    }
  | { readonly ok: false; readonly reason: string };

/**
 * The context gate. Every refusal names its reason; nothing is inferred from
 * events, names or summons. Ownership is `petOwner === focus`, exactly.
 */
export function checkComparisonContext(data: unknown, request: ComparisonFightRequest): ContextCheck {
  const report = isRecord(data) ? readRecord(readRecord(data, "reportData") ?? {}, "report") : undefined;
  if (report === undefined) return { ok: false, reason: "REPORT_NOT_ACCESSIBLE" };
  const revision = readInteger(report, "revision");
  if (revision === undefined) return { ok: false, reason: "REVISION_UNREADABLE" };
  const archive = readRecord(report, "archiveStatus");
  if (archive !== undefined && archive["isAccessible"] === false)
    return { ok: false, reason: "REPORT_ARCHIVED" };
  const fights = readArray(report, "fights") ?? [];
  const fight = fights.find((entry) => isRecord(entry) && entry["id"] === request.fightId);
  if (!isRecord(fight)) return { ok: false, reason: "FIGHT_NOT_FOUND" };
  if (fight["encounterID"] !== request.encounterId || fight["difficulty"] !== request.difficulty) {
    return { ok: false, reason: "ENCOUNTER_MISMATCH" };
  }
  if (fight["kill"] !== true) return { ok: false, reason: "NOT_KILL" };
  const start = readInteger(fight, "startTime");
  const end = readInteger(fight, "endTime");
  if (start === undefined || end === undefined || end <= start)
    return { ok: false, reason: "FIGHT_BOUNDS_UNREADABLE" };
  const masterData = readRecord(report, "masterData");
  const actors = (masterData === undefined ? undefined : readArray(masterData, "actors")) ?? [];
  const focus = actors.find((actor) => isRecord(actor) && actor["id"] === request.focusActorId);
  if (!isRecord(focus)) return { ok: false, reason: "FOCUS_NOT_IN_CATALOG" };
  if (readString(focus, "type") !== "Player" || readString(focus, "subType") !== request.className) {
    return { ok: false, reason: "FOCUS_CLASS_MISMATCH" };
  }
  const focusGameId = readInteger(focus, "gameID");
  if (focusGameId === undefined || focusGameId <= 0) return { ok: false, reason: "FOCUS_GAME_ID_UNREADABLE" };
  // The expression addresses the focus by gameID: it must be unique in the catalog.
  if (actors.filter((actor) => isRecord(actor) && actor["gameID"] === focusGameId).length !== 1) {
    return { ok: false, reason: "FOCUS_GAME_ID_NOT_UNIQUE" };
  }
  const players = readArray(fight, "friendlyPlayers") ?? [];
  const specs = readArray(fight, "friendlySpecs") ?? [];
  const index = players.indexOf(request.focusActorId);
  if (index < 0 || specs.length !== players.length || specs[index] !== request.specName) {
    return { ok: false, reason: "FOCUS_SPEC_UNRESOLVED" };
  }
  const owned: number[] = [];
  for (const actor of actors) {
    if (!isRecord(actor)) return { ok: false, reason: "CATALOG_MALFORMED" };
    const id = actor["id"];
    if (typeof id !== "number" || !Number.isSafeInteger(id))
      return { ok: false, reason: "CATALOG_MALFORMED" };
    if (actor["petOwner"] === request.focusActorId && id !== request.focusActorId) owned.push(id);
  }
  owned.sort((a, b) => a - b);
  return {
    ok: true,
    revision,
    fightStartMs: start,
    fightEndMs: end,
    focusGameId,
    scope: [request.focusActorId, ...owned],
    owned,
  };
}

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

export type CapturePortResponse =
  { readonly ok: true; readonly data: unknown } | { readonly ok: false; readonly failure: string };

/** The only three requests G2 can make. There is no rankings, cohort or unfiltered port. */
export interface ComparisonCapturePorts {
  fightContext(reportCode: string, fightId: number, focusActorId: number): Promise<CapturePortResponse>;
  eventsPage(variables: Record<string, unknown>): Promise<CapturePortResponse>;
  tables(query: string, variables: Record<string, unknown>): Promise<CapturePortResponse>;
}

export interface CapturedPage {
  readonly requestedStartTime: number;
  readonly data: unknown;
}

export type FightCaptureOutcome =
  | {
      readonly status: "CAPTURED";
      readonly request: ComparisonFightRequest;
      readonly context: unknown;
      readonly revisionBefore: number;
      readonly revisionAfter: number | null;
      readonly scope: readonly number[];
      readonly owned: readonly number[];
      readonly filterExpression: string;
      readonly pages: readonly CapturedPage[];
      readonly terminal: boolean;
      readonly tables: unknown;
      readonly windows: readonly TableWindow[];
    }
  | {
      readonly status: "REFUSED" | "STOPPED";
      readonly request: ComparisonFightRequest;
      readonly reason: string;
      readonly context?: unknown;
      readonly pages?: readonly CapturedPage[];
    };

export interface ComparisonCaptureRun {
  readonly requests: readonly {
    readonly ordinal: number;
    readonly purpose: string;
    readonly comparisonRef: string;
  }[];
  readonly fights: readonly FightCaptureOutcome[];
  readonly stoppedReason: string | null;
}

class BudgetExhausted extends Error {}

const eventsOf = (page: unknown): { events: readonly unknown[]; cursor: number | null } | null => {
  const report = isRecord(page) ? readRecord(readRecord(page, "reportData") ?? {}, "report") : undefined;
  const paginator = report === undefined ? undefined : readRecord(report, "events");
  if (paginator === undefined) return null;
  const events = readArray(paginator, "data");
  const cursor = paginator["nextPageTimestamp"];
  if (events === undefined || !(cursor === null || typeof cursor === "number")) return null;
  return { events, cursor };
};

/**
 * Captures each fight in order. The budget is checked before EVERY request;
 * a fight whose page cap is reached stops (recorded as truncated, no table
 * request), and a refused context makes no further request for that fight.
 * `windowsOf` derives the window tables from the captured events (the Blood
 * definition supplies it); it is called only for a terminal capture.
 */
export async function captureComparisons(
  ports: ComparisonCapturePorts,
  fights: readonly ComparisonFightRequest[],
  subjectReportCode: string,
  windowsOf: (events: readonly unknown[], focusActorId: number) => readonly TableWindow[],
  limits: ComparisonCaptureLimits = COMPARISON_CAPTURE_LIMITS,
): Promise<ComparisonCaptureRun> {
  for (const fight of fights) {
    if (fight.reportCode === subjectReportCode) {
      throw new Error(`refusing ${fight.comparisonRef}: the subject's report is never re-fetched`);
    }
  }
  const worstCase = fights.length * (2 + limits.maxEventPagesPerFight);
  if (worstCase > limits.maxGraphqlRequests) {
    throw new Error(
      `plan worst case ${String(worstCase)} exceeds the cap of ${String(limits.maxGraphqlRequests)}`,
    );
  }
  const requests: { ordinal: number; purpose: string; comparisonRef: string }[] = [];
  const outcomes: FightCaptureOutcome[] = [];
  const spend = async <T>(purpose: string, ref: string, run: () => Promise<T>): Promise<T> => {
    if (requests.length >= limits.maxGraphqlRequests) throw new BudgetExhausted();
    requests.push({ ordinal: requests.length + 1, purpose, comparisonRef: ref });
    return run();
  };

  let stoppedReason: string | null = null;
  try {
    for (const fight of fights) {
      const ref = fight.comparisonRef;
      const context = await spend("FIGHT_CONTEXT", ref, () =>
        ports.fightContext(fight.reportCode, fight.fightId, fight.focusActorId),
      );
      if (!context.ok) {
        outcomes.push({
          status: "REFUSED",
          request: fight,
          reason: `CONTEXT_UNAVAILABLE: ${context.failure}`,
        });
        continue;
      }
      const check = checkComparisonContext(context.data, fight);
      if (!check.ok) {
        outcomes.push({ status: "REFUSED", request: fight, reason: check.reason, context: context.data });
        continue;
      }
      const filterExpression = comparisonSliceFilter(check.focusGameId);
      const pages: CapturedPage[] = [];
      let cursor: number | null = check.fightStartMs;
      let terminal = false;
      let failure: string | null = null;
      for (let page = 0; page < limits.maxEventPagesPerFight && cursor !== null; page += 1) {
        const variables = comparisonEventsVariables(
          fight.reportCode,
          fight.fightId,
          cursor,
          check.fightEndMs,
          filterExpression,
          limits.eventPageLimit,
        );
        const response = await spend("EVENTS_PAGE", ref, () => ports.eventsPage(variables));
        if (!response.ok) {
          failure = `EVENTS_PAGE_FAILED: ${response.failure}`;
          break;
        }
        const decoded = eventsOf(response.data);
        if (decoded === null) {
          failure = "EVENTS_PAGE_MALFORMED";
          break;
        }
        pages.push({ requestedStartTime: cursor, data: response.data });
        cursor = decoded.cursor;
        if (cursor === null) terminal = true;
      }
      if (failure !== null || !terminal) {
        outcomes.push({
          status: "STOPPED",
          request: fight,
          reason: failure ?? "PAGE_CAP_REACHED_BEFORE_TERMINAL_PAGE",
          context: context.data,
          pages,
        });
        continue;
      }
      const events = pages.flatMap((page) => eventsOf(page.data)?.events ?? []);
      const windows = windowsOf(events, fight.focusActorId);
      const tables = await spend("TABLES", ref, () =>
        ports.tables(comparisonTablesQuery(fight.focusActorId, check.scope, windows), {
          code: fight.reportCode,
          fightIDs: [fight.fightId],
          startTime: check.fightStartMs,
          endTime: check.fightEndMs,
        }),
      );
      const tableReport =
        tables.ok && isRecord(tables.data)
          ? readRecord(readRecord(tables.data, "reportData") ?? {}, "report")
          : undefined;
      outcomes.push({
        status: "CAPTURED",
        request: fight,
        context: context.data,
        revisionBefore: check.revision,
        revisionAfter: tableReport === undefined ? null : (readInteger(tableReport, "revision") ?? null),
        scope: check.scope,
        owned: check.owned,
        filterExpression,
        pages,
        terminal,
        tables: tables.ok ? tables.data : { failure: tables.failure },
        windows,
      });
    }
  } catch (error) {
    if (!(error instanceof BudgetExhausted)) throw error;
    stoppedReason = "REQUEST_BUDGET_EXHAUSTED";
  }
  return { requests, fights: outcomes, stoppedReason };
}
