/**
 * Havoc Demon Hunter's VALIDATED-PROFILE gate (ONB-A1P).
 *
 * WHAT THIS IS, AND WHY IT IS NOT A GAMEPLAY RULE
 *
 * Every Havoc conclusion this build publishes rests on one real subject,
 * b1PmaKrd6CDfzngc fight 48 actor 18, an Aldrachi Reaver. The pinned authority
 * also carries Fel-Scarred conditions, but "the list has a line for it" is not
 * evidence that this analyzer's readings of that state are right: Demonsurge is
 * runtime state on a quiet buff the log never shows, and no Fel-Scarred capture
 * has been measured here. So ONB-A1P publishes only what was validated, by the
 * validated-profile precedent of M11-B12 and M11-C4j.
 *
 * So this gate is about SUPPORT, not about gameplay. It reads the hero tree the
 * shared three-way talent rule already resolved from the observed combatantinfo
 * entries, and nothing else: never the actions cast, never the aura set, never
 * the absence of any of them.
 *
 * THE FOUR ANSWERS, AND THE STATUS EACH FAILS CLOSED AS
 *
 *   RESOLVED aldrachi_reaver   supported; analysis proceeds
 *   RESOLVED felscarred        AUTHORITY_NOT_AVAILABLE: the build is known and
 *                              this analyzer has no VALIDATED authority for it
 *   CONTRADICTORY              PROFILE_NOT_RESOLVED: entries from more than one
 *                              sub-tree, so the build is not established
 *   UNKNOWN                    PROFILE_NOT_RESOLVED: no hero entry observed,
 *                              never read as "the other tree"
 *
 * Both statuses already exist in the public vocabulary; promotion adds none.
 */

import type { HeroTreeResolution } from "../../../data/game/talent-selection.js";
import type { AnalysisStatus } from "../../../findings/analysis-envelope.js";

export const HAVOC_VALIDATED_HERO_TREES = Object.freeze(["aldrachi_reaver"] as const);

export type HavocValidatedHeroTree = (typeof HAVOC_VALIDATED_HERO_TREES)[number];

export type HavocValidatedProfile =
  | { readonly supported: true; readonly heroTree: HavocValidatedHeroTree }
  | {
      readonly supported: false;
      readonly status: Extract<AnalysisStatus, "AUTHORITY_NOT_AVAILABLE" | "PROFILE_NOT_RESOLVED">;
      readonly detail: string;
    };

export function havocValidatedProfile(heroTree: HeroTreeResolution): HavocValidatedProfile {
  if (heroTree.state === "RESOLVED") {
    const validated = (HAVOC_VALIDATED_HERO_TREES as readonly string[]).includes(heroTree.simcName);
    if (validated) {
      return { supported: true, heroTree: heroTree.simcName as HavocValidatedHeroTree };
    }
    return {
      supported: false,
      status: "AUTHORITY_NOT_AVAILABLE",
      detail:
        `This build's hero talent tree resolved to '${heroTree.simcName}' (sub-tree ` +
        `${String(heroTree.subTreeId)}, decided by trait entries ${heroTree.decidedByEntryIds.join(", ")}). ` +
        `Havoc Demon Hunter analysis is validated against the '${HAVOC_VALIDATED_HERO_TREES.join("', '")}' ` +
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
      "The observed talent tree establishes no hero sub-tree for this actor, so the build fact Havoc Demon " +
      "Hunter analysis rests on is missing and no decision was judged.",
  };
}
