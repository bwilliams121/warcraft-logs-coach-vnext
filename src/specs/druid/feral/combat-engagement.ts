/**
 * What the actor's own casts establish about combat, and Prowl's readiness (ONB-C1).
 *
 * THE PINNED GUARD. `prowl_t::ready` (sc_druid.cpp:7990-7996):
 *
 *     if ( buff.prowl up || ( in_combat && !buff.incarnation_cat_prowl up ) )  return false;
 *
 * IN COMBAT is established POSITIVELY: a harmful action enters combat (action.cpp:1841) and,
 * in an encounter, nothing leaves it again. Prowl and Shadowmeld leave combat only outside a
 * boss encounter (sc_druid.cpp:7986-7987, player.cpp:9038), and `in_boss_encounter` is set for
 * every fight style but the two dungeon ones (player.cpp:6661-6664). So one observed harmful
 * cast STRICTLY before the decision is enough. A same-millisecond cast orders nothing, and no
 * earlier cast proves nothing: the first decision of a fight stays open. This project analyses
 * raid encounters, and a Mythic+ target would have to revisit this file.
 *
 * THE INCARNATION BUFF HAS NO DURATION. `buff.incarnation_cat_prowl` is spell 102547, whose
 * duration is -1 (sc_druid.cpp:11284-11286, sc_spell_data.inc). Pressing Incarnation raises it
 * (:3955) and only Prowl's own execute ends it (:7979). The log never reports it: actor 170 has 4
 * Incarnation casts and no 102547. So it is reasoned about from the presses:
 *
 *     Incarnation proven not taken                             down: never raised
 *     taken, COMPLETE cast coverage, a Prowl after the last    down: spent
 *       press, or any Prowl where no press is observed
 *     anything else                                            NOT ESTABLISHED
 *
 * NO PRESS IS NOT A PROOF. A press before the pull leaves no event in the fight, and the buff outlives
 * its Incarnation, so a fight with no press and no Prowl could still hold it. Only a positive observation
 * that it was spent closes the line. The pinned precombat list never presses it, which says what the list
 * would do and nothing about what the player did.
 *
 * A CAST WITH NO KNOWN OWNER COUNTS AGAINST THE PROOF. The cast decoder accepts a missing source, so a
 * cast with no source could be this actor's. With no ability id or Incarnation's id, it could be a press,
 * and it blocks from then on. It is never counted as this actor's Prowl or harmful cast.
 *
 * THE SAME CASTS BREAK STEALTH. A foreground action without `ALLOWSTEALTH` expires both stealth
 * buffs (sc_druid.cpp:1874-1881), and `SX_NO_STEALTH_BREAK` is clear on every token below in the
 * pinned spell data. `aura-bindings.ts` reads that.
 */

import { inclusiveRange } from "../../../engine/evidence/coverage.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import { gateAbsenceClaim } from "../../../engine/state/state-result.js";
import type { TalentResolution } from "../../../data/game/talent-selection.js";

/**
 * The list's harmful tokens. Each is built on `cat_attack_t`, with `harmful` left true, and its spell
 * clears `SX_NO_STEALTH_BREAK` (attribute bit 37). Tiger's Fury and Berserk set `harmful = false`
 * (sc_druid.cpp:3923, :4859) and are not here, and neither is any spell no list line names.
 */
export const FERAL_HARMFUL_TOKENS: readonly string[] = Object.freeze([
  "rake",
  "rip",
  "shred",
  "ferocious_bite",
  "swipe_cat",
  "primal_wrath",
  "moonfire_cat",
  "feral_frenzy",
  "frantic_frenzy",
  "chomp",
]);

export const INCARNATION_CAST_SPELL_ID = 102543;
export const PROWL_CAST_SPELL_ID = 5215;

/** The times of the actor's own casts this module reads, each ascending. */
export interface FeralCastFacts {
  readonly actorId: number;
  readonly fightStartMs: number;
  readonly harmfulCastMs: readonly number[];
  readonly incarnationCastMs: readonly number[];
  readonly prowlCastMs: readonly number[];
  /** Casts that could be this actor's press: its own with no ability id, and any with no source that could be Incarnation. */
  readonly unidentifiedCastMs: readonly number[];
}

export function feralCastFactsFrom(
  state: CombatState,
  actorId: number,
  tokens: ReadonlyMap<number, string>,
): FeralCastFacts {
  const harmfulCastMs: number[] = [];
  const incarnationCastMs: number[] = [];
  const prowlCastMs: number[] = [];
  const unidentifiedCastMs: number[] = [];
  for (const position of state.positionsOfKind("CAST")) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    if (event.source === null) {
      if (event.abilityGameId === null || event.abilityGameId === INCARNATION_CAST_SPELL_ID) {
        unidentifiedCastMs.push(event.reportTimeMs);
      }
      continue;
    }
    if (event.source.actorId !== actorId) continue;
    if (event.abilityGameId === null) {
      unidentifiedCastMs.push(event.reportTimeMs);
      continue;
    }
    if (event.abilityGameId === INCARNATION_CAST_SPELL_ID) incarnationCastMs.push(event.reportTimeMs);
    if (event.abilityGameId === PROWL_CAST_SPELL_ID) prowlCastMs.push(event.reportTimeMs);
    const token = tokens.get(event.abilityGameId);
    if (token !== undefined && FERAL_HARMFUL_TOKENS.includes(token)) harmfulCastMs.push(event.reportTimeMs);
  }
  return {
    actorId,
    fightStartMs: state.fight.fight.startTimeMs,
    harmfulCastMs,
    incarnationCastMs,
    prowlCastMs,
    unidentifiedCastMs,
  };
}

/** Whether a harmful cast of the actor's is observed strictly before the decision's millisecond. */
export function engagedBefore(facts: FeralCastFacts, decisionMs: number): boolean {
  const first = facts.harmfulCastMs[0];
  return first !== undefined && first < decisionMs;
}

export type ProwlReadiness =
  | { readonly state: "NOT_READY"; readonly basis: string }
  | { readonly state: "NOT_ESTABLISHED"; readonly reason: ProwlNotEstablishedReason };

export type ProwlNotEstablishedReason =
  /** No harmful cast of the actor's is observed before this decision. */
  | "NOT_ENGAGED"
  /** The Incarnation node does not resolve in the observed tree. */
  | "INCARNATION_NOT_RESOLVED"
  /** Absence of a press needs cast coverage this fight does not have. */
  | "CAST_COVERAGE_NOT_COMPLETE"
  /** A cast with no ability id could be a press. */
  | "CAST_IDENTITY_NOT_ESTABLISHED"
  /** No Prowl is observed to have spent it, whether or not a press is observed: the free Prowl may be available. */
  | "INCARNATION_PROWL_MAY_BE_AVAILABLE";

export interface ProwlReadinessInput {
  readonly state: CombatState;
  readonly facts: FeralCastFacts;
  readonly decisionMs: number;
  readonly incarnation: TalentResolution | undefined;
  readonly incarnationProvenAbsent: boolean;
}

/** Whether `prowl_t::ready` is proven false at one decision. Never proven true. */
export function prowlReadinessAt(input: ProwlReadinessInput): ProwlReadiness {
  const { facts, decisionMs, state } = input;
  if (!engagedBefore(facts, decisionMs)) return { state: "NOT_ESTABLISHED", reason: "NOT_ENGAGED" };
  if (input.incarnationProvenAbsent) {
    return {
      state: "NOT_READY",
      basis: "in combat, and Incarnation is proven not taken, so its free Prowl was never raised",
    };
  }
  if (input.incarnation?.selection !== "SELECTED") {
    return { state: "NOT_ESTABLISHED", reason: "INCARNATION_NOT_RESOLVED" };
  }

  const category = state.fight.completeness.categories.CASTS;
  if (category.capability !== "OBSERVABLE" || category.coverage.state !== "COMPLETE") {
    return { state: "NOT_ESTABLISHED", reason: "CAST_COVERAGE_NOT_COMPLETE" };
  }
  const gate = gateAbsenceClaim({
    completeness: state.fight.completeness,
    category: "CASTS",
    range: inclusiveRange(facts.fightStartMs, decisionMs),
    actorId: facts.actorId,
  });
  if (!gate.ok) return { state: "NOT_ESTABLISHED", reason: "CAST_COVERAGE_NOT_COMPLETE" };
  if (facts.unidentifiedCastMs.some((ms) => ms <= decisionMs)) {
    return { state: "NOT_ESTABLISHED", reason: "CAST_IDENTITY_NOT_ESTABLISHED" };
  }

  const presses = facts.incarnationCastMs.filter((ms) => ms <= decisionMs);
  const lastPress = presses[presses.length - 1];
  if (facts.prowlCastMs.some((ms) => (lastPress === undefined || ms > lastPress) && ms < decisionMs)) {
    return { state: "NOT_READY", basis: "in combat, and a Prowl with no later Incarnation press spent it" };
  }
  return { state: "NOT_ESTABLISHED", reason: "INCARNATION_PROWL_MAY_BE_AVAILABLE" };
}
