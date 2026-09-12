/**
 * The AST for the SUPPORTED SimulationCraft expression subset.
 *
 * There is deliberately no `UNSUPPORTED` node kind. An unsupported operator,
 * identifier or literal fails the WHOLE expression at parse time.
 *
 * That is a correctness decision, not a simplification. If unsupported syntax
 * became a local node, Kleene short-circuiting could make it vanish —
 * `false & <unsupported>` would evaluate to `false`, and the analyzer would
 * produce a confident verdict resting on a fragment it never understood. The
 * only way to guarantee that cannot happen is to refuse the expression whole.
 *
 * UNRESOLVED STATE IS A DIFFERENT THING ENTIRELY. `buff.darkest_night.up` is
 * fully understood syntax whose VALUE we do not know. That is representable
 * here, and it is resolved by world enumeration in `evaluate.ts`.
 *
 * SimulationCraft has no separate boolean type: expressions are numeric and
 * zero is false. This AST models that directly rather than inventing a boolean
 * layer that would then need coercion rules of its own.
 */

/** Comparison operators in the supported subset. Note `>` is NOT among them. */
export type ComparisonOperator = ">=" | "=" | "<";

export type ExpressionNode =
  | { readonly kind: "NUMBER"; readonly value: number }
  /** `combo_points` */
  | { readonly kind: "COMBO_POINTS" }
  /** `combo_points.deficit` */
  | { readonly kind: "COMBO_POINTS_DEFICIT" }
  /** `buff.<name>.up` — understood syntax, value supplied by bindings. */
  | { readonly kind: "BUFF_UP"; readonly buffName: string }
  | { readonly kind: "NOT"; readonly operand: ExpressionNode }
  | {
      readonly kind: "COMPARISON";
      readonly operator: ComparisonOperator;
      readonly left: ExpressionNode;
      readonly right: ExpressionNode;
    }
  | { readonly kind: "AND"; readonly left: ExpressionNode; readonly right: ExpressionNode }
  | { readonly kind: "OR"; readonly left: ExpressionNode; readonly right: ExpressionNode };

/**
 * The stable key an atom is identified by.
 *
 * Load-bearing for correlation: every occurrence of `buff.darkest_night.up` in
 * one expression yields the SAME key, so world enumeration binds them together
 * rather than treating repeats as independent unknowns.
 */
export function atomKey(node: ExpressionNode): string | null {
  switch (node.kind) {
    case "COMBO_POINTS":
      return "combo_points";
    case "COMBO_POINTS_DEFICIT":
      return "combo_points.deficit";
    case "BUFF_UP":
      return `buff.${node.buffName}.up`;
    default:
      return null;
  }
}

/** Every distinct atom key in an expression, in first-seen order. */
export function collectAtomKeys(node: ExpressionNode): readonly string[] {
  const seen: string[] = [];
  const walk = (current: ExpressionNode): void => {
    const key = atomKey(current);
    if (key !== null) {
      if (!seen.includes(key)) seen.push(key);
      return;
    }
    switch (current.kind) {
      case "NOT":
        walk(current.operand);
        return;
      case "COMPARISON":
      case "AND":
      case "OR":
        walk(current.left);
        walk(current.right);
        return;
      default:
        return;
    }
  };
  walk(node);
  return seen;
}
