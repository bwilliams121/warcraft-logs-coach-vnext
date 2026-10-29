/**
 * M11-G4-4 OBSERVED ATTRIBUTION: proof, for ONE observation, that its total
 * counts exactly what the engine's DPS counts.
 *
 * The rule is the canonical reconciliation (tests/unit/publication/
 * dps-comparability-evidence.test.ts), applied to the observation's own
 * fight. The observed total must equal, to the unit,
 * Σ (amount + absorbed) over the player and its owned pets against hostile
 * targets, minus only damage from abilities PROVEN to be credited to another
 * player. Friendly-target damage is never counted.
 *
 * Anything else is UNRECONCILED, and comparability is NOT_PROVEN:
 * - incomplete damage coverage for the player or a pet;
 * - a difference that the evidenced exclusions do not explain exactly;
 * - any attribution rule not yet seen in evidence.
 */

/** Abilities whose damage Warcraft Logs credits to ANOTHER player, each with its evidence. */
export const CREDITED_TO_OTHER_PLAYER_ABILITIES: readonly {
  readonly abilityId: number;
  readonly name: string;
  readonly evidence: string;
}[] = [
  {
    abilityId: 434481,
    name: "Bombardments",
    evidence:
      "b1PmaKrd6CDfzngc fight 48 (log version 17): the subject's table total equals its owner + pet events only with these 5 events (190,342) excluded",
  },
];

/** One damage event by the player or an owned pet, as the caller normalized it. */
export interface AttributionDamageEvent {
  readonly sourceId: number;
  readonly abilityId: number;
  readonly targetHostile: boolean;
  readonly amount: number;
  readonly absorbed: number;
}

export interface AttributionInput {
  /** The observed table total being explained. */
  readonly tableTotal: number;
  /** The player and every owned pet whose damage the total may include. */
  readonly ownerAndPetIds: readonly number[];
  /** COMPLETE only when every damage event of every listed actor over the whole fight was retrieved. */
  readonly coverage: "COMPLETE" | "PARTIAL" | "ABSENT";
  readonly damage: readonly AttributionDamageEvent[];
}

export type ObservedAttribution =
  | {
      readonly state: "RECONCILED";
      /** Credited-to-another-player damage the total excludes, by ability. */
      readonly excluded: readonly { readonly abilityId: number; readonly amount: number }[];
    }
  | { readonly state: "UNRECONCILED"; readonly reason: string };

export function reconcileObservedAttribution(input: AttributionInput): ObservedAttribution {
  if (input.coverage !== "COMPLETE") {
    return { state: "UNRECONCILED", reason: `owner and pet damage coverage is ${input.coverage}` };
  }
  const owners = new Set(input.ownerAndPetIds);
  const counted = input.damage.filter((event) => owners.has(event.sourceId) && event.targetHostile);
  const effective = counted.reduce((sum, event) => sum + event.amount + event.absorbed, 0);
  const credited = new Map<number, number>();
  for (const event of counted) {
    if (CREDITED_TO_OTHER_PLAYER_ABILITIES.some((entry) => entry.abilityId === event.abilityId)) {
      credited.set(event.abilityId, (credited.get(event.abilityId) ?? 0) + event.amount + event.absorbed);
    }
  }
  const creditedTotal = [...credited.values()].reduce((sum, value) => sum + value, 0);
  if (effective === input.tableTotal && creditedTotal === 0) return { state: "RECONCILED", excluded: [] };
  if (effective - creditedTotal === input.tableTotal) {
    return {
      state: "RECONCILED",
      excluded: [...credited.entries()]
        .sort(([a], [b]) => a - b)
        .map(([abilityId, amount]) => ({ abilityId, amount })),
    };
  }
  return {
    state: "UNRECONCILED",
    reason: `table total ${String(input.tableTotal)} is not owner + pet damage ${String(effective)} less evidenced credits ${String(creditedTotal)}`,
  };
}
