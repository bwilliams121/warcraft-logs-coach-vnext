/**
 * Augmentation Evoker's support-observation view (M13-F).
 *
 * The specialization decides what its unanalyzed payload looks like to shared
 * code, exactly as a decision analyzer's registration does with its
 * observed-decision view. Every field is copied by name; nothing is derived,
 * ranked or judged here, and nothing in the payload that is not written below
 * reaches shared code.
 *
 * WHAT IS LEFT OUT, ON PURPOSE
 *
 * - The per-transition ambiguity detail: published as a count only, the same
 *   count the evaluator keeps. An ambiguous transition is never the Evoker's.
 * - The registry's internal `detail` message for an unusable registry.
 * - The engine's internal revisions of the shared primitives (the view has
 *   its own revision).
 *
 * WHAT FAILS CLOSED
 *
 * `ALLY_STATE_SUFFICIENT`: a recipient-quality model that could be applied.
 * No v1 caller declares a model, and a model's conclusions would need their
 * own reviewed public shape; publishing "the model could be applied" with no
 * conclusion beside it is meaningless, and publishing a conclusion is
 * forbidden. So this adapter throws, and the service reports an internal
 * error rather than a quieter document.
 */

import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import type { TimeRangeMs } from "../../../engine/evidence/coverage.js";
import {
  SUPPORT_OBSERVATIONS_REVISION,
  type SupportAllyWindowRecord,
  type SupportCooldownIdentityRecord,
  type SupportCooldownOverlapRecord,
  type SupportDecisionRecord,
  type SupportObservationOutcome,
  type SupportProvenAmountRecord,
  type SupportRecipientRecord,
  type SupportSpanRecord,
  type SupportSurvivalRecord,
  type SupportTimeRecord,
  type SupportWindowBoundRecord,
  type SupportWindowListingRecord,
  type SupportWindowRecord,
} from "../../../findings/support-observation-view.js";
import type {
  AllyBuffObservation,
  AugmentationEvokerEvaluation,
  RecipientWindowFacts,
  SupportTargetingStatus,
} from "./evaluator.js";

// The evaluator owns its result types; this adapter reads them through it, so
// the shared support primitives keep their one named consumer (the evaluator).
type SupportAuraWindow = RecipientWindowFacts["window"];
type WindowBound = SupportAuraWindow["start"];
type StatedSpecialization = RecipientWindowFacts["recipientSpecialization"];
type RecipientCooldownIdentityResolution = RecipientWindowFacts["recipientCooldownIdentity"];
type RecipientSurvival = RecipientWindowFacts["survival"];
type CooldownOverlap = RecipientWindowFacts["cooldownOverlap"];
type SupportTime = AllyBuffObservation["supportTime"];
type ProvenAmount = SupportTime["anyRecipient"];
type WindowListing = AllyBuffObservation["listing"];

const span = (range: TimeRangeMs): SupportSpanRecord => ({
  fromReportTimeMs: range.fromReportTimeMs,
  toReportTimeMs: range.toReportTimeMs,
  upperBound: range.upperBound,
});

const locator = (value: EvidenceLocator): EvidenceLocator => ({
  streamId: value.streamId,
  pageOrdinal: value.pageOrdinal,
  indexInPage: value.indexInPage,
  ingestionOrdinal: value.ingestionOrdinal,
  rawType: value.rawType,
  reportTimeMs: value.reportTimeMs,
});

function bound(value: WindowBound): SupportWindowBoundRecord {
  return value.kind === "OBSERVED"
    ? {
        observation: "OBSERVED",
        reportTimeMs: value.reportTimeMs,
        rawType: value.rawType,
        evidence: locator(value.locator),
      }
    : { observation: "NOT_OBSERVED", reason: value.reason };
}

function recipient(window: SupportAuraWindow): SupportRecipientRecord {
  const { actorId, instanceId } = window.recipient;
  const identity = window.recipientIdentity;
  if (identity.catalog === "NOT_IN_CATALOG") return { actorId, instanceId, catalog: "NOT_IN_CATALOG" };
  const { ownership } = identity;
  return {
    actorId,
    instanceId,
    catalog: "LISTED",
    actorType: identity.actorType,
    subType: identity.subType,
    ownership:
      ownership.kind === "OWNED_BY"
        ? { kind: "OWNED_BY", ownerActorId: ownership.ownerActorId }
        : { kind: ownership.kind },
    isSupporter: identity.isSupporter,
  };
}

function windowRecord(window: SupportAuraWindow): SupportWindowRecord {
  return {
    recipient: recipient(window),
    start: bound(window.start),
    end: bound(window.end),
    activeObservations: window.activeObservations.map((observed) => locator(observed.locator)),
    observedSpan: span(window.observedSpan),
    continuity:
      window.continuity.state === "ESTABLISHED"
        ? { continuity: "ESTABLISHED" }
        : { continuity: "NOT_ESTABLISHED", reason: window.continuity.reason },
    activeSpan: window.activeSpan === null ? null : span(window.activeSpan),
  };
}

function specialization(value: StatedSpecialization): SupportAllyWindowRecord["recipientSpecialization"] {
  return value.state === "STATED"
    ? { specification: "STATED", className: value.className, specName: value.specName }
    : { specification: "UNKNOWN", reason: value.reason };
}

function cooldownIdentity(value: RecipientCooldownIdentityResolution): SupportCooldownIdentityRecord {
  switch (value.state) {
    case "IDENTIFIED":
      return {
        identification: "IDENTIFIED",
        rosterKey: value.rosterKey,
        abilityGameIds: [...value.abilityGameIds],
        coverage: value.coverage,
        criterion: value.criterion,
        datasetId: value.dataset.datasetId,
        artifactRevision: value.dataset.artifactRevision,
      };
    case "UNKNOWN":
      return value.reason === "SPECIALIZATION_NOT_ESTABLISHED"
        ? {
            identification: "UNKNOWN",
            reason: value.reason,
            specializationReason: value.specializationReason,
          }
        : { identification: "UNKNOWN", reason: value.reason };
    case "UNSUPPORTED":
      return {
        identification: "UNSUPPORTED",
        reason: value.reason,
        className: value.className,
        specName: value.specName,
      };
  }
}

function survival(value: RecipientSurvival): SupportSurvivalRecord {
  const next = value.nextDeathAfterEnd;
  return {
    inSpan:
      value.inSpan.state === "DEATH_OBSERVED_IN_SPAN"
        ? {
            observation: "DEATH_OBSERVED_IN_SPAN",
            deaths: value.inSpan.deaths.map((death) => ({
              reportTimeMs: death.reportTimeMs,
              atSpanBound: death.atSpanBound,
              evidence: locator(death.locator),
            })),
          }
        : { observation: "NO_DEATH_OBSERVED" },
    nextDeathAfterEnd:
      next.state === "OBSERVED"
        ? {
            observation: "OBSERVED",
            reportTimeMs: next.reportTimeMs,
            msAfterObservedEnd: next.msAfterObservedEnd,
            evidence: locator(next.locator),
          }
        : { observation: next.state },
  };
}

function overlap(value: CooldownOverlap): SupportCooldownOverlapRecord {
  switch (value.state) {
    case "NO_COOLDOWN_IDENTITY":
      return { overlap: "NO_COOLDOWN_IDENTITY" };
    case "CONTINUITY_NOT_ESTABLISHED":
      return { overlap: "CONTINUITY_NOT_ESTABLISHED", reason: value.reason };
    case "LISTED": {
      const { listing } = value;
      return {
        overlap: "LISTED",
        casts: value.casts.map((cast) => ({
          abilityGameId: cast.abilityGameId,
          reportTimeMs: cast.reportTimeMs,
          atSpanBound: cast.atSpanBound,
          evidence: locator(cast.locator),
        })),
        listing:
          listing.state === "COMPLETE"
            ? { completeness: "COMPLETE" }
            : listing.reason === "AMBIGUOUS_CASTS"
              ? {
                  completeness: "OBSERVED_ONLY",
                  reason: listing.reason,
                  unidentifiedCasts: listing.unidentifiedCasts,
                  unattributedCasts: listing.unattributedCasts,
                }
              : { completeness: "OBSERVED_ONLY", reason: listing.reason },
      };
    }
  }
}

function allyWindow(facts: RecipientWindowFacts): SupportAllyWindowRecord {
  return {
    ...windowRecord(facts.window),
    recipientSpecialization: specialization(facts.recipientSpecialization),
    recipientCooldownIdentity: cooldownIdentity(facts.recipientCooldownIdentity),
    survival: survival(facts.survival),
    cooldownOverlap: overlap(facts.cooldownOverlap),
  };
}

function amount(value: ProvenAmount): SupportProvenAmountRecord {
  return value.bound === "AT_LEAST"
    ? { bound: "AT_LEAST", ms: value.ms, caveats: [...value.why] }
    : { bound: "UNKNOWN", caveats: [...value.why] };
}

function supportTime(value: SupportTime): SupportTimeRecord {
  return {
    anyRecipient: amount(value.anyRecipient),
    byRecipient: value.byRecipient.map((row) => ({
      actorId: row.recipient.actorId,
      instanceId: row.recipient.instanceId,
      windows: row.windows,
      proven: amount(row.proven),
    })),
    peakConcurrentWindows:
      value.peakConcurrentWindows.bound === "AT_LEAST"
        ? { bound: "AT_LEAST", count: value.peakConcurrentWindows.count }
        : { bound: "UNKNOWN" },
  };
}

function listing(value: WindowListing): SupportWindowListingRecord {
  return value.state === "COMPLETE"
    ? { completeness: "COMPLETE" }
    : { completeness: "OBSERVED_ONLY", reason: value.reason };
}

function targeting(value: SupportTargetingStatus): SupportDecisionRecord {
  switch (value.status) {
    case "NO_AUTHORITY_AVAILABLE":
      return { category: value.category, authorityStatus: "NO_AUTHORITY_AVAILABLE", reason: value.reason };
    case "UNKNOWN":
      return {
        category: value.category,
        authorityStatus: "UNKNOWN",
        modelId: value.modelId,
        missing: {
          recipientActorId: value.missing.recipientActorId,
          evidenceCategory: value.missing.category,
          reason: value.missing.reason,
        },
      };
    case "ALLY_STATE_SUFFICIENT":
      throw new Error(
        "A recipient-quality model was applied, but no public shape exists for its conclusions; " +
          "support observations were not published.",
      );
  }
}

/**
 * The view of one Augmentation result. `evaluation` is null or refused only
 * on INSUFFICIENT_EVIDENCE, and then nothing was reconstructed.
 */
export function augmentationSupportObservations(
  evaluation: AugmentationEvokerEvaluation | null,
): SupportObservationOutcome {
  if (evaluation === null) return { assessment: "NOT_ASSESSED", reason: "SUBJECT_SPECIALIZATION_NOT_STATED" };
  switch (evaluation.state) {
    case "IDENTITY_REFUSED":
      return { assessment: "NOT_ASSESSED", reason: "IDENTITY_REFUSED" };
    case "RUNTIME_DATA_UNAVAILABLE":
      return { assessment: "NOT_ASSESSED", reason: "RUNTIME_DATA_UNAVAILABLE" };
    case "EVALUATED": {
      const timing = evaluation.supportTiming;
      return {
        assessment: "ASSESSED",
        view: {
          revision: SUPPORT_OBSERVATIONS_REVISION,
          identityData: {
            datasetId: evaluation.dataset.datasetId,
            artifactRevision: evaluation.dataset.artifactRevision,
          },
          supportDecisions: [
            targeting(evaluation.supportTargeting),
            { category: timing.category, authorityStatus: timing.status, reason: timing.reason },
          ],
          allyBuffs: evaluation.allyBuffs.map((buff) => ({
            ability: buff.ability,
            auraAbilityGameId: buff.auraAbilityGameId,
            listing: listing(buff.listing),
            ambiguousTransitions: buff.ambiguousTransitions,
            windows: buff.windows.map(allyWindow),
            supportTime: supportTime(buff.supportTime),
          })),
          selfBuffs: evaluation.selfBuffs.map((buff) => ({
            ability: buff.ability,
            auraAbilityGameId: buff.auraAbilityGameId,
            listing: listing(buff.windows.listing),
            ambiguousTransitions: buff.windows.ambiguousTransitions.length,
            windows: buff.windows.windows.map(windowRecord),
          })),
          supportCasts: {
            listing:
              timing.listing.state === "COMPLETE"
                ? { completeness: "COMPLETE" }
                : {
                    completeness: "UNKNOWN",
                    reason: timing.listing.reason,
                    unidentifiedCasts: timing.listing.unidentifiedCasts,
                    unattributedCasts: timing.listing.unattributedCasts,
                  },
            casts: timing.casts.map((cast) => ({
              ability: cast.ability,
              abilityGameId: cast.abilityGameId,
              reportTimeMs: cast.reportTimeMs,
              evidence: locator(cast.locator),
            })),
          },
        },
      };
    }
  }
}
