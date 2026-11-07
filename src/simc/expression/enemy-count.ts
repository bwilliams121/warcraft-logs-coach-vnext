/**
 * Enemy counts as evaluator bindings (ONB-S3; agent/architecture.md "Owner decision (2026-11-05):
 * ONB-S3 enemy-set and target-count model").
 *
 * WHAT THIS MODULE DOES. It turns a count someone established from evidence into a
 * `NumericBinding`. It reads no event and knows no class, action or encounter. The evidence comes
 * from `src/engine/game-state/enemies/enemy-set.ts`, and this layer imports nothing from the
 * engine, so the shape is mirrored here structurally, as `active-dot.ts` does.
 *
 * WHY THE EVALUATOR NEEDS NOTHING NEW. A count is a whole number, so a two-sided range IS a finite
 * set of exact values, and the evaluator already decides those by the rule the owner asked for:
 * a comparison resolves only when every member decides it alike.
 *
 *     proven lower bound 4          >= 4 values only        active_enemies>=3   TRUE
 *     proven upper bound 2          { 0, 1, 2 }             active_enemies>=3   FALSE
 *     possible range 2 to 4         { 2, 3, 4 }             active_enemies>=3   UNKNOWN
 *     exactly 3                     3                       active_enemies>=3   TRUE
 *
 * No point inside a range is ever picked, and uncertainty never collapses into an exact value.
 *
 * `active_enemies` AND `spell_targets.<ability>` ARE DIFFERENT QUESTIONS. Nothing here aliases one
 * to the other. In the pinned simulation they coincide only because distance targeting is off
 * (action.cpp:3878-3887), which says nothing about geometry in a real encounter. So
 * `spell_targets.<ability>` binds only through an action-owned registration, or through the pinned
 * profile as tier 3 (SIMC-FB-A, `src/findings/simc-profile-fallback.ts`), where it is the engine's
 * constant under that profile and is disclosed as such. It is still never this count.
 */

import {
  boundedBelowNumber,
  knownNumber,
  oneOfNumbers,
  unknownNumber,
  type NumericBinding,
} from "./evaluate.js";
import type { SpecAtomBinding, SpecAtomBindings } from "./spec-vocabulary.js";

/** The enemy-set count, structurally. Never a point estimate unless both bounds meet. */
export type EnemyCountEvidence =
  | { readonly kind: "EXACT"; readonly count: number }
  | {
      readonly kind: "BOUNDED";
      /** A PROVEN lower bound. May be 0 only beside a proven upper bound. */
      readonly lowerBound: number;
      /** A PROVEN upper bound, or `null`: none established, which is not "no more enemies". */
      readonly upperBound: number | null;
    }
  | { readonly kind: "UNKNOWN"; readonly reason: string };

/** The identifier of the shared enemy-count atom. */
export const ACTIVE_ENEMIES_ATOM = "active_enemies";

/** The widest two-sided range bound as its members. A wider one keeps only its lower side. */
const MAX_ENUMERATED_RANGE = 64;

function isCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

/**
 * The canonical state of two proven bounds.
 *
 *     lower = upper      EXACT
 *     lower < upper      BOUNDED
 *     lower > upper      UNKNOWN: the two proofs contradict, and neither is believed
 *     nothing at all     UNKNOWN: a lower bound of zero with no upper bound says nothing
 */
export function enemyCountFromBounds(lowerBound: number, upperBound: number | null): EnemyCountEvidence {
  if (!isCount(lowerBound) || (upperBound !== null && !isCount(upperBound))) {
    return { kind: "UNKNOWN", reason: "BOUND_IS_NOT_A_COUNT" };
  }
  if (upperBound === null) {
    return lowerBound === 0
      ? { kind: "UNKNOWN", reason: "NO_POSITIVE_MEMBER" }
      : { kind: "BOUNDED", lowerBound, upperBound: null };
  }
  if (lowerBound > upperBound) return { kind: "UNKNOWN", reason: "BOUNDS_CONTRADICT" };
  if (lowerBound === upperBound) return { kind: "EXACT", count: lowerBound };
  return { kind: "BOUNDED", lowerBound, upperBound };
}

/** The binding for one count. Only what the evidence proves, and nothing between. */
export function enemyCountBinding(evidence: EnemyCountEvidence): NumericBinding {
  if (evidence.kind === "UNKNOWN") return unknownNumber("STATE_NOT_ESTABLISHED");
  const canonical =
    evidence.kind === "EXACT"
      ? enemyCountFromBounds(evidence.count, evidence.count)
      : enemyCountFromBounds(evidence.lowerBound, evidence.upperBound);
  if (canonical.kind === "UNKNOWN") return unknownNumber("STATE_NOT_ESTABLISHED");
  if (canonical.kind === "EXACT") return knownNumber(canonical.count);
  const { lowerBound, upperBound } = canonical;
  if (upperBound === null || upperBound - lowerBound > MAX_ENUMERATED_RANGE) {
    return lowerBound === 0
      ? unknownNumber("STATE_NOT_ESTABLISHED")
      : boundedBelowNumber(lowerBound, "STATE_NOT_ESTABLISHED");
  }
  return oneOfNumbers(
    Array.from({ length: upperBound - lowerBound + 1 }, (_, index) => lowerBound + index),
    "STATE_NOT_ESTABLISHED",
  );
}

/**
 * `specAtoms` with one atom's binding replaced, when the vocabulary declares it. An undeclared
 * identifier is left undeclared: a list that does not read a count gains nothing here.
 */
function withMagnitudeAtom(
  specAtoms: SpecAtomBindings,
  key: string,
  binding: NumericBinding,
): SpecAtomBindings {
  if (specAtoms.vocabulary.lookup(key) === null) return specAtoms;
  const replacement: SpecAtomBinding = { key, actionToken: null, value: { kind: "MAGNITUDE", binding } };
  return {
    vocabulary: specAtoms.vocabulary,
    bound: [...specAtoms.bound.filter((entry) => entry.key !== key), replacement],
  };
}

/** `specAtoms` with `active_enemies` read from the shared enemy-count evidence. */
export function withActiveEnemies(
  specAtoms: SpecAtomBindings,
  evidence: EnemyCountEvidence,
): SpecAtomBindings {
  return withMagnitudeAtom(specAtoms, ACTIVE_ENEMIES_ATOM, enemyCountBinding(evidence));
}

// ---------------------------------------------------------------------------
// spell_targets.<ability>
// ---------------------------------------------------------------------------

/** What one member of the shared candidate set is, for one action. Action-owned. */
export type ActionTargetVerdict = "APPLICABLE" | "NOT_APPLICABLE" | "UNKNOWN";

/**
 * One action's registered target applicability: targeting, range and geometry, as that action's
 * owner established them from named mechanics. Registering one is a positive claim. No production
 * action registers one yet, so every `spell_targets.<ability>` stays UNKNOWN.
 */
export interface ActionTargetApplicability<Member> {
  /** The SimulationCraft action token, the `<ability>` of `spell_targets.<ability>`. */
  readonly simcToken: string;
  /** Which pinned mechanics establish this. A registration without one is refused. */
  readonly provenance: string;
  verdictFor(member: Member): ActionTargetVerdict;
}

/** The count of one action's applicable targets: never the enemy count itself. */
export function spellTargetsEvidence<Member>(
  candidates: { readonly members: readonly Member[]; readonly count: EnemyCountEvidence },
  registration: ActionTargetApplicability<Member> | null,
): EnemyCountEvidence {
  if (registration === null) return { kind: "UNKNOWN", reason: "NO_ACTION_TARGET_REGISTRATION" };
  if (registration.provenance.length === 0)
    return { kind: "UNKNOWN", reason: "REGISTRATION_WITHOUT_PROVENANCE" };
  // An UNKNOWN candidate count is not a lower bound of its members: contradictory evidence stays UNKNOWN.
  if (candidates.count.kind === "UNKNOWN") return candidates.count;
  const verdicts = candidates.members.map((member) => registration.verdictFor(member));
  const applicable = verdicts.filter((verdict) => verdict === "APPLICABLE").length;
  const notApplicable = verdicts.filter((verdict) => verdict === "NOT_APPLICABLE").length;
  const candidateUpper =
    candidates.count.kind === "EXACT"
      ? candidates.count.count
      : candidates.count.kind === "BOUNDED"
        ? candidates.count.upperBound
        : null;
  return enemyCountFromBounds(applicable, candidateUpper === null ? null : candidateUpper - notApplicable);
}

/** `specAtoms` with `spell_targets.<token>` bound from one action's own evidence. */
export function withSpellTargets(
  specAtoms: SpecAtomBindings,
  simcToken: string,
  evidence: EnemyCountEvidence,
): SpecAtomBindings {
  return withMagnitudeAtom(specAtoms, `spell_targets.${simcToken}`, enemyCountBinding(evidence));
}
