/**
 * ONB-X3: Vengeance Demon Hunter, its own representative, a tank.
 *
 * No decision resolves and no retained capture holds one of its events, so the mandatory negatives are the centre of it:
 * a tank's mitigation is never judged by the offensive list, an open enemy count never reads as single target, a variable
 * the parser refuses never reads as zero, a missing talent never reads as false, and Fury at its maximum never reads as waste.
 *
 * Synthetic throughout, because nothing real exists to replay (agent/architecture.md "ONB-X3").
 */

import { describe, expect, it } from "vitest";

import vengeanceTalents from "../../../src/data/game/demonhunter-vengeance-talents.json";
import {
  pinnedVengeanceDemonHunterGcdSemantics,
  vengeanceDemonHunterBaseGcdMsForAbility,
  vengeanceDemonHunterExecutionLaneForAbility,
  vengeanceDemonHunterExecutionLaneForToken,
  vengeanceDemonHunterTokenByAbilityId,
} from "../../../src/data/game/demonhunter-vengeance-gcd-semantics.js";
import {
  pinnedVengeanceDemonHunterTalents,
  resolveVengeanceDemonHunterHeroTree,
  resolveVengeanceDemonHunterTalent,
} from "../../../src/data/game/demonhunter-vengeance-talents.js";
import { vengeanceDemonHunterTransitionContractFor } from "../../../src/data/game/demonhunter-vengeance-transition-authority.js";
import { createCombatState } from "../../../src/engine/state/combat-state.js";
import type { CombatEvent } from "../../../src/engine/normalization/normalized-events.js";
import type { AnalyzerRegistration } from "../../../src/findings/analyzer-registration.js";
import {
  analyzerForSpec,
  internalAnalyzerForSpec,
  PRODUCTION_CATALOG,
} from "../../../src/services/analyzer-registry.js";
import { resolveSpecIdentity } from "../../../src/services/spec-identity.js";
import type { AplAction, AplAuthority } from "../../../src/simc/apl-authority.js";
import { knownNumber, unknownNumber, type AtomBindings } from "../../../src/simc/expression/evaluate.js";
import { parseSimcExpression } from "../../../src/simc/expression/parse.js";
import { nonDomainCategoryOf } from "../../../src/simc/non-domain-tokens.js";
import { resolveVengeanceDemonHunterApplicability } from "../../../src/specs/demonhunter/vengeance/action-profile.js";
import { vengeanceDemonHunterFirstGcdSelectionAt } from "../../../src/specs/demonhunter/vengeance/first-gcd-adapter.js";
import { analyzeObservedVengeanceDemonHunterDecisions } from "../../../src/specs/demonhunter/vengeance/observed-analysis.js";
import { pinnedVengeanceDemonHunterAuthority } from "../../../src/specs/demonhunter/vengeance/pinned-authority.js";
import {
  resolveVengeanceDemonHunterAtoms,
  vengeanceDemonHunterTalentsDisprovedByHeroTree,
} from "../../../src/specs/demonhunter/vengeance/resolver.js";
import { VENGEANCE_DEMON_HUNTER_ATOM_VOCABULARY } from "../../../src/specs/demonhunter/vengeance/vocabulary.js";
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

function entries(names: readonly string[]): readonly Entry[] {
  return names.map((name) => {
    const row = vengeanceTalents.talents.find((candidate) => candidate.simcName === name);
    if (row === undefined) throw new Error(`no pinned talent ${name}`);
    return { id: row.traitEntryId, nodeId: row.traitNodeId };
  });
}

/** An Annihilator entry the list does not name: the tree's own membership resolves the hero tree. */
function annihilatorEntry(): Entry {
  const tree = vengeanceTalents.heroTrees.find((candidate) => candidate.simcName === "annihilator");
  const first = tree?.entries[0];
  if (first === undefined) throw new Error("no Annihilator entry");
  return { id: first.traitEntryId, nodeId: first.traitNodeId };
}

const BASE = [
  "fel_devastation",
  "fiery_brand",
  "spirit_bomb",
  "sigil_of_spite",
  "felblade",
  "vengeful_retreat",
  "soul_carver",
  "fiery_demise",
];
const ALDRACHI = entries([...BASE, "art_of_the_glaive", "unhindered_assault"]);
const ANNIHILATOR = [...entries(BASE), annihilatorEntry()];

// The pinned rows.
const FRACTURE = 263642;
const SOUL_CLEAVE = 228477;
const SPIRIT_BOMB = 247454;
const FIERY_BRAND = 204021;
const FEL_DEVASTATION = 212084;
const DEMON_SPIKES = 203720;
const METAMORPHOSIS = 187827;
const INFERNAL_STRIKE = 189110;
const DISRUPT = 183752;
const VENGEFUL_RETREAT = 198793;
const REAVERS_GLAIVE = 1283344;
const HAVOC_REAVERS_GLAIVE = 442294;
const POTION = 1236994;

interface Cast {
  readonly t: number;
  readonly ability: number;
  readonly fury?: number;
  readonly melee?: true;
}

function combatantInfo(tree: readonly Entry[]): CombatEvent {
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
      talentTree: tree.map((entry) => ({ id: entry.id, rank: 1, nodeId: entry.nodeId })),
    },
  } as unknown as CombatEvent;
}

function stateWith(tree: readonly Entry[] | null, casts: readonly Cast[]) {
  const events: CombatEvent[] = tree === null ? [] : [combatantInfo(tree)];
  let ordinal = 1;
  for (const cast of casts) {
    const event = castEvent({
      ordinal: ordinal++,
      reportTimeMs: cast.t,
      sourceActorId: SOURCE,
      targetActorId: BOSS,
      abilityGameId: cast.ability,
      castPhase: "COMPLETE",
      attachedResources:
        cast.fury === undefined
          ? null
          : attachedResources({
              side: "SOURCE",
              actorId: SOURCE,
              classResources: [classResource(17, cast.fury, { max: 120, cost: 30 })],
            }),
    });
    events.push(cast.melee === undefined ? event : ({ ...event, isMelee: true } as CombatEvent));
  }
  return createCombatState(
    syntheticFight({ endTimeMs: END, events, observedCategories: ["AURAS", "CASTS", "RESOURCES"] }),
  );
}

function analyzed(tree: readonly Entry[] | null, casts: readonly Cast[]) {
  const analysis = analyzeObservedVengeanceDemonHunterDecisions({
    state: stateWith(tree, casts),
    actorId: SOURCE,
    specId: "demonhunter/vengeance",
    targetActorId: null,
  });
  if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
  return analysis;
}

function authority(): AplAuthority {
  const result = pinnedVengeanceDemonHunterAuthority();
  if (!result.ok) throw new Error("the pinned authority did not load");
  return result.authority;
}

/**
 * A query with values this slice never has. Only a test can look behind the list's first refusals this way, and that
 * is the point: it shows what each line does when something finally reaches it.
 */
function queryGiven(input: {
  readonly tree: readonly Entry[];
  readonly magnitudes?: Readonly<Record<string, number>>;
  readonly truths?: Readonly<Record<string, boolean>>;
  readonly knownBuffs?: AtomBindings["knownBuffs"];
}) {
  const talents = Object.fromEntries(
    vengeanceTalents.talents.map((talent) => [
      talent.simcName,
      resolveVengeanceDemonHunterTalent(input.tree, talent.simcName),
    ]),
  );
  const heroTree = resolveVengeanceDemonHunterHeroTree(input.tree);
  const talentsProvenAbsent = new Set<string>(vengeanceDemonHunterTalentsDisprovedByHeroTree(heroTree));
  for (const [name, talent] of Object.entries(talents)) {
    if (talent.selection === "NOT_SELECTED") talentsProvenAbsent.add(name);
  }
  const resolution = resolveVengeanceDemonHunterAtoms({
    heroTree,
    talents,
    talentsProvenAbsent,
    fury: unknownNumber("STATE_NOT_ESTABLISHED"),
  });
  const magnitudes = input.magnitudes ?? {};
  const bound = resolution.specAtoms.bound.map((binding) => {
    const given = magnitudes[binding.key];
    return given === undefined
      ? binding
      : { ...binding, value: { kind: "MAGNITUDE" as const, binding: knownNumber(given) } };
  });
  for (const [key, value] of Object.entries(input.truths ?? {})) {
    bound.push({ key, actionToken: null, value: { kind: "TRUTH", value } });
  }
  const knownTalents = Object.entries(talents).flatMap(([name, talent]) =>
    talent.selection === "SELECTED"
      ? [{ name, taken: true }]
      : talentsProvenAbsent.has(name)
        ? [{ name, taken: false }]
        : [],
  );
  const bindings: AtomBindings = {
    comboPoints: unknownNumber("STATE_NOT_MODELLED"),
    comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
    energyPct: unknownNumber("STATE_NOT_MODELLED"),
    knownBuffs: input.knownBuffs ?? [],
    knownTalents,
    knownCooldownRemainsSeconds: [],
    specAtoms: { ...resolution.specAtoms, bound },
  };
  return vengeanceDemonHunterFirstGcdSelectionAt({
    authority: authority(),
    bindings,
    buildFacts: { talents, talentsProvenAbsent },
    observedAbilityGameId: FRACTURE,
  });
}

describe("the row demonhunter/vengeance", () => {
  it("is reachable by the internal lookup only, and a public identity is refused", () => {
    const row = internalAnalyzerForSpec("demonhunter/vengeance", PRODUCTION_CATALOG) as AnalyzerRegistration;
    expect(row.analyzerId).toBe("demonhunter-vengeance-observed-decisions");
    expect(row.exposure).toBe("INTERNAL_ONLY");
    expect(analyzerForSpec("demonhunter/vengeance", PRODUCTION_CATALOG)).toBeNull();
    expect(resolveSpecIdentity({ className: "DemonHunter", specName: "Vengeance" }).ok).toBe(false);
  });

  it("refuses another specialization before reading anything of its own", () => {
    expect(
      analyzeObservedVengeanceDemonHunterDecisions({
        state: stateWith(null, []),
        actorId: SOURCE,
        specId: "demonhunter/havoc",
        targetActorId: null,
      }).status,
    ).toBe("SPEC_NOT_SUPPORTED");
  });

  it("a capture with no combatant info refuses as PROFILE_NOT_RESOLVED, never judges", () => {
    expect(
      analyzeObservedVengeanceDemonHunterDecisions({
        state: stateWith(null, [{ t: 2000, ability: FRACTURE }]),
        actorId: SOURCE,
        specId: "demonhunter/vengeance",
        targetActorId: null,
      }).status,
    ).toBe("PROFILE_NOT_RESOLVED");
  });

  it("every pinned dataset loads, and the list names its own commit", () => {
    expect(pinnedVengeanceDemonHunterGcdSemantics().ok).toBe(true);
    expect(pinnedVengeanceDemonHunterTalents().ok).toBe(true);
    expect(authority().artifact.provenance.commitSha).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    expect(authority().artifact.authorityId).toBe("SIMC_APL_DEMONHUNTER_VENGEANCE");
  });

  it("every in-domain line condition parses whole, so a refusal there is about state and not spelling", () => {
    const refused: string[] = [];
    for (const action of authority().actions) {
      if (action.listName === "precombat" || action.conditionRaw === null) continue;
      if (nonDomainCategoryOf(action.actionToken) !== null) continue;
      const parsed = parseSimcExpression(action.conditionRaw, VENGEANCE_DEMON_HUNTER_ATOM_VOCABULARY);
      if (!parsed.ok) refused.push(`${action.listName}[${String(action.priorityOrdinal)}]`);
    }
    expect(refused).toEqual([]);
  });
});

describe("a tank's meaning stays separate from offense", () => {
  it("the offensive authority governs one domain, and every tank domain resolves without it", () => {
    const { domains } = analyzed(ALDRACHI, []);
    const byDomain = new Map(domains.map((result) => [result.domain, result.resolution]));
    expect(byDomain.get("OFFENSIVE_ROTATION")).toBe("AUTHORITY_AVAILABLE");
    for (const domain of [
      "ACTIVE_MITIGATION",
      "DEFENSIVE_COOLDOWN",
      "SELF_HEALING",
      "RESOURCE_SPENDING",
      "INTERRUPT",
    ] as const) {
      expect(byDomain.get(domain), domain).toBe("NO_PINNED_AUTHORITY_FOR_DOMAIN");
      const row = domains.find((result) => result.domain === domain);
      expect(row && "offensiveAuthorityGoverns" in row ? row.offensiveAuthorityGoverns : null).toBe(false);
    }
  });

  it("a press of Demon Spikes, Metamorphosis, Infernal Strike or Disrupt is excluded, and never a decision", () => {
    const analysis = analyzed(ALDRACHI, [
      { t: 2000, ability: DEMON_SPIKES },
      { t: 3000, ability: METAMORPHOSIS },
      { t: 4000, ability: INFERNAL_STRIKE },
      { t: 5000, ability: DISRUPT },
    ]);
    expect(analysis.coverage.eligibleDecisions).toBe(0);
    expect(analysis.comparisons).toEqual([]);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual([
      "NON_GCD_ACTION",
      "NON_GCD_ACTION",
      "NON_GCD_ACTION",
      "NON_GCD_ACTION",
    ]);
  });

  it("Demon Spikes being down and available is never a claim the tank should have pressed it", () => {
    // Its line only ever keeps a scan open: the press is not selected, and no decision blames its absence.
    const given = queryGiven({
      tree: ALDRACHI,
      truths: { in_combat: true, "target.debuff.casting.react": false },
      knownBuffs: [{ name: "demon_spikes", up: false }],
    });
    expect(given.result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    const line = given.rootScan.undecidedCandidates.find((step) => step.at === "default[20] demon_spikes");
    expect(line?.lane).toBe("NON_GCD");
    expect(line?.atoms).toEqual(["USABILITY:demon_spikes"]);
    expect(vengeanceDemonHunterTransitionContractFor("demon_spikes")).toBeNull();
    const { comparisons } = analyzed(ALDRACHI, [{ t: 2000, ability: FRACTURE }]);
    expect(comparisons.map((comparison) => comparison.outcome)).toEqual(["UNKNOWN"]);
  });

  it("a Fiery Brand or a Soul Cleave is a rotational press with no verdict, whatever it took or healed", () => {
    const { comparisons } = analyzed(ALDRACHI, [
      { t: 2000, ability: FIERY_BRAND },
      { t: 3500, ability: SOUL_CLEAVE, fury: 60 },
    ]);
    expect(comparisons.map((comparison) => comparison.decision.observedToken)).toEqual([
      "fiery_brand",
      "soul_cleave",
    ]);
    expect(comparisons.every((comparison) => comparison.outcome === "UNKNOWN")).toBe(true);
  });
});

describe("what no decision does", () => {
  it("over any build, no decision resolves and none is a confident verdict", () => {
    const CASES = [
      analyzed(ALDRACHI, [
        { t: 2000, ability: FRACTURE, fury: 40 },
        { t: 3500, ability: SPIRIT_BOMB, fury: 80 },
        { t: 5000, ability: REAVERS_GLAIVE },
      ]),
      analyzed(ANNIHILATOR, [{ t: 2000, ability: FRACTURE }]),
      analyzed([], [{ t: 2000, ability: FRACTURE }]),
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

  it("every build's query refuses first at the swing's entry, with Disrupt open behind it", () => {
    for (const tree of [ALDRACHI, ANNIHILATOR, []]) {
      const { selection } = analyzed(tree, [{ t: 2000, ability: FRACTURE }]).resolved[0] ?? {};
      expect(selection?.blockedAt).toBe("default[16] auto_attack");
      const disrupt = selection?.undecidedCandidates.find((step) => step.at === "default[18] disrupt");
      expect(disrupt?.atoms).toEqual(["target.debuff.casting.react"]);
      expect(disrupt?.lane).toBe("NON_GCD");
    }
  });

  it("an Aldrachi Reaver root scan enters its list and stops at the unconditional fillers", () => {
    const { selection } = analyzed(ALDRACHI, [{ t: 2000, ability: FRACTURE }]).resolved[0] ?? {};
    const gates = new Map(selection?.dispatches.map((step) => [step.calleeListName, step.gate]));
    expect(gates.get("ar")).toBe("TRUE");
    expect(gates.has("anni")).toBe(false);
    expect(selection?.stoppingPoint?.at).toBe("ar[59] call_action_list");
  });

  it("an Annihilator root scan enters its own list, and the Voidfall gate stays open", () => {
    const { selection } = analyzed(ANNIHILATOR, [{ t: 2000, ability: FRACTURE }]).resolved[0] ?? {};
    const gates = new Map(selection?.dispatches.map((step) => [step.calleeListName, step.gate]));
    expect(gates.get("ar")).toBe("FALSE");
    expect(gates.get("anni")).toBe("TRUE");
    expect(gates.get("anni_voidfall_spending")).toBe("UNKNOWN_STATE");
    expect(selection?.stoppingPoint?.at).toBe("anni_voidfall_spending[11] call_action_list");
  });

  it("an unresolved tree closes nothing: neither hero list is chosen", () => {
    const analysis = analyzed([], [{ t: 2000, ability: FRACTURE }]);
    expect(analysis.build.heroTree.state).toBe("UNKNOWN");
    expect(analysis.build.talentsProvenAbsent).toEqual([]);
    const { selection } = analysis.resolved[0] ?? {};
    expect(selection?.stoppingPoint?.at).toBe("default[21] run_action_list");
    expect(selection?.stoppingPoint?.atoms).toEqual(["hero_tree.aldrachi_reaver"]);
  });

  it("the enemy count alone moves nothing: given one target, every line above still refuses", () => {
    const { result, rootScan } = queryGiven({
      tree: ALDRACHI,
      magnitudes: { "spell_targets.spirit_bomb": 1 },
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    expect(rootScan.undecidedCandidates.map((step) => step.at)).toEqual(
      expect.arrayContaining(["default[16] auto_attack", "default[18] disrupt", "default[20] demon_spikes"]),
    );
  });

  it("the off-GCD lines have no contract, so an open one can never fire and move on", () => {
    for (const token of [
      "disrupt",
      "infernal_strike",
      "demon_spikes",
      "metamorphosis",
      "vengeful_retreat",
      "fracture",
    ]) {
      expect(vengeanceDemonHunterTransitionContractFor(token), token).toBeNull();
    }
    expect(vengeanceDemonHunterTransitionContractFor("auto_attack")?.writes).toEqual([
      "OWN_PREFIX_AVAILABILITY",
    ]);
  });
});

describe("the in-combat variable programme", () => {
  const variableLines = (list: string, name: string): readonly AplAction[] =>
    authority().actions.filter(
      (action) =>
        action.listName === list &&
        action.actionToken === "variable" &&
        action.actionStringVerbatim.includes(`name=${name},`),
    );
  const valueOf = (line: AplAction | undefined): string =>
    /,value=([^,]*)/.exec(line?.actionStringVerbatim ?? "")?.[1] ?? "";

  it("combines % and ceil over charges, as pinned, and the % refuses to parse", () => {
    const [assign, ceil] = variableLines("ar", "fracs_base");
    expect(assign?.actionStringVerbatim).toBe(
      "variable,name=fracs_base,value=variable.base_deficit%variable.frac_souls",
    );
    expect(ceil?.actionStringVerbatim).toBe("variable,name=fracs_base,op=ceil");
    const parsed = parseSimcExpression(valueOf(assign), VENGEANCE_DEMON_HUNTER_ATOM_VOCABULARY);
    expect(parsed.ok).toBe(false);
    expect(valueOf(variableLines("ar", "base_gen_time")[0])).toContain("cooldown.fracture.charges");
  });

  it("every value the parser refuses is a % or a trinket, and none is read as zero", () => {
    const refused: string[] = [];
    for (const action of authority().actions) {
      if (action.actionToken !== "variable" && action.actionToken !== "cycling_variable") continue;
      const value = valueOf(action);
      if (value === "" || parseSimcExpression(value, VENGEANCE_DEMON_HUNTER_ATOM_VOCABULARY).ok) continue;
      refused.push(`${action.listName}[${String(action.priorityOrdinal)}]`);
      expect(/%|trinket\./.test(value), value).toBe(true);
    }
    expect(refused).toEqual([
      "default[9]",
      "default[10]",
      "ar[4]",
      "ar[9]",
      "ar[14]",
      "ar[18]",
      "ar[20]",
      "ar[26]",
      "ar[30]",
      "ar[32]",
      "ar[36]",
    ]);
  });

  it("given every input the programme reads, time_to_next_glaive stays open, never zero", () => {
    const { rootScan } = queryGiven({
      tree: ALDRACHI,
      magnitudes: {
        "spell_targets.spirit_bomb": 1,
        soul_fragments: 2,
        "soul_fragments.total": 2,
        "gcd.max": 1.5,
        "cooldown.fracture.charges": 1,
        "cooldown.fracture.duration": 4.5,
        "apex.2": 0,
        "apex.3": 0,
      },
    });
    const line = rootScan.undecidedCandidates.find((step) => step.at === "ar_fillers[1] immolation_aura");
    expect(line?.atoms).toContain("variable.time_to_next_glaive");
  });

  it("the dungeon pull's cycling variable and the fight-end guess never decide anything", () => {
    expect(authority().actions.map((action) => action.actionStringVerbatim)).toEqual(
      expect.arrayContaining([
        "cycling_variable,name=dung_pull_ttd,op=max,value=target.time_to_die",
        "variable,name=execute,value=fight_remains<20",
      ]),
    );
    const { selection } = analyzed(ALDRACHI, [{ t: 2000, ability: FRACTURE }]).resolved[0] ?? {};
    const brand = selection?.undecidedCandidates.find((step) => step.actionToken === "fiery_brand");
    expect(brand?.atoms).toContain("variable.execute");
  });
});

describe("the pinned lanes and ids", () => {
  it("an off-GCD press, an item and a melee swing are excluded, and the press beside them stays eligible", () => {
    const analysis = analyzed(ALDRACHI, [
      { t: 2000, ability: FRACTURE },
      { t: 3000, ability: VENGEFUL_RETREAT },
      { t: 4000, ability: POTION },
      { t: 5000, ability: 1, melee: true },
    ]);
    expect(analysis.coverage.eligibleDecisions).toBe(1);
    expect(analysis.excluded.map((cast) => [cast.abilityGameId, cast.reason])).toEqual([
      [VENGEFUL_RETREAT, "NON_GCD_ACTION"],
      [POTION, "EXECUTION_LANE_NOT_ESTABLISHED"],
      [1, "MELEE_SWING"],
    ]);
  });

  it("Fel Devastation is excluded, because no capture shows the moment its logged cast reports", () => {
    const analysis = analyzed(ALDRACHI, [{ t: 2000, ability: FEL_DEVASTATION }]);
    expect(analysis.coverage.eligibleDecisions).toBe(0);
    expect(analysis.excluded.map((cast) => cast.reason)).toEqual(["OUTSIDE_FIRST_SLICE"]);
  });

  it("Reaver's Glaive is this specialization's row, and Havoc's row binds nothing here", () => {
    expect(vengeanceDemonHunterTokenByAbilityId().get(REAVERS_GLAIVE)).toBe("reavers_glaive");
    expect(vengeanceDemonHunterTokenByAbilityId().has(HAVOC_REAVERS_GLAIVE)).toBe(false);
    expect(vengeanceDemonHunterExecutionLaneForAbility(HAVOC_REAVERS_GLAIVE)).toBe("UNKNOWN_LANE");
  });

  it("the lanes are the pinned records'", () => {
    expect(vengeanceDemonHunterExecutionLaneForAbility(FRACTURE)).toBe("GCD_CONSUMING");
    expect(vengeanceDemonHunterExecutionLaneForAbility(FIERY_BRAND)).toBe("GCD_CONSUMING");
    expect(vengeanceDemonHunterExecutionLaneForAbility(DEMON_SPIKES)).toBe("NON_GCD");
    expect(vengeanceDemonHunterExecutionLaneForAbility(METAMORPHOSIS)).toBe("NON_GCD");
    expect(vengeanceDemonHunterExecutionLaneForAbility(POTION)).toBe("UNKNOWN_LANE");
    expect(vengeanceDemonHunterExecutionLaneForToken("auto_attack")).toBe("NON_GCD");
    expect(vengeanceDemonHunterBaseGcdMsForAbility(232893)).toBe(500);
  });
});

describe("the build facts", () => {
  it("reads Fury from the cast's own observation, and never zero without one", () => {
    const known = analyzed(ALDRACHI, [{ t: 2000, ability: SOUL_CLEAVE, fury: 80 }]).resolved[0]?.diagnostics;
    expect(known?.fury).toEqual(knownNumber(80));
    const absent = analyzed(ALDRACHI, [{ t: 2000, ability: FRACTURE }]).resolved[0]?.diagnostics;
    expect(absent?.fury).toEqual(unknownNumber("STATE_NOT_ESTABLISHED"));
  });

  it("Fury at its maximum is not waste, and decides nothing past the stop", () => {
    const { coverage, comparisons } = analyzed(ALDRACHI, [{ t: 2000, ability: SOUL_CLEAVE, fury: 120 }]);
    expect(coverage.unknown).toBe(1);
    expect(comparisons[0]?.authorityToken).toBeNull();
  });

  it("Unhindered Assault and Evasive Action share a choice node; a lone talent absent is UNKNOWN, never false", () => {
    expect(
      resolveVengeanceDemonHunterTalent(entries(["unhindered_assault"]), "unhindered_assault").selection,
    ).toBe("SELECTED");
    expect(resolveVengeanceDemonHunterTalent([], "unhindered_assault").selection).toBe("UNKNOWN");
    expect(resolveVengeanceDemonHunterTalent([], "spirit_bomb").selection).toBe("UNKNOWN");
    expect(analyzed(entries(["art_of_the_glaive"]), []).build.talentsProvenAbsent).not.toContain(
      "spirit_bomb",
    );
  });

  it("each hero tree proves only the other tree's talents absent", () => {
    const aldrachi = resolveVengeanceDemonHunterHeroTree(entries(["art_of_the_glaive"]));
    const annihilator = resolveVengeanceDemonHunterHeroTree([annihilatorEntry()]);
    expect(aldrachi.state).toBe("RESOLVED");
    expect(annihilator.state).toBe("RESOLVED");
    expect(vengeanceDemonHunterTalentsDisprovedByHeroTree(aldrachi)).toEqual([]);
    expect(vengeanceDemonHunterTalentsDisprovedByHeroTree(annihilator)).toEqual([
      "art_of_the_glaive",
      "unhindered_assault",
    ]);
    expect(vengeanceDemonHunterTalentsDisprovedByHeroTree(resolveVengeanceDemonHunterHeroTree([]))).toEqual(
      [],
    );
  });

  it("the talent id space is uncorroborated for this specialization, and the artifact says so", () => {
    expect(vengeanceTalents.provenance.wclIdSpaceNote).toContain(
      "NOT corroborated for Vengeance Demon Hunter",
    );
    const trees = new Map(vengeanceTalents.heroTrees.map((tree) => [tree.simcName, tree]));
    expect(trees.get("aldrachi_reaver")?.subTreeId).toBe(35);
    expect(trees.get("annihilator")?.subTreeId).toBe(124);
  });
});

describe("applicability", () => {
  const line = (list: string, token: string): AplAction => {
    const found = authority().actions.find(
      (action) => action.listName === list && action.actionToken === token,
    );
    if (found === undefined) throw new Error(`no ${token} in ${list}`);
    return found;
  };
  const empty = { talents: {}, talentsProvenAbsent: new Set<string>() };

  it("an unknown talent never closes an action it builds", () => {
    expect(resolveVengeanceDemonHunterApplicability(empty, line("ar_fillers", "spirit_bomb")).kind).toBe(
      "UNKNOWN",
    );
    expect(resolveVengeanceDemonHunterApplicability(empty, line("ar", "reavers_glaive")).kind).toBe(
      "UNKNOWN",
    );
  });

  it("Annihilator's tree proves Reaver's Glaive background, and an absent talent alone does not", () => {
    const annihilator = { talents: {}, talentsProvenAbsent: new Set<string>(["art_of_the_glaive"]) };
    expect(resolveVengeanceDemonHunterApplicability(annihilator, line("ar", "reavers_glaive")).kind).toBe(
      "NOT_APPLICABLE",
    );
  });

  it("the baseline spells have no talent guard", () => {
    for (const [list, token] of [
      ["ar_fillers", "fracture"],
      ["ar_fillers", "soul_cleave"],
      ["ar_fillers", "throw_glaive"],
      ["ar", "immolation_aura"],
      ["ar", "sigil_of_flame"],
      ["default", "demon_spikes"],
    ] as const) {
      expect(resolveVengeanceDemonHunterApplicability(empty, line(list, token)).kind, token).toBe(
        "APPLICABLE",
      );
    }
  });

  it("the potion, item and external-buff lines are outside the domain, and no racial is named", () => {
    expect(resolveVengeanceDemonHunterApplicability(empty, line("ar_glaive_cycle", "potion")).kind).toBe(
      "NOT_APPLICABLE",
    );
    expect(resolveVengeanceDemonHunterApplicability(empty, line("trinkets", "use_item")).kind).toBe(
      "NOT_APPLICABLE",
    );
    expect(
      resolveVengeanceDemonHunterApplicability(empty, line("ar_glaive_cycle", "invoke_external_buff")).kind,
    ).toBe("NOT_APPLICABLE");
    expect(
      authority().actions.filter((action) => nonDomainCategoryOf(action.actionToken) === "RACIAL_ACTION"),
    ).toEqual([]);
  });
});
