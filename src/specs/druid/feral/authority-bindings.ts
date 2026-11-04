/**
 * What Feral Druid binds, and to which domain (ONB-C1).
 *
 * ONE BINDING. The pinned APL governs OFFENSIVE_ROTATION and nothing else. The other
 * domains this evaluator DECLARES are bound to nothing, on purpose, and the registration's
 * authority access resolves each to `NO_PINNED_AUTHORITY_FOR_DOMAIN`:
 * resource spending (Energy and Combo Points between observations), defensive cooldowns (Survival Instincts and Barkskin) and interrupts
 * (Skull Bash). That is the typed no-authority result the payload carries, not an evidence
 * UNKNOWN and not a hidden default. A DPS has no active-mitigation or self-healing family to
 * declare, so those two resolve `DOMAIN_NOT_DECLARED`.
 *
 * ENERGY AND COMBO POINTS ARE DECLARED ON THE OFFENSIVE CAPABILITY. The slice reads the decision cast's own PRE_COST values.
 * Declared here, or a request deriving its ingestion from this row would silently under-fetch resources.
 * No regeneration model and no carried value exist.
 *
 * Shared between the registration and the facade's standalone path, so there is exactly one
 * statement of what this specialization holds.
 */

import {
  resolveAuthorityForDomain,
  type AuthorityAccess,
  type AuthorityDomain,
  type AuthorityDomainBinding,
} from "../../../findings/authority-domain.js";
import type { DecisionCapability } from "../../../findings/decision-capability.js";
import { declaredDomainsOf } from "../../../findings/decision-capability.js";
import { FERAL_DRUID_AUTHORITY_IDENTITY, pinnedFeralDruidAuthority } from "./pinned-authority.js";

export const FERAL_DRUID_OFFENSIVE_CAPABILITY_ID = "druid-feral.observed-rotational-decision";
export const FERAL_DRUID_RESOURCE_SPENDING_CAPABILITY_ID = "druid-feral.resource-spending";
export const FERAL_DRUID_DEFENSIVE_COOLDOWN_CAPABILITY_ID = "druid-feral.defensive-cooldown";
export const FERAL_DRUID_INTERRUPT_CAPABILITY_ID = "druid-feral.interrupt";

/** One capability per declared domain. Only the first has authority behind it. */
export const FERAL_DRUID_CAPABILITIES: readonly DecisionCapability[] = Object.freeze([
  {
    capabilityId: FERAL_DRUID_OFFENSIVE_CAPABILITY_ID,
    domain: "OFFENSIVE_ROTATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: ["ENERGY", "COMBO_POINTS"],
      evidenceCategories: ["CASTS", "AURAS", "RESOURCES", "COMBATANT_INFO"],
      targetModel: "PER_OBSERVED_CAST",
    },
  },
  {
    capabilityId: FERAL_DRUID_RESOURCE_SPENDING_CAPABILITY_ID,
    domain: "RESOURCE_SPENDING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: FERAL_DRUID_DEFENSIVE_COOLDOWN_CAPABILITY_ID,
    domain: "DEFENSIVE_COOLDOWN",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: FERAL_DRUID_INTERRUPT_CAPABILITY_ID,
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
 * The pinned offensive authority. Identity fields read off the committed artifact so the
 * binding cannot name a revision the artifact does not carry; the registry re-checks them
 * against what `load()` yields anyway.
 */
export const FERAL_DRUID_OFFENSIVE_AUTHORITY: AuthorityDomainBinding = Object.freeze({
  kind: "SIMC_APL",
  domain: "OFFENSIVE_ROTATION",
  authorityId: FERAL_DRUID_AUTHORITY_IDENTITY.authorityId,
  artifactRevision: FERAL_DRUID_AUTHORITY_IDENTITY.artifactRevision,
  commitSha: FERAL_DRUID_AUTHORITY_IDENTITY.commitSha,
  load: pinnedFeralDruidAuthority,
});

export const FERAL_DRUID_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([
  FERAL_DRUID_OFFENSIVE_AUTHORITY,
]);

export const FERAL_DRUID_DECLARED_DOMAINS: readonly AuthorityDomain[] = Object.freeze(
  declaredDomainsOf(FERAL_DRUID_CAPABILITIES),
);

/**
 * The authority access the registration would build, for callers that reach the facade
 * directly (tests). The SAME resolver over the SAME declared domains and bindings, so a
 * direct call and an orchestrated call cannot disagree about what this specialization holds.
 */
export function standaloneFeralDruidAuthorityAccess(): AuthorityAccess {
  return Object.freeze({
    forDomain: (domain: AuthorityDomain) =>
      resolveAuthorityForDomain(FERAL_DRUID_DECLARED_DOMAINS, FERAL_DRUID_AUTHORITY_BINDINGS, domain),
  });
}
