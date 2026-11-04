/**
 * The identifiers the pinned Havoc Demon Hunter APL uses that the shared parser
 * does not know (ONB-A1).
 *
 * WHAT DECLARING AN IDENTIFIER MEANS. It makes a condition containing it PARSE
 * WHOLE instead of refusing at that fragment. It does not make it decidable:
 * `resolver.ts` binds a value only where evidence and pinned facts support one,
 * and the shared evaluator enumerates an unbound truth and refuses an unbound
 * magnitude.
 *
 * BUILD-STATIC TRUTHS, bound from the observed talent tree, never from a cast:
 *
 *   hero_tree.felscarred, hero_tree.aldrachi_reaver
 *       player.cpp:12205-12216, a constant for the actor's active hero sub-tree.
 *   action.<x>.demonsurge_available (death_sweep, annihilation, immolation_aura)
 *       sc_demon_hunter.cpp:2676-2686, :4868-4880. The CONSTANT 0 unless
 *       `talent.scarred.demonsurge` is taken; with it, the runtime state of a quiet
 *       buff the log never shows. Bound FALSE on a proven non-Fel-Scarred build
 *       and otherwise left to be enumerated.
 *
 * OBSERVED TRUTHS, bound per decision by `aura-bindings.ts` and `cooldown-bindings.ts`:
 *
 *   buff.rending_strike.down, buff.glaive_flurry.down
 *       The negation of the `buff.<name>.up` builtin (`buff_t::down`). Same M4
 *       presence reading.
 *   cooldown.metamorphosis.up, cooldown.blade_dance.up, cooldown.eye_beam.up
 *       Bound FALSE only under a proven lower bound. Never bound TRUE.
 *
 * MAGNITUDES:
 *
 *   fury
 *       The decision cast's own PRE_COST Fury. Exact there, unknown otherwise.
 *   gcd.max, gcd.remains
 *       Hasted, and the pinned client's haste at a decision is not reconstructed.
 *   active_enemies, spell_targets, active_dot.burning_wound
 *       The enemy set has no authority (TARGET_COUNT, ONB-S3).
 *   debuff.reavers_mark.stack
 *       M4 reconstructs no stack count.
 *   charges, full_recharge_time (self-addressing)
 *       Immolation Aura's charges, which A Fire Inside changes. Not modelled.
 *
 * WHAT IS NOT HERE. `buff.<name>.up`, `debuff.<name>.up`, `cooldown.<name>.remains`
 * and `talent.<name>` are built-ins and parse without this vocabulary.
 */

import { isBuiltinIdentifier } from "../../../simc/expression/parse.js";
import {
  defineSpecAtomVocabulary,
  type SpecAtomDeclaration,
  type SpecAtomVocabulary,
} from "../../../simc/expression/spec-vocabulary.js";
import { HAVOC_DEMON_HUNTER_SPEC_ID } from "./spec.js";

export const HERO_TREE_FELSCARRED = "hero_tree.felscarred";
export const HERO_TREE_ALDRACHI_REAVER = "hero_tree.aldrachi_reaver";
export const DEATH_SWEEP_DEMONSURGE = "action.death_sweep.demonsurge_available";
export const ANNIHILATION_DEMONSURGE = "action.annihilation.demonsurge_available";
export const IMMOLATION_AURA_DEMONSURGE = "action.immolation_aura.demonsurge_available";
export const RENDING_STRIKE_DOWN = "buff.rending_strike.down";
export const GLAIVE_FLURRY_DOWN = "buff.glaive_flurry.down";
export const METAMORPHOSIS_UP = "cooldown.metamorphosis.up";
export const BLADE_DANCE_UP = "cooldown.blade_dance.up";
export const EYE_BEAM_UP = "cooldown.eye_beam.up";
export const FURY = "fury";
export const GCD_MAX = "gcd.max";
export const GCD_REMAINS = "gcd.remains";
export const ACTIVE_ENEMIES = "active_enemies";
export const SPELL_TARGETS = "spell_targets";
export const ACTIVE_DOT_BURNING_WOUND = "active_dot.burning_wound";
export const REAVERS_MARK_STACK = "debuff.reavers_mark.stack";
export const CHARGES = "charges";
export const FULL_RECHARGE_TIME = "full_recharge_time";

const truthAtom = (identifier: string): SpecAtomDeclaration => ({
  identifier,
  shape: "BOOLEAN",
  scope: "PLAYER_SCOPED",
  selfAddressing: false,
});

const magnitudeAtom = (identifier: string, selfAddressing = false): SpecAtomDeclaration => ({
  identifier,
  shape: "NUMERIC",
  scope: "PLAYER_SCOPED",
  selfAddressing,
});

/** Declared so their conditions parse; never given a value by this slice. */
export const HAVOC_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  GCD_MAX,
  GCD_REMAINS,
  ACTIVE_ENEMIES,
  SPELL_TARGETS,
  ACTIVE_DOT_BURNING_WOUND,
  REAVERS_MARK_STACK,
] as const);

export const HAVOC_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  truthAtom(HERO_TREE_FELSCARRED),
  truthAtom(HERO_TREE_ALDRACHI_REAVER),
  truthAtom(DEATH_SWEEP_DEMONSURGE),
  truthAtom(ANNIHILATION_DEMONSURGE),
  truthAtom(IMMOLATION_AURA_DEMONSURGE),
  truthAtom(RENDING_STRIKE_DOWN),
  truthAtom(GLAIVE_FLURRY_DOWN),
  truthAtom(METAMORPHOSIS_UP),
  truthAtom(BLADE_DANCE_UP),
  truthAtom(EYE_BEAM_UP),
  magnitudeAtom(FURY),
  ...HAVOC_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
  magnitudeAtom(CHARGES, true),
  magnitudeAtom(FULL_RECHARGE_TIME, true),
]);

/** The frozen vocabulary the Havoc resolver and traversal parse with. */
export const HAVOC_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  HAVOC_DEMON_HUNTER_SPEC_ID,
  HAVOC_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
