/**
 * The M9 regression-corpus contract: what an evidence artifact is, what a case
 * is allowed to claim about it, and who owns that claim.
 *
 * TWO THINGS, KEPT APART
 *
 *   ARTIFACT   bytes plus provenance. Where the evidence came from, what was
 *              done to it, and what it can therefore still prove.
 *
 *   CASE       a claim about an artifact, owned by ONE layer, expressed as
 *              validated assertion kinds from the registry below.
 *
 * One artifact may back many cases without its payload being duplicated. A case
 * may not assert a claim its owning layer does not own, and an assertion kind
 * that has no executor is DECLARED — it is validated and reported but it is
 * never counted as regression coverage.
 *
 * WHAT THIS FILE DELIBERATELY IS NOT
 *
 * Not a generic assertion language. Every assertion kind is a closed record
 * with a typed parameter schema, so a manifest can only ask a question the
 * harness already knows how to answer honestly. Adding a question means adding
 * a kind here, an executor beside it, and a test for both.
 *
 * Test-only machinery. Nothing under `src/` may import this directory; the
 * M9-A layering guard enforces that.
 */

import { z } from "zod";

import { UNKNOWN_REASONS } from "../../../src/engine/state/state-result.js";
import { RESOURCE_OBSERVATION_TIMINGS } from "../../../src/engine/resources/resource-observations.js";
import pinnedAssassinationApl from "../../../src/simc/data/rogue-assassination.apl.json";

// --------------------------------------------------------------------------
// Version and limits
// --------------------------------------------------------------------------

/**
 * The only manifest contract version this loader understands.
 *
 * A manifest carrying any other value is rejected outright. Migration is an
 * explicit act with its own review, never a silent best-effort read.
 */
export const CORPUS_CONTRACT_VERSION = 1;

/**
 * Storage ceilings, in canonical bytes (see `canonicalBytesOf` in the loader).
 *
 * Repository evidence: the largest committed slice today is the M5-D2 decision
 * corpus at ~226 KB (1,083 events), and every committed fixture together is
 * ~470 KB. A raw full-fight page run is tens of megabytes and is never
 * committed — it lives in gitignored `.probe/`. The per-artifact ceiling keeps
 * room for a D2-sized slice with headroom while refusing a raw capture; the
 * corpus ceiling bounds what `import.meta.glob` eagerly bundles into a test
 * module and what a clone has to carry. Both are checked from measured byte
 * lengths and nothing else, so the answer is the same on every machine.
 */
export const MAX_ARTIFACT_BYTES = 512 * 1024;
export const MAX_CORPUS_BYTES = 6 * 1024 * 1024;

// --------------------------------------------------------------------------
// Vocabularies
// --------------------------------------------------------------------------

/**
 * A metadata value that was NOT recorded, and why.
 *
 * Three different facts, never collapsed into `null`:
 *
 * - `UNAVAILABLE`     the capture could have recorded it and did not. Remedy: a
 *                     re-capture with better tooling.
 * - `REDACTED`        it was recorded and deliberately removed for publication.
 *                     It exists; it is not here.
 * - `NOT_APPLICABLE`  the field has no meaning for this artifact (a synthetic
 *                     payload has no report code).
 */
export const UNRECORDED_MARKERS = ["UNAVAILABLE", "REDACTED", "NOT_APPLICABLE"] as const;
export type UnrecordedMarker = (typeof UNRECORDED_MARKERS)[number];

const unrecorded = z.enum(UNRECORDED_MARKERS);
const recordedInt = z.union([z.number().int(), unrecorded]);
const recordedString = z.union([z.string().min(1), unrecorded]);
/** `YYYY-MM-DD`, or a marker. A capture date is corpus metadata, never analyzer output. */
const recordedDate = z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), unrecorded]);

/**
 * What an artifact's bytes ARE, in lineage terms.
 *
 * - `REAL_CAPTURE`         bytes exactly as Warcraft Logs returned them. Zero
 *                          transformations. None is committed today: raw output
 *                          is gitignored and only reviewed slices enter the
 *                          repository.
 * - `SANITIZED_CAPTURE`    a real capture after documented sanitization —
 *                          selection, redaction, remapping. Every event in it
 *                          was observed; some observed events may be absent.
 * - `DERIVED_FROM_CAPTURE` a capture that was deliberately CHANGED to construct
 *                          a condition. It is not evidence that the condition
 *                          ever occurred. Must name its parent.
 * - `SYNTHETIC`            hand-authored. No capture lineage at all.
 *
 * Classification reflects lineage, not resemblance. A mutated capture that
 * still looks like Warcraft Logs output is DERIVED, never SANITIZED.
 */
export const PROVENANCE_KINDS = [
  "REAL_CAPTURE",
  "SANITIZED_CAPTURE",
  "DERIVED_FROM_CAPTURE",
  "SYNTHETIC",
] as const;
export type ProvenanceKind = (typeof PROVENANCE_KINDS)[number];

/**
 * What was done to the bytes on the way from the source capture to this file.
 *
 * `SUBSET_SELECTION`, `IDENTIFIER_REMAP` and `FIELD_REDACTION` are sanitization:
 * every retained event was observed. `VALUE_MUTATION`, `EVENT_INJECTION` and
 * `EVENT_REMOVAL` are derivation: the result describes something that was not
 * observed. `CREDENTIAL_SHAPE_SCAN` changes nothing and is listed so the check
 * is on record. `LEGACY_FIXTURE_COPY` records a byte-identical copy from
 * `tests/fixtures/`, kept while both locations exist.
 */
export const TRANSFORMATION_KINDS = [
  "SUBSET_SELECTION",
  "IDENTIFIER_REMAP",
  "FIELD_REDACTION",
  "VALUE_MUTATION",
  "EVENT_INJECTION",
  "EVENT_REMOVAL",
  "CREDENTIAL_SHAPE_SCAN",
  "LEGACY_FIXTURE_COPY",
] as const;
export type TransformationKind = (typeof TRANSFORMATION_KINDS)[number];

const SANITIZING_TRANSFORMATIONS: ReadonlySet<TransformationKind> = new Set([
  "SUBSET_SELECTION",
  "IDENTIFIER_REMAP",
  "FIELD_REDACTION",
]);
const DERIVING_TRANSFORMATIONS: ReadonlySet<TransformationKind> = new Set([
  "VALUE_MUTATION",
  "EVENT_INJECTION",
  "EVENT_REMOVAL",
]);

export function isSanitizingTransformation(kind: TransformationKind): boolean {
  return SANITIZING_TRANSFORMATIONS.has(kind);
}
export function isDerivingTransformation(kind: TransformationKind): boolean {
  return DERIVING_TRANSFORMATIONS.has(kind);
}

/**
 * Claims a transformation takes away. Recorded ON the transformation, so a
 * reviewer can see what a slice can no longer prove without re-deriving it.
 *
 * - `WINDOW_COVERAGE`        the artifact no longer covers any contiguous
 *                            report-time range, so absence within a range is
 *                            unprovable from it.
 * - `ABSENCE_PROOF`          "the actor never did X" cannot be said from it.
 * - `CROSS_EVENT_CONTINUITY` "nothing happened between A and B" cannot be said.
 * - `PAGINATION_BEHAVIOUR`   the page boundary evidence is gone; a normalized
 *                            or sliced artifact cannot prove a raw pagination
 *                            behaviour whose evidence it no longer contains.
 * - `OBSERVED_BEHAVIOUR`     the content is no longer what Warcraft Logs
 *                            returned. Only derivation carries this.
 * - `ORIGINAL_IDENTIFIERS`   ids were remapped; nothing may be cross-referenced
 *                            against the live report by id.
 */
export const INVALIDATED_CLAIMS = [
  "WINDOW_COVERAGE",
  "ABSENCE_PROOF",
  "CROSS_EVENT_CONTINUITY",
  "PAGINATION_BEHAVIOUR",
  "OBSERVED_BEHAVIOUR",
  "ORIGINAL_IDENTIFIERS",
] as const;
export type InvalidatedClaim = (typeof INVALIDATED_CLAIMS)[number];

/** How the loader reads an artifact's bytes. Structure only — never combat validity. */
export const PAYLOAD_ENCODINGS = ["JSON", "RAW_TEXT"] as const;
export type PayloadEncoding = (typeof PAYLOAD_ENCODINGS)[number];

/**
 * What shape a JSON artifact must parse to. A STRUCTURAL check: an event array
 * must be an array, a decoded GraphQL `data` object must be an object. Whether
 * the events inside are well-formed combat evidence is the analyzer's question,
 * and a case about malformed input needs the loader to accept the file.
 */
export const PAYLOAD_KINDS = ["WCL_EVENT_ARRAY", "WCL_GRAPHQL_DATA", "JSON_VALUE", "RAW_TEXT"] as const;
export type PayloadKind = (typeof PAYLOAD_KINDS)[number];

/**
 * The layer that owns a case's claim. Each maps to source roots so the
 * ownership is checkable, not a label.
 */
export const OWNING_LAYERS = {
  WCL_TRANSPORT: ["src/wcl/"],
  NORMALIZATION: ["src/engine/normalization/", "src/engine/evidence/"],
  COMBAT_STATE: ["src/engine/state/", "src/engine/auras/", "src/engine/resources/", "src/engine/game-state/"],
  SPEC_ASSASSINATION: ["src/specs/rogue/", "src/simc/"],
  APPLICATION_SERVICE: ["src/services/", "src/runtime/"],
  PUBLIC_CONTRACT: ["src/contracts/", "src/api/", "src/mcp/"],
} as const;
export type OwningLayer = keyof typeof OWNING_LAYERS;
export const OWNING_LAYER_IDS = Object.keys(OWNING_LAYERS) as readonly OwningLayer[];

/**
 * What kind of outcome an assertion pins.
 *
 * `UNKNOWN` and `NO_AUTHORITY_AVAILABLE` are listed separately and stay
 * separate: one is an evidence condition, the other a missing standard, and no
 * assertion kind may accept either in place of the other.
 */
export const OUTCOME_CLASSES = [
  "POSITIVE_FACT",
  "NEGATIVE_FACT",
  "UNKNOWN",
  "NO_AUTHORITY_AVAILABLE",
  "UNSUPPORTED",
  "REJECTION",
  "PARITY",
] as const;
export type OutcomeClass = (typeof OUTCOME_CLASSES)[number];

/**
 * What an expected outcome rests on. Copying current output is not on the
 * list, on purpose.
 */
export const RATIONALE_BASES = ["OWNED_CONTRACT", "VALIDATED_EVIDENCE", "PINNED_AUTHORITY"] as const;
export type RationaleBasis = (typeof RATIONALE_BASES)[number];

// --------------------------------------------------------------------------
// Assertion registry
// --------------------------------------------------------------------------

/**
 * `EXECUTABLE` kinds have an executor in `executors.ts` and count as coverage.
 * `DECLARED` kinds are validated, reported, and NOT counted — they exist so a
 * manifest can name a claim a later checkpoint will make executable, without
 * that claim silently reading as tested today.
 */
export type AssertionExecution = "EXECUTABLE" | "DECLARED";

export interface AssertionKindDefinition {
  readonly owningLayer: OwningLayer;
  readonly outcomeClass: OutcomeClass;
  /** Artifact payload kinds this assertion can be asked about. */
  readonly payloadKinds: readonly PayloadKind[];
  readonly params: z.ZodType;
  readonly execution: AssertionExecution;
  /** Whether the case must pin an authority revision for the claim to mean anything. */
  readonly requiresAuthority: boolean;
  readonly description: string;
}

const actorAbsence = z.enum(["NOT_SUPPLIED", "NO_ACTOR_SENTINEL", "UNUSABLE_VALUE"]);

/**
 * Where in the artifact an assertion looks.
 *
 * Raw-index addressing is acceptable here and nowhere else in this repository,
 * because a corpus artifact is digest-pinned: its positions cannot move without
 * the manifest failing. Prefer a fact locator whenever one exists.
 */
const rawEventSelector = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("EVERY_EVENT") }).strict(),
  z.object({ kind: z.literal("RAW_INDEX"), index: z.number().int().nonnegative() }).strict(),
]);

export const ASSERTION_KINDS = {
  "NORMALIZATION.EVENT_COUNT_PRESERVED": {
    owningLayer: "NORMALIZATION",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ expectedEventCount: z.number().int().nonnegative() }).strict(),
    execution: "EXECUTABLE",
    requiresAuthority: false,
    description:
      "Every raw event becomes exactly one normalized event, with zero malformed observations and zero malformed envelopes. Nothing is dropped, merged or deduplicated.",
  },
  "NORMALIZATION.SOURCE_ABSENCE": {
    owningLayer: "NORMALIZATION",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ selector: rawEventSelector, absence: actorAbsence }).strict(),
    execution: "EXECUTABLE",
    requiresAuthority: false,
    description:
      "The selected normalized event(s) carry a null source and exactly this `sourceAbsence` reason. A RAW_INDEX selector addresses the normalized position, which equals the raw index only when every raw event normalizes — pair it with EVENT_COUNT_PRESERVED.",
  },
  "NORMALIZATION.NO_ACTOR_REF_HOLDS": {
    owningLayer: "NORMALIZATION",
    outcomeClass: "NEGATIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int() }).strict(),
    execution: "EXECUTABLE",
    requiresAuthority: false,
    description: "No normalized ActorRef anywhere in the output holds this actor id.",
  },
  "NORMALIZATION.UNSUPPORTED_TYPE_COUNTED": {
    owningLayer: "NORMALIZATION",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ rawType: z.string().min(1), count: z.number().int().positive() }).strict(),
    execution: "EXECUTABLE",
    requiresAuthority: false,
    description:
      "An unrecognised raw type string is preserved as an UNSUPPORTED_TYPE event and counted, never dropped and never coerced into a known family.",
  },
  "COMBAT_STATE.LAST_OBSERVED_CAST_UNKNOWN": {
    owningLayer: "COMBAT_STATE",
    outcomeClass: "UNKNOWN",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        abilityGameId: z.number().int().nullable(),
        reason: z.enum(UNKNOWN_REASONS),
      })
      .strict(),
    execution: "EXECUTABLE",
    requiresAuthority: false,
    description:
      "Asked for the last COMPLETE cast at the end of the artifact, the state layer answers UNKNOWN with exactly this reason. It must not answer `null` (a proven absence).",
  },
  "COMBAT_STATE.RESOURCE_OBSERVATION_ON_CAST": {
    owningLayer: "COMBAT_STATE",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        abilityGameId: z.number().int(),
        reportTimeMs: z.number().int(),
        resourceWireType: z.number().int(),
        expected: z
          .object({
            observedAmount: z.number(),
            observedMax: z.number().nullable(),
            observedCost: z.number().nullable(),
            timing: z.enum(RESOURCE_OBSERVATION_TIMINGS),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    requiresAuthority: false,
    description:
      "The resource snapshot attached to one observed COMPLETE cast, located by (actor, ability, report time), is EXACT and carries these verbatim values and this timing.",
  },
  "WCL_DECODE.EVENT_PAGE_OUTCOME": {
    owningLayer: "WCL_TRANSPORT",
    outcomeClass: "REJECTION",
    payloadKinds: ["WCL_GRAPHQL_DATA"],
    params: z
      .object({
        expected: z.enum(["DECODE_FAILED", "REPORT_NOT_ACCESSIBLE", "MALFORMED_PAGINATOR", "PAGE"]),
      })
      .strict(),
    execution: "EXECUTABLE",
    requiresAuthority: false,
    description:
      "The event-page decoder classifies this decoded GraphQL `data` object exactly so. A null or non-array payload must be MALFORMED_PAGINATOR, never an empty PAGE.",
  },
  "PUBLIC_CONTRACT.REST_MCP_PARITY": {
    owningLayer: "PUBLIC_CONTRACT",
    outcomeClass: "PARITY",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ surface: z.enum(["ANALYSIS", "RAID_NIGHT", "ENCOUNTER_CONTEXT"]) }).strict(),
    execution: "DECLARED",
    requiresAuthority: false,
    description:
      "DECLARED for M9-B: the REST and MCP projections of one analysis over this artifact are equal. Not executable in M9-A and not counted as coverage.",
  },
  "SPEC_ASSASSINATION.DECISION_COVERAGE": {
    owningLayer: "SPEC_ASSASSINATION",
    outcomeClass: "UNKNOWN",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        targetActorId: z.number().int(),
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        expectedCoverage: z.enum(["EXACT_ENTRY", "UNKNOWN"]),
      })
      .strict(),
    execution: "DECLARED",
    requiresAuthority: true,
    description:
      "DECLARED for M9-B: the M5-D2 decision-coverage verdict for one observed cast under the pinned authority. Requires the case to pin the authority revision and name the state evidence the verdict needs.",
  },
} as const satisfies Record<string, AssertionKindDefinition>;

export type AssertionKind = keyof typeof ASSERTION_KINDS;
export const ASSERTION_KIND_IDS = Object.keys(ASSERTION_KINDS) as readonly AssertionKind[];

export function assertionKindDefinition(kind: AssertionKind): AssertionKindDefinition {
  return ASSERTION_KINDS[kind];
}

// --------------------------------------------------------------------------
// Pinned authorities a case may reference
// --------------------------------------------------------------------------

/**
 * Read from the committed artifacts, never typed here. A case pinned to a
 * revision that is no longer the committed one is STALE and is rejected: an
 * expectation verified under one rotation is not evidence about another.
 */
export const PINNED_AUTHORITY_REVISIONS: Readonly<Record<string, string>> = {
  [pinnedAssassinationApl.authorityId]: pinnedAssassinationApl.artifactRevision,
};

// --------------------------------------------------------------------------
// Manifest schema
// --------------------------------------------------------------------------

const identifier = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, "lowercase, digits, `.` and `-` only");

const reportTimeRange = z
  .object({ fromReportTimeMs: z.number().int(), toReportTimeMs: z.number().int() })
  .strict();

/** The retrieval that produced the SOURCE capture. Records what was asked, verbatim. */
const captureQuery = z
  .object({
    dataType: z.literal("All"),
    hostilityType: z.literal("OMITTED"),
    actorFilter: z.literal("NONE"),
    includeResources: z.boolean(),
    limit: recordedInt,
    startTimeMs: recordedInt,
    endTimeMs: recordedInt,
  })
  .strict();

/**
 * Pagination and completeness evidence for the SOURCE capture — the thing the
 * artifact was cut from. Coordinates alone do not establish completeness, so
 * the actual page facts are recorded, and `evidence` says where they are
 * written down.
 */
const sourceCaptureCompleteness = z
  .object({
    eventsReturned: recordedInt,
    pagesRetrieved: recordedInt,
    /** Verbatim from the last page. `null` is a terminal page; a number is a truncated prefix. */
    nextPageTimestamp: z.union([z.number().int(), z.null(), unrecorded]),
    state: z.enum(["COMPLETE", "PARTIAL", "ABSENT", "UNAVAILABLE"]),
    evidence: z.string().min(1),
  })
  .strict();

const toolingIdentity = z
  .object({
    name: z.string().min(1),
    revision: recordedString,
    invocation: recordedString,
  })
  .strict();

const captureSource = z
  .object({
    reportCode: recordedString,
    fightId: recordedInt,
    /** The report revision at capture. A re-export renumbers positions. */
    reportRevision: recordedInt,
    sourceActorId: recordedInt,
    encounterId: recordedInt,
    difficulty: recordedInt,
    capturedOn: recordedDate,
    gameVersion: recordedInt,
    logVersion: recordedInt,
    ingestionScope: z.enum(["PLAYER_CONTEXT", "FULL_RAID", "UNAVAILABLE"]),
    query: captureQuery,
    completeness: sourceCaptureCompleteness,
    captureTooling: toolingIdentity,
    /** Where the raw capture is, if anywhere. Raw output is gitignored and is normally NOT retained. */
    rawCaptureRetained: z.literal(false),
    rawCaptureLocation: recordedString,
  })
  .strict();

const transformation = z
  .object({
    kind: z.enum(TRANSFORMATION_KINDS),
    tooling: toolingIdentity,
    detail: z.string().min(1),
    invalidates: z.array(z.enum(INVALIDATED_CLAIMS)),
  })
  .strict();

/**
 * What the ARTIFACT still covers, after every transformation. Only these
 * ranges may be granted as coverage when a case builds a fight from it; a
 * slice with no retained range can prove no absence.
 */
const retainedCoverage = z
  .object({
    ranges: z.array(reportTimeRange),
    basis: z.string().min(1),
  })
  .strict();

const provenanceSchema = z
  .object({
    kind: z.enum(PROVENANCE_KINDS),
    /** Required for DERIVED_FROM_CAPTURE; must be null for SYNTHETIC. */
    parentArtifactId: identifier.nullable(),
    /**
     * Required for REAL and SANITIZED captures. Null for SYNTHETIC, and null
     * for DERIVED — a derivation reaches its source through its parent chain
     * rather than restating it, so there is one copy of every capture fact.
     */
    source: captureSource.nullable(),
    transformations: z.array(transformation),
    retainedCoverage,
    retainedFor: z.string().min(1),
    limitations: z.array(z.string().min(1)),
  })
  .strict();

const artifactSchema = z
  .object({
    artifactId: identifier,
    /** Relative to the corpus root, forward slashes, under `artifacts/`. */
    path: z.string().min(1),
    encoding: z.enum(PAYLOAD_ENCODINGS),
    payloadKind: z.enum(PAYLOAD_KINDS),
    /** Over canonical bytes. Proves identity — not authenticity, not completeness. */
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    byteLength: z.number().int().nonnegative(),
    provenance: provenanceSchema,
  })
  .strict();

const assertionSchema = z
  .object({
    kind: z.string().min(1),
    params: z.unknown(),
  })
  .strict();

const authorityReference = z
  .object({
    authorityId: z.string().min(1),
    artifactRevision: z.string().min(1),
    /** The reconstructed state the verdict depends on. Named so a reviewer can check it is in the artifact. */
    requiredStateEvidence: z.array(z.string().min(1)).min(1),
  })
  .strict();

const caseSchema = z
  .object({
    caseId: identifier,
    artifactId: identifier,
    owningLayer: z.enum(OWNING_LAYER_IDS as [OwningLayer, ...OwningLayer[]]),
    contractUnderTest: z.string().min(1),
    /** Descriptive. Never executed. */
    purpose: z.string().min(1),
    /** Executed, when the kind is EXECUTABLE. */
    assertions: z.array(assertionSchema).min(1),
    rationale: z.object({ basis: z.array(z.enum(RATIONALE_BASES)).min(1), text: z.string().min(1) }).strict(),
    authority: authorityReference.nullable(),
    limitations: z.array(z.string().min(1)),
    /** Existing tests this case is connected to. Documentation; not resolved by the loader. */
    relatedTests: z.array(z.string().min(1)),
  })
  .strict();

export const manifestSchema = z
  .object({
    contractVersion: z.number().int(),
    corpusId: identifier,
    artifacts: z.array(artifactSchema),
    cases: z.array(caseSchema),
  })
  .strict();

export type CorpusManifest = z.infer<typeof manifestSchema>;
export type CorpusArtifactRecord = CorpusManifest["artifacts"][number];
export type CorpusCaseRecord = CorpusManifest["cases"][number];
export type CorpusProvenance = CorpusArtifactRecord["provenance"];
export type CorpusTransformation = CorpusProvenance["transformations"][number];
export type CorpusAssertion = CorpusCaseRecord["assertions"][number];
