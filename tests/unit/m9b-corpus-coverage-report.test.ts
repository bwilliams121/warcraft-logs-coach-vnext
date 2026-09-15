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
      "wcl-assassination-kingsbane-cooldown",
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

  it("records the APPLICATION_SERVICE gap, the one layer with no corpus case", async () => {
    const report = corpusCoverageReport(await loadCorpusOrThrow(committedCorpusFiles()));
    const empty = report.byLayer.filter((layer) => layer.cases === 0).map((layer) => layer.owningLayer);

    expect(empty).toEqual(["APPLICATION_SERVICE"]);
    expect(report.gaps.some((gap) => gap.layers.includes("APPLICATION_SERVICE"))).toBe(true);
  });
});
