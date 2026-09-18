/**
 * M11-A5: the ONE bounded retry of a raid night's FINAL revision confirmation.
 *
 * WHAT PRODUCTION SHOWED
 *
 * Three refused raid nights, all `REPORT_REVISION_UNVERIFIED`, all classified
 * by the diagnostic record as the same thing: after roster discovery, fifty
 * event pages and every analyzer had succeeded, the cheapest query of the
 * request — `CoachReportRevision`, the 55th outbound request — was aborted by
 * the client's own 20 s timeout (`reason UPSTREAM_UNAVAILABLE`,
 * `errorName TimeoutError`, `isTimeout true`). Not quota, not a refusal, not
 * bad data, not an unserved report.
 *
 * THE RULE
 *
 * Exactly that condition, and nothing else, earns exactly one more fresh
 * request through the same port. The retry's answer REPLACES the first and is
 * judged by the unchanged rules: MATCHES publishes, CHANGED refuses with the
 * revision-changed code, anything else refuses with the unverified code. The
 * timed-out attempt never publishes anything; there is no loop; the 20 s
 * timeout, the public schemas and the error wording do not move.
 */

import { describe, expect, it, vi } from "vitest";

import { projectRaidNightResult } from "../../src/contracts/raid-night-projection.js";
import { PublicRaidNightResultSchema } from "../../src/contracts/raid-night-contract.js";
import type { RaidNightDiagnostic } from "../../src/services/raid-night-ports.js";
import { isRetryableRevisionTimeout, recoveredRecordOf } from "../../src/services/raid-night-service.js";
import { logRaidNightDiagnostic } from "../../src/runtime/analysis-composition.js";
import { THROWN_ERROR_NAMES } from "../../src/wcl/types.js";
import type { RevisionCheck } from "../../src/wcl/report-revision.js";
import type { ThrownErrorName, WclFailureReason } from "../../src/wcl/types.js";
import {
  REPORT_CODE,
  assassinationSnapshot,
  fakePorts,
  runNight,
  type FakePortOptions,
} from "../support/raid-night-orchestration-fixture.js";

const R0 = 30; // the fixture snapshot's revision
const UNVERIFIED_MESSAGE =
  "The Warcraft Logs report revision could not be confirmed after analysis, so the raid night was refused rather than published from evidence that might span two versions of the report. Try again.";

function upstream(
  reason: WclFailureReason,
  detail: {
    readonly httpStatus?: number;
    readonly graphqlErrorCount?: number;
    readonly errorName?: ThrownErrorName;
    readonly isTimeout?: boolean;
    readonly stage?: "TRANSPORT" | "DECODE";
  } = {},
): RevisionCheck {
  return {
    outcome: "UNVERIFIED",
    cause: {
      kind: "UPSTREAM",
      failure: {
        reason,
        diagnostics: {
          stage: detail.stage ?? "TRANSPORT",
          httpStatus: detail.httpStatus,
          graphqlErrorCount: detail.graphqlErrorCount,
          errorName: detail.errorName,
          isTimeout: detail.isTimeout,
          outboundIndex: 55,
        },
      },
    },
  };
}

/** The production condition, verbatim from the classified diagnostic record. */
const TIMEOUT: RevisionCheck = upstream("UPSTREAM_UNAVAILABLE", {
  errorName: "TimeoutError",
  isTimeout: true,
});
const MATCHES: RevisionCheck = { outcome: "MATCHES", revision: R0 };
const CHANGED: RevisionCheck = { outcome: "CHANGED", expected: R0, observed: R0 + 1 };
const NOT_SERVED: RevisionCheck = { outcome: "UNVERIFIED", cause: { kind: "REPORT_NOT_SERVED" } };

/** Every cause that must NOT earn a retry. */
const NON_RETRYABLE: readonly [string, RevisionCheck][] = [
  ["403 auth failure", upstream("UPSTREAM_AUTH_FAILED", { httpStatus: 403 })],
  ["429 rate limit", upstream("UPSTREAM_RATE_LIMITED", { httpStatus: 429 })],
  ["other HTTP failure", upstream("UPSTREAM_UNAVAILABLE", { httpStatus: 503 })],
  ["GraphQL errors", upstream("UPSTREAM_DATA_INVALID", { httpStatus: 200, graphqlErrorCount: 1 })],
  ["undecodable data", upstream("UPSTREAM_DATA_INVALID", { stage: "DECODE", httpStatus: 200 })],
  ["report not served", NOT_SERVED],
  ["revision mismatch", { outcome: "MATCHES", revision: R0 + 7 }],
  [
    "generic non-timeout throw",
    upstream("UPSTREAM_UNAVAILABLE", { errorName: "TypeError", isTimeout: false }),
  ],
  [
    "non-timeout throw of unknown name",
    upstream("UPSTREAM_UNAVAILABLE", { errorName: "OTHER", isTimeout: false }),
  ],
  [
    "timeout flag on a non-UNAVAILABLE reason",
    upstream("UPSTREAM_RATE_LIMITED", { httpStatus: 429, isTimeout: true }),
  ],
  ["revision changed", CHANGED],
];

const snapshot = assassinationSnapshot({ fightIds: [1, 2], sourceIds: [19] });
const REQUEST = { reportCode: REPORT_CODE, fightIds: [1, 2] };

function night(
  options: Omit<FakePortOptions, "snapshot">,
  diagnostics?: (record: RaidNightDiagnostic) => void,
) {
  const ports = fakePorts({ snapshot, ...options });
  const deps = diagnostics === undefined ? ports.deps : { ...ports.deps, diagnostics };
  return { ports, run: () => runNight(REQUEST, { ...ports, deps }) };
}

describe("the predicate: exactly one condition is retryable", () => {
  it("is true only for UNVERIFIED / UPSTREAM / UPSTREAM_UNAVAILABLE / isTimeout", () => {
    expect(isRetryableRevisionTimeout(TIMEOUT)).toBe(true);
    // The older AbortError spelling of a timeout qualifies through the same flag.
    expect(
      isRetryableRevisionTimeout(
        upstream("UPSTREAM_UNAVAILABLE", { errorName: "AbortError", isTimeout: true }),
      ),
    ).toBe(true);
    for (const [label, check] of NON_RETRYABLE) expect(isRetryableRevisionTimeout(check), label).toBe(false);
    expect(isRetryableRevisionTimeout(MATCHES)).toBe(false);
  });
});

describe("timeout, then the retry decides", () => {
  it("timeout → retry MATCHES → the raid night publishes, with exactly two revision calls and ONE recovery record", async () => {
    const received: RaidNightDiagnostic[] = [];
    const { ports, run } = night({ finalRevisions: [TIMEOUT, MATCHES] }, (record) => received.push(record));
    const result = await run();
    expect(result.ok).toBe(true);
    expect(ports.revisionCalls()).toBe(2);
    expect(ports.ingestedFightIds()).toEqual([1, 2]);
    expect(ports.rosterCalls()).toBe(1);
    expect(received).toEqual([
      {
        event: "RAID_NIGHT_REVISION_RETRY_RECOVERED",
        stage: "FINAL_REVISION_CHECK",
        retried: true,
        firstErrorName: "TimeoutError",
        firstIsTimeout: true,
        firstOutboundIndex: 55,
      },
    ]);
  });

  it("an ordinary first-check MATCHES emits nothing", async () => {
    const received: RaidNightDiagnostic[] = [];
    const { ports, run } = night({}, (record) => received.push(record));
    expect((await run()).ok).toBe(true);
    expect(ports.revisionCalls()).toBe(1);
    expect(received).toEqual([]);
  });

  it("the recovery record is closed-vocabulary only, and the production log line is the record verbatim", () => {
    const record = recoveredRecordOf(TIMEOUT);
    expect(Object.keys(record).sort()).toEqual(
      ["event", "stage", "retried", "firstErrorName", "firstIsTimeout", "firstOutboundIndex"].sort(),
    );
    expect(record.retried).toBe(true);
    expect(
      record.firstErrorName === null ||
        (THROWN_ERROR_NAMES as readonly string[]).includes(record.firstErrorName),
    ).toBe(true);
    expect(typeof record.firstIsTimeout).toBe("boolean");
    expect(Number.isInteger(record.firstOutboundIndex)).toBe(true);
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      logRaidNightDiagnostic(record);
      expect(log).toHaveBeenCalledTimes(1);
      const line = String(log.mock.calls[0]?.[0]);
      expect(JSON.parse(line)).toEqual(record);
      for (const forbidden of ["message", "Bearer", "authorization", "query", "stack"]) {
        expect(line, forbidden).not.toContain(forbidden);
      }
    } finally {
      log.mockRestore();
    }
  });

  it("a throwing diagnostics port during a recovery still publishes the byte-identical raid night", async () => {
    const reference = await night({ finalRevisions: [TIMEOUT, MATCHES] }).run();
    let calls = 0;
    const { ports, run } = night({ finalRevisions: [TIMEOUT, MATCHES] }, () => {
      calls += 1;
      throw new Error("logger failure");
    });
    const result = await run();
    expect(calls).toBe(1);
    expect(result.ok).toBe(true);
    expect(ports.revisionCalls()).toBe(2);
    expect(JSON.stringify(result)).toBe(JSON.stringify(reference));
    if (result.ok && reference.ok) {
      expect(JSON.stringify(projectRaidNightResult(result.aggregate))).toBe(
        JSON.stringify(projectRaidNightResult(reference.aggregate)),
      );
    }
  });

  it("the recovered raid night is byte-identical to one whose first check MATCHED", async () => {
    const reference = await night({}).run();
    const recovered = await night({ finalRevisions: [TIMEOUT, MATCHES] }).run();
    expect(reference.ok && recovered.ok).toBe(true);
    if (!reference.ok || !recovered.ok) return;
    expect(JSON.stringify(recovered.aggregate)).toBe(JSON.stringify(reference.aggregate));
    // And the public document, through the real projection, is the same and schema-valid.
    const projected = projectRaidNightResult(recovered.aggregate);
    expect(PublicRaidNightResultSchema.safeParse(projected).success).toBe(true);
    expect(JSON.stringify(projected)).toBe(JSON.stringify(projectRaidNightResult(reference.aggregate)));
    expect(projected.coverage.cellsAnalyzed).toBe(2);
  });

  it("timeout → retry CHANGED → fails closed with the revision-changed result", async () => {
    const received: RaidNightDiagnostic[] = [];
    const { ports, run } = night({ finalRevisions: [TIMEOUT, CHANGED] }, (record) => received.push(record));
    const result = await run();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("REPORT_REVISION_CHANGED");
    expect(ports.revisionCalls()).toBe(2);
    // CHANGED has its own public code and no unverified diagnostic.
    expect(received).toEqual([]);
  });

  it("timeout → retry timeout → REPORT_REVISION_UNVERIFIED, and the diagnostic describes the retry", async () => {
    const received: RaidNightDiagnostic[] = [];
    const { ports, run } = night({ finalRevisions: [TIMEOUT, TIMEOUT] }, (record) => received.push(record));
    const result = await run();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ code: "REPORT_REVISION_UNVERIFIED", message: UNVERIFIED_MESSAGE });
    // Exactly one retry: never a third call. Exactly one record, and it is the
    // UNVERIFIED one — no recovery record on a terminal failure.
    expect(ports.revisionCalls()).toBe(2);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      event: "RAID_NIGHT_REVISION_UNVERIFIED",
      cause: "UPSTREAM",
      reason: "UPSTREAM_UNAVAILABLE",
      errorName: "TimeoutError",
      isTimeout: true,
      retried: true,
    });
  });

  it("timeout → retry another upstream failure → REPORT_REVISION_UNVERIFIED, diagnostic = the terminal failure", async () => {
    const rateLimited = upstream("UPSTREAM_RATE_LIMITED", { httpStatus: 429 });
    const received: RaidNightDiagnostic[] = [];
    const { ports, run } = night({ finalRevisions: [TIMEOUT, rateLimited] }, (record) =>
      received.push(record),
    );
    const result = await run();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toEqual({ code: "REPORT_REVISION_UNVERIFIED", message: UNVERIFIED_MESSAGE });
    expect(ports.revisionCalls()).toBe(2);
    expect(received).toHaveLength(1);
    // The record is the retry's failure — not the first timeout.
    expect(received[0]).toMatchObject({
      cause: "UPSTREAM",
      reason: "UPSTREAM_RATE_LIMITED",
      httpStatus: 429,
      isTimeout: null,
      errorName: null,
      retried: true,
    });
  });

  it("timeout → retry REPORT_NOT_SERVED → REPORT_REVISION_UNVERIFIED with cause REPORT_NOT_SERVED, retried", async () => {
    const received: RaidNightDiagnostic[] = [];
    const { ports, run } = night({ finalRevisions: [TIMEOUT, NOT_SERVED] }, (record) =>
      received.push(record),
    );
    const result = await run();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("REPORT_REVISION_UNVERIFIED");
    expect(ports.revisionCalls()).toBe(2);
    expect(received[0]).toMatchObject({ cause: "REPORT_NOT_SERVED", retried: true });
  });
});

describe("every non-timeout cause gets zero retries", () => {
  for (const [label, check] of NON_RETRYABLE) {
    it(`${label}: one revision call, the existing refusal, diagnostic marked not retried`, async () => {
      const received: RaidNightDiagnostic[] = [];
      // A MATCHES follows in the sequence; it must never be reached.
      const { ports, run } = night({ finalRevisions: [check, MATCHES] }, (record) => received.push(record));
      const result = await run();
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(ports.revisionCalls()).toBe(1);
      if (check.outcome === "CHANGED") {
        expect(result.error.code).toBe("REPORT_REVISION_CHANGED");
        expect(received).toEqual([]);
      } else {
        expect(result.error).toEqual({ code: "REPORT_REVISION_UNVERIFIED", message: UNVERIFIED_MESSAGE });
        expect(received).toHaveLength(1);
        expect(received[0]?.retried).toBe(false);
      }
    });
  }
});

describe("bounds and non-authority", () => {
  it("never makes a third call, whatever the sequence promises", async () => {
    const { ports, run } = night({ finalRevisions: [TIMEOUT, TIMEOUT, MATCHES, MATCHES] });
    const result = await run();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("REPORT_REVISION_UNVERIFIED");
    expect(ports.revisionCalls()).toBe(2);
  });

  it("a MATCHES on the first check still makes exactly one call", async () => {
    const { ports, run } = night({ finalRevisions: [MATCHES, TIMEOUT] });
    expect((await run()).ok).toBe(true);
    expect(ports.revisionCalls()).toBe(1);
  });

  it("the timed-out first check publishes nothing on its own: a retry that cannot decide refuses", async () => {
    // If the service ever used the first (timed-out) check or cached revision
    // state to publish, this would be ok:true.
    const { run } = night({
      finalRevisions: [TIMEOUT, upstream("UPSTREAM_UNAVAILABLE", { httpStatus: 502 })],
    });
    const result = await run();
    expect(result.ok).toBe(false);
  });

  it("a throwing diagnostics port after a failed retry still yields the exact public result", async () => {
    const reference = await night({ finalRevisions: [TIMEOUT, TIMEOUT] }).run();
    const { run } = night({ finalRevisions: [TIMEOUT, TIMEOUT] }, () => {
      throw new Error("logger failure");
    });
    const result = await run();
    expect(JSON.stringify(result)).toBe(JSON.stringify(reference));
    if (!result.ok)
      expect(result.error).toEqual({ code: "REPORT_REVISION_UNVERIFIED", message: UNVERIFIED_MESSAGE });
  });
});
