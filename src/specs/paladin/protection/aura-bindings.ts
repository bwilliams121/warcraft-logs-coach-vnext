/**
 * `buff.<name>.up` — the Protection-owned reading of aura state (M10-C5 Phase A).
 *
 * WHAT THIS COMPOSES
 *
 *     src/engine/auras (through M4 state)      `presenceAt`: ACTIVE or INACTIVE
 *                                              from an OBSERVED transition, or
 *                                              UNKNOWN; never inactive from
 *                                              silence
 *     paladin-protection-aura-authority        which spell an atom reads, and
 *                                              under which talent
 *     the actor's resolved build               whether that talent is SELECTED
 *
 * An atom is bound only when its identity is pinned for THIS build and M4
 * answers EXACT. ACTIVE binds `up: true`; INACTIVE — a removal M4 observed and
 * proved nothing reversed since — binds `up: false`. Anything else leaves the
 * atom unbound, and the shared evaluator enumerates it.
 *
 * NO FUTURE ORACLE. The query is `BEFORE_EVENT` at the decision position: an
 * application at or after the decision is not consulted. The Sentinel press
 * at +21,652 ms therefore binds the atom TRUE for the Divine Toll press 414 ms
 * later and for nothing before it. Position, not timestamp: an aura the
 * decision's own cast applies at the SAME millisecond sits after the cast in
 * canonical order and is not visible to it (the Vanguard application at
 * +126,568 ms is not seen by the Judgment that produced it).
 *
 * THIS MODULE NEVER SPELLS FALSE. `up` is bound here only from M4's EXACT
 * presence. The build-implied absences of M10-C5 Phase B — a Templar-only
 * buff under Lightsmith, Blessed Assurance when the node was spent on Divine
 * Guidance — are a different kind of fact from a different source (the
 * observed talent tree, not the aura stream) and live in `build-absences.ts`;
 * `bindSupportedProtectionAuras` merely lists both.
 */

import { sourceRef, targetRef } from "../../../engine/normalization/normalized-events.js";
import { fromSource } from "../../../engine/auras/aura-state.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import type { UnknownReason } from "../../../engine/state/state-result.js";
import {
  protectionAuraIdentitiesFor,
  type ProtectionAuraIdentity,
} from "../../../data/game/paladin-protection-aura-authority.js";
import type { HeroTreeResolution, TalentResolution } from "../../../data/game/talent-selection.js";
import {
  bindBuildImpliedAbsence,
  SUPPORTED_PROTECTION_BUILD_ABSENCES,
  type BuildImpliedAbsenceBinding,
} from "./build-absences.js";

export { bindBuildImpliedAbsence, SUPPORTED_PROTECTION_BUILD_ABSENCES };

export interface ProtectionAuraInput {
  readonly state: CombatState;
  readonly actorId: number;
  /** Canonical index of the decision point. Never an ingestion ordinal. */
  readonly position: number;
  /** The build facts that gate each pinned identity, by talent name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  /** The resolved hero tree, for the build-implied absences. Omitted = unresolved. */
  readonly heroTree?: HeroTreeResolution;
}

export type ProtectionAuraBinding =
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
        /** No pinned identity's gating talent is SELECTED for this build. */
        | "IDENTITY_NOT_ESTABLISHED_FOR_BUILD"
        /** M4 could not answer. Carries M4's reason. */
        | "AURA_STATE_UNKNOWN"
        /** A build-implied absence whose gate the build does not establish. */
        | "BUILD_GATE_NOT_ESTABLISHED";
      readonly abilityGameId: number | null;
      readonly auraReason: UnknownReason | null;
    }
  | BuildImpliedAbsenceBinding;

function identityFor(
  atomName: string,
  talents: ProtectionAuraInput["talents"],
): ProtectionAuraIdentity | null {
  for (const identity of protectionAuraIdentitiesFor(atomName)) {
    if (identity.requiresTalent === null) return identity;
    const gate = talents[identity.requiresTalent.simcName];
    if (gate !== undefined && gate.selection === identity.requiresTalent.selection) return identity;
  }
  return null;
}

/** Binds one pinned buff atom at a decision position. */
export function bindProtectionAura(input: ProtectionAuraInput, atomName: string): ProtectionAuraBinding {
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

/** The observed-aura atoms this specialization binds (Phase A + Phase B). */
export const SUPPORTED_PROTECTION_AURA_ATOMS = ["avenging_wrath", "vanguard", "hammer_of_wrath"] as const;

export function bindSupportedProtectionAuras(input: ProtectionAuraInput): readonly ProtectionAuraBinding[] {
  return [
    ...SUPPORTED_PROTECTION_AURA_ATOMS.map((atomName) => bindProtectionAura(input, atomName)),
    ...SUPPORTED_PROTECTION_BUILD_ABSENCES.map((atomName) => bindBuildImpliedAbsence(input, atomName)),
  ];
}

/**
 * The `knownBuffs` shape, from the bindings that bound. `hammer_of_wrath` is
 * a READINESS aura, not an APL buff atom, and is deliberately not exported as
 * a buff binding: the pinned list never reads `buff.hammer_of_wrath`.
 */
export function protectionBuffBindingsFrom(
  bindings: readonly ProtectionAuraBinding[],
): readonly { readonly name: string; readonly up: boolean }[] {
  const known: { name: string; up: boolean }[] = [];
  for (const binding of bindings) {
    if (binding.atomName === "hammer_of_wrath") continue;
    if (binding.state === "BOUND" || binding.state === "BOUND_BY_BUILD")
      known.push({ name: binding.atomName, up: binding.up });
  }
  return known;
}
