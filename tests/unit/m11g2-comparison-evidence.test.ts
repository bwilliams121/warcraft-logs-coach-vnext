import { describe, expect, it } from "vitest";

import { ownedPetSlice, serializeSlice } from "../../scripts/sanitize-probe.mjs";
import {
  G2_ACTORLESS_FAMILIES,
  G2_FAMILIES,
  planSegments,
  sanitizeG2Context,
  sanitizeG2Tables,
  windowBoundsOf,
} from "../../scripts/corpus/sanitize-g2-comparisons.mjs";
import {
  certifyComparisonCapture,
  decodeComparisonTables,
} from "../../src/wcl/comparison/comparison-tables.js";
import { committedEvidenceArchiveFiles } from "../support/corpus/evidence-archive.js";
import { bundleOf } from "../support/corpus/fight.js";
import {
  committedCorpusFiles,
  validateEvidenceArchive,
  type CorpusFileTable,
} from "../support/corpus/loader.js";
import {
  artifactJson,
  COMPARISONS,
  comparisonEvents,
  comparisonTables,
  committedG1Cohort,
  g2Archive,
  SUBJECT,
} from "../support/m11/g2-four-fights.js";

/**
 * M11-G2 committed comparison evidence: identity join (C), coverage refusal
 * (F), certification, deterministic sanitization (X) and privacy (Y).
 */

type Json = Record<string, unknown>;
const ARCHIVE = committedEvidenceArchiveFiles();
const G2_FILES = Object.entries(ARCHIVE).filter(([path]) => path.includes("/wcl-g2-"));

function manifest(): Json & { artifacts: Json[] } {
  return JSON.parse(ARCHIVE["manifest.json"] ?? "null") as Json & { artifacts: Json[] };
}
const withManifest = (value: unknown): CorpusFileTable => ({
  ...ARCHIVE,
  "manifest.json": JSON.stringify(value),
});
async function errorCodes(files: CorpusFileTable): Promise<string[]> {
  const result = await validateEvidenceArchive(files, committedCorpusFiles());
  return result.ok ? [] : [...new Set(result.errors.map((error) => error.code))].sort();
}

describe("C: the G2 evidence is the G1-selected cohort, under the one pseudonym scheme", () => {
  it("joins every G1 member to exactly one G2 fixture by report, fight and actor", async () => {
    const g1 = await committedG1Cohort();
    expect(g1.cohort.status).toBe("OK");
    expect(g1.cohort.members.map((member) => member.comparisonRef)).toEqual(
      COMPARISONS.map((fixture) => ({
        reportCode: fixture.reportCode,
        fightId: fixture.fightId,
        actorId: fixture.focusActorId,
      })),
    );
    for (const [index, fixture] of COMPARISONS.entries()) {
      const report = ((artifactJson(fixture.contextId) as Json)["reportData"] as Json)["report"] as Json;
      expect(report["code"]).toBe(fixture.reportCode);
      expect((report["fights"] as Json[]).map((fight) => fight["id"])).toEqual([fixture.fightId]);
      const actors = (report["masterData"] as Json)["actors"] as Json[];
      const focus = actors.find((actor) => actor["id"] === fixture.focusActorId);
      expect(focus?.["name"]).toBe(g1.cohort.members[index]?.liveIdentity.name);
    }
  });

  it("names every player exactly as the G1 candidate context does (no second scheme)", () => {
    for (const [index, fixture] of COMPARISONS.entries()) {
      const g1Actors = (
        (
          ((artifactJson(`wcl-g1-cohort-candidate-${String(index + 1)}`) as Json)["reportData"] as Json)[
            "report"
          ] as Json
        )["masterData"] as Json
      )["actors"] as Json[];
      const g2Actors = (
        (((artifactJson(fixture.contextId) as Json)["reportData"] as Json)["report"] as Json)[
          "masterData"
        ] as Json
      )["actors"] as Json[];
      const g2ById = new Map(g2Actors.map((actor) => [actor["id"], actor]));
      expect(g1Actors.length).toBeGreaterThan(10);
      for (const actor of g1Actors)
        expect(g2ById.get(actor["id"])?.["name"], String(actor["id"])).toBe(actor["name"]);
    }
  });
});

describe("F: a filtered capture holds no coverage, and the loader refuses one that claims any", () => {
  it("every G2 slice withholds its grants for a recorded reason", () => {
    const slices = manifest().artifacts.filter(
      (artifact) =>
        String(artifact["artifactId"]).includes("owned-pets") &&
        String(artifact["artifactId"]).startsWith("wcl-g2-"),
    );
    expect(slices).toHaveLength(25);
    for (const slice of slices) {
      const provenance = slice["provenance"] as Json;
      expect((provenance["retainedCoverage"] as Json)["grants"]).toEqual([]);
      expect(((provenance["actorSlice"] as Json)["grantsWithheld"] as Json)["reason"]).toMatch(
        /No category certified/,
      );
    }
  });

  it("refuses a grant on a filtered capture (FILTERED_CAPTURE_GRANTED)", async () => {
    const value = manifest();
    const target = value.artifacts.find(
      (artifact) => artifact["artifactId"] === COMPARISONS[0]?.segmentIds[0],
    ) as Json;
    const provenance = target["provenance"] as Json;
    (provenance["retainedCoverage"] as Json)["grants"] = [
      {
        categories: ["DAMAGE"],
        actorScope: [7, 15, 16, 92, 202],
        ranges: [{ fromReportTimeMs: 6427765, toReportTimeMs: 6473765 }],
      },
    ];
    const codes = await errorCodes(withManifest(value));
    expect(codes).toContain("FILTERED_CAPTURE_GRANTED");
    expect(codes).toContain("ACTOR_SLICE_INVALID");
  });

  it("refuses an owned-pet slice that neither grants nor records why", async () => {
    const value = manifest();
    const target = value.artifacts.find(
      (artifact) => artifact["artifactId"] === COMPARISONS[1]?.segmentIds[0],
    ) as Json;
    delete ((target["provenance"] as Json)["actorSlice"] as Json)["grantsWithheld"];
    expect(await errorCodes(withManifest(value))).toContain("ACTOR_SLICE_INVALID");
  });

  it("the composed comparison fight holds every capture category ABSENT, HEALING and ABSORBS included; the subject's DAMAGE is COMPLETE", async () => {
    const archive = await g2Archive();
    for (const fixture of COMPARISONS) {
      const fight = bundleOf(archive, fixture.segmentIds, [], { catalogArtifactId: fixture.contextId }).fight;
      for (const category of [
        "CASTS",
        "AURAS",
        "RESOURCES",
        "DAMAGE",
        "SUMMONS",
        "COMBATANT_INFO",
        "GEAR",
        "HEALING",
        "ABSORBS",
      ] as const) {
        const evidence = fight.completeness.categories[category];
        expect(
          evidence.capability === "OBSERVABLE" ? evidence.coverage.state : "NOT_OBSERVABLE",
          `${fixture.fightRef} ${category}`,
        ).not.toBe("COMPLETE");
      }
      expect(fight.completeness.categories.ACTORS).toMatchObject({ capability: "OBSERVABLE" });
    }
    const subject = bundleOf(archive, SUBJECT.segmentIds, [], { catalogArtifactId: SUBJECT.contextId }).fight;
    const damage = subject.completeness.categories.DAMAGE;
    expect(damage.capability === "OBSERVABLE" ? damage.coverage.state : null).toBe("COMPLETE");
    const healing = subject.completeness.categories.HEALING;
    expect(healing.capability === "OBSERVABLE" ? healing.coverage.state : null).not.toBe("COMPLETE");
  });
});

describe("certification: what the tables can and cannot certify (owner decision: only CERTIFIED is grantable)", () => {
  const results = COMPARISONS.map((fixture) => ({
    fixture,
    certification: certifyComparisonCapture(comparisonEvents(fixture), comparisonTables(fixture), [
      fixture.focusActorId,
      ...fixture.ownedActorIds,
    ]),
  }));

  it("certifies no category in any comparison fight, so nothing is granted", () => {
    for (const { certification } of results) {
      expect(certification.grantable).toEqual([]);
      expect(certification.categories.find((entry) => entry.category === "DAMAGE")?.status).toBe(
        "NOT_CERTIFIED",
      );
      for (const category of ["CASTS", "AURAS", "RESOURCES", "SUMMONS", "COMBATANT_INFO", "GEAR"]) {
        expect(certification.categories.find((entry) => entry.category === category)?.status).toBe(
          "UNAVAILABLE",
        );
      }
    }
  });

  it("every owned pet's sourced damage matches its own table exactly, in all three fights", () => {
    for (const { fixture, certification } of results) {
      for (const pet of fixture.ownedActorIds) {
        expect(
          certification.certificates.find(
            (entry) => entry.check === "DAMAGE_SOURCED_BY" && entry.actorId === pet,
          )?.status,
        ).toBe("MATCH");
      }
    }
  });

  it("pins each disagreement: events the tables omit, never tables holding events the stream lacks", () => {
    const focus = (index: number, check: "DAMAGE_SOURCED_BY" | "DAMAGE_TARGETING") =>
      results[index]?.certification.certificates.find(
        (entry) => entry.check === check && entry.actorId === results[index]?.fixture.focusActorId,
      );
    expect(focus(0, "DAMAGE_SOURCED_BY")?.status).toBe("MATCH");
    expect(focus(1, "DAMAGE_SOURCED_BY")?.differences).toEqual([
      { abilityGameId: 1287955, eventCount: 95, tableCount: 0 },
    ]);
    expect(focus(2, "DAMAGE_SOURCED_BY")?.differences).toEqual([
      { abilityGameId: 404908, eventCount: 10, tableCount: 0 },
      { abilityGameId: 410265, eventCount: 3, tableCount: 0 },
    ]);
    for (const index of [0, 1, 2]) {
      expect(focus(index, "DAMAGE_TARGETING")?.differences.map((entry) => entry.abilityGameId)).toEqual([
        98021,
      ]);
    }
    for (const { certification } of results) {
      for (const entry of certification.certificates) {
        for (const difference of entry.differences)
          expect(difference.eventCount).toBeGreaterThan(difference.tableCount);
      }
    }
  });

  it("would certify DAMAGE when every damage certificate matches (the rule is not hard-wired to refuse)", () => {
    const fixture = COMPARISONS[0];
    if (fixture === undefined) throw new Error("no fixture");
    // Rune Weapon 15 and the zero-activity 92 match their tables in both directions.
    const certification = certifyComparisonCapture(
      comparisonEvents(fixture),
      comparisonTables(fixture),
      [15, 92],
    );
    expect(certification.categories.find((entry) => entry.category === "DAMAGE")?.status).toBe("CERTIFIED");
    expect(certification.grantable).toEqual(["DAMAGE"]);
  });

  it("decodes fail-closed: a broken table, or a window table without recorded bounds, is refused", () => {
    const fixture = COMPARISONS[0];
    if (fixture === undefined) throw new Error("no fixture");
    const broken = JSON.parse(JSON.stringify(artifactJson(fixture.tablesId))) as Json;
    const report = (broken["reportData"] as Json)["report"] as Json;
    ((report["damageDone_7"] as Json)["data"] as Json)["entries"] = [{ guid: "x" }];
    expect(decodeComparisonTables(broken)).toEqual({ ok: false, defect: "TABLE_UNUSABLE:damageDone_7" });
    const unbounded = JSON.parse(JSON.stringify(artifactJson(fixture.tablesId))) as Json;
    ((unbounded["reportData"] as Json)["report"] as Json)["windowBounds"] = [];
    expect(decodeComparisonTables(unbounded)).toMatchObject({
      ok: false,
      defect: expect.stringMatching(/^WINDOW_BOUNDS_MISSING/),
    });
  });
});

describe("X: deterministic sanitization", () => {
  it("re-cuts every committed segment byte-for-byte from the committed events (same predicate, same plan)", () => {
    for (const fixture of COMPARISONS) {
      const events = comparisonEvents(fixture);
      const scope = [fixture.focusActorId, ...fixture.ownedActorIds];
      const retained = ownedPetSlice(events, scope, {
        families: G2_FAMILIES,
        actorlessFamilies: G2_ACTORLESS_FAMILIES,
      }) as Record<string, unknown>[];
      expect(retained).toHaveLength(events.length);
      const fight = (((artifactJson(fixture.contextId) as Json)["reportData"] as Json)["report"] as Json)[
        "fights"
      ] as Json[];
      const plan = planSegments(retained, fight[0]?.["startTime"] as number, fight[0]?.["endTime"] as number);
      expect(plan).toHaveLength(fixture.segmentIds.length);
      plan.forEach((segment, index) => {
        const bytes = serializeSlice(
          retained.filter(
            (event) =>
              (event["timestamp"] as number) > segment.from && (event["timestamp"] as number) <= segment.to,
          ),
          true,
        );
        expect(bytes, fixture.segmentIds[index]).toBe(
          ARCHIVE[`artifacts/wcl-events/${fixture.segmentIds[index] ?? ""}.json`],
        );
      });
    }
  });

  it("the context and table sanitizers are pure: the same input gives the same bytes, pseudonyms applied", () => {
    const raw = {
      rateLimitData: { pointsSpentThisHour: 1 },
      reportData: {
        report: {
          code: "REALCODEAAAAAAAA",
          masterData: {
            actors: [
              { id: 1, name: "Realname", server: "Realm", type: "Player", gameID: 123456, petOwner: null },
              { id: 2, name: "Fluffy", server: null, type: "Pet", gameID: 27893, petOwner: 1 },
            ],
          },
          fights: [],
        },
      },
    };
    const run = () =>
      JSON.stringify(
        sanitizeG2Context(
          raw,
          () => "COHORT999AAAAAAA",
          () => "Player9999",
        ),
      );
    expect(run()).toBe(run());
    expect(JSON.parse(run())).toEqual({
      reportData: {
        report: {
          code: "COHORT999AAAAAAA",
          masterData: {
            actors: [
              { id: 1, name: "Player9999", server: null, type: "Player", gameID: null, petOwner: null },
              { id: 2, name: "Actor2", server: null, type: "Pet", gameID: 27893, petOwner: 1 },
            ],
          },
          fights: [],
        },
      },
    });
    const query =
      "window0_7: table(dataType: DamageDone, fightIDs: $fightIDs, startTime: 10, endTime: 20, sourceID: 7)\nwindow0_15: table(dataType: DamageDone, fightIDs: $fightIDs, startTime: 10, endTime: 20, sourceID: 15)";
    expect(windowBoundsOf(query)).toEqual([{ window: "window0", fromMs: 10, toMs: 20 }]);
    const tables = {
      reportData: {
        report: {
          code: "REALCODEAAAAAAAA",
          revision: 3,
          deaths: { data: { entries: [{ id: 1, name: "Realname", type: "DeathKnight", timestamp: 15 }] } },
        },
      },
    };
    expect(sanitizeG2Tables(tables, () => "COHORT999AAAAAAA", query)).toEqual({
      reportData: {
        report: {
          code: "COHORT999AAAAAAA",
          revision: 3,
          windowBounds: [{ window: "window0", fromMs: 10, toMs: 20 }],
          deaths: { data: { entries: [{ id: 1, type: "DeathKnight", timestamp: 15 }] } },
        },
      },
    });
  });
});

describe("Y: no live third-party identity in a committed G2 file", () => {
  it("holds 32 files", () => {
    expect(G2_FILES).toHaveLength(32);
  });

  const visit = (value: unknown, onEntry: (key: string, value: unknown, parent: Json) => void): void => {
    if (Array.isArray(value)) for (const item of value) visit(item, onEntry);
    else if (value !== null && typeof value === "object") {
      for (const [key, inner] of Object.entries(value)) {
        onEntry(key, inner, value as Json);
        visit(inner, onEntry);
      }
    }
  };

  it("every name is a pseudonym, every server null, every player gameID null, every code a G1 pseudonym", () => {
    for (const [path, text] of G2_FILES) {
      visit(JSON.parse(text), (key, value, parent) => {
        if (key === "server") expect(value, path).toBeNull();
        if (key === "code") expect(value, path).toMatch(/^COHORT\d{3}A{7}$/);
        if (key === "name" && "petOwner" in parent) expect(value, path).toMatch(/^(Player\d{4}|Actor-?\d+)$/);
        if (key === "gameID" && parent["type"] === "Player") expect(value, path).toBeNull();
      });
      expect(text.toLowerCase(), path).not.toMatch(
        /client_secret|access_token|authorization|bearer |eyj[a-z0-9_-]{10,}/,
      );
      expect(text, path).not.toMatch(/"(guild\w*|actorName|actorIcon)":/);
      // The pseudonymized surfaces drop every per-entry guid and icon; events
      // stay verbatim (combatantinfo gear icons are game asset names, as in E2).
      // (In the tables `guid` is WCL's name for the ABILITY game id, and stays.)
      if (path.includes("/wcl-graphql/")) expect(text, path).not.toMatch(/"icon":/);
      if (path.includes("/wcl-graphql/") && !path.includes("-tables-"))
        expect(text, path).not.toMatch(/"guid":/);
    }
  });
});
