/**
 * Augmentation Evoker's support-ability identity (M13-A): WHICH spell ids are
 * the casts and auras of Ebon Might, Prescience and Breath of Eons, and
 * nothing else about them.
 *
 * Spec-owned runtime data, consumed only by `src/specs/evoker/augmentation/`
 * (`m11a2-cross-spec-isolation` R3). The shared `src/support/` primitives
 * take ability ids as input and never import this file.
 *
 * Each cast identity is a verbatim specialization-tree row of the pinned
 * SimulationCraft `trait_data.inc` (commit 33622e9d, client data
 * 12.1.0.69587). Each aura identity is the verbatim `sc_evoker.cpp` line, at
 * the same commit, that binds the buff to its spell id. No duration, pandemic
 * rule, cooldown, charge count or effect is claimed: an aura window's end is
 * what Warcraft Logs observed, never a nominal duration.
 *
 * Breath of Eons has two cast ids: the talent (403631) and the Scalecommander
 * Maneuverability variant (442204), which the module treats as the same
 * action. No Breath of Eons aura is registered: the pinned sources bind none
 * to an ally or to the Evoker, so any observed aura of those ids is reported
 * as an observation only.
 */

import artifact from "./evoker-augmentation-support-abilities.json";

export const AUGMENTATION_SUPPORT_ABILITY_DATASET_ID = "SIMC_EVOKER_AUGMENTATION_SUPPORT_ABILITIES";

export const AUGMENTATION_SUPPORT_ABILITY_KEYS = ["EBON_MIGHT", "PRESCIENCE", "BREATH_OF_EONS"] as const;
export type AugmentationSupportAbilityKey = (typeof AUGMENTATION_SUPPORT_ABILITY_KEYS)[number];

export interface PinnedAuraIdentity {
  readonly abilityGameId: number;
  readonly moduleLine: string;
}

export interface AugmentationSupportAbility {
  readonly key: AugmentationSupportAbilityKey;
  readonly displayNameEn: string;
  readonly castAbilityGameIds: readonly number[];
  readonly traitRow: string;
  /** The buff the Evoker places on an ally, when the pinned module binds one. */
  readonly allyAura: PinnedAuraIdentity | null;
  /** The buff the Evoker places on itself, when the pinned module binds one. */
  readonly selfAura: PinnedAuraIdentity | null;
}

export type AugmentationSupportAbilityLoad =
  | {
      readonly ok: true;
      readonly datasetId: typeof AUGMENTATION_SUPPORT_ABILITY_DATASET_ID;
      readonly artifactRevision: string;
      readonly commitSha: string;
      readonly clientDataWowVersion: string;
      readonly abilities: ReadonlyMap<AugmentationSupportAbilityKey, AugmentationSupportAbility>;
    }
  | { readonly ok: false; readonly reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

/** A module line proves an id only if the id appears in it as a whole number. */
const lineNames = (line: unknown, id: number): line is string =>
  typeof line === "string" && new RegExp(`(^|[^0-9])${String(id)}([^0-9]|$)`).test(line);

function parseAura(raw: unknown): PinnedAuraIdentity | null | "INVALID" {
  if (raw === null) return null;
  if (!isRecord(raw)) return "INVALID";
  const id = raw["abilityGameId"];
  const line = raw["moduleLine"];
  if (!isId(id) || !lineNames(line, id)) return "INVALID";
  return { abilityGameId: id, moduleLine: line };
}

/** Validates the artifact, failing closed on any shape or coherence defect. */
export function parseAugmentationSupportAbilities(raw: unknown): AugmentationSupportAbilityLoad {
  const fail = (reason: string): AugmentationSupportAbilityLoad => ({ ok: false, reason });
  if (!isRecord(raw) || raw["artifactVersion"] !== 1) return fail("UNSUPPORTED_ARTIFACT_VERSION");
  if (raw["datasetId"] !== AUGMENTATION_SUPPORT_ABILITY_DATASET_ID) return fail("DATASET_ID_MISMATCH");
  const revision = raw["artifactRevision"];
  const provenance = raw["provenance"];
  if (typeof revision !== "string" || !isRecord(provenance)) return fail("PROVENANCE_MISSING");
  const commitSha = provenance["commitSha"];
  const build = provenance["clientDataWowVersion"];
  if (typeof commitSha !== "string" || !/^[0-9a-f]{40}$/.test(commitSha) || typeof build !== "string") {
    return fail("PROVENANCE_MISSING");
  }
  if (provenance["classId"] !== 13 || provenance["specId"] !== 1473) return fail("SPECIALIZATION_MISMATCH");
  const entries = raw["supportAbilities"];
  if (!Array.isArray(entries)) return fail("NO_ENTRIES");

  const abilities = new Map<AugmentationSupportAbilityKey, AugmentationSupportAbility>();
  for (const entry of entries) {
    if (!isRecord(entry)) return fail("ENTRY_INVALID");
    const key = entry["key"];
    const name = entry["displayNameEn"];
    const casts = entry["castAbilityGameIds"];
    const row = entry["traitRow"];
    const extra = entry["additionalCastLines"];
    if (
      typeof key !== "string" ||
      !(AUGMENTATION_SUPPORT_ABILITY_KEYS as readonly string[]).includes(key) ||
      abilities.has(key as AugmentationSupportAbilityKey) ||
      typeof name !== "string" ||
      name.trim() === "" ||
      !Array.isArray(casts) ||
      casts.length === 0 ||
      !casts.every(isId) ||
      !Array.isArray(extra)
    ) {
      return fail("ENTRY_INVALID");
    }
    // The trait row must BE the identity it claims: tree 2, class 13, this
    // spell as the FIRST cast id, this name, spec 1473.
    const fields = typeof row === "string" ? /^\{ ([^"]*)"([^"]*)", \{\s*(\d+),/.exec(row) : null;
    const numbers =
      fields?.[1]
        ?.split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "") ?? [];
    if (
      typeof row !== "string" ||
      fields === null ||
      numbers[0] !== "2" ||
      numbers[1] !== "13" ||
      numbers[7] !== String(casts[0]) ||
      fields[2] !== name ||
      fields[3] !== "1473"
    ) {
      return fail("PINNED_ROW_MISMATCH");
    }
    // Every further cast id needs its own pinned module line, and nothing else may have one.
    const extraIds: number[] = [];
    for (const line of extra) {
      if (
        !isRecord(line) ||
        !isId(line["abilityGameId"]) ||
        !lineNames(line["moduleLine"], line["abilityGameId"])
      ) {
        return fail("PINNED_LINE_MISMATCH");
      }
      extraIds.push(line["abilityGameId"]);
    }
    if (JSON.stringify([...extraIds].sort()) !== JSON.stringify(casts.slice(1).sort())) {
      return fail("PINNED_LINE_MISMATCH");
    }
    const allyAura = parseAura(entry["allyAura"]);
    const selfAura = parseAura(entry["selfAura"]);
    if (allyAura === "INVALID" || selfAura === "INVALID") return fail("PINNED_LINE_MISMATCH");
    abilities.set(key as AugmentationSupportAbilityKey, {
      key: key as AugmentationSupportAbilityKey,
      displayNameEn: name,
      castAbilityGameIds: casts,
      traitRow: row,
      allyAura,
      selfAura,
    });
  }
  if (abilities.size !== AUGMENTATION_SUPPORT_ABILITY_KEYS.length) return fail("NO_ENTRIES");
  const ids = [...abilities.values()].flatMap((ability) => ability.castAbilityGameIds);
  if (new Set(ids).size !== ids.length) return fail("DUPLICATE_ABILITY");
  return {
    ok: true,
    datasetId: AUGMENTATION_SUPPORT_ABILITY_DATASET_ID,
    artifactRevision: revision,
    commitSha,
    clientDataWowVersion: build,
    abilities,
  };
}

let cached: AugmentationSupportAbilityLoad | null = null;

/** The pinned dataset, or the reason it could not be used. */
export function pinnedAugmentationSupportAbilities(): AugmentationSupportAbilityLoad {
  cached ??= parseAugmentationSupportAbilities(artifact);
  return cached;
}
