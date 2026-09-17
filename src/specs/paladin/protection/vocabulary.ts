/**
 * The identifiers the pinned Protection APL uses that the shared parser does
 * not know (M10-C).
 *
 * WHAT DECLARING AN IDENTIFIER MEANS — AND DOES NOT
 *
 * Declaring `consecration.up` here makes a condition that contains it PARSE
 * WHOLE instead of being refused at that fragment. It does not make it
 * decidable: `resolver.ts` binds a value only when the evidence and the
 * pinned facts support one, and an unbound truth is enumerated exactly like
 * `buff.<name>.up`. Parser support and state observability stay separate.
 *
 * EVERY DECLARATION IS A READING OF THE PINNED SOURCE, not of the token's
 * name. Shape and scope were decided by what SimulationCraft evaluates:
 *
 *   talent.righteous_protector.enabled
 *       player.cpp:12351-12358 — `talent.<name>.enabled` is the same constant
 *       as `talent.<name>`: `_talent.enabled()`. TRUTH, player-scoped.
 *   hero_tree.lightsmith
 *       player.cpp:12205-12215 — `trait_data_t::get_hero_tree_id( "lightsmith" )`
 *       (49, sc_enums.hpp:321) is in `player_sub_trees`. TRUTH, player-scoped.
 *   apex.3
 *       player.cpp:12313-12331 — the third NODE_TIERED specialization trait in
 *       generated-table order, `.enabled()`. TRUTH, player-scoped.
 *   prev_gcd.1.divine_toll
 *       player.cpp — whether the most recent GCD-consuming executed action
 *       (`prev_gcd_actions.back()`) is `divine_toll`. TRUTH, player-scoped.
 *   next_armament
 *       sc_paladin.cpp:5198-5215 — the armament index the next Holy Armaments
 *       cast produces, or -1 when the Lightsmith tree is not active.
 *       MAGNITUDE, player-scoped.
 *   sacred_weapon / holy_bulwark
 *       sc_paladin.cpp:5217-5224 — the constants `armament::SACRED_WEAPON` (1)
 *       and `armament::HOLY_BULWARK` (0), sc_paladin.hpp:25-29. MAGNITUDE.
 *   consecration.up
 *       sc_paladin.cpp `create_consecration_expression` — whether the actor's
 *       Consecration ground effect is active under them. TRUTH, player-scoped.
 *   full_recharge_time / charges
 *       action expressions of the ACTING action (`full_recharge_time`, the
 *       time until every charge is back; `charges`, the charges available).
 *       MAGNITUDE, SELF-ADDRESSING: bound per action token, never shared.
 *   gcd
 *       player.cpp:15119 P_GCD — the actor's current GCD length in seconds.
 *       MAGNITUDE, player-scoped.
 *
 * WHAT IS NOT HERE. `buff.<name>.*`, `debuff.<name>.up`, `cooldown.<name>.remains`
 * and `talent.<name>` are built-ins and parse without this vocabulary; the
 * shared parser matches them first and this list cannot shadow them (the
 * vocabulary guard refuses a declaration that would).
 */

import { isBuiltinIdentifier } from "../../../simc/expression/parse.js";
import {
  defineSpecAtomVocabulary,
  type SpecAtomDeclaration,
  type SpecAtomVocabulary,
} from "../../../simc/expression/spec-vocabulary.js";
import { PROTECTION_PALADIN_SPEC_ID } from "./spec.js";

export const TALENT_RIGHTEOUS_PROTECTOR_ENABLED = "talent.righteous_protector.enabled";
export const HERO_TREE_LIGHTSMITH = "hero_tree.lightsmith";
export const APEX_3 = "apex.3";
export const PREV_GCD_1_DIVINE_TOLL = "prev_gcd.1.divine_toll";
export const NEXT_ARMAMENT = "next_armament";
export const SACRED_WEAPON = "sacred_weapon";
export const HOLY_BULWARK = "holy_bulwark";
export const CONSECRATION_UP = "consecration.up";
export const FULL_RECHARGE_TIME = "full_recharge_time";
export const CHARGES = "charges";
export const GCD = "gcd";

export const PROTECTION_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  {
    identifier: TALENT_RIGHTEOUS_PROTECTOR_ENABLED,
    shape: "BOOLEAN",
    scope: "PLAYER_SCOPED",
    selfAddressing: false,
  },
  { identifier: HERO_TREE_LIGHTSMITH, shape: "BOOLEAN", scope: "PLAYER_SCOPED", selfAddressing: false },
  { identifier: APEX_3, shape: "BOOLEAN", scope: "PLAYER_SCOPED", selfAddressing: false },
  { identifier: PREV_GCD_1_DIVINE_TOLL, shape: "BOOLEAN", scope: "PLAYER_SCOPED", selfAddressing: false },
  { identifier: NEXT_ARMAMENT, shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false },
  { identifier: SACRED_WEAPON, shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false },
  { identifier: HOLY_BULWARK, shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false },
  { identifier: CONSECRATION_UP, shape: "BOOLEAN", scope: "PLAYER_SCOPED", selfAddressing: false },
  { identifier: FULL_RECHARGE_TIME, shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: true },
  { identifier: CHARGES, shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: true },
  { identifier: GCD, shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false },
]);

/** The frozen vocabulary the Protection resolver and traversal parse with. */
export const PROTECTION_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  PROTECTION_PALADIN_SPEC_ID,
  PROTECTION_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
