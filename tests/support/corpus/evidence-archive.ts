/**
 * The committed EVIDENCE ARCHIVE (M11-C4e): qualifying real evidence retained
 * for promotion verification, separately from the executable regression
 * corpus.
 *
 * WHY A SEPARATE MODULE
 *
 * This is the ONLY module that binds `tests/evidence/` through
 * `import.meta.glob`. The regression corpus's loader, harness, machine report
 * and gate import nothing from here, so a regression-corpus run never bundles,
 * loads, hashes or executes an archived byte — the separation is structural,
 * not a size exclusion. A test proves no regression-corpus module imports it.
 *
 * WHAT THE ARCHIVE IS
 *
 * The same artifact and case schema and the same provenance vocabulary as the
 * corpus, validated by the same loader with `rootId: "EVIDENCE_ARCHIVE"` and
 * the regression corpus as its one dependency:
 *
 *   - SANITIZED_CAPTURE artifacts only, 512 KiB each, no total ceiling (a
 *     notice line at EVIDENCE_ARCHIVE_NOTICE_BYTES, checked by a test);
 *   - evidence-verification assertion families only, each case reading at
 *     least one archive artifact;
 *   - archive cases may read corpus artifacts; corpus cases may never read
 *     the archive; ids are one namespace across both.
 *
 * It is executed by `npm run test:evidence` (`scripts/corpus/gate.mjs --root
 * evidence`): twice under workerd, byte-identical, and equal to the committed
 * `tests/evidence/report.json`.
 */

import {
  executeLoadedCorpus,
  type HarnessOptions,
  type HarnessResult,
  type HarnessSelection,
} from "./harness.js";
import {
  committedCorpusFiles,
  validateEvidenceArchive,
  type CorpusError,
  type CorpusFileTable,
  type LoadedCorpus,
} from "./loader.js";

const ARCHIVE_MANIFEST: Record<string, string> = import.meta.glob("../../evidence/manifest.json", {
  eager: true,
  query: "?raw",
  import: "default",
});
const ARCHIVE_ARTIFACTS: Record<string, string> = import.meta.glob("../../evidence/artifacts/**", {
  eager: true,
  query: "?raw",
  import: "default",
});
const ARCHIVE_REPORT: Record<string, string> = import.meta.glob("../../evidence/report.json", {
  eager: true,
  query: "?raw",
  import: "default",
});

function codePointCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The committed archive as a file table: `manifest.json` and `artifacts/…`, archive-relative, sorted. */
export function committedEvidenceArchiveFiles(): CorpusFileTable {
  const files: Record<string, string> = { ...ARCHIVE_MANIFEST, ...ARCHIVE_ARTIFACTS };
  const table: Record<string, string> = {};
  for (const key of Object.keys(files).sort(codePointCompare)) {
    const relative = key
      .split("\\")
      .join("/")
      .replace(/^(?:\.\.\/)+evidence\//, "");
    const text = files[key];
    if (text !== undefined) table[relative] = text;
  }
  return table;
}

/** The committed `tests/evidence/report.json`, parsed, or `null` when it is absent. */
export function committedEvidenceReport(): unknown {
  const text = ARCHIVE_REPORT["../../evidence/report.json"];
  return text === undefined ? null : (JSON.parse(text) as unknown);
}

export type EvidenceArchiveLoadResult =
  | { readonly ok: true; readonly archive: LoadedCorpus; readonly corpus: LoadedCorpus }
  | { readonly ok: false; readonly errors: readonly CorpusError[] };

/** The committed archive validated against the committed regression corpus. */
export async function loadCommittedEvidenceArchive(): Promise<EvidenceArchiveLoadResult> {
  return validateEvidenceArchive(committedEvidenceArchiveFiles(), committedCorpusFiles());
}

/**
 * Validates the archive against the corpus, then runs the SAME execution path
 * the regression corpus uses over the archive's cases. Defaults to the
 * committed files; a test hands in in-memory tables.
 */
export async function runEvidenceArchiveHarness(
  selection: HarnessSelection,
  options: HarnessOptions,
  archiveFiles: CorpusFileTable = committedEvidenceArchiveFiles(),
  corpusFiles: CorpusFileTable = committedCorpusFiles(),
): Promise<HarnessResult> {
  const validation = await validateEvidenceArchive(archiveFiles, corpusFiles);
  if (!validation.ok) return { ok: false, stage: "VALIDATION", errors: validation.errors };
  return executeLoadedCorpus(validation.archive, selection, options);
}
