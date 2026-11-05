/**
 * PREP-2: consumable status on the public analysis result.
 *
 * - Every public status carries `preparation`, unsupported specializations
 *   included, with all three consumables (never omitted).
 * - An UNKNOWN status never carries a `count`; its uses are a lower bound.
 * - Nothing internal leaks: the identity-load detail is not published, and the
 *   discriminators are `assessment`/`countState`, never `state`.
 * - The public vocabularies are pinned equal to the producer's, and a coverage
 *   gate outside the public set fails the projection closed.
 */

import { describe, expect, it } from "vitest";

import {
  assessConsumableStatus,
  CONSUMABLE_UNKNOWN_CODES,
  CONSUMABLE_USE_TIMINGS,
} from "../../src/analysis/preparation/consumable-status.js";
import {
  PUBLIC_CONSUMABLE_UNKNOWN_CODES,
  PUBLIC_CONSUMABLE_USE_TIMINGS,
  PUBLIC_COVERAGE_GATES,
  PUBLIC_PREPARATION_NOT_ASSESSED_REASONS,
  PublicAnalysisResultSchema,
} from "../../src/contracts/analysis-contract.js";
import { projectAnalysisResult } from "../../src/contracts/analysis-projection.js";
import { loadPreparationConsumables } from "../../src/data/game/preparation-consumables.js";
import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import { UNKNOWN_REASONS } from "../../src/engine/state/state-result.js";
import { specNotSupported } from "../../src/services/analyzer-registry.js";
import {
  PREPARATION_NOT_ASSESSED_REASONS,
  type FightAnalysis,
  type PreparationOutcome,
} from "../../src/services/result.js";
import type { FightIdentity } from "../../src/wcl/types.js";
import {
  castEvent,
  observableCategory,
  partialCategory,
  syntheticFight,
} from "../support/synthetic-fight.js";

const PLAYER = 14;
const START = 1_000;
const END = 181_000;
const range = inclusiveRange(START, END);

const identity: FightIdentity = {
  report: { code: "aBcDeFgH12345678", revision: 1, startTime: 0, endTime: 1 },
  data: { logVersion: 17, gameVersion: 1 },
  fight: { id: 7, name: "Boss", encounterId: 1, difficulty: 16, startTime: START, endTime: END },
  player: { sourceId: PLAYER, name: "Player", className: "Evoker", specName: "Devastation" },
};

function unsupportedWith(preparation: PreparationOutcome): FightAnalysis {
  return {
    identity,
    specId: null,
    analyzerId: null,
    scope: "PLAYER_CONTEXT",
    analysis: specNotSupported("evoker/devastation"),
    observedDecisions: null,
    preparation,
  };
}

const healthstoneCast = castEvent({
  ordinal: 1,
  reportTimeMs: 50_000,
  sourceActorId: PLAYER,
  abilityGameId: 6262,
  castPhase: "COMPLETE",
});

function assessed(categories: Parameters<typeof syntheticFight>[0]): PreparationOutcome {
  const fight = syntheticFight({ startTimeMs: START, endTimeMs: END, ...categories });
  return { state: "ASSESSED", report: assessConsumableStatus(fight, PLAYER) };
}

const COMPLETE = assessed({
  events: [healthstoneCast],
  categories: { CASTS: observableCategory(range, [PLAYER]), AURAS: observableCategory(range, [PLAYER]) },
});
const PARTIAL = assessed({
  events: [healthstoneCast],
  categories: {
    CASTS: partialCategory([inclusiveRange(START, 90_000)], [PLAYER]),
    AURAS: observableCategory(range, [PLAYER]),
  },
});

describe("the public preparation block", () => {
  it("an unsupported specialization's public result carries all three statuses", () => {
    const projected = projectAnalysisResult(unsupportedWith(COMPLETE));
    expect(projected.status).toBe("SPEC_NOT_SUPPORTED");
    expect(PublicAnalysisResultSchema.safeParse(projected).success).toBe(true);
    expect(projected.preparation).toMatchObject({
      assessment: "ASSESSED",
      category: "PREPARATION",
      authority: "WCL_OBSERVED_FACT",
      identityData: { authority: "RUNTIME_GAME_DATA", clientDataWowVersion: "12.1.0.69587" },
    });
    if (projected.preparation?.assessment !== "ASSESSED") return;
    expect(Object.keys(projected.preparation.statuses).sort()).toEqual([
      "combatPotion",
      "healthPotion",
      "healthstone",
    ]);
    expect(projected.preparation.statuses.healthstone).toMatchObject({
      countState: "OBSERVED",
      count: 1,
      uses: [{ spellId: 6262, name: "Healthstone", timing: "IN_FIGHT", evidence: { reportTimeMs: 50_000 } }],
    });
    expect(projected.preparation.statuses.healthPotion).toMatchObject({ countState: "OBSERVED", count: 0 });
  });

  it("UNKNOWN is never a count: it carries reasons and a lower bound, and no `count` key", () => {
    const projected = projectAnalysisResult(unsupportedWith(PARTIAL));
    if (projected.preparation?.assessment !== "ASSESSED") throw new Error("not assessed");
    for (const status of Object.values(projected.preparation.statuses)) {
      expect(status.countState).toBe("UNKNOWN");
      expect("count" in status).toBe(false);
    }
    expect(projected.preparation.statuses.healthstone).toMatchObject({
      observedAtLeast: 1,
      reasons: [{ code: "CAST_COVERAGE", gate: "INSUFFICIENT_COVERAGE" }],
    });
  });

  it("NOT_ASSESSED is published with its reason and nothing else", () => {
    for (const reason of PREPARATION_NOT_ASSESSED_REASONS) {
      const projected = projectAnalysisResult(unsupportedWith({ state: "NOT_ASSESSED", reason }));
      expect(projected.preparation).toEqual({ assessment: "NOT_ASSESSED", reason });
    }
  });

  it("does not publish the identity-load detail or any `state` key", () => {
    const broken: PreparationOutcome = {
      state: "ASSESSED",
      report: assessConsumableStatus(
        syntheticFight({ startTimeMs: START, endTimeMs: END }),
        PLAYER,
        loadPreparationConsumables({ not: "an artifact" }),
      ),
    };
    const projected = projectAnalysisResult(unsupportedWith(broken));
    if (projected.preparation?.assessment !== "ASSESSED") throw new Error("not assessed");
    for (const status of Object.values(projected.preparation.statuses)) {
      if (status.countState !== "UNKNOWN") throw new Error("not unknown");
      // The reason is the code alone: the internal validation message is not published.
      expect(status.reasons).toEqual([{ code: "IDENTITY_DATA_UNAVAILABLE" }]);
    }
    expect(projected.preparation.identityData).toBeNull();
    expect(JSON.stringify(projected)).not.toMatch(/"state":/);
  });
});

describe("public vocabulary", () => {
  it("is pinned equal to the producer's and the services'", () => {
    expect([...PUBLIC_CONSUMABLE_UNKNOWN_CODES]).toEqual([...CONSUMABLE_UNKNOWN_CODES]);
    expect([...PUBLIC_CONSUMABLE_USE_TIMINGS]).toEqual([...CONSUMABLE_USE_TIMINGS]);
    expect([...PUBLIC_PREPARATION_NOT_ASSESSED_REASONS]).toEqual([...PREPARATION_NOT_ASSESSED_REASONS]);
  });

  it("publishes the coverage gates the shared gate can return, and fails closed on any other", () => {
    for (const gate of PUBLIC_COVERAGE_GATES) expect(UNKNOWN_REASONS).toContain(gate);
    const outside: PreparationOutcome = structuredClone(PARTIAL);
    if (outside.state !== "ASSESSED") throw new Error("not assessed");
    const status = outside.report.statuses.HEALTHSTONE;
    if (status.state !== "UNKNOWN") throw new Error("not unknown");
    (status.reasons as { code: string; gate: string }[])[0] = {
      code: "CAST_COVERAGE",
      gate: "NO_OBSERVATION",
    };
    expect(() => projectAnalysisResult(unsupportedWith(outside))).toThrow();
  });
});
