/**
 * The pinned SimulationCraft authority, loaded once.
 *
 * The artifact is a committed JSON file generated from ONE exact commit. There
 * is no network access here and no dependency on the moving `midnight` branch:
 * the commit SHA and the source file's SHA-256 travel inside the artifact, so a
 * verdict can always be traced to the precise text it rested on.
 *
 * Loading is lazy and memoised. A malformed artifact does not throw at import
 * time — it yields a failed load result the caller must handle, so an
 * unusable authority becomes an explicit NOT_EVALUATED run rather than a crash
 * during module initialisation.
 */

import rogueAssassinationArtifact from "./data/rogue-assassination.apl.json";
import { loadAplAuthority, type AuthorityLoadResult } from "./apl-authority.js";

let cached: AuthorityLoadResult | null = null;

/** The pinned Assassination Rogue APL authority. */
export function pinnedAssassinationAuthority(): AuthorityLoadResult {
  cached ??= loadAplAuthority(rogueAssassinationArtifact);
  return cached;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetPinnedAuthorityCache(): void {
  cached = null;
}
