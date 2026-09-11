import { describe, expect, it } from "vitest";

import {
  ANALYSIS_RESULT_STATES,
  SERVICE_ERROR_CODES,
  serviceFailure,
  type AnalysisServiceResult,
} from "../../src/services/result.js";

/**
 * Contract tests for the application-service envelope. Every later milestone and
 * every future interface returns through this shape, so drift must be visible.
 */
describe("analysis service result contract", () => {
  it("result_envelope_discriminates_on_ok", () => {
    const success: AnalysisServiceResult = { ok: true, state: "COMPLETE" };
    const failure = serviceFailure("INVALID_REQUEST", "nope");

    expect(success.ok).toBe(true);
    expect(failure.ok).toBe(false);
    // The discriminant alone determines which branch is readable.
    expect("state" in success).toBe(true);
    expect("error" in failure).toBe(true);
    expect("state" in failure).toBe(false);
  });

  it("analysis_result_states_include_spec_not_supported", () => {
    expect(ANALYSIS_RESULT_STATES).toContain("SPEC_NOT_SUPPORTED");
  });

  it("analysis_result_states_match_the_documented_set", () => {
    expect([...ANALYSIS_RESULT_STATES].sort()).toEqual([
      "COMPLETE",
      "IDENTITY_CONFLICT",
      "INCOMPATIBLE_DATA_VERSION",
      "INSUFFICIENT_SCOPE",
      "PARTIAL",
      "SPEC_NOT_SUPPORTED",
    ]);
  });

  it("analysis_result_states_do_not_include_unknown_or_no_authority_available", () => {
    // Placement guard. UNKNOWN and NO_AUTHORITY_AVAILABLE are finding-level and
    // decision-level states. Admitting either here would establish a wrong-layer
    // precedent before findings exist. This is NOT the semantic-distinction test
    // (`unknown_and_no_authority_are_not_interchangeable`), which needs findings
    // and arrives with them.
    expect(ANALYSIS_RESULT_STATES).not.toContain("UNKNOWN");
    expect(ANALYSIS_RESULT_STATES).not.toContain("NO_AUTHORITY_AVAILABLE");
  });

  it("foundation_placeholder_is_an_error_not_an_analysis_state", () => {
    // The Milestone 1 placeholder must be unable to masquerade as an outcome.
    expect(SERVICE_ERROR_CODES).toContain("ANALYSIS_NOT_IMPLEMENTED");
    expect(ANALYSIS_RESULT_STATES).not.toContain("ANALYSIS_NOT_IMPLEMENTED");
    expect(ANALYSIS_RESULT_STATES).not.toContain("NOT_IMPLEMENTED");
    expect(ANALYSIS_RESULT_STATES).not.toContain("FOUNDATION_ONLY");
  });

  it("insufficient_scope_is_a_retrieval_outcome_not_a_caller_choice", () => {
    // It may describe data that could not satisfy the internally derived
    // requirement. It is reachable only as an analysis state, never as a request
    // validation error, because callers cannot select scope at all.
    expect(ANALYSIS_RESULT_STATES).toContain("INSUFFICIENT_SCOPE");
    expect(SERVICE_ERROR_CODES).not.toContain("INSUFFICIENT_SCOPE");
  });

  it("service_errors_omit_issues_when_there_are_none", () => {
    const failure = serviceFailure("INTERNAL_ERROR", "boom");

    expect(failure.ok).toBe(false);
    if (!failure.ok) {
      expect("issues" in failure.error).toBe(false);
    }
  });

  it("service_errors_preserve_field_level_issues", () => {
    const failure = serviceFailure("INVALID_REQUEST", "bad", [
      { code: "MISSING_SOURCE_ID", field: "sourceId", message: "sourceId is required." },
    ]);

    expect(failure.ok).toBe(false);
    if (!failure.ok) {
      expect(failure.error.issues).toHaveLength(1);
      expect(failure.error.issues?.[0]?.code).toBe("MISSING_SOURCE_ID");
    }
  });
});
