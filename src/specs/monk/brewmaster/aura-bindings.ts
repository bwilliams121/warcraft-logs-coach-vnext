/**
 * `buff.<name>.up` — the Brewmaster-owned reading of aura presence (M11-C2).
 *
 * WHAT THIS COMPOSES, AND NOTHING ELSE
 *
 *     src/engine/auras (through M4 state)      `presenceAt`: ACTIVE or INACTIVE
 *                                              from an OBSERVED transition, or
 *                                              UNKNOWN; never inactive from
 *                                              silence
 *     monk-brewmaster-aura-authority           which spell an atom reads, and
 *                                              which talent PRODUCES it
 *     the actor's resolved build               whether that talent was taken
 *
 * TWO PROOFS, AND ONLY TWO:
 *
 *     OBSERVED              M4 answers EXACT at the decision: ACTIVE binds
 *                           `up: true`; INACTIVE — a removal M4 observed and
 *                           proved nothing reversed since — binds `up: false`
 *     TALENT_NOT_SELECTED   the talent whose `make_buff_fallback` gates the
 *                           buff resolves NOT_SELECTED (an alternative entry
 *                           at its choice node was observed), so the buff can
 *                           never come up in the analyzed build: `up: false`
 *
 * Anything else leaves the atom unbound, and the shared evaluator enumerates
 * it. In particular an aura with NO transition before the decision is UNKNOWN
 * — the pull snapshot is not read, and a buff that was up at the pull
 * produces no event — so `buff.invoke_niuzao_the_black_ox.up` before the
 * first Invoke Niuzao, and `buff.empty_barrel.up` before the first Keg Smash,
 * stay unbound.
 *
 * NO FUTURE ORACLE. The query is `BEFORE_EVENT` at the decision position: an
 * application at or after the decision is not consulted, and an aura the
 * decision's own cast removes at the SAME millisecond — Blackout Combo
 * consumed by the Tiger Palm that reads it — sits after the cast in canonical
 * order and is still UP to it, which is exactly what SimulationCraft
 * evaluates before executing the action.
 *
 * NO WINDOW, NO DURATION, NO COUNT. No pre-decision window refinement, no
 * remains, no stack: `buff.empty_the_cellar.remains` and every other remains
 * atom stay unbound in this slice.
 *
 * READINESS AURAS. The one `ready()` override that requires an aura — Empty
 * the Cellar's — is read here too, so every Brewmaster aura query lives in one
 * module. It is asked only under a CORROBORATED wire id, and the readiness
 * authority corroborates none, so the fact is NOT_ESTABLISHED at every
 * decision: the SimC buff id is never used as a stand-in for the id the log
 * emits.
 */

import { sourceRef, targetRef } from "../../../engine/normalization/normalized-events.js";
import { fromSource } from "../../../engine/auras/aura-state.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import type { UnknownReason } from "../../../engine/state/state-result.js";
import { brewmasterAuraIdentityFor } from "../../../data/game/monk-brewmaster-aura-authority.js";
import {
  BREWMASTER_READINESS_FACTS,
  type BrewmasterReadinessGate,
} from "../../../data/game/monk-brewmaster-readiness-authority.js";
import type { TalentResolution } from "../../../data/game/talent-selection.js";

export interface BrewmasterAuraInput {
  readonly state: CombatState;
  readonly actorId: number;
  /** Canonical index of the decision point. Never an ingestion ordinal. */
  readonly position: number;
  /** The resolved build facts the talent proof reads, by talent name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
}

export type BrewmasterAuraBinding =
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
      /** The talent resolution the proof rests on, in words. */
      readonly basis: string;
    }
  | {
      readonly atomName: string;
      readonly state: "UNBOUND";
      readonly reason:
        /** No pinned identity for the atom. */
        | "IDENTITY_NOT_PINNED"
        /** M4 could not answer. Carries M4's reason. */
        | "AURA_STATE_UNKNOWN";
      readonly abilityGameId: number | null;
      readonly auraReason: UnknownReason | null;
    };

/** The observed-aura atoms the Shado-Pan slice reads as `buff.<name>.up`. */
export const SUPPORTED_BREWMASTER_AURA_ATOMS = [
  "blackout_combo",
  "empty_barrel",
  "invoke_niuzao_the_black_ox",
] as const;

/** Binds one pinned buff atom's PRESENCE at a decision position. */
export function bindBrewmasterAura(input: BrewmasterAuraInput, atomName: string): BrewmasterAuraBinding {
  const identity = brewmasterAuraIdentityFor(atomName);
  if (identity === null) {
    return {
      atomName,
      state: "UNBOUND",
      reason: "IDENTITY_NOT_PINNED",
      abilityGameId: null,
      auraReason: null,
    };
  }

  // The build proof first: it needs no aura stream at all.
  const producer = identity.producedByTalent === null ? undefined : input.talents[identity.producedByTalent];
  if (producer !== undefined && producer.selection === "NOT_SELECTED") {
    return {
      atomName,
      state: "BOUND",
      up: false,
      abilityGameId: identity.abilityGameId,
      proof: "TALENT_NOT_SELECTED",
      basis: `talent '${producer.simcName}' resolved NOT_SELECTED (${producer.reason}); the buff is a fallback that never comes up in this build`,
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
    proof: "OBSERVED",
    anchorPosition: result.value.anchor.position,
    anchorLocator: result.value.anchor.locator,
  };
}

export function bindSupportedBrewmasterAuras(input: BrewmasterAuraInput): readonly BrewmasterAuraBinding[] {
  return SUPPORTED_BREWMASTER_AURA_ATOMS.map((atomName) => bindBrewmasterAura(input, atomName));
}

/** The `knownBuffs` shape, from the bindings that bound. */
export function brewmasterBuffBindingsFrom(
  bindings: readonly BrewmasterAuraBinding[],
): readonly { readonly name: string; readonly up: boolean }[] {
  const known: { name: string; up: boolean }[] = [];
  for (const binding of bindings) {
    if (binding.state === "BOUND") known.push({ name: binding.atomName, up: binding.up });
  }
  return known;
}

// ---------------------------------------------------------------------------
// Readiness auras (the Empty the Cellar gate)
// ---------------------------------------------------------------------------

/**
 * The state of one REQUIRES_AURA_ACTIVE readiness gate at one decision.
 *
 * PROVEN_INACTIVE is the only state a usability proof reads, and it needs
 * BOTH a corroborated wire identity and an M4 EXACT INACTIVE answer for that
 * identity. Everything else is NOT_ESTABLISHED with the reason, and proves
 * nothing in either direction.
 */
export type BrewmasterReadinessAuraFact =
  | {
      readonly simcToken: string;
      readonly state: "PROVEN_INACTIVE";
      readonly wireAuraId: number;
      readonly anchorReportTimeMs: number;
    }
  | {
      readonly simcToken: string;
      readonly state: "NOT_ESTABLISHED";
      readonly reason: "WIRE_AURA_IDENTITY_NOT_CORROBORATED" | "AURA_ACTIVE" | "AURA_STATE_UNKNOWN";
      readonly wireAuraId: number | null;
      readonly auraReason: UnknownReason | null;
    };

export const NO_READINESS_AURA_FACTS: readonly BrewmasterReadinessAuraFact[] = [];

/**
 * The wire aura id a readiness gate may be queried under, or `null` when the
 * pinned record does not corroborate one.
 *
 * The only state the readiness authority can represent today is
 * `NOT_YET_CORROBORATED`, so this returns `null` for every gate: the SimC buff
 * spell id is NEVER used as a stand-in for the id the log emits.
 */
export function corroboratedWireAuraIdFor(
  gate: Extract<BrewmasterReadinessGate, { kind: "REQUIRES_AURA_ACTIVE" }>,
): number | null {
  switch (gate.wireAuraIdentity) {
    case "NOT_YET_CORROBORATED":
      return null;
  }
}

/**
 * One REQUIRES_AURA_ACTIVE gate's state at a decision, under a given wire id.
 *
 * `wireAuraId` is supplied by the caller and is `null` unless corroborated;
 * the M4 question is asked only under a corroborated id, strictly before the
 * decision, on the actor's own aura.
 */
export function resolveReadinessAuraFact(input: {
  readonly state: CombatState;
  readonly actorId: number;
  readonly position: number;
  readonly simcToken: string;
  readonly wireAuraId: number | null;
}): BrewmasterReadinessAuraFact {
  const { simcToken, wireAuraId } = input;
  if (wireAuraId === null) {
    return {
      simcToken,
      state: "NOT_ESTABLISHED",
      reason: "WIRE_AURA_IDENTITY_NOT_CORROBORATED",
      wireAuraId: null,
      auraReason: null,
    };
  }
  const result = input.state.auras.presenceAt({
    target: targetRef(input.actorId, null),
    abilityGameId: wireAuraId,
    auraClass: "BUFF",
    source: fromSource(sourceRef(input.actorId, null)),
    at: { anchor: "BEFORE_EVENT", position: input.position },
  });
  if (result.certainty !== "EXACT") {
    return {
      simcToken,
      state: "NOT_ESTABLISHED",
      reason: "AURA_STATE_UNKNOWN",
      wireAuraId,
      auraReason: "reason" in result ? result.reason : null,
    };
  }
  if (result.value.presence === "ACTIVE") {
    return { simcToken, state: "NOT_ESTABLISHED", reason: "AURA_ACTIVE", wireAuraId, auraReason: null };
  }
  return {
    simcToken,
    state: "PROVEN_INACTIVE",
    wireAuraId,
    anchorReportTimeMs: result.value.anchor.locator.reportTimeMs,
  };
}

/** Every pinned REQUIRES_AURA_ACTIVE gate's state at one decision, in readiness-authority order. */
export function resolveBrewmasterReadinessAuraFacts(input: {
  readonly state: CombatState;
  readonly actorId: number;
  readonly position: number;
}): readonly BrewmasterReadinessAuraFact[] {
  const facts: BrewmasterReadinessAuraFact[] = [];
  for (const fact of BREWMASTER_READINESS_FACTS) {
    if (fact.gate.kind !== "REQUIRES_AURA_ACTIVE") continue;
    facts.push(
      resolveReadinessAuraFact({
        ...input,
        simcToken: fact.simcToken,
        wireAuraId: corroboratedWireAuraIdFor(fact.gate),
      }),
    );
  }
  return facts;
}
