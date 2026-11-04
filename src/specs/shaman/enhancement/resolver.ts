/**
 * The Enhancement Shaman atom resolver (ONB-B2).
 *
 * The specialization-owned half of the resolver seam. Every value it binds is a positive claim
 * with a named source; everything it cannot establish stays unbound or UNKNOWN, and the shared
 * evaluator enumerates an unbound truth and refuses an unbound magnitude.
 *
 * ONE HERO TREE, AND WHAT IT PROVES. A character has one active hero tree, so a build whose
 * observed entries resolve to one tree has none of the other tree's talents
 * (`ENHANCEMENT_SHAMAN_HERO_TREE_TALENTS`). That is a positive reading of the resolved tree, the
 * same proof Havoc's evaluator uses, and the only one beyond the three-way talent rule.
 *
 * WHAT STAYS REFUSED: see `vocabulary.ts`. The binding is explicit so a reader of the
 * diagnostics sees WHICH magnitude was refused, never an absence that could be mistaken for zero.
 */

import { unknownNumber, type NumericBinding } from "../../../simc/expression/evaluate.js";
import type { SpecAtomBinding, SpecAtomBindings } from "../../../simc/expression/spec-vocabulary.js";
import type { HeroTreeResolution, TalentResolution } from "../../../data/game/talent-selection.js";
import {
  SURGING_TOTEM_ENABLED,
  SURGING_ELEMENTS_ENABLED,
  FERAL_SPIRIT_ENABLED,
  FIRE_NOVA_ENABLED,
  THORIMS_INVOCATION_ENABLED,
  LASHING_FLAMES_ENABLED,
  ELEMENTAL_TEMPO_ENABLED,
  SPLITSTREAM_ENABLED,
  ASCENDANCE_ENABLED,
  DOOM_WINDS_ENABLED,
  DEEPLY_ROOTED_ELEMENTS_ENABLED,
  ENHANCEMENT_SHAMAN_ATOM_VOCABULARY,
  ENHANCEMENT_SHAMAN_UNBOUND_NUMERIC_ATOMS,
} from "./vocabulary.js";

/** Each hero tree's pinned talents the list reads or an action is built on. */
export const ENHANCEMENT_SHAMAN_HERO_TREE_TALENTS: Readonly<Record<string, readonly string[]>> =
  Object.freeze({ stormbringer: ["tempest"], totemic: ["surging_totem", "splitstream"] });

export interface EnhancementShamanResolverInput {
  readonly heroTree: HeroTreeResolution;
  /** Every modelled talent's three-way resolution, by name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
}

export interface EnhancementShamanResolverDiagnostics {
  readonly heroTreeBound: string | null;
}

export interface EnhancementShamanResolution {
  readonly specAtoms: SpecAtomBindings;
  readonly diagnostics: EnhancementShamanResolverDiagnostics;
}

function truth(key: string, value: boolean): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "TRUTH", value } };
}

function magnitude(key: string, binding: NumericBinding): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "MAGNITUDE", binding } };
}

/** The talents a resolved hero tree proves not taken: every other tree's. */
export function enhancementShamanTalentsDisprovedByHeroTree(heroTree: HeroTreeResolution): readonly string[] {
  if (heroTree.state !== "RESOLVED") return [];
  return Object.entries(ENHANCEMENT_SHAMAN_HERO_TREE_TALENTS).flatMap(([tree, talents]) =>
    tree === heroTree.simcName ? [] : talents,
  );
}

/** Binds every declared atom this evidence supports; leaves the rest unbound. */
export function resolveEnhancementShamanAtoms(
  input: EnhancementShamanResolverInput,
): EnhancementShamanResolution {
  const bound: SpecAtomBinding[] = [];

  const enabledAtoms: readonly (readonly [string, string])[] = [
    [SURGING_TOTEM_ENABLED, "surging_totem"],
    [SURGING_ELEMENTS_ENABLED, "surging_elements"],
    [FERAL_SPIRIT_ENABLED, "feral_spirit"],
    [FIRE_NOVA_ENABLED, "fire_nova"],
    [THORIMS_INVOCATION_ENABLED, "thorims_invocation"],
    [LASHING_FLAMES_ENABLED, "lashing_flames"],
    [ELEMENTAL_TEMPO_ENABLED, "elemental_tempo"],
    [SPLITSTREAM_ENABLED, "splitstream"],
    [ASCENDANCE_ENABLED, "ascendance"],
    [DOOM_WINDS_ENABLED, "doom_winds"],
    [DEEPLY_ROOTED_ELEMENTS_ENABLED, "deeply_rooted_elements"],
  ];
  for (const [key, name] of enabledAtoms) {
    if (input.talents[name]?.selection === "SELECTED") bound.push(truth(key, true));
    else if (input.talentsProvenAbsent.has(name)) bound.push(truth(key, false));
  }

  for (const key of ENHANCEMENT_SHAMAN_UNBOUND_NUMERIC_ATOMS) {
    bound.push(magnitude(key, unknownNumber("STATE_NOT_MODELLED")));
  }

  return {
    specAtoms: { vocabulary: ENHANCEMENT_SHAMAN_ATOM_VOCABULARY, bound },
    diagnostics: {
      heroTreeBound: input.heroTree.state === "RESOLVED" ? input.heroTree.simcName : null,
    },
  };
}
