/**
 * The comparison layer against real Warcraft Logs evidence.
 *
 * Every case here is a decision a real player actually made. The synthetic
 * matrix in `tests/unit/m5e-observed-comparison.test.ts` proves the logic; this
 * proves the logic survives contact with the fixtures, and that the refusals
 * stay refusals.
 *
 * NOTHING HERE EVALUATES PLAY. `MATCH` says the authority selection agreed with
 * the observed token. `REJECTED` says the authority cannot select the observed
 * action at the proven state. Neither is a statement about the player.
 */

import { describe, expect, it } from "vitest";

import { analyzeObservedAssassinationDecisions } from "../../src/specs/rogue/assassination/observed-analysis.js";
import type { ObservedActionComparison } from "../../src/specs/rogue/assassination/observed-comparison.js";
import {
  M5D2_ACTOR,
  M5D2_IDS,
  M5D2_TARGET,
  findCastAt,
  m5d2State,
  m5d2TalentEntries,
} from "../support/m5d2-fixture.js";
import { ASSASSINATION_ACTOR_B, m5aState } from "../support/m5a-fixture.js";
import { M5D2_CORPUS, runCase, stepAt } from "../support/m5d2-corpus.js";
import {
  rotationalBindingsAt,
  traverseRotationalAuthority,
} from "../../src/specs/rogue/assassination/rotational-traversal.js";
import { authorityProfileFor } from "../../src/specs/rogue/assassination/observed-profile.js";
import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";
import { resolveModelledTalents } from "../../src/data/game/rogue-talents.js";
import { RESOURCE_WIRE_CONTRACTS } from "../../src/data/wcl-wire/resource-types.js";

const SUPPORTED_SPEC = "rogue/assassination";

const analysis = analyzeObservedAssassinationDecisions({
  state: m5d2State(),
  actorId: M5D2_ACTOR,
  specId: SUPPORTED_SPEC,
  targetActorId: M5D2_TARGET,
});
if (analysis.status !== "ANALYZED") throw new Error(`expected ANALYZED, got ${analysis.status}`);

function at(reportTimeMs: number): ObservedActionComparison {
  const found =
    analysis.status === "ANALYZED"
      ? analysis.comparisons.find((c) => c.decision.reportTimeMs === reportTimeMs)
      : undefined;
  if (found === undefined) throw new Error(`no comparison at ${String(reportTimeMs)}`);
  return found;
}

describe("the real Garrote at Q is authority-compatible", () => {
  const comparison = at(2_176_580);

  it("matches, at exact-entry precision, on the Garrote token", () => {
    expect(comparison.decision.observedToken).toBe("garrote");
    expect(comparison.outcome).toBe("MATCH");
    expect(comparison.basis).toBe("AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN");
    expect(comparison.authorityToken).toBe("garrote");
    expect(comparison.selectionPrecision).toBe("EXACT_ENTRY");
  });

  it("discloses that the positive usability came from the observed execution", () => {
    // The honest caveat on the only MATCH in the fixture: the authority could
    // name this selection partly BECAUSE the cast fired. It is verification of
    // an observed decision, not a prediction that would have held beforehand.
    expect(comparison.usabilityProvenance).toBe("OBSERVED_EXECUTION");
  });

  it("is not accompanied by any M5-A rejection", () => {
    expect(comparison.observedActionRejected).toBe(false);
    expect(comparison.basis).not.toBe("INCONSISTENT_AUTHORITY_RESULTS");
  });

  it("is the only resolved comparison on this fixture", () => {
    if (analysis.status !== "ANALYZED") return;
    const resolved = analysis.comparisons.filter((c) => c.outcome !== "UNKNOWN");
    expect(resolved.map((c) => c.decision.reportTimeMs)).toEqual([2_176_580]);
  });
});

describe("the real low-combo-point Envenom is rejected", () => {
  const rejected = analyzeObservedAssassinationDecisions({
    state: m5aState(),
    actorId: ASSASSINATION_ACTOR_B,
    specId: SUPPORTED_SPEC,
    targetActorId: null,
  });

  it("rejects it through the M5-A observed-action rule", () => {
    if (rejected.status !== "ANALYZED") throw new Error("expected ANALYZED");
    expect(rejected.comparisons).toHaveLength(1);
    const only = rejected.comparisons[0];
    expect(only?.decision.observedToken).toBe("envenom");
    expect(only?.outcome).toBe("REJECTED");
    expect(only?.basis).toBe("OBSERVED_ACTION_REJECTED_BY_AUTHORITY");
    expect(only?.observedActionRejected).toBe(true);
  });

  it("names no replacement action, because none is proven", () => {
    // A rejection stands on its own. The globally ideal action is UNKNOWN and
    // stays UNKNOWN, so nothing here says what should have been cast instead.
    if (rejected.status !== "ANALYZED") throw new Error("expected ANALYZED");
    const only = rejected.comparisons[0];
    expect(only?.authorityToken).toBeNull();
    expect(only?.authorityCoverage).toBe("UNKNOWN");
    expect(only?.selectionPrecision).toBeNull();
  });
});

describe("the real Deathmark stays UNKNOWN on predictive state", () => {
  const comparison = at(2_172_777);

  it("is compared, and refuses", () => {
    expect(comparison.decision.observedToken).toBe("deathmark");
    expect(comparison.outcome).toBe("UNKNOWN");
    expect(comparison.basis).toBe("AUTHORITY_SELECTION_UNRESOLVED");
  });

  it("never becomes a rejection just because the authority could not resolve", () => {
    // The player used a major cooldown. The analyzer declines to evaluate it,
    // and declining must not read as disapproval.
    expect(comparison.outcome).not.toBe("REJECTED");
    expect(comparison.observedActionRejected).toBe(false);
  });

  it("is blocked at cds[0] by permanently predictive atoms", () => {
    // The comparison-level blocker is the scan's earliest unresolved candidate.
    // The DEATHMARK entry's own reason is more specific and is asserted here
    // directly, so the predictive boundary cannot silently become something else.
    const corpusCase = M5D2_CORPUS.find((c) => c.id === 6);
    if (corpusCase === undefined) throw new Error("corpus case 6 missing");
    const run = runCase(corpusCase);
    const step = stepAt(run, "cds", 0);
    expect(step?.actionToken).toBe("deathmark");
    expect(step?.usability).toBe("PROVEN_USABLE");
    expect(step?.gate.kind).toBe("EVALUATED");
    if (step?.gate.kind !== "EVALUATED") return;
    expect(step.gate.truth).toBe("UNKNOWN_STATE");
    expect(step.actionStringVerbatim).toContain("target.time_to_die");
    expect(step.actionStringVerbatim).toContain("fight_remains");
  });
});

describe("the real Fan of Knives never yields a target count", () => {
  it("is excluded from the comparison denominator, and the exclusion is disclosed", () => {
    // Fan of Knives has no record in the pinned GCD artifact, so its execution
    // lane is not established and it cannot be shown to be a rotational GCD.
    // It is excluded rather than counted — and never silently.
    if (analysis.status !== "ANALYZED") return;
    const fok = analysis.excluded.filter((e) => e.abilityGameId === M5D2_IDS.fanOfKnives);
    expect(fok.length).toBeGreaterThan(0);
    for (const e of fok) expect(e.reason).toBe("EXECUTION_LANE_NOT_ESTABLISHED");
    expect(analysis.comparisons.some((c) => c.decision.abilityGameId === M5D2_IDS.fanOfKnives)).toBe(false);
  });

  it("still refuses at the authority-selection level, on the target-count atom", () => {
    const corpusCase = M5D2_CORPUS.find((c) => c.id === 7);
    if (corpusCase === undefined) throw new Error("corpus case 7 missing");
    const run = runCase(corpusCase);
    expect(run.classified.coverage).toBe("UNKNOWN");
    const crimson = stepAt(run, "generate", 0);
    expect(crimson?.outcome).toBe("BLOCKED");
    expect(crimson?.actionStringVerbatim).toContain("spell_targets.fan_of_knives");
  });

  it("does not read a target count back out of the observed cast", () => {
    const corpusCase = M5D2_CORPUS.find((c) => c.id === 7);
    if (corpusCase === undefined) throw new Error("corpus case 7 missing");
    for (const step of runCase(corpusCase).steps) expect(step.outcome).not.toBe("SELECTED");
  });
});

describe("D2 case 2 is a prediction boundary, not a comparison", () => {
  it("has no observed rotational GCD at its query point", () => {
    // The position sits between a Vanish and a Garrote. No cast happens there,
    // so there is nothing to compare and it must not enter the denominator.
    if (analysis.status !== "ANALYZED") return;
    expect(analysis.comparisons.some((c) => c.decision.reportTimeMs === 2_176_491)).toBe(false);
    expect(analysis.excluded.some((e) => e.reportTimeMs === 2_176_491)).toBe(false);
  });

  it("remains the pre-cast usability boundary it was in D2", () => {
    const corpusCase = M5D2_CORPUS.find((c) => c.id === 2);
    if (corpusCase === undefined) throw new Error("corpus case 2 missing");
    const run = runCase(corpusCase);
    expect(run.classified.coverage).toBe("UNKNOWN");
    const step = stepAt(run, "core_dot", 0);
    // The condition is TRUE and usability is what is missing. Unchanged by M5-E.
    expect(step?.gate.kind).toBe("EVALUATED");
    if (step?.gate.kind !== "EVALUATED") return;
    expect(step.gate.truth).toBe("TRUE");
    expect(step.usability).toBe("UNKNOWN");
  });
});

describe("the two Q queries stay different, and both keep their answers", () => {
  it("keeps the literal one-scan UNKNOWN while the first-GCD query is exact", () => {
    const state = m5d2State();
    const loaded = pinnedAssassinationAuthority();
    if (!loaded.ok) throw new Error("authority unavailable");
    const profile = authorityProfileFor(state, M5D2_ACTOR);
    if (profile === null) throw new Error("profile unavailable");
    const wire = (id: string): number => {
      const contract = RESOURCE_WIRE_CONTRACTS.find((entry) => entry.resourceId === id);
      if (contract === undefined) throw new Error(id);
      return contract.wireType;
    };
    const position = findCastAt(state, {
      actorId: M5D2_ACTOR,
      reportTimeMs: 2_176_580,
      abilityGameId: M5D2_IDS.garrote,
    });
    const traversalInput = {
      state,
      actorId: M5D2_ACTOR,
      targetActorId: M5D2_TARGET,
      position,
      observedAbilityGameId: M5D2_IDS.garrote,
      authority: loaded.authority,
      comboPointWireType: wire("COMBO_POINTS"),
      energyWireType: wire("ENERGY"),
      comboPointResourceId: "COMBO_POINTS",
      energyResourceId: "ENERGY",
      knownTalents: resolveModelledTalents(m5d2TalentEntries(state)),
    };
    // Touch the bindings the way the adapter does, so both queries see one state.
    rotationalBindingsAt(traversalInput);

    const literal = traverseRotationalAuthority({ ...traversalInput, profile });
    if (literal.status !== "TRAVERSED") throw new Error("expected a traversal");
    expect(literal.result.kind).toBe("UNKNOWN");

    // And the comparison built on the first-GCD query is still the exact MATCH.
    expect(at(2_176_580).selectionPrecision).toBe("EXACT_ENTRY");
  });
});
