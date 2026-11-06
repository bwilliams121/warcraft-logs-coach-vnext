/**
 * The identifiers the pinned Elemental Shaman APL uses that the shared parser does not know (ONB-D2).
 *
 * WHAT DECLARING AN IDENTIFIER MEANS. It makes a condition containing it PARSE WHOLE instead of
 * refusing at that fragment. It does not make it decidable: `resolver.ts` binds a value only
 * where evidence and pinned facts support one, and the shared evaluator enumerates an unbound
 * truth and refuses an unbound magnitude.
 *
 * NEVER GIVEN A VALUE BY THIS SLICE, and why:
 *
 *   spell_targets.chain_lightning, active_enemies, active_dot.flame_shock, lightning_rod
 *       active_enemies: the resolver leaves it to the analysis, which binds the shared enemy count per decision (ONB-S3); spell_targets: action-owned, unregistered
 *   maelstrom, maelstrom.deficit
 *       the wire carries Maelstrom (type 11) only on a costed cast, at its completion, and a cast-time spell generates it. A completion's
 *       reading is not its decision's, and no shared wire contract has a row for it, so nothing here reads it
 *   cooldown.*, buff.*.down, dot.*, gcd
 *       no cooldown, aura or GCD is derived
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
import { ELEMENTAL_SHAMAN_SPEC_ID } from "./spec.js";

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
export const ELEMENTAL_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  "active_dot.flame_shock",
  "active_enemies",
  "cooldown.lava_burst.charges_fractional",
  "debuff.lightning_rod.remains",
  "dot.flame_shock.remains",
  "gcd",
  "lightning_rod",
  "maelstrom",
  "maelstrom.deficit",
  "movement.distance",
  "spell_targets.chain_lightning",
] as const);

/** Declared so their conditions parse; never given a value by this slice. */
export const ELEMENTAL_UNBOUND_TRUTH_ATOMS = Object.freeze([
  "buff.lightning_shield.down",
  "dot.flame_shock.refreshable",
] as const);

export const ELEMENTAL_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  ...ELEMENTAL_UNBOUND_TRUTH_ATOMS.map((identifier) => truthAtom(identifier)),
  ...ELEMENTAL_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const ELEMENTAL_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  ELEMENTAL_SHAMAN_SPEC_ID,
  ELEMENTAL_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
