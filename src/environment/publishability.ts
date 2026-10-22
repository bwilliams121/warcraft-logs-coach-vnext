/**
 * Environment PUBLISHABILITY (M11-G3-4): the strict gate a later ceiling
 * (G4) must pass on the ENVIRONMENT side. It is not the character profile's
 * readiness, and neither hides the other: a ceiling needs both, plus G4's own
 * checks.
 *
 * PUBLISHABLE requires every one of:
 *   - no factual blocker that materiality cannot clear (duration, primary
 *     target, target schedule, unclassified setup auras, actor mismatches,
 *     pinned data);
 *   - every UNKNOWN field classified NON_BLOCKING under the materiality policy;
 *   - every model assumption OWNER_APPROVED;
 *   - a CURRENT_SETUP translation that succeeds — PUBLISHABLE implies
 *     translatable.
 *
 * A BOSS_ONLY_DIAGNOSTIC translation never passes through here and can never
 * be PUBLISHABLE; `ceilingEligibility` refuses any job carrying its
 * DIAGNOSTIC_RECONSTRUCTION provenance.
 */

import type { SimulationJob } from "../simulation/job.js";
import {
  classifyMateriality,
  ENVIRONMENT_MATERIALITY_POLICY,
  type EnvironmentSpecFacts,
  type FieldMateriality,
  type MaterialityField,
} from "./materiality.js";
import type { EnvironmentIssue, EnvironmentReconstructionResult, RankOption } from "./model.js";
import { planTranslation } from "./translate.js";

export const ENVIRONMENT_PUBLISHABILITY_SCHEMA_VERSION = "environment-publishability/1";

export type PublishabilityBlockerCode =
  | "DURATION_UNRESOLVED"
  | "PRIMARY_TARGET_UNRESOLVED"
  | "TARGET_SCHEDULE_UNRESOLVED"
  | "MATERIAL_RAID_BUFF_UNKNOWN"
  | "MATERIAL_CONSUMABLE_UNKNOWN"
  | "BLOODLUST_TIMING_UNRESOLVED"
  | "SETUP_AURA_UNCLASSIFIED"
  | "ENVIRONMENT_TRANSLATION_UNSUPPORTED"
  | "ASSUMPTION_NOT_OWNER_APPROVED"
  | "EVIDENCE_ACTOR_MISMATCH"
  | "PINNED_DATA_UNAVAILABLE"
  | "PINNED_MODEL_MISSING_OBSERVED_EFFECT"
  | "USER_PROVIDED_INVALID"
  | "USER_PROVIDED_CONFLICT";

export type PublishabilityDiagnosticCode =
  | "NON_BLOCKING_UNKNOWN"
  | "NON_BLOCKING_APPROXIMATION"
  /** An unresolved rank carried as its complete, representable plausible set (an uncertainty envelope). */
  | "RANK_ENVELOPE"
  | "READINESS_DIAGNOSTIC";

export interface PublishabilityIssue<C extends string> {
  readonly code: C;
  readonly detail: string;
}

export interface EnvironmentPublishability {
  readonly schemaVersion: typeof ENVIRONMENT_PUBLISHABILITY_SCHEMA_VERSION;
  readonly status: "PUBLISHABLE" | "BLOCKED";
  readonly policy: typeof ENVIRONMENT_MATERIALITY_POLICY;
  readonly specKey: string;
  readonly disclosures: readonly string[];
  readonly blockers: readonly PublishabilityIssue<PublishabilityBlockerCode>[];
  readonly diagnostics: readonly PublishabilityIssue<PublishabilityDiagnosticCode>[];
  /** One entry per unresolved field that materiality decided. */
  readonly materiality: readonly FieldMateriality[];
}

const CONSUMABLE_FIELDS: Record<string, MaterialityField> = {
  FLASK: "FLASK_PRESENCE",
  FOOD: "FOOD_PRESENCE",
  AUGMENTATION: "AUGMENTATION_PRESENCE",
  POTION: "POTION_PRESENCE",
};

const PASS_THROUGH: Partial<Record<EnvironmentIssue["code"], PublishabilityBlockerCode>> = {
  DURATION_UNRESOLVED: "DURATION_UNRESOLVED",
  PRIMARY_TARGET_UNRESOLVED: "PRIMARY_TARGET_UNRESOLVED",
  TARGET_SCHEDULE_UNRESOLVED: "TARGET_SCHEDULE_UNRESOLVED",
  BLOODLUST_TIMING_UNRESOLVED: "BLOODLUST_TIMING_UNRESOLVED",
  SETUP_AURA_UNCLASSIFIED: "SETUP_AURA_UNCLASSIFIED",
  EVIDENCE_ACTOR_MISMATCH: "EVIDENCE_ACTOR_MISMATCH",
  PINNED_DATA_UNAVAILABLE: "PINNED_DATA_UNAVAILABLE",
  RAID_BUFF_TIMED: "ENVIRONMENT_TRANSLATION_UNSUPPORTED",
  BLOODLUST_NOT_EQUIVALENT: "ENVIRONMENT_TRANSLATION_UNSUPPORTED",
  BLOODLUST_MULTIPLE: "ENVIRONMENT_TRANSLATION_UNSUPPORTED",
  CONSUMABLE_RANK_NOT_REPRESENTABLE: "ENVIRONMENT_TRANSLATION_UNSUPPORTED",
  PINNED_MODEL_MISSING_OBSERVED_EFFECT: "PINNED_MODEL_MISSING_OBSERVED_EFFECT",
  USER_PROVIDED_INVALID: "USER_PROVIDED_INVALID",
  USER_PROVIDED_CONFLICT: "USER_PROVIDED_CONFLICT",
};

export function assessEnvironmentPublishability(
  result: EnvironmentReconstructionResult,
  facts: EnvironmentSpecFacts,
): EnvironmentPublishability {
  const blockers: PublishabilityIssue<PublishabilityBlockerCode>[] = [];
  const diagnostics: PublishabilityIssue<PublishabilityDiagnosticCode>[] = [];
  const materiality: FieldMateriality[] = [];
  const decide = (field: MaterialityField, blockerCode: PublishabilityBlockerCode, detail: string) => {
    const decided = classifyMateriality(field, facts);
    materiality.push(decided);
    if (decided.classification === "PUBLISHABILITY_BLOCKING") {
      blockers.push({ code: blockerCode, detail: `${detail} — ${decided.rationale}` });
    } else {
      diagnostics.push({ code: "NON_BLOCKING_UNKNOWN", detail: `${detail} — ${decided.rationale}` });
    }
  };

  // A rank that stays UNKNOWN is not a blocker when its COMPLETE plausible set
  // is representable: the translation carries every rank as a variant and the
  // consumer reports the envelope. Measured sensitivities are context only;
  // they are never summed. An unrepresentable set blocks through readiness.
  const envelope = (label: string, options: readonly RankOption[], field: MaterialityField | null) => {
    if (options.length === 0 || options.some((option) => !option.representable)) return;
    const measured = field === null ? undefined : facts.measurements.find((entry) => entry.field === field);
    diagnostics.push({
      code: "RANK_ENVELOPE",
      detail: `${label} rank UNKNOWN — every plausible rank is simulated (${options.map((option) => `${String(option.itemLevel)}→${option.token}`).join(", ")})${measured === undefined ? "" : `; measured spread ${(measured.relativeChange * 100).toFixed(2)}% (${measured.comparison})`}`,
    });
  };

  for (const issue of result.blockers) {
    const passed = PASS_THROUGH[issue.code];
    if (passed !== undefined) {
      blockers.push({ code: passed, detail: `${issue.code}: ${issue.detail}` });
    }
  }

  const env = result.environment;
  for (const entry of env.raidBuffs) {
    if (entry.presence.state === "UNKNOWN") {
      decide(
        `RAID_BUFF:${entry.override}`,
        "MATERIAL_RAID_BUFF_UNKNOWN",
        `${entry.side} ${entry.override} UNKNOWN`,
      );
    }
  }
  for (const entry of env.consumables.setup) {
    if (
      entry.identity.state === "UNKNOWN" ||
      (entry.identity.state === "KNOWN" && entry.presence.state === "UNKNOWN")
    ) {
      decide(
        CONSUMABLE_FIELDS[entry.kind] ?? "FLASK_PRESENCE",
        "MATERIAL_CONSUMABLE_UNKNOWN",
        `${entry.kind} UNKNOWN`,
      );
    } else if (entry.rank.state === "UNKNOWN") {
      envelope(entry.kind, entry.rankOptions, entry.kind === "FLASK" ? "FLASK_RANK" : null);
    }
  }
  const potion = env.consumables.potion;
  if (potion.identity.state === "UNKNOWN" || potion.uses.state === "UNKNOWN") {
    decide("POTION_PRESENCE", "MATERIAL_CONSUMABLE_UNKNOWN", "POTION availability UNKNOWN");
  } else if (potion.rank.state === "UNKNOWN") {
    envelope("POTION", potion.rankOptions, "POTION_RANK");
  }
  for (const entry of env.consumables.temporaryEnchants) {
    if (
      entry.enchant.state !== "KNOWN" ||
      entry.enchant.value.engineToken === null ||
      entry.persistence.state === "UNKNOWN"
    ) {
      blockers.push({
        code: "MATERIAL_CONSUMABLE_UNKNOWN",
        detail: `${entry.slot} temporary enchant or its persistence unresolved — no measurement, fail closed`,
      });
    }
  }
  if (env.bloodlust.applications.state === "KNOWN") {
    for (const app of env.bloodlust.applications.value) {
      if (app.startMs.state === "KNOWN" && app.startMs.value % 1000 !== 0) {
        const decided = classifyMateriality("BLOODLUST_WHOLE_SECOND", facts);
        materiality.push(decided);
        if (decided.classification === "PUBLISHABILITY_BLOCKING") {
          blockers.push({
            code: "ENVIRONMENT_TRANSLATION_UNSUPPORTED",
            detail: `lust at ${String(app.startMs.value)} ms runs at the next whole second — ${decided.rationale}`,
          });
        } else {
          diagnostics.push({
            code: "NON_BLOCKING_APPROXIMATION",
            detail: `lust at ${String(app.startMs.value)} ms runs at the next whole second — ${decided.rationale}`,
          });
        }
      }
    }
  }

  for (const assumption of result.assumptions) {
    if (assumption.approval !== "OWNER_APPROVED") {
      blockers.push({
        code: "ASSUMPTION_NOT_OWNER_APPROVED",
        detail: `${assumption.id}@${String(assumption.version)}: ${assumption.statement}`,
      });
    }
  }

  const planned = planTranslation(result, materiality, "CURRENT_SETUP");
  if (!planned.ok) {
    for (const problem of planned.problems) {
      blockers.push({
        code: "ENVIRONMENT_TRANSLATION_UNSUPPORTED",
        detail: `CURRENT_SETUP translation: ${problem}`,
      });
    }
  }
  for (const issue of result.diagnostics) {
    diagnostics.push({ code: "READINESS_DIAGNOSTIC", detail: `${issue.code}: ${issue.detail}` });
  }

  return {
    schemaVersion: ENVIRONMENT_PUBLISHABILITY_SCHEMA_VERSION,
    status: blockers.length === 0 ? "PUBLISHABLE" : "BLOCKED",
    policy: ENVIRONMENT_MATERIALITY_POLICY,
    specKey: facts.specKey,
    disclosures: facts.disclosures,
    blockers,
    diagnostics,
    materiality,
  };
}

/**
 * Whether a JOB could carry a current-setup ceiling on the environment side:
 * a logged character and an ACTUAL_OBSERVED environment. A diagnostic,
 * development or fidelity job never can.
 */
export function ceilingEligibility(job: SimulationJob): {
  readonly eligible: boolean;
  readonly reasons: readonly string[];
} {
  const reasons: string[] = [];
  if (job.character.profileKind !== "LOGGED_RECONSTRUCTION")
    reasons.push(`profileKind ${job.character.profileKind}`);
  for (const [name, value] of [
    ["consumables", job.character.consumables.provenance],
    ["raidBuffs", job.environment.raidBuffs.provenance],
    ["bloodlust", job.environment.bloodlust.provenance],
  ] as const) {
    if (value !== "ACTUAL_OBSERVED") reasons.push(`${name} provenance ${value}`);
  }
  return { eligible: reasons.length === 0, reasons };
}
