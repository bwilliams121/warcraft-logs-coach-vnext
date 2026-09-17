/**
 * M10-C5 Phase B2: composing several artifacts into ONE fight, and the proof
 * that the seven empty milliseconds between Phase A's slice and the first
 * steady-state segment are certified, not silently covered.
 *
 * Two layers are under test here:
 *
 *   - the loader's zero-event certificate validation — a `certifiedEmpty`
 *     record is checked against BOTH artifacts' terminal captures and
 *     retained events, and a grant that simply starts earlier than its
 *     source window is refused as before;
 *   - the bundle composer — grants join only where adjacent or bridged by a
 *     certificate, the holes must equal the declared holes exactly, and an
 *     overlap, a reversed segment, a boundary duplicate or a foreign part
 *     refuses the composition.
 *
 * Nothing here reads a timestamp to decide coverage: coverage comes from the
 * records, and the events are what the records vouch for.
 */

import { describe, expect, it } from "vitest";

import {
  BundleCompositionError,
  bundleOverEvidence,
  committedEvidence,
  corpusBundle,
  type ArtifactEvidence,
} from "../support/corpus/fight.js";
import { committedCorpusFiles, validateCorpus, type CorpusFileTable } from "../support/corpus/loader.js";

const PP45 = "wcl-protection-paladin-a7r6-rotational-45s";
const SEG = "wcl-protection-paladin-a7r6-rotational-165s";
const SEG_45_60 = `${SEG}.seg-45-60`;
const SEG_60_90 = `${SEG}.seg-60-90`;
const SEG_90_120 = `${SEG}.seg-90-120`;
const SEG_120_165 = `${SEG}.seg-120-165`;
const ALL = [PP45, SEG_45_60, SEG_60_90, SEG_90_120, SEG_120_165];
const HOLE = { fromReportTimeMs: 2064590, toReportTimeMs: 2124589 };

type Json = Record<string, unknown>;

/** The coverage state of one category on a composed fight, or null when the category is not observable. */
function coverageOf(
  composed: ReturnType<typeof corpusBundle>,
  category: "CASTS" | "AURAS" | "DAMAGE",
): string | null {
  const evidence = composed.fight.completeness.categories[category];
  return "coverage" in evidence ? evidence.coverage.state : null;
}

/** The committed file table with one artifact record rewritten in memory. */
function withArtifactRecord(artifactId: string, mutate: (record: Json) => void): CorpusFileTable {
  const files = { ...committedCorpusFiles() };
  const manifest = JSON.parse(files["manifest.json"] ?? "{}") as { artifacts: Json[] };
  const record = manifest.artifacts.find((entry) => entry["artifactId"] === artifactId);
  if (record === undefined) throw new Error(`no artifact ${artifactId}`);
  mutate(record);
  return { ...files, "manifest.json": JSON.stringify(manifest) };
}

async function codesOf(files: CorpusFileTable): Promise<string[]> {
  const result = await validateCorpus(files);
  return result.ok ? [] : result.errors.map((error) => `${error.code}: ${error.message}`);
}

function certificateOf(record: Json): Json {
  const provenance = record["provenance"] as Json;
  const coverage = provenance["retainedCoverage"] as Json;
  const certificates = coverage["certifiedEmpty"] as Json[];
  const [certificate] = certificates;
  if (certificate === undefined) throw new Error("no certificate");
  return certificate;
}

function grantOf(record: Json): Json {
  const provenance = record["provenance"] as Json;
  const coverage = provenance["retainedCoverage"] as Json;
  const grants = coverage["grants"] as Json[];
  const [grant] = grants;
  if (grant === undefined) throw new Error("no grant");
  return grant;
}

describe("the zero-event certificate between the Phase A slice and the first segment", () => {
  it("is exactly [2,049,582 .. 2,049,588], bridging the slice's grant end and the segment's grant start", () => {
    const slice = committedEvidence(PP45);
    const segment = committedEvidence(SEG_45_60);
    const sliceGrant = slice.record.provenance.retainedCoverage.grants[0];
    const segmentGrant = segment.record.provenance.retainedCoverage.grants[0];
    expect(sliceGrant?.ranges).toEqual([{ fromReportTimeMs: 2004589, toReportTimeMs: 2049581 }]);
    expect(segmentGrant?.ranges).toEqual([{ fromReportTimeMs: 2049589, toReportTimeMs: 2064589 }]);
    expect(segment.record.provenance.retainedCoverage.certifiedEmpty).toEqual([
      expect.objectContaining({
        fromReportTimeMs: 2049582,
        toReportTimeMs: 2049588,
        precedingArtifactId: PP45,
      }),
    ]);
    // Neither artifact retains an event inside the certified interval.
    const inside = (evidence: ArtifactEvidence) =>
      evidence.rawEvents.filter((event) => {
        const timestamp = event["timestamp"];
        return typeof timestamp === "number" && timestamp >= 2049582 && timestamp <= 2049588;
      });
    expect(inside(slice)).toEqual([]);
    expect(inside(segment)).toEqual([]);
  });

  it("validates in the committed corpus, and a grant that merely starts earlier is still refused", async () => {
    expect(await codesOf(committedCorpusFiles())).toEqual([]);
    // The rejected alternative: widen the segment's grant to 2,049,582 and
    // drop the certificate. The source window starts at 2,049,589, so the
    // loader refuses the grant as exceeding its source — the original rule,
    // which the certificate does not weaken.
    const widened = withArtifactRecord(SEG_45_60, (record) => {
      const provenance = record["provenance"] as Json;
      const coverage = provenance["retainedCoverage"] as Json;
      delete coverage["certifiedEmpty"];
      (grantOf(record)["ranges"] as Json[])[0] = { fromReportTimeMs: 2049582, toReportTimeMs: 2064589 };
    });
    const codes = await codesOf(widened);
    expect(codes.some((code) => code.startsWith("PROVENANCE_RETAINED_COVERAGE_EXCEEDS_SOURCE"))).toBe(true);
  });

  it.each([
    ["ends before it starts", (c: Json) => void (c["toReportTimeMs"] = 2049581)],
    [
      "names an unknown preceding artifact",
      (c: Json) => void (c["precedingArtifactId"] = "no.such.artifact"),
    ],
    ["does not start where the preceding grant ends", (c: Json) => void (c["fromReportTimeMs"] = 2049583)],
    ["does not end where this artifact's grant starts", (c: Json) => void (c["toReportTimeMs"] = 2049587)],
    [
      "reaches into the preceding capture's own query window",
      (c: Json) => void (c["fromReportTimeMs"] = 2049580),
    ],
  ])("refuses a certificate that %s", async (_label, mutate) => {
    const files = withArtifactRecord(SEG_45_60, (record) => mutate(certificateOf(record)));
    const codes = await codesOf(files);
    expect(codes.some((code) => code.startsWith("PROVENANCE_EMPTY_CERTIFICATE_INVALID"))).toBe(true);
  });

  it("refuses a certificate whose preceding capture is not terminal", async () => {
    const files = withArtifactRecord(PP45, (record) => {
      const provenance = record["provenance"] as Json;
      const source = provenance["source"] as Json;
      const completeness = source["completeness"] as Json;
      completeness["nextPageTimestamp"] = 2049590;
    });
    const codes = await codesOf(files);
    expect(codes.some((code) => code.startsWith("PROVENANCE_EMPTY_CERTIFICATE_INVALID"))).toBe(true);
  });

  it("refuses a certificate over an interval that holds a retained event", async () => {
    // Move the segment's first event (2,049,618) into the certified interval.
    // The bytes then no longer match the record's digest either; both errors
    // are named, and the certificate's is among them.
    const files = { ...committedCorpusFiles() };
    const path = `artifacts/wcl-events/${SEG_45_60}.json`;
    const text = files[path];
    if (text === undefined) throw new Error("no segment file");
    const events = JSON.parse(text) as Json[];
    const first = events[0];
    if (first === undefined) throw new Error("no events");
    first["timestamp"] = 2049585;
    const codes = await codesOf({ ...files, [path]: JSON.stringify(events) });
    expect(codes.some((code) => code.startsWith("PROVENANCE_EMPTY_CERTIFICATE_INVALID"))).toBe(true);
    expect(codes.some((code) => code.includes("SHA256") || code.includes("DIGEST"))).toBe(true);
  });
});

describe("composing the steady-state bundle", () => {
  it("joins the five parts into one COMPLETE fight over one covered range, through the certificate", () => {
    const composed = corpusBundle(ALL, []);
    expect(composed.events).toBe(3720);
    expect(composed.holes).toEqual([]);
    expect(composed.coveredRanges.CASTS).toEqual([
      { fromReportTimeMs: 2004589, toReportTimeMs: 2169589, upperBound: "INCLUSIVE" },
    ]);
    expect(coverageOf(composed, "CASTS")).toBe("COMPLETE");
    expect(coverageOf(composed, "AURAS")).toBe("COMPLETE");
    expect(coverageOf(composed, "DAMAGE")).toBe("ABSENT");
    expect(composed.fight.fight.startTimeMs).toBe(2004589);
    expect(composed.fight.fight.endTimeMs).toBe(2169554);
  });

  it("keeps exactly the declared hole when the two middle segments are omitted", () => {
    const composed = corpusBundle([PP45, SEG_45_60, SEG_120_165], [HOLE]);
    expect(composed.events).toBe(2170);
    expect(composed.holes).toEqual([HOLE]);
    expect(composed.coveredRanges.CASTS).toEqual([
      { fromReportTimeMs: 2004589, toReportTimeMs: 2064589, upperBound: "INCLUSIVE" },
      { fromReportTimeMs: 2124590, toReportTimeMs: 2169589, upperBound: "INCLUSIVE" },
    ]);
    expect(coverageOf(composed, "CASTS")).toBe("PARTIAL");
    expect(coverageOf(composed, "AURAS")).toBe("PARTIAL");
  });

  it("refuses an undeclared hole, a declared hole that is not there, and a hole declared inexactly", () => {
    expect(() => corpusBundle([PP45, SEG_45_60, SEG_120_165], [])).toThrow(BundleCompositionError);
    expect(() => corpusBundle([PP45, SEG_45_60, SEG_120_165], [])).toThrow(/undeclared coverage hole/);
    expect(() => corpusBundle(ALL, [HOLE])).toThrow(/declared hole\(s\) not present/);
    expect(() =>
      corpusBundle([PP45, SEG_45_60, SEG_120_165], [{ fromReportTimeMs: 2064590, toReportTimeMs: 2124588 }]),
    ).toThrow(BundleCompositionError);
    // Omitting only one middle segment is a different hole, and must be declared as that hole.
    expect(() => corpusBundle([PP45, SEG_45_60, SEG_60_90, SEG_120_165], [HOLE])).toThrow(
      BundleCompositionError,
    );
    expect(
      () =>
        corpusBundle(
          [PP45, SEG_45_60, SEG_60_90, SEG_120_165],
          [{ fromReportTimeMs: 2094590, toReportTimeMs: 2124589 }],
        ).events,
    ).not.toThrow();
  });

  it("refuses a reversed order, an overlapping part, and a duplicated boundary row", () => {
    expect(() => corpusBundle([PP45, SEG_60_90, SEG_45_60, SEG_90_120, SEG_120_165], [])).toThrow(
      BundleCompositionError,
    );
    // The same segment twice: its grant overlaps itself, and every row repeats.
    expect(() => corpusBundle([PP45, SEG_45_60, SEG_45_60], [])).toThrow(BundleCompositionError);
    // A duplicated boundary row: copy the last event of one part onto the
    // front of the next. The bytes are unvalidated here on purpose — the
    // composer's own duplicate check must catch it before any digest does.
    const parts = ALL.map(committedEvidence);
    const [slice, segment] = parts;
    if (slice === undefined || segment === undefined) throw new Error("no parts");
    const lastRow = slice.rawEvents[slice.rawEvents.length - 1];
    if (lastRow === undefined) throw new Error("no rows");
    const duplicated: ArtifactEvidence = { ...segment, rawEvents: [lastRow, ...segment.rawEvents] };
    expect(() => bundleOverEvidence([slice, duplicated, ...parts.slice(2)], [])).toThrow(/appear in both/);
  });

  it("refuses a part from another capture, and a bundle of fewer than two parts", () => {
    expect(() => corpusBundle([PP45, "wcl-protection-paladin-a7r6-opener"], [])).toThrow(
      BundleCompositionError,
    );
    expect(() => corpusBundle(["wcl-assassination-high-parse-opener", SEG_45_60], [])).toThrow(
      /different captures/,
    );
    expect(() => corpusBundle([PP45], [])).toThrow(/at least two parts/);
  });

  it("does not join across the certificate when the certified predecessor is not in the bundle", () => {
    // seg-45-60's certificate names the 45 s slice by id. Present the same
    // bytes under another id and the certificate does not apply: the seven
    // milliseconds [2,049,582 .. 2,049,588] are a real hole, and undeclared.
    const slice = committedEvidence(PP45);
    const renamed: ArtifactEvidence = {
      ...slice,
      record: { ...slice.record, artifactId: "wcl-protection-paladin-a7r6-rotational-45s.renamed" },
    };
    const rest = [SEG_45_60, SEG_60_90, SEG_90_120, SEG_120_165].map(committedEvidence);
    expect(() => bundleOverEvidence([renamed, ...rest], [])).toThrow(/undeclared coverage hole/);
    const composed = bundleOverEvidence(
      [renamed, ...rest],
      [{ fromReportTimeMs: 2049582, toReportTimeMs: 2049588 }],
    );
    expect(composed.holes).toEqual([{ fromReportTimeMs: 2049582, toReportTimeMs: 2049588 }]);
    expect(coverageOf(composed, "CASTS")).toBe("PARTIAL");
  });

  it("refuses parts whose category grants disagree on where the holes are", () => {
    // The opener grants DAMAGE, HEALING, ABSORBS and SUMMONS; the segments do
    // not. Joined, CASTS would have a hole where DAMAGE has none — a
    // composition whose coverage cannot be stated per category, so refused.
    expect(() => corpusBundle(["wcl-protection-paladin-a7r6-opener", SEG_45_60], [])).toThrow(
      /categories disagree on the holes/,
    );
  });
});
