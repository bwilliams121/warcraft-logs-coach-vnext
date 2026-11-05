/**
 * The Devastation Evoker atom resolver (ONB-X2).
 *
 * The specialization-owned half of the resolver seam. Every value it binds is a positive claim
 * with a named source; everything it cannot establish stays unbound or UNKNOWN, and the shared
 * evaluator enumerates an unbound truth and refuses an unbound magnitude.
 *
 * EVERYTHING BOUND IS FIXED FOR THE FIGHT. A cast-time action is decided when it begins (ONB-S4), so a
 * value read at its completion would answer the wrong moment. No such value is read: the talents and
 * the hero tree do not change between a begin and its completion, and every magnitude stays unknown.
 * That is why nothing here takes the decision's time as an input.
 *
 * ONE HERO TREE, AND WHAT IT PROVES. A character has one active hero tree, so a build whose
 * observed entries resolve to one tree has none of the other tree's talents
 * (`DEVASTATION_HERO_TREE_TALENTS`). That is a positive reading of the resolved tree, the
 * same proof Havoc's evaluator uses, and the only one beyond the three-way talent rule.
 *
 * WHAT STAYS REFUSED: see `vocabulary.ts`. The binding is explicit so a reader of the
 * diagnostics sees WHICH magnitude was refused, never an absence that could be mistaken for zero.
 */

import { unknownNumber } from "../../../simc/expression/evaluate.js";
import type { SpecAtomBinding, SpecAtomBindings } from "../../../simc/expression/spec-vocabulary.js";
import type { HeroTreeResolution, TalentResolution } from "../../../data/game/talent-selection.js";
import { DEVASTATION_ATOM_VOCABULARY, DEVASTATION_UNBOUND_NUMERIC_ATOMS } from "./vocabulary.js";

/** Each hero tree's pinned talents the list reads or an action is built on. */
export const DEVASTATION_HERO_TREE_TALENTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  scalecommander: ["mass_disintegrate", "slipstream"],
  flameshaper: ["legacy_of_the_lifebinder"],
});

export interface DevastationResolverInput {
  readonly heroTree: HeroTreeResolution;
  /** Every modelled talent's three-way resolution, by name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
}

export interface DevastationResolverDiagnostics {
  readonly heroTreeBound: string | null;
}

export interface DevastationResolution {
  readonly specAtoms: SpecAtomBindings;
  readonly diagnostics: DevastationResolverDiagnostics;
}

function magnitude(key: string): SpecAtomBinding {
  return {
    key,
    actionToken: null,
    value: { kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") },
  };
}

/** The talents a resolved hero tree proves not taken: every other tree's. */
export function devastationTalentsDisprovedByHeroTree(heroTree: HeroTreeResolution): readonly string[] {
  if (heroTree.state !== "RESOLVED") return [];
  return Object.entries(DEVASTATION_HERO_TREE_TALENTS).flatMap(([tree, talents]) =>
    tree === heroTree.simcName ? [] : talents,
  );
}

/** Binds every declared atom this evidence supports; leaves the rest unbound. */
export function resolveDevastationAtoms(input: DevastationResolverInput): DevastationResolution {
  const bound: SpecAtomBinding[] = [];

  for (const key of DEVASTATION_UNBOUND_NUMERIC_ATOMS) bound.push(magnitude(key));

  return {
    specAtoms: { vocabulary: DEVASTATION_ATOM_VOCABULARY, bound },
    diagnostics: {
      heroTreeBound: input.heroTree.state === "RESOLVED" ? input.heroTree.simcName : null,
    },
  };
}
