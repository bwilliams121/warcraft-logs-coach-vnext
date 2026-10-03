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

import {
  collectAtoms,
  extremumOf,
  type AtomShape,
  type ComparisonOperator,
  type ExpressionNode,
} from "./ast.js";
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
 *
 * `ONE_OF_NUMBERS` (M11-B9) IS NOT AN INTERVAL EITHER. It is a finite set of
 * EXACT values, each one mechanically established, of which exactly one is
 * the magnitude — the shape unresolved event ORDERING produces: an aura's
 * stack was 5 before a transition the log wrote at the decision's own
 * millisecond and 6 after it, and nothing says which side of the decision
 * the transition fell on, so the stack is one of { 5, 6 }. A comparison
 * decides only when every member decides it the same way; a truth only when
 * every member is zero or every member is non-zero; arithmetic refuses. No
 * member is ever manufactured, no endpoint invented, and nothing between two
 * members is admitted: { 5, 7 } is not "5 to 7". At least two distinct
 * members — a set of one is a KNOWN value and `oneOfNumbers` returns it as
 * such — and the members are stored sorted and deduplicated so two sets with
 * the same content trace identically.
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
  | {
      readonly state: "ONE_OF_NUMBERS";
      /** Every exact value the magnitude may be; sorted ascending, no duplicates, at least two. */
      readonly values: readonly number[];
      /** Why exactly one of them could not be picked. */
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

/**
 * A magnitude that is exactly one of `values`, each of which the caller has
 * ESTABLISHED as a possible exact value (M11-B9).
 *
 * Deduplicated and sorted, so the representation is canonical. A single
 * distinct value is not a set — it is that value, returned as KNOWN_NUMBER,
 * so no caller can dress a known magnitude as an uncertainty. An empty list
 * is a programming error, not an unknown, and throws.
 */
export function oneOfNumbers(values: readonly number[], reason: UnknownNumberReason): NumericBinding {
  const distinct = [...new Set(values)].sort((left, right) => left - right);
  if (distinct.length === 0) throw new Error("oneOfNumbers: a set of possible values must not be empty");
  const only = distinct[0];
  if (distinct.length === 1 && only !== undefined) return knownNumber(only);
  return { state: "ONE_OF_NUMBERS", values: distinct, reason };
}

/**
 * What SimulationCraft reports as `buff.<name>.remains` for an ACTIVE aura that
 * has NO expiration — a PERMANENT aura (M11-B4).
 *
 * Pinned at 33622e9d1662ff0e451691edf85a6b49cc9d11d9:
 *
 *     engine/buff/buff.cpp:2018-2029   buff_t::remains(): `current_stack <= 0`
 *                                      -> zero; an expiration event -> its
 *                                      time minus now; otherwise
 *                                      `timespan_t::min()`
 *     engine/buff/buff.cpp:369-376     the `remains` expression returns that
 *                                      value unchanged
 *     engine/sim/expressions.hpp:135   `coerce( timespan_t )` is
 *                                      `total_seconds()`
 *     engine/util/timespan.hpp:216-219 `timespan_t::min()` is the int64
 *                                      minimum in MILLISECONDS; `total_seconds`
 *                                      (:58-61) multiplies by 1/1000
 *
 * So the expression sees -9,223,372,036,854,775,808 ms / 1000: a huge NEGATIVE
 * number of seconds. It is NONZERO, so as a bare truth it is TRUE (SimC has no
 * boolean type; zero is false) — which is how the pinned lists use it — and it
 * compares as that number, so `remains<1.5` on a permanent aura is TRUE. Note
 * that `remains_gt` / `remains_lt` (buff.cpp:2048-2068) special-case the
 * sentinel as infinite, but the expression path does NOT go through them.
 *
 * ONE constant, so no specialization types the sentinel by hand, and NO
 * evaluator special case: the evaluator receives a known number. Not
 * `-Infinity`, not a large positive duration, not a boolean — those would all
 * be representations SimulationCraft does not use.
 *
 * The magnitude exceeds 2^53, so the double is the nearest representable
 * value. Comparisons only ever need its sign and magnitude, which the rounding
 * does not disturb.
 */
export const SIMC_PERMANENT_BUFF_REMAINS_SECONDS = -9223372036854775808 / 1000;

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
 * There is no `fightRemains`. See the module header. `buff.<name>.remains` has
 * a binding seam since M11-B4 (`knownBuffRemainsSeconds`), and it is a SEAM:
 * this module still reconstructs no aura duration of its own.
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
  readonly knownBuffStacks?: readonly {
    readonly name: string;
    /**
     * An exact count, or (M11-B9) a `NumericBinding` — in practice
     * `ONE_OF_NUMBERS`, the finite set of exact counts two event orderings
     * leave. A plain number is read exactly as before; every existing caller
     * passes one and is unchanged.
     */
    readonly stack: number | NumericBinding;
  }[];
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
   * `buff.<name>.remains` values a specialization has ESTABLISHED, in
   * SECONDS, keyed by name (M11-B4).
   *
   * A BINDING SEAM, NOT A DURATION MODEL — the same shape and the same rule
   * as `knownCooldownRemainsSeconds`. This module knows no aura duration, no
   * refresh behaviour and no talent; a specialization that has pinned those
   * facts derives a value from OBSERVED transitions and states it here, as a
   * full `NumericBinding`:
   *
   *     KNOWN_NUMBER     an exact remainder (a gain of pinned reset semantics
   *                      under complete coverage), an exact ZERO the spec
   *                      proved (an observed removal, a build proof), or the
   *                      pinned SimulationCraft representation of a permanent
   *                      aura (`SIMC_PERMANENT_BUFF_REMAINS_SECONDS`)
   *     BOUNDED_NUMBER   a proven lower bound, decided by `compareWithBounds`
   *                      exactly as a cooldown's is
   *     UNKNOWN_NUMBER   the spec MODELS the aura and its evidence fell short,
   *                      with the spec's reason
   *
   * An ABSENT name is `UNKNOWN_NUMBER` / `STATE_NOT_MODELLED`, byte-for-byte
   * what it was before this field existed: a specialization that supplies no
   * entry has no remains model, and the evaluator does not guess why. Never
   * zero by default — zero reads as "expired", the most dangerous possible
   * default for a `remains<` refresh gate.
   */
  readonly knownBuffRemainsSeconds?: readonly {
    readonly name: string;
    /** SECONDS, as a full `NumericBinding`. The adapter that fills it converts exactly once. */
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

export type TraceAtomBinding = "KNOWN" | "BOUNDED" | "ONE_OF" | "UNRESOLVED_BOOLEAN" | "UNKNOWN_NUMBER";

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
  /** Present for BOUNDED, ONE_OF and UNKNOWN_NUMBER, so a finding can say which gap this was. */
  readonly unknownNumberReason: UnknownNumberReason | null;
  /**
   * The finite set of exact possible values when ONE_OF (M11-B9), sorted
   * ascending; ABSENT for every other binding, so every trace written before
   * the state existed serialises byte-for-byte as it did.
   */
  readonly oneOf?: readonly number[];
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

/**
 * A magnitude that is exactly one of these values, inside one world (M11-B9).
 *
 * Kept structurally distinct from `number` and from `BoundedValue`: a
 * comparison decides only when every member decides it alike, a truth only
 * when every member agrees, and arithmetic refuses. Never collapsed to its
 * minimum or maximum.
 */
interface OneOfValue {
  readonly oneOfValues: readonly number[];
}

type WorldValue = number | BoundedValue | OneOfValue | typeof UNKNOWN;

function isUnknownValue(value: WorldValue): value is typeof UNKNOWN {
  return value === UNKNOWN;
}

function isBoundedValue(value: WorldValue): value is BoundedValue {
  return typeof value === "object" && value !== null && "atLeastValue" in value;
}

function isOneOfValue(value: WorldValue): value is OneOfValue {
  return typeof value === "object" && value !== null && "oneOfValues" in value;
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
  if (binding.state === "ONE_OF_NUMBERS") return { oneOfValues: binding.values };
  return UNKNOWN;
}

/** A stack binding as this world sees it: a plain number is the number; anything else goes through `worldValueOf`. */
function stackWorldValueOf(stack: number | NumericBinding): WorldValue {
  return typeof stack === "number" ? stack : worldValueOf(stack);
}

/**
 * `buff.<name>.react` as the COUNT SimulationCraft evaluates (M11-D1).
 *
 * Pinned at 33622e9d1662ff0e451691edf85a6b49cc9d11d9: the `react` expression
 * is `buff_t::stack_react()` (engine/buff/buff.cpp:485-511), which starts from
 * `current_stack` and drops every stack whose reaction time has not elapsed
 * (buff.cpp:2004-2016). So `0 <= react <= stack`, and nothing narrower: this
 * project models no reaction delay.
 *
 * Derived ONLY from the exact `knownBuffStacks` binding, the one stack fact a
 * specialization may state:
 *
 *     no binding              UNKNOWN_NUMBER / STATE_NOT_ESTABLISHED, as for
 *                             `buff.<name>.stack` — never 0, never 1
 *     exactly 0 stacks        KNOWN 0
 *     exactly s >= 1 stacks   ONE_OF { 0 .. s } / STATE_NOT_MODELLED — each
 *                             member is a value SimulationCraft can return
 *     ONE_OF stack values     ONE_OF { 0 .. max } — the union of the above
 *     BOUNDED / UNKNOWN       UNKNOWN_NUMBER: a lower bound on the stack is
 *                             no bound at all on react, which may still be 0
 *
 * So `react=2` is FALSE only when at most one stack is proven, and UNKNOWN —
 * not FALSE — whenever two or more stacks are possible or nothing is known.
 * A value that is not a whole, non-negative count is refused as unestablished.
 */
function reactStackBinding(bindings: AtomBindings, buffName: string): NumericBinding {
  const entry = (bindings.knownBuffStacks ?? []).find((item) => item.name === buffName);
  if (entry === undefined) return unknownNumber("STATE_NOT_ESTABLISHED");
  const stack = typeof entry.stack === "number" ? knownNumber(entry.stack) : entry.stack;
  const isCount = (value: number): boolean => Number.isInteger(value) && value >= 0;
  const zeroThrough = (top: number): NumericBinding =>
    oneOfNumbers(
      Array.from({ length: top + 1 }, (_, index) => index),
      "STATE_NOT_MODELLED",
    );
  if (stack.state === "KNOWN_NUMBER") {
    return isCount(stack.value) ? zeroThrough(stack.value) : unknownNumber("STATE_NOT_ESTABLISHED");
  }
  if (stack.state === "ONE_OF_NUMBERS") {
    if (!stack.values.every(isCount)) return unknownNumber("STATE_NOT_ESTABLISHED");
    return zeroThrough(Math.max(...stack.values));
  }
  if (stack.state === "BOUNDED_NUMBER") return unknownNumber(stack.reason);
  return unknownNumber(stack.reason);
}

/** Whether `buff.<name>.react` is proven zero: an EXACT zero-stack binding, and nothing else (M11-D1). */
function reactProvenZero(bindings: AtomBindings, buffName: string): boolean {
  const binding = reactStackBinding(bindings, buffName);
  return binding.state === "KNOWN_NUMBER" && binding.value === 0;
}

/** SimulationCraft has no boolean type: zero is false, everything else is true. */
function truthOf(value: WorldValue): TruthValue {
  if (isUnknownValue(value)) return "UNKNOWN_STATE";
  if (isOneOfValue(value)) {
    // Every member non-zero -> TRUE; every member zero -> FALSE; a mix is a
    // truth nobody established. { 0, 1 } is UNKNOWN, not "probably up".
    const truths = value.oneOfValues.map((member) => member !== 0);
    if (truths.every((truth) => truth)) return "TRUE";
    if (truths.every((truth) => !truth)) return "FALSE";
    return "UNKNOWN_STATE";
  }
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

  // A finite set of exact values against an exact value (either side): the
  // comparison is made for EVERY member, and decides only when all agree.
  // Never min/max, never a member dropped. A set against a bound or against
  // another set is UNKNOWN — no pinned expression needs more, and no rule is
  // added that nothing needs (M11-B9).
  if (isOneOfValue(left) && isExactValue(right)) {
    return agreedComparison(left.oneOfValues.map((member) => compare(operator, member, right)));
  }
  if (isExactValue(left) && isOneOfValue(right)) {
    return agreedComparison(right.oneOfValues.map((member) => compare(operator, left, member)));
  }
  if (isOneOfValue(left) || isOneOfValue(right)) return UNKNOWN;

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

/**
 * `<?` (MAX) or `>?` (MIN) over two operands of ONE world (M11-D3-C1).
 *
 * Pinned, it is `std::max` / `std::min` of two eagerly evaluated doubles
 * (engine/sim/expressions.cpp:212-226, 384-387). Here every operand may be a
 * value nobody fully established, and the result claims ONLY what holds in
 * every world the operands allow. Uncorrelated operands are never correlated.
 *
 *     exact      exact       the exact pinned result
 *     UNKNOWN    anything    UNKNOWN — no atom here carries a domain contract,
 *                            so an unknown operand may lie on either side of
 *                            any value; it is never zero and never dominated
 *     one-of S   exact b     member-wise, { pick(s, b) } — one result per
 *                            possible world of S, so nothing is manufactured
 *     one-of S   one-of T    when every member of one is <= every member of the
 *                            other, the result IS that set (MAX: the upper one,
 *                            MIN: the lower one). Overlapping: only the proven
 *                            lower bound pick(min S, min T) — pairing members
 *                            would manufacture values two worlds may never share
 *     >= L       exact b     MAX: >= max(L, b). MIN: exactly b when L >= b,
 *                            otherwise >= L
 *     >= L       >= M        MAX: >= max(L, M). MIN: >= min(L, M)
 *     >= L       one-of S    MAX: >= max(L, min S). MIN: S itself when
 *                            L >= max S, otherwise >= min(L, min S)
 *
 * There is no upper bound in this evaluator's value domain, so a two-sided
 * result keeps only its proven lower side. That is a weaker claim, never a
 * wrong one.
 */
function extremumValue(kind: "MAX" | "MIN", left: WorldValue, right: WorldValue): WorldValue {
  const pick = kind === "MAX" ? Math.max : Math.min;
  if (isUnknownValue(left) || isUnknownValue(right)) return UNKNOWN;
  if (isExactValue(left) && isExactValue(right)) return pick(left, right);

  const membersOf = (value: number | OneOfValue): readonly number[] =>
    isExactValue(value) ? [value] : value.oneOfValues;
  if (!isBoundedValue(left) && !isBoundedValue(right)) {
    const a = membersOf(left);
    const b = membersOf(right);
    if (a.length === 1 || b.length === 1) {
      return oneOfValue(a.flatMap((x) => b.map((y) => pick(x, y))));
    }
    const [aLow, aHigh, bLow, bHigh] = [Math.min(...a), Math.max(...a), Math.min(...b), Math.max(...b)];
    if (aHigh <= bLow) return oneOfValue(kind === "MAX" ? b : a);
    if (bHigh <= aLow) return oneOfValue(kind === "MAX" ? a : b);
    return { atLeastValue: pick(aLow, bLow) };
  }

  // At least one proven lower bound. Normalise to (bound, other).
  const [bound, other] = isBoundedValue(left) ? [left, right] : [right as BoundedValue, left];
  const lower = bound.atLeastValue;
  if (isBoundedValue(other)) return { atLeastValue: pick(lower, other.atLeastValue) };
  const members = membersOf(other);
  const otherLow = Math.min(...members);
  const otherHigh = Math.max(...members);
  if (kind === "MAX") return { atLeastValue: Math.max(lower, otherLow) };
  // MIN: the bounded side never goes below `lower`; if that already clears
  // every member of the other side, the other side is the minimum outright.
  if (lower >= otherHigh) return oneOfValue(members);
  return { atLeastValue: Math.min(lower, otherLow) };
}

/** A canonical world value from established members: one distinct member is that exact number. */
function oneOfValue(members: readonly number[]): WorldValue {
  const distinct = [...new Set(members)].sort((first, second) => first - second);
  const only = distinct[0];
  if (distinct.length === 1 && only !== undefined) return only;
  return { oneOfValues: distinct };
}

/** The one truth every member produced, or UNKNOWN when they differ. */
function agreedComparison(results: readonly number[]): WorldValue {
  const first = results[0];
  if (first === undefined) return UNKNOWN;
  return results.every((result) => result === first) ? first : UNKNOWN;
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
    case "BUFF_REMAINS": {
      // Understood syntax; this module reconstructs no aura duration. A value
      // arrives only through a binding a specialization established (M11-B4);
      // absent, UNKNOWN — never zero, never a bound nobody proved.
      const entry = bindings.knownBuffRemainsSeconds?.find((item) => item.name === node.buffName);
      return entry === undefined ? UNKNOWN : worldValueOf(entry.remainsSeconds);
    }
    case "BUFF_STACK": {
      // No stack count is reconstructed here. A value arrives only through an
      // EXACT binding a specialization proved (M11-A4); absent, UNKNOWN. NEVER
      // zero by default: an unobserved aura is not an aura observed at zero
      // stacks.
      const known = (bindings.knownBuffStacks ?? []).find((entry) => entry.name === node.buffName);
      return known === undefined ? UNKNOWN : stackWorldValueOf(known.stack);
    }
    case "BUFF_REACT": {
      // Its own key, so it never reads a `buff.<name>.up` assignment. In a
      // truth position it is `stack_react() != 0`: FALSE only when zero stacks
      // are proven, otherwise enumerated exactly as before (M11-D1).
      if (reactProvenZero(bindings, node.buffName)) return 0;
      const assigned = world.get(`buff.${node.buffName}.react`);
      return assigned === true ? 1 : 0;
    }
    case "BUFF_REACT_STACK":
      // A COUNT, from the exact stack binding only; never a world assignment
      // (M11-D1). Absent evidence is UNKNOWN, never 0 and never 1.
      return worldValueOf(reactStackBinding(bindings, node.buffName));
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
      // A finite set is refused too (M11-B9): distributing arithmetic across
      // members would manufacture values nobody established. No pinned
      // expression does arithmetic on a stack count, so it fails closed.
      if (isOneOfValue(left) || isOneOfValue(right)) return UNKNOWN;
      // SimulationCraft has no boolean type: a truth operand is already 1 or 0
      // here, so `6*talent.razor_wire` needs no coercion rule of its own.
      if (node.kind === "MULTIPLY") return left * right;
      return node.kind === "ADD" ? left + right : left - right;
    }
    case "EXTREMUM":
      return extremumValue(extremumOf(node.operator), recurse(node.left), recurse(node.right));
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
  const oneOfNumeric = (values: readonly number[], reason: UnknownNumberReason): ResolvedAtom => ({
    // `value` and `atLeast` stay null: the set is neither a magnitude nor a
    // bound, and it is reported only in its own field.
    trace: {
      key,
      shape,
      binding: "ONE_OF",
      value: null,
      atLeast: null,
      unknownNumberReason: reason,
      oneOf: values,
    },
    enumerate: false,
  });
  /** Routes any binding state to the right trace shape, so no site forgets one. */
  const fromBinding = (binding: NumericBinding): ResolvedAtom => {
    if (binding.state === "KNOWN_NUMBER") return known(binding.value);
    if (binding.state === "BOUNDED_NUMBER") return boundedNumeric(binding.atLeast, binding.reason);
    if (binding.state === "ONE_OF_NUMBERS") return oneOfNumeric(binding.values, binding.reason);
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
    if (knownStack === undefined) return unknownNumeric("STATE_NOT_ESTABLISHED");
    return typeof knownStack.stack === "number" ? known(knownStack.stack) : fromBinding(knownStack.stack);
  }

  const remains = /^buff\.(.+)\.remains$/.exec(key);
  const remainsName = remains?.[1];
  if (remainsName !== undefined) {
    // Through the SAME lookup `evaluateInWorld` uses. Absent is
    // STATE_NOT_MODELLED — exactly the trace this atom produced before the
    // seam existed, so a specialization that binds nothing is unchanged — and
    // a spec that models the aura but could not establish it says so with its
    // own UNKNOWN_NUMBER entry. Never zero.
    const knownRemains = (bindings.knownBuffRemainsSeconds ?? []).find((entry) => entry.name === remainsName);
    return knownRemains === undefined
      ? unknownNumeric("STATE_NOT_MODELLED")
      : fromBinding(knownRemains.remainsSeconds);
  }

  const reactStack = /^buff\.(.+)\.react#stack_react$/.exec(key);
  const reactStackName = reactStack?.[1];
  if (reactStackName !== undefined) {
    // Through the SAME derivation `evaluateInWorld` uses (M11-D1). Absent is
    // STATE_NOT_ESTABLISHED, exactly as for `buff.<name>.stack`.
    return fromBinding(reactStackBinding(bindings, reactStackName));
  }

  if (shape === "NUMERIC") {
    // Anything numeric added later without a binding. STATE_NOT_MODELLED, and
    // emphatically not zero.
    return unknownNumeric("STATE_NOT_MODELLED");
  }

  const buff = /^buff\.(.+)\.up$/.exec(key);
  const name = buff?.[1];
  const knownBuff = name === undefined ? undefined : bindings.knownBuffs.find((e) => e.name === name);
  if (knownBuff !== undefined) return known(knownBuff.up ? 1 : 0);

  // `.react` in a truth position: zero only on an exact zero-stack proof, the
  // same test `evaluateInWorld` makes; anything else enumerates below (M11-D1).
  const reactTruth = /^buff\.(.+)\.react$/.exec(key);
  const reactTruthName = reactTruth?.[1];
  if (reactTruthName !== undefined && reactProvenZero(bindings, reactTruthName)) return known(0);

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
