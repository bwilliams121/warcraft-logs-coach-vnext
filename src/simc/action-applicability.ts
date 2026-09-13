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
  | "NO_ON_USE_EFFECT";

export const NOT_APPLICABLE_REASONS = [
  "ITEM_NOT_EQUIPPED",
  "NO_ON_USE_EFFECT",
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
  | "ALREADY_STEALTHED";

export const UNUSABLE_REASONS = [
  "ACTIVE_COOLDOWN",
  "STATIC_READY_FALSE",
  "ALREADY_STEALTHED",
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
