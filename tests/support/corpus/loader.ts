/**
 * Deterministic loading and validation of the regression corpus.
 *
 * The loader reads a FILE TABLE — a map from corpus-relative path to text —
 * rather than the filesystem. The committed corpus is bound to it through
 * `import.meta.glob` at build time, which is what makes it usable from both
 * Vitest projects (plain Node and workerd) with no `node:fs`; and a test can
 * hand it an in-memory table to exercise every rejection rule without touching
 * the committed files.
 *
 * WHAT VALIDATION DOES AND DOES NOT DO
 *
 * It checks CORPUS STRUCTURE: the manifest parses, ids are unique, references
 * resolve, paths stay inside the root, bytes match their digests, sizes are
 * within the ceilings, lineage is coherent, and every assertion is a registered
 * kind with well-formed parameters owned by the case's layer.
 *
 * An owned-pet actor slice (M11-E2.1) is the one place it reads event fields:
 * `sourceID`, `targetID`, `type` and `timestamp`, to prove the bytes are the
 * slice the declaration and grants describe. That is still structure.
 *
 * It does NOT check combat validity. A deliberately malformed Warcraft Logs
 * payload is a valid artifact when a case explicitly tests its rejection, so an
 * artifact declared `JSON` must merely parse, and one declared `RAW_TEXT` need
 * not even do that.
 *
 * It never sorts, deduplicates, repairs or normalizes payload content. Equal
 * timestamps, non-monotonic arrays, actor `0`, the `-1` sentinel and page
 * boundaries are evidence and pass through untouched. The one canonicalization
 * is line endings, on the way to the digest only — see `canonicalBytesOf`.
 *
 * Nothing here reads a clock, the network, the environment or a random source.
 */

import {
  ASSERTION_KINDS,
  CORPUS_CONTRACT_VERSION,
  isEvidenceArchiveAssertionKind,
  MAX_ARTIFACT_BYTES,
  MAX_CORPUS_BYTES,
  OBSOLETE_CONTRACT_VERSIONS,
  PINNED_AUTHORITY_REVISIONS,
  isDerivingTransformation,
  isSanitizingTransformation,
  manifestSchema,
  type AssertionExecution,
  type AssertionKind,
  type CorpusArtifactRecord,
  type CorpusCaseRecord,
  type CorpusManifest,
  type EvidenceRootId,
  type OwningLayer,
  type PayloadKind,
  type TransformationKind,
} from "./contract.js";
import {
  categoriesByRawType,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../../src/engine/normalization/supported-families.js";

export const MANIFEST_PATH = "manifest.json";
export const ARTIFACT_ROOT = "artifacts/";

/** Corpus-relative path → file text. Keys use forward slashes. */
export type CorpusFileTable = Readonly<Record<string, string>>;

// --------------------------------------------------------------------------
// Errors
// --------------------------------------------------------------------------

export const CORPUS_ERROR_CODES = [
  "MANIFEST_MISSING",
  "MANIFEST_NOT_JSON",
  "MANIFEST_SHAPE_INVALID",
  "CONTRACT_VERSION_UNSUPPORTED",
  "ARTIFACT_ID_DUPLICATE",
  "ARTIFACT_PATH_OUTSIDE_ROOT",
  "ARTIFACT_PATH_DUPLICATE",
  "ARTIFACT_FILE_MISSING",
  "ARTIFACT_BYTE_LENGTH_MISMATCH",
  "ARTIFACT_DIGEST_MISMATCH",
  "ARTIFACT_TOO_LARGE",
  "ARTIFACT_NOT_JSON",
  "ARTIFACT_PAYLOAD_KIND_MISMATCH",
  "ARTIFACT_ENCODING_KIND_MISMATCH",
  "CORPUS_TOO_LARGE",
  "CORPUS_FILE_UNREFERENCED",
  "PROVENANCE_SOURCE_REQUIRED",
  "PROVENANCE_SOURCE_FORBIDDEN",
  "PROVENANCE_PARENT_REQUIRED",
  "PROVENANCE_PARENT_FORBIDDEN",
  "PROVENANCE_PARENT_UNKNOWN",
  "PROVENANCE_PARENT_CYCLE",
  "PROVENANCE_PARENT_SYNTHETIC",
  "PROVENANCE_REAL_CAPTURE_TRANSFORMED",
  "PROVENANCE_SANITIZED_WITHOUT_TRANSFORMATION",
  "PROVENANCE_SANITIZED_CARRIES_DERIVATION",
  "PROVENANCE_DERIVED_WITHOUT_MUTATION",
  "PROVENANCE_DERIVATION_MUST_INVALIDATE_OBSERVED_BEHAVIOUR",
  "PROVENANCE_RETAINED_COVERAGE_EXCEEDS_SOURCE",
  "PROVENANCE_COVERAGE_GRANT_OVERLAP",
  "PROVENANCE_COVERAGE_WITHOUT_SOURCE",
  "PROVENANCE_EMPTY_CERTIFICATE_INVALID",
  "CASE_ID_DUPLICATE",
  "CASE_ARTIFACT_UNKNOWN",
  "CASE_PARAM_ARTIFACT_UNKNOWN",
  "CASE_ASSERTION_KIND_UNKNOWN",
  "CASE_ASSERTION_PARAMS_INVALID",
  "CASE_ASSERTION_LAYER_MISMATCH",
  "CASE_ASSERTION_PAYLOAD_KIND_MISMATCH",
  "CASE_AUTHORITY_REQUIRED",
  "CASE_AUTHORITY_UNKNOWN",
  "CASE_AUTHORITY_REVISION_STALE",
  // M11-C4e: the two evidence roots.
  "ARTIFACT_ID_DUPLICATE_ACROSS_ROOTS",
  "CASE_ID_DUPLICATE_ACROSS_ROOTS",
  "CORPUS_REFERENCES_ARCHIVE",
  "ARCHIVE_DEPENDENCY_INVALID",
  "ARCHIVE_ARTIFACT_NOT_SANITIZED_CAPTURE",
  "ARCHIVE_ASSERTION_KIND_NOT_PERMITTED",
  "ARCHIVE_CASE_WITHOUT_ARCHIVE_EVIDENCE",
  // M11-C4h: the negative-control substitution rule.
  "CONTROL_SUBSTITUTION_REQUIRES_DERIVED",
  "CONTROL_SUBSTITUTION_PARENT_NOT_SANITIZED",
  "CONTROL_SUBSTITUTION_TRANSFORMATION_INVALID",
  "CONTROL_SUBSTITUTION_COVERAGE_DIFFERS",
  "CONTROL_SUBSTITUTION_DIFF_INVALID",
  // M11-E2.1: the owned-pet actor slice.
  "ACTOR_SLICE_INVALID",
  "FILTERED_CAPTURE_GRANTED",
] as const;
export type CorpusErrorCode = (typeof CORPUS_ERROR_CODES)[number];

export interface CorpusError {
  readonly code: CorpusErrorCode;
  /** The artifact or case the rule failed for, when there is one. */
  readonly subject: { readonly artifactId: string } | { readonly caseId: string } | null;
  readonly message: string;
}

// --------------------------------------------------------------------------
// Loaded shape
// --------------------------------------------------------------------------

export interface LoadedArtifact {
  readonly record: CorpusArtifactRecord;
  /** File text exactly as read. Never altered. */
  readonly text: string;
  /** Parsed once, for JSON encodings. Absent for RAW_TEXT. */
  readonly json: unknown;
  readonly canonicalByteLength: number;
}

export interface LoadedAssertion {
  readonly kind: AssertionKind;
  readonly params: unknown;
  readonly execution: AssertionExecution;
}

export interface LoadedCase {
  readonly record: CorpusCaseRecord;
  readonly artifact: LoadedArtifact;
  readonly assertions: readonly LoadedAssertion[];
  /**
   * Every artifact the case reads: its own, plus any an assertion names in a
   * `…ArtifactId` parameter (an external-reference case serves a ranking page
   * from a second artifact). Sorted, deduplicated. Coverage of "every artifact
   * is read by some case" counts these.
   */
  readonly referencedArtifactIds: readonly string[];
}

/**
 * How much of the corpus is actually executed. `declared` is reported and is
 * NOT coverage.
 */
export interface AssertionCoverage {
  readonly executable: number;
  readonly declared: number;
}

export interface LoadedCorpus {
  /** Which committed root this is (M11-C4e). Budgets, reports and reference rules follow it. */
  readonly rootId: EvidenceRootId;
  readonly manifest: CorpusManifest;
  /**
   * THIS root's artifacts, sorted by artifactId, code-point order. Independent
   * of manifest and filesystem order. Byte accounting, reports and coverage
   * read this list and nothing else.
   */
  readonly artifacts: readonly LoadedArtifact[];
  /**
   * Every artifact a case of this root may READ: its own, plus — for the
   * evidence archive only — the regression corpus it depends on. Sorted by
   * artifactId. For the regression corpus it is exactly `artifacts`.
   */
  readonly referenceableArtifacts: readonly LoadedArtifact[];
  /** Sorted by caseId, code-point order. */
  readonly cases: readonly LoadedCase[];
  readonly coverage: AssertionCoverage;
  readonly totalArtifactBytes: number;
}

export type CorpusLoadResult =
  | { readonly ok: true; readonly corpus: LoadedCorpus }
  | { readonly ok: false; readonly errors: readonly CorpusError[] };

// --------------------------------------------------------------------------
// Digest
// --------------------------------------------------------------------------

/**
 * The bytes an artifact's digest and byte length describe.
 *
 * `\r\n` is folded to `\n` before hashing. This is the ONLY transformation
 * anywhere in the loader, and it cannot touch payload content: JSON forbids a
 * raw carriage return inside a string, so CRLF can only ever be whitespace.
 * Without it a checkout under `core.autocrlf=true` would fail every digest
 * while the evidence was byte-for-byte the same. `.gitattributes` under the
 * corpus root pins LF as well; this is the belt to that brace.
 */
export function canonicalBytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text.replaceAll("\r\n", "\n"));
}

/** SHA-256 over canonical bytes, lower-case hex. Web Crypto, so it runs in Node and workerd alike. */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

// --------------------------------------------------------------------------
// Rules
// --------------------------------------------------------------------------

function codePointCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * A path is inside the root when it is relative, forward-slashed, has no `.`
 * or `..` segment, and sits under `artifacts/`. Checked lexically: the glob
 * binding already cannot see outside the root, so this rule exists to make an
 * escape attempt an explicit, named failure rather than a missing file.
 */
export function pathViolation(path: string): string | null {
  if (path.includes("\\")) return "contains a backslash; use forward slashes";
  if (path.startsWith("/") || /^[A-Za-z]:/.test(path)) return "is absolute";
  const segments = path.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    return "contains an empty, `.` or `..` segment";
  }
  if (!path.startsWith(ARTIFACT_ROOT)) return `is not under ${ARTIFACT_ROOT}`;
  return null;
}

function parseJsonText(
  text: string,
): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

function payloadKindViolation(kind: PayloadKind, json: unknown): string | null {
  switch (kind) {
    case "WCL_EVENT_ARRAY":
      return Array.isArray(json) ? null : "WCL_EVENT_ARRAY must parse to a JSON array";
    case "WCL_GRAPHQL_DATA":
      return typeof json === "object" && json !== null && !Array.isArray(json)
        ? null
        : "WCL_GRAPHQL_DATA must parse to a JSON object";
    case "WCL_GRAPHQL_PAGE_SEQUENCE":
      return Array.isArray(json) &&
        json.every((page) => typeof page === "object" && page !== null && !Array.isArray(page))
        ? null
        : "WCL_GRAPHQL_PAGE_SEQUENCE must parse to a JSON array of objects";
    case "JSON_VALUE":
      return null;
    case "RAW_TEXT":
      return null;
  }
}

function transformationKinds(artifact: CorpusArtifactRecord): readonly TransformationKind[] {
  return artifact.provenance.transformations.map((entry) => entry.kind);
}

function provenanceErrors(
  artifact: CorpusArtifactRecord,
  byId: ReadonlyMap<string, CorpusArtifactRecord>,
): CorpusError[] {
  const errors: CorpusError[] = [];
  const subject = { artifactId: artifact.artifactId };
  const { kind, parentArtifactId, source } = artifact.provenance;
  const kinds = transformationKinds(artifact);
  const fail = (code: CorpusErrorCode, message: string): void => {
    errors.push({ code, subject, message: `artifact ${artifact.artifactId}: ${message}` });
  };

  // Source facts live on captures and only on captures.
  if ((kind === "REAL_CAPTURE" || kind === "SANITIZED_CAPTURE") && source === null) {
    fail("PROVENANCE_SOURCE_REQUIRED", `${kind} must record its source capture`);
  }
  if ((kind === "SYNTHETIC" || kind === "DERIVED_FROM_CAPTURE") && source !== null) {
    fail(
      "PROVENANCE_SOURCE_FORBIDDEN",
      `${kind} must not restate a source capture; it has none or reaches it via its parent`,
    );
  }

  // Lineage.
  if (kind === "DERIVED_FROM_CAPTURE" && parentArtifactId === null) {
    fail("PROVENANCE_PARENT_REQUIRED", "DERIVED_FROM_CAPTURE must name the artifact it was derived from");
  }
  if (kind === "SYNTHETIC" && parentArtifactId !== null) {
    fail("PROVENANCE_PARENT_FORBIDDEN", "SYNTHETIC has no capture lineage and may not name a parent");
  }
  if (parentArtifactId !== null) {
    const parent = byId.get(parentArtifactId);
    if (parent === undefined) {
      fail("PROVENANCE_PARENT_UNKNOWN", `parent ${parentArtifactId} is not in the manifest`);
    } else if (parent.provenance.kind === "SYNTHETIC") {
      fail(
        "PROVENANCE_PARENT_SYNTHETIC",
        `parent ${parentArtifactId} is SYNTHETIC; a derivation of it has no capture lineage either`,
      );
    } else {
      // Walk to the root; a cycle would never reach a null parent.
      const seen = new Set<string>([artifact.artifactId]);
      let cursor: CorpusArtifactRecord | undefined = parent;
      while (cursor !== undefined) {
        if (seen.has(cursor.artifactId)) {
          fail("PROVENANCE_PARENT_CYCLE", `parent chain returns to ${cursor.artifactId}`);
          break;
        }
        seen.add(cursor.artifactId);
        cursor =
          cursor.provenance.parentArtifactId === null
            ? undefined
            : byId.get(cursor.provenance.parentArtifactId);
      }
    }
  }

  // The kind must match what was actually done to the bytes.
  if (kind === "REAL_CAPTURE" && kinds.length > 0) {
    fail(
      "PROVENANCE_REAL_CAPTURE_TRANSFORMED",
      "REAL_CAPTURE lists transformations; a transformed capture is SANITIZED or DERIVED",
    );
  }
  if (kind === "SANITIZED_CAPTURE" && !kinds.some(isSanitizingTransformation)) {
    fail(
      "PROVENANCE_SANITIZED_WITHOUT_TRANSFORMATION",
      "SANITIZED_CAPTURE lists no sanitizing transformation; untransformed bytes are a REAL_CAPTURE",
    );
  }
  if (kind === "SANITIZED_CAPTURE" && kinds.some(isDerivingTransformation)) {
    fail(
      "PROVENANCE_SANITIZED_CARRIES_DERIVATION",
      "SANITIZED_CAPTURE lists a mutation, injection or removal; that is DERIVED_FROM_CAPTURE",
    );
  }
  if (kind === "DERIVED_FROM_CAPTURE") {
    if (!kinds.some(isDerivingTransformation)) {
      fail(
        "PROVENANCE_DERIVED_WITHOUT_MUTATION",
        "DERIVED_FROM_CAPTURE lists no mutation, injection or removal",
      );
    }
    const invalidatesObserved = artifact.provenance.transformations.some(
      (entry) => isDerivingTransformation(entry.kind) && entry.invalidates.includes("OBSERVED_BEHAVIOUR"),
    );
    if (!invalidatesObserved) {
      fail(
        "PROVENANCE_DERIVATION_MUST_INVALIDATE_OBSERVED_BEHAVIOUR",
        "a deriving transformation must record that it invalidates OBSERVED_BEHAVIOUR; the result was not observed",
      );
    }
  }

  // Retained coverage can only shrink from the source window, and a category
  // may be granted once: two grants naming the same category would make the
  // fight builder pick one, which is a decision the manifest must make.
  const grantedCategories = new Set<string>();
  for (const [ordinal, grant] of artifact.provenance.retainedCoverage.grants.entries()) {
    for (const category of grant.categories) {
      if (grantedCategories.has(category)) {
        fail(
          "PROVENANCE_COVERAGE_GRANT_OVERLAP",
          `grant ${String(ordinal)} names ${category}, which an earlier grant already covers`,
        );
      }
      grantedCategories.add(category);
    }
    if (source === null && kind !== "DERIVED_FROM_CAPTURE") {
      fail(
        "PROVENANCE_COVERAGE_WITHOUT_SOURCE",
        `grant ${String(ordinal)} claims coverage, but the artifact has no capture lineage to retain it from`,
      );
    }
    // Only an events capture has a report-time window to retain coverage from.
    const query = source?.query;
    const start = query !== undefined && "startTimeMs" in query ? query.startTimeMs : undefined;
    const end = query !== undefined && "endTimeMs" in query ? query.endTimeMs : undefined;
    for (const range of grant.ranges) {
      if (typeof start === "number" && range.fromReportTimeMs < start) {
        fail(
          "PROVENANCE_RETAINED_COVERAGE_EXCEEDS_SOURCE",
          `grant ${String(ordinal)} starts at ${String(range.fromReportTimeMs)}, before the source window start ${String(start)}`,
        );
      }
      if (typeof end === "number" && range.toReportTimeMs > end) {
        fail(
          "PROVENANCE_RETAINED_COVERAGE_EXCEEDS_SOURCE",
          `grant ${String(ordinal)} ends at ${String(range.toReportTimeMs)}, after the source window end ${String(end)}`,
        );
      }
      if (range.toReportTimeMs < range.fromReportTimeMs) {
        fail(
          "PROVENANCE_RETAINED_COVERAGE_EXCEEDS_SOURCE",
          `grant ${String(ordinal)} has a range that ends before it starts`,
        );
      }
    }
  }

  return errors;
}

/** Canonical JSON: object keys sorted, so equality never depends on key order. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      codePointCompare(a, b),
    );
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * The negative-control substitution rule (M11-C4h). An artifact that declares
 * `provenance.substitution` must be DERIVED_FROM_CAPTURE, name a
 * SANITIZED_CAPTURE parent directly, carry exactly one transformation — a
 * VALUE_MUTATION — retain exactly its parent's coverage, and differ from its
 * parent's committed payload in exactly the one declared field: the event at
 * `eventIndex` is, in the parent, a `cast` by `sourceActorId` at
 * `reportTimeMs` with `abilityGameID === fromAbilityGameId`; in the child
 * it is that same event with `abilityGameID === toAbilityGameId` and every
 * other field equal; every other event is equal, in the same order. The diff
 * is re-derived here from both payloads, never read from the declaration.
 */
function substitutionErrors(
  artifact: CorpusArtifactRecord,
  byId: ReadonlyMap<string, CorpusArtifactRecord>,
  eventsById: ReadonlyMap<string, readonly Record<string, unknown>[]>,
): CorpusError[] {
  const declared = artifact.provenance.substitution;
  if (declared === undefined) return [];
  const errors: CorpusError[] = [];
  const subject = { artifactId: artifact.artifactId };
  const fail = (code: CorpusErrorCode, message: string): void => {
    errors.push({ code, subject, message: `artifact ${artifact.artifactId}: ${message}` });
  };
  if (artifact.provenance.kind !== "DERIVED_FROM_CAPTURE") {
    fail(
      "CONTROL_SUBSTITUTION_REQUIRES_DERIVED",
      `declares a substitution but is ${artifact.provenance.kind}; a substituted capture is DERIVED_FROM_CAPTURE`,
    );
    return errors;
  }
  const parentId = artifact.provenance.parentArtifactId;
  const parent = parentId === null ? undefined : byId.get(parentId);
  if (parent === undefined || parent.provenance.kind !== "SANITIZED_CAPTURE") {
    fail(
      "CONTROL_SUBSTITUTION_PARENT_NOT_SANITIZED",
      `a substitution's parent must be a SANITIZED_CAPTURE held by this corpus; ${String(parentId)} is ${parent === undefined ? "not" : parent.provenance.kind}`,
    );
    return errors;
  }
  const transformations = artifact.provenance.transformations;
  if (transformations.length !== 1 || transformations[0]?.kind !== "VALUE_MUTATION") {
    fail(
      "CONTROL_SUBSTITUTION_TRANSFORMATION_INVALID",
      `a substitution carries exactly one VALUE_MUTATION; this artifact lists [${transformations.map((entry) => entry.kind).join(", ")}]`,
    );
  }
  if (artifact.payloadKind !== "WCL_EVENT_ARRAY" || parent.payloadKind !== "WCL_EVENT_ARRAY") {
    fail("CONTROL_SUBSTITUTION_DIFF_INVALID", "a substitution is defined over two WCL event arrays only");
    return errors;
  }
  const own = {
    grants: artifact.provenance.retainedCoverage.grants,
    certifiedEmpty: artifact.provenance.retainedCoverage.certifiedEmpty ?? [],
  };
  const theirs = {
    grants: parent.provenance.retainedCoverage.grants,
    certifiedEmpty: parent.provenance.retainedCoverage.certifiedEmpty ?? [],
  };
  if (canonicalJson(own) !== canonicalJson(theirs)) {
    fail(
      "CONTROL_SUBSTITUTION_COVERAGE_DIFFERS",
      `a substitution retains exactly its parent's coverage grants and certificates; ${parent.artifactId}'s differ`,
    );
  }
  const child = eventsById.get(artifact.artifactId);
  const original = eventsById.get(parent.artifactId);
  if (child === undefined || original === undefined) {
    fail("CONTROL_SUBSTITUTION_DIFF_INVALID", "the child or parent payload is not a loaded event array");
    return errors;
  }
  const diff = (message: string): void => {
    fail("CONTROL_SUBSTITUTION_DIFF_INVALID", message);
  };
  if (child.length !== original.length) {
    diff(`holds ${String(child.length)} events; its parent holds ${String(original.length)}`);
    return errors;
  }
  if (declared.fromAbilityGameId === declared.toAbilityGameId) diff("the substitution changes nothing");
  const differing: number[] = [];
  for (let index = 0; index < child.length; index += 1) {
    if (canonicalJson(child[index]) !== canonicalJson(original[index])) differing.push(index);
  }
  if (differing.length !== 1 || differing[0] !== declared.eventIndex) {
    diff(
      `differs from its parent at event(s) [${differing.join(", ")}]; exactly the declared event ${String(declared.eventIndex)} may differ`,
    );
    return errors;
  }
  const before = original[declared.eventIndex] ?? {};
  const after = child[declared.eventIndex] ?? {};
  if (
    before["type"] !== "cast" ||
    before["sourceID"] !== declared.sourceActorId ||
    before["timestamp"] !== declared.reportTimeMs ||
    before["abilityGameID"] !== declared.fromAbilityGameId
  ) {
    diff(
      `the parent's event ${String(declared.eventIndex)} is not a cast by ${String(declared.sourceActorId)} at ${String(declared.reportTimeMs)} of ${String(declared.fromAbilityGameId)}`,
    );
  }
  const { abilityGameID: toId, ...afterRest } = after;
  const { abilityGameID: _fromId, ...beforeRest } = before;
  if (toId !== declared.toAbilityGameId) {
    diff(`the child's event carries abilityGameID ${String(toId)}, not ${String(declared.toAbilityGameId)}`);
  }
  if (canonicalJson(afterRest) !== canonicalJson(beforeRest)) {
    diff("the substituted event differs from its parent in a field other than abilityGameID");
  }
  return errors;
}

/**
 * The owned set a fight context's master data states for `focusActorId`: the
 * same derivation `scripts/sanitize-probe.mjs deriveOwnedPetScope` performs,
 * re-done here from the committed catalog so the manifest's declaration is
 * checked rather than trusted. `null` with a reason when the catalog cannot
 * support it.
 */
function ownedSetFromCatalog(
  catalog: unknown,
  focusActorId: number,
):
  { readonly ok: true; readonly owned: readonly number[] } | { readonly ok: false; readonly reason: string } {
  const actors = (catalog as { reportData?: { report?: { masterData?: { actors?: unknown } } } } | null)
    ?.reportData?.report?.masterData?.actors;
  if (!Array.isArray(actors)) return { ok: false, reason: "the catalog holds no masterData.actors array" };
  const seen = new Set<number>();
  const owned: number[] = [];
  for (const entry of actors as readonly Record<string, unknown>[]) {
    const id = entry["id"];
    const owner = entry["petOwner"];
    if (typeof id !== "number" || !Number.isSafeInteger(id))
      return { ok: false, reason: "the catalog holds an actor without an integer id" };
    if (seen.has(id)) return { ok: false, reason: `actor ${String(id)} is listed more than once` };
    seen.add(id);
    if (owner !== null && owner !== undefined && !(typeof owner === "number" && Number.isSafeInteger(owner)))
      return { ok: false, reason: `actor ${String(id)} has a petOwner that is neither an integer nor null` };
    if (owner !== focusActorId) continue;
    if (id === focusActorId) return { ok: false, reason: "the focus names itself as its own petOwner" };
    if (entry["type"] === "Player")
      return { ok: false, reason: `actor ${String(id)} is a Player but names the focus as its petOwner` };
    owned.push(id);
  }
  if (!seen.has(focusActorId))
    return { ok: false, reason: `focus actor ${String(focusActorId)} is not in the catalog` };
  return { ok: true, owned: owned.sort((a, b) => a - b) };
}

/**
 * The friendly-players roster of one fight (M12-B), the same rule
 * `scripts/sanitize-probe.mjs deriveFriendlyPlayerRoster` cuts with: the fight
 * listed exactly once, a non-empty `friendlyPlayers` of distinct integers,
 * each a `Player` listed exactly once in the master data. Ascending.
 */
function friendlyRosterFromCatalog(
  catalog: unknown,
  fightId: number,
):
  | { readonly ok: true; readonly roster: readonly number[] }
  | { readonly ok: false; readonly reason: string } {
  const report = (
    catalog as {
      reportData?: { report?: { fights?: unknown; masterData?: { actors?: unknown } } };
    } | null
  )?.reportData?.report;
  const fights = report?.fights;
  const actors = report?.masterData?.actors;
  if (!Array.isArray(fights)) return { ok: false, reason: "the catalog holds no fights array" };
  if (!Array.isArray(actors)) return { ok: false, reason: "the catalog holds no masterData.actors array" };
  const matching = (fights as readonly Record<string, unknown>[]).filter((fight) => fight["id"] === fightId);
  if (matching.length !== 1) {
    return {
      ok: false,
      reason: `fight ${String(fightId)} is listed ${String(matching.length)} times, not once`,
    };
  }
  const roster = matching[0]?.["friendlyPlayers"];
  if (!Array.isArray(roster) || roster.length === 0) {
    return { ok: false, reason: `fight ${String(fightId)} has no friendlyPlayers roster` };
  }
  const seen = new Set<number>();
  for (const id of roster as readonly unknown[]) {
    if (typeof id !== "number" || !Number.isSafeInteger(id)) {
      return { ok: false, reason: `fight ${String(fightId)} lists a non-integer friendly player` };
    }
    if (seen.has(id)) return { ok: false, reason: `friendly player ${String(id)} is listed more than once` };
    seen.add(id);
    const listed = (actors as readonly Record<string, unknown>[]).filter((actor) => actor["id"] === id);
    if (listed.length !== 1) {
      return {
        ok: false,
        reason: `friendly player ${String(id)} is listed ${String(listed.length)} times in the master data, not once`,
      };
    }
    if (listed[0]?.["type"] !== "Player") {
      return { ok: false, reason: `friendly player ${String(id)} is not a Player in the master data` };
    }
  }
  return { ok: true, roster: [...seen].sort((a, b) => a - b) };
}

/** Raw types per granted category, from the supported-family contracts. GEAR is read from combatantinfo. */
function rawTypesFeeding(category: string): readonly string[] {
  const feeding = category === "GEAR" ? "COMBATANT_INFO" : category;
  return [...categoriesByRawType(SUPPORTED_TYPE_CONTRACTS)]
    .filter(([, fed]) => fed === feeding)
    .map(([rawType]) => rawType);
}

const sameList = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);

/**
 * The owned-pet actor slice rule (M11-E2.1): the declaration is re-derived
 * from the catalog and re-checked against every retained event. Any
 * disagreement fails closed — a grant cannot vouch for an actor the catalog
 * does not tie to the focus, and an event from outside the declared predicate
 * means the artifact is not the slice its grant describes.
 */
function actorSliceErrors(
  artifact: CorpusArtifactRecord,
  loadedById: ReadonlyMap<string, LoadedArtifact>,
  eventsById: ReadonlyMap<string, readonly Record<string, unknown>[]>,
): CorpusError[] {
  const slice = artifact.provenance.actorSlice;
  if (slice === undefined) return [];
  const errors: CorpusError[] = [];
  const fail = (message: string): void => {
    errors.push({
      code: "ACTOR_SLICE_INVALID",
      subject: { artifactId: artifact.artifactId },
      message: `artifact ${artifact.artifactId}: ${message}`,
    });
  };
  const source = artifact.provenance.source;
  if (artifact.payloadKind !== "WCL_EVENT_ARRAY" || source === null) {
    fail("an actor-set slice is a captured WCL event array");
    return errors;
  }

  // ---- the actor set, re-derived from the committed catalog ----
  const catalog = loadedById.get(slice.catalogArtifactId);
  if (catalog === undefined || catalog.record.payloadKind !== "WCL_GRAPHQL_DATA") {
    fail(`catalog ${slice.catalogArtifactId} is not a loaded WCL_GRAPHQL_DATA artifact`);
    return errors;
  }
  const catalogSource = catalog.record.provenance.source;
  if (catalogSource?.reportCode !== source.reportCode || catalogSource.fightId !== source.fightId) {
    fail(`catalog ${slice.catalogArtifactId} is not from this artifact's report and fight`);
  }
  let scope: number[];
  if (slice.mode === "FIGHT_FRIENDLY_PLAYERS") {
    if (slice.fightId !== source.fightId) {
      fail(`names fight ${String(slice.fightId)}, but its capture is of fight ${String(source.fightId)}`);
    }
    const derived = friendlyRosterFromCatalog(catalog.json, slice.fightId);
    if (!derived.ok) {
      fail(`the catalog cannot establish the friendly roster: ${derived.reason}`);
      return errors;
    }
    if (!sameList(derived.roster, slice.playerActorIds)) {
      fail(
        `declares roster [${slice.playerActorIds.join(", ")}] but the catalog's friendlyPlayers give [${derived.roster.join(", ")}]`,
      );
    }
    scope = [...derived.roster];
  } else {
    const derived = ownedSetFromCatalog(catalog.json, slice.focusActorId);
    if (!derived.ok) {
      fail(`the catalog cannot establish ownership: ${derived.reason}`);
      return errors;
    }
    if (!sameList(derived.owned, slice.ownedActorIds)) {
      fail(
        `declares owned actors [${slice.ownedActorIds.join(", ")}] but the catalog's petOwner links give [${derived.owned.join(", ")}]`,
      );
    }
    scope = [slice.focusActorId, ...derived.owned].sort((a, b) => a - b);
  }
  const scopeSet = new Set(scope);
  const actorlessFamilies = slice.mode === "FIGHT_FRIENDLY_PLAYERS" ? [] : slice.actorlessFamilies;
  const grantsWithheld = slice.mode === "FIGHT_FRIENDLY_PLAYERS" ? undefined : slice.grantsWithheld;

  // ---- grants: exactly the derived scope, only categories the families feed ----
  const families = new Set(slice.families);
  for (const type of actorlessFamilies) {
    if (!families.has(type)) fail(`actorless family ${type} is not a retained family`);
  }
  const grants = artifact.provenance.retainedCoverage.grants;
  if (grantsWithheld === undefined && grants.length === 0) {
    fail("an actor-set slice must state its grant, or record why it is withheld");
  }
  if (grantsWithheld !== undefined && grants.length > 0) {
    fail("an actor-set slice that withholds its grants must hold none");
  }
  for (const [ordinal, grant] of grants.entries()) {
    if (
      grant.actorScope === null ||
      !sameList(
        [...grant.actorScope].sort((a, b) => a - b),
        scope,
      )
    ) {
      fail(
        `grant ${String(ordinal)} has actor scope ${JSON.stringify(grant.actorScope)}; the derived scope is [${scope.join(", ")}]`,
      );
    }
    for (const category of grant.categories) {
      const missing = rawTypesFeeding(category).filter((type) => !families.has(type));
      if (missing.length > 0) {
        fail(
          `grant ${String(ordinal)} names ${category}, but its families [${missing.join(", ")}] were not retained`,
        );
      }
    }
  }
  // With grants withheld, the predicate is checked over the capture's own window.
  const query = source.query;
  const ranges =
    grantsWithheld === undefined
      ? grants.flatMap((grant) => grant.ranges)
      : "startTimeMs" in query && typeof query.startTimeMs === "number" && typeof query.endTimeMs === "number"
        ? [{ fromReportTimeMs: query.startTimeMs, toReportTimeMs: query.endTimeMs }]
        : [];
  if (grantsWithheld !== undefined && ranges.length === 0) {
    fail("a slice that withholds its grants needs an events capture with a recorded window");
  }
  const granted = (timestamp: unknown): boolean =>
    typeof timestamp === "number" &&
    ranges.some((range) => timestamp >= range.fromReportTimeMs && timestamp <= range.toReportTimeMs);

  // ---- every retained event satisfies the predicate ----
  const actorless = new Set(actorlessFamilies);
  const active = new Set<number>();
  const events = eventsById.get(artifact.artifactId) ?? [];
  let outside = 0;
  let firstOutside = "";
  events.forEach((event, index) => {
    const sourceId = event["sourceID"];
    const targetId = event["targetID"];
    const type = event["type"];
    const inScope =
      (typeof sourceId === "number" && scopeSet.has(sourceId)) ||
      (typeof targetId === "number" && scopeSet.has(targetId));
    const structural =
      typeof type === "string" && actorless.has(type) && !("sourceID" in event) && !("targetID" in event);
    if (typeof sourceId === "number" && scopeSet.has(sourceId)) active.add(sourceId);
    if (typeof targetId === "number" && scopeSet.has(targetId)) active.add(targetId);
    if (
      (inScope || structural) &&
      typeof type === "string" &&
      families.has(type) &&
      granted(event["timestamp"])
    )
      return;
    outside += 1;
    if (firstOutside === "")
      firstOutside = `event ${String(index)} (${String(type)}, source ${String(sourceId)}, target ${String(targetId)}, at ${String(event["timestamp"])})`;
  });
  if (outside > 0) {
    fail(`${String(outside)} retained event(s) lie outside the declared slice, first ${firstOutside}`);
  }

  // ---- the activity split matches the events ----
  const withEvents = [...active].sort((a, b) => a - b);
  const without = scope.filter((id) => !active.has(id));
  if (
    !sameList(withEvents, slice.actorsWithRetainedEvents) ||
    !sameList(without, slice.actorsWithoutRetainedEvents)
  ) {
    fail(
      `declares activity [${slice.actorsWithRetainedEvents.join(", ")}] / none [${slice.actorsWithoutRetainedEvents.join(", ")}], but the events give [${withEvents.join(", ")}] / [${without.join(", ")}]`,
    );
  }
  return errors;
}

/**
 * Every value under a key ending in `ArtifactId`, anywhere in a params
 * object — and every element of a list under a key ending in `ArtifactIds`
 * (a bundle's history parts, M10-C5 Phase B).
 */
function artifactIdParamsOf(value: unknown, path: readonly string[] = []): { path: string; id: unknown }[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => artifactIdParamsOf(entry, [...path, String(index)]));
  }
  if (typeof value !== "object" || value === null) return [];
  return Object.entries(value).flatMap(([key, entry]) =>
    key.endsWith("ArtifactId")
      ? [{ path: [...path, key].join("."), id: entry }]
      : key.endsWith("ArtifactIds") && Array.isArray(entry)
        ? entry.map((id, index) => ({ path: [...path, key, String(index)].join("."), id }))
        : artifactIdParamsOf(entry, [...path, key]),
  );
}

/**
 * A zero-event certificate is checked against BOTH artifacts' recorded
 * captures and retained events (M10-C5 Phase B). Every rule below is one the
 * bundle composer relies on when it joins two grants across the interval.
 */
function certificateErrors(
  artifact: CorpusArtifactRecord,
  byId: ReadonlyMap<string, CorpusArtifactRecord>,
  eventsById: ReadonlyMap<string, readonly Record<string, unknown>[]>,
): CorpusError[] {
  const errors: CorpusError[] = [];
  const subject = { artifactId: artifact.artifactId };
  const fail = (message: string): void => {
    errors.push({
      code: "PROVENANCE_EMPTY_CERTIFICATE_INVALID",
      subject,
      message: `artifact ${artifact.artifactId}: ${message}`,
    });
  };
  const certificates = artifact.provenance.retainedCoverage.certifiedEmpty ?? [];
  for (const [ordinal, certificate] of certificates.entries()) {
    const label = `certificate ${String(ordinal)}`;
    const { fromReportTimeMs: from, toReportTimeMs: to, precedingArtifactId } = certificate;
    if (to < from) {
      fail(`${label} ends before it starts`);
      continue;
    }
    const preceding = byId.get(precedingArtifactId);
    if (preceding === undefined) {
      fail(`${label} names unknown preceding artifact ${precedingArtifactId}`);
      continue;
    }
    const ownSource = artifact.provenance.source;
    const precedingSource = preceding.provenance.source;
    const ownQuery = ownSource?.query;
    const precedingQuery = precedingSource?.query;
    if (
      ownSource === null ||
      ownSource === undefined ||
      precedingSource === null ||
      precedingSource === undefined ||
      ownQuery === undefined ||
      precedingQuery === undefined ||
      !("startTimeMs" in ownQuery) ||
      !("endTimeMs" in precedingQuery)
    ) {
      fail(`${label}: both artifacts must be events captures with recorded queries`);
      continue;
    }
    if (
      ownSource.reportCode !== precedingSource.reportCode ||
      ownSource.fightId !== precedingSource.fightId
    ) {
      fail(`${label}: the preceding artifact is a different report or fight`);
    }
    if (
      precedingSource.completeness.state !== "COMPLETE" ||
      precedingSource.completeness.nextPageTimestamp !== null
    ) {
      fail(`${label}: the preceding capture is not a terminal COMPLETE capture`);
    }
    if (ownSource.completeness.state !== "COMPLETE" || ownSource.completeness.nextPageTimestamp !== null) {
      fail(`${label}: this artifact's capture is not a terminal COMPLETE capture`);
    }
    const precedingEnd = Math.max(
      ...preceding.provenance.retainedCoverage.grants.flatMap((grant) =>
        grant.ranges.map((r) => r.toReportTimeMs),
      ),
      Number.NEGATIVE_INFINITY,
    );
    if (from !== precedingEnd + 1) {
      fail(
        `${label} starts at ${String(from)}, but the preceding artifact's retained coverage ends at ${String(precedingEnd)}`,
      );
    }
    // The preceding capture's EXCLUSIVE end must lie beyond the interval, so
    // every event the source held inside it was retrieved by that capture.
    const precedingQueryEnd = precedingQuery.endTimeMs;
    if (typeof precedingQueryEnd !== "number" || to >= precedingQueryEnd) {
      fail(
        `${label} ends at ${String(to)}, not before the preceding capture's exclusive query end ${String(precedingQueryEnd)}`,
      );
    }
    // And this artifact's own coverage must begin right after the interval,
    // inside its own capture window.
    const ownStart = Math.min(
      ...artifact.provenance.retainedCoverage.grants.flatMap((grant) =>
        grant.ranges.map((r) => r.fromReportTimeMs),
      ),
      Number.POSITIVE_INFINITY,
    );
    if (ownStart !== to + 1) {
      fail(
        `${label} ends at ${String(to)}, but this artifact's retained coverage begins at ${String(ownStart)}`,
      );
    }
    const ownQueryStart = ownQuery.startTimeMs;
    if (typeof ownQueryStart !== "number" || ownQueryStart > to + 1) {
      fail(`${label}: this artifact's capture begins at ${String(ownQueryStart)}, after the interval`);
    }
    // Neither artifact retains an event inside the interval.
    for (const [id, events] of [
      [preceding.artifactId, eventsById.get(preceding.artifactId) ?? []],
      [artifact.artifactId, eventsById.get(artifact.artifactId) ?? []],
    ] as const) {
      const inside = events.filter((event) => {
        const timestamp = event["timestamp"];
        return typeof timestamp === "number" && timestamp >= from && timestamp <= to;
      }).length;
      if (inside > 0)
        fail(`${label}: ${id} retains ${String(inside)} event(s) inside the certified-empty interval`);
    }
  }
  return errors;
}

function caseErrors(
  kase: CorpusCaseRecord,
  artifact: CorpusArtifactRecord | undefined,
  knownArtifactIds: ReadonlySet<string>,
  forbiddenArtifactIds: ReadonlySet<string> = new Set(),
): {
  readonly errors: CorpusError[];
  readonly assertions: LoadedAssertion[];
  readonly referencedArtifactIds: readonly string[];
} {
  const errors: CorpusError[] = [];
  const assertions: LoadedAssertion[] = [];
  const referenced = new Set<string>([kase.artifactId]);
  const subject = { caseId: kase.caseId };
  const fail = (code: CorpusErrorCode, message: string): void => {
    errors.push({ code, subject, message: `case ${kase.caseId}: ${message}` });
  };

  if (forbiddenArtifactIds.has(kase.artifactId)) {
    fail(
      "CORPUS_REFERENCES_ARCHIVE",
      `artifact ${kase.artifactId} is an evidence-archive artifact; a regression-corpus case may never read the archive`,
    );
  } else if (artifact === undefined) {
    fail("CASE_ARTIFACT_UNKNOWN", `artifact ${kase.artifactId} is not in the manifest`);
  }

  let needsAuthority = false;
  kase.assertions.forEach((assertion, ordinal) => {
    if (!Object.hasOwn(ASSERTION_KINDS, assertion.kind)) {
      fail(
        "CASE_ASSERTION_KIND_UNKNOWN",
        `assertion ${String(ordinal)} kind ${assertion.kind} is not registered`,
      );
      return;
    }
    const kind = assertion.kind as AssertionKind;
    const definition = ASSERTION_KINDS[kind];
    const parsed = definition.params.safeParse(assertion.params);
    if (!parsed.success) {
      const detail = parsed.error.issues
        .map((issue) => `${issue.path.map(String).join(".") || "<root>"}: ${issue.message}`)
        .join("; ");
      fail(
        "CASE_ASSERTION_PARAMS_INVALID",
        `assertion ${String(ordinal)} (${kind}) params rejected: ${detail}`,
      );
      return;
    }
    if (definition.owningLayer !== kase.owningLayer) {
      fail(
        "CASE_ASSERTION_LAYER_MISMATCH",
        `assertion ${String(ordinal)} (${kind}) is owned by ${definition.owningLayer}, but the case is owned by ${kase.owningLayer}`,
      );
    }
    if (
      artifact !== undefined &&
      !(definition.payloadKinds as readonly PayloadKind[]).includes(artifact.payloadKind)
    ) {
      fail(
        "CASE_ASSERTION_PAYLOAD_KIND_MISMATCH",
        `assertion ${String(ordinal)} (${kind}) needs a ${definition.payloadKinds.join(" or ")} artifact, but ${artifact.artifactId} is ${artifact.payloadKind}`,
      );
    }
    needsAuthority ||= definition.requiresAuthority;
    for (const reference of artifactIdParamsOf(parsed.data)) {
      if (typeof reference.id === "string" && forbiddenArtifactIds.has(reference.id)) {
        fail(
          "CORPUS_REFERENCES_ARCHIVE",
          `assertion ${String(ordinal)} (${kind}) names evidence-archive artifact ${reference.id} at ${reference.path}; a regression-corpus case may never read the archive`,
        );
        continue;
      }
      if (typeof reference.id !== "string" || !knownArtifactIds.has(reference.id)) {
        fail(
          "CASE_PARAM_ARTIFACT_UNKNOWN",
          `assertion ${String(ordinal)} (${kind}) names artifact ${String(reference.id)} at ${reference.path}, which is not in the manifest`,
        );
        continue;
      }
      referenced.add(reference.id);
    }
    assertions.push({ kind, params: parsed.data, execution: definition.execution });
  });

  if (needsAuthority && kase.authority === null) {
    fail(
      "CASE_AUTHORITY_REQUIRED",
      "an authority-dependent assertion needs the case to pin an authority revision",
    );
  }
  if (kase.authority !== null) {
    const pinned = PINNED_AUTHORITY_REVISIONS[kase.authority.authorityId];
    if (pinned === undefined) {
      fail(
        "CASE_AUTHORITY_UNKNOWN",
        `authority ${kase.authority.authorityId} is not a committed authority artifact`,
      );
    } else if (pinned !== kase.authority.artifactRevision) {
      fail(
        "CASE_AUTHORITY_REVISION_STALE",
        `pinned to ${kase.authority.authorityId} revision ${kase.authority.artifactRevision}, but the committed revision is ${pinned}; re-verify the expectation before re-pinning`,
      );
    }
  }

  return { errors, assertions, referencedArtifactIds: [...referenced].sort(codePointCompare) };
}

// --------------------------------------------------------------------------
// Load
// --------------------------------------------------------------------------

/**
 * Validates a corpus and returns it fully resolved, or every error found.
 *
 * All rules run; the first failure does not hide the rest. Nothing in `files`
 * is written to, and the returned artifacts hold the text exactly as given.
 */
export interface CorpusRootOptions {
  /** Which root `files` is. Defaults to the regression corpus. */
  readonly rootId?: EvidenceRootId;
  /**
   * The loaded regression corpus an EVIDENCE_ARCHIVE depends on: its
   * artifacts are readable by archive cases and its ids share one namespace
   * with the archive's. Required for, and only for, the archive.
   */
  readonly dependency?: LoadedCorpus;
  /**
   * Ids known to belong to the evidence archive, when validating the
   * regression corpus beside it: a corpus case naming one is
   * CORPUS_REFERENCES_ARCHIVE rather than a merely unknown artifact.
   */
  readonly archiveArtifactIds?: ReadonlySet<string>;
}

export async function validateCorpus(
  files: CorpusFileTable,
  options: CorpusRootOptions = {},
): Promise<CorpusLoadResult> {
  const errors: CorpusError[] = [];
  const rootId: EvidenceRootId = options.rootId ?? "REGRESSION_CORPUS";
  const isArchive = rootId === "EVIDENCE_ARCHIVE";
  const dependency = options.dependency;
  if (isArchive && (dependency === undefined || dependency.rootId !== "REGRESSION_CORPUS")) {
    return {
      ok: false,
      errors: [
        {
          code: "ARCHIVE_DEPENDENCY_INVALID",
          subject: null,
          message: "the evidence archive must be validated against a loaded regression corpus",
        },
      ],
    };
  }
  if (!isArchive && dependency !== undefined) {
    return {
      ok: false,
      errors: [
        {
          code: "ARCHIVE_DEPENDENCY_INVALID",
          subject: null,
          message: "the regression corpus depends on nothing; only the evidence archive takes a dependency",
        },
      ],
    };
  }
  const dependencyArtifacts = new Map(
    (dependency?.artifacts ?? []).map((entry) => [entry.record.artifactId, entry] as const),
  );
  const dependencyCaseIds = new Set((dependency?.cases ?? []).map((entry) => entry.record.caseId));
  const archiveArtifactIds = isArchive
    ? new Set<string>()
    : (options.archiveArtifactIds ?? new Set<string>());

  const manifestText = files[MANIFEST_PATH];
  if (manifestText === undefined) {
    return {
      ok: false,
      errors: [
        { code: "MANIFEST_MISSING", subject: null, message: `no ${MANIFEST_PATH} in the corpus root` },
      ],
    };
  }
  const manifestJson = parseJsonText(manifestText);
  if (!manifestJson.ok) {
    return {
      ok: false,
      errors: [{ code: "MANIFEST_NOT_JSON", subject: null, message: `${MANIFEST_PATH} is not valid JSON` }],
    };
  }

  // Version before shape: an unsupported version must be named as such, not
  // reported as a pile of shape errors against the wrong schema.
  const versionField =
    typeof manifestJson.value === "object" && manifestJson.value !== null
      ? (manifestJson.value as { contractVersion?: unknown }).contractVersion
      : undefined;
  if (versionField !== CORPUS_CONTRACT_VERSION) {
    const obsolete = typeof versionField === "number" ? OBSOLETE_CONTRACT_VERSIONS[versionField] : undefined;
    return {
      ok: false,
      errors: [
        {
          code: "CONTRACT_VERSION_UNSUPPORTED",
          subject: null,
          message:
            obsolete === undefined
              ? `manifest contractVersion ${JSON.stringify(versionField)} is not supported; this loader reads version ${String(CORPUS_CONTRACT_VERSION)} only`
              : `manifest contractVersion ${String(versionField)} is obsolete: ${obsolete} This loader reads version ${String(CORPUS_CONTRACT_VERSION)} only and does not reinterpret older manifests.`,
        },
      ],
    };
  }

  const parsed = manifestSchema.safeParse(manifestJson.value);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map((issue) => ({
        code: "MANIFEST_SHAPE_INVALID" as const,
        subject: null,
        message: `${issue.path.map(String).join(".") || "<root>"}: ${issue.message}`,
      })),
    };
  }
  const manifest = parsed.data;

  // Identity and references.
  const artifactsById = new Map<string, CorpusArtifactRecord>();
  const pathsSeen = new Map<string, string>();
  for (const artifact of manifest.artifacts) {
    if (artifactsById.has(artifact.artifactId)) {
      errors.push({
        code: "ARTIFACT_ID_DUPLICATE",
        subject: { artifactId: artifact.artifactId },
        message: `artifact id ${artifact.artifactId} appears more than once`,
      });
      continue;
    }
    if (dependencyArtifacts.has(artifact.artifactId)) {
      errors.push({
        code: "ARTIFACT_ID_DUPLICATE_ACROSS_ROOTS",
        subject: { artifactId: artifact.artifactId },
        message: `artifact id ${artifact.artifactId} is already a regression-corpus artifact; ids are one namespace across both roots, whatever the bytes`,
      });
    }
    if (isArchive && artifact.provenance.kind !== "SANITIZED_CAPTURE") {
      errors.push({
        code: "ARCHIVE_ARTIFACT_NOT_SANITIZED_CAPTURE",
        subject: { artifactId: artifact.artifactId },
        message: `artifact ${artifact.artifactId} is ${artifact.provenance.kind}; the evidence archive retains SANITIZED_CAPTURE evidence only`,
      });
    }
    artifactsById.set(artifact.artifactId, artifact);
    const owner = pathsSeen.get(artifact.path);
    if (owner !== undefined) {
      errors.push({
        code: "ARTIFACT_PATH_DUPLICATE",
        subject: { artifactId: artifact.artifactId },
        message: `artifact ${artifact.artifactId} shares path ${artifact.path} with ${owner}; one file is one artifact`,
      });
    } else {
      pathsSeen.set(artifact.path, artifact.artifactId);
    }
  }

  // Bytes.
  const loadedArtifacts: LoadedArtifact[] = [];
  let totalArtifactBytes = 0;
  for (const artifact of [...artifactsById.values()].sort((a, b) =>
    codePointCompare(a.artifactId, b.artifactId),
  )) {
    const subject = { artifactId: artifact.artifactId };
    const violation = pathViolation(artifact.path);
    if (violation !== null) {
      errors.push({
        code: "ARTIFACT_PATH_OUTSIDE_ROOT",
        subject,
        message: `artifact ${artifact.artifactId} path ${artifact.path} ${violation}`,
      });
      continue;
    }
    const text = files[artifact.path];
    if (text === undefined) {
      errors.push({
        code: "ARTIFACT_FILE_MISSING",
        subject,
        message: `artifact ${artifact.artifactId}: no file at ${artifact.path}`,
      });
      continue;
    }

    const bytes = canonicalBytesOf(text);
    totalArtifactBytes += bytes.byteLength;
    if (bytes.byteLength > MAX_ARTIFACT_BYTES) {
      errors.push({
        code: "ARTIFACT_TOO_LARGE",
        subject,
        message: `artifact ${artifact.artifactId} is ${String(bytes.byteLength)} bytes; the ceiling is ${String(MAX_ARTIFACT_BYTES)}`,
      });
    }
    if (bytes.byteLength !== artifact.byteLength) {
      errors.push({
        code: "ARTIFACT_BYTE_LENGTH_MISMATCH",
        subject,
        message: `artifact ${artifact.artifactId} declares ${String(artifact.byteLength)} bytes but the file holds ${String(bytes.byteLength)}`,
      });
    }
    const actualDigest = await sha256Hex(bytes);
    if (actualDigest !== artifact.sha256) {
      errors.push({
        code: "ARTIFACT_DIGEST_MISMATCH",
        subject,
        message: `artifact ${artifact.artifactId} declares sha256 ${artifact.sha256} but the file hashes to ${actualDigest}`,
      });
    }

    let json: unknown = undefined;
    if (artifact.encoding === "JSON") {
      if (artifact.payloadKind === "RAW_TEXT") {
        errors.push({
          code: "ARTIFACT_ENCODING_KIND_MISMATCH",
          subject,
          message: `artifact ${artifact.artifactId} is encoded JSON but declares payload kind RAW_TEXT`,
        });
      }
      const parsedArtifact = parseJsonText(text);
      if (!parsedArtifact.ok) {
        errors.push({
          code: "ARTIFACT_NOT_JSON",
          subject,
          message: `artifact ${artifact.artifactId} is declared JSON but does not parse; declare RAW_TEXT if the bytes are meant to be unparseable`,
        });
      } else {
        json = parsedArtifact.value;
        const kindViolation = payloadKindViolation(artifact.payloadKind, json);
        if (kindViolation !== null) {
          errors.push({
            code: "ARTIFACT_PAYLOAD_KIND_MISMATCH",
            subject,
            message: `artifact ${artifact.artifactId}: ${kindViolation}`,
          });
        }
      }
    } else if (artifact.payloadKind !== "RAW_TEXT") {
      errors.push({
        code: "ARTIFACT_ENCODING_KIND_MISMATCH",
        subject,
        message: `artifact ${artifact.artifactId} is RAW_TEXT encoded but declares payload kind ${artifact.payloadKind}`,
      });
    }

    loadedArtifacts.push({ record: artifact, text, json, canonicalByteLength: bytes.byteLength });
  }
  // The total ceiling is the regression corpus's. The archive has a notice
  // line (a test) and no total ceiling; its per-artifact ceiling is above.
  if (!isArchive && totalArtifactBytes > MAX_CORPUS_BYTES) {
    errors.push({
      code: "CORPUS_TOO_LARGE",
      subject: null,
      message: `artifacts total ${String(totalArtifactBytes)} bytes; the ceiling is ${String(MAX_CORPUS_BYTES)}`,
    });
  }

  // Every byte under the root has a manifest entry. An orphan is either a
  // forgotten artifact or a forgotten deletion, and both need a human.
  for (const path of Object.keys(files).sort(codePointCompare)) {
    if (path === MANIFEST_PATH || !path.startsWith(ARTIFACT_ROOT)) continue;
    if (!pathsSeen.has(path)) {
      errors.push({
        code: "CORPUS_FILE_UNREFERENCED",
        subject: null,
        message: `${path} is under ${ARTIFACT_ROOT} but no artifact references it`,
      });
    }
  }

  // Lineage. An archive artifact may descend from, or sit after, a corpus
  // artifact; the corpus never sees the archive.
  const lineageById = new Map<string, CorpusArtifactRecord>(
    [...dependencyArtifacts.values()].map((entry) => [entry.record.artifactId, entry.record] as const),
  );
  for (const [id, record] of artifactsById) lineageById.set(id, record);
  for (const artifact of artifactsById.values()) {
    errors.push(...provenanceErrors(artifact, lineageById));
  }

  // Zero-event certificates, checked against both artifacts' retained events.
  const eventsById = new Map<string, readonly Record<string, unknown>[]>();
  for (const entry of [...dependencyArtifacts.values(), ...loadedArtifacts]) {
    if (Array.isArray(entry.json))
      eventsById.set(entry.record.artifactId, entry.json as Record<string, unknown>[]);
  }
  for (const artifact of artifactsById.values()) {
    errors.push(...certificateErrors(artifact, lineageById, eventsById));
  }
  // Negative-control substitutions, checked against both committed payloads.
  for (const artifact of artifactsById.values()) {
    errors.push(...substitutionErrors(artifact, lineageById, eventsById));
  }
  // A filtered capture retains no coverage (the documented `actorFilter` rule,
  // and M13-A's family-selected FILTERED_EVENT_STREAMS).
  for (const artifact of artifactsById.values()) {
    const query = artifact.provenance.source?.query;
    if (query === undefined || artifact.provenance.retainedCoverage.grants.length === 0) continue;
    const filter =
      "actorFilter" in query && query.actorFilter !== "NONE"
        ? JSON.stringify(query.actorFilter)
        : "kind" in query && query.kind === "FILTERED_EVENT_STREAMS"
          ? JSON.stringify(query.streams.map((stream) => [stream.dataType, stream.filterExpression]))
          : null;
    if (filter !== null) {
      errors.push({
        code: "FILTERED_CAPTURE_GRANTED",
        subject: { artifactId: artifact.artifactId },
        message: `artifact ${artifact.artifactId}: a capture filtered by ${filter} retains no coverage, but it grants some`,
      });
    }
  }
  // Owned-pet actor slices, re-derived from their committed catalog.
  const loadedArtifactsById = new Map<string, LoadedArtifact>(
    [...dependencyArtifacts.values(), ...loadedArtifacts].map(
      (entry) => [entry.record.artifactId, entry] as const,
    ),
  );
  for (const artifact of artifactsById.values()) {
    errors.push(...actorSliceErrors(artifact, loadedArtifactsById, eventsById));
  }

  // Cases.
  const referenceable = [...dependencyArtifacts.values(), ...loadedArtifacts].sort((a, b) =>
    codePointCompare(a.record.artifactId, b.record.artifactId),
  );
  const loadedById = new Map(referenceable.map((entry) => [entry.record.artifactId, entry]));
  const knownIds = new Set([...artifactsById.keys(), ...dependencyArtifacts.keys()]);
  const casesById = new Map<string, CorpusCaseRecord>();
  const loadedCases: LoadedCase[] = [];
  let executable = 0;
  let declared = 0;
  for (const kase of manifest.cases) {
    if (casesById.has(kase.caseId)) {
      errors.push({
        code: "CASE_ID_DUPLICATE",
        subject: { caseId: kase.caseId },
        message: `case id ${kase.caseId} appears more than once`,
      });
      continue;
    }
    if (dependencyCaseIds.has(kase.caseId)) {
      errors.push({
        code: "CASE_ID_DUPLICATE_ACROSS_ROOTS",
        subject: { caseId: kase.caseId },
        message: `case id ${kase.caseId} is already a regression-corpus case; ids are one namespace across both roots`,
      });
    }
    casesById.set(kase.caseId, kase);
    const artifactRecord =
      artifactsById.get(kase.artifactId) ?? dependencyArtifacts.get(kase.artifactId)?.record;
    const checked = caseErrors(kase, artifactRecord, knownIds, archiveArtifactIds);
    errors.push(...checked.errors);
    if (isArchive) {
      kase.assertions.forEach((assertion, ordinal) => {
        if (!isEvidenceArchiveAssertionKind(assertion.kind)) {
          errors.push({
            code: "ARCHIVE_ASSERTION_KIND_NOT_PERMITTED",
            subject: { caseId: kase.caseId },
            message: `case ${kase.caseId}: assertion ${String(ordinal)} kind ${assertion.kind} is not an evidence-verification family; the archive is not a regression corpus`,
          });
        }
      });
      if (!checked.referencedArtifactIds.some((id) => artifactsById.has(id))) {
        errors.push({
          code: "ARCHIVE_CASE_WITHOUT_ARCHIVE_EVIDENCE",
          subject: { caseId: kase.caseId },
          message: `case ${kase.caseId} reads no evidence-archive artifact; a case over regression-corpus artifacts alone belongs in the regression corpus`,
        });
      }
    }
    const artifact = loadedById.get(kase.artifactId);
    if (artifact === undefined) continue;
    for (const assertion of checked.assertions) {
      if (assertion.execution === "EXECUTABLE") executable += 1;
      else declared += 1;
    }
    loadedCases.push({
      record: kase,
      artifact,
      assertions: checked.assertions,
      referencedArtifactIds: checked.referencedArtifactIds,
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  loadedCases.sort((a, b) => codePointCompare(a.record.caseId, b.record.caseId));
  return {
    ok: true,
    corpus: {
      rootId,
      manifest,
      artifacts: loadedArtifacts,
      referenceableArtifacts: referenceable,
      cases: loadedCases,
      coverage: { executable, declared },
      totalArtifactBytes,
    },
  };
}

/** Throws with every error listed, for tests that need a corpus or nothing. */
export async function loadCorpusOrThrow(files: CorpusFileTable): Promise<LoadedCorpus> {
  const result = await validateCorpus(files);
  if (!result.ok) {
    throw new Error(
      `corpus rejected:\n${result.errors.map((error) => `  [${error.code}] ${error.message}`).join("\n")}`,
    );
  }
  return result.corpus;
}

/**
 * The evidence archive and the regression corpus it depends on, validated
 * together (M11-C4e). The corpus is validated FIRST and on its own terms —
 * its limits, its ids — with the archive's artifact ids known, so a corpus
 * case that names one is CORPUS_REFERENCES_ARCHIVE; then the archive is
 * validated against the loaded corpus. Either failing fails the whole.
 */
export async function validateEvidenceArchive(
  archiveFiles: CorpusFileTable,
  corpusFiles: CorpusFileTable,
): Promise<
  | { readonly ok: true; readonly archive: LoadedCorpus; readonly corpus: LoadedCorpus }
  | { readonly ok: false; readonly errors: readonly CorpusError[] }
> {
  const declaredIds = (files: CorpusFileTable): Set<string> => {
    const ids = new Set<string>();
    const text = files[MANIFEST_PATH];
    if (text === undefined) return ids;
    const parsed = parseJsonText(text);
    const artifacts = parsed.ok ? (parsed.value as { artifacts?: unknown } | null)?.artifacts : undefined;
    if (!Array.isArray(artifacts)) return ids;
    for (const entry of artifacts) {
      const id = (entry as { artifactId?: unknown } | null)?.artifactId;
      if (typeof id === "string") ids.add(id);
    }
    return ids;
  };
  // An id the corpus declares ITSELF is the corpus's: a corpus case reading it
  // reads its own artifact. If the archive declares it too, that duplicate is
  // the archive's error (ARTIFACT_ID_DUPLICATE_ACROSS_ROOTS, below), never
  // misread as a corpus → archive reference.
  const corpusIds = declaredIds(corpusFiles);
  const archiveArtifactIds = new Set([...declaredIds(archiveFiles)].filter((id) => !corpusIds.has(id)));
  const corpus = await validateCorpus(corpusFiles, { archiveArtifactIds });
  if (!corpus.ok) {
    return {
      ok: false,
      errors: [
        ...corpus.errors,
        {
          code: "ARCHIVE_DEPENDENCY_INVALID",
          subject: null,
          message: "the regression corpus the evidence archive depends on does not validate",
        },
      ],
    };
  }
  const archive = await validateCorpus(archiveFiles, {
    rootId: "EVIDENCE_ARCHIVE",
    dependency: corpus.corpus,
  });
  if (!archive.ok) return { ok: false, errors: archive.errors };
  return { ok: true, archive: archive.corpus, corpus: corpus.corpus };
}

/** The artifact with this id among those a case of `corpus` may read, or undefined. */
export function referenceableArtifact(corpus: LoadedCorpus, artifactId: string): LoadedArtifact | undefined {
  return corpus.referenceableArtifacts.find((entry) => entry.record.artifactId === artifactId);
}

// --------------------------------------------------------------------------
// The committed corpus
// --------------------------------------------------------------------------

/**
 * Bound at build time by Vite. Only `manifest.json` and the artifact tree are
 * visible; policy documents and git attributes under the root are not corpus
 * files. Keys are rewritten to corpus-relative, forward-slashed paths in sorted
 * order, so enumeration does not depend on how the filesystem listed them.
 */
const COMMITTED_MANIFEST: Record<string, string> = import.meta.glob("../../corpus/manifest.json", {
  eager: true,
  query: "?raw",
  import: "default",
});
const COMMITTED_ARTIFACTS: Record<string, string> = import.meta.glob("../../corpus/artifacts/**", {
  eager: true,
  query: "?raw",
  import: "default",
});
const COMMITTED_FILES: Record<string, string> = { ...COMMITTED_MANIFEST, ...COMMITTED_ARTIFACTS };

export function committedCorpusFiles(): CorpusFileTable {
  const table: Record<string, string> = {};
  for (const key of Object.keys(COMMITTED_FILES).sort(codePointCompare)) {
    const relative = key
      .split("\\")
      .join("/")
      .replace(/^(?:\.\.\/)+corpus\//, "");
    const text = COMMITTED_FILES[key];
    if (text !== undefined) table[relative] = text;
  }
  return table;
}

export async function loadCommittedCorpus(): Promise<CorpusLoadResult> {
  return validateCorpus(committedCorpusFiles());
}

/** Owning-layer source roots, re-exported for guards that check ownership is real. */
export type { OwningLayer };
