/**
 * The identifiers the pinned Guardian Druid APL uses that the shared parser does not know (ONB-T2).
 *
 * WHAT DECLARING AN IDENTIFIER MEANS. It makes a condition containing it PARSE WHOLE instead of
 * refusing at that fragment. It does not make it decidable: `resolver.ts` binds a value only
 * where evidence and pinned facts support one, and the shared evaluator enumerates an unbound
 * truth and refuses an unbound magnitude.
 *
 * ENCOUNTER STATE (SIMC-FB-R). Whatever is listed below as `active_enemies`, `spell_targets`, `fight_style.*` or
 * `raid_event.*` stays unbound by this resolver, and `withEncounterStateAt` may bind it at tier 3, with provenance,
 * where the pinned profile answers on a proven build.
 *
 * NEVER GIVEN A VALUE BY THIS SLICE, and why:
 *
 *   active_enemies
 *       bound by the shared enemy-set model as far as its evidence proves (ONB-S3); declared so its gates parse
 *   rage
 *       a contract says what the wire's Rage is, and this slice reads none: no line it reaches can resolve on the value. A later slice that binds it must declare it first
 *   talent.flashing_claws.rank
 *       a rank is a magnitude, and no reading of the tree states one here
 *   dot.*.stack, dot.*.refreshable, cooldown.*, buff.*.down, gcd, set_bonus.*, target.cooldown.pause_action.remains, equipped.*
 *       no DoT window, cooldown, aura, tier set, clock or enemy cast is derived. `target.cooldown.pause_action.remains` asks a simulation's raid event
 *
 * BOUND:
 *
 *   talent.<name>.enabled: the same three-way reading as `talent.<name>`, and otherwise unbound, so it is enumerated
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
import { GUARDIAN_DRUID_SPEC_ID } from "./spec.js";

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
export const GUARDIAN_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  "active_enemies",
  "dot.thrash.stack",
  "rage",
  "talent.flashing_claws.rank",
  "target.cooldown.pause_action.remains",
] as const);

/** Declared so their conditions parse; never given a value by this slice. */
export const GUARDIAN_UNBOUND_TRUTH_ATOMS = Object.freeze([
  "cooldown.berserk.up",
  "cooldown.heart_of_the_wild.up",
  "cooldown.incarnation_guardian_of_ursoc.up",
  "cooldown.mangle.up",
  "cooldown.thrash.up",
  "dot.rake.refreshable",
  "dot.rip.refreshable",
  "set_bonus.midnight_season_2_4pc",
] as const);

/** `talent.<name>.enabled`, by talent: bound from the three-way reading in `resolver.ts`. */
export const GUARDIAN_TALENT_ENABLED_ATOMS = Object.freeze([
  "talent.convoke_the_spirits.enabled",
  "talent.flashing_claws.enabled",
  "talent.fluid_form.enabled",
  "talent.fount_of_strength.enabled",
  "talent.heart_of_the_wild.enabled",
  "talent.killing_blow.enabled",
  "talent.lunar_calling.enabled",
  "talent.lunation.enabled",
  "talent.moonkin_form.enabled",
  "talent.ravage.enabled",
  "talent.raze.enabled",
  "talent.red_moon.enabled",
  "talent.soul_of_the_forest.enabled",
  "talent.wildpower_surge.enabled",
] as const);

export const GUARDIAN_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  ...GUARDIAN_TALENT_ENABLED_ATOMS.map((identifier) => truthAtom(identifier)),
  ...GUARDIAN_UNBOUND_TRUTH_ATOMS.map((identifier) => truthAtom(identifier)),
  ...GUARDIAN_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const GUARDIAN_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  GUARDIAN_DRUID_SPEC_ID,
  GUARDIAN_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
