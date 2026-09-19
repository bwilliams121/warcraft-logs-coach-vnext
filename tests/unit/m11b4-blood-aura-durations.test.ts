/**
 * M11-B4: the pinned Blood aura-duration artifact and its extractor's rules.
 *
 * The committed artifact is validated as-is and its five entries pinned to
 * the values the pinned SimulationCraft data resolves — Bone Shield 30 s,
 * Essence of the Blood Queen 25 s WITH the specialization-passive modifier
 * that lifts the 20 s table value, Crimson Scourge 15 s, Visceral Strength
 * 12 s, Vampiric Strike PERMANENT. Then the validator's refusals: a remains
 * model this build cannot apply, a unit that is not milliseconds, a missing
 * or build-dependent or percentage modifier, a final duration that does not
 * follow from its parts, a derived field baked in. Then the extractor's pure
 * matchers over synthetic table rows.
 */

import { describe, expect, it } from "vitest";

import {
  durationModifiersFor,
  hasAttribute,
  parseEffectRows,
  parseEnumerators,
  parseLabelRows,
  parseSpecializationSpells,
  parseSpellRows,
} from "../../scripts/authority/extract-simc-blood-aura-durations.mjs";
import artifact from "../../src/data/game/deathknight-blood-aura-durations.json";
import rogueDotArtifact from "../../src/data/game/rogue-dot-durations.json";
import {
  BLOOD_AURA_REMAINS_MODELS,
  FORBIDDEN_DERIVED_AURA_KEYS,
  validateBloodAuraDurationArtifact,
} from "../../src/data/game/deathknight-blood-aura-duration-artifact.js";
import {
  bloodAuraDurationForAbilityGameId,
  bloodAuraDurationForAtom,
  pinnedBloodAuraDurations,
} from "../../src/data/game/deathknight-blood-aura-durations.js";
import { SC_DEATH_KNIGHT_CPP_SHA256 } from "../../src/data/game/deathknight-blood-aura-authority.js";
import { SUPPORTED_BLOOD_REMAINS_ATOMS } from "../../src/specs/deathknight/blood/aura-remains.js";

type Artifact = Record<string, unknown>;
const clone = (): Artifact => JSON.parse(JSON.stringify(artifact)) as Artifact;
const aurasOf = (value: Artifact) => value["auras"] as Record<string, unknown>[];
const auraOf = (value: Artifact, atom: string) => {
  const found = aurasOf(value).find((entry) => entry["atomName"] === atom);
  if (found === undefined) throw new Error(`no aura ${atom}`);
  return found;
};

describe("the committed artifact", () => {
  it("validates, and loads through the runtime module", () => {
    const validation = validateBloodAuraDurationArtifact(artifact);
    expect(validation.ok).toBe(true);
    expect(pinnedBloodAuraDurations().ok).toBe(true);
  });

  it("pins the commit, the build, the unit and the source hashes the other pinned artifacts already record", () => {
    expect(artifact.provenance.commitSha).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    expect(artifact.provenance.clientDataWowVersion).toBe("12.1.0.69587");
    expect(artifact.provenance.durationFieldName).toBe("_duration");
    expect(artifact.provenance.durationFieldUnits).toBe("MILLISECONDS");
    const bySource = new Map(artifact.provenance.sources.map((source) => [source.path, source.sha256]));
    // The same bytes the DoT artifact was extracted from.
    for (const source of rogueDotArtifact.provenance.sources) {
      if (bySource.has(source.path)) expect(bySource.get(source.path)).toBe(source.sha256);
    }
    expect(bySource.get("engine/dbc/generated/sc_spell_data.inc")).toBe(
      "d8e3d1970520f2161de6d5a59aa5ea0e7c81eaef14c6bc980d5a208ed33b4c62",
    );
    // The same Death Knight module the aura identities were read against.
    expect(bySource.get("engine/class_modules/sc_death_knight.cpp")).toBe(SC_DEATH_KNIGHT_CPP_SHA256);
    expect(bySource.has("engine/buff/buff.cpp")).toBe(true);
    expect(bySource.has("engine/dbc/data_enums.hh")).toBe(true);
    expect(bySource.has("engine/dbc/generated/specialization_spells.inc")).toBe(true);
    // The enumerators were READ, and are the ones the refresh rule depends on.
    expect(artifact.provenance.enumerators).toMatchObject({
      SX_REFRESH_EXTENDS_DURATION: 436,
      SX_AURA_DOES_NOT_REFRESH: 489,
      SX_PASSIVE: 6,
      A_ADD_FLAT_LABEL_MODIFIER: 219,
      P_DURATION: 1,
    });
  });

  it("carries exactly the five auras the slice reads, each with the mechanically derived duration and model", () => {
    expect(artifact.auras.map((aura) => aura.atomName)).toEqual([...SUPPORTED_BLOOD_REMAINS_ATOMS]);
    const expected: Record<
      string,
      { id: number; base: number; final: number; model: string; maxStack: number }
    > = {
      bone_shield: {
        id: 195181,
        base: 30_000,
        final: 30_000,
        model: "FIXED_DURATION_RESET_ON_GAIN",
        maxStack: 10,
      },
      essence_of_the_blood_queen: {
        id: 433925,
        base: 20_000,
        final: 25_000,
        model: "FIXED_DURATION_RESET_ON_GAIN",
        maxStack: 5,
      },
      vampiric_strike: { id: 433899, base: -1, final: 0, model: "PERMANENT", maxStack: 0 },
      crimson_scourge: {
        id: 81141,
        base: 15_000,
        final: 15_000,
        model: "FIXED_DURATION_RESET_ON_GAIN",
        maxStack: 0,
      },
      visceral_strength: {
        id: 461130,
        base: 12_000,
        final: 12_000,
        model: "FIXED_DURATION_RESET_ON_GAIN",
        maxStack: 0,
      },
    };
    for (const [atom, facts] of Object.entries(expected)) {
      const aura = bloodAuraDurationForAtom(atom);
      expect(aura, atom).not.toBeNull();
      if (aura === null) continue;
      expect(aura.abilityGameId).toBe(facts.id);
      expect(aura.baseDurationMs).toBe(facts.base);
      expect(aura.finalDurationMs).toBe(facts.final);
      expect(aura.remainsModel).toBe(facts.model);
      expect(aura.maxStack).toBe(facts.maxStack);
      expect(aura.refreshAttributes).toEqual({
        refreshExtendsDuration: false,
        auraDoesNotRefresh: false,
        periodicEffectSubtypes: [],
      });
      expect(aura.refreshBehavior).toBe(facts.model === "PERMANENT" ? "NONE" : "DURATION");
      expect(bloodAuraDurationForAbilityGameId(facts.id)?.atomName).toBe(atom);
    }
    expect(bloodAuraDurationForAtom("exterminate")).toBeNull();
    expect(bloodAuraDurationForAbilityGameId(1)).toBeNull();
  });

  it("records Essence of the Blood Queen's +5,000 ms as a LABEL modifier from the Blood specialization passive, with its provenance", () => {
    const essence = bloodAuraDurationForAtom("essence_of_the_blood_queen");
    expect(essence?.durationModifiers).toEqual([
      {
        effectId: 1187090,
        spellId: 137008,
        spellDisplayNameEn: "Blood Death Knight",
        effectIndex: 16,
        effectSubtype: 219,
        kind: "FLAT_MS",
        valueMs: 5000,
        matchedBy: "LABEL",
        label: 3134,
        applicability: "BLOOD_SPECIALIZATION_PASSIVE",
        applicabilityBasis: expect.stringContaining(
          "specialization_spells.inc { 6, 250, 137008",
        ) as unknown as string,
      },
    ]);
    // Bone Shield carries none: its 30 s is the table value unchanged.
    expect(bloodAuraDurationForAtom("bone_shield")?.durationModifiers).toEqual([]);
    expect(bloodAuraDurationForAtom("bone_shield")?.internalCooldownMs).toBe(2500);
  });

  it("carries a hand-review record naming the pinned creation, producer and consumer lines for every aura", () => {
    for (const aura of artifact.auras) {
      expect(aura.review.sourcePath).toBe("engine/class_modules/sc_death_knight.cpp");
      expect(aura.review.sourceSha256).toBe(SC_DEATH_KNIGHT_CPP_SHA256);
      expect(aura.review.creation).toMatch(/sc_death_knight\.cpp:\d+/);
      expect(aura.review.producers.length).toBeGreaterThan(20);
      expect(aura.review.consumers.length).toBeGreaterThan(5);
    }
  });
});

describe("the validator refuses", () => {
  it("a remains model this build cannot apply", () => {
    expect(BLOOD_AURA_REMAINS_MODELS).toEqual(["FIXED_DURATION_RESET_ON_GAIN", "PERMANENT"]);
    for (const model of ["PANDEMIC", "EXTEND", "TICK", "MAX", "CUSTOM", "DURATION"]) {
      const corrupt = clone();
      auraOf(corrupt, "bone_shield")["remainsModel"] = model;
      expect(validateBloodAuraDurationArtifact(corrupt)).toMatchObject({
        ok: false,
        reason: "UNSUPPORTED_REMAINS_MODEL",
      });
    }
  });

  it("a unit other than milliseconds", () => {
    const corrupt = clone();
    (corrupt["provenance"] as Record<string, unknown>)["durationFieldUnits"] = "SECONDS";
    expect(validateBloodAuraDurationArtifact(corrupt)).toMatchObject({
      ok: false,
      reason: "UNSUPPORTED_DURATION_UNITS",
    });
  });

  it("Essence without its modifier, or with a final duration that does not follow from base plus modifiers", () => {
    const missing = clone();
    auraOf(missing, "essence_of_the_blood_queen")["durationModifiers"] = [];
    expect(validateBloodAuraDurationArtifact(missing)).toMatchObject({
      ok: false,
      reason: "INCONSISTENT_DURATION",
    });
    const edited = clone();
    auraOf(edited, "essence_of_the_blood_queen")["finalDurationMs"] = 20_000;
    expect(validateBloodAuraDurationArtifact(edited)).toMatchObject({
      ok: false,
      reason: "INCONSISTENT_DURATION",
    });
    const boneEdited = clone();
    auraOf(boneEdited, "bone_shield")["finalDurationMs"] = 35_000;
    expect(validateBloodAuraDurationArtifact(boneEdited)).toMatchObject({
      ok: false,
      reason: "INCONSISTENT_DURATION",
    });
  });

  it("a build-dependent or percentage or otherwise malformed modifier", () => {
    for (const patch of [
      { applicability: "BUILD_DEPENDENT" },
      { kind: "PCT" },
      { valueMs: 5000.5 },
      { matchedBy: "GUESS" },
    ]) {
      const corrupt = clone();
      const modifiers = auraOf(corrupt, "essence_of_the_blood_queen")["durationModifiers"] as Record<
        string,
        unknown
      >[];
      Object.assign(modifiers[0] as Record<string, unknown>, patch);
      expect(validateBloodAuraDurationArtifact(corrupt), JSON.stringify(patch)).toMatchObject({
        ok: false,
        reason: "MALFORMED_MODIFIER",
      });
    }
  });

  it("a PERMANENT aura that carries a duration, and a finite aura whose refresh facts contradict DURATION", () => {
    const permanent = clone();
    auraOf(permanent, "vampiric_strike")["finalDurationMs"] = 10_000;
    expect(validateBloodAuraDurationArtifact(permanent)).toMatchObject({
      ok: false,
      reason: "INCONSISTENT_DURATION",
    });
    const pandemic = clone();
    (auraOf(pandemic, "bone_shield")["refreshAttributes"] as Record<string, unknown>)[
      "refreshExtendsDuration"
    ] = true;
    expect(validateBloodAuraDurationArtifact(pandemic)).toMatchObject({
      ok: false,
      reason: "INCONSISTENT_DURATION",
    });
    const ticking = clone();
    (auraOf(ticking, "bone_shield")["refreshAttributes"] as Record<string, unknown>)[
      "periodicEffectSubtypes"
    ] = [226];
    expect(validateBloodAuraDurationArtifact(ticking)).toMatchObject({
      ok: false,
      reason: "INCONSISTENT_DURATION",
    });
  });

  it("a derived field baked into an entry, a duplicate atom, an unsupported version", () => {
    for (const key of FORBIDDEN_DERIVED_AURA_KEYS) {
      const corrupt = clone();
      auraOf(corrupt, "bone_shield")[key] = 1;
      expect(validateBloodAuraDurationArtifact(corrupt), key).toMatchObject({
        ok: false,
        reason: "MALFORMED_AURA",
      });
    }
    const duplicate = clone();
    aurasOf(duplicate).push({ ...auraOf(duplicate, "bone_shield") });
    expect(validateBloodAuraDurationArtifact(duplicate)).toMatchObject({
      ok: false,
      reason: "DUPLICATE_ATOM",
    });
    const version = clone();
    version["artifactVersion"] = 2;
    expect(validateBloodAuraDurationArtifact(version)).toMatchObject({
      ok: false,
      reason: "UNSUPPORTED_ARTIFACT_VERSION",
    });
    expect(validateBloodAuraDurationArtifact(null)).toMatchObject({ ok: false, reason: "NOT_AN_OBJECT" });
  });
});

describe("the extractor's rules over synthetic rows", () => {
  const enums = {
    E_APPLY_AURA: 6,
    E_APPLY_AREA_AURA_PET: 119,
    A_ADD_FLAT_MODIFIER: 107,
    A_ADD_PCT_MODIFIER: 108,
    A_ADD_PCT_LABEL_MODIFIER: 218,
    A_ADD_FLAT_LABEL_MODIFIER: 219,
    P_DURATION: 1,
  };

  it("reads enumerators by name and refuses a missing one", () => {
    const text = "enum x {\n  SX_PASSIVE                        = 6u,\n  A_ADD_FLAT_MODIFIER = 107,\n};";
    expect(parseEnumerators(text, ["SX_PASSIVE", "A_ADD_FLAT_MODIFIER"])).toEqual({
      ok: true,
      values: { SX_PASSIVE: 6, A_ADD_FLAT_MODIFIER: 107 },
    });
    expect(parseEnumerators(text, ["SX_NOPE"])).toMatchObject({ ok: false });
  });

  it("tests an attribute bit exactly as spell_data_t::flags does", () => {
    const attributes = new Array<number>(17).fill(0);
    attributes[Math.floor(436 / 32)] = 1 << (436 % 32);
    expect(hasAttribute(attributes, 436)).toBe(true);
    expect(hasAttribute(attributes, 489)).toBe(false);
    expect(hasAttribute([], 436)).toBe(false);
  });

  it("parses a spell row's scalars, attribute words, class flags, family and effect ids", () => {
    const row =
      '  { "Bone Shield"                       ,  195181, 32, 0.000000, 0.000000, 0.000000, 0x0000000000000000, 0x00000020, 0, 0, 0, 23, 0, 0, 0.000000, 0.000000,       0, 0, 0, 0, 0, 0, 0,    0, 1, 0, 0.000000, 0.000000, 30000, 10, 100, 1, 0x0000000000000028, 2500, 0.000000,  0, 0x00000000, 0x00000000, 0, { 262144, 1024, 0, 67108864, 524352, 0, 0, 1073741824, 4096, 0, 268435456, 268435456, 0, 129, 0, 0, 0 }, { 0, 64, 0, 0 }, 15, { 0, 64 }, { 0, 0 }, 0x00000000, 0,   0,  0, 0, 0, 0, 0, 5, 0, 1, 3 }, /* 286506, 293376, 306110, 311785, 708241 */';
    const text = `static spell_data_t __spell_data[1] = {\n${row}\n};\n`;
    const parsed = parseSpellRows(
      text,
      [195181],
      { _duration: 27, _max_stack: 28, _internal_cooldown: 32 },
      17,
      4,
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.records.get(195181)).toMatchObject({
      displayNameEn: "Bone Shield",
      baseDurationMs: 30_000,
      maxStack: 10,
      internalCooldownMs: 2500,
      classFlags: [0, 64, 0, 0],
      classFamily: 15,
      effectIds: [286506, 293376, 306110, 311785, 708241],
    });
    expect(parsed.records.get(195181)?.attributes).toHaveLength(17);
  });

  it("matches a duration modifier by class flags (same family, overlapping words) and by label — and nothing else", () => {
    const aura = { abilityGameId: 100, classFamily: 15, classFlags: [0, 64, 0, 0] };
    const spells = new Map([
      [200, { classFamily: 15, displayNameEn: "Talent A" }],
      [300, { classFamily: 7, displayNameEn: "Other family" }],
      [400, { classFamily: 15, displayNameEn: "Spec aura" }],
    ]);
    const labels = new Map<number, readonly number[]>([[100, [3134]]]);
    const effect = (
      effectId: number,
      spellId: number,
      subtype: number,
      misc: number,
      misc2: number,
      flags: number[],
    ) => ({
      effectId,
      spellId,
      index: 0,
      type: 6,
      subtype,
      baseValue: 5000,
      miscValue: misc,
      miscValue2: misc2,
      classFlags: flags,
    });
    const effects = [
      effect(1, 200, 107, 1, 0, [0, 64, 0, 0]), // class-flag match, same family
      effect(2, 300, 107, 1, 0, [0, 64, 0, 0]), // other family: no
      effect(3, 200, 107, 1, 0, [1, 0, 0, 0]), // no overlap: no
      effect(4, 400, 219, 1, 3134, [0, 0, 0, 0]), // label match
      effect(5, 400, 219, 1, 9999, [0, 0, 0, 0]), // other label: no
      effect(6, 200, 107, 37, 0, [0, 64, 0, 0]), // a MAX_STACKS modifier, not duration: no
      effect(7, 200, 108, 1, 0, [0, 64, 0, 0]), // a percentage modifier: matched, reported as PCT
    ];
    expect(
      durationModifiersFor(aura, effects, spells, labels, enums).map((m) => [
        m.effectId,
        m.kind,
        m.matchedBy,
      ]),
    ).toEqual([
      [1, "FLAT_MS", "CLASS_FLAGS"],
      [4, "FLAT_MS", "LABEL"],
      [7, "PCT", "CLASS_FLAGS"],
    ]);
  });

  it("parses effect, label and specialization-spell rows from their own tables only", () => {
    const text =
      "static spelleffect_data_t __spelleffect_data[1] = {\n" +
      "  {      13,      17,  0,   6,  69, 0, 0x00000000, 0.000000, 0.050000, 0.000000, 4.638000, 0.000000, 0, 0.000000, 0.000000,      5000.0000, 1, 3134, { 0, 64, 0, 0 }, 0, 1.000000, 0.000000, 0.000000, 0,   0, 21, 0, 0.000000, 1.150000, 0, 0 },\n" +
      "};\n" +
      "static constexpr std::array<spelllabel_data_t, 2> __spelllabel_data { {\n  {      17,   16 },\n  {      17,  292 },\n} };\n";
    const effects = parseEffectRows(
      text,
      { _spell_id: 1, _index: 2, _type: 3, _subtype: 4, _base_value: 15, _misc_value: 16, _misc_value_2: 17 },
      4,
    );
    expect(effects).toMatchObject({ ok: true });
    if (!effects.ok) return;
    expect(effects.rows).toEqual([
      {
        effectId: 13,
        spellId: 17,
        index: 0,
        type: 6,
        subtype: 69,
        baseValue: 5000,
        miscValue: 1,
        miscValue2: 3134,
        classFlags: [0, 64, 0, 0],
      },
    ]);
    const labels = parseLabelRows(text);
    expect(labels.ok && labels.labels.get(17)).toEqual([16, 292]);
    expect(
      parseSpecializationSpells(
        '  {  6,  250,  137008,      0, "Blood Death Knight"                , 0 },\n',
      ),
    ).toEqual([{ classId: 6, specId: 250, spellId: 137008, displayNameEn: "Blood Death Knight" }]);
  });
});
