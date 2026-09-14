/**
 * Offline harness for exercising event retrieval end to end.
 *
 * Tests drive the REAL token provider, GraphQL transport, page decoder and
 * paginator over a fake `fetch`. Faking at the fetch boundary rather than
 * stubbing the client means a change to decoding or retry behaviour is caught
 * here rather than passing silently.
 *
 * No test reaches Warcraft Logs, and no real credential appears anywhere. The
 * values below are obvious sentinels.
 */

import { createGraphqlClient, type WclGraphqlClient } from "../../src/wcl/graphql-client.js";
import { createTokenProvider } from "../../src/wcl/token-provider.js";
import type { WclCredentials } from "../../src/config/env.js";
import { createWclFetch, jsonResponse, type FakeFetch, type FakeResponder } from "./fake-fetch.js";

export const TEST_CREDENTIALS: WclCredentials = {
  clientId: "fake-client-id-not-real",
  clientSecret: "fake-client-secret-not-real",
  toJSON() {
    return { clientId: "[redacted]", clientSecret: "[redacted]" };
  },
};

export interface TestClient {
  readonly client: WclGraphqlClient;
  readonly fetch: FakeFetch;
}

export function createTestGraphqlClient(graphql: FakeResponder): TestClient {
  const fetch = createWclFetch({ graphql });
  const tokens = createTokenProvider({
    credentials: TEST_CREDENTIALS,
    fetch: fetch.fetch,
    now: () => 1_000_000,
  });
  return { client: createGraphqlClient({ tokens, fetch: fetch.fetch }), fetch };
}

/** A well-formed `ReportEventPaginator` response. */
export function eventPageResponse(events: readonly unknown[], nextPageTimestamp: number | null): Response {
  return jsonResponse(200, {
    data: {
      rateLimitData: { limitPerHour: 3600, pointsSpentThisHour: 10, pointsResetIn: 600 },
      reportData: { report: { events: { data: events, nextPageTimestamp } } },
    },
  });
}

/** A response whose paginator exists but cannot be used. */
export function malformedPaginatorResponse(paginator: unknown): Response {
  return jsonResponse(200, {
    data: { reportData: { report: { events: paginator } } },
  });
}

/** Reads the GraphQL variables a recorded request was sent with. */
export function variablesOf(body: string | undefined): Record<string, unknown> {
  if (body === undefined) {
    throw new Error("request had no body");
  }
  const parsed: unknown = JSON.parse(body);
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("request body was not an object");
  }
  const variables = (parsed as { variables?: unknown }).variables;
  return typeof variables === "object" && variables !== null ? (variables as Record<string, unknown>) : {};
}

export function queryOf(body: string | undefined): string {
  if (body === undefined) {
    throw new Error("request had no body");
  }
  const parsed: unknown = JSON.parse(body);
  return String((parsed as { query?: unknown }).query ?? "");
}

export interface ContextOverrides {
  readonly actors?: readonly unknown[];
  readonly abilities?: readonly unknown[];
  readonly phases?: readonly unknown[];
  readonly fight?: Record<string, unknown>;
  readonly archiveStatus?: unknown;
  readonly revision?: number;
}

/** A well-formed `CoachFightContext` response. */
export function contextResponse(overrides: ContextOverrides = {}): Response {
  const report: Record<string, unknown> = {
    code: "aBcDeFgH12345678",
    revision: overrides.revision ?? 3,
    startTime: 1_700_000_000_000,
    endTime: 1_700_000_900_000,
    masterData: {
      logVersion: 42,
      gameVersion: 1,
      actors: overrides.actors ?? [],
      abilities: overrides.abilities ?? [],
    },
    phases: overrides.phases ?? [],
    fights: [
      {
        id: 6,
        name: "Test Boss",
        encounterID: 2900,
        difficulty: 5,
        size: 20,
        kill: true,
        inProgress: false,
        startTime: 1000,
        endTime: 5000,
        friendlyPlayers: [5, 7],
        friendlySpecs: ["Assassination", "Holy"],
        talentImportCode: "ABCDEF",
        phaseTransitions: [],
        ...overrides.fight,
      },
    ],
  };
  if (overrides.archiveStatus !== undefined) {
    report["archiveStatus"] = overrides.archiveStatus;
  }
  return jsonResponse(200, {
    data: {
      rateLimitData: { limitPerHour: 3600, pointsSpentThisHour: 10, pointsResetIn: 600 },
      reportData: { report },
    },
  });
}

export function revisionResponse(revision: number): Response {
  return jsonResponse(200, { data: { reportData: { report: { revision } } } });
}

/**
 * Routes by GraphQL operation name, so an ingestion test can describe the
 * context, the event pages and the revision recheck independently.
 */
export function ingestionResponder(options: {
  readonly context?: () => Response;
  readonly pages: readonly (() => Response)[];
  readonly revision?: () => Response;
}): FakeResponder {
  let pageIndex = 0;
  return (request) => {
    const query = queryOf(request.body);
    if (query.includes("CoachFightContext")) {
      return (options.context ?? (() => contextResponse()))();
    }
    if (query.includes("CoachReportRevision")) {
      return (options.revision ?? (() => revisionResponse(3)))();
    }
    const next = options.pages[Math.min(pageIndex, options.pages.length - 1)];
    pageIndex += 1;
    if (next === undefined) {
      throw new Error("no event page response configured");
    }
    return next();
  };
}

/** A minimal raw event with a valid envelope. */
export function rawEvent(
  timestamp: number,
  type: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { timestamp, type, ...extra };
}

// --------------------------------------------------------------------------
// Roster discovery (M7-C)
// --------------------------------------------------------------------------

/** One `masterData.actors` entry, shaped as Warcraft Logs returns it. */
export function rosterActor(options: {
  readonly id: number;
  readonly name?: string;
  readonly type?: string;
  readonly subType?: string;
  readonly server?: string | null;
}): Record<string, unknown> {
  return {
    id: options.id,
    name: options.name ?? `Actor${String(options.id)}`,
    server: options.server === undefined ? "Testrealm" : options.server,
    type: options.type ?? "Player",
    subType: options.subType ?? "Rogue",
  };
}

/** One `fights` entry for the roster query. */
export function rosterFight(options: {
  readonly id: number;
  readonly friendlyPlayers: readonly number[];
  readonly friendlySpecs: readonly unknown[];
  readonly name?: string;
  readonly encounterID?: number;
  readonly difficulty?: number | null;
  readonly size?: number | null;
  readonly kill?: boolean | null;
  readonly startTime?: number;
  readonly endTime?: number;
}): Record<string, unknown> {
  return {
    id: options.id,
    name: options.name ?? `Fight ${String(options.id)}`,
    encounterID: options.encounterID ?? 2900,
    difficulty: options.difficulty === undefined ? 5 : options.difficulty,
    size: options.size === undefined ? 20 : options.size,
    kill: options.kill === undefined ? true : options.kill,
    startTime: options.startTime ?? 1000,
    endTime: options.endTime ?? 5000,
    friendlyPlayers: [...options.friendlyPlayers],
    friendlySpecs: [...options.friendlySpecs],
  };
}

/** A well-formed `CoachReportRoster` response. */
export function rosterResponse(options: {
  readonly actors: readonly unknown[];
  readonly fights: readonly unknown[];
  readonly revision?: number;
  readonly code?: string;
  readonly logVersion?: number;
  readonly gameVersion?: number | null;
}): Response {
  return jsonResponse(200, {
    data: {
      rateLimitData: { limitPerHour: 3600, pointsSpentThisHour: 10, pointsResetIn: 600 },
      reportData: {
        report: {
          code: options.code ?? "aBcDeFgH12345678",
          revision: options.revision ?? 30,
          startTime: 1_700_000_000_000,
          endTime: 1_700_000_900_000,
          masterData: {
            logVersion: options.logVersion ?? 17,
            gameVersion: options.gameVersion === undefined ? 1 : options.gameVersion,
            actors: [...options.actors],
          },
          fights: [...options.fights],
        },
      },
    },
  });
}

/** A 200 response wrapping a decoded GraphQL `data` payload. */
export function jsonResponseFor(data: unknown): Response {
  return jsonResponse(200, { data });
}
