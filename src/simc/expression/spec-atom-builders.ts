/**
 * Result-shape constructors for specialization atom bindings (M11-D2-B1).
 *
 * A specialization's resolver decides what each of its atoms MEANS and what
 * the evidence establishes about it; these functions only build the binding
 * that carries the answer. Nothing here knows an atom name, a resource, a
 * buff, a talent or a hero tree: every key and every value is the caller's.
 *
 *     truthAtom             TRUTH, established
 *     magnitudeAtom         MAGNITUDE, an exact number
 *     notModelledAtom       MAGNITUDE, UNKNOWN_NUMBER / STATE_NOT_MODELLED
 *     notEstablishedAtom    MAGNITUDE, UNKNOWN_NUMBER / STATE_NOT_ESTABLISHED
 *     heroTreeTruths        the caller's hero-tree atoms, all or none
 *     resourceFieldsNotModelled
 *                           the evaluator's three always-stated resource fields
 *                           for a specialization that models none of them
 *
 * Proven equal to the specialization implementations on committed evidence by
 * tests/contracts/m11d2b1-shared-plumbing-equivalence.test.ts. No public
 * analyzer imports this module.
 */

import type { HeroTreeResolution } from "../../data/game/talent-selection.js";
import { knownNumber, unknownNumber, type AtomBindings } from "./evaluate.js";
import type { SpecAtomBinding } from "./spec-vocabulary.js";

export function truthAtom(key: string, value: boolean, actionToken: string | null = null): SpecAtomBinding {
  return { key, actionToken, value: { kind: "TRUTH", value } };
}

export function magnitudeAtom(
  key: string,
  value: number,
  actionToken: string | null = null,
): SpecAtomBinding {
  return { key, actionToken, value: { kind: "MAGNITUDE", binding: knownNumber(value) } };
}

/** Declared, and deliberately not modelled: no model exists for this state. */
export function notModelledAtom(key: string, actionToken: string | null = null): SpecAtomBinding {
  return { key, actionToken, value: { kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") } };
}

/** Modelled, and not established by this evidence. */
export function notEstablishedAtom(key: string, actionToken: string | null = null): SpecAtomBinding {
  return { key, actionToken, value: { kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_ESTABLISHED") } };
}

/** One hero-tree atom and the resolved tree name that makes it TRUE. */
export interface HeroTreeAtom {
  readonly key: string;
  readonly simcName: string;
}

export interface HeroTreeTruths {
  readonly bindings: readonly SpecAtomBinding[];
  /** The tree that bound TRUE, or `null` when nothing was bound. */
  readonly bound: string | null;
}

/**
 * The caller's hero-tree atoms, ALL OR NONE, in the caller's order.
 *
 * Bound only when the build RESOLVED to one of the listed trees: each atom is
 * TRUE for its own tree and FALSE for the others. A tree outside the list, a
 * contradictory resolution and an unknown one bind nothing — never FALSE for
 * every listed tree, which would assert a build fact nobody observed.
 */
export function heroTreeTruths(heroTree: HeroTreeResolution, atoms: readonly HeroTreeAtom[]): HeroTreeTruths {
  if (heroTree.state !== "RESOLVED") return { bindings: [], bound: null };
  const resolved = heroTree.simcName;
  if (!atoms.some((atom) => atom.simcName === resolved)) return { bindings: [], bound: null };
  return {
    bindings: atoms.map((atom) => truthAtom(atom.key, atom.simcName === resolved)),
    bound: resolved,
  };
}

/**
 * The evaluator's three always-stated resource fields, each declared and not
 * modelled, for a specialization whose resolver models none of them. A
 * specialization that does model one states its own.
 */
export function resourceFieldsNotModelled(): Pick<
  AtomBindings,
  "comboPoints" | "comboPointsDeficit" | "energyPct"
> {
  return {
    comboPoints: unknownNumber("STATE_NOT_MODELLED"),
    comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
    energyPct: unknownNumber("STATE_NOT_MODELLED"),
  };
}
