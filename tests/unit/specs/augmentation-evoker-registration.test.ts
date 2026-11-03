/**
 * M13-E: the Augmentation Evoker registration (INTERNAL_ONLY in M13-E,
 * PUBLIC since M13-F), and the provider-less decision domains it is the
 * first to declare.
 *
 * What must hold, and what must NOT happen:
 * - the FULL_RAID requirement is DERIVED from the declared capabilities,
 *   which are themselves read from `AUGMENTATION_EVOKER_REQUIRED_INPUTS`, so
 *   scope derivation over the registration widens to FULL_RAID with no
 *   hand-picked scope;
 * - both support families resolve NO_PINNED_AUTHORITY_FOR_DOMAIN from the
 *   registration's own access, nothing can bind them, and the result is never
 *   ANALYZED;
 * - the internal path over the real M13-A Evoker yields exactly the facts the
 *   evaluator yields under the preflight identity, with SUPPORT_TARGETING
 *   NO_AUTHORITY_AVAILABLE;
 * - a subject with no stated specialization, a pet, or another
 *   specialization yields no support fact, and is never defaulted to an
 *   Augmentation Evoker;
 * - since M13-F, a public request for an Augmentation Evoker dispatches the
 *   registration exactly once, retrieving FULL_RAID derived from its declared
 *   requirement (never hand-picked), and is AUTHORITY_NOT_AVAILABLE with its
 *   support observations, never SPEC_NOT_SUPPORTED and never ANALYZED.
 */

import { beforeAll, describe, expect, it } from "vitest";

import { PREPARATION_REQUIREMENT } from "../../../src/analysis/preparation/requirement.js";
import type { AugmentationSupportAbilityLoad } from "../../../src/data/game/evoker-augmentation-support-abilities.js";
import type { CombatFight } from "../../../src/engine/normalization/combat-fight.js";
import { statedSpecializationOf } from "../../../src/engine/normalization/friendly-specializations.js";
import { createCombatState } from "../../../src/engine/state/combat-state.js";
import {
  resolveAuthorityForDomain,
  type AuthorityDomainBinding,
} from "../../../src/findings/authority-domain.js";
import { validateCapabilities } from "../../../src/findings/decision-capability.js";
import { analyzeFight } from "../../../src/services/analysis-service.js";
import {
  ANALYZER_REGISTRATIONS,
  analyzerForSpec,
  internalAnalyzerForSpec,
  PRODUCTION_CATALOG,
  runAnalyzer,
  validateAnalyzerCatalog,
  type AnalyzerRegistration,
} from "../../../src/services/analyzer-registry.js";
import { deriveIngestionScopeFor, type IngestionScope } from "../../../src/services/ingestion-scope.js";
import { resolveSpecIdentity } from "../../../src/services/spec-identity.js";
import { evaluateAugmentationEvoker } from "../../../src/specs/evoker/augmentation/evaluator.js";
import {
  analyzeAugmentationEvoker,
  AUGMENTATION_AUTHORITY_BINDINGS,
  AUGMENTATION_CAPABILITIES,
  AUGMENTATION_EVOKER_REGISTRATION,
  type AugmentationEvokerAnalysis,
} from "../../../src/specs/evoker/augmentation/registration.js";
import {
  AUGMENTATION_EVOKER_ANALYZER_ID,
  AUGMENTATION_EVOKER_REQUIRED_INPUTS,
  AUGMENTATION_EVOKER_SPEC_ID,
} from "../../../src/specs/evoker/augmentation/spec.js";
import type { FightIdentity } from "../../../src/wcl/types.js";
import { MCP_TEST_ENV } from "../../support/analysis-transports.js";
import { countedProductionCatalog } from "../../support/catalog.js";
import { loadCommittedEvidenceArchive } from "../../support/corpus/evidence-archive.js";
import { bundleOf } from "../../support/corpus/fight.js";

const EVOKER = 1;

function registrationOf(): AnalyzerRegistration {
  const found = internalAnalyzerForSpec(AUGMENTATION_EVOKER_SPEC_ID, PRODUCTION_CATALOG);
  if (found === null) throw new Error("no Augmentation registration");
  return found;
}

function internalRun(fight: CombatFight, actorId: number): AugmentationEvokerAnalysis {
  const run = runAnalyzer(registrationOf(), {
    state: createCombatState(fight),
    actorId,
    specId: AUGMENTATION_EVOKER_SPEC_ID,
    targetActorId: null,
  });
  if (!run.ok) throw new Error(run.detail);
  expect(run.analysis.status).not.toBe("ANALYZED");
  return run.analysis as unknown as AugmentationEvokerAnalysis;
}

describe("the registration row", () => {
  it("is the listed PUBLIC row since M13-F: both lookups find the same row, and the identity table resolves it", () => {
    const registration = registrationOf();
    // The validated catalog holds a frozen snapshot; the raw list holds the module's own row.
    expect(ANALYZER_REGISTRATIONS.filter((row) => row === AUGMENTATION_EVOKER_REGISTRATION)).toHaveLength(1);
    expect(registration.analyzerId).toBe(AUGMENTATION_EVOKER_ANALYZER_ID);
    expect(registration.exposure).toBe("PUBLIC");
    expect(analyzerForSpec(AUGMENTATION_EVOKER_SPEC_ID, PRODUCTION_CATALOG)).toBe(registration);
    expect(resolveSpecIdentity({ className: "Evoker", specName: "Augmentation" })).toEqual({
      ok: true,
      specId: AUGMENTATION_EVOKER_SPEC_ID,
    });
  });

  it("declares the two provider-less support families from REQUIRED_INPUTS, and binds nothing", () => {
    const registration = registrationOf();
    expect(validateCapabilities(registration.capabilities)).toEqual([]);
    expect(registration.capabilities.map((capability) => capability.domain)).toEqual([
      "SUPPORT_TARGETING",
      "SUPPORT_TIMING",
    ]);
    for (const capability of registration.capabilities) {
      expect(capability.requirements.scope).toBe(AUGMENTATION_EVOKER_REQUIRED_INPUTS.scope);
      expect(capability.requirements.evidenceCategories).toEqual([
        ...AUGMENTATION_EVOKER_REQUIRED_INPUTS.categories,
      ]);
      expect(capability.requirements.resources).toEqual([]);
      expect(capability.requirements.targetModel).toBe("NO_TARGET");
    }
    expect(registration.authorityBindings).toEqual([]);
    expect(AUGMENTATION_AUTHORITY_BINDINGS).toEqual([]);
  });

  it("its FULL_RAID requirement is derived, and widens scope derivation alongside preparation", () => {
    const registration = registrationOf();
    expect(registration.requirement).toEqual({
      analyzerId: AUGMENTATION_EVOKER_ANALYZER_ID,
      requiredScope: "FULL_RAID",
      includeResources: false,
    });
    const derived = deriveIngestionScopeFor([registration, { requirement: PREPARATION_REQUIREMENT }]);
    expect(derived).toEqual({
      ok: true,
      scope: "FULL_RAID",
      contributingAnalyzers: [AUGMENTATION_EVOKER_ANALYZER_ID],
    });
  });

  it("resolves both support families NO_PINNED_AUTHORITY_FOR_DOMAIN, and an undeclared domain DOMAIN_NOT_DECLARED", () => {
    const { authority } = registrationOf();
    expect(authority.forDomain("SUPPORT_TARGETING").outcome).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(authority.forDomain("SUPPORT_TIMING").outcome).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(authority.forDomain("OFFENSIVE_ROTATION").outcome).toBe("DOMAIN_NOT_DECLARED");
  });

  it("a provider-less family cannot be bound: a forged binding is refused by the catalog and ignored by resolution", () => {
    const blood = ANALYZER_REGISTRATIONS.find((row) => row.specId === "deathknight/blood");
    if (blood === undefined) throw new Error("no Blood row");
    const forged = {
      ...(blood.authorityBindings[0] as AuthorityDomainBinding),
      domain: "SUPPORT_TARGETING",
    } as unknown as AuthorityDomainBinding;
    const forgedRow = { ...AUGMENTATION_EVOKER_REGISTRATION, authorityBindings: [forged] };
    const validation = validateAnalyzerCatalog(
      ANALYZER_REGISTRATIONS.map((row) => (row === AUGMENTATION_EVOKER_REGISTRATION ? forgedRow : row)),
    );
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.defects.map((defect) => defect.defect)).toContain("PROVIDER_DOMAIN_INCOMPATIBLE");
    expect(resolveAuthorityForDomain(["SUPPORT_TARGETING"], [forged], "SUPPORT_TARGETING").outcome).toBe(
      "NO_PINNED_AUTHORITY_FOR_DOMAIN",
    );
  });

  it("has no observed-decision view: asking for one throws rather than returning an empty one", () => {
    expect(() =>
      AUGMENTATION_EVOKER_REGISTRATION.observedDecisionView({
        status: "ANALYZED",
        specId: AUGMENTATION_EVOKER_SPEC_ID,
        authority: { authorityId: "SIMC_APL_FORGED" },
      } as never),
    ).toThrow();
  });

  it("the capability list is frozen and typed provider-less", () => {
    expect(Object.isFrozen(AUGMENTATION_CAPABILITIES)).toBe(true);
    expect(AUGMENTATION_CAPABILITIES).toHaveLength(2);
  });
});

describe("the internal path over the real Augmentation Evoker (M13AAUGAAAAAAAAA fight 1, actor 1)", () => {
  const SEGMENTS = ["wcl-m13a-aug1-fight-1-support.seg-0-75", "wcl-m13a-aug1-fight-1-support.seg-75-151"];
  const CONTEXT = "wcl-m13a-fight-context-aug1-fight-1";
  let fight: CombatFight;

  beforeAll(async () => {
    const loaded = await loadCommittedEvidenceArchive();
    if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join("\n"));
    fight = bundleOf(loaded.archive, SEGMENTS, [], { catalogArtifactId: CONTEXT }).fight;
  });

  it("returns AUTHORITY_NOT_AVAILABLE carrying exactly the evaluator's facts under the preflight identity", () => {
    const analysis = internalRun(fight, EVOKER);
    expect(analysis.status).toBe("AUTHORITY_NOT_AVAILABLE");
    expect(analysis.specId).toBe(AUGMENTATION_EVOKER_SPEC_ID);
    expect(analysis.domains).toEqual([
      { domain: "SUPPORT_TARGETING", resolution: "NO_PINNED_AUTHORITY_FOR_DOMAIN" },
      { domain: "SUPPORT_TIMING", resolution: "NO_PINNED_AUTHORITY_FOR_DOMAIN" },
    ]);
    expect(analysis.subjectSpecialization).toMatchObject({
      state: "STATED",
      className: "Evoker",
      specName: "Augmentation",
    });

    // The facade's identity reads the same friendlySpecs entry preflight does,
    // so its facts are the evaluator's facts under a preflight identity.
    const preflight: FightIdentity = {
      report: { code: fight.report.code, revision: fight.report.revision, startTime: 0, endTime: 0 },
      data: fight.data,
      fight: {
        id: fight.fight.id,
        name: fight.fight.name,
        encounterId: fight.fight.encounterId,
        difficulty: fight.fight.difficulty,
        startTime: fight.fight.startTimeMs,
        endTime: fight.fight.endTimeMs,
      },
      player: { sourceId: EVOKER, name: "Subject", className: "Evoker", specName: "Augmentation" },
    };
    expect(analysis.evaluation).toEqual(evaluateAugmentationEvoker({ fight, identity: preflight }));
    const evaluation = analysis.evaluation;
    if (evaluation?.state !== "EVALUATED") throw new Error("not evaluated");
    expect(evaluation.supportTargeting).toEqual({
      category: "SUPPORT_TARGETING",
      status: "NO_AUTHORITY_AVAILABLE",
      reason: "NO_APPROVED_RECIPIENT_QUALITY_MODEL",
    });
    expect(evaluation.supportTiming.status).toBe("NO_AUTHORITY_AVAILABLE");
    expect(evaluation.supportTiming.casts.length).toBeGreaterThan(0);
    expect(JSON.stringify(analysis)).not.toMatch(/wrong|incorrect|mistake/i);
  });

  it("refuses another stated specialization: no support fact, never an assumed Augmentation Evoker", () => {
    const other = [...fight.friendlySpecializations.byActorId.entries()].find(
      ([actorId, stated]) => actorId !== EVOKER && stated.state === "STATED" && stated.className !== "Evoker",
    );
    if (other === undefined) throw new Error("no other stated player");
    const analysis = internalRun(fight, other[0]);
    expect(analysis.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(analysis.evaluation).toEqual({
      revision: "augmentation-evoker-evaluator/3",
      state: "IDENTITY_REFUSED",
      reason: "NOT_THIS_SPECIALIZATION",
    });
  });

  it("a pet or unlisted actor has no stated specialization: INSUFFICIENT_EVIDENCE, nothing evaluated", () => {
    const pet = [...fight.actors.values()].find((actor) => actor.actorType === "PET");
    if (pet === undefined) throw new Error("no pet in the catalog");
    expect(statedSpecializationOf(fight.friendlySpecializations, pet.actorId)).toEqual({
      state: "UNKNOWN",
      reason: "NOT_IN_FRIENDLY_ROSTER",
    });
    const analysis = internalRun(fight, pet.actorId);
    expect(analysis.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(analysis.evaluation).toBeNull();
    expect(analysis.subjectSpecialization).toEqual({ state: "UNKNOWN", reason: "NOT_IN_FRIENDLY_ROSTER" });
  });

  it("unusable runtime data is INSUFFICIENT_EVIDENCE, never an empty fact list", () => {
    const unusable = {
      ok: false,
      reason: "PINNED_ROW_MISMATCH",
    } as unknown as AugmentationSupportAbilityLoad;
    const analysis = analyzeAugmentationEvoker(
      {
        state: createCombatState(fight),
        actorId: EVOKER,
        specId: AUGMENTATION_EVOKER_SPEC_ID,
        targetActorId: null,
      },
      AUGMENTATION_EVOKER_REGISTRATION.authority,
      { dataset: unusable },
    );
    expect(analysis.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(analysis.evaluation?.state).toBe("RUNTIME_DATA_UNAVAILABLE");
  });

  it("a public request for the Augmentation Evoker runs the registration once, at the DERIVED FULL_RAID scope, and publishes its support observations", async () => {
    const counted = countedProductionCatalog();
    const scopes: IngestionScope[] = [];
    const result = await analyzeFight(
      { reportCode: fight.report.code, fightId: fight.fight.id, sourceId: EVOKER },
      {
        env: MCP_TEST_ENV,
        registry: counted.registry,
        preflight: async () => ({
          ok: true,
          rateLimit: undefined,
          identity: {
            report: { code: fight.report.code, revision: fight.report.revision, startTime: 0, endTime: 0 },
            data: fight.data,
            fight: {
              id: fight.fight.id,
              name: fight.fight.name,
              encounterId: fight.fight.encounterId,
              difficulty: fight.fight.difficulty,
              startTime: fight.fight.startTimeMs,
              endTime: fight.fight.endTimeMs,
            },
            player: { sourceId: EVOKER, name: "Subject", className: "Evoker", specName: "Augmentation" },
          },
        }),
        ingest: async (request) => {
          scopes.push(request.scope);
          return { ok: true, fight, rateLimit: undefined };
        },
      },
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state).toBe("PARTIAL");
    expect(result.analysis.analysis.status).toBe("AUTHORITY_NOT_AVAILABLE");
    expect(result.analysis.specId).toBe(AUGMENTATION_EVOKER_SPEC_ID);
    expect(result.analysis.analyzerId).toBe(AUGMENTATION_EVOKER_ANALYZER_ID);
    expect(result.analysis.observedDecisions).toBeNull();
    expect(result.analysis.supportObservations?.assessment).toBe("ASSESSED");
    expect(counted.calls[AUGMENTATION_EVOKER_ANALYZER_ID]).toBe(1);
    for (const [analyzerId, calls] of Object.entries(counted.calls)) {
      if (analyzerId !== AUGMENTATION_EVOKER_ANALYZER_ID) expect(calls, analyzerId).toBe(0);
    }
    // One retrieval, at the scope derived from the registration's declared
    // requirement unioned with preparation's: FULL_RAID, never hand-picked.
    expect(scopes).toEqual(["FULL_RAID"]);
  });
});
