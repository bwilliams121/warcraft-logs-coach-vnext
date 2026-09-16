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
import { pinnedRogueDotDurations } from "../../src/data/game/rogue-dot-durations.js";

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

/**
 * RE-POINTED for M5-B: looked up by `resourceId`, never by array position.
 *
 * These assertions used to read `RESOURCE_WIRE_CONTRACTS[0]`. That was fine
 * while there was one contract and becomes a silent hazard the moment there are
 * two — adding a third at the front would leave every assertion below passing
 * against the wrong row. Looking up by identity cannot drift.
 */
function contractFor(resourceId: string) {
  const contract = RESOURCE_WIRE_CONTRACTS.find((entry) => entry.resourceId === resourceId);
  if (contract === undefined) throw new Error(`no wire contract declared for ${resourceId}`);
  return contract;
}

describe("the declared wire contracts", () => {
  it("declares exactly the modelled resources, each scoped to one parser version", () => {
    expect(RESOURCE_IDS).toEqual(["COMBO_POINTS", "ENERGY", "HOLY_POWER"]);
    expect(RESOURCE_WIRE_CONTRACTS).toHaveLength(3);
    for (const contract of RESOURCE_WIRE_CONTRACTS) {
      expect(contract.scope).toEqual({ gameVersion: 1, logVersion: 17 });
    }
    expect(contractFor("COMBO_POINTS").wireType).toBe(4);
    expect(contractFor("ENERGY").wireType).toBe(3);
    // M10-B: corroborated by a Protection Paladin capture, never by the enum alone.
    expect(contractFor("HOLY_POWER").wireType).toBe(9);
  });

  it("declares one wire type per resource and one resource per wire type", () => {
    // Two resources sharing a wire type, or one resource claiming two, would
    // make the mapping ambiguous in a way `resourceWireTypeFor` could not
    // report.
    const wireTypes = RESOURCE_WIRE_CONTRACTS.map((entry) => entry.wireType);
    const resourceIds = RESOURCE_WIRE_CONTRACTS.map((entry) => entry.resourceId);
    expect(new Set(wireTypes).size).toBe(wireTypes.length);
    expect(new Set(resourceIds).size).toBe(resourceIds.length);
  });

  it("requires BOTH a game enum and a wire corroboration, for every contract", () => {
    // A game enum is authoritative for the GAME. It cannot establish what a
    // third-party parser put on the wire, and the type makes declaring one
    // without the other impossible.
    for (const contract of RESOURCE_WIRE_CONTRACTS) {
      expect(contract.evidence.gameEnum.enumName).toBe("Enum.PowerType");
      expect(contract.evidence.gameEnum.value).toBe(contract.wireType);
      expect(contract.evidence.gameEnum.gameBuild.length).toBeGreaterThan(0);
      expect(["wcl-assassination-envenom-combo-points", "wcl-protection-paladin-a7r6-opener"]).toContain(
        contract.evidence.wireCorroboration.fixtureId,
      );
      expect(contract.evidence.wireCorroboration.reportCode).toBe("A7R6kxPJ1hC8YQ4w");
      expect(contract.evidence.wireCorroboration.reportRevision).toBe(30);
      expect(contract.evidence.wireCorroboration.observation.length).toBeGreaterThan(0);
    }
    expect(contractFor("COMBO_POINTS").evidence.gameEnum.memberName).toBe("ComboPoints");
    expect(contractFor("ENERGY").evidence.gameEnum.memberName).toBe("Energy");
    expect(contractFor("HOLY_POWER").evidence.gameEnum.memberName).toBe("HolyPower");
    // The Holy Power corroboration cites the Protection Paladin slice, which
    // is where the specialization-specific observation lives.
    expect(contractFor("HOLY_POWER").evidence.wireCorroboration.fixtureId).toBe(
      "wcl-protection-paladin-a7r6-opener",
    );
    expect(contractFor("HOLY_POWER").evidence.wireCorroboration.observation).toContain("Protection Paladin");
  });

  it("records the Hunter discriminator in the Energy corroboration", () => {
    // Focus is enum 2 and Energy is enum 3. The capture showing the Hunter on 2
    // and never on 3 is what makes the adjacent-value confusion testable rather
    // than assumed, so the evidence string has to actually contain it.
    const observation = contractFor("ENERGY").evidence.wireCorroboration.observation;
    expect(observation).toContain("Hunter");
    expect(observation).toContain("type 2");
  });

  it.each([
    ["COMBO_POINTS", 4],
    ["ENERGY", 3],
  ] as const)("resolves %s inside the declared scope", (resourceId, wireType) => {
    const resolution = resourceWireTypeFor(resourceId, { gameVersion: 1, logVersion: 17 });
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) return;
    expect(resolution.wireType).toBe(wireType);
  });

  it.each([
    ["a later parser version", { gameVersion: 1, logVersion: 18 }, "LOG_VERSION_MISMATCH"],
    ["an earlier parser version", { gameVersion: 1, logVersion: 16 }, "LOG_VERSION_MISMATCH"],
    ["a different game", { gameVersion: 2, logVersion: 17 }, "GAME_VERSION_MISMATCH"],
    ["an unstated game", { gameVersion: null, logVersion: 17 }, "GAME_VERSION_ABSENT"],
  ])("fails closed for ENERGY under %s", (_label, keys, reason) => {
    const resolution = resourceWireTypeFor("ENERGY", keys);
    expect(resolution.ok).toBe(false);
    if (resolution.ok) return;
    expect(resolution.reason).toBe("INCOMPATIBLE_VERSION");
    if (resolution.reason !== "INCOMPATIBLE_VERSION") return;
    expect(resolution.outcome.compatible).toBe(false);
    if (resolution.outcome.compatible) return;
    expect(resolution.outcome.reason).toBe(reason);
  });
});

describe("the combo-point wire contract", () => {
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
  it("holds only the mappings a supported decision actually needs", () => {
    // Enumerated rather than counted, and each entry names the decision that
    // required it. A new row has to be justified here, which is the point — the
    // guard is against a spell database, not against the number two.
    //
    //   envenom  M5-A   the `spend` sub-list selects it
    //   garrote  M5-C3a the `core_dot` sub-list selects it
    //   rupture  M5-D1  `core_dot[3]` became evaluable and can select it
    //
    // `mutilate` and `fan_of_knives` are cast hundreds of times in the verified
    // capture and are deliberately ABSENT: every builder entry is gated on
    // `spell_targets.fan_of_knives`, so no supported decision can select them.
    expect(ROGUE_ABILITIES.map((ability) => ability.simcToken)).toEqual(["envenom", "garrote", "rupture"]);
    expect(ROGUE_ABILITIES.map((ability) => ability.spellId)).toEqual([32_645, 703, 1_943]);
  });

  it("agrees with the machine-extracted Garrote identity, which is the other record of it", () => {
    // 703 appears here AND in `rogue-dot-durations.json`, where it was extracted
    // from the pinned specialization-spell table rather than typed. Two records
    // of one fact can drift; this is what stops them.
    const loaded = pinnedRogueDotDurations();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const extracted = loaded.artifact.dots.find((dot) => dot.simcToken === "garrote");
    const handWritten = ROGUE_ABILITIES.find((ability) => ability.simcToken === "garrote");
    expect(extracted?.abilityGameId).toBe(handWritten?.spellId);
    expect(extracted?.displayNameEn).toBe(handWritten?.displayNameEn);
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
