/**
 * M13-B: each friendly player's Warcraft Logs-stated specialization in the
 * normalized combat model (`CombatFight.friendlySpecializations`).
 *
 * The negative cases matter most:
 * - a missing, blank, null or literal "unknown" entry is UNKNOWN / NOT_STATED,
 *   never a default and never a guess from the class;
 * - a misaligned roster refuses EVERY player: no index can be trusted;
 * - a duplicated participant, a pet, an NPC, an id missing from the catalog,
 *   an ambiguous id, a player without a class and the -1 sentinel are each
 *   UNKNOWN with the shared roster rule that refused them;
 * - one player's bad entry never touches another's;
 * - an actor outside the roster (a pet, an enemy) is NOT_IN_FRIENDLY_ROSTER,
 *   never its owner's specialization;
 * - abilities cast never establish a specialization;
 * - the stated specialization is report-context identity: every focused view,
 *   under either scope, holds the same object.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { focusedFightFor } from "../../src/engine/normalization/fight-core.js";
import { normalizeFightContext } from "../../src/engine/normalization/fight-context.js";
import {
  statedSpecializationOf,
  type FriendlySpecializations,
} from "../../src/engine/normalization/friendly-specializations.js";
import { decodeFightContext, type RawFightContextReport } from "../../src/wcl/fight-context-query.js";
import { ingestFightCore } from "../../src/wcl/ingest-fight.js";
import { loadCommittedEvidenceArchive } from "../support/corpus/evidence-archive.js";
import {
  contextResponse,
  createTestGraphqlClient,
  eventPageResponse,
  ingestionResponder,
  rawEvent,
} from "../support/wcl-harness.js";

const player = (id: number, subType: string | undefined, extra: Record<string, unknown> = {}) => ({
  id,
  name: `Raider${String(id)}`,
  type: "Player",
  ...(subType === undefined ? {} : { subType }),
  ...extra,
});

function report(fight: Record<string, unknown>, actors: readonly unknown[]): RawFightContextReport {
  return {
    code: "aBcDeFgH12345678",
    revision: 3,
    startTimeUnixMs: 1_700_000_000_000,
    endTimeUnixMs: 1_700_000_900_000,
    region: { state: "NOT_RETRIEVED" },
    logVersion: 42,
    gameVersion: 1,
    actors,
    abilities: [],
    phases: [],
    zone: null,
    fights: [
      {
        id: 6,
        name: "Test Boss",
        encounterID: 2900,
        difficulty: 5,
        size: 20,
        kill: true,
        inProgress: false,
        startTime: 10_000,
        endTime: 310_000,
        talentImportCode: null,
        phaseTransitions: [],
        ...fight,
      },
    ],
    archiveStatus: null,
  };
}

function specializationsOf(
  fight: Record<string, unknown>,
  actors: readonly unknown[],
): FriendlySpecializations {
  const outcome = normalizeFightContext(report(fight, actors), 6);
  if (!outcome.ok) throw new Error(outcome.reason);
  return outcome.fight.friendlySpecializations;
}

const entries = (specializations: FriendlySpecializations) => [...specializations.byActorId.entries()];

describe("the stated specialization is read at the player's roster index", () => {
  it("pairs each player with its own entry and class, actor id 0 included", () => {
    const specializations = specializationsOf(
      { friendlyPlayers: [7, 0, 5], friendlySpecs: ["Restoration", "Arms", "Restoration"] },
      [player(5, "Druid"), player(0, "Warrior"), player(7, "Shaman")],
    );
    expect(specializations.source).toBe("WCL_FIGHT_CONTEXT_FRIENDLY_SPECS");
    // Roster order; "Restoration" is two specializations, so the class travels with it.
    expect(entries(specializations)).toEqual([
      [7, { state: "STATED", specName: "Restoration", className: "Shaman", rosterIndex: 0 }],
      [0, { state: "STATED", specName: "Arms", className: "Warrior", rosterIndex: 1 }],
      [5, { state: "STATED", specName: "Restoration", className: "Druid", rosterIndex: 2 }],
    ]);
  });

  it("an entry Warcraft Logs did not state is UNKNOWN / NOT_STATED, never a default; the others are untouched", () => {
    const specializations = specializationsOf(
      { friendlyPlayers: [1, 2, 3, 4, 5], friendlySpecs: ["unknown", " ", null, 7, "Holy"] },
      [
        player(1, "Shaman"),
        player(2, "Paladin"),
        player(3, "Evoker"),
        player(4, "Monk"),
        player(5, "Priest"),
      ],
    );
    expect(entries(specializations)).toEqual([
      [1, { state: "UNKNOWN", reason: "NOT_STATED" }],
      [2, { state: "UNKNOWN", reason: "NOT_STATED" }],
      [3, { state: "UNKNOWN", reason: "NOT_STATED" }],
      [4, { state: "UNKNOWN", reason: "NOT_STATED" }],
      [5, { state: "STATED", specName: "Holy", className: "Priest", rosterIndex: 4 }],
    ]);
  });

  it("a misaligned roster refuses EVERY player rather than zipping to the shorter list", () => {
    const actors = [player(1, "Shaman"), player(2, "Paladin")];
    for (const fight of [
      { friendlyPlayers: [1, 2], friendlySpecs: ["Restoration"] },
      { friendlyPlayers: [1, 2], friendlySpecs: ["Restoration", "Holy", "Arms"] },
      { friendlyPlayers: [1, 2] },
      { friendlyPlayers: [1, 2], friendlySpecs: "Restoration,Holy" },
      // A non-integer participant: the header keeps 1 and 2, but the index no longer lines up.
      { friendlyPlayers: [1, "x", 2], friendlySpecs: ["Restoration", "Arms", "Holy"] },
    ]) {
      expect(entries(specializationsOf(fight, actors))).toEqual([
        [1, { state: "UNKNOWN", reason: "ROSTER_NOT_ALIGNED" }],
        [2, { state: "UNKNOWN", reason: "ROSTER_NOT_ALIGNED" }],
      ]);
    }
  });

  it("each identity rule refuses only its own player, with the rule's reason", () => {
    const specializations = specializationsOf(
      {
        friendlyPlayers: [1, 2, 1, 3, 4, 5, 6, -1, 7, 8],
        friendlySpecs: [
          "Holy",
          "Arms",
          "Holy",
          "Frost",
          "Fire",
          "Havoc",
          "Blood",
          "Fury",
          "Discipline",
          "Holy",
        ],
      },
      [
        player(1, "Paladin"),
        player(2, "Warrior"),
        { id: 3, name: "Wolf", type: "Pet", subType: "Pet", petOwner: 2 },
        { id: 4, name: "Add", type: "NPC", subType: "NPC" },
        // 5 is missing from the catalog.
        player(6, "DeathKnight"),
        player(6, "DeathKnight"),
        player(-1, "Warrior"),
        player(7, undefined),
        // A record with no `type`: not even "is a player" can be trusted.
        { id: 8, name: "Raider8", subType: "Priest" },
      ],
    );
    expect(entries(specializations)).toEqual([
      [1, { state: "UNKNOWN", reason: "DUPLICATE_PARTICIPANT" }],
      [2, { state: "STATED", specName: "Arms", className: "Warrior", rosterIndex: 1 }],
      [3, { state: "UNKNOWN", reason: "NOT_A_PLAYER" }],
      [4, { state: "UNKNOWN", reason: "NOT_A_PLAYER" }],
      [5, { state: "UNKNOWN", reason: "NOT_IN_CATALOG" }],
      [6, { state: "UNKNOWN", reason: "AMBIGUOUS_ACTOR_ID" }],
      // The no-actor sentinel never becomes a player, even with a catalog entry.
      [-1, { state: "UNKNOWN", reason: "NOT_IN_CATALOG" }],
      // A player without a class: the stated "Discipline" is not carried.
      [7, { state: "UNKNOWN", reason: "IDENTITY_UNUSABLE" }],
      [8, { state: "UNKNOWN", reason: "ACTOR_RECORD_MALFORMED" }],
    ]);
  });

  it("an actor outside the friendly roster is NOT_IN_FRIENDLY_ROSTER, never its owner's specialization", () => {
    const specializations = specializationsOf({ friendlyPlayers: [2], friendlySpecs: ["Beast Mastery"] }, [
      player(2, "Hunter"),
      { id: 30, name: "Pet", type: "Pet", subType: "Pet", petOwner: 2 },
    ]);
    expect(statedSpecializationOf(specializations, 2)).toEqual({
      state: "STATED",
      specName: "Beast Mastery",
      className: "Hunter",
      rosterIndex: 0,
    });
    expect(statedSpecializationOf(specializations, 30)).toEqual({
      state: "UNKNOWN",
      reason: "NOT_IN_FRIENDLY_ROSTER",
    });
    expect(statedSpecializationOf(specializations, 900)).toEqual({
      state: "UNKNOWN",
      reason: "NOT_IN_FRIENDLY_ROSTER",
    });
  });
});

describe("ingestion carries the stated specializations onto every view", () => {
  async function ingested(fight: Record<string, unknown>) {
    const { client } = createTestGraphqlClient(
      ingestionResponder({
        context: () =>
          contextResponse({
            actors: [player(5, "Rogue"), player(7, "Priest")],
            fight,
          }),
        // Player 7 casts a Restoration Shaman ability: casts never establish a specialization.
        pages: [
          () => eventPageResponse([rawEvent(1000, "cast", { sourceID: 7, abilityGameID: 98008 })], null),
        ],
      }),
    );
    const outcome = await ingestFightCore(
      { reportCode: "aBcDeFgH12345678", fightId: 6, talentImportActorId: 5, includeResources: false },
      { client, now: () => 1_000_000 },
    );
    if (!outcome.ok) throw new Error(outcome.failure.reason);
    return outcome.core;
  }

  it("is the same object on the core and on every view, under either scope", async () => {
    const core = await ingested({});
    const views = [
      focusedFightFor(core, 5, "PLAYER_CONTEXT"),
      focusedFightFor(core, 7, "PLAYER_CONTEXT"),
      focusedFightFor(core, 5, "FULL_RAID"),
    ];
    for (const view of views) expect(view.friendlySpecializations).toBe(core.friendlySpecializations);
    expect(entries(core.friendlySpecializations)).toEqual([
      [5, { state: "STATED", specName: "Assassination", className: "Rogue", rosterIndex: 0 }],
      [7, { state: "STATED", specName: "Holy", className: "Priest", rosterIndex: 1 }],
    ]);
  });

  it("an unstated specialization stays UNKNOWN whatever the player cast, and ingestion still succeeds", async () => {
    const core = await ingested({ friendlySpecs: ["Assassination", "unknown"] });
    expect(statedSpecializationOf(core.friendlySpecializations, 7)).toEqual({
      state: "UNKNOWN",
      reason: "NOT_STATED",
    });
    expect(core.friendlyPlayers).toEqual([5, 7]);
  });

  it("a misaligned roster leaves friendlyPlayers and the ingestion as they were", async () => {
    const core = await ingested({ friendlySpecs: ["Assassination"] });
    expect(core.friendlyPlayers).toEqual([5, 7]);
    expect(entries(core.friendlySpecializations).map(([, value]) => value)).toEqual([
      { state: "UNKNOWN", reason: "ROSTER_NOT_ALIGNED" },
      { state: "UNKNOWN", reason: "ROSTER_NOT_ALIGNED" },
    ]);
  });
});

describe("the real M13-A fight context (M13AAUGAAAAAAAAA fight 1)", () => {
  let specializations: FriendlySpecializations;

  beforeAll(async () => {
    const loaded = await loadCommittedEvidenceArchive();
    if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join("\n"));
    const context = loaded.archive.referenceableArtifacts.find(
      (entry) => entry.record.artifactId === "wcl-m13a-fight-context-aug1-fight-1",
    );
    if (context === undefined) throw new Error("no context artifact");
    const decoded = decodeFightContext(context.json);
    if (!decoded.ok || decoded.value.report === null) throw new Error("context does not decode");
    const outcome = normalizeFightContext(decoded.value.report, 1);
    if (!outcome.ok) throw new Error(outcome.reason);
    specializations = outcome.fight.friendlySpecializations;
  });

  it("states a specialization, with its class, for all twenty friendly players", () => {
    const stated = entries(specializations).map(([actorId, value]) =>
      value.state === "STATED" ? [actorId, value.className, value.specName] : [actorId, value.reason],
    );
    expect(stated).toEqual([
      [2, "Priest", "Holy"],
      [16, "DemonHunter", "Havoc"],
      [7, "Shaman", "Enhancement"],
      [12, "DeathKnight", "Blood"],
      [15, "DemonHunter", "Havoc"],
      [6, "Mage", "Frost"],
      [13, "Monk", "Brewmaster"],
      [14, "Hunter", "Marksmanship"],
      [19, "Warlock", "Demonology"],
      [1, "Evoker", "Augmentation"],
      [3, "Druid", "Balance"],
      [9, "Priest", "Discipline"],
      [18, "Hunter", "Marksmanship"],
      [17, "Rogue", "Subtlety"],
      [10, "Priest", "Shadow"],
      [20, "Warlock", "Affliction"],
      [4, "Warrior", "Arms"],
      [11, "Mage", "Arcane"],
      [5, "Paladin", "Holy"],
      [8, "Evoker", "Preservation"],
    ]);
  });

  it("a recipient pet of the real fight is NOT_IN_FRIENDLY_ROSTER", () => {
    // Actor 50 is a pet owned by 17 (M13-A recipient identity).
    expect(statedSpecializationOf(specializations, 50)).toEqual({
      state: "UNKNOWN",
      reason: "NOT_IN_FRIENDLY_ROSTER",
    });
  });
});
