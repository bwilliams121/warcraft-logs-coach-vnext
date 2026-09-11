import { describe, expect, it } from "vitest";

import { parseReportUrl } from "../../src/wcl/report-url.js";

function issueCodes(result: ReturnType<typeof parseReportUrl>): readonly string[] {
  return result.ok ? [] : result.issues.map((issue) => issue.code);
}

describe("parseReportUrl", () => {
  it("parses_report_code_fight_and_source_from_warcraftlogs_url", () => {
    const result = parseReportUrl("https://www.warcraftlogs.com/reports/aBcDeFgH12345678?fight=3&source=12");

    expect(result).toEqual({
      ok: true,
      value: { reportCode: "aBcDeFgH12345678", fightId: 3, sourceId: 12 },
    });
  });

  it("parses_selectors_from_the_url_fragment", () => {
    // Warcraft Logs canonically puts selectors in the fragment.
    const result = parseReportUrl(
      "https://www.warcraftlogs.com/reports/aBcDeFgH12345678#fight=8&type=damage-done&source=15",
    );

    expect(result).toEqual({
      ok: true,
      value: { reportCode: "aBcDeFgH12345678", fightId: 8, sourceId: 15 },
    });
  });

  it("rejects_non_warcraftlogs_host", () => {
    const result = parseReportUrl("https://example.com/reports/aBcDeFgH12345678#fight=1&source=2");

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toEqual(["NOT_A_WARCRAFT_LOGS_URL"]);
  });

  it("rejects_a_string_that_is_not_a_url", () => {
    const result = parseReportUrl("not-a-url");

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toEqual(["INVALID_REPORT_URL"]);
  });

  it("rejects_url_without_a_report_code", () => {
    const result = parseReportUrl("https://www.warcraftlogs.com/reports/#fight=1&source=2");

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain("MISSING_REPORT_CODE");
  });

  it("unsupported_fight_selector_is_rejected_not_guessed", () => {
    const result = parseReportUrl(
      "https://www.warcraftlogs.com/reports/aBcDeFgH12345678#fight=last&source=2",
    );

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain("UNSUPPORTED_FIGHT_SELECTOR");
  });

  it("rejects_non_numeric_fight_id", () => {
    const result = parseReportUrl("https://www.warcraftlogs.com/reports/aBcDeFgH12345678#fight=abc&source=2");

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain("INVALID_FIGHT_ID");
  });

  it("url_without_source_parameter_is_rejected", () => {
    // sourceId is required. A fight contains many actors and nothing downstream
    // can infer which player the user meant.
    const result = parseReportUrl("https://www.warcraftlogs.com/reports/aBcDeFgH12345678#fight=8");

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toEqual(["MISSING_SOURCE_ID"]);
  });

  it("rejects_non_numeric_source_id", () => {
    const result = parseReportUrl("https://www.warcraftlogs.com/reports/aBcDeFgH12345678#fight=8&source=me");

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toContain("INVALID_SOURCE_ID");
  });

  it("reports_every_missing_selector_rather_than_only_the_first", () => {
    const result = parseReportUrl("https://www.warcraftlogs.com/reports/aBcDeFgH12345678");

    expect(result.ok).toBe(false);
    expect(issueCodes(result)).toEqual(["MISSING_FIGHT_ID", "MISSING_SOURCE_ID"]);
  });
});
