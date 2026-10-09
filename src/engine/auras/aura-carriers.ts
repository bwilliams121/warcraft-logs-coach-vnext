/**
 * How many target instances carry ONE CASTER's aura at a position (M11-F).
 *
 * This is the evidence behind SimulationCraft's `active_dot.X` /
 * `dot.X.active_dots`: the number of targets currently carrying THIS
 * player's DoT of action X (pinned `player_t::get_active_dots`,
 * player.cpp:14356-14385, and `action_t::create_expression`
 * "active_dots", action.cpp:3623). It is caster-specific and needs no enemy
 * roster. This module knows no action, spell or class: the caller supplies
 * the aura identities a specialization pinned.
 *
 * PER TARGET, THREE ANSWERS, NONE FROM SILENCE
 *
 * The candidates are the target instances the caster was OBSERVED
 * transitioning the aura on, at or before the position. For each,
 * `presenceAt` (FROM_SOURCE, the caster's own track) decides:
 *
 *     PROVEN_ACTIVE     an observed gain carried to the position under coverage
 *     PROVEN_INACTIVE   an observed removal, or a POSITIVE death (below)
 *     UNKNOWN           everything else
 *
 * A missing removal is never "active forever" beyond what `presenceAt`'s own
 * coverage contract proves, and a missing application is never "inactive".
 *
 * DEATH
 *
 * Pinned `player_t::demise` cancels every DoT on the dying target
 * (player.cpp:7219-7220). So a positive death of the target instance strictly
 * after the aura's anchor and strictly before the position ends it:
 * PROVEN_INACTIVE. A resurrection does not bring it back. A death in the
 * anchor's own millisecond, an unresolved state after a death, or a
 * contradiction makes that target UNKNOWN. The ABSENCE of a death event
 * changes nothing.
 *
 * THE COUNT IS A LOWER BOUND
 *
 * The number of PROVEN_ACTIVE targets is a proven lower bound. No upper bound
 * is claimed: a target the caster was never observed transitioning the aura on
 * may still carry it (an application before the retrieved window, or one
 * outside coverage), and no specialization has pinned a maximum carry
 * duration that would let an observed window rule that out. A lower bound of
 * zero says nothing and is UNKNOWN.
 *
 * NO FUTURE EVIDENCE: the candidates, the aura state and the death state are
 * all read at or before the position.
 */

import type { AuraClass, SourceRef, TargetRef } from "../normalization/normalized-events.js";
import type { CombatState } from "../state/combat-state.js";
import { deathStateAt, type DeathState } from "../state/death-state.js";
import type { TemporalPosition } from "../state/temporal.js";
import { fromSource } from "./aura-state.js";

export interface CasterAuraCarrierQuery {
  readonly caster: SourceRef;
  /** The aura identities of ONE DoT, as a specialization pinned them. Usually one. */
  readonly auraAbilityGameIds: readonly number[];
  readonly auraClass: AuraClass;
  readonly at: TemporalPosition;
}

export type CarrierState = "PROVEN_ACTIVE" | "PROVEN_INACTIVE" | "UNKNOWN";

export type CarrierBasis =
  | "AURA_PRESENCE_ACTIVE"
  | "AURA_PRESENCE_INACTIVE"
  | "ENDED_BY_POSITIVE_DEATH"
  | "AURA_PRESENCE_UNKNOWN"
  | "DEATH_STATE_UNRESOLVED";

export interface TargetCarrier {
  readonly target: TargetRef;
  readonly state: CarrierState;
  readonly basis: CarrierBasis;
  /** The death state read for this target, when it decided or blocked the answer. */
  readonly deathState: DeathState["state"] | null;
}

export type CarrierCount =
  | { readonly kind: "AT_LEAST"; readonly lowerBound: number }
  | {
      readonly kind: "UNKNOWN";
      readonly reason: "POSITION_UNRESOLVED" | "NO_PROVEN_CARRIER";
    };

export interface CasterAuraCarriers {
  readonly targets: readonly TargetCarrier[];
  readonly count: CarrierCount;
  /** Never established: see the module header. */
  readonly upperBound: "NOT_ESTABLISHED";
}

function sameRef(
  left: { actorId: number; instanceId: number | null },
  right: { actorId: number; instanceId: number | null },
): boolean {
  return left.actorId === right.actorId && left.instanceId === right.instanceId;
}

/** Applies a positive death of the target to an ACTIVE answer anchored at `anchorMs`. */
function afterDeath(
  state: DeathState,
  anchorMs: number,
): { readonly ended: boolean; readonly blocked: boolean } {
  if (state.state === "NO_POSITIVE_DEATH_EVIDENCE") return { ended: false, blocked: false };
  const deathMs = state.death.reportTimeMs;
  if (deathMs < anchorMs) return { ended: false, blocked: false };
  if (deathMs === anchorMs) return { ended: false, blocked: true };
  if (state.state === "DEAD_SINCE" || state.state === "RESURRECTION_OBSERVED")
    return { ended: true, blocked: false };
  return { ended: false, blocked: true };
}

export function casterAuraCarriersAt(state: CombatState, query: CasterAuraCarrierQuery): CasterAuraCarriers {
  const resolved = state.resolveTemporalPosition(query.at);
  if (!resolved.ok) {
    return {
      targets: [],
      count: { kind: "UNKNOWN", reason: "POSITION_UNRESOLVED" },
      upperBound: "NOT_ESTABLISHED",
    };
  }
  const { lastIncludedPosition, boundaryReportTimeMs } = resolved.prefix;
  const abilities = new Set(query.auraAbilityGameIds);

  // Candidates: target instances the caster was observed transitioning the aura on.
  const candidates: TargetRef[] = [];
  for (const position of state.positionsBySourceActor(query.caster.actorId)) {
    if (position > lastIncludedPosition) continue;
    const event = state.eventAt(position);
    if (event === null || event.kind !== "AURA" || event.auraClass !== query.auraClass) continue;
    if (event.abilityGameId === null || !abilities.has(event.abilityGameId)) continue;
    if (event.source === null || !sameRef(event.source, query.caster) || event.target === null) continue;
    const target = event.target;
    if (!candidates.some((known) => sameRef(known, target))) candidates.push(target);
  }

  const targets = candidates.map((target): TargetCarrier => {
    let active: { readonly anchorMs: number } | null = null;
    let inactiveCount = 0;
    for (const abilityGameId of abilities) {
      const presence = state.auras.presenceAt({
        target,
        abilityGameId,
        auraClass: query.auraClass,
        source: fromSource(query.caster),
        at: query.at,
      });
      if (presence.certainty !== "EXACT") continue;
      if (presence.value.presence === "ACTIVE") {
        const anchorMs = presence.value.anchor.reportTimeMs;
        if (active === null || anchorMs > active.anchorMs) active = { anchorMs };
      } else {
        inactiveCount += 1;
      }
    }
    if (active !== null) {
      const death = deathStateAt(state.fight, target, boundaryReportTimeMs);
      const effect = afterDeath(death, active.anchorMs);
      if (effect.ended) {
        return {
          target,
          state: "PROVEN_INACTIVE",
          basis: "ENDED_BY_POSITIVE_DEATH",
          deathState: death.state,
        };
      }
      if (effect.blocked) {
        return { target, state: "UNKNOWN", basis: "DEATH_STATE_UNRESOLVED", deathState: death.state };
      }
      return { target, state: "PROVEN_ACTIVE", basis: "AURA_PRESENCE_ACTIVE", deathState: null };
    }
    if (inactiveCount === abilities.size) {
      return { target, state: "PROVEN_INACTIVE", basis: "AURA_PRESENCE_INACTIVE", deathState: null };
    }
    return { target, state: "UNKNOWN", basis: "AURA_PRESENCE_UNKNOWN", deathState: null };
  });

  const lowerBound = targets.filter((entry) => entry.state === "PROVEN_ACTIVE").length;
  return {
    targets,
    count:
      lowerBound > 0 ? { kind: "AT_LEAST", lowerBound } : { kind: "UNKNOWN", reason: "NO_PROVEN_CARRIER" },
    upperBound: "NOT_ESTABLISHED",
  };
}
