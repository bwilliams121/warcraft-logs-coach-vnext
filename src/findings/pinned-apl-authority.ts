/**
 * Loading and binding a pinned SimulationCraft APL authority (M11-D2-B1).
 *
 * WHAT IS SHARED. The mechanics every specialization repeats: validate the
 * artifact lazily and once (a malformed artifact is a failed load result,
 * never a throw at import time), a test seam that forces re-validation, the
 * identity fields a binding repeats read straight off the artifact, the
 * OFFENSIVE_ROTATION binding built from them, and standalone authority
 * access over a registration's own declared domains and bindings.
 *
 * WHAT STAYS SPEC-OWNED. Which artifact: the specialization imports its own
 * JSON and hands it in, so the artifact still reaches production code through
 * exactly one owning module, and one specialization's cache is never
 * another's. Its capabilities and declared domains. Whether it binds any
 * domain at all.
 *
 * Proven equal to the specialization implementations on committed evidence by
 * tests/contracts/m11d2b1-shared-plumbing-equivalence.test.ts. No public
 * analyzer imports this module.
 */

import { loadAplAuthority, type AuthorityLoadResult } from "../simc/apl-authority.js";
import {
  resolveAuthorityForDomain,
  type AuthorityAccess,
  type AuthorityDomain,
  type AuthorityDomainBinding,
} from "./authority-domain.js";

/** The fields of a committed artifact the identity is read from. Everything else is validated by the loader. */
export interface PinnedAplArtifact {
  readonly authorityId: string;
  readonly artifactRevision: string;
  readonly provenance: { readonly commitSha: string };
}

export interface PinnedAuthorityIdentity {
  readonly authorityId: string;
  readonly artifactRevision: string;
  readonly commitSha: string;
}

export interface PinnedAplAuthority {
  /** The validated authority, memoised for this artifact only. */
  readonly load: () => AuthorityLoadResult;
  /** Test seam: forces the next `load` to re-validate the artifact. */
  readonly resetCache: () => void;
  readonly identity: PinnedAuthorityIdentity;
}

/** One artifact's lazy, memoised loader and identity. Each call owns its own cache. */
export function pinnedAplAuthority(artifact: PinnedAplArtifact): PinnedAplAuthority {
  let cached: AuthorityLoadResult | null = null;
  return {
    load: () => {
      cached ??= loadAplAuthority(artifact);
      return cached;
    },
    resetCache: () => {
      cached = null;
    },
    identity: Object.freeze({
      authorityId: artifact.authorityId,
      artifactRevision: artifact.artifactRevision,
      commitSha: artifact.provenance.commitSha,
    }),
  };
}

/** The OFFENSIVE_ROTATION binding of one pinned authority. */
export function offensiveAuthorityBinding(pinned: PinnedAplAuthority): AuthorityDomainBinding {
  return Object.freeze({
    kind: "SIMC_APL",
    domain: "OFFENSIVE_ROTATION",
    authorityId: pinned.identity.authorityId,
    artifactRevision: pinned.identity.artifactRevision,
    commitSha: pinned.identity.commitSha,
    load: pinned.load,
  });
}

/** Authority access over ONE registration's own declared domains and bindings, outside the registry. */
export function standaloneAuthorityAccess(
  declaredDomains: readonly AuthorityDomain[],
  bindings: readonly AuthorityDomainBinding[],
): AuthorityAccess {
  return Object.freeze({
    forDomain: (domain: AuthorityDomain) => resolveAuthorityForDomain(declaredDomains, bindings, domain),
  });
}
