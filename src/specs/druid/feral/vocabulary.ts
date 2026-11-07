/**
 * The identifiers the pinned Feral Druid APL uses that the shared parser does not know (ONB-C1).
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
 *   spell_targets
 *       action-owned, and no action registers its target applicability (ONB-S3)
 *   spell_targets.primal_wrath
 *       action-owned, and no action registers its target applicability (ONB-S3)
 *   spell_targets.swipe_cat
 *       action-owned, and no action registers its target applicability (ONB-S3)
 *   active_dot.rake
 *       no action or enemy-set binding establishes it (ONB-S3)
 *   persistent_multiplier
 *       the snapshot multiplier is unbindable by design: nothing here infers it from damage numbers
 *   action.rake.pmultiplier
 *       the snapshot multiplier is unbindable by design: nothing here infers it from damage numbers
 *   dot.primal_wrath.remains
 *       the target's DoT state is not reconstructed by this slice
 *   dot.rip.remains
 *       the target's DoT state is not reconstructed by this slice
 *   buff.tigers_fury.duration
 *       no aura is pinned by this slice
 *   action.convoke_the_spirits.execute_time
 *       hasted, and haste at a decision is not reconstructed
 *   cooldown.bs_inc.duration
 *       no cooldown is derived
 *   cooldown.bs_inc.charges_fractional
 *       no cooldown is derived
 *   cooldown.convoke_the_spirits.duration
 *       no cooldown is derived
 *   cooldown.convoke_the_spirits.charges_fractional
 *       no cooldown is derived
 *   cooldown.potion.duration
 *       no cooldown is derived
 *   cooldown.potion.charges_fractional
 *       no cooldown is derived
 *   raid_event.adds.remains
 *       the simulation's raid events are not reconstructed
 *   trinket.1.cooldown.remains
 *       an item is outside the rotational domain, and its cooldown is not read
 *   trinket.2.cooldown.remains
 *       an item is outside the rotational domain, and its cooldown is not read
 *   dot.rake.refreshable
 *       the target's DoT state is not reconstructed by this slice
 *   dot.primal_wrath.refreshable
 *       the target's DoT state is not reconstructed by this slice
 *   buff.bs_inc.down
 *       bound from the decision's aura state where it is established; the shared parser has no `.down` form
 *   fight_style.dungeonroute
 *       the simulation's fight style has no difficulty authority here. SIMC-FB-A may bind it as a disclosed profile fact, and this list does not read that yet
 *   fight_style.dungeonslice
 *       the simulation's fight style has no difficulty authority here. SIMC-FB-A may bind it as a disclosed profile fact, and this list does not read that yet
 *   raid_event.adds.up
 *       the simulation's raid events are not reconstructed
 *   prev_gcd.1.rip
 *       the previous foreground action is not reconstructed: a selection that casts nothing is in no log
 *   prev_gcd.1.ferocious_bite
 *       the previous foreground action is not reconstructed: a selection that casts nothing is in no log
 *   prev_gcd.1.primal_wrath
 *       the previous foreground action is not reconstructed: a selection that casts nothing is in no log
 *
 * BOUND, from the observed tree or the decision cast's own observation:
 *
 *   hero_tree.druid_of_the_claw: a constant for the actor's active hero sub-tree (player.cpp:12205-12216)
 *   hero_tree.wildstalker: a constant for the actor's active hero sub-tree (player.cpp:12205-12216)
 *   energy: the decision cast's own PRE_COST observation
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
import { FERAL_DRUID_SPEC_ID } from "./spec.js";

export const HERO_TREE_DRUID_OF_THE_CLAW = "hero_tree.druid_of_the_claw";
export const HERO_TREE_WILDSTALKER = "hero_tree.wildstalker";
export const DOT_RAKE_REFRESHABLE = "dot.rake.refreshable";
export const DOT_PRIMAL_WRATH_REFRESHABLE = "dot.primal_wrath.refreshable";
export const BUFF_BS_INC_DOWN = "buff.bs_inc.down";
export const FIGHT_STYLE_DUNGEONROUTE = "fight_style.dungeonroute";
export const FIGHT_STYLE_DUNGEONSLICE = "fight_style.dungeonslice";
export const RAID_EVENT_ADDS_UP = "raid_event.adds.up";
export const PREV_GCD_RIP = "prev_gcd.1.rip";
export const PREV_GCD_FEROCIOUS_BITE = "prev_gcd.1.ferocious_bite";
export const PREV_GCD_PRIMAL_WRATH = "prev_gcd.1.primal_wrath";
export const ENERGY = "energy";
export const SPELL_TARGETS = "spell_targets";
export const SPELL_TARGETS_PRIMAL_WRATH = "spell_targets.primal_wrath";
export const SPELL_TARGETS_SWIPE_CAT = "spell_targets.swipe_cat";
export const ACTIVE_DOT_RAKE = "active_dot.rake";
export const PERSISTENT_MULTIPLIER = "persistent_multiplier";
export const ACTION_RAKE_PMULTIPLIER = "action.rake.pmultiplier";
export const DOT_PRIMAL_WRATH_REMAINS = "dot.primal_wrath.remains";
export const DOT_RIP_REMAINS = "dot.rip.remains";
export const BUFF_TIGERS_FURY_DURATION = "buff.tigers_fury.duration";
export const ACTION_CONVOKE_EXECUTE_TIME = "action.convoke_the_spirits.execute_time";
export const COOLDOWN_BS_INC_DURATION = "cooldown.bs_inc.duration";
export const COOLDOWN_BS_INC_CHARGES_FRACTIONAL = "cooldown.bs_inc.charges_fractional";
export const COOLDOWN_CONVOKE_DURATION = "cooldown.convoke_the_spirits.duration";
export const COOLDOWN_CONVOKE_CHARGES_FRACTIONAL = "cooldown.convoke_the_spirits.charges_fractional";
export const COOLDOWN_POTION_DURATION = "cooldown.potion.duration";
export const COOLDOWN_POTION_CHARGES_FRACTIONAL = "cooldown.potion.charges_fractional";
export const RAID_EVENT_ADDS_REMAINS = "raid_event.adds.remains";
export const TRINKET_1_COOLDOWN_REMAINS = "trinket.1.cooldown.remains";
export const TRINKET_2_COOLDOWN_REMAINS = "trinket.2.cooldown.remains";

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
export const FERAL_DRUID_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  SPELL_TARGETS,
  SPELL_TARGETS_PRIMAL_WRATH,
  SPELL_TARGETS_SWIPE_CAT,
  ACTIVE_DOT_RAKE,
  PERSISTENT_MULTIPLIER,
  ACTION_RAKE_PMULTIPLIER,
  DOT_PRIMAL_WRATH_REMAINS,
  DOT_RIP_REMAINS,
  BUFF_TIGERS_FURY_DURATION,
  ACTION_CONVOKE_EXECUTE_TIME,
  COOLDOWN_BS_INC_DURATION,
  COOLDOWN_BS_INC_CHARGES_FRACTIONAL,
  COOLDOWN_CONVOKE_DURATION,
  COOLDOWN_CONVOKE_CHARGES_FRACTIONAL,
  COOLDOWN_POTION_DURATION,
  COOLDOWN_POTION_CHARGES_FRACTIONAL,
  RAID_EVENT_ADDS_REMAINS,
  TRINKET_1_COOLDOWN_REMAINS,
  TRINKET_2_COOLDOWN_REMAINS,
] as const);

export const FERAL_DRUID_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  truthAtom(HERO_TREE_DRUID_OF_THE_CLAW),
  truthAtom(HERO_TREE_WILDSTALKER),
  truthAtom(DOT_RAKE_REFRESHABLE),
  truthAtom(DOT_PRIMAL_WRATH_REFRESHABLE),
  truthAtom(BUFF_BS_INC_DOWN),
  truthAtom(FIGHT_STYLE_DUNGEONROUTE),
  truthAtom(FIGHT_STYLE_DUNGEONSLICE),
  truthAtom(RAID_EVENT_ADDS_UP),
  truthAtom(PREV_GCD_RIP),
  truthAtom(PREV_GCD_FEROCIOUS_BITE),
  truthAtom(PREV_GCD_PRIMAL_WRATH),
  magnitudeAtom(ENERGY),
  ...FERAL_DRUID_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const FERAL_DRUID_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  FERAL_DRUID_SPEC_ID,
  FERAL_DRUID_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
