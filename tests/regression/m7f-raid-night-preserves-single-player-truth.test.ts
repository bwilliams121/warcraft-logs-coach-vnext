/**
 * A raid night says exactly what the single-fight analysis said.
 *
 * WHAT WOULD BE WRONG IF THIS FAILED
 *
 * Every M7 layer exists to make a raid night cheap: one core per fight, one
 * focused view per player, one small cell carried forward. Cheap is only worth
 * having if the answer is unchanged — a raid night that quietly analyzed each
 * player against a different, wider or narrower reality than `/v1/analysis` does
 * would be a second analyzer wearing the first one's vocabulary.
 *
 * WHY THIS IS NOT A REPEAT OF THE M7-B TESTS
 *
 * `m7b-focused-view-preserves-single-player-analysis.test.ts` compares the
 * analyzer's output either side of `focusedFightFor`, and
 * `m7b-fight-analysis-equivalence.test.ts` compares the whole `FightAnalysis`
 * across a hand-assembled composition. Both use a core describing ONE player.
 *
 * This runs the REAL orchestration over a core describing SEVERAL, which is the
 * case M7-F actually introduced. The risk it addresses is specific: with other
 * players' casts, resources and auras present in the same core, a focusing defect
 * would not throw — it would produce a plausible analysis of the wrong evidence.
 *
 * WHAT THE REFERENCE IS
 *
 * The same actor analyzed from a core describing ONLY them — the retrieval the
 * single-fight path would have made. So the two sides differ in exactly one
 * respect: whether two other Rogues' casts, resources and auras were present in
 * the evidence. Orchestration must agree exactly — same decisions, same UNKNOWN
 * blockers, same exclusions, same counts — or their presence changed the answer.
 *
 * A core cannot be analyzed unfocused, and that is by design rather than a gap
 * here: `NormalizedFightCore` is actor-independent and carries no per-actor
 * completeness, so `focusedFightFor` is what turns it into something a
 * `CombatState` can be built from. Both sides below therefore focus; only the
 * WIDTH of the underlying evidence differs.
 *
 * ONE FAMILY OF FIELDS IS EXCLUDED FROM THE COMPARISON, AND IT MUST BE
 *
 * `position`, `indexInPage` and `ingestionOrdinal` are ADDRESSES within the pull
 * that was retrieved — an index into this fight's event array and the ordinal the
 * paginator assigned. A pull containing three players genuinely has more events
 * than a pull containing one, so the same cast legitimately sits at a different
 * index in each. Demanding equality there would assert that a raid night retrieves
 * one player's events, which is the opposite of the design.
 *
 * They are excluded by explicit NAME rather than by loosening the comparison, and
 * what they address is asserted separately: the evidence FACTS — report timestamp,
 * ability id, stream, raw type — must match exactly, which is what makes each
 * locator point at the same real event. That is the same rule the M5-D2 corpus
 * follows: locate by fact, never by canonical position.
 */

import { describe, expect, it } from "vitest";

import { toPlayerFightCell } from "../../src/aggregation/cell-projection.js";
import { analyzeFight } from "../../src/services/analysis-service.js";
import type { FightAnalysis } from "../../src/services/result.js";
import { createCombatState } from "../../src/engine/state/combat-state.js";
import { focusedFightFor } from "../../src/engine/normalization/fight-core.js";
import {
  analyzeObservedAssassinationDecisions,
  type ObservedAssassinationAnalysis,
} from "../../src/specs/rogue/assassination/observed-analysis.js";
import { assassinationObservedDecisionView } from "../../src/specs/rogue/assassination/registration.js";
import {
  ENABLED_ANALYZERS,
  type RegisteredAnalyzer,
  type SpecAnalysis,
  type SpecAnalysisInput,
} from "../../src/services/analyzer-registry.js";
import { analyzedAssassination } from "../support/assassination-analysis.js";
import type { PlayerFightResult } from "../../src/aggregation/cell.js";
import { identityFor } from "../support/aggregation-fixture.js";
import {
  assassinationSnapshot,
  corpusCore,
  ENV,
  fakePorts,
  M5D2_ACTOR,
  REPORT_CODE,
  REVISION,
  runNight,
} from "../support/raid-night-orchestration-fixture.js";

const OTHER_ROGUE = 23;
const THIRD_ROGUE = 24;
const PARTICIPANTS = [M5D2_ACTOR, OTHER_ROGUE, THIRD_ROGUE] as const;
const FIGHT_ID = 1;

/** What the analyzer was handed, recorded without altering what it returns. */
interface Observation {
  readonly actorId: number;
  readonly specId: string;
  readonly targetActorId: number | null;
  readonly analysis: SpecAnalysis;
}

function recordingRegistry(into: Observation[]): readonly RegisteredAnalyzer[] {
  const registered = ENABLED_ANALYZERS[0];
  if (registered === undefined) throw new Error("no analyzer is registered");
  return [
    {
      ...registered,
      analyze: (input: SpecAnalysisInput): SpecAnalysis => {
        // The REAL analyzer runs. This wrapper observes and returns its result
        // untouched — a wrapper that substituted anything would make the
        // comparison below meaningless.
        const analysis = registered.analyze(input);
        into.push({
          actorId: input.actorId,
          specId: input.specId,
          targetActorId: input.targetActorId,
          analysis,
        });
        return analysis;
      },
    },
  ];
}

/**
 * A core as the INGESTION PORT hands it over: pinned to the roster's revision.
 *
 * The revision matters to more than bookkeeping — the single-fight service
 * compares the ingested fight's revision against the identity preflight
 * established, and refuses a mismatch. Pinning it here means both paths below are
 * reading one export of one report, which is the premise of comparing them at all.
 */
function pulledCore(participants: readonly number[], eventActorIds: readonly number[]) {
  const core = corpusCore(FIGHT_ID, participants, eventActorIds);
  return { ...core, report: { ...core.report, revision: REVISION } };
}

/**
 * The same analysis with pull-relative addresses masked.
 *
 * Structural, not a field list: any `position`, `indexInPage` or `ingestionOrdinal`
 * at any depth becomes one sentinel. Nothing else is touched, so a difference in
 * any other field still fails.
 */
function withoutPullAddresses(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutPullAddresses);
  if (typeof value !== "object" || value === null) return value;

  const masked: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    masked[key] =
      key === "position" || key === "indexInPage" || key === "ingestionOrdinal"
        ? "<pull-relative address>"
        : withoutPullAddresses(nested);
  }
  return masked;
}

/** The evidence facts a locator points at. Identical across pulls, by requirement. */
function evidenceFacts(envelope: SpecAnalysis): unknown {
  const analysis = analyzedAssassination(envelope);
  return {
    decisions: analysis.comparisons.map((comparison) => ({
      reportTimeMs: comparison.decision.reportTimeMs,
      fightTimeMs: comparison.decision.fightTimeMs,
      abilityGameId: comparison.decision.abilityGameId,
      observedToken: comparison.decision.observedToken,
      targetActorId: comparison.decision.targetActorId,
      streamId: comparison.decision.locator.streamId,
      rawType: comparison.decision.locator.rawType,
      pageOrdinal: comparison.decision.locator.pageOrdinal,
      outcome: comparison.outcome,
    })),
    excluded: analysis.excluded.map((cast) => ({
      reportTimeMs: cast.reportTimeMs,
      abilityGameId: cast.abilityGameId,
      reason: cast.reason,
    })),
  };
}

/** The reference: this actor analyzed from a core that contains only them. */
function referenceAnalysis(actorId: number): ObservedAssassinationAnalysis {
  const core = pulledCore([actorId], [actorId]);
  return analyzeObservedAssassinationDecisions({
    state: createCombatState(focusedFightFor(core, actorId, "PLAYER_CONTEXT")),
    actorId,
    specId: "rogue/assassination",
    targetActorId: null,
  });
}

/** The reference cell: the M7-D projection of that single-player analysis. */
function referenceCell(actorId: number): PlayerFightResult {
  const core = pulledCore([actorId], [actorId]);
  const reference = referenceAnalysis(actorId);
  const projection = toPlayerFightCell({
    analysis: {
      identity: identityFor({ fightId: FIGHT_ID, sourceId: actorId, name: `Raider${String(actorId)}` }),
      specId: "rogue/assassination",
      analyzerId: ENABLED_ANALYZERS[0]?.analyzerId ?? "",
      scope: "PLAYER_CONTEXT",
      analysis: reference,
      observedDecisions:
        reference.status === "ANALYZED" ? assassinationObservedDecisionView(reference) : null,
    },
    normalizationRevision: core.provenance.normalizationRevision,
  });
  if (!projection.ok) throw new Error(`reference projection refused: ${projection.reason}`);
  return projection.cell;
}

async function raidNight(): Promise<{
  readonly cells: readonly PlayerFightResult[];
  readonly observations: readonly Observation[];
}> {
  const observations: Observation[] = [];
  const snapshot = assassinationSnapshot({ fightIds: [FIGHT_ID], sourceIds: [...PARTICIPANTS] });
  const ports = fakePorts({ snapshot });
  const run = await runNight(
    { reportCode: REPORT_CODE, fightIds: [FIGHT_ID] },
    {
      ...ports,
      deps: { ...ports.deps, registry: recordingRegistry(observations) },
    },
  );
  if (!run.ok) throw new Error(`the raid night failed: ${run.error.code}`);
  return { cells: run.aggregate.cells, observations };
}

/**
 * The M6 single-fight service over the SAME focused view.
 *
 * Only its two I/O ports are faked, and the fight handed to it is exactly the
 * projection orchestration built. So both sides read identical evidence, and the
 * comparison needs no allowance for pull-relative addresses at all — any
 * difference would be a difference in what the two paths DO.
 */
async function singleFightAnalysis(actorId: number): Promise<FightAnalysis> {
  const core = pulledCore(PARTICIPANTS, PARTICIPANTS);
  const focused = focusedFightFor(core, actorId, "PLAYER_CONTEXT");
  const identity = identityFor({
    fightId: FIGHT_ID,
    sourceId: actorId,
    name: `Raider${String(actorId)}`,
  });

  const result = await analyzeFight(
    { reportCode: REPORT_CODE, fightId: FIGHT_ID, sourceId: actorId },
    {
      env: ENV,
      preflight: async () => ({ ok: true, identity, rateLimit: undefined }),
      ingest: async () => ({ ok: true, fight: focused, rateLimit: undefined }),
    },
  );
  if (!result.ok) throw new Error(`the single-fight service failed: ${result.error.code}`);
  return result.analysis;
}

describe("the M6 single-fight service and the M7-F raid night agree exactly", () => {
  it("produces the identical analyzer result for the same fight and player", async () => {
    // EXACT equality, nothing masked: same core, same focused view, same actor.
    const { observations } = await raidNight();

    for (const observation of observations) {
      const single = await singleFightAnalysis(observation.actorId);
      expect(observation.analysis).toEqual(single.analysis);
    }
  });

  it("agrees on every field of FightAnalysis that a cell is built from", async () => {
    const single = await singleFightAnalysis(M5D2_ACTOR);

    // The four fields the analyzer never sees, which M7-D reads.
    expect(single.specId).toBe("rogue/assassination");
    expect(single.analyzerId).toBe(ENABLED_ANALYZERS[0]?.analyzerId);
    expect(single.scope).toBe("PLAYER_CONTEXT");
    expect(single.identity).toEqual(
      identityFor({ fightId: FIGHT_ID, sourceId: M5D2_ACTOR, name: `Raider${String(M5D2_ACTOR)}` }),
    );
  });

  it("projects to the identical cell end to end", async () => {
    // M6 service -> cell, compared against M7-F orchestration -> cell. The full
    // path, both ways, with nothing hand-assembled in between.
    const { cells } = await raidNight();
    const core = pulledCore(PARTICIPANTS, PARTICIPANTS);

    for (const actorId of PARTICIPANTS) {
      const projection = toPlayerFightCell({
        analysis: await singleFightAnalysis(actorId),
        normalizationRevision: core.provenance.normalizationRevision,
      });
      if (!projection.ok) throw new Error(`projection refused: ${projection.reason}`);
      expect(cells.find((cell) => cell.sourceId === actorId)).toEqual(projection.cell);
    }
  });
});

describe("the analysis inside a raid night", () => {
  it("is the SAME analysis the single-player pull produces", async () => {
    const { observations } = await raidNight();

    expect(observations).toHaveLength(PARTICIPANTS.length);
    for (const observation of observations) {
      // Deep equality over the whole analysis: every comparison, every UNKNOWN
      // basis and blocker, every excluded cast, every coverage integer — with only
      // pull-relative addresses masked.
      expect(withoutPullAddresses(observation.analysis)).toEqual(
        withoutPullAddresses(referenceAnalysis(observation.actorId)),
      );
    }
  });

  it("points its evidence at the same real events", async () => {
    // What the masked addresses resolve to. If a locator moved to a DIFFERENT
    // event, these facts would disagree even though the addresses were masked.
    const { observations } = await raidNight();

    for (const observation of observations) {
      expect(evidenceFacts(observation.analysis)).toEqual(
        evidenceFacts(referenceAnalysis(observation.actorId)),
      );
    }
  });

  it("projects to the SAME cell, including provenance and recurrence", async () => {
    const { cells } = await raidNight();

    for (const actorId of PARTICIPANTS) {
      const cell = cells.find((candidate) => candidate.sourceId === actorId);
      expect(cell, `no cell for actor ${String(actorId)}`).toBeDefined();
      expect(cell).toEqual(referenceCell(actorId));
    }
  });

  it("produces a real analysis rather than an empty one", async () => {
    // The equality above would hold vacuously if both sides analyzed nothing.
    const { cells, observations } = await raidNight();

    for (const observation of observations) {
      expect(observation.analysis.status).toBe("ANALYZED");
    }
    for (const cell of cells) {
      expect(cell.kind).toBe("ANALYZED");
      if (cell.kind !== "ANALYZED") continue;
      expect(cell.counts.eligibleDecisions).toBeGreaterThan(0);
      expect(cell.counts.excludedCastCount).toBeGreaterThan(0);
    }
  });

  it("analyzes each selected player once, as themselves", async () => {
    const { observations } = await raidNight();

    // No actor analyzed twice, and nobody analyzed who was not selected.
    expect(observations.map((observation) => observation.actorId)).toEqual([...PARTICIPANTS]);
    for (const observation of observations) {
      expect(observation.specId).toBe("rogue/assassination");
      // Null, not a fight-level enemy. The facade resolves each decision's target
      // from the cast that decision is about; choosing one here would overwrite a
      // per-event fact with a guess.
      expect(observation.targetActorId).toBeNull();
    }
  });

  it("gives players in the same pull genuinely separate results", async () => {
    // A focusing defect that leaked one actor's evidence into another's view
    // would still pass a per-actor equality test if the reference leaked too. The
    // defence is that each analysis is about its OWN actor.
    const { observations } = await raidNight();

    for (const observation of observations) {
      const analysis = analyzedAssassination(observation.analysis);
      expect(analysis.coverage.actorId).toBe(observation.actorId);
      for (const comparison of analysis.comparisons) {
        expect(comparison.decision.actorId).toBe(observation.actorId);
      }
    }
  });
});
