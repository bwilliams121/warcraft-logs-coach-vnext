/**
 * Reviewed recipient cooldown identity (M13-C): the shared answer to "which
 * observable cooldown ids does specialization X have?", for analysis that
 * looks at ANOTHER player's casts (Augmentation support overlap today).
 *
 * WHY A SHARED DATASET
 *
 * A specialization's own runtime data is private to its tree
 * (`m11a2-cross-spec-isolation` R3): the Augmentation evaluator may not import
 * Blood's or Restoration's datasets. This module is class-neutral shared data
 * instead. Each entry restates ids that one specialization's pinned dataset
 * already records, names that source and the criterion that selected them,
 * and carries the SimulationCraft pin. It imports no specialization dataset;
 * `tests/unit/data/recipient-cooldown-identities.test.ts` re-derives every
 * selection from its source, so a restated id cannot drift.
 *
 * WHAT A LOOKUP SAYS
 *
 * - IDENTIFIED: the reviewed ids, with provenance. Always a REVIEWED_SUBSET:
 *   the list is what was reviewed, never "every cooldown this specialization
 *   has". A consumer may say "none of these ids was cast", never "no cooldown
 *   was used".
 * - UNKNOWN: the player's specialization is not established (M13-B reasons),
 *   or this registry could not be loaded. Never a guess from class, from
 *   abilities cast, or from a pet's owner.
 * - UNSUPPORTED: the specialization is stated, but no reviewed identity
 *   exists for it. Never an empty list.
 *
 * The match is the Warcraft Logs-stated class and specialization strings,
 * exactly as committed evidence records them for each entry. A lookup is a
 * table read: it makes no gameplay judgement.
 */

import type {
  SpecializationUnknownReason,
  StatedSpecialization,
} from "../../engine/normalization/friendly-specializations.js";

import artifact from "./recipient-cooldown-identities.json";
import { rosterSpecialization } from "./spec-roster.js";

export const RECIPIENT_COOLDOWN_IDENTITY_DATASET_ID = "REVIEWED_RECIPIENT_COOLDOWN_IDENTITIES";

export const RECIPIENT_COOLDOWN_SELECTION_CRITERIA = [
  "PINNED_COOLDOWN_AT_LEAST_60S",
  "REVIEWED_HEALING_COOLDOWN",
] as const;
export type RecipientCooldownSelectionCriterion = (typeof RECIPIENT_COOLDOWN_SELECTION_CRITERIA)[number];

export interface RecipientCooldown {
  readonly abilityGameId: number;
  readonly displayNameEn: string;
}

export interface RecipientCooldownSpecialization {
  readonly rosterKey: string;
  readonly simcSpecId: number;
  readonly wclClassName: string;
  readonly wclSpecName: string;
  /** Committed fight contexts that state this class and specialization under these strings. */
  readonly wclNameEvidence: readonly string[];
  /** The specialization dataset the ids are restated from. */
  readonly source: { readonly datasetId: string; readonly artifactRevision: string };
  readonly criterion: RecipientCooldownSelectionCriterion;
  readonly cooldowns: readonly RecipientCooldown[];
}

export interface RecipientCooldownRegistryDataset {
  readonly datasetId: typeof RECIPIENT_COOLDOWN_IDENTITY_DATASET_ID;
  readonly artifactRevision: string;
  readonly commitSha: string;
  readonly clientDataWowVersion: string;
}

export type RecipientCooldownRegistryLoad =
  | (RecipientCooldownRegistryDataset & {
      readonly ok: true;
      readonly criteria: Readonly<
        Record<RecipientCooldownSelectionCriterion, { readonly minimumCooldownMs: number | null }>
      >;
      readonly specializations: readonly RecipientCooldownSpecialization[];
    })
  | { readonly ok: false; readonly reason: string };

export type RecipientCooldownIdentityResolution =
  | {
      readonly state: "IDENTIFIED";
      readonly rosterKey: string;
      readonly simcSpecId: number;
      readonly abilityGameIds: readonly number[];
      readonly cooldowns: readonly RecipientCooldown[];
      /** The ids are the reviewed ones, never every cooldown of the specialization. */
      readonly coverage: "REVIEWED_SUBSET";
      readonly criterion: RecipientCooldownSelectionCriterion;
      readonly source: RecipientCooldownSpecialization["source"];
      readonly dataset: RecipientCooldownRegistryDataset;
    }
  | {
      readonly state: "UNKNOWN";
      readonly reason: "SPECIALIZATION_NOT_ESTABLISHED";
      readonly specializationReason: SpecializationUnknownReason;
    }
  | { readonly state: "UNKNOWN"; readonly reason: "REGISTRY_UNAVAILABLE"; readonly detail: string }
  | {
      readonly state: "UNSUPPORTED";
      readonly reason: "NO_REVIEWED_COOLDOWN_IDENTITY";
      readonly className: string;
      readonly specName: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;
const isText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

/** Validates the artifact, failing closed on any shape or coherence defect. Never a partial registry. */
export function parseRecipientCooldownIdentities(raw: unknown): RecipientCooldownRegistryLoad {
  const fail = (reason: string): RecipientCooldownRegistryLoad => ({ ok: false, reason });
  if (!isRecord(raw) || raw["artifactVersion"] !== 1) return fail("UNSUPPORTED_ARTIFACT_VERSION");
  if (raw["datasetId"] !== RECIPIENT_COOLDOWN_IDENTITY_DATASET_ID) return fail("DATASET_ID_MISMATCH");
  const revision = raw["artifactRevision"];
  const provenance = raw["provenance"];
  if (!isText(revision) || !isRecord(provenance)) return fail("PROVENANCE_MISSING");
  const commitSha = provenance["commitSha"];
  const build = provenance["clientDataWowVersion"];
  if (typeof commitSha !== "string" || !/^[0-9a-f]{40}$/.test(commitSha) || !isText(build)) {
    return fail("PROVENANCE_MISSING");
  }

  const rawCriteria = raw["criteria"];
  if (!isRecord(rawCriteria)) return fail("CRITERIA_INVALID");
  const criteria = {} as Record<RecipientCooldownSelectionCriterion, { minimumCooldownMs: number | null }>;
  for (const name of RECIPIENT_COOLDOWN_SELECTION_CRITERIA) {
    const criterion = rawCriteria[name];
    if (!isRecord(criterion) || !isText(criterion["definition"])) return fail("CRITERIA_INVALID");
    const minimum = criterion["minimumCooldownMs"];
    if (minimum !== null && !isId(minimum)) return fail("CRITERIA_INVALID");
    criteria[name] = { minimumCooldownMs: minimum };
  }
  if (Object.keys(rawCriteria).length !== RECIPIENT_COOLDOWN_SELECTION_CRITERIA.length) {
    return fail("CRITERIA_INVALID");
  }

  const rows = raw["specializations"];
  if (!Array.isArray(rows) || rows.length === 0) return fail("NO_ENTRIES");
  const specializations: RecipientCooldownSpecialization[] = [];
  const rosterKeys = new Set<string>();
  const wclNames = new Set<string>();
  for (const row of rows) {
    if (!isRecord(row)) return fail("ENTRY_INVALID");
    const rosterKey = row["rosterKey"];
    const simcSpecId = row["simcSpecId"];
    const wclClassName = row["wclClassName"];
    const wclSpecName = row["wclSpecName"];
    const evidence = row["wclNameEvidence"];
    const source = row["source"];
    const criterion = row["criterion"];
    const entries = row["cooldowns"];
    if (
      !isText(rosterKey) ||
      !isId(simcSpecId) ||
      !isText(wclClassName) ||
      !isText(wclSpecName) ||
      !Array.isArray(evidence) ||
      evidence.length === 0 ||
      !evidence.every((path) => isText(path) && path.startsWith("tests/evidence/artifacts/")) ||
      !isRecord(source) ||
      !isText(source["datasetId"]) ||
      !isText(source["artifactRevision"]) ||
      !(RECIPIENT_COOLDOWN_SELECTION_CRITERIA as readonly unknown[]).includes(criterion) ||
      !Array.isArray(entries) ||
      entries.length === 0
    ) {
      return fail("ENTRY_INVALID");
    }
    // The entry must name a real specialization of the pinned roster, by both keys.
    const roster = rosterSpecialization(rosterKey);
    if (roster === null || roster.simcSpecId !== simcSpecId) return fail("ROSTER_MISMATCH");
    if (rosterKeys.has(rosterKey)) return fail("DUPLICATE_SPECIALIZATION");
    // One stated name pair answers exactly one entry.
    const nameKey = `${wclClassName}\u0000${wclSpecName}`;
    if (wclNames.has(nameKey)) return fail("DUPLICATE_SPECIALIZATION");
    rosterKeys.add(rosterKey);
    wclNames.add(nameKey);

    const cooldowns: RecipientCooldown[] = [];
    for (const entry of entries) {
      if (!isRecord(entry) || !isId(entry["abilityGameId"]) || !isText(entry["displayNameEn"])) {
        return fail("ENTRY_INVALID");
      }
      cooldowns.push(
        Object.freeze({ abilityGameId: entry["abilityGameId"], displayNameEn: entry["displayNameEn"] }),
      );
    }
    if (new Set(cooldowns.map((cooldown) => cooldown.abilityGameId)).size !== cooldowns.length) {
      return fail("DUPLICATE_ABILITY");
    }
    specializations.push(
      Object.freeze({
        rosterKey,
        simcSpecId,
        wclClassName,
        wclSpecName,
        wclNameEvidence: Object.freeze([...(evidence as string[])]),
        source: Object.freeze({
          datasetId: source["datasetId"],
          artifactRevision: source["artifactRevision"],
        }),
        criterion: criterion as RecipientCooldownSelectionCriterion,
        cooldowns: Object.freeze(cooldowns),
      }),
    );
  }
  return {
    ok: true,
    datasetId: RECIPIENT_COOLDOWN_IDENTITY_DATASET_ID,
    artifactRevision: revision,
    commitSha,
    clientDataWowVersion: build,
    criteria,
    specializations: Object.freeze(specializations),
  };
}

let cached: RecipientCooldownRegistryLoad | null = null;

/** The committed registry, or the reason it could not be used. */
export function pinnedRecipientCooldownIdentities(): RecipientCooldownRegistryLoad {
  cached ??= parseRecipientCooldownIdentities(artifact);
  return cached;
}

/**
 * The reviewed cooldown identity of a player with this stated specialization.
 * Total and fail closed: see the module comment for what each state means.
 */
export function recipientCooldownIdentityOf(
  stated: StatedSpecialization,
  registry: RecipientCooldownRegistryLoad = pinnedRecipientCooldownIdentities(),
): RecipientCooldownIdentityResolution {
  if (stated.state !== "STATED") {
    return {
      state: "UNKNOWN",
      reason: "SPECIALIZATION_NOT_ESTABLISHED",
      specializationReason: stated.reason,
    };
  }
  if (!registry.ok) return { state: "UNKNOWN", reason: "REGISTRY_UNAVAILABLE", detail: registry.reason };
  const entry = registry.specializations.find(
    (candidate) => candidate.wclClassName === stated.className && candidate.wclSpecName === stated.specName,
  );
  if (entry === undefined) {
    return {
      state: "UNSUPPORTED",
      reason: "NO_REVIEWED_COOLDOWN_IDENTITY",
      className: stated.className,
      specName: stated.specName,
    };
  }
  return {
    state: "IDENTIFIED",
    rosterKey: entry.rosterKey,
    simcSpecId: entry.simcSpecId,
    abilityGameIds: entry.cooldowns.map((cooldown) => cooldown.abilityGameId),
    cooldowns: entry.cooldowns,
    coverage: "REVIEWED_SUBSET",
    criterion: entry.criterion,
    source: entry.source,
    dataset: {
      datasetId: registry.datasetId,
      artifactRevision: registry.artifactRevision,
      commitSha: registry.commitSha,
      clientDataWowVersion: registry.clientDataWowVersion,
    },
  };
}
