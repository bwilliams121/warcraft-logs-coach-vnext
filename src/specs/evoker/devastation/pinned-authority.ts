/**
 * The pinned Devastation Evoker SimulationCraft authority, loaded once.
 *
 * OWNED BY THE SPECIALIZATION, exactly as the others are. The artifact is
 * `src/simc/data/evoker-devastation.apl.json`: the `//devastation_apl_start .. _end` region of `engine/class_modules/apl/mage.cpp`, at commit 33622e9d1662ff0e451691edf85a6b49cc9d11d9, the SAME
 * commit every other dataset pins, under a DISTINCT authority id (`SIMC_APL_EVOKER_DEVASTATION`).
 * Its live and PTR policy, dispatch and region hash were verified at extraction
 * (scripts/authority/README.md, M11-D2-C).
 *
 * Loading is lazy and memoised, and a malformed artifact yields a failed load result
 * rather than a throw at import time.
 */

import artifact from "../../../simc/data/evoker-devastation.apl.json";
import { loadAplAuthority, type AuthorityLoadResult } from "../../../simc/apl-authority.js";

let cached: AuthorityLoadResult | null = null;

/** The pinned Devastation Evoker APL authority. */
export function pinnedDevastationEvokerAuthority(): AuthorityLoadResult {
  cached ??= loadAplAuthority(artifact);
  return cached;
}

/** The identity fields a binding repeats, read straight off the committed artifact. */
export const DEVASTATION_EVOKER_AUTHORITY_IDENTITY = Object.freeze({
  authorityId: artifact.authorityId,
  artifactRevision: artifact.artifactRevision,
  commitSha: artifact.provenance.commitSha,
});
