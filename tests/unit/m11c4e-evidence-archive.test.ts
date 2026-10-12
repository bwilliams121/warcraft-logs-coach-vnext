import { describe, expect, it } from "vitest";

import {
  ASSERTION_KINDS,
  EVIDENCE_ARCHIVE_NOTICE_BYTES,
  MAX_ARTIFACT_BYTES,
  MAX_CORPUS_BYTES,
  isEvidenceArchiveAssertionKind,
} from "../support/corpus/contract.js";
import {
  committedEvidenceArchiveFiles,
  committedSelectionFrameBytes,
  loadCommittedEvidenceArchive,
  runEvidenceArchiveHarness,
} from "../support/corpus/evidence-archive.js";
import {
  canonicalBytesOf,
  committedCorpusFiles,
  sha256Hex,
  validateCorpus,
  validateEvidenceArchive,
  type CorpusErrorCode,
  type CorpusFileTable,
} from "../support/corpus/loader.js";

/**
 * M11-C4e: the evidence archive is a SEPARATE committed root with its own
 * rules, and the regression corpus never loads it. Every negative below is an
 * in-memory edit of the committed tables — the committed bytes are untouched.
 */

const ARCHIVE_SEGMENT = "wcl-brewmaster-monk-gtkb-full-fight.seg-165-285";

/**
 * M11-E2.1: the canonical Blood Death Knight owned-pet fixture — seven compact
 * segments and their fight context, with their committed byte lengths. It is
 * the ONE owner-reviewed exception to the 4 MiB notice line (approved for this
 * fixture only, 2026-10-06): the archive without it must still sit under the
 * line, and the archive with it is pinned to the byte, so any other growth
 * past the line fails here and needs its own review.
 */
const M11E2_NOTICE_LINE_EXCEPTION: Readonly<Record<string, number>> = {
  "wcl-blood-death-knight-b1pm-full-fight-owned-pets.seg-0-45": 492175,
  "wcl-blood-death-knight-b1pm-full-fight-owned-pets.seg-113-151": 491453,
  "wcl-blood-death-knight-b1pm-full-fight-owned-pets.seg-151-214": 488237,
  "wcl-blood-death-knight-b1pm-full-fight-owned-pets.seg-214-263": 496131,
  "wcl-blood-death-knight-b1pm-full-fight-owned-pets.seg-263-311": 494101,
  "wcl-blood-death-knight-b1pm-full-fight-owned-pets.seg-311-345": 346853,
  "wcl-blood-death-knight-b1pm-full-fight-owned-pets.seg-45-113": 468294,
  "wcl-fight-context-b1pm-fight-48": 144924,
};
const M11E2_BYTES = Object.values(M11E2_NOTICE_LINE_EXCEPTION).reduce((sum, bytes) => sum + bytes, 0);

/**
 * M11-G1: the observed-performance and elite-cohort evidence — seven small,
 * sanitized report and ranking surfaces (no events). Ordinary archive growth
 * (362,565 bytes), named and pinned so it is reviewed rather than absorbed:
 * the archive without the M11-E2 exception, G1 included, stays under the line.
 */
const M11G1_EVIDENCE: Readonly<Record<string, number>> = {
  "wcl-g1-cohort-candidate-1": 43945,
  "wcl-g1-cohort-candidate-2": 96431,
  "wcl-g1-cohort-candidate-3": 54976,
  "wcl-g1-cohort-rankings-3455-5-blood-bracket-18": 47866,
  "wcl-g1-cohort-rankings-3455-5-blood-bracket-19": 47873,
  "wcl-g1-cohort-rankings-3455-5-blood-bracket-20": 47869,
  "wcl-g1-subject-performance-b1pm-fight-48": 25671,
};
const M11G1_BYTES = Object.values(M11G1_EVIDENCE).reduce((sum, bytes) => sum + bytes, 0);

/**
 * M11-G2: the three G1-selected comparison fights at full E2 parity — 25
 * compact owned-pet segments, three fight contexts, three table surfaces and
 * one NPC-classification surface. A SECOND, one-time, owner-reviewed exception
 * to the notice line (approved 2026-10-12 for this evidence only, ≈12.3 MiB;
 * not a budget and not a precedent). Pinned to the byte: the archive without
 * the M11-E2 and M11-G2 exceptions must still sit under the line.
 */
const M11G2_NOTICE_LINE_EXCEPTION: Readonly<Record<string, number>> = {
  "wcl-g2-cohort116-f64-owned-pets.seg-0-36": 499916,
  "wcl-g2-cohort116-f64-owned-pets.seg-136-192": 481051,
  "wcl-g2-cohort116-f64-owned-pets.seg-192-214": 486719,
  "wcl-g2-cohort116-f64-owned-pets.seg-214-274": 497820,
  "wcl-g2-cohort116-f64-owned-pets.seg-274-288": 470849,
  "wcl-g2-cohort116-f64-owned-pets.seg-288-335": 498094,
  "wcl-g2-cohort116-f64-owned-pets.seg-335-336": 16405,
  "wcl-g2-cohort116-f64-owned-pets.seg-36-96": 496069,
  "wcl-g2-cohort116-f64-owned-pets.seg-96-136": 493600,
  "wcl-g2-cohort246-f33-owned-pets.seg-0-46": 498603,
  "wcl-g2-cohort246-f33-owned-pets.seg-106-144": 495413,
  "wcl-g2-cohort246-f33-owned-pets.seg-144-197": 485741,
  "wcl-g2-cohort246-f33-owned-pets.seg-197-228": 497893,
  "wcl-g2-cohort246-f33-owned-pets.seg-228-284": 492399,
  "wcl-g2-cohort246-f33-owned-pets.seg-284-315": 499493,
  "wcl-g2-cohort246-f33-owned-pets.seg-315-329": 138151,
  "wcl-g2-cohort246-f33-owned-pets.seg-46-106": 492022,
  "wcl-g2-cohort261-f31-owned-pets.seg-0-46": 496380,
  "wcl-g2-cohort261-f31-owned-pets.seg-108-159": 495844,
  "wcl-g2-cohort261-f31-owned-pets.seg-159-200": 492219,
  "wcl-g2-cohort261-f31-owned-pets.seg-200-249": 497330,
  "wcl-g2-cohort261-f31-owned-pets.seg-249-290": 483065,
  "wcl-g2-cohort261-f31-owned-pets.seg-290-342": 497681,
  "wcl-g2-cohort261-f31-owned-pets.seg-342-360": 130510,
  "wcl-g2-cohort261-f31-owned-pets.seg-46-108": 479309,
  "wcl-g2-fight-context-cohort116-fight-64": 228540,
  "wcl-g2-fight-context-cohort246-fight-33": 180393,
  "wcl-g2-fight-context-cohort261-fight-31": 145679,
  "wcl-g2-fight-npcs-comparisons": 12579,
  "wcl-g2-tables-cohort116-fight-64": 158635,
  "wcl-g2-tables-cohort246-fight-33": 159303,
  "wcl-g2-tables-cohort261-fight-31": 164445,
};
const M11G2_BYTES = Object.values(M11G2_NOTICE_LINE_EXCEPTION).reduce((sum, bytes) => sum + bytes, 0);
const ARCHIVE_SEGMENT_PATH = `artifacts/wcl-events/${ARCHIVE_SEGMENT}.json`;
const CORPUS_OPENER = "wcl-brewmaster-monk-gtkb-opener";
const CORPUS_20_165 = "wcl-brewmaster-monk-gtkb-rotational-165s.seg-20-165";

type Json = Record<string, unknown>;

function manifestOf(files: CorpusFileTable): Json & { artifacts: Json[]; cases: Json[] } {
  return JSON.parse(files["manifest.json"] ?? "null") as Json & { artifacts: Json[]; cases: Json[] };
}

function withManifest(files: CorpusFileTable, manifest: unknown): CorpusFileTable {
  return { ...files, "manifest.json": JSON.stringify(manifest) };
}

async function sha256Of(text: string): Promise<string> {
  return sha256Hex(canonicalBytesOf(text));
}

async function archiveErrors(archive: CorpusFileTable, corpus: CorpusFileTable = committedCorpusFiles()) {
  const result = await validateEvidenceArchive(archive, corpus);
  return result.ok ? [] : result.errors;
}

function codes(errors: readonly { readonly code: CorpusErrorCode }[]): readonly CorpusErrorCode[] {
  return [...new Set(errors.map((error) => error.code))].sort();
}

/** A copy of the archive segment's record under a new id/path, for adding artifacts. */
async function recordLike(id: string, path: string, text: string): Promise<Json> {
  const base = manifestOf(committedEvidenceArchiveFiles()).artifacts[0] as Json;
  return {
    ...base,
    artifactId: id,
    path,
    sha256: await sha256Of(text),
    byteLength: canonicalBytesOf(text).byteLength,
  };
}

describe("the committed evidence archive", () => {
  it("validates against the committed regression corpus", async () => {
    const loaded = await loadCommittedEvidenceArchive();
    if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join("\n"));
    expect(loaded.archive.rootId).toBe("EVIDENCE_ARCHIVE");
    expect(loaded.corpus.rootId).toBe("REGRESSION_CORPUS");
    expect(loaded.archive.artifacts.map((entry) => entry.record.artifactId)).toEqual([
      // M11-E2.1: the canonical Blood Death Knight owned-pet segments, code-point order.
      "wcl-blood-death-knight-b1pm-full-fight-owned-pets.seg-0-45",
      "wcl-blood-death-knight-b1pm-full-fight-owned-pets.seg-113-151",
      "wcl-blood-death-knight-b1pm-full-fight-owned-pets.seg-151-214",
      "wcl-blood-death-knight-b1pm-full-fight-owned-pets.seg-214-263",
      "wcl-blood-death-knight-b1pm-full-fight-owned-pets.seg-263-311",
      "wcl-blood-death-knight-b1pm-full-fight-owned-pets.seg-311-345",
      "wcl-blood-death-knight-b1pm-full-fight-owned-pets.seg-45-113",
      ARCHIVE_SEGMENT,
      // M11-C4f: the neutral second subject's 20–165 s segment and fight context.
      "wcl-brewmaster-monk-rxaf-rotational-165s.seg-20-165",
      // M11-E2.1: the Blood Death Knight fight context (catalog and identity).
      "wcl-fight-context-b1pm-fight-48",
      "wcl-fight-context-rxaf-fight-13",
      // M11-G1: observed performance and the elite cohort (report and ranking surfaces only).
      ...Object.keys(M11G1_EVIDENCE),
      // M11-G2: the comparison fights' segments, contexts, tables and NPC surface.
      ...Object.keys(M11G2_NOTICE_LINE_EXCEPTION),
    ]);
    expect(loaded.archive.cases).toHaveLength(9);
    // Accounting is per root: the archive counts its own bytes only.
    expect(loaded.archive.totalArtifactBytes).toBe(
      308961 + 389605 + 387275 + M11E2_BYTES + M11G1_BYTES + M11G2_BYTES,
    );
    for (const [artifactId, bytes] of Object.entries({
      ...M11E2_NOTICE_LINE_EXCEPTION,
      ...M11G1_EVIDENCE,
      ...M11G2_NOTICE_LINE_EXCEPTION,
    })) {
      const entry = loaded.archive.artifacts.find((candidate) => candidate.record.artifactId === artifactId);
      expect(entry?.canonicalByteLength, artifactId).toBe(bytes);
    }
    // Every archive artifact is real evidence.
    for (const entry of loaded.archive.artifacts) {
      expect(entry.record.provenance.kind, entry.record.artifactId).toBe("SANITIZED_CAPTURE");
    }
  });

  it("stays under its 4 MiB notice line (artifacts + selection frames) apart from the owner-reviewed M11-E2 and M11-G2 exceptions, and under its 512 KiB per-artifact ceiling", async () => {
    const loaded = await loadCommittedEvidenceArchive();
    if (!loaded.ok) throw new Error("archive does not load");
    // The archive has NO total ceiling; the notice line is a deliberate
    // hand-crossed marker, like the regression corpus's. It counts every
    // retained byte: the artifacts AND the committed selection frames.
    expect(EVIDENCE_ARCHIVE_NOTICE_BYTES).toBe(4 * 1024 * 1024);
    const frameBytes = committedSelectionFrameBytes();
    expect(frameBytes).toBe(29010);
    // Without the M11-E2 and M11-G2 exceptions the archive is under the line, as before.
    expect(loaded.archive.totalArtifactBytes - M11E2_BYTES - M11G2_BYTES + frameBytes).toBeLessThan(
      EVIDENCE_ARCHIVE_NOTICE_BYTES,
    );
    // With it the line is crossed — by hand, for this fixture only — and the
    // crossing is pinned to the byte: 4,537,019 bytes (≈4.33 MiB) at M11-E2,
    // plus the 364,631 bytes of M11-G1 evidence: 4,901,650.
    // M11-G2 adds its own one-time exception, 12,162,150 bytes (≈11.60 MiB,
    // within the ≈12.3 MiB approved): 17,063,800 bytes in all.
    expect(M11G1_BYTES).toBe(364631);
    expect(M11G2_BYTES).toBe(12162150);
    expect(loaded.archive.totalArtifactBytes + frameBytes).toBe(4537019 + M11G1_BYTES + M11G2_BYTES);
    expect(loaded.archive.totalArtifactBytes + frameBytes).toBe(17063800);
    expect(loaded.archive.totalArtifactBytes + frameBytes).toBeGreaterThan(EVIDENCE_ARCHIVE_NOTICE_BYTES);
    // The regression corpus's own ceiling is untouched by the archive.
    expect(MAX_CORPUS_BYTES).toBe(6 * 1024 * 1024);
    for (const entry of loaded.archive.artifacts) {
      expect(entry.canonicalByteLength).toBeLessThan(MAX_ARTIFACT_BYTES);
    }
  });

  it("a valid archive → corpus reference: the cross-tier bundle reads two corpus parts and one archive part", async () => {
    const loaded = await loadCommittedEvidenceArchive();
    if (!loaded.ok) throw new Error("archive does not load");
    const kase = loaded.archive.cases.find((entry) =>
      entry.record.caseId.startsWith("spec-brewmaster-monk.the-first-full-fight-segment-match"),
    );
    expect(kase?.referencedArtifactIds).toEqual([ARCHIVE_SEGMENT, CORPUS_OPENER, CORPUS_20_165]);
    // The archive can READ the corpus parts; it does not OWN them.
    expect(loaded.archive.artifacts.map((entry) => entry.record.artifactId)).not.toContain(CORPUS_OPENER);
    expect(loaded.archive.referenceableArtifacts.map((entry) => entry.record.artifactId)).toContain(
      CORPUS_OPENER,
    );
  });
});

describe("archive loader refusals", () => {
  it("refuses a duplicate artifact id across roots, whatever the bytes", async () => {
    const archive = committedEvidenceArchiveFiles();
    const corpus = committedCorpusFiles();
    const openerText = corpus[`artifacts/wcl-events/${CORPUS_OPENER}.json`] ?? "";
    const path = `artifacts/wcl-events/${CORPUS_OPENER}.json`;
    const manifest = manifestOf(archive);
    manifest.artifacts.push(await recordLike(CORPUS_OPENER, path, openerText));
    const errors = await archiveErrors({ ...withManifest(archive, manifest), [path]: openerText });
    expect(codes(errors)).toContain("ARTIFACT_ID_DUPLICATE_ACROSS_ROOTS");
  });

  it("refuses a duplicate case id across roots", async () => {
    const archive = committedEvidenceArchiveFiles();
    const manifest = manifestOf(archive);
    const first = manifest.cases[0] as Json;
    const corpusCaseId = (manifestOf(committedCorpusFiles()).cases[0] as Json)["caseId"];
    manifest.cases[0] = { ...first, caseId: corpusCaseId };
    expect(codes(await archiveErrors(withManifest(archive, manifest)))).toContain(
      "CASE_ID_DUPLICATE_ACROSS_ROOTS",
    );
  });

  it("refuses a corpus → archive reference (and the corpus alone refuses it as unknown)", async () => {
    const corpus = committedCorpusFiles();
    const manifest = manifestOf(corpus);
    const target = manifest.cases.find((entry) =>
      String(entry["caseId"]).startsWith("spec-brewmaster-monk.the-165s-shado-pan-window"),
    ) as Json & { assertions: Json[] };
    const assertion = target.assertions[0] as Json & { params: Json };
    assertion.params = { ...assertion.params, historyArtifactIds: [CORPUS_OPENER, ARCHIVE_SEGMENT] };
    const edited = withManifest(corpus, manifest);

    const together = await validateEvidenceArchive(committedEvidenceArchiveFiles(), edited);
    expect(together.ok).toBe(false);
    if (!together.ok) expect(codes(together.errors)).toContain("CORPUS_REFERENCES_ARCHIVE");

    const alone = await validateCorpus(edited);
    expect(alone.ok).toBe(false);
    if (!alone.ok) expect(codes(alone.errors)).toContain("CASE_PARAM_ARTIFACT_UNKNOWN");
  });

  it("refuses a missing archive artifact file", async () => {
    const archive = { ...committedEvidenceArchiveFiles() };
    delete (archive as Record<string, string>)[ARCHIVE_SEGMENT_PATH];
    expect(codes(await archiveErrors(archive))).toContain("ARTIFACT_FILE_MISSING");
  });

  it("refuses an orphan file under the archive's artifact root", async () => {
    const archive = { ...committedEvidenceArchiveFiles(), "artifacts/wcl-events/orphan.json": "[]\n" };
    expect(codes(await archiveErrors(archive))).toContain("CORPUS_FILE_UNREFERENCED");
  });

  it("refuses an archive artifact whose bytes no longer match its digest", async () => {
    const archive = committedEvidenceArchiveFiles();
    const text = archive[ARCHIVE_SEGMENT_PATH] ?? "";
    const tampered = text.replace("2580080", "2580081"); // same length, different bytes
    expect(tampered).not.toBe(text);
    const errors = await archiveErrors({ ...archive, [ARCHIVE_SEGMENT_PATH]: tampered });
    expect(codes(errors)).toContain("ARTIFACT_DIGEST_MISMATCH");
  });

  it("refuses an archive artifact over 512 KiB, and has no total ceiling below that", async () => {
    const archive = committedEvidenceArchiveFiles();
    const manifest = manifestOf(archive);
    // One oversized artifact.
    const big = `[${'"x",'.repeat(Math.ceil(MAX_ARTIFACT_BYTES / 4))}"x"]\n`;
    const bigPath = "artifacts/wcl-events/oversized.json";
    manifest.artifacts.push(await recordLike("oversized-archive-artifact", bigPath, big));
    const errors = await archiveErrors({ ...withManifest(archive, manifest), [bigPath]: big });
    expect(codes(errors)).toContain("ARTIFACT_TOO_LARGE");

    // Many in-limit artifacts past the REGRESSION ceiling: no total refusal.
    const many = manifestOf(archive);
    const extra: Record<string, string> = {};
    const chunk = `[${'"y",'.repeat(Math.floor((MAX_ARTIFACT_BYTES - 1024) / 4))}"y"]\n`;
    const count = Math.ceil(MAX_CORPUS_BYTES / canonicalBytesOf(chunk).byteLength) + 1;
    for (let index = 0; index < count; index += 1) {
      const path = `artifacts/wcl-events/bulk-${String(index)}.json`;
      extra[path] = chunk;
      many.artifacts.push(await recordLike(`bulk-archive-artifact-${String(index)}`, path, chunk));
    }
    // Each file has a manifest record, so none is orphaned; only the byte
    // rules are under test here.
    const bulkErrors = await archiveErrors({ ...withManifest(archive, many), ...extra });
    expect(codes(bulkErrors)).not.toContain("CORPUS_TOO_LARGE");
    expect(codes(bulkErrors)).not.toContain("ARTIFACT_TOO_LARGE");
  });

  it("refuses a non-SANITIZED_CAPTURE archive artifact", async () => {
    const archive = committedEvidenceArchiveFiles();
    const manifest = manifestOf(archive);
    const record = manifest.artifacts[0] as Json & { provenance: Json };
    manifest.artifacts[0] = { ...record, provenance: { ...record.provenance, kind: "DERIVED_FROM_CAPTURE" } };
    expect(codes(await archiveErrors(withManifest(archive, manifest)))).toContain(
      "ARCHIVE_ARTIFACT_NOT_SANITIZED_CAPTURE",
    );
  });

  it("refuses a regression-only assertion family in the archive", async () => {
    const archive = committedEvidenceArchiveFiles();
    const manifest = manifestOf(archive);
    const target = manifest.cases.find((entry) =>
      String(entry["caseId"]).startsWith("spec-brewmaster-monk.the-full-shado-pan-fight"),
    ) as Json & { assertions: Json[] };
    target.assertions.push({
      kind: "SPEC_BREWMASTER_MONK.BUILD_RESOLUTION",
      params: { actorId: 4, expected: {} },
    });
    expect(codes(await archiveErrors(withManifest(archive, manifest)))).toContain(
      "ARCHIVE_ASSERTION_KIND_NOT_PERMITTED",
    );
  });

  it("refuses an archive case that reads no archive artifact", async () => {
    const archive = committedEvidenceArchiveFiles();
    const manifest = manifestOf(archive);
    const census = manifest.cases.find((entry) =>
      String(entry["caseId"]).startsWith("normalization.brewmaster-monk-full-fight-seg-165-285"),
    ) as Json;
    manifest.cases.push({
      ...census,
      caseId: "normalization.a-corpus-only-case-in-the-archive",
      artifactId: CORPUS_OPENER,
    });
    expect(codes(await archiveErrors(withManifest(archive, manifest)))).toContain(
      "ARCHIVE_CASE_WITHOUT_ARCHIVE_EVIDENCE",
    );
  });

  it("refuses a missing cross-tier artifact id", async () => {
    const archive = committedEvidenceArchiveFiles();
    const manifest = manifestOf(archive);
    const target = manifest.cases.find((entry) =>
      String(entry["caseId"]).startsWith("spec-brewmaster-monk.the-first-full-fight-segment-match"),
    ) as Json & { assertions: Json[] };
    const assertion = target.assertions[0] as Json & { params: Json };
    assertion.params = { ...assertion.params, historyArtifactIds: [CORPUS_OPENER, "wcl-no-such-artifact"] };
    expect(codes(await archiveErrors(withManifest(archive, manifest)))).toContain(
      "CASE_PARAM_ARTIFACT_UNKNOWN",
    );
  });

  it("refuses an archive validated without the regression corpus it depends on", async () => {
    const result = await validateCorpus(committedEvidenceArchiveFiles(), { rootId: "EVIDENCE_ARCHIVE" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(codes(result.errors)).toEqual(["ARCHIVE_DEPENDENCY_INVALID"]);
  });

  it("an archive whose dependency corpus fails validation fails too", async () => {
    const corpus = { ...committedCorpusFiles(), "artifacts/wcl-events/stray.json": "[]\n" };
    const result = await validateEvidenceArchive(committedEvidenceArchiveFiles(), corpus);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(codes(result.errors)).toContain("ARCHIVE_DEPENDENCY_INVALID");
  });

  it("an archive that does not validate executes nothing", async () => {
    const archive = { ...committedEvidenceArchiveFiles(), "artifacts/wcl-events/orphan.json": "[]\n" };
    const result = await runEvidenceArchiveHarness({ kind: "ALL" }, { runtime: "NODE" }, archive);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.stage).toBe("VALIDATION");
  });
});

describe("the archive's assertion families are pinned", () => {
  it("exactly these registered kinds may appear in an archive case", () => {
    const permitted = Object.keys(ASSERTION_KINDS).filter(isEvidenceArchiveAssertionKind).sort();
    expect(permitted).toEqual([
      "NORMALIZATION.ACTOR_EVENT_CENSUS",
      "NORMALIZATION.ALL_TYPES_RECOGNISED",
      "NORMALIZATION.BUNDLE_COMPOSITION",
      "NORMALIZATION.EVENT_COUNT_PRESERVED",
      "NORMALIZATION.INPUT_ORDER_PRESERVED",
      "SPEC_ASSASSINATION.DECISION_COVERAGE",
      "SPEC_BLOOD_DEATH_KNIGHT.COVERAGE_SUMMARY",
      "SPEC_BLOOD_DEATH_KNIGHT.DECISION_COVERAGE",
      "SPEC_BREWMASTER_MONK.COVERAGE_SUMMARY",
      "SPEC_BREWMASTER_MONK.DECISION_COVERAGE",
      "SPEC_BREWMASTER_MONK.MEASUREMENT_DISTRIBUTION",
      "SPEC_BREWMASTER_MONK.STATE_EVIDENCE_CENSUS",
      "SPEC_PROTECTION_PALADIN.COVERAGE_SUMMARY",
      "SPEC_PROTECTION_PALADIN.DECISION_COVERAGE",
      "SPEC_RETRIBUTION_PALADIN.COVERAGE_SUMMARY",
      "SPEC_RETRIBUTION_PALADIN.DECISION_COVERAGE",
    ]);
  });
});

// ---------------------------------------------------------------------------
// The regression corpus never loads the archive
// ---------------------------------------------------------------------------

const SUPPORT_SOURCES: Record<string, string> = import.meta.glob("../support/corpus/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});
const REGRESSION_GATE_SOURCES: Record<string, string> = {
  ...(import.meta.glob("../regression/m9b-corpus-gate.test.ts", {
    eager: true,
    query: "?raw",
    import: "default",
  }) as Record<string, string>),
  ...(import.meta.glob("../regression/m9c-corpus-network-isolation.test.ts", {
    eager: true,
    query: "?raw",
    import: "default",
  }) as Record<string, string>),
};
const CORPUS_REPORT: Record<string, string> = import.meta.glob("../corpus/report.json", {
  eager: true,
  query: "?raw",
  import: "default",
});
const PRETTIER_IGNORE: Record<string, string> = import.meta.glob("../../.prettierignore", {
  eager: true,
  query: "?raw",
  import: "default",
});
const ARCHIVE_GIT_ATTRIBUTES: Record<string, string> = import.meta.glob("../evidence/.gitattributes", {
  eager: true,
  query: "?raw",
  import: "default",
});

describe("archive bytes are protected like corpus bytes", () => {
  it("no formatter rewrites an archived artifact, and git pins LF under the archive root", () => {
    // M11-C4f: a sanitized fight context is not Prettier-shaped; reformatting
    // it would change the bytes its digest describes.
    const ignore = Object.values(PRETTIER_IGNORE)[0] ?? "";
    expect(ignore.split(/\r?\n/)).toContain("tests/evidence/artifacts/");
    expect(Object.values(ARCHIVE_GIT_ATTRIBUTES)[0] ?? "").toMatch(/^\* text eol=lf$/m);
  });
});

describe("ordinary corpus execution does not load the archive", () => {
  it("only evidence-archive.ts binds tests/evidence/, and nothing the regression corpus runs imports it", () => {
    const binders = Object.entries(SUPPORT_SOURCES)
      .filter(([, text]) => /import\.meta\.glob\([^)]*evidence\//.test(text))
      .map(([path]) => path.replaceAll("\\", "/").split("/").pop());
    expect(binders).toEqual(["evidence-archive.ts"]);

    const importers = Object.entries(SUPPORT_SOURCES)
      .filter(([, text]) => /from "\.\/evidence-archive\.js"/.test(text))
      .map(([path]) => path.replaceAll("\\", "/").split("/").pop());
    expect(importers).toEqual([]);

    for (const [path, text] of Object.entries(REGRESSION_GATE_SOURCES)) {
      expect(text, path).not.toContain("evidence-archive");
      expect(text, path).not.toContain("evidence/");
    }
  });

  it("the committed corpus file table holds no archive byte, and its report names no archive artifact", () => {
    const files = committedCorpusFiles();
    expect(Object.keys(files).some((path) => path.includes(ARCHIVE_SEGMENT))).toBe(false);
    const report = JSON.parse(CORPUS_REPORT["../corpus/report.json"] ?? "{}") as {
      artifacts?: readonly { artifactId: string }[];
    };
    const ids = (report.artifacts ?? []).map((entry) => entry.artifactId);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids).not.toContain(ARCHIVE_SEGMENT);
  });

  it("the regression corpus validates on its own, with its own limits, and does not depend on anything", async () => {
    const result = await validateCorpus(committedCorpusFiles());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.corpus.rootId).toBe("REGRESSION_CORPUS");
    expect(result.corpus.referenceableArtifacts).toEqual(result.corpus.artifacts);
    expect(result.corpus.totalArtifactBytes).toBeLessThan(MAX_CORPUS_BYTES);
  });
});
