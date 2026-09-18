/**
 * M11-A2: decision-authority ownership — one analyzer per (authorityId, domain).
 *
 * THE RULE, AND ITS EXACT SCOPE
 *
 * A decision authority — a pinned APL artifact identified by its `authorityId`
 * — bound to a decision domain is owned by exactly one registration for that
 * domain. Two registrations that both bind `SIMC_APL_X` for OFFENSIVE_ROTATION
 * are a catalog defect, `DUPLICATE_DECISION_AUTHORITY_BINDING`, because the
 * authority id is what `RESULT_CITES_FOREIGN_AUTHORITY` keys on: sharing it
 * would let one analyzer's result pass the other's ownership check.
 *
 * What the rule does NOT prohibit — and the control proofs below pin — is
 * shared PROVENANCE: the same SimulationCraft commit, the same artifact
 * revision string, the same upstream source file (two regions of one
 * `apl_paladin.cpp`), the same client build, class-level mechanics data.
 * Protection Paladin and a future Retribution Paladin will share all of those
 * and must validate together.
 *
 * WHY THE CORRUPTION FIXTURE IS BUILT THE WAY IT IS
 *
 * The defect must be the ONLY thing wrong with the catalog, or the proof would
 * be borrowing from an earlier refusal. So the two rows carry the two real
 * public spec ids (the public set stays equal to the partition and the
 * identity table), distinct analyzer ids, valid capabilities that DECLARE
 * OFFENSIVE_ROTATION, non-blank display names, and one shared binding whose
 * `load()` reports a failed load — a failed load is an authority condition,
 * not an integrity defect, so the artifact-mismatch check is never reached
 * and cannot contribute a second defect. The single remaining fact is that
 * both rows bind one `authorityId` for one domain.
 */

import { describe, expect, it } from "vitest";

import { defineAnalyzerRegistration } from "../../src/findings/analyzer-registration.js";
import type { AuthorityDomainBinding } from "../../src/findings/authority-domain.js";
import type { DecisionCapability } from "../../src/findings/decision-capability.js";
import type { SpecId } from "../../src/findings/spec-id.js";
import { ANALYZER_REGISTRATIONS, validateAnalyzerCatalog } from "../../src/services/analyzer-registry.js";
import { ASSASSINATION_REGISTRATION } from "../../src/specs/rogue/assassination/registration.js";
import { PROTECTION_PALADIN_REGISTRATION } from "../../src/specs/paladin/protection/registration.js";
import { RETRIBUTION_PALADIN_REGISTRATION } from "../../src/specs/paladin/retribution/registration.js";

const PINNED_COMMIT = "33622e9d1662ff0e451691edf85a6b49cc9d11d9";
const PINNED_REVISION = "simc-33622e9d-1";

/** A binding that exists, names a domain and an id, and whose artifact does not load. */
function unloadableBinding(authorityId: string): AuthorityDomainBinding {
  return Object.freeze({
    kind: "SIMC_APL",
    domain: "OFFENSIVE_ROTATION",
    authorityId,
    artifactRevision: PINNED_REVISION,
    commitSha: PINNED_COMMIT,
    load: () => ({
      ok: false as const,
      reason: "TEST_FIXTURE",
      detail: "this synthetic authority never loads",
    }),
  });
}

function offensiveCapability(capabilityId: string): DecisionCapability {
  return {
    capabilityId,
    domain: "OFFENSIVE_ROTATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS"],
      targetModel: "PER_OBSERVED_CAST",
    },
  };
}

/** An otherwise-valid PUBLIC row for a real spec id, binding exactly the given authorities. */
function row(
  specId: SpecId,
  analyzerId: string,
  displayName: string,
  bindings: readonly AuthorityDomainBinding[],
) {
  return defineAnalyzerRegistration({
    analyzerId,
    specId,
    displayName,
    exposure: "PUBLIC",
    capabilities: [offensiveCapability(`${analyzerId}.offensive`)],
    authorityBindings: bindings,
    analyze: () => {
      throw new Error(`${analyzerId} must never be run`);
    },
    observedDecisionView: () => {
      throw new Error(`${analyzerId} has no analysis to view`);
    },
  });
}

describe("DUPLICATE_DECISION_AUTHORITY_BINDING — two analyzers may not own one decision authority for one domain", () => {
  const shared = unloadableBinding("SIMC_APL_SHARED_PROBE");
  const rogue = row("rogue/assassination", "probe-rogue-owner", "Assassination Rogue", [shared]);
  const paladin = row("paladin/protection", "probe-paladin-owner", "Protection Paladin", [shared]);
  // The third public row (M11-A5), binding its own authority, so every
  // catalog below is complete and the partition rule stays out of the way.
  const retribution = row("paladin/retribution", "probe-retribution-owner", "Retribution Paladin", [
    unloadableBinding("SIMC_APL_RETRIBUTION_PROBE"),
  ]);

  it("the two rows are otherwise valid: each validates alone, and the pair differs in spec id and analyzer id", () => {
    expect(rogue.specId).not.toBe(paladin.specId);
    expect(rogue.analyzerId).not.toBe(paladin.analyzerId);
    // Alone, each row's only problem would be the public set (two of three
    // public ids missing) — which is exactly the partition rule, not the
    // authority rule.
    for (const alone of [rogue, paladin, retribution]) {
      const validation = validateAnalyzerCatalog([alone]);
      expect(validation.ok).toBe(false);
      if (!validation.ok) {
        expect(validation.defects.map((defect) => defect.defect).sort()).toEqual([
          "PUBLIC_SET_DISAGREES_WITH_IDENTITY_TABLE",
          "PUBLIC_SET_DISAGREES_WITH_PARTITION",
        ]);
      }
    }
  });

  it("together, the ONLY defect is DUPLICATE_DECISION_AUTHORITY_BINDING, on the second owner, naming the first", () => {
    const validation = validateAnalyzerCatalog([rogue, paladin, retribution]);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.defects).toEqual([
      {
        defect: "DUPLICATE_DECISION_AUTHORITY_BINDING",
        analyzerId: "probe-paladin-owner",
        detail: "'SIMC_APL_SHARED_PROBE' for OFFENSIVE_ROTATION is already bound by 'probe-rogue-owner'",
      },
    ]);
  });

  it("is order-independent in substance: reversing the rows moves the blame, not the verdict", () => {
    const validation = validateAnalyzerCatalog([paladin, rogue, retribution]);
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.defects.map((defect) => defect.defect)).toEqual([
      "DUPLICATE_DECISION_AUTHORITY_BINDING",
    ]);
    expect(validation.defects[0]?.analyzerId).toBe("probe-rogue-owner");
    expect(validation.defects[0]?.detail).toContain("'probe-paladin-owner'");
  });

  it("never fires for one registration binding one authority, however many domains it declares", () => {
    // The same id on ONE row is not a duplicate owner; a second domain for a
    // SimulationCraft APL is refused by provider compatibility instead, which
    // is a different rule with a different name.
    const single = row("rogue/assassination", "probe-single", "Assassination Rogue", [shared]);
    const other = row("paladin/protection", "probe-other", "Protection Paladin", [
      unloadableBinding("SIMC_APL_OTHER_PROBE"),
    ]);
    const validation = validateAnalyzerCatalog([single, other, retribution]);
    expect(validation.ok).toBe(true);
  });
});

describe("control — shared provenance is legal; only the decision-authority identity per domain is owned", () => {
  it("two rows sharing commit, revision string and a failed-load shape, with DISTINCT authority ids, validate", () => {
    const rogue = row("rogue/assassination", "probe-rogue", "Assassination Rogue", [
      unloadableBinding("SIMC_APL_PROBE_ROGUE"),
    ]);
    const paladin = row("paladin/protection", "probe-paladin", "Protection Paladin", [
      unloadableBinding("SIMC_APL_PROBE_PALADIN"),
    ]);
    const retribution = row("paladin/retribution", "probe-retribution", "Retribution Paladin", [
      unloadableBinding("SIMC_APL_PROBE_RETRIBUTION"),
    ]);
    // Same provenance on every binding, by construction.
    expect(rogue.authorityBindings[0]?.commitSha).toBe(paladin.authorityBindings[0]?.commitSha);
    expect(rogue.authorityBindings[0]?.artifactRevision).toBe(paladin.authorityBindings[0]?.artifactRevision);
    expect(retribution.authorityBindings[0]?.commitSha).toBe(paladin.authorityBindings[0]?.commitSha);
    expect(validateAnalyzerCatalog([rogue, paladin, retribution])).toMatchObject({ ok: true });
  });

  it("the REAL production rows already share the pinned commit and revision and validate together", () => {
    const rogueBinding = ASSASSINATION_REGISTRATION.authorityBindings[0];
    const paladinBinding = PROTECTION_PALADIN_REGISTRATION.authorityBindings[0];
    expect(rogueBinding?.commitSha).toBe(PINNED_COMMIT);
    expect(paladinBinding?.commitSha).toBe(PINNED_COMMIT);
    expect(rogueBinding?.artifactRevision).toBe(PINNED_REVISION);
    expect(paladinBinding?.artifactRevision).toBe(PINNED_REVISION);
    expect(rogueBinding?.domain).toBe(paladinBinding?.domain);
    expect(rogueBinding?.authorityId).not.toBe(paladinBinding?.authorityId);
    expect(validateAnalyzerCatalog(ANALYZER_REGISTRATIONS)).toMatchObject({ ok: true });
  });

  it("the same upstream source FILE is shared provenance, not a shared decision authority", () => {
    // Protection's artifact cites `apl_paladin.cpp`, and since M11-A4 the
    // REAL Retribution artifact cites the SAME file (its own region) under
    // its OWN authority id. The rule keys on `authorityId` + domain and never
    // reads a source path, so this is the mechanical statement of that
    // legality: two bindings whose loaded identity shares every provenance
    // field except the authority id are not duplicates.
    const loaded = PROTECTION_PALADIN_REGISTRATION.authorityBindings[0]?.load();
    expect(loaded?.ok).toBe(true);
    if (loaded === undefined || !loaded.ok) return;
    expect(loaded.authority.artifact.provenance.sourcePath).toBe("engine/class_modules/apl/apl_paladin.cpp");
    const retLoaded = RETRIBUTION_PALADIN_REGISTRATION.authorityBindings[0]?.load();
    expect(retLoaded?.ok).toBe(true);
    if (retLoaded === undefined || !retLoaded.ok) return;
    expect(retLoaded.authority.artifact.provenance.sourcePath).toBe(
      "engine/class_modules/apl/apl_paladin.cpp",
    );
    expect(retLoaded.authority.artifact.provenance.commitSha).toBe(
      loaded.authority.artifact.provenance.commitSha,
    );
    expect(RETRIBUTION_PALADIN_REGISTRATION.authorityBindings[0]?.authorityId).not.toBe(
      PROTECTION_PALADIN_REGISTRATION.authorityBindings[0]?.authorityId,
    );
    const sharedFileBinding = Object.freeze({
      ...unloadableBinding("SIMC_APL_PALADIN_PROBE_SIBLING"),
      artifactRevision: loaded.authority.artifact.artifactRevision,
      commitSha: loaded.authority.artifact.provenance.commitSha,
    });
    const sibling = row("rogue/assassination", "probe-sibling", "Assassination Rogue", [sharedFileBinding]);
    // Paired with the REAL Paladin rows (whose bindings really load).
    expect(
      validateAnalyzerCatalog([PROTECTION_PALADIN_REGISTRATION, sibling, RETRIBUTION_PALADIN_REGISTRATION]),
    ).toMatchObject({ ok: true });
  });
});
