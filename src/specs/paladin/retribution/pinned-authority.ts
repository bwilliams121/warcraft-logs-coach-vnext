/**
 * The pinned Retribution Paladin SimulationCraft authority, loaded once.
 *
 * OWNED BY THE SPECIALIZATION, exactly as Protection's is. The artifact is
 * `src/simc/data/paladin-retribution.apl.json`: the
 * `//retribution_apl_start .. //retribution_apl_end` region of
 * `engine/class_modules/apl/apl_paladin.cpp` at commit
 * 33622e9d1662ff0e451691edf85a6b49cc9d11d9 — the SAME file and commit
 * Protection pins, a DIFFERENT region, and a DISTINCT authority id
 * (`SIMC_APL_PALADIN_RETRIBUTION`). Shared provenance, separate ownership:
 * the registry's `DUPLICATE_DECISION_AUTHORITY_BINDING` keys on the id and
 * the domain, and the A2 ownership test pins exactly this pairing as legal.
 *
 * Loading is lazy and memoised, and a malformed artifact yields a failed
 * load result rather than a throw at import time — the registration's
 * authority access turns that into AUTHORITY_LOAD_FAILED, and the facade into
 * AUTHORITY_NOT_AVAILABLE.
 */

import paladinRetributionArtifact from "../../../simc/data/paladin-retribution.apl.json";
import { loadAplAuthority, type AuthorityLoadResult } from "../../../simc/apl-authority.js";

let cached: AuthorityLoadResult | null = null;

/** The pinned Retribution Paladin APL authority. */
export function pinnedRetributionPaladinAuthority(): AuthorityLoadResult {
  cached ??= loadAplAuthority(paladinRetributionArtifact);
  return cached;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetRetributionPaladinAuthorityCache(): void {
  cached = null;
}

/** The identity fields a binding repeats, read straight off the committed artifact. */
export const RETRIBUTION_PALADIN_AUTHORITY_IDENTITY = Object.freeze({
  authorityId: paladinRetributionArtifact.authorityId,
  artifactRevision: paladinRetributionArtifact.artifactRevision,
  commitSha: paladinRetributionArtifact.provenance.commitSha,
});
