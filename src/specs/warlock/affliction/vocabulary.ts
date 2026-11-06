/**
 * The identifiers the pinned Affliction Warlock APL uses that the shared parser does not know (ONB-D4).
 *
 * WHAT DECLARING AN IDENTIFIER MEANS. It makes a condition containing it PARSE WHOLE instead of
 * refusing at that fragment. It does not make it decidable: `resolver.ts` binds a value only
 * where evidence and pinned facts support one, and the shared evaluator enumerates an unbound
 * truth and refuses an unbound magnitude.
 *
 * NEVER GIVEN A VALUE BY THIS SLICE, and why:
 *
 *   active_enemies
 *       the resolver leaves it to the analysis, which binds the shared enemy count per decision (ONB-S3)
 *   soul_shard
 *       the wire carries Soul Shards on a costed cast, at its completion, and a cast-time spell spends them. A completion's reading is not its decision's, and no
 *       shared wire contract row exists for it
 *   dot.*.remains, dot.*.refreshable, active_dot.*, execute_time, duration, cooldown.*.duration, gcd, gcd.max, set_bonus.*, prev.*, prev_gcd.*, action.*, pet.darkglare.*
 *       no DoT window, cast time, aura, tier set, previous press, travel or pet state is derived
 *   ticking
 *       the unqualified form of a line's own DoT, on a target nobody identified
 *
 * BOUND, from the observed tree:
 *
 *   hero_tree.soul_harvester: a constant for the actor's active hero sub-tree (player.cpp:12205-12216)
 *   hero_tree.hellcaller: a constant for the actor's active hero sub-tree (player.cpp:12205-12216)
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
import { AFFLICTION_WARLOCK_SPEC_ID } from "./spec.js";

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

export const HERO_TREE_SOUL_HARVESTER = "hero_tree.soul_harvester";
export const HERO_TREE_HELLCALLER = "hero_tree.hellcaller";

/** Declared so their conditions parse; never given a value by this slice. */
export const AFFLICTION_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  "active_dot.agony",
  "active_enemies",
  "cooldown.summon_darkglare.duration",
  "dot.agony.remains",
  "dot.corruption.remains",
  "dot.seed_of_corruption.remains",
  "duration",
  "execute_time",
  "gcd",
  "gcd.max",
  "pet.darkglare.remains",
  "soul_shard",
] as const);

/** Declared so their conditions parse; never given a value by this slice. */
export const AFFLICTION_UNBOUND_TRUTH_ATOMS = Object.freeze([
  "action.seed_of_corruption.in_flight",
  "dot.corruption.refreshable",
  "dot.wither.refreshable",
  "pet.darkglare.active",
  "prev.seed_of_corruption",
  "prev_gcd.1.malevolence",
  "set_bonus.midnight_season_2_4pc",
  "ticking",
] as const);

export const AFFLICTION_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  truthAtom(HERO_TREE_SOUL_HARVESTER),
  truthAtom(HERO_TREE_HELLCALLER),
  ...AFFLICTION_UNBOUND_TRUTH_ATOMS.map((identifier) => truthAtom(identifier)),
  ...AFFLICTION_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const AFFLICTION_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  AFFLICTION_WARLOCK_SPEC_ID,
  AFFLICTION_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
