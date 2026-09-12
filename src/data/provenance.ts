/**
 * Provenance vocabulary for versioned static data.
 *
 * Two things live here and they are deliberately different:
 *
 * 1. PROVENANCE — where a fact came from, and when. Always recorded.
 * 2. APPLICABILITY — whether a fact may be applied to THIS fight. Gated only on
 *    compatibility keys the analyzed fight actually carries.
 *
 * The distinction matters because it is tempting to gate data on the game build
 * it was generated from. `CombatFight` carries no game build. Inventing a
 * comparison against a field that does not exist would produce a gate that
 * always passes while looking rigorous — worse than no gate. So a dataset
 * records its build for traceability, and is gated only on `gameVersion` and
 * `logVersion`, which are the two compatibility keys Warcraft Logs actually
 * supplies.
 *
 * Nothing here is a gameplay authority. Static data says what a number MEANS.
 * It never says what a player should have done.
 */

/**
 * The compatibility keys available from an analyzed fight.
 *
 * Exactly the two fields `IngestionProvenance` carries. `gameVersion` is
 * nullable upstream, and a null is NOT treated as a match for anything.
 */
export interface FightCompatibilityKeys {
  readonly gameVersion: number | null;
  readonly logVersion: number;
}

/** The version window a wire contract was established against. */
export interface WireVersionScope {
  readonly gameVersion: number;
  readonly logVersion: number;
}

export type CompatibilityOutcome =
  | { readonly compatible: true; readonly scope: WireVersionScope }
  | {
      readonly compatible: false;
      readonly reason: "GAME_VERSION_ABSENT" | "GAME_VERSION_MISMATCH" | "LOG_VERSION_MISMATCH";
      readonly observed: FightCompatibilityKeys;
      readonly required: WireVersionScope;
    };

/**
 * Decides whether a version-scoped contract may be applied to a fight.
 *
 * Fails closed in every direction. An absent `gameVersion` is not a wildcard:
 * "we do not know which game this log came from" cannot license applying a
 * contract established for a specific one.
 */
export function checkWireCompatibility(
  keys: FightCompatibilityKeys,
  required: WireVersionScope,
): CompatibilityOutcome {
  if (keys.gameVersion === null) {
    return { compatible: false, reason: "GAME_VERSION_ABSENT", observed: keys, required };
  }
  if (keys.gameVersion !== required.gameVersion) {
    return { compatible: false, reason: "GAME_VERSION_MISMATCH", observed: keys, required };
  }
  if (keys.logVersion !== required.logVersion) {
    return { compatible: false, reason: "LOG_VERSION_MISMATCH", observed: keys, required };
  }
  return { compatible: true, scope: required };
}

/**
 * Where a static game fact was read from.
 *
 * Recorded for traceability. Deliberately NOT usable as a gate: see the module
 * comment. A dataset whose `gameBuild` no longer matches the live game is a
 * reason for a human to regenerate it, not something the runtime can detect
 * from a Warcraft Logs fight.
 */
export interface GameDataProvenance {
  readonly datasetId: string;
  readonly expansion: string;
  readonly gameBuild: string;
  readonly source: string;
  readonly retrievedOn: string;
  /**
   * Why this dataset carries no fight-derived applicability gate.
   *
   * Present so the absence of a gate is a stated decision rather than an
   * oversight a reader has to infer.
   */
  readonly applicabilityNote: string;
}
