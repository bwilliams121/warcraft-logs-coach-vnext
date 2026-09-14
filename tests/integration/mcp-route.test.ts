/**
 * M6-A — the MCP transport proof.
 *
 * WHAT THIS FILE IS FOR
 *
 * M6-A adds a dependency and a route, and claims that together they serve MCP
 * correctly inside this Worker without disturbing anything already here. That is
 * a claim about a runtime, not about types, so every assertion below drives the
 * REAL default export through workerd via `SELF` wherever it can.
 *
 * WHAT IT IS NOT
 *
 * Not a test of any analysis. The only tool registered in M6-A is the temporary
 * `ping` probe, and this file goes away with it in M6-D — apart from the guards
 * that outlive it (auth, Host/Origin, route isolation), which move to the
 * `analyze_warcraft_log` suite rather than being deleted.
 *
 * EVERYTHING HERE IS OFFLINE. The pool answers every outbound request locally,
 * and no MCP client, Warcraft Logs endpoint or deployed Worker is contacted.
 */

import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { createWorker } from "../../src/api/worker.js";
import type { Env } from "../../src/config/env.js";
import { handleMcpRequest, PRODUCTION_MCP_HOSTNAME } from "../../src/mcp/server.js";
import { PING_OUTPUT_SCHEMA, PING_SERVICE_ID } from "../../src/mcp/tools/ping.js";
import { analyzeFight, ENABLED_ANALYSIS_REQUIREMENTS } from "../../src/services/analysis-service.js";
import type { PreflightPort } from "../../src/wcl/types.js";

/** Matches the binding in vitest.config.ts. An obvious sentinel, never a real token. */
const TEST_TOKEN = "fake-mcp-token-not-real";

const MCP_URL = `https://${PRODUCTION_MCP_HOSTNAME}/mcp`;

/** Resolves without network I/O, standing in for a successful Warcraft Logs preflight. */
const RESOLVING_PREFLIGHT: PreflightPort = async () => ({
  ok: true,
  identity: {
    report: { code: "aBcDeFgH12345678", revision: 24, startTime: 0, endTime: 600_000 },
    data: { logVersion: 26, gameVersion: 1 },
    fight: {
      id: 8,
      name: "Test Encounter",
      encounterId: 2902,
      difficulty: 5,
      startTime: 0,
      endTime: 300_000,
    },
    player: { sourceId: 15, name: "Coachtest", className: "Rogue", specName: "Assassination" },
  },
  rateLimit: undefined,
});

/**
 * The 2026-07-28 per-request envelope.
 *
 * Modern MCP carries protocol version, client identity and client capabilities
 * on every request rather than negotiating them once, which is what makes the
 * protocol stateless. Spelled out literally rather than imported from the SDK,
 * so a change to the SDK's constants cannot silently rewrite what this test
 * claims to be sending.
 */
const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "m6a-test-client", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;

interface McpPost {
  readonly body: unknown;
  readonly headers?: Record<string, string>;
  readonly url?: string;
}

function mcpRequest({ body, headers = {}, url = MCP_URL }: McpPost): Request {
  return new Request(url, {
    method: "POST",
    headers: {
      // Set explicitly from the URL. Constructing a `Request` in-process does
      // not synthesize a Host header the way an HTTP client would, and the
      // Host check correctly refuses a request that carries none — so a test
      // that omitted it would be exercising the missing-header path every time
      // and never reach the allowlist it means to test.
      host: new URL(url).host,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
      authorization: `Bearer ${TEST_TOKEN}`,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

/** A modern (2026-07-28) call. Modern traffic mirrors method/name into headers. */
function modern(method: string, params: Record<string, unknown> = {}, id = 1): McpPost {
  const mcpHeaders: Record<string, string> = { "mcp-method": method };
  if (typeof params["name"] === "string") mcpHeaders["mcp-name"] = params["name"];
  return {
    body: { jsonrpc: "2.0", id, method, params: { ...params, _meta: MODERN_META } },
    headers: mcpHeaders,
  };
}

/** A 2025-era call: no envelope, no `Mcp-*` headers. */
function legacy(method: string, params: Record<string, unknown> = {}, id = 1): McpPost {
  return { body: { jsonrpc: "2.0", id, method, params } };
}

async function callSelf(post: McpPost): Promise<Response> {
  return await SELF.fetch(mcpRequest(post));
}

/** Reads a JSON-RPC payload from either a JSON body or an SSE-framed one. */
async function rpcPayload(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if ((response.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const line = text.split("\n").find((candidate) => candidate.startsWith("data: "));
    if (line === undefined) throw new Error(`no SSE data frame in: ${text}`);
    return JSON.parse(line.slice("data: ".length)) as Record<string, unknown>;
  }
  return JSON.parse(text) as Record<string, unknown>;
}

function resultOf(payload: Record<string, unknown>): Record<string, unknown> {
  const result = payload["result"];
  if (result === undefined) throw new Error(`expected a result, got: ${JSON.stringify(payload)}`);
  return result as Record<string, unknown>;
}

describe("the /mcp route exists and is reachable", () => {
  it("serves a modern tools/list through the real Worker", async () => {
    const response = await callSelf(modern("tools/list"));

    expect(response.status).toBe(200);
    expect(resultOf(await rpcPayload(response))).toHaveProperty("tools");
  });

  it("does not answer as the JSON API's not-found route", async () => {
    // Before M6-A this path fell through to NOT_FOUND. Proving it no longer
    // does is what makes "the route was actually added" a test rather than an
    // assumption.
    const response = await callSelf(modern("tools/list"));

    expect(response.status).not.toBe(404);
    expect(await response.text()).not.toContain("No such endpoint");
  });
});

describe("inbound bearer authorization fails closed", () => {
  const cases: readonly { readonly name: string; readonly headers: Record<string, string> }[] = [
    { name: "no Authorization header at all", headers: {} },
    { name: "an empty bearer token", headers: { authorization: "Bearer " } },
    { name: "a wrong bearer token", headers: { authorization: "Bearer not-the-configured-token" } },
    { name: "a token that is a prefix of the real one", headers: { authorization: "Bearer fake-mcp" } },
    { name: "the right token under the wrong scheme", headers: { authorization: `Basic ${TEST_TOKEN}` } },
    { name: "a bare token with no scheme", headers: { authorization: TEST_TOKEN } },
  ];

  for (const testCase of cases) {
    it(`rejects ${testCase.name} with 401`, async () => {
      const request = mcpRequest(modern("tools/list"));
      // Replace rather than merge: the helper supplies a valid token by default.
      request.headers.delete("authorization");
      for (const [key, value] of Object.entries(testCase.headers)) request.headers.set(key, value);

      const response = await SELF.fetch(request);

      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("Bearer");
    });
  }

  it("accepts the configured token", async () => {
    expect((await callSelf(modern("tools/list"))).status).toBe(200);
  });

  it("rejects every request when no token is configured, rather than opening up", async () => {
    // The deploy-time failure mode: the secret is missing and the endpoint
    // silently becomes public. An unset token must close the door, not remove it.
    const unconfigured: Env = { ENVIRONMENT: "test" };
    const worker = createWorker({
      analyze: analyzeFight,
      analyzers: ENABLED_ANALYSIS_REQUIREMENTS,
      preflight: (async () => {
        throw new Error("preflight must not run for an MCP request");
      }) as unknown as PreflightPort,
      mcp: handleMcpRequest,
      version: "0.1.0",
    });

    const response = await worker.fetch(
      mcpRequest({ ...modern("tools/list"), headers: { host: PRODUCTION_MCP_HOSTNAME } }),
      unconfigured,
    );

    expect(response.status).toBe(401);
  });

  it("gives an identical answer for a wrong token and an unconfigured server", async () => {
    // Differing bodies would tell a prober whether the deployment has a token
    // set at all, which is information they have no way to obtain otherwise.
    const wrongToken = mcpRequest(modern("tools/list"));
    wrongToken.headers.set("authorization", "Bearer definitely-not-the-token");

    const configuredWorker = createWorker({
      analyze: analyzeFight,
      analyzers: ENABLED_ANALYSIS_REQUIREMENTS,
      preflight: (async () => {
        throw new Error("unused");
      }) as unknown as PreflightPort,
      mcp: handleMcpRequest,
      version: "0.1.0",
    });

    const withToken = await configuredWorker.fetch(wrongToken.clone(), {
      ENVIRONMENT: "test",
      MCP_AUTH_TOKEN: TEST_TOKEN,
    });
    const withoutToken = await configuredWorker.fetch(wrongToken.clone(), { ENVIRONMENT: "test" });

    expect(withToken.status).toBe(withoutToken.status);
    expect(await withToken.text()).toBe(await withoutToken.text());
  });
});

describe("Host and Origin validation", () => {
  it("accepts the production Workers hostname", async () => {
    // The deployed hostname is in the allowlist, asserted against the real
    // constant rather than a value copied into the test.
    expect(MCP_URL).toContain("warcraft-logs-coach-vnext.brandon-williams-323.workers.dev");
    expect((await callSelf(modern("tools/list"))).status).toBe(200);
  });

  it("accepts localhost, for wrangler dev", async () => {
    const response = await SELF.fetch(mcpRequest({ ...modern("tools/list"), url: "http://localhost/mcp" }));

    expect(response.status).toBe(200);
  });

  it("rejects an unlisted Host with 403", async () => {
    const response = await SELF.fetch(mcpRequest({ ...modern("tools/list"), url: "https://coach.test/mcp" }));

    expect(response.status).toBe(403);
  });

  it("rejects a request carrying no Host header at all", async () => {
    // Deny on absence, not allow. A missing Host cannot be checked against an
    // allowlist, so it is refused rather than waved through.
    const request = mcpRequest(modern("tools/list"));
    request.headers.delete("host");

    expect((await SELF.fetch(request)).status).toBe(403);
  });

  it("rejects a disallowed browser Origin with 403", async () => {
    const response = await callSelf({
      ...modern("tools/list"),
      headers: { ...modern("tools/list").headers, origin: "https://evil.example.com" },
    });

    expect(response.status).toBe(403);
  });

  it("rejects an opaque null Origin with 403", async () => {
    const response = await callSelf({
      ...modern("tools/list"),
      headers: { ...modern("tools/list").headers, origin: "null" },
    });

    expect(response.status).toBe(403);
  });

  it("accepts the deployment's own Origin", async () => {
    const response = await callSelf({
      ...modern("tools/list"),
      headers: { ...modern("tools/list").headers, origin: `https://${PRODUCTION_MCP_HOSTNAME}` },
    });

    expect(response.status).toBe(200);
  });

  it("accepts a request with no Origin at all", async () => {
    // Correct, and not an oversight: ordinary MCP clients are not browsers and
    // send no Origin. Only a browser's declared origin is checked.
    const request = mcpRequest(modern("tools/list"));
    expect(request.headers.get("origin")).toBeNull();

    expect((await SELF.fetch(request)).status).toBe(200);
  });

  it("checks the Host before the token, so a valid token cannot bypass it", async () => {
    // DNS-rebinding protection has to hold even for an authorized caller,
    // otherwise a stolen token also buys a bypass of the rebinding guard.
    const response = await SELF.fetch(mcpRequest({ ...modern("tools/list"), url: "https://coach.test/mcp" }));

    expect(response.status).toBe(403);
    expect(response.status).not.toBe(401);
  });
});

describe("tools/list exposes exactly the temporary probe", () => {
  it("lists ping and nothing else", async () => {
    const result = resultOf(await rpcPayload(await callSelf(modern("tools/list"))));
    const tools = result["tools"] as readonly { readonly name: string }[];

    expect(tools.map((tool) => tool.name)).toEqual(["ping"]);
  });

  it("exposes no analysis tool yet", async () => {
    // M6-A must not ship the real tool early. Naming it here means the day it
    // appears, it appears deliberately.
    const body = await (await callSelf(modern("tools/list"))).text();

    expect(body).not.toContain("analyze_warcraft_log");
    expect(body).not.toContain("warcraftlogs.com");
  });

  it("advertises an input schema and an output schema", async () => {
    const result = resultOf(await rpcPayload(await callSelf(modern("tools/list"))));
    const tool = (result["tools"] as readonly Record<string, unknown>[])[0];

    expect(tool?.["inputSchema"]).toMatchObject({ type: "object" });
    expect(tool?.["outputSchema"]).toMatchObject({ type: "object" });
  });

  it("declares read-only, closed-world annotations", async () => {
    const result = resultOf(await rpcPayload(await callSelf(modern("tools/list"))));
    const tool = (result["tools"] as readonly Record<string, unknown>[])[0];

    expect(tool?.["annotations"]).toMatchObject({
      readOnlyHint: true,
      // The probe contacts nothing. The real analysis tool will set this true.
      openWorldHint: false,
      idempotentHint: true,
    });
  });

  it("describes the probe as temporary and non-analytical", async () => {
    const result = resultOf(await rpcPayload(await callSelf(modern("tools/list"))));
    const tool = (result["tools"] as readonly Record<string, unknown>[])[0];
    const description = String(tool?.["description"]);

    expect(description).toContain("Temporary");
    expect(description).toContain("no Warcraft Logs analysis");
  });
});

describe("tools/call invokes the probe", () => {
  it("returns the fixed structured payload", async () => {
    const response = await callSelf(modern("tools/call", { name: "ping", arguments: {} }, 2));
    const result = resultOf(await rpcPayload(response));

    expect(response.status).toBe(200);
    expect(result["structuredContent"]).toEqual({ ok: true, service: PING_SERVICE_ID });
  });

  it("produces structured content that satisfies the advertised output schema", async () => {
    const result = resultOf(await rpcPayload(await callSelf(modern("tools/call", { name: "ping" }, 3))));

    // Validated against the SAME schema the tool advertises, so the two cannot
    // drift apart without this failing.
    expect(() => PING_OUTPUT_SCHEMA.parse(result["structuredContent"])).not.toThrow();
  });

  it("also returns the serialized JSON as a text block", async () => {
    // The specification says a tool returning structured content SHOULD do
    // this, for clients that read only `content`.
    const result = resultOf(await rpcPayload(await callSelf(modern("tools/call", { name: "ping" }, 4))));
    const content = result["content"] as readonly { readonly type: string; readonly text: string }[];

    expect(content[0]?.type).toBe("text");
    expect(JSON.parse(content[0]?.text ?? "{}")).toEqual({ ok: true, service: PING_SERVICE_ID });
  });

  it("does not report an error", async () => {
    const result = resultOf(await rpcPayload(await callSelf(modern("tools/call", { name: "ping" }, 5))));

    expect(result["isError"]).toBeUndefined();
  });

  it("reports an unknown tool as a protocol error rather than a result", async () => {
    const payload = await rpcPayload(
      await callSelf(modern("tools/call", { name: "analyze_warcraft_log" }, 6)),
    );

    expect(payload["error"]).toBeDefined();
    expect(payload["result"]).toBeUndefined();
  });
});

describe("both protocol eras are served", () => {
  it("serves modern 2026-07-28 traffic", async () => {
    const response = await callSelf(modern("tools/call", { name: "ping" }, 7));

    expect(response.status).toBe(200);
    // `responseMode: 'json'` shapes the modern leg: a plain JSON body, no stream.
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(resultOf(await rpcPayload(response))["structuredContent"]).toEqual({
      ok: true,
      service: PING_SERVICE_ID,
    });
  });

  it("serves a 2025-era initialize through the stateless legacy fallback", async () => {
    const response = await callSelf(
      legacy("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "legacy-test-client", version: "1.0.0" },
      }),
    );
    const result = resultOf(await rpcPayload(response));

    expect(response.status).toBe(200);
    expect(result["protocolVersion"]).toBe("2025-06-18");
    expect(result["serverInfo"]).toMatchObject({ name: PING_SERVICE_ID });
  });

  it("serves a 2025-era tools/call", async () => {
    const response = await callSelf(legacy("tools/call", { name: "ping", arguments: {} }, 8));
    const result = resultOf(await rpcPayload(response));

    expect(response.status).toBe(200);
    expect(result["structuredContent"]).toEqual({ ok: true, service: PING_SERVICE_ID });
  });

  it("gives both eras the same tool", async () => {
    // One factory serves both. A surface that differed by era would mean two
    // definitions, which is the duplication M6 exists to avoid.
    const modernTools = (
      resultOf(await rpcPayload(await callSelf(modern("tools/list", {}, 9))))["tools"] as readonly {
        readonly name: string;
      }[]
    ).map((tool) => tool.name);
    const legacyTools = (
      resultOf(await rpcPayload(await callSelf(legacy("tools/list", {}, 10))))["tools"] as readonly {
        readonly name: string;
      }[]
    ).map((tool) => tool.name);

    expect(modernTools).toEqual(legacyTools);
    expect(modernTools).toEqual(["ping"]);
  });

  it("requires no session for a legacy tools/call", async () => {
    // The legacy leg is stateless: a call succeeds with no prior initialize and
    // no session id, which is what "no Durable Object" actually rests on.
    const response = await callSelf(legacy("tools/call", { name: "ping", arguments: {} }, 11));

    expect(response.status).toBe(200);
    expect(response.headers.get("mcp-session-id")).toBeNull();
  });
});

describe("the endpoint is stateless", () => {
  it("issues no session identifier", async () => {
    const response = await callSelf(modern("tools/list", {}, 12));

    expect(response.headers.get("mcp-session-id")).toBeNull();
  });

  it("sets no cookie", async () => {
    const response = await callSelf(modern("tools/list", {}, 13));

    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("answers repeated identical calls identically", async () => {
    // Nothing accumulates between requests. A response that drifted would mean
    // state had leaked into module scope.
    const first = resultOf(await rpcPayload(await callSelf(modern("tools/call", { name: "ping" }, 14))));
    const second = resultOf(await rpcPayload(await callSelf(modern("tools/call", { name: "ping" }, 14))));

    expect(first["structuredContent"]).toEqual(second["structuredContent"]);
  });
});

describe("no secret leaves through /mcp", () => {
  const SECRETS = [
    { name: "the MCP auth token", value: TEST_TOKEN },
    { name: "the WCL client id", value: "fake-client-id-not-real" },
    { name: "the WCL client secret", value: "fake-client-secret-not-real" },
  ] as const;

  const probes: readonly { readonly name: string; readonly run: () => Promise<Response> }[] = [
    { name: "authorized tools/list", run: async () => await callSelf(modern("tools/list", {}, 15)) },
    {
      name: "authorized tools/call",
      run: async () => await callSelf(modern("tools/call", { name: "ping" }, 16)),
    },
    {
      name: "unauthorized",
      run: async () => {
        const request = mcpRequest(modern("tools/list"));
        request.headers.delete("authorization");
        return await SELF.fetch(request);
      },
    },
    {
      name: "wrong token",
      run: async () => {
        const request = mcpRequest(modern("tools/list"));
        request.headers.set("authorization", "Bearer wrong");
        return await SELF.fetch(request);
      },
    },
    {
      name: "forbidden host",
      run: async () =>
        await SELF.fetch(mcpRequest({ ...modern("tools/list"), url: "https://coach.test/mcp" })),
    },
    {
      name: "unknown tool",
      run: async () => await callSelf(modern("tools/call", { name: "nope" }, 17)),
    },
  ];

  for (const probe of probes) {
    it(`leaks nothing on ${probe.name}`, async () => {
      const response = await probe.run();
      const body = await response.text();

      for (const secret of SECRETS) {
        expect(body, `${probe.name}: body leaked ${secret.name}`).not.toContain(secret.value);
        for (const [header, value] of response.headers.entries()) {
          expect(value, `${probe.name}: header ${header} leaked ${secret.name}`).not.toContain(secret.value);
        }
      }
    });
  }
});

describe("the existing routes are untouched", () => {
  it("serves /health exactly as before", async () => {
    const response = await SELF.fetch("https://coach.test/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", version: "0.1.0", environment: "test" });
  });

  it("discloses no MCP token on /health", async () => {
    const body = await (await SELF.fetch("https://coach.test/health")).text();

    expect(body).not.toContain(TEST_TOKEN);
    expect(body.toLowerCase()).not.toContain("mcp_auth_token");
  });

  it("keeps /v1/analysis on its M5-closeout 501", async () => {
    // M6-A is not permission to wire the analysis service. If this ever stops
    // being 501, it must be because M6-E did it deliberately.
    //
    // Driven through `createWorker` with a resolving preflight rather than
    // `SELF`, because the pool blocks outbound traffic: a SELF-driven request
    // would fail at the real Warcraft Logs call with 503 and never reach the
    // not-implemented boundary this assertion is about.
    const worker = createWorker({
      analyze: analyzeFight,
      analyzers: ENABLED_ANALYSIS_REQUIREMENTS,
      preflight: RESOLVING_PREFLIGHT,
      mcp: handleMcpRequest,
      version: "0.1.0",
    });

    const response = await worker.fetch(
      new Request("https://coach.test/v1/analysis", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportCode: "aBcDeFgH12345678", fightId: 8, sourceId: 15 }),
      }),
      { ENVIRONMENT: "test", WCL_CLIENT_ID: "id", WCL_CLIENT_SECRET: "secret" },
    );
    const body = (await response.json()) as { readonly error?: { readonly code?: string } };

    expect(response.status).toBe(501);
    expect(body.error?.code).toBe("ANALYSIS_NOT_IMPLEMENTED");
  });

  it("still returns a structured 404 for an unknown route", async () => {
    const response = await SELF.fetch("https://coach.test/nope");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "No such endpoint." },
    });
  });

  it("does not require an MCP token for /health or /v1/analysis", async () => {
    // The inbound MCP gate must not become an accidental gate on the JSON API.
    expect((await SELF.fetch("https://coach.test/health")).status).toBe(200);
    expect(
      (
        await SELF.fetch(
          new Request("https://coach.test/v1/analysis", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: "{ not json",
          }),
        )
      ).status,
    ).toBe(400);
  });
});
