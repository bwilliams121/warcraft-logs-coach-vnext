/**
 * The identifiers the pinned Frost Death Knight APL uses that the shared parser does not know (ONB-B2).
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
 *   raid_event.adds.in
 *       SIM_ONLY: a simulated raid event
 *   raid_event.adds.exists
 *       SIM_ONLY: a simulated raid event
 *   raid_event.adds.remains
 *       SIM_ONLY: a simulated raid event
 *   raid_event.adds.duration
 *       SIM_ONLY: a simulated raid event
 *   raid_event.adds.up
 *       SIM_ONLY: a simulated raid event
 *   raid_event.pull.exists
 *       SIM_ONLY: a simulated raid event
 *   gcd
 *       hasted, and haste at a decision is not reconstructed
 *   death_knight.first_ams_cast
 *       a SimulationCraft option, not observable state
 *   talent.bonegrinder.rank
 *       the node's rank is not bound by this slice
 *   gcd.max
 *       hasted, and haste at a decision is not reconstructed
 *   debuff.razorice.react
 *       the target's debuff stack is not read by this slice
 *   cooldown.frostwyrms_fury.duration
 *       no cooldown is derived
 *   cooldown.empower_rune_weapon.full_recharge_time
 *       no cooldown is derived
 *   target.debuff.casting.react
 *       the target's casts are not read
 *   main_hand.2h
 *       the weapon's type is not read by this slice
 *
 * BOUND, from the observed tree or the decision cast's own observation:
 *
 *   hero_tree.deathbringer: a constant for the actor's active hero sub-tree (player.cpp:12205-12216)
 *   hero_tree.rider_of_the_apocalypse: a constant for the actor's active hero sub-tree (player.cpp:12205-12216)
 *   rune: the decision cast's own PRE_COST observation
 *   runic_power: the decision cast's own PRE_COST observation
 *   runic_power.deficit: the decision cast's own PRE_COST observation
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
import { FROST_DEATH_KNIGHT_SPEC_ID } from "./spec.js";

export const HERO_TREE_DEATHBRINGER = "hero_tree.deathbringer";
export const HERO_TREE_RIDER = "hero_tree.rider_of_the_apocalypse";
export const TARGET_CASTING_REACT = "target.debuff.casting.react";
export const MAIN_HAND_2H = "main_hand.2h";
export const RUNE = "rune";
export const RUNIC_POWER = "runic_power";
export const RUNIC_POWER_DEFICIT = "runic_power.deficit";
export const ACTIVE_ENEMIES = "active_enemies";
export const TIME = "time";
export const RAID_EVENT_ADDS_IN = "raid_event.adds.in";
export const RAID_EVENT_ADDS_EXISTS = "raid_event.adds.exists";
export const RAID_EVENT_ADDS_REMAINS = "raid_event.adds.remains";
export const RAID_EVENT_ADDS_DURATION = "raid_event.adds.duration";
export const RAID_EVENT_ADDS_UP = "raid_event.adds.up";
export const RAID_EVENT_PULL_EXISTS = "raid_event.pull.exists";
export const GCD = "gcd";
export const FIRST_AMS_CAST = "death_knight.first_ams_cast";
export const TALENT_BONEGRINDER_RANK = "talent.bonegrinder.rank";
export const GCD_MAX = "gcd.max";
export const RAZORICE_REACT = "debuff.razorice.react";
export const FROSTWYRMS_FURY_DURATION = "cooldown.frostwyrms_fury.duration";
export const ERW_FULL_RECHARGE = "cooldown.empower_rune_weapon.full_recharge_time";

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
export const FROST_DEATH_KNIGHT_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  ACTIVE_ENEMIES,
  TIME,
  RAID_EVENT_ADDS_IN,
  RAID_EVENT_ADDS_EXISTS,
  RAID_EVENT_ADDS_REMAINS,
  RAID_EVENT_ADDS_DURATION,
  RAID_EVENT_ADDS_UP,
  RAID_EVENT_PULL_EXISTS,
  GCD,
  FIRST_AMS_CAST,
  TALENT_BONEGRINDER_RANK,
  GCD_MAX,
  RAZORICE_REACT,
  FROSTWYRMS_FURY_DURATION,
  ERW_FULL_RECHARGE,
] as const);

export const FROST_DEATH_KNIGHT_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  truthAtom(HERO_TREE_DEATHBRINGER),
  truthAtom(HERO_TREE_RIDER),
  truthAtom(TARGET_CASTING_REACT),
  truthAtom(MAIN_HAND_2H),
  magnitudeAtom(RUNE),
  magnitudeAtom(RUNIC_POWER),
  magnitudeAtom(RUNIC_POWER_DEFICIT),
  ...FROST_DEATH_KNIGHT_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const FROST_DEATH_KNIGHT_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  FROST_DEATH_KNIGHT_SPEC_ID,
  FROST_DEATH_KNIGHT_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
