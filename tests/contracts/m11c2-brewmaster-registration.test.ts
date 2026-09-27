/**
 * M11-C2: the Brewmaster Monk registration — identity, INTERNAL_ONLY
 * exposure, the one authority it binds, the six domains it declares, the
 * datasets it loads, its vocabulary, and its isolation from every public
 * surface and every other specialization.
 *
 * The negative half is the point of this file: a public request for the real
 * Brewmaster subject answers SPEC_NOT_SUPPORTED with zero analyzer calls and
 * nothing retrieved; the public spec list, the identity table, the public
 * contract, the supported-specializations sentence and both MCP tool
 * descriptions are exactly what they were before M11-C2 (four PUBLIC
 * specializations); Warrior/Arms is still unsupported; the four public
 * specializations' own vocabularies neither gain nor lose an identifier; and
 * nothing outside the Brewmaster tree names the specialization except the
 * partition, the registry row and the pinned data. An INTERNAL_ONLY analyzer
 * that leaked into a public surface would be a promotion nobody reviewed.
 */

import { describe, expect, it } from "vitest";

import {
  PUBLIC_EXCLUSION_REASONS,
  PUBLIC_SPEC_IDS as CONTRACT_PUBLIC_SPEC_IDS,
} from "../../src/contracts/analysis-contract.js";
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
import { pinnedBrewmasterMonkCooldowns } from "../../src/data/game/monk-brewmaster-cooldowns.js";
import { pinnedBrewmasterUsabilityAuthority } from "../../src/data/game/monk-brewmaster-usability-authority.js";
import { pinnedBrewmasterMonkGcdSemantics } from "../../src/data/game/monk-brewmaster-gcd-semantics.js";
import { pinnedBrewmasterMonkTalents } from "../../src/data/game/monk-brewmaster-talents.js";
import { isBuiltinIdentifier, parseSimcExpression } from "../../src/simc/expression/parse.js";
import {
  BREWMASTER_AUTHORITY_BINDINGS,
  BREWMASTER_CAPABILITIES,
  standaloneBrewmasterAuthorityAccess,
} from "../../src/specs/monk/brewmaster/authority-bindings.js";
import {
  BREWMASTER_MONK_AUTHORITY_IDENTITY,
  pinnedBrewmasterMonkAuthority,
} from "../../src/specs/monk/brewmaster/pinned-authority.js";
import {
  BREWMASTER_EXCLUSION_VIEW_PROJECTION,
  BREWMASTER_LIMITS,
  BREWMASTER_MONK_MODULE,
  BREWMASTER_MONK_REGISTRATION,
} from "../../src/specs/monk/brewmaster/registration.js";
import {
  BREWMASTER_MONK_ANALYZER_ID,
  BREWMASTER_MONK_DISPLAY_NAME,
  BREWMASTER_MONK_SPEC_ID,
} from "../../src/specs/monk/brewmaster/spec.js";
import {
  BREWMASTER_ATOM_DECLARATIONS,
  BREWMASTER_ATOM_VOCABULARY,
  BREWMASTER_BUILD_STATIC_ATOMS,
  BREWMASTER_UNBOUND_NUMERIC_ATOMS,
} from "../../src/specs/monk/brewmaster/vocabulary.js";
import { BLOOD_ATOM_VOCABULARY } from "../../src/specs/deathknight/blood/vocabulary.js";
import { PROTECTION_ATOM_VOCABULARY } from "../../src/specs/paladin/protection/vocabulary.js";
import { RETRIBUTION_ATOM_VOCABULARY } from "../../src/specs/paladin/retribution/vocabulary.js";
import brewmasterArtifact from "../../src/simc/data/monk-brewmaster.apl.json";
import { MCP_TEST_ENV } from "../support/analysis-transports.js";
import { countedProductionCatalog } from "../support/catalog.js";
import { corpusFight, corpusState } from "../support/corpus/fight.js";

const PIN = "33622e9d1662ff0e451691edf85a6b49cc9d11d9";
const BREWMASTER_GTKB = "wcl-brewmaster-monk-gtkb-opener";
const BREWMASTER = 4;
const FOUR_PUBLIC = ["rogue/assassination", "paladin/protection", "paladin/retribution", "deathknight/blood"];

const SOURCES: Record<string, string> = import.meta.glob("../../src/**/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

describe("identity and partition", () => {
  it("coheres with the pinned roster: Brewmaster Monk, specID 268, TANK", () => {
    expect(BREWMASTER_MONK_SPEC_ID).toBe("monk/brewmaster");
    expect(BREWMASTER_MONK_MODULE.identity).toEqual({
      specId: "monk/brewmaster",
      analyzerId: BREWMASTER_MONK_ANALYZER_ID,
      displayName: BREWMASTER_MONK_DISPLAY_NAME,
      wclClassName: "Monk",
      wclSpecName: "Brewmaster",
      simcSpecId: 268,
      role: "TANK",
    });
    expect(rosterSpecialization("monk/brewmaster")).toMatchObject({
      simcSpecId: 268,
      role: "TANK",
      displayName: "Brewmaster Monk",
    });
  });

  it("is INTERNAL_ONLY in the partition and ABSENT from the public contract and the identity table", () => {
    expect(isSpecId("monk/brewmaster")).toBe(true);
    expect(isPublicSpecId("monk/brewmaster")).toBe(false);
    expect([...INTERNAL_ONLY_SPEC_IDS]).toEqual(["monk/brewmaster"]);
    expect([...PUBLIC_SPEC_IDS]).toEqual(FOUR_PUBLIC);
    expect(CONTRACT_PUBLIC_SPEC_IDS as readonly string[]).not.toContain("monk/brewmaster");
    expect(() => requirePublicSpecId("monk/brewmaster")).toThrow(InternalSpecExposureError);
    expect(SUPPORTED_SPEC_IDENTITIES).not.toHaveProperty("monk/brewmaster");
    expect(Object.values(SUPPORTED_SPEC_IDENTITIES)).not.toContain("monk/brewmaster");
    expect(resolveSpecIdentity({ className: "Monk", specName: "Brewmaster" })).toMatchObject({
      ok: false,
      reason: "UNSUPPORTED_SPECIALIZATION",
    });
    expect(BREWMASTER_MONK_MODULE.exposure).toBe("INTERNAL_ONLY");
    expect(BREWMASTER_MONK_REGISTRATION.exposure).toBe("INTERNAL_ONLY");
    expect(BREWMASTER_MONK_MODULE.supplementalAnalyses).toEqual([]);
  });

  it("Warrior/Arms is still unsupported: it is not a SpecId and the identity table does not resolve it", () => {
    expect(isSpecId("warrior/arms")).toBe(false);
    expect(resolveSpecIdentity({ className: "Warrior", specName: "Arms" })).toMatchObject({
      ok: false,
      reason: "UNSUPPORTED_SPECIALIZATION",
    });
  });

  it("is in the validated catalog for the INTERNAL lookup only, and in no public derivation", () => {
    expect(internalAnalyzerForSpec("monk/brewmaster", PRODUCTION_CATALOG)?.analyzerId).toBe(
      BREWMASTER_MONK_ANALYZER_ID,
    );
    expect(internalAnalyzerForSpec("monk/brewmaster", PRODUCTION_CATALOG)?.exposure).toBe("INTERNAL_ONLY");
    expect(analyzerForSpec("monk/brewmaster", PRODUCTION_CATALOG)).toBeNull();
    expect(publicAnalyzers(PRODUCTION_CATALOG).map((row) => row.specId)).toEqual(FOUR_PUBLIC);
    expect(ENABLED_ANALYZERS.map((row) => row.specId)).toEqual(FOUR_PUBLIC);
    expect(ENABLED_ANALYSIS_REQUIREMENTS.map((requirement) => requirement.analyzerId)).not.toContain(
      BREWMASTER_MONK_ANALYZER_ID,
    );
    // The public prose is unchanged by an INTERNAL_ONLY row.
    expect(SUPPORTED_SPECIALIZATIONS_SENTENCE).toBe(
      "Supported specializations: Assassination Rogue, Blood Death Knight, Protection Paladin and Retribution Paladin.",
    );
    expect(PUBLIC_SPECIALIZATION_DESCRIPTIONS.limits).toHaveLength(4);
    for (const description of [
      analyzeToolDescription(PUBLIC_SPECIALIZATION_DESCRIPTIONS),
      raidNightToolDescription(PUBLIC_SPECIALIZATION_DESCRIPTIONS),
    ]) {
      expect(description).not.toMatch(/monk|brewmaster/i);
      expect(description).not.toContain(BREWMASTER_LIMITS.analysis);
      expect(description).not.toContain(BREWMASTER_LIMITS.raidNight);
    }
  });

  it("projects every internal exclusion reason onto an existing public one — no new public reason", () => {
    for (const reason of Object.values(BREWMASTER_EXCLUSION_VIEW_PROJECTION)) {
      expect(PUBLIC_EXCLUSION_REASONS as readonly string[]).toContain(reason);
    }
    expect(BREWMASTER_EXCLUSION_VIEW_PROJECTION.OUTSIDE_FIRST_SLICE).toBe("OUTSIDE_SUPPORTED_SLICE");
    expect(BREWMASTER_EXCLUSION_VIEW_PROJECTION.MELEE_SWING).toBe("NON_GCD_ACTION");
  });
});

describe("authority and datasets", () => {
  it("binds exactly one SimulationCraft authority, to OFFENSIVE_ROTATION, at the shared pin, in its own file", () => {
    expect(
      BREWMASTER_AUTHORITY_BINDINGS.map((binding) => [binding.kind, binding.domain, binding.authorityId]),
    ).toEqual([["SIMC_APL", "OFFENSIVE_ROTATION", "SIMC_APL_MONK_BREWMASTER"]]);
    expect(BREWMASTER_MONK_AUTHORITY_IDENTITY).toEqual({
      authorityId: "SIMC_APL_MONK_BREWMASTER",
      artifactRevision: "simc-33622e9d-1",
      commitSha: PIN,
    });
    const loaded = pinnedBrewmasterMonkAuthority();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.authority.artifact.spec).toEqual({ className: "monk", specName: "brewmaster" });
    expect(loaded.authority.artifact.provenance.sourcePath).toBe("engine/class_modules/apl/apl_monk.cpp");
    expect(loaded.authority.artifact.provenance.regionSelector).toEqual({
      kind: "NAMESPACE_FUNCTION",
      enclosingNamespace: "brewmaster",
      functionHeader: "void default_apl( monk_t* player )",
      playerIdentifier: "player",
    });
    expect("regionStartMarker" in loaded.authority.artifact.provenance).toBe(false);
  });

  it("the committed APL artifact is the reviewed region: six lists, sixty-two actions, in dispatch order", () => {
    expect(brewmasterArtifact.lists.map((list) => [list.listName, list.actions.length])).toEqual([
      ["precombat", 2],
      ["default", 6],
      ["item_actions", 1],
      ["race_actions", 7],
      ["master_of_harmony", 23],
      ["shado_pan", 23],
    ]);
    const defaults = brewmasterArtifact.lists.find((list) => list.listName === "default");
    expect(defaults?.actions.map((action) => action.actionStringVerbatim)).toEqual([
      "auto_attack",
      "potion",
      "call_action_list,name=race_actions",
      "call_action_list,name=item_actions",
      "run_action_list,name=master_of_harmony,if=hero_tree.master_of_harmony",
      "run_action_list,name=shado_pan,if=hero_tree.shadopan",
    ]);
  });

  it("the standalone access resolves exactly what the registration's access resolves, with ALL six domains declared", () => {
    const standalone = standaloneBrewmasterAuthorityAccess();
    for (const domain of [
      "OFFENSIVE_ROTATION",
      "RESOURCE_SPENDING",
      "ACTIVE_MITIGATION",
      "DEFENSIVE_COOLDOWN",
      "SELF_HEALING",
      "INTERRUPT",
    ] as const) {
      expect(standalone.forDomain(domain).outcome).toBe(
        BREWMASTER_MONK_REGISTRATION.authority.forDomain(domain).outcome,
      );
      expect(standalone.forDomain(domain).outcome).toBe(
        domain === "OFFENSIVE_ROTATION" ? "AUTHORITY_AVAILABLE" : "NO_PINNED_AUTHORITY_FOR_DOMAIN",
      );
    }
  });

  it("every pinned Brewmaster dataset the analyzer reads loads at the same commit and revision", () => {
    const talents = pinnedBrewmasterMonkTalents();
    const gcd = pinnedBrewmasterMonkGcdSemantics();
    const cooldowns = pinnedBrewmasterMonkCooldowns();
    expect(talents.ok).toBe(true);
    expect(gcd.ok).toBe(true);
    expect(cooldowns.ok).toBe(true);
    if (talents.ok) {
      expect(talents.artifact.provenance.commitSha).toBe(PIN);
      expect(talents.artifact.artifactRevision).toBe("simc-33622e9d-1");
    }
    if (gcd.ok) {
      expect(gcd.artifact.provenance.commitSha).toBe(PIN);
      expect(gcd.artifact.artifactRevision).toBe("simc-33622e9d-1");
    }
    if (cooldowns.ok) {
      expect(cooldowns.commitSha).toBe(PIN);
      expect(cooldowns.abilities.map((ability) => ability.simcToken)).toEqual([
        "blackout_kick",
        "expel_harm",
        "chi_burst",
        "invoke_niuzao",
        "exploding_keg",
        "rushing_jade_wind",
        "breath_of_fire",
        // M11-C4i: Keg Smash, for the POSITIVE readiness proof only (never a NOT_READY derivation).
        "keg_smash",
      ]);
    }
    // M11-C4i: the positive-usability authority, from the same pinned commit.
    const usability = pinnedBrewmasterUsabilityAuthority();
    expect(usability.ok).toBe(true);
    if (usability.ok) {
      expect(usability.artifactRevision).toBe("simc-33622e9d-1");
      expect(usability.spells.map((spell) => spell.simcToken)).toEqual([
        "tiger_palm",
        "blackout_kick",
        "keg_smash",
        "breath_of_fire",
        "invoke_niuzao",
      ]);
    }
  });

  it("declares no resource: the slice reads no Energy, so the derived requirement asks for none", () => {
    for (const capability of BREWMASTER_CAPABILITIES) expect(capability.requirements.resources).toEqual([]);
    const offensive = BREWMASTER_CAPABILITIES.find(
      (capability) => capability.domain === "OFFENSIVE_ROTATION",
    );
    expect(offensive?.requirements).toEqual({
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "COMBATANT_INFO"],
      targetModel: "PER_OBSERVED_CAST",
    });
    expect(BREWMASTER_MONK_REGISTRATION.requirement).toMatchObject({
      analyzerId: BREWMASTER_MONK_ANALYZER_ID,
      requiredScope: "PLAYER_CONTEXT",
      includeResources: false,
    });
  });
});

describe("the vocabulary, owned and isolated", () => {
  it("declares exactly the twelve reviewed atoms under its own spec id: six build-static truths, six unbound magnitudes", () => {
    expect(BREWMASTER_ATOM_VOCABULARY.ownerSpecId).toBe("monk/brewmaster");
    expect([...BREWMASTER_BUILD_STATIC_ATOMS]).toEqual([
      "hero_tree.master_of_harmony",
      "hero_tree.shadopan",
      "talent.blackout_combo.enabled",
      "talent.salsalabims_strength.enabled",
      "apex.1",
      "apex.3",
    ]);
    expect([...BREWMASTER_UNBOUND_NUMERIC_ATOMS]).toEqual([
      "cooldown.celestial_brew.charges_fractional",
      "cooldown.keg_smash.charges_fractional",
      "buff.aspect_of_harmony_accumulator.value",
      "health.max",
      "energy",
      "energy.regen",
    ]);
    expect(BREWMASTER_ATOM_DECLARATIONS).toHaveLength(12);
    for (const declaration of BREWMASTER_ATOM_DECLARATIONS) {
      expect(isBuiltinIdentifier(declaration.identifier), declaration.identifier).toBe(false);
      expect(declaration.scope).toBe("PLAYER_SCOPED");
      expect(declaration.selfAddressing).toBe(false);
    }
  });

  it("every condition of the pinned Brewmaster list parses under its vocabulary, and 21 of 31 refuse without it", () => {
    let parsed = 0;
    let bareRefused = 0;
    for (const list of brewmasterArtifact.lists) {
      for (const action of list.actions) {
        const at = action.actionStringVerbatim.indexOf(",if=");
        if (at < 0) continue;
        const condition = action.actionStringVerbatim.slice(at + 4);
        const withVocabulary = parseSimcExpression(condition, BREWMASTER_ATOM_VOCABULARY);
        expect(withVocabulary.ok, `${list.listName}: ${condition}`).toBe(true);
        parsed += 1;
        const bare = parseSimcExpression(condition);
        if (!bare.ok) {
          expect(bare.reason).toBe("UNSUPPORTED_IDENTIFIER");
          bareRefused += 1;
        }
      }
    }
    expect(parsed).toBe(31);
    expect(bareRefused).toBe(21);
  });

  it("no public specialization's vocabulary gains a Brewmaster-only atom", () => {
    const brewmasterOnly = [
      "hero_tree.master_of_harmony",
      "hero_tree.shadopan",
      "talent.blackout_combo.enabled",
      "talent.salsalabims_strength.enabled",
      "apex.1",
      "cooldown.celestial_brew.charges_fractional",
      "cooldown.keg_smash.charges_fractional",
      "buff.aspect_of_harmony_accumulator.value",
      "health.max",
      "energy",
      "energy.regen",
    ];
    for (const vocabulary of [
      BLOOD_ATOM_VOCABULARY,
      PROTECTION_ATOM_VOCABULARY,
      RETRIBUTION_ATOM_VOCABULARY,
    ]) {
      for (const identifier of brewmasterOnly) {
        expect(vocabulary.lookup(identifier), `${vocabulary.ownerSpecId}: ${identifier}`).toBeNull();
      }
    }
  });

  it("the Brewmaster vocabulary gains no other specialization's atom except the independently declared apex.3", () => {
    const shared = new Set(["apex.3"]);
    for (const vocabulary of [
      BLOOD_ATOM_VOCABULARY,
      PROTECTION_ATOM_VOCABULARY,
      RETRIBUTION_ATOM_VOCABULARY,
    ]) {
      for (const declaration of vocabulary.declarations) {
        if (shared.has(declaration.identifier)) continue;
        expect(
          BREWMASTER_ATOM_VOCABULARY.lookup(declaration.identifier),
          `${vocabulary.ownerSpecId}: ${declaration.identifier}`,
        ).toBeNull();
      }
    }
    // apex.3 is declared by Protection and by Brewmaster independently: each
    // specialization answers `apex.N` against its OWN pinned tiered traits.
    expect(PROTECTION_ATOM_VOCABULARY.lookup("apex.3")?.identifier).toBe("apex.3");
    expect(BREWMASTER_ATOM_VOCABULARY.lookup("apex.3")?.identifier).toBe("apex.3");
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
      player: { sourceId: BREWMASTER, name: "Corpusplayer", className: "Monk", specName: "Brewmaster" },
    };
  }

  it("the application service reports SPEC_NOT_SUPPORTED for Monk/Brewmaster, retrieves nothing and calls no analyzer", async () => {
    const fight = corpusFight(BREWMASTER_GTKB);
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
      { reportCode: fight.report.code, fightId: fight.fight.id, sourceId: BREWMASTER },
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

  it("the internal lookup runs the real analyzer over the real subject: 15 eligible, 5 MATCH, 1 REJECTED, 9 UNKNOWN (M11-C4i)", () => {
    const registration = internalAnalyzerForSpec("monk/brewmaster", PRODUCTION_CATALOG);
    expect(registration).not.toBeNull();
    if (registration === null) return;
    const run = runAnalyzer(registration, {
      state: corpusState(BREWMASTER_GTKB),
      actorId: BREWMASTER,
      specId: "monk/brewmaster",
      targetActorId: null,
    });
    expect(run.ok).toBe(true);
    if (!run.ok) return;
    expect(run.analysis.status).toBe("ANALYZED");
    if (run.analysis.status !== "ANALYZED") return;
    expect(run.analysis.specId).toBe("monk/brewmaster");
    expect(run.analysis.authority.authorityId).toBe("SIMC_APL_MONK_BREWMASTER");
    const view = registration.observedDecisionView(run.analysis);
    expect(view.coverage).toMatchObject({
      eligibleDecisions: 15,
      match: 5,
      rejected: 1,
      unknown: 9,
      exactEntryMatches: 5,
      tokenConvergedMatches: 0,
    });
    const tallied = view.coverage.exclusions.reduce((sum, row) => sum + row.count, 0);
    expect(tallied).toBe(view.coverage.excludedCastCount);
    expect(view.coverage.exclusions).toEqual([
      { key: "NON_GCD_ACTION", count: 10 },
      { key: "EXECUTION_LANE_NOT_ESTABLISHED", count: 8 },
    ]);
  });
});

describe("no central specialization switch", () => {
  it("nothing outside the Brewmaster tree names the specialization except the partition, the registry row and the pinned data", () => {
    const offenders = Object.entries(SOURCES)
      .filter(([, code]) => /monk\/brewmaster|Brewmaster Monk|BREWMASTER_MONK|MONK_BREWMASTER/.test(code))
      .filter(([path]) => !path.includes("/specs/monk/brewmaster/"))
      .map(([path]) => path.replace(/^.*\/src\//, "src/"))
      .filter((path) => !path.startsWith("src/data/game/monk-brewmaster-"))
      .sort();
    expect(offenders).toEqual([
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
      "src/simc/non-domain-tokens.ts",
      "src/simc/nested-selection.ts",
      "src/simc/first-gcd-selection.ts",
      "src/simc/expression/parse.ts",
      "src/simc/expression/evaluate.ts",
    ]) {
      const code = SOURCES[Object.keys(SOURCES).find((candidate) => candidate.endsWith(path)) ?? ""] ?? "";
      expect(code.length, path).toBeGreaterThan(0);
      expect(code, path).not.toMatch(/brewmaster/i);
    }
  });
});
