/**
 * The specialization-owned atom seam (M10-C).
 *
 * WHAT THIS IS
 *
 * The shared parser understands a fixed subset of SimulationCraft identifiers.
 * Everything else is refused whole, and that refusal is the parser's safety
 * property. A second specialization's APL uses identifiers the first never
 * did — `next_armament`, `hero_tree.lightsmith`, `apex.3` — and the wrong way
 * to admit them would be to teach the shared parser what a Paladin is.
 *
 * So the parser takes an OPTIONAL vocabulary: a frozen list of identifiers a
 * specialization declares, each with the two properties the evaluator needs
 * and nothing else — its SHAPE (truth or magnitude) and its SCOPE (player or
 * target). The parser produces a generic `SPEC_ATOM` node for a declared
 * identifier and refuses an undeclared one exactly as before. The evaluator
 * reads a declared atom's VALUE from the bindings the specialization supplies;
 * an unsupplied truth is enumerated and an unsupplied magnitude is
 * UNKNOWN_NUMBER, the same rules every built-in atom already follows.
 *
 * WHAT THE SHARED CODE NEVER LEARNS
 *
 * No identifier, no class, no specialization. This module holds no names. The
 * only rule it enforces is structural: a vocabulary cannot shadow a built-in
 * identifier (the parser matches built-ins first, and a declaration that
 * would never be reached is a lie), cannot declare an identifier twice, and
 * cannot be edited after it is defined.
 *
 * PARSER SUPPORT AND STATE OBSERVABILITY ARE SEPARATE
 *
 * Declaring `consecration.up` makes a condition containing it PARSE. It does
 * not make it DECIDABLE: the specialization's resolver may bind it, or leave
 * it unbound, in which case it is enumerated like any other unresolved truth.
 * Recognising an identifier confers no knowledge of its value.
 */

import type { AtomScope, AtomShape } from "./ast.js";
import type { NumericBinding } from "./evaluate.js";

/** One identifier a specialization declares. */
export interface SpecAtomDeclaration {
  /** The identifier EXACTLY as it appears in the pinned APL, e.g. `next_armament`. */
  readonly identifier: string;
  readonly shape: AtomShape;
  readonly scope: AtomScope;
  /**
   * Whether the identifier addresses the ACTING action (`charges`,
   * `full_recharge_time`) rather than the player. A self-addressing atom's
   * binding is keyed by action token, so one entry's value can never answer
   * another entry's question — the same rule the built-in `remains` follows.
   */
  readonly selfAddressing: boolean;
}

export interface SpecAtomVocabulary {
  /** The specialization that owns these identifiers. Recorded, never branched on. */
  readonly ownerSpecId: string;
  readonly declarations: readonly SpecAtomDeclaration[];
  lookup(identifier: string): SpecAtomDeclaration | null;
}

export type SpecVocabularyDefect =
  "DUPLICATE_IDENTIFIER" | "SHADOWS_BUILTIN_IDENTIFIER" | "MALFORMED_IDENTIFIER" | "NO_OWNER";

export class SpecVocabularyError extends Error {
  readonly defect: SpecVocabularyDefect;
  readonly identifier: string | null;

  constructor(defect: SpecVocabularyDefect, identifier: string | null, detail: string) {
    super(`Specialization vocabulary rejected (${defect}): ${detail}`);
    this.name = "SpecVocabularyError";
    this.defect = defect;
    this.identifier = identifier;
  }
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_.]*$/;

/**
 * Builds a frozen vocabulary, or throws.
 *
 * `isBuiltin` is supplied by the parser so this module never has to know the
 * built-in set; it asks. Throwing (rather than returning a defect) is
 * deliberate: a vocabulary is a build constant defined at module load, and a
 * specialization whose vocabulary is malformed must fail to load, not
 * silently parse less than it claims.
 */
export function defineSpecAtomVocabulary(
  ownerSpecId: string,
  declarations: readonly SpecAtomDeclaration[],
  isBuiltin: (identifier: string) => boolean,
): SpecAtomVocabulary {
  if (ownerSpecId.length === 0) {
    throw new SpecVocabularyError("NO_OWNER", null, "a vocabulary must name its owning specialization");
  }
  const byIdentifier = new Map<string, SpecAtomDeclaration>();
  for (const declaration of declarations) {
    const { identifier } = declaration;
    if (!IDENTIFIER.test(identifier)) {
      throw new SpecVocabularyError(
        "MALFORMED_IDENTIFIER",
        identifier,
        `'${identifier}' is not an identifier the parser could ever read`,
      );
    }
    if (byIdentifier.has(identifier)) {
      throw new SpecVocabularyError("DUPLICATE_IDENTIFIER", identifier, `'${identifier}' is declared twice`);
    }
    if (isBuiltin(identifier)) {
      throw new SpecVocabularyError(
        "SHADOWS_BUILTIN_IDENTIFIER",
        identifier,
        `'${identifier}' is a built-in identifier; the parser matches it before any vocabulary is consulted`,
      );
    }
    byIdentifier.set(
      identifier,
      Object.freeze({
        identifier,
        shape: declaration.shape,
        scope: declaration.scope,
        selfAddressing: declaration.selfAddressing,
      }),
    );
  }
  const frozen = Object.freeze([...byIdentifier.values()]);
  return Object.freeze({
    ownerSpecId,
    declarations: frozen,
    lookup: (identifier: string) => byIdentifier.get(identifier) ?? null,
  });
}

// ---------------------------------------------------------------------------
// Values
// ---------------------------------------------------------------------------

/**
 * What a specialization resolver established for one declared atom.
 *
 * A TRUTH is a proven boolean. A MAGNITUDE is a full `NumericBinding`, so a
 * resolver that knows a value states it, one that has a proven bound states
 * that, and one that has nothing states WHY (`STATE_NOT_MODELLED` for a
 * concept this build reconstructs no model of, `STATE_NOT_ESTABLISHED` for a
 * model whose evidence fell short here). There is no member for "unknown
 * truth": an unknown truth is simply not bound, and is enumerated.
 */
export type SpecAtomValue =
  | { readonly kind: "TRUTH"; readonly value: boolean }
  | { readonly kind: "MAGNITUDE"; readonly binding: NumericBinding };

export interface SpecAtomBinding {
  /** The declared identifier. */
  readonly key: string;
  /**
   * The acting action this binding answers for, or `null` for a player-scoped
   * atom. A self-addressing declaration is read only through a binding whose
   * token equals the evaluating entry's own token.
   */
  readonly actionToken: string | null;
  readonly value: SpecAtomValue;
}

/**
 * The vocabulary and the values a specialization supplies for ONE evaluation.
 *
 * Carried on `AtomBindings.specAtoms`, so the parser and the evaluator read the
 * same vocabulary for the same expression and cannot disagree about which
 * identifiers exist.
 */
export interface SpecAtomBindings {
  readonly vocabulary: SpecAtomVocabulary;
  readonly bound: readonly SpecAtomBinding[];
}

/**
 * The binding for one declared atom under one acting action, or `undefined`.
 *
 * ONE function, used by both the trace resolver and the world evaluator, so the
 * two cannot disagree about which binding answers.
 */
export function specAtomValueFor(
  bindings: SpecAtomBindings | undefined,
  key: string,
  currentActionToken: string | null,
): SpecAtomValue | undefined {
  if (bindings === undefined) return undefined;
  const declaration = bindings.vocabulary.lookup(key);
  if (declaration === null) return undefined;
  if (declaration.selfAddressing) {
    if (currentActionToken === null) return undefined;
    return bindings.bound.find((entry) => entry.key === key && entry.actionToken === currentActionToken)
      ?.value;
  }
  return bindings.bound.find((entry) => entry.key === key && entry.actionToken === null)?.value;
}
