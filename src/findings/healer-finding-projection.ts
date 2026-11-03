/**
 * A healer evaluation, restated in the shared healer finding shape (HEAL-B1).
 *
 * Lifted from Restoration Shaman's `healer-findings.ts` (HEAL-A) when three
 * more healer specializations produced the same evaluation parts, unchanged in
 * behavior. It adds no judgement; each specialization calls it with its own
 * evaluation and its own `SpecId`:
 *
 * - ASSIGNMENT. No plan, or another fight's plan: NO_AUTHORITY_AVAILABLE. A
 *   plan whose binding cannot be established: UNKNOWN. A bound plan:
 *   EVALUATED_AGAINST_PLAN, with one finding per entry for this player. An
 *   entry the rules decided carries its outcome verbatim and its evidence; an
 *   undecided one is UNKNOWN with its reason. An entry of an ability the
 *   specialization does not identify is UNKNOWN (ABILITY_NOT_REGISTERED): the
 *   plan is a standard for it, the reviewed identity to apply it is missing.
 * - COOLDOWN. OBSERVED, with the use listing's completeness, and one finding
 *   per observed use whose evidence is the cast.
 * - HEALING_DECISION. NO_AUTHORITY_AVAILABLE, no finding.
 */

import type { RaidCooldownPlan } from "../raid-plan/raid-cooldown-plan.js";
import { notEvaluatedActionability } from "./actionability.js";
import type { AssignmentEvaluation, PlanExecutionCast } from "./healer-assignment-execution.js";
import {
  createAssignmentFinding,
  createCooldownFinding,
  createHealerFindingSet,
  raidPlanAuthorityOf,
  type HealerCategoryResolution,
  type HealerFinding,
  type HealerFindingSet,
} from "./healer-finding.js";
import type { SpecId } from "./spec-id.js";

/** The parts of a healer evaluation the finding set restates. */
export interface HealerEvaluationParts {
  readonly assignment: AssignmentEvaluation;
  readonly cooldowns: {
    readonly authority: "WCL_OBSERVED_FACT";
    readonly listing: { readonly state: "COMPLETE" } | { readonly state: "UNKNOWN"; readonly reason: string };
    readonly uses: readonly { readonly cast: PlanExecutionCast }[];
  };
  readonly healingDecision: { readonly reason: string };
}

/**
 * The finding set of one evaluated healer. `plan` is the plan the evaluation
 * was handed; the evaluation never names a plan it was not given.
 */
export function healerFindingSetOf(
  spec: SpecId,
  evaluation: HealerEvaluationParts,
  plan: RaidCooldownPlan | null,
): HealerFindingSet {
  const findings: HealerFinding[] = [];

  let assignment: HealerCategoryResolution;
  const evaluated = evaluation.assignment;
  if (evaluated.status === "NO_AUTHORITY_AVAILABLE") {
    assignment = { category: "ASSIGNMENT", resolution: "NO_AUTHORITY_AVAILABLE", reason: evaluated.reason };
  } else {
    if (plan === null) {
      throw new Error(`The ${spec} evaluation judged a plan its projection was not handed.`);
    }
    const authority = raidPlanAuthorityOf(plan);
    if (evaluated.status === "UNKNOWN") {
      assignment = { category: "ASSIGNMENT", resolution: "UNKNOWN", authority, reason: evaluated.reason };
    } else {
      assignment = {
        category: "ASSIGNMENT",
        resolution: "EVALUATED_AGAINST_PLAN",
        authority,
        assignmentsForOtherPlayers: evaluated.assignmentsForOtherPlayers,
      };
      for (const result of evaluated.results) {
        const subject = {
          assignmentId: result.assignment.assignmentId,
          abilityGameId: result.assignment.abilityGameId,
        };
        if (result.status === "ASSIGNMENT_UNKNOWN") {
          findings.push(
            createAssignmentFinding({
              spec,
              authority,
              subject,
              result: { resolution: "UNKNOWN", reason: result.reason },
              evidence: [],
            }),
          );
        } else if ("cast" in result) {
          findings.push(
            createAssignmentFinding({
              spec,
              authority,
              subject,
              result: { resolution: "OUTCOME", outcome: result.status, actionability: result.actionability },
              evidence: [result.cast.locator],
            }),
          );
        } else {
          // The encounter ended before the window: an outcome resting on the
          // fight's end, not on a cast. Actionability was not evaluated.
          findings.push(
            createAssignmentFinding({
              spec,
              authority,
              subject,
              result: {
                resolution: "OUTCOME",
                outcome: result.status,
                actionability: notEvaluatedActionability(),
              },
              evidence: [],
            }),
          );
        }
      }
      for (const entry of evaluated.notEvaluated) {
        findings.push(
          createAssignmentFinding({
            spec,
            authority,
            subject: {
              assignmentId: entry.assignment.assignmentId,
              abilityGameId: entry.assignment.abilityGameId,
            },
            result: { resolution: "UNKNOWN", reason: entry.reason },
            evidence: [],
          }),
        );
      }
    }
  }

  const { listing } = evaluation.cooldowns;
  const cooldown: HealerCategoryResolution = {
    category: "COOLDOWN",
    resolution: "OBSERVED",
    authority: evaluation.cooldowns.authority,
    listing:
      listing.state === "COMPLETE"
        ? { completeness: "COMPLETE" }
        : { completeness: "UNKNOWN", reason: listing.reason },
  };
  for (const use of evaluation.cooldowns.uses) {
    findings.push(
      createCooldownFinding({
        spec,
        subject: {
          abilityGameId: use.cast.abilityGameId,
          reportTimeMs: use.cast.reportTimeMs,
          position: use.cast.position,
        },
        evidence: [use.cast.locator],
      }),
    );
  }

  const healingDecision: HealerCategoryResolution = {
    category: "HEALING_DECISION",
    resolution: "NO_AUTHORITY_AVAILABLE",
    reason: evaluation.healingDecision.reason,
  };

  return createHealerFindingSet({ spec, categories: [assignment, cooldown, healingDecision], findings });
}
