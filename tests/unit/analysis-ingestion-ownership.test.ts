/**
 * Ingestion requirements belong to the SELECTED analyzer, and to nothing else.
 *
 * WHY THIS FILE EXISTS SEPARATELY
 *
 * With one analyzer registered, the difference between "derive from the selected
 * registration" and "derive from every enabled registration" is invisible: both
 * produce the same request, and every other test in the suite passes either way.
 * The defect only appears when a second analyzer lands — in M10 or M11, months
 * from now, in a change that has nothing to do with Rogues.
 *
 * So the second analyzer is created HERE, as a fake, purely to make the
 * distinction observable today. Two failures become detectable:
 *
 *   SCOPE WIDENING     registering a FULL_RAID analyzer silently upgrades every
 *                      Rogue request to raid-wide retrieval, paying for ally
 *                      evidence the Rogue analyzer cannot read.
 *
 *   RESOURCE BLEED     one analyzer's resource needs become every analyzer's,
 *                      in either direction.
 *
 * THE FAKE IS NOT A GAMEPLAY ANALYZER. It never runs — it exists only to sit in
 * the registry unselected, and its `analyze` throws to prove it stayed there.
 *
 * Since M10-A the fake is the shared internal-only fixture registration under
 * the `paladin/protection` id (`tests/support/internal-fixture-registration.ts`),
 * which is exactly the shape a second specialization will take in the catalog
 * before it is public: known internally, registered, and invisible to dispatch.
 */

import { describe, expect, it, vi } from "vitest";

import { analyzeFight, type AnalysisServiceDeps } from "../../src/services/analysis-service.js";
import { analyzerForSpec, type RegisteredAnalyzer } from "../../src/services/analyzer-registry.js";
import type { CombatIngestionPort } from "../../src/services/ingestion-port.js";
import type { Env } from "../../src/config/env.js";
import type { FightIdentity, PreflightPort } from "../../src/wcl/types.js";
import { M5D2_ACTOR, m5d2Fight } from "../support/m5d2-fixture.js";
import { analyzedAssassinationOf } from "../support/assassination-analysis.js";
import { internalFixtureRegistration } from "../support/internal-fixture-registration.js";

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

const IDENTITY: FightIdentity = {
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
  player: { sourceId: M5D2_ACTOR, name: "Fixtureplayer", className: "Rogue", specName: "Assassination" },
};

const PREFLIGHT: PreflightPort = async () => ({ ok: true, identity: IDENTITY, rateLimit: undefined });

const FIXTURE_INGEST: CombatIngestionPort = async () => ({
  ok: true,
  fight: m5d2Fight(),
  rateLimit: undefined,
});

function assassination(): RegisteredAnalyzer {
  const analyzer = analyzerForSpec("rogue/assassination");
  if (analyzer === null) throw new Error("the Assassination analyzer is not registered");
  return analyzer;
}

/**
 * The Assassination registration with its ONE capability's requirements
 * altered.
 *
 * Since the M10-A integrity correction a registration's `requirement` is
 * re-derived from its capabilities whenever it is validated, so overriding the
 * field directly would be silently undone. The honest lever is the
 * declaration itself.
 */
function assassinationDeclaring(
  overrides: Partial<RegisteredAnalyzer["capabilities"][number]["requirements"]>,
): RegisteredAnalyzer {
  const base = assassination();
  return {
    ...base,
    capabilities: base.capabilities.map((capability) => ({
      ...capability,
      requirements: { ...capability.requirements, ...overrides },
    })),
  };
}

/**
 * A registration that must never be selected for this request.
 *
 * Its requirement is deliberately the opposite of Assassination's on both axes,
 * so either kind of bleed changes the observed ingestion request.
 */
const UNRELATED_ANALYZER: RegisteredAnalyzer = internalFixtureRegistration();

function deps(registry: readonly RegisteredAnalyzer[], ingest: CombatIngestionPort): AnalysisServiceDeps {
  return { env: ENV, preflight: PREFLIGHT, ingest, registry };
}

describe("an unselected analyzer has no influence on this request", () => {
  it("does not widen scope when a FULL_RAID analyzer is also registered", async () => {
    // THE REGRESSION. Deriving from the enabled set would union FULL_RAID in and
    // retrieve raid-wide evidence for a Rogue request.
    const ingest = vi.fn(FIXTURE_INGEST);
    await analyzeFight(REQUEST, deps([assassination(), UNRELATED_ANALYZER], ingest));

    expect(ingest.mock.calls[0]?.[0].scope).toBe("PLAYER_CONTEXT");
  });

  it("is unaffected by registration order", async () => {
    // A union would be order-independent and still wrong; selection is
    // order-independent and right. Asserting both orders rules out a lookup
    // that merely happened to find the correct analyzer first.
    const first = vi.fn(FIXTURE_INGEST);
    const second = vi.fn(FIXTURE_INGEST);

    await analyzeFight(REQUEST, deps([UNRELATED_ANALYZER, assassination()], first));
    await analyzeFight(REQUEST, deps([assassination(), UNRELATED_ANALYZER], second));

    expect(first.mock.calls[0]?.[0]).toEqual(second.mock.calls[0]?.[0]);
    expect(first.mock.calls[0]?.[0].scope).toBe("PLAYER_CONTEXT");
  });

  it("produces the identical request with and without the unrelated analyzer", async () => {
    // The sharpest form: the extra registration must change nothing at all.
    const alone = vi.fn(FIXTURE_INGEST);
    const alongside = vi.fn(FIXTURE_INGEST);

    await analyzeFight(REQUEST, deps([assassination()], alone));
    await analyzeFight(REQUEST, deps([assassination(), UNRELATED_ANALYZER], alongside));

    expect(alongside.mock.calls[0]?.[0]).toEqual(alone.mock.calls[0]?.[0]);
  });

  it("never runs the unselected analyzer", async () => {
    // Its `analyze` throws, so reaching it would surface as a failure rather
    // than as a quietly wrong result.
    const result = await analyzeFight(REQUEST, deps([assassination(), UNRELATED_ANALYZER], FIXTURE_INGEST));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.analyzerId).toBe("rogue-assassination-observed-decisions");
  });

  it("still reproduces the pinned coverage alongside a second registration", async () => {
    // Gameplay truth cannot depend on who else is in the registry.
    const result = await analyzeFight(REQUEST, deps([assassination(), UNRELATED_ANALYZER], FIXTURE_INGEST));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const analysis = analyzedAssassinationOf(result.analysis);
    expect({
      eligible: analysis.coverage.eligibleDecisions,
      match: analysis.coverage.match,
      rejected: analysis.coverage.rejected,
      unknown: analysis.coverage.unknown,
      exact: analysis.coverage.exactEntryMatches,
      converged: analysis.coverage.tokenConvergedMatches,
    }).toStrictEqual({ eligible: 11, match: 1, rejected: 0, unknown: 10, exact: 1, converged: 0 });
  });
});

describe("resource inclusion is declared by the analyzer, not by the service", () => {
  it("retrieves resources because Assassination's registration asks for them", async () => {
    const ingest = vi.fn(FIXTURE_INGEST);
    await analyzeFight(REQUEST, deps([assassination()], ingest));

    expect(assassination().requirement.includeResources).toBe(true);
    expect(ingest.mock.calls[0]?.[0].includeResources).toBe(true);
  });

  it("does NOT retrieve resources when the selected registration declares none", async () => {
    // THE REGRESSION. A hard-coded `includeResources: true` in the service would
    // make this pass regardless of the registration — so the assertion that
    // matters is `false`, driven only by flipping the requirement.
    const ingest = vi.fn(FIXTURE_INGEST);
    const frugal = assassinationDeclaring({ resources: [] });

    await analyzeFight(REQUEST, deps([frugal], ingest));

    expect(ingest.mock.calls[0]?.[0].includeResources).toBe(false);
  });

  it("tracks the requirement in both directions", async () => {
    // Proves it is READ from the registration rather than coincidentally equal
    // to a constant: the same service produces both values.
    const observed: boolean[] = [];

    for (const includeResources of [true, false, true]) {
      const ingest = vi.fn(FIXTURE_INGEST);
      const resources = includeResources ? assassination().capabilities[0]?.requirements.resources : [];
      await analyzeFight(REQUEST, deps([assassinationDeclaring({ resources: resources ?? [] })], ingest));
      observed.push(ingest.mock.calls[0]?.[0].includeResources ?? !includeResources);
    }

    expect(observed).toEqual([true, false, true]);
  });

  it("carries scope from the requirement too", async () => {
    // The same ownership rule on the other axis, driven the same way.
    const ingest = vi.fn(FIXTURE_INGEST);
    await analyzeFight(REQUEST, deps([assassinationDeclaring({ scope: "FULL_RAID" })], ingest));

    expect(ingest.mock.calls[0]?.[0].scope).toBe("FULL_RAID");
  });
});

describe("the service holds no analyzer-specific evidence knowledge", () => {
  it("names no resource anywhere in its source", async () => {
    // `includeResources: true // Rogue needs Energy` is gameplay knowledge. The
    // service must not be able to state it, in code or in a comment that would
    // justify hard-coding it back.
    const sources: Record<string, string> = import.meta.glob("../../src/services/*.ts", {
      eager: true,
      query: "?raw",
      import: "default",
    });

    for (const [path, source] of Object.entries(sources)) {
      // The registry is where an analyzer's evidence needs are legitimately
      // named. Everything else in the layer must be silent about them.
      if (path.endsWith("analyzer-registry.ts")) continue;
      for (const token of ["Energy", "energy", "combo", "Combo"]) {
        expect(`${path}:${source.includes(token) ? token : "clean"}`).toBe(`${path}:clean`);
      }
    }
  });
});
