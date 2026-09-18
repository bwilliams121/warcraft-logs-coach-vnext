import { describe, expect, it } from "vitest";

import { ASSERTION_KINDS, OWNING_LAYER_IDS } from "../support/corpus/contract.js";
import { committedCorpusFiles, loadCorpusOrThrow } from "../support/corpus/loader.js";
import { corpusCoverageReport, KNOWN_EVIDENCE_GAPS, renderCoverageReport } from "../support/corpus/report.js";

/**
 * The coverage report is a measurement of the corpus and an honest list of
 * what the corpus lacks. Both halves are checked: the numbers against the
 * loaded corpus, and the gap list against the rules that make a gap useful.
 */

describe("coverage is measured from the corpus", () => {
  it("counts artifacts by lineage, cases, assertions and pinned authorities", async () => {
    const corpus = await loadCorpusOrThrow(committedCorpusFiles());
    const report = corpusCoverageReport(corpus);

    expect(report.artifacts.total).toBe(corpus.artifacts.length);
    expect(Object.values(report.artifacts.byKind).reduce((sum, n) => sum + n, 0)).toBe(
      corpus.artifacts.length,
    );
    expect(report.artifacts.byKind.REAL_CAPTURE).toBe(0);
    expect(report.cases.total).toBe(corpus.cases.length);
    expect(report.cases.assertions).toBe(report.cases.executable + report.cases.declared);
    expect(report.cases.declared).toBe(0);
    expect(report.artifacts.sourceCaptures.map((s) => `${s.reportCode}/${String(s.fightId)}`)).toEqual([
      "A7R6kxPJ1hC8YQ4w/7",
      "encounter 3420/difficulty 4",
      "gtKb2xHn87pNcFfW/22",
      "qJ1pgB49ZrRNVmCd/6",
    ]);
  });

  it("reports every layer, and which registered kinds a layer has not yet exercised", async () => {
    const report = corpusCoverageReport(await loadCorpusOrThrow(committedCorpusFiles()));

    expect(report.byLayer.map((layer) => layer.owningLayer)).toEqual([...OWNING_LAYER_IDS]);
    for (const layer of report.byLayer) {
      const registered = Object.entries(ASSERTION_KINDS).filter(
        ([, def]) => def.owningLayer === layer.owningLayer,
      ).length;
      expect(layer.kindsExercised.length + layer.kindsRegisteredButUnused.length, layer.owningLayer).toBe(
        registered,
      );
    }
    // Every registered kind is exercised by at least one committed case.
    expect(report.byLayer.flatMap((layer) => layer.kindsRegisteredButUnused)).toEqual([]);
  });

  it("names the artifacts that retain coverage, and only those", async () => {
    const report = corpusCoverageReport(await loadCorpusOrThrow(committedCorpusFiles()));

    expect(report.artifacts.withRetainedCoverage).toEqual([
      "wcl-assassination-d2-decision-corpus",
      "wcl-assassination-garrote-dot-remains",
      "wcl-assassination-high-parse-opener",
      "wcl-assassination-kingsbane-cooldown",
      "wcl-protection-paladin-a7r6-opener",
      "wcl-protection-paladin-a7r6-opener.gap-before-2010000",
      "wcl-protection-paladin-a7r6-rotational-165s.seg-120-165",
      "wcl-protection-paladin-a7r6-rotational-165s.seg-45-60",
      "wcl-protection-paladin-a7r6-rotational-165s.seg-60-90",
      "wcl-protection-paladin-a7r6-rotational-165s.seg-90-120",
      "wcl-protection-paladin-a7r6-rotational-45s",
      "wcl-protection-paladin-a7r6-rotational-45s.gap-before-2026589",
      "wcl-retribution-paladin-a7r6-rotational-165s.seg-105-165",
      "wcl-retribution-paladin-a7r6-rotational-165s.seg-45-105",
      "wcl-retribution-paladin-a7r6-rotational-45s",
      "wcl-retribution-paladin-gtkb-opener",
    ]);
  });

  it("renders deterministically with no clock", async () => {
    const corpus = await loadCorpusOrThrow(committedCorpusFiles());
    const first = renderCoverageReport(corpusCoverageReport(corpus));
    const second = renderCoverageReport(corpusCoverageReport(corpus));

    expect(second).toBe(first);
    expect(first).not.toMatch(/\d{4}-\d{2}-\d{2}T/);
  });
});

describe("every declared gap is actionable", () => {
  it.each(KNOWN_EVIDENCE_GAPS.map((gap) => [gap.id, gap] as const))(
    "%s names its layers and what would close it",
    (_id, gap) => {
      expect(gap.layers.length).toBeGreaterThan(0);
      for (const layer of gap.layers) expect(OWNING_LAYER_IDS).toContain(layer);
      expect(gap.gap.length).toBeGreaterThan(40);
      expect(gap.whatWouldClose.length).toBeGreaterThan(20);
      // A remedy is a capture, a fixture or an assertion kind — never an assumption.
      expect(gap.whatWouldClose.toLowerCase()).not.toContain("assume");
    },
  );

  it("has unique ids", () => {
    const ids = KNOWN_EVIDENCE_GAPS.map((gap) => gap.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("leaves no layer without a corpus case since M9-C", async () => {
    const report = corpusCoverageReport(await loadCorpusOrThrow(committedCorpusFiles()));
    const empty = report.byLayer.filter((layer) => layer.cases === 0).map((layer) => layer.owningLayer);

    expect(empty).toEqual([]);
  });

  it("carries M9-C's disposition of every M9-B gap, and a closed gap names cases that exist", async () => {
    const corpus = await loadCorpusOrThrow(committedCorpusFiles());
    const caseIds = new Set(corpus.cases.map((entry) => entry.record.caseId));
    const byDisposition = new Map<string, string[]>();
    for (const gap of KNOWN_EVIDENCE_GAPS) {
      byDisposition.set(gap.disposition, [...(byDisposition.get(gap.disposition) ?? []), gap.id]);
      expect(gap.whyItMatters.length, gap.id).toBeGreaterThan(40);
      expect(gap.currentSupport.length, gap.id).toBeGreaterThan(40);
      expect(gap.existingEvidence.length, gap.id).toBeGreaterThan(20);
      expect(gap.owner.length, gap.id).toBeGreaterThan(1);
      const closed = gap.disposition === "CLOSE_IN_M9" || gap.disposition === "CLOSE_IN_M10";
      expect(gap.closedBy.length > 0, gap.id).toBe(closed);
      for (const caseId of gap.closedBy) expect(caseIds.has(caseId), `${gap.id} -> ${caseId}`).toBe(true);
      if (gap.disposition === "CLOSE_IN_M9") expect(gap.owner).toBe("M9");
      if (gap.disposition === "CLOSE_IN_M10") expect(gap.owner).toBe("M10");
    }
    expect(byDisposition.get("BLOCKS_M9_CLOSEOUT")).toBeUndefined();
    expect(byDisposition.get("PROVEN_BY_SYNTHETIC_CONTRACT")).toBeUndefined();
    expect(byDisposition.get("CLOSE_IN_M9")).toEqual([
      "no-pet-or-guardian-actor",
      "no-real-page-boundary",
      "no-real-partial-retrieval",
      "no-application-service-cases",
      "no-external-reference-fixture",
      "single-report-assassination-corpus",
    ]);
    expect(byDisposition.get("CLOSE_IN_M10")).toEqual(["no-protection-paladin-evidence"]);
    expect(byDisposition.get("DEFER_TO_MILESTONE")).toEqual([
      "no-interrupt-events",
      "no-death-or-dispel-events",
      "no-targetability-or-intermission",
      "assassination-corpus-breadth",
    ]);
    expect(byDisposition.get("OUTSIDE_CURRENT_CAPABILITY")).toEqual(["no-identity-conflict-capture"]);
    // Every deferred or out-of-capability gap names a canonical milestone owner.
    for (const gap of KNOWN_EVIDENCE_GAPS) {
      if (gap.disposition === "CLOSE_IN_M9" || gap.disposition === "CLOSE_IN_M10") continue;
      expect(gap.owner, gap.id).toMatch(/^M1[0-5] \(/);
    }
  });

  it("closes a gap only by cases that actually pin the closing behaviour", async () => {
    // The closing case must read the artifact the gap's evidence lives in.
    const corpus = await loadCorpusOrThrow(committedCorpusFiles());
    const artifactsOf = (caseId: string) =>
      corpus.cases.find((entry) => entry.record.caseId === caseId)?.referencedArtifactIds ?? [];
    expect(artifactsOf("normalization.pet-sourced-events-keep-the-pet-as-source")).toEqual([
      "wcl-pet-sourced-events-hunter-pet-29",
    ]);
    expect(
      artifactsOf(
        "public-contract.encounter-context-parity-with-external-references-over-a-real-ranking-page",
      ),
    ).toEqual(["wcl-assassination-d2-decision-corpus", "wcl-encounter-rankings-sszorak-page-1"]);
    expect(artifactsOf("wcl-transport.missing-later-page-keeps-four-real-pages-and-stays-partial")).toEqual([
      "wcl-page-sequence-limit-40.page-5-removed",
    ]);
  });

  it("closes the single-report gap only with cases over ONE coherent report, fight and source", async () => {
    const corpus = await loadCorpusOrThrow(committedCorpusFiles());
    const gap = KNOWN_EVIDENCE_GAPS.find((entry) => entry.id === "single-report-assassination-corpus");
    if (gap === undefined) throw new Error("gap missing");
    const coordinates = new Set<string>();
    for (const caseId of gap.closedBy) {
      const kase = corpus.cases.find((entry) => entry.record.caseId === caseId);
      if (kase === undefined) throw new Error(caseId);
      const source = kase.artifact.record.provenance.source;
      if (source === null) throw new Error(`${caseId} reads an artifact with no capture source`);
      coordinates.add(
        `${String(source.reportCode)}/${String(source.fightId)}/${String(source.sourceActorId)}`,
      );
    }
    expect([...coordinates]).toEqual(["gtKb2xHn87pNcFfW/22/25"]);
    // And that report is not the D2 report: the gap is about a SECOND subject.
    expect(coordinates.has("A7R6kxPJ1hC8YQ4w/7/19")).toBe(false);
  });
});
