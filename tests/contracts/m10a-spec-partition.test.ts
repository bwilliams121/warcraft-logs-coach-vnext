/**
 * M10-A: the internal/public specialization partition.
 *
 * `SpecId` is what this build KNOWS; `PublicSpecId` is what it PUBLISHES. The
 * two are partitioned at compile time in `src/findings/spec-id.ts`; these tests
 * pin the runtime arrays to that partition, pin the public contract's own enum
 * to the public half, and prove that an internal-only id cannot cross a public
 * boundary — not as a value, and not as `null`.
 */

import { describe, expect, it } from "vitest";

import {
  PUBLIC_SPEC_IDS as CONTRACT_PUBLIC_SPEC_IDS,
  PublicAnalysisResultSchema,
} from "../../src/contracts/analysis-contract.js";
import { projectAnalysisResult } from "../../src/contracts/analysis-projection.js";
import {
  INTERNAL_ONLY_SPEC_IDS,
  InternalSpecExposureError,
  isPublicSpecId,
  isSpecId,
  PUBLIC_SPEC_IDS,
  requirePublicSpecId,
  SPEC_IDS,
} from "../../src/findings/spec-id.js";
import { resolveSpecIdentity, SUPPORTED_SPEC_IDENTITIES } from "../../src/services/spec-identity.js";
import type { FightAnalysis } from "../../src/services/result.js";
import { analyzedFightAnalysis } from "../support/aggregation-fixture.js";

describe("the known specialization ids are exactly partitioned", () => {
  it("public and internal-only together cover every known id, with no overlap", () => {
    const union = [...PUBLIC_SPEC_IDS, ...INTERNAL_ONLY_SPEC_IDS].sort();
    expect(union).toEqual([...SPEC_IDS].sort());
    expect(new Set(union).size).toBe(union.length);
    for (const id of PUBLIC_SPEC_IDS) expect(INTERNAL_ONLY_SPEC_IDS as readonly string[]).not.toContain(id);
  });

  it("Assassination is public", () => {
    expect(PUBLIC_SPEC_IDS).toEqual(["rogue/assassination"]);
    expect(isPublicSpecId("rogue/assassination")).toBe(true);
  });

  it("Protection Paladin is known internally and internal-only", () => {
    expect(isSpecId("paladin/protection")).toBe(true);
    expect(INTERNAL_ONLY_SPEC_IDS).toEqual(["paladin/protection"]);
    expect(isPublicSpecId("paladin/protection")).toBe(false);
  });

  it("an unknown string is not a spec id at all", () => {
    for (const value of ["", "paladin", "rogue/outlaw", "Rogue/Assassination", "constructor"]) {
      expect(isSpecId(value), value).toBe(false);
    }
  });
});

describe("the public contract names exactly the public half", () => {
  it("declares the same public ids as the partition", () => {
    expect([...CONTRACT_PUBLIC_SPEC_IDS].sort()).toEqual([...PUBLIC_SPEC_IDS].sort());
  });

  it("still rejects the internal-only Paladin id as a specialization value", () => {
    const minimal = {
      schemaVersion: "warcraft-logs-coach.analysis/1",
      identity: {
        report: { code: "abc", revision: 1 },
        fight: { id: 1, name: "x", encounterId: 1, difficulty: 5, startTimeMs: 0, endTimeMs: 1 },
        player: { sourceId: 1, name: "p", className: "Paladin", specName: "Protection" },
        data: { logVersion: 17, gameVersion: 1 },
      },
      specialization: { specId: "paladin/protection", gameplaySupported: false },
      capability: {
        analysisKind: "OBSERVED_DECISION_AUTHORITY_VERIFICATION",
        matchMeaning: "AUTHORITY_COMPATIBLE_ONLY",
        verifiesObservedDecisionsOnly: true,
        predictsArbitraryNextAction: false,
        scoresPerformance: false,
        unknownIsFirstClass: true,
        partialCoverageIsExpected: true,
      },
      analyzerId: null,
      status: "SPEC_NOT_SUPPORTED",
      detail: "not analyzed",
    };
    expect(PublicAnalysisResultSchema.safeParse(minimal).success).toBe(false);
    expect(
      PublicAnalysisResultSchema.safeParse({
        ...minimal,
        specialization: { specId: null, gameplaySupported: false },
      }).success,
    ).toBe(true);
  });

  it("the identity table resolves only public ids, and still refuses Paladin/Protection", () => {
    for (const id of Object.values(SUPPORTED_SPEC_IDENTITIES)) expect(isPublicSpecId(id), id).toBe(true);
    const resolved = resolveSpecIdentity({ className: "Paladin", specName: "Protection" });
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.reason).toBe("UNSUPPORTED_SPECIALIZATION");
  });
});

describe("narrowing to a public id fails closed", () => {
  it("returns a public id unchanged", () => {
    expect(requirePublicSpecId("rogue/assassination")).toBe("rogue/assassination");
  });

  it("throws a typed error for an internal-only id, and never returns null", () => {
    expect(() => requirePublicSpecId("paladin/protection")).toThrow(InternalSpecExposureError);
    let returned: unknown = "not-called";
    try {
      returned = requirePublicSpecId("paladin/protection");
    } catch {
      // expected
    }
    expect(returned).toBe("not-called");
  });

  it("an internal-only ANALYZED result cannot be projected — not as unsupported, not as specId null", () => {
    // A well-formed analyzed result whose registration is internal-only. If a
    // public path ever assembled this, the only honest outcome is an error.
    const rogue = analyzedFightAnalysis({ fightId: 1, sourceId: 7, comparisons: [] });
    const internal: FightAnalysis = {
      ...rogue,
      specId: "paladin/protection",
      analyzerId: "test-internal-fixture-protection-paladin",
      analysis: { ...rogue.analysis, specId: "paladin/protection" },
    };

    expect(() => projectAnalysisResult(internal)).toThrow(InternalSpecExposureError);
  });

  it("an internal-only UNANALYZED result that names an internal analyzer cannot be projected either", () => {
    const rogue = analyzedFightAnalysis({ fightId: 1, sourceId: 7, comparisons: [] });
    const internal: FightAnalysis = {
      ...rogue,
      specId: "paladin/protection",
      analyzerId: "test-internal-fixture-protection-paladin",
      analysis: { status: "INSUFFICIENT_EVIDENCE", specId: "paladin/protection", detail: "fixture" },
      observedDecisions: null,
    };
    expect(() => projectAnalysisResult(internal)).toThrow(InternalSpecExposureError);
  });

  it("`specId: null` keeps its one meaning — no public analyzer was selected", () => {
    // The ordinary unsupported path: identity resolved to nothing public, no
    // analyzer ran. This projects, and it is the ONLY way null appears.
    const rogue = analyzedFightAnalysis({ fightId: 1, sourceId: 7, comparisons: [] });
    const unsupported: FightAnalysis = {
      ...rogue,
      specId: null,
      analyzerId: null,
      scope: null,
      analysis: { status: "SPEC_NOT_SUPPORTED", specId: "paladin/protection", detail: "no analyzer" },
      observedDecisions: null,
    };
    const projected = projectAnalysisResult(unsupported);
    expect(projected.specialization).toEqual({ specId: null, gameplaySupported: false });
    expect(projected.status).toBe("SPEC_NOT_SUPPORTED");
  });
});
