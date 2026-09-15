/**
 * `/v1/encounter-context` and `analyze_encounter_context`, over one runner.
 *
 * WHAT THESE PROVE THAT A UNIT TEST CANNOT
 *
 *   PARITY     both transports render ONE application result. The proof is
 *              deep equality between REST JSON, MCP `structuredContent` and
 *              `JSON.parse(MCP text)` — driven through the real Worker and the
 *              real MCP handler, not through two hand-built documents.
 *
 *   ADMISSION  the unit count is charged BEFORE any Warcraft Logs work, on the
 *              shared key, and a refusal reaches no runner. Counted on a real
 *              limiter stub rather than asserted from the source.
 *
 *   NO DOUBLE  encounter context composes the raid-night SERVICE, and the
 *   CHARGE     raid-night limiter charge lives in the raid-night TRANSPORT — so
 *              a nested night is metered once, by the outer request.
 */

import { describe, expect, it } from "vitest";

import { createWorker, type WorkerDeps } from "../../src/api/worker.js";
import { handleMcpRequest } from "../../src/mcp/server.js";
import type { Env } from "../../src/config/env.js";
import type { RateLimiterPort } from "../../src/runtime/rate-limit.js";
import type {
  EncounterContextRunner,
  EncounterContextRunResult,
} from "../../src/services/encounter-context-runner.js";
import {
  encounterContextAdmissionUnits,
  MAX_ENCOUNTER_CONTEXT_ADMISSION_UNITS,
} from "../../src/services/encounter-context-runner.js";
import { parseEncounterContextRequest } from "../../src/services/encounter-context-request.js";
import { projectEncounterContextResult } from "../../src/contracts/encounter-context-projection.js";
import { PublicEncounterContextResultSchema } from "../../src/contracts/encounter-context-contract.js";
import { buildRaidNightProgression } from "../../src/progression/encounter-progression.js";
import { aggregateOf, analyzedCell, rosterFightFor, rosterPlayerFor } from "../support/raid-night-fixture.js";

const ENV: Env = {
  ENVIRONMENT: "test",
  WCL_CLIENT_ID: "fake-client-id-not-real",
  WCL_CLIENT_SECRET: "fake-client-secret-not-real",
  ANALYSIS_AUTH_TOKEN: "fake-analysis-token-not-real",
};

const HOST = "warcraft-logs-coach-vnext.brandon-williams-323.workers.dev";
const AUTH = { authorization: `Bearer ${ENV.ANALYSIS_AUTH_TOKEN ?? ""}` };
const ENCOUNTER_CONTEXT_PATH = `https://${HOST}/v1/encounter-context`;
const TOOL_NAME = "analyze_encounter_context";

/** Accented Latin, a typographic apostrophe, and an astral-plane character. */
const UNICODE_MARKER = "D\u00ECssar\u2019s Abyss \u{1F409}";
const REPORT = "aBcDeFgH12345678";

/** A recording limiter, so unit counts are observed rather than asserted. */
function countingLimiter(outcome: "ALLOW" | "DENY" | "THROW" = "ALLOW") {
  let calls = 0;
  const keys: string[] = [];
  const limiter: RateLimiterPort = {
    limit: async ({ key }) => {
      calls += 1;
      keys.push(key);
      if (outcome === "THROW") throw new Error("limiter down");
      return { success: outcome === "ALLOW" };
    },
  };
  return { limiter, calls: () => calls, keys: () => [...keys] };
}

/**
 * A runner over a real projected document.
 *
 * The ZONE NAME carries the non-ASCII characters, because that is what this
 * document actually publishes: player progression is keyed by `playerKey` and
 * `sourceId`, and a display name appears nowhere in `encounter-context/1`. A
 * Unicode test aimed at a field the document does not contain would pass for
 * the wrong reason.
 */
function fixtureAnalysis(zoneName = UNICODE_MARKER) {
  const fightIds = [1, 2];
  const aggregate = aggregateOf({
    players: [rosterPlayerFor({ sourceId: 5 })],
    fights: fightIds.map((fightId) =>
      rosterFightFor({
        fightId,
        participants: [{ sourceId: 5, specName: "Assassination" }],
        encounterId: 3420,
        difficulty: 4,
        kill: fightId === 2,
        startTimeMs: fightId * 10_000,
        endTimeMs: fightId * 10_000 + 5_000 + fightId * 100,
      }),
    ),
    cells: fightIds.map((fightId) => analyzedCell({ fightId, sourceId: 5 })),
  });
  return {
    progression: buildRaidNightProgression({
      aggregate,
      encounterFacts: fightIds.map((fightId) => ({
        fightId,
        outcome: {
          lastPhase: 1,
          lastPhaseAsAbsoluteIndex: 4,
          lastPhaseIsIntermission: false,
          bossPercentageRaw: 0.04,
          fightPercentageRaw: 0.04,
          wipeCalledReportTimeMs: null,
        },
        zone: { id: 53, name: zoneName, frozen: false, expansion: { id: 7, name: "Midnight" } },
      })),
    }),
    external: { kind: "SKIPPED", reason: "NOT_REQUESTED" },
  } as const;
}

function runnerFor(result: EncounterContextRunResult, onCall?: () => void): EncounterContextRunner {
  return async () => {
    onCall?.();
    return result;
  };
}

const OK_RESULT: EncounterContextRunResult = { ok: true, analysis: fixtureAnalysis() };

function depsFor(options: {
  readonly runner?: EncounterContextRunner;
  readonly limiter?: RateLimiterPort | undefined;
}): WorkerDeps {
  const runner = options.runner ?? runnerFor(OK_RESULT);
  const unbound = async () => {
    throw new Error("this runner must not be reached in an encounter-context test");
  };
  return {
    analysisRunner: () => unbound as never,
    raidNightRunner: () => unbound as never,
    encounterContextRunner: () => runner,
    rateLimiter: () => options.limiter,
    mcp: async (request, env, deps) =>
      await handleMcpRequest(request, env, {
        analyze: unbound as never,
        analyzeRaidNight: unbound as never,
        analyzeEncounterContext: deps.encounterContextRunner(env),
        rateLimiter: deps.rateLimiter(env),
      }),
    version: "0.1.0",
  };
}

async function post(body: unknown, deps: WorkerDeps, headers: Record<string, string> = AUTH) {
  return await createWorker(deps).fetch(
    new Request(ENCOUNTER_CONTEXT_PATH, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    }),
    ENV,
  );
}

const LOCAL_BODY = { reportCode: REPORT, fightIds: [1, 2] };
const EXTERNAL_BODY = {
  reportCode: REPORT,
  fightIds: [1, 2],
  externalReferences: {
    mode: "ENABLED",
    subjectFightId: 1,
    className: "Rogue",
    specName: "Assassination",
    metric: "dps",
    partition: { mode: "PINNED", partition: 3 },
  },
};

// ---------------------------------------------------------------------------
// REST
// ---------------------------------------------------------------------------

describe("POST /v1/encounter-context", () => {
  it("returns 200 and a valid encounter-context/1 document", async () => {
    const response = await post(LOCAL_BODY, depsFor({ limiter: countingLimiter().limiter }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body["schemaVersion"]).toBe("warcraft-logs-coach.encounter-context/1");
    expect(PublicEncounterContextResultSchema.safeParse(body).success).toBe(true);
  });

  it("accepts an external-enabled request", async () => {
    const response = await post(EXTERNAL_BODY, depsFor({ limiter: countingLimiter().limiter }));
    expect(response.status).toBe(200);
  });

  it("rejects GET with 405", async () => {
    const response = await createWorker(depsFor({ limiter: countingLimiter().limiter })).fetch(
      new Request(ENCOUNTER_CONTEXT_PATH, { method: "GET", headers: AUTH }),
      ENV,
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("rejects an unauthenticated request with 401 and a Bearer challenge", async () => {
    const counter = countingLimiter();
    let reached = 0;
    const response = await post(
      LOCAL_BODY,
      depsFor({ runner: runnerFor(OK_RESULT, () => (reached += 1)), limiter: counter.limiter }),
      {},
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    // Authentication precedes metering AND the runner: an anonymous caller
    // spends nothing.
    expect(counter.calls()).toBe(0);
    expect(reached).toBe(0);
  });

  it("rejects malformed JSON before metering", async () => {
    const counter = countingLimiter();
    const response = await post("{not json", depsFor({ limiter: counter.limiter }));
    expect(response.status).toBe(400);
    expect(counter.calls()).toBe(0);
  });

  it("rejects an invalid request before metering or retrieval", async () => {
    const counter = countingLimiter();
    let reached = 0;
    const response = await post(
      { reportCode: REPORT },
      depsFor({ runner: runnerFor(OK_RESULT, () => (reached += 1)), limiter: counter.limiter }),
    );
    expect(response.status).toBe(400);
    expect(counter.calls()).toBe(0);
    expect(reached).toBe(0);
  });

  it("rejects an enabled request whose partition is missing, before any work", async () => {
    const counter = countingLimiter();
    let reached = 0;
    const response = await post(
      {
        reportCode: REPORT,
        fightIds: [1],
        externalReferences: {
          mode: "ENABLED",
          subjectFightId: 1,
          className: "Rogue",
          specName: "Assassination",
          metric: "dps",
        },
      },
      depsFor({ runner: runnerFor(OK_RESULT, () => (reached += 1)), limiter: counter.limiter }),
    );
    expect(response.status).toBe(400);
    expect(counter.calls()).toBe(0);
    expect(reached).toBe(0);
  });

  it("returns the existing rate-limited status when the limiter denies", async () => {
    const counter = countingLimiter("DENY");
    let reached = 0;
    const response = await post(
      LOCAL_BODY,
      depsFor({ runner: runnerFor(OK_RESULT, () => (reached += 1)), limiter: counter.limiter }),
    );
    expect(response.status).toBe(429);
    // Denied on the first attempt, and the runner is never reached.
    expect(counter.calls()).toBe(1);
    expect(reached).toBe(0);
  });

  it("fails closed when the limiter throws", async () => {
    let reached = 0;
    const response = await post(
      LOCAL_BODY,
      depsFor({
        runner: runnerFor(OK_RESULT, () => (reached += 1)),
        limiter: countingLimiter("THROW").limiter,
      }),
    );
    expect(response.status).toBe(503);
    expect(reached).toBe(0);
  });

  it("fails closed when the limiter binding is absent", async () => {
    let reached = 0;
    const response = await post(
      LOCAL_BODY,
      depsFor({ runner: runnerFor(OK_RESULT, () => (reached += 1)), limiter: undefined }),
    );
    expect(response.status).toBe(503);
    expect(reached).toBe(0);
  });

  it("returns 200 for a document whose external discovery failed", async () => {
    // An external retrieval failure is not a request failure: the local
    // progression is complete and truthful.
    const response = await post(
      EXTERNAL_BODY,
      depsFor({
        limiter: countingLimiter().limiter,
        runner: runnerFor({
          ok: true,
          analysis: {
            progression: fixtureAnalysis().progression,
            external: {
              kind: "ATTEMPTED",
              discovery: {
                outcome: "POOL_UNKNOWN",
                reason: "RANKING_REQUEST_REJECTED",
                message: "declined",
                requestCount: 1,
              },
            },
          },
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { externalReferences: { status: string } };
    expect(body.externalReferences.status).toBe("REQUEST_REJECTED");
  });

  it("maps a local failure through the existing error convention", async () => {
    const response = await post(
      LOCAL_BODY,
      depsFor({
        limiter: countingLimiter().limiter,
        runner: runnerFor({
          ok: false,
          error: { code: "REPORT_NOT_ACCESSIBLE", message: "No such report." },
        }),
      }),
    );
    expect(response.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// Admission units
// ---------------------------------------------------------------------------

describe("admission charges the request's units before any work", () => {
  function unitsFor(body: Record<string, unknown>): number {
    const parsed = parseEncounterContextRequest(body);
    if (!parsed.ok) throw new Error("fixture request invalid");
    return encounterContextAdmissionUnits(parsed.request);
  }

  it.each([
    ["1 local fight", { reportCode: REPORT, fightIds: [1] }, 1],
    ["4 local fights", { reportCode: REPORT, fightIds: [1, 2, 3, 4] }, 4],
  ])("charges %s as %i units", async (_label, body, expected) => {
    expect(unitsFor(body)).toBe(expected);
    const counter = countingLimiter();
    await post(body, depsFor({ limiter: counter.limiter }));
    expect(counter.calls()).toBe(expected);
  });

  it.each([
    ["1 fight + external", 1, 7],
    ["4 fights + external", 4, 10],
  ])("charges %s as %i units", async (_label, fightCount, expected) => {
    const body = {
      reportCode: REPORT,
      fightIds: Array.from({ length: fightCount }, (_, index) => index + 1),
      externalReferences: {
        mode: "ENABLED",
        subjectFightId: 1,
        className: "Rogue",
        specName: "Assassination",
        metric: "dps",
        partition: { mode: "LATEST" },
      },
    };
    expect(unitsFor(body)).toBe(expected);
    const counter = countingLimiter();
    await post(body, depsFor({ limiter: counter.limiter }));
    expect(counter.calls()).toBe(expected);
  });

  it("never exceeds the pinned maximum", () => {
    expect(MAX_ENCOUNTER_CONTEXT_ADMISSION_UNITS).toBe(10);
    expect(
      unitsFor({
        reportCode: REPORT,
        fightIds: [1, 2, 3, 4],
        externalReferences: {
          mode: "ENABLED",
          subjectFightId: 1,
          className: "Rogue",
          specName: "Assassination",
          metric: "dps",
          partition: { mode: "PINNED", partition: 1 },
        },
      }),
    ).toBe(MAX_ENCOUNTER_CONTEXT_ADMISSION_UNITS);
  });

  it("charges every unit against the ONE shared analysis key", async () => {
    const counter = countingLimiter();
    await post({ reportCode: REPORT, fightIds: [1, 2, 3] }, depsFor({ limiter: counter.limiter }));
    expect(new Set(counter.keys())).toEqual(new Set(["analysis:warcraft_log"]));
  });

  it("charges the SAME units whether external discovery succeeds or fails", async () => {
    // Priced from the request. A cheap outcome must not be a cheap request, or a
    // failing call becomes the cheapest way to probe the API repeatedly.
    const succeeded = countingLimiter();
    await post(EXTERNAL_BODY, depsFor({ limiter: succeeded.limiter }));

    const failed = countingLimiter();
    await post(
      EXTERNAL_BODY,
      depsFor({
        limiter: failed.limiter,
        runner: runnerFor({
          ok: true,
          analysis: {
            progression: fixtureAnalysis().progression,
            external: {
              kind: "ATTEMPTED",
              discovery: { outcome: "POOL_UNKNOWN", reason: "ENCOUNTER_NOT_FOUND", requestCount: 1 },
            },
          },
        }),
      }),
    );
    expect(failed.calls()).toBe(succeeded.calls());
  });

  it("does not silently reduce work when a later unit is refused", async () => {
    // Deny on the third attempt of a four-unit request.
    let calls = 0;
    let reached = 0;
    const limiter: RateLimiterPort = {
      limit: async () => {
        calls += 1;
        return { success: calls < 3 };
      },
    };
    const response = await post(
      { reportCode: REPORT, fightIds: [1, 2, 3, 4] },
      depsFor({ runner: runnerFor(OK_RESULT, () => (reached += 1)), limiter }),
    );
    expect(response.status).toBe(429);
    // Stopped at the refusal; no fallback to a cheaper request shape.
    expect(calls).toBe(3);
    expect(reached).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// MCP
// ---------------------------------------------------------------------------

/**
 * The M6 envelope, unchanged.
 *
 * Encounter context passes the SAME protocol requirements as the other two
 * tools — the namespaced `_meta`, the `Mcp-Method` and `Mcp-Name` headers, the
 * host allowlist and the Bearer token. No handshake is introduced and no
 * envelope rule is relaxed for the new tool.
 */
const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "m8h-test-client", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;

let nextId = 1;

function mcpRequest(method: string, params: unknown) {
  return new Request(`https://${HOST}/mcp`, {
    method: "POST",
    headers: {
      host: HOST,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      ...AUTH,
      "mcp-method": method,
      ...(method === "tools/call" ? { "mcp-name": TOOL_NAME } : {}),
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
  });
}

async function callTool(
  args: unknown,
  options: { readonly runner?: EncounterContextRunner; readonly limiter?: RateLimiterPort | undefined } = {},
) {
  const unbound = async () => {
    throw new Error("must not be reached");
  };
  const response = await handleMcpRequest(
    mcpRequest("tools/call", {
      name: TOOL_NAME,
      arguments: args,
      _meta: MODERN_META,
    }),
    ENV,
    {
      analyze: unbound as never,
      analyzeRaidNight: unbound as never,
      analyzeEncounterContext: options.runner ?? runnerFor(OK_RESULT),
      rateLimiter: "limiter" in options ? options.limiter : countingLimiter().limiter,
    },
  );
  return JSON.parse(await response.text()) as {
    result?: {
      isError?: boolean;
      structuredContent?: unknown;
      content?: readonly { type: string; text: string }[];
    };
  };
}

const MCP_LOCAL_ARGS = { source: "ids", reportCode: REPORT, fightIds: [1, 2] };

describe("analyze_encounter_context", () => {
  it("is listed as the third analysis tool", async () => {
    const unbound = async () => {
      throw new Error("must not be reached");
    };
    const response = await handleMcpRequest(mcpRequest("tools/list", { _meta: MODERN_META }), ENV, {
      analyze: unbound as never,
      analyzeRaidNight: unbound as never,
      analyzeEncounterContext: runnerFor(OK_RESULT),
      rateLimiter: countingLimiter().limiter,
    });
    const payload = JSON.parse(await response.text()) as {
      result: { tools: readonly { name: string }[] };
    };
    const names = payload.result.tools.map((tool) => tool.name).sort();
    expect(names).toEqual(["analyze_encounter_context", "analyze_raid_night", "analyze_warcraft_log"]);
  });

  it("returns a valid document as structuredContent and text", async () => {
    const payload = await callTool(MCP_LOCAL_ARGS);
    expect(payload.result?.isError).toBeFalsy();
    const structured = payload.result?.structuredContent;
    expect(PublicEncounterContextResultSchema.safeParse(structured).success).toBe(true);
    expect(JSON.parse(payload.result?.content?.[0]?.text ?? "{}")).toEqual(structured);
  });

  it("accepts an external-enabled call", async () => {
    const payload = await callTool({
      source: "ids",
      reportCode: REPORT,
      fightIds: [1, 2],
      externalReferences: EXTERNAL_BODY.externalReferences,
    });
    expect(payload.result?.isError).toBeFalsy();
  });

  it("refuses an invalid request without retrieval or metering", async () => {
    const counter = countingLimiter();
    let reached = 0;
    const payload = await callTool(
      { source: "ids", reportCode: REPORT, fightIds: [] },
      { runner: runnerFor(OK_RESULT, () => (reached += 1)), limiter: counter.limiter },
    );
    expect(payload.result?.isError).toBe(true);
    expect(counter.calls()).toBe(0);
    expect(reached).toBe(0);
  });

  it("charges the same units REST charges", async () => {
    const counter = countingLimiter();
    await callTool({ source: "ids", reportCode: REPORT, fightIds: [1, 2, 3] }, { limiter: counter.limiter });
    expect(counter.calls()).toBe(3);
  });

  it("reports a denied limiter as a tool error without reaching the runner", async () => {
    let reached = 0;
    const payload = await callTool(MCP_LOCAL_ARGS, {
      runner: runnerFor(OK_RESULT, () => (reached += 1)),
      limiter: countingLimiter("DENY").limiter,
    });
    expect(payload.result?.isError).toBe(true);
    expect(reached).toBe(0);
  });

  it("fails closed when the limiter is absent", async () => {
    let reached = 0;
    const payload = await callTool(MCP_LOCAL_ARGS, {
      runner: runnerFor(OK_RESULT, () => (reached += 1)),
      limiter: undefined,
    });
    expect(payload.result?.isError).toBe(true);
    expect(reached).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Parity
// ---------------------------------------------------------------------------

describe("REST and MCP render one application result", () => {
  it("produces deep-equal REST JSON, structuredContent and text", async () => {
    const rest = await post(LOCAL_BODY, depsFor({ limiter: countingLimiter().limiter }));
    const restBody = await rest.json();

    const payload = await callTool(MCP_LOCAL_ARGS);
    const structured = payload.result?.structuredContent;
    const text = JSON.parse(payload.result?.content?.[0]?.text ?? "{}");

    expect(structured).toEqual(restBody);
    expect(text).toEqual(restBody);
    // Byte equality too, which also pins key order.
    expect(JSON.stringify(structured)).toBe(JSON.stringify(restBody));
  });

  it("preserves non-ASCII text identically on both transports", async () => {
    // The M7 production issue was a DECODING one at the client; the server must
    // emit the same characters either way and declare a charset, and the shared
    // MCP boundary is what adds it.
    const rest = await post(LOCAL_BODY, depsFor({ limiter: countingLimiter().limiter }));
    expect(rest.headers.get("content-type")?.toLowerCase()).toContain("charset=utf-8");
    // Decoded from RAW BYTES, so a mis-declared charset shows up here.
    const restText = new TextDecoder("utf-8").decode(await rest.arrayBuffer());
    expect(restText).toContain(UNICODE_MARKER);

    const payload = await callTool(MCP_LOCAL_ARGS);
    expect(JSON.stringify(payload.result?.structuredContent)).toContain(UNICODE_MARKER);
    expect(payload.result?.content?.[0]?.text).toContain(UNICODE_MARKER);
  });

  it("agrees on the same document for an external-enabled request", async () => {
    const rest = await post(EXTERNAL_BODY, depsFor({ limiter: countingLimiter().limiter }));
    const restBody = await rest.json();
    const payload = await callTool({
      source: "ids",
      reportCode: REPORT,
      fightIds: [1, 2],
      externalReferences: EXTERNAL_BODY.externalReferences,
    });
    expect(payload.result?.structuredContent).toEqual(restBody);
  });

  it("projects the same document the pure projection produces", async () => {
    // One projection definition, three call sites.
    const rest = await post(LOCAL_BODY, depsFor({ limiter: countingLimiter().limiter }));
    expect(await rest.json()).toEqual(
      projectEncounterContextResult(OK_RESULT.ok ? OK_RESULT.analysis : never()),
    );
  });
});

function never(): never {
  throw new Error("fixture result must be ok");
}
