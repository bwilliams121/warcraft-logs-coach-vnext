/**
 * The factual roster snapshot.
 *
 * WHAT THESE TESTS DEFEND
 *
 * A roster is the layer where a person is first identified, and identity
 * mistakes made here are invisible later: a misaligned specialization attaches
 * the right player to the wrong spec, a name-based key merges two raiders who
 * happen to share a name, and an unknown-actor sentinel admitted as a player
 * becomes a participant nobody can find. Every one of those produces a
 * well-formed result, which is why they need tests rather than review.
 *
 * Equally, the snapshot must stay FACTUAL. Absence is a participation fact and
 * nothing else — not unknown, not unsupported, not zero, not poor play. There is
 * deliberately nowhere in these types to record any of those, and the tests
 * below assert the facts without ever asserting a judgement.
 */

import { describe, expect, it } from "vitest";

import {
  participationFor,
  playerKeyOf,
  resolveReportRoster,
  type ReportRosterSnapshot,
} from "../../src/wcl/roster-snapshot.js";
import type { RosterPayload } from "../../src/wcl/report-roster-query.js";
import { rosterActor, rosterFight } from "../support/wcl-harness.js";

const ROGUE = 19;
const HEALER = 7;
/** Actor id `0` is a real id in this data, never a falsy placeholder. */
const ZERO_ID_PLAYER = 0;
const REPORT = "aBcDeFgH12345678";

function payload(options: {
  readonly actors: readonly unknown[];
  readonly fights: readonly unknown[];
  readonly revision?: number;
}): RosterPayload {
  return {
    report: {
      code: REPORT,
      revision: options.revision ?? 30,
      startTimeUnixMs: 1_700_000_000_000,
      endTimeUnixMs: 1_700_000_900_000,
      logVersion: 17,
      gameVersion: 1,
      actors: options.actors,
      fights: options.fights,
    },
  };
}

function resolvedOrThrow(result: ReturnType<typeof resolveReportRoster>): ReportRosterSnapshot {
  if (!result.ok) {
    throw new Error(`expected a snapshot, got ${result.failure.reason}/${String(result.failure.defect)}`);
  }
  return result.snapshot;
}

const STANDARD_ACTORS = [
  rosterActor({ id: ROGUE, name: "Sneaky", subType: "Rogue" }),
  rosterActor({ id: HEALER, name: "Mendy", subType: "Priest" }),
  rosterActor({ id: ZERO_ID_PLAYER, name: "Zeroth", subType: "Warrior" }),
];

describe("R0 and snapshot identity", () => {
  it("establishes R0 from the roster query's own report revision", () => {
    const snapshot = resolvedOrThrow(
      resolveReportRoster(
        payload({
          revision: 30,
          actors: STANDARD_ACTORS,
          fights: [rosterFight({ id: 1, friendlyPlayers: [ROGUE], friendlySpecs: ["Assassination"] })],
        }),
        [1],
      ),
    );

    expect(snapshot.identity.reportRevision).toBe(30);
    expect(snapshot.identity.reportCode).toBe(REPORT);
    expect(snapshot.identity.logVersion).toBe(17);
    expect(snapshot.identity.gameVersion).toBe(1);
    expect(snapshot.identity.includedFightIds).toEqual([1]);
  });

  it("carries no generated id, clock reading or analysis provenance", () => {
    const snapshot = resolvedOrThrow(
      resolveReportRoster(
        payload({
          actors: STANDARD_ACTORS,
          fights: [rosterFight({ id: 1, friendlyPlayers: [ROGUE], friendlySpecs: ["Assassination"] })],
        }),
        [1],
      ),
    );

    // The identity of a snapshot is the report and revision it came from.
    // Anything else would give two identical runs two different identities.
    expect(Object.keys(snapshot.identity).sort()).toEqual([
      "gameVersion",
      "includedFightIds",
      "logVersion",
      "reportCode",
      "reportEndTimeUnixMs",
      "reportRevision",
      "reportStartTimeUnixMs",
    ]);
  });
});

describe("friendlyPlayers and friendlySpecs are index-aligned", () => {
  it("attaches each specialization to the participant at its own index", () => {
    const snapshot = resolvedOrThrow(
      resolveReportRoster(
        payload({
          actors: STANDARD_ACTORS,
          fights: [
            rosterFight({
              id: 1,
              friendlyPlayers: [HEALER, ROGUE],
              friendlySpecs: ["Outlaw", "Assassination"],
            }),
          ],
        }),
        [1],
      ),
    );

    // THE REGRESSION. Zipping by position without checking alignment, or sorting
    // one array and not the other, silently swaps these two.
    expect(participationFor(snapshot, 1, HEALER)).toEqual({ kind: "PRESENT", specName: "Outlaw" });
    expect(participationFor(snapshot, 1, ROGUE)).toEqual({ kind: "PRESENT", specName: "Assassination" });
  });

  it("fails closed when the two arrays have different lengths", () => {
    const result = resolveReportRoster(
      payload({
        actors: STANDARD_ACTORS,
        fights: [rosterFight({ id: 1, friendlyPlayers: [HEALER, ROGUE], friendlySpecs: ["Outlaw"] })],
      }),
      [1],
    );

    // Not zipped to the shorter array, and no spec fabricated for the remainder.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe("ROSTER_DATA_INVALID");
    expect(result.failure.defect).toBe("FRIENDLY_SPEC_ALIGNMENT");
    expect(result.failure.fightId).toBe(1);
  });

  it("fails closed when a participant id is not an integer", () => {
    const result = resolveReportRoster(
      payload({
        actors: STANDARD_ACTORS,
        fights: [
          rosterFight({
            id: 1,
            friendlyPlayers: ["19" as unknown as number],
            friendlySpecs: ["Assassination"],
          }),
        ],
      }),
      [1],
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.defect).toBe("FRIENDLY_SPEC_ALIGNMENT");
  });

  it("records a null spec when WCL supplied none, without doubting the participation", () => {
    const snapshot = resolvedOrThrow(
      resolveReportRoster(
        payload({
          actors: STANDARD_ACTORS,
          // WCL reports an unresolved spec as the literal string "unknown".
          fights: [rosterFight({ id: 1, friendlyPlayers: [ROGUE], friendlySpecs: ["unknown"] })],
        }),
        [1],
      ),
    );

    // PRESENT with an unknown spec is not ABSENT, and not a guess either.
    expect(participationFor(snapshot, 1, ROGUE)).toEqual({ kind: "PRESENT", specName: null });
  });
});

describe("a player keeps one identity across a specialization change", () => {
  it("records one report-level player and two per-fight observations", () => {
    const snapshot = resolvedOrThrow(
      resolveReportRoster(
        payload({
          actors: STANDARD_ACTORS,
          fights: [
            rosterFight({ id: 1, friendlyPlayers: [ROGUE], friendlySpecs: ["Assassination"] }),
            rosterFight({ id: 2, friendlyPlayers: [ROGUE], friendlySpecs: ["Outlaw"] }),
          ],
        }),
        [1, 2],
      ),
    );

    // ONE player. Keying by spec, or by name+spec, would split them in two and
    // make a night's history look like two people.
    expect(snapshot.players).toHaveLength(1);
    expect(snapshot.players[0]?.sourceId).toBe(ROGUE);
    expect(playerKeyOf(snapshot.identity.reportCode, ROGUE)).toBe(`${REPORT}:19`);

    expect(participationFor(snapshot, 1, ROGUE)).toEqual({ kind: "PRESENT", specName: "Assassination" });
    expect(participationFor(snapshot, 2, ROGUE)).toEqual({ kind: "PRESENT", specName: "Outlaw" });
  });
});

describe("absence is a participation fact", () => {
  it("distinguishes present from absent across the selected fight set", () => {
    const snapshot = resolvedOrThrow(
      resolveReportRoster(
        payload({
          actors: STANDARD_ACTORS,
          fights: [
            rosterFight({
              id: 1,
              friendlyPlayers: [ROGUE, HEALER],
              friendlySpecs: ["Assassination", "Holy"],
            }),
            rosterFight({ id: 2, friendlyPlayers: [ROGUE], friendlySpecs: ["Assassination"] }),
          ],
        }),
        [1, 2],
      ),
    );

    // The healer is on the night's roster — that is what makes "absent from
    // fight 2" a fact about them rather than a question about the snapshot.
    expect(snapshot.players.map((player) => player.sourceId)).toEqual([HEALER, ROGUE]);
    expect(participationFor(snapshot, 1, HEALER)).toEqual({ kind: "PRESENT", specName: "Holy" });
    expect(participationFor(snapshot, 2, HEALER)).toEqual({ kind: "ABSENT" });
  });

  it("never lets ABSENT absorb a question the snapshot was not asked", () => {
    const snapshot = resolvedOrThrow(
      resolveReportRoster(
        payload({
          actors: STANDARD_ACTORS,
          fights: [rosterFight({ id: 1, friendlyPlayers: [ROGUE], friendlySpecs: ["Assassination"] })],
        }),
        [1],
      ),
    );

    expect(participationFor(snapshot, 99, ROGUE)).toEqual({ kind: "FIGHT_NOT_IN_SNAPSHOT" });
    expect(participationFor(snapshot, 1, 12_345)).toEqual({ kind: "NOT_IN_ROSTER" });
  });
});

describe("identity is the source id and nothing else", () => {
  it("keeps two players with the same name distinct", () => {
    const snapshot = resolvedOrThrow(
      resolveReportRoster(
        payload({
          actors: [
            rosterActor({ id: HEALER, name: "SameName", subType: "Priest" }),
            rosterActor({ id: ROGUE, name: "SameName", subType: "Rogue" }),
          ],
          fights: [
            rosterFight({
              id: 1,
              friendlyPlayers: [HEALER, ROGUE],
              friendlySpecs: ["Holy", "Assassination"],
            }),
          ],
        }),
        [1],
      ),
    );

    // Duplicate names are legitimate. Identity is the id, so nothing merges.
    expect(snapshot.players).toHaveLength(2);
    expect(snapshot.players.map((player) => player.sourceId)).toEqual([HEALER, ROGUE]);
    expect(snapshot.players.every((player) => player.name === "SameName")).toBe(true);
    expect(playerKeyOf(REPORT, HEALER)).not.toBe(playerKeyOf(REPORT, ROGUE));
  });

  it("treats actor id 0 as a real player throughout", () => {
    const snapshot = resolvedOrThrow(
      resolveReportRoster(
        payload({
          actors: STANDARD_ACTORS,
          fights: [
            rosterFight({
              id: 1,
              friendlyPlayers: [ZERO_ID_PLAYER, ROGUE],
              friendlySpecs: ["Arms", "Assassination"],
            }),
            rosterFight({ id: 2, friendlyPlayers: [ROGUE], friendlySpecs: ["Assassination"] }),
          ],
        }),
        [1, 2],
      ),
    );

    // A truthiness test anywhere in this path would drop this player entirely.
    expect(snapshot.players.map((player) => player.sourceId)).toEqual([ZERO_ID_PLAYER, ROGUE]);
    expect(participationFor(snapshot, 1, ZERO_ID_PLAYER)).toEqual({ kind: "PRESENT", specName: "Arms" });
    expect(participationFor(snapshot, 2, ZERO_ID_PLAYER)).toEqual({ kind: "ABSENT" });
    expect(playerKeyOf(REPORT, ZERO_ID_PLAYER)).toBe(`${REPORT}:0`);
  });

  it("refuses the -1 unknown-actor sentinel as a participant", () => {
    const result = resolveReportRoster(
      payload({
        actors: STANDARD_ACTORS,
        fights: [
          rosterFight({ id: 1, friendlyPlayers: [ROGUE, -1], friendlySpecs: ["Assassination", "Holy"] }),
        ],
      }),
      [1],
    );

    // `-1` is the explicit statement that no actor was identified. It must never
    // become a roster player, a player key, or a silently dropped entry.
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe("ROSTER_DATA_INVALID");
    expect(result.failure.defect).toBe("UNKNOWN_ACTOR_SENTINEL");
    expect(result.failure.sourceId).toBe(-1);
  });

  it("refuses -1 even when the catalog contains an entry for it", () => {
    // Checked BEFORE the catalog is consulted, so a malformed catalog cannot
    // rescue the sentinel into a real player.
    const result = resolveReportRoster(
      payload({
        actors: [...STANDARD_ACTORS, rosterActor({ id: -1, name: "Nobody" })],
        fights: [rosterFight({ id: 1, friendlyPlayers: [-1], friendlySpecs: ["Holy"] })],
      }),
      [1],
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.defect).toBe("UNKNOWN_ACTOR_SENTINEL");
  });

  it("fails closed on an ambiguous actor id rather than picking the first match", () => {
    const result = resolveReportRoster(
      payload({
        actors: [
          rosterActor({ id: ROGUE, name: "First", subType: "Rogue" }),
          rosterActor({ id: ROGUE, name: "Second", subType: "Mage" }),
        ],
        fights: [rosterFight({ id: 1, friendlyPlayers: [ROGUE], friendlySpecs: ["Assassination"] })],
      }),
      [1],
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.defect).toBe("AMBIGUOUS_ACTOR_ID");
    expect(result.failure.sourceId).toBe(ROGUE);
  });

  it("fails closed rather than dropping a participant missing from the catalog", () => {
    const result = resolveReportRoster(
      payload({
        actors: [rosterActor({ id: ROGUE })],
        fights: [
          rosterFight({ id: 1, friendlyPlayers: [ROGUE, 404], friendlySpecs: ["Assassination", "Holy"] }),
        ],
      }),
      [1],
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.defect).toBe("PARTICIPANT_NOT_IN_CATALOG");
    expect(result.failure.sourceId).toBe(404);
  });

  it("fails closed when a participant resolves to a pet or NPC", () => {
    const result = resolveReportRoster(
      payload({
        actors: [rosterActor({ id: ROGUE }), rosterActor({ id: 55, type: "Pet", subType: "Pet" })],
        fights: [
          rosterFight({ id: 1, friendlyPlayers: [ROGUE, 55], friendlySpecs: ["Assassination", "Holy"] }),
        ],
      }),
      [1],
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.defect).toBe("PARTICIPANT_NOT_A_PLAYER");
  });

  it("fails closed on a duplicate participant within one fight", () => {
    const result = resolveReportRoster(
      payload({
        actors: STANDARD_ACTORS,
        fights: [
          rosterFight({ id: 1, friendlyPlayers: [ROGUE, ROGUE], friendlySpecs: ["Assassination", "Outlaw"] }),
        ],
      }),
      [1],
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.defect).toBe("DUPLICATE_PARTICIPANT");
  });
});

describe("requested, found and missing fights", () => {
  it("records a missing requested fight without fabricating one", () => {
    const snapshot = resolvedOrThrow(
      resolveReportRoster(
        payload({
          actors: STANDARD_ACTORS,
          fights: [rosterFight({ id: 1, friendlyPlayers: [ROGUE], friendlySpecs: ["Assassination"] })],
        }),
        [1, 2, 3],
      ),
    );

    expect(snapshot.requestedFightIds).toEqual([1, 2, 3]);
    expect(snapshot.identity.includedFightIds).toEqual([1]);
    expect(snapshot.missingRequestedFightIds).toEqual([2, 3]);
    // No placeholder fight, and therefore no empty participant list that could
    // be misread as "nobody was in pull 2".
    expect(snapshot.fights.map((fight) => fight.fightId)).toEqual([1]);
    expect(participationFor(snapshot, 2, ROGUE)).toEqual({ kind: "FIGHT_NOT_IN_SNAPSHOT" });
  });

  it("refuses an empty selection rather than discovering the whole report", () => {
    const result = resolveReportRoster(payload({ actors: STANDARD_ACTORS, fights: [] }), []);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe("NO_FIGHTS_REQUESTED");
  });

  it("refuses a fight the caller never requested", () => {
    const result = resolveReportRoster(
      payload({
        actors: STANDARD_ACTORS,
        fights: [rosterFight({ id: 9, friendlyPlayers: [ROGUE], friendlySpecs: ["Assassination"] })],
      }),
      [1],
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.defect).toBe("UNREQUESTED_FIGHT_RETURNED");
  });

  it("refuses two fights claiming one id", () => {
    const result = resolveReportRoster(
      payload({
        actors: STANDARD_ACTORS,
        fights: [
          rosterFight({ id: 1, friendlyPlayers: [ROGUE], friendlySpecs: ["Assassination"] }),
          rosterFight({ id: 1, friendlyPlayers: [HEALER], friendlySpecs: ["Holy"] }),
        ],
      }),
      [1],
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.defect).toBe("DUPLICATE_FIGHT_ID");
  });

  it("reports an inaccessible report rather than an empty roster", () => {
    const result = resolveReportRoster({ report: null }, [1]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe("REPORT_NOT_ACCESSIBLE");
  });
});

describe("ordering is canonical, never inherited from the response", () => {
  it("produces the same snapshot from shuffled but equivalent payloads", () => {
    const actors = [
      rosterActor({ id: ROGUE, name: "Sneaky" }),
      rosterActor({ id: HEALER, name: "Mendy", subType: "Priest" }),
      rosterActor({ id: ZERO_ID_PLAYER, name: "Zeroth", subType: "Warrior" }),
    ];
    const fightOne = rosterFight({
      id: 1,
      friendlyPlayers: [ROGUE, HEALER, ZERO_ID_PLAYER],
      friendlySpecs: ["Assassination", "Holy", "Arms"],
    });
    const fightTwo = rosterFight({ id: 2, friendlyPlayers: [HEALER], friendlySpecs: ["Holy"] });

    const ordered = resolvedOrThrow(
      resolveReportRoster(payload({ actors, fights: [fightOne, fightTwo] }), [1, 2]),
    );
    // Same facts, different array orders: fights reversed, actors reversed, and
    // the requested ids given descending. Warcraft Logs promises no ordering for
    // any of them, so none of them may reach the snapshot.
    const shuffled = resolvedOrThrow(
      resolveReportRoster(payload({ actors: [...actors].reverse(), fights: [fightTwo, fightOne] }), [2, 1]),
    );

    expect(shuffled).toEqual(ordered);
    expect(ordered.fights.map((fight) => fight.fightId)).toEqual([1, 2]);
    expect(ordered.players.map((player) => player.sourceId)).toEqual([ZERO_ID_PLAYER, HEALER, ROGUE]);
    expect(ordered.fights[0]?.participants.map((entry) => entry.sourceId)).toEqual([
      ZERO_ID_PLAYER,
      HEALER,
      ROGUE,
    ]);
    expect(ordered.requestedFightIds).toEqual([1, 2]);
  });

  it("sorts missing requested fight ids ascending", () => {
    const snapshot = resolvedOrThrow(
      resolveReportRoster(
        payload({
          actors: STANDARD_ACTORS,
          fights: [rosterFight({ id: 5, friendlyPlayers: [ROGUE], friendlySpecs: ["Assassination"] })],
        }),
        [9, 5, 2, 7],
      ),
    );
    expect(snapshot.missingRequestedFightIds).toEqual([2, 7, 9]);
    expect(snapshot.requestedFightIds).toEqual([2, 5, 7, 9]);
  });

  it("does not care in which fight a player was first seen", () => {
    // The union roster is keyed by id, so a player appearing in a later fight
    // first must still land in the same place.
    const snapshot = resolvedOrThrow(
      resolveReportRoster(
        payload({
          actors: STANDARD_ACTORS,
          fights: [
            rosterFight({ id: 2, friendlyPlayers: [HEALER], friendlySpecs: ["Holy"] }),
            rosterFight({ id: 1, friendlyPlayers: [ROGUE], friendlySpecs: ["Assassination"] }),
          ],
        }),
        [1, 2],
      ),
    );
    expect(snapshot.players.map((player) => player.sourceId)).toEqual([HEALER, ROGUE]);
  });
});
