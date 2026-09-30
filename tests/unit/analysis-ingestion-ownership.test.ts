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
 * THE UNRELATED ANALYZER NEVER RUNS. Since M10-D it is the REAL public
 * Protection Paladin registration, WIDENED for this file only: its
 * declarations are rewritten to the opposite of Assassination's on both axes
 * (`FULL_RAID`, no resources) and its `analyze` is replaced by one that
 * throws, so reaching it would surface as a failure rather than as a quietly
 * wrong result. The catalog is complete — every public row is present
 * (Retribution Paladin's unmodified production row too, since M11-A5, and
 * Blood Death Knight's and Brewmaster Monk's since M11-B12 and M11-C4j), as the
 * registry requires — and the only question is whether a row that was NOT
 * selected for a Rogue request can influence what that request retrieves.
 */

import { describe, expect, it, vi } from "vitest";

import { analyzeFight, type AnalysisServiceDeps } from "../../src/services/analysis-service.js";
import { analyzerForSpec, type RegisteredAnalyzer } from "../../src/services/analyzer-registry.js";
import type { CombatIngestionPort } from "../../src/services/ingestion-port.js";
import type { Env } from "../../src/config/env.js";
import type { FightIdentity, PreflightPort } from "../../src/wcl/types.js";
import { M5D2_ACTOR, m5d2Fight } from "../support/m5d2-fixture.js";
import { analyzedAssassinationOf } from "../support/assassination-analysis.js";
import { productionRegistrationFor } from "../support/catalog.js";

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
 * The real Protection Paladin row with its capability requirements rewritten
 * to the opposite of Assassination's on both axes, so either kind of bleed
 * changes the observed ingestion request — and a facade that throws, so
 * running it cannot go unnoticed.
 */
const UNRELATED_ANALYZER: RegisteredAnalyzer = (() => {
  const protection = productionRegistrationFor("paladin/protection");
  return {
    ...protection,
    capabilities: protection.capabilities.map((capability) => ({
      ...capability,
      requirements: { ...capability.requirements, scope: "FULL_RAID" as const, resources: [] },
    })),
    analyze: () => {
      throw new Error("the unrelated Protection registration must never run for a Rogue request");
    },
  };
})();

/** The production Protection row, unmodified: the catalog as deployed. */
const PRODUCTION_PROTECTION: RegisteredAnalyzer = productionRegistrationFor("paladin/protection");

/**
 * The production Retribution row, unmodified. PUBLIC since M11-A5, so every
 * injected catalog below must carry it for the registry to accept the table;
 * it is never selected for a Rogue request and takes no part in the question.
 */
const PRODUCTION_RETRIBUTION: RegisteredAnalyzer = productionRegistrationFor("paladin/retribution");

/**
 * The production Blood Death Knight row, unmodified. PUBLIC since M11-B12,
 * so every injected catalog below must carry it too; it is never selected
 * for a Rogue request and takes no part in the question.
 */
const PRODUCTION_BLOOD: RegisteredAnalyzer = productionRegistrationFor("deathknight/blood");

/**
 * The production Brewmaster Monk row, unmodified. PUBLIC since M11-C4j, so
 * every injected catalog below must carry it too; it is never selected for a
 * Rogue request and takes no part in the question.
 */
const PRODUCTION_BREWMASTER: RegisteredAnalyzer = productionRegistrationFor("monk/brewmaster");

function deps(registry: readonly RegisteredAnalyzer[], ingest: CombatIngestionPort): AnalysisServiceDeps {
  return { env: ENV, preflight: PREFLIGHT, ingest, registry };
}

describe("an unselected analyzer has no influence on this request", () => {
  it("does not widen scope when a FULL_RAID analyzer is also registered", async () => {
    // THE REGRESSION. Deriving from the enabled set would union FULL_RAID in and
    // retrieve raid-wide evidence for a Rogue request.
    const ingest = vi.fn(FIXTURE_INGEST);
    await analyzeFight(
      REQUEST,
      deps(
        [
          assassination(),
          UNRELATED_ANALYZER,
          PRODUCTION_RETRIBUTION,
          PRODUCTION_BLOOD,
          PRODUCTION_BREWMASTER,
        ],
        ingest,
      ),
    );

    expect(ingest.mock.calls[0]?.[0].scope).toBe("PLAYER_CONTEXT");
  });

  it("is unaffected by registration order", async () => {
    // A union would be order-independent and still wrong; selection is
    // order-independent and right. Asserting both orders rules out a lookup
    // that merely happened to find the correct analyzer first.
    const first = vi.fn(FIXTURE_INGEST);
    const second = vi.fn(FIXTURE_INGEST);

    await analyzeFight(
      REQUEST,
      deps(
        [
          UNRELATED_ANALYZER,
          assassination(),
          PRODUCTION_RETRIBUTION,
          PRODUCTION_BLOOD,
          PRODUCTION_BREWMASTER,
        ],
        first,
      ),
    );
    await analyzeFight(
      REQUEST,
      deps(
        [
          assassination(),
          UNRELATED_ANALYZER,
          PRODUCTION_RETRIBUTION,
          PRODUCTION_BLOOD,
          PRODUCTION_BREWMASTER,
        ],
        second,
      ),
    );

    expect(first.mock.calls[0]?.[0]).toEqual(second.mock.calls[0]?.[0]);
    expect(first.mock.calls[0]?.[0].scope).toBe("PLAYER_CONTEXT");
  });

  it("produces the identical request whether the other registration is widened or not", async () => {
    // The sharpest form: rewriting the OTHER registration's declarations must
    // change nothing about this request at all.
    const production = vi.fn(FIXTURE_INGEST);
    const widened = vi.fn(FIXTURE_INGEST);

    await analyzeFight(
      REQUEST,
      deps(
        [
          assassination(),
          PRODUCTION_PROTECTION,
          PRODUCTION_RETRIBUTION,
          PRODUCTION_BLOOD,
          PRODUCTION_BREWMASTER,
        ],
        production,
      ),
    );
    await analyzeFight(
      REQUEST,
      deps(
        [
          assassination(),
          UNRELATED_ANALYZER,
          PRODUCTION_RETRIBUTION,
          PRODUCTION_BLOOD,
          PRODUCTION_BREWMASTER,
        ],
        widened,
      ),
    );

    expect(widened.mock.calls[0]?.[0]).toEqual(production.mock.calls[0]?.[0]);
    expect(production.mock.calls[0]?.[0]).toMatchObject({ scope: "PLAYER_CONTEXT", includeResources: true });
  });

  it("never runs the unselected analyzer", async () => {
    // Its `analyze` throws, so reaching it would surface as a failure rather
    // than as a quietly wrong result.
    const result = await analyzeFight(
      REQUEST,
      deps(
        [
          assassination(),
          UNRELATED_ANALYZER,
          PRODUCTION_RETRIBUTION,
          PRODUCTION_BLOOD,
          PRODUCTION_BREWMASTER,
        ],
        FIXTURE_INGEST,
      ),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.analyzerId).toBe("rogue-assassination-observed-decisions");
  });

  it("still reproduces the pinned coverage alongside a second registration", async () => {
    // Gameplay truth cannot depend on who else is in the registry.
    const result = await analyzeFight(
      REQUEST,
      deps(
        [
          assassination(),
          UNRELATED_ANALYZER,
          PRODUCTION_RETRIBUTION,
          PRODUCTION_BLOOD,
          PRODUCTION_BREWMASTER,
        ],
        FIXTURE_INGEST,
      ),
    );

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
    await analyzeFight(
      REQUEST,
      deps(
        [
          assassination(),
          PRODUCTION_PROTECTION,
          PRODUCTION_RETRIBUTION,
          PRODUCTION_BLOOD,
          PRODUCTION_BREWMASTER,
        ],
        ingest,
      ),
    );

    expect(assassination().requirement.includeResources).toBe(true);
    expect(ingest.mock.calls[0]?.[0].includeResources).toBe(true);
  });

  it("does NOT retrieve resources when the selected registration declares none", async () => {
    // THE REGRESSION. A hard-coded `includeResources: true` in the service would
    // make this pass regardless of the registration — so the assertion that
    // matters is `false`, driven only by flipping the requirement.
    const ingest = vi.fn(FIXTURE_INGEST);
    const frugal = assassinationDeclaring({ resources: [] });

    await analyzeFight(
      REQUEST,
      deps(
        [frugal, PRODUCTION_PROTECTION, PRODUCTION_RETRIBUTION, PRODUCTION_BLOOD, PRODUCTION_BREWMASTER],
        ingest,
      ),
    );

    expect(ingest.mock.calls[0]?.[0].includeResources).toBe(false);
  });

  it("tracks the requirement in both directions", async () => {
    // Proves it is READ from the registration rather than coincidentally equal
    // to a constant: the same service produces both values.
    const observed: boolean[] = [];

    for (const includeResources of [true, false, true]) {
      const ingest = vi.fn(FIXTURE_INGEST);
      const resources = includeResources ? assassination().capabilities[0]?.requirements.resources : [];
      await analyzeFight(
        REQUEST,
        deps(
          [
            assassinationDeclaring({ resources: resources ?? [] }),
            PRODUCTION_PROTECTION,
            PRODUCTION_RETRIBUTION,
            PRODUCTION_BLOOD,
            PRODUCTION_BREWMASTER,
          ],
          ingest,
        ),
      );
      observed.push(ingest.mock.calls[0]?.[0].includeResources ?? !includeResources);
    }

    expect(observed).toEqual([true, false, true]);
  });

  it("carries scope from the requirement too", async () => {
    // The same ownership rule on the other axis, driven the same way.
    const ingest = vi.fn(FIXTURE_INGEST);
    await analyzeFight(
      REQUEST,
      deps(
        [
          assassinationDeclaring({ scope: "FULL_RAID" }),
          PRODUCTION_PROTECTION,
          PRODUCTION_RETRIBUTION,
          PRODUCTION_BLOOD,
          PRODUCTION_BREWMASTER,
        ],
        ingest,
      ),
    );

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
