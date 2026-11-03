/**
 * The support-observation view (M13-F) — what a projector may read of a
 * support specialization's observations.
 *
 * WHAT THIS IS
 *
 * The observable support facts of an analysis whose support decisions have no
 * authority, restated as internal data: buff windows on each recipient with
 * the recipient's identity, stated specialization, observed deaths and
 * observed casts of reviewed cooldowns; proven support time; the supporter's
 * own buff windows; every support-ability cast; and, per support decision
 * family, why it was not evaluated. It is supplied by the analyzer's
 * REGISTRATION through an adapter the specialization owns, exactly as the
 * observed-decision view is (`observed-decision-view.ts`), and shared code
 * cannot reach past it into the specialization's payload.
 *
 * WHAT THIS IS NOT
 *
 * Not a verdict. There is no expected action, no "good" or "wrong"
 * recipient, no timing grade. `supportDecisions` carries only
 * NO_AUTHORITY_AVAILABLE (no standard) or UNKNOWN (a standard without the
 * evidence to apply it); a recipient-quality conclusion has no field to sit
 * in, so it cannot be published by accident.
 *
 * WHY MOST VOCABULARY FIELDS ARE PLAIN STRINGS
 *
 * As in the observed-decision view: the values are owned by the shared
 * support primitives and the specialization, and FROZEN by the public schema,
 * which validates every value at the wire. Discriminators are the exception —
 * they are literal unions here so a projector can switch on them.
 *
 * NO KEY NAMED `state`. The public contract reserves that key from the wire,
 * so every discriminator here already has its public name.
 */

import type { EvidenceLocator } from "../engine/evidence/locator.js";

export const SUPPORT_OBSERVATIONS_REVISION = "support-observations/1" as const;

/** A report-relative interval, both ends as observed. */
export interface SupportSpanRecord {
  readonly fromReportTimeMs: number;
  readonly toReportTimeMs: number;
  readonly upperBound: string;
}

export type SupportWindowBoundRecord =
  | {
      readonly observation: "OBSERVED";
      readonly reportTimeMs: number;
      readonly rawType: string;
      readonly evidence: EvidenceLocator;
    }
  | { readonly observation: "NOT_OBSERVED"; readonly reason: string };

export type SupportRecipientRecord =
  | {
      readonly actorId: number;
      readonly instanceId: number | null;
      readonly catalog: "NOT_IN_CATALOG";
    }
  | {
      readonly actorId: number;
      readonly instanceId: number | null;
      readonly catalog: "LISTED";
      readonly actorType: string;
      /** The catalog's class string for a player, verbatim; null when none. */
      readonly subType: string | null;
      readonly ownership:
        | { readonly kind: "NOT_A_PET" }
        | { readonly kind: "OWNED_BY"; readonly ownerActorId: number }
        | { readonly kind: "OWNER_NOT_STATED" };
      readonly isSupporter: boolean;
    };

export interface SupportWindowRecord {
  readonly recipient: SupportRecipientRecord;
  readonly start: SupportWindowBoundRecord;
  readonly end: SupportWindowBoundRecord;
  /** Refreshes and stack changes inside the window, as evidence only. */
  readonly activeObservations: readonly EvidenceLocator[];
  /** Earliest to latest observed transition. Active only AT those instants unless `continuity` is ESTABLISHED. */
  readonly observedSpan: SupportSpanRecord;
  readonly continuity:
    | { readonly continuity: "ESTABLISHED" }
    | { readonly continuity: "NOT_ESTABLISHED"; readonly reason: string };
  /** The only span proven continuously active; null unless continuity is ESTABLISHED. */
  readonly activeSpan: SupportSpanRecord | null;
}

export type SupportRecipientSpecializationRecord =
  | { readonly specification: "STATED"; readonly className: string; readonly specName: string }
  | { readonly specification: "UNKNOWN"; readonly reason: string };

export type SupportCooldownIdentityRecord =
  | {
      readonly identification: "IDENTIFIED";
      readonly rosterKey: string;
      readonly abilityGameIds: readonly number[];
      /** The reviewed ids, never every cooldown of the specialization. */
      readonly coverage: "REVIEWED_SUBSET";
      readonly criterion: string;
      readonly datasetId: string;
      readonly artifactRevision: string;
    }
  | {
      readonly identification: "UNKNOWN";
      readonly reason: "SPECIALIZATION_NOT_ESTABLISHED";
      readonly specializationReason: string;
    }
  | { readonly identification: "UNKNOWN"; readonly reason: "REGISTRY_UNAVAILABLE" }
  | {
      readonly identification: "UNSUPPORTED";
      readonly reason: "NO_REVIEWED_COOLDOWN_IDENTITY";
      readonly className: string;
      readonly specName: string;
    };

export interface SupportTimedEvidenceRecord {
  readonly reportTimeMs: number;
  /** Same report millisecond as a span bound: which came first is not known. */
  readonly atSpanBound: boolean;
  readonly evidence: EvidenceLocator;
}

export interface SupportSurvivalRecord {
  readonly inSpan:
    | {
        readonly observation: "DEATH_OBSERVED_IN_SPAN";
        readonly deaths: readonly SupportTimedEvidenceRecord[];
      }
    /** Positive-only: no death event was seen. Never "alive". */
    | { readonly observation: "NO_DEATH_OBSERVED" };
  readonly nextDeathAfterEnd:
    | {
        readonly observation: "OBSERVED";
        readonly reportTimeMs: number;
        readonly msAfterObservedEnd: number;
        readonly evidence: EvidenceLocator;
      }
    | { readonly observation: "NONE_OBSERVED" }
    | { readonly observation: "END_NOT_OBSERVED" };
}

export type SupportCooldownOverlapRecord =
  | { readonly overlap: "NO_COOLDOWN_IDENTITY" }
  | { readonly overlap: "CONTINUITY_NOT_ESTABLISHED"; readonly reason: string }
  | {
      readonly overlap: "LISTED";
      readonly casts: readonly (SupportTimedEvidenceRecord & { readonly abilityGameId: number })[];
      readonly listing:
        | { readonly completeness: "COMPLETE" }
        | { readonly completeness: "OBSERVED_ONLY"; readonly reason: string }
        | {
            readonly completeness: "OBSERVED_ONLY";
            readonly reason: "AMBIGUOUS_CASTS";
            readonly unidentifiedCasts: number;
            readonly unattributedCasts: number;
          };
    };

export interface SupportAllyWindowRecord extends SupportWindowRecord {
  readonly recipientSpecialization: SupportRecipientSpecializationRecord;
  readonly recipientCooldownIdentity: SupportCooldownIdentityRecord;
  readonly survival: SupportSurvivalRecord;
  readonly cooldownOverlap: SupportCooldownOverlapRecord;
}

/** Real, but possibly less than the truth; or nothing proven. Never "at least 0" by default. */
export type SupportProvenAmountRecord =
  | { readonly bound: "AT_LEAST"; readonly ms: number; readonly caveats: readonly string[] }
  | { readonly bound: "UNKNOWN"; readonly caveats: readonly string[] };

export interface SupportTimeRecord {
  readonly anyRecipient: SupportProvenAmountRecord;
  readonly byRecipient: readonly {
    readonly actorId: number;
    readonly instanceId: number | null;
    readonly windows: number;
    readonly proven: SupportProvenAmountRecord;
  }[];
  readonly peakConcurrentWindows:
    { readonly bound: "AT_LEAST"; readonly count: number } | { readonly bound: "UNKNOWN" };
}

export type SupportWindowListingRecord =
  { readonly completeness: "COMPLETE" } | { readonly completeness: "OBSERVED_ONLY"; readonly reason: string };

export interface SupportAllyBuffRecord {
  /** The specialization's own ability token. */
  readonly ability: string;
  readonly auraAbilityGameId: number;
  readonly listing: SupportWindowListingRecord;
  /** Transitions that might be the supporter's but cannot be attributed. Never read as the supporter's. */
  readonly ambiguousTransitions: number;
  readonly windows: readonly SupportAllyWindowRecord[];
  readonly supportTime: SupportTimeRecord;
}

export interface SupportSelfBuffRecord {
  readonly ability: string;
  readonly auraAbilityGameId: number;
  readonly listing: SupportWindowListingRecord;
  readonly ambiguousTransitions: number;
  readonly windows: readonly SupportWindowRecord[];
}

export interface SupportCastRecord {
  readonly ability: string;
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  readonly evidence: EvidenceLocator;
}

export interface SupportCastListingRecord {
  readonly listing:
    | { readonly completeness: "COMPLETE" }
    | {
        readonly completeness: "UNKNOWN";
        readonly reason: string;
        readonly unidentifiedCasts: number;
        readonly unattributedCasts: number;
      };
  readonly casts: readonly SupportCastRecord[];
}

/**
 * Why a support decision family was not evaluated. The two refusals are
 * distinct and never stand in for each other (CLAUDE.md "UNKNOWN vs
 * NO_AUTHORITY_AVAILABLE"). There is no evaluated variant.
 */
export type SupportDecisionRecord =
  | {
      readonly category: "SUPPORT_TARGETING" | "SUPPORT_TIMING";
      readonly authorityStatus: "NO_AUTHORITY_AVAILABLE";
      readonly reason: string;
    }
  | {
      readonly category: "SUPPORT_TARGETING" | "SUPPORT_TIMING";
      readonly authorityStatus: "UNKNOWN";
      readonly modelId: string;
      readonly missing: {
        readonly recipientActorId: number;
        readonly evidenceCategory: string;
        readonly reason: string;
      };
    };

export interface SupportObservationView {
  readonly revision: typeof SUPPORT_OBSERVATIONS_REVISION;
  /** Identity data the facts were read with: runtime game data, never a decision authority. */
  readonly identityData: { readonly datasetId: string; readonly artifactRevision: string };
  readonly supportDecisions: readonly SupportDecisionRecord[];
  readonly allyBuffs: readonly SupportAllyBuffRecord[];
  readonly selfBuffs: readonly SupportSelfBuffRecord[];
  readonly supportCasts: SupportCastListingRecord;
}

/**
 * What a support registration says about one of its own results: the view,
 * or why no fact was reconstructed. Never an empty view standing in for
 * "nothing was observed".
 */
export type SupportObservationOutcome =
  | { readonly assessment: "ASSESSED"; readonly view: SupportObservationView }
  | {
      readonly assessment: "NOT_ASSESSED";
      readonly reason: "SUBJECT_SPECIALIZATION_NOT_STATED" | "IDENTITY_REFUSED" | "RUNTIME_DATA_UNAVAILABLE";
    };
