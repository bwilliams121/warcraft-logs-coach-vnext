/**
 * M11-C1: the APL extractor's region selector.
 *
 * Before M11-C1 a target could name its region only by two literal marker
 * lines (`//blood_apl_start` .. `//blood_apl_end`). The pinned `apl_monk.cpp`
 * carries none, defines `void default_apl( monk_t* player )` once per
 * namespace, keeps helper functions ahead of it, and declares its lists on
 * `player->` rather than `p->`. M11-C1 added ONE alternative selector — a
 * brace-balanced function inside a named namespace — and a configurable
 * player identifier. Both are source coordinates: they decide which lines
 * the unchanged region parser reads, never what a line means.
 *
 * What this file proves, over synthetic C++ (CI has no pinned checkout):
 *
 *   - marker selection is unchanged, including its failure message;
 *   - namespace selection is brace-balanced, and braces inside string
 *     literals and comments are not braces;
 *   - a same-named function in another namespace cannot be selected;
 *   - the player identifier is the target's, not a hard-coded `p`;
 *   - every ambiguity fails closed rather than picking;
 *   - rebuilt from their committed coordinates, the four existing targets'
 *     regions extract to exactly the lists their committed artifacts hold.
 *
 * The byte-level regeneration of the four committed artifacts from the
 * pinned sources is a local procedure (it needs the pinned checkout) and is
 * recorded in `scripts/authority/README.md`.
 */

import { describe, expect, it } from "vitest";

import {
  ExtractionError,
  TARGETS,
  extract,
  locateRegion,
  type AplExtractionTarget,
} from "../../scripts/authority/extract-simc-apl.mjs";
import assassinationArtifact from "../../src/simc/data/rogue-assassination.apl.json";
import protectionArtifact from "../../src/simc/data/paladin-protection.apl.json";
import retributionArtifact from "../../src/simc/data/paladin-retribution.apl.json";
import bloodArtifact from "../../src/simc/data/deathknight-blood.apl.json";

// ---------------------------------------------------------------------------
// Synthetic sources
// ---------------------------------------------------------------------------

const NAMESPACE_TARGET: AplExtractionTarget = {
  sourcePath: "engine/class_modules/apl/synthetic.cpp",
  enclosingNamespace: "brewmaster",
  functionHeader: "void default_apl( monk_t* player )",
  playerIdentifier: "player",
  regionName: "brewmaster",
  authorityId: "SYNTHETIC",
  spec: { className: "monk", specName: "brewmaster" },
  defaultOut: "unused.json",
  requiredFacts: { kind: "UNUSED", entryListName: "default", requiredLists: [] },
};

/**
 * A file shaped like the pinned `apl_monk.cpp`: an anonymous namespace, a
 * decoy `default_apl` in `windwalker` on BOTH sides of the real one, helper
 * functions ahead of the real one whose bodies put braces inside a string
 * literal, a block comment and a line comment.
 */
function namespacedSource(body: readonly string[] = DEFAULT_BODY): string {
  return [
    '#include "class_modules/monk/sc_monk.hpp"',
    "",
    "namespace",
    "{",
    "namespace windwalker_before",
    "{",
    "void default_apl( monk_t* player )",
    "{",
    '  action_priority_list_t* def = player->get_action_priority_list( "default" );',
    '  def->add_action( "decoy_before" );',
    "}",
    "};  // namespace windwalker_before",
    "",
    "namespace brewmaster",
    "{",
    "std::string default_potion( const monk_t* player )",
    "{",
    '  if ( player->true_level >= 90 ) { return "}}} {{ braces in a literal"; }',
    "  /* a { block comment } */",
    '  return "disabled";  // a trailing } comment',
    "}",
    "",
    "std::string default_flask( const monk_t* player )",
    "{",
    "  const char brace = '}';",
    '  return "disabled";',
    "}",
    "",
    "void default_apl( monk_t* player )",
    "{",
    ...body,
    "}",
    "};  // namespace brewmaster",
    "",
    "namespace windwalker",
    "{",
    "void default_apl( monk_t* player )",
    "{",
    '  action_priority_list_t* def = player->get_action_priority_list( "default" );',
    '  def->add_action( "decoy_after" );',
    "}",
    "};  // namespace windwalker",
    "};  // namespace",
    "",
  ].join("\n");
}

const DEFAULT_BODY: readonly string[] = [
  '  action_priority_list_t* pre = player->get_action_priority_list( "precombat" );',
  '  action_priority_list_t* def = player->get_action_priority_list( "default" );',
  '  action_priority_list_t* spm = player->get_action_priority_list( "shado_pan" );',
  "",
  '  pre->add_action( "snapshot_stats", "Precombat" );',
  '  def->add_action( "auto_attack", "Default List" );',
  '  def->add_action( "run_action_list,name=shado_pan,if=hero_tree.shadopan" );',
  "",
  "  // Shado-Pan",
  '  spm->add_action( "keg_smash" );',
];

function expectExtractionError(run: () => unknown, message: RegExp): void {
  let thrown: unknown = null;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(ExtractionError);
  expect((thrown as Error).message).toMatch(message);
}

// ---------------------------------------------------------------------------
// Namespace selection
// ---------------------------------------------------------------------------

describe("namespace + function selection", () => {
  it("selects the one function of that name inside the named namespace, brace-balanced", () => {
    const extracted = extract(namespacedSource(), NAMESPACE_TARGET);
    expect(
      extracted.lists.map((list) => [list.listName, list.receiverIdentifier, list.actions.length]),
    ).toEqual([
      ["precombat", "pre", 1],
      ["default", "def", 2],
      ["shado_pan", "spm", 1],
    ]);
    const verbatim = extracted.lists.flatMap((list) =>
      list.actions.map((action) => action.actionStringVerbatim),
    );
    expect(verbatim).toEqual([
      "snapshot_stats",
      "auto_attack",
      "run_action_list,name=shado_pan,if=hero_tree.shadopan",
      "keg_smash",
    ]);
    // Source lines are the real lines of the file (1-based), not region offsets.
    expect(extracted.lists[1]?.actions[1]?.sourceLine).toBe(37);
  });

  it("records the source-coordinate selector — never namespace lines as markers (M11-C1a)", () => {
    const extracted = extract(namespacedSource(), NAMESPACE_TARGET);
    expect(extracted.regionProvenance).toEqual({
      regionSelector: {
        kind: "NAMESPACE_FUNCTION",
        enclosingNamespace: "brewmaster",
        functionHeader: "void default_apl( monk_t* player )",
        playerIdentifier: "player",
      },
    });
    expect("regionStartMarker" in extracted.regionProvenance).toBe(false);
    expect("regionEndMarker" in extracted.regionProvenance).toBe(false);
  });

  it("delimits the function by brace matching that ignores braces in literals and comments", () => {
    // Lines 29-41 (1-based) are the real `default_apl`; the helpers above put
    // braces in a string literal, a block comment, a line comment and a
    // character literal, none of which may move either span.
    const located = locateRegion(namespacedSource().split("\n"), NAMESPACE_TARGET);
    expect(located.startIndex).toBe(27);
    expect(located.endIndex).toBe(41);
  });

  it("never selects a same-named function in another namespace, before or after", () => {
    const verbatim = extract(namespacedSource(), NAMESPACE_TARGET).lists.flatMap((list) =>
      list.actions.map((action) => action.actionStringVerbatim),
    );
    expect(verbatim).not.toContain("decoy_before");
    expect(verbatim).not.toContain("decoy_after");
  });

  it("fails closed when the header exists only in another namespace", () => {
    const source = namespacedSource().replace(
      "void default_apl( monk_t* player )\n{\n  action_priority_list_t* pre",
      "void other_apl( monk_t* player )\n{\n  action_priority_list_t* pre",
    );
    expectExtractionError(
      () => extract(source, NAMESPACE_TARGET),
      /occurs 0 times inside 'namespace brewmaster'/,
    );
  });

  it("fails closed when the header occurs twice inside the namespace", () => {
    const source = namespacedSource().replace(
      "std::string default_flask( const monk_t* player )",
      "void default_apl( monk_t* player )",
    );
    expectExtractionError(
      () => extract(source, NAMESPACE_TARGET),
      /occurs 2 times inside 'namespace brewmaster'/,
    );
  });

  it("fails closed when the namespace line occurs twice", () => {
    const source = `${namespacedSource()}\nnamespace brewmaster\n{\n}\n`;
    expectExtractionError(() => extract(source, NAMESPACE_TARGET), /occurs 2 times in the source/);
  });

  it("fails closed when the header is nested deeper than namespace scope", () => {
    const source = namespacedSource().replace(
      "std::string default_flask( const monk_t* player )\n{\n  const char brace = '}';",
      "std::string default_flask( const monk_t* player )\n{\nvoid default_apl( monk_t* player )\n  const char brace = '}';",
    );
    // Two textual headers now exist inside the namespace; make the real one
    // unique so the depth rule is what fires.
    const nestedOnly = source.replace(
      "\nvoid default_apl( monk_t* player )\n{\n  action_priority_list_t* pre",
      "\nvoid real_apl( monk_t* player )\n{\n  action_priority_list_t* pre",
    );
    expectExtractionError(
      () => extract(nestedOnly, NAMESPACE_TARGET),
      /is not at the scope of 'namespace brewmaster'/,
    );
  });

  it("refuses a raw string literal rather than guessing where it ends", () => {
    const source = namespacedSource().replace('return "disabled";\n}', 'return R"(})";\n}');
    expectExtractionError(() => extract(source, NAMESPACE_TARGET), /raw string literal/);
  });

  it("refuses a namespace whose brace never closes", () => {
    const source = namespacedSource().split("\n").slice(0, 34).join("\n");
    expectExtractionError(() => extract(source, NAMESPACE_TARGET), /never closed/);
  });

  it("refuses a target that declares both selectors, or neither", () => {
    expectExtractionError(
      () =>
        locateRegion(namespacedSource().split("\n"), {
          ...NAMESPACE_TARGET,
          regionStart: "//a",
          regionEnd: "//b",
        }),
      /exactly one region selector/,
    );
    const { enclosingNamespace: _unused, ...neither } = NAMESPACE_TARGET;
    void _unused;
    expectExtractionError(
      () => locateRegion(namespacedSource().split("\n"), neither),
      /exactly one region selector/,
    );
  });

  it("still refuses any construct the region parser does not model inside the selected function", () => {
    const source = namespacedSource([...DEFAULT_BODY, "  int unexpected = 1;"]);
    expectExtractionError(
      () => extract(source, NAMESPACE_TARGET),
      /unsupported construct inside the brewmaster region/,
    );
  });
});

// ---------------------------------------------------------------------------
// The player identifier
// ---------------------------------------------------------------------------

describe("the player identifier is the target's", () => {
  it("parses `player->get_action_priority_list` for a target that names `player`", () => {
    expect(extract(namespacedSource(), NAMESPACE_TARGET).lists.length).toBe(3);
  });

  it("does not read `player->` declarations under the default `p`", () => {
    const pTarget = { ...NAMESPACE_TARGET, functionHeader: "void default_apl( monk_t* p )" };
    const { playerIdentifier: _unused, ...withoutIdentifier } = pTarget;
    void _unused;
    const source = namespacedSource().replaceAll(
      "void default_apl( monk_t* player )",
      "void default_apl( monk_t* p )",
    );
    expectExtractionError(
      () => extract(source, withoutIdentifier),
      /unsupported construct inside the brewmaster region/,
    );
  });

  it("refuses an identifier the function header does not take as its parameter", () => {
    expectExtractionError(
      () => extract(namespacedSource(), { ...NAMESPACE_TARGET, playerIdentifier: "p" }),
      /does not take 'p' as its parameter/,
    );
  });

  it("refuses an identifier that is not a C++ identifier", () => {
    expectExtractionError(
      () => extract(namespacedSource(), { ...NAMESPACE_TARGET, playerIdentifier: "p->x" }),
      /is not a C\+\+ identifier/,
    );
  });
});

// ---------------------------------------------------------------------------
// Marker selection — unchanged
// ---------------------------------------------------------------------------

const MARKER_TARGET: AplExtractionTarget = {
  sourcePath: "engine/class_modules/apl/synthetic.cpp",
  regionStart: "//synthetic_apl_start",
  regionEnd: "//synthetic_apl_end",
  functionHeader: "void synthetic( player_t* p )",
  regionName: "synthetic",
  authorityId: "SYNTHETIC",
  spec: { className: "rogue", specName: "assassination" },
  defaultOut: "unused.json",
  requiredFacts: { kind: "UNUSED", entryListName: "default", requiredLists: [] },
};

describe("marker selection is unchanged", () => {
  const source = [
    "// preamble",
    "//synthetic_apl_start",
    "void synthetic( player_t* p )",
    "{",
    '  action_priority_list_t* default_ = p->get_action_priority_list( "default" );',
    '  default_->add_action( "auto_attack" );',
    "}",
    "//synthetic_apl_end",
  ].join("\n");

  it("locates the region strictly between the literal marker lines and records them verbatim", () => {
    expect(locateRegion(source.split("\n"), MARKER_TARGET)).toEqual({
      startIndex: 1,
      endIndex: 7,
      provenance: { regionStartMarker: "//synthetic_apl_start", regionEndMarker: "//synthetic_apl_end" },
    });
    const extracted = extract(source, MARKER_TARGET);
    expect(extracted.lists).toEqual([
      {
        listName: "default",
        receiverIdentifier: "default_",
        actions: [{ priorityOrdinal: 0, actionStringVerbatim: "auto_attack", comment: null, sourceLine: 6 }],
      },
    ]);
  });

  it("keeps its failure message byte for byte", () => {
    expectExtractionError(
      () => extract(source.replace("//synthetic_apl_end", "// gone"), MARKER_TARGET),
      /^could not locate the bounded region between \/\/synthetic_apl_start and \/\/synthetic_apl_end$/,
    );
  });

  it("every pre-existing target still selects by markers, on `p`, with no namespace", () => {
    for (const name of [
      "rogue-assassination",
      "paladin-protection",
      "paladin-retribution",
      "deathknight-blood",
    ]) {
      const target = TARGETS[name];
      expect(target, name).toBeDefined();
      expect(typeof target?.regionStart, name).toBe("string");
      expect(typeof target?.regionEnd, name).toBe("string");
      expect(target?.enclosingNamespace, name).toBeUndefined();
      expect(target?.playerIdentifier, name).toBeUndefined();
    }
  });
});

// ---------------------------------------------------------------------------
// Regression: the four existing targets, rebuilt from committed coordinates
// ---------------------------------------------------------------------------

interface CommittedList {
  readonly listName: string;
  readonly receiverIdentifier: string;
  readonly actions: readonly {
    readonly priorityOrdinal: number;
    readonly actionStringVerbatim: string;
    readonly comment: string | null;
    readonly sourceLine: number;
  }[];
}
interface CommittedArtifact {
  readonly provenance: { readonly regionStartMarker: string; readonly regionEndMarker: string };
  readonly lists: readonly CommittedList[];
}

/**
 * Places every committed action on its committed source line, the list
 * declarations and function header just above the first action, and the
 * target's markers around the whole — the same coordinates the pinned file
 * gave the extractor. Lines the artifact does not account for (comments,
 * dropped version-guard branches) are left blank, which the parser skips.
 */
function rebuiltSource(artifact: CommittedArtifact, target: AplExtractionTarget): string {
  const lines: string[] = [];
  const set = (lineNumber: number, text: string): void => {
    while (lines.length < lineNumber) lines.push("");
    lines[lineNumber - 1] = text;
  };
  const actionLines = artifact.lists.flatMap((list) => list.actions.map((action) => action.sourceLine));
  const first = Math.min(...actionLines);
  const last = Math.max(...actionLines);
  const declarations = artifact.lists.map(
    (list) =>
      `  action_priority_list_t* ${list.receiverIdentifier} = p->get_action_priority_list( "${list.listName}" );`,
  );
  const header = first - declarations.length - 2;
  expect(header, "room above the first action for the header and declarations").toBeGreaterThan(1);
  set(header - 1, target.regionStart ?? "");
  set(header, target.functionHeader);
  set(header + 1, "{");
  declarations.forEach((declaration, index) => set(header + 2 + index, declaration));
  for (const list of artifact.lists) {
    for (const action of list.actions) {
      const comment = action.comment === null ? "" : `, ${JSON.stringify(action.comment)}`;
      set(
        action.sourceLine,
        `  ${list.receiverIdentifier}->add_action( ${JSON.stringify(action.actionStringVerbatim)}${comment} );`,
      );
    }
  }
  set(last + 1, "}");
  set(last + 2, target.regionEnd ?? "");
  return lines.join("\n");
}

describe("the four existing targets select exactly the regions their committed artifacts record", () => {
  const CASES: readonly [string, CommittedArtifact][] = [
    ["rogue-assassination", assassinationArtifact as unknown as CommittedArtifact],
    ["paladin-protection", protectionArtifact as unknown as CommittedArtifact],
    ["paladin-retribution", retributionArtifact as unknown as CommittedArtifact],
    ["deathknight-blood", bloodArtifact as unknown as CommittedArtifact],
  ];

  it.each(CASES)(
    "%s: rebuilt from its coordinates, extracts to its committed lists and markers",
    (name, artifact) => {
      const target = TARGETS[name] as AplExtractionTarget;
      // The Blood target evaluates version guards; the rebuilt source carries
      // none (the artifact holds only the surviving statements), which the
      // target permits — its guard list simply comes back empty.
      const extracted = extract(rebuiltSource(artifact, target), target);
      expect(extracted.lists).toEqual(artifact.lists);
      // The marker form, exactly the two fields the committed artifact carries.
      expect(extracted.regionProvenance).toEqual({
        regionStartMarker: artifact.provenance.regionStartMarker,
        regionEndMarker: artifact.provenance.regionEndMarker,
      });
    },
  );
});
