/**
 * ONB-C1: an APL held in its own file, `#include`d as a function's sole body, and a PTR list in another.
 *
 * Feral's list is `apl/druid/feral_apl.inc`: no markers and no function header, because the function is in
 * `apl/druid/druid.cpp`. Its dispatch is one ternary on `is_ptr()`. Everything here is accepted by exact
 * text and refused otherwise. An extractor that read a stray `.inc` as a list, or let the PTR branch stand
 * in for the live one, would emit an artifact that looks complete and is not.
 *
 * Synthetic source, because CI has no pinned checkout. The real preflight's report is in
 * scripts/authority/README.md "ONB-C1".
 */

import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  LIVE_PTR_POLICIES,
  PINNED_SIMC_COMMIT,
  TARGETS,
  extract,
  preflightBatch,
  validatePinnedRecord,
  type PinnedExtractionTarget,
} from "../../scripts/authority/extract-simc-apl.mjs";
import {
  AUTHORITY_LIVE_PTR_POLICIES,
  AUTHORITY_REGION_SELECTOR_KINDS,
  validateAuthorityArtifact,
} from "../../src/simc/authority-artifact.js";
import feralArtifact from "../../src/simc/data/druid-feral.apl.json";

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

const LIST = [
  'action_priority_list_t* precombat = p->get_action_priority_list( "precombat" );',
  'action_priority_list_t* def = p->get_action_priority_list( "default" );',
  "",
  'precombat->add_action( "cat_form" );',
  'def->add_action( "shred" );',
  "",
].join("\n");

const INCLUDE_LINE = '#include "class_modules/apl/synth/gamma_apl.inc"';
const PTR_INCLUDE_LINE = '#include "class_modules/apl/synth/gamma_apl_ptr.inc"';
const INCLUDER = [
  '#include "class_modules/apl/synth/synth.hpp"',
  "namespace synth_apl",
  "{",
  "void apl_gamma( player_t* p )",
  "{",
  INCLUDE_LINE,
  "}",
  "",
  "void apl_gamma_ptr( player_t* p )",
  "{",
  PTR_INCLUDE_LINE,
  "}",
  "}",
  "",
].join("\n");
const CASE_LINE =
  "case SYNTH_GAMMA:       is_ptr() ? synth_apl::apl_gamma_ptr( this ) : synth_apl::apl_gamma( this );             break;";
const MODULE = [
  "void synth_t::init_action_list()",
  "{",
  "  switch ( specialization() )",
  "  {",
  `    ${CASE_LINE}`,
  "    default:                break;",
  "  }",
  "}",
  "",
].join("\n");

const LIST_PATH = "engine/class_modules/apl/synth/gamma_apl.inc";
const INCLUDER_PATH = "engine/class_modules/apl/synth/synth.cpp";
const MODULE_PATH = "engine/class_modules/sc_synth.cpp";

type Files = Record<string, string>;
const CLEAN: Files = { [LIST_PATH]: LIST, [INCLUDER_PATH]: INCLUDER, [MODULE_PATH]: MODULE };

function pinnedFile(path: string, files: Files = CLEAN) {
  const text = files[path] ?? "";
  return { sourcePath: path, sha256: sha256(text), byteLength: Buffer.byteLength(text) };
}

function target(
  overrides: Partial<PinnedExtractionTarget> = {},
  files: Files = CLEAN,
): PinnedExtractionTarget {
  return {
    sourcePath: LIST_PATH,
    includedBy: { ...pinnedFile(INCLUDER_PATH, files), includeLine: INCLUDE_LINE },
    functionHeader: "void apl_gamma( player_t* p )",
    regionName: "apl_gamma",
    authorityId: "SIMC_APL_SYNTH_GAMMA",
    spec: { className: "synth", specName: "gamma" },
    defaultOut: "src/simc/data/synth-gamma.apl.json",
    pinnedSource: {
      ...pinnedFile(LIST_PATH, files),
      commitSha: PINNED_SIMC_COMMIT,
      regionSha256: sha256(files[LIST_PATH] ?? ""),
    },
    livePtrPolicy: {
      kind: "PTR_SEPARATE_INCLUDE",
      ptrFunctionHeader: "void apl_gamma_ptr( player_t* p )",
      ptrIncludeLine: PTR_INCLUDE_LINE,
    },
    dispatch: {
      ...pinnedFile(MODULE_PATH, files),
      functionHeader: "void synth_t::init_action_list()",
      sequence: [CASE_LINE],
    },
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: ["precombat", "default"],
      listSizes: { precombat: 1, default: 1 },
      edges: [],
      forbiddenTokens: ["swap_action_list"],
    },
    ...overrides,
  } as PinnedExtractionTarget;
}

function preflight(files: Files, overrides: Partial<PinnedExtractionTarget> = {}) {
  return preflightBatch({
    targetNames: ["synth-gamma"],
    targets: { "synth-gamma": target(overrides, files) },
    read: (path: string) => (files[path] === undefined ? null : new TextEncoder().encode(files[path])),
    sha: PINNED_SIMC_COMMIT,
    extractedOn: "CHECK",
    commitDate: "UNKNOWN",
    branch: "midnight",
  });
}

const problemsOf = (result: ReturnType<typeof preflight>): readonly string[] => [
  ...result.problems,
  ...result.results.flatMap((entry) => entry.problems),
];

describe("an included-file target", () => {
  it("reads the whole file as the function's body, with source lines the file's own", () => {
    const extracted = extract(LIST, target());
    expect(extracted.lists.map((list) => list.listName)).toEqual(["precombat", "default"]);
    expect(extracted.lists[1]?.actions[0]).toMatchObject({ actionStringVerbatim: "shred", sourceLine: 5 });
    expect(extracted.regionSha256).toBe(sha256(LIST));
    expect(extracted.regionProvenance).toEqual({
      regionSelector: {
        kind: "INCLUDED_FILE",
        includingSourcePath: INCLUDER_PATH,
        includingSourceSha256: sha256(INCLUDER),
        includeLine: INCLUDE_LINE,
        functionHeader: "void apl_gamma( player_t* p )",
      },
    });
  });

  it("passes the pinned preflight, and the artifact it builds validates", () => {
    const result = preflight(CLEAN);
    expect(problemsOf(result)).toEqual([]);
    const artifact = result.results[0]?.artifact;
    expect(validateAuthorityArtifact(artifact).ok).toBe(true);
  });

  it("is well formed on the real record", () => {
    const real = TARGETS["druid-feral"] as PinnedExtractionTarget;
    expect(validatePinnedRecord("druid-feral", real)).toEqual([]);
    expect(real.includedBy?.includeLine).toBe('#include "class_modules/apl/druid/feral_apl.inc"');
    expect(real.livePtrPolicy.kind).toBe("PTR_SEPARATE_INCLUDE");
  });

  it("the policy and the selector are accepted on both sides of the artifact boundary", () => {
    expect(LIVE_PTR_POLICIES).toContain("PTR_SEPARATE_INCLUDE");
    expect(AUTHORITY_LIVE_PTR_POLICIES).toContain("PTR_SEPARATE_INCLUDE");
    expect(AUTHORITY_REGION_SELECTOR_KINDS).toContain("INCLUDED_FILE");
  });
});

describe("every way an included-file target refuses", () => {
  const withFile = (path: string, text: string): Files => ({ ...CLEAN, [path]: text });

  it("a list naming its own function is not a body", () => {
    const list = `void apl_gamma( player_t* p )\n${LIST}`;
    expect(() => extract(list, target())).toThrow(/not the body alone/);
  });

  it("a stray construct inside the file refuses, as in any other region", () => {
    expect(() => extract(`${LIST}if ( x )\n`, target())).toThrow(/unsupported construct/);
  });

  it("an unbalanced brace refuses", () => {
    expect(() => extract(`{\n${LIST}`, target())).toThrow(/unbalanced braces/);
  });

  it("an include sitting beside another statement is not the sole body", () => {
    const files = withFile(INCLUDER_PATH, INCLUDER.replace(INCLUDE_LINE, `${INCLUDE_LINE}\n  p->other();`));
    expect(problemsOf(preflight(files)).join("\n")).toContain("INCLUSION_UNVERIFIED");
  });

  it("an include of another file refuses", () => {
    const files = withFile(INCLUDER_PATH, INCLUDER.replace(INCLUDE_LINE, '#include "other.inc"'));
    expect(problemsOf(preflight(files)).join("\n")).toContain("INCLUSION_UNVERIFIED");
  });

  it("an includer whose bytes are not pinned refuses before anything is decided", () => {
    const tampered = withFile(INCLUDER_PATH, `${INCLUDER}// edited\n`);
    const result = preflightBatch({
      targetNames: ["synth-gamma"],
      targets: { "synth-gamma": target() },
      read: (path: string) =>
        tampered[path] === undefined ? null : new TextEncoder().encode(tampered[path]),
      sha: PINNED_SIMC_COMMIT,
      extractedOn: "CHECK",
      commitDate: "UNKNOWN",
      branch: "midnight",
    });
    expect(problemsOf(result).join("\n")).toContain("SOURCE_SHA256_MISMATCH");
  });

  it("a list whose bytes are not the pinned region refuses", () => {
    const edited = withFile(LIST_PATH, LIST.replace("shred", "rake"));
    const result = preflightBatch({
      targetNames: ["synth-gamma"],
      targets: { "synth-gamma": target() },
      read: (path: string) => (edited[path] === undefined ? null : new TextEncoder().encode(edited[path])),
      sha: PINNED_SIMC_COMMIT,
      extractedOn: "CHECK",
      commitDate: "UNKNOWN",
      branch: "midnight",
    });
    expect(problemsOf(result).join("\n")).toContain("SOURCE_SHA256_MISMATCH");
  });

  it("a dispatch that no longer chooses by is_ptr refuses", () => {
    const flat = "case SYNTH_GAMMA:       synth_apl::apl_gamma( this );             break;";
    const files = withFile(MODULE_PATH, MODULE.replace(CASE_LINE, flat));
    const problems = problemsOf(
      preflight(files, {
        dispatch: {
          ...pinnedFile(MODULE_PATH, files),
          functionHeader: "void synth_t::init_action_list()",
          sequence: [flat],
        },
      }),
    ).join("\n");
    expect(problems).toContain("POLICY_VIOLATED");
  });

  it("a PTR function that includes the live list refuses the policy's reason for existing", () => {
    expect(
      validatePinnedRecord(
        "synth-gamma",
        target({
          livePtrPolicy: {
            kind: "PTR_SEPARATE_INCLUDE",
            ptrFunctionHeader: "void apl_gamma_ptr( player_t* p )",
            ptrIncludeLine: INCLUDE_LINE,
          },
        }),
      ).join("\n"),
    ).toContain("names no separate PTR include");
  });

  it("the policy without an included file, and an included file without the policy, each refuse", () => {
    expect(
      validatePinnedRecord(
        "synth-gamma",
        target({
          livePtrPolicy: {
            kind: "NO_PTR_REGION",
            ptrRegionStart: "//apl_gamma_ptr_apl_start",
            ptrRegionEnd: "//apl_gamma_ptr_apl_end",
            ptrFunctionHeader: "void apl_gamma_ptr( player_t* p )",
          },
        }),
      ).join("\n"),
    ).toContain("go together");
  });

  it("a target naming a marker and an included file is refused, because it has one selector", () => {
    expect(() =>
      extract(LIST, target({ regionStart: "//gamma_apl_start", regionEnd: "//gamma_apl_end" })),
    ).toThrow(/exactly one region selector/);
  });
});

describe("the runtime validator", () => {
  it("accepts the committed artifact, which names its including file", () => {
    const loaded = validateAuthorityArtifact(feralArtifact);
    expect(loaded.ok).toBe(true);
    expect(feralArtifact.provenance.regionSelector).toEqual({
      kind: "INCLUDED_FILE",
      includingSourcePath: "engine/class_modules/apl/druid/druid.cpp",
      includingSourceSha256: "dea8183f92e3a0da438e763355de6a41509d53930360287a05797994940ef28c",
      includeLine: '#include "class_modules/apl/druid/feral_apl.inc"',
      functionHeader: "void apl_feral( player_t* p )",
    });
  });

  it("refuses a selector with a missing or malformed field, or a stray one", () => {
    const withSelector = (selector: unknown) => ({
      ...feralArtifact,
      provenance: { ...feralArtifact.provenance, regionSelector: selector },
    });
    const { regionSelector } = feralArtifact.provenance;
    expect(
      validateAuthorityArtifact(withSelector({ ...regionSelector, includingSourceSha256: "abc" })).ok,
    ).toBe(false);
    expect(validateAuthorityArtifact(withSelector({ ...regionSelector, includeLine: "shred" })).ok).toBe(
      false,
    );
    expect(validateAuthorityArtifact(withSelector({ ...regionSelector, stray: 1 })).ok).toBe(false);
    const { includeLine: _dropped, ...withoutLine } = regionSelector;
    expect(validateAuthorityArtifact(withSelector(withoutLine)).ok).toBe(false);
  });

  it("refuses a selector beside the marker fields", () => {
    expect(
      validateAuthorityArtifact({
        ...feralArtifact,
        provenance: { ...feralArtifact.provenance, regionStartMarker: "//x_apl_start" },
      }).ok,
    ).toBe(false);
  });
});
