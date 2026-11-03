/**
 * The shared reader of a healer specialization's healing-cooldown identity
 * artifact (HEAL-B1): WHICH abilities a specialization's runtime data names as
 * its healing cooldowns, and nothing else about them.
 *
 * Shared because the artifact FORMAT is shared, never the content. Each
 * healer specialization owns its own artifact, `src/data/game/<class>-<spec>-
 * healing-cooldowns.json`, and its own loader beside it, which names the
 * dataset id, class id and specialization id this reader must find
 * (`m11a2-cross-spec-isolation` R3 keeps each artifact to its own tree). The
 * first artifact was Restoration Shaman's (M12-D); HEAL-B1 lifted its reader
 * here, unchanged in what it accepts, so Holy Paladin, Restoration Druid and
 * Mistweaver Monk do not each carry a copy.
 *
 * WHAT AN ENTRY IS
 *
 * A verbatim SPECIALIZATION-tree (tree_index 2) row of the pinned
 * SimulationCraft `trait_data.inc`, field order `trait_data_t`
 * (`trait_data.hpp`), checked here against the identity the entry claims:
 * tree 2, the expected class, the entry's own node entry and node, its name,
 * the expected specialization as the row's first `id_spec`, and its node type
 * (`node_type` 0 NORMAL, 2 CHOICE).
 *
 * THE CAST ID. A use is a CAST sourced by the player, so an entry's
 * `abilityGameId` is the id the cast carries. `trait_data.hpp` states
 * `id_override_spell` as the spell that overrides `id_spell` "for
 * display/activation in-game", so the cast id is `id_override_spell` when the
 * row has one and `id_spell` otherwise. The reader derives it from the row and
 * refuses an entry that claims any other id. (Avenging Crusader is the case:
 * talent spell 394088, activated as 216331.)
 *
 * CHOICE SIBLINGS. `choiceSiblingAbilityGameIds` lists the OTHER entries of
 * this artifact on the same node, and must equal them. A CHOICE node may have
 * no identified sibling: its other choice is then simply not one of this
 * specialization's healing cooldowns, and the entry's selection note says so.
 * A NORMAL node has none.
 *
 * WHAT IS NEVER HERE. No cooldown duration, charge count, effect duration or
 * modifier. Readiness is not derivable from this data, and a consumer must not
 * pretend it is.
 */

export interface HealingCooldownIdentity {
  /** The id a completed cast of the ability carries. */
  readonly abilityGameId: number;
  readonly displayNameEn: string;
  readonly traitNodeEntryId: number;
  readonly traitNodeId: number;
  readonly nodeType: "NORMAL" | "CHOICE";
  /** The other entries of this artifact on the same choice node: at most one of them is selected. */
  readonly choiceSiblingAbilityGameIds: readonly number[];
  readonly pinnedRow: string;
  readonly useEvidence: "CAST_BY_SUBJECT";
}

export type HealingCooldownIdentityLoad<TDatasetId extends string = string> =
  | {
      readonly ok: true;
      readonly datasetId: TDatasetId;
      readonly artifactRevision: string;
      readonly commitSha: string;
      readonly clientDataWowVersion: string;
      readonly cooldowns: readonly HealingCooldownIdentity[];
    }
  | { readonly ok: false; readonly reason: string };

/** What the owning specialization's loader requires the artifact to be. */
export interface HealingCooldownIdentityExpectation<TDatasetId extends string> {
  readonly datasetId: TDatasetId;
  /** The SimulationCraft class id (`id_class`). */
  readonly classId: number;
  /** The SimulationCraft specialization id (`id_spec`). */
  readonly specId: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isId = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

/**
 * The fields of one pinned row: the thirteen numbers before the name, the
 * name, the first `id_spec`, and the trailing `id_sub_tree, node_type`.
 */
const ROW = /^\{ ([^"]*)"([^"]*)", \{\s*(\d+),\s*\d+,\s*\d+,\s*\d+ \}, \{[^}]*\},\s*(\d+),\s*(\d+) \}$/;

/** Validates one artifact, failing closed on any shape or coherence defect. */
export function parseHealingCooldownIdentityArtifact<TDatasetId extends string>(
  raw: unknown,
  expected: HealingCooldownIdentityExpectation<TDatasetId>,
): HealingCooldownIdentityLoad<TDatasetId> {
  const fail = (reason: string): HealingCooldownIdentityLoad<TDatasetId> => ({ ok: false, reason });
  if (!isRecord(raw) || raw["artifactVersion"] !== 1) return fail("UNSUPPORTED_ARTIFACT_VERSION");
  if (raw["datasetId"] !== expected.datasetId) return fail("DATASET_ID_MISMATCH");
  const revision = raw["artifactRevision"];
  const provenance = raw["provenance"];
  if (typeof revision !== "string" || !isRecord(provenance)) return fail("PROVENANCE_MISSING");
  const commitSha = provenance["commitSha"];
  const build = provenance["clientDataWowVersion"];
  if (typeof commitSha !== "string" || !/^[0-9a-f]{40}$/.test(commitSha) || typeof build !== "string") {
    return fail("PROVENANCE_MISSING");
  }
  if (provenance["classId"] !== expected.classId || provenance["specId"] !== expected.specId) {
    return fail("SPECIALIZATION_MISMATCH");
  }
  const entries = raw["healingCooldowns"];
  if (!Array.isArray(entries) || entries.length === 0) return fail("NO_ENTRIES");

  const cooldowns: HealingCooldownIdentity[] = [];
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
    // The row must BE the identity it claims.
    const fields = typeof row === "string" ? ROW.exec(row) : null;
    const numbers =
      fields?.[1]
        ?.split(",")
        .map((part) => part.trim())
        .filter((part) => part !== "") ?? [];
    const castId = numbers[9] !== undefined && numbers[9] !== "0" ? numbers[9] : numbers[7];
    const rowNodeType = fields?.[5] === "0" ? "NORMAL" : fields?.[5] === "2" ? "CHOICE" : null;
    if (
      typeof row !== "string" ||
      fields === null ||
      numbers.length !== 13 ||
      numbers[0] !== "2" ||
      numbers[1] !== String(expected.classId) ||
      numbers[2] !== String(nodeEntry) ||
      numbers[3] !== String(node) ||
      castId !== String(id) ||
      fields[2] !== name ||
      fields[3] !== String(expected.specId) ||
      rowNodeType !== nodeType
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
    if (cooldown.nodeType === "NORMAL" && derived.length > 0) return fail("CHOICE_SIBLINGS_INCOHERENT");
  }
  return {
    ok: true,
    datasetId: expected.datasetId,
    artifactRevision: revision,
    commitSha,
    clientDataWowVersion: build,
    cooldowns,
  };
}
