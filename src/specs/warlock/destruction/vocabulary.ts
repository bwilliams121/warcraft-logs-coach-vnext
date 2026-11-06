/**
 * The identifiers the pinned Destruction Warlock APL uses that the shared parser does not know (ONB-D1).
 *
 * WHAT DECLARING AN IDENTIFIER MEANS. It makes a condition containing it PARSE WHOLE instead of
 * refusing at that fragment. It does not make it decidable: `resolver.ts` binds a value only
 * where evidence and pinned facts support one, and the shared evaluator enumerates an unbound
 * truth and refuses an unbound magnitude.
 *
 * NEVER GIVEN A VALUE BY THIS SLICE, and why:
 *
 *   active_enemies, active_dot.wither, active_dot.immolate, dot_refreshable_count.*
 *       no action or enemy-set binding establishes it (ONB-S3)
 *   soul_shard
 *       the wire carries it only on a costed cast, and at a cast-time action's COMPLETION, which is not
 *       its decision: Immolate, Wither and Incinerate generate fractions while a Chaos Bolt is cast.
 *       The shared wire contract has no Soul Shard row either, so nothing here could read it
 *   action.<name>.execute_time, action.<name>.cast_time
 *       haste at the decision is not established
 *   action.conflagrate.charges, cooldown.*
 *       no cooldown is derived
 *   action.chaos_bolt.in_flight, action.chaos_bolt.usable
 *       no travel or usability model
 *   demonic_art, buff.*, dot.*
 *       no aura identity is pinned
 *   pet.infernal.active
 *       no pet state is bound
 *   target.health.pct
 *       the target's health is not modelled
 *   raid_event.adds.in, time
 *       a simulation option and a clock no decision reads
 *
 * BOUND, from the observed tree:
 *
 *   talent.cataclysm.enabled: the three-way rule, unbound while UNKNOWN
 *
 * WHAT IS NOT HERE. `buff.<name>.up`, `buff.<name>.stack`, `buff.<name>.remains`, `cooldown.<name>.remains`,
 * `fight_remains`, `target.time_to_die`, `refreshable` and `talent.<name>` are built-ins and parse without
 * this vocabulary. `trinket.*` is undeclared on purpose: it appears only in the non-domain item lists and in
 * variables only they read, so such a line refuses if anything ever reads it.
 */

import { isBuiltinIdentifier } from "../../../simc/expression/parse.js";
import {
  defineSpecAtomVocabulary,
  type SpecAtomDeclaration,
  type SpecAtomVocabulary,
} from "../../../simc/expression/spec-vocabulary.js";
import { DESTRUCTION_WARLOCK_SPEC_ID } from "./spec.js";

export const TALENT_CATACLYSM_ENABLED = "talent.cataclysm.enabled";
export const SOUL_SHARD = "soul_shard";
export const ACTIVE_ENEMIES = "active_enemies";

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
export const DESTRUCTION_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  SOUL_SHARD,
  ACTIVE_ENEMIES,
  "active_dot.wither",
  "active_dot.immolate",
  "dot_refreshable_count.wither",
  "dot_refreshable_count.immolate",
  "action.chaos_bolt.execute_time",
  "action.soul_fire.cast_time",
  "action.cataclysm.cast_time",
  "action.conflagrate.charges",
  "cooldown.summon_infernal.duration",
  "cooldown.summon_infernal.remains_expected",
  "cooldown.invoke_power_infusion_0.duration",
  "cooldown.berserking.duration",
  "cooldown.blood_fury.duration",
  "cooldown.fireblood.duration",
  "dot.wither.remains",
  "dot.wither.duration",
  "dot.immolate.remains",
  "dot.immolate.duration",
  "target.health.pct",
  "raid_event.adds.in",
  "debuff.havoc.remains",
  "time",
] as const);

/** Declared so their conditions parse; never given a value by this slice. */
export const DESTRUCTION_UNBOUND_TRUTH_ATOMS = Object.freeze([
  "demonic_art",
  "pet.infernal.active",
  "action.chaos_bolt.in_flight",
  "action.chaos_bolt.usable",
  "dot.wither.refreshable",
  "dot.immolate.refreshable",
  "cooldown.summon_infernal.up",
] as const);

export const DESTRUCTION_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  truthAtom(TALENT_CATACLYSM_ENABLED),
  ...DESTRUCTION_UNBOUND_TRUTH_ATOMS.map((identifier) => truthAtom(identifier)),
  ...DESTRUCTION_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const DESTRUCTION_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  DESTRUCTION_WARLOCK_SPEC_ID,
  DESTRUCTION_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
