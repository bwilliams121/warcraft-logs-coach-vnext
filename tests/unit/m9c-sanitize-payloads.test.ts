import { describe, expect, it } from "vitest";

import { decisionSlice, extractEvents, SANITIZER_REVISION } from "../../scripts/sanitize-probe.mjs";
import {
  SANITIZE_PAYLOADS_REVISION,
  sanitizeContext,
  sanitizePages,
  sanitizeRankings,
} from "../../scripts/corpus/sanitize-payloads.mjs";
import { committedManifest } from "../support/corpus/artifacts.js";
import { committedCorpusFiles, loadCorpusOrThrow } from "../support/corpus/loader.js";

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
    expect(SANITIZE_PAYLOADS_REVISION).toBe("sanitize-payloads-2");
    expect(SANITIZER_REVISION).toBe("sanitize-probe-3");
    const revisions = new Set<string>();
    for (const artifact of committedManifest().artifacts) {
      for (const transformation of artifact.provenance.transformations) {
        if (transformation.tooling.name.startsWith("scripts/"))
          revisions.add(transformation.tooling.revision);
      }
    }
    // Every recorded revision is one the tooling has had; the current ones are among them.
    for (const revision of revisions) {
      expect(revision).toMatch(/^(UNAVAILABLE|NOT_APPLICABLE|sanitize-payloads-[12]|sanitize-probe-[23])$/);
    }
    expect(revisions.has(SANITIZE_PAYLOADS_REVISION)).toBe(true);
    expect(revisions.has(SANITIZER_REVISION)).toBe(true);
  });
});
