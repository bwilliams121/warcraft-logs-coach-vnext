/**
 * The Protection Warrior atom resolver (ONB-A2).
 *
 * The specialization-owned half of the resolver seam. Every value it binds is a positive claim
 * with a named source; everything it cannot establish stays unbound or UNKNOWN, and the shared
 * evaluator enumerates an unbound truth and refuses an unbound magnitude.
 *
 * ONE HERO TREE, AND WHAT IT PROVES. A character has one active hero tree, so a build whose
 * observed entries resolve to one tree has none of the other tree's talents
 * (`PROTECTION_WARRIOR_HERO_TREE_TALENTS`). That is a positive reading of the resolved tree, the
 * same proof Havoc's evaluator uses, and the only one beyond the three-way talent rule.
 *
 * WHAT STAYS REFUSED: see `vocabulary.ts`. The binding is explicit so a reader of the
 * diagnostics sees WHICH magnitude was refused, never an absence that could be mistaken for zero.
 */

import { unknownNumber, type NumericBinding } from "../../../simc/expression/evaluate.js";
import type { SpecAtomBinding, SpecAtomBindings } from "../../../simc/expression/spec-vocabulary.js";
import type { HeroTreeResolution, TalentResolution } from "../../../data/game/talent-selection.js";
import {
  HERO_TREE_COLOSSUS,
  HERO_TREE_MOUNTAIN_THANE,
  BOOMING_VOICE_ENABLED,
  JAVELINEER_ENABLED,
  MASSACRE_ENABLED,
  SNAP_INDUCTION_ENABLED,
  HEAVY_HANDED_ENABLED,
  RAGE,
  RAGE_DEFICIT,
  PROTECTION_WARRIOR_ATOM_VOCABULARY,
  PROTECTION_WARRIOR_UNBOUND_NUMERIC_ATOMS,
} from "./vocabulary.js";

/** Each hero tree's pinned talents the list reads or an action is built on. */
export const PROTECTION_WARRIOR_HERO_TREE_TALENTS: Readonly<Record<string, readonly string[]>> =
  Object.freeze({ mountain_thane: ["lightning_strikes", "snap_induction"], colossus: ["demolish"] });

export interface ProtectionWarriorResolverInput {
  readonly heroTree: HeroTreeResolution;
  /** Every modelled talent's three-way resolution, by name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
  /** `rage`: the decision cast's own PRE_COST RAGE, or a refusal in the binding's own words. */
  readonly rage: NumericBinding;
  /** `rage.deficit`: the decision cast's own PRE_COST RAGE, or a refusal in the binding's own words. */
  readonly rageDeficit: NumericBinding;
}

export interface ProtectionWarriorResolverDiagnostics {
  readonly heroTreeBound: string | null;
  readonly rage: NumericBinding;
  readonly rageDeficit: NumericBinding;
}

export interface ProtectionWarriorResolution {
  readonly specAtoms: SpecAtomBindings;
  readonly diagnostics: ProtectionWarriorResolverDiagnostics;
}

function truth(key: string, value: boolean): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "TRUTH", value } };
}

function magnitude(key: string, binding: NumericBinding): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "MAGNITUDE", binding } };
}

/** The talents a resolved hero tree proves not taken: every other tree's. */
export function protectionWarriorTalentsDisprovedByHeroTree(heroTree: HeroTreeResolution): readonly string[] {
  if (heroTree.state !== "RESOLVED") return [];
  return Object.entries(PROTECTION_WARRIOR_HERO_TREE_TALENTS).flatMap(([tree, talents]) =>
    tree === heroTree.simcName ? [] : talents,
  );
}

/** Binds every declared atom this evidence supports; leaves the rest unbound. */
export function resolveProtectionWarriorAtoms(
  input: ProtectionWarriorResolverInput,
): ProtectionWarriorResolution {
  const bound: SpecAtomBinding[] = [];

  if (input.heroTree.state === "RESOLVED") {
    bound.push(truth(HERO_TREE_COLOSSUS, input.heroTree.simcName === "colossus"));
    bound.push(truth(HERO_TREE_MOUNTAIN_THANE, input.heroTree.simcName === "mountain_thane"));
  }

  const enabledAtoms: readonly (readonly [string, string])[] = [
    [BOOMING_VOICE_ENABLED, "booming_voice"],
    [JAVELINEER_ENABLED, "javelineer"],
    [MASSACRE_ENABLED, "massacre"],
    [SNAP_INDUCTION_ENABLED, "snap_induction"],
    [HEAVY_HANDED_ENABLED, "heavy_handed"],
  ];
  for (const [key, name] of enabledAtoms) {
    if (input.talents[name]?.selection === "SELECTED") bound.push(truth(key, true));
    else if (input.talentsProvenAbsent.has(name)) bound.push(truth(key, false));
  }

  bound.push(magnitude(RAGE, input.rage));
  bound.push(magnitude(RAGE_DEFICIT, input.rageDeficit));
  for (const key of PROTECTION_WARRIOR_UNBOUND_NUMERIC_ATOMS) {
    bound.push(magnitude(key, unknownNumber("STATE_NOT_MODELLED")));
  }

  return {
    specAtoms: { vocabulary: PROTECTION_WARRIOR_ATOM_VOCABULARY, bound },
    diagnostics: {
      heroTreeBound: input.heroTree.state === "RESOLVED" ? input.heroTree.simcName : null,
      rage: input.rage,
      rageDeficit: input.rageDeficit,
    },
  };
}
