/**
 * What a result says about a supplied raid cooldown plan (M12-E).
 *
 * Plan input facts only, never a gameplay verdict: which plan was received
 * (its digest), whether it is bound to the analyzed fight, how many
 * assignments it holds and which note lines were not imported.
 *
 * `assignmentEvaluation` is NOT_EVALUATED on every result of this build. No
 * registered analyzer consumes a plan: the one evaluator that does
 * (Restoration Shaman, M12-D) is internal and unregistered. Saying so keeps a
 * supplied plan from reading as "every assignment was met". The reason names
 * the first thing that stopped evaluation, in this order: the plan is for
 * another fight, its binding is unknown, or no public evaluator consumes it.
 */

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
] as const;

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
  readonly assignmentEvaluation: {
    readonly state: "NOT_EVALUATED";
    readonly reason: (typeof RAID_COOLDOWN_PLAN_NOT_EVALUATED_REASONS)[number];
  };
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
