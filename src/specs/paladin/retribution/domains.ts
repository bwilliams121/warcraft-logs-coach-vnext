/**
 * The decision domains a Retribution Paladin analysis represents, each on
 * its own terms (M11-A4).
 *
 * ONE RESULT PER DOMAIN, so the offensive verdicts can never be read as
 * coaching for anything else. Four domains are DECLARED
 * (`authority-bindings.ts`): the offensive rotation the pinned authority
 * governs, and three — resource spending, defensive cooldowns, interrupts —
 * that are declared and bound to nothing, so their result is the typed
 * `NO_PINNED_AUTHORITY_FOR_DOMAIN`. Active mitigation and self-healing are
 * NOT declared for a Retribution Paladin and resolve `DOMAIN_NOT_DECLARED`,
 * which is reported as such: the analyzer did not ask the question, rather
 * than asked it and found nothing.
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

export type RetributionDomainResult =
  | {
      readonly domain: "OFFENSIVE_ROTATION";
      readonly resolution: "AUTHORITY_AVAILABLE";
      readonly authorityId: string;
      readonly artifactRevision: string;
      readonly matchMeaning: typeof MATCH_MEANING;
    }
  | {
      readonly domain: "OFFENSIVE_ROTATION";
      readonly resolution: Exclude<AuthorityResolutionOutcome, "AUTHORITY_AVAILABLE">;
    }
  | {
      readonly domain: "RESOURCE_SPENDING" | "ACTIVE_MITIGATION" | "DEFENSIVE_COOLDOWN" | "SELF_HEALING";
      /** The registration's own resolution for the domain. Never "EVALUATED". */
      readonly resolution: AuthorityResolutionOutcome;
      /** What the offensive authority is NOT allowed to say here. */
      readonly offensiveAuthorityGoverns: false;
    }
  | {
      readonly domain: "INTERRUPT";
      readonly resolution: AuthorityResolutionOutcome;
      readonly offensiveAuthorityGoverns: false;
      /** The INTERRUPTS evidence family's capability in this fight, verbatim from completeness. */
      readonly evidenceFamily: EvidenceCapability;
    };

export type RetributionDomainResults = readonly RetributionDomainResult[];

export function retributionDomainResults(
  authority: AuthorityAccess,
  interruptEvidenceFamily: EvidenceCapability,
): RetributionDomainResults {
  return AUTHORITY_DOMAINS.map((domain): RetributionDomainResult =>
    domainResult(authority, domain, interruptEvidenceFamily),
  );
}

function domainResult(
  authority: AuthorityAccess,
  domain: AuthorityDomain,
  interruptEvidenceFamily: EvidenceCapability,
): RetributionDomainResult {
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
    case "RESOURCE_SPENDING":
    case "ACTIVE_MITIGATION":
    case "DEFENSIVE_COOLDOWN":
    case "SELF_HEALING":
      return { domain, resolution: resolved.outcome, offensiveAuthorityGoverns: false };
  }
}
