/**
 * What one public encounter-context request may cost, pinned as numbers.
 *
 * TWO DIFFERENT BUDGETS, AND THEY ARE NOT INTERCHANGEABLE
 *
 *   ADMISSION UNITS   this project's own rate-limit currency, charged at the
 *                     transport boundary against `analysis:warcraft_log` before
 *                     any retrieval happens. It rations the paid Warcraft Logs
 *                     quota across callers.
 *
 *   SUBREQUESTS       outbound HTTP calls one Worker invocation may make. It
 *                     bounds a SINGLE request's blast radius.
 *
 * A request can satisfy one and violate the other, so both are pinned here. The
 * numbers are asserted rather than described, because a comment claiming "six
 * external requests at most" survives indefinitely after a fourth caller has
 * been added to the discovery path.
 *
 * WHY EXACT EQUALITY RATHER THAN `toBeLessThan`
 *
 * These constants are the public cost contract of the endpoint. Widening any of
 * them changes what an unchanged caller is charged and how much quota one
 * request can consume, which is a product decision — so it must break a test and
 * be re-approved, not pass silently because the new number is still under a
 * ceiling.
 */

import { describe, expect, it } from "vitest";

import {
  encounterContextAdmissionUnits,
  planEncounterContextCost,
  MAX_ENCOUNTER_CONTEXT_ADMISSION_UNITS,
} from "../../src/services/encounter-context-runner.js";
import { parseEncounterContextRequest } from "../../src/services/encounter-context-request.js";
import {
  MAX_RAID_NIGHT_FIGHTS,
  RAID_NIGHT_FIXED_SUBREQUESTS,
  RAID_NIGHT_SUBREQUEST_SAFETY_BUDGET,
  WORST_CASE_SUBREQUESTS_PER_FIGHT,
  projectWorstCaseRaidNightSubrequests,
} from "../../src/services/raid-night-request.js";
import { MAX_QUALIFIED_CANDIDATES } from "../../src/external-context/candidate-pool.js";
import { MAX_CANDIDATE_PAGES } from "../../src/wcl/rankings/rankings-query.js";
import { MAX_PAGES } from "../../src/wcl/retrieval-plan.js";

const REPORT = "aBcDeFgH12345678";

const EXTERNAL_OPTION = {
  mode: "ENABLED",
  subjectFightId: 1,
  className: "Rogue",
  specName: "Assassination",
  metric: "dps",
  partition: { mode: "PINNED", partition: 3 },
} as const;

function requestOf(fightCount: number, external: boolean) {
  const parsed = parseEncounterContextRequest({
    reportCode: REPORT,
    fightIds: Array.from({ length: fightCount }, (_, index) => index + 1),
    ...(external ? { externalReferences: EXTERNAL_OPTION } : {}),
  });
  if (!parsed.ok) throw new Error(`fixture request rejected: ${JSON.stringify(parsed.issues)}`);
  return parsed.request;
}

describe("the bounds M8-H inherits are unchanged", () => {
  it("still allows at most four subject fights", () => {
    // M8 added no fifth fight. Encounter context reuses M7's selection rule
    // rather than introducing its own, so this is the ONLY fight ceiling.
    expect(MAX_RAID_NIGHT_FIGHTS).toBe(4);
  });

  it("still allows exactly one ranking page and five qualified candidates", () => {
    expect(MAX_CANDIDATE_PAGES).toBe(1);
    expect(MAX_QUALIFIED_CANDIDATES).toBe(5);
  });

  it("leaves the subrequest safety budget at the M7 figure", () => {
    // Exposing a new endpoint is not a reason to widen a per-invocation budget.
    // 1000 remains this PROJECT'S conservative choice, not a platform ceiling.
    expect(RAID_NIGHT_SUBREQUEST_SAFETY_BUDGET).toBe(1000);
    expect(WORST_CASE_SUBREQUESTS_PER_FIGHT).toBe(MAX_PAGES + 2);
    expect(RAID_NIGHT_FIXED_SUBREQUESTS).toBe(2);
  });
});

describe("external discovery adds exactly six requests, never more", () => {
  it("prices the external phase as one page plus five metadata lookups", () => {
    const plan = planEncounterContextCost(requestOf(1, true));
    expect(plan.externalReferencesEnabled).toBe(true);
    expect(plan.maxExternalRequests).toBe(MAX_CANDIDATE_PAGES + MAX_QUALIFIED_CANDIDATES);
    expect(plan.maxExternalRequests).toBe(6);
  });

  it("prices a local-only request at zero external requests", () => {
    const plan = planEncounterContextCost(requestOf(4, false));
    expect(plan.externalReferencesEnabled).toBe(false);
    expect(plan.maxExternalRequests).toBe(0);
  });

  it("adds no temporal-context retrieval at all", () => {
    // M8-E context is computed from an ALREADY-INGESTED fight. If this ever
    // becomes non-zero, something started fetching again.
    expect(planEncounterContextCost(requestOf(4, true)).maxTemporalContextRequests).toBe(0);
  });
});

describe("admission units are the fight count plus the external ceiling", () => {
  it.each([
    [1, false, 1],
    [4, false, 4],
    [1, true, 7],
    [4, true, 10],
  ])("charges %i fights, external=%s, as %i units", (fightCount, external, expected) => {
    expect(encounterContextAdmissionUnits(requestOf(fightCount, external))).toBe(expected);
  });

  it("pins the worst case at ten", () => {
    expect(MAX_ENCOUNTER_CONTEXT_ADMISSION_UNITS).toBe(10);
    expect(encounterContextAdmissionUnits(requestOf(MAX_RAID_NIGHT_FIGHTS, true))).toBe(
      MAX_ENCOUNTER_CONTEXT_ADMISSION_UNITS,
    );
  });

  it("never prices any admissible request above the pinned maximum", () => {
    for (let fightCount = 1; fightCount <= MAX_RAID_NIGHT_FIGHTS; fightCount += 1) {
      for (const external of [false, true]) {
        expect(encounterContextAdmissionUnits(requestOf(fightCount, external))).toBeLessThanOrEqual(
          MAX_ENCOUNTER_CONTEXT_ADMISSION_UNITS,
        );
      }
    }
  });

  it("costs strictly more with external references than without", () => {
    // Asking for a third-party phase must never be free, whatever it returns.
    for (let fightCount = 1; fightCount <= MAX_RAID_NIGHT_FIGHTS; fightCount += 1) {
      expect(encounterContextAdmissionUnits(requestOf(fightCount, true))).toBeGreaterThan(
        encounterContextAdmissionUnits(requestOf(fightCount, false)),
      );
    }
  });
});

describe("the worst possible request still fits the subrequest budget", () => {
  it("spends 4 x 202 + 2 + 6 = 816 of 1000", () => {
    // Written out because this is the arithmetic that justifies the endpoint
    // being safe to expose at all, and every term is read from a constant.
    const local = projectWorstCaseRaidNightSubrequests(MAX_RAID_NIGHT_FIGHTS);
    const external = MAX_CANDIDATE_PAGES + MAX_QUALIFIED_CANDIDATES;

    expect(WORST_CASE_SUBREQUESTS_PER_FIGHT).toBe(202);
    expect(local).toBe(MAX_RAID_NIGHT_FIGHTS * 202 + 2);
    expect(local).toBe(810);
    expect(local + external).toBe(816);
    expect(local + external).toBeLessThan(RAID_NIGHT_SUBREQUEST_SAFETY_BUDGET);
  });

  it("keeps 184 subrequests of headroom, which is less than a fifth fight would need", () => {
    // Stated so the margin is a known quantity rather than an assumption. It is
    // NOT permission to add a fifth fight: 202 more would overrun 1000.
    const worst = projectWorstCaseRaidNightSubrequests(MAX_RAID_NIGHT_FIGHTS) + 6;
    expect(RAID_NIGHT_SUBREQUEST_SAFETY_BUDGET - worst).toBe(184);
    expect(worst + WORST_CASE_SUBREQUESTS_PER_FIGHT).toBeGreaterThan(RAID_NIGHT_SUBREQUEST_SAFETY_BUDGET);
  });

  it("makes the external phase a rounding error next to one extra fight", () => {
    // Why external discovery could be added without revisiting the fight bound:
    // six metadata-only requests, against 202 for a single ingested pull.
    expect(MAX_CANDIDATE_PAGES + MAX_QUALIFIED_CANDIDATES).toBeLessThan(WORST_CASE_SUBREQUESTS_PER_FIGHT);
  });
});
