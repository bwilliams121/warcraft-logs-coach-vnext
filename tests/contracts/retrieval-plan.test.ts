import { describe, expect, it } from "vitest";

import {
  EVENTS_QUERY,
  EVENTS_QUERY_WITH_HOSTILITY,
  eventsQueryFor,
  eventsVariables,
} from "../../src/wcl/events-query.js";
import {
  createEventRetrievalPlan,
  EVENT_PAGE_LIMIT,
  MAX_EVENTS,
  MAX_PAGES,
  streamIdFor,
  summarizePlan,
} from "../../src/wcl/retrieval-plan.js";
import { FIGHT_CONTEXT_QUERY } from "../../src/wcl/fight-context-query.js";

const PLAN = createEventRetrievalPlan({
  reportCode: "aBcDeFgH12345678",
  fightId: 6,
  startTimeMs: 1000,
  endTimeMs: 5000,
  includeResources: false,
});

const BOTH_QUERIES = [EVENTS_QUERY, EVENTS_QUERY_WITH_HOSTILITY];

describe("the event query cannot silently shrink the result set", () => {
  /**
   * Each of these arguments truncates or filters results in a way that is
   * indistinguishable from "nothing happened". None may appear.
   */
  const FORBIDDEN_ARGUMENTS = [
    "sourceID",
    "targetID",
    "sourceInstanceID",
    "targetInstanceID",
    "sourceClass",
    "targetClass",
    "filterExpression",
    "killType",
    "wipeCutoff",
    "viewOptions",
    "sourceAurasPresent",
    "sourceAurasAbsent",
    "targetAurasPresent",
    "targetAurasAbsent",
    "death:",
  ];

  it.each(FORBIDDEN_ARGUMENTS)("never sends %s", (argument) => {
    for (const query of BOTH_QUERIES) {
      expect(query).not.toContain(argument);
    }
  });

  it("has no way to express an actor filter in the plan type either", () => {
    // Absence from the query is not enough; the plan itself must be incapable
    // of carrying one, so a later change cannot set it without an obvious edit.
    expect(PLAN).not.toHaveProperty("sourceId");
    expect(PLAN).not.toHaveProperty("sourceID");
    expect(PLAN).not.toHaveProperty("targetId");
    expect(Object.keys(PLAN).sort()).toEqual([
      "dataType",
      "endTimeMs",
      "fightId",
      "hostility",
      "includeResources",
      "limit",
      "reportCode",
      "startTimeMs",
      "translate",
      "useAbilityIDs",
      "useActorIDs",
    ]);
  });

  it("never sends an actor filter in the variables", () => {
    const variables = eventsVariables(PLAN, "UNSPECIFIED", 1000);
    expect(variables).not.toHaveProperty("sourceID");
    expect(variables).not.toHaveProperty("targetID");
  });
});

describe("the event query retrieves one chronological All stream", () => {
  it("requests dataType All as a literal decision, not a parameter", () => {
    for (const query of BOTH_QUERIES) {
      expect(query).toContain("dataType: All");
    }
    expect(PLAN.dataType).toBe("All");
  });

  it("sets translate, useActorIDs and useAbilityIDs explicitly", () => {
    // Set rather than relied on as defaults, so fixtures are reproducible and
    // provenance can record exactly what produced them.
    for (const query of BOTH_QUERIES) {
      expect(query).toContain("translate: true");
      expect(query).toContain("useActorIDs: true");
      expect(query).toContain("useAbilityIDs: true");
    }
  });

  it("selects exactly the two paginator fields the schema defines", () => {
    for (const query of BOTH_QUERIES) {
      expect(query).toContain("data");
      expect(query).toContain("nextPageTimestamp");
      // There is no `truncated`, `count` or `hasMore` field on
      // ReportEventPaginator. Selecting one would fail upstream.
      expect(query).not.toContain("truncated");
      expect(query).not.toContain("hasMore");
    }
  });

  it("omits hostilityType entirely rather than passing an explicit null", () => {
    // Passing null for an optional enum is not reliably the same as omitting
    // it, and what omission returns is probe question P1.
    expect(eventsQueryFor("UNSPECIFIED")).toBe(EVENTS_QUERY);
    expect(EVENTS_QUERY).not.toContain("hostilityType");
    expect(eventsVariables(PLAN, "UNSPECIFIED", 1000)).not.toHaveProperty("hostilityType");
  });

  it("uses the verified HostilityType enum values when a view is requested", () => {
    expect(eventsQueryFor("ENEMY")).toBe(EVENTS_QUERY_WITH_HOSTILITY);
    expect(eventsVariables(PLAN, "ENEMY", 1000)["hostilityType"]).toBe("Enemies");
    expect(eventsVariables(PLAN, "FRIENDLY", 1000)["hostilityType"]).toBe("Friendlies");
  });

  it("gives each hostility view a distinct stream id", () => {
    expect(streamIdFor("UNSPECIFIED")).toBe("all");
    expect(streamIdFor("FRIENDLY")).toBe("all:friendlies");
    expect(streamIdFor("ENEMY")).toBe("all:enemies");
  });
});

describe("page limit and safety ceilings", () => {
  it("uses a reasoned limit inside the documented 100-10000 range", () => {
    expect(EVENT_PAGE_LIMIT).toBeGreaterThanOrEqual(100);
    expect(EVENT_PAGE_LIMIT).toBeLessThanOrEqual(10_000);
    // Not the API default of 300, which would need ~1000 requests for a large
    // pull, and not blindly 10000 either. Probe question P10 finalises it.
    expect(EVENT_PAGE_LIMIT).not.toBe(300);
  });

  it("keeps the page ceiling inside the 1000-subrequest working budget", () => {
    // 1000 is THIS PROJECT'S conservative budget, not the platform maximum —
    // Cloudflare Workers Paid currently documents 10,000 subrequests per
    // invocation. See RAID_NIGHT_SUBREQUEST_SAFETY_BUDGET for why the stricter
    // number is kept. The assertion is unchanged, and so is MAX_PAGES: 200 pages
    // plus the token and context requests leave ample headroom either way.
    expect(MAX_PAGES).toBeLessThan(1000);
    expect(MAX_EVENTS).toBeGreaterThan(MAX_PAGES * EVENT_PAGE_LIMIT - 1);
  });
});

describe("plan provenance", () => {
  it("summarises every argument that shaped the retrieval", () => {
    expect(summarizePlan(PLAN)).toEqual({
      dataType: "All",
      limit: EVENT_PAGE_LIMIT,
      includeResources: false,
      hostility: ["UNSPECIFIED"],
      translate: true,
      useActorIDs: true,
      useAbilityIDs: true,
      requestedStartTimeMs: 1000,
      requestedEndTimeMs: 5000,
    });
  });

  it("carries no credential-shaped field", () => {
    const serialized = JSON.stringify(summarizePlan(PLAN)).toLowerCase();
    for (const needle of ["secret", "token", "authorization", "bearer", "client_id"]) {
      expect(serialized).not.toContain(needle);
    }
  });
});

describe("the context query prefers typed fields over non-frozen JSON", () => {
  it("requests phases and phase transitions from the typed schema", () => {
    expect(FIGHT_CONTEXT_QUERY).toContain("phaseTransitions");
    expect(FIGHT_CONTEXT_QUERY).toContain("isIntermission");
  });

  it("requests archive status so an inaccessible archive is caught before paginating", () => {
    expect(FIGHT_CONTEXT_QUERY).toContain("archiveStatus");
    expect(FIGHT_CONTEXT_QUERY).toContain("isAccessible");
  });

  it("requests fight finality and the talent import code", () => {
    expect(FIGHT_CONTEXT_QUERY).toContain("inProgress");
    expect(FIGHT_CONTEXT_QUERY).toContain("talentImportCode");
  });

  it("does not request a third non-frozen JSON surface", () => {
    // playerDetails, table, graph and rankings are all non-frozen JSON costing
    // extra points for data reachable from events or typed fields.
    for (const field of ["playerDetails", "rankings", "table(", "graph("]) {
      expect(FIGHT_CONTEXT_QUERY).not.toContain(field);
    }
  });
});
