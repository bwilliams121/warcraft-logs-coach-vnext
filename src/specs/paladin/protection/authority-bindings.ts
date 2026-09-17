/**
 * What Protection Paladin binds, and to which domain (M10-C).
 *
 * ONE BINDING. The pinned offensive APL governs OFFENSIVE_ROTATION and nothing
 * else. The five other domains this evaluator DECLARES — resource spending,
 * active mitigation, defensive cooldowns, self-healing, interrupts — are bound
 * to nothing, on purpose, and the registration's authority access resolves
 * each of them to `NO_PINNED_AUTHORITY_FOR_DOMAIN`. That is the typed
 * no-authority result the payload carries for them. It is not an evidence
 * UNKNOWN and it is not a hidden default: `PROVIDER_DOMAIN_COMPATIBILITY`
 * would refuse a SimulationCraft binding for any of the five, and no artifact
 * exists that could model them.
 *
 * Shared here between the registration (which hands the access object to the
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
import {
  pinnedProtectionPaladinAuthority,
  PROTECTION_PALADIN_AUTHORITY_IDENTITY,
} from "./pinned-authority.js";
import { HOLY_POWER_RESOURCE_ID } from "./spec.js";

export const PROTECTION_OFFENSIVE_CAPABILITY_ID = "paladin-protection.observed-offensive-decision";
export const PROTECTION_RESOURCE_SPENDING_CAPABILITY_ID = "paladin-protection.resource-spending";
export const PROTECTION_ACTIVE_MITIGATION_CAPABILITY_ID = "paladin-protection.active-mitigation";
export const PROTECTION_DEFENSIVE_COOLDOWN_CAPABILITY_ID = "paladin-protection.defensive-cooldown";
export const PROTECTION_SELF_HEALING_CAPABILITY_ID = "paladin-protection.self-healing";
export const PROTECTION_INTERRUPT_CAPABILITY_ID = "paladin-protection.interrupt";

/**
 * The six capabilities, one per domain.
 *
 * Only the first has authority behind it. The other five are declared so
 * the registration says truthfully that it ASKS about them — and resolves
 * each to a typed no-authority result — rather than leaving them
 * `DOMAIN_NOT_DECLARED`, which would read as "this evaluator has no opinion"
 * when the truthful statement is "this evaluator has no standard".
 *
 * `includeResources` is DERIVED from the resources named here: Holy Power is
 * read (as an observation on the subject's own casts) by the offensive
 * capability, so it is listed and the ingestion requirement follows.
 */
export const PROTECTION_CAPABILITIES: readonly DecisionCapability[] = Object.freeze([
  {
    capabilityId: PROTECTION_OFFENSIVE_CAPABILITY_ID,
    domain: "OFFENSIVE_ROTATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [HOLY_POWER_RESOURCE_ID],
      evidenceCategories: ["CASTS", "RESOURCES", "AURAS", "COMBATANT_INFO", "GEAR"],
      targetModel: "PER_OBSERVED_CAST",
    },
  },
  {
    capabilityId: PROTECTION_RESOURCE_SPENDING_CAPABILITY_ID,
    domain: "RESOURCE_SPENDING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [HOLY_POWER_RESOURCE_ID],
      evidenceCategories: ["CASTS", "RESOURCES"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: PROTECTION_ACTIVE_MITIGATION_CAPABILITY_ID,
    domain: "ACTIVE_MITIGATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: PROTECTION_DEFENSIVE_COOLDOWN_CAPABILITY_ID,
    domain: "DEFENSIVE_COOLDOWN",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: PROTECTION_SELF_HEALING_CAPABILITY_ID,
    domain: "SELF_HEALING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "HEALING"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: PROTECTION_INTERRUPT_CAPABILITY_ID,
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
export const PROTECTION_OFFENSIVE_AUTHORITY: AuthorityDomainBinding = Object.freeze({
  kind: "SIMC_APL",
  domain: "OFFENSIVE_ROTATION",
  authorityId: PROTECTION_PALADIN_AUTHORITY_IDENTITY.authorityId,
  artifactRevision: PROTECTION_PALADIN_AUTHORITY_IDENTITY.artifactRevision,
  commitSha: PROTECTION_PALADIN_AUTHORITY_IDENTITY.commitSha,
  load: pinnedProtectionPaladinAuthority,
});

export const PROTECTION_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([
  PROTECTION_OFFENSIVE_AUTHORITY,
]);

export const PROTECTION_DECLARED_DOMAINS: readonly AuthorityDomain[] = Object.freeze(
  declaredDomainsOf(PROTECTION_CAPABILITIES),
);

/**
 * The authority access the registration would build, for callers that reach
 * the facade directly (the corpus executor, tests). The SAME resolver over
 * the SAME declared domains and bindings, so a direct call and an
 * orchestrated call cannot disagree about what this specialization holds.
 */
export function standaloneProtectionAuthorityAccess(): AuthorityAccess {
  return Object.freeze({
    forDomain: (domain: AuthorityDomain) =>
      resolveAuthorityForDomain(PROTECTION_DECLARED_DOMAINS, PROTECTION_AUTHORITY_BINDINGS, domain),
  });
}
