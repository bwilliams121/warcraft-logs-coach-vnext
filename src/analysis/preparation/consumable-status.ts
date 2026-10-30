/**
 * PREPARATION: the consumable status every analysis report must carry
 * (CLAUDE.md "Always-Report Consumables"): health potion, healthstone and
 * combat potion use by one player in one fight.
 *
 * A SHARED, PARALLEL finding producer. It reads only the normalized fight and
 * the pinned identity data. It never reads a specialization evaluator's
 * result, so it answers the same way whether gameplay evaluation ran, was
 * unsupported, or was blocked.
 *
 * What a status claims:
 *
 *   OBSERVED  `count` uses, and the count is complete. A count of 0 is a valid
 *             observed fact only here, under COMPLETE coverage for the player
 *             over the whole fight.
 *   UNKNOWN   the count cannot be established. `observedAtLeast` is the uses
 *             actually seen (a lower bound, never a count), and every reason
 *             is kept.
 *
 * How uses are found:
 *
 * - Every kind: the player's completed casts of a classified spell inside
 *   the fight. This needs COMPLETE cast coverage for the player.
 * - COMBAT_POTION also counts a potion taken BEFORE the pull. Its cast lies
 *   outside the fight, so it is visible only as a buff removal with no
 *   application (and no cast) in the fight. The removal is a use either way.
 *   Its timing is BEFORE_PULL only under COMPLETE cast AND aura coverage;
 *   otherwise the missing cast or application could sit in a gap, and the
 *   timing is UNRESOLVED. A complete count also needs the fight to last at
 *   least as long as the longest combat-potion buff: otherwise a pre-pull
 *   buff could outlast the fight unseen.
 *
 * Fail-closed:
 * - a completed player cast of a spell OUTSIDE the identity data whose
 *   Warcraft Logs ability name says "Potion" or "Healthstone" makes the
 *   affected kinds UNKNOWN (UNCLASSIFIED_CANDIDATE), rather than letting a
 *   consumable newer than the data read as no use;
 * - so does a buff on the player outside the identity data whose name says
 *   "Potion". This affects the combat potion: an unknown pre-pull potion is
 *   seen only as its buff;
 * - identity data that fails validation makes every kind UNKNOWN.
 *
 * Authority: the uses are observed Warcraft Logs facts (WCL_OBSERVED_FACT);
 * which spell is which consumable is runtime game data (RUNTIME_GAME_DATA),
 * named with its revision. Racial abilities are never classified (the
 * extractor excludes them).
 */

import {
  loadPreparationConsumables,
  type PreparationConsumableKind,
  type PreparationConsumablesLoad,
} from "../../data/game/preparation-consumables.js";
import { inclusiveRange } from "../../engine/evidence/coverage.js";
import type { EvidenceLocator } from "../../engine/evidence/locator.js";
import type { CombatFight } from "../../engine/normalization/combat-fight.js";
import type { AuraEvent, CastEvent, CombatEvent } from "../../engine/normalization/normalized-events.js";
import { gateAbsenceClaim, type UnknownReason } from "../../engine/state/state-result.js";

export const CONSUMABLE_STATUS_REVISION = "preparation-consumable-status/1" as const;

/**
 * UNRESOLVED: a combat-potion buff removal with no in-fight cast or
 * application seen, under incomplete coverage. It is a use, but whether it
 * was taken before the pull cannot be shown.
 */
export const CONSUMABLE_USE_TIMINGS = ["IN_FIGHT", "BEFORE_PULL", "UNRESOLVED"] as const;
export type ConsumableUseTiming = (typeof CONSUMABLE_USE_TIMINGS)[number];

/** Every UNKNOWN reason code this producer can emit (pinned equal to the public enum). */
export const CONSUMABLE_UNKNOWN_CODES = [
  "CAST_COVERAGE",
  "AURA_COVERAGE",
  "FIGHT_SHORTER_THAN_LONGEST_COMBAT_POTION_BUFF",
  "UNCLASSIFIED_CANDIDATE",
  "IDENTITY_DATA_UNAVAILABLE",
] as const;

export interface ConsumableUse {
  readonly spellId: number;
  readonly name: string;
  readonly timing: ConsumableUseTiming;
  /** The cast (IN_FIGHT), or the buff removal that reveals the use (BEFORE_PULL / UNRESOLVED). */
  readonly evidence: EvidenceLocator;
}

export type ConsumableUnknownReason =
  | { readonly code: "CAST_COVERAGE"; readonly gate: UnknownReason }
  | { readonly code: "AURA_COVERAGE"; readonly gate: UnknownReason }
  | {
      readonly code: "FIGHT_SHORTER_THAN_LONGEST_COMBAT_POTION_BUFF";
      readonly fightDurationMs: number;
      readonly longestBuffMs: number;
    }
  | { readonly code: "UNCLASSIFIED_CANDIDATE"; readonly spellId: number; readonly abilityName: string }
  | { readonly code: "IDENTITY_DATA_UNAVAILABLE"; readonly detail: string };

export type ConsumableStatus =
  | { readonly state: "OBSERVED"; readonly count: number; readonly uses: readonly ConsumableUse[] }
  | {
      readonly state: "UNKNOWN";
      readonly reasons: readonly ConsumableUnknownReason[];
      readonly observedAtLeast: number;
      readonly uses: readonly ConsumableUse[];
    };

export interface ConsumableStatusReport {
  readonly revision: typeof CONSUMABLE_STATUS_REVISION;
  readonly category: "PREPARATION";
  readonly authority: "WCL_OBSERVED_FACT";
  /** The identity data that named the spells, or null when it failed to load. */
  readonly identityData: {
    readonly authority: "RUNTIME_GAME_DATA";
    readonly artifactRevision: string;
    readonly clientDataWowVersion: string;
  } | null;
  readonly actorId: number;
  /** All three, always. A kind is never omitted. */
  readonly statuses: { readonly [K in PreparationConsumableKind]: ConsumableStatus };
}

const CANDIDATE_NAME = /\b(potion|healthstone)\b/i;
const POTION_NAME = /\bpotion\b/i;

function chronological(events: readonly CombatEvent[]): CombatEvent[] {
  return [...events].sort(
    (a, b) => a.reportTimeMs - b.reportTimeMs || a.ingestionOrdinal - b.ingestionOrdinal,
  );
}

export function assessConsumableStatus(
  fight: CombatFight,
  actorId: number,
  identities: PreparationConsumablesLoad = loadPreparationConsumables(),
): ConsumableStatusReport {
  const base = {
    revision: CONSUMABLE_STATUS_REVISION,
    category: "PREPARATION" as const,
    authority: "WCL_OBSERVED_FACT" as const,
    actorId,
  };
  if (!identities.ok) {
    const unknown: ConsumableStatus = {
      state: "UNKNOWN",
      reasons: [{ code: "IDENTITY_DATA_UNAVAILABLE", detail: identities.detail }],
      observedAtLeast: 0,
      uses: [],
    };
    return {
      ...base,
      identityData: null,
      statuses: { HEALTH_POTION: unknown, HEALTHSTONE: unknown, COMBAT_POTION: unknown },
    };
  }

  const { startTimeMs, endTimeMs, durationMs } = fight.fight;
  const inFight = (event: CombatEvent) =>
    !event.outsideRequestedRange && event.reportTimeMs >= startTimeMs && event.reportTimeMs <= endTimeMs;
  const range = inclusiveRange(startTimeMs, endTimeMs);
  const castGate = gateAbsenceClaim({ completeness: fight.completeness, category: "CASTS", range, actorId });
  const auraGate = gateAbsenceClaim({ completeness: fight.completeness, category: "AURAS", range, actorId });

  const uses: Record<PreparationConsumableKind, ConsumableUse[]> = {
    HEALTH_POTION: [],
    HEALTHSTONE: [],
    COMBAT_POTION: [],
  };
  const candidates: Record<PreparationConsumableKind, ConsumableUnknownReason[]> = {
    HEALTH_POTION: [],
    HEALTHSTONE: [],
    COMBAT_POTION: [],
  };
  // Combat-potion buffs currently open on the player: opened by a cast or an
  // application inside the fight. A removal with none open is a use taken
  // before the pull — provably so only when no in-fight cast or application
  // could be missing from the evidence.
  const openCombatBuffs = new Set<number>();
  const unmatchedRemovalTiming: ConsumableUseTiming =
    castGate.ok && auraGate.ok ? "BEFORE_PULL" : "UNRESOLVED";
  const auraCandidates = new Set<number>();

  for (const event of chronological(fight.events)) {
    if (!inFight(event) || event.abilityGameId === null) continue;
    const spellId = event.abilityGameId;
    const identity = identities.bySpellId.get(spellId);

    if (event.kind === "CAST" && isPlayerCompletedCast(event, actorId)) {
      if (identity === undefined) {
        const abilityName = fight.abilities.get(spellId)?.name ?? null;
        if (abilityName !== null && CANDIDATE_NAME.test(abilityName)) {
          const reason: ConsumableUnknownReason = { code: "UNCLASSIFIED_CANDIDATE", spellId, abilityName };
          const kinds: PreparationConsumableKind[] = /healthstone/i.test(abilityName)
            ? ["HEALTHSTONE"]
            : ["HEALTH_POTION", "COMBAT_POTION"];
          for (const kind of kinds) candidates[kind].push(reason);
        }
        continue;
      }
      uses[identity.kind].push({ spellId, name: identity.name, timing: "IN_FIGHT", evidence: event.locator });
      if (identity.kind === "COMBAT_POTION") openCombatBuffs.add(spellId);
      continue;
    }

    if (event.kind === "AURA" && identity === undefined && isPlayerBuff(event, actorId)) {
      const abilityName = fight.abilities.get(spellId)?.name ?? null;
      if (abilityName !== null && POTION_NAME.test(abilityName) && !auraCandidates.has(spellId)) {
        auraCandidates.add(spellId);
        candidates.COMBAT_POTION.push({ code: "UNCLASSIFIED_CANDIDATE", spellId, abilityName });
      }
      continue;
    }

    if (event.kind === "AURA" && identity?.kind === "COMBAT_POTION" && isPlayerBuff(event, actorId)) {
      if (event.operation === "REMOVED") {
        if (event.isStackChange) continue;
        if (!openCombatBuffs.has(spellId)) {
          uses.COMBAT_POTION.push({
            spellId,
            name: identity.name,
            timing: unmatchedRemovalTiming,
            evidence: event.locator,
          });
        }
        openCombatBuffs.delete(spellId);
      } else {
        openCombatBuffs.add(spellId);
      }
    }
  }

  const status = (kind: PreparationConsumableKind): ConsumableStatus => {
    const reasons: ConsumableUnknownReason[] = [];
    if (!castGate.ok) reasons.push({ code: "CAST_COVERAGE", gate: castGate.reason });
    if (kind === "COMBAT_POTION") {
      if (!auraGate.ok) reasons.push({ code: "AURA_COVERAGE", gate: auraGate.reason });
      if (durationMs < identities.maxCombatPotionAuraDurationMs) {
        reasons.push({
          code: "FIGHT_SHORTER_THAN_LONGEST_COMBAT_POTION_BUFF",
          fightDurationMs: durationMs,
          longestBuffMs: identities.maxCombatPotionAuraDurationMs,
        });
      }
    }
    reasons.push(...candidates[kind]);
    const observed = uses[kind];
    return reasons.length === 0
      ? { state: "OBSERVED", count: observed.length, uses: observed }
      : { state: "UNKNOWN", reasons, observedAtLeast: observed.length, uses: observed };
  };

  return {
    ...base,
    identityData: {
      authority: "RUNTIME_GAME_DATA",
      artifactRevision: identities.data.artifactRevision,
      clientDataWowVersion: identities.data.provenance.clientDataWowVersion,
    },
    statuses: {
      HEALTH_POTION: status("HEALTH_POTION"),
      HEALTHSTONE: status("HEALTHSTONE"),
      COMBAT_POTION: status("COMBAT_POTION"),
    },
  };
}

function isPlayerCompletedCast(event: CastEvent, actorId: number): boolean {
  return event.castPhase === "COMPLETE" && event.source?.actorId === actorId;
}

function isPlayerBuff(event: AuraEvent, actorId: number): boolean {
  return event.auraClass === "BUFF" && event.target?.actorId === actorId;
}
