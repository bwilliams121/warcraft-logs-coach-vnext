/**
 * M11-G4-4 DPS COMPARABILITY: when observed DPS and the engine's DPS measure
 * the same thing, so that attainment (observed ÷ simulated) may be KNOWN.
 *
 * WHAT THE EVIDENCE PROVES (tests/unit/publication/dps-comparability-evidence.test.ts):
 *
 * - The Warcraft Logs DamageDone table total (G1 ACTUAL_DPS, logVersion 17)
 *   for the canonical subject equals, to the unit,
 *   Σ (amount + absorbed) over the player AND its owned pets, against hostile
 *   NPCs. It excludes damage to friendly players (redirected Blessing of
 *   Sacrifice) and damage Warcraft Logs credits to another player
 *   (Bombardments). Every pet's table total equals its own events'
 *   amount + absorbed. `amount` excludes overkill.
 * - The engine's player DPS × duration equals the player's own damage actions
 *   plus its pets' damage (not healing or absorbs) on the real 0a72e6a7
 *   engine.
 *
 * So pets and guardians are counted on both sides (the owner's condition,
 * 2026-10-28). One definitional difference remains, and it is decided here:
 *
 * - TARGETS. The table total counts every hostile target, while a simulation
 *   job is single target (`additionalTargets` must be empty). Attainment is
 *   comparable only when the observed damage went to exactly ONE target.
 * - OVERKILL. The engine records damage before the target's health cap, while
 *   Warcraft Logs excludes overkill. On a fixed-time single target that never
 *   dies early this cannot arise, which the single-target rule also covers.
 *
 * Anything outside the evidenced log version or source is NOT_PROVEN, and so
 * is any observation whose own total has not been reconciled to the unit
 * against its owner and pet events (`attribution.ts`). Metadata alone never
 * proves that the observation's attribution matches the engine's.
 */

import type { ObservedDps } from "./record.js";

/** Mirrors `ACTUAL_DPS_SOURCE` (src/cohort/observed-performance.ts); a test keeps them equal. */
export const WCL_DAMAGE_DONE_TABLE_SOURCE = "WCL_DAMAGE_DONE_TABLE_TOTAL_PER_FIGHT_SECOND";
/** The Warcraft Logs log version the reconciliation evidence covers. */
export const COMPARABILITY_EVIDENCED_LOG_VERSIONS: readonly number[] = [17];

export interface DpsComparabilityAssessment {
  readonly state: "PROVEN" | "NOT_PROVEN";
  /** Why not, in rule order; empty when PROVEN. */
  readonly reasons: readonly string[];
}

export function assessDpsComparability(observed: ObservedDps): DpsComparabilityAssessment {
  if (observed.state !== "KNOWN") return { state: "NOT_PROVEN", reasons: ["observed DPS is not known"] };
  const reasons: string[] = [];
  if (observed.source !== WCL_DAMAGE_DONE_TABLE_SOURCE) {
    reasons.push(`observed source ${observed.source} is not the reconciled DamageDone table total`);
  }
  if (observed.logVersion === null || !COMPARABILITY_EVIDENCED_LOG_VERSIONS.includes(observed.logVersion)) {
    reasons.push(`log version ${String(observed.logVersion)} is outside the reconciled versions`);
  }
  if (observed.attribution.state !== "RECONCILED") {
    reasons.push(`observed attribution is not reconciled: ${observed.attribution.reason}`);
  }
  if (observed.targetCount !== 1) {
    reasons.push(
      `observed damage covers ${String(observed.targetCount)} targets; a simulation job is single target`,
    );
  }
  return reasons.length === 0 ? { state: "PROVEN", reasons } : { state: "NOT_PROVEN", reasons };
}
