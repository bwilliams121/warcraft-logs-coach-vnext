/**
 * The identifiers the pinned Windwalker Monk APL uses that the shared parser does not know (ONB-T1).
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
 *   chi
 *       no wire contract says what classResources type 12 is (`src/data/wcl-wire/resource-types.ts`), so no Chi is read, on any cast
 *   chi.max
 *       no wire contract says what classResources type 12 is (`src/data/wcl-wire/resource-types.ts`), so no Chi is read, on any cast
 *   combo_strike
 *       self-addressing: whether this entry would repeat the last Combo Strikes action. No such history is reconstructed
 *   cooldown.invoke_power_infusion_0.duration
 *       no cooldown is derived
 *   cooldown.zenith.full_recharge_time
 *       no cooldown is derived
 *   cooldown.zenith.up
 *       no cooldown is derived
 *   energy.time_to_max
 *       the time to a cap needs a regeneration model, and only the decision cast's own Energy is read
 *   fight_style.dungeonroute
 *       SIM_ONLY: a simulation's option. A real fight has none
 *   fight_style.dungeonslice
 *       SIM_ONLY: a simulation's option. A real fight has none
 *   gcd.max
 *       the live global, which the spec aura changes at init (sc_monk.cpp), is not reconstructed
 *   prev.celestial_conduit
 *       the last ability the sim executed: a WCL cast only upper-bounds a SimC internal event
 *   time
 *       the reaction to a pull is not modelled
 *
 * BOUND, from the decision cast's own observation:
 *
 *   energy: the decision cast's own PRE_COST observation
 *
 * WHAT IS NOT HERE. `buff.<name>.up`, `buff.<name>.stack`, `buff.<name>.remains`, `cooldown.<name>.remains`, `fight_remains`, `target.time_to_die`
 * and `talent.<name>` are built-ins and parse without this vocabulary. `trinket.*` is undeclared on purpose: no gear is read, so the ten class lines that read it
 * refuse at that fragment, `big_coc[1]` and `zenith[4]` among them, and a scan stops there rather than guess a trinket.
 */

import { isBuiltinIdentifier } from "../../../simc/expression/parse.js";
import {
  defineSpecAtomVocabulary,
  type SpecAtomDeclaration,
  type SpecAtomVocabulary,
} from "../../../simc/expression/spec-vocabulary.js";
import { WINDWALKER_MONK_SPEC_ID } from "./spec.js";

export const ENERGY = "energy";
export const COMBO_STRIKE = "combo_strike";
export const COOLDOWN_ZENITH_UP = "cooldown.zenith.up";
export const FIGHT_STYLE_DUNGEONROUTE = "fight_style.dungeonroute";
export const FIGHT_STYLE_DUNGEONSLICE = "fight_style.dungeonslice";
export const PREV_CELESTIAL_CONDUIT = "prev.celestial_conduit";
export const ACTIVE_ENEMIES = "active_enemies";
export const CHI = "chi";
export const CHI_MAX = "chi.max";
export const COOLDOWN_INVOKE_POWER_INFUSION_0_DURATION = "cooldown.invoke_power_infusion_0.duration";
export const COOLDOWN_ZENITH_FULL_RECHARGE_TIME = "cooldown.zenith.full_recharge_time";
export const ENERGY_TIME_TO_MAX = "energy.time_to_max";
export const GCD_MAX = "gcd.max";
export const TIME = "time";

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

/** Declared so their conditions parse; never given a value by this slice, so each is enumerated. */
export const WINDWALKER_MONK_UNBOUND_TRUTH_ATOMS = Object.freeze([
  COOLDOWN_ZENITH_UP,
  FIGHT_STYLE_DUNGEONROUTE,
  FIGHT_STYLE_DUNGEONSLICE,
  PREV_CELESTIAL_CONDUIT,
] as const);

/** Declared so their conditions parse; never given a value by this slice. */
export const WINDWALKER_MONK_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  ACTIVE_ENEMIES,
  CHI,
  CHI_MAX,
  COOLDOWN_INVOKE_POWER_INFUSION_0_DURATION,
  COOLDOWN_ZENITH_FULL_RECHARGE_TIME,
  ENERGY_TIME_TO_MAX,
  GCD_MAX,
  TIME,
] as const);

export const WINDWALKER_MONK_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  magnitudeAtom(ENERGY),
  // An entry's own question: whether IT would repeat the last Combo Strikes action (sc_monk.cpp:208-209, :325-339).
  { identifier: COMBO_STRIKE, shape: "BOOLEAN", scope: "PLAYER_SCOPED", selfAddressing: true },
  ...WINDWALKER_MONK_UNBOUND_TRUTH_ATOMS.map((identifier) => truthAtom(identifier)),
  ...WINDWALKER_MONK_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const WINDWALKER_MONK_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  WINDWALKER_MONK_SPEC_ID,
  WINDWALKER_MONK_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
