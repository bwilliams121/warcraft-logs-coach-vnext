/**
 * Restoration Shaman's healing-cooldown identity (M12-D): WHICH abilities are
 * this specialization's healing cooldowns, and nothing else about them.
 *
 * Owner decision (2026-10-31): Restoration Shaman healing-cooldown identity
 * lives in that specialization's runtime data, never in the generic
 * `src/healing/`. It is consumed only by `src/specs/shaman/restoration/`
 * (`m11a2-cross-spec-isolation` R3).
 *
 * Each entry is a verbatim specialization-tree row of the pinned
 * SimulationCraft `trait_data.inc` (commit 33622e9d, client data
 * 12.1.0.69587). The selection of which traits are healing cooldowns is hand
 * reviewed and recorded per entry. No cooldown duration, charge count, effect
 * duration or modifier is claimed: readiness is not derivable from this
 * dataset, and a consumer must not pretend it is.
 *
 * A use is a CAST sourced by the player (`useEvidence: "CAST_BY_SUBJECT"`).
 * An aura of the same id is not a use: Ascendance's aura is applied without a
 * cast in the canonical fight (seven applications, two casts).
 */

import artifact from "./shaman-restoration-healing-cooldowns.json";

export const RESTORATION_SHAMAN_HEALING_COOLDOWN_DATASET_ID = "SIMC_DBC_SHAMAN_RESTORATION_HEALING_COOLDOWNS";

export interface RestorationShamanHealingCooldown {
  readonly abilityGameId: number;
  readonly displayNameEn: string;
  readonly traitNodeEntryId: number;
  readonly traitNodeId: number;
  readonly nodeType: "NORMAL" | "CHOICE";
  /** The other entries of the same choice node: at most one of them is selected. */
  readonly choiceSiblingAbilityGameIds: readonly number[];
  readonly pinnedRow: string;
  readonly useEvidence: "CAST_BY_SUBJECT";
}

export type RestorationShamanHealingCooldownLoad =
  | {
      readonly ok: true;
      readonly datasetId: typeof RESTORATION_SHAMAN_HEALING_COOLDOWN_DATASET_ID;
      readonly artifactRevision: string;
      readonly commitSha: string;
      readonly clientDataWowVersion: string;
      readonly cooldowns: readonly RestorationShamanHealingCooldown[];
    }
  | { readonly ok: false; readonly reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

/** Validates the artifact, failing closed on any shape or coherence defect. */
export function parseRestorationShamanHealingCooldowns(raw: unknown): RestorationShamanHealingCooldownLoad {
  const fail = (reason: string): RestorationShamanHealingCooldownLoad => ({ ok: false, reason });
  if (!isRecord(raw) || raw["artifactVersion"] !== 1) return fail("UNSUPPORTED_ARTIFACT_VERSION");
  if (raw["datasetId"] !== RESTORATION_SHAMAN_HEALING_COOLDOWN_DATASET_ID) return fail("DATASET_ID_MISMATCH");
  const revision = raw["artifactRevision"];
  const provenance = raw["provenance"];
  if (typeof revision !== "string" || !isRecord(provenance)) return fail("PROVENANCE_MISSING");
  const commitSha = provenance["commitSha"];
  const build = provenance["clientDataWowVersion"];
  if (typeof commitSha !== "string" || !/^[0-9a-f]{40}$/.test(commitSha) || typeof build !== "string") {
    return fail("PROVENANCE_MISSING");
  }
  if (provenance["classId"] !== 7 || provenance["specId"] !== 264) return fail("SPECIALIZATION_MISMATCH");
  const entries = raw["healingCooldowns"];
  if (!Array.isArray(entries) || entries.length === 0) return fail("NO_ENTRIES");

  const cooldowns: RestorationShamanHealingCooldown[] = [];
  for (const entry of entries) {
    if (!isRecord(entry)) return fail("ENTRY_INVALID");
    const id = entry["abilityGameId"];
    const name = entry["displayNameEn"];
    const nodeEntry = entry["traitNodeEntryId"];
    const node = entry["traitNodeId"];
    const nodeType = entry["nodeType"];
    const siblings = entry["choiceSiblingAbilityGameIds"];
    const row = entry["pinnedRow"];
    if (!isId(id) || typeof name !== "string" || name.trim() === "" || !isId(nodeEntry) || !isId(node)) {
      return fail("ENTRY_INVALID");
    }
    if (
      (nodeType !== "NORMAL" && nodeType !== "CHOICE") ||
      !Array.isArray(siblings) ||
      !siblings.every(isId)
    ) {
      return fail("ENTRY_INVALID");
    }
    if (entry["useEvidence"] !== "CAST_BY_SUBJECT") return fail("ENTRY_INVALID");
    // The row must BE the identity it claims: tree 2, class 7, this entry, this node, this spell, spec 264.
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
      numbers[1] !== "7" ||
      numbers[2] !== String(nodeEntry) ||
      numbers[3] !== String(node) ||
      numbers[7] !== String(id) ||
      fields[2] !== name ||
      fields[3] !== "264"
    ) {
      return fail("PINNED_ROW_MISMATCH");
    }
    cooldowns.push({
      abilityGameId: id,
      displayNameEn: name,
      traitNodeEntryId: nodeEntry,
      traitNodeId: node,
      nodeType,
      choiceSiblingAbilityGameIds: siblings,
      pinnedRow: row,
      useEvidence: "CAST_BY_SUBJECT",
    });
  }
  const ids = new Set(cooldowns.map((cooldown) => cooldown.abilityGameId));
  if (ids.size !== cooldowns.length) return fail("DUPLICATE_ABILITY");
  for (const cooldown of cooldowns) {
    const sameNode = cooldowns.filter(
      (other) => other !== cooldown && other.traitNodeId === cooldown.traitNodeId,
    );
    const declared = [...cooldown.choiceSiblingAbilityGameIds].sort((a, b) => a - b);
    const derived = sameNode.map((other) => other.abilityGameId).sort((a, b) => a - b);
    if (JSON.stringify(declared) !== JSON.stringify(derived)) return fail("CHOICE_SIBLINGS_INCOHERENT");
    if ((cooldown.nodeType === "CHOICE") !== derived.length > 0) return fail("CHOICE_SIBLINGS_INCOHERENT");
  }
  return {
    ok: true,
    datasetId: RESTORATION_SHAMAN_HEALING_COOLDOWN_DATASET_ID,
    artifactRevision: revision,
    commitSha,
    clientDataWowVersion: build,
    cooldowns,
  };
}

let cached: RestorationShamanHealingCooldownLoad | null = null;

/** The pinned dataset, or the reason it could not be used. */
export function pinnedRestorationShamanHealingCooldowns(): RestorationShamanHealingCooldownLoad {
  cached ??= parseRestorationShamanHealingCooldowns(artifact);
  return cached;
}
