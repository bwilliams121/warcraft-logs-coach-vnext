/**
 * The identifiers the pinned Outlaw Rogue APL uses that the shared parser does not know (ONB-C2).
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
 *   spell_targets.blade_flurry
 *       action-owned, and no action registers its target applicability (ONB-S3)
 *   cp_max_spend
 *       not reconstructed: it depends on talents and buffs this slice does not bind
 *   rtb_buffs
 *       the Roll the Bones buff's stage is an internal value no log event reports
 *   energy.base_deficit
 *       it excludes temporary Energy, which no observation separates
 *   energy.base_time_to_max
 *       no regeneration model exists
 *   energy.regen
 *       no regeneration model exists
 *   gcd
 *       hasted, and haste at a decision is not reconstructed
 *   buff.opportunity.max_stack
 *       no aura identity is pinned
 *   talent.fan_the_hammer.rank
 *       the three-way rule reads selection, not rank
 *   raid_event.adds.in
 *       the simulation's raid events are not reconstructed
 *   raid_event.adds.remains
 *       the simulation's raid events are not reconstructed
 *   set_bonus.mid1_2pc
 *       gear sets are not read
 *   cooldown.between_the_eyes.ready
 *       no cooldown is derived
 *   cooldown.killing_spree.ready
 *       no cooldown is derived
 *
 * BOUND, from the observed tree or the decision cast's own observation:
 *
 *   energy: the decision cast's own PRE_COST observation
 *   hero_tree.fatebound: entry membership in the observed tree
 *   talent.quick_draw.enabled, talent.audacity.enabled: the three-way rule, unbound while UNKNOWN
 *
 * WHAT IS NOT HERE. `buff.<name>.up`, `debuff.<name>.up`, `cooldown.<name>.remains`,
 * `fight_remains` and `talent.<name>` are built-ins and parse without this vocabulary. `trinket.*`
 * is undeclared on purpose: it appears only in the non-domain item lines, so such a line refuses if
 * anything ever reads it.
 */

import { isBuiltinIdentifier } from "../../../simc/expression/parse.js";
import {
  defineSpecAtomVocabulary,
  type SpecAtomDeclaration,
  type SpecAtomVocabulary,
} from "../../../simc/expression/spec-vocabulary.js";
import { OUTLAW_ROGUE_SPEC_ID } from "./spec.js";

export const ENERGY = "energy";
export const HERO_TREE_FATEBOUND = "hero_tree.fatebound";
export const TALENT_QUICK_DRAW_ENABLED = "talent.quick_draw.enabled";
export const TALENT_AUDACITY_ENABLED = "talent.audacity.enabled";
export const SPELL_TARGETS = "spell_targets";
export const SPELL_TARGETS_BLADE_FLURRY = "spell_targets.blade_flurry";
export const CP_MAX_SPEND = "cp_max_spend";
export const RTB_BUFFS = "rtb_buffs";
export const ENERGY_BASE_DEFICIT = "energy.base_deficit";
export const ENERGY_BASE_TIME_TO_MAX = "energy.base_time_to_max";
export const ENERGY_REGEN = "energy.regen";
export const GCD = "gcd";
export const BUFF_OPPORTUNITY_MAX_STACK = "buff.opportunity.max_stack";
export const TALENT_FAN_THE_HAMMER_RANK = "talent.fan_the_hammer.rank";
export const RAID_EVENT_ADDS_IN = "raid_event.adds.in";
export const RAID_EVENT_ADDS_REMAINS = "raid_event.adds.remains";
export const SET_BONUS_MID1_2PC = "set_bonus.mid1_2pc";
export const BETWEEN_THE_EYES_READY = "cooldown.between_the_eyes.ready";
export const KILLING_SPREE_READY = "cooldown.killing_spree.ready";

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
export const OUTLAW_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  SPELL_TARGETS,
  SPELL_TARGETS_BLADE_FLURRY,
  CP_MAX_SPEND,
  RTB_BUFFS,
  ENERGY_BASE_DEFICIT,
  ENERGY_BASE_TIME_TO_MAX,
  ENERGY_REGEN,
  GCD,
  BUFF_OPPORTUNITY_MAX_STACK,
  TALENT_FAN_THE_HAMMER_RANK,
  RAID_EVENT_ADDS_IN,
  RAID_EVENT_ADDS_REMAINS,
  SET_BONUS_MID1_2PC,
] as const);

export const OUTLAW_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  truthAtom(HERO_TREE_FATEBOUND),
  truthAtom(TALENT_QUICK_DRAW_ENABLED),
  truthAtom(TALENT_AUDACITY_ENABLED),
  truthAtom(BETWEEN_THE_EYES_READY),
  truthAtom(KILLING_SPREE_READY),
  magnitudeAtom(ENERGY),
  ...OUTLAW_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const OUTLAW_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  OUTLAW_ROGUE_SPEC_ID,
  OUTLAW_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
