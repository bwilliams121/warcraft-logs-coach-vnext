import { describe, expect, it } from "vitest";

import {
  actorSlice,
  decisionSlice,
  extractEvents,
  parseFamilySelection,
  SANITIZER_REVISION,
} from "../../scripts/sanitize-probe.mjs";
import {
  SANITIZE_PAYLOADS_REVISION,
  sanitizeContext,
  sanitizePages,
  sanitizeRankings,
} from "../../scripts/corpus/sanitize-payloads.mjs";
import { G1_SANITIZER_REVISION } from "../../scripts/corpus/sanitize-g1-cohort.mjs";
import { G2_SANITIZER_REVISION } from "../../scripts/corpus/sanitize-g2-comparisons.mjs";
import { committedEventArray, committedManifest } from "../support/corpus/artifacts.js";
import { committedCorpusFiles, loadCorpusOrThrow } from "../support/corpus/loader.js";
import { committedEvidenceArchiveFiles } from "../support/corpus/evidence-archive.js";

/**
 * The payload sanitizer's rules, and the proof that what it forbids cannot be
 * in a committed artifact. Names, servers and guilds were never allowed; the
 * M9-C correction added the rule that a PLAYER's `gameID` — a stable character
 * identifier — is nulled, while NPC and pet `gameID`s (creature taxonomy the
 * cases pin) are kept.
 */

const rawContext = {
  rateLimitData: { limitPerHour: 1, pointsSpentThisHour: 1, pointsResetIn: 1 },
  reportData: {
    report: {
      code: "aBcDeFgH12345678",
      masterData: {
        actors: [
          {
            id: 1,
            gameID: 173467780,
            name: "Someplayer",
            server: "Somerealm",
            type: "Player",
            subType: "Rogue",
          },
          {
            id: 2,
            gameID: 75718250,
            name: "Somepet",
            server: null,
            type: "Pet",
            subType: "Pet",
            petOwner: 1,
          },
          { id: 3, gameID: 257347, name: "Sszorak", type: "NPC", subType: "Boss" },
          { id: -1, gameID: 0, name: "Environment", type: "NPC", subType: "Boss" },
        ],
      },
      fights: [{ id: 7 }],
    },
  },
};

describe("context mode", () => {
  it("nulls every player's gameID and keeps NPC and pet gameIDs", () => {
    const out = sanitizeContext(rawContext) as typeof rawContext;
    const actors = out.reportData.report.masterData.actors;
    expect(actors.map((a) => [a.id, a.gameID])).toEqual([
      [1, null],
      [2, 75718250],
      [3, 257347],
      [-1, 0],
    ]);
  });

  it("redacts every name to Actor<id>, nulls every server, keeps ids and petOwner links, drops rateLimitData", () => {
    const out = sanitizeContext(rawContext) as Record<string, unknown>;
    const actors = (out["reportData"] as typeof rawContext.reportData).report.masterData.actors;
    expect(actors.map((a) => a.name)).toEqual(["Actor1", "Actor2", "Actor3", "Actor-1"]);
    expect(actors.every((a) => a.server === null)).toBe(true);
    expect(actors[1]?.petOwner).toBe(1);
    expect("rateLimitData" in out).toBe(false);
    expect((out["reportData"] as typeof rawContext.reportData).report.fights).toEqual([{ id: 7 }]);
  });

  it("is idempotent: sanitizing a sanitized context changes nothing", () => {
    const once = sanitizeContext(rawContext);
    expect(sanitizeContext(once)).toEqual(once);
  });
});

describe("rankings mode", () => {
  const probe = {
    k: {
      rateLimitData: {},
      worldData: {
        encounter: {
          id: 3420,
          characterRankings: {
            page: 1,
            hasMorePages: true,
            count: 3,
            rankings: [
              {
                name: "A",
                server: { name: "R", region: "EU" },
                guild: { name: "G" },
                report: { code: "realCode00000001", fightID: 1 },
              },
              {
                name: "B",
                server: { name: "R", region: "EU" },
                report: { code: "realCode00000002", fightID: 2 },
              },
              { name: "C", hidden: true, report: { code: "realCode00000001", fightID: 5 } },
            ],
          },
        },
      },
    },
  };

  it("remaps report codes deterministically, preserving equality, and removes names, servers and guilds", () => {
    const out = sanitizeRankings(probe, "k") as {
      worldData: { encounter: { characterRankings: { rankings: Record<string, unknown>[] } } };
    };
    const rows = out.worldData.encounter.characterRankings.rankings;
    expect(rows.map((r) => (r["report"] as { code: string }).code)).toEqual([
      "RANK0001AAAAAAAA",
      "RANK0002AAAAAAAA",
      "RANK0001AAAAAAAA",
    ]);
    expect(rows.map((r) => r["name"])).toEqual(["Candidate1", "Candidate2", "Candidate3"]);
    expect(rows.every((r) => r["server"] === null && !("guild" in r))).toBe(true);
    expect(rows[2]?.["hidden"]).toBe(true);
  });
});

describe("pages mode", () => {
  it("strips rateLimitData and nothing else", () => {
    const page = {
      rateLimitData: {},
      reportData: { report: { events: { data: [{ timestamp: 1 }], nextPageTimestamp: 2 } } },
    };
    expect(sanitizePages([page])).toEqual([{ reportData: page.reportData }]);
  });
});

describe("the event slicer's --decision-slice predicate", () => {
  const events = [
    { timestamp: 1, type: "combatantinfo", sourceID: 25 },
    { timestamp: 2, type: "cast", sourceID: 25, targetID: 235, abilityGameID: 703 },
    { timestamp: 2, type: "applydebuff", sourceID: 25, targetID: 235, abilityGameID: 703 },
    { timestamp: 3, type: "cast", sourceID: 8, targetID: 235, abilityGameID: 703 },
    { timestamp: 4, type: "applybuff", sourceID: 9, targetID: 25, abilityGameID: 1 },
    { timestamp: 5, type: "applybuff", sourceID: 9, targetID: 9, abilityGameID: 1 },
    { timestamp: 6, type: "damage", sourceID: 25, targetID: 235, abilityGameID: 703 },
    { timestamp: 7, type: "combatantinfo", sourceID: 8 },
  ];

  it("keeps the subject's casts and combatantinfo and every aura on the subject or a target, in order", () => {
    expect(decisionSlice(events, 25, [235]).map((e) => (e as { timestamp: number }).timestamp)).toEqual([
      1, 2, 2, 4,
    ]);
  });

  it("--actor-slice keeps every event the subject sources OR is targeted by, in order, and nothing else", () => {
    // Damage TO the subject, heals to and from it, its own resource changes,
    // and auras it applies elsewhere all survive; a third party's events do not.
    const tankEvents = [
      { timestamp: 1, type: "combatantinfo", sourceID: 7 },
      { timestamp: 2, type: "cast", sourceID: 7, targetID: 21, abilityGameID: 53600 },
      { timestamp: 2, type: "applydebuff", sourceID: 7, targetID: 21, abilityGameID: 204301 },
      { timestamp: 3, type: "damage", sourceID: 21, targetID: 7, abilityGameID: 1 },
      { timestamp: 4, type: "heal", sourceID: 2, targetID: 7, abilityGameID: 77489 },
      { timestamp: 5, type: "resourcechange", sourceID: 7, targetID: 7, abilityGameID: 204019 },
      { timestamp: 6, type: "damage", sourceID: 21, targetID: 12, abilityGameID: 1 },
      { timestamp: 7, type: "cast", sourceID: 12, targetID: 21, abilityGameID: 1 },
      { timestamp: 8, type: "heal", sourceID: 7, targetID: 7, abilityGameID: 1 },
      { timestamp: 9, type: "absorbed", sourceID: 21, targetID: 7, abilityGameID: 1 },
    ];
    expect(actorSlice(tankEvents, 7).map((e) => (e as { timestamp: number }).timestamp)).toEqual([
      1, 2, 2, 3, 4, 5, 8, 9,
    ]);
  });

  it("--actor-slice honours an inclusive timestamp bound and never reorders", () => {
    const tankEvents = [
      { timestamp: 5, type: "cast", sourceID: 7, targetID: 21 },
      { timestamp: 3, type: "damage", sourceID: 21, targetID: 7 },
      { timestamp: 9, type: "heal", sourceID: 7, targetID: 7 },
      { timestamp: 9, type: "damage", sourceID: 21, targetID: 7 },
      { timestamp: 10, type: "damage", sourceID: 21, targetID: 7 },
    ];
    expect(actorSlice(tankEvents, 7, 9).map((e) => (e as { timestamp: number }).timestamp)).toEqual([
      5, 3, 9, 9,
    ]);
    expect(actorSlice(tankEvents, 7, null)).toHaveLength(5);
  });

  it("--actor-slice --families keeps only the listed raw types, whole, in order, under the same bound (M10-C5)", () => {
    const tankEvents = [
      { timestamp: 1, type: "combatantinfo", sourceID: 7 },
      { timestamp: 2, type: "cast", sourceID: 7, targetID: 21 },
      { timestamp: 3, type: "damage", sourceID: 21, targetID: 7 },
      { timestamp: 4, type: "applybuff", sourceID: 7, targetID: 7 },
      { timestamp: 5, type: "heal", sourceID: 7, targetID: 7 },
      { timestamp: 6, type: "resourcechange", sourceID: 7, targetID: 7 },
      { timestamp: 7, type: "cast", sourceID: 7, targetID: 21 },
      { timestamp: 8, type: "cast", sourceID: 9, targetID: 21 },
    ];
    const families = ["cast", "resourcechange", "applybuff", "combatantinfo"];
    expect(
      actorSlice(tankEvents, 7, null, families).map((e) => (e as { timestamp: number }).timestamp),
    ).toEqual([1, 2, 4, 6, 7]);
    expect(actorSlice(tankEvents, 7, 6, families).map((e) => (e as { timestamp: number }).timestamp)).toEqual(
      [1, 2, 4, 6],
    );
    // No list means no filter: the M10-B behaviour is unchanged.
    expect(actorSlice(tankEvents, 7, null, null)).toHaveLength(7);
    expect(actorSlice(tankEvents, 7)).toHaveLength(7);
  });

  it("--families refuses rather than trims: empty, duplicated or malformed entries are errors", () => {
    expect(parseFamilySelection("cast,applybuff")).toEqual({ ok: true, families: ["cast", "applybuff"] });
    for (const spec of ["", "cast,,applybuff", "cast,cast", "cast,Apply-Buff", undefined]) {
      const result = parseFamilySelection(spec);
      expect(result.ok, String(spec)).toBe(false);
      if (!result.ok) expect(result.error).toContain("--families");
    }
  });

  it("the committed 45-second slice is exactly the family filter's output over the actor: thirteen raw types and nothing else", () => {
    const retained = new Set([
      "cast",
      "resourcechange",
      "applybuff",
      "refreshbuff",
      "removebuff",
      "applybuffstack",
      "removebuffstack",
      "applydebuff",
      "refreshdebuff",
      "removedebuff",
      "applydebuffstack",
      "removedebuffstack",
      "combatantinfo",
    ]);
    const events = committedEventArray("wcl-protection-paladin-a7r6-rotational-45s") as {
      type: string;
      sourceID?: number;
      targetID?: number;
      timestamp: number;
    }[];
    expect(events).toHaveLength(1093);
    for (const event of events) {
      expect(retained.has(event.type), event.type).toBe(true);
      expect(event.sourceID === 7 || event.targetID === 7).toBe(true);
      expect(event.timestamp).toBeLessThanOrEqual(2049581);
    }
    expect(new Set(events.map((event) => event.type)).size).toBe(13);
  });

  it("concatenates an array of page envelopes in page order", () => {
    const pages = [
      {
        reportData: {
          report: { events: { data: [{ timestamp: 1 }, { timestamp: 2 }], nextPageTimestamp: 2 } },
        },
      },
      {
        reportData: {
          report: { events: { data: [{ timestamp: 2 }, { timestamp: 3 }], nextPageTimestamp: null } },
        },
      },
    ];
    expect(extractEvents(pages)).toEqual([
      { timestamp: 1 },
      { timestamp: 2 },
      { timestamp: 2 },
      { timestamp: 3 },
    ]);
    // A bare array is still a bare array.
    expect(extractEvents([{ timestamp: 9 }])).toEqual([{ timestamp: 9 }]);
  });
});

describe("the committed corpus holds no stable player identifier", () => {
  it("has a null gameID on every player in every fight-context artifact, and no server anywhere", async () => {
    const corpus = await loadCorpusOrThrow(committedCorpusFiles());
    let contexts = 0;
    for (const artifact of corpus.artifacts) {
      const source = artifact.record.provenance.source;
      if (source === null || !("kind" in source.query) || source.query.kind !== "FIGHT_CONTEXT") continue;
      contexts += 1;
      const actors = (artifact.json as typeof rawContext).reportData.report.masterData.actors;
      expect(actors.length, artifact.record.artifactId).toBeGreaterThan(0);
      for (const actor of actors) {
        expect(actor.server, artifact.record.artifactId).toBeNull();
        expect(actor.name, artifact.record.artifactId).toBe(`Actor${String(actor.id)}`);
        if (actor.type === "Player")
          expect(actor.gameID, `${artifact.record.artifactId} actor ${String(actor.id)}`).toBeNull();
      }
    }
    expect(contexts).toBe(2);
  });

  it("carries no guild, profile URL, region or unremapped report code in the rankings artifact", async () => {
    const corpus = await loadCorpusOrThrow(committedCorpusFiles());
    const rankings = corpus.artifacts.find(
      (a) => a.record.artifactId === "wcl-encounter-rankings-sszorak-page-1",
    );
    if (rankings === undefined) throw new Error("rankings artifact missing");
    expect(rankings.text).not.toMatch(/"guild"|"region"|https?:\/\/|"characterID"|"guid"/i);
    const rows = (
      rankings.json as {
        worldData: {
          encounter: {
            characterRankings: { rankings: { report: { code: string }; name: string; server: unknown }[] };
          };
        };
      }
    ).worldData.encounter.characterRankings.rankings;
    for (const row of rows) {
      expect(row.report.code).toMatch(/^RANK\d{4}AAAAAAAA$/);
      expect(row.name).toMatch(/^Candidate\d+$/);
      expect(row.server).toBeNull();
    }
  });

  it("records the sanitizer revisions the scripts export, so a manifest cannot claim a revision that does not exist", () => {
    expect(SANITIZE_PAYLOADS_REVISION).toBe("sanitize-payloads-3");
    expect(SANITIZER_REVISION).toBe("sanitize-probe-8");
    expect(G1_SANITIZER_REVISION).toBe("sanitize-g1-cohort-1");
    expect(G2_SANITIZER_REVISION).toBe("sanitize-g2-comparisons-1");
    const revisions = new Set<string>();
    // M11-E2.1: the current revisions first cut evidence-archive artifacts, so
    // both committed roots are read.
    const archive = JSON.parse(committedEvidenceArchiveFiles()["manifest.json"] ?? "null") as {
      artifacts: { provenance: { transformations: { tooling: { name: string; revision: string } }[] } }[];
    };
    for (const artifact of [...committedManifest().artifacts, ...archive.artifacts]) {
      for (const transformation of artifact.provenance.transformations) {
        if (transformation.tooling.name.startsWith("scripts/"))
          revisions.add(transformation.tooling.revision);
      }
    }
    // Every recorded revision is one the tooling has had; the current ones are among them.
    for (const revision of revisions) {
      expect(revision).toMatch(
        /^(UNAVAILABLE|NOT_APPLICABLE|sanitize-payloads-[123]|sanitize-probe-[2345678]|sanitize-g1-cohort-1|sanitize-g2-comparisons-1|derive-gap-1|derive-substitution-1)$/,
      );
    }
    expect(revisions.has(SANITIZE_PAYLOADS_REVISION)).toBe(true);
    expect(revisions.has(SANITIZER_REVISION)).toBe(true);
    expect(revisions.has(G1_SANITIZER_REVISION)).toBe(true);
    expect(revisions.has(G2_SANITIZER_REVISION)).toBe(true);
  });
});
