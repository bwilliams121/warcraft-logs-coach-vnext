/**
 * The Retribution Paladin atom resolver (M11-A4).
 *
 * WHAT THIS IS
 *
 * The specialization-owned half of the resolver seam. The shared parser
 * admits the identifiers `vocabulary.ts` declares; THIS module says what each
 * one is worth at one decision point, from the Holy Power observation, the
 * aura bindings and the pinned facts, and nothing else. Every value it binds
 * is a positive claim with a named source; everything it cannot establish it
 * leaves unbound or UNKNOWN, and the shared evaluator enumerates an unbound
 * truth and refuses an unbound magnitude.
 *
 * THE IDENTIFIERS, ONE BY ONE
 *
 *   holy_power
 *       KNOWN from the decision cast's own PRE_COST Holy Power entry
 *       (`holy-power.ts`); UNKNOWN_NUMBER / STATE_NOT_ESTABLISHED on a free
 *       cast or when the wire carries no entry. Never replayed.
 *   variable.ds_castable
 *       The PINNED value expression of `finishers[0]`, evaluated by the
 *       SHARED evaluator against the same aura bindings the scan will use,
 *       with `active_enemies` unbound. Bound TRUE or FALSE only when the
 *       evaluation RESOLVES — every enumeration of the unbound atoms agrees;
 *       left unbound (enumerated by the scan) otherwise. One named variable,
 *       one pinned expression, no assignment engine.
 *   variable.pre_es_wake
 *       KNOWN 0: `precombat[7] variable,name=pre_es_wake,op=reset,default=0`
 *       and no in-combat assignment (verified by the extractor).
 *   active_enemies
 *       UNKNOWN_NUMBER / STATE_NOT_MODELLED. Never bound.
 *   cooldown.hammer_of_wrath.charges
 *       UNKNOWN_NUMBER / STATE_NOT_MODELLED. Final Verdict resets the
 *       cooldown on an unobservable proc (sc_paladin_retribution.cpp:720-729),
 *       so no charge count is soundly derivable in A4.
 *   gcd
 *       UNKNOWN_NUMBER / STATE_NOT_MODELLED. No GCD-length model.
 */

import { knownNumber, unknownNumber, type AtomBindings } from "../../../simc/expression/evaluate.js";
import { evaluateSimcExpression } from "../../../simc/expression/evaluate.js";
import { parseSimcExpression } from "../../../simc/expression/parse.js";
import type { SpecAtomBinding, SpecAtomBindings } from "../../../simc/expression/spec-vocabulary.js";
import type { HolyPowerObservation } from "./holy-power.js";
import {
  ACTIVE_ENEMIES,
  COOLDOWN_HAMMER_OF_WRATH_CHARGES,
  DS_CASTABLE_VALUE_EXPRESSION,
  GCD,
  HOLY_POWER,
  RETRIBUTION_ATOM_VOCABULARY,
  VARIABLE_DS_CASTABLE,
  VARIABLE_PRE_ES_WAKE,
} from "./vocabulary.js";

/** `precombat[7] variable,name=pre_es_wake,op=reset,default=0`; never assigned in combat. */
export const PRE_ES_WAKE_VALUE = 0;

export interface RetributionResolverInput {
  /** The Holy Power the decision cast observed. */
  readonly holyPower: HolyPowerObservation;
  /**
   * The bindings the scan will evaluate against — buffs, stacks, talents,
   * cooldowns — WITHOUT the spec atoms (this module produces those). The
   * `ds_castable` value is evaluated over exactly these, so the variable and
   * the scan cannot disagree about an aura.
   */
  readonly sharedBindings: Omit<AtomBindings, "specAtoms">;
}

/** How `variable.ds_castable` was decided, for the payload and for tests. */
export type DsCastableResolution =
  | { readonly state: "BOUND"; readonly value: boolean }
  | {
      readonly state: "UNBOUND";
      readonly reason:
        "VALUE_EXPRESSION_UNRESOLVED" | "VALUE_EXPRESSION_UNSUPPORTED" | "VALUE_EXPRESSION_UNPARSEABLE";
      readonly detail: string;
    };

export interface RetributionResolverDiagnostics {
  readonly dsCastable: DsCastableResolution;
  readonly holyPower: HolyPowerObservation;
}

export interface RetributionResolution {
  readonly specAtoms: SpecAtomBindings;
  readonly diagnostics: RetributionResolverDiagnostics;
}

function truth(key: string, value: boolean): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "TRUTH", value } };
}

function magnitude(key: string, value: number): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "MAGNITUDE", binding: knownNumber(value) } };
}

function notModelled(key: string): SpecAtomBinding {
  return {
    key,
    actionToken: null,
    value: { kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") },
  };
}

function notEstablished(key: string): SpecAtomBinding {
  return {
    key,
    actionToken: null,
    value: { kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_ESTABLISHED") },
  };
}

/**
 * Evaluates the pinned `ds_castable` value expression with the shared
 * evaluator. `active_enemies` is stated UNKNOWN so the disjunction it opens
 * resolves only when its other disjunct or the conjunction settles it.
 */
export function resolveDsCastable(sharedBindings: Omit<AtomBindings, "specAtoms">): DsCastableResolution {
  const parsed = parseSimcExpression(DS_CASTABLE_VALUE_EXPRESSION, RETRIBUTION_ATOM_VOCABULARY);
  if (!parsed.ok) {
    return {
      state: "UNBOUND",
      reason: "VALUE_EXPRESSION_UNPARSEABLE",
      detail: "the pinned ds_castable value expression did not parse under the Retribution vocabulary",
    };
  }
  const bindings: AtomBindings = {
    ...sharedBindings,
    specAtoms: { vocabulary: RETRIBUTION_ATOM_VOCABULARY, bound: [notModelled(ACTIVE_ENEMIES)] },
  };
  const result = evaluateSimcExpression(parsed.ast, DS_CASTABLE_VALUE_EXPRESSION, bindings);
  if (result.outcome === "RESOLVED") return { state: "BOUND", value: result.value };
  if (result.outcome === "UNRESOLVED") {
    return {
      state: "UNBOUND",
      reason: "VALUE_EXPRESSION_UNRESOLVED",
      detail:
        "the pinned ds_castable value expression does not resolve under every enumeration of its unbound atoms",
    };
  }
  return {
    state: "UNBOUND",
    reason: "VALUE_EXPRESSION_UNSUPPORTED",
    detail: `the shared evaluator refused the pinned ds_castable value expression: ${result.reason}`,
  };
}

/** Binds every declared atom this evidence supports; leaves the rest unbound. */
export function resolveRetributionAtoms(input: RetributionResolverInput): RetributionResolution {
  const bound: SpecAtomBinding[] = [];

  // ---- holy_power: the observation, or nothing ----
  if (input.holyPower.state === "EXACT_PRE_COST") bound.push(magnitude(HOLY_POWER, input.holyPower.amount));
  else bound.push(notEstablished(HOLY_POWER));

  // ---- variable.ds_castable: the pinned value expression, shared evaluator ----
  const dsCastable = resolveDsCastable(input.sharedBindings);
  if (dsCastable.state === "BOUND") bound.push(truth(VARIABLE_DS_CASTABLE, dsCastable.value));

  // ---- the pinned constant ----
  bound.push(magnitude(VARIABLE_PRE_ES_WAKE, PRE_ES_WAKE_VALUE));

  // ---- magnitudes this build models nothing of, stated as such ----
  bound.push(notModelled(ACTIVE_ENEMIES));
  bound.push(notModelled(COOLDOWN_HAMMER_OF_WRATH_CHARGES));
  bound.push(notModelled(GCD));

  return {
    specAtoms: { vocabulary: RETRIBUTION_ATOM_VOCABULARY, bound },
    diagnostics: { dsCastable, holyPower: input.holyPower },
  };
}
