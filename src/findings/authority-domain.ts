/**
 * Authority domains — which KIND of decision an authority is entitled to
 * govern, and how a specialization binds a pinned authority to one.
 *
 * WHY DOMAINS EXIST
 *
 * `authority.ts` says who may decide correct play: today, a pinned
 * SimulationCraft APL. It does not say WHICH decisions. A damage-oriented APL
 * is authoritative for what a rotation should press next; it establishes
 * nothing about whether a tank should have pressed a defensive, spent a
 * resource on healing, or interrupted a cast. Treating one artifact as
 * authority for every question a specialization faces is how offensive
 * authority gets laundered into defensive coaching.
 *
 * So authority is bound PER DOMAIN, and a domain names one family of decision.
 * The vocabulary is deliberately wider than what any registration binds today:
 * the tank domains are declared so a future binding is an explicit act against
 * an existing name, not a new bucket invented to fit an artifact. Nothing here
 * evaluates any of them.
 *
 * THIS IS INTERNAL VOCABULARY, NOT THE PUBLIC FINDING CATEGORY
 *
 * `DecisionCategory` in `authority.ts` is what a finding publishes and stays
 * `ROTATION`. Widening it to advertise categories nothing produces would put
 * unused words on the wire; a domain is the internal, registration-side idea.
 *
 * COMPATIBILITY IS DECLARED, NOT INFERRED
 *
 * `PROVIDER_DOMAIN_COMPATIBILITY` is the whole rule for which provider may bind
 * which domain. A SimulationCraft APL binds `OFFENSIVE_ROTATION` and nothing
 * else. This is not derived from the artifact's shape — not from region
 * markers, not from list names — because an artifact's structure says where it
 * was cut from, not what it may govern. Widening this table is an
 * architectural act that needs an artifact proven to model the new domain.
 *
 * ABSENCE IS A RESOLUTION OUTCOME, NEVER A BINDING
 *
 * There is no `kind: "NONE"` binding. A binding is authority that exists;
 * missing authority is what `resolveAuthorityForDomain` REPORTS, in four
 * distinct shapes:
 *
 *     DOMAIN_NOT_DECLARED               no capability of this registration
 *                                       asks about the domain at all
 *     NO_PINNED_AUTHORITY_FOR_DOMAIN    a capability asks, nothing is bound
 *     AUTHORITY_LOAD_FAILED             something is bound and its artifact
 *                                       did not validate
 *     AUTHORITY_AVAILABLE               the bound artifact loaded
 *
 * None of these is an evidence UNKNOWN. UNKNOWN means a standard exists and the
 * fight did not supply enough to apply it; these say whether a standard exists
 * for the question at all. `CLAUDE.md` keeps the two apart and so does this
 * type: a no-authority outcome carries no blocker and no evidence.
 */

import type { AplAuthority, AuthorityLoadResult } from "../simc/apl-authority.js";
import type { DecisionAuthorityKind } from "./authority.js";

export type AuthorityDomain =
  /** What the rotation should press next. The only domain bound today. */
  | "OFFENSIVE_ROTATION"
  /** Whether and when a builder/spender resource should be spent. */
  | "RESOURCE_SPENDING"
  /** Active-mitigation use — the tank's on-GCD/off-GCD defensive buffs. */
  | "ACTIVE_MITIGATION"
  /** Major defensive cooldown use. */
  | "DEFENSIVE_COOLDOWN"
  /** Self-healing decisions. */
  | "SELF_HEALING"
  /** Interrupt decisions. */
  | "INTERRUPT";

export const AUTHORITY_DOMAINS = Object.freeze([
  "OFFENSIVE_ROTATION",
  "RESOURCE_SPENDING",
  "ACTIVE_MITIGATION",
  "DEFENSIVE_COOLDOWN",
  "SELF_HEALING",
  "INTERRUPT",
] as const satisfies readonly AuthorityDomain[]);

/**
 * Decision families NO provider kind may govern in this build (M13-E).
 *
 * The support categories of CLAUDE.md "Decision Categories". A capability may
 * declare one, so a registration can say truthfully "I am asked this, and I
 * hold no standard for it", but nothing can bind one: a binding's `domain` is
 * an `AuthorityDomain`, and `PROVIDER_DOMAIN_COMPATIBILITY` names none of
 * these. So a declared provider-less domain always resolves
 * `NO_PINNED_AUTHORITY_FOR_DOMAIN`. Making one bindable is the same
 * architectural act as widening the compatibility table: it needs an approved,
 * machine-usable model of that decision.
 *
 * Kept apart from `AUTHORITY_DOMAINS` on purpose. That list is what a
 * specialization's per-domain results enumerate ("every question this
 * analyzer is asked about its own play"); support targeting and timing are
 * questions about the play of a supporter, and are not added to every other
 * specialization's results.
 */
export type ProviderlessDomain =
  /** Who received a support buff. No approved recipient-quality model exists. */
  | "SUPPORT_TARGETING"
  /** When a support ability was used. No approved support-timing standard exists. */
  | "SUPPORT_TIMING";

export const PROVIDERLESS_DOMAINS = Object.freeze([
  "SUPPORT_TARGETING",
  "SUPPORT_TIMING",
] as const satisfies readonly ProviderlessDomain[]);

/** Every family a capability may declare: the bindable ones and the provider-less ones. */
export type DecisionDomain = AuthorityDomain | ProviderlessDomain;

export const DECISION_DOMAINS = Object.freeze([
  ...AUTHORITY_DOMAINS,
  ...PROVIDERLESS_DOMAINS,
] as const satisfies readonly DecisionDomain[]);

/**
 * Which provider kinds may govern which domains.
 *
 * Complete over `DecisionAuthorityKind`, so adding a provider kind without
 * declaring its domains is a type error.
 */
export const PROVIDER_DOMAIN_COMPATIBILITY: Readonly<
  Record<DecisionAuthorityKind, readonly AuthorityDomain[]>
> = Object.freeze({
  SIMC_APL: Object.freeze(["OFFENSIVE_ROTATION"] as const),
});

export function providerMayGovern(kind: DecisionAuthorityKind, domain: AuthorityDomain): boolean {
  return PROVIDER_DOMAIN_COMPATIBILITY[kind].includes(domain);
}

/**
 * One pinned authority, bound by a specialization to one domain.
 *
 * Discriminated on `kind`, so a provider that loads a different authority shape
 * gets its own member rather than a widened `load`. The identity fields are
 * REPEATED from the artifact on purpose: registry validation compares them with
 * what `load()` actually yields, which is how a registration that names one
 * revision while shipping another fails closed.
 */
export type AuthorityDomainBinding = {
  readonly kind: "SIMC_APL";
  readonly domain: AuthorityDomain;
  readonly authorityId: string;
  readonly artifactRevision: string;
  readonly commitSha: string;
  /** The pinned, memoised loader. Never a network call. */
  readonly load: () => AuthorityLoadResult;
};

export type AuthorityResolution =
  | {
      readonly outcome: "AUTHORITY_AVAILABLE";
      readonly domain: DecisionDomain;
      readonly kind: "SIMC_APL";
      readonly binding: AuthorityDomainBinding;
      readonly authority: AplAuthority;
    }
  | { readonly outcome: "DOMAIN_NOT_DECLARED"; readonly domain: DecisionDomain }
  | { readonly outcome: "NO_PINNED_AUTHORITY_FOR_DOMAIN"; readonly domain: DecisionDomain }
  | {
      readonly outcome: "AUTHORITY_LOAD_FAILED";
      readonly domain: DecisionDomain;
      readonly binding: AuthorityDomainBinding;
      readonly reason: string;
      readonly detail: string;
    };

export type AuthorityResolutionOutcome = AuthorityResolution["outcome"];

export const AUTHORITY_RESOLUTION_OUTCOMES = [
  "AUTHORITY_AVAILABLE",
  "DOMAIN_NOT_DECLARED",
  "NO_PINNED_AUTHORITY_FOR_DOMAIN",
  "AUTHORITY_LOAD_FAILED",
] as const satisfies readonly AuthorityResolutionOutcome[];

/**
 * Resolves the authority ONE registration holds for ONE domain.
 *
 * Takes the registration's own declared domains and bindings and nothing
 * else, so there is no path by which a caller obtains another specialization's
 * binding: the function never sees one.
 *
 * A provider-less domain (M13-E) is never bound, so once declared it resolves
 * NO_PINNED_AUTHORITY_FOR_DOMAIN by the same rule as an unbound tank domain;
 * the explicit check below holds even for a forged binding naming one.
 */
export function resolveAuthorityForDomain(
  declaredDomains: readonly DecisionDomain[],
  bindings: readonly AuthorityDomainBinding[],
  domain: DecisionDomain,
): AuthorityResolution {
  if (!declaredDomains.includes(domain)) {
    return { outcome: "DOMAIN_NOT_DECLARED", domain };
  }
  if (!isAuthorityDomain(domain)) {
    return { outcome: "NO_PINNED_AUTHORITY_FOR_DOMAIN", domain };
  }
  const binding = bindings.find((candidate) => candidate.domain === domain);
  if (binding === undefined) {
    return { outcome: "NO_PINNED_AUTHORITY_FOR_DOMAIN", domain };
  }
  const loaded = binding.load();
  if (!loaded.ok) {
    return {
      outcome: "AUTHORITY_LOAD_FAILED",
      domain,
      binding,
      reason: loaded.reason,
      detail: loaded.detail,
    };
  }
  return { outcome: "AUTHORITY_AVAILABLE", domain, kind: binding.kind, binding, authority: loaded.authority };
}

/**
 * The authority a registered analyzer may ask for: its own bindings, by
 * domain. Built by the registration and handed to the analyzer at call time.
 */
export interface AuthorityAccess {
  forDomain(domain: DecisionDomain): AuthorityResolution;
}

/** Whether a declared family is one a provider kind could ever bind. */
export function isAuthorityDomain(domain: DecisionDomain): domain is AuthorityDomain {
  return (AUTHORITY_DOMAINS as readonly string[]).includes(domain);
}
