/**
 * The identifiers the pinned Demonology Warlock APL uses that the shared parser does not know (ONB-X4).
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
 *       the resolver leaves it to the analysis, which binds the shared enemy count per decision (ONB-S3)
 *   soul_shard
 *       the wire carries Soul Shards on a costed cast, at its completion, and a cast-time spell spends them. A completion's reading is not its decision's, and no
 *       shared wire contract row exists for it
 *   gcd.max
 *       hasted, and haste at a decision is not reconstructed
 *
 * BOUND, per decision, from the shared pet state (ONB-S6, `pet-profile.ts`), and only when the answer is decided:
 *
 *   pet.demonic_tyrant.active: a spawner's `active`, whether an instance is up. Unknown presence leaves the truth unbound, so it is enumerated, never false.
 *
 * BOUND, from the talent rule:
 *
 *   talent.to_hell_and_back.enabled: the constant `_talent.enabled()` (player.cpp:12355-12362), a build fact. Unbound when the tree does not resolve it.
 *
 * WHAT IS NOT HERE. `buff.<name>.up`, `buff.<name>.stack`, `buff.<name>.remains`, `buff.<name>.react`, `debuff.<name>.up`,
 * `cooldown.<name>.remains`, `fight_remains`, and `talent.<name>` are built-ins and parse without this vocabulary. So `buff.wild_imps.stack` is a built-in: the facade supplies
 * it as a stack binding, from the same pet state. `trinket.*` is undeclared on purpose: it appears only in the non-domain item lines and in variables only they read, so such a line refuses if anything ever reads it.
 */

import { isBuiltinIdentifier } from "../../../simc/expression/parse.js";
import {
  defineSpecAtomVocabulary,
  type SpecAtomDeclaration,
  type SpecAtomVocabulary,
} from "../../../simc/expression/spec-vocabulary.js";
import { DEMONOLOGY_WARLOCK_SPEC_ID } from "./spec.js";

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

export const PET_DEMONIC_TYRANT_ACTIVE = "pet.demonic_tyrant.active";
export const TALENT_TO_HELL_AND_BACK_ENABLED = "talent.to_hell_and_back.enabled";

/** Declared so their conditions parse; never given a value by this slice. */
export const DEMONOLOGY_UNBOUND_NUMERIC_ATOMS = Object.freeze([
  "active_enemies",
  "gcd.max",
  "soul_shard",
] as const);

/** Declared so their conditions parse; never given a value by this slice. */
export const DEMONOLOGY_UNBOUND_TRUTH_ATOMS = Object.freeze([] as const);

export const DEMONOLOGY_ATOM_DECLARATIONS: readonly SpecAtomDeclaration[] = Object.freeze([
  truthAtom(PET_DEMONIC_TYRANT_ACTIVE),
  truthAtom(TALENT_TO_HELL_AND_BACK_ENABLED),
  ...DEMONOLOGY_UNBOUND_TRUTH_ATOMS.map((identifier) => truthAtom(identifier)),
  ...DEMONOLOGY_UNBOUND_NUMERIC_ATOMS.map((identifier) => magnitudeAtom(identifier)),
]);

/** The frozen vocabulary the resolver and traversal parse with. */
export const DEMONOLOGY_ATOM_VOCABULARY: SpecAtomVocabulary = defineSpecAtomVocabulary(
  DEMONOLOGY_WARLOCK_SPEC_ID,
  DEMONOLOGY_ATOM_DECLARATIONS,
  isBuiltinIdentifier,
);
