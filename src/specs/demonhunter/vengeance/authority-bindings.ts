/**
 * What Vengeance Demon Hunter binds, and to which domain (ONB-X3).
 *
 * ONE BINDING. The pinned APL governs OFFENSIVE_ROTATION and nothing else. The other
 * domains this evaluator DECLARES are bound to nothing, on purpose, and the registration's
 * authority access resolves each to `NO_PINNED_AUTHORITY_FOR_DOMAIN`:
 * resource spending (Fury), active mitigation (Demon Spikes), defensive cooldowns (Metamorphosis, Fiery Brand),
 * self healing (Soul Cleave, Fel Devastation) and interrupts (Disrupt). That is the typed
 * no-authority result the payload carries, not an evidence UNKNOWN and not a hidden default.
 *
 * THE TANK'S MEANING IS ITS OWN. The pinned list keeps Demon Spikes up whenever it is down and in combat, and presses Metamorphosis for
 * simulated damage. It says nothing about what this tank needed in this fight, so a logged Demon Spikes or Metamorphosis is
 * excluded as off-GCD and never judged, and each one's line in the list only ever stops a scan. A Fiery Brand or a Soul Cleave is a
 * rotational press here and nothing more: a comparison of one is never a claim about the damage it took or healed.
 *
 * FURY IS DECLARED ON THE OFFENSIVE CAPABILITY. The slice reads the decision cast's own PRE_COST value.
 * Declared here, or a request deriving its ingestion from this row would silently under-fetch resources.
 * No generation model and no carried value exist.
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
  VENGEANCE_DEMON_HUNTER_AUTHORITY_IDENTITY,
  pinnedVengeanceDemonHunterAuthority,
} from "./pinned-authority.js";

export const VENGEANCE_DEMON_HUNTER_OFFENSIVE_CAPABILITY_ID =
  "demonhunter-vengeance.observed-rotational-decision";
export const VENGEANCE_DEMON_HUNTER_RESOURCE_SPENDING_CAPABILITY_ID =
  "demonhunter-vengeance.resource-spending";
export const VENGEANCE_DEMON_HUNTER_ACTIVE_MITIGATION_CAPABILITY_ID =
  "demonhunter-vengeance.active-mitigation";
export const VENGEANCE_DEMON_HUNTER_DEFENSIVE_COOLDOWN_CAPABILITY_ID =
  "demonhunter-vengeance.defensive-cooldown";
export const VENGEANCE_DEMON_HUNTER_SELF_HEALING_CAPABILITY_ID = "demonhunter-vengeance.self-healing";
export const VENGEANCE_DEMON_HUNTER_INTERRUPT_CAPABILITY_ID = "demonhunter-vengeance.interrupt";

/** One capability per declared domain. Only the first has authority behind it. */
export const VENGEANCE_DEMON_HUNTER_CAPABILITIES: readonly DecisionCapability[] = Object.freeze([
  {
    capabilityId: VENGEANCE_DEMON_HUNTER_OFFENSIVE_CAPABILITY_ID,
    domain: "OFFENSIVE_ROTATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: ["FURY"],
      evidenceCategories: ["CASTS", "RESOURCES", "COMBATANT_INFO"],
      targetModel: "PER_OBSERVED_CAST",
    },
  },
  {
    capabilityId: VENGEANCE_DEMON_HUNTER_RESOURCE_SPENDING_CAPABILITY_ID,
    domain: "RESOURCE_SPENDING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: VENGEANCE_DEMON_HUNTER_ACTIVE_MITIGATION_CAPABILITY_ID,
    domain: "ACTIVE_MITIGATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: VENGEANCE_DEMON_HUNTER_DEFENSIVE_COOLDOWN_CAPABILITY_ID,
    domain: "DEFENSIVE_COOLDOWN",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: VENGEANCE_DEMON_HUNTER_SELF_HEALING_CAPABILITY_ID,
    domain: "SELF_HEALING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "HEALING"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: VENGEANCE_DEMON_HUNTER_INTERRUPT_CAPABILITY_ID,
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
export const VENGEANCE_DEMON_HUNTER_OFFENSIVE_AUTHORITY: AuthorityDomainBinding = Object.freeze({
  kind: "SIMC_APL",
  domain: "OFFENSIVE_ROTATION",
  authorityId: VENGEANCE_DEMON_HUNTER_AUTHORITY_IDENTITY.authorityId,
  artifactRevision: VENGEANCE_DEMON_HUNTER_AUTHORITY_IDENTITY.artifactRevision,
  commitSha: VENGEANCE_DEMON_HUNTER_AUTHORITY_IDENTITY.commitSha,
  load: pinnedVengeanceDemonHunterAuthority,
});

export const VENGEANCE_DEMON_HUNTER_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([
  VENGEANCE_DEMON_HUNTER_OFFENSIVE_AUTHORITY,
]);

export const VENGEANCE_DEMON_HUNTER_DECLARED_DOMAINS: readonly AuthorityDomain[] = Object.freeze(
  declaredDomainsOf(VENGEANCE_DEMON_HUNTER_CAPABILITIES),
);

/**
 * The authority access the registration would build, for callers that reach the facade
 * directly (tests). The SAME resolver over the SAME declared domains and bindings, so a
 * direct call and an orchestrated call cannot disagree about what this specialization holds.
 */
export function standaloneVengeanceDemonHunterAuthorityAccess(): AuthorityAccess {
  return Object.freeze({
    forDomain: (domain: AuthorityDomain) =>
      resolveAuthorityForDomain(
        VENGEANCE_DEMON_HUNTER_DECLARED_DOMAINS,
        VENGEANCE_DEMON_HUNTER_AUTHORITY_BINDINGS,
        domain,
      ),
  });
}
