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
  /**
   * `stealthed.rogue` — TRUTH-shaped.
   *
   * ONE scope, and the name is a trap worth spelling out. The pinned expression
   * `stealthed.rogue` binds to the mask `STEALTH_BASIC | STEALTH_ROGUE`
   * (sc_rogue.cpp:9658-9662) — Stealth, Vanish, Subterfuge and Shadow Dance. The
   * ENUM CONSTANT named `STEALTH_ROGUE` is only Subterfuge + Shadow Dance
   * (sc_rogue.cpp:44). They are different sets, and `stealthed.basic`,
   * `stealthed.all` and `stealthed.improved_garrote` are different sets again —
   * so only the one scope this project has evidence for is representable.
   */
  | { readonly kind: "STEALTHED_ROGUE" }
  /**
   * `talent.<name>` — TRUTH-shaped. A static build fact, `->ok()` in SimC.
   *
   * The name never contains a dot. `talent.scent_of_blood.rank` is a MAGNITUDE
   * and is a different expression; refusing it at the parser is what stops a rank
   * from being read as a boolean.
   */
  | { readonly kind: "TALENT"; readonly talentName: string }
  /**
   * `variable.single_target` — TRUTH-shaped, and deliberately the only variable.
   *
   * A generic `variable.<name>` node would be WRONG. The pinned APL also contains
   * `variable.trinket_sync_slot`, which is compared against `1` and `2` and is
   * therefore a magnitude. One node kind cannot be both shapes, and guessing
   * per-name is exactly the inference this layer must not make. The one variable
   * whose shape is established by its own assignment
   * (`value=spell_targets.fan_of_knives=1`, a comparison) is representable; the
   * rest stay refused.
   */
  | { readonly kind: "VARIABLE_SINGLE_TARGET" }
  /**
   * `pmultiplier` — MAGNITUDE-shaped, and permanently unbindable.
   *
   * SimulationCraft's `dot.<x>.pmultiplier` returns
   * `dot->state->persistent_multiplier` (dot.cpp:568-573): the damage multiplier
   * SNAPSHOTTED when the DoT was applied. Reconstructing it from Warcraft Logs
   * would mean inferring a snapshot from damage numbers, which this project does
   * not do. It is recognised so an expression containing it can parse whole, and
   * it has no binding field — see `evaluate.ts`.
   *
   * Written bare in the pinned `core_dot` lines, where it refers to the acting
   * action's own DoT on its own target.
   */
  | { readonly kind: "DOT_PMULTIPLIER" }
  /**
   * `remains` — MAGNITUDE-shaped, in SECONDS.
   *
   * The acting action's own DoT remaining duration (`dot->remains()`,
   * dot.cpp:480-486). NOT `fight_remains`, NOT `target.time_to_die`, NOT a
   * cooldown. Those are different atoms with different keys and, in two cases,
   * different answers about whether they may be known at all.
   */
  | { readonly kind: "DOT_REMAINS" }
  /**
   * `dot.<name>.ticking` — TRUTH-shaped. Another action's DoT, on this target.
   *
   * Distinct from the bare `remains` above, which is the ACTING action's own
   * DoT. This one names an ability, so it needs a per-ability binding; with
   * none supplied it becomes an unresolved atom and is enumerated.
   *
   * Recognising it does NOT make `dot.` a namespace: `dot.<name>.remains` and
   * `dot.<name>.pmultiplier` are still refused whole.
   */
  | { readonly kind: "DOT_TICKING"; readonly dotName: string }
  /**
   * `cooldown.<name>.remains` — MAGNITUDE-shaped, in SECONDS.
   *
   * Warcraft Logs reports no cooldown state at all, so this is always derived:
   * an observed cast plus a pinned base cooldown plus a proof that nothing
   * modified it. See `src/engine/game-state/cooldowns`.
   *
   * `cooldown.<name>.ready` is a DIFFERENT expression with a different shape and
   * stays refused, as does `cooldown.<name>.duration`.
   */
  | { readonly kind: "COOLDOWN_REMAINS"; readonly cooldownName: string }
  /**
   * `target.time_to_die` — MAGNITUDE-shaped, and PREDICTIVE.
   *
   * Never bindable, for exactly the reason `fight_remains` is not: it is
   * knowledge of how the fight turned out, and using it to judge an earlier
   * decision would blame a player for not knowing the future. Recognised so an
   * expression containing it can parse whole; it has no binding field.
   */
  | { readonly kind: "TARGET_TIME_TO_DIE" }
  | { readonly kind: "NOT"; readonly operand: ExpressionNode }
  /**
   * `*` and `+`, at pinned SimulationCraft precedence.
   *
   * Verified against `engine/sim/expressions.cpp` `precedence()`: MULT is 7, ADD
   * is 6, comparisons are 4, AND is 3, OR is 1, and unary NOT is 8. So
   * `4*!variable.single_target` binds the `!` tighter than the `*`, and
   * `14+6*x+4*y` is `14 + (6*x) + (4*y)`.
   */
  | { readonly kind: "MULTIPLY"; readonly left: ExpressionNode; readonly right: ExpressionNode }
  | { readonly kind: "ADD"; readonly left: ExpressionNode; readonly right: ExpressionNode }
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
    case "STEALTHED_ROGUE":
      return { key: "stealthed.rogue", shape: "BOOLEAN" };
    case "TALENT":
      // Keyed by name, so every occurrence of `talent.blindside` correlates and
      // `talent.improved_ambush` stays independent of it. The key namespace is
      // `talent.` and cannot collide with a buff key — which matters because the
      // Blindside TALENT (328085) and the Blindside PROC BUFF (121153) are
      // different facts and must never share a world assignment.
      return { key: `talent.${node.talentName}`, shape: "BOOLEAN" };
    case "VARIABLE_SINGLE_TARGET":
      return { key: "variable.single_target", shape: "BOOLEAN" };
    case "DOT_PMULTIPLIER":
      return { key: "pmultiplier", shape: "NUMERIC" };
    case "DOT_REMAINS":
      return { key: "remains", shape: "NUMERIC" };
    case "DOT_TICKING":
      // Keyed by name, so every occurrence of `dot.garrote.ticking` correlates
      // and `dot.rupture.ticking` stays independent of it.
      return { key: `dot.${node.dotName}.ticking`, shape: "BOOLEAN" };
    case "COOLDOWN_REMAINS":
      return { key: `cooldown.${node.cooldownName}.remains`, shape: "NUMERIC" };
    case "TARGET_TIME_TO_DIE":
      return { key: "target.time_to_die", shape: "NUMERIC" };
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
      case "MULTIPLY":
      case "ADD":
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
