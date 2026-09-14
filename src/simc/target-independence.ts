/**
 * The ONE thing this project can prove about a target-cycling APL entry without
 * enumerating targets.
 *
 * THE PROBLEM
 *
 * `core_dot[2]` and `core_dot[4]` carry `cycle_targets=1`. SimulationCraft's
 * `action_t::ready()` then walks the candidate target list and re-runs
 * `action_ready()` for each one (action.cpp:2463-2488):
 *
 *     for ( size_t i = 0; i < num_targets; i++ )
 *     {
 *       target = ctl[ i ];
 *       if ( action_ready() ) { found_ready = true; break; }
 *     }
 *
 * So the condition has a DIFFERENT value per candidate, and this project models
 * no target list. Evaluating such a line against the one implicit target would
 * answer a multi-target question as a single-target one, which is exactly the
 * failure `CLAUDE.md`'s multi-target rule exists to prevent. The default is
 * therefore a refusal.
 *
 * THE EXCEPTION, AND WHY IT IS A PROOF RATHER THAN A SHORTCUT
 *
 * A condition is a top-level conjunction. If ONE conjunct reads nothing but
 * PLAYER state, its value is the same for every candidate target — the loop
 * changes `target`, and no atom in that conjunct looks at `target`. And if that
 * conjunct is FALSE, then `FALSE & anything` is FALSE for every candidate, so the
 * loop finds none ready and the entry cannot be selected.
 *
 * That is a complete argument, and it needs no target list. It is what lets a
 * Crimson Tempest build eliminate both cycling entries — they open with
 * `!talent.crimson_tempest`, a static build fact — while a build without the
 * talent correctly gets a refusal instead.
 *
 * WHAT IS DELIBERATELY NOT HERE
 *
 * No target enumeration, no target scoring, no `target_if`. `target_if` picks a
 * winner by evaluating a SCORING expression over candidates
 * (action.cpp:2429-2461); the same conjunct argument would apply to its `if=`,
 * but the retarget itself changes which target every LATER atom in the scan reads,
 * and that is not something one conjunct can settle. So `target_if` is refused
 * outright and is not routed through this module.
 *
 * WHY EACH CONJUNCT IS EVALUATED ALONE
 *
 * Evaluating a conjunct in isolation loses correlation with unresolved atoms
 * elsewhere in the expression, which makes the proof STRICTLY WEAKER than
 * evaluating the whole thing — it can only fail to find an elimination, never
 * invent one. That is the right direction: a conjunct proven FALSE across every
 * world of its own atoms is FALSE in every world of the larger expression too.
 */

import { collectAtomKeys, isPlayerScoped, topLevelConjuncts, type ExpressionNode } from "./expression/ast.js";
import {
  actingAction,
  evaluateSimcExpression,
  type AtomBindings,
  type ExpressionTrace,
} from "./expression/evaluate.js";
import { parseSimcExpression } from "./expression/parse.js";
import type { AplAction } from "./apl-authority.js";

/**
 * Why an entry using unsupported targeting could not be eliminated.
 *
 * Each names a different missing thing, because the remedies differ: a wider
 * parser fixes the first, and only real state fixes the last.
 */
export type TargetIndependenceFailure =
  /** The entry is unconditional, so there is no conjunct that could be false. */
  | "NO_CONDITION"
  /** The condition is outside the supported expression subset. */
  | "CONDITION_UNSUPPORTED"
  /** Every top-level conjunct reads target state, so none is target-independent. */
  | "NO_TARGET_INDEPENDENT_CONJUNCT"
  /** Target-independent conjuncts exist, and none of them is provably FALSE. */
  | "NO_TARGET_INDEPENDENT_CONJUNCT_IS_FALSE";

export const TARGET_INDEPENDENCE_FAILURES = [
  "NO_CONDITION",
  "CONDITION_UNSUPPORTED",
  "NO_TARGET_INDEPENDENT_CONJUNCT",
  "NO_TARGET_INDEPENDENT_CONJUNCT_IS_FALSE",
] as const satisfies readonly TargetIndependenceFailure[];

/**
 * The proof that a cycling entry cannot select, or the reason there is none.
 *
 * A discriminated union rather than a boolean, because only the positive member
 * has evidence to carry and only the negative one has a reason.
 */
export type TargetIndependentElimination =
  | {
      readonly kind: "ELIMINATED_FOR_EVERY_TARGET";
      /** Which top-level conjunct proved it, counting from zero. */
      readonly conjunctIndex: number;
      /** The atoms that conjunct read. All PLAYER_SCOPED, by construction. */
      readonly conjunctAtomKeys: readonly string[];
      /** The conjunct's own evaluation, so a reader can check the world table. */
      readonly trace: ExpressionTrace;
    }
  | { readonly kind: "NOT_PROVEN"; readonly failure: TargetIndependenceFailure };

function notProven(failure: TargetIndependenceFailure): TargetIndependentElimination {
  return { kind: "NOT_PROVEN", failure };
}

/**
 * Attempts the proof for one action's condition.
 *
 * Takes the whole action so the acting-action context is right: a conjunct is
 * evaluated exactly as it would be on this entry, which matters because
 * `refreshable` and `remains` are self-addressing. In practice such a conjunct is
 * never player-scoped, so it never reaches evaluation here — but wiring the
 * context correctly means that stays true by construction rather than by luck.
 */
export function proveTargetIndependentFalsehood(
  action: AplAction,
  bindings: AtomBindings,
): TargetIndependentElimination {
  if (action.conditionRaw === null) return notProven("NO_CONDITION");

  const parsed = parseSimcExpression(action.conditionRaw);
  if (!parsed.ok) return notProven("CONDITION_UNSUPPORTED");

  const conjuncts = topLevelConjuncts(parsed.ast);
  const context = actingAction(action.actionToken);
  let sawPlayerScoped = false;

  for (let index = 0; index < conjuncts.length; index += 1) {
    const conjunct = conjuncts[index];
    if (conjunct === undefined) continue;
    if (!isPlayerScoped(conjunct)) continue;
    sawPlayerScoped = true;

    const evaluation = evaluateSimcExpression(
      conjunct,
      // The FULL line is carried as the trace's raw text. A reconstructed
      // fragment would be text nobody wrote; `conjunctIndex` says which part of
      // the real string was evaluated.
      action.conditionRaw,
      bindings,
      context,
    );
    // Only a RESOLVED false counts. UNRESOLVED means the worlds disagreed, and
    // UNSUPPORTED means the evaluator declined — neither proves anything.
    if (evaluation.outcome !== "RESOLVED" || evaluation.value) continue;

    return {
      kind: "ELIMINATED_FOR_EVERY_TARGET",
      conjunctIndex: index,
      conjunctAtomKeys: collectAtomKeys(conjunct),
      trace: evaluation.trace,
    };
  }

  return notProven(
    sawPlayerScoped ? "NO_TARGET_INDEPENDENT_CONJUNCT_IS_FALSE" : "NO_TARGET_INDEPENDENT_CONJUNCT",
  );
}

/**
 * Exported for the contract test, which pins that the AND-spine is what gets
 * split and that an OR is never descended into.
 */
export function conjunctsOf(ast: ExpressionNode): readonly ExpressionNode[] {
  return topLevelConjuncts(ast);
}
