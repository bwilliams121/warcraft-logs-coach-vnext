/**
 * What Unholy Death Knight binds, and to which domain (ONB-X5).
 *
 * ONE BINDING. The pinned APL governs OFFENSIVE_ROTATION and nothing else. The other
 * domains this evaluator DECLARES are bound to nothing, on purpose, and the registration's
 * authority access resolves each to `NO_PINNED_AUTHORITY_FOR_DOMAIN`:
 * resource spending (Runes or Runic Power between observations), defensive cooldowns (Anti-Magic Shell) and interrupts
 * (Mind Freeze). That is the typed no-authority result the payload carries, not an evidence
 * UNKNOWN and not a hidden default. A DPS has no active-mitigation or self-healing family to
 * declare, so those two resolve `DOMAIN_NOT_DECLARED`.
 *
 * RUNES AND RUNIC POWER ARE DECLARED ON THE OFFENSIVE CAPABILITY. The slice reads the decision cast's
 * own PRE_COST value of each. Declared here, or a request deriving its ingestion from this row would
 * silently under-fetch resources. No regeneration model and no carried value exist.
 *
 * SUMMONS IS DECLARED ON THE OFFENSIVE CAPABILITY, because the pet readings consume them (`pet-profile.ts`). Declared here, or a
 * request deriving its ingestion from this row would silently under-fetch the very evidence absence claims gate on.
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
  UNHOLY_DEATH_KNIGHT_AUTHORITY_IDENTITY,
  pinnedUnholyDeathKnightAuthority,
} from "./pinned-authority.js";

export const UNHOLY_DEATH_KNIGHT_OFFENSIVE_CAPABILITY_ID = "deathknight-unholy.observed-rotational-decision";
export const UNHOLY_DEATH_KNIGHT_RESOURCE_SPENDING_CAPABILITY_ID = "deathknight-unholy.resource-spending";
export const UNHOLY_DEATH_KNIGHT_DEFENSIVE_COOLDOWN_CAPABILITY_ID = "deathknight-unholy.defensive-cooldown";
export const UNHOLY_DEATH_KNIGHT_INTERRUPT_CAPABILITY_ID = "deathknight-unholy.interrupt";

/** One capability per declared domain. Only the first has authority behind it. */
export const UNHOLY_DEATH_KNIGHT_CAPABILITIES: readonly DecisionCapability[] = Object.freeze([
  {
    capabilityId: UNHOLY_DEATH_KNIGHT_OFFENSIVE_CAPABILITY_ID,
    domain: "OFFENSIVE_ROTATION",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: ["RUNES", "RUNIC_POWER"],
      evidenceCategories: ["CASTS", "RESOURCES", "COMBATANT_INFO", "SUMMONS"],
      targetModel: "PER_OBSERVED_CAST",
    },
  },
  {
    capabilityId: UNHOLY_DEATH_KNIGHT_RESOURCE_SPENDING_CAPABILITY_ID,
    domain: "RESOURCE_SPENDING",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: UNHOLY_DEATH_KNIGHT_DEFENSIVE_COOLDOWN_CAPABILITY_ID,
    domain: "DEFENSIVE_COOLDOWN",
    requirements: {
      scope: "PLAYER_CONTEXT",
      resources: [],
      evidenceCategories: ["CASTS", "AURAS", "DAMAGE"],
      targetModel: "NO_TARGET",
    },
  },
  {
    capabilityId: UNHOLY_DEATH_KNIGHT_INTERRUPT_CAPABILITY_ID,
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
export const UNHOLY_DEATH_KNIGHT_OFFENSIVE_AUTHORITY: AuthorityDomainBinding = Object.freeze({
  kind: "SIMC_APL",
  domain: "OFFENSIVE_ROTATION",
  authorityId: UNHOLY_DEATH_KNIGHT_AUTHORITY_IDENTITY.authorityId,
  artifactRevision: UNHOLY_DEATH_KNIGHT_AUTHORITY_IDENTITY.artifactRevision,
  commitSha: UNHOLY_DEATH_KNIGHT_AUTHORITY_IDENTITY.commitSha,
  load: pinnedUnholyDeathKnightAuthority,
});

export const UNHOLY_DEATH_KNIGHT_AUTHORITY_BINDINGS: readonly AuthorityDomainBinding[] = Object.freeze([
  UNHOLY_DEATH_KNIGHT_OFFENSIVE_AUTHORITY,
]);

export const UNHOLY_DEATH_KNIGHT_DECLARED_DOMAINS: readonly AuthorityDomain[] = Object.freeze(
  declaredDomainsOf(UNHOLY_DEATH_KNIGHT_CAPABILITIES),
);

/**
 * The authority access the registration would build, for callers that reach the facade
 * directly (tests). The SAME resolver over the SAME declared domains and bindings, so a
 * direct call and an orchestrated call cannot disagree about what this specialization holds.
 */
export function standaloneUnholyDeathKnightAuthorityAccess(): AuthorityAccess {
  return Object.freeze({
    forDomain: (domain: AuthorityDomain) =>
      resolveAuthorityForDomain(
        UNHOLY_DEATH_KNIGHT_DECLARED_DOMAINS,
        UNHOLY_DEATH_KNIGHT_AUTHORITY_BINDINGS,
        domain,
      ),
  });
}
