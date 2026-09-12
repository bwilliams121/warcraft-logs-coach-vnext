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
 *
 * ATOM SHAPE IS DECLARED HERE, NOT INFERRED AT THE BINDING SITE.
 *
 * An atom is either TRUTH-SHAPED (`buff.x.up` — a fact that is on or off) or
 * MAGNITUDE-SHAPED (`combo_points`, `energy.pct`, `fight_remains`,
 * `buff.x.remains`). The distinction decides what may be done with an atom
 * whose value is unavailable:
 *
 *   BOOLEAN  unavailable -> enumerate both assignments, correlated across every
 *            occurrence, and keep the answer only when the worlds agree
 *   NUMERIC  unavailable -> UNKNOWN_NUMBER, and NEVER enumerated
 *
 * Enumerating a magnitude over {0, 1} would let `buff.envenom.remains<=1` come
 * out decidable from two invented durations. Declaring the shape on the node —
 * where it is a property of the syntax rather than of whatever the caller
 * happened to bind — is what makes that unrepresentable instead of merely
 * discouraged.
 */

/**
 * Comparison operators in the supported subset.
 *
 * `>` and `<=` were added in M5-B because the pinned `spend` list and the
 * pinned `generate` call condition need them. SimulationCraft's max/min
 * operators `>?` and `<?` remain UNSUPPORTED and must never decay into `>`
 * or `<`.
 */
export type ComparisonOperator = ">=" | ">" | "=" | "<" | "<=";

export type ExpressionNode =
  | { readonly kind: "NUMBER"; readonly value: number }
  /** `combo_points` */
  | { readonly kind: "COMBO_POINTS" }
  /** `combo_points.deficit` */
  | { readonly kind: "COMBO_POINTS_DEFICIT" }
  /** `energy.pct` — a percentage from 0 to 100, per SimulationCraft. */
  | { readonly kind: "ENERGY_PCT" }
  /** `fight_remains` — PREDICTIVE. Never bindable; see `evaluate.ts`. */
  | { readonly kind: "FIGHT_REMAINS" }
  /** `buff.<name>.up` — understood syntax, value supplied by bindings. */
  | { readonly kind: "BUFF_UP"; readonly buffName: string }
  /** `buff.<name>.remains` — understood syntax, no state model in M5-B. */
  | { readonly kind: "BUFF_REMAINS"; readonly buffName: string }
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
 * Whether an atom denotes a truth-shaped fact or a magnitude.
 *
 * Only BOOLEAN atoms may be enumerated when unresolved.
 */
export type AtomShape = "BOOLEAN" | "NUMERIC";

export const ATOM_SHAPES = ["BOOLEAN", "NUMERIC"] as const satisfies readonly AtomShape[];

/** One atom occurrence, identified by key and classified by shape. */
export interface AtomDescriptor {
  readonly key: string;
  readonly shape: AtomShape;
}

/**
 * The stable key an atom is identified by.
 *
 * Load-bearing for correlation: every occurrence of `buff.darkest_night.up` in
 * one expression yields the SAME key, so world enumeration binds them together
 * rather than treating repeats as independent unknowns.
 *
 * `buff.x.up` and `buff.x.remains` yield DIFFERENT keys. They are different
 * facts about the same aura, and sharing a key would let a boolean world
 * assignment leak into a numeric comparison.
 */
export function atomKey(node: ExpressionNode): string | null {
  return atomOf(node)?.key ?? null;
}

/** The atom a node denotes, or `null` when the node is not an atom. */
export function atomOf(node: ExpressionNode): AtomDescriptor | null {
  switch (node.kind) {
    case "COMBO_POINTS":
      return { key: "combo_points", shape: "NUMERIC" };
    case "COMBO_POINTS_DEFICIT":
      return { key: "combo_points.deficit", shape: "NUMERIC" };
    case "ENERGY_PCT":
      return { key: "energy.pct", shape: "NUMERIC" };
    case "FIGHT_REMAINS":
      return { key: "fight_remains", shape: "NUMERIC" };
    case "BUFF_UP":
      return { key: `buff.${node.buffName}.up`, shape: "BOOLEAN" };
    case "BUFF_REMAINS":
      return { key: `buff.${node.buffName}.remains`, shape: "NUMERIC" };
    default:
      return null;
  }
}

/** Every distinct atom in an expression, in first-seen order. */
export function collectAtoms(node: ExpressionNode): readonly AtomDescriptor[] {
  const seen: AtomDescriptor[] = [];
  const walk = (current: ExpressionNode): void => {
    const atom = atomOf(current);
    if (atom !== null) {
      if (!seen.some((entry) => entry.key === atom.key)) seen.push(atom);
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

/** Every distinct atom key in an expression, in first-seen order. */
export function collectAtomKeys(node: ExpressionNode): readonly string[] {
  return collectAtoms(node).map((atom) => atom.key);
}
