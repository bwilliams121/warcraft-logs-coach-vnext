/**
 * The CURRENT real unsupported subject, in one place (M11-A2).
 *
 * WHAT THIS IS
 *
 * The one real Warcraft Logs identity every unsupported-path proof uses —
 * service refusal, public projection, REST, MCP, transport parity, raid-night
 * cells, corpus cases and the manual smoke checklist. Since ONB-X1 that has
 * been the Devastation Evoker of the committed A7R6 fight-7 capture, actor 11,
 * whose class and specialization are machine-pinned from the committed
 * fight-context artifact rather than typed from memory. From ONB-B1 to ONB-X1 it
 * was that fight's Fire Mage, actor 17, and from M10-D to ONB-B1 its Arms Warrior,
 * actor 4, each migrated on the day its specialization became an INTERNAL_ONLY
 * `SpecId`.
 *
 * WHY IT IS CENTRALIZED, AND WHY IT IS MILESTONE-SCOPED
 *
 * Before M11-A2 the same coordinates were spelled in a dozen tests. That is
 * harmless while the subject never changes and dangerous the moment it must:
 * Devastation Evoker is an ordinary DPS specialization and an onboarding
 * candidate (ONB-X2), so the day `evoker/devastation` becomes a `SpecId` —
 * INTERNAL_ONLY or PUBLIC — this subject stops being unsupported and every proof
 * that leans on it would be proving the wrong thing. The guard in
 * `tests/contracts/m11a2-unsupported-subject.test.ts` fails on that day, by
 * construction, naming this file as the thing to change. Migration is then
 * ONE edit here (a new identity from an already-committed context artifact
 * whose specialization is outside every current `SpecId`), plus the corpus
 * cases that pin the subject by coordinates, plus the smoke checklist.
 *
 * This subject is not permanent either: ONB-X2 onboards Devastation Evoker, and
 * the same guard will demand the same migration then. The fight still holds a
 * Beast Mastery Hunter, actor 20, so that migration need not leave this capture.
 * It is the fight's last one, and its `friendlySpecs` spelling, `BeastMastery`,
 * does not lower-case to its roster key, `hunter/beast_mastery`, so the guard's
 * spelling check will need that mapping.
 *
 * NO PRODUCTION CODE KNOWS THIS FIXTURE. It is imported by tests only; the
 * production/corpus purity guard forbids `tests/` imports from `src/`.
 */

export interface UnsupportedSubject {
  /** The committed capture the identity is proven from. */
  readonly reportCode: string;
  readonly fightId: number;
  readonly sourceId: number;
  /** The corpus artifact carrying the fight's master data (`masterData.actors`, `friendlySpecs`). */
  readonly contextArtifactId: string;
  /** What Warcraft Logs reports for the actor, verbatim. */
  readonly expectedClassName: string;
  readonly expectedSpecName: string;
  /**
   * The `<class>/<spec>` string the service reports for the unsupported
   * identity (`specNotSupported(observedSpecId)`). Deliberately typed as a
   * plain string: it is NOT a `SpecId`, and the guard proves it never is.
   */
  readonly observedSpecId: string;
  /** The milestone this subject is valid for. */
  readonly scopedToMilestone: "ONB";
  /** When the subject is expected to stop being unsupported, in prose. */
  readonly eligibilityNote: string;
}

export const CURRENT_UNSUPPORTED_SUBJECT: UnsupportedSubject = Object.freeze({
  reportCode: "A7R6kxPJ1hC8YQ4w",
  fightId: 7,
  sourceId: 11,
  contextArtifactId: "wcl-fight-context-a7r6-fight-7",
  expectedClassName: "Evoker",
  expectedSpecName: "Devastation",
  observedSpecId: "evoker/devastation",
  scopedToMilestone: "ONB",
  eligibilityNote:
    "Devastation Evoker is an ordinary onboarding candidate (ONB-X2). This subject must be migrated BEFORE 'evoker/devastation' is added to SpecId in any exposure.",
});

/** The identity pair in the shape `fixtureAnalysisRunner` and `resolveSpecIdentity` take. */
export const UNSUPPORTED_WCL_IDENTITY = Object.freeze({
  className: CURRENT_UNSUPPORTED_SUBJECT.expectedClassName,
  specName: CURRENT_UNSUPPORTED_SUBJECT.expectedSpecName,
});

/**
 * The corpus cases that pin the current unsupported subject by coordinates.
 * The manifest is declarative JSON and cannot import this module, so the
 * guard test reads these cases and asserts their `subject` equals the
 * fixture. Add a case here when it pins the subject; remove it when it no
 * longer does.
 */
export const UNSUPPORTED_SUBJECT_CORPUS_CASES: readonly string[] = Object.freeze([
  "application-service.devastation-evoker-subject-is-unsupported-on-the-same-evidence",
  "public-contract.analysis-parity-for-the-devastation-evoker-subject",
]);
