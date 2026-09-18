/**
 * M11-A4: the Retribution Paladin registration is INTERNAL_ONLY, coheres
 * with the pinned roster, binds exactly one authority to one domain, loads
 * every pinned dataset at the one commit, and is invisible to every public
 * path — while the internal lookup and the facade analyze a real subject.
 *
 * NO CENTRAL SPEC SWITCH. The registry reaches the tree through its
 * registration and nothing else; no service, transport or shared module
 * names the specialization. The sweep at the end pins that.
 */

import { describe, expect, it } from "vitest";

import { PUBLIC_SPEC_IDS as CONTRACT_PUBLIC_SPEC_IDS } from "../../src/contracts/analysis-contract.js";
import { projectAnalysisResult } from "../../src/contracts/analysis-projection.js";
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
import { pinnedRetributionPaladinCooldowns } from "../../src/data/game/paladin-retribution-cooldowns.js";
import { pinnedRetributionPaladinGcdSemantics } from "../../src/data/game/paladin-retribution-gcd-semantics.js";
import { pinnedRetributionPaladinItemEffects } from "../../src/data/game/paladin-retribution-item-effects.js";
import { pinnedRetributionPaladinSpenderCosts } from "../../src/data/game/paladin-retribution-spender-costs.js";
import { pinnedRetributionPaladinTalents } from "../../src/data/game/paladin-retribution-talents.js";
import { pinnedProtectionPaladinAuthority } from "../../src/specs/paladin/protection/pinned-authority.js";
import {
  RETRIBUTION_AUTHORITY_BINDINGS,
  RETRIBUTION_CAPABILITIES,
  standaloneRetributionAuthorityAccess,
} from "../../src/specs/paladin/retribution/authority-bindings.js";
import {
  pinnedRetributionPaladinAuthority,
  RETRIBUTION_PALADIN_AUTHORITY_IDENTITY,
} from "../../src/specs/paladin/retribution/pinned-authority.js";
import {
  RETRIBUTION_PALADIN_MODULE,
  RETRIBUTION_PALADIN_REGISTRATION,
} from "../../src/specs/paladin/retribution/registration.js";
import {
  RETRIBUTION_PALADIN_ANALYZER_ID,
  RETRIBUTION_PALADIN_DISPLAY_NAME,
  RETRIBUTION_PALADIN_SPEC_ID,
} from "../../src/specs/paladin/retribution/spec.js";
import { RETRIBUTION_ATOM_VOCABULARY } from "../../src/specs/paladin/retribution/vocabulary.js";
import { MCP_TEST_ENV } from "../support/analysis-transports.js";
import { countedProductionCatalog } from "../support/catalog.js";
import { corpusFight, corpusState } from "../support/corpus/fight.js";

const PIN = "33622e9d1662ff0e451691edf85a6b49cc9d11d9";
const RET45 = "wcl-retribution-paladin-a7r6-rotational-45s";
const RET = 6;

const SOURCES: Record<string, string> = import.meta.glob("../../src/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

describe("identity and partition", () => {
  it("coheres with the pinned roster: Retribution Paladin, specID 70, DPS", () => {
    expect(RETRIBUTION_PALADIN_SPEC_ID).toBe("paladin/retribution");
    expect(RETRIBUTION_PALADIN_MODULE.identity).toEqual({
      specId: "paladin/retribution",
      analyzerId: RETRIBUTION_PALADIN_ANALYZER_ID,
      displayName: RETRIBUTION_PALADIN_DISPLAY_NAME,
      wclClassName: "Paladin",
      wclSpecName: "Retribution",
      simcSpecId: 70,
      role: "DPS",
    });
    expect(rosterSpecialization("paladin/retribution")).toMatchObject({
      simcSpecId: 70,
      role: "DPS",
      displayName: "Retribution Paladin",
    });
  });

  it("is INTERNAL_ONLY in the partition, the public contract and the identity table", () => {
    expect(isSpecId("paladin/retribution")).toBe(true);
    expect(isPublicSpecId("paladin/retribution")).toBe(false);
    expect([...INTERNAL_ONLY_SPEC_IDS]).toEqual(["paladin/retribution"]);
    expect(PUBLIC_SPEC_IDS as readonly string[]).not.toContain("paladin/retribution");
    expect(CONTRACT_PUBLIC_SPEC_IDS as readonly string[]).not.toContain("paladin/retribution");
    expect(() => requirePublicSpecId("paladin/retribution")).toThrow(InternalSpecExposureError);
    expect(Object.keys(SUPPORTED_SPEC_IDENTITIES)).not.toContain("paladin/retribution");
    expect(resolveSpecIdentity({ className: "Paladin", specName: "Retribution" })).toMatchObject({
      ok: false,
      reason: "UNSUPPORTED_SPECIALIZATION",
    });
    expect(RETRIBUTION_PALADIN_MODULE.exposure).toBe("INTERNAL_ONLY");
    expect(RETRIBUTION_PALADIN_REGISTRATION.exposure).toBe("INTERNAL_ONLY");
    expect(RETRIBUTION_PALADIN_MODULE.supplementalAnalyses).toEqual([]);
  });

  it("is in the validated catalog for the internal lookup and absent from every public derivation", () => {
    expect(internalAnalyzerForSpec("paladin/retribution", PRODUCTION_CATALOG)?.analyzerId).toBe(
      RETRIBUTION_PALADIN_ANALYZER_ID,
    );
    expect(internalAnalyzerForSpec("paladin/retribution", PRODUCTION_CATALOG)?.exposure).toBe(
      "INTERNAL_ONLY",
    );
    expect(analyzerForSpec("paladin/retribution", PRODUCTION_CATALOG)).toBeNull();
    expect(publicAnalyzers(PRODUCTION_CATALOG).map((row) => row.specId)).toEqual([
      "rogue/assassination",
      "paladin/protection",
    ]);
    expect(ENABLED_ANALYZERS.map((row) => row.specId)).not.toContain("paladin/retribution");
    expect(ENABLED_ANALYSIS_REQUIREMENTS.map((requirement) => requirement.analyzerId)).not.toContain(
      RETRIBUTION_PALADIN_ANALYZER_ID,
    );
    // The public prose is derived from the PUBLIC set and does not move.
    expect(SUPPORTED_SPECIALIZATIONS_SENTENCE).toBe(
      "Supported specializations: Assassination Rogue and Protection Paladin.",
    );
    expect(analyzeToolDescription(PUBLIC_SPECIALIZATION_DESCRIPTIONS)).not.toMatch(/retribution/i);
    expect(raidNightToolDescription(PUBLIC_SPECIALIZATION_DESCRIPTIONS)).not.toMatch(/retribution/i);
  });
});

describe("authority and datasets", () => {
  it("binds exactly one SimulationCraft authority, to OFFENSIVE_ROTATION, at the one pinned commit — distinct from Protection's id", () => {
    expect(
      RETRIBUTION_AUTHORITY_BINDINGS.map((binding) => [binding.kind, binding.domain, binding.authorityId]),
    ).toEqual([["SIMC_APL", "OFFENSIVE_ROTATION", "SIMC_APL_PALADIN_RETRIBUTION"]]);
    expect(RETRIBUTION_PALADIN_AUTHORITY_IDENTITY).toEqual({
      authorityId: "SIMC_APL_PALADIN_RETRIBUTION",
      artifactRevision: "simc-33622e9d-1",
      commitSha: PIN,
    });
    const loaded = pinnedRetributionPaladinAuthority();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const { provenance } = loaded.authority.artifact;
    expect(provenance.commitSha).toBe(PIN);
    expect(provenance.sourcePath).toBe("engine/class_modules/apl/apl_paladin.cpp");
    expect(provenance.sourceSha256).toBe("ed3fb1ac5b1c6c83bf21abbcaff5afe282678a69d51bdc953cc9897dca94bc02");
    expect(loaded.authority.artifact.spec).toEqual({ className: "paladin", specName: "retribution" });
    // Same file and commit as Protection, different region and id: legal by
    // the registry's duplicate rule, which keys on the id and the domain.
    const protection = pinnedProtectionPaladinAuthority();
    expect(protection.ok).toBe(true);
    if (!protection.ok) return;
    expect(protection.authority.artifact.provenance.sourceSha256).toBe(provenance.sourceSha256);
    expect(protection.authority.artifact.authorityId).not.toBe(loaded.authority.artifact.authorityId);
    expect(loaded.authority.artifact.lists.map((list) => list.listName)).toEqual([
      "default",
      "precombat",
      "cooldowns",
      "finishers",
      "generators",
    ]);
  });

  it("the standalone access resolves exactly what the registration's access resolves", () => {
    const standalone = standaloneRetributionAuthorityAccess();
    for (const domain of [
      "OFFENSIVE_ROTATION",
      "RESOURCE_SPENDING",
      "DEFENSIVE_COOLDOWN",
      "INTERRUPT",
      "ACTIVE_MITIGATION",
      "SELF_HEALING",
    ] as const) {
      expect(standalone.forDomain(domain).outcome).toBe(
        RETRIBUTION_PALADIN_REGISTRATION.authority.forDomain(domain).outcome,
      );
    }
    expect(standalone.forDomain("OFFENSIVE_ROTATION").outcome).toBe("AUTHORITY_AVAILABLE");
    expect(standalone.forDomain("RESOURCE_SPENDING").outcome).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(standalone.forDomain("ACTIVE_MITIGATION").outcome).toBe("DOMAIN_NOT_DECLARED");
  });

  it("every pinned Retribution dataset loads at the same commit and revision", () => {
    const loads = [
      pinnedRetributionPaladinTalents(),
      pinnedRetributionPaladinGcdSemantics(),
      pinnedRetributionPaladinCooldowns(),
      pinnedRetributionPaladinSpenderCosts(),
      pinnedRetributionPaladinItemEffects(),
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
    const offensive = RETRIBUTION_CAPABILITIES.find(
      (capability) => capability.domain === "OFFENSIVE_ROTATION",
    );
    expect(offensive?.requirements).toEqual({
      scope: "PLAYER_CONTEXT",
      resources: ["HOLY_POWER"],
      evidenceCategories: ["CASTS", "RESOURCES", "AURAS", "COMBATANT_INFO", "GEAR"],
      targetModel: "PER_OBSERVED_CAST",
    });
    expect(RETRIBUTION_PALADIN_REGISTRATION.requirement).toMatchObject({
      analyzerId: RETRIBUTION_PALADIN_ANALYZER_ID,
      requiredScope: "PLAYER_CONTEXT",
      includeResources: true,
    });
    expect(RETRIBUTION_CAPABILITIES.map((capability) => capability.domain)).toEqual([
      "OFFENSIVE_ROTATION",
      "RESOURCE_SPENDING",
      "DEFENSIVE_COOLDOWN",
      "INTERRUPT",
    ]);
  });

  it("owns its vocabulary under its own spec id", () => {
    expect(RETRIBUTION_ATOM_VOCABULARY.ownerSpecId).toBe("paladin/retribution");
    expect(
      RETRIBUTION_ATOM_VOCABULARY.declarations.map((declaration) => declaration.identifier).sort(),
    ).toEqual([
      "active_enemies",
      "cooldown.hammer_of_wrath.charges",
      "gcd",
      "holy_power",
      "variable.ds_castable",
      "variable.pre_es_wake",
    ]);
  });
});

describe("the public path refuses, the internal path analyzes", () => {
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
      player: { sourceId: RET, name: "Corpusplayer", className: "Paladin", specName: "Retribution" },
    };
  }

  it("the application service answers SPEC_NOT_SUPPORTED for the real Retribution subject, runs no analyzer, and the public document validates", async () => {
    const fight = corpusFight(RET45);
    const counted = countedProductionCatalog();
    const deps: AnalysisServiceDeps = {
      env: MCP_TEST_ENV,
      preflight: async () => ({ ok: true, identity: identityFor(fight), rateLimit: undefined }),
      ingest: async () => ({ ok: true, fight, rateLimit: undefined }),
      registry: counted.registry,
    };
    const result = await analyzeFight(
      { reportCode: fight.report.code, fightId: fight.fight.id, sourceId: RET },
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.analysis.analysis.status).toBe("SPEC_NOT_SUPPORTED");
    expect(result.analysis.specId).toBeNull();
    expect(result.analysis.analyzerId).toBeNull();
    expect(counted.calls[RETRIBUTION_PALADIN_ANALYZER_ID]).toBe(0);
    // The public document carries the WCL identity it was asked about and the
    // refusal; no specId, no analyzer, no gameplay.
    const document = projectAnalysisResult(result.analysis);
    expect(document).toMatchObject({
      specialization: { specId: null, gameplaySupported: false },
      analyzerId: null,
      status: "SPEC_NOT_SUPPORTED",
    });
    expect(JSON.stringify(document)).not.toContain(RETRIBUTION_PALADIN_ANALYZER_ID);
  });

  it("the internal lookup runs the real analyzer over the real subject and it ANALYZES", () => {
    const registration = internalAnalyzerForSpec("paladin/retribution", PRODUCTION_CATALOG);
    expect(registration).not.toBeNull();
    if (registration === null) return;
    const run = runAnalyzer(registration, {
      state: corpusState(RET45),
      actorId: RET,
      specId: "paladin/retribution",
      targetActorId: null,
    });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.analysis.status).toBe("ANALYZED");
    if (run.analysis.status !== "ANALYZED") return;
    expect(run.analysis.specId).toBe("paladin/retribution");
    expect(run.analysis.authority.authorityId).toBe("SIMC_APL_PALADIN_RETRIBUTION");
  });
});

describe("no central specialization switch", () => {
  it("nothing outside the Retribution tree names the specialization except the partition, the registry's registration import and pinned data", () => {
    const offenders = Object.entries(SOURCES)
      .filter(([path, code]) => /retribution/i.test(code) && !path.includes("/specs/paladin/retribution/"))
      .map(([path]) => path.replace(/^.*\/src\//, "src/"))
      .filter(
        (path) =>
          !path.startsWith("src/data/game/paladin-retribution-") &&
          !path.startsWith("src/simc/data/paladin-retribution"),
      )
      .sort();
    expect(offenders).toEqual([
      // The dated wire contract's prose names the Paladin specializations Holy Power belongs to.
      "src/data/wcl-wire/resource-types.ts",
      // The partition.
      "src/findings/spec-id.ts",
      // The registration import and the catalog row.
      "src/services/analyzer-registry.ts",
    ]);
    const registry =
      SOURCES[
        Object.keys(SOURCES).find((path) => path.endsWith("src/services/analyzer-registry.ts")) ?? ""
      ] ?? "";
    expect(registry.match(/retribution/gi)?.length).toBeLessThanOrEqual(3);
    for (const path of [
      "src/services/analysis-service.ts",
      "src/services/spec-identity.ts",
      "src/contracts/analysis-contract.ts",
    ]) {
      const code = SOURCES[Object.keys(SOURCES).find((candidate) => candidate.endsWith(path)) ?? ""] ?? "";
      expect(code, path).not.toMatch(/retribution/i);
    }
  });
});
