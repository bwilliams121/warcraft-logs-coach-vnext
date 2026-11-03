/**
 * HEAL-A: the shared healer finding shape (`src/findings/healer-finding.ts`).
 *
 * The shape's invariants are the healer categories' authority rules, checked
 * by the set constructor rather than trusted:
 * - all three categories, exactly once, in order: an empty finding list is
 *   never the only answer for a category;
 * - an ASSIGNMENT finding exists only under a plan-evaluated category, and
 *   cites that plan; never under NO_AUTHORITY_AVAILABLE or UNKNOWN;
 * - a COOLDOWN finding exists only under an observed COOLDOWN category, and
 *   has no verdict field;
 * - every finding is the set's specialization's, with a unique id.
 */

import { describe, expect, it } from "vitest";

import type { EvidenceLocator } from "../../src/engine/evidence/locator.js";
import { notEvaluatedActionability } from "../../src/findings/actionability.js";
import {
  createAssignmentFinding,
  createCooldownFinding,
  createHealerFindingSet,
  HEALER_DECISION_CATEGORIES,
  HealerFindingSetError,
  raidPlanAuthorityOf,
  type HealerCategoryResolution,
  type RaidPlanAuthorityRef,
} from "../../src/findings/healer-finding.js";
import type { RaidCooldownPlan } from "../../src/raid-plan/raid-cooldown-plan.js";

const SPEC = "shaman/restoration" as const;
const PLAN: RaidCooldownPlan = {
  schema: "raid-cooldown-plan/1",
  authority: "USER_PROVIDED_RAID_PLAN",
  encounter: { encounterId: 1, difficulty: 5 },
  source: { format: "TIMELINE_NOTE", label: "note" },
  tolerance: { defaultToleranceMs: 2_000 },
  assignments: [],
  importDiagnostics: [],
};
const AUTHORITY: RaidPlanAuthorityRef = raidPlanAuthorityOf(PLAN);
const locator = (index: number): EvidenceLocator =>
  ({ streamId: "all", pageOrdinal: 0, indexInPage: index, ingestionOrdinal: index }) as EvidenceLocator;

const EVALUATED: HealerCategoryResolution = {
  category: "ASSIGNMENT",
  resolution: "EVALUATED_AGAINST_PLAN",
  authority: AUTHORITY,
  assignmentsForOtherPlayers: 0,
};
const OBSERVED: HealerCategoryResolution = {
  category: "COOLDOWN",
  resolution: "OBSERVED",
  authority: "WCL_OBSERVED_FACT",
  listing: { completeness: "COMPLETE" },
};
const NO_MODEL: HealerCategoryResolution = {
  category: "HEALING_DECISION",
  resolution: "NO_AUTHORITY_AVAILABLE",
  reason: "NO_APPROVED_PER_CAST_HEALER_MODEL",
};

const met = createAssignmentFinding({
  spec: SPEC,
  authority: AUTHORITY,
  subject: { assignmentId: "line-3", abilityGameId: 98008 },
  result: { resolution: "OUTCOME", outcome: "ASSIGNMENT_MET", actionability: notEvaluatedActionability() },
  evidence: [locator(1), locator(1), locator(2)],
});
const use = createCooldownFinding({
  spec: SPEC,
  subject: { abilityGameId: 98008, reportTimeMs: 10, position: 7 },
  evidence: [locator(1)],
});

describe("the finding constructors", () => {
  it("name the plan as the assignment authority, and deduplicate evidence", () => {
    expect(AUTHORITY).toEqual({ kind: "USER_PROVIDED_RAID_PLAN", format: "TIMELINE_NOTE", label: "note" });
    expect(met.findingId).toBe("shaman/restoration:ASSIGNMENT:line-3");
    expect(met.authority).toBe(AUTHORITY);
    expect(met.evidence).toEqual([locator(1), locator(2)]);
  });

  it("a COOLDOWN finding is an observed fact with no verdict field", () => {
    expect(use).toEqual({
      findingId: "shaman/restoration:COOLDOWN:7",
      spec: SPEC,
      category: "COOLDOWN",
      authority: "WCL_OBSERVED_FACT",
      subject: { abilityGameId: 98008, reportTimeMs: 10, position: 7 },
      result: { resolution: "OBSERVED" },
      evidence: [locator(1)],
    });
  });
});

describe("the set constructor enforces the categories' authority rules", () => {
  it("accepts a coherent set", () => {
    const set = createHealerFindingSet({
      spec: SPEC,
      categories: [EVALUATED, OBSERVED, NO_MODEL],
      findings: [met, use],
    });
    expect(set.revision).toBe("healer-findings/1");
    expect(set.categories.map((entry) => entry.category)).toEqual([...HEALER_DECISION_CATEGORIES]);
  });

  it("refuses a missing, repeated or reordered category", () => {
    for (const categories of [
      [EVALUATED, OBSERVED],
      [EVALUATED, OBSERVED, NO_MODEL, NO_MODEL],
      [OBSERVED, EVALUATED, NO_MODEL],
    ]) {
      expect(() => createHealerFindingSet({ spec: SPEC, categories, findings: [] })).toThrow(
        HealerFindingSetError,
      );
    }
  });

  it("refuses an ASSIGNMENT finding when there is no plan authority, or the binding is UNKNOWN", () => {
    const noPlan: HealerCategoryResolution = {
      category: "ASSIGNMENT",
      resolution: "NO_AUTHORITY_AVAILABLE",
      reason: "NO_RAID_COOLDOWN_PLAN",
    };
    const unbound: HealerCategoryResolution = {
      category: "ASSIGNMENT",
      resolution: "UNKNOWN",
      authority: AUTHORITY,
      reason: "ENCOUNTER_BINDING_UNKNOWN",
    };
    for (const assignment of [noPlan, unbound]) {
      expect(() =>
        createHealerFindingSet({ spec: SPEC, categories: [assignment, OBSERVED, NO_MODEL], findings: [met] }),
      ).toThrow(HealerFindingSetError);
      // The same category with no finding is a valid answer.
      expect(
        createHealerFindingSet({ spec: SPEC, categories: [assignment, OBSERVED, NO_MODEL], findings: [] })
          .findings,
      ).toEqual([]);
    }
  });

  it("refuses an ASSIGNMENT finding citing a different plan than the category", () => {
    const other = createAssignmentFinding({
      spec: SPEC,
      authority: { ...AUTHORITY, label: "another plan" },
      subject: { assignmentId: "line-4", abilityGameId: 98008 },
      result: { resolution: "UNKNOWN", reason: "READINESS_NOT_ESTABLISHED" },
      evidence: [],
    });
    expect(() =>
      createHealerFindingSet({ spec: SPEC, categories: [EVALUATED, OBSERVED, NO_MODEL], findings: [other] }),
    ).toThrow(/different plan/);
  });

  it("refuses a COOLDOWN finding when the category is not observed", () => {
    const noCooldownStandard: HealerCategoryResolution = {
      category: "COOLDOWN",
      resolution: "NO_AUTHORITY_AVAILABLE",
      reason: "TEST",
    };
    expect(() =>
      createHealerFindingSet({
        spec: SPEC,
        categories: [EVALUATED, noCooldownStandard, NO_MODEL],
        findings: [use],
      }),
    ).toThrow(HealerFindingSetError);
  });

  it("refuses a duplicate id or another specialization's finding", () => {
    expect(() =>
      createHealerFindingSet({
        spec: SPEC,
        categories: [EVALUATED, OBSERVED, NO_MODEL],
        findings: [use, use],
      }),
    ).toThrow(/duplicate/);
    const foreign = { ...use, spec: "evoker/augmentation" as const };
    expect(() =>
      createHealerFindingSet({
        spec: SPEC,
        categories: [EVALUATED, OBSERVED, NO_MODEL],
        findings: [foreign],
      }),
    ).toThrow(/belongs to/);
  });
});
