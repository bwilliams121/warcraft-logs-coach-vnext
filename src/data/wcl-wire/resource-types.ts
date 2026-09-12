/**
 * Version-scoped Warcraft Logs WIRE contracts for `classResources[].type`.
 *
 * This answers one question: what does the number in `classResources[].type`
 * MEAN, for a given parser version? It is the same species of contract as M4's
 * `PRE_COST` sampling contract and the aura `stack` contract — a statement about
 * what Warcraft Logs' wire format denotes, established for an explicit
 * `gameVersion` / `logVersion` pair and not generalised beyond it.
 *
 * WHY THE EVIDENCE IS JOINT, AND WHY THAT IS NOT PEDANTRY
 *
 * Two different claims are involved, and neither implies the other:
 *
 *     the GAME says     Enum.PowerType.ComboPoints == 4
 *     the WIRE says     classResources[].type == 4 carries combo points
 *
 * The game enum is authoritative for the game. It is NOT authoritative for what
 * a third-party log parser chose to put on the wire — Warcraft Logs types the
 * event payload as opaque `JSON`, documents no mapping through its typed schema,
 * and is free to renumber, remap or diverge at any parser version.
 *
 * So `ResourceWireContract` requires BOTH members. The enum supplies the
 * meaning; a sanitized capture supplies evidence that the observed wire
 * behaviour is compatible with that meaning. Declaring one without the other is
 * a compile error, which is the point: it makes "the enum says 4, therefore the
 * wire means 4" unrepresentable.
 *
 * WHAT THE CORROBORATION ACTUALLY SHOWED
 *
 * Across one complete 20-player raid fight, type 4 occurred on exactly three
 * actors — two Rogues (`max` 7) and a Feral Druid (`max` 5) — and on no other
 * class, with class-appropriate maxima. Every type-4 entry in the capture was
 * costed. That is consistent with combo points and is hard to explain otherwise.
 * It is corroboration, not proof, and it is recorded as such.
 *
 * Outside the declared scope, `resourceWireTypeFor` fails closed. It does not
 * fall back, does not widen, and does not guess.
 */

import {
  checkWireCompatibility,
  type CompatibilityOutcome,
  type FightCompatibilityKeys,
  type WireVersionScope,
} from "../provenance.js";

/** Resource identities this project models. Deliberately not a full database. */
export type ResourceId = "COMBO_POINTS";

export const RESOURCE_IDS = ["COMBO_POINTS"] as const satisfies readonly ResourceId[];

/** Evidence from a versioned game-data enumeration. Necessary, never sufficient. */
export interface GameEnumEvidence {
  readonly enumName: string;
  readonly memberName: string;
  readonly value: number;
  readonly expansion: string;
  readonly gameBuild: string;
  readonly source: string;
  readonly verifiedOn: string;
}

/** Evidence that the OBSERVED wire behaviour is compatible with that meaning. */
export interface WireCorroborationEvidence {
  readonly fixtureId: string;
  readonly reportCode: string;
  readonly reportRevision: number;
  readonly capturedOn: string;
  /** What the capture actually showed. Factual, no gameplay verdict. */
  readonly observation: string;
}

/**
 * One wire contract.
 *
 * Both evidence members are required and non-optional. See the module comment.
 */
export interface ResourceWireContract {
  readonly wireType: number;
  readonly resourceId: ResourceId;
  readonly scope: WireVersionScope;
  readonly evidence: {
    readonly gameEnum: GameEnumEvidence;
    readonly wireCorroboration: WireCorroborationEvidence;
  };
}

export const RESOURCE_WIRE_CONTRACTS: readonly ResourceWireContract[] = [
  {
    wireType: 4,
    resourceId: "COMBO_POINTS",
    scope: { gameVersion: 1, logVersion: 17 },
    evidence: {
      gameEnum: {
        enumName: "Enum.PowerType",
        memberName: "ComboPoints",
        value: 4,
        expansion: "Midnight",
        gameBuild: "12.0",
        source: "World of Warcraft client power-type enumeration",
        verifiedOn: "2026-09-12",
      },
      wireCorroboration: {
        fixtureId: "wcl-assassination-envenom-combo-points",
        reportCode: "A7R6kxPJ1hC8YQ4w",
        reportRevision: 30,
        capturedOn: "2026-09-12",
        observation:
          "Across one complete 20-player fight (249,516 events, COMPLETE coverage), wire type 4 " +
          "occurred on exactly three actors — two Rogues (max 7) and a Feral Druid (max 5) — and " +
          "on no other class. Every type-4 entry carried a positive cost. No other wire type " +
          "appeared on those actors with those maxima.",
      },
    },
  },
];

export type ResourceWireResolution =
  | { readonly ok: true; readonly wireType: number; readonly contract: ResourceWireContract }
  | { readonly ok: false; readonly reason: "NO_CONTRACT_FOR_RESOURCE" }
  | { readonly ok: false; readonly reason: "INCOMPATIBLE_VERSION"; readonly outcome: CompatibilityOutcome };

/**
 * The wire type carrying a resource, for this fight's parser version.
 *
 * The ONLY sanctioned way to obtain the number 4. Nothing else in the codebase
 * may hard-code it, and a contract test enforces that — a bare `4` in an
 * evaluator would be exactly the undocumented magic constant this module exists
 * to eliminate.
 */
export function resourceWireTypeFor(
  resourceId: ResourceId,
  keys: FightCompatibilityKeys,
): ResourceWireResolution {
  const contract = RESOURCE_WIRE_CONTRACTS.find((entry) => entry.resourceId === resourceId);
  if (contract === undefined) {
    return { ok: false, reason: "NO_CONTRACT_FOR_RESOURCE" };
  }
  const outcome = checkWireCompatibility(keys, contract.scope);
  if (!outcome.compatible) {
    return { ok: false, reason: "INCOMPATIBLE_VERSION", outcome };
  }
  return { ok: true, wireType: contract.wireType, contract };
}
