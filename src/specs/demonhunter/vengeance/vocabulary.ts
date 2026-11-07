/**
 * The identifiers the pinned Vengeance Demon Hunter APL uses that the shared parser does not know (ONB-X3).
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
 *   spell_targets.spirit_bomb
 *       action-owned, and no action registers its target applicability (ONB-S3)
 *   soul_fragments, soul_fragments.total, soul_fragments.inactive
 *       soul fragments are not reconstructed, and no capture shows what the log reports of them
 *   apex.2, apex.3
 *       the tiered Midnight node is not modelled
 *   charges, full_recharge_time, cooldown.*
 *       no cooldown or charge is derived
 *   gcd.max, gcd.remains
 *       hasted, and haste at a decision is not reconstructed
 *   time
 *       the reaction to a pull is not modelled
 *   fury.deficit
 *       the maximum Fury is not read, and no capture shows one
 *   action.soul_cleave.cost
 *       no cost is derived
 *   action.*.placed
 *       a sigil on the ground has no log event
 *   buff.voidfall_spending.max_stack, debuff.reavers_mark.remains
 *       no aura is pinned by this slice
 *   prev_gcd.*, prev_off_gcd.*
 *       the previous action is not reconstructed: a selection that casts nothing is in no log
 *   talent.charred_flesh.rank
 *       a rank, which the three-way talent rule does not state
 *   target.debuff.casting.react
 *       no enemy cast is read
 *   in_combat
 *       no contract says what a logged pull proves of it
 *   fight_style.*, raid_event.*
 *       a simulation's options and scripted events; a real fight has neither. SIMC-FB-A may bind it as a disclosed profile fact, and this list does not read that yet
 *
 * BOUND, from the observed tree or the decision cast's own observation:
 *
 *   hero_tree.aldrachi_reaver: a constant for the actor's active hero sub-tree (player.cpp:12205-12216)
 *   hero_tree.annihilator: a constant for the actor's active hero sub-tree (player.cpp:12205-12216)
 *   fury: the decision cast's own PRE_COST observation
 *
 * WHAT IS NOT HERE. `buff.<name>.up`, `buff.<name>.stack`, `buff.<name>.remains`, `debuff.<name>.up`, `dot.<name>.ticking`, `cooldown.<name>.remains`,
 * `fight_remains`, `target.time_to_die` and `talent.<name>` are built-ins and parse without this vocabulary. `trinket.*`
 * is undeclared on purpose: it appears only in the non-domain item lines and in variables only
 * they read, so such a line refuses if anything ever reads it.
 */

import { isBuiltinIdentifier } from "../../../simc/expression/parse.js";
import {
  defineSpecAtomVocabulary,
  type SpecAtomDeclaration,
  type SpecAtomVocabulary,
} from "../../../simc/expression/spec-vocabulary.js";
import { VENGEANCE_DEMON_HUNTER_SPEC_ID } from "./spec.js";

export const HERO_TREE_ALDRACHI_REAVER = "hero_tree.aldrachi_reaver";
export const HERO_TREE_ANNIHILATOR = "hero_tree.annihilator";
export const FURY = "fury";

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
export const VENGEANCE_DEMON_HUNTER_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  "action.soul_cleave.cost",
  "apex.2",
  "apex.3",
  "buff.voidfall_spending.max_stack",
  "charges",
  "cooldown.fracture.charges",
  "cooldown.fracture.charges_fractional",
  "cooldown.fracture.duration",
  "debuff.reavers_mark.remains",
  "full_recharge_time",
  "fury.deficit",
  "gcd.max",
  "gcd.remains",
  "raid_event.adds.count",
  "raid_event.pull.remains",
  "soul_fragments",
  "soul_fragments.inactive",
  "soul_fragments.total",
  "spell_targets.spirit_bomb",
  "talent.charred_flesh.rank",
  "time",
] as const);

/** Declared so their conditions parse; never given a value by this slice. */
export const VENGEANCE_DEMON_HUNTER_UNBOUND_TRUTH_ATOMS = Object.freeze([
  "action.sigil_of_flame.placed",
  "action.sigil_of_spite.placed",
  "cooldown.fel_devastation.up",
  "cooldown.felblade.up",
  "cooldown.metamorphosis.up",
  "cooldown.sigil_of_spite.up",
  "cooldown.soul_carver.up",
  "cooldown.spirit_bomb.ready",
  "cooldown.spirit_bomb.up",
  "fight_style.dungeonroute",
  "fight_style.dungeonslice",
  "in_combat",
  "prev_gcd.1.reavers_glaive",
  "prev_gcd.1.vengeful_retreat",
  "prev_gcd.2.soul_carver",
  "prev_off_gcd.vengeful_retreat",
  "raid_event.adds.exists",
  "raid_event.adds.has_boss",
  "target.debuff.casting.react",
] as const);

export const VENGEANCE_DEMON_HUNTER_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  truthAtom(HERO_TREE_ALDRACHI_REAVER),
  truthAtom(HERO_TREE_ANNIHILATOR),
  magnitudeAtom(FURY),
  ...VENGEANCE_DEMON_HUNTER_UNBOUND_TRUTH_ATOMS.map((identifier) => truthAtom(identifier)),
  ...VENGEANCE_DEMON_HUNTER_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const VENGEANCE_DEMON_HUNTER_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  VENGEANCE_DEMON_HUNTER_SPEC_ID,
  VENGEANCE_DEMON_HUNTER_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
