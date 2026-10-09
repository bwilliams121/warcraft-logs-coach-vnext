/**
 * Assassination's `active_dot.garrote` / `active_dot.rupture` (M11-F).
 *
 * THE MAPPING IS PINNED, NOT INFERRED
 *
 * Each DoT action's aura identity comes from `rogue-dot-durations.json`
 * (dataset SIMC_DBC_ROGUE_DOT_DURATIONS, revision simc-33622e9d-1,
 * machine-extracted from the pinned SimulationCraft commit's spell tables) —
 * the same identity `dot-remains-state.ts` already reads as the DEBUFF on the
 * target: Garrote 703, Rupture 1943. A contract test pins that these agree
 * with `ROGUE_ABILITIES`. Nothing is matched by spell name, and a token the
 * dataset does not carry is simply not mapped.
 *
 * WHAT IT BINDS
 *
 * The caster's carrier count from `aura-carriers.ts`: a proven LOWER bound
 * when at least one target is proven to carry the player's DoT, otherwise
 * UNKNOWN. Never an exact count — no upper bound is established.
 *
 * WHERE IT IS USED: NOWHERE IN THE PUBLIC ANALYZER YET. The one pinned line
 * that reads these atoms — `crimson_tempest` in the `aoe_dot` list — also
 * compares them against `spell_targets.fan_of_knives`, which stays UNKNOWN in
 * M11-F, and Assassination's parser subset refuses the whole condition. So no
 * Assassination decision can change; a test pins that.
 */

import { casterAuraCarriersAt, type CasterAuraCarriers } from "../../../engine/auras/aura-carriers.js";
import { sourceRef } from "../../../engine/normalization/normalized-events.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import type { TemporalPosition } from "../../../engine/state/temporal.js";
import { dotDurationForToken } from "../../../data/game/rogue-dot-durations.js";
import { activeDotAtoms, type ActiveDotMapping } from "../../../simc/expression/active-dot.js";
import type { SpecAtomBinding } from "../../../simc/expression/spec-vocabulary.js";

/** The DoT tokens the pinned Assassination authority reads through `active_dot`. */
export const ASSASSINATION_ACTIVE_DOT_TOKENS = ["garrote", "rupture"] as const;

const PROVENANCE =
  "SIMC_DBC_ROGUE_DOT_DURATIONS simc-33622e9d-1 (commit 33622e9d1662ff0e451691edf85a6b49cc9d11d9)";

/** The pinned mappings; a token the dataset does not carry is left unmapped. */
export function assassinationActiveDotMappings(): readonly ActiveDotMapping[] {
  const mappings: ActiveDotMapping[] = [];
  for (const simcToken of ASSASSINATION_ACTIVE_DOT_TOKENS) {
    const identity = dotDurationForToken(simcToken);
    if (identity === null) continue;
    mappings.push({
      simcToken,
      auraAbilityGameIds: [identity.abilityGameId],
      auraClass: "DEBUFF",
      provenance: PROVENANCE,
    });
  }
  return mappings;
}

/** The carrier evidence for one mapped DoT of the player at a position. */
export function assassinationDotCarriers(
  state: CombatState,
  playerActorId: number,
  mapping: ActiveDotMapping,
  at: TemporalPosition,
): CasterAuraCarriers {
  return casterAuraCarriersAt(state, {
    // A player carries no instance id; `null` is "not supplied", never 0.
    caster: sourceRef(playerActorId, null),
    auraAbilityGameIds: mapping.auraAbilityGameIds,
    auraClass: mapping.auraClass,
    at,
  });
}

/** Both identifiers of every mapped DoT, bound from the evidence at a position. */
export function assassinationActiveDotAtoms(
  state: CombatState,
  playerActorId: number,
  at: TemporalPosition,
): readonly SpecAtomBinding[] {
  return assassinationActiveDotMappings().flatMap((mapping) => {
    const carriers = assassinationDotCarriers(state, playerActorId, mapping, at);
    return activeDotAtoms(
      mapping,
      carriers.count.kind === "AT_LEAST"
        ? { kind: "AT_LEAST", lowerBound: carriers.count.lowerBound }
        : { kind: "UNKNOWN", reason: carriers.count.reason },
    );
  });
}
