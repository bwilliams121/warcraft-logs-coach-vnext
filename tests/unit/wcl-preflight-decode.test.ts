import { describe, expect, it } from "vitest";

import { decodePreflight, PREFLIGHT_QUERY, preflightVariables } from "../../src/wcl/preflight-query.js";
import {
  preflightData,
  REQUEST,
  reportWithMasterData,
  validReport,
} from "../fixtures/wcl/preflight-payloads.js";

describe("preflight query", () => {
  it("requests_unlisted_reports_explicitly", () => {
    // The caller supplies the code directly, so an unlisted report is served
    // exactly like a public one. Private reports still require user OAuth.
    expect(PREFLIGHT_QUERY).toContain("allowUnlisted: true");
  });

  it("does_not_filter_actors_by_type", () => {
    // Fetching every actor is what lets a pet or NPC source ID be reported as
    // such instead of looking like an ID that does not exist.
    expect(PREFLIGHT_QUERY).not.toContain('actors(type: "Player")');
    expect(PREFLIGHT_QUERY).toContain("actors {");
  });

  it("requests_only_one_fight", () => {
    expect(preflightVariables(REQUEST)).toEqual({ code: REQUEST.reportCode, fightIDs: [REQUEST.fightId] });
    expect(PREFLIGHT_QUERY).toContain("fights(fightIDs: $fightIDs)");
  });

  it("does_not_request_event_or_gameplay_data", () => {
    // Milestone 2 is identity only. Over-fetching here would quietly start
    // ingestion a milestone early.
    for (const field of ["events", "table(", "graph(", "rankings", "playerDetails", "combatantInfo"]) {
      expect(PREFLIGHT_QUERY, `query must not request ${field}`).not.toContain(field);
    }
  });
});

describe("preflight decode", () => {
  it("decodes_a_well_formed_report", () => {
    const outcome = decodePreflight(preflightData());

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.report?.code).toBe(REQUEST.reportCode);
      expect(outcome.value.report?.logVersion).toBe(26);
      expect(outcome.value.report?.gameVersion).toBe(1);
    }
  });

  it("null_report_decodes_successfully_as_an_absent_report", () => {
    // `report: null` is a real answer, not a malformed payload. It becomes
    // REPORT_NOT_ACCESSIBLE, not UPSTREAM_DATA_INVALID.
    const outcome = decodePreflight(preflightData(null));

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.report).toBeNull();
    }
  });

  it("null_game_version_decodes_as_null_not_as_a_failure", () => {
    const outcome = decodePreflight(preflightData(reportWithMasterData({ gameVersion: null })));

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value.report?.gameVersion).toBeNull();
    }
  });

  it("missing_log_version_fails_closed", () => {
    const report = validReport();
    report.masterData = { gameVersion: 1, actors: [] };

    expect(decodePreflight(preflightData(report)).ok).toBe(false);
  });

  it("missing_expected_graphql_fields_fail_closed", () => {
    const cases: Record<string, unknown> = {
      not_an_object: 42,
      null_data: null,
      no_report_data: { rateLimitData: {} },
      report_data_null: { reportData: null },
      report_key_absent: { reportData: {} },
      report_not_an_object: { reportData: { report: 7 } },
    };

    for (const [name, data] of Object.entries(cases)) {
      expect(decodePreflight(data).ok, name).toBe(false);
    }
  });

  it("wrong_scalar_types_fail_closed", () => {
    const cases: Record<string, Record<string, unknown>> = {
      code_is_a_number: { code: 12345678 },
      revision_is_a_string: { revision: "24" },
      start_time_is_null: { startTime: null },
      fights_is_not_an_array: { fights: {} },
      master_data_missing: { masterData: undefined },
    };

    for (const [name, overrides] of Object.entries(cases)) {
      const report = { ...validReport(), ...overrides };
      expect(decodePreflight(preflightData(report)).ok, name).toBe(false);
    }
  });

  it("unexpected_extra_fields_are_ignored_not_trusted", () => {
    const report = { ...validReport(), unexpectedField: { nested: true } };
    const outcome = decodePreflight(preflightData(report));

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(Object.keys(outcome.value.report ?? {}).sort()).toEqual([
        "actors",
        "code",
        "endTime",
        "fights",
        "gameVersion",
        "logVersion",
        "revision",
        "startTime",
      ]);
    }
  });
});
