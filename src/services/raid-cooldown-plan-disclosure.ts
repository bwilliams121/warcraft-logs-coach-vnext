/**
 * What a result says about a supplied raid cooldown plan (M12-E).
 *
 * Plan input facts only, never a gameplay verdict: which plan was received
 * (its digest), whether it is bound to the analyzed fight, how many
 * assignments it holds and which note lines were not imported.
 *
 * `assignmentEvaluation` is NOT_EVALUATED unless a public healer registration
 * judged the plan (Restoration Shaman since HEAL-AP), in which case it is
 * EVALUATED_IN_HEALER_FINDINGS and the results are the document's
 * `healerFindings`, never restated here. Saying so keeps a supplied plan from
 * reading as "every assignment was met". The reason names the first thing
 * that stopped evaluation, in this order: the plan is for another fight, its
 * binding is unknown, no public evaluator consumes it, or the healer
 * registration assessed nothing for the subject.
 */

import { assignmentEvaluatedAgainstPlan, type HealerViewOutcome } from "../findings/healer-view.js";
import { raidCooldownPlanDigest } from "../raid-plan/digest.js";
import {
  PLAN_IMPORT_DIAGNOSTIC_CODES,
  type PlanImportDiagnosticCode,
  type RaidCooldownPlan,
} from "../raid-plan/raid-cooldown-plan.js";
import { encounterBindingOf } from "../raid-plan/resolve.js";
import type { FightIdentity } from "../wcl/types.js";

export const RAID_COOLDOWN_PLAN_NOT_EVALUATED_REASONS = [
  "PLAN_NOT_FOR_THIS_FIGHT",
  "ENCOUNTER_BINDING_UNKNOWN",
  "NO_PUBLIC_ASSIGNMENT_EVALUATOR",
  "SUBJECT_NOT_ASSESSED",
] as const;

export type RaidCooldownPlanAssignmentEvaluation =
  | {
      readonly state: "NOT_EVALUATED";
      readonly reason: (typeof RAID_COOLDOWN_PLAN_NOT_EVALUATED_REASONS)[number];
    }
  /** A public healer registration judged the subject's entries; the results are its healer findings. */
  | { readonly state: "EVALUATED_IN_HEALER_FINDINGS" };

export interface RaidCooldownPlanDisclosure {
  readonly authority: RaidCooldownPlan["authority"];
  readonly schema: RaidCooldownPlan["schema"];
  readonly format: RaidCooldownPlan["source"]["format"];
  readonly label: string | null;
  /** SHA-256 of the canonical JSON of the normalized plan. */
  readonly digest: string;
  readonly encounter: RaidCooldownPlan["encounter"];
  readonly encounterBinding: "MATCHED" | "MISMATCHED" | "UNKNOWN";
  readonly assignmentCount: number;
  /** Note lines not imported, per code, in the vocabulary's order; codes with no line are omitted. */
  readonly importDiagnostics: readonly { readonly code: PlanImportDiagnosticCode; readonly count: number }[];
  readonly assignmentEvaluation: RaidCooldownPlanAssignmentEvaluation;
}

/** Raised when the disclosure and a healer view disagree about whether the plan binds the fight. A defect. */
export class PlanDisclosureInconsistencyError extends Error {
  constructor(detail: string) {
    super(`The raid cooldown plan disclosure disagrees with the healer findings: ${detail}`);
    this.name = "PlanDisclosureInconsistencyError";
  }
}

/**
 * The disclosure as it stands after the selected analyzer ran (HEAL-AP).
 *
 * `healer` is the selected registration's healer view, or `null` when it
 * publishes none. Only a plan bound to this fight can be evaluated. With a
 * bound plan:
 *
 * - no healer view: NOT_EVALUATED, NO_PUBLIC_ASSIGNMENT_EVALUATOR, as before;
 * - a healer view that assessed nothing: NOT_EVALUATED, SUBJECT_NOT_ASSESSED;
 * - a healer view that judged the plan: EVALUATED_IN_HEALER_FINDINGS.
 *
 * A healer view that judged a plan this disclosure does not bind, or did not
 * judge one it does bind, contradicts it and throws: the document would say
 * two things about the same plan.
 */
export function withHealerAssignmentEvaluation(
  disclosure: RaidCooldownPlanDisclosure,
  healer: HealerViewOutcome | null,
): RaidCooldownPlanDisclosure {
  const judged = healer !== null && assignmentEvaluatedAgainstPlan(healer);
  if (disclosure.encounterBinding !== "MATCHED") {
    if (judged) {
      throw new PlanDisclosureInconsistencyError(
        `the healer findings judged a plan whose binding is ${disclosure.encounterBinding}`,
      );
    }
    return disclosure;
  }
  if (healer === null) return disclosure;
  if (healer.assessment === "NOT_ASSESSED") {
    return {
      ...disclosure,
      assignmentEvaluation: { state: "NOT_EVALUATED", reason: "SUBJECT_NOT_ASSESSED" },
    };
  }
  if (!judged) {
    throw new PlanDisclosureInconsistencyError(
      "the plan binds this fight but the healer findings did not judge it",
    );
  }
  return { ...disclosure, assignmentEvaluation: { state: "EVALUATED_IN_HEALER_FINDINGS" } };
}

export async function discloseRaidCooldownPlan(
  plan: RaidCooldownPlan,
  identity: FightIdentity,
): Promise<RaidCooldownPlanDisclosure> {
  const binding = encounterBindingOf(plan.encounter, {
    encounterId: identity.fight.encounterId,
    difficulty: identity.fight.difficulty,
  });
  const counts = new Map<PlanImportDiagnosticCode, number>();
  for (const diagnostic of plan.importDiagnostics) {
    counts.set(diagnostic.code, (counts.get(diagnostic.code) ?? 0) + 1);
  }
  return {
    authority: plan.authority,
    schema: plan.schema,
    format: plan.source.format,
    label: plan.source.label,
    digest: await raidCooldownPlanDigest(plan),
    encounter: plan.encounter,
    encounterBinding: binding.state,
    assignmentCount: plan.assignments.length,
    importDiagnostics: PLAN_IMPORT_DIAGNOSTIC_CODES.flatMap((code) => {
      const count = counts.get(code);
      return count === undefined ? [] : [{ code, count }];
    }),
    assignmentEvaluation: {
      state: "NOT_EVALUATED",
      reason:
        binding.state === "MISMATCHED"
          ? "PLAN_NOT_FOR_THIS_FIGHT"
          : binding.state === "UNKNOWN"
            ? "ENCOUNTER_BINDING_UNKNOWN"
            : "NO_PUBLIC_ASSIGNMENT_EVALUATOR",
    },
  };
}
