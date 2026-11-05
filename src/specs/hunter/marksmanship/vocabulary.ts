/**
 * The identifiers the pinned Marksmanship Hunter APL uses that the shared parser does not know (ONB-D4).
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
 *   focus, cost, action.*.cost
 *       the wire carries Focus on a costed cast, at its completion, and a cast-time spell spends it. A completion's reading is not its decision's, and no
 *       shared wire contract row exists for it
 *   fight_style.dungeonroute
 *       a simulation setting, with no authority for a real fight. It gates the list's `retarget` line, so it stops every scan
 *   raid_event.pull.*, max_prio_damage, target.health
 *       simulation raid events and target priority, with no log stream behind them
 *   cooldown.*, buff.*.down, buff.*.max_stack, debuff.*.react, debuff.*.down, dot.*.remains, full_recharge_time, cast_time, execute_time, gcd, gcd.max, time, set_bonus.*, action.*
 *       no cooldown, charge, aura, cast time, clock or tier set is derived
 *
 * BOUND, from the observed tree:
 *
 *   hero_tree.sentinel: a constant for the actor's active hero sub-tree (player.cpp:12205-12216)
 *   hero_tree.dark_ranger: a constant for the actor's active hero sub-tree (player.cpp:12205-12216)
 *
 * WHAT IS NOT HERE. `buff.<name>.up`, `buff.<name>.stack`, `buff.<name>.remains`, `buff.<name>.react`, `debuff.<name>.up`,
 * `dot.<name>.ticking`, `cooldown.<name>.remains`, `fight_remains`, `target.time_to_die`, `remains`, `refreshable` and
 * `talent.<name>` are built-ins and parse without this vocabulary. `trinket.*` is undeclared on purpose: it appears only in
 * the non-domain item lines and in variables only they read, so such a line refuses if anything ever reads it.
 */

import { isBuiltinIdentifier } from "../../../simc/expression/parse.js";
import {
  defineSpecAtomVocabulary,
  type SpecAtomDeclaration,
  type SpecAtomVocabulary,
} from "../../../simc/expression/spec-vocabulary.js";
import { MARKSMANSHIP_HUNTER_SPEC_ID } from "./spec.js";

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

export const HERO_TREE_SENTINEL = "hero_tree.sentinel";
export const HERO_TREE_DARK_RANGER = "hero_tree.dark_ranger";

/** Declared so their conditions parse; never given a value by this slice. */
export const MARKSMANSHIP_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  "action.aimed_shot.cost",
  "active_enemies",
  "buff.bullseye.max_stack",
  "cast_time",
  "cooldown.trueshot.duration",
  "cost",
  "debuff.sentinels_mark.react",
  "dot.explosive_shot.remains",
  "execute_time",
  "focus",
  "full_recharge_time",
  "gcd",
  "gcd.max",
  "raid_event.pull.in",
  "raid_event.pull.remains",
  "target.health",
  "time",
] as const);

/** Declared so their conditions parse; never given a value by this slice. */
export const MARKSMANSHIP_UNBOUND_TRUTH_ATOMS = Object.freeze([
  "action.aimed_shot.in_flight_to_target",
  "buff.precise_shots.down",
  "buff.trick_shots.down",
  "cooldown.black_arrow.ready",
  "cooldown.explosive_shot.ready",
  "cooldown.rapid_fire.ready",
  "debuff.sentinels_mark.down",
  "debuff.spotters_mark.down",
  "fight_style.dungeonroute",
  "max_prio_damage",
  "set_bonus.mid2_4pc",
] as const);

export const MARKSMANSHIP_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  truthAtom(HERO_TREE_SENTINEL),
  truthAtom(HERO_TREE_DARK_RANGER),
  ...MARKSMANSHIP_UNBOUND_TRUTH_ATOMS.map((identifier) => truthAtom(identifier)),
  ...MARKSMANSHIP_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const MARKSMANSHIP_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  MARKSMANSHIP_HUNTER_SPEC_ID,
  MARKSMANSHIP_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
