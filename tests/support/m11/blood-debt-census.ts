/**
 * The Blood Debt TRANSITION census and its retrospective validation
 * (M11-B6) — test support, deliberately outside `src/`.
 *
 * The evaluator (`src/specs/deathknight/blood/aura-bindings.ts`) reads the
 * count from the latest observed transition and never looks past the
 * decision. This module looks at the WHOLE track at once, which is exactly
 * what the evaluator must not do: it uses each LATER transition to check the
 * pinned model against the state the rule would have bound BEFORE it. A
 * future observation is validation only; nothing here feeds the evaluator.
 *
 * What is measured, over one actor's own Blood Debt track in one state:
 *
 *   - every transition by raw operation, with its absolute stack when carried;
 *   - whether two transitions of the identity ever share a millisecond;
 *   - the lag of each transition behind the nearest own cast that precedes it
 *     within `LAG_SEARCH_MS`, by that cast's ability — a description of the
 *     wire's ordering, NOT an attribution the evaluator makes;
 *   - the smallest gap from a transition to the next supported decision
 *     (the evaluator's 50 ms window would refuse a lead inside it);
 *   - the prospective walk: from the state the rule binds after each
 *     transition (application 1, absolute count N, removal 0), the NEXT
 *     transition is consistent when an application follows zero, a count
 *     reads previous + 1, and a removal follows the maximum.
 */

import {
  BLOOD_DEBT_BUFF_SPELL_ID,
  BLOOD_DEBT_MAX_STACK,
} from "../../../src/data/game/deathknight-blood-aura-authority.js";
import type { AuraObservation } from "../../../src/engine/auras/aura-observations.js";
import { fromSource } from "../../../src/engine/auras/aura-state.js";
import { sourceRef, targetRef } from "../../../src/engine/normalization/normalized-events.js";
import type { CombatState } from "../../../src/engine/state/combat-state.js";

/** How far back from a transition the nearest own cast is looked for, for the lag census only. */
export const LAG_SEARCH_MS = 100;

export type BloodDebtRawOperation =
  "applybuff" | "applybuffstack" | "refreshbuff" | "removebuffstack" | "removebuff";

export interface BloodDebtTransitionCensus {
  readonly transitions: Readonly<Record<BloodDebtRawOperation, number>>;
  /** Every transition's absolute `stack`, in canonical order (`null` for the ones carrying none). */
  readonly stackValues: readonly (number | null)[];
  readonly sameMillisecondPairs: number;
  /** `<abilityGameId>` -> count of transitions whose nearest preceding own cast (within LAG_SEARCH_MS) has that ability; "none" when no cast precedes within it. */
  readonly precedingOwnCast: Readonly<Record<string, number>>;
  readonly lagMs: { readonly min: number | null; readonly max: number | null };
  /** The smallest `decision - transition` over transitions with a decision at or after them; null when none. */
  readonly minGapToNextDecisionMs: number | null;
  readonly validation: {
    readonly points: number;
    readonly consistent: number;
    readonly inconsistent: readonly {
      readonly reportTimeMs: number;
      readonly operation: BloodDebtRawOperation;
      readonly boundBefore: number;
      readonly observedStacks: number | null;
    }[];
  };
}

function rawOperationOf(observation: AuraObservation): BloodDebtRawOperation | null {
  switch (observation.operation) {
    case "APPLIED":
      return observation.isStackChange ? "applybuffstack" : "applybuff";
    case "REFRESHED":
      return observation.isStackChange ? null : "refreshbuff";
    case "REMOVED":
      return observation.isStackChange ? "removebuffstack" : "removebuff";
  }
}

/** What the Blood rule binds AFTER this transition, or null when it binds nothing from it. */
function boundAfter(operation: BloodDebtRawOperation, observedStacks: number | null): number | null {
  switch (operation) {
    case "applybuff":
      return 1;
    case "applybuffstack":
      return observedStacks;
    case "removebuffstack":
      return observedStacks !== null && observedStacks > 0 ? observedStacks : null;
    case "removebuff":
      return 0;
    case "refreshbuff":
      return null;
  }
}

function consistent(
  operation: BloodDebtRawOperation,
  observedStacks: number | null,
  boundBefore: number,
): boolean {
  switch (operation) {
    case "applybuff":
      return boundBefore === 0;
    case "applybuffstack":
      return boundBefore < BLOOD_DEBT_MAX_STACK && observedStacks === boundBefore + 1;
    case "removebuff":
      return boundBefore === BLOOD_DEBT_MAX_STACK;
    case "removebuffstack":
    case "refreshbuff":
      return false;
  }
}

export function bloodDebtTransitionCensus(
  state: CombatState,
  actorId: number,
  decisionReportTimesMs: readonly number[],
): BloodDebtTransitionCensus {
  const track = state.auras.trackFor({
    target: targetRef(actorId, null),
    abilityGameId: BLOOD_DEBT_BUFF_SPELL_ID,
    auraClass: "BUFF",
    source: fromSource(sourceRef(actorId, null)),
  });
  const observations = (track?.positions ?? [])
    .map((position) => state.auras.observationAt(position))
    .filter((observation): observation is AuraObservation => observation !== null);
  const transitions: Record<BloodDebtRawOperation, number> = {
    applybuff: 0,
    applybuffstack: 0,
    refreshbuff: 0,
    removebuffstack: 0,
    removebuff: 0,
  };
  const stackValues: (number | null)[] = [];
  const precedingOwnCast = new Map<string, number>();
  const lags: number[] = [];
  const decisions = [...decisionReportTimesMs].sort((a, b) => a - b);
  let minGap: number | null = null;
  let sameMillisecondPairs = 0;
  let points = 0;
  let consistentCount = 0;
  const inconsistent: BloodDebtTransitionCensus["validation"]["inconsistent"][number][] = [];
  let bound: number | null = null;

  const ownCasts: {
    readonly position: number;
    readonly reportTimeMs: number;
    readonly abilityGameId: number;
  }[] = [];
  for (let position = 0; position < state.fight.events.length; position += 1) {
    const event = state.fight.events[position];
    if (event === undefined || event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    if (event.source?.actorId !== actorId || event.abilityGameId === null) continue;
    ownCasts.push({ position, reportTimeMs: event.reportTimeMs, abilityGameId: event.abilityGameId });
  }

  observations.forEach((observation, index) => {
    const operation = rawOperationOf(observation);
    if (operation === null) return;
    transitions[operation] += 1;
    stackValues.push(observation.observedStacks);
    const previous = observations[index - 1];
    if (previous !== undefined && previous.reportTimeMs === observation.reportTimeMs)
      sameMillisecondPairs += 1;

    let nearest: (typeof ownCasts)[number] | null = null;
    for (const cast of ownCasts) {
      if (cast.position >= observation.position) break;
      if (observation.reportTimeMs - cast.reportTimeMs <= LAG_SEARCH_MS) nearest = cast;
    }
    const key = nearest === null ? "none" : String(nearest.abilityGameId);
    precedingOwnCast.set(key, (precedingOwnCast.get(key) ?? 0) + 1);
    if (nearest !== null) lags.push(observation.reportTimeMs - nearest.reportTimeMs);

    const next = decisions.find((reportTimeMs) => reportTimeMs >= observation.reportTimeMs);
    if (next !== undefined) {
      const gap = next - observation.reportTimeMs;
      minGap = minGap === null ? gap : Math.min(minGap, gap);
    }

    if (bound !== null) {
      points += 1;
      if (consistent(operation, observation.observedStacks, bound)) consistentCount += 1;
      else
        inconsistent.push({
          reportTimeMs: observation.reportTimeMs,
          operation,
          boundBefore: bound,
          observedStacks: observation.observedStacks,
        });
    }
    bound = boundAfter(operation, observation.observedStacks);
  });

  return {
    transitions,
    stackValues,
    sameMillisecondPairs,
    precedingOwnCast: Object.fromEntries([...precedingOwnCast].sort(([a], [b]) => a.localeCompare(b))),
    lagMs: {
      min: lags.length === 0 ? null : Math.min(...lags),
      max: lags.length === 0 ? null : Math.max(...lags),
    },
    minGapToNextDecisionMs: minGap,
    validation: { points, consistent: consistentCount, inconsistent },
  };
}
