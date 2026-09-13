/**
 * The DoT-duration extractor's rules, and the artifact validator's refusals.
 *
 * The extractor itself is a manual script; these tests exercise its pure
 * parsers, because the rules they encode are what stop a plausible-but-wrong
 * number from reaching runtime. A wrong `_duration` column does not crash — it
 * yields a number, and every `remains<=` comparison downstream keeps working.
 */

import { describe, expect, it } from "vitest";

import {
  deriveScalarFieldIndices,
  parseSpellRecords,
  parseSpecializationSpells,
  parseClientDataVersion,
  readMillisecondColumn,
  resolveSpecializationSpell,
  sourceHashProblem,
} from "../../scripts/authority/extract-simc-dot-durations.mjs";
import {
  validateDotDurationArtifact,
  DOT_DURATION_UNITS,
  FORBIDDEN_DERIVED_DOT_KEYS,
} from "../../src/data/game/dot-duration-artifact.js";
import artifact from "../../src/data/game/rogue-dot-durations.json";

/** The pinned struct, trimmed to the members the row parser counts. */
const SPELL_DATA_HPP = `
struct spell_data_t;

struct spell_data_t
{
  const char* _name;               // Spell name from Spell.dbc stringblock (enGB)
  unsigned    _id;                 // Spell ID in dbc
  unsigned    _school;             // Spell school mask
  double      _prj_speed;          // Projectile Speed
  unsigned    _cooldown;           // Cooldown in milliseconds
  unsigned    _gcd;                // GCD in milliseconds
  double      _duration;           // Spell duration in milliseconds
  unsigned    _attributes[ NUM_SPELL_FLAGS ];
  unsigned    _stance_mask;
  timespan_t cooldown() const { return timespan_t::from_millis( _cooldown ); }
};
`;

describe("the field layout is derived, never assumed", () => {
  it("counts scalar members from _id, stopping at the first array", () => {
    const result = deriveScalarFieldIndices(SPELL_DATA_HPP, ["_duration", "_cooldown", "_gcd"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.indices).toEqual({ _cooldown: 3, _gcd: 4, _duration: 5 });
    // `_stance_mask` sits after the array and is therefore NOT part of the flat
    // comma-separated prefix a generated row exposes.
    expect(result.fields).not.toContain("_stance_mask");
  });

  it("skips the forward declaration and reads the DEFINITION", () => {
    // `struct spell_data_t;` appears first. Starting there would read the wrong
    // block entirely — silently, which is the outcome this rule exists to stop.
    const result = deriveScalarFieldIndices(SPELL_DATA_HPP, ["_id"]);
    expect(result.ok).toBe(true);
  });

  it("does not mistake a trailing comment for a method declaration", () => {
    // `const char* _name; // ... (enGB)` contains a parenthesis. Stripping
    // comments before the method test is what keeps the scan alive past line 1.
    const result = deriveScalarFieldIndices(SPELL_DATA_HPP, ["_duration"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.indices["_duration"]).toBe(5);
  });

  it("fails rather than guessing when a requested member is absent", () => {
    const result = deriveScalarFieldIndices(SPELL_DATA_HPP, ["_pandemic_window"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("_pandemic_window");
  });

  it("fails when the struct is only forward-declared", () => {
    const result = deriveScalarFieldIndices("struct spell_data_t;\n", ["_duration"]);
    expect(result.ok).toBe(false);
  });
});

describe("a millisecond column is read faithfully", () => {
  it("accepts both the integer and the double printing", () => {
    expect(readMillisecondColumn("18000", "_duration", 703)).toEqual({ ok: true, value: 18_000 });
    expect(readMillisecondColumn("18000.000000", "_duration", 703)).toEqual({ ok: true, value: 18_000 });
  });

  it("READS the -1 permanent-aura sentinel rather than refusing to parse it", () => {
    // Stealth (1784) carries `-1`: it lasts until something breaks it. The
    // parser's job is to report the column; deciding a sentinel is unusable
    // belongs to the verifier, and collapsing those two steps is how a sentinel
    // becomes a magnitude.
    expect(readMillisecondColumn("-1", "_duration", 1_784)).toEqual({ ok: true, value: -1 });
  });

  it("refuses a fractional millisecond rather than rounding it", () => {
    const result = readMillisecondColumn("18000.5", "_duration", 703);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("will not round");
  });

  it("refuses a missing or non-numeric column", () => {
    expect(readMillisecondColumn(undefined, "_duration", 703).ok).toBe(false);
    expect(readMillisecondColumn("0x0000a091", "_duration", 703).ok).toBe(false);
    expect(readMillisecondColumn("", "_duration", 703).ok).toBe(false);
  });
});

describe("the token is bound through the specialization spell table", () => {
  const ROWS = `
  {  4,  259,     703,      0, "Garrote"                           , 0 },
  {  4,  260,     703,      0, "Garrote"                           , 0 },
  {  4,  259,    1943,      0, "Rupture"                           , 0 },
`;

  it("resolves a name for the acting class and spec only", () => {
    const rows = parseSpecializationSpells(ROWS);
    const resolved = resolveSpecializationSpell(rows, "Garrote");
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    // Spec 260 is Outlaw. Matching it would have bound the wrong row even though
    // the id happens to agree here.
    expect(resolved.row.specId).toBe(259);
    expect(resolved.row.spellId).toBe(703);
  });

  it("fails rather than picking when a name is absent", () => {
    const rows = parseSpecializationSpells(ROWS);
    const resolved = resolveSpecializationSpell(rows, "Kingsbane");
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.error).toContain("Kingsbane");
  });

  it("fails rather than picking when a name is ambiguous within the spec", () => {
    const ambiguous = `
  {  4,  259,     703,      0, "Garrote"                           , 0 },
  {  4,  259,  360830,      0, "Garrote"                           , 0 },
`;
    const resolved = resolveSpecializationSpell(parseSpecializationSpells(ambiguous), "Garrote");
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.error).toContain("2 specialization spells");
  });
});

describe("spell rows are matched by id, never by name", () => {
  // Two rows genuinely named "Garrote" in the pinned table. This is exactly why
  // the binding runs through ids.
  const TABLE = `
  { "Garrote"                           ,     703, 1, 0.000000,    6000, 1000, 18000, 0, },
  { "Garrote"                           ,  360830, 1, 0.000000,       0,    0, 18000, 0, },
  { "Stealth"                           ,    1784, 1, 0.000000,    2000,    0,    -1, 0, },
`;
  const INDICES = { _cooldown: 3, _gcd: 4, _duration: 5 };

  it("extracts the requested id and leaves its namesake alone", () => {
    const result = parseSpellRecords(TABLE, [703], INDICES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const garrote = result.records.get(703);
    expect(garrote?.baseDurationMs).toBe(18_000);
    expect(garrote?.baseCooldownMs).toBe(6_000);
    expect(garrote?.baseGcdMs).toBe(1_000);
    expect(result.records.has(360_830)).toBe(false);
  });

  it("carries the -1 sentinel through to the verifier", () => {
    const result = parseSpellRecords(TABLE, [1_784], INDICES);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.records.get(1_784)?.baseDurationMs).toBe(-1);
  });

  it("reports a repeated id as ambiguous rather than choosing one", () => {
    const duplicated = `${TABLE}  { "Garrote Impostor"                  ,     703, 1, 0.000000,    9999, 1000,  9999, 0, },\n`;
    const result = parseSpellRecords(duplicated, [703], INDICES);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("703");
  });
});

describe("the build stamp is complete or it is an error", () => {
  it("names every missing macro", () => {
    const result = parseClientDataVersion('#define CLIENT_DATA_WOW_VERSION "12.1.0.69587"\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("CLIENT_DATA_HOTFIX_DATE");
    expect(result.error).toContain("CLIENT_DATA_HOTFIX_BUILD");
    expect(result.error).toContain("CLIENT_DATA_HOTFIX_HASH");
  });
});

describe("the pinned-hash gate", () => {
  it("accepts an absent expectation, which is how a re-pin discovers a new hash", () => {
    expect(sourceHashProblem("a/b.inc", undefined, "abc")).toBeNull();
  });

  it("never accepts a mismatched one", () => {
    expect(sourceHashProblem("a/b.inc", "expected", "actual")).toContain("SHA-256 mismatch");
  });
});

describe("the committed artifact validates", () => {
  it("loads, and carries the Garrote fact C3a needs", () => {
    const validation = validateDotDurationArtifact(artifact);
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    const garrote = validation.artifact.dots.find((dot) => dot.simcToken === "garrote");
    expect(garrote?.abilityGameId).toBe(703);
    expect(garrote?.baseDurationMs).toBe(18_000);
  });

  it("refuses an artifact whose declared units moved", () => {
    // THE dangerous field. A milliseconds value read as seconds turns an
    // 18-second Garrote into five hours, which satisfies every `remains<=`
    // threshold in the pinned APL and never once looks wrong.
    const mutated = {
      ...(artifact as Record<string, unknown>),
      provenance: {
        ...(artifact as { provenance: Record<string, unknown> }).provenance,
        durationFieldUnits: "SECONDS",
      },
    };
    const validation = validateDotDurationArtifact(mutated);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.reason).toBe("UNSUPPORTED_DURATION_UNITS");
    expect(DOT_DURATION_UNITS).toBe("MILLISECONDS");
  });

  it("refuses a non-positive duration, so a permanent aura cannot anchor a remainder", () => {
    const mutated = {
      ...(artifact as Record<string, unknown>),
      dots: [{ ...(artifact as { dots: Record<string, unknown>[] }).dots[0], baseDurationMs: -1 }],
    };
    const validation = validateDotDurationArtifact(mutated);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.reason).toBe("MALFORMED_DOT");
  });

  it.each(FORBIDDEN_DERIVED_DOT_KEYS)("refuses a dataset that bakes in '%s'", (forbidden) => {
    // Each of these depends on a fight moment, an actor, or a model this project
    // has not built. Baking one in turns a per-decision derivation into a
    // constant nobody re-checks.
    const mutated = {
      ...(artifact as Record<string, unknown>),
      dots: [{ ...(artifact as { dots: Record<string, unknown>[] }).dots[0], [forbidden]: 1 }],
    };
    const validation = validateDotDurationArtifact(mutated);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.reason).toBe("MALFORMED_DOT");
    expect(validation.detail).toContain(forbidden);
  });

  it("refuses an unsupported artifact version rather than reading it optimistically", () => {
    const mutated = { ...(artifact as Record<string, unknown>), artifactVersion: 2 };
    const validation = validateDotDurationArtifact(mutated);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.reason).toBe("UNSUPPORTED_ARTIFACT_VERSION");
  });

  it("refuses a binding whose source hash is not a hash", () => {
    const dots = (artifact as { dots: Record<string, unknown>[] }).dots;
    const mutated = {
      ...(artifact as Record<string, unknown>),
      dots: [
        {
          ...dots[0],
          binding: { ...(dots[0]?.["binding"] as Record<string, unknown>), bindingSourceSha256: "nope" },
        },
      ],
    };
    const validation = validateDotDurationArtifact(mutated);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.reason).toBe("MALFORMED_BINDING");
  });
});
