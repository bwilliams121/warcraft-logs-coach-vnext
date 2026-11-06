/**
 * What Survival Hunter binds, and to which domain (ONB-T2).
 *
 * ONE BINDING. The pinned APL governs OFFENSIVE_ROTATION and nothing else. The other
 * domains this evaluator DECLARES are bound to nothing, on purpose, and the registration's
 * authority access resolves each to `NO_PINNED_AUTHORITY_FOR_DOMAIN`:
 * resource spending (Focus), defensive cooldowns (Exhilaration, Survival of the Fittest, Aspect of the Turtle) and interrupts
 * (Muzzle). That is the typed no-authority result the payload carries, not an evidence
 * UNKNOWN and not a hidden default. A DPS has no active-mitigation or self-healing family to
 * declare, so those two resolve `DOMAIN_NOT_DECLARED`.
 *
 * NO RESOURCE IS DECLARED ON THE OFFENSIVE CAPABILITY, because none is read. Focus stays
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
import { SURVIVAL_HUNTER_AUTHORITY_IDENTITY, pinnedSurvivalHunterAuthority } from "./pinned-authority.js";

export const SURVIVAL_OFFENSIVE_CAPABILITY_ID = "hunter-survival.observed-rotational-decision";
export const SURVIVAL_RESOURCE_SPENDING_CAPABILITY_ID = "hunter-survival.resource-spending";
export const SURVIVAL_DEFENSIVE_COOLDOWN_CAPABILITY_ID = "hunter-survival.defensive-cooldown";
export const SURVIVAL_INTERRUPT_CAPABILITY_ID = "hunter-survival.interrupt";

/** One capability per declared domain. Only the first has authority behind it. */
export const SURVIVAL_CAPABILITIES: readonly DecisionCapability[] = Object.freeze([
  {
    capabilityId: SURVIVAL_OFFENSIVE_CAPABILITY_ID,
    domain: "OFFENSIVE_ROTATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "COMBATANT_INFO"],
      targetModel: "PER_OBSERVED_CAST",
    },
  },
  {
    capabilityId: SURVIVAL_RESOURCE_SPENDING_CAPABILITY_ID,
    domain: "RESOURCE_SPENDING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: SURVIVAL_DEFENSIVE_COOLDOWN_CAPABILITY_ID,
    domain: "DEFENSIVE_COOLDOWN",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: SURVIVAL_INTERRUPT_CAPABILITY_ID,
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
export const SURVIVAL_OFFENSIVE_AUTHORITY: AuthorityDomainBinding = Object.freeze({
  kind: "SIMC_APL",
  domain: "OFFENSIVE_ROTATION",
  authorityId: SURVIVAL_HUNTER_AUTHORITY_IDENTITY.authorityId,
  artifactRevision: SURVIVAL_HUNTER_AUTHORITY_IDENTITY.artifactRevision,
  commitSha: SURVIVAL_HUNTER_AUTHORITY_IDENTITY.commitSha,
  load: pinnedSurvivalHunterAuthority,
});

export const SURVIVAL_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([
  SURVIVAL_OFFENSIVE_AUTHORITY,
]);

export const SURVIVAL_DECLARED_DOMAINS: readonly AuthorityDomain[] = Object.freeze(
  declaredDomainsOf(SURVIVAL_CAPABILITIES),
);

/**
 * The authority access the registration would build, for callers that reach the facade
 * directly (tests). The SAME resolver over the SAME declared domains and bindings, so a
 * direct call and an orchestrated call cannot disagree about what this specialization holds.
 */
export function standaloneSurvivalAuthorityAccess(): AuthorityAccess {
  return Object.freeze({
    forDomain: (domain: AuthorityDomain) =>
      resolveAuthorityForDomain(SURVIVAL_DECLARED_DOMAINS, SURVIVAL_AUTHORITY_BINDINGS, domain),
  });
}
