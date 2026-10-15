/**
 * The CHARACTER PROFILE (M11-G3-2): the character observed in one logged
 * fight, reconstructed field by field with the evidence for each field.
 *
 * Every field is one of:
 *
 *   KNOWN             observed (or resolved from observed ids via pinned data)
 *   KNOWN_NONE        observed absence under a stated contract
 *   UNKNOWN           not established — never "none", never 0, never a default
 *   NOT_APPLICABLE    the question does not arise for this field
 *   MODEL_ASSUMPTION  not observed; a versioned, provenance-visible assumption
 *
 * The profile describes what the player HAD. Nothing here improves it, fills
 * it from other players, or chooses a "standard" value for an unknown.
 */

import type {
  DecodedTalent,
  LoadoutDecodeFailure,
  LoadoutReconciliation,
} from "../data/game/talent-loadout.js";
import type { PLAYABLE_RACES } from "../simulation/job.js";
import type { GearSlot } from "./gear-slots.js";

export const CHARACTER_PROFILE_SCHEMA_VERSION = "character-profile/1";

export type EvidenceSourceKind =
  "WCL_COMBATANTINFO" | "WCL_FIGHT_CONTEXT" | "WCL_EVENTS" | "PINNED_GAME_DATA";

export interface EvidenceSource {
  readonly kind: EvidenceSourceKind;
  /** The field or table, e.g. `gear[15].permanentEnchant`. */
  readonly field: string;
}

export interface ModelAssumption {
  readonly id: string;
  readonly version: number;
  readonly statement: string;
}

export type Evidenced<T> =
  | { readonly state: "KNOWN"; readonly value: T; readonly source: EvidenceSource }
  | { readonly state: "KNOWN_NONE"; readonly source: EvidenceSource; readonly basis: string }
  | { readonly state: "UNKNOWN"; readonly reason: string; readonly source: EvidenceSource | null }
  | { readonly state: "NOT_APPLICABLE"; readonly reason: string }
  | { readonly state: "MODEL_ASSUMPTION"; readonly value: T; readonly assumption: ModelAssumption };

export type PlayableRace = (typeof PLAYABLE_RACES)[number];

export type ProfileIssueCode =
  | "SPEC_UNRESOLVED"
  | "SPEC_MISMATCH"
  | "COMBATANT_INFO_MISSING"
  | "LOADOUT_TABLE_UNAVAILABLE"
  | "TALENT_IMPORT_MISSING"
  | "TALENT_IMPORT_INVALID"
  | "TALENT_MISMATCH"
  | "TALENT_TREE_MISSING"
  | "EVIDENCE_ACTOR_MISMATCH"
  | "HERO_TREE_UNRESOLVED"
  | "HERO_TREE_CONTRADICTORY"
  | "HERO_TREE_MISMATCH"
  | "GEAR_ROW_UNREADABLE"
  | "GEAR_POSITION_MISSING"
  | "ITEM_LEVEL_UNKNOWN"
  | "BONUS_IDS_UNKNOWN"
  | "GEMS_UNKNOWN"
  | "ENCHANT_UNKNOWN"
  | "REQUIRED_ENCHANT_UNKNOWN"
  | "RACE_UNRESOLVED"
  // Non-blocking diagnostics.
  | "LEVEL_IS_MODEL_ASSUMPTION"
  | "REQUIRED_ENCHANT_ABSENT"
  | "TEMPORARY_ENCHANT_NOT_IN_PINNED_DATA"
  | "MODEL_VERSION_COMPATIBILITY_UNKNOWN"
  | "CRAFTED_STATS_FROM_BONUS_IDS";

export interface ProfileIssue {
  readonly code: ProfileIssueCode;
  readonly detail: string;
}

/** A temporary enchant as observed, with the engine token the pinned data resolves it to (if any). */
export type TemporaryEnchantEvidence = Evidenced<{
  readonly enchantId: number;
  readonly engineToken: string | null;
}>;

export interface EquipmentRecord {
  readonly slot: GearSlot;
  readonly wclPosition: number;
  readonly occupancy: "EQUIPPED" | "EMPTY" | "UNREADABLE" | "MISSING";
  readonly statless: boolean;
  readonly itemId: Evidenced<number>;
  readonly itemLevel: Evidenced<number>;
  /** Exactly as observed, order kept. Compared as a multiset (the engine reorders). */
  readonly bonusIds: Evidenced<readonly number[]>;
  readonly gems: Evidenced<readonly number[]>;
  readonly permanentEnchant: Evidenced<number>;
  readonly temporaryEnchant: TemporaryEnchantEvidence;
  readonly craftedStats: Evidenced<"ENCODED_IN_BONUS_IDS">;
  /** WCL set metadata: evidence of what was worn, not the engine's set authority. */
  readonly setId: number | null;
}

export type ConsumableKind = "FLASK" | "FOOD" | "POTION" | "AUGMENTATION";

export interface ConsumableFact {
  readonly kind: ConsumableKind;
  /** KNOWN = the consumable identity (spell + candidate items); rank may still be open. */
  readonly identity: Evidenced<{ readonly spellId: number; readonly itemIds: readonly number[] }>;
  readonly note: string;
}

export interface TalentsRecord {
  readonly importCode: Evidenced<string>;
  readonly decode:
    | {
        readonly state: "DECODED";
        readonly specId: number;
        readonly talents: readonly DecodedTalent[];
        readonly selectedSubTreeIds: readonly number[];
      }
    | { readonly state: "FAILED"; readonly failure: LoadoutDecodeFailure; readonly detail: string }
    | { readonly state: "NOT_ATTEMPTED"; readonly reason: string };
  readonly reconciliation: LoadoutReconciliation | { readonly state: "UNKNOWN"; readonly reason: string };
  readonly heroTree: Evidenced<{ readonly simcName: string; readonly subTreeId: number }>;
}

export interface EvidenceDocument {
  /** Committed artifact id. */
  readonly id: string;
  readonly sha256: string;
  readonly role: "COMBATANT_INFO" | "FIGHT_CONTEXT" | "EVENTS";
}

export interface CharacterProfile {
  readonly schemaVersion: typeof CHARACTER_PROFILE_SCHEMA_VERSION;
  readonly identity: {
    readonly specKey: string;
    readonly classId: Evidenced<number>;
    readonly specId: Evidenced<number>;
    readonly level: Evidenced<number>;
    readonly race: Evidenced<PlayableRace>;
  };
  readonly talents: TalentsRecord;
  readonly equipment: readonly EquipmentRecord[];
  /**
   * Setup evidence that is NOT written into the engine profile here: actual
   * consumables are applied by the environment reconstruction (G3-4).
   */
  readonly setupFacts: {
    readonly consumables: readonly ConsumableFact[];
  };
  /** Provenance — never part of the semantic profile hash. */
  readonly evidence: {
    readonly subject: { readonly fightRef: string; readonly actorId: number };
    readonly documents: readonly EvidenceDocument[];
  };
  readonly blockers: readonly ProfileIssue[];
  readonly diagnostics: readonly ProfileIssue[];
  /** Reconstruction alone never makes a profile SIMULATION_READY: only a fidelity MATCH does. */
  readonly reconstructionStatus: "AWAITING_FIDELITY" | "PROFILE_NOT_SIMULATION_READY";
}

export const known = <T>(value: T, kind: EvidenceSourceKind, field: string): Evidenced<T> => ({
  state: "KNOWN",
  value,
  source: { kind, field },
});

export const unknown = <T>(reason: string, kind: EvidenceSourceKind | null, field: string): Evidenced<T> => ({
  state: "UNKNOWN",
  reason,
  source: kind === null ? null : { kind, field },
});
