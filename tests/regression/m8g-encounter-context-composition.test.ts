/**
 * Encounter-context composition reuses M7 rather than re-orchestrating it, and
 * external discovery never touches the local result.
 *
 * THE TWO PROPERTIES THAT MATTER MOST
 *
 *   ONE INGESTION   the composition must not call the raid-night runner and then
 *                   separately re-fetch every fight for M8 context. That would
 *                   double the metered cost of every request, and it is the
 *                   single easiest mistake to make here. Counted by port calls,
 *                   not by reading the code.
 *
 *   LOCAL SURVIVES  external discovery is optional, metered, third-party and
 *                   failure-prone. Every one of its outcomes must leave the
 *                   local progression byte-identical.
 */

import { describe, expect, it } from "vitest";

import {
  analyzeEncounterContext,
  planEncounterContextCost,
} from "../../src/services/encounter-context-service.js";
import { parseEncounterContextRequest } from "../../src/services/encounter-context-request.js";
import type { EncounterContextRequest } from "../../src/services/encounter-context-request.js";
import { projectEncounterContextResult } from "../../src/contracts/encounter-context-projection.js";
import type { ExternalDiscoveryPorts } from "../../src/external-context/external-discovery.js";
import { rankingPayload, rankingRow, candidateReport } from "../support/m8f-fixture.js";
import { decodeRankingPayload } from "../../src/wcl/rankings/rankings-decoder.js";
import {
  assassinationSnapshot,
  fakePorts,
  ENV,
  M5D2_ACTOR,
  REPORT_CODE,
} from "../support/raid-night-orchestration-fixture.js";

const FIXTURE_REPORT = REPORT_CODE;
const FIXTURE_FIGHT_IDS = [1, 2, 3] as const;
/** `rosterFightFor`'s defaults, which `assassinationSnapshot` inherits. */
const FIXTURE_ENCOUNTER_ID = 2900;
const FIXTURE_DIFFICULTY = 5;

interface Counters {
  rankingCalls: number;
  metadataCalls: number;
}

function externalPorts(
  counters: Counters,
  options: { readonly rankings?: unknown; readonly metadata?: "OK" | "INACCESSIBLE" } = {},
): ExternalDiscoveryPorts {
  return {
    rankingPage: async () => {
      counters.rankingCalls += 1;
      return decodeRankingPayload(
        options.rankings ??
          rankingPayload([
            rankingRow({ code: "EXTREPORT000001", fightID: 3, durationMs: 300_000 }),
            rankingRow({ code: "EXTREPORT000002", fightID: 4, durationMs: 310_000 }),
          ]),
      );
    },
    candidateMetadata: async (reportCode, fightId) => {
      counters.metadataCalls += 1;
      return options.metadata === "INACCESSIBLE"
        ? null
        : candidateReport({
            code: reportCode,
            fightId,
            encounterId: FIXTURE_ENCOUNTER_ID,
            difficulty: FIXTURE_DIFFICULTY,
          });
    },
  };
}

function requestOf(overrides: Record<string, unknown> = {}): EncounterContextRequest {
  const parsed = parseEncounterContextRequest({
    reportCode: FIXTURE_REPORT,
    fightIds: [...FIXTURE_FIGHT_IDS],
    ...overrides,
  });
  if (!parsed.ok) throw new Error(`request rejected: ${JSON.stringify(parsed.issues)}`);
  return parsed.request;
}

async function run(
  request: EncounterContextRequest,
  external?: { readonly ports: ExternalDiscoveryPorts; readonly counters: Counters },
) {
  const fixture = fakePorts({
    snapshot: assassinationSnapshot({
      fightIds: [...FIXTURE_FIGHT_IDS],
      sourceIds: [M5D2_ACTOR],
    }),
  });
  const { env: _env, ...ports } = fixture.deps;
  const result = await analyzeEncounterContext(request, {
    env: ENV,
    raidNight: ports,
    ...(external === undefined ? {} : { external: external.ports }),
  });
  if (!result.ok) throw new Error(`run failed: ${result.error.code}`);
  return { analysis: result.analysis, fixture };
}

describe("composition reuses one ingestion per needed fight", () => {
  it("ingests each needed fight at most once", async () => {
    const { fixture } = await run(requestOf());
    expect(fixture.rosterCalls()).toBe(1);
    // One ingestion per needed fight, and never two for the same fight.
    const ingested = fixture.ingestedFightIds();
    expect(ingested.length).toBeLessThanOrEqual(FIXTURE_FIGHT_IDS.length);
    expect(new Set(ingested).size).toBe(ingested.length);
    expect(fixture.revisionCalls()).toBe(1);
  });

  it("produces local progression", async () => {
    const { analysis } = await run(requestOf());
    expect(analysis.progression.encounters.length).toBeGreaterThan(0);
    expect(analysis.progression.identity.reportCode).toBe(FIXTURE_REPORT);
  });

  it("carries M8-C phase facts through without a second fetch", async () => {
    const { analysis, fixture } = await run(requestOf());
    const pulls = analysis.progression.encounters.flatMap((encounter) => encounter.pulls);
    // Facts arrived for every ingested pull, and they rode the ingestion the
    // analysis already paid for — the count equals the number of fights, not
    // twice it.
    expect(pulls.every((pull) => pull.encounterFacts !== null)).toBe(true);
    expect(fixture.ingestedFightIds().length).toBe(pulls.length);
  });
});

describe("external discovery is opt-in and costs nothing when disabled", () => {
  it("issues zero ranking requests when omitted", async () => {
    const counters: Counters = { rankingCalls: 0, metadataCalls: 0 };
    const { analysis } = await run(requestOf(), { ports: externalPorts(counters), counters });
    expect(counters.rankingCalls).toBe(0);
    expect(counters.metadataCalls).toBe(0);
    expect(analysis.external).toEqual({ kind: "SKIPPED", reason: "NOT_REQUESTED" });
  });

  it("issues zero ranking requests when explicitly DISABLED", async () => {
    const counters: Counters = { rankingCalls: 0, metadataCalls: 0 };
    const { analysis } = await run(requestOf({ externalReferences: { mode: "DISABLED" } }), {
      ports: externalPorts(counters),
      counters,
    });
    expect(counters.rankingCalls).toBe(0);
    expect(analysis.external).toEqual({ kind: "SKIPPED", reason: "NOT_REQUESTED" });
  });

  it("runs a bounded discovery when enabled with a pinned partition", async () => {
    const counters: Counters = { rankingCalls: 0, metadataCalls: 0 };
    const { analysis } = await run(
      requestOf({
        externalReferences: {
          mode: "ENABLED",
          subjectFightId: FIXTURE_FIGHT_IDS[0] as number,
          className: "Rogue",
          specName: "Assassination",
          metric: "dps",
          partition: { mode: "PINNED", partition: 3 },
        },
      }),
      { ports: externalPorts(counters), counters },
    );

    expect(counters.rankingCalls).toBe(1);
    expect(counters.metadataCalls).toBeLessThanOrEqual(5);
    expect(analysis.external.kind).toBe("ATTEMPTED");
    if (analysis.external.kind !== "ATTEMPTED") return;
    const discovery = analysis.external.discovery;
    if (discovery.outcome !== "DISCOVERED") throw new Error("expected DISCOVERED");
    expect(discovery.selection.provenance.partition).toEqual({ kind: "EXPLICIT", partition: 3 });
  });

  it("records a LATEST partition as the non-pinned mode it is", async () => {
    const counters: Counters = { rankingCalls: 0, metadataCalls: 0 };
    const { analysis } = await run(
      requestOf({
        externalReferences: {
          mode: "ENABLED",
          subjectFightId: FIXTURE_FIGHT_IDS[0] as number,
          className: "Rogue",
          specName: "Assassination",
          metric: "dps",
          partition: { mode: "LATEST" },
        },
      }),
      { ports: externalPorts(counters), counters },
    );
    if (analysis.external.kind !== "ATTEMPTED") throw new Error("expected ATTEMPTED");
    const discovery = analysis.external.discovery;
    if (discovery.outcome !== "DISCOVERED") throw new Error("expected DISCOVERED");
    expect(discovery.selection.provenance.partition).toEqual({ kind: "WCL_DEFAULT_LATEST" });

    const document = projectEncounterContextResult(analysis);
    const section = document.externalReferences;
    if (section.status !== "COMPLETED") throw new Error("expected COMPLETED");
    expect(section.provenance.partition).toEqual({ mode: "LATEST" });
  });
});

describe("omitting a partition never silently means LATEST", () => {
  it("rejects ENABLED with no partition", () => {
    const parsed = parseEncounterContextRequest({
      reportCode: FIXTURE_REPORT,
      fightIds: [...FIXTURE_FIGHT_IDS],
      externalReferences: {
        mode: "ENABLED",
        subjectFightId: FIXTURE_FIGHT_IDS[0] as number,
        className: "Rogue",
        specName: "Assassination",
        metric: "dps",
      },
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues[0]?.field).toBe("externalReferences.partition");
    expect(parsed.issues[0]?.message).toContain("no default");
  });

  it("rejects a partition object with no mode", () => {
    const parsed = parseEncounterContextRequest({
      reportCode: FIXTURE_REPORT,
      fightIds: [...FIXTURE_FIGHT_IDS],
      externalReferences: {
        mode: "ENABLED",
        subjectFightId: FIXTURE_FIGHT_IDS[0] as number,
        className: "Rogue",
        specName: "Assassination",
        metric: "dps",
        partition: { partition: 3 },
      },
    });
    expect(parsed.ok).toBe(false);
  });

  it("rejects a subject fight that was not selected", () => {
    const parsed = parseEncounterContextRequest({
      reportCode: FIXTURE_REPORT,
      fightIds: [...FIXTURE_FIGHT_IDS],
      externalReferences: {
        mode: "ENABLED",
        subjectFightId: 9999,
        className: "Rogue",
        specName: "Assassination",
        metric: "dps",
        partition: { mode: "PINNED", partition: 1 },
      },
    });
    expect(parsed.ok).toBe(false);
  });

  it("treats omission as DISABLED", () => {
    const parsed = parseEncounterContextRequest({
      reportCode: FIXTURE_REPORT,
      fightIds: [...FIXTURE_FIGHT_IDS],
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.request.externalReferences).toEqual({ mode: "DISABLED" });
  });
});

describe("external outcomes never change the local result", () => {
  const ENABLED = {
    mode: "ENABLED",
    subjectFightId: FIXTURE_FIGHT_IDS[0] as number,
    className: "Rogue",
    specName: "Assassination",
    metric: "dps",
    partition: { mode: "PINNED", partition: 1 },
  };

  it("is byte-identical across success, empty, rejection and total failure", async () => {
    const baseline = JSON.stringify((await run(requestOf())).analysis.progression);

    const scenarios: readonly { readonly rankings?: unknown; readonly metadata?: "OK" | "INACCESSIBLE" }[] = [
      {},
      { rankings: rankingPayload([]) },
      { rankings: { error: "You cannot specify a size for a flexibly-sized raid zone." } },
      { rankings: { nonsense: true } },
      { metadata: "INACCESSIBLE" },
    ];

    for (const scenario of scenarios) {
      const counters: Counters = { rankingCalls: 0, metadataCalls: 0 };
      const { analysis } = await run(requestOf({ externalReferences: ENABLED }), {
        ports: externalPorts(counters, scenario),
        counters,
      });
      expect(JSON.stringify(analysis.progression), JSON.stringify(scenario)).toBe(baseline);
    }
  });

  it("keeps the request successful when the ranking payload is rejected", async () => {
    const counters: Counters = { rankingCalls: 0, metadataCalls: 0 };
    const { analysis } = await run(requestOf({ externalReferences: ENABLED }), {
      ports: externalPorts(counters, { rankings: { error: "declined" } }),
      counters,
    });
    // Local context present; external section carries the failure.
    expect(analysis.progression.encounters.length).toBeGreaterThan(0);
    const document = projectEncounterContextResult(analysis);
    expect(document.externalReferences.status).toBe("REQUEST_REJECTED");
  });

  it("keeps other qualified references when one candidate fails", async () => {
    const counters: Counters = { rankingCalls: 0, metadataCalls: 0 };
    const ports: ExternalDiscoveryPorts = {
      rankingPage: async () => {
        counters.rankingCalls += 1;
        return decodeRankingPayload(
          rankingPayload([
            rankingRow({ code: "EXTREPORT000001", fightID: 3, durationMs: 300_000 }),
            rankingRow({ code: "EXTREPORT000002", fightID: 4, durationMs: 310_000 }),
          ]),
        );
      },
      candidateMetadata: async (reportCode, fightId) => {
        counters.metadataCalls += 1;
        return reportCode === "EXTREPORT000001"
          ? null
          : candidateReport({
              code: reportCode,
              fightId,
              encounterId: FIXTURE_ENCOUNTER_ID,
              difficulty: FIXTURE_DIFFICULTY,
            });
      },
    };
    const { analysis } = await run(requestOf({ externalReferences: ENABLED }), { ports, counters });
    const document = projectEncounterContextResult(analysis);
    const section = document.externalReferences;
    if (section.status !== "COMPLETED") throw new Error("expected COMPLETED");
    expect(section.qualified).toHaveLength(1);
    expect(section.failures).toHaveLength(1);
    expect(section.failures[0]?.reason).toBe("REPORT_NOT_ACCESSIBLE");
  });
});

describe("cost is calculable before execution", () => {
  it("reports zero external requests when disabled", () => {
    const plan = planEncounterContextCost(requestOf());
    expect(plan.externalReferencesEnabled).toBe(false);
    expect(plan.maxExternalRequests).toBe(0);
    expect(plan.maxTemporalContextRequests).toBe(0);
    expect(plan.subjectFightCount).toBe(FIXTURE_FIGHT_IDS.length);
  });

  it("reports six as the external ceiling when enabled", () => {
    const plan = planEncounterContextCost(
      requestOf({
        externalReferences: {
          mode: "ENABLED",
          subjectFightId: FIXTURE_FIGHT_IDS[0] as number,
          className: "Rogue",
          specName: "Assassination",
          metric: "dps",
          partition: { mode: "PINNED", partition: 1 },
        },
      }),
    );
    expect(plan.externalReferencesEnabled).toBe(true);
    // One ranking page plus at most five metadata lookups.
    expect(plan.maxExternalRequests).toBe(6);
  });
});
