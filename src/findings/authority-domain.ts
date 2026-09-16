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
      readonly domain: AuthorityDomain;
      readonly kind: "SIMC_APL";
      readonly binding: AuthorityDomainBinding;
      readonly authority: AplAuthority;
    }
  | { readonly outcome: "DOMAIN_NOT_DECLARED"; readonly domain: AuthorityDomain }
  | { readonly outcome: "NO_PINNED_AUTHORITY_FOR_DOMAIN"; readonly domain: AuthorityDomain }
  | {
      readonly outcome: "AUTHORITY_LOAD_FAILED";
      readonly domain: AuthorityDomain;
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
 */
export function resolveAuthorityForDomain(
  declaredDomains: readonly AuthorityDomain[],
  bindings: readonly AuthorityDomainBinding[],
  domain: AuthorityDomain,
): AuthorityResolution {
  if (!declaredDomains.includes(domain)) {
    return { outcome: "DOMAIN_NOT_DECLARED", domain };
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
  forDomain(domain: AuthorityDomain): AuthorityResolution;
}
