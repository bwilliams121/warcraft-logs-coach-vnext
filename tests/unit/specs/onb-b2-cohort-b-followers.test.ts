/**
 * ONB-B2: Frost Death Knight and Enhancement Shaman, Cohort B's followers.
 *
 * No decision of either resolves, so the mandatory negatives are the centre of it: an open entry
 * never falls through to a lower list, an open enemy count never reads as single target, and no
 * decision becomes a MATCH or a REJECTED. Each specialization keeps its own stops, because they are
 * different: Frost's real subjects stop on Reaper's Mark's `target_if`, and Enhancement on Bloodlust.
 *
 * Synthetic on purpose. The whole-fight numbers in agent/architecture.md "ONB-B2" come from replaying
 * retained captures and are not pinned, and the archive has no room for them.
 */

import { describe, expect, it } from "vitest";

import deathKnightFrostTalents from "../../../src/data/game/deathknight-frost-talents.json";
import {
  frostDeathKnightExecutionLaneForAbility,
  frostDeathKnightExecutionLaneForToken,
  frostDeathKnightTokenByAbilityId,
  pinnedFrostDeathKnightGcdSemantics,
} from "../../../src/data/game/deathknight-frost-gcd-semantics.js";
import {
  pinnedFrostDeathKnightTalents,
  resolveFrostDeathKnightHeroTree,
  resolveFrostDeathKnightTalent,
} from "../../../src/data/game/deathknight-frost-talents.js";
import { frostDeathKnightTransitionContractFor } from "../../../src/data/game/deathknight-frost-transition-authority.js";
import shamanEnhancementTalents from "../../../src/data/game/shaman-enhancement-talents.json";
import {
  enhancementShamanExecutionLaneForAbility,
  enhancementShamanExecutionLaneForToken,
  enhancementShamanTokenByAbilityId,
  pinnedEnhancementShamanGcdSemantics,
} from "../../../src/data/game/shaman-enhancement-gcd-semantics.js";
import {
  pinnedEnhancementShamanTalents,
  resolveEnhancementShamanHeroTree,
  resolveEnhancementShamanTalent,
} from "../../../src/data/game/shaman-enhancement-talents.js";
import { enhancementShamanTransitionContractFor } from "../../../src/data/game/shaman-enhancement-transition-authority.js";
import { createCombatState } from "../../../src/engine/state/combat-state.js";
import type { CombatEvent } from "../../../src/engine/normalization/normalized-events.js";
import type { AnalyzerRegistration } from "../../../src/findings/analyzer-registration.js";
import {
  analyzerForSpec,
  internalAnalyzerForSpec,
  PRODUCTION_CATALOG,
} from "../../../src/services/analyzer-registry.js";
import { resolveSpecIdentity } from "../../../src/services/spec-identity.js";
import { aplLineKey, type AplAction, type AplAuthority } from "../../../src/simc/apl-authority.js";
import { knownNumber, unknownNumber } from "../../../src/simc/expression/evaluate.js";
import {
  lineCooldownReadinessAt,
  lineSelectionHistoryFromObservedCasts,
} from "../../../src/simc/line-cooldown.js";
import { resolveFrostDeathKnightApplicability } from "../../../src/specs/deathknight/frost/action-profile.js";
import { analyzeObservedFrostDeathKnightDecisions } from "../../../src/specs/deathknight/frost/observed-analysis.js";
import { pinnedFrostDeathKnightAuthority } from "../../../src/specs/deathknight/frost/pinned-authority.js";
import { frostDeathKnightTalentsDisprovedByHeroTree } from "../../../src/specs/deathknight/frost/resolver.js";
import { resolveEnhancementShamanApplicability } from "../../../src/specs/shaman/enhancement/action-profile.js";
import { analyzeObservedEnhancementShamanDecisions } from "../../../src/specs/shaman/enhancement/observed-analysis.js";
import { pinnedEnhancementShamanAuthority } from "../../../src/specs/shaman/enhancement/pinned-authority.js";
import { enhancementShamanTalentsDisprovedByHeroTree } from "../../../src/specs/shaman/enhancement/resolver.js";
import {
  attachedResources,
  castEvent,
  classResource,
  syntheticFight,
} from "../../support/synthetic-fight.js";

const SOURCE = 7;
const BOSS = 900;
const END = 600000;
const FIGHT_START = 1000;

type Entry = { readonly id: number; readonly nodeId: number };
type TalentRow = { readonly simcName: string; readonly traitEntryId: number; readonly traitNodeId: number };

const entriesFrom =
  (rows: readonly TalentRow[]) =>
  (names: readonly string[]): readonly Entry[] =>
    names.map((name) => {
      const row = rows.find((candidate) => candidate.simcName === name);
      if (row === undefined) throw new Error(`no pinned talent ${name}`);
      return { id: row.traitEntryId, nodeId: row.traitNodeId };
    });
const frostEntries = entriesFrom(deathKnightFrostTalents.talents);
const enhancementEntries = entriesFrom(shamanEnhancementTalents.talents);

/** The whole of each tree this data models, less one hero tree's talents. */
const FROST_BASE = [
  "obliterate",
  "howling_blast",
  "frost_strike",
  "frostscythe",
  "pillar_of_frost",
  "breath_of_sindragosa",
  "frostwyrms_fury",
  "empower_rune_weapon",
  "shattering_blade",
  "frostbound_will",
  "frostbane",
  "obliteration",
  "gathering_storm",
  "icy_onslaught",
  "killing_streak",
  "bonegrinder",
  "raise_dead",
];
const DEATHBRINGER_BUILD = frostEntries([...FROST_BASE, "reapers_mark", "deathly_blows"]);
const RIDER_BUILD = frostEntries([...FROST_BASE, "apocalypse_now"]);
const ENHANCEMENT_BASE = [
  "voltaic_blaze",
  "sundering",
  "doom_winds",
  "crash_lightning",
  "ascendance",
  "primordial_storm",
  "surging_elements",
  "feral_spirit",
  "fire_nova",
  "thorims_invocation",
  "lashing_flames",
  "elemental_tempo",
  "lava_lash",
  "chain_lightning",
];
const STORMBRINGER_BUILD = enhancementEntries([...ENHANCEMENT_BASE, "tempest"]);
const TOTEMIC_BUILD = enhancementEntries([...ENHANCEMENT_BASE, "surging_totem", "splitstream"]);

// The ids the two subjects' wire reports.
const OBLITERATE = 49020;
const FROST_STRIKE = 49143;
const EXTERMINATE = 441424;
const FROSTWYRMS_FURY_CHILD = 1265384;
const PILLAR = 51271;
const MIND_FREEZE = 47528;
const STORMSTRIKE = 17364;
const LAVA_LASH = 60103;
const LIGHTNING_BOLT = 188196;
const TEMPEST = 452201;
const BLOODLUST = 2825;
const HEROISM = 32182;
const DOOM_WINDS_DAMAGE = 469270;
const WIND_SHEAR = 57994;

interface Resources {
  readonly rune?: number;
  readonly runicPowerWire?: number;
}
interface Cast extends Resources {
  readonly t: number;
  readonly ability: number;
  /** The wire's melee flag. */
  readonly melee?: true;
}

function combatantInfo(entries: readonly Entry[]): CombatEvent {
  return {
    locator: {
      streamId: "all",
      pageOrdinal: 0,
      indexInPage: 0,
      ingestionOrdinal: 0,
      rawType: "combatantinfo",
      reportTimeMs: FIGHT_START,
    },
    ingestionOrdinal: 0,
    reportTimeMs: FIGHT_START,
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

function stateWith(entries: readonly Entry[] | null, casts: readonly Cast[]) {
  const events: CombatEvent[] = entries === null ? [] : [combatantInfo(entries)];
  let ordinal = 1;
  for (const cast of casts) {
    const pools = [
      ...(cast.rune === undefined ? [] : [classResource(5, cast.rune, { max: 6, cost: 2 })]),
      ...(cast.runicPowerWire === undefined
        ? []
        : [classResource(6, cast.runicPowerWire, { max: 1000, cost: 300 })]),
    ];
    const event = castEvent({
      ordinal: ordinal++,
      reportTimeMs: cast.t,
      sourceActorId: SOURCE,
      targetActorId: BOSS,
      abilityGameId: cast.ability,
      castPhase: "COMPLETE",
      attachedResources:
        pools.length === 0
          ? null
          : attachedResources({ side: "SOURCE", actorId: SOURCE, classResources: pools }),
    });
    events.push(cast.melee === undefined ? event : ({ ...event, isMelee: true } as CombatEvent));
  }
  return createCombatState(
    syntheticFight({ endTimeMs: END, events, observedCategories: ["AURAS", "CASTS"] }),
  );
}

function frost(entries: readonly Entry[] | null, casts: readonly Cast[]) {
  return analyzeObservedFrostDeathKnightDecisions({
    state: stateWith(entries, casts),
    actorId: SOURCE,
    specId: "deathknight/frost",
    targetActorId: null,
  });
}
function frostAnalyzed(entries: readonly Entry[] | null, casts: readonly Cast[]) {
  const analysis = frost(entries, casts);
  if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
  return analysis;
}
function enhancement(entries: readonly Entry[] | null, casts: readonly Cast[]) {
  return analyzeObservedEnhancementShamanDecisions({
    state: stateWith(entries, casts),
    actorId: SOURCE,
    specId: "shaman/enhancement",
    targetActorId: null,
  });
}
function enhancementAnalyzed(entries: readonly Entry[] | null, casts: readonly Cast[]) {
  const analysis = enhancement(entries, casts);
  if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
  return analysis;
}

function loaded(result: ReturnType<typeof pinnedFrostDeathKnightAuthority>): AplAuthority {
  if (!result.ok) throw new Error("the pinned authority did not load");
  return result.authority;
}
const frostAuthority = () => loaded(pinnedFrostDeathKnightAuthority());
const enhancementAuthority = () => loaded(pinnedEnhancementShamanAuthority());
const entryOf = (authority: AplAuthority, listName: string, token: string): AplAction => {
  const found = authority.actions.find(
    (action) => action.listName === listName && action.actionToken === token,
  );
  if (found === undefined) throw new Error(`no ${token} in ${listName}`);
  return found;
};

describe.each([
  [
    "deathknight/frost",
    "deathknight-frost-observed-decisions",
    { className: "DeathKnight", specName: "Frost" },
  ],
  [
    "shaman/enhancement",
    "shaman-enhancement-observed-decisions",
    { className: "Shaman", specName: "Enhancement" },
  ],
] as const)("the row %s", (specId, analyzerId, identity) => {
  it("is reachable by the internal lookup only, and a public identity is refused", () => {
    const row = internalAnalyzerForSpec(specId, PRODUCTION_CATALOG) as AnalyzerRegistration;
    expect(row.analyzerId).toBe(analyzerId);
    expect(row.exposure).toBe("INTERNAL_ONLY");
    expect(analyzerForSpec(specId, PRODUCTION_CATALOG)).toBeNull();
    expect(resolveSpecIdentity(identity).ok).toBe(false);
  });
});

describe("what every decision of either list does", () => {
  it("each refuses another specialization before reading anything of its own", () => {
    expect(
      analyzeObservedFrostDeathKnightDecisions({
        state: stateWith(null, []),
        actorId: SOURCE,
        specId: "shaman/enhancement",
        targetActorId: null,
      }).status,
    ).toBe("SPEC_NOT_SUPPORTED");
    expect(
      analyzeObservedEnhancementShamanDecisions({
        state: stateWith(null, []),
        actorId: SOURCE,
        specId: "deathknight/frost",
        targetActorId: null,
      }).status,
    ).toBe("SPEC_NOT_SUPPORTED");
  });

  it("a capture with no combatant info refuses as PROFILE_NOT_RESOLVED, never judges", () => {
    expect(frost(null, [{ t: 2000, ability: OBLITERATE }]).status).toBe("PROFILE_NOT_RESOLVED");
    expect(enhancement(null, [{ t: 2000, ability: STORMSTRIKE }]).status).toBe("PROFILE_NOT_RESOLVED");
  });

  it("each declares offensive authority only, and reports every other domain without it", () => {
    for (const domains of [
      frostAnalyzed(DEATHBRINGER_BUILD, []).domains,
      enhancementAnalyzed(STORMBRINGER_BUILD, []).domains,
    ]) {
      const byDomain = new Map(domains.map((result) => [result.domain, result.resolution]));
      expect(byDomain.get("OFFENSIVE_ROTATION")).toBe("AUTHORITY_AVAILABLE");
      expect(byDomain.get("INTERRUPT")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
      expect(byDomain.get("DEFENSIVE_COOLDOWN")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
      expect(byDomain.get("RESOURCE_SPENDING")).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
    }
  });

  it("no decision resolves over a whole build, and none is a confident verdict", () => {
    const CASES = [
      frostAnalyzed(DEATHBRINGER_BUILD, [
        { t: 2000, ability: OBLITERATE, rune: 6, runicPowerWire: 500 },
        { t: 3500, ability: FROST_STRIKE, runicPowerWire: 900 },
      ]),
      frostAnalyzed(RIDER_BUILD, [{ t: 2000, ability: OBLITERATE, rune: 6, runicPowerWire: 500 }]),
      enhancementAnalyzed(STORMBRINGER_BUILD, [
        { t: 2000, ability: STORMSTRIKE },
        { t: 3500, ability: LAVA_LASH },
      ]),
      enhancementAnalyzed(TOTEMIC_BUILD, [{ t: 2000, ability: STORMSTRIKE }]),
    ];
    for (const { coverage, comparisons, resolved } of CASES) {
      expect(coverage.match).toBe(0);
      expect(coverage.rejected).toBe(0);
      expect(coverage.unknown).toBe(coverage.eligibleDecisions);
      expect(coverage.eligibleDecisions).toBeGreaterThan(0);
      expect(comparisons.every((comparison) => comparison.outcome === "UNKNOWN")).toBe(true);
      expect(comparisons.every((comparison) => comparison.authorityToken === null)).toBe(true);
      expect(resolved.every((entry) => entry.selection.kind === "ROTATIONAL_GCD_UNKNOWN")).toBe(true);
    }
  });

  it("an unresolved tree closes nothing, in either list", () => {
    const frostUnresolved = frostAnalyzed([], [{ t: 2000, ability: OBLITERATE }]);
    expect(frostUnresolved.build.heroTree.state).toBe("UNKNOWN");
    expect(frostUnresolved.build.talentsProvenAbsent).toEqual([]);
    expect(frostUnresolved.coverage.unknown).toBe(1);
    const enhancementUnresolved = enhancementAnalyzed([], [{ t: 2000, ability: STORMSTRIKE }]);
    expect(enhancementUnresolved.build.heroTree.state).toBe("UNKNOWN");
    expect(enhancementUnresolved.build.talentsProvenAbsent).toEqual([]);
    expect(enhancementUnresolved.coverage.unknown).toBe(1);
  });

  it("the transition contracts cover auto_attack alone, and nothing that writes state", () => {
    expect(frostDeathKnightTransitionContractFor("auto_attack")?.writes).toEqual(["OWN_PREFIX_AVAILABILITY"]);
    expect(enhancementShamanTransitionContractFor("auto_attack")?.writes).toEqual([
      "OWN_PREFIX_AVAILABILITY",
    ]);
    for (const token of ["antimagic_shell", "pillar_of_frost", "raise_dead", "breath_of_sindragosa"]) {
      expect(frostDeathKnightTransitionContractFor(token), token).toBeNull();
    }
    for (const token of ["bloodlust", "doom_winds"]) {
      expect(enhancementShamanTransitionContractFor(token), token).toBeNull();
    }
  });

  it("a tiered node that this data does not model stays UNKNOWN, never false", () => {
    expect(resolveFrostDeathKnightTalent([], "chosen_of_frostbrood").selection).toBe("UNKNOWN");
    expect(resolveEnhancementShamanTalent([], "storm_unleashed").selection).toBe("UNKNOWN");
    expect(frostAnalyzed(DEATHBRINGER_BUILD, []).build.talentsProvenAbsent).not.toContain(
      "chosen_of_frostbrood",
    );
    expect(enhancementAnalyzed(TOTEMIC_BUILD, []).build.talentsProvenAbsent).not.toContain("storm_unleashed");
  });

  it("the pinned data of each loads, and each artifact names its own commit", () => {
    expect(pinnedFrostDeathKnightGcdSemantics().ok).toBe(true);
    expect(pinnedEnhancementShamanGcdSemantics().ok).toBe(true);
    expect(pinnedFrostDeathKnightTalents().ok).toBe(true);
    expect(pinnedEnhancementShamanTalents().ok).toBe(true);
    expect(frostAuthority().artifact.provenance.commitSha).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    expect(enhancementAuthority().artifact.provenance.commitSha).toBe(
      "33622e9d1662ff0e451691edf85a6b49cc9d11d9",
    );
  });
});

describe("Frost Death Knight", () => {
  it("a Deathbringer scan stops on Reaper's Mark's target_if, and never falls through to a rotation list", () => {
    const { selection } =
      frostAnalyzed(DEATHBRINGER_BUILD, [{ t: 2000, ability: OBLITERATE }]).resolved[0] ?? {};
    expect(selection?.stoppingPoint?.at).toBe("cooldowns[4] reapers_mark");
    expect(selection?.stoppingPoint?.atoms).toEqual(["NOT_EVALUATED:UNSUPPORTED_TARGETING"]);
    expect(selection?.dispatches.some((step) => step.calleeListName === "single_target")).toBe(false);
    expect(selection?.dispatches.some((step) => step.calleeListName === "aoe")).toBe(false);
  });

  it("a Rider tree closes Reaper's Mark, and the scan then stops on the next line, still short of a rotation list", () => {
    const analysis = frostAnalyzed(RIDER_BUILD, [{ t: 2000, ability: OBLITERATE }]);
    expect(analysis.build.talentsProvenAbsent).toContain("reapers_mark");
    const { selection } = analysis.resolved[0] ?? {};
    expect(selection?.stoppingPoint?.at).toBe("cooldowns[5] frostwyrms_fury");
    expect(selection?.stoppingPoint?.atoms[0]).toContain("TOO_MANY_UNRESOLVED_ATOMS");
    expect(selection?.dispatches.some((step) => step.calleeListName === "single_target")).toBe(false);
    expect(selection?.dispatches.some((step) => step.calleeListName === "aoe")).toBe(false);
  });

  it("off-GCD lines with no contract stay open before the stop, and none of them is a selection", () => {
    const { selection } =
      frostAnalyzed(DEATHBRINGER_BUILD, [{ t: 2000, ability: OBLITERATE }]).resolved[0] ?? {};
    const candidates = selection?.undecidedCandidates ?? [];
    expect(candidates.map((step) => step.at)).toEqual(
      expect.arrayContaining([
        "high_prio_actions[2] antimagic_shell",
        "cooldowns[0] remorseless_winter",
        "cooldowns[1] pillar_of_frost",
      ]),
    );
    expect(selection?.blockedAt).toBe("default[0] auto_attack");
  });

  it("each hero tree proves only the other tree's talents absent", () => {
    const entries = (names: readonly string[]) => names.map((name) => frostEntries([name])[0] as Entry);
    const deathbringer = resolveFrostDeathKnightHeroTree(entries(["reapers_mark"]));
    const rider = resolveFrostDeathKnightHeroTree(entries(["apocalypse_now"]));
    expect(frostDeathKnightTalentsDisprovedByHeroTree(deathbringer)).toEqual(["apocalypse_now"]);
    expect(frostDeathKnightTalentsDisprovedByHeroTree(rider)).toEqual(["reapers_mark", "deathly_blows"]);
    expect(frostDeathKnightTalentsDisprovedByHeroTree(resolveFrostDeathKnightHeroTree([]))).toEqual([]);
  });

  it("Mind Freeze's list line cannot be selected on any build, because the pinned module never builds it", () => {
    const line = entryOf(frostAuthority(), "high_prio_actions", "mind_freeze");
    for (const facts of [
      { talents: {}, talentsProvenAbsent: new Set<string>() },
      { talents: { raise_dead: { selection: "SELECTED" } }, talentsProvenAbsent: new Set<string>() },
    ] as Parameters<typeof resolveFrostDeathKnightApplicability>[0][]) {
      expect(resolveFrostDeathKnightApplicability(facts, line).kind).toBe("NOT_APPLICABLE");
    }
    // ...while a logged Mind Freeze is excluded as off-GCD, and never judged.
    const analysis = frostAnalyzed(DEATHBRINGER_BUILD, [{ t: 2000, ability: MIND_FREEZE }]);
    expect(analysis.coverage.eligibleDecisions).toBe(0);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual(["NON_GCD_ACTION"]);
  });

  it("an unknown talent never closes an action it builds", () => {
    const line = entryOf(frostAuthority(), "single_target", "obliterate");
    expect(
      resolveFrostDeathKnightApplicability({ talents: {}, talentsProvenAbsent: new Set<string>() }, line)
        .kind,
    ).toBe("UNKNOWN");
  });

  it("reads Runes and Runic Power from the cast's own observation, in SimulationCraft's units, and never zero without one", () => {
    const withBoth = frostAnalyzed(DEATHBRINGER_BUILD, [
      { t: 2000, ability: OBLITERATE, rune: 4, runicPowerWire: 700 },
    ]).resolved[0]?.diagnostics;
    expect(withBoth?.rune).toEqual(knownNumber(4));
    expect(withBoth?.runicPower).toEqual(knownNumber(70));
    expect(withBoth?.runicPowerDeficit).toEqual(knownNumber(30));
    const without = frostAnalyzed(DEATHBRINGER_BUILD, [{ t: 2000, ability: OBLITERATE }]).resolved[0]
      ?.diagnostics;
    expect(without?.rune).toEqual(unknownNumber("STATE_NOT_ESTABLISHED"));
    expect(without?.runicPower).toEqual(unknownNumber("STATE_NOT_ESTABLISHED"));
    expect(without?.runicPowerDeficit).toEqual(unknownNumber("STATE_NOT_ESTABLISHED"));
  });

  it("a full Runic Power value decides nothing past the stop", () => {
    const { coverage, comparisons } = frostAnalyzed(DEATHBRINGER_BUILD, [
      { t: 2000, ability: FROST_STRIKE, rune: 6, runicPowerWire: 1000 },
    ]);
    expect(coverage.unknown).toBe(1);
    expect(comparisons[0]?.authorityToken).toBeNull();
  });

  it("the numeric react reads the pinned list as a stack count, never as a boolean", () => {
    // `buff.killing_machine.react=2`: the M11-D1 reading is ONE_OF {0..s} from an exact stack. No
    // aura is bound here, so the comparison stays unresolved rather than false in every world.
    const line = entryOf(frostAuthority(), "single_target", "obliterate");
    expect(line.conditionRaw).toContain("buff.killing_machine.react=2");
  });

  it("the ids the log reports and no action builds have no token, and are excluded rather than judged", () => {
    const analysis = frostAnalyzed(DEATHBRINGER_BUILD, [
      { t: 2000, ability: EXTERMINATE },
      { t: 3000, ability: FROSTWYRMS_FURY_CHILD },
    ]);
    expect(analysis.coverage.eligibleDecisions).toBe(0);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual([
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "EXECUTION_LANE_NOT_ESTABLISHED",
    ]);
    expect(frostDeathKnightTokenByAbilityId().has(EXTERMINATE)).toBe(false);
    expect(frostDeathKnightTokenByAbilityId().has(FROSTWYRMS_FURY_CHILD)).toBe(false);
  });

  it("the lanes are the pinned records'", () => {
    expect(frostDeathKnightExecutionLaneForAbility(OBLITERATE)).toBe("GCD_CONSUMING");
    expect(frostDeathKnightExecutionLaneForAbility(PILLAR)).toBe("NON_GCD");
    expect(frostDeathKnightExecutionLaneForAbility(EXTERMINATE)).toBe("UNKNOWN_LANE");
    expect(frostDeathKnightExecutionLaneForToken("empower_rune_weapon")).toBe("GCD_CONSUMING");
    expect(frostDeathKnightExecutionLaneForToken("auto_attack")).toBe("NON_GCD");
  });

  it("melee swings are excluded, not decisions", () => {
    const analysis = frostAnalyzed(DEATHBRINGER_BUILD, [{ t: 2000, ability: 1, melee: true }]);
    expect(analysis.coverage.eligibleDecisions).toBe(0);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual(["MELEE_SWING"]);
  });
});

describe("Enhancement Shaman", () => {
  it("its list has no Wind Shear line, and Bloodlust's line carries its options", () => {
    const authority = enhancementAuthority();
    expect(authority.actions.some((action) => action.actionToken === "wind_shear")).toBe(false);
    const line = entryOf(authority, "default", "bloodlust");
    expect(line.actionStringVerbatim).toBe("bloodlust,line_cd=600");
    expect(line.priorityOrdinal).toBe(4);
    expect(authority.artifact.provenance.spellGatedActions?.map((form) => form.emitted)).toEqual([
      "bloodlust,line_cd=600",
      null,
    ]);
    expect(authority.artifact.provenance.methodPrologue?.appliesWhen).toBe(
      "main_hand_weapon.type != WEAPON_NONE",
    );
    expect(enhancementShamanTokenByAbilityId().has(WIND_SHEAR)).toBe(false);
  });

  it("every scan stops on Bloodlust's line timer, reads it as UNKNOWN, and never reaches a rotation list", () => {
    const { selection } =
      enhancementAnalyzed(STORMBRINGER_BUILD, [{ t: 2000, ability: STORMSTRIKE }]).resolved[0] ?? {};
    expect(selection?.blockedAt).toBe("default[4] bloodlust");
    expect(selection?.stoppingPoint?.at).toBe("default[6] call_action_list");
    expect(selection?.stoppingPoint?.atoms).toEqual(["active_enemies"]);
    const bloodlust = selection?.undecidedCandidates.find((step) => step.actionToken === "bloodlust");
    expect(bloodlust?.at).toBe("default[4] bloodlust");
    expect(bloodlust?.lane).toBe("NON_GCD");
    expect(bloodlust?.atoms).toEqual(["LINE_CD:SELECTION_COVERAGE_NOT_PROVEN"]);
  });

  it("an observed Bloodlust attributes to its sole entry, and that still proves the timer neither running nor idle", () => {
    const authority = enhancementAuthority();
    const line = entryOf(authority, "default", "bloodlust");
    const lineKey = aplLineKey(line);
    const history = lineSelectionHistoryFromObservedCasts({
      authority,
      combatStartMs: FIGHT_START,
      observedCastCoverage: { fromMs: FIGHT_START, toMs: END },
      casts: [{ actionToken: "bloodlust", observedAtMs: 2000 }],
    });
    // It is the sole in-combat entry of the token, so the selection is attributed, not ambiguous.
    expect(history.selectionsOf(lineKey).attributed).toEqual([
      { selectedAtLeastMs: null, selectedAtMostMs: 2000 },
    ]);
    expect(history.selectionsOf(lineKey).ambiguous).toEqual([]);
    // The decision right after the cast: a cast only bounds a selection from above.
    expect(
      lineCooldownReadinessAt({
        durationMs: 600000,
        decisionTimeMs: 3000,
        lineKey: lineKey,
        history,
      }).kind,
    ).toBe("UNKNOWN");
    const analysis = enhancementAnalyzed(STORMBRINGER_BUILD, [
      { t: 2000, ability: BLOODLUST },
      { t: 3000, ability: STORMSTRIKE },
    ]);
    expect(analysis.excluded.map((cast) => [cast.abilityGameId, cast.reason])).toEqual([
      [BLOODLUST, "NON_GCD_ACTION"],
    ]);
    const after = analysis.resolved[0]?.selection.undecidedCandidates.find(
      (step) => step.actionToken === "bloodlust",
    );
    expect(after?.atoms).toEqual(["LINE_CD:SELECTION_COVERAGE_NOT_PROVEN"]);
    expect(analysis.coverage.unknown).toBe(1);
  });

  it("the single-target lists sit behind the enemy count, and the open gate is never single target", () => {
    const authority = enhancementAuthority();
    expect(entryOf(authority, "default", "call_action_list").conditionRaw).toBe(
      "active_enemies=1&!talent.surging_totem.enabled",
    );
    const { selection } =
      enhancementAnalyzed(TOTEMIC_BUILD, [{ t: 2000, ability: STORMSTRIKE }]).resolved[0] ?? {};
    // Surging Totem closes the Stormbringer list; it does not open the Totemic one, whose gate also reads the count.
    expect(selection?.dispatches.find((step) => step.calleeListName === "single_sb")?.gate).toBe("FALSE");
    const totemic = selection?.dispatches.find((step) => step.calleeListName === "single_totemic");
    expect(totemic?.gate).toBe("UNKNOWN_STATE");
    expect(totemic?.outcome).toBe("BLOCKED");
    expect(selection?.stoppingPoint?.at).toBe("default[7] call_action_list");
    expect(selection?.dispatches.some((step) => step.calleeListName === "aoe")).toBe(false);
  });

  it("each hero tree proves only the other tree's talents absent", () => {
    const stormbringer = resolveEnhancementShamanHeroTree(enhancementEntries(["tempest"]));
    const totemic = resolveEnhancementShamanHeroTree(enhancementEntries(["surging_totem"]));
    expect(enhancementShamanTalentsDisprovedByHeroTree(stormbringer)).toEqual([
      "surging_totem",
      "splitstream",
    ]);
    expect(enhancementShamanTalentsDisprovedByHeroTree(totemic)).toEqual(["tempest"]);
    expect(enhancementShamanTalentsDisprovedByHeroTree(resolveEnhancementShamanHeroTree([]))).toEqual([]);
  });

  it("Ascendance and Deeply Rooted Elements share a choice node, so one's sibling proves the other not taken", () => {
    const ascendance = enhancementEntries(["ascendance"]);
    expect(resolveEnhancementShamanTalent(ascendance, "ascendance").selection).toBe("SELECTED");
    expect(resolveEnhancementShamanTalent(ascendance, "deeply_rooted_elements").selection).toBe(
      "NOT_SELECTED",
    );
    expect(resolveEnhancementShamanTalent([], "deeply_rooted_elements").selection).toBe("UNKNOWN");
  });

  it("an absent lone-node talent stays UNKNOWN and closes nothing it builds", () => {
    expect(resolveEnhancementShamanTalent(enhancementEntries(["ascendance"]), "lava_lash").selection).toBe(
      "UNKNOWN",
    );
    const line = entryOf(enhancementAuthority(), "single_sb", "lava_lash");
    expect(
      resolveEnhancementShamanApplicability({ talents: {}, talentsProvenAbsent: new Set<string>() }, line)
        .kind,
    ).toBe("UNKNOWN");
  });

  it("a logged Doom Winds damage child and a logged Heroism have no token, so neither is judged", () => {
    const analysis = enhancementAnalyzed(STORMBRINGER_BUILD, [
      { t: 2000, ability: DOOM_WINDS_DAMAGE },
      { t: 3000, ability: HEROISM },
    ]);
    expect(analysis.coverage.eligibleDecisions).toBe(0);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual([
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "EXECUTION_LANE_NOT_ESTABLISHED",
    ]);
    expect(enhancementShamanTokenByAbilityId().get(384352)).toBe("doom_winds");
    expect(enhancementShamanTokenByAbilityId().has(DOOM_WINDS_DAMAGE)).toBe(false);
    expect(enhancementShamanTokenByAbilityId().has(HEROISM)).toBe(false);
  });

  it("a cast-time action is excluded, because this facade would read it at the wrong moment", () => {
    const analysis = enhancementAnalyzed(STORMBRINGER_BUILD, [
      { t: 2000, ability: LIGHTNING_BOLT },
      { t: 4000, ability: TEMPEST },
    ]);
    expect(analysis.coverage.eligibleDecisions).toBe(0);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual([
      "OUTSIDE_FIRST_SLICE",
      "OUTSIDE_FIRST_SLICE",
    ]);
  });

  it("Flame Shock binds the class row that gives it a GCD, not the zero-GCD record the action is built on", () => {
    expect(enhancementShamanExecutionLaneForToken("flame_shock")).toBe("GCD_CONSUMING");
    expect(enhancementShamanTokenByAbilityId().get(470411)).toBe("flame_shock");
    expect(enhancementShamanExecutionLaneForAbility(188389)).toBe("UNKNOWN_LANE");
  });

  it("the off-GCD actions of the list read NON_GCD, and an imbue reads nothing", () => {
    expect(enhancementShamanExecutionLaneForToken("bloodlust")).toBe("NON_GCD");
    expect(enhancementShamanExecutionLaneForToken("doom_winds")).toBe("NON_GCD");
    expect(enhancementShamanExecutionLaneForToken("windfury_weapon")).toBe("UNKNOWN_LANE");
  });
});
