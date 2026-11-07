/**
 * The identifiers the pinned Beast Mastery Hunter APL uses that the shared parser does not know (ONB-T2).
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
 *   focus
 *       a contract says what the wire's Focus is, and the retained casts carry it, but this slice reads none: one line reads it, behind the stops below, and Wailing Arrow is decided at its begin, not its completion. A later slice that binds it must declare it first
 *   fight_style.dungeonroute
 *       a simulation setting, with no authority for a real fight. SIMC-FB-A may bind it as a disclosed profile fact, and this list does not read that yet. It gates the list's `retarget` line, so it stops every scan
 *   apex.3, howl_summon.ready, max_prio_damage
 *       a tiered talent's rank, the Pack Leader's own buffs and a simulation's target priority, none of them read
 *   dot.*.remains, full_recharge_time, cooldown.*, buff.*.at_max_stacks, execute_time, gcd, time_to_die.remains
 *       no DoT window, charge, cooldown, aura, cast time or clock is derived, and `time_to_die` is predictive
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
import { BEAST_MASTERY_HUNTER_SPEC_ID } from "./spec.js";

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
export const BEAST_MASTERY_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  "active_enemies",
  "cooldown.barbed_shot.charges_fractional",
  "cooldown.kill_command.charges_fractional",
  "cooldown.kill_command.full_recharge_time",
  "dot.barbed_shot.remains",
  "execute_time",
  "focus",
  "full_recharge_time",
  "gcd",
  "target.health",
  "time_to_die.remains",
] as const);

/** Declared so their conditions parse; never given a value by this slice. */
export const BEAST_MASTERY_UNBOUND_TRUTH_ATOMS = Object.freeze([
  "apex.3",
  "buff.cobra_fang.at_max_stacks",
  "fight_style.dungeonroute",
  "howl_summon.ready",
  "max_prio_damage",
  "prev_gcd.1.bestial_wrath",
] as const);

export const BEAST_MASTERY_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  ...BEAST_MASTERY_UNBOUND_TRUTH_ATOMS.map((identifier) => truthAtom(identifier)),
  ...BEAST_MASTERY_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const BEAST_MASTERY_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  BEAST_MASTERY_HUNTER_SPEC_ID,
  BEAST_MASTERY_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
