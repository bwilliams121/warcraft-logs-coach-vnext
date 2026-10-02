/**
 * The VALIDATED-PROFILE gate shape (M11-D2-B1): whether a build's resolved
 * hero tree is one a specialization's evidence validated.
 *
 * A gate about SUPPORT, not gameplay. It reads the hero-tree resolution the
 * caller already made from observed talent entries and adds no evidence of
 * its own — never the actions cast, the aura set or the absence of either.
 *
 *     RESOLVED, validated     supported
 *     RESOLVED, other tree    AUTHORITY_NOT_AVAILABLE — the build is known and
 *                             no validated authority exists for it
 *     CONTRADICTORY           PROFILE_NOT_RESOLVED — entries from more than one
 *                             sub-tree; the build is not established
 *     UNKNOWN                 PROFILE_NOT_RESOLVED — no hero entry observed;
 *                             never read as some other tree
 *
 * The specialization owns its display name, its validated trees, and whether
 * it uses this gate at all. Both statuses already exist in the public
 * vocabulary.
 *
 * Proven equal to the specialization implementations on committed evidence by
 * tests/contracts/m11d2b1-shared-plumbing-equivalence.test.ts. No public
 * analyzer imports this module.
 */

import type { HeroTreeResolution } from "../data/game/talent-selection.js";
import type { AnalysisStatus } from "./analysis-envelope.js";

export interface ValidatedHeroTreeGate<TTree extends string> {
  /** The specialization as the detail names it, e.g. "<Spec> <Class>". */
  readonly displayName: string;
  /** The hero trees the specialization's evidence validated. */
  readonly trees: readonly TTree[];
}

export type ValidatedHeroTreeProfile<TTree extends string> =
  | { readonly supported: true; readonly heroTree: TTree }
  | {
      readonly supported: false;
      readonly status: Extract<AnalysisStatus, "AUTHORITY_NOT_AVAILABLE" | "PROFILE_NOT_RESOLVED">;
      readonly detail: string;
    };

export function validatedHeroTreeProfile<TTree extends string>(
  gate: ValidatedHeroTreeGate<TTree>,
  heroTree: HeroTreeResolution,
): ValidatedHeroTreeProfile<TTree> {
  if (heroTree.state === "RESOLVED") {
    const validated = (gate.trees as readonly string[]).includes(heroTree.simcName);
    if (validated) {
      return { supported: true, heroTree: heroTree.simcName as TTree };
    }
    return {
      supported: false,
      status: "AUTHORITY_NOT_AVAILABLE",
      detail:
        `This build's hero talent tree resolved to '${heroTree.simcName}' (sub-tree ` +
        `${String(heroTree.subTreeId)}, decided by trait entries ${heroTree.decidedByEntryIds.join(", ")}). ` +
        `${gate.displayName} analysis is validated against the '${gate.trees.join("', '")}' ` +
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
      `The observed talent tree establishes no hero sub-tree for this actor, so the build fact ${gate.displayName} ` +
      "analysis rests on is missing and no decision was judged.",
  };
}
