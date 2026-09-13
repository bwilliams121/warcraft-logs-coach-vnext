/**
 * Minimal ability identity for the supported surface.
 *
 * TWO entries. This is not a spell database and must not become one: entries are
 * added when a supported decision actually needs them, never speculatively.
 * `envenom` arrived with M5-A's `spend` selection; `garrote` arrived with
 * M5-C3a's `core_dot` selection, which cannot name what it selected without it.
 *
 * IDENTITY IS THE NUMBER, NEVER THE NAME.
 *
 * Warcraft Logs master data supplies ability names, and they cannot be used for
 * matching for three independent reasons, each sufficient on its own:
 *
 * - the retrieval plan sets `translate: true`, so names are LOCALIZED display
 *   strings, not stable keys
 * - `CombatAbility.name` is nullable
 * - name -> id is not even a function. The captured 2,035-ability catalog for
 *   one fight contains TWO distinct ids both named "Mutilate" (1329 and 27576)
 *
 * `displayNameEn` below exists only so a human reading a debug dump recognises
 * the row. A contract test asserts no evaluator compares against it.
 *
 * This dataset carries game-build provenance for traceability, and is
 * deliberately NOT version-gated: `CombatFight` exposes no game-build field, so
 * a gate against one would be theatre. See `src/data/provenance.ts`.
 */

import type { GameDataProvenance } from "../provenance.js";

/** SimulationCraft action tokens this project can resolve to a spell id. */
export type SimcAbilityToken = "envenom" | "garrote";

export interface AbilityIdentity {
  /** The token as it appears in a SimulationCraft APL action string. */
  readonly simcToken: SimcAbilityToken;
  /** The canonical game spell id. The identity. */
  readonly spellId: number;
  readonly className: "rogue";
  /** Human-readable only. Never used for matching. */
  readonly displayNameEn: string;
}

export const ROGUE_ABILITY_DATA_PROVENANCE: GameDataProvenance = {
  datasetId: "M5A_ROGUE_ABILITY_IDENTITY",
  expansion: "Midnight",
  gameBuild: "12.0",
  source:
    "World of Warcraft spell data; corroborated by Warcraft Logs master data for report A7R6kxPJ1hC8YQ4w",
  retrievedOn: "2026-09-12",
  applicabilityNote:
    "Not version-gated. CombatFight exposes no game-build compatibility key, so no fight-derived " +
    "gate is possible; gating on a field that does not exist would always pass while appearing " +
    "rigorous. Spell ids are stable across builds; a rename or reissue is a regeneration trigger " +
    "for a human, not a runtime condition.",
};

/**
 * The identities, keyed by SimulationCraft token.
 *
 * `garrote`'s 703 is ALSO carried by `rogue-dot-durations.json`, where it was
 * machine-extracted from the pinned specialization-spell table. Two records of
 * one fact can drift, so a contract test asserts these agree. The duplication is
 * deliberate rather than accidental: this module must stay a plain synchronous
 * lookup that cannot fail, and sourcing it from a validated artifact would make
 * an ability identity disappear whenever that artifact did.
 */
export const ROGUE_ABILITIES: readonly AbilityIdentity[] = [
  { simcToken: "envenom", spellId: 32645, className: "rogue", displayNameEn: "Envenom" },
  { simcToken: "garrote", spellId: 703, className: "rogue", displayNameEn: "Garrote" },
];

export type AbilityIdentityResolution =
  | { readonly ok: true; readonly identity: AbilityIdentity }
  | { readonly ok: false; readonly reason: "ABILITY_IDENTITY_UNAVAILABLE"; readonly token: string };

/**
 * Resolves a SimulationCraft action token to a canonical spell id.
 *
 * Takes a token, never a display name, and returns a number, never a matcher.
 */
export function abilityIdentityFor(token: SimcAbilityToken): AbilityIdentityResolution {
  const identity = ROGUE_ABILITIES.find((entry) => entry.simcToken === token);
  if (identity === undefined) {
    return { ok: false, reason: "ABILITY_IDENTITY_UNAVAILABLE", token };
  }
  return { ok: true, identity };
}

/**
 * Resolves an ARBITRARY SimulationCraft token, or `null` when it is not modelled.
 *
 * `abilityIdentityFor` takes the narrow `SimcAbilityToken` union, which is right
 * for a caller naming an ability it knows about at compile time. A caller walking
 * an APL list encounters whatever tokens the pinned authority happens to contain
 * — `mutilate`, `garrote`, `use_item` — and needs to ask about them without
 * asserting they are modelled.
 *
 * `null` means "this project has no numeric identity for that token". It does NOT
 * mean the ability does not exist, and a caller must not read it as one.
 */
export function tryAbilityIdentityFor(token: string): AbilityIdentity | null {
  return ROGUE_ABILITIES.find((entry) => entry.simcToken === token) ?? null;
}
