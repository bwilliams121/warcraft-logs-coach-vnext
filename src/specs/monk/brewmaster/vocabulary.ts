/**
 * The identifiers the pinned Brewmaster Monk APL uses that the shared parser
 * does not know (M11-C2).
 *
 * WHAT DECLARING AN IDENTIFIER MEANS — AND DOES NOT
 *
 * Declaring `energy` here makes a condition that contains it PARSE WHOLE
 * instead of being refused at that fragment. It does not make it decidable:
 * `resolver.ts` binds a value only when the evidence and the pinned facts
 * support one, and an unbound magnitude is UNKNOWN_NUMBER exactly like
 * `buff.<name>.remains`. Parser support and state observability stay
 * separate. The measured census of the pinned region (M11-C1): without these
 * twelve declarations 21 of the 31 conditions refuse on an identifier and none
 * on an operator; with them all 31 parse.
 *
 * SIX BUILD-STATIC TRUTHS — bound by `resolver.ts` from the observed talent
 * tree, never from a cast:
 *
 *   hero_tree.master_of_harmony, hero_tree.shadopan
 *       player.cpp:12205-12216 — `hero_tree.<name>` is a CONSTANT 1 when the
 *       hero sub-tree of that name is active for the actor, else 0. RESOLVED
 *       to one tree binds that tree TRUE and the other FALSE (one hero tree is
 *       active at a time); UNKNOWN or CONTRADICTORY leaves both unbound.
 *   talent.blackout_combo.enabled, talent.salsalabims_strength.enabled
 *       player.cpp:12355-12362 — `talent.<name>.enabled` is the constant
 *       `_talent.enabled()`, a build fact. Bound TRUE/FALSE from the pinned three-way
 *       rule; UNKNOWN leaves it unbound. (The frozen builtin `talent.<name>`
 *       admits no dotted suffix, which is why these are declared here.)
 *   apex.1, apex.3
 *       player.cpp:12313-12331 — `apex.N` is the N-th NODE_TIERED specialization
 *       trait, reached or not. Bound from the pinned apex table by the shared
 *       positional-then-three-way rule.
 *
 * SIX MAGNITUDES — DECLARED AND DELIBERATELY UNBOUND in M11-C2:
 *
 *   cooldown.celestial_brew.charges_fractional,
 *   cooldown.keg_smash.charges_fractional
 *       charge state; no pinned cooldown record exists for either token. The
 *       brews live in the module's `brews` container. Keg Smash is a charge
 *       system (1 charge, 8,000 ms recharge in the DBC) that Stormstout's Last
 *       Keg raises to 2 charges, whose recharge the Brewmaster specialization
 *       passive (1258153, A_HASTED_CATEGORY on category 1490) hastes, and which
 *       two paths reset (Exploding Keg, sc_monk.cpp:3408; the Empty Barrel
 *       trigger under Bring Me Another tier 2, :4510-4516). None of that is
 *       modelled (M11-C3a audit).
 *   buff.aspect_of_harmony_accumulator.value, health.max
 *       Master of Harmony accumulator state and a health magnitude; read only
 *       by the Master of Harmony list.
 *   energy, energy.regen
 *       continuous Energy; no Energy state is reconstructed in this slice.
 *
 * Each of the six is left UNKNOWN_NUMBER by the resolver with
 * STATE_NOT_MODELLED, so a gate that reads one is undecided and a scan that
 * needs it stops there — which is the measurement.
 *
 * WHAT IS NOT HERE, deliberately. `buff.<name>.up/remains`,
 * `cooldown.<name>.remains`, `target.time_to_die` are built-ins and parse
 * without this vocabulary; a declaration cannot shadow them.
 */

import { isBuiltinIdentifier } from "../../../simc/expression/parse.js";
import {
  defineSpecAtomVocabulary,
  type SpecAtomDeclaration,
  type SpecAtomVocabulary,
} from "../../../simc/expression/spec-vocabulary.js";
import { BREWMASTER_MONK_SPEC_ID } from "./spec.js";

export const HERO_TREE_MASTER_OF_HARMONY = "hero_tree.master_of_harmony";
export const HERO_TREE_SHADOPAN = "hero_tree.shadopan";
export const TALENT_BLACKOUT_COMBO_ENABLED = "talent.blackout_combo.enabled";
export const TALENT_SALSALABIMS_STRENGTH_ENABLED = "talent.salsalabims_strength.enabled";
export const APEX_1 = "apex.1";
export const APEX_3 = "apex.3";
export const CELESTIAL_BREW_CHARGES_FRACTIONAL = "cooldown.celestial_brew.charges_fractional";
export const KEG_SMASH_CHARGES_FRACTIONAL = "cooldown.keg_smash.charges_fractional";
export const ASPECT_OF_HARMONY_ACCUMULATOR_VALUE = "buff.aspect_of_harmony_accumulator.value";
export const HEALTH_MAX = "health.max";
export const ENERGY = "energy";
export const ENERGY_REGEN = "energy.regen";

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

/** The six build-static truths the resolver binds from the observed talent tree. */
export const BREWMASTER_BUILD_STATIC_ATOMS = Object.freeze([
  HERO_TREE_MASTER_OF_HARMONY,
  HERO_TREE_SHADOPAN,
  TALENT_BLACKOUT_COMBO_ENABLED,
  TALENT_SALSALABIMS_STRENGTH_ENABLED,
  APEX_1,
  APEX_3,
] as const);

/** The six magnitudes declared so their conditions parse, and left unbound in M11-C2. */
export const BREWMASTER_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  CELESTIAL_BREW_CHARGES_FRACTIONAL,
  KEG_SMASH_CHARGES_FRACTIONAL,
  ASPECT_OF_HARMONY_ACCUMULATOR_VALUE,
  HEALTH_MAX,
  ENERGY,
  ENERGY_REGEN,
] as const);

export const BREWMASTER_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  ...BREWMASTER_BUILD_STATIC_ATOMS.map(truthAtom),
  ...BREWMASTER_UNBOUND_NUMERIC_ATOMS.map(magnitudeAtom),
]);

/** The frozen vocabulary the Brewmaster resolver and traversal parse with. */
export const BREWMASTER_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  BREWMASTER_MONK_SPEC_ID,
  BREWMASTER_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
