import { describe, expect, it } from "vitest";

import { normalizeFightContext } from "../../src/engine/normalization/fight-context.js";
import { decodeFightContext } from "../../src/wcl/fight-context-query.js";
// Moved to its own module in M7-C so roster discovery and a future raid-night
// batch share ONE definition of "read the revision". The assertions below are
// unchanged, which is what proves the move was behaviour-preserving.
import { decodeReportRevision } from "../../src/wcl/report-revision.js";
import type { RawFightContextReport } from "../../src/wcl/fight-context-query.js";

function report(overrides: Partial<RawFightContextReport> = {}): RawFightContextReport {
  return {
    code: "aBcDeFgH12345678",
    revision: 3,
    startTimeUnixMs: 1_700_000_000_000,
    endTimeUnixMs: 1_700_000_900_000,
    logVersion: 42,
    gameVersion: 1,
    actors: [],
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
        friendlyPlayers: [5, 7, 9],
        friendlySpecs: ["Assassination", "Holy", "Protection"],
        talentImportCode: "ABCDEF",
        phaseTransitions: [],
      },
    ],
    archiveStatus: null,
    ...overrides,
  };
}

describe("fight finality is separate from retrieval completeness", () => {
  it("maps inProgress false to COMPLETED", () => {
    const outcome = normalizeFightContext(report(), 6);
    expect(outcome.ok && outcome.fight.finality).toBe("COMPLETED");
  });

  it("maps inProgress true to IN_PROGRESS without touching coverage", () => {
    const outcome = normalizeFightContext(
      report({ fights: [{ ...(report().fights[0] as object), inProgress: true }] }),
      6,
    );

    // Finality answers "was the fight finished?". It must never be folded into
    // coverage, which answers "did we obtain what we asked for?". An
    // in-progress fight fully retrieved is COMPLETE coverage AND IN_PROGRESS.
    expect(outcome.ok && outcome.fight.finality).toBe("IN_PROGRESS");
    expect(outcome.ok && outcome.fight.inProgressRaw).toBe(true);
  });

  it("maps a null inProgress to UNKNOWN rather than assuming COMPLETED", () => {
    const outcome = normalizeFightContext(
      report({ fights: [{ ...(report().fights[0] as object), inProgress: null }] }),
      6,
    );
    expect(outcome.ok && outcome.fight.finality).toBe("UNKNOWN");
    expect(outcome.ok && outcome.fight.inProgressRaw).toBeNull();
  });

  it("preserves the raw value alongside the mapping", () => {
    const outcome = normalizeFightContext(report(), 6);
    expect(outcome.ok && outcome.fight.inProgressRaw).toBe(false);
  });
});

describe("fight boundaries", () => {
  it("computes duration from the report-relative boundaries", () => {
    const outcome = normalizeFightContext(report(), 6);
    expect(outcome.ok && outcome.fight.durationMs).toBe(300_000);
  });

  it("fails closed on a zero-length or inverted fight", () => {
    // Every fight-relative timestamp would be meaningless, so this must not
    // produce nonsense offsets.
    const zero = normalizeFightContext(
      report({ fights: [{ ...(report().fights[0] as object), endTime: 10_000 }] }),
      6,
    );
    expect(zero.ok).toBe(false);
    expect(!zero.ok && zero.reason).toBe("FIGHT_RANGE_INVALID");

    const inverted = normalizeFightContext(
      report({ fights: [{ ...(report().fights[0] as object), endTime: 5_000 }] }),
      6,
    );
    expect(!inverted.ok && inverted.reason).toBe("FIGHT_RANGE_INVALID");
  });

  it("reports a missing fight distinctly from invalid upstream data", () => {
    expect(normalizeFightContext(report({ fights: [] }), 6)).toEqual({
      ok: false,
      reason: "FIGHT_NOT_FOUND",
    });
    expect(normalizeFightContext(report({ fights: [{ id: 99 }] }), 6)).toEqual({
      ok: false,
      reason: "UPSTREAM_DATA_INVALID",
    });
  });
});

describe("phases from typed GraphQL fields", () => {
  it("joins phase transitions to their metadata", () => {
    const outcome = normalizeFightContext(
      report({
        phases: [
          {
            encounterID: 2900,
            separatesWipes: true,
            phases: [
              { id: 1, name: "Phase One", isIntermission: false },
              { id: 2, name: "Intermission", isIntermission: true },
            ],
          },
        ],
        fights: [
          {
            ...(report().fights[0] as object),
            phaseTransitions: [
              { id: 1, startTime: 10_000 },
              { id: 2, startTime: 120_000 },
            ],
          },
        ],
      }),
      6,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.phases).toEqual([
      { phaseId: 1, name: "Phase One", isIntermission: false, startTimeMs: 10_000, fightTimeMs: 0 },
      { phaseId: 2, name: "Intermission", isIntermission: true, startTimeMs: 120_000, fightTimeMs: 110_000 },
    ]);
  });

  it("leaves isIntermission null when Warcraft Logs did not supply it", () => {
    // Absent is not "not an intermission".
    const outcome = normalizeFightContext(
      report({
        phases: [{ encounterID: 2900, phases: [{ id: 1, name: "Phase One" }] }],
        fights: [{ ...(report().fights[0] as object), phaseTransitions: [{ id: 1, startTime: 10_000 }] }],
      }),
      6,
    );
    expect(outcome.ok && outcome.phases[0]?.isIntermission).toBeNull();
  });

  it("ignores phase metadata belonging to a different encounter", () => {
    const outcome = normalizeFightContext(
      report({
        phases: [{ encounterID: 1234, phases: [{ id: 1, name: "Wrong Boss", isIntermission: true }] }],
        fights: [{ ...(report().fights[0] as object), phaseTransitions: [{ id: 1, startTime: 10_000 }] }],
      }),
      6,
    );
    expect(outcome.ok && outcome.phases[0]?.name).toBeNull();
  });
});

describe("actor catalog", () => {
  it("keeps pets separate from their owners and never attributes events", () => {
    const outcome = normalizeFightContext(
      report({
        actors: [
          { id: 5, gameID: 111, name: "Rogue", server: "Realm", type: "Player", subType: "Rogue" },
          { id: 88, gameID: 222, name: "Pet", type: "Pet", subType: "Pet", petOwner: 5 },
        ],
      }),
      6,
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const pet = outcome.actors.actors.get(88);
    expect(pet?.actorType).toBe("PET");
    expect(pet?.petOwnerActorId).toBe(5);
    // The pet remains its own actor. Nothing rewrites it into the owner.
    expect(outcome.actors.actors.get(5)?.actorType).toBe("PLAYER");
    expect(outcome.actors.actors.size).toBe(2);
  });

  it("leaves petOwner null when Warcraft Logs supplied none", () => {
    const outcome = normalizeFightContext(
      report({ actors: [{ id: 9, name: "Boss", type: "NPC", subType: "Boss" }] }),
      6,
    );
    expect(outcome.ok && outcome.actors.actors.get(9)?.petOwnerActorId).toBeNull();
  });

  it("counts an actor with no usable id rather than inventing one", () => {
    const outcome = normalizeFightContext(
      report({
        actors: [
          { name: "No ID", type: "Player" },
          { id: 5, name: "Fine", type: "Player" },
        ],
      }),
      6,
    );
    expect(outcome.ok && outcome.actors.unusableEntryCount).toBe(1);
    expect(outcome.ok && outcome.actors.actors.size).toBe(1);
  });

  it("preserves an unrecognised actor type verbatim as UNKNOWN", () => {
    const outcome = normalizeFightContext(
      report({ actors: [{ id: 1, name: "Odd", type: "SomethingNew" }] }),
      6,
    );
    const actor = outcome.ok ? outcome.actors.actors.get(1) : undefined;
    expect(actor?.actorType).toBe("UNKNOWN");
    expect(actor?.rawType).toBe("SomethingNew");
  });
});

describe("ability catalog", () => {
  it("keys abilities by game id, the only identity available", () => {
    const outcome = normalizeFightContext(
      report({ abilities: [{ gameID: 1329, name: "Mutilate", type: "1" }] }),
      6,
    );
    expect(outcome.ok && outcome.abilities.abilities.get(1329)).toEqual({
      gameId: 1329,
      name: "Mutilate",
      school: "1",
    });
  });

  it("counts an ability with no game id rather than substituting one", () => {
    const outcome = normalizeFightContext(report({ abilities: [{ name: "Nameless" }] }), 6);
    expect(outcome.ok && outcome.abilities.unusableEntryCount).toBe(1);
  });
});

describe("talent import code", () => {
  it("records the factual string without parsing it", () => {
    const outcome = normalizeFightContext(report(), 6);
    // Decoding it into talent ids needs runtime game data, which is not M3.
    expect(outcome.ok && outcome.fight.talentImportCode).toBe("ABCDEF");
  });

  it("records null rather than an empty build when absent", () => {
    const outcome = normalizeFightContext(
      report({ fights: [{ ...(report().fights[0] as object), talentImportCode: null }] }),
      6,
    );
    expect(outcome.ok && outcome.fight.talentImportCode).toBeNull();
  });
});

describe("context decoding", () => {
  it("recognises an inaccessible report as null rather than failing", () => {
    const decoded = decodeFightContext({ reportData: { report: null } });
    expect(decoded.ok && decoded.value.report).toBeNull();
  });

  it("decodes archive status when supplied", () => {
    const decoded = decodeFightContext({
      reportData: {
        report: {
          code: "x",
          revision: 1,
          startTime: 0,
          endTime: 1,
          masterData: { logVersion: 1, gameVersion: 1, actors: [], abilities: [] },
          fights: [],
          archiveStatus: { isArchived: true, isAccessible: false, archiveDate: 123 },
        },
      },
    });
    expect(decoded.ok && decoded.value.report?.archiveStatus).toEqual({
      isArchived: true,
      isAccessible: false,
      archiveDate: 123,
    });
  });

  it("treats absent archive status as unknown, not as 'not archived'", () => {
    const decoded = decodeFightContext({
      reportData: {
        report: {
          code: "x",
          revision: 1,
          startTime: 0,
          endTime: 1,
          masterData: { logVersion: 1, gameVersion: 1, actors: [], abilities: [] },
          fights: [],
        },
      },
    });
    expect(decoded.ok && decoded.value.report?.archiveStatus).toBeNull();
  });

  it("decodes the revision verification query", () => {
    expect(decodeReportRevision({ reportData: { report: { revision: 7 } } })).toEqual({
      ok: true,
      value: 7,
    });
    expect(decodeReportRevision({ reportData: { report: null } })).toEqual({ ok: true, value: null });
    expect(decodeReportRevision({ nope: true }).ok).toBe(false);
  });
});
