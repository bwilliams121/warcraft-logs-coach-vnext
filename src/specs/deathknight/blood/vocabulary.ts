/**
 * The identifiers the pinned Blood Death Knight APL uses that the shared
 * parser does not know (M11-B2).
 *
 * WHAT DECLARING AN IDENTIFIER MEANS — AND DOES NOT
 *
 * Declaring `rune` here makes a condition that contains it PARSE WHOLE
 * instead of being refused at that fragment. It does not make it decidable:
 * `resolver.ts` binds a value only when the evidence and the pinned facts
 * support one, and an unbound magnitude is UNKNOWN_NUMBER exactly like
 * `buff.<name>.remains`. Parser support and state observability stay
 * separate.
 *
 * EVERY DECLARATION IS A READING OF THE PINNED SOURCE:
 *
 *   hero_tree.sanlayn, hero_tree.deathbringer
 *       player.cpp:12205-12216 — `hero_tree.<name>` is a CONSTANT 1 when
 *       the hero sub-tree of that name is active for the actor, else 0.
 *       TRUTH, player-scoped. Bound from the pinned hero-tree resolution
 *       over the observed talent tree (`deathknight-blood-talents.ts`,
 *       `resolveBloodHeroTree`): RESOLVED to one tree binds that tree TRUE
 *       and the other FALSE (one hero tree is active at a time); UNKNOWN or
 *       CONTRADICTORY leaves both unbound.
 *   runic_power.deficit
 *       player.cpp:12570-12590 `create_resource_expression`: `<resource>.deficit`
 *       is `resources.max[ r ] - resources.current[ r ]`, in POINTS.
 *       MAGNITUDE, player-scoped. Bound from the decision cast's own
 *       PRE_COST Runic Power entry, converted once from the wire's tenths
 *       (`resources.ts`); never replayed, never regenerated.
 *   rune
 *       player.cpp:12570-12581 — a bare resource name is
 *       `resources.current[ r ]`, the actor's ready Rune count.
 *       sc_death_knight.cpp:14486-14500 overrides only `rune.time_to_<n>`,
 *       which the pinned Blood list does not use. MAGNITUDE, player-scoped.
 *       Bound from the decision cast's own PRE_COST Rune entry; UNKNOWN on a
 *       cast that costs no Runes.
 *   time
 *       sim.cpp:3574-3575 `sim_t::create_expression`: the sim's
 *       `event_mgr.current_time`, in SECONDS since the pull. MAGNITUDE,
 *       player-scoped. Bound from the decision's fight time — an OBSERVED
 *       quantity, the one atom on the Dancing Rune Weapon gate that is.
 *
 * WHAT IS NOT HERE, deliberately. `fight_remains`, `buff.<name>.*`,
 * `debuff.<name>.up`, `cooldown.<name>.remains` are built-ins and parse
 * without this vocabulary; a declaration cannot shadow them. `empower_to`
 * is an ACTION OPTION, not an expression identifier, and the shared
 * authority loader classifies it UNRECOGNISED: the two `consumption`
 * entries carrying it stop a scan that reaches them, and M11-B2 records
 * that stopping point rather than teaching the loader a new option.
 */

import { isBuiltinIdentifier } from "../../../simc/expression/parse.js";
import {
  defineSpecAtomVocabulary,
  type SpecAtomDeclaration,
  type SpecAtomVocabulary,
} from "../../../simc/expression/spec-vocabulary.js";
import { BLOOD_DEATH_KNIGHT_SPEC_ID } from "./spec.js";

export const HERO_TREE_SANLAYN = "hero_tree.sanlayn";
export const HERO_TREE_DEATHBRINGER = "hero_tree.deathbringer";
export const RUNIC_POWER_DEFICIT = "runic_power.deficit";
export const RUNE = "rune";
export const TIME = "time";

export const BLOOD_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  { identifier: HERO_TREE_SANLAYN, shape: "BOOLEAN", scope: "PLAYER_SCOPED", selfAddressing: false },
  { identifier: HERO_TREE_DEATHBRINGER, shape: "BOOLEAN", scope: "PLAYER_SCOPED", selfAddressing: false },
  { identifier: RUNIC_POWER_DEFICIT, shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false },
  { identifier: RUNE, shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false },
  { identifier: TIME, shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false },
]);

/** The frozen vocabulary the Blood resolver and traversal parse with. */
export const BLOOD_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  BLOOD_DEATH_KNIGHT_SPEC_ID,
  BLOOD_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
