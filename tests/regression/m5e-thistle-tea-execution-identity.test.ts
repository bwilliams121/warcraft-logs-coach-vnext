/**
 * Thistle Tea binds to the spell that EXECUTES, not to the talent that triggers it.
 *
 * THE DEBT THIS CLOSES
 *
 * The token's binding listed two candidate ability ids, 381623 and 469779, on
 * the reading that a talent branch made either reachable. Only one of them can
 * ever be cast. `rogue_t::init_spells` reads:
 *
 *     spell.thistle_tea = talent.rogue.thistle_tea_auto->ok()
 *       ? talent.rogue.thistle_tea_auto->effectN( 1 ).trigger()
 *       : ( talent.rogue.thistle_tea_ability->ok() ? talent.rogue.thistle_tea_ability : not_found() );
 *
 * `thistle_tea_auto` IS 469779, and the taken branch does not use it — it uses
 * what its first effect TRIGGERS. The other branch is 381623 directly. So both
 * branches execute 381623, and 469779 is a talent record the player never casts.
 *
 * WHY IT WAS NOT JUST DELETED
 *
 * A hand-removed id is a claim with no evidence behind it. The extractor now
 * reads `__spelleffect_data` from the same pinned generated file it already
 * hashes, derives the `_trigger_spell_id` column from the struct declaration,
 * and FAILS EXTRACTION if 469779 effect 0 does not trigger 381623. The id is
 * resolved, and the resolution is recorded in the artifact.
 *
 * WHAT MUST NOT CHANGE
 *
 * Both candidates were off-GCD, so this is a provenance correction and not a
 * behaviour change. The lane assertions below are the guard on that.
 */

import { describe, expect, it } from "vitest";

import {
  executionLaneForAbility,
  executionLaneForToken,
  pinnedRogueGcdSemantics,
  resolveTokenBinding,
} from "../../src/data/game/ability-gcd-semantics.js";
import { transitionAbilityIdsFor } from "../../src/data/game/assassination-transition-authority.js";
import { deriveEffectFieldIndices, parseEffectTriggers } from "../../scripts/authority/extract-simc-gcd.mjs";

const THISTLE_TEA_EXECUTED = 381_623;
const THISTLE_TEA_TALENT = 469_779;

const load = pinnedRogueGcdSemantics();
if (!load.ok) throw new Error("the pinned GCD semantics artifact must load");
const binding = load.artifact.tokenBindings.find((entry) => entry.simcToken === "thistle_tea");

describe("the execution identity is the triggered spell", () => {
  it("binds thistle_tea to exactly one executable ability", () => {
    expect(binding?.candidateAbilityGameIds).toEqual([THISTLE_TEA_EXECUTED]);
    const resolved = resolveTokenBinding("thistle_tea");
    expect(resolved.kind).toBe("KNOWN_ONE");
    if (resolved.kind !== "KNOWN_ONE") return;
    expect(resolved.abilityGameId).toBe(THISTLE_TEA_EXECUTED);
  });

  it("no longer offers the talent record as an execution identity", () => {
    expect(binding?.candidateAbilityGameIds).not.toContain(THISTLE_TEA_TALENT);
  });

  it("records the talent record as a RESOLUTION rather than dropping it", () => {
    // The id is still in the artifact, with the derivation that removed it from
    // the candidate list. A reader can check the claim instead of trusting it.
    expect(binding?.executionResolutions).toHaveLength(1);
    const resolution = binding?.executionResolutions?.[0];
    expect(resolution?.declaredSpellId).toBe(THISTLE_TEA_TALENT);
    expect(resolution?.resolvedAbilityGameId).toBe(THISTLE_TEA_EXECUTED);
    expect(resolution?.effectIndex).toBe(0);
    expect(resolution?.method).toBe("MACHINE_EXTRACTED_EFFECT_TRIGGER");
  });

  it("cites the generated spell data the trigger was read from, with a measured hash", () => {
    const resolution = binding?.executionResolutions?.[0];
    expect(resolution?.sourcePath).toBe("engine/dbc/generated/sc_spell_data.inc");
    expect(resolution?.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps the hand-reviewed C++ binding provenance pinned and unchanged", () => {
    expect(binding?.binding.method).toBe("HAND_REVIEWED_CPP_CONTROL_FLOW");
    expect(binding?.binding.sourcePath).toBe("engine/class_modules/sc_rogue.cpp");
    expect(binding?.binding.sourceSha256).toBe(
      "209e95265aae4168cf7cda57d1b241dda6361971ba6849a9262bd933bff3e13e",
    );
    expect(binding?.binding.symbol).toBe("rogue_t::init_spells");
    expect(binding?.binding.startLine).toBe(10_237);
    expect(binding?.binding.endLine).toBe(10_238);
  });
});

describe("the lane is unchanged, which is what makes this safe", () => {
  it("keeps thistle_tea off the GCD", () => {
    expect(executionLaneForToken("thistle_tea")).toBe("NON_GCD");
  });

  it("agrees on the lane for both the executed and the talent record", () => {
    // The reason this correction could not change behaviour: the two records
    // never disagreed about the lane in the first place.
    expect(executionLaneForAbility(THISTLE_TEA_EXECUTED)).toBe("NON_GCD");
    expect(executionLaneForAbility(THISTLE_TEA_TALENT)).toBe("NON_GCD");
  });

  it("points the NON_GCD transition contract at the executable spell only", () => {
    expect(transitionAbilityIdsFor("thistle_tea")).toEqual([THISTLE_TEA_EXECUTED]);
  });
});

describe("the trigger relation is derived from pinned data, not asserted", () => {
  const HEADER = [
    "struct spelleffect_data_t",
    "{",
    "  unsigned         _id;",
    "  unsigned         _spell_id;",
    "  unsigned         _index;",
    "  unsigned         _misc_value_2;",
    "  unsigned         _class_flags[NUM_CLASS_FAMILY_FLAGS];",
    "  unsigned         _trigger_spell_id;",
    "  const spell_data_t* spell() const;",
    "};",
  ].join("\n");

  it("derives the effect field indices from the struct declaration", () => {
    const derived = deriveEffectFieldIndices(HEADER);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.spellIdIndex).toBe(1);
    expect(derived.effectIndexIndex).toBe(2);
    // The array member occupies ONE braced slot, which is why the trigger index
    // is 5 rather than 8. Getting this wrong reads a neighbouring column.
    expect(derived.triggerSpellIdIndex).toBe(5);
  });

  it("refuses a header that does not declare the struct", () => {
    const derived = deriveEffectFieldIndices("struct spelleffect_data_t;");
    expect(derived.ok).toBe(false);
  });

  it("reads a trigger id out of a generated row", () => {
    const derived = deriveEffectFieldIndices(HEADER);
    if (!derived.ok) return;
    const table = [
      "static spelleffect_data_t __spelleffect_data[1] = {",
      `  { 1184332, ${String(THISTLE_TEA_TALENT)}, 0, 0, { 0, 0, 0, 0 }, ${String(THISTLE_TEA_EXECUTED)} },`,
      "};",
    ].join("\n");
    const parsed = parseEffectTriggers(table, [THISTLE_TEA_TALENT], derived);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.bySpell.get(THISTLE_TEA_TALENT)?.get(0)).toBe(THISTLE_TEA_EXECUTED);
  });

  it("refuses a payload with no effect table rather than returning nothing found", () => {
    const derived = deriveEffectFieldIndices(HEADER);
    if (!derived.ok) return;
    const parsed = parseEffectTriggers("// no table here", [THISTLE_TEA_TALENT], derived);
    expect(parsed.ok).toBe(false);
  });
});
