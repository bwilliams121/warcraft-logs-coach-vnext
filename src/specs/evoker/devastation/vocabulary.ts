/**
 * The identifiers the pinned Devastation Evoker APL uses that the shared parser does not know (ONB-X2).
 *
 * WHAT DECLARING AN IDENTIFIER MEANS. It makes a condition containing it PARSE WHOLE instead of
 * refusing at that fragment. It does not make it decidable: `resolver.ts` binds a value only
 * where evidence and pinned facts support one, and the shared evaluator enumerates an unbound
 * truth and refuses an unbound magnitude.
 *
 * NEVER GIVEN A VALUE BY THIS SLICE, and why:
 *
 *   active_enemies, active_dot.*
 *       no action or enemy-set binding establishes it (ONB-S3)
 *   raid_event.*
 *       a simulation's scripted raid events; a real fight has no such schedule. SIMC-FB-A may bind it as a disclosed profile fact, and this list does not read that yet
 *   cooldown.*, gcd.*, action.*.usable_in, action.*.ready
 *       no cooldown, charge or GCD is derived
 *   buff.*.at_max_stacks, buff.*.down, dot.*.refreshable, execute_time
 *       no aura, damage over time or execute time is derived
 *   target.debuff.casting.react, target.health.pct
 *       no enemy cast or target health is read
 *   talent.volatility.rank
 *       a rank, which the three-way talent rule does not state
 *   set_bonus.*
 *       no tier set is derived
 *
 * BOUND, from the observed tree:
 *
 *   nothing: the list reads no hero_tree atom, and every `talent.<name>` is built in
 *
 * WHAT IS NOT HERE. `buff.<name>.up`, `buff.<name>.stack`, `buff.<name>.remains`, `buff.<name>.react`, `debuff.<name>.up`,
 * `dot.<name>.ticking`, `cooldown.<name>.remains`, `fight_remains`, `target.time_to_die`, `remains`, `refreshable` and
 * `talent.<name>` are built-ins and parse without this vocabulary. `trinket.*` is undeclared on
 * purpose: it appears only in the non-domain item lines and in variables only they read, so such a line refuses if anything ever reads it.
 * `spell_haste` is undeclared too: only precombat reads it, in `variable.r1_cast_time`, which no in-combat line reads.
 */

import { isBuiltinIdentifier } from "../../../simc/expression/parse.js";
import {
  defineSpecAtomVocabulary,
  type SpecAtomDeclaration,
  type SpecAtomVocabulary,
} from "../../../simc/expression/spec-vocabulary.js";
import { DEVASTATION_EVOKER_SPEC_ID } from "./spec.js";

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
export const DEVASTATION_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  "action.fire_breath.usable_in",
  "active_dot.fire_breath_damage",
  "active_enemies",
  "dot.fire_breath_damage.remains",
  "execute_time",
  "gcd.max",
  "gcd.remains",
  "raid_event.adds.in",
  "raid_event.movement.in",
  "talent.volatility.rank",
  "target.health.pct",
] as const);

/** Declared so their conditions parse; never given a value by this slice. */
export const DEVASTATION_UNBOUND_TRUTH_ATOMS = Object.freeze([
  "action.fire_breath.ready",
  "buff.essence_burst.at_max_stacks",
  "buff.essence_burst.down",
  "dot.fire_breath_damage.refreshable",
  "raid_event.adds.exists",
  "set_bonus.mid1_2pc",
  "target.debuff.casting.react",
] as const);

export const DEVASTATION_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  ...DEVASTATION_UNBOUND_TRUTH_ATOMS.map((identifier) => truthAtom(identifier)),
  ...DEVASTATION_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const DEVASTATION_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  DEVASTATION_EVOKER_SPEC_ID,
  DEVASTATION_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
