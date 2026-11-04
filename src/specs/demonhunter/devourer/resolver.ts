/**
 * The Devourer Demon Hunter atom resolver (ONB-B3).
 *
 * The specialization-owned half of the resolver seam. Every value it binds is a positive claim
 * with a named source; everything it cannot establish stays unbound or UNKNOWN, and the shared
 * evaluator enumerates an unbound truth and refuses an unbound magnitude.
 *
 * ONE HERO TREE, AND WHAT IT PROVES. A character has one active hero tree, so a build whose
 * observed entries resolve to one tree has none of the other tree's talents
 * (`DEVOURER_DEMON_HUNTER_HERO_TREE_TALENTS`). That is a positive reading of the resolved tree, the
 * same proof Havoc's evaluator uses, and the only one beyond the three-way talent rule.
 *
 * WHAT STAYS REFUSED: see `vocabulary.ts`. The binding is explicit so a reader of the
 * diagnostics sees WHICH magnitude was refused, never an absence that could be mistaken for zero.
 */

import { unknownNumber, type NumericBinding } from "../../../simc/expression/evaluate.js";
import type { SpecAtomBinding, SpecAtomBindings } from "../../../simc/expression/spec-vocabulary.js";
import type { HeroTreeResolution, TalentResolution } from "../../../data/game/talent-selection.js";
import {
  HERO_TREE_ANNIHILATOR,
  HERO_TREE_VOIDSCARRED,
  FURY,
  DEVOURER_DEMON_HUNTER_ATOM_VOCABULARY,
  DEVOURER_DEMON_HUNTER_UNBOUND_NUMERIC_ATOMS,
} from "./vocabulary.js";

/** Each hero tree's pinned talents the list reads or an action is built on. */
export const DEVOURER_DEMON_HUNTER_HERO_TREE_TALENTS: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    annihilator: ["voidfall", "dark_matter"],
    voidscarred: ["voidsurge", "demonic_intensity"],
  });

export interface DevourerDemonHunterResolverInput {
  readonly heroTree: HeroTreeResolution;
  /** Every modelled talent's three-way resolution, by name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
  /** `fury`: the decision cast's own PRE_COST FURY, or a refusal in the binding's own words. */
  readonly fury: NumericBinding;
}

export interface DevourerDemonHunterResolverDiagnostics {
  readonly heroTreeBound: string | null;
  readonly fury: NumericBinding;
}

export interface DevourerDemonHunterResolution {
  readonly specAtoms: SpecAtomBindings;
  readonly diagnostics: DevourerDemonHunterResolverDiagnostics;
}

function truth(key: string, value: boolean): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "TRUTH", value } };
}

function magnitude(key: string, binding: NumericBinding): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "MAGNITUDE", binding } };
}

/** The talents a resolved hero tree proves not taken: every other tree's. */
export function devourerDemonHunterTalentsDisprovedByHeroTree(
  heroTree: HeroTreeResolution,
): readonly string[] {
  if (heroTree.state !== "RESOLVED") return [];
  return Object.entries(DEVOURER_DEMON_HUNTER_HERO_TREE_TALENTS).flatMap(([tree, talents]) =>
    tree === heroTree.simcName ? [] : talents,
  );
}

/** Binds every declared atom this evidence supports; leaves the rest unbound. */
export function resolveDevourerDemonHunterAtoms(
  input: DevourerDemonHunterResolverInput,
): DevourerDemonHunterResolution {
  const bound: SpecAtomBinding[] = [];

  if (input.heroTree.state === "RESOLVED") {
    bound.push(truth(HERO_TREE_ANNIHILATOR, input.heroTree.simcName === "annihilator"));
    bound.push(truth(HERO_TREE_VOIDSCARRED, input.heroTree.simcName === "voidscarred"));
  }

  bound.push(magnitude(FURY, input.fury));
  for (const key of DEVOURER_DEMON_HUNTER_UNBOUND_NUMERIC_ATOMS) {
    bound.push(magnitude(key, unknownNumber("STATE_NOT_MODELLED")));
  }

  return {
    specAtoms: { vocabulary: DEVOURER_DEMON_HUNTER_ATOM_VOCABULARY, bound },
    diagnostics: {
      heroTreeBound: input.heroTree.state === "RESOLVED" ? input.heroTree.simcName : null,
      fury: input.fury,
    },
  };
}
