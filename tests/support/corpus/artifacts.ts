/**
 * Synchronous access to committed corpus artifacts, for tests that consume an
 * artifact's payload directly.
 *
 * WHY A SECOND ENTRY POINT EXISTS
 *
 * The loader validates — digests, lineage, references — and is async because
 * hashing is. A layer test that wants "the D2 events" at module load time
 * cannot await, and re-validating the whole corpus in every such test would be
 * redundant: `m9a-corpus-seed-cases.test.ts` and the harness already prove the
 * committed corpus loads clean, in both Vitest projects, on every run.
 *
 * So this reads the same build-time file table the loader reads, resolves an
 * artifact id through the committed manifest, and returns its payload. It does
 * not skip validation — validation runs elsewhere in the same suite — and it
 * fails loudly on an id or path the manifest does not know, so a renamed
 * artifact cannot silently hand a consumer nothing.
 *
 * The payload is parsed fresh on every call and never cached across callers,
 * so a consumer that mutates what it received cannot leak the mutation into
 * another test.
 */

import { manifestSchema, type CorpusArtifactRecord, type CorpusManifest } from "./contract.js";
import { committedCorpusFiles, MANIFEST_PATH } from "./loader.js";

/**
 * The committed manifest, shape-validated synchronously.
 *
 * Shape only: ids, paths, lineage fields and grants are typed and checked
 * against the contract schema, so a consumer cannot read a malformed grant.
 * Digests, cross-references and lineage rules are the async loader's job and
 * run in the corpus tests of the same suite.
 */
export function committedManifest(): CorpusManifest {
  const text = committedCorpusFiles()[MANIFEST_PATH];
  if (text === undefined) throw new Error("the committed corpus has no manifest.json");
  const parsed = manifestSchema.safeParse(JSON.parse(text));
  if (!parsed.success) {
    throw new Error(
      `tests/corpus/manifest.json does not match the corpus contract: ${parsed.error.issues[0]?.message ?? "?"}`,
    );
  }
  return parsed.data;
}

/** The committed manifest record for an id, or a loud failure. */
export function committedArtifactRecord(artifactId: string): CorpusArtifactRecord {
  const entry = committedManifest().artifacts.find((candidate) => candidate.artifactId === artifactId);
  if (entry === undefined) {
    throw new Error(`corpus artifact ${artifactId} is not in tests/corpus/manifest.json`);
  }
  return entry;
}

function entryFor(artifactId: string): CorpusArtifactRecord {
  return committedArtifactRecord(artifactId);
}

/** The artifact's bytes as text, exactly as committed. */
export function committedArtifactText(artifactId: string): string {
  const entry = entryFor(artifactId);
  const text = committedCorpusFiles()[entry.path];
  if (text === undefined) {
    throw new Error(`corpus artifact ${artifactId} names ${entry.path}, which is not under tests/corpus`);
  }
  return text;
}

/**
 * A `WCL_EVENT_ARRAY` artifact's raw events, in captured order.
 *
 * Refuses any other payload kind rather than returning whatever parsed: a
 * consumer that asked for events must not be handed a page object.
 */
export function committedEventArray(artifactId: string): readonly Record<string, unknown>[] {
  const entry = entryFor(artifactId);
  if (entry.payloadKind !== "WCL_EVENT_ARRAY") {
    throw new Error(`corpus artifact ${artifactId} is ${entry.payloadKind}, not a WCL_EVENT_ARRAY`);
  }
  const parsed: unknown = JSON.parse(committedArtifactText(artifactId));
  if (!Array.isArray(parsed)) {
    throw new Error(`corpus artifact ${artifactId} did not parse to an array`);
  }
  return parsed as readonly Record<string, unknown>[];
}

/** Every committed `WCL_EVENT_ARRAY` artifact, keyed by id, in id order. */
export function committedEventArrays(): ReadonlyMap<string, readonly Record<string, unknown>[]> {
  const result = new Map<string, readonly Record<string, unknown>[]>();
  for (const entry of [...committedManifest().artifacts].sort((a, b) =>
    a.artifactId < b.artifactId ? -1 : 1,
  )) {
    if (entry.payloadKind === "WCL_EVENT_ARRAY")
      result.set(entry.artifactId, committedEventArray(entry.artifactId));
  }
  return result;
}
