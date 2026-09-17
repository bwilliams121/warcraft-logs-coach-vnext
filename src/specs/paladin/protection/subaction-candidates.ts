/**
 * Protection Paladin's candidate sub-actions for an OMITTED gear key, and its
 * reading of which of their writes the pinned list can observe (M10-C3).
 *
 * WHAT THIS BINDS. The shared proof in `src/simc/subaction-equivalence.ts`
 * decides whether an unknown sub-action identity matters, given candidates
 * and a policy. This module supplies both from pinned facts:
 *
 *     candidates   every use-producing row of the pinned enchant universe
 *                  that the pinned tables admit at the omitted position — for
 *                  an omitted `permanentEnchant`, the rows whose permanent
 *                  inventory-type mask includes the item's pinned inventory
 *                  type plus the rows with NO pinned placement; for an omitted
 *                  `gems` key, every gem-borne row (no socket model excludes
 *                  any of them)
 *     behaviour    each row's SimulationCraft reading as the extractor
 *                  derived and the validator re-derived it: the sub-action's
 *                  lane (`use_item_t` sets trigger_gcd to zero for EVERY item
 *                  sub-action, player.cpp:10000, so the lane is NON_GCD by
 *                  construction), the cast time of the action it would build,
 *                  the cooldown it would start, and what it would write
 *     policy       what the pinned Protection list can observe
 *
 * THE POLICY, AND WHY DAMAGE IS NOT INERT HERE. A stat buff or an absorb is
 * unobservable: no atom of the pinned list reads a stat or an absorb, and
 * triggering a buff fires no proc callback. A damage, heal or attack ACTION
 * is different: under the Lightsmith talent Divine Inspiration the Paladin
 * registers an RPPM callback on PF_MELEE_ABILITY | PF_RANGED |
 * PF_RANGED_ABILITY | PF_NONE_HARMFUL | PF_MAGIC_SPELL | PF_ALL_HEAL that
 * casts a Sacred Weapon armament (sc_paladin.cpp:4108-4137), which writes
 * `next_armament` and `buff.sacred_weapon` — atoms `default[9]` and
 * `default[14]` read. A generic proc action executed at the instant of use
 * can land at that instant, so with Divine Inspiration SELECTED (or not
 * disproved) any damage/heal/attack candidate is observable. A resource
 * action is observable outright: it could be Holy Power.
 */

import type { GearPiece } from "../../../engine/normalization/normalized-events.js";
import type { ItemEffectIdentity } from "../../../data/game/item-effect-artifact.js";
import type { UseProducingEnchantRow } from "../../../data/game/enchant-effect-artifact.js";
import type { ObservedTalentEntry, TalentSelection } from "../../../data/game/talent-selection.js";
import { pinnedProtectionPaladinEnchantEffects } from "../../../data/game/paladin-protection-enchant-effects.js";
import { protectionItemEffectForItemId } from "../../../data/game/paladin-protection-item-effects.js";
import { protectionHeroTrees } from "../../../data/game/paladin-protection-talents.js";
import {
  proveSubactionIdentityIrrelevant,
  type SubactionCandidate,
  type SubactionEquivalence,
  type SubactionEquivalencePolicy,
  type SubactionWrite,
} from "../../../simc/subaction-equivalence.js";
import { isEmptyGearSlot } from "../../../engine/normalization/combatant-info.js";

/** The Lightsmith hero entry whose callback makes generic damage observable. */
export const DIVINE_INSPIRATION_DISPLAY_NAME = "Divine Inspiration";

/**
 * A hero-tree entry's selection from the observed tree. SELECTED when its
 * entry is present; otherwise UNKNOWN — a hero node has no sibling entry to
 * disprove it with, and an absent node is never read as "not taken".
 */
export function resolveProtectionHeroEntry(
  observedEntries: readonly ObservedTalentEntry[],
  displayNameEn: string,
): { readonly selection: TalentSelection; readonly traitEntryId: number | null } {
  for (const tree of protectionHeroTrees()) {
    const entry = tree.entries.find((candidate) => candidate.displayNameEn === displayNameEn);
    if (entry === undefined) continue;
    const observed = observedEntries.some((observedEntry) => observedEntry.id === entry.traitEntryId);
    return { selection: observed ? "SELECTED" : "UNKNOWN", traitEntryId: entry.traitEntryId };
  }
  return { selection: "UNKNOWN", traitEntryId: null };
}

/** The sub-action a universe row would build, in the shared proof's vocabulary. */
export function candidateFromUniverseRow(row: UseProducingEnchantRow): SubactionCandidate {
  const writes: SubactionWrite[] = [];
  const times: number[] = [];
  const cooldowns: number[] = [];
  let established = true;
  for (const driver of row.drivers) {
    if (!driver.resolved) {
      writes.push("UNRESOLVED");
      established = false;
      continue;
    }
    if (driver.scriptedIn.length > 0) writes.push("SCRIPTED_UNREVIEWED");
    const { generic } = driver;
    if (generic.buffType === "STAT") writes.push("PLAYER_STAT_BUFF");
    if (generic.buffType === "ABSORB") writes.push("ABSORB_BUFF");
    if (generic.actionType === "SPELL") writes.push("DAMAGE_ACTION");
    if (generic.actionType === "HEAL") writes.push("HEAL_ACTION");
    if (generic.actionType === "ATTACK") writes.push("ATTACK_ACTION");
    if (generic.actionType === "RESOURCE") writes.push("RESOURCE_ACTION");
    // use_item_t::execute_time() is the built action's execute time, or zero without one.
    if (generic.actionType === "NONE") times.push(0);
    else if (generic.actionCastTimeMs === null) established = false;
    else times.push(generic.actionCastTimeMs);
    // special_effect_t::cooldown(): driver cooldown, else internal cooldown, else zero.
    cooldowns.push(generic.effectiveCooldownMs);
  }
  return {
    id: `enchant:${String(row.enchantId)}`,
    lane: "NON_GCD",
    timeAdvanceMs: established ? Math.max(0, ...times) : null,
    cooldownMs: established ? Math.min(...cooldowns) : null,
    writes,
  };
}

/** What the pinned Protection list can observe, given the Divine Inspiration selection. */
export function protectionSubactionPolicy(divineInspiration: TalentSelection): SubactionEquivalencePolicy {
  return {
    writeIsObservable: (write) => {
      switch (write) {
        case "PLAYER_STAT_BUFF":
        case "ABSORB_BUFF":
          return false;
        case "DAMAGE_ACTION":
        case "HEAL_ACTION":
        case "ATTACK_ACTION":
          return divineInspiration !== "NOT_SELECTED";
        case "RESOURCE_ACTION":
        case "SCRIPTED_UNREVIEWED":
        case "UNRESOLVED":
          return true;
      }
    },
  };
}

export type OmittedGearField = "permanentEnchant" | "gems";

/** The universe rows the pinned tables admit at one omitted position. Deterministic: artifact order. */
export function candidateRowsFor(
  field: OmittedGearField,
  inventoryType: number,
): readonly UseProducingEnchantRow[] {
  const load = pinnedProtectionPaladinEnchantEffects();
  if (!load.ok) return [];
  const rows = load.artifact.useEffectUniverse.useProducingRows;
  if (field === "gems") return rows.filter((row) => row.gemBorne);
  const bit = 1 << inventoryType;
  return rows.filter(
    (row) =>
      !row.placementKnown || (row.permanent ?? []).some((entry) => (entry.maskInventoryType & bit) !== 0),
  );
}

export interface CandidateMatrixRow {
  readonly slotIndex: number;
  readonly itemId: number;
  readonly inventoryType: number | null;
  readonly unknownField: OmittedGearField;
  readonly candidateEnchantIds: readonly number[];
  readonly lanes: readonly SubactionCandidate["lane"][];
  readonly writes: readonly SubactionWrite[];
  readonly verdict: SubactionEquivalence;
}

/**
 * The deterministic matrix over one gear array: one row per UNKNOWN
 * `permanentEnchant` / `gems` identity on a worn, pinned item, with the candidate
 * set the pinned build admits and the shared proof's verdict under the
 * given Divine Inspiration selection. Generated from the artifacts on every
 * call; nothing is maintained by hand.
 */
export function subactionCandidateMatrix(
  gear: readonly GearPiece[],
  divineInspiration: TalentSelection,
): readonly CandidateMatrixRow[] {
  const policy = protectionSubactionPolicy(divineInspiration);
  const matrix: CandidateMatrixRow[] = [];
  for (const piece of gear) {
    if (isEmptyGearSlot(piece)) continue;
    const identity: ItemEffectIdentity | null = protectionItemEffectForItemId(piece.itemId);
    // Only a genuinely UNKNOWN identity is a question for the proof; a KNOWN_NONE
    // (omitted under the dated contract) or KNOWN identity is not.
    const fields: OmittedGearField[] = [];
    if (piece.permanentEnchant.state === "UNKNOWN") fields.push("permanentEnchant");
    if (piece.gems.state === "UNKNOWN") fields.push("gems");
    for (const field of fields) {
      const inventoryType = identity?.inventoryType ?? null;
      const rows =
        inventoryType === null && field === "permanentEnchant"
          ? []
          : candidateRowsFor(field, inventoryType ?? 0);
      const candidates = rows.map(candidateFromUniverseRow);
      const verdict =
        inventoryType === null && field === "permanentEnchant"
          ? ({ kind: "NO_CANDIDATES" } as const)
          : proveSubactionIdentityIrrelevant(candidates, policy);
      matrix.push({
        slotIndex: piece.slotIndex,
        itemId: piece.itemId,
        inventoryType,
        unknownField: field,
        candidateEnchantIds: rows.map((row) => row.enchantId),
        lanes: [...new Set(candidates.map((candidate) => candidate.lane))],
        writes: [...new Set(candidates.flatMap((candidate) => candidate.writes))],
        verdict,
      });
    }
  }
  return matrix;
}

/** One line per blocking candidate, for a refusal detail. */
export function describeBlocking(verdict: SubactionEquivalence): string {
  if (verdict.kind !== "IDENTITY_DECISION_RELEVANT") return verdict.kind;
  return verdict.blocking.map((entry) => `${entry.id}[${entry.defects.join(",")}]`).join(" ");
}
