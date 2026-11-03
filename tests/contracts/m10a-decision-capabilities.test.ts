/**
 * M10-A: state requirements are declared per decision capability, validated,
 * and are what ingestion scope is derived from.
 */

import { describe, expect, it } from "vitest";

import { RESOURCE_IDS } from "../../src/data/wcl-wire/resource-types.js";
import { AUTHORITY_DOMAINS } from "../../src/findings/authority-domain.js";
import {
  declaredDomainsOf,
  requirementFromCapabilities,
  TARGET_MODELS,
  validateCapabilities,
  type DecisionCapability,
} from "../../src/findings/decision-capability.js";
import {
  deriveIngestionScope,
  deriveIngestionScopeFor,
  INGESTION_SCOPES,
} from "../../src/services/ingestion-scope.js";
import { ENABLED_ANALYSIS_REQUIREMENTS } from "../../src/services/analyzer-registry.js";
import { EVIDENCE_CATEGORIES } from "../../src/wcl/evidence-capability.js";
import {
  ASSASSINATION_ANALYZER_ID,
  ASSASSINATION_REGISTRATION,
  ASSASSINATION_ROTATION_CAPABILITY,
} from "../../src/specs/rogue/assassination/registration.js";
import { fixtureRegistration } from "../support/fixture-registration.js";

const VALID: DecisionCapability = ASSASSINATION_ROTATION_CAPABILITY;

function defectsOf(capabilities: readonly DecisionCapability[]): readonly string[] {
  return validateCapabilities(capabilities).map((defect) => defect.defect);
}

describe("Assassination's declaration is exactly one capability", () => {
  it("declares one observed-rotation capability in the OFFENSIVE_ROTATION domain", () => {
    expect(ASSASSINATION_REGISTRATION.capabilities).toHaveLength(1);
    expect(VALID.capabilityId).toBe("rogue-assassination.observed-rotational-decision");
    expect(VALID.domain).toBe("OFFENSIVE_ROTATION");
    expect(declaredDomainsOf(ASSASSINATION_REGISTRATION.capabilities)).toEqual(["OFFENSIVE_ROTATION"]);
  });

  it("names only vocabulary this build knows", () => {
    expect(defectsOf([VALID])).toEqual([]);
    for (const resource of VALID.requirements.resources) expect(RESOURCE_IDS).toContain(resource);
    for (const category of VALID.requirements.evidenceCategories)
      expect(EVIDENCE_CATEGORIES).toContain(category);
    expect(INGESTION_SCOPES).toContain(VALID.requirements.scope);
    expect(TARGET_MODELS).toContain(VALID.requirements.targetModel);
    expect(AUTHORITY_DOMAINS).toContain(VALID.domain);
  });

  it("reads combo points and energy, per observed cast, at PLAYER_CONTEXT", () => {
    expect(VALID.requirements).toEqual({
      scope: "PLAYER_CONTEXT",
      resources: ["COMBO_POINTS", "ENERGY"],
      evidenceCategories: ["CASTS", "RESOURCES", "AURAS", "COMBATANT_INFO", "GEAR"],
      targetModel: "PER_OBSERVED_CAST",
    });
  });
});

describe("the ingestion requirement is derived from the declaration", () => {
  it("derives exactly the requirement Assassination stated by hand before M10-A", () => {
    expect(requirementFromCapabilities(ASSASSINATION_ANALYZER_ID, [VALID])).toEqual({
      analyzerId: "rogue-assassination-observed-decisions",
      requiredScope: "PLAYER_CONTEXT",
      includeResources: true,
    });
    expect(ASSASSINATION_REGISTRATION.requirement).toEqual(
      requirementFromCapabilities(ASSASSINATION_ANALYZER_ID, [VALID]),
    );
  });

  it("derives includeResources === true because a resource is named, not because it was typed", () => {
    const noResources: DecisionCapability = {
      ...VALID,
      requirements: { ...VALID.requirements, resources: [] },
    };
    expect(requirementFromCapabilities("x", [noResources]).includeResources).toBe(false);
    expect(requirementFromCapabilities("x", [VALID]).includeResources).toBe(true);
  });

  it("takes the widest scope across capabilities", () => {
    const wide: DecisionCapability = {
      ...VALID,
      capabilityId: "wide",
      requirements: { ...VALID.requirements, scope: "FULL_RAID", resources: [] },
    };
    expect(requirementFromCapabilities("x", [VALID, wide]).requiredScope).toBe("FULL_RAID");
    expect(requirementFromCapabilities("x", [VALID, wide]).includeResources).toBe(true);
  });

  it("scope derivation over registrations still unions, as the raid-night path relies on", () => {
    const fixture = fixtureRegistration();
    expect(deriveIngestionScopeFor([ASSASSINATION_REGISTRATION])).toEqual(
      deriveIngestionScope([ASSASSINATION_REGISTRATION.requirement]),
    );
    const both = deriveIngestionScopeFor([ASSASSINATION_REGISTRATION, fixture]);
    expect(both.ok).toBe(true);
    if (!both.ok) return;
    expect(both.scope).toBe("FULL_RAID");
    expect(both.contributingAnalyzers).toEqual([fixture.analyzerId]);
  });

  it("the build's public requirement set is the eleven public analyzers' derived requirements", () => {
    expect(ENABLED_ANALYSIS_REQUIREMENTS).toEqual([
      {
        analyzerId: "rogue-assassination-observed-decisions",
        requiredScope: "PLAYER_CONTEXT",
        includeResources: true,
      },
      {
        analyzerId: "paladin-protection-observed-decisions",
        requiredScope: "PLAYER_CONTEXT",
        includeResources: true,
      },
      {
        analyzerId: "paladin-retribution-observed-decisions",
        requiredScope: "PLAYER_CONTEXT",
        includeResources: true,
      },
      {
        analyzerId: "deathknight-blood-observed-decisions",
        requiredScope: "PLAYER_CONTEXT",
        includeResources: true,
      },
      // M11-C4j: Brewmaster declares ENERGY since its promotion (the decision
      // cast's own PRE_COST Energy, read by Keg Smash's affordability).
      {
        analyzerId: "monk-brewmaster-observed-decisions",
        requiredScope: "PLAYER_CONTEXT",
        includeResources: true,
      },
      // M13-F: Augmentation Evoker, FULL_RAID by its declared support inputs, no resources.
      {
        analyzerId: "evoker-augmentation-support-observations",
        requiredScope: "FULL_RAID",
        includeResources: false,
      },
      // HEAL-AP: Restoration Shaman, FULL_RAID by its declared healer inputs, no resources.
      {
        analyzerId: "shaman-restoration-healer-findings",
        requiredScope: "FULL_RAID",
        includeResources: false,
      }, // HEAL-B1P: Holy Paladin and Mistweaver Monk, FULL_RAID by their declared healer inputs, no resources.
      {
        analyzerId: "paladin-holy-healer-findings",
        requiredScope: "FULL_RAID",
        includeResources: false,
      },
      {
        analyzerId: "monk-mistweaver-healer-findings",
        requiredScope: "FULL_RAID",
        includeResources: false,
      }, // HEAL-B2P: Holy Priest, FULL_RAID by its declared healer inputs, no resources.
      {
        analyzerId: "priest-holy-healer-findings",
        requiredScope: "FULL_RAID",
        includeResources: false,
      }, // HEAL-B4P: Preservation Evoker, FULL_RAID by its declared healer inputs, no resources.
      {
        analyzerId: "evoker-preservation-healer-findings",
        requiredScope: "FULL_RAID",
        includeResources: false,
      },
    ]);
  });
});

describe("invalid declarations fail closed", () => {
  it("duplicate capability ids", () => {
    expect(defectsOf([VALID, { ...VALID }])).toContain("DUPLICATE_CAPABILITY_ID");
  });

  it("an unknown domain", () => {
    const bad = { ...VALID, domain: "TAUNTING" as DecisionCapability["domain"] };
    expect(defectsOf([bad])).toContain("UNKNOWN_AUTHORITY_DOMAIN");
  });

  it("an unknown resource id — MAELSTROM has no wire contract", () => {
    // RUNIC_POWER was the example until M11-B2 gave it a corroborated contract.
    const bad: DecisionCapability = {
      ...VALID,
      requirements: { ...VALID.requirements, resources: ["MAELSTROM" as (typeof RESOURCE_IDS)[number]] },
    };
    expect(defectsOf([bad])).toContain("UNKNOWN_RESOURCE_ID");
  });

  it("RUNES and RUNIC_POWER are declarable resources since M11-B2, on captured evidence", () => {
    const bloodShaped: DecisionCapability = {
      ...VALID,
      requirements: { ...VALID.requirements, resources: ["RUNES", "RUNIC_POWER"] },
    };
    expect(defectsOf([bloodShaped])).toEqual([]);
  });

  it("HOLY_POWER is a declarable resource since M10-B, on captured evidence", () => {
    const paladinShaped: DecisionCapability = {
      ...VALID,
      requirements: { ...VALID.requirements, resources: ["HOLY_POWER"] },
    };
    expect(defectsOf([paladinShaped])).toEqual([]);
  });

  it("an unknown evidence category", () => {
    const bad: DecisionCapability = {
      ...VALID,
      requirements: {
        ...VALID.requirements,
        evidenceCategories: ["MOVEMENT" as (typeof EVIDENCE_CATEGORIES)[number]],
      },
    };
    expect(defectsOf([bad])).toContain("UNKNOWN_EVIDENCE_CATEGORY");
  });

  it("an unknown ingestion scope", () => {
    const bad: DecisionCapability = {
      ...VALID,
      requirements: { ...VALID.requirements, scope: "ROLE_GROUP" as (typeof INGESTION_SCOPES)[number] },
    };
    expect(defectsOf([bad])).toContain("UNKNOWN_INGESTION_SCOPE");
  });

  it("an unknown target model", () => {
    const bad: DecisionCapability = {
      ...VALID,
      requirements: { ...VALID.requirements, targetModel: "CYCLE_TARGETS" as (typeof TARGET_MODELS)[number] },
    };
    expect(defectsOf([bad])).toContain("UNKNOWN_TARGET_MODEL");
  });

  it("a per-observed-cast capability that does not declare CASTS is incoherent", () => {
    const bad: DecisionCapability = {
      ...VALID,
      requirements: { ...VALID.requirements, evidenceCategories: ["RESOURCES"] },
    };
    expect(defectsOf([bad])).toContain("TARGET_MODEL_REQUIRES_CASTS");
  });

  it("an empty declaration", () => {
    expect(defectsOf([])).toEqual(["NO_CAPABILITIES_DECLARED"]);
  });

  it("reports every defect, not the first", () => {
    const bad: DecisionCapability = {
      ...VALID,
      domain: "TAUNTING" as DecisionCapability["domain"],
      requirements: { ...VALID.requirements, resources: ["MANA" as (typeof RESOURCE_IDS)[number]] },
    };
    const defects = defectsOf([bad]);
    expect(defects).toContain("UNKNOWN_AUTHORITY_DOMAIN");
    expect(defects).toContain("UNKNOWN_RESOURCE_ID");
  });
});
