/**
 * The pinned Protection Paladin SimulationCraft authority, loaded once.
 *
 * OWNED BY THE SPECIALIZATION. Assassination's loader lives in
 * `src/simc/pinned-authority.ts` for historical reasons and the cross-spec
 * sweep confines it to the Rogue tree; this one lives where the registration
 * that binds it lives, so the artifact reaches production code through
 * exactly one module, and that module is Paladin's.
 *
 * The artifact is `src/simc/data/paladin-protection.apl.json`: the
 * `//protection_apl_start .. //protection_apl_end` region of
 * `engine/class_modules/apl/apl_paladin.cpp` at commit
 * 33622e9d1662ff0e451691edf85a6b49cc9d11d9, pinned at M10-B. Loading is lazy
 * and memoised, and a malformed artifact yields a failed load result rather
 * than a throw at import time — the registration's authority access turns
 * that into AUTHORITY_LOAD_FAILED, and the facade into AUTHORITY_NOT_AVAILABLE.
 */

import paladinProtectionArtifact from "../../../simc/data/paladin-protection.apl.json";
import { loadAplAuthority, type AuthorityLoadResult } from "../../../simc/apl-authority.js";

let cached: AuthorityLoadResult | null = null;

/** The pinned Protection Paladin APL authority. */
export function pinnedProtectionPaladinAuthority(): AuthorityLoadResult {
  cached ??= loadAplAuthority(paladinProtectionArtifact);
  return cached;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetProtectionPaladinAuthorityCache(): void {
  cached = null;
}

/** The identity fields a binding repeats, read straight off the committed artifact. */
export const PROTECTION_PALADIN_AUTHORITY_IDENTITY = Object.freeze({
  authorityId: paladinProtectionArtifact.authorityId,
  artifactRevision: paladinProtectionArtifact.artifactRevision,
  commitSha: paladinProtectionArtifact.provenance.commitSha,
});
