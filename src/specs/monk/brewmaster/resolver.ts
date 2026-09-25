/**
 * The Brewmaster Monk atom resolver (M11-C2).
 *
 * WHAT THIS IS
 *
 * The specialization-owned half of the resolver seam. The shared parser
 * admits the twelve identifiers `vocabulary.ts` declares; THIS module says
 * what each one is worth at one decision point, from the build facts the
 * facade resolved once from the actor's observed talent tree, and nothing
 * else. Every value it binds is a positive claim with a named source;
 * everything it cannot establish it leaves unbound or UNKNOWN, and the shared
 * evaluator enumerates an unbound truth and refuses an unbound magnitude.
 *
 * THE BUILD-STATIC TRUTHS
 *
 *   hero_tree.master_of_harmony, hero_tree.shadopan
 *       From the pinned hero-tree resolution over the observed talent tree:
 *       RESOLVED to one tree binds it TRUE and the other FALSE (one hero tree
 *       is active at a time). UNKNOWN or CONTRADICTORY binds neither, and the
 *       shared evaluator enumerates both — which leaves `default[4..5]`
 *       undecided and the query UNKNOWN at `UNDECIDED_RUN_GATE`. Never
 *       inferred from a cast: an Invoke Niuzao press says nothing about which
 *       hero tree is active.
 *   talent.blackout_combo.enabled, talent.salsalabims_strength.enabled
 *       The pinned three-way rule over the talent's entry and its choice-node
 *       alternative: SELECTED binds TRUE, NOT_SELECTED binds FALSE, UNKNOWN
 *       binds nothing.
 *   apex.1, apex.3
 *       The pinned apex table, positional then three-way: SELECTED TRUE,
 *       NOT_SELECTED FALSE, UNKNOWN nothing.
 *
 * THE MAGNITUDES. All six are bound UNKNOWN_NUMBER with STATE_NOT_MODELLED:
 * no charge state of a brew or of Keg Smash, no Aspect of Harmony
 * accumulator, no health maximum and no Energy is reconstructed in this
 * slice. The binding is explicit so a reader of the diagnostics sees WHICH
 * magnitude was refused, never an absence that could be mistaken for zero.
 */

import { unknownNumber } from "../../../simc/expression/evaluate.js";
import type { SpecAtomBinding, SpecAtomBindings } from "../../../simc/expression/spec-vocabulary.js";
import type { HeroTreeResolution, TalentResolution } from "../../../data/game/talent-selection.js";
import {
  APEX_1,
  APEX_3,
  BREWMASTER_ATOM_VOCABULARY,
  BREWMASTER_UNBOUND_NUMERIC_ATOMS,
  HERO_TREE_MASTER_OF_HARMONY,
  HERO_TREE_SHADOPAN,
  TALENT_BLACKOUT_COMBO_ENABLED,
  TALENT_SALSALABIMS_STRENGTH_ENABLED,
} from "./vocabulary.js";

export interface BrewmasterResolverInput {
  readonly heroTree: HeroTreeResolution;
  readonly blackoutCombo: TalentResolution;
  readonly salsalabimsStrength: TalentResolution;
  readonly apex1: TalentResolution;
  readonly apex3: TalentResolution;
}

export interface BrewmasterResolverDiagnostics {
  /** Which hero-tree atom bound TRUE, or null when neither bound. */
  readonly heroTreeBound: "shadopan" | "master_of_harmony" | null;
  /** Every build-static atom's bound truth, or null when it stayed unbound. */
  readonly buildStatic: Readonly<Record<string, boolean | null>>;
  /** The magnitudes bound UNKNOWN_NUMBER, in declaration order. */
  readonly unboundMagnitudes: readonly string[];
}

export interface BrewmasterResolution {
  readonly specAtoms: SpecAtomBindings;
  readonly diagnostics: BrewmasterResolverDiagnostics;
}

function truth(key: string, value: boolean): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "TRUTH", value } };
}

function selectionTruth(resolution: TalentResolution): boolean | null {
  if (resolution.selection === "SELECTED") return true;
  if (resolution.selection === "NOT_SELECTED") return false;
  return null;
}

/** Binds every declared atom this evidence supports; leaves the rest unbound. */
export function resolveBrewmasterAtoms(input: BrewmasterResolverInput): BrewmasterResolution {
  const bound: SpecAtomBinding[] = [];
  const buildStatic: Record<string, boolean | null> = {};

  // ---- the hero tree: both or neither ----
  let heroTreeBound: BrewmasterResolverDiagnostics["heroTreeBound"] = null;
  buildStatic[HERO_TREE_MASTER_OF_HARMONY] = null;
  buildStatic[HERO_TREE_SHADOPAN] = null;
  if (input.heroTree.state === "RESOLVED") {
    const shadopan = input.heroTree.simcName === "shadopan";
    const masterOfHarmony = input.heroTree.simcName === "master_of_harmony";
    if (shadopan || masterOfHarmony) {
      bound.push(truth(HERO_TREE_MASTER_OF_HARMONY, masterOfHarmony));
      bound.push(truth(HERO_TREE_SHADOPAN, shadopan));
      buildStatic[HERO_TREE_MASTER_OF_HARMONY] = masterOfHarmony;
      buildStatic[HERO_TREE_SHADOPAN] = shadopan;
      heroTreeBound = shadopan ? "shadopan" : "master_of_harmony";
    }
  }

  // ---- talents and apex tiers: the three-way rule, UNKNOWN binds nothing ----
  const rows: readonly (readonly [string, TalentResolution])[] = [
    [TALENT_BLACKOUT_COMBO_ENABLED, input.blackoutCombo],
    [TALENT_SALSALABIMS_STRENGTH_ENABLED, input.salsalabimsStrength],
    [APEX_1, input.apex1],
    [APEX_3, input.apex3],
  ];
  for (const [key, resolution] of rows) {
    const value = selectionTruth(resolution);
    buildStatic[key] = value;
    if (value !== null) bound.push(truth(key, value));
  }

  // ---- the magnitudes: declared, refused, named ----
  for (const key of BREWMASTER_UNBOUND_NUMERIC_ATOMS) {
    bound.push({
      key,
      actionToken: null,
      value: { kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") },
    });
  }

  return {
    specAtoms: { vocabulary: BREWMASTER_ATOM_VOCABULARY, bound },
    diagnostics: {
      heroTreeBound,
      buildStatic,
      unboundMagnitudes: [...BREWMASTER_UNBOUND_NUMERIC_ATOMS],
    },
  };
}
