/**
 * Parser for the supported SimulationCraft expression subset.
 *
 * SUPPORTED, AND NOTHING ELSE:
 *
 *     operators     !   &   |   >=   =   <   ( )
 *     literals      non-negative integers
 *     atoms         combo_points
 *                   combo_points.deficit
 *                   buff.<name>.up
 *
 * PRECEDENCE, loosest to tightest:
 *
 *     |            or
 *     &            and
 *     >= = <       comparison (non-chaining)
 *     !            unary, tightest
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
 * placeholder node. `>`, `<=`, `!=`, `&&`, `||`, decimals, arithmetic and every
 * unlisted identifier (`energy.pct`, `talent.x`, `spell_targets.y`,
 * `target.time_to_die`, `variable.z`, …) are refusals, not defaults.
 *
 * `>` is deliberately absent even though `<` is present. `<` falls out of the
 * same comparison production at no additional cost; `>` is not needed by the one
 * condition M5-A evaluates, and adding operators nobody needs widens the
 * supported surface without evidence. A consequence worth knowing: the pinned
 * `generate` call condition uses `>` and therefore does NOT parse, which is the
 * correct fail-closed outcome rather than an accident.
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
 * Operator-shaped tokens outside the subset.
 *
 * Two characters before one, so `<=` is never read as `<` plus a stray `=`, and
 * `&&` is never read as two `&`s. `>=` is supported and is checked for first
 * wherever a `>` could begin it.
 */
const UNSUPPORTED_OPERATOR_TOKENS = [
  "<=",
  "!=",
  "&&",
  "||",
  ">?",
  "<?",
  "==",
  "%%",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%",
  "^",
  "@",
] as const;

function matchUnsupportedOperator(cursor: Cursor): string | null {
  if (startsWith(cursor, ">=")) return null;
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
 * problem. `combo_points>5` is not trailing junk; it is an operator we do not
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

  const buff = /^buff\.([A-Za-z_][A-Za-z0-9_]*)\.up$/.exec(raw);
  if (buff !== null) {
    const name = buff[1];
    if (name !== undefined) return { kind: "BUFF_UP", buffName: name };
  }

  // Everything else is refused. `energy.pct`, `talent.x`, `spell_targets.y`,
  // `variable.z`, `buff.x.remains` and `dot.y.ticking` all land here.
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

function readComparisonOperator(cursor: Cursor): ComparisonOperator | null {
  if (startsWith(cursor, ">=")) {
    cursor.index += 2;
    return ">=";
  }
  if (startsWith(cursor, "<=")) {
    throw new ParseError("UNSUPPORTED_OPERATOR", "<=", cursor.index);
  }
  if (startsWith(cursor, "<")) {
    cursor.index += 1;
    return "<";
  }
  if (startsWith(cursor, "=") && !startsWith(cursor, "==")) {
    cursor.index += 1;
    return "=";
  }
  return null;
}

/** Comparisons bind tighter than `&`, and do not chain. */
function parseComparison(cursor: Cursor): ExpressionNode {
  const left = parseUnary(cursor);
  const operator = readComparisonOperator(cursor);
  if (operator === null) return left;
  const right = parseUnary(cursor);
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
