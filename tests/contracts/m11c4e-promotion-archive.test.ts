import { describe, expect, it } from "vitest";

import {
  committedEvidenceArchiveFiles,
  committedEvidenceReport,
  loadCommittedEvidenceArchive,
} from "../support/corpus/evidence-archive.js";
import {
  committedCorpusFiles,
  loadCorpusOrThrow,
  validateEvidenceArchive,
  type LoadedArtifact,
  type LoadedCorpus,
} from "../support/corpus/loader.js";
import {
  evaluatePromotionReadiness,
  type CommittedReport,
  type EvidenceTier,
  type WclIdentity,
} from "../support/corpus/promotion-evidence.js";

/**
 * M11-C4e: the promotion-evidence reader over BOTH committed roots, and every
 * way it must fail closed. The committed gate
 * (`m11-promotion-evidence-gate.test.ts`) runs exactly this reader; here its
 * inputs are edited in memory — the committed bytes are untouched.
 *
 * Pairing is the module's own canonical identity with no table involved, so
 * these tests are about evidence, not about exposure.
 */

const REPORT: Record<string, string> = import.meta.glob("../corpus/report.json", {
  eager: true,
  query: "?raw",
  import: "default",
});

const ARCHIVE_SEGMENT = "wcl-brewmaster-monk-gtkb-full-fight.seg-165-285";
const CROSS_TIER_CASE =
  "spec-brewmaster-monk.the-first-full-fight-segment-match-resolves-over-the-cross-tier-bundle";
const BREWMASTER = (identity: WclIdentity): boolean =>
  identity.className === "Monk" && identity.specName === "Brewmaster";

async function committedTiers(): Promise<{
  readonly corpus: EvidenceTier;
  readonly archive: EvidenceTier;
}> {
  const corpus = await loadCorpusOrThrow(committedCorpusFiles());
  const archive = await loadCommittedEvidenceArchive();
  if (!archive.ok) throw new Error(archive.errors.map((error) => error.message).join("\n"));
  const archiveReport = committedEvidenceReport() as CommittedReport | null;
  if (archiveReport === null) throw new Error("tests/evidence/report.json is absent");
  return {
    corpus: {
      rootId: "REGRESSION_CORPUS",
      corpus,
      report: JSON.parse(REPORT["../corpus/report.json"] ?? "null") as CommittedReport,
    },
    archive: { rootId: "EVIDENCE_ARCHIVE", corpus: archive.archive, report: archiveReport },
  };
}

function archiveOutcome(tiers: readonly EvidenceTier[]) {
  const readiness = evaluatePromotionReadiness(tiers, "monk/brewmaster", "INTERNAL_ONLY", BREWMASTER);
  return {
    readiness,
    qualifying: readiness.qualifyingAssertions.filter((q) => q.caseId === CROSS_TIER_CASE),
    disqualified: readiness.disqualified.filter((d) => d.caseId === CROSS_TIER_CASE),
  };
}

/** The archive's loaded corpus with one artifact's provenance kind replaced (the loader would refuse; the gate must too). */
function withKind(corpus: LoadedCorpus, artifactId: string, kind: string): LoadedCorpus {
  const artifacts: LoadedArtifact[] = corpus.artifacts.map((entry) =>
    entry.record.artifactId === artifactId
      ? ({
          ...entry,
          record: { ...entry.record, provenance: { ...entry.record.provenance, kind } },
        } as LoadedArtifact)
      : entry,
  );
  return { ...corpus, artifacts };
}

describe("a valid mixed SANITIZED_CAPTURE cross-tier bundle qualifies", () => {
  it("the archive's cross-tier MATCH qualifies over corpus + archive parts, all SANITIZED_CAPTURE, PASSED in the archive report", async () => {
    const { corpus, archive } = await committedTiers();
    const { qualifying } = archiveOutcome([corpus, archive]);
    expect(qualifying).toHaveLength(1);
    const q = qualifying[0];
    expect(q?.rootId).toBe("EVIDENCE_ARCHIVE");
    expect(q?.expectedOutcome).toBe("MATCH");
    expect(q?.reportStatus).toBe("PASSED");
    expect(q?.evidenceActor).toEqual({ reportCode: "gtKb2xHn87pNcFfW", fightId: 22, actorId: 4 });
    expect(q?.evidenceIdentity).toEqual({ className: "Monk", specName: "Brewmaster" });
    expect(q?.evidenceSet.map((entry) => `${entry.rootId}:${entry.artifactId}:${entry.kind}`)).toEqual([
      `EVIDENCE_ARCHIVE:${ARCHIVE_SEGMENT}:SANITIZED_CAPTURE`,
      "REGRESSION_CORPUS:wcl-brewmaster-monk-gtkb-opener:SANITIZED_CAPTURE",
      "REGRESSION_CORPUS:wcl-brewmaster-monk-gtkb-rotational-165s.seg-20-165:SANITIZED_CAPTURE",
    ]);
  });

  it("the regression corpus's qualifying assertions are unchanged by the archive's presence", async () => {
    const { corpus, archive } = await committedTiers();
    const alone = evaluatePromotionReadiness([corpus], "monk/brewmaster", "INTERNAL_ONLY", BREWMASTER);
    const both = evaluatePromotionReadiness(
      [corpus, archive],
      "monk/brewmaster",
      "INTERNAL_ONLY",
      BREWMASTER,
    );
    expect(both.qualifyingAssertions.filter((q) => q.rootId === "REGRESSION_CORPUS")).toEqual(
      alone.qualifyingAssertions,
    );
  });
});

describe("the promotion reader fails closed", () => {
  it("an absent archive report qualifies nothing the archive holds", async () => {
    const { corpus, archive } = await committedTiers();
    const { qualifying, disqualified } = archiveOutcome([corpus, { ...archive, report: null }]);
    expect(qualifying).toEqual([]);
    expect(disqualified.map((d) => d.reason)).toEqual(["the committed EVIDENCE_ARCHIVE report is absent"]);
  });

  it("an archive assertion with no PASSED record in the archive report does not qualify", async () => {
    const { corpus, archive } = await committedTiers();
    const report = archive.report;
    if (report === null) throw new Error("no report");
    const withoutRecord: CommittedReport = {
      ...report,
      cases: report.cases.filter((entry) => entry.caseId !== CROSS_TIER_CASE),
    };
    const failed: CommittedReport = {
      ...report,
      cases: report.cases.map((entry) =>
        entry.caseId === CROSS_TIER_CASE
          ? { ...entry, assertions: entry.assertions.map((a) => ({ ...a, status: "FAILED" })) }
          : entry,
      ),
    };
    const missing = archiveOutcome([corpus, { ...archive, report: withoutRecord }]);
    expect(missing.qualifying).toEqual([]);
    expect(missing.disqualified.map((d) => d.reason)).toEqual([
      "the committed EVIDENCE_ARCHIVE report has no record of this assertion",
    ]);
    const notPassed = archiveOutcome([corpus, { ...archive, report: failed }]);
    expect(notPassed.qualifying).toEqual([]);
    expect(notPassed.disqualified.map((d) => d.reason)).toEqual(["the committed report records FAILED"]);
  });

  it("a PASSED record in the WRONG root's report does not count", async () => {
    // The corpus report knows nothing of the archive case; the archive case's
    // status must come from the archive's own report.
    const { corpus, archive } = await committedTiers();
    const { qualifying, disqualified } = archiveOutcome([corpus, { ...archive, report: corpus.report }]);
    expect(qualifying).toEqual([]);
    expect(disqualified.map((d) => d.reason)).toEqual([
      "the committed EVIDENCE_ARCHIVE report has no record of this assertion",
    ]);
  });

  it("a cross-tier artifact no committed root holds disqualifies", async () => {
    // The archive alone: its bundle's corpus parts are held by no tier given.
    const { archive } = await committedTiers();
    const { qualifying, disqualified } = archiveOutcome([archive]);
    expect(qualifying).toEqual([]);
    expect(disqualified.map((d) => d.reason)).toEqual([
      "references artifact wcl-brewmaster-monk-gtkb-opener, which no committed root holds",
    ]);
  });

  it("an artifact two committed roots hold is ambiguous and disqualifies", async () => {
    const { corpus, archive } = await committedTiers();
    const duplicateHolder: EvidenceTier = {
      rootId: "EVIDENCE_ARCHIVE",
      corpus: { ...archive.corpus, cases: [], artifacts: corpus.corpus.artifacts },
      report: archive.report,
    };
    const { qualifying, disqualified } = archiveOutcome([corpus, archive, duplicateHolder]);
    expect(qualifying).toEqual([]);
    expect(disqualified[0]?.reason).toContain("committed roots hold: ambiguous");
  });

  it("DERIVED_FROM_CAPTURE qualifying evidence disqualifies, in either root", async () => {
    const { corpus, archive } = await committedTiers();
    const derivedArchive = archiveOutcome([
      corpus,
      { ...archive, corpus: withKind(archive.corpus, ARCHIVE_SEGMENT, "DERIVED_FROM_CAPTURE") },
    ]);
    expect(derivedArchive.qualifying).toEqual([]);
    expect(derivedArchive.disqualified[0]?.reason).toBe(
      `evidence set is not all SANITIZED_CAPTURE: ${ARCHIVE_SEGMENT}=DERIVED_FROM_CAPTURE`,
    );
    const derivedCorpusPart = archiveOutcome([
      {
        ...corpus,
        corpus: withKind(corpus.corpus, "wcl-brewmaster-monk-gtkb-opener", "DERIVED_FROM_CAPTURE"),
      },
      archive,
    ]);
    expect(derivedCorpusPart.qualifying).toEqual([]);
    expect(derivedCorpusPart.disqualified[0]?.reason).toBe(
      "evidence set is not all SANITIZED_CAPTURE: wcl-brewmaster-monk-gtkb-opener=DERIVED_FROM_CAPTURE",
    );
  });

  it("SYNTHETIC qualifying evidence disqualifies, in either root", async () => {
    const { corpus, archive } = await committedTiers();
    const synthetic = archiveOutcome([
      corpus,
      { ...archive, corpus: withKind(archive.corpus, ARCHIVE_SEGMENT, "SYNTHETIC") },
    ]);
    expect(synthetic.qualifying).toEqual([]);
    expect(synthetic.disqualified[0]?.reason).toBe(
      `evidence set is not all SANITIZED_CAPTURE: ${ARCHIVE_SEGMENT}=SYNTHETIC`,
    );
    const syntheticCorpusPart = archiveOutcome([
      {
        ...corpus,
        corpus: withKind(corpus.corpus, "wcl-brewmaster-monk-gtkb-rotational-165s.seg-20-165", "SYNTHETIC"),
      },
      archive,
    ]);
    expect(syntheticCorpusPart.qualifying).toEqual([]);
  });

  it("an archive whose artifact digest fails never reaches the reader: it does not load", async () => {
    const files = committedEvidenceArchiveFiles();
    const path = `artifacts/wcl-events/${ARCHIVE_SEGMENT}.json`;
    const tampered = { ...files, [path]: (files[path] ?? "").replace("2580080", "2580081") };
    const result = await validateEvidenceArchive(tampered, committedCorpusFiles());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.map((error) => error.code)).toContain("ARTIFACT_DIGEST_MISMATCH");
  });
});
