/**
 * What Warcraft Logs said about a pull's version, and what that does NOT prove.
 *
 * THE CORRECTION THIS MODULE EXISTS TO ENFORCE
 *
 * M8-A found, by live measurement, that `gameVersion` was `1` on our own report
 * AND on three external reports from different guilds in different weeks, and
 * that `logVersion` was `17` on all of them. So equal values in those fields do
 * not discriminate builds, and the field that ranking surfaces actually key on
 * is `partition` — whose boundaries M8-A never observed a pull straddling.
 *
 * THE INVERSE INFERENCE THAT WAS MADE HERE, AND IS NOT VALID
 *
 * An earlier revision of this module read that evidence and concluded that a
 * DIFFERENCE in `gameVersion` or `logVersion` establishes incompatibility. That
 * does not follow, and the error is worth naming because it is easy to repeat.
 *
 * What was observed is that equality fails to discriminate. The logical content
 * of that observation is exactly:
 *
 *     equal values  =>  nothing follows
 *
 * It says nothing whatever about the other direction. "Equality proves nothing"
 * and "difference proves something" are independent propositions, and no
 * measurement in M8-A tested the second one. Nobody has compared two pulls
 * across a `logVersion` change and shown the comparison to be unsound; the field
 * might well track a client build that leaves every fact this domain compares
 * untouched. Asserting INCOMPATIBLE from it would be a confident verdict resting
 * on an inference nobody made.
 *
 * So at the M8-B evidence level NONE of the three raw fields concludes anything,
 * in either direction. The values, the differing list and the unresolved list
 * all remain factual evidence and are reported; they simply cannot produce a
 * verdict yet.
 *
 * The consequence is deliberate and is not a defect: EVERY cross-report pair
 * currently resolves to version compatibility UNKNOWN — whether its raw fields
 * are equal or different — and therefore to UNKNOWN overall. External comparison
 * stays fail-closed until a later checkpoint proves a semantics. That is the
 * honest state of the evidence.
 *
 * HOW SAME-REPORT COMPARISON STILL WORKS
 *
 * By provenance identity rather than by field equality. Two fights carrying the
 * same report code AND the same report revision came out of ONE Warcraft Logs
 * export, so they share one `masterData` — one `logVersion`, one `gameVersion`,
 * one client build — as a matter of construction rather than of inference. That
 * is a different and much stronger argument than "these two numbers are equal",
 * and it is the one `SAME_REPORT_REVISION` records.
 *
 * Both halves of that check are required. Revision numbers are small integers
 * that collide across unrelated reports constantly — M8-A observed revisions 22,
 * 10 and 29 on three different external reports — so revision alone identifies
 * nothing.
 *
 * HOW A LATER CHECKPOINT STRENGTHENS THIS WITHOUT A REWRITE
 *
 * By flipping a flag in `VERSION_FIELD_INTERPRETATIONS` once the semantics are
 * actually established. The algorithm below already reads those flags
 * generically; it has no special case for any particular field, and no caller
 * needs to change.
 */

import type { DimensionCompatibility } from "./dimension.js";
import { COMPARISON_EVIDENCE_CLASS, type ComparisonEvidence } from "./evidence-class.js";

/**
 * The version-bearing fields Warcraft Logs supplies.
 *
 * DECLARATION ORDER IS THE CANONICAL ORDER for every array this module returns.
 * It is alphabetical, which is arbitrary but fixed and asserted — the point is
 * that it never depends on the iteration order of an untyped upstream payload.
 */
export const VERSION_FIELDS = ["gameVersion", "logVersion", "partition"] as const;

export type VersionField = (typeof VERSION_FIELDS)[number];

/**
 * One pull's observed version fields. Observation only, no conclusion.
 *
 * Every field is nullable and `null` means exactly one thing: Warcraft Logs
 * supplied no value here. It is never a default, never a sentinel, and never
 * "the same as the other pull".
 *
 * `partition` is nullable for a second reason worth stating: it is not on
 * `ReportFight` at all. M8-A observed it on the ranking surfaces, which are
 * untyped JSON, so a pull built from typed fields alone legitimately has none.
 */
export interface PullVersionEvidence {
  /** `masterData.gameVersion`. Measured non-discriminating between builds. */
  readonly gameVersion: number | null;
  /** `masterData.logVersion`. The combat-log format version. */
  readonly logVersion: number | null;
  /** Observed on ranking payloads only. NOT a proven patch identity. */
  readonly partition: number | null;
}

/**
 * What this project has actually ESTABLISHED about one field's semantics.
 *
 * Two independent one-way permissions, because the two directions have
 * genuinely different evidentiary requirements and a single boolean would
 * silently grant both.
 */
export interface VersionFieldInterpretation {
  /** May two equal values be read as evidence that the pulls are compatible? */
  readonly equalityEstablishesCompatibility: boolean;
  /** May two unequal values be read as evidence that they are not? */
  readonly differenceEstablishesIncompatibility: boolean;
}

/**
 * The pinned interpretations. EVERY FLAG IS FALSE, IN BOTH DIRECTIONS, FOR ALL
 * THREE FIELDS.
 *
 * That is the whole point of the module and it is not an oversight or a stub.
 * The evidence M8-A gathered supports exactly one proposition per field —
 * "equality does not discriminate" for `gameVersion` and `logVersion`, and
 * "never observed" for `partition` — and none of those licenses a verdict:
 *
 * - `gameVersion` — measured `1` across reports plainly from different guilds,
 *   servers and weeks. Equality demonstrably fails to discriminate. Whether a
 *   DIFFERENCE would matter to any fact this domain compares was never tested.
 *
 * - `logVersion` — measured `17` on every report M8-A touched. Same position:
 *   equality discriminates nothing, and the meaning of a difference is untested.
 *
 * - `partition` — M8-A never observed two pulls across a partition boundary, so
 *   neither direction has any established meaning at all.
 *
 * WHY A TABLE OF FALSE INSTEAD OF DELETING THE MACHINERY
 *
 * Because the shape is the reviewable unit. Enabling an interpretation later is
 * then a one-line diff against a named field and a named direction, visible in
 * review, guarded by a freeze test that must be edited in the same change. The
 * alternative — no registry, and a hard-coded rule appearing in the algorithm
 * when somebody needs it — is how the incorrect `gameVersion` inference got in
 * here in the first place.
 *
 * THE ASYMMETRY TO REMEMBER WHEN ENABLING ONE
 *
 * Permitting a DIFFERENCE to conclude makes comparisons rarer; permitting
 * EQUALITY to conclude makes them commoner. Only the second can manufacture a
 * comparison the evidence does not support — but the first is not free either,
 * because it manufactures a confident REFUSAL, which is just as much a claim.
 * Both require evidence. Neither has it yet.
 */
export const VERSION_FIELD_INTERPRETATIONS: Readonly<Record<VersionField, VersionFieldInterpretation>> =
  Object.freeze({
    gameVersion: Object.freeze({
      equalityEstablishesCompatibility: false,
      differenceEstablishesIncompatibility: false,
    }),
    logVersion: Object.freeze({
      equalityEstablishesCompatibility: false,
      differenceEstablishesIncompatibility: false,
    }),
    partition: Object.freeze({
      equalityEstablishesCompatibility: false,
      differenceEstablishesIncompatibility: false,
    }),
  });

/**
 * Why the version conclusion came out the way it did.
 *
 * `FIELD_SEMANTICS_UNPROVEN` is the honest default and, today, the answer for
 * every cross-report pair. It says the fields were read and none of them was
 * permitted to conclude anything — NOT that the fields were missing.
 */
export type VersionCompatibilityBasis =
  /** One export, therefore one client build. Provenance identity, not equality. */
  | "SAME_REPORT_REVISION"
  /**
   * Two pulls claim one export and disagree about a version field.
   *
   * NOT an incompatibility. See `assessVersionCompatibility`.
   */
  | "EVIDENCE_CONTRADICTION"
  /** A field whose difference is decisive was observed to differ. Unreachable today. */
  | "OBSERVED_FIELD_DIFFERENCE"
  /** Every field permitted to establish compatibility was resolved and equal. Unreachable today. */
  | "OBSERVED_FIELD_EQUALITY"
  /** Fields were read; none is currently permitted to conclude anything. */
  | "FIELD_SEMANTICS_UNPROVEN";

export const VERSION_COMPATIBILITY_BASES = [
  "SAME_REPORT_REVISION",
  "EVIDENCE_CONTRADICTION",
  "OBSERVED_FIELD_DIFFERENCE",
  "OBSERVED_FIELD_EQUALITY",
  "FIELD_SEMANTICS_UNPROVEN",
] as const satisfies readonly VersionCompatibilityBasis[];

export interface VersionCompatibilityAssessment extends ComparisonEvidence {
  readonly compatibility: DimensionCompatibility;
  readonly basis: VersionCompatibilityBasis;
  /**
   * Fields both pulls supplied, with unequal values. Canonical order.
   *
   * Reported whether or not the difference was permitted to conclude anything,
   * so a reader can see the observation that the interpretation declined to use.
   */
  readonly differingFields: readonly VersionField[];
  /** Fields at least one pull did not supply. Canonical order. Disjoint from above. */
  readonly unresolvedFields: readonly VersionField[];
}

/**
 * The narrow shape the version question needs.
 *
 * Structural rather than an import of `PullIdentity`, which keeps this module a
 * leaf: `pull-identity.ts` depends on this one, and a mutual import would be a
 * cycle for no benefit. A `PullIdentity` satisfies it by construction.
 */
export interface VersionComparisonSubject {
  readonly reportCode: string;
  readonly reportRevision: number;
  readonly version: PullVersionEvidence;
}

export function assessVersionCompatibility(
  subject: VersionComparisonSubject,
  reference: VersionComparisonSubject,
): VersionCompatibilityAssessment {
  const differingFields: VersionField[] = [];
  const unresolvedFields: VersionField[] = [];

  // One pass in canonical order, so both arrays are ordered by construction
  // rather than by a sort that could later be dropped.
  for (const field of VERSION_FIELDS) {
    const left = subject.version[field];
    const right = reference.version[field];
    if (left === null || right === null) {
      unresolvedFields.push(field);
      continue;
    }
    if (left !== right) {
      differingFields.push(field);
    }
  }

  const assessment = (
    compatibility: DimensionCompatibility,
    basis: VersionCompatibilityBasis,
  ): VersionCompatibilityAssessment => ({
    evidenceClass: COMPARISON_EVIDENCE_CLASS,
    compatibility,
    basis,
    differingFields,
    unresolvedFields,
  });

  // ---- The one proven positive basis, and the only branch that can return
  // ---- COMPATIBLE today.
  //
  // One report, one revision, one export, one masterData.
  //
  // Both halves are required. Revision numbers collide freely across unrelated
  // reports, so revision alone would let two strangers claim a shared build.
  if (subject.reportCode === reference.reportCode && subject.reportRevision === reference.reportRevision) {
    // Two pulls that claim ONE export and disagree about a version field.
    //
    // THIS IS NOT AN INCOMPATIBILITY, AND CALLING IT ONE WOULD BE A SECOND
    // OVERCLAIM. It does not establish two incompatible gameplay worlds; it
    // establishes that the evidence in front of us cannot all be true at once.
    // One export has one `masterData`, so either the provenance pair is wrong or
    // a version field is. We do not know which, and that is precisely an UNKNOWN.
    //
    // Only a genuine disagreement counts. A field only one side supplied lands
    // in `unresolvedFields` and is not a contradiction — absence is not
    // disagreement, and the provenance basis does not depend on the fields
    // anyway.
    if (differingFields.length > 0) {
      return assessment("UNKNOWN", "EVIDENCE_CONTRADICTION");
    }
    return assessment("COMPATIBLE", "SAME_REPORT_REVISION");
  }

  // ---- Cross-report. Both branches below are currently UNREACHABLE BY DESIGN,
  // ---- because every flag in the registry is false in both directions.
  //
  // They are written generically, with no per-field special case, so that a
  // later checkpoint which actually proves a field's semantics enables it by
  // editing the registry — a reviewable one-line change guarded by a freeze
  // test — rather than by adding a rule here.
  const decisiveDifference = differingFields.some(
    (field) => VERSION_FIELD_INTERPRETATIONS[field].differenceEstablishesIncompatibility,
  );
  if (decisiveDifference) {
    return assessment("INCOMPATIBLE", "OBSERVED_FIELD_DIFFERENCE");
  }

  const establishing = VERSION_FIELDS.filter(
    (field) => VERSION_FIELD_INTERPRETATIONS[field].equalityEstablishesCompatibility,
  );
  const establishedByEquality =
    establishing.length > 0 &&
    establishing.every((field) => !unresolvedFields.includes(field) && !differingFields.includes(field));
  if (establishedByEquality) {
    return assessment("COMPATIBLE", "OBSERVED_FIELD_EQUALITY");
  }

  // The answer for every cross-report pair today, whether its raw fields are
  // equal or different. Read, and permitted to conclude nothing. Not "missing" —
  // `differingFields` and `unresolvedFields` carry what was actually seen.
  return assessment("UNKNOWN", "FIELD_SEMANTICS_UNPROVEN");
}
