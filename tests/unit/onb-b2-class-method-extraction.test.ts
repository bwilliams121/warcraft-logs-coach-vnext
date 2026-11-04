/**
 * ONB-B2: a list built by a class method, and the spell-gated `add_action` form.
 *
 * Enhancement's list is `shaman_t::init_action_list_enhancement`, not a marked region: it opens on a
 * guard that returns before any list exists, its lists are declared on the implicit `this`, and two
 * of its lines are `add_action( this, "<Spell>", ... )`, which emits only under the player's spell
 * data. Each of those is accepted by exact text and refused otherwise, and an emitted-or-not outcome
 * rests on proofs checked against hash-pinned bytes. Wind Shear's line is the point: nothing may
 * read a talent-only spell's statement as a list line.
 *
 * Synthetic source, because CI has no pinned checkout. The real preflight's report is in
 * scripts/authority/README.md "ONB-B2".
 */

import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  PINNED_SIMC_COMMIT,
  TARGETS,
  extract,
  preflightBatch,
  validatePinnedRecord,
  type AplExtractionTarget,
  type PinnedExtractionTarget,
} from "../../scripts/authority/extract-simc-apl.mjs";
import {
  AUTHORITY_REGION_SELECTOR_KINDS,
  validateAuthorityArtifact,
} from "../../src/simc/authority-artifact.js";
import enhancementArtifact from "../../src/simc/data/shaman-enhancement.apl.json";

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");

const METHOD_HEADER = "void synth_t::init_action_list_gamma()";
const PROLOGUE = [
  "if ( main_hand_weapon.type == WEAPON_NONE )",
  "{",
  "if ( !quiet )",
  'sim->errorf( "no weapon %s", name() );',
  "quiet = true;",
  "return;",
  "}",
];
const METHOD = [
  "",
  METHOD_HEADER,
  "{",
  ...PROLOGUE.map((line) => `  ${line}`),
  "",
  '  action_priority_list_t* def = get_action_priority_list( "default" );',
  '  action_priority_list_t* cds = get_action_priority_list( "cds", "A description nothing reads" );',
  "",
  '  def->add_action( this, "Lust", "line_cd=600" );',
  '  def->add_action( this, "Shear", "", "An interrupt." );',
  '  def->add_action( "auto_attack" );',
  '  def->add_action( "call_action_list,name=cds" );',
  '  cds->add_action( "strike", "A comment" );',
  '// def->add_action( "call_action_list,name=opener" );',
  "}",
  "// the next method",
];
const MODULE = [
  "#include <x>",
  ...METHOD,
  "void synth_t::init_action_list()",
  "{",
  "  switch ( specialization() )",
  "  {",
  "    case SYNTH_GAMMA:",
  "      init_action_list_gamma();",
  "      break;",
  "    default:",
  "      break;",
  "  }",
  "}",
  "",
].join("\n");
const CLASS_TABLE = ['{ 9, 0, 111, 0, "Lust" },', '{ 9, 0, 222, 0, "Other" },', ""].join("\n");
const SPEC_TABLE = ['{ 9, 90, 333, 0, "Other" },', ""].join("\n");
const MODULE_PATH = "engine/class_modules/sc_synth.cpp";
const CLASS_PATH = "engine/dbc/generated/class_spells.inc";
const SPEC_PATH = "engine/dbc/generated/specialization_spells.inc";

type Files = Record<string, string>;
const CLEAN: Files = { [MODULE_PATH]: MODULE, [CLASS_PATH]: CLASS_TABLE, [SPEC_PATH]: SPEC_TABLE };

function pinnedFile(path: string, files: Files = CLEAN) {
  const text = files[path] ?? "";
  return { sourcePath: path, sha256: sha256(text), byteLength: Buffer.byteLength(text) };
}

function regionHash(text: string): string {
  const lines = text.split("\n");
  const header = lines.indexOf(METHOD_HEADER);
  const close = lines.indexOf("}", header);
  return sha256(lines.slice(header - 1, close + 2).join("\n"));
}

function target(
  overrides: Partial<PinnedExtractionTarget> = {},
  files: Files = CLEAN,
): PinnedExtractionTarget {
  return {
    sourcePath: MODULE_PATH,
    enclosingClass: "synth_t",
    functionHeader: METHOD_HEADER,
    regionName: "gamma",
    authorityId: "SIMC_APL_SYNTH_GAMMA",
    spec: { className: "synth", specName: "gamma" },
    defaultOut: "src/simc/data/synth-gamma.apl.json",
    pinnedSource: {
      ...pinnedFile(MODULE_PATH, files),
      commitSha: PINNED_SIMC_COMMIT,
      regionSha256: regionHash(files[MODULE_PATH] ?? ""),
    },
    livePtrPolicy: {
      kind: "NO_PTR_REGION",
      ptrRegionStart: "//init_action_list_gamma_ptr_apl_start",
      ptrRegionEnd: "//init_action_list_gamma_ptr_apl_end",
      ptrFunctionHeader: "void synth_t::init_action_list_gamma_ptr()",
    },
    dispatch: {
      ...pinnedFile(MODULE_PATH, files),
      functionHeader: "void synth_t::init_action_list()",
      sequence: ["case SYNTH_GAMMA:", "init_action_list_gamma();", "break;"],
    },
    methodPrologue: { lines: PROLOGUE, appliesWhen: "main_hand_weapon.type != WEAPON_NONE" },
    spellGatedActions: [
      {
        statement: 'def->add_action( this, "Lust", "line_cd=600" );',
        spellName: "Lust",
        emitted: "lust,line_cd=600",
        proofs: [
          {
            ...pinnedFile(CLASS_PATH, files),
            checks: [{ kind: "LINE_EXACTLY_ONCE" as const, line: '{ 9, 0, 111, 0, "Lust" },' }],
          },
        ],
      },
      {
        statement: 'def->add_action( this, "Shear", "", "An interrupt." );',
        spellName: "Shear",
        emitted: null,
        proofs: [
          { ...pinnedFile(CLASS_PATH, files), checks: [{ kind: "TOKEN_ABSENT" as const, token: "Shear" }] },
          { ...pinnedFile(SPEC_PATH, files), checks: [{ kind: "TOKEN_ABSENT" as const, token: "Shear" }] },
        ],
      },
    ],
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: ["default", "cds"],
      listSizes: { default: 3, cds: 1 },
      edges: [{ from: "default", ordinal: 2, kind: "CALL", to: "cds", condition: null }],
      forbiddenTokens: ["swap_action_list"],
    },
    ...overrides,
  } as PinnedExtractionTarget;
}

function preflight(files: Files = CLEAN, targetFor: AplExtractionTarget = target({}, files)) {
  return preflightBatch({
    targetNames: ["gamma"],
    targets: { gamma: targetFor },
    read: (path: string) => (path in files ? Buffer.from(files[path] ?? "", "utf8") : null),
    sha: PINNED_SIMC_COMMIT,
    extractedOn: "2026-11-04",
    commitDate: "2026-09-12",
    branch: "midnight",
  });
}

function problems(result: ReturnType<typeof preflight>): string {
  return [...result.problems, ...(result.results[0]?.problems ?? [])].join("\n");
}

const moduleWith = (edit: (text: string) => string): Files => ({ ...CLEAN, [MODULE_PATH]: edit(MODULE) });

describe("a class-method target", () => {
  it("extracts exactly the lines the spell data leaves, in the source's order", () => {
    const extracted = extract(MODULE, target());
    expect(extracted.lists.map((list) => list.listName)).toEqual(["default", "cds"]);
    expect(extracted.lists[0]?.actions.map((action) => action.actionStringVerbatim)).toEqual([
      "lust,line_cd=600",
      "auto_attack",
      "call_action_list,name=cds",
    ]);
    expect(extracted.lists[0]?.actions.map((action) => action.priorityOrdinal)).toEqual([0, 1, 2]);
    expect(extracted.spellGatedActions?.map((form) => [form.spellName, form.emitted])).toEqual([
      ["Lust", "lust,line_cd=600"],
      ["Shear", null],
    ]);
    expect(extracted.methodPrologue?.appliesWhen).toBe("main_hand_weapon.type != WEAPON_NONE");
    expect(extracted.regionProvenance).toEqual({
      regionSelector: { kind: "CLASS_METHOD", enclosingClass: "synth_t", functionHeader: METHOD_HEADER },
    });
  });

  it("passes the pinned preflight, and the artifact it builds validates with both records", () => {
    const result = preflight();
    expect(problems(result)).toBe("");
    expect(result.ok).toBe(true);
    const validation = validateAuthorityArtifact(result.results[0]?.artifact);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.artifact.provenance.spellGatedActions).toHaveLength(2);
    expect(validation.artifact.provenance.methodPrologue?.endLine).toBeGreaterThan(
      validation.artifact.provenance.methodPrologue?.startLine ?? Infinity,
    );
  });

  it("is well formed on the real record, which names the real statements and no marker", () => {
    const real = TARGETS["shaman-enhancement"] as PinnedExtractionTarget;
    expect(validatePinnedRecord("shaman-enhancement", real)).toEqual([]);
    expect(real.regionStart).toBeUndefined();
    expect(real.pinnedSource.commitSha).toBe(PINNED_SIMC_COMMIT);
    expect(real.spellGatedActions?.map((form) => form.emitted)).toEqual(["bloodlust,line_cd=600", null]);
  });
});

describe("every way a class-method target refuses", () => {
  it.each([
    [
      "an undeclared spell-gated statement",
      (t: string) => t.replace('"Shear", "",', '"Shield", "",'),
      /undeclared spell-gated/,
    ],
    [
      "a declared statement that occurs twice",
      (t: string) =>
        t.replace(
          '  def->add_action( "auto_attack" );',
          '  def->add_action( this, "Lust", "line_cd=600" );\n  def->add_action( "auto_attack" );',
        ),
      /occurs 2 times/,
    ],
    [
      "a method that does not open on the prologue",
      (t: string) => t.replace("return;", "exit();"),
      /prologue/,
    ],
    [
      "any other condition in the method",
      (t: string) => t.replace('  def->add_action( "auto_attack" );', "  if ( x )\n    y();"),
      /unsupported construct/,
    ],
    ["a copy of the header", (t: string) => `${t}\n${METHOD_HEADER}\n{\n}\n`, /occurs 2 times/],
    [
      "an indented header, which is not at file scope",
      (t: string) => t.replace(METHOD_HEADER, `  ${METHOD_HEADER}`),
      /not at file scope/,
    ],
  ] as const)("%s", (_name, edit, pattern) => {
    expect(() => extract(edit(MODULE), target())).toThrow(pattern);
  });

  it("a Wind-Shear-style statement is refused as a list line if its spell gains a table row", () => {
    // The proof is the point: the pinned bytes decide, not the declaration.
    const files = { ...CLEAN, [CLASS_PATH]: `${CLASS_TABLE}{ 9, 0, 444, 0, "Shear" },\n` };
    const result = preflight(files);
    expect(result.ok).toBe(false);
    expect(problems(result)).toMatch(/INERT_PROOF_FAILED: .*names 'Shear'/);
  });

  it("a Bloodlust-style statement is refused if its spell loses its table row", () => {
    const files = { ...CLEAN, [CLASS_PATH]: '{ 9, 0, 222, 0, "Other" },\n' };
    expect(problems(preflight(files))).toMatch(/INERT_PROOF_FAILED: .*occurs 0 times/);
  });

  it("a proof file that is not the pinned bytes refuses before anything is decided", () => {
    const stale = target();
    const files = { ...CLEAN, [SPEC_PATH]: `${SPEC_TABLE}// edited\n` };
    expect(problems(preflight(files, stale))).toMatch(/SHA|sha256|bytes|byte/i);
  });

  it("a dispatch that goes elsewhere refuses", () => {
    const files = moduleWith((t) => t.replace("init_action_list_gamma();", "init_action_list_delta();"));
    expect(problems(preflight(files))).toMatch(/DISPATCH_UNVERIFIED/);
  });

  it("a PTR method refuses under NO_PTR_REGION", () => {
    const files = moduleWith((t) => `${t}\nvoid synth_t::init_action_list_gamma_ptr()\n{\n}\n`);
    expect(problems(preflight(files))).toMatch(/POLICY_VIOLATED/);
  });

  it("a header of another class refuses", () => {
    expect(() => extract(MODULE, target({ enclosingClass: "other_t" }))).toThrow(/does not define a method/);
  });

  it("a target naming a marker and a class is refused, because it has one selector", () => {
    expect(() =>
      extract(MODULE, target({ regionStart: "//gamma_apl_start", regionEnd: "//gamma_apl_end" })),
    ).toThrow(/exactly one region selector/);
  });

  it.each([
    ["no spell name", { spellName: undefined }],
    ["a spell the statement does not name", { spellName: "Other" }],
    ["no proofs", { proofs: [] }],
    ["an unknown check", { proofs: [{ ...pinnedFile(CLASS_PATH), checks: [{ kind: "TRUST_ME" }] }] }],
  ])("a spell-gated record with %s is malformed", (_name, patch) => {
    const real = target();
    const forms = real.spellGatedActions ?? [];
    const malformed = target({
      spellGatedActions: [{ ...forms[0], ...patch }, forms[1]] as never,
    });
    expect(validatePinnedRecord("gamma", malformed).join("\n")).toMatch(/MALFORMED_SPELL_GATED/);
  });
});

describe("the runtime validator", () => {
  const provenanceOf = () =>
    structuredClone(enhancementArtifact) as unknown as { provenance: Record<string, unknown> };

  it("accepts the committed artifact, which carries the selector and both records", () => {
    expect(AUTHORITY_REGION_SELECTOR_KINDS).toContain("CLASS_METHOD");
    const validation = validateAuthorityArtifact(enhancementArtifact);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.artifact.provenance.regionSelector).toEqual({
      kind: "CLASS_METHOD",
      enclosingClass: "shaman_t",
      functionHeader: "void shaman_t::init_action_list_enhancement()",
    });
    expect(validation.artifact.provenance.spellGatedActions?.map((form) => form.spellName)).toEqual([
      "Bloodlust",
      "Wind Shear",
    ]);
  });

  it.each([
    [
      "a selector with a player identifier",
      (p: Record<string, unknown>) =>
        (p["regionSelector"] = {
          kind: "CLASS_METHOD",
          enclosingClass: "shaman_t",
          functionHeader: "void shaman_t::x()",
          playerIdentifier: "p",
        }),
    ],
    [
      "a selector whose header names another class",
      (p: Record<string, unknown>) =>
        (p["regionSelector"] = {
          kind: "CLASS_METHOD",
          enclosingClass: "shaman_t",
          functionHeader: "void other_t::x()",
        }),
    ],
    [
      "a selector with no class",
      (p: Record<string, unknown>) =>
        (p["regionSelector"] = { kind: "CLASS_METHOD", functionHeader: "void shaman_t::x()" }),
    ],
    [
      "a selector beside a marker",
      (p: Record<string, unknown>) => (p["regionStartMarker"] = "//x_apl_start"),
    ],
    ["an empty spell-gated list", (p: Record<string, unknown>) => (p["spellGatedActions"] = [])],
    [
      "a spell-gated statement naming another spell",
      (p: Record<string, unknown>) =>
        (p["spellGatedActions"] = [{ sourceLine: 1, statement: "x", spellName: "y", emitted: null }]),
    ],
    [
      "a spell-gated emission of the wrong type",
      (p: Record<string, unknown>) =>
        (p["spellGatedActions"] = [{ sourceLine: 1, statement: "y", spellName: "y", emitted: 3 }]),
    ],
    [
      "a prologue with no condition",
      (p: Record<string, unknown>) => (p["methodPrologue"] = { startLine: 1, endLine: 2 }),
    ],
    [
      "a prologue that ends before it starts",
      (p: Record<string, unknown>) => (p["methodPrologue"] = { startLine: 3, endLine: 2, appliesWhen: "x" }),
    ],
    ["both records but no region hash", (p: Record<string, unknown>) => delete p["regionSha256"]],
  ])("refuses %s", (_name, patch) => {
    const artifact = provenanceOf();
    patch(artifact.provenance);
    expect(validateAuthorityArtifact(artifact).ok).toBe(false);
  });
});
