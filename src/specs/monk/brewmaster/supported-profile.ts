/**
 * Brewmaster Monk's VALIDATED-PROFILE gate (M11-C4j).
 *
 * WHAT THIS IS, AND WHY IT IS NOT A GAMEPLAY RULE
 *
 * Every Brewmaster conclusion this build publishes rests on real sanitized
 * evidence: two independent subjects (gtKb fight 22 actor 4, rXAf fight 13
 * actor 11), both Shado-Pan. The pinned authority also carries a Master of
 * Harmony list, and the shared engine dispatches into it correctly —
 * `run_action_list,name=master_of_harmony,if=hero_tree.master_of_harmony` is
 * parsed, bound and exercised — but "the APL has a list for it" is not
 * evidence that this analyzer's readings of that list's state are right. No
 * Master of Harmony capture has ever been measured here, so M11-C4j promotes
 * only what was validated (owner decision, the Blood M11-B12 T2 precedent).
 *
 * So this gate is about SUPPORT, not about gameplay. It reads the hero tree
 * the shared three-way talent rule already resolved from the observed
 * combatantinfo entries, and nothing else: never the actions cast, never the
 * aura set, never the corpus, never the absence of any of them.
 *
 * THE FOUR ANSWERS, AND THE STATUS EACH FAILS CLOSED AS
 *
 *   RESOLVED shadopan           supported; analysis proceeds exactly as before
 *   RESOLVED master_of_harmony  AUTHORITY_NOT_AVAILABLE — the build is known
 *                               and this analyzer has no VALIDATED authority
 *                               for it
 *   CONTRADICTORY               PROFILE_NOT_RESOLVED — entries from more than
 *                               one sub-tree; the build is not established
 *   UNKNOWN                     PROFILE_NOT_RESOLVED — no hero entry observed;
 *                               never read as "the other tree"
 *
 * Both statuses already exist in the public vocabulary; promotion adds none.
 */

import type { HeroTreeResolution } from "../../../data/game/talent-selection.js";
import type { AnalysisStatus } from "../../../findings/analysis-envelope.js";

export const BREWMASTER_VALIDATED_HERO_TREES = Object.freeze(["shadopan"] as const);

export type BrewmasterValidatedHeroTree = (typeof BREWMASTER_VALIDATED_HERO_TREES)[number];

export type BrewmasterValidatedProfile =
  | { readonly supported: true; readonly heroTree: BrewmasterValidatedHeroTree }
  | {
      readonly supported: false;
      readonly status: Extract<AnalysisStatus, "AUTHORITY_NOT_AVAILABLE" | "PROFILE_NOT_RESOLVED">;
      readonly detail: string;
    };

export function brewmasterValidatedProfile(heroTree: HeroTreeResolution): BrewmasterValidatedProfile {
  if (heroTree.state === "RESOLVED") {
    const validated = (BREWMASTER_VALIDATED_HERO_TREES as readonly string[]).includes(heroTree.simcName);
    if (validated) {
      return { supported: true, heroTree: heroTree.simcName as BrewmasterValidatedHeroTree };
    }
    return {
      supported: false,
      status: "AUTHORITY_NOT_AVAILABLE",
      detail:
        `This build's hero talent tree resolved to '${heroTree.simcName}' (sub-tree ` +
        `${String(heroTree.subTreeId)}, decided by trait entries ${heroTree.decidedByEntryIds.join(", ")}). ` +
        `Brewmaster Monk analysis is validated against the '${BREWMASTER_VALIDATED_HERO_TREES.join("', '")}' ` +
        "hero tree only, so no rotational authority is applied and no decision was judged.",
    };
  }
  if (heroTree.state === "CONTRADICTORY") {
    return {
      supported: false,
      status: "PROFILE_NOT_RESOLVED",
      detail:
        `The observed talent tree carries entries from more than one hero sub-tree (${heroTree.subTreeIds.join(", ")}), ` +
        "so the build's hero tree is not established and no decision was judged.",
    };
  }
  return {
    supported: false,
    status: "PROFILE_NOT_RESOLVED",
    detail:
      "The observed talent tree establishes no hero sub-tree for this actor, so the build fact Brewmaster " +
      "Monk analysis rests on is missing and no decision was judged.",
  };
}
