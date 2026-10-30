import { describe, expect, it } from "vitest";

import { specNotSupported } from "../../src/services/analyzer-registry.js";
import {
  ANALYSIS_RESULT_STATES,
  SERVICE_ERROR_CODES,
  serviceFailure,
  type AnalysisServiceResult,
  type FightAnalysis,
  PREPARATION_NOT_ASSESSED,
} from "../../src/services/result.js";
import type { FightIdentity } from "../../src/wcl/types.js";
import { CURRENT_UNSUPPORTED_SUBJECT } from "../support/unsupported-subject.js";

const IDENTITY: FightIdentity = {
  report: { code: "aBcDeFgH12345678", revision: 24, startTime: 0, endTime: 600_000 },
  data: { logVersion: 26, gameVersion: 1 },
  fight: { id: 8, name: "Test Encounter", encounterId: 2902, difficulty: 5, startTime: 0, endTime: 300_000 },
  player: { sourceId: 15, name: "Coachtest", className: "Rogue", specName: "Assassination" },
};

const ANALYSIS: FightAnalysis = {
  identity: IDENTITY,
  specId: null,
  analyzerId: null,
  scope: null,
  // The observed identity of a specialization no analyzer covers (Warrior/Arms
  // since M10-D made Protection Paladin public). A fixture label only.
  analysis: specNotSupported(CURRENT_UNSUPPORTED_SUBJECT.observedSpecId),
  preparation: PREPARATION_NOT_ASSESSED,
  observedDecisions: null,
};

/**
 * Contract tests for the application-service envelope. Every later milestone and
 * every future interface returns through this shape, so drift must be visible.
 */
describe("analysis service result contract", () => {
  it("result_envelope_discriminates_on_ok", () => {
    const success: AnalysisServiceResult = { ok: true, state: "COMPLETE", analysis: ANALYSIS };
    const failure = serviceFailure("INVALID_REQUEST", "nope");

    expect(success.ok).toBe(true);
    expect(failure.ok).toBe(false);
    // The discriminant alone determines which branch is readable.
    expect("state" in success).toBe(true);
    expect("error" in failure).toBe(true);
    expect("state" in failure).toBe(false);
  });

  it("a_successful_result_always_carries_an_analysis", () => {
    // Structural, not conventional: the success arm requires `analysis`, so a
    // service cannot report success while producing nothing. The specific way
    // this used to be possible — `{ ok: true, state }` with no payload — is now
    // a type error rather than an empty report that reads as clean play.
    const success: AnalysisServiceResult = { ok: true, state: "PARTIAL", analysis: ANALYSIS };

    expect(success.ok).toBe(true);
    if (!success.ok) return;
    expect(success.analysis.analysis.status).toBe("SPEC_NOT_SUPPORTED");
    expect(success.analysis.identity.player.name).toBe("Coachtest");
  });

  it("an_unanalyzed_specialization_reports_no_analyzer_rather_than_a_placeholder", () => {
    // `null` says no analyzer ran. A placeholder spec id would let "we did not
    // analyze this" be read as "we analyzed it as something".
    expect(ANALYSIS.specId).toBeNull();
    expect(ANALYSIS.analyzerId).toBeNull();
    expect(ANALYSIS.scope).toBeNull();
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

  it("the_retired_placeholder_exists_in_neither_vocabulary", () => {
    // Through M6-D a placeholder error meant "the engine works but nobody
    // connected it". M6-E bound real ingestion and made the dependency
    // required, so that state is a compile error rather than a code — and it
    // must not reappear as either an error or an outcome.
    expect(SERVICE_ERROR_CODES).not.toContain("ANALYSIS_NOT_IMPLEMENTED");
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
