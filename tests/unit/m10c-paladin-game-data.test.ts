/**
 * M10-C: the pinned Protection Paladin game data.
 *
 * Two artifacts, both produced by the existing extractors under a
 * `paladin-protection` target from the SAME pinned commit as the Rogue data.
 * These tests pin their provenance and integrity, the lane of every ability
 * the evaluator classifies, the identity of every token it binds, and the
 * talent / hero-tree / apex facts the resolver reads — and that a fact the
 * datasets do not carry stays unknown.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import gcdArtifact from "../../src/data/game/paladin-protection-gcd-semantics.json";
import talentArtifact from "../../src/data/game/paladin-protection-talents.json";
import rogueGcdArtifact from "../../src/data/game/rogue-gcd-semantics.json";
import rogueTalentArtifact from "../../src/data/game/rogue-talents.json";
import { validateGcdSemanticsArtifact } from "../../src/data/game/gcd-semantics-artifact.js";
import { validateTalentArtifact } from "../../src/data/game/talent-artifact.js";
import {
  pinnedProtectionPaladinGcdSemantics,
  protectionBaseGcdMsForAbility,
  protectionExecutionLaneForAbility,
  protectionExecutionLaneForToken,
  protectionMetaActionLaneFor,
  protectionTokenBinding,
  protectionTokenByAbilityId,
  PROTECTION_PALADIN_GCD_DATASET_ID,
} from "../../src/data/game/paladin-protection-gcd-semantics.js";
import {
  pinnedProtectionPaladinTalents,
  protectionApexTraits,
  protectionHeroTrees,
  protectionModelledTalentNames,
  resolveProtectionApexTrait,
  resolveProtectionHeroTree,
  resolveProtectionModelledTalents,
  resolveProtectionTalent,
  PROTECTION_PALADIN_TALENT_DATASET_ID,
} from "../../src/data/game/paladin-protection-talents.js";
import { TARGETS as GCD_TARGETS } from "../../scripts/authority/extract-simc-gcd.mjs";
import { TARGETS as TALENT_TARGETS } from "../../scripts/authority/extract-simc-talents.mjs";
import {
  APEX_TIER_TWO_TREE,
  LIGHTSMITH_TREE,
  NO_HERO_TREE,
  TEMPLAR_TREE,
} from "../support/protection-paladin-fixture.js";

const PINNED_COMMIT = "33622e9d1662ff0e451691edf85a6b49cc9d11d9";

describe("the GCD-semantics artifact", () => {
  it("validates under the shared validator and loads through the Paladin module", () => {
    expect(validateGcdSemanticsArtifact(gcdArtifact).ok).toBe(true);
    const load = pinnedProtectionPaladinGcdSemantics();
    expect(load.ok).toBe(true);
    expect(gcdArtifact.datasetId).toBe(PROTECTION_PALADIN_GCD_DATASET_ID);
  });

  it("is pinned to the same commit, client build and DBC tables as the Rogue artifact", () => {
    expect(gcdArtifact.provenance.commitSha).toBe(PINNED_COMMIT);
    expect(gcdArtifact.artifactRevision).toBe("simc-33622e9d-1");
    expect(gcdArtifact.provenance.clientDataWowVersion).toBe(
      rogueGcdArtifact.provenance.clientDataWowVersion,
    );
    // The shared inputs are the same bytes: identical measured hashes.
    const byPath = (sources: readonly { path: string; sha256: string }[]) =>
      new Map(sources.map((source) => [source.path, source.sha256]));
    const rogue = byPath(rogueGcdArtifact.provenance.sources);
    const paladin = byPath(gcdArtifact.provenance.sources);
    for (const shared of [
      "engine/dbc/generated/sc_spell_data.inc",
      "engine/dbc/generated/class_spells.inc",
      "engine/dbc/generated/client_data_version.inc",
      "engine/dbc/spell_data.hpp",
      "engine/player/player.cpp",
      "engine/player/consumable.cpp",
    ]) {
      expect(paladin.get(shared), shared).toBe(rogue.get(shared));
    }
    // And the Paladin readings cite Paladin sources, hashed.
    expect(paladin.has("engine/class_modules/paladin/sc_paladin.cpp")).toBe(true);
    expect(paladin.has("engine/class_modules/paladin/sc_paladin_protection.cpp")).toBe(true);
    expect(paladin.has("engine/dbc/generated/racial_spells.inc")).toBe(true);
    expect(paladin.has("engine/class_modules/sc_rogue.cpp")).toBe(false);
  });

  it.each([
    [26573, "Consecration", 1500, "GCD_CONSUMING"],
    [31850, "Ardent Defender", 0, "NON_GCD"],
    [31884, "Avenging Wrath", 0, "NON_GCD"],
    [31935, "Avenger's Shield", 1500, "GCD_CONSUMING"],
    [53595, "Hammer of the Righteous", 1500, "GCD_CONSUMING"],
    [53600, "Shield of the Righteous", 0, "NON_GCD"],
    [62124, "Hand of Reckoning", 0, "NON_GCD"],
    [85673, "Word of Glory", 1500, "GCD_CONSUMING"],
    [155145, "Arcane Torrent", 1500, "GCD_CONSUMING"],
    [190784, "Divine Steed", 0, "NON_GCD"],
    [204018, "Blessing of Spellwarding", 1500, "GCD_CONSUMING"],
    [204019, "Blessed Hammer", 1500, "GCD_CONSUMING"],
    [265221, "Fireblood", 0, "NON_GCD"],
    [275779, "Judgment", 1500, "GCD_CONSUMING"],
    [375576, "Divine Toll", 1500, "GCD_CONSUMING"],
    [389539, "Sentinel", 0, "NON_GCD"],
    [427453, "Hammer of Light", 1500, "GCD_CONSUMING"],
    [432459, "Holy Bulwark", 1500, "GCD_CONSUMING"],
    [432472, "Sacred Weapon", 1500, "GCD_CONSUMING"],
    [1241413, "Hammer of Wrath", 1500, "GCD_CONSUMING"],
  ])("ability %i (%s) has base GCD %i ms, lane %s", (abilityGameId, displayNameEn, baseGcdMs, lane) => {
    const record = gcdArtifact.abilities.find((entry) => entry.abilityGameId === abilityGameId);
    expect(record?.displayNameEn).toBe(displayNameEn);
    expect(protectionBaseGcdMsForAbility(abilityGameId)).toBe(baseGcdMs);
    expect(protectionExecutionLaneForAbility(abilityGameId)).toBe(lane);
  });

  it("carries exactly twenty ability records, fourteen token bindings and four meta lanes", () => {
    // M10-C5 Phase B added Sacred Weapon 432472: the game records a Holy
    // Armaments press under the armament it produced.
    expect(gcdArtifact.abilities).toHaveLength(20);
    expect(gcdArtifact.tokenBindings).toHaveLength(14);
    expect(gcdArtifact.metaActionLanes.map((meta) => meta.simcToken)).toEqual([
      "auto_attack",
      "use_item",
      "use_items",
      "potion",
    ]);
  });

  it.each([
    ["divine_toll", [375576]],
    ["hammer_of_light", [427453]],
    ["shield_of_the_righteous", [53600]],
    ["hammer_of_wrath", [1241413]],
    ["judgment", [275779]],
    ["avengers_shield", [31935]],
    ["consecration", [26573]],
    ["hammer_of_the_righteous", [53595]],
    ["blessed_hammer", [204019]],
    ["arcane_torrent", [155145]],
    ["word_of_glory", [85673]],
    ["fireblood", [265221]],
  ])("token %s binds to exactly %j", (token, ids) => {
    const binding = protectionTokenBinding(token);
    expect(binding.kind).toBe("KNOWN_ONE");
    if (binding.kind === "KNOWN_ONE") expect([binding.abilityGameId]).toEqual(ids);
  });

  it("holy_armaments binds to the TWO armaments the press is recorded under, both GCD_CONSUMING", () => {
    const binding = protectionTokenBinding("holy_armaments");
    expect(binding.kind).toBe("KNOWN_SET");
    if (binding.kind === "KNOWN_SET") expect([...binding.abilityGameIds].sort()).toEqual([432459, 432472]);
    expect(protectionExecutionLaneForAbility(432472)).toBe("GCD_CONSUMING");
  });

  it("avenging_wrath binds to TWO records whose lanes agree, so the token's lane holds without the talent", () => {
    const binding = protectionTokenBinding("avenging_wrath");
    expect(binding.kind).toBe("KNOWN_SET");
    if (binding.kind === "KNOWN_SET") expect([...binding.abilityGameIds].sort()).toEqual([31884, 389539]);
    expect(protectionExecutionLaneForToken("avenging_wrath")).toBe("NON_GCD");
  });

  it("the meta-action lanes are NON_GCD and the Paladin auto_attack cites the Paladin module", () => {
    for (const token of ["auto_attack", "use_item", "use_items", "potion"]) {
      expect(protectionExecutionLaneForToken(token), token).toBe("NON_GCD");
    }
    expect(protectionMetaActionLaneFor("auto_attack")?.binding.sourcePath).toBe(
      "engine/class_modules/paladin/sc_paladin.cpp",
    );
    expect(protectionMetaActionLaneFor("auto_attack")?.binding.symbol).toBe(
      "auto_melee_attack_t::auto_melee_attack_t",
    );
  });

  it("every hand-reviewed binding cites a hashed Paladin, player or racial source", () => {
    const hashed = new Set(gcdArtifact.provenance.sources.map((source) => source.path));
    for (const binding of gcdArtifact.tokenBindings) {
      expect(hashed.has(binding.binding.sourcePath), binding.simcToken).toBe(true);
      expect(binding.binding.method).toBe("HAND_REVIEWED_CPP_CONTROL_FLOW");
      const source = gcdArtifact.provenance.sources.find((s) => s.path === binding.binding.sourcePath);
      expect(binding.binding.sourceSha256).toBe(source?.sha256);
    }
  });

  it("the inverse map names each bound ability once, and observed-only abilities are absent from it", () => {
    const byId = protectionTokenByAbilityId();
    expect(byId.get(275779)).toBe("judgment");
    expect(byId.get(53600)).toBe("shield_of_the_righteous");
    expect(byId.get(389539)).toBe("avenging_wrath");
    expect(byId.get(31884)).toBe("avenging_wrath");
    // Lane records without a token: classified, never bound.
    for (const observedOnly of [31850, 62124, 190784, 204018]) expect(byId.has(observedOnly)).toBe(false);
  });

  it("an ability the dataset does not carry has UNKNOWN_LANE, never a default", () => {
    expect(protectionBaseGcdMsForAbility(1297761)).toBeNull();
    expect(protectionExecutionLaneForAbility(1297761)).toBe("UNKNOWN_LANE");
    expect(protectionExecutionLaneForAbility(1)).toBe("UNKNOWN_LANE");
    expect(protectionTokenBinding("shield_of_vengeance").kind).toBe("UNKNOWN");
    expect(protectionExecutionLaneForToken("shield_of_vengeance")).toBe("UNKNOWN_LANE");
  });

  it("the committed artifact is what the extractor's paladin-protection target declares", () => {
    const target = GCD_TARGETS["paladin-protection"];
    const declared = target.requiredFacts.abilities
      .map((entry) => [entry.abilityGameId, entry.baseGcdMs, entry.displayNameEn])
      .sort((a, b) => Number(a[0]) - Number(b[0]));
    const committed = gcdArtifact.abilities.map((entry) => [
      entry.abilityGameId,
      entry.baseGcdMs,
      entry.displayNameEn,
    ]);
    expect(committed).toEqual(declared);
    expect(gcdArtifact.tokenBindings.map((b) => b.simcToken)).toEqual(
      target.requiredFacts.tokenBindings.map((b) => b.simcToken),
    );
    expect(target.datasetId).toBe(PROTECTION_PALADIN_GCD_DATASET_ID);
    // And the Rogue target is still the default, unchanged.
    expect(GCD_TARGETS["rogue-assassination"].datasetId).toBe(rogueGcdArtifact.datasetId);
  });
});

describe("the talent artifact", () => {
  it("validates, loads, and is pinned to the same commit and trait table as the Rogue artifact", () => {
    expect(validateTalentArtifact(talentArtifact).ok).toBe(true);
    expect(pinnedProtectionPaladinTalents().ok).toBe(true);
    expect(talentArtifact.datasetId).toBe(PROTECTION_PALADIN_TALENT_DATASET_ID);
    expect(talentArtifact.provenance.commitSha).toBe(PINNED_COMMIT);
    const traitData = (sources: readonly { path: string; sha256: string }[]) =>
      sources.find((source) => source.path === "engine/dbc/generated/trait_data.inc")?.sha256;
    expect(traitData(talentArtifact.provenance.sources)).toBe(
      traitData(rogueTalentArtifact.provenance.sources),
    );
  });

  it("carries the seven talents, two hero sub-trees and three apex tiers the target declares", () => {
    expect(protectionModelledTalentNames()).toEqual([
      "avenging_wrath",
      "blessed_assurance",
      "blessed_hammer",
      "divine_toll",
      "hammer_of_the_righteous",
      "righteous_protector",
      "sentinel",
    ]);
    expect(protectionHeroTrees().map((tree) => [tree.simcName, tree.subTreeId, tree.entries.length])).toEqual(
      [
        ["templar", 48, 17],
        ["lightsmith", 49, 18],
      ],
    );
    expect(
      protectionApexTraits().map((apex) => [apex.apexIndex, apex.traitEntryId, apex.selectionIndex]),
    ).toEqual([
      [1, 137022, 0],
      [2, 137021, 100],
      [3, 137020, 200],
    ]);
    const target = TALENT_TARGETS["paladin-protection"];
    expect(target.requiredTalents.map((t) => t.simcName).sort()).toEqual(protectionModelledTalentNames());
    expect(target.heroTrees).toEqual([
      { simcName: "templar", subTreeId: 48 },
      { simcName: "lightsmith", subTreeId: 49 },
    ]);
  });

  it("Blessed Hammer and Hammer of the Righteous are one choice node, each the other's alternative", () => {
    const blessed = talentArtifact.talents.find((t) => t.simcName === "blessed_hammer");
    const hammer = talentArtifact.talents.find((t) => t.simcName === "hammer_of_the_righteous");
    expect(blessed?.nodeType).toBe("CHOICE");
    expect(blessed?.traitNodeId).toBe(hammer?.traitNodeId);
    expect(blessed?.alternativeEntries.map((e) => e.traitEntryId)).toEqual([hammer?.traitEntryId]);
    expect(hammer?.alternativeEntries.map((e) => e.traitEntryId)).toEqual([blessed?.traitEntryId]);
  });

  it("the class-tree Divine Toll is the Protection row, not the Holy or Retribution one", () => {
    const divineToll = talentArtifact.talents.find((t) => t.simcName === "divine_toll");
    expect(divineToll?.tree).toBe("CLASS");
    expect(divineToll?.traitEntryId).toBe(136496);
    expect(divineToll?.traitNodeId).toBe(110006);
    expect(divineToll?.talentSpellId).toBe(375576);
  });

  it("stores no selection: the forbidden derived keys are absent", () => {
    const text = readFileSync("src/data/game/paladin-protection-talents.json", "utf8");
    for (const forbidden of ['"taken"', '"selected"', '"isSelected"']) expect(text).not.toContain(forbidden);
  });
});

describe("talent resolution over synthetic trees (SYNTHETIC premises, no captured coverage)", () => {
  it("resolves SELECTED from the talent's own entry, and NOT_SELECTED from a known sibling", () => {
    expect(resolveProtectionTalent(LIGHTSMITH_TREE, "blessed_hammer").selection).toBe("SELECTED");
    expect(resolveProtectionTalent(LIGHTSMITH_TREE, "hammer_of_the_righteous").selection).toBe(
      "NOT_SELECTED",
    );
    expect(resolveProtectionTalent(LIGHTSMITH_TREE, "hammer_of_the_righteous").reason).toBe(
      "ALTERNATIVE_ENTRY_SELECTED",
    );
    expect(resolveProtectionTalent(LIGHTSMITH_TREE, "righteous_protector").selection).toBe("SELECTED");
    expect(resolveProtectionTalent(LIGHTSMITH_TREE, "sentinel").selection).toBe("SELECTED");
  });

  it("an absent node is UNKNOWN, never NOT_SELECTED; an unmodelled name is UNKNOWN", () => {
    const withoutSentinel = LIGHTSMITH_TREE.filter((e) => e.id !== 102466);
    const resolution = resolveProtectionTalent(withoutSentinel, "sentinel");
    expect(resolution.selection).toBe("UNKNOWN");
    expect(resolution.reason).toBe("NODE_ABSENT");
    expect(resolveProtectionTalent(LIGHTSMITH_TREE, "consecrated_ground").reason).toBe("TALENT_NOT_MODELLED");
    // And the knownTalents binding OMITS the unknown one rather than stating false.
    const known = resolveProtectionModelledTalents(withoutSentinel);
    expect(known.find((t) => t.name === "sentinel")).toBeUndefined();
    expect(known.find((t) => t.name === "hammer_of_the_righteous")).toEqual({
      name: "hammer_of_the_righteous",
      taken: false,
    });
  });

  it("hero-tree membership resolves Lightsmith, Templar, unknown, and contradiction", () => {
    expect(resolveProtectionHeroTree(LIGHTSMITH_TREE)).toMatchObject({
      state: "RESOLVED",
      simcName: "lightsmith",
    });
    expect(resolveProtectionHeroTree(TEMPLAR_TREE)).toMatchObject({ state: "RESOLVED", simcName: "templar" });
    expect(resolveProtectionHeroTree(NO_HERO_TREE)).toEqual({ state: "UNKNOWN" });
    expect(resolveProtectionHeroTree([...LIGHTSMITH_TREE, ...TEMPLAR_TREE.slice(-2)])).toMatchObject({
      state: "CONTRADICTORY",
    });
  });

  it("apex.3 is SELECTED with its own entry, NOT_SELECTED at tier two, UNKNOWN with the node absent, and unmodelled past the table", () => {
    expect(resolveProtectionApexTrait(LIGHTSMITH_TREE, 3).selection).toBe("SELECTED");
    expect(resolveProtectionApexTrait(LIGHTSMITH_TREE, 3).decidedByEntryId).toBe(137020);
    const tierTwo = resolveProtectionApexTrait(APEX_TIER_TWO_TREE, 3);
    expect(tierTwo.selection).toBe("NOT_SELECTED");
    expect(tierTwo.reason).toBe("ALTERNATIVE_ENTRY_SELECTED");
    const noApex = LIGHTSMITH_TREE.filter((e) => e.nodeId !== 110418);
    expect(resolveProtectionApexTrait(noApex, 3).selection).toBe("UNKNOWN");
    expect(resolveProtectionApexTrait(noApex, 3).reason).toBe("NODE_ABSENT");
    expect(resolveProtectionApexTrait(LIGHTSMITH_TREE, 4).reason).toBe("TALENT_NOT_MODELLED");
  });
});
