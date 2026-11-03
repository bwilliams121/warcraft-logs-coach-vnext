/**
 * Preservation Evoker's healing-cooldown identity (HEAL-B4): WHICH abilities
 * are this specialization's healing cooldowns, and nothing else about them.
 *
 * Spec-owned runtime data, as Restoration Shaman's is (M12-D owner decision):
 * consumed only by `src/specs/evoker/preservation/` (`m11a2-cross-spec-isolation`
 * R3), never by the generic `src/healing/`. Read by the shared healing-cooldown
 * identity reader (`healing-cooldown-identity-artifact.ts`).
 *
 * Each entry is a verbatim specialization-tree row of the pinned
 * SimulationCraft `trait_data.inc` (commit 33622e9d, client data
 * 12.1.0.69587), class 13, specialization 1468: Rewind (363534) on a node of
 * its own, and Dream Flight (359816) and Stasis (370537) on one choice node.
 * The pinned Preservation tree has no Emerald Communion row. Time Dilation (an
 * external), Tip the Scales and Zephyr (class tree) and the empowered spells
 * (Dream Breath, Spiritbloom, Fire Breath) are not identified. The selection
 * of which traits are healing cooldowns is hand reviewed and recorded per
 * entry. No cooldown duration, charge count, effect duration, empowerment or
 * modifier is claimed: readiness is not derivable from this dataset, and a
 * consumer must not pretend it is. A use is a CAST sourced by the player; no
 * identified ability is empowered.
 */

import artifact from "./evoker-preservation-healing-cooldowns.json";
import {
  parseHealingCooldownIdentityArtifact,
  type HealingCooldownIdentityLoad,
} from "./healing-cooldown-identity-artifact.js";

export const PRESERVATION_EVOKER_HEALING_COOLDOWN_DATASET_ID =
  "SIMC_DBC_EVOKER_PRESERVATION_HEALING_COOLDOWNS";

export type PreservationEvokerHealingCooldownLoad = HealingCooldownIdentityLoad<
  typeof PRESERVATION_EVOKER_HEALING_COOLDOWN_DATASET_ID
>;

/** Validates the artifact, failing closed on any shape or coherence defect. */
export function parsePreservationEvokerHealingCooldowns(raw: unknown): PreservationEvokerHealingCooldownLoad {
  return parseHealingCooldownIdentityArtifact(raw, {
    datasetId: PRESERVATION_EVOKER_HEALING_COOLDOWN_DATASET_ID,
    classId: 13,
    specId: 1468,
  });
}

let cached: PreservationEvokerHealingCooldownLoad | null = null;

/** The pinned dataset, or the reason it could not be used. */
export function pinnedPreservationEvokerHealingCooldowns(): PreservationEvokerHealingCooldownLoad {
  cached ??= parsePreservationEvokerHealingCooldowns(artifact);
  return cached;
}
