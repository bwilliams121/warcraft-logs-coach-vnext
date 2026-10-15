/**
 * RECONSTRUCT the character observed in one logged fight (M11-G3-2).
 *
 * Inputs are the subject's OWN evidence only: the normalized `combatantinfo`
 * snapshot, the fight's `talentImportCode` (which Warcraft Logs scopes to one
 * actor), the raw pull facts and the subject's own casts. Every input carries
 * its actor id and must be the subject's; evidence about anyone else —
 * including comparison players — is refused (EVIDENCE_ACTOR_MISMATCH), so it
 * can never fill a subject field.
 *
 * Blocking rules (the profile cannot be simulated while any holds):
 *   spec unresolved or not the binding's spec; no combatantinfo; loadout table
 *   unavailable; talent import missing or undecodable; WCL talent tree
 *   missing; decoded talents != WCL talent facts; hero tree unresolved,
 *   contradictory, or != the import's hero selection; an unreadable gear row;
 *   a missing stat-bearing gear position; on a stat-bearing item, unknown item
 *   level, bonus ids, gems or permanent enchant; unknown required enchant (a
 *   Death Knight's runeforge); unresolved race.
 * Non-blocking: level as a MODEL_ASSUMPTION; a required enchant that is
 *   observed absent; a temporary enchant the pinned data cannot name;
 *   shirt/tabard detail; model-version compatibility unknown.
 */

import { consumableAuraFor, temporaryEnchantFor } from "../data/game/consumables.js";
import { decodeTalentLoadout, reconcileLoadout } from "../data/game/talent-loadout.js";
import { isEmptyGearSlot } from "../engine/normalization/combatant-info.js";
import type {
  CombatantSnapshot,
  GearEnchantState,
  GearPiece,
} from "../engine/normalization/normalized-events.js";
import { PINNED_ENGINE_MAX_LEVEL } from "../simulation/model.js";
import type { CharacterSpecBinding } from "./binding.js";
import { GEAR_SLOT_MAPPINGS, type GearSlotMapping } from "./gear-slots.js";
import {
  CHARACTER_PROFILE_SCHEMA_VERSION,
  known,
  unknown,
  type CharacterProfile,
  type ConsumableFact,
  type ConsumableKind,
  type EquipmentRecord,
  type EvidenceDocument,
  type Evidenced,
  type PlayableRace,
  type TemporaryEnchantEvidence,
  type ProfileIssue,
  type TalentsRecord,
} from "./profile.js";
import type { CombatantPullFacts } from "./pull-facts.js";

export interface ReconstructionInput {
  readonly subject: { readonly fightRef: string; readonly actorId: number };
  /** The normalized combatantinfo snapshot believed to be the subject's. */
  readonly snapshot: CombatantSnapshot | null;
  /** `CombatFight.talentImportCode` with the focus actor it was requested for. */
  readonly talentImport: { readonly actorId: number; readonly code: string | null } | null;
  readonly pullFacts: { readonly actorId: number; readonly facts: CombatantPullFacts } | null;
  /** Spell ids of casts sourced by the subject (e.g. a potion). */
  readonly subjectCasts: { readonly actorId: number; readonly spellIds: readonly number[] } | null;
  readonly documents: readonly EvidenceDocument[];
}

export const LEVEL_ASSUMPTION = {
  id: "LEVEL_IS_PINNED_ENGINE_MAX_LEVEL",
  version: 1,
  statement:
    "Warcraft Logs evidence carries no character level. The level is assumed to be the pinned engine's maximum (90, engine/config.hpp:176) for a logged current-content encounter. Not observed.",
} as const;

const NO_RACE =
  "No committed evidence carries race: combatantinfo and the fight context have no race field, and no race-specific spell appears in the subject's committed events. Race is not inferred from name, realm, appearance or any shipped profile.";

export function reconstructCharacterProfile(
  input: ReconstructionInput,
  binding: CharacterSpecBinding,
): CharacterProfile {
  const blockers: ProfileIssue[] = [];
  const diagnostics: ProfileIssue[] = [];
  const block = (code: ProfileIssue["code"], detail: string) => blockers.push({ code, detail });
  const note = (code: ProfileIssue["code"], detail: string) => diagnostics.push({ code, detail });
  const subjectId = input.subject.actorId;

  let snapshot = input.snapshot;
  if (snapshot !== null && snapshot.actorId !== subjectId) {
    block(
      "EVIDENCE_ACTOR_MISMATCH",
      `combatantinfo is actor ${String(snapshot.actorId)}, not ${String(subjectId)}`,
    );
    snapshot = null;
  }
  if (snapshot === null) block("COMBATANT_INFO_MISSING", "no combatantinfo for the subject");

  // Identity.
  let specId: Evidenced<number>;
  if (snapshot?.specId === null || snapshot === null) {
    specId = unknown("combatantinfo carries no readable specID", "WCL_COMBATANTINFO", "specID");
    block("SPEC_UNRESOLVED", "specID unknown");
  } else {
    specId = known(snapshot.specId, "WCL_COMBATANTINFO", "specID");
    if (snapshot.specId !== binding.specId) {
      block("SPEC_MISMATCH", `specID ${String(snapshot.specId)} is not ${String(binding.specId)}`);
    }
  }
  const classId: Evidenced<number> =
    specId.state === "KNOWN" && specId.value === binding.specId
      ? known(binding.classId, "PINNED_GAME_DATA", "specialization -> class")
      : unknown("specialization not resolved", null, "class");
  const level: Evidenced<number> = {
    state: "MODEL_ASSUMPTION",
    value: PINNED_ENGINE_MAX_LEVEL,
    assumption: LEVEL_ASSUMPTION,
  };
  note("LEVEL_IS_MODEL_ASSUMPTION", LEVEL_ASSUMPTION.statement);
  const race: Evidenced<PlayableRace> = unknown(NO_RACE, null, "race");
  block(
    "RACE_UNRESOLVED",
    "race changes the pinned engine simulation (base attributes, passive racials, racial APL actions) and the engine has no neutral race (race=none is not neutral); see the G3-2 race audit",
  );

  const talents = reconstructTalents(input, snapshot, binding, block);
  const equipment = GEAR_SLOT_MAPPINGS.map((mapping) =>
    reconstructSlot(mapping, snapshot, binding, block, note),
  );
  if (equipment.some((record) => record.craftedStats.state === "KNOWN")) {
    note(
      "CRAFTED_STATS_FROM_BONUS_IDS",
      "crafted secondary-stat choices travel in the item bonus ids, which are passed to the engine verbatim; no crafted_stats override is written",
    );
  }
  note(
    "MODEL_VERSION_COMPATIBILITY_UNKNOWN",
    "the log's client build is not in the evidence (gameVersion/logVersion do not discriminate builds), so compatibility with client data 12.1.0.69587 is unknown",
  );

  const pullFacts = input.pullFacts?.actorId === subjectId ? input.pullFacts.facts : null;
  if (input.pullFacts !== null && input.pullFacts.actorId !== subjectId) {
    block(
      "EVIDENCE_ACTOR_MISMATCH",
      `pull facts are actor ${String(input.pullFacts.actorId)}, not ${String(subjectId)}`,
    );
  }
  const casts = input.subjectCasts?.actorId === subjectId ? input.subjectCasts.spellIds : null;
  if (input.subjectCasts !== null && input.subjectCasts.actorId !== subjectId) {
    block(
      "EVIDENCE_ACTOR_MISMATCH",
      `casts are actor ${String(input.subjectCasts.actorId)}, not ${String(subjectId)}`,
    );
  }

  return {
    schemaVersion: CHARACTER_PROFILE_SCHEMA_VERSION,
    identity: { specKey: binding.simulation.specKey, classId, specId, level, race },
    talents,
    equipment,
    setupFacts: { consumables: reconstructConsumables(pullFacts, subjectId, casts) },
    evidence: { subject: input.subject, documents: input.documents },
    blockers,
    diagnostics,
    reconstructionStatus: blockers.length === 0 ? "AWAITING_FIDELITY" : "PROFILE_NOT_SIMULATION_READY",
  };
}

function reconstructTalents(
  input: ReconstructionInput,
  snapshot: CombatantSnapshot | null,
  binding: CharacterSpecBinding,
  block: (code: ProfileIssue["code"], detail: string) => void,
): TalentsRecord {
  let importCode: Evidenced<string>;
  if (input.talentImport === null || input.talentImport.code === null) {
    importCode = unknown(
      "Warcraft Logs supplied no talentImportCode",
      "WCL_FIGHT_CONTEXT",
      "talentImportCode",
    );
    block("TALENT_IMPORT_MISSING", "no talent import code");
  } else if (input.talentImport.actorId !== input.subject.actorId) {
    importCode = unknown("the import code describes another actor", "WCL_FIGHT_CONTEXT", "talentImportCode");
    block("EVIDENCE_ACTOR_MISMATCH", `talentImportCode is actor ${String(input.talentImport.actorId)}`);
  } else {
    importCode = known(input.talentImport.code, "WCL_FIGHT_CONTEXT", "talentImportCode");
  }

  const tree = snapshot?.talentTree ?? [];
  const heroResolution = binding.resolveHeroTree(
    tree.map((entry) => ({ id: entry.id, nodeId: entry.nodeId })),
  );
  let heroTree: TalentsRecord["heroTree"];
  if (heroResolution.state === "RESOLVED") {
    heroTree = known(
      { simcName: heroResolution.simcName, subTreeId: heroResolution.subTreeId },
      "WCL_COMBATANTINFO",
      `talentTree entries ${heroResolution.decidedByEntryIds.join(",")}`,
    );
  } else if (heroResolution.state === "CONTRADICTORY") {
    heroTree = unknown(
      `entries of sub-trees ${heroResolution.subTreeIds.join(",")}`,
      "WCL_COMBATANTINFO",
      "talentTree",
    );
    block("HERO_TREE_CONTRADICTORY", `sub-trees ${heroResolution.subTreeIds.join(",")}`);
  } else {
    heroTree = unknown("no pinned hero-tree entry observed", "WCL_COMBATANTINFO", "talentTree");
    block("HERO_TREE_UNRESOLVED", "no hero-tree entry in the WCL talent tree");
  }

  const loaded = binding.loadoutTable();
  if (!loaded.ok) {
    block("LOADOUT_TABLE_UNAVAILABLE", loaded.detail);
    return {
      importCode,
      decode: { state: "NOT_ATTEMPTED", reason: "loadout table unavailable" },
      reconciliation: { state: "UNKNOWN", reason: "not decoded" },
      heroTree,
    };
  }
  if (importCode.state !== "KNOWN") {
    return {
      importCode,
      decode: { state: "NOT_ATTEMPTED", reason: "no import code" },
      reconciliation: { state: "UNKNOWN", reason: "not decoded" },
      heroTree,
    };
  }
  const decoded = decodeTalentLoadout(importCode.value, loaded.table, binding.specId);
  if (!decoded.ok) {
    block("TALENT_IMPORT_INVALID", `${decoded.failure}: ${decoded.detail}`);
    return {
      importCode,
      decode: { state: "FAILED", failure: decoded.failure, detail: decoded.detail },
      reconciliation: { state: "UNKNOWN", reason: "not decoded" },
      heroTree,
    };
  }
  let reconciliation: TalentsRecord["reconciliation"];
  if (tree.length === 0) {
    reconciliation = { state: "UNKNOWN", reason: "combatantinfo carried no talentTree" };
    block("TALENT_TREE_MISSING", "the WCL talent facts are absent; the import code cannot be verified");
  } else {
    reconciliation = reconcileLoadout(decoded.talents, tree);
    if (reconciliation.state === "DIVERGED") {
      block(
        "TALENT_MISMATCH",
        `only in WCL ${reconciliation.onlyObserved.join(",") || "-"}; only in import ${reconciliation.onlyDecoded.join(",") || "-"}; rank/node ${reconciliation.rankOrNodeDifferences.join(",") || "-"}`,
      );
    }
  }
  if (heroTree.state === "KNOWN") {
    const selected = decoded.selectedSubTreeIds;
    if (selected.length !== 1 || selected[0] !== heroTree.value.subTreeId) {
      block(
        "HERO_TREE_MISMATCH",
        `import selects ${selected.join(",") || "none"}, WCL resolves ${String(heroTree.value.subTreeId)}`,
      );
    }
  }
  return {
    importCode,
    decode: {
      state: "DECODED",
      specId: decoded.specId,
      talents: decoded.talents,
      selectedSubTreeIds: decoded.selectedSubTreeIds,
    },
    reconciliation,
    heroTree,
  };
}

const notApplicable = <T>(reason: string): Evidenced<T> => ({ state: "NOT_APPLICABLE", reason });

function reconstructSlot(
  mapping: GearSlotMapping,
  snapshot: CombatantSnapshot | null,
  binding: CharacterSpecBinding,
  block: (code: ProfileIssue["code"], detail: string) => void,
  note: (code: ProfileIssue["code"], detail: string) => void,
): EquipmentRecord {
  const field = (name: string) => `gear[${String(mapping.wclPosition)}].${name}`;
  const base = { slot: mapping.slot, wclPosition: mapping.wclPosition, statless: mapping.statless };
  const absent = (occupancy: EquipmentRecord["occupancy"], reason: string): EquipmentRecord => ({
    ...base,
    occupancy,
    itemId:
      occupancy === "EMPTY"
        ? {
            state: "KNOWN_NONE",
            source: { kind: "WCL_COMBATANTINFO", field: field("id") },
            basis: "empty-slot placeholder row",
          }
        : unknown(reason, "WCL_COMBATANTINFO", field("id")),
    itemLevel: notApplicable(reason),
    bonusIds: notApplicable(reason),
    gems: notApplicable(reason),
    permanentEnchant: notApplicable(reason),
    temporaryEnchant: notApplicable(reason),
    craftedStats: notApplicable(reason),
    setId: null,
  });
  if (snapshot === null) return absent("MISSING", "no combatantinfo");
  if (snapshot.malformedGearRows.includes(mapping.wclPosition)) {
    block("GEAR_ROW_UNREADABLE", `${mapping.slot} (position ${String(mapping.wclPosition)})`);
    return absent("UNREADABLE", "unreadable gear row");
  }
  const piece = snapshot.gear.find((candidate) => candidate.slotIndex === mapping.wclPosition);
  if (piece === undefined) {
    if (!mapping.statless)
      block("GEAR_POSITION_MISSING", `${mapping.slot} (position ${String(mapping.wclPosition)})`);
    return absent("MISSING", "gear position not present");
  }
  if (isEmptyGearSlot(piece)) return absent("EMPTY", "empty slot");

  const statBearing = !mapping.statless;
  const itemLevel: Evidenced<number> =
    piece.itemLevel !== null && piece.itemLevel > 0
      ? known(piece.itemLevel, "WCL_COMBATANTINFO", field("itemLevel"))
      : unknown("item level missing or zero", "WCL_COMBATANTINFO", field("itemLevel"));
  if (itemLevel.state === "UNKNOWN" && statBearing) block("ITEM_LEVEL_UNKNOWN", mapping.slot);
  const bonusIds: Evidenced<readonly number[]> =
    piece.bonusIds === null
      ? unknown("bonusIDs absent or malformed", "WCL_COMBATANTINFO", field("bonusIDs"))
      : known(piece.bonusIds, "WCL_COMBATANTINFO", field("bonusIDs"));
  if (bonusIds.state === "UNKNOWN" && statBearing) block("BONUS_IDS_UNKNOWN", mapping.slot);
  const gems = gemsOf(piece, field("gems"));
  if (gems.state === "UNKNOWN" && statBearing) block("GEMS_UNKNOWN", mapping.slot);
  const permanentEnchant = enchantOf(piece.permanentEnchant, field("permanentEnchant"));
  const required = binding.requiredEnchantSlots.includes(mapping.slot);
  if (permanentEnchant.state === "UNKNOWN") {
    if (required) block("REQUIRED_ENCHANT_UNKNOWN", mapping.slot);
    else if (statBearing) block("ENCHANT_UNKNOWN", mapping.slot);
  }
  if (permanentEnchant.state === "KNOWN_NONE" && required) note("REQUIRED_ENCHANT_ABSENT", mapping.slot);
  const temporary = enchantOf(piece.temporaryEnchant, field("temporaryEnchant"));
  let temporaryEnchant: TemporaryEnchantEvidence;
  if (temporary.state === "KNOWN") {
    const identity = temporaryEnchantFor(temporary.value);
    if (identity === null)
      note("TEMPORARY_ENCHANT_NOT_IN_PINNED_DATA", `${mapping.slot}: enchant ${String(temporary.value)}`);
    temporaryEnchant = known(
      { enchantId: temporary.value, engineToken: identity?.token ?? null },
      "WCL_COMBATANTINFO",
      field("temporaryEnchant"),
    );
  } else if (temporary.state === "KNOWN_NONE" || temporary.state === "UNKNOWN") {
    temporaryEnchant = temporary;
  } else {
    temporaryEnchant = unknown("unexpected enchant state", "WCL_COMBATANTINFO", field("temporaryEnchant"));
  }
  return {
    ...base,
    occupancy: "EQUIPPED",
    itemId: known(piece.itemId, "WCL_COMBATANTINFO", field("id")),
    itemLevel,
    bonusIds,
    gems,
    permanentEnchant,
    temporaryEnchant,
    craftedStats:
      bonusIds.state === "KNOWN"
        ? known("ENCODED_IN_BONUS_IDS" as const, "WCL_COMBATANTINFO", field("bonusIDs"))
        : unknown("bonus ids unknown", "WCL_COMBATANTINFO", field("bonusIDs")),
    setId: piece.setId,
  };
}

function gemsOf(piece: GearPiece, field: string): Evidenced<readonly number[]> {
  const gems = piece.gems;
  if (gems.state === "UNKNOWN") return unknown(`gems ${gems.reason}`, "WCL_COMBATANTINFO", field);
  if (gems.state === "KNOWN_NONE") {
    return {
      state: "KNOWN_NONE",
      source: { kind: "WCL_COMBATANTINFO", field },
      basis: `omitted key under ${gems.contract}`,
    };
  }
  if (gems.gemIds.length === 0) {
    return {
      state: "KNOWN_NONE",
      source: { kind: "WCL_COMBATANTINFO", field },
      basis: "observed empty gems array",
    };
  }
  return known(gems.gemIds, "WCL_COMBATANTINFO", field);
}

function enchantOf(state: GearEnchantState, field: string): Evidenced<number> {
  if (state.state === "KNOWN") return known(state.enchantId, "WCL_COMBATANTINFO", field);
  if (state.state === "KNOWN_NONE") {
    return {
      state: "KNOWN_NONE",
      source: { kind: "WCL_COMBATANTINFO", field },
      basis: `omitted key under ${state.contract}`,
    };
  }
  return unknown(`enchant ${state.reason}`, "WCL_COMBATANTINFO", field);
}

const CONSUMABLE_KIND: Record<string, ConsumableKind> = {
  FLASK: "FLASK",
  FOOD: "FOOD",
  POTION: "POTION",
  OTHER: "AUGMENTATION",
};

function reconstructConsumables(
  pullFacts: CombatantPullFacts | null,
  subjectId: number,
  casts: readonly number[] | null,
): ConsumableFact[] {
  const found = new Map<
    ConsumableKind,
    { spellId: number; itemIds: number[]; field: string; kind: "WCL_COMBATANTINFO" | "WCL_EVENTS" }
  >();
  for (const aura of pullFacts?.auras ?? []) {
    if (aura.sourceId !== subjectId) continue;
    const pinned = consumableAuraFor(aura.spellId);
    const kind = pinned === null ? undefined : CONSUMABLE_KIND[pinned.kind];
    if (pinned === null || kind === undefined || kind === "POTION" || found.has(kind)) continue;
    found.set(kind, {
      spellId: aura.spellId,
      itemIds: pinned.items.map((item) => item.itemId),
      field: `auras[${String(aura.spellId)}]`,
      kind: "WCL_COMBATANTINFO",
    });
  }
  for (const spellId of casts ?? []) {
    const pinned = consumableAuraFor(spellId);
    if (pinned?.kind !== "POTION" || found.has("POTION")) continue;
    found.set("POTION", {
      spellId,
      itemIds: pinned.items.map((item) => item.itemId),
      field: `cast ${String(spellId)}`,
      kind: "WCL_EVENTS",
    });
  }
  const order: ConsumableKind[] = ["FLASK", "FOOD", "AUGMENTATION", "POTION"];
  return order.map((kind) => {
    const hit = found.get(kind);
    if (hit !== undefined) {
      return {
        kind,
        identity: known({ spellId: hit.spellId, itemIds: hit.itemIds }, hit.kind, hit.field),
        note:
          hit.itemIds.length > 1
            ? "several items (quality ranks / variants) apply this spell: the consumable is known, its rank is not"
            : "single pinned item",
      };
    }
    const reason =
      kind === "POTION"
        ? "no pinned potion spell among the subject's casts; potion use and timing belong to the environment (G3-4)"
        : pullFacts?.auras === null || pullFacts === null
          ? "no readable pull aura list"
          : "no pull aura matches a pinned consumable of this kind (the pull aura list is not proven exhaustive, and an aura absent from pinned data cannot be named)";
    return {
      kind,
      identity: unknown(
        reason,
        kind === "POTION" ? "WCL_EVENTS" : "WCL_COMBATANTINFO",
        kind === "POTION" ? "casts" : "auras",
      ),
      note: "never defaulted",
    };
  });
}
