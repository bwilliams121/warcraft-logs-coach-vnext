/**
 * `encounter-context/1` is frozen, strict, and structurally unable to score.
 *
 * The cases below split into two kinds. Most assert that a real projected
 * document validates — including every external-reference status, because the
 * difference between "a discovery ran and qualified nothing" and "a retrieval
 * failed" is the distinction this section exists to preserve.
 *
 * The rest assert what the schema will NOT accept, and what no projected
 * document can contain: a rank, a parse metric, a score, a wall clock.
 */

import { describe, expect, it } from "vitest";

import {
  ENCOUNTER_CONTEXT_CAPABILITY,
  PUBLIC_ENCOUNTER_CONTEXT_SCHEMA_VERSION,
  PublicEncounterContextResultSchema,
} from "../../src/contracts/encounter-context-contract.js";
import { projectEncounterContextResult } from "../../src/contracts/encounter-context-projection.js";
import { PUBLIC_ANALYSIS_SCHEMA_VERSION } from "../../src/contracts/analysis-contract.js";
import { PUBLIC_RAID_NIGHT_SCHEMA_VERSION } from "../../src/contracts/raid-night-contract.js";
import { buildRaidNightProgression } from "../../src/progression/encounter-progression.js";
import type { EncounterContextAnalysis } from "../../src/services/encounter-context-service.js";
import {
  aggregateOf,
  absent,
  analyzedCell,
  rosterFightFor,
  rosterPlayerFor,
} from "../support/raid-night-fixture.js";
import { qualifiedReferenceFor, ENCOUNTER_ID, DIFFICULTY } from "../support/m8g-fixture.js";

function localAnalysis(
  external: EncounterContextAnalysis["external"],
  options: { readonly withTrash?: boolean; readonly withAbsence?: boolean } = {},
): EncounterContextAnalysis {
  const fightIds = options.withTrash === true ? [1, 2, 3] : [1, 2];
  const aggregate = aggregateOf({
    players: [rosterPlayerFor({ sourceId: 5 })],
    fights: fightIds.map((fightId) =>
      rosterFightFor({
        fightId,
        participants:
          options.withAbsence === true && fightId === 2 ? [] : [{ sourceId: 5, specName: "Assassination" }],
        encounterId: options.withTrash === true && fightId === 3 ? 0 : ENCOUNTER_ID,
        difficulty: DIFFICULTY,
        kill: fightId === 2,
        startTimeMs: fightId * 10_000,
        endTimeMs: fightId * 10_000 + 5_000 + fightId * 100,
      }),
    ),
    cells: fightIds.map((fightId) =>
      options.withAbsence === true && fightId === 2
        ? absent(fightId, 5)
        : analyzedCell({ fightId, sourceId: 5 }),
    ),
  });

  return {
    progression: buildRaidNightProgression({
      aggregate,
      encounterFacts: fightIds.map((fightId) => ({
        fightId,
        outcome: {
          lastPhase: 1,
          lastPhaseAsAbsoluteIndex: 4,
          lastPhaseIsIntermission: false,
          bossPercentageRaw: 0.04,
          fightPercentageRaw: 0.04,
          wipeCalledReportTimeMs: null,
        },
        zone: { id: 53, name: "The Venomous Abyss", frozen: false, expansion: { id: 7, name: "Midnight" } },
      })),
    }),
    external,
  };
}

function validate(analysis: EncounterContextAnalysis) {
  const document = projectEncounterContextResult(analysis);
  const parsed = PublicEncounterContextResultSchema.safeParse(document);
  if (!parsed.success) {
    throw new Error(`document rejected: ${JSON.stringify(parsed.error.issues.slice(0, 3))}`);
  }
  return document;
}

const NOT_REQUESTED = { kind: "SKIPPED", reason: "NOT_REQUESTED" } as const;

describe("the schema version is exact and independent", () => {
  it("pins encounter-context/1", () => {
    expect(PUBLIC_ENCOUNTER_CONTEXT_SCHEMA_VERSION).toBe("warcraft-logs-coach.encounter-context/1");
  });

  it("does not disturb the two existing frozen versions", () => {
    expect(PUBLIC_ANALYSIS_SCHEMA_VERSION).toBe("warcraft-logs-coach.analysis/1");
    expect(PUBLIC_RAID_NIGHT_SCHEMA_VERSION).toBe("warcraft-logs-coach.raid-night/1");
  });

  it("publishes a capability object describing THIS document", () => {
    const document = validate(localAnalysis(NOT_REQUESTED));
    expect(document.capability).toEqual(ENCOUNTER_CONTEXT_CAPABILITY);
    expect(document.capability.externalReferences).toContain("NEVER_GAMEPLAY_AUTHORITY");
    expect(document.capability.referencePool).toContain("NOT_A_REPRESENTATIVE_POPULATION");
    expect(document.capability.scoring).toBe("NO_SCORE_NO_RATING_NO_RANKING");
  });
});

describe("local-only documents validate", () => {
  it("validates a local result with external references not requested", () => {
    const document = validate(localAnalysis(NOT_REQUESTED));
    expect(document.externalReferences).toEqual({ status: "NOT_REQUESTED" });
    expect(document.encounters).toHaveLength(1);
    expect(document.encounters[0]?.pulls).toHaveLength(2);
  });

  it("carries the two phase integers apart and derives no direction", () => {
    const document = validate(localAnalysis(NOT_REQUESTED));
    const pull = document.encounters[0]?.pulls[0];
    expect(pull?.phaseSummary).toEqual({
      lastPhase: 1,
      lastPhaseAsAbsoluteIndex: 4,
      lastPhaseIsIntermission: false,
    });
    const change = document.encounters[0]?.pulls[1]?.changeFromPrevious;
    expect(Object.keys(change ?? {}).sort()).toEqual(
      [
        "durationChange",
        "durationDeltaMs",
        "fromDurationMs",
        "fromFightId",
        "fromOutcome",
        "toDurationMs",
        "toFightId",
        "toOutcome",
        "outcomeChange",
      ].sort(),
    );
  });

  it("publishes WIPE_TO_KILL as a factual transition", () => {
    const document = validate(localAnalysis(NOT_REQUESTED));
    expect(document.encounters[0]?.pulls[1]?.changeFromPrevious?.outcomeChange).toBe("WIPE_TO_KILL");
    expect(JSON.stringify(document).toLowerCase()).not.toContain("improved");
  });

  it("publishes an unresolved trash pull without calling it a failure", () => {
    const document = validate(localAnalysis(NOT_REQUESTED, { withTrash: true }));
    expect(document.unresolvedPulls).toHaveLength(1);
    expect(document.unresolvedPulls[0]?.encounterReason).toBe("NOT_AN_ENCOUNTER");
  });

  it("publishes an absence as a cell kind, never as zero counts", () => {
    const document = validate(localAnalysis(NOT_REQUESTED, { withAbsence: true }));
    const points = document.encounters[0]?.players[0]?.points ?? [];
    const absentPoint = points.find((point) => point.fightId === 2);
    expect(absentPoint?.cell.kind).toBe("ABSENT");
    expect(absentPoint?.cell).not.toHaveProperty("counts");
  });
});

describe("every external-reference status validates and stays distinct", () => {
  it.each([
    ["NOT_REQUESTED", { kind: "SKIPPED", reason: "NOT_REQUESTED" } as const],
    [
      "SUBJECT_PULL_NOT_IN_A_SEQUENCE",
      { kind: "SKIPPED", reason: "SUBJECT_PULL_NOT_IN_A_SEQUENCE" } as const,
    ],
  ])("validates a skipped discovery: %s", (status, external) => {
    const document = validate(localAnalysis(external));
    expect(document.externalReferences.status).toBe(status);
  });

  it.each([
    ["REQUEST_REJECTED", "RANKING_REQUEST_REJECTED"],
    ["PAYLOAD_UNRECOGNISED", "RANKING_PAYLOAD_UNRECOGNISED"],
    ["ENCOUNTER_NOT_FOUND", "ENCOUNTER_NOT_FOUND"],
  ])("validates a retrieval failure as %s", (status, reason) => {
    const document = validate(
      localAnalysis({
        kind: "ATTEMPTED",
        discovery: {
          outcome: "POOL_UNKNOWN",
          reason: reason as "RANKING_REQUEST_REJECTED",
          ...(reason === "RANKING_REQUEST_REJECTED" ? { message: "declined" } : {}),
          requestCount: 1,
        },
      }),
    );
    expect(document.externalReferences.status).toBe(status);
    // A failure carries no qualified array at all, so it cannot be read as
    // "a discovery ran and found nothing".
    expect(document.externalReferences).not.toHaveProperty("qualified");
  });

  it("validates a completed discovery with zero qualified references", () => {
    const document = validate(
      localAnalysis({
        kind: "ATTEMPTED",
        discovery: {
          outcome: "DISCOVERED",
          selection: {
            provenance: {
              source: "RANKINGS_DERIVED_REFERENCE_POOL",
              encounterId: ENCOUNTER_ID,
              difficulty: DIFFICULTY,
              className: "Rogue",
              specName: "Assassination",
              metric: "dps",
              partition: { kind: "EXPLICIT", partition: 1 },
              page: 1,
              reportedCount: 0,
              hasMorePages: false,
              rowsDecoded: 0,
              rowsEligible: 0,
            },
            selected: [],
            ineligible: [],
          },
          qualified: [],
          failures: [],
          requestCount: 1,
        },
      }),
    );
    // COMPLETED, not a failure, and emphatically not "no comparable logs".
    expect(document.externalReferences.status).toBe("COMPLETED");
    expect(JSON.stringify(document)).not.toContain("NO_COMPARABLE_LOGS");
  });

  it("validates a qualified reference whose comparability is UNKNOWN", () => {
    const document = validate(
      localAnalysis({
        kind: "ATTEMPTED",
        discovery: {
          outcome: "DISCOVERED",
          selection: {
            provenance: {
              source: "RANKINGS_DERIVED_REFERENCE_POOL",
              encounterId: ENCOUNTER_ID,
              difficulty: DIFFICULTY,
              className: "Rogue",
              specName: "Assassination",
              metric: "dps",
              partition: { kind: "WCL_DEFAULT_LATEST" },
              page: 1,
              reportedCount: 100,
              hasMorePages: true,
              rowsDecoded: 100,
              rowsEligible: 92,
            },
            selected: [],
            ineligible: [{ reportCode: "AAAA", fightId: 1, reason: "HIDDEN_CHARACTER" }],
          },
          qualified: [qualifiedReferenceFor()],
          failures: [{ outcome: "FAILED", reportCode: "BBBB", fightId: 9, reason: "SOURCE_AMBIGUOUS" }],
          requestCount: 6,
        },
      }),
    );

    const section = document.externalReferences;
    expect(section.status).toBe("COMPLETED");
    if (section.status !== "COMPLETED") return;

    const reference = section.qualified[0];
    // The two facts, separately.
    expect(reference?.qualification).toBe("QUALIFIED");
    expect(reference?.comparability.comparability).toBe("UNKNOWN");
    expect(reference?.comparability.unresolvedDimensions).toEqual(["version"]);
    expect(reference?.comparability.version.basis).toBe("FIELD_SEMANTICS_UNPROVEN");

    // Candidate-local failure survives alongside the qualified reference.
    expect(section.failures).toHaveLength(1);
    expect(section.ineligible).toHaveLength(1);

    // A LATEST partition is recorded as a mode, never as a number.
    expect(section.provenance.partition).toEqual({ mode: "LATEST" });
  });

  it("records a pinned partition as a number", () => {
    const document = validate(
      localAnalysis({
        kind: "ATTEMPTED",
        discovery: {
          outcome: "DISCOVERED",
          selection: {
            provenance: {
              source: "RANKINGS_DERIVED_REFERENCE_POOL",
              encounterId: ENCOUNTER_ID,
              difficulty: DIFFICULTY,
              className: "Rogue",
              specName: "Assassination",
              metric: "dps",
              partition: { kind: "EXPLICIT", partition: 3 },
              page: 1,
              reportedCount: 1,
              hasMorePages: false,
              rowsDecoded: 1,
              rowsEligible: 1,
            },
            selected: [],
            ineligible: [],
          },
          qualified: [],
          failures: [],
          requestCount: 2,
        },
      }),
    );
    const section = document.externalReferences;
    if (section.status !== "COMPLETED") throw new Error("expected COMPLETED");
    expect(section.provenance.partition).toEqual({ mode: "PINNED", partition: 3 });
  });
});

describe("the schema is strict and publishes no judgement", () => {
  it("rejects an unknown top-level field", () => {
    const document = validate(localAnalysis(NOT_REQUESTED));
    const parsed = PublicEncounterContextResultSchema.safeParse({ ...document, score: 42 });
    expect(parsed.success).toBe(false);
  });

  it("rejects an unknown field inside a pull", () => {
    const document = validate(localAnalysis(NOT_REQUESTED));
    const encounter = document.encounters[0];
    if (encounter === undefined) throw new Error("no encounter");
    const mutated = {
      ...document,
      encounters: [
        { ...encounter, pulls: [{ ...encounter.pulls[0], phaseProgress: 3 }, ...encounter.pulls.slice(1)] },
      ],
    };
    expect(PublicEncounterContextResultSchema.safeParse(mutated).success).toBe(false);
  });

  it("rejects a wrong schema version", () => {
    const document = validate(localAnalysis(NOT_REQUESTED));
    expect(
      PublicEncounterContextResultSchema.safeParse({
        ...document,
        schemaVersion: "warcraft-logs-coach.encounter-context/2",
      }).success,
    ).toBe(false);
  });

  it("contains no rank, parse or percentile field", () => {
    const document = validate(
      localAnalysis({
        kind: "ATTEMPTED",
        discovery: {
          outcome: "DISCOVERED",
          selection: {
            provenance: {
              source: "RANKINGS_DERIVED_REFERENCE_POOL",
              encounterId: ENCOUNTER_ID,
              difficulty: DIFFICULTY,
              className: "Rogue",
              specName: "Assassination",
              metric: "dps",
              partition: { kind: "EXPLICIT", partition: 1 },
              page: 1,
              reportedCount: 100,
              hasMorePages: true,
              rowsDecoded: 100,
              rowsEligible: 92,
            },
            selected: [],
            ineligible: [],
          },
          qualified: [qualifiedReferenceFor()],
          failures: [],
          requestCount: 6,
        },
      }),
    );
    const serialized = JSON.stringify(document).toLowerCase();
    for (const banned of [
      "rankpercent",
      "bracketpercent",
      "percentile",
      "parsescore",
      "amount",
      "position",
    ]) {
      expect(serialized, `document exposed ${banned}`).not.toContain(banned);
    }
  });

  it("contains no score, rating, accuracy or quality field", () => {
    // The DATA, excluding `capability`. That object legitimately says
    // "NO_SCORE_NO_RATING_NO_RANKING" — naming what the document refuses to
    // publish is the opposite of publishing it, and a scan that could not tell
    // the two apart would have to be weakened to stay quiet.
    const { capability, ...data } = validate(localAnalysis(NOT_REQUESTED));
    expect(capability.scoring).toBe("NO_SCORE_NO_RATING_NO_RANKING");

    const serialized = JSON.stringify(data).toLowerCase();
    for (const banned of ["score", "rating", "accuracy", "grade", "quality", "better", "worse", "optimal"]) {
      expect(serialized, `document exposed ${banned}`).not.toContain(banned);
    }
  });

  it("contains no raw percentage field", () => {
    // M8-C: scale unproven, direction counter-intuitive (0.04 on a KILL).
    const serialized = JSON.stringify(validate(localAnalysis(NOT_REQUESTED))).toLowerCase();
    expect(serialized).not.toContain("bosspercentage");
    expect(serialized).not.toContain("fightpercentage");
    expect(serialized).not.toContain("progresspercentage");
  });

  it("contains no wall clock or generated identifier", () => {
    const serialized = JSON.stringify(validate(localAnalysis(NOT_REQUESTED))).toLowerCase();
    for (const banned of ["retrievedat", "generatedat", "uuid", "requestid"]) {
      expect(serialized, `document exposed ${banned}`).not.toContain(banned);
    }
  });

  it("is deterministic for one analysis", () => {
    const analysis = localAnalysis(NOT_REQUESTED);
    expect(JSON.stringify(projectEncounterContextResult(analysis))).toBe(
      JSON.stringify(projectEncounterContextResult(analysis)),
    );
  });
});
