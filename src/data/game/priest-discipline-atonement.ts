/**
 * Discipline Priest's Atonement spell identity (HEAL-B3): WHICH spell id is the
 * Atonement buff a Discipline Priest applies to an ally, WHICH is the heal
 * Warcraft Logs reports for Atonement, and which other pinned spells share the
 * name. Nothing else.
 *
 * Spec-owned runtime data: consumed only by `src/specs/priest/discipline/`
 * (`m11a2-cross-spec-isolation` R3), never by the generic `src/healing/`.
 *
 * Each entry is a verbatim `sc_spell_data.inc` row of the pinned
 * SimulationCraft commit (33622e9d, client data 12.1.0.69587) named
 * "Atonement", without its trailing effect-id comment. The artifact lists
 * every such row (six). Exactly one is the ATONEMENT_BUFF (194384) and exactly
 * one the ATONEMENT_HEAL (81751), a hand-reviewed selection corroborated by
 * committed Warcraft Logs evidence and recorded per entry. Every other row is
 * SAME_NAME_UNIDENTIFIED: an event of one of them is never silently dropped by
 * a consumer, because it could be Atonement under an id this dataset has not
 * reviewed.
 *
 * WHAT IS NEVER HERE. No duration, amount, transfer rate, target cap or
 * modifier. An Atonement's active interval is not derivable from this data,
 * and no consumer may pretend it is.
 */

import artifact from "./priest-discipline-atonement.json";

export const DISCIPLINE_PRIEST_ATONEMENT_DATASET_ID = "SIMC_DBC_PRIEST_DISCIPLINE_ATONEMENT";

export type AtonementSpellRole = "ATONEMENT_BUFF" | "ATONEMENT_HEAL" | "SAME_NAME_UNIDENTIFIED";

export interface AtonementSpellIdentity {
  readonly abilityGameId: number;
  readonly role: AtonementSpellRole;
  readonly pinnedSpellRow: string;
}

export type DisciplinePriestAtonementLoad =
  | {
      readonly ok: true;
      readonly datasetId: typeof DISCIPLINE_PRIEST_ATONEMENT_DATASET_ID;
      readonly artifactRevision: string;
      readonly commitSha: string;
      readonly clientDataWowVersion: string;
      /** The aura id of the Atonement buff on an ally. */
      readonly buffAbilityGameId: number;
      /** The id of the healing event Warcraft Logs reports for Atonement. */
      readonly healAbilityGameId: number;
      /** Every other pinned spell named "Atonement". */
      readonly sameNameAbilityGameIds: readonly number[];
      readonly spells: readonly AtonementSpellIdentity[];
    }
  | { readonly ok: false; readonly reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

/** The name and the spell id of one pinned `spell_data_t` row: its first two fields. */
const SPELL_ROW = /^\{ "([^"]*)"\s*,\s*(\d+), .* \}$/;

const ROLES: readonly AtonementSpellRole[] = ["ATONEMENT_BUFF", "ATONEMENT_HEAL", "SAME_NAME_UNIDENTIFIED"];

/** Validates the artifact, failing closed on any shape or coherence defect. */
export function parseDisciplinePriestAtonement(raw: unknown): DisciplinePriestAtonementLoad {
  const fail = (reason: string): DisciplinePriestAtonementLoad => ({ ok: false, reason });
  if (!isRecord(raw) || raw["artifactVersion"] !== 1) return fail("UNSUPPORTED_ARTIFACT_VERSION");
  if (raw["datasetId"] !== DISCIPLINE_PRIEST_ATONEMENT_DATASET_ID) return fail("DATASET_ID_MISMATCH");
  const revision = raw["artifactRevision"];
  const provenance = raw["provenance"];
  if (typeof revision !== "string" || !isRecord(provenance)) return fail("PROVENANCE_MISSING");
  const commitSha = provenance["commitSha"];
  const build = provenance["clientDataWowVersion"];
  if (typeof commitSha !== "string" || !/^[0-9a-f]{40}$/.test(commitSha) || typeof build !== "string") {
    return fail("PROVENANCE_MISSING");
  }
  if (provenance["classId"] !== 5 || provenance["specId"] !== 256) return fail("SPECIALIZATION_MISMATCH");
  const entries = raw["spells"];
  if (!Array.isArray(entries) || entries.length === 0) return fail("NO_ENTRIES");

  const spells: AtonementSpellIdentity[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) return fail("ENTRY_INVALID");
    const id = entry["abilityGameId"];
    const role = entry["role"];
    const row = entry["pinnedSpellRow"];
    if (!isId(id) || !ROLES.includes(role as AtonementSpellRole) || typeof row !== "string") {
      return fail("ENTRY_INVALID");
    }
    // The row must BE the spell it claims: named "Atonement", carrying this id.
    const fields = SPELL_ROW.exec(row);
    if (fields === null || fields[1] !== "Atonement" || fields[2] !== String(id)) {
      return fail("PINNED_ROW_MISMATCH");
    }
    spells.push({ abilityGameId: id, role: role as AtonementSpellRole, pinnedSpellRow: row });
  }
  if (new Set(spells.map((spell) => spell.abilityGameId)).size !== spells.length)
    return fail("DUPLICATE_ABILITY");
  const buffs = spells.filter((spell) => spell.role === "ATONEMENT_BUFF");
  const heals = spells.filter((spell) => spell.role === "ATONEMENT_HEAL");
  if (buffs.length !== 1 || heals.length !== 1) return fail("ROLE_INCOHERENT");
  return {
    ok: true,
    datasetId: DISCIPLINE_PRIEST_ATONEMENT_DATASET_ID,
    artifactRevision: revision,
    commitSha,
    clientDataWowVersion: build,
    buffAbilityGameId: buffs[0]!.abilityGameId,
    healAbilityGameId: heals[0]!.abilityGameId,
    sameNameAbilityGameIds: spells
      .filter((spell) => spell.role === "SAME_NAME_UNIDENTIFIED")
      .map((spell) => spell.abilityGameId),
    spells,
  };
}

let cached: DisciplinePriestAtonementLoad | null = null;

/** The pinned dataset, or the reason it could not be used. */
export function pinnedDisciplinePriestAtonement(): DisciplinePriestAtonementLoad {
  cached ??= parseDisciplinePriestAtonement(artifact);
  return cached;
}
