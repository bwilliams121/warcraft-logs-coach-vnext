/**
 * What Protection Warrior binds, and to which domain (ONB-A2).
 *
 * ONE BINDING. The pinned APL governs OFFENSIVE_ROTATION and nothing else. The other
 * domains this evaluator DECLARES are bound to nothing, on purpose, and the registration's
 * authority access resolves each to `NO_PINNED_AUTHORITY_FOR_DOMAIN`:
 * resource spending (Rage), active mitigation (Shield Block, Ignore Pain), defensive cooldowns
 * (Shield Wall, Last Stand), self healing and interrupts (Pummel). That is the typed
 * no-authority result the payload carries, not an evidence UNKNOWN and not a hidden default.
 *
 * THE TANK'S MEANING IS ITS OWN. The pinned list orders Ignore Pain, Shield Block and Shield Wall
 * for simulated damage and survival-blind rage dumps. It says nothing about what this tank
 * needed in this fight, so a logged mitigation press is excluded as off-GCD and never judged,
 * and its line in the list only ever stops a scan.
 *
 * RAGE IS DECLARED ON THE OFFENSIVE CAPABILITY. The slice reads the decision cast's
 * own PRE_COST value. Declared here, or a request deriving its ingestion from this row would
 * silently under-fetch resources. No regeneration model and no carried value exist.
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
  PROTECTION_WARRIOR_AUTHORITY_IDENTITY,
  pinnedProtectionWarriorAuthority,
} from "./pinned-authority.js";

export const PROTECTION_WARRIOR_OFFENSIVE_CAPABILITY_ID = "warrior-protection.observed-rotational-decision";
export const PROTECTION_WARRIOR_RESOURCE_SPENDING_CAPABILITY_ID = "warrior-protection.resource-spending";
export const PROTECTION_WARRIOR_ACTIVE_MITIGATION_CAPABILITY_ID = "warrior-protection.active-mitigation";
export const PROTECTION_WARRIOR_DEFENSIVE_COOLDOWN_CAPABILITY_ID = "warrior-protection.defensive-cooldown";
export const PROTECTION_WARRIOR_SELF_HEALING_CAPABILITY_ID = "warrior-protection.self-healing";
export const PROTECTION_WARRIOR_INTERRUPT_CAPABILITY_ID = "warrior-protection.interrupt";

/** One capability per declared domain. Only the first has authority behind it. */
export const PROTECTION_WARRIOR_CAPABILITIES: readonly DecisionCapability[] = Object.freeze([
  {
    capabilityId: PROTECTION_WARRIOR_OFFENSIVE_CAPABILITY_ID,
    domain: "OFFENSIVE_ROTATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: ["RAGE"],
      evidenceCategories: ["CASTS", "RESOURCES", "COMBATANT_INFO"],
      targetModel: "PER_OBSERVED_CAST",
    },
  },
  {
    capabilityId: PROTECTION_WARRIOR_RESOURCE_SPENDING_CAPABILITY_ID,
    domain: "RESOURCE_SPENDING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: PROTECTION_WARRIOR_ACTIVE_MITIGATION_CAPABILITY_ID,
    domain: "ACTIVE_MITIGATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: PROTECTION_WARRIOR_DEFENSIVE_COOLDOWN_CAPABILITY_ID,
    domain: "DEFENSIVE_COOLDOWN",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: PROTECTION_WARRIOR_SELF_HEALING_CAPABILITY_ID,
    domain: "SELF_HEALING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "HEALING"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: PROTECTION_WARRIOR_INTERRUPT_CAPABILITY_ID,
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
export const PROTECTION_WARRIOR_OFFENSIVE_AUTHORITY: AuthorityDomainBinding = Object.freeze({
  kind: "SIMC_APL",
  domain: "OFFENSIVE_ROTATION",
  authorityId: PROTECTION_WARRIOR_AUTHORITY_IDENTITY.authorityId,
  artifactRevision: PROTECTION_WARRIOR_AUTHORITY_IDENTITY.artifactRevision,
  commitSha: PROTECTION_WARRIOR_AUTHORITY_IDENTITY.commitSha,
  load: pinnedProtectionWarriorAuthority,
});

export const PROTECTION_WARRIOR_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([
  PROTECTION_WARRIOR_OFFENSIVE_AUTHORITY,
]);

export const PROTECTION_WARRIOR_DECLARED_DOMAINS: readonly AuthorityDomain[] = Object.freeze(
  declaredDomainsOf(PROTECTION_WARRIOR_CAPABILITIES),
);

/**
 * The authority access the registration would build, for callers that reach the facade
 * directly (tests). The SAME resolver over the SAME declared domains and bindings, so a
 * direct call and an orchestrated call cannot disagree about what this specialization holds.
 */
export function standaloneProtectionWarriorAuthorityAccess(): AuthorityAccess {
  return Object.freeze({
    forDomain: (domain: AuthorityDomain) =>
      resolveAuthorityForDomain(
        PROTECTION_WARRIOR_DECLARED_DOMAINS,
        PROTECTION_WARRIOR_AUTHORITY_BINDINGS,
        domain,
      ),
  });
}
