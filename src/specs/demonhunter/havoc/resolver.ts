/**
 * The Havoc Demon Hunter atom resolver (ONB-A1).
 *
 * The specialization-owned half of the resolver seam. Every value it binds is a
 * positive claim with a named source; everything it cannot establish stays unbound
 * or UNKNOWN, and the shared evaluator enumerates an unbound truth and refuses an
 * unbound magnitude.
 *
 * ONE HERO TREE, AND WHAT IT PROVES. A character has one active hero tree, so a
 * build whose observed entries resolve to Aldrachi Reaver has no Fel-Scarred
 * talent: `talent.scarred.demonsurge` and `talent.scarred.violent_transformation`
 * are not `ok()`. That is the one thing it proves, and it is a positive reading of
 * the resolved tree. So `action.<x>.demonsurge_available` is FALSE (the constant 0,
 * sc_demon_hunter.cpp:2676-2686), and `talent.violent_transformation` is not taken.
 * The reverse does NOT follow from a Fel-Scarred build: `demonsurge_available` is
 * then runtime state on a quiet buff the log never shows, so it stays unbound.
 *
 * WHAT STAYS REFUSED: see `vocabulary.ts`. The binding is explicit so a reader of
 * the diagnostics sees WHICH magnitude was refused, never an absence that could be
 * mistaken for zero.
 */

import { knownNumber, unknownNumber } from "../../../simc/expression/evaluate.js";
import type { SpecAtomBinding, SpecAtomBindings } from "../../../simc/expression/spec-vocabulary.js";
import type { HeroTreeResolution, TalentResolution } from "../../../data/game/talent-selection.js";
import type { NumericBinding } from "../../../simc/expression/evaluate.js";
import {
  ANNIHILATION_DEMONSURGE,
  BLADE_DANCE_UP,
  CHARGES,
  DEATH_SWEEP_DEMONSURGE,
  EYE_BEAM_UP,
  FULL_RECHARGE_TIME,
  FURY,
  GLAIVE_FLURRY_DOWN,
  HAVOC_ATOM_VOCABULARY,
  HAVOC_UNBOUND_NUMERIC_ATOMS,
  HERO_TREE_ALDRACHI_REAVER,
  HERO_TREE_FELSCARRED,
  IMMOLATION_AURA_DEMONSURGE,
  METAMORPHOSIS_UP,
  RENDING_STRIKE_DOWN,
} from "./vocabulary.js";

/** The talent this module answers from the resolved hero tree alone. */
export const VIOLENT_TRANSFORMATION = "violent_transformation";

export interface HavocResolverInput {
  readonly heroTree: HeroTreeResolution;
  readonly demonsurge: TalentResolution;
  /** The decision cast's own PRE_COST Fury, or a refusal in the binding's own words. */
  readonly fury: NumericBinding;
  /** `buff.<name>.up` where M4 or the build proved it, by buff name. */
  readonly buffUp: Readonly<Record<string, boolean | undefined>>;
  /** `cooldown.<name>.up` where a proven lower bound makes it FALSE. Never TRUE. */
  readonly cooldownProvenDown: Readonly<Record<string, boolean | undefined>>;
}

export interface HavocResolverDiagnostics {
  readonly heroTreeBound: "felscarred" | "aldrachi_reaver" | null;
  /** Whether `action.<x>.demonsurge_available` is proven the constant 0. */
  readonly demonsurgeProvenAbsent: boolean;
  readonly fury: NumericBinding;
}

export interface HavocResolution {
  readonly specAtoms: SpecAtomBindings;
  readonly diagnostics: HavocResolverDiagnostics;
}

function truth(key: string, value: boolean): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "TRUTH", value } };
}

function magnitude(key: string, binding: NumericBinding): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "MAGNITUDE", binding } };
}

/** Whether the resolved tree proves the Fel-Scarred talents are not taken. */
export function felScarredDisproved(heroTree: HeroTreeResolution): boolean {
  return heroTree.state === "RESOLVED" && heroTree.simcName === "aldrachi_reaver";
}

/** Binds every declared atom this evidence supports; leaves the rest unbound. */
export function resolveHavocAtoms(input: HavocResolverInput): HavocResolution {
  const bound: SpecAtomBinding[] = [];

  let heroTreeBound: HavocResolverDiagnostics["heroTreeBound"] = null;
  if (input.heroTree.state === "RESOLVED") {
    const felscarred = input.heroTree.simcName === "felscarred";
    const aldrachi = input.heroTree.simcName === "aldrachi_reaver";
    if (felscarred || aldrachi) {
      bound.push(truth(HERO_TREE_FELSCARRED, felscarred));
      bound.push(truth(HERO_TREE_ALDRACHI_REAVER, aldrachi));
      heroTreeBound = felscarred ? "felscarred" : "aldrachi_reaver";
    }
  }

  const demonsurgeProvenAbsent =
    felScarredDisproved(input.heroTree) || input.demonsurge.selection === "NOT_SELECTED";
  if (demonsurgeProvenAbsent) {
    for (const key of [DEATH_SWEEP_DEMONSURGE, ANNIHILATION_DEMONSURGE, IMMOLATION_AURA_DEMONSURGE]) {
      bound.push(truth(key, false));
    }
  }

  const rendingStrikeUp = input.buffUp["rending_strike"];
  if (rendingStrikeUp !== undefined) bound.push(truth(RENDING_STRIKE_DOWN, !rendingStrikeUp));
  const glaiveFlurryUp = input.buffUp["glaive_flurry"];
  if (glaiveFlurryUp !== undefined) bound.push(truth(GLAIVE_FLURRY_DOWN, !glaiveFlurryUp));

  const cooldownAtoms: readonly (readonly [string, string])[] = [
    ["metamorphosis", METAMORPHOSIS_UP],
    ["blade_dance", BLADE_DANCE_UP],
    ["eye_beam", EYE_BEAM_UP],
  ];
  for (const [token, key] of cooldownAtoms) {
    if (input.cooldownProvenDown[token] === true) bound.push(truth(key, false));
  }

  bound.push(magnitude(FURY, input.fury));
  for (const key of HAVOC_UNBOUND_NUMERIC_ATOMS) {
    bound.push(magnitude(key, unknownNumber("STATE_NOT_MODELLED")));
  }
  for (const key of [CHARGES, FULL_RECHARGE_TIME]) {
    bound.push({
      key,
      actionToken: "immolation_aura",
      value: { kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") },
    });
  }

  return {
    specAtoms: { vocabulary: HAVOC_ATOM_VOCABULARY, bound },
    diagnostics: { heroTreeBound, demonsurgeProvenAbsent, fury: input.fury },
  };
}

/** The exact Fury binding of an established observation. */
export function exactFury(amount: number): NumericBinding {
  return knownNumber(amount);
}
