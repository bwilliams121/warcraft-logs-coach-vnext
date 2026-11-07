/**
 * The identifiers the pinned Fury Warrior APL uses that the shared parser does not know (ONB-A2).
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
 *   movement.distance
 *       the log has no player movement stream
 *   raid_event.movement.distance
 *       SIM_ONLY: a simulated raid event
 *   raid_event.movement.in
 *       SIM_ONLY: a simulated raid event
 *   raid_event.adds.in
 *       SIM_ONLY: a simulated raid event
 *   raid_event.adds.exists
 *       SIM_ONLY: a simulated raid event
 *   raid_event.adds.remains
 *       SIM_ONLY: a simulated raid event
 *   target.health.pct
 *       the target's health is not modelled
 *   gcd
 *       hasted, and haste at a decision is not reconstructed
 *   target.debuff.casting.react
 *       the target's casts are not read
 *   cooldown.bladestorm.ready
 *       no cooldown is derived
 *   cooldown.execute.ready
 *       no cooldown is derived
 *   buff.recklessness.down
 *       no aura identity is pinned
 *   buff.sudden_death.down
 *       no aura identity is pinned
 *
 * BOUND, from the observed tree or the decision cast's own observation:
 *
 *   talent.massacre.enabled: the three-way talent rule
 *   rage: the decision cast's own PRE_COST observation
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
import { FURY_WARRIOR_SPEC_ID } from "./spec.js";

export const MASSACRE_ENABLED = "talent.massacre.enabled";
export const TARGET_CASTING_REACT = "target.debuff.casting.react";
export const BLADESTORM_READY = "cooldown.bladestorm.ready";
export const EXECUTE_READY = "cooldown.execute.ready";
export const RECKLESSNESS_DOWN = "buff.recklessness.down";
export const SUDDEN_DEATH_DOWN = "buff.sudden_death.down";
export const RAGE = "rage";
export const ACTIVE_ENEMIES = "active_enemies";
export const TIME = "time";
export const MOVEMENT_DISTANCE = "movement.distance";
export const RAID_EVENT_MOVEMENT_DISTANCE = "raid_event.movement.distance";
export const RAID_EVENT_MOVEMENT_IN = "raid_event.movement.in";
export const RAID_EVENT_ADDS_IN = "raid_event.adds.in";
export const RAID_EVENT_ADDS_EXISTS = "raid_event.adds.exists";
export const RAID_EVENT_ADDS_REMAINS = "raid_event.adds.remains";
export const TARGET_HEALTH_PCT = "target.health.pct";
export const GCD = "gcd";

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
export const FURY_WARRIOR_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  ACTIVE_ENEMIES,
  TIME,
  MOVEMENT_DISTANCE,
  RAID_EVENT_MOVEMENT_DISTANCE,
  RAID_EVENT_MOVEMENT_IN,
  RAID_EVENT_ADDS_IN,
  RAID_EVENT_ADDS_EXISTS,
  RAID_EVENT_ADDS_REMAINS,
  TARGET_HEALTH_PCT,
  GCD,
] as const);

export const FURY_WARRIOR_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  truthAtom(MASSACRE_ENABLED),
  truthAtom(TARGET_CASTING_REACT),
  truthAtom(BLADESTORM_READY),
  truthAtom(EXECUTE_READY),
  truthAtom(RECKLESSNESS_DOWN),
  truthAtom(SUDDEN_DEATH_DOWN),
  magnitudeAtom(RAGE),
  ...FURY_WARRIOR_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const FURY_WARRIOR_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  FURY_WARRIOR_SPEC_ID,
  FURY_WARRIOR_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
