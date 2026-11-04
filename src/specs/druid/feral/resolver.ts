/**
 * The Feral Druid atom resolver (ONB-C1).
 *
 * The specialization-owned half of the resolver seam. Every value it binds is a positive claim
 * with a named source; everything it cannot establish stays unbound or UNKNOWN, and the shared
 * evaluator enumerates an unbound truth and refuses an unbound magnitude.
 *
 * ONE HERO TREE, AND WHAT IT PROVES. A character has one active hero tree, so a build whose
 * observed entries resolve to one tree has none of the other tree's talents
 * (`FERAL_DRUID_HERO_TREE_TALENTS`). That is a positive reading of the resolved tree, the
 * same proof Havoc's evaluator uses, and the only one beyond the three-way talent rule.
 *
 * WHAT STAYS REFUSED: see `vocabulary.ts`. The binding is explicit so a reader of the
 * diagnostics sees WHICH magnitude was refused, never an absence that could be mistaken for zero.
 */

import { unknownNumber, type NumericBinding } from "../../../simc/expression/evaluate.js";
import type { SpecAtomBinding, SpecAtomBindings } from "../../../simc/expression/spec-vocabulary.js";
import type { HeroTreeResolution, TalentResolution } from "../../../data/game/talent-selection.js";
import {
  HERO_TREE_DRUID_OF_THE_CLAW,
  HERO_TREE_WILDSTALKER,
  BUFF_BS_INC_DOWN,
  ENERGY,
  FERAL_DRUID_ATOM_VOCABULARY,
  FERAL_DRUID_UNBOUND_NUMERIC_ATOMS,
} from "./vocabulary.js";

/** Each hero tree's pinned talents the list reads or an action is built on. */
export const FERAL_DRUID_HERO_TREE_TALENTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  druid_of_the_claw: ["ravage", "wildpower_surge"],
  wildstalker: ["thriving_growth", "bursting_growth"],
});

export interface FeralDruidResolverInput {
  readonly heroTree: HeroTreeResolution;
  /** Every modelled talent's three-way resolution, by name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
  /** `energy`: the decision cast's own PRE_COST ENERGY, or a refusal in the binding's own words. */
  readonly energy: NumericBinding;
  /** `buff.bs_inc.up` as bound (`aura-bindings.ts`), or `null`. `buff.bs_inc.down` is its negation. */
  readonly bsIncUp: boolean | null;
}

export interface FeralDruidResolverDiagnostics {
  readonly heroTreeBound: string | null;
  readonly energy: NumericBinding;
  readonly bsIncUp: boolean | null;
}

export interface FeralDruidResolution {
  readonly specAtoms: SpecAtomBindings;
  readonly diagnostics: FeralDruidResolverDiagnostics;
}

function truth(key: string, value: boolean): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "TRUTH", value } };
}

function magnitude(key: string, binding: NumericBinding): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "MAGNITUDE", binding } };
}

/** The talents a resolved hero tree proves not taken: every other tree's. */
export function feralDruidTalentsDisprovedByHeroTree(heroTree: HeroTreeResolution): readonly string[] {
  if (heroTree.state !== "RESOLVED") return [];
  return Object.entries(FERAL_DRUID_HERO_TREE_TALENTS).flatMap(([tree, talents]) =>
    tree === heroTree.simcName ? [] : talents,
  );
}

/** Binds every declared atom this evidence supports; leaves the rest unbound. */
export function resolveFeralDruidAtoms(input: FeralDruidResolverInput): FeralDruidResolution {
  const bound: SpecAtomBinding[] = [];

  if (input.heroTree.state === "RESOLVED") {
    bound.push(truth(HERO_TREE_DRUID_OF_THE_CLAW, input.heroTree.simcName === "druid_of_the_claw"));
    bound.push(truth(HERO_TREE_WILDSTALKER, input.heroTree.simcName === "wildstalker"));
  }

  if (input.bsIncUp !== null) bound.push(truth(BUFF_BS_INC_DOWN, !input.bsIncUp));
  bound.push(magnitude(ENERGY, input.energy));
  for (const key of FERAL_DRUID_UNBOUND_NUMERIC_ATOMS) {
    bound.push(magnitude(key, unknownNumber("STATE_NOT_MODELLED")));
  }

  return {
    specAtoms: { vocabulary: FERAL_DRUID_ATOM_VOCABULARY, bound },
    diagnostics: {
      heroTreeBound: input.heroTree.state === "RESOLVED" ? input.heroTree.simcName : null,
      energy: input.energy,
      bsIncUp: input.bsIncUp,
    },
  };
}
