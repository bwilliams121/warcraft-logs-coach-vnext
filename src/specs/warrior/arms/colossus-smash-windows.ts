/**
 * The Arms Warrior `colossus-smash-window-fill` observation (ONB-B1).
 *
 * THE QUESTION. Inside each Colossus Smash debuff window, which pinned single-target lines gated on
 * `debuff.colossus_smash.up` were pressed? It is a fact about the log, and the one thing this
 * slice can say over a real fight. It is NOT a verdict: nothing here says a window should have held a
 * press, because whether one was required is what the pinned list decides, and the list sits behind
 * a dispatch on the enemy count (ONB-S3).
 *
 * WHAT A WINDOW IS. One `208086` DEBUFF (sc_warrior.cpp:7475) applied by this actor on one enemy, from
 * its observed application to its observed removal. A refresh inside it does not open another. The log
 * also reports 208086 as a BUFF on the actor itself; direction and class are read from the event, so
 * that is not a window.
 *
 * WHEN IT IS NOT ESTABLISHED. An end or a start the evidence does not show is stated, and its presses
 * are `null` rather than zero: a capture that ends inside a window says nothing about what followed,
 * and a missing removal never extends a window. The same goes for a window whose continuity M4 will
 * not vouch for, or whose count could not be exact (`outOfEvidence`).
 *
 * WHAT A COUNT IS. Logged casts inside the window, by the actor, target unattributed: the retained
 * subject's Colossus Smash casts report target -1, so a press cannot be tied to one enemy, and one
 * press lands inside every enemy's window it overlaps. A logged cast may not be a press in general. Avatar and Bladestorm are never run as
 * background copies by the pinned module.
 */

import type { AuraObservation } from "../../../engine/auras/aura-observations.js";
import { fromSource } from "../../../engine/auras/aura-state.js";
import { inclusiveRange } from "../../../engine/evidence/coverage.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import { gateAbsenceClaim } from "../../../engine/state/state-result.js";
import { beforeEvent } from "../../../engine/state/temporal.js";
import type { AplAuthority } from "../../../simc/apl-authority.js";
import type { HeroTreeResolution } from "../../../data/game/talent-selection.js";
import { armsWarriorTokenBinding } from "../../../data/game/warrior-arms-gcd-semantics.js";

/** `spell.colossus_smash_debuff = find_spell( 208086 )`, sc_warrior.cpp:7475. */
export const COLOSSUS_SMASH_DEBUFF_SPELL_ID = 208086;

/** The condition text the question asks about, read off the pinned list and not copied from it. */
const GATE_TEXT = "debuff.colossus_smash.up";

/** Each hero tree's single-target list, from the pinned dispatch. */
const SINGLE_TARGET_LIST: Readonly<Record<string, string>> = Object.freeze({
  slayer: "slayer_st",
  colossus: "colossus_st",
});

export interface GatedLinePresses {
  readonly actionToken: string;
  /** Every line of the list naming this token behind the gate, as `list[ordinal]`. */
  readonly entries: readonly string[];
  readonly castCount: number;
}

export type ColossusSmashWindowOutOfEvidence =
  | "NO_REMOVAL_OBSERVED"
  | "NO_APPLICATION_OBSERVED"
  | "CAST_COVERAGE_NOT_COMPLETE"
  | "CAST_IDENTITY_NOT_ESTABLISHED"
  | "EDGE_ORDER_NOT_ESTABLISHED"
  | "CONTINUITY_NOT_ESTABLISHED";

export type ColossusSmashWindow =
  | {
      readonly state: "ESTABLISHED";
      readonly targetActorId: number;
      readonly targetInstanceId: number | null;
      readonly appliedAtMs: number;
      readonly removedAtMs: number;
      readonly presses: readonly GatedLinePresses[];
    }
  | {
      readonly state: "NOT_ESTABLISHED";
      readonly reason: ColossusSmashWindowOutOfEvidence;
      readonly targetActorId: number;
      readonly targetInstanceId: number | null;
      readonly appliedAtMs: number | null;
      readonly removedAtMs: number | null;
      /** Never zero: what the evidence does not show is not an absence of casts. */
      readonly presses: null;
    };

export type ColossusSmashWindowFill =
  | {
      readonly status: "OBSERVED";
      readonly singleTargetList: string;
      readonly gatedTokens: readonly string[];
      readonly windows: readonly ColossusSmashWindow[];
    }
  /** Which list the question is about depends on the hero tree. No tree, no question. */
  | { readonly status: "HERO_TREE_NOT_RESOLVED"; readonly windows: readonly [] };

interface GatedToken {
  readonly actionToken: string;
  readonly entries: readonly string[];
  readonly abilityIds: readonly number[];
}

function gatedTokensOf(authority: AplAuthority, listName: string): readonly GatedToken[] {
  const entries = new Map<string, string[]>();
  for (const action of authority.actions) {
    if (action.listName !== listName || action.conditionRaw?.includes(GATE_TEXT) !== true) continue;
    const label = `${action.listName}[${String(action.priorityOrdinal)}]`;
    entries.set(action.actionToken, [...(entries.get(action.actionToken) ?? []), label]);
  }
  return [...entries].map(([actionToken, labels]) => {
    const binding = armsWarriorTokenBinding(actionToken);
    const abilityIds =
      binding.kind === "KNOWN_ONE"
        ? [binding.abilityGameId]
        : binding.kind === "KNOWN_SET"
          ? binding.abilityGameIds
          : [];
    return { actionToken, entries: labels, abilityIds };
  });
}

/** The actor's logged casts of each gated token, and every cast that could be one and cannot be read. */
interface CastEvidence {
  readonly byToken: ReadonlyMap<string, readonly number[]>;
  readonly unresolved: readonly number[];
}

function castEvidenceOf(state: CombatState, actorId: number, tokens: readonly GatedToken[]): CastEvidence {
  const tokenOf = new Map(tokens.flatMap((token) => token.abilityIds.map((id) => [id, token] as const)));
  const byToken = new Map<string, number[]>(tokens.map((token) => [token.actionToken, []]));
  const unresolved: number[] = [];
  for (const position of state.positionsOfKind("CAST")) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    const ability = event.abilityGameId;
    if (event.source === null) {
      // A cast with no source might be this actor's, if its ability is one a window counts.
      if (ability === null || tokenOf.has(ability)) unresolved.push(event.reportTimeMs);
    } else if (event.source.actorId === actorId) {
      if (ability === null) unresolved.push(event.reportTimeMs);
      else {
        const token = tokenOf.get(ability);
        if (token !== undefined) byToken.get(token.actionToken)?.push(event.reportTimeMs);
      }
    }
  }
  return { byToken, unresolved };
}

/** Inside means strictly between the two edges: the same millisecond as an edge has no known order. */
function pressesWithin(
  evidence: CastEvidence,
  tokens: readonly GatedToken[],
  fromMs: number,
  toMs: number,
): readonly GatedLinePresses[] {
  return tokens.map((token) => ({
    actionToken: token.actionToken,
    entries: token.entries,
    castCount: (evidence.byToken.get(token.actionToken) ?? []).filter((t) => t > fromMs && t < toMs).length,
  }));
}

/**
 * Why a window with both edges observed still cannot be counted, or `null` when it can.
 *
 * CONTINUITY IS M4's. Every transition after the application must find the aura proven ACTIVE
 * from the one before it, so a gap between two of them refuses the window rather than joining it.
 *
 * THE COUNT IS EXACT OR ABSENT. A count says how many gated casts happened, so each of these refuses:
 *
 *   the cast category not COMPLETE, whether it is short of the window, out of scope for this actor,
 *   or whole in range and degraded by malformed content, which the range check alone would pass
 *
 *   a cast in the window with no ability id, or no source, that could be a gated one
 *
 *   a gated cast in the same millisecond as an edge: a report time orders nothing inside its own
 *   millisecond, so whether it fell inside the window is not established
 */
function outOfEvidence(
  state: CombatState,
  actorId: number,
  transitions: readonly AuraObservation[],
  evidence: CastEvidence,
  fromMs: number,
  toMs: number,
): ColossusSmashWindowOutOfEvidence | null {
  for (const transition of transitions) {
    if (transition.source === null) return "CONTINUITY_NOT_ESTABLISHED";
    const presence = state.auras.presenceAt({
      target: transition.target,
      abilityGameId: COLOSSUS_SMASH_DEBUFF_SPELL_ID,
      auraClass: "DEBUFF",
      source: fromSource(transition.source),
      at: beforeEvent(transition.position),
    });
    if (presence.certainty !== "EXACT" || presence.value.presence !== "ACTIVE") {
      return "CONTINUITY_NOT_ESTABLISHED";
    }
  }
  const category = state.fight.completeness.categories.CASTS;
  if (category.capability !== "OBSERVABLE" || category.coverage.state !== "COMPLETE") {
    return "CAST_COVERAGE_NOT_COMPLETE";
  }
  const casts = gateAbsenceClaim({
    completeness: state.fight.completeness,
    category: "CASTS",
    range: inclusiveRange(fromMs, toMs),
    actorId,
  });
  if (!casts.ok) return "CAST_COVERAGE_NOT_COMPLETE";
  if (evidence.unresolved.some((t) => t >= fromMs && t <= toMs)) return "CAST_IDENTITY_NOT_ESTABLISHED";
  for (const times of evidence.byToken.values()) {
    if (times.some((t) => t === fromMs || t === toMs)) return "EDGE_ORDER_NOT_ESTABLISHED";
  }
  return null;
}

/** Answers the question over one fight. Pure, and reads nothing but the normalized state. */
export function colossusSmashWindowFill(input: {
  readonly state: CombatState;
  readonly actorId: number;
  readonly authority: AplAuthority;
  readonly heroTree: HeroTreeResolution;
}): ColossusSmashWindowFill {
  const { state, actorId, authority, heroTree } = input;
  const singleTargetList = heroTree.state === "RESOLVED" ? SINGLE_TARGET_LIST[heroTree.simcName] : undefined;
  if (singleTargetList === undefined) return { status: "HERO_TREE_NOT_RESOLVED", windows: [] };
  const tokens = gatedTokensOf(authority, singleTargetList);
  const castEvidence = castEvidenceOf(state, actorId, tokens);

  interface Open {
    readonly appliedAtMs: number;
    readonly transitions: AuraObservation[];
  }
  const open = new Map<string, Open>();
  const windows: ColossusSmashWindow[] = [];

  for (const position of state.positionsByAbility(COLOSSUS_SMASH_DEBUFF_SPELL_ID)) {
    const observation = state.auras.observationAt(position);
    if (observation === null || observation.auraClass !== "DEBUFF") continue;
    if (observation.source?.actorId !== actorId) continue;
    const { actorId: targetActorId, instanceId: targetInstanceId } = observation.target;
    if (targetActorId === actorId) continue;
    const key = `${String(targetActorId)}:${String(targetInstanceId)}`;
    const reportTimeMs = observation.locator.reportTimeMs;
    const opened = open.get(key);
    if (observation.operation !== "REMOVED" || observation.isStackChange) {
      if (opened !== undefined) opened.transitions.push(observation);
      else if (observation.operation === "APPLIED") {
        open.set(key, { appliedAtMs: reportTimeMs, transitions: [] });
      }
      continue;
    }
    open.delete(key);
    if (opened === undefined) {
      windows.push({
        state: "NOT_ESTABLISHED",
        reason: "NO_APPLICATION_OBSERVED",
        targetActorId,
        targetInstanceId,
        appliedAtMs: null,
        removedAtMs: reportTimeMs,
        presses: null,
      });
      continue;
    }
    const refusal = outOfEvidence(
      state,
      actorId,
      [...opened.transitions, observation],
      castEvidence,
      opened.appliedAtMs,
      reportTimeMs,
    );
    windows.push(
      refusal === null
        ? {
            state: "ESTABLISHED",
            targetActorId,
            targetInstanceId,
            appliedAtMs: opened.appliedAtMs,
            removedAtMs: reportTimeMs,
            presses: pressesWithin(castEvidence, tokens, opened.appliedAtMs, reportTimeMs),
          }
        : {
            state: "NOT_ESTABLISHED",
            reason: refusal,
            targetActorId,
            targetInstanceId,
            appliedAtMs: opened.appliedAtMs,
            removedAtMs: reportTimeMs,
            presses: null,
          },
    );
  }
  for (const [key, opened] of open) {
    const [target, instance] = key.split(":");
    windows.push({
      state: "NOT_ESTABLISHED",
      reason: "NO_REMOVAL_OBSERVED",
      targetActorId: Number(target),
      targetInstanceId: instance === "null" ? null : Number(instance),
      appliedAtMs: opened.appliedAtMs,
      removedAtMs: null,
      presses: null,
    });
  }
  return {
    status: "OBSERVED",
    singleTargetList,
    gatedTokens: tokens.map((token) => token.actionToken),
    windows,
  };
}
