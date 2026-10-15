/**
 * CHARACTER SPEC BINDINGS (M11-G3-2).
 *
 * Character reconstruction is specialization-agnostic. What a specialization
 * means to it — the specialization id and class, the talent-loadout table of
 * its class, how a hero tree is resolved, which equipment enchant is required
 * simulation setup (a Death Knight's runeforge), and which engine-observable
 * spells prove a tier set activated — is owned by the specialization's tree
 * and handed in by the composition root.
 */

import type { HeroTreeResolution, ObservedTalentEntry } from "../data/game/talent-selection.js";
import type { LoadoutTable } from "../data/game/talent-loadout.js";
import type { SimulationSpecBinding } from "../simulation/spec-binding.js";
import type { GearSlot } from "./gear-slots.js";

/** Engine-observable proof that a tier set's N-piece bonus is active. */
export interface SetBonusMarker {
  /** The engine's tier label (e.g. MID2). */
  readonly tier: string;
  readonly pieces: 2 | 4;
  /** Spell ids the engine reports only while that bonus is active. */
  readonly spellIds: readonly number[];
  /** Pinned source establishing the marker. */
  readonly citation: string;
}

export interface CharacterSpecBinding {
  readonly simulation: SimulationSpecBinding;
  /** WCL `combatantinfo.specID` / loadout spec id. */
  readonly specId: number;
  readonly classId: number;
  readonly loadoutTable: () =>
    { readonly ok: true; readonly table: LoadoutTable } | { readonly ok: false; readonly detail: string };
  readonly resolveHeroTree: (entries: readonly ObservedTalentEntry[]) => HeroTreeResolution;
  /** Slots whose permanent enchant is required simulation setup (KNOWN or KNOWN_NONE, never UNKNOWN). */
  readonly requiredEnchantSlots: readonly GearSlot[];
  readonly setBonusMarkers: readonly SetBonusMarker[];
}
