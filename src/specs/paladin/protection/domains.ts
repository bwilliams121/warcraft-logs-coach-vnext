/**
 * The six decision domains a Protection Paladin analysis represents, each on
 * its own terms (M10-C).
 *
 * WHY SIX SEPARATE RESULTS
 *
 * A tank faces several families of decision, and one artifact is authority
 * for at most one of them. Reporting the offensive verdicts alone would let a
 * reader assume the rest were fine; reporting them under one "rotation" label
 * would let offensive authority be read as defensive coaching. So the payload
 * carries one result PER DOMAIN, and the result for a domain nothing governs
 * says so in a typed way.
 *
 * TWO KINDS OF "NO", KEPT APART
 *
 *     NO_PINNED_AUTHORITY_FOR_DOMAIN    we have no standard for this question
 *     evidence family UNVERIFIED       we could not even look for the events
 *
 * The interrupt domain carries BOTH facts side by side, because both are true
 * and neither implies the other: a future interrupt authority would still
 * face an unverified evidence family, and a verified family would still have
 * no standard. Neither is ever rendered as "no interrupts were used".
 *
 * Every status here is READ from the registration's authority access, never
 * hard-coded: the same `forDomain` the registry validated answers, so a
 * binding added to a defensive domain would change this payload without any
 * edit here — and would first have to pass `PROVIDER_DOMAIN_COMPATIBILITY`.
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

export type ProtectionDomainResult =
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
      /**
       * What the offensive authority is NOT allowed to say here, stated so a
       * reader of this payload cannot borrow it.
       */
      readonly offensiveAuthorityGoverns: false;
    }
  | {
      readonly domain: "INTERRUPT";
      readonly resolution: AuthorityResolutionOutcome;
      readonly offensiveAuthorityGoverns: false;
      /** The INTERRUPTS evidence family's capability in this fight, verbatim from completeness. */
      readonly evidenceFamily: EvidenceCapability;
    };

export type ProtectionDomainResults = readonly ProtectionDomainResult[];

export function protectionDomainResults(
  authority: AuthorityAccess,
  interruptEvidenceFamily: EvidenceCapability,
): ProtectionDomainResults {
  return AUTHORITY_DOMAINS.map((domain): ProtectionDomainResult =>
    domainResult(authority, domain, interruptEvidenceFamily),
  );
}

function domainResult(
  authority: AuthorityAccess,
  domain: AuthorityDomain,
  interruptEvidenceFamily: EvidenceCapability,
): ProtectionDomainResult {
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
