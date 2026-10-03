/**
 * Parser for the supported SimulationCraft expression subset.
 *
 * SUPPORTED, AND NOTHING ELSE:
 *
 *     operators     !   &   |   >=   >   =   <   <=   <?   >?   ( )
 *     literals      non-negative integers, and non-negative decimals of the
 *                   form digits '.' digits (M11-B3)
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
 *     <? >?            extremum: <? is MAX, >? is MIN (M11-D3-C1)
 *     + -              additive
 *     *                multiplicative
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
 * placeholder node. `!=`, `&&`, `||`, `==`, UNARY minus, the
 * decimal forms outside digits '.' digits (`.5`, `1.`, `1e3`) and
 * every unlisted identifier (`spell_targets.y`, `active_dot.z`,
 * `energy.regen_combined`, `main_hand.dagger`, `talent.x.rank`,
 * `variable.trinket_sync_slot`, `dot.z.pmultiplier`, `cooldown.y.ready`, …) are
 * refusals, not defaults.
 *
 * BINARY `-` IS SUPPORTED FROM M5-D1; unary `-` is not. See `parseAdditive`.
 *
 * WHY `>` AND `<=` ARE HERE
 *
 * M5-B evaluates the pinned `spend` sub-list, whose first two lines need `<=`
 * (`buff.envenom.remains<=1`) and `>` (`energy.pct>70`). Adding exactly those
 * two is the minimum that makes the sub-list evaluable; adding the rest of
 * SimulationCraft's operator set would widen the supported surface without a
 * decision that needs it.
 *
 * `<?` and `>?` are SimulationCraft's extremum operators, supported from
 * M11-D3-C1 — and `<?` is the MAXIMUM, `>?` the MINIMUM, the reverse of what
 * the glyphs suggest (see `extremumOf` in `ast.ts`). They share a leading
 * character with `<` and `>`, so they are read at their own precedence level
 * (`parseExtremum`) BEFORE any comparison operator is tried: a `>?` that
 * decayed into `>` followed by a stray `?` would change an authority
 * condition's meaning silently.
 *
 * A consequence worth knowing: the pinned `generate` call condition uses `>`
 * and therefore now PARSES. It does not follow that it is decidable — see
 * `evaluate.ts` — only that its refusal is no longer a syntax refusal.
 *
 * THE SPECIALIZATION SEAM (M10-C)
 *
 * `parseSimcExpression` takes an OPTIONAL vocabulary (`spec-vocabulary.ts`).
 * It is consulted in exactly one place — after every built-in pattern has
 * failed to match an identifier — and it yields exactly one node kind,
 * `SPEC_ATOM`. Without a vocabulary the parser is unchanged: every identifier
 * outside the subset above is still refused whole. Nothing in this file names
 * a specialization, and the built-in list above is still the ONLY list this
 * file knows.
 */

import { asMagnitudeOperand, type ComparisonOperator, type ExpressionNode } from "./ast.js";
import type { SpecAtomVocabulary } from "./spec-vocabulary.js";

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
  /** The specialization vocabulary, when one was supplied. Read by `parseIdentifier` only. */
  readonly vocabulary: SpecAtomVocabulary | undefined;
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
 * could be confused with. `>?` and `<?` are binary operators since M11-D3-C1,
 * read by `parseExtremum`, and STAY here for the reason `-` does: this list is
 * consulted where an OPERAND is expected, so a dangling `>?5` or `a<?<?b` is
 * refused rather than read. `==` wins against `=`; `!=` wins against `!`; `&&` and
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
  // `-` STAYS IN THIS LIST even though binary subtraction is supported from
  // M5-D1, and the distinction is the whole point. This list is consulted where
  // an OPERAND is expected, so it is what refuses UNARY minus — `remains<=-1`
  // must not quietly become a negative literal. `parseAdditive` reads the binary
  // form directly and never consults this list.
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

/**
 * The built-in identifier reading, or `null` when the subset does not contain
 * `raw`.
 *
 * Split out of `parseIdentifier` so the SAME function answers two questions:
 * what a built-in identifier parses to, and whether a specialization's
 * declaration would shadow one (`isBuiltinIdentifier`). One list, one reader.
 */
function builtinIdentifier(raw: string): ExpressionNode | null {
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
  // Also bare, and also about the ACTING action's own DoT. `dot.<name>.refreshable`
  // addresses a different action's DoT and stays refused.
  if (raw === "refreshable") return { kind: "DOT_REFRESHABLE" };

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

  return null;
}

/** Whether the shared subset reads this identifier. Exported for the vocabulary guard. */
export function isBuiltinIdentifier(identifier: string): boolean {
  return builtinIdentifier(identifier) !== null;
}

function parseIdentifier(cursor: Cursor): ExpressionNode {
  const start = cursor.index;
  while (cursor.index < cursor.text.length) {
    const char = cursor.text[cursor.index];
    if (char === undefined || !IDENTIFIER_BODY.test(char)) break;
    cursor.index += 1;
  }
  const raw = cursor.text.slice(start, cursor.index);

  const builtin = builtinIdentifier(raw);
  if (builtin !== null) return builtin;

  // THE ONE SEAM. Built-ins first, so a vocabulary can never change what a
  // built-in identifier means; and only a DECLARED identifier is admitted, so
  // the vocabulary cannot open a namespace either.
  const declared = cursor.vocabulary?.lookup(raw) ?? null;
  if (declared !== null) {
    return {
      kind: "SPEC_ATOM",
      identifier: declared.identifier,
      shape: declared.shape,
      scope: declared.scope,
      selfAddressing: declared.selfAddressing,
    };
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

function readDigits(cursor: Cursor): void {
  while (cursor.index < cursor.text.length) {
    const char = cursor.text[cursor.index];
    if (char === undefined || !DIGIT.test(char)) break;
    cursor.index += 1;
  }
}

/**
 * A numeric literal: digits, optionally followed by '.' and digits (M11-B3).
 *
 * THE PINNED LEXER (engine/sim/expressions.cpp `next()` at 33622e9d) reads a
 * number as digit+ then, on '.', digit*; the parser turns the token into a
 * `const_expr_t` through `std::stod`, so `1.5` is the exact double 1.5 and
 * the SAME kind of constant an integer literal is. This grammar admits the
 * one form the pinned authorities write (`1.5`, `0.5`) and REFUSES, whole,
 * every other decimal shape: an empty fraction (`1.` — the pinned lexer
 * would accept it, no pinned list writes it, and a trailing point is far
 * more often a typo than a threshold), a leading point (`.5`, not a number
 * to the pinned lexer either), a second point (`1.5.5`) and exponents
 * (`1e3`, which the pinned lexer splits into a number and an identifier).
 * A literal is never truncated, rounded or turned into an atom; it is the
 * evaluator's ordinary `number`, compared by the ordinary comparison rule.
 */
function parseNumber(cursor: Cursor): ExpressionNode {
  const start = cursor.index;
  readDigits(cursor);
  let raw: string;
  let value: number;
  if (peek(cursor) === ".") {
    cursor.index += 1;
    const fractionStart = cursor.index;
    readDigits(cursor);
    if (cursor.index === fractionStart || peek(cursor) === ".") {
      const end = peek(cursor) === "." ? cursor.index + 1 : cursor.index;
      throw new ParseError("UNSUPPORTED_NUMERIC_LITERAL", cursor.text.slice(start, end), start);
    }
    raw = cursor.text.slice(start, cursor.index);
    value = Number.parseFloat(raw);
  } else {
    raw = cursor.text.slice(start, cursor.index);
    value = Number.parseInt(raw, 10);
    if (!Number.isSafeInteger(value)) {
      throw new ParseError("UNSUPPORTED_NUMERIC_LITERAL", raw, start);
    }
  }
  if (!Number.isFinite(value)) {
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
 * to its supported one-character prefix. Since M11-D3-C1 `parseExtremum`
 * consumes every `<?` and `>?` before this runs; the two refusals stay as the
 * backstop that keeps a missed one from decaying into `<` or `>`.
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
    left = { kind: "MULTIPLY", left: asMagnitudeOperand(left), right: asMagnitudeOperand(right) };
  }
}

/**
 * Addition and subtraction. Precedence 6 in pinned SimulationCraft — the same
 * level for both, looser than multiplication and tighter than comparison — and
 * LEFT-ASSOCIATIVE, so `a-b-c` is `(a-b)-c`.
 *
 * BINARY ONLY, for both operators. Unary `+`/`-` are precedence 8 upstream and
 * stay unsupported: `parsePrimary` calls `rejectLookalikeOperators`, which still
 * refuses a `-` appearing where an operand belongs. So `14-6` parses and
 * `remains<=-1` does not, which is exactly the split we want — a negative
 * literal is far more likely to be a mistake than an authored value.
 *
 * `-` arrived at M5-D1 for the pinned `core_dot[1..4]` lines, every one of which
 * ends in `target.time_to_die-remains>12`. The whole-expression refusal means
 * those four entries could not be evaluated AT ALL without it, so the four other
 * conjuncts on each line — one of which can prove the line FALSE — were
 * unreachable.
 */
function parseAdditive(cursor: Cursor): ExpressionNode {
  let left = parseMultiplicative(cursor);
  for (;;) {
    // `+` and `-` are unambiguous here: SimulationCraft has no `+=`, `-=`, `++`
    // or `--`, and the two-character lookalikes that DO exist (`->`, say) are not
    // operators in this grammar at all.
    if (startsWith(cursor, "+")) {
      cursor.index += 1;
      left = {
        kind: "ADD",
        left: asMagnitudeOperand(left),
        right: asMagnitudeOperand(parseMultiplicative(cursor)),
      };
      continue;
    }
    if (startsWith(cursor, "-")) {
      cursor.index += 1;
      left = {
        kind: "SUBTRACT",
        left: asMagnitudeOperand(left),
        right: asMagnitudeOperand(parseMultiplicative(cursor)),
      };
      continue;
    }
    return left;
  }
}

/**
 * `<?` and `>?`, SimulationCraft's extremum operators (M11-D3-C1).
 *
 * Precedence 5 in pinned SimulationCraft — looser than `+`/`-` (6), tighter
 * than comparison (4) — and LEFT-ASSOCIATIVE, so `a>?b<?c` is `(a>?b)<?c`
 * and `x>=y>?3` is `x>=(y>?3)` (engine/sim/expressions.cpp:1081-1110,
 * 1311-1324). `<?` is the MAXIMUM and `>?` the MINIMUM — see `extremumOf`.
 * Both operands are magnitude positions.
 *
 * Read here, before `readComparisonOperator` can see the leading `<` or `>`,
 * so neither can ever decay into a comparison followed by a stray `?`.
 */
function parseExtremum(cursor: Cursor): ExpressionNode {
  let left = parseAdditive(cursor);
  for (;;) {
    const operator = startsWith(cursor, "<?") ? "<?" : startsWith(cursor, ">?") ? ">?" : null;
    if (operator === null) return left;
    cursor.index += 2;
    left = {
      kind: "EXTREMUM",
      operator,
      left: asMagnitudeOperand(left),
      right: asMagnitudeOperand(parseAdditive(cursor)),
    };
  }
}

function parseComparison(cursor: Cursor): ExpressionNode {
  const left = parseExtremum(cursor);
  const operator = readComparisonOperator(cursor);
  if (operator === null) return left;
  const right = parseExtremum(cursor);
  if (readComparisonOperator(cursor) !== null) {
    throw new ParseError("CHAINED_COMPARISON", cursor.text, cursor.index);
  }
  // Both operands are MAGNITUDE positions: `.react` there is a count (M11-D1).
  return { kind: "COMPARISON", operator, left: asMagnitudeOperand(left), right: asMagnitudeOperand(right) };
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
export function parseSimcExpression(
  expression: string,
  /**
   * A specialization's declared identifiers (M10-C). OMITTED for every caller
   * that existed before, which leaves their parse byte-for-byte unchanged.
   */
  vocabulary?: SpecAtomVocabulary,
): ParseResult {
  if (expression.length === 0) {
    return failure("EMPTY_EXPRESSION", "", 0);
  }
  const cursor: Cursor = { text: expression, index: 0, vocabulary };
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
