/**
 * The Frost Mage atom resolver (ONB-D3).
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
 * (`FROST_HERO_TREE_TALENTS`). That is a positive reading of the resolved tree, the
 * same proof Havoc's evaluator uses, and the only one beyond the three-way talent rule.
 *
 * WHAT STAYS REFUSED: see `vocabulary.ts`. The binding is explicit so a reader of the
 * diagnostics sees WHICH magnitude was refused, never an absence that could be mistaken for zero.
 */

import { unknownNumber } from "../../../simc/expression/evaluate.js";
import type { SpecAtomBinding, SpecAtomBindings } from "../../../simc/expression/spec-vocabulary.js";
import type { HeroTreeResolution, TalentResolution } from "../../../data/game/talent-selection.js";
import { FROST_ATOM_VOCABULARY, FROST_UNBOUND_NUMERIC_ATOMS } from "./vocabulary.js";

/** Each hero tree's pinned talents the list reads or an action is built on. */
export const FROST_HERO_TREE_TALENTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  spellslinger: [],
  frostfire: ["frostfire_bolt"],
});

export interface FrostResolverInput {
  readonly heroTree: HeroTreeResolution;
  /** Every modelled talent's three-way resolution, by name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
}

export interface FrostResolverDiagnostics {
  readonly heroTreeBound: string | null;
}

export interface FrostResolution {
  readonly specAtoms: SpecAtomBindings;
  readonly diagnostics: FrostResolverDiagnostics;
}

function magnitude(key: string): SpecAtomBinding {
  return {
    key,
    actionToken: null,
    value: { kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") },
  };
}

/** The talents a resolved hero tree proves not taken: every other tree's. */
export function frostTalentsDisprovedByHeroTree(heroTree: HeroTreeResolution): readonly string[] {
  if (heroTree.state !== "RESOLVED") return [];
  return Object.entries(FROST_HERO_TREE_TALENTS).flatMap(([tree, talents]) =>
    tree === heroTree.simcName ? [] : talents,
  );
}

/** Binds every declared atom this evidence supports; leaves the rest unbound. */
export function resolveFrostAtoms(input: FrostResolverInput): FrostResolution {
  const bound: SpecAtomBinding[] = [];

  for (const key of FROST_UNBOUND_NUMERIC_ATOMS) bound.push(magnitude(key));

  return {
    specAtoms: { vocabulary: FROST_ATOM_VOCABULARY, bound },
    diagnostics: {
      heroTreeBound: input.heroTree.state === "RESOLVED" ? input.heroTree.simcName : null,
    },
  };
}
