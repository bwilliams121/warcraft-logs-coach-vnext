/**
 * Evaluation of the supported SimulationCraft expression subset.
 *
 * TWO IDEAS, AND THEY MUST NOT BE CONFUSED WITH EACH OTHER.
 *
 * 1. CORRELATED UNRESOLVED BOOLEAN ATOMS.
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
 * unresolved BOOLEAN atoms — a truth table, nothing more. With `k` unresolved
 * boolean atoms there are `2^k` worlds; each world binds every occurrence of an
 * atom to the SAME value, which is exactly the correlation contract.
 *
 * This is not a theorem prover and must not become one. `k` is capped, and past
 * the cap the evaluator declines rather than growing.
 *
 * 2. UNKNOWN NUMBERS, WHICH ARE NEVER ENUMERATED.
 *
 * `fight_remains` and `buff.<name>.remains` are magnitudes. Enumerating a
 * magnitude over {0, 1} would let `buff.envenom.remains<=1` come out decidable
 * from two invented durations — a confident verdict resting on numbers nobody
 * observed. So an unavailable magnitude becomes UNKNOWN_NUMBER, it contributes
 * NOTHING to the world count, and any comparison touching it yields
 * UNKNOWN_STATE.
 *
 * Inside each world the truth domain is therefore three-valued:
 *
 *     TRUE   FALSE   UNKNOWN_STATE
 *
 * with Kleene semantics, symmetric in both operand orders:
 *
 *     TRUE  | X = TRUE        FALSE & X = FALSE
 *     FALSE | X = X           TRUE  & X = X
 *     !UNKNOWN_STATE = UNKNOWN_STATE
 *
 * `TRUE | UNKNOWN_STATE = TRUE` is what lets `energy.pct>70|fight_remains<15`
 * resolve TRUE at 100% energy without anyone pretending to know how long the
 * fight had left.
 *
 * WHAT IS DELIBERATELY OUTSIDE THIS DOMAIN: UNSUPPORTED SYNTAX.
 *
 * An unsupported operator or identifier fails the WHOLE expression at parse
 * time and never produces an AST, so it can never arrive here as
 * UNKNOWN_STATE. That separation is the difference between "we understand the
 * question and lack the state" and "we did not understand the question", and
 * the two must never be reported as each other.
 *
 * `fight_remains` HAS NO BINDING FIELD AT ALL, and that is deliberate. It is
 * PREDICTIVE: the player did not know it at the moment of play. M4 exposes
 * `observedFightEndDelta`, which is the RETROSPECTIVE historical outcome and is
 * explicitly not `fight_remains`. Leaving out the field means the hindsight
 * shortcut cannot be taken by a future caller without editing this type.
 *
 * SimulationCraft semantics: expressions are numeric, zero is false, logical
 * operators and comparisons yield 1 or 0.
 */

import { collectAtoms, type AtomShape, type ComparisonOperator, type ExpressionNode } from "./ast.js";

/**
 * The most unresolved BOOLEAN atoms this evaluator will enumerate.
 *
 * Four atoms is sixteen worlds. The cap exists so an authority condition nobody
 * anticipated cannot turn one decision point into an exponential walk; past it
 * the evaluator reports insufficient support instead.
 *
 * UNKNOWN_NUMBER atoms are not enumerated and do not count toward this cap.
 */
export const MAX_UNRESOLVED_ATOMS = 4;

/** Why a magnitude could not be supplied. Each is a different remedy. */
export type UnknownNumberReason =
  /**
   * The value depends on information the player did not possess at the moment
   * of play. Not a gap in our evidence — a gap in what was knowable.
   */
  | "PREDICTIVE_NOT_PLAYER_KNOWABLE"
  /** Understood syntax for state this build reconstructs no model of. */
  | "STATE_NOT_MODELLED"
  /** A model exists, and the evidence for this decision point fell short. */
  | "STATE_NOT_ESTABLISHED";

export const UNKNOWN_NUMBER_REASONS = [
  "PREDICTIVE_NOT_PLAYER_KNOWABLE",
  "STATE_NOT_MODELLED",
  "STATE_NOT_ESTABLISHED",
] as const satisfies readonly UnknownNumberReason[];

/**
 * One magnitude the caller may or may not be able to supply.
 *
 * A discriminated union rather than `number | null`, so "we do not know the
 * energy" is a statement a caller has to write down rather than an omission
 * that reads as zero.
 */
export type NumericBinding =
  | { readonly state: "KNOWN_NUMBER"; readonly value: number }
  | { readonly state: "UNKNOWN_NUMBER"; readonly reason: UnknownNumberReason };

export function knownNumber(value: number): NumericBinding {
  return { state: "KNOWN_NUMBER", value };
}

export function unknownNumber(reason: UnknownNumberReason): NumericBinding {
  return { state: "UNKNOWN_NUMBER", reason };
}

/** The three-valued truth domain inside one world. */
export type TruthValue = "TRUE" | "FALSE" | "UNKNOWN_STATE";

export const TRUTH_VALUES = ["TRUE", "FALSE", "UNKNOWN_STATE"] as const satisfies readonly TruthValue[];

/**
 * Exact numeric state, plus any buff values that are actually known.
 *
 * Both combo-point values are REQUIRED plain numbers: a caller that cannot
 * establish one must fail closed before evaluating rather than passing a
 * placeholder. `energyPct` is a REQUIRED `NumericBinding` for the same reason
 * pointed the other way — a caller with no energy observation has to say so
 * explicitly, and cannot reach UNKNOWN by forgetting.
 *
 * There is no `fightRemains` and no `buffRemains`. See the module header.
 */
export interface AtomBindings {
  readonly comboPoints: number;
  readonly comboPointsDeficit: number;
  /** `energy.pct`, 0-100. Must be stated, even when it is unknown. */
  readonly energyPct: NumericBinding;
  /** Buffs whose state IS established. Everything else becomes an unresolved atom. */
  readonly knownBuffs: readonly { readonly name: string; readonly up: boolean }[];
}

export type TraceAtomBinding = "KNOWN" | "UNRESOLVED_BOOLEAN" | "UNKNOWN_NUMBER";

/** JSON-safe: arrays and records only, no Map, no undefined. */
export interface TraceAtom {
  readonly key: string;
  readonly shape: AtomShape;
  readonly binding: TraceAtomBinding;
  /** The exact value when KNOWN; `null` when the atom is unresolved. */
  readonly value: number | null;
  /** Present only for UNKNOWN_NUMBER, so a finding can say which gap this was. */
  readonly unknownNumberReason: UnknownNumberReason | null;
}

export interface TraceWorld {
  readonly assignment: readonly { readonly atom: string; readonly up: boolean }[];
  /**
   * The world's outcome, as ONE canonical field.
   *
   * Three-valued rather than boolean: a world can genuinely be undecided when a
   * magnitude is unknown. There is deliberately no parallel boolean field,
   * because two fields describing one outcome can disagree.
   */
  readonly result: TruthValue;
}

export type TraceAggregate = "TRUE" | "FALSE" | "UNRESOLVED";

export type TraceAggregateRule =
  /** Nothing was unresolved: one world, decided outright. */
  | "NO_UNRESOLVED_ATOMS"
  /** Boolean atoms were enumerated and every world agreed. */
  | "INVARIANT_ACROSS_WORLDS"
  /** Boolean worlds reached different definite answers. */
  | "WORLDS_DISAGREE"
  /** Every world was itself undecided, because a magnitude was unknown. */
  | "UNKNOWN_STATE_IN_EVERY_WORLD"
  /** Some worlds decided and at least one was undecided. */
  | "WORLDS_MIXED_WITH_UNKNOWN_STATE";

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

// --------------------------------------------------------------------------
// The value domain of one world
// --------------------------------------------------------------------------

/**
 * A magnitude that is not known.
 *
 * A unique symbol rather than `null` or `NaN`: neither of those can be confused
 * with a resource amount, but both are things arithmetic silently accepts. A
 * symbol makes every place that forgets to handle the unknown case a type
 * error.
 */
const UNKNOWN: unique symbol = Symbol("UNKNOWN_NUMBER");

type WorldValue = number | typeof UNKNOWN;

function isUnknownValue(value: WorldValue): value is typeof UNKNOWN {
  return value === UNKNOWN;
}

/** SimulationCraft has no boolean type: zero is false, everything else is true. */
function truthOf(value: WorldValue): TruthValue {
  if (isUnknownValue(value)) return "UNKNOWN_STATE";
  return value !== 0 ? "TRUE" : "FALSE";
}

/** Back into the numeric domain, so logical results can nest as operands. */
function valueOf(truth: TruthValue): WorldValue {
  if (truth === "TRUE") return 1;
  if (truth === "FALSE") return 0;
  return UNKNOWN;
}

/**
 * Kleene AND. Symmetric by construction, so both operand orders agree.
 *
 *     FALSE & anything      = FALSE   (even UNKNOWN_STATE)
 *     TRUE  & UNKNOWN_STATE = UNKNOWN_STATE
 */
function andTruth(left: TruthValue, right: TruthValue): TruthValue {
  if (left === "FALSE" || right === "FALSE") return "FALSE";
  if (left === "TRUE" && right === "TRUE") return "TRUE";
  return "UNKNOWN_STATE";
}

/**
 * Kleene OR. Symmetric by construction.
 *
 *     TRUE  | anything      = TRUE    (even UNKNOWN_STATE)
 *     FALSE | UNKNOWN_STATE = UNKNOWN_STATE
 */
function orTruth(left: TruthValue, right: TruthValue): TruthValue {
  if (left === "TRUE" || right === "TRUE") return "TRUE";
  if (left === "FALSE" && right === "FALSE") return "FALSE";
  return "UNKNOWN_STATE";
}

function notTruth(operand: TruthValue): TruthValue {
  if (operand === "TRUE") return "FALSE";
  if (operand === "FALSE") return "TRUE";
  return "UNKNOWN_STATE";
}

function compare(operator: ComparisonOperator, left: number, right: number): number {
  switch (operator) {
    case ">=":
      return left >= right ? 1 : 0;
    case ">":
      return left > right ? 1 : 0;
    case "=":
      return left === right ? 1 : 0;
    case "<":
      return left < right ? 1 : 0;
    case "<=":
      return left <= right ? 1 : 0;
  }
}

/**
 * Evaluates the AST inside ONE world.
 *
 * Buff atoms resolve to exact numbers here — from the bindings or from this
 * world's assignment — because they are enumerated. Magnitudes may be UNKNOWN,
 * and that unknown propagates through comparisons into the three-valued logic
 * rather than short-circuiting into a number.
 */
function evaluateInWorld(
  node: ExpressionNode,
  bindings: AtomBindings,
  world: ReadonlyMap<string, boolean>,
): WorldValue {
  switch (node.kind) {
    case "NUMBER":
      return node.value;
    case "COMBO_POINTS":
      return bindings.comboPoints;
    case "COMBO_POINTS_DEFICIT":
      return bindings.comboPointsDeficit;
    case "ENERGY_PCT":
      return bindings.energyPct.state === "KNOWN_NUMBER" ? bindings.energyPct.value : UNKNOWN;
    case "FIGHT_REMAINS":
      // No binding field exists, and none may be added without deciding that
      // hindsight is admissible. See the module header.
      return UNKNOWN;
    case "BUFF_REMAINS":
      // Understood syntax; this build reconstructs no aura duration.
      return UNKNOWN;
    case "BUFF_UP": {
      const known = bindings.knownBuffs.find((entry) => entry.name === node.buffName);
      if (known !== undefined) return known.up ? 1 : 0;
      const assigned = world.get(`buff.${node.buffName}.up`);
      // Unreachable: every unresolved boolean atom is assigned in every world.
      return assigned === true ? 1 : 0;
    }
    case "NOT":
      return valueOf(notTruth(truthOf(evaluateInWorld(node.operand, bindings, world))));
    case "COMPARISON": {
      const left = evaluateInWorld(node.left, bindings, world);
      const right = evaluateInWorld(node.right, bindings, world);
      // A comparison against a magnitude nobody established is undecided. It is
      // NOT false, and it is NOT an excuse to pick a bound.
      if (isUnknownValue(left) || isUnknownValue(right)) return UNKNOWN;
      return compare(node.operator, left, right);
    }
    case "AND":
      return valueOf(
        andTruth(
          truthOf(evaluateInWorld(node.left, bindings, world)),
          truthOf(evaluateInWorld(node.right, bindings, world)),
        ),
      );
    case "OR":
      return valueOf(
        orTruth(
          truthOf(evaluateInWorld(node.left, bindings, world)),
          truthOf(evaluateInWorld(node.right, bindings, world)),
        ),
      );
  }
}

/** The binding of one atom, decided once, before any world is built. */
interface ResolvedAtom {
  readonly trace: TraceAtom;
  /** True only for BOOLEAN atoms with no known value: these get enumerated. */
  readonly enumerate: boolean;
}

function resolveAtom(key: string, shape: AtomShape, bindings: AtomBindings): ResolvedAtom {
  const known = (value: number): ResolvedAtom => ({
    trace: { key, shape, binding: "KNOWN", value, unknownNumberReason: null },
    enumerate: false,
  });
  const unknownNumeric = (reason: UnknownNumberReason): ResolvedAtom => ({
    trace: { key, shape, binding: "UNKNOWN_NUMBER", value: null, unknownNumberReason: reason },
    enumerate: false,
  });

  if (key === "combo_points") return known(bindings.comboPoints);
  if (key === "combo_points.deficit") return known(bindings.comboPointsDeficit);
  if (key === "energy.pct") {
    return bindings.energyPct.state === "KNOWN_NUMBER"
      ? known(bindings.energyPct.value)
      : unknownNumeric(bindings.energyPct.reason);
  }
  if (key === "fight_remains") return unknownNumeric("PREDICTIVE_NOT_PLAYER_KNOWABLE");

  if (shape === "NUMERIC") {
    // `buff.<name>.remains` and anything numeric added later without a binding.
    return unknownNumeric("STATE_NOT_MODELLED");
  }

  const buff = /^buff\.(.+)\.up$/.exec(key);
  const name = buff?.[1];
  const knownBuff = name === undefined ? undefined : bindings.knownBuffs.find((e) => e.name === name);
  if (knownBuff !== undefined) return known(knownBuff.up ? 1 : 0);

  return {
    trace: { key, shape, binding: "UNRESOLVED_BOOLEAN", value: null, unknownNumberReason: null },
    enumerate: true,
  };
}

function aggregateRuleFor(
  worlds: readonly TraceWorld[],
  enumeratedCount: number,
  hasUnknownNumber: boolean,
): TraceAggregateRule {
  const anyUnknown = worlds.some((world) => world.result === "UNKNOWN_STATE");
  if (anyUnknown) {
    return worlds.every((world) => world.result === "UNKNOWN_STATE")
      ? "UNKNOWN_STATE_IN_EVERY_WORLD"
      : "WORLDS_MIXED_WITH_UNKNOWN_STATE";
  }
  if (enumeratedCount === 0 && !hasUnknownNumber) return "NO_UNRESOLVED_ATOMS";
  if (enumeratedCount === 0) {
    // An unknown magnitude existed but did not reach the result — the only
    // world is definite, so nothing was enumerated and nothing is in doubt.
    return "NO_UNRESOLVED_ATOMS";
  }
  const allTrue = worlds.every((world) => world.result === "TRUE");
  const allFalse = worlds.every((world) => world.result === "FALSE");
  return allTrue || allFalse ? "INVARIANT_ACROSS_WORLDS" : "WORLDS_DISAGREE";
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
  const atoms: TraceAtom[] = [];
  const enumerated: string[] = [];
  let hasUnknownNumber = false;

  for (const atom of collectAtoms(ast)) {
    const resolved = resolveAtom(atom.key, atom.shape, bindings);
    atoms.push(resolved.trace);
    if (resolved.enumerate) enumerated.push(atom.key);
    if (resolved.trace.binding === "UNKNOWN_NUMBER") hasUnknownNumber = true;
  }

  if (enumerated.length > MAX_UNRESOLVED_ATOMS) {
    return {
      outcome: "UNSUPPORTED",
      reason: "TOO_MANY_UNRESOLVED_ATOMS",
      unresolvedAtomCount: enumerated.length,
      expressionRaw,
    };
  }

  const worldCount = 2 ** enumerated.length;
  const worlds: TraceWorld[] = [];
  for (let mask = 0; mask < worldCount; mask += 1) {
    const assignmentMap = new Map<string, boolean>();
    const assignment: { atom: string; up: boolean }[] = [];
    for (let bit = 0; bit < enumerated.length; bit += 1) {
      const key = enumerated[bit];
      if (key === undefined) continue;
      const up = (mask & (1 << bit)) !== 0;
      assignmentMap.set(key, up);
      assignment.push({ atom: key, up });
    }
    worlds.push({ assignment, result: truthOf(evaluateInWorld(ast, bindings, assignmentMap)) });
  }

  const allTrue = worlds.every((world) => world.result === "TRUE");
  const allFalse = worlds.every((world) => world.result === "FALSE");

  const aggregate: TraceAggregate = allTrue ? "TRUE" : allFalse ? "FALSE" : "UNRESOLVED";
  const trace: ExpressionTrace = {
    expressionRaw,
    atoms,
    worlds,
    aggregate,
    aggregateRule: aggregateRuleFor(worlds, enumerated.length, hasUnknownNumber),
  };

  if (allTrue) return { outcome: "RESOLVED", value: true, trace };
  if (allFalse) return { outcome: "RESOLVED", value: false, trace };
  return { outcome: "UNRESOLVED", trace };
}
