/**
 * The identifiers the pinned Retribution APL uses ON THE SPENDER PATH that
 * the shared parser does not know (M11-A4).
 *
 * WHAT DECLARING AN IDENTIFIER MEANS — AND DOES NOT
 *
 * Declaring `holy_power` here makes a condition that contains it PARSE WHOLE
 * instead of being refused at that fragment. It does not make it decidable:
 * `resolver.ts` binds a value only when the evidence and the pinned facts
 * support one, and an unbound magnitude is UNKNOWN_NUMBER exactly like
 * `buff.<name>.remains`. Parser support and state observability stay
 * separate.
 *
 * EVERY DECLARATION IS A READING OF THE PINNED SOURCE:
 *
 *   holy_power
 *       player.cpp resource expression `holy_power` — the actor's current
 *       Holy Power. MAGNITUDE, player-scoped. Bound from the observed
 *       spender cast's own pre-cost entry, never replayed.
 *   variable.ds_castable
 *       `finishers[0] variable,name=ds_castable,value=(active_enemies>=2|
 *       buff.divine_arbiter_verdict.up)&!buff.empyrean_legacy.up&
 *       !buff.divine_arbiter_divine_storm.up` — SimulationCraft executes the
 *       assignment and reads the stored value at `finishers[2]`. TRUTH,
 *       player-scoped. The resolver evaluates the PINNED VALUE EXPRESSION
 *       with the shared evaluator and binds the result only when it is TRUE
 *       or FALSE in every world. NOT a generic variable engine: one named
 *       variable, one pinned expression, no assignment semantics.
 *   variable.pre_es_wake
 *       `precombat[7] variable,name=pre_es_wake,op=reset,default=0` and no
 *       in-combat assignment (the extractor's RETRIBUTION_CALL_GRAPH facts
 *       verify that). MAGNITUDE, KNOWN 0.
 *   active_enemies
 *       player.cpp — the sim's live enemy count. MAGNITUDE, player-scoped,
 *       NEVER BOUND: declared only so the ds_castable expression parses, and
 *       left UNKNOWN so the disjunction it opens resolves only when its other
 *       disjunct or the conjunction's other members settle it.
 *   cooldown.hammer_of_wrath.charges
 *       action expression `cooldown.<name>.charges`. MAGNITUDE, player-scoped,
 *       NEVER BOUND in A4: Final Verdict resets the cooldown on an
 *       unobservable proc, so no charge count is soundly derivable.
 *   gcd
 *       player.cpp:15119 P_GCD — the actor's current GCD length in seconds.
 *       MAGNITUDE, player-scoped, UNKNOWN (no GCD-length model).
 *
 * WHAT IS NOT HERE, deliberately. `raid_event.*`, `trinket.*`, `equipped.*`
 * and `variable.trinket_*` appear only on lines OUTSIDE the rotational
 * decision domain or on in-domain cooldown lines (Wake of Ashes, Divine Toll,
 * Avenging Wrath) whose parse failure is the honest outcome: such a line is
 * eliminated by a proven cooldown or BLOCKS the scan, and neither reading
 * would improve by pretending the identifier is a magnitude we might know.
 * `buff.<name>.*`, `debuff.<name>.up`, `cooldown.<name>.remains`,
 * `talent.<name>`, `fight_remains` and `target.time_to_die` are built-ins and
 * parse without this vocabulary; a declaration cannot shadow them.
 */

import { isBuiltinIdentifier } from "../../../simc/expression/parse.js";
import {
  defineSpecAtomVocabulary,
  type SpecAtomDeclaration,
  type SpecAtomVocabulary,
} from "../../../simc/expression/spec-vocabulary.js";
import { RETRIBUTION_PALADIN_SPEC_ID } from "./spec.js";

export const HOLY_POWER = "holy_power";
export const VARIABLE_DS_CASTABLE = "variable.ds_castable";
export const VARIABLE_PRE_ES_WAKE = "variable.pre_es_wake";
export const ACTIVE_ENEMIES = "active_enemies";
export const COOLDOWN_HAMMER_OF_WRATH_CHARGES = "cooldown.hammer_of_wrath.charges";
export const GCD = "gcd";

/** The pinned value expression of `variable.ds_castable` (finishers[0]), verbatim. */
export const DS_CASTABLE_VALUE_EXPRESSION =
  "(active_enemies>=2|buff.divine_arbiter_verdict.up)&!buff.empyrean_legacy.up&!buff.divine_arbiter_divine_storm.up";

export const RETRIBUTION_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  { identifier: HOLY_POWER, shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false },
  { identifier: VARIABLE_DS_CASTABLE, shape: "BOOLEAN", scope: "PLAYER_SCOPED", selfAddressing: false },
  { identifier: VARIABLE_PRE_ES_WAKE, shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false },
  { identifier: ACTIVE_ENEMIES, shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false },
  {
    identifier: COOLDOWN_HAMMER_OF_WRATH_CHARGES,
    shape: "NUMERIC",
    scope: "PLAYER_SCOPED",
    selfAddressing: false,
  },
  { identifier: GCD, shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false },
]);

/** The frozen vocabulary the Retribution resolver and traversal parse with. */
export const RETRIBUTION_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  RETRIBUTION_PALADIN_SPEC_ID,
  RETRIBUTION_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
