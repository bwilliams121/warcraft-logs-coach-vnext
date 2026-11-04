/**
 * What Havoc Demon Hunter binds, and to which domain (ONB-A1).
 *
 * ONE BINDING. The pinned APL governs OFFENSIVE_ROTATION and nothing else. The
 * other domains this evaluator DECLARES are bound to nothing, on purpose, and the
 * registration's authority access resolves each to `NO_PINNED_AUTHORITY_FOR_DOMAIN`:
 * resource spending (Fury), defensive cooldowns (Blur, Darkness) and interrupts
 * (Disrupt). That is the typed no-authority result the payload carries, not an
 * evidence UNKNOWN and not a hidden default. A DPS has no active-mitigation or
 * self-healing family to declare, so those two resolve `DOMAIN_NOT_DECLARED`.
 *
 * FURY IS DECLARED ON THE OFFENSIVE CAPABILITY. The slice reads the decision cast's
 * own PRE_COST Fury for `fury<=40` and `fury<=100`. Declared here, or a public request
 * deriving its ingestion from this row would silently under-fetch resources. No
 * regeneration model and no carried value exist.
 *
 * Shared between the registration and the facade's standalone path, so there is
 * exactly one statement of what this specialization holds.
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
  HAVOC_DEMON_HUNTER_AUTHORITY_IDENTITY,
  pinnedHavocDemonHunterAuthority,
} from "./pinned-authority.js";

export const HAVOC_OFFENSIVE_CAPABILITY_ID = "demonhunter-havoc.observed-rotational-decision";
export const HAVOC_RESOURCE_SPENDING_CAPABILITY_ID = "demonhunter-havoc.resource-spending";
export const HAVOC_DEFENSIVE_COOLDOWN_CAPABILITY_ID = "demonhunter-havoc.defensive-cooldown";
export const HAVOC_INTERRUPT_CAPABILITY_ID = "demonhunter-havoc.interrupt";

/** The four capabilities, one per declared domain. Only the first has authority behind it. */
export const HAVOC_CAPABILITIES: readonly DecisionCapability[] = Object.freeze([
  {
    capabilityId: HAVOC_OFFENSIVE_CAPABILITY_ID,
    domain: "OFFENSIVE_ROTATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: ["FURY"],
      evidenceCategories: ["CASTS", "RESOURCES", "AURAS", "COMBATANT_INFO"],
      targetModel: "PER_OBSERVED_CAST",
    },
  },
  {
    capabilityId: HAVOC_RESOURCE_SPENDING_CAPABILITY_ID,
    domain: "RESOURCE_SPENDING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: HAVOC_DEFENSIVE_COOLDOWN_CAPABILITY_ID,
    domain: "DEFENSIVE_COOLDOWN",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: HAVOC_INTERRUPT_CAPABILITY_ID,
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
export const HAVOC_OFFENSIVE_AUTHORITY: AuthorityDomainBinding = Object.freeze({
  kind: "SIMC_APL",
  domain: "OFFENSIVE_ROTATION",
  authorityId: HAVOC_DEMON_HUNTER_AUTHORITY_IDENTITY.authorityId,
  artifactRevision: HAVOC_DEMON_HUNTER_AUTHORITY_IDENTITY.artifactRevision,
  commitSha: HAVOC_DEMON_HUNTER_AUTHORITY_IDENTITY.commitSha,
  load: pinnedHavocDemonHunterAuthority,
});

export const HAVOC_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([
  HAVOC_OFFENSIVE_AUTHORITY,
]);

export const HAVOC_DECLARED_DOMAINS: readonly AuthorityDomain[] = Object.freeze(
  declaredDomainsOf(HAVOC_CAPABILITIES),
);

/**
 * The authority access the registration would build, for callers that reach
 * the facade directly (the corpus executor, tests). The SAME resolver over
 * the SAME declared domains and bindings, so a direct call and an
 * orchestrated call cannot disagree about what this specialization holds.
 */
export function standaloneHavocAuthorityAccess(): AuthorityAccess {
  return Object.freeze({
    forDomain: (domain: AuthorityDomain) =>
      resolveAuthorityForDomain(HAVOC_DECLARED_DOMAINS, HAVOC_AUTHORITY_BINDINGS, domain),
  });
}
