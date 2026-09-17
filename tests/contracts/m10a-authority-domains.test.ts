/**
 * M10-A: authority is bound per domain, owned by the registration, and its
 * absence is a typed resolution outcome — never a binding, never UNKNOWN.
 */

import { describe, expect, it } from "vitest";

import {
  DECISION_AUTHORITY_KINDS,
  DECISION_AUTHORITY_KINDS as KINDS,
  NO_AUTHORITY_REASONS,
} from "../../src/findings/authority.js";
import {
  AUTHORITY_DOMAINS,
  AUTHORITY_RESOLUTION_OUTCOMES,
  PROVIDER_DOMAIN_COMPATIBILITY,
  providerMayGovern,
  resolveAuthorityForDomain,
  type AuthorityDomain,
  type AuthorityDomainBinding,
} from "../../src/findings/authority-domain.js";
import { UNKNOWN_REASONS } from "../../src/engine/state/state-result.js";
import { validateAnalyzerCatalog, type AnalyzerRegistration } from "../../src/services/analyzer-registry.js";
import rogueAssassinationArtifact from "../../src/simc/data/rogue-assassination.apl.json";
import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";
import {
  ASSASSINATION_OFFENSIVE_AUTHORITY,
  ASSASSINATION_REGISTRATION,
} from "../../src/specs/rogue/assassination/registration.js";
import { fixtureRegistration } from "../support/fixture-registration.js";

function defectsOf(catalog: readonly AnalyzerRegistration[]): readonly string[] {
  const validation = validateAnalyzerCatalog(catalog);
  return validation.ok ? [] : validation.defects.map((defect) => `${defect.defect}:${defect.detail}`);
}

describe("the domain vocabulary keeps tank decisions apart", () => {
  it("declares the six decision families separately", () => {
    expect([...AUTHORITY_DOMAINS]).toEqual([
      "OFFENSIVE_ROTATION",
      "RESOURCE_SPENDING",
      "ACTIVE_MITIGATION",
      "DEFENSIVE_COOLDOWN",
      "SELF_HEALING",
      "INTERRUPT",
    ]);
  });

  it("a SimulationCraft APL may govern OFFENSIVE_ROTATION and nothing else", () => {
    expect(PROVIDER_DOMAIN_COMPATIBILITY).toEqual({ SIMC_APL: ["OFFENSIVE_ROTATION"] });
    for (const domain of AUTHORITY_DOMAINS) {
      expect(providerMayGovern("SIMC_APL", domain)).toBe(domain === "OFFENSIVE_ROTATION");
    }
  });

  it("compatibility is declared for every provider kind, and there is still exactly one", () => {
    expect(Object.keys(PROVIDER_DOMAIN_COMPATIBILITY).sort()).toEqual([...KINDS].sort());
    expect([...DECISION_AUTHORITY_KINDS]).toEqual(["SIMC_APL"]);
  });
});

describe("Assassination binds only its pinned offensive-rotation authority", () => {
  it("has exactly one binding, for OFFENSIVE_ROTATION, of kind SIMC_APL", () => {
    expect(ASSASSINATION_REGISTRATION.authorityBindings).toHaveLength(1);
    const [binding] = ASSASSINATION_REGISTRATION.authorityBindings;
    expect(binding?.kind).toBe("SIMC_APL");
    expect(binding?.domain).toBe("OFFENSIVE_ROTATION");
  });

  it("names the committed artifact's identity, revision and commit exactly", () => {
    expect(ASSASSINATION_OFFENSIVE_AUTHORITY.authorityId).toBe("SIMC_APL_ROGUE_ASSASSINATION");
    expect(ASSASSINATION_OFFENSIVE_AUTHORITY.artifactRevision).toBe("simc-33622e9d-1");
    expect(ASSASSINATION_OFFENSIVE_AUTHORITY.commitSha).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    // And those are the artifact's own values, not a second copy.
    expect(ASSASSINATION_OFFENSIVE_AUTHORITY.authorityId).toBe(rogueAssassinationArtifact.authorityId);
    expect(ASSASSINATION_OFFENSIVE_AUTHORITY.artifactRevision).toBe(
      rogueAssassinationArtifact.artifactRevision,
    );
    expect(ASSASSINATION_OFFENSIVE_AUTHORITY.commitSha).toBe(rogueAssassinationArtifact.provenance.commitSha);
  });

  it("resolves to the very authority the pinned loader yields", () => {
    const resolved = ASSASSINATION_REGISTRATION.authority.forDomain("OFFENSIVE_ROTATION");
    expect(resolved.outcome).toBe("AUTHORITY_AVAILABLE");
    if (resolved.outcome !== "AUTHORITY_AVAILABLE") return;
    const pinned = pinnedAssassinationAuthority();
    if (!pinned.ok) throw new Error("pinned authority failed to load");
    expect(resolved.authority).toBe(pinned.authority);
    expect(resolved.authority.artifact.spec).toEqual({ className: "rogue", specName: "assassination" });
  });

  it("answers every other domain with a no-authority outcome, never UNKNOWN", () => {
    for (const domain of AUTHORITY_DOMAINS) {
      if (domain === "OFFENSIVE_ROTATION") continue;
      const resolved = ASSASSINATION_REGISTRATION.authority.forDomain(domain);
      // Assassination declares no tank capability, so the domain is undeclared —
      // a different statement from "declared but unbound".
      expect(resolved.outcome, domain).toBe("DOMAIN_NOT_DECLARED");
    }
  });
});

describe("the registry checks a binding against its artifact", () => {
  function withBinding(overrides: Partial<AuthorityDomainBinding>): AnalyzerRegistration {
    return {
      ...ASSASSINATION_REGISTRATION,
      authorityBindings: [{ ...ASSASSINATION_OFFENSIVE_AUTHORITY, ...overrides }],
    };
  }

  it("a revision the artifact does not carry fails", () => {
    expect(defectsOf([withBinding({ artifactRevision: "simc-deadbeef-9" })]).join("\n")).toContain(
      "AUTHORITY_ARTIFACT_MISMATCH",
    );
  });

  it("a commit the artifact does not carry fails", () => {
    expect(defectsOf([withBinding({ commitSha: "0".repeat(40) })]).join("\n")).toContain(
      "AUTHORITY_ARTIFACT_MISMATCH",
    );
  });

  it("an authority id the artifact does not carry fails", () => {
    expect(defectsOf([withBinding({ authorityId: "SIMC_APL_PALADIN_PROTECTION" })]).join("\n")).toContain(
      "AUTHORITY_ARTIFACT_MISMATCH",
    );
  });

  it("no other specialization can register Assassination's binding as its own", () => {
    // The Rogue artifact bound by a Paladin registration: the artifact's
    // specialization disagrees with the registration's, and the catalog refuses.
    const borrowed = fixtureRegistration({
      capabilities: [
        {
          capabilityId: "borrowed-rotation",
          domain: "OFFENSIVE_ROTATION",
          requirements: {
            scope: "PLAYER_CONTEXT",
            resources: [],
            evidenceCategories: ["CASTS"],
            targetModel: "PER_OBSERVED_CAST",
          },
        },
      ],
      authorityBindings: [ASSASSINATION_OFFENSIVE_AUTHORITY],
    });
    const defects = defectsOf([ASSASSINATION_REGISTRATION, borrowed]).join("\n");
    expect(defects).toContain("AUTHORITY_ARTIFACT_MISMATCH");
    expect(defects).toContain("specialization");
  });

  it("a SimulationCraft APL bound to a defensive domain fails as provider/domain incompatibility", () => {
    const laundered = fixtureRegistration({
      authorityBindings: [{ ...ASSASSINATION_OFFENSIVE_AUTHORITY, domain: "ACTIVE_MITIGATION" }],
    });
    const defects = defectsOf([ASSASSINATION_REGISTRATION, laundered]).join("\n");
    expect(defects).toContain("PROVIDER_DOMAIN_INCOMPATIBLE");
  });

  it("a binding for a domain no capability declares is an orphan", () => {
    const orphan = fixtureRegistration({
      authorityBindings: [{ ...ASSASSINATION_OFFENSIVE_AUTHORITY, domain: "OFFENSIVE_ROTATION" }],
    });
    // The fixture declares ACTIVE_MITIGATION only, so OFFENSIVE_ROTATION is unowned here.
    expect(defectsOf([ASSASSINATION_REGISTRATION, orphan]).join("\n")).toContain("ORPHAN_AUTHORITY_BINDING");
  });

  it("two bindings for one domain fail", () => {
    const doubled: AnalyzerRegistration = {
      ...ASSASSINATION_REGISTRATION,
      authorityBindings: [ASSASSINATION_OFFENSIVE_AUTHORITY, ASSASSINATION_OFFENSIVE_AUTHORITY],
    };
    expect(defectsOf([doubled]).join("\n")).toContain("DUPLICATE_AUTHORITY_BINDING");
  });
});

describe("no-authority outcomes are typed, distinct, and not evidence UNKNOWN", () => {
  const declared: readonly AuthorityDomain[] = ["OFFENSIVE_ROTATION", "ACTIVE_MITIGATION"];

  it("undeclared domain and declared-without-authority are different outcomes", () => {
    expect(resolveAuthorityForDomain(declared, [], "SELF_HEALING").outcome).toBe("DOMAIN_NOT_DECLARED");
    expect(resolveAuthorityForDomain(declared, [], "ACTIVE_MITIGATION").outcome).toBe(
      "NO_PINNED_AUTHORITY_FOR_DOMAIN",
    );
  });

  it("a bound artifact that fails to load is its own outcome, carrying the reason", () => {
    const failing: AuthorityDomainBinding = {
      ...ASSASSINATION_OFFENSIVE_AUTHORITY,
      load: () => ({ ok: false, reason: "MALFORMED_LISTS", detail: "test double" }),
    };
    const resolved = resolveAuthorityForDomain(declared, [failing], "OFFENSIVE_ROTATION");
    expect(resolved.outcome).toBe("AUTHORITY_LOAD_FAILED");
    if (resolved.outcome !== "AUTHORITY_LOAD_FAILED") return;
    expect(resolved.reason).toBe("MALFORMED_LISTS");
  });

  it("the fixture's declared tank domain resolves to no pinned authority, truthfully", () => {
    const fixture = fixtureRegistration();
    expect(fixture.authority.forDomain("ACTIVE_MITIGATION").outcome).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    // And it cannot see Assassination's binding through its own access object.
    expect(fixture.authority.forDomain("OFFENSIVE_ROTATION").outcome).toBe("DOMAIN_NOT_DECLARED");
  });

  it("the resolution vocabulary shares no member with the evidence UNKNOWN reasons", () => {
    for (const outcome of AUTHORITY_RESOLUTION_OUTCOMES) {
      expect(UNKNOWN_REASONS as readonly string[]).not.toContain(outcome);
      expect(outcome).not.toContain("UNKNOWN");
    }
    // The finding-level no-authority reason stays what it was.
    expect([...NO_AUTHORITY_REASONS]).toEqual(["NO_PINNED_AUTHORITY_FOR_SPEC"]);
  });

  it("there is no NONE binding kind and no way to spell one", () => {
    const binding: AuthorityDomainBinding["kind"] = "SIMC_APL";
    expect(binding).toBe("SIMC_APL");
    // Absence is an OUTCOME of resolution; the binding union has one member.
    expect(AUTHORITY_RESOLUTION_OUTCOMES).toContain("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(AUTHORITY_RESOLUTION_OUTCOMES as readonly string[]).not.toContain("NONE");
  });
});

describe("game-data provenance is not decision authority", () => {
  it("the decision-authority kinds still exclude every game-data and observation source", () => {
    for (const banned of [
      "RUNTIME_GAME_DATA",
      "WCL_OBSERVED_FACT",
      "MACHINE_EXTRACTED_DBC_RECORD",
      "GAME_DATA",
    ]) {
      expect(DECISION_AUTHORITY_KINDS as readonly string[]).not.toContain(banned);
    }
  });
});
