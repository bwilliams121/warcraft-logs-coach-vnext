/**
 * Restoration Shaman's healer view (HEAL-AP): its finding set and the factual
 * context each finding rests on, in the shared `healer-view.ts` form.
 *
 * Restatement only. Every record is a finding of the set built by
 * `healer-findings.ts`, joined to the evaluator's own result for the same plan
 * entry or cast: the planned window an outcome was judged in, and each
 * cooldown use's overlapping damage episodes with their coverage. Nothing is
 * added, ranked or judged; an evaluation the view cannot join is a defect and
 * throws rather than publishing a thinner record.
 */

import type { ActionabilityEvidence } from "../../../findings/actionability.js";
import type {
  HealerActionabilityRecord,
  HealerAssignmentRecord,
  HealerCooldownUseRecord,
  HealerSpanListingRecord,
  HealerView,
} from "../../../findings/healer-view.js";
import { HEALER_VIEW_REVISION } from "../../../findings/healer-view.js";
import type { HealerFindingSet } from "../../../findings/healer-finding.js";
import type { OverlapListing, RestorationShamanEvaluation } from "./evaluator.js";

type Evaluated = Extract<RestorationShamanEvaluation, { state: "EVALUATED" }>;

function actionabilityRecord(actionability: ActionabilityEvidence): HealerActionabilityRecord {
  return actionability.status === "NOT_EVALUATED"
    ? { actionability: "NOT_EVALUATED" }
    : {
        actionability: actionability.status,
        abilityGameId: actionability.abilityGameId,
        position: actionability.position,
        evidence: actionability.locator,
      };
}

function listingRecord(listing: OverlapListing): HealerSpanListingRecord {
  return listing.state === "COMPLETE"
    ? { completeness: "COMPLETE" }
    : {
        completeness: "UNKNOWN",
        beyondFightEdge: listing.beyondFightEdge,
        uncoveredActors: listing.uncoveredActors.map((actor) => ({
          actorId: actor.actorId,
          reason: actor.reason,
        })),
        unidentifiedHitsInSpan: listing.unidentifiedHitsInSpan,
      };
}

function receivedRecord(
  coverage: { readonly state: "COMPLETE" } | { readonly state: "UNKNOWN"; readonly reason: string },
) {
  return coverage.state === "COMPLETE"
    ? ({ completeness: "COMPLETE" } as const)
    : ({ completeness: "UNKNOWN", reason: coverage.reason } as const);
}

/** The view of an EVALUATED result and the finding set built from it. */
export function restorationShamanHealerView(evaluation: Evaluated, set: HealerFindingSet): HealerView {
  const results =
    evaluation.assignment.status === "EVALUATED"
      ? new Map(evaluation.assignment.results.map((result) => [result.assignment.assignmentId, result]))
      : new Map();
  const uses = new Map(evaluation.cooldowns.uses.map((use) => [use.cast.position, use]));

  const assignments: HealerAssignmentRecord[] = [];
  const cooldownUses: HealerCooldownUseRecord[] = [];
  for (const finding of set.findings) {
    if (finding.category === "ASSIGNMENT") {
      const base = {
        findingId: finding.findingId,
        assignmentId: finding.subject.assignmentId,
        abilityGameId: finding.subject.abilityGameId,
        evidence: [...finding.evidence],
      };
      if (finding.result.resolution === "UNKNOWN") {
        assignments.push({ ...base, result: { resolution: "UNKNOWN", reason: finding.result.reason } });
        continue;
      }
      const evaluated = results.get(finding.subject.assignmentId);
      if (evaluated === undefined || evaluated.status === "ASSIGNMENT_UNKNOWN") {
        throw new Error(`The assignment outcome ${finding.findingId} has no evaluated window to publish.`);
      }
      assignments.push({
        ...base,
        result: {
          resolution: "OUTCOME",
          outcome: finding.result.outcome,
          window: {
            fromReportTimeMs: evaluated.window.fromReportTimeMs,
            toReportTimeMs: evaluated.window.toReportTimeMs,
          },
          actionability: actionabilityRecord(finding.result.actionability),
        },
      });
      continue;
    }
    const use = uses.get(finding.subject.position);
    if (use === undefined) {
      throw new Error(`The cooldown finding ${finding.findingId} has no observed use to publish.`);
    }
    const { overlap } = use;
    cooldownUses.push({
      findingId: finding.findingId,
      abilityGameId: finding.subject.abilityGameId,
      reportTimeMs: finding.subject.reportTimeMs,
      position: finding.subject.position,
      evidence: [...finding.evidence],
      healingContext:
        overlap.state === "ROSTER_NOT_IN_SCOPE"
          ? { context: "ROSTER_NOT_IN_SCOPE" }
          : {
              context: "RECONSTRUCTED",
              spanMs: overlap.spanMs,
              listing: listingRecord(overlap.listing),
              episodes: overlap.episodes.map((episode) => ({
                abilityGameId: episode.episodeAbilityGameId,
                firstHitMs: episode.firstHitMs,
                lastHitMs: episode.lastHitMs,
                coverage: listingRecord(episode.episodeCoverage),
                players: episode.players.map((player) => ({
                  actorId: player.actorId,
                  observedEntriesFromSubject: player.entriesFromSubject,
                  healing: receivedRecord(player.coverage.HEALING),
                  absorbs: receivedRecord(player.coverage.ABSORBS),
                })),
              })),
            },
    });
  }

  return {
    revision: HEALER_VIEW_REVISION,
    identityData: {
      datasetId: evaluation.dataset.datasetId,
      artifactRevision: evaluation.dataset.artifactRevision,
    },
    categories: set.categories,
    assignments,
    cooldownUses,
  };
}
