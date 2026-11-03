/**
 * Holy Paladin's healing-cooldown identity (HEAL-B1): WHICH abilities are this
 * specialization's healing cooldowns, and nothing else about them.
 *
 * Spec-owned runtime data, as Restoration Shaman's is (M12-D owner decision):
 * consumed only by `src/specs/paladin/holy/` (`m11a2-cross-spec-isolation` R3),
 * never by the generic `src/healing/`. Read by the shared healing-cooldown
 * identity reader (`healing-cooldown-identity-artifact.ts`).
 *
 * Each entry is a verbatim specialization-tree row of the pinned
 * SimulationCraft `trait_data.inc` (commit 33622e9d, client data
 * 12.1.0.69587), class 2, specialization 65: Aura Mastery (31821), and Avenging Wrath (31884) and Avenging Crusader (216331) on one choice node.
 * The selection of which traits are healing cooldowns is hand reviewed and
 * recorded per entry. No cooldown duration, charge count, effect duration or
 * modifier is claimed: readiness is not derivable from this dataset, and a
 * consumer must not pretend it is. A use is a CAST sourced by the player.
 */

import artifact from "./paladin-holy-healing-cooldowns.json";
import {
  parseHealingCooldownIdentityArtifact,
  type HealingCooldownIdentityLoad,
} from "./healing-cooldown-identity-artifact.js";

export const HOLY_PALADIN_HEALING_COOLDOWN_DATASET_ID = "SIMC_DBC_PALADIN_HOLY_HEALING_COOLDOWNS";

export type HolyPaladinHealingCooldownLoad = HealingCooldownIdentityLoad<
  typeof HOLY_PALADIN_HEALING_COOLDOWN_DATASET_ID
>;

/** Validates the artifact, failing closed on any shape or coherence defect. */
export function parseHolyPaladinHealingCooldowns(raw: unknown): HolyPaladinHealingCooldownLoad {
  return parseHealingCooldownIdentityArtifact(raw, {
    datasetId: HOLY_PALADIN_HEALING_COOLDOWN_DATASET_ID,
    classId: 2,
    specId: 65,
  });
}

let cached: HolyPaladinHealingCooldownLoad | null = null;

/** The pinned dataset, or the reason it could not be used. */
export function pinnedHolyPaladinHealingCooldowns(): HolyPaladinHealingCooldownLoad {
  cached ??= parseHolyPaladinHealingCooldowns(artifact);
  return cached;
}
