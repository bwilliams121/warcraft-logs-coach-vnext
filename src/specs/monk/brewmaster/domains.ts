/**
 * The decision domains a Brewmaster Monk analysis represents, each on its own
 * terms (M11-C2).
 *
 * ONE RESULT PER DOMAIN, so the offensive verdicts can never be read as
 * coaching for anything else. All six domains are DECLARED
 * (`authority-bindings.ts`): the offensive rotation the pinned authority
 * governs, and five — resource spending, active mitigation, defensive
 * cooldowns, self healing, interrupts — declared and bound to nothing, so
 * their result is the typed `NO_PINNED_AUTHORITY_FOR_DOMAIN`. None resolves
 * `DOMAIN_NOT_DECLARED`: a tank asks every one of these questions, and the
 * analyzer says so even where it has no standard.
 *
 * THE BREWS, STATED ONCE. The pinned offensive list names four brews —
 * `purifying_brew`, `celestial_brew`, `black_ox_brew`, `fortifying_brew` —
 * and `expel_harm`, all of which are ALSO the specialization's mitigation,
 * defensive and self-healing buttons. SimulationCraft orders them for damage
 * and survival inside one list, but it does not model incoming damage, Stagger
 * pressure or health deficits for this decision, so a brew the offensive list
 * would not have pressed here is NOT thereby a mistake: it is a question of
 * the defensive domains, for which this analyzer has NO authority. None of
 * those tokens is judged by the M11-C2 slice (the NON_GCD brews are excluded
 * NON_GCD_ACTION; Celestial Brew and Expel Harm OUTSIDE_FIRST_SLICE), and the
 * defensive domains carry `sharesActionsWithOffensive` naming them, so a
 * reader of any one result sees the overlap. Nothing here rewrites the
 * offensive comparison; nothing here invents a defensive verdict.
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

/** The offensive-list tokens that are also buttons of each defensive domain. */
export const SHARED_DEFENSIVE_TOKENS = Object.freeze({
  ACTIVE_MITIGATION: Object.freeze(["purifying_brew", "celestial_brew", "black_ox_brew"] as const),
  DEFENSIVE_COOLDOWN: Object.freeze(["fortifying_brew"] as const),
  SELF_HEALING: Object.freeze(["expel_harm"] as const),
});

export type BrewmasterDomainResult =
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
      readonly domain: "ACTIVE_MITIGATION" | "DEFENSIVE_COOLDOWN" | "SELF_HEALING";
      /** The registration's own resolution for the domain. Never "EVALUATED". */
      readonly resolution: AuthorityResolutionOutcome;
      /** What the offensive authority is NOT allowed to say here. */
      readonly offensiveAuthorityGoverns: false;
      /** The buttons the offensive list also names, under a different meaning. */
      readonly sharesActionsWithOffensive: readonly string[];
    }
  | {
      readonly domain: "RESOURCE_SPENDING";
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

export type BrewmasterDomainResults = readonly BrewmasterDomainResult[];

export function brewmasterDomainResults(
  authority: AuthorityAccess,
  interruptEvidenceFamily: EvidenceCapability,
): BrewmasterDomainResults {
  return AUTHORITY_DOMAINS.map((domain): BrewmasterDomainResult =>
    domainResult(authority, domain, interruptEvidenceFamily),
  );
}

function domainResult(
  authority: AuthorityAccess,
  domain: AuthorityDomain,
  interruptEvidenceFamily: EvidenceCapability,
): BrewmasterDomainResult {
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
      return {
        domain,
        resolution: resolved.outcome,
        offensiveAuthorityGoverns: false,
        sharesActionsWithOffensive: SHARED_DEFENSIVE_TOKENS[domain],
      };
    case "RESOURCE_SPENDING":
      return { domain, resolution: resolved.outcome, offensiveAuthorityGoverns: false };
  }
}
