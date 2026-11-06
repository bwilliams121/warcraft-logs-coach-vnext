/**
 * What Windwalker Monk binds, and to which domain (ONB-T1).
 *
 * ONE BINDING. The pinned APL governs OFFENSIVE_ROTATION and nothing else. The other
 * domains this evaluator DECLARES are bound to nothing, on purpose, and the registration's
 * authority access resolves each to `NO_PINNED_AUTHORITY_FOR_DOMAIN`:
 * resource spending (Energy or Chi between observations), defensive cooldowns (Touch of Karma's mitigation, Fortifying Brew) and interrupts
 * (Mind Freeze). That is the typed no-authority result the payload carries, not an evidence
 * UNKNOWN and not a hidden default. A DPS has no active-mitigation or self-healing family to
 * declare, so those two resolve `DOMAIN_NOT_DECLARED`.
 *
 * ENERGY IS DECLARED ON THE OFFENSIVE CAPABILITY. The slice reads the decision cast's own PRE_COST value, so a request deriving its ingestion from this row
 * cannot silently under-fetch it. Chi is not declared: no wire contract says what its type means, so nothing reads it (`vocabulary.ts`).
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
import { WINDWALKER_MONK_AUTHORITY_IDENTITY, pinnedWindwalkerMonkAuthority } from "./pinned-authority.js";

export const WINDWALKER_MONK_OFFENSIVE_CAPABILITY_ID = "monk-windwalker.observed-rotational-decision";
export const WINDWALKER_MONK_RESOURCE_SPENDING_CAPABILITY_ID = "monk-windwalker.resource-spending";
export const WINDWALKER_MONK_DEFENSIVE_COOLDOWN_CAPABILITY_ID = "monk-windwalker.defensive-cooldown";
export const WINDWALKER_MONK_INTERRUPT_CAPABILITY_ID = "monk-windwalker.interrupt";

/** One capability per declared domain. Only the first has authority behind it. */
export const WINDWALKER_MONK_CAPABILITIES: readonly DecisionCapability[] = Object.freeze([
  {
    capabilityId: WINDWALKER_MONK_OFFENSIVE_CAPABILITY_ID,
    domain: "OFFENSIVE_ROTATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: ["ENERGY"],
      evidenceCategories: ["CASTS", "RESOURCES", "COMBATANT_INFO"],
      targetModel: "PER_OBSERVED_CAST",
    },
  },
  {
    capabilityId: WINDWALKER_MONK_RESOURCE_SPENDING_CAPABILITY_ID,
    domain: "RESOURCE_SPENDING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: WINDWALKER_MONK_DEFENSIVE_COOLDOWN_CAPABILITY_ID,
    domain: "DEFENSIVE_COOLDOWN",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: WINDWALKER_MONK_INTERRUPT_CAPABILITY_ID,
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
export const WINDWALKER_MONK_OFFENSIVE_AUTHORITY: AuthorityDomainBinding = Object.freeze({
  kind: "SIMC_APL",
  domain: "OFFENSIVE_ROTATION",
  authorityId: WINDWALKER_MONK_AUTHORITY_IDENTITY.authorityId,
  artifactRevision: WINDWALKER_MONK_AUTHORITY_IDENTITY.artifactRevision,
  commitSha: WINDWALKER_MONK_AUTHORITY_IDENTITY.commitSha,
  load: pinnedWindwalkerMonkAuthority,
});

export const WINDWALKER_MONK_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([
  WINDWALKER_MONK_OFFENSIVE_AUTHORITY,
]);

export const WINDWALKER_MONK_DECLARED_DOMAINS: readonly AuthorityDomain[] = Object.freeze(
  declaredDomainsOf(WINDWALKER_MONK_CAPABILITIES),
);

/**
 * The authority access the registration would build, for callers that reach the facade
 * directly (tests). The SAME resolver over the SAME declared domains and bindings, so a
 * direct call and an orchestrated call cannot disagree about what this specialization holds.
 */
export function standaloneWindwalkerMonkAuthorityAccess(): AuthorityAccess {
  return Object.freeze({
    forDomain: (domain: AuthorityDomain) =>
      resolveAuthorityForDomain(WINDWALKER_MONK_DECLARED_DOMAINS, WINDWALKER_MONK_AUTHORITY_BINDINGS, domain),
  });
}
