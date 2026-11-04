/**
 * The Frost Death Knight atom resolver (ONB-B2).
 *
 * The specialization-owned half of the resolver seam. Every value it binds is a positive claim
 * with a named source; everything it cannot establish stays unbound or UNKNOWN, and the shared
 * evaluator enumerates an unbound truth and refuses an unbound magnitude.
 *
 * ONE HERO TREE, AND WHAT IT PROVES. A character has one active hero tree, so a build whose
 * observed entries resolve to one tree has none of the other tree's talents
 * (`FROST_DEATH_KNIGHT_HERO_TREE_TALENTS`). That is a positive reading of the resolved tree, the
 * same proof Havoc's evaluator uses, and the only one beyond the three-way talent rule.
 *
 * WHAT STAYS REFUSED: see `vocabulary.ts`. The binding is explicit so a reader of the
 * diagnostics sees WHICH magnitude was refused, never an absence that could be mistaken for zero.
 */

import { unknownNumber, type NumericBinding } from "../../../simc/expression/evaluate.js";
import type { SpecAtomBinding, SpecAtomBindings } from "../../../simc/expression/spec-vocabulary.js";
import type { HeroTreeResolution, TalentResolution } from "../../../data/game/talent-selection.js";
import {
  HERO_TREE_DEATHBRINGER,
  HERO_TREE_RIDER,
  RUNE,
  RUNIC_POWER,
  RUNIC_POWER_DEFICIT,
  FROST_DEATH_KNIGHT_ATOM_VOCABULARY,
  FROST_DEATH_KNIGHT_UNBOUND_NUMERIC_ATOMS,
} from "./vocabulary.js";

/** Each hero tree's pinned talents the list reads or an action is built on. */
export const FROST_DEATH_KNIGHT_HERO_TREE_TALENTS: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    deathbringer: ["reapers_mark", "deathly_blows"],
    rider_of_the_apocalypse: ["apocalypse_now"],
  });

export interface FrostDeathKnightResolverInput {
  readonly heroTree: HeroTreeResolution;
  /** Every modelled talent's three-way resolution, by name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** Talents proven not taken. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
  /** `rune`: the decision cast's own PRE_COST RUNES, or a refusal in the binding's own words. */
  readonly rune: NumericBinding;
  /** `runic_power`: the decision cast's own PRE_COST RUNIC_POWER, or a refusal in the binding's own words. */
  readonly runicPower: NumericBinding;
  /** `runic_power.deficit`: the decision cast's own PRE_COST RUNIC_POWER, or a refusal in the binding's own words. */
  readonly runicPowerDeficit: NumericBinding;
}

export interface FrostDeathKnightResolverDiagnostics {
  readonly heroTreeBound: string | null;
  readonly rune: NumericBinding;
  readonly runicPower: NumericBinding;
  readonly runicPowerDeficit: NumericBinding;
}

export interface FrostDeathKnightResolution {
  readonly specAtoms: SpecAtomBindings;
  readonly diagnostics: FrostDeathKnightResolverDiagnostics;
}

function truth(key: string, value: boolean): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "TRUTH", value } };
}

function magnitude(key: string, binding: NumericBinding): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "MAGNITUDE", binding } };
}

/** The talents a resolved hero tree proves not taken: every other tree's. */
export function frostDeathKnightTalentsDisprovedByHeroTree(heroTree: HeroTreeResolution): readonly string[] {
  if (heroTree.state !== "RESOLVED") return [];
  return Object.entries(FROST_DEATH_KNIGHT_HERO_TREE_TALENTS).flatMap(([tree, talents]) =>
    tree === heroTree.simcName ? [] : talents,
  );
}

/** Binds every declared atom this evidence supports; leaves the rest unbound. */
export function resolveFrostDeathKnightAtoms(
  input: FrostDeathKnightResolverInput,
): FrostDeathKnightResolution {
  const bound: SpecAtomBinding[] = [];

  if (input.heroTree.state === "RESOLVED") {
    bound.push(truth(HERO_TREE_DEATHBRINGER, input.heroTree.simcName === "deathbringer"));
    bound.push(truth(HERO_TREE_RIDER, input.heroTree.simcName === "rider_of_the_apocalypse"));
  }

  bound.push(magnitude(RUNE, input.rune));
  bound.push(magnitude(RUNIC_POWER, input.runicPower));
  bound.push(magnitude(RUNIC_POWER_DEFICIT, input.runicPowerDeficit));
  for (const key of FROST_DEATH_KNIGHT_UNBOUND_NUMERIC_ATOMS) {
    bound.push(magnitude(key, unknownNumber("STATE_NOT_MODELLED")));
  }

  return {
    specAtoms: { vocabulary: FROST_DEATH_KNIGHT_ATOM_VOCABULARY, bound },
    diagnostics: {
      heroTreeBound: input.heroTree.state === "RESOLVED" ? input.heroTree.simcName : null,
      rune: input.rune,
      runicPower: input.runicPower,
      runicPowerDeficit: input.runicPowerDeficit,
    },
  };
}
