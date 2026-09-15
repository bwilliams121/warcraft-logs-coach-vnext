/**
 * The brand that keeps comparison context out of authority results.
 *
 * WHY A BRAND AND NOT A COMMENT
 *
 * M5 answers one question — did the pinned SimulationCraft authority select the
 * action this player actually took — and it answers in a three-valued
 * vocabulary that means something specific:
 *
 *     MATCH      authority-compatible, and nothing more
 *     REJECTED   the authority positively established the observed action
 *                was not selectable
 *     UNKNOWN    the analyzer could not prove either
 *
 * Comparison context answers a completely different question: what else was
 * observed, in this pull or another one. Another player's log is evidence about
 * that player. It is never evidence about whether THIS player's action was
 * selectable, because no ruleset was consulted.
 *
 * The danger is not that somebody writes `outcome: "REJECTED"` in a comparison
 * module on purpose. It is that two result types with similar shapes get
 * collected into one list "for reporting", and a descriptive difference ends up
 * rendered in the same column as an authority verdict. After that the product
 * says "you should have pressed X" because somebody else pressed X, and every
 * rule in CLAUDE.md about top logs not being rotational authority has been
 * defeated by a convenience.
 *
 * So every result type this domain exports carries this literal field. Two
 * differently-branded records cannot be collected into one homogeneous array
 * without a type error, and the mistake has to be made deliberately and in
 * writing rather than by accident.
 *
 * THIS IS THE WEAKER OF THE TWO MECHANISMS, DELIBERATELY STATED
 *
 * The strong one is structural and lives in the module graph: this domain never
 * receives a `CombatState`, a `CombatFight`, a `FightAnalysis`, an
 * `ObservedActionComparison` or anything from `src/simc/`, so it holds nothing
 * it could mint a verdict about. `tests/contracts/m8b-comparison-layering.test.ts`
 * asserts that in both directions. The brand is the second line, for the case
 * where two already-produced results meet downstream.
 *
 * NOTHING IN THE AUTHORITY LAYER WAS CHANGED TO ACCOMMODATE THIS. Authority
 * types carry no counterpart field and were not touched. A brand that required
 * editing the thing it protects would not be much of a protection.
 */

/**
 * The only evidence class this domain can produce.
 *
 * Deliberately a single-member union rather than an enum with an `AUTHORITY`
 * sibling. There is no value of this type that means "authority", so a
 * comparison result cannot be relabelled into one by assignment.
 */
export const COMPARISON_EVIDENCE_CLASS = "COMPARISON_CONTEXT";

export type ComparisonEvidenceClass = typeof COMPARISON_EVIDENCE_CLASS;

/**
 * Implemented by every result type this domain exports.
 *
 * A reader asking "can this thing judge a player?" gets the answer from the
 * type, not from the surrounding prose.
 */
export interface ComparisonEvidence {
  readonly evidenceClass: ComparisonEvidenceClass;
}
