/**
 * A nested composition is charged ONCE, and the charge is the outer request's.
 *
 * THE DEFECT THIS EXISTS TO CATCH
 *
 * Encounter context composes raid night. Raid night is itself a public, metered
 * endpoint. The obvious way to build this — have the encounter-context service
 * call the raid-night RUNNER — would have worked perfectly, returned correct
 * documents, and quietly billed every caller twice: once for the encounter-
 * context units, and again for the raid-night units underneath.
 *
 * Double-charging is invisible from the outside. The response is right, the
 * latency is right, nothing errors; a caller simply reaches the limit in half
 * the requests they expected, and the cause looks like an over-tight limit
 * rather than a composition defect. A reviewer cannot see it either, because
 * nothing at either call site looks wrong on its own.
 *
 * WHY THIS IS A BEHAVIOURAL TEST AND NOT ONLY A SOURCE SCAN
 *
 * `m8g-encounter-context-layering.test.ts` already asserts STATICALLY that the
 * limiter is reachable from exactly three modules. That catches a new call site.
 * It cannot catch a call site that already exists being reached twice down a
 * path the scan reads as one. So this test runs the REAL composition — the real
 * encounter-context service, over the real raid-night service, through the real
 * REST route and the real MCP tool — with a counting limiter, and counts.
 *
 * NON-VACUITY IS ASSERTED, NOT ASSUMED. Zero charges would also satisfy "not
 * twice", so every case additionally proves the nested work genuinely ran: the
 * fights were ingested, and the document came back.
 */

import { describe, expect, it } from "vitest";

import { createWorker, type WorkerDeps } from "../../src/api/worker.js";
import { handleMcpRequest } from "../../src/mcp/server.js";
import type { Env } from "../../src/config/env.js";
import type { RateLimiterPort } from "../../src/runtime/rate-limit.js";
import { ANALYSIS_TEST_TOKEN, authHeaders } from "../support/analysis-transports.js";
import { analyzeEncounterContext } from "../../src/services/encounter-context-service.js";
import {
  encounterContextAdmissionUnits,
  type EncounterContextRunner,
} from "../../src/services/encounter-context-runner.js";
import {
  parseEncounterContextRequest,
  type EncounterContextRequest,
} from "../../src/services/encounter-context-request.js";
import type { ExternalDiscoveryPorts } from "../../src/external-context/external-discovery.js";
import { decodeRankingPayload } from "../../src/wcl/rankings/rankings-decoder.js";
import { rankingPayload, rankingRow, candidateReport } from "../support/m8f-fixture.js";
import {
  assassinationSnapshot,
  fakePorts,
  ENV,
  M5D2_ACTOR,
  REPORT_CODE,
} from "../support/raid-night-orchestration-fixture.js";

const HOST = "warcraft-logs-coach-vnext.brandon-williams-323.workers.dev";
const PATH = `https://${HOST}/v1/encounter-context`;
/**
 * The orchestration fixture's env, plus the INBOUND analysis token.
 *
 * That fixture describes a configured Warcraft Logs backend and predates both
 * transports, so it carries no inbound credential. The two are unrelated
 * secrets and stay separate; this test needs both.
 */
const TRANSPORT_ENV: Env = { ...ENV, ANALYSIS_AUTH_TOKEN: ANALYSIS_TEST_TOKEN };
const AUTH = authHeaders();

const FIGHT_IDS = [1, 2, 3] as const;
/** `rosterFightFor`'s defaults, which `assassinationSnapshot` inherits. */
const FIXTURE_ENCOUNTER_ID = 2900;
const FIXTURE_DIFFICULTY = 5;

const EXTERNAL_OPTION = {
  mode: "ENABLED",
  subjectFightId: 1,
  className: "Rogue",
  specName: "Assassination",
  metric: "dps",
  partition: { mode: "PINNED", partition: 3 },
} as const;

const LOCAL_BODY = { reportCode: REPORT_CODE, fightIds: [...FIGHT_IDS] };
const EXTERNAL_BODY = { ...LOCAL_BODY, externalReferences: EXTERNAL_OPTION };

function requestOf(body: Record<string, unknown>): EncounterContextRequest {
  const parsed = parseEncounterContextRequest(body);
  if (!parsed.ok) throw new Error(`fixture request rejected: ${JSON.stringify(parsed.issues)}`);
  return parsed.request;
}

function countingLimiter() {
  const keys: string[] = [];
  return {
    keys: () => [...keys],
    calls: () => keys.length,
    limiter: {
      limit: async ({ key }: { key: string }) => {
        keys.push(key);
        return { success: true };
      },
    } satisfies RateLimiterPort,
  };
}

interface ExternalCounters {
  rankingCalls: number;
  metadataCalls: number;
}

function externalPorts(counters: ExternalCounters): ExternalDiscoveryPorts {
  return {
    rankingPage: async () => {
      counters.rankingCalls += 1;
      return decodeRankingPayload(
        rankingPayload([
          rankingRow({ code: "EXTREPORT000001", fightID: 3, durationMs: 300_000 }),
          rankingRow({ code: "EXTREPORT000002", fightID: 4, durationMs: 310_000 }),
        ]),
      );
    },
    candidateMetadata: async (reportCode, fightId) => {
      counters.metadataCalls += 1;
      return candidateReport({
        code: reportCode,
        fightId,
        encounterId: FIXTURE_ENCOUNTER_ID,
        difficulty: FIXTURE_DIFFICULTY,
      });
    },
  };
}

/**
 * The genuine runner: the real service over the real M7 orchestration.
 *
 * Only the two I/O ports are faked. Nothing about metering, composition or
 * projection is stubbed, which is what makes the count below meaningful.
 */
function realRunner(external?: ExternalDiscoveryPorts) {
  const fixture = fakePorts({
    snapshot: assassinationSnapshot({ fightIds: [...FIGHT_IDS], sourceIds: [M5D2_ACTOR] }),
  });
  const { env: _env, ...ports } = fixture.deps;
  const runner: EncounterContextRunner = async (request) =>
    await analyzeEncounterContext(request, {
      env: ENV,
      raidNight: ports,
      ...(external === undefined ? {} : { external }),
    });
  return { runner, fixture };
}

function workerDeps(runner: EncounterContextRunner, limiter: RateLimiterPort): WorkerDeps {
  const unbound = async () => {
    throw new Error("no other runner may be reached by an encounter-context request");
  };
  return {
    analysisRunner: () => unbound as never,
    raidNightRunner: () => unbound as never,
    encounterContextRunner: () => runner,
    rateLimiter: () => limiter,
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

async function postRest(body: Record<string, unknown>, external?: ExternalDiscoveryPorts) {
  const counter = countingLimiter();
  const { runner, fixture } = realRunner(external);
  const response = await createWorker(workerDeps(runner, counter.limiter)).fetch(
    new Request(PATH, {
      method: "POST",
      headers: { "content-type": "application/json", ...AUTH },
      body: JSON.stringify(body),
    }),
    TRANSPORT_ENV,
  );
  return { response, counter, fixture };
}

/** The M6 stateless-legacy `_meta`, unchanged. */
const MCP_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "m8h-charge-test", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;

async function callMcpTool(args: Record<string, unknown>, external?: ExternalDiscoveryPorts) {
  const counter = countingLimiter();
  const { runner, fixture } = realRunner(external);
  const body = {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "analyze_encounter_context",
      arguments: args,
      _meta: MCP_META,
    },
  };
  const response = await createWorker(workerDeps(runner, counter.limiter)).fetch(
    new Request(`https://${HOST}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        host: HOST,
        "mcp-method": "tools/call",
        "mcp-name": "analyze_encounter_context",
        ...AUTH,
      },
      body: JSON.stringify(body),
    }),
    TRANSPORT_ENV,
  );
  return { payload: (await response.json()) as Record<string, any>, counter, fixture };
}

describe("composing raid night does not charge the raid-night budget again", () => {
  it("charges a local-only request exactly its own units, once", async () => {
    const expected = encounterContextAdmissionUnits(requestOf(LOCAL_BODY));
    expect(expected).toBe(FIGHT_IDS.length);

    const { response, counter, fixture } = await postRest(LOCAL_BODY);

    expect(response.status).toBe(200);
    // Three fights really WERE ingested through the nested raid-night service,
    // so the count below is not "nothing happened, nothing was charged".
    expect(fixture.ingestedFightIds()).toEqual([...FIGHT_IDS]);
    expect(counter.calls()).toBe(expected);
    // Not 2x. The failure mode has a specific shape, so name it.
    expect(counter.calls()).not.toBe(expected * 2);
  });

  it("charges an external-enabled request exactly its own units, once", async () => {
    const expected = encounterContextAdmissionUnits(requestOf(EXTERNAL_BODY));
    expect(expected).toBe(FIGHT_IDS.length + 6);

    const counters: ExternalCounters = { rankingCalls: 0, metadataCalls: 0 };
    const { response, counter, fixture } = await postRest(EXTERNAL_BODY, externalPorts(counters));

    expect(response.status).toBe(200);
    expect(fixture.ingestedFightIds()).toEqual([...FIGHT_IDS]);
    // The external phase genuinely ran; the six units bought real requests.
    expect(counters.rankingCalls).toBe(1);
    expect(counters.metadataCalls).toBeGreaterThan(0);
    expect(counter.calls()).toBe(expected);
    expect(counter.calls()).not.toBe(expected * 2);
  });

  it("charges the MCP tool identically to REST for the same work", async () => {
    const expected = encounterContextAdmissionUnits(requestOf(LOCAL_BODY));

    const { payload, counter, fixture } = await callMcpTool({
      source: "ids",
      reportCode: REPORT_CODE,
      fightIds: [...FIGHT_IDS],
    });

    expect(payload["result"]?.["isError"]).toBeUndefined();
    expect(payload["result"]?.["structuredContent"]).toBeDefined();
    expect(fixture.ingestedFightIds()).toEqual([...FIGHT_IDS]);
    expect(counter.calls()).toBe(expected);
  });

  it("spends every unit on the one shared key, so a second endpoint cannot get a second allowance", async () => {
    // A private encounter-context key would have hidden the double charge AND
    // handed the new endpoint its own quota on top of the existing one.
    const { counter } = await postRest(EXTERNAL_BODY, externalPorts({ rankingCalls: 0, metadataCalls: 0 }));
    expect(new Set(counter.keys())).toEqual(new Set(["analysis:warcraft_log"]));
  });

  it("charges before the nested work, not after it", async () => {
    // Ordering matters as much as the count: a limiter consulted after
    // retrieval has already spent the Warcraft Logs quota it was protecting.
    const order: string[] = [];
    const fixture = fakePorts({
      snapshot: assassinationSnapshot({ fightIds: [...FIGHT_IDS], sourceIds: [M5D2_ACTOR] }),
    });
    const { env: _env, ...ports } = fixture.deps;
    const limiter: RateLimiterPort = {
      limit: async () => {
        order.push("charge");
        return { success: true };
      },
    };
    const runner: EncounterContextRunner = async (request) => {
      order.push("run");
      return await analyzeEncounterContext(request, {
        env: ENV,
        raidNight: {
          ...ports,
          discoverRoster: async (...args) => {
            order.push("roster");
            return await ports.discoverRoster(...args);
          },
        },
      });
    };

    const response = await createWorker(workerDeps(runner, limiter)).fetch(
      new Request(PATH, {
        method: "POST",
        headers: { "content-type": "application/json", ...AUTH },
        body: JSON.stringify(LOCAL_BODY),
      }),
      TRANSPORT_ENV,
    );

    expect(response.status).toBe(200);
    expect(order).toEqual(["charge", "charge", "charge", "run", "roster"]);
  });
});
