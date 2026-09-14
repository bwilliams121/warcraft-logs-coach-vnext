import { describe, expect, it } from "vitest";

import { API_ERROR_CODES, statusForErrorCode, type ApiErrorCode } from "../../src/api/responses.js";
import { SERVICE_ERROR_CODES } from "../../src/services/result.js";

describe("api response mapping contract", () => {
  it("every_error_code_maps_to_an_explicit_http_status", () => {
    for (const code of API_ERROR_CODES) {
      const status = statusForErrorCode(code);
      expect(Number.isInteger(status), `${code} must map to an integer status`).toBe(true);
      expect(status, `${code} must be a 4xx or 5xx status`).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
    }
  });

  it("every_service_error_code_is_representable_over_http", () => {
    // A service error with no HTTP mapping would be unreportable to a caller.
    for (const code of SERVICE_ERROR_CODES) {
      expect(API_ERROR_CODES).toContain(code);
    }
  });

  it("no_longer_carries_the_retired_not_implemented_code", () => {
    // M6-E bound real ingestion, so "analysis exists but nobody wired it" is a
    // compile error rather than a status. The code is gone from the union, and
    // this asserts the HTTP layer cannot resurrect it.
    expect(API_ERROR_CODES).not.toContain("ANALYSIS_NOT_IMPLEMENTED" as ApiErrorCode);
    expect(() => statusForErrorCode("ANALYSIS_NOT_IMPLEMENTED" as ApiErrorCode)).toThrow();
  });

  it("no_warcraft_logs_failure_maps_to_a_success_status", () => {
    // A retrieval or identity failure must never be readable as an analysis
    // that found nothing to fix.
    const upstream = API_ERROR_CODES.filter(
      (code) => code.startsWith("UPSTREAM_") || code.startsWith("SOURCE_") || code.startsWith("REPORT_"),
    );

    expect(upstream.length).toBeGreaterThan(0);
    for (const code of upstream) {
      expect(statusForErrorCode(code), code).toBeGreaterThanOrEqual(400);
    }
  });

  it("maps_each_code_to_its_documented_status", () => {
    const expected: Record<ApiErrorCode, number> = {
      INVALID_REQUEST: 400,
      // Analysis spends a paid Warcraft Logs quota and is not publicly
      // callable. The rate limiter is a brake, not a door.
      UNAUTHORIZED: 401,
      NOT_FOUND: 404,
      REPORT_NOT_ACCESSIBLE: 404,
      FIGHT_NOT_FOUND: 404,
      SOURCE_NOT_FOUND: 404,
      METHOD_NOT_ALLOWED: 405,
      // The report changed under us. A conflict between two versions of one
      // resource, and the only retrieval failure a caller should simply retry.
      REPORT_REVISION_CHANGED: 409,
      // The report exists and is understood; its events are out of reach.
      REPORT_ARCHIVED_INACCESSIBLE: 422,
      SOURCE_NOT_A_PLAYER: 422,
      SOURCE_NOT_IN_FIGHT: 422,
      UPSTREAM_RATE_LIMITED: 429,
      // Us refusing the caller, rather than Warcraft Logs refusing us. Both
      // ask a client to slow down.
      RATE_LIMITED: 429,
      // The limiter could not decide, so the expensive path was refused.
      RATE_LIMITER_UNAVAILABLE: 503,
      INTERNAL_ERROR: 500,
      IDENTITY_UNRESOLVED: 502,
      UPSTREAM_DATA_INVALID: 502,
      CONFIGURATION_ERROR: 503,
      UPSTREAM_AUTH_FAILED: 503,
      UPSTREAM_UNAVAILABLE: 503,
    };

    for (const code of API_ERROR_CODES) {
      expect(statusForErrorCode(code), code).toBe(expected[code]);
    }
  });

  it("throws_rather_than_defaulting_on_an_unmapped_code", () => {
    // Guards the exhaustiveness assertion itself: a future code added to the
    // union without a case must fail loudly, never fall through to a 2xx.
    expect(() => statusForErrorCode("NOT_A_REAL_CODE" as ApiErrorCode)).toThrow();
  });
});
