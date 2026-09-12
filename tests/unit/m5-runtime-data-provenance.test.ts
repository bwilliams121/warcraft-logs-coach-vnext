import { describe, expect, it } from "vitest";

import { checkWireCompatibility } from "../../src/data/provenance.js";
import {
  RESOURCE_IDS,
  RESOURCE_WIRE_CONTRACTS,
  resourceWireTypeFor,
} from "../../src/data/wcl-wire/resource-types.js";
import {
  ROGUE_ABILITIES,
  ROGUE_ABILITY_DATA_PROVENANCE,
  abilityIdentityFor,
} from "../../src/data/game/rogue-abilities.js";

/**
 * Versioned static data and its provenance.
 *
 * Two axes, kept apart on purpose:
 *
 *     WIRE CONTRACT   what a Warcraft Logs number MEANS, scoped by parser
 *                     version, gated on keys the fight actually carries
 *     GAME DATA       what a game identifier IS, carrying build provenance and
 *                     NO fight-derived gate, because no such key exists
 */

describe("the combo-point wire contract", () => {
  it("declares exactly one resource, scoped to one parser version", () => {
    expect(RESOURCE_IDS).toEqual(["COMBO_POINTS"]);
    expect(RESOURCE_WIRE_CONTRACTS).toHaveLength(1);
    const contract = RESOURCE_WIRE_CONTRACTS[0];
    expect(contract?.wireType).toBe(4);
    expect(contract?.scope).toEqual({ gameVersion: 1, logVersion: 17 });
  });

  it("requires BOTH a game enum and a wire corroboration", () => {
    // A game enum is authoritative for the GAME. It cannot establish what a
    // third-party parser put on the wire, and the type makes declaring one
    // without the other impossible.
    const contract = RESOURCE_WIRE_CONTRACTS[0];
    expect(contract?.evidence.gameEnum.enumName).toBe("Enum.PowerType");
    expect(contract?.evidence.gameEnum.memberName).toBe("ComboPoints");
    expect(contract?.evidence.gameEnum.value).toBe(4);
    expect(contract?.evidence.gameEnum.gameBuild.length).toBeGreaterThan(0);
    expect(contract?.evidence.wireCorroboration.fixtureId).toBe("wcl-assassination-envenom-combo-points");
    expect(contract?.evidence.wireCorroboration.reportCode).toBe("A7R6kxPJ1hC8YQ4w");
    expect(contract?.evidence.wireCorroboration.reportRevision).toBe(30);
    expect(contract?.evidence.wireCorroboration.observation.length).toBeGreaterThan(0);
  });

  it("resolves inside the declared scope", () => {
    const resolution = resourceWireTypeFor("COMBO_POINTS", { gameVersion: 1, logVersion: 17 });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.wireType).toBe(4);
  });

  it.each([
    ["a later parser version", { gameVersion: 1, logVersion: 18 }, "LOG_VERSION_MISMATCH"],
    ["an earlier parser version", { gameVersion: 1, logVersion: 16 }, "LOG_VERSION_MISMATCH"],
    ["a different game", { gameVersion: 2, logVersion: 17 }, "GAME_VERSION_MISMATCH"],
    ["an unstated game", { gameVersion: null, logVersion: 17 }, "GAME_VERSION_ABSENT"],
  ])("fails closed under %s", (_label, keys, reason) => {
    const resolution = resourceWireTypeFor("COMBO_POINTS", keys);
    expect(resolution.ok).toBe(false);
    if (resolution.ok) return;
    expect(resolution.reason).toBe("INCOMPATIBLE_VERSION");
    if (resolution.reason !== "INCOMPATIBLE_VERSION") return;
    expect(resolution.outcome.compatible).toBe(false);
    if (resolution.outcome.compatible) return;
    expect(resolution.outcome.reason).toBe(reason);
  });

  it("treats an absent gameVersion as a refusal, never a wildcard", () => {
    // "We do not know which game this log came from" cannot license applying a
    // contract established for a specific one.
    const outcome = checkWireCompatibility(
      { gameVersion: null, logVersion: 17 },
      { gameVersion: 1, logVersion: 17 },
    );
    expect(outcome.compatible).toBe(false);
  });
});

describe("ability identity data", () => {
  it("holds only the mapping M5-A actually needs", () => {
    expect(ROGUE_ABILITIES).toHaveLength(1);
    expect(ROGUE_ABILITIES[0]?.simcToken).toBe("envenom");
    expect(ROGUE_ABILITIES[0]?.spellId).toBe(32_645);
  });

  it("resolves a SimulationCraft token to a number", () => {
    const resolution = abilityIdentityFor("envenom");
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(typeof resolution.identity.spellId).toBe("number");
  });

  it("carries build provenance", () => {
    expect(ROGUE_ABILITY_DATA_PROVENANCE.expansion.length).toBeGreaterThan(0);
    expect(ROGUE_ABILITY_DATA_PROVENANCE.gameBuild.length).toBeGreaterThan(0);
    expect(ROGUE_ABILITY_DATA_PROVENANCE.retrievedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("states why it carries no fight-derived applicability gate", () => {
    // CombatFight exposes no game-build key. A gate against one would always
    // pass while looking rigorous, so the absence is documented rather than
    // silently assumed.
    expect(ROGUE_ABILITY_DATA_PROVENANCE.applicabilityNote).toContain("no fight-derived");
  });
});
