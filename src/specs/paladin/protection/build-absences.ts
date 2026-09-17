/**
 * Build-implied aura ABSENCES (M10-C5 Phase B): `buff.<name>.up` bound FALSE
 * because the observed BUILD has no trigger for the buff, never because the
 * aura stream was silent.
 *
 * Two gates, both read off the actor's combatant-info talent tree:
 *
 *   HERO_TREE_NOT      the buff is triggered only by Templar code paths
 *                      (`hammer_of_light_ready`, `hammer_of_light_free`,
 *                      `undisputed_ruling`); under a RESOLVED non-Templar
 *                      tree nothing can apply it
 *   TALENT_NOT_SELECTED the buff is triggered only under a talent whose node
 *                      the actor spent elsewhere (`blessed_assurance` when the
 *                      choice node holds Divine Guidance)
 *
 * A gate the build does not establish — an unresolved hero tree, an UNKNOWN
 * talent — refuses with BUILD_GATE_NOT_ESTABLISHED, and the shared evaluator
 * enumerates the atom. This module is the ONLY place in the Protection tree
 * that spells `up: false` as a literal, and it does so behind a build gate
 * that the pinned authority (`PROTECTION_BUILD_IMPLIED_ABSENCES`) cites.
 */

import { PROTECTION_BUILD_IMPLIED_ABSENCES } from "../../../data/game/paladin-protection-aura-authority.js";
import type { HeroTreeResolution, TalentResolution } from "../../../data/game/talent-selection.js";

export interface BuildAbsenceInput {
  /** The build facts that gate each pinned absence, by talent name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** The resolved hero tree. Omitted = unresolved. */
  readonly heroTree?: HeroTreeResolution;
}

export type BuildImpliedAbsenceBinding =
  | {
      readonly atomName: string;
      /** FALSE by the observed build: no trigger of the buff exists for this build. */
      readonly state: "BOUND_BY_BUILD";
      readonly up: false;
      readonly abilityGameId: number;
      /** `<gate kind>:<simc name>`, for the payload. */
      readonly gate: string;
    }
  | {
      readonly atomName: string;
      readonly state: "UNBOUND";
      readonly reason: "BUILD_GATE_NOT_ESTABLISHED" | "IDENTITY_NOT_ESTABLISHED_FOR_BUILD";
      readonly abilityGameId: number | null;
      readonly auraReason: null;
    };

/** The build-implied absences this specialization binds. */
export const SUPPORTED_PROTECTION_BUILD_ABSENCES = [
  "hammer_of_light_ready",
  "hammer_of_light_free",
  "undisputed_ruling",
  "blessed_assurance",
] as const;

/** Binds one build-implied absence, or refuses when its gate is not established. */
export function bindBuildImpliedAbsence(
  input: BuildAbsenceInput,
  atomName: string,
): BuildImpliedAbsenceBinding {
  const absence = PROTECTION_BUILD_IMPLIED_ABSENCES.find((entry) => entry.atomName === atomName);
  if (absence === undefined) {
    return {
      atomName,
      state: "UNBOUND",
      reason: "IDENTITY_NOT_ESTABLISHED_FOR_BUILD",
      abilityGameId: null,
      auraReason: null,
    };
  }
  const gate = absence.gate;
  const established =
    gate.kind === "HERO_TREE_NOT"
      ? input.heroTree?.state === "RESOLVED" && input.heroTree.simcName !== gate.simcName
      : input.talents[gate.simcName]?.selection === "NOT_SELECTED";
  if (!established) {
    return {
      atomName,
      state: "UNBOUND",
      reason: "BUILD_GATE_NOT_ESTABLISHED",
      abilityGameId: absence.abilityGameId,
      auraReason: null,
    };
  }
  return {
    atomName,
    state: "BOUND_BY_BUILD",
    up: false,
    abilityGameId: absence.abilityGameId,
    gate: `${gate.kind}:${gate.simcName}`,
  };
}
