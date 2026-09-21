/**
 * Blood Death Knight's pinned max-stack authority for Essence of the Blood
 * Queen (M11-B9): the raw DBC maximum, the ONE effect in the pinned client
 * data that raises it, and the build fact that establishes the modifier.
 *
 * WHAT THIS RECORDS, AND WHY IT IS NARROW
 *
 * The base maximum is a machine-extracted DBC field in
 * `deathknight-blood-aura-durations.json` (`maxStack`, the spell row's
 * `_max_stack`, column 28 of `sc_spell_data.inc`); this module does not
 * restate the number and the artifact is not reinterpreted: 5 IS the DBC
 * maximum of 433925. What the artifact cannot say is whether anything raises
 * that maximum for the actor. The M11-B9 pre-flight scanned every label
 * modifier in the pinned `sc_spell_data.inc` against label 3134 — which
 * exactly one spell carries, 433925 (`__spelllabel_data`, the one row
 * `{ 433925, 3134 }`) — and found the label-3134 modifier set to be: the
 * Blood specialization passive 137008 effect 16 (P_DURATION, the +5,000 ms
 * M11-B4 pinned), Gift of the San'layn 434153's six P_EFFECT_n value
 * amplifiers, and Frenzied Bloodthirst 434075's three effects, of which ONE
 * is a max-stack modifier:
 *
 *     effect 1123818, spell 434075, index 0, E_APPLY_AURA,
 *     A_ADD_FLAT_LABEL_MODIFIER (219), misc_value 37 = P_MAX_STACKS,
 *     misc_value_2 3134, base_value 2.0
 *
 * No other effect of any subtype names P_MAX_STACKS on label 3134, and
 * 433925's class-family flags are `{ 0, 0, 0, 0 }`, so no family-mask
 * modifier (107 / 108) can reach it. The talent has one rank
 * (`trait_data.inc:2932`: max_ranks 1), so the value does not scale.
 *
 * THE RUNTIME GAP THIS DOES NOT PAPER OVER. The pinned module parses the
 * talent — `parse_all_passive_talents()` at sc_death_knight.cpp:15163
 * registers 434075's passive effects, and player.cpp:15125 / 15851 map
 * P_MAX_STACKS to the passive field "max_stack" — but `buff_t` never reads
 * that field: `set_max_stack( -1 )` takes `data().max_stacks()` raw
 * (buff.cpp:974-976) and the only passive fields a buff reads are "duration"
 * (buff.cpp:863) and "period" (:1227). The sim's Essence therefore caps at 5
 * while the client's caps at 7, and `san_gift[3]`'s literal `stack<7` — which
 * the Unholy list writes as `stack<buff.essence_of_the_blood_queen.max_stack`
 * — is vacuous in the sim and a real "not at max" test in game. That is a
 * SimulationCraft omission, not evidence the modifier is absent; the corpus
 * (both subjects, Frenzied Bloodthirst selected, `applybuffstack 6` and `7`
 * on the wire, never 8) corroborates the DBC and does not establish it.
 *
 * THE MODIFIER IS A BUILD FACT, NEVER A COUNT. Frenzied Bloodthirst is a
 * San'layn hero talent on a NORMAL node with no alternative entry, so the
 * three-way rule can only answer SELECTED (its own entry observed) or UNKNOWN
 * — never NOT_SELECTED — and a build RESOLVED to Deathbringer cannot hold the
 * aura at all (`ownedByHeroTree`). The effective maximum is 7 exactly when the
 * talent is SELECTED; under UNKNOWN or CONTRADICTORY state it is UNKNOWN, and
 * an observed count above the raw 5 under an unproven modifier is REFUSED
 * (`COUNT_EXCEEDS_PINNED_MAX` in `aura-bindings.ts`): the wire may
 * corroborate the modifier, it may not establish it.
 *
 * NOT A FRAMEWORK. One aura's one modifier, recorded so the proof cites
 * bytes a reviewer can check. Bone Shield's observed 11 and 12 against its
 * artifact `maxStack` 10 are the same class of gap and are NOT covered here:
 * its exact-count rule never needed a maximum, and no guard is added for it.
 */

import { SC_DEATH_KNIGHT_CPP_SHA256, type BloodAuraClaim } from "./deathknight-blood-aura-authority.js";
import { SC_SPELL_DATA_INC_SHA256 } from "./deathknight-blood-rune-cost-authority.js";
import type { HeroTreeResolution, TalentResolution } from "./talent-selection.js";

/** The pinned `engine/dbc/generated/trait_data.inc`, as the talent artifact's provenance records it. */
export const TRAIT_DATA_INC_SHA256 = "7818328b2f870167cffefcb4e6571ec582dc3399064ac9d69a390d9becaa66b2";

/** The label 433925 carries, and the only spell that carries it. */
export const ESSENCE_OF_THE_BLOOD_QUEEN_LABEL = 3134;

/** One effect that raises an aura's maximum stack, and the build fact that establishes it. */
export interface BloodMaxStackModifier {
  readonly displayNameEn: string;
  /** The talent whose selection establishes the modifier, by the talent artifact's `simcName`. */
  readonly talentSimcName: string;
  readonly talentSpellId: number;
  readonly traitNodeEntryId: number;
  readonly traitNodeId: number;
  /** The `__spelleffect_data` row. */
  readonly effectId: number;
  /** `A_ADD_FLAT_LABEL_MODIFIER` on `P_MAX_STACKS`: the flat amount added to the DBC maximum. */
  readonly flatAdd: number;
  readonly label: number;
  readonly claims: readonly BloodAuraClaim[];
}

const MODULE = "engine/class_modules/sc_death_knight.cpp";
const SPELL_DATA = "engine/dbc/generated/sc_spell_data.inc";
const TRAIT_DATA = "engine/dbc/generated/trait_data.inc";

const claim = (sourcePath: string, sourceSha256: string, symbol: string, lines: string, text: string) => ({
  sourcePath,
  sourceSha256,
  symbol,
  lines,
  claim: text,
});

/** Frenzied Bloodthirst (434075): +2 max stacks on label 3134. */
export const FRENZIED_BLOODTHIRST_MAX_STACK_MODIFIER: BloodMaxStackModifier = {
  displayNameEn: "Frenzied Bloodthirst",
  talentSimcName: "frenzied_bloodthirst",
  talentSpellId: 434075,
  traitNodeEntryId: 117662,
  traitNodeId: 95065,
  effectId: 1123818,
  flatAdd: 2,
  label: ESSENCE_OF_THE_BLOOD_QUEEN_LABEL,
  claims: [
    claim(
      SPELL_DATA,
      SC_SPELL_DATA_INC_SHA256,
      "__spelleffect_data",
      "{ 1123818, 434075, 0, 6, 219, … 2.0000, 37, 3134, … }",
      "Effect 1123818 of spell 434075 (index 0, E_APPLY_AURA) is A_ADD_FLAT_LABEL_MODIFIER (219) with misc_value 37 " +
        "(P_MAX_STACKS, data_enums.hh property_type_t) and misc_value_2 3134, base_value 2.0: +2 maximum stacks on " +
        "every spell carrying label 3134. The talent's other two effects (1123820, 1310894) are P_EFFECT_2 / P_EFFECT_4 " +
        "value modifiers on the same label and touch no count.",
    ),
    claim(
      SPELL_DATA,
      SC_SPELL_DATA_INC_SHA256,
      "__spelllabel_data",
      "{ 433925, 3134 }",
      "Label 3134 is carried by exactly one spell in the pinned client data, Essence of the Blood Queen 433925, whose " +
        "row records _max_stack 5 and _proc_charges 0 (spell_data_t::initial_stacks() reads _proc_charges).",
    ),
    claim(
      TRAIT_DATA,
      TRAIT_DATA_INC_SHA256,
      "__trait_data",
      "2932",
      '{ 3, 6, 117662, 95065, 1, 1, 122674, 434075, … "Frenzied Bloodthirst", { 250, 252 }, …, 31, 0 }: a HERO-tree ' +
        "talent of class 6, trait node entry 117662 at node 95065, trait definition 122674, spell 434075, one rank, " +
        "San'layn sub-tree 31, node type NORMAL (no alternative entry).",
    ),
    claim(
      MODULE,
      SC_DEATH_KNIGHT_CPP_SHA256,
      "death_knight_t::init_spells; init_finished",
      "15111; 15163",
      '`talent.sanlayn.frenzied_bloodthirst = find_talent_spell( talent_tree::HERO, "Frenzied Bloodthirst" )` is the ' +
        "talent's only binding; `parse_all_passive_talents()` registers its passive effects, and no buff_t reads the " +
        'parsed "max_stack" field (buff.cpp:974-976 takes data().max_stacks() raw; get_passive_value is read for ' +
        '"duration" at :863 and "period" at :1227 only), so the pinned sim caps the aura at the DBC 5.',
    ),
  ],
};

export type BloodEffectiveMaxStack =
  | {
      readonly state: "RESOLVED";
      readonly maxStack: number;
      readonly baseMaxStack: number;
      /** The modifiers applied, by talent name; empty when the base stands on its own. */
      readonly appliedModifiers: readonly string[];
      readonly basis: string;
    }
  | {
      readonly state: "UNKNOWN";
      readonly baseMaxStack: number;
      readonly reason: "MODIFIER_TALENT_UNRESOLVED" | "HERO_TREE_UNRESOLVED";
      readonly basis: string;
    };

/**
 * The effective maximum of an aura whose DBC maximum `baseMaxStack` is raised
 * by `modifiers` — each established by ONE talent's selection.
 *
 *     every modifier's talent SELECTED       -> base + sum of flatAdd
 *     a modifier's talent NOT_SELECTED       -> that modifier is absent
 *     the aura's hero tree RESOLVED away     -> the aura itself is impossible;
 *                                              the base stands (nothing to add)
 *     otherwise                              -> UNKNOWN
 *
 * Nothing here reads an aura event: an observed count of 6 or 7 does not
 * prove the modifier, and an observed count is checked AGAINST this result,
 * never used to form it.
 */
export function bloodEffectiveMaxStack(input: {
  readonly baseMaxStack: number;
  readonly modifiers: readonly BloodMaxStackModifier[];
  readonly ownedByHeroTree: "sanlayn" | "deathbringer" | null;
  readonly talents: Readonly<Record<string, TalentResolution>>;
  readonly heroTree: HeroTreeResolution;
}): BloodEffectiveMaxStack {
  const { baseMaxStack, modifiers, talents, heroTree } = input;
  if (modifiers.length === 0) {
    return {
      state: "RESOLVED",
      maxStack: baseMaxStack,
      baseMaxStack,
      appliedModifiers: [],
      basis: `the DBC maximum ${String(baseMaxStack)}; no pinned modifier raises it`,
    };
  }
  if (
    input.ownedByHeroTree !== null &&
    heroTree.state === "RESOLVED" &&
    heroTree.simcName !== input.ownedByHeroTree
  ) {
    return {
      state: "RESOLVED",
      maxStack: baseMaxStack,
      baseMaxStack,
      appliedModifiers: [],
      basis:
        `the observed build resolved to the '${heroTree.simcName}' sub-tree, which owns neither the aura nor its ` +
        `modifier talent(s); the DBC maximum ${String(baseMaxStack)} stands`,
    };
  }
  let maxStack = baseMaxStack;
  const applied: string[] = [];
  for (const modifier of modifiers) {
    const talent = talents[modifier.talentSimcName];
    if (talent === undefined || talent.selection === "UNKNOWN") {
      return {
        state: "UNKNOWN",
        baseMaxStack,
        reason: "MODIFIER_TALENT_UNRESOLVED",
        basis:
          `talent '${modifier.talentSimcName}' (+${String(modifier.flatAdd)} max stacks, effect ${String(modifier.effectId)}) ` +
          `is ${talent === undefined ? "not modelled" : `UNKNOWN (${talent.reason})`}; the DBC maximum ` +
          `${String(baseMaxStack)} may or may not be raised, and no observed count decides it`,
      };
    }
    if (talent.selection === "SELECTED") {
      maxStack += modifier.flatAdd;
      applied.push(modifier.talentSimcName);
    }
  }
  return {
    state: "RESOLVED",
    maxStack,
    baseMaxStack,
    appliedModifiers: applied,
    basis:
      applied.length === 0
        ? `every pinned modifier talent resolved NOT_SELECTED; the DBC maximum ${String(baseMaxStack)} stands`
        : `the DBC maximum ${String(baseMaxStack)} plus ${applied
            .map((name) => {
              const modifier = modifiers.find((entry) => entry.talentSimcName === name);
              return `${name} (+${String(modifier?.flatAdd ?? 0)}, effect ${String(modifier?.effectId ?? 0)}, SELECTED by entry ${String(talents[name]?.decidedByEntryId ?? "?")})`;
            })
            .join(" and ")} = ${String(maxStack)}`,
  };
}

const MODIFIERS_BY_ATOM: Readonly<Record<string, readonly BloodMaxStackModifier[]>> = {
  essence_of_the_blood_queen: [FRENZIED_BLOODTHIRST_MAX_STACK_MODIFIER],
};

/** The pinned max-stack modifiers of one atom's aura; empty for an atom this module does not cover. */
export function bloodMaxStackModifiersFor(atomName: string): readonly BloodMaxStackModifier[] {
  return MODIFIERS_BY_ATOM[atomName] ?? [];
}
