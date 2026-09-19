/**
 * M11-B2: the Blood Death Knight registration — identity, INTERNAL_ONLY
 * exposure, the one authority it binds, the six domains it declares, the
 * datasets it loads, and its isolation from every public surface.
 *
 * The negative half is the point of this file: a public request for the
 * real Blood subject still answers SPEC_NOT_SUPPORTED with zero analyzer
 * calls; the public spec list, the identity table, the public contract, the
 * supported-specializations sentence and both MCP tool descriptions are
 * exactly what they were before M11-B2; and nothing outside the Blood tree
 * names the specialization except the partition, the registry row and the
 * pinned data. An INTERNAL_ONLY analyzer that leaked into a public surface
 * would be a promotion nobody reviewed.
 */

import { describe, expect, it } from "vitest";

import { PUBLIC_SPEC_IDS as CONTRACT_PUBLIC_SPEC_IDS } from "../../src/contracts/analysis-contract.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import {
  INTERNAL_ONLY_SPEC_IDS,
  InternalSpecExposureError,
  isPublicSpecId,
  isSpecId,
  PUBLIC_SPEC_IDS,
  requirePublicSpecId,
} from "../../src/findings/spec-id.js";
import { analyzeToolDescription } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { raidNightToolDescription } from "../../src/mcp/tools/analyze-raid-night.js";
import { analyzeFight, type AnalysisServiceDeps } from "../../src/services/analysis-service.js";
import {
  analyzerForSpec,
  ENABLED_ANALYSIS_REQUIREMENTS,
  ENABLED_ANALYZERS,
  internalAnalyzerForSpec,
  PRODUCTION_CATALOG,
  PUBLIC_SPECIALIZATION_DESCRIPTIONS,
  publicAnalyzers,
  runAnalyzer,
  SUPPORTED_SPECIALIZATIONS_SENTENCE,
} from "../../src/services/analyzer-registry.js";
import { resolveSpecIdentity, SUPPORTED_SPEC_IDENTITIES } from "../../src/services/spec-identity.js";
import { rosterSpecialization } from "../../src/data/game/spec-roster.js";
import { pinnedBloodDeathKnightCooldowns } from "../../src/data/game/deathknight-blood-cooldowns.js";
import { pinnedBloodDeathKnightGcdSemantics } from "../../src/data/game/deathknight-blood-gcd-semantics.js";
import { pinnedBloodDeathKnightSpenderCosts } from "../../src/data/game/deathknight-blood-spender-costs.js";
import { pinnedBloodDeathKnightTalents } from "../../src/data/game/deathknight-blood-talents.js";
import {
  BLOOD_AUTHORITY_BINDINGS,
  BLOOD_CAPABILITIES,
  standaloneBloodAuthorityAccess,
} from "../../src/specs/deathknight/blood/authority-bindings.js";
import {
  BLOOD_DEATH_KNIGHT_AUTHORITY_IDENTITY,
  pinnedBloodDeathKnightAuthority,
} from "../../src/specs/deathknight/blood/pinned-authority.js";
import {
  BLOOD_DEATH_KNIGHT_MODULE,
  BLOOD_DEATH_KNIGHT_REGISTRATION,
  BLOOD_EXCLUSION_VIEW_PROJECTION,
  BLOOD_LIMITS,
} from "../../src/specs/deathknight/blood/registration.js";
import {
  BLOOD_DEATH_KNIGHT_ANALYZER_ID,
  BLOOD_DEATH_KNIGHT_DISPLAY_NAME,
  BLOOD_DEATH_KNIGHT_SPEC_ID,
} from "../../src/specs/deathknight/blood/spec.js";
import { BLOOD_ATOM_VOCABULARY } from "../../src/specs/deathknight/blood/vocabulary.js";
import { PUBLIC_EXCLUSION_REASONS } from "../../src/contracts/analysis-contract.js";
import { MCP_TEST_ENV } from "../support/analysis-transports.js";
import { countedProductionCatalog } from "../support/catalog.js";
import { corpusFight, corpusState } from "../support/corpus/fight.js";

const PIN = "33622e9d1662ff0e451691edf85a6b49cc9d11d9";
const BLOOD45 = "wcl-blood-death-knight-a7r6-rotational-45s";
const BLOOD = 14;

const SOURCES: Record<string, string> = import.meta.glob("../../src/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

describe("identity and partition", () => {
  it("coheres with the pinned roster: Blood Death Knight, specID 250, TANK", () => {
    expect(BLOOD_DEATH_KNIGHT_SPEC_ID).toBe("deathknight/blood");
    expect(BLOOD_DEATH_KNIGHT_MODULE.identity).toEqual({
      specId: "deathknight/blood",
      analyzerId: BLOOD_DEATH_KNIGHT_ANALYZER_ID,
      displayName: BLOOD_DEATH_KNIGHT_DISPLAY_NAME,
      wclClassName: "DeathKnight",
      wclSpecName: "Blood",
      simcSpecId: 250,
      role: "TANK",
    });
    expect(rosterSpecialization("deathknight/blood")).toMatchObject({
      simcSpecId: 250,
      role: "TANK",
      displayName: "Blood Death Knight",
    });
  });

  it("is INTERNAL_ONLY in the partition and ABSENT from the public contract and the identity table", () => {
    expect(isSpecId("deathknight/blood")).toBe(true);
    expect(isPublicSpecId("deathknight/blood")).toBe(false);
    expect([...INTERNAL_ONLY_SPEC_IDS]).toEqual(["deathknight/blood"]);
    expect(PUBLIC_SPEC_IDS as readonly string[]).not.toContain("deathknight/blood");
    expect(CONTRACT_PUBLIC_SPEC_IDS as readonly string[]).not.toContain("deathknight/blood");
    expect(() => requirePublicSpecId("deathknight/blood")).toThrow(InternalSpecExposureError);
    expect(SUPPORTED_SPEC_IDENTITIES).not.toHaveProperty("deathknight/blood");
    expect(resolveSpecIdentity({ className: "DeathKnight", specName: "Blood" })).toMatchObject({
      ok: false,
      reason: "UNSUPPORTED_SPECIALIZATION",
    });
    expect(BLOOD_DEATH_KNIGHT_MODULE.exposure).toBe("INTERNAL_ONLY");
    expect(BLOOD_DEATH_KNIGHT_REGISTRATION.exposure).toBe("INTERNAL_ONLY");
    expect(BLOOD_DEATH_KNIGHT_MODULE.supplementalAnalyses).toEqual([]);
  });

  it("is in the validated catalog for the INTERNAL lookup only, and in no public derivation", () => {
    expect(internalAnalyzerForSpec("deathknight/blood", PRODUCTION_CATALOG)?.analyzerId).toBe(
      BLOOD_DEATH_KNIGHT_ANALYZER_ID,
    );
    expect(internalAnalyzerForSpec("deathknight/blood", PRODUCTION_CATALOG)?.exposure).toBe("INTERNAL_ONLY");
    expect(analyzerForSpec("deathknight/blood", PRODUCTION_CATALOG)).toBeNull();
    expect(publicAnalyzers(PRODUCTION_CATALOG).map((row) => row.specId)).toEqual([
      "rogue/assassination",
      "paladin/protection",
      "paladin/retribution",
    ]);
    expect(ENABLED_ANALYZERS.map((row) => row.specId)).not.toContain("deathknight/blood");
    expect(ENABLED_ANALYSIS_REQUIREMENTS.map((requirement) => requirement.analyzerId)).not.toContain(
      BLOOD_DEATH_KNIGHT_ANALYZER_ID,
    );
    // The public prose is unchanged by an INTERNAL_ONLY row.
    expect(SUPPORTED_SPECIALIZATIONS_SENTENCE).toBe(
      "Supported specializations: Assassination Rogue, Protection Paladin and Retribution Paladin.",
    );
    expect(PUBLIC_SPECIALIZATION_DESCRIPTIONS.limits).toHaveLength(3);
    for (const description of [
      analyzeToolDescription(PUBLIC_SPECIALIZATION_DESCRIPTIONS),
      raidNightToolDescription(PUBLIC_SPECIALIZATION_DESCRIPTIONS),
    ]) {
      expect(description).not.toMatch(/death knight|deathknight|blood death/i);
      expect(description).not.toContain(BLOOD_LIMITS.analysis);
    }
  });

  it("projects every internal exclusion reason onto an existing public one — no new public reason", () => {
    for (const reason of Object.values(BLOOD_EXCLUSION_VIEW_PROJECTION)) {
      expect(PUBLIC_EXCLUSION_REASONS as readonly string[]).toContain(reason);
    }
    expect(BLOOD_EXCLUSION_VIEW_PROJECTION.OUTSIDE_FIRST_SLICE).toBe("OUTSIDE_SUPPORTED_SLICE");
    expect(BLOOD_EXCLUSION_VIEW_PROJECTION.MELEE_SWING).toBe("NON_GCD_ACTION");
  });
});

describe("authority and datasets", () => {
  it("binds exactly one SimulationCraft authority, to OFFENSIVE_ROTATION, at the shared pin, in its own file", () => {
    expect(
      BLOOD_AUTHORITY_BINDINGS.map((binding) => [binding.kind, binding.domain, binding.authorityId]),
    ).toEqual([["SIMC_APL", "OFFENSIVE_ROTATION", "SIMC_APL_DEATHKNIGHT_BLOOD"]]);
    expect(BLOOD_DEATH_KNIGHT_AUTHORITY_IDENTITY).toEqual({
      authorityId: "SIMC_APL_DEATHKNIGHT_BLOOD",
      artifactRevision: "simc-33622e9d-1",
      commitSha: PIN,
    });
    const loaded = pinnedBloodDeathKnightAuthority();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.authority.artifact.spec).toEqual({ className: "deathknight", specName: "blood" });
    expect(loaded.authority.artifact.provenance.sourcePath).toBe(
      "engine/class_modules/apl/apl_death_knight.cpp",
    );
  });

  it("the standalone access resolves exactly what the registration's access resolves, with ALL six domains declared", () => {
    const standalone = standaloneBloodAuthorityAccess();
    for (const domain of [
      "OFFENSIVE_ROTATION",
      "RESOURCE_SPENDING",
      "ACTIVE_MITIGATION",
      "DEFENSIVE_COOLDOWN",
      "SELF_HEALING",
      "INTERRUPT",
    ] as const) {
      expect(standalone.forDomain(domain).outcome).toBe(
        BLOOD_DEATH_KNIGHT_REGISTRATION.authority.forDomain(domain).outcome,
      );
      expect(standalone.forDomain(domain).outcome).toBe(
        domain === "OFFENSIVE_ROTATION" ? "AUTHORITY_AVAILABLE" : "NO_PINNED_AUTHORITY_FOR_DOMAIN",
      );
    }
  });

  it("every pinned Blood dataset loads at the same commit and revision", () => {
    const loads = [
      pinnedBloodDeathKnightTalents(),
      pinnedBloodDeathKnightGcdSemantics(),
      pinnedBloodDeathKnightCooldowns(),
      pinnedBloodDeathKnightSpenderCosts(),
    ];
    for (const load of loads) {
      expect(load.ok).toBe(true);
      if (!load.ok) continue;
      const provenance = ("artifact" in load ? load.artifact.provenance : null) as {
        commitSha?: string;
      } | null;
      const revision =
        "artifact" in load
          ? load.artifact.artifactRevision
          : "artifactRevision" in load
            ? load.artifactRevision
            : null;
      const commit = provenance?.commitSha ?? ("commitSha" in load ? load.commitSha : null);
      expect(commit).toBe(PIN);
      expect(revision).toBe("simc-33622e9d-1");
    }
  });

  it("declares the offensive capability's state requirements and derives PLAYER_CONTEXT with resources", () => {
    const offensive = BLOOD_CAPABILITIES.find((capability) => capability.domain === "OFFENSIVE_ROTATION");
    expect(offensive?.requirements).toEqual({
      scope: "PLAYER_CONTEXT",
      resources: ["RUNES", "RUNIC_POWER"],
      evidenceCategories: ["CASTS", "RESOURCES", "AURAS", "COMBATANT_INFO", "GEAR"],
      targetModel: "PER_OBSERVED_CAST",
    });
    expect(BLOOD_DEATH_KNIGHT_REGISTRATION.requirement).toMatchObject({
      analyzerId: BLOOD_DEATH_KNIGHT_ANALYZER_ID,
      requiredScope: "PLAYER_CONTEXT",
      includeResources: true,
    });
    expect(BLOOD_CAPABILITIES.map((capability) => capability.domain)).toEqual([
      "OFFENSIVE_ROTATION",
      "RESOURCE_SPENDING",
      "ACTIVE_MITIGATION",
      "DEFENSIVE_COOLDOWN",
      "SELF_HEALING",
      "INTERRUPT",
    ]);
  });

  it("owns its vocabulary under its own spec id", () => {
    expect(BLOOD_ATOM_VOCABULARY.ownerSpecId).toBe("deathknight/blood");
  });
});

describe("the public path refuses the real subject; the internal path analyzes it", () => {
  function identityFor(fight: CombatFight) {
    return {
      report: {
        code: fight.report.code,
        revision: fight.report.revision,
        startTime: fight.report.startTimeUnixMs,
        endTime: fight.report.endTimeUnixMs,
      },
      data: fight.data,
      fight: {
        id: fight.fight.id,
        name: fight.fight.name,
        encounterId: fight.fight.encounterId,
        difficulty: fight.fight.difficulty,
        startTime: fight.fight.startTimeMs,
        endTime: fight.fight.endTimeMs,
      },
      player: { sourceId: BLOOD, name: "Corpusplayer", className: "DeathKnight", specName: "Blood" },
    };
  }

  it("the application service reports SPEC_NOT_SUPPORTED for DeathKnight/Blood and calls no analyzer", async () => {
    const fight = corpusFight(BLOOD45);
    const counted = countedProductionCatalog();
    let ingested = 0;
    const deps: AnalysisServiceDeps = {
      env: MCP_TEST_ENV,
      preflight: async () => ({ ok: true, identity: identityFor(fight), rateLimit: undefined }),
      ingest: async () => {
        ingested += 1;
        return { ok: true, fight, rateLimit: undefined };
      },
      registry: counted.registry,
    };
    const result = await analyzeFight(
      { reportCode: fight.report.code, fightId: fight.fight.id, sourceId: BLOOD },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.analysis.status).toBe("SPEC_NOT_SUPPORTED");
    expect(result.analysis.specId).toBeNull();
    expect(result.analysis.analyzerId).toBeNull();
    expect(ingested).toBe(0);
    expect(Object.values(counted.calls).every((count) => count === 0)).toBe(true);
  });

  it("the internal lookup runs the real analyzer over the real subject and it ANALYZES with its resolved decisions disclosed", () => {
    const registration = internalAnalyzerForSpec("deathknight/blood", PRODUCTION_CATALOG);
    expect(registration).not.toBeNull();
    if (registration === null) return;
    const run = runAnalyzer(registration, {
      state: corpusState(BLOOD45),
      actorId: BLOOD,
      specId: "deathknight/blood",
      targetActorId: null,
    });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.analysis.status).toBe("ANALYZED");
    if (run.analysis.status !== "ANALYZED") return;
    expect(run.analysis.specId).toBe("deathknight/blood");
    expect(run.analysis.authority.authorityId).toBe("SIMC_APL_DEATHKNIGHT_BLOOD");
    const view = registration.observedDecisionView(run.analysis);
    // RE-POINTED for M11-B4 (9), M11-B5 (10) and M11-B6 (15): 15 of the 45 s slice's 48 decisions resolve, all MATCH.
    expect(view.coverage).toMatchObject({ eligibleDecisions: 48, match: 15, rejected: 0, unknown: 33 });
    // Every excluded cast is counted under a PUBLIC reason; nothing is dropped.
    const tallied = view.coverage.exclusions.reduce((sum, row) => sum + row.count, 0);
    expect(tallied).toBe(view.coverage.excludedCastCount);
    expect(view.coverage.exclusions.map((row) => row.key)).toEqual([
      "NON_GCD_ACTION",
      "NO_AUTHORITY_TOKEN_BINDING",
      "OUTSIDE_SUPPORTED_SLICE",
    ]);
  });
});

describe("no central specialization switch", () => {
  it("nothing outside the Blood tree names the specialization except the partition, the registry row and the pinned data", () => {
    const offenders = Object.entries(SOURCES)
      .filter(([, code]) =>
        /deathknight\/blood|Blood Death Knight|BLOOD_DEATH_KNIGHT|DEATHKNIGHT_BLOOD/.test(code),
      )
      .filter(([path]) => !path.includes("/specs/deathknight/blood/"))
      .map(([path]) => path.replace(/^.*\/src\//, "src/"))
      .filter(
        (path) =>
          !path.startsWith("src/data/game/deathknight-blood-") &&
          !path.startsWith("src/simc/data/deathknight-blood"),
      )
      .sort();
    expect(offenders).toEqual([
      // The dated wire contracts' prose names the class the Rune and Runic Power corroboration came from.
      "src/data/wcl-wire/resource-types.ts",
      // The POST_CHANGE timing's prose names the corpus that settled it (M11-B5).
      "src/engine/resources/resource-observations.ts",
      // The shared cooldown derivation's header records which specialization forced the promotion.
      "src/findings/cooldowns/token-cooldown-derivation.ts",
      // The partition.
      "src/findings/spec-id.ts",
      // The registration import and the catalog row.
      "src/services/analyzer-registry.ts",
    ]);
    for (const path of [
      "src/services/analysis-service.ts",
      "src/services/raid-night-service.ts",
      "src/services/spec-identity.ts",
      "src/contracts/analysis-contract.ts",
      "src/contracts/analysis-projection.ts",
      "src/contracts/raid-night-projection.ts",
      "src/aggregation/cell-projection.ts",
      "src/aggregation/raid-night.ts",
      "src/api/worker.ts",
      "src/mcp/server.ts",
    ]) {
      const code = SOURCES[Object.keys(SOURCES).find((candidate) => candidate.endsWith(path)) ?? ""] ?? "";
      expect(code, path).not.toMatch(/deathknight\/blood|Blood Death Knight|BLOOD_DEATH_KNIGHT/);
    }
  });
});
