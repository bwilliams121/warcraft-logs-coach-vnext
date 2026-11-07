/**
 * The identifiers the pinned Enhancement Shaman APL uses that the shared parser does not know (ONB-B2).
 *
 * WHAT DECLARING AN IDENTIFIER MEANS. It makes a condition containing it PARSE WHOLE instead of
 * refusing at that fragment. It does not make it decidable: `resolver.ts` binds a value only
 * where evidence and pinned facts support one, and the shared evaluator enumerates an unbound
 * truth and refuses an unbound magnitude.
 *
 * ENCOUNTER STATE (SIMC-FB-R). Whatever is listed below as `active_enemies`, `spell_targets`, `fight_style.*` or
 * `raid_event.*` stays unbound by this resolver, and `withEncounterStateAt` may bind it at tier 3, with provenance,
 * where the pinned profile answers on a proven build.
 *
 * NEVER GIVEN A VALUE BY THIS SLICE, and why:
 *
 *   active_enemies
 *       the resolver leaves it to the analysis, which binds the shared enemy count per decision (ONB-S3)
 *   time
 *       the reaction to a pull is not modelled
 *   gcd
 *       hasted, and haste at a decision is not reconstructed
 *   charges_fractional
 *       no cooldown is derived
 *   active_dot.flame_shock
 *       no action or enemy-set binding establishes it (ONB-S3)
 *   action.lightning_bolt.damage
 *       a simulated damage estimate
 *   action.chain_lightning.damage
 *       a simulated damage estimate
 *   target.health.pct
 *       the target's health is not modelled
 *   gcd.max
 *       hasted, and haste at a decision is not reconstructed
 *   dot.flame_shock.remains
 *       the target's debuffs are not read by this slice
 *   buff.converging_storms.max_stack
 *       no aura is pinned by this slice
 *   talent.storm_unleashed.enabled
 *       a three-entry tiered node, not modelled
 *   ticking
 *       the target's debuffs are not read by this slice
 *   ti_lightning_bolt
 *       the module's own Thorim's Invocation state, not reconstructed
 *   ti_chain_lightning
 *       the module's own Thorim's Invocation state, not reconstructed
 *   pet.surging_totem.active
 *       no pet is read by this slice
 *   pet.searing_totem.active
 *       no pet is read by this slice
 *   set_bonus.midnight_season_2_2pc
 *       the set bonus is not read by this slice
 *
 * BOUND, from the observed tree or the decision cast's own observation:
 *
 *   talent.surging_totem.enabled: the three-way talent rule
 *   talent.surging_elements.enabled: the three-way talent rule
 *   talent.feral_spirit.enabled: the three-way talent rule
 *   talent.fire_nova.enabled: the three-way talent rule
 *   talent.thorims_invocation.enabled: the three-way talent rule
 *   talent.lashing_flames.enabled: the three-way talent rule
 *   talent.elemental_tempo.enabled: the three-way talent rule
 *   talent.splitstream.enabled: the three-way talent rule
 *   talent.ascendance.enabled: the three-way talent rule
 *   talent.doom_winds.enabled: the three-way talent rule
 *   talent.deeply_rooted_elements.enabled: the three-way talent rule
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
import { ENHANCEMENT_SHAMAN_SPEC_ID } from "./spec.js";

export const SURGING_TOTEM_ENABLED = "talent.surging_totem.enabled";
export const SURGING_ELEMENTS_ENABLED = "talent.surging_elements.enabled";
export const FERAL_SPIRIT_ENABLED = "talent.feral_spirit.enabled";
export const FIRE_NOVA_ENABLED = "talent.fire_nova.enabled";
export const THORIMS_INVOCATION_ENABLED = "talent.thorims_invocation.enabled";
export const LASHING_FLAMES_ENABLED = "talent.lashing_flames.enabled";
export const ELEMENTAL_TEMPO_ENABLED = "talent.elemental_tempo.enabled";
export const SPLITSTREAM_ENABLED = "talent.splitstream.enabled";
export const ASCENDANCE_ENABLED = "talent.ascendance.enabled";
export const DOOM_WINDS_ENABLED = "talent.doom_winds.enabled";
export const DEEPLY_ROOTED_ELEMENTS_ENABLED = "talent.deeply_rooted_elements.enabled";
export const STORM_UNLEASHED_ENABLED = "talent.storm_unleashed.enabled";
export const TICKING = "ticking";
export const TI_LIGHTNING_BOLT = "ti_lightning_bolt";
export const TI_CHAIN_LIGHTNING = "ti_chain_lightning";
export const PET_SURGING_TOTEM_ACTIVE = "pet.surging_totem.active";
export const PET_SEARING_TOTEM_ACTIVE = "pet.searing_totem.active";
export const SET_BONUS_S2_2PC = "set_bonus.midnight_season_2_2pc";
export const ACTIVE_ENEMIES = "active_enemies";
export const TIME = "time";
export const GCD = "gcd";
export const CHARGES_FRACTIONAL = "charges_fractional";
export const ACTIVE_DOT_FLAME_SHOCK = "active_dot.flame_shock";
export const ACTION_LIGHTNING_BOLT_DAMAGE = "action.lightning_bolt.damage";
export const ACTION_CHAIN_LIGHTNING_DAMAGE = "action.chain_lightning.damage";
export const TARGET_HEALTH_PCT = "target.health.pct";
export const GCD_MAX = "gcd.max";
export const FLAME_SHOCK_REMAINS = "dot.flame_shock.remains";
export const CONVERGING_STORMS_MAX = "buff.converging_storms.max_stack";

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
export const ENHANCEMENT_SHAMAN_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  ACTIVE_ENEMIES,
  TIME,
  GCD,
  CHARGES_FRACTIONAL,
  ACTIVE_DOT_FLAME_SHOCK,
  ACTION_LIGHTNING_BOLT_DAMAGE,
  ACTION_CHAIN_LIGHTNING_DAMAGE,
  TARGET_HEALTH_PCT,
  GCD_MAX,
  FLAME_SHOCK_REMAINS,
  CONVERGING_STORMS_MAX,
] as const);

export const ENHANCEMENT_SHAMAN_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  truthAtom(SURGING_TOTEM_ENABLED),
  truthAtom(SURGING_ELEMENTS_ENABLED),
  truthAtom(FERAL_SPIRIT_ENABLED),
  truthAtom(FIRE_NOVA_ENABLED),
  truthAtom(THORIMS_INVOCATION_ENABLED),
  truthAtom(LASHING_FLAMES_ENABLED),
  truthAtom(ELEMENTAL_TEMPO_ENABLED),
  truthAtom(SPLITSTREAM_ENABLED),
  truthAtom(ASCENDANCE_ENABLED),
  truthAtom(DOOM_WINDS_ENABLED),
  truthAtom(DEEPLY_ROOTED_ELEMENTS_ENABLED),
  truthAtom(STORM_UNLEASHED_ENABLED),
  truthAtom(TICKING),
  truthAtom(TI_LIGHTNING_BOLT),
  truthAtom(TI_CHAIN_LIGHTNING),
  truthAtom(PET_SURGING_TOTEM_ACTIVE),
  truthAtom(PET_SEARING_TOTEM_ACTIVE),
  truthAtom(SET_BONUS_S2_2PC),

  ...ENHANCEMENT_SHAMAN_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const ENHANCEMENT_SHAMAN_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  ENHANCEMENT_SHAMAN_SPEC_ID,
  ENHANCEMENT_SHAMAN_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
