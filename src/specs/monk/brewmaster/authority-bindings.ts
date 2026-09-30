/**
 * What Brewmaster Monk binds, and to which domain (M11-C2).
 *
 * ONE BINDING. The pinned APL governs OFFENSIVE_ROTATION and nothing else.
 * The five other domains this evaluator DECLARES — resource spending
 * (Energy), active mitigation (Purifying Brew, Celestial Brew / Celestial
 * Infusion, Black Ox Brew, Stagger), defensive cooldowns (Fortifying Brew),
 * self healing (Expel Harm, Gift of the Ox) and interrupts (Spear Hand
 * Strike) — are bound to nothing, on purpose, and the registration's
 * authority access resolves each of them to `NO_PINNED_AUTHORITY_FOR_DOMAIN`.
 * That is the typed no-authority result the payload carries for them. It is
 * not an evidence UNKNOWN and it is not a hidden default:
 * `PROVIDER_DOMAIN_COMPATIBILITY` would refuse a SimulationCraft binding for
 * any of the five, and no artifact exists that could model them.
 *
 * WHY ALL SIX ARE DECLARED FOR A TANK. A Brewmaster HAS an active-mitigation
 * family, a defensive-cooldown family and a self-healing family, and several
 * of their buttons are entries the offensive list also names (`domains.ts`).
 * Declaring the domains and binding nothing is how the analyzer says "this is
 * a real question about this specialization, and we have no authority for
 * it" — a different statement from `DOMAIN_NOT_DECLARED`.
 *
 * ENERGY IS DECLARED ON THE OFFENSIVE CAPABILITY (M11-C4j). The M11-C2 slice
 * read no Energy, so nothing listed it. M11-C4i's positive usability reads
 * the decision cast's own PRE_COST Energy for Keg Smash's affordability — the
 * later slice this paragraph anticipated — and it did not declare it: harmless
 * while the row was INTERNAL_ONLY (every committed capture carries resources),
 * a silent under-fetch the moment a public request derived its ingestion from
 * this declaration. So the offensive capability lists ENERGY and the RESOURCES
 * category, and the derived requirement follows. No regeneration model and no
 * carried value exist; the resource-spending domain still reads nothing.
 *
 * Shared between the registration (which hands the access object to the
 * facade) and the facade's standalone path (tests, the corpus executor), so
 * there is exactly one statement of what this specialization holds.
 */

import {
  resolveAuthorityForDomain,
  type AuthorityAccess,
  type AuthorityDomain,
  type AuthorityDomainBinding,
} from "../../../findings/authority-domain.js";
import type { DecisionCapability } from "../../../findings/decision-capability.js";
import { declaredDomainsOf } from "../../../findings/decision-capability.js";
import { BREWMASTER_MONK_AUTHORITY_IDENTITY, pinnedBrewmasterMonkAuthority } from "./pinned-authority.js";

export const BREWMASTER_OFFENSIVE_CAPABILITY_ID = "monk-brewmaster.observed-rotational-decision";
export const BREWMASTER_RESOURCE_SPENDING_CAPABILITY_ID = "monk-brewmaster.resource-spending";
export const BREWMASTER_ACTIVE_MITIGATION_CAPABILITY_ID = "monk-brewmaster.active-mitigation";
export const BREWMASTER_DEFENSIVE_COOLDOWN_CAPABILITY_ID = "monk-brewmaster.defensive-cooldown";
export const BREWMASTER_SELF_HEALING_CAPABILITY_ID = "monk-brewmaster.self-healing";
export const BREWMASTER_INTERRUPT_CAPABILITY_ID = "monk-brewmaster.interrupt";

/** The six capabilities, one per declared domain. Only the first has authority behind it. */
export const BREWMASTER_CAPABILITIES: readonly DecisionCapability[] = Object.freeze([
  {
    capabilityId: BREWMASTER_OFFENSIVE_CAPABILITY_ID,
    domain: "OFFENSIVE_ROTATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: ["ENERGY"],
      evidenceCategories: ["CASTS", "RESOURCES", "AURAS", "COMBATANT_INFO"],
      targetModel: "PER_OBSERVED_CAST",
    },
  },
  {
    capabilityId: BREWMASTER_RESOURCE_SPENDING_CAPABILITY_ID,
    domain: "RESOURCE_SPENDING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: BREWMASTER_ACTIVE_MITIGATION_CAPABILITY_ID,
    domain: "ACTIVE_MITIGATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: BREWMASTER_DEFENSIVE_COOLDOWN_CAPABILITY_ID,
    domain: "DEFENSIVE_COOLDOWN",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: BREWMASTER_SELF_HEALING_CAPABILITY_ID,
    domain: "SELF_HEALING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "HEALING", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: BREWMASTER_INTERRUPT_CAPABILITY_ID,
    domain: "INTERRUPT",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "INTERRUPTS"],
      targetModel: "NO_TARGET",
    },
  },
]);

/**
 * The pinned offensive authority. Identity fields read off the committed
 * artifact so the binding cannot name a revision the artifact does not carry;
 * the registry re-checks them against what `load()` yields anyway.
 */
export const BREWMASTER_OFFENSIVE_AUTHORITY: AuthorityDomainBinding = Object.freeze({
  kind: "SIMC_APL",
  domain: "OFFENSIVE_ROTATION",
  authorityId: BREWMASTER_MONK_AUTHORITY_IDENTITY.authorityId,
  artifactRevision: BREWMASTER_MONK_AUTHORITY_IDENTITY.artifactRevision,
  commitSha: BREWMASTER_MONK_AUTHORITY_IDENTITY.commitSha,
  load: pinnedBrewmasterMonkAuthority,
});

export const BREWMASTER_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([
  BREWMASTER_OFFENSIVE_AUTHORITY,
]);

export const BREWMASTER_DECLARED_DOMAINS: readonly AuthorityDomain[] = Object.freeze(
  declaredDomainsOf(BREWMASTER_CAPABILITIES),
);

/**
 * The authority access the registration would build, for callers that reach
 * the facade directly (the corpus executor, tests). The SAME resolver over
 * the SAME declared domains and bindings, so a direct call and an
 * orchestrated call cannot disagree about what this specialization holds.
 */
export function standaloneBrewmasterAuthorityAccess(): AuthorityAccess {
  return Object.freeze({
    forDomain: (domain: AuthorityDomain) =>
      resolveAuthorityForDomain(BREWMASTER_DECLARED_DOMAINS, BREWMASTER_AUTHORITY_BINDINGS, domain),
  });
}
