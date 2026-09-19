/**
 * `buff.<name>.up` and `buff.<name>.stack` — the Blood-owned reading of aura
 * state (M11-B2).
 *
 * WHAT THIS COMPOSES
 *
 *     src/engine/auras (through M4 state)      `presenceAt`: ACTIVE or INACTIVE
 *                                              from an OBSERVED transition, or
 *                                              UNKNOWN; never inactive from
 *                                              silence. `latestStackObservation`
 *                                              and `trackFor` for the Bone
 *                                              Shield rule below
 *     deathknight-blood-aura-authority         which spell an atom reads, which
 *                                              talent PRODUCES it, and which
 *                                              hero sub-tree OWNS every producer
 *     the actor's resolved build               the three-way talent rule and
 *                                              the hero-tree resolution
 *
 * PRESENCE. An atom is bound when its identity is pinned and ONE of three
 * proofs holds, tried in this order:
 *
 *     HERO_TREE_EXCLUDED   every producer of the aura is a talent of one hero
 *                          sub-tree and the observed build RESOLVED to the
 *                          other; one hero tree is active at a time, so the
 *                          aura is impossible — `up: false`
 *     TALENT_NOT_SELECTED  the pinned talent that produces the aura resolved
 *                          NOT_SELECTED (an alternative entry at its choice
 *                          node was observed) — `up: false`
 *     OBSERVED             M4 answers EXACT: ACTIVE binds `up: true`; INACTIVE
 *                          — a removal M4 observed and proved nothing reversed
 *                          since — binds `up: false`
 *
 * Anything else leaves the atom unbound, and the shared evaluator enumerates
 * it. A San'layn build's `buff.exterminate.up` is the case the first proof
 * exists for: the Deathbringer aura never appears in a San'layn log, and
 * silence alone could never bind it.
 *
 * NO FUTURE ORACLE. The query is `BEFORE_EVENT` at the decision position: an
 * application at or after the decision is not consulted.
 *
 * NO SAME-MILLISECOND ORACLE EITHER — A MEASURED HAZARD. In the M11-B2
 * captures Warcraft Logs writes a cast's OWN aura effects BEFORE the cast
 * at the same millisecond: a Marrowrend at 2,015,770 is preceded in the
 * array by the three Bone Shield stack gains it caused, a Vampiric Strike
 * by the Essence stack it granted. `BEFORE_EVENT` at the cast position
 * therefore includes them, and would read the POST-cast state as the state
 * the decision was made in. (The M11-A4 Paladin slice recorded the opposite
 * order for a Divine Storm consuming Divine Arbiter; the ordering is not a
 * contract.) So a binding is REFUSED — `SAME_MILLISECOND_TRANSITION` —
 * whenever the queried identity has a transition at the decision's own
 * report millisecond ahead of the decision in canonical order. Which side
 * of the cast such a transition belongs to is not pinned, and this module
 * does not guess.
 *
 * STACKS. `buff.<name>.stack` binds EXACTLY ZERO under the two build proofs
 * above and under PROVEN_INACTIVE (the same three routes), for every pinned
 * stack atom. For BONE SHIELD ONLY it also binds the EXACT POSITIVE count
 * under the Blood-owned reconstruction rule:
 *
 *     the aura is EXACT ACTIVE at the decision (M4, with coverage), the last
 *     transition carrying a `stack` number strictly before the decision
 *     reports N, and every transition of the aura between that observation
 *     and the decision is a `refreshbuff` at the SAME MILLISECOND as it —
 *     the companion refresh Warcraft Logs emits beside a stack change.
 *
 * Why exactly this: Warcraft Logs reports a Bone Shield stack change as an
 * `applybuffstack` / `removebuffstack` carrying the ABSOLUTE resulting count
 * (M4's stack contract), and nothing between two such transitions changes
 * the count EXCEPT a plain `applybuff` (an initial application, which
 * carries no count) or a `refreshbuff` that is not beside a stack change
 * (whose effect on the count is unpinned). So the count is N exactly when
 * the evidence between the observation and the decision is nothing but
 * same-millisecond companions. A lone refresh, an initial application, an
 * UNKNOWN presence, or a stack observation the coverage cannot connect to
 * the decision all leave the atom UNBOUND. No count is ever inferred from
 * silence, from a cast, or from expected play.
 */

import { sourceRef, targetRef } from "../../../engine/normalization/normalized-events.js";
import { fromSource } from "../../../engine/auras/aura-state.js";
import type { AuraObservation } from "../../../engine/auras/aura-observations.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import type { UnknownReason } from "../../../engine/state/state-result.js";
import {
  bloodAuraIdentityFor,
  type BloodAuraIdentity,
} from "../../../data/game/deathknight-blood-aura-authority.js";
import type { HeroTreeResolution, TalentResolution } from "../../../data/game/talent-selection.js";

export interface BloodAuraInput {
  readonly state: CombatState;
  readonly actorId: number;
  /** Canonical index of the decision point. Never an ingestion ordinal. */
  readonly position: number;
  /** The resolved build facts the talent proofs read, by talent name. */
  readonly talents: Readonly<Record<string, TalentResolution>>;
  readonly heroTree: HeroTreeResolution;
}

export type BloodAuraProof = "HERO_TREE_EXCLUDED" | "TALENT_NOT_SELECTED" | "OBSERVED";

export type BloodAuraBinding =
  | {
      readonly atomName: string;
      readonly state: "BOUND";
      readonly up: boolean;
      readonly abilityGameId: number;
      readonly proof: BloodAuraProof;
      /** The M4 anchor for OBSERVED; null for the build proofs. */
      readonly anchorPosition: number | null;
      readonly anchorLocator: EvidenceLocator | null;
      readonly basis: string;
    }
  | {
      readonly atomName: string;
      readonly state: "UNBOUND";
      readonly reason:
        /** No pinned identity carries this atom name. */
        | "IDENTITY_NOT_PINNED"
        /** The atom is a DEBUFF; the shared evaluator has no debuff binding field. */
        | "DEBUFF_NOT_BINDABLE"
        /** M4 could not answer and no build proof applied. Carries M4's reason. */
        | "AURA_STATE_UNKNOWN"
        /** A transition of this identity sits at the decision's own millisecond ahead of it; see the module header. */
        | "SAME_MILLISECOND_TRANSITION";
      readonly abilityGameId: number | null;
      readonly auraReason: UnknownReason | null;
    };

export type BloodStackProof = BloodAuraProof | "PROVEN_INACTIVE" | "EXACT_STACK_OBSERVATION";

/** An exact stack proof, or the reason none holds. */
export type BloodStackBinding =
  | {
      readonly atomName: string;
      readonly state: "BOUND";
      readonly stack: number;
      readonly abilityGameId: number;
      readonly proof: BloodStackProof;
      readonly basis: string;
    }
  | {
      readonly atomName: string;
      readonly state: "UNBOUND";
      readonly reason:
        | "IDENTITY_NOT_PINNED"
        | "AURA_STATE_UNKNOWN"
        | "SAME_MILLISECOND_TRANSITION"
        /** ACTIVE, and this atom is not one the exact-count rule covers. */
        | "AURA_ACTIVE_COUNT_NOT_RECONSTRUCTED"
        /** ACTIVE, but no transition carrying a count precedes the decision. */
        | "NO_STACK_OBSERVATION"
        /** ACTIVE, but an initial application or a lone refresh sits between the last count and the decision. */
        | "COUNT_AMBIGUOUS_SINCE_OBSERVATION";
      readonly abilityGameId: number | null;
      readonly detail: string | null;
    };

/** The observed-aura atoms the slice reads as `buff.<name>.up`. */
export const SUPPORTED_BLOOD_AURA_ATOMS = [
  "gift_of_the_sanlayn",
  "vampiric_blood",
  "exterminate",
  "dancing_rune_weapon",
  "bone_shield",
  "vampiric_strike",
  "boiling_point",
  "death_and_decay",
] as const;

/** The atoms the slice reads as `buff.<name>.stack`. */
export const SUPPORTED_BLOOD_STACK_ATOMS = [
  "bone_shield",
  "essence_of_the_blood_queen",
  "blood_debt",
] as const;

/** The ONE atom whose exact positive count the Blood rule reconstructs. */
export const EXACT_COUNT_ATOMS: readonly string[] = ["bone_shield"];

/** The build proof that makes an aura impossible for this actor, or `null`. */
function impossibleByBuild(
  identity: BloodAuraIdentity,
  input: BloodAuraInput,
): { readonly proof: "HERO_TREE_EXCLUDED" | "TALENT_NOT_SELECTED"; readonly basis: string } | null {
  if (
    identity.ownedByHeroTree !== null &&
    input.heroTree.state === "RESOLVED" &&
    input.heroTree.simcName !== identity.ownedByHeroTree
  ) {
    return {
      proof: "HERO_TREE_EXCLUDED",
      basis:
        `every producer of the aura is a '${identity.ownedByHeroTree}' hero talent and the observed build ` +
        `resolved to the '${input.heroTree.simcName}' sub-tree (entries ${input.heroTree.decidedByEntryIds.join(",")}); ` +
        "one hero tree is active at a time, so the aura is impossible in this build",
    };
  }
  const producer = identity.producedByTalent === null ? undefined : input.talents[identity.producedByTalent];
  if (producer !== undefined && producer.selection === "NOT_SELECTED") {
    return {
      proof: "TALENT_NOT_SELECTED",
      basis: `talent '${producer.simcName}' resolved NOT_SELECTED (${producer.reason}); the aura is impossible in this build`,
    };
  }
  return null;
}

function identityQuery(input: BloodAuraInput, identity: BloodAuraIdentity) {
  return {
    target: targetRef(input.actorId, null),
    abilityGameId: identity.abilityGameId,
    auraClass: identity.auraClass,
    source: fromSource(sourceRef(input.actorId, null)),
  } as const;
}

/**
 * Whether a transition of this identity sits at the decision's own report
 * millisecond AHEAD of the decision in canonical order. `null` when the
 * decision position holds no event (nothing to compare against).
 */
function sameMillisecondPrefixTransition(
  input: BloodAuraInput,
  identity: BloodAuraIdentity,
): AuraObservation | null {
  const decision = input.state.eventAt(input.position);
  if (decision === null) return null;
  const track = input.state.auras.trackFor(identityQuery(input, identity));
  if (track === null) return null;
  for (const position of track.positions) {
    if (position >= input.position) break;
    const transition = input.state.auras.observationAt(position);
    if (transition !== null && transition.reportTimeMs === decision.reportTimeMs) return transition;
  }
  return null;
}

/** Binds one pinned buff atom's PRESENCE at a decision position. */
export function bindBloodAura(input: BloodAuraInput, atomName: string): BloodAuraBinding {
  const identity = bloodAuraIdentityFor(atomName);
  if (identity === null) {
    return {
      atomName,
      state: "UNBOUND",
      reason: "IDENTITY_NOT_PINNED",
      abilityGameId: null,
      auraReason: null,
    };
  }
  if (identity.auraClass === "DEBUFF") {
    return {
      atomName,
      state: "UNBOUND",
      reason: "DEBUFF_NOT_BINDABLE",
      abilityGameId: identity.abilityGameId,
      auraReason: null,
    };
  }
  const impossible = impossibleByBuild(identity, input);
  if (impossible !== null) {
    return {
      atomName,
      state: "BOUND",
      up: false,
      abilityGameId: identity.abilityGameId,
      proof: impossible.proof,
      anchorPosition: null,
      anchorLocator: null,
      basis: impossible.basis,
    };
  }
  const sameMillisecond = sameMillisecondPrefixTransition(input, identity);
  if (sameMillisecond !== null) {
    return {
      atomName,
      state: "UNBOUND",
      reason: "SAME_MILLISECOND_TRANSITION",
      abilityGameId: identity.abilityGameId,
      auraReason: null,
    };
  }
  const result = input.state.auras.presenceAt({
    ...identityQuery(input, identity),
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
    basis: `M4 presence EXACT ${result.value.presence}, anchored on the ${result.value.anchor.operation} observed at report time ${String(result.value.anchor.reportTimeMs)}`,
  };
}

/** Whether a transition is the same-millisecond `refreshbuff` companion of a stack observation. */
function isCompanionRefresh(transition: AuraObservation, stackObservation: AuraObservation): boolean {
  return (
    transition.operation === "REFRESHED" &&
    !transition.isStackChange &&
    transition.reportTimeMs === stackObservation.reportTimeMs
  );
}

/**
 * The exact positive Bone Shield count at the decision under the Blood rule,
 * given a presence already proven EXACT ACTIVE, or the reason none holds.
 */
function exactCountFromObservation(
  input: BloodAuraInput,
  identity: BloodAuraIdentity,
  presenceAnchor: AuraObservation,
):
  | { readonly stack: number; readonly basis: string }
  | {
      readonly reason: "NO_STACK_OBSERVATION" | "COUNT_AMBIGUOUS_SINCE_OBSERVATION";
      readonly detail: string;
    } {
  const query = identityQuery(input, identity);
  const latest = input.state.auras.latestStackObservation({
    ...query,
    at: { anchor: "BEFORE_EVENT", position: input.position },
  });
  if (latest.certainty !== "EXACT" || latest.value.observedStacks === null) {
    return {
      reason: "NO_STACK_OBSERVATION",
      detail: "no transition carrying a stack count precedes the decision in this source's track",
    };
  }
  const observation = latest.value;
  const observedStacks = latest.value.observedStacks;
  // Every transition of THIS identity after the count and before the decision,
  // read off the track M4 keeps for the one source. The presence anchor is
  // the last of them (or the observation itself), so nothing later is
  // unaccounted for; and the presence being EXACT is what earned coverage
  // from that anchor to the decision.
  const track = input.state.auras.trackFor(query);
  const between = (track?.positions ?? []).filter(
    (position) => position > observation.position && position <= presenceAnchor.position,
  );
  for (const position of between) {
    const transition = input.state.auras.observationAt(position);
    if (transition === null || !isCompanionRefresh(transition, observation)) {
      return {
        reason: "COUNT_AMBIGUOUS_SINCE_OBSERVATION",
        detail:
          `a ${transition?.operation ?? "missing"} transition at report time ${String(transition?.reportTimeMs ?? "?")} ` +
          `follows the last count (${String(observation.observedStacks)} at ${String(observation.reportTimeMs)}) and is not its ` +
          "same-millisecond refresh companion; what it did to the count is not pinned",
      };
    }
  }
  return {
    stack: observedStacks,
    basis:
      `the last stack-bearing transition before the decision (${observation.operation}, report time ` +
      `${String(observation.reportTimeMs)}) reports ${String(observation.observedStacks)}, every later transition ` +
      `up to the decision is a same-millisecond refresh companion (${String(between.length)}), and M4 proves the ` +
      "aura ACTIVE at the decision under coverage",
  };
}

/**
 * Binds `buff.<name>.stack`: zero under the three impossibility/inactivity
 * proofs for every pinned stack atom, and the exact positive count for Bone
 * Shield under the Blood rule. Everything else is UNBOUND with the reason.
 */
export function bindBloodStack(input: BloodAuraInput, atomName: string): BloodStackBinding {
  const identity = bloodAuraIdentityFor(atomName);
  if (identity === null) {
    return { atomName, state: "UNBOUND", reason: "IDENTITY_NOT_PINNED", abilityGameId: null, detail: null };
  }
  const presence = bindBloodAura(input, atomName);
  if (presence.state === "UNBOUND") {
    return {
      atomName,
      state: "UNBOUND",
      reason:
        presence.reason === "SAME_MILLISECOND_TRANSITION"
          ? "SAME_MILLISECOND_TRANSITION"
          : "AURA_STATE_UNKNOWN",
      abilityGameId: identity.abilityGameId,
      detail: presence.auraReason,
    };
  }
  if (!presence.up) {
    return {
      atomName,
      state: "BOUND",
      stack: 0,
      abilityGameId: identity.abilityGameId,
      proof: presence.proof === "OBSERVED" ? "PROVEN_INACTIVE" : presence.proof,
      basis: presence.basis,
    };
  }
  if (!EXACT_COUNT_ATOMS.includes(atomName)) {
    return {
      atomName,
      state: "UNBOUND",
      reason: "AURA_ACTIVE_COUNT_NOT_RECONSTRUCTED",
      abilityGameId: identity.abilityGameId,
      detail: "the aura is ACTIVE and the Blood exact-count rule is pinned for bone_shield only",
    };
  }
  const anchor =
    presence.anchorPosition === null ? null : input.state.auras.observationAt(presence.anchorPosition);
  if (anchor === null) {
    return {
      atomName,
      state: "UNBOUND",
      reason: "AURA_STATE_UNKNOWN",
      abilityGameId: identity.abilityGameId,
      detail: "the presence anchor could not be read back",
    };
  }
  const count = exactCountFromObservation(input, identity, anchor);
  if ("reason" in count) {
    return {
      atomName,
      state: "UNBOUND",
      reason: count.reason,
      abilityGameId: identity.abilityGameId,
      detail: count.detail,
    };
  }
  return {
    atomName,
    state: "BOUND",
    stack: count.stack,
    abilityGameId: identity.abilityGameId,
    proof: "EXACT_STACK_OBSERVATION",
    basis: count.basis,
  };
}

export function bindSupportedBloodAuras(input: BloodAuraInput): readonly BloodAuraBinding[] {
  return SUPPORTED_BLOOD_AURA_ATOMS.map((atomName) => bindBloodAura(input, atomName));
}

export function bindSupportedBloodStacks(input: BloodAuraInput): readonly BloodStackBinding[] {
  return SUPPORTED_BLOOD_STACK_ATOMS.map((atomName) => bindBloodStack(input, atomName));
}

/** The `knownBuffs` shape, from the bindings that bound. */
export function bloodBuffBindingsFrom(
  bindings: readonly BloodAuraBinding[],
): readonly { readonly name: string; readonly up: boolean }[] {
  const known: { name: string; up: boolean }[] = [];
  for (const binding of bindings)
    if (binding.state === "BOUND") known.push({ name: binding.atomName, up: binding.up });
  return known;
}

/** The `knownBuffStacks` shape: exactly the atoms proven, at exactly their proven count. */
export function bloodStackBindingsFrom(
  bindings: readonly BloodStackBinding[],
): readonly { readonly name: string; readonly stack: number }[] {
  const known: { name: string; stack: number }[] = [];
  for (const binding of bindings)
    if (binding.state === "BOUND") known.push({ name: binding.atomName, stack: binding.stack });
  return known;
}
