import { describe, expect, it } from "vitest";

import {
  passiveEffectMatch,
  structBody,
  type AuraEffect,
  type SpellRecord,
} from "../../scripts/authority/extract-simc-ability-cooldowns.mjs";
import artifact from "../../src/data/game/paladin-protection-cooldowns.json";

/**
 * The cooldown extractor's census rules (M10-C5): how a passive aura effect
 * is matched to a target spell, mirroring player.cpp
 * `spells_affected_by_passive`, and what the committed artifact records.
 */

const spell = (overrides: Partial<SpellRecord>): SpellRecord => ({
  spellId: 1,
  nameEn: "x",
  cooldownMs: 60_000,
  categoryCooldownMs: 0,
  category: 0,
  categoryTypeMask: 0,
  charges: 0,
  chargeCooldownMs: 0,
  internalCooldownMs: 0,
  gcdMs: 1500,
  classFamily: 10,
  classFlags: [0, 0, 0, 0],
  attributes: [0x40, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  ...overrides,
});
const effect = (overrides: Partial<AuraEffect>): AuraEffect => ({
  effectId: 1,
  spellId: 2,
  index: 0,
  type: 6,
  subtype: 107,
  baseValue: -15_000,
  miscValue1: 11,
  miscValue2: 0,
  classFlags: [0, 0, 0, 0],
  ...overrides,
});

describe("passive effect matching", () => {
  const target = spell({ spellId: 375576, classFlags: [134217728, 16384, 268435458, 0] });

  it("a flat/pct modifier matches by class family flags and only for the cooldown property", () => {
    const owner = spell({ spellId: 379391 });
    expect(passiveEffectMatch(effect({ classFlags: [0, 16384, 0, 0] }), owner, target, [])).toBe(
      "CLASS_FLAGS",
    );
    expect(passiveEffectMatch(effect({ classFlags: [0, 1, 0, 0] }), owner, target, [])).toBeNull();
    // Property 1 is duration, not cooldown: Sanctified Wrath's effect is not a cooldown modifier.
    expect(
      passiveEffectMatch(effect({ classFlags: [0, 16384, 0, 0], miscValue1: 1 }), owner, target, []),
    ).toBeNull();
    // A different class family never matches, whatever the flags.
    expect(
      passiveEffectMatch(effect({ classFlags: [0, 16384, 0, 0] }), spell({ classFamily: 8 }), target, []),
    ).toBeNull();
  });

  it("label, category and category-mask subtypes match the way the parser matches them", () => {
    const owner = spell({ spellId: 3 });
    expect(passiveEffectMatch(effect({ subtype: 219, miscValue2: 16 }), owner, target, [16, 26])).toBe(
      "LABEL:16",
    );
    expect(passiveEffectMatch(effect({ subtype: 219, miscValue2: 99 }), owner, target, [16, 26])).toBeNull();
    const categorised = spell({ category: 1550, categoryTypeMask: 0 });
    expect(passiveEffectMatch(effect({ subtype: 341, miscValue1: 1550 }), owner, categorised, [])).toBe(
      "CATEGORY:1550",
    );
    expect(passiveEffectMatch(effect({ subtype: 341, miscValue1: 1550 }), owner, target, [])).toBeNull();
    // A category-mask subtype cannot reach a spell whose category type mask is 0.
    expect(passiveEffectMatch(effect({ subtype: 205, miscValue1: 32 }), owner, categorised, [])).toBeNull();
    expect(
      passiveEffectMatch(
        effect({ subtype: 205, miscValue1: 32 }),
        owner,
        spell({ categoryTypeMask: 37 }),
        [],
      ),
    ).toBe("CATEGORY_MASK:32");
    // An unrelated subtype is never a cooldown modifier.
    expect(passiveEffectMatch(effect({ subtype: 79 }), owner, target, [])).toBeNull();
  });

  it("finds a struct body up to its closing brace at column 0", () => {
    const text = ["struct a_t : public b_t", "{", "  int x;", "};", "", "struct c_t", "{", "};"].join("\n");
    expect(structBody(text, "a_t")).toEqual({
      startLine: 1,
      endLine: 4,
      text: "struct a_t : public b_t\n{\n  int x;\n};",
    });
    expect(structBody(text, "c_t")?.startLine).toBe(6);
    expect(structBody(text, "d_t")).toBeNull();
  });
});

describe("the committed artifact", () => {
  it("records the census inputs, the property rule and every source hash", () => {
    expect(artifact.datasetId).toBe("SIMC_DBC_PALADIN_PROTECTION_ABILITY_COOLDOWNS");
    expect(artifact.provenance.commitSha).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    expect(artifact.provenance.sources.map((source) => source.path)).toEqual([
      "engine/dbc/generated/sc_spell_data.inc",
      "engine/dbc/spell_data.hpp",
      "engine/dbc/generated/trait_data.inc",
      "engine/dbc/trait_data.hpp",
      // M10-C5 Phase B: the spec and class passives parse_all_class_passives reads.
      "engine/dbc/generated/specialization_spells.inc",
      "engine/dbc/generated/class_spells.inc",
      "engine/dbc/generated/client_data_version.inc",
      "engine/dbc/data_enums.hh",
      "engine/player/player.cpp",
      "engine/action/action.cpp",
      "engine/class_modules/paladin/sc_paladin.cpp",
      "engine/class_modules/paladin/sc_paladin.hpp",
      "engine/class_modules/paladin/sc_paladin_protection.cpp",
      // M10-C5 Phase B2 audit: the ground-effect lifetime a `<x>.up` expression reads.
      "engine/player/ground_aoe.hpp",
      "engine/player/ground_aoe.cpp",
    ]);
    for (const ability of artifact.abilities) {
      const census = ability.passiveModifierCensus;
      expect(census.method).toBe("MACHINE_CENSUS_OF_PASSIVE_TRAIT_EFFECTS");
      expect(census.classId).toBe(2);
      expect(census.traitRowsExamined).toBeGreaterThan(200);
      expect(census.effectRowsExamined).toBeGreaterThan(1000);
      expect(census.subtypesChecked).toContain("107:A_ADD_FLAT_MODIFIER");
      expect(census.subtypesChecked).toContain("416:A_HASTED_COOLDOWN");
      expect(ability.dynamicModifierPolicy.method).toBe("HAND_REVIEWED_CPP_ABSENCE_PROOF");
      for (const check of ability.dynamicModifierPolicy.checks) {
        expect(check.finding.length).toBeGreaterThan(20);
      }
    }
  });
});
