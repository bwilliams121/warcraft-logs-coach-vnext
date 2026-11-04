/**
 * ONB-A1: Havoc Demon Hunter's synthetic fail-closed rules, and what its pinned data
 * and authority say.
 *
 * The real decisions are pinned over committed evidence by the archive cases
 * (`spec-havoc-demon-hunter.*`). What is here cannot be reached from one real fight:
 * every wrong answer the specialization's rules exist to prevent.
 */

import { describe, expect, it } from "vitest";

import { pinnedHavocDemonHunterTalents } from "../../../src/data/game/demonhunter-havoc-talents.js";
import {
  havocCooldownAbilitiesFor,
  havocMetamorphosisImpactAnchoredRecord,
  METAMORPHOSIS_IMPACT_ANCHOR_MARGIN_MS,
  METAMORPHOSIS_IMPACT_WIRE_ABILITY_ID,
  pinnedHavocDemonHunterCooldowns,
} from "../../../src/data/game/demonhunter-havoc-cooldowns.js";
import {
  havocExecutionLaneForAbility,
  havocExecutionLaneForToken,
  havocTokenByAbilityId,
  pinnedHavocDemonHunterGcdSemantics,
} from "../../../src/data/game/demonhunter-havoc-gcd-semantics.js";
import { havocTransitionContractFor } from "../../../src/data/game/demonhunter-havoc-transition-authority.js";
import { havocUsabilitySpell } from "../../../src/data/game/demonhunter-havoc-usability-authority.js";
import { actionOptionSupport, type AplAction } from "../../../src/simc/apl-authority.js";
import { knownNumber, unknownNumber, type AtomBindings } from "../../../src/simc/expression/evaluate.js";
import {
  resolveHavocApplicability,
  resolveHavocUsability,
  type HavocBuildFacts,
} from "../../../src/specs/demonhunter/havoc/action-profile.js";
import type { ReaversGlaiveReadinessFact } from "../../../src/specs/demonhunter/havoc/aura-bindings.js";
import {
  bindHavocAura,
  reaversGlaiveReadinessFact,
} from "../../../src/specs/demonhunter/havoc/aura-bindings.js";
import { metamorphosisLeapEdgeObserved } from "../../../src/specs/demonhunter/havoc/cooldown-bindings.js";
import type { CombatState } from "../../../src/engine/state/combat-state.js";
import {
  havocBranchBindings,
  havocFirstGcdSelectionAt,
} from "../../../src/specs/demonhunter/havoc/first-gcd-adapter.js";
import {
  initialHavocState,
  withFuryForgotten,
} from "../../../src/specs/demonhunter/havoc/first-gcd-state.js";
import { HAVOC_EXCLUSION_REASONS } from "../../../src/specs/demonhunter/havoc/observed-analysis.js";
import { analyzeObservedHavocDemonHunterDecisions } from "../../../src/specs/demonhunter/havoc/observed-analysis.js";
import { proveObservedActionUnselectable } from "../../../src/specs/demonhunter/havoc/observed-action-gate.js";
import { pinnedHavocDemonHunterAuthority } from "../../../src/specs/demonhunter/havoc/pinned-authority.js";
import {
  havocReaversGlaivePositiveUsability,
  REAVERS_GLAIVE_REACTION_TOLERANCE_MS,
} from "../../../src/specs/demonhunter/havoc/positive-usability.js";
import { resolveHavocAtoms } from "../../../src/specs/demonhunter/havoc/resolver.js";
import { FURY, HAVOC_ATOM_VOCABULARY } from "../../../src/specs/demonhunter/havoc/vocabulary.js";
import type { HeroTreeResolution, TalentResolution } from "../../../src/data/game/talent-selection.js";
import type { EvidenceLocator } from "../../../src/engine/evidence/locator.js";
import { createCombatState } from "../../../src/engine/state/combat-state.js";
import { syntheticFight } from "../../support/synthetic-fight.js";
import evidenceManifest from "../../evidence/manifest.json";

const authority = (() => {
  const loaded = pinnedHavocDemonHunterAuthority();
  if (!loaded.ok) throw new Error("the pinned Havoc authority did not load");
  return loaded.authority;
})();

const entry = (listName: string, priorityOrdinal: number): AplAction => {
  const action = authority.actions.find(
    (candidate) => candidate.listName === listName && candidate.priorityOrdinal === priorityOrdinal,
  );
  if (action === undefined) throw new Error(`no entry ${listName}[${String(priorityOrdinal)}]`);
  return action;
};

const talent = (simcName: string, selection: TalentResolution["selection"]): TalentResolution => ({
  simcName,
  selection,
  reason: selection === "SELECTED" ? "OWN_ENTRY_SELECTED" : "NODE_ABSENT",
  identity: null,
  decidedByEntryId: null,
});

const ALDRACHI: HeroTreeResolution = {
  state: "RESOLVED",
  simcName: "aldrachi_reaver",
  subTreeId: 35,
  decidedByEntryIds: [117512],
};
const FELSCARRED: HeroTreeResolution = {
  state: "RESOLVED",
  simcName: "felscarred",
  subTreeId: 34,
  decidedByEntryIds: [117514],
};

const buildFacts = (over: Partial<HavocBuildFacts> = {}): HavocBuildFacts => ({
  talents: {
    art_of_the_glaive: talent("art_of_the_glaive", "SELECTED"),
    eye_beam: talent("eye_beam", "SELECTED"),
    essence_break: talent("essence_break", "SELECTED"),
    the_hunt: talent("the_hunt", "SELECTED"),
    felblade: talent("felblade", "SELECTED"),
    vengeful_retreat: talent("vengeful_retreat", "SELECTED"),
  },
  talentsProvenAbsent: new Set(["demonsurge", "violent_transformation"]),
  ...over,
});

const LOCATOR: EvidenceLocator = {
  streamId: "all",
  pageOrdinal: 0,
  indexInPage: 0,
  ingestionOrdinal: 0,
  rawType: "applybuff",
  reportTimeMs: 1000,
};

const baseBindings = (over: Partial<AtomBindings> = {}): AtomBindings => {
  const resolution = resolveHavocAtoms({
    heroTree: ALDRACHI,
    demonsurge: talent("demonsurge", "UNKNOWN"),
    fury: knownNumber(80),
    buffUp: { rending_strike: false, glaive_flurry: false },
    cooldownProvenDown: { metamorphosis: true },
  });
  return {
    comboPoints: unknownNumber("STATE_NOT_MODELLED"),
    comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
    energyPct: unknownNumber("STATE_NOT_MODELLED"),
    knownBuffs: [
      { name: "reavers_glaive", up: true },
      { name: "rending_strike", up: false },
      { name: "glaive_flurry", up: false },
      { name: "initiative", up: true },
    ],
    knownTalents: [
      { name: "demonsurge", taken: false },
      { name: "violent_transformation", taken: false },
      { name: "chaotic_transformation", taken: true },
    ],
    specAtoms: resolution.specAtoms,
    ...over,
  };
};

const PROVEN_NOT_READY = {
  simcToken: "metamorphosis",
  readiness: { state: "PROVEN_NOT_READY", provenRemainingAtLeastMs: 60000, cooldownToleranceMs: 250 },
  abilityGameId: 200166,
} as const;

const PROVEN_UP: ReaversGlaiveReadinessFact = { state: "PROVEN_UP", upForMs: 5000, anchorLocator: LOCATOR };

describe("the pinned data", () => {
  it("every Havoc dataset loads under its own id, from the shared commit", () => {
    expect(pinnedHavocDemonHunterGcdSemantics().ok).toBe(true);
    expect(pinnedHavocDemonHunterTalents().ok).toBe(true);
    expect(pinnedHavocDemonHunterCooldowns().ok).toBe(true);
    expect(authority.artifact.authorityId).toBe("SIMC_APL_DEMONHUNTER_HAVOC");
    expect(authority.artifact.provenance.commitSha).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
  });

  it("a logged Metamorphosis impact, The Hunt's impact and Felblade's charge are never read as presses", () => {
    const tokens = havocTokenByAbilityId();
    for (const wireId of [200166, 370966, 213243]) {
      expect(tokens.has(wireId), String(wireId)).toBe(false);
      expect(havocExecutionLaneForAbility(wireId), String(wireId)).toBe("NON_GCD");
    }
    expect(tokens.get(191427)).toBe("metamorphosis");
    expect(havocExecutionLaneForToken("metamorphosis")).toBe("GCD_CONSUMING");
    expect(havocExecutionLaneForToken("vengeful_retreat")).toBe("NON_GCD");
    expect(havocExecutionLaneForToken("pick_up_fragment")).toBe("NON_GCD");
  });

  it("the Metamorphosis bound anchors on the impact the log reports, with its margin off the base", () => {
    const [pinned] = havocCooldownAbilitiesFor("metamorphosis");
    const [anchored] = havocMetamorphosisImpactAnchoredRecord();
    expect(pinned?.baseCooldownMs).toBe(120000);
    expect(anchored?.abilityGameId).toBe(METAMORPHOSIS_IMPACT_WIRE_ABILITY_ID);
    expect(anchored?.baseCooldownMs).toBe(120000 - METAMORPHOSIS_IMPACT_ANCHOR_MARGIN_MS);
  });

  it("The Hunt's record is pinned and the pinned model is contradicted by the wire, so nothing derives from it", () => {
    const [hunt] = havocCooldownAbilitiesFor("the_hunt");
    expect(hunt?.baseCooldownMs).toBe(90000);
    expect(hunt?.passiveModifiers.map((row) => [row.displayNameEn, row.kind, row.value])).toEqual([
      ["Eternal Hunt", "FLAT_MS", -15000],
    ]);
    // The retained subject's fastest gap, against the only bound the census allows.
    expect(61219).toBeLessThan(90000 - 15000);
  });

  it("every NON_GCD contract that consumes a soul forgets Fury and Reaver's Glaive; none claims usability", () => {
    for (const token of ["vengeful_retreat", "pick_up_fragment"]) {
      const contract = havocTransitionContractFor(token);
      expect(contract?.writes, token).toContain("FORGETS_FURY");
      expect(contract?.forgetsBuffsUnlessObservedUp, token).toContain("reavers_glaive");
      expect(contract?.timeAdvanceMs, token).toBe(0);
    }
    expect(havocTransitionContractFor("auto_attack")?.writes).toEqual(["OWN_PREFIX_AVAILABILITY"]);
    expect(havocTransitionContractFor("use_item")).toBeNull();
    expect(havocTransitionContractFor("arcane_torrent")).toBeNull();
  });

  it("the pinned range record lets a melee cast corroborate Reaver's Glaive and an untargeted one never", () => {
    expect(havocUsabilitySpell(442294)).toMatchObject({
      maxRangeYd: 40,
      targetMode: "ENEMY_UNIT_TARGET",
      castTimeMs: 0,
      powerRows: [],
    });
    expect(havocUsabilitySpell(201427)?.targetMode).toBe("ENEMY_UNIT_TARGET");
    expect(havocUsabilitySpell(198013)?.targetMode).toBe("UNTARGETED");
  });

  it("type and mode are understood only on the action that reads them", () => {
    expect(entry("default", 8).actionToken).toBe("pick_up_fragment");
    expect(entry("default", 8).unsupportedOptions).toEqual([]);
    expect(actionOptionSupport("type")).toBe("UNRECOGNISED");
    expect(actionOptionSupport("mode")).toBe("UNRECOGNISED");
  });
});

describe("the committed evidence's grants", () => {
  // A category grant is a machine-readable completeness claim, so every family a
  // granted category holds must be retained, or the claim would read an omission as absence.
  const FAMILIES_OF: Readonly<Record<string, readonly string[]>> = {
    CASTS: ["cast", "begincast"],
    COMBATANT_INFO: ["combatantinfo"],
    RESOURCES: ["resourcechange"],
    AURAS: [
      "applybuff",
      "refreshbuff",
      "removebuff",
      "applybuffstack",
      "removebuffstack",
      "applydebuff",
      "refreshdebuff",
      "removedebuff",
      "applydebuffstack",
      "removedebuffstack",
    ],
  };
  const record = (evidenceManifest as { artifacts: readonly Record<string, unknown>[] }).artifacts.find(
    (entry) => entry["artifactId"] === "wcl-b1pm-fight-48-havoc-demon-hunter-18-decisions.seg-0-90",
  );

  it("retains every family of every category it grants", () => {
    if (record === undefined) throw new Error("no Havoc artifact in the evidence manifest");
    const text = JSON.stringify(record["provenance"]);
    const families = /--families ([a-z,]+)/.exec(text)?.[1]?.split(",") ?? [];
    const [grant] = (
      record["provenance"] as { retainedCoverage: { grants: readonly { categories: readonly string[] }[] } }
    ).retainedCoverage.grants;
    expect(grant?.categories).toEqual(["CASTS", "AURAS", "RESOURCES", "COMBATANT_INFO"]);
    for (const category of grant?.categories ?? []) {
      for (const family of FAMILIES_OF[category] ?? ["(a category this test does not name)"]) {
        expect(families, `${category} is granted without ${family}`).toContain(family);
      }
    }
  });

  it("grants nothing it did not retain: no damage, healing or death coverage over this segment", () => {
    if (record === undefined) throw new Error("no Havoc artifact in the evidence manifest");
    const [grant] = (
      record["provenance"] as { retainedCoverage: { grants: readonly { categories: readonly string[] }[] } }
    ).retainedCoverage.grants;
    for (const category of ["DAMAGE", "HEALING", "ABSORBS", "DEATHS", "TARGETABILITY"]) {
      expect(grant?.categories, category).not.toContain(category);
    }
  });
});

describe("applicability", () => {
  it("an action on an unresolved talent is UNKNOWN, never background: missing talent is not talent=false", () => {
    const facts = buildFacts({ talents: {}, talentsProvenAbsent: new Set() });
    expect(resolveHavocApplicability(facts, entry("default", 9)).kind).toBe("UNKNOWN");
    expect(resolveHavocApplicability(facts, entry("default", 16)).kind).toBe("UNKNOWN");
  });

  it("Reaver's Glaive is background on a build the resolved tree proves cannot have it", () => {
    const facts = buildFacts({ talents: {}, talentsProvenAbsent: new Set(["art_of_the_glaive"]) });
    expect(resolveHavocApplicability(facts, entry("default", 9))).toMatchObject({
      kind: "NOT_APPLICABLE",
      reason: "BACKGROUND_UNDER_PROVEN_BUILD",
    });
  });

  it("racial, potion and item entries are outside the decision domain before any build fact is read", () => {
    const facts = buildFacts({ talents: {}, talentsProvenAbsent: new Set() });
    for (const action of [entry("default", 28), entry("items", 0), entry("items", 1)]) {
      expect(resolveHavocApplicability(facts, action), action.actionToken).toMatchObject({
        kind: "NOT_APPLICABLE",
        reason: "OUTSIDE_SUPPORTED_DECISION_DOMAIN",
      });
    }
  });
});

describe("the resolver", () => {
  const atoms = (heroTree: HeroTreeResolution, demonsurge: TalentResolution["selection"]) =>
    resolveHavocAtoms({
      heroTree,
      demonsurge: talent("demonsurge", demonsurge),
      fury: unknownNumber("STATE_NOT_ESTABLISHED"),
      buffUp: {},
      cooldownProvenDown: {},
    });
  const has = (resolution: ReturnType<typeof atoms>, key: string) =>
    resolution.specAtoms.bound.some((row) => row.key === key);

  it("an Aldrachi Reaver build proves Demonsurge absent, and a Fel-Scarred one leaves it unbound", () => {
    expect(has(atoms(ALDRACHI, "UNKNOWN"), "action.death_sweep.demonsurge_available")).toBe(true);
    expect(has(atoms(FELSCARRED, "SELECTED"), "action.death_sweep.demonsurge_available")).toBe(false);
    const unresolved: HeroTreeResolution = { state: "UNKNOWN", reason: "NO_PINNED_ENTRY_OBSERVED" } as never;
    expect(has(atoms(unresolved, "UNKNOWN"), "action.annihilation.demonsurge_available")).toBe(false);
    expect(has(atoms(unresolved, "UNKNOWN"), "hero_tree.felscarred")).toBe(false);
  });

  it("a cooldown is never bound up: only a proven lower bound binds it, and only down", () => {
    const resolution = resolveHavocAtoms({
      heroTree: ALDRACHI,
      demonsurge: talent("demonsurge", "UNKNOWN"),
      fury: unknownNumber("STATE_NOT_ESTABLISHED"),
      buffUp: {},
      cooldownProvenDown: { metamorphosis: true, blade_dance: false },
    });
    const up = resolution.specAtoms.bound.filter((row) => row.key.startsWith("cooldown."));
    expect(up.map((row) => [row.key, row.value])).toEqual([
      ["cooldown.metamorphosis.up", { kind: "TRUTH", value: false }],
    ]);
  });

  it("every enemy-count magnitude is refused by name: nothing silently evaluates single target", () => {
    const bound = atoms(ALDRACHI, "UNKNOWN").specAtoms.bound;
    for (const key of ["active_enemies", "spell_targets", "active_dot.burning_wound", "gcd.max"]) {
      const row = bound.find((candidate) => candidate.key === key);
      expect(row?.value, key).toEqual({ kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") });
    }
    expect(HAVOC_ATOM_VOCABULARY.ownerSpecId).toBe("demonhunter/havoc");
  });
});

describe("Reaver's Glaive's readiness", () => {
  it("is proven up with its age, proven down by a removal or a build, and otherwise not established", () => {
    expect(
      reaversGlaiveReadinessFact(
        [
          {
            atomName: "reavers_glaive",
            state: "BOUND",
            up: true,
            abilityGameId: 444686,
            proof: "OBSERVED",
            anchorPosition: 1,
            anchorLocator: LOCATOR,
          },
        ],
        1400,
      ),
    ).toMatchObject({ state: "PROVEN_UP", upForMs: 400 });
    expect(
      reaversGlaiveReadinessFact(
        [
          {
            atomName: "reavers_glaive",
            state: "BOUND",
            up: false,
            abilityGameId: 444686,
            proof: "TALENT_NOT_SELECTED",
            basis: "x",
          },
        ],
        1400,
      ).state,
    ).toBe("PROVEN_DOWN");
    expect(
      reaversGlaiveReadinessFact(
        [
          {
            atomName: "reavers_glaive",
            state: "UNBOUND",
            reason: "AURA_EDGE_WITHIN_SKEW",
            abilityGameId: 444686,
            auraReason: null,
          },
        ],
        1400,
      ).state,
    ).toBe("NOT_ESTABLISHED");
  });

  const positive = (
    fact: ReaversGlaiveReadinessFact,
    observedAbilityGameId = 201427,
    observedTargetActorId: number | null = 100,
  ) =>
    havocReaversGlaivePositiveUsability({
      actorId: 18,
      authority,
      buildFacts: buildFacts(),
      reaversGlaive: fact,
      observedAbilityGameId,
      observedLocator: LOCATOR,
      observedTargetActorId,
      decisionTargetActorId: observedTargetActorId,
    });

  it("is PROVEN_USABLE only with its buff up past the reaction tolerance", () => {
    expect(positive(PROVEN_UP).kind).toBe("PROVEN_USABLE");
    const young: ReaversGlaiveReadinessFact = {
      state: "PROVEN_UP",
      upForMs: REAVERS_GLAIVE_REACTION_TOLERANCE_MS - 1,
      anchorLocator: LOCATOR,
    };
    expect(positive(young).kind).not.toBe("PROVEN_USABLE");
    expect(positive({ state: "NOT_ESTABLISHED" }).kind).not.toBe("PROVEN_USABLE");
  });

  it("an untargeted or unpinned decision cast corroborates no range, so nothing is proven from it", () => {
    expect(positive(PROVEN_UP, 198013).kind).not.toBe("PROVEN_USABLE");
    expect(positive(PROVEN_UP, 999999).kind).not.toBe("PROVEN_USABLE");
    expect(positive(PROVEN_UP, 201427, null).kind).not.toBe("PROVEN_USABLE");
  });

  it("a buff proven down makes it unusable only outside a branch that consumed a soul", () => {
    const down: ReaversGlaiveReadinessFact = {
      state: "PROVEN_DOWN",
      wireAuraId: 444686,
      anchorReportTimeMs: 900,
    };
    const input = {
      action: entry("default", 9),
      observedAbilityGameId: 201427,
      readiness: [],
      reaversGlaive: down,
    };
    expect(resolveHavocUsability({ ...input, state: initialHavocState() })).toMatchObject({
      kind: "PROVEN_UNUSABLE",
      reason: "REQUIRED_AURA_INACTIVE",
    });
    expect(
      resolveHavocUsability({
        ...input,
        state: { ...initialHavocState(), forgottenBuffs: ["reavers_glaive"] },
      }).kind,
    ).toBe("UNKNOWN");
  });
});

describe("an aura edge inside the skew window", () => {
  type Edge = {
    readonly position: number;
    readonly reportTimeMs: number;
    readonly operation: "APPLIED" | "REMOVED";
  };

  // A stub of the two readers the binder uses: M4's answer is the latest edge strictly
  // before the queried position, its presence following that edge's direction.
  const stateOver = (edges: readonly Edge[]): CombatState =>
    ({
      eventAt: (position: number) => {
        const edge = edges.find((candidate) => candidate.position === position);
        return edge === undefined ? null : { kind: "AURA", ...edge };
      },
      auras: {
        presenceAt: (query: { readonly at: { readonly position: number } }) => {
          const before = edges.filter((edge) => edge.position < query.at.position);
          const last = before[before.length - 1];
          if (last === undefined) return { certainty: "UNKNOWN", reason: "NO_TRANSITION_OBSERVED" };
          return {
            certainty: "EXACT",
            value: {
              presence: last.operation === "APPLIED" ? "ACTIVE" : "INACTIVE",
              anchor: { position: last.position, locator: { ...LOCATOR, reportTimeMs: last.reportTimeMs } },
            },
          };
        },
      },
    }) as unknown as CombatState;

  const bind = (edges: readonly Edge[], observedToken: string, atomName = "rending_strike") =>
    bindHavocAura(
      {
        state: stateOver(edges),
        actorId: 18,
        position: 100,
        talentsProvenAbsent: new Set(),
        decisionReportTimeMs: 5000,
        observedToken,
      },
      atomName,
    );
  const earlierRemoval: Edge = { position: 1, reportTimeMs: 1000, operation: "REMOVED" };
  const earlierApplication: Edge = { position: 1, reportTimeMs: 1000, operation: "APPLIED" };

  it("the action's own application is read from before it: a Reaver's Glaive does not see its own buff", () => {
    const edges: readonly Edge[] = [
      earlierRemoval,
      { position: 2, reportTimeMs: 4999, operation: "APPLIED" },
    ];
    expect(bind(edges, "reavers_glaive")).toMatchObject({ state: "BOUND", up: false, proof: "OBSERVED" });
  });

  it("the action's own removal is read from before it: the spender that consumes Rending Strike saw it up", () => {
    const edges: readonly Edge[] = [
      earlierApplication,
      { position: 2, reportTimeMs: 5000, operation: "REMOVED" },
    ];
    expect(bind(edges, "annihilation")).toMatchObject({ state: "BOUND", up: true, proof: "OBSERVED" });
  });

  it("the opposite direction is not the action's effect: a recent removal is never rewound by Reaver's Glaive", () => {
    const removed: readonly Edge[] = [
      earlierApplication,
      { position: 2, reportTimeMs: 4999, operation: "REMOVED" },
    ];
    expect(bind(removed, "reavers_glaive")).toMatchObject({
      state: "UNBOUND",
      reason: "AURA_EDGE_WITHIN_SKEW",
    });
    const applied: readonly Edge[] = [
      earlierRemoval,
      { position: 2, reportTimeMs: 4999, operation: "APPLIED" },
    ];
    expect(bind(applied, "annihilation")).toMatchObject({
      state: "UNBOUND",
      reason: "AURA_EDGE_WITHIN_SKEW",
    });
  });

  it("a buff the action does not write stays unbound whichever direction the edge runs", () => {
    const edges: readonly Edge[] = [
      earlierApplication,
      { position: 2, reportTimeMs: 5000, operation: "REMOVED" },
    ];
    expect(bind(edges, "eye_beam")).toMatchObject({ state: "UNBOUND", reason: "AURA_EDGE_WITHIN_SKEW" });
    expect(bind(edges, "death_sweep")).toMatchObject({ state: "UNBOUND", reason: "AURA_EDGE_WITHIN_SKEW" });
    expect(bind(edges, "death_sweep", "reavers_glaive").state).toBe("UNBOUND");
  });

  it("a second edge inside the window is ambiguous, so it can never produce a confident state", () => {
    const edges: readonly Edge[] = [
      earlierRemoval,
      { position: 2, reportTimeMs: 4998, operation: "REMOVED" },
      { position: 3, reportTimeMs: 4999, operation: "APPLIED" },
    ];
    expect(bind(edges, "reavers_glaive")).toMatchObject({
      state: "UNBOUND",
      reason: "AURA_EDGE_WITHIN_SKEW",
    });
  });

  it("an edge outside the window is ordinary evidence", () => {
    const edges: readonly Edge[] = [{ position: 1, reportTimeMs: 4000, operation: "REMOVED" }];
    expect(bind(edges, "reavers_glaive")).toMatchObject({ state: "BOUND", up: false });
    expect(bind(edges, "eye_beam")).toMatchObject({ state: "BOUND", up: false });
  });

  it("an unbound buff can never produce REJECTED: with Rending Strike unbound the gate is never proven", () => {
    const unbound = resolveHavocAtoms({
      heroTree: ALDRACHI,
      demonsurge: talent("demonsurge", "UNKNOWN"),
      fury: knownNumber(80),
      buffUp: { glaive_flurry: false },
      cooldownProvenDown: { metamorphosis: true },
    });
    const result = havocFirstGcdSelectionAt({
      authority,
      bindings: { ...baseBindings(), specAtoms: unbound.specAtoms },
      buildFacts: buildFacts(),
      observedAbilityGameId: 201427,
      readiness: [PROVEN_NOT_READY],
      reaversGlaive: PROVEN_UP,
    }).result;
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
  });
});

describe("the Metamorphosis impact anchor", () => {
  type Row = {
    readonly position: number;
    readonly reportTimeMs: number;
    readonly operation: string;
    readonly sourceActorId?: number;
  };
  const IMPACT = { position: 10, reportTimeMs: 50000, kind: "CAST" };
  const stateOver = (rows: readonly Row[], aurasKnown = true): CombatState =>
    ({
      eventAt: (position: number) => {
        if (position === IMPACT.position) return IMPACT;
        const row = rows.find((candidate) => candidate.position === position);
        return row === undefined
          ? null
          : { kind: "AURA", source: { actorId: row.sourceActorId ?? 18 }, ...row };
      },
      auras: { groupFor: () => (aurasKnown ? { allPositions: rows.map((row) => row.position) } : null) },
    }) as unknown as CombatState;
  const edge = (reportTimeMs: number, operation = "APPLIED", position = 5): Row => ({
    position,
    reportTimeMs,
    operation,
  });
  const observed = (state: CombatState) => metamorphosisLeapEdgeObserved(state, 18, IMPACT.position);

  it("an application inside the margin establishes the leap's delay", () => {
    expect(observed(stateOver([edge(49077)]))).toBe(true);
    expect(observed(stateOver([edge(50000 - METAMORPHOSIS_IMPACT_ANCHOR_MARGIN_MS)]))).toBe(true);
  });

  it("an application outside the margin, or no application, establishes nothing and no bound is claimed", () => {
    expect(observed(stateOver([edge(50000 - METAMORPHOSIS_IMPACT_ANCHOR_MARGIN_MS - 1)]))).toBe(false);
    expect(observed(stateOver([]))).toBe(false);
    expect(observed(stateOver([edge(49077, "REMOVED")]))).toBe(false);
  });

  it("an application after the impact belongs to no earlier press, and missing aura data proves nothing", () => {
    expect(observed(stateOver([edge(50100, "APPLIED", 11)]))).toBe(false);
    expect(observed(stateOver([edge(49077)], false))).toBe(false);
    expect(observed(stateOver([{ ...edge(49077), sourceActorId: 99 }]))).toBe(false);
  });
});

describe("branches", () => {
  it("forgets Fury as an unknown, and drops a forgotten buff unless the evidence bound it up", () => {
    const state = {
      ...withFuryForgotten(initialHavocState()),
      forgottenBuffs: ["reavers_glaive", "initiative"],
    };
    const bound = baseBindings({
      knownBuffs: [
        { name: "reavers_glaive", up: false },
        { name: "initiative", up: true },
      ],
    });
    const branch = havocBranchBindings(bound, state);
    expect(branch.knownBuffs).toEqual([{ name: "initiative", up: true }]);
    const fury = branch.specAtoms?.bound.find((row) => row.key === FURY);
    expect(fury?.value).toEqual({ kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_ESTABLISHED") });
    expect(havocBranchBindings(bound, initialHavocState())).toBe(bound);
  });
});

describe("the priority short-circuit", () => {
  const query = (over: {
    bindings?: AtomBindings;
    readiness?: readonly (typeof PROVEN_NOT_READY)[];
    observedAbilityGameId?: number;
    reaversGlaive?: ReaversGlaiveReadinessFact;
  }) =>
    havocFirstGcdSelectionAt({
      authority,
      bindings: over.bindings ?? baseBindings(),
      buildFacts: buildFacts(),
      observedAbilityGameId: over.observedAbilityGameId ?? 442294,
      readiness: over.readiness ?? [PROVEN_NOT_READY],
      reaversGlaive: over.reaversGlaive ?? PROVEN_UP,
    }).result;

  it("an observed Reaver's Glaive with the state proven selects default[9]", () => {
    const result = query({});
    expect(result.kind).toBe("ROTATIONAL_GCD_SELECTED");
    expect("selectingStep" in result ? result.selectingStep?.actionToken : null).toBe("reavers_glaive");
  });

  it("an undecided Metamorphosis above it never falls through to the lower action", () => {
    const result = query({ readiness: [] });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    expect(result.kind === "ROTATIONAL_GCD_UNKNOWN" ? result.blockedAt?.actionToken : null).toBe(
      "metamorphosis",
    );
  });

  it("an unproven The Hunt above it never falls through: its buff unbound leaves the gate open", () => {
    const bindings = baseBindings();
    const result = query({
      bindings: {
        ...bindings,
        knownBuffs: bindings.knownBuffs.filter((row) => row.name !== "reavers_glaive"),
      },
    });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
    expect(result.kind === "ROTATIONAL_GCD_UNKNOWN" ? result.blockedAt?.actionToken : null).toBe("the_hunt");
  });

  it("an unproven Reaver's Glaive never yields a confident lower action", () => {
    const result = query({ observedAbilityGameId: 201427 });
    expect(result.kind).toBe("ROTATIONAL_GCD_UNKNOWN");
  });
});

describe("unselectability", () => {
  it("an UNKNOWN condition is not proof: a Reaver's Glaive with its buffs unbound is not rejected", () => {
    const bindings = baseBindings();
    const unbound = resolveHavocAtoms({
      heroTree: ALDRACHI,
      demonsurge: talent("demonsurge", "UNKNOWN"),
      fury: knownNumber(80),
      buffUp: {},
      cooldownProvenDown: {},
    });
    expect(
      proveObservedActionUnselectable({
        authority,
        observedToken: "reavers_glaive",
        bindings: { ...bindings, specAtoms: unbound.specAtoms },
        buildFacts: buildFacts(),
      }),
    ).toMatchObject({ proven: false, refusal: "CONDITION_NOT_PROVEN_FALSE" });
  });

  it("a bare entry is never unselectable, and a token the authority does not name is not rejected by it", () => {
    expect(
      proveObservedActionUnselectable({
        authority,
        observedToken: "chaos_strike",
        bindings: baseBindings(),
        buildFacts: buildFacts(),
      }),
    ).toMatchObject({ proven: false, refusal: "UNCONDITIONAL_ENTRY" });
    expect(
      proveObservedActionUnselectable({
        authority,
        observedToken: "fel_rush",
        bindings: baseBindings(),
        buildFacts: buildFacts(),
      }),
    ).toMatchObject({ proven: false, refusal: "TOKEN_NOT_IN_AUTHORITY" });
  });
});

describe("the facade", () => {
  const fight = createCombatState(syntheticFight({ events: [] }));

  it("refuses every other specialization before reading anything", () => {
    expect(
      analyzeObservedHavocDemonHunterDecisions({
        state: fight,
        actorId: 18,
        specId: "rogue/assassination",
        targetActorId: null,
      }).status,
    ).toBe("SPEC_NOT_SUPPORTED");
  });

  it("with no combatant profile it refuses: missing talents never become a build", () => {
    expect(
      analyzeObservedHavocDemonHunterDecisions({
        state: fight,
        actorId: 18,
        specId: "demonhunter/havoc",
        targetActorId: null,
      }).status,
    ).toBe("PROFILE_NOT_RESOLVED");
  });

  it("names every reason a cast can be excluded", () => {
    expect([...HAVOC_EXCLUSION_REASONS]).toEqual([
      "MELEE_SWING",
      "NON_GCD_ACTION",
      "EXECUTION_LANE_NOT_ESTABLISHED",
      "NO_AUTHORITY_TOKEN_BINDING",
      "OUTSIDE_FIRST_SLICE",
    ]);
  });
});
