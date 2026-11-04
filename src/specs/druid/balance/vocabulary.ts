/**
 * The identifiers the pinned Balance Druid APL uses that the shared parser does not know (ONB-D2).
 *
 * WHAT DECLARING AN IDENTIFIER MEANS. It makes a condition containing it PARSE WHOLE instead of
 * refusing at that fragment. It does not make it decidable: `resolver.ts` binds a value only
 * where evidence and pinned facts support one, and the shared evaluator enumerates an unbound
 * truth and refuses an unbound magnitude.
 *
 * NEVER GIVEN A VALUE BY THIS SLICE, and why:
 *
 *   spell_targets, spell_targets.starfire, enemies, active_dots.moonfire
 *       the enemy set has no authority (ONB-S3)
 *   astral_power, astral_power.deficit, energize_amount, action.*.cost
 *       the wire carries Astral Power (type 8) on casts, at a completion, and a cast-time spell generates it. A completion's reading is not its
 *       decision's, so nothing here reads it
 *   cooldown.*, buff.*.down, eclipse.*, charges_fractional, prev_gcd.*, gcd.max, execute_time
 *       no cooldown, charge, aura, Eclipse state or GCD is derived
 *   druid.no_cds
 *       a simulation option, with no meaning for an observed player
 *
 * BOUND, from the observed tree:
 *
 *   hero_tree.elunes_chosen, hero_tree.keeper_of_the_grove: a constant by build (player.cpp:12205-12216), from the resolved tree
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
import { BALANCE_DRUID_SPEC_ID } from "./spec.js";

export const HERO_TREE_ELUNES_CHOSEN = "hero_tree.elunes_chosen";
export const HERO_TREE_KEEPER_OF_THE_GROVE = "hero_tree.keeper_of_the_grove";

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
export const BALANCE_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  "action.starfall.cost",
  "action.starsurge.cost",
  "active_dot.moonfire",
  "active_dots.moonfire",
  "active_enemies",
  "astral_power",
  "astral_power.deficit",
  "buff.eclipse.duration",
  "charges_fractional",
  "cooldown.eclipse.full_recharge_time",
  "cooldown.force_of_nature.duration",
  "cooldown.fury_of_elune.duration",
  "cooldown.wild_mushroom.full_recharge_time",
  "debuff.atmospheric_exposure.remains",
  "dot.moonfire.remains",
  "dot.sunfire.remains",
  "enemies",
  "energize_amount",
  "execute_time",
  "fight_style.dungeonroute",
  "gcd.max",
  "spell_targets",
  "spell_targets.starfire",
] as const);

/** Declared so their conditions parse; never given a value by this slice. */
export const BALANCE_UNBOUND_TRUTH_ATOMS = Object.freeze([
  "buff.ascendant_stars.down",
  "buff.ca_inc.down",
  "buff.eclipse.down",
  "buff.harmony_of_the_grove.down",
  "druid.no_cds",
  "eclipse.lunar",
  "eclipse.solar",
  "prev_gcd.1.eclipse",
] as const);

export const BALANCE_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  truthAtom(HERO_TREE_ELUNES_CHOSEN),
  truthAtom(HERO_TREE_KEEPER_OF_THE_GROVE),
  ...BALANCE_UNBOUND_TRUTH_ATOMS.map((identifier) => truthAtom(identifier)),
  ...BALANCE_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const BALANCE_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  BALANCE_DRUID_SPEC_ID,
  BALANCE_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
