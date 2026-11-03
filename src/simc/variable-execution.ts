/**
 * Executing one `variable` line inside a scan (M11-D3-C2).
 *
 * THE PINNED SEMANTICS (SimulationCraft 33622e9d1662ff0e451691edf85a6b49cc9d11d9)
 *
 *   options      `name=`, `value=`, `op=` (default `set`), `default=` (0),
 *                `condition=` and `value_else=` for `setif`, `delay=`, plus the
 *                ordinary action options (engine/action/variable.cpp:16-129)
 *   storage      one `action_variable_t` per name on the PLAYER, matched
 *                case-insensitively (variable.cpp:108-129). It persists: only
 *                a player reset restores `default_value_` (player.cpp:6727-6728;
 *                action_variable.hpp `reset()`), so a read sees the last value
 *                ANY earlier scan, or the precombat list, assigned
 *   execution    in the foreground scan, a ready variable action is executed
 *                and the scan CONTINUES (player.cpp:14235-14241) — inline, with
 *                no event, no time and no GCD (`trigger_gcd = 0`)
 *   readiness    `select_target()` (the target is the player), the line
 *                cooldown, then `if=` (variable.cpp:355-367): a FALSE `if=`
 *                skips the line and the value is unchanged
 *   execute      `set` evaluates `value=`; `setif` evaluates `condition=` and
 *                assigns `value=` when non-zero, else `value_else=`; `reset`
 *                restores `default=`; `add`, `sub`, `mul`, `div`, `pow`, `mod`,
 *                `min`, `max`, `floor` and `ceil` combine with the CURRENT
 *                value (variable.cpp:260-330)
 *   inert        a line with no `name=`, or an unknown `op=`, is made
 *                background and never executes (variable.cpp:52-68)
 *   cycling      `cycling_variable` executes once per non-sleeping target when
 *                there are several (variable.cpp:369-391)
 *
 * WHAT IS MODELLED
 *
 * `set`, `setif` and `reset` — the three operations whose result does not
 * depend on the value already stored, so they need no history.
 *
 * The combining operations (ONB-S2) — `add`, `sub`, `mul`, `div`, `pow`,
 * `mod`, `min`, `max`, `floor` and `ceil` — read the value as it is just
 * before the line (`variableValueBeforeWrite`: this scan's assignment, a
 * carried precombat value, else the unknown incoming value) and combine it
 * with the line's `value=` under the pinned double semantics
 * (`combineVariableValue`). An operand of unknown value yields UNKNOWN, never
 * a guessed value: a combining line on a variable no earlier line of this
 * scan or of precombat established reads an earlier scan's value, which this
 * project does not have. `floor` and `ceil` are executed only on a variable
 * SimulationCraft can never fold to a constant (`neverFoldedVariables`);
 * elsewhere they write UNKNOWN.
 *
 * Everything else that can change a value — `cycling_variable`, a line with
 * an option outside the supported set (`delay=` gates readiness on a
 * cooldown; `target_if=` on a target) — makes the variable UNKNOWN.
 * `cycling_variable` executes its operation once per enemy in the action's
 * target list whenever the sim has more than one non-sleeping target
 * (variable.cpp:369-391, action.cpp:1729-1770), with `target` bound to each in
 * turn — so both the number of executions and every per-target value depend on
 * the enemy set, which no authority here establishes (TARGET_COUNT, ONB-S3).
 *
 * `line_cd=` IS supported, and as nothing (M11-D3-C3): a variable line's
 * timer is never started. `variable_t::execute` runs inline in
 * `select_action` (player.cpp:14235-14241) and does nothing a real action does
 * (variable.cpp:258), and only `execute_action` and `do_execute` start a
 * line's timer (player.cpp:7390, action.cpp:85). So `line_cooldown->down()`
 * in `variable_t::action_ready` (variable.cpp:360) is always false, whatever
 * history says, and the line executes exactly as it would without the option.
 * A malformed value is still refused. That is never a refusal: SimulationCraft still executes the line,
 * and an unknown value is not a malformed authority.
 *
 * ONE VALUE PER NAME, AND THE LATER WRITE WINS
 *
 * Every executed assignment writes the variable, whoever else reads or seeds
 * it. A built-in (`variable.single_target`) or specialization-declared
 * `variable.<name>` is a way of READING the same variable, and a
 * specialization binding is only its INITIAL value: what reads see before this
 * scan assigns it. After the write, the scan's value is read
 * (`scanAssignedBinding`). No identifier, declaration or binding suppresses a
 * write.
 */

import { parseAplLine, type AplAction, type AplAuthority } from "./apl-authority.js";
import type { LineCondition } from "./list-selection.js";
import {
  actingAction,
  evaluateSimcExpression,
  evaluateSimcMagnitude,
  joinNumericBindings,
  knownNumber,
  oneOfNumbers,
  variableValueBeforeWrite,
  unknownNumber,
  withScanVariable,
  type AtomBindings,
  type NumericBinding,
  type ScanVariables,
} from "./expression/evaluate.js";
import { parseSimcExpression } from "./expression/parse.js";
import { lineCooldownOptionOf } from "./line-cooldown.js";

/** What one `variable` line did to the scan's variables. */
export type VariableExecutionRecord =
  | {
      /** A modelled operation ran. `executed` is UNDECIDED when `if=` was not settled: the value is the join. */
      readonly kind: "ASSIGNED";
      readonly name: string;
      readonly operation: "SET" | "SETIF" | "RESET" | CombiningOperation;
      readonly executed: "PROVEN" | "UNDECIDED";
      readonly value: NumericBinding;
    }
  | { readonly kind: "CONDITION_FALSE"; readonly name: string }
  | {
      /** Pinned to change no value: no `name=` (made background), or `op=print`. */
      readonly kind: "INERT";
      readonly reason: "NO_NAME" | "PRINT";
    }
  | {
      /** The value is not modelled; the variable — or, with no attributable name, every variable — reads UNKNOWN. */
      readonly kind: "NOT_MODELLED";
      readonly name: string | null;
      readonly reason:
        | "OPERATION"
        | "CYCLING_VARIABLE"
        | "CONSTANT_FOLDING"
        | "UNMODELLED_OPTION"
        | "MALFORMED_LINE"
        | "MISSING_EXPRESSION";
    };

/** The option keys a modelled `variable` line may carry. */
const MODELLED_OPTION_KEYS: readonly string[] = [
  "name",
  "value",
  "op",
  "if",
  "default",
  "condition",
  "value_else",
];

const DEFAULT_LITERAL = /^-?[0-9]+(?:\.[0-9]+)?$/;

/** The operations `get_operation` recognises (variable.hpp:72-88). Any other `op=` makes the line inert. */
const KNOWN_OPERATIONS: readonly string[] = [
  "set",
  "print",
  "reset",
  "add",
  "sub",
  "mul",
  "div",
  "pow",
  "mod",
  "min",
  "max",
  "floor",
  "ceil",
  "setif",
  "report",
];

/** Operations whose constructor does not require `value=` (variable.cpp:74-76). */
const VALUELESS_OPERATIONS: readonly string[] = ["floor", "ceil", "reset", "print", "report"];

/** The operations that combine with the CURRENT value (ONB-S2). */
export type CombiningOperation =
  "ADD" | "SUB" | "MUL" | "DIV" | "POW" | "MOD" | "MIN" | "MAX" | "FLOOR" | "CEIL";

const COMBINING_OPERATIONS: ReadonlyMap<string, CombiningOperation> = new Map([
  ["add", "ADD"],
  ["sub", "SUB"],
  ["mul", "MUL"],
  ["div", "DIV"],
  ["pow", "POW"],
  ["mod", "MOD"],
  ["min", "MIN"],
  ["max", "MAX"],
  ["floor", "FLOOR"],
  ["ceil", "CEIL"],
]);

/** `floor` and `ceil` read no `value=`: the constructor never parses one (variable.cpp:135-136). */
const UNARY_COMBINING_OPERATIONS: readonly CombiningOperation[] = ["FLOOR", "CEIL"];

/**
 * The value a combining line leaves (ONB-S2): `operation` applied to the
 * variable's value just before the line and the line's `value=` magnitude
 * (`null` for `floor` and `ceil`, which read none).
 *
 * THE PINNED ARITHMETIC (variable.cpp:269-311, all on doubles)
 *
 *   add, sub, mul   `current += v`, `-= v`, `*= v`
 *   div             `v == 0` sets the value to 0; else `current /= v`
 *   mod             `v == 0` sets the value to 0; else `std::fmod(current, v)`
 *                   (the value expression is evaluated twice; an expression
 *                   reads the same state both times, so it is one value)
 *   pow             `std::pow(current, v)`
 *   min, max        `std::min(current, v)`, `std::max(current, v)`: `v` when
 *                   `v < current` (min) or `current < v` (max), else `current`
 *   floor, ceil     `util::floor(current)`, `util::ceil(current)`, whose
 *                   default `decplaces` is 0 (util.hpp:308-309) — `::floor`
 *                   and `::ceil` (util.cpp:3131-3136, 3161-3166)
 *
 * IEEE-754 makes `+ - * /` correctly rounded and `fmod` exact, so the double
 * here is the double SimulationCraft computes; JavaScript's `%` is C's `fmod`.
 * `pow` is not correctly rounded by every C library, so only an exponentiation
 * whose exact result is a safe integer (integer base, non-negative integer
 * exponent) is computed; any other is UNKNOWN (`STATE_NOT_MODELLED`). A
 * non-finite input or result is UNKNOWN too, never Infinity or NaN.
 *
 * WHAT THE INPUTS MAY BE
 *
 *   UNKNOWN in either        UNKNOWN, with that input's reason — never a
 *                            guessed value
 *   BOUNDED in either        UNKNOWN (`STATE_NOT_MODELLED`): carrying a bound
 *                            through `mul`, `div` or `pow` needs sign reasoning
 *                            not done here, as for expression arithmetic
 *   exact or ONE_OF          the operation applied member by member. At most
 *                            ONE side may be a set: each member is then one
 *                            world's exact value, and its image is that world's
 *                            result. Two sets would mean pairing members whose
 *                            worlds may exclude each other — `op=add,
 *                            value=variable.x` reads the same unresolved value
 *                            twice — which would manufacture values, so it is
 *                            UNKNOWN (`STATE_NOT_MODELLED`)
 */
export function combineVariableValue(
  operation: CombiningOperation,
  current: NumericBinding,
  operand: NumericBinding | null,
): NumericBinding {
  const unary = UNARY_COMBINING_OPERATIONS.includes(operation);
  if (current.state === "UNKNOWN_NUMBER") return current;
  if (!unary) {
    if (operand === null) return unknownNumber("STATE_NOT_MODELLED");
    if (operand.state === "UNKNOWN_NUMBER") return operand;
  }
  const left = exactMembers(current);
  const right = unary ? [0] : operand === null ? null : exactMembers(operand);
  if (left === null || right === null) return unknownNumber("STATE_NOT_MODELLED");
  if (left.length > 1 && right.length > 1) return unknownNumber("STATE_NOT_MODELLED");

  const results: number[] = [];
  for (const x of left) {
    for (const v of right) {
      const result = pinnedCombination(operation, x, v);
      if (result === null) return unknownNumber("STATE_NOT_MODELLED");
      results.push(result);
    }
  }
  const set = [current, operand].find((binding) => binding?.state === "ONE_OF_NUMBERS");
  return oneOfNumbers(results, set?.state === "ONE_OF_NUMBERS" ? set.reason : "STATE_NOT_ESTABLISHED");
}

function exactMembers(binding: NumericBinding): readonly number[] | null {
  if (binding.state === "KNOWN_NUMBER") return [binding.value];
  if (binding.state === "ONE_OF_NUMBERS") return binding.values;
  return null;
}

/** One exact application, or `null` where the pinned double cannot be reproduced. */
function pinnedCombination(operation: CombiningOperation, current: number, v: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(v)) return null;
  const result = ((): number | null => {
    switch (operation) {
      case "ADD":
        return current + v;
      case "SUB":
        return current - v;
      case "MUL":
        return current * v;
      case "DIV":
        return v === 0 ? 0 : current / v;
      case "MOD":
        return v === 0 ? 0 : current % v;
      case "POW":
        return exactIntegerPower(current, v);
      case "MIN":
        return v < current ? v : current;
      case "MAX":
        return current < v ? v : current;
      case "FLOOR":
        return Math.floor(current);
      case "CEIL":
        return Math.ceil(current);
    }
  })();
  return result !== null && Number.isFinite(result) ? result : null;
}

/** `base ** exponent` when it is an exactly representable safe integer, else `null`. */
function exactIntegerPower(base: number, exponent: number): number | null {
  if (!Number.isInteger(base) || !Number.isInteger(exponent) || exponent < 0) return null;
  if (!Number.isSafeInteger(base)) return null;
  // |base| >= 2 passes 2^53 by exponent 54, so no larger exponent is computed.
  if (Math.abs(base) >= 2 && exponent > 53) return null;
  if (exponent > 53) return base === 0 ? 0 : base === 1 || exponent % 2 === 0 ? 1 : -1;
  const exact = BigInt(base) ** BigInt(exponent);
  const limit = BigInt(Number.MAX_SAFE_INTEGER);
  return exact > limit || exact < -limit ? null : Number(exact);
}

/**
 * Every variable's `default_value_`, keyed by lower-cased name (ONB-S1).
 *
 * Pinned: the value a variable holds after a player reset (player.cpp:6727-6728,
 * action_variable.hpp `reset()`) and what `op=reset` restores
 * (variable.cpp:321-323) is the `default=` of the FIRST `variable` action
 * constructed for that name — later lines with the same name find the existing
 * variable and their `default=` is ignored (variable.cpp:108-125). Actions are
 * constructed list by list in the order precombat, default, then the other
 * lists alphabetically (player.cpp:526-559, 4199-4243), and a line the
 * constructor makes background before that point — no `name=`, an unknown
 * `op=`, a missing `value=`, `condition=` or `value_else=` (variable.cpp:52-98)
 * — creates no variable.
 *
 * A name absent from the map has no established default and reads UNKNOWN. A
 * line whose structure is malformed cannot be attributed to a name, so it
 * leaves EVERY default unestablished and the map is empty. A `default=` that is
 * not a plain number is UNKNOWN for that name. The sim-level
 * `apl_variable.<name>` override (variable.cpp:43-50) belongs to a simulation
 * profile, not to the authority, and is not modelled — as for `op=reset`.
 */
export function establishedVariableDefaults(authority: AplAuthority): ReadonlyMap<string, NumericBinding> {
  const cached = defaultsByAuthority.get(authority);
  if (cached !== undefined) return cached;
  const defaults = new Map<string, NumericBinding>();
  let attributable = true;
  for (const listName of constructionOrder(authority)) {
    const lookup = authority.actionsInList(listName);
    if (!lookup.found) continue;
    for (const action of lookup.actions) {
      if (action.entryKind !== "VARIABLE_ASSIGNMENT") continue;
      const structure = parseAplLine(action.actionStringVerbatim);
      const names = structure.options.filter((option) => option.key === "name");
      if (!structure.balanced || structure.malformedSegments.length > 0 || names.length > 1) {
        attributable = false;
        continue;
      }
      const rawName = names[0]?.value;
      if (rawName === undefined || rawName.length === 0) continue;
      const name = rawName.toLowerCase();
      if (defaults.has(name)) continue;
      const written = (key: string) => structure.options.filter((option) => option.key === key);
      const value = (key: string) => written(key)[0]?.value ?? "";
      const operation = (written("op")[0]?.value ?? "set").toLowerCase();
      if (!KNOWN_OPERATIONS.includes(operation)) continue;
      if (!VALUELESS_OPERATIONS.includes(operation) && value("value").length === 0) continue;
      if (operation === "setif" && (value("condition").length === 0 || value("value_else").length === 0))
        continue;
      const defaultOptions = written("default");
      const literal = defaultOptions[0]?.value;
      defaults.set(
        name,
        defaultOptions.length === 0
          ? knownNumber(0)
          : defaultOptions.length === 1 && literal !== undefined && DEFAULT_LITERAL.test(literal)
            ? knownNumber(Number(literal))
            : unknownNumber("STATE_NOT_MODELLED"),
      );
    }
  }
  const result: ReadonlyMap<string, NumericBinding> = attributable ? defaults : new Map();
  defaultsByAuthority.set(authority, result);
  return result;
}

const defaultsByAuthority = new WeakMap<AplAuthority, ReadonlyMap<string, NumericBinding>>();

/**
 * The variables SimulationCraft can NEVER fold to a constant, lower-cased
 * (ONB-S2).
 *
 * Pinned: at the iteration-1 reset, a variable whose every non-background
 * action is constant takes the value it ended iteration 0 with as a constant
 * (player.cpp:6694-6697, action_variable.cpp:30-78); its reads fold to it
 * (player.cpp:11959-11963) and its lines leave the foreground lists
 * (variable.cpp:174-187). `add` to `max` are never constant
 * (variable.cpp:202-205), so a variable with one such line — named, with a
 * `value=`, so the constructor keeps it (variable.cpp:52-98) — never folds.
 * `floor`, `ceil` and `reset` are constant whenever every other line is
 * (variable.cpp:216-221), so a variable written only by them and by `set` /
 * `setif` lines may fold, and a read between two of its writes may see the
 * folded value rather than the earlier write. Deciding which `set` values are
 * constant needs SimulationCraft's expression `is_constant`, which is not
 * modelled, so only this structural proof is used.
 */
export function neverFoldedVariables(authority: AplAuthority): ReadonlySet<string> {
  const cached = neverFoldedByAuthority.get(authority);
  if (cached !== undefined) return cached;
  const names = new Set<string>();
  for (const action of authority.actions) {
    if (action.entryKind !== "VARIABLE_ASSIGNMENT") continue;
    const structure = parseAplLine(action.actionStringVerbatim);
    if (!structure.balanced || structure.malformedSegments.length > 0) continue;
    const written = (key: string) => structure.options.filter((option) => option.key === key);
    const name = written("name");
    const ops = written("op");
    const values = written("value");
    // One reading only: a repeated option is not used as proof.
    if (name.length !== 1 || ops.length !== 1 || values.length !== 1) continue;
    const combining = COMBINING_OPERATIONS.get((ops[0]?.value ?? "").toLowerCase());
    if (combining === undefined || UNARY_COMBINING_OPERATIONS.includes(combining)) continue;
    const rawName = name[0]?.value ?? "";
    if (rawName.length === 0 || (values[0]?.value ?? "").length === 0) continue;
    names.add(rawName.toLowerCase());
  }
  neverFoldedByAuthority.set(authority, names);
  return names;
}

const neverFoldedByAuthority = new WeakMap<AplAuthority, ReadonlySet<string>>();

/** The authority's list names in SimulationCraft's construction order (player.cpp:526-559). */
export function constructionOrder(authority: AplAuthority): readonly string[] {
  const names = [...new Set(authority.artifact.lists.map((list) => list.listName))];
  const rank = (name: string) => (name === "precombat" ? 0 : name === "default" ? 1 : 2);
  return names.sort((left, right) => rank(left) - rank(right) || (left < right ? -1 : left > right ? 1 : 0));
}

/**
 * Executes one variable line against the scan's current variables.
 *
 * `gate` is the line's own `if=` as the traversal already evaluated it, under
 * the same `bindings` — so the condition and the value read the same state.
 *
 * `defaults` are the authority's established defaults
 * (`establishedVariableDefaults`): what `op=reset` restores. Without them a
 * reset restores the line's own `default=`, which is the pinned value only
 * when that line constructed the variable.
 *
 * `neverFolded` is `neverFoldedVariables(authority)` (ONB-S2). `floor` and
 * `ceil` are executed only on a variable in it; on any other — or without the
 * set — they write UNKNOWN (`CONSTANT_FOLDING`), because SimulationCraft may
 * fold that variable to a constant.
 */
export function executeVariableLine(
  action: AplAction,
  gate: LineCondition,
  bindings: AtomBindings,
  state: ScanVariables,
  defaults?: ReadonlyMap<string, NumericBinding>,
  neverFolded?: ReadonlySet<string>,
): { readonly state: ScanVariables; readonly record: VariableExecutionRecord } {
  const structure = parseAplLine(action.actionStringVerbatim);
  const names = structure.options.filter((option) => option.key === "name").map((option) => option.value);
  const malformed = !structure.balanced || structure.malformedSegments.length > 0 || names.length > 1;
  const rawName = names[0];

  if (malformed) {
    // Which variable the line writes cannot be trusted: every read is UNKNOWN.
    return {
      state: { values: state.values, tainted: true },
      record: { kind: "NOT_MODELLED", name: null, reason: "MALFORMED_LINE" },
    };
  }
  if (rawName === undefined || rawName.length === 0) {
    return { state, record: { kind: "INERT", reason: "NO_NAME" } };
  }
  const name = rawName.toLowerCase();
  const vocabulary = bindings.specAtoms?.vocabulary;

  const option = (key: string): string | undefined =>
    structure.options.find((entry) => entry.key === key)?.value;
  const operation = (option("op") ?? "set").toLowerCase();

  // The line does not run when its `if=` is proven FALSE, whatever it would do.
  if (gate.kind === "EVALUATED" && gate.truth === "FALSE") {
    return { state, record: { kind: "CONDITION_FALSE", name } };
  }
  const executed: "PROVEN" | "UNDECIDED" =
    gate.kind === "UNCONDITIONAL" || (gate.kind === "EVALUATED" && gate.truth === "TRUE")
      ? "PROVEN"
      : "UNDECIDED";

  const notModelled = (reason: Extract<VariableExecutionRecord, { kind: "NOT_MODELLED" }>["reason"]) => ({
    state: withScanVariable(state, name, unknownNumber("STATE_NOT_MODELLED")),
    record: { kind: "NOT_MODELLED", name, reason } as const,
  });

  if (action.actionToken === "cycling_variable") return notModelled("CYCLING_VARIABLE");
  if (
    structure.options.some((entry) => !MODELLED_OPTION_KEYS.includes(entry.key) && entry.key !== "line_cd") ||
    lineCooldownOptionOf(action).kind === "MALFORMED"
  ) {
    return notModelled("UNMODELLED_OPTION");
  }
  if (operation === "print") return { state, record: { kind: "INERT", reason: "PRINT" } };

  const context = actingAction(action.actionToken);
  const magnitude = (text: string | undefined): NumericBinding | null => {
    if (text === undefined || text.length === 0) return null;
    const parsed = parseSimcExpression(text, vocabulary);
    // Outside the supported subset: SimulationCraft still assigns SOME value.
    if (!parsed.ok) return unknownNumber("STATE_NOT_MODELLED");
    return evaluateSimcMagnitude(parsed.ast, bindings, context);
  };

  let assigned: NumericBinding;
  let modelled: "SET" | "SETIF" | "RESET" | CombiningOperation;
  const combining = COMBINING_OPERATIONS.get(operation);
  if (combining !== undefined) {
    // The value as it is just before this line: this scan's, a carried
    // precombat value, or the unknown incoming value (ONB-S2).
    const unary = UNARY_COMBINING_OPERATIONS.includes(combining);
    // `floor` and `ceil` can be constant, so their variable may be folded:
    // executed only where a never-constant line proves it is not.
    if (unary && neverFolded?.has(name) !== true) return notModelled("CONSTANT_FOLDING");
    const operand = unary ? null : magnitude(option("value"));
    if (!unary && operand === null) return notModelled("MISSING_EXPRESSION");
    assigned = combineVariableValue(combining, variableValueBeforeWrite(bindings, name), operand);
    modelled = combining;
  } else if (operation === "set") {
    const value = magnitude(option("value"));
    if (value === null) return notModelled("MISSING_EXPRESSION");
    assigned = value;
    modelled = "SET";
  } else if (operation === "setif") {
    const value = magnitude(option("value"));
    const otherwise = magnitude(option("value_else"));
    const conditionText = option("condition");
    if (value === null || otherwise === null || conditionText === undefined || conditionText.length === 0) {
      return notModelled("MISSING_EXPRESSION");
    }
    const parsed = parseSimcExpression(conditionText, vocabulary);
    const condition = parsed.ok ? evaluateSimcExpression(parsed.ast, conditionText, bindings, context) : null;
    assigned =
      condition?.outcome === "RESOLVED"
        ? condition.value
          ? value
          : otherwise
        : joinNumericBindings(value, otherwise);
    modelled = "SETIF";
  } else if (operation === "reset") {
    // The variable's `default_value_` (ONB-S1): the established default when
    // the caller supplied them, else `default=` as written (0 when absent).
    // The sim-level `apl_variable.<name>` override belongs to a simulation
    // profile, not to the authority.
    if (defaults !== undefined) {
      assigned = defaults.get(name) ?? unknownNumber("STATE_NOT_ESTABLISHED");
    } else {
      const written = option("default");
      if (written !== undefined && !DEFAULT_LITERAL.test(written)) return notModelled("MISSING_EXPRESSION");
      assigned = knownNumber(written === undefined ? 0 : Number(written));
    }
    modelled = "RESET";
  } else {
    return notModelled("OPERATION");
  }

  // `set`, `setif` and `reset` REPLACE the value, so a proven execution reads
  // nothing that came before it; a combining operation already read it. An
  // undecided `if=` leaves both worlds: assigned, or the value as it was —
  // this scan's, else the spec's initial.
  const value =
    executed === "PROVEN"
      ? assigned
      : joinNumericBindings(variableValueBeforeWrite(bindings, name), assigned);
  return {
    state: withScanVariable(state, name, value),
    record: { kind: "ASSIGNED", name, operation: modelled, executed, value },
  };
}
