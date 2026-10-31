/**
 * Resolving a normalized raid cooldown plan against one analyzed fight (M12-E).
 *
 * Shared and fact-only. It answers three questions and nothing about gameplay:
 *
 * 1. Is the plan for this fight? Encounter id AND difficulty must both equal
 *    the fight's. A mismatch is never applied; a fight with no reported
 *    difficulty cannot be bound, so the binding is UNKNOWN.
 * 2. Which roster player does an assignment name? Exactly one match, or
 *    unresolved with the reason. Never by class, specialization, fuzzy match
 *    or alias.
 * 3. When, in report time, is the assignment planned? FIGHT_RELATIVE resolves
 *    from the pull. PHASE_RELATIVE needs the plan's phase label mapped to the
 *    fight's observed phase boundary, and no reviewed label map exists in v1
 *    (agent/follow-ups.md "After M12-E"), so it stays unresolved. A phase
 *    boundary is never guessed.
 *
 * It holds no `if spec === ...`: which assignments matter, and what an
 * unresolved one means, is the consuming specialization evaluator's decision.
 */

import type { CombatFight } from "../engine/normalization/combat-fight.js";
import type { RaidCooldownAssignment, RaidCooldownPlan } from "./raid-cooldown-plan.js";

export type EncounterBinding =
  | { readonly state: "MATCHED" }
  | {
      readonly state: "MISMATCHED";
      readonly planned: RaidCooldownPlan["encounter"];
      readonly observed: { readonly encounterId: number; readonly difficulty: number | null };
    }
  | { readonly state: "UNKNOWN"; readonly reason: "FIGHT_DIFFICULTY_NOT_REPORTED" };

/** Binds a plan to a fight's encounter id and Warcraft Logs difficulty id, verbatim. */
export function encounterBindingOf(
  planned: RaidCooldownPlan["encounter"],
  observed: { readonly encounterId: number; readonly difficulty: number | null },
): EncounterBinding {
  // A different encounter is a mismatch whatever the difficulty says.
  if (planned.encounterId !== observed.encounterId) {
    return { state: "MISMATCHED", planned, observed };
  }
  if (observed.difficulty === null) return { state: "UNKNOWN", reason: "FIGHT_DIFFICULTY_NOT_REPORTED" };
  return planned.difficulty === observed.difficulty
    ? { state: "MATCHED" }
    : { state: "MISMATCHED", planned, observed };
}

export type PlayerResolution =
  | { readonly state: "RESOLVED"; readonly actorId: number }
  | {
      readonly state: "UNRESOLVED";
      /**
       * ROSTER_NOT_IN_SCOPE  the fight was retrieved without the FULL_RAID
       *                      roster, so uniqueness cannot be established.
       * ROSTER_NAMES_INCOMPLETE  a roster player has no name or realm where one
       *                      is needed, so a match cannot be proven unique.
       * NO_MATCH             no roster player has that name (and realm).
       * AMBIGUOUS            several do.
       */
      readonly reason: "ROSTER_NOT_IN_SCOPE" | "ROSTER_NAMES_INCOMPLETE" | "NO_MATCH" | "AMBIGUOUS";
      /** Roster players whose known name matches. Context only: none is chosen. */
      readonly candidateActorIds: readonly number[];
    };

export type PlannedTimeResolution =
  | { readonly state: "RESOLVED"; readonly plannedReportTimeMs: number }
  | { readonly state: "UNRESOLVED"; readonly reason: "PHASE_LABEL_NOT_MAPPED" };

export interface ResolvedAssignment {
  readonly assignment: RaidCooldownAssignment;
  readonly player: PlayerResolution;
  readonly time: PlannedTimeResolution;
}

export type ResolvedRaidCooldownPlan =
  | {
      readonly state: "BOUND";
      readonly plan: RaidCooldownPlan;
      /** Every assignment of the plan, in plan order. */
      readonly assignments: readonly ResolvedAssignment[];
    }
  | {
      /** Not applied to this fight: no assignment is resolved. */
      readonly state: "NOT_BOUND";
      readonly plan: RaidCooldownPlan;
      readonly binding: Exclude<EncounterBinding, { state: "MATCHED" }>;
    };

/**
 * World of Warcraft compares character names case-insensitively. NFC keeps
 * canonically equal spellings equal; nothing else is folded, so "Jymblú" and
 * "Jymblu" are different players.
 */
function nameKey(value: string): string {
  return value.normalize("NFC").toLowerCase();
}

/** Whether two character names are the same name under World of Warcraft's case rule. */
export function namesMatch(a: string, b: string): boolean {
  return nameKey(a) === nameKey(b);
}

function resolvePlayer(fight: CombatFight, player: RaidCooldownAssignment["player"]): PlayerResolution {
  const unresolved = (
    reason: Extract<PlayerResolution, { state: "UNRESOLVED" }>["reason"],
    candidateActorIds: readonly number[],
  ): PlayerResolution => ({ state: "UNRESOLVED", reason, candidateActorIds });
  if (fight.breadth.scope !== "FULL_RAID") return unresolved("ROSTER_NOT_IN_SCOPE", []);

  const roster = [...new Set(fight.breadth.friendlyActorsInScope)].sort((a, b) => a - b);
  const wanted = nameKey(player.name);
  let unnamed = false;
  const byName: { readonly actorId: number; readonly server: string | null }[] = [];
  for (const actorId of roster) {
    const actor = fight.actors.get(actorId);
    if (actor === undefined || actor.name === null) {
      unnamed = true;
      continue;
    }
    if (nameKey(actor.name) === wanted) byName.push({ actorId, server: actor.server });
  }
  const candidates = byName.map((entry) => entry.actorId);
  // An unnamed roster player could carry the same name: no match is provably unique, and none provably absent.
  if (unnamed) return unresolved("ROSTER_NAMES_INCOMPLETE", candidates);

  if (player.realm === null) {
    if (byName.length === 0) return unresolved("NO_MATCH", candidates);
    if (byName.length > 1) return unresolved("AMBIGUOUS", candidates);
    return { state: "RESOLVED", actorId: byName[0]!.actorId };
  }
  // Realms are compared exactly, case aside: a note's "TwistedNether" is not
  // matched to "Twisted Nether" by guessing which spelling was meant.
  const realm = nameKey(player.realm);
  if (byName.some((entry) => entry.server === null)) return unresolved("ROSTER_NAMES_INCOMPLETE", candidates);
  const exact = byName.filter((entry) => entry.server !== null && nameKey(entry.server) === realm);
  if (exact.length === 0) return unresolved("NO_MATCH", candidates);
  if (exact.length > 1) return unresolved("AMBIGUOUS", candidates);
  return { state: "RESOLVED", actorId: exact[0]!.actorId };
}

function resolveTime(fight: CombatFight, assignment: RaidCooldownAssignment): PlannedTimeResolution {
  const planned = assignment.plannedTime;
  switch (planned.kind) {
    case "FIGHT_RELATIVE":
      return { state: "RESOLVED", plannedReportTimeMs: fight.fight.startTimeMs + planned.offsetMs };
    case "PHASE_RELATIVE":
      // No reviewed map from a plan's phase label to the fight's observed
      // phases exists. "2" is not assumed to be Warcraft Logs phase 2, and
      // "2.5" names no Warcraft Logs phase at all.
      return { state: "UNRESOLVED", reason: "PHASE_LABEL_NOT_MAPPED" };
    default:
      return planned satisfies never;
  }
}

/** Resolves a plan against one fight. Pure. An unbound plan resolves no assignment. */
export function resolveRaidCooldownPlan(
  plan: RaidCooldownPlan,
  fight: CombatFight,
): ResolvedRaidCooldownPlan {
  const binding = encounterBindingOf(plan.encounter, {
    encounterId: fight.fight.encounterId,
    difficulty: fight.fight.difficulty,
  });
  if (binding.state !== "MATCHED") return { state: "NOT_BOUND", plan, binding };
  return {
    state: "BOUND",
    plan,
    assignments: plan.assignments.map((assignment) => ({
      assignment,
      player: resolvePlayer(fight, assignment.player),
      time: resolveTime(fight, assignment),
    })),
  };
}
