/**
 * ONB-B1: Arms Warrior, Cohort B's representative.
 *
 * The mandatory negative is the centre of it. Every GCD action of the pinned list sits behind a
 * dispatch on the enemy count, which has no authority (ONB-S3): an open dispatch never falls through
 * to a lower list, and no decision becomes a MATCH or a REJECTED. The one thing this slice says over a
 * real fight is an observation, `colossus-smash-window-fill`, and what the evidence does not show is
 * `null`, never zero and never an extended window.
 *
 * The real first seconds are an archive case (`spec-arms-warrior.*`). The whole-fight numbers in
 * agent/architecture.md "ONB-B1" come from replaying the retained capture and are not pinned.
 */

import { describe, expect, it } from "vitest";

import {
  armsWarriorExecutionLaneForAbility,
  armsWarriorExecutionLaneForToken,
  armsWarriorTokenByAbilityId,
  pinnedArmsWarriorGcdSemantics,
} from "../../../src/data/game/warrior-arms-gcd-semantics.js";
import artifactTalents from "../../../src/data/game/warrior-arms-talents.json";
import {
  pinnedArmsWarriorTalents,
  resolveArmsWarriorHeroTree,
  resolveArmsWarriorTalent,
} from "../../../src/data/game/warrior-arms-talents.js";
import { armsWarriorTransitionContractFor } from "../../../src/data/game/warrior-arms-transition-authority.js";
import { inclusiveRange } from "../../../src/engine/evidence/coverage.js";
import { createCombatState } from "../../../src/engine/state/combat-state.js";
import type { CombatEvent } from "../../../src/engine/normalization/normalized-events.js";
import type { AnalyzerRegistration } from "../../../src/findings/analyzer-registration.js";
import {
  analyzerForSpec,
  internalAnalyzerForSpec,
  PRODUCTION_CATALOG,
} from "../../../src/services/analyzer-registry.js";
import { resolveSpecIdentity } from "../../../src/services/spec-identity.js";
import { knownNumber, unknownNumber } from "../../../src/simc/expression/evaluate.js";
import type { AplAction, AplAuthority } from "../../../src/simc/apl-authority.js";
import { resolveArmsWarriorApplicability } from "../../../src/specs/warrior/arms/action-profile.js";
import {
  COLOSSUS_SMASH_DEBUFF_SPELL_ID as DEBUFF,
  type ColossusSmashWindow,
} from "../../../src/specs/warrior/arms/colossus-smash-windows.js";
import { analyzeObservedArmsWarriorDecisions } from "../../../src/specs/warrior/arms/observed-analysis.js";
import { pinnedArmsWarriorAuthority } from "../../../src/specs/warrior/arms/pinned-authority.js";
import { armsWarriorTalentsDisprovedByHeroTree } from "../../../src/specs/warrior/arms/resolver.js";
import type { CategoryEvidence } from "../../../src/engine/normalization/completeness.js";
import type { EvidenceCategory } from "../../../src/wcl/evidence-capability.js";
import {
  attachedResources,
  auraEvent,
  castEvent,
  classResource,
  partialCategory,
  syntheticFight,
} from "../../support/synthetic-fight.js";

const SOURCE = 7;
const OTHER_PLAYER = 8;
const BOSS = 900;
const ADD = 901;
const END = 600000;

const AVATAR = 107574;
const BLADESTORM = 446035;
const MORTAL_STRIKE = 12294;
const EXECUTE_MASSACRE = 281000;
const EXECUTE_BASE = 163201;
const CHARGE = 100;
const CHARGE_IMPACT = 126664;

const entriesOf = (names: readonly string[]): readonly { id: number; nodeId: number }[] =>
  names.map((name) => {
    const row = artifactTalents.talents.find((candidate) => candidate.simcName === name);
    if (row === undefined) throw new Error(`no pinned talent ${name}`);
    return { id: row.traitEntryId, nodeId: row.traitNodeId };
  });

const WHOLE_SLAYER_BUILD = entriesOf([
  "slayers_dominance",
  "opportunist",
  "mortal_strike",
  "overpower",
  "colossus_smash",
  "cleave",
  "rend",
  "avatar",
  "bladestorm",
  "massacre",
  "bloodletting",
  "dreadnaught",
  "deep_wounds",
  "tactical_edge",
  "wrecking_throw",
  "storm_bolt",
]);
const WHOLE_COLOSSUS_BUILD = entriesOf([
  "demolish",
  "mortal_strike",
  "overpower",
  "colossus_smash",
  "cleave",
  "rend",
  "avatar",
  "bladestorm",
  "massacre",
  "wrecking_throw",
]);

interface Cast {
  readonly t: number;
  readonly ability: number | null;
  readonly rage?: number;
  /** `null` is a cast the log gave no source. */
  readonly source?: number | null;
}
interface Aura {
  readonly t: number;
  readonly operation: "APPLIED" | "REFRESHED" | "REMOVED";
  readonly target?: number;
  readonly source?: number;
  readonly auraClass?: "BUFF" | "DEBUFF";
  readonly ability?: number;
}

function combatantInfo(entries: readonly { id: number; nodeId: number }[]): CombatEvent {
  return {
    locator: {
      streamId: "all",
      pageOrdinal: 0,
      indexInPage: 0,
      ingestionOrdinal: 0,
      rawType: "combatantinfo",
      reportTimeMs: 1000,
    },
    ingestionOrdinal: 0,
    reportTimeMs: 1000,
    fightTimeMs: 0,
    rawType: "combatantinfo",
    source: { actorId: SOURCE, instanceId: null },
    target: null,
    sourceAbsence: null,
    targetAbsence: "NOT_SUPPLIED",
    abilityGameId: null,
    attachedResources: null,
    outsideRequestedRange: false,
    kind: "COMBATANT_INFO",
    snapshot: {
      actorId: SOURCE,
      specId: 0,
      gear: [],
      malformedGearRows: [],
      talentTree: entries.map((entry) => ({ id: entry.id, rank: 1, nodeId: entry.nodeId })),
    },
  } as unknown as CombatEvent;
}

const COMPLETE: readonly EvidenceCategory[] = ["AURAS", "CASTS"];

function stateWith(
  entries: readonly { id: number; nodeId: number }[] | null,
  casts: readonly Cast[],
  auras: readonly Aura[] = [],
  categories?: Partial<Record<EvidenceCategory, CategoryEvidence>>,
) {
  const events: CombatEvent[] = entries === null ? [] : [combatantInfo(entries)];
  let ordinal = 1;
  casts.forEach((cast) => {
    events.push(
      castEvent({
        ordinal: ordinal++,
        reportTimeMs: cast.t,
        sourceActorId: cast.source === undefined ? SOURCE : cast.source,
        targetActorId: BOSS,
        abilityGameId: cast.ability,
        castPhase: "COMPLETE",
        attachedResources:
          cast.rage === undefined
            ? null
            : attachedResources({
                side: "SOURCE",
                actorId: SOURCE,
                classResources: [classResource(1, cast.rage, { max: 1000, cost: 300 })],
              }),
      }),
    );
  });
  auras.forEach((aura) => {
    events.push(
      auraEvent({
        ordinal: ordinal++,
        reportTimeMs: aura.t,
        sourceActorId: aura.source ?? SOURCE,
        targetActorId: aura.target ?? BOSS,
        abilityGameId: aura.ability ?? DEBUFF,
        operation: aura.operation,
        auraClass: aura.auraClass ?? "DEBUFF",
      }),
    );
  });
  events.sort((left, right) => (left.reportTimeMs as number) - (right.reportTimeMs as number));
  return createCombatState(
    syntheticFight({
      endTimeMs: END,
      events,
      observedCategories: COMPLETE,
      ...(categories === undefined ? {} : { categories }),
    }),
  );
}

function analyze(
  entries: readonly { id: number; nodeId: number }[] | null,
  casts: readonly Cast[],
  auras: readonly Aura[] = [],
  categories?: Partial<Record<EvidenceCategory, CategoryEvidence>>,
) {
  return analyzeObservedArmsWarriorDecisions({
    state: stateWith(entries, casts, auras, categories),
    actorId: SOURCE,
    specId: "warrior/arms",
    targetActorId: null,
  });
}

function analyzed(...args: Parameters<typeof analyze>) {
  const analysis = analyze(...args);
  if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
  return analysis;
}

function authority(): AplAuthority {
  const loaded = pinnedArmsWarriorAuthority();
  if (!loaded.ok) throw new Error("the pinned authority did not load");
  return loaded.authority;
}

const entryOf = (listName: string, token: string): AplAction => {
  const found = authority().actions.find(
    (action) => action.listName === listName && action.actionToken === token,
  );
  if (found === undefined) throw new Error(`no ${token} in ${listName}`);
  return found;
};

describe("the row", () => {
  it("is reachable by the internal lookup only, and a public identity is refused", () => {
    const row = internalAnalyzerForSpec("warrior/arms", PRODUCTION_CATALOG) as AnalyzerRegistration;
    expect(row.analyzerId).toBe("warrior-arms-observed-decisions");
    expect(row.exposure).toBe("INTERNAL_ONLY");
    expect(analyzerForSpec("warrior/arms", PRODUCTION_CATALOG)).toBeNull();
    expect(resolveSpecIdentity({ className: "Warrior", specName: "Arms" }).ok).toBe(false);
  });

  it("refuses another specialization before reading anything of its own", () => {
    expect(
      analyzeObservedArmsWarriorDecisions({
        state: stateWith(null, []),
        actorId: SOURCE,
        specId: "paladin/protection",
        targetActorId: null,
      }).status,
    ).toBe("SPEC_NOT_SUPPORTED");
  });

  it("a filtered capture with no combatant info refuses as PROFILE_NOT_RESOLVED, never judges", () => {
    expect(analyze(null, [{ t: 2000, ability: MORTAL_STRIKE }]).status).toBe("PROFILE_NOT_RESOLVED");
  });

  it("declares offensive authority only, and reports every other domain without it", () => {
    const byDomain = new Map(
      analyzed(WHOLE_SLAYER_BUILD, []).domains.map((result) => [result.domain, result.resolution]),
    );
    expect(byDomain.get("OFFENSIVE_ROTATION")).toBe("AUTHORITY_AVAILABLE");
    expect(byDomain.get("INTERRUPT")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(byDomain.get("DEFENSIVE_COOLDOWN")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    expect(byDomain.get("RESOURCE_SPENDING")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
  });
});

describe("the dispatch on the enemy count", () => {
  const CASTS: readonly Cast[] = [
    { t: 2000, ability: MORTAL_STRIKE },
    { t: 3500, ability: EXECUTE_MASSACRE },
    { t: 5000, ability: 167105 },
  ];

  it("no decision resolves over a whole Slayer build, and none is a confident verdict", () => {
    const { coverage, comparisons, resolved } = analyzed(WHOLE_SLAYER_BUILD, CASTS);
    expect(coverage.eligibleDecisions).toBe(3);
    expect(coverage.match).toBe(0);
    expect(coverage.rejected).toBe(0);
    expect(coverage.unknown).toBe(3);
    expect(comparisons.every((comparison) => comparison.outcome === "UNKNOWN")).toBe(true);
    expect(comparisons.every((comparison) => comparison.authorityToken === null)).toBe(true);
    expect(resolved.every((entry) => entry.selection.kind === "ROTATIONAL_GCD_UNKNOWN")).toBe(true);
  });

  it("the Slayer scan stops at the enemy-count dispatch, and never falls through to a lower list", () => {
    const { selection } = analyzed(WHOLE_SLAYER_BUILD, CASTS).resolved[0] ?? {};
    expect(selection?.stoppingPoint?.at).toBe("default[17] run_action_list");
    expect(selection?.stoppingPoint?.atoms).toEqual(["active_enemies"]);
    expect(selection?.dispatches.find((step) => step.calleeListName === "slayer_aoe")?.gate).toBe(
      "UNKNOWN_STATE",
    );
    // The two lists below the open gate are not reached, so nothing in them can be selected.
    expect(selection?.dispatches.some((step) => step.calleeListName === "slayer_execute")).toBe(false);
    expect(selection?.dispatches.some((step) => step.calleeListName === "slayer_st")).toBe(false);
  });

  it("a Slayer tree closes the Colossus lists, and a Colossus tree closes the Slayer lists", () => {
    const slayer = analyzed(WHOLE_SLAYER_BUILD, CASTS).resolved[0]?.selection;
    expect(
      slayer?.dispatches.filter((step) => step.calleeListName?.startsWith("colossus")).map((s) => s.outcome),
    ).toEqual([
      "RUN_GATE_FALSE_SKIPPED",
      "TARGET_INDEPENDENT_ELIMINATION_CONTINUE",
      "RUN_GATE_FALSE_SKIPPED",
    ]);
    const colossus = analyzed(WHOLE_COLOSSUS_BUILD, [{ t: 2000, ability: MORTAL_STRIKE }]);
    expect(colossus.build.talentsProvenAbsent).toContain("slayers_dominance");
    expect(colossus.resolved[0]?.selection.stoppingPoint?.at).toBe("default[14] run_action_list");
    expect(colossus.resolved[0]?.selection.stoppingPoint?.atoms).toEqual(["active_enemies"]);
  });

  it("an unresolved tree closes nothing", () => {
    const analysis = analyzed([], [{ t: 2000, ability: MORTAL_STRIKE }]);
    expect(analysis.build.heroTree.state).toBe("UNKNOWN");
    expect(analysis.build.talentsProvenAbsent).toEqual([]);
    expect(analysis.coverage.unknown).toBe(1);
    expect(analysis.comparisons[0]?.authorityToken).toBeNull();
  });

  it("a known Rage value decides nothing past the enemy count, and an absent one is unknown, never zero", () => {
    const withRage = analyzed(WHOLE_SLAYER_BUILD, [{ t: 2000, ability: MORTAL_STRIKE, rage: 800 }]);
    expect(withRage.resolved[0]?.diagnostics.rage).toEqual(knownNumber(80));
    expect(withRage.comparisons[0]?.outcome).toBe("UNKNOWN");
    const withoutRage = analyzed(WHOLE_SLAYER_BUILD, [{ t: 2000, ability: MORTAL_STRIKE }]);
    expect(withoutRage.resolved[0]?.diagnostics.rage).toEqual(unknownNumber("STATE_NOT_ESTABLISHED"));
  });
});

describe("the population", () => {
  it("an off-GCD press and a spell the dataset has no record of are excluded, never judged", () => {
    const analysis = analyzed(WHOLE_SLAYER_BUILD, [
      { t: 2000, ability: AVATAR },
      { t: 2100, ability: CHARGE },
      { t: 2500, ability: 999999 },
      { t: 3000, ability: 23920 }, // Spell Reflection, which the list does not name
    ]);
    expect(analysis.comparisons).toHaveLength(0);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual([
      "NON_GCD_ACTION",
      "NON_GCD_ACTION",
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "EXECUTION_LANE_NOT_ESTABLISHED",
    ]);
  });

  it("Charge's logged impact has no lane and no token, so it is not read as a press", () => {
    expect(armsWarriorTokenByAbilityId().has(CHARGE_IMPACT)).toBe(false);
    expect(armsWarriorExecutionLaneForAbility(CHARGE_IMPACT)).toBe("UNKNOWN_LANE");
  });

  it("Demolish, channelled, is excluded rather than judged at the wrong moment", () => {
    const analysis = analyzed(WHOLE_COLOSSUS_BUILD, [{ t: 2000, ability: 436358 }]);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual(["OUTSIDE_FIRST_SLICE"]);
  });
});

describe("the pinned data", () => {
  it("every dataset loads", () => {
    expect(pinnedArmsWarriorGcdSemantics().ok).toBe(true);
    expect(pinnedArmsWarriorTalents().ok).toBe(true);
  });

  it("Execute binds the Massacre override the log reports as well as its base", () => {
    expect(armsWarriorTokenByAbilityId().get(EXECUTE_MASSACRE)).toBe("execute");
    expect(armsWarriorTokenByAbilityId().get(EXECUTE_BASE)).toBe("execute");
    // Fury's Execute is not this module's.
    expect(armsWarriorTokenByAbilityId().has(5308)).toBe(false);
  });

  it("Bladestorm binds both records, and neither talent decision moves the lane", () => {
    expect(armsWarriorTokenByAbilityId().get(BLADESTORM)).toBe("bladestorm");
    expect(armsWarriorTokenByAbilityId().get(227847)).toBe("bladestorm");
    expect(armsWarriorExecutionLaneForToken("bladestorm")).toBe("GCD_CONSUMING");
  });

  it("Sweeping Strikes's 750 ms record consumes a GCD, where Avatar, Charge and Pummel do not", () => {
    expect(armsWarriorExecutionLaneForToken("sweeping_strikes")).toBe("GCD_CONSUMING");
    for (const token of ["avatar", "charge", "pummel"]) {
      expect(armsWarriorExecutionLaneForToken(token), token).toBe("NON_GCD");
    }
    for (const token of ["mortal_strike", "overpower", "heroic_strike", "cleave", "slam", "colossus_smash"]) {
      expect(armsWarriorExecutionLaneForToken(token), token).toBe("GCD_CONSUMING");
    }
  });

  it("only auto_attack has a transition contract, and it writes nothing a condition reads", () => {
    expect(armsWarriorTransitionContractFor("auto_attack")?.writes).toEqual(["OWN_PREFIX_AVAILABILITY"]);
    for (const token of ["charge", "pummel", "avatar"]) {
      expect(armsWarriorTransitionContractFor(token), token).toBeNull();
    }
  });
});

describe("missing talents stay UNKNOWN", () => {
  it("a lone-node talent absent from the tree is not NOT_SELECTED", () => {
    expect(resolveArmsWarriorTalent(WHOLE_SLAYER_BUILD, "fervor_of_battle").selection).toBe("UNKNOWN");
    expect(resolveArmsWarriorTalent(WHOLE_SLAYER_BUILD, "champions_spear").selection).toBe("UNKNOWN");
  });

  it("a choice-node talent is NOT_SELECTED only when its sibling is observed", () => {
    expect(resolveArmsWarriorTalent(entriesOf(["bladestorm"]), "ravager").selection).toBe("NOT_SELECTED");
    expect(resolveArmsWarriorTalent([], "ravager").selection).toBe("UNKNOWN");
  });

  it("an action built on a talent proven absent is background; an unresolved one never is", () => {
    const ravager = entryOf("slayer_st", "ravager");
    expect(
      resolveArmsWarriorApplicability({ talents: {}, talentsProvenAbsent: new Set(["ravager"]) }, ravager)
        .kind,
    ).toBe("NOT_APPLICABLE");
    expect(
      resolveArmsWarriorApplicability({ talents: {}, talentsProvenAbsent: new Set() }, ravager).kind,
    ).toBe("UNKNOWN");
  });

  it("a resolved tree disproves only the other tree's talents; an unresolved one nothing", () => {
    expect(armsWarriorTalentsDisprovedByHeroTree(resolveArmsWarriorHeroTree(WHOLE_SLAYER_BUILD))).toEqual([
      "demolish",
    ]);
    expect(armsWarriorTalentsDisprovedByHeroTree(resolveArmsWarriorHeroTree(WHOLE_COLOSSUS_BUILD))).toEqual([
      "slayers_dominance",
      "opportunist",
    ]);
    expect(armsWarriorTalentsDisprovedByHeroTree(resolveArmsWarriorHeroTree([]))).toEqual([]);
  });
});

describe("colossus-smash-window-fill: an observation, never a verdict", () => {
  const windowsOf = (...args: Parameters<typeof analyze>): readonly ColossusSmashWindow[] =>
    analyzed(...args).colossusSmashWindows.windows;
  const countOf = (window: ColossusSmashWindow | undefined, token: string): number | undefined =>
    window?.presses?.find((row) => row.actionToken === token)?.castCount;

  it("names the single-target lines behind the gate, read off the hero tree's own list", () => {
    const slayer = analyzed(WHOLE_SLAYER_BUILD, []).colossusSmashWindows;
    expect(slayer).toMatchObject({
      status: "OBSERVED",
      singleTargetList: "slayer_st",
      gatedTokens: ["avatar", "bladestorm"],
    });
    const colossus = analyzed(WHOLE_COLOSSUS_BUILD, []).colossusSmashWindows;
    expect(colossus).toMatchObject({
      status: "OBSERVED",
      singleTargetList: "colossus_st",
      gatedTokens: ["avatar", "demolish"],
    });
  });

  it("counts logged casts inside an established window and nothing outside it", () => {
    const windows = windowsOf(
      WHOLE_SLAYER_BUILD,
      [
        { t: 2000, ability: BLADESTORM }, // before the window
        { t: 4000, ability: AVATAR },
        { t: 5000, ability: BLADESTORM },
        { t: 6000, ability: MORTAL_STRIKE }, // inside, and not a gated line
        { t: 16000, ability: BLADESTORM }, // after the window
      ],
      [
        { t: 3000, operation: "APPLIED" },
        { t: 13000, operation: "REMOVED" },
      ],
    );
    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({ state: "ESTABLISHED", appliedAtMs: 3000, removedAtMs: 13000 });
    expect(countOf(windows[0], "avatar")).toBe(1);
    expect(countOf(windows[0], "bladestorm")).toBe(1);
    expect(windows[0]?.presses?.map((row) => row.actionToken)).toEqual(["avatar", "bladestorm"]);
  });

  it("a window nobody pressed in is an established zero, stated as such, and it is not a finding", () => {
    const analysis = analyzed(
      WHOLE_SLAYER_BUILD,
      [],
      [
        { t: 3000, operation: "APPLIED" },
        { t: 13000, operation: "REMOVED" },
      ],
    );
    expect(countOf(analysis.colossusSmashWindows.windows[0], "bladestorm")).toBe(0);
    expect(analysis.comparisons).toHaveLength(0);
    expect(analysis.coverage.rejected).toBe(0);
  });

  it("a refresh inside a window does not open another or move its start", () => {
    const windows = windowsOf(
      WHOLE_SLAYER_BUILD,
      [],
      [
        { t: 3000, operation: "APPLIED" },
        { t: 8000, operation: "REFRESHED" },
        { t: 13000, operation: "REMOVED" },
      ],
    );
    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({ appliedAtMs: 3000, removedAtMs: 13000 });
  });

  it("a missing removal never extends a window: its presses are null, not a count", () => {
    const windows = windowsOf(
      WHOLE_SLAYER_BUILD,
      [{ t: 5000, ability: BLADESTORM }],
      [{ t: 3000, operation: "APPLIED" }],
    );
    expect(windows).toEqual([
      {
        state: "NOT_ESTABLISHED",
        reason: "NO_REMOVAL_OBSERVED",
        targetActorId: BOSS,
        targetInstanceId: null,
        appliedAtMs: 3000,
        removedAtMs: null,
        presses: null,
      },
    ]);
  });

  it("a removal with no application in the evidence is stated, not counted from the pull", () => {
    const windows = windowsOf(
      WHOLE_SLAYER_BUILD,
      [{ t: 2000, ability: BLADESTORM }],
      [{ t: 3000, operation: "REMOVED" }],
    );
    expect(windows[0]).toMatchObject({ reason: "NO_APPLICATION_OBSERVED", appliedAtMs: null, presses: null });
  });

  it("partial coverage over a window refuses it, and absence of a cast there is never zero", () => {
    const partial = partialCategory([inclusiveRange(1000, 4000)]);
    const auras: readonly Aura[] = [
      { t: 3000, operation: "APPLIED" },
      { t: 13000, operation: "REMOVED" },
    ];
    expect(windowsOf(WHOLE_SLAYER_BUILD, [], auras, { CASTS: partial })[0]).toMatchObject({
      state: "NOT_ESTABLISHED",
      reason: "CAST_COVERAGE_NOT_COMPLETE",
      presses: null,
    });
    expect(windowsOf(WHOLE_SLAYER_BUILD, [], auras, { AURAS: partial })[0]).toMatchObject({
      state: "NOT_ESTABLISHED",
      reason: "CONTINUITY_NOT_ESTABLISHED",
      presses: null,
    });
  });

  const WINDOW: readonly Aura[] = [
    { t: 3000, operation: "APPLIED" },
    { t: 13000, operation: "REMOVED" },
  ];

  it("a cast category whole in range and degraded by malformed content gives no exact count", () => {
    const degraded = partialCategory([inclusiveRange(1000, END)]);
    if (degraded.capability !== "OBSERVABLE") throw new Error("unexpected");
    const malformed: CategoryEvidence = {
      ...degraded,
      coverage: { ...degraded.coverage, reason: "MALFORMED_EVENT_CONTENT" },
    };
    expect(windowsOf(WHOLE_SLAYER_BUILD, [], WINDOW, { CASTS: malformed })[0]).toMatchObject({
      state: "NOT_ESTABLISHED",
      reason: "CAST_COVERAGE_NOT_COMPLETE",
      presses: null,
    });
  });

  it("the actor's cast with no ability id could be a gated line, so the count is refused", () => {
    expect(windowsOf(WHOLE_SLAYER_BUILD, [{ t: 5000, ability: null }], WINDOW)[0]).toMatchObject({
      state: "NOT_ESTABLISHED",
      reason: "CAST_IDENTITY_NOT_ESTABLISHED",
      presses: null,
    });
  });

  it("a gated cast with no source could be the actor's, so the count is refused", () => {
    expect(
      windowsOf(WHOLE_SLAYER_BUILD, [{ t: 5000, ability: AVATAR, source: null }], WINDOW)[0],
    ).toMatchObject({
      state: "NOT_ESTABLISHED",
      reason: "CAST_IDENTITY_NOT_ESTABLISHED",
      presses: null,
    });
  });

  it("those casts outside the window, or another player's gated cast inside it, change nothing", () => {
    const windows = windowsOf(
      WHOLE_SLAYER_BUILD,
      [
        { t: 2000, ability: null },
        { t: 14000, ability: AVATAR, source: null },
        { t: 5000, ability: AVATAR, source: OTHER_PLAYER },
        { t: 5500, ability: MORTAL_STRIKE, source: null },
      ],
      WINDOW,
    );
    expect(windows[0]).toMatchObject({ state: "ESTABLISHED" });
    expect(countOf(windows[0], "avatar")).toBe(0);
  });

  it("a gated cast in the application's millisecond has no known order, so the window is not counted", () => {
    expect(windowsOf(WHOLE_SLAYER_BUILD, [{ t: 3000, ability: AVATAR }], WINDOW)[0]).toMatchObject({
      state: "NOT_ESTABLISHED",
      reason: "EDGE_ORDER_NOT_ESTABLISHED",
      presses: null,
    });
  });

  it("a gated cast in the removal's millisecond has no known order either", () => {
    expect(windowsOf(WHOLE_SLAYER_BUILD, [{ t: 13000, ability: BLADESTORM }], WINDOW)[0]).toMatchObject({
      state: "NOT_ESTABLISHED",
      reason: "EDGE_ORDER_NOT_ESTABLISHED",
      presses: null,
    });
  });

  it("an ungated cast at an edge changes nothing, and one a millisecond inside counts", () => {
    const windows = windowsOf(
      WHOLE_SLAYER_BUILD,
      [
        { t: 3000, ability: MORTAL_STRIKE },
        { t: 3001, ability: BLADESTORM },
      ],
      WINDOW,
    );
    expect(countOf(windows[0], "bladestorm")).toBe(1);
  });

  it("direction and class are read off the event: the self-buff and another player's debuff are not windows", () => {
    const windows = windowsOf(
      WHOLE_SLAYER_BUILD,
      [],
      [
        { t: 3000, operation: "APPLIED", auraClass: "BUFF", target: SOURCE },
        { t: 13000, operation: "REMOVED", auraClass: "BUFF", target: SOURCE },
        { t: 3100, operation: "APPLIED", source: OTHER_PLAYER },
        { t: 13100, operation: "REMOVED", source: OTHER_PLAYER },
      ],
    );
    expect(windows).toEqual([]);
  });

  it("each enemy has its own window, and one press lands in every window it overlaps", () => {
    const windows = windowsOf(
      WHOLE_SLAYER_BUILD,
      [{ t: 5000, ability: BLADESTORM }],
      [
        { t: 3000, operation: "APPLIED", target: BOSS },
        { t: 3001, operation: "APPLIED", target: ADD },
        { t: 13000, operation: "REMOVED", target: BOSS },
        { t: 13001, operation: "REMOVED", target: ADD },
      ],
    );
    expect(windows.map((window) => window.targetActorId)).toEqual([BOSS, ADD]);
    expect(windows.map((window) => countOf(window, "bladestorm"))).toEqual([1, 1]);
  });

  it("no hero tree, no question: the list it would ask about is not known", () => {
    const analysis = analyzed(
      [],
      [],
      [
        { t: 3000, operation: "APPLIED" },
        { t: 13000, operation: "REMOVED" },
      ],
    );
    expect(analysis.colossusSmashWindows).toEqual({ status: "HERO_TREE_NOT_RESOLVED", windows: [] });
  });
});
