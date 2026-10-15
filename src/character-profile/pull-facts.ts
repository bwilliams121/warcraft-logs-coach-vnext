/**
 * PULL FACTS (M11-G3-2): the stat and aura surfaces of a raw `combatantinfo`
 * row that the normalized `CombatantSnapshot` does not carry.
 *
 * Read narrowly here, for reconstruction diagnostics only, so shared
 * normalization (and every analysis that serializes it) is untouched.
 *
 * SEMANTICS, ESTABLISHED ON THE CANONICAL SUBJECT AGAINST THE PINNED ENGINE:
 * these are BUFFED stats at pull — they include active consumables (the
 * flask's versatility reconciles to the rating exactly) and raid buffs
 * (stamina carries Power Word: Fortitude). They are NOT gear ratings.
 *
 * A missing or malformed field is null, never 0.
 */

import { isRecord, isSafeInteger } from "../wcl/decode.js";

export interface PullAura {
  readonly sourceId: number | null;
  readonly spellId: number;
  readonly stacks: number | null;
}

export interface CombatantPullFacts {
  readonly stats: {
    readonly strength: number | null;
    readonly agility: number | null;
    readonly stamina: number | null;
    readonly intellect: number | null;
    readonly critRating: number | null;
    readonly hasteRating: number | null;
    readonly masteryRating: number | null;
    readonly versatilityRating: number | null;
    readonly armor: number | null;
  };
  /** `null` when the row carried no readable aura list. */
  readonly auras: readonly PullAura[] | null;
}

const int = (raw: Record<string, unknown>, key: string): number | null => {
  const value = raw[key];
  return isSafeInteger(value) ? value : null;
};

export function readCombatantPullFacts(raw: unknown): CombatantPullFacts | null {
  if (!isRecord(raw) || raw["type"] !== "combatantinfo") return null;
  let auras: PullAura[] | null = null;
  if (Array.isArray(raw["auras"])) {
    auras = [];
    for (const aura of raw["auras"]) {
      if (!isRecord(aura)) return { stats: statsOf(raw), auras: null };
      const spellId = int(aura, "ability");
      if (spellId === null) return { stats: statsOf(raw), auras: null };
      auras.push({ sourceId: int(aura, "source"), spellId, stacks: int(aura, "stacks") });
    }
  }
  return { stats: statsOf(raw), auras };
}

function statsOf(raw: Record<string, unknown>): CombatantPullFacts["stats"] {
  return {
    strength: int(raw, "strength"),
    agility: int(raw, "agility"),
    stamina: int(raw, "stamina"),
    intellect: int(raw, "intellect"),
    critRating: int(raw, "critMelee"),
    hasteRating: int(raw, "hasteMelee"),
    masteryRating: int(raw, "mastery"),
    versatilityRating: int(raw, "versatilityDamageDone"),
    armor: int(raw, "armor"),
  };
}
