/**
 * The identifiers the pinned Fire Mage APL uses that the shared parser does not know (ONB-X1).
 *
 * WHAT DECLARING AN IDENTIFIER MEANS. It makes a condition containing it PARSE WHOLE instead of
 * refusing at that fragment. It does not make it decidable: `resolver.ts` binds a value only
 * where evidence and pinned facts support one, and the shared evaluator enumerates an unbound
 * truth and refuses an unbound magnitude.
 *
 * NEVER GIVEN A VALUE BY THIS SLICE, and why:
 *
 *   active_enemies
 *       the enemy set has no authority (ONB-S3)
 *   cooldown.*, cooldown_react, gcd.*, time
 *       no cooldown, charge, GCD or clock is derived, so the Combustion dispatch stays open
 *   hot_streak_spells_in_flight, action.*.in_flight, action.*.in_flight_remains
 *       no projectile is tracked, and a crit the projectile has not landed is unknown to anyone
 *   action.*.executing, action.*.execute_remains, cast_time, action.*.cast_time, action.*.last_used
 *       no cast in progress, cast time or last use is derived at a decision
 *   scorch_execute.active, firestarter.active
 *       each reads the target's health (sc_mage.cpp:6909-6913), which nothing here reads
 *   buff.*.down, prev_gcd.*, set_bonus.*
 *       no aura, previous press or tier set is derived
 *
 * BOUND, from the observed tree:
 *
 *   nothing: the list reads no hero_tree atom, and every `talent.<name>` is built in
 *
 * WHAT IS NOT HERE. `buff.<name>.up`, `buff.<name>.stack`, `buff.<name>.remains`, `buff.<name>.react`, `debuff.<name>.up`,
 * `dot.<name>.ticking`, `cooldown.<name>.remains`, `fight_remains`, `target.time_to_die`, `remains`, `refreshable` and
 * `talent.<name>` are built-ins and parse without this vocabulary. Hot Streak, Heating Up and Pyroclasm are read through
 * `buff.<name>.react`, `.up` and `.stack`, so they stay unbound built-ins (README.md "The proc chain"). `trinket.*` is undeclared on
 * purpose: it appears only in the non-domain item lines and in variables only they read, so such a line refuses if anything ever reads it.
 * `expected_combat_length` is undeclared too: only precombat reads it, in a variable that therefore stays UNKNOWN.
 */

import { isBuiltinIdentifier } from "../../../simc/expression/parse.js";
import {
  defineSpecAtomVocabulary,
  type SpecAtomDeclaration,
  type SpecAtomVocabulary,
} from "../../../simc/expression/spec-vocabulary.js";
import { FIRE_MAGE_SPEC_ID } from "./spec.js";

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
export const FIRE_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  "action.fireball.cast_time",
  "action.fireball.execute_remains",
  "action.flamestrike.execute_remains",
  "action.meteor.in_flight_remains",
  "action.pyroblast.cast_time",
  "action.pyroblast.execute_remains",
  "action.scorch.cast_time",
  "action.scorch.execute_remains",
  "action.scorch.last_used",
  "active_enemies",
  "cast_time",
  "cooldown.fire_blast.charges_fractional",
  "gcd.max",
  "gcd.remains",
  "hot_streak_spells_in_flight",
  "time",
] as const);

/** Declared so their conditions parse; never given a value by this slice. */
export const FIRE_UNBOUND_TRUTH_ATOMS = Object.freeze([
  "action.fireball.executing",
  "action.flamestrike.executing",
  "action.meteor.in_flight",
  "action.pyroblast.executing",
  "action.scorch.executing",
  "buff.bloodlust.down",
  "buff.combustion.down",
  "buff.frostfire_empowerment.down",
  "buff.heat_shimmer.down",
  "buff.pyroclasm.down",
  "cooldown.combustion.ready",
  "cooldown.meteor.ready",
  "cooldown_react",
  "firestarter.active",
  "prev_gcd.1.flamestrike",
  "prev_gcd.1.meteor",
  "prev_gcd.1.pyroblast",
  "prev_gcd.1.scorch",
  "scorch_execute.active",
  "set_bonus.midnight_season_2_2pc",
] as const);

export const FIRE_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  ...FIRE_UNBOUND_TRUTH_ATOMS.map((identifier) => truthAtom(identifier)),
  ...FIRE_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const FIRE_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  FIRE_MAGE_SPEC_ID,
  FIRE_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
