/**
 * The loaded APL authority: derivations and the list call graph.
 *
 * WHY A CALL GRAPH RATHER THAN "envenom only appears in spend"
 *
 * "Envenom appears only in the spend list" is necessary and nowhere near
 * sufficient. It says nothing about how `spend` is entered. If a second list
 * also called `spend`, or if `spend` were reachable through a chain we did not
 * examine, then proving one call's condition false would prove nothing at all —
 * the action could still be selected by the other path.
 *
 * So reachability is proved over the edges. `proveSoleGateTo` establishes:
 *
 *     the action occurs in exactly one list L, and L is not the entry list
 *     every list reference in the authority resolves to a real list
 *     no unmodelled dispatch construct exists anywhere
 *     L has exactly ONE incoming edge in the whole authority
 *     that edge originates at the entry list
 *     that edge carries a condition
 *
 * Only then is "this condition is false ⇒ the action is unreachable" sound.
 *
 * THE ASYMMETRY THAT MAKES M5-A HONEST
 *
 * A FALSE gate proves unreachability outright: no matter what the higher-
 * priority lines above the gate do, a false condition means the sub-list is
 * never entered, so the action cannot be selected. Nothing above needs to be
 * evaluated.
 *
 * A TRUE gate proves almost nothing. It says the list may be entered; it does
 * not say the APL reaches that line (every earlier line must have declined), and
 * it does not say the action's own conditions hold. That is why this module
 * supports rejection and refuses to express selection.
 *
 * `run_action_list` is refused by THIS proof and fails closed here. Its
 * control flow is modelled by the nested traversal since M11-B1
 * (`nested-selection.ts`: a FALSE gate skips, a certain gate transfers
 * selection into the child and never resumes the parent), but the reachability
 * proof below was written over call edges only and has not been re-derived
 * over a mixed call/run graph. Until it is, an authority containing a run entry
 * yields `NOT_PROVABLE / UNMODELLED_DISPATCH` — conservative, never wrong in the
 * laundering direction — and none of the pinned public artifacts contains one.
 */

import {
  validateAuthorityArtifact,
  type AuthorityArtifact,
  type AuthorityArtifactAction,
} from "./authority-artifact.js";

/**
 * What KIND of entry an APL line is, structurally.
 *
 * SimulationCraft's foreground scan treats three families differently, and the
 * difference is not cosmetic — it decides whether the scan stops:
 *
 *     player.cpp:14238  ACTION_VARIABLE -> execute(), then CONTINUE scanning
 *     player.cpp:14245  ACTION_CALL     -> recurse into the called list
 *     player.cpp:14266  anything else   -> return it; the scan STOPS
 *
 * So `variable` is not a player action that happens to do nothing visible; it is
 * the single construct that executes without ending the scan. Giving it the same
 * kind as `envenom` would make "the list selected `variable`" expressible, and it
 * is not a thing that can happen.
 *
 * `swap_action_list` is classified as `LIST_DISPATCH` rather than as a player
 * action for the same reason: SimulationCraft's own `is_real_action`
 * (player.cpp:4312) excludes it alongside `call_action_list`, `run_action_list`
 * and `variable`. It does not appear in the pinned Assassination APL, and
 * calling it a player action would be the more dangerous error.
 *
 * WHAT `PLAYER_ACTION` MEANS, AND THE FIVE THINGS IT DOES NOT
 *
 * `PLAYER_ACTION` means exactly one thing:
 *
 *     an ordinary selectable/returnable APL entry, as opposed to an APL
 *     control-flow entry
 *
 * It is a statement about CONTROL FLOW and nothing else. It does NOT imply that
 * the entry is spell-backed, that a numeric `abilityGameId` is known for it,
 * that an execution lane is known, that it deals damage, or that it is coached.
 *
 * `potion`, `use_item`, `use_items` and `invoke_external_buff` are all
 * `PLAYER_ACTION` under this three-member vocabulary. None of them is a spell,
 * and none of them acquires a spell id by being classified. They resolve to
 * `UNKNOWN_LANE`, which makes rotational-slot narrowing stop at them rather than
 * step over them — the safe direction, and the reason this deliberately small
 * vocabulary is sufficient.
 */
export type AplEntryKind = "PLAYER_ACTION" | "VARIABLE_ASSIGNMENT" | "LIST_DISPATCH";

export const APL_ENTRY_KINDS = [
  "PLAYER_ACTION",
  "VARIABLE_ASSIGNMENT",
  "LIST_DISPATCH",
] as const satisfies readonly AplEntryKind[];

/**
 * ACTION OPTIONS — the `key=value` segments after the token, and why they are
 * first-class from M5-D1.
 *
 * An APL line is `token,key=value,key=value,…`. Until M5-D1 this module read the
 * token and the `,if=` value and IGNORED everything else, which was fine only
 * because every option in the pinned Assassination APL happened not to change
 * selection semantics. That stopped being true the moment `refreshable` became
 * parseable: `core_dot[2]` is
 *
 *     garrote,cycle_targets=1,if=…refreshable…
 *
 * and `cycle_targets=1` makes SimulationCraft re-run `action_ready()` once per
 * candidate target (action.cpp:2463-2488). Evaluating that line against the one
 * implicit target would silently answer a multi-target question as a
 * single-target one — the exact failure `CLAUDE.md`'s multi-target rule forbids.
 *
 * So options are now DERIVED and CLASSIFIED, and an unrecognised one fails
 * closed. This is deliberately NOT a general option interpreter: it is a
 * three-way partition of option KEYS, with no attempt to read their values.
 *
 *     SUPPORTED               modelled, or provably irrelevant to selection
 *     UNSUPPORTED_TARGETING   changes WHICH target the condition is about
 *     UNRECOGNISED            never seen at this pinned commit; fails closed
 */
export type ActionOptionSupport =
  "SUPPORTED" | "UNSUPPORTED_TARGETING" | "UNRECOGNISED" | "MALFORMED_STRUCTURE";

/**
 * `MALFORMED_STRUCTURE` (M11-D1) is not a key classification: it marks a line
 * whose option STRUCTURE this module cannot read — a top-level segment that is
 * not `key=value`, or a second `if=`. Before M11-D1 such a segment after `if=`
 * was swallowed into the condition text and failed the parser; now that the
 * condition ends at the next option, the line must still fail closed, and this
 * is how it does. It refuses exactly as an unrecognised option does.
 */
export const ACTION_OPTION_SUPPORTS = [
  "SUPPORTED",
  "UNSUPPORTED_TARGETING",
  "UNRECOGNISED",
  "MALFORMED_STRUCTURE",
] as const satisfies readonly ActionOptionSupport[];

/**
 * Option keys this project understands well enough not to be stopped by.
 *
 * Each entry is a claim, so each carries its reason:
 *
 *   `if`        the condition itself. Read by `deriveConditionRaw`.
 *   `name`      the dispatch target, the item name, or the variable name. Read
 *               by `deriveCallsListName` and by the spec's applicability rules.
 *   `value`     a `variable` assignment's value. `variable` never ends a scan,
 *               and any later read of the variable is resolved — or refused — at
 *               the expression layer, so the value text changes no control flow
 *               here.
 *   `slots`     the `use_items` slot token. Read by the spec's applicability.
 *   `use_off_gcd`  an EXTRA scheduling opportunity during an already-running
 *               GCD, not an execution lane (player.cpp:4340-4342,
 *               action.cpp:301-306). The first-GCD query terminates before that
 *               pass is reachable, so it cannot affect the answer.
 *   `precombat_seconds`  only meaningful outside combat, and only on `precombat`
 *               entries, which are unreachable from the entry list.
 */
export const SUPPORTED_ACTION_OPTION_KEYS = [
  "if",
  "name",
  "value",
  "slots",
  "use_off_gcd",
  "precombat_seconds",
] as const;

/**
 * Option keys that redirect the condition onto a target this project cannot
 * enumerate.
 *
 *   `cycle_targets`  `action_t::ready()` loops the candidate target list and
 *                    re-runs `action_ready()` for each (action.cpp:2463-2488).
 *   `target_if`      `select_target_if_target()` SCORES every candidate and
 *                    retargets to the winner (action.cpp:2429-2461).
 *
 * Both are recognised and REFUSED. Recognising them is what turns a silent
 * misreading into an explicit UNKNOWN.
 *
 * The KEY classification is unchanged by M11-D3-B1, which reads `target_if`'s
 * value structurally (`targetIfStructureOf`) and lets the selectors read past
 * the subset that cannot depend on the enemy set — see `target-if.ts`. A
 * `target_if` line is still refused by default.
 */
export const UNSUPPORTED_TARGETING_OPTION_KEYS = ["cycle_targets", "target_if", "max_cycle_targets"] as const;

/** Classifies one option key. Never reads its value. */
export function actionOptionSupport(optionKey: string): ActionOptionSupport {
  if ((SUPPORTED_ACTION_OPTION_KEYS as readonly string[]).includes(optionKey)) return "SUPPORTED";
  if ((UNSUPPORTED_TARGETING_OPTION_KEYS as readonly string[]).includes(optionKey)) {
    return "UNSUPPORTED_TARGETING";
  }
  return "UNRECOGNISED";
}

/**
 * One APL line, split into its token and its top-level options (M11-D1).
 *
 * An APL line is `token,key=value,key=value,…`, and an option ends at the next
 * TOP-LEVEL comma. Until M11-D1 the condition was "everything after `,if=`",
 * which is right only while `if=` is the last option: the pinned Protection
 * Warrior line (apl_warrior.cpp:361)
 *
 *     ignore_pain,if=target.health.pct>=20&(…),use_off_gcd=1
 *
 * put `,use_off_gcd=1` inside its own condition, which the expression parser
 * then refused whole. The condition is now the `if` option's value and nothing
 * more; `use_off_gcd` is read as the option it is.
 *
 * TOP-LEVEL means outside parentheses and outside quotes. No pinned
 * expression contains a comma, and the expression parser refuses one, so a
 * comma inside parentheses or quotes stays with its value and makes that value
 * fail wherever it is read — it never becomes an invented option boundary.
 *
 * UNBALANCED grouping — a quote never closed, a parenthesis never closed or
 * closed twice — would let one value swallow every option after it, `if=`
 * included, and a swallowed condition reads as NONE. So such a line is split
 * exactly as before M11-D1 (on every comma) and marked unbalanced, which
 * `deriveAction` refuses: never worse than the pre-D1 reading.
 *
 * Nothing here interprets a value. A segment that is not `key=value` is kept
 * as MALFORMED rather than dropped, so that no text can silently disappear
 * from a line: `deriveAction` turns it into a refusal.
 */
export interface AplLineStructure {
  /** The segment before the first comma. */
  readonly actionToken: string;
  /** Every top-level `key=value` segment after the token, in written order, values verbatim. */
  readonly options: readonly { readonly key: string; readonly value: string }[];
  /** Every top-level segment after the token that is not `key=value`, verbatim. */
  readonly malformedSegments: readonly string[];
  /** False when a quote or parenthesis is left open or closed twice; the split is then the plain comma split. */
  readonly balanced: boolean;
}

const OPTION_SEGMENT = /^([A-Za-z_][A-Za-z0-9_]*)=([\s\S]*)$/;

/** The top-level comma-separated segments of a line, the token included, or `null` when grouping is unbalanced. */
function topLevelSegments(actionStringVerbatim: string): readonly string[] | null {
  const segments: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  for (let index = 0; index < actionStringVerbatim.length; index += 1) {
    const char = actionStringVerbatim[index];
    if (quote !== null) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "(") depth += 1;
    else if (char === ")") {
      depth -= 1;
      if (depth < 0) return null;
    } else if (char === "," && depth === 0) {
      segments.push(actionStringVerbatim.slice(start, index));
      start = index + 1;
    }
  }
  if (quote !== null || depth !== 0) return null;
  segments.push(actionStringVerbatim.slice(start));
  return segments;
}

export function parseAplLine(actionStringVerbatim: string): AplLineStructure {
  const grouped = topLevelSegments(actionStringVerbatim);
  const [, ...rest] = grouped ?? actionStringVerbatim.split(",");
  const options: { key: string; value: string }[] = [];
  const malformedSegments: string[] = [];
  for (const segment of rest) {
    const match = OPTION_SEGMENT.exec(segment);
    const key = match?.[1];
    const value = match?.[2];
    if (key === undefined || value === undefined) malformedSegments.push(segment);
    else options.push({ key, value });
  }
  return {
    actionToken: deriveActionToken(actionStringVerbatim),
    options,
    malformedSegments,
    balanced: grouped !== null,
  };
}

/**
 * The option keys of one action string, in written order, each once.
 *
 * Read from the top-level structure (M11-D1). Only `key=value` segments carry
 * a key; a malformed segment is not listed here, and is refused by
 * `deriveAction` instead of being skipped.
 *
 * The leading token is never an option.
 */
export function deriveActionOptionKeys(actionStringVerbatim: string): readonly string[] {
  const keys: string[] = [];
  for (const { key } of parseAplLine(actionStringVerbatim).options) {
    if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

/**
 * The `target_if` option, read STRUCTURALLY (M11-D3-B1) — the mode and its
 * expression, never evaluated here. What a well-formed one means for selection
 * is decided in `target-if.ts`; see its header for the pinned semantics.
 */
export type TargetIfMode = "FIRST" | "MIN" | "MAX";

export const TARGET_IF_MODES = ["FIRST", "MIN", "MAX"] as const satisfies readonly TargetIfMode[];

/**
 * A line's `target_if` option, structurally — or why it cannot be read.
 *
 * `null` (from `targetIfStructureOf`) means the line carries no `target_if`.
 */
export type TargetIfStructure =
  | {
      readonly kind: "WELL_FORMED";
      readonly mode: TargetIfMode;
      /** False when no `mode:` prefix was written and FIRST is the pinned default. */
      readonly modeWritten: boolean;
      /** The scoring (MIN/MAX) or gating (FIRST) expression, verbatim. Never evaluated here. */
      readonly expressionRaw: string;
    }
  | {
      readonly kind: "MALFORMED";
      /**
       *   UNKNOWN_MODE        a `prefix:` other than min/max/first — SimC throws
       *   EMPTY_EXPRESSION    `min:` with nothing after it, or `target_if=` with
       *                       no text at all; neither is a selection this module
       *                       will read either way
       *   MULTIPLE_TARGET_IF  two `target_if=` options; which one SimC keeps is
       *                       an option-parser detail this module does not read
       */
      readonly reason: "UNKNOWN_MODE" | "EMPTY_EXPRESSION" | "MULTIPLE_TARGET_IF";
    };

/** Reads the `target_if` option of one line, or `null` when it has none. */
export function targetIfStructureOf(actionStringVerbatim: string): TargetIfStructure | null {
  const values = parseAplLine(actionStringVerbatim)
    .options.filter((option) => option.key === "target_if")
    .map((option) => option.value);
  const [only] = values;
  if (only === undefined) return null;
  if (values.length > 1) return { kind: "MALFORMED", reason: "MULTIPLE_TARGET_IF" };

  const colon = only.indexOf(":");
  if (colon < 0) {
    return only.length === 0
      ? { kind: "MALFORMED", reason: "EMPTY_EXPRESSION" }
      : { kind: "WELL_FORMED", mode: "FIRST", modeWritten: false, expressionRaw: only };
  }
  const prefix = only.slice(0, colon).toLowerCase();
  const expressionRaw = only.slice(colon + 1);
  const mode: TargetIfMode | null =
    prefix === "min" ? "MIN" : prefix === "max" ? "MAX" : prefix === "first" ? "FIRST" : null;
  if (mode === null) return { kind: "MALFORMED", reason: "UNKNOWN_MODE" };
  if (expressionRaw.length === 0) return { kind: "MALFORMED", reason: "EMPTY_EXPRESSION" };
  return { kind: "WELL_FORMED", mode, modeWritten: true, expressionRaw };
}

/** One action, with the fields derived from its verbatim string. */
export interface AplAction {
  readonly listName: string;
  readonly priorityOrdinal: number;
  readonly actionStringVerbatim: string;
  readonly comment: string | null;
  readonly sourceLine: number;
  /** The segment before the first comma. */
  readonly actionToken: string;
  /** The value of the `,if=` parameter, or `null` when the action is unconditional. */
  readonly conditionRaw: string | null;
  /** The `name=` target for `call_action_list` / `run_action_list`, else `null`. */
  readonly callsListName: string | null;
  /**
   * True for `run_action_list`.
   *
   * The name predates M11-B1, which taught the NESTED traversal its control
   * flow (`nested-selection.ts`). It still reads truthfully for the two
   * consumers that do not model it: the single-list walker
   * (`list-selection.ts`, which models no dispatch of any kind) and the
   * reachability proof below. Kept rather than renamed so every existing
   * reader keeps its meaning; the flag says "this is a run entry" and each
   * consumer decides what it can do with one.
   */
  readonly isUnmodelledDispatch: boolean;
  /**
   * Structural family, derived from the verbatim string.
   *
   * Derived here rather than stored in the artifact, like every other derived
   * field, so it cannot drift from the string it summarises.
   */
  readonly entryKind: AplEntryKind;
  /**
   * True for an entry SimulationCraft EXECUTES and then CONTINUES the scan past
   * — `variable` and `cycling_variable` (player.cpp:14238) — so a scan can
   * never return it as the selected action (M11-D1C).
   *
   * A CONTROL-FLOW fact, derived from `entryKind` and exposed on its own for
   * the same reason as `isUnmodelledDispatch` and `callsListName`: the
   * ordered single-list selector acts on control flow and deliberately reads no
   * structural entry kind or execution lane (tests/contracts/m5c1-gcd-semantics.test.ts).
   */
  readonly executesAndContinues: boolean;
  /** Every option key on the line, in written order. Values are never read. */
  readonly actionOptionKeys: readonly string[];
  /**
   * The option keys that are NOT `SUPPORTED`, with their classification.
   *
   * EMPTY IS THE CLAIM WORTH NOTICING: it says every option on this line was
   * recognised and none of them redirects the condition. A non-empty list is what
   * makes the traversal refuse.
   */
  readonly unsupportedOptions: readonly {
    readonly optionKey: string;
    readonly support: Exclude<ActionOptionSupport, "SUPPORTED">;
  }[];
  /**
   * The `target_if` option, structurally, or `null` when the line has none
   * (M11-D3-B1). Its key stays `UNSUPPORTED_TARGETING` above; this says what
   * it IS, and `target-if.ts` decides what it means for selection.
   */
  readonly targetIf: TargetIfStructure | null;
}

const CALL_TOKENS = new Set(["call_action_list", "run_action_list"]);
/** Tokens SimulationCraft's `is_real_action` excludes as list-control constructs. */
const LIST_CONTROL_TOKENS = new Set(["call_action_list", "run_action_list", "swap_action_list"]);
/**
 * The tokens of SimulationCraft's execute-and-continue construct (M11-D1 adds
 * the second).
 *
 * Pinned at 33622e9d1662ff0e451691edf85a6b49cc9d11d9: `cycling_variable` is
 * built as `cycling_variable_t` (engine/player/player.cpp:11123-11124), a
 * `variable_t` — type ACTION_VARIABLE (engine/action/variable.cpp:17) — whose
 * `execute()` folds `variable_t::execute()` once per non-sleeping target
 * (variable.cpp:369-391). The foreground scan executes every ACTION_VARIABLE
 * and CONTINUES (player.cpp:14238), so neither token can ever be the action a
 * scan returns. Before M11-D1 `cycling_variable` fell through to
 * PLAYER_ACTION, which made "the list selected cycling_variable" expressible.
 *
 * Its VALUE is a fold over every enemy, which this project cannot compute; like
 * every variable value it is never computed here (see `nested-selection.ts`),
 * so a later read of it is resolved — or refused — at the expression layer.
 */
const VARIABLE_TOKENS = new Set(["variable", "cycling_variable"]);

export function deriveActionToken(actionStringVerbatim: string): string {
  const comma = actionStringVerbatim.indexOf(",");
  return comma < 0 ? actionStringVerbatim : actionStringVerbatim.slice(0, comma);
}

/**
 * The `if` option's value, verbatim, and nothing after it.
 *
 * A top-level option KEY, so `target_if=` cannot be mistaken for it. More than
 * one `if=` is malformed and yields text no parser accepts — never an
 * arbitrary pick, and never `null`, which would read as unconditional. An
 * ambiguous condition must not silently become a definite one.
 */
export function deriveConditionRaw(actionStringVerbatim: string): string | null {
  // M11-D1: the value of the ONE top-level `if` option, ending at the next
  // top-level option — not everything after `,if=`. See `parseAplLine`.
  const structure = parseAplLine(actionStringVerbatim);
  // Unbalanced grouping: exactly the pre-M11-D1 reading, so no condition can
  // come out shorter — or more readable — than it did before. `deriveAction`
  // refuses the line as MALFORMED_STRUCTURE as well.
  if (!structure.balanced) return conditionAfterFirstIfMarker(actionStringVerbatim);
  const conditions = structure.options.filter((option) => option.key === "if");
  const [only] = conditions;
  if (conditions.length === 0) return null;
  if (conditions.length === 1 && only !== undefined) return only.value;
  // More than one `if=` is MALFORMED (M11-D1C). `null` would read as
  // UNCONDITIONAL — a certain call entry, a definite line — to every consumer
  // of `conditionRaw`, so the ambiguous text is returned instead: it holds the
  // second `,if=`, and the expression parser refuses any text with a comma,
  // so wherever it is read it is refused, never decided. `deriveAction` also
  // refuses the line as MALFORMED_STRUCTURE.
  return conditionAfterFirstIfMarker(actionStringVerbatim);
}

/**
 * Everything after the first `,if=`, or `null` when there is none: the
 * pre-M11-D1 reading, except that a SECOND `,if=` no longer yields `null`
 * (M11-D1C) — the text returned then contains it, and never parses.
 */
function conditionAfterFirstIfMarker(actionStringVerbatim: string): string | null {
  const marker = ",if=";
  const at = actionStringVerbatim.indexOf(marker);
  return at < 0 ? null : actionStringVerbatim.slice(at + marker.length);
}

export function deriveCallsListName(actionStringVerbatim: string): string | null {
  const token = deriveActionToken(actionStringVerbatim);
  if (!CALL_TOKENS.has(token)) return null;
  const match = /(?:^|,)name=([A-Za-z_][A-Za-z0-9_]*)/.exec(actionStringVerbatim);
  return match === null ? null : (match[1] ?? null);
}

/**
 * The structural family of an APL line.
 *
 * Keyed on the action token alone, which is all SimulationCraft itself uses to
 * build the corresponding action object.
 *
 * Everything that is not a recognised control construct falls back to
 * `PLAYER_ACTION`. That is a claim about control flow only — an unrecognised
 * token would be RETURNED by the scan and would END it, which is precisely what
 * separates it from `variable`, `cycling_variable` and the dispatch constructs. It is emphatically
 * NOT a claim that the token is a spell, and the fallback confers no ability id
 * and no execution lane.
 *
 * The fallback is the safe direction. An unrecognised entry classified as
 * control flow would be stepped over silently; classified as a player action it
 * has no known lane, so rotational-slot narrowing stops at it and says so.
 */
export function deriveEntryKind(actionStringVerbatim: string): AplEntryKind {
  const token = deriveActionToken(actionStringVerbatim);
  if (VARIABLE_TOKENS.has(token)) return "VARIABLE_ASSIGNMENT";
  if (LIST_CONTROL_TOKENS.has(token)) return "LIST_DISPATCH";
  return "PLAYER_ACTION";
}

/**
 * Whether a line's option STRUCTURE could not be read (M11-D1C): a segment that
 * is not `key=value`, unbalanced grouping, or a second `if=`. One predicate,
 * so every consumer — player, run and call entries, and the sole-gate proof —
 * refuses the same lines.
 */
export function isMalformedAuthorityLine(action: AplAction): boolean {
  return action.unsupportedOptions.some((option) => option.support === "MALFORMED_STRUCTURE");
}

function deriveAction(listName: string, action: AuthorityArtifactAction): AplAction {
  const token = deriveActionToken(action.actionStringVerbatim);
  const actionOptionKeys = deriveActionOptionKeys(action.actionStringVerbatim);
  const unsupportedOptions: { optionKey: string; support: Exclude<ActionOptionSupport, "SUPPORTED"> }[] = [];
  for (const optionKey of actionOptionKeys) {
    const support = actionOptionSupport(optionKey);
    if (support !== "SUPPORTED") unsupportedOptions.push({ optionKey, support });
  }
  // M11-D1: structure this module cannot read refuses the line rather than
  // vanishing from it. A non-`key=value` segment is named verbatim, unbalanced
  // grouping by a fixed label, and a second `if=` by its key.
  const structure = parseAplLine(action.actionStringVerbatim);
  for (const segment of structure.malformedSegments) {
    unsupportedOptions.push({ optionKey: segment, support: "MALFORMED_STRUCTURE" });
  }
  if (!structure.balanced) {
    unsupportedOptions.push({
      optionKey: "(unbalanced quote or parenthesis)",
      support: "MALFORMED_STRUCTURE",
    });
  }
  if (structure.options.filter((option) => option.key === "if").length > 1) {
    unsupportedOptions.push({ optionKey: "if", support: "MALFORMED_STRUCTURE" });
  }
  return {
    listName,
    priorityOrdinal: action.priorityOrdinal,
    actionStringVerbatim: action.actionStringVerbatim,
    comment: action.comment,
    sourceLine: action.sourceLine,
    actionToken: token,
    conditionRaw: deriveConditionRaw(action.actionStringVerbatim),
    callsListName: deriveCallsListName(action.actionStringVerbatim),
    isUnmodelledDispatch: token === "run_action_list",
    entryKind: deriveEntryKind(action.actionStringVerbatim),
    executesAndContinues: deriveEntryKind(action.actionStringVerbatim) === "VARIABLE_ASSIGNMENT",
    actionOptionKeys,
    unsupportedOptions,
    targetIf: targetIfStructureOf(action.actionStringVerbatim),
  };
}

export type ReachabilityFailureReason =
  | "ACTION_ABSENT_FROM_AUTHORITY"
  | "ACTION_IN_MULTIPLE_LISTS"
  | "ACTION_IN_ENTRY_LIST"
  | "NO_INCOMING_EDGE"
  | "MULTIPLE_INCOMING_EDGES"
  | "INCOMING_EDGE_NOT_FROM_ENTRY_LIST"
  | "GATE_EDGE_HAS_NO_CONDITION"
  | "UNMODELLED_DISPATCH"
  | "UNKNOWN_LIST_REFERENCE"
  /** The gate edge's own option structure is malformed (M11-D1C): no condition on it can be trusted. */
  | "MALFORMED_GATE_EDGE";

export interface AuthorityGate {
  readonly fromListName: string;
  readonly targetListName: string;
  readonly priorityOrdinal: number;
  readonly actionStringVerbatim: string;
  readonly conditionRaw: string;
  readonly sourceLine: number;
}

export type ReachabilityProof =
  | { readonly kind: "PROVEN_SOLE_GATE"; readonly actionToken: string; readonly gate: AuthorityGate }
  | {
      readonly kind: "NOT_PROVABLE";
      readonly actionToken: string;
      readonly reason: ReachabilityFailureReason;
      readonly detail: string;
    };

/**
 * The result of looking up one named list.
 *
 * A discriminated result rather than a possibly-empty array, because the two
 * cases mean opposite things once a caller starts reasoning about what a list
 * selects. An AUTHORITATIVE list holding zero actions selects nothing, exactly
 * — `call_action_list` enters it and returns. A list that is ABSENT from the
 * authority is a hole in our model of it, and no selection conclusion follows
 * at all.
 *
 * Returning `[]` for both would make "the authority says nothing fires here"
 * indistinguishable from "we could not find the list", which is the same class
 * of failure as reading a missing observation as zero.
 */
export type ListLookup =
  | { readonly found: true; readonly listName: string; readonly actions: readonly AplAction[] }
  | { readonly found: false; readonly listName: string };

export interface AplAuthority {
  readonly artifact: AuthorityArtifact;
  readonly actions: readonly AplAction[];
  /** Lists in which an action token appears, in artifact order. */
  listsContainingAction(actionToken: string): readonly string[];
  /**
   * One named list's actions, in ascending `priorityOrdinal`.
   *
   * Priority order is the whole meaning of an APL list, so the sort is explicit
   * here even though the artifact validator already pins ordinals to array
   * indices. An invariant a caller depends on and nobody restates is an
   * invariant a future extractor can break silently.
   */
  actionsInList(listName: string): ListLookup;
  /**
   * Proves that every path to `actionToken` passes through one conditional edge.
   *
   * Any doubt yields NOT_PROVABLE, which the caller must surface as UNKNOWN —
   * never as NO_AUTHORITY_AVAILABLE. The authority exists; our ability to prove
   * a property of it is what fell short.
   */
  proveSoleGateTo(actionToken: string): ReachabilityProof;
}

export type AuthorityLoadResult =
  | { readonly ok: true; readonly authority: AplAuthority }
  | { readonly ok: false; readonly reason: string; readonly detail: string };

export function loadAplAuthority(rawArtifact: unknown): AuthorityLoadResult {
  const validation = validateAuthorityArtifact(rawArtifact);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason, detail: validation.detail };
  }
  const artifact = validation.artifact;

  const actions: AplAction[] = [];
  for (const list of artifact.lists) {
    for (const action of list.actions) {
      actions.push(deriveAction(list.listName, action));
    }
  }
  const listNames = new Set(artifact.lists.map((list) => list.listName));

  function actionsInList(listName: string): ListLookup {
    if (!listNames.has(listName)) {
      return { found: false, listName };
    }
    const inList = actions
      .filter((action) => action.listName === listName)
      .sort((left, right) => left.priorityOrdinal - right.priorityOrdinal);
    return { found: true, listName, actions: inList };
  }

  function listsContainingAction(actionToken: string): readonly string[] {
    const names: string[] = [];
    for (const action of actions) {
      if (action.actionToken === actionToken && !names.includes(action.listName)) {
        names.push(action.listName);
      }
    }
    return names;
  }

  function proveSoleGateTo(actionToken: string): ReachabilityProof {
    const notProvable = (reason: ReachabilityFailureReason, detail: string): ReachabilityProof => ({
      kind: "NOT_PROVABLE",
      actionToken,
      reason,
      detail,
    });

    // Global integrity first. A single unmodelled construct or dangling list
    // reference anywhere invalidates every reachability claim, so these are
    // checked before anything specific to this action.
    for (const action of actions) {
      if (action.isUnmodelledDispatch) {
        return notProvable(
          "UNMODELLED_DISPATCH",
          `${action.listName}[${action.priorityOrdinal}] uses run_action_list, whose control flow is not modelled`,
        );
      }
      if (action.callsListName !== null && !listNames.has(action.callsListName)) {
        return notProvable(
          "UNKNOWN_LIST_REFERENCE",
          `${action.listName}[${action.priorityOrdinal}] calls unknown list '${action.callsListName}'`,
        );
      }
    }

    const containing = listsContainingAction(actionToken);
    if (containing.length === 0) {
      return notProvable("ACTION_ABSENT_FROM_AUTHORITY", `no list contains action '${actionToken}'`);
    }
    if (containing.length > 1) {
      return notProvable("ACTION_IN_MULTIPLE_LISTS", `appears in [${containing.join(", ")}]`);
    }
    const targetListName = containing[0];
    if (targetListName === undefined) {
      return notProvable("ACTION_ABSENT_FROM_AUTHORITY", "unreachable");
    }
    if (targetListName === artifact.entryListName) {
      // Reached without traversing any gate, so no condition governs it.
      return notProvable("ACTION_IN_ENTRY_LIST", `'${actionToken}' sits directly in the entry list`);
    }

    const incoming = actions.filter((action) => action.callsListName === targetListName);
    if (incoming.length === 0) {
      return notProvable("NO_INCOMING_EDGE", `no list calls '${targetListName}'`);
    }
    if (incoming.length > 1) {
      const where = incoming.map((a) => `${a.listName}[${a.priorityOrdinal}]`).join(", ");
      return notProvable("MULTIPLE_INCOMING_EDGES", `'${targetListName}' is called from ${where}`);
    }

    const edge = incoming[0];
    if (edge === undefined) {
      return notProvable("NO_INCOMING_EDGE", "unreachable");
    }
    if (edge.listName !== artifact.entryListName) {
      return notProvable(
        "INCOMING_EDGE_NOT_FROM_ENTRY_LIST",
        `'${targetListName}' is called from '${edge.listName}', not from entry list '${artifact.entryListName}'`,
      );
    }
    if (isMalformedAuthorityLine(edge)) {
      return notProvable(
        "MALFORMED_GATE_EDGE",
        `the call to '${targetListName}' has a malformed option structure, so its gate cannot be read`,
      );
    }
    if (edge.conditionRaw === null) {
      return notProvable(
        "GATE_EDGE_HAS_NO_CONDITION",
        `the call to '${targetListName}' is unconditional, so no gate governs it`,
      );
    }

    return {
      kind: "PROVEN_SOLE_GATE",
      actionToken,
      gate: {
        fromListName: edge.listName,
        targetListName,
        priorityOrdinal: edge.priorityOrdinal,
        actionStringVerbatim: edge.actionStringVerbatim,
        conditionRaw: edge.conditionRaw,
        sourceLine: edge.sourceLine,
      },
    };
  }

  return {
    ok: true,
    authority: { artifact, actions, listsContainingAction, actionsInList, proveSoleGateTo },
  };
}
