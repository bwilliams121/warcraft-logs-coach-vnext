import { describe, expect, it } from "vitest";

import { resolveFightIdentity, type IdentityFailureReason } from "../../src/wcl/identity.js";
import { decodePreflight, type PreflightPayload } from "../../src/wcl/preflight-query.js";
import {
  preflightData,
  REQUEST,
  reportWithActors,
  reportWithFight,
  reportWithMasterData,
  validActors,
  validReport,
  type ReportFixture,
} from "../fixtures/wcl/preflight-payloads.js";

/** Decodes a fixture the way the transport does, so these tests exercise the real path. */
function payload(report: ReportFixture | null): PreflightPayload {
  const outcome = decodePreflight(preflightData(report));
  if (!outcome.ok) {
    throw new Error("fixture did not decode, but this test intends a decodable payload");
  }
  return outcome.value;
}

function resolve(report: ReportFixture | null) {
  return resolveFightIdentity(payload(report), REQUEST);
}

function expectFailure(report: ReportFixture | null, reason: IdentityFailureReason, label: string = reason) {
  const result = resolve(report);
  expect(result.ok, label).toBe(false);
  if (!result.ok) {
    expect(result.reason, label).toBe(reason);
  }
}

describe("fight identity", () => {
  it("resolves_name_class_and_spec_together", () => {
    const result = resolve(validReport());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.identity.player).toEqual({
      sourceId: 15,
      name: "Coachtest",
      // Class comes from the actor's subType.
      className: "Rogue",
      // Spec comes from the fight's own participation data, never from the class.
      specName: "Assassination",
    });
    expect(result.identity.report).toEqual({
      code: REQUEST.reportCode,
      revision: 24,
      startTime: 1_700_000_000_000,
      endTime: 1_700_000_600_000,
    });
    expect(result.identity.data).toEqual({ logVersion: 26, gameVersion: 1 });
    expect(result.identity.fight).toEqual({
      id: 8,
      name: "Test Encounter",
      encounterId: 2902,
      difficulty: 5,
      startTime: 120_000,
      endTime: 420_000,
    });
  });

  it("null_report_is_report_not_accessible", () => {
    // The only signal M2 recognises for "not found, or private".
    expectFailure(null, "REPORT_NOT_ACCESSIBLE");
  });

  it("empty_fights_is_fight_not_found", () => {
    const report = validReport();
    report.fights = [];
    expectFailure(report, "FIGHT_NOT_FOUND");
  });

  it("more_than_one_returned_fight_fails_closed", () => {
    const report = validReport();
    report.fights = [{ id: 8 }, { id: 9 }];
    expectFailure(report, "UPSTREAM_DATA_INVALID");
  });

  it("wrong_fight_id_in_response_fails_closed", () => {
    // The query asked for one fight. A different one coming back means the
    // response does not answer the question asked.
    expectFailure(reportWithFight({ id: 9 }), "UPSTREAM_DATA_INVALID");
  });

  it("unknown_source_id_is_source_not_found", () => {
    expectFailure(
      reportWithActors([{ id: 16, name: "Otherplayer", type: "Player", subType: "Paladin" }]),
      "SOURCE_NOT_FOUND",
    );
  });

  it("pet_source_id_is_not_a_player", () => {
    // Type is read before any player-only field, so a pet is reported as a pet
    // rather than as a player with a missing class.
    const report = reportWithActors([
      { id: 15, name: "Coachtest's Pet", type: "Pet", subType: "Pet" },
      { id: 16, name: "Otherplayer", type: "Player", subType: "Paladin" },
    ]);
    expectFailure(report, "SOURCE_NOT_A_PLAYER");
  });

  it("npc_source_id_is_not_a_player", () => {
    const report = reportWithActors([{ id: 15, name: "Test Boss", type: "NPC", subType: "Boss" }]);
    expectFailure(report, "SOURCE_NOT_A_PLAYER");
  });

  it("pet_without_player_only_fields_is_still_reported_as_not_a_player", () => {
    // Pets legitimately lack a class. Requiring player fields first would
    // mislabel this as an upstream data defect.
    const report = reportWithActors([{ id: 15, type: "Pet" }]);
    expectFailure(report, "SOURCE_NOT_A_PLAYER");
  });

  it("player_absent_from_friendly_players_did_not_participate", () => {
    const report = reportWithFight({ friendlyPlayers: [16, 17], friendlySpecs: ["Protection", "Holy"] });
    expectFailure(report, "SOURCE_NOT_IN_FIGHT");
  });

  it("duplicate_matching_actor_ids_fail_closed", () => {
    // Two actors claiming one ID makes every later source reference ambiguous.
    const report = reportWithActors([
      { id: 15, name: "Coachtest", type: "Player", subType: "Rogue" },
      { id: 15, name: "Coachtest", type: "Player", subType: "Mage" },
      { id: 16, name: "Otherplayer", type: "Player", subType: "Paladin" },
    ]);
    expectFailure(report, "UPSTREAM_DATA_INVALID");
  });

  it("malformed_unrelated_actors_do_not_prevent_resolution", () => {
    // A report holds hundreds of NPCs. A broken entry for one of them says
    // nothing about whether the requested player's identity is trustworthy.
    const report = reportWithActors([
      null,
      42,
      "not an actor",
      { id: "not-a-number", name: null },
      { id: 99 },
      { id: 100, type: 7, subType: null, name: null },
      ...validActors(),
    ]);

    const result = resolve(report);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.identity.player.name).toBe("Coachtest");
      expect(result.identity.player.className).toBe("Rogue");
    }
  });

  it("spec_is_taken_from_friendly_specs_by_index_not_from_class", () => {
    // Same class, different spec: if the class were driving this, it could not
    // tell these apart.
    const report = reportWithFight({
      friendlyPlayers: [16, 15],
      friendlySpecs: ["Protection", "Subtlety"],
    });

    const result = resolve(report);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.identity.player.specName).toBe("Subtlety");
      expect(result.identity.player.className).toBe("Rogue");
    }
  });

  it("unrelated_player_with_an_odd_spec_entry_does_not_block_resolution", () => {
    // Only the selected player's spec has to be usable.
    const report = reportWithFight({
      friendlyPlayers: [16, 15, 17],
      friendlySpecs: [null, "Assassination", ""],
    });

    const result = resolve(report);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.identity.player.specName).toBe("Assassination");
    }
  });

  it("friendly_specs_length_mismatch_fails_closed", () => {
    // Misalignment would silently coach the right player as the wrong spec.
    expectFailure(
      reportWithFight({ friendlyPlayers: [15, 16], friendlySpecs: ["Assassination"] }),
      "UPSTREAM_DATA_INVALID",
    );
  });

  it("non_array_friendly_specs_fails_closed", () => {
    expectFailure(reportWithFight({ friendlySpecs: "Assassination" }), "UPSTREAM_DATA_INVALID");
  });

  it("non_integer_friendly_players_fails_closed", () => {
    expectFailure(
      reportWithFight({ friendlyPlayers: [15, "16"], friendlySpecs: ["Assassination", "Protection"] }),
      "UPSTREAM_DATA_INVALID",
    );
  });

  it("duplicate_source_id_in_friendly_players_fails_closed", () => {
    expectFailure(
      reportWithFight({
        friendlyPlayers: [15, 15, 16],
        friendlySpecs: ["Assassination", "Subtlety", "Protection"],
      }),
      "UPSTREAM_DATA_INVALID",
    );
  });

  it("selected_spec_that_is_blank_or_unknown_does_not_become_a_guess", () => {
    for (const spec of [null, "", "   ", "Unknown", 7]) {
      expectFailure(
        reportWithFight({ friendlyPlayers: [15, 16], friendlySpecs: [spec, "Protection"] }),
        "IDENTITY_UNRESOLVED",
        `spec=${JSON.stringify(spec)}`,
      );
    }
  });

  it("player_with_missing_name_or_class_is_never_partially_resolved", () => {
    const cases = [
      [{ id: 15, type: "Player", subType: "Rogue" }, "missing name"],
      [{ id: 15, name: null, type: "Player", subType: "Rogue" }, "null name"],
      [{ id: 15, name: "Coachtest", type: "Player" }, "missing class"],
      [{ id: 15, name: "Coachtest", type: "Player", subType: null }, "null class"],
      [{ id: 15, name: "   ", type: "Player", subType: "Rogue" }, "blank name"],
    ] as const;

    for (const [actor, label] of cases) {
      expectFailure(reportWithActors([actor]), "IDENTITY_UNRESOLVED", label);
    }
  });

  it("matched_actor_without_a_usable_type_fails_closed", () => {
    expectFailure(
      reportWithActors([{ id: 15, name: "Coachtest", subType: "Rogue" }]),
      "UPSTREAM_DATA_INVALID",
    );
  });

  it("null_game_version_still_resolves_identity", () => {
    // Nullable in the schema. Recorded honestly rather than invented, and not
    // fatal on its own.
    const result = resolve(reportWithMasterData({ gameVersion: null }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.identity.data.gameVersion).toBeNull();
      expect(result.identity.player.name).toBe("Coachtest");
    }
  });

  it("null_difficulty_still_resolves_identity", () => {
    const result = resolve(reportWithFight({ difficulty: null }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.identity.fight.difficulty).toBeNull();
    }
  });

  it("trash_fight_with_encounter_id_zero_still_resolves_identity", () => {
    const result = resolve(reportWithFight({ encounterID: 0, name: "Trash" }));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.identity.fight.encounterId).toBe(0);
    }
  });

  it("resolution_is_pure_and_repeatable", () => {
    const first = resolve(validReport());
    const second = resolve(validReport());

    expect(first).toEqual(second);
  });
});
