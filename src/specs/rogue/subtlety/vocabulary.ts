/**
 * The identifiers the pinned Subtlety Rogue APL uses that the shared parser does not know (ONB-A2).
 *
 * WHAT DECLARING AN IDENTIFIER MEANS. It makes a condition containing it PARSE WHOLE instead of
 * refusing at that fragment. It does not make it decidable: `resolver.ts` binds a value only
 * where evidence and pinned facts support one, and the shared evaluator enumerates an unbound
 * truth and refuses an unbound magnitude.
 *
 * NEVER GIVEN A VALUE BY THIS SLICE, and why:
 *
 *   spell_targets.shuriken_storm
 *       the enemy set has no authority (ONB-S3)
 *   cp_max_spend
 *       not reconstructed: it depends on talents and buffs this slice does not bind
 *   priority_rotation
 *       a simulation option, with no value in a real fight
 *   cooldown.shadow_dance.charges_fractional
 *       no cooldown is derived
 *   cooldown.secret_technique.duration
 *       no cooldown is derived
 *   debuff.deathstalkers_mark.stack
 *       M4 reconstructs no stack count, and the target is not modelled
 *   set_bonus.midnight_season_2_2pc
 *       gear sets are not read
 *   energy.regen
 *       no regeneration model exists
 *   target.time_to_die.remains
 *       PREDICTIVE: no player-knowable estimate exists
 *   cooldown.secret_technique.ready
 *       no cooldown is derived
 *   cooldown.shadow_blades.ready
 *       no cooldown is derived
 *   cooldown.shadow_dance.ready
 *       no cooldown is derived
 *
 * BOUND, from the observed tree or the decision cast's own observation:
 *
 *   energy: the decision cast's own PRE_COST observation
 *   energy.deficit: the decision cast's own PRE_COST observation
 *
 * WHAT IS NOT HERE. `buff.<name>.up`, `debuff.<name>.up`, `cooldown.<name>.remains`,
 * `fight_remains` and `talent.<name>` are built-ins and parse without this vocabulary. `trinket.*`
 * is undeclared on purpose: it appears only in the non-domain item lists and in variables only
 * they read, so such a line refuses if anything ever reads it.
 */

import { isBuiltinIdentifier } from "../../../simc/expression/parse.js";
import {
  defineSpecAtomVocabulary,
  type SpecAtomDeclaration,
  type SpecAtomVocabulary,
} from "../../../simc/expression/spec-vocabulary.js";
import { SUBTLETY_ROGUE_SPEC_ID } from "./spec.js";

export const SECRET_TECHNIQUE_READY = "cooldown.secret_technique.ready";
export const SHADOW_BLADES_READY = "cooldown.shadow_blades.ready";
export const SHADOW_DANCE_READY = "cooldown.shadow_dance.ready";
export const ENERGY = "energy";
export const ENERGY_DEFICIT = "energy.deficit";
export const SPELL_TARGETS_SHURIKEN_STORM = "spell_targets.shuriken_storm";
export const CP_MAX_SPEND = "cp_max_spend";
export const PRIORITY_ROTATION = "priority_rotation";
export const SHADOW_DANCE_CHARGES_FRACTIONAL = "cooldown.shadow_dance.charges_fractional";
export const SECRET_TECHNIQUE_DURATION = "cooldown.secret_technique.duration";
export const DEATHSTALKERS_MARK_STACK = "debuff.deathstalkers_mark.stack";
export const SET_BONUS_2PC = "set_bonus.midnight_season_2_2pc";
export const ENERGY_REGEN = "energy.regen";
export const TARGET_TIME_TO_DIE_REMAINS = "target.time_to_die.remains";

const truthAtom = (identifier: string): SpecAtomDeclaration => ({
  identifier,
  shape: "BOOLEAN",
  scope: "PLAYER_SCOPED",
  selfAddressing: false,
});

const magnitudeAtom = (identifier: string): SpecAtomDeclaration => ({
  identifier,
  shape: "NUMERIC",
  scope: "PLAYER_SCOPED",
  selfAddressing: false,
});

/** Declared so their conditions parse; never given a value by this slice. */
export const SUBTLETY_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  SPELL_TARGETS_SHURIKEN_STORM,
  CP_MAX_SPEND,
  PRIORITY_ROTATION,
  SHADOW_DANCE_CHARGES_FRACTIONAL,
  SECRET_TECHNIQUE_DURATION,
  DEATHSTALKERS_MARK_STACK,
  SET_BONUS_2PC,
  ENERGY_REGEN,
  TARGET_TIME_TO_DIE_REMAINS,
] as const);

export const SUBTLETY_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  truthAtom(SECRET_TECHNIQUE_READY),
  truthAtom(SHADOW_BLADES_READY),
  truthAtom(SHADOW_DANCE_READY),
  magnitudeAtom(ENERGY),
  magnitudeAtom(ENERGY_DEFICIT),
  ...SUBTLETY_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const SUBTLETY_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  SUBTLETY_ROGUE_SPEC_ID,
  SUBTLETY_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
