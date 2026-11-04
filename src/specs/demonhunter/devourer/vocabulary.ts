/**
 * The identifiers the pinned Devourer Demon Hunter APL uses that the shared parser does not know (ONB-B3).
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
 *   active_dot.soul_immolation
 *       the enemy set has no authority (ONB-S3)
 *   time
 *       the reaction to a pull is not modelled
 *   gcd.max
 *       hasted, and haste at a decision is not reconstructed
 *   gcd.remains
 *       hasted, and haste at a decision is not reconstructed
 *   soul_fragments
 *       soul fragments are not reconstructed: the live count has no log event, and nothing here identifies what the log's 1223412 records
 *   action.reap.souls_consumed
 *       soul fragments are not reconstructed: the live count has no log event, and nothing here identifies what the log's 1223412 records
 *   action.void_ray.last_used
 *       the simulation's last execution time, which feeds `void_ray_count`; no reader is reviewed
 *   action.pick_up_fragment.last_used
 *       a pick-up has no log event, so its last execution is unobservable
 *   void_metamorphosis_base_drain_ps
 *       the module's own drain state (devourer_fury_state), not reconstructed
 *   buff.void_metamorphosis_stack.max_stack
 *       no aura is pinned by this slice
 *   buff.collapsing_star_stacking.max_stack
 *       no aura is pinned by this slice
 *   buff.void_metamorphosis_stack.at_max_stacks
 *       no aura is pinned by this slice
 *   set_bonus.midnight_season_2_4pc
 *       the set bonus is not read by this slice
 *   apex.1
 *       the tiered Midnight node is not modelled
 *   prev_gcd.1.void_ray
 *       the previous foreground action is not reconstructed: a selection that casts nothing is in no log
 *   cooldown.the_hunt.ready
 *       no cooldown is derived
 *
 * BOUND, from the observed tree or the decision cast's own observation:
 *
 *   hero_tree.annihilator: a constant for the actor's active hero sub-tree (player.cpp:12205-12216)
 *   hero_tree.voidscarred: a constant for the actor's active hero sub-tree (player.cpp:12205-12216)
 *   fury: the decision cast's own PRE_COST observation
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
import { DEVOURER_DEMON_HUNTER_SPEC_ID } from "./spec.js";

export const HERO_TREE_ANNIHILATOR = "hero_tree.annihilator";
export const HERO_TREE_VOIDSCARRED = "hero_tree.voidscarred";
export const VOID_META_AT_MAX_STACKS = "buff.void_metamorphosis_stack.at_max_stacks";
export const SET_BONUS_S2_4PC = "set_bonus.midnight_season_2_4pc";
export const APEX_1 = "apex.1";
export const PREV_GCD_VOID_RAY = "prev_gcd.1.void_ray";
export const THE_HUNT_READY = "cooldown.the_hunt.ready";
export const FURY = "fury";
export const ACTIVE_ENEMIES = "active_enemies";
export const ACTIVE_DOT_SOUL_IMMOLATION = "active_dot.soul_immolation";
export const TIME = "time";
export const GCD_MAX = "gcd.max";
export const GCD_REMAINS = "gcd.remains";
export const SOUL_FRAGMENTS = "soul_fragments";
export const REAP_SOULS_CONSUMED = "action.reap.souls_consumed";
export const VOID_RAY_LAST_USED = "action.void_ray.last_used";
export const PICK_UP_FRAGMENT_LAST_USED = "action.pick_up_fragment.last_used";
export const BASE_DRAIN_PS = "void_metamorphosis_base_drain_ps";
export const VOID_META_STACK_MAX = "buff.void_metamorphosis_stack.max_stack";
export const COLLAPSING_STAR_STACK_MAX = "buff.collapsing_star_stacking.max_stack";

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
export const DEVOURER_DEMON_HUNTER_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  ACTIVE_ENEMIES,
  ACTIVE_DOT_SOUL_IMMOLATION,
  TIME,
  GCD_MAX,
  GCD_REMAINS,
  SOUL_FRAGMENTS,
  REAP_SOULS_CONSUMED,
  VOID_RAY_LAST_USED,
  PICK_UP_FRAGMENT_LAST_USED,
  BASE_DRAIN_PS,
  VOID_META_STACK_MAX,
  COLLAPSING_STAR_STACK_MAX,
] as const);

export const DEVOURER_DEMON_HUNTER_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  truthAtom(HERO_TREE_ANNIHILATOR),
  truthAtom(HERO_TREE_VOIDSCARRED),
  truthAtom(VOID_META_AT_MAX_STACKS),
  truthAtom(SET_BONUS_S2_4PC),
  truthAtom(APEX_1),
  truthAtom(PREV_GCD_VOID_RAY),
  truthAtom(THE_HUNT_READY),
  magnitudeAtom(FURY),
  ...DEVOURER_DEMON_HUNTER_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const DEVOURER_DEMON_HUNTER_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  DEVOURER_DEMON_HUNTER_SPEC_ID,
  DEVOURER_DEMON_HUNTER_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
