/**
 * Evidence CAPABILITY — can the selected Warcraft Logs source supply a category
 * at all?
 *
 * This is orthogonal to coverage. Coverage describes how much of the requested
 * evidence we obtained; capability describes whether that evidence is something
 * Warcraft Logs emits in the first place. Conflating them produces the
 * fail-open default this module exists to prevent:
 *
 *     a fully retrieved All stream containing zero targetability events
 *     is NOT "targetability: COMPLETE"
 *
 * Two rules govern every entry below.
 *
 * 1. CAPABILITY IS NEVER INFERRED FROM A FIGHT'S CONTENTS.
 *    Observing zero events of a kind does not downgrade capability, and
 *    observing one does not upgrade it. Capability changes only when a
 *    committed registry entry changes, and only with cited evidence. Runtime
 *    inference from event counts is the same error as inferring absence from
 *    missing data.
 *
 * 2. EVIDENCE IS DIRECTIONAL.
 *    A sanitized capture can positively establish OBSERVABLE. Absence of a
 *    category from any number of captures establishes NOTHING — we may simply
 *    have captured fights where it never occurred. NOT_OBSERVABLE requires
 *    authoritative NEGATIVE evidence that the source cannot provide the
 *    category. Without that, capability stays UNVERIFIED.
 *
 * Rule 2 is enforced structurally: `CapabilityRecord` is a discriminated union
 * in which the NOT_OBSERVABLE branch accepts only negative evidence, so a
 * capture cannot be used to construct it.
 */

export type EvidenceCategory =
  | "CASTS"
  | "AURAS"
  | "RESOURCES"
  | "DAMAGE"
  | "HEALING"
  | "ABSORBS"
  | "DEATHS"
  | "INTERRUPTS"
  | "DISPELS"
  | "SUMMONS"
  | "COMBATANT_INFO"
  | "ACTORS"
  | "ABILITIES"
  | "ENCOUNTER_PHASES"
  | "TARGETABILITY"
  | "TALENTS"
  | "GEAR";

export const EVIDENCE_CATEGORIES = [
  "CASTS",
  "AURAS",
  "RESOURCES",
  "DAMAGE",
  "HEALING",
  "ABSORBS",
  "DEATHS",
  "INTERRUPTS",
  "DISPELS",
  "SUMMONS",
  "COMBATANT_INFO",
  "ACTORS",
  "ABILITIES",
  "ENCOUNTER_PHASES",
  "TARGETABILITY",
  "TALENTS",
  "GEAR",
] as const satisfies readonly EvidenceCategory[];

export type EvidenceCapability = "OBSERVABLE" | "NOT_OBSERVABLE" | "UNVERIFIED";

/**
 * Which Warcraft Logs surface a category would come from.
 *
 * `TYPED_GRAPHQL_FIELD_PER_ACTOR` IS NOT A SUBTYPE OF `TYPED_GRAPHQL_FIELD`.
 * It is the one surface whose result depends on an actor argument, and keeping
 * it separate is what lets retrieval say WHO a typed answer was obtained for.
 *
 * The distinction is load-bearing rather than tidy. A fight is retrieved once
 * and viewed per player; every other typed field on that round trip —
 * `phaseTransitions`, `Report.phases` — is the same answer for everyone, so one
 * retrieval vouches for everyone. `talentImportCode(actorID:)` is not: it was
 * asked about exactly one actor, and for every other player it was not asked at
 * all.
 *
 * Without the split, a category sourced from a per-actor field would inherit the
 * coverage of the round trip that happened to carry it, and a player it was
 * never requested for would be reported as having complete typed evidence. That
 * is a well-formed false statement, which is the kind this project fails closed
 * against. See `focusedFightFor` in
 * `../engine/normalization/fight-core.ts`.
 */
export type RetrievalSource =
  "EVENTS_ALL_STREAM" | "TYPED_GRAPHQL_FIELD" | "TYPED_GRAPHQL_FIELD_PER_ACTOR" | "REPORT_MASTER_DATA";

/**
 * Evidence that a category IS obtainable.
 *
 * `SCHEMA_TYPED_FIELD` is the strongest: a typed, non-JSON GraphQL field is
 * part of the frozen schema, so its existence is established without a capture.
 * `SANITIZED_CAPTURE` cites a committed fixture in which the category was
 * actually observed.
 */
export type PositiveCapabilityEvidence =
  | { readonly kind: "SCHEMA_TYPED_FIELD"; readonly graphqlPath: string; readonly verifiedOn: string }
  | { readonly kind: "SANITIZED_CAPTURE"; readonly fixtureId: string; readonly capturedOn: string }
  | ArchivedCaptureEvidence;

/**
 * The two committed evidence ROOTS a citation may name (M11-F, owner decision
 * N3). `SANITIZED_CAPTURE` above cites the REGRESSION_CORPUS, as it always
 * has; `ARCHIVED_CAPTURE` cites the EVIDENCE_ARCHIVE explicitly, by root, by
 * the archive's manifest identity, by fixture id and by the fixture's SHA-256
 * over canonical bytes, so the claim is auditable against immutable bytes. It
 * is never a path and never an arbitrary file: a contract test resolves every
 * citation against the committed root it names and refuses any mismatch.
 */
export type EvidenceRoot = "REGRESSION_CORPUS" | "EVIDENCE_ARCHIVE";

export interface ArchivedCaptureEvidence {
  readonly kind: "ARCHIVED_CAPTURE";
  readonly evidenceRoot: "EVIDENCE_ARCHIVE";
  /** The archive manifest's own identity (`corpusId`). */
  readonly archiveId: string;
  readonly fixtureId: string;
  /** SHA-256 of the fixture's canonical bytes, as the archive manifest records it. */
  readonly fixtureSha256: string;
  readonly capturedOn: string;
}

/** The committed evidence archive's manifest identity. */
export const EVIDENCE_ARCHIVE_ID = "warcraft-logs-coach-vnext.evidence-archive";

/**
 * The archived segment that carries the first committed raw `death` event
 * (M11-E2.1: report b1PmaKrd6CDfzngc fight 48, actor 45 instance 1 at
 * 7,449,399). Cited by the `death` family and by the DEATHS capability.
 */
export const DEATH_EVENT_EVIDENCE: ArchivedCaptureEvidence = {
  kind: "ARCHIVED_CAPTURE",
  evidenceRoot: "EVIDENCE_ARCHIVE",
  archiveId: EVIDENCE_ARCHIVE_ID,
  fixtureId: "wcl-blood-death-knight-b1pm-full-fight-owned-pets.seg-0-45",
  fixtureSha256: "f823cb5a1e28ec0f348e726a8c7b949e49b7769d24f79fc9199116eff1ff0ff1",
  capturedOn: "2026-10-06",
};

/**
 * Evidence that a category is NOT obtainable from a source.
 *
 * Deliberately hard to satisfy. Failing to see something is not listed here,
 * because failing to see something is not evidence that it cannot be seen.
 *
 * `SCHEMA_ENUM_EXHAUSTIVE` applies when the source's schema exhaustively
 * enumerates what it can return and the category is absent from it.
 * `DOCUMENTED_UNSUPPORTED` applies when Warcraft Logs documents the limitation.
 */
export type NegativeCapabilityEvidence =
  | { readonly kind: "SCHEMA_ENUM_EXHAUSTIVE"; readonly graphqlPath: string; readonly verifiedOn: string }
  | { readonly kind: "DOCUMENTED_UNSUPPORTED"; readonly citation: string; readonly verifiedOn: string };

/**
 * One category's capability against one source.
 *
 * The union shape is the enforcement mechanism for rule 2: there is no way to
 * build a NOT_OBSERVABLE record out of a capture, because that branch's
 * `evidence` field does not accept one.
 */
export type CapabilityRecord =
  | {
      readonly capability: "OBSERVABLE";
      readonly retrievalSource: RetrievalSource;
      readonly evidence: PositiveCapabilityEvidence;
      readonly logVersionObserved: number | null;
      readonly gameVersionObserved: number | null;
    }
  | {
      readonly capability: "NOT_OBSERVABLE";
      readonly retrievalSource: RetrievalSource;
      readonly evidence: NegativeCapabilityEvidence;
    }
  | {
      readonly capability: "UNVERIFIED";
      readonly retrievalSource: RetrievalSource;
      /** What would settle it. Keeps an unverified entry actionable. */
      readonly whatWouldVerify: string;
    };

function unverified(retrievalSource: RetrievalSource, whatWouldVerify: string): CapabilityRecord {
  return { capability: "UNVERIFIED", retrievalSource, whatWouldVerify };
}

function observableFromSchema(
  retrievalSource: RetrievalSource,
  graphqlPath: string,
  verifiedOn: string,
): CapabilityRecord {
  return {
    capability: "OBSERVABLE",
    retrievalSource,
    evidence: { kind: "SCHEMA_TYPED_FIELD", graphqlPath, verifiedOn },
    logVersionObserved: null,
    gameVersionObserved: null,
  };
}

/** The date the public schema was read to establish the typed-field entries. */
const SCHEMA_VERIFIED_ON = "2026-09-11";

/** The date the sanitized event captures were taken. */
const CAPTURED_ON = "2026-09-11";

/**
 * Log/game version of the capture that established the event-stream entries.
 *
 * Recorded so a future log on a different parser version can be recognised as
 * outside what this evidence actually covers.
 */
const CAPTURE_LOG_VERSION = 17;
const CAPTURE_GAME_VERSION = 1;

function observableFromCapture(fixtureId: string): CapabilityRecord {
  return {
    capability: "OBSERVABLE",
    retrievalSource: "EVENTS_ALL_STREAM",
    evidence: { kind: "SANITIZED_CAPTURE", fixtureId, capturedOn: CAPTURED_ON },
    logVersionObserved: CAPTURE_LOG_VERSION,
    gameVersionObserved: CAPTURE_GAME_VERSION,
  };
}

const PULL_WINDOW = "wcl-pull-window-with-resources";
const MIDFIGHT_WINDOW = "wcl-midfight-window";

/**
 * The committed capability registry.
 *
 * Entries sourced from the non-frozen `Report.events` JSON become OBSERVABLE
 * only when a sanitized capture is committed and cited here. Categories not
 * observed in any capture stay UNVERIFIED.
 *
 * TARGETABILITY is the case worth reading twice. It is absent from
 * `EventDataType`, absent from the RpgLogs scripting-API event interface list,
 * and was not observed in either capture — including a mid-fight window with
 * 5,010 events across 21 types. All of that is suggestive, and suggestive is
 * not authoritative. None of it proves the All stream cannot carry it: the
 * captured encounter has two phases and neither is an intermission, so there
 * may simply have been nothing to report.
 *
 * It therefore stays UNVERIFIED rather than NOT_OBSERVABLE, and any future
 * probe that fails to observe targetability events must leave it UNVERIFIED
 * too. Absence of observation is not evidence of absence of capability.
 */
export const EVIDENCE_CAPABILITY_REGISTRY: Readonly<Record<EvidenceCategory, CapabilityRecord>> = {
  ACTORS: observableFromSchema("REPORT_MASTER_DATA", "Report.masterData.actors", SCHEMA_VERIFIED_ON),
  ABILITIES: observableFromSchema("REPORT_MASTER_DATA", "Report.masterData.abilities", SCHEMA_VERIFIED_ON),
  ENCOUNTER_PHASES: observableFromSchema(
    "TYPED_GRAPHQL_FIELD",
    "ReportFight.phaseTransitions + Report.phases",
    SCHEMA_VERIFIED_ON,
  ),
  // PER-ACTOR, and that is the whole point of the source it cites. The field
  // takes an `actorID` argument, so one retrieval answers for one player. The
  // capability claim — "Warcraft Logs can supply this" — is unchanged and still
  // rests on the frozen schema; what the source records is that COVERAGE of it
  // has to be established per player rather than per round trip.
  TALENTS: observableFromSchema(
    "TYPED_GRAPHQL_FIELD_PER_ACTOR",
    "ReportFight.talentImportCode(actorID:)",
    SCHEMA_VERIFIED_ON,
  ),

  CASTS: observableFromCapture(PULL_WINDOW),
  AURAS: observableFromCapture(PULL_WINDOW),
  RESOURCES: observableFromCapture(PULL_WINDOW),
  DAMAGE: observableFromCapture(PULL_WINDOW),
  HEALING: observableFromCapture(PULL_WINDOW),
  SUMMONS: observableFromCapture(PULL_WINDOW),
  COMBATANT_INFO: observableFromCapture(PULL_WINDOW),
  GEAR: observableFromCapture(PULL_WINDOW),
  ABSORBS: observableFromCapture(MIDFIGHT_WINDOW),

  // M11-F: POSITIVE death events only. The capability is that Warcraft Logs
  // CAN emit a `death` event, observed in the archived M11-E2 capture. It is
  // NOT that every real death, defeat or despawn produces one: the same
  // capture holds a killed boss with no death event. Coverage of this
  // category therefore means only "every death event the retrieved stream
  // emitted in the range was retrieved" (`DEATH_EVENTS_RETRIEVED_COMPLETE` in
  // `death-state.ts`), never that an actor without one was alive.
  DEATHS: {
    capability: "OBSERVABLE",
    retrievalSource: "EVENTS_ALL_STREAM",
    evidence: DEATH_EVENT_EVIDENCE,
    logVersionObserved: CAPTURE_LOG_VERSION,
    gameVersionObserved: CAPTURE_GAME_VERSION,
  },
  INTERRUPTS: unverified(
    "EVENTS_ALL_STREAM",
    "A sanitized capture containing an interrupt event. Neither captured window contained one.",
  ),
  DISPELS: unverified(
    "EVENTS_ALL_STREAM",
    "A sanitized capture containing a dispel event. Neither captured window contained one.",
  ),
  TARGETABILITY: unverified(
    "EVENTS_ALL_STREAM",
    "A sanitized capture containing a targetability event, ideally from an encounter with a real intermission. Absence from any capture leaves this UNVERIFIED — it never establishes NOT_OBSERVABLE.",
  ),
};

export function capabilityOf(category: EvidenceCategory): CapabilityRecord {
  return EVIDENCE_CAPABILITY_REGISTRY[category];
}

/**
 * The only sanctioned way to turn capture observations into capability.
 *
 * Its return type cannot express NOT_OBSERVABLE. That is the point: this is the
 * function a future capture-driven registry update would use, and it is
 * incapable of concluding "Warcraft Logs cannot supply this" from the fact that
 * a capture did not contain it.
 */
export function capabilityFromCapture(
  observed: boolean,
  retrievalSource: RetrievalSource,
  evidence: PositiveCapabilityEvidence,
  whatWouldVerify: string,
): Extract<CapabilityRecord, { capability: "OBSERVABLE" | "UNVERIFIED" }> {
  if (!observed) {
    return unverified(retrievalSource, whatWouldVerify) as Extract<
      CapabilityRecord,
      { capability: "UNVERIFIED" }
    >;
  }
  return {
    capability: "OBSERVABLE",
    retrievalSource,
    evidence,
    logVersionObserved: null,
    gameVersionObserved: null,
  };
}
