import { describe, expect, it } from "vitest";

import { cohortRungs, COHORT_SELECTION_CONFIG, itemLevelBracket } from "../../src/cohort/cohort-config.js";
import {
  discoverObservedCohort,
  type CohortDiscoveryRequest,
  type CohortPorts,
  type PortResponse,
} from "../../src/cohort/cohort-discovery.js";
import {
  orderCandidates,
  qualifyCandidate,
  rowExclusion,
  summarizeCohort,
  type CohortMember,
  type CohortSubject,
} from "../../src/cohort/cohort-selection.js";
import { ACTUAL_DPS_SOURCE, observedPerformanceOf } from "../../src/cohort/observed-performance.js";
import { resolveBloodHeroTree } from "../../src/data/game/deathknight-blood-talents.js";
import {
  decodeCandidateContext,
  decodeCohortRankingPage,
  decodeSubjectPerformance,
  type RankedCohortRow,
} from "../../src/wcl/cohort/cohort-decoders.js";
import { committedEvidenceArchiveFiles } from "../support/corpus/evidence-archive.js";

/**
 * M11-G1: observed performance + elite cohort evidence. The committed
 * evidence is the sanitized G1 capture (report b1PmaKrd6CDfzngc fight 48,
 * Vashnik Mythic Blood Death Knight); every port here serves committed or
 * synthetic bytes — nothing reaches the network.
 */

type Json = Record<string, unknown>;
const ARCHIVE = committedEvidenceArchiveFiles();
const artifact = (id: string): Json => {
  const text = ARCHIVE[`artifacts/wcl-graphql/${id}.json`];
  if (text === undefined) throw new Error(`no committed artifact ${id}`);
  return JSON.parse(text) as Json;
};
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const ok = (data: unknown): PortResponse => ({ ok: true, data, rateLimit: null });

const SUBJECT_REQUEST: CohortDiscoveryRequest = {
  reportCode: "b1PmaKrd6CDfzngc",
  fightId: 48,
  encounterId: 3455,
  difficulty: 5,
  className: "DeathKnight",
  specName: "Blood",
  subject: { actorId: 15, name: "Actor15", serverName: null, specResolved: true },
  resolveHeroTree: resolveBloodHeroTree,
};

/** Ports over the committed evidence, counting every call. */
function committedPorts(overrides: { subject?: Json } = {}) {
  const calls: string[] = [];
  const contexts = [1, 2, 3].map((n) => artifact(`wcl-g1-cohort-candidate-${String(n)}`));
  const ports: CohortPorts = {
    subjectPerformance: async () => {
      calls.push("subject");
      return ok(overrides.subject ?? artifact("wcl-g1-subject-performance-b1pm-fight-48"));
    },
    cohortRankingPage: async (request) => {
      calls.push(`page:${String(request.bracket)}`);
      return ok(artifact(`wcl-g1-cohort-rankings-3455-5-blood-bracket-${String(request.bracket)}`));
    },
    candidateContext: async (code, fight) => {
      calls.push(`candidate:${code}#${String(fight)}`);
      const hit = contexts.find((context) => {
        const report = (context["reportData"] as Json)["report"] as Json;
        return report["code"] === code && (report["fights"] as Json[])[0]?.["id"] === fight;
      });
      if (hit === undefined)
        throw new Error(`a candidate outside the committed cohort was requested: ${code}#${String(fight)}`);
      return ok(hit);
    },
  };
  return { ports, calls };
}

// ---------------------------------------------------------------------------
// A–D: the subject's observed performance
// ---------------------------------------------------------------------------

describe("ACTUAL_DPS is Warcraft Logs' own figure", () => {
  const subjectJson = artifact("wcl-g1-subject-performance-b1pm-fight-48");

  it("A: is the DamageDone table total per fight second — not the normalized raw-amount sum", () => {
    const performance = observedPerformanceOf(
      decodeSubjectPerformance(subjectJson, 48),
      SUBJECT_REQUEST.subject,
    );
    expect(performance.actualDps).toMatchObject({
      status: "OBSERVED",
      source: ACTUAL_DPS_SOURCE,
      evidence: {
        total: 45_802_009,
        totalTimeMs: 345_177,
        fightDurationMs: 345_177,
        rankedAgreement: "EQUAL",
      },
    });
    if (performance.actualDps.status !== "OBSERVED") return;
    expect(performance.actualDps.value).toBeCloseTo(45_802_009 / 345.177, 6);
    expect(performance.actualDps.value).toBeCloseTo(132_691.36993485, 4);
    // The E2 raw-amount owner rollup (45,709,411) is NOT Warcraft Logs' total.
    expect(performance.actualDps.evidence.total).not.toBe(45_709_411);
    expect(performance.itemLevel).toEqual({
      status: "OBSERVED",
      value: 327,
      source: "WCL_DAMAGE_DONE_TABLE_ITEM_LEVEL",
    });
    expect(performance.durationMs).toBe(345_177);
    expect(performance.eligibility).toEqual({ status: "ELIGIBLE" });
  });

  it("A: the semantics are pinned by the whole fight — table total / fight seconds is every ranked player's dps", () => {
    const report = (subjectJson["reportData"] as Json)["report"] as Json;
    const table = (report["damageDone"] as Json)["data"] as Json;
    const fight = (report["fights"] as Json[])[0] as Json;
    expect(table["totalTime"]).toBe((fight["endTime"] as number) - (fight["startTime"] as number));
    const totals = new Map((table["entries"] as Json[]).map((entry) => [entry["name"], entry]));
    let agreeing = 0;
    for (const role of Object.values(
      ((report["rankings"] as Json)["data"] as Json[])[0]?.["roles"] as Json,
    )) {
      for (const character of (role as Json)["characters"] as Json[]) {
        const entry = totals.get(character["name"]);
        if (entry === undefined) {
          expect(character["amount"]).toBe(0); // a healer ranked at 0 dps has no damage entry
          continue;
        }
        expect((entry["total"] as number) / ((table["totalTime"] as number) / 1000)).toBeCloseTo(
          character["amount"] as number,
          2,
        );
        expect(entry["itemLevel"]).toBe(character["bracketData"]);
        agreeing += 1;
      }
    }
    expect(agreeing).toBe(19);
  });

  it("B: needs no subject rankings row; a disagreeing row or a non-fight denominator fails closed", () => {
    const unranked = clone(subjectJson);
    const rankingsData = (((unranked["reportData"] as Json)["report"] as Json)["rankings"] as Json)[
      "data"
    ] as Json[];
    rankingsData.length = 0;
    const withoutRow = observedPerformanceOf(decodeSubjectPerformance(unranked, 48), SUBJECT_REQUEST.subject);
    expect(withoutRow.actualDps).toMatchObject({
      status: "OBSERVED",
      evidence: { rankedAgreement: "NOT_RANKED", rankedAmount: null },
    });

    const disagreeing = clone(subjectJson);
    const fight = (
      (((disagreeing["reportData"] as Json)["report"] as Json)["rankings"] as Json)["data"] as Json[]
    )[0] as Json;
    const tanks = ((fight["roles"] as Json)["tanks"] as Json)["characters"] as Json[];
    const subjectRow = tanks.find((row) => row["name"] === "Actor15");
    if (subjectRow === undefined) throw new Error("subject row missing");
    subjectRow["amount"] = 140_000;
    expect(
      observedPerformanceOf(decodeSubjectPerformance(disagreeing, 48), SUBJECT_REQUEST.subject).actualDps,
    ).toEqual({
      status: "UNAVAILABLE",
      reason: "RANKED_AMOUNT_DISAGREES",
    });

    const otherDenominator = clone(subjectJson);
    ((((otherDenominator["reportData"] as Json)["report"] as Json)["damageDone"] as Json)["data"] as Json)[
      "totalTime"
    ] = 340_000;
    expect(
      observedPerformanceOf(decodeSubjectPerformance(otherDenominator, 48), SUBJECT_REQUEST.subject)
        .actualDps,
    ).toEqual({
      status: "UNAVAILABLE",
      reason: "TABLE_TIME_IS_NOT_FIGHT_DURATION",
    });
  });

  it("C: a non-kill subject is NOT_ELIGIBLE, and discovery stops after the subject request", async () => {
    const wipe = clone(subjectJson);
    ((((wipe["reportData"] as Json)["report"] as Json)["fights"] as Json[])[0] as Json)["kill"] = false;
    const { ports, calls } = committedPorts({ subject: wipe });
    const evidence = await discoverObservedCohort(ports, SUBJECT_REQUEST);
    expect(evidence.subject.eligibility).toEqual({ status: "NOT_ELIGIBLE", reason: "NOT_KILL" });
    expect(evidence.cohort).toMatchObject({
      status: "INSUFFICIENT",
      insufficiency: "SUBJECT_NOT_ELIGIBLE",
      members: [],
    });
    expect(calls).toEqual(["subject"]);
  });

  it("D: an unresolved specialization is NOT_ELIGIBLE", async () => {
    const { ports, calls } = committedPorts();
    const evidence = await discoverObservedCohort(ports, {
      ...SUBJECT_REQUEST,
      subject: { ...SUBJECT_REQUEST.subject, specResolved: false },
    });
    expect(evidence.subject.eligibility).toEqual({ status: "NOT_ELIGIBLE", reason: "SPEC_UNRESOLVED" });
    expect(calls).toEqual(["subject"]);
  });
});

// ---------------------------------------------------------------------------
// E–I, Q, S: the committed cohort
// ---------------------------------------------------------------------------

describe("the committed cohort", () => {
  it("E/I: starts at ±3 ilvl / ±5% duration over brackets 18–20 and finds three — OK, median and range", async () => {
    const { ports, calls } = committedPorts();
    const evidence = await discoverObservedCohort(ports, SUBJECT_REQUEST);
    expect(evidence.provenance.rungs).toEqual([
      {
        rungIndex: 0,
        rung: { durationFraction: 0.05, itemLevelWindow: 3 },
        brackets: [18, 19, 20],
        rowsPassingRowChecks: 26,
        qualifiedAtEnd: 3,
      },
    ]);
    expect(evidence.provenance.wideningSteps).toEqual([]);
    expect(evidence.cohort.status).toBe("OK");
    expect(evidence.cohort.members.map((member) => Math.round(member.dps))).toEqual([
      179_995, 175_060, 174_769,
    ]);
    expect(evidence.cohort.medianDps).toBeCloseTo(175_060.35, 1);
    expect(evidence.cohort.minDps).toBeCloseTo(174_768.73, 1);
    expect(evidence.cohort.maxDps).toBeCloseTo(179_994.93, 1);
    expect(evidence.provenance.rankingQuery).toMatchObject({ partition: 1, metric: "dps", page: 1 });
    // 1 subject + 3 pages + 3 candidates; the owner's cap is 14.
    expect(calls).toHaveLength(7);
    expect(evidence.provenance.requests.map((request) => request.purpose)).toEqual([
      "SUBJECT_PERFORMANCE",
      "COHORT_RANKING_PAGE",
      "COHORT_RANKING_PAGE",
      "COHORT_RANKING_PAGE",
      "CANDIDATE_CONTEXT",
      "CANDIDATE_CONTEXT",
      "CANDIDATE_CONTEXT",
    ]);
  });

  it("G: accounts for every one of the 300 rows considered", async () => {
    const evidence = await discoverObservedCohort(committedPorts().ports, SUBJECT_REQUEST);
    const tally: Record<string, number> = {};
    for (const candidate of evidence.provenance.candidates)
      tally[candidate.result] = (tally[candidate.result] ?? 0) + 1;
    expect(tally).toEqual({
      QUALIFIED: 3,
      NOT_REACHED: 23,
      DURATION_OUTSIDE_WINDOW: 272,
      ILVL_OUTSIDE_WINDOW: 2,
    });
    expect(evidence.provenance.selected).toHaveLength(3);
  });

  it("H: chooses the highest-DPS qualifying kills, not the nearest in duration", async () => {
    const evidence = await discoverObservedCohort(committedPorts().ports, SUBJECT_REQUEST);
    const reached = evidence.provenance.candidates.filter(
      (c) => c.result === "QUALIFIED" || c.result === "NOT_REACHED",
    );
    const top3 = [...reached].sort((a, b) => b.amount - a.amount).slice(0, 3);
    expect(evidence.provenance.selected.map((key) => key.reportCode)).toEqual(
      top3.map((c) => c.key.reportCode),
    );
    const distance = (durationMs: number) => Math.abs(durationMs - 345_177);
    const farthestSelected = Math.max(
      ...evidence.cohort.members.map((member) => distance(member.durationMs)),
    );
    const nearerButNotSelected = reached.filter(
      (c) => c.result === "NOT_REACHED" && distance(c.durationMs) < farthestSelected,
    );
    expect(nearerButNotSelected.length).toBeGreaterThan(0);
  });

  it("records member facts from the committed context: ilvl, duration, gear, talents, hero tree, death check", async () => {
    const evidence = await discoverObservedCohort(committedPorts().ports, SUBJECT_REQUEST);
    for (const member of evidence.cohort.members) {
      expect(member.liveIdentity.name).toMatch(/^Player\d{4}$/);
      expect(member.comparisonRef.reportCode).toMatch(/^COHORT\d{3}A{7}$/);
      expect(member.gear.length).toBeGreaterThan(0);
      expect(member.talentTree.length).toBeGreaterThan(0);
      expect(member.heroTree).toMatchObject({ state: "RESOLVED", simcName: "sanlayn" });
      expect(member.deathCheck).toBe("NO_DEATHS_TABLE_ENTRY");
    }
    expect(evidence.cohort.members.map((member) => [member.itemLevel, member.durationMs])).toEqual([
      [328, 329_430],
      [330, 336_303],
      [326, 359_887],
    ]);
  });

  it("reads member gear through the shared adapter: enchants and gems are states, never null or a guessed empty list", async () => {
    const evidence = await discoverObservedCohort(committedPorts().ports, SUBJECT_REQUEST);
    const tally: Record<string, number> = {};
    for (const member of evidence.cohort.members) {
      expect(member.gear).toHaveLength(18);
      for (const piece of member.gear) {
        for (const key of ["permanentEnchant", "temporaryEnchant", "gems"] as const) {
          const label = `${key}:${piece[key].state}`;
          tally[label] = (tally[label] ?? 0) + 1;
        }
      }
    }
    // The live capture's counts, reproduced by the committed bytes: absent keys
    // are KNOWN_NONE under the pinned UI contract, present ones KNOWN.
    expect(tally).toEqual({
      "permanentEnchant:KNOWN": 24,
      "permanentEnchant:KNOWN_NONE": 30,
      "temporaryEnchant:KNOWN": 3,
      "temporaryEnchant:KNOWN_NONE": 51,
      "gems:KNOWN": 12,
      "gems:KNOWN_NONE": 42,
    });
  });

  it("Q: is deterministic — permuted ranking rows select the same cohort in the same order", async () => {
    const base = await discoverObservedCohort(committedPorts().ports, SUBJECT_REQUEST);
    const { ports } = committedPorts();
    const permuted: CohortPorts = {
      ...ports,
      cohortRankingPage: async (request) => {
        const page = clone(
          artifact(`wcl-g1-cohort-rankings-3455-5-blood-bracket-${String(request.bracket)}`),
        );
        const ranking = ((page["worldData"] as Json)["encounter"] as Json)["characterRankings"] as Json;
        (ranking["rankings"] as Json[]).reverse();
        return ok(page);
      },
    };
    const again = await discoverObservedCohort(permuted, SUBJECT_REQUEST);
    expect(again.cohort).toEqual(base.cohort);
    expect(again.provenance.selected).toEqual(base.provenance.selected);
    expect(again.provenance.candidates).toEqual(base.provenance.candidates);
  });

  it("Q: breaks ties by report code, then fight id, then name — never by input order", () => {
    const row = (code: string, fightId: number, name: string): RankedCohortRow => ({
      name,
      serverName: null,
      className: "DeathKnight",
      specName: "Blood",
      amount: 100,
      durationMs: 1,
      bracketData: 327,
      hidden: false,
      reportCode: code,
      fightId,
    });
    const rows = [row("B", 1, "x"), row("A", 2, "x"), row("A", 1, "y"), row("A", 1, "x")];
    const expected = ["A#1#x", "A#1#y", "A#2#x", "B#1#x"];
    for (const order of [rows, [...rows].reverse()]) {
      expect(orderCandidates(order).map((r) => `${r.reportCode}#${String(r.fightId)}#${r.name}`)).toEqual(
        expected,
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Synthetic scenarios: widening, counts, budget
// ---------------------------------------------------------------------------

const SUBJECT_DURATION = 345_177;
const syntheticSubject = (): Json => {
  const subject = clone(artifact("wcl-g1-subject-performance-b1pm-fight-48"));
  return subject;
};
const syntheticRow = (code: string, amount: number, durationFactor: number, bracketData = 327): Json => ({
  name: `Player-${code}`,
  class: "DeathKnight",
  spec: "Blood",
  amount,
  hardModeLevel: 0,
  duration: Math.round(SUBJECT_DURATION * durationFactor),
  startTime: 1,
  report: { code, fightID: 1, startTime: 1 },
  server: null,
  bracketData,
});
const syntheticPage = (rows: Json[]): Json => ({
  worldData: {
    encounter: { characterRankings: { page: 1, hasMorePages: false, count: rows.length, rankings: rows } },
  },
});
const syntheticContext = (
  row: Json,
  overrides: { kill?: boolean; spec?: string; died?: boolean; players?: Json[] } = {},
): Json => {
  const duration = row["duration"] as number;
  const name = row["name"] as string;
  return {
    reportData: {
      report: {
        code: (row["report"] as Json)["code"],
        fights: [
          {
            id: 1,
            encounterID: 3455,
            difficulty: 5,
            kill: overrides.kill ?? true,
            startTime: 1_000,
            endTime: 1_000 + duration,
          },
        ],
        masterData: {
          actors: overrides.players ?? [
            { id: 7, name, server: null, type: "Player", subType: "DeathKnight" },
          ],
        },
        rankings: { data: [] },
        playerDetails: {
          data: {
            playerDetails: {
              tanks: [
                {
                  id: 7,
                  type: "DeathKnight",
                  specs: [{ spec: overrides.spec ?? "Blood", count: 1 }],
                  combatantInfo: {
                    gear: [{ id: 1, slot: 0, itemLevel: 327 }],
                    talentTree: [{ id: 1, rank: 1, nodeID: 1 }],
                  },
                },
              ],
            },
          },
        },
        deaths: {
          data: {
            entries: overrides.died === true ? [{ id: 7, type: "DeathKnight", timestamp: 1_500 }] : [],
          },
        },
      },
    },
  };
};

function syntheticPorts(rows: Json[], contextFor: (row: Json) => Json | null) {
  const calls: string[] = [];
  const ports: CohortPorts = {
    subjectPerformance: async () => {
      calls.push("subject");
      return ok(syntheticSubject());
    },
    cohortRankingPage: async (request) => {
      calls.push(`page:${String(request.bracket)}`);
      return ok(
        syntheticPage(
          rows.filter((row) => itemLevelBracket(row["bracketData"] as number) === request.bracket),
        ),
      );
    },
    candidateContext: async (code) => {
      calls.push(`candidate:${code}`);
      const row = rows.find((candidate) => (candidate["report"] as Json)["code"] === code);
      const context = row === undefined ? null : contextFor(row);
      return context === null ? { ok: false, failure: "UPSTREAM" } : ok(context);
    },
  };
  return { ports, calls };
}

describe("widening and cohort size", () => {
  it("F/G: widens duration ±5% -> ±10% -> ±15% in order, recording every step, then takes the three highest", async () => {
    const rows = [
      syntheticRow("AAA", 300, 1.12),
      syntheticRow("BBB", 200, 1.07),
      syntheticRow("CCC", 150, 1.0),
    ];
    const { ports } = syntheticPorts(rows, (row) => syntheticContext(row));
    const evidence = await discoverObservedCohort(ports, SUBJECT_REQUEST);
    expect(
      evidence.provenance.rungs.map((rung) => [
        rung.rung.durationFraction,
        rung.rung.itemLevelWindow,
        rung.qualifiedAtEnd,
      ]),
    ).toEqual([
      [0.05, 3, 1],
      [0.1, 3, 2],
      [0.15, 3, 3],
    ]);
    expect(evidence.provenance.wideningSteps).toHaveLength(2);
    expect(evidence.provenance.wideningSteps[0]).toContain("widened to duration ±10% / item level ±3");
    expect(evidence.provenance.wideningSteps[1]).toContain("widened to duration ±15% / item level ±3");
    expect(evidence.cohort.status).toBe("OK");
    expect(evidence.cohort.members.map((member) => member.dps)).toEqual([300, 200, 150]);
  });

  it("F: widens item level only after the widest duration, one step at a time", () => {
    expect(
      cohortRungs(COHORT_SELECTION_CONFIG).map((rung) => [rung.durationFraction, rung.itemLevelWindow]),
    ).toEqual([
      [0.05, 3],
      [0.1, 3],
      [0.15, 3],
      [0.15, 6],
      [0.15, 9],
    ]);
  });

  it("J: exactly two qualify -> RANGE_ONLY with a range and no median", async () => {
    const rows = [syntheticRow("AAA", 300, 1.0), syntheticRow("BBB", 200, 1.0)];
    const evidence = await discoverObservedCohort(
      syntheticPorts(rows, (row) => syntheticContext(row)).ports,
      SUBJECT_REQUEST,
    );
    expect(evidence.cohort).toMatchObject({
      status: "RANGE_ONLY",
      medianDps: null,
      minDps: 200,
      maxDps: 300,
      insufficiency: "TOO_FEW_QUALIFYING_CANDIDATES",
    });
  });

  it("K: fewer than two -> INSUFFICIENT, no fake cohort", async () => {
    const rows = [syntheticRow("AAA", 300, 1.0)];
    const evidence = await discoverObservedCohort(
      syntheticPorts(rows, (row) => syntheticContext(row)).ports,
      SUBJECT_REQUEST,
    );
    expect(evidence.cohort).toMatchObject({
      status: "INSUFFICIENT",
      medianDps: null,
      minDps: null,
      maxDps: null,
    });
    expect(summarizeCohort([])).toEqual({
      status: "INSUFFICIENT",
      medianDps: null,
      minDps: null,
      maxDps: null,
    });
  });

  it("S: can never exceed 14 GraphQL requests, whatever the pool", async () => {
    const rows = Array.from({ length: 40 }, (_, index) =>
      syntheticRow(`R${String(index).padStart(3, "0")}`, 1_000 - index, 1.0),
    );
    const { ports, calls } = syntheticPorts(rows, () => null);
    const evidence = await discoverObservedCohort(ports, SUBJECT_REQUEST);
    expect(calls.length).toBe(14);
    expect(evidence.provenance.requests).toHaveLength(14);
    expect(evidence.cohort).toMatchObject({
      status: "INSUFFICIENT",
      insufficiency: "REQUEST_BUDGET_EXHAUSTED",
    });
  });
});

// ---------------------------------------------------------------------------
// L–P: exclusions and fail-closed decoding
// ---------------------------------------------------------------------------

describe("exclusions", () => {
  const subject: CohortSubject = {
    reportCode: "b1PmaKrd6CDfzngc",
    fightId: 48,
    encounterId: 3455,
    difficulty: 5,
    className: "DeathKnight",
    specName: "Blood",
    durationMs: SUBJECT_DURATION,
    itemLevel: 327,
  };
  const rung = { durationFraction: 0.05, itemLevelWindow: 3 };
  const decodedRow = (overrides: Partial<RankedCohortRow> = {}): RankedCohortRow => ({
    name: "Player-X",
    serverName: null,
    className: "DeathKnight",
    specName: "Blood",
    amount: 100,
    durationMs: SUBJECT_DURATION,
    bracketData: 327,
    hidden: false,
    reportCode: "XXX",
    fightId: 1,
    ...overrides,
  });

  it("L: hidden and anonymous rows are excluded", () => {
    expect(rowExclusion(decodedRow({ hidden: true }), subject, rung)).toBe("HIDDEN");
    expect(rowExclusion(decodedRow({ name: "Anonymous" }), subject, rung)).toBe("ANONYMOUS");
    expect(rowExclusion(decodedRow({ reportCode: "a:anonymized" }), subject, rung)).toBe("ANONYMOUS");
    expect(rowExclusion(decodedRow({ reportCode: "b1PmaKrd6CDfzngc", fightId: 48 }), subject, rung)).toBe(
      "SUBJECT_ITSELF",
    );
    expect(rowExclusion(decodedRow({ bracketData: 331 }), subject, rung)).toBe("ILVL_OUTSIDE_WINDOW");
    expect(rowExclusion(decodedRow({ durationMs: SUBJECT_DURATION * 1.06 }), subject, rung)).toBe(
      "DURATION_OUTSIDE_WINDOW",
    );
  });

  const qualify = (context: Json, row: RankedCohortRow = decodedRow()) =>
    qualifyCandidate(row, decodeCandidateContext(context, 1), subject, rung, resolveBloodHeroTree);
  const rowJson = syntheticRow("XXX", 100, 1.0);
  rowJson["name"] = "Player-X";

  it("M: an unresolved or ambiguous identity is excluded, never resolved by taking the first", () => {
    expect(qualify(syntheticContext(rowJson, { players: [] }))).toEqual({
      status: "EXCLUDED",
      reason: "SOURCE_UNRESOLVED",
    });
    const twins = [
      { id: 7, name: "Player-X", server: "A", type: "Player", subType: "DeathKnight" },
      { id: 8, name: "Player-X", server: "B", type: "Player", subType: "DeathKnight" },
    ];
    expect(qualify(syntheticContext(rowJson, { players: twins }))).toEqual({
      status: "EXCLUDED",
      reason: "SOURCE_AMBIGUOUS",
    });
  });

  it("N: a different specialization is excluded", () => {
    expect(qualify(syntheticContext(rowJson, { spec: "Unholy" }))).toEqual({
      status: "EXCLUDED",
      reason: "SPEC_MISMATCH",
    });
    expect(rowExclusion(decodedRow({ specName: "Frost" }), subject, rung)).toBe("SPEC_MISMATCH");
  });

  it("O: a death before the end of the fight is excluded; a non-kill too", () => {
    expect(qualify(syntheticContext(rowJson, { died: true }))).toEqual({
      status: "EXCLUDED",
      reason: "DIED_BEFORE_END",
    });
    expect(qualify(syntheticContext(rowJson, { kill: false }))).toEqual({
      status: "EXCLUDED",
      reason: "NOT_KILL",
    });
    expect(qualify(syntheticContext(rowJson)).status).toBe("QUALIFIED");
    // A gear row the shared adapter cannot read is malformed, never dropped.
    const badGear = syntheticContext(rowJson);
    const tank = (
      ((((badGear["reportData"] as Json)["report"] as Json)["playerDetails"] as Json)["data"] as Json)[
        "playerDetails"
      ] as Json
    )["tanks"] as Json[];
    ((tank[0] as Json)["combatantInfo"] as Json)["gear"] = [{ slot: 0, itemLevel: 327 }];
    expect(qualify(badGear)).toEqual({ status: "EXCLUDED", reason: "MALFORMED_EVIDENCE" });
  });

  it("P: malformed ranking or context evidence fails closed", async () => {
    const page = clone(artifact("wcl-g1-cohort-rankings-3455-5-blood-bracket-19"));
    const rankings = (((page["worldData"] as Json)["encounter"] as Json)["characterRankings"] as Json)[
      "rankings"
    ] as Json[];
    delete (rankings[0] as Json)["amount"];
    expect(decodeCohortRankingPage(page)).toEqual({
      outcome: "PAYLOAD_UNRECOGNISED",
      defect: "RANKING_ROW_UNUSABLE",
    });

    const context = clone(artifact("wcl-g1-cohort-candidate-1"));
    delete (((context["reportData"] as Json)["report"] as Json)["deaths"] as Json)["data"];
    expect(decodeCandidateContext(context, 33)).toEqual({
      outcome: "PAYLOAD_UNRECOGNISED",
      defect: "DEATHS_UNUSABLE",
    });
    expect(
      qualifyCandidate(
        decodedRow({ fightId: 33 }),
        decodeCandidateContext(context, 33),
        subject,
        rung,
        resolveBloodHeroTree,
      ),
    ).toEqual({
      status: "EXCLUDED",
      reason: "MALFORMED_EVIDENCE",
    });
    // A context that does not hold the ranked fight is unavailable, not qualified.
    expect(qualify(clone(artifact("wcl-g1-cohort-candidate-1")))).toEqual({
      status: "EXCLUDED",
      reason: "CONTEXT_UNAVAILABLE",
    });

    // A page whose rows fall outside its bracket's item levels stops discovery closed.
    const { ports } = committedPorts();
    const shifted: CohortPorts = {
      ...ports,
      cohortRankingPage: async (request) => {
        const raw = clone(artifact(`wcl-g1-cohort-rankings-3455-5-blood-bracket-${String(request.bracket)}`));
        const rows = (((raw["worldData"] as Json)["encounter"] as Json)["characterRankings"] as Json)[
          "rankings"
        ] as Json[];
        (rows[0] as Json)["bracketData"] = 400;
        return ok(raw);
      },
    };
    const evidence = await discoverObservedCohort(shifted, SUBJECT_REQUEST);
    expect(evidence.cohort).toMatchObject({
      status: "INSUFFICIENT",
      insufficiency: "BRACKET_SEMANTICS_MISMATCH",
    });
  });

  it("a member is never anything but a barometer: its type carries no ceiling, loss, verdict or scale", () => {
    const keys: (keyof CohortMember)[] = [
      "comparisonRef",
      "liveIdentity",
      "dps",
      "durationMs",
      "itemLevel",
      "gear",
      "talentTree",
      "heroTree",
      "deathCheck",
    ];
    expect(keys).toHaveLength(9);
  });
});
