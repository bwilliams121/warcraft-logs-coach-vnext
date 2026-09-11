import { describe, expect, it } from "vitest";

import { parseAnalysisRequest } from "../../src/services/analysis-request.js";

function issueCodes(result: ReturnType<typeof parseAnalysisRequest>): readonly string[] {
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe("parseAnalysisRequest", () => {
  it("url_and_explicit_fields_normalize_to_the_same_canonical_request", () => {
    const fromUrl = parseAnalysisRequest({
      reportUrl: "https://www.warcraftlogs.com/reports/aBcDeFgH12345678#fight=8&source=15",
    });
    const fromFields = parseAnalysisRequest({
      reportCode: "aBcDeFgH12345678",
      fightId: 8,
      sourceId: 15,
    });

    expect(fromUrl.ok).toBe(true);
    expect(fromFields).toEqual(fromUrl);
  });

  it("rejects_a_body_that_is_not_an_object", () => {
    expect(issueCodes(parseAnalysisRequest("aBcDeFgH12345678"))).toEqual(["NOT_AN_OBJECT"]);
    expect(issueCodes(parseAnalysisRequest(null))).toEqual(["NOT_AN_OBJECT"]);
    expect(issueCodes(parseAnalysisRequest([]))).toEqual(["NOT_AN_OBJECT"]);
  });

  it("empty_body_returns_missing_request_input", () => {
    expect(issueCodes(parseAnalysisRequest({}))).toEqual(["MISSING_REQUEST_INPUT"]);
  });

  it("conflicting_url_and_explicit_fields_are_rejected", () => {
    const result = parseAnalysisRequest({
      reportUrl: "https://www.warcraftlogs.com/reports/aBcDeFgH12345678#fight=8&source=15",
      reportCode: "zZzZzZzZ87654321",
    });

    expect(issueCodes(result)).toEqual(["CONFLICTING_REQUEST_FIELDS"]);
  });

  it("missing_source_id_returns_invalid_request_with_missing_source_id_issue", () => {
    const result = parseAnalysisRequest({ reportCode: "aBcDeFgH12345678", fightId: 8 });

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toEqual(["MISSING_SOURCE_ID"]);
  });

  it("rejects_non_integer_identifiers", () => {
    expect(
      issueCodes(parseAnalysisRequest({ reportCode: "aBcDeFgH12345678", fightId: 1.5, sourceId: 2 })),
    ).toEqual(["INVALID_FIGHT_ID"]);
    expect(
      issueCodes(parseAnalysisRequest({ reportCode: "aBcDeFgH12345678", fightId: 1, sourceId: "2" })),
    ).toEqual(["INVALID_SOURCE_ID"]);
    expect(
      issueCodes(parseAnalysisRequest({ reportCode: "aBcDeFgH12345678", fightId: -1, sourceId: 2 })),
    ).toEqual(["INVALID_FIGHT_ID"]);
  });

  it("rejects_a_malformed_report_code", () => {
    expect(issueCodes(parseAnalysisRequest({ reportCode: "short", fightId: 1, sourceId: 2 }))).toEqual([
      "INVALID_REPORT_CODE",
    ]);
  });

  it("analysis_request_contract_has_no_client_scope_field", () => {
    // Callers do not select ingestion scope. Supplying one is an error rather
    // than silently ignored, so the boundary is enforced and not merely absent.
    for (const field of ["scope", "ingestionScope", "ingestion_scope"]) {
      const result = parseAnalysisRequest({
        reportCode: "aBcDeFgH12345678",
        fightId: 8,
        sourceId: 15,
        [field]: "PLAYER_CONTEXT",
      });

      expect(result.ok, `${field} must be rejected`).toBe(false);
      expect(issueCodes(result)).toEqual(["CLIENT_SCOPE_NOT_ACCEPTED"]);
    }
  });

  it("a_valid_request_never_carries_a_scope", () => {
    const result = parseAnalysisRequest({
      reportCode: "aBcDeFgH12345678",
      fightId: 8,
      sourceId: 15,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.request).sort()).toEqual(["fightId", "reportCode", "sourceId"]);
    }
  });
});
