/**
 * Types for the preparation consumable extractor's exported helpers.
 *
 * The script stays plain JavaScript so `node` runs it with no TypeScript
 * runner. Only the pure parsers and classification rules are exported, so
 * their rules can be tested; the CLI body runs behind an entry-point guard.
 */

export type ConsumableKind = "HEALTH_POTION" | "HEALTHSTONE" | "COMBAT_POTION";

export interface ParsedSpell {
  readonly spellId: number;
  readonly name: string;
  readonly raceMask: string;
  readonly cooldownMs: number;
  readonly categoryCooldownMs: number;
  readonly category: number;
  readonly durationMs: number;
}

export interface ParsedSpellData {
  readonly spells: Map<number, ParsedSpell>;
  readonly effectTypes: Map<number, number[]>;
}

export interface ClassifiedConsumable {
  readonly spellId: number;
  readonly name: string;
  readonly kind: ConsumableKind;
  readonly cooldownCategory: number;
  readonly appliesAura: boolean;
  readonly auraDurationMs: number | null;
}

export declare const EXTRACTOR_VERSION: number;
export declare const SHARED_COOLDOWN_CATEGORIES: {
  readonly HEALTH_POTION: number;
  readonly COMBAT_POTION: number;
};
export declare const ANCHORS: readonly {
  readonly spellId: number;
  readonly name: string;
  readonly category: number;
  readonly effect: number;
  readonly kind: ConsumableKind;
}[];

export declare function parseSpellData(text: string): ParsedSpellData;
export declare function parseRacialSpellIds(text: string): Set<number>;
export declare function anchorProblems(parsed: ParsedSpellData): string[];
/** Throws when a racial ability would be classified. */
export declare function classifyConsumables(
  parsed: ParsedSpellData,
  racialIds: Set<number>,
): ClassifiedConsumable[];
