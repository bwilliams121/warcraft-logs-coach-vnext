/**
 * M6-B — the application composition, proved end to end without a runtime.
 *
 * WHAT THIS FILE EXISTS TO DEMONSTRATE
 *
 * That M2 -> M3 -> M4 -> M5 runs as one path in the application layer, and that
 * the path is genuinely transport-neutral. The second half is what the FILE
 * LOCATION proves rather than any assertion: this runs in the `node` project,
 * with no Workers runtime, no `Request`, no MCP, no network and no credentials.
 * If the composition had acquired a transport dependency, it could not execute
 * here at all.
 *
 * THE GAMEPLAY NUMBERS ARE NOT THIS FILE'S TO SET
 *
 * The coverage figures asserted below are M5's, already pinned against real
 * Warcraft Logs evidence in `tests/contracts/m5e-coverage-disclosure.test.ts`.
 * Re-asserting them HERE proves something different: that routing the same
 * fixture through identity resolution, registry dispatch, scope derivation,
 * ingestion and state construction changes none of them. A composition that
 * quietly altered a gameplay result would show up as a different number.
 */

import { describe, expect, it, vi } from "vitest";

import { analyzeFight, type AnalysisServiceDeps } from "../../src/services/analysis-service.js";
import {
  ENABLED_ANALYZERS,
  analyzerForSpec,
  type RegisteredAnalyzer,
} from "../../src/services/analyzer-registry.js";
import { deriveIngestionScope } from "../../src/services/ingestion-scope.js";
import type { CombatIngestionPort } from "../../src/services/ingestion-port.js";
import type { Env } from "../../src/config/env.js";
import type { FightIdentity, PreflightPort } from "../../src/wcl/types.js";
import { M5D2_ACTOR, m5d2Fight } from "../support/m5d2-fixture.js";

const ENV: Env = {
  ENVIRONMENT: "test",
  WCL_CLIENT_ID: "fake-client-id-not-real",
  WCL_CLIENT_SECRET: "fake-client-secret-not-real",
};

/**
 * The fight the ingestion stub returns, read once.
 *
 * Its EVENTS are the real sanitized M5-D2 slice; its report/fight envelope is
 * the synthetic harness's. Identity below is built from THIS object rather than
 * from `M5D2_FIXTURE_PROVENANCE`, because the two disagree — the harness stamps
 * its own report code and revision — and the service checks that the fight it
 * ingested is the same version of the report identity was established against.
 *
 * Deriving identity from the fixture constants instead would fail that check,
 * which is the check doing its job rather than a reason to relax it.
 */
const FIXTURE_FIGHT = m5d2Fight();

const REQUEST = {
  reportCode: FIXTURE_FIGHT.report.code,
  fightId: FIXTURE_FIGHT.fight.id,
  sourceId: M5D2_ACTOR,
};

/** A preflight resolving to the fixture's own actor, report revision and fight. */
function identityFor(className: string, specName: string): FightIdentity {
  return {
    report: {
      code: FIXTURE_FIGHT.report.code,
      revision: FIXTURE_FIGHT.report.revision,
      startTime: FIXTURE_FIGHT.report.startTimeUnixMs,
      endTime: FIXTURE_FIGHT.report.endTimeUnixMs,
    },
    data: FIXTURE_FIGHT.data,
    fight: {
      id: FIXTURE_FIGHT.fight.id,
      name: FIXTURE_FIGHT.fight.name,
      encounterId: FIXTURE_FIGHT.fight.encounterId,
      difficulty: FIXTURE_FIGHT.fight.difficulty,
      startTime: FIXTURE_FIGHT.fight.startTimeMs,
      endTime: FIXTURE_FIGHT.fight.endTimeMs,
    },
    player: { sourceId: M5D2_ACTOR, name: "Fixtureplayer", className, specName },
  };
}

function preflightFor(className: string, specName: string): PreflightPort {
  return async () => ({ ok: true, identity: identityFor(className, specName), rateLimit: undefined });
}

/** Returns the trusted M5-D2 fixture as though M3 had just retrieved it. */
const FIXTURE_INGEST: CombatIngestionPort = async () => ({
  ok: true,
  fight: m5d2Fight(),
  rateLimit: undefined,
});

function deps(overrides: Partial<AnalysisServiceDeps> = {}): AnalysisServiceDeps {
  return {
    env: ENV,
    preflight: overrides.preflight ?? preflightFor("Rogue", "Assassination"),
    ingest: "ingest" in overrides ? overrides.ingest : FIXTURE_INGEST,
    ...(overrides.registry === undefined ? {} : { registry: overrides.registry }),
    ...(overrides.env === undefined ? {} : { env: overrides.env }),
  };
}

describe("the composed path analyses the fixture", () => {
  it("returns a successful ANALYZED result", async () => {
    const result = await analyzeFight(REQUEST, deps());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.analysis.status).toBe("ANALYZED");
  });

  it("reproduces M5's pinned coverage through application composition", async () => {
    // The same numbers `m5e-coverage-disclosure.test.ts` commits, reached the
    // long way. Composition must be transparent to gameplay truth.
    const result = await analyzeFight(REQUEST, deps());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const analysis = result.analysis.analysis;
    if (analysis.status !== "ANALYZED") throw new Error(`expected ANALYZED, got ${analysis.status}`);

    expect({
      eligible: analysis.coverage.eligibleDecisions,
      match: analysis.coverage.match,
      rejected: analysis.coverage.rejected,
      unknown: analysis.coverage.unknown,
      exact: analysis.coverage.exactEntryMatches,
      converged: analysis.coverage.tokenConvergedMatches,
    }).toStrictEqual({ eligible: 11, match: 1, rejected: 0, unknown: 10, exact: 1, converged: 0 });
  });

  it("keeps a mostly-UNKNOWN analysis a successful result", async () => {
    // Ten of eleven decisions do not resolve. That is the analyzer working, and
    // the service must not translate honest uncertainty into a failure — which
    // would make refusing to guess look like a malfunction.
    const result = await analyzeFight(REQUEST, deps());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const analysis = result.analysis.analysis;
    if (analysis.status !== "ANALYZED") return;
    expect(analysis.coverage.unknown).toBeGreaterThan(analysis.coverage.resolvedComparisons);
    expect(result.state).toBe("PARTIAL");
  });

  it("never reports a narrow analysis as COMPLETE", async () => {
    // The disclosure rule: a reader must be able to tell "we found little to
    // fix" from "we could only look at part of this".
    const result = await analyzeFight(REQUEST, deps());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state).not.toBe("COMPLETE");
  });

  it("carries the resolved identity, analyzer and scope alongside the analysis", async () => {
    const result = await analyzeFight(REQUEST, deps());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.specId).toBe("rogue/assassination");
    expect(result.analysis.analyzerId).toBe("rogue-assassination-observed-decisions");
    expect(result.analysis.scope).toBe("PLAYER_CONTEXT");
    expect(result.analysis.identity.player.sourceId).toBe(M5D2_ACTOR);
  });

  it("produces no coaching-shaped field even on a successful analysis", async () => {
    // The pre-M6-B version of this guard only ever saw a refusal. Now that a
    // real analysis can be returned, the guard has to run against one.
    const result = await analyzeFight(REQUEST, deps());
    const serialized = JSON.stringify(result);

    for (const banned of ["tldr", "coaching", "score", "severity", "recommend", "optimal", "mistake"]) {
      expect(serialized.toLowerCase(), `result must not carry "${banned}"`).not.toContain(
        banned.toLowerCase(),
      );
    }
  });
});

describe("the analyzer is invoked exactly once, through its facade", () => {
  it("calls the registered analyze function one time", async () => {
    const real = analyzerForSpec("rogue/assassination");
    if (real === null) throw new Error("the Assassination analyzer is not registered");
    const analyze = vi.fn(real.analyze);
    const spied: RegisteredAnalyzer = { ...real, analyze };

    await analyzeFight(REQUEST, deps({ registry: [spied] }));

    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it("hands the analyzer the resolved spec, the player's actor and no forced target", async () => {
    const real = analyzerForSpec("rogue/assassination");
    if (real === null) throw new Error("the Assassination analyzer is not registered");
    const analyze = vi.fn(real.analyze);

    await analyzeFight(REQUEST, deps({ registry: [{ ...real, analyze }] }));

    const input = analyze.mock.calls[0]?.[0];
    expect(input?.specId).toBe("rogue/assassination");
    expect(input?.actorId).toBe(M5D2_ACTOR);
    // Null on purpose: each decision's target is a fact of the cast it is about,
    // and a fight-level choice here would overwrite that with a guess.
    expect(input?.targetActorId).toBeNull();
  });
});

describe("ingestion is requested from the analyzer's declared requirement", () => {
  it("derives PLAYER_CONTEXT from the Assassination registration", () => {
    const analyzer = analyzerForSpec("rogue/assassination");
    if (analyzer === null) throw new Error("the Assassination analyzer is not registered");
    const derivation = deriveIngestionScope([analyzer.requirement]);

    expect(derivation.ok).toBe(true);
    if (!derivation.ok) return;
    expect(derivation.scope).toBe("PLAYER_CONTEXT");
    expect(derivation.contributingAnalyzers).toEqual(["rogue-assassination-observed-decisions"]);
  });

  it("keeps the enabled set as build capability metadata", () => {
    // A different question from "what should THIS request retrieve". It
    // describes what the deployment supports, and the service is deliberately
    // not given it.
    expect(ENABLED_ANALYZERS.map((analyzer) => analyzer.requirement)).toEqual([
      {
        analyzerId: "rogue-assassination-observed-decisions",
        requiredScope: "PLAYER_CONTEXT",
        includeResources: true,
      },
    ]);
  });

  it("does not retrieve raid-wide evidence the analyzer cannot read", async () => {
    // FULL_RAID would spend Warcraft Logs points on ally state this analyzer
    // never consults.
    const ingest = vi.fn(FIXTURE_INGEST);
    await analyzeFight(REQUEST, deps({ ingest }));

    expect(ingest.mock.calls[0]?.[0].scope).toBe("PLAYER_CONTEXT");
  });

  it("builds the ingestion request from the canonical request, unaltered", async () => {
    const ingest = vi.fn(FIXTURE_INGEST);
    await analyzeFight(REQUEST, deps({ ingest }));
    const request = ingest.mock.calls[0]?.[0];

    expect(request?.reportCode).toBe(REQUEST.reportCode);
    expect(request?.fightId).toBe(REQUEST.fightId);
    expect(request?.sourceId).toBe(REQUEST.sourceId);
    // Copied from the registration, not decided here.
    expect(request?.includeResources).toBe(true);
  });

  it("adds no actor or hostility filter and no page limit", async () => {
    // M3 owns retrieval shape. The service must not narrow it: an actor filter
    // would drop the enemy and encounter evidence actionability depends on.
    const ingest = vi.fn(FIXTURE_INGEST);
    await analyzeFight(REQUEST, deps({ ingest }));
    const request = ingest.mock.calls[0]?.[0];

    expect(request?.hostility).toBeUndefined();
    expect(request?.limit).toBeUndefined();
  });

  it("passes the configured credentials to the port rather than holding transport", async () => {
    const ingest = vi.fn(FIXTURE_INGEST);
    await analyzeFight(REQUEST, deps({ ingest }));

    expect(ingest.mock.calls[0]?.[1]).toBeDefined();
    // Redacted on serialization, so a logged or echoed config cannot leak them.
    expect(JSON.stringify(ingest.mock.calls[0]?.[1])).not.toContain("fake-client-secret-not-real");
  });
});
