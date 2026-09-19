/**
 * The decision domains a Blood Death Knight analysis represents, each on its
 * own terms (M11-B2).
 *
 * ONE RESULT PER DOMAIN, so the offensive verdicts can never be read as
 * coaching for anything else. All six domains are DECLARED
 * (`authority-bindings.ts`): the offensive rotation the pinned authority
 * governs, and five — resource spending, active mitigation, defensive
 * cooldowns, self healing, interrupts — that are declared and bound to
 * nothing, so their result is the typed `NO_PINNED_AUTHORITY_FOR_DOMAIN`.
 * None resolves `DOMAIN_NOT_DECLARED`: a tank asks every one of these
 * questions, and the analyzer says so even where it has no standard.
 *
 * DEATH STRIKE, STATED ONCE. Death Strike is the pinned list's Runic Power
 * spender (the offensive rotation reads it as `death_strike` under
 * `runic_power.deficit` gates) AND the specialization's active-mitigation
 * and self-healing button (its heal scales with damage recently taken and
 * grants Blood Shield). The pinned SimulationCraft list models only the
 * first meaning — SimulationCraft maximises damage and does not model
 * incoming damage, health deficits or absorb value for this decision — so a
 * Death Strike the offensive list would not have pressed here is NOT
 * thereby a mistake: the player may have pressed it to survive, which is a
 * question of the ACTIVE_MITIGATION and SELF_HEALING domains, for which
 * this analyzer has NO authority. The offensive result for a Death Strike
 * decision therefore carries `deathStrikeDualRole: true` on the payload, and
 * the two defensive domains carry `sharesActionWithOffensive: "death_strike"`,
 * so a reader of any one result sees the other. Nothing here rewrites the
 * offensive comparison; nothing here invents a defensive verdict.
 *
 * The interrupt domain carries the INTERRUPTS evidence family's capability
 * beside its no-authority result, because both are true and neither implies
 * the other. Neither is ever rendered as "no interrupts were used".
 *
 * Every status here is READ from the registration's authority access, never
 * hard-coded.
 */

import type {
  AuthorityAccess,
  AuthorityDomain,
  AuthorityResolutionOutcome,
} from "../../../findings/authority-domain.js";
import { AUTHORITY_DOMAINS } from "../../../findings/authority-domain.js";
import type { EvidenceCapability } from "../../../wcl/evidence-capability.js";

/** The only thing an offensive MATCH means. Restated on the payload so no reader has to know the rule. */
export const MATCH_MEANING = "AUTHORITY_COMPATIBLE_ONLY";

/** The token the offensive list and the two survival domains share. */
export const DEATH_STRIKE_TOKEN = "death_strike";

export type BloodDomainResult =
  | {
      readonly domain: "OFFENSIVE_ROTATION";
      readonly resolution: "AUTHORITY_AVAILABLE";
      readonly authorityId: string;
      readonly artifactRevision: string;
      readonly matchMeaning: typeof MATCH_MEANING;
      /** The offensive authority reads Death Strike as a spender only; see the module header. */
      readonly deathStrikeDualRole: true;
    }
  | {
      readonly domain: "OFFENSIVE_ROTATION";
      readonly resolution: Exclude<AuthorityResolutionOutcome, "AUTHORITY_AVAILABLE">;
    }
  | {
      readonly domain: "ACTIVE_MITIGATION" | "SELF_HEALING";
      /** The registration's own resolution for the domain. Never "EVALUATED". */
      readonly resolution: AuthorityResolutionOutcome;
      /** What the offensive authority is NOT allowed to say here. */
      readonly offensiveAuthorityGoverns: false;
      /** The same button the offensive list judges under a different meaning. */
      readonly sharesActionWithOffensive: typeof DEATH_STRIKE_TOKEN;
    }
  | {
      readonly domain: "RESOURCE_SPENDING" | "DEFENSIVE_COOLDOWN";
      readonly resolution: AuthorityResolutionOutcome;
      readonly offensiveAuthorityGoverns: false;
    }
  | {
      readonly domain: "INTERRUPT";
      readonly resolution: AuthorityResolutionOutcome;
      readonly offensiveAuthorityGoverns: false;
      /** The INTERRUPTS evidence family's capability in this fight, verbatim from completeness. */
      readonly evidenceFamily: EvidenceCapability;
    };

export type BloodDomainResults = readonly BloodDomainResult[];

export function bloodDomainResults(
  authority: AuthorityAccess,
  interruptEvidenceFamily: EvidenceCapability,
): BloodDomainResults {
  return AUTHORITY_DOMAINS.map((domain): BloodDomainResult =>
    domainResult(authority, domain, interruptEvidenceFamily),
  );
}

function domainResult(
  authority: AuthorityAccess,
  domain: AuthorityDomain,
  interruptEvidenceFamily: EvidenceCapability,
): BloodDomainResult {
  const resolved = authority.forDomain(domain);
  switch (domain) {
    case "OFFENSIVE_ROTATION":
      if (resolved.outcome === "AUTHORITY_AVAILABLE") {
        return {
          domain,
          resolution: "AUTHORITY_AVAILABLE",
          authorityId: resolved.authority.artifact.authorityId,
          artifactRevision: resolved.authority.artifact.artifactRevision,
          matchMeaning: MATCH_MEANING,
          deathStrikeDualRole: true,
        };
      }
      return { domain, resolution: resolved.outcome };
    case "INTERRUPT":
      return {
        domain,
        resolution: resolved.outcome,
        offensiveAuthorityGoverns: false,
        evidenceFamily: interruptEvidenceFamily,
      };
    case "ACTIVE_MITIGATION":
    case "SELF_HEALING":
      return {
        domain,
        resolution: resolved.outcome,
        offensiveAuthorityGoverns: false,
        sharesActionWithOffensive: DEATH_STRIKE_TOKEN,
      };
    case "RESOURCE_SPENDING":
    case "DEFENSIVE_COOLDOWN":
      return { domain, resolution: resolved.outcome, offensiveAuthorityGoverns: false };
  }
}
