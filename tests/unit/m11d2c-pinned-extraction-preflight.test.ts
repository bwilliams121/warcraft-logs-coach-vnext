/**
 * M11-D2-C: the APL extractor's PINNED targets and its atomic batch preflight.
 *
 * What this file proves, over a SYNTHETIC source root (CI has no pinned
 * checkout; the real eight-target preflight is a local procedure recorded in
 * scripts/authority/README.md):
 *
 *   - a batch passes only when every target's module, region, live/PTR
 *     policy, dispatch and inert-statement proof match their pinned bytes;
 *   - every fail-closed case named by the tranche fails, with its reason;
 *   - one failing target fails the batch, and a failed batch writes nothing;
 *   - a passing batch writes every artifact or none, deterministically;
 *   - source paths are confined to the source root;
 *   - the eight D2-C targets are recorded against the pinned commit, and the
 *     five earlier targets and their committed artifacts are untouched;
 *   - the runtime validator keeps a pinned artifact's tie-back fields and
 *     refuses a partial one.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

import { afterAll, describe, expect, it } from "vitest";

import {
  ExtractionError,
  PINNED_SIMC_COMMIT,
  TARGETS,
  batchReport,
  buildArtifact,
  confinedSourcePath,
  extract,
  preflightBatch,
  sourceRootReader,
  validatePinnedRecord,
  writeBatch,
  type AplExtractionTarget,
  type PinnedExtractionTarget,
  type SourceReader,
  verifyLivePtrPolicy,
} from "../../scripts/authority/extract-simc-apl.mjs";
import { validateAuthorityArtifact } from "../../src/simc/authority-artifact.js";
import assassinationArtifact from "../../src/simc/data/rogue-assassination.apl.json";
import protectionArtifact from "../../src/simc/data/paladin-protection.apl.json";
import retributionArtifact from "../../src/simc/data/paladin-retribution.apl.json";
import bloodArtifact from "../../src/simc/data/deathknight-blood.apl.json";
import brewmasterArtifact from "../../src/simc/data/monk-brewmaster.apl.json";

const sha256 = (text: string): string => createHash("sha256").update(text).digest("hex");
const COMMIT = PINNED_SIMC_COMMIT;
const OTHER_COMMIT = "0123456789abcdef0123456789abcdef01234567";

// ---------------------------------------------------------------------------
// The synthetic pinned source root
// ---------------------------------------------------------------------------

const MODULE_PATH = "engine/class_modules/apl/apl_synth.cpp";
const DISPATCH_PATH = "engine/class_modules/sc_synth.cpp";
const PROOF_PATH = "engine/player/base.cpp";

const MODULE = [
  "namespace synth_apl",
  "{",
  "//alpha_apl_start",
  "void alpha( player_t* p )",
  "{",
  "  std::vector<std::string> unused_local = p->get_unused();",
  '  action_priority_list_t* default_ = p->get_action_priority_list( "default" );',
  '  action_priority_list_t* precombat = p->get_action_priority_list( "precombat" );',
  '  action_priority_list_t* cds = p->get_action_priority_list( "cds" );',
  "",
  '  precombat->add_action( "snapshot_stats" );',
  '  default_->add_action( "call_action_list,name=cds" );',
  '  default_->add_action( "strike" );',
  '  cds->add_action( "big_cooldown" );',
  "}",
  "//alpha_apl_end",
  "",
  "//beta_apl_start",
  "void beta( player_t* p )",
  "{",
  '  action_priority_list_t* default_ = p->get_action_priority_list( "default" );',
  '  default_->add_action( "jab" );',
  "}",
  "//beta_apl_end",
  "",
  "//beta_ptr_apl_start",
  "void beta_ptr( player_t* p )",
  "{",
  '  action_priority_list_t* default_ = p->get_action_priority_list( "default" );',
  '  default_->add_action( "jab" );',
  "}",
  "//beta_ptr_apl_end",
  "",
  "//gamma_apl_start",
  "void gamma( player_t* p )",
  "{",
  '  action_priority_list_t* default_ = p->get_action_priority_list( "default" );',
  '  default_->add_action( "slash" );',
  "}",
  "//gamma_apl_end",
  "//gamma_ptr_apl_start",
  "",
  "//gamma_ptr_apl_end",
  "}",
].join("\n");

const DISPATCH = [
  "void synth_t::init_action_list()",
  "{",
  "  switch ( specialization() )",
  "  {",
  "    case SYNTH_ALPHA:",
  "      synth_apl::alpha( this );",
  "      break;",
  "    case SYNTH_BETA:",
  "      if ( is_ptr() )",
  "        synth_apl::beta_ptr( this );",
  "      else",
  "        synth_apl::beta( this );",
  "      break;",
  "    case SYNTH_GAMMA:",
  "      synth_apl::gamma( this );",
  "      break;",
  "  }",
  "}",
].join("\n");

const PROOF_FUNCTION = [
  "std::vector<std::string> base_t::get_unused()",
  "{",
  "  std::vector<std::string> v;",
  "  return v;",
  "}",
];
const PROOF = ["// base", ...PROOF_FUNCTION, ""].join("\n");

type Files = Record<string, string>;
const CLEAN: Files = { [MODULE_PATH]: MODULE, [DISPATCH_PATH]: DISPATCH, [PROOF_PATH]: PROOF };

function readerOf(files: Files): SourceReader {
  return (path) => (path in files ? Buffer.from(files[path] ?? "", "utf8") : null);
}

function pinnedFile(path: string, files: Files = CLEAN) {
  const text = files[path] ?? "";
  return { sourcePath: path, sha256: sha256(text), byteLength: Buffer.byteLength(text) };
}

function regionHash(start: string, end: string): string {
  const lines = MODULE.split("\n");
  return sha256(lines.slice(lines.indexOf(start), lines.indexOf(end) + 1).join("\n"));
}

function synthTarget(
  name: "alpha" | "beta" | "gamma",
  overrides: Partial<PinnedExtractionTarget> = {},
): PinnedExtractionTarget {
  const kind =
    name === "alpha" ? "NO_PTR_REGION" : name === "beta" ? "PTR_BODY_IDENTICAL" : "PTR_MARKERS_EMPTY";
  const sequence =
    name === "beta"
      ? [
          "case SYNTH_BETA:",
          "if ( is_ptr() )",
          "synth_apl::beta_ptr( this );",
          "else",
          "synth_apl::beta( this );",
          "break;",
        ]
      : [`case SYNTH_${name.toUpperCase()}:`, `synth_apl::${name}( this );`, "break;"];
  const lists: Record<string, number> =
    name === "alpha" ? { default: 2, precombat: 1, cds: 1 } : { default: 1 };
  return {
    sourcePath: MODULE_PATH,
    regionStart: `//${name}_apl_start`,
    regionEnd: `//${name}_apl_end`,
    functionHeader: `void ${name}( player_t* p )`,
    regionName: name,
    authorityId: `SIMC_APL_SYNTH_${name.toUpperCase()}`,
    spec: { className: "synth", specName: name },
    defaultOut: `src/simc/data/synth-${name}.apl.json`,
    pinnedSource: {
      ...pinnedFile(MODULE_PATH),
      commitSha: COMMIT,
      regionSha256: regionHash(`//${name}_apl_start`, `//${name}_apl_end`),
    },
    livePtrPolicy: {
      kind,
      ptrRegionStart: `//${name}_ptr_apl_start`,
      ptrRegionEnd: `//${name}_ptr_apl_end`,
      ptrFunctionHeader: `void ${name}_ptr( player_t* p )`,
    },
    dispatch: { ...pinnedFile(DISPATCH_PATH), functionHeader: "void synth_t::init_action_list()", sequence },
    ...(name === "alpha"
      ? {
          inertStatements: [
            {
              statement: "std::vector<std::string> unused_local = p->get_unused();",
              identifier: "unused_local",
              reason: "synthetic",
              proofs: [
                {
                  ...pinnedFile(PROOF_PATH),
                  checks: [
                    {
                      kind: "FUNCTION_BODY_SHA256" as const,
                      functionHeader: "std::vector<std::string> base_t::get_unused()",
                      bodySha256: sha256(PROOF_FUNCTION.join("\n")),
                    },
                  ],
                },
                {
                  ...pinnedFile(DISPATCH_PATH),
                  checks: [{ kind: "TOKEN_ABSENT" as const, token: "get_unused" }],
                },
              ],
            },
          ],
        }
      : {}),
    requiredFacts: {
      kind: "DISPATCH_GRAPH",
      entryListName: "default",
      requiredLists: Object.keys(lists),
      listSizes: lists,
      edges:
        name === "alpha" ? [{ from: "default", ordinal: 0, kind: "CALL", to: "cds", condition: null }] : [],
      forbiddenTokens: ["swap_action_list"],
    },
    ...overrides,
  } as PinnedExtractionTarget;
}

const SYNTH = { alpha: synthTarget("alpha"), beta: synthTarget("beta"), gamma: synthTarget("gamma") };

function batch(
  options: {
    readonly names?: readonly string[];
    readonly targets?: Record<string, AplExtractionTarget>;
    readonly files?: Files;
    readonly sha?: string | null;
    readonly outDir?: string;
  } = {},
) {
  return preflightBatch({
    targetNames: options.names ?? ["alpha", "beta", "gamma"],
    targets: options.targets ?? SYNTH,
    read: readerOf(options.files ?? CLEAN),
    sha: options.sha === undefined ? COMMIT : options.sha,
    extractedOn: "2026-10-01",
    commitDate: "2026-09-12",
    branch: "midnight",
    ...(options.outDir === undefined ? {} : { outDir: options.outDir }),
  });
}

function problemsOf(result: ReturnType<typeof batch>, name: string): string {
  return [...result.problems, ...(result.results.find((r) => r.targetName === name)?.problems ?? [])].join(
    "\n",
  );
}

function expectFails(result: ReturnType<typeof batch>, name: string, pattern: RegExp): void {
  expect(result.ok).toBe(false);
  expect(problemsOf(result, name)).toMatch(pattern);
}

// ---------------------------------------------------------------------------
// Positive
// ---------------------------------------------------------------------------

describe("a batch of pinned targets", () => {
  it("passes when every module, region, policy, dispatch and proof matches its pinned bytes", () => {
    const result = batch();
    expect(result.problems).toEqual([]);
    expect(result.results.map((r) => [r.targetName, r.ok, r.livePtrPolicy])).toEqual([
      ["alpha", true, "NO_PTR_REGION"],
      ["beta", true, "PTR_BODY_IDENTICAL"],
      ["gamma", true, "PTR_MARKERS_EMPTY"],
    ]);
    expect(result.ok).toBe(true);
  });

  it("passes each target on its own", () => {
    for (const name of ["alpha", "beta", "gamma"]) expect(batch({ names: [name] }).ok, name).toBe(true);
  });

  it("reports deterministically, whatever order the targets were named in", () => {
    const first = JSON.stringify(batchReport(batch({ names: ["gamma", "alpha", "beta"] })));
    const second = JSON.stringify(batchReport(batch({ names: ["beta", "gamma", "alpha"] })));
    expect(second).toBe(first);
    expect(first).not.toContain("extractedOn");
  });

  it("drops the inert statement and records it in provenance, without changing a list", () => {
    const alpha = batch({ names: ["alpha"] }).results[0];
    expect(alpha?.inertStatements).toBe(1);
    const provenance = (alpha?.artifact as { provenance: Record<string, unknown> }).provenance;
    expect(provenance["inertStatements"]).toEqual([
      {
        sourceLine: 6,
        statement: "std::vector<std::string> unused_local = p->get_unused();",
        identifier: "unused_local",
      },
    ]);
    expect(provenance["livePtrPolicy"]).toBe("NO_PTR_REGION");
    expect(provenance["regionSha256"]).toBe(SYNTH.alpha.pinnedSource.regionSha256);
    expect(provenance["dispatchSource"]).toEqual({
      sourcePath: DISPATCH_PATH,
      sourceSha256: SYNTH.alpha.dispatch.sha256,
    });
    expect(alpha?.actions).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Fail closed
// ---------------------------------------------------------------------------

const mutated = (path: string, edit: (text: string) => string): Files => ({
  ...CLEAN,
  [path]: edit(CLEAN[path] ?? ""),
});

/** Re-pins a target to mutated bytes, so ONLY the structural check under test can fail. */
function repinned(
  name: "alpha" | "beta" | "gamma",
  files: Files,
  overrides: Partial<PinnedExtractionTarget> = {},
) {
  const base = synthTarget(name);
  const lines = (files[MODULE_PATH] ?? "").split("\n");
  const start = lines.indexOf(base.regionStart ?? "");
  const end = lines.indexOf(base.regionEnd ?? "");
  return {
    ...base,
    pinnedSource: {
      ...pinnedFile(MODULE_PATH, files),
      commitSha: COMMIT,
      regionSha256:
        start >= 0 && end > start
          ? sha256(lines.slice(start, end + 1).join("\n"))
          : base.pinnedSource.regionSha256,
    },
    dispatch: { ...base.dispatch, ...pinnedFile(DISPATCH_PATH, files) },
    ...overrides,
  } as PinnedExtractionTarget;
}

describe("every fail-closed case", () => {
  it("wrong SimC commit", () => {
    expectFails(batch({ sha: OTHER_COMMIT }), "alpha", /COMMIT_MISMATCH/);
  });

  it("missing commit metadata: no --sha, and a record naming no commit", () => {
    expectFails(batch({ sha: null }), "alpha", /MISSING_COMMIT: no 40-character --sha/);
    const target = { ...SYNTH.alpha, pinnedSource: { ...SYNTH.alpha.pinnedSource, commitSha: "midnight" } };
    expectFails(batch({ names: ["alpha"], targets: { alpha: target } }), "alpha", /MISSING_COMMIT/);
  });

  it("wrong source hash", () => {
    expectFails(
      batch({ files: mutated(MODULE_PATH, (t) => `${t}\n// drift`) }),
      "alpha",
      /SOURCE_SHA256_MISMATCH: module/,
    );
  });

  it("missing module, missing dispatch source, missing proof source", () => {
    const { [MODULE_PATH]: _module, ...noModule } = CLEAN;
    expectFails(batch({ files: noModule }), "alpha", /MISSING_SOURCE: module/);
    const { [DISPATCH_PATH]: _dispatch, ...noDispatch } = CLEAN;
    expectFails(batch({ files: noDispatch }), "beta", /MISSING_SOURCE: dispatch/);
    const { [PROOF_PATH]: _proof, ...noProof } = CLEAN;
    expectFails(batch({ files: noProof, names: ["alpha"] }), "alpha", /MISSING_SOURCE: inert proof/);
  });

  it("duplicate marker", () => {
    const files = mutated(MODULE_PATH, (t) => `${t}\n//alpha_apl_start`);
    expectFails(
      batch({ files, targets: { alpha: repinned("alpha", files) }, names: ["alpha"] }),
      "alpha",
      /\/\/alpha_apl_start occurs 2 times/,
    );
  });

  it("missing marker", () => {
    const files = mutated(MODULE_PATH, (t) => t.replace("//gamma_apl_end", "// gone"));
    expectFails(
      batch({ files, targets: { gamma: repinned("gamma", files) }, names: ["gamma"] }),
      "gamma",
      /could not locate the bounded region between \/\/gamma_apl_start and \/\/gamma_apl_end/,
    );
  });

  it("reversed marker", () => {
    const files = mutated(MODULE_PATH, (t) =>
      t
        .replace("//beta_apl_start", "//TMP")
        .replace("//beta_apl_end", "//beta_apl_start")
        .replace("//TMP", "//beta_apl_end"),
    );
    expectFails(
      batch({ files, targets: { beta: repinned("beta", files) }, names: ["beta"] }),
      "beta",
      /could not locate the bounded region/,
    );
  });

  it("region bytes that are not the pinned region", () => {
    const target = {
      ...SYNTH.gamma,
      pinnedSource: { ...SYNTH.gamma.pinnedSource, regionSha256: "0".repeat(64) },
    };
    expectFails(batch({ names: ["gamma"], targets: { gamma: target } }), "gamma", /REGION_SHA256_MISMATCH/);
  });

  it("wrong target/module pairing", () => {
    const target = { ...SYNTH.alpha, sourcePath: DISPATCH_PATH };
    expectFails(batch({ names: ["alpha"], targets: { alpha: target } }), "alpha", /MODULE_MISMATCH/);
    // The module's path, another file's bytes: the pinned hash refuses them.
    const swapped: Files = { ...CLEAN, [MODULE_PATH]: DISPATCH };
    expectFails(batch({ files: swapped, names: ["alpha"] }), "alpha", /SOURCE_SHA256_MISMATCH: module/);
  });

  it("invalid live/PTR relation, for each policy", () => {
    // NO_PTR_REGION, but a PTR region exists.
    const withPtr = mutated(MODULE_PATH, (t) =>
      t.replace("}\n//alpha_apl_end", "}\n//alpha_apl_end\n//alpha_ptr_apl_start\n//alpha_ptr_apl_end"),
    );
    expectFails(
      batch({ files: withPtr, targets: { alpha: repinned("alpha", withPtr) }, names: ["alpha"] }),
      "alpha",
      /POLICY_VIOLATED: NO_PTR_REGION/,
    );
    // PTR_MARKERS_EMPTY, but the PTR region holds a body.
    const filled = mutated(MODULE_PATH, (t) =>
      t.replace("//gamma_ptr_apl_start\n", "//gamma_ptr_apl_start\nvoid gamma_ptr( player_t* p );\n"),
    );
    expectFails(
      batch({ files: filled, targets: { gamma: repinned("gamma", filled) }, names: ["gamma"] }),
      "gamma",
      /POLICY_VIOLATED: PTR_MARKERS_EMPTY/,
    );
    // PTR_BODY_IDENTICAL, but the bodies differ.
    const differs = mutated(MODULE_PATH, (t) =>
      t.replace(
        '  default_->add_action( "jab" );\n}\n//beta_ptr_apl_end',
        '  default_->add_action( "hook" );\n}\n//beta_ptr_apl_end',
      ),
    );
    expectFails(
      batch({ files: differs, targets: { beta: repinned("beta", differs) }, names: ["beta"] }),
      "beta",
      /POLICY_VIOLATED: PTR_BODY_IDENTICAL, but the bodies differ/,
    );
    // PTR_BODY_DIFFERS (ONB-D2): the same differing bodies pass under the policy that says so...
    const declared = (files: Files) =>
      ({
        ...repinned("beta", files),
        livePtrPolicy: { ...SYNTH.beta.livePtrPolicy, kind: "PTR_BODY_DIFFERS" },
      }) as AplExtractionTarget;
    expect(batch({ files: differs, targets: { beta: declared(differs) }, names: ["beta"] }).ok).toBe(true);
    // ...and identical bodies refuse it, because the stronger policy is the one to declare.
    expectFails(
      batch({ targets: { beta: declared(CLEAN) }, names: ["beta"] }),
      "beta",
      /POLICY_VIOLATED: PTR_BODY_DIFFERS, but the bodies are identical/,
    );
    // A policy that names an unknown kind.
    const unknown = {
      ...SYNTH.gamma,
      livePtrPolicy: { ...SYNTH.gamma.livePtrPolicy, kind: "PTR_PREFERRED" },
    } as unknown as AplExtractionTarget;
    expectFails(batch({ names: ["gamma"], targets: { gamma: unknown } }), "gamma", /MALFORMED_POLICY/);
  });

  it("unverified dispatch: absent sequence, duplicated sequence, wrong dispatch bytes", () => {
    const absent = mutated(DISPATCH_PATH, (t) =>
      t.replace("synth_apl::gamma( this );", "synth_apl::other( this );"),
    );
    expectFails(
      batch({ files: absent, targets: { gamma: repinned("gamma", absent) }, names: ["gamma"] }),
      "gamma",
      /DISPATCH_UNVERIFIED/,
    );
    const twice = mutated(DISPATCH_PATH, (t) =>
      t.replace("  }\n}", "    case SYNTH_GAMMA:\n      synth_apl::gamma( this );\n      break;\n  }\n}"),
    );
    expectFails(
      batch({ files: twice, targets: { gamma: repinned("gamma", twice) }, names: ["gamma"] }),
      "gamma",
      /DISPATCH_UNVERIFIED/,
    );
    expectFails(
      batch({ files: mutated(DISPATCH_PATH, (t) => `${t}\n`), names: ["gamma"] }),
      "gamma",
      /SOURCE_SHA256_MISMATCH: dispatch/,
    );
    const noCall = {
      ...SYNTH.gamma,
      dispatch: { ...SYNTH.gamma.dispatch, sequence: ["case SYNTH_GAMMA:", "break;"] },
    };
    expectFails(batch({ names: ["gamma"], targets: { gamma: noCall } }), "gamma", /MALFORMED_DISPATCH/);
  });

  it("an inert statement that is read, repeated, or whose proof does not hold", () => {
    const read = mutated(MODULE_PATH, (t) =>
      t.replace('add_action( "strike" )', 'add_action( "strike,if=unused_local" )'),
    );
    expectFails(
      batch({ files: read, targets: { alpha: repinned("alpha", read) }, names: ["alpha"] }),
      "alpha",
      /'unused_local' is referenced after/,
    );
    const twice = mutated(MODULE_PATH, (t) =>
      t.replace(
        "  std::vector<std::string> unused_local = p->get_unused();",
        "  std::vector<std::string> unused_local = p->get_unused();\n  std::vector<std::string> unused_local = p->get_unused();",
      ),
    );
    expectFails(
      batch({ files: twice, targets: { alpha: repinned("alpha", twice) }, names: ["alpha"] }),
      "alpha",
      /inert statement occurs 2 times/,
    );
    const overridden = mutated(
      DISPATCH_PATH,
      (t) => `${t}\nstd::vector<std::string> synth_t::get_unused() { return {}; }`,
    );
    const target = repinned("alpha", overridden);
    const proofs = target.inertStatements?.[0]?.proofs.map((proof) =>
      proof.sourcePath === DISPATCH_PATH ? { ...proof, ...pinnedFile(DISPATCH_PATH, overridden) } : proof,
    );
    const rebound = { ...target, inertStatements: [{ ...target.inertStatements![0]!, proofs: proofs! }] };
    expectFails(
      batch({ files: overridden, targets: { alpha: rebound }, names: ["alpha"] }),
      "alpha",
      /INERT_PROOF_FAILED: .* names 'get_unused'/,
    );
    // Without its declaration the statement is an unsupported construct, as before.
    const { inertStatements: _inert, ...undeclared } = SYNTH.alpha;
    expectFails(
      batch({ names: ["alpha"], targets: { alpha: undeclared as AplExtractionTarget } }),
      "alpha",
      /unsupported construct/,
    );
  });

  it("malformed marker specifications", () => {
    const target = { ...SYNTH.gamma, regionEnd: "gamma end" };
    expectFails(batch({ names: ["gamma"], targets: { gamma: target } }), "gamma", /MALFORMED_MARKER/);
    const mismatched = { ...SYNTH.gamma, regionEnd: "//beta_apl_end" };
    expectFails(
      batch({ names: ["gamma"], targets: { gamma: mismatched } }),
      "gamma",
      /start and end markers name different regions/,
    );
  });

  it("duplicate target names, duplicate regions, duplicate output paths, unknown and unpinned targets", () => {
    expectFails(batch({ names: ["alpha", "alpha"] }), "alpha", /DUPLICATE_TARGET/);
    expectFails(
      batch({ targets: { ...SYNTH, delta: SYNTH.gamma }, names: ["gamma", "delta"] }),
      "gamma",
      /DUPLICATE_REGION/,
    );
    const sameOut = { ...SYNTH.beta, defaultOut: "elsewhere/synth-gamma.apl.json" };
    expectFails(
      batch({ targets: { ...SYNTH, beta: sameOut }, names: ["beta", "gamma"], outDir: "out" }),
      "beta",
      /DUPLICATE_OUTPUT/,
    );
    expectFails(batch({ names: ["omega"] }), "omega", /UNKNOWN_TARGET/);
    expectFails(batch({ names: ["toString"] }), "toString", /UNKNOWN_TARGET/);
    expectFails(
      preflightBatch({
        targetNames: ["rogue-assassination"],
        read: readerOf(CLEAN),
        sha: COMMIT,
        extractedOn: "x",
        commitDate: "x",
        branch: "x",
      }) as ReturnType<typeof batch>,
      "rogue-assassination",
      /NOT_PINNED/,
    );
    expectFails(batch({ names: [] }), "", /NO_TARGETS/);
  });

  it("one failing target fails the whole batch", () => {
    const result = batch({
      files: mutated(DISPATCH_PATH, (t) => t.replace("synth_apl::gamma( this );", "")),
    });
    expect(result.results.find((r) => r.targetName === "alpha")?.ok).toBe(false); // the dispatch hash moved for all
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The filesystem: confinement, atomic writes, --check
// ---------------------------------------------------------------------------

const scratch: string[] = [];
afterAll(() => {
  for (const dir of scratch) rmSync(dir, { recursive: true, force: true });
});

function sourceRoot(files: Files = CLEAN): string {
  const root = mkdtempSync(join(tmpdir(), "wlc-d2c-src-"));
  scratch.push(root);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text, "utf8");
  }
  return root;
}

describe("source paths are confined to the source root", () => {
  it.each([
    ["../outside.cpp", /'\.\.' segment/],
    ["engine/../../outside.cpp", /'\.\.' segment/],
    ["/etc/passwd", /must be relative/],
    ["C:/Windows/win.ini", /must be relative/],
    ["engine\\class_modules\\x.cpp", /must be relative/],
    ["engine//x.cpp", /empty/],
    ["./engine/x.cpp", /'\.'/],
    ["", /non-empty/],
  ])("refuses %s", (path, pattern) => {
    expect(() => confinedSourcePath("root", path)).toThrow(ExtractionError);
    expect(() => confinedSourcePath("root", path)).toThrow(pattern);
  });

  it("a target whose path escapes the root fails as PATH_REFUSED, and reads nothing", () => {
    const root = sourceRoot();
    const target = repinned("gamma", CLEAN, { sourcePath: "../escape.cpp" });
    const escaping = { ...target, pinnedSource: { ...target.pinnedSource, sourcePath: "../escape.cpp" } };
    const result = preflightBatch({
      targetNames: ["gamma"],
      targets: { gamma: escaping },
      read: sourceRootReader(root),
      sha: COMMIT,
      extractedOn: "x",
      commitDate: "x",
      branch: "x",
    });
    expect(result.ok).toBe(false);
    expect(result.results[0]?.problems.join("\n")).toMatch(
      /PATH_REFUSED: module source path '\.\.\/escape\.cpp'/,
    );
  });

  it("refuses a source root that does not exist", () => {
    expect(() => sourceRootReader(join(tmpdir(), "wlc-d2c-does-not-exist"))).toThrow(/does not exist/);
  });
});

describe("writes are atomic", () => {
  it("a passing batch writes every artifact, byte-identically on a second run, and leaves no temporary file", () => {
    const root = sourceRoot();
    const outA = mkdtempSync(join(tmpdir(), "wlc-d2c-out-"));
    const outB = mkdtempSync(join(tmpdir(), "wlc-d2c-out-"));
    scratch.push(outA, outB);
    const run = (outDir: string) =>
      writeBatch(
        preflightBatch({
          targetNames: ["alpha", "beta", "gamma"],
          targets: SYNTH,
          read: sourceRootReader(root),
          sha: COMMIT,
          extractedOn: "2026-10-01",
          commitDate: "2026-09-12",
          branch: "midnight",
          outDir,
        }),
      );
    expect(run(outA)).toHaveLength(3);
    run(outB);
    expect(readdirSync(outA, { recursive: false, withFileTypes: false }).sort()).toEqual([
      "synth-alpha.apl.json",
      "synth-beta.apl.json",
      "synth-gamma.apl.json",
    ]);
    for (const file of readdirSync(outA, { recursive: false, withFileTypes: false })) {
      expect(readFileSync(join(outA, file), "utf8")).toBe(readFileSync(join(outB, file), "utf8"));
    }
  });

  it("a failing batch writes nothing, not even for its passing targets", () => {
    const root = sourceRoot(mutated(MODULE_PATH, (t) => `${t}\n// drift`));
    const outDir = join(mkdtempSync(join(tmpdir(), "wlc-d2c-out-")), "artifacts");
    scratch.push(dirname(outDir));
    const result = preflightBatch({
      targetNames: ["alpha", "beta", "gamma"],
      targets: SYNTH,
      read: sourceRootReader(root),
      sha: COMMIT,
      extractedOn: "2026-10-01",
      commitDate: "2026-09-12",
      branch: "midnight",
      outDir,
    });
    expect(result.ok).toBe(false);
    expect(() => writeBatch(result)).toThrow(/did not pass preflight; nothing is written/);
    expect(existsSync(outDir)).toBe(false);
  });

  it("the CLI's --check writes nothing, and a failed CLI batch writes nothing", () => {
    const root = sourceRoot();
    const outDir = join(mkdtempSync(join(tmpdir(), "wlc-d2c-cli-")), "artifacts");
    scratch.push(dirname(outDir));
    const cli = (args: readonly string[]) =>
      spawnSync(process.execPath, ["scripts/authority/extract-simc-apl.mjs", ...args], { encoding: "utf8" });
    // The real pinned target over a root that does not hold its pinned bytes: refused, nothing written.
    const failed = cli([
      "--targets",
      "warrior-fury",
      "--source-root",
      root,
      "--sha",
      COMMIT,
      "--out-dir",
      outDir,
      "--extracted-on",
      "2026-10-01",
    ]);
    expect(failed.status).toBe(1);
    expect(failed.stdout).toContain("MISSING_SOURCE: module engine/class_modules/apl/apl_warrior.cpp");
    expect(existsSync(outDir)).toBe(false);
    const checked = cli(["--targets", "warrior-fury", "--source-root", root, "--sha", COMMIT, "--check"]);
    expect(checked.status).toBe(1);
    expect(existsSync(outDir)).toBe(false);
    // Writing requires an explicit destination; --check is the only way to run without one.
    const noOut = cli(["--targets", "warrior-fury", "--source-root", root, "--sha", COMMIT]);
    expect(noOut.status).toBe(1);
    expect(noOut.stderr).toContain("--out-dir <dir> is required to write");
  });
});

// ---------------------------------------------------------------------------
// The registry: exactly the eight D2-C targets, pinned; the five earlier ones untouched
// ---------------------------------------------------------------------------

const D2C = {
  "warrior-arms": ["warrior", "arms", "NO_PTR_REGION", true],
  "warrior-fury": ["warrior", "fury", "NO_PTR_REGION", true],
  "warrior-protection": ["warrior", "protection", "NO_PTR_REGION", false],
  "deathknight-frost": ["deathknight", "frost", "NO_PTR_REGION", false],
  "demonhunter-havoc": ["demonhunter", "havoc", "PTR_MARKERS_EMPTY", false],
  "demonhunter-devourer": ["demonhunter", "devourer", "PTR_MARKERS_EMPTY", false],
  "rogue-subtlety": ["rogue", "subtlety", "NO_PTR_REGION", false],
  "hunter-survival": ["hunter", "survival", "PTR_BODY_IDENTICAL", false],
} as const;
/** ONB-D2's three targets, and the policy each declares. */
const ONB_D2_POLICIES = {
  "shaman-elemental": "PTR_BODY_IDENTICAL",
  "druid-balance": "PTR_SEPARATE_INCLUDE",
  "priest-shadow": "PTR_BODY_DIFFERS",
} as const;
const EARLIER = [
  "rogue-assassination",
  "paladin-protection",
  "paladin-retribution",
  "deathknight-blood",
  "monk-brewmaster",
];

describe("the registry", () => {
  it("holds exactly the five earlier targets, the eight D2-C targets, ONB-B2's Enhancement, ONB-C1's Feral, ONB-C2's Outlaw, ONB-D1's Destruction, ONB-D2's three, ONB-D3's two, ONB-D4's two, ONB-X1's one and ONB-X2's one", () => {
    // ONB-B2 is the audit this entry waited for: its list is a class method (onb-b2-class-method-extraction).
    // ONB-C1's list is an included file with a separate PTR file (onb-c1-included-file-extraction).
    expect(Object.keys(TARGETS).sort()).toEqual(
      [
        ...EARLIER,
        ...Object.keys(D2C),
        "shaman-enhancement",
        "druid-feral",
        "rogue-outlaw",
        "warlock-destruction",
        "shaman-elemental",
        "druid-balance",
        "priest-shadow",
        "mage-arcane",
        "mage-frost",
        "warlock-affliction",
        "hunter-marksmanship",
        "mage-fire",
        "evoker-devastation",
      ].sort(),
    );
  });

  it.each(Object.entries(D2C))(
    "%s is a well-formed pinned record against the pinned commit",
    (name, [cls, spec, policy, inert]) => {
      const target = TARGETS[name] as PinnedExtractionTarget;
      expect(validatePinnedRecord(name, target)).toEqual([]);
      expect(target.pinnedSource.commitSha).toBe(PINNED_SIMC_COMMIT);
      expect(target.spec).toEqual({ className: cls, specName: spec });
      expect(target.livePtrPolicy.kind).toBe(policy);
      expect(target.inertStatements !== undefined).toBe(inert);
      expect(target.clientVersion).toBeUndefined();
    },
  );

  it("Arms and Fury each carry their own inert record, naming their own region", () => {
    const arms = (TARGETS["warrior-arms"] as PinnedExtractionTarget).inertStatements?.[0];
    const fury = (TARGETS["warrior-fury"] as PinnedExtractionTarget).inertStatements?.[0];
    expect(arms).not.toBe(fury);
    expect(arms?.reason).toContain("the arms region");
    expect(fury?.reason).toContain("the fury region");
  });

  it("ONB-X2: Devastation's PTR region is an empty stub never dispatched, and the policy refuses anything more", () => {
    const target = TARGETS["evoker-devastation"] as PinnedExtractionTarget;
    expect(validatePinnedRecord("evoker-devastation", target)).toEqual([]);
    expect(target.livePtrPolicy.kind).toBe("PTR_STUB_NEVER_DISPATCHED");
    const module = [
      "//devastation_apl_start",
      "void devastation( player_t* p )",
      "{",
      "}",
      "//devastation_apl_end",
      "",
      "//devastation_ptr_apl_start",
      "void devastation_ptr( player_t* )",
      "{",
      "}",
      "//devastation_ptr_apl_end",
    ];
    const dispatch = "evoker_apl::devastation( this );";
    expect(() => verifyLivePtrPolicy(module, dispatch, target)).not.toThrow();
    // A body in the stub, which a later commit could use to build a list.
    const filled = module.map((line) => (line === "}" ? line : line));
    filled.splice(9, 0, '  default_->add_action( "azure_strike" );');
    expect(() => verifyLivePtrPolicy(filled, dispatch, target)).toThrow(
      /POLICY_VIOLATED: PTR_STUB_NEVER_DISPATCHED/,
    );
    // A dispatch that reaches it.
    expect(() => verifyLivePtrPolicy(module, "evoker_apl::devastation_ptr( this );", target)).toThrow(
      /POLICY_VIOLATED: PTR_STUB_NEVER_DISPATCHED/,
    );
    // No stub at all is another policy's shape.
    expect(() =>
      verifyLivePtrPolicy(
        module.filter((line) => !line.includes("_ptr(")),
        dispatch,
        target,
      ),
    ).toThrow(/POLICY_VIOLATED/);
  });

  it("ONB-D2's targets declare the relationship their bodies have", () => {
    for (const [name, kind] of Object.entries(ONB_D2_POLICIES)) {
      expect((TARGETS[name] as AplExtractionTarget).livePtrPolicy?.kind, name).toBe(kind);
    }
  });

  it("no two targets share a region or an output path", () => {
    const regions = Object.values(TARGETS).map(
      (t) => `${t.sourcePath}#${t.regionStart ?? t.enclosingNamespace ?? t.functionHeader}`,
    );
    expect(new Set(regions).size).toBe(regions.length);
    const outputs = Object.values(TARGETS).map((t) => t.defaultOut);
    expect(new Set(outputs).size).toBe(outputs.length);
  });

  it("the earlier targets carry no pinned record and keep extracting exactly as before", () => {
    for (const name of EARLIER) {
      const target = TARGETS[name] as AplExtractionTarget;
      expect(target.pinnedSource, name).toBeUndefined();
      expect(target.livePtrPolicy, name).toBeUndefined();
    }
  });

  it("no D2-C artifact is committed, except those an onboarding tranche has since extracted", () => {
    // ONB-A1 extracted demonhunter-havoc through this very path, and ONB-A2 its three followers.
    const EXTRACTED = [
      "deathknight-frost",
      "demonhunter-devourer",
      "demonhunter-havoc",
      "rogue-subtlety",
      "warrior-arms",
      "warrior-fury",
      "warrior-protection",
    ];
    for (const name of Object.keys(D2C))
      expect(existsSync(`src/simc/data/${name}.apl.json`), name).toBe(EXTRACTED.includes(name));
  });
});

// ---------------------------------------------------------------------------
// The runtime validator
// ---------------------------------------------------------------------------

describe("the runtime validator ties a pinned artifact back to its record", () => {
  const artifact = () =>
    structuredClone(batch({ names: ["alpha"] }).results[0]?.artifact) as Record<string, unknown>;
  const withProvenance = (patch: (p: Record<string, unknown>) => void) => {
    const a = artifact();
    patch(a["provenance"] as Record<string, unknown>);
    return a;
  };

  it("keeps the region hash, policy, dispatch source and inert statements", () => {
    const validation = validateAuthorityArtifact(artifact());
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.artifact.provenance.regionSha256).toBe(SYNTH.alpha.pinnedSource.regionSha256);
    expect(validation.artifact.provenance.livePtrPolicy).toBe("NO_PTR_REGION");
    expect(validation.artifact.provenance.dispatchSource).toEqual({
      sourcePath: DISPATCH_PATH,
      sourceSha256: SYNTH.alpha.dispatch.sha256,
    });
    expect(validation.artifact.provenance.inertStatements).toHaveLength(1);
  });

  it.each([
    ["no region hash", (p: Record<string, unknown>) => delete p["regionSha256"]],
    ["a malformed region hash", (p: Record<string, unknown>) => (p["regionSha256"] = "abc")],
    ["an unknown policy", (p: Record<string, unknown>) => (p["livePtrPolicy"] = "PTR_PREFERRED")],
    ["no dispatch source", (p: Record<string, unknown>) => delete p["dispatchSource"]],
    [
      "an extra dispatch field",
      (p: Record<string, unknown>) =>
        (p["dispatchSource"] = { sourcePath: "x", sourceSha256: "0".repeat(64), extra: 1 }),
    ],
    ["an empty inert list", (p: Record<string, unknown>) => (p["inertStatements"] = [])],
    [
      "an inert identifier the statement does not name",
      (p: Record<string, unknown>) =>
        (p["inertStatements"] = [{ sourceLine: 6, statement: "x = 1;", identifier: "y" }]),
    ],
    [
      "an inert statement on line 0",
      (p: Record<string, unknown>) =>
        (p["inertStatements"] = [{ sourceLine: 0, statement: "x = 1;", identifier: "x" }]),
    ],
  ])("refuses a partial or malformed tie-back: %s", (_label, patch) => {
    const validation = validateAuthorityArtifact(withProvenance(patch));
    expect(validation.ok).toBe(false);
    if (!validation.ok) expect(validation.reason).toBe("MALFORMED_PROVENANCE");
  });

  it.each([
    ["rogue-assassination", assassinationArtifact],
    ["paladin-protection", protectionArtifact],
    ["paladin-retribution", retributionArtifact],
    ["deathknight-blood", bloodArtifact],
    ["monk-brewmaster", brewmasterArtifact],
  ])("%s: the committed artifact validates exactly as before and carries no tie-back fields", (name, raw) => {
    const validation = validateAuthorityArtifact(raw);
    expect(validation.ok, name).toBe(true);
    if (!validation.ok) return;
    for (const key of ["regionSha256", "livePtrPolicy", "dispatchSource", "inertStatements"]) {
      expect(key in validation.artifact.provenance, `${name} ${key}`).toBe(false);
      expect(key in (raw as { provenance: object }).provenance, `${name} ${key}`).toBe(false);
    }
    expect(validation.artifact.provenance.commitSha).toBe(PINNED_SIMC_COMMIT);
    const target = TARGETS[name] as AplExtractionTarget;
    expect(validation.artifact.authorityId).toBe(target.authorityId);
    expect(validation.artifact.provenance.sourcePath).toBe(target.sourcePath);
  });

  it("buildArtifact adds the tie-back only to a pinned target", () => {
    const earlier = TARGETS["paladin-protection"] as AplExtractionTarget;
    const source = [
      "//protection_apl_start",
      "void protection( player_t* p )",
      "{",
      '  action_priority_list_t* default_ = p->get_action_priority_list( "default" );',
      '  default_->add_action( "shield_of_the_righteous" );',
      "}",
      "//protection_apl_end",
    ].join("\n");
    const built = buildArtifact({
      target: earlier,
      extracted: extract(source, earlier),
      sourceSha256: "0".repeat(64),
      sourceByteLength: source.length,
      sha: COMMIT,
      branch: "midnight",
      commitDate: "2026-09-12",
      extractedOn: "2026-10-01",
    }) as { provenance: Record<string, unknown> };
    expect(Object.keys(built.provenance)).not.toContain("regionSha256");
    expect(Object.keys(built.provenance).at(-1)).toBe("extractorVersion");
  });
});
