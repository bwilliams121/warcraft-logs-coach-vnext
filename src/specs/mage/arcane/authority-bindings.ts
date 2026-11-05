/**
 * What Arcane Mage binds, and to which domain (ONB-D3).
 *
 * ONE BINDING. The pinned APL governs OFFENSIVE_ROTATION and nothing else. The other
 * domains this evaluator DECLARES are bound to nothing, on purpose, and the registration's
 * authority access resolves each to `NO_PINNED_AUTHORITY_FOR_DOMAIN`:
 * resource spending (Mana), defensive cooldowns (Prismatic Barrier, Ice Block, Alter Time, Mirror Image) and interrupts
 * (Counterspell). That is the typed no-authority result the payload carries, not an evidence
 * UNKNOWN and not a hidden default. A DPS has no active-mitigation or self-healing family to
 * declare, so those two resolve `DOMAIN_NOT_DECLARED`.
 *
 * NO RESOURCE IS DECLARED ON THE OFFENSIVE CAPABILITY, because none is read. Mana stays
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
import { ARCANE_MAGE_AUTHORITY_IDENTITY, pinnedArcaneMageAuthority } from "./pinned-authority.js";

export const ARCANE_OFFENSIVE_CAPABILITY_ID = "mage-arcane.observed-rotational-decision";
export const ARCANE_RESOURCE_SPENDING_CAPABILITY_ID = "mage-arcane.resource-spending";
export const ARCANE_DEFENSIVE_COOLDOWN_CAPABILITY_ID = "mage-arcane.defensive-cooldown";
export const ARCANE_INTERRUPT_CAPABILITY_ID = "mage-arcane.interrupt";

/** One capability per declared domain. Only the first has authority behind it. */
export const ARCANE_CAPABILITIES: readonly DecisionCapability[] = Object.freeze([
  {
    capabilityId: ARCANE_OFFENSIVE_CAPABILITY_ID,
    domain: "OFFENSIVE_ROTATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "COMBATANT_INFO"],
      targetModel: "PER_OBSERVED_CAST",
    },
  },
  {
    capabilityId: ARCANE_RESOURCE_SPENDING_CAPABILITY_ID,
    domain: "RESOURCE_SPENDING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: ARCANE_DEFENSIVE_COOLDOWN_CAPABILITY_ID,
    domain: "DEFENSIVE_COOLDOWN",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: ARCANE_INTERRUPT_CAPABILITY_ID,
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
export const ARCANE_OFFENSIVE_AUTHORITY: AuthorityDomainBinding = Object.freeze({
  kind: "SIMC_APL",
  domain: "OFFENSIVE_ROTATION",
  authorityId: ARCANE_MAGE_AUTHORITY_IDENTITY.authorityId,
  artifactRevision: ARCANE_MAGE_AUTHORITY_IDENTITY.artifactRevision,
  commitSha: ARCANE_MAGE_AUTHORITY_IDENTITY.commitSha,
  load: pinnedArcaneMageAuthority,
});

export const ARCANE_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([
  ARCANE_OFFENSIVE_AUTHORITY,
]);

export const ARCANE_DECLARED_DOMAINS: readonly AuthorityDomain[] = Object.freeze(
  declaredDomainsOf(ARCANE_CAPABILITIES),
);

/**
 * The authority access the registration would build, for callers that reach the facade
 * directly (tests). The SAME resolver over the SAME declared domains and bindings, so a
 * direct call and an orchestrated call cannot disagree about what this specialization holds.
 */
export function standaloneArcaneAuthorityAccess(): AuthorityAccess {
  return Object.freeze({
    forDomain: (domain: AuthorityDomain) =>
      resolveAuthorityForDomain(ARCANE_DECLARED_DOMAINS, ARCANE_AUTHORITY_BINDINGS, domain),
  });
}
