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
 * NO PRE-DECISION-WINDOW ORACLE EITHER — A MEASURED HAZARD. In the M11-B2
 * captures Warcraft Logs writes a cast's OWN aura effects BEFORE the cast:
 * a Marrowrend at 2,015,770 is preceded in the array by the three Bone
 * Shield stack gains it caused at the SAME millisecond, a Vampiric Strike
 * by the Essence stack it granted — and the M11-B4 audit measured the lead
 * at 0 ms (most), 1 ms (the Dancing Rune Weapon's five Bone Shield stacks,
 * five Vampiric Strikes' Essence transitions) and 20 ms (the pull Death's
 * Caress's Bone Shield application at 2,004,595 before its cast at
 * 2,004,615, with no Bone Shield in the combatantinfo aura snapshot).
 * `BEFORE_EVENT` at the cast position therefore includes them, and would
 * read the POST-cast state as the state the decision was made in. (The
 * M11-A4 Paladin slice recorded the opposite order for a Divine Storm
 * consuming Divine Arbiter; the ordering is not a contract.) So a binding is
 * REFUSED — `PRE_DECISION_WINDOW_TRANSITION` — whenever the queried identity
 * has a transition ahead of the decision in canonical order and no more
 * than `BLOOD_PRE_DECISION_WINDOW_MS` before it (inclusive at both edges;
 * M11-B2's rule was the 0 ms window). Which side of the cast such a
 * transition belongs to is not pinned, and this module does not guess —
 * deliberately, even when the corpus suggests the answer. The window is a
 * Blood policy over a shared, window-agnostic engine primitive
 * (`transitionsWithinBefore`); no other specialization is changed by it.
 *
 * STACKS. `buff.<name>.stack` binds EXACTLY ZERO under the two build proofs
 * above and under PROVEN_INACTIVE (the same three routes), for every pinned
 * stack atom. For the identities carrying an `exactCount` rule in the
 * authority data — BONE SHIELD (M11-B2) and BLOOD DEBT (M11-B6) — it also
 * binds the EXACT POSITIVE count under the Blood-owned reconstruction rule:
 *
 *     the aura is EXACT ACTIVE at the decision (M4, with coverage), the last
 *     transition carrying a `stack` number strictly before the decision
 *     reports N, and every transition of the aura between that observation
 *     and the decision is a `refreshbuff` at the SAME MILLISECOND as it —
 *     the companion refresh Warcraft Logs emits beside a stack change.
 *
 * Why exactly this: Warcraft Logs reports a stack change as an
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
 *
 * THE FRESH-APPLICATION CLAUSE (M11-B6). An identity whose rule pins
 * `applicationStack` — Blood Debt, 1 — ALSO binds that count when the
 * presence anchor itself is a PLAIN application (an `applybuff` carrying no
 * `stack`, so nothing of the identity follows it before the decision) and
 * the transition of the identity immediately before it is a plain
 * `removebuff`, or none exists in the track. The number is the pinned
 * module's (`buff_t::trigger()` from zero applies `_initial_stack` = 1),
 * and the shape is Warcraft Logs' (`applybuff` is written for an aura newly
 * applied; a change to an aura already held is an `applybuffstack`). The
 * corpus corroborates it 4 of 4 times: every Blood Debt `applybuff` follows
 * a `removebuff` or opens the track, and the next transition is always
 * `applybuffstack` 2. When the transition before the application shows the
 * aura ALREADY ACTIVE — an application or a positive stack reading — the
 * shape contradicts the semantics the clause rests on, and the atom is
 * refused: `APPLICATION_WHILE_ACTIVE_UNPINNED`, never reset to 1, never
 * carried, never incremented. Bone Shield's rule pins no application count
 * (Marrowrend and Death's Caress apply different numbers), so its plain
 * application stays ambiguous exactly as before.
 *
 * WHAT THE RULE NEVER DOES. It never adds 1 for a Death Strike, never reads
 * the set bonus's internal cooldown, never subtracts for a Marrowrend, never
 * reads equipped items for the set bonus, and never takes the combatantinfo
 * aura snapshot's silence for zero. Only observed transitions of the
 * identity establish the count; the pinned producer/consumer mechanics say
 * what the observed SHAPES mean, not what should have happened.
 */

import { sourceRef, targetRef } from "../../../engine/normalization/normalized-events.js";
import { fromSource } from "../../../engine/auras/aura-state.js";
import type { AuraObservation } from "../../../engine/auras/aura-observations.js";
import type { CombatState } from "../../../engine/state/combat-state.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import type { UnknownReason } from "../../../engine/state/state-result.js";
import {
  BLOOD_AURA_IDENTITIES,
  bloodAuraIdentityFor,
  type BloodAuraIdentity,
} from "../../../data/game/deathknight-blood-aura-authority.js";
import type { HeroTreeResolution, TalentResolution } from "../../../data/game/talent-selection.js";

/**
 * How far ahead of an observed Blood decision a transition of the queried
 * aura is refused as pre-decision evidence, in MILLISECONDS, inclusive.
 *
 * Validated on the Blood corpus (M11-B4 audit): the largest measured lead
 * of a cast's own aura effect is 20 ms; 50 ms refuses every measured case
 * with margin and costs one further Bone Shield and three further Essence
 * refusals over the 123 bundle decisions. NOT a causal-attribution rule: a
 * transition inside the window is refused whatever caused it.
 */
export const BLOOD_PRE_DECISION_WINDOW_MS = 50;

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
        /** A transition of this identity sits inside the pre-decision window ahead of the decision; see the module header. */
        | "PRE_DECISION_WINDOW_TRANSITION";
      readonly abilityGameId: number | null;
      readonly auraReason: UnknownReason | null;
      /** The refused transition and its lead, for PRE_DECISION_WINDOW_TRANSITION; null otherwise. */
      readonly windowTransition: BloodWindowTransition | null;
    };

/** One transition refused as pre-decision evidence, with its measured lead. */
export interface BloodWindowTransition {
  readonly position: number;
  readonly reportTimeMs: number;
  readonly operation: AuraObservation["operation"];
  readonly isStackChange: boolean;
  /** `decision.reportTimeMs - transition.reportTimeMs`, milliseconds; 0 for the same millisecond. */
  readonly leadMs: number;
}

export type BloodStackProof =
  | BloodAuraProof
  | "PROVEN_INACTIVE"
  /** The last stack-bearing transition's absolute count, with nothing but same-millisecond companions after it. */
  | "EXACT_STACK_OBSERVATION"
  /** The identity's pinned `applicationStack`, from a plain application preceded by a removal or by nothing (M11-B6). */
  | "EXACT_STACK_APPLICATION";

/** The anchor an exact count was read at: the observation the rule bound from. */
export interface BloodStackAnchor {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly operation: AuraObservation["operation"];
  readonly isStackChange: boolean;
  readonly reportTimeMs: number;
}

/** An exact stack proof, or the reason none holds. */
export type BloodStackBinding =
  | {
      readonly atomName: string;
      readonly state: "BOUND";
      readonly stack: number;
      readonly abilityGameId: number;
      readonly proof: BloodStackProof;
      /** The observation the count was read at, for the two exact proofs; null for the zero proofs. */
      readonly anchor: BloodStackAnchor | null;
      readonly basis: string;
    }
  | {
      readonly atomName: string;
      readonly state: "UNBOUND";
      readonly reason:
        | "IDENTITY_NOT_PINNED"
        | "AURA_STATE_UNKNOWN"
        | "PRE_DECISION_WINDOW_TRANSITION"
        /** ACTIVE, and this atom is not one the exact-count rule covers. */
        | "AURA_ACTIVE_COUNT_NOT_RECONSTRUCTED"
        /** ACTIVE, but no transition carrying a count precedes the decision. */
        | "NO_STACK_OBSERVATION"
        /** ACTIVE, but an initial application or a lone refresh sits between the last count and the decision. */
        | "COUNT_AMBIGUOUS_SINCE_OBSERVATION"
        /** ACTIVE from a plain application, but the transition before it shows the aura already held (M11-B6). */
        | "APPLICATION_WHILE_ACTIVE_UNPINNED";
      readonly abilityGameId: number | null;
      readonly detail: string | null;
      /** The refused transition and its lead, for PRE_DECISION_WINDOW_TRANSITION; null otherwise. */
      readonly windowTransition: BloodWindowTransition | null;
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

/** The atoms whose exact positive count the Blood rule reconstructs: those whose pinned identity carries an `exactCount` rule. */
export const EXACT_COUNT_ATOMS: readonly string[] = BLOOD_AURA_IDENTITIES.filter(
  (identity) => identity.exactCount !== null,
).map((identity) => identity.atomName);

/** The build proof that makes an aura impossible for this actor, or `null`. */
export function impossibleByBuild(
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

export function identityQuery(input: BloodAuraInput, identity: BloodAuraIdentity) {
  return {
    target: targetRef(input.actorId, null),
    abilityGameId: identity.abilityGameId,
    auraClass: identity.auraClass,
    source: fromSource(sourceRef(input.actorId, null)),
  } as const;
}

/**
 * The LATEST transition of this identity inside the pre-decision window
 * ahead of the decision in canonical order, or `null` when there is none
 * (or the position holds no event). The engine primitive takes the window as
 * an argument; the 50 ms is Blood's.
 */
export function preDecisionWindowTransition(
  input: BloodAuraInput,
  identity: BloodAuraIdentity,
): BloodWindowTransition | null {
  const found = input.state.auras.transitionsWithinBefore(
    identityQuery(input, identity),
    input.position,
    BLOOD_PRE_DECISION_WINDOW_MS,
  );
  const last = found[found.length - 1];
  if (last === undefined) return null;
  return {
    position: last.observation.position,
    reportTimeMs: last.observation.reportTimeMs,
    operation: last.observation.operation,
    isStackChange: last.observation.isStackChange,
    leadMs: last.leadMs,
  };
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
      windowTransition: null,
    };
  }
  if (identity.auraClass === "DEBUFF") {
    return {
      atomName,
      state: "UNBOUND",
      reason: "DEBUFF_NOT_BINDABLE",
      abilityGameId: identity.abilityGameId,
      auraReason: null,
      windowTransition: null,
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
  const windowTransition = preDecisionWindowTransition(input, identity);
  if (windowTransition !== null) {
    return {
      atomName,
      state: "UNBOUND",
      reason: "PRE_DECISION_WINDOW_TRANSITION",
      abilityGameId: identity.abilityGameId,
      auraReason: null,
      windowTransition,
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
      windowTransition: null,
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

function anchorOf(observation: AuraObservation): BloodStackAnchor {
  return {
    position: observation.position,
    locator: observation.locator,
    operation: observation.operation,
    isStackChange: observation.isStackChange,
    reportTimeMs: observation.reportTimeMs,
  };
}

/** Whether a transition is a plain application: applied, no stack change, no count. */
function isPlainApplication(transition: AuraObservation): boolean {
  return (
    transition.operation === "APPLIED" && !transition.isStackChange && transition.observedStacks === null
  );
}

/**
 * The exact positive count at the decision under the Blood rule, given a
 * presence already proven EXACT ACTIVE, or the reason none holds.
 */
function exactCountFromObservation(
  input: BloodAuraInput,
  identity: BloodAuraIdentity,
  rule: NonNullable<BloodAuraIdentity["exactCount"]>,
  presenceAnchor: AuraObservation,
):
  | {
      readonly stack: number;
      readonly proof: "EXACT_STACK_OBSERVATION" | "EXACT_STACK_APPLICATION";
      readonly anchor: BloodStackAnchor;
      readonly basis: string;
    }
  | {
      readonly reason:
        "NO_STACK_OBSERVATION" | "COUNT_AMBIGUOUS_SINCE_OBSERVATION" | "APPLICATION_WHILE_ACTIVE_UNPINNED";
      readonly detail: string;
    } {
  const query = identityQuery(input, identity);
  // The fresh-application clause (M11-B6), for a rule that pins the count a
  // plain application establishes. The presence anchor is the LAST transition
  // of the identity before the decision (M4 anchors on it and earned coverage
  // from it), so when it is a plain application nothing of the identity
  // follows it; the transition before it decides whether the application was
  // fresh.
  if (rule.applicationStack !== null && isPlainApplication(presenceAnchor)) {
    const track = input.state.auras.trackFor(query);
    const earlier = (track?.positions ?? []).filter((position) => position < presenceAnchor.position);
    const previousPosition = earlier[earlier.length - 1];
    const previous =
      previousPosition === undefined ? null : input.state.auras.observationAt(previousPosition);
    if (previous !== null && !(previous.operation === "REMOVED" && !previous.isStackChange)) {
      return {
        reason: "APPLICATION_WHILE_ACTIVE_UNPINNED",
        detail:
          `the presence anchor is a plain application at report time ${String(presenceAnchor.reportTimeMs)}, but the ` +
          `transition of this identity before it is a ${previous.operation}${previous.isStackChange ? " (stack change)" : ""} ` +
          `at ${String(previous.reportTimeMs)} that shows the aura already held; an application to a held aura is not ` +
          "the shape the pinned fresh-application count describes, so no count is bound",
      };
    }
    return {
      stack: rule.applicationStack,
      proof: "EXACT_STACK_APPLICATION",
      anchor: anchorOf(presenceAnchor),
      basis:
        `the presence anchor is a plain application (report time ${String(presenceAnchor.reportTimeMs)}) carrying no ` +
        `count, ${
          previous === null
            ? "no transition of this identity precedes it in the track"
            : `the transition before it is the removal at ${String(previous.reportTimeMs)}`
        }, and the pinned mechanics apply exactly ${String(rule.applicationStack)} on a fresh application; M4 proves ` +
        "the aura ACTIVE at the decision under coverage",
    };
  }
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
    proof: "EXACT_STACK_OBSERVATION",
    anchor: anchorOf(observation),
    basis:
      `the last stack-bearing transition before the decision (${observation.operation}, report time ` +
      `${String(observation.reportTimeMs)}) reports ${String(observation.observedStacks)}, every later transition ` +
      `up to the decision is a same-millisecond refresh companion (${String(between.length)}), and M4 proves the ` +
      "aura ACTIVE at the decision under coverage",
  };
}

/**
 * Binds `buff.<name>.stack`: zero under the three impossibility/inactivity
 * proofs for every pinned stack atom, and the exact positive count for the
 * identities carrying an `exactCount` rule under the Blood rule. Everything
 * else is UNBOUND with the reason.
 */
export function bindBloodStack(input: BloodAuraInput, atomName: string): BloodStackBinding {
  const identity = bloodAuraIdentityFor(atomName);
  if (identity === null) {
    return {
      atomName,
      state: "UNBOUND",
      reason: "IDENTITY_NOT_PINNED",
      abilityGameId: null,
      detail: null,
      windowTransition: null,
    };
  }
  const presence = bindBloodAura(input, atomName);
  if (presence.state === "UNBOUND") {
    return {
      atomName,
      state: "UNBOUND",
      reason:
        presence.reason === "PRE_DECISION_WINDOW_TRANSITION"
          ? "PRE_DECISION_WINDOW_TRANSITION"
          : "AURA_STATE_UNKNOWN",
      abilityGameId: identity.abilityGameId,
      detail: presence.auraReason,
      windowTransition: presence.windowTransition,
    };
  }
  if (!presence.up) {
    return {
      atomName,
      state: "BOUND",
      stack: 0,
      abilityGameId: identity.abilityGameId,
      proof: presence.proof === "OBSERVED" ? "PROVEN_INACTIVE" : presence.proof,
      anchor: null,
      basis: presence.basis,
    };
  }
  const rule = identity.exactCount;
  if (rule === null) {
    return {
      atomName,
      state: "UNBOUND",
      reason: "AURA_ACTIVE_COUNT_NOT_RECONSTRUCTED",
      abilityGameId: identity.abilityGameId,
      detail: `the aura is ACTIVE and no Blood exact-count rule is pinned for ${atomName} (${EXACT_COUNT_ATOMS.join(", ")} only)`,
      windowTransition: null,
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
      windowTransition: null,
    };
  }
  const count = exactCountFromObservation(input, identity, rule, anchor);
  if ("reason" in count) {
    return {
      atomName,
      state: "UNBOUND",
      reason: count.reason,
      abilityGameId: identity.abilityGameId,
      detail: count.detail,
      windowTransition: null,
    };
  }
  return {
    atomName,
    state: "BOUND",
    stack: count.stack,
    abilityGameId: identity.abilityGameId,
    proof: count.proof,
    anchor: count.anchor,
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
