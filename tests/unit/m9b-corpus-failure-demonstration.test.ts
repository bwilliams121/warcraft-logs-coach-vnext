import { describe, expect, it } from "vitest";

import { committedCorpusFiles, MANIFEST_PATH, type CorpusFileTable } from "../support/corpus/loader.js";
import { describeFailures, runCorpusHarness, type AssertionResult } from "../support/corpus/harness.js";

/**
 * A regression harness is only evidence if a WRONG expectation fails, and
 * fails in a way a reader can act on.
 *
 * Each case below takes the committed corpus, changes ONE thing in memory —
 * an expected outcome, an anchor timestamp, a cursor, a byte, a pinned
 * revision — and asserts that the harness reports exactly the assertion that
 * broke, with the case, artifact, layer, kind, expected and actual semantic
 * results, and the evidence coordinate the layer offered. Nothing here touches
 * a committed file.
 */

type Json = Record<string, unknown>;

interface ManifestShape {
  artifacts: Json[];
  cases: (Json & { caseId: string; assertions: (Json & { params: Json })[] })[];
}

/** The committed corpus with one case's assertion params rewritten. */
function withParams(caseId: string, ordinal: number, rewrite: (params: Json) => void): CorpusFileTable {
  const files = { ...committedCorpusFiles() };
  const manifest = JSON.parse(files[MANIFEST_PATH] ?? "{}") as ManifestShape;
  const kase = manifest.cases.find((entry) => entry.caseId === caseId);
  const assertion = kase?.assertions[ordinal];
  if (kase === undefined || assertion === undefined) throw new Error(`no ${caseId} #${String(ordinal)}`);
  rewrite(assertion.params);
  files[MANIFEST_PATH] = JSON.stringify(manifest);
  return files;
}

async function onlyFailure(caseId: string, files: CorpusFileTable): Promise<AssertionResult> {
  const result = await runCorpusHarness({ kind: "CASE", caseId }, { runtime: "NODE" }, files);
  if (!result.ok) throw new Error(describeFailures(result));
  const failed = result.results.filter((entry) => entry.status === "FAILED");
  expect(failed, describeFailures(result)).toHaveLength(1);
  const failure = failed[0];
  if (failure === undefined) throw new Error("unreachable");
  expect(result.complete).toBe(false);
  return failure;
}

describe("a wrong authority verdict fails with the facade's actual comparison", () => {
  it("MATCH pinned as REJECTED", async () => {
    const caseId = "spec-assassination.observed-garrote-at-q-is-authority-compatible";
    const files = withParams(caseId, 0, (params) => {
      (params["expected"] as Json)["outcome"] = "REJECTED";
      (params["expected"] as Json)["basis"] = "OBSERVED_ACTION_REJECTED_BY_AUTHORITY";
    });

    const failure = await onlyFailure(caseId, files);

    expect(failure.kind).toBe("SPEC_ASSASSINATION.DECISION_COVERAGE");
    expect(failure.owningLayer).toBe("SPEC_ASSASSINATION");
    expect(failure.artifactId).toBe("wcl-assassination-d2-decision-corpus");
    expect((failure.expected as Json)["outcome"]).toBe("REJECTED");
    expect((failure.actual as Json)["outcome"]).toBe("MATCH");
    expect((failure.actual as Json)["authorityToken"]).toBe("garrote");
    expect((failure.locator as Json)["reportTimeMs"]).toBe(2_176_580);
  });

  it("UNKNOWN pinned as MATCH — an UNKNOWN must not be laundered into agreement", async () => {
    const caseId = "spec-assassination.deathmark-stays-unknown-on-predictive-state";
    const files = withParams(caseId, 0, (params) => {
      Object.assign(params["expected"] as Json, {
        outcome: "MATCH",
        basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
        authorityCoverage: "EXACT_ENTRY",
        authorityToken: "deathmark",
        selectionPrecision: "EXACT_ENTRY",
        decisiveBlocker: null,
      });
    });

    const failure = await onlyFailure(caseId, files);

    expect((failure.actual as Json)["outcome"]).toBe("UNKNOWN");
    expect((failure.actual as Json)["decisiveBlocker"]).toBe("OBSERVED_STATE_MISSING");
  });
});

describe("a wrong state expectation fails with the layer's actual result and its evidence locator", () => {
  it("names the real anchor when the pinned aura anchor is wrong", async () => {
    const caseId = "combat-state.vanish-buff-active-before-garrote-with-retained-coverage";
    const files = withParams(caseId, 0, (params) => {
      (params["expected"] as Json)["anchorReportTimeMs"] = 2_176_119;
    });

    const failure = await onlyFailure(caseId, files);

    expect(failure.kind).toBe("COMBAT_STATE.AURA_PRESENCE");
    expect(((failure.actual as Json)["value"] as Json)["anchorReportTimeMs"]).toBe(2_176_120);
    expect((failure.locator as Json)["rawType"]).toBe("applybuff");
    expect((failure.locator as Json)["reportTimeMs"]).toBe(2_176_120);
  });

  it("reports NO_OBSERVATION when a missing combo-point entry is pinned as zero", async () => {
    const caseId = "combat-state.missing-combo-point-entry-is-no-observation-not-zero";
    const files = withParams(caseId, 0, (params) => {
      params["expected"] = {
        certainty: "EXACT",
        observedAmount: 0,
        observedMax: 7,
        observedCost: 0,
        timing: "PRE_COST",
      };
    });

    const failure = await onlyFailure(caseId, files);

    expect((failure.actual as Json)["certainty"]).toBe("UNKNOWN");
    expect((failure.actual as Json)["reason"]).toBe("NO_OBSERVATION");
  });

  it("reports the actual raw type and side when a normalization side reference is wrong", async () => {
    const caseId = "normalization.boss-sourced-events-survive-the-unfiltered-stream";
    const files = withParams(caseId, 2, (params) => {
      (params["expected"] as Json)["actorId"] = 161;
    });

    const failure = await onlyFailure(caseId, files);

    expect(failure.kind).toBe("NORMALIZATION.SIDE_REFERENCE");
    expect(((failure.actual as Json)["reference"] as Json)["actorId"]).toBe(160);
    expect((failure.locator as Json)["rawIndex"]).toBe(0);
  });
});

describe("a wrong transport expectation fails with what the paginator actually requested", () => {
  it("shows the verbatim cursor when the case pins an offset one", async () => {
    const caseId = "wcl-transport.cursor-is-passed-verbatim-and-nothing-is-deduplicated";
    const files = withParams(caseId, 0, (params) => {
      (params["expected"] as Json)["requestedStartTimes"] = [1000, 1501];
    });

    const failure = await onlyFailure(caseId, files);

    expect(failure.kind).toBe("WCL_PAGINATION.STREAM_OUTCOME");
    expect((failure.actual as Json)["requestedStartTimes"]).toEqual([1000, 1500]);
    expect((failure.actual as Json)["eventsRetrieved"]).toBe(4);
  });
});

describe("the printed failure is readable without the object", () => {
  it("carries case, ordinal, kind, layer, artifact, expected, actual and locator on one entry", async () => {
    const caseId = "combat-state.kingsbane-anchor-is-the-most-recent-observed-cast";
    const files = withParams(caseId, 0, (params) => {
      params["expectedReportTimeMs"] = 2_173_777;
    });
    const result = await runCorpusHarness({ kind: "CASE", caseId }, { runtime: "NODE" }, files);
    const text = describeFailures(result);

    expect(text).toContain(`[FAILED] ${caseId} #0 COMBAT_STATE.LAST_OBSERVED_CAST_AT`);
    expect(text).toContain("(COMBAT_STATE, wcl-assassination-kingsbane-cooldown)");
    expect(text).toContain("expected:");
    expect(text).toContain("2173777");
    expect(text).toContain("actual:");
    expect(text).toContain("2173778");
    expect(text).toContain("locator:");
    // And it is not a payload dump.
    expect(text.length).toBeLessThan(1_000);
  });
});

describe("evidence and authority drift fail before anything executes", () => {
  it("a changed artifact byte fails validation with both digests", async () => {
    const files = { ...committedCorpusFiles() };
    const path = "artifacts/wcl-events/wcl-boss-sourced.json";
    files[path] = (files[path] ?? "").replace('"sourceID": 160', '"sourceID": 161');

    const result = await runCorpusHarness({ kind: "ALL" }, { runtime: "WORKERD" }, files);

    expect(result.ok).toBe(false);
    if (result.ok || result.stage !== "VALIDATION") throw new Error("expected a validation failure");
    const digest = result.errors.find((error) => error.code === "ARTIFACT_DIGEST_MISMATCH");
    expect(digest?.subject).toEqual({ artifactId: "wcl-boss-sourced" });
    expect(digest?.message).toContain("hashes to");
  });

  it("a re-pinned authority revision fails validation naming the committed one", async () => {
    const files = { ...committedCorpusFiles() };
    const manifest = JSON.parse(files[MANIFEST_PATH] ?? "{}") as ManifestShape;
    const kase = manifest.cases.find(
      (entry) => entry.caseId === "spec-assassination.observed-garrote-at-q-is-authority-compatible",
    );
    if (kase === undefined) throw new Error("case missing");
    (kase["authority"] as Json)["artifactRevision"] = "simc-ffffffff-9";
    files[MANIFEST_PATH] = JSON.stringify(manifest);

    const result = await runCorpusHarness({ kind: "ALL" }, { runtime: "WORKERD" }, files);

    expect(result.ok).toBe(false);
    if (result.ok || result.stage !== "VALIDATION") throw new Error("expected a validation failure");
    const stale = result.errors.find((error) => error.code === "CASE_AUTHORITY_REVISION_STALE");
    expect(stale?.message).toContain("simc-33622e9d-1");
  });
});
