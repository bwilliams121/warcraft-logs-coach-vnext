/**
 * What Devourer Demon Hunter binds, and to which domain (ONB-B3).
 *
 * ONE BINDING. The pinned APL governs OFFENSIVE_ROTATION and nothing else. The other
 * domains this evaluator DECLARES are bound to nothing, on purpose, and the registration's
 * authority access resolves each to `NO_PINNED_AUTHORITY_FOR_DOMAIN`:
 * resource spending (Fury between observations), defensive cooldowns (Blur) and interrupts
 * (Disrupt). That is the typed no-authority result the payload carries, not an evidence
 * UNKNOWN and not a hidden default. A DPS has no active-mitigation or self-healing family to
 * declare, so those two resolve `DOMAIN_NOT_DECLARED`.
 *
 * FURY IS DECLARED ON THE OFFENSIVE CAPABILITY. The slice reads the decision cast's own PRE_COST value.
 * Declared here, or a request deriving its ingestion from this row would silently under-fetch resources.
 * No drain model and no carried value exist: Void Metamorphosis drains Fury each second.
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
  DEVOURER_DEMON_HUNTER_AUTHORITY_IDENTITY,
  pinnedDevourerDemonHunterAuthority,
} from "./pinned-authority.js";

export const DEVOURER_DEMON_HUNTER_OFFENSIVE_CAPABILITY_ID =
  "demonhunter-devourer.observed-rotational-decision";
export const DEVOURER_DEMON_HUNTER_RESOURCE_SPENDING_CAPABILITY_ID = "demonhunter-devourer.resource-spending";
export const DEVOURER_DEMON_HUNTER_DEFENSIVE_COOLDOWN_CAPABILITY_ID =
  "demonhunter-devourer.defensive-cooldown";
export const DEVOURER_DEMON_HUNTER_INTERRUPT_CAPABILITY_ID = "demonhunter-devourer.interrupt";

/** One capability per declared domain. Only the first has authority behind it. */
export const DEVOURER_DEMON_HUNTER_CAPABILITIES: readonly DecisionCapability[] = Object.freeze([
  {
    capabilityId: DEVOURER_DEMON_HUNTER_OFFENSIVE_CAPABILITY_ID,
    domain: "OFFENSIVE_ROTATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: ["FURY"],
      evidenceCategories: ["CASTS", "RESOURCES", "COMBATANT_INFO"],
      targetModel: "PER_OBSERVED_CAST",
    },
  },
  {
    capabilityId: DEVOURER_DEMON_HUNTER_RESOURCE_SPENDING_CAPABILITY_ID,
    domain: "RESOURCE_SPENDING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: DEVOURER_DEMON_HUNTER_DEFENSIVE_COOLDOWN_CAPABILITY_ID,
    domain: "DEFENSIVE_COOLDOWN",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: DEVOURER_DEMON_HUNTER_INTERRUPT_CAPABILITY_ID,
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
export const DEVOURER_DEMON_HUNTER_OFFENSIVE_AUTHORITY: AuthorityDomainBinding = Object.freeze({
  kind: "SIMC_APL",
  domain: "OFFENSIVE_ROTATION",
  authorityId: DEVOURER_DEMON_HUNTER_AUTHORITY_IDENTITY.authorityId,
  artifactRevision: DEVOURER_DEMON_HUNTER_AUTHORITY_IDENTITY.artifactRevision,
  commitSha: DEVOURER_DEMON_HUNTER_AUTHORITY_IDENTITY.commitSha,
  load: pinnedDevourerDemonHunterAuthority,
});

export const DEVOURER_DEMON_HUNTER_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([
  DEVOURER_DEMON_HUNTER_OFFENSIVE_AUTHORITY,
]);

export const DEVOURER_DEMON_HUNTER_DECLARED_DOMAINS: readonly AuthorityDomain[] = Object.freeze(
  declaredDomainsOf(DEVOURER_DEMON_HUNTER_CAPABILITIES),
);

/**
 * The authority access the registration would build, for callers that reach the facade
 * directly (tests). The SAME resolver over the SAME declared domains and bindings, so a
 * direct call and an orchestrated call cannot disagree about what this specialization holds.
 */
export function standaloneDevourerDemonHunterAuthorityAccess(): AuthorityAccess {
  return Object.freeze({
    forDomain: (domain: AuthorityDomain) =>
      resolveAuthorityForDomain(
        DEVOURER_DEMON_HUNTER_DECLARED_DOMAINS,
        DEVOURER_DEMON_HUNTER_AUTHORITY_BINDINGS,
        domain,
      ),
  });
}
