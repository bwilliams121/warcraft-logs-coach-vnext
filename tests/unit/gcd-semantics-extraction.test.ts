import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  buildArtifact,
  deriveGcdFieldIndex,
  formatArtifactJson,
  parseClassSpells,
  parseClientDataVersion,
  parseSpellRecords,
  sourceHashProblem,
  verifyRequiredFacts,
  type ClassSpellRow,
  type ClientDataVersion,
  type ParsedSpellRecord,
} from "../../scripts/authority/extract-simc-gcd.mjs";

/**
 * The GCD extractor's rules.
 *
 * The committed artifact was produced from the real 29 MB generated table at the
 * pinned commit; that file is far too large to commit, so what is tested here is
 * the EXTRACTOR — against inputs shaped exactly like the real ones. The values
 * it produced from the real file are re-asserted separately, against the
 * committed artifact, in `tests/contracts/m5c1-gcd-semantics.test.ts`.
 *
 * The rule these tests pin down is that the extractor fails rather than guesses.
 * A silently mis-read column would produce a lane classification that looks
 * authoritative and is wrong, which is worse than no classification at all.
 */

/** The `spell_data_t` scalar prefix, in the pinned declaration order. */
const SPELL_DATA_FIELDS = [
  "_name",
  "_id",
  "_school",
  "_prj_speed",
  "_prj_delay",
  "_prj_min_duration",
  "_race_mask",
  "_class_mask",
  "_max_scaling_level",
  "_min_scaling_level",
  "_scale_from_ilevel",
  "_spell_level",
  "_max_level",
  "_max_aura_level",
  "_min_range",
  "_max_range",
  "_cooldown",
  "_gcd",
  "_category_cooldown",
];

function header(fields: readonly string[] = SPELL_DATA_FIELDS): string {
  const members = fields
    .map((name) => (name === "_name" ? `  const char* ${name};   // name (enGB)` : `  unsigned    ${name};`))
    .join("\n");
  return [
    "struct spell_data_t;",
    "",
    "struct spelleffect_data_t;",
    "",
    "struct spell_data_t",
    "{",
    members,
    "  unsigned    _attributes[ NUM_SPELL_FLAGS ];",
    "",
    "  unsigned equipped_class() const",
    "  { return _equipped_class; }",
    "};",
  ].join("\n");
}

/** One generated `__spell_data` row with `_gcd` at flat index 16 after `_id`. */
function spellRow(abilityGameId: number, displayNameEn: string, gcdMs: number): string {
  const filler = Array.from({ length: 15 }, () => "0");
  const flat = [String(abilityGameId), ...filler, String(gcdMs), "0"];
  return `  { "${displayNameEn}", ${flat.join(", ")}, { 0, 0 } }, /* 1 */`;
}

function spellTable(rows: readonly string[]): string {
  return [
    "// 4 spells, wow build level 12.1.0.69587",
    "static spell_data_t __spell_data[4] = {",
    ...rows,
    "};",
  ].join("\n");
}

const CLIENT_DATA = [
  "#ifndef CLIENT_DATA_VERSION_INC",
  "#define CLIENT_DATA_VERSION_INC",
  "",
  '#define CLIENT_DATA_WOW_VERSION "12.1.0.69587"',
  '#define SIMC_WOW_VERSION "1210"',
  "",
  '#define CLIENT_DATA_HOTFIX_DATE "2026-09-10"',
  "#define CLIENT_DATA_HOTFIX_BUILD (69587)",
  '#define CLIENT_DATA_HOTFIX_HASH "98097f989dd3ee389dab97854be2a62f0f0b00c62d442668ea45332c6a2cd720"',
  "",
  "#endif",
].join("\n");

const CLASS_SPELLS = [
  "// Active class spells, wow build 12.1.0.69587",
  "static constexpr std::array<active_class_spell_t, 5> __active_spells_data { {",
  '  {  4,    0,    1766,       0, "Kick"    },',
  '  {  4,    0,    1784,       0, "Stealth" },',
  '  {  4,    0,    1856,       0, "Vanish"  },',
  '  {  4,    0,    8676,       0, "Ambush"  },',
  '  {  4,  259,   32645,  196819, "Envenom" },',
  "} };",
].join("\n");

/** The nine runtime records plus the three sanity anchors, at their real values. */
const REQUIRED_ROWS: readonly (readonly [number, string, number])[] = [
  [17, "Power Word: Shield", 1500],
  [53, "Backstab", 1000],
  [116, "Frostbolt", 1500],
  [1766, "Kick", 0],
  [1784, "Stealth", 0],
  [1856, "Vanish", 0],
  [8676, "Ambush", 1000],
  [32645, "Envenom", 1000],
  [360194, "Deathmark", 1000],
  [381623, "Thistle Tea", 0],
  [385627, "Kingsbane", 1000],
  [469779, "Thistle Tea", 0],
];

const ALL_WANTED = REQUIRED_ROWS.map(([id]) => id);

function completeTable(): string {
  return spellTable(REQUIRED_ROWS.map(([id, name, gcd]) => spellRow(id, name, gcd)));
}

function recordsFrom(text: string, wanted: readonly number[] = ALL_WANTED): Map<number, ParsedSpellRecord> {
  const parsed = parseSpellRecords(text, wanted, 16);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.records;
}

const BUILD: ClientDataVersion = {
  wowVersion: "12.1.0.69587",
  hotfixDate: "2026-09-10",
  hotfixBuild: 69587,
  hotfixHash: "98097f989dd3ee389dab97854be2a62f0f0b00c62d442668ea45332c6a2cd720",
};

const CLASS_ROWS: readonly ClassSpellRow[] = parseClassSpells(CLASS_SPELLS);

function verify(overrides: Partial<Parameters<typeof verifyRequiredFacts>[0]> = {}): readonly string[] {
  return verifyRequiredFacts({
    build: BUILD,
    records: recordsFrom(completeTable()),
    classSpells: CLASS_ROWS,
    gcdFieldIndex: 16,
    expectedGcdFieldIndex: 16,
    ...overrides,
  });
}

describe("the build stamp is read whole or not at all", () => {
  it("reads every pinned field", () => {
    const parsed = parseClientDataVersion(CLIENT_DATA);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value).toEqual(BUILD);
  });

  it.each([
    "CLIENT_DATA_WOW_VERSION",
    "CLIENT_DATA_HOTFIX_DATE",
    "CLIENT_DATA_HOTFIX_BUILD",
    "CLIENT_DATA_HOTFIX_HASH",
  ])("refuses a stamp missing %s", (macro) => {
    const stripped = CLIENT_DATA.split("\n")
      .filter((line) => !line.includes(macro))
      .join("\n");
    const parsed = parseClientDataVersion(stripped);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain(macro);
  });

  it("refuses a hotfix hash that is not a hash", () => {
    const parsed = parseClientDataVersion(CLIENT_DATA.replace(/"98097f[0-9a-f]+"/, '"not-a-hash"'));
    expect(parsed.ok).toBe(false);
  });
});

describe("the _gcd column index is derived, never assumed", () => {
  it("counts _gcd at flat index 16 from the pinned field order", () => {
    const derived = deriveGcdFieldIndex(header());
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.index).toBe(16);
    expect(derived.fields[0]).toBe("_name");
    expect(derived.fields[1]).toBe("_id");
  });

  it("skips the forward declaration and reads the definition", () => {
    // `struct spell_data_t;` appears before the definition in the real header.
    // Starting there would read an unrelated block, silently.
    const derived = deriveGcdFieldIndex(header());
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.fields).toContain("_gcd");
  });

  it("does not mistake a trailing comment for a method declaration", () => {
    // The real `_name` line ends with `// ... stringblock (enGB)`. An unstripped
    // parenthesis there would end the scan on the very first member.
    const derived = deriveGcdFieldIndex(header());
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.fields.length).toBeGreaterThan(10);
  });

  it("REPORTS A SHIFTED INDEX when a field is inserted upstream", () => {
    // The failure this guard exists for: one new member before `_gcd` and every
    // extracted value silently becomes the neighbouring column.
    const shifted = [...SPELL_DATA_FIELDS];
    shifted.splice(3, 0, "_new_upstream_field");
    const derived = deriveGcdFieldIndex(header(shifted));
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    expect(derived.index).toBe(17);

    const problems = verify({ gcdFieldIndex: derived.index });
    expect(problems.join("\n")).toContain("struct layout moved");
  });

  it("refuses a header with no definition at all", () => {
    const derived = deriveGcdFieldIndex("struct spell_data_t;\n");
    expect(derived.ok).toBe(false);
  });
});

describe("spell rows are read by number", () => {
  it("extracts name and base GCD for every wanted id", () => {
    const records = recordsFrom(completeTable());
    expect(records.size).toBe(REQUIRED_ROWS.length);
    for (const [abilityGameId, displayNameEn, baseGcdMs] of REQUIRED_ROWS) {
      expect(records.get(abilityGameId)).toEqual({ abilityGameId, displayNameEn, baseGcdMs });
    }
  });

  it("ignores rows it was not asked about", () => {
    const records = recordsFrom(completeTable(), [32645]);
    expect([...records.keys()]).toEqual([32645]);
  });

  it("REFUSES a wanted id that appears twice", () => {
    // Two rows claiming one id cannot be reduced to one reading, and picking
    // either would be a guess wearing the shape of an extraction.
    const table = spellTable([spellRow(32645, "Envenom", 1000), spellRow(32645, "Envenom", 0)]);
    const parsed = parseSpellRecords(table, [32645], 16);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain("32645");
    expect(parsed.error).toContain("ambiguous");
  });

  it("REFUSES a row whose _gcd column is not a whole number", () => {
    // Built positionally rather than by hand: `_gcd` must land on index 16, and
    // a miscounted literal would make this test pass for the wrong reason.
    const filler = Array.from({ length: 15 }, () => "0");
    const broken = `  { "Envenom", 32645, ${filler.join(", ")}, 0.5, 0, { 0 } },`;
    const parsed = parseSpellRecords(spellTable([broken]), [32645], 16);
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.error).toContain("0.5");
  });
});

describe("class spell rows cross-check the class-ability bindings", () => {
  it("parses classId, specId, spellId, replacement and name", () => {
    expect(CLASS_ROWS).toHaveLength(5);
    expect(CLASS_ROWS.find((row) => row.spellId === 8676)).toEqual({
      classId: 4,
      specId: 0,
      spellId: 8676,
      replacesSpellId: 0,
      displayNameEn: "Ambush",
    });
    // Envenom is spec-scoped and replaces another spell; both are preserved.
    expect(CLASS_ROWS.find((row) => row.spellId === 32645)?.specId).toBe(259);
    expect(CLASS_ROWS.find((row) => row.spellId === 32645)?.replacesSpellId).toBe(196819);
  });

  it("FAILS when a declared class-ability binding has no row", () => {
    const withoutAmbush = CLASS_ROWS.filter((row) => row.spellId !== 8676);
    const problems = verify({ classSpells: withoutAmbush });
    expect(problems.join("\n")).toContain("8676");
    expect(problems.join("\n")).toContain("class_spells.inc has no such row");
  });
});

describe("required facts are verified against the data, not assumed", () => {
  it("passes when every fact holds", () => {
    expect(verify()).toEqual([]);
  });

  it("FAILS when a required id is absent", () => {
    const withoutThistleTea = spellTable(
      REQUIRED_ROWS.filter(([id]) => id !== 469779).map(([id, name, gcd]) => spellRow(id, name, gcd)),
    );
    const problems = verify({ records: recordsFrom(withoutThistleTea) });
    expect(problems.join("\n")).toContain("469779");
    expect(problems.join("\n")).toContain("absent from the spell data");
  });

  it("FAILS when an extracted GCD disagrees with the recorded expectation", () => {
    // The stop condition that matters most: if a Thistle Tea record ever became
    // GCD-consuming, the lane invariance the milestone rests on would be void.
    const flipped = spellTable(
      REQUIRED_ROWS.map(([id, name, gcd]) => spellRow(id, name, id === 381623 ? 1000 : gcd)),
    );
    const problems = verify({ records: recordsFrom(flipped) });
    expect(problems.join("\n")).toContain("381623");
    expect(problems.join("\n")).toContain("expected 0ms");
  });

  it("FAILS when a sanity anchor comes out wrong", () => {
    const wrongAnchor = spellTable(
      REQUIRED_ROWS.map(([id, name, gcd]) => spellRow(id, name, id === 53 ? 9999 : gcd)),
    );
    const problems = verify({ records: recordsFrom(wrongAnchor) });
    expect(problems.join("\n")).toContain("column index is probably wrong");
  });

  it("FAILS when a required spell is renamed upstream", () => {
    const renamed = spellTable(
      REQUIRED_ROWS.map(([id, name, gcd]) => spellRow(id, id === 8676 ? "Ambush (New)" : name, gcd)),
    );
    const problems = verify({ records: recordsFrom(renamed) });
    expect(problems.join("\n")).toContain("expected 'Ambush'");
  });

  it("FAILS when the client build moves", () => {
    const problems = verify({ build: { ...BUILD, wowVersion: "12.2.0.70000" } });
    expect(problems.join("\n")).toContain("12.2.0.70000");
  });
});

describe("the artifact body is deterministic", () => {
  const ROGUE_MODULE_HASH = "c".repeat(64);
  const sources = [
    { path: "engine/dbc/generated/sc_spell_data.inc", sha256: "a".repeat(64), byteLength: 10 },
    { path: "engine/class_modules/sc_rogue.cpp", sha256: ROGUE_MODULE_HASH, byteLength: 20 },
  ];

  function build(): unknown {
    const anchors = new Set([17, 53, 116]);
    const records = new Map([...recordsFrom(completeTable())].filter(([id]) => !anchors.has(id)));
    return buildArtifact({
      commitSha: "0".repeat(40),
      sources,
      build: BUILD,
      records,
      extractedOn: "2026-09-12",
    });
  }

  it("REFUSES to build without a measured sc_rogue.cpp hash", () => {
    // Hand-reviewed bindings are only auditable if the bytes they were read from
    // can be re-identified. Emitting one without that hash would produce
    // provenance nobody can check.
    const anchors = new Set([17, 53, 116]);
    const records = new Map([...recordsFrom(completeTable())].filter(([id]) => !anchors.has(id)));
    expect(() =>
      buildArtifact({
        commitSha: "0".repeat(40),
        sources: [sources[0]!],
        build: BUILD,
        records,
        extractedOn: "2026-09-12",
      }),
    ).toThrow(/sc_rogue\.cpp/);
  });

  it("labels the two halves with DIFFERENT provenance methods", () => {
    const artifact = build() as {
      provenance: { abilityDataMethod: string };
      tokenBindings: { binding: { method: string; sourceSha256: string; sourcePath: string } }[];
    };
    expect(artifact.provenance.abilityDataMethod).toBe("MACHINE_EXTRACTED_DBC_RECORD");
    for (const entry of artifact.tokenBindings) {
      expect(entry.binding.method).toBe("HAND_REVIEWED_CPP_CONTROL_FLOW");
      expect(entry.binding.sourcePath).toBe("engine/class_modules/sc_rogue.cpp");
      // MEASURED, not transcribed: it comes from the hashed source list.
      expect(entry.binding.sourceSha256).toBe(ROGUE_MODULE_HASH);
    }
  });

  it("produces byte-identical output for identical inputs", () => {
    expect(JSON.stringify(build())).toBe(JSON.stringify(build()));
  });

  it("orders abilities by ascending numeric id regardless of discovery order", () => {
    const artifact = build() as { abilities: { abilityGameId: number }[] };
    const ids = artifact.abilities.map((entry) => entry.abilityGameId);
    expect(ids).toEqual([...ids].sort((left, right) => left - right));
    expect(ids).toHaveLength(9);
  });

  it("excludes the sanity anchors from the runtime slice", () => {
    // They prove the column; they are not part of the supported slice and must
    // not appear as if the analyzer models a Priest shield.
    const artifact = build() as { abilities: { abilityGameId: number }[] };
    expect(artifact.abilities.map((entry) => entry.abilityGameId)).not.toContain(17);
  });

  it("stores no derived lane on any record", () => {
    const artifact = build() as { abilities: Record<string, unknown>[] };
    for (const record of artifact.abilities) {
      expect(Object.keys(record)).toEqual(["abilityGameId", "baseGcdMs", "displayNameEn"]);
    }
  });
});

describe("the source hash gate", () => {
  const PATH = "engine/dbc/generated/sc_spell_data.inc";
  const PINNED = "d8e3d1970520f2161de6d5a59aa5ea0e7c81eaef14c6bc980d5a208ed33b4c62";

  it("accepts a file whose hash is the pinned one", () => {
    expect(sourceHashProblem(PATH, PINNED, PINNED)).toBeNull();
  });

  it("REFUSES a file whose hash is not the pinned one", () => {
    const problem = sourceHashProblem(PATH, PINNED, "b".repeat(64));
    expect(problem).not.toBeNull();
    expect(problem).toContain("SHA-256 mismatch");
    expect(problem).toContain(PATH);
    expect(problem).toContain(PINNED);
  });

  it("accepts an ABSENT expectation, which is how a re-pin learns the new hash", () => {
    expect(sourceHashProblem(PATH, undefined, "b".repeat(64))).toBeNull();
    // `--expect-...` with no value parses to `true`; that is not an expectation.
    expect(sourceHashProblem(PATH, true, "b".repeat(64))).toBeNull();
  });
});

describe("the generated JSON is already Prettier-clean", () => {
  it("collapses a short integer array onto one line", () => {
    // `JSON.stringify(..., 2)` splits every element onto its own line; Prettier
    // keeps a short array inline. Emitting the stringify form would make the
    // documented reproduce command produce a file that fails `prettier --check`.
    const json = formatArtifactJson({ candidateAbilityGameIds: [381623, 469779] });
    expect(json).toContain('"candidateAbilityGameIds": [381623, 469779]');
  });

  it("collapses a single-element array too", () => {
    expect(formatArtifactJson({ ids: [1766] })).toContain('"ids": [1766]');
  });

  it("leaves arrays of objects alone", () => {
    const json = formatArtifactJson({ abilities: [{ abilityGameId: 1 }, { abilityGameId: 2 }] });
    expect(json).toContain('"abilityGameId": 1');
    expect(json.split("\n").length).toBeGreaterThan(4);
  });

  it("leaves an over-width array WRAPPED, because Prettier would", () => {
    // Guessing inline here would produce a file Prettier immediately rewraps.
    const many = Array.from({ length: 40 }, (_, index) => 1_000_000 + index);
    const json = formatArtifactJson({ candidateAbilityGameIds: many });
    for (const line of json.split("\n")) {
      expect(line.length).toBeLessThanOrEqual(110);
    }
  });

  it("does not try to wrap a long string value", () => {
    // Prettier cannot break a JSON string literal, so a long one is correct as
    // is. An over-eager width check here would reject a legitimate artifact.
    const note = `x${"y".repeat(300)}`;
    expect(formatArtifactJson({ applicabilityNote: note })).toContain(note);
  });

  it("ends with exactly one trailing newline", () => {
    const json = formatArtifactJson({ a: 1 });
    expect(json.endsWith("}\n")).toBe(true);
    expect(json.endsWith("}\n\n")).toBe(false);
  });
});

describe("the committed artifact is the one this extractor describes", () => {
  it("is byte-identical to what the extractor would write for it", () => {
    // Reproducibility, asserted rather than asserted-about: re-serialising the
    // committed content through the extractor's own formatter must reproduce the
    // file exactly. A hand-edit, or a formatter change, breaks this.
    const onDisk = readFileSync("src/data/game/rogue-gcd-semantics.json", "utf8");
    expect(formatArtifactJson(JSON.parse(onDisk) as unknown)).toBe(onDisk);
  });

  it("records the four pinned sources with their hashes", () => {
    const committed = JSON.parse(readFileSync("src/data/game/rogue-gcd-semantics.json", "utf8")) as {
      provenance: { sources: { path: string; sha256: string }[] };
    };
    expect(committed.provenance.sources.map((source) => source.path)).toEqual([
      "engine/dbc/generated/sc_spell_data.inc",
      "engine/dbc/generated/class_spells.inc",
      "engine/dbc/generated/client_data_version.inc",
      "engine/dbc/spell_data.hpp",
      // Hashed only, so the hand-reviewed token bindings can be re-checked
      // against the exact bytes they were read from. Never parsed.
      "engine/class_modules/sc_rogue.cpp",
    ]);
    for (const source of committed.provenance.sources) {
      expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
