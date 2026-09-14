/**
 * What the M5 analysis facade guarantees, and what it must never acquire.
 *
 * The facade is the surface M6 will expose. Everything asserted here is a
 * promise to that milestone: a small result, a hard spec gate, honest partial
 * coverage, and no hidden dependency on retrieval or transport.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  analyzeObservedAssassinationDecisions,
  ANALYSIS_STATUSES,
  DECISION_EXCLUSION_REASONS,
  summarize,
} from "../../src/specs/rogue/assassination/observed-analysis.js";
import { M5D2_ACTOR, M5D2_TARGET, m5d2State } from "../support/m5d2-fixture.js";

const SUPPORTED_SPEC = "rogue/assassination";
const FACADE_PATH = "src/specs/rogue/assassination/observed-analysis.ts";

function analyze(specId: string = SUPPORTED_SPEC) {
  return analyzeObservedAssassinationDecisions({
    state: m5d2State(),
    actorId: M5D2_ACTOR,
    specId,
    targetActorId: M5D2_TARGET,
  });
}

const analysis = analyze();

describe("the supported specialization is exactly one, and it is checked", () => {
  it("analyses Assassination Rogue", () => {
    expect(analysis.status).toBe("ANALYZED");
  });

  it("returns SPEC_NOT_SUPPORTED for anything else, without analysing it", () => {
    // The failure mode: a spec falls through and gets Rogue rules applied to it,
    // producing a well-formed report about the wrong game.
    for (const spec of ["paladin/protection", "evoker/augmentation", "rogue/outlaw", "rogue/subtlety", ""]) {
      const result = analyze(spec);
      expect(`${spec}=${result.status}`).toBe(`${spec}=SPEC_NOT_SUPPORTED`);
      expect("comparisons" in result).toBe(false);
      expect("coverage" in result).toBe(false);
    }
  });

  it("does not produce an empty analysis that reads as clean play", () => {
    // An unsupported spec must not come back ANALYZED with zero findings, which
    // a reader would take as "nothing to fix".
    const result = analyze("rogue/subtlety");
    if (result.status === "ANALYZED") throw new Error("unsupported spec was analysed");
    expect(result.detail).toContain("Milestone 5 supports");
    expect(result.detail.length).toBeGreaterThan(40);
  });

  it("keeps the failure statuses distinct rather than flattening them", () => {
    expect([...ANALYSIS_STATUSES]).toEqual([
      "ANALYZED",
      "SPEC_NOT_SUPPORTED",
      "AUTHORITY_NOT_AVAILABLE",
      "PROFILE_NOT_RESOLVED",
      "INSUFFICIENT_EVIDENCE",
    ]);
  });

  it("distinguishes a missing authority from an unsupported spec", () => {
    const result = analyzeObservedAssassinationDecisions({
      state: m5d2State(),
      actorId: M5D2_ACTOR,
      specId: SUPPORTED_SPEC,
      targetActorId: M5D2_TARGET,
      authority: null,
    });
    expect(result.status).toBe("AUTHORITY_NOT_AVAILABLE");
    expect(result.status).not.toBe("SPEC_NOT_SUPPORTED");
  });

  it("distinguishes an unresolved profile from both", () => {
    // An actor with no combatantinfo cannot have applicability or usability
    // established, and that is its own condition.
    const result = analyzeObservedAssassinationDecisions({
      state: m5d2State(),
      actorId: 999,
      specId: SUPPORTED_SPEC,
      targetActorId: M5D2_TARGET,
    });
    expect(result.status).toBe("PROFILE_NOT_RESOLVED");
  });
});

describe("the analysis result", () => {
  it("carries pinned authority metadata read from the artifact", () => {
    if (analysis.status !== "ANALYZED") return;
    expect(analysis.authority).toStrictEqual({
      authorityId: "SIMC_APL_ROGUE_ASSASSINATION",
      artifactRevision: "simc-33622e9d-1",
      repository: "https://github.com/simulationcraft/simc",
      branch: "midnight",
      commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
      sourcePath: "engine/class_modules/apl/apl_rogue.cpp",
      sourceSha256: "a74e4daa8376197d94f8449555035b3fd67634db450d2f7cb16bf84233939eb3",
      specName: "assassination",
      className: "rogue",
    });
  });

  it("gives every comparison a stable locator, not just a timestamp", () => {
    // Equal timestamps are real in this data, so a decision is identified by
    // canonical position and ingestion locator. Time alone cannot do it.
    if (analysis.status !== "ANALYZED") return;
    const keys = new Set<string>();
    for (const c of analysis.comparisons) {
      const l = c.decision.locator;
      expect(Number.isInteger(c.decision.position)).toBe(true);
      expect(l.streamId.length).toBeGreaterThan(0);
      keys.add(
        `${l.streamId}#${String(l.pageOrdinal)}#${String(l.indexInPage)}#${String(l.ingestionOrdinal)}`,
      );
    }
    expect(keys.size).toBe(analysis.comparisons.length);
  });

  it("preserves canonical event ordering", () => {
    if (analysis.status !== "ANALYZED") return;
    const positions = analysis.comparisons.map((c) => c.decision.position);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it("treats partial coverage as a successful analysis, never an error", () => {
    // Ten of eleven eligible decisions are UNKNOWN on this fixture. That is the
    // analyzer working; turning it into a failure would hide the disclosure.
    if (analysis.status !== "ANALYZED") return;
    expect(analysis.coverage.unknown).toBeGreaterThan(0);
    expect(analysis.status).toBe("ANALYZED");
  });

  it("enumerates decisions mechanically rather than from a hard-coded list", () => {
    // A list of interesting timestamps would silently stop finding decisions the
    // moment the fixture moved. The source carries no such list.
    const source = readFileSync(FACADE_PATH, "utf8");
    expect(source).not.toMatch(/2_1\d{2}_\d{3}/);
    // Enumeration runs off M4's source-actor index, which is what makes it
    // mechanical: the set of decisions comes from the evidence, not from here.
    expect(source).toContain("state.positionsBySourceActor(actorId)");
  });
});

describe("the facade owns no retrieval and no transport", () => {
  const source = readFileSync(FACADE_PATH, "utf8");

  it("imports no HTTP, router or response code", () => {
    for (const forbidden of ["/api/", "/routes/", "hono", "Request", "Response", "statusFor"]) {
      expect(`${forbidden}:${source.includes(forbidden) ? "present" : "absent"}`).toBe(`${forbidden}:absent`);
    }
  });

  it("imports no Warcraft Logs client and performs no fetch", () => {
    // M3 owns retrieval. An analyzer that can fetch will eventually fetch to
    // fill a gap, and the gap is exactly what it is supposed to report.
    for (const forbidden of ["/wcl/", "graphql", "fetch(", "token-provider"]) {
      expect(`${forbidden}:${source.includes(forbidden) ? "present" : "absent"}`).toBe(`${forbidden}:absent`);
    }
  });

  it("is pure with respect to its input", () => {
    // Two calls on independently built states agree exactly.
    const again = analyze();
    if (analysis.status !== "ANALYZED" || again.status !== "ANALYZED") return;
    expect(again.coverage).toStrictEqual(analysis.coverage);
    expect(again.comparisons.map((c) => `${String(c.decision.position)}:${c.outcome}`)).toEqual(
      analysis.comparisons.map((c) => `${String(c.decision.position)}:${c.outcome}`),
    );
  });
});

describe("an empty analysis is safe", () => {
  it("summarizes zero decisions without inventing a denominator", () => {
    const empty = summarize(19, [], []);
    expect(empty.eligibleDecisions).toBe(0);
    expect(empty.resolvedComparisons).toBe(0);
    expect(empty.match + empty.rejected + empty.unknown).toBe(0);
    expect(empty.exclusions).toEqual([]);
    // No division happens here, so a zero denominator cannot produce NaN.
    expect(Number.isNaN(empty.eligibleDecisions)).toBe(false);
  });

  it("keeps the exclusion vocabulary closed", () => {
    expect([...DECISION_EXCLUSION_REASONS]).toEqual([
      "NON_GCD_ACTION",
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "NO_AUTHORITY_TOKEN_BINDING",
    ]);
  });
});
