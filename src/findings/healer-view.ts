/**
 * The healer view (HEAL-AP) — what a projector may read of a healer
 * specialization's results.
 *
 * WHAT THIS IS
 *
 * The healer finding set (`healer-finding.ts`) restated as plain data for the
 * public shape, plus the factual context each finding rests on: the planned
 * window an assignment outcome was judged in, and, for each observed
 * healing-cooldown use, the damage episodes that overlap it with their own
 * coverage. It is supplied by the analyzer's REGISTRATION through an adapter
 * the specialization owns, exactly as the support-observation view is
 * (`support-observation-view.ts`), and shared code cannot reach past it into
 * the specialization's payload.
 *
 * WHAT THIS IS NOT
 *
 * Not a ranking and not a healing-quality model. There is no HPS, no total, no
 * score, no "should have used" field and no plan-quality field. An assignment
 * outcome exists only under a supplied plan that binds the fight, and cites
 * it; a cooldown use is a fact with no verdict field; HEALING_DECISION has no
 * standard and says so.
 *
 * WHY THE OUTCOME AND REASON FIELDS ARE PLAIN STRINGS
 *
 * As in the observed-decision view: the values are owned by the
 * specialization and FROZEN by the public schema, which validates every value
 * at the wire. Discriminators are literal unions so a projector can switch on
 * them.
 *
 * NO KEY NAMED `state`, and no key named `status`: the public contract
 * reserves the first and uses the second as the document discriminator.
 */

import type { EvidenceLocator } from "../engine/evidence/locator.js";
import type { HealerCategoryResolution } from "./healer-finding.js";

export const HEALER_VIEW_REVISION = "healer-view/1" as const;

/** Actionability restated from `ActionabilityEvidence`: still only the two members, never a negative one. */
export type HealerActionabilityRecord =
  | { readonly actionability: "NOT_EVALUATED" }
  | {
      readonly actionability: "PROVEN_ACTIONABLE_BY_OBSERVED_EXECUTION";
      readonly abilityGameId: number;
      readonly position: number;
      readonly evidence: EvidenceLocator;
    };

export interface HealerAssignmentRecord {
  readonly findingId: string;
  readonly assignmentId: string;
  readonly abilityGameId: number;
  readonly result:
    | {
        readonly resolution: "OUTCOME";
        /** The specialization's assignment-execution outcome. */
        readonly outcome: string;
        /** The planned window the outcome was judged in, report-relative, bounds inclusive. */
        readonly window: { readonly fromReportTimeMs: number; readonly toReportTimeMs: number };
        readonly actionability: HealerActionabilityRecord;
      }
    | { readonly resolution: "UNKNOWN"; readonly reason: string };
  readonly evidence: readonly EvidenceLocator[];
}

/** Whether a list is every item. Only COMPLETE permits reading an absence. */
export type HealerSpanListingRecord =
  | { readonly completeness: "COMPLETE" }
  | {
      readonly completeness: "UNKNOWN";
      readonly beyondFightEdge: boolean;
      readonly uncoveredActors: readonly { readonly actorId: number; readonly reason: string }[];
      readonly unidentifiedHitsInSpan: number;
    };

export type HealerReceivedCoverageRecord =
  { readonly completeness: "COMPLETE" } | { readonly completeness: "UNKNOWN"; readonly reason: string };

export interface HealerEpisodeRecord {
  readonly abilityGameId: number;
  readonly firstHitMs: number;
  readonly lastHitMs: number;
  /** The episode's own DAMAGE coverage: UNKNOWN means its player set may be incomplete. */
  readonly coverage: HealerSpanListingRecord;
  readonly players: readonly {
    readonly actorId: number;
    /** HEALING and ABSORBS events from the subject or its stated pets on this player in the episode's window. A count of events, never an amount. */
    readonly observedEntriesFromSubject: number;
    readonly healing: HealerReceivedCoverageRecord;
    readonly absorbs: HealerReceivedCoverageRecord;
  }[];
}

export type HealerCooldownContextRecord =
  /** The friendly roster was not retrieved: nothing is said about overlap. */
  | { readonly context: "ROSTER_NOT_IN_SCOPE" }
  | {
      readonly context: "RECONSTRUCTED";
      /** The reporting span after the cast. Not an effect duration. */
      readonly spanMs: number;
      /** Whether `episodes` is every overlapping episode. */
      readonly listing: HealerSpanListingRecord;
      readonly episodes: readonly HealerEpisodeRecord[];
    };

export interface HealerCooldownUseRecord {
  readonly findingId: string;
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  readonly position: number;
  readonly evidence: readonly EvidenceLocator[];
  readonly healingContext: HealerCooldownContextRecord;
}

export interface HealerView {
  readonly revision: typeof HEALER_VIEW_REVISION;
  /** Identity data the cooldowns were identified with: runtime game data, never a decision authority. */
  readonly identityData: { readonly datasetId: string; readonly artifactRevision: string };
  /** Exactly ASSIGNMENT, COOLDOWN, HEALING_DECISION, in that order. */
  readonly categories: readonly HealerCategoryResolution[];
  /** One per ASSIGNMENT finding; empty unless ASSIGNMENT was EVALUATED_AGAINST_PLAN. */
  readonly assignments: readonly HealerAssignmentRecord[];
  /** One per COOLDOWN finding. */
  readonly cooldownUses: readonly HealerCooldownUseRecord[];
}

/**
 * What a healer registration says about one of its own results: the view, or
 * why nothing was evaluated. Never an empty view standing in for "nothing
 * found".
 */
export type HealerViewOutcome =
  | { readonly assessment: "ASSESSED"; readonly view: HealerView }
  | {
      readonly assessment: "NOT_ASSESSED";
      readonly reason:
        | "SUBJECT_SPECIALIZATION_NOT_STATED"
        | "IDENTITY_REFUSED"
        | "RUNTIME_DATA_UNAVAILABLE"
        | "RUNTIME_DATA_CONTRADICTED";
    };

/** Whether the view's ASSIGNMENT category was judged against the supplied plan. */
export function assignmentEvaluatedAgainstPlan(outcome: HealerViewOutcome): boolean {
  return (
    outcome.assessment === "ASSESSED" &&
    outcome.view.categories[0]?.category === "ASSIGNMENT" &&
    outcome.view.categories[0].resolution === "EVALUATED_AGAINST_PLAN"
  );
}
