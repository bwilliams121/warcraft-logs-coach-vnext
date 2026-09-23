/**
 * Blood Death Knight's VALIDATED-PROFILE gate (M11-B12).
 *
 * WHAT THIS IS, AND WHY IT IS NOT A GAMEPLAY RULE
 *
 * Every Blood conclusion this build publishes rests on real sanitized
 * evidence: two captures, both San'layn. The pinned authority also carries a
 * Deathbringer list, and the shared engine would dispatch into it correctly —
 * `default[14] run_action_list,name=deathbringer,if=hero_tree.deathbringer`
 * is parsed, bound and exercised — but "the APL has a list for it" is not
 * evidence that this analyzer's readings of that list's state are right. No
 * Deathbringer capture has ever been measured here, so no Deathbringer
 * verdict has ever been reviewed, and M11-B12 promotes only what was
 * validated (owner decision T2).
 *
 * So this gate is about SUPPORT, not about gameplay. It reads the hero tree
 * the shared three-way talent rule already resolved from the observed
 * combatantinfo entries, and nothing else: it never infers a hero tree from
 * the actions the player cast, from the aura set, from the corpus, or from
 * the absence of any of them. Inference in either direction would defeat the
 * purpose — the question is what the BUILD is, and only the build's own
 * trait entries answer it.
 *
 * THE FOUR ANSWERS, AND THE STATUS EACH FAILS CLOSED AS
 *
 *   RESOLVED sanlayn        supported; analysis proceeds exactly as before
 *   RESOLVED deathbringer   AUTHORITY_NOT_AVAILABLE — the build is known and
 *                           this analyzer has no VALIDATED authority for it.
 *                           The project's "no trustworthy standard for this
 *                           question" answer, in the public status vocabulary
 *   UNKNOWN                 PROFILE_NOT_RESOLVED — the profile establishes no
 *                           hero tree (no sub-tree entry observed), so the
 *                           build fact the slice rests on is missing
 *   CONTRADICTORY           PROFILE_NOT_RESOLVED — entries from BOTH sub-trees
 *                           were observed, which no real build produces; the
 *                           profile is not trustworthy and nothing is analyzed
 *
 * Both statuses are existing members of the public analysis vocabulary. No
 * enum moved for this gate, and none should: a new public status would be a
 * schema decision, and the honest answers already exist.
 *
 * WHEN A DEATHBRINGER CAPTURE ARRIVES. Promotion of that slice is the same
 * reviewed shape as this one: real sanitized evidence, a measured decision
 * surface, an audited MATCH/REJECTED population, then this file's supported
 * set grows. Until then the refusal is the truthful answer, and it is not a
 * defect for a Deathbringer request to receive it.
 */

import type { HeroTreeResolution } from "../../../data/game/talent-selection.js";
import type { AnalysisStatus } from "../../../findings/analysis-envelope.js";

/** The hero sub-tree Blood's public slice is validated against. One member, deliberately. */
export const BLOOD_VALIDATED_HERO_TREES = Object.freeze(["sanlayn"] as const);

export type BloodValidatedHeroTree = (typeof BLOOD_VALIDATED_HERO_TREES)[number];

export type BloodValidatedProfile =
  | { readonly supported: true; readonly heroTree: BloodValidatedHeroTree }
  | {
      readonly supported: false;
      readonly status: Extract<AnalysisStatus, "AUTHORITY_NOT_AVAILABLE" | "PROFILE_NOT_RESOLVED">;
      readonly detail: string;
    };

/**
 * Whether this build's resolved hero tree is one Blood's evidence validated.
 *
 * The resolution is the caller's — `resolveBloodHeroTree` over the observed
 * combatantinfo talent entries — and this function adds no evidence of its
 * own. It is a pure reading of that resolution against one frozen list.
 */
export function bloodValidatedProfile(heroTree: HeroTreeResolution): BloodValidatedProfile {
  if (heroTree.state === "RESOLVED") {
    const validated = (BLOOD_VALIDATED_HERO_TREES as readonly string[]).includes(heroTree.simcName);
    if (validated) {
      return { supported: true, heroTree: heroTree.simcName as BloodValidatedHeroTree };
    }
    return {
      supported: false,
      status: "AUTHORITY_NOT_AVAILABLE",
      detail:
        `This build's hero talent tree resolved to '${heroTree.simcName}' (sub-tree ` +
        `${String(heroTree.subTreeId)}, decided by trait entries ${heroTree.decidedByEntryIds.join(", ")}). ` +
        `Blood Death Knight analysis is validated against the '${BLOOD_VALIDATED_HERO_TREES.join("', '")}' ` +
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
      "The observed talent tree establishes no hero sub-tree for this actor, so the build fact Blood Death " +
      "Knight analysis rests on is missing and no decision was judged.",
  };
}
