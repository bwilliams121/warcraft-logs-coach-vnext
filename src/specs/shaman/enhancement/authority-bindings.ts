/**
 * What Enhancement Shaman binds, and to which domain (ONB-B2).
 *
 * ONE BINDING. The pinned APL governs OFFENSIVE_ROTATION and nothing else. The other
 * domains this evaluator DECLARES are bound to nothing, on purpose, and the registration's
 * authority access resolves each to `NO_PINNED_AUTHORITY_FOR_DOMAIN`:
 * resource spending (Maelstrom Weapon stack), defensive cooldowns (Astral Shift) and interrupts
 * (Wind Shear). That is the typed no-authority result the payload carries, not an evidence
 * UNKNOWN and not a hidden default. A DPS has no active-mitigation or self-healing family to
 * declare, so those two resolve `DOMAIN_NOT_DECLARED`.
 *
 * NO RESOURCE IS DECLARED ON THE OFFENSIVE CAPABILITY, because the slice reads none. The list's own
 * resource is Maelstrom Weapon, a stacking aura, and `buff.maelstrom_weapon.stack` stays unbound.
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
  ENHANCEMENT_SHAMAN_AUTHORITY_IDENTITY,
  pinnedEnhancementShamanAuthority,
} from "./pinned-authority.js";

export const ENHANCEMENT_SHAMAN_OFFENSIVE_CAPABILITY_ID = "shaman-enhancement.observed-rotational-decision";
export const ENHANCEMENT_SHAMAN_RESOURCE_SPENDING_CAPABILITY_ID = "shaman-enhancement.resource-spending";
export const ENHANCEMENT_SHAMAN_DEFENSIVE_COOLDOWN_CAPABILITY_ID = "shaman-enhancement.defensive-cooldown";
export const ENHANCEMENT_SHAMAN_INTERRUPT_CAPABILITY_ID = "shaman-enhancement.interrupt";

/** One capability per declared domain. Only the first has authority behind it. */
export const ENHANCEMENT_SHAMAN_CAPABILITIES: readonly DecisionCapability[] = Object.freeze([
  {
    capabilityId: ENHANCEMENT_SHAMAN_OFFENSIVE_CAPABILITY_ID,
    domain: "OFFENSIVE_ROTATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "COMBATANT_INFO"],
      targetModel: "PER_OBSERVED_CAST",
    },
  },
  {
    capabilityId: ENHANCEMENT_SHAMAN_RESOURCE_SPENDING_CAPABILITY_ID,
    domain: "RESOURCE_SPENDING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: ENHANCEMENT_SHAMAN_DEFENSIVE_COOLDOWN_CAPABILITY_ID,
    domain: "DEFENSIVE_COOLDOWN",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: ENHANCEMENT_SHAMAN_INTERRUPT_CAPABILITY_ID,
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
export const ENHANCEMENT_SHAMAN_OFFENSIVE_AUTHORITY: AuthorityDomainBinding = Object.freeze({
  kind: "SIMC_APL",
  domain: "OFFENSIVE_ROTATION",
  authorityId: ENHANCEMENT_SHAMAN_AUTHORITY_IDENTITY.authorityId,
  artifactRevision: ENHANCEMENT_SHAMAN_AUTHORITY_IDENTITY.artifactRevision,
  commitSha: ENHANCEMENT_SHAMAN_AUTHORITY_IDENTITY.commitSha,
  load: pinnedEnhancementShamanAuthority,
});

export const ENHANCEMENT_SHAMAN_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([
  ENHANCEMENT_SHAMAN_OFFENSIVE_AUTHORITY,
]);

export const ENHANCEMENT_SHAMAN_DECLARED_DOMAINS: readonly AuthorityDomain[] = Object.freeze(
  declaredDomainsOf(ENHANCEMENT_SHAMAN_CAPABILITIES),
);

/**
 * The authority access the registration would build, for callers that reach the facade
 * directly (tests). The SAME resolver over the SAME declared domains and bindings, so a
 * direct call and an orchestrated call cannot disagree about what this specialization holds.
 */
export function standaloneEnhancementShamanAuthorityAccess(): AuthorityAccess {
  return Object.freeze({
    forDomain: (domain: AuthorityDomain) =>
      resolveAuthorityForDomain(
        ENHANCEMENT_SHAMAN_DECLARED_DOMAINS,
        ENHANCEMENT_SHAMAN_AUTHORITY_BINDINGS,
        domain,
      ),
  });
}
