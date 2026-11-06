/**
 * The `target_if` subset this project can decide WITHOUT knowing the enemy set
 * (M11-D3-B1).
 *
 * THE PINNED SEMANTICS (SimulationCraft 33622e9d1662ff0e451691edf85a6b49cc9d11d9)
 *
 * Parsing, `action_t::init_finished` (engine/action/action.cpp:2926-2967): the
 * text before the FIRST `:` is the mode, case-insensitively `max`, `min` or
 * `first`; any other prefix throws (an invalid APL). With no `:` the whole
 * text is the expression and the mode is FIRST. An empty text leaves the mode
 * NONE — no target selection at all.
 *
 * Readiness, `action_t::action_ready` (action.cpp:2567-2629): `ready()` first —
 * cooldown, cost, movement, nothing about the target — then `select_target()`,
 * and only after it the `if=` expression. `select_target()` (action.cpp:
 * 2426-2459) resets the action's OWN target to the player's target, asks
 * `select_target_if_target()`, and on success makes the winner the action's
 * target; on failure the action is not ready. So `if=` is evaluated AFTER
 * target selection, ON THE SELECTED TARGET. Only this action's `target`
 * member changes; no other entry in the scan reads it, and the next
 * `select_target()` resets it again.
 *
 * `select_target_if_target()` (action.cpp:5353-5446):
 *
 *   one candidate     FIRST returns the target only if the expression is > 0;
 *                     MIN and MAX return the target without evaluating anything
 *   otherwise         every candidate that is `target_ready` is scored:
 *                       FIRST  the first with a value != 0, else none
 *                       MAX    the first strictly greater than the running
 *                              maximum, which starts at -infinity
 *                       MIN    the first strictly less than the running
 *                              minimum, which starts at +infinity
 *                     no candidate chosen -> the action is not ready
 *
 * The candidate list (`available_targets`, action.cpp:1729-1743) puts the
 * player's own non-sleeping target first. After selection the ordinary target
 * check still runs (`return target ? target_ready( target ) : false`,
 * action.cpp:2564).
 *
 * WHAT THAT MAKES DECIDABLE HERE
 *
 * FIRST is a GATE: whether the action is ready depends on whether SOME enemy
 * satisfies the expression. Nothing here knows the enemies, so FIRST is never
 * selected on the strength of its expression parsing.
 *
 * MIN and MAX are NOT guaranteed to pick a candidate. They pick one only when
 * at least one ready candidate scores a value the running extreme can move
 * from: not NaN, and not +inf for MIN or -inf for MAX. The pinned operators
 * can produce both (`%` is `std::divides`, `%%` is `std::fmod`). This is the
 * refinement of the M11-D0 audit's statement that MIN/MAX "choose a target":
 * they do so only for a finite score.
 *
 * So MIN/MAX target identity may be ignored only when target selection is
 * GUARANTEED — the score is POSITIVELY PROVEN finite on every target
 * (`scoreFinitenessOf`), so the player's own target, whose readiness every
 * line without `target_if` already rests on (`target_ready( target )`), always
 * qualifies — and the `if=` is absent or reads only PLAYER_SCOPED atoms. The
 * line is then ready exactly when the same line without `target_if` would be,
 * and is evaluated as an ordinary line: TRUE, FALSE or UNKNOWN as usual.
 *
 * Scope is NOT evidence of finiteness. A PLAYER_SCOPED atom says only that
 * its value is the same on every enemy, not that the value is finite.
 *
 * Independently of mode, a PLAYER_SCOPED `if=` conjunct proven FALSE makes the
 * line not ready whatever target selection does: if no target is chosen it is
 * not ready, and if one is, `if=` is FALSE on it. That is the M5-D1
 * target-independent elimination, applied to `target_if` lines.
 *
 * That elimination needs NOTHING from the score: it holds whether or not any
 * target is chosen, so it applies whatever the score's finiteness.
 *
 * Everything else — FIRST (even with a finite score: it still needs SOME enemy
 * to score non-zero), a target-dependent or unparseable `if=`, a score not
 * proven finite, a malformed `target_if` — stays refused, unless the next
 * section decides it.
 *
 * WHAT A TARGET DOMAIN ADDS (ONB-S3)
 *
 * The owner of an action may state the enemies it selects over
 * (`AtomBindings.targetDomainFor`). The rule is that of every other unknown
 * here: a line resolves only when EVERY evidence-consistent target world gives
 * the same answer. So no candidate order is ever read: not parser order, actor
 * id or event order. The pinned order among candidates only decides WHICH enemy
 * wins, and the rule below never depends on that, so reversing a domain cannot
 * change a verdict.
 *
 *   FIRST, score    FALSE in every world on every candidate of a CLOSED domain:
 *                   no enemy scores non-zero, so nothing is chosen. Not ready.
 *   FIRST, score    TRUE on a candidate proven ready, and truth-valued: some
 *                   enemy IS chosen, on an OPEN domain too, since an unobserved
 *                   enemy can only win instead of it. Truth-valued, because one
 *                   candidate needs `> 0` and several need `!= 0`, which only
 *                   agree on 0 and 1.
 *   FIRST, score    a top-level PLAYER_SCOPED conjunct FALSE: zero on every enemy
 *                   however many there are. Not ready, with no domain at all.
 *   any mode, if=   FALSE on every candidate of a CLOSED domain: not ready
 *                   whichever is chosen. TRUE on every one, once a target is
 *                   certainly chosen: ready whichever is chosen.
 *
 * Once a domain is stated, a target is certainly chosen only with a candidate
 * proven ready. For MIN/MAX that is a finite score AND such a candidate, since a
 * finite score alone proves nothing about targeting or range on the enemies the
 * domain names, and a world with none ready stays possible.
 *
 * On an OPEN domain a target-dependent `if=` stays refused, because the enemy
 * nobody observed could be the one chosen. No real evidence closes a domain
 * today (no upper bound is established), so every FIRST line on a real fight
 * still refuses unless a player-scoped fact or a proven candidate settles it.
 *
 * `call_action_list` IS NOT HERE. `call_action_list_t::action_ready`
 * (action.cpp:4672-4685) overrides the base and never calls `select_target()`,
 * so a call's `target_if` has no effect on readiness; the traversal already
 * reads a call's gate without consulting its options. Only a MALFORMED one —
 * an invalid APL at the pinned commit — is refused there.
 */

import { atomKey, isPlayerScoped, type ExpressionNode } from "./expression/ast.js";
import {
  actingAction,
  evaluateSimcExpression,
  type AtomBindings,
  type ExpressionEvaluation,
  type TargetCandidate,
  type TargetDomain,
} from "./expression/evaluate.js";
import { parseSimcExpression } from "./expression/parse.js";
import type { SpecAtomVocabulary } from "./expression/spec-vocabulary.js";
import type { AplAction, TargetIfStructure } from "./apl-authority.js";
import {
  proveTargetIndependentFalsehood,
  type TargetIndependenceFailure,
  type TargetIndependentElimination,
} from "./target-independence.js";

// The structure is part of the line representation; re-exported for readers of this module.
export {
  TARGET_IF_MODES,
  targetIfStructureOf,
  type TargetIfMode,
  type TargetIfStructure,
} from "./apl-authority.js";

/**
 * Whether a MIN/MAX score is POSITIVELY PROVEN finite on every target — an
 * internal proof property, never a public blocker (M11-D3-B1).
 *
 *   PROVEN_FINITE      every value SimulationCraft can compute for this
 *                      expression satisfies |value| <= `bound`
 *   NOT_PROVEN_FINITE  no such proof; target selection is NOT ignorable
 *
 * Unknown finiteness fails closed: anything without a rule below is
 * NOT_PROVEN_FINITE.
 */
export type ScoreFiniteness =
  | { readonly kind: "PROVEN_FINITE"; readonly bound: number }
  | {
      readonly kind: "NOT_PROVEN_FINITE";
      /**
       *   SCORE_UNSUPPORTED          the score is outside the supported expression
       *                              subset, so it has no AST to prove anything over
       *   NO_AUDITED_DOMAIN          an atom whose pinned value domain was not
       *                              audited — including every spec-declared atom
       *   ARITHMETIC_BOUND_EXCEEDED  `+`, `-` or `*` over bounds too large to
       *                              exclude overflow
       */
      readonly reason: "SCORE_UNSUPPORTED" | "NO_AUDITED_DOMAIN" | "ARITHMETIC_BOUND_EXCEEDED";
      /** The atom key or operator the proof stopped at, when there is one. */
      readonly at: string | null;
    };

/**
 * The largest magnitude `timespan_t::total_seconds()` can return:
 * `timespan_t` stores an `int_least64_t` of milliseconds and returns
 * `static_cast<double>( time ) * ( 1.0 / 1000 )` (engine/util/timespan.hpp:40-61).
 */
const TIMESPAN_SECONDS_BOUND = 2 ** 63 / 1000;

/**
 * Magnitude above which `+`, `-` and `*` are not proven free of overflow. Far
 * below `Number.MAX_VALUE`, so rounding in the bound arithmetic itself cannot
 * hide an overflow.
 */
const ARITHMETIC_BOUND_LIMIT = 1e300;

/**
 * Proves a score finite compositionally over the SUPPORTED expression AST,
 * against the pinned SimulationCraft semantics (33622e9d1662ff0e451691edf85a6b49cc9d11d9):
 *
 *   literal                  the tokenizer reads digits and one decimal point
 *                            (engine/sim/expressions.cpp:67-75): finite, |v|
 *   comparison  = < <= > >=  `static_cast<double>( std::less<double>()(...) )`
 *                            and its siblings (expressions.cpp:384-387, 422-433):
 *                            a bool, so 0 or 1 WHATEVER the operands — NaN
 *                            compares false
 *   &  |                     `left->eval() && right->eval()` / `||`
 *                            (expressions.cpp:333-358): a C++ bool, 0 or 1
 *   !                        `std::logical_not<>()( input->eval() )`
 *                            (expressions.cpp:179-181, 302-303): 0 or 1
 *   + - *                    finite when both operands are proven, with a bound
 *                            no overflow can exceed (`ARITHMETIC_BOUND_LIMIT`)
 *   <? >?                    `std::max` / `std::min` (expressions.cpp:212-226):
 *                            finite when BOTH operands are proven, bound
 *                            max(|a|, |b|) (M11-D3-C1)
 *   talent.<name>            `create_constant( …, _talent.enabled() )`
 *                            (engine/player/player.cpp:12355-12358): 0 or 1
 *   buff.<name>.up           `buff->check() > 0` through `coerce( bool )`
 *   debuff.<name>.up         (engine/buff/buff.cpp:409-418;
 *                            engine/sim/expressions.hpp:139-143) — the same
 *                            branch for both: action.cpp:3993-3996 routes
 *                            `debuff.` to `buff_t::create_expression`. 0 or 1
 *   target.time_to_die       `time_to_percent( 0 ).total_seconds()`
 *                            (player.cpp:11861-11891); every override returns a
 *                            `timespan_t` (player.cpp:7731-7761,
 *                            engine/class_modules/sc_enemy.cpp:1797-1845), and
 *                            `total_seconds()` of any `timespan_t` is finite
 *                            (`TIMESPAN_SECONDS_BOUND`)
 *
 * Division and modulus never parse here, so they are never proven. Every
 * other atom — remains, stacks, `.react`, resources, cooldowns, DoT state,
 * predictive state, `variable.*`, and EVERY spec-declared identifier — is
 * NOT_PROVEN_FINITE: the project's atom SHAPE is not a SimulationCraft value
 * domain (`buff.<name>.react` is a truth node here and a stack COUNT in
 * SimulationCraft), and a scope declaration says nothing about finiteness.
 */
export function scoreFinitenessOf(expressionRaw: string, vocabulary?: SpecAtomVocabulary): ScoreFiniteness {
  const parsed = parseSimcExpression(expressionRaw, vocabulary);
  if (!parsed.ok) return { kind: "NOT_PROVEN_FINITE", reason: "SCORE_UNSUPPORTED", at: null };
  return finitenessOf(parsed.ast);
}

function finitenessOf(node: ExpressionNode): ScoreFiniteness {
  switch (node.kind) {
    case "NUMBER":
      return Number.isFinite(node.value)
        ? { kind: "PROVEN_FINITE", bound: Math.abs(node.value) }
        : { kind: "NOT_PROVEN_FINITE", reason: "NO_AUDITED_DOMAIN", at: String(node.value) };
    case "COMPARISON":
    case "AND":
    case "OR":
    case "NOT":
    case "TALENT":
    case "BUFF_UP":
    case "DEBUFF_UP":
      return { kind: "PROVEN_FINITE", bound: 1 };
    case "TARGET_TIME_TO_DIE":
      return { kind: "PROVEN_FINITE", bound: TIMESPAN_SECONDS_BOUND };
    case "ADD":
    case "SUBTRACT":
    case "MULTIPLY": {
      const left = finitenessOf(node.left);
      if (left.kind !== "PROVEN_FINITE") return left;
      const right = finitenessOf(node.right);
      if (right.kind !== "PROVEN_FINITE") return right;
      const bound = node.kind === "MULTIPLY" ? left.bound * right.bound : left.bound + right.bound;
      return bound <= ARITHMETIC_BOUND_LIMIT
        ? { kind: "PROVEN_FINITE", bound }
        : { kind: "NOT_PROVEN_FINITE", reason: "ARITHMETIC_BOUND_EXCEEDED", at: node.kind };
    }
    case "EXTREMUM": {
      // M11-D3-C1. `std::max` / `std::min` return one operand or the other
      // (expressions.cpp:212-226), and `std::max( NaN, x )` returns the NaN —
      // so BOTH operands must be proven; neither rescues the other. Then
      // |max(a, b)| and |min(a, b)| are at most max(|a|, |b|).
      const left = finitenessOf(node.left);
      if (left.kind !== "PROVEN_FINITE") return left;
      const right = finitenessOf(node.right);
      if (right.kind !== "PROVEN_FINITE") return right;
      return { kind: "PROVEN_FINITE", bound: Math.max(left.bound, right.bound) };
    }
    default:
      return { kind: "NOT_PROVEN_FINITE", reason: "NO_AUDITED_DOMAIN", at: atomKey(node) ?? node.kind };
  }
}

/** Why a `target_if` line could be neither eliminated nor read as an ordinary line. */
export type TargetIfRefusalReason =
  /** A target domain was stated, and its worlds do not agree (ONB-S3). */
  | "TARGET_DOMAIN_NOT_CONVERGED"
  /** The option is malformed; see `TargetIfStructure`. */
  | "TARGET_IF_MALFORMED"
  /** FIRST gates on whether SOME enemy satisfies its expression — an enemy-set question. */
  | "FIRST_MODE_NEEDS_ENEMY_SET"
  /** `if=` is evaluated on the chosen enemy and reads target state, or a scope nobody established. */
  | "CONDITION_TARGET_DEPENDENT"
  /** `if=` is outside the supported expression subset, so its dependence cannot be classified. */
  | "CONDITION_UNSUPPORTED"
  /** The score is not PROVEN finite on every enemy, so MIN/MAX might choose none. */
  | "SCORE_NOT_PROVEN_FINITE";

export const TARGET_IF_REFUSAL_REASONS = [
  "TARGET_DOMAIN_NOT_CONVERGED",
  "TARGET_IF_MALFORMED",
  "FIRST_MODE_NEEDS_ENEMY_SET",
  "CONDITION_TARGET_DEPENDENT",
  "CONDITION_UNSUPPORTED",
  "SCORE_NOT_PROVEN_FINITE",
] as const satisfies readonly TargetIfRefusalReason[];

/**
 * What target selection means for one line whose ONLY unsupported option is
 * `target_if`.
 *
 *   ELIMINATED_FOR_EVERY_TARGET  a PLAYER_SCOPED `if=` conjunct is FALSE; the
 *                                line is not ready whatever target is chosen
 *   TARGET_SELECTION_IGNORABLE   a target is certainly chosen, and whichever it
 *                                is the line reads the same: MIN/MAX with a
 *                                finite score, or (ONB-S3) a target domain.
 *                                Evaluate as an ordinary line
 *   REFUSED                      neither; the line stays unresolved
 */
export type TargetIfVerdict =
  | {
      readonly kind: "ELIMINATED_FOR_EVERY_TARGET";
      readonly structure: Extract<TargetIfStructure, { kind: "WELL_FORMED" }>;
      readonly elimination: TargetIndependentElimination & { readonly kind: "ELIMINATED_FOR_EVERY_TARGET" };
    }
  | {
      readonly kind: "TARGET_SELECTION_IGNORABLE";
      readonly structure: Extract<TargetIfStructure, { kind: "WELL_FORMED" }>;
      /**
       * The proof that MIN/MAX always chooses a target. `null` for FIRST (ONB-S3), whose proof
       * is `overTargets`: a proven-ready candidate with a truth-valued score of TRUE.
       */
      readonly scoreFiniteness: Extract<ScoreFiniteness, { kind: "PROVEN_FINITE" }> | null;
      /**
       * Whether there was an `if=` at all. When present it is wholly PLAYER_SCOPED, or (ONB-S3)
       * proven TRUE on every candidate of a closed domain.
       */
      readonly condition: "ABSENT" | "PLAYER_SCOPED" | "TRUE_ON_EVERY_CANDIDATE";
      /** Absent unless a target domain decided this (ONB-S3). */
      readonly overTargets?: {
        readonly closure: TargetDomain["closure"];
        readonly provenance: string;
        readonly candidateKeys: readonly string[];
        /** What to read the `if=` with: any candidate, since all agree. Null when not needed. */
        readonly conditionOverlay: Partial<AtomBindings> | null;
      };
    }
  | {
      readonly kind: "REFUSED";
      readonly structure: TargetIfStructure;
      readonly reason: TargetIfRefusalReason;
    };

/**
 * The verdict for one line, or `null` when B1 does not apply to it: no
 * `target_if`, or another unsupported option alongside it (`cycle_targets`
 * keeps its own M5-D1 rule, and a line carrying both is refused there).
 */
export function targetIfVerdict(action: AplAction, bindings: AtomBindings): TargetIfVerdict | null {
  const structure = action.targetIf;
  if (structure === null) return null;
  if (action.unsupportedOptions.some((option) => option.optionKey !== "target_if")) return null;
  if (structure.kind === "MALFORMED") return { kind: "REFUSED", structure, reason: "TARGET_IF_MALFORMED" };

  // Elimination first, in every mode: it needs nothing from target selection.
  const elimination = proveTargetIndependentFalsehood(action, bindings);
  if (elimination.kind === "ELIMINATED_FOR_EVERY_TARGET") {
    return { kind: "ELIMINATED_FOR_EVERY_TARGET", structure, elimination };
  }

  // A FALSE player-only conjunct of the FIRST score: zero on every enemy, whatever the set is.
  if (structure.mode === "FIRST") {
    const scoreProof = proveTargetIndependentFalsehood(
      { ...action, conditionRaw: structure.expressionRaw },
      bindings,
    );
    if (scoreProof.kind === "ELIMINATED_FOR_EVERY_TARGET") {
      return {
        kind: "ELIMINATED_FOR_EVERY_TARGET",
        structure,
        elimination: {
          ...scoreProof,
          overTargets: { basis: "SCORE_PLAYER_CONJUNCT_FALSE", candidateKeys: [] },
        },
      };
    }
  }

  const domain = bindings.targetDomainFor?.(action.actionToken) ?? null;
  if (domain !== null) {
    const verdict = verdictOverDomain(action, structure, domain, bindings);
    if (verdict !== null) return verdict;
  }

  if (structure.mode === "FIRST") return { kind: "REFUSED", structure, reason: "FIRST_MODE_NEEDS_ENEMY_SET" };

  if (action.conditionRaw !== null) {
    // The SAME vocabulary the line's own evaluation parses with, so the scope
    // read here is the scope of the expression that will be evaluated.
    const parsed = parseSimcExpression(action.conditionRaw, bindings.specAtoms?.vocabulary);
    if (!parsed.ok) return { kind: "REFUSED", structure, reason: "CONDITION_UNSUPPORTED" };
    if (!isPlayerScoped(parsed.ast))
      return { kind: "REFUSED", structure, reason: "CONDITION_TARGET_DEPENDENT" };
  }
  const scoreFiniteness = scoreFinitenessOf(structure.expressionRaw, bindings.specAtoms?.vocabulary);
  if (scoreFiniteness.kind !== "PROVEN_FINITE") {
    return { kind: "REFUSED", structure, reason: "SCORE_NOT_PROVEN_FINITE" };
  }
  return {
    kind: "TARGET_SELECTION_IGNORABLE",
    structure,
    scoreFiniteness,
    condition: action.conditionRaw === null ? "ABSENT" : "PLAYER_SCOPED",
  };
}

/** One expression on one candidate: the base bindings, with what differs on that enemy. */
function evaluateOn(
  raw: string,
  action: AplAction,
  candidate: TargetCandidate,
  bindings: AtomBindings,
): ExpressionEvaluation | null {
  const candidateBindings: AtomBindings = { ...bindings, ...candidate.overlay };
  const parsed = parseSimcExpression(raw, candidateBindings.specAtoms?.vocabulary);
  if (!parsed.ok) return null;
  return evaluateSimcExpression(parsed.ast, raw, candidateBindings, actingAction(action.actionToken));
}

/** The one truth an expression takes on a candidate: TRUE, FALSE, or undecided. */
function truthOn(evaluation: ExpressionEvaluation | null | undefined): "TRUE" | "FALSE" | "UNDECIDED" {
  if (evaluation?.outcome !== "RESOLVED") return "UNDECIDED";
  return evaluation.value ? "TRUE" : "FALSE";
}

/**
 * Whether `node` can only evaluate to 0 or 1, on the pinned semantics `finitenessOf` cites, plus a
 * declared truth named `buff.<name>.up`, `.down` or the same on `debuff.`, which the pinned
 * expression returns as a bool (buff.cpp:409-429). Every other atom is refused: a spec-declared
 * truth may be a count in SimulationCraft.
 */
function isTruthValued(node: ExpressionNode): boolean {
  switch (node.kind) {
    case "COMPARISON":
    case "AND":
    case "OR":
    case "NOT":
    case "TALENT":
    case "BUFF_UP":
    case "DEBUFF_UP":
      return true;
    case "SPEC_ATOM":
      return node.shape === "BOOLEAN" && /^(buff|debuff).[a-z0-9_]+.(up|down)$/.test(node.identifier);
    default:
      return false;
  }
}

/**
 * A line's verdict over a stated target domain. See the module header. Candidate order is never
 * read, and an empty domain settles nothing.
 */
function verdictOverDomain(
  action: AplAction,
  structure: Extract<TargetIfStructure, { kind: "WELL_FORMED" }>,
  domain: TargetDomain,
  bindings: AtomBindings,
): TargetIfVerdict {
  const refused: TargetIfVerdict = { kind: "REFUSED", structure, reason: "TARGET_DOMAIN_NOT_CONVERGED" };
  if (domain.candidates.length === 0) return refused;
  if (domain.closure === "CLOSED" && domain.provenance.length === 0) return refused;
  const candidateKeys = domain.candidates.map((candidate) => candidate.key);
  const eliminated = (
    basis: "SCORE_ZERO_ON_EVERY_CANDIDATE" | "CONDITION_FALSE_ON_EVERY_CANDIDATE",
    evaluation: ExpressionEvaluation | null | undefined,
  ): TargetIfVerdict => {
    if (evaluation?.outcome !== "RESOLVED") return refused;
    return {
      kind: "ELIMINATED_FOR_EVERY_TARGET",
      structure,
      elimination: {
        kind: "ELIMINATED_FOR_EVERY_TARGET",
        conjunctIndex: 0,
        conjunctAtomKeys: evaluation.trace.atoms.map((atom) => atom.key),
        trace: evaluation.trace,
        overTargets: { basis, candidateKeys },
      },
    };
  };

  // ---- is a target certainly chosen, or certainly not? ----
  const vocabulary = bindings.specAtoms?.vocabulary;
  const finiteness = scoreFinitenessOf(structure.expressionRaw, vocabulary);
  let targetCertainlyChosen = false;
  if (structure.mode === "FIRST") {
    const parsedScore = parseSimcExpression(structure.expressionRaw, vocabulary);
    if (!parsedScore.ok) return refused;
    const scores = domain.candidates.map((candidate) =>
      evaluateOn(structure.expressionRaw, action, candidate, bindings),
    );
    if (domain.closure === "CLOSED" && scores.every((score) => truthOn(score) === "FALSE")) {
      return eliminated("SCORE_ZERO_ON_EVERY_CANDIDATE", scores[0]);
    }
    targetCertainlyChosen =
      isTruthValued(parsedScore.ast) &&
      domain.candidates.some(
        (candidate, index) => candidate.targetReady === "PROVEN_READY" && truthOn(scores[index]) === "TRUE",
      );
  } else {
    targetCertainlyChosen =
      finiteness.kind === "PROVEN_FINITE" &&
      domain.candidates.some((candidate) => candidate.targetReady === "PROVEN_READY");
  }

  // ---- the if=, on the enemy chosen ----
  const ready = (
    condition: "ABSENT" | "PLAYER_SCOPED" | "TRUE_ON_EVERY_CANDIDATE",
    conditionOverlay: Partial<AtomBindings> | null,
  ): TargetIfVerdict => ({
    kind: "TARGET_SELECTION_IGNORABLE",
    structure,
    scoreFiniteness: finiteness.kind === "PROVEN_FINITE" && structure.mode !== "FIRST" ? finiteness : null,
    condition,
    overTargets: { closure: domain.closure, provenance: domain.provenance, candidateKeys, conditionOverlay },
  });

  if (action.conditionRaw === null) return targetCertainlyChosen ? ready("ABSENT", null) : refused;
  const parsedCondition = parseSimcExpression(action.conditionRaw, vocabulary);
  if (!parsedCondition.ok) return { kind: "REFUSED", structure, reason: "CONDITION_UNSUPPORTED" };
  if (isPlayerScoped(parsedCondition.ast)) {
    return targetCertainlyChosen ? ready("PLAYER_SCOPED", null) : refused;
  }
  if (domain.closure !== "CLOSED") return refused;
  const conditionRaw = action.conditionRaw;
  const conditions = domain.candidates.map((candidate) =>
    evaluateOn(conditionRaw, action, candidate, bindings),
  );
  if (conditions.every((condition) => truthOn(condition) === "FALSE")) {
    return eliminated("CONDITION_FALSE_ON_EVERY_CANDIDATE", conditions[0]);
  }
  const [anyCandidate] = domain.candidates;
  if (
    targetCertainlyChosen &&
    anyCandidate !== undefined &&
    conditions.every((condition) => truthOn(condition) === "TRUE")
  ) {
    return ready("TRUE_ON_EVERY_CANDIDATE", anyCandidate.overlay);
  }
  return refused;
}

/**
 * What one line's unsupported TARGETING options mean for the scan that
 * reaches it — the ONE rule both selectors apply, so the single-list walker
 * and the nested traversal cannot disagree about a `target_if` line.
 *
 *   ORDINARY_LINE                target selection is ignorable (MIN/MAX,
 *                                finite score, `if=` absent or PLAYER_SCOPED):
 *                                evaluate the line as if it had no `target_if`
 *   ELIMINATED_FOR_EVERY_TARGET  a PLAYER_SCOPED `if=` conjunct is FALSE
 *   REFUSED                      neither; the scan cannot get past the line
 *
 * Call it only for a line with at least one unsupported option. A line with
 * NO `target_if` keeps the M5-D1 `cycle_targets` rule exactly; a line with
 * `target_if` beside another unsupported option is refused outright, as
 * before.
 */
export type TargetingOutcome =
  | {
      readonly kind: "ORDINARY_LINE";
      readonly targetIf: Extract<TargetIfVerdict, { kind: "TARGET_SELECTION_IGNORABLE" }>;
    }
  | {
      readonly kind: "ELIMINATED_FOR_EVERY_TARGET";
      readonly elimination: TargetIndependentElimination & { readonly kind: "ELIMINATED_FOR_EVERY_TARGET" };
    }
  | {
      readonly kind: "REFUSED";
      readonly failure: TargetIndependenceFailure;
      /** Why `target_if` itself could not be read past; `null` when B1 did not apply. */
      readonly targetIf: Extract<TargetIfVerdict, { kind: "REFUSED" }> | null;
    };

export function targetingOutcomeFor(action: AplAction, bindings: AtomBindings): TargetingOutcome {
  const targetIf = targetIfVerdict(action, bindings);
  if (targetIf?.kind === "TARGET_SELECTION_IGNORABLE") return { kind: "ORDINARY_LINE", targetIf };
  if (targetIf?.kind === "ELIMINATED_FOR_EVERY_TARGET") {
    return { kind: "ELIMINATED_FOR_EVERY_TARGET", elimination: targetIf.elimination };
  }
  if (targetIf?.kind === "REFUSED") {
    if (targetIf.reason === "TARGET_IF_MALFORMED")
      return { kind: "REFUSED", failure: "PROOF_NOT_ATTEMPTED", targetIf };
    // Not eliminated, by construction: `targetIfVerdict` tried that first.
    const proof = proveTargetIndependentFalsehood(action, bindings);
    const failure = proof.kind === "NOT_PROVEN" ? proof.failure : "NO_TARGET_INDEPENDENT_CONJUNCT_IS_FALSE";
    return { kind: "REFUSED", failure, targetIf };
  }

  // B1 does not apply. `target_if` beside another unsupported option is
  // refused outright; `cycle_targets` alone keeps its M5-D1 conjunct rule.
  const retargets = action.unsupportedOptions.some((option) => option.optionKey === "target_if");
  if (retargets) return { kind: "REFUSED", failure: "NO_TARGET_INDEPENDENT_CONJUNCT", targetIf: null };
  const elimination = proveTargetIndependentFalsehood(action, bindings);
  return elimination.kind === "ELIMINATED_FOR_EVERY_TARGET"
    ? { kind: "ELIMINATED_FOR_EVERY_TARGET", elimination }
    : { kind: "REFUSED", failure: elimination.failure, targetIf: null };
}
