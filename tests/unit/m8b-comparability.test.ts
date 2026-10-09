/**
 * The M8-B comparability domain: what it concludes, and what it refuses to.
 *
 * Most of these cases are about the refusals. The interesting failures in a
 * comparison model are never "it said COMPARABLE when it should have said
 * COMPARABLE_WITH_CAVEATS" — they are "it turned a missing field into a
 * difference", "it read equal partitions as the same patch", and "a descriptive
 * comparison quietly acquired an opinion about a player".
 */

import { describe, expect, it } from "vitest";

import { NORMALIZATION_REVISION } from "../../src/engine/normalization/combat-fight.js";

import type { CellAnalysisProvenance, CellCounts, PlayerFightResult } from "../../src/aggregation/cell.js";
import {
  ANALYSIS_PROVENANCE_FIELDS,
  assessAnalysisComparability,
} from "../../src/comparison/analysis-comparability.js";
import {
  COMPARISON_CAVEATS,
  deriveCaveats,
  orderCaveats,
  type ComparisonCaveat,
} from "../../src/comparison/caveats.js";
import { COMPARISON_EVIDENCE_CLASS } from "../../src/comparison/evidence-class.js";
import { comparePlayerPulls } from "../../src/comparison/player-pull-comparison.js";
import { assessPullComparability, HARD_DIMENSIONS } from "../../src/comparison/pull-comparability.js";
import {
  assessDifficultyCompatibility,
  assessEncounterCompatibility,
  pullOutcomeOf,
  TRASH_ENCOUNTER_ID,
  type PullContext,
  type PullIdentity,
} from "../../src/comparison/pull-identity.js";
import {
  assessVersionCompatibility,
  VERSION_FIELD_INTERPRETATIONS,
  VERSION_FIELDS,
  type PullVersionEvidence,
} from "../../src/comparison/version-evidence.js";

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function version(overrides: Partial<PullVersionEvidence> = {}): PullVersionEvidence {
  // The values M8-A actually measured on the live API.
  return { gameVersion: 1, logVersion: 17, partition: 1, ...overrides };
}

function identity(overrides: Partial<PullIdentity> = {}): PullIdentity {
  return {
    reportCode: "qJ1pgB49ZrRNVmCd",
    reportRevision: 30,
    fightId: 6,
    encounterId: 3420,
    difficulty: 4,
    version: version(),
    ...overrides,
  };
}

function pull(overrides: Partial<PullContext> = {}): PullContext {
  return {
    identity: identity(),
    outcome: "KILL",
    durationMs: 307_910,
    raidSize: 24,
    ...overrides,
  };
}

function counts(): CellCounts {
  return {
    eligibleDecisions: 43,
    match: 1,
    rejected: 0,
    unknown: 42,
    resolvedComparisons: 1,
    exactEntryMatches: 1,
    tokenConvergedMatches: 0,
    excludedCastCount: 561,
    selectionPrecision: [],
    unknownBases: [],
    unknownBlockerClasses: [],
    exclusions: [],
  };
}

function provenance(overrides: Partial<CellAnalysisProvenance> = {}): CellAnalysisProvenance {
  return {
    analyzerId: "assassination-observed",
    specId: "rogue/assassination",
    normalizationRevision: "m3.2",
    authorityId: "simc-assassination",
    authorityArtifactRevision: "r1",
    authorityCommitSha: "0123456789abcdef",
    ...overrides,
  };
}

function analyzedCell(
  options: {
    specName?: string | null;
    provenance?: Partial<CellAnalysisProvenance>;
  } = {},
): PlayerFightResult {
  return {
    kind: "ANALYZED",
    fightId: 6,
    playerKey: "qJ1pgB49ZrRNVmCd:5",
    sourceId: 5,
    specName: options.specName === undefined ? "Assassination" : options.specName,
    provenance: provenance(options.provenance ?? {}),
    counts: counts(),
    recurrence: { rejectedPatterns: [], evidenceLimitations: [], exclusionPatterns: [] },
  };
}

const ABSENT_CELL: PlayerFightResult = {
  kind: "ABSENT",
  fightId: 7,
  playerKey: "qJ1pgB49ZrRNVmCd:5",
  sourceId: 5,
};

const UNAVAILABLE_CELL: PlayerFightResult = {
  kind: "ANALYSIS_UNAVAILABLE",
  fightId: 7,
  playerKey: "qJ1pgB49ZrRNVmCd:5",
  sourceId: 5,
  specName: null,
  reason: "SPECIALIZATION_UNRESOLVED",
};

const NOT_ANALYZED_CELL: PlayerFightResult = {
  kind: "NOT_ANALYZED",
  fightId: 7,
  playerKey: "qJ1pgB49ZrRNVmCd:5",
  sourceId: 5,
  specName: "Frost",
  status: "SPEC_NOT_SUPPORTED",
  detail: "No analyzer is registered for this specialization.",
};

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
    Object.freeze(value);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Encounter identity
// ---------------------------------------------------------------------------

describe("encounter identity", () => {
  it("treats equal non-zero encounter ids as compatible", () => {
    const result = assessEncounterCompatibility(identity(), identity({ fightId: 9 }));
    expect(result).toEqual({ compatibility: "COMPATIBLE", reason: "ENCOUNTER_IDS_EQUAL" });
  });

  it("treats differing encounter ids as OBSERVED incompatibility", () => {
    const result = assessEncounterCompatibility(identity(), identity({ encounterId: 2900 }));
    expect(result).toEqual({ compatibility: "INCOMPATIBLE", reason: "ENCOUNTER_IDS_DIFFER" });
  });

  it("refuses to call two trash segments the same encounter", () => {
    // `0` is one value shared by every trash segment in every report, so
    // `0 === 0` establishes nothing. COMPATIBLE here would let arbitrary trash be
    // compared as though it were one boss.
    const trash = identity({ encounterId: TRASH_ENCOUNTER_ID });
    const result = assessEncounterCompatibility(trash, identity({ encounterId: TRASH_ENCOUNTER_ID }));
    expect(result).toEqual({ compatibility: "UNKNOWN", reason: "NOT_AN_ENCOUNTER" });
  });

  it("does not call trash versus a boss an incompatibility", () => {
    // It is not a difference between two encounters; one of them is not an
    // encounter at all. UNKNOWN is the honest answer and it fails closed.
    const result = assessEncounterCompatibility(identity({ encounterId: TRASH_ENCOUNTER_ID }), identity());
    expect(result.compatibility).toBe("UNKNOWN");
    expect(result.reason).toBe("NOT_AN_ENCOUNTER");
  });

  it("reports an unresolved encounter as UNKNOWN, never as a difference", () => {
    expect(assessEncounterCompatibility(identity({ encounterId: null }), identity())).toEqual({
      compatibility: "UNKNOWN",
      reason: "ENCOUNTER_UNRESOLVED",
    });
    expect(assessEncounterCompatibility(identity(), identity({ encounterId: null }))).toEqual({
      compatibility: "UNKNOWN",
      reason: "ENCOUNTER_UNRESOLVED",
    });
  });

  it("reports absence before trash when both apply", () => {
    const result = assessEncounterCompatibility(
      identity({ encounterId: null }),
      identity({ encounterId: TRASH_ENCOUNTER_ID }),
    );
    expect(result.reason).toBe("ENCOUNTER_UNRESOLVED");
  });

  it("never treats encounter id 0 as a falsy absence", () => {
    // A truthiness test would collapse "trash" into "unresolved". They are
    // different facts and produce different reasons.
    const trash = assessEncounterCompatibility(
      identity({ encounterId: TRASH_ENCOUNTER_ID }),
      identity({ encounterId: TRASH_ENCOUNTER_ID }),
    );
    const absent = assessEncounterCompatibility(
      identity({ encounterId: null }),
      identity({ encounterId: null }),
    );
    expect(trash.reason).not.toBe(absent.reason);
  });
});

// ---------------------------------------------------------------------------
// Difficulty
// ---------------------------------------------------------------------------

describe("difficulty", () => {
  it("treats equal known difficulties as compatible", () => {
    expect(assessDifficultyCompatibility(identity(), identity())).toEqual({
      compatibility: "COMPATIBLE",
      reason: "DIFFICULTY_EQUAL",
    });
  });

  it("treats different known difficulties as observed incompatibility", () => {
    expect(assessDifficultyCompatibility(identity(), identity({ difficulty: 5 }))).toEqual({
      compatibility: "INCOMPATIBLE",
      reason: "DIFFICULTY_DIFFERS",
    });
  });

  it.each([
    ["subject", identity({ difficulty: null }), identity()],
    ["reference", identity(), identity({ difficulty: null })],
    ["both", identity({ difficulty: null }), identity({ difficulty: null })],
  ])("reports an unresolved difficulty on the %s side as UNKNOWN", (_label, left, right) => {
    const result = assessDifficultyCompatibility(left, right);
    expect(result.compatibility).toBe("UNKNOWN");
    expect(result.reason).toBe("DIFFICULTY_UNRESOLVED");
  });
});

// ---------------------------------------------------------------------------
// Version evidence — the partition correction
// ---------------------------------------------------------------------------

describe("version evidence", () => {
  it("enables NO interpretation, in either direction, for any raw field", () => {
    // THE FREEZE TEST. Every one of the six flags is false, and this asserts all
    // six by enumeration rather than spot-checking, so a field added later is
    // covered automatically.
    //
    // Enabling one is a deliberate act: it requires editing the registry AND
    // editing this expectation in the same change, with the evidence in the diff.
    // The two directions are independent propositions and neither is proven —
    // in particular, observing that equal `gameVersion`/`logVersion` fails to
    // discriminate says nothing about what a DIFFERENCE means.
    for (const field of VERSION_FIELDS) {
      expect(
        VERSION_FIELD_INTERPRETATIONS[field].equalityEstablishesCompatibility,
        `${field} claims equality establishes compatibility`,
      ).toBe(false);
      expect(
        VERSION_FIELD_INTERPRETATIONS[field].differenceEstablishesIncompatibility,
        `${field} claims a difference establishes incompatibility`,
      ).toBe(false);
    }
    // And the registry covers exactly the declared fields — no quiet extra entry
    // carrying an enabled flag past the loop above.
    expect(Object.keys(VERSION_FIELD_INTERPRETATIONS).sort()).toEqual([...VERSION_FIELDS].sort());
  });

  it.each([...VERSION_FIELDS])(
    "returns UNKNOWN across reports when only %s differs, and still reports the difference",
    (field) => {
      // The correction, per field. A raw difference is FACTUAL EVIDENCE and is
      // preserved in `differingFields` — it simply cannot produce a verdict.
      const other = version({ [field]: 99 });
      const result = assessVersionCompatibility(
        identity({ reportCode: "AAAAAAAAAAAAAAAA" }),
        identity({ reportCode: "BBBBBBBBBBBBBBBB", version: other }),
      );
      expect(result.compatibility).toBe("UNKNOWN");
      expect(result.basis).toBe("FIELD_SEMANTICS_UNPROVEN");
      expect(result.differingFields).toEqual([field]);
    },
  );

  it("never returns INCOMPATIBLE for any cross-report combination", () => {
    // Exhaustive over every subset of the three fields differing, plus the
    // all-equal case. No combination of raw version evidence may currently
    // refuse a comparison.
    for (let mask = 0; mask < 8; mask += 1) {
      const other = version({
        ...((mask & 1) === 1 ? { gameVersion: 2 } : {}),
        ...((mask & 2) === 2 ? { logVersion: 18 } : {}),
        ...((mask & 4) === 4 ? { partition: 7 } : {}),
      });
      const result = assessVersionCompatibility(
        identity({ reportCode: "AAAAAAAAAAAAAAAA" }),
        identity({ reportCode: "BBBBBBBBBBBBBBBB", version: other }),
      );
      expect(result.compatibility, `mask ${mask}`).toBe("UNKNOWN");
      expect(result.basis, `mask ${mask}`).toBe("FIELD_SEMANTICS_UNPROVEN");
    }
  });

  it("does not claim the same patch when every version field is equal", () => {
    // Two different reports, identical gameVersion / logVersion / partition.
    // A model that read this as "same patch" would publish confident cross-patch
    // comparisons the evidence never supported.
    const result = assessVersionCompatibility(
      identity({ reportCode: "AAAAAAAAAAAAAAAA" }),
      identity({ reportCode: "BBBBBBBBBBBBBBBB" }),
    );
    expect(result.compatibility).toBe("UNKNOWN");
    expect(result.basis).toBe("FIELD_SEMANTICS_UNPROVEN");
    expect(result.differingFields).toEqual([]);
    expect(result.unresolvedFields).toEqual([]);
  });

  it("records a partition difference as evidence while concluding nothing from it", () => {
    const result = assessVersionCompatibility(
      identity({ reportCode: "AAAAAAAAAAAAAAAA", version: version({ partition: 1 }) }),
      identity({ reportCode: "BBBBBBBBBBBBBBBB", version: version({ partition: 2 }) }),
    );
    expect(result.differingFields).toEqual(["partition"]);
    expect(result.compatibility).toBe("UNKNOWN");
  });

  it("requires the report CODE to match, not merely the revision number", () => {
    // M8-A observed revisions 22, 10 and 29 on three unrelated external reports.
    // Revision alone identifies nothing.
    const result = assessVersionCompatibility(
      identity({ reportCode: "AAAAAAAAAAAAAAAA", reportRevision: 22 }),
      identity({ reportCode: "BBBBBBBBBBBBBBBB", reportRevision: 22 }),
    );
    expect(result.basis).not.toBe("SAME_REPORT_REVISION");
    expect(result.compatibility).toBe("UNKNOWN");
  });

  it("establishes compatibility from one export when the evidence is coherent", () => {
    const result = assessVersionCompatibility(identity({ fightId: 6 }), identity({ fightId: 22 }));
    expect(result.compatibility).toBe("COMPATIBLE");
    expect(result.basis).toBe("SAME_REPORT_REVISION");
    expect(result.differingFields).toEqual([]);
  });

  it.each([...VERSION_FIELDS])(
    "fails closed on same-export evidence that contradicts itself in %s",
    (field) => {
      // One export has one masterData. Two pulls claiming that export and
      // disagreeing about a version field do NOT establish two incompatible
      // gameplay worlds — they establish that the evidence cannot all be true.
      // We do not know which part is wrong, so the answer is UNKNOWN.
      const result = assessVersionCompatibility(identity(), identity({ version: version({ [field]: 99 }) }));
      expect(result.compatibility).toBe("UNKNOWN");
      expect(result.basis).toBe("EVIDENCE_CONTRADICTION");
      expect(result.differingFields).toEqual([field]);
    },
  );

  it("never returns INCOMPATIBLE from a contradiction, however many fields disagree", () => {
    const result = assessVersionCompatibility(
      identity(),
      identity({ version: version({ gameVersion: 2, logVersion: 18, partition: 7 }) }),
    );
    expect(result.compatibility).toBe("UNKNOWN");
    expect(result.basis).toBe("EVIDENCE_CONTRADICTION");
    expect(result.differingFields).toEqual([...VERSION_FIELDS]);
  });

  it("does not treat a field only one side supplied as a same-export contradiction", () => {
    // Absence is not disagreement. The provenance basis does not rest on the
    // fields, so an unheld one cannot undermine it.
    const result = assessVersionCompatibility(
      identity(),
      identity({ version: version({ partition: null }) }),
    );
    expect(result.compatibility).toBe("COMPATIBLE");
    expect(result.basis).toBe("SAME_REPORT_REVISION");
    expect(result.unresolvedFields).toEqual(["partition"]);
    expect(result.differingFields).toEqual([]);
  });

  it("reports unheld fields as unresolved rather than as differences", () => {
    const result = assessVersionCompatibility(
      identity({ reportCode: "AAAAAAAAAAAAAAAA", version: version({ partition: null }) }),
      identity({ reportCode: "BBBBBBBBBBBBBBBB", version: version({ gameVersion: null }) }),
    );
    expect(result.unresolvedFields).toEqual(["gameVersion", "partition"]);
    expect(result.differingFields).toEqual([]);
    expect(result.compatibility).toBe("UNKNOWN");
  });

  it("returns UNKNOWN when nothing at all is held", () => {
    const blank = version({ gameVersion: null, logVersion: null, partition: null });
    const result = assessVersionCompatibility(
      identity({ reportCode: "AAAAAAAAAAAAAAAA", version: blank }),
      identity({ reportCode: "BBBBBBBBBBBBBBBB", version: blank }),
    );
    expect(result.compatibility).toBe("UNKNOWN");
    expect(result.unresolvedFields).toEqual([...VERSION_FIELDS]);
  });

  it("orders both field arrays canonically regardless of which differs", () => {
    const result = assessVersionCompatibility(
      identity({
        reportCode: "AAAAAAAAAAAAAAAA",
        version: version({ partition: 1, gameVersion: null, logVersion: 17 }),
      }),
      identity({
        reportCode: "BBBBBBBBBBBBBBBB",
        version: version({ partition: 9, gameVersion: null, logVersion: 17 }),
      }),
    );
    const order = [...result.unresolvedFields, ...result.differingFields];
    const canonical = VERSION_FIELDS.filter((field) => order.includes(field));
    expect(result.unresolvedFields).toEqual(["gameVersion"]);
    expect(result.differingFields).toEqual(["partition"]);
    expect(canonical).toEqual(["gameVersion", "partition"]);
  });
});

// ---------------------------------------------------------------------------
// Caveats
// ---------------------------------------------------------------------------

describe("caveats", () => {
  it("emits nothing when two pulls differ in no contextual respect", () => {
    expect(deriveCaveats(pull(), pull())).toEqual([]);
  });

  it("treats a wipe against a kill as a caveat, never an incompatibility", () => {
    const subject = pull({ outcome: "KILL" });
    const reference = pull({ outcome: pullOutcomeOf(false) });
    expect(deriveCaveats(subject, reference)).toContain("DIFFERENT_ENCOUNTER_OUTCOME");
    expect(assessPullComparability(subject, reference).comparability).toBe("COMPARABLE_WITH_CAVEATS");
  });

  it("reports an unresolved outcome as its own fact", () => {
    const result = deriveCaveats(pull(), pull({ outcome: pullOutcomeOf(null) }));
    expect(result).toContain("ENCOUNTER_OUTCOME_UNRESOLVED");
    expect(result).not.toContain("DIFFERENT_ENCOUNTER_OUTCOME");
  });

  it("treats a flexible-raid size difference as a caveat, never an incompatibility", () => {
    // M8-A measured our pull at 24 against comparable top pulls at 25, 27 and 30
    // on the same encounter and difficulty. Rejecting on size would reject every
    // flexible-raid comparison in the game.
    const subject = pull({ raidSize: 24 });
    const reference = pull({ raidSize: 30 });
    expect(deriveCaveats(subject, reference)).toContain("DIFFERENT_RAID_SIZE");
    const assessment = assessPullComparability(subject, reference);
    expect(assessment.comparability).toBe("COMPARABLE_WITH_CAVEATS");
    expect(assessment.incompatibleDimensions).toEqual([]);
  });

  it("treats a duration difference as a caveat with no threshold", () => {
    const result = deriveCaveats(pull({ durationMs: 307_910 }), pull({ durationMs: 307_911 }));
    expect(result).toEqual(["DIFFERENT_FIGHT_DURATION"]);
  });

  it("reports an unheld duration or size as unresolved rather than equal", () => {
    const result = deriveCaveats(pull(), pull({ durationMs: null, raidSize: null }));
    expect(result).toEqual(["FIGHT_DURATION_UNRESOLVED", "RAID_SIZE_UNRESOLVED"]);
  });

  it("discloses a comparison drawn from another report", () => {
    const result = deriveCaveats(pull(), pull({ identity: identity({ reportCode: "BBBBBBBBBBBBBBBB" }) }));
    expect(result).toContain("EXTERNAL_REPORT");
  });

  it("orders caveats canonically no matter how many fire", () => {
    const subject = pull({ outcome: "KILL", durationMs: 100, raidSize: 24 });
    const reference = pull({
      identity: identity({ reportCode: "BBBBBBBBBBBBBBBB" }),
      outcome: "WIPE",
      durationMs: 200,
      raidSize: 30,
    });
    const result = deriveCaveats(subject, reference);
    expect(result).toEqual([
      "DIFFERENT_ENCOUNTER_OUTCOME",
      "DIFFERENT_FIGHT_DURATION",
      "DIFFERENT_RAID_SIZE",
      "EXTERNAL_REPORT",
    ]);
    // And that order is the canonical declaration order, not the detection order.
    const canonical = COMPARISON_CAVEATS.filter((caveat) => result.includes(caveat));
    expect(result).toEqual(canonical);
  });

  it("is symmetric in its arguments", () => {
    const a = pull({ outcome: "KILL", raidSize: 24 });
    const b = pull({ outcome: "WIPE", raidSize: 30 });
    expect(deriveCaveats(a, b)).toEqual(deriveCaveats(b, a));
  });

  it("orders and deduplicates an arbitrary caveat collection", () => {
    const scrambled: readonly ComparisonCaveat[] = [
      "EXTERNAL_REPORT",
      "DIFFERENT_RAID_SIZE",
      "EXTERNAL_REPORT",
      "DIFFERENT_ENCOUNTER_OUTCOME",
    ];
    expect(orderCaveats(scrambled)).toEqual([
      "DIFFERENT_ENCOUNTER_OUTCOME",
      "DIFFERENT_RAID_SIZE",
      "EXTERNAL_REPORT",
    ]);
  });
});

// ---------------------------------------------------------------------------
// Pull comparability
// ---------------------------------------------------------------------------

describe("pull comparability", () => {
  it("returns COMPARABLE only when nothing hard and nothing soft differs", () => {
    const assessment = assessPullComparability(pull(), pull());
    expect(assessment.comparability).toBe("COMPARABLE");
    expect(assessment.caveats).toEqual([]);
    expect(assessment.evidenceClass).toBe(COMPARISON_EVIDENCE_CLASS);
  });

  it("returns NOT_COMPARABLE for an observed hard incompatibility", () => {
    const assessment = assessPullComparability(pull(), pull({ identity: identity({ encounterId: 2900 }) }));
    expect(assessment.comparability).toBe("NOT_COMPARABLE");
    expect(assessment.incompatibleDimensions).toEqual(["encounter"]);
  });

  it("lets observed incompatibility outrank an unresolved dimension", () => {
    // Different bosses. A missing difficulty does not make that less true, and
    // reporting UNKNOWN would withhold a fact we hold.
    const assessment = assessPullComparability(
      pull(),
      pull({ identity: identity({ encounterId: 2900, difficulty: null }) }),
    );
    expect(assessment.comparability).toBe("NOT_COMPARABLE");
    expect(assessment.incompatibleDimensions).toEqual(["encounter"]);
    expect(assessment.unresolvedDimensions).toEqual(["difficulty"]);
  });

  it.each([
    ["encounter", identity({ encounterId: null })],
    ["difficulty", identity({ difficulty: null })],
  ])("returns UNKNOWN when %s cannot be resolved", (dimension, other) => {
    const assessment = assessPullComparability(pull(), pull({ identity: other }));
    expect(assessment.comparability).toBe("UNKNOWN");
    expect(assessment.unresolvedDimensions).toContain(dimension);
    expect(assessment.incompatibleDimensions).toEqual([]);
  });

  it("NEVER turns missing hard evidence into NOT_COMPARABLE", () => {
    // The central negative case. Every combination of absent hard evidence,
    // with no observed difference anywhere, must be UNKNOWN.
    const blank = version({ gameVersion: null, logVersion: null, partition: null });
    const absentCombinations: readonly PullIdentity[] = [
      identity({ encounterId: null }),
      identity({ difficulty: null }),
      identity({ encounterId: null, difficulty: null }),
      identity({ reportCode: "BBBBBBBBBBBBBBBB", version: blank }),
      identity({ reportCode: "BBBBBBBBBBBBBBBB", encounterId: null, difficulty: null, version: blank }),
    ];
    for (const other of absentCombinations) {
      const assessment = assessPullComparability(pull(), pull({ identity: other }));
      expect(assessment.comparability, JSON.stringify(other)).toBe("UNKNOWN");
      expect(assessment.incompatibleDimensions, JSON.stringify(other)).toEqual([]);
    }
  });

  it("leaves an external comparison UNKNOWN until partition semantics are proven", () => {
    // The honest consequence of the version correction: cross-report comparison
    // is fail-closed today. This will change when a later checkpoint proves the
    // semantics, and the change will be visible here.
    const assessment = assessPullComparability(
      pull(),
      pull({ identity: identity({ reportCode: "gtKb2xHn87pNcFfW", reportRevision: 22 }) }),
    );
    expect(assessment.comparability).toBe("UNKNOWN");
    expect(assessment.unresolvedDimensions).toEqual(["version"]);
    expect(assessment.caveats).toContain("EXTERNAL_REPORT");
  });

  it("orders both dimension lists canonically", () => {
    const assessment = assessPullComparability(
      pull(),
      pull({ identity: identity({ encounterId: null, difficulty: null, reportCode: "BBBBBBBBBBBBBBBB" }) }),
    );
    expect(assessment.unresolvedDimensions).toEqual([...HARD_DIMENSIONS]);
  });

  it("is symmetric in its arguments", () => {
    const a = pull();
    const b = pull({ identity: identity({ encounterId: 2900 }), outcome: "WIPE", raidSize: 30 });
    expect(assessPullComparability(a, b)).toEqual(assessPullComparability(b, a));
  });

  it("is deterministic across repeated calls", () => {
    const a = pull();
    const b = pull({ identity: identity({ reportCode: "BBBBBBBBBBBBBBBB" }), outcome: "WIPE" });
    expect(assessPullComparability(a, b)).toEqual(assessPullComparability(a, b));
  });

  it("exposes no numeric similarity anywhere in its result", () => {
    const serialized = JSON.stringify(
      assessPullComparability(pull(), pull({ identity: identity({ encounterId: 2900 }) })),
    );
    for (const banned of ["score", "percent", "similarity", "weight", "rank", "confidence"]) {
      expect(serialized.toLowerCase()).not.toContain(banned);
    }
  });
});

// ---------------------------------------------------------------------------
// Player analysis provenance
// ---------------------------------------------------------------------------

describe("player analysis comparability", () => {
  it("accepts two analyses from one analysis world", () => {
    const result = assessAnalysisComparability(analyzedCell(), analyzedCell());
    expect(result.comparability).toBe("COMPATIBLE");
    expect(result.reason).toBe("PROVENANCE_EQUAL");
    expect(result.differingFields).toEqual([]);
  });

  it.each([
    ["specName", analyzedCell({ specName: "Outlaw" }), "specName"],
    ["analyzerId", analyzedCell({ provenance: { analyzerId: "other-analyzer" } }), "analyzerId"],
    [
      "authorityArtifactRevision",
      analyzedCell({ provenance: { authorityArtifactRevision: "r2" } }),
      "authorityArtifactRevision",
    ],
    [
      "normalizationRevision",
      analyzedCell({ provenance: { normalizationRevision: "m3.3" } }),
      "normalizationRevision",
    ],
    ["specId", analyzedCell({ provenance: { specId: "paladin/protection" } }), "specId"],
    [
      "authorityCommitSha",
      analyzedCell({ provenance: { authorityCommitSha: "ffffffffffffffff" } }),
      "authorityCommitSha",
    ],
    ["authorityId", analyzedCell({ provenance: { authorityId: "simc-other" } }), "authorityId"],
  ])("refuses a comparison when %s differs", (_label, other, field) => {
    const result = assessAnalysisComparability(analyzedCell(), other);
    expect(result.comparability).toBe("NOT_COMPATIBLE");
    expect(result.reason).toBe("PROVENANCE_DIFFERS");
    expect(result.differingFields).toContain(field);
  });

  it("refuses a stored m3.2 result against a current-revision result on that field alone (M11-F bump)", () => {
    // The default provenance above is the HISTORICAL revision "m3.2", kept on
    // purpose: it is exactly what a result stored before the bump carries.
    const stored = analyzedCell({ provenance: { normalizationRevision: "m3.2" } });
    const current = analyzedCell({ provenance: { normalizationRevision: NORMALIZATION_REVISION } });
    expect(NORMALIZATION_REVISION).not.toBe("m3.2");
    const result = assessAnalysisComparability(stored, current);
    expect(result.comparability).toBe("NOT_COMPATIBLE");
    expect(result.reason).toBe("PROVENANCE_DIFFERS");
    expect(result.differingFields).toEqual(["normalizationRevision"]);
  });

  it("orders several differing fields canonically", () => {
    const other = analyzedCell({
      specName: "Outlaw",
      provenance: { analyzerId: "other-analyzer", normalizationRevision: "m3.3" },
    });
    const result = assessAnalysisComparability(analyzedCell(), other);
    expect(result.differingFields).toEqual(["analyzerId", "normalizationRevision", "specName"]);
    const canonical = ANALYSIS_PROVENANCE_FIELDS.filter((field) => result.differingFields.includes(field));
    expect(result.differingFields).toEqual(canonical);
  });

  it("returns UNKNOWN when a specialization was never resolved", () => {
    // M7 records `specName: null` when Warcraft Logs supplied nothing usable.
    // Absence cannot establish agreement and is not a difference either.
    const result = assessAnalysisComparability(analyzedCell(), analyzedCell({ specName: null }));
    expect(result.comparability).toBe("UNKNOWN");
    expect(result.reason).toBe("SPECIALIZATION_UNRESOLVED");
    expect(result.differingFields).toEqual([]);
  });

  it.each([
    ["an absent player", ABSENT_CELL, "PLAYER_ABSENT_FROM_PULL"],
    ["a cell where no analyzer ran", UNAVAILABLE_CELL, "NO_ANALYSIS_PERFORMED"],
    ["an unsupported specialization", NOT_ANALYZED_CELL, "GAMEPLAY_ANALYSIS_NOT_PRODUCED"],
  ])("reports %s as NOT_APPLICABLE rather than as a failure", (_label, other, reason) => {
    const result = assessAnalysisComparability(analyzedCell(), other);
    expect(result.comparability).toBe("NOT_APPLICABLE");
    expect(result.reason).toBe(reason);
    expect(result.differingFields).toEqual([]);
  });

  it("never lets an unsupported specialization read as zero or as worse", () => {
    // The whole result, serialized. There is no count, no zero and no verdict in
    // it — not by convention, but because the type has nowhere to put one.
    const result = assessAnalysisComparability(analyzedCell(), NOT_ANALYZED_CELL);
    const serialized = JSON.stringify(result);
    for (const banned of ["match", "rejected", "eligibleDecisions", "count", "0"]) {
      expect(serialized.toLowerCase()).not.toContain(banned.toLowerCase());
    }
  });

  it.each([
    ["ABSENT over ANALYSIS_UNAVAILABLE", ABSENT_CELL, UNAVAILABLE_CELL, "PLAYER_ABSENT_FROM_PULL"],
    ["ANALYSIS_UNAVAILABLE over NOT_ANALYZED", UNAVAILABLE_CELL, NOT_ANALYZED_CELL, "NO_ANALYSIS_PERFORMED"],
  ])("resolves %s in a fixed precedence", (_label, left, right, reason) => {
    expect(assessAnalysisComparability(left, right).reason).toBe(reason);
    // Symmetric: swapping the arguments cannot change the answer.
    expect(assessAnalysisComparability(right, left).reason).toBe(reason);
  });

  it("is symmetric for provenance differences too", () => {
    const other = analyzedCell({ provenance: { authorityArtifactRevision: "r2" } });
    expect(assessAnalysisComparability(analyzedCell(), other)).toEqual(
      assessAnalysisComparability(other, analyzedCell()),
    );
  });
});

// ---------------------------------------------------------------------------
// The two questions stay apart, and authority stays untouched
// ---------------------------------------------------------------------------

describe("player pull comparison", () => {
  it("keeps a valid pull comparison when the player was absent from one pull", () => {
    // The reason there is no merged verdict. The pulls are perfectly comparable;
    // the player-analysis question simply has no subject.
    const result = comparePlayerPulls({
      subjectPull: pull(),
      referencePull: pull({ identity: identity({ fightId: 7 }), durationMs: 307_910 }),
      subjectCell: analyzedCell(),
      referenceCell: ABSENT_CELL,
    });
    expect(result.pull.comparability).toBe("COMPARABLE");
    expect(result.analysis.comparability).toBe("NOT_APPLICABLE");
    expect(result.evidenceClass).toBe(COMPARISON_EVIDENCE_CLASS);
  });

  it("brands every result it returns as comparison context", () => {
    const result = comparePlayerPulls({
      subjectPull: pull(),
      referencePull: pull(),
      subjectCell: analyzedCell(),
      referenceCell: analyzedCell(),
    });
    expect(result.evidenceClass).toBe(COMPARISON_EVIDENCE_CLASS);
    expect(result.pull.evidenceClass).toBe(COMPARISON_EVIDENCE_CLASS);
    expect(result.analysis.evidenceClass).toBe(COMPARISON_EVIDENCE_CLASS);
    expect(result.pull.version.evidenceClass).toBe(COMPARISON_EVIDENCE_CLASS);
  });

  it("cannot mint an authority outcome anywhere in its output", () => {
    const serialized = JSON.stringify(
      comparePlayerPulls({
        subjectPull: pull(),
        referencePull: pull({ identity: identity({ reportCode: "gtKb2xHn87pNcFfW" }), outcome: "WIPE" }),
        subjectCell: analyzedCell(),
        referenceCell: analyzedCell({ provenance: { authorityArtifactRevision: "r2" } }),
      }),
    );
    expect(serialized).not.toContain("MATCH");
    expect(serialized).not.toContain("REJECTED");
  });

  it("leaves the authority-bearing input byte-identical", () => {
    // Frozen so a mutation throws rather than silently succeeding, and compared
    // by serialization so a replaced nested object would also be caught.
    const subjectCell = deepFreeze(analyzedCell());
    const referenceCell = deepFreeze(analyzedCell({ provenance: { authorityArtifactRevision: "r2" } }));
    const subjectPull = deepFreeze(pull());
    const referencePull = deepFreeze(pull({ identity: identity({ fightId: 7 }) }));

    const before = JSON.stringify([subjectCell, referenceCell, subjectPull, referencePull]);
    comparePlayerPulls({ subjectPull, referencePull, subjectCell, referenceCell });
    const after = JSON.stringify([subjectCell, referenceCell, subjectPull, referencePull]);

    expect(after).toBe(before);
  });

  it("carries no M7 count into its output", () => {
    // The comparison holds cells that DO have counts. None of them crosses.
    const serialized = JSON.stringify(
      comparePlayerPulls({
        subjectPull: pull(),
        referencePull: pull({ identity: identity({ fightId: 7 }) }),
        subjectCell: analyzedCell(),
        referenceCell: analyzedCell(),
      }),
    );
    for (const banned of [
      "eligibleDecisions",
      "resolvedComparisons",
      "excludedCastCount",
      "exactEntryMatches",
      "rejectedPatterns",
      "evidenceLimitations",
    ]) {
      expect(serialized, `leaked ${banned}`).not.toContain(banned);
    }
  });

  it("is deterministic across repeated calls on one snapshot", () => {
    const input = {
      subjectPull: pull(),
      referencePull: pull({ identity: identity({ reportCode: "BBBBBBBBBBBBBBBB" }), outcome: "WIPE" }),
      subjectCell: analyzedCell(),
      referenceCell: analyzedCell(),
    } as const;
    expect(JSON.stringify(comparePlayerPulls(input))).toBe(JSON.stringify(comparePlayerPulls(input)));
  });
});
