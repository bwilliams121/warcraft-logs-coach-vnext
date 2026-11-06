/**
 * The identifiers the pinned Frost Mage APL uses that the shared parser does not know (ONB-D3).
 *
 * WHAT DECLARING AN IDENTIFIER MEANS. It makes a condition containing it PARSE WHOLE instead of
 * refusing at that fragment. It does not make it decidable: `resolver.ts` binds a value only
 * where evidence and pinned facts support one, and the shared evaluator enumerates an unbound
 * truth and refuses an unbound magnitude.
 *
 * NEVER GIVEN A VALUE BY THIS SLICE, and why:
 *
 *   active_enemies
 *       the resolver leaves it to the analysis, which binds the shared enemy count per decision (ONB-S3)
 *   cooldown.*, cooldown_react, charges, buff.*.down, debuff.*.react, debuff.*.stack, buff.*.last_trigger, prev_gcd.*, time, set_bonus.*
 *       no cooldown, charge, aura, proc trigger, previous press, clock or tier set is derived
 *   movement.distance
 *       Warcraft Logs has no movement stream, and no line resolves past it
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
import { FROST_MAGE_SPEC_ID } from "./spec.js";

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
export const FROST_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  "active_enemies",
  "buff.rapid_refreezing.last_trigger",
  "charges",
  "cooldown.ray_of_frost.charges",
  "debuff.freezing.react",
  "debuff.freezing.stack",
  "movement.distance",
  "time",
] as const);

/** Declared so their conditions parse; never given a value by this slice. */
export const FROST_UNBOUND_TRUTH_ATOMS = Object.freeze([
  "buff.thermal_void.down",
  "cooldown_react",
  "prev_gcd.1.comet_storm",
  "prev_gcd.1.frozen_orb",
  "prev_gcd.1.glacial_spike",
  "prev_gcd.2.glacial_spike",
  "set_bonus.midnight_season_2_4pc",
] as const);

export const FROST_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  ...FROST_UNBOUND_TRUTH_ATOMS.map((identifier) => truthAtom(identifier)),
  ...FROST_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const FROST_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  FROST_MAGE_SPEC_ID,
  FROST_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
