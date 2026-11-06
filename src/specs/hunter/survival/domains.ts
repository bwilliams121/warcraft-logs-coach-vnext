/**
 * The decision domains a Survival Hunter analysis represents, each on its own terms (ONB-T2).
 *
 * ONE RESULT PER DOMAIN, so the offensive verdicts can never be read as coaching for anything
 * else. Every status here is READ from the registration's authority access, never hard-coded.
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

export type SurvivalDomainResult =
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
      readonly domain: "ACTIVE_MITIGATION" | "DEFENSIVE_COOLDOWN" | "SELF_HEALING" | "RESOURCE_SPENDING";
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

export type SurvivalDomainResults = readonly SurvivalDomainResult[];

export function survivalDomainResults(
  authority: AuthorityAccess,
  interruptEvidenceFamily: EvidenceCapability,
): SurvivalDomainResults {
  return AUTHORITY_DOMAINS.map((domain): SurvivalDomainResult =>
    domainResult(authority, domain, interruptEvidenceFamily),
  );
}

function domainResult(
  authority: AuthorityAccess,
  domain: AuthorityDomain,
  interruptEvidenceFamily: EvidenceCapability,
): SurvivalDomainResult {
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
    case "ACTIVE_MITIGATION":
    case "DEFENSIVE_COOLDOWN":
    case "SELF_HEALING":
    case "RESOURCE_SPENDING":
      return { domain, resolution: resolved.outcome, offensiveAuthorityGoverns: false };
  }
}
