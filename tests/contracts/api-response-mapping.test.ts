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

  it("not_implemented_does_not_map_to_a_success_status", () => {
    expect(statusForErrorCode("ANALYSIS_NOT_IMPLEMENTED")).toBe(501);
  });

  it("maps_each_code_to_its_documented_status", () => {
    const expected: Record<ApiErrorCode, number> = {
      INVALID_REQUEST: 400,
      NOT_FOUND: 404,
      METHOD_NOT_ALLOWED: 405,
      INTERNAL_ERROR: 500,
      ANALYSIS_NOT_IMPLEMENTED: 501,
      CONFIGURATION_ERROR: 503,
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
