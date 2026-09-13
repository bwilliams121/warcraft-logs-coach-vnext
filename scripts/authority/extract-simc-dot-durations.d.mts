/**
 * Types for the DoT-duration extractor's exported helpers.
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

export type ScalarFieldIndexResult =
  | {
      readonly ok: true;
      readonly indices: Readonly<Record<string, number>>;
      readonly fields: readonly string[];
    }
  | { readonly ok: false; readonly error: string };

export type MillisecondColumnResult =
  { readonly ok: true; readonly value: number } | { readonly ok: false; readonly error: string };

export interface ParsedDotRecord {
  readonly abilityGameId: number;
  readonly displayNameEn: string;
  /** MILLISECONDS. May be the `-1` permanent-aura sentinel; the verifier rejects it. */
  readonly baseDurationMs: number;
  readonly baseCooldownMs: number;
  /** Read only to cross-check the row layout against what M5-C1 recorded. */
  readonly baseGcdMs: number;
}

export type SpellRecordsResult =
  | { readonly ok: true; readonly records: Map<number, ParsedDotRecord>; readonly rowsScanned: number }
  | { readonly ok: false; readonly error: string };

export interface SpecializationSpellRow {
  readonly classId: number;
  readonly specId: number;
  readonly spellId: number;
  readonly replacesSpellId: number;
  readonly displayNameEn: string;
}

export type SpecializationSpellResult =
  | { readonly ok: true; readonly row: SpecializationSpellRow }
  | { readonly ok: false; readonly error: string };

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
 * Derives the flat index of every requested scalar member of `spell_data_t`.
 *
 * Skips the forward declaration, strips trailing comments before looking for a
 * method, and stops at the first array member — the point where a generated row
 * stops being flat comma-separated scalars.
 */
export function deriveScalarFieldIndices(
  headerText: string,
  wantedNames: readonly string[],
): ScalarFieldIndexResult;

/**
 * Reads a millisecond column the struct declares as `double`.
 *
 * Accepts both printings and the negative permanent-aura sentinel. Refuses a
 * fractional value rather than rounding it.
 */
export function readMillisecondColumn(
  raw: string | undefined,
  fieldName: string,
  abilityGameId: number,
): MillisecondColumnResult;

/** Extracts duration, cooldown and GCD for each wanted id. A repeated id is an error, not a pick. */
export function parseSpellRecords(
  text: string,
  wantedIds: Iterable<number>,
  fieldIndices: Readonly<Record<string, number>>,
): SpellRecordsResult;

/** Parses `specialization_spells.inc` rows. This is the BINDING source, not a cross-check. */
export function parseSpecializationSpells(text: string): readonly SpecializationSpellRow[];

/**
 * Resolves one `find_specialization_spell( name )` for Assassination Rogue.
 *
 * A name matching zero or several rows is an error rather than a pick.
 */
export function resolveSpecializationSpell(
  rows: readonly SpecializationSpellRow[],
  displayNameEn: string,
): SpecializationSpellResult;

/** Checks every required fact. An empty list is the only thing that licenses writing. */
export function verifyRequiredFacts(input: {
  readonly build: ClientDataVersion;
  readonly records: ReadonlyMap<number, ParsedDotRecord>;
  readonly bindings: ReadonlyMap<string, SpecializationSpellRow>;
  readonly fieldIndices: Readonly<Record<string, number>>;
  /** The same record map, read for the M5-C1 GCD cross-check. */
  readonly gcdAnchorRecords: ReadonlyMap<number, ParsedDotRecord>;
}): readonly string[];

/**
 * Serialises the artifact the way Prettier would, so the generated file passes
 * `prettier --check` without a manual reformat.
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
  readonly records: ReadonlyMap<number, ParsedDotRecord>;
  readonly bindings: ReadonlyMap<string, SpecializationSpellRow>;
  readonly extractedOn: string;
  /**
   * Measured hash of `engine/class_modules/sc_rogue.cpp`, for the hand-reviewed
   * action-token binding lines. Absent both here and in `sources`, this throws
   * rather than emitting a binding whose provenance cannot be re-checked.
   */
  readonly rogueModuleSha256?: string;
}): unknown;
