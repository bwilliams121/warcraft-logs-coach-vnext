/**
 * Execution-profile REVISION (M11-G3-3): the hash of a profile's identity and
 * every effective setting. Results record it, so a profile name can never
 * stand for two different definitions. Descriptive text (notes, assumption
 * prose) is not part of it; any effective setting is.
 */

import { canonicalJson, sha256Hex } from "./canonical.js";
import type { ExecutionProfile } from "./execution-profiles.js";

export function executionProfileRevisionView(profile: ExecutionProfile): unknown {
  return {
    kind: "execution-profile-revision/1",
    id: profile.id,
    version: profile.version,
    sim: profile.sim,
    player: profile.player,
  };
}

export async function executionProfileRevision(profile: ExecutionProfile): Promise<string> {
  return await sha256Hex(canonicalJson(executionProfileRevisionView(profile)));
}
