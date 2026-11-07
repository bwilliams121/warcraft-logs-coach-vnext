/**
 * The game build a fight is PROVEN to have run on, or `null` (SIMC-FB-A).
 *
 * It reads the region-aware deploy calendar through the one resolver the publication pipeline uses,
 * so there is no second reading of it, and the resolver's rule stands: no nearest build, no date
 * guess, no snapshot. An unresolved fight is `null`, and a reader treats that as not proven.
 */

import type { CombatFight } from "../engine/normalization/combat-fight.js";
import { COMMITTED_DEPLOY_CALENDAR_EVIDENCE } from "../simulation-context/evidence.js";
import { resolveSimulationContext } from "../simulation-context/resolve.js";

const PROVEN_BUILDS = new WeakMap<CombatFight, string | null>();

export function provenGameBuildOf(fight: CombatFight): string | null {
  const cached = PROVEN_BUILDS.get(fight);
  if (cached !== undefined) return cached;
  // The specialization key is echoed by the resolver and decides nothing about the build.
  const { context, status } = resolveSimulationContext(
    { specKey: "", fight },
    COMMITTED_DEPLOY_CALENDAR_EVIDENCE,
  );
  const build = status === "RESOLVED" ? context.gameBuild : null;
  PROVEN_BUILDS.set(fight, build);
  return build;
}
