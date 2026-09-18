/**
 * Evaluation of the supported SimulationCraft expression subset.
 *
 * TWO IDEAS, AND THEY MUST NOT BE CONFUSED WITH EACH OTHER.
 *
 * 1. CORRELATED UNRESOLVED BOOLEAN ATOMS.
 *
 * `buff.darkest_night.up` is understood syntax whose value we do not know. The
 * naive treatment — "unknown, so the answer is unknown" — throws away real
 * information, because the same unknown appears in BOTH branches of the pinned
 * spend gate and the two occurrences are the SAME fact:
 *
 *     !buff.darkest_night.up&combo_points>=5 | buff.darkest_night.up&combo_points.deficit=0
 *
 * At combo_points = 3 of a maximum 7:
 *
 *     DN = false  ->  (!false & 3>=5) | (false & 4=0)  ->  (true & false) | false  ->  FALSE
 *     DN = true   ->  (!true  & 3>=5) | (true  & 4=0)  ->  false | (true & false)  ->  FALSE
 *
 * Both resolutions agree, so the condition is PROVABLY FALSE even though the
 * atom is unresolved. Treating the two occurrences as independent unknowns
 * loses that proof entirely.
 *
 * The technique is exhaustive enumeration over the assignments of the
 * unresolved BOOLEAN atoms — a truth table, nothing more. With `k` unresolved
 * boolean atoms there are `2^k` worlds; each world binds every occurrence of an
 * atom to the SAME value, which is exactly the correlation contract.
 *
 * This is not a theorem prover and must not become one. `k` is capped, and past
 * the cap the evaluator declines rather than growing.
 *
 * 2. UNKNOWN NUMBERS, WHICH ARE NEVER ENUMERATED.
 *
 * `fight_remains` and `buff.<name>.remains` are magnitudes. Enumerating a
 * magnitude over {0, 1} would let `buff.envenom.remains<=1` come out decidable
 * from two invented durations — a confident verdict resting on numbers nobody
 * observed. So an unavailable magnitude becomes UNKNOWN_NUMBER, it contributes
 * NOTHING to the world count, and any comparison touching it yields
 * UNKNOWN_STATE.
 *
 * Inside each world the truth domain is therefore three-valued:
 *
 *     TRUE   FALSE   UNKNOWN_STATE
 *
 * with Kleene semantics, symmetric in both operand orders:
 *
 *     TRUE  | X = TRUE        FALSE & X = FALSE
 *     FALSE | X = X           TRUE  & X = X
 *     !UNKNOWN_STATE = UNKNOWN_STATE
 *
 * `TRUE | UNKNOWN_STATE = TRUE` is what lets `energy.pct>70|fight_remains<15`
 * resolve TRUE at 100% energy without anyone pretending to know how long the
 * fight had left.
 *
 * WHAT IS DELIBERATELY OUTSIDE THIS DOMAIN: UNSUPPORTED SYNTAX.
 *
 * An unsupported operator or identifier fails the WHOLE expression at parse
 * time and never produces an AST, so it can never arrive here as
 * UNKNOWN_STATE. That separation is the difference between "we understand the
 * question and lack the state" and "we did not understand the question", and
 * the two must never be reported as each other.
 *
 * `fight_remains` HAS NO BINDING FIELD AT ALL, and that is deliberate. It is
 * PREDICTIVE: the player did not know it at the moment of play. M4 exposes
 * `observedFightEndDelta`, which is the RETROSPECTIVE historical outcome and is
 * explicitly not `fight_remains`. Leaving out the field means the hindsight
 * shortcut cannot be taken by a future caller without editing this type.
 *
 * 3. SELF-ADDRESSING ATOMS NEED TO KNOW WHOSE THEY ARE (M5-D1).
 *
 * `remains`, `refreshable` and `pmultiplier` are written bare and mean "the
 * ACTING action's own DoT". Their bindings are therefore KEYED BY ACTION TOKEN
 * and read through an `ExpressionContext`. A scalar would answer Rupture's
 * question with Garrote's number; see `ExpressionContext`.
 *
 * SimulationCraft semantics: expressions are numeric, zero is false, logical
 * operators and comparisons yield 1 or 0.
 */

import { collectAtoms, type AtomShape, type ComparisonOperator, type ExpressionNode } from "./ast.js";
import { specAtomValueFor, type SpecAtomBindings } from "./spec-vocabulary.js";

/**
 * WHICH ACTION a bare, self-addressing atom belongs to.
 *
 * ADDED AT M5-D1 TO CLOSE A LATENT WRONG-ANSWER.
 *
 * `remains`, `refreshable` and `pmultiplier` are written bare in the pinned
 * `core_dot` lines and mean "the ACTING action's own DoT". Until M5-D1 the
 * bindings carried ONE scalar `dotRemainsSeconds`, filled from Garrote, and the
 * evaluator returned it for every entry — so the moment `core_dot[3]` (Rupture)
 * became evaluable it would have read Garrote's remaining time and answered a
 * question about the wrong bleed. Nothing would have looked wrong: both are
 * plausible numbers of seconds.
 *
 * The fix is two halves that must travel together. The bindings became KEYED by
 * action token, and this context says which key to read. A caller that supplies
 * no context gets UNKNOWN for every self-addressing atom — never another
 * action's value, and never a default.
 */
export interface ExpressionContext {
  /**
   * The SimulationCraft action token of the entry being evaluated.
   *
   * `null` means the caller is evaluating an expression that belongs to no
   * action, which is a real situation — a `call_action_list` gate, or a unit test
   * about arithmetic. Every self-addressing atom then resolves UNKNOWN.
   */
  readonly currentActionToken: string | null;
}

/** No acting action. Every self-addressing atom resolves UNKNOWN. */
export const NO_ACTING_ACTION: ExpressionContext = { currentActionToken: null };

/** The evaluation context for one named action's own entry. */
export function actingAction(actionToken: string): ExpressionContext {
  return { currentActionToken: actionToken };
}

/**
 * The most unresolved BOOLEAN atoms this evaluator will enumerate.
 *
 * Four atoms is sixteen worlds. The cap exists so an authority condition nobody
 * anticipated cannot turn one decision point into an exponential walk; past it
 * the evaluator reports insufficient support instead.
 *
 * UNKNOWN_NUMBER atoms are not enumerated and do not count toward this cap.
 */
export const MAX_UNRESOLVED_ATOMS = 4;

/** Why a magnitude could not be supplied. Each is a different remedy. */
export type UnknownNumberReason =
  /**
   * The value depends on information the player did not possess at the moment
   * of play. Not a gap in our evidence — a gap in what was knowable.
   */
  | "PREDICTIVE_NOT_PLAYER_KNOWABLE"
  /** Understood syntax for state this build reconstructs no model of. */
  | "STATE_NOT_MODELLED"
  /** A model exists, and the evidence for this decision point fell short. */
  | "STATE_NOT_ESTABLISHED";

export const UNKNOWN_NUMBER_REASONS = [
  "PREDICTIVE_NOT_PLAYER_KNOWABLE",
  "STATE_NOT_MODELLED",
  "STATE_NOT_ESTABLISHED",
] as const satisfies readonly UnknownNumberReason[];

/**
 * One magnitude the caller may or may not be able to supply.
 *
 * A discriminated union rather than `number | null`, so "we do not know the
 * energy" is a statement a caller has to write down rather than an omission
 * that reads as zero.
 *
 * THREE STATES, AND THE MIDDLE ONE EARNS ITS PLACE.
 *
 * `BOUNDED_NUMBER` carries a proven LOWER bound and nothing else. It exists
 * because M5-C3c1's cooldown derivation genuinely produces one: SimulationCraft
 * starts a cooldown with a non-negative, SAMPLED lag delay
 * (action.cpp:2350-2360), so an observed cast proves `remains >= base - elapsed`
 * and does not prove equality.
 *
 * Collapsing that into `KNOWN_NUMBER` would state a value nobody established.
 * Collapsing it into `UNKNOWN_NUMBER` would throw away a bound that decides real
 * comparisons — `remains <= 2` is definitively FALSE once at least 57 seconds
 * remain, whatever the exact figure.
 *
 * THERE IS NO UPPER BOUND FIELD, deliberately. Nothing in the pinned model
 * supplies one — the lag delay is drawn from an unbounded gaussian — and an
 * unused field would invite inventing it. That also stops a reader mistaking
 * this for a two-sided interval.
 */
export type NumericBinding =
  | { readonly state: "KNOWN_NUMBER"; readonly value: number }
  | {
      readonly state: "BOUNDED_NUMBER";
      /** A PROVEN lower bound. The true value is this or larger, never smaller. */
      readonly atLeast: number;
      /** Why an exact value was unavailable. */
      readonly reason: UnknownNumberReason;
    }
  | { readonly state: "UNKNOWN_NUMBER"; readonly reason: UnknownNumberReason };

export function knownNumber(value: number): NumericBinding {
  return { state: "KNOWN_NUMBER", value };
}

/**
 * A magnitude proven to be at least `atLeast`.
 *
 * The caller must have PROVED the bound. A guess dressed as a bound is worse
 * than an unknown, because comparisons will act on it.
 */
export function boundedBelowNumber(atLeast: number, reason: UnknownNumberReason): NumericBinding {
  return { state: "BOUNDED_NUMBER", atLeast, reason };
}

export function unknownNumber(reason: UnknownNumberReason): NumericBinding {
  return { state: "UNKNOWN_NUMBER", reason };
}

/** The three-valued truth domain inside one world. */
export type TruthValue = "TRUE" | "FALSE" | "UNKNOWN_STATE";

export const TRUTH_VALUES = ["TRUE", "FALSE", "UNKNOWN_STATE"] as const satisfies readonly TruthValue[];

/**
 * Exact numeric state, plus any buff values that are actually known.
 *
 * EVERY magnitude is a REQUIRED `NumericBinding`. Required, so a caller cannot
 * reach UNKNOWN by forgetting; a binding rather than a number, so a caller that
 * genuinely has no observation can say exactly that.
 *
 * The combo-point fields were plain numbers until M5-C3b, on the reasoning that
 * a caller unable to establish one should fail closed BEFORE evaluating. The
 * real post-Vanish decision point broke that: Warcraft Logs reports Energy on
 * the cast and no combo-point resource at all, while the conditions the
 * traversal actually reaches never mention combo points. Failing closed up front
 * would have refused a question the evidence can answer, and the only other
 * option a plain number allows is inventing a magnitude — which would have
 * entered control flow before anything could discard it.
 *
 * So the shape now matches what the engine already does everywhere else: an
 * unavailable magnitude resolves to UNKNOWN_NUMBER, is never enumerated, and is
 * carried through Kleene evaluation exactly like `pmultiplier` — so
 * `FALSE & combo_points>=5` still resolves FALSE, and an expression whose answer
 * does not depend on the unknown still gets one.
 *
 * There is no `fightRemains` and no `buffRemains`. See the module header.
 */
export interface AtomBindings {
  /** `combo_points`. Must be stated, even when it is unknown. */
  readonly comboPoints: NumericBinding;
  /** `combo_points.deficit`. Must be stated, even when it is unknown. */
  readonly comboPointsDeficit: NumericBinding;
  /** `energy.pct`, 0-100. Must be stated, even when it is unknown. */
  readonly energyPct: NumericBinding;
  /** Buffs whose state IS established. Everything else becomes an unresolved atom. */
  readonly knownBuffs: readonly { readonly name: string; readonly up: boolean }[];
  /**
   * `buff.<name>.stack` values that are EXACTLY established (M11-A4).
   *
   * A BINDING SEAM, NOT A STACK MODEL. This project reconstructs no stack
   * count: M4 deliberately has no `stacksAt`, because a plain application
   * carries no count, a refresh's effect on the count is unpinned and decay
   * is unobserved. What a specialization CAN prove exactly is narrower, and
   * this field carries only that. The first consumer binds ZERO, and only in
   * two situations — the aura is proven INACTIVE at the decision by the M4
   * presence machinery (an observed removal under coverage), or the pinned
   * resolved build proves the talent that produces the aura absent, so the
   * aura is impossible. Silence, elapsed time and expected play prove nothing
   * and bind nothing.
   *
   * Same shape and same rule as `knownCooldownRemainsSeconds`: keyed by
   * name, absent is UNKNOWN_NUMBER (never zero), and the comparison semantics
   * are the existing ones — `buff.x.stack=2` against a bound 0 is FALSE by
   * `compareWithBounds`, exactly as any other exact magnitude.
   */
  readonly knownBuffStacks?: readonly { readonly name: string; readonly stack: number }[];
  /**
   * `stealthed.rogue`, and ONLY when it is positively proven.
   *
   * THE TYPE IS `true`, NOT `boolean`, AND THAT IS THE POINT.
   *
   * Stealth is provable in one direction only. A contributor observed ACTIVE
   * proves TRUE; nothing proves FALSE, because "not stealthed" would require
   * every contributor proven inactive, and silence across four auras establishes
   * nothing — a pre-pull application, an unverified capability and a failed page
   * all look identical.
   *
   * A `boolean` here would let a caller write `{ stealthedRogue: false }` and
   * have it treated as a KNOWN FALSE, which is a claim no evidence in this
   * project can support. Narrowing the type to the single literal makes that
   * unspellable rather than merely discouraged — the same device
   * `ActionabilityEvidence` uses to keep a negative actionability claim out of
   * the vocabulary.
   *
   * Omission is the ONLY other option, and it is safe: an unbound BOOLEAN atom is
   * enumerated across correlated worlds, so a caller who omits it gets UNKNOWN or
   * an answer that holds under both assignments. That is why this is optional
   * where a magnitude is required — a forgotten magnitude would silently become a
   * value, a forgotten truth cannot.
   */
  readonly stealthedRogue?: true;
  /**
   * Talents whose selection IS established. Same shape and same rule as
   * `knownBuffs`: anything absent becomes an unresolved atom, never `false`.
   *
   * `taken` is the static build fact behind SimulationCraft's `talent.x->ok()`.
   * It is NOT a proc buff — the Blindside talent and the Blindside proc are
   * different facts with different spell ids and different atom keys.
   */
  readonly knownTalents?: readonly { readonly name: string; readonly taken: boolean }[];
  /**
   * DoTs whose ticking state IS established, keyed by SimulationCraft name.
   *
   * Same shape and same rule as `knownBuffs`: anything absent becomes an
   * unresolved BOOLEAN atom and is enumerated, never `false`.
   */
  readonly knownDotsTicking?: readonly { readonly name: string; readonly ticking: boolean }[];
  /**
   * Cooldowns whose REMAINING time is established, in SECONDS, keyed by name.
   *
   * A LIST rather than a single `cooldownRemains` field, and that is
   * deliberate: one scalar would bind whichever cooldown the expression happened
   * to name, so a derivation about Kingsbane would silently answer a question
   * about Deathmark. Keying by name makes the wrong-ability answer
   * unrepresentable.
   *
   * An absent cooldown is UNKNOWN_NUMBER, never 0 — zero reads as "ready now",
   * which is the most dangerous possible default for a `remains<=` comparison.
   */
  readonly knownCooldownRemainsSeconds?: readonly {
    readonly name: string;
    /**
     * SECONDS, as a full `NumericBinding`.
     *
     * A binding rather than a bare number because a cooldown derived from an
     * observed cast is usually BOUNDED, not exact — SimulationCraft starts a
     * cooldown with a non-negative sampled lag delay. A bare number here would
     * have forced that bound to be flattened into a value nobody proved.
     */
    readonly remainsSeconds: NumericBinding;
  }[];
  /**
   * `remains` — the ACTING action's own DoT remaining duration, IN SECONDS,
   * KEYED BY ACTION TOKEN.
   *
   * A LIST RATHER THAN A SCALAR, and that is the M5-D1 correctness fix. One
   * scalar meant `remains` answered with whatever the caller had derived,
   * regardless of which entry was asking. Keying it makes the wrong-DoT answer
   * unrepresentable: Rupture's entry looks up `"rupture"`, and if nobody bound
   * that key the answer is UNKNOWN. It can no longer be Garrote's.
   *
   * UNITS ARE LOAD-BEARING. SimulationCraft expression literals are seconds:
   * `remains<=14` means fourteen seconds. Warcraft Logs timestamps and DBC
   * durations are MILLISECONDS. A caller that passed 5746 here instead of 5.746
   * would compare milliseconds against a seconds literal and silently answer the
   * wrong question — so the field name says the unit and the adapter that fills
   * it converts explicitly.
   *
   * OPTIONAL, unlike the scalar it replaces, and that is now the safe shape. An
   * absent key resolves UNKNOWN_NUMBER and is never enumerated, so a caller that
   * forgets one gets a refusal rather than a value — the same rule
   * `knownCooldownRemainsSeconds` follows.
   *
   * There is deliberately NO `pmultiplier` field. See `evaluateInWorld`.
   */
  readonly dotRemainsSecondsByAction?: readonly {
    /** The SimulationCraft action token whose OWN DoT this describes. */
    readonly actionToken: string;
    readonly remainsSeconds: NumericBinding;
  }[];
  /**
   * `refreshable` — the ACTING action's own DoT, KEYED BY ACTION TOKEN.
   *
   * Same keying rule and same reason. TRUTH-shaped, so an absent key is
   * ENUMERATED rather than resolved — which is safe, because a verdict then
   * survives only if it holds under both assignments.
   *
   * Only a POSITIVELY PROVEN value belongs here. See
   * `src/specs/rogue/assassination/dot-refreshable.ts` for the two directions
   * that can be proven and the middle that cannot.
   */
  readonly dotRefreshableByAction?: readonly {
    readonly actionToken: string;
    readonly refreshable: boolean;
  }[];
  /**
   * A specialization's declared atoms and their values (M10-C).
   *
   * The vocabulary here is the one the parser was handed for the same
   * expression — `evaluateCondition` reads it from this field to parse, so
   * the two cannot disagree. A declared TRUTH with no binding is enumerated; a
   * declared MAGNITUDE with no binding is UNKNOWN_NUMBER
   * (`STATE_NOT_ESTABLISHED`). A self-addressing atom is read only through a
   * binding keyed by the acting action's token. Absent entirely, no
   * `SPEC_ATOM` node can exist and nothing here is consulted.
   */
  readonly specAtoms?: SpecAtomBindings;
}

export type TraceAtomBinding = "KNOWN" | "BOUNDED" | "UNRESOLVED_BOOLEAN" | "UNKNOWN_NUMBER";

/** JSON-safe: arrays and records only, no Map, no undefined. */
export interface TraceAtom {
  readonly key: string;
  readonly shape: AtomShape;
  readonly binding: TraceAtomBinding;
  /**
   * The exact value when KNOWN; `null` otherwise — INCLUDING when BOUNDED.
   *
   * A bound is reported in `atLeast`, never here. Putting it in `value` would
   * let a reader treat a proven minimum as the magnitude itself, which is the
   * exact overstatement this binding state exists to prevent.
   */
  readonly value: number | null;
  /** The proven lower bound when BOUNDED; `null` otherwise. */
  readonly atLeast: number | null;
  /** Present for BOUNDED and UNKNOWN_NUMBER, so a finding can say which gap this was. */
  readonly unknownNumberReason: UnknownNumberReason | null;
}

export interface TraceWorld {
  readonly assignment: readonly { readonly atom: string; readonly up: boolean }[];
  /**
   * The world's outcome, as ONE canonical field.
   *
   * Three-valued rather than boolean: a world can genuinely be undecided when a
   * magnitude is unknown. There is deliberately no parallel boolean field,
   * because two fields describing one outcome can disagree.
   */
  readonly result: TruthValue;
}

export type TraceAggregate = "TRUE" | "FALSE" | "UNRESOLVED";

export type TraceAggregateRule =
  /** Nothing was unresolved: one world, decided outright. */
  | "NO_UNRESOLVED_ATOMS"
  /** Boolean atoms were enumerated and every world agreed. */
  | "INVARIANT_ACROSS_WORLDS"
  /** Boolean worlds reached different definite answers. */
  | "WORLDS_DISAGREE"
  /** Every world was itself undecided, because a magnitude was unknown. */
  | "UNKNOWN_STATE_IN_EVERY_WORLD"
  /** Some worlds decided and at least one was undecided. */
  | "WORLDS_MIXED_WITH_UNKNOWN_STATE";

export interface ExpressionTrace {
  readonly expressionRaw: string;
  readonly atoms: readonly TraceAtom[];
  readonly worlds: readonly TraceWorld[];
  readonly aggregate: TraceAggregate;
  readonly aggregateRule: TraceAggregateRule;
}

export type ExpressionEvaluation =
  | { readonly outcome: "RESOLVED"; readonly value: boolean; readonly trace: ExpressionTrace }
  | { readonly outcome: "UNRESOLVED"; readonly trace: ExpressionTrace }
  | {
      readonly outcome: "UNSUPPORTED";
      readonly reason: "TOO_MANY_UNRESOLVED_ATOMS";
      readonly unresolvedAtomCount: number;
      readonly expressionRaw: string;
    };

// --------------------------------------------------------------------------
// The value domain of one world
// --------------------------------------------------------------------------

/**
 * A magnitude that is not known.
 *
 * A unique symbol rather than `null` or `NaN`: neither of those can be confused
 * with a resource amount, but both are things arithmetic silently accepts. A
 * symbol makes every place that forgets to handle the unknown case a type
 * error.
 */
const UNKNOWN: unique symbol = Symbol("UNKNOWN_NUMBER");

/**
 * A magnitude known only to be at least `atLeast`, inside one world.
 *
 * Kept structurally distinct from `number` so every operator has to decide what
 * to do with it. Arithmetic refuses; comparisons decide only when the bound
 * settles them. See `compareWithBounds`.
 */
interface BoundedValue {
  readonly atLeastValue: number;
}

type WorldValue = number | BoundedValue | typeof UNKNOWN;

function isUnknownValue(value: WorldValue): value is typeof UNKNOWN {
  return value === UNKNOWN;
}

function isBoundedValue(value: WorldValue): value is BoundedValue {
  return typeof value === "object" && value !== null && "atLeastValue" in value;
}

function isExactValue(value: WorldValue): value is number {
  return typeof value === "number";
}

/**
 * A binding as this world sees it.
 *
 * One function so no case forgets the BOUNDED state and silently drops a proven
 * bound to UNKNOWN — or, worse, promotes it to an exact value.
 */
function worldValueOf(binding: NumericBinding): WorldValue {
  if (binding.state === "KNOWN_NUMBER") return binding.value;
  if (binding.state === "BOUNDED_NUMBER") return { atLeastValue: binding.atLeast };
  return UNKNOWN;
}

/** SimulationCraft has no boolean type: zero is false, everything else is true. */
function truthOf(value: WorldValue): TruthValue {
  if (isUnknownValue(value)) return "UNKNOWN_STATE";
  if (isBoundedValue(value)) {
    // A bound could be used as a truth — "at least 57, so non-zero, so TRUE" —
    // and deliberately is not. SimulationCraft's zero-is-false coercion applies
    // to a VALUE, and a bound is not one. No pinned expression uses a magnitude
    // as a bare truth, so nothing is lost by refusing.
    return "UNKNOWN_STATE";
  }
  return value !== 0 ? "TRUE" : "FALSE";
}

/** Back into the numeric domain, so logical results can nest as operands. */
function valueOf(truth: TruthValue): WorldValue {
  if (truth === "TRUE") return 1;
  if (truth === "FALSE") return 0;
  return UNKNOWN;
}

/**
 * Kleene AND. Symmetric by construction, so both operand orders agree.
 *
 *     FALSE & anything      = FALSE   (even UNKNOWN_STATE)
 *     TRUE  & UNKNOWN_STATE = UNKNOWN_STATE
 */
function andTruth(left: TruthValue, right: TruthValue): TruthValue {
  if (left === "FALSE" || right === "FALSE") return "FALSE";
  if (left === "TRUE" && right === "TRUE") return "TRUE";
  return "UNKNOWN_STATE";
}

/**
 * Kleene OR. Symmetric by construction.
 *
 *     TRUE  | anything      = TRUE    (even UNKNOWN_STATE)
 *     FALSE | UNKNOWN_STATE = UNKNOWN_STATE
 */
function orTruth(left: TruthValue, right: TruthValue): TruthValue {
  if (left === "TRUE" || right === "TRUE") return "TRUE";
  if (left === "FALSE" && right === "FALSE") return "FALSE";
  return "UNKNOWN_STATE";
}

function notTruth(operand: TruthValue): TruthValue {
  if (operand === "TRUE") return "FALSE";
  if (operand === "FALSE") return "TRUE";
  return "UNKNOWN_STATE";
}

/**
 * Comparison where either side may be a proven LOWER bound.
 *
 * Only the deductions that follow from a lower bound alone are made. With
 * `x >= L` and a constant `C`:
 *
 *     x <= C   FALSE when L > C        (x is at least L, and L already exceeds C)
 *     x <  C   FALSE when L >= C
 *     x >  C   TRUE  when L > C
 *     x >= C   TRUE  when L >= C
 *     x =  C   FALSE when L > C
 *
 * Everything else is UNKNOWN, including every case where the bound falls on the
 * undecided side of the threshold. `x <= C` with `L <= C` is NOT true — the real
 * value could be anywhere above `L`.
 *
 * Two bounded operands decide almost nothing and are not special-cased beyond
 * the one sound rule: `left >= L` and `right >= R` gives `left > right` only if
 * we knew an upper bound for `right`, which we never do. So they yield UNKNOWN.
 *
 * This is NOT an interval algebra and must not grow into one. Each rule above
 * exists because a pinned expression needs it.
 */
function compareWithBounds(operator: ComparisonOperator, left: WorldValue, right: WorldValue): WorldValue {
  if (isUnknownValue(left) || isUnknownValue(right)) return UNKNOWN;

  if (isExactValue(left) && isExactValue(right)) {
    return compare(operator, left, right);
  }

  // Only a bounded LEFT against an exact RIGHT is decidable, which is the shape
  // every pinned `cooldown.x.remains <= C` line takes.
  if (isBoundedValue(left) && isExactValue(right)) {
    const lower = left.atLeastValue;
    switch (operator) {
      case "<=":
        return lower > right ? 0 : UNKNOWN;
      case "<":
        return lower >= right ? 0 : UNKNOWN;
      case ">":
        return lower > right ? 1 : UNKNOWN;
      case ">=":
        return lower >= right ? 1 : UNKNOWN;
      case "=":
        return lower > right ? 0 : UNKNOWN;
    }
  }

  // An exact LEFT against a bounded RIGHT is the mirror, and is included because
  // the operand order in an authority line is not ours to choose.
  if (isExactValue(left) && isBoundedValue(right)) {
    const lower = right.atLeastValue;
    switch (operator) {
      case ">=":
        return left < lower ? 0 : UNKNOWN;
      case ">":
        return left <= lower ? 0 : UNKNOWN;
      case "<":
        return left < lower ? 1 : UNKNOWN;
      case "<=":
        return left <= lower ? 1 : UNKNOWN;
      case "=":
        return left < lower ? 0 : UNKNOWN;
    }
  }

  return UNKNOWN;
}

function compare(operator: ComparisonOperator, left: number, right: number): number {
  switch (operator) {
    case ">=":
      return left >= right ? 1 : 0;
    case ">":
      return left > right ? 1 : 0;
    case "=":
      return left === right ? 1 : 0;
    case "<":
      return left < right ? 1 : 0;
    case "<=":
      return left <= right ? 1 : 0;
  }
}

/**
 * Evaluates the AST inside ONE world.
 *
 * Buff atoms resolve to exact numbers here — from the bindings or from this
 * world's assignment — because they are enumerated. Magnitudes may be UNKNOWN,
 * and that unknown propagates through comparisons into the three-valued logic
 * rather than short-circuiting into a number.
 */
/**
 * The acting action's own DoT remainder, or UNKNOWN.
 *
 * ONE function, so no site can forget the context and read some other action's
 * binding. A null context and an unbound token are the SAME answer here, because
 * they are the same epistemic situation: nobody established this action's DoT.
 */
function actingDotRemains(bindings: AtomBindings, context: ExpressionContext): NumericBinding {
  const token = context.currentActionToken;
  if (token === null) return unknownNumber("STATE_NOT_ESTABLISHED");
  const entry = (bindings.dotRemainsSecondsByAction ?? []).find((item) => item.actionToken === token);
  return entry?.remainsSeconds ?? unknownNumber("STATE_NOT_ESTABLISHED");
}

/** The acting action's proven `refreshable`, or `undefined` when unestablished. */
function actingDotRefreshable(bindings: AtomBindings, context: ExpressionContext): boolean | undefined {
  const token = context.currentActionToken;
  if (token === null) return undefined;
  return (bindings.dotRefreshableByAction ?? []).find((item) => item.actionToken === token)?.refreshable;
}

function evaluateInWorld(
  node: ExpressionNode,
  bindings: AtomBindings,
  world: ReadonlyMap<string, boolean>,
  context: ExpressionContext,
): WorldValue {
  const recurse = (child: ExpressionNode): WorldValue => evaluateInWorld(child, bindings, world, context);
  switch (node.kind) {
    case "NUMBER":
      return node.value;
    case "COMBO_POINTS":
      return worldValueOf(bindings.comboPoints);
    case "COMBO_POINTS_DEFICIT":
      return worldValueOf(bindings.comboPointsDeficit);
    case "ENERGY_PCT":
      return worldValueOf(bindings.energyPct);
    case "FIGHT_REMAINS":
      // No binding field exists, and none may be added without deciding that
      // hindsight is admissible. See the module header.
      return UNKNOWN;
    case "TARGET_TIME_TO_DIE":
      // Predictive, exactly like `fight_remains`, and unbindable for the same
      // reason. There is no binding field to read.
      return UNKNOWN;
    case "DOT_TICKING": {
      const known = bindings.knownDotsTicking?.find((entry) => entry.name === node.dotName);
      if (known !== undefined) return known.ticking ? 1 : 0;
      const assigned = world.get(`dot.${node.dotName}.ticking`);
      return assigned === undefined ? UNKNOWN : assigned ? 1 : 0;
    }
    case "COOLDOWN_REMAINS": {
      const entry = bindings.knownCooldownRemainsSeconds?.find((item) => item.name === node.cooldownName);
      return entry === undefined ? UNKNOWN : worldValueOf(entry.remainsSeconds);
    }
    case "BUFF_REMAINS":
      // Understood syntax; this build reconstructs no aura duration.
      return UNKNOWN;
    case "BUFF_STACK": {
      // No stack count is reconstructed here. A value arrives only through an
      // EXACT binding a specialization proved (M11-A4); absent, UNKNOWN. NEVER
      // zero by default: an unobserved aura is not an aura observed at zero
      // stacks.
      const known = (bindings.knownBuffStacks ?? []).find((entry) => entry.name === node.buffName);
      return known === undefined ? UNKNOWN : known.stack;
    }
    case "BUFF_REACT": {
      // Its own key, so it never reads a `buff.<name>.up` assignment. There is
      // no binding field, so it is always enumerated.
      const assigned = world.get(`buff.${node.buffName}.react`);
      return assigned === true ? 1 : 0;
    }
    case "DEBUFF_UP": {
      const assigned = world.get(`debuff.${node.debuffName}.up`);
      return assigned === true ? 1 : 0;
    }
    case "BUFF_UP": {
      const known = bindings.knownBuffs.find((entry) => entry.name === node.buffName);
      if (known !== undefined) return known.up ? 1 : 0;
      const assigned = world.get(`buff.${node.buffName}.up`);
      // Unreachable: every unresolved boolean atom is assigned in every world.
      return assigned === true ? 1 : 0;
    }
    case "STEALTHED_ROGUE": {
      // `=== true`, not `!== undefined`. The type already forbids `false`, and
      // this is the second lock: a value forced through an unsafe cast falls to
      // the enumerated world rather than becoming an authoritative FALSE.
      if (bindings.stealthedRogue === true) return 1;
      return world.get("stealthed.rogue") === true ? 1 : 0;
    }
    case "TALENT": {
      const known = (bindings.knownTalents ?? []).find((entry) => entry.name === node.talentName);
      if (known !== undefined) return known.taken ? 1 : 0;
      return world.get(`talent.${node.talentName}`) === true ? 1 : 0;
    }
    case "VARIABLE_SINGLE_TARGET":
      // NO BINDING FIELD EXISTS, deliberately — the same device that keeps
      // `fight_remains` unbindable. Its value is `spell_targets.fan_of_knives=1`,
      // a per-scan count of Fan of Knives' actual target list
      // (action.cpp:3832-3842). Warcraft Logs supplies no enemy positional state,
      // so that count is not historically reconstructible. Leaving out the field
      // means no future caller can supply a guess without editing this type.
      return world.get("variable.single_target") === true ? 1 : 0;
    case "DOT_PMULTIPLIER":
      // NO BINDING FIELD EXISTS, permanently. Reconstructing a snapshot
      // multiplier from Warcraft Logs would mean inferring it from damage
      // numbers. Leaving out the field means no caller can supply one without
      // editing `AtomBindings`.
      return UNKNOWN;
    case "DOT_REMAINS":
      // KEYED BY THE ACTING ACTION. Never a scalar shared across entries.
      return worldValueOf(actingDotRemains(bindings, context));
    case "SPEC_ATOM": {
      const value = specAtomValueFor(bindings.specAtoms, node.identifier, context.currentActionToken);
      if (value?.kind === "MAGNITUDE") return worldValueOf(value.binding);
      if (value?.kind === "TRUTH") return value.value ? 1 : 0;
      // Unbound. A magnitude is UNKNOWN, never zero; a truth reads this world's
      // assignment, exactly as an unbound `buff.<name>.up` does.
      if (node.shape === "NUMERIC") return UNKNOWN;
      return world.get(node.identifier) === true ? 1 : 0;
    }
    case "DOT_REFRESHABLE": {
      const proven = actingDotRefreshable(bindings, context);
      if (proven !== undefined) return proven ? 1 : 0;
      // Unbound, so enumerated. `refreshable` is one atom per expression, and the
      // key is bare because the atom is: it addresses whichever action is acting.
      return world.get("refreshable") === true ? 1 : 0;
    }
    case "MULTIPLY":
    case "ADD":
    case "SUBTRACT": {
      const left = recurse(node.left);
      const right = recurse(node.right);
      // Arithmetic on a magnitude nobody established is undecided. It is not
      // zero, and it is not an excuse to pick a bound.
      //
      // A PROVEN bound is refused here too. `L + k` would be a valid lower bound
      // and `L * k` would not be for negative `k`, so propagating bounds through
      // arithmetic needs sign reasoning this evaluator does not do. No pinned
      // expression does arithmetic on a bounded magnitude, so it fails closed.
      if (isUnknownValue(left) || isUnknownValue(right)) return UNKNOWN;
      if (isBoundedValue(left) || isBoundedValue(right)) return UNKNOWN;
      // SimulationCraft has no boolean type: a truth operand is already 1 or 0
      // here, so `6*talent.razor_wire` needs no coercion rule of its own.
      if (node.kind === "MULTIPLY") return left * right;
      return node.kind === "ADD" ? left + right : left - right;
    }
    case "NOT":
      return valueOf(notTruth(truthOf(recurse(node.operand))));
    case "COMPARISON": {
      const left = recurse(node.left);
      const right = recurse(node.right);
      // A comparison against a magnitude nobody established is undecided. It is
      // NOT false, and it is NOT an excuse to pick a bound. A PROVEN bound is a
      // different matter and may settle the comparison; see `compareWithBounds`.
      return compareWithBounds(node.operator, left, right);
    }
    case "AND":
      return valueOf(andTruth(truthOf(recurse(node.left)), truthOf(recurse(node.right))));
    case "OR":
      return valueOf(orTruth(truthOf(recurse(node.left)), truthOf(recurse(node.right))));
  }
}

/** The binding of one atom, decided once, before any world is built. */
interface ResolvedAtom {
  readonly trace: TraceAtom;
  /** True only for BOOLEAN atoms with no known value: these get enumerated. */
  readonly enumerate: boolean;
}

function resolveAtom(
  key: string,
  shape: AtomShape,
  bindings: AtomBindings,
  context: ExpressionContext,
): ResolvedAtom {
  const known = (value: number): ResolvedAtom => ({
    trace: { key, shape, binding: "KNOWN", value, atLeast: null, unknownNumberReason: null },
    enumerate: false,
  });
  const boundedNumeric = (atLeast: number, reason: UnknownNumberReason): ResolvedAtom => ({
    // `value` stays null. The bound lives in its own field so it cannot be read
    // as the magnitude.
    trace: { key, shape, binding: "BOUNDED", value: null, atLeast, unknownNumberReason: reason },
    enumerate: false,
  });
  const unknownNumeric = (reason: UnknownNumberReason): ResolvedAtom => ({
    trace: {
      key,
      shape,
      binding: "UNKNOWN_NUMBER",
      value: null,
      atLeast: null,
      unknownNumberReason: reason,
    },
    enumerate: false,
  });
  /** Routes any binding state to the right trace shape, so no site forgets one. */
  const fromBinding = (binding: NumericBinding): ResolvedAtom => {
    if (binding.state === "KNOWN_NUMBER") return known(binding.value);
    if (binding.state === "BOUNDED_NUMBER") return boundedNumeric(binding.atLeast, binding.reason);
    return unknownNumeric(binding.reason);
  };

  if (key === "combo_points") {
    return fromBinding(bindings.comboPoints);
  }
  if (key === "combo_points.deficit") {
    return fromBinding(bindings.comboPointsDeficit);
  }
  if (key === "energy.pct") {
    return fromBinding(bindings.energyPct);
  }
  if (key === "fight_remains") return unknownNumeric("PREDICTIVE_NOT_PLAYER_KNOWABLE");
  if (key === "remains") {
    // Through the SAME helper `evaluateInWorld` uses, so the trace and the answer
    // can never disagree about which action's DoT was read.
    return fromBinding(actingDotRemains(bindings, context));
  }
  // `pmultiplier` is a snapshot this project does not reconstruct. It reports
  // STATE_NOT_MODELLED rather than STATE_NOT_ESTABLISHED: the remedy is not a
  // better capture, it is a model we have decided not to build.
  if (key === "pmultiplier") return unknownNumeric("STATE_NOT_MODELLED");
  // Predictive, exactly like `fight_remains`. The remedy is not a better
  // capture: the player did not know how long the target had left either.
  if (key === "target.time_to_die") return unknownNumeric("PREDICTIVE_NOT_PLAYER_KNOWABLE");

  const cooldown = /^cooldown\.(.+)\.remains$/.exec(key);
  const cooldownName = cooldown?.[1];
  if (cooldownName !== undefined) {
    const knownCooldown = (bindings.knownCooldownRemainsSeconds ?? []).find(
      (entry) => entry.name === cooldownName,
    );
    // Absent is UNKNOWN_NUMBER, never zero. STATE_NOT_ESTABLISHED rather than
    // STATE_NOT_MODELLED: a cooldown model DOES exist, and the remedy for a
    // missing one is evidence — an observed cast and a pinned base cooldown.
    return knownCooldown === undefined
      ? unknownNumeric("STATE_NOT_ESTABLISHED")
      : fromBinding(knownCooldown.remainsSeconds);
  }

  // A specialization-declared atom (M10-C). Consulted through the SAME helper
  // `evaluateInWorld` uses, so the trace and the answer agree about which
  // binding was read. A declared key can never equal a built-in key, so
  // nothing above could have claimed it first.
  const declared = bindings.specAtoms?.vocabulary.lookup(key) ?? null;
  if (declared !== null) {
    const value = specAtomValueFor(bindings.specAtoms, key, context.currentActionToken);
    if (value?.kind === "MAGNITUDE") return fromBinding(value.binding);
    if (value?.kind === "TRUTH") return known(value.value ? 1 : 0);
    // Unbound. The resolver had a model for none of this, or its evidence fell
    // short — either way the specialization did not state a value, and a
    // magnitude it did not state is not established.
    if (shape === "NUMERIC") return unknownNumeric("STATE_NOT_ESTABLISHED");
    return {
      trace: {
        key,
        shape,
        binding: "UNRESOLVED_BOOLEAN",
        value: null,
        atLeast: null,
        unknownNumberReason: null,
      },
      enumerate: true,
    };
  }

  const stack = /^buff\.(.+)\.stack$/.exec(key);
  const stackName = stack?.[1];
  if (stackName !== undefined) {
    // Through the SAME lookup `evaluateInWorld` uses. Absent is
    // STATE_NOT_ESTABLISHED, never zero: a stack model does not exist, but an
    // exact-zero proof does, and the remedy for a missing one is evidence.
    const knownStack = (bindings.knownBuffStacks ?? []).find((entry) => entry.name === stackName);
    return knownStack === undefined ? unknownNumeric("STATE_NOT_ESTABLISHED") : known(knownStack.stack);
  }

  if (shape === "NUMERIC") {
    // `buff.<name>.remains` and anything numeric added later without a
    // binding. STATE_NOT_MODELLED, and emphatically not zero.
    return unknownNumeric("STATE_NOT_MODELLED");
  }

  const buff = /^buff\.(.+)\.up$/.exec(key);
  const name = buff?.[1];
  const knownBuff = name === undefined ? undefined : bindings.knownBuffs.find((e) => e.name === name);
  if (knownBuff !== undefined) return known(knownBuff.up ? 1 : 0);

  // An ESTABLISHED truth is not enumerated. Beyond producing the right trace,
  // this is what keeps the world count down: `default[4]` carries five boolean
  // atoms, and enumerating all of them would be 32 worlds — past the cap, so a
  // fully-bound gate would have come back UNSUPPORTED instead of decided.
  //
  // `=== true` for `stealthed.rogue`, matching `evaluateInWorld`. The two sites
  // must agree: if this one accepted a cast-in `false` as KNOWN while the world
  // evaluator treated it as unbound, the atom would be reported KNOWN in the
  // trace and then enumerated anyway — a trace that disagrees with the answer.
  if (key === "stealthed.rogue" && bindings.stealthedRogue === true) {
    return known(1);
  }
  if (key === "refreshable") {
    // Same helper as `evaluateInWorld`, same reason. `undefined` falls through to
    // the enumerated case below rather than becoming a value.
    const proven = actingDotRefreshable(bindings, context);
    if (proven !== undefined) return known(proven ? 1 : 0);
  }
  const dot = /^dot\.(.+)\.ticking$/.exec(key);
  const dotName = dot?.[1];
  const knownDot =
    dotName === undefined
      ? undefined
      : (bindings.knownDotsTicking ?? []).find((entry) => entry.name === dotName);
  if (knownDot !== undefined) return known(knownDot.ticking ? 1 : 0);

  const talent = /^talent\.(.+)$/.exec(key);
  const talentName = talent?.[1];
  const knownTalent =
    talentName === undefined
      ? undefined
      : (bindings.knownTalents ?? []).find((entry) => entry.name === talentName);
  if (knownTalent !== undefined) return known(knownTalent.taken ? 1 : 0);

  // `variable.single_target` deliberately never lands here as KNOWN: it has no
  // binding field, so it always enumerates.

  return {
    trace: {
      key,
      shape,
      binding: "UNRESOLVED_BOOLEAN",
      value: null,
      atLeast: null,
      unknownNumberReason: null,
    },
    enumerate: true,
  };
}

function aggregateRuleFor(
  worlds: readonly TraceWorld[],
  enumeratedCount: number,
  hasUnknownNumber: boolean,
): TraceAggregateRule {
  const anyUnknown = worlds.some((world) => world.result === "UNKNOWN_STATE");
  if (anyUnknown) {
    return worlds.every((world) => world.result === "UNKNOWN_STATE")
      ? "UNKNOWN_STATE_IN_EVERY_WORLD"
      : "WORLDS_MIXED_WITH_UNKNOWN_STATE";
  }
  if (enumeratedCount === 0 && !hasUnknownNumber) return "NO_UNRESOLVED_ATOMS";
  if (enumeratedCount === 0) {
    // An unknown magnitude existed but did not reach the result — the only
    // world is definite, so nothing was enumerated and nothing is in doubt.
    return "NO_UNRESOLVED_ATOMS";
  }
  const allTrue = worlds.every((world) => world.result === "TRUE");
  const allFalse = worlds.every((world) => world.result === "FALSE");
  return allTrue || allFalse ? "INVARIANT_ACROSS_WORLDS" : "WORLDS_DISAGREE";
}

/**
 * Evaluates a parsed condition against exact state plus correlated unknowns.
 *
 * The returned trace records every atom, every enumerated world and the rule
 * that produced the aggregate, so a finding can answer "why did it tell me
 * this?" without re-running anything.
 */
export function evaluateSimcExpression(
  ast: ExpressionNode,
  expressionRaw: string,
  bindings: AtomBindings,
  /**
   * Which action's own DoT the bare self-addressing atoms belong to.
   *
   * DEFAULTS TO NO ACTING ACTION, which is the safe default rather than a
   * convenient one: a caller that forgets it gets UNKNOWN for `remains` and an
   * enumerated `refreshable`, never another action's binding.
   */
  context: ExpressionContext = NO_ACTING_ACTION,
): ExpressionEvaluation {
  const atoms: TraceAtom[] = [];
  const enumerated: string[] = [];
  let hasUnknownNumber = false;

  for (const atom of collectAtoms(ast)) {
    const resolved = resolveAtom(atom.key, atom.shape, bindings, context);
    atoms.push(resolved.trace);
    if (resolved.enumerate) enumerated.push(atom.key);
    if (resolved.trace.binding === "UNKNOWN_NUMBER") hasUnknownNumber = true;
  }

  if (enumerated.length > MAX_UNRESOLVED_ATOMS) {
    return {
      outcome: "UNSUPPORTED",
      reason: "TOO_MANY_UNRESOLVED_ATOMS",
      unresolvedAtomCount: enumerated.length,
      expressionRaw,
    };
  }

  const worldCount = 2 ** enumerated.length;
  const worlds: TraceWorld[] = [];
  for (let mask = 0; mask < worldCount; mask += 1) {
    const assignmentMap = new Map<string, boolean>();
    const assignment: { atom: string; up: boolean }[] = [];
    for (let bit = 0; bit < enumerated.length; bit += 1) {
      const key = enumerated[bit];
      if (key === undefined) continue;
      const up = (mask & (1 << bit)) !== 0;
      assignmentMap.set(key, up);
      assignment.push({ atom: key, up });
    }
    worlds.push({ assignment, result: truthOf(evaluateInWorld(ast, bindings, assignmentMap, context)) });
  }

  const allTrue = worlds.every((world) => world.result === "TRUE");
  const allFalse = worlds.every((world) => world.result === "FALSE");

  const aggregate: TraceAggregate = allTrue ? "TRUE" : allFalse ? "FALSE" : "UNRESOLVED";
  const trace: ExpressionTrace = {
    expressionRaw,
    atoms,
    worlds,
    aggregate,
    aggregateRule: aggregateRuleFor(worlds, enumerated.length, hasUnknownNumber),
  };

  if (allTrue) return { outcome: "RESOLVED", value: true, trace };
  if (allFalse) return { outcome: "RESOLVED", value: false, trace };
  return { outcome: "UNRESOLVED", trace };
}
