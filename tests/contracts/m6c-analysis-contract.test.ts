/**
 * The public analysis contract, as a contract.
 *
 * WHAT THIS FILE GUARDS
 *
 * Two things the projection tests cannot:
 *
 *   1. THE VOCABULARY. The public enums are declared independently of the
 *      internal unions, on purpose — so M5 can be refactored without reshaping
 *      the wire. The cost of that independence is that they can silently drift
 *      apart, and these tests are what stops it: an internal enum gaining a
 *      member fails here rather than quietly never reaching a consumer.
 *
 *   2. WHAT CANNOT EXIST. A score, a percentage, a correctness rating. Absence
 *      is not testable by looking at one result, so it is tested against the
 *      SCHEMA: if the field cannot be declared, no projection can emit it.
 */

import { describe, expect, it } from "vitest";
import * as z from "zod";

import {
  CAPABILITY,
  CapabilitySchema,
  PUBLIC_ANALYSIS_SCHEMA_VERSION,
  PUBLIC_ANALYSIS_STATUSES,
  PUBLIC_AUTHORITY_COVERAGES,
  PUBLIC_COMPARISON_BASES,
  PUBLIC_COMPARISON_OUTCOMES,
  PUBLIC_DECISION_BLOCKER_CLASSES,
  PUBLIC_EXCLUSION_REASONS,
  PUBLIC_SELECTION_PRECISIONS,
  PUBLIC_SPEC_IDS,
  PUBLIC_USABILITY_PROVENANCES,
  PublicAnalysisResultSchema,
} from "../../src/contracts/analysis-contract.js";
import {
  DECISION_BLOCKER_CLASSES,
  DECISION_COVERAGES,
} from "../../src/specs/rogue/assassination/decision-coverage.js";
import {
  ANALYSIS_STATUSES,
  DECISION_EXCLUSION_REASONS,
} from "../../src/specs/rogue/assassination/observed-analysis.js";
import {
  COMPARISON_BASES,
  COMPARISON_OUTCOMES,
} from "../../src/specs/rogue/assassination/observed-comparison.js";

describe("the schema version", () => {
  it("is the documented literal", () => {
    expect(PUBLIC_ANALYSIS_SCHEMA_VERSION).toBe("warcraft-logs-coach.analysis/1");
  });

  it("is not any other version this project carries", () => {
    // It versions the WIRE SHAPE. Conflating it with the authority commit, the
    // Worker build or the game version would make a consumer think a schema
    // changed when a fixture was regenerated, or the reverse.
    expect(PUBLIC_ANALYSIS_SCHEMA_VERSION).not.toContain("0.1.0");
    expect(PUBLIC_ANALYSIS_SCHEMA_VERSION).not.toContain("33622e9d");
    expect(PUBLIC_ANALYSIS_SCHEMA_VERSION).not.toContain("2026-07-28");
  });

  it("is required on every result variant", () => {
    const parsed = PublicAnalysisResultSchema.safeParse({ status: "ANALYZED" });
    expect(parsed.success).toBe(false);
  });
});

describe("the public vocabularies match the internal ones exactly", () => {
  // Declared separately and checked here, rather than imported. Importing would
  // make an internal addition a silent public addition; this makes it a
  // decision somebody has to record.
  const pairs: readonly {
    readonly name: string;
    readonly pub: readonly string[];
    readonly internal: readonly string[];
  }[] = [
    { name: "comparison outcomes", pub: PUBLIC_COMPARISON_OUTCOMES, internal: COMPARISON_OUTCOMES },
    { name: "comparison bases", pub: PUBLIC_COMPARISON_BASES, internal: COMPARISON_BASES },
    { name: "authority coverages", pub: PUBLIC_AUTHORITY_COVERAGES, internal: DECISION_COVERAGES },
    { name: "blocker classes", pub: PUBLIC_DECISION_BLOCKER_CLASSES, internal: DECISION_BLOCKER_CLASSES },
    { name: "exclusion reasons", pub: PUBLIC_EXCLUSION_REASONS, internal: DECISION_EXCLUSION_REASONS },
    { name: "analysis statuses", pub: PUBLIC_ANALYSIS_STATUSES, internal: ANALYSIS_STATUSES },
  ];

  for (const pair of pairs) {
    it(`publishes every internal value for ${pair.name}`, () => {
      expect([...pair.pub].sort()).toEqual([...pair.internal].sort());
    });
  }

  it("publishes the two selection precisions", () => {
    // No internal const array exists for this union, so the values are pinned
    // directly. They are a strict subset of the authority coverages.
    expect([...PUBLIC_SELECTION_PRECISIONS]).toEqual(["EXACT_ENTRY", "TOKEN_CONVERGED"]);
    for (const precision of PUBLIC_SELECTION_PRECISIONS) {
      expect(PUBLIC_AUTHORITY_COVERAGES).toContain(precision);
    }
  });

  it("publishes the two usability provenances", () => {
    expect([...PUBLIC_USABILITY_PROVENANCES]).toEqual(["OBSERVED_EXECUTION", "NOT_ESTABLISHED"]);
  });

  it("publishes exactly the supported specialization", () => {
    expect([...PUBLIC_SPEC_IDS]).toEqual(["rogue/assassination"]);
  });

  it("keeps outcome and precision as separate vocabularies", () => {
    // Collapsing them would let a token-level agreement read as an entry-level
    // one. `NO_ACTION` and `UNKNOWN` are coverages and are not precisions.
    expect(PUBLIC_SELECTION_PRECISIONS).not.toContain("NO_ACTION");
    expect(PUBLIC_SELECTION_PRECISIONS).not.toContain("UNKNOWN");
  });
});

describe("the status vocabulary is the analysis one, unchanged", () => {
  it("uses no success/failure replacement words", () => {
    // Analysis statuses are not transport outcomes. `SUCCESS`/`FAILED` would
    // invite a consumer to treat SPEC_NOT_SUPPORTED as an error to retry.
    for (const banned of ["SUCCESS", "FAILED", "FAILURE", "GOOD", "BAD", "CORRECT", "INCORRECT", "OK"]) {
      expect(PUBLIC_ANALYSIS_STATUSES).not.toContain(banned);
    }
  });

  it("discriminates on status", () => {
    for (const status of PUBLIC_ANALYSIS_STATUSES) {
      const parsed = PublicAnalysisResultSchema.safeParse({ status, schemaVersion: "nope" });
      // Rejected for missing fields, not for an unknown discriminant.
      expect(parsed.success).toBe(false);
    }
  });
});

describe("capability semantics are machine-readable", () => {
  it("states what the analysis is", () => {
    expect(CAPABILITY.analysisKind).toBe("OBSERVED_DECISION_AUTHORITY_VERIFICATION");
    expect(CAPABILITY.verifiesObservedDecisionsOnly).toBe(true);
  });

  it("states that MATCH is authority-compatible only", () => {
    expect(CAPABILITY.matchMeaning).toBe("AUTHORITY_COMPATIBLE_ONLY");
  });

  it("states that it predicts no arbitrary next action and scores nothing", () => {
    expect(CAPABILITY.predictsArbitraryNextAction).toBe(false);
    expect(CAPABILITY.scoresPerformance).toBe(false);
  });

  it("states that UNKNOWN is first-class and coverage is partial", () => {
    expect(CAPABILITY.unknownIsFirstClass).toBe(true);
    expect(CAPABILITY.partialCoverageIsExpected).toBe(true);
  });

  it("pins every capability value with a literal, so none can be flipped", () => {
    // The safe answer is the literal type. A projection cannot publish
    // `scoresPerformance: true` because the schema has no way to express it.
    expect(CapabilitySchema.safeParse({ ...CAPABILITY, scoresPerformance: true }).success).toBe(false);
    expect(CapabilitySchema.safeParse({ ...CAPABILITY, predictsArbitraryNextAction: true }).success).toBe(
      false,
    );
    expect(CapabilitySchema.safeParse({ ...CAPABILITY, unknownIsFirstClass: false }).success).toBe(false);
    expect(CapabilitySchema.safeParse({ ...CAPABILITY, matchMeaning: "CORRECT" }).success).toBe(false);
  });

  it("is frozen, so one call cannot alter another's capability block", () => {
    expect(Object.isFrozen(CAPABILITY)).toBe(true);
  });
});

describe("the schema is strict rather than permissive", () => {
  const MINIMAL_UNANALYZED = {
    schemaVersion: PUBLIC_ANALYSIS_SCHEMA_VERSION,
    status: "SPEC_NOT_SUPPORTED",
    identity: {
      report: { code: "aBcDeFgH12345678", revision: 1 },
      fight: {
        id: 6,
        name: "Test Boss",
        encounterId: 2900,
        difficulty: 5,
        startTimeMs: 0,
        endTimeMs: 1000,
      },
      player: { sourceId: 19, name: "Fixtureplayer", className: "Paladin", specName: "Protection" },
      data: { logVersion: 17, gameVersion: 1 },
    },
    specialization: { specId: null, gameplaySupported: false },
    capability: CAPABILITY,
    analyzerId: null,
    detail: "No gameplay analyzer is registered for this specialization.",
  };

  it("accepts a well-formed result", () => {
    expect(PublicAnalysisResultSchema.safeParse(MINIMAL_UNANALYZED).success).toBe(true);
  });

  it("rejects an unknown top-level key", () => {
    // `.strict()` everywhere: an internal field cannot ride along by accident,
    // which is the quiet way a trace ends up on the wire.
    const withExtra = { ...MINIMAL_UNANALYZED, rawBlocker: "UNREAD_CONDITION" };
    expect(PublicAnalysisResultSchema.safeParse(withExtra).success).toBe(false);
  });

  it("rejects an unknown nested key", () => {
    const withExtra = {
      ...MINIMAL_UNANALYZED,
      identity: {
        ...MINIMAL_UNANALYZED.identity,
        player: { ...MINIMAL_UNANALYZED.identity.player, internalNote: "x" },
      },
    };
    expect(PublicAnalysisResultSchema.safeParse(withExtra).success).toBe(false);
  });

  it("rejects an unanalyzed result carrying analysis-shaped fields", () => {
    // The specific misreading this prevents: `{"decisions":[],"coverage":{...0}}`
    // presented for an unsupported spec, which reads as "no mistakes found".
    for (const extra of [{ decisions: [] }, { coverage: { eligibleDecisions: 0 } }, { authority: {} }]) {
      expect(PublicAnalysisResultSchema.safeParse({ ...MINIMAL_UNANALYZED, ...extra }).success).toBe(false);
    }
  });

  it("rejects an empty detail on an unanalyzed result", () => {
    expect(PublicAnalysisResultSchema.safeParse({ ...MINIMAL_UNANALYZED, detail: "" }).success).toBe(false);
  });

  it("rejects a result carrying an ingestion scope", () => {
    // `evidenceScope` was removed from schema v1. Retrieval breadth is not a
    // conclusion, and publishing it invites reading a fetch setting as analysis
    // completeness. `.strict()` is what makes the removal enforceable rather
    // than merely a decision someone once made.
    for (const value of ["PLAYER_CONTEXT", "FULL_RAID", null]) {
      expect(
        PublicAnalysisResultSchema.safeParse({ ...MINIMAL_UNANALYZED, evidenceScope: value }).success,
        `evidenceScope: ${String(value)}`,
      ).toBe(false);
    }
  });

  it("rejects a fabricated specialization id", () => {
    // `paladin/protection` is not a spec this build recognizes. Publishing it
    // would claim recognition the engine does not have.
    const fabricated = {
      ...MINIMAL_UNANALYZED,
      specialization: { specId: "paladin/protection", gameplaySupported: false },
    };
    expect(PublicAnalysisResultSchema.safeParse(fabricated).success).toBe(false);
  });
});

describe("no two-state field stands over a three-state judgment", () => {
  /**
   * A decision that validates, used to probe what the schema will accept.
   *
   * Built once here rather than imported, because this describe block is about
   * what the SCHEMA permits — a projected example would only show what one
   * projection happened to emit.
   */
  const DECISION = {
    locator: {
      streamId: "all",
      pageOrdinal: 0,
      indexInPage: 1,
      ingestionOrdinal: 1,
      rawType: "cast",
      reportTimeMs: 2_176_580,
    },
    position: 1031,
    fightTimeMs: 12_255,
    targetActorId: 21,
    observedAbilityGameId: 703,
    observedToken: "garrote",
    outcome: "UNKNOWN",
    basis: "AUTHORITY_SELECTION_UNRESOLVED",
    authorityCoverage: "UNKNOWN",
    authorityToken: null,
    selectionPrecision: null,
    decisiveBlocker: "OBSERVED_STATE_MISSING",
    usabilityProvenance: "OBSERVED_EXECUTION",
  };

  function withDecision(extra: Record<string, unknown>) {
    return PublicAnalysisResultSchema.safeParse({
      schemaVersion: PUBLIC_ANALYSIS_SCHEMA_VERSION,
      status: "ANALYZED",
      identity: {
        report: { code: "aBcDeFgH12345678", revision: 1 },
        fight: { id: 6, name: "B", encounterId: 2900, difficulty: 5, startTimeMs: 0, endTimeMs: 1 },
        player: { sourceId: 19, name: "P", className: "Rogue", specName: "Assassination" },
        data: { logVersion: 17, gameVersion: 1 },
      },
      specialization: { specId: "rogue/assassination", gameplaySupported: true },
      capability: CAPABILITY,
      analyzerId: "rogue-assassination-observed-decisions",
      authority: {
        authorityId: "a",
        artifactRevision: "b",
        repository: "c",
        branch: "d",
        commitSha: "e",
        sourcePath: "f",
        sourceSha256: "g",
        specName: "assassination",
        className: "rogue",
      },
      decisions: [{ ...DECISION, ...extra }],
      exclusions: [],
      coverage: {
        eligibleDecisions: 1,
        match: 0,
        rejected: 0,
        unknown: 1,
        resolvedComparisons: 0,
        exactEntryMatches: 0,
        tokenConvergedMatches: 0,
        selectionPrecision: [{ key: "UNKNOWN", count: 1 }],
        unknownBases: [{ key: "AUTHORITY_SELECTION_UNRESOLVED", count: 1 }],
        unknownBlockerClasses: [{ key: "OBSERVED_STATE_MISSING", count: 1 }],
        exclusions: [],
        excludedCastCount: 0,
      },
    }).success;
  }

  it("accepts the probe decision, so the rejections below mean something", () => {
    expect(withDecision({})).toBe(true);
  });

  it("rejects `observedActionRejected`", () => {
    // The internal judgment has three states and no positive one, so its
    // boolean `false` means "rejection was not proven" — not "not rejected".
    // Publishing it would turn UNKNOWN into a negative claim the engine never
    // made, which is the one conversion M5 permanently forbids.
    expect(withDecision({ observedActionRejected: false })).toBe(false);
    expect(withDecision({ observedActionRejected: true })).toBe(false);
  });

  it("rejects any inverted restatement of the same boolean", () => {
    // Removing the field only helps if an equivalent cannot be added back under
    // a friendlier name. Each of these would encode a positive verdict the
    // observed-action judgment is incapable of producing.
    for (const field of [
      "observedActionAccepted",
      "observedActionApproved",
      "notRejected",
      "authorityAccepted",
      "correct",
      "wasCorrect",
      "isValid",
    ]) {
      expect(withDecision({ [field]: true }), field).toBe(false);
      expect(withDecision({ [field]: false }), field).toBe(false);
    }
  });

  it("leaves an UNKNOWN decision with no boolean a reader could invert", () => {
    // The only boolean-shaped information left on a decision is the enum-typed
    // outcome itself. There is nothing to read as "and it was fine".
    const decisionKeys = Object.keys(DECISION);

    expect(decisionKeys).not.toContain("observedActionRejected");
    for (const key of decisionKeys) {
      expect(typeof (DECISION as Record<string, unknown>)[key]).not.toBe("boolean");
    }
  });
});

describe("no performance or ranking concept can be declared", () => {
  /** Every key name the schema can produce, gathered from the Zod definitions. */
  function schemaKeys(schema: z.ZodType, into = new Set<string>(), depth = 0): Set<string> {
    if (depth > 12) return into;
    const def = schema as unknown as {
      def?: {
        type?: string;
        shape?: Record<string, z.ZodType>;
        options?: z.ZodType[];
        element?: z.ZodType;
        innerType?: z.ZodType;
      };
    };
    const inner = def.def;
    if (inner === undefined) return into;
    if (inner.shape !== undefined) {
      for (const [key, value] of Object.entries(inner.shape)) {
        into.add(key);
        schemaKeys(value, into, depth + 1);
      }
    }
    for (const option of inner.options ?? []) schemaKeys(option, into, depth + 1);
    if (inner.element !== undefined) schemaKeys(inner.element, into, depth + 1);
    if (inner.innerType !== undefined) schemaKeys(inner.innerType, into, depth + 1);
    return into;
  }

  const ALL_KEYS = [...schemaKeys(PublicAnalysisResultSchema)];

  /**
   * Capability keys are exempt, and only these.
   *
   * They DENY the concepts the ban exists to prevent — `scoresPerformance` is
   * pinned to `false` and is the opposite of a score. Pinning the exemption
   * list means a new capability key cannot inherit the exemption silently.
   */
  const CAPABILITY_KEYS = Object.keys(CAPABILITY).sort();
  const KEYS = ALL_KEYS.filter((key) => !CAPABILITY_KEYS.includes(key));

  it("walks a real set of schema keys", () => {
    // Guards the guard: an empty key set would make every assertion vacuous.
    expect(KEYS).toContain("eligibleDecisions");
    expect(KEYS).toContain("outcome");
    expect(KEYS).toContain("commitSha");
    expect(KEYS.length).toBeGreaterThan(30);
  });

  it("exempts exactly the known capability keys", () => {
    expect(CAPABILITY_KEYS).toEqual([
      "analysisKind",
      "matchMeaning",
      "partialCoverageIsExpected",
      "predictsArbitraryNextAction",
      "scoresPerformance",
      "unknownIsFirstClass",
      "verifiesObservedDecisionsOnly",
    ]);
  });

  it("declares no percentage, score or rating field", () => {
    // Deliberately NOT a blanket ban on the substring "rate" — an ordinary word
    // could contain it. These are the actual dangerous names.
    const banned = /percent|pct|accuracy|score|rating|parseQuality|grade|rank/i;
    for (const key of KEYS) {
      expect(`${key}:${banned.test(key) ? "banned" : "ok"}`).toBe(`${key}:ok`);
    }
  });

  it("declares no correctness-shaped field", () => {
    const banned = ["correct", "optimal", "ideal", "best", "recommended", "mistake"];
    for (const key of KEYS) {
      for (const word of banned) {
        expect(`${key}:${key.toLowerCase().includes(word) ? word : "ok"}`).toBe(`${key}:ok`);
      }
    }
  });

  it("declares no resolution ratio, even though the counts allow computing one", () => {
    // `match + rejected == eligibleDecisions` would mean every decision in a
    // narrow supported slice resolved — never that gameplay was fully examined.
    for (const key of KEYS) {
      expect(key).not.toBe("coveragePercent");
      expect(key).not.toBe("resolutionRate");
      expect(key).not.toBe("fullCoverage");
    }
  });
});
