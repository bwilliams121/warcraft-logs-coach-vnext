/**
 * Talent LOADOUT decoding (M11-G3-2): a Blizzard talent import string, read
 * exactly the way the pinned SimulationCraft engine reads it, against a
 * machine-extracted per-class node table.
 *
 * Mirrors engine/player/player.cpp `parse_traits_hash` at 33622e9d:
 *
 *   version (8 bits, must be 2) | spec id (16) | tree hash (128, ignored)
 *   then, for every node of the class in ascending node id:
 *     selected? (1) -> purchased? (1) -> [partially ranked? (1) -> rank (6)]
 *                                       [choice? (1) -> index (2)]
 *   bits are read least-significant first from 6-bit base64 characters.
 *
 * A selected but not purchased node is granted at rank 1. A TIERED node's rank
 * (the sum of its tiers' max ranks unless partially ranked) is allocated across
 * its tier entries in table order. The node walk and entry order come from the
 * extracted table (see scripts/authority/extract-simc-trait-loadout.mjs).
 *
 * Every condition the pinned decoder rejects is a typed failure here. Nothing
 * defaults: an unreadable code decodes to no talents at all, never to "these
 * talents were not taken".
 */

export interface LoadoutTableEntry {
  readonly entryId: number;
  readonly tree: "INVALID" | "CLASS" | "SPECIALIZATION" | "HERO" | "SELECTION";
  readonly nodeType: string;
  readonly maxRanks: number;
  readonly specIds: readonly number[];
  readonly subTreeId: number;
  readonly spellId: number;
  readonly displayNameEn: string;
}

export interface LoadoutTable {
  readonly classId: number;
  readonly artifactRevision: string;
  readonly nodes: readonly { readonly nodeId: number; readonly entries: readonly LoadoutTableEntry[] }[];
}

export interface DecodedTalent {
  readonly nodeId: number;
  readonly entryId: number;
  readonly tree: LoadoutTableEntry["tree"];
  readonly rank: number;
  readonly purchased: boolean;
  readonly subTreeId: number;
}

export type LoadoutDecodeFailure =
  | "INVALID_CHARACTER"
  | "TOO_SHORT"
  | "UNSUPPORTED_SERIALIZATION_VERSION"
  | "WRONG_SPECIALIZATION"
  | "NODE_NOT_AVAILABLE_TO_SPEC"
  | "NON_CHOICE_NODE_HAS_MULTIPLE_ENTRIES"
  | "RANK_OUT_OF_RANGE"
  | "NOT_A_CHOICE_NODE"
  | "CHOICE_INDEX_OUT_OF_RANGE"
  | "EMPTY_NODE";

export type LoadoutDecode =
  | {
      readonly ok: true;
      readonly specId: number;
      readonly talents: readonly DecodedTalent[];
      /** Hero sub-trees activated by a SELECTION-tree choice. */
      readonly selectedSubTreeIds: readonly number[];
      readonly bitsRead: number;
    }
  | { readonly ok: false; readonly failure: LoadoutDecodeFailure; readonly detail: string };

const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const SERIALIZATION_VERSION = 2;
const VERSION_BITS = 8;
const SPEC_BITS = 16;
const TREE_BITS = 128;
const RANK_BITS = 6;
const CHOICE_BITS = 2;
const BYTE_SIZE = 6;

const failure = (kind: LoadoutDecodeFailure, detail: string): LoadoutDecode => ({
  ok: false,
  failure: kind,
  detail,
});

export function decodeTalentLoadout(
  code: string,
  table: LoadoutTable,
  expectedSpecId: number,
): LoadoutDecode {
  for (const character of code) {
    if (!BASE64.includes(character)) return failure("INVALID_CHARACTER", `'${character}'`);
  }
  if (VERSION_BITS + SPEC_BITS + TREE_BITS > code.length * BYTE_SIZE)
    return failure("TOO_SHORT", `${String(code.length)} characters`);

  let head = 0;
  const bits = (count: number): number => {
    let value = 0;
    for (let i = 0; i < count; i += 1) {
      const character = code[Math.floor(head / BYTE_SIZE)];
      const byte = character === undefined ? 0 : BASE64.indexOf(character);
      value += ((byte >> (head % BYTE_SIZE)) & 1) * 2 ** i;
      head += 1;
    }
    return value;
  };

  const version = bits(VERSION_BITS);
  const specId = bits(SPEC_BITS);
  if (version !== SERIALIZATION_VERSION) return failure("UNSUPPORTED_SERIALIZATION_VERSION", String(version));
  if (specId !== expectedSpecId)
    return failure("WRONG_SPECIALIZATION", `${String(specId)} != ${String(expectedSpecId)}`);
  bits(TREE_BITS);

  const talents: DecodedTalent[] = [];
  const subTrees = new Set<number>();
  for (const node of table.nodes) {
    if (bits(1) === 0) continue;
    const first = node.entries[0];
    if (first === undefined) return failure("EMPTY_NODE", String(node.nodeId));
    const tiered = first.nodeType === "TIERED";
    const maxRank = tiered ? node.entries.reduce((sum, entry) => sum + entry.maxRanks, 0) : first.maxRanks;
    let entry = first;
    let rank = maxRank;
    // Hero nodes are not spec-gated by the pinned decoder. Every other node
    // whose spec list excludes this spec is an error — including a selection
    // node, whose "ignoring" message is raised through the same throwing
    // do_error and so aborts the whole parse (player.cpp:2699, :3153).
    if (first.tree !== "HERO" && first.specIds.length > 0 && !first.specIds.includes(specId)) {
      return failure(
        "NODE_NOT_AVAILABLE_TO_SPEC",
        `node ${String(node.nodeId)} entry ${String(first.entryId)}`,
      );
    }
    const purchased = bits(1) === 1;
    if (!purchased) {
      rank = 1;
    } else {
      if (bits(1) === 1) {
        if (!tiered && node.entries.length > 1) {
          return failure("NON_CHOICE_NODE_HAS_MULTIPLE_ENTRIES", String(node.nodeId));
        }
        rank = bits(RANK_BITS);
        if (rank >= maxRank)
          return failure(
            "RANK_OUT_OF_RANGE",
            `node ${String(node.nodeId)} rank ${String(rank)}/${String(maxRank)}`,
          );
      }
      if (bits(1) === 1) {
        if (first.nodeType !== "CHOICE" && first.nodeType !== "SELECTION")
          return failure("NOT_A_CHOICE_NODE", String(node.nodeId));
        const index = bits(CHOICE_BITS);
        const chosen = node.entries[index];
        if (chosen === undefined)
          return failure("CHOICE_INDEX_OUT_OF_RANGE", `node ${String(node.nodeId)} index ${String(index)}`);
        entry = chosen;
      }
    }
    if (tiered) {
      let remaining = rank;
      for (const tier of node.entries) {
        const allocated = Math.min(remaining, tier.maxRanks);
        talents.push({
          nodeId: node.nodeId,
          entryId: tier.entryId,
          tree: tier.tree,
          rank: allocated,
          purchased,
          subTreeId: tier.subTreeId,
        });
        remaining -= allocated;
        if (remaining === 0) break;
      }
    } else {
      talents.push({
        nodeId: node.nodeId,
        entryId: entry.entryId,
        tree: entry.tree,
        rank,
        purchased,
        subTreeId: entry.subTreeId,
      });
    }
    if (entry.tree === "SELECTION") subTrees.add(entry.subTreeId);
  }
  return {
    ok: true,
    specId,
    talents,
    selectedSubTreeIds: [...subTrees].sort((a, b) => a - b),
    bitsRead: head,
  };
}

export interface ObservedLoadoutEntry {
  readonly id: number;
  readonly rank: number | null;
  readonly nodeId: number | null;
}

export type LoadoutReconciliation =
  | { readonly state: "RECONCILED"; readonly entries: number }
  | {
      readonly state: "DIVERGED";
      readonly onlyObserved: readonly number[];
      readonly onlyDecoded: readonly number[];
      readonly rankOrNodeDifferences: readonly number[];
    };

/**
 * Reconciles a decoded loadout with Warcraft Logs' `combatantinfo.talentTree`
 * entry by entry: the same entry ids, at the same nodes, at the same ranks.
 * An observed entry with an unreadable rank or node is a difference, not a
 * match.
 */
export function reconcileLoadout(
  decoded: readonly DecodedTalent[],
  observed: readonly ObservedLoadoutEntry[],
): LoadoutReconciliation {
  const byDecoded = new Map(decoded.map((talent) => [talent.entryId, talent]));
  const byObserved = new Map(observed.map((entry) => [entry.id, entry]));
  const onlyObserved = [...byObserved.keys()].filter((id) => !byDecoded.has(id)).sort((a, b) => a - b);
  const onlyDecoded = [...byDecoded.keys()].filter((id) => !byObserved.has(id)).sort((a, b) => a - b);
  const differences = [...byObserved.values()]
    .filter((entry) => {
      const talent = byDecoded.get(entry.id);
      return talent !== undefined && (entry.rank !== talent.rank || entry.nodeId !== talent.nodeId);
    })
    .map((entry) => entry.id)
    .sort((a, b) => a - b);
  if (onlyObserved.length === 0 && onlyDecoded.length === 0 && differences.length === 0) {
    return { state: "RECONCILED", entries: decoded.length };
  }
  return { state: "DIVERGED", onlyObserved, onlyDecoded, rankOrNodeDifferences: differences };
}
