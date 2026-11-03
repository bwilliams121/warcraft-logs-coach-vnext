/**
 * M10-A: analyzer registration, exposure and catalog integrity — as it stands
 * after M10-D made both registrations PUBLIC.
 *
 * Three states that must stay distinct — known spec, registered analyzer,
 * publicly enabled analyzer — and the integrity rules that keep a catalog
 * coherent. A validated catalog is a frozen snapshot behind a runtime brand;
 * every lookup accepts only that. Registry corruption is a configuration
 * defect the service reports as INTERNAL_ERROR; it is never dressed as
 * SPEC_NOT_SUPPORTED.
 *
 * WHAT CHANGED IN M10-D. The internal-only set is empty, so the proofs that
 * used a test-owned INTERNAL_ONLY row inside a validated catalog have no
 * subject: such a row leaves an injected catalog's public set incomplete, and
 * the registry refuses it — which is now itself one of the proofs below. The
 * exposure vocabulary and lookups are retained as dormant architecture; the
 * immutability, integrity and service-refusal proofs run over the two real
 * registrations.
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
import { PROTECTION_PALADIN_REGISTRATION } from "../../src/specs/paladin/protection/registration.js";
import { PROTECTION_PALADIN_ANALYZER_ID } from "../../src/specs/paladin/protection/spec.js";
import { RETRIBUTION_PALADIN_REGISTRATION } from "../../src/specs/paladin/retribution/registration.js";
import { BLOOD_DEATH_KNIGHT_REGISTRATION } from "../../src/specs/deathknight/blood/registration.js";
import { BREWMASTER_MONK_REGISTRATION } from "../../src/specs/monk/brewmaster/registration.js";
import { AUGMENTATION_EVOKER_REGISTRATION } from "../../src/specs/evoker/augmentation/registration.js";
import { RETRIBUTION_PALADIN_ANALYZER_ID } from "../../src/specs/paladin/retribution/spec.js";
import { MCP_TEST_ENV } from "../support/analysis-transports.js";
import { analyzedFightAnalysis } from "../support/aggregation-fixture.js";
import { productionCatalogWith } from "../support/catalog.js";
import { fixtureRegistration } from "../support/fixture-registration.js";
import { M5D2_ACTOR, m5d2Fight } from "../support/m5d2-fixture.js";

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

  it("carries six PUBLIC registrations — Assassination, both Paladins, Blood Death Knight (since M11-B12), Brewmaster Monk (since M11-C4j) and Augmentation Evoker (INTERNAL_ONLY in M13-E, PUBLIC since M13-F) — and, since HEAL-A, Restoration Shaman INTERNAL_ONLY", () => {
    expect(
      PRODUCTION_CATALOG.registrations.map((registration) => [
        registration.analyzerId,
        registration.specId,
        registration.exposure,
      ]),
    ).toEqual([
      [ASSASSINATION_ANALYZER_ID, "rogue/assassination", "PUBLIC"],
      [PROTECTION_PALADIN_ANALYZER_ID, "paladin/protection", "PUBLIC"],
      [RETRIBUTION_PALADIN_ANALYZER_ID, "paladin/retribution", "PUBLIC"],
      ["deathknight-blood-observed-decisions", "deathknight/blood", "PUBLIC"],
      ["monk-brewmaster-observed-decisions", "monk/brewmaster", "PUBLIC"],
      ["evoker-augmentation-support-observations", "evoker/augmentation", "PUBLIC"],
      ["shaman-restoration-healer-findings", "shaman/restoration", "INTERNAL_ONLY"],
    ]);
    // The public set is DERIVED from the rows' exposure, never hand-listed:
    // all six rows from M13-F until HEAL-A (Augmentation was the INTERNAL_ONLY
    // row in M13-E), six of seven since HEAL-A, and the derivation is what drops
    // the INTERNAL_ONLY Restoration Shaman row.
    expect(ENABLED_ANALYZERS).toEqual(publicAnalyzers(PRODUCTION_CATALOG));
    expect(ENABLED_ANALYZERS).toHaveLength(6);
    expect(ENABLED_ANALYZERS.map((analyzer) => analyzer.specId)).toEqual([
      "rogue/assassination",
      "paladin/protection",
      "paladin/retribution",
      "deathknight/blood",
      "monk/brewmaster",
      "evoker/augmentation",
    ]);
  });

  it("both lookups resolve each Paladin analyzer, and to the same row", () => {
    expect(internalAnalyzerForSpec("paladin/protection")?.exposure).toBe("PUBLIC");
    expect(analyzerForSpec("paladin/protection")?.analyzerId).toBe(PROTECTION_PALADIN_ANALYZER_ID);
    expect(analyzerForSpec("paladin/protection")).toBe(internalAnalyzerForSpec("paladin/protection"));
    expect(analyzerForSpec("rogue/assassination")).toBe(internalAnalyzerForSpec("rogue/assassination"));
    // M11-A5: the internal lookup was the only one that found Retribution in M11-A4.
    expect(internalAnalyzerForSpec("paladin/retribution")?.exposure).toBe("PUBLIC");
    expect(analyzerForSpec("paladin/retribution")?.analyzerId).toBe(RETRIBUTION_PALADIN_ANALYZER_ID);
    expect(analyzerForSpec("paladin/retribution")).toBe(internalAnalyzerForSpec("paladin/retribution"));
  });

  it("is frozen at every level a validation depends on", () => {
    for (const registration of PRODUCTION_CATALOG.registrations) {
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
    }
    // The raw registration list and the rows the specs wrote are frozen too.
    expect(Object.isFrozen(ANALYZER_REGISTRATIONS)).toBe(true);
    expect(Object.isFrozen(ASSASSINATION_REGISTRATION)).toBe(true);
    expect(Object.isFrozen(PROTECTION_PALADIN_REGISTRATION)).toBe(true);
  });
});

describe("a validated catalog cannot be mutated into an invalid one", () => {
  const catalog = requireValidatedCatalog(ANALYZER_REGISTRATIONS);
  const paladin = catalog.registrations.find((registration) => registration.specId === "paladin/protection");
  const rogue = catalog.registrations.find((registration) => registration.specId === "rogue/assassination");
  if (paladin === undefined || rogue === undefined) throw new Error("catalog incomplete");

  it("the registration list cannot grow a duplicate", () => {
    const rows = catalog.registrations as AnalyzerRegistration[];
    expect(() => rows.push({ ...rogue, analyzerId: "second" })).toThrow(TypeError);
    expect(() => rows.push({ ...paladin, analyzerId: "third" })).toThrow(TypeError);
    expect(catalog.registrations).toHaveLength(7);
  });

  it("exposure cannot be flipped back to INTERNAL_ONLY", () => {
    expect(() => {
      (paladin as { exposure: string }).exposure = "INTERNAL_ONLY";
    }).toThrow(TypeError);
    expect(paladin.exposure).toBe("PUBLIC");
    expect(analyzerForSpec("paladin/protection", catalog)?.analyzerId).toBe(PROTECTION_PALADIN_ANALYZER_ID);
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
    // Protection binds OFFENSIVE_ROTATION only; its declared tank domains stay unbound.
    expect(paladin.authority.forDomain("OFFENSIVE_ROTATION").outcome).toBe("AUTHORITY_AVAILABLE");
    expect(paladin.authority.forDomain("ACTIVE_MITIGATION").outcome).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
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
    const original = mutableCopy(PROTECTION_PALADIN_REGISTRATION);
    const rows: AnalyzerRegistration[] = [
      ASSASSINATION_REGISTRATION,
      original,
      RETRIBUTION_PALADIN_REGISTRATION,
      BLOOD_DEATH_KNIGHT_REGISTRATION,
      BREWMASTER_MONK_REGISTRATION,
      AUGMENTATION_EVOKER_REGISTRATION,
    ];
    const validated = requireValidatedCatalog(rows);

    (original as { exposure: string }).exposure = "INTERNAL_ONLY";
    (original.capabilities[0]?.requirements.resources as string[]).length = 0;
    (original.authorityBindings as unknown[]).push(ASSASSINATION_OFFENSIVE_AUTHORITY);
    rows.push({ ...ASSASSINATION_REGISTRATION, analyzerId: "second" });

    expect(analyzerForSpec("paladin/protection", validated)?.exposure).toBe("PUBLIC");
    expect(analyzerForSpec("paladin/protection", validated)?.requirement.includeResources).toBe(true);
    expect(analyzerForSpec("paladin/protection", validated)?.authorityBindings).toHaveLength(1);
    expect(validated.registrations).toHaveLength(6);
    // And re-validating the mutated rows now refuses them: a duplicate, and a
    // demoted Protection row that leaves the public set incomplete.
    const defects = defectsOf(rows);
    expect(defects).toContain("DUPLICATE_SPEC_ID");
    expect(defects).toContain("PUBLIC_SET_DISAGREES_WITH_PARTITION");
    expect(defects).toContain("PUBLIC_SET_DISAGREES_WITH_IDENTITY_TABLE");
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
    const validated = requireValidatedCatalog(productionCatalogWith(lying));
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
    PROTECTION_PALADIN_REGISTRATION,
    RETRIBUTION_PALADIN_REGISTRATION,
    BLOOD_DEATH_KNIGHT_REGISTRATION,
    BREWMASTER_MONK_REGISTRATION,
    AUGMENTATION_EVOKER_REGISTRATION,
  ];
  const DUPLICATE_ANALYZER = [
    ASSASSINATION_REGISTRATION,
    { ...PROTECTION_PALADIN_REGISTRATION, analyzerId: ASSASSINATION_ANALYZER_ID },
  ];
  /** Since M10-D: a catalog that forgot a public registration is incomplete, not smaller. */
  const INCOMPLETE_PUBLIC_SET = [ASSASSINATION_REGISTRATION];
  const IDENTITY_DISAGREEMENT = [
    { ...ASSASSINATION_REGISTRATION, exposure: "INTERNAL_ONLY" as const },
    PROTECTION_PALADIN_REGISTRATION,
    RETRIBUTION_PALADIN_REGISTRATION,
    BLOOD_DEATH_KNIGHT_REGISTRATION,
    BREWMASTER_MONK_REGISTRATION,
    AUGMENTATION_EVOKER_REGISTRATION,
  ];
  const AUTHORITY_MISMATCH = [
    {
      ...ASSASSINATION_REGISTRATION,
      authorityBindings: [{ ...ASSASSINATION_OFFENSIVE_AUTHORITY, artifactRevision: "simc-deadbeef-9" }],
    },
    PROTECTION_PALADIN_REGISTRATION,
  ];
  const CORRUPT = [
    ["duplicate spec ids", DUPLICATE_SPEC],
    ["duplicate analyzer ids", DUPLICATE_ANALYZER],
    ["incomplete public set", INCOMPLETE_PUBLIC_SET],
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
    expect(catalogFor(INCOMPLETE_PUBLIC_SET).ok).toBe(false);
    const injected = catalogFor([...ANALYZER_REGISTRATIONS].reverse());
    expect(injected.ok).toBe(true);
    if (injected.ok) expect(isValidatedCatalog(injected.catalog)).toBe(true);
  });
});

describe("the public set is one promise across the partition, the identity table and the catalog", () => {
  it("an injected catalog missing a public registration is refused, in either order and either omission", () => {
    // THE M10-D PROOF. A catalog that carries only one public row is not a
    // way to observe one analyzer; it is an incomplete dispatch table over
    // which a request for the missing specialization would read
    // SPEC_NOT_SUPPORTED. The registry refuses it before a request is served.
    for (const rows of [
      [ASSASSINATION_REGISTRATION],
      [PROTECTION_PALADIN_REGISTRATION],
      [RETRIBUTION_PALADIN_REGISTRATION],
      [ASSASSINATION_REGISTRATION, PROTECTION_PALADIN_REGISTRATION],
      [ASSASSINATION_REGISTRATION, RETRIBUTION_PALADIN_REGISTRATION],
      [PROTECTION_PALADIN_REGISTRATION, RETRIBUTION_PALADIN_REGISTRATION],
    ]) {
      const defects = defectsOf(rows);
      expect(defects).toContain("PUBLIC_SET_DISAGREES_WITH_PARTITION");
      expect(defects).toContain("PUBLIC_SET_DISAGREES_WITH_IDENTITY_TABLE");
    }
  });

  it("demoting any public registration to INTERNAL_ONLY is refused", () => {
    for (const demoted of [
      [
        { ...ASSASSINATION_REGISTRATION, exposure: "INTERNAL_ONLY" as const },
        PROTECTION_PALADIN_REGISTRATION,
        RETRIBUTION_PALADIN_REGISTRATION,
        BLOOD_DEATH_KNIGHT_REGISTRATION,
        BREWMASTER_MONK_REGISTRATION,
        AUGMENTATION_EVOKER_REGISTRATION,
      ],
      [
        ASSASSINATION_REGISTRATION,
        { ...PROTECTION_PALADIN_REGISTRATION, exposure: "INTERNAL_ONLY" as const },
        RETRIBUTION_PALADIN_REGISTRATION,
        BLOOD_DEATH_KNIGHT_REGISTRATION,
        BREWMASTER_MONK_REGISTRATION,
        AUGMENTATION_EVOKER_REGISTRATION,
      ],
      [
        ASSASSINATION_REGISTRATION,
        PROTECTION_PALADIN_REGISTRATION,
        { ...RETRIBUTION_PALADIN_REGISTRATION, exposure: "INTERNAL_ONLY" as const },
        BLOOD_DEATH_KNIGHT_REGISTRATION,
        BREWMASTER_MONK_REGISTRATION,
        AUGMENTATION_EVOKER_REGISTRATION,
      ],
      [
        ASSASSINATION_REGISTRATION,
        PROTECTION_PALADIN_REGISTRATION,
        RETRIBUTION_PALADIN_REGISTRATION,
        { ...BLOOD_DEATH_KNIGHT_REGISTRATION, exposure: "INTERNAL_ONLY" as const },
        BREWMASTER_MONK_REGISTRATION,
        AUGMENTATION_EVOKER_REGISTRATION,
      ],
      [
        ASSASSINATION_REGISTRATION,
        PROTECTION_PALADIN_REGISTRATION,
        RETRIBUTION_PALADIN_REGISTRATION,
        BLOOD_DEATH_KNIGHT_REGISTRATION,
        { ...BREWMASTER_MONK_REGISTRATION, exposure: "INTERNAL_ONLY" as const },
        AUGMENTATION_EVOKER_REGISTRATION,
      ],
      [
        ASSASSINATION_REGISTRATION,
        PROTECTION_PALADIN_REGISTRATION,
        RETRIBUTION_PALADIN_REGISTRATION,
        BLOOD_DEATH_KNIGHT_REGISTRATION,
        BREWMASTER_MONK_REGISTRATION,
        { ...AUGMENTATION_EVOKER_REGISTRATION, exposure: "INTERNAL_ONLY" as const },
      ],
    ]) {
      const defects = defectsOf(demoted);
      expect(defects).toContain("PUBLIC_SET_DISAGREES_WITH_IDENTITY_TABLE");
      expect(defects).toContain("PUBLIC_SET_DISAGREES_WITH_PARTITION");
    }
  });

  it("lookup is independent of registration order", () => {
    const reversed = requireValidatedCatalog([
      AUGMENTATION_EVOKER_REGISTRATION,
      BREWMASTER_MONK_REGISTRATION,
      BLOOD_DEATH_KNIGHT_REGISTRATION,
      RETRIBUTION_PALADIN_REGISTRATION,
      PROTECTION_PALADIN_REGISTRATION,
      ASSASSINATION_REGISTRATION,
    ]);
    expect(analyzerForSpec("rogue/assassination", reversed)?.analyzerId).toBe(ASSASSINATION_ANALYZER_ID);
    expect(analyzerForSpec("paladin/protection", reversed)?.analyzerId).toBe(PROTECTION_PALADIN_ANALYZER_ID);
    expect(analyzerForSpec("paladin/retribution", reversed)?.analyzerId).toBe(
      RETRIBUTION_PALADIN_ANALYZER_ID,
    );
    expect(analyzerForSpec("deathknight/blood", reversed)?.analyzerId).toBe(
      "deathknight-blood-observed-decisions",
    );
    expect(analyzerForSpec("monk/brewmaster", reversed)?.analyzerId).toBe(
      "monk-brewmaster-observed-decisions",
    );
    expect(
      publicAnalyzers(reversed)
        .map((registration) => registration.specId)
        .sort(),
    ).toEqual(
      [
        "paladin/protection",
        "paladin/retribution",
        "rogue/assassination",
        "deathknight/blood",
        "monk/brewmaster",
        "evoker/augmentation",
      ].sort(),
    );
    expect(analyzerForSpec("evoker/augmentation", reversed)?.analyzerId).toBe(
      "evoker-augmentation-support-observations",
    );
  });

  it("the INTERNAL_ONLY Restoration Shaman row cannot be flipped PUBLIC, and is invisible to the public lookup (HEAL-A)", () => {
    expect(analyzerForSpec("shaman/restoration")).toBeNull();
    expect(internalAnalyzerForSpec("shaman/restoration")?.exposure).toBe("INTERNAL_ONLY");
    const flipped = ANALYZER_REGISTRATIONS.map((registration) =>
      registration.specId === "shaman/restoration"
        ? { ...registration, exposure: "PUBLIC" as const }
        : registration,
    );
    expect(defectsOf(flipped)).toContain("PUBLIC_EXPOSURE_OF_INTERNAL_SPEC");
  });

  it("a PUBLIC row for an unknown id is still refused by name", () => {
    // An id the build does not know at all is refused as UNKNOWN_SPEC_ID
    // whatever its exposure says.
    const unknown = {
      ...fixtureRegistration({ exposure: "PUBLIC" }),
      specId: "warrior/arms" as AnalyzerRegistration["specId"],
    };
    expect(defectsOf([...ANALYZER_REGISTRATIONS, unknown])).toContain("UNKNOWN_SPEC_ID");
  });
});

describe("integrity defects", () => {
  it("duplicate specId fails", () => {
    expect(
      defectsOf([
        ASSASSINATION_REGISTRATION,
        { ...ASSASSINATION_REGISTRATION, analyzerId: "second" },
        PROTECTION_PALADIN_REGISTRATION,
      ]),
    ).toContain("DUPLICATE_SPEC_ID");
  });

  it("duplicate analyzerId fails", () => {
    expect(
      defectsOf([
        ASSASSINATION_REGISTRATION,
        { ...PROTECTION_PALADIN_REGISTRATION, analyzerId: ASSASSINATION_ANALYZER_ID },
      ]),
    ).toContain("DUPLICATE_ANALYZER_ID");
  });

  it("an unknown spec id fails", () => {
    const unknown = { ...fixtureRegistration(), specId: "fake/unrelated" as AnalyzerRegistration["specId"] };
    expect(defectsOf([...ANALYZER_REGISTRATIONS, unknown])).toContain("UNKNOWN_SPEC_ID");
  });

  it("a capability defect fails the catalog", () => {
    const broken: AnalyzerRegistration = {
      ...PROTECTION_PALADIN_REGISTRATION,
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
    };
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
      PROTECTION_PALADIN_REGISTRATION,
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

  it("refuses an incomplete injected catalog the same way, even for the specialization it does carry", async () => {
    // The Rogue request could have been served by the one row present. It is
    // not: a table that forgot Protection is a defect, and a defect is not
    // served by whichever rows survived it.
    const { serviceDeps, preflight, ingest } = deps([ASSASSINATION_REGISTRATION]);
    const result = await analyzeFight(request, serviceDeps);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("INTERNAL_ERROR");
    expect(result.error.message).toContain("PUBLIC_SET_DISAGREES_WITH_PARTITION");
    expect(preflight).not.toHaveBeenCalled();
    expect(ingest).not.toHaveBeenCalled();
  });

  it("re-validates an injected catalog on every request, so a mutation between requests is caught", async () => {
    const rows: AnalyzerRegistration[] = [...ANALYZER_REGISTRATIONS];
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
    const corrupt = [
      ASSASSINATION_REGISTRATION,
      { ...ASSASSINATION_REGISTRATION, analyzerId: "second" },
      PROTECTION_PALADIN_REGISTRATION,
    ];
    const first = await analyzeFight(request, deps(corrupt).serviceDeps);
    const second = await analyzeFight(request, deps(corrupt).serviceDeps);
    expect(second).toEqual(first);
  });
});
