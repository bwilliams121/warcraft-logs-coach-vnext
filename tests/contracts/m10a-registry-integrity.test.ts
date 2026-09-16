/**
 * M10-A: analyzer registration, exposure and catalog integrity.
 *
 * Three states that must stay distinct — known internal spec, registered
 * internal analyzer, publicly enabled analyzer — and the integrity rules that
 * keep a catalog coherent. A validated catalog is a frozen snapshot behind a
 * runtime brand; every lookup accepts only that. Registry corruption is a
 * configuration defect the service reports as INTERNAL_ERROR; it is never
 * dressed as SPEC_NOT_SUPPORTED.
 */

import { describe, expect, it, vi } from "vitest";

import { analyzeFight, type AnalysisServiceDeps } from "../../src/services/analysis-service.js";
import {
  ANALYZER_REGISTRATIONS,
  AnalyzerCatalogIntegrityError,
  analyzerForSpec,
  catalogFor,
  ENABLED_ANALYZERS,
  internalAnalyzerForSpec,
  isValidatedCatalog,
  observedDecisionViewOf,
  PRODUCTION_CATALOG,
  publicAnalyzers,
  requireValidatedCatalog,
  validateAnalyzerCatalog,
  type AnalyzerRegistration,
  type CatalogDefect,
  type ValidatedAnalyzerCatalog,
} from "../../src/services/analyzer-registry.js";
import type { CombatIngestionPort } from "../../src/services/ingestion-port.js";
import type { FightIdentity, PreflightPort } from "../../src/wcl/types.js";
import {
  ASSASSINATION_ANALYZER_ID,
  ASSASSINATION_OFFENSIVE_AUTHORITY,
  ASSASSINATION_REGISTRATION,
} from "../../src/specs/rogue/assassination/registration.js";
import { MCP_TEST_ENV } from "../support/analysis-transports.js";
import { analyzedFightAnalysis } from "../support/aggregation-fixture.js";
import {
  INTERNAL_FIXTURE_ANALYZER_ID,
  internalFixtureRegistration,
} from "../support/internal-fixture-registration.js";
import { M5D2_ACTOR, m5d2Fight } from "../support/m5d2-fixture.js";

const FIXTURE = internalFixtureRegistration();

function defectsOf(catalog: readonly AnalyzerRegistration[]): readonly CatalogDefect[] {
  const validation = validateAnalyzerCatalog(catalog);
  return validation.ok ? [] : validation.defects.map((defect) => defect.defect);
}

/** A mutable, unfrozen copy of a registration, as an adversary would build one. */
function mutableCopy(registration: AnalyzerRegistration): AnalyzerRegistration {
  return {
    ...registration,
    capabilities: registration.capabilities.map((capability) => ({
      ...capability,
      requirements: {
        ...capability.requirements,
        resources: [...capability.requirements.resources],
        evidenceCategories: [...capability.requirements.evidenceCategories],
      },
    })),
    authorityBindings: registration.authorityBindings.map((binding) => ({ ...binding })),
  };
}

describe("the production catalog", () => {
  it("validates, and the module-load catalog IS a validated snapshot", () => {
    expect(isValidatedCatalog(PRODUCTION_CATALOG)).toBe(true);
    expect(validateAnalyzerCatalog(ANALYZER_REGISTRATIONS).ok).toBe(true);
  });

  it("carries exactly one registration, and it is Assassination, PUBLIC", () => {
    expect(
      PRODUCTION_CATALOG.registrations.map((registration) => [
        registration.analyzerId,
        registration.specId,
        registration.exposure,
      ]),
    ).toEqual([[ASSASSINATION_ANALYZER_ID, "rogue/assassination", "PUBLIC"]]);
    expect(ENABLED_ANALYZERS).toEqual(publicAnalyzers(PRODUCTION_CATALOG));
    expect(ENABLED_ANALYZERS).toHaveLength(1);
  });

  it("registers no production Protection Paladin analyzer", () => {
    expect(internalAnalyzerForSpec("paladin/protection")).toBeNull();
    expect(analyzerForSpec("paladin/protection")).toBeNull();
  });

  it("is frozen at every level a validation depends on", () => {
    const [registration] = PRODUCTION_CATALOG.registrations;
    if (registration === undefined) throw new Error("empty");
    expect(Object.isFrozen(PRODUCTION_CATALOG)).toBe(true);
    expect(Object.isFrozen(PRODUCTION_CATALOG.registrations)).toBe(true);
    expect(Object.isFrozen(registration)).toBe(true);
    expect(Object.isFrozen(registration.capabilities)).toBe(true);
    for (const capability of registration.capabilities) {
      expect(Object.isFrozen(capability)).toBe(true);
      expect(Object.isFrozen(capability.requirements)).toBe(true);
      expect(Object.isFrozen(capability.requirements.resources)).toBe(true);
      expect(Object.isFrozen(capability.requirements.evidenceCategories)).toBe(true);
    }
    expect(Object.isFrozen(registration.authorityBindings)).toBe(true);
    for (const binding of registration.authorityBindings) expect(Object.isFrozen(binding)).toBe(true);
    expect(Object.isFrozen(registration.requirement)).toBe(true);
    // The raw registration list and the row the spec wrote are frozen too.
    expect(Object.isFrozen(ANALYZER_REGISTRATIONS)).toBe(true);
    expect(Object.isFrozen(ASSASSINATION_REGISTRATION)).toBe(true);
  });
});

describe("a validated catalog cannot be mutated into an invalid one", () => {
  const catalog = requireValidatedCatalog([ASSASSINATION_REGISTRATION, FIXTURE]);
  const paladin = catalog.registrations.find((registration) => registration.specId === "paladin/protection");
  const rogue = catalog.registrations.find((registration) => registration.specId === "rogue/assassination");
  if (paladin === undefined || rogue === undefined) throw new Error("catalog incomplete");

  it("the registration list cannot grow a duplicate", () => {
    const rows = catalog.registrations as AnalyzerRegistration[];
    expect(() => rows.push({ ...rogue, analyzerId: "second" })).toThrow(TypeError);
    expect(() => rows.push({ ...FIXTURE, analyzerId: "third" })).toThrow(TypeError);
    expect(catalog.registrations).toHaveLength(2);
  });

  it("exposure cannot be flipped to PUBLIC", () => {
    expect(() => {
      (paladin as { exposure: string }).exposure = "PUBLIC";
    }).toThrow(TypeError);
    expect(paladin.exposure).toBe("INTERNAL_ONLY");
    expect(analyzerForSpec("paladin/protection", catalog)).toBeNull();
  });

  it("specId and analyzerId cannot be changed", () => {
    expect(() => {
      (paladin as { specId: string }).specId = "rogue/assassination";
    }).toThrow(TypeError);
    expect(() => {
      (paladin as { analyzerId: string }).analyzerId = ASSASSINATION_ANALYZER_ID;
    }).toThrow(TypeError);
  });

  it("authority ownership cannot be changed", () => {
    const bindings = paladin.authorityBindings as unknown[];
    expect(() => bindings.push(ASSASSINATION_OFFENSIVE_AUTHORITY)).toThrow(TypeError);
    const [binding] = rogue.authorityBindings;
    if (binding === undefined) throw new Error("no binding");
    expect(() => {
      (binding as { domain: string }).domain = "ACTIVE_MITIGATION";
    }).toThrow(TypeError);
    expect(() => {
      (binding as { artifactRevision: string }).artifactRevision = "simc-deadbeef-9";
    }).toThrow(TypeError);
    expect(paladin.authority.forDomain("OFFENSIVE_ROTATION").outcome).toBe("DOMAIN_NOT_DECLARED");
  });

  it("capability requirements cannot be changed", () => {
    const [capability] = rogue.capabilities;
    if (capability === undefined) throw new Error("no capability");
    expect(() => {
      (capability.requirements as { scope: string }).scope = "FULL_RAID";
    }).toThrow(TypeError);
    expect(() => (capability.requirements.resources as string[]).push("HOLY_POWER")).toThrow(TypeError);
    expect(() => (capability.requirements.evidenceCategories as string[]).pop()).toThrow(TypeError);
    expect(() => (rogue.capabilities as unknown[]).push(capability)).toThrow(TypeError);
    expect(rogue.requirement).toEqual({
      analyzerId: ASSASSINATION_ANALYZER_ID,
      requiredScope: "PLAYER_CONTEXT",
      includeResources: true,
    });
  });

  it("mutating the ORIGINAL rows after validation does not reach the snapshot", () => {
    // The adversary's copy is mutable; the validated catalog was built from a
    // snapshot of it and never reads it again.
    const original = mutableCopy(FIXTURE);
    const rows: AnalyzerRegistration[] = [ASSASSINATION_REGISTRATION, original];
    const validated = requireValidatedCatalog(rows);

    (original as { exposure: string }).exposure = "PUBLIC";
    (original.capabilities[0]?.requirements.resources as string[]).push("COMBO_POINTS");
    (original.authorityBindings as unknown[]).push(ASSASSINATION_OFFENSIVE_AUTHORITY);
    rows.push({ ...ASSASSINATION_REGISTRATION, analyzerId: "second" });

    expect(analyzerForSpec("paladin/protection", validated)).toBeNull();
    expect(internalAnalyzerForSpec("paladin/protection", validated)?.exposure).toBe("INTERNAL_ONLY");
    expect(internalAnalyzerForSpec("paladin/protection", validated)?.requirement.includeResources).toBe(
      false,
    );
    expect(internalAnalyzerForSpec("paladin/protection", validated)?.authorityBindings).toHaveLength(0);
    expect(validated.registrations).toHaveLength(2);
    // And re-validating the mutated rows now refuses them.
    const defects = defectsOf(rows);
    expect(defects).toContain("DUPLICATE_SPEC_ID");
    expect(defects).toContain("PUBLIC_EXPOSURE_OF_INTERNAL_SPEC");
  });

  it("a hand-written requirement that disagrees with the declaration is discarded", () => {
    const lying: AnalyzerRegistration = {
      ...mutableCopy(ASSASSINATION_REGISTRATION),
      requirement: {
        analyzerId: ASSASSINATION_ANALYZER_ID,
        requiredScope: "FULL_RAID",
        includeResources: false,
      },
    };
    const validated = requireValidatedCatalog([lying]);
    expect(analyzerForSpec("rogue/assassination", validated)?.requirement).toEqual({
      analyzerId: ASSASSINATION_ANALYZER_ID,
      requiredScope: "PLAYER_CONTEXT",
      includeResources: true,
    });
  });
});

describe("every lookup requires a validated catalog", () => {
  const DUPLICATE_SPEC = [
    ASSASSINATION_REGISTRATION,
    { ...ASSASSINATION_REGISTRATION, analyzerId: "second" },
  ];
  const DUPLICATE_ANALYZER = [
    ASSASSINATION_REGISTRATION,
    internalFixtureRegistration({ analyzerId: ASSASSINATION_ANALYZER_ID }),
  ];
  const EXPOSURE_CONFLICT = [ASSASSINATION_REGISTRATION, internalFixtureRegistration({ exposure: "PUBLIC" })];
  const IDENTITY_DISAGREEMENT = [{ ...ASSASSINATION_REGISTRATION, exposure: "INTERNAL_ONLY" as const }];
  const AUTHORITY_MISMATCH = [
    {
      ...ASSASSINATION_REGISTRATION,
      authorityBindings: [{ ...ASSASSINATION_OFFENSIVE_AUTHORITY, artifactRevision: "simc-deadbeef-9" }],
    },
  ];
  const CORRUPT = [
    ["duplicate spec ids", DUPLICATE_SPEC],
    ["duplicate analyzer ids", DUPLICATE_ANALYZER],
    ["public/internal exposure conflict", EXPOSURE_CONFLICT],
    ["public identity/partition disagreement", IDENTITY_DISAGREEMENT],
    ["authority mismatch", AUTHORITY_MISMATCH],
  ] as const;

  it.each(CORRUPT)("%s: validation refuses, and requireValidatedCatalog throws", (_label, rows) => {
    expect(validateAnalyzerCatalog(rows).ok).toBe(false);
    expect(() => requireValidatedCatalog(rows)).toThrow(AnalyzerCatalogIntegrityError);
  });

  it.each(CORRUPT)("%s: a raw array cannot be handed to any lookup, even by cast", (_label, rows) => {
    const smuggled = rows as unknown as ValidatedAnalyzerCatalog;
    expect(() => analyzerForSpec("rogue/assassination", smuggled)).toThrow(AnalyzerCatalogIntegrityError);
    expect(() => internalAnalyzerForSpec("rogue/assassination", smuggled)).toThrow(
      AnalyzerCatalogIntegrityError,
    );
    expect(() => publicAnalyzers(smuggled)).toThrow(AnalyzerCatalogIntegrityError);
    const analyzed = analyzedFightAnalysis({ fightId: 1, sourceId: 7, comparisons: [] }).analysis;
    if (analyzed.status !== "ANALYZED") throw new Error("expected ANALYZED");
    expect(() => observedDecisionViewOf(smuggled, analyzed)).toThrow(AnalyzerCatalogIntegrityError);
  });

  it("a forged brand object is refused too", () => {
    const forged = { registrations: DUPLICATE_SPEC } as unknown as ValidatedAnalyzerCatalog;
    expect(() => analyzerForSpec("rogue/assassination", forged)).toThrow(AnalyzerCatalogIntegrityError);
    expect(() => internalAnalyzerForSpec("rogue/assassination", forged)).toThrow(
      AnalyzerCatalogIntegrityError,
    );
    expect(() => publicAnalyzers(forged)).toThrow(AnalyzerCatalogIntegrityError);
  });

  it("duplicate registrations never resolve by first match: there is no validated catalog to look in", () => {
    for (const rows of [DUPLICATE_SPEC, [...DUPLICATE_SPEC].reverse()]) {
      const validation = validateAnalyzerCatalog(rows);
      expect(validation.ok).toBe(false);
    }
  });

  it("catalogFor validates injected rows and hands back the production catalog otherwise", () => {
    expect(catalogFor(undefined)).toEqual({ ok: true, catalog: PRODUCTION_CATALOG });
    expect(catalogFor(DUPLICATE_SPEC).ok).toBe(false);
    const injected = catalogFor([ASSASSINATION_REGISTRATION, FIXTURE]);
    expect(injected.ok).toBe(true);
    if (injected.ok) expect(isValidatedCatalog(injected.catalog)).toBe(true);
  });
});

describe("exposure separates registration from activation", () => {
  const catalog = requireValidatedCatalog([ASSASSINATION_REGISTRATION, FIXTURE]);

  it("public lookup cannot see the internal-only registration", () => {
    expect(analyzerForSpec("paladin/protection", catalog)).toBeNull();
    expect(publicAnalyzers(catalog).map((registration) => registration.analyzerId)).toEqual([
      ASSASSINATION_ANALYZER_ID,
    ]);
  });

  it("internal lookup can", () => {
    expect(internalAnalyzerForSpec("paladin/protection", catalog)?.analyzerId).toBe(
      INTERNAL_FIXTURE_ANALYZER_ID,
    );
  });

  it("lookup is independent of registration order", () => {
    const reversed = requireValidatedCatalog([FIXTURE, ASSASSINATION_REGISTRATION]);
    expect(analyzerForSpec("rogue/assassination", reversed)?.analyzerId).toBe(ASSASSINATION_ANALYZER_ID);
    expect(analyzerForSpec("paladin/protection", reversed)).toBeNull();
  });

  it("refuses a PUBLIC registration for an internal-only spec", () => {
    const leaked = [ASSASSINATION_REGISTRATION, internalFixtureRegistration({ exposure: "PUBLIC" })];
    const defects = defectsOf(leaked);
    expect(defects).toContain("PUBLIC_EXPOSURE_OF_INTERNAL_SPEC");
    expect(defects).toContain("PUBLIC_SET_DISAGREES_WITH_PARTITION");
    expect(defects).toContain("PUBLIC_SET_DISAGREES_WITH_IDENTITY_TABLE");
  });

  it("refuses a catalog whose public set drops a spec the identity table resolves", () => {
    const demoted = [{ ...ASSASSINATION_REGISTRATION, exposure: "INTERNAL_ONLY" as const }];
    const defects = defectsOf(demoted);
    expect(defects).toContain("PUBLIC_SET_DISAGREES_WITH_IDENTITY_TABLE");
    expect(defects).toContain("PUBLIC_SET_DISAGREES_WITH_PARTITION");
  });
});

describe("integrity defects", () => {
  it("duplicate specId fails", () => {
    expect(
      defectsOf([ASSASSINATION_REGISTRATION, { ...ASSASSINATION_REGISTRATION, analyzerId: "second" }]),
    ).toContain("DUPLICATE_SPEC_ID");
  });

  it("duplicate analyzerId fails", () => {
    expect(
      defectsOf([
        ASSASSINATION_REGISTRATION,
        internalFixtureRegistration({ analyzerId: ASSASSINATION_ANALYZER_ID }),
      ]),
    ).toContain("DUPLICATE_ANALYZER_ID");
  });

  it("an unknown spec id fails", () => {
    const unknown = { ...FIXTURE, specId: "fake/unrelated" as AnalyzerRegistration["specId"] };
    expect(defectsOf([ASSASSINATION_REGISTRATION, unknown])).toContain("UNKNOWN_SPEC_ID");
  });

  it("a capability defect fails the catalog", () => {
    const broken = internalFixtureRegistration({
      capabilities: [
        {
          capabilityId: "x",
          domain: "ACTIVE_MITIGATION",
          requirements: {
            scope: "PLAYER_CONTEXT",
            resources: [],
            evidenceCategories: [],
            targetModel: "PER_OBSERVED_CAST",
          },
        },
      ],
    });
    expect(defectsOf([ASSASSINATION_REGISTRATION, broken])).toContain("INVALID_CAPABILITY");
  });
});

describe("the service treats registry corruption as an integrity error", () => {
  const fight = m5d2Fight();
  const identity: FightIdentity = {
    report: { code: fight.report.code, revision: fight.report.revision, startTime: 0, endTime: 1 },
    data: fight.data,
    fight: {
      id: fight.fight.id,
      name: fight.fight.name,
      encounterId: fight.fight.encounterId,
      difficulty: fight.fight.difficulty,
      startTime: fight.fight.startTimeMs,
      endTime: fight.fight.endTimeMs,
    },
    player: { sourceId: M5D2_ACTOR, name: "Fixtureplayer", className: "Rogue", specName: "Assassination" },
  };
  const request = { reportCode: fight.report.code, fightId: fight.fight.id, sourceId: M5D2_ACTOR };

  function deps(registry: readonly AnalyzerRegistration[]) {
    const preflight = vi.fn<PreflightPort>(async () => ({ ok: true, identity, rateLimit: undefined }));
    const ingest = vi.fn<CombatIngestionPort>(async () => ({ ok: true, fight, rateLimit: undefined }));
    const serviceDeps: AnalysisServiceDeps = { env: MCP_TEST_ENV, preflight, ingest, registry };
    return { serviceDeps, preflight, ingest };
  }

  it("reports INTERNAL_ERROR, never SPEC_NOT_SUPPORTED, and spends no Warcraft Logs request", async () => {
    const { serviceDeps, preflight, ingest } = deps([
      ASSASSINATION_REGISTRATION,
      { ...ASSASSINATION_REGISTRATION, analyzerId: "second" },
    ]);
    const result = await analyzeFight(request, serviceDeps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INTERNAL_ERROR");
    expect(result.error.message).toContain("DUPLICATE_SPEC_ID");
    expect(result.error.message).not.toContain("SPEC_NOT_SUPPORTED");
    expect(preflight).not.toHaveBeenCalled();
    expect(ingest).not.toHaveBeenCalled();
  });

  it("re-validates an injected catalog on every request, so a mutation between requests is caught", async () => {
    const rows: AnalyzerRegistration[] = [ASSASSINATION_REGISTRATION];
    const { serviceDeps, ingest } = deps(rows);
    const first = await analyzeFight(request, serviceDeps);
    expect(first.ok).toBe(true);
    expect(ingest).toHaveBeenCalledTimes(1);

    rows.push({ ...ASSASSINATION_REGISTRATION, analyzerId: "second" });
    const second = await analyzeFight(request, serviceDeps);
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.error.code).toBe("INTERNAL_ERROR");
    expect(ingest).toHaveBeenCalledTimes(1);
  });

  it("is deterministic across calls", async () => {
    const corrupt = [ASSASSINATION_REGISTRATION, { ...ASSASSINATION_REGISTRATION, analyzerId: "second" }];
    const first = await analyzeFight(request, deps(corrupt).serviceDeps);
    const second = await analyzeFight(request, deps(corrupt).serviceDeps);
    expect(second).toEqual(first);
  });
});
