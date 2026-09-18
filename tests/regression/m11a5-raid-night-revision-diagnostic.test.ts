/**
 * M11-A5 post-deploy diagnostic: when a raid night's FINAL revision
 * confirmation fails, the service emits ONE fixed-vocabulary diagnostic record
 * and the public answer does not move.
 *
 * WHY THIS EXISTS
 *
 * Production refused three raid nights with `REPORT_REVISION_UNVERIFIED` while
 * the same request succeeded from Node. The transport already knew whether the
 * final read was rate-limited, refused, timed out, thrown, undecodable or
 * simply not served — and `checkReportRevision` discarded it. The public
 * document is deliberately opaque and stays so; this file pins the internal
 * account of the failure and proves it cannot carry anything but enum members,
 * integers, booleans and nulls.
 */

import { describe, expect, it, vi } from "vitest";

import { logRaidNightDiagnostic } from "../../src/runtime/analysis-composition.js";
import { statusForErrorCode } from "../../src/api/responses.js";
import { toolErrorForServiceCode } from "../../src/mcp/tool-errors.js";
import type { RaidNightDiagnostic, RaidNightDiagnosticRecord } from "../../src/services/raid-night-ports.js";
import { diagnosticRecordOf } from "../../src/services/raid-night-service.js";
import { createGraphqlClient } from "../../src/wcl/graphql-client.js";
import { checkReportRevision, type RevisionCheck } from "../../src/wcl/report-revision.js";
import { createTokenCache, createTokenProvider } from "../../src/wcl/token-provider.js";
import { countOutbound, THROWN_ERROR_NAMES, WCL_FAILURE_REASONS } from "../../src/wcl/types.js";
import type { WclCredentials } from "../../src/config/env.js";
import { createWclFetch, jsonResponse } from "../support/fake-fetch.js";
import {
  REPORT_CODE,
  assassinationSnapshot,
  fakePorts,
  runNight,
} from "../support/raid-night-orchestration-fixture.js";

const SENTINEL_SECRET = "SENTINEL_CLIENT_SECRET_DO_NOT_LEAK";
const SENTINEL_TOKEN = "SENTINEL_ACCESS_TOKEN_DO_NOT_LEAK";
const credentials: WclCredentials = {
  clientId: "SENTINEL_CLIENT_ID_DO_NOT_LEAK",
  clientSecret: SENTINEL_SECRET,
  toJSON: () => ({ clientId: "[redacted]", clientSecret: "[redacted]" }),
};

const PUBLIC_MESSAGE =
  "The Warcraft Logs report revision could not be confirmed after analysis, so the raid night was refused rather than published from evidence that might span two versions of the report. Try again.";

/** A real revision check over a real client whose fetch behaves as `graphql` says. */
async function realCheck(graphql: () => Response): Promise<RevisionCheck> {
  const fake = createWclFetch({ accessToken: SENTINEL_TOKEN, graphql });
  const counting = countOutbound(fake.fetch);
  const tokens = createTokenProvider({
    credentials,
    fetch: counting,
    now: () => 1,
    cache: createTokenCache(),
  });
  return await checkReportRevision(createGraphqlClient({ tokens, fetch: counting }), REPORT_CODE, 30);
}

const RECORD_KEYS = [
  "event",
  "stage",
  "cause",
  "reason",
  "wclStage",
  "httpStatus",
  "graphqlErrorCount",
  "errorName",
  "isTimeout",
  "outboundIndex",
  "retried",
] as const;

function expectFixedVocabulary(record: RaidNightDiagnosticRecord): void {
  expect(Object.keys(record).sort()).toEqual([...RECORD_KEYS].sort());
  expect(record.event).toBe("RAID_NIGHT_REVISION_UNVERIFIED");
  expect(record.stage).toBe("FINAL_REVISION_CHECK");
  expect(["UPSTREAM", "REPORT_NOT_SERVED", "REVISION_MISMATCH"]).toContain(record.cause);
  if (record.reason !== null) expect(WCL_FAILURE_REASONS as readonly string[]).toContain(record.reason);
  if (record.wclStage !== null)
    expect(["TOKEN", "TRANSPORT", "DECODE", "IDENTITY"]).toContain(record.wclStage);
  if (record.errorName !== null) expect(THROWN_ERROR_NAMES as readonly string[]).toContain(record.errorName);
  for (const key of ["httpStatus", "graphqlErrorCount", "outboundIndex"] as const) {
    const value = record[key];
    expect(value === null || Number.isInteger(value), key).toBe(true);
  }
  expect(record.isTimeout === null || typeof record.isTimeout === "boolean").toBe(true);
  expect(typeof record.retried).toBe("boolean");
}

describe("diagnosticRecordOf: the fixed-vocabulary account of a failed final check", () => {
  it("copies an upstream failure's reason and diagnostics by name, field for field", async () => {
    const timeout = new Error(`timed out ${SENTINEL_SECRET}`);
    timeout.name = "TimeoutError";
    const check = await realCheck(() => {
      throw timeout;
    });
    const record = diagnosticRecordOf(check, false);
    expect(record).toEqual({
      event: "RAID_NIGHT_REVISION_UNVERIFIED",
      stage: "FINAL_REVISION_CHECK",
      cause: "UPSTREAM",
      reason: "UPSTREAM_UNAVAILABLE",
      wclStage: "TRANSPORT",
      httpStatus: null,
      graphqlErrorCount: null,
      errorName: "TimeoutError",
      isTimeout: true,
      outboundIndex: 2,
      retried: false,
    });
    expect(diagnosticRecordOf(check, true)).toMatchObject({ retried: true, errorName: "TimeoutError" });
    if (record !== null) expectFixedVocabulary(record);
  });

  it("distinguishes rate-limited, forbidden, unavailable, invalid and not-served", async () => {
    const cases: readonly [() => Response, Partial<RaidNightDiagnosticRecord>][] = [
      [() => jsonResponse(429, {}), { cause: "UPSTREAM", reason: "UPSTREAM_RATE_LIMITED", httpStatus: 429 }],
      [() => jsonResponse(403, {}), { cause: "UPSTREAM", reason: "UPSTREAM_AUTH_FAILED", httpStatus: 403 }],
      [() => jsonResponse(503, {}), { cause: "UPSTREAM", reason: "UPSTREAM_UNAVAILABLE", httpStatus: 503 }],
      [
        () => jsonResponse(200, { errors: [{ message: "x" }] }),
        { cause: "UPSTREAM", reason: "UPSTREAM_DATA_INVALID", httpStatus: 200, graphqlErrorCount: 1 },
      ],
      [
        () => jsonResponse(200, { data: { reportData: { report: { revision: "thirty" } } } }),
        { cause: "UPSTREAM", reason: "UPSTREAM_DATA_INVALID", wclStage: "DECODE" },
      ],
      [
        () => jsonResponse(200, { data: { reportData: { report: null } } }),
        { cause: "REPORT_NOT_SERVED", reason: null, httpStatus: null, errorName: null },
      ],
    ];
    for (const [graphql, expected] of cases) {
      const record = diagnosticRecordOf(await realCheck(graphql), false);
      expect(record).not.toBeNull();
      if (record === null) continue;
      expect(record).toMatchObject(expected);
      expectFixedVocabulary(record);
    }
  });

  it("names a MATCHES for some other revision, and has nothing to say about CHANGED", () => {
    expect(diagnosticRecordOf({ outcome: "MATCHES", revision: 31 }, false)).toMatchObject({
      cause: "REVISION_MISMATCH",
      retried: false,
    });
    expect(diagnosticRecordOf({ outcome: "CHANGED", expected: 30, observed: 31 }, false)).toBeNull();
    expect(diagnosticRecordOf({ outcome: "CHANGED", expected: 30, observed: 31 }, true)).toBeNull();
  });
});

describe("the raid-night service emits the record once, and the public answer does not move", () => {
  const snapshot = assassinationSnapshot({ fightIds: [1], sourceIds: [19] });

  it("emits exactly one record on an UNVERIFIED final check, with the public code and wording unchanged", async () => {
    const received: RaidNightDiagnostic[] = [];
    const ports = fakePorts({
      snapshot,
      finalRevision: {
        outcome: "UNVERIFIED",
        cause: {
          kind: "UPSTREAM",
          failure: {
            reason: "UPSTREAM_RATE_LIMITED",
            diagnostics: {
              stage: "TRANSPORT",
              httpStatus: 429,
              graphqlErrorCount: undefined,
              errorName: undefined,
              isTimeout: undefined,
              outboundIndex: 55,
            },
          },
        },
      },
    });
    const run = await runNight(
      { reportCode: REPORT_CODE, fightIds: [1] },
      { ...ports, deps: { ...ports.deps, diagnostics: (record) => received.push(record) } },
    );
    expect(run.ok).toBe(false);
    if (run.ok) return;
    expect(run.error).toEqual({ code: "REPORT_REVISION_UNVERIFIED", message: PUBLIC_MESSAGE });
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      cause: "UPSTREAM",
      reason: "UPSTREAM_RATE_LIMITED",
      httpStatus: 429,
      outboundIndex: 55,
    });
    const first = received[0];
    if (first !== undefined && first.event === "RAID_NIGHT_REVISION_UNVERIFIED") expectFixedVocabulary(first);
  });

  it("emits nothing when the final check MATCHES, and nothing for CHANGED (which has its own public code)", async () => {
    const received: RaidNightDiagnostic[] = [];
    const ok = fakePorts({ snapshot });
    const good = await runNight(
      { reportCode: REPORT_CODE, fightIds: [1] },
      { ...ok, deps: { ...ok.deps, diagnostics: (record) => received.push(record) } },
    );
    expect(good.ok).toBe(true);
    const changed = fakePorts({
      snapshot,
      finalRevision: { outcome: "CHANGED", expected: 30, observed: 31 },
    });
    const moved = await runNight(
      { reportCode: REPORT_CODE, fightIds: [1] },
      { ...changed, deps: { ...changed.deps, diagnostics: (record) => received.push(record) } },
    );
    expect(moved.ok).toBe(false);
    if (!moved.ok) expect(moved.error.code).toBe("REPORT_REVISION_CHANGED");
    expect(received).toEqual([]);
  });

  it("a diagnostics port that THROWS changes nothing: same public result, no escaping exception", async () => {
    // The port is an observer, not an authority. A logger failure must not turn
    // a refused raid night into INTERNAL_ERROR or a rejected promise.
    const finalRevision: RevisionCheck = {
      outcome: "UNVERIFIED",
      cause: {
        kind: "UPSTREAM",
        failure: {
          reason: "UPSTREAM_UNAVAILABLE",
          diagnostics: {
            stage: "TRANSPORT",
            httpStatus: undefined,
            graphqlErrorCount: undefined,
            errorName: "TimeoutError",
            isTimeout: true,
            outboundIndex: 55,
          },
        },
      },
    };
    const reference = await runNight(
      { reportCode: REPORT_CODE, fightIds: [1] },
      fakePorts({ snapshot, finalRevision }),
    );
    let calls = 0;
    const throwing = fakePorts({ snapshot, finalRevision });
    const run = runNight(
      { reportCode: REPORT_CODE, fightIds: [1] },
      {
        ...throwing,
        deps: {
          ...throwing.deps,
          diagnostics: () => {
            calls += 1;
            throw new Error(`logger failure ${SENTINEL_SECRET}`);
          },
        },
      },
    );
    await expect(run).resolves.toBeDefined();
    const result = await run;
    expect(calls).toBe(1);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ code: "REPORT_REVISION_UNVERIFIED", message: PUBLIC_MESSAGE });
    expect(JSON.stringify(result)).toBe(JSON.stringify(reference));
    expect(JSON.stringify(result)).not.toContain(SENTINEL_SECRET);
    expect(JSON.stringify(result)).not.toContain("logger failure");
  });

  it("without a diagnostics port the result is byte-identical to the result with one", async () => {
    const finalRevision: RevisionCheck = { outcome: "UNVERIFIED", cause: { kind: "REPORT_NOT_SERVED" } };
    const silent = await runNight(
      { reportCode: REPORT_CODE, fightIds: [1] },
      fakePorts({ snapshot, finalRevision }),
    );
    const loud = fakePorts({ snapshot, finalRevision });
    const observed = await runNight(
      { reportCode: REPORT_CODE, fightIds: [1] },
      { ...loud, deps: { ...loud.deps, diagnostics: () => undefined } },
    );
    expect(JSON.stringify(observed)).toBe(JSON.stringify(silent));
  });

  it("the public REST status and MCP tool-error wording for REPORT_REVISION_UNVERIFIED are unchanged", () => {
    expect(statusForErrorCode("REPORT_REVISION_UNVERIFIED")).toBe(503);
    expect(toolErrorForServiceCode("REPORT_REVISION_UNVERIFIED")).toMatchObject({
      code: "REPORT_REVISION_UNVERIFIED",
      message:
        "The Warcraft Logs report revision could not be confirmed, so the result was refused rather than assembled from evidence that might span two versions of the report. Try again later.",
      retryable: true,
    });
  });
});

describe("the production log line cannot carry arbitrary text", () => {
  it("serializes the record verbatim, and a failure born from a hostile exception yields no secret-shaped or free text", async () => {
    const hostile = new Error(`leaked ${SENTINEL_SECRET} ${SENTINEL_TOKEN}`);
    hostile.name = `Bearer ${SENTINEL_TOKEN}`;
    const check = await realCheck(() => {
      throw hostile;
    });
    const record = diagnosticRecordOf(check, false);
    expect(record).not.toBeNull();
    if (record === null) return;
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      logRaidNightDiagnostic(record);
      expect(log).toHaveBeenCalledTimes(1);
      const line = String(log.mock.calls[0]?.[0]);
      expect(JSON.parse(line)).toEqual(record);
      expect(Object.keys(JSON.parse(line) as object).sort()).toEqual([...RECORD_KEYS].sort());
      for (const forbidden of [
        SENTINEL_SECRET,
        SENTINEL_TOKEN,
        "leaked",
        "Bearer",
        "authorization",
        "query",
        "message",
      ]) {
        expect(line, forbidden).not.toContain(forbidden);
      }
      expect(record.errorName).toBe("OTHER");
    } finally {
      log.mockRestore();
    }
  });

  it("every value of every record field is an enum member, an integer, a boolean or null — never a string outside the vocabularies", () => {
    const sample: RaidNightDiagnosticRecord = {
      event: "RAID_NIGHT_REVISION_UNVERIFIED",
      stage: "FINAL_REVISION_CHECK",
      cause: "UPSTREAM",
      reason: "UPSTREAM_UNAVAILABLE",
      wclStage: "TRANSPORT",
      httpStatus: null,
      graphqlErrorCount: null,
      errorName: "TypeError",
      isTimeout: false,
      outboundIndex: 55,
      retried: false,
    };
    expectFixedVocabulary(sample);
    const strings = Object.values(sample).filter((value): value is string => typeof value === "string");
    const vocabularies = new Set<string>([
      "RAID_NIGHT_REVISION_UNVERIFIED",
      "FINAL_REVISION_CHECK",
      "UPSTREAM",
      "REPORT_NOT_SERVED",
      "REVISION_MISMATCH",
      "TOKEN",
      "TRANSPORT",
      "DECODE",
      "IDENTITY",
      ...WCL_FAILURE_REASONS,
      ...THROWN_ERROR_NAMES,
    ]);
    for (const value of strings) expect(vocabularies.has(value), value).toBe(true);
  });
});
