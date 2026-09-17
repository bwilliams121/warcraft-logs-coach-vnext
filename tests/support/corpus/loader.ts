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
  type OwningLayer,
  type PayloadKind,
  type TransformationKind,
} from "./contract.js";

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
  readonly manifest: CorpusManifest;
  /** Sorted by artifactId, code-point order. Independent of manifest and filesystem order. */
  readonly artifacts: readonly LoadedArtifact[];
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

  if (artifact === undefined) {
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
export async function validateCorpus(files: CorpusFileTable): Promise<CorpusLoadResult> {
  const errors: CorpusError[] = [];

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
  if (totalArtifactBytes > MAX_CORPUS_BYTES) {
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

  // Lineage.
  for (const artifact of artifactsById.values()) {
    errors.push(...provenanceErrors(artifact, artifactsById));
  }

  // Zero-event certificates, checked against both artifacts' retained events.
  const eventsById = new Map<string, readonly Record<string, unknown>[]>();
  for (const entry of loadedArtifacts) {
    if (Array.isArray(entry.json))
      eventsById.set(entry.record.artifactId, entry.json as Record<string, unknown>[]);
  }
  for (const artifact of artifactsById.values()) {
    errors.push(...certificateErrors(artifact, artifactsById, eventsById));
  }

  // Cases.
  const loadedById = new Map(loadedArtifacts.map((entry) => [entry.record.artifactId, entry]));
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
    casesById.set(kase.caseId, kase);
    const artifactRecord = artifactsById.get(kase.artifactId);
    const checked = caseErrors(kase, artifactRecord, new Set(artifactsById.keys()));
    errors.push(...checked.errors);
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
      manifest,
      artifacts: loadedArtifacts,
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
