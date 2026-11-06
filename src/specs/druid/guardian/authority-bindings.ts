/**
 * What Guardian Druid binds, and to which domain (ONB-T2).
 *
 * ONE BINDING. The pinned APL governs OFFENSIVE_ROTATION and nothing else. The other
 * domains this evaluator DECLARES are bound to nothing, on purpose, and the registration's
 * authority access resolves each to `NO_PINNED_AUTHORITY_FOR_DOMAIN`:
 * resource spending (Rage), defensive cooldowns (Barkskin, Survival Instincts, Rage of the Sleeper) and interrupts
 * (Skull Bash). That is the typed no-authority result the payload carries, not an evidence
 * UNKNOWN and not a hidden default. So do active mitigation (Ironfur) and self healing (Frenzied Regeneration),
 * which a tank declares and a DPS does not.
 *
 * THE TANK'S MEANING IS ITS OWN. The pinned list presses Ironfur on Rage and Barkskin in Bear Form for simulated damage. It says nothing about what this tank needed in this
 * fight, so a logged Ironfur or Barkskin is excluded as off-GCD and never judged, and each one's line in the list only ever stops a scan. A Mangle or a Maul is a
 * rotational press here and nothing more: a comparison of one is never a claim about the damage it took or healed.
 *
 * NO RESOURCE IS DECLARED ON THE OFFENSIVE CAPABILITY, because none is read. Rage stays
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
import { GUARDIAN_DRUID_AUTHORITY_IDENTITY, pinnedGuardianDruidAuthority } from "./pinned-authority.js";

export const GUARDIAN_OFFENSIVE_CAPABILITY_ID = "druid-guardian.observed-rotational-decision";
export const GUARDIAN_RESOURCE_SPENDING_CAPABILITY_ID = "druid-guardian.resource-spending";
export const GUARDIAN_ACTIVE_MITIGATION_CAPABILITY_ID = "druid-guardian.active-mitigation";
export const GUARDIAN_DEFENSIVE_COOLDOWN_CAPABILITY_ID = "druid-guardian.defensive-cooldown";
export const GUARDIAN_SELF_HEALING_CAPABILITY_ID = "druid-guardian.self-healing";
export const GUARDIAN_INTERRUPT_CAPABILITY_ID = "druid-guardian.interrupt";

/** One capability per declared domain. Only the first has authority behind it. */
export const GUARDIAN_CAPABILITIES: readonly DecisionCapability[] = Object.freeze([
  {
    capabilityId: GUARDIAN_OFFENSIVE_CAPABILITY_ID,
    domain: "OFFENSIVE_ROTATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "COMBATANT_INFO"],
      targetModel: "PER_OBSERVED_CAST",
    },
  },
  {
    capabilityId: GUARDIAN_RESOURCE_SPENDING_CAPABILITY_ID,
    domain: "RESOURCE_SPENDING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: GUARDIAN_ACTIVE_MITIGATION_CAPABILITY_ID,
    domain: "ACTIVE_MITIGATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: GUARDIAN_DEFENSIVE_COOLDOWN_CAPABILITY_ID,
    domain: "DEFENSIVE_COOLDOWN",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: GUARDIAN_SELF_HEALING_CAPABILITY_ID,
    domain: "SELF_HEALING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "HEALING"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: GUARDIAN_INTERRUPT_CAPABILITY_ID,
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
export const GUARDIAN_OFFENSIVE_AUTHORITY: AuthorityDomainBinding = Object.freeze({
  kind: "SIMC_APL",
  domain: "OFFENSIVE_ROTATION",
  authorityId: GUARDIAN_DRUID_AUTHORITY_IDENTITY.authorityId,
  artifactRevision: GUARDIAN_DRUID_AUTHORITY_IDENTITY.artifactRevision,
  commitSha: GUARDIAN_DRUID_AUTHORITY_IDENTITY.commitSha,
  load: pinnedGuardianDruidAuthority,
});

export const GUARDIAN_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([
  GUARDIAN_OFFENSIVE_AUTHORITY,
]);

export const GUARDIAN_DECLARED_DOMAINS: readonly AuthorityDomain[] = Object.freeze(
  declaredDomainsOf(GUARDIAN_CAPABILITIES),
);

/**
 * The authority access the registration would build, for callers that reach the facade
 * directly (tests). The SAME resolver over the SAME declared domains and bindings, so a
 * direct call and an orchestrated call cannot disagree about what this specialization holds.
 */
export function standaloneGuardianAuthorityAccess(): AuthorityAccess {
  return Object.freeze({
    forDomain: (domain: AuthorityDomain) =>
      resolveAuthorityForDomain(GUARDIAN_DECLARED_DOMAINS, GUARDIAN_AUTHORITY_BINDINGS, domain),
  });
}
