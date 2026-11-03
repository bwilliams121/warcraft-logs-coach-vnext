/**
 * The healer finding shape (HEAL-A): the structured form of the ASSIGNMENT,
 * COOLDOWN and HEALING_DECISION categories.
 *
 * WHY A SECOND SHAPE
 *
 * `finding.ts` is the rotational finding: a decision point, a SimulationCraft
 * judgment and the `DecisionCategory` "ROTATION". A healer has no
 * SimulationCraft authority, so none of that applies, and widening
 * `DecisionCategory` would put healer words on the rotational wire. This file
 * is the healer categories' own internal shape. It is shared, spec-neutral
 * vocabulary: every healer specialization builds the same shape from its own
 * evaluation, and nothing here interprets gameplay.
 *
 * TWO LEVELS
 *
 *     categories   one resolution per category, ALWAYS all three, in order.
 *                  A category with no standard says NO_AUTHORITY_AVAILABLE; one
 *                  with a standard and too little evidence says UNKNOWN. An
 *                  empty finding list is never the only answer for a category.
 *     findings     one per evaluated plan entry (ASSIGNMENT) or observed
 *                  healing-cooldown use (COOLDOWN). HEALING_DECISION has none.
 *
 * EVERY FINDING NAMES ITS AUTHORITY (CLAUDE.md "Decision Categories")
 *
 * - ASSIGNMENT: the caller-supplied raid cooldown plan (`RaidPlanAuthorityRef`).
 *   It exists only when a plan was supplied and binds this fight; otherwise the
 *   category is NO_AUTHORITY_AVAILABLE (no plan, or another fight's plan) or
 *   UNKNOWN (the binding cannot be established), and there is no ASSIGNMENT
 *   finding at all. An assignment is never inferred.
 * - COOLDOWN: `WCL_OBSERVED_FACT`. A fact, never a verdict: there is no field in
 *   which "should have used" could sit.
 * - HEALING_DECISION: no per-cast healer model is approved, so the category is
 *   NO_AUTHORITY_AVAILABLE and has no finding.
 *
 * THE OUTCOME VOCABULARY IS THE SPECIALIZATION'S
 *
 * An ASSIGNMENT finding's `outcome` is the specialization's own
 * assignment-execution outcome (ASSIGNMENT_MET and its counterparts, CLAUDE.md
 * "Healer Cooldown Assignments"), carried as a plain string the way the
 * observed-decision view carries spec-owned vocabulary. Its actionability is
 * the shared two-member `ActionabilityEvidence`, so a negative actionability
 * claim stays unspellable here. An assignment the evidence cannot decide is
 * `UNKNOWN` with its reason, never an outcome.
 *
 * WHAT IS DELIBERATELY ABSENT: confidence, severity, score, HPS, ranking, and
 * any plan-quality judgement. A finding is not a penalty.
 */

import type { EvidenceLocator } from "../engine/evidence/locator.js";
import type { RaidCooldownPlan } from "../raid-plan/raid-cooldown-plan.js";
import type { ActionabilityEvidence } from "./actionability.js";
import type { SpecId } from "./spec-id.js";

export const HEALER_FINDINGS_REVISION = "healer-findings/1" as const;

/** The healer decision categories of CLAUDE.md "Decision Categories", in reporting order. */
export type HealerDecisionCategory = "ASSIGNMENT" | "COOLDOWN" | "HEALING_DECISION";

export const HEALER_DECISION_CATEGORIES = Object.freeze([
  "ASSIGNMENT",
  "COOLDOWN",
  "HEALING_DECISION",
] as const satisfies readonly HealerDecisionCategory[]);

/** The supplied plan an ASSIGNMENT result rests on. Identity only, never its content. */
export interface RaidPlanAuthorityRef {
  readonly kind: RaidCooldownPlan["authority"];
  readonly format: RaidCooldownPlan["source"]["format"];
  readonly label: string | null;
}

export function raidPlanAuthorityOf(plan: RaidCooldownPlan): RaidPlanAuthorityRef {
  return { kind: plan.authority, format: plan.source.format, label: plan.source.label };
}

/** How one category resolved for one player in one fight. */
export type HealerCategoryResolution =
  | {
      readonly category: HealerDecisionCategory;
      /** No trustworthy standard exists for the category. Never a player failure. */
      readonly resolution: "NO_AUTHORITY_AVAILABLE";
      readonly reason: string;
    }
  | {
      readonly category: "ASSIGNMENT";
      /** A plan was supplied, but whether it governs this fight cannot be established. */
      readonly resolution: "UNKNOWN";
      readonly authority: RaidPlanAuthorityRef;
      readonly reason: string;
    }
  | {
      readonly category: "ASSIGNMENT";
      /** The plan governs this fight; its entries for this player are the findings. */
      readonly resolution: "EVALUATED_AGAINST_PLAN";
      readonly authority: RaidPlanAuthorityRef;
      /** Plan entries for other players: counted, never evaluated here. */
      readonly assignmentsForOtherPlayers: number;
    }
  | {
      readonly category: "COOLDOWN";
      readonly resolution: "OBSERVED";
      readonly authority: "WCL_OBSERVED_FACT";
      /** Whether the COOLDOWN findings are every identified use. Only COMPLETE makes an empty list "none used". */
      readonly listing:
        { readonly completeness: "COMPLETE" } | { readonly completeness: "UNKNOWN"; readonly reason: string };
    };

interface HealerFindingBase {
  /** `<spec>:<category>:<subject key>`; unique within a finding set. */
  readonly findingId: string;
  readonly spec: SpecId;
  /** The locators the finding rests on, in canonical order, deduplicated. References only. */
  readonly evidence: readonly EvidenceLocator[];
}

export type AssignmentFindingResult =
  | {
      readonly resolution: "OUTCOME";
      /** The specialization's assignment-execution outcome. */
      readonly outcome: string;
      /** Required, never defaulted. */
      readonly actionability: ActionabilityEvidence;
    }
  | {
      /** The plan is a standard for this entry; the evidence cannot apply it. */
      readonly resolution: "UNKNOWN";
      readonly reason: string;
    };

export type HealerFinding =
  | (HealerFindingBase & {
      readonly category: "ASSIGNMENT";
      readonly authority: RaidPlanAuthorityRef;
      readonly subject: { readonly assignmentId: string; readonly abilityGameId: number };
      readonly result: AssignmentFindingResult;
    })
  | (HealerFindingBase & {
      readonly category: "COOLDOWN";
      readonly authority: "WCL_OBSERVED_FACT";
      readonly subject: {
        readonly abilityGameId: number;
        readonly reportTimeMs: number;
        /** Canonical index into `CombatFight.events`. */
        readonly position: number;
      };
      /** An observed use. There is no verdict field. */
      readonly result: { readonly resolution: "OBSERVED" };
    });

export type AssignmentHealerFinding = Extract<HealerFinding, { category: "ASSIGNMENT" }>;
export type CooldownHealerFinding = Extract<HealerFinding, { category: "COOLDOWN" }>;

function locatorKey(locator: EvidenceLocator): string {
  return `${locator.streamId}#${locator.pageOrdinal}#${locator.indexInPage}#${locator.ingestionOrdinal}`;
}

function dedupe(evidence: readonly EvidenceLocator[]): readonly EvidenceLocator[] {
  const seen = new Set<string>();
  return evidence.filter((locator) => {
    const key = locatorKey(locator);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function createAssignmentFinding(input: {
  readonly spec: SpecId;
  readonly authority: RaidPlanAuthorityRef;
  readonly subject: AssignmentHealerFinding["subject"];
  readonly result: AssignmentFindingResult;
  readonly evidence: readonly EvidenceLocator[];
}): AssignmentHealerFinding {
  return {
    findingId: `${input.spec}:ASSIGNMENT:${input.subject.assignmentId}`,
    spec: input.spec,
    category: "ASSIGNMENT",
    authority: input.authority,
    subject: input.subject,
    result: input.result,
    evidence: dedupe(input.evidence),
  };
}

export function createCooldownFinding(input: {
  readonly spec: SpecId;
  readonly subject: CooldownHealerFinding["subject"];
  readonly evidence: readonly EvidenceLocator[];
}): CooldownHealerFinding {
  return {
    findingId: `${input.spec}:COOLDOWN:${input.subject.position}`,
    spec: input.spec,
    category: "COOLDOWN",
    authority: "WCL_OBSERVED_FACT",
    subject: input.subject,
    result: { resolution: "OBSERVED" },
    evidence: dedupe(input.evidence),
  };
}

/** One player's healer results in one fight. */
export interface HealerFindingSet {
  readonly revision: typeof HEALER_FINDINGS_REVISION;
  readonly spec: SpecId;
  /** Exactly one per category, in `HEALER_DECISION_CATEGORIES` order. */
  readonly categories: readonly HealerCategoryResolution[];
  readonly findings: readonly HealerFinding[];
}

/** Raised when a specialization builds a set that breaks the shape's invariants. An internal defect. */
export class HealerFindingSetError extends Error {
  constructor(detail: string) {
    super(`Invalid healer finding set: ${detail}`);
    this.name = "HealerFindingSetError";
  }
}

/**
 * Builds a finding set, or throws `HealerFindingSetError`.
 *
 * The invariants are the categories' authority rules, checked rather than
 * trusted: ASSIGNMENT findings exist only when the category was evaluated
 * against a plan, and cite that plan; COOLDOWN findings only under an
 * observed COOLDOWN category; every finding belongs to the set's
 * specialization and has a unique id.
 */
export function createHealerFindingSet(input: {
  readonly spec: SpecId;
  readonly categories: readonly HealerCategoryResolution[];
  readonly findings: readonly HealerFinding[];
}): HealerFindingSet {
  const { spec, categories, findings } = input;
  const order = categories.map((entry) => entry.category);
  if (
    order.length !== HEALER_DECISION_CATEGORIES.length ||
    order.some((c, i) => c !== HEALER_DECISION_CATEGORIES[i])
  ) {
    throw new HealerFindingSetError(
      `categories must be exactly [${HEALER_DECISION_CATEGORIES.join(", ")}], got [${order.join(", ")}]`,
    );
  }
  const assignment = categories[0]!;
  const cooldown = categories[1]!;
  const ids = new Set<string>();
  for (const finding of findings) {
    if (finding.spec !== spec) {
      throw new HealerFindingSetError(`finding ${finding.findingId} belongs to ${finding.spec}, not ${spec}`);
    }
    if (ids.has(finding.findingId))
      throw new HealerFindingSetError(`duplicate finding id ${finding.findingId}`);
    ids.add(finding.findingId);
    if (finding.category === "ASSIGNMENT") {
      if (assignment.resolution !== "EVALUATED_AGAINST_PLAN") {
        throw new HealerFindingSetError(
          `an ASSIGNMENT finding exists while the category is ${assignment.resolution}`,
        );
      }
      const a = assignment.authority;
      const b = finding.authority;
      if (a.kind !== b.kind || a.format !== b.format || a.label !== b.label) {
        throw new HealerFindingSetError(`ASSIGNMENT finding ${finding.findingId} cites a different plan`);
      }
    } else if (cooldown.resolution !== "OBSERVED") {
      throw new HealerFindingSetError(
        `a COOLDOWN finding exists while the category is ${cooldown.resolution}`,
      );
    }
  }
  return { revision: HEALER_FINDINGS_REVISION, spec, categories, findings };
}
