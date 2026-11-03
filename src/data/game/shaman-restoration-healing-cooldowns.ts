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
 *
 * Since HEAL-B1 the artifact is read by the shared healing-cooldown identity
 * reader (`healing-cooldown-identity-artifact.ts`), which accepts exactly
 * what this module's own reader accepted, plus the row's node type checked
 * against the entry's.
 */

import artifact from "./shaman-restoration-healing-cooldowns.json";
import {
  parseHealingCooldownIdentityArtifact,
  type HealingCooldownIdentity,
  type HealingCooldownIdentityLoad,
} from "./healing-cooldown-identity-artifact.js";

export const RESTORATION_SHAMAN_HEALING_COOLDOWN_DATASET_ID = "SIMC_DBC_SHAMAN_RESTORATION_HEALING_COOLDOWNS";

export type RestorationShamanHealingCooldown = HealingCooldownIdentity;

export type RestorationShamanHealingCooldownLoad = HealingCooldownIdentityLoad<
  typeof RESTORATION_SHAMAN_HEALING_COOLDOWN_DATASET_ID
>;

/** Validates the artifact, failing closed on any shape or coherence defect. */
export function parseRestorationShamanHealingCooldowns(raw: unknown): RestorationShamanHealingCooldownLoad {
  return parseHealingCooldownIdentityArtifact(raw, {
    datasetId: RESTORATION_SHAMAN_HEALING_COOLDOWN_DATASET_ID,
    classId: 7,
    specId: 264,
  });
}

let cached: RestorationShamanHealingCooldownLoad | null = null;

/** The pinned dataset, or the reason it could not be used. */
export function pinnedRestorationShamanHealingCooldowns(): RestorationShamanHealingCooldownLoad {
  cached ??= parseRestorationShamanHealingCooldowns(artifact);
  return cached;
}
