/**
 * What Devastation Evoker binds, and to which domain (ONB-X2).
 *
 * ONE BINDING. The pinned APL governs OFFENSIVE_ROTATION and nothing else. The other
 * domains this evaluator DECLARES are bound to nothing, on purpose, and the registration's
 * authority access resolves each to `NO_PINNED_AUTHORITY_FOR_DOMAIN`:
 * resource spending (Essence, Mana), defensive cooldowns (Obsidian Scales, Renewing Blaze, Zephyr) and interrupts
 * (Quell). That is the typed no-authority result the payload carries, not an evidence
 * UNKNOWN and not a hidden default. A DPS has no active-mitigation or self-healing family to
 * declare, so those two resolve `DOMAIN_NOT_DECLARED`.
 *
 * NO RESOURCE IS DECLARED ON THE OFFENSIVE CAPABILITY, because none is read. Essence and Mana stay
 * unbound (`vocabulary.ts`), so a request has nothing resource-shaped to under-fetch. A later
 * slice that binds it must declare it here first.
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
import {
  DEVASTATION_EVOKER_AUTHORITY_IDENTITY,
  pinnedDevastationEvokerAuthority,
} from "./pinned-authority.js";

export const DEVASTATION_OFFENSIVE_CAPABILITY_ID = "evoker-devastation.observed-rotational-decision";
export const DEVASTATION_RESOURCE_SPENDING_CAPABILITY_ID = "evoker-devastation.resource-spending";
export const DEVASTATION_DEFENSIVE_COOLDOWN_CAPABILITY_ID = "evoker-devastation.defensive-cooldown";
export const DEVASTATION_INTERRUPT_CAPABILITY_ID = "evoker-devastation.interrupt";

/** One capability per declared domain. Only the first has authority behind it. */
export const DEVASTATION_CAPABILITIES: readonly DecisionCapability[] = Object.freeze([
  {
    capabilityId: DEVASTATION_OFFENSIVE_CAPABILITY_ID,
    domain: "OFFENSIVE_ROTATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "COMBATANT_INFO"],
      targetModel: "PER_OBSERVED_CAST",
    },
  },
  {
    capabilityId: DEVASTATION_RESOURCE_SPENDING_CAPABILITY_ID,
    domain: "RESOURCE_SPENDING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: DEVASTATION_DEFENSIVE_COOLDOWN_CAPABILITY_ID,
    domain: "DEFENSIVE_COOLDOWN",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: DEVASTATION_INTERRUPT_CAPABILITY_ID,
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
export const DEVASTATION_OFFENSIVE_AUTHORITY: AuthorityDomainBinding = Object.freeze({
  kind: "SIMC_APL",
  domain: "OFFENSIVE_ROTATION",
  authorityId: DEVASTATION_EVOKER_AUTHORITY_IDENTITY.authorityId,
  artifactRevision: DEVASTATION_EVOKER_AUTHORITY_IDENTITY.artifactRevision,
  commitSha: DEVASTATION_EVOKER_AUTHORITY_IDENTITY.commitSha,
  load: pinnedDevastationEvokerAuthority,
});

export const DEVASTATION_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([
  DEVASTATION_OFFENSIVE_AUTHORITY,
]);

export const DEVASTATION_DECLARED_DOMAINS: readonly AuthorityDomain[] = Object.freeze(
  declaredDomainsOf(DEVASTATION_CAPABILITIES),
);

/**
 * The authority access the registration would build, for callers that reach the facade
 * directly (tests). The SAME resolver over the SAME declared domains and bindings, so a
 * direct call and an orchestrated call cannot disagree about what this specialization holds.
 */
export function standaloneDevastationAuthorityAccess(): AuthorityAccess {
  return Object.freeze({
    forDomain: (domain: AuthorityDomain) =>
      resolveAuthorityForDomain(DEVASTATION_DECLARED_DOMAINS, DEVASTATION_AUTHORITY_BINDINGS, domain),
  });
}
