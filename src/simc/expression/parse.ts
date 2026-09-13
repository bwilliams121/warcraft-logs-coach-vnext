/**
 * Parser for the supported SimulationCraft expression subset.
 *
 * SUPPORTED, AND NOTHING ELSE:
 *
 *     operators     !   &   |   >=   >   =   <   <=   ( )
 *     literals      non-negative integers
 *     atoms         combo_points
 *                   combo_points.deficit
 *                   energy.pct
 *                   fight_remains
 *                   buff.<name>.up
 *                   buff.<name>.remains
 *                   stealthed.rogue            (M5-C2)
 *                   talent.<name>              (M5-C2, dot-free name)
 *                   variable.single_target     (M5-C2, that one variable only)
 *
 * PRECEDENCE, loosest to tightest:
 *
 *     |                or
 *     &                and
 *     >= > = < <=      comparison (non-chaining)
 *     !                unary, tightest
 *
 * So `!buff.darkest_night.up&combo_points>=5|buff.darkest_night.up&combo_points.deficit=0`
 * parses as:
 *
 *     ((!buff.darkest_night.up) & (combo_points >= 5))
 *   | ((buff.darkest_night.up)  & (combo_points.deficit = 0))
 *
 * Getting this wrong would silently change verdicts, so tests pin it against the
 * real pinned authority string.
 *
 * FAIL CLOSED, WHOLE-EXPRESSION. Every rejection path returns a failure for the
 * ENTIRE expression. There is no partial parse, no skipped fragment and no
 * placeholder node. `!=`, `&&`, `||`, `>?`, `<?`, `==`, decimals, arithmetic and
 * every unlisted identifier (`talent.x`, `spell_targets.y`, `target.time_to_die`,
 * `dot.z.ticking`, `variable.w`, `buff.x.stack`, `energy.regen_combined`, …) are
 * refusals, not defaults.
 *
 * WHY `>` AND `<=` ARE HERE AND `>?` / `<?` ARE NOT
 *
 * M5-B evaluates the pinned `spend` sub-list, whose first two lines need `<=`
 * (`buff.envenom.remains<=1`) and `>` (`energy.pct>70`). Adding exactly those
 * two is the minimum that makes the sub-list evaluable; adding the rest of
 * SimulationCraft's operator set would widen the supported surface without a
 * decision that needs it.
 *
 * `>?` and `<?` are SimulationCraft's max and min operators. They share a
 * leading character with `>` and `<`, so every operator match in this file is
 * LONGEST-FIRST: a `>?` that decayed into `>` followed by a stray `?` would
 * change an authority condition's meaning silently, which is the exact class of
 * failure the whole-expression refusal exists to prevent.
 *
 * A consequence worth knowing: the pinned `generate` call condition uses `>`
 * and therefore now PARSES. It does not follow that it is decidable — see
 * `evaluate.ts` — only that its refusal is no longer a syntax refusal.
 */

import type { ComparisonOperator, ExpressionNode } from "./ast.js";

export type ParseFailureReason =
  | "EMPTY_EXPRESSION"
  | "UNSUPPORTED_OPERATOR"
  | "UNSUPPORTED_IDENTIFIER"
  | "UNSUPPORTED_NUMERIC_LITERAL"
  | "UNEXPECTED_CHARACTER"
  | "UNEXPECTED_END_OF_EXPRESSION"
  | "UNBALANCED_PARENTHESIS"
  | "CHAINED_COMPARISON"
  | "TRAILING_INPUT";

export type ParseResult =
  | { readonly ok: true; readonly ast: ExpressionNode }
  | {
      readonly ok: false;
      readonly reason: ParseFailureReason;
      /** The offending text, so a finding can disclose exactly what was refused. */
      readonly fragment: string;
      readonly offset: number;
    };

const IDENTIFIER_START = /[A-Za-z_]/;
const IDENTIFIER_BODY = /[A-Za-z0-9_.]/;
const DIGIT = /[0-9]/;

interface Cursor {
  readonly text: string;
  index: number;
}

function failure(reason: ParseFailureReason, fragment: string, offset: number): ParseResult {
  return { ok: false, reason, fragment, offset };
}

/** Thrown internally and converted to a `ParseResult`. Never escapes this module. */
class ParseError extends Error {
  constructor(
    readonly reason: ParseFailureReason,
    readonly fragment: string,
    readonly offset: number,
  ) {
    super(reason);
  }
}

function peek(cursor: Cursor): string | undefined {
  return cursor.text[cursor.index];
}

function startsWith(cursor: Cursor, token: string): boolean {
  return cursor.text.startsWith(token, cursor.index);
}

/**
 * Operator-shaped tokens OUTSIDE the subset.
 *
 * Every entry here is longer than, or disjoint from, any supported operator it
 * could be confused with. `>?` and `<?` appear so they win against the
 * supported `>` and `<`; `==` wins against `=`; `!=` wins against `!`; `&&` and
 * `||` win against `&` and `|`; `%%` wins against `%`.
 *
 * `>`, `<`, `>=`, `<=` and `=` are deliberately ABSENT: they are supported, and
 * a supported operator listed here would be refused wherever an operand was
 * expected.
 */
const UNSUPPORTED_OPERATOR_TOKENS = [
  "!=",
  "&&",
  "||",
  ">?",
  "<?",
  "==",
  "%%",
  "+",
  "-",
  "*",
  "/",
  "%",
  "^",
  "@",
] as const;

function matchUnsupportedOperator(cursor: Cursor): string | null {
  for (const token of UNSUPPORTED_OPERATOR_TOKENS) {
    if (startsWith(cursor, token)) return token;
  }
  return null;
}

/** Rejects an operator-shaped token where an OPERAND was expected. */
function rejectLookalikeOperators(cursor: Cursor): void {
  const token = matchUnsupportedOperator(cursor);
  if (token !== null) {
    throw new ParseError("UNSUPPORTED_OPERATOR", token, cursor.index);
  }
}

/**
 * Rejects an operator-shaped token where a BINARY OPERATOR could have appeared.
 *
 * Without this, an unsupported binary operator merely ends the parse early and
 * surfaces as `TRAILING_INPUT` — still fail-closed, but it names the wrong
 * problem. `combo_points!=5` is not trailing junk; it is an operator we do not
 * support, and a finding that has to disclose why the authority could not be
 * evaluated should say so.
 */
function rejectUnsupportedContinuation(cursor: Cursor): void {
  const next = peek(cursor);
  if (next === undefined || next === ")") return;
  const token = matchUnsupportedOperator(cursor);
  if (token !== null) {
    throw new ParseError("UNSUPPORTED_OPERATOR", token, cursor.index);
  }
}

const BUFF_UP = /^buff\.([A-Za-z_][A-Za-z0-9_]*)\.up$/;
const BUFF_REMAINS = /^buff\.([A-Za-z_][A-Za-z0-9_]*)\.remains$/;
/**
 * `buff.<name>.stack`, `buff.<name>.react` and `debuff.<name>.up`, added at
 * M5-C3c3c.
 *
 * EXACTLY three more properties, for exactly the reason the earlier additions
 * were made: the pinned `misc_cds` lines carry them, and an expression
 * containing an unrecognised fragment is refused WHOLE. Recognising them is what
 * lets the scan branch over those entries instead of stopping at them.
 *
 * None of them opens a namespace. `buff.<name>.duration`, `buff.<name>.value`,
 * `debuff.<name>.remains`, `debuff.<name>.stack` and `debuff.<name>.react` are
 * all still refused, and recognition still confers no knowledge: all three
 * resolve UNKNOWN.
 */
const BUFF_STACK = /^buff\.([A-Za-z_][A-Za-z0-9_]*)\.stack$/;
const BUFF_REACT = /^buff\.([A-Za-z_][A-Za-z0-9_]*)\.react$/;
const DEBUFF_UP = /^debuff\.([A-Za-z_][A-Za-z0-9_]*)\.up$/;
/**
 * `dot.<name>.ticking` and `cooldown.<name>.remains`, added in M5-C3c1.
 *
 * Both name ANOTHER action's state, unlike the bare `remains` / `pmultiplier`
 * added in C3a which address the acting action's own DoT. That is why they need
 * a name: the binding is per-ability.
 *
 * Recognising them does NOT open the `dot.` or `cooldown.` namespaces.
 * `dot.<name>.remains`, `dot.<name>.pmultiplier`, `cooldown.<name>.ready` and
 * `cooldown.<name>.duration` all still fail the whole expression.
 */
const DOT_TICKING = /^dot\.([A-Za-z_][A-Za-z0-9_]*)\.ticking$/;
const COOLDOWN_REMAINS = /^cooldown\.([A-Za-z_][A-Za-z0-9_]*)\.remains$/;
/**
 * `talent.<name>`, where the name contains NO dot.
 *
 * The anchored, dot-free name is the whole safety property. `talent.x` is a
 * truth-shaped `->ok()` check, but `talent.scent_of_blood.rank` is a MAGNITUDE.
 * A pattern that allowed dots would parse the rank as a boolean atom and let a
 * world assignment stand in for a number.
 */
const TALENT = /^talent\.([A-Za-z_][A-Za-z0-9_]*)$/;

function parseIdentifier(cursor: Cursor): ExpressionNode {
  const start = cursor.index;
  while (cursor.index < cursor.text.length) {
    const char = cursor.text[cursor.index];
    if (char === undefined || !IDENTIFIER_BODY.test(char)) break;
    cursor.index += 1;
  }
  const raw = cursor.text.slice(start, cursor.index);

  if (raw === "combo_points") return { kind: "COMBO_POINTS" };
  if (raw === "combo_points.deficit") return { kind: "COMBO_POINTS_DEFICIT" };
  if (raw === "energy.pct") return { kind: "ENERGY_PCT" };
  if (raw === "fight_remains") return { kind: "FIGHT_REMAINS" };
  // PREDICTIVE, like `fight_remains`, and never bindable for the same reason.
  if (raw === "target.time_to_die") return { kind: "TARGET_TIME_TO_DIE" };

  // EXACT matches only. `stealthed.basic`, `stealthed.all`,
  // `stealthed.mantle` and `stealthed.improved_garrote` denote DIFFERENT masks
  // and are refused rather than folded into this one.
  if (raw === "stealthed.rogue") return { kind: "STEALTHED_ROGUE" };
  // The one variable whose shape is established. Every other `variable.<name>`
  // is refused — see the AST node comment for why a generic rule would be wrong.
  if (raw === "variable.single_target") return { kind: "VARIABLE_SINGLE_TARGET" };

  // BARE dot properties of the acting action, as written in the pinned
  // `core_dot` lines. The `dot.<name>.<property>` namespace stays refused: it
  // addresses a DIFFERENT action's DoT and would need a per-ability binding
  // nothing supplies.
  if (raw === "pmultiplier") return { kind: "DOT_PMULTIPLIER" };
  if (raw === "remains") return { kind: "DOT_REMAINS" };

  const talent = TALENT.exec(raw);
  if (talent !== null) {
    const name = talent[1];
    if (name !== undefined) return { kind: "TALENT", talentName: name };
  }

  const up = BUFF_UP.exec(raw);
  if (up !== null) {
    const name = up[1];
    if (name !== undefined) return { kind: "BUFF_UP", buffName: name };
  }

  const remains = BUFF_REMAINS.exec(raw);
  if (remains !== null) {
    const name = remains[1];
    if (name !== undefined) return { kind: "BUFF_REMAINS", buffName: name };
  }

  const stack = BUFF_STACK.exec(raw);
  if (stack !== null) {
    const name = stack[1];
    if (name !== undefined) return { kind: "BUFF_STACK", buffName: name };
  }

  const react = BUFF_REACT.exec(raw);
  if (react !== null) {
    const name = react[1];
    if (name !== undefined) return { kind: "BUFF_REACT", buffName: name };
  }

  const debuffUp = DEBUFF_UP.exec(raw);
  if (debuffUp !== null) {
    const name = debuffUp[1];
    if (name !== undefined) return { kind: "DEBUFF_UP", debuffName: name };
  }

  const ticking = DOT_TICKING.exec(raw);
  if (ticking !== null) {
    const name = ticking[1];
    if (name !== undefined) return { kind: "DOT_TICKING", dotName: name };
  }

  const cooldownRemains = COOLDOWN_REMAINS.exec(raw);
  if (cooldownRemains !== null) {
    const name = cooldownRemains[1];
    if (name !== undefined) return { kind: "COOLDOWN_REMAINS", cooldownName: name };
  }

  // Everything else is refused. `spell_targets.y`, `buff.x.duration`,
  // `debuff.x.remains`, `debuff.x.react`,
  // `energy.regen_combined`, `talent.x.rank`, `variable.trinket_sync_slot`,
  // `stealthed.all`, `dot.y.remains`, `dot.y.pmultiplier`, `cooldown.y.ready`
  // and `cooldown.y.duration` all land here. Note that `energy.pct` matching
  // exactly does NOT make `energy.` a supported namespace; the same holds for
  // `stealthed.`, `talent.` and `variable.` (M5-C2) and for the `dot.` and
  // `cooldown.` namespaces opened by ONE property each in M5-C3c1.
  throw new ParseError("UNSUPPORTED_IDENTIFIER", raw, start);
}

function parseNumber(cursor: Cursor): ExpressionNode {
  const start = cursor.index;
  while (cursor.index < cursor.text.length) {
    const char = cursor.text[cursor.index];
    if (char === undefined || !DIGIT.test(char)) break;
    cursor.index += 1;
  }
  // A decimal point after digits means a non-integer literal, which is outside
  // the supported subset. Refused rather than truncated.
  if (peek(cursor) === ".") {
    const end = cursor.index + 1;
    throw new ParseError("UNSUPPORTED_NUMERIC_LITERAL", cursor.text.slice(start, end), start);
  }
  const raw = cursor.text.slice(start, cursor.index);
  const value = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(value)) {
    throw new ParseError("UNSUPPORTED_NUMERIC_LITERAL", raw, start);
  }
  return { kind: "NUMBER", value };
}

function parsePrimary(cursor: Cursor): ExpressionNode {
  const char = peek(cursor);
  if (char === undefined) {
    throw new ParseError("UNEXPECTED_END_OF_EXPRESSION", "", cursor.index);
  }

  if (char === "(") {
    cursor.index += 1;
    const inner = parseOr(cursor);
    if (peek(cursor) !== ")") {
      throw new ParseError("UNBALANCED_PARENTHESIS", "(", cursor.index);
    }
    cursor.index += 1;
    return inner;
  }

  rejectLookalikeOperators(cursor);

  if (DIGIT.test(char)) return parseNumber(cursor);
  if (IDENTIFIER_START.test(char)) return parseIdentifier(cursor);

  throw new ParseError("UNEXPECTED_CHARACTER", char, cursor.index);
}

/** Unary `!` binds tightest. */
function parseUnary(cursor: Cursor): ExpressionNode {
  if (startsWith(cursor, "!") && !startsWith(cursor, "!=")) {
    cursor.index += 1;
    return { kind: "NOT", operand: parseUnary(cursor) };
  }
  return parsePrimary(cursor);
}

/**
 * Reads one comparison operator, LONGEST-MATCH FIRST.
 *
 * The order below is the whole correctness argument of this function. `>?` is
 * tested before `>=` and `>`; `<?` before `<=` and `<`; `==` before `=`. An
 * unsupported two-character operator must be REFUSED, never silently truncated
 * to its supported one-character prefix.
 */
function readComparisonOperator(cursor: Cursor): ComparisonOperator | null {
  if (startsWith(cursor, ">?")) {
    throw new ParseError("UNSUPPORTED_OPERATOR", ">?", cursor.index);
  }
  if (startsWith(cursor, "<?")) {
    throw new ParseError("UNSUPPORTED_OPERATOR", "<?", cursor.index);
  }
  if (startsWith(cursor, "==")) {
    throw new ParseError("UNSUPPORTED_OPERATOR", "==", cursor.index);
  }
  if (startsWith(cursor, ">=")) {
    cursor.index += 2;
    return ">=";
  }
  if (startsWith(cursor, "<=")) {
    cursor.index += 2;
    return "<=";
  }
  if (startsWith(cursor, ">")) {
    cursor.index += 1;
    return ">";
  }
  if (startsWith(cursor, "<")) {
    cursor.index += 1;
    return "<";
  }
  if (startsWith(cursor, "=")) {
    cursor.index += 1;
    return "=";
  }
  return null;
}

/** Comparisons bind tighter than `&`, and do not chain. */
/**
 * Multiplication. Precedence 7 in pinned SimulationCraft, tighter than addition.
 *
 * `*` only. `/` and `%` share the same level upstream but are not needed by any
 * supported line, and adding an operator nothing evaluates would widen the
 * surface without a decision behind it. `/` in particular must NOT be added
 * casually: it is the one that makes division-by-zero reachable.
 */
function parseMultiplicative(cursor: Cursor): ExpressionNode {
  let left = parseUnary(cursor);
  for (;;) {
    // `*` is unambiguous: SimulationCraft has no `*=`, `**` or `*?`.
    if (!startsWith(cursor, "*")) return left;
    cursor.index += 1;
    const right = parseUnary(cursor);
    left = { kind: "MULTIPLY", left, right };
  }
}

/**
 * Addition. Precedence 6 in pinned SimulationCraft, looser than multiplication
 * and tighter than comparison.
 *
 * `+` only, and BINARY only. Unary `+`/`-` are precedence 8 upstream and are not
 * supported here; `-` is absent entirely, so `14-6` is still refused rather than
 * silently parsed. `rejectLookalikeOperators` already refuses `-` where a
 * primary is expected, which is what keeps subtraction from sneaking in through
 * a negative literal.
 */
function parseAdditive(cursor: Cursor): ExpressionNode {
  let left = parseMultiplicative(cursor);
  for (;;) {
    if (!startsWith(cursor, "+")) return left;
    cursor.index += 1;
    const right = parseMultiplicative(cursor);
    left = { kind: "ADD", left, right };
  }
}

function parseComparison(cursor: Cursor): ExpressionNode {
  const left = parseAdditive(cursor);
  const operator = readComparisonOperator(cursor);
  if (operator === null) return left;
  const right = parseAdditive(cursor);
  if (readComparisonOperator(cursor) !== null) {
    throw new ParseError("CHAINED_COMPARISON", cursor.text, cursor.index);
  }
  return { kind: "COMPARISON", operator, left, right };
}

function parseAnd(cursor: Cursor): ExpressionNode {
  let left = parseComparison(cursor);
  while (startsWith(cursor, "&")) {
    if (startsWith(cursor, "&&")) throw new ParseError("UNSUPPORTED_OPERATOR", "&&", cursor.index);
    cursor.index += 1;
    const right = parseComparison(cursor);
    left = { kind: "AND", left, right };
  }
  return left;
}

function parseOr(cursor: Cursor): ExpressionNode {
  let left = parseAnd(cursor);
  while (startsWith(cursor, "|")) {
    if (startsWith(cursor, "||")) throw new ParseError("UNSUPPORTED_OPERATOR", "||", cursor.index);
    cursor.index += 1;
    const right = parseAnd(cursor);
    left = { kind: "OR", left, right };
  }
  // Nothing supported can follow a complete expression except a closing
  // parenthesis or the end of input.
  rejectUnsupportedContinuation(cursor);
  return left;
}

/**
 * Parses one SimulationCraft condition string.
 *
 * Whitespace is not stripped: SimC APL conditions contain none, and silently
 * tolerating it would accept strings the authority could not actually contain.
 */
export function parseSimcExpression(expression: string): ParseResult {
  if (expression.length === 0) {
    return failure("EMPTY_EXPRESSION", "", 0);
  }
  const cursor: Cursor = { text: expression, index: 0 };
  try {
    const ast = parseOr(cursor);
    if (cursor.index !== expression.length) {
      return failure("TRAILING_INPUT", expression.slice(cursor.index), cursor.index);
    }
    return { ok: true, ast };
  } catch (error) {
    if (error instanceof ParseError) {
      return failure(error.reason, error.fragment, error.offset);
    }
    throw error;
  }
}
