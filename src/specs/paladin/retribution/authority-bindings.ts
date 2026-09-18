/**
 * What Retribution Paladin binds, and to which domain (M11-A4).
 *
 * ONE BINDING. The pinned offensive APL governs OFFENSIVE_ROTATION and nothing
 * else. The three other domains this evaluator DECLARES — resource spending,
 * defensive cooldowns (Divine Protection, Shield of Vengeance, Lay on Hands
 * are observed, never judged), interrupts (Rebuke) — are bound to nothing, on
 * purpose, and the registration's authority access resolves each of them to
 * `NO_PINNED_AUTHORITY_FOR_DOMAIN`. That is the typed no-authority result the
 * payload carries for them. It is not an evidence UNKNOWN and it is not a
 * hidden default: `PROVIDER_DOMAIN_COMPATIBILITY` would refuse a
 * SimulationCraft binding for any of the three, and no artifact exists that
 * could model them. Active mitigation and self-healing are NOT declared: a
 * Retribution Paladin has no active-mitigation family, and the analyzer does
 * not ask the question.
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
import {
  pinnedRetributionPaladinAuthority,
  RETRIBUTION_PALADIN_AUTHORITY_IDENTITY,
} from "./pinned-authority.js";
import { HOLY_POWER_RESOURCE_ID } from "./spec.js";

export const RETRIBUTION_OFFENSIVE_CAPABILITY_ID = "paladin-retribution.observed-spender-decision";
export const RETRIBUTION_RESOURCE_SPENDING_CAPABILITY_ID = "paladin-retribution.resource-spending";
export const RETRIBUTION_DEFENSIVE_COOLDOWN_CAPABILITY_ID = "paladin-retribution.defensive-cooldown";
export const RETRIBUTION_INTERRUPT_CAPABILITY_ID = "paladin-retribution.interrupt";

/**
 * The four capabilities, one per declared domain. Only the first has
 * authority behind it.
 *
 * `includeResources` is DERIVED from the resources named here: Holy Power is
 * read (as an observation on the subject's own spender casts) by the
 * offensive capability, so it is listed and the ingestion requirement follows.
 */
export const RETRIBUTION_CAPABILITIES: readonly DecisionCapability[] = Object.freeze([
  {
    capabilityId: RETRIBUTION_OFFENSIVE_CAPABILITY_ID,
    domain: "OFFENSIVE_ROTATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [HOLY_POWER_RESOURCE_ID],
      evidenceCategories: ["CASTS", "RESOURCES", "AURAS", "COMBATANT_INFO", "GEAR"],
      targetModel: "PER_OBSERVED_CAST",
    },
  },
  {
    capabilityId: RETRIBUTION_RESOURCE_SPENDING_CAPABILITY_ID,
    domain: "RESOURCE_SPENDING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [HOLY_POWER_RESOURCE_ID],
      evidenceCategories: ["CASTS", "RESOURCES"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: RETRIBUTION_DEFENSIVE_COOLDOWN_CAPABILITY_ID,
    domain: "DEFENSIVE_COOLDOWN",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: RETRIBUTION_INTERRUPT_CAPABILITY_ID,
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
export const RETRIBUTION_OFFENSIVE_AUTHORITY: AuthorityDomainBinding = Object.freeze({
  kind: "SIMC_APL",
  domain: "OFFENSIVE_ROTATION",
  authorityId: RETRIBUTION_PALADIN_AUTHORITY_IDENTITY.authorityId,
  artifactRevision: RETRIBUTION_PALADIN_AUTHORITY_IDENTITY.artifactRevision,
  commitSha: RETRIBUTION_PALADIN_AUTHORITY_IDENTITY.commitSha,
  load: pinnedRetributionPaladinAuthority,
});

export const RETRIBUTION_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([
  RETRIBUTION_OFFENSIVE_AUTHORITY,
]);

export const RETRIBUTION_DECLARED_DOMAINS: readonly AuthorityDomain[] = Object.freeze(
  declaredDomainsOf(RETRIBUTION_CAPABILITIES),
);

/**
 * The authority access the registration would build, for callers that reach
 * the facade directly (the corpus executor, tests). The SAME resolver over
 * the SAME declared domains and bindings, so a direct call and an
 * orchestrated call cannot disagree about what this specialization holds.
 */
export function standaloneRetributionAuthorityAccess(): AuthorityAccess {
  return Object.freeze({
    forDomain: (domain: AuthorityDomain) =>
      resolveAuthorityForDomain(RETRIBUTION_DECLARED_DOMAINS, RETRIBUTION_AUTHORITY_BINDINGS, domain),
  });
}
