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
 * depend on the value already stored, so they need no history. Everything
 * else that can change a value — the combining operations, `cycling_variable`,
 * a line with an option outside the supported set (`delay=` gates readiness
 * on a cooldown; `target_if=` on a target) — makes the variable UNKNOWN.
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

import { parseAplLine, type AplAction } from "./apl-authority.js";
import type { LineCondition } from "./list-selection.js";
import {
  actingAction,
  evaluateSimcExpression,
  evaluateSimcMagnitude,
  joinNumericBindings,
  knownNumber,
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
      readonly operation: "SET" | "SETIF" | "RESET";
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
        "OPERATION" | "CYCLING_VARIABLE" | "UNMODELLED_OPTION" | "MALFORMED_LINE" | "MISSING_EXPRESSION";
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

const DEFAULT_LITERAL = /^[0-9]+(?:\.[0-9]+)?$/;

/**
 * Executes one variable line against the scan's current variables.
 *
 * `gate` is the line's own `if=` as the traversal already evaluated it, under
 * the same `bindings` — so the condition and the value read the same state.
 */
export function executeVariableLine(
  action: AplAction,
  gate: LineCondition,
  bindings: AtomBindings,
  state: ScanVariables,
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
  let modelled: "SET" | "SETIF" | "RESET";
  if (operation === "set") {
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
    // `default=` as written; 0 when absent. The sim-level `apl_variable.<name>`
    // override belongs to a simulation profile, not to the authority.
    const written = option("default");
    if (written !== undefined && !DEFAULT_LITERAL.test(written)) return notModelled("MISSING_EXPRESSION");
    assigned = knownNumber(written === undefined ? 0 : Number(written));
    modelled = "RESET";
  } else {
    return notModelled("OPERATION");
  }

  // `set`, `setif` and `reset` REPLACE the value, so a proven execution reads
  // nothing that came before it. An undecided `if=` leaves both worlds:
  // assigned, or the value as it was — this scan's, else the spec's initial.
  const value =
    executed === "PROVEN"
      ? assigned
      : joinNumericBindings(variableValueBeforeWrite(bindings, name), assigned);
  return {
    state: withScanVariable(state, name, value),
    record: { kind: "ASSIGNED", name, operation: modelled, executed, value },
  };
}
