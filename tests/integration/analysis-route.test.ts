import { SELF } from "cloudflare:test";
import { describe, expect, it, vi } from "vitest";

import { createWorker, type WorkerDeps } from "../../src/api/worker.js";
import type { Env } from "../../src/config/env.js";
import { analyzeFight, ENABLED_ANALYSIS_REQUIREMENTS } from "../../src/services/analysis-service.js";
import { serviceFailure, type AnalysisServiceResult } from "../../src/services/result.js";

const FAKE_ENV: Env = {
  ENVIRONMENT: "test",
  WCL_CLIENT_ID: "fake-client-id-not-real",
  WCL_CLIENT_SECRET: "fake-client-secret-not-real",
};

const VALID_BODY = { reportCode: "aBcDeFgH12345678", fightId: 8, sourceId: 15 };

/** Every property name appearing anywhere in a JSON value. */
function collectKeys(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, into);
  } else if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      into.push(key);
      collectKeys(nested, into);
    }
  }
  return into;
}

function post(body: unknown, init?: { readonly raw?: string }): Request {
  return new Request("https://coach.test/v1/analysis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: init?.raw ?? JSON.stringify(body),
  });
}

function worker(deps: Partial<WorkerDeps> = {}) {
  return createWorker({
    analyze: deps.analyze ?? analyzeFight,
    analyzers: deps.analyzers ?? ENABLED_ANALYSIS_REQUIREMENTS,
    version: deps.version ?? "0.1.0",
  });
}

describe("POST /v1/analysis", () => {
  it("malformed_json_body_returns_invalid_request", async () => {
    const response = await SELF.fetch(post(undefined, { raw: "{ not json" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      ok: false,
      error: { code: "INVALID_REQUEST", message: "Request body must be valid JSON." },
    });
  });

  it("valid_request_returns_explicit_not_implemented", async () => {
    const response = await SELF.fetch(post(VALID_BODY));
    const body = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(501);
    expect(body["ok"]).toBe(false);
    expect((body["error"] as Record<string, unknown>)["code"]).toBe("ANALYSIS_NOT_IMPLEMENTED");
  });

  it("not_implemented_response_is_not_a_coaching_payload", async () => {
    // The placeholder must not be readable as "we analyzed this and found
    // nothing". Absence of analysis is not evidence of good play.
    //
    // Checked structurally: the refusal message may explain in prose that no
    // coaching was produced. What must not exist is a field a client could read
    // as analysis output.
    const raw = await (await SELF.fetch(post(VALID_BODY))).text();
    const keys = collectKeys(JSON.parse(raw));

    for (const key of ["findings", "tldr", "coaching", "score"]) {
      expect(keys, `response must not carry a "${key}" field`).not.toContain(key);
    }
    expect(keys.sort()).toEqual(["code", "error", "message", "ok"]);
    expect(raw).toContain("not implemented");
  });

  it("invalid_request_is_reported_with_field_issues", async () => {
    const response = await SELF.fetch(post({ reportCode: "aBcDeFgH12345678", fightId: 8 }));
    const body = (await response.json()) as {
      error: { code: string; issues?: { code: string }[] };
    };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(body.error.issues?.map((issue) => issue.code)).toEqual(["MISSING_SOURCE_ID"]);
  });

  it("client_supplied_scope_is_rejected_over_http", async () => {
    const response = await SELF.fetch(post({ ...VALID_BODY, scope: "PLAYER_CONTEXT" }));
    const body = (await response.json()) as { error: { issues?: { code: string }[] } };

    expect(response.status).toBe(400);
    expect(body.error.issues?.map((issue) => issue.code)).toEqual(["CLIENT_SCOPE_NOT_ACCEPTED"]);
  });

  it("api_layer_delegates_to_the_analysis_service", async () => {
    const stubResult: AnalysisServiceResult = serviceFailure("CONFIGURATION_ERROR", "stub says no");
    const analyze = vi.fn<WorkerDeps["analyze"]>(() => stubResult);

    const response = await worker({ analyze }).fetch(post(VALID_BODY), FAKE_ENV);
    const body = await response.json();

    // Called exactly once, with the decoded body and the injected env/analyzers.
    expect(analyze).toHaveBeenCalledTimes(1);
    expect(analyze.mock.calls[0]?.[0]).toEqual(VALID_BODY);
    expect(analyze.mock.calls[0]?.[1]).toEqual({
      env: FAKE_ENV,
      analyzers: ENABLED_ANALYSIS_REQUIREMENTS,
    });

    // The response is derived solely from the stub's envelope: the API computed
    // nothing of its own.
    expect(response.status).toBe(503);
    expect(body).toEqual({
      ok: false,
      error: { code: "CONFIGURATION_ERROR", message: "stub says no" },
    });
  });

  it("absent_credentials_return_configuration_error_not_a_crash", async () => {
    const response = await worker().fetch(post(VALID_BODY), { ENVIRONMENT: "test" });
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("CONFIGURATION_ERROR");
    expect(body.error.message).toContain("WCL_CLIENT_ID");
  });

  it("unexpected_service_error_returns_generic_500_without_internals", async () => {
    const secret = "SENTINEL_THROWN_INTERNAL_DETAIL";
    const analyze = vi.fn<WorkerDeps["analyze"]>(() => {
      throw new Error(secret);
    });

    const response = await worker({ analyze }).fetch(post(VALID_BODY), FAKE_ENV);
    const raw = await response.text();

    expect(response.status).toBe(500);
    expect(raw).not.toContain(secret);
    expect(JSON.parse(raw)).toEqual({
      ok: false,
      error: { code: "INTERNAL_ERROR", message: "An unexpected internal error occurred." },
    });
  });
});
