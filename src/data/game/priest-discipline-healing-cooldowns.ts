/**
 * Discipline Priest's healing-cooldown identity (HEAL-B3): WHICH abilities are this
 * specialization's healing cooldowns, and nothing else about them.
 *
 * Spec-owned runtime data, as Restoration Shaman's is (M12-D owner decision):
 * consumed only by `src/specs/priest/discipline/` (`m11a2-cross-spec-isolation` R3),
 * never by the generic `src/healing/`. Read by the shared healing-cooldown
 * identity reader (`healing-cooldown-identity-artifact.ts`).
 *
 * Each entry is a verbatim specialization-tree row of the pinned
 * SimulationCraft `trait_data.inc` (commit 33622e9d, client data
 * 12.1.0.69587), class 5, specialization 256: Power Word: Barrier (62618)
 * and Ultimate Penitence (421453) on one choice node, and Evangelism (472433)
 * on a node of its own. Pain Suppression (an external), Shadowfiend and
 * Mindbender (pet summons) are not identified. The selection of which traits
 * are healing cooldowns is hand reviewed and recorded per entry. No cooldown duration,
 * charge count, effect duration or modifier is claimed: readiness is not
 * derivable from this dataset, and a consumer must not pretend it is. A use is
 * a CAST sourced by the player.
 */

import artifact from "./priest-discipline-healing-cooldowns.json";
import {
  parseHealingCooldownIdentityArtifact,
  type HealingCooldownIdentityLoad,
} from "./healing-cooldown-identity-artifact.js";

export const DISCIPLINE_PRIEST_HEALING_COOLDOWN_DATASET_ID = "SIMC_DBC_PRIEST_DISCIPLINE_HEALING_COOLDOWNS";

export type DisciplinePriestHealingCooldownLoad = HealingCooldownIdentityLoad<
  typeof DISCIPLINE_PRIEST_HEALING_COOLDOWN_DATASET_ID
>;

/** Validates the artifact, failing closed on any shape or coherence defect. */
export function parseDisciplinePriestHealingCooldowns(raw: unknown): DisciplinePriestHealingCooldownLoad {
  return parseHealingCooldownIdentityArtifact(raw, {
    datasetId: DISCIPLINE_PRIEST_HEALING_COOLDOWN_DATASET_ID,
    classId: 5,
    specId: 256,
  });
}

let cached: DisciplinePriestHealingCooldownLoad | null = null;

/** The pinned dataset, or the reason it could not be used. */
export function pinnedDisciplinePriestHealingCooldowns(): DisciplinePriestHealingCooldownLoad {
  cached ??= parseDisciplinePriestHealingCooldowns(artifact);
  return cached;
}
