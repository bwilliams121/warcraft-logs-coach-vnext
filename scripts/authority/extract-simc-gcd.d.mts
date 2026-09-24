/**
 * Types for the GCD extractor's exported helpers.
 *
 * The script itself stays plain JavaScript so `node` runs it with no TypeScript
 * runner and no new dependency. Only the pure parsers and the fact verifier are
 * exported, and only so their rules can be tested; the CLI body runs behind an
 * entry-point guard and is not reachable by importing this module.
 */

export interface ClientDataVersion {
  readonly wowVersion: string;
  readonly hotfixDate: string;
  readonly hotfixBuild: number;
  readonly hotfixHash: string;
}

export type ClientDataVersionResult =
  { readonly ok: true; readonly value: ClientDataVersion } | { readonly ok: false; readonly error: string };

export type GcdFieldIndexResult =
  | { readonly ok: true; readonly index: number; readonly fields: readonly string[] }
  | { readonly ok: false; readonly error: string };

export interface ParsedSpellRecord {
  readonly abilityGameId: number;
  readonly displayNameEn: string;
  readonly baseGcdMs: number;
}

export type SpellRecordsResult =
  | { readonly ok: true; readonly records: Map<number, ParsedSpellRecord>; readonly rowsScanned: number }
  | { readonly ok: false; readonly error: string };

export interface ClassSpellRow {
  readonly classId: number;
  readonly specId: number;
  readonly spellId: number;
  readonly replacesSpellId: number;
  readonly displayNameEn: string;
}

export function parseArgs(argv: readonly string[]): Record<string, string | true>;

/**
 * The pinned-hash gate for one input file.
 *
 * `null` when acceptable. An absent expectation is acceptable — that is how a
 * re-pin discovers the new hash — but a mismatched one never is.
 */
export function sourceHashProblem(
  path: string,
  expectedSha256: string | true | undefined,
  actualSha256: string,
): string | null;

/** Reads the build stamp. Every field is required; a partial stamp is an error. */
export function parseClientDataVersion(text: string): ClientDataVersionResult;

/**
 * Derives the flat index of `_gcd` from the `spell_data_t` DEFINITION.
 *
 * Skips the forward declaration, strips trailing comments before looking for a
 * method, and stops at the first array member — the point where a generated row
 * stops being flat comma-separated scalars.
 */
export function deriveGcdFieldIndex(headerText: string): GcdFieldIndexResult;

/** Extracts name and `_gcd` for each wanted id. A repeated id is an error, not a pick. */
export function parseSpellRecords(
  text: string,
  wantedIds: Iterable<number>,
  gcdFieldIndex: number,
): SpellRecordsResult;

/** Parses `class_spells.inc` rows. Used only to cross-check class-ability bindings. */
export function parseClassSpells(text: string): readonly ClassSpellRow[];

/** Checks every required fact. An empty list is the only thing that licenses writing. */
export function verifyRequiredFacts(input: {
  readonly build: ClientDataVersion;
  readonly records: ReadonlyMap<number, ParsedSpellRecord>;
  readonly classSpells: readonly ClassSpellRow[];
  readonly gcdFieldIndex: number;
  readonly expectedGcdFieldIndex: number;
  readonly measuredSourcePaths?: ReadonlySet<string>;
  /** The generated spell data, for the `__spelleffect_data` trigger table. */
  readonly spellDataText?: string;
  /** `spell_data.hpp`, for deriving the effect struct's field indices. */
  readonly spellDataLayoutText?: string;
}): readonly string[];

/** Field indices of `spelleffect_data_t`, derived from the pinned header. */
export type EffectFieldIndices =
  | {
      readonly ok: true;
      readonly fields: readonly string[];
      readonly spellIdIndex: number;
      readonly effectIndexIndex: number;
      readonly triggerSpellIdIndex: number;
    }
  | { readonly ok: false; readonly error: string };

export function deriveEffectFieldIndices(headerText: string): EffectFieldIndices;

/** `spellId -> effectIndex -> triggerSpellId`, read from `__spelleffect_data`. */
export type EffectTriggerResult =
  | {
      readonly ok: true;
      readonly bySpell: ReadonlyMap<number, ReadonlyMap<number, number>>;
      readonly rowsScanned: number;
    }
  | { readonly ok: false; readonly error: string };

export function parseEffectTriggers(
  text: string,
  wantedSpellIds: Iterable<number>,
  indices: {
    readonly spellIdIndex: number;
    readonly effectIndexIndex: number;
    readonly triggerSpellIdIndex: number;
  },
): EffectTriggerResult;

/**
 * Serialises the artifact the way Prettier would, so the generated file passes
 * `prettier --check` without a manual reformat. Throws if a collapsed line would
 * exceed `printWidth`.
 */
export function formatArtifactJson(artifact: unknown): string;

/** Builds the artifact body. Deterministic apart from `extractedOn`. */
export function buildArtifact(input: {
  readonly commitSha: string;
  readonly sources: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly byteLength: number;
  }[];
  readonly build: ClientDataVersion;
  readonly records: ReadonlyMap<number, ParsedSpellRecord>;
  readonly extractedOn: string;
  /**
   * Measured hash of `engine/class_modules/sc_rogue.cpp`, for the hand-reviewed
   * token bindings. Taken from `sources` when present; absent both, this throws
   * rather than emitting a binding whose provenance cannot be re-checked.
   */
  readonly rogueModuleSha256?: string;
}): unknown;

/** One extractable specialization profile (M10-C). Coordinates and facts, never a parser. */
export interface GcdExtractionTarget {
  readonly datasetId: string;
  readonly classId: number;
  readonly className: string;
  readonly sources: Readonly<Record<string, string>>;
  readonly classModulePath: string;
  readonly handReviewedPaths: readonly string[];
  readonly requiredFacts: {
    readonly clientDataWowVersion: string;
    readonly clientDataHotfixBuild: number;
    readonly sanityAnchors: readonly {
      readonly abilityGameId: number;
      readonly displayNameEn: string;
      readonly baseGcdMs: number;
    }[];
    readonly abilities: readonly {
      readonly abilityGameId: number;
      readonly displayNameEn: string;
      readonly baseGcdMs: number;
    }[];
    readonly tokenBindings: readonly {
      readonly simcToken: string;
      readonly candidateAbilityGameIds: readonly number[];
    }[];
    readonly metaActionLanes: readonly { readonly simcToken: string; readonly triggerGcdMs: number }[];
  };
  readonly defaultOut: string;
}

export const TARGETS: Readonly<
  Record<"rogue-assassination" | "paladin-protection" | "monk-brewmaster", GcdExtractionTarget>
>;
