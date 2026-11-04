/**
 * The Subtlety Rogue atom resolver (ONB-A2).
 *
 * The specialization-owned half of the resolver seam. Every value it binds is a positive claim
 * with a named source; everything it cannot establish stays unbound or UNKNOWN, and the shared
 * evaluator enumerates an unbound truth and refuses an unbound magnitude.
 *
 * ONE HERO TREE, AND WHAT IT PROVES. A character has one active hero tree, so a build whose
 * observed entries resolve to one tree has none of the other tree's talents
 * (`SUBTLETY_HERO_TREE_TALENTS`). That is a positive reading of the resolved tree, the
 * same proof Havoc's evaluator uses, and the only one beyond the three-way talent rule.
 *
 * WHAT STAYS REFUSED: see `vocabulary.ts`. The binding is explicit so a reader of the
 * diagnostics sees WHICH magnitude was refused, never an absence that could be mistaken for zero.
 */

import { unknownNumber, type NumericBinding } from "../../../simc/expression/evaluate.js";
import type { SpecAtomBinding, SpecAtomBindings } from "../../../simc/expression/spec-vocabulary.js";
import type { HeroTreeResolution, TalentResolution } from "../../../data/game/talent-selection.js";
import {
  ENERGY,
  ENERGY_DEFICIT,
  SUBTLETY_ATOM_VOCABULARY,
  SUBTLETY_UNBOUND_NUMERIC_ATOMS,
} from "./vocabulary.js";

/** Each hero tree's pinned talents the list reads or an action is built on. */
export const SUBTLETY_HERO_TREE_TALENTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  trickster: ["unseen_blade", "coup_de_grace"],
  deathstalker: ["deathstalkers_mark"],
});

export interface SubtletyResolverInput {
  readonly heroTree: HeroTreeResolution;
  /** Every modelled talent's three-way resolution, by name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
  /** `energy`: the decision cast's own PRE_COST ENERGY, or a refusal in the binding's own words. */
  readonly energy: NumericBinding;
  /** `energy.deficit`: the decision cast's own PRE_COST ENERGY, or a refusal in the binding's own words. */
  readonly energyDeficit: NumericBinding;
}

export interface SubtletyResolverDiagnostics {
  readonly heroTreeBound: string | null;
  readonly energy: NumericBinding;
  readonly energyDeficit: NumericBinding;
}

export interface SubtletyResolution {
  readonly specAtoms: SpecAtomBindings;
  readonly diagnostics: SubtletyResolverDiagnostics;
}

function magnitude(key: string, binding: NumericBinding): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "MAGNITUDE", binding } };
}

/** The talents a resolved hero tree proves not taken: every other tree's. */
export function subtletyTalentsDisprovedByHeroTree(heroTree: HeroTreeResolution): readonly string[] {
  if (heroTree.state !== "RESOLVED") return [];
  return Object.entries(SUBTLETY_HERO_TREE_TALENTS).flatMap(([tree, talents]) =>
    tree === heroTree.simcName ? [] : talents,
  );
}

/** Binds every declared atom this evidence supports; leaves the rest unbound. */
export function resolveSubtletyAtoms(input: SubtletyResolverInput): SubtletyResolution {
  const bound: SpecAtomBinding[] = [];

  bound.push(magnitude(ENERGY, input.energy));
  bound.push(magnitude(ENERGY_DEFICIT, input.energyDeficit));
  for (const key of SUBTLETY_UNBOUND_NUMERIC_ATOMS) {
    bound.push(magnitude(key, unknownNumber("STATE_NOT_MODELLED")));
  }

  return {
    specAtoms: { vocabulary: SUBTLETY_ATOM_VOCABULARY, bound },
    diagnostics: {
      heroTreeBound: input.heroTree.state === "RESOLVED" ? input.heroTree.simcName : null,
      energy: input.energy,
      energyDeficit: input.energyDeficit,
    },
  };
}
