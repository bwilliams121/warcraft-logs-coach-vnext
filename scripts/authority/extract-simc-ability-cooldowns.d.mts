/**
 * Types for the ability-cooldown extractor's exported helpers, so the census
 * rules and the mechanical absence checks can be tested. The script stays
 * plain JavaScript; the CLI body runs behind an entry-point guard.
 */

export const TARGETS: Record<string, unknown>;

export function parseArgs(argv: readonly string[]): Record<string, string | true>;

export interface SpellRecord {
  readonly spellId: number;
  readonly nameEn: string;
  readonly cooldownMs: number;
  readonly categoryCooldownMs: number;
  readonly category: number;
  readonly categoryTypeMask: number;
  readonly charges: number;
  readonly chargeCooldownMs: number;
  readonly internalCooldownMs: number;
  readonly gcdMs: number;
  readonly classFamily: number;
  readonly classFlags: readonly number[];
  readonly attributes: readonly number[];
}

export interface AuraEffect {
  readonly effectId: number;
  readonly spellId: number;
  readonly index: number;
  readonly type: number;
  readonly subtype: number;
  readonly baseValue: number;
  readonly miscValue1: number;
  readonly miscValue2: number;
  readonly classFlags: readonly number[];
}

export function readSpellRecords(
  text: string,
  wantedIds: readonly number[],
  members: readonly string[],
):
  | { readonly ok: true; readonly records: Map<number, SpellRecord> }
  | { readonly ok: false; readonly error: string };

export function readSpellLabels(text: string): Map<number, number[]> | null;

export function readAuraEffects(
  text: string,
  wantedSpellIds: readonly number[],
  members: readonly string[],
): { readonly effects: AuraEffect[]; readonly examined: number };

/** How one passive aura effect would reach `target` under the generic parser, or null. */
export function passiveEffectMatch(
  effect: AuraEffect,
  ownerRecord: SpellRecord,
  target: SpellRecord,
  targetLabels: readonly number[],
): string | null;

export function structBody(
  text: string,
  name: string,
): { readonly startLine: number; readonly endLine: number; readonly text: string } | null;

export function formatArtifactJson(artifact: unknown): string;
