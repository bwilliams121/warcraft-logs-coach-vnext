/**
 * The identifiers the pinned Arcane Mage APL uses that the shared parser does not know (ONB-D3).
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
 *   mana.pct
 *       the wire carries Mana on a cast, at its completion, and a cast-time spell spends it. A completion's reading is not its decision's, so
 *       nothing here reads it
 *   cooldown.*, buff.*.down, prev_gcd.*, gcd.max, set_bonus.*, action.*
 *       no cooldown, charge, aura, previous press, GCD or tier set is derived
 *
 * BOUND, from the observed tree:
 *
 *   nothing: the list reads no hero_tree atom, and every `talent.<name>` is built in
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
import { ARCANE_MAGE_SPEC_ID } from "./spec.js";

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
export const ARCANE_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  "active_enemies",
  "cooldown.arcane_orb.charges_fractional",
  "cooldown.arcane_pulse.charges_fractional",
  "gcd.max",
  "mana.pct",
] as const);

/** Declared so their conditions parse; never given a value by this slice. */
export const ARCANE_UNBOUND_TRUTH_ATOMS = Object.freeze([
  "action.evocation.channeling",
  "buff.arcane_soul.down",
  "buff.arcane_surge.down",
  "buff.lustrous_gleam.down",
  "cooldown.arcane_orb.ready",
  "cooldown.arcane_pulse.ready",
  "cooldown.touch_of_the_magi.ready",
  "debuff.touch_of_the_magi.down",
  "prev_gcd.1.arcane_barrage",
  "prev_gcd.1.arcane_surge",
  "prev_gcd.1.prismatic_bolt",
  "set_bonus.midnight_season_2_4pc",
] as const);

export const ARCANE_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  ...ARCANE_UNBOUND_TRUTH_ATOMS.map((identifier) => truthAtom(identifier)),
  ...ARCANE_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const ARCANE_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  ARCANE_MAGE_SPEC_ID,
  ARCANE_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
