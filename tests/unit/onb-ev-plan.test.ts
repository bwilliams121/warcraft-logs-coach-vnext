import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  assembleListingPage,
  capturesOf,
  listingRequestPagesOf,
  mayStartCapture,
  ONB_EV_SELECTION_REVISION,
  pageCeilingOf,
  planDigest,
  selectSubjects,
  worstCaseRequests,
  type OnbEvListingPage,
  type OnbEvPlan,
} from "../../scripts/corpus/onb-ev-selection.mjs";
import { isSpecModule, type SpecModule } from "../../src/findings/spec-module.js";
import { PRODUCTION_CATALOG } from "../../src/services/analyzer-registry.js";
import { SIMC_PROFILE_ENVIRONMENT } from "../../src/data/simc-profile/simc-profile-environment.js";
import { COMMITTED_DEPLOY_CALENDAR_EVIDENCE } from "../../src/simulation-context/evidence.js";
import { deriveDeploymentCalendar } from "../../src/simulation-context/intervals.js";

/**
 * ONB-EV-PLAN: the frozen plan ONB-EV executes (agent/onb-ev-plan.json). No request is made here. The
 * eligibility census reads uncommitted retained captures, so it is recorded in agent/architecture.md
 * "ONB-EV-PLAN" and not pinned. What this file pins is what a later edit could quietly change: the
 * digest, the list and its order, the arithmetic, the neutrality of the rule, and that the plan still
 * says what the production registrations and the deploy calendar say while it is unexecuted.
 */

const PLAN = JSON.parse(readFileSync("agent/onb-ev-plan.json", "utf8")) as OnbEvPlan;

const REGISTRATION_MODULES: Record<string, Record<string, unknown>> = import.meta.glob(
  "../../src/specs/*/*/registration.ts",
  { eager: true },
);
const MODULES: readonly SpecModule[] = Object.values(REGISTRATION_MODULES).flatMap((exports) =>
  Object.values(exports).filter(isSpecModule),
);

// ---------------------------------------------------------------------------
// A listing page, in the shape the plan requests
// ---------------------------------------------------------------------------

const REPORT_START_MS = Date.parse("2026-10-01T00:00:00.000Z");

interface FightRow {
  readonly id: number;
  readonly roster: readonly (readonly [number, string])[];
  readonly durationMs?: number;
  readonly difficulty?: number;
  readonly encounterID?: number;
}

const report = (
  code: string,
  classes: Readonly<Record<number, string>>,
  fights: readonly FightRow[],
  overrides: Readonly<Record<string, unknown>> = {},
): Readonly<Record<string, unknown>> => ({
  code,
  startTime: REPORT_START_MS,
  region: { slug: "US" },
  zone: { id: 53 },
  masterData: {
    actors: Object.entries(classes).map(([id, subType]) => ({ id: Number(id), subType })),
  },
  fights: fights.map((fight) => ({
    id: fight.id,
    encounterID: fight.encounterID ?? 3455,
    difficulty: fight.difficulty ?? 5,
    startTime: 1_000,
    endTime: 1_000 + (fight.durationMs ?? 200_000),
    friendlyPlayers: fight.roster.map(([actorId]) => actorId),
    friendlySpecs: fight.roster.map(([, spec]) => spec),
  })),
  ...overrides,
});

const pageOf = (...reports: readonly Readonly<Record<string, unknown>>[]): OnbEvListingPage => ({ reports });

const candidateOf = (pages: readonly OnbEvListingPage[], specId: string) =>
  selectSubjects(PLAN, pages).rows.find((row) => row.specId === specId)?.candidates ?? [];

// ---------------------------------------------------------------------------

describe("ONB-EV-PLAN: the frozen plan", () => {
  it("its digest is recomputed from its bytes, so any edit shows", () => {
    expect(planDigest(PLAN)).toBe(PLAN.planDigest);
    expect(planDigest({ ...PLAN, discovery: { ...PLAN.discovery, orderSalt: "another" } })).not.toBe(
      PLAN.planDigest,
    );
    expect(PLAN.selectionRevision).toBe(ONB_EV_SELECTION_REVISION);
  });

  it("marking the plan executed keeps its identity, and changing a limit does not", () => {
    expect(planDigest({ ...PLAN, status: "EXECUTED" })).toBe(PLAN.planDigest);
    expect(planDigest({ ...PLAN, limits: { ...PLAN.limits, prefixPageCeiling: 11 } })).not.toBe(
      PLAN.planDigest,
    );
  });

  it("lists the recorded twelve in the recorded order, and removes none", () => {
    expect(PLAN.specializations.map((row) => row.specId)).toEqual([
      "priest/discipline",
      "rogue/subtlety",
      "warrior/fury",
      "warrior/protection",
      "shaman/enhancement",
      "rogue/outlaw",
      "druid/guardian",
      "hunter/survival",
      "mage/frost",
      "warlock/affliction",
      "hunter/marksmanship",
      "demonhunter/vengeance",
    ]);
    expect(PLAN.removedSpecializations).toEqual([]);
  });

  it("asks for nothing the grant excludes", () => {
    const asked = [PLAN.discovery.listing, ...PLAN.discovery.listingFields].join(" ");
    expect(asked).not.toMatch(
      /ranking|percentile|parse|bracket|dps|hps|amount|kill\b|bossPercentage|fightPercentage/i,
    );
    expect(asked).not.toMatch(/\b(table|events|playerDetails)\b/);
    expect(PLAN.capture).toMatchObject({ actorFilter: "NONE", filterExpression: "NONE", dataType: "All" });
  });

  it("counts the worst case as the grant counts it, and says it exceeds the cap", () => {
    const budget = PLAN.requestBudget;
    expect(budget.hardCap).toBe(60);
    expect(budget.tokenRequests).toBe(4);
    expect(budget.refusedListingRequests).toBe(2);
    expect(budget.listingRequests).toBe(12);
    expect(budget.contextRequests).toBe(36);
    expect(budget.eventPages).toBe(146);
    expect(budget.revisionRequests).toBe(12);
    expect(budget.worstCaseTotal).toBe(212);
    expect(worstCaseRequests(PLAN)).toBe(budget.worstCaseTotal);
    expect(budget.listingPages).toBe(PLAN.discovery.listingSequence.length);
    expect(budget.exceedsHardCap).toBe(budget.worstCaseTotal > budget.hardCap);
  });

  it("states the archive's headroom as the notice line less the counted bytes", () => {
    const storage = PLAN.storage as {
      noticeLineBytes: number;
      countedBytes: number;
      bytesLeftUnderNoticeLine: number;
      measuredCommittedSliceBytes: Readonly<Record<string, number>>;
    };
    expect(storage.noticeLineBytes - storage.countedBytes).toBe(storage.bytesLeftUnderNoticeLine);
    for (const bytes of Object.values(storage.measuredCommittedSliceBytes)) {
      expect(bytes).toBeGreaterThan(storage.bytesLeftUnderNoticeLine);
    }
  });
});

describe.runIf(PLAN.status === "FROZEN")("ONB-EV-PLAN: agreement while the plan is unexecuted", () => {
  it("the queue names this digest, so the plan ONB-EV reads is the plan that was reviewed", () => {
    expect(readFileSync("agent/autopilot-queue.md", "utf8")).toContain(PLAN.planDigest);
  });

  it("each row states what its production registration declares", () => {
    for (const row of PLAN.specializations) {
      const registration = PRODUCTION_CATALOG.registrations.find((item) => item.specId === row.specId);
      expect(registration, row.specId).toBeDefined();
      if (registration === undefined) continue;
      expect(registration.exposure, row.specId).toBe("INTERNAL_ONLY");
      const identity = MODULES.find((module) => module.identity.specId === row.specId)?.identity;
      expect(identity?.wclClassName, row.specId).toBe(row.wclClassName);
      expect(identity?.wclSpecName, row.specId).toBe(row.wclSpecName);
      expect(registration.requirement.requiredScope, row.specId).toBe(row.scope);
      expect(registration.requirement.includeResources, row.specId).toBe(row.includeResources);
      const read =
        row.gate === "HEALER_GATE"
          ? registration.capabilities
          : registration.capabilities.filter((capability) => capability.domain === "OFFENSIVE_ROTATION");
      expect(read.length, row.specId).toBeGreaterThan(0);
      for (const capability of read) {
        expect([...capability.requirements.evidenceCategories].sort(), row.specId).toEqual(
          [...row.evidenceCategories].sort(),
        );
        expect([...capability.requirements.resources].sort(), row.specId).toEqual([...row.resources].sort());
      }
    }
  });

  it("a healer takes the whole fight, and a rotational row the first 90 s", () => {
    for (const row of PLAN.specializations) {
      expect(row.evidenceWindow.kind, row.specId).toBe(
        row.gate === "HEALER_GATE" ? "WHOLE_FIGHT" : "FIRST_MS",
      );
    }
  });

  it("its intervals are the deploy calendar's US intervals, on builds the profile record lists", () => {
    const evidence = COMMITTED_DEPLOY_CALENDAR_EVIDENCE;
    if (!evidence.ok) throw new Error(evidence.detail);
    const calendar = deriveDeploymentCalendar(evidence.evidence);
    const excluded = PLAN.excludedProvenIntervals.map((row) => row.gameBuild);
    const proven = calendar.intervals
      .filter((interval) => interval.region === "US" && !excluded.includes(interval.version))
      .map((interval) => ({
        region: interval.region,
        gameBuild: interval.version,
        fromUtc: new Date(interval.fromUtc).toISOString(),
        toUtc: new Date(interval.toUtc).toISOString(),
      }));
    const byBuild = (left: { gameBuild: string }, right: { gameBuild: string }): number =>
      left.gameBuild.localeCompare(right.gameBuild);
    expect([...PLAN.provenIntervals].sort(byBuild)).toEqual([...proven].sort(byBuild));
    const listed = SIMC_PROFILE_ENVIRONMENT.models.map((model) => model.gameDataBuild);
    // An exclusion must be a real calendar interval the profile record does not list, and nothing else.
    expect(excluded).toEqual(["12.1.5.70575"]);
    for (const build of excluded) {
      expect(calendar.intervals.map((interval) => interval.version)).toContain(build);
      expect(listed).not.toContain(build);
    }
    for (const interval of PLAN.provenIntervals) expect(listed).toContain(interval.gameBuild);
    for (const step of PLAN.discovery.listingSequence) {
      expect(PLAN.provenIntervals.map((interval) => interval.gameBuild)).toContain(step.gameBuild);
    }
  });
});

describe("ONB-EV-PLAN: the selection rule is neutral", () => {
  const classes = { 1: "Rogue", 2: "Mage", 3: "DeathKnight", 4: "Warrior", 5: "Paladin" };
  const a = report("REPORTAAAAAAAAAA", classes, [
    {
      id: 1,
      roster: [
        [1, "Subtlety"],
        [2, "Frost"],
      ],
    },
    {
      id: 2,
      roster: [
        [1, "Subtlety"],
        [2, "Frost"],
      ],
    },
  ]);
  const b = report("REPORTBBBBBBBBBB", classes, [
    {
      id: 7,
      roster: [
        [1, "Subtlety"],
        [2, "Frost"],
      ],
    },
  ]);

  it("listing order chooses nothing", () => {
    expect(selectSubjects(PLAN, [pageOf(a, b)])).toEqual(selectSubjects(PLAN, [pageOf(b, a)]));
  });

  it("no field beyond identity and bounds can move a result", () => {
    const decorate = (raw: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> => ({
      ...raw,
      rankings: [{ percentile: 99 }],
      fights: (raw["fights"] as readonly Readonly<Record<string, unknown>>[]).map((fight, index) => ({
        ...fight,
        kill: index % 2 === 0,
        bossPercentage: index === 0 ? 90 : 0,
        fightPercentage: index === 0 ? 90 : 0,
      })),
    });
    expect(selectSubjects(PLAN, [pageOf(decorate(a), decorate(b))])).toEqual(
      selectSubjects(PLAN, [pageOf(a, b)]),
    );
  });

  it("the salt, not the code's own order, sets the order, and retries come next in it", () => {
    const found = candidateOf([pageOf(a, b)], "rogue/subtlety");
    expect(found).toHaveLength(1 + PLAN.discovery.maxGateRetriesPerSpecialization);
    const another: OnbEvPlan = { ...PLAN, discovery: { ...PLAN.discovery, orderSalt: "another-salt" } };
    const orders = [PLAN, another].map((plan) =>
      selectSubjects(plan, [pageOf(a, b)])
        .rows.find((row) => row.specId === "rogue/subtlety")
        ?.candidates.map((row) => `${row.reportCode}/${String(row.fightId)}`),
    );
    expect(new Set(orders[0]).size).toBe(3);
    expect(orders[0]).toEqual(expect.arrayContaining(orders[1] ?? []));
  });

  it("overlapping pages keep distinct candidates, and a repeat takes no retry slot", () => {
    const three = report("REPORTCCCCCCCCCC", classes, [{ id: 9, roster: [[1, "Subtlety"]] }]);
    const found = candidateOf([pageOf(a), pageOf(a), pageOf(three, b)], "rogue/subtlety");
    const identities = found.map((row) => `${row.reportCode}/${String(row.fightId)}`);
    expect(new Set(identities).size).toBe(identities.length);
    expect(found).toHaveLength(1 + PLAN.discovery.maxGateRetriesPerSpecialization);
    const first = candidateOf([pageOf(a)], "rogue/subtlety");
    expect(found.slice(0, 2)).toEqual(first);
    const onePerPage = candidateOf(
      [
        pageOf(report("R1", classes, [{ id: 1, roster: [[1, "Subtlety"]] }])),
        pageOf(report("R1", classes, [{ id: 1, roster: [[1, "Subtlety"]] }])),
        pageOf(three),
      ],
      "rogue/subtlety",
    );
    expect(onePerPage.map((row) => row.reportCode)).toEqual(["R1", "REPORTCCCCCCCCCC"]);
  });

  it("an earlier page is never displaced by a later one", () => {
    const first = candidateOf([pageOf(a)], "rogue/subtlety")[0];
    expect(candidateOf([pageOf(a), pageOf(b)], "rogue/subtlety")[0]).toEqual(first);
  });
});

describe("ONB-EV-PLAN: what qualifies", () => {
  const classes = { 1: "Rogue", 2: "Mage", 3: "DeathKnight", 4: "Warrior", 5: "Paladin", 6: "Priest" };
  const subtlety: FightRow = { id: 1, roster: [[1, "Subtlety"]] };

  it("a build the calendar does not prove does not qualify", () => {
    for (const startTime of [
      Date.parse("2026-09-13T23:13:00.000Z"),
      Date.parse("2026-11-02T05:11:00.000Z"),
    ]) {
      expect(
        candidateOf([pageOf(report("R", classes, [subtlety], { startTime }))], "rogue/subtlety"),
      ).toEqual([]);
    }
    const inside = candidateOf([pageOf(report("R", classes, [subtlety]))], "rogue/subtlety");
    expect(inside.map((row) => row.gameBuild)).toEqual(["12.1.0.69933"]);
  });

  it("a fight on the excluded build does not qualify, though the calendar proves it", () => {
    const startTime = Date.parse("2026-10-28T12:00:00.000Z");
    expect(candidateOf([pageOf(report("R", classes, [subtlety], { startTime }))], "rogue/subtlety")).toEqual(
      [],
    );
  });

  it("a report with no US region does not qualify, and an absent region is not assumed", () => {
    for (const region of [{ slug: "EU" }, null, undefined]) {
      expect(candidateOf([pageOf(report("R", classes, [subtlety], { region }))], "rogue/subtlety")).toEqual(
        [],
      );
    }
  });

  it("another zone, difficulty or a trash fight does not qualify", () => {
    expect(
      candidateOf([pageOf(report("R", classes, [subtlety], { zone: { id: 1 } }))], "rogue/subtlety"),
    ).toEqual([]);
    for (const row of [
      { ...subtlety, difficulty: 3 },
      { ...subtlety, difficulty: 10 },
      { ...subtlety, encounterID: 0 },
    ]) {
      expect(candidateOf([pageOf(report("R", classes, [row]))], "rogue/subtlety")).toEqual([]);
    }
  });

  it("the class decides between specializations that share a name", () => {
    const page = pageOf(
      report("R", classes, [
        {
          id: 1,
          roster: [
            [3, "Frost"],
            [5, "Protection"],
          ],
        },
      ]),
    );
    expect(candidateOf([page], "mage/frost")).toEqual([]);
    expect(candidateOf([page], "warrior/protection")).toEqual([]);
    const right = pageOf(
      report("R", classes, [
        {
          id: 1,
          roster: [
            [2, "Frost"],
            [4, "Protection"],
          ],
        },
      ]),
    );
    expect(candidateOf([right], "mage/frost").map((row) => row.actorId)).toEqual([2]);
    expect(candidateOf([right], "warrior/protection").map((row) => row.actorId)).toEqual([4]);
  });

  it("no master data is no class, so nothing qualifies, never a guess", () => {
    expect(
      candidateOf([pageOf(report("R", classes, [subtlety], { masterData: null }))], "rogue/subtlety"),
    ).toEqual([]);
  });

  it("takes the lowest actor id, and refuses an actor listed twice", () => {
    const page = pageOf(
      report("R", { 8: "Rogue", 3: "Rogue", 2: "Rogue" }, [
        {
          id: 1,
          roster: [
            [8, "Subtlety"],
            [3, "Subtlety"],
            [2, "Outlaw"],
          ],
        },
      ]),
    );
    expect(candidateOf([page], "rogue/subtlety").map((row) => row.actorId)).toEqual([3]);
    const twice = pageOf(
      report("R", { 3: "Rogue" }, [
        {
          id: 1,
          roster: [
            [3, "Subtlety"],
            [3, "Subtlety"],
          ],
        },
      ]),
    );
    expect(candidateOf([twice], "rogue/subtlety")).toEqual([]);
  });

  it("a misaligned roster does not qualify", () => {
    const raw = report("R", classes, [subtlety]);
    const fight = (raw["fights"] as readonly Readonly<Record<string, unknown>>[])[0];
    const misaligned = { ...raw, fights: [{ ...fight, friendlySpecs: ["Subtlety", "Outlaw"] }] };
    expect(candidateOf([pageOf(misaligned)], "rogue/subtlety")).toEqual([]);
  });

  it("a rotational row needs its 90 s, and a whole-fight row needs a fight its ceiling can hold", () => {
    const row = (durationMs: number): OnbEvListingPage =>
      pageOf(
        report("R", classes, [
          {
            id: 1,
            durationMs,
            roster: [
              [1, "Subtlety"],
              [6, "Discipline"],
            ],
          },
        ]),
      );
    expect(candidateOf([row(89_999)], "rogue/subtlety")).toEqual([]);
    expect(candidateOf([row(90_000)], "rogue/subtlety")).toHaveLength(1);
    expect(candidateOf([row(89_999)], "priest/discipline")).toEqual([]);
    expect(candidateOf([row(360_000)], "priest/discipline")).toHaveLength(1);
    expect(candidateOf([row(360_001)], "priest/discipline")).toEqual([]);
    expect(candidateOf([row(600_000)], "rogue/subtlety")).toHaveLength(1);
  });

  it("no candidate asks for the next listed page, and the sequence is never widened", () => {
    const empty = pageOf();
    expect(selectSubjects(PLAN, [empty]).needsAnotherPage).toBe(true);
    const all = [empty, empty, empty, empty];
    const done = selectSubjects(PLAN, all);
    expect(done.needsAnotherPage).toBe(false);
    expect(done.rows.every((row) => row.status === "NO_CANDIDATE")).toBe(true);
  });
});

describe("ONB-EV-PLAN: captures and the cap", () => {
  const classes = { 1: "Rogue", 2: "Mage", 6: "Priest", 7: "Warrior" };

  it("one fight serves every specialization whose first it is, and a healer on it makes it whole", () => {
    const page = pageOf(
      report("R", classes, [
        {
          id: 1,
          roster: [
            [1, "Subtlety"],
            [2, "Frost"],
            [6, "Discipline"],
          ],
        },
        { id: 2, roster: [[7, "Fury"]] },
      ]),
    );
    const captures = capturesOf(PLAN, selectSubjects(PLAN, [page]));
    expect(captures.map((capture) => capture.fightId)).toEqual([1, 2]);
    expect(captures[0]?.windowKind).toBe("WHOLE_FIGHT");
    expect(captures[0]?.includeResources).toBe(true);
    expect(captures[0]?.subjects.map((subject) => subject.specId)).toEqual([
      "priest/discipline",
      "rogue/subtlety",
      "mage/frost",
    ]);
    expect(captures[1]?.windowKind).toBe("FIRST_MS");
    expect(captures[1]?.subjects.map((subject) => subject.specId)).toEqual(["warrior/fury"]);
  });

  it("a capture starts only with every subject's context, its whole page ceiling and its revision in hand", () => {
    expect(pageCeilingOf(PLAN, "FIRST_MS")).toBe(10);
    expect(pageCeilingOf(PLAN, "WHOLE_FIGHT")).toBe(36);
    expect(mayStartCapture(PLAN, "FIRST_MS", 12, 1)).toBe(true);
    expect(mayStartCapture(PLAN, "FIRST_MS", 11, 1)).toBe(false);
    expect(mayStartCapture(PLAN, "FIRST_MS", 12, 2)).toBe(false);
    expect(mayStartCapture(PLAN, "WHOLE_FIGHT", 43, 6)).toBe(true);
    expect(mayStartCapture(PLAN, "WHOLE_FIGHT", 42, 6)).toBe(false);
  });

  it("the first capture of the frozen order fits after one listing page, with every subject on it", () => {
    const budget = PLAN.requestBudget;
    const onePage = listingRequestPagesOf(PLAN, 1).length;
    const left = budget.hardCap - budget.tokenRequests - budget.refusedListingRequests - onePage;
    expect(left).toBe(51);
    expect(mayStartCapture(PLAN, "WHOLE_FIGHT", left, PLAN.specializations.length)).toBe(true);
  });

  it("after the whole listing sequence, a first capture of five subjects fits and six stops at the cap", () => {
    const budget = PLAN.requestBudget;
    const left =
      budget.hardCap - budget.tokenRequests - budget.refusedListingRequests - budget.listingRequests;
    expect(left).toBe(42);
    expect(mayStartCapture(PLAN, "WHOLE_FIGHT", left, 5)).toBe(true);
    expect(mayStartCapture(PLAN, "WHOLE_FIGHT", left, 6)).toBe(false);
  });
});

describe("ONB-EV-PLAN revision 2: the listing's API-compatibility correction", () => {
  const rows = (count: number): readonly Readonly<Record<string, unknown>>[] =>
    Array.from({ length: count }, (_, index) =>
      report(`R${String(index).padStart(3, "0")}`, { 1: "Rogue", 2: "Mage" }, [
        {
          id: 1,
          roster: [
            [1, "Subtlety"],
            [2, "Frost"],
          ],
        },
      ]),
    );
  const LIMIT = PLAN.discovery.listingRequestLimit;
  const asRequested = (listing: readonly unknown[], last: number): ReadonlyMap<number, readonly unknown[]> =>
    new Map(
      Array.from({ length: last }, (_, index) => [
        index + 1,
        listing.slice(index * LIMIT, (index + 1) * LIMIT),
      ]),
    );

  it("differs from revision 1 only in the listing's request limit, its record and the restated budget", () => {
    const revision = PLAN as unknown as Record<string, unknown>;
    const { revisionOf, ...rest } = revision;
    const { listingRequestLimit, ...discovery } = PLAN.discovery;
    expect(listingRequestLimit).toBe(34);
    const restored = {
      ...rest,
      planVersion: 1,
      planRevision: "onb-ev-plan/1",
      discovery,
      requestBudget: {
        hardCap: 60,
        tokenRequests: 2,
        listingPages: 4,
        contextRequests: 36,
        eventPages: 146,
        revisionRequests: 12,
        worstCaseTotal: 200,
        exceedsHardCap: true,
      },
    };
    expect(revisionOf).toMatchObject({
      planRevision: "onb-ev-plan/1",
      kind: "API_COMPATIBILITY_CORRECTION",
    });
    expect(planDigest(restored)).toBe(PLAN.revisionOf.planDigest);
    expect(PLAN.revisionOf.planDigest).toBe(
      "48066f986e7035542bf81c0263f4cec0d9d70e0f3d892ab6eb7ed535e6fa0013",
    );
  });

  it("the limit is the one the refusal justifies, under a cost linear in the rows with a constant of at least 0", () => {
    const [failed] = PLAN.revisionOf.failedRequests;
    if (failed === undefined) throw new Error("no failed request is recorded");
    const { maxComplexity, gotComplexity } = failed.stated;
    expect(failed.errorText).toContain(String(gotComplexity));
    // Half the rows cost at least half the stated complexity, which is over the maximum, so 50 cannot fit.
    expect(gotComplexity / 2).toBeGreaterThan(maxComplexity);
    // Unknown is how much of the cost is constant, so a limit needs margin. 34 of 100 rows at no constant:
    expect((gotComplexity * LIMIT) / failed.limit).toBeLessThan(maxComplexity);
    // 34 is the smallest limit that still reads a page in three requests, so it reads the fewest extra rows.
    expect(Math.ceil(PLAN.discovery.pageSize / LIMIT)).toBe(3);
    expect(Math.ceil(PLAN.discovery.pageSize / (LIMIT - 1))).toBe(4);
  });

  it("names the request pages of each listing page, sharing the one between them", () => {
    expect(listingRequestPagesOf(PLAN, 1)).toEqual([1, 2, 3]);
    expect(listingRequestPagesOf(PLAN, 2)).toEqual([3, 4, 5, 6]);
  });

  it("assembles exactly the rows one request of the page size would return, and selects the same", () => {
    const listing = rows(204);
    const requested = asRequested(listing, 6);
    const first = assembleListingPage(PLAN, 1, requested);
    const second = assembleListingPage(PLAN, 2, requested);
    expect(first?.reports).toEqual(listing.slice(0, 100));
    expect(second?.reports).toEqual(listing.slice(100, 200));
    if (first === null || second === null) throw new Error("not assembled");
    const asOneRequest = [pageOf(...listing.slice(0, 100)), pageOf(...listing.slice(100, 200))];
    expect(selectSubjects(PLAN, [first])).toEqual(
      selectSubjects(PLAN, [asOneRequest[0] as OnbEvListingPage]),
    );
    expect(selectSubjects(PLAN, [first, second])).toEqual(selectSubjects(PLAN, asOneRequest));
  });

  it("a row past the page's end cannot reach the selection", () => {
    const listing = rows(102);
    const first = assembleListingPage(PLAN, 1, asRequested(listing, 3));
    const beyond = report("BEYONDTHEPAGE", { 1: "Rogue" }, [{ id: 1, roster: [[1, "Outlaw"]] }]);
    const withBeyond = [...listing.slice(0, 101), beyond];
    const same = assembleListingPage(PLAN, 1, asRequested(withBeyond, 3));
    expect(same).toEqual(first);
    if (same === null) throw new Error("not assembled");
    expect(candidateOf([same], "rogue/outlaw")).toEqual([]);
  });

  it("a listing that ends early is assembled as it stands, and a later page is empty", () => {
    const listing = rows(50);
    const requested = asRequested(listing, 6);
    expect(assembleListingPage(PLAN, 1, requested)?.reports).toEqual(listing);
    expect(assembleListingPage(PLAN, 2, requested)?.reports).toEqual([]);
  });

  it("refuses rows it cannot place, and never guesses the listing", () => {
    const full = rows(LIMIT);
    expect(assembleListingPage(PLAN, 1, new Map([[1, full]]))).toBeNull();
    expect(
      assembleListingPage(
        PLAN,
        1,
        new Map([
          [1, rows(LIMIT + 1)],
          [2, []],
          [3, []],
        ]),
      ),
    ).toBeNull();
    expect(
      assembleListingPage(
        PLAN,
        1,
        new Map([
          [1, rows(LIMIT - 1)],
          [2, rows(1)],
          [3, []],
        ]),
      ),
    ).toBeNull();
  });
});
