/**
 * The Fury Warrior atom resolver (ONB-A2).
 *
 * The specialization-owned half of the resolver seam. Every value it binds is a positive claim
 * with a named source; everything it cannot establish stays unbound or UNKNOWN, and the shared
 * evaluator enumerates an unbound truth and refuses an unbound magnitude.
 *
 * ONE HERO TREE, AND WHAT IT PROVES. A character has one active hero tree, so a build whose
 * observed entries resolve to one tree has none of the other tree's talents
 * (`FURY_WARRIOR_HERO_TREE_TALENTS`). That is a positive reading of the resolved tree, the
 * same proof Havoc's evaluator uses, and the only one beyond the three-way talent rule.
 *
 * WHAT STAYS REFUSED: see `vocabulary.ts`. The binding is explicit so a reader of the
 * diagnostics sees WHICH magnitude was refused, never an absence that could be mistaken for zero.
 */

import { unknownNumber, type NumericBinding } from "../../../simc/expression/evaluate.js";
import type { SpecAtomBinding, SpecAtomBindings } from "../../../simc/expression/spec-vocabulary.js";
import type { HeroTreeResolution, TalentResolution } from "../../../data/game/talent-selection.js";
import {
  MASSACRE_ENABLED,
  RAGE,
  FURY_WARRIOR_ATOM_VOCABULARY,
  FURY_WARRIOR_UNBOUND_NUMERIC_ATOMS,
} from "./vocabulary.js";

/** Each hero tree's pinned talents the list reads or an action is built on. */
export const FURY_WARRIOR_HERO_TREE_TALENTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  slayer: ["slayers_dominance"],
  mountain_thane: ["lightning_strikes"],
});

export interface FuryWarriorResolverInput {
  readonly heroTree: HeroTreeResolution;
  /** Every modelled talent's three-way resolution, by name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
  /** `rage`: the decision cast's own PRE_COST RAGE, or a refusal in the binding's own words. */
  readonly rage: NumericBinding;
}

export interface FuryWarriorResolverDiagnostics {
  readonly heroTreeBound: string | null;
  readonly rage: NumericBinding;
}

export interface FuryWarriorResolution {
  readonly specAtoms: SpecAtomBindings;
  readonly diagnostics: FuryWarriorResolverDiagnostics;
}

function truth(key: string, value: boolean): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "TRUTH", value } };
}

function magnitude(key: string, binding: NumericBinding): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "MAGNITUDE", binding } };
}

/** The talents a resolved hero tree proves not taken: every other tree's. */
export function furyWarriorTalentsDisprovedByHeroTree(heroTree: HeroTreeResolution): readonly string[] {
  if (heroTree.state !== "RESOLVED") return [];
  return Object.entries(FURY_WARRIOR_HERO_TREE_TALENTS).flatMap(([tree, talents]) =>
    tree === heroTree.simcName ? [] : talents,
  );
}

/** Binds every declared atom this evidence supports; leaves the rest unbound. */
export function resolveFuryWarriorAtoms(input: FuryWarriorResolverInput): FuryWarriorResolution {
  const bound: SpecAtomBinding[] = [];

  const enabledAtoms: readonly (readonly [string, string])[] = [[MASSACRE_ENABLED, "massacre"]];
  for (const [key, name] of enabledAtoms) {
    if (input.talents[name]?.selection === "SELECTED") bound.push(truth(key, true));
    else if (input.talentsProvenAbsent.has(name)) bound.push(truth(key, false));
  }

  bound.push(magnitude(RAGE, input.rage));
  for (const key of FURY_WARRIOR_UNBOUND_NUMERIC_ATOMS) {
    bound.push(magnitude(key, unknownNumber("STATE_NOT_MODELLED")));
  }

  return {
    specAtoms: { vocabulary: FURY_WARRIOR_ATOM_VOCABULARY, bound },
    diagnostics: {
      heroTreeBound: input.heroTree.state === "RESOLVED" ? input.heroTree.simcName : null,
      rage: input.rage,
    },
  };
}
