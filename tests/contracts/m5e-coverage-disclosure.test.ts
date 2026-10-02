/**
 * The coverage disclosure, and the ways a coverage number becomes a lie.
 *
 * There are three, and each has an assertion here:
 *
 *   1. the parts stop summing to the denominator
 *   2. the denominator is quietly something other than what it claims
 *   3. the ratio gets read as a correctness rate
 *
 * The third is the one that cannot be fixed by arithmetic, so the shape of the
 * type does the work: there is no percentage field, and no field whose name
 * could be printed as "percent correct".
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  analyzeObservedAssassinationDecisions,
  summarize,
} from "../../src/specs/rogue/assassination/observed-analysis.js";
import { M5D2_ACTOR, M5D2_TARGET, m5d2State } from "../support/m5d2-fixture.js";
import { ASSASSINATION_ACTOR_B, m5aState } from "../support/m5a-fixture.js";
import { executionLaneForAbility } from "../../src/data/game/ability-gcd-semantics.js";

const SUPPORTED_SPEC = "rogue/assassination";

const analysis = analyzeObservedAssassinationDecisions({
  state: m5d2State(),
  actorId: M5D2_ACTOR,
  specId: SUPPORTED_SPEC,
  targetActorId: M5D2_TARGET,
});
if (analysis.status !== "ANALYZED") throw new Error(`expected ANALYZED, got ${analysis.status}`);
const coverage = analysis.coverage;

describe("the coverage invariant", () => {
  it("partitions the eligible decisions exactly", () => {
    expect(coverage.match + coverage.rejected + coverage.unknown).toBe(coverage.eligibleDecisions);
  });

  it("counts one comparison per eligible decision", () => {
    expect(analysis.comparisons).toHaveLength(coverage.eligibleDecisions);
  });

  it("makes the resolved numerator exactly MATCH + REJECTED", () => {
    expect(coverage.resolvedComparisons).toBe(coverage.match + coverage.rejected);
  });

  it("splits MATCHes into exact-entry and token-converged without overlap", () => {
    expect(coverage.exactEntryMatches + coverage.tokenConvergedMatches).toBe(coverage.match);
  });

  it("pins the measured disclosure for this real actor", () => {
    // Committed so a change has to be argued for. Eleven eligible decisions,
    // one resolved. That is the honest state of M5, not a target.
    expect({
      eligible: coverage.eligibleDecisions,
      match: coverage.match,
      rejected: coverage.rejected,
      unknown: coverage.unknown,
      exact: coverage.exactEntryMatches,
      converged: coverage.tokenConvergedMatches,
    }).toStrictEqual({ eligible: 11, match: 1, rejected: 0, unknown: 10, exact: 1, converged: 0 });
  });
});

describe("the denominator is what it says it is", () => {
  it("contains only observed rotational-GCD casts by the analysed actor", () => {
    for (const c of analysis.comparisons) {
      expect(c.decision.actorId).toBe(M5D2_ACTOR);
      expect(`${String(c.decision.abilityGameId)}=${executionLaneForAbility(c.decision.abilityGameId)}`).toBe(
        `${String(c.decision.abilityGameId)}=GCD_CONSUMING`,
      );
    }
  });

  it("excludes proven off-GCD casts instead of counting them UNKNOWN", () => {
    // Vanish is off-GCD. It occupies no rotational slot, so it is not an
    // unresolved rotational decision — it is not a rotational decision at all.
    const nonGcd = analysis.excluded.filter((e) => e.reason === "NON_GCD_ACTION");
    expect(nonGcd.length).toBeGreaterThan(0);
    expect(nonGcd.map((e) => e.abilityGameId)).toContain(1_856);
    for (const e of nonGcd)
      expect(analysis.comparisons.some((c) => c.decision.position === e.position)).toBe(false);
  });

  it("excludes casts whose execution lane is not established, and discloses them", () => {
    // Where M5's deferred debt lands: builders and melee autos. Excluded, but
    // never silently — the count and every ability id are in the result.
    const unestablished = analysis.excluded.filter((e) => e.reason === "EXECUTION_LANE_NOT_ESTABLISHED");
    expect(unestablished.length).toBeGreaterThan(0);
    const ids = new Set(unestablished.map((e) => e.abilityGameId));
    // Fan of Knives and both Mutilate ids are the named deferrals.
    expect(ids.has(51_723)).toBe(true);
    expect(ids.has(1_329)).toBe(true);
    expect(ids.has(27_576)).toBe(true);
  });

  it("accounts for every excluded cast in the exclusion tally", () => {
    const tallied = coverage.exclusions.reduce((sum, row) => sum + row.count, 0);
    expect(tallied).toBe(analysis.excluded.length);
    expect(coverage.excludedCastCount).toBe(analysis.excluded.length);
  });

  it("never mixes excluded casts into the eligible denominator", () => {
    expect(coverage.eligibleDecisions + coverage.excludedCastCount).toBeGreaterThan(
      coverage.eligibleDecisions,
    );
    const eligiblePositions = new Set(analysis.comparisons.map((c) => c.decision.position));
    for (const e of analysis.excluded) expect(eligiblePositions.has(e.position)).toBe(false);
  });
});

describe("unknown reasons are aggregated, not flattened", () => {
  it("attributes every UNKNOWN comparison to a basis", () => {
    const tallied = coverage.unknownBases.reduce((sum, row) => sum + row.count, 0);
    expect(tallied).toBe(coverage.unknown);
  });

  it("the aggregation keeps distinct blocker families apart rather than one bucket", () => {
    // Reducing every unknown to "UNKNOWN" would tell a reader nothing about
    // which gaps can ever close. The real corpus has carried a single family
    // since M11-D3-0, so this invariant is proven on the production `summarize`
    // with the smallest input that has two: three of this actor's real UNKNOWN
    // comparisons, two left as OBSERVED_STATE_MISSING and one re-labelled
    // DIVERGENT_WORLDS. Only the blocker class is varied; nothing is analyzed.
    const unknowns = analysis.comparisons.filter((comparison) => comparison.outcome === "UNKNOWN");
    expect(unknowns.length).toBeGreaterThanOrEqual(3);
    const [first, second, third] = unknowns;
    if (first === undefined || second === undefined || third === undefined) return;
    const families = [
      { ...first, decisiveBlocker: "OBSERVED_STATE_MISSING" as const },
      { ...second, decisiveBlocker: "DIVERGENT_WORLDS" as const },
      { ...third, decisiveBlocker: "OBSERVED_STATE_MISSING" as const },
    ];
    const aggregated = summarize(M5D2_ACTOR, families, []);
    // Each family separately, with its own count, in the declared class order
    // — DIVERGENT_WORLDS listed second even though it appeared first in input
    // order — and never folded into a generic UNKNOWN row.
    expect(aggregated.unknownBlockerClasses).toStrictEqual([
      { key: "OBSERVED_STATE_MISSING", count: 2 },
      { key: "DIVERGENT_WORLDS", count: 1 },
    ]);
    expect(aggregated.unknown).toBe(3);
    expect(aggregated.unknownBlockerClasses.map((row) => row.key)).not.toContain("UNKNOWN");
    const reordered = summarize(M5D2_ACTOR, [families[1]!, families[0]!, families[2]!], []);
    expect(reordered.unknownBlockerClasses).toStrictEqual(aggregated.unknownBlockerClasses);
    // On the real corpus every unknown is still attributed to a family.
    expect(coverage.unknownBlockerClasses.reduce((sum, row) => sum + row.count, 0)).toBe(coverage.unknown);
  });

  it("pins the measured unknown census", () => {
    // M11-D3-0: was OBSERVED_STATE_MISSING 6 / DIVERGENT_WORLDS 4. The four
    // divergent Envenoms diverged only on stale PRE_COST Energy reused after a
    // hypothetical Thistle Tea (PLAYER_ENERGY); the post-Tea rescan now fails
    // closed on the unobserved Energy.
    expect(coverage.unknownBlockerClasses).toStrictEqual([{ key: "OBSERVED_STATE_MISSING", count: 10 }]);
  });
});

describe("selection precision is disclosed separately from comparison outcome", () => {
  it("reports authority precision over all eligible decisions", () => {
    // A decision can resolve exactly and still be REJECTED, so these are not
    // the same axis and are never collapsed into one.
    const tallied = coverage.selectionPrecision.reduce((sum, row) => sum + row.count, 0);
    expect(tallied).toBe(coverage.eligibleDecisions);
    expect(coverage.selectionPrecision).toStrictEqual([
      { key: "EXACT_ENTRY", count: 1 },
      { key: "UNKNOWN", count: 10 },
    ]);
  });

  it("holds the two axes apart on the rejected fixture as well", () => {
    // The real low-CP Envenom: REJECTED by M5-A while the authority SELECTION
    // stayed UNKNOWN. Collapsing the axes would lose exactly this.
    const rejected = analyzeObservedAssassinationDecisions({
      state: m5aState(),
      actorId: ASSASSINATION_ACTOR_B,
      specId: SUPPORTED_SPEC,
      targetActorId: null,
    });
    if (rejected.status !== "ANALYZED") throw new Error("expected ANALYZED");
    expect(rejected.coverage.rejected).toBe(1);
    expect(rejected.coverage.resolvedComparisons).toBe(1);
    expect(rejected.coverage.selectionPrecision).toStrictEqual([{ key: "UNKNOWN", count: 1 }]);
    expect(rejected.coverage.exactEntryMatches).toBe(0);
  });
});

describe("no correctness score is expressible", () => {
  it("exposes no percentage or rate field at all", () => {
    // Numerator and denominator only. A caller that wants a ratio has to build
    // it, which makes it hard to print one accidentally.
    for (const key of Object.keys(coverage)) {
      for (const banned of ["percent", "Percent", "pct", "rate", "Rate", "score", "Score", "accuracy"]) {
        expect(`${key} contains ${banned}: ${String(key.includes(banned))}`).toBe(
          `${key} contains ${banned}: false`,
        );
      }
    }
  });

  it("names no coverage field in correctness or coaching vocabulary", () => {
    const source = readFileSync("src/specs/rogue/assassination/observed-analysis.ts", "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    for (const banned of ["correct", "optimal", "mistake", "severity", "shouldHave", "parseQuality"]) {
      expect(`${banned}:${code.toLowerCase().includes(banned.toLowerCase()) ? "present" : "absent"}`).toBe(
        `${banned}:absent`,
      );
    }
  });
});
