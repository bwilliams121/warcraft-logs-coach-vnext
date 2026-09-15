/**
 * `POST /v1/analysis`, now that it actually analyses.
 *
 * WHAT CHANGED AND WHY THIS FILE EXISTS
 *
 * Through M6-D this route returned 501. M6-E bound real ingestion at the single
 * production composition root, so REST performs the same composed analysis MCP
 * does and publishes the same M6-C public result. This file pins that contract:
 * the success shape, the statuses that count as success, and the failures that
 * must stay failures.
 *
 * THE DISTINCTION IT DEFENDS, SAME AS MCP'S
 *
 * An analysis that could not resolve a decision is a SUCCESSFUL response. A
 * request that never reached an analysis is an HTTP error. Collapsing them
 * would report an outage as gameplay uncertainty, or an honest UNKNOWN as a
 * broken endpoint.
 *
 * OFFLINE. Only the two I/O ports and the limiter are faked; everything between
 * them is the production path.
 */

import { describe, expect, it, vi } from "vitest";

import { createWorker, type WorkerDeps } from "../../src/api/worker.js";
import { PublicAnalysisResultSchema } from "../../src/contracts/analysis-contract.js";
import { SERVICE_ERROR_CODES, serviceFailure, type ServiceErrorCode } from "../../src/services/result.js";
import type { AnalysisRunner } from "../../src/services/analysis-runner.js";
import { statusForErrorCode } from "../../src/api/responses.js";
import {
  ALLOWING_LIMITER,
  D2_REQUEST,
  DENYING_LIMITER,
  MCP_TEST_ENV,
  THROWING_LIMITER,
  authHeaders,
  countingLimiter,
  fixtureAnalysisRunner,
  m5aRequest,
  workerDepsFor,
} from "../support/analysis-transports.js";
import type { RateLimiterPort } from "../../src/runtime/rate-limit.js";

function post(body: unknown, raw?: string): Request {
  return new Request("https://coach.test/v1/analysis", {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    body: raw ?? JSON.stringify(body),
  });
}

interface CallOptions {
  readonly analyze?: AnalysisRunner;
  readonly rateLimiter?: RateLimiterPort;
}

async function callRest(body: unknown, options: CallOptions = {}): Promise<Response> {
  const deps: WorkerDeps = workerDepsFor({
    analyze: options.analyze ?? fixtureAnalysisRunner(),
    rateLimiter: options.rateLimiter ?? ALLOWING_LIMITER,
  });
  return await createWorker(deps).fetch(post(body), MCP_TEST_ENV);
}

describe("a successful analysis is the public result itself", () => {
  it("returns 200 with a valid M6-C public analysis", async () => {
    const response = await callRest(D2_REQUEST);
    const body: unknown = await response.json();

    expect(response.status).toBe(200);
    expect(PublicAnalysisResultSchema.safeParse(body).success).toBe(true);
  });

  it("wraps the result in no envelope", async () => {
    // The body IS the public analysis. A wrapper would add a field that exists
    // on one transport and not the other, for no information — and would make
    // the REST/MCP equality proof a comparison of unequal shapes.
    const body = (await (await callRest(D2_REQUEST)).json()) as Record<string, unknown>;

    expect(body["schemaVersion"]).toBe("warcraft-logs-coach.analysis/1");
    expect(body["status"]).toBe("ANALYZED");
    expect(body["ok"]).toBeUndefined();
    expect(body["analysis"]).toBeUndefined();
    expect(body["state"]).toBeUndefined();
  });

  it("preserves M5's pinned D2 coverage over HTTP", async () => {
    const body = (await (await callRest(D2_REQUEST)).json()) as {
      coverage: Record<string, number>;
    };

    expect({
      eligible: body.coverage["eligibleDecisions"],
      match: body.coverage["match"],
      rejected: body.coverage["rejected"],
      unknown: body.coverage["unknown"],
      exact: body.coverage["exactEntryMatches"],
      converged: body.coverage["tokenConvergedMatches"],
    }).toStrictEqual({ eligible: 11, match: 1, rejected: 0, unknown: 10, exact: 1, converged: 0 });
  });

  it("keeps the real Garrote MATCH exactly as M5 established it", async () => {
    const body = (await (await callRest(D2_REQUEST)).json()) as {
      decisions: readonly Record<string, unknown>[];
    };
    const garrote = body.decisions.find((decision) => decision["outcome"] === "MATCH");

    expect(garrote?.["observedToken"]).toBe("garrote");
    expect(garrote?.["basis"]).toBe("AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN");
    expect(garrote?.["selectionPrecision"]).toBe("EXACT_ENTRY");
    expect(garrote?.["usabilityProvenance"]).toBe("OBSERVED_EXECUTION");
  });

  it("carries the M5-A rejection unchanged", async () => {
    const body = (await (
      await callRest(m5aRequest(), { analyze: fixtureAnalysisRunner({ fixture: "m5a" }) })
    ).json()) as { decisions: readonly Record<string, unknown>[] };

    expect(body.decisions).toHaveLength(1);
    expect(body.decisions[0]?.["outcome"]).toBe("REJECTED");
    expect(body.decisions[0]?.["basis"]).toBe("OBSERVED_ACTION_REJECTED_BY_AUTHORITY");
    expect(body.decisions[0]?.["authorityToken"]).toBeNull();
    expect(Object.keys(body.decisions[0] ?? {})).not.toContain("observedActionRejected");
  });

  it("exposes no infrastructure or auth facts in the analysis", async () => {
    // Rate-limit keys, binding names, bearer state and protocol versions are
    // transport details. The public contract is gameplay truth only.
    const raw = await (await callRest(D2_REQUEST)).text();

    for (const banned of [
      "analysis:warcraft_log",
      "ANALYSIS_RATE_LIMITER",
      "ANALYSIS_AUTH_TOKEN",
      "Bearer",
      "rateLimit",
      "2026-07-28",
    ]) {
      expect(raw).not.toContain(banned);
    }
  });
});

describe("every analysis-domain status is a successful response", () => {
  const statuses = [
    {
      name: "SPEC_NOT_SUPPORTED",
      runner: fixtureAnalysisRunner({ className: "Paladin", specName: "Protection" }),
    },
  ] as const;

  for (const testCase of statuses) {
    it(`returns 200 for ${testCase.name}`, async () => {
      // An unsupported specialization is a complete, truthful answer. 404 or 422
      // would tell a client the request failed when the engine worked exactly
      // as designed.
      const response = await callRest(D2_REQUEST, { analyze: testCase.runner });
      const body = (await response.json()) as Record<string, unknown>;

      expect(response.status).toBe(200);
      expect(body["status"]).toBe(testCase.name);
      expect(PublicAnalysisResultSchema.safeParse(body).success).toBe(true);
    });
  }

  it("gives an unsupported spec no decisions, coverage or authority", async () => {
    // Not "empty" — ABSENT. `{"decisions":[],"coverage":{...0}}` reads as "no
    // mistakes found".
    const body = (await (
      await callRest(D2_REQUEST, {
        analyze: fixtureAnalysisRunner({ className: "Paladin", specName: "Protection" }),
      })
    ).json()) as Record<string, unknown>;

    expect("decisions" in body).toBe(false);
    expect("coverage" in body).toBe(false);
    expect("authority" in body).toBe(false);
  });

  it("keeps a mostly-UNKNOWN analysis a 200", async () => {
    const response = await callRest(D2_REQUEST);
    const body = (await response.json()) as { coverage: Record<string, number> };

    expect(response.status).toBe(200);
    expect(body.coverage["unknown"]).toBe(10);
  });
});

describe("service failures stay HTTP errors", () => {
  it("maps every service error to its documented status and never to an analysis", async () => {
    for (const code of SERVICE_ERROR_CODES) {
      const response = await callRest(D2_REQUEST, {
        analyze: async () => serviceFailure(code, "author-written message"),
      });
      const body = (await response.json()) as { ok?: boolean; error?: { code?: string } };

      expect(response.status, code).toBe(statusForErrorCode(code));
      expect(response.status, code).toBeGreaterThanOrEqual(400);
      expect(body.ok, code).toBe(false);
      // The semantic code survives, which is what REST and MCP must agree on.
      expect(body.error?.code, code).toBe(code);
      // A failure must never be parseable as a successful analysis.
      expect(PublicAnalysisResultSchema.safeParse(body).success, code).toBe(false);
    }
  });

  it("rejects a body that is not JSON before anything expensive", async () => {
    const run = vi.fn<AnalysisRunner>(fixtureAnalysisRunner());
    const limiter = countingLimiter(10);
    const response = await createWorker(workerDepsFor({ analyze: run, rateLimiter: limiter })).fetch(
      post(undefined, "{ not json"),
      MCP_TEST_ENV,
    );

    expect(response.status).toBe(400);
    expect(run).not.toHaveBeenCalled();
    // An unparseable body costs no Warcraft Logs points, so it costs no quota.
    expect(limiter.keys).toHaveLength(0);
  });

  it("reports an unexpected throw without leaking it", async () => {
    const response = await callRest(D2_REQUEST, {
      analyze: () => {
        throw new Error("SENTINEL_REST_THROW_DO_NOT_LEAK at src/secret.ts:9");
      },
    });
    const raw = await response.text();

    expect(response.status).toBe(500);
    expect(raw).not.toContain("SENTINEL_REST_THROW_DO_NOT_LEAK");
    expect(raw).not.toContain("src/secret.ts");
    expect(JSON.parse(raw)).toEqual({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "An unexpected internal error occurred." },
    });
  });

  it("never returns the retired not-implemented status", async () => {
    const response = await callRest(D2_REQUEST);

    expect(response.status).not.toBe(501);
    expect(await response.text()).not.toContain("ANALYSIS_NOT_IMPLEMENTED");
  });
});

describe("the REST route is metered", () => {
  it("charges the shared budget once for a real attempt", async () => {
    const limiter = countingLimiter(10);
    await callRest(D2_REQUEST, { rateLimiter: limiter });

    // Once — not once at the route and again inside the runner.
    expect(limiter.keys).toEqual(["analysis:warcraft_log"]);
  });

  it("does not call the runner when denied", async () => {
    const run = vi.fn<AnalysisRunner>(fixtureAnalysisRunner());
    const response = await callRest(D2_REQUEST, { analyze: run, rateLimiter: DENYING_LIMITER });
    const body = (await response.json()) as { error?: { code?: string } };

    expect(run).not.toHaveBeenCalled();
    expect(response.status).toBe(429);
    expect(body.error?.code).toBe("RATE_LIMITED");
  });

  it("fails closed when the limiter throws", async () => {
    const run = vi.fn<AnalysisRunner>(fixtureAnalysisRunner());
    const response = await callRest(D2_REQUEST, { analyze: run, rateLimiter: THROWING_LIMITER });
    const body = (await response.json()) as { error?: { code?: string } };

    expect(run).not.toHaveBeenCalled();
    expect(response.status).toBe(503);
    expect(body.error?.code).toBe("RATE_LIMITER_UNAVAILABLE");
  });

  it("fails closed when no limiter is bound", async () => {
    const run = vi.fn<AnalysisRunner>(fixtureAnalysisRunner());
    const response = await createWorker({
      analysisRunner: () => run,
      rateLimiter: () => undefined,
      // Not exercised here. Stubbed fail-closed rather than omitted, so a
      // single-fight fixture cannot silently reach the raid-night path.
      raidNightRunner: () => async () => ({
        ok: false as const,
        error: { code: "INTERNAL_ERROR" as const, message: "raid-night runner not bound here" },
      }),
      mcp: async () => new Response(null, { status: 404 }),
      version: "0.1.0",
    }).fetch(post(D2_REQUEST), MCP_TEST_ENV);

    expect(run).not.toHaveBeenCalled();
    expect(response.status).toBe(503);
  });

  it("returns no analysis object when rate limited", async () => {
    // Infrastructure availability, not analysis uncertainty.
    const raw = await (await callRest(D2_REQUEST, { rateLimiter: DENYING_LIMITER })).text();

    expect(raw).not.toContain("eligibleDecisions");
    expect(raw).not.toContain("ANALYZED");
  });
});

describe("the other routes are untouched", () => {
  const deps = (): WorkerDeps => workerDepsFor({ analyze: fixtureAnalysisRunner() });

  it("serves /health exactly as before", async () => {
    const response = await createWorker(deps()).fetch(new Request("https://coach.test/health"), MCP_TEST_ENV);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", version: "0.1.0", environment: "test" });
  });

  it("does not meter /health", async () => {
    const limiter = countingLimiter(10);
    await createWorker(workerDepsFor({ analyze: fixtureAnalysisRunner(), rateLimiter: limiter })).fetch(
      new Request("https://coach.test/health"),
      MCP_TEST_ENV,
    );

    expect(limiter.keys).toHaveLength(0);
  });

  it("still returns a structured 404 for an unknown route", async () => {
    const response = await createWorker(deps()).fetch(new Request("https://coach.test/nope"), MCP_TEST_ENV);

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "No such endpoint." },
    });
  });

  it("still rejects a wrong method", async () => {
    const response = await createWorker(deps()).fetch(
      new Request("https://coach.test/v1/analysis", { method: "GET" }),
      MCP_TEST_ENV,
    );

    expect(response.status).toBe(405);
  });
});

describe("no secret leaves through the live REST route", () => {
  const SENTINELS = [
    "fake-client-id-not-real",
    "fake-client-secret-not-real",
    "fake-analysis-token-not-real",
  ] as const;

  const probes: readonly { readonly name: string; readonly run: () => Promise<Response> }[] = [
    { name: "a successful analysis", run: async () => await callRest(D2_REQUEST) },
    {
      name: "an unsupported spec",
      run: async () =>
        await callRest(D2_REQUEST, {
          analyze: fixtureAnalysisRunner({ className: "Paladin", specName: "Protection" }),
        }),
    },
    {
      name: "a service failure",
      run: async () =>
        await callRest(D2_REQUEST, {
          analyze: async () => serviceFailure("UPSTREAM_AUTH_FAILED" as ServiceErrorCode, "x"),
        }),
    },
    {
      name: "a rate-limit denial",
      run: async () => await callRest(D2_REQUEST, { rateLimiter: DENYING_LIMITER }),
    },
    {
      name: "an exception naming every secret",
      run: async () =>
        await callRest(D2_REQUEST, {
          analyze: () => {
            throw new Error(`boom ${SENTINELS.join(" ")}`);
          },
        }),
    },
    { name: "an invalid request", run: async () => await callRest({ reportCode: "short" }) },
    {
      // The new response surface. A 401 is the one place the word "Bearer"
      // legitimately appears — in the challenge scheme, never the credential.
      name: "an unauthorized request",
      run: async () =>
        await createWorker(workerDepsFor({ analyze: fixtureAnalysisRunner() })).fetch(
          new Request("https://coach.test/v1/analysis", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(D2_REQUEST),
          }),
          MCP_TEST_ENV,
        ),
    },
  ];

  for (const probe of probes) {
    it(`leaks nothing on ${probe.name}`, async () => {
      const response = await probe.run();
      const raw = await response.text();

      for (const secret of SENTINELS) {
        expect(raw, `${probe.name} leaked ${secret}`).not.toContain(secret);
        for (const [header, value] of response.headers.entries()) {
          expect(value, `${probe.name} header ${header} leaked ${secret}`).not.toContain(secret);
        }
      }
      // `WWW-Authenticate: Bearer` names the scheme. It must never carry a token.
      expect(response.headers.get("www-authenticate") ?? "Bearer").toBe("Bearer");
    });
  }
});
