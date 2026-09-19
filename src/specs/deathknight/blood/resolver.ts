/**
 * The Blood Death Knight atom resolver (M11-B2).
 *
 * WHAT THIS IS
 *
 * The specialization-owned half of the resolver seam. The shared parser
 * admits the identifiers `vocabulary.ts` declares; THIS module says what each
 * one is worth at one decision point, from the resource observations, the
 * hero-tree resolution and the decision's own fight time, and nothing else.
 * Every value it binds is a positive claim with a named source; everything
 * it cannot establish it leaves unbound or UNKNOWN, and the shared evaluator
 * enumerates an unbound truth and refuses an unbound magnitude.
 *
 * THE IDENTIFIERS, ONE BY ONE
 *
 *   hero_tree.sanlayn, hero_tree.deathbringer
 *       From the pinned hero-tree resolution over the observed talent tree:
 *       RESOLVED to one tree binds it TRUE and the other FALSE (one hero
 *       tree is active at a time). UNKNOWN or CONTRADICTORY binds neither,
 *       and the shared evaluator enumerates both — which, on this list, is
 *       what leaves `default[14..16]` undecided and the query UNKNOWN at
 *       `UNDECIDED_RUN_GATE`. Never inferred from a Vampiric Strike cast.
 *   runic_power.deficit
 *       KNOWN in POINTS from the decision cast's own PRE_COST Runic Power
 *       entry (`resources.ts`), or — since M11-B5, when the caller supplies
 *       the Blood Runic Power state (`runic-power-state.ts`) — that state's
 *       binding: exact from an observation carried under RESOURCES and CASTS
 *       continuity, a LOWER BOUND when the last observations sit inside the
 *       1 ms resource window ahead of the decision, and an explicit
 *       UNKNOWN_NUMBER / STATE_NOT_ESTABLISHED otherwise. Never replayed:
 *       every carried value is a number the wire wrote.
 *   rune
 *       KNOWN from the decision cast's own PRE_COST Runes entry; UNKNOWN on
 *       a cast that costs no Runes (Death Strike). Never regenerated.
 *   time
 *       KNOWN: the decision's fight time in seconds. An observed quantity.
 */

import { knownNumber, unknownNumber, type NumericBinding } from "../../../simc/expression/evaluate.js";
import type { SpecAtomBinding, SpecAtomBindings } from "../../../simc/expression/spec-vocabulary.js";
import type { HeroTreeResolution } from "../../../data/game/talent-selection.js";
import { runeCount, runicPowerDeficitPoints, type BloodResourceObservation } from "./resources.js";
import {
  BLOOD_ATOM_VOCABULARY,
  HERO_TREE_DEATHBRINGER,
  HERO_TREE_SANLAYN,
  RUNE,
  RUNIC_POWER_DEFICIT,
  TIME,
} from "./vocabulary.js";

export interface BloodResolverInput {
  readonly runes: BloodResourceObservation;
  readonly runicPower: BloodResourceObservation;
  /**
   * The `runic_power.deficit` binding the Blood Runic Power state established
   * (M11-B5). When supplied it is the binding, whatever `runicPower` says;
   * when omitted the resolver falls back to the own-cast PRE_COST reading.
   */
  readonly runicPowerDeficit?: NumericBinding;
  readonly heroTree: HeroTreeResolution;
  /** The decision's fight time, milliseconds since the pull. */
  readonly fightTimeMs: number;
}

export interface BloodResolverDiagnostics {
  readonly runes: BloodResourceObservation;
  readonly runicPower: BloodResourceObservation;
  /** The `runic_power.deficit` bound exactly, in points, or null (a bound or an unknown is null here; see the Runic Power state). */
  readonly runicPowerDeficit: number | null;
  /** The `rune` bound, or null. */
  readonly rune: number | null;
  /** Which hero-tree atom bound TRUE, or null when neither bound. */
  readonly heroTreeBound: "sanlayn" | "deathbringer" | null;
  readonly timeSeconds: number;
}

export interface BloodResolution {
  readonly specAtoms: SpecAtomBindings;
  readonly diagnostics: BloodResolverDiagnostics;
}

function truth(key: string, value: boolean): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "TRUTH", value } };
}

function magnitude(key: string, value: number): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "MAGNITUDE", binding: knownNumber(value) } };
}

function notEstablished(key: string): SpecAtomBinding {
  return {
    key,
    actionToken: null,
    value: { kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_ESTABLISHED") },
  };
}

/** Binds every declared atom this evidence supports; leaves the rest unbound. */
export function resolveBloodAtoms(input: BloodResolverInput): BloodResolution {
  const bound: SpecAtomBinding[] = [];

  // ---- the hero tree: both or neither ----
  let heroTreeBound: BloodResolverDiagnostics["heroTreeBound"] = null;
  if (input.heroTree.state === "RESOLVED") {
    const sanlayn = input.heroTree.simcName === "sanlayn";
    const deathbringer = input.heroTree.simcName === "deathbringer";
    if (sanlayn || deathbringer) {
      bound.push(truth(HERO_TREE_SANLAYN, sanlayn));
      bound.push(truth(HERO_TREE_DEATHBRINGER, deathbringer));
      heroTreeBound = sanlayn ? "sanlayn" : "deathbringer";
    }
  }

  // ---- the resources: the observation, or nothing ----
  const supplied = input.runicPowerDeficit;
  const deficit =
    supplied === undefined
      ? runicPowerDeficitPoints(input.runicPower)
      : supplied.state === "KNOWN_NUMBER"
        ? supplied.value
        : null;
  if (supplied !== undefined) {
    bound.push({
      key: RUNIC_POWER_DEFICIT,
      actionToken: null,
      value: { kind: "MAGNITUDE", binding: supplied },
    });
  } else {
    bound.push(
      deficit === null ? notEstablished(RUNIC_POWER_DEFICIT) : magnitude(RUNIC_POWER_DEFICIT, deficit),
    );
  }
  const rune = runeCount(input.runes);
  bound.push(rune === null ? notEstablished(RUNE) : magnitude(RUNE, rune));

  // ---- the clock ----
  const timeSeconds = input.fightTimeMs / 1000;
  bound.push(magnitude(TIME, timeSeconds));

  return {
    specAtoms: { vocabulary: BLOOD_ATOM_VOCABULARY, bound },
    diagnostics: {
      runes: input.runes,
      runicPower: input.runicPower,
      runicPowerDeficit: deficit,
      rune,
      heroTreeBound,
      timeSeconds,
    },
  };
}
