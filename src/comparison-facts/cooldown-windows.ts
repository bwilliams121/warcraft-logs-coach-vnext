/**
 * Generic COOLDOWN-WINDOW facts (M11-G2). A specialization supplies the
 * definition (which cast triggers it, which self-applied aura marks it
 * active); this module only reads observed evidence.
 *
 * A WINDOW IS AN OBSERVED AURA INTERVAL ON THE FOCUS, FROM THE FOCUS
 *
 *   start   the APPLIED transition, observed — or UNKNOWN (a REFRESHED or
 *           REMOVED transition with no observed application before it)
 *   end     the REMOVED transition, observed — or UNKNOWN (no removal
 *           observed before the fight's events end, or a second application
 *           with no removal between)
 *   length  end - start ONLY when both are observed. A nominal spell duration
 *           is never substituted for a missing end.
 *
 * Trigger casts are associated temporally, never assumed: a COMPLETE trigger
 * cast within the definition's tolerance of an observed start is AT_WINDOW_START;
 * one inside an already-active window is DURING_ACTIVE_WINDOW (the aura can
 * also be applied without a cast); one in no observed window is
 * NO_OBSERVED_WINDOW. Uptime is a fact, not a judgement: nothing here values
 * a window.
 */

import type { CombatFight } from "../engine/normalization/combat-fight.js";
import { collectionUnder, factStateOf, type EvidenceBasis, type FactCollection } from "./evidence-basis.js";
import { castsFrom } from "./cast-facts.js";

export interface CooldownWindowDefinition {
  readonly windowKind: string;
  readonly triggerCastAbilityGameIds: readonly number[];
  readonly activeAuraAbilityGameId: number;
  readonly auraClass: "BUFF" | "DEBUFF";
  readonly triggerAssociationToleranceMs: number;
  readonly provenance: string;
}

export type WindowBound =
  | { readonly kind: "OBSERVED"; readonly reportTimeMs: number }
  | {
      readonly kind: "UNKNOWN";
      readonly reason:
        "NO_APPLICATION_OBSERVED" | "NO_REMOVAL_OBSERVED" | "APPLIED_AGAIN_WITHOUT_OBSERVED_REMOVAL";
    };

export type WindowLength =
  | { readonly kind: "OBSERVED"; readonly durationMs: number }
  | { readonly kind: "UNKNOWN"; readonly reason: "START_NOT_OBSERVED" | "END_NOT_OBSERVED" };

export type WindowTrigger =
  | { readonly kind: "CAST_AT_START"; readonly castAtMs: number; readonly offsetMs: number }
  | { readonly kind: "NO_TRIGGER_CAST_AT_START" };

export interface CooldownWindow {
  /** 1-based, in observation order. */
  readonly index: number;
  readonly windowKind: string;
  readonly start: WindowBound;
  readonly end: WindowBound;
  readonly length: WindowLength;
  readonly refreshesObservedAtMs: readonly number[];
  readonly trigger: WindowTrigger;
  /** Trigger casts observed inside the window after its start (refresh-type casts). */
  readonly triggerCastsDuringAtMs: readonly number[];
}

export type TriggerCastAssociation =
  | { readonly kind: "AT_WINDOW_START"; readonly windowIndex: number }
  | { readonly kind: "DURING_ACTIVE_WINDOW"; readonly windowIndex: number }
  | { readonly kind: "NO_OBSERVED_WINDOW" };

export interface TriggerCast {
  readonly reportTimeMs: number;
  readonly abilityGameId: number;
  readonly association: TriggerCastAssociation;
}

export interface CooldownWindowFacts {
  readonly windowKind: string;
  readonly definitionProvenance: string;
  readonly windows: FactCollection<CooldownWindow>;
  readonly triggerCasts: FactCollection<TriggerCast>;
}

interface OpenWindow {
  start: WindowBound;
  refreshes: number[];
}

/** The window's [start, end] as numbers when both bounds are observed. */
export function observedBounds(window: CooldownWindow): { startMs: number; endMs: number } | null {
  return window.start.kind === "OBSERVED" && window.end.kind === "OBSERVED"
    ? { startMs: window.start.reportTimeMs, endMs: window.end.reportTimeMs }
    : null;
}

export function observeCooldownWindows(
  fight: CombatFight,
  basis: EvidenceBasis,
  focusActorId: number,
  definition: CooldownWindowDefinition,
): CooldownWindowFacts {
  // E1 convention: [fight start, fight end) — an event at exactly the end instant is outside.
  const fightWindow = { startMs: fight.fight.startTimeMs, endMs: fight.fight.endTimeMs };
  const built: Omit<CooldownWindow, "index" | "trigger" | "triggerCastsDuringAtMs">[] = [];
  let open: OpenWindow | null = null;
  const close = (end: WindowBound): void => {
    if (open === null) return;
    const length: WindowLength =
      open.start.kind !== "OBSERVED"
        ? { kind: "UNKNOWN", reason: "START_NOT_OBSERVED" }
        : end.kind !== "OBSERVED"
          ? { kind: "UNKNOWN", reason: "END_NOT_OBSERVED" }
          : { kind: "OBSERVED", durationMs: end.reportTimeMs - open.start.reportTimeMs };
    built.push({
      windowKind: definition.windowKind,
      start: open.start,
      end,
      length,
      refreshesObservedAtMs: open.refreshes,
    });
    open = null;
  };
  for (const event of fight.events) {
    if (event.kind !== "AURA" || event.abilityGameId !== definition.activeAuraAbilityGameId) continue;
    if (event.auraClass !== definition.auraClass || event.isStackChange) continue;
    if (event.source?.actorId !== focusActorId || event.target?.actorId !== focusActorId) continue;
    if (event.operation === "APPLIED") {
      if (open !== null) close({ kind: "UNKNOWN", reason: "APPLIED_AGAIN_WITHOUT_OBSERVED_REMOVAL" });
      open = { start: { kind: "OBSERVED", reportTimeMs: event.reportTimeMs }, refreshes: [] };
    } else if (event.operation === "REFRESHED") {
      open ??= { start: { kind: "UNKNOWN", reason: "NO_APPLICATION_OBSERVED" }, refreshes: [] };
      open.refreshes.push(event.reportTimeMs);
    } else {
      open ??= { start: { kind: "UNKNOWN", reason: "NO_APPLICATION_OBSERVED" }, refreshes: [] };
      close({ kind: "OBSERVED", reportTimeMs: event.reportTimeMs });
    }
  }
  close({ kind: "UNKNOWN", reason: "NO_REMOVAL_OBSERVED" });

  const casts = castsFrom(fight, [focusActorId], fightWindow)
    .filter(
      (cast) =>
        cast.phase === "COMPLETE" &&
        cast.abilityGameId !== null &&
        definition.triggerCastAbilityGameIds.includes(cast.abilityGameId),
    )
    .map((cast) => ({ reportTimeMs: cast.reportTimeMs, abilityGameId: cast.abilityGameId as number }));
  const tolerance = definition.triggerAssociationToleranceMs;
  const contains = (window: (typeof built)[number], at: number): boolean => {
    const after = window.start.kind === "OBSERVED" ? at >= window.start.reportTimeMs - tolerance : false;
    const before = window.end.kind === "OBSERVED" ? at <= window.end.reportTimeMs : true;
    return after && before;
  };
  const triggerCasts: TriggerCast[] = casts.map((cast) => {
    const atStart = built.findIndex(
      (window) =>
        window.start.kind === "OBSERVED" &&
        Math.abs(cast.reportTimeMs - window.start.reportTimeMs) <= tolerance,
    );
    if (atStart >= 0) return { ...cast, association: { kind: "AT_WINDOW_START", windowIndex: atStart + 1 } };
    const during = built.findIndex((window) => contains(window, cast.reportTimeMs));
    if (during >= 0)
      return { ...cast, association: { kind: "DURING_ACTIVE_WINDOW", windowIndex: during + 1 } };
    return { ...cast, association: { kind: "NO_OBSERVED_WINDOW" } };
  });
  const windows: CooldownWindow[] = built.map((window, position) => {
    const index = position + 1;
    const atStart = triggerCasts.find(
      (cast) => cast.association.kind === "AT_WINDOW_START" && cast.association.windowIndex === index,
    );
    return {
      index,
      ...window,
      trigger:
        atStart === undefined || window.start.kind !== "OBSERVED"
          ? { kind: "NO_TRIGGER_CAST_AT_START" }
          : {
              kind: "CAST_AT_START",
              castAtMs: atStart.reportTimeMs,
              offsetMs: atStart.reportTimeMs - window.start.reportTimeMs,
            },
      triggerCastsDuringAtMs: triggerCasts
        .filter(
          (cast) =>
            cast.association.kind === "DURING_ACTIVE_WINDOW" && cast.association.windowIndex === index,
        )
        .map((cast) => cast.reportTimeMs),
    };
  });
  const auraState = factStateOf(fight, basis, ["AURAS"], fightWindow, [focusActorId]);
  const castState = factStateOf(fight, basis, ["CASTS"], fightWindow, [focusActorId]);
  return {
    windowKind: definition.windowKind,
    definitionProvenance: definition.provenance,
    windows: collectionUnder(auraState, windows),
    triggerCasts: collectionUnder(castState, triggerCasts),
  };
}
