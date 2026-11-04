/**
 * The pinned Havoc Demon Hunter SimulationCraft authority, loaded once.
 *
 * OWNED BY THE SPECIALIZATION, exactly as the others are. The artifact is
 * `src/simc/data/demonhunter-havoc.apl.json`: the `//havoc_apl_start .. _end`
 * region of `engine/class_modules/apl/apl_demon_hunter.cpp` at commit
 * 33622e9d1662ff0e451691edf85a6b49cc9d11d9, the SAME commit every other dataset
 * pins, under a DISTINCT authority id (`SIMC_APL_DEMONHUNTER_HAVOC`). Its live
 * and PTR policy, dispatch and region hash were verified at extraction
 * (`PTR_MARKERS_EMPTY`; scripts/authority/README.md, M11-D2-C).
 *
 * Loading is lazy and memoised, and a malformed artifact yields a failed load
 * result rather than a throw at import time.
 */

import havocArtifact from "../../../simc/data/demonhunter-havoc.apl.json";
import { loadAplAuthority, type AuthorityLoadResult } from "../../../simc/apl-authority.js";

let cached: AuthorityLoadResult | null = null;

/** The pinned Havoc Demon Hunter APL authority. */
export function pinnedHavocDemonHunterAuthority(): AuthorityLoadResult {
  cached ??= loadAplAuthority(havocArtifact);
  return cached;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetHavocDemonHunterAuthorityCache(): void {
  cached = null;
}

/** The identity fields a binding repeats, read straight off the committed artifact. */
export const HAVOC_DEMON_HUNTER_AUTHORITY_IDENTITY = Object.freeze({
  authorityId: havocArtifact.authorityId,
  artifactRevision: havocArtifact.artifactRevision,
  commitSha: havocArtifact.provenance.commitSha,
});
