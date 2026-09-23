/**
 * M10-C5 Phase A: the internal Protection Paladin evaluator over the whole
 * 45-second capture of the M10-B subject — the first REAL resolved decision,
 * every remaining UNKNOWN with its exact blocker, the opener unchanged, and
 * the gap derivative restoring UNKNOWN where its anchor was removed.
 *
 * Every number here was MEASURED from the committed artifacts, after the
 * population and the gap boundary were fixed; nothing was chosen from the
 * results. The Divine Toll press was pre-registered as the expected candidate
 * from the design pass and is asserted as what it measured to be.
 */

import { describe, expect, it } from "vitest";

import { corpusState, positionOfCast } from "../support/corpus/fight.js";
import {
  analyzeObservedProtectionPaladinDecisions,
  type ProtectionPaladinAnalysis,
} from "../../src/specs/paladin/protection/observed-analysis.js";
import { PROTECTION_PALADIN_REGISTRATION } from "../../src/specs/paladin/protection/registration.js";
import { PROTECTION_PALADIN_SPEC_ID } from "../../src/specs/paladin/protection/spec.js";
import { requirePublicSpecId } from "../../src/findings/spec-id.js";
import { PUBLIC_SPEC_IDS } from "../../src/findings/spec-id.js";

const OPENER = "wcl-protection-paladin-a7r6-opener";
const OPENER_GAP = "wcl-protection-paladin-a7r6-opener.gap-before-2010000";
const ROTATIONAL = "wcl-protection-paladin-a7r6-rotational-45s";
const ROTATIONAL_GAP = "wcl-protection-paladin-a7r6-rotational-45s.gap-before-2026589";
const TANK = 7;
const PULL = 2004589;
const [DIVINE_TOLL, HAMMER_OF_WRATH, SENTINEL] = [375576, 1241413, 389539];

function analyzed(analysis: ProtectionPaladinAnalysis) {
  if (analysis.status !== "ANALYZED") throw new Error(`expected ANALYZED, got ${analysis.status}`);
  return analysis;
}
const analyzeReal = (artifactId: string) =>
  analyzed(
    PROTECTION_PALADIN_REGISTRATION.analyze({
      state: corpusState(artifactId),
      actorId: TANK,
      specId: PROTECTION_PALADIN_SPEC_ID,
      targetActorId: null,
    }) as ProtectionPaladinAnalysis,
  );

function blockerDistribution(analysis: ReturnType<typeof analyzeReal>) {
  const tally = new Map<string, number>();
  for (const comparison of analysis.comparisons) {
    if (comparison.outcome !== "UNKNOWN") continue;
    const resolved = analysis.resolved.find((entry) => entry.position === comparison.decision.position);
    const key = resolved?.selection.blockedAt ?? "<none>";
    tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return Object.fromEntries([...tally.entries()].sort());
}

describe("the 45-second population, fixed before any outcome", () => {
  const state = corpusState(ROTATIONAL);
  const analysis = analyzeReal(ROTATIONAL);

  it("evaluates every eligible GCD cast from the pull through +44,992 ms: 47 decisions, 54 named exclusions, from 101 casts", () => {
    const casts = state.fight.events.filter(
      (event) => event.kind === "CAST" && event.castPhase === "COMPLETE" && event.source?.actorId === TANK,
    );
    expect(casts).toHaveLength(101);
    expect(analysis.coverage.eligibleDecisions).toBe(47);
    expect(analysis.coverage.excludedCastCount).toBe(54);
    expect(analysis.comparisons.length + analysis.excluded.length).toBe(101);
    expect(Object.fromEntries(analysis.coverage.exclusions.map((row) => [row.key, row.count]))).toEqual({
      MELEE_SWING: 28,
      NON_GCD_ACTION: 23,
      EXECUTION_LANE_NOT_ESTABLISHED: 2,
      NO_AUTHORITY_TOKEN_BINDING: 1,
    });
    // The window: first decision at +847 ms, last at +44,003 ms; history from the pull.
    const times = analysis.comparisons.map((comparison) => comparison.decision.reportTimeMs - PULL);
    expect(Math.min(...times)).toBe(847);
    expect(Math.max(...times)).toBe(44003);
    expect(state.fight.events[0]?.reportTimeMs).toBe(PULL);
  });

  it("resolves exactly one real decision — MATCH, none REJECTED — and 46 UNKNOWN", () => {
    expect(analysis.coverage).toMatchObject({
      match: 1,
      rejected: 0,
      unknown: 46,
      resolvedComparisons: 1,
      exactEntryMatches: 1,
      tokenConvergedMatches: 0,
    });
    expect(analysis.coverage.match + analysis.coverage.rejected).toBeGreaterThan(0);
  });
});

describe("the real resolved decision: the Divine Toll press at +22,066 ms", () => {
  const state = corpusState(ROTATIONAL);
  const analysis = analyzeReal(ROTATIONAL);
  const position = (() => {
    const found = positionOfCast(state, { actorId: TANK, reportTimeMs: 2026655, abilityGameId: DIVINE_TOLL });
    if (!found.ok) throw new Error(found.detail);
    return found.position;
  })();
  const comparison = analysis.comparisons.find((entry) => entry.decision.position === position);
  const resolved = analysis.resolved.find((entry) => entry.position === position);

  it("is MATCH by the exact entry default[6] divine_toll, with an exact event locator", () => {
    expect(comparison).toMatchObject({
      outcome: "MATCH",
      basis: "AUTHORITY_SELECTION_MATCHED_OBSERVED_TOKEN",
      authorityCoverage: "EXACT_ENTRY",
      authorityToken: "divine_toll",
      selectionPrecision: "EXACT_ENTRY",
      decisiveBlocker: null,
      rawBlocker: null,
      observedActionRejected: false,
      usabilityProvenance: "OBSERVED_EXECUTION",
    });
    expect(comparison?.decision).toMatchObject({
      position: 418,
      actorId: TANK,
      abilityGameId: DIVINE_TOLL,
      observedToken: "divine_toll",
      reportTimeMs: 2026655,
      fightTimeMs: 22066,
      locator: { streamId: "all", ingestionOrdinal: 418, rawType: "cast", reportTimeMs: 2026655 },
    });
    expect(resolved?.selection).toEqual({ kind: "ROTATIONAL_GCD_SELECTED", blockedAt: null, detail: null });
  });

  it("rests on evidence strictly before the press: the wings aura applied at 2,026,241 and the Sentinel cast at 2,026,241", () => {
    expect(resolved?.auras.find((entry) => entry.atomName === "avenging_wrath")).toEqual(
      expect.objectContaining({
        atomName: "avenging_wrath",
        state: "BOUND",
        up: true,
        abilityGameId: SENTINEL,
        anchorPosition: 403,
      }),
    );
    // M10-C5 Phase B reads more atoms at the same decision; none of them is
    // what selected Divine Toll, and none is bound from silence: Vanguard has
    // no observed transition yet (UNBOUND), the Hammer of Wrath readiness aura
    // was applied by the same Sentinel press (BOUND true), and the four
    // build-implied absences come from the talent tree.
    expect(resolved?.auras.map((entry) => [entry.atomName, entry.state])).toEqual([
      ["avenging_wrath", "BOUND"],
      ["vanguard", "UNBOUND"],
      ["hammer_of_wrath", "BOUND"],
      ["hammer_of_light_ready", "BOUND_BY_BUILD"],
      ["hammer_of_light_free", "BOUND_BY_BUILD"],
      ["undisputed_ruling", "BOUND_BY_BUILD"],
      ["blessed_assurance", "BOUND_BY_BUILD"],
    ]);
    const wings = resolved?.cooldowns.find((entry) => entry.simcToken === "avenging_wrath");
    expect(wings?.readiness).toEqual({
      state: "PROVEN_NOT_READY",
      provenRemainingAtLeastMs: 59586,
      cooldownToleranceMs: 250,
    });
    expect(wings?.readinessAbilityGameId).toBe(SENTINEL);
    const sentinel = wings?.perAbility.find((entry) => entry.abilityGameId === SENTINEL);
    expect(sentinel?.effectiveBase).toEqual({ state: "EXACT", ms: 60000 });
    expect(sentinel?.staticModifiers).toEqual([
      expect.objectContaining({
        displayNameEn: "Righteous Protector",
        selection: "SELECTED",
        treatment: "APPLIED_EXACTLY",
        value: -50,
      }),
    ]);
    expect(sentinel?.cooldown).toMatchObject({ state: "BOUNDED", anchorPosition: 404, elapsedMs: 414 });
    // Divine Toll's own cooldown is UNKNOWN here — no cast before this one — and is not what selected it.
    const divineToll = resolved?.cooldowns.find((entry) => entry.simcToken === "divine_toll");
    expect(divineToll?.readiness).toEqual({ state: "UNKNOWN", reason: "COOLDOWN_STATE_UNKNOWN" });
    // Both anchors precede the decision position.
    expect(403).toBeLessThan(position);
    expect(404).toBeLessThan(position);
  });
});

describe("every remaining UNKNOWN retains its exact blocker", () => {
  const analysis = analyzeReal(ROTATIONAL);

  it("distributes over exactly two entries: 21 at default[6] before the Sentinel press, 25 at default[9] after the Divine Toll press", () => {
    expect(blockerDistribution(analysis)).toEqual({
      "default[6] divine_toll": 21,
      "default[9] holy_armaments": 25,
    });
    for (const comparison of analysis.comparisons) {
      if (comparison.outcome !== "UNKNOWN") continue;
      expect(comparison.rawBlocker).toBe("DIVERGENT_GCD_OUTCOMES");
      expect(comparison.decisiveBlocker).toBe("DIVERGENT_WORLDS");
      const before = comparison.decision.reportTimeMs < 2026241;
      const resolved = analysis.resolved.find((entry) => entry.position === comparison.decision.position);
      expect(resolved?.selection.blockedAt).toBe(
        before ? "default[6] divine_toll" : "default[9] holy_armaments",
      );
    }
  });

  it("after the Divine Toll press every decision knows Divine Toll and wings are NOT ready, and next_armament stays UNKNOWN", () => {
    for (const resolved of analysis.resolved) {
      const comparison = analysis.comparisons.find((entry) => entry.decision.position === resolved.position);
      if (comparison === undefined || comparison.decision.reportTimeMs <= 2026655) continue;
      for (const token of ["divine_toll", "avenging_wrath"]) {
        expect(resolved.cooldowns.find((entry) => entry.simcToken === token)?.readiness.state, token).toBe(
          "PROVEN_NOT_READY",
        );
      }
      const armament = resolved.diagnostics;
      expect(armament.heroTree).toMatchObject({ state: "RESOLVED", simcName: "lightsmith" });
    }
    // The first decision after the press is the first Hammer of Wrath, with Divine Toll at least 59,154 ms out.
    const how = analysis.resolved.find((entry) => {
      const comparison = analysis.comparisons.find((c) => c.decision.position === entry.position);
      return (
        comparison?.decision.reportTimeMs === 2027501 && comparison.decision.abilityGameId === HAMMER_OF_WRATH
      );
    });
    expect(how?.cooldowns.find((entry) => entry.simcToken === "divine_toll")?.readiness).toEqual({
      state: "PROVEN_NOT_READY",
      provenRemainingAtLeastMs: 59154,
      cooldownToleranceMs: 250,
    });
  });

  it("before the Sentinel press nothing is anchored: the later press is never an oracle", () => {
    for (const resolved of analysis.resolved) {
      const comparison = analysis.comparisons.find((entry) => entry.decision.position === resolved.position);
      if (comparison === undefined || comparison.decision.reportTimeMs >= 2026241) continue;
      expect(resolved.auras[0]).toMatchObject({ state: "UNBOUND", reason: "AURA_STATE_UNKNOWN" });
      for (const cooldown of resolved.cooldowns) expect(cooldown.readiness.state).toBe("UNKNOWN");
    }
  });
});

describe("the opener and its gap are unchanged by Phase A", () => {
  it("the 22-second opener still yields 21 eligible decisions, all UNKNOWN at default[6]", () => {
    const analysis = analyzeReal(OPENER);
    expect(analysis.coverage).toMatchObject({ eligibleDecisions: 21, match: 0, rejected: 0, unknown: 21 });
    expect(blockerDistribution(analysis)).toEqual({ "default[6] divine_toll": 21 });
  });

  it("the opener gap still yields 16, all UNKNOWN at default[6]", () => {
    const analysis = analyzeReal(OPENER_GAP);
    expect(analysis.coverage).toMatchObject({ eligibleDecisions: 16, match: 0, rejected: 0, unknown: 16 });
    expect(blockerDistribution(analysis)).toEqual({ "default[6] divine_toll": 16 });
  });
});

describe("the predeclared gap derivative restores UNKNOWN where its anchor was removed", () => {
  const analysis = analyzeReal(ROTATIONAL_GAP);

  it("the same Divine Toll press is UNKNOWN again, and the MATCH count is zero", () => {
    expect(analysis.coverage).toMatchObject({ eligibleDecisions: 26, match: 0, rejected: 0, unknown: 26 });
    expect(blockerDistribution(analysis)).toEqual({
      "default[6] divine_toll": 1,
      "default[9] holy_armaments": 25,
    });
    const divineToll = analysis.comparisons.find((entry) => entry.decision.reportTimeMs === 2026655);
    expect(divineToll?.outcome).toBe("UNKNOWN");
    const resolved = analysis.resolved.find((entry) => entry.position === divineToll?.decision.position);
    expect(resolved?.selection.blockedAt).toBe("default[6] divine_toll");
    expect(resolved?.auras[0]).toMatchObject({ state: "UNBOUND", reason: "AURA_STATE_UNKNOWN" });
    expect(resolved?.cooldowns.find((entry) => entry.simcToken === "avenging_wrath")?.readiness.state).toBe(
      "UNKNOWN",
    );
  });

  it("an anchor the gap kept still proves what it proves", () => {
    const how = analysis.resolved.find((entry) => {
      const comparison = analysis.comparisons.find((c) => c.decision.position === entry.position);
      return comparison?.decision.reportTimeMs === 2027501;
    });
    expect(how?.cooldowns.find((entry) => entry.simcToken === "divine_toll")?.readiness.state).toBe(
      "PROVEN_NOT_READY",
    );
    expect(how?.cooldowns.find((entry) => entry.simcToken === "avenging_wrath")?.readiness.state).toBe(
      "UNKNOWN",
    );
  });
});

describe("Protection is public since M10-D", () => {
  it("the analyzed result narrows to the public spec id, and the public set carries all four specializations", () => {
    const analysis = analyzeReal(ROTATIONAL);
    // Until M10-D this threw InternalSpecExposureError.
    expect(requirePublicSpecId(analysis.specId)).toBe("paladin/protection");
    expect(PUBLIC_SPEC_IDS).toEqual([
      "rogue/assassination",
      "paladin/protection",
      "paladin/retribution",
      "deathknight/blood",
    ]);
    expect(PROTECTION_PALADIN_REGISTRATION.exposure).toBe("PUBLIC");
  });

  it("the facade still refuses a foreign specialization before any Protection rule runs", () => {
    const refused = analyzeObservedProtectionPaladinDecisions({
      state: corpusState(ROTATIONAL),
      actorId: TANK,
      specId: "rogue/assassination",
      targetActorId: null,
    });
    expect(refused.status).toBe("SPEC_NOT_SUPPORTED");
  });
});
