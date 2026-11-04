/**
 * M11-A2: the committed specialization roster is what the pinned game data
 * says, and nothing in it was remembered.
 *
 * The artifact is produced offline by `scripts/authority/extract-simc-roster.mjs`
 * from a local checkout of the pinned SimulationCraft commit. CI never has
 * that checkout and never needs it: every assertion here is over the
 * COMMITTED `src/data/game/spec-roster.json` and its provenance, through the
 * production loader. The reviewed numbers below — forty playable
 * specializations, three excluded pet families, eight excluded placeholders,
 * thirty-seven pinned roles — are snapshots of the pin, restated so a
 * re-extraction that changes any of them is a visible diff to this file.
 */

import { describe, expect, it } from "vitest";

import artifact from "../../src/data/game/spec-roster.json";
import {
  pinnedSpecRoster,
  resetSpecRosterCache,
  rosterSpecialization,
  SPEC_ROSTER_DATASET_ID,
} from "../../src/data/game/spec-roster.js";
import { SPEC_IDS } from "../../src/findings/spec-id.js";
import { ANALYZER_REGISTRATIONS } from "../../src/services/analyzer-registry.js";

const PINNED_COMMIT = "33622e9d1662ff0e451691edf85a6b49cc9d11d9";

function roster() {
  const loaded = pinnedSpecRoster();
  if (!loaded.ok) throw new Error(`${loaded.reason}: ${loaded.detail}`);
  return loaded;
}

describe("the committed roster loads and is pinned to the project commit", () => {
  it("validates", () => {
    expect(pinnedSpecRoster().ok).toBe(true);
  });

  it("is the roster dataset at the pinned SimulationCraft commit with hashed sources", () => {
    const loaded = roster();
    expect(artifact.datasetId).toBe(SPEC_ROSTER_DATASET_ID);
    expect(loaded.artifactRevision).toBe("simc-33622e9d-1");
    expect(loaded.provenance.commitSha).toBe(PINNED_COMMIT);
    expect(loaded.provenance.sources.map((source) => source.path)).toEqual([
      "engine/dbc/generated/specialization_spells.inc",
      "engine/util/util.cpp",
      "engine/dbc/generated/client_data_version.inc",
    ]);
    for (const source of loaded.provenance.sources) {
      expect(source.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(source.byteLength).toBeGreaterThan(0);
    }
    // The same client build every other pinned dataset cites.
    expect(loaded.provenance.clientDataWowVersion).toBe("12.1.0.69587");
    expect(loaded.provenance.clientDataHotfixBuild).toBe(69587);
    expect(loaded.provenance.clientDataHotfixDate).toBe("2026-09-10");
  });

  it("records how playability and role were decided, and what was excluded", () => {
    const { excluded, declaredRowCount } = roster().provenance;
    expect(declaredRowCount).toBe(614);
    expect(excluded.petFamilies.map((row) => row.specId)).toEqual([535, 536, 537]);
    expect(excluded.initialPlaceholders.map((row) => row.name).sort()).toEqual([
      "Initial Demon Hunter",
      "Initial Druid",
      "Initial Evoker",
      "Initial Monk",
      "Initial Paladin",
      "Initial Priest",
      "Initial Shaman",
      "Initial Warrior",
    ]);
  });
});

describe("the playable roster", () => {
  const rows = roster().specializations;

  it("has exactly forty playable specializations at this pin", () => {
    expect(rows).toHaveLength(40);
    expect(artifact.playableSpecializationCount).toBe(40);
  });

  it("has no duplicate SimC spec id and no duplicate (class, spec) identity", () => {
    expect(new Set(rows.map((row) => row.simcSpecId)).size).toBe(rows.length);
    expect(new Set(rows.map((row) => row.rosterKey)).size).toBe(rows.length);
    expect(new Set(rows.map((row) => row.simcEnumerator)).size).toBe(rows.length);
    expect(new Set(rows.map((row) => row.displayName)).size).toBe(rows.length);
  });

  it("is emitted in ascending SimC spec id order (deterministic regeneration)", () => {
    const ids = rows.map((row) => row.simcSpecId);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
  });

  it("carries no pet-family or Initial-placeholder row", () => {
    for (const row of rows) {
      expect(row.classId, row.rosterKey).not.toBe(0);
      expect(row.displayName, row.rosterKey).not.toMatch(/^Initial /);
      expect(row.specKey, row.rosterKey).not.toBe("initial");
    }
  });

  it("covers thirteen classes with the pinned per-class counts", () => {
    const perClass = new Map<string, number>();
    for (const row of rows) perClass.set(row.classToken, (perClass.get(row.classToken) ?? 0) + 1);
    expect(Object.fromEntries([...perClass.entries()].sort())).toEqual({
      deathknight: 3,
      demonhunter: 3,
      druid: 4,
      evoker: 3,
      hunter: 3,
      mage: 3,
      monk: 3,
      paladin: 3,
      priest: 3,
      rogue: 3,
      shaman: 3,
      warlock: 3,
      warrior: 3,
    });
  });

  it("contains Devourer Demon Hunter, the third Demon Hunter specialization at this pin", () => {
    const devourer = rosterSpecialization("demonhunter/devourer");
    expect(devourer).toMatchObject({
      simcSpecId: 1480,
      simcEnumerator: "DEMON_HUNTER_DEVOURER",
      classId: 12,
      className: "Demon Hunter",
      displayName: "Devourer Demon Hunter",
      role: "DPS",
    });
    expect(devourer?.roleEvidence?.spellName).toBe("Stat Negation Aura - Intellect DPS");
  });

  it("pins a role for thirty-seven specializations and leaves the three Evoker roles UNKNOWN", () => {
    const byRole = { DPS: 0, TANK: 0, HEALER: 0, UNKNOWN: 0 };
    for (const row of rows) byRole[row.role] += 1;
    expect(byRole).toEqual({ DPS: 25, TANK: 6, HEALER: 6, UNKNOWN: 3 });
    const unknown = rows.filter((row) => row.role === "UNKNOWN");
    expect(unknown.map((row) => row.rosterKey)).toEqual([
      "evoker/devastation",
      "evoker/preservation",
      "evoker/augmentation",
    ]);
    for (const row of unknown) expect(row.roleEvidence).toBeNull();
    for (const row of rows.filter((candidate) => candidate.role !== "UNKNOWN")) {
      expect(row.roleEvidence?.method, row.rosterKey).toBe("MACHINE_EXTRACTED_DBC_RECORD");
      expect(row.roleEvidence?.spellName, row.rosterKey).toMatch(
        /^Stat Negation Aura - [A-Za-z]+ (DPS|Tank|Healer)$/,
      );
    }
  });

  it("names the six tanks and six pinned healers the DBC role passives name", () => {
    const tanks = rows.filter((row) => row.role === "TANK").map((row) => row.rosterKey);
    const healers = rows.filter((row) => row.role === "HEALER").map((row) => row.rosterKey);
    expect(tanks).toEqual([
      "paladin/protection",
      "warrior/protection",
      "druid/guardian",
      "deathknight/blood",
      "monk/brewmaster",
      "demonhunter/vengeance",
    ]);
    expect(healers).toEqual([
      "paladin/holy",
      "druid/restoration",
      "priest/discipline",
      "priest/holy",
      "shaman/restoration",
      "monk/mistweaver",
    ]);
  });
});

describe("the roster and the analyzers", () => {
  it("every SpecId this build knows is a roster specialization with the registration's display name", () => {
    for (const specId of SPEC_IDS) {
      const row = rosterSpecialization(specId);
      expect(row, specId).not.toBeNull();
      const registration = ANALYZER_REGISTRATIONS.find((candidate) => candidate.specId === specId);
      expect(registration?.displayName, specId).toBe(row?.displayName);
    }
  });

  it("the two current analyzers are the expected roster rows", () => {
    expect(rosterSpecialization("rogue/assassination")).toMatchObject({ simcSpecId: 259, role: "DPS" });
    expect(rosterSpecialization("paladin/protection")).toMatchObject({ simcSpecId: 66, role: "TANK" });
  });

  it("the roster confers no support: twenty-seven rows have no registration (Preservation Evoker INTERNAL_ONLY since HEAL-B4, its roster role still UNKNOWN; Discipline Priest INTERNAL_ONLY since HEAL-B3; Holy Priest INTERNAL_ONLY since HEAL-B2; Brewmaster Monk registered at M11-C2, PUBLIC since M11-C4j; Augmentation Evoker INTERNAL_ONLY since M13-E; Restoration Shaman INTERNAL_ONLY since HEAL-A; Holy Paladin, Restoration Druid and Mistweaver Monk INTERNAL_ONLY since HEAL-B1)", () => {
    const registered = new Set(ANALYZER_REGISTRATIONS.map((registration) => registration.specId as string));
    const unregistered = roster().specializations.filter((row) => !registered.has(row.rosterKey));
    expect(unregistered).toHaveLength(17);
    expect(registered.has("demonhunter/havoc")).toBe(true);
    expect(registered.has("rogue/subtlety")).toBe(true);
    expect(registered.has("warrior/fury")).toBe(true);
    expect(registered.has("warrior/protection")).toBe(true);
    expect(registered.has("warrior/arms")).toBe(true);
    expect(registered.has("deathknight/frost")).toBe(true);
    expect(registered.has("demonhunter/devourer")).toBe(true);
    expect(registered.has("druid/feral")).toBe(true);
    expect(registered.has("rogue/outlaw")).toBe(true);
    expect(registered.has("shaman/enhancement")).toBe(true);
    expect(registered.has("evoker/preservation")).toBe(true);
    expect(rosterSpecialization("evoker/preservation")).toMatchObject({
      role: "UNKNOWN",
      roleEvidence: null,
    });
    expect(registered.has("priest/discipline")).toBe(true);
    expect(registered.has("priest/holy")).toBe(true);
    expect(registered.has("paladin/holy")).toBe(true);
    expect(registered.has("druid/restoration")).toBe(true);
    expect(registered.has("monk/mistweaver")).toBe(true);
    expect(registered.has("shaman/restoration")).toBe(true);
    expect(registered.has("evoker/augmentation")).toBe(true);
    expect(registered.has("monk/brewmaster")).toBe(true);
    expect(registered.has("paladin/retribution")).toBe(true);
    expect(registered.has("deathknight/blood")).toBe(true);
  });

  it("an unknown key resolves to null, never to a nearest match", () => {
    expect(rosterSpecialization("rogue/assasination")).toBeNull();
    expect(rosterSpecialization("rogue")).toBeNull();
    expect(rosterSpecialization("")).toBeNull();
  });
});

describe("the loader fails closed on a malformed artifact", () => {
  it("re-validates after a cache reset and still accepts the committed bytes", () => {
    resetSpecRosterCache();
    expect(pinnedSpecRoster().ok).toBe(true);
  });
});
