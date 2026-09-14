/**
 * The public projection, driven through the real composed path.
 *
 * WHY THE REAL PATH AND NOT A HAND-BUILT INPUT
 *
 * A projection test that constructs its own `FightAnalysis` proves the mapper
 * compiles. It does not prove the mapper describes what the engine actually
 * produces. So the ANALYZED cases below run the M6-B service over the M5-D2
 * fixture and project THAT — which means the pinned coverage numbers travel the
 * whole way from real Warcraft Logs evidence to the wire.
 *
 * The analyzer-internal statuses (`AUTHORITY_NOT_AVAILABLE`,
 * `PROFILE_NOT_RESOLVED`) come from the real facade too. Only
 * `INSUFFICIENT_EVIDENCE` is constructed, because reaching it requires the
 * version-scoped resource wire contracts to be unavailable — a condition this
 * build cannot produce on demand without breaking something real.
 *
 * NOTHING HERE EVALUATES GAMEPLAY. The numbers are M5's, already pinned in
 * `m5e-coverage-disclosure.test.ts`. Re-asserting them here proves only that
 * projection is transparent to them.
 */

import { describe, expect, it } from "vitest";

import {
  PUBLIC_ANALYSIS_SCHEMA_VERSION,
  PublicAnalysisResultSchema,
} from "../../src/contracts/analysis-contract.js";
import { projectAnalysisResult } from "../../src/contracts/analysis-projection.js";
import { analyzeFight, type AnalysisServiceDeps } from "../../src/services/analysis-service.js";
import { specNotSupported } from "../../src/services/analyzer-registry.js";
import type { CombatIngestionPort } from "../../src/services/ingestion-port.js";
import type { FightAnalysis } from "../../src/services/result.js";
import type { Env } from "../../src/config/env.js";
import type { FightIdentity, PreflightPort } from "../../src/wcl/types.js";
import { analyzeObservedAssassinationDecisions } from "../../src/specs/rogue/assassination/observed-analysis.js";
import { M5D2_ACTOR, m5d2Fight, m5d2State } from "../support/m5d2-fixture.js";
import { ASSASSINATION_ACTOR_B, m5aState } from "../support/m5a-fixture.js";

const ENV: Env = {
  ENVIRONMENT: "test",
  WCL_CLIENT_ID: "fake-client-id-not-real",
  WCL_CLIENT_SECRET: "fake-client-secret-not-real",
};

const FIXTURE_FIGHT = m5d2Fight();

const REQUEST = {
  reportCode: FIXTURE_FIGHT.report.code,
  fightId: FIXTURE_FIGHT.fight.id,
  sourceId: M5D2_ACTOR,
};

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

const FIXTURE_INGEST: CombatIngestionPort = async () => ({
  ok: true,
  fight: m5d2Fight(),
  rateLimit: undefined,
});

function deps(className = "Rogue", specName = "Assassination"): AnalysisServiceDeps {
  return {
    env: ENV,
    preflight: (async () => ({
      ok: true,
      identity: identityFor(className, specName),
      rateLimit: undefined,
    })) as PreflightPort,
    ingest: FIXTURE_INGEST,
  };
}

/** Runs the composed service and returns the application-domain analysis. */
async function domainAnalysis(className = "Rogue", specName = "Assassination"): Promise<FightAnalysis> {
  const result = await analyzeFight(REQUEST, deps(className, specName));
  if (!result.ok) throw new Error(`expected a successful service result, got ${result.error.code}`);
  return result.analysis;
}

const ANALYZED = await domainAnalysis();
const UNSUPPORTED = await domainAnalysis("Paladin", "Protection");

/** Wraps an analyzer result in the application envelope an analyzer run produces. */
function wrap(analysis: FightAnalysis["analysis"]): FightAnalysis {
  return {
    identity: identityFor("Rogue", "Assassination"),
    specId: "rogue/assassination",
    analyzerId: "rogue-assassination-observed-decisions",
    scope: "PLAYER_CONTEXT",
    analysis,
  };
}

const AUTHORITY_NOT_AVAILABLE = wrap(
  analyzeObservedAssassinationDecisions({
    state: m5d2State(),
    actorId: M5D2_ACTOR,
    specId: "rogue/assassination",
    targetActorId: null,
    authority: null,
  }),
);

const PROFILE_NOT_RESOLVED = wrap(
  analyzeObservedAssassinationDecisions({
    state: m5d2State(),
    actorId: 999,
    specId: "rogue/assassination",
    targetActorId: null,
  }),
);

const INSUFFICIENT_EVIDENCE = wrap({
  status: "INSUFFICIENT_EVIDENCE",
  specId: "rogue/assassination",
  detail:
    "The version-scoped resource wire contracts required to read combo points and energy are not available.",
});

/**
 * The real low-combo-point Envenom, rejected through the M5-A observed-action
 * rule.
 *
 * The D2 corpus has no REJECTED decision, so without this fixture the removal
 * of `observedActionRejected` would be untested on the only path where that
 * boolean was ever `true`.
 */
const M5A_REJECTED = wrap(
  analyzeObservedAssassinationDecisions({
    state: m5aState(),
    actorId: ASSASSINATION_ACTOR_B,
    specId: "rogue/assassination",
    targetActorId: null,
  }),
);

describe("every analysis status projects and validates", () => {
  const cases: readonly { readonly status: string; readonly analysis: FightAnalysis }[] = [
    { status: "ANALYZED", analysis: ANALYZED },
    { status: "SPEC_NOT_SUPPORTED", analysis: UNSUPPORTED },
    { status: "AUTHORITY_NOT_AVAILABLE", analysis: AUTHORITY_NOT_AVAILABLE },
    { status: "PROFILE_NOT_RESOLVED", analysis: PROFILE_NOT_RESOLVED },
    { status: "INSUFFICIENT_EVIDENCE", analysis: INSUFFICIENT_EVIDENCE },
  ];

  it("covers all five current statuses", () => {
    // Guards the guard: a case list that drifted from the vocabulary would let
    // a status go unprojected and untested.
    expect(cases.map((c) => c.status).sort()).toEqual([
      "ANALYZED",
      "AUTHORITY_NOT_AVAILABLE",
      "INSUFFICIENT_EVIDENCE",
      "PROFILE_NOT_RESOLVED",
      "SPEC_NOT_SUPPORTED",
    ]);
  });

  for (const testCase of cases) {
    it(`projects ${testCase.status} into a valid public result`, () => {
      expect(testCase.analysis.analysis.status).toBe(testCase.status);
      const projected = projectAnalysisResult(testCase.analysis);

      expect(projected.status).toBe(testCase.status);
      expect(PublicAnalysisResultSchema.safeParse(projected).success).toBe(true);
      expect(projected.schemaVersion).toBe(PUBLIC_ANALYSIS_SCHEMA_VERSION);
    });

    it(`survives a JSON round trip for ${testCase.status}`, () => {
      // Proves the payload is genuinely wire-safe: no Map, Set, Date, class
      // instance, function, BigInt or Symbol survives `JSON.stringify`.
      const projected = projectAnalysisResult(testCase.analysis);
      const reparsed: unknown = JSON.parse(JSON.stringify(projected));

      expect(PublicAnalysisResultSchema.safeParse(reparsed).success).toBe(true);
      expect(reparsed).toEqual(projected);
    });

    it(`carries the capability block for ${testCase.status}`, () => {
      // Present on every status: a consumer must not have to reach an ANALYZED
      // result before learning what the engine does and does not claim.
      const projected = projectAnalysisResult(testCase.analysis);

      expect(projected.capability.matchMeaning).toBe("AUTHORITY_COMPATIBLE_ONLY");
      expect(projected.capability.scoresPerformance).toBe(false);
      expect(projected.capability.predictsArbitraryNextAction).toBe(false);
      expect(projected.capability.unknownIsFirstClass).toBe(true);
    });
  }
});

describe("the ANALYZED result preserves M5's pinned coverage", () => {
  const projected = projectAnalysisResult(ANALYZED);
  if (projected.status !== "ANALYZED") throw new Error("expected ANALYZED");

  it("publishes the pinned D2 counts unchanged", () => {
    expect({
      eligible: projected.coverage.eligibleDecisions,
      match: projected.coverage.match,
      rejected: projected.coverage.rejected,
      unknown: projected.coverage.unknown,
      exact: projected.coverage.exactEntryMatches,
      converged: projected.coverage.tokenConvergedMatches,
    }).toStrictEqual({ eligible: 11, match: 1, rejected: 0, unknown: 10, exact: 1, converged: 0 });
  });

  it("publishes the measured blocker census", () => {
    expect(projected.coverage.unknownBlockerClasses).toEqual([
      { key: "OBSERVED_STATE_MISSING", count: 6 },
      { key: "DIVERGENT_WORLDS", count: 4 },
    ]);
  });

  it("publishes the measured selection precision", () => {
    expect(projected.coverage.selectionPrecision).toEqual([
      { key: "EXACT_ENTRY", count: 1 },
      { key: "UNKNOWN", count: 10 },
    ]);
  });

  it("keeps the real Garrote MATCH exactly as M5 established it", () => {
    const garrote = projected.decisions.find((decision) => decision.outcome === "MATCH");

    expect(garrote?.observedToken).toBe("garrote");
    expect(garrote?.outcome).toBe("MATCH");
    expect(garrote?.basis).toBe("AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN");
    expect(garrote?.authorityToken).toBe("garrote");
    expect(garrote?.selectionPrecision).toBe("EXACT_ENTRY");
    // The honest caveat travels with the match: the authority could name this
    // selection partly BECAUSE the cast fired.
    expect(garrote?.usabilityProvenance).toBe("OBSERVED_EXECUTION");
    // No `observedActionRejected: false` accompanies it. See the dedicated
    // describe block below for why that absence is the point.
    expect("observedActionRejected" in (garrote ?? {})).toBe(false);
  });

  it("never renames MATCH into a verdict", () => {
    const serialized = JSON.stringify(projected).toLowerCase();

    for (const banned of ["correct", "optimal", "ideal", "recommend", "mistake", "best play"]) {
      expect(serialized).not.toContain(banned);
    }
  });
});

describe("coverage reconciliation survives projection", () => {
  const projected = projectAnalysisResult(ANALYZED);
  if (projected.status !== "ANALYZED") throw new Error("expected ANALYZED");
  const { coverage, decisions, exclusions } = projected;

  const sum = (rows: readonly { readonly count: number }[]): number =>
    rows.reduce((total, row) => total + row.count, 0);

  it("partitions the eligible decisions exactly", () => {
    expect(coverage.match + coverage.rejected + coverage.unknown).toBe(coverage.eligibleDecisions);
  });

  it("publishes one decision per eligible decision", () => {
    expect(decisions).toHaveLength(coverage.eligibleDecisions);
  });

  it("makes the resolved numerator exactly MATCH + REJECTED", () => {
    expect(coverage.resolvedComparisons).toBe(coverage.match + coverage.rejected);
  });

  it("splits MATCHes into exact-entry and token-converged without overlap", () => {
    expect(coverage.exactEntryMatches + coverage.tokenConvergedMatches).toBe(coverage.match);
  });

  it("tallies selection precision across every eligible decision", () => {
    expect(sum(coverage.selectionPrecision)).toBe(coverage.eligibleDecisions);
  });

  it("attributes every UNKNOWN to a basis and to a blocker class", () => {
    expect(sum(coverage.unknownBases)).toBe(coverage.unknown);
    expect(sum(coverage.unknownBlockerClasses)).toBe(coverage.unknown);
  });

  it("accounts for every excluded cast", () => {
    expect(sum(coverage.exclusions)).toBe(coverage.excludedCastCount);
    expect(exclusions).toHaveLength(coverage.excludedCastCount);
  });

  it("never lets an excluded observation appear among the decisions", () => {
    // The denominator stays what it claims to be. An excluded cast counted as a
    // decision would be an unresolved rotational choice we never evaluated.
    const decisionPositions = new Set(decisions.map((decision) => decision.position));
    for (const exclusion of exclusions) {
      expect(decisionPositions.has(exclusion.position)).toBe(false);
    }
    expect(exclusions.length).toBeGreaterThan(0);
  });

  it("publishes exclusions with their own stable reason vocabulary", () => {
    for (const exclusion of exclusions) {
      expect(["NON_GCD_ACTION", "EXECUTION_LANE_NOT_ESTABLISHED", "NO_AUTHORITY_TOKEN_BINDING"]).toContain(
        exclusion.reason,
      );
    }
  });
});

describe("authority provenance is projected exactly", () => {
  it("equals the pinned artifact metadata field for field", () => {
    // The same nine values `m5e-analysis-facade.test.ts` pins against the
    // committed artifact. Not a presence check: a wrong commit would let a
    // verdict be traced to text it never rested on.
    const projected = projectAnalysisResult(ANALYZED);
    if (projected.status !== "ANALYZED") throw new Error("expected ANALYZED");

    expect(projected.authority).toStrictEqual({
      authorityId: "SIMC_APL_ROGUE_ASSASSINATION",
      artifactRevision: "simc-33622e9d-1",
      repository: "https://github.com/simulationcraft/simc",
      branch: "midnight",
      commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
      sourcePath: "engine/class_modules/apl/apl_rogue.cpp",
      sourceSha256: "a74e4daa8376197d94f8449555035b3fd67634db450d2f7cb16bf84233939eb3",
      specName: "assassination",
      className: "rogue",
    });
  });

  it("fabricates no provenance the analyzer does not carry", () => {
    const projected = projectAnalysisResult(ANALYZED);
    if (projected.status !== "ANALYZED") throw new Error("expected ANALYZED");

    // Each of these was suggested by an earlier architecture sketch and is NOT
    // present in `AnalysisAuthorityMetadata`. Publishing one would describe
    // metadata the engine cannot supply.
    for (const absent of ["kind", "analyzerHash", "profileHash", "talentProvenance", "gameData"]) {
      expect(Object.keys(projected.authority)).not.toContain(absent);
    }
    expect(Object.keys(projected.authority).sort()).toEqual([
      "artifactRevision",
      "authorityId",
      "branch",
      "className",
      "commitSha",
      "repository",
      "sourcePath",
      "sourceSha256",
      "specName",
    ]);
  });
});

describe("identity is preserved, and unrecognized specs stay unrecognized", () => {
  it("publishes the factual report, fight, player and data identity", () => {
    const projected = projectAnalysisResult(ANALYZED);

    expect(projected.identity.report.code).toBe(FIXTURE_FIGHT.report.code);
    expect(projected.identity.report.revision).toBe(FIXTURE_FIGHT.report.revision);
    expect(projected.identity.fight.id).toBe(FIXTURE_FIGHT.fight.id);
    expect(projected.identity.fight.startTimeMs).toBe(FIXTURE_FIGHT.fight.startTimeMs);
    expect(projected.identity.fight.endTimeMs).toBe(FIXTURE_FIGHT.fight.endTimeMs);
    expect(projected.identity.player.sourceId).toBe(M5D2_ACTOR);
    expect(projected.identity.data.logVersion).toBe(FIXTURE_FIGHT.data.logVersion);
    expect(projected.identity.data.gameVersion).toBe(FIXTURE_FIGHT.data.gameVersion);
  });

  it("reports the supported specialization and that it ran", () => {
    const projected = projectAnalysisResult(ANALYZED);

    expect(projected.specialization.specId).toBe("rogue/assassination");
    expect(projected.specialization.gameplaySupported).toBe(true);
    expect(projected.analyzerId).toBe("rogue-assassination-observed-decisions");
  });

  it("keeps an unsupported spec factually identifiable without inventing an id", () => {
    // The Paladin is still a Protection Paladin in `identity.player`. What the
    // engine does NOT claim is an internal name for that specialization.
    const projected = projectAnalysisResult(UNSUPPORTED);

    expect(projected.identity.player.className).toBe("Paladin");
    expect(projected.identity.player.specName).toBe("Protection");
    expect(projected.specialization.specId).toBeNull();
    expect(projected.specialization.gameplaySupported).toBe(false);
  });

  it("never carries an unrecognized spec id as a VALUE outside explanatory prose", () => {
    // The distinction that matters. The detail string legitimately quotes
    // `paladin/protection` to say which specialization has no analyzer — that
    // is informative. What must never happen is the same string appearing as an
    // identifier a consumer would read as a recognized specialization.
    const projected = projectAnalysisResult(UNSUPPORTED);
    if (projected.status === "ANALYZED") throw new Error("expected a non-analyzed result");

    // The prose may name it...
    expect(projected.detail).toContain("paladin/protection");

    // ...but no field value may BE it.
    const values: unknown[] = [];
    const walk = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value !== null && typeof value === "object") Object.values(value).forEach(walk);
      else values.push(value);
    };
    walk({ ...projected, detail: undefined });

    expect(values).not.toContain("paladin/protection");
    expect(values).not.toContain("rogue/assassination");
  });

  it("marks a supported spec as supported even when its analysis did not complete", () => {
    // AUTHORITY_NOT_AVAILABLE is an evidence failure, not a coverage limit. The
    // specialization is still one this build supports.
    const projected = projectAnalysisResult(AUTHORITY_NOT_AVAILABLE);

    expect(projected.status).toBe("AUTHORITY_NOT_AVAILABLE");
    expect(projected.specialization.gameplaySupported).toBe(true);
    expect(projected.specialization.specId).toBe("rogue/assassination");
  });
});

describe("a non-analyzed result cannot be mistaken for clean play", () => {
  const unanalyzed = [
    { name: "SPEC_NOT_SUPPORTED", analysis: UNSUPPORTED },
    { name: "AUTHORITY_NOT_AVAILABLE", analysis: AUTHORITY_NOT_AVAILABLE },
    { name: "PROFILE_NOT_RESOLVED", analysis: PROFILE_NOT_RESOLVED },
    { name: "INSUFFICIENT_EVIDENCE", analysis: INSUFFICIENT_EVIDENCE },
  ] as const;

  for (const testCase of unanalyzed) {
    it(`gives ${testCase.name} no decisions, coverage or authority`, () => {
      // Not "empty" — ABSENT. `{"decisions":[],"coverage":{"eligibleDecisions":0}}`
      // reads to a player as "no mistakes found", and the only reliable defence
      // is that the fields do not exist to be misread.
      const projected = projectAnalysisResult(testCase.analysis);

      expect("decisions" in projected).toBe(false);
      expect("coverage" in projected).toBe(false);
      expect("authority" in projected).toBe(false);
      expect("exclusions" in projected).toBe(false);
    });

    it(`explains in ${testCase.name} what was not done`, () => {
      const projected = projectAnalysisResult(testCase.analysis);
      if (projected.status === "ANALYZED") throw new Error("expected a non-analyzed result");

      expect(projected.detail.length).toBeGreaterThan(20);
    });
  }

  it("says explicitly that an unsupported spec was not analyzed", () => {
    const projected = projectAnalysisResult(UNSUPPORTED);
    if (projected.status === "ANALYZED") throw new Error("expected a non-analyzed result");

    expect(projected.detail).toContain("no gameplay analysis was attempted");
  });

  it("projects the analyzer's own detail rather than authoring a new one", () => {
    const projected = projectAnalysisResult(UNSUPPORTED);
    if (projected.status === "ANALYZED") throw new Error("expected a non-analyzed result");
    const source = UNSUPPORTED.analysis;
    if (source.status === "ANALYZED") throw new Error("expected a non-analyzed source");

    // Passed through verbatim: the projection publishes the analyzer's own
    // words rather than composing a second, subtly different explanation.
    expect(projected.detail).toBe(source.detail);

    const registryDetail = specNotSupported("paladin/protection");
    if (registryDetail.status === "ANALYZED") throw new Error("expected a non-analyzed result");
    expect(projected.detail).toBe(registryDetail.detail);
  });
});

describe("no internal machinery reaches the wire", () => {
  const serialized = [ANALYZED, UNSUPPORTED, AUTHORITY_NOT_AVAILABLE, PROFILE_NOT_RESOLVED].map((analysis) =>
    JSON.stringify(projectAnalysisResult(analysis)),
  );

  /** Every property name appearing anywhere in a JSON value. */
  function collectKeys(value: unknown, into: string[] = []): string[] {
    if (Array.isArray(value)) {
      for (const item of value) collectKeys(item, into);
    } else if (value !== null && typeof value === "object") {
      for (const [key, nested] of Object.entries(value)) {
        into.push(key);
        collectKeys(nested, into);
      }
    }
    return into;
  }

  it("carries no engine trace field", () => {
    // Checked on the SERIALIZED object, not on the TypeScript type: a cast or a
    // stray spread would satisfy the compiler and still ship the field.
    const keys = new Set(serialized.flatMap((json) => collectKeys(JSON.parse(json))));

    for (const banned of [
      "rawBlocker",
      "blockedAt",
      "scanBlocker",
      "actionStringVerbatim",
      "comparisons",
      "excluded",
      "steps",
      "trace",
    ]) {
      expect([...keys], `public result must not carry "${banned}"`).not.toContain(banned);
    }
  });

  it("carries no retrieval, state or transport object", () => {
    const keys = new Set(serialized.flatMap((json) => collectKeys(JSON.parse(json))));

    for (const banned of [
      "state",
      "fight",
      "events",
      "rateLimit",
      "limitPerHour",
      "pointsSpentThisHour",
      "graphqlErrorCount",
      "diagnostics",
      "httpStatus",
      "stack",
    ]) {
      // `fight` is permitted only as the identity block's own key, so it is
      // checked by name below rather than banned outright.
      if (banned === "fight") continue;
      expect([...keys], `public result must not carry "${banned}"`).not.toContain(banned);
    }
  });

  it("carries no credential or token", () => {
    // The projection never receives `Env`, so this should be impossible by
    // construction. Asserted anyway: structural claims are worth verifying.
    for (const json of serialized) {
      for (const secret of [
        "fake-client-id-not-real",
        "fake-client-secret-not-real",
        "WCL_CLIENT_ID",
        "WCL_CLIENT_SECRET",
        "ANALYSIS_AUTH_TOKEN",
        "Bearer",
      ]) {
        expect(json).not.toContain(secret);
      }
    }
  });

  it("exposes the raw blocker's replacement instead", () => {
    // The internal comparison carries `rawBlocker`; the public one carries the
    // stable class. Proving the source HAD one makes the omission meaningful.
    const source = ANALYZED.analysis;
    if (source.status !== "ANALYZED") throw new Error("expected ANALYZED");
    const withRaw = source.comparisons.filter((comparison) => comparison.rawBlocker !== null);
    expect(withRaw.length).toBeGreaterThan(0);

    const projected = projectAnalysisResult(ANALYZED);
    if (projected.status !== "ANALYZED") throw new Error("expected ANALYZED");
    expect(projected.decisions.some((decision) => decision.decisiveBlocker !== null)).toBe(true);
  });
});

describe("the observed-action judgment is not flattened into a boolean", () => {
  const analyzed = projectAnalysisResult(ANALYZED);
  if (analyzed.status !== "ANALYZED") throw new Error("expected ANALYZED");
  const rejected = projectAnalysisResult(M5A_REJECTED);
  if (rejected.status !== "ANALYZED") throw new Error("expected ANALYZED");

  it("publishes no `observedActionRejected` on any decision", () => {
    for (const decision of [...analyzed.decisions, ...rejected.decisions]) {
      expect(Object.keys(decision)).not.toContain("observedActionRejected");
    }
    expect(analyzed.decisions.length).toBeGreaterThan(0);
    expect(rejected.decisions.length).toBeGreaterThan(0);
  });

  it("publishes no `observedActionRejected` in the serialized result", () => {
    // Checked on the bytes, not the type: a cast or a stray spread would satisfy
    // the compiler and still ship the field.
    expect(JSON.stringify(analyzed)).not.toContain("observedActionRejected");
    expect(JSON.stringify(rejected)).not.toContain("observedActionRejected");
  });

  it("still carries the boolean INTERNALLY, so the omission is a real choice", () => {
    // If M5 had stopped producing it, these tests would pass for the wrong
    // reason. The internal comparison is unchanged; only the wire is narrower.
    const source = M5A_REJECTED.analysis;
    if (source.status !== "ANALYZED") throw new Error("expected ANALYZED");

    expect(source.comparisons[0]?.observedActionRejected).toBe(true);
  });

  it("keeps the M5-A rejection fully visible through outcome and basis", () => {
    // The replacement for the boolean, and a stronger statement than it was:
    // `true` only said "something rejected this", while the basis names WHICH
    // rule did, positively.
    const only = rejected.decisions[0];

    expect(rejected.decisions).toHaveLength(1);
    expect(only?.observedToken).toBe("envenom");
    expect(only?.outcome).toBe("REJECTED");
    expect(only?.basis).toBe("OBSERVED_ACTION_REJECTED_BY_AUTHORITY");
  });

  it("names no replacement action for that rejection", () => {
    // A rejection stands on its own. Nothing here says what should have been
    // cast instead, because the authority selection stayed UNKNOWN.
    const only = rejected.decisions[0];

    expect(only?.authorityToken).toBeNull();
    expect(only?.authorityCoverage).toBe("UNKNOWN");
    expect(only?.selectionPrecision).toBeNull();
  });

  it("distinguishes the two rejection bases from each other", () => {
    // Both are REJECTED; only the basis says whether the observed action was
    // proven unselectable or a different token was proven instead. The boolean
    // could not tell those apart.
    expect(rejected.decisions[0]?.basis).toBe("OBSERVED_ACTION_REJECTED_BY_AUTHORITY");
    expect(rejected.decisions[0]?.basis).not.toBe("AUTHORITY_SELECTED_DIFFERENT_TOKEN");
  });

  it("represents an UNKNOWN decision with no false-valued verdict field", () => {
    // THE REASON THE FIELD WAS REMOVED. An UNKNOWN decision previously carried
    // `observedActionRejected: false`, which reads as "not rejected" when the
    // engine only ever meant "rejection was not proven".
    const unknown = analyzed.decisions.filter((decision) => decision.outcome === "UNKNOWN");
    expect(unknown.length).toBe(10);

    for (const decision of unknown) {
      for (const [key, value] of Object.entries(decision)) {
        expect(`${key}=${typeof value}`, `UNKNOWN decision carries a boolean "${key}"`).not.toContain(
          "boolean",
        );
      }
    }
  });

  it("leaves UNKNOWN describing itself only through UNKNOWN vocabulary", () => {
    const unknown = analyzed.decisions.find((decision) => decision.outcome === "UNKNOWN");

    expect(unknown?.outcome).toBe("UNKNOWN");
    expect(unknown?.authorityToken).toBeNull();
    expect(unknown?.decisiveBlocker).not.toBeNull();
  });
});

describe("ingestion scope stays internal", () => {
  it("publishes no evidence scope on any status", () => {
    for (const analysis of [
      ANALYZED,
      UNSUPPORTED,
      AUTHORITY_NOT_AVAILABLE,
      PROFILE_NOT_RESOLVED,
      INSUFFICIENT_EVIDENCE,
    ]) {
      const projected = projectAnalysisResult(analysis);

      expect(Object.keys(projected)).not.toContain("evidenceScope");
      expect(JSON.stringify(projected)).not.toContain("evidenceScope");
    }
  });

  it("publishes neither scope value anywhere in the payload", () => {
    // Not just the key — the values too, in case a future field smuggles them
    // through under another name.
    const serialized = JSON.stringify(projectAnalysisResult(ANALYZED));

    expect(serialized).not.toContain("PLAYER_CONTEXT");
    expect(serialized).not.toContain("FULL_RAID");
  });

  it("leaves the application result carrying it, unchanged", () => {
    // M6-B's analyzer-owned scope is untouched. The correction narrowed the
    // wire, not the orchestration: the service still derives scope from the
    // selected analyzer and still records what it retrieved.
    expect(ANALYZED.scope).toBe("PLAYER_CONTEXT");
    expect(UNSUPPORTED.scope).toBeNull();
  });

  it("replaces it with no placeholder", () => {
    // Removing a field and leaving `evidenceScope: null`, or a renamed null in
    // its place, would keep the coupling while losing the information.
    const projected = projectAnalysisResult(UNSUPPORTED);
    const keys = Object.keys(projected);

    for (const banned of ["evidenceScope", "scope", "ingestionScope", "retrievalScope", "breadth"]) {
      expect(keys).not.toContain(banned);
    }
  });
});

describe("the projection is deterministic", () => {
  it("produces deeply equal results for the same input", () => {
    // No clock, no random id, no request id, no environment lookup. The
    // contract represents analysis truth, not transport metadata.
    const first = projectAnalysisResult(ANALYZED);
    const second = projectAnalysisResult(ANALYZED);

    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("produces deeply equal results across every status", () => {
    for (const analysis of [UNSUPPORTED, AUTHORITY_NOT_AVAILABLE, PROFILE_NOT_RESOLVED]) {
      expect(projectAnalysisResult(analysis)).toEqual(projectAnalysisResult(analysis));
    }
  });

  it("does not mutate the application result it was given", () => {
    const before = JSON.stringify(ANALYZED.analysis);
    projectAnalysisResult(ANALYZED);

    expect(JSON.stringify(ANALYZED.analysis)).toBe(before);
  });
});
