/**
 * Mistweaver Monk's healing-cooldown identity (HEAL-B1): WHICH abilities are this
 * specialization's healing cooldowns, and nothing else about them.
 *
 * Spec-owned runtime data, as Restoration Shaman's is (M12-D owner decision):
 * consumed only by `src/specs/monk/mistweaver/` (`m11a2-cross-spec-isolation` R3),
 * never by the generic `src/healing/`. Read by the shared healing-cooldown
 * identity reader (`healing-cooldown-identity-artifact.ts`).
 *
 * Each entry is a verbatim specialization-tree row of the pinned
 * SimulationCraft `trait_data.inc` (commit 33622e9d, client data
 * 12.1.0.69587), class 10, specialization 270: Revival (115310) and Restoral (388615) on one choice node, and Invoke Yu'lon, the Jade Serpent (322118) and Invoke Chi-Ji, the Red Crane (325197) on another.
 * The selection of which traits are healing cooldowns is hand reviewed and
 * recorded per entry. No cooldown duration, charge count, effect duration or
 * modifier is claimed: readiness is not derivable from this dataset, and a
 * consumer must not pretend it is. A use is a CAST sourced by the player.
 */

import artifact from "./monk-mistweaver-healing-cooldowns.json";
import {
  parseHealingCooldownIdentityArtifact,
  type HealingCooldownIdentityLoad,
} from "./healing-cooldown-identity-artifact.js";

export const MISTWEAVER_MONK_HEALING_COOLDOWN_DATASET_ID = "SIMC_DBC_MONK_MISTWEAVER_HEALING_COOLDOWNS";

export type MistweaverMonkHealingCooldownLoad = HealingCooldownIdentityLoad<
  typeof MISTWEAVER_MONK_HEALING_COOLDOWN_DATASET_ID
>;

/** Validates the artifact, failing closed on any shape or coherence defect. */
export function parseMistweaverMonkHealingCooldowns(raw: unknown): MistweaverMonkHealingCooldownLoad {
  return parseHealingCooldownIdentityArtifact(raw, {
    datasetId: MISTWEAVER_MONK_HEALING_COOLDOWN_DATASET_ID,
    classId: 10,
    specId: 270,
  });
}

let cached: MistweaverMonkHealingCooldownLoad | null = null;

/** The pinned dataset, or the reason it could not be used. */
export function pinnedMistweaverMonkHealingCooldowns(): MistweaverMonkHealingCooldownLoad {
  cached ??= parseMistweaverMonkHealingCooldowns(artifact);
  return cached;
}
