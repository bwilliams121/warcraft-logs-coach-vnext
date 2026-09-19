/**
 * Types for the Blood aura-duration extractor's exported helpers (M11-B4).
 *
 * The script itself stays plain JavaScript so `node` runs it with no
 * TypeScript runner. Only the pure parsers and matchers are exported, and only
 * so their rules can be tested; the CLI body runs behind an entry-point guard.
 */

export type EnumeratorResult =
  | { readonly ok: true; readonly values: Readonly<Record<string, number>> }
  | { readonly ok: false; readonly error: string };

export interface ParsedAuraSpellRecord {
  readonly abilityGameId: number;
  readonly displayNameEn: string;
  /** MILLISECONDS; may be the `-1` no-duration sentinel. */
  readonly baseDurationMs: number;
  readonly maxStack: number;
  readonly internalCooldownMs: number;
  readonly attributes: readonly number[];
  readonly classFlags: readonly number[];
  readonly classFamily: number;
  readonly effectIds: readonly number[];
}

export type SpellRowsResult =
  | { readonly ok: true; readonly records: Map<number, ParsedAuraSpellRecord> }
  | { readonly ok: false; readonly error: string };

export interface ParsedEffectRow {
  readonly effectId: number;
  readonly spellId: number | null;
  readonly index: number | null;
  readonly type: number | null;
  readonly subtype: number | null;
  readonly baseValue: number | null;
  readonly miscValue: number | null;
  readonly miscValue2: number | null;
  readonly classFlags: readonly number[];
}

export type EffectRowsResult =
  | { readonly ok: true; readonly rows: readonly ParsedEffectRow[] }
  | { readonly ok: false; readonly error: string };

export type LabelRowsResult =
  | { readonly ok: true; readonly labels: Map<number, readonly number[]> }
  | { readonly ok: false; readonly error: string };

export interface SpecializationSpellRow {
  readonly classId: number;
  readonly specId: number;
  readonly spellId: number;
  readonly displayNameEn: string;
}

export interface MatchedDurationModifier {
  readonly effectId: number;
  readonly spellId: number | null;
  readonly effectIndex: number | null;
  readonly effectSubtype: number | null;
  readonly kind: "FLAT_MS" | "PCT";
  readonly value: number | null;
  readonly matchedBy: "CLASS_FLAGS" | "LABEL";
  readonly label: number | null;
}

export function parseEnumerators(text: string, names: readonly string[]): EnumeratorResult;

export function parseSpellRows(
  text: string,
  wantedIds: Iterable<number>,
  fieldIndices: Readonly<Record<string, number>>,
  attributeCount: number,
  classFlagCount: number,
): SpellRowsResult;

export function hasAttribute(attributes: readonly number[], attr: number): boolean;

export function parseEffectRows(
  text: string,
  fieldIndices: Readonly<Record<string, number>>,
  classFlagCount: number,
): EffectRowsResult;

export function parseLabelRows(text: string): LabelRowsResult;

export function parseSpecializationSpells(text: string): readonly SpecializationSpellRow[];

export function durationModifiersFor(
  aura: Pick<ParsedAuraSpellRecord, "abilityGameId" | "classFamily" | "classFlags">,
  effects: readonly ParsedEffectRow[],
  spells: ReadonlyMap<number, Pick<ParsedAuraSpellRecord, "classFamily" | "displayNameEn">>,
  labels: ReadonlyMap<number, readonly number[]>,
  enums: Readonly<Record<string, number>>,
): readonly MatchedDurationModifier[];
