/**
 * M10-C: the Protection Paladin authority binding, loader and access boundary.
 */

import { describe, expect, it } from "vitest";

import { PROVIDER_DOMAIN_COMPATIBILITY, providerMayGovern } from "../../src/findings/authority-domain.js";
import { defineAnalyzerRegistration } from "../../src/findings/analyzer-registration.js";
import { validateAnalyzerCatalog, PRODUCTION_CATALOG } from "../../src/services/analyzer-registry.js";
import paladinArtifact from "../../src/simc/data/paladin-protection.apl.json";
import rogueArtifact from "../../src/simc/data/rogue-assassination.apl.json";
import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";
import {
  PROTECTION_AUTHORITY_BINDINGS,
  PROTECTION_CAPABILITIES,
  PROTECTION_DECLARED_DOMAINS,
  PROTECTION_OFFENSIVE_AUTHORITY,
  standaloneProtectionAuthorityAccess,
} from "../../src/specs/paladin/protection/authority-bindings.js";
import {
  pinnedProtectionPaladinAuthority,
  resetProtectionPaladinAuthorityCache,
  PROTECTION_PALADIN_AUTHORITY_IDENTITY,
} from "../../src/specs/paladin/protection/pinned-authority.js";
import { PROTECTION_PALADIN_REGISTRATION } from "../../src/specs/paladin/protection/registration.js";
import { ASSASSINATION_REGISTRATION } from "../../src/specs/rogue/assassination/registration.js";
import { defineSpecAtomVocabulary } from "../../src/simc/expression/spec-vocabulary.js";
import { isBuiltinIdentifier } from "../../src/simc/expression/parse.js";
import { evaluateCondition } from "../../src/simc/list-selection.js";
import { unknownNumber } from "../../src/simc/expression/evaluate.js";
import { PROTECTION_ATOM_DECLARATIONS } from "../../src/specs/paladin/protection/vocabulary.js";

describe("the loader", () => {
  it("loads the pinned artifact once and memoises the result", () => {
    resetProtectionPaladinAuthorityCache();
    const first = pinnedProtectionPaladinAuthority();
    const second = pinnedProtectionPaladinAuthority();
    expect(first.ok).toBe(true);
    expect(second).toBe(first);
    resetProtectionPaladinAuthorityCache();
    const third = pinnedProtectionPaladinAuthority();
    expect(third).not.toBe(first);
    expect(third.ok).toBe(true);
    if (third.ok) expect(third.authority.artifact.authorityId).toBe("SIMC_APL_PALADIN_PROTECTION");
  });

  it("the binding's identity is read off the artifact, and matches what load() yields", () => {
    expect(PROTECTION_PALADIN_AUTHORITY_IDENTITY).toEqual({
      authorityId: paladinArtifact.authorityId,
      artifactRevision: paladinArtifact.artifactRevision,
      commitSha: paladinArtifact.provenance.commitSha,
    });
    expect(PROTECTION_OFFENSIVE_AUTHORITY).toMatchObject({
      kind: "SIMC_APL",
      domain: "OFFENSIVE_ROTATION",
      authorityId: "SIMC_APL_PALADIN_PROTECTION",
      artifactRevision: "simc-33622e9d-1",
      commitSha: "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
    });
    const loaded = PROTECTION_OFFENSIVE_AUTHORITY.load();
    expect(loaded.ok).toBe(true);
    if (loaded.ok) {
      expect(loaded.authority.artifact.spec).toEqual({ className: "paladin", specName: "protection" });
      expect(loaded.authority.artifact.provenance.sourceSha256).toBe(
        "ed3fb1ac5b1c6c83bf21abbcaff5afe282678a69d51bdc953cc9897dca94bc02",
      );
    }
  });
});

describe("the binding and the declared domains", () => {
  it("binds exactly one authority, to OFFENSIVE_ROTATION, and declares six capabilities across six domains", () => {
    expect(PROTECTION_AUTHORITY_BINDINGS).toHaveLength(1);
    expect(PROTECTION_CAPABILITIES.map((capability) => capability.domain)).toEqual([
      "OFFENSIVE_ROTATION",
      "RESOURCE_SPENDING",
      "ACTIVE_MITIGATION",
      "DEFENSIVE_COOLDOWN",
      "SELF_HEALING",
      "INTERRUPT",
    ]);
    expect([...PROTECTION_DECLARED_DOMAINS]).toEqual(PROTECTION_CAPABILITIES.map((c) => c.domain));
    // Only the offensive capability reads Holy Power through the wire; the
    // derived ingestion requirement follows.
    expect(PROTECTION_PALADIN_REGISTRATION.requirement).toEqual({
      analyzerId: "paladin-protection-observed-decisions",
      requiredScope: "PLAYER_CONTEXT",
      includeResources: true,
    });
  });

  it("resolves the six domains as the registration and the standalone access both state", () => {
    for (const access of [PROTECTION_PALADIN_REGISTRATION.authority, standaloneProtectionAuthorityAccess()]) {
      const offensive = access.forDomain("OFFENSIVE_ROTATION");
      expect(offensive.outcome).toBe("AUTHORITY_AVAILABLE");
      if (offensive.outcome === "AUTHORITY_AVAILABLE") {
        expect(offensive.authority.artifact.authorityId).toBe("SIMC_APL_PALADIN_PROTECTION");
      }
      for (const domain of [
        "RESOURCE_SPENDING",
        "ACTIVE_MITIGATION",
        "DEFENSIVE_COOLDOWN",
        "SELF_HEALING",
        "INTERRUPT",
      ] as const) {
        expect(access.forDomain(domain)).toEqual({ outcome: "NO_PINNED_AUTHORITY_FOR_DOMAIN", domain });
      }
    }
  });

  it("a SimulationCraft APL may govern OFFENSIVE_ROTATION and no other domain", () => {
    expect(PROVIDER_DOMAIN_COMPATIBILITY.SIMC_APL).toEqual(["OFFENSIVE_ROTATION"]);
    for (const domain of PROTECTION_DECLARED_DOMAINS.filter((d) => d !== "OFFENSIVE_ROTATION")) {
      expect(providerMayGovern("SIMC_APL", domain), domain).toBe(false);
    }
  });

  it("the registry refuses a Paladin registration that binds the offensive artifact to a defensive domain", () => {
    const forged = defineAnalyzerRegistration({
      analyzerId: "forged-defensive-binding",
      specId: "paladin/protection",
      displayName: "Forged Protection Paladin",
      exposure: "INTERNAL_ONLY",
      capabilities: PROTECTION_CAPABILITIES,
      authorityBindings: [
        PROTECTION_OFFENSIVE_AUTHORITY,
        { ...PROTECTION_OFFENSIVE_AUTHORITY, domain: "ACTIVE_MITIGATION" },
      ],
      analyze: PROTECTION_PALADIN_REGISTRATION.analyze,
      observedDecisionView: PROTECTION_PALADIN_REGISTRATION.observedDecisionView,
    });
    const validation = validateAnalyzerCatalog([ASSASSINATION_REGISTRATION, forged]);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.defects.map((d) => d.defect)).toContain("PROVIDER_DOMAIN_INCOMPATIBLE");
    }
  });

  it("the registry refuses a Paladin registration whose binding loads the Rogue artifact", () => {
    const forged = defineAnalyzerRegistration({
      analyzerId: "forged-rogue-authority",
      specId: "paladin/protection",
      displayName: "Forged Protection Paladin",
      exposure: "INTERNAL_ONLY",
      capabilities: PROTECTION_CAPABILITIES,
      authorityBindings: [
        {
          kind: "SIMC_APL",
          domain: "OFFENSIVE_ROTATION",
          authorityId: rogueArtifact.authorityId,
          artifactRevision: rogueArtifact.artifactRevision,
          commitSha: rogueArtifact.provenance.commitSha,
          load: pinnedAssassinationAuthority,
        },
      ],
      analyze: PROTECTION_PALADIN_REGISTRATION.analyze,
      observedDecisionView: PROTECTION_PALADIN_REGISTRATION.observedDecisionView,
    });
    const validation = validateAnalyzerCatalog([ASSASSINATION_REGISTRATION, forged]);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      const mismatch = validation.defects.find((d) => d.defect === "AUTHORITY_ARTIFACT_MISMATCH");
      expect(mismatch?.detail).toContain("specialization");
    }
  });
});

describe("cross-spec authority access is refused structurally", () => {
  it("each registration's access resolves ITS artifact and can be asked for no other", () => {
    const rogue = ASSASSINATION_REGISTRATION.authority.forDomain("OFFENSIVE_ROTATION");
    const paladin = PROTECTION_PALADIN_REGISTRATION.authority.forDomain("OFFENSIVE_ROTATION");
    expect(rogue.outcome).toBe("AUTHORITY_AVAILABLE");
    expect(paladin.outcome).toBe("AUTHORITY_AVAILABLE");
    if (rogue.outcome === "AUTHORITY_AVAILABLE" && paladin.outcome === "AUTHORITY_AVAILABLE") {
      expect(rogue.authority.artifact.authorityId).toBe("SIMC_APL_ROGUE_ASSASSINATION");
      expect(paladin.authority.artifact.authorityId).toBe("SIMC_APL_PALADIN_PROTECTION");
    }
    // The access object has exactly one method and takes a DOMAIN, not a spec
    // or an authority id: there is no argument through which the other
    // specialization's binding could be requested.
    expect(Object.keys(PROTECTION_PALADIN_REGISTRATION.authority)).toEqual(["forDomain"]);
    expect(Object.isFrozen(PROTECTION_PALADIN_REGISTRATION.authority)).toBe(true);
  });

  it("the production catalog holds the seventeen registrations, each citing only its own authority (Augmentation and the seven healers none)", () => {
    const cited = PRODUCTION_CATALOG.registrations.map((registration) => [
      registration.specId,
      registration.authorityBindings.map((binding) => binding.authorityId),
    ]);
    // M11-A4: the two Paladin specializations pin the SAME file and commit
    // under DISTINCT authority ids; the duplicate-binding rule keys on the id
    // and the domain, so the pairing is legal and each row cites its own.
    expect(cited).toEqual([
      ["rogue/assassination", ["SIMC_APL_ROGUE_ASSASSINATION"]],
      ["paladin/protection", ["SIMC_APL_PALADIN_PROTECTION"]],
      ["paladin/retribution", ["SIMC_APL_PALADIN_RETRIBUTION"]],
      ["deathknight/blood", ["SIMC_APL_DEATHKNIGHT_BLOOD"]],
      ["monk/brewmaster", ["SIMC_APL_MONK_BREWMASTER"]],
      // M13-E: binds no decision authority; its families are provider-less.
      ["evoker/augmentation", []],
      // HEAL-A: binds no pinned decision authority; its healer families are provider-less.
      ["shaman/restoration", []],
      // HEAL-B1: the three healer rows on the same architecture bind nothing either.
      ["paladin/holy", []],
      ["druid/restoration", []],
      ["monk/mistweaver", []],
      // HEAL-B2: Holy Priest binds nothing either.
      ["priest/holy", []],
      // HEAL-B3: Discipline Priest binds nothing either.
      ["priest/discipline", []],
      // HEAL-B4: Preservation Evoker binds nothing either.
      ["evoker/preservation", []],
      // ONB-A1: Havoc Demon Hunter binds its own pinned list.
      ["demonhunter/havoc", ["SIMC_APL_DEMONHUNTER_HAVOC"]],
      // ONB-A2: Cohort A's followers each bind their own pinned list.
      ["rogue/subtlety", ["SIMC_APL_ROGUE_SUBTLETY"]],
      ["warrior/fury", ["SIMC_APL_WARRIOR_FURY"]],
      ["warrior/protection", ["SIMC_APL_WARRIOR_PROTECTION"]],
      // ONB-B1: Cohort B's representative binds its own pinned list.
      ["warrior/arms", ["SIMC_APL_WARRIOR_ARMS"]],
      ["deathknight/frost", ["SIMC_APL_DEATHKNIGHT_FROST"]],
      ["shaman/enhancement", ["SIMC_APL_SHAMAN_ENHANCEMENT"]],
    ]);
  });
});

describe("resolver ownership", () => {
  it("the Protection vocabulary is owned by paladin/protection and a duplicate declaration is refused", () => {
    const vocabulary = defineSpecAtomVocabulary(
      "paladin/protection",
      PROTECTION_ATOM_DECLARATIONS,
      isBuiltinIdentifier,
    );
    expect(vocabulary.ownerSpecId).toBe("paladin/protection");
    const first = PROTECTION_ATOM_DECLARATIONS[0];
    if (first === undefined) throw new Error("empty");
    expect(() =>
      defineSpecAtomVocabulary(
        "paladin/protection",
        [...PROTECTION_ATOM_DECLARATIONS, first],
        isBuiltinIdentifier,
      ),
    ).toThrow(/DUPLICATE_IDENTIFIER/);
  });

  it("the Rogue registration carries no vocabulary: its bindings never name specAtoms", () => {
    // Structural: the Rogue facade's bindings are built in its own tree and
    // the cross-spec sweep forbids it from importing the Paladin vocabulary.
    // Behavioural: the Rogue authority parses without any vocabulary, and a
    // Paladin identifier in a Rogue line is refused whole.
    const loaded = pinnedAssassinationAuthority();
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const [first] = loaded.authority.actions;
    if (first === undefined) throw new Error("empty authority");
    const withPaladinAtom = { ...first, conditionRaw: "hero_tree.lightsmith" };
    const condition = evaluateCondition(withPaladinAtom, {
      comboPoints: unknownNumber("STATE_NOT_ESTABLISHED"),
      comboPointsDeficit: unknownNumber("STATE_NOT_ESTABLISHED"),
      energyPct: unknownNumber("STATE_NOT_ESTABLISHED"),
      knownBuffs: [],
    });
    expect(condition).toEqual({
      kind: "UNSUPPORTED",
      reason: "UNSUPPORTED_IDENTIFIER",
      fragment: "hero_tree.lightsmith",
    });
  });
});
