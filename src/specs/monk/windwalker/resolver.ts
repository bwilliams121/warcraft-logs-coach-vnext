/**
 * The Windwalker Monk atom resolver (ONB-T1).
 *
 * The specialization-owned half of the resolver seam. Every value it binds is a positive claim
 * with a named source; everything it cannot establish stays unbound or UNKNOWN, and the shared
 * evaluator enumerates an unbound truth and refuses an unbound magnitude.
 *
 * ONE HERO TREE, AND WHAT IT PROVES. A character has one active hero tree, so a build whose
 * observed entries resolve to one tree has none of the other tree's talents
 * (`WINDWALKER_MONK_HERO_TREE_TALENTS`). The list reads no `hero_tree.*`, but it does read these talents,
 * `big_coc`'s gate among them, so that proof is what closes the other tree's lines.
 *
 * WHAT STAYS REFUSED: see `vocabulary.ts`. The binding is explicit so a reader of the
 * diagnostics sees WHICH magnitude was refused, never an absence that could be mistaken for zero.
 */

import { unknownNumber, type NumericBinding } from "../../../simc/expression/evaluate.js";
import type { SpecAtomBinding, SpecAtomBindings } from "../../../simc/expression/spec-vocabulary.js";
import type { HeroTreeResolution } from "../../../data/game/talent-selection.js";
import {
  ENERGY,
  WINDWALKER_MONK_ATOM_VOCABULARY,
  WINDWALKER_MONK_UNBOUND_NUMERIC_ATOMS,
} from "./vocabulary.js";

/** Each hero tree's pinned talents the list reads. */
export const WINDWALKER_MONK_HERO_TREE_TALENTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  conduit_of_the_celestials: ["celestial_conduit", "invoke_xuen_the_white_tiger", "restore_balance"],
  shadopan: ["flurry_strikes"],
});

export interface WindwalkerMonkResolverInput {
  /** `energy`: the decision cast's own PRE_COST ENERGY, or a refusal in the binding's own words. */
  readonly energy: NumericBinding;
}

export interface WindwalkerMonkResolverDiagnostics {
  readonly energy: NumericBinding;
}

export interface WindwalkerMonkResolution {
  readonly specAtoms: SpecAtomBindings;
  readonly diagnostics: WindwalkerMonkResolverDiagnostics;
}

function magnitude(key: string, binding: NumericBinding): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "MAGNITUDE", binding } };
}

/** The talents a resolved hero tree proves not taken: every other tree's. */
export function windwalkerMonkTalentsDisprovedByHeroTree(heroTree: HeroTreeResolution): readonly string[] {
  if (heroTree.state !== "RESOLVED") return [];
  return Object.entries(WINDWALKER_MONK_HERO_TREE_TALENTS).flatMap(([tree, talents]) =>
    tree === heroTree.simcName ? [] : talents,
  );
}

/** Binds every declared atom this evidence supports; leaves the rest unbound. */
export function resolveWindwalkerMonkAtoms(input: WindwalkerMonkResolverInput): WindwalkerMonkResolution {
  const bound: SpecAtomBinding[] = [magnitude(ENERGY, input.energy)];
  for (const key of WINDWALKER_MONK_UNBOUND_NUMERIC_ATOMS) {
    bound.push(magnitude(key, unknownNumber("STATE_NOT_MODELLED")));
  }
  return {
    specAtoms: { vocabulary: WINDWALKER_MONK_ATOM_VOCABULARY, bound },
    diagnostics: { energy: input.energy },
  };
}
