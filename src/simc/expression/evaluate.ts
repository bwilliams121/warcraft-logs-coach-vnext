/**
 * Evaluation of the supported SimulationCraft expression subset.
 *
 * THE ONE IDEA HERE: CORRELATED UNRESOLVED ATOMS.
 *
 * `buff.darkest_night.up` is understood syntax whose value we do not know. The
 * naive treatment — "unknown, so the answer is unknown" — throws away real
 * information, because the same unknown appears in BOTH branches of the pinned
 * spend gate and the two occurrences are the SAME fact:
 *
 *     !buff.darkest_night.up&combo_points>=5 | buff.darkest_night.up&combo_points.deficit=0
 *
 * At combo_points = 3 of a maximum 7:
 *
 *     DN = false  ->  (!false & 3>=5) | (false & 4=0)  ->  (true & false) | false  ->  FALSE
 *     DN = true   ->  (!true  & 3>=5) | (true  & 4=0)  ->  false | (true & false)  ->  FALSE
 *
 * Both resolutions agree, so the condition is PROVABLY FALSE even though the
 * atom is unresolved. Treating the two occurrences as independent unknowns
 * loses that proof entirely.
 *
 * The technique is exhaustive enumeration over the assignments of the
 * unresolved boolean atoms — a truth table, nothing more. With `k` unresolved
 * atoms there are `2^k` worlds; each world binds every occurrence of an atom to
 * the SAME value, which is exactly the correlation contract. Aggregate:
 *
 *     every world TRUE   ->  TRUE
 *     every world FALSE  ->  FALSE
 *     otherwise          ->  UNRESOLVED
 *
 * This is not a theorem prover and must not become one. `k` is capped, and past
 * the cap the evaluator declines rather than growing.
 *
 * Numeric atoms are never enumerated. They are supplied as exact values or the
 * caller fails closed before reaching here — see the combo-point adapter.
 *
 * SimulationCraft semantics: expressions are numeric, zero is false, logical
 * operators and comparisons yield 1 or 0.
 */

import { collectAtomKeys, type ComparisonOperator, type ExpressionNode } from "./ast.js";

/**
 * The most unresolved boolean atoms this evaluator will enumerate.
 *
 * Four atoms is sixteen worlds. The cap exists so an authority condition nobody
 * anticipated cannot turn one decision point into an exponential walk; past it
 * the evaluator reports insufficient support instead.
 */
export const MAX_UNRESOLVED_ATOMS = 4;

/**
 * Exact numeric state, plus any buff values that are actually known.
 *
 * Both combo-point values are REQUIRED numbers. A caller that cannot establish
 * one must fail closed before evaluating rather than passing a placeholder —
 * the type is what stops a default from being invented here.
 */
export interface AtomBindings {
  readonly comboPoints: number;
  readonly comboPointsDeficit: number;
  /** Buffs whose state IS established. Everything else becomes an unresolved atom. */
  readonly knownBuffs: readonly { readonly name: string; readonly up: boolean }[];
}

export type TraceAtomBinding = "KNOWN" | "UNRESOLVED_BOOLEAN";

/** JSON-safe: arrays and records only, no Map, no undefined. */
export interface TraceAtom {
  readonly key: string;
  readonly binding: TraceAtomBinding;
  /** The exact value when KNOWN; `null` when the atom is unresolved. */
  readonly value: number | null;
}

export interface TraceWorld {
  readonly assignment: readonly { readonly atom: string; readonly up: boolean }[];
  readonly result: boolean;
}

export type TraceAggregate = "TRUE" | "FALSE" | "UNRESOLVED";

export type TraceAggregateRule = "NO_UNRESOLVED_ATOMS" | "INVARIANT_ACROSS_WORLDS" | "WORLDS_DISAGREE";

export interface ExpressionTrace {
  readonly expressionRaw: string;
  readonly atoms: readonly TraceAtom[];
  readonly worlds: readonly TraceWorld[];
  readonly aggregate: TraceAggregate;
  readonly aggregateRule: TraceAggregateRule;
}

export type ExpressionEvaluation =
  | { readonly outcome: "RESOLVED"; readonly value: boolean; readonly trace: ExpressionTrace }
  | { readonly outcome: "UNRESOLVED"; readonly trace: ExpressionTrace }
  | {
      readonly outcome: "UNSUPPORTED";
      readonly reason: "TOO_MANY_UNRESOLVED_ATOMS";
      readonly unresolvedAtomCount: number;
      readonly expressionRaw: string;
    };

function truthy(value: number): boolean {
  return value !== 0;
}

function compare(operator: ComparisonOperator, left: number, right: number): number {
  switch (operator) {
    case ">=":
      return left >= right ? 1 : 0;
    case "=":
      return left === right ? 1 : 0;
    case "<":
      return left < right ? 1 : 0;
  }
}

/**
 * Evaluates the AST inside ONE world.
 *
 * Every atom resolves to an exact number here — numerics from the bindings,
 * buffs from the bindings or from this world's assignment — so the result is
 * always definite. There is no three-valued logic in this function, and that is
 * deliberate: uncertainty is handled by enumerating worlds, not by short-
 * circuiting through an unknown.
 */
function evaluateInWorld(
  node: ExpressionNode,
  bindings: AtomBindings,
  world: ReadonlyMap<string, boolean>,
): number {
  switch (node.kind) {
    case "NUMBER":
      return node.value;
    case "COMBO_POINTS":
      return bindings.comboPoints;
    case "COMBO_POINTS_DEFICIT":
      return bindings.comboPointsDeficit;
    case "BUFF_UP": {
      const known = bindings.knownBuffs.find((entry) => entry.name === node.buffName);
      if (known !== undefined) return known.up ? 1 : 0;
      const assigned = world.get(`buff.${node.buffName}.up`);
      // Unreachable: every unresolved atom is assigned in every world.
      return assigned === true ? 1 : 0;
    }
    case "NOT":
      return truthy(evaluateInWorld(node.operand, bindings, world)) ? 0 : 1;
    case "COMPARISON":
      return compare(
        node.operator,
        evaluateInWorld(node.left, bindings, world),
        evaluateInWorld(node.right, bindings, world),
      );
    case "AND":
      return truthy(evaluateInWorld(node.left, bindings, world)) &&
        truthy(evaluateInWorld(node.right, bindings, world))
        ? 1
        : 0;
    case "OR":
      return truthy(evaluateInWorld(node.left, bindings, world)) ||
        truthy(evaluateInWorld(node.right, bindings, world))
        ? 1
        : 0;
  }
}

function knownValueFor(key: string, bindings: AtomBindings): number | null {
  if (key === "combo_points") return bindings.comboPoints;
  if (key === "combo_points.deficit") return bindings.comboPointsDeficit;
  const buff = /^buff\.(.+)\.up$/.exec(key);
  if (buff !== null) {
    const name = buff[1];
    const known = name === undefined ? undefined : bindings.knownBuffs.find((e) => e.name === name);
    if (known !== undefined) return known.up ? 1 : 0;
  }
  return null;
}

/**
 * Evaluates a parsed condition against exact state plus correlated unknowns.
 *
 * The returned trace records every atom, every enumerated world and the rule
 * that produced the aggregate, so a finding can answer "why did it tell me
 * this?" without re-running anything.
 */
export function evaluateSimcExpression(
  ast: ExpressionNode,
  expressionRaw: string,
  bindings: AtomBindings,
): ExpressionEvaluation {
  const keys = collectAtomKeys(ast);

  const atoms: TraceAtom[] = [];
  const unresolved: string[] = [];
  for (const key of keys) {
    const value = knownValueFor(key, bindings);
    if (value === null) {
      unresolved.push(key);
      atoms.push({ key, binding: "UNRESOLVED_BOOLEAN", value: null });
    } else {
      atoms.push({ key, binding: "KNOWN", value });
    }
  }

  if (unresolved.length > MAX_UNRESOLVED_ATOMS) {
    return {
      outcome: "UNSUPPORTED",
      reason: "TOO_MANY_UNRESOLVED_ATOMS",
      unresolvedAtomCount: unresolved.length,
      expressionRaw,
    };
  }

  const worldCount = 2 ** unresolved.length;
  const worlds: TraceWorld[] = [];
  for (let mask = 0; mask < worldCount; mask += 1) {
    const assignmentMap = new Map<string, boolean>();
    const assignment: { atom: string; up: boolean }[] = [];
    for (let bit = 0; bit < unresolved.length; bit += 1) {
      const key = unresolved[bit];
      if (key === undefined) continue;
      const up = (mask & (1 << bit)) !== 0;
      assignmentMap.set(key, up);
      assignment.push({ atom: key, up });
    }
    worlds.push({ assignment, result: truthy(evaluateInWorld(ast, bindings, assignmentMap)) });
  }

  const allTrue = worlds.every((world) => world.result);
  const allFalse = worlds.every((world) => !world.result);

  const aggregateRule: TraceAggregateRule =
    unresolved.length === 0
      ? "NO_UNRESOLVED_ATOMS"
      : allTrue || allFalse
        ? "INVARIANT_ACROSS_WORLDS"
        : "WORLDS_DISAGREE";

  const aggregate: TraceAggregate = allTrue ? "TRUE" : allFalse ? "FALSE" : "UNRESOLVED";
  const trace: ExpressionTrace = { expressionRaw, atoms, worlds, aggregate, aggregateRule };

  if (allTrue) return { outcome: "RESOLVED", value: true, trace };
  if (allFalse) return { outcome: "RESOLVED", value: false, trace };
  return { outcome: "UNRESOLVED", trace };
}
