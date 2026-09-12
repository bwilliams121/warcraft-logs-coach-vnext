/**
 * The Assassination Rogue evaluator.
 *
 * EXPLICITLY INVOKED. There is no production spec dispatch yet: the caller names
 * the actor and asserts the specialization. `CombatFight` carries no spec field,
 * and M5-A does not add one — inventing automatic dispatch here would be scope
 * this milestone has not earned.
 *
 * RUN ORDER, AND WHY PREREQUISITES COME FIRST
 *
 *     ability identity      -> without it we cannot even FIND the casts
 *     resource wire contract -> without it we cannot read ANY cast's state
 *     authority artifact     -> without it we cannot judge anything
 *
 * Each of those failing means the decision surface itself is unidentifiable, so
 * the run is `NOT_EVALUATED` with a reason. That is different from a cast whose
 * state is missing: there the decision point IS identified, so it belongs inside
 * an `EVALUATED` run as an UNKNOWN judgment — counted and disclosed, not
 * silently dropped.
 *
 * The distinction exists because zero findings is ambiguous. "We evaluated and
 * found nothing to reject" and "we could not evaluate" must never look alike.
 */

import type { CombatState } from "../../../engine/state/combat-state.js";
import type { CastEvent } from "../../../engine/normalization/normalized-events.js";
import type { CoverageState } from "../../../engine/evidence/coverage.js";
import type { EvidenceCategory } from "../../../wcl/evidence-capability.js";
import { abilityIdentityFor } from "../../../data/game/rogue-abilities.js";
import { resourceWireTypeFor } from "../../../data/wcl-wire/resource-types.js";
import { pinnedAssassinationAuthority } from "../../../simc/pinned-authority.js";
import type { AplAuthority, ReachabilityProof } from "../../../simc/apl-authority.js";
import { createFinding, type Finding } from "../../../findings/finding.js";
import type { ObservedActionDecisionPoint } from "../../../findings/judgment.js";
import { JUDGMENT_BLOCKERS, type JudgmentBlocker } from "../../../findings/judgment.js";
import type { AnalysisCoverage, BlockerCount, EvaluationRun } from "../../../findings/run-result.js";
import { ENVENOM_TOKEN, judgeEnvenomCast } from "./envenom-decision.js";

export const ASSASSINATION_SPEC_ID = "rogue/assassination";
const COMBO_POINTS = "COMBO_POINTS";

export interface AssassinationEvaluationOptions {
  /** The actor to evaluate. The caller asserts this actor is Assassination. */
  readonly actorId: number;
  /**
   * Omit to use the pinned artifact.
   *
   * Pass `null` to model "no pinned authority exists for this spec", which
   * produces NO_AUTHORITY_AVAILABLE judgments rather than a failed run.
   */
  readonly authority?: AplAuthority | null;
}

function coverageStateOf(state: CombatState, category: EvidenceCategory): CoverageState | null {
  const evidence = state.fight.completeness.categories[category];
  return evidence.capability === "OBSERVABLE" ? evidence.coverage.state : null;
}

function decisionPointFrom(
  event: CastEvent,
  position: number,
  actorId: number,
): ObservedActionDecisionPoint | null {
  if (event.abilityGameId === null) return null;
  return {
    position,
    locator: event.locator,
    actorId,
    abilityGameId: event.abilityGameId,
    castPhase: "COMPLETE",
    reportTimeMs: event.reportTimeMs,
    fightTimeMs: event.fightTimeMs,
  };
}

function tallyBlockers(counts: ReadonlyMap<JudgmentBlocker, number>): readonly BlockerCount[] {
  // Emitted in the canonical blocker order so the structure serializes
  // deterministically rather than in insertion order.
  const rows: BlockerCount[] = [];
  for (const blocker of JUDGMENT_BLOCKERS) {
    const count = counts.get(blocker) ?? 0;
    if (count > 0) rows.push({ blocker, count });
  }
  return rows;
}

/**
 * Evaluates every observed Envenom cast by one Assassination actor.
 *
 * Casts are located through M4's cast index by NUMERIC ability id. The index
 * yields canonical positions directly, so nothing here indexes `events` by an
 * ingestion ordinal or searches the canonical array by time.
 */
export function evaluateAssassinationEnvenom(
  state: CombatState,
  options: AssassinationEvaluationOptions,
): EvaluationRun {
  const identity = abilityIdentityFor(ENVENOM_TOKEN);
  if (!identity.ok) {
    return {
      outcome: "NOT_EVALUATED",
      reason: "ABILITY_IDENTITY_UNAVAILABLE",
      detail: `no canonical spell id is available for the SimulationCraft token '${identity.token}'`,
    };
  }
  const envenomSpellId = identity.identity.spellId;

  const wire = resourceWireTypeFor(COMBO_POINTS, {
    gameVersion: state.fight.provenance.gameVersion,
    logVersion: state.fight.provenance.logVersion,
  });
  if (!wire.ok) {
    return {
      outcome: "NOT_EVALUATED",
      reason: "INCOMPATIBLE_RESOURCE_WIRE_VERSION",
      detail:
        wire.reason === "NO_CONTRACT_FOR_RESOURCE"
          ? "no wire contract is declared for combo points"
          : "the combo-point wire contract is not established for this log's gameVersion/logVersion",
    };
  }

  let authority: AplAuthority | null;
  if (options.authority === undefined) {
    const loaded = pinnedAssassinationAuthority();
    if (!loaded.ok) {
      return {
        outcome: "NOT_EVALUATED",
        reason: "AUTHORITY_ARTIFACT_UNUSABLE",
        detail: `the pinned authority artifact failed validation (${loaded.reason})`,
      };
    }
    authority = loaded.authority;
  } else {
    authority = options.authority;
  }

  const reachability: ReachabilityProof | null =
    authority === null ? null : authority.proveSoleGateTo(ENVENOM_TOKEN);

  const positions =
    state.indexes.castsByPhase.COMPLETE.get(options.actorId)?.positionsByAbility.get(envenomSpellId) ?? [];

  const findings: Finding[] = [];
  const blockerCounts = new Map<JudgmentBlocker, number>();
  let rejected = 0;
  let withExact = 0;
  let missingExact = 0;

  for (const position of positions) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    const decisionPoint = decisionPointFrom(event, position, options.actorId);
    if (decisionPoint === null) continue;

    const judgment = judgeEnvenomCast({
      state,
      decisionPoint,
      comboPointWireType: wire.wireType,
      resourceId: COMBO_POINTS,
      authority,
      reachability,
    });

    if (judgment.status === "REJECTED_BY_AUTHORITY") {
      rejected += 1;
      withExact += 1;
    } else if (judgment.status === "UNKNOWN") {
      blockerCounts.set(judgment.blocker, (blockerCounts.get(judgment.blocker) ?? 0) + 1);
      if (judgment.blocker === "EXACT_RESOURCE_UNAVAILABLE") missingExact += 1;
      else if (judgment.observedState !== null) withExact += 1;
    }

    findings.push(
      createFinding({
        spec: ASSASSINATION_SPEC_ID,
        category: "ROTATION",
        decisionPoint,
        judgment,
      }),
    );
  }

  const castCoverage = coverageStateOf(state, "CASTS");
  const resourceCoverage = coverageStateOf(state, "RESOURCES");

  const coverage: AnalysisCoverage = {
    actorId: options.actorId,
    observedEnvenomCastsInScope: findings.length,
    withExactPreCostComboPoints: withExact,
    missingExactComboPoints: missingExact,
    rejectedByAuthority: rejected,
    unknownByBlocker: tallyBlockers(blockerCounts),
    castCoverage,
    resourceCoverage,
    coverageIsIncomplete: castCoverage !== "COMPLETE" || resourceCoverage !== "COMPLETE",
  };

  return { outcome: "EVALUATED", findings, coverage };
}
