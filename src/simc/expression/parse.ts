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

  // Everything else is refused. `talent.x`, `spell_targets.y`, `variable.z`,
  // `target.time_to_die`, `dot.y.ticking`, `buff.x.stack`, `stealthed.rogue` and
  // `energy.regen_combined` all land here. Note that `energy.pct` matching
  // exactly does NOT make `energy.` a supported namespace.
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
