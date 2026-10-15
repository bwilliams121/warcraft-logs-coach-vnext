/**
 * The SEMANTIC profile hash (M11-G3-2), on the G3-1 canonical primitives.
 *
 * It identifies what the character IS for simulation: field STATES (so
 * UNKNOWN and KNOWN_NONE never collide), values, and nothing about where the
 * evidence came from — no source field, report, fight, actor, document,
 * player name, realm or URL. Bonus ids and gems are hashed as sorted
 * multisets, because the engine treats their order as meaningless; slots are
 * in the one fixed slot order.
 *
 * The profile that a fidelity probe or a later ceiling job actually sends is
 * additionally identified by the G3-1 `profileHash` of that job's character.
 */

import { canonicalJson, sha256Hex } from "../simulation/canonical.js";
import type { CharacterProfile, Evidenced } from "./profile.js";

function semantic<T>(field: Evidenced<T>, normalize: (value: T) => unknown = (value) => value): unknown {
  switch (field.state) {
    case "KNOWN":
      return { state: "KNOWN", value: normalize(field.value) };
    case "MODEL_ASSUMPTION":
      return {
        state: "MODEL_ASSUMPTION",
        value: normalize(field.value),
        assumption: `${field.assumption.id}@${String(field.assumption.version)}`,
      };
    default:
      return { state: field.state };
  }
}

const multiset = (ids: readonly number[]): number[] => [...ids].sort((a, b) => a - b);

export function semanticProfileView(profile: CharacterProfile): unknown {
  return {
    kind: "character-profile-semantic/1",
    specKey: profile.identity.specKey,
    classId: semantic(profile.identity.classId),
    specId: semantic(profile.identity.specId),
    level: semantic(profile.identity.level),
    race: semantic(profile.identity.race),
    talents: semantic(profile.talents.importCode),
    heroTree: semantic(profile.talents.heroTree, (tree) => tree.subTreeId),
    equipment: profile.equipment.map((record) => ({
      slot: record.slot,
      occupancy: record.occupancy,
      itemId: semantic(record.itemId),
      itemLevel: semantic(record.itemLevel),
      bonusIds: semantic(record.bonusIds, multiset),
      gems: semantic(record.gems, multiset),
      permanentEnchant: semantic(record.permanentEnchant),
      temporaryEnchant: semantic(record.temporaryEnchant, (enchant) => enchant.enchantId),
    })),
  };
}

export async function semanticProfileHash(profile: CharacterProfile): Promise<string> {
  return await sha256Hex(canonicalJson(semanticProfileView(profile)));
}
