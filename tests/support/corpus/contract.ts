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
import {
  RESOURCE_OBSERVATION_TIMINGS,
  STANDALONE_CHANGE_OWNERSHIP_BASES,
  UNRESOLVED_CHANGE_OWNERSHIP_REASONS,
} from "../../../src/engine/resources/resource-observations.js";
import { BLOOD_RUNE_AFFORDABILITY_EVIDENCE } from "../../../src/specs/deathknight/blood/rune-affordability.js";
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
import { TRAVERSAL_BLOCKERS } from "../../../src/simc/nested-selection.js";
import pinnedAssassinationApl from "../../../src/simc/data/rogue-assassination.apl.json";
import pinnedRogueDotDurations from "../../../src/data/game/rogue-dot-durations.json";
import pinnedProtectionApl from "../../../src/simc/data/paladin-protection.apl.json";
import pinnedRetributionApl from "../../../src/simc/data/paladin-retribution.apl.json";
import pinnedBloodApl from "../../../src/simc/data/deathknight-blood.apl.json";
import pinnedBrewmasterApl from "../../../src/simc/data/monk-brewmaster.apl.json";
import pinnedHavocApl from "../../../src/simc/data/demonhunter-havoc.apl.json";
import pinnedSubtletyApl from "../../../src/simc/data/rogue-subtlety.apl.json";
import pinnedFuryApl from "../../../src/simc/data/warrior-fury.apl.json";
import pinnedProtectionWarriorApl from "../../../src/simc/data/warrior-protection.apl.json";
import pinnedArmsWarriorApl from "../../../src/simc/data/warrior-arms.apl.json";
import pinnedFrostDeathKnightApl from "../../../src/simc/data/deathknight-frost.apl.json";
import pinnedDevourerDemonHunterApl from "../../../src/simc/data/demonhunter-devourer.apl.json";
import pinnedFeralDruidApl from "../../../src/simc/data/druid-feral.apl.json";
import pinnedDestructionWarlockApl from "../../../src/simc/data/warlock-destruction.apl.json";
import pinnedElementalShamanApl from "../../../src/simc/data/shaman-elemental.apl.json";
import pinnedBalanceDruidApl from "../../../src/simc/data/druid-balance.apl.json";
import pinnedShadowPriestApl from "../../../src/simc/data/priest-shadow.apl.json";
import pinnedArcaneMageApl from "../../../src/simc/data/mage-arcane.apl.json";
import pinnedFrostMageApl from "../../../src/simc/data/mage-frost.apl.json";
import pinnedAfflictionWarlockApl from "../../../src/simc/data/warlock-affliction.apl.json";
import pinnedMarksmanshipHunterApl from "../../../src/simc/data/hunter-marksmanship.apl.json";
import pinnedOutlawRogueApl from "../../../src/simc/data/rogue-outlaw.apl.json";
import pinnedEnhancementShamanApl from "../../../src/simc/data/shaman-enhancement.apl.json";
import { AUTHORITY_DOMAINS, AUTHORITY_RESOLUTION_OUTCOMES } from "../../../src/findings/authority-domain.js";
import { SPEC_IDS, type SpecId } from "../../../src/findings/spec-id.js";
import {
  PUBLIC_AUTHORITY_COVERAGES,
  PUBLIC_COMPARISON_BASES,
  PUBLIC_COMPARISON_OUTCOMES,
  PUBLIC_DECISION_BLOCKER_CLASSES,
  PUBLIC_EXCLUSION_REASONS,
  PUBLIC_SELECTION_PRECISIONS,
} from "../../../src/contracts/analysis-contract.js";
import { PROTECTION_EXCLUSION_REASONS } from "../../../src/specs/paladin/protection/observed-analysis.js";
import { RETRIBUTION_EXCLUSION_REASONS } from "../../../src/specs/paladin/retribution/observed-analysis.js";
import { BLOOD_EXCLUSION_REASONS } from "../../../src/specs/deathknight/blood/observed-analysis.js";
import { BREWMASTER_EXCLUSION_REASONS } from "../../../src/specs/monk/brewmaster/observed-analysis.js";

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
 *
 * M10-D REMOVED one kind without bumping: `SPEC_PROTECTION_PALADIN.
 * NOT_PUBLICLY_PROJECTABLE` asserted that the Protection result could not be
 * narrowed to a public id, which stopped being true by design when Protection
 * became public. A kind whose claim is false by construction is not kept
 * executable; its one case was repurposed onto the new
 * `SPEC_PROTECTION_PALADIN.PUBLIC_PROJECTION`. No manifest outside this
 * repository names the removed kind, so no manifest changed meaning.
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
// The evidence archive (M11-C4e)
// --------------------------------------------------------------------------

/**
 * The two committed evidence roots. They share one artifact and case schema
 * and one provenance vocabulary, and they have different responsibilities:
 *
 *   REGRESSION_CORPUS   tests/corpus/ — the executable regression fixtures,
 *                       loaded by every corpus run, bounded by
 *                       MAX_CORPUS_BYTES in total and MAX_ARTIFACT_BYTES each.
 *   EVIDENCE_ARCHIVE    tests/evidence/ — qualifying real evidence retained
 *                       for promotion verification, executed only by its own
 *                       command and never loaded by the regression corpus.
 *                       MAX_ARTIFACT_BYTES each, a notice line at
 *                       EVIDENCE_ARCHIVE_NOTICE_BYTES over its artifacts plus
 *                       its committed selection frames, and no total ceiling.
 *
 * An archive case may reference a corpus artifact; a corpus case may never
 * reference an archive artifact. Artifact and case ids are one namespace
 * across both roots.
 */
export const EVIDENCE_ROOT_IDS = ["REGRESSION_CORPUS", "EVIDENCE_ARCHIVE"] as const;
export type EvidenceRootId = (typeof EVIDENCE_ROOT_IDS)[number];

/**
 * The archive's notice line over artifact bytes PLUS committed
 * `tests/evidence/selection-frames/**` bytes: crossed by hand, never silently
 * (checked by a test, not the loader). MAX_ARTIFACT_BYTES stays artifact-only.
 */
export const EVIDENCE_ARCHIVE_NOTICE_BYTES = 4 * 1024 * 1024;

/**
 * The assertion families an archive case may carry. Promotion and evidence
 * verification only — the archive is not a second regression corpus:
 *
 *   - an archived artifact's provenance census (the four NORMALIZATION kinds
 *     every committed slice carries);
 *   - bundle composition;
 *   - a specialization's decision coverage and its measurement aggregates.
 *
 * Adding a family is a reviewed change to this list, which a test pins.
 */
const EVIDENCE_ARCHIVE_NORMALIZATION_KINDS: readonly string[] = [
  "NORMALIZATION.EVENT_COUNT_PRESERVED",
  "NORMALIZATION.INPUT_ORDER_PRESERVED",
  "NORMALIZATION.ALL_TYPES_RECOGNISED",
  "NORMALIZATION.ACTOR_EVENT_CENSUS",
  "NORMALIZATION.BUNDLE_COMPOSITION",
];
const EVIDENCE_ARCHIVE_SPEC_SUFFIXES: readonly string[] = [
  ".DECISION_COVERAGE",
  ".COVERAGE_SUMMARY",
  ".MEASUREMENT_DISTRIBUTION",
  ".STATE_EVIDENCE_CENSUS",
];

export function isEvidenceArchiveAssertionKind(kind: string): boolean {
  if (EVIDENCE_ARCHIVE_NORMALIZATION_KINDS.includes(kind)) return true;
  return kind.startsWith("SPEC_") && EVIDENCE_ARCHIVE_SPEC_SUFFIXES.some((suffix) => kind.endsWith(suffix));
}

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

const identifier = z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, "lowercase, digits, `.` and `-` only");

const reportTimeRange = z
  .object({ fromReportTimeMs: z.number().int(), toReportTimeMs: z.number().int() })
  .strict();

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
  /**
   * SPEC-LEVEL ROOTS (M11-A2). Until M11-A2 the two specialization layers
   * were rooted at the CLASS directory (`src/specs/rogue/`,
   * `src/specs/paladin/`), which cannot scale: a second Rogue or Paladin
   * specialization would have been owned by its sibling's layer and its
   * cases counted as the sibling's coverage. Each specialization layer now
   * owns exactly its own `src/specs/<class>/<spec>/` tree, and
   * `SPEC_LAYER_OF` below is the test-owned join from a `SpecId` to that
   * layer. No case, artifact or expectation moved: ownership is metadata.
   */
  SPEC_ASSASSINATION: ["src/specs/rogue/assassination/"],
  /** M10-C. The Protection Paladin evaluator and nothing else. */
  SPEC_PROTECTION_PALADIN: ["src/specs/paladin/protection/"],
  /** M11-A4. The INTERNAL_ONLY Retribution Paladin evaluator and nothing else. */
  SPEC_RETRIBUTION_PALADIN: ["src/specs/paladin/retribution/"],
  /** M11-B2. The INTERNAL_ONLY Blood Death Knight measurement evaluator and nothing else. */
  SPEC_BLOOD_DEATH_KNIGHT: ["src/specs/deathknight/blood/"],
  /** M11-C2. The Brewmaster Monk evaluator (INTERNAL_ONLY until M11-C4j) and nothing else. */
  SPEC_BREWMASTER_MONK: ["src/specs/monk/brewmaster/"],
  /** M13-E. The INTERNAL_ONLY Augmentation Evoker support-observation evaluator and nothing else. */
  SPEC_AUGMENTATION_EVOKER: ["src/specs/evoker/augmentation/"],
  /** HEAL-A. The INTERNAL_ONLY Restoration Shaman healer evaluator and nothing else. */
  SPEC_RESTORATION_SHAMAN: ["src/specs/shaman/restoration/"],
  /** HEAL-B1; PUBLIC since HEAL-B1P. The Holy Paladin healer evaluator and nothing else. */
  SPEC_HOLY_PALADIN: ["src/specs/paladin/holy/"],
  /** HEAL-B1. The INTERNAL_ONLY Restoration Druid healer evaluator and nothing else. */
  SPEC_RESTORATION_DRUID: ["src/specs/druid/restoration/"],
  /** HEAL-B1; PUBLIC since HEAL-B1P. The Mistweaver Monk healer evaluator and nothing else. */
  SPEC_MISTWEAVER_MONK: ["src/specs/monk/mistweaver/"],
  /** HEAL-B2; PUBLIC since HEAL-B2P. The Holy Priest healer evaluator and nothing else. */
  SPEC_HOLY_PRIEST: ["src/specs/priest/holy/"],
  /** HEAL-B3. The INTERNAL_ONLY Discipline Priest healer evaluator and nothing else. */
  SPEC_DISCIPLINE_PRIEST: ["src/specs/priest/discipline/"],
  /** HEAL-B4; PUBLIC since HEAL-B4P. The Preservation Evoker healer evaluator and nothing else. */
  SPEC_PRESERVATION_EVOKER: ["src/specs/evoker/preservation/"],
  SPEC_HAVOC_DEMON_HUNTER: ["src/specs/demonhunter/havoc/"],
  SPEC_SUBTLETY_ROGUE: ["src/specs/rogue/subtlety/"],
  SPEC_FURY_WARRIOR: ["src/specs/warrior/fury/"],
  SPEC_PROTECTION_WARRIOR: ["src/specs/warrior/protection/"],
  SPEC_ARMS_WARRIOR: ["src/specs/warrior/arms/"],
  SPEC_FROST_DEATH_KNIGHT: ["src/specs/deathknight/frost/"],
  SPEC_DEVOURER_DEMON_HUNTER: ["src/specs/demonhunter/devourer/"],
  SPEC_FERAL_DRUID: ["src/specs/druid/feral/"],
  SPEC_DESTRUCTION_WARLOCK: ["src/specs/warlock/destruction/"],
  SPEC_ELEMENTAL_SHAMAN: ["src/specs/shaman/elemental/"],
  SPEC_BALANCE_DRUID: ["src/specs/druid/balance/"],
  SPEC_SHADOW_PRIEST: ["src/specs/priest/shadow/"],
  SPEC_ARCANE_MAGE: ["src/specs/mage/arcane/"],
  SPEC_FROST_MAGE: ["src/specs/mage/frost/"],
  SPEC_AFFLICTION_WARLOCK: ["src/specs/warlock/affliction/"],
  SPEC_MARKSMANSHIP_HUNTER: ["src/specs/hunter/marksmanship/"],
  SPEC_OUTLAW_ROGUE: ["src/specs/rogue/outlaw/"],
  SPEC_ENHANCEMENT_SHAMAN: ["src/specs/shaman/enhancement/"],
  APPLICATION_SERVICE: ["src/services/", "src/runtime/"],
  PUBLIC_CONTRACT: ["src/contracts/", "src/api/", "src/mcp/"],
} as const;
export type OwningLayer = keyof typeof OWNING_LAYERS;
export const OWNING_LAYER_IDS = Object.keys(OWNING_LAYERS) as readonly OwningLayer[];

/**
 * The corpus layer that owns each specialization's cases (M11-A2).
 *
 * TEST-OWNED. Nothing under `src/` imports this module, and the
 * production/corpus purity guard bans the name outright in production. It is
 * the join the promotion-evidence gate uses to find a registration's own
 * real-evidence cases, and it is typed over `SpecId` — every id this build
 * knows, PUBLIC or INTERNAL_ONLY — so an INTERNAL_ONLY specialization has a
 * corpus home from the day its id exists and its readiness can be reported
 * before it is promoted.
 *
 * `satisfies Record<SpecId, OwningLayer>` makes the map total at compile
 * time; `specLayerProblems` makes it injective and root-coherent at load
 * time: two ids may not share a layer, every mapped layer must be a
 * `SPEC_*` layer whose single root is exactly `src/specs/<class>/<spec>/`
 * for that id, and no `SPEC_*` layer may exist without an id.
 */
export const SPEC_LAYER_OF = {
  "rogue/assassination": "SPEC_ASSASSINATION",
  "paladin/protection": "SPEC_PROTECTION_PALADIN",
  "paladin/retribution": "SPEC_RETRIBUTION_PALADIN",
  "deathknight/blood": "SPEC_BLOOD_DEATH_KNIGHT",
  "monk/brewmaster": "SPEC_BREWMASTER_MONK",
  "evoker/augmentation": "SPEC_AUGMENTATION_EVOKER",
  "shaman/restoration": "SPEC_RESTORATION_SHAMAN",
  "paladin/holy": "SPEC_HOLY_PALADIN",
  "druid/restoration": "SPEC_RESTORATION_DRUID",
  "monk/mistweaver": "SPEC_MISTWEAVER_MONK",
  "priest/holy": "SPEC_HOLY_PRIEST",
  "priest/discipline": "SPEC_DISCIPLINE_PRIEST",
  "evoker/preservation": "SPEC_PRESERVATION_EVOKER",
  "demonhunter/havoc": "SPEC_HAVOC_DEMON_HUNTER",
  "rogue/subtlety": "SPEC_SUBTLETY_ROGUE",
  "warrior/fury": "SPEC_FURY_WARRIOR",
  "warrior/protection": "SPEC_PROTECTION_WARRIOR",
  "warrior/arms": "SPEC_ARMS_WARRIOR",
  "deathknight/frost": "SPEC_FROST_DEATH_KNIGHT",
  "demonhunter/devourer": "SPEC_DEVOURER_DEMON_HUNTER",
  "druid/feral": "SPEC_FERAL_DRUID",
  "warlock/destruction": "SPEC_DESTRUCTION_WARLOCK",
  "shaman/elemental": "SPEC_ELEMENTAL_SHAMAN",
  "druid/balance": "SPEC_BALANCE_DRUID",
  "priest/shadow": "SPEC_SHADOW_PRIEST",
  "mage/arcane": "SPEC_ARCANE_MAGE",
  "mage/frost": "SPEC_FROST_MAGE",
  "warlock/affliction": "SPEC_AFFLICTION_WARLOCK",
  "hunter/marksmanship": "SPEC_MARKSMANSHIP_HUNTER",
  "rogue/outlaw": "SPEC_OUTLAW_ROGUE",
  "shaman/enhancement": "SPEC_ENHANCEMENT_SHAMAN",
} as const satisfies Record<SpecId, OwningLayer>;

/** The specialization-owned layers: exactly those a `SpecId` maps to. */
export const SPEC_OWNED_LAYERS: readonly OwningLayer[] = Object.freeze(
  OWNING_LAYER_IDS.filter((layer) => layer.startsWith("SPEC_")),
);

/** The canonical tree of a specialization: `src/specs/<class>/<spec>/`. */
export function specTreeRoot(specId: string): string {
  return `src/specs/${specId}/`;
}

/**
 * Refuses a `SPEC_LAYER_OF` that is not an injective, root-coherent join
 * onto the `SPEC_*` layers. Returns problems so a test can pin the messages.
 */
export function specLayerProblems(
  layerOf: Readonly<Record<string, string>> = SPEC_LAYER_OF,
  layers: Readonly<Record<string, readonly string[]>> = OWNING_LAYERS,
): readonly string[] {
  const problems: string[] = [];
  const owners = new Map<string, string>();
  for (const [specId, layer] of Object.entries(layerOf)) {
    const roots = layers[layer];
    if (roots === undefined) {
      problems.push(`${specId} maps to ${layer}, which is not an owning layer`);
      continue;
    }
    if (!layer.startsWith("SPEC_")) problems.push(`${specId} maps to ${layer}, which is not a SPEC_ layer`);
    const previous = owners.get(layer);
    if (previous !== undefined) problems.push(`${layer} is owned by both ${previous} and ${specId}`);
    owners.set(layer, specId);
    const expected = specTreeRoot(specId);
    if (roots.length !== 1 || roots[0] !== expected) {
      problems.push(`${layer} roots [${roots.join(", ")}] are not exactly [${expected}]`);
    }
  }
  for (const layer of Object.keys(layers)) {
    if (layer.startsWith("SPEC_") && !owners.has(layer)) problems.push(`${layer} has no SpecId`);
  }
  return problems;
}

export function assertSpecLayersCoherent(): void {
  const problems = specLayerProblems();
  if (problems.length > 0) throw new Error(`SPEC_LAYER_OF is not coherent: ${problems.join("; ")}`);
}
assertSpecLayersCoherent();

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

/**
 * Optional on every Protection kind that analyzes a fight (M10-C5 Phase B):
 * the case's artifact may be the LAST part of a bundle whose earlier parts
 * are named here in order, with every coverage hole the composition is
 * allowed to have; and the evaluation population may be restricted to a
 * fixed report-time window — a time filter, never an outcome filter — while
 * the history still begins at the bundle's first event.
 */
/**
 * An authority entry's applicability for the actor's proven build, as a
 * specialization's `<layer>.OBSERVED_TOKEN_APPLICABILITY` assertion pins it
 * (M11-C4h). The promotion gate reads the suffix generically; the verdict is
 * the specialization's own.
 */
export const OBSERVED_TOKEN_APPLICABILITIES = ["APPLICABLE", "NOT_APPLICABLE", "UNKNOWN"] as const;
export const OBSERVED_TOKEN_APPLICABILITY_SUFFIX = ".OBSERVED_TOKEN_APPLICABILITY";

const BUNDLE_PARAMS = {
  historyArtifactIds: z.array(identifier).optional(),
  declaredHoles: z.array(reportTimeRange).optional(),
  evaluationWindow: reportTimeRange.optional(),
} as const;

/**
 * The bundle half of `BUNDLE_PARAMS`, for the Brewmaster aggregate kinds
 * (M11-C4). No `evaluationWindow`: the Brewmaster executors evaluate the whole
 * composed fight, so a window they would not honour is not accepted.
 */
const BREWMASTER_BUNDLE_PARAMS = {
  historyArtifactIds: BUNDLE_PARAMS.historyArtifactIds,
  declaredHoles: BUNDLE_PARAMS.declaredHoles,
} as const;

/** One consumable's expected status in a corpus case (PREP-4): the count, and every use's spell and timing. */
const CORPUS_CONSUMABLE_USE = z
  .object({
    spellId: z.number().int().positive(),
    timing: z.enum(["IN_FIGHT", "BEFORE_PULL", "UNRESOLVED"]),
  })
  .strict();
const CORPUS_CONSUMABLE_STATUS = z.discriminatedUnion("countState", [
  z
    .object({
      countState: z.literal("OBSERVED"),
      count: z.number().int().nonnegative(),
      uses: z.array(CORPUS_CONSUMABLE_USE),
    })
    .strict(),
  z
    .object({
      countState: z.literal("UNKNOWN"),
      observedAtLeast: z.number().int().nonnegative(),
      reasonCodes: z.array(z.string().min(1)).min(1),
      uses: z.array(CORPUS_CONSUMABLE_USE),
    })
    .strict(),
]);

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
  "COMBAT_STATE.RESOURCE_CHANGE_POST_CHANGE_CONTRACT": {
    owningLayer: "COMBAT_STATE",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        resourceWireType: z.number().int(),
        /** How many attachment units one delta unit is (Runic Power: the delta is whole points, the amount is tenths). */
        deltaScale: z.number().int().positive(),
        expected: z
          .object({
            observations: z.number().int().nonnegative(),
            postChange: z.number().int().nonnegative(),
            /** POST_CHANGE amounts equal to the carried state plus the scaled delta. */
            integerReconciled: z.number().int().nonnegative(),
            /** POST_CHANGE amounts equal to the reported max where the scaled sum exceeds it. */
            capEvents: z.number().int().nonnegative(),
            /** POST_CHANGE amounts within one delta unit of the scaled sum: the delta was rounded, the attachment is exact. */
            deltaRoundedAttachmentExact: z.number().int().nonnegative(),
            /** Later costed casts whose PRE_COST amount equals the carried state. */
            preCostMatches: z.number().int().nonnegative(),
            /** Later uncosted attachments equal to the carried state. */
            uncostedMatches: z.number().int().nonnegative(),
            hiddenChangeMismatches: z.number().int().nonnegative(),
            maxValues: z.array(z.number()),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "M11-B5. Every attachment of this resource on this actor's resourcechange events is tagged POST_CHANGE, and carrying the latest exact observed amount forward — each POST_CHANGE attachment REPLACING the state, a costed cast leaving it unknown until the next observation — reproduces every later PRE_COST and uncosted amount with zero hidden changes. The scaled delta is compared beside each attachment only to classify it (reconciled, capped, or rounded where the attachment is exact); no state is ever produced from a delta.",
  },
  "COMBAT_STATE.RESOURCE_CHANGE_POOL_OWNER": {
    owningLayer: "COMBAT_STATE",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        /** Locates exactly one standalone change: (report time, source, target, resource type). */
        reportTimeMs: z.number().int(),
        sourceActorId: z.number().int(),
        targetActorId: z.number().int(),
        resourceWireType: z.number().int(),
        expected: z.union([
          z
            .object({
              state: z.literal("RESOLVED"),
              ownerActorId: z.number().int(),
              basis: z.enum(STANDALONE_CHANGE_OWNERSHIP_BASES),
            })
            .strict(),
          z
            .object({
              state: z.literal("UNRESOLVED"),
              reason: z.enum(UNRESOLVED_CHANGE_OWNERSHIP_REASONS),
              candidateActorIds: z.array(z.number().int()),
            })
            .strict(),
        ]),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "M11-D2-A3. The one standalone change at (report time, source, target, resource) changed exactly this actor's pool, on this basis read from the event itself — and is indexed under that owner and under no other actor on the event — or its pool is UNRESOLVED for this reason and it is indexed under no actor at all. The source is carried through unchanged: the actor that caused a change is never rewritten into the actor whose pool changed, nor the reverse.",
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
  "NORMALIZATION.BUNDLE_COMPOSITION": {
    owningLayer: "NORMALIZATION",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        /** The case's artifact is the LAST part; these precede it, in order. */
        historyArtifactIds: z.array(identifier).min(1),
        /** Every hole the composed coverage is allowed to have. Exact and exhaustive. */
        declaredHoles: z.array(reportTimeRange),
        actorId: z.number().int(),
        expected: z
          .object({
            events: z.number().int().positive(),
            /** The composed coverage per category: COMPLETE, PARTIAL or ABSENT over the composed window. */
            coverage: z.record(z.string().min(1), z.enum(["COMPLETE", "PARTIAL", "ABSENT"])),
            /** The merged covered ranges of CASTS for the actor, after certificates and declared holes. */
            castRanges: z.array(reportTimeRange).min(1),
            windowFromReportTimeMs: z.number().int(),
            windowToReportTimeMs: z.number().int(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The bundle composer joins these artifacts in order into ONE normalized fight: every event kept in order with no duplicate across a boundary, every grant joined only where adjacent or bridged by a validated zero-event certificate, and exactly the declared holes left as PARTIAL coverage. An undeclared hole, an undeclared adjacency, an overlap, a reversed segment or a boundary duplicate refuses the composition.",
  },
  "SPEC_PROTECTION_PALADIN.ARMAMENT_STATE_AT": {
    owningLayer: "SPEC_PROTECTION_PALADIN",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        historyArtifactIds: z.array(identifier).optional(),
        declaredHoles: z.array(reportTimeRange).optional(),
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        expected: z
          .object({
            state: z.enum(["KNOWN", "UNKNOWN"]),
            /** `next_armament` as SimulationCraft numbers it: 0 Holy Bulwark, 1 Sacred Weapon; null when UNKNOWN. */
            nextArmament: z.number().int().nullable(),
            /** The hardcast the answer rests on (report time, ability), or null. */
            anchorReportTimeMs: z.number().int().nullable(),
            anchorAbilityGameId: z.number().int().nullable(),
            reason: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "At this decision the Lightsmith alternation is KNOWN only from an observed Holy Armaments HARDCAST strictly before it under complete CASTS coverage since — never from a buff transition, never from a later cast, never across a declared hole — and equals exactly this value with this anchor; otherwise UNKNOWN with the reason.",
  },
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
        ...BUNDLE_PARAMS,
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
        ...BUNDLE_PARAMS,
        expected: z
          .object({
            eligibleDecisions: z.number().int().nonnegative(),
            match: z.number().int().nonnegative(),
            rejected: z.number().int().nonnegative(),
            unknown: z.number().int().nonnegative(),
            /**
             * Exact and exhaustive: every exclusion reason with a non-zero
             * count, and only those (a partial record over the vocabulary —
             * a reason with no excluded cast is absent, never zero).
             */
            exclusions: z.partialRecord(z.enum(PROTECTION_EXCLUSION_REASONS), z.number().int().positive()),
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
  "SPEC_PROTECTION_PALADIN.COOLDOWN_READINESS_AT": {
    owningLayer: "SPEC_PROTECTION_PALADIN",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        /** The decision point: one COMPLETE cast by the actor. */
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        /** The APL token whose cooldown is asked about. */
        simcToken: z.string().min(1),
        expected: z
          .object({
            readiness: z.enum(["PROVEN_NOT_READY", "UNKNOWN"]),
            /** Present exactly when PROVEN_NOT_READY: the lower bound the proof rests on. */
            provenRemainingAtLeastMs: z.number().int().positive().nullable(),
            /** The observed cast the proof is anchored on (report time), or null. */
            anchorReportTimeMs: z.number().int().nullable(),
            /** The ability the anchor is a cast of, or null. */
            anchorAbilityGameId: z.number().int().nullable(),
            /** The effective base the derivation used for that ability, or null when nothing anchored. */
            effectiveBaseMs: z.number().int().positive().nullable(),
            /** The engine's UNKNOWN reason for the first pinned ability, when nothing anchored. */
            unknownReason: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "At this decision the specialization's cooldown bindings derive exactly this readiness for the token from the actor's last OBSERVED cast strictly before the decision, the pinned base after the censused static modifiers, and the reviewed dynamic absence proof — PROVEN_NOT_READY with its lower bound and anchor, or UNKNOWN with the engine's reason. Never READY, and never from a later cast.",
  },
  "SPEC_PROTECTION_PALADIN.AURA_BINDING_AT": {
    owningLayer: "SPEC_PROTECTION_PALADIN",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        /** The buff atom name as the pinned APL writes it after `buff.`. */
        atomName: z.string().min(1),
        expected: z
          .object({
            /** BOUND_BY_BUILD (M10-C5 Phase B): FALSE from the observed build, with the gate in `reason`. */
            state: z.enum(["BOUND", "UNBOUND", "BOUND_BY_BUILD"]),
            up: z.boolean().nullable(),
            /** The aura spell the atom read, when the identity was established for the build. */
            abilityGameId: z.number().int().nullable(),
            /** The observed transition the answer rests on (report time), or null. */
            anchorReportTimeMs: z.number().int().nullable(),
            /** The binding's own reason when UNBOUND, the build gate when BOUND_BY_BUILD, or null. */
            reason: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "At this decision the specialization's aura bindings bind (or refuse to bind) this buff atom exactly so, from a transition M4 OBSERVED strictly before the decision on the actor's own aura, under the pinned identity the actor's build selects. Never inactive from silence, and never from a later transition.",
  },
  "SPEC_PROTECTION_PALADIN.OBSERVED_TOKEN_APPLICABILITY": {
    owningLayer: "SPEC_PROTECTION_PALADIN",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        targetActorId: z.number().int().nullable(),
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        expected: z
          .object({
            /** The authority token the observed ability binds to. */
            observedToken: z.string().min(1),
            /** Every pinned PLAYER_ACTION entry naming that token, in authority order, with its applicability. */
            entries: z
              .array(
                z
                  .object({
                    listName: z.string().min(1),
                    priorityOrdinal: z.number().int().nonnegative(),
                    applicability: z.enum(OBSERVED_TOKEN_APPLICABILITIES),
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "At this eligible decision, every pinned authority entry naming the observed action's token has exactly this applicability under the actor's PROVEN build, as the Protection applicability rules resolve it: APPLICABLE, NOT_APPLICABLE (background for this build) or UNKNOWN. A negative control's REJECTED counts for discrimination only when every entry is APPLICABLE, so the rejection cannot rest on the action being background for the build (M11-C4h). The build facts are the production analysis's own resolution; the item tokens, whose applicability reads combatant-snapshot facts the analysis does not expose, are refused (m11c4h-protection-applicability-parity).",
  },
  "SPEC_PROTECTION_PALADIN.UNKNOWN_BLOCKER_DISTRIBUTION": {
    owningLayer: "SPEC_PROTECTION_PALADIN",
    outcomeClass: "UNKNOWN",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        expected: z
          .object({
            match: z.number().int().nonnegative(),
            rejected: z.number().int().nonnegative(),
            /** Every UNKNOWN decision's engine blocker, `list[ordinal] token` -> count. Exact and exhaustive. */
            blockedAt: z.record(z.string().min(1), z.number().int().positive()),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "Every UNKNOWN decision of this actor retains an exact engine blocker at a named authority entry, and the blockers distribute exactly so; together with the resolved counts this partitions the eligible population. No UNKNOWN is blocker-less and none is dropped.",
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
        ...BUNDLE_PARAMS,
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
  "SPEC_PROTECTION_PALADIN.PUBLIC_PROJECTION": {
    owningLayer: "SPEC_PROTECTION_PALADIN",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        expected: z
          .object({
            specId: z.enum(SPEC_IDS),
            analyzerId: z.string().min(1),
            eligibleDecisions: z.number().int().nonnegative(),
            match: z.number().int().nonnegative(),
            rejected: z.number().int().nonnegative(),
            unknown: z.number().int().nonnegative(),
            excludedCastCount: z.number().int().nonnegative(),
            /**
             * The PROJECTED tally, keyed by public reason. Rows sharing a
             * public reason are merged; a reason with no casts is absent, as
             * the projection omits zero rows (a partial record, so widening
             * the public vocabulary does not invalidate an older case).
             */
            exclusions: z.partialRecord(z.enum(PUBLIC_EXCLUSION_REASONS), z.number().int().positive()),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The registration's analysis, read through its own view and projected by the real public projection, validates against warcraft-logs-coach.analysis/1 and carries exactly these totals; every excluded cast's reason and the coverage tally are mapped onto the public vocabulary (MELEE_SWING → NON_GCD_ACTION, rows merged), the tally sums to the excluded count, and no internal-only reason string or withheld field (raw blocker, domains, Holy Power, build, resolver diagnostics) reaches the document.",
  },

  // ---- SPEC_RETRIBUTION_PALADIN (M11-A4; PUBLIC since M11-A5) --------------
  //
  // The Retribution Paladin evaluator, reached through its registration.
  // INTERNAL_ONLY in M11-A4, when the application-service kinds proved the
  // public path answered SPEC_NOT_SUPPORTED for the same subject; PUBLIC since
  // M11-A5, when `PUBLIC_PROJECTION` below and the PUBLIC_CONTRACT parity
  // cases prove the same analysis reaches a public document unchanged.
  "SPEC_RETRIBUTION_PALADIN.AUTHORITY_PROVENANCE": {
    owningLayer: "SPEC_RETRIBUTION_PALADIN",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        expected: z
          .object({
            authorityId: z.literal(pinnedRetributionApl.authorityId),
            artifactRevision: z.literal(pinnedRetributionApl.artifactRevision),
            commitSha: z.literal(pinnedRetributionApl.provenance.commitSha),
            sourcePath: z.literal(pinnedRetributionApl.provenance.sourcePath),
            sourceSha256: z.literal(pinnedRetributionApl.provenance.sourceSha256),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The internal Retribution Paladin analysis cites exactly the committed pinned authority — id, revision, commit, source path and source digest — and none other. The literals are read from the committed artifact, so a re-pin fails this kind's schema before any case runs.",
  },
  "SPEC_RETRIBUTION_PALADIN.DECISION_COVERAGE": {
    owningLayer: "SPEC_RETRIBUTION_PALADIN",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
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
            rawBlocker: z.string().nullable(),
            observedActionRejected: z.boolean(),
            /** Whether the nested unselectability proof held for the observed token. */
            unselectabilityProven: z.boolean(),
            /** The proof's refusal when it did not hold, else null. */
            unselectabilityRefusal: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The internal Retribution Paladin evaluator, under the committed pinned authority, compares this observed spender cast exactly so — the shared first-GCD comparison AND the nested unselectability proof. MATCH means AUTHORITY_COMPATIBLE_ONLY after the non-domain exclusion; UNKNOWN carries the engine's own blocker verbatim; REJECTED is preserved as the evaluator produced it.",
  },
  "SPEC_RETRIBUTION_PALADIN.COVERAGE_SUMMARY": {
    owningLayer: "SPEC_RETRIBUTION_PALADIN",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        expected: z
          .object({
            eligibleDecisions: z.number().int().nonnegative(),
            match: z.number().int().nonnegative(),
            rejected: z.number().int().nonnegative(),
            unknown: z.number().int().nonnegative(),
            exclusions: z.partialRecord(z.enum(RETRIBUTION_EXCLUSION_REASONS), z.number().int().positive()),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The evaluator's coverage disclosure over this actor's every completed cast: the eligible SPENDER-decision denominator, the three outcomes that partition it, and each excluded cast counted under its named reason — including OUTSIDE_FIRST_SLICE for the in-domain casts A4 observes but does not judge. A cast is never dropped silently.",
  },
  "SPEC_RETRIBUTION_PALADIN.UNKNOWN_BLOCKER_DISTRIBUTION": {
    owningLayer: "SPEC_RETRIBUTION_PALADIN",
    outcomeClass: "UNKNOWN",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        expected: z
          .object({
            match: z.number().int().nonnegative(),
            rejected: z.number().int().nonnegative(),
            /** Every UNKNOWN decision's engine blocker, `list[ordinal] token` -> count. Exact and exhaustive. */
            blockedAt: z.record(z.string().min(1), z.number().int().positive()),
            /** Every UNKNOWN decision's ROOT-scan innermost BLOCKED step -> count (`(root scan resolved)` when none). Exact and exhaustive. */
            rootScanBlockedAt: z.record(z.string().min(1), z.number().int().positive()),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "Every UNKNOWN spender decision of this actor retains an exact engine blocker at a named authority entry, and the blockers distribute exactly so; together with the resolved counts this partitions the eligible population. The engine names the EARLIEST unresolved candidate (for this list always the NON_GCD default[0] auto_attack), so the root scan's own innermost BLOCKED step — the entry the evidence could not decide — is distributed beside it.",
  },
  "SPEC_RETRIBUTION_PALADIN.HOLY_POWER_OBSERVATION": {
    owningLayer: "SPEC_RETRIBUTION_PALADIN",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        cast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        expected: z
          .object({
            state: z.enum(["EXACT_PRE_COST", "NO_OBSERVATION"]),
            amount: z.number().int().nonnegative().nullable(),
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
      "The evaluator records exactly this Holy Power observation on this cast: the PRE_COST amount the wire carried, or NO_OBSERVATION when the cast carried no Holy Power entry (a Divine Purpose free cast). An observation, never a derived or replayed state.",
  },
  "SPEC_RETRIBUTION_PALADIN.AURA_BINDING_AT": {
    owningLayer: "SPEC_RETRIBUTION_PALADIN",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        atomName: z.string().min(1),
        expected: z
          .object({
            state: z.enum(["BOUND", "UNBOUND"]),
            up: z.boolean().nullable(),
            abilityGameId: z.number().int().nullable(),
            anchorReportTimeMs: z.number().int().nullable(),
            reason: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "At this spender decision the Retribution aura bindings bind (or refuse to bind) this buff atom exactly so, from a transition M4 OBSERVED strictly before the decision on the actor's own aura, under the pinned identity the actor's build selects. Never inactive from silence, never from a later transition.",
  },
  "SPEC_RETRIBUTION_PALADIN.STACK_BINDING_AT": {
    owningLayer: "SPEC_RETRIBUTION_PALADIN",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        atomName: z.string().min(1),
        expected: z
          .object({
            state: z.enum(["BOUND_ZERO", "UNBOUND"]),
            /** Only zero is ever bound. */
            stack: z.literal(0).nullable(),
            proof: z.enum(["PROVEN_INACTIVE", "TALENT_NOT_SELECTED"]).nullable(),
            abilityGameId: z.number().int().nullable(),
            reason: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "At this spender decision the exact-zero stack binding for this buff.<name>.stack atom is exactly so: BOUND_ZERO only under PROVEN_INACTIVE (an observed removal M4 proved) or TALENT_NOT_SELECTED (the producing talent disproved at its choice node); UNBOUND — never a positive count — when the aura is ACTIVE or its state is unknown.",
  },
  "SPEC_RETRIBUTION_PALADIN.DS_CASTABLE_AT": {
    owningLayer: "SPEC_RETRIBUTION_PALADIN",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        expected: z
          .object({
            state: z.enum(["BOUND", "UNBOUND"]),
            value: z.boolean().nullable(),
            reason: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "At this spender decision variable.ds_castable — the pinned finishers[0] value expression evaluated by the SHARED evaluator over the same aura bindings the scan uses, with active_enemies unbound — resolves exactly so: BOUND only when every enumeration agrees, else UNBOUND with the reason.",
  },
  "SPEC_RETRIBUTION_PALADIN.COOLDOWN_READINESS_AT": {
    owningLayer: "SPEC_RETRIBUTION_PALADIN",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        simcToken: z.string().min(1),
        expected: z
          .object({
            readiness: z.enum(["PROVEN_NOT_READY", "UNKNOWN"]),
            provenRemainingAtLeastMs: z.number().int().nonnegative().nullable(),
            anchorReportTimeMs: z.number().int().nullable(),
            anchorAbilityGameId: z.number().int().nullable(),
            effectiveBaseMs: z.number().int().positive().nullable(),
            unknownReason: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "At this spender decision the Retribution cooldown bindings derive this token's readiness exactly so, from the actor's last OBSERVED cast strictly before the decision under the pinned base and the reviewed modifier census. Only PROVEN_NOT_READY is ever claimed; a hasted or charge-modified base is REFUSED and stays UNKNOWN.",
  },
  "SPEC_RETRIBUTION_PALADIN.DOMAIN_RESULT": {
    owningLayer: "SPEC_RETRIBUTION_PALADIN",
    outcomeClass: "NO_AUTHORITY_AVAILABLE",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        domain: z.enum(AUTHORITY_DOMAINS),
        expected: z
          .object({
            resolution: z.enum(AUTHORITY_RESOLUTION_OUTCOMES),
            authorityId: z.string().nullable(),
            offensiveAuthorityGoverns: z.boolean().nullable(),
            evidenceFamily: z.enum(["OBSERVABLE", "NOT_OBSERVABLE", "UNVERIFIED"]).nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The evaluator represents this decision domain exactly so: the registration's own authority resolution for it (NO_PINNED_AUTHORITY_FOR_DOMAIN for the three declared-and-unbound domains, DOMAIN_NOT_DECLARED for the two a Retribution Paladin does not ask about), whether the offensive authority may govern it (never, outside OFFENSIVE_ROTATION), and for INTERRUPT the evidence family's capability stated separately from the missing standard.",
  },
  "SPEC_RETRIBUTION_PALADIN.BUILD_RESOLUTION": {
    owningLayer: "SPEC_RETRIBUTION_PALADIN",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        expected: z
          .object({
            talents: z.record(z.string().min(1), z.enum(TALENT_SELECTIONS)),
            heroTree: z.string().min(1).nullable(),
            twoHandedWeaponItemId: z.number().int().nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The evaluator resolves the actor's build from the observed talent tree and gear against the pinned Retribution datasets exactly so: every modelled talent's three-way selection (a NORMAL node absent from the tree is UNKNOWN, never NOT_SELECTED), the hero sub-tree by entry membership, and the worn item pinned as a two-handed weapon. Never inferred from a cast.",
  },
  "SPEC_RETRIBUTION_PALADIN.NON_DOMAIN_ENTRIES": {
    owningLayer: "SPEC_RETRIBUTION_PALADIN",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        /** Every `list[ordinal] token` classified OUTSIDE_SUPPORTED_DECISION_DOMAIN, in authority order. Exact and exhaustive. */
        expected: z.array(z.string().min(1)),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "Under this actor's resolved build, the Retribution applicability rules classify exactly these pinned entries OUTSIDE the rotational decision domain — racial actions, potions, item uses and external buffs — by token category, before any build fact is read; every other player action is decided by the constructor readings. No race, faction, gear use effect or consumable is read or inferred.",
  },
  "SPEC_RETRIBUTION_PALADIN.SPEC_GATE": {
    owningLayer: "SPEC_RETRIBUTION_PALADIN",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The Retribution facade refuses this specialization with SPEC_NOT_SUPPORTED before any Retribution rule runs: no comparisons, no domains, no authority.",
  },
  "SPEC_RETRIBUTION_PALADIN.ANALYSIS_STATUS": {
    owningLayer: "SPEC_RETRIBUTION_PALADIN",
    outcomeClass: "UNKNOWN",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        expected: z.enum(["PROFILE_NOT_RESOLVED", "AUTHORITY_NOT_AVAILABLE", "INSUFFICIENT_EVIDENCE"]),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "Over this artifact (or bundle) the registration refuses to analyze the actor with exactly this status — a segment with no combatant profile is PROFILE_NOT_RESOLVED, never a smaller population that reads as clean play.",
  },
  "SPEC_RETRIBUTION_PALADIN.PUBLIC_PROJECTION": {
    owningLayer: "SPEC_RETRIBUTION_PALADIN",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        expected: z
          .object({
            specId: z.enum(SPEC_IDS),
            analyzerId: z.string().min(1),
            eligibleDecisions: z.number().int().nonnegative(),
            match: z.number().int().nonnegative(),
            rejected: z.number().int().nonnegative(),
            unknown: z.number().int().nonnegative(),
            excludedCastCount: z.number().int().nonnegative(),
            /** The PROJECTED tally, keyed by public reason; zero rows are absent. */
            exclusions: z.partialRecord(z.enum(PUBLIC_EXCLUSION_REASONS), z.number().int().positive()),
            /** Named decisions, each read from the PROJECTED document by its cast. */
            decisions: z
              .array(
                z
                  .object({
                    reportTimeMs: z.number(),
                    abilityGameId: z.number().int(),
                    outcome: z.enum(PUBLIC_COMPARISON_OUTCOMES),
                    basis: z.enum(PUBLIC_COMPARISON_BASES),
                    authorityCoverage: z.enum(PUBLIC_AUTHORITY_COVERAGES),
                    authorityToken: z.string().min(1).nullable(),
                    selectionPrecision: z.enum(PUBLIC_SELECTION_PRECISIONS).nullable(),
                    decisiveBlocker: z.enum(PUBLIC_DECISION_BLOCKER_CLASSES).nullable(),
                  })
                  .strict(),
              )
              .min(1),
            /** Named excluded casts, each read from the PROJECTED document by its cast. */
            excluded: z
              .array(
                z
                  .object({
                    reportTimeMs: z.number(),
                    abilityGameId: z.number().int(),
                    reason: z.enum(PUBLIC_EXCLUSION_REASONS),
                  })
                  .strict(),
              )
              .min(1),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "M11-A5: the registration's analysis over this artifact (or bundle), read through its own view and projected by the real public projection, validates against warcraft-logs-coach.analysis/1 (the version string unchanged) and carries exactly these totals; every excluded cast's reason and the coverage tally are mapped onto the public vocabulary (MELEE_SWING → NON_GCD_ACTION, OUTSIDE_FIRST_SLICE → OUTSIDE_SUPPORTED_SLICE, rows merged), the tally sums to the excluded count; each named decision — a real MATCH, a real REJECTED, a real UNKNOWN — projects with exactly the pinned outcome, basis, coverage, token, precision and blocker class; each named excluded cast projects with exactly the pinned public reason; and no internal-only reason string or withheld field (raw blocker, root-scan stopping entry, domains, Holy Power, build resolution, resolver diagnostics, the foreground-execution proof) reaches the document.",
  },

  // ---- SPEC_BLOOD_DEATH_KNIGHT (M11-B2, INTERNAL_ONLY) --------------------
  //
  // The MEASUREMENT slice for the run_action_list dispatch cohort. The kinds
  // mirror the Retribution ones where the shape is the same, and add the two
  // this milestone exists to take: where every eligible decision's root scan
  // stopped (STOPPING_POINT_DISTRIBUTION) and how every dispatch entry of the
  // root scan was decided (DISPATCH_TRACE_AT).
  "SPEC_BLOOD_DEATH_KNIGHT.AUTHORITY_PROVENANCE": {
    owningLayer: "SPEC_BLOOD_DEATH_KNIGHT",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        expected: z
          .object({
            authorityId: z.literal(pinnedBloodApl.authorityId),
            artifactRevision: z.literal(pinnedBloodApl.artifactRevision),
            commitSha: z.literal(pinnedBloodApl.provenance.commitSha),
            sourcePath: z.literal(pinnedBloodApl.provenance.sourcePath),
            sourceSha256: z.literal(pinnedBloodApl.provenance.sourceSha256),
            /** The client-version guards the extractor evaluated; the count is read off the committed artifact. */
            conditionalCompilationGuards: z.literal(
              pinnedBloodApl.provenance.conditionalCompilation.guards.length,
            ),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The internal Blood Death Knight analysis cites exactly the committed pinned authority — id, revision, commit, source path and source digest — and none other, and that artifact records the client-version guards the extractor evaluated (the pre-12.1 lines it dropped). The literals are read from the committed artifact, so a re-pin fails this kind's schema before any case runs.",
  },
  "SPEC_BLOOD_DEATH_KNIGHT.DECISION_COVERAGE": {
    owningLayer: "SPEC_BLOOD_DEATH_KNIGHT",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
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
            rawBlocker: z.string().nullable(),
            observedActionRejected: z.boolean(),
            unselectabilityProven: z.boolean(),
            unselectabilityRefusal: z.string().nullable(),
            /** The ROOT scan's stopping entry as `list[ordinal] token`, or null when it resolved. */
            stoppingAt: z.string().nullable(),
            /** The atoms (or tagged reason) that made the stopping entry undecidable. Exact and ordered. */
            stoppingAtoms: z.array(z.string().min(1)),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The internal Blood Death Knight evaluator, under the committed pinned authority, compares this observed cast exactly so — the shared first-GCD comparison AND the nested unselectability proof — and its ROOT scan stopped at exactly this entry on exactly these atoms. MATCH means AUTHORITY_COMPATIBLE_ONLY after the non-domain exclusion; UNKNOWN carries the engine's own blocker verbatim; REJECTED is preserved as the evaluator produced it.",
  },
  "SPEC_BLOOD_DEATH_KNIGHT.COVERAGE_SUMMARY": {
    owningLayer: "SPEC_BLOOD_DEATH_KNIGHT",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        expected: z
          .object({
            eligibleDecisions: z.number().int().nonnegative(),
            match: z.number().int().nonnegative(),
            rejected: z.number().int().nonnegative(),
            unknown: z.number().int().nonnegative(),
            exclusions: z.partialRecord(z.enum(BLOOD_EXCLUSION_REASONS), z.number().int().positive()),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The evaluator's coverage disclosure over this actor's every completed cast: the eligible supported-decision denominator, the three outcomes that partition it, and each excluded cast counted under its named reason — including OUTSIDE_FIRST_SLICE for the in-domain casts the slice observes but does not judge. A cast is never dropped silently.",
  },
  "SPEC_BLOOD_DEATH_KNIGHT.STOPPING_POINT_DISTRIBUTION": {
    owningLayer: "SPEC_BLOOD_DEATH_KNIGHT",
    outcomeClass: "UNKNOWN",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        expected: z
          .object({
            match: z.number().int().nonnegative(),
            rejected: z.number().int().nonnegative(),
            /** Every eligible decision's ROOT-scan stopping entry -> count (`(root scan resolved)` when none). Exact and exhaustive. */
            stoppingEntries: z.record(z.string().min(1), z.number().int().positive()),
            /** Every eligible decision's stopping entry AND atom, `list[ordinal] token | atom` -> count. Exact and exhaustive. */
            stoppingAtoms: z.record(z.string().min(1), z.number().int().positive()),
            /** Every dispatch step of every eligible decision's ROOT scan, `list[ordinal] -> callee : outcome` -> count. Exact and exhaustive. */
            dispatchOutcomes: z.record(z.string().min(1), z.number().int().positive()),
            /** Every GCD-consuming MAY_SELECT step of every eligible decision's ROOT scan, `list[ordinal] token | atom` -> count. Exact and exhaustive. */
            undecidedGcdCandidates: z.record(z.string().min(1), z.number().int().positive()),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "THE M11-B2 MEASUREMENT. Every eligible decision of this actor retains a root-scan stopping entry with the atoms that made it undecidable, and the stopping entries, the stopping atoms and the dispatch outcomes distribute exactly so; together with the resolved counts this partitions the eligible population. The dispatch outcomes are the B1 run_action_list semantics observed on a real list: a FALSE run gate is RUN_GATE_FALSE_SKIPPED and the parent continues, a TRUE run gate enters the child and the scan ends there, an undecided one blocks.",
  },
  "SPEC_BLOOD_DEATH_KNIGHT.DISPATCH_TRACE_AT": {
    owningLayer: "SPEC_BLOOD_DEATH_KNIGHT",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        /** Every dispatch entry the ROOT scan visited at this decision, in visit order. Exact and exhaustive. */
        expected: z.array(
          z
            .object({
              at: z.string().min(1),
              actionToken: z.enum(["call_action_list", "run_action_list"]),
              calleeListName: z.string().min(1).nullable(),
              outcome: z.string().min(1),
              gate: z.string().min(1),
            })
            .strict(),
        ),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "At this decision the ROOT scan visited exactly these dispatch entries with exactly these outcomes and gate verdicts: the B1 control flow — call returns, run transfers, a FALSE run gate is skipped, an undecided run gate blocks — verified entry by entry on the pinned Blood list.",
  },
  "SPEC_BLOOD_DEATH_KNIGHT.RESOURCE_OBSERVATION": {
    owningLayer: "SPEC_BLOOD_DEATH_KNIGHT",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        cast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        expected: z
          .object({
            runes: z
              .object({
                state: z.enum(["EXACT_PRE_COST", "NO_OBSERVATION"]),
                amount: z.number().int().nonnegative().nullable(),
                max: z.number().int().positive().nullable(),
                cost: z.number().int().nonnegative().nullable(),
              })
              .strict(),
            runicPower: z
              .object({
                state: z.enum(["EXACT_PRE_COST", "NO_OBSERVATION"]),
                /** WIRE encoding (tenths of a point), verbatim. */
                amount: z.number().int().nonnegative().nullable(),
                max: z.number().int().positive().nullable(),
                cost: z.number().int().nonnegative().nullable(),
              })
              .strict(),
            /** `runic_power.deficit` in POINTS as the resolver bound it, or null. */
            runicPowerDeficit: z.number().nullable(),
            /** `rune` as the resolver bound it, or null. */
            rune: z.number().int().nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The evaluator records exactly these Rune and Runic Power observations on this cast — a PRE_COST amount only where the cast COSTS that resource; NO_OBSERVATION where the cast carries no entry for it, or only the uncosted (EVENT_ASSOCIATED) Runic Power pool an uncosted cast carries — and binds runic_power.deficit (points, converted once from the wire's tenths) and rune exactly so. Observations, never derived, replayed or regenerated state; the wire's cost field is never read as the cost paid.",
  },
  "SPEC_BLOOD_DEATH_KNIGHT.AURA_BINDING_AT": {
    owningLayer: "SPEC_BLOOD_DEATH_KNIGHT",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        atomName: z.string().min(1),
        expected: z
          .object({
            state: z.enum(["BOUND", "UNBOUND"]),
            up: z.boolean().nullable(),
            abilityGameId: z.number().int().nullable(),
            proof: z
              .enum([
                "HERO_TREE_EXCLUDED",
                "TALENT_NOT_SELECTED",
                "OBSERVED",
                "WINDOW_ORDER_INVARIANT_PRESENCE",
              ])
              .nullable(),
            anchorReportTimeMs: z.number().int().nullable(),
            reason: z.string().nullable(),
            auraReason: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "At this decision the Blood aura bindings bind (or refuse to bind) this buff atom exactly so: from a transition M4 OBSERVED strictly before the decision on the actor's own aura, or from a build proof — the aura's every producer is a hero talent of the OTHER resolved sub-tree, or its producing talent is disproved at its choice node — or (M11-B10, bone_shield only) inside the 50 ms pre-decision window, the presence M4 proves on BOTH sides of a cluster of the aura's own stack gains (WINDOW_ORDER_INVARIANT_PRESENCE; ACTIVE before the cluster and at the decision, so under every ordering). Never inactive from silence, never from a later transition, never from a count.",
  },
  "SPEC_BLOOD_DEATH_KNIGHT.STACK_BINDING_AT": {
    owningLayer: "SPEC_BLOOD_DEATH_KNIGHT",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        atomName: z.string().min(1),
        expected: z
          .object({
            state: z.enum(["BOUND", "BOUND_SET", "UNBOUND"]),
            stack: z.number().int().nonnegative().nullable(),
            proof: z
              .enum([
                "HERO_TREE_EXCLUDED",
                "TALENT_NOT_SELECTED",
                "OBSERVED",
                "PROVEN_INACTIVE",
                "EXACT_STACK_OBSERVATION",
                "EXACT_STACK_APPLICATION",
                "WINDOW_ORDER_INVARIANT_SET",
              ])
              .nullable(),
            abilityGameId: z.number().int().nullable(),
            reason: z.string().nullable(),
            /** M11-B9: the finite set of exact counts a BOUND_SET is one of (sorted, at least two); null otherwise. */
            possibleStacks: z.array(z.number().int().nonnegative()).min(2).nullable(),
            /** M11-B9: both orderings a BOUND_SET was taken over; null otherwise. */
            windowOrderInvariance: z
              .object({
                cluster: z.array(
                  z
                    .object({
                      reportTimeMs: z.number().int(),
                      operation: z.enum(["APPLIED", "REFRESHED", "REMOVED"]),
                      isStackChange: z.boolean(),
                      leadMs: z.number().int(),
                    })
                    .strict(),
                ),
                beforeClusterStack: z.number().int().nonnegative(),
                beforeClusterProof: z.enum([
                  "EXACT_STACK_OBSERVATION",
                  "EXACT_STACK_APPLICATION",
                  "PROVEN_INACTIVE_BEFORE_APPLICATION",
                ]),
                afterClusterStack: z.number().int().nonnegative(),
              })
              .strict()
              .nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "At this decision the stack binding for this buff.<name>.stack atom is exactly so: zero under PROVEN_INACTIVE or a build proof; for the atoms carrying a Blood exact-count rule (bone_shield since M11-B2, blood_debt since M11-B6, essence_of_the_blood_queen since M11-B9), the exact positive count the last stack-bearing transition reported, when every later transition up to the decision is its same-millisecond refresh companion and M4 proves the aura ACTIVE under coverage (EXACT_STACK_OBSERVATION) — or, for blood_debt and essence_of_the_blood_queen, the pinned count 1 of a plain application preceded by a removal or by nothing (EXACT_STACK_APPLICATION); for essence_of_the_blood_queen inside the 50 ms pre-decision window, the finite set of exact counts both orderings of a single stack gain (or fresh application) leave, never one chosen (BOUND_SET / WINDOW_ORDER_INVARIANT_SET, with both worlds recorded); UNBOUND with the reason otherwise — a lone refresh or an initial application after the last count is COUNT_AMBIGUOUS_SINCE_OBSERVATION, an application to an aura already held is APPLICATION_WHILE_ACTIVE_UNPINNED, an observed count above the effective maximum the Blood stack authority resolves (or above the DBC maximum while the modifier talent is unproven) is COUNT_EXCEEDS_PINNED_MAX, never a guess.",
  },
  "SPEC_BLOOD_DEATH_KNIGHT.STACK_EVIDENCE_CENSUS": {
    owningLayer: "SPEC_BLOOD_DEATH_KNIGHT",
    outcomeClass: "UNKNOWN",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        expected: z
          .object({
            /** Every eligible decision's stack evidence per modelled stack atom, `atom | <proof> / <unbound reason>` -> count. Exact and exhaustive: each atom's rows sum to the eligible population. */
            stackEvidence: z.record(z.string().min(1), z.number().int().positive()),
            /** Every BOUND stack value, `atom | stack <n>` -> count. Exact and exhaustive. */
            stackValues: z.record(z.string().min(1), z.number().int().positive()),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "THE M11-B6 MEASUREMENT. Every eligible decision's buff.<name>.stack evidence for every modelled Blood stack atom distributes exactly so, and every bound count is counted by its value. Nothing here is a verdict; the census is what the Blood Debt slice exists to take.",
  },
  "SPEC_BLOOD_DEATH_KNIGHT.BLOOD_DEBT_TRANSITION_CENSUS": {
    owningLayer: "SPEC_BLOOD_DEATH_KNIGHT",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        expected: z
          .object({
            /** Every transition of the actor's own Blood Debt track by raw operation. Exact; zero rows are pinned too. */
            transitions: z
              .object({
                applybuff: z.number().int().nonnegative(),
                applybuffstack: z.number().int().nonnegative(),
                refreshbuff: z.number().int().nonnegative(),
                removebuffstack: z.number().int().nonnegative(),
                removebuff: z.number().int().nonnegative(),
              })
              .strict(),
            /** Every transition's absolute `stack` in canonical order; null where none is carried. */
            stackValues: z.array(z.number().int().nonnegative().nullable()),
            sameMillisecondPairs: z.number().int().nonnegative(),
            /** `<abilityGameId>` (or "none") -> count of transitions by the nearest own COMPLETE cast preceding within 100 ms. A description of the wire's order, not an attribution the evaluator makes. */
            precedingOwnCast: z.record(z.string().min(1), z.number().int().positive()),
            lagMs: z.object({ min: z.number().int().nullable(), max: z.number().int().nullable() }).strict(),
            /** The smallest gap from a transition to the next eligible decision at or after it, in ms; null when no decision follows any transition. */
            minGapToNextDecisionMs: z.number().int().nonnegative().nullable(),
            /** The prospective walk: from the state bound after each transition, the next transition is consistent with the pinned model (application after zero, count = previous + 1, removal at the maximum). */
            validation: z
              .object({
                points: z.number().int().nonnegative(),
                consistent: z.number().int().nonnegative(),
                inconsistent: z.number().int().nonnegative(),
              })
              .strict(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "M11-B6. The actor's own Blood Debt (1310372) track over the evaluation window is exactly so: how many transitions of each raw shape, every absolute count in order, no two in one millisecond, the lag of each behind the own cast that precedes it, the smallest gap to the next eligible decision (a lead inside Blood's 50 ms window would be refused), and the retrospective walk of the pinned model against every later observation — validation of the rule from the future, which the evaluator never reads. Population pins for this corpus and game version, not correctness rules.",
  },
  "SPEC_BLOOD_DEATH_KNIGHT.REMAINS_BINDING_AT": {
    owningLayer: "SPEC_BLOOD_DEATH_KNIGHT",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        atomName: z.string().min(1),
        expected: z
          .object({
            state: z.enum(["BOUND", "UNBOUND"]),
            proof: z
              .enum([
                "HERO_TREE_EXCLUDED",
                "TALENT_NOT_SELECTED",
                "PROVEN_INACTIVE",
                "PERMANENT_ACTIVE",
                "GAIN_ANCHOR_EXACT",
                "GAIN_ANCHOR_BOUNDED",
                "WINDOW_ORDER_INVARIANT_BOUNDED",
              ])
              .nullable(),
            /** The binding's state: KNOWN_NUMBER / BOUNDED_NUMBER for BOUND; null for UNBOUND. */
            bindingState: z.enum(["KNOWN_NUMBER", "BOUNDED_NUMBER"]).nullable(),
            /** MILLISECONDS: the exact remainder or the lower bound; null for zero / permanent proofs and UNBOUND. */
            remainsMs: z.number().int().nullable(),
            /** The gain (or removal / presence anchor) report time the value rests on; null for build proofs and UNBOUND. */
            anchorReportTimeMs: z.number().int().nullable(),
            reason: z.string().nullable(),
            /** The refused transition's lead, for PRE_DECISION_WINDOW_TRANSITION (and a window-refused tolerance refusal); null otherwise. */
            windowLeadMs: z.number().int().nullable(),
            /** M11-B8: the two orderings a WINDOW_ORDER_INVARIANT_BOUNDED value is the minimum over; null for every other proof and for UNBOUND. */
            windowOrderInvariance: z
              .object({
                cluster: z.array(
                  z
                    .object({
                      reportTimeMs: z.number().int(),
                      operation: z.enum(["APPLIED", "REFRESHED", "REMOVED"]),
                      isStackChange: z.boolean(),
                      leadMs: z.number().int(),
                    })
                    .strict(),
                ),
                /** H1, MILLISECONDS: the chain before the cluster projected to the decision. */
                beforeClusterMs: z.number().int(),
                beforeClusterProof: z.enum(["GAIN_ANCHOR_EXACT", "GAIN_ANCHOR_BOUNDED"]),
                /** H2, MILLISECONDS: the pinned duration minus the latest transition's lead. */
                resetInClusterMs: z.number().int(),
              })
              .strict()
              .nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "M11-B4 / M11-B8. At this decision the Blood remains derivation binds (or refuses to bind) this buff.<name>.remains atom exactly so: an EXACT remainder from the last application, stack gain or — for an identity whose policy reads a lone refresh as the pinned trigger — refresh, under continuity from that gain and the pinned Blood duration; a LOWER BOUND past a refresh of unpinned or unproven cause (a Bone Shield refresh beside a stack removal; any lone Essence of the Blood Queen refresh since M11-B8); the ORDER-INVARIANT lower bound inside the 50 ms pre-decision window for Essence, the minimum of the chain before the cluster and a reset in it, with both orderings recorded; exactly zero from an observed removal or a build proof; SimulationCraft's permanent sentinel for an active Vampiric Strike; UNBOUND with the reason otherwise — a transition inside the window with no order-invariant floor, a coverage gap from the gain, no gain observed, a bound that has run out, a contradiction, or an exact value or order-invariant edge within 50 ms of a pinned threshold. Never from silence, never from a later transition, never clamped, never an ordering chosen.",
  },
  "SPEC_BLOOD_DEATH_KNIGHT.RUNIC_POWER_STATE_AT": {
    owningLayer: "SPEC_BLOOD_DEATH_KNIGHT",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        expected: z
          .object({
            state: z.enum(["BOUND", "UNBOUND"]),
            proof: z.enum(["OWN_PRE_COST", "CARRIED_EXACT", "WINDOW_BOUNDED"]).nullable(),
            bindingState: z.enum(["KNOWN_NUMBER", "BOUNDED_NUMBER"]).nullable(),
            /** `runic_power.deficit` in POINTS: the exact value, or the lower bound. */
            deficitPoints: z.number().nullable(),
            /** The exact current amount (wire tenths) for the exact proofs; null otherwise. */
            currentWire: z.number().int().nullable(),
            /** The proven upper limit (wire tenths) for WINDOW_BOUNDED; null otherwise. */
            atMostWire: z.number().int().nullable(),
            maxWire: z.number().int().nullable(),
            anchorReportTimeMs: z.number().int().nullable(),
            anchorTiming: z.enum(RESOURCE_OBSERVATION_TIMINGS).nullable(),
            windowLeadsMs: z.array(z.number().int()),
            reason: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "M11-B5. At this decision the Blood Runic Power state is exactly so: the decision's own PRE_COST amount (OWN_PRE_COST); the latest observed amount carried under RESOURCES and CASTS continuity with nothing inside the 1 ms resource window (CARRIED_EXACT); a lower bound on the deficit from non-negative changes 0-1 ms ahead of the decision whose side of it is not pinned (WINDOW_BOUNDED); or UNBOUND with the reason — no anchor, a gap, a costed cast with no observation after it, a contradiction, a spend or negative change in the window, a missing or changed max. Never `pre - cost`, never a summed delta.",
  },
  "SPEC_BLOOD_DEATH_KNIGHT.RUNIC_POWER_EVIDENCE_CENSUS": {
    owningLayer: "SPEC_BLOOD_DEATH_KNIGHT",
    outcomeClass: "UNKNOWN",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        expected: z
          .object({
            /** Every eligible decision's Runic Power evidence, `OWN_PRE_COST / CARRIED_EXACT / WINDOW_BOUNDED / <reason>` -> count. Exact and exhaustive. */
            runicPowerEvidence: z.record(z.string().min(1), z.number().int().positive()),
            /** Every window observation's lead, `lead <ms>` -> count. Exact and exhaustive. */
            runicPowerWindowLeads: z.record(z.string().min(1), z.number().int().positive()),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "THE M11-B5 MEASUREMENT. Every eligible decision's Runic Power evidence distributes exactly so, and every observation inside the 1 ms resource window is counted by its lead. Nothing here is a verdict.",
  },
  "SPEC_BLOOD_DEATH_KNIGHT.REMAINS_EVIDENCE_CENSUS": {
    owningLayer: "SPEC_BLOOD_DEATH_KNIGHT",
    outcomeClass: "UNKNOWN",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        expected: z
          .object({
            /** Every eligible decision's remains evidence per modelled aura, `atom | EXACT / BOUNDED / ZERO_BY_PROOF / PERMANENT / <reason>` -> count. Exact and exhaustive: each atom's rows sum to the eligible population. */
            remainsEvidence: z.record(z.string().min(1), z.number().int().positive()),
            /** Every pre-decision-window refusal across the aura, stack and remains bindings, `atom | up / stack / remains | lead <ms>` -> count. Exact and exhaustive. */
            preDecisionWindowRefusals: z.record(z.string().min(1), z.number().int().positive()),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "THE M11-B4 MEASUREMENT. Every eligible decision's buff.<name>.remains evidence for every modelled Blood aura distributes exactly so, and the cost of the 50 ms Blood pre-decision window is disclosed by lead. Nothing here is a verdict; the census is what the remains slice exists to take.",
  },
  "SPEC_BLOOD_DEATH_KNIGHT.RUNE_AFFORDABILITY_AT": {
    owningLayer: "SPEC_BLOOD_DEATH_KNIGHT",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        expected: z
          .object({
            evidence: z.enum(BLOOD_RUNE_AFFORDABILITY_EVIDENCE),
            /** The decision cast's own exact PRE_COST Rune count, or null when none is established. */
            runes: z.number().int().nonnegative().nullable(),
            runesMax: z.number().int().positive().nullable(),
            /** The wire's cost field on the SAME entry: identity corroboration, never the mechanical cost. */
            wireCost: z.number().int().nullable(),
            /** The pinned Marrowrend Rune cost the count was compared to, or null when the record was not usable. */
            pinnedRuneCost: z.number().int().positive().nullable(),
            pinnedSpellId: z.number().int().positive().nullable(),
            cooldownFree: z.boolean().nullable(),
            costModifiersExcluded: z.boolean(),
            /** Whether the fact proves Marrowrend usable at this decision. Never true below the cost. */
            marrowrendProvenUsable: z.boolean(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "M11-B7. At this decision Marrowrend's Rune affordability is exactly so: the count is the decision cast's OWN exact PRE_COST Rune entry (never a carried, regenerated or delta-derived value; NO_RUNE_OBSERVATION on a cast that costs no Runes), the cost is the pinned DBC row (never the wire's cost field), the modifier is excluded only by a RESOLVED non-Deathbringer hero tree (MODIFIER_UNPROVEN otherwise), and the proof is one-directional: at or above the cost with a cooldown-free instant record proves Marrowrend usable; below it is OWN_PRE_COST_BELOW_COST, recorded and never a negative proof.",
  },
  "SPEC_BLOOD_DEATH_KNIGHT.RUNE_AFFORDABILITY_CENSUS": {
    owningLayer: "SPEC_BLOOD_DEATH_KNIGHT",
    outcomeClass: "UNKNOWN",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        expected: z
          .object({
            /** Every eligible decision's Rune affordability evidence class -> count. Exact and exhaustive. */
            runeAffordabilityEvidence: z.partialRecord(
              z.enum(BLOOD_RUNE_AFFORDABILITY_EVIDENCE),
              z.number().int().positive(),
            ),
            /** Every EXACT own-cast Rune count, `runes <n>` -> count. Exact and exhaustive over the EXACT rows. */
            runeCounts: z.record(z.string().min(1), z.number().int().positive()),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "THE M11-B7 MEASUREMENT. Every eligible decision's Marrowrend Rune-affordability evidence distributes exactly so, and every exact own-cast Rune count is tallied. Nothing here is a verdict.",
  },
  "SPEC_BLOOD_DEATH_KNIGHT.COOLDOWN_READINESS_AT": {
    owningLayer: "SPEC_BLOOD_DEATH_KNIGHT",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        simcToken: z.string().min(1),
        expected: z
          .object({
            readiness: z.enum(["PROVEN_NOT_READY", "UNKNOWN"]),
            provenRemainingAtLeastMs: z.number().int().nonnegative().nullable(),
            anchorReportTimeMs: z.number().int().nullable(),
            anchorAbilityGameId: z.number().int().nullable(),
            effectiveBaseMs: z.number().int().positive().nullable(),
            unknownReason: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "At this decision the Blood cooldown bindings derive this token's readiness exactly so, through the shared token-cooldown derivation, from the actor's last OBSERVED cast strictly before the decision under the pinned base and the reviewed modifier census (Dancing Rune Weapon: 120,000 ms less Insatiable Blade's 30,000 ms when SELECTED). Only PROVEN_NOT_READY is ever claimed.",
  },
  "SPEC_BLOOD_DEATH_KNIGHT.DOMAIN_RESULT": {
    owningLayer: "SPEC_BLOOD_DEATH_KNIGHT",
    outcomeClass: "NO_AUTHORITY_AVAILABLE",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        domain: z.enum(AUTHORITY_DOMAINS),
        expected: z
          .object({
            resolution: z.enum(AUTHORITY_RESOLUTION_OUTCOMES),
            authorityId: z.string().nullable(),
            offensiveAuthorityGoverns: z.boolean().nullable(),
            evidenceFamily: z.enum(["OBSERVABLE", "NOT_OBSERVABLE", "UNVERIFIED"]).nullable(),
            /** The Death Strike dual-role marker on the offensive result, else null. */
            deathStrikeDualRole: z.boolean().nullable(),
            /** The shared-button marker on the two survival domains, else null. */
            sharesActionWithOffensive: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The evaluator represents this decision domain exactly so: the registration's own authority resolution (AUTHORITY_AVAILABLE for OFFENSIVE_ROTATION, NO_PINNED_AUTHORITY_FOR_DOMAIN for the five declared-and-unbound domains a tank asks about; never DOMAIN_NOT_DECLARED), whether the offensive authority may govern it (never, outside OFFENSIVE_ROTATION), the Death Strike dual-role and shared-button markers that keep the spender verdict from reading as a survival verdict, and for INTERRUPT the evidence family's capability stated separately from the missing standard.",
  },
  "SPEC_BLOOD_DEATH_KNIGHT.BUILD_RESOLUTION": {
    owningLayer: "SPEC_BLOOD_DEATH_KNIGHT",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        expected: z
          .object({
            talents: z.record(z.string().min(1), z.enum(TALENT_SELECTIONS)),
            heroTree: z.string().min(1).nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The evaluator resolves the actor's build from the observed talent tree against the pinned Blood talent dataset exactly so: every modelled talent's three-way selection (a NORMAL node absent from the tree — Consumption, Exterminate, Reaper's Mark here — is UNKNOWN, never NOT_SELECTED) and the hero sub-tree by entry membership. Never inferred from a cast.",
  },
  "SPEC_BLOOD_DEATH_KNIGHT.NON_DOMAIN_ENTRIES": {
    owningLayer: "SPEC_BLOOD_DEATH_KNIGHT",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        /** Every `list[ordinal] token` classified OUTSIDE_SUPPORTED_DECISION_DOMAIN, in authority order. Exact and exhaustive. */
        expected: z.array(z.string().min(1)),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "Under this actor's resolved build, the Blood applicability rules classify exactly these pinned entries OUTSIDE the rotational decision domain — the item uses, the racial actions (Arcane Torrent among them), the potion — by the shared token categories, before any build fact is read; every other player action is decided by the constructor readings. No race, faction, gear use effect or consumable is read or inferred.",
  },
  "SPEC_BLOOD_DEATH_KNIGHT.SPEC_GATE": {
    owningLayer: "SPEC_BLOOD_DEATH_KNIGHT",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The Blood facade refuses this specialization with SPEC_NOT_SUPPORTED before any Blood rule runs: no comparisons, no domains, no authority.",
  },
  "SPEC_BLOOD_DEATH_KNIGHT.ANALYSIS_STATUS": {
    owningLayer: "SPEC_BLOOD_DEATH_KNIGHT",
    outcomeClass: "UNKNOWN",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BUNDLE_PARAMS,
        expected: z.enum(["PROFILE_NOT_RESOLVED", "AUTHORITY_NOT_AVAILABLE", "INSUFFICIENT_EVIDENCE"]),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "Over this artifact (or bundle) the registration refuses to analyze the actor with exactly this status — a segment with no combatant profile is PROFILE_NOT_RESOLVED, never a smaller population that reads as clean play.",
  },

  // ---- SPEC_BREWMASTER_MONK (M11-C2; PUBLIC since M11-C4j) ----------------
  //
  // The MEASUREMENT slice for the next cohort's representative. The kinds
  // mirror the Blood ones where the shape is the same, and add what this
  // authority needs measured: why each UNKNOWN is UNKNOWN even when the root
  // scan resolves (`unresolvedAt`), the NON_GCD candidates beside the GCD
  // ones, and the state-evidence census (aura presence, the Empty the Cellar
  // readiness aura, the pinned cooldown readiness).
  "SPEC_BREWMASTER_MONK.AUTHORITY_PROVENANCE": {
    owningLayer: "SPEC_BREWMASTER_MONK",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        expected: z
          .object({
            authorityId: z.literal(pinnedBrewmasterApl.authorityId),
            artifactRevision: z.literal(pinnedBrewmasterApl.artifactRevision),
            commitSha: z.literal(pinnedBrewmasterApl.provenance.commitSha),
            sourcePath: z.literal(pinnedBrewmasterApl.provenance.sourcePath),
            sourceSha256: z.literal(pinnedBrewmasterApl.provenance.sourceSha256),
            /** The namespace/function region selector; the artifact carries no marker field. */
            regionSelector: z
              .object({
                kind: z.literal(pinnedBrewmasterApl.provenance.regionSelector.kind),
                enclosingNamespace: z.literal(
                  pinnedBrewmasterApl.provenance.regionSelector.enclosingNamespace,
                ),
                functionHeader: z.literal(pinnedBrewmasterApl.provenance.regionSelector.functionHeader),
                playerIdentifier: z.literal(pinnedBrewmasterApl.provenance.regionSelector.playerIdentifier),
              })
              .strict(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The internal Brewmaster Monk analysis cites exactly the committed pinned authority — id, revision, commit, source path and source digest — and none other, and that artifact's region is the NAMESPACE_FUNCTION selection (namespace, exact function header, player identifier) the extractor recorded, with no marker field. The literals are read from the committed artifact, so a re-pin fails this kind's schema before any case runs.",
  },
  "SPEC_BREWMASTER_MONK.DECISION_COVERAGE": {
    owningLayer: "SPEC_BREWMASTER_MONK",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        targetActorId: z.number().int().nullable(),
        ...BREWMASTER_BUNDLE_PARAMS,
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        expected: z
          .object({
            outcome: z.enum(COMPARISON_OUTCOMES),
            basis: z.enum(COMPARISON_BASES),
            authorityCoverage: z.enum(DECISION_COVERAGES),
            authorityToken: z.string().nullable(),
            selectionPrecision: z.enum(["EXACT_ENTRY", "TOKEN_CONVERGED"]).nullable(),
            decisiveBlocker: z.enum(DECISION_BLOCKER_CLASSES).nullable(),
            rawBlocker: z.string().nullable(),
            /** The entry the first-GCD query names in its refusal, as `list[ordinal] token`, or null. */
            unresolvedAt: z.string().nullable(),
            observedActionRejected: z.boolean(),
            unselectabilityProven: z.boolean(),
            unselectabilityRefusal: z.string().nullable(),
            /** The ROOT scan's stopping entry as `list[ordinal] token`, or null when it resolved. */
            stoppingAt: z.string().nullable(),
            stoppingAtoms: z.array(z.string().min(1)),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The internal Brewmaster Monk evaluator, under the committed pinned authority, compares this observed cast exactly so — the shared first-GCD comparison AND the nested unselectability proof — and the query's refusal (when UNKNOWN) names exactly this entry. MATCH means AUTHORITY_COMPATIBLE_ONLY after the non-domain exclusion; UNKNOWN carries the engine's own blocker verbatim; a refused NON_GCD brew branch is never read as a selection.",
  },
  "SPEC_BREWMASTER_MONK.COVERAGE_SUMMARY": {
    owningLayer: "SPEC_BREWMASTER_MONK",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BREWMASTER_BUNDLE_PARAMS,
        expected: z
          .object({
            eligibleDecisions: z.number().int().nonnegative(),
            match: z.number().int().nonnegative(),
            rejected: z.number().int().nonnegative(),
            unknown: z.number().int().nonnegative(),
            exclusions: z.partialRecord(z.enum(BREWMASTER_EXCLUSION_REASONS), z.number().int().positive()),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The evaluator's coverage disclosure over this actor's every completed cast: the eligible supported-decision denominator, the three outcomes that partition it, and each excluded cast counted under its named reason — EXECUTION_LANE_NOT_ESTABLISHED for the casts the pinned lane data has no record of, never a guessed lane. A cast is never dropped silently.",
  },
  "SPEC_BREWMASTER_MONK.MEASUREMENT_DISTRIBUTION": {
    owningLayer: "SPEC_BREWMASTER_MONK",
    outcomeClass: "UNKNOWN",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BREWMASTER_BUNDLE_PARAMS,
        expected: z
          .object({
            match: z.number().int().nonnegative(),
            rejected: z.number().int().nonnegative(),
            exactEntryMatches: z.number().int().nonnegative(),
            tokenConvergedMatches: z.number().int().nonnegative(),
            /** Every eligible decision's observed token -> count. Exact and exhaustive. */
            eligibleTokens: z.record(z.string().min(1), z.number().int().positive()),
            /** Every UNKNOWN decision's `<raw blocker> @ <entry>` -> count. Exact and exhaustive. */
            unresolvedAt: z.record(z.string().min(1), z.number().int().positive()),
            unknownBlockerClasses: z.partialRecord(
              z.enum(DECISION_BLOCKER_CLASSES),
              z.number().int().positive(),
            ),
            /** Every eligible decision's ROOT-scan stopping entry -> count. Exact and exhaustive. */
            stoppingEntries: z.record(z.string().min(1), z.number().int().positive()),
            stoppingAtoms: z.record(z.string().min(1), z.number().int().positive()),
            /** Every dispatch step of every eligible decision's ROOT scan -> count. Exact and exhaustive. */
            dispatchOutcomes: z.record(z.string().min(1), z.number().int().positive()),
            /** Every GCD-consuming MAY_SELECT step, `list[ordinal] token | atom` -> count. Exact and exhaustive. */
            undecidedGcdCandidates: z.record(z.string().min(1), z.number().int().positive()),
            /** Every NON_GCD MAY_SELECT step, same keying. Exact and exhaustive. */
            undecidedNonGcdCandidates: z.record(z.string().min(1), z.number().int().positive()),
            /** Every non-melee completed cast by lane and base GCD -> count. Exact and exhaustive. */
            gcdDistribution: z.record(z.string().min(1), z.number().int().positive()),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "THE M11-C2 MEASUREMENT. Over this actor's eligible decisions, the resolved counts, the per-token population, WHY each UNKNOWN is UNKNOWN (the first-GCD query's refusal and the entry it names — a refused NON_GCD brew branch, or the head of diverging worlds), the root-scan stopping entries and atoms, every dispatch outcome (the hero-tree run gates: the other tree's list skipped as RUN_GATE_FALSE_SKIPPED, the resolved tree's entered), every undecided GCD and NON_GCD candidate, and the lane/GCD distribution of every non-melee cast distribute exactly so.",
  },
  "SPEC_BREWMASTER_MONK.STATE_EVIDENCE_CENSUS": {
    owningLayer: "SPEC_BREWMASTER_MONK",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BREWMASTER_BUNDLE_PARAMS,
        expected: z
          .object({
            /** `atom | up <bool> (<proof>)` or `atom | <unbound reason>` -> count. Exact and exhaustive. */
            auraEvidence: z.record(z.string().min(1), z.number().int().positive()),
            /** `token | <PROVEN_INACTIVE or reason>` -> count. Exact and exhaustive. */
            readinessAuraEvidence: z.record(z.string().min(1), z.number().int().positive()),
            /** `token | <PROVEN_NOT_READY or reason>` -> count. Exact and exhaustive. */
            cooldownReadiness: z.record(z.string().min(1), z.number().int().positive()),
            /**
             * M11-C4i: `token | PROVEN_USABLE` or `token | NOT_PROVEN: <first unresolved dimension>(<reason>)`
             * -> count, over every supported unobserved token at every decision. Exact and exhaustive.
             */
            positiveUsability: z.record(z.string().min(1), z.number().int().positive()),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "Over this actor's eligible decisions the Brewmaster state bindings distribute exactly so: each pinned buff atom's presence from an M4 transition strictly before the decision (or a talent disproof), or its refusal; the Empty the Cellar readiness aura, queried only under its corroborated wire id (M11-C4i) and never proven inactive from silence; each pinned cooldown's readiness, PROVEN_NOT_READY only from an observed cast under the pinned base; and (M11-C4i) each supported unobserved token's positive usability conclusion — PROVEN_USABLE only when every dimension of the completeness contract is proven or not applicable, otherwise the first unresolved dimension and its reason.",
  },
  "SPEC_BREWMASTER_MONK.DISPATCH_TRACE_AT": {
    owningLayer: "SPEC_BREWMASTER_MONK",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        /** Every dispatch entry the ROOT scan visited at this decision, in visit order. Exact and exhaustive. */
        expected: z.array(
          z
            .object({
              at: z.string().min(1),
              actionToken: z.enum(["call_action_list", "run_action_list"]),
              calleeListName: z.string().min(1).nullable(),
              outcome: z.string().min(1),
              gate: z.string().min(1),
            })
            .strict(),
        ),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "At this decision the ROOT scan visited exactly these dispatch entries with exactly these outcomes and gate verdicts: the two non-domain call lists return having selected nothing, the Master of Harmony run gate is FALSE and skipped, and the Shado-Pan run gate is TRUE and entered — the hero-tree dispatch confirmed entry by entry on the pinned Brewmaster list.",
  },
  "SPEC_BREWMASTER_MONK.AURA_BINDING_AT": {
    owningLayer: "SPEC_BREWMASTER_MONK",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        atomName: z.string().min(1),
        expected: z
          .object({
            state: z.enum(["BOUND", "UNBOUND"]),
            up: z.boolean().nullable(),
            abilityGameId: z.number().int().nullable(),
            proof: z.enum(["OBSERVED", "TALENT_NOT_SELECTED"]).nullable(),
            anchorReportTimeMs: z.number().int().nullable(),
            reason: z.string().nullable(),
            auraReason: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "At this decision the Brewmaster aura bindings bind (or refuse to bind) this buff atom exactly so: from a transition M4 OBSERVED strictly before the decision on the actor's own aura, or from a talent disproof. Never inactive from silence, never from a later transition, and never from the pull snapshot.",
  },
  "SPEC_BREWMASTER_MONK.COOLDOWN_READINESS_AT": {
    owningLayer: "SPEC_BREWMASTER_MONK",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        simcToken: z.string().min(1),
        expected: z
          .object({
            readiness: z.enum(["PROVEN_NOT_READY", "UNKNOWN"]),
            provenRemainingAtLeastMs: z.number().int().nonnegative().nullable(),
            anchorReportTimeMs: z.number().int().nullable(),
            anchorAbilityGameId: z.number().int().nullable(),
            effectiveBaseMs: z.number().int().positive().nullable(),
            unknownReason: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "At this decision the Brewmaster cooldown bindings derive this token's readiness exactly so, through the shared token-cooldown derivation, from the actor's last OBSERVED cast strictly before the decision under the M11-C1 pinned base and modifier census (Invoke Niuzao: 120,000 ms less Efficient Training's 25,000 ms when SELECTED). Only PROVEN_NOT_READY is ever claimed.",
  },
  "SPEC_BREWMASTER_MONK.DOMAIN_RESULT": {
    owningLayer: "SPEC_BREWMASTER_MONK",
    outcomeClass: "NO_AUTHORITY_AVAILABLE",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        domain: z.enum(AUTHORITY_DOMAINS),
        expected: z
          .object({
            resolution: z.enum(AUTHORITY_RESOLUTION_OUTCOMES),
            authorityId: z.string().nullable(),
            offensiveAuthorityGoverns: z.boolean().nullable(),
            evidenceFamily: z.enum(["OBSERVABLE", "NOT_OBSERVABLE", "UNVERIFIED"]).nullable(),
            /** The offensive-list tokens this defensive domain shares, else null. */
            sharesActionsWithOffensive: z.array(z.string().min(1)).nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The evaluator represents this decision domain exactly so: the registration's own authority resolution (AUTHORITY_AVAILABLE for OFFENSIVE_ROTATION, NO_PINNED_AUTHORITY_FOR_DOMAIN for the five declared-and-unbound domains a tank asks about; never DOMAIN_NOT_DECLARED), whether the offensive authority may govern it (never, outside OFFENSIVE_ROTATION), the brews and Expel Harm named on the defensive domains they also serve, and for INTERRUPT the evidence family's capability stated separately from the missing standard.",
  },
  "SPEC_BREWMASTER_MONK.BUILD_RESOLUTION": {
    owningLayer: "SPEC_BREWMASTER_MONK",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        expected: z
          .object({
            talents: z.record(z.string().min(1), z.enum(TALENT_SELECTIONS)),
            heroTree: z.string().min(1).nullable(),
            apex1: z.enum(TALENT_SELECTIONS),
            apex3: z.enum(TALENT_SELECTIONS),
            /** The six build-static atoms as the resolver bound them; null = unbound. */
            buildStaticAtoms: z.record(z.string().min(1), z.boolean().nullable()),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The evaluator resolves the actor's build from the observed talent tree against the pinned Brewmaster talent dataset exactly so — every modelled talent's three-way selection, the hero sub-tree by entry membership, the two apex tiers the list reads by the shared positional rule — and binds the six build-static atoms truthfully from that resolution: the resolved tree TRUE and the other FALSE, never inferred from a cast.",
  },
  "SPEC_BREWMASTER_MONK.NON_DOMAIN_ENTRIES": {
    owningLayer: "SPEC_BREWMASTER_MONK",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        /** Every `list[ordinal] token` classified OUTSIDE_SUPPORTED_DECISION_DOMAIN, in authority order. Exact and exhaustive. */
        expected: z.array(z.string().min(1)),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "Under this actor's resolved build, the Brewmaster applicability rules classify exactly these pinned entries OUTSIDE the rotational decision domain — the potions, the item use and the seven racial actions — by the shared token categories, before any build fact is read. No race, faction, gear use effect or consumable is read or inferred.",
  },
  "SPEC_BREWMASTER_MONK.SPEC_GATE": {
    owningLayer: "SPEC_BREWMASTER_MONK",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The Brewmaster facade refuses this specialization with SPEC_NOT_SUPPORTED before any Brewmaster rule runs: no comparisons, no domains, no authority.",
  },

  // ---- SPEC_HAVOC_DEMON_HUNTER (ONB-A1; PUBLIC since ONB-A1P) ---------------
  "SPEC_HAVOC_DEMON_HUNTER.DECISION_COVERAGE": {
    owningLayer: "SPEC_HAVOC_DEMON_HUNTER",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        targetActorId: z.number().int().nullable(),
        ...BREWMASTER_BUNDLE_PARAMS,
        observedCast: z.object({ reportTimeMs: z.number().int(), abilityGameId: z.number().int() }).strict(),
        expected: z
          .object({
            outcome: z.enum(COMPARISON_OUTCOMES),
            basis: z.enum(COMPARISON_BASES),
            authorityToken: z.string().nullable(),
            selectionPrecision: z.enum(["EXACT_ENTRY", "TOKEN_CONVERGED"]).nullable(),
            decisiveBlocker: z.enum(DECISION_BLOCKER_CLASSES).nullable(),
            rawBlocker: z.string().nullable(),
            /** The entry the first-GCD query names in its refusal, as `list[ordinal] token`, or null. */
            unresolvedAt: z.string().nullable(),
            /** The entry the query selected, as `list[ordinal] token`, or null. */
            selectedEntry: z.string().nullable(),
            unselectabilityProven: z.boolean(),
            unselectabilityRefusal: z.string().nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The Havoc Demon Hunter evaluator, under the committed pinned authority, compares this observed cast exactly as pinned, with the query's own refusal or selection and the unselectability outcome.",
  },
  "SPEC_HAVOC_DEMON_HUNTER.COVERAGE_SUMMARY": {
    owningLayer: "SPEC_HAVOC_DEMON_HUNTER",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        ...BREWMASTER_BUNDLE_PARAMS,
        expected: z
          .object({
            eligibleDecisions: z.number().int().nonnegative(),
            match: z.number().int().nonnegative(),
            rejected: z.number().int().nonnegative(),
            unknown: z.number().int().nonnegative(),
            exclusions: z.record(z.string(), z.number().int().positive()),
            unresolvedAt: z.record(z.string(), z.number().int().positive()),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The evaluator's coverage disclosure over this actor's every completed cast: the eligible decisions, the three outcomes that partition them, every exclusion by reason and every UNKNOWN by what stopped it.",
  },
  "SPEC_HAVOC_DEMON_HUNTER.SPEC_GATE": {
    owningLayer: "SPEC_HAVOC_DEMON_HUNTER",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The Havoc facade refuses this specialization with SPEC_NOT_SUPPORTED before any Havoc rule runs.",
  },

  // ---- SPEC_SUBTLETY_ROGUE, SPEC_FURY_WARRIOR, SPEC_PROTECTION_WARRIOR (ONB-A2, INTERNAL_ONLY) ---
  "SPEC_SUBTLETY_ROGUE.SPEC_GATE": {
    owningLayer: "SPEC_SUBTLETY_ROGUE",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The Subtlety Rogue facade refuses this specialization with SPEC_NOT_SUPPORTED before any of its rules runs.",
  },
  "SPEC_FURY_WARRIOR.SPEC_GATE": {
    owningLayer: "SPEC_FURY_WARRIOR",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The Fury Warrior facade refuses this specialization with SPEC_NOT_SUPPORTED before any of its rules runs.",
  },
  "SPEC_PROTECTION_WARRIOR.SPEC_GATE": {
    owningLayer: "SPEC_PROTECTION_WARRIOR",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The Protection Warrior facade refuses this specialization with SPEC_NOT_SUPPORTED before any of its rules runs.",
  },

  // ---- SPEC_ARMS_WARRIOR (ONB-B1, INTERNAL_ONLY) ---
  "SPEC_ARMS_WARRIOR.COVERAGE_SUMMARY": {
    owningLayer: "SPEC_ARMS_WARRIOR",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        expected: z
          .object({
            heroTree: z.string().min(1),
            eligibleDecisions: z.number().int().nonnegative(),
            match: z.number().int().nonnegative(),
            rejected: z.number().int().nonnegative(),
            unknown: z.number().int().nonnegative(),
            exclusions: z.record(z.string(), z.number().int().positive()),
            eligibleTokens: z.record(z.string(), z.number().int().positive()),
            unresolvedAt: z.record(z.string(), z.number().int().positive()),
            stoppingAtoms: z.record(z.string(), z.number().int().positive()),
            colossusSmashWindows: z
              .object({
                status: z.string().min(1),
                established: z.number().int().nonnegative(),
                notEstablished: z.record(z.string(), z.number().int().positive()),
              })
              .strict(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: true,
    description:
      "The evaluator's coverage disclosure over this actor's every completed cast, where each decision stopped, and how many Colossus Smash windows the observation could establish.",
  },
  "SPEC_ARMS_WARRIOR.SPEC_GATE": {
    owningLayer: "SPEC_ARMS_WARRIOR",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The Arms Warrior facade refuses this specialization with SPEC_NOT_SUPPORTED before any of its rules runs.",
  },

  // ---- SPEC_FROST_DEATH_KNIGHT (ONB-B2, INTERNAL_ONLY) ---
  "SPEC_FROST_DEATH_KNIGHT.SPEC_GATE": {
    owningLayer: "SPEC_FROST_DEATH_KNIGHT",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The Frost Death Knight facade refuses this specialization with SPEC_NOT_SUPPORTED before any of its rules runs.",
  },

  // ---- SPEC_DEVOURER_DEMON_HUNTER (ONB-B3, INTERNAL_ONLY) ---
  "SPEC_DEVOURER_DEMON_HUNTER.SPEC_GATE": {
    owningLayer: "SPEC_DEVOURER_DEMON_HUNTER",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The Devourer Demon Hunter facade refuses this specialization with SPEC_NOT_SUPPORTED before any of its rules runs.",
  },

  // ---- SPEC_FERAL_DRUID (ONB-C1, INTERNAL_ONLY) ---
  "SPEC_FERAL_DRUID.SPEC_GATE": {
    owningLayer: "SPEC_FERAL_DRUID",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The Feral Druid facade refuses this specialization with SPEC_NOT_SUPPORTED before any of its rules runs.",
  },

  // ---- SPEC_DESTRUCTION_WARLOCK (ONB-D1, INTERNAL_ONLY) ---
  "SPEC_DESTRUCTION_WARLOCK.SPEC_GATE": {
    owningLayer: "SPEC_DESTRUCTION_WARLOCK",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The Destruction Warlock facade refuses this specialization with SPEC_NOT_SUPPORTED before any of its rules runs.",
  },

  // ---- SPEC_ELEMENTAL_SHAMAN (ONB-D2, INTERNAL_ONLY) ---
  "SPEC_ELEMENTAL_SHAMAN.SPEC_GATE": {
    owningLayer: "SPEC_ELEMENTAL_SHAMAN",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The Elemental Shaman facade refuses this specialization with SPEC_NOT_SUPPORTED before any of its rules runs.",
  },

  // ---- SPEC_BALANCE_DRUID (ONB-D2, INTERNAL_ONLY) ---
  "SPEC_BALANCE_DRUID.SPEC_GATE": {
    owningLayer: "SPEC_BALANCE_DRUID",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The Balance Druid facade refuses this specialization with SPEC_NOT_SUPPORTED before any of its rules runs.",
  },

  // ---- SPEC_SHADOW_PRIEST (ONB-D2, INTERNAL_ONLY) ---
  "SPEC_SHADOW_PRIEST.SPEC_GATE": {
    owningLayer: "SPEC_SHADOW_PRIEST",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The Shadow Priest facade refuses this specialization with SPEC_NOT_SUPPORTED before any of its rules runs.",
  },

  // ---- SPEC_ARCANE_MAGE (ONB-D3, INTERNAL_ONLY) ---
  "SPEC_ARCANE_MAGE.SPEC_GATE": {
    owningLayer: "SPEC_ARCANE_MAGE",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The Arcane Mage facade refuses this specialization with SPEC_NOT_SUPPORTED before any of its rules runs.",
  },

  // ---- SPEC_FROST_MAGE (ONB-D3, INTERNAL_ONLY) ---
  "SPEC_FROST_MAGE.SPEC_GATE": {
    owningLayer: "SPEC_FROST_MAGE",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The Frost Mage facade refuses this specialization with SPEC_NOT_SUPPORTED before any of its rules runs.",
  },

  // ---- SPEC_AFFLICTION_WARLOCK (ONB-D4, INTERNAL_ONLY) ---
  "SPEC_AFFLICTION_WARLOCK.SPEC_GATE": {
    owningLayer: "SPEC_AFFLICTION_WARLOCK",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The Affliction Warlock facade refuses this specialization with SPEC_NOT_SUPPORTED before any of its rules runs.",
  },

  // ---- SPEC_MARKSMANSHIP_HUNTER (ONB-D4, INTERNAL_ONLY) ---
  "SPEC_MARKSMANSHIP_HUNTER.SPEC_GATE": {
    owningLayer: "SPEC_MARKSMANSHIP_HUNTER",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The Marksmanship Hunter facade refuses this specialization with SPEC_NOT_SUPPORTED before any of its rules runs.",
  },

  // ---- SPEC_OUTLAW_ROGUE (ONB-C2, INTERNAL_ONLY) ---
  "SPEC_OUTLAW_ROGUE.SPEC_GATE": {
    owningLayer: "SPEC_OUTLAW_ROGUE",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The Outlaw Rogue facade refuses this specialization with SPEC_NOT_SUPPORTED before any of its rules runs.",
  },

  // ---- SPEC_ENHANCEMENT_SHAMAN (ONB-B2, INTERNAL_ONLY) ---
  "SPEC_ENHANCEMENT_SHAMAN.SPEC_GATE": {
    owningLayer: "SPEC_ENHANCEMENT_SHAMAN",
    outcomeClass: "UNSUPPORTED",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z.object({ actorId: z.number().int(), specId: z.string().min(1) }).strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The Enhancement Shaman facade refuses this specialization with SPEC_NOT_SUPPORTED before any of its rules runs.",
  },

  // ---- SPEC_AUGMENTATION_EVOKER (M13-E, INTERNAL_ONLY) ---------------------
  //
  // The first registration that binds no decision authority. Driven through
  // the production catalog's INTERNAL lookup and `runAnalyzer`, never the
  // evaluator directly, so the case pins the registration as orchestration
  // holds it.
  "SPEC_AUGMENTATION_EVOKER.REGISTRATION_RESULT": {
    owningLayer: "SPEC_AUGMENTATION_EVOKER",
    outcomeClass: "NO_AUTHORITY_AVAILABLE",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        expected: z
          .object({
            /** The registration's DERIVED ingestion scope. */
            requiredScope: z.enum(["PLAYER_CONTEXT", "FULL_RAID"]),
            /** The unanalyzed status: an authority-free registration is never ANALYZED. */
            status: z.enum(["AUTHORITY_NOT_AVAILABLE", "INSUFFICIENT_EVIDENCE"]),
            /** Each declared family and its resolution from the registration's own access, in order. */
            domains: z.array(z.object({ domain: z.string().min(1), resolution: z.string().min(1) }).strict()),
            /** `STATED`, or the UNKNOWN reason the subject's specialization was refused for. */
            subjectSpecialization: z.string().min(1),
            /** The evaluator's state, or `null` when no identity could be fed to it. */
            evaluationState: z.string().min(1).nullable(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "Through the production catalog's internal lookup, the INTERNAL_ONLY Augmentation Evoker registration derives this ingestion scope, resolves each declared support family from its own authority access exactly so (it binds nothing), and returns exactly this unanalyzed status for the actor — never ANALYZED, and never a support fact for a subject whose identity is not established. The public lookup never selects it.",
  },

  // ---- SPEC_RESTORATION_SHAMAN (HEAL-A, INTERNAL_ONLY) ---------------------
  //
  // The first healer registration. Like Augmentation it binds no decision
  // authority, and it is driven the same way: through the production
  // catalog's INTERNAL lookup and `runAnalyzer`, never the evaluator directly.
  "SPEC_RESTORATION_SHAMAN.REGISTRATION_RESULT": {
    owningLayer: "SPEC_RESTORATION_SHAMAN",
    outcomeClass: "NO_AUTHORITY_AVAILABLE",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        expected: z
          .object({
            /** The registration's DERIVED ingestion scope. */
            requiredScope: z.enum(["PLAYER_CONTEXT", "FULL_RAID"]),
            /** The unanalyzed status: an authority-free registration is never ANALYZED. */
            status: z.enum(["AUTHORITY_NOT_AVAILABLE", "INSUFFICIENT_EVIDENCE"]),
            /** Each declared family and its resolution from the registration's own access, in order. */
            domains: z.array(z.object({ domain: z.string().min(1), resolution: z.string().min(1) }).strict()),
            /** `STATED`, or the UNKNOWN reason the subject's specialization was refused for. */
            subjectSpecialization: z.string().min(1),
            /** The evaluator's state, or `null` when no identity could be fed to it. */
            evaluationState: z.string().min(1).nullable(),
            /** `ASSESSED`, or the reason no healer finding set was built. */
            healerFindings: z.string().min(1),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "Through the production catalog's internal lookup (PUBLIC since HEAL-AP, so the public lookup finds the same row), the Restoration Shaman registration derives this ingestion scope, resolves each declared healer family from its own authority access exactly so (it binds nothing), and returns exactly this unanalyzed status for the actor — never ANALYZED, and never a healer finding for a subject whose identity is not established.",
  },

  // ---- SPEC_HOLY_PALADIN (HEAL-B1; PUBLIC since HEAL-B1P) --------------
  //
  // A healer registration on Restoration Shaman's architecture, driven the
  // same way: through the production catalog's INTERNAL lookup and
  // `runAnalyzer`, never the evaluator directly.
  "SPEC_HOLY_PALADIN.REGISTRATION_RESULT": {
    owningLayer: "SPEC_HOLY_PALADIN",
    outcomeClass: "NO_AUTHORITY_AVAILABLE",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        expected: z
          .object({
            /** The registration's DERIVED ingestion scope. */
            requiredScope: z.enum(["PLAYER_CONTEXT", "FULL_RAID"]),
            /** The unanalyzed status: an authority-free registration is never ANALYZED. */
            status: z.enum(["AUTHORITY_NOT_AVAILABLE", "INSUFFICIENT_EVIDENCE"]),
            /** Each declared family and its resolution from the registration's own access, in order. */
            domains: z.array(z.object({ domain: z.string().min(1), resolution: z.string().min(1) }).strict()),
            /** `STATED`, or the UNKNOWN reason the subject's specialization was refused for. */
            subjectSpecialization: z.string().min(1),
            /** The evaluator's state, or `null` when no identity could be fed to it. */
            evaluationState: z.string().min(1).nullable(),
            /** `ASSESSED`, or the reason no healer finding set was built. */
            healerFindings: z.string().min(1),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "Through the production catalog's internal lookup (PUBLIC since HEAL-B1P, so the public lookup finds the same row), the Holy Paladin registration derives this ingestion scope, resolves each declared healer family from its own authority access exactly so (it binds nothing), and returns exactly this unanalyzed status for the actor — never ANALYZED, and never a healer finding for a subject whose identity is not established.",
  },

  // ---- SPEC_RESTORATION_DRUID (HEAL-B1, INTERNAL_ONLY) ---------------------
  //
  // A healer registration on Restoration Shaman's architecture, driven the
  // same way: through the production catalog's INTERNAL lookup and
  // `runAnalyzer`, never the evaluator directly.
  "SPEC_RESTORATION_DRUID.REGISTRATION_RESULT": {
    owningLayer: "SPEC_RESTORATION_DRUID",
    outcomeClass: "NO_AUTHORITY_AVAILABLE",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        expected: z
          .object({
            /** The registration's DERIVED ingestion scope. */
            requiredScope: z.enum(["PLAYER_CONTEXT", "FULL_RAID"]),
            /** The unanalyzed status: an authority-free registration is never ANALYZED. */
            status: z.enum(["AUTHORITY_NOT_AVAILABLE", "INSUFFICIENT_EVIDENCE"]),
            /** Each declared family and its resolution from the registration's own access, in order. */
            domains: z.array(z.object({ domain: z.string().min(1), resolution: z.string().min(1) }).strict()),
            /** `STATED`, or the UNKNOWN reason the subject's specialization was refused for. */
            subjectSpecialization: z.string().min(1),
            /** The evaluator's state, or `null` when no identity could be fed to it. */
            evaluationState: z.string().min(1).nullable(),
            /** `ASSESSED`, or the reason no healer finding set was built. */
            healerFindings: z.string().min(1),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "Through the production catalog's internal lookup, the INTERNAL_ONLY Restoration Druid registration derives this ingestion scope, resolves each declared healer family from its own authority access exactly so (it binds nothing), and returns exactly this unanalyzed status for the actor — never ANALYZED, and never a healer finding for a subject whose identity is not established. The public lookup never selects it.",
  },

  // ---- SPEC_MISTWEAVER_MONK (HEAL-B1; PUBLIC since HEAL-B1P) --------------
  //
  // A healer registration on Restoration Shaman's architecture, driven the
  // same way: through the production catalog's INTERNAL lookup and
  // `runAnalyzer`, never the evaluator directly.
  "SPEC_MISTWEAVER_MONK.REGISTRATION_RESULT": {
    owningLayer: "SPEC_MISTWEAVER_MONK",
    outcomeClass: "NO_AUTHORITY_AVAILABLE",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        expected: z
          .object({
            /** The registration's DERIVED ingestion scope. */
            requiredScope: z.enum(["PLAYER_CONTEXT", "FULL_RAID"]),
            /** The unanalyzed status: an authority-free registration is never ANALYZED. */
            status: z.enum(["AUTHORITY_NOT_AVAILABLE", "INSUFFICIENT_EVIDENCE"]),
            /** Each declared family and its resolution from the registration's own access, in order. */
            domains: z.array(z.object({ domain: z.string().min(1), resolution: z.string().min(1) }).strict()),
            /** `STATED`, or the UNKNOWN reason the subject's specialization was refused for. */
            subjectSpecialization: z.string().min(1),
            /** The evaluator's state, or `null` when no identity could be fed to it. */
            evaluationState: z.string().min(1).nullable(),
            /** `ASSESSED`, or the reason no healer finding set was built. */
            healerFindings: z.string().min(1),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "Through the production catalog's internal lookup (PUBLIC since HEAL-B1P, so the public lookup finds the same row), the Mistweaver Monk registration derives this ingestion scope, resolves each declared healer family from its own authority access exactly so (it binds nothing), and returns exactly this unanalyzed status for the actor — never ANALYZED, and never a healer finding for a subject whose identity is not established.",
  },

  // ---- SPEC_HOLY_PRIEST (HEAL-B2; PUBLIC since HEAL-B2P) --------------
  //
  // A healer registration on Restoration Shaman's architecture, driven the
  // same way: through the production catalog's INTERNAL lookup and
  // `runAnalyzer`, never the evaluator directly.
  "SPEC_HOLY_PRIEST.REGISTRATION_RESULT": {
    owningLayer: "SPEC_HOLY_PRIEST",
    outcomeClass: "NO_AUTHORITY_AVAILABLE",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        expected: z
          .object({
            /** The registration's DERIVED ingestion scope. */
            requiredScope: z.enum(["PLAYER_CONTEXT", "FULL_RAID"]),
            /** The unanalyzed status: an authority-free registration is never ANALYZED. */
            status: z.enum(["AUTHORITY_NOT_AVAILABLE", "INSUFFICIENT_EVIDENCE"]),
            /** Each declared family and its resolution from the registration's own access, in order. */
            domains: z.array(z.object({ domain: z.string().min(1), resolution: z.string().min(1) }).strict()),
            /** `STATED`, or the UNKNOWN reason the subject's specialization was refused for. */
            subjectSpecialization: z.string().min(1),
            /** The evaluator's state, or `null` when no identity could be fed to it. */
            evaluationState: z.string().min(1).nullable(),
            /** `ASSESSED`, or the reason no healer finding set was built. */
            healerFindings: z.string().min(1),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "Through the production catalog's internal lookup (PUBLIC since HEAL-B2P, so the public lookup finds the same row), the Holy Priest registration derives this ingestion scope, resolves each declared healer family from its own authority access exactly so (it binds nothing), and returns exactly this unanalyzed status for the actor — never ANALYZED, and never a healer finding for a subject whose identity is not established.",
  },

  // ---- SPEC_DISCIPLINE_PRIEST (HEAL-B3, INTERNAL_ONLY) ----------------
  //
  // A healer registration on Restoration Shaman's architecture, driven the
  // same way: through the production catalog's INTERNAL lookup and
  // `runAnalyzer`, never the evaluator directly.
  "SPEC_DISCIPLINE_PRIEST.REGISTRATION_RESULT": {
    owningLayer: "SPEC_DISCIPLINE_PRIEST",
    outcomeClass: "NO_AUTHORITY_AVAILABLE",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        expected: z
          .object({
            /** The registration's DERIVED ingestion scope. */
            requiredScope: z.enum(["PLAYER_CONTEXT", "FULL_RAID"]),
            /** The unanalyzed status: an authority-free registration is never ANALYZED. */
            status: z.enum(["AUTHORITY_NOT_AVAILABLE", "INSUFFICIENT_EVIDENCE"]),
            /** Each declared family and its resolution from the registration's own access, in order. */
            domains: z.array(z.object({ domain: z.string().min(1), resolution: z.string().min(1) }).strict()),
            /** `STATED`, or the UNKNOWN reason the subject's specialization was refused for. */
            subjectSpecialization: z.string().min(1),
            /** The evaluator's state, or `null` when no identity could be fed to it. */
            evaluationState: z.string().min(1).nullable(),
            /** `ASSESSED`, or the reason no healer finding set was built. */
            healerFindings: z.string().min(1),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "Through the production catalog's internal lookup, the INTERNAL_ONLY Discipline Priest registration derives this ingestion scope, resolves each declared healer family from its own authority access exactly so (it binds nothing), and returns exactly this unanalyzed status for the actor — never ANALYZED, and never a healer finding for a subject whose identity is not established. The public lookup never selects it.",
  },

  // ---- SPEC_PRESERVATION_EVOKER (HEAL-B4; PUBLIC since HEAL-B4P) --------
  //
  // A healer registration on Restoration Shaman's architecture, driven the
  // same way: through the production catalog's INTERNAL lookup and
  // `runAnalyzer`, never the evaluator directly.
  "SPEC_PRESERVATION_EVOKER.REGISTRATION_RESULT": {
    owningLayer: "SPEC_PRESERVATION_EVOKER",
    outcomeClass: "NO_AUTHORITY_AVAILABLE",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        actorId: z.number().int(),
        expected: z
          .object({
            /** The registration's DERIVED ingestion scope. */
            requiredScope: z.enum(["PLAYER_CONTEXT", "FULL_RAID"]),
            /** The unanalyzed status: an authority-free registration is never ANALYZED. */
            status: z.enum(["AUTHORITY_NOT_AVAILABLE", "INSUFFICIENT_EVIDENCE"]),
            /** Each declared family and its resolution from the registration's own access, in order. */
            domains: z.array(z.object({ domain: z.string().min(1), resolution: z.string().min(1) }).strict()),
            /** `STATED`, or the UNKNOWN reason the subject's specialization was refused for. */
            subjectSpecialization: z.string().min(1),
            /** The evaluator's state, or `null` when no identity could be fed to it. */
            evaluationState: z.string().min(1).nullable(),
            /** `ASSESSED`, or the reason no healer finding set was built. */
            healerFindings: z.string().min(1),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "Through the production catalog's internal lookup (PUBLIC since HEAL-B4P, so the public lookup finds the same row), the Preservation Evoker registration derives this ingestion scope, resolves each declared healer family from its own authority access exactly so (it binds nothing), and returns exactly this unanalyzed status for the actor — never ANALYZED, and never a healer finding for a subject whose identity is not established.",
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

  "SHARED_DECISION_ENGINE.SCAN_SELECTS_NOTHING": {
    owningLayer: "SHARED_DECISION_ENGINE",
    outcomeClass: "NEGATIVE_FACT",
    payloadKinds: ["JSON_VALUE"],
    params: z
      .object({
        entryListName: z.string().min(1),
        knownBuffs: z.array(z.object({ name: z.string().min(1), up: z.boolean() }).strict()),
        knownTalents: z.array(z.object({ name: z.string().min(1), taken: z.boolean() }).strict()),
        provenUsableTokens: z.array(z.string().min(1)),
        /** Every entry the scan visited, in visit order — so an entry it must NOT have reached is provably absent. */
        expectedVisited: z.array(aplEntryRef),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "M11-B1: one foreground scan under the stated bindings resolves NO_ACTION — a PROOF that every reachable entry was eliminated or that a run_action_list transferred selection into a list that selects nothing — and visited exactly these entries, so the parent's entries below a transferring run are provably not consulted.",
  },
  "SHARED_DECISION_ENGINE.SCAN_BLOCKED_WITH": {
    owningLayer: "SHARED_DECISION_ENGINE",
    outcomeClass: "UNKNOWN",
    payloadKinds: ["JSON_VALUE"],
    params: z
      .object({
        entryListName: z.string().min(1),
        knownBuffs: z.array(z.object({ name: z.string().min(1), up: z.boolean() }).strict()),
        knownTalents: z.array(z.object({ name: z.string().min(1), taken: z.boolean() }).strict()),
        provenUsableTokens: z.array(z.string().min(1)),
        expectedBlocker: z.enum(TRAVERSAL_BLOCKERS),
        /** `null` for a blocker recorded before any entry was read (a cycle on list entry). */
        expectedBlockedAt: aplEntryRef.nullable(),
        expectedVisited: z.array(aplEntryRef),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "M11-B1: one foreground scan under the stated bindings is BLOCKED with exactly this engine blocker at exactly this entry, having visited exactly these entries — an undecided run_action_list gate or a control-flow cycle fails closed, and nothing below the blocking point is selected.",
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
            /**
             * HEAL-AP widened this with the two unanalyzed statuses an
             * authority-free public registration returns, so a public healer
             * subject is pinned as what it is, never as unsupported.
             */
            status: z.enum([
              "ANALYZED",
              "SPEC_NOT_SUPPORTED",
              "AUTHORITY_NOT_AVAILABLE",
              "INSUFFICIENT_EVIDENCE",
            ]),
            specId: z.string().nullable(),
            analyzerId: z.string().nullable(),
            /** `null` when no analyzer ran and nothing was retrieved. */
            scope: z.enum(["PLAYER_CONTEXT", "FULL_RAID"]).nullable(),
            /**
             * PREP-4, optional: the consumable status the shared preparation
             * producer assessed over this artifact for the subject, per
             * consumable, with each use's spell and timing. A case without it
             * asserts nothing about preparation.
             */
            preparation: z
              .object({
                healthPotion: CORPUS_CONSUMABLE_STATUS,
                healthstone: CORPUS_CONSUMABLE_STATUS,
                combatPotion: CORPUS_CONSUMABLE_STATUS,
              })
              .strict()
              .optional(),
          })
          .strict(),
      })
      .strict(),
    execution: "EXECUTABLE",
    runtime: "ANY",
    requiresAuthority: false,
    description:
      "The real application service over the artifact — preflight and ingestion faked, everything between them production — derives exactly this ingestion scope from the enabled analyzers, recognizes exactly this specialization and analyzer, and reports exactly this status. Never a transport. When `expected.preparation` is present, the subject's consumable status must be ASSESSED and equal it: count state, count or lower bound, reason codes, and each use's spell and timing.",
  },

  "APPLICATION_SERVICE.INTERNAL_REGISTRATION": {
    owningLayer: "APPLICATION_SERVICE",
    outcomeClass: "POSITIVE_FACT",
    payloadKinds: ["WCL_EVENT_ARRAY"],
    params: z
      .object({
        /** A specialization this build KNOWS. An unsupported class/spec pair is not a SpecId and is asserted through FIGHT_ANALYSIS instead. */
        specId: z.enum(SPEC_IDS),
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
      "The validated production catalog answers the internal and the public lookup for this known specialization exactly so, and the public identity table agrees; catalog order changes neither answer. An INTERNAL_ONLY registration is real to the first lookup and invisible to the second (Protection Paladin from M10-C to M10-D, Retribution Paladin from M11-A4 to M11-A5); a PUBLIC one answers both.",
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
          expected: z
            .object({
              status: z.enum(["ANALYZED", "SPEC_NOT_SUPPORTED"]),
              /** M10-D: which public specialization and analyzer the shared document names, or null. */
              specId: z.enum(SPEC_IDS).nullable().optional(),
              analyzerId: z.string().min(1).nullable().optional(),
            })
            .strict(),
        })
        .strict(),
      z
        .object({
          document: z.literal("RAID_NIGHT"),
          fightIds: z.array(z.number().int()).min(1),
          subject: z.object({ actorId: z.number().int() }).strict(),
          /**
           * M10-D: a roster over the case's OWN artifact, served as one core
           * with no fan-out and no relabelling. Absent, the D2 fan-out
           * fixture is used and the artifact must be the D2 corpus.
           */
          composition: z
            .object({
              participants: z
                .array(
                  z
                    .object({
                      sourceId: z.number().int(),
                      className: z.string().min(1),
                      specName: z.string().min(1),
                      absent: z.boolean(),
                    })
                    .strict(),
                )
                .min(1),
            })
            .strict()
            .optional(),
          expected: z
            .object({
              analyzedCells: z.number().int().nonnegative(),
              /** Every cell, by player: its kind and, for NOT_ANALYZED, its status. */
              cells: z
                .array(
                  z
                    .object({
                      sourceId: z.number().int(),
                      kind: z.enum(["ABSENT", "ANALYZED", "NOT_ANALYZED", "ANALYSIS_UNAVAILABLE"]),
                      status: z.string().min(1).optional(),
                      specId: z.enum(SPEC_IDS).optional(),
                    })
                    .strict(),
                )
                .optional(),
            })
            .strict(),
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
  [pinnedRetributionApl.authorityId]: pinnedRetributionApl.artifactRevision,
  [pinnedBloodApl.authorityId]: pinnedBloodApl.artifactRevision,
  [pinnedBrewmasterApl.authorityId]: pinnedBrewmasterApl.artifactRevision,
  [pinnedHavocApl.authorityId]: pinnedHavocApl.artifactRevision,
  [pinnedSubtletyApl.authorityId]: pinnedSubtletyApl.artifactRevision,
  [pinnedFuryApl.authorityId]: pinnedFuryApl.artifactRevision,
  [pinnedProtectionWarriorApl.authorityId]: pinnedProtectionWarriorApl.artifactRevision,
  [pinnedArmsWarriorApl.authorityId]: pinnedArmsWarriorApl.artifactRevision,
  [pinnedFrostDeathKnightApl.authorityId]: pinnedFrostDeathKnightApl.artifactRevision,
  [pinnedDevourerDemonHunterApl.authorityId]: pinnedDevourerDemonHunterApl.artifactRevision,
  [pinnedFeralDruidApl.authorityId]: pinnedFeralDruidApl.artifactRevision,
  [pinnedDestructionWarlockApl.authorityId]: pinnedDestructionWarlockApl.artifactRevision,
  [pinnedElementalShamanApl.authorityId]: pinnedElementalShamanApl.artifactRevision,
  [pinnedBalanceDruidApl.authorityId]: pinnedBalanceDruidApl.artifactRevision,
  [pinnedShadowPriestApl.authorityId]: pinnedShadowPriestApl.artifactRevision,
  [pinnedArcaneMageApl.authorityId]: pinnedArcaneMageApl.artifactRevision,
  [pinnedFrostMageApl.authorityId]: pinnedFrostMageApl.artifactRevision,
  [pinnedAfflictionWarlockApl.authorityId]: pinnedAfflictionWarlockApl.artifactRevision,
  [pinnedMarksmanshipHunterApl.authorityId]: pinnedMarksmanshipHunterApl.artifactRevision,
  [pinnedOutlawRogueApl.authorityId]: pinnedOutlawRogueApl.artifactRevision,
  [pinnedEnhancementShamanApl.authorityId]: pinnedEnhancementShamanApl.artifactRevision,
};

// --------------------------------------------------------------------------
// Manifest schema
// --------------------------------------------------------------------------

// `identifier` and `reportTimeRange` are declared beside the other primitive
// schemas near the top of this file; the assertion kinds use them too.

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
    actorFilter: z.union([
      z.literal("NONE"),
      z.object({ sourceId: z.number().int() }).strict(),
      /**
       * M11-G2: a CAPTURE-ONLY `filterExpression`, recorded verbatim except
       * that the focus player's catalog gameID (a character identifier) is
       * replaced by the literal `<FOCUS_GAME_ID>`. Like `{ sourceId }`, an
       * artifact captured this way retains no coverage (loader rule
       * FILTERED_CAPTURE_GRANTED); a later reviewed certification path is the
       * only way it could.
       */
      z
        .object({
          filterExpressionTemplate: z.string().includes("<FOCUS_GAME_ID>"),
          focusGameIdRedacted: z.literal(true),
        })
        .strict(),
    ]),
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
      /** M11-G1: the item-level bracket requested, when one was. */
      bracket: z.number().int().optional(),
    })
    .strict(),
  // M11-G1: one composed request for a report's NON-EVENT surfaces (fight
  // header, rankings, tables, playerDetails), named verbatim.
  z
    .object({
      kind: z.literal("REPORT_SURFACES"),
      fightIds: z.array(z.number().int()).min(1),
      surfaces: z.array(z.string().min(1)).min(1),
    })
    .strict(),
  // M13-A: several server-filtered event streams of ONE fight window, each a
  // family `dataType` and optionally a verbatim `filterExpression`, merged into
  // one artifact by the recorded rule. Every stream is a server filter, so an
  // artifact captured this way retains no coverage (loader rule
  // FILTERED_CAPTURE_GRANTED), exactly like `actorFilter`.
  z
    .object({
      kind: z.literal("FILTERED_EVENT_STREAMS"),
      hostilityType: z.literal("Friendlies"),
      includeResources: z.literal(false),
      limit: recordedInt,
      startTimeMs: recordedInt,
      endTimeMs: recordedInt,
      streams: z
        .array(
          z
            .object({
              dataType: z.enum(["Casts", "Buffs", "Deaths"]),
              filterExpression: z.union([z.string().min(1), z.null()]),
              pagesRetrieved: recordedInt,
              eventsReturned: recordedInt,
            })
            .strict(),
        )
        .min(1),
      merge: z.string().min(1),
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
/**
 * A ZERO-EVENT COVERAGE CERTIFICATE (M10-C5 Phase B): the interval between
 * the end of a preceding artifact's retained coverage and the start of this
 * artifact's own holds no event, and the manifest says WHY in a form the
 * loader can check rather than take on trust.
 *
 * The proof rests on two terminal captures of the same report and fight: the
 * preceding artifact's source requested up to an EXCLUSIVE end at or beyond
 * this interval and paginated to a terminal page, so every event the source
 * held before that end was retrieved and the preceding artifact — a whole
 * predicate over that capture — retained none inside the interval; and this
 * artifact's own source begins at or before the interval's end. The loader
 * verifies each of those facts and that neither artifact retains an event
 * inside the interval. A bundle composer may then join the two grants across
 * it. Without a certificate, an unretained millisecond is a hole, and a hole
 * is never adjacency.
 */
const emptyIntervalCertificate = z
  .object({
    fromReportTimeMs: z.number().int(),
    toReportTimeMs: z.number().int(),
    /** The artifact whose retained coverage ends immediately before `fromReportTimeMs`. */
    precedingArtifactId: identifier,
    basis: z.string().min(1),
  })
  .strict();

const retainedCoverage = z
  .object({
    grants: z.array(coverageGrant),
    basis: z.string().min(1),
    /** Present only on a segment that continues a preceding artifact across an empty interval. */
    certifiedEmpty: z.array(emptyIntervalCertificate).optional(),
  })
  .strict();

/**
 * A NEGATIVE-CONTROL substitution (M11-C4h): a DERIVED_FROM_CAPTURE artifact
 * that is its SANITIZED_CAPTURE parent with exactly ONE field of exactly ONE
 * event changed — the `abilityGameID` of the cast at `eventIndex`, by
 * `sourceActorId` at `reportTimeMs`, from `fromAbilityGameId` to
 * `toAbilityGameId`. The loader re-derives that diff from the two committed
 * payloads and refuses any other difference, so the gate may lean on it:
 * everything the control's analysis reads, apart from the one action, is
 * observed state. It is never observed behaviour
 * (`scripts/corpus/derive-substitution.mjs`).
 */
const castAbilitySubstitution = z
  .object({
    kind: z.literal("SINGLE_CAST_ABILITY_SUBSTITUTION"),
    eventIndex: z.number().int().nonnegative(),
    reportTimeMs: z.number().int(),
    sourceActorId: z.number().int(),
    fromAbilityGameId: z.number().int(),
    toAbilityGameId: z.number().int(),
    /** Why this decision and this substitute: the predeclared selection rule, in prose. */
    basis: z.string().min(1),
  })
  .strict();
export type CastAbilitySubstitution = z.infer<typeof castAbilitySubstitution>;

/**
 * An OWNED-PET ACTOR SLICE (M11-E2.1): the artifact is the
 * `scripts/sanitize-probe.mjs --actor-slice-with-owned-pets` predicate over
 * its capture — every event of a listed family whose `sourceID` or
 * `targetID` is the focus or an actor whose Warcraft Logs master-data
 * `petOwner` is exactly the focus, plus the listed ACTORLESS families' events
 * that carry neither key.
 *
 * The declaration is never taken on trust. The loader re-derives the owned
 * set from the named catalog artifact (a committed fight context of the same
 * report and fight), and refuses unless: the derivation succeeds; it equals
 * `ownedActorIds`; every grant's actor scope is exactly focus + owned; every
 * retained event satisfies the predicate inside the granted range; the
 * activity split matches the events; and every granted category is fed only
 * by retained families. A stated owner is not combat relevance: an owned
 * actor with no retained event stays in scope, listed under
 * `actorsWithoutRetainedEvents`.
 */
const ownedPetActorSlice = z
  .object({
    mode: z.literal("FOCUS_WITH_OWNED_PETS"),
    focusActorId: z.number().int(),
    /** Ascending. Derived from the catalog, never chosen. */
    ownedActorIds: z.array(z.number().int()),
    ownershipAuthority: z.literal("WCL_PET_OWNER"),
    /** The committed fight context the ownership is read from. */
    catalogArtifactId: identifier,
    /** The raw types `--families` retained. */
    families: z.array(z.string().regex(/^[a-z]+$/)).min(1),
    /** The raw types `--actorless-families` retained without an actor; each also in `families`. */
    actorlessFamilies: z.array(z.string().regex(/^[a-z]+$/)),
    /** Scope members that are the source or target of a retained event. Ascending. */
    actorsWithRetainedEvents: z.array(z.number().int()),
    /** Scope members that are neither. Ascending. */
    actorsWithoutRetainedEvents: z.array(z.number().int()),
    /**
     * M11-G2: the slice grants NOTHING, deliberately, and says why. Present
     * exactly when `retainedCoverage.grants` is empty; the predicate is then
     * checked over the source query's own window instead of the grant ranges.
     * Owner decision (2026-10-11): a server-filtered capture earns a category
     * grant only by an exact certificate against a trusted WCL table over the
     * same interval and predicate; a failed, unavailable or semantically
     * mismatched certificate earns none.
     */
    grantsWithheld: z
      .object({ reason: z.string().min(1) })
      .strict()
      .optional(),
  })
  .strict();
export type OwnedPetActorSlice = z.infer<typeof ownedPetActorSlice>;

/**
 * A FRIENDLY-PLAYERS ACTOR SLICE (M12-B): the artifact is the
 * `scripts/sanitize-probe.mjs --friendly-players-slice` predicate over its
 * capture — every event of a listed family whose `sourceID` or `targetID` is
 * one of the named fight's Warcraft Logs `friendlyPlayers`. A healer question
 * ranges over the whole raid, so its evidence must be complete for every
 * friendly player at once.
 *
 * Never taken on trust, exactly like the owned-pet slice. The loader
 * re-derives the roster from the named catalog (a committed fight context of
 * the same report and fight: the fight listed once, every roster id a
 * `Player` listed once in the master data) and refuses unless it equals
 * `playerActorIds`; every grant's actor scope is exactly the roster; every
 * retained event satisfies the predicate inside the granted range; the
 * activity split matches the events; and every granted category is fed only
 * by retained families. There are no actorless families.
 */
const friendlyPlayersActorSlice = z
  .object({
    mode: z.literal("FIGHT_FRIENDLY_PLAYERS"),
    fightId: z.number().int(),
    /** Ascending. Derived from the catalog, never chosen. */
    playerActorIds: z.array(z.number().int()).min(1),
    rosterAuthority: z.literal("WCL_FIGHT_FRIENDLY_PLAYERS"),
    /** The committed fight context the roster is read from. */
    catalogArtifactId: identifier,
    /** The raw types `--families` retained. */
    families: z.array(z.string().regex(/^[a-z]+$/)).min(1),
    /** Roster members that are the source or target of a retained event. Ascending. */
    actorsWithRetainedEvents: z.array(z.number().int()),
    /** Roster members that are neither. Ascending. */
    actorsWithoutRetainedEvents: z.array(z.number().int()),
  })
  .strict();
export type FriendlyPlayersActorSlice = z.infer<typeof friendlyPlayersActorSlice>;

const actorSliceSchema = z.discriminatedUnion("mode", [ownedPetActorSlice, friendlyPlayersActorSlice]);

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
    /** Present only on a negative-control derivative (M11-C4h); see `castAbilitySubstitution`. */
    substitution: castAbilitySubstitution.optional(),
    /**
     * Present only on an actor-set slice: owned-pet (M11-E2.1, see
     * `ownedPetActorSlice`) or friendly-players (M12-B, see
     * `friendlyPlayersActorSlice`).
     */
    actorSlice: actorSliceSchema.optional(),
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
