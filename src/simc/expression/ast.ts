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

/** The two extremum operators, as WRITTEN. Read their meaning through `extremumOf`, never by eye. */
export type ExtremumOperator = "<?" | ">?";

/**
 * What an extremum operator computes, per the pinned tokenizer: `<?` is the
 * MAXIMUM and `>?` the MINIMUM (engine/sim/expressions.cpp:132-147, 212-226,
 * 413-416). The one place that mapping lives.
 */
export function extremumOf(operator: ExtremumOperator): "MAX" | "MIN" {
  return operator === "<?" ? "MAX" : "MIN";
}

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
   * `buff.<name>.stack` — MAGNITUDE-shaped. Added at M5-C3c3c.
   *
   * A COUNT, and that is why it cannot share `BUFF_UP`'s shape. Recognising it
   * lets an expression containing it parse whole; it has no binding field, so
   * it resolves UNKNOWN_NUMBER and is never enumerated. An absent aura must not
   * become `0 stacks` — absence of an observation is not an observation of zero.
   */
  | { readonly kind: "BUFF_STACK"; readonly buffName: string }
  /**
   * `buff.<name>.react` — TRUTH-shaped. Added at M5-C3c3c.
   *
   * NOT `buff.<name>.up`, and the distinction is deliberate rather than
   * pedantic. SimulationCraft's `.react` gates on whether the actor has had time
   * to REACT to the aura, which `.up` does not; equating them would let a
   * reaction-delay model this project does not have collapse into a plain
   * presence check. It therefore gets its OWN atom key, so no world assignment
   * correlates the two.
   *
   * This node is `.react` in a TRUTH position only (M11-D1): a bare condition,
   * an operand of `&`, `|` or `!`. There SimulationCraft's zero-is-false
   * coercion makes it exactly `stack_react() != 0`, which enumerating a truth
   * models without inventing a count. Its one binding is an EXACT-ZERO stack
   * (`stack_react() <= current_stack`, so zero stacks is zero react); every
   * other state enumerates, as before. In a MAGNITUDE position the parser
   * produces `BUFF_REACT_STACK` instead.
   */
  | { readonly kind: "BUFF_REACT"; readonly buffName: string }
  /**
   * `buff.<name>.react` in a MAGNITUDE position — an operand of a comparison,
   * `*`, `+` or `-` (M11-D1).
   *
   * Pinned at 33622e9d1662ff0e451691edf85a6b49cc9d11d9, the `react` expression
   * evaluates `buff_t::stack_react()` (engine/buff/buff.cpp:485-511): the
   * current stack count minus every stack whose reaction time has not yet
   * elapsed (buff.cpp:2004-2016). It is a COUNT, `0 <= react <= stack`, and
   * `buff.killing_machine.react=2` compares that count with two.
   *
   * Until M11-D1 every `.react` was the truth node above, whose world value is
   * 0 or 1, so `react=2` came out FALSE in every world — a silent elimination
   * of a line the authority may well have selected. This node is a MAGNITUDE:
   * never enumerated, derived only from an EXACT stack binding, UNKNOWN
   * otherwise. Reaction delay is not modelled, so an exact stack of `s` proves
   * only that react is one of `0..s`.
   *
   * Its atom key is NOT the truth node's key and cannot collide with any
   * identifier, because `#` is not an identifier character (parse.ts,
   * spec-vocabulary.ts).
   */
  | { readonly kind: "BUFF_REACT_STACK"; readonly buffName: string }
  /**
   * `debuff.<name>.up` — TRUTH-shaped, and on the TARGET. Added at M5-C3c3c.
   *
   * A separate node from `BUFF_UP` because it addresses a different actor.
   * `buff.deathmark.up` is an aura on the player; `debuff.deathmark.up` is one
   * the player applied to the enemy. Folding them together would be exactly the
   * buff/debuff direction error this project keeps a rule about.
   *
   * No binding field: reconstructing enemy debuff presence needs source-aware
   * target aura state that this milestone does not wire in, so it enumerates.
   */
  | { readonly kind: "DEBUFF_UP"; readonly debuffName: string }
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
   * `variable.<name>` read as SimulationCraft stores it (M11-D3-C2): the
   * player's variable `current_value_` (engine/player/player.cpp:11936-11968).
   * MAGNITUDE-shaped and PLAYER_SCOPED — a stored value, the same whichever
   * enemy the reading action is aimed at.
   *
   * Produced for a name nothing else PARSES: `variable.single_target` keeps
   * its built-in truth-shaped node (in magnitude positions it becomes this
   * node) and a specialization-declared `variable.<name>` stays a SPEC_ATOM.
   * All three read the SAME variable, and this scan's assignment wins over any
   * initial value (`scanAssignedBinding`).
   * The name is lower-cased: SimulationCraft matches variable names
   * case-insensitively (`util::str_compare_ci`).
   */
  | { readonly kind: "VARIABLE_READ"; readonly name: string }
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
   * `refreshable` — TRUTH-shaped. The acting action's own DoT, on its own target.
   *
   * Added at M5-D1. `dot_t::create_expression` (dot.cpp:458-479) routes it to
   * `action->dot_refreshable( dot, new_duration )`, and the Rogue module NEVER
   * sets `dot_behavior`, so every Rogue DoT keeps `action_t`'s default
   * `DOT_REFRESH_DURATION` (action.cpp:419). That branch is
   * `dot->ticks_left() <= 1` (action.cpp:4627-4628) — NOT the 30 % pandemic rule
   * a reader who knows the game would expect. Getting that wrong would move the
   * threshold on Garrote from ~2 s to 5.4 s.
   *
   * Like `remains` and `pmultiplier` this is written BARE and addresses the
   * ACTING action, so it is resolved through the evaluation context rather than
   * by name. Unbound, it is enumerated across both worlds.
   */
  | { readonly kind: "DOT_REFRESHABLE" }
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
  /**
   * An identifier a SPECIALIZATION declared (M10-C). See
   * `spec-vocabulary.ts`.
   *
   * ONE generic node for every specialization-owned identifier, carrying the
   * two properties the evaluator needs — shape and scope — copied from the
   * declaration at parse time so a node cannot outlive or contradict the
   * vocabulary that produced it. The parser emits it ONLY when a vocabulary
   * was supplied and the identifier matched no built-in first; without a
   * vocabulary, the parser is byte-for-byte the pre-M10-C parser.
   *
   * The shared code learns nothing from this node about what the identifier
   * MEANS. Its value comes from the specialization's bindings or, when none is
   * supplied, from the same rules every built-in follows: an unbound truth is
   * enumerated, an unbound magnitude is UNKNOWN_NUMBER.
   */
  | {
      readonly kind: "SPEC_ATOM";
      readonly identifier: string;
      readonly shape: AtomShape;
      readonly scope: AtomScope;
      readonly selfAddressing: boolean;
    }
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
  /**
   * Binary `-`, at pinned SimulationCraft precedence 6 — the same level as `+`,
   * and left-associative, so `a-b-c` is `(a-b)-c`.
   *
   * Added at M5-D1 because the pinned `core_dot[1..4]` lines all end in
   * `target.time_to_die-remains>12`, and the whole-expression refusal means those
   * four entries cannot be evaluated at all until `-` parses. Note what that does
   * and does not buy: `target.time_to_die` is PREDICTIVE and stays unbindable, so
   * the subtraction always yields UNKNOWN. What changes is that the OTHER
   * conjuncts on those lines become reachable, and one of them can prove the line
   * FALSE.
   *
   * BINARY ONLY. Unary minus is precedence 8 upstream and is deliberately still
   * refused, so `remains<=-1` remains a parse error rather than a negative
   * literal nobody meant.
   */
  | { readonly kind: "SUBTRACT"; readonly left: ExpressionNode; readonly right: ExpressionNode }
  /**
   * `<?` and `>?`, SimulationCraft's numeric extremum operators (M11-D3-C1).
   *
   * THE DIRECTION IS THE TRAP. Pinned at
   * 33622e9d1662ff0e451691edf85a6b49cc9d11d9, the tokenizer reads `<?` as
   * `TOK_MAX` and `>?` as `TOK_MIN` (engine/sim/expressions.cpp:132-147), and
   * those build `std::max` and `std::min` (expressions.cpp:212-226, 413-416).
   * So `a<?b` is the LARGER operand and `a>?b` the SMALLER — `spell_targets>?3`
   * caps a count at three. The written token is kept verbatim; `extremumOf` is
   * the one place its meaning is read.
   *
   * Precedence 5: tighter than comparison (4), looser than `+`/`-` (6);
   * left-associative like every binary operator (expressions.cpp:1081-1110,
   * 1311-1324). Both operands are evaluated (`expr_binary_t::evaluate`,
   * expressions.cpp:384-387). Both are MAGNITUDE positions.
   */
  | {
      readonly kind: "EXTREMUM";
      readonly operator: ExtremumOperator;
      readonly left: ExpressionNode;
      readonly right: ExpressionNode;
    }
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

/**
 * WHOSE state an atom describes — the player, or the action's current target.
 *
 * ADDED AT M5-D1, AND IT EXISTS FOR EXACTLY ONE PROOF.
 *
 * SimulationCraft's `cycle_targets=1` re-runs `action_ready()` once per candidate
 * target (action.cpp:2463-2488), so a condition's value is generally different for
 * each of them. This project models no target list, so a cycling entry is
 * REFUSED — see `nested-selection.ts`.
 *
 * The one exception that can be proven rather than assumed: a conjunct built
 * entirely from PLAYER_SCOPED atoms has the SAME value for every candidate
 * target. If such a conjunct is FALSE, then `FALSE & anything` is FALSE for every
 * target, the cycle loop finds no ready target, and the entry cannot be selected
 * — without anyone enumerating a target.
 *
 * The classification is therefore load-bearing and conservative: anything that
 * reads the target, the target's auras, the acting action's DoT ON that target,
 * or how long that target has left is TARGET_SCOPED. When in doubt, TARGET_SCOPED
 * is the safe answer, because it only ever withholds an elimination.
 */
export type AtomScope = "PLAYER_SCOPED" | "TARGET_SCOPED";

export const ATOM_SCOPES = ["PLAYER_SCOPED", "TARGET_SCOPED"] as const satisfies readonly AtomScope[];

/** One atom occurrence, identified by key and classified by shape and scope. */
export interface AtomDescriptor {
  readonly key: string;
  readonly shape: AtomShape;
  readonly scope: AtomScope;
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

/**
 * The atom key of `buff.<name>.react` read as a COUNT (M11-D1).
 *
 * Named after the pinned function it denotes, `buff_t::stack_react()`. The
 * `#` makes it unrepresentable as an identifier, so no built-in and no
 * specialization vocabulary entry can ever produce the same key.
 */
export function reactStackAtomKey(buffName: string): string {
  return `buff.${buffName}.react#stack_react`;
}

/**
 * An operand as a MAGNITUDE position reads it (M11-D1).
 *
 * The parser applies this to both operands of a comparison, `*`, `+` and `-`.
 * Every node is returned unchanged except `.react`, the one truth-shaped
 * built-in whose SimulationCraft value is not 0/1: there it is a stack count.
 */
export function asMagnitudeOperand(node: ExpressionNode): ExpressionNode {
  if (node.kind === "BUFF_REACT") return { kind: "BUFF_REACT_STACK", buffName: node.buffName };
  // The built-in `variable.single_target` is a TRUTH-shaped read; where a
  // magnitude is read it is the stored number, so it becomes the generic read
  // of the same variable (M11-D3-C2).
  if (node.kind === "VARIABLE_SINGLE_TARGET") return { kind: "VARIABLE_READ", name: "single_target" };
  return node;
}

/** The atom a node denotes, or `null` when the node is not an atom. */
export function atomOf(node: ExpressionNode): AtomDescriptor | null {
  switch (node.kind) {
    case "COMBO_POINTS":
      return { key: "combo_points", shape: "NUMERIC", scope: "PLAYER_SCOPED" };
    case "COMBO_POINTS_DEFICIT":
      return { key: "combo_points.deficit", shape: "NUMERIC", scope: "PLAYER_SCOPED" };
    case "ENERGY_PCT":
      return { key: "energy.pct", shape: "NUMERIC", scope: "PLAYER_SCOPED" };
    case "FIGHT_REMAINS":
      // The FIGHT, not a target. Unchanged by which enemy an action cycles to.
      return { key: "fight_remains", shape: "NUMERIC", scope: "PLAYER_SCOPED" };
    case "BUFF_UP":
      return { key: `buff.${node.buffName}.up`, shape: "BOOLEAN", scope: "PLAYER_SCOPED" };
    case "BUFF_REMAINS":
      return { key: `buff.${node.buffName}.remains`, shape: "NUMERIC", scope: "PLAYER_SCOPED" };
    case "BUFF_STACK":
      return { key: `buff.${node.buffName}.stack`, shape: "NUMERIC", scope: "PLAYER_SCOPED" };
    case "BUFF_REACT":
      // A DIFFERENT key from `buff.<name>.up`. Two atoms, never correlated.
      return { key: `buff.${node.buffName}.react`, shape: "BOOLEAN", scope: "PLAYER_SCOPED" };
    case "BUFF_REACT_STACK":
      // The count, not the truth: a different fact, so a different key. The
      // two are left uncorrelated when both occur in one expression, which is
      // sound — it only ever admits more worlds than are real.
      return { key: reactStackAtomKey(node.buffName), shape: "NUMERIC", scope: "PLAYER_SCOPED" };
    case "DEBUFF_UP":
      // `debuff.` and `buff.` are different namespaces addressing different
      // actors, so their keys can never collide. TARGET_SCOPED: it is an aura on
      // whichever enemy the action is currently pointed at.
      return { key: `debuff.${node.debuffName}.up`, shape: "BOOLEAN", scope: "TARGET_SCOPED" };
    case "STEALTHED_ROGUE":
      return { key: "stealthed.rogue", shape: "BOOLEAN", scope: "PLAYER_SCOPED" };
    case "TALENT":
      // Keyed by name, so every occurrence of `talent.blindside` correlates and
      // `talent.improved_ambush` stays independent of it. The key namespace is
      // `talent.` and cannot collide with a buff key — which matters because the
      // Blindside TALENT (328085) and the Blindside PROC BUFF (121153) are
      // different facts and must never share a world assignment.
      //
      // A static build fact, so it is the same for every candidate target. That
      // is what makes `!talent.crimson_tempest` usable as a target-independent
      // elimination.
      return { key: `talent.${node.talentName}`, shape: "BOOLEAN", scope: "PLAYER_SCOPED" };
    case "VARIABLE_SINGLE_TARGET":
      // A count of the whole enemy list, not a property of one enemy.
      return { key: "variable.single_target", shape: "BOOLEAN", scope: "PLAYER_SCOPED" };
    case "VARIABLE_READ":
      // A stored value: whichever enemy the reading action targets, it reads
      // the same number (M11-D3-C2).
      return { key: `variable.${node.name}`, shape: "NUMERIC", scope: "PLAYER_SCOPED" };
    case "DOT_PMULTIPLIER":
      return { key: "pmultiplier", shape: "NUMERIC", scope: "TARGET_SCOPED" };
    case "DOT_REMAINS":
      return { key: "remains", shape: "NUMERIC", scope: "TARGET_SCOPED" };
    case "DOT_REFRESHABLE":
      return { key: "refreshable", shape: "BOOLEAN", scope: "TARGET_SCOPED" };
    case "DOT_TICKING":
      // Keyed by name, so every occurrence of `dot.garrote.ticking` correlates
      // and `dot.rupture.ticking` stays independent of it.
      return { key: `dot.${node.dotName}.ticking`, shape: "BOOLEAN", scope: "TARGET_SCOPED" };
    case "COOLDOWN_REMAINS":
      return { key: `cooldown.${node.cooldownName}.remains`, shape: "NUMERIC", scope: "PLAYER_SCOPED" };
    case "TARGET_TIME_TO_DIE":
      return { key: "target.time_to_die", shape: "NUMERIC", scope: "TARGET_SCOPED" };
    case "SPEC_ATOM":
      // Keyed by the identifier verbatim, so every occurrence of one declared
      // atom correlates and two different declared atoms never share a world
      // assignment. A declared identifier can never equal a built-in key: the
      // vocabulary refuses one that would.
      return { key: node.identifier, shape: node.shape, scope: node.scope };
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
      case "SUBTRACT":
      // Both operands' atoms, so an extremum's scope is the join of its
      // operands' scopes: target-scoped if either is (M11-D3-C1).
      case "EXTREMUM":
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

/**
 * Whether every atom in an expression describes the PLAYER rather than a target.
 *
 * The predicate behind M5-D1's target-independent elimination. An expression that
 * satisfies it has the same value for every candidate target, so a FALSE verdict
 * on it holds for all of them.
 *
 * An expression with NO atoms at all — a pure literal comparison — is
 * player-scoped by this definition, and correctly so: `1>2` is FALSE whoever the
 * action is pointed at.
 */
export function isPlayerScoped(node: ExpressionNode): boolean {
  return collectAtoms(node).every((atom) => atom.scope === "PLAYER_SCOPED");
}

/**
 * The top-level AND-spine of an expression, as its individual conjuncts.
 *
 * `a & b & c` yields `[a, b, c]`. Anything that is not an AND at the top yields
 * the whole node as a single conjunct, which is the honest reading: there is one
 * thing to prove.
 *
 * ONLY the AND spine, and that matters. Descending into an OR would produce
 * fragments whose falsehood proves nothing about the whole — `FALSE | x` is `x`,
 * not FALSE. Every conjunct returned here, by contrast, is sufficient on its own:
 * `FALSE & anything` is FALSE.
 */
export function topLevelConjuncts(node: ExpressionNode): readonly ExpressionNode[] {
  if (node.kind !== "AND") return [node];
  return [...topLevelConjuncts(node.left), ...topLevelConjuncts(node.right)];
}
