/**
 * M11-G3-2: reconstructing the canonical subject (b1PmaKrd6CDfzngc#48 actor 15)
 * from committed evidence — and refusing every way an unknown could quietly
 * become a value, a default or someone else's value.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { GEAR_SLOT_MAPPINGS } from "../../../src/character-profile/gear-slots.js";
import type { CharacterProfile } from "../../../src/character-profile/profile.js";
import {
  reconstructCharacterProfile,
  type ReconstructionInput,
} from "../../../src/character-profile/reconstruct.js";
import { fidelityProbeJob } from "../../../src/character-profile/simulation-character.js";
import type { CombatantSnapshot, GearPiece } from "../../../src/engine/normalization/normalized-events.js";
import { GEAR_SLOTS, validateSimulationJob } from "../../../src/simulation/job.js";
import { BLOOD_CHARACTER_BINDING } from "../../../src/specs/deathknight/blood/character-binding.js";
import {
  comparisonEvidence,
  reconstructionInputOf,
  subjectEvidence,
} from "../../support/character/subject.js";
import { jsonBytes } from "../../support/simulation/dev-blood-job.js";

const binding = BLOOD_CHARACTER_BINDING;
let base: ReconstructionInput;
let comparison: ReconstructionInput;

beforeAll(async () => {
  base = reconstructionInputOf(await subjectEvidence());
  comparison = reconstructionInputOf(await comparisonEvidence(0));
});

const clone = <T>(value: T): T => structuredClone(value);
const reconstruct = (input: ReconstructionInput) => reconstructCharacterProfile(input, binding);
const codes = (profile: CharacterProfile) => profile.blockers.map((blocker) => blocker.code);

function withPiece(position: number, change: (piece: GearPiece) => GearPiece): ReconstructionInput {
  const input = clone(base);
  const snapshot = input.snapshot as CombatantSnapshot;
  return {
    ...input,
    snapshot: {
      ...snapshot,
      gear: snapshot.gear.map((piece) => (piece.slotIndex === position ? change(piece) : piece)),
    },
  };
}

const slot = (profile: CharacterProfile, name: string) => {
  const record = profile.equipment.find((entry) => entry.slot === name);
  if (record === undefined) throw new Error(name);
  return record;
};

describe("M11-G3-2 canonical subject reconstruction", () => {
  it("A. reconstructs deterministically, blocked only by race", () => {
    const first = reconstruct(base);
    expect(reconstruct(clone(base))).toEqual(first);
    expect(codes(first)).toEqual(["RACE_UNRESOLVED"]);
    expect(first.reconstructionStatus).toBe("PROFILE_NOT_SIMULATION_READY");
    expect(first.identity.specKey).toBe("deathknight/blood");
    expect(first.talents.heroTree).toMatchObject({
      state: "KNOWN",
      value: { simcName: "sanlayn", subTreeId: 31 },
    });
  });

  it("level is a provenance-visible MODEL_ASSUMPTION, never observed", () => {
    const level = reconstruct(base).identity.level;
    expect(level).toMatchObject({
      state: "MODEL_ASSUMPTION",
      value: 90,
      assumption: { id: "LEVEL_IS_PINNED_ENGINE_MAX_LEVEL", version: 1 },
    });
  });

  it("B. spec identity is evidence-gated", () => {
    const missing = clone(base);
    (missing.snapshot as { specId: number | null }).specId = null;
    expect(codes(reconstruct(missing))).toContain("SPEC_UNRESOLVED");
    const other = clone(base);
    (other.snapshot as { specId: number | null }).specId = 252;
    expect(codes(reconstruct(other))).toContain("SPEC_MISMATCH");
    expect(codes(reconstruct({ ...clone(base), snapshot: null }))).toContain("COMBATANT_INFO_MISSING");
  });

  it("C/H/I. an UNKNOWN gem, enchant, bonus list or item level never becomes none, zero or default", () => {
    const gems = reconstruct(
      withPiece(1, (piece) => ({ ...piece, gems: { state: "UNKNOWN", reason: "NULL_VALUE" } })),
    );
    expect(slot(gems, "neck").gems.state).toBe("UNKNOWN");
    expect(codes(gems)).toContain("GEMS_UNKNOWN");
    const enchant = reconstruct(
      withPiece(0, (piece) => ({ ...piece, permanentEnchant: { state: "UNKNOWN", reason: "ZERO_VALUE" } })),
    );
    expect(slot(enchant, "head").permanentEnchant.state).toBe("UNKNOWN");
    expect(codes(enchant)).toContain("ENCHANT_UNKNOWN");
    const bonus = reconstruct(withPiece(4, (piece) => ({ ...piece, bonusIds: null })));
    expect(slot(bonus, "chest").bonusIds.state).toBe("UNKNOWN");
    expect(slot(bonus, "chest").craftedStats.state).toBe("UNKNOWN");
    expect(codes(bonus)).toContain("BONUS_IDS_UNKNOWN");
    const level = reconstruct(withPiece(6, (piece) => ({ ...piece, itemLevel: null })));
    expect(slot(level, "legs").itemLevel.state).toBe("UNKNOWN");
    expect(codes(level)).toContain("ITEM_LEVEL_UNKNOWN");
    for (const profile of [gems, enchant, bonus, level]) {
      expect(fidelityProbeJob(profile, binding).ok).toBe(false);
    }
  });

  it("H/I. KNOWN and KNOWN_NONE are preserved with their basis", () => {
    const profile = reconstruct(base);
    expect(slot(profile, "neck").gems).toMatchObject({ state: "KNOWN", value: [240983, 240916] });
    expect(slot(profile, "head").gems).toMatchObject({ state: "KNOWN_NONE" });
    expect(slot(profile, "head").permanentEnchant).toMatchObject({ state: "KNOWN", value: 7991 });
    expect(slot(profile, "neck").permanentEnchant).toMatchObject({ state: "KNOWN_NONE" });
  });

  it("D. one deterministic slot mapping: WCL position -> canonical slot -> engine slot", () => {
    expect(GEAR_SLOT_MAPPINGS.map((mapping) => mapping.slot)).toEqual([...GEAR_SLOTS]);
    for (const mapping of GEAR_SLOT_MAPPINGS) expect(mapping.engineSlot).toBe(mapping.slot);
    expect(GEAR_SLOT_MAPPINGS.filter((mapping) => mapping.statless).map((mapping) => mapping.slot)).toEqual([
      "shirt",
      "tabard",
    ]);
    const profile = reconstruct(base);
    expect(profile.equipment.map((record) => [record.wclPosition, record.slot])).toEqual(
      GEAR_SLOTS.map((name, position) => [position, name]),
    );
    expect(slot(profile, "main_hand").itemId).toMatchObject({ value: 237846 });
    expect(slot(profile, "trinket1").itemId).toMatchObject({ value: 270173 });
    expect(slot(profile, "off_hand").occupancy).toBe("EMPTY");
  });

  it("E/F/G. item ids, item levels and bonus ids are preserved exactly (bonus order kept)", () => {
    const profile = reconstruct(base);
    for (const piece of (base.snapshot as CombatantSnapshot).gear) {
      const record = profile.equipment[piece.slotIndex];
      if (record === undefined || record.occupancy !== "EQUIPPED") continue;
      expect(record.itemId).toMatchObject({ state: "KNOWN", value: piece.itemId });
      if (piece.itemLevel !== null)
        expect(record.itemLevel).toMatchObject({ state: "KNOWN", value: piece.itemLevel });
      if (piece.bonusIds !== null)
        expect(record.bonusIds).toMatchObject({ state: "KNOWN", value: piece.bonusIds });
    }
    expect(slot(profile, "feet").bonusIds).toMatchObject({
      value: [12214, 13667, 12497, 13751, 14001, 8960, 12384, 8790, 13836],
    });
  });

  it("J. the runeforge is required setup: UNKNOWN blocks, observed absence is recorded but not invented", () => {
    const unknownRune = reconstruct(
      withPiece(15, (piece) => ({ ...piece, permanentEnchant: { state: "UNKNOWN", reason: "NULL_VALUE" } })),
    );
    expect(codes(unknownRune)).toContain("REQUIRED_ENCHANT_UNKNOWN");
    const noRune = reconstruct(
      withPiece(15, (piece) => ({
        ...piece,
        permanentEnchant: { state: "KNOWN_NONE", contract: "WCL_GEAR_UI_SEMANTICS_2026_09" as never },
      })),
    );
    expect(codes(noRune)).toEqual(["RACE_UNRESOLVED"]);
    expect(noRune.diagnostics.map((diagnostic) => diagnostic.code)).toContain("REQUIRED_ENCHANT_ABSENT");
    expect(slot(reconstruct(base), "main_hand").permanentEnchant).toMatchObject({
      state: "KNOWN",
      value: 6241,
    });
  });

  it("K. the shirt/tabard exception stays narrow", () => {
    const profile = reconstruct(base);
    expect(slot(profile, "shirt").bonusIds.state).toBe("UNKNOWN");
    expect(codes(profile)).not.toContain("BONUS_IDS_UNKNOWN");
    const job = fidelityProbeJob(profile, binding);
    expect(job.ok && job.value.character.gear.map((entry) => entry.slot)).not.toContain("shirt");
    // The same unknown on a stat-bearing slot blocks.
    const back = reconstruct(withPiece(14, (piece) => ({ ...piece, bonusIds: null })));
    expect(codes(back)).toContain("BONUS_IDS_UNKNOWN");
    // A missing stat-bearing position blocks; a missing tabard does not.
    const snapshot = base.snapshot as CombatantSnapshot;
    const noBack = reconstruct({
      ...clone(base),
      snapshot: { ...snapshot, gear: snapshot.gear.filter((piece) => piece.slotIndex !== 14) },
    });
    expect(codes(noBack)).toContain("GEAR_POSITION_MISSING");
    const noTabard = reconstruct({
      ...clone(base),
      snapshot: { ...snapshot, gear: snapshot.gear.filter((piece) => piece.slotIndex !== 17) },
    });
    expect(codes(noTabard)).toEqual(["RACE_UNRESOLVED"]);
  });

  it("T. crafted stats travel in the bonus ids; unknown bonus ids leave them UNKNOWN", () => {
    const profile = reconstruct(base);
    expect(slot(profile, "wrists").craftedStats).toMatchObject({
      state: "KNOWN",
      value: "ENCODED_IN_BONUS_IDS",
    });
    expect(profile.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      "CRAFTED_STATS_FROM_BONUS_IDS",
    );
  });

  it("U/V. race is never inferred or defaulted, and it blocks readiness", () => {
    const profile = reconstruct(base);
    expect(profile.identity.race.state).toBe("UNKNOWN");
    expect(codes(profile)).toContain("RACE_UNRESOLVED");
    expect(JSON.stringify(profile.identity.race)).not.toMatch(/mechagnome|human|orc|troll/);
    const job = fidelityProbeJob(profile, binding);
    expect(job.ok && job.value.character).toMatchObject({
      profileKind: "LOGGED_FIDELITY_PROBE",
      race: "none",
    });
    // "none" is not available to anything but a fidelity probe.
    if (!job.ok) throw new Error("probe job");
    const asCeiling = {
      ...job.value,
      character: { ...job.value.character, profileKind: "LOGGED_RECONSTRUCTION" },
    };
    expect(validateSimulationJob(asCeiling, jsonBytes(asCeiling), [binding.simulation])).toMatchObject({
      ok: false,
    });
  });

  it("W. a comparison player's evidence cannot fill a subject field", () => {
    expect(comparison.subject.actorId).not.toBe(base.subject.actorId);
    const borrowed = reconstruct({ ...clone(base), snapshot: comparison.snapshot });
    expect(codes(borrowed)).toContain("EVIDENCE_ACTOR_MISMATCH");
    expect(borrowed.equipment.every((record) => record.occupancy === "MISSING")).toBe(true);
    const borrowedTalents = reconstruct({ ...clone(base), talentImport: comparison.talentImport });
    expect(codes(borrowedTalents)).toContain("EVIDENCE_ACTOR_MISMATCH");
    expect(borrowedTalents.talents.importCode.state).toBe("UNKNOWN");
    const borrowedPull = reconstruct({ ...clone(base), pullFacts: comparison.pullFacts });
    expect(codes(borrowedPull)).toContain("EVIDENCE_ACTOR_MISMATCH");
    expect(
      borrowedPull.setupFacts.consumables.every(
        (fact) => fact.kind === "POTION" || fact.identity.state === "UNKNOWN",
      ),
    ).toBe(true);
  });

  it("X/Y/Z. no raid buff, ideal consumable or added target enters the fidelity probe", () => {
    const job = fidelityProbeJob(reconstruct(base), binding);
    if (!job.ok) throw new Error(job.failure.detail);
    const { character, environment } = job.value;
    expect(character.consumables).toEqual({
      provenance: "FIDELITY_CONTROL",
      potion: "NONE",
      flask: "NONE",
      food: "NONE",
      augmentation: "NONE",
      temporaryEnchants: [],
    });
    expect(environment.raidBuffs).toEqual({ provenance: "FIDELITY_CONTROL", active: [] });
    expect(environment.bloodlust).toEqual({ kind: "NONE", provenance: "FIDELITY_CONTROL" });
    expect(environment.additionalTargets).toEqual([]);
    // The job schema refuses a probe that carries any of them.
    const buffed = {
      ...job.value,
      environment: {
        ...environment,
        raidBuffs: { provenance: "FIDELITY_CONTROL", active: ["battle_shout"] },
      },
    };
    expect(validateSimulationJob(buffed, jsonBytes(buffed), [binding.simulation]).ok).toBe(false);
    const flask = {
      ...job.value,
      character: {
        ...character,
        consumables: { ...character.consumables, flask: "flask_of_the_shattered_sun_2" },
      },
    };
    expect(validateSimulationJob(flask, jsonBytes(flask), [binding.simulation]).ok).toBe(false);
    expect(validateSimulationJob(job.value, jsonBytes(job.value), [binding.simulation]).ok).toBe(true);
  });

  it("consumables are inventoried from the subject's own evidence, never idealized", () => {
    const facts = Object.fromEntries(
      reconstruct(base).setupFacts.consumables.map((fact) => [fact.kind, fact.identity]),
    );
    expect(facts["FLASK"]).toMatchObject({ state: "KNOWN", value: { spellId: 1235057 } });
    expect(facts["POTION"]).toMatchObject({ state: "KNOWN", value: { spellId: 1236994 } });
    expect(facts["FOOD"]?.state).toBe("UNKNOWN");
    expect(facts["AUGMENTATION"]?.state).toBe("UNKNOWN");
    expect(slot(reconstruct(base), "main_hand").temporaryEnchant).toMatchObject({
      state: "KNOWN",
      value: { enchantId: 8052, engineToken: "thalassian_phoenix_oil_2" },
    });
  });

  it("M. a hero tree that disagrees with the import, or is contradictory, blocks", () => {
    const otherTree = reconstructCharacterProfile(base, {
      ...binding,
      resolveHeroTree: () => ({
        state: "RESOLVED",
        simcName: "deathbringer",
        subTreeId: 33,
        decidedByEntryIds: [1],
      }),
    });
    expect(codes(otherTree)).toContain("HERO_TREE_MISMATCH");
    const contradictory = reconstructCharacterProfile(base, {
      ...binding,
      resolveHeroTree: () => ({ state: "CONTRADICTORY", subTreeIds: [31, 33] }),
    });
    expect(codes(contradictory)).toContain("HERO_TREE_CONTRADICTORY");
  });

  it("talent evidence is required and must agree", () => {
    expect(codes(reconstruct({ ...clone(base), talentImport: { actorId: 15, code: null } }))).toContain(
      "TALENT_IMPORT_MISSING",
    );
    const noTree = clone(base);
    (noTree.snapshot as unknown as { talentTree: unknown[] }).talentTree = [];
    const noTreeCodes = codes(reconstruct(noTree));
    expect(noTreeCodes).toContain("TALENT_TREE_MISSING");
    expect(noTreeCodes).toContain("HERO_TREE_UNRESOLVED");
  });
});
