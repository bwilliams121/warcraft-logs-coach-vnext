/**
 * SPEC_ASSASSINATION executors: the real M5 facade and the real
 * specialization-owned derivations, under the committed pinned authorities.
 *
 * AUTHORITY IS THE COMMITTED ARTIFACT AND NOTHING ELSE. The facade is called
 * without an `authority` override, so it resolves the pinned SimulationCraft
 * APL exactly as production does; the loader has already checked that the
 * case pins the revision the repository actually commits. Parse performance,
 * other players and log consensus never enter here — there is no port through
 * which they could.
 */

import { resolveTalentSelection } from "../../../../src/data/game/rogue-talents.js";
import { RESOURCE_WIRE_CONTRACTS } from "../../../../src/data/wcl-wire/resource-types.js";
import type { CombatState } from "../../../../src/engine/state/combat-state.js";
import { bindDotRemains } from "../../../../src/specs/rogue/assassination/dot-remains-state.js";
import {
  analyzeObservedAssassinationDecisions,
  type ObservedAssassinationAnalysis,
} from "../../../../src/specs/rogue/assassination/observed-analysis.js";
import { ASSASSINATION_SPEC_ID } from "../../../../src/specs/rogue/assassination/evaluator.js";
import { positionOfCast, stateOf } from "../fight.js";
import type { LoadedArtifact, LoadedCase, LoadedCorpus } from "../loader.js";
import { fail, pass, type AssertionOutcome } from "./outcome.js";
import type { ParamsOf } from "./params.js";

function analysisFacts(analysis: ObservedAssassinationAnalysis): unknown {
  return analysis.status === "ANALYZED"
    ? {
        status: analysis.status,
        comparisons: analysis.comparisons.length,
        artifactRevision: analysis.authority.artifactRevision,
      }
    : { status: analysis.status, detail: analysis.detail };
}

export function decisionCoverage(
  corpus: LoadedCorpus,
  kase: LoadedCase,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_ASSASSINATION.DECISION_COVERAGE">,
): AssertionOutcome {
  const state = stateOf(corpus, artifact);
  const analysis = analyzeObservedAssassinationDecisions({
    state,
    actorId: params.actorId,
    specId: ASSASSINATION_SPEC_ID,
    targetActorId: params.targetActorId,
  });
  if (analysis.status !== "ANALYZED") {
    return fail("the facade did not analyze the actor", {
      expected: { status: "ANALYZED" },
      actual: analysisFacts(analysis),
    });
  }

  // The case pinned a revision and the loader checked it against the committed
  // artifact. This closes the loop: what the facade actually ran under.
  const pinned = kase.record.authority?.artifactRevision ?? null;
  if (pinned !== analysis.authority.artifactRevision) {
    return fail("the facade ran under a different authority revision than the case pins", {
      expected: { artifactRevision: pinned },
      actual: { artifactRevision: analysis.authority.artifactRevision },
    });
  }

  const comparisons = analysis.comparisons.filter(
    (candidate) =>
      candidate.decision.reportTimeMs === params.observedCast.reportTimeMs &&
      candidate.decision.abilityGameId === params.observedCast.abilityGameId,
  );
  const comparison = comparisons[0];
  if (comparisons.length !== 1 || comparison === undefined) {
    return fail(
      `expected exactly one compared decision for the observed cast; found ${String(comparisons.length)}`,
      {
        expected: { comparedDecisions: 1 },
        actual: { comparedDecisions: comparisons.length },
        locator: params.observedCast,
      },
    );
  }

  const actual = {
    outcome: comparison.outcome,
    basis: comparison.basis,
    authorityCoverage: comparison.authorityCoverage,
    authorityToken: comparison.authorityToken,
    selectionPrecision: comparison.selectionPrecision,
    decisiveBlocker: comparison.decisiveBlocker,
    observedActionRejected: comparison.observedActionRejected,
  };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the facade compared the observed decision differently than the case pins", {
      expected: params.expected,
      actual,
      locator: comparison.decision.locator,
    });
  }
  return pass();
}

export function specGate(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_ASSASSINATION.SPEC_GATE">,
): AssertionOutcome {
  const analysis = analyzeObservedAssassinationDecisions({
    state: stateOf(corpus, artifact),
    actorId: params.actorId,
    specId: params.specId,
    targetActorId: null,
  });
  if (analysis.status !== "SPEC_NOT_SUPPORTED" || analysis.specId !== params.specId) {
    return fail("the facade did not refuse the specialization at the gate", {
      expected: { status: "SPEC_NOT_SUPPORTED", specId: params.specId },
      actual: analysisFacts(analysis),
    });
  }
  return pass();
}

export function authorityUnavailableIsNotRejection(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_ASSASSINATION.AUTHORITY_UNAVAILABLE_IS_NOT_REJECTION">,
): AssertionOutcome {
  const analysis = analyzeObservedAssassinationDecisions({
    state: stateOf(corpus, artifact),
    actorId: params.actorId,
    specId: ASSASSINATION_SPEC_ID,
    targetActorId: params.targetActorId,
    // The one legitimate way to model "no authority": the caller says so.
    authority: null,
  });
  if (analysis.status !== "AUTHORITY_NOT_AVAILABLE") {
    return fail("a missing authority did not surface as AUTHORITY_NOT_AVAILABLE", {
      expected: { status: "AUTHORITY_NOT_AVAILABLE", comparisons: 0 },
      actual: analysisFacts(analysis),
    });
  }
  return pass();
}

function talentEntriesFor(state: CombatState, actorId: number) {
  for (const position of state.positionsOfKind("COMBATANT_INFO")) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "COMBATANT_INFO") continue;
    if (event.snapshot.actorId !== actorId) continue;
    return event.snapshot.talentTree.map((entry) => ({ id: entry.id, nodeId: entry.nodeId }));
  }
  return null;
}

export function talentResolution(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_ASSASSINATION.TALENT_RESOLUTION">,
): AssertionOutcome {
  const entries = talentEntriesFor(stateOf(corpus, artifact), params.actorId);
  if (entries === null) {
    return fail(`the artifact carries no combatantinfo for actor ${String(params.actorId)}`);
  }
  const resolution = resolveTalentSelection(entries, params.simcName);
  if (resolution.selection !== params.expected) {
    return fail(`talent ${params.simcName} resolved differently than the case pins`, {
      expected: { selection: params.expected },
      actual: {
        selection: resolution.selection,
        reason: resolution.reason,
        decidedByEntryId: resolution.decidedByEntryId,
      },
    });
  }
  return pass();
}

export function dotRemains(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"SPEC_ASSASSINATION.DOT_REMAINS">,
): AssertionOutcome {
  const state = stateOf(corpus, artifact);
  const found = positionOfCast(state, params.atCast);
  if (!found.ok) return fail(found.detail);
  const comboPointWireType = RESOURCE_WIRE_CONTRACTS.find(
    (entry) => entry.resourceId === "COMBO_POINTS",
  )?.wireType;
  const binding = bindDotRemains(
    {
      state,
      actorId: params.actorId,
      targetActorId: params.targetActorId,
      position: found.position,
      ...(comboPointWireType === undefined ? {} : { comboPointWireType }),
    },
    params.simcToken,
  );
  const anchorReportTimeMs =
    binding.anchor === null ? null : (state.eventAt(binding.anchor.position)?.reportTimeMs ?? null);
  const actual =
    binding.state === "KNOWN"
      ? { state: "KNOWN", remainsMs: binding.remainsMs, anchorReportTimeMs }
      : { state: "UNKNOWN", blocker: binding.blocker, auraReason: binding.auraReason, anchorReportTimeMs };
  const matches =
    params.expected.state === "KNOWN"
      ? binding.state === "KNOWN" &&
        binding.remainsMs === params.expected.remainsMs &&
        anchorReportTimeMs === params.expected.anchorReportTimeMs
      : binding.state === "UNKNOWN" && binding.blocker === params.expected.blocker;
  if (!matches) {
    return fail(`the ${params.simcToken} remaining duration derived differently than the case pins`, {
      expected: params.expected,
      actual,
      locator: binding.anchor === null ? { position: found.position } : binding.anchor.locator,
    });
  }
  return pass();
}
