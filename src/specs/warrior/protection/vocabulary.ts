/**
 * The identifiers the pinned Protection Warrior APL uses that the shared parser does not know (ONB-A2).
 *
 * WHAT DECLARING AN IDENTIFIER MEANS. It makes a condition containing it PARSE WHOLE instead of
 * refusing at that fragment. It does not make it decidable: `resolver.ts` binds a value only
 * where evidence and pinned facts support one, and the shared evaluator enumerates an unbound
 * truth and refuses an unbound magnitude.
 *
 * NEVER GIVEN A VALUE BY THIS SLICE, and why:
 *
 *   time
 *       the reaction to a pull is not modelled
 *   target.health.pct
 *       the target's health is not modelled
 *   spell_targets.thunder_blast
 *       action-owned, and no action registers its target applicability (ONB-S3)
 *   spell_targets.revenge
 *       action-owned, and no action registers its target applicability (ONB-S3)
 *   spell_targets.execute
 *       action-owned, and no action registers its target applicability (ONB-S3)
 *   spell_targets.thunder_clap
 *       action-owned, and no action registers its target applicability (ONB-S3)
 *   buff.thunder_blast.down
 *       no aura identity is pinned
 *   cooldown.shield_slam.ready
 *       no cooldown is derived
 *   cooldown.shield_charge.ready
 *       no cooldown is derived
 *   cooldown.demoralizing_shout.ready
 *       no cooldown is derived
 *   talent.heavy_repercussions.enabled
 *       not pinned: read only inside Ignore Pain's condition
 *   talent.practiced_strikes.enabled
 *       not pinned: read only inside Ignore Pain's condition
 *
 * BOUND, from the observed tree or the decision cast's own observation:
 *
 *   hero_tree.colossus: a constant for the actor's active hero sub-tree (player.cpp:12205-12216)
 *   hero_tree.mountain_thane: a constant for the actor's active hero sub-tree (player.cpp:12205-12216)
 *   talent.booming_voice.enabled: the three-way talent rule
 *   talent.javelineer.enabled: the three-way talent rule
 *   talent.massacre.enabled: the three-way talent rule
 *   talent.snap_induction.enabled: the three-way talent rule
 *   talent.heavy_handed.enabled: the three-way talent rule
 *   rage: the decision cast's own PRE_COST observation
 *   rage.deficit: the decision cast's own PRE_COST observation
 *
 * WHAT IS NOT HERE. `buff.<name>.up`, `debuff.<name>.up`, `cooldown.<name>.remains`,
 * `fight_remains` and `talent.<name>` are built-ins and parse without this vocabulary. `trinket.*`
 * is undeclared on purpose: it appears only in the non-domain item lists and in variables only
 * they read, so such a line refuses if anything ever reads it.
 */

import { isBuiltinIdentifier } from "../../../simc/expression/parse.js";
import {
  defineSpecAtomVocabulary,
  type SpecAtomDeclaration,
  type SpecAtomVocabulary,
} from "../../../simc/expression/spec-vocabulary.js";
import { PROTECTION_WARRIOR_SPEC_ID } from "./spec.js";

export const HERO_TREE_COLOSSUS = "hero_tree.colossus";
export const HERO_TREE_MOUNTAIN_THANE = "hero_tree.mountain_thane";
export const BOOMING_VOICE_ENABLED = "talent.booming_voice.enabled";
export const JAVELINEER_ENABLED = "talent.javelineer.enabled";
export const MASSACRE_ENABLED = "talent.massacre.enabled";
export const SNAP_INDUCTION_ENABLED = "talent.snap_induction.enabled";
export const HEAVY_HANDED_ENABLED = "talent.heavy_handed.enabled";
export const THUNDER_BLAST_DOWN = "buff.thunder_blast.down";
export const SHIELD_SLAM_READY = "cooldown.shield_slam.ready";
export const SHIELD_CHARGE_READY = "cooldown.shield_charge.ready";
export const DEMORALIZING_SHOUT_READY = "cooldown.demoralizing_shout.ready";
export const HEAVY_REPERCUSSIONS_ENABLED = "talent.heavy_repercussions.enabled";
export const PRACTICED_STRIKES_ENABLED = "talent.practiced_strikes.enabled";
export const RAGE = "rage";
export const RAGE_DEFICIT = "rage.deficit";
export const TIME = "time";
export const TARGET_HEALTH_PCT = "target.health.pct";
export const SPELL_TARGETS_THUNDER_BLAST = "spell_targets.thunder_blast";
export const SPELL_TARGETS_REVENGE = "spell_targets.revenge";
export const SPELL_TARGETS_EXECUTE = "spell_targets.execute";
export const SPELL_TARGETS_THUNDER_CLAP = "spell_targets.thunder_clap";

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
export const PROTECTION_WARRIOR_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  TIME,
  TARGET_HEALTH_PCT,
  SPELL_TARGETS_THUNDER_BLAST,
  SPELL_TARGETS_REVENGE,
  SPELL_TARGETS_EXECUTE,
  SPELL_TARGETS_THUNDER_CLAP,
] as const);

export const PROTECTION_WARRIOR_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  truthAtom(HERO_TREE_COLOSSUS),
  truthAtom(HERO_TREE_MOUNTAIN_THANE),
  truthAtom(BOOMING_VOICE_ENABLED),
  truthAtom(JAVELINEER_ENABLED),
  truthAtom(MASSACRE_ENABLED),
  truthAtom(SNAP_INDUCTION_ENABLED),
  truthAtom(HEAVY_HANDED_ENABLED),
  truthAtom(THUNDER_BLAST_DOWN),
  truthAtom(SHIELD_SLAM_READY),
  truthAtom(SHIELD_CHARGE_READY),
  truthAtom(DEMORALIZING_SHOUT_READY),
  truthAtom(HEAVY_REPERCUSSIONS_ENABLED),
  truthAtom(PRACTICED_STRIKES_ENABLED),
  magnitudeAtom(RAGE),
  magnitudeAtom(RAGE_DEFICIT),
  ...PROTECTION_WARRIOR_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const PROTECTION_WARRIOR_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  PROTECTION_WARRIOR_SPEC_ID,
  PROTECTION_WARRIOR_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
