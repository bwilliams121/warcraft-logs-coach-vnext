/**
 * The identifiers the pinned Shadow Priest APL uses that the shared parser does not know (ONB-D2).
 *
 * WHAT DECLARING AN IDENTIFIER MEANS. It makes a condition containing it PARSE WHOLE instead of
 * refusing at that fragment. It does not make it decidable: `resolver.ts` binds a value only
 * where evidence and pinned facts support one, and the shared evaluator enumerates an unbound
 * truth and refuses an unbound magnitude.
 *
 * NEVER GIVEN A VALUE BY THIS SLICE, and why:
 *
 *   active_enemies, spell_targets.vampiric_touch, active_dot.*
 *       active_enemies: the resolver leaves it to the analysis, which binds the shared enemy count per decision (ONB-S3); spell_targets: action-owned, unregistered
 *   insanity.deficit
 *       the wire carries Insanity (type 13) at a completion, and a cast-time spell generates it. A completion's reading is not its decision's,
 *       so nothing here reads it
 *   cooldown.*, dot.*, health.pct, target.health.pct, gcd.max, time_to_bloodlust, pet.*, action.*
 *       no cooldown, DoT, health, GCD, pet or travel state is derived
 *   raid_event.adds.*, priest.force_devour_matter
 *       simulation options, with no meaning for an observed player
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
import { SHADOW_PRIEST_SPEC_ID } from "./spec.js";

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
export const SHADOW_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  "action.tentacle_slam.usable_in",
  "active_dot.shadow_word_madness",
  "active_dot.shadow_word_pain",
  "active_dot.vampiric_touch",
  "active_enemies",
  "cooldown.tentacle_slam.full_recharge_time",
  "cooldown.voidform.up",
  "dot.shadow_word_madness.remains",
  "dot.vampiric_touch.remains",
  "gcd.max",
  "health.pct",
  "insanity.deficit",
  "raid_event.adds.count",
  "raid_event.adds.in",
  "spell_targets.vampiric_touch",
  "target.health.pct",
] as const);

/** Declared so their conditions parse; never given a value by this slice. */
export const SHADOW_UNBOUND_TRUTH_ATOMS = Object.freeze([
  "action.tentacle_slam.enabled",
  "action.tentacle_slam.in_flight",
  "dot.vampiric_touch.refreshable",
  "in_flight",
  "pet.mindbender.active",
  "pet.shadowfiend.active",
  "pet.voidwraith.active",
  "priest.force_devour_matter",
  "raid_event.adds.exists",
  "set_bonus.mid2_4pc",
  "target.has_absorb",
] as const);

export const SHADOW_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  ...SHADOW_UNBOUND_TRUTH_ATOMS.map((identifier) => truthAtom(identifier)),
  ...SHADOW_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const SHADOW_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  SHADOW_PRIEST_SPEC_ID,
  SHADOW_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
