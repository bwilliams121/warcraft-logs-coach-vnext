/**
 * A POSITIVE range/target proof by same-target corroboration (M11-C4i): the
 * RANGE_TARGET dimension of the positive usability contract, in its only
 * supported tier — STRICT, evidence-backed.
 *
 * THE ARGUMENT
 *
 * A completed cast of a spell whose pinned targeting is an ENEMY UNIT TARGET,
 * against a concrete target actor, is the game's own proof that at that
 * instant the target was a valid enemy within that spell's pinned range
 * interval [min, max]. A candidate that needs the SAME target within an
 * interval that CONTAINS the observed one — pinned `min <= observed min` and
 * `observed max <= max` — is therefore proven in range at the same instant.
 *
 * WHAT IS REFUSED — every one of these is UNKNOWN, never "out of range":
 *
 *   - an UNTARGETED candidate (a cone, a caster-centred area, a max range of
 *     0): whether it would have reached anything is not a range fact a
 *     single-target observation can prove;
 *   - a corroborating cast that is not an ENEMY_UNIT_TARGET spell (an
 *     untargeted, ground or self cast establishes no target);
 *   - a corroborating cast with no target actor, or targeting the caster;
 *   - a decision whose target is not the corroborating cast's target;
 *   - a candidate interval that does not contain the observed one.
 *
 * NO RANGE ASSUMPTION. Nothing here reads SimulationCraft's target-dummy
 * distance, and no "same target, so same range" rule exists: the relationship
 * comes from the two pinned range records or it does not exist.
 */

import type { EvidenceLocator } from "../../engine/evidence/locator.js";
import { provenDimension, unknownDimension, type DimensionResolution } from "./usability-completeness.js";

export type RangeTargetMode = "ENEMY_UNIT_TARGET" | "ENEMY_TARGET_DESTINATION" | "UNTARGETED";

/** One spell's pinned target mode and range interval (the usability authority's record). */
export interface PinnedRangeRequirement {
  readonly spellId: number;
  readonly targetMode: RangeTargetMode;
  readonly minRangeYd: number;
  readonly maxRangeYd: number;
}

export interface SameTargetCorroborationInput {
  readonly candidate: PinnedRangeRequirement;
  /** The decision's own observed cast: its pinned requirement, its target and caster, and its locator. */
  readonly observed: PinnedRangeRequirement & {
    readonly casterActorId: number;
    readonly targetActorId: number | null;
    readonly locator: EvidenceLocator;
  };
  /** The target the decision is about (the caller's override, or the observed cast's target). */
  readonly decisionTargetActorId: number | null;
}

export function corroborateRangeBySameTarget(input: SameTargetCorroborationInput): DimensionResolution {
  const { candidate, observed } = input;
  if (candidate.targetMode === "UNTARGETED") {
    return unknownDimension(
      "CANDIDATE_UNTARGETED",
      `spell ${String(candidate.spellId)} is untargeted in the pinned data, so no same-target observation proves its target requirement`,
    );
  }
  if (observed.targetMode !== "ENEMY_UNIT_TARGET") {
    return unknownDimension(
      "CORROBORATOR_NOT_ENEMY_UNIT_TARGET",
      `the observed spell ${String(observed.spellId)} is ${observed.targetMode} in the pinned data, so its cast establishes no enemy target`,
    );
  }
  if (observed.targetActorId === null || observed.targetActorId === observed.casterActorId) {
    return unknownDimension(
      "CORROBORATOR_TARGET_NOT_ESTABLISHED",
      "the observed cast names no enemy target actor",
    );
  }
  if (input.decisionTargetActorId !== observed.targetActorId) {
    return unknownDimension(
      "DIFFERENT_TARGET",
      `the decision's target ${String(input.decisionTargetActorId)} is not the observed cast's target ${String(observed.targetActorId)}`,
    );
  }
  if (!(candidate.minRangeYd <= observed.minRangeYd && observed.maxRangeYd <= candidate.maxRangeYd)) {
    return unknownDimension(
      "RANGE_NOT_CONTAINED",
      `the candidate's pinned range [${String(candidate.minRangeYd)}, ${String(candidate.maxRangeYd)}] yd does not contain the observed spell's [${String(observed.minRangeYd)}, ${String(observed.maxRangeYd)}] yd`,
    );
  }
  return provenDimension(
    "SAME_TARGET_RANGE_CONTAINED",
    "the decision's own completed cast of a pinned enemy-unit-target spell establishes its target within that spell's pinned range, and the candidate requires the same target within a pinned range interval that contains it",
    {
      targetActorId: observed.targetActorId,
      corroboratingSpellId: observed.spellId,
      corroboratingRange: `${String(observed.minRangeYd)}-${String(observed.maxRangeYd)}`,
      candidateSpellId: candidate.spellId,
      candidateRange: `${String(candidate.minRangeYd)}-${String(candidate.maxRangeYd)}`,
      candidateTargetMode: candidate.targetMode,
    },
    [observed.locator],
  );
}
