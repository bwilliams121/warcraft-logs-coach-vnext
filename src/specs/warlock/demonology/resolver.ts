/**
 * The Demonology Warlock atom resolver (ONB-X4).
 *
 * The specialization-owned half of the resolver seam. Every value it binds is a positive claim
 * with a named source; everything it cannot establish stays unbound or UNKNOWN, and the shared
 * evaluator enumerates an unbound truth and refuses an unbound magnitude.
 *
 * WHAT IS BOUND HERE IS FIXED FOR THE FIGHT. A cast-time action is decided when it begins (ONB-S4), so a
 * value read at its completion would answer the wrong moment. Nothing here reads one: the talents do not change between a begin and its
 * completion. The one thing that moves, the pets, is read by `pet-profile.ts` at the decision's established anchor, never at a completion.
 *
 * ONE HERO TREE, AND WHAT IT PROVES. A character has one active hero tree, so a build whose
 * observed entries resolve to one tree has none of the other tree's talents
 * (`DEMONOLOGY_HERO_TREE_TALENTS`). That is a positive reading of the resolved tree, the
 * same proof Havoc's evaluator uses, and the only one beyond the three-way talent rule.
 *
 * WHAT STAYS REFUSED: see `vocabulary.ts`. The binding is explicit so a reader of the
 * diagnostics sees WHICH magnitude was refused, never an absence that could be mistaken for zero.
 */

import { unknownNumber } from "../../../simc/expression/evaluate.js";
import type { SpecAtomBinding, SpecAtomBindings } from "../../../simc/expression/spec-vocabulary.js";
import type { HeroTreeResolution, TalentResolution } from "../../../data/game/talent-selection.js";
import {
  DEMONOLOGY_ATOM_VOCABULARY,
  DEMONOLOGY_UNBOUND_NUMERIC_ATOMS,
  TALENT_TO_HELL_AND_BACK_ENABLED,
} from "./vocabulary.js";

/** Each hero tree's pinned talents the list reads or an action is built on. */
export const DEMONOLOGY_HERO_TREE_TALENTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  soul_harvester: ["demonic_soul"],
  diabolist: ["diabolic_ritual", "ruination", "secrets_of_the_coven"],
});

export interface DemonologyResolverInput {
  readonly heroTree: HeroTreeResolution;
  /** Every modelled talent's three-way resolution, by name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
}

export interface DemonologyResolverDiagnostics {
  readonly heroTreeBound: string | null;
}

export interface DemonologyResolution {
  readonly specAtoms: SpecAtomBindings;
  readonly diagnostics: DemonologyResolverDiagnostics;
}

function truth(key: string, value: boolean): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "TRUTH", value } };
}

function magnitude(key: string): SpecAtomBinding {
  return {
    key,
    actionToken: null,
    value: { kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") },
  };
}

/** The talents a resolved hero tree proves not taken: every other tree's. */
export function demonologyTalentsDisprovedByHeroTree(heroTree: HeroTreeResolution): readonly string[] {
  if (heroTree.state !== "RESOLVED") return [];
  return Object.entries(DEMONOLOGY_HERO_TREE_TALENTS).flatMap(([tree, talents]) =>
    tree === heroTree.simcName ? [] : talents,
  );
}

/** Binds every declared atom this evidence supports; leaves the rest unbound. */
export function resolveDemonologyAtoms(input: DemonologyResolverInput): DemonologyResolution {
  const bound: SpecAtomBinding[] = [];

  if (input.talents["to_hell_and_back"]?.selection === "SELECTED") {
    bound.push(truth(TALENT_TO_HELL_AND_BACK_ENABLED, true));
  } else if (input.talentsProvenAbsent.has("to_hell_and_back")) {
    bound.push(truth(TALENT_TO_HELL_AND_BACK_ENABLED, false));
  }

  for (const key of DEMONOLOGY_UNBOUND_NUMERIC_ATOMS) bound.push(magnitude(key));

  return {
    specAtoms: { vocabulary: DEMONOLOGY_ATOM_VOCABULARY, bound },
    diagnostics: {
      heroTreeBound: input.heroTree.state === "RESOLVED" ? input.heroTree.simcName : null,
    },
  };
}
