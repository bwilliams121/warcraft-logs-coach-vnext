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
import { TALENT_SELECTIONS } from "../../../src/data/game/rogue-talents.js";
import {
  COMPARISON_BASES,
  COMPARISON_OUTCOMES,
} from "../../../src/specs/rogue/assassination/observed-comparison.js";
import {
  DECISION_BLOCKER_CLASSES,
  DECISION_COVERAGES,
} from "../../../src/specs/rogue/assassination/decision-coverage.js";
import { RETRIEVAL_OUTCOME_REASONS } from "../../../src/engine/evidence/coverage.js";
import pinnedAssassinationApl from "../../../src/simc/data/rogue-assassination.apl.json";
import pinnedRogueDotDurations from "../../../src/data/game/rogue-dot-durations.json";
import pinnedProtectionApl from "../../../src/simc/data/paladin-protection.apl.json";
import { AUTHORITY_DOMAINS, AUTHORITY_RESOLUTION_OUTCOMES } from "../../../src/findings/authority-domain.js";
import { PROTECTION_EXCLUSION_REASONS } from "../../../src/specs/paladin/protection/observed-analysis.js";

// --------------------------------------------------------------------------
// Version and limits
// --------------------------------------------------------------------------

/**
 * The only manifest contract version this loader understands.
 *
 * A manifest carrying any other value is rejected outright. Migration is an
 * explicit act with its own review, never a silent best-effort read.
 *
 * VERSION HISTORY
 *
 * 1  M9-A. `retainedCoverage` was a flat list of report-time ranges applied to
 *    every category and every actor alike.
 * 2  M9-B. `retainedCoverage.grants[]`, each naming its own categories, actor
 *    scope and ranges; the `WCL_GRAPHQL_PAGE_SEQUENCE` payload kind. A
 *    version-1 manifest is NOT a valid version-2 manifest — a flat range would
 *    have to be assigned to categories and actors it never named — so the
 *    number moved. That is what the field is for: the meaning of a manifest is
 *    fixed by its version, and a structural change that kept the number would
 *    make the number say nothing.
 *
 * No version-1 corpus exists outside this repository, so there is no
 * migration layer: a version-1 manifest is rejected with an explicit error
 * that says to regenerate it (`scripts/corpus/build-manifest.mjs`).
 *
 * M9-C added to version 2 WITHOUT bumping it, because every addition is
 * compatible — an M9-B manifest is still a valid version-2 manifest with the
 * same meaning: an optional `performanceContext` on a capture source, a
 * capture-only `{ sourceId }` actor filter alongside `"NONE"`, and new
 * assertion kinds. A change that would give an existing manifest a different
 * meaning is what moves the number.
 */
export const CORPUS_CONTRACT_VERSION = 2;

/** Versions this loader knows to be obsolete, and why. Named in the rejection. */
export const OBSOLETE_CONTRACT_VERSIONS: Readonly<Record<number, string>> = {
  1: "version 1 (M9-A) carried flat retained-coverage ranges; version 2 carries per-category, per-actor-scope grants. Regenerate the manifest with scripts/corpus/build-manifest.mjs.",
};

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
export const PAYLOAD_KINDS = [
  "WCL_EVENT_ARRAY",
  "WCL_GRAPHQL_DATA",
  /** A JSON array of decoded GraphQL `data` objects, one per page response, in retrieval order. */
  "WCL_GRAPHQL_PAGE_SEQUENCE",
  "JSON_VALUE",
  "RAW_TEXT",
] as const;
export type PayloadKind = (typeof PAYLOAD_KINDS)[number];

/**
 * The layer that owns a case's claim. Each maps to source roots so the
 * ownership is checkable, not a label.
 *
 * EVERY ROOT BELONGS TO EXACTLY ONE LAYER. A root listed under two layers
 * would let one case's claim be counted as coverage of two things, and would
 * leave "who owns a change here" with two answers. `assertOwnershipRootsDisjoint`
 * refuses overlap and nesting at load time; the M9-A layering test pins the
 * same fact statically.
 *
 * The shared decision engine (`src/simc/`) is therefore ITS OWN layer, not a
 * root of either specialization: it is specialization-neutral by contract
 * (`m10c-cross-spec-isolation`), and a Protection case that exercised it would
 * otherwise have read as Assassination coverage, and vice versa.
 */
export const OWNING_LAYERS = {
  WCL_TRANSPORT: ["src/wcl/"],
  NORMALIZATION: ["src/engine/normalization/", "src/engine/evidence/"],
  COMBAT_STATE: ["src/engine/state/", "src/engine/auras/", "src/engine/resources/", "src/engine/game-state/"],
  /** The specialization-neutral APL parsing, evaluation and first-scan engine. */
  SHARED_DECISION_ENGINE: ["src/simc/"],
  SPEC_ASSASSINATION: ["src/specs/rogue/"],
  /** M10-C. The internal Protection Paladin evaluator and nothing else. */
  SPEC_PROTECTION_PALADIN: ["src/specs/paladin/"],
  APPLICATION_SERVICE: ["src/services/", "src/runtime/"],
  PUBLIC_CONTRACT: ["src/contracts/", "src/api/", "src/mcp/"],
} as const;
export type OwningLayer = keyof typeof OWNING_LAYERS;
export const OWNING_LAYER_IDS = Object.keys(OWNING_LAYERS) as readonly OwningLayer[];

/**
 * Refuses an ownership map in which any root is repeated, or is a prefix of
 * another root (which would make the nested one owned twice). Returns the
 * problems rather than throwing so a test can pin the exact message.
 */
export function ownershipRootProblems(
  layers: Readonly<Record<string, readonly string[]>> = OWNING_LAYERS,
): readonly string[] {
  const problems: string[] = [];
  const owners = new Map<string, string>();
  for (const [layer, roots] of Object.entries(layers)) {
    for (const root of roots) {
      const previous = owners.get(root);
      if (previous !== undefined) problems.push(`root ${root} is owned by both ${previous} and ${layer}`);
      owners.set(root, layer);
    }
  }
  const entries = [...owners.entries()];
  for (const [root, layer] of entries) {
    for (const [other, otherLayer] of entries) {
      if (root !== other && other.startsWith(root)) {
        problems.push(`root ${other} (${otherLayer}) is nested under ${root} (${layer})`);
      }
    }
  }
  return problems;
}

export function assertOwnershipRootsDisjoint(): void {
  const problems = ownershipRootProblems();
  if (problems.length > 0) throw new Error(`OWNING_LAYERS is not a partition: ${problems.join("; ")}`);
}
assertOwnershipRootsDisjoint();

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

/**
 * Where an executor can run.
 *
 * `ANY` runs under plain Node and under workerd alike. `WORKERD` drives the
 * real Worker or MCP handler, whose bearer-auth uses a Workers-only primitive,
 * and must run in the `workers` Vitest project. The harness refuses to select
 * a WORKERD kind under Node BEFORE executing anything — a missing runtime API
 * is an execution-environment mismatch, never a semantic result.
 */
export type ExecutionRuntime = "ANY" | "WORKERD";

export interface AssertionKindDefinition {
  readonly owningLayer: OwningLayer;
  readonly outcomeClass: OutcomeClass;
  /** Artifact payload kinds this assertion can be asked about. */
  readonly payloadKinds: readonly PayloadKind[];
  readonly params: z.ZodType;
  readonly execution: AssertionExecution;
  readonly runtime: ExecutionRuntime;
  /** Whether the case must pin an authority revision for the claim to mean anything. */
  readonly requiresAuthority: boolean;
  readonly description: string;
}

const actorAbsence = z.enum(["NOT_SUPPLIED", "NO_ACTOR_SENTINEL", "UNUSABLE_VALUE"]);
const actorSide = z.enum(["SOURCE", "TARGET"]);
const auraClass = z.enum(["BUFF", "DEBUFF"]);
const unknownReason = z.enum(UNKNOWN_REASONS);

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

/** A COMPLETE cast located by fact. The executor asserts the match is unique. */
const observedCastLocator = z
  .object({ actorId: z.number().int(), reportTimeMs: z.number().int(), abilityGameId: z.number().int() })
  .strict();

/**
 * A temporal position a state question is asked at, by fact.
 *
 * `BEFORE_CAST` is the instant before an observed cast — the decision point.
 * `END_OF_TIMESTAMP` is after everything on a millisecond.
 */
const temporalLocator = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("BEFORE_CAST"), cast: observedCastLocator }).strict(),
  z.object({ kind: z.literal("END_OF_TIMESTAMP"), reportTimeMs: z.number().int() }).strict(),
]);

const auraIdentity = z
  .object({
    targetActorId: z.number().int(),
    abilityGameId: z.number().int(),
    auraClass,
    /** `null` asks about any source. A number asks about one source actor. */
    sourceActorId: z.number().int().nullable(),
  })
  .strict();

const expectedUnknown = z.object({ certainty: z.literal("UNKNOWN"), reason: unknownReason }).strict();

/** One authority entry by its SimulationCraft-native coordinates. */
const aplEntryRef = z
  .object({
    listName: z.string().min(1),
    priorityOrdinal: z.number().int().nonnegative(),
    actionToken: z.string().min(1),
  })
  .strict();

export const ASSERTION_KINDS = {
  // ---- NORMALIZATION -------------------------------------------------------
  "NORMALIZATION.EVENT_COUNT_PRESERVED": {
    owningLayer: "NORMALIZATION",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ expectedEventCount: z.number().int().nonnegative() }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "Every raw event becomes exactly one normalized event, with zero malformed observations and zero malformed envelopes. Nothing is dropped, merged or deduplicated.",
  },
  "NORMALIZATION.INPUT_ORDER_PRESERVED": {
    owningLayer: "NORMALIZATION",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({}).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The normalized sequence carries the raw timestamps in the raw order, position for position, with strictly ascending ingestion ordinals. No global sort, no reordering within a timestamp.",
  },
  "NORMALIZATION.TIMESTAMP_RUN_RETAINED": {
    owningLayer: "NORMALIZATION",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ reportTimeMs: z.number().int(), count: z.number().int().positive() }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "Exactly this many normalized events share this report timestamp. Equal timestamps are distinct events and are never collapsed.",
  },
  "NORMALIZATION.ALL_TYPES_RECOGNISED": {
    owningLayer: "NORMALIZATION",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({}).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "Every raw type in the artifact is an evidence-backed contract: zero unsupported types, zero malformed family events, zero malformed observations or envelopes, zero degraded categories.",
  },
  "NORMALIZATION.SOURCE_ABSENCE": {
    owningLayer: "NORMALIZATION",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ selector: rawEventSelector, absence: actorAbsence }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The selected normalized event(s) carry a null source and exactly this `sourceAbsence` reason. A RAW_INDEX selector addresses the normalized position, which equals the raw index only when every raw event normalizes — pair it with EVENT_COUNT_PRESERVED.",
  },
  "NORMALIZATION.SIDE_REFERENCE": {
    owningLayer: "NORMALIZATION",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        index: z.number().int().nonnegative(),
        side: actorSide,
        expected: z.discriminatedUnion("kind", [
          z
            .object({
              kind: z.literal("ACTOR"),
              actorId: z.number().int(),
              instanceId: z.number().int().nullable(),
            })
            .strict(),
          z.object({ kind: z.literal("ABSENT"), absence: actorAbsence }).strict(),
        ]),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "One side of the normalized event at a raw index is exactly this actor reference (actor 0 included) or exactly this absence. Direction is read from the verified field names, never inferred.",
  },
  "NORMALIZATION.ATTACHED_RESOURCE_SIDE": {
    owningLayer: "NORMALIZATION",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({ index: z.number().int().nonnegative(), expectedSide: z.enum(["SOURCE", "TARGET", "NONE"]) })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The flattened resource snapshot on the event at a raw index is bound to the side `resourceActor` names, and to that side's actor. NONE means the event carries no attached snapshot.",
  },
  "NORMALIZATION.EVENT_FACTS": {
    owningLayer: "NORMALIZATION",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        /** The event, by fact: report time, raw type, and the actor sides as captured. */
        at: z
          .object({
            reportTimeMs: z.number().int(),
            rawType: z.string().min(1),
            sourceActorId: z.number().int().nullable(),
            targetActorId: z.number().int().nullable(),
            abilityGameId: z.number().int().nullable(),
          })
          .strict(),
        expected: z
          .object({
            kind: z.string().min(1),
            /** Normalized fields by dotted path (`length` reads an array's length), compared by JSON equality. Scalars only. */
            fields: z.record(z.string(), z.union([z.number(), z.string(), z.boolean(), z.null()])),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "Exactly one normalized event matches the (report time, raw type, source, target, ability) locator, it has this normalized kind, and each named top-level field carries exactly this value. A damage, healing or absorb fact is read from the event that carries it — never aggregated, never interpreted.",
  },
  "NORMALIZATION.ACTOR_EVENT_CENSUS": {
    owningLayer: "NORMALIZATION",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        side: actorSide,
        /** Normalized kind -> count of events whose named side is the actor. Exact and exhaustive. */
        expected: z.record(z.string(), z.number().int().nonnegative()),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The normalized events whose SOURCE (or TARGET) is this actor number exactly this many per kind, and no other kind appears. A census of what the slice holds for the actor — what it retained, not what happened.",
  },
  "NORMALIZATION.NO_ACTOR_REF_HOLDS": {
    owningLayer: "NORMALIZATION",
    outcomeClass: "NEGATIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int() }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description: "No normalized ActorRef anywhere in the output holds this actor id.",
  },
  "NORMALIZATION.UNSUPPORTED_TYPE_COUNTED": {
    owningLayer: "NORMALIZATION",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ rawType: z.string().min(1), count: z.number().int().positive() }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "An unrecognised raw type string is preserved as an UNSUPPORTED_TYPE event and counted, never dropped and never coerced into a known family.",
  },

  // ---- WCL_TRANSPORT -------------------------------------------------------
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
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The event-page decoder classifies this decoded GraphQL `data` object exactly so. A null or non-array payload must be MALFORMED_PAGINATOR, never an empty PAGE.",
  },
  "WCL_PAGINATION.STREAM_OUTCOME": {
    owningLayer: "WCL_TRANSPORT",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_GRAPHQL_PAGE_SEQUENCE"],
    params: z
      .object({
        plan: z
          .object({
            startTimeMs: z.number().int(),
            endTimeMs: z.number().int(),
            limit: z.number().int().positive(),
          })
          .strict(),
        expected: z
          .object({
            state: z.enum(["COMPLETE", "PARTIAL", "ABSENT"]),
            reason: z.enum(RETRIEVAL_OUTCOME_REASONS),
            pagesRetrieved: z.number().int().nonnegative(),
            eventsRetrieved: z.number().int().nonnegative(),
            /** The `startTime` variable sent on each request, in order. Cursor verbatim, no offset. */
            requestedStartTimes: z.array(z.number().int()),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The real paginator, fed these page responses in order through a fake fetch, ends with exactly this completeness and requested each page at exactly these start times. Proves verbatim `nextPageTimestamp`, no deduplication, and fail-closed on a malformed page.",
  },

  // ---- COMBAT_STATE --------------------------------------------------------
  "COMBAT_STATE.LAST_OBSERVED_CAST_PROVEN_ABSENT": {
    owningLayer: "COMBAT_STATE",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        abilityGameId: z.number().int(),
        at: temporalLocator,
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "Asked for the last COMPLETE cast of this ability by this actor at or before the locator, the state layer answers EXACT null — a PROVEN absence, earned by COMPLETE CASTS coverage for the actor from the fight start to the locator. The positive form of the absence gate: the only way 'never cast' is ever said.",
  },
  "COMBAT_STATE.LAST_OBSERVED_CAST_UNKNOWN": {
    owningLayer: "COMBAT_STATE",
    outcomeClass: "UNKNOWN",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        abilityGameId: z.number().int().nullable(),
        reason: unknownReason,
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "Asked for the last COMPLETE cast at the end of the artifact, the state layer answers UNKNOWN with exactly this reason. It must not answer `null` (a proven absence).",
  },
  "COMBAT_STATE.LAST_OBSERVED_CAST_AT": {
    owningLayer: "COMBAT_STATE",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        abilityGameId: z.number().int(),
        at: temporalLocator,
        expectedReportTimeMs: z.number().int(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The last observed COMPLETE cast of this ability by this actor, at or before the locator, is EXACT and is the cast at this report time. An observation, needing no coverage.",
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
        expected: z.union([
          z
            .object({
              certainty: z.literal("EXACT"),
              observedAmount: z.number(),
              observedMax: z.number().nullable(),
              observedCost: z.number().nullable(),
              timing: z.enum(RESOURCE_OBSERVATION_TIMINGS),
            })
            .strict(),
          expectedUnknown,
        ]),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The resource snapshot attached to one observed COMPLETE cast, located by (actor, ability, report time), is EXACT with these verbatim values and this timing — or UNKNOWN for exactly this reason. A cast carrying no entry for the resource is NO_OBSERVATION, never zero.",
  },
  "COMBAT_STATE.LATEST_RESOURCE_OBSERVATION": {
    owningLayer: "COMBAT_STATE",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        resourceWireType: z.number().int(),
        at: temporalLocator,
        expected: z
          .object({
            certainty: z.enum(["EXACT", "STALE"]),
            observedAmount: z.number(),
            observedAtReportTimeMs: z.number().int(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The latest resource observation at or before the locator is the one at this report time with this verbatim amount — STALE when earlier than the query. Nothing is regenerated, interpolated or replayed to produce a later value.",
  },
  "COMBAT_STATE.AURA_PRESENCE": {
    owningLayer: "COMBAT_STATE",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        aura: auraIdentity,
        at: temporalLocator,
        expected: z.union([
          z
            .object({
              certainty: z.literal("EXACT"),
              presence: z.enum(["ACTIVE", "INACTIVE"]),
              anchorReportTimeMs: z.number().int(),
            })
            .strict(),
          expectedUnknown,
        ]),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "Derived aura presence at the locator rests on exactly this observed transition, or is UNKNOWN for exactly this reason. Silence never reads as INACTIVE and a source is never inferred.",
  },
  "COMBAT_STATE.ACTOR_INDEX_CENSUS": {
    owningLayer: "COMBAT_STATE",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        side: actorSide,
        /** Normalized kind -> count of positions the M4 source/target index yields for the actor. */
        expected: z.record(z.string(), z.number().int().nonnegative()),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "M4's positionsBySourceActor / positionsByTargetActor for this actor yields exactly these kinds in these counts, each position resolving to an event whose named side is the actor. The index exposes damage taken, healing received and absorbs as observed events with locators; no view aggregates them.",
  },
  "COMBAT_STATE.AURA_STACK_OBSERVATION": {
    owningLayer: "COMBAT_STATE",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        aura: auraIdentity,
        at: temporalLocator,
        expected: z
          .object({
            rawType: z.string().min(1),
            observedStacks: z.number().int(),
            reportTimeMs: z.number().int(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The latest stack-bearing transition at or before the locator is this event with this verbatim `stack` value — the absolute resulting count after its own transition, never a delta.",
  },

  // ---- SPEC_ASSASSINATION --------------------------------------------------
  "SPEC_ASSASSINATION.DECISION_COVERAGE": {
    owningLayer: "SPEC_ASSASSINATION",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        targetActorId: z.number().int().nullable(),
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        expected: z
          .object({
            outcome: z.enum(COMPARISON_OUTCOMES),
            basis: z.enum(COMPARISON_BASES),
            authorityCoverage: z.enum(DECISION_COVERAGES),
            authorityToken: z.string().nullable(),
            selectionPrecision: z.enum(["EXACT_ENTRY", "TOKEN_CONVERGED"]).nullable(),
            decisiveBlocker: z.enum(DECISION_BLOCKER_CLASSES).nullable(),
            observedActionRejected: z.boolean(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The real M5 observed-decision facade, under the committed pinned authority, compares this observed cast exactly so. MATCH means AUTHORITY_COMPATIBLE_ONLY; UNKNOWN and REJECTED are preserved as the facade produced them. The outcome class is the facade's verdict, whatever it is.",
  },
  "SPEC_ASSASSINATION.SPEC_GATE": {
    owningLayer: "SPEC_ASSASSINATION",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The facade refuses this specialization with SPEC_NOT_SUPPORTED before any Assassination rule runs: no comparisons, no coverage, no authority.",
  },
  "SPEC_ASSASSINATION.AUTHORITY_UNAVAILABLE_IS_NOT_REJECTION": {
    owningLayer: "SPEC_ASSASSINATION",
    outcomeClass: "NO_AUTHORITY_AVAILABLE",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), targetActorId: z.number().int().nullable() }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "With no authority resolvable, the facade reports AUTHORITY_NOT_AVAILABLE and evaluates nothing. A missing standard never becomes a rejected decision.",
  },
  "SPEC_ASSASSINATION.TALENT_RESOLUTION": {
    owningLayer: "SPEC_ASSASSINATION",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({ actorId: z.number().int(), simcName: z.string().min(1), expected: z.enum(TALENT_SELECTIONS) })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The observed talent tree resolves this SimulationCraft talent exactly so. An absent node is UNKNOWN, never NOT_SELECTED.",
  },
  "SPEC_ASSASSINATION.DOT_REMAINS": {
    owningLayer: "SPEC_ASSASSINATION",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        targetActorId: z.number().int(),
        simcToken: z.string().min(1),
        atCast: observedCastLocator,
        expected: z.union([
          z
            .object({
              state: z.literal("KNOWN"),
              remainsMs: z.number().int(),
              anchorReportTimeMs: z.number().int(),
            })
            .strict(),
          z.object({ state: z.literal("UNKNOWN"), blocker: z.string().min(1) }).strict(),
        ]),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The remaining duration of this actor's DoT on this target, immediately before the observed cast, derives to exactly this from the pinned duration dataset and the observed anchor — or refuses with exactly this blocker.",
  },

  // ---- SPEC_PROTECTION_PALADIN (M10-C) --------------------------------------
  //
  // The INTERNAL_ONLY Protection Paladin evaluator, reached through its
  // registration. Nothing here is public: no kind below drives a transport,
  // and the projection kind asserts that the result CANNOT be published.
  "SPEC_PROTECTION_PALADIN.AUTHORITY_PROVENANCE": {
    owningLayer: "SPEC_PROTECTION_PALADIN",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        expected: z
          .object({
            authorityId: z.string().min(1),
            artifactRevision: z.string().min(1),
            commitSha: z.string().regex(/^[0-9a-f]{40}$/),
            sourcePath: z.string().min(1),
            sourceSha256: z.string().regex(/^[0-9a-f]{64}$/),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The internal Protection Paladin registration analyzes this actor and cites exactly this pinned offensive authority: id, revision, commit and source digest read off the loaded artifact, never hand-maintained.",
  },
  "SPEC_PROTECTION_PALADIN.DECISION_COVERAGE": {
    owningLayer: "SPEC_PROTECTION_PALADIN",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        targetActorId: z.number().int().nullable(),
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        expected: z
          .object({
            outcome: z.enum(COMPARISON_OUTCOMES),
            basis: z.enum(COMPARISON_BASES),
            authorityCoverage: z.enum(DECISION_COVERAGES),
            authorityToken: z.string().nullable(),
            selectionPrecision: z.enum(["EXACT_ENTRY", "TOKEN_CONVERGED"]).nullable(),
            decisiveBlocker: z.enum(DECISION_BLOCKER_CLASSES).nullable(),
            /** The engine's own blocker, verbatim, so an OTHER class still names its cause. */
            rawBlocker: z.string().nullable(),
            observedActionRejected: z.boolean(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The internal Protection Paladin evaluator, under the committed pinned authority, compares this observed GCD cast exactly so. MATCH means AUTHORITY_COMPATIBLE_ONLY; UNKNOWN carries the engine's own blocker verbatim; REJECTED is preserved as the evaluator produced it.",
  },
  "SPEC_PROTECTION_PALADIN.COVERAGE_SUMMARY": {
    owningLayer: "SPEC_PROTECTION_PALADIN",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        expected: z
          .object({
            eligibleDecisions: z.number().int().nonnegative(),
            match: z.number().int().nonnegative(),
            rejected: z.number().int().nonnegative(),
            unknown: z.number().int().nonnegative(),
            /** Exact and exhaustive: every exclusion reason with a non-zero count. */
            exclusions: z.record(z.enum(PROTECTION_EXCLUSION_REASONS), z.number().int().positive()),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The evaluator's coverage disclosure over this actor's every completed cast: the eligible-decision denominator, the three outcomes that partition it, and each excluded cast counted under its named reason. A cast is never dropped silently.",
  },
  "SPEC_PROTECTION_PALADIN.HOLY_POWER_OBSERVATION": {
    owningLayer: "SPEC_PROTECTION_PALADIN",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        cast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        expected: z
          .object({
            state: z.literal("EXACT_PRE_COST"),
            amount: z.number().int().nonnegative(),
            max: z.number().int().positive().nullable(),
            cost: z.number().int().nonnegative().nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The evaluator records exactly this Holy Power observation on this cast: the PRE_COST amount the wire carried, its max and its cost. An observation, never a derived or replayed state.",
  },
  "SPEC_PROTECTION_PALADIN.HOLY_POWER_NOT_OBSERVED": {
    owningLayer: "SPEC_PROTECTION_PALADIN",
    outcomeClass: "UNKNOWN",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        cast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The evaluator records NO_OBSERVATION for this cast: the event carries no Holy Power entry, and the evaluator states that rather than any amount. Missing Holy Power is never zero and never an inferred value.",
  },
  "SPEC_PROTECTION_PALADIN.DOMAIN_RESULT": {
    owningLayer: "SPEC_PROTECTION_PALADIN",
    outcomeClass: "NO_AUTHORITY_AVAILABLE",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        domain: z.enum(AUTHORITY_DOMAINS),
        expected: z
          .object({
            resolution: z.enum(AUTHORITY_RESOLUTION_OUTCOMES),
            /** Pinned only for OFFENSIVE_ROTATION under AUTHORITY_AVAILABLE. */
            authorityId: z.string().nullable(),
            /** `false` for every non-offensive domain; `null` for the offensive one. */
            offensiveAuthorityGoverns: z.boolean().nullable(),
            /** Pinned only for INTERRUPT: the evidence family's capability, verbatim. */
            evidenceFamily: z.enum(["OBSERVABLE", "NOT_OBSERVABLE", "UNVERIFIED"]).nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The evaluator represents this decision domain exactly so: the registration's own authority resolution for it, whether the offensive authority may govern it (never, outside OFFENSIVE_ROTATION), and for INTERRUPT the evidence family's capability stated separately from the missing standard.",
  },
  "SPEC_PROTECTION_PALADIN.BUILD_RESOLUTION": {
    owningLayer: "SPEC_PROTECTION_PALADIN",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        expected: z
          .object({
            talents: z.record(z.string().min(1), z.enum(TALENT_SELECTIONS)),
            heroTree: z.union([
              z.object({ state: z.literal("RESOLVED"), simcName: z.string().min(1) }).strict(),
              z.object({ state: z.literal("UNKNOWN") }).strict(),
            ]),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The evaluator resolves the actor's build from the observed talent tree against the pinned Paladin trait data exactly so: each named talent's three-way selection and the hero sub-tree by entry membership. Never inferred from a cast.",
  },
  "SPEC_PROTECTION_PALADIN.USE_ITEMS_SUB_ACTION_SET": {
    owningLayer: "SPEC_PROTECTION_PALADIN",
    outcomeClass: "UNKNOWN",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        expected: z
          .object({
            /** The pinned worn items with an item-sourced use effect, in slot order. */
            onUseItemIds: z.array(z.number().int()),
            /** Every open slot, by reason and count. Empty means the set is CLOSED. */
            open: z.array(
              z.object({ reason: z.string().min(1), count: z.number().int().positive() }).strict(),
            ),
            /** The open slot indices, in order. */
            openSlotIndices: z.array(z.number().int().nonnegative()),
            /** Omitted keys the shared equivalence proof closed (M10-C3). Zero on the committed subject. */
            provenIrrelevant: z.number().int().nonnegative(),
            /** The Divine Inspiration selection the equivalence policy ran under. */
            divineInspiration: z.enum(TALENT_SELECTIONS),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The `use_items` sub-action set the evaluator can close from the actor's combatant info against the pinned item and enchant datasets, including the exhaustive use-effect universe and the shared observational-equivalence proof over every candidate the pinned build admits at an omitted key: exactly these worn on-use items, exactly these slots left OPEN by reason, and exactly this many omissions the proof closed — never an omission read as 'none'.",
  },
  "SPEC_PROTECTION_PALADIN.RESOLVED_ATOM": {
    owningLayer: "SPEC_PROTECTION_PALADIN",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        atom: z.string().min(1),
        expected: z.discriminatedUnion("kind", [
          z.object({ kind: z.literal("TRUTH"), value: z.boolean() }).strict(),
          z
            .object({
              kind: z.literal("MAGNITUDE"),
              state: z.enum(["KNOWN_NUMBER", "BOUNDED_NUMBER", "UNKNOWN_NUMBER"]),
              value: z.number().nullable(),
              reason: z.string().nullable(),
            })
            .strict(),
          /** Declared, parsed, and NOT bound: enumerated by the evaluator, never a value. */
          z.object({ kind: z.literal("UNBOUND") }).strict(),
        ]),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "At the decision this cast marks, the Protection resolver binds this declared identifier exactly so — a proven truth, a stated magnitude, or nothing at all. An UNBOUND truth is enumerated across worlds; an unmodelled magnitude names why.",
  },
  "SPEC_PROTECTION_PALADIN.SPEC_GATE": {
    owningLayer: "SPEC_PROTECTION_PALADIN",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The Protection facade refuses this specialization with SPEC_NOT_SUPPORTED before any Protection rule runs: no comparisons, no domains, no authority.",
  },
  "SPEC_PROTECTION_PALADIN.NOT_PUBLICLY_PROJECTABLE": {
    owningLayer: "SPEC_PROTECTION_PALADIN",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int() }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The analyzed Protection result names an INTERNAL_ONLY specialization, and the public narrowing boundary refuses it with InternalSpecExposureError rather than a quieter document. An internal result reaches no public projection.",
  },

  // ---- SHARED_DECISION_ENGINE ---------------------------------------------
  //
  // Driven directly over a SYNTHETIC authority artifact (JSON_VALUE) with every
  // premise — bindings, proven-usable tokens, entry list — stated in the case.
  // No specialization module is involved; the subject is the engine's own
  // priority semantics.
  "SHARED_DECISION_ENGINE.SCAN_SELECTS_DEFINITELY": {
    owningLayer: "SHARED_DECISION_ENGINE",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["JSON_VALUE"],
    params: z
      .object({
        entryListName: z.string().min(1),
        knownBuffs: z.array(z.object({ name: z.string().min(1), up: z.boolean() }).strict()),
        knownTalents: z.array(z.object({ name: z.string().min(1), taken: z.boolean() }).strict()),
        provenUsableTokens: z.array(z.string().min(1)),
        expected: aplEntryRef,
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "One foreground scan under the stated bindings resolves DEFINITE to exactly this entry: its gate is proven TRUE and its usability proven, so nothing below it is reachable.",
  },
  "SHARED_DECISION_ENGINE.SCAN_UNDECIDED_BY_HIGHER_PRIORITY": {
    owningLayer: "SHARED_DECISION_ENGINE",
    outcomeClass: "UNKNOWN",
    payloadKinds: ["JSON_VALUE"],
    params: z
      .object({
        entryListName: z.string().min(1),
        knownBuffs: z.array(z.object({ name: z.string().min(1), up: z.boolean() }).strict()),
        knownTalents: z.array(z.object({ name: z.string().min(1), taken: z.boolean() }).strict()),
        provenUsableTokens: z.array(z.string().min(1)),
        expectedCandidates: z.array(aplEntryRef.extend({ definite: z.boolean() }).strict()).min(2),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The priority short-circuit: a higher-priority entry whose gate is UNDECIDED leaves the scan AMBIGUOUS between exactly these candidates, and the proven lower-priority entry is never promoted to the answer.",
  },
  "SHARED_DECISION_ENGINE.SCAN_REFUSES_UNSUPPORTED_EXPRESSION": {
    owningLayer: "SHARED_DECISION_ENGINE",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["JSON_VALUE"],
    params: z
      .object({
        entryListName: z.string().min(1),
        knownBuffs: z.array(z.object({ name: z.string().min(1), up: z.boolean() }).strict()),
        knownTalents: z.array(z.object({ name: z.string().min(1), taken: z.boolean() }).strict()),
        provenUsableTokens: z.array(z.string().min(1)),
        expectedBlockedAt: aplEntryRef,
        expectedFragment: z.string().min(1),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "An entry whose condition the shared parser does not support BLOCKS the scan at that entry with UNSUPPORTED_AUTHORITY_EXPRESSION, naming the fragment; it is never evaluated as false or true and nothing below it is selected.",
  },

  "WCL_PAGINATION.PAGE_ENVELOPE_FACTS": {
    owningLayer: "WCL_TRANSPORT",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_GRAPHQL_PAGE_SEQUENCE"],
    params: z
      .object({
        pages: z
          .array(
            z
              .object({
                eventCount: z.number().int().nonnegative(),
                firstTimestamp: z.number().int().nullable(),
                lastTimestamp: z.number().int().nullable(),
                /** Verbatim from the envelope. `null` is the terminal page. */
                nextPageTimestamp: z.number().int().nullable(),
              })
              .strict(),
          )
          .min(1),
        /**
         * The observed relation between consecutive real pages: the cursor a
         * page returns is exactly the first timestamp of the next page, and is
         * strictly greater than the last timestamp of the page that returned
         * it. No overlap and no gap was observed; a future capture that shows
         * either must add a new rule name rather than weaken this one.
         */
        boundaryRule: z.literal("CURSOR_IS_NEXT_PAGE_FIRST_TIMESTAMP_AND_EXCEEDS_PREVIOUS_LAST"),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "Each page envelope, through the real decoder, carries exactly these counts, first/last timestamps and verbatim cursor, and every consecutive pair obeys the stated boundary rule. Terminal versus non-terminal state is the cursor's nullness, read verbatim.",
  },
  "NORMALIZATION.ACTOR_CATALOG": {
    owningLayer: "NORMALIZATION",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_GRAPHQL_DATA"],
    params: z
      .object({
        fightId: z.number().int(),
        expected: z
          .object({
            actors: z.number().int(),
            players: z.number().int(),
            pets: z.number().int(),
            npcs: z.number().int(),
            unknown: z.number().int(),
            unusableEntries: z.number().int(),
            /** Pet → owner links read from `petOwner` ONLY. */
            petOwnerLinks: z.array(
              z.object({ actorId: z.number().int(), petOwnerActorId: z.number().int() }).strict(),
            ),
            /** Actor ids the catalog must hold, verbatim from master data. */
            holdsActorIds: z.array(z.number().int()),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The real fight-context decoder and normalizer build exactly this actor catalog from master data: counts by type, pet-owner links from `petOwner` and nothing else, and the listed ids present. Names are not read.",
  },
  "NORMALIZATION.FIGHT_HEADER": {
    owningLayer: "NORMALIZATION",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_GRAPHQL_DATA"],
    params: z
      .object({
        fightId: z.number().int(),
        expected: z
          .object({
            encounterId: z.number().int(),
            difficulty: z.number().int().nullable(),
            kill: z.boolean().nullable(),
            startTimeMs: z.number().int(),
            endTimeMs: z.number().int(),
            finality: z.string().min(1),
            friendlyPlayerCount: z.number().int(),
            phases: z.array(
              z
                .object({
                  phaseId: z.number().int(),
                  isIntermission: z.boolean().nullable(),
                  startTimeMs: z.number().int(),
                })
                .strict(),
            ),
            outcome: z
              .object({
                lastPhase: z.number().int().nullable(),
                lastPhaseAsAbsoluteIndex: z.number().int().nullable(),
                lastPhaseIsIntermission: z.boolean().nullable(),
                bossPercentageRaw: z.number().nullable(),
                fightPercentageRaw: z.number().nullable(),
                wipeCalledReportTimeMs: z.number().int().nullable(),
              })
              .strict(),
            zone: z.object({ id: z.number().int(), name: z.string() }).strict().nullable(),
            abilities: z.number().int(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The real fight-context decoder and normalizer read exactly these typed fight facts — header, phase transitions with their intermission flags, verbatim outcome facts, zone and ability-catalog size — from a real report context.",
  },
  "WCL_TRANSPORT.FIGHT_IDENTITY": {
    owningLayer: "WCL_TRANSPORT",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_GRAPHQL_DATA"],
    params: z
      .object({
        fightId: z.number().int(),
        sourceId: z.number().int(),
        expected: z.discriminatedUnion("ok", [
          z
            .object({
              ok: z.literal(true),
              className: z.string().min(1),
              specName: z.string().min(1),
              /** The redacted placeholder the artifact carries, proving the name is READ, not the real one. */
              playerName: z.string().min(1),
              reportRevision: z.number().int(),
              logVersion: z.number().int(),
              gameVersion: z.number().int().nullable(),
            })
            .strict(),
          z
            .object({
              ok: z.literal(false),
              reason: z.enum([
                "REPORT_NOT_ACCESSIBLE",
                "FIGHT_NOT_FOUND",
                "SOURCE_NOT_FOUND",
                "SOURCE_NOT_A_PLAYER",
                "SOURCE_NOT_IN_FIGHT",
                "IDENTITY_UNRESOLVED",
                "UPSTREAM_DATA_INVALID",
              ]),
            })
            .strict(),
        ]),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The real preflight decoder and identity resolver, over a real report context, resolve this (fight, source) exactly so: name, class and index-aligned spec together, or the named refusal. A pet is not a player; an absent id is not found; a player absent from the pull is not in it.",
  },
  "APPLICATION_SERVICE.FIGHT_ANALYSIS": {
    owningLayer: "APPLICATION_SERVICE",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        subject: z
          .object({ actorId: z.number().int(), className: z.string().min(1), specName: z.string().min(1) })
          .strict(),
        expected: z
          .object({
            status: z.enum(["ANALYZED", "SPEC_NOT_SUPPORTED"]),
            specId: z.string().nullable(),
            analyzerId: z.string().nullable(),
            /** `null` when no analyzer ran and nothing was retrieved. */
            scope: z.enum(["PLAYER_CONTEXT", "FULL_RAID"]).nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The real application service over the artifact — preflight and ingestion faked, everything between them production — derives exactly this ingestion scope from the enabled analyzers, recognizes exactly this specialization and analyzer, and reports exactly this status. Never a transport.",
  },

  "APPLICATION_SERVICE.INTERNAL_REGISTRATION": {
    owningLayer: "APPLICATION_SERVICE",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        specId: z.string().min(1),
        expected: z
          .object({
            /** The analyzer id the INTERNAL lookup resolves, or `null` when none is registered. */
            internalAnalyzerId: z.string().nullable(),
            /** The analyzer id the PUBLIC lookup resolves, or `null`. */
            publicAnalyzerId: z.string().nullable(),
            exposure: z.enum(["INTERNAL_ONLY", "PUBLIC"]).nullable(),
            /** Whether the public identity table resolves this specialization's class/spec pair. */
            identityResolvesPublicly: z.boolean(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The validated production catalog answers the internal and the public lookup for this specialization exactly so, and the public identity table agrees. An INTERNAL_ONLY registration is real to the first and invisible to the second; catalog order changes neither answer.",
  },

  // ---- PUBLIC_CONTRACT -----------------------------------------------------
  "PUBLIC_CONTRACT.REST_MCP_PARITY": {
    owningLayer: "PUBLIC_CONTRACT",
    outcomeClass: "PARITY",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.discriminatedUnion("document", [
      z
        .object({
          document: z.literal("ANALYSIS"),
          subject: z
            .object({ actorId: z.number().int(), className: z.string().min(1), specName: z.string().min(1) })
            .strict(),
          expected: z.object({ status: z.enum(["ANALYZED", "SPEC_NOT_SUPPORTED"]) }).strict(),
        })
        .strict(),
      z
        .object({
          document: z.literal("RAID_NIGHT"),
          fightIds: z.array(z.number().int()).min(1),
          subject: z.object({ actorId: z.number().int() }).strict(),
          expected: z.object({ analyzedCells: z.number().int().nonnegative() }).strict(),
        })
        .strict(),
      z
        .object({
          document: z.literal("ENCOUNTER_CONTEXT"),
          fightIds: z.array(z.number().int()).min(1),
          subjectFightId: z.number().int(),
          subject: z.object({ actorId: z.number().int() }).strict(),
          /**
           * The subject pull's encounter facts, stated so external candidates
           * can be qualified against them. Omitted for a local-only request.
           */
          subjectFight: z
            .object({
              encounterId: z.number().int(),
              difficulty: z.number().int(),
              durationMs: z.number().int(),
            })
            .strict()
            .optional(),
          /**
           * External-reference discovery, entirely offline: the ranking page is
           * served from a corpus artifact, candidate metadata from a
           * SYNTHETIC per-candidate report (a stated test premise, never a
           * capture), and the port failure modes are injected. Omitted for a
           * local-only request.
           */
          external: z
            .object({
              rankingsArtifactId: z.string().min(1),
              /** How the ranking port behaves. `SERVE` answers from the artifact. */
              rankingPort: z.enum(["SERVE", "TRANSPORT_FAILURE"]),
              /** Candidates (by remapped report code) whose metadata request answers null. */
              metadataUnavailableFor: z.array(z.string().min(1)),
              className: z.string().min(1),
              specName: z.string().min(1),
            })
            .strict()
            .optional(),
          expected: z.discriminatedUnion("externalReferenceStatus", [
            z.object({ externalReferenceStatus: z.literal("NOT_REQUESTED") }).strict(),
            z.object({ externalReferenceStatus: z.literal("PAYLOAD_UNRECOGNISED") }).strict(),
            z
              .object({
                externalReferenceStatus: z.literal("COMPLETED"),
                qualified: z.number().int().nonnegative(),
                failures: z.number().int().nonnegative(),
                ineligible: z.number().int().nonnegative(),
                /** Every qualified reference's overall comparability, deduplicated. Across reports this is UNKNOWN. */
                comparability: z.enum([
                  "COMPARABLE",
                  "COMPARABLE_WITH_CAVEATS",
                  "NOT_COMPARABLE",
                  "UNKNOWN",
                  "NONE",
                ]),
                /** Metadata lookups the discovery issued. Bounded by MAX_QUALIFIED_CANDIDATES. */
                metadataRequests: z.number().int().nonnegative(),
                rankingRequests: z.number().int().nonnegative(),
              })
              .strict(),
          ]),
        })
        .strict(),
    ]),
    execution: "EXECUTABLE",
    runtime: "WORKERD",
    requiresAuthority: false,
    description:
      "REST JSON, MCP structuredContent and the parsed MCP text block are one semantically equal document over this artifact, valid against the frozen public schema, with these few semantic facts holding. Never contacts Warcraft Logs; every port is an offline fake over the artifact.",
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
  [pinnedRogueDotDurations.datasetId]: pinnedRogueDotDurations.artifactRevision,
  [pinnedProtectionApl.authorityId]: pinnedProtectionApl.artifactRevision,
};

// --------------------------------------------------------------------------
// Manifest schema
// --------------------------------------------------------------------------

const identifier = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, "lowercase, digits, `.` and `-` only");

const reportTimeRange = z
  .object({ fromReportTimeMs: z.number().int(), toReportTimeMs: z.number().int() })
  .strict();

/** An events retrieval — the analyzer's own `EVENTS_QUERY` shape. */
const eventsCaptureQuery = z
  .object({
    dataType: z.literal("All"),
    hostilityType: z.literal("OMITTED"),
    /**
     * `"NONE"` for every analyzer-shaped query. `{ sourceId }` records a
     * CAPTURE-ONLY filter used to bound a probe to one actor's events; the
     * analyzer never filters by actor (see `src/wcl/events-query.ts`), and an
     * artifact captured this way retains no coverage for anyone.
     */
    actorFilter: z.union([z.literal("NONE"), z.object({ sourceId: z.number().int() }).strict()]),
    includeResources: z.boolean(),
    limit: recordedInt,
    startTimeMs: recordedInt,
    endTimeMs: recordedInt,
  })
  .strict();

/**
 * The retrieval that produced the SOURCE capture. Records what was asked,
 * verbatim.
 *
 * An events query is the original (and unchanged) shape. M9-C added the two
 * typed, non-event retrievals the corpus now holds captures of, each keyed by
 * its own `kind` so the events shape did not have to change: a report's
 * fight context (`FIGHT_CONTEXT_QUERY`), and one page of an encounter's
 * character rankings. A non-event capture has no report-time window, so the
 * loader applies its window rule to events captures only.
 */
const captureQuery = z.union([
  eventsCaptureQuery,
  z.object({ kind: z.literal("FIGHT_CONTEXT"), fightIds: z.array(z.number().int()).min(1) }).strict(),
  z
    .object({
      kind: z.literal("ENCOUNTER_CHARACTER_RANKINGS"),
      encounterId: z.number().int(),
      difficulty: z.number().int(),
      className: z.string().min(1),
      specName: z.string().min(1),
      metric: z.enum(["dps", "hps"]),
      /** `OMITTED` is Warcraft Logs' default: the latest partition AT CAPTURE TIME, which moves. */
      partition: z.union([z.number().int(), z.literal("OMITTED")]),
      page: z.number().int().positive(),
    })
    .strict(),
]);

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
    /**
     * The report revision read AFTER the last page, when the capture plan
     * re-checked it (M10-B onward). Equal to `reportRevision` for a coherent
     * capture; a capture whose revision moved mid-pagination is PARTIAL and
     * grants nothing. Absent for captures taken before the re-check existed.
     */
    reportRevisionAfterCapture: recordedInt.optional(),
    /**
     * Why this subject was selected, in Warcraft Logs' own performance terms.
     *
     * CONTEXT ONLY. A bracket explains why a fixture is in the corpus; it never
     * determines an expected action, verdict or coaching result, and no
     * assertion kind can read it. Names are never retained: the subject is
     * identified by the actor id the corpus already uses.
     */
    performanceContext: z
      .object({
        source: z.string().min(1),
        partition: recordedInt,
        metric: z.enum(["dps", "hps"]),
        subjects: z.array(
          z
            .object({
              actorId: z.number().int(),
              className: z.string().min(1),
              specName: z.string().min(1),
              rankPercent: z.number(),
              bracketPercent: z.number(),
              bracket: z.number().int(),
              /** Item-level bracket key, verbatim. Uninterpreted. */
              bracketData: z.number().int(),
              totalParses: z.number().int(),
            })
            .strict(),
        ),
        fightOutcome: z.enum(["KILL", "WIPE"]),
        fightDurationMs: z.number().int(),
      })
      .strict()
      .optional(),
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
 * Evidence categories a Warcraft Logs `All`-stream capture can vouch for.
 *
 * Read from the committed capability evidence: these are the ones
 * `PROVENANCE.md` records as OBSERVABLE from sanitized captures. A retained
 * coverage grant may name only these; a capture cannot vouch for a category it
 * never held.
 */
export const CAPTURE_VOUCHED_CATEGORIES = [
  "CASTS",
  "AURAS",
  "RESOURCES",
  "ABSORBS",
  "DAMAGE",
  "HEALING",
  "SUMMONS",
  "COMBATANT_INFO",
  "GEAR",
] as const;
export type CaptureVouchedCategory = (typeof CAPTURE_VOUCHED_CATEGORIES)[number];

/**
 * One coverage grant: over these ranges, for these categories, the artifact
 * holds EVERY event the source capture held for these actors.
 *
 * Grants are per category and per actor set because a slice predicate is:
 * "every actor-19 cast, plus every aura event targeting 19 or 21" retains
 * complete CASTS coverage for one actor and complete AURAS coverage for two,
 * and nothing for anyone else. One flat range list could not say that
 * honestly, and a fight built from it would either over-claim or under-claim.
 */
const coverageGrant = z
  .object({
    categories: z.array(z.enum(CAPTURE_VOUCHED_CATEGORIES)).min(1),
    /** M4's own sense: `null` is every actor in the stream; a list is those and no others. */
    actorScope: z.array(z.number().int()).nullable(),
    ranges: z.array(reportTimeRange).min(1),
  })
  .strict();

/**
 * What the ARTIFACT still covers, after every transformation. Only these
 * grants may be granted as coverage when a case builds a fight from it; a
 * category no grant names gets no coverage, and a slice with no grants can
 * prove no absence.
 */
const retainedCoverage = z
  .object({
    grants: z.array(coverageGrant),
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
