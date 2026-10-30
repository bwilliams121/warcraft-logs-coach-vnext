/**
 * The PREPARATION producer's ingestion requirement.
 *
 * Declared here, by the producer, and unioned by the application services
 * with the selected specialization analyzer's requirement ("the
 * registration declares, the service consumes"). The producer reads the
 * player's own casts and buffs, which PLAYER_CONTEXT retrieves (one
 * unfiltered events stream per fight, with the player always vouched for).
 * It reads no resources, so it never makes a request pay for them, and it
 * never widens a request to FULL_RAID.
 */

import type { AnalyzerRequirement } from "../../services/ingestion-scope.js";

export const PREPARATION_REQUIREMENT: AnalyzerRequirement = {
  analyzerId: "shared-preparation-consumable-status",
  requiredScope: "PLAYER_CONTEXT",
  includeResources: false,
};
