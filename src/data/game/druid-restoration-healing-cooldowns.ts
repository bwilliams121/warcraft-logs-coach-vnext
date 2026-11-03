/**
 * Restoration Druid's healing-cooldown identity (HEAL-B1): WHICH abilities are this
 * specialization's healing cooldowns, and nothing else about them.
 *
 * Spec-owned runtime data, as Restoration Shaman's is (M12-D owner decision):
 * consumed only by `src/specs/druid/restoration/` (`m11a2-cross-spec-isolation` R3),
 * never by the generic `src/healing/`. Read by the shared healing-cooldown
 * identity reader (`healing-cooldown-identity-artifact.ts`).
 *
 * Each entry is a verbatim specialization-tree row of the pinned
 * SimulationCraft `trait_data.inc` (commit 33622e9d, client data
 * 12.1.0.69587), class 11, specialization 105: Tranquility (740), Flourish (197721), and Incarnation: Tree of Life (33891) and Convoke the Spirits (391528) on one choice node.
 * The selection of which traits are healing cooldowns is hand reviewed and
 * recorded per entry. No cooldown duration, charge count, effect duration or
 * modifier is claimed: readiness is not derivable from this dataset, and a
 * consumer must not pretend it is. A use is a CAST sourced by the player.
 */

import artifact from "./druid-restoration-healing-cooldowns.json";
import {
  parseHealingCooldownIdentityArtifact,
  type HealingCooldownIdentityLoad,
} from "./healing-cooldown-identity-artifact.js";

export const RESTORATION_DRUID_HEALING_COOLDOWN_DATASET_ID = "SIMC_DBC_DRUID_RESTORATION_HEALING_COOLDOWNS";

export type RestorationDruidHealingCooldownLoad = HealingCooldownIdentityLoad<
  typeof RESTORATION_DRUID_HEALING_COOLDOWN_DATASET_ID
>;

/** Validates the artifact, failing closed on any shape or coherence defect. */
export function parseRestorationDruidHealingCooldowns(raw: unknown): RestorationDruidHealingCooldownLoad {
  return parseHealingCooldownIdentityArtifact(raw, {
    datasetId: RESTORATION_DRUID_HEALING_COOLDOWN_DATASET_ID,
    classId: 11,
    specId: 105,
  });
}

let cached: RestorationDruidHealingCooldownLoad | null = null;

/** The pinned dataset, or the reason it could not be used. */
export function pinnedRestorationDruidHealingCooldowns(): RestorationDruidHealingCooldownLoad {
  cached ??= parseRestorationDruidHealingCooldowns(artifact);
  return cached;
}
