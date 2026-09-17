import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ARTIFACT_ROOT,
  DERIVE_GAP_REVISION,
  removeBetween,
  serializeArtifact,
} from "../../scripts/corpus/derive-gap.mjs";
import { committedManifest } from "../support/corpus/artifacts.js";

/**
 * The gap-derivation tool (M10-C5): the M10-B hand derivation made a
 * committed, re-runnable step. Its whole value is that a derivative is what
 * the recorded invocation produces from the committed parent — so both
 * committed derivatives are reproduced here from their parents, byte for byte.
 */

const read = (file: string) => readFileSync(`${ARTIFACT_ROOT}/${file}`, "utf8");

describe("the removal rule", () => {
  it("drops events strictly inside the open interval and keeps everything else in order, untyped rows included", () => {
    const events = [
      { timestamp: 10, type: "combatantinfo" },
      { timestamp: 11 },
      { timestamp: 15 },
      { timestamp: 20 },
      { note: "no timestamp" },
      { timestamp: 21 },
    ];
    expect(removeBetween(events, 10, 20)).toEqual([
      { timestamp: 10, type: "combatantinfo" },
      { timestamp: 20 },
      { note: "no timestamp" },
      { timestamp: 21 },
    ]);
    // The boundaries themselves survive: the interval is open at both ends.
    expect(removeBetween([{ timestamp: 5 }, { timestamp: 6 }], 5, 6)).toHaveLength(2);
  });

  it("serializes exactly as the slicer does, so a derivative's bytes are the parent's bytes minus rows", () => {
    expect(serializeArtifact([{ a: 1 }])).toBe(`${JSON.stringify([{ a: 1 }], null, 2)}\n`);
    expect(DERIVE_GAP_REVISION).toBe("derive-gap-1");
  });
});

describe("the committed derivatives are what the tool produces from their parents", () => {
  it("reproduces the M10-B opener gap (removed 2,004,589 < t < 2,010,000) byte for byte", () => {
    const parent = JSON.parse(read("wcl-protection-paladin-a7r6-opener.json")) as { timestamp: number }[];
    const derived = serializeArtifact(removeBetween(parent, 2004589, 2010000));
    expect(derived).toBe(read("wcl-protection-paladin-a7r6-opener.gap-before-2010000.json"));
    expect(removeBetween(parent, 2004589, 2010000)).toHaveLength(824);
  });

  it("reproduces the M10-C5 rotational gap (removed 2,004,589 < t < 2,026,589) byte for byte, and the manifest records that invocation", () => {
    const parent = JSON.parse(read("wcl-protection-paladin-a7r6-rotational-45s.json")) as {
      timestamp: number;
    }[];
    const kept = removeBetween(parent, 2004589, 2026589);
    expect(kept).toHaveLength(681);
    expect(serializeArtifact(kept)).toBe(
      read("wcl-protection-paladin-a7r6-rotational-45s.gap-before-2026589.json"),
    );

    const record = committedManifest().artifacts.find(
      (artifact) => artifact.artifactId === "wcl-protection-paladin-a7r6-rotational-45s.gap-before-2026589",
    );
    const removal = record?.provenance.transformations.find((t) => t.kind === "EVENT_REMOVAL");
    expect(removal?.tooling).toEqual({
      name: "scripts/corpus/derive-gap.mjs",
      revision: DERIVE_GAP_REVISION,
      invocation:
        "node scripts/corpus/derive-gap.mjs wcl-protection-paladin-a7r6-rotational-45s.json wcl-protection-paladin-a7r6-rotational-45s.gap-before-2026589.json --remove-between 2004589 2026589",
    });
    // The predeclared boundary is the M10-B opener's bound, and the grant begins there.
    expect(record?.provenance.retainedCoverage.grants[0]?.ranges).toEqual([
      { fromReportTimeMs: 2026589, toReportTimeMs: 2049581 },
    ]);
    expect(removal?.detail).toContain("PREDECLARED");
  });
});
