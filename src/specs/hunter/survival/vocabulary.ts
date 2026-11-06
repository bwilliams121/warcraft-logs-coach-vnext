/**
 * The identifiers the pinned Survival Hunter APL uses that the shared parser does not know (ONB-T2).
 *
 * WHAT DECLARING AN IDENTIFIER MEANS. It makes a condition containing it PARSE WHOLE instead of
 * refusing at that fragment. It does not make it decidable: `resolver.ts` binds a value only
 * where evidence and pinned facts support one, and the shared evaluator enumerates an unbound
 * truth and refuses an unbound magnitude.
 *
 * NEVER GIVEN A VALUE BY THIS SLICE, and why:
 *
 *   active_enemies
 *       bound by the shared enemy-set model as far as its evidence proves (ONB-S3); declared so its gates parse
 *   fight_style.dungeonroute
 *       a simulation setting, with no authority for a real fight. It gates the list's `retarget` line, so it stops every scan
 *   howl_summon.ready, target.distance
 *       the Pack Leader's own buffs and a position, neither read
 *   full_recharge_time, cooldown.*, debuff.*.remains, gcd
 *       no charge, cooldown, aura or clock is derived. The list reads no Focus
 *
 * BOUND:
 *
 *   nothing: the list reads no hero_tree atom, and every `talent.<name>` is built in
 *
 * WHAT IS NOT HERE. `buff.<name>.up`, `buff.<name>.stack`, `buff.<name>.remains`, `buff.<name>.react`, `debuff.<name>.up`,
 * `dot.<name>.ticking`, `cooldown.<name>.remains`, `fight_remains`, `target.time_to_die`, `remains`, `refreshable` and
 * `talent.<name>` are built-ins and parse without this vocabulary. `trinket.*` is undeclared on purpose: it appears only in
 * the non-domain item lines, so such a line refuses if anything ever reads it.
 */

import { isBuiltinIdentifier } from "../../../simc/expression/parse.js";
import {
  defineSpecAtomVocabulary,
  type SpecAtomDeclaration,
  type SpecAtomVocabulary,
} from "../../../simc/expression/spec-vocabulary.js";
import { SURVIVAL_HUNTER_SPEC_ID } from "./spec.js";

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
export const SURVIVAL_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  "active_enemies",
  "debuff.sentinels_mark.remains",
  "full_recharge_time",
  "gcd",
  "target.distance",
  "target.health",
] as const);

/** Declared so their conditions parse; never given a value by this slice. */
export const SURVIVAL_UNBOUND_TRUTH_ATOMS = Object.freeze([
  "fight_style.dungeonroute",
  "howl_summon.ready",
] as const);

export const SURVIVAL_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  ...SURVIVAL_UNBOUND_TRUTH_ATOMS.map((identifier) => truthAtom(identifier)),
  ...SURVIVAL_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const SURVIVAL_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  SURVIVAL_HUNTER_SPEC_ID,
  SURVIVAL_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
