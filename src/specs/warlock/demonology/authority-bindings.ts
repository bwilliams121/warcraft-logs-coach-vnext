/**
 * What Demonology Warlock binds, and to which domain (ONB-X4).
 *
 * ONE BINDING. The pinned APL governs OFFENSIVE_ROTATION and nothing else. The other
 * domains this evaluator DECLARES are bound to nothing, on purpose, and the registration's
 * authority access resolves each to `NO_PINNED_AUTHORITY_FOR_DOMAIN`:
 * resource spending (Soul Shards), defensive cooldowns (Unending Resolve, Dark Pact) and interrupts
 * (the pet's). That is the typed no-authority result the payload carries, not an evidence
 * UNKNOWN and not a hidden default. A DPS has no active-mitigation or self-healing family to
 * declare, so those two resolve `DOMAIN_NOT_DECLARED`.
 *
 * NO RESOURCE IS DECLARED ON THE OFFENSIVE CAPABILITY, because none is read. Soul Shards stays
 * unbound (`vocabulary.ts`), so a request has nothing resource-shaped to under-fetch. A later
 * slice that binds it must declare it here first.
 *
 * SUMMONS IS DECLARED ON THE OFFENSIVE CAPABILITY, because the pet readings consume them (`pet-profile.ts`). Declared here, or a
 * request deriving its ingestion from this row would silently under-fetch the very evidence absence claims gate on.
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
  DEMONOLOGY_WARLOCK_AUTHORITY_IDENTITY,
  pinnedDemonologyWarlockAuthority,
} from "./pinned-authority.js";

export const DEMONOLOGY_OFFENSIVE_CAPABILITY_ID = "warlock-demonology.observed-rotational-decision";
export const DEMONOLOGY_RESOURCE_SPENDING_CAPABILITY_ID = "warlock-demonology.resource-spending";
export const DEMONOLOGY_DEFENSIVE_COOLDOWN_CAPABILITY_ID = "warlock-demonology.defensive-cooldown";
export const DEMONOLOGY_INTERRUPT_CAPABILITY_ID = "warlock-demonology.interrupt";

/** One capability per declared domain. Only the first has authority behind it. */
export const DEMONOLOGY_CAPABILITIES: readonly DecisionCapability[] = Object.freeze([
  {
    capabilityId: DEMONOLOGY_OFFENSIVE_CAPABILITY_ID,
    domain: "OFFENSIVE_ROTATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "COMBATANT_INFO", "SUMMONS"],
      targetModel: "PER_OBSERVED_CAST",
    },
  },
  {
    capabilityId: DEMONOLOGY_RESOURCE_SPENDING_CAPABILITY_ID,
    domain: "RESOURCE_SPENDING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: DEMONOLOGY_DEFENSIVE_COOLDOWN_CAPABILITY_ID,
    domain: "DEFENSIVE_COOLDOWN",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: DEMONOLOGY_INTERRUPT_CAPABILITY_ID,
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
export const DEMONOLOGY_OFFENSIVE_AUTHORITY: AuthorityDomainBinding = Object.freeze({
  kind: "SIMC_APL",
  domain: "OFFENSIVE_ROTATION",
  authorityId: DEMONOLOGY_WARLOCK_AUTHORITY_IDENTITY.authorityId,
  artifactRevision: DEMONOLOGY_WARLOCK_AUTHORITY_IDENTITY.artifactRevision,
  commitSha: DEMONOLOGY_WARLOCK_AUTHORITY_IDENTITY.commitSha,
  load: pinnedDemonologyWarlockAuthority,
});

export const DEMONOLOGY_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([
  DEMONOLOGY_OFFENSIVE_AUTHORITY,
]);

export const DEMONOLOGY_DECLARED_DOMAINS: readonly AuthorityDomain[] = Object.freeze(
  declaredDomainsOf(DEMONOLOGY_CAPABILITIES),
);

/**
 * The authority access the registration would build, for callers that reach the facade
 * directly (tests). The SAME resolver over the SAME declared domains and bindings, so a
 * direct call and an orchestrated call cannot disagree about what this specialization holds.
 */
export function standaloneDemonologyAuthorityAccess(): AuthorityAccess {
  return Object.freeze({
    forDomain: (domain: AuthorityDomain) =>
      resolveAuthorityForDomain(DEMONOLOGY_DECLARED_DOMAINS, DEMONOLOGY_AUTHORITY_BINDINGS, domain),
  });
}
