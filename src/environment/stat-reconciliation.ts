/**
 * STAT RECONCILIATION, revisited with the reconstructed environment
 * (M11-G3-4).
 *
 * G3-2 compared Warcraft Logs pull stats with the engine's stats under a
 * fidelity probe that controlled every consumable and raid buff off, and left
 * the residual STAT_RECONCILIATION_NOT_PROVEN. Warcraft Logs pull stats are
 * BUFFED stats, so the fair comparison applies the PROVEN pull environment
 * (whole-fight raid buffs, the flask, the temporary enchant) and nothing
 * unproven.
 *
 *   RECONCILED            every compared field agrees within tolerance
 *   PARTIALLY_RECONCILED  some do
 *   NOT_PROVEN            none do, or nothing could be compared
 *
 * A residual never becomes a publication blocker unless BOTH the two stat
 * surfaces are proven semantically comparable (nothing unmodelled could
 * contribute) AND an unexplained difference remains. Comparability is not
 * proven while race, a setup consumable, a raid buff or a subject pull aura
 * remains unresolved — each could carry stats the engine run lacks. The
 * residual is never assumed to be gear corruption.
 */

import type { CombatantPullFacts } from "../character-profile/pull-facts.js";
import type { EnvironmentReconstructionResult } from "./model.js";

export const STAT_RECONCILIATION_TOLERANCE = 1;

export interface EngineBuffedStats {
  readonly strength: number;
  readonly stamina: number;
  readonly critRating: number;
  readonly hasteRating: number;
  readonly masteryRating: number;
  readonly versatilityRating: number;
  readonly armor: number;
}

export interface StatFieldComparison {
  readonly field: keyof EngineBuffedStats;
  readonly wcl: number | null;
  readonly engine: number;
  readonly residual: number | null;
  readonly reconciled: boolean;
}

export interface StatReconciliationRevisit {
  readonly schemaVersion: "stat-reconciliation-revisit/1";
  readonly status: "RECONCILED" | "PARTIALLY_RECONCILED" | "NOT_PROVEN";
  /** The engine run the stats come from (what environment was applied). */
  readonly environmentBasis: string;
  readonly fields: readonly StatFieldComparison[];
  readonly semanticComparability:
    { readonly proven: true } | { readonly proven: false; readonly reasons: readonly string[] };
  readonly publicationBlocking: boolean;
}

export function revisitStatReconciliation(
  wcl: CombatantPullFacts["stats"] | null,
  engine: EngineBuffedStats,
  environmentBasis: string,
  environment: EnvironmentReconstructionResult,
  raceKnown: boolean,
): StatReconciliationRevisit {
  const pairs: [keyof EngineBuffedStats, number | null][] = [
    ["strength", wcl?.strength ?? null],
    ["stamina", wcl?.stamina ?? null],
    ["critRating", wcl?.critRating ?? null],
    ["hasteRating", wcl?.hasteRating ?? null],
    ["masteryRating", wcl?.masteryRating ?? null],
    ["versatilityRating", wcl?.versatilityRating ?? null],
    ["armor", wcl?.armor ?? null],
  ];
  const fields: StatFieldComparison[] = pairs.map(([field, logged]) => {
    const residual = logged === null ? null : Math.round((logged - engine[field]) * 1000) / 1000;
    return {
      field,
      wcl: logged,
      engine: engine[field],
      residual,
      reconciled: residual !== null && Math.abs(residual) <= STAT_RECONCILIATION_TOLERANCE,
    };
  });
  const compared = fields.filter((entry) => entry.residual !== null);
  const reconciled = compared.filter((entry) => entry.reconciled);
  const status =
    compared.length > 0 && reconciled.length === compared.length
      ? "RECONCILED"
      : reconciled.length > 0
        ? "PARTIALLY_RECONCILED"
        : "NOT_PROVEN";

  const env = environment.environment;
  const reasons: string[] = [];
  if (!raceKnown) reasons.push("race unresolved: base attributes and racial passives differ by race");
  for (const entry of env.consumables.setup) {
    if (entry.identity.state !== "KNOWN") reasons.push(`${entry.kind} identity UNKNOWN`);
    else if (entry.rank.state !== "KNOWN") reasons.push(`${entry.kind} rank UNKNOWN`);
  }
  for (const entry of env.raidBuffs) {
    if (entry.side === "PLAYER_AURA" && entry.presence.state === "UNKNOWN")
      reasons.push(`raid buff ${entry.override} UNKNOWN`);
  }
  const unclassified = env.pullAuras.filter(
    (aura) =>
      aura.classification === "UNCLASSIFIED_SELF" || aura.classification === "UNCLASSIFIED_UNKNOWN_SOURCE",
  );
  if (unclassified.length > 0) {
    reasons.push(
      `subject pull auras with no pinned identity: ${unclassified.map((aura) => String(aura.spellId)).join(", ")}`,
    );
  }
  const semanticComparability =
    reasons.length === 0 ? ({ proven: true } as const) : ({ proven: false, reasons } as const);
  return {
    schemaVersion: "stat-reconciliation-revisit/1",
    status,
    environmentBasis,
    fields,
    semanticComparability,
    publicationBlocking: semanticComparability.proven && status !== "RECONCILED",
  };
}
