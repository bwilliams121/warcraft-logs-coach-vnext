/**
 * The Unholy Death Knight atom resolver (ONB-X5).
 *
 * The specialization-owned half of the resolver seam. Every value it binds is a positive claim
 * with a named source; everything it cannot establish stays unbound or UNKNOWN, and the shared
 * evaluator enumerates an unbound truth and refuses an unbound magnitude.
 *
 * NO HERO TREE IS READ. The pinned list reads no `hero_tree.*` and no hero talent, and no action of it is built on one, so a resolved tree proves nothing here.
 * The facade reports it from entry membership and nothing decides on it.
 *
 * WHAT STAYS REFUSED: see `vocabulary.ts`. The binding is explicit so a reader of the
 * diagnostics sees WHICH magnitude was refused, never an absence that could be mistaken for zero.
 */

import { unknownNumber, type NumericBinding } from "../../../simc/expression/evaluate.js";
import type { SpecAtomBinding, SpecAtomBindings } from "../../../simc/expression/spec-vocabulary.js";
import {
  RUNE,
  RUNIC_POWER,
  RUNIC_POWER_DEFICIT,
  UNHOLY_DEATH_KNIGHT_ATOM_VOCABULARY,
  UNHOLY_DEATH_KNIGHT_UNBOUND_NUMERIC_ATOMS,
} from "./vocabulary.js";

export interface UnholyDeathKnightResolverInput {
  /** `rune`: the decision cast's own PRE_COST RUNES, or a refusal in the binding's own words. */
  readonly rune: NumericBinding;
  /** `runic_power`: the decision cast's own PRE_COST RUNIC_POWER, or a refusal in the binding's own words. */
  readonly runicPower: NumericBinding;
  /** `runic_power.deficit`: the decision cast's own PRE_COST RUNIC_POWER, or a refusal in the binding's own words. */
  readonly runicPowerDeficit: NumericBinding;
}

export interface UnholyDeathKnightResolverDiagnostics {
  readonly rune: NumericBinding;
  readonly runicPower: NumericBinding;
  readonly runicPowerDeficit: NumericBinding;
}

export interface UnholyDeathKnightResolution {
  readonly specAtoms: SpecAtomBindings;
  readonly diagnostics: UnholyDeathKnightResolverDiagnostics;
}

function magnitude(key: string, binding: NumericBinding): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "MAGNITUDE", binding } };
}

/** Binds every declared atom this evidence supports; leaves the rest unbound. */
export function resolveUnholyDeathKnightAtoms(
  input: UnholyDeathKnightResolverInput,
): UnholyDeathKnightResolution {
  const bound: SpecAtomBinding[] = [];

  bound.push(magnitude(RUNE, input.rune));
  bound.push(magnitude(RUNIC_POWER, input.runicPower));
  bound.push(magnitude(RUNIC_POWER_DEFICIT, input.runicPowerDeficit));
  for (const key of UNHOLY_DEATH_KNIGHT_UNBOUND_NUMERIC_ATOMS) {
    bound.push(magnitude(key, unknownNumber("STATE_NOT_MODELLED")));
  }

  return {
    specAtoms: { vocabulary: UNHOLY_DEATH_KNIGHT_ATOM_VOCABULARY, bound },
    diagnostics: {
      rune: input.rune,
      runicPower: input.runicPower,
      runicPowerDeficit: input.runicPowerDeficit,
    },
  };
}
