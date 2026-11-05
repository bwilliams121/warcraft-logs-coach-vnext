/**
 * The identifiers the pinned Unholy Death Knight APL uses that the shared parser does not know (ONB-X5).
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
 *   buff.essence_of_the_blood_queen.max_stack
 *       no aura is read by this slice
 *   charges
 *       the action's own charges: no cooldown is derived
 *   cooldown.any_dnd.duration
 *       no cooldown is derived
 *   cooldown.putrefy.charges
 *       no cooldown is derived
 *   cooldown.putrefy.max_charges
 *       no cooldown is derived
 *   debuff.soul_reaper_debuff.remains
 *       the target's debuffs are not read by this slice
 *   dot.dread_plague.active_dots
 *       the target's debuffs are not read by this slice
 *   dot.virulent_plague.active_dots
 *       the target's debuffs are not read by this slice
 *   duration
 *       the action's own duration, reached only through a division the shared parser does not read
 *   gcd
 *       hasted, and haste at a decision is not reconstructed
 *   gcd.max
 *       hasted, and haste at a decision is not reconstructed
 *   health.pct
 *       the target's health is not read by this slice
 *   max_charges
 *       the action's own charges: no cooldown is derived
 *   pet.lord_of_the_dead.remains
 *       no pet's remaining life is derived: its lifetime has no proven bound
 *   raid_event.adds.count
 *       SIM_ONLY: a simulated raid event
 *   raid_event.adds.exists
 *       SIM_ONLY: a simulated raid event
 *   raid_event.adds.in
 *       SIM_ONLY: a simulated raid event
 *   raid_event.adds.remains
 *       SIM_ONLY: a simulated raid event
 *   raid_event.pull.exists
 *       SIM_ONLY: a simulated raid event
 *   raid_event.pull.in
 *       SIM_ONLY: a simulated raid event
 *   raid_event.pull.remains
 *       SIM_ONLY: a simulated raid event
 *   target.health.pct
 *       the target's health is not read by this slice
 *   time
 *       the reaction to a pull is not modelled
 *
 * BOUND, from the decision cast's own observation:
 *
 *   rune: the decision cast's own PRE_COST observation
 *   runic_power: the decision cast's own PRE_COST observation
 *   runic_power.deficit: the decision cast's own PRE_COST observation
 *
 * BOUND, per decision, from the shared pet state (ONB-S6, `pet-profile.ts`), and only when the answer is decided:
 *
 *   pet.army_ghoul.active, pet.gargoyle.active, pet.lord_of_the_dead.active: a spawner's `active`, whether an instance is up. An unknown presence leaves the truth unbound, so it is enumerated, never false.
 *
 * WHAT IS NOT HERE. `buff.<name>.up`, `buff.<name>.stack`, `buff.<name>.remains`, `buff.<name>.react`, `debuff.<name>.up`,
 * `cooldown.<name>.remains`, `fight_remains` and `talent.<name>` are built-ins and parse without this vocabulary. `trinket.*`
 * is undeclared on purpose: it appears only in the non-domain item lines and in variables only they read, so such a line refuses if anything ever reads it.
 */

import { isBuiltinIdentifier } from "../../../simc/expression/parse.js";
import {
  defineSpecAtomVocabulary,
  type SpecAtomDeclaration,
  type SpecAtomVocabulary,
} from "../../../simc/expression/spec-vocabulary.js";
import { UNHOLY_DEATH_KNIGHT_SPEC_ID } from "./spec.js";

export const RUNE = "rune";
export const RUNIC_POWER = "runic_power";
export const RUNIC_POWER_DEFICIT = "runic_power.deficit";
export const PET_ARMY_GHOUL_ACTIVE = "pet.army_ghoul.active";
export const PET_GARGOYLE_ACTIVE = "pet.gargoyle.active";
export const PET_LORD_OF_THE_DEAD_ACTIVE = "pet.lord_of_the_dead.active";
export const ACTIVE_ENEMIES = "active_enemies";
export const BUFF_ESSENCE_OF_THE_BLOOD_QUEEN_MAX_STACK = "buff.essence_of_the_blood_queen.max_stack";
export const CHARGES = "charges";
export const COOLDOWN_ANY_DND_DURATION = "cooldown.any_dnd.duration";
export const COOLDOWN_PUTREFY_CHARGES = "cooldown.putrefy.charges";
export const COOLDOWN_PUTREFY_MAX_CHARGES = "cooldown.putrefy.max_charges";
export const DEBUFF_SOUL_REAPER_DEBUFF_REMAINS = "debuff.soul_reaper_debuff.remains";
export const DOT_DREAD_PLAGUE_ACTIVE_DOTS = "dot.dread_plague.active_dots";
export const DOT_VIRULENT_PLAGUE_ACTIVE_DOTS = "dot.virulent_plague.active_dots";
export const DURATION = "duration";
export const GCD = "gcd";
export const GCD_MAX = "gcd.max";
export const HEALTH_PCT = "health.pct";
export const MAX_CHARGES = "max_charges";
export const PET_LORD_OF_THE_DEAD_REMAINS = "pet.lord_of_the_dead.remains";
export const RAID_EVENT_ADDS_COUNT = "raid_event.adds.count";
export const RAID_EVENT_ADDS_EXISTS = "raid_event.adds.exists";
export const RAID_EVENT_ADDS_IN = "raid_event.adds.in";
export const RAID_EVENT_ADDS_REMAINS = "raid_event.adds.remains";
export const RAID_EVENT_PULL_EXISTS = "raid_event.pull.exists";
export const RAID_EVENT_PULL_IN = "raid_event.pull.in";
export const RAID_EVENT_PULL_REMAINS = "raid_event.pull.remains";
export const TARGET_HEALTH_PCT = "target.health.pct";
export const TIME = "time";

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
export const UNHOLY_DEATH_KNIGHT_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  ACTIVE_ENEMIES,
  BUFF_ESSENCE_OF_THE_BLOOD_QUEEN_MAX_STACK,
  CHARGES,
  COOLDOWN_ANY_DND_DURATION,
  COOLDOWN_PUTREFY_CHARGES,
  COOLDOWN_PUTREFY_MAX_CHARGES,
  DEBUFF_SOUL_REAPER_DEBUFF_REMAINS,
  DOT_DREAD_PLAGUE_ACTIVE_DOTS,
  DOT_VIRULENT_PLAGUE_ACTIVE_DOTS,
  DURATION,
  GCD,
  GCD_MAX,
  HEALTH_PCT,
  MAX_CHARGES,
  PET_LORD_OF_THE_DEAD_REMAINS,
  RAID_EVENT_ADDS_COUNT,
  RAID_EVENT_ADDS_EXISTS,
  RAID_EVENT_ADDS_IN,
  RAID_EVENT_ADDS_REMAINS,
  RAID_EVENT_PULL_EXISTS,
  RAID_EVENT_PULL_IN,
  RAID_EVENT_PULL_REMAINS,
  TARGET_HEALTH_PCT,
  TIME,
] as const);

export const UNHOLY_DEATH_KNIGHT_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  truthAtom(PET_ARMY_GHOUL_ACTIVE),
  truthAtom(PET_GARGOYLE_ACTIVE),
  truthAtom(PET_LORD_OF_THE_DEAD_ACTIVE),
  magnitudeAtom(RUNE),
  magnitudeAtom(RUNIC_POWER),
  magnitudeAtom(RUNIC_POWER_DEFICIT),
  ...UNHOLY_DEATH_KNIGHT_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const UNHOLY_DEATH_KNIGHT_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  UNHOLY_DEATH_KNIGHT_SPEC_ID,
  UNHOLY_DEATH_KNIGHT_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
