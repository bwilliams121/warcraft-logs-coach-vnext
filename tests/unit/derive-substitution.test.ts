import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  ARTIFACT_ROOT,
  DERIVE_SUBSTITUTION_REVISION,
  serializeArtifact,
  substituteCastAbility,
} from "../../scripts/corpus/derive-substitution.mjs";
import { committedManifest } from "../support/corpus/artifacts.js";

/**
 * The negative-control derivation tool (M11-C4h). A control is only worth
 * what the loader and the gate can prove about it, so the committed control is
 * reproduced here from its committed parent, byte for byte, by the invocation
 * the manifest records — and the tool refuses anything but one cast's ability.
 */

const PARENT = "wcl-protection-paladin-a7r6-rotational-165s.seg-60-90";
const CONTROL = "wcl-protection-paladin-a7r6-rotational-165s.seg-60-90.control-2074381-divine-toll";
const read = (file: string) => readFileSync(`${ARTIFACT_ROOT}/${file}`, "utf8").replaceAll("\r\n", "\n");

describe("the substitution rule", () => {
  const events = [
    { timestamp: 1, type: "cast", sourceID: 7, abilityGameID: 10, extra: "x" },
    { timestamp: 2, type: "applybuff", sourceID: 7, abilityGameID: 10 },
  ];

  it("changes exactly abilityGameID of exactly the named cast, keeping key order and every other event", () => {
    const derived = substituteCastAbility(events, 0, 10, 20);
    expect(derived).toEqual([{ ...events[0], abilityGameID: 20 }, events[1]]);
    expect(Object.keys(derived[0] ?? {})).toEqual(Object.keys(events[0] ?? {}));
    expect(derived[1]).toBe(events[1]);
    // The input is untouched.
    expect(events[0]?.abilityGameID).toBe(10);
  });

  it("refuses a non-cast, a mismatched original ability, an out-of-range index and a no-op", () => {
    expect(() => substituteCastAbility(events, 1, 10, 20)).toThrow("is not a cast");
    expect(() => substituteCastAbility(events, 0, 11, 20)).toThrow("carries abilityGameID 10, not 11");
    expect(() => substituteCastAbility(events, 2, 10, 20)).toThrow("outside the parent's 2 events");
    expect(() => substituteCastAbility(events, 0, 10, 10)).toThrow("must change the ability id");
  });

  it("serializes exactly as the slicer does", () => {
    expect(serializeArtifact([{ a: 1 }])).toBe(`${JSON.stringify([{ a: 1 }], null, 2)}\n`);
    expect(DERIVE_SUBSTITUTION_REVISION).toBe("derive-substitution-1");
  });
});

describe("the committed Protection control is what the tool produces from its parent", () => {
  it("reproduces the control byte for byte, one line away from the parent, and the manifest records that invocation", () => {
    const parent = JSON.parse(read(`${PARENT}.json`)) as Record<string, unknown>[];
    const derived = serializeArtifact(substituteCastAbility(parent, 241, 31935, 375576));
    expect(derived).toBe(read(`${CONTROL}.json`));
    const parentLines = read(`${PARENT}.json`).split("\n");
    const controlLines = read(`${CONTROL}.json`).split("\n");
    const differing = parentLines.flatMap((line, index) => (line === controlLines[index] ? [] : [index]));
    expect(differing.map((index) => [parentLines[index], controlLines[index]])).toEqual([
      ['    "abilityGameID": 31935,', '    "abilityGameID": 375576,'],
    ]);

    const record = committedManifest().artifacts.find((artifact) => artifact.artifactId === CONTROL);
    expect(record?.provenance.kind).toBe("DERIVED_FROM_CAPTURE");
    expect(record?.provenance.parentArtifactId).toBe(PARENT);
    expect(record?.provenance.transformations.map((t) => t.kind)).toEqual(["VALUE_MUTATION"]);
    expect(record?.provenance.transformations[0]?.tooling).toEqual({
      name: "scripts/corpus/derive-substitution.mjs",
      revision: DERIVE_SUBSTITUTION_REVISION,
      invocation: `node scripts/corpus/derive-substitution.mjs ${PARENT}.json ${CONTROL}.json --substitute 241 31935 375576`,
    });
    expect(record?.provenance.substitution).toMatchObject({
      kind: "SINGLE_CAST_ABILITY_SUBSTITUTION",
      eventIndex: 241,
      reportTimeMs: 2074381,
      sourceActorId: 7,
      fromAbilityGameId: 31935,
      toAbilityGameId: 375576,
    });
  });
});
