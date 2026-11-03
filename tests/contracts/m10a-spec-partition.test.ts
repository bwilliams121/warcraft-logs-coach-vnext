/**
 * M10-A: the internal/public specialization partition — as it stands after
 * M10-D moved Protection Paladin into the public half.
 *
 * `SpecId` is what this build KNOWS; `PublicSpecId` is what it PUBLISHES. The
 * two are partitioned at compile time in `src/findings/spec-id.ts`; these tests
 * pin the runtime arrays to that partition, pin the public contract's own enum
 * to the public half, and prove the narrowing boundary still fails closed for
 * an id outside the public set.
 *
 * THE INTERNAL-ONLY SET IS EMPTY, AND THAT IS PINNED. Both known
 * specializations are public. The machinery that kept Protection Paladin
 * internal from M10-A to M10-C — the partition, `requirePublicSpecId`,
 * `InternalSpecExposureError`, the registry's exposure rules — is retained
 * as dormant architecture for the next specialization, and a test here says
 * so explicitly rather than letting the emptiness look accidental.
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
  type SpecId,
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

  it("Assassination, both Paladins, Blood Death Knight, Brewmaster Monk and Augmentation Evoker are public", () => {
    expect(PUBLIC_SPEC_IDS).toEqual([
      "rogue/assassination",
      "paladin/protection",
      "paladin/retribution",
      "deathknight/blood",
      "monk/brewmaster",
      "evoker/augmentation",
    ]);
    expect(isPublicSpecId("evoker/augmentation")).toBe(true);
    expect(isPublicSpecId("monk/brewmaster")).toBe(true);
    expect(isSpecId("monk/brewmaster")).toBe(true);
    expect(isPublicSpecId("rogue/assassination")).toBe(true);
    expect(isPublicSpecId("paladin/protection")).toBe(true);
    expect(isPublicSpecId("paladin/retribution")).toBe(true);
    expect(isPublicSpecId("deathknight/blood")).toBe(true);
    expect(isSpecId("paladin/protection")).toBe(true);
    expect(isSpecId("paladin/retribution")).toBe(true);
    expect(isSpecId("deathknight/blood")).toBe(true);
  });

  it("the internal-only set holds Restoration Shaman since HEAL-A", () => {
    // Deliberate and pinned. The set was empty from M10-D to M11-A3, held
    // Retribution Paladin from M11-A4, was empty again from M11-A5, held the
    // Blood Death Knight measurement slice from M11-B2, was empty again from
    // M11-B12, held the Brewmaster Monk measurement slice from M11-C2, was
    // empty again from M11-C4j, held Augmentation Evoker in M13-E (the first
    // registration with no decision authority), was empty again from M13-F,
    // which published its support observations, and holds Restoration Shaman
    // (the first healer registration) since HEAL-A.
    expect(INTERNAL_ONLY_SPEC_IDS).toEqual(["shaman/restoration"]);
    expect(isSpecId("shaman/restoration")).toBe(true);
    expect(isPublicSpecId("shaman/restoration")).toBe(false);
    expect(() => requirePublicSpecId("shaman/restoration")).toThrow(InternalSpecExposureError);
    expect(isSpecId("evoker/augmentation")).toBe(true);
    expect(requirePublicSpecId("evoker/augmentation")).toBe("evoker/augmentation");
    // The narrowing boundary still refuses a name that is no specialization at all.
    expect(() => requirePublicSpecId("warrior/arms" as never)).toThrow(InternalSpecExposureError);
    for (const id of PUBLIC_SPEC_IDS) expect(isPublicSpecId(id), id).toBe(true);
    expect(requirePublicSpecId("monk/brewmaster")).toBe("monk/brewmaster");
  });

  it("an unknown string is not a spec id at all", () => {
    for (const value of [
      "",
      "paladin",
      "rogue/outlaw",
      "Rogue/Assassination",
      "Paladin/Protection",
      "Paladin/Retribution",
      "paladin/holy",
      "deathknight/frost",
      "monk/mistweaver",
      "monk/windwalker",
      "Monk/Brewmaster",
      "warrior/arms",
      "constructor",
    ]) {
      expect(isSpecId(value), value).toBe(false);
    }
  });
});

describe("the public contract names exactly the public half", () => {
  it("declares the same public ids as the partition", () => {
    expect([...CONTRACT_PUBLIC_SPEC_IDS].sort()).toEqual([...PUBLIC_SPEC_IDS].sort());
  });

  it("accepts every public id as a specialization value and rejects an unknown one", () => {
    const minimal = {
      schemaVersion: "warcraft-logs-coach.analysis/1",
      identity: {
        report: { code: "abc", revision: 1 },
        fight: { id: 1, name: "x", encounterId: 1, difficulty: 5, startTimeMs: 0, endTimeMs: 1 },
        player: { sourceId: 1, name: "p", className: "Warrior", specName: "Arms" },
        data: { logVersion: 17, gameVersion: 1 },
      },
      specialization: { specId: "warrior/arms", gameplaySupported: false },
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
    // An id this build has no name for is refused as a VALUE.
    expect(PublicAnalysisResultSchema.safeParse(minimal).success).toBe(false);
    // `null` — no public analyzer — is the only way an unsupported one appears.
    expect(
      PublicAnalysisResultSchema.safeParse({
        ...minimal,
        specialization: { specId: null, gameplaySupported: false },
      }).success,
    ).toBe(true);
    // Every public id is a legitimate value.
    for (const specId of PUBLIC_SPEC_IDS) {
      expect(
        PublicAnalysisResultSchema.safeParse({
          ...minimal,
          specialization: { specId, gameplaySupported: true },
        }).success,
        specId,
      ).toBe(true);
    }
  });

  it("the identity table resolves exactly the public ids", () => {
    expect(Object.values(SUPPORTED_SPEC_IDENTITIES).sort()).toEqual([...PUBLIC_SPEC_IDS].sort());
    for (const id of Object.values(SUPPORTED_SPEC_IDENTITIES)) expect(isPublicSpecId(id), id).toBe(true);
    expect(resolveSpecIdentity({ className: "Paladin", specName: "Protection" })).toEqual({
      ok: true,
      specId: "paladin/protection",
    });
    expect(resolveSpecIdentity({ className: "Paladin", specName: "Retribution" })).toEqual({
      ok: true,
      specId: "paladin/retribution",
    });
    const arms = resolveSpecIdentity({ className: "Warrior", specName: "Arms" });
    expect(arms.ok).toBe(false);
    if (arms.ok) return;
    expect(arms.reason).toBe("UNSUPPORTED_SPECIALIZATION");
  });
});

describe("narrowing to a public id", () => {
  it("returns each public id unchanged", () => {
    expect(requirePublicSpecId("rogue/assassination")).toBe("rogue/assassination");
    expect(requirePublicSpecId("paladin/protection")).toBe("paladin/protection");
    expect(requirePublicSpecId("paladin/retribution")).toBe("paladin/retribution");
  });

  it("still fails closed for an id outside the public set, and never returns null", () => {
    // No internal-only id exists to hand it, so the boundary is exercised with
    // an id the build does not know at all — cast through the type, exactly
    // as a defect would arrive at runtime. The error must be the typed one,
    // and the function must not return anything.
    const foreign = "warrior/arms" as unknown as SpecId;
    expect(() => requirePublicSpecId(foreign)).toThrow(InternalSpecExposureError);
    let returned: unknown = "not-called";
    try {
      returned = requirePublicSpecId(foreign);
    } catch {
      // expected
    }
    expect(returned).toBe("not-called");
  });

  it("an ANALYZED result naming an id outside the public set cannot be projected — not as unsupported, not as specId null", () => {
    // If a public path ever assembled this, the only honest outcome is an error.
    const rogue = analyzedFightAnalysis({ fightId: 1, sourceId: 7, comparisons: [] });
    const foreign: FightAnalysis = {
      ...rogue,
      specId: "warrior/arms" as unknown as SpecId,
      analyzerId: "test-foreign-analyzer",
      analysis: { ...rogue.analysis, specId: "warrior/arms" as unknown as SpecId },
    };

    expect(() => projectAnalysisResult(foreign)).toThrow(InternalSpecExposureError);
  });

  it("an UNANALYZED result that names such an analyzer cannot be projected either", () => {
    const rogue = analyzedFightAnalysis({ fightId: 1, sourceId: 7, comparisons: [] });
    const foreign: FightAnalysis = {
      ...rogue,
      specId: "warrior/arms" as unknown as SpecId,
      analyzerId: "test-foreign-analyzer",
      analysis: { status: "INSUFFICIENT_EVIDENCE", specId: "warrior/arms", detail: "fixture" },
      observedDecisions: null,
    };
    expect(() => projectAnalysisResult(foreign)).toThrow(InternalSpecExposureError);
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
      analysis: { status: "SPEC_NOT_SUPPORTED", specId: "warrior/arms", detail: "no analyzer" },
      observedDecisions: null,
    };
    const projected = projectAnalysisResult(unsupported);
    expect(projected.specialization).toEqual({ specId: null, gameplaySupported: false });
    expect(projected.status).toBe("SPEC_NOT_SUPPORTED");
  });
});
