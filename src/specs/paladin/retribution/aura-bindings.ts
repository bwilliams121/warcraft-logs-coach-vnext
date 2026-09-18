/**
 * `buff.<name>.up` and the exact-zero `buff.<name>.stack` proofs — the
 * Retribution-owned reading of aura state (M11-A4).
 *
 * WHAT THIS COMPOSES
 *
 *     src/engine/auras (through M4 state)      `presenceAt`: ACTIVE or INACTIVE
 *                                              from an OBSERVED transition, or
 *                                              UNKNOWN; never inactive from
 *                                              silence
 *     paladin-retribution-aura-authority       which spell an atom reads, under
 *                                              which build gate, and which
 *                                              talent PRODUCES it
 *     the actor's resolved build               whether those gates hold
 *
 * PRESENCE. An atom is bound only when its identity is pinned for THIS build
 * and M4 answers EXACT. ACTIVE binds `up: true`; INACTIVE — a removal M4
 * observed and proved nothing reversed since — binds `up: false`. Anything
 * else leaves the atom unbound, and the shared evaluator enumerates it.
 *
 * NO FUTURE ORACLE. The query is `BEFORE_EVENT` at the decision position: an
 * application at or after the decision is not consulted, and an aura the
 * decision's own cast removes at the SAME millisecond — Divine Arbiter
 * consumed by the Divine Storm that reads it — sits after the cast in
 * canonical order and is still UP to it, which is exactly what SimulationCraft
 * evaluates before executing the action.
 *
 * EXACT ZERO STACKS (M11-A4), THE ONLY STACK CLAIM THIS MODULE MAKES. An aura
 * holds exactly zero stacks in two provable situations, and this module binds
 * `buff.<name>.stack = 0` in exactly those:
 *
 *     PROVEN_INACTIVE      M4's presence at the decision is EXACT INACTIVE —
 *                          an observed removal under coverage; silence never
 *                          reaches here
 *     TALENT_NOT_SELECTED  the pinned build resolves the talent that
 *                          PRODUCES the aura as NOT_SELECTED (an alternative
 *                          entry at its choice node was observed), so the
 *                          aura is impossible in the analyzed build
 *
 * No positive count is ever bound: M4 has no `stacksAt`, and this module does
 * not invent one. An ACTIVE aura leaves the stack atom UNBOUND (UNKNOWN), and
 * an UNKNOWN presence with an UNKNOWN or SELECTED talent leaves it UNBOUND.
 */

import { sourceRef, targetRef } from "../../../engine/normalization/normalized-events.js";
import { fromSource } from "../../../engine/auras/aura-state.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import type { UnknownReason } from "../../../engine/state/state-result.js";
import {
  retributionAuraIdentitiesFor,
  type RetributionAuraIdentity,
} from "../../../data/game/paladin-retribution-aura-authority.js";
import type { TalentResolution } from "../../../data/game/talent-selection.js";

export interface RetributionAuraInput {
  readonly state: CombatState;
  readonly actorId: number;
  /** Canonical index of the decision point. Never an ingestion ordinal. */
  readonly position: number;
  /** The resolved build facts the identity gates and the talent proofs read, by talent name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
}

export type RetributionAuraBinding =
  | {
      readonly atomName: string;
      readonly state: "BOUND";
      readonly up: boolean;
      readonly abilityGameId: number;
      readonly anchorPosition: number;
      readonly anchorLocator: EvidenceLocator;
    }
  | {
      readonly atomName: string;
      readonly state: "UNBOUND";
      readonly reason:
        /** No pinned identity's build gate holds for this build. */
        | "IDENTITY_NOT_ESTABLISHED_FOR_BUILD"
        /** M4 could not answer. Carries M4's reason. */
        | "AURA_STATE_UNKNOWN";
      readonly abilityGameId: number | null;
      readonly auraReason: UnknownReason | null;
    };

/** An exact-zero stack proof, or the reason none holds. */
export type RetributionStackBinding =
  | {
      readonly atomName: string;
      readonly state: "BOUND_ZERO";
      readonly abilityGameId: number;
      readonly proof: "PROVEN_INACTIVE" | "TALENT_NOT_SELECTED";
      /** The removal M4 anchored on, for PROVEN_INACTIVE; the talent for the other. */
      readonly basis: string;
    }
  | {
      readonly atomName: string;
      readonly state: "UNBOUND";
      readonly reason: "AURA_ACTIVE" | "AURA_STATE_UNKNOWN" | "TALENT_NOT_DISPROVED" | "IDENTITY_NOT_PINNED";
      readonly abilityGameId: number | null;
    };

function gateHolds(identity: RetributionAuraIdentity, talents: RetributionAuraInput["talents"]): boolean {
  return identity.requires.every((gate) => talents[gate.simcName]?.selection === gate.selection);
}

function identityFor(
  atomName: string,
  talents: RetributionAuraInput["talents"],
): RetributionAuraIdentity | null {
  return retributionAuraIdentitiesFor(atomName).find((identity) => gateHolds(identity, talents)) ?? null;
}

/** Binds one pinned buff atom's PRESENCE at a decision position. */
export function bindRetributionAura(input: RetributionAuraInput, atomName: string): RetributionAuraBinding {
  const identity = identityFor(atomName, input.talents);
  if (identity === null) {
    return {
      atomName,
      state: "UNBOUND",
      reason: "IDENTITY_NOT_ESTABLISHED_FOR_BUILD",
      abilityGameId: null,
      auraReason: null,
    };
  }
  const result = input.state.auras.presenceAt({
    target: targetRef(input.actorId, null),
    abilityGameId: identity.abilityGameId,
    auraClass: "BUFF",
    source: fromSource(sourceRef(input.actorId, null)),
    at: { anchor: "BEFORE_EVENT", position: input.position },
  });
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
    anchorPosition: result.value.anchor.position,
    anchorLocator: result.value.anchor.locator,
  };
}

/**
 * Binds `buff.<name>.stack` to EXACTLY ZERO under one of the two authorized
 * proofs, or leaves it unbound with the reason.
 */
export function bindRetributionStackZero(
  input: RetributionAuraInput,
  atomName: string,
): RetributionStackBinding {
  const identity = identityFor(atomName, input.talents);
  if (identity === null)
    return { atomName, state: "UNBOUND", reason: "IDENTITY_NOT_PINNED", abilityGameId: null };

  // Proof B first: impossible by build needs no aura stream at all.
  const producer = identity.producedByTalent === null ? null : input.talents[identity.producedByTalent];
  if (producer !== undefined && producer !== null && producer.selection === "NOT_SELECTED") {
    return {
      atomName,
      state: "BOUND_ZERO",
      abilityGameId: identity.abilityGameId,
      proof: "TALENT_NOT_SELECTED",
      basis: `talent '${producer.simcName}' resolved NOT_SELECTED (${producer.reason}); the aura is impossible in this build`,
    };
  }

  // Proof A: M4 proves the aura INACTIVE at the decision.
  const presence = bindRetributionAura(input, atomName);
  if (presence.state === "BOUND" && !presence.up) {
    return {
      atomName,
      state: "BOUND_ZERO",
      abilityGameId: presence.abilityGameId,
      proof: "PROVEN_INACTIVE",
      basis: `M4 presence EXACT INACTIVE, anchored on the removal at report time ${String(presence.anchorLocator.reportTimeMs)}`,
    };
  }
  if (presence.state === "BOUND") {
    return { atomName, state: "UNBOUND", reason: "AURA_ACTIVE", abilityGameId: presence.abilityGameId };
  }
  return {
    atomName,
    state: "UNBOUND",
    reason: producer === undefined || producer === null ? "AURA_STATE_UNKNOWN" : "TALENT_NOT_DISPROVED",
    abilityGameId: identity.abilityGameId,
  };
}

/** The observed-aura atoms the spender slice reads as `buff.<name>.up`. */
export const SUPPORTED_RETRIBUTION_AURA_ATOMS = [
  "avenging_wrath",
  "empyrean_legacy",
  "divine_arbiter_verdict",
  "divine_arbiter_divine_storm",
  "divine_purpose",
  "hammer_of_wrath",
] as const;

/** The atoms the spender slice reads as `buff.<name>.stack`, bound to exact zero only. */
export const SUPPORTED_RETRIBUTION_STACK_ATOMS = ["art_of_war", "righteous_cause"] as const;

export function bindSupportedRetributionAuras(
  input: RetributionAuraInput,
): readonly RetributionAuraBinding[] {
  return SUPPORTED_RETRIBUTION_AURA_ATOMS.map((atomName) => bindRetributionAura(input, atomName));
}

export function bindSupportedRetributionStacks(
  input: RetributionAuraInput,
): readonly RetributionStackBinding[] {
  return SUPPORTED_RETRIBUTION_STACK_ATOMS.map((atomName) => bindRetributionStackZero(input, atomName));
}

/**
 * The `knownBuffs` shape, from the bindings that bound. The Hammer of Wrath
 * readiness aura and Divine Purpose are NOT APL buff atoms on the spender
 * path (the pinned list never reads `buff.hammer_of_wrath` or
 * `buff.divine_purpose`) and are deliberately not exported as buff bindings;
 * they feed usability and the free-cast route instead.
 */
export function retributionBuffBindingsFrom(
  bindings: readonly RetributionAuraBinding[],
): readonly { readonly name: string; readonly up: boolean }[] {
  const known: { name: string; up: boolean }[] = [];
  for (const binding of bindings) {
    if (binding.atomName === "hammer_of_wrath" || binding.atomName === "divine_purpose") continue;
    if (binding.state === "BOUND") known.push({ name: binding.atomName, up: binding.up });
  }
  return known;
}

/** The `knownBuffStacks` shape: exactly the atoms proven zero, at exactly zero. */
export function retributionStackBindingsFrom(
  bindings: readonly RetributionStackBinding[],
): readonly { readonly name: string; readonly stack: 0 }[] {
  const known: { name: string; stack: 0 }[] = [];
  for (const binding of bindings) {
    if (binding.state === "BOUND_ZERO") known.push({ name: binding.atomName, stack: 0 });
  }
  return known;
}
