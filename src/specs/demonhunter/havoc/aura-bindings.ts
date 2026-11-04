/**
 * `buff.<name>.up` — the Havoc-owned reading of aura presence (ONB-A1).
 *
 * TWO PROOFS, AND ONLY TWO:
 *
 *     OBSERVED              M4 answers EXACT at the decision: ACTIVE binds
 *                           `up: true`; INACTIVE, a removal M4 observed and proved
 *                           nothing reversed since, binds `up: false`
 *     TALENT_NOT_SELECTED   the talent producing the buff is proven not taken, by
 *                           the three-way rule or by a resolved hero tree that is
 *                           not its own, so the buff can never come up
 *
 * Anything else leaves the atom unbound and the shared evaluator enumerates it. An
 * aura with NO transition before the decision is UNKNOWN: a buff that was up at the
 * pull produces no event.
 *
 * NO FUTURE ORACLE. The query is `BEFORE_EVENT` at the decision position, so an aura
 * the decision's own cast removes at the same millisecond is still up to it, which
 * is what SimulationCraft evaluates before executing the action.
 *
 * ONE MILLISECOND OF SKEW. The log can place an effect of a cast BEFORE the cast that
 * caused it: on the retained subject Rending Strike and Glaive Flurry come up 0 or 1 ms
 * before the Reaver's Glaive that applies them, and are removed 0 or 1 ms before the
 * spender that consumes them. Read naively, every Reaver's Glaive would see its own
 * buffs up and be proven unselectable. So an edge within `AURA_EDGE_SKEW_MS` before the
 * decision proves nothing by itself:
 *
 *   the one edge a decision's OWN action is pinned to write, in the DIRECTION it
 *   writes it (`OWN_ACTION_AURA_EDGES`), is that action's effect, and the state is read
 *   from before the edge, which is what SimulationCraft evaluates before executing
 *
 *   any other edge leaves the atom unbound: an opposite-direction edge, an edge of a
 *   buff the action does not write, and a second edge inside the window, which no
 *   single rewind could resolve
 *
 * WHAT THE READINESS PROOFS READ. Reaver's Glaive's `ready()` needs its buff up.
 * `reaversGlaiveReadinessFact` reports whether that is proven up, for how long, or
 * proven down, from the same binding.
 */

import { sourceRef, targetRef } from "../../../engine/normalization/normalized-events.js";
import { fromSource } from "../../../engine/auras/aura-state.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import type { UnknownReason } from "../../../engine/state/state-result.js";
import {
  havocAuraIdentityFor,
  REAVERS_GLAIVE_BUFF_SPELL_ID,
} from "../../../data/game/demonhunter-havoc-aura-authority.js";

export interface HavocAuraInput {
  readonly state: CombatState;
  readonly actorId: number;
  /** Canonical index of the decision point. Never an ingestion ordinal. */
  readonly position: number;
  /** Talents proven not taken, by the three-way rule or by the resolved hero tree. */
  readonly talentsProvenAbsent: ReadonlySet<string>;
  /** The decision cast's own time and token. */
  readonly decisionReportTimeMs: number;
  readonly observedToken: string;
}

/** How far before its cause the retained log places a cast's own aura effect. */
export const AURA_EDGE_SKEW_MS = 2;

/**
 * The buffs each action writes as part of its own execute, from the pinned module:
 * `reavers_glaive_t::execute` (:8447-8448) and the spenders that consume them. Which
 * spender consumes which is read off the retained subject's 54 removals: never the
 * other buff, and never another action.
 */
export const OWN_ACTION_AURA_EDGES: Readonly<
  Record<string, Readonly<Record<string, "APPLIED" | "REMOVED">>>
> = Object.freeze({
  reavers_glaive: { rending_strike: "APPLIED", glaive_flurry: "APPLIED" },
  annihilation: { rending_strike: "REMOVED" },
  chaos_strike: { rending_strike: "REMOVED" },
  death_sweep: { glaive_flurry: "REMOVED" },
  blade_dance: { glaive_flurry: "REMOVED" },
});

export type HavocAuraBinding =
  | {
      readonly atomName: string;
      readonly state: "BOUND";
      readonly up: boolean;
      readonly abilityGameId: number;
      readonly proof: "OBSERVED";
      readonly anchorPosition: number;
      readonly anchorLocator: EvidenceLocator;
    }
  | {
      readonly atomName: string;
      readonly state: "BOUND";
      readonly up: false;
      readonly abilityGameId: number;
      readonly proof: "TALENT_NOT_SELECTED";
      readonly basis: string;
    }
  | {
      readonly atomName: string;
      readonly state: "UNBOUND";
      readonly reason: "IDENTITY_NOT_PINNED" | "AURA_STATE_UNKNOWN" | "AURA_EDGE_WITHIN_SKEW";
      readonly abilityGameId: number | null;
      readonly auraReason: UnknownReason | null;
    };

/** The observed-aura atoms the slice reads. */
export const SUPPORTED_HAVOC_AURA_ATOMS = [
  "reavers_glaive",
  "rending_strike",
  "glaive_flurry",
  "initiative",
] as const;

/** Binds one pinned buff atom's PRESENCE at a decision position. */
export function bindHavocAura(input: HavocAuraInput, atomName: string): HavocAuraBinding {
  const identity = havocAuraIdentityFor(atomName);
  if (identity === null) {
    return {
      atomName,
      state: "UNBOUND",
      reason: "IDENTITY_NOT_PINNED",
      abilityGameId: null,
      auraReason: null,
    };
  }
  if (identity.producedByTalent !== null && input.talentsProvenAbsent.has(identity.producedByTalent)) {
    return {
      atomName,
      state: "BOUND",
      up: false,
      abilityGameId: identity.abilityGameId,
      proof: "TALENT_NOT_SELECTED",
      basis: `talent '${identity.producedByTalent}' is proven not taken, so the buff never comes up in this build`,
    };
  }
  const presenceBefore = (position: number) =>
    input.state.auras.presenceAt({
      target: targetRef(input.actorId, null),
      abilityGameId: identity.abilityGameId,
      auraClass: "BUFF",
      source: fromSource(sourceRef(input.actorId, null)),
      at: { anchor: "BEFORE_EVENT", position },
    });
  let result = presenceBefore(input.position);
  if (
    result.certainty === "EXACT" &&
    input.decisionReportTimeMs - result.value.anchor.locator.reportTimeMs <= AURA_EDGE_SKEW_MS
  ) {
    const withinSkew: HavocAuraBinding = {
      atomName,
      state: "UNBOUND",
      reason: "AURA_EDGE_WITHIN_SKEW",
      abilityGameId: identity.abilityGameId,
      auraReason: null,
    };
    const edge = input.state.eventAt(result.value.anchor.position);
    const expected = OWN_ACTION_AURA_EDGES[input.observedToken]?.[atomName];
    if (edge?.kind !== "AURA" || expected === undefined || edge.operation !== expected) return withinSkew;
    result = presenceBefore(result.value.anchor.position);
    if (
      result.certainty === "EXACT" &&
      input.decisionReportTimeMs - result.value.anchor.locator.reportTimeMs <= AURA_EDGE_SKEW_MS
    ) {
      return withinSkew;
    }
  }
  if (result.certainty !== "EXACT") {
    return {
      atomName,
      state: "UNBOUND",
      reason: "AURA_STATE_UNKNOWN",
      abilityGameId: identity.abilityGameId,
      auraReason: "reason" in result ? result.reason : null,
    };
  }
  return {
    atomName,
    state: "BOUND",
    up: result.value.presence === "ACTIVE",
    abilityGameId: identity.abilityGameId,
    proof: "OBSERVED",
    anchorPosition: result.value.anchor.position,
    anchorLocator: result.value.anchor.locator,
  };
}

export function bindSupportedHavocAuras(input: HavocAuraInput): readonly HavocAuraBinding[] {
  return SUPPORTED_HAVOC_AURA_ATOMS.map((atomName) => bindHavocAura(input, atomName));
}

/** The `knownBuffs` shape, from the bindings that bound. */
export function havocBuffBindingsFrom(
  bindings: readonly HavocAuraBinding[],
): readonly { readonly name: string; readonly up: boolean }[] {
  const known: { name: string; up: boolean }[] = [];
  for (const binding of bindings) {
    if (binding.state === "BOUND") known.push({ name: binding.atomName, up: binding.up });
  }
  return known;
}

/** `buff.<name>.up` by name, for the bindings that bound. */
export function havocBuffUpByName(
  bindings: readonly HavocAuraBinding[],
): Readonly<Record<string, boolean | undefined>> {
  const byName: Record<string, boolean | undefined> = {};
  for (const binding of bindings) {
    if (binding.state === "BOUND") byName[binding.atomName] = binding.up;
  }
  return byName;
}

/**
 * The state of Reaver's Glaive's `ready()` buff at one decision.
 *
 *   PROVEN_UP        M4 observed it ACTIVE, applied `upForMs` before the decision
 *   PROVEN_DOWN      M4 observed a removal, or the talent producing it is absent
 *   NOT_ESTABLISHED  nothing is proven either way
 */
export type ReaversGlaiveReadinessFact =
  | { readonly state: "PROVEN_UP"; readonly upForMs: number; readonly anchorLocator: EvidenceLocator }
  | { readonly state: "PROVEN_DOWN"; readonly wireAuraId: number; readonly anchorReportTimeMs: number | null }
  | { readonly state: "NOT_ESTABLISHED" };

export function reaversGlaiveReadinessFact(
  bindings: readonly HavocAuraBinding[],
  decisionReportTimeMs: number,
): ReaversGlaiveReadinessFact {
  const binding = bindings.find((entry) => entry.atomName === "reavers_glaive");
  if (binding === undefined || binding.state !== "BOUND") return { state: "NOT_ESTABLISHED" };
  if (binding.proof === "TALENT_NOT_SELECTED") {
    return { state: "PROVEN_DOWN", wireAuraId: REAVERS_GLAIVE_BUFF_SPELL_ID, anchorReportTimeMs: null };
  }
  if (!binding.up) {
    return {
      state: "PROVEN_DOWN",
      wireAuraId: REAVERS_GLAIVE_BUFF_SPELL_ID,
      anchorReportTimeMs: binding.anchorLocator.reportTimeMs,
    };
  }
  return {
    state: "PROVEN_UP",
    upForMs: decisionReportTimeMs - binding.anchorLocator.reportTimeMs,
    anchorLocator: binding.anchorLocator,
  };
}
