/**
 * The pinned Blood Death Knight SimulationCraft authority, loaded once.
 *
 * OWNED BY THE SPECIALIZATION, exactly as the Paladin ones are. The artifact
 * is `src/simc/data/deathknight-blood.apl.json`: the
 * `//blood_apl_start .. //blood_apl_end` region of
 * `engine/class_modules/apl/apl_death_knight.cpp` at commit
 * 33622e9d1662ff0e451691edf85a6b49cc9d11d9 — the SAME commit every other
 * dataset pins, a DIFFERENT file, and a DISTINCT authority id
 * (`SIMC_APL_DEATHKNIGHT_BLOOD`).
 *
 * ONE THING THIS ARTIFACT HAS THAT THE OTHERS DO NOT: conditional
 * compilation. The pinned region carries twelve `p->sim->dbc->wowv()`
 * client-version guards — five `< 12.1.0` branches whose nine pre-12.1
 * statements the extractor dropped for the declared client version 12.1.0,
 * and seven `>= 12.1.0` branches whose eight statements it kept — and every
 * guard is recorded under `provenance.conditionalCompilation` so a reader
 * can see which lines the live list does NOT contain (the Coagulopathy
 * Death Strike line among them). `authority-artifact.ts` validates that
 * record; a malformed one is a failed load, never a silently different
 * list.
 *
 * Loading is lazy and memoised, and a malformed artifact yields a failed
 * load result rather than a throw at import time — the registration's
 * authority access turns that into AUTHORITY_LOAD_FAILED, and the facade into
 * AUTHORITY_NOT_AVAILABLE.
 */

import deathknightBloodArtifact from "../../../simc/data/deathknight-blood.apl.json";
import { loadAplAuthority, type AuthorityLoadResult } from "../../../simc/apl-authority.js";

let cached: AuthorityLoadResult | null = null;

/** The pinned Blood Death Knight APL authority. */
export function pinnedBloodDeathKnightAuthority(): AuthorityLoadResult {
  cached ??= loadAplAuthority(deathknightBloodArtifact);
  return cached;
}

/** Test seam: forces the next call to re-validate the artifact. */
export function resetBloodDeathKnightAuthorityCache(): void {
  cached = null;
}

/** The identity fields a binding repeats, read straight off the committed artifact. */
export const BLOOD_DEATH_KNIGHT_AUTHORITY_IDENTITY = Object.freeze({
  authorityId: deathknightBloodArtifact.authorityId,
  artifactRevision: deathknightBloodArtifact.artifactRevision,
  commitSha: deathknightBloodArtifact.provenance.commitSha,
});
