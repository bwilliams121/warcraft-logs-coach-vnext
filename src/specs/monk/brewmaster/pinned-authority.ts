/**
 * The pinned Brewmaster Monk SimulationCraft authority, loaded once.
 *
 * OWNED BY THE SPECIALIZATION, exactly as the others are. The artifact is
 * `src/simc/data/monk-brewmaster.apl.json`: the `default_apl` function of
 * `namespace brewmaster` in `engine/class_modules/apl/apl_monk.cpp` at commit
 * 33622e9d1662ff0e451691edf85a6b49cc9d11d9 — the SAME commit every other
 * dataset pins, a DIFFERENT file, and a DISTINCT authority id
 * (`SIMC_APL_MONK_BREWMASTER`).
 *
 * ONE THING THIS ARTIFACT HAS THAT THE OTHERS DO NOT: its region is selected
 * by SOURCE COORDINATES, not by marker comments. The pinned Monk APL file
 * carries no `//brewmaster_apl_start` marker, so the extractor selects the
 * function by its enclosing namespace, exact header and player identifier and
 * records that under `provenance.regionSelector` (M11-C1a); the artifact
 * carries no marker field at all. `authority-artifact.ts` validates exactly
 * one of the two forms.
 *
 * Loading is lazy and memoised, and a malformed artifact yields a failed
 * load result rather than a throw at import time — the registration's
 * authority access turns that into AUTHORITY_LOAD_FAILED, and the facade into
 * AUTHORITY_NOT_AVAILABLE.
 */

import monkBrewmasterArtifact from "../../../simc/data/monk-brewmaster.apl.json";
import { loadAplAuthority, type AuthorityLoadResult } from "../../../simc/apl-authority.js";

let cached: AuthorityLoadResult | null = null;

/** The pinned Brewmaster Monk APL authority. */
export function pinnedBrewmasterMonkAuthority(): AuthorityLoadResult {
  cached ??= loadAplAuthority(monkBrewmasterArtifact);
  return cached;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetBrewmasterMonkAuthorityCache(): void {
  cached = null;
}

/** The identity fields a binding repeats, read straight off the committed artifact. */
export const BREWMASTER_MONK_AUTHORITY_IDENTITY = Object.freeze({
  authorityId: monkBrewmasterArtifact.authorityId,
  artifactRevision: monkBrewmasterArtifact.artifactRevision,
  commitSha: monkBrewmasterArtifact.provenance.commitSha,
});
