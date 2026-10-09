import { describe, expect, it } from "vitest";

import {
  SUPPORTED_TYPE_CONTRACTS,
  categoriesByRawType,
} from "../../src/engine/normalization/supported-families.js";
import {
  DEATH_EVENT_EVIDENCE,
  EVIDENCE_ARCHIVE_ID,
  EVIDENCE_CAPABILITY_REGISTRY,
  type ArchivedCaptureEvidence,
  type EvidenceCategory,
} from "../../src/wcl/evidence-capability.js";
import { committedEvidenceArchiveFiles } from "../support/corpus/evidence-archive.js";
import {
  canonicalBytesOf,
  committedCorpusFiles,
  sha256Hex,
  type CorpusFileTable,
} from "../support/corpus/loader.js";

/**
 * M11-F, owner decision N3: production evidence may cite either committed
 * evidence ROOT — the regression corpus (`SANITIZED_CAPTURE`) or the evidence
 * archive (`ARCHIVED_CAPTURE`) — and every archive citation must resolve
 * against the root it names, by immutable identity:
 *
 *   - the root's manifest identity equals `archiveId`;
 *   - the manifest holds `fixtureId`, as a WCL event array;
 *   - the committed bytes hash to `fixtureSha256` (recomputed here, not read);
 *   - the bytes contain the cited raw type.
 *
 * No path, no arbitrary file: a citation is resolved through a root's
 * manifest or it fails. The negatives below are in-memory edits.
 */

type Resolution =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly reason:
        | "ROOT_NOT_SUPPORTED"
        | "ROOT_IDENTITY_MISMATCH"
        | "FIXTURE_NOT_IN_ROOT"
        | "NOT_AN_EVENT_ARRAY"
        | "DIGEST_MISMATCH"
        | "RAW_TYPE_NOT_IN_FIXTURE";
    };

async function resolveArchived(
  citation: ArchivedCaptureEvidence,
  rawTypes: readonly string[],
  files: CorpusFileTable = committedEvidenceArchiveFiles(),
): Promise<Resolution> {
  if (citation.evidenceRoot !== "EVIDENCE_ARCHIVE") return { ok: false, reason: "ROOT_NOT_SUPPORTED" };
  const manifest = JSON.parse(files["manifest.json"] ?? "null") as {
    corpusId: string;
    artifacts: { artifactId: string; path: string; payloadKind: string; sha256: string }[];
  };
  if (manifest.corpusId !== citation.archiveId) return { ok: false, reason: "ROOT_IDENTITY_MISMATCH" };
  const record = manifest.artifacts.find((entry) => entry.artifactId === citation.fixtureId);
  const text = record === undefined ? undefined : files[record.path];
  if (record === undefined || text === undefined) return { ok: false, reason: "FIXTURE_NOT_IN_ROOT" };
  if (record.payloadKind !== "WCL_EVENT_ARRAY") return { ok: false, reason: "NOT_AN_EVENT_ARRAY" };
  const digest = await sha256Hex(canonicalBytesOf(text));
  if (digest !== citation.fixtureSha256 || record.sha256 !== citation.fixtureSha256) {
    return { ok: false, reason: "DIGEST_MISMATCH" };
  }
  const present = new Set(
    (JSON.parse(text) as { type?: unknown }[])
      .map((event) => event.type)
      .filter((type) => typeof type === "string"),
  );
  if (!rawTypes.some((type) => present.has(type))) return { ok: false, reason: "RAW_TYPE_NOT_IN_FIXTURE" };
  return { ok: true };
}

/** Raw types that feed a category, from the production contracts. */
function rawTypesFeeding(category: EvidenceCategory): readonly string[] {
  return [...categoriesByRawType(SUPPORTED_TYPE_CONTRACTS)]
    .filter(([, fed]) => fed === category)
    .map(([rawType]) => rawType);
}

describe("every evidence-archive citation in production resolves against the archive", () => {
  it("each archived family contract resolves to its fixture, digest and raw type", async () => {
    const archived = SUPPORTED_TYPE_CONTRACTS.filter(
      (contract) => contract.evidence.kind === "ARCHIVED_CAPTURE",
    );
    expect(archived.map((contract) => contract.rawType)).toEqual(["death"]);
    for (const contract of archived) {
      if (contract.evidence.kind !== "ARCHIVED_CAPTURE") continue;
      expect(await resolveArchived(contract.evidence, [contract.rawType]), contract.rawType).toEqual({
        ok: true,
      });
    }
  });

  it("each archived capability record resolves to a fixture holding a raw type that feeds its category", async () => {
    const archived = Object.entries(EVIDENCE_CAPABILITY_REGISTRY).filter(
      ([, record]) => record.capability === "OBSERVABLE" && record.evidence.kind === "ARCHIVED_CAPTURE",
    );
    expect(archived.map(([category]) => category)).toEqual(["DEATHS"]);
    for (const [category, record] of archived) {
      if (record.capability !== "OBSERVABLE" || record.evidence.kind !== "ARCHIVED_CAPTURE") continue;
      const feeding = rawTypesFeeding(category as EvidenceCategory);
      expect(feeding, category).toContain("death");
      expect(await resolveArchived(record.evidence, feeding), category).toEqual({ ok: true });
    }
  });

  it("names the archive by its manifest identity, never by a path", () => {
    expect(EVIDENCE_ARCHIVE_ID).toBe("warcraft-logs-coach-vnext.evidence-archive");
    expect(DEATH_EVENT_EVIDENCE.archiveId).toBe(EVIDENCE_ARCHIVE_ID);
    expect(JSON.stringify(DEATH_EVENT_EVIDENCE)).not.toMatch(/\/|\\|\.json/);
  });
});

describe("a citation that does not match its root is refused", () => {
  const citation = DEATH_EVENT_EVIDENCE;

  it("refuses a different root identity", async () => {
    expect(
      await resolveArchived({ ...citation, archiveId: "warcraft-logs-coach-vnext.regression-corpus" }, [
        "death",
      ]),
    ).toEqual({
      ok: false,
      reason: "ROOT_IDENTITY_MISMATCH",
    });
  });

  it("refuses the regression corpus presented as the archive (no silent cross-root fallback)", async () => {
    expect(await resolveArchived(citation, ["death"], committedCorpusFiles())).toEqual({
      ok: false,
      reason: "ROOT_IDENTITY_MISMATCH",
    });
  });

  it("refuses a fixture the archive does not hold", async () => {
    expect(await resolveArchived({ ...citation, fixtureId: "wcl-not-a-fixture" }, ["death"])).toEqual({
      ok: false,
      reason: "FIXTURE_NOT_IN_ROOT",
    });
  });

  it("refuses a digest that does not match the committed bytes", async () => {
    expect(await resolveArchived({ ...citation, fixtureSha256: "0".repeat(64) }, ["death"])).toEqual({
      ok: false,
      reason: "DIGEST_MISMATCH",
    });
  });

  it("refuses edited bytes even when the citation is unchanged", async () => {
    const files: Record<string, string> = { ...committedEvidenceArchiveFiles() };
    const path = `artifacts/wcl-events/${citation.fixtureId}.json`;
    files[path] = `${(files[path] ?? "").trimEnd()} \n`;
    expect(await resolveArchived(citation, ["death"], files)).toEqual({
      ok: false,
      reason: "DIGEST_MISMATCH",
    });
  });

  it("refuses a fixture that does not contain the cited raw type", async () => {
    expect(await resolveArchived(citation, ["resurrect"])).toEqual({
      ok: false,
      reason: "RAW_TYPE_NOT_IN_FIXTURE",
    });
  });
});
