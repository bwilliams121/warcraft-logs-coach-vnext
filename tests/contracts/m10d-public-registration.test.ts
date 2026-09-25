/**
 * M10-D: Protection Paladin is public at every site that must agree, the
 * catalog helper tests use cannot produce an incomplete public set, and the
 * public descriptions say exactly what Protection analysis is — and is not.
 *
 * THE FIVE SITES
 *
 *     1. src/findings/spec-id.ts              PUBLIC_SPEC_IDS / INTERNAL_ONLY_SPEC_IDS
 *     2. src/contracts/analysis-contract.ts   the contract's own `specId` enum
 *     3. src/services/spec-identity.ts        SUPPORTED_SPEC_IDENTITIES
 *     4. src/specs/paladin/protection/spec.ts `satisfies PublicSpecId`
 *     5. src/specs/paladin/protection/registration.ts   exposure: "PUBLIC"
 *
 * Sites 1, 2 and 4 are held together by the compiler; 1, 3 and 5 by catalog
 * validation at module load. This file pins the resulting state and drives
 * the runtime half of the partial-move matrix through `validateAnalyzerCatalog`
 * over constructed rows. The compile-time half cannot be executed by a test
 * and is documented in `src/findings/spec-id.ts`.
 */

import { describe, expect, it } from "vitest";

import { PUBLIC_SPEC_IDS as CONTRACT_PUBLIC_SPEC_IDS } from "../../src/contracts/analysis-contract.js";
import { INTERNAL_ONLY_SPEC_IDS, PUBLIC_SPEC_IDS, SPEC_IDS } from "../../src/findings/spec-id.js";
import { analyzeToolDescription } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { raidNightToolDescription } from "../../src/mcp/tools/analyze-raid-night.js";
import {
  ANALYZER_REGISTRATIONS,
  AnalyzerCatalogIntegrityError,
  ENABLED_ANALYZERS,
  PUBLIC_SPECIALIZATION_DESCRIPTIONS,
  SUPPORTED_SPECIALIZATIONS_SENTENCE,
  ENABLED_ANALYSIS_REQUIREMENTS,
  validateAnalyzerCatalog,
  type AnalyzerRegistration,
} from "../../src/services/analyzer-registry.js";
import { SUPPORTED_SPEC_IDENTITIES } from "../../src/services/spec-identity.js";
import { PROTECTION_PALADIN_REGISTRATION } from "../../src/specs/paladin/protection/registration.js";
import {
  PROTECTION_PALADIN_ANALYZER_ID,
  PROTECTION_PALADIN_SPEC_ID,
} from "../../src/specs/paladin/protection/spec.js";
import { ASSASSINATION_REGISTRATION } from "../../src/specs/rogue/assassination/registration.js";
import {
  countedProductionCatalog,
  productionCatalogWith,
  productionRegistrationFor,
} from "../support/catalog.js";
import { CURRENT_UNSUPPORTED_SUBJECT } from "../support/unsupported-subject.js";

function defectsOf(rows: readonly AnalyzerRegistration[]): readonly string[] {
  const validation = validateAnalyzerCatalog(rows);
  return validation.ok ? [] : validation.defects.map((defect) => defect.defect);
}

describe("the five sites agree", () => {
  it("public partition: the four public ids since M11-B12; internal-only: Brewmaster Monk since M11-C2", () => {
    expect([...PUBLIC_SPEC_IDS]).toEqual([
      "rogue/assassination",
      "paladin/protection",
      "paladin/retribution",
      "deathknight/blood",
    ]);
    expect([...INTERNAL_ONLY_SPEC_IDS]).toEqual(["monk/brewmaster"]);
    expect([...SPEC_IDS].sort()).toEqual([...PUBLIC_SPEC_IDS, ...INTERNAL_ONLY_SPEC_IDS].sort());
  });

  it("the contract enum equals the partition", () => {
    expect([...CONTRACT_PUBLIC_SPEC_IDS].sort()).toEqual([...PUBLIC_SPEC_IDS].sort());
  });

  it("the identity table resolves exactly the public ids, each to itself", () => {
    expect(Object.entries(SUPPORTED_SPEC_IDENTITIES)).toEqual([
      ["rogue/assassination", "rogue/assassination"],
      ["paladin/protection", "paladin/protection"],
      ["paladin/retribution", "paladin/retribution"],
      ["deathknight/blood", "deathknight/blood"],
    ]);
  });

  it("the specialization's id constant is the public id", () => {
    expect(PROTECTION_PALADIN_SPEC_ID).toBe("paladin/protection");
    expect(PUBLIC_SPEC_IDS as readonly string[]).toContain(PROTECTION_PALADIN_SPEC_ID);
  });

  it("the registration is PUBLIC and the catalog carries exactly four enabled analyzers", () => {
    expect(PROTECTION_PALADIN_REGISTRATION.exposure).toBe("PUBLIC");
    expect(ASSASSINATION_REGISTRATION.exposure).toBe("PUBLIC");
    // M11-A4 put a third, INTERNAL_ONLY row in the catalog, NOT among the
    // enabled (public) analyzers; M11-A5 made it PUBLIC by the same
    // five-site move this file pins for Protection. M11-B2 put a fourth,
    // INTERNAL_ONLY row in — the Blood Death Knight measurement slice —
    // again NOT among the enabled analyzers, and M11-B12 made it PUBLIC by
    // that same move after ten slices and a promotion-readiness audit.
    // M11-C2 put a fifth, INTERNAL_ONLY row in — the Brewmaster Monk
    // measurement slice — NOT among the enabled analyzers.
    expect(ANALYZER_REGISTRATIONS.map((row) => [row.specId, row.exposure])).toEqual([
      ["rogue/assassination", "PUBLIC"],
      ["paladin/protection", "PUBLIC"],
      ["paladin/retribution", "PUBLIC"],
      ["deathknight/blood", "PUBLIC"],
      ["monk/brewmaster", "INTERNAL_ONLY"],
    ]);
    expect(ENABLED_ANALYZERS.map((row) => row.analyzerId)).toEqual([
      ASSASSINATION_REGISTRATION.analyzerId,
      PROTECTION_PALADIN_ANALYZER_ID,
      "paladin-retribution-observed-decisions",
      "deathknight-blood-observed-decisions",
    ]);
    expect(ENABLED_ANALYSIS_REQUIREMENTS.map((requirement) => requirement.analyzerId)).toEqual(
      ENABLED_ANALYZERS.map((row) => row.analyzerId),
    );
  });
});

describe("partial movement fails at catalog validation (the runtime half of the matrix)", () => {
  it("exposure not moved: an INTERNAL_ONLY Protection row disagrees with the partition and the identity table", () => {
    const defects = defectsOf([
      ASSASSINATION_REGISTRATION,
      { ...PROTECTION_PALADIN_REGISTRATION, exposure: "INTERNAL_ONLY" },
    ]);
    expect(defects).toContain("PUBLIC_SET_DISAGREES_WITH_PARTITION");
    expect(defects).toContain("PUBLIC_SET_DISAGREES_WITH_IDENTITY_TABLE");
  });

  it("registration not present: a catalog without the Protection row is refused", () => {
    const defects = defectsOf([ASSASSINATION_REGISTRATION]);
    expect(defects).toContain("PUBLIC_SET_DISAGREES_WITH_PARTITION");
    expect(defects).toContain("PUBLIC_SET_DISAGREES_WITH_IDENTITY_TABLE");
  });

  it("the production catalog itself validates at module load, so the deployed build cannot start half-moved", () => {
    expect(validateAnalyzerCatalog(ANALYZER_REGISTRATIONS).ok).toBe(true);
    expect(() => {
      const validation = validateAnalyzerCatalog([ASSASSINATION_REGISTRATION]);
      if (!validation.ok) throw new AnalyzerCatalogIntegrityError(validation.defects);
    }).toThrow(AnalyzerCatalogIntegrityError);
  });
});

describe("the complete-catalog helper", () => {
  it("returns every production row, in production order, with the named row replaced", () => {
    const replacement = {
      ...productionRegistrationFor("paladin/protection"),
      analyzerId: "observed-protection",
    };
    const rows = productionCatalogWith(replacement);
    expect(rows.map((row) => row.specId)).toEqual(ANALYZER_REGISTRATIONS.map((row) => row.specId));
    expect(rows.find((row) => row.specId === "paladin/protection")?.analyzerId).toBe("observed-protection");
    expect(rows.find((row) => row.specId === "rogue/assassination")).toBe(ASSASSINATION_REGISTRATION);
    expect(validateAnalyzerCatalog(rows).ok).toBe(true);
  });

  it("with no replacement it is the production catalog", () => {
    expect(productionCatalogWith()).toEqual([...ANALYZER_REGISTRATIONS]);
  });

  it("refuses a replacement for a specialization the production catalog does not carry", () => {
    const foreign = {
      ...productionRegistrationFor("paladin/protection"),
      specId: CURRENT_UNSUPPORTED_SUBJECT.observedSpecId as AnalyzerRegistration["specId"],
    };
    expect(() => productionCatalogWith(foreign)).toThrow(/no production registration to replace/);
  });

  it("refuses two replacements for one specialization", () => {
    const one = productionRegistrationFor("paladin/protection");
    expect(() => productionCatalogWith(one, { ...one, analyzerId: "again" })).toThrow(/replaced twice/);
  });

  it("refuses a replacement that would not validate, at the call site", () => {
    const demoted = {
      ...productionRegistrationFor("paladin/protection"),
      exposure: "INTERNAL_ONLY" as const,
    };
    expect(() => productionCatalogWith(demoted)).toThrow(AnalyzerCatalogIntegrityError);
  });

  it("the counted catalog is complete and starts every count at zero", () => {
    const counted = countedProductionCatalog();
    expect(validateAnalyzerCatalog(counted.registry).ok).toBe(true);
    expect(counted.calls).toEqual({
      [ASSASSINATION_REGISTRATION.analyzerId]: 0,
      [PROTECTION_PALADIN_ANALYZER_ID]: 0,
      "paladin-retribution-observed-decisions": 0,
      "deathknight-blood-observed-decisions": 0,
      "monk-brewmaster-observed-decisions": 0,
    });
  });
});

describe("the public descriptions state Protection's limits and claim nothing beyond them", () => {
  // The supported-specialization sentence is DERIVED from the production
  // catalog's PUBLIC registrations (M11-A1) and injected into both
  // descriptions by the composition root. The tests below read the same
  // derivation, and `m11a-supported-specializations-derivation` pins what the
  // derivation itself must say.
  const SUPPORT_SENTENCE = SUPPORTED_SPECIALIZATIONS_SENTENCE;
  const ANALYZE_TOOL_DESCRIPTION = analyzeToolDescription(PUBLIC_SPECIALIZATION_DESCRIPTIONS);
  const RAID_NIGHT_TOOL_DESCRIPTION = raidNightToolDescription(PUBLIC_SPECIALIZATION_DESCRIPTIONS);
  const REQUIRED_MEANINGS = [
    "OFFENSIVE global-cooldown decisions",
    // Grammar differs by tool ("It does NOT" / "They do NOT"); the meaning does not.
    "NOT evaluate defensive cooldowns, active mitigation, self-healing,",
    "interrupts, or survival",
    "Shield of the Righteous are excluded,",
    "not judged",
    "not that a mistake was made",
    "SPEC_NOT_SUPPORTED",
  ];
  /**
   * Claims neither description may make. Each is an unambiguous positive
   * claim phrase, never a bare word: "optimal" legitimately appears inside
   * "does NOT mean correct, optimal, ideal …", and a parser forbidding the
   * word regardless of context would be the brittle thing this test avoids.
   */
  const FORBIDDEN_CLAIMS = [
    "evaluates defensive",
    "evaluates active mitigation",
    "evaluates mitigation",
    "evaluates self-healing",
    "evaluates interrupts",
    "evaluates survival",
    "full tank rotation",
    "complete rotation",
    "complete tank",
    "is optimal",
    "was optimal",
    "played optimally",
    "played correctly",
    "correct play",
    "mistake-free play",
    "maximal DPS",
    "maximal HPS",
    "mitigation correctness",
    "survival causality",
    "Only Assassination Rogue",
    "currently the ONLY",
  ];

  for (const [label, description] of [
    ["analyze_warcraft_log", ANALYZE_TOOL_DESCRIPTION],
    ["analyze_raid_night", RAID_NIGHT_TOOL_DESCRIPTION],
  ] as const) {
    it(`${label}: names both supported specializations and every Protection limit`, () => {
      // Whitespace-flattened: the descriptions are wrapped for a model's eyes,
      // and a line break inside a phrase is not a change of meaning.
      const flattened = description.replace(/\s+/g, " ");
      expect(flattened).toContain(SUPPORT_SENTENCE);
      for (const meaning of REQUIRED_MEANINGS) expect(flattened, meaning).toContain(meaning);
    });

    it(`${label}: makes no forbidden claim`, () => {
      const flattened = description.replace(/\s+/g, " ");
      for (const claim of FORBIDDEN_CLAIMS) expect(flattened, claim).not.toContain(claim);
    });

    it(`${label}: still says MATCH is authority-compatible only`, () => {
      expect(description).toContain("MATCH means authority-compatible only");
    });
  }
});
