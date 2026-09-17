/**
 * Two different questions about one APL entry, and the order they are asked in.
 *
 *     APPLICABILITY  does this entry exist as a selectable foreground action
 *                    for this player at all?
 *     USABILITY      it exists — could it fire at this instant?
 *
 * THE ORDER IS THE PINNED ONE, NOT A CONVENIENCE
 *
 * `player_t::select_action` (player.cpp:14229-14230):
 *
 *     if ( a->background ) continue;
 *
 * happens BEFORE `action_ready()`. And inside `action_ready()` (action.cpp:2567)
 * the readiness check comes first:
 *
 *     if ( !ready() ) return false;      // cooldown, resources, …
 *     …
 *     if ( if_expr && !if_expr->success() ) return false;   // the APL condition
 *
 * So the real evaluation order is:
 *
 *     applicability  ->  usability  ->  condition
 *
 * That has a consequence worth stating plainly: an action that is not
 * applicable, or is proven unusable, NEVER HAS ITS CONDITION EVALUATED. Several
 * pinned `items` and `misc_cds` conditions contain syntax outside the supported
 * subset, and under this ordering that syntax is simply never reached. Getting
 * the order wrong would turn a decided entry into a parser refusal.
 *
 * WHY NOT ONE BOOLEAN
 *
 * "Does not apply to this player" and "applies but is not ready" have different
 * remedies and different meanings. A wrong-race racial is not on cooldown; an
 * unequipped trinket is not waiting to recharge. Collapsing them would let a
 * profile gap read as a timing fact.
 *
 * BOTH NEGATIVES REQUIRE POSITIVE EVIDENCE
 *
 * `NOT_APPLICABLE` and `PROVEN_UNUSABLE` are claims, not defaults. Each carries
 * the evidence that established it. "We did not observe it" is neither — that is
 * `UNKNOWN`, and no caller may read `UNKNOWN` as either negative.
 */

import type { AplAction } from "./apl-authority.js";

// --------------------------------------------------------------------------
// Applicability
// --------------------------------------------------------------------------

/**
 * Why an entry is not a selectable action for this player.
 *
 * Each member corresponds to a `background = true` assignment in the pinned
 * source. Only reasons C3c2 actually produces are listed.
 */
export type NotApplicableReason =
  /** `use_item,name=<x>` where the actor does not equip `<x>` (player.cpp:9874-9884). */
  | "ITEM_NOT_EQUIPPED"
  /** A slot whose equipped item has no `SPECIAL_EFFECT_USE` (player.cpp:10024-10029, 10285-10290). */
  | "NO_ON_USE_EFFECT"
  /**
   * A racial the player's race does not have (M5-C3c3c).
   *
   * `racial_spell_t::init` sets `background = true` when `find_racial_spell`
   * returns `not_found()` (player.cpp:8995-9001), and the scan skips background
   * actions before any readiness check. Structurally identical to an unequipped
   * item: the action is not there, rather than being there and unready.
   */
  | "RACIAL_NOT_AVAILABLE_TO_RACE"
  /**
   * An action whose pinned constructor sets `background = true` under a build
   * fact the actor's observed combatant profile PROVES (M10-C).
   *
   * The general form of the three above: a talent not taken, a talent that
   * replaces the action, a hero tree not active. The specialization that
   * claims it names the constructor site and the proven fact in
   * `pinnedBehaviour`. An UNKNOWN build fact never lands here — the action
   * stays applicable, because there is a world in which it exists.
   */
  | "BACKGROUND_UNDER_PROVEN_BUILD";

export const NOT_APPLICABLE_REASONS = [
  "ITEM_NOT_EQUIPPED",
  "NO_ON_USE_EFFECT",
  "RACIAL_NOT_AVAILABLE_TO_RACE",
  "BACKGROUND_UNDER_PROVEN_BUILD",
] as const satisfies readonly NotApplicableReason[];

/** Numeric evidence behind an applicability verdict. Never a display name. */
export interface ApplicabilityEvidence {
  /** The item the verdict is about, when it is about one. */
  readonly itemId: number | null;
  /** The SimulationCraft slot token, when the entry addresses a slot. */
  readonly slot: string | null;
  /** The pinned `background = true` site this mirrors. Author-written. */
  readonly pinnedBehaviour: string;
}

export type ActionApplicability =
  | { readonly kind: "APPLICABLE" }
  | {
      readonly kind: "NOT_APPLICABLE";
      readonly reason: NotApplicableReason;
      readonly evidence: ApplicabilityEvidence;
    }
  | {
      /**
       * Profile evidence is missing. NOT a negative claim.
       *
       * A racial whose race is unknown lands here: there is a world in which the
       * action exists, so it cannot be skipped.
       */
      readonly kind: "UNKNOWN";
      readonly detail: string;
    };

export function applicable(): ActionApplicability {
  return { kind: "APPLICABLE" };
}

export function notApplicable(
  reason: NotApplicableReason,
  evidence: ApplicabilityEvidence,
): ActionApplicability {
  return { kind: "NOT_APPLICABLE", reason, evidence };
}

export function unknownApplicability(detail: string): ActionApplicability {
  return { kind: "UNKNOWN", detail };
}

/** Supplies applicability for one entry. Takes the whole action, not just its token. */
export type ActionApplicabilityResolver = (action: AplAction) => ActionApplicability;

/** The default when a caller models no applicability: everything applies. */
export function allApplicable(): ActionApplicabilityResolver {
  return () => applicable();
}

// --------------------------------------------------------------------------
// Usability
// --------------------------------------------------------------------------

/**
 * Why an applicable action provably could not fire.
 *
 * `PROVEN_UNUSABLE` means POSITIVE evidence that SimulationCraft's `ready()`
 * cannot succeed here. It never means "we did not observe it" and never means
 * "we do not know" — both of those are `UNKNOWN`.
 */
export type UnusableReason =
  /**
   * A cooldown is provably still running.
   *
   * "Provably" is doing real work: SimulationCraft treats a cooldown as ready
   * once it is within `cooldown_tolerance` of expiring, so a positive remainder
   * is NOT sufficient. See `cooldown-usability.ts`.
   */
  | "ACTIVE_COOLDOWN"
  /**
   * The action's own `ready()` is false regardless of combat state.
   *
   * `invoke_external_buff` with an empty external-buff pool is the case C3c2
   * needs: its buff pointer is nulled at initialization and `ready()` returns
   * false for the rest of the simulation.
   */
  | "STATIC_READY_FALSE"
  /**
   * The action re-enters a state the player is already in (M5-C3c3a).
   *
   * Narrow by construction, and named after the state rather than after the
   * action: it means a readiness guard tested a state that is PROVEN to hold.
   * The one case C3c3a produces is Stealth under a proven `stealthed.rogue`,
   * where SimulationCraft's guard and the APL expression pass the identical
   * mask to the identical function.
   *
   * NOT a timing fact. Nothing here is waiting to come off cooldown, and a
   * report that said so would describe the wrong remedy.
   */
  | "ALREADY_STEALTHED"
  /**
   * Re-stealthing is not permitted while a living enemy is engaged (M5-D1).
   *
   * The COMPLEMENT of `ALREADY_STEALTHED`, and kept separate because the two
   * describe opposite situations and have opposite remedies. That one says the
   * player is already in the state the action produces; this one says the player
   * is not, and the game will not let them re-enter it mid-fight.
   *
   * `stealth_t::ready()` reaches its final `return ready()` only when every enemy
   * is asleep or dead — `restealth_allowed` is enabled nowhere else. So in combat
   * with one living enemy the guard is false whatever the cooldown says. NOT a
   * timing fact: nothing is waiting to recharge.
   */
  | "RESTEALTH_NOT_PERMITTED_IN_COMBAT"
  /**
   * The action's resource cost is provably unaffordable: the resource is
   * KNOWN below the pinned cost and every free-cast route is excluded.
   */
  | "INSUFFICIENT_RESOURCE"
  /**
   * The action re-enters a state the player already holds (M5-D1).
   *
   * `vanish_t::ready()` opens with `if ( p()->buffs.vanish->check() ) return
   * false;` (sc_rogue.cpp:6046-6052). Distinct from `ALREADY_STEALTHED`, which is
   * about the four-aura `stealthed.rogue` MASK and a different function: this one
   * tests ONE named buff, and the two sets are not the same — a player under
   * Subterfuge satisfies the mask and does not satisfy this.
   */
  | "VANISH_BUFF_ALREADY_ACTIVE"
  /**
   * The action already fired earlier in a HYPOTHETICAL prefix (M5-C3c3c).
   *
   * THE ONLY COUNTERFACTUAL MEMBER OF THIS UNION, and it is named so that can
   * never be missed. Every other reason states something about the fight that
   * happened: an item was not equipped, a cooldown was observed running, the
   * player was observed stealthed. This one states something about a branch of a
   * simulation — "in the world being explored, this entry has already been
   * selected once" — and it must never be read as evidence about the log.
   *
   * It exists because the first-GCD query lets actions fire and asks the
   * authority again. Representing that as `ACTIVE_COOLDOWN` would put a
   * hypothetical cooldown into the same field as a derived one, and a reader
   * could not then tell which kind of claim they were looking at.
   */
  | "SIMULATED_PREFIX_EXECUTION";

export const UNUSABLE_REASONS = [
  "ACTIVE_COOLDOWN",
  "STATIC_READY_FALSE",
  "ALREADY_STEALTHED",
  "RESTEALTH_NOT_PERMITTED_IN_COMBAT",
  "VANISH_BUFF_ALREADY_ACTIVE",
  "SIMULATED_PREFIX_EXECUTION",
  "INSUFFICIENT_RESOURCE",
] as const satisfies readonly UnusableReason[];

/**
 * The reasons that describe the OBSERVED fight rather than a simulated branch.
 *
 * Exported so a consumer that must not mix the two can check rather than
 * remember. A finding built from `SIMULATED_PREFIX_EXECUTION` would be a claim
 * about a world nobody observed.
 */
export const OBSERVED_UNUSABLE_REASONS = [
  "ACTIVE_COOLDOWN",
  "STATIC_READY_FALSE",
  "ALREADY_STEALTHED",
  "RESTEALTH_NOT_PERMITTED_IN_COMBAT",
  "VANISH_BUFF_ALREADY_ACTIVE",
  "INSUFFICIENT_RESOURCE",
] as const satisfies readonly UnusableReason[];

/**
 * Evidence behind a negative usability claim.
 *
 * Deliberately free-form in its `detail` but structured in its identities, so a
 * finding can show both what was proven and about which numeric ability.
 */
export interface UnusableEvidence {
  /** The ability or effect spell the claim rests on, when there is one. */
  readonly abilityGameId: number | null;
  /** The item the claim rests on, when there is one. */
  readonly itemId: number | null;
  /** MILLISECONDS proven remaining, for a cooldown claim. */
  readonly provenRemainingAtLeastMs: number | null;
  /** The tolerance the remainder was compared against, for a cooldown claim. */
  readonly cooldownToleranceMs: number | null;
  /** Safe, author-written detail. Never interpolated from upstream data. */
  readonly detail: string;
}

/**
 * Whether an action could fire, with the evidence behind a negative answer.
 *
 * A discriminated union rather than a bare string, because only the negative
 * member needs evidence and forcing the other two to carry empty fields would
 * invite filling them in.
 */
export type ActionUsabilityVerdict =
  | { readonly kind: "PROVEN_USABLE" }
  | {
      readonly kind: "PROVEN_UNUSABLE";
      readonly reason: UnusableReason;
      readonly evidence: UnusableEvidence;
    }
  | { readonly kind: "UNKNOWN" };

export function provenUsable(): ActionUsabilityVerdict {
  return { kind: "PROVEN_USABLE" };
}

export function provenUnusable(reason: UnusableReason, evidence: UnusableEvidence): ActionUsabilityVerdict {
  return { kind: "PROVEN_UNUSABLE", reason, evidence };
}

export function unknownUsability(): ActionUsabilityVerdict {
  return { kind: "UNKNOWN" };
}

/** Supplies a usability verdict for one entry. */
export type ActionUsabilityVerdictResolver = (action: AplAction) => ActionUsabilityVerdict;

// --------------------------------------------------------------------------
// Gate irrelevance
// --------------------------------------------------------------------------

/**
 * WHEN AN UNREADABLE CONDITION DOES NOT MATTER (M5-D1).
 *
 * THE HIGHEST-RISK RULE IN THE MILESTONE, so it is also the most constrained.
 *
 * The default for an unparseable player-action condition is to BLOCK the scan,
 * and that is right almost always: we cannot tell whether the entry fires, so
 * nothing below it is reachable soundly. But a measured census of 42 real
 * actor-19 decision points found the deepest blocker at `items[5] use_items` in
 * 28 of them — an entry that is NON_GCD, has a reviewed execution contract, and
 * whose only effect is a stat buff nothing on the path to the answer reads.
 *
 * In that situation both worlds converge:
 *
 *     gate FALSE  ->  the entry does not fire, the scan continues
 *     gate TRUE   ->  the entry fires, executes, and a NEW scan begins at the
 *                     root with the same relevant state
 *
 * so refusing to explore either is refusing to answer a question the evidence
 * settles. This resolver is how a specialization says, with evidence, that a
 * specific entry is in that situation.
 *
 * WHAT IT IS NOT, AND THE DISTINCTION IS LOAD-BEARING
 *
 * It does NOT say the gate is TRUE. It says the gate is UNREAD and the entry
 * MAY fire. The step keeps its `UNSUPPORTED` condition verbatim, and the
 * candidate it contributes is never `definite`, so no path exists by which an
 * unread condition becomes a confident selection.
 *
 * IT CAN NEVER APPLY TO A GCD-CONSUMING ACTION. For those the two worlds do not
 * converge at all — "it fires" IS the answer to the first-GCD query — so a
 * GCD entry with an unread gate would be exactly the laundering this project
 * forbids. `lane` is typed as the single literal `"NON_GCD"` so a GCD action is
 * undescribable here, and `firstGcdSelectionAcrossRescans` refuses one
 * structurally as well, because a type is not a runtime guard.
 */
export interface GateIrrelevanceEvidence {
  /**
   * The execution lane, and the type has exactly one member on purpose.
   *
   * A resolver must have ESTABLISHED the lane from pinned data to write this.
   * `GCD_CONSUMING` and `UNKNOWN_LANE` are unspellable rather than merely wrong.
   */
  readonly lane: "NON_GCD";
  /** The reviewed transition contract this rests on. Author-written provenance. */
  readonly transitionProvenance: string;
  /** MILLISECONDS. Only zero is admissible; a non-zero value is refused. */
  readonly timeAdvanceMs: 0;
  /**
   * How the action stops being selectable, so the branch cannot re-fire forever.
   *
   * A string rather than a boolean: an author has to name the mechanism, which
   * is harder to write carelessly than a `true`.
   */
  readonly progressMechanism: string;
  /**
   * Every state the execution writes has been reviewed AND none of it is read on
   * the path to the answer.
   *
   * Two literal `true`s rather than one, because they are two different claims
   * and a reviewer who checked one may not have checked the other.
   */
  readonly writesReviewed: true;
  readonly writesOutsideDecisionProjection: true;
  /** What was reviewed, in words, so the claim can be checked rather than trusted. */
  readonly detail: string;
}

export type GateIrrelevance =
  | { readonly kind: "GATE_IRRELEVANT"; readonly evidence: GateIrrelevanceEvidence }
  /** The default. No claim, so the scan blocks on the unreadable condition. */
  | { readonly kind: "NOT_ESTABLISHED" };

export const GATE_IRRELEVANCE_KINDS = [
  "GATE_IRRELEVANT",
  "NOT_ESTABLISHED",
] as const satisfies readonly GateIrrelevance["kind"][];

export function gateIrrelevant(evidence: GateIrrelevanceEvidence): GateIrrelevance {
  return { kind: "GATE_IRRELEVANT", evidence };
}

export function gateIrrelevanceNotEstablished(): GateIrrelevance {
  return { kind: "NOT_ESTABLISHED" };
}

/**
 * Supplies a gate-irrelevance claim for one entry.
 *
 * OPTIONAL everywhere it is accepted, and its absence means every unreadable
 * condition blocks — exactly the pre-M5-D1 behaviour.
 */
export type GateIrrelevanceResolver = (action: AplAction) => GateIrrelevance;

/** The default resolver: no entry is ever gate-irrelevant. */
export function noGateIrrelevance(): GateIrrelevanceResolver {
  return () => gateIrrelevanceNotEstablished();
}
