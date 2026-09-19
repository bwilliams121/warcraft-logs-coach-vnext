/**
 * What Blood Death Knight binds, and to which domain (M11-B2).
 *
 * ONE BINDING. The pinned APL governs OFFENSIVE_ROTATION and nothing else.
 * The five other domains this evaluator DECLARES — resource spending
 * (Runes and Runic Power), active mitigation (Bone Shield and the
 * mitigation half of Death Strike), defensive cooldowns (Vampiric Blood,
 * Anti-Magic Shell, Icebound Fortitude, Dancing Rune Weapon's parry), self
 * healing (the healing half of Death Strike) and interrupts (Mind Freeze) —
 * are bound to nothing, on purpose, and the registration's authority access
 * resolves each of them to `NO_PINNED_AUTHORITY_FOR_DOMAIN`. That is the
 * typed no-authority result the payload carries for them. It is not an
 * evidence UNKNOWN and it is not a hidden default: `PROVIDER_DOMAIN_COMPATIBILITY`
 * would refuse a SimulationCraft binding for any of the five, and no
 * artifact exists that could model them.
 *
 * WHY ALL SIX ARE DECLARED FOR A TANK. A Blood Death Knight HAS an
 * active-mitigation family and a self-healing family, and both are the same
 * button the offensive list also names (`domains.ts`). Declaring the domains
 * and binding nothing is how the analyzer says "this is a real question
 * about this specialization, and we have no authority for it" — which is a
 * different statement from `DOMAIN_NOT_DECLARED`, the one a DPS Paladin
 * makes about active mitigation.
 *
 * Shared between the registration (which hands the access object to the
 * facade) and the facade's standalone path (tests, the corpus executor), so
 * there is exactly one statement of what this specialization holds.
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
  BLOOD_DEATH_KNIGHT_AUTHORITY_IDENTITY,
  pinnedBloodDeathKnightAuthority,
} from "./pinned-authority.js";
import { RUNES_RESOURCE_ID, RUNIC_POWER_RESOURCE_ID } from "./spec.js";

export const BLOOD_OFFENSIVE_CAPABILITY_ID = "deathknight-blood.observed-rotational-decision";
export const BLOOD_RESOURCE_SPENDING_CAPABILITY_ID = "deathknight-blood.resource-spending";
export const BLOOD_ACTIVE_MITIGATION_CAPABILITY_ID = "deathknight-blood.active-mitigation";
export const BLOOD_DEFENSIVE_COOLDOWN_CAPABILITY_ID = "deathknight-blood.defensive-cooldown";
export const BLOOD_SELF_HEALING_CAPABILITY_ID = "deathknight-blood.self-healing";
export const BLOOD_INTERRUPT_CAPABILITY_ID = "deathknight-blood.interrupt";

/**
 * The six capabilities, one per declared domain. Only the first has
 * authority behind it.
 *
 * `includeResources` is DERIVED from the resources named here: Runes and
 * Runic Power are read (as observations on the subject's own costed casts)
 * by the offensive capability, so both are listed and the ingestion
 * requirement follows.
 */
export const BLOOD_CAPABILITIES: readonly DecisionCapability[] = Object.freeze([
  {
    capabilityId: BLOOD_OFFENSIVE_CAPABILITY_ID,
    domain: "OFFENSIVE_ROTATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [RUNES_RESOURCE_ID, RUNIC_POWER_RESOURCE_ID],
      evidenceCategories: ["CASTS", "RESOURCES", "AURAS", "COMBATANT_INFO", "GEAR"],
      targetModel: "PER_OBSERVED_CAST",
    },
  },
  {
    capabilityId: BLOOD_RESOURCE_SPENDING_CAPABILITY_ID,
    domain: "RESOURCE_SPENDING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [RUNES_RESOURCE_ID, RUNIC_POWER_RESOURCE_ID],
      evidenceCategories: ["CASTS", "RESOURCES"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: BLOOD_ACTIVE_MITIGATION_CAPABILITY_ID,
    domain: "ACTIVE_MITIGATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [RUNIC_POWER_RESOURCE_ID],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: BLOOD_DEFENSIVE_COOLDOWN_CAPABILITY_ID,
    domain: "DEFENSIVE_COOLDOWN",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: BLOOD_SELF_HEALING_CAPABILITY_ID,
    domain: "SELF_HEALING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [RUNIC_POWER_RESOURCE_ID],
      evidenceCategories: ["CASTS", "HEALING", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: BLOOD_INTERRUPT_CAPABILITY_ID,
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
export const BLOOD_OFFENSIVE_AUTHORITY: AuthorityDomainBinding = Object.freeze({
  kind: "SIMC_APL",
  domain: "OFFENSIVE_ROTATION",
  authorityId: BLOOD_DEATH_KNIGHT_AUTHORITY_IDENTITY.authorityId,
  artifactRevision: BLOOD_DEATH_KNIGHT_AUTHORITY_IDENTITY.artifactRevision,
  commitSha: BLOOD_DEATH_KNIGHT_AUTHORITY_IDENTITY.commitSha,
  load: pinnedBloodDeathKnightAuthority,
});

export const BLOOD_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([
  BLOOD_OFFENSIVE_AUTHORITY,
]);

export const BLOOD_DECLARED_DOMAINS: readonly AuthorityDomain[] = Object.freeze(
  declaredDomainsOf(BLOOD_CAPABILITIES),
);

/**
 * The authority access the registration would build, for callers that reach
 * the facade directly (the corpus executor, tests). The SAME resolver over
 * the SAME declared domains and bindings, so a direct call and an
 * orchestrated call cannot disagree about what this specialization holds.
 */
export function standaloneBloodAuthorityAccess(): AuthorityAccess {
  return Object.freeze({
    forDomain: (domain: AuthorityDomain) =>
      resolveAuthorityForDomain(BLOOD_DECLARED_DOMAINS, BLOOD_AUTHORITY_BINDINGS, domain),
  });
}
