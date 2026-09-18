/**
 * The pinned canonical specialization roster (M11-A2).
 *
 * WHAT THIS IS
 *
 * Reference data about the GAME at the pinned SimulationCraft commit: every
 * playable specialization the generated DBC tables carry, with its SimC id,
 * class, display name and — where the spec's own passive states it — its
 * role. Produced by `scripts/authority/extract-simc-roster.mjs` from
 * `specialization_spells.inc`, `util.cpp` and `client_data_version.inc`, all
 * hashed into the artifact's provenance.
 *
 * WHAT THIS IS NOT
 *
 * Not analyzer registration and not support. A roster row says a
 * specialization EXISTS at this build. Whether this project analyzes it is
 * said by exactly one thing — a registration in the production catalog — and
 * the roster confers nothing on the thirty-eight rows that have none. The
 * only production consumer is the specialization module factory, which uses
 * the roster to refuse a `specId` that names no real specialization and to
 * carry the mechanically pinned SimC id and role on the module's identity.
 *
 * ROLE IS PINNED OR UNKNOWN, NEVER GUESSED. The extractor reads the
 * `Stat Negation Aura - <Stat> <DPS|Tank|Healer>` passive; a spec whose
 * rows carry none (the three Evoker specializations at this pin) is
 * `UNKNOWN` with `roleEvidence: null`, and stays so until a pinned source
 * establishes it mechanically.
 */

import artifact from "./spec-roster.json";

export const SPEC_ROSTER_DATASET_ID = "SIMC_SPECIALIZATION_ROSTER";

export type RosterRole = "DPS" | "TANK" | "HEALER" | "UNKNOWN";

export const ROSTER_ROLES = ["DPS", "TANK", "HEALER", "UNKNOWN"] as const satisfies readonly RosterRole[];

export interface RosterRoleEvidence {
  readonly method: "MACHINE_EXTRACTED_DBC_RECORD";
  readonly spellId: number;
  readonly spellName: string;
}

export interface RosterSpecialization {
  readonly simcSpecId: number;
  readonly simcEnumerator: string;
  readonly classId: number;
  /** SimulationCraft's class token, e.g. `deathknight`. */
  readonly classToken: string;
  /** SimulationCraft's long class name, e.g. `Death Knight`. */
  readonly className: string;
  readonly specKey: string;
  /** `<classToken>/<specKey>`, the key a `SpecId` is expected to equal. */
  readonly rosterKey: string;
  readonly displayName: string;
  readonly role: RosterRole;
  readonly roleEvidence: RosterRoleEvidence | null;
  readonly specPassiveSpellIds: readonly number[];
}

export interface RosterProvenance {
  readonly repository: string;
  readonly commitSha: string;
  readonly sources: readonly {
    readonly path: string;
    readonly sha256: string;
    readonly byteLength: number;
  }[];
  readonly clientDataWowVersion: string;
  readonly clientDataHotfixDate: string;
  readonly clientDataHotfixBuild: number;
  readonly clientDataHotfixHash: string;
  readonly extractorVersion: number;
  readonly extractedOn: string;
  readonly declaredRowCount: number;
  readonly excluded: {
    readonly petFamilies: readonly { readonly specId: number }[];
    readonly initialPlaceholders: readonly { readonly specId: number; readonly name: string }[];
  };
}

export type SpecRosterLoad =
  | {
      readonly ok: true;
      readonly artifactRevision: string;
      readonly provenance: RosterProvenance;
      readonly specializations: readonly RosterSpecialization[];
      readonly byRosterKey: ReadonlyMap<string, RosterSpecialization>;
    }
  | { readonly ok: false; readonly reason: string; readonly detail: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function int(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}
function str(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

const ROSTER_KEY = /^[a-z]+\/[a-z0-9_]+$/;

let cached: SpecRosterLoad | null = null;

/**
 * Validates and indexes the committed roster. Total: a malformed artifact is
 * a failed load, never a throw at import time and never a partial roster.
 */
export function pinnedSpecRoster(): SpecRosterLoad {
  if (cached !== null) return cached;
  const fail = (reason: string, detail: string): SpecRosterLoad => (cached = { ok: false, reason, detail });
  const raw: unknown = artifact;
  if (!isRecord(raw) || raw["artifactVersion"] !== 1 || raw["datasetId"] !== SPEC_ROSTER_DATASET_ID) {
    return fail(
      "ARTIFACT_IDENTITY_MISMATCH",
      "spec-roster.json is not artifact version 1 of the roster dataset",
    );
  }
  const artifactRevision = str(raw["artifactRevision"]);
  const provenance = raw["provenance"];
  const rows = raw["specializations"];
  if (artifactRevision === null || !isRecord(provenance) || !Array.isArray(rows)) {
    return fail(
      "ARTIFACT_SHAPE_INVALID",
      "spec-roster.json lacks artifactRevision, provenance or specializations",
    );
  }
  const commitSha = str(provenance["commitSha"]);
  const sources = provenance["sources"];
  const excluded = provenance["excluded"];
  if (
    commitSha === null ||
    !/^[0-9a-f]{40}$/.test(commitSha) ||
    !Array.isArray(sources) ||
    sources.length === 0 ||
    !isRecord(excluded) ||
    !Array.isArray(excluded["petFamilies"]) ||
    !Array.isArray(excluded["initialPlaceholders"]) ||
    int(provenance["declaredRowCount"]) === null ||
    str(provenance["clientDataWowVersion"]) === null
  ) {
    return fail("PROVENANCE_INVALID", "spec-roster.json provenance is incomplete");
  }
  for (const source of sources) {
    if (
      !isRecord(source) ||
      str(source["path"]) === null ||
      !/^[0-9a-f]{64}$/.test(String(source["sha256"]))
    ) {
      return fail("PROVENANCE_INVALID", "a roster source lacks a path or a SHA-256");
    }
  }

  const specializations: RosterSpecialization[] = [];
  const bySpecId = new Set<number>();
  const byRosterKey = new Map<string, RosterSpecialization>();
  for (const row of rows) {
    if (!isRecord(row)) return fail("ROW_INVALID", "a roster row is not an object");
    const simcSpecId = int(row["simcSpecId"]);
    const classId = int(row["classId"]);
    const simcEnumerator = str(row["simcEnumerator"]);
    const classToken = str(row["classToken"]);
    const className = str(row["className"]);
    const specKey = str(row["specKey"]);
    const rosterKey = str(row["rosterKey"]);
    const displayName = str(row["displayName"]);
    const role = row["role"];
    const evidence = row["roleEvidence"];
    const passives = row["specPassiveSpellIds"];
    if (
      simcSpecId === null ||
      classId === null ||
      classId === 0 ||
      simcEnumerator === null ||
      classToken === null ||
      className === null ||
      specKey === null ||
      rosterKey === null ||
      displayName === null ||
      !(ROSTER_ROLES as readonly unknown[]).includes(role) ||
      !Array.isArray(passives) ||
      passives.length === 0 ||
      !passives.every((id) => int(id) !== null)
    ) {
      return fail("ROW_INVALID", `roster row ${String(row["simcSpecId"])} is malformed`);
    }
    if (rosterKey !== `${classToken}/${specKey}` || !ROSTER_KEY.test(rosterKey)) {
      return fail(
        "ROW_INVALID",
        `roster row ${String(simcSpecId)} has an incoherent roster key '${rosterKey}'`,
      );
    }
    if (!displayName.endsWith(` ${className}`)) {
      return fail("ROW_INVALID", `roster row ${String(simcSpecId)} display name does not end with its class`);
    }
    if (/^Initial /.test(displayName)) {
      return fail("ROW_INVALID", `roster row ${String(simcSpecId)} is an Initial placeholder`);
    }
    let roleEvidence: RosterRoleEvidence | null = null;
    if (role === "UNKNOWN") {
      if (evidence !== null)
        return fail("ROW_INVALID", `roster row ${String(simcSpecId)} is UNKNOWN with evidence`);
    } else {
      if (
        !isRecord(evidence) ||
        evidence["method"] !== "MACHINE_EXTRACTED_DBC_RECORD" ||
        int(evidence["spellId"]) === null ||
        str(evidence["spellName"]) === null
      ) {
        return fail("ROW_INVALID", `roster row ${String(simcSpecId)} pins a role without DBC evidence`);
      }
      roleEvidence = {
        method: "MACHINE_EXTRACTED_DBC_RECORD",
        spellId: evidence["spellId"] as number,
        spellName: evidence["spellName"] as string,
      };
    }
    if (bySpecId.has(simcSpecId)) return fail("ROW_INVALID", `duplicate SimC spec id ${String(simcSpecId)}`);
    if (byRosterKey.has(rosterKey)) return fail("ROW_INVALID", `duplicate roster key ${rosterKey}`);
    const entry: RosterSpecialization = Object.freeze({
      simcSpecId,
      simcEnumerator,
      classId,
      classToken,
      className,
      specKey,
      rosterKey,
      displayName,
      role: role as RosterRole,
      roleEvidence,
      specPassiveSpellIds: Object.freeze([...(passives as number[])]),
    });
    bySpecId.add(simcSpecId);
    byRosterKey.set(rosterKey, entry);
    specializations.push(entry);
  }
  if (int(raw["playableSpecializationCount"]) !== specializations.length) {
    return fail("ROW_INVALID", "playableSpecializationCount disagrees with the rows");
  }
  cached = {
    ok: true,
    artifactRevision,
    provenance: provenance as unknown as RosterProvenance,
    specializations: Object.freeze(specializations),
    byRosterKey,
  };
  return cached;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetSpecRosterCache(): void {
  cached = null;
}

/** The roster row whose key equals a `SpecId`, or `null` when no such specialization exists at this pin. */
export function rosterSpecialization(rosterKey: string): RosterSpecialization | null {
  const loaded = pinnedSpecRoster();
  if (!loaded.ok) return null;
  return loaded.byRosterKey.get(rosterKey) ?? null;
}
