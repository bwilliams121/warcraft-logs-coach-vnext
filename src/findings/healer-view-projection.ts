/**
 * A healer evaluation and its finding set, restated as the shared healer view
 * (HEAL-B1P).
 *
 * Lifted from Restoration Shaman's `healer-view.ts` (HEAL-AP) when Holy
 * Paladin and Mistweaver Monk came to publish the same view, unchanged in
 * behavior, exactly as HEAL-B1 lifted the finding-set restatement
 * (`healer-finding-projection.ts`). Restatement only: every record is a finding
 * of the set, joined to the evaluation's own result for the same plan entry or
 * cast: the planned window an outcome was judged in, and each cooldown use's
 * overlapping damage episodes with their coverage. Nothing is added, ranked or
 * judged; an evaluation the view cannot join is a defect and throws rather
 * than publishing a thinner record.
 *
 * The input is declared structurally, so this module never imports the
 * healing domain (`m12a-healing-layering`): each specialization hands over its
 * own evaluation, and decides nothing here.
 */

import type { ActionabilityEvidence } from "./actionability.js";
import type { AssignmentEvaluation } from "./healer-assignment-execution.js";
import type { HealerFindingSet } from "./healer-finding.js";
import {
  HEALER_VIEW_REVISION,
  type HealerActionabilityRecord,
  type HealerAssignmentRecord,
  type HealerCooldownUseRecord,
  type HealerSpanListingRecord,
  type HealerView,
} from "./healer-view.js";

/** Whether a span's list is every item, as the healing domain states it. */
export type HealerViewSpanListing =
  | { readonly state: "COMPLETE" }
  | {
      readonly state: "UNKNOWN";
      readonly beyondFightEdge: boolean;
      readonly uncoveredActors: readonly { readonly actorId: number; readonly reason: string }[];
      readonly unidentifiedHitsInSpan: number;
    };

type HealerViewReceivedCoverage =
  { readonly state: "COMPLETE" } | { readonly state: "UNKNOWN"; readonly reason: string };

/** The parts of an EVALUATED healer evaluation the view restates. */
export interface HealerViewEvaluationParts {
  readonly dataset: { readonly datasetId: string; readonly artifactRevision: string };
  readonly assignment: AssignmentEvaluation;
  readonly cooldowns: {
    readonly uses: readonly {
      readonly cast: { readonly position: number };
      readonly overlap:
        | { readonly state: "ROSTER_NOT_IN_SCOPE" }
        | {
            readonly state: "RECONSTRUCTED";
            readonly spanMs: number;
            readonly listing: HealerViewSpanListing;
            readonly episodes: readonly {
              readonly episodeAbilityGameId: number;
              readonly firstHitMs: number;
              readonly lastHitMs: number;
              readonly episodeCoverage: HealerViewSpanListing;
              readonly players: readonly {
                readonly actorId: number;
                readonly entriesFromSubject: number;
                readonly coverage: {
                  readonly HEALING: HealerViewReceivedCoverage;
                  readonly ABSORBS: HealerViewReceivedCoverage;
                };
              }[];
            }[];
          };
    }[];
  };
}

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

function listingRecord(listing: HealerViewSpanListing): HealerSpanListingRecord {
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

function receivedRecord(coverage: HealerViewReceivedCoverage) {
  return coverage.state === "COMPLETE"
    ? ({ completeness: "COMPLETE" } as const)
    : ({ completeness: "UNKNOWN", reason: coverage.reason } as const);
}

/** The view of an EVALUATED healer result and the finding set built from it. */
export function healerViewOfEvaluation(
  evaluation: HealerViewEvaluationParts,
  set: HealerFindingSet,
): HealerView {
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
