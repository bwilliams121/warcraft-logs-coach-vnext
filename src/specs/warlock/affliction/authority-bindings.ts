/**
 * What Affliction Warlock binds, and to which domain (ONB-D4).
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
  AFFLICTION_WARLOCK_AUTHORITY_IDENTITY,
  pinnedAfflictionWarlockAuthority,
} from "./pinned-authority.js";

export const AFFLICTION_OFFENSIVE_CAPABILITY_ID = "warlock-affliction.observed-rotational-decision";
export const AFFLICTION_RESOURCE_SPENDING_CAPABILITY_ID = "warlock-affliction.resource-spending";
export const AFFLICTION_DEFENSIVE_COOLDOWN_CAPABILITY_ID = "warlock-affliction.defensive-cooldown";
export const AFFLICTION_INTERRUPT_CAPABILITY_ID = "warlock-affliction.interrupt";

/** One capability per declared domain. Only the first has authority behind it. */
export const AFFLICTION_CAPABILITIES: readonly DecisionCapability[] = Object.freeze([
  {
    capabilityId: AFFLICTION_OFFENSIVE_CAPABILITY_ID,
    domain: "OFFENSIVE_ROTATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "COMBATANT_INFO"],
      targetModel: "PER_OBSERVED_CAST",
    },
  },
  {
    capabilityId: AFFLICTION_RESOURCE_SPENDING_CAPABILITY_ID,
    domain: "RESOURCE_SPENDING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: AFFLICTION_DEFENSIVE_COOLDOWN_CAPABILITY_ID,
    domain: "DEFENSIVE_COOLDOWN",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: AFFLICTION_INTERRUPT_CAPABILITY_ID,
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
export const AFFLICTION_OFFENSIVE_AUTHORITY: AuthorityDomainBinding = Object.freeze({
  kind: "SIMC_APL",
  domain: "OFFENSIVE_ROTATION",
  authorityId: AFFLICTION_WARLOCK_AUTHORITY_IDENTITY.authorityId,
  artifactRevision: AFFLICTION_WARLOCK_AUTHORITY_IDENTITY.artifactRevision,
  commitSha: AFFLICTION_WARLOCK_AUTHORITY_IDENTITY.commitSha,
  load: pinnedAfflictionWarlockAuthority,
});

export const AFFLICTION_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([
  AFFLICTION_OFFENSIVE_AUTHORITY,
]);

export const AFFLICTION_DECLARED_DOMAINS: readonly AuthorityDomain[] = Object.freeze(
  declaredDomainsOf(AFFLICTION_CAPABILITIES),
);

/**
 * The authority access the registration would build, for callers that reach the facade
 * directly (tests). The SAME resolver over the SAME declared domains and bindings, so a
 * direct call and an orchestrated call cannot disagree about what this specialization holds.
 */
export function standaloneAfflictionAuthorityAccess(): AuthorityAccess {
  return Object.freeze({
    forDomain: (domain: AuthorityDomain) =>
      resolveAuthorityForDomain(AFFLICTION_DECLARED_DOMAINS, AFFLICTION_AUTHORITY_BINDINGS, domain),
  });
}
