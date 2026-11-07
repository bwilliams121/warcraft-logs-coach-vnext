import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import {
  citeSemantic,
  ENGINE_SEMANTICS,
  environmentOptionLinesOf,
  profileStemOf,
} from "../../scripts/authority/extract-simc-profile-environment.mjs";
import {
  SIMC_PROFILE_ENVIRONMENT,
  type SimcProfileEnvironmentDataset,
} from "../../src/data/simc-profile/simc-profile-environment.js";
import { inclusiveRange } from "../../src/engine/evidence/coverage.js";
import type { CombatActor } from "../../src/engine/normalization/actors.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import { createNormalizer } from "../../src/engine/normalization/event-normalizer.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../src/engine/normalization/supported-families.js";
import { createCombatState, type CombatState } from "../../src/engine/state/combat-state.js";
import type { EncounterStateCitation } from "../../src/engine/game-state/enemies/enemy-set.js";
import { withEnemyCountAt } from "../../src/findings/enemy-count-bindings.js";
import {
  PRODUCTION_ENCOUNTER_STATE_SUPPLIER,
  type EncounterStateSupplier,
} from "../../src/findings/encounter-state-supplier.js";
import { provenGameBuildOf } from "../../src/findings/proven-fight-build.js";
import {
  aplAuthorityIdentityOf,
  createSimcProfileFallback,
  PRODUCTION_SIMC_PROFILE_FALLBACK,
  resolveSimcProfile,
  withEncounterStateAt,
  type AplAuthorityIdentity,
  type EncounterStateQuery,
  type EncounterStateResolution,
} from "../../src/findings/simc-profile-fallback.js";
import { PUBLIC_SPEC_IDS } from "../../src/findings/spec-id.js";
import { allApplicable, provenUsable } from "../../src/simc/action-applicability.js";
import { ANALYZER_AUTHORITY_MODEL } from "../../src/simc/analyzer-authority-model.js";
import { loadAplAuthority, type AplAction } from "../../src/simc/apl-authority.js";
import {
  evaluateSimcExpression,
  knownNumber,
  unknownNumber,
  NO_ACTING_ACTION,
  type AtomBindings,
} from "../../src/simc/expression/evaluate.js";
import { isBuiltinIdentifier, parseSimcExpression } from "../../src/simc/expression/parse.js";
import {
  profileAtomBinding,
  TIMESPAN_MAX_SECONDS,
} from "../../src/simc/expression/profile-environment-atoms.js";
import {
  defineSpecAtomVocabulary,
  type SpecAtomDeclaration,
} from "../../src/simc/expression/spec-vocabulary.js";
import { selectAcrossLists } from "../../src/simc/nested-selection.js";
import { targetIfVerdict } from "../../src/simc/target-if.js";
import { SIMULATION_MODELS } from "../../src/simulation/model-registry.js";
import { loadCommittedEvidenceArchive } from "../support/corpus/evidence-archive.js";
import { bundleOf } from "../support/corpus/fight.js";
import { subjectContextFight, subjectRegion } from "../support/environment/subject-environment.js";
import { syntheticArtifact, syntheticAuthority } from "../support/m5a-authority.js";
import { observableCategory, syntheticFight, UNVERIFIED_CATEGORY } from "../support/synthetic-fight.js";

/**
 * SIMC-FB-A: the pinned SimC profile as tier 3 of encounter state.
 *
 * The negative tests the queue names: the fallback never appears as observed evidence, never overrides
 * a contradiction, never answers what the profile leaves open, and never runs on an unproven build. See
 * agent/architecture.md "Owner decision (2026-11-06): SimC profile fallback".
 */

type Raw = Record<string, unknown>;
const START = 1_000;
const END = 90_000;
const SUBJECT = 15;
const ALLY = 16;
const BOSS = 161;
const ADD = 180;
const DOT = 703;
const COVERED_BUILD = "12.1.0.69933";
const ROGUE: AplAuthorityIdentity = {
  authorityId: "SIMC_APL_ROGUE_ASSASSINATION",
  simcCommit: ANALYZER_AUTHORITY_MODEL.simcCommit,
};

function actor(actorId: number, actorType: CombatActor["actorType"]): [number, CombatActor] {
  return [
    actorId,
    {
      actorId,
      gameId: null,
      name: null,
      server: null,
      actorType,
      rawType: null,
      subType: null,
      petOwnerActorId: null,
    },
  ];
}

const CATALOG = new Map<number, CombatActor>([
  actor(SUBJECT, "PLAYER"),
  actor(ALLY, "PLAYER"),
  actor(BOSS, "NPC"),
  actor(ADD, "NPC"),
]);

function stateOf(
  raw: readonly Raw[],
  options: { readonly auras?: boolean; readonly retrievedToMs?: number } = {},
): CombatState {
  const normalizer = createNormalizer({
    fightStartTimeMs: START,
    requestedRange: inclusiveRange(START, END),
    contracts: indexContracts([...SUPPORTED_TYPE_CONTRACTS]),
    directionFields: VERIFIED_DIRECTION_FIELDS,
  });
  normalizer.accept({
    streamId: "all",
    pageOrdinal: 0,
    requestedStartTimeMs: START,
    nextPageTimestamp: null,
    events: raw,
  });
  return createCombatState(
    syntheticFight({
      events: normalizer.finish().events,
      startTimeMs: START,
      endTimeMs: END,
      actors: CATALOG,
      categories: {
        AURAS:
          options.auras === false
            ? UNVERIFIED_CATEGORY
            : observableCategory(inclusiveRange(START, END), null),
        DAMAGE: observableCategory(inclusiveRange(START, options.retrievedToMs ?? END), null),
      },
    }),
  );
}

const debuff = (timestamp: number, target: number): Raw => ({
  timestamp,
  type: "applydebuff",
  sourceID: SUBJECT,
  targetID: target,
  abilityGameID: DOT,
  fight: 1,
});
const hit = (timestamp: number, target: number): Raw => ({
  timestamp,
  type: "damage",
  sourceID: SUBJECT,
  targetID: target,
  abilityGameID: 1,
  amount: 100,
  fight: 1,
});
const decisionCast = (timestamp: number): Raw => ({
  timestamp,
  type: "cast",
  sourceID: SUBJECT,
  targetID: BOSS,
  abilityGameID: 2,
  fight: 1,
});

/** No evidence of any enemy at the decision. */
const NO_MEMBER = (): CombatState => stateOf([decisionCast(5_000)]);
/** One proven enemy: the boss. */
const ONE_MEMBER = (): CombatState => stateOf([hit(2_000, BOSS), debuff(2_100, BOSS), decisionCast(5_000)]);
/** Two proven enemies: the boss and an add. */
const TWO_MEMBERS = (): CombatState =>
  stateOf([hit(2_000, BOSS), debuff(2_100, BOSS), hit(2_200, ADD), debuff(2_300, ADD), decisionCast(5_000)]);
const lastPosition = (state: CombatState): number => state.fight.events.length - 1;

const declare = (
  identifier: string,
  shape: "NUMERIC" | "BOOLEAN",
  selfAddressing = false,
): SpecAtomDeclaration => ({
  identifier,
  shape,
  scope: "PLAYER_SCOPED",
  selfAddressing,
});

const VOCABULARY = defineSpecAtomVocabulary(
  "test/spec",
  [
    declare("active_enemies", "NUMERIC"),
    declare("spell_targets", "NUMERIC"),
    declare("spell_targets.cleave", "NUMERIC"),
    declare("fight_style.dungeonroute", "BOOLEAN"),
    declare("fight_style.patchwerk", "BOOLEAN"),
    declare("raid_event.adds.exists", "BOOLEAN"),
    declare("raid_event.adds.in", "NUMERIC"),
    declare("raid_event.adds.remains", "NUMERIC"),
    declare("raid_event.pull.exists", "BOOLEAN"),
    declare("raid_event.movement.in", "NUMERIC"),
    declare("raid_event.movement.distance", "NUMERIC"),
    declare("player_flag", "BOOLEAN"),
    declare("max_prio_damage", "BOOLEAN"),
    { identifier: "debuff.bar.down", shape: "BOOLEAN", scope: "TARGET_SCOPED", selfAddressing: false },
    { identifier: "target_magnitude", shape: "NUMERIC", scope: "TARGET_SCOPED", selfAddressing: false },
  ],
  isBuiltinIdentifier,
);

const BINDINGS: AtomBindings = {
  comboPoints: knownNumber(7),
  comboPointsDeficit: knownNumber(0),
  energyPct: knownNumber(100),
  dotRemainsSecondsByAction: [],
  knownBuffs: [],
  specAtoms: { vocabulary: VOCABULARY, bound: [] },
};

const PROVEN = createSimcProfileFallback({
  dataset: SIMC_PROFILE_ENVIRONMENT,
  gameBuildOf: () => COVERED_BUILD,
});

function resolveAt(
  state: CombatState,
  query: Partial<EncounterStateQuery> = {},
  bindings: AtomBindings = BINDINGS,
): EncounterStateResolution {
  return withEncounterStateAt(bindings, state, SUBJECT, lastPosition(state), {
    authority: ROGUE,
    fallback: PROVEN,
    ...query,
  });
}

function outcomeOf(expression: string, bindings: AtomBindings): "TRUE" | "FALSE" | "UNKNOWN" {
  const parsed = parseSimcExpression(expression, VOCABULARY);
  if (!parsed.ok) throw new Error(`does not parse: ${expression}`);
  const evaluation = evaluateSimcExpression(parsed.ast, expression, bindings, NO_ACTING_ACTION);
  if (evaluation.outcome !== "RESOLVED") return "UNKNOWN";
  return evaluation.value ? "TRUE" : "FALSE";
}

function actionOf(line: string): AplAction {
  const loaded = loadAplAuthority(syntheticArtifact({ lists: [{ listName: "default", actions: [line] }] }));
  if (!loaded.ok) throw new Error(loaded.detail);
  const lookup = loaded.authority.actionsInList("default");
  const [action] = lookup.found ? lookup.actions : [];
  if (action === undefined) throw new Error("no action");
  return action;
}

const factAtoms = (resolution: EncounterStateResolution): readonly (string | null)[] =>
  resolution.profileFacts.map((fact) => fact.atomKey);

const CITATION: EncounterStateCitation = {
  datasetId: "d",
  datasetRevision: "r",
  datumId: "x",
  acquisitionRuleId: "a",
  evidencePredicate: "p",
  sourceCorpusRevision: "c",
  window: "w",
  completeness: "COMPLETE",
  sourcePulls: [{ reportCode: "R", fightId: 1 }],
};
const curatedUpperBound = (upperBound: number): EncounterStateSupplier => ({
  upperBoundAt: () => ({ upperBound, provenance: CITATION }),
  targetDomainClosureAt: () => ({ closure: "OPEN", provenance: "" }),
});

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

describe("the pinned environment record", () => {
  const dataset = SIMC_PROFILE_ENVIRONMENT;
  const aplFiles = readdirSync("src/simc/data", { recursive: true, withFileTypes: false }).filter((name) =>
    name.endsWith(".apl.json"),
  );
  const readApl = (name: string) =>
    JSON.parse(readFileSync(join("src/simc/data", name), "utf8")) as {
      authorityId: string;
      spec: { className: string; specName: string };
    };

  it("is at the analyzer pin, first, and every model is an approved registered one", () => {
    expect(dataset.source.analyzerPin).toBe(ANALYZER_AUTHORITY_MODEL.simcCommit);
    expect(dataset.models[0]?.simcCommit).toBe(ANALYZER_AUTHORITY_MODEL.simcCommit);
    expect(dataset.models[0]?.gameDataBuild).toBe(ANALYZER_AUTHORITY_MODEL.gameDataBuild);
    for (const model of dataset.models) {
      expect(
        SIMULATION_MODELS.some(
          (registered) =>
            registered.pin.simcCommit === model.simcCommit &&
            registered.pin.gameDataBuild === model.gameDataBuild,
        ),
        model.gameDataBuild,
      ).toBe(true);
    }
    expect(dataset.models.map((model) => model.gameDataBuild)).toEqual(["12.1.0.69587", "12.1.0.69933"]);
  });

  it("every model cites every semantic, and reads each one the same", () => {
    const ids = ENGINE_SEMANTICS.map((semantic) => semantic.semanticId);
    const [pin] = dataset.models;
    for (const model of dataset.models) {
      expect(model.semantics.map((semantic) => semantic.semanticId)).toEqual(ids);
      expect(model.semantics.map((semantic) => semantic.excerptSha256)).toEqual(
        pin?.semantics.map((semantic) => semantic.excerptSha256),
      );
    }
  });

  it("holds exactly the specializations with an APL, each on its own base profile, none setting the environment", () => {
    expect(dataset.specializations.map((entry) => entry.aplAuthorityId).sort()).toEqual(
      aplFiles.map((name) => readApl(name).authorityId).sort(),
    );
    for (const name of aplFiles) {
      const apl = readApl(name);
      const record = dataset.specializations.find((entry) => entry.aplAuthorityId === apl.authorityId);
      const stem = profileStemOf(apl.spec.className, apl.spec.specName);
      expect(record?.profiles[0]?.path, name).toBe(`profiles/MID1/${stem}.simc`);
      for (const profile of record?.profiles ?? []) {
        expect(profile.path, name).toMatch(new RegExp(`/${stem}[._]`));
        expect(profile.environmentOptionLines, profile.path).toEqual([]);
      }
    }
  });

  it("states the documented default: Patchwerk, one target, no raid events, distance targeting off", () => {
    expect(dataset.engineDefaultEnvironment).toEqual({
      fightStyle: "Patchwerk",
      targetCount: 1,
      raidEventCount: 0,
      distanceTargetingEnabled: false,
    });
  });

  it("the extractor finds environment options, ignores comments, and refuses an ambiguous citation", () => {
    expect(
      environmentOptionLinesOf(
        ["# fight_style=DungeonSlice", "spec=arms", "desired_targets=3", " raid_events+=/adds,count=2"].join(
          "\n",
        ),
      ),
    ).toEqual(["desired_targets=3", "raid_events+=/adds,count=2"]);
    const [semantic] = ENGINE_SEMANTICS;
    if (semantic === undefined) throw new Error("no semantic");
    expect(() => citeSemantic(semantic, `${semantic.anchor}\n${semantic.anchor}\n`)).toThrow(/2 times/);
    expect(() => citeSemantic(semantic, "nothing here\n")).toThrow(/0 times/);
  });
});

// ---------------------------------------------------------------------------
// The tiers
// ---------------------------------------------------------------------------

describe("the enemy count, by precedence", () => {
  it("tier 3 answers when nothing real does: exactly the profile's 1", () => {
    const resolved = resolveAt(NO_MEMBER());
    expect(resolved.enemyCount).toMatchObject({ tier: "SIMC_PROFILE_FALLBACK", reason: "OPEN" });
    expect(outcomeOf("active_enemies=1", resolved.bindings)).toBe("TRUE");
    expect(outcomeOf("active_enemies>=3", resolved.bindings)).toBe("FALSE");
    expect(factAtoms(resolved)).toContain("active_enemies");
  });

  it("a lower bound the profile agrees with does not contradict it", () => {
    const resolved = resolveAt(ONE_MEMBER());
    expect(resolved.enemyCount).toMatchObject({ tier: "SIMC_PROFILE_FALLBACK", observedLowerBound: 1 });
    expect(outcomeOf("active_enemies=1", resolved.bindings)).toBe("TRUE");
  });

  it("a proven lower bound above it wins: 2 makes =1 FALSE and leaves >=3 UNKNOWN", () => {
    const state = TWO_MEMBERS();
    const resolved = resolveAt(state);
    expect(resolved.enemyCount).toMatchObject({
      tier: "OBSERVED_OR_PROVEN",
      reason: "PROVEN_ABOVE_PROFILE",
      observedLowerBound: 2,
    });
    expect(outcomeOf("active_enemies=1", resolved.bindings)).toBe("FALSE");
    expect(outcomeOf("active_enemies>=2", resolved.bindings)).toBe("TRUE");
    expect(outcomeOf("active_enemies>=3", resolved.bindings)).toBe("UNKNOWN");
    expect(factAtoms(resolved)).not.toContain("active_enemies");
    // The same reading as with no fallback at all.
    const plain = withEnemyCountAt(BINDINGS, state, SUBJECT, lastPosition(state));
    expect(resolved.bindings.specAtoms?.bound.filter((entry) => entry.key === "active_enemies")).toEqual(
      plain.specAtoms?.bound,
    );
  });

  it("a contradiction takes away everything that rests on the count, and only that", () => {
    const resolved = resolveAt(TWO_MEMBERS(), {
      soleTargetAttestations: [{ simcToken: "x", provenance: "test citation" }],
    });
    const atoms = factAtoms(resolved);
    for (const key of [
      "spell_targets",
      "spell_targets.cleave",
      "raid_event.adds.exists",
      "raid_event.adds.in",
      "raid_event.pull.exists",
    ]) {
      expect(atoms, key).not.toContain(key);
      expect(
        resolved.bindings.specAtoms?.bound.some((entry) => entry.key === key),
        key,
      ).toBe(false);
    }
    expect(resolved.bindings.targetDomainFor).toBeUndefined();
    // An enemy count says nothing of a fight style or of a movement schedule.
    expect(atoms).toEqual(expect.arrayContaining(["fight_style.dungeonroute", "raid_event.movement.in"]));
  });

  it("a curated upper bound outranks the profile: the range stands, and tier 3 binds no count", () => {
    const resolved = resolveAt(ONE_MEMBER(), { supplier: curatedUpperBound(3) });
    expect(resolved.enemyCount).toMatchObject({ tier: "CURATED", reason: "CURATED_UPPER_BOUND" });
    expect(outcomeOf("active_enemies<=3", resolved.bindings)).toBe("TRUE");
    expect(outcomeOf("active_enemies=1", resolved.bindings)).toBe("UNKNOWN");
    expect(factAtoms(resolved)).not.toContain("active_enemies");
    expect(factAtoms(resolved)).not.toContain("spell_targets.cleave");
  });

  it("an exact curated count is tier 2", () => {
    const resolved = resolveAt(ONE_MEMBER(), { supplier: curatedUpperBound(1) });
    expect(resolved.enemyCount).toMatchObject({ tier: "CURATED" });
    expect(factAtoms(resolved)).not.toContain("active_enemies");
  });

  it("evidence that contradicts itself stays UNKNOWN: the profile does not settle a conflict", () => {
    const resolved = resolveAt(TWO_MEMBERS(), { supplier: curatedUpperBound(1) });
    expect(resolved.enemyCount).toMatchObject({
      tier: "NOT_ESTABLISHED",
      reason: "ENEMY_STATE_UNREADABLE",
    });
    expect(outcomeOf("active_enemies=1", resolved.bindings)).toBe("UNKNOWN");
    expect(outcomeOf("active_enemies>=2", resolved.bindings)).toBe("UNKNOWN");
  });

  it("an unreadable position stays UNKNOWN: an event gap is not the profile's 1", () => {
    const state = NO_MEMBER();
    const resolved = withEncounterStateAt(BINDINGS, state, SUBJECT, 9_999, {
      authority: ROGUE,
      fallback: PROVEN,
    });
    expect(resolved.enemyCount).toMatchObject({ reason: "ENEMY_STATE_UNREADABLE" });
    expect(outcomeOf("active_enemies=1", resolved.bindings)).toBe("UNKNOWN");
  });

  it("a failed page is not an unobservable gap: evidence not retrieved up to D never reads the profile's 1", () => {
    const events = [hit(2_000, BOSS), debuff(2_100, BOSS), decisionCast(5_000)];
    for (const state of [stateOf(events, { retrievedToMs: 3_000 }), stateOf(events, { auras: false })]) {
      const resolved = resolveAt(state);
      expect(resolved.enemyCount).toMatchObject({ reason: "ENEMY_EVIDENCE_INCOMPLETE" });
      expect(resolved.enemyCount?.tier).not.toBe("SIMC_PROFILE_FALLBACK");
      expect(outcomeOf("active_enemies=1", resolved.bindings)).toBe("UNKNOWN");
      expect(factAtoms(resolved)).not.toContain("active_enemies");
      expect(factAtoms(resolved)).not.toContain("spell_targets.cleave");
      expect(resolved.bindings.specAtoms?.bound.filter((entry) => entry.key === "active_enemies")).toEqual(
        withEnemyCountAt(BINDINGS, state, SUBJECT, lastPosition(state)).specAtoms?.bound,
      );
    }
  });

  it("a decision whose position is not established reads nothing at all", () => {
    const resolved = withEncounterStateAt(BINDINGS, NO_MEMBER(), SUBJECT, null, {
      authority: ROGUE,
      fallback: PROVEN,
    });
    expect(resolved.fallbackNotApplied).toBe("POSITION_NOT_ESTABLISHED");
    expect(resolved.bindings).toBe(BINDINGS);
  });

  it("through the priority list, an open count selects only with the fallback", () => {
    const authority = syntheticAuthority({
      lists: [{ listName: "default", actions: ["x,if=active_enemies>=2", "y"] }],
    });
    const scan = (bindings: AtomBindings) =>
      selectAcrossLists({
        authority,
        entryListName: "default",
        bindings,
        usabilityFor: () => provenUsable(),
        applicabilityFor: allApplicable(),
      });
    const state = ONE_MEMBER();
    expect(scan(resolveAt(state).bindings)).toMatchObject({ kind: "SELECTED", actionToken: "y" });
    // Unproven build: the same fight, stopped on its own line, never falling through.
    const notProven = resolveAt(state, {
      fallback: createSimcProfileFallback({ dataset: SIMC_PROFILE_ENVIRONMENT, gameBuildOf: () => null }),
    });
    const stopped = scan(notProven.bindings);
    expect(stopped.kind).toBe("UNKNOWN");
    if (stopped.kind === "UNKNOWN") expect(stopped.blockedAt?.priorityOrdinal).toBe(0);
  });
});

describe("the fallback never runs on an unproven build or profile", () => {
  const dataset = SIMC_PROFILE_ENVIRONMENT;
  const overriding: SimcProfileEnvironmentDataset = {
    ...dataset,
    specializations: dataset.specializations.map((entry) => ({
      ...entry,
      profiles: entry.profiles.map((profile, index) =>
        index === entry.profiles.length - 1
          ? { ...profile, environmentOptionLines: ["desired_targets=3"] }
          : profile,
      ),
    })),
  };

  it.each([
    ["no proven build", null, ROGUE, dataset, "BUILD_UNRESOLVED"],
    ["a build no model covers", "12.1.5.70000", ROGUE, dataset, "BUILD_NOT_COVERED"],
    [
      "a list with no record",
      COVERED_BUILD,
      { ...ROGUE, authorityId: "SIMC_APL_NOBODY" },
      dataset,
      "NO_PROFILE_RECORD",
    ],
    [
      "a list from another pin",
      COVERED_BUILD,
      { ...ROGUE, simcCommit: "f".repeat(40) },
      dataset,
      "PIN_MISMATCH",
    ],
    ["a profile that sets the environment", COVERED_BUILD, ROGUE, overriding, "PROFILE_SETS_ENVIRONMENT"],
  ] as const)("%s", (_name, build, authority, input, reason) => {
    expect(resolveSimcProfile(input, authority, build)).toEqual({ state: "NOT_PROVEN", reason });
    const state = ONE_MEMBER();
    const resolved = resolveAt(state, {
      authority,
      fallback: createSimcProfileFallback({ dataset: input, gameBuildOf: () => build }),
    });
    expect(resolved.fallbackNotApplied).toBe(reason);
    expect(resolved.profileFacts).toEqual([]);
    expect(resolved.bindings).toEqual(withEnemyCountAt(BINDINGS, state, SUBJECT, lastPosition(state)));
    expect(outcomeOf("active_enemies=1", resolved.bindings)).toBe("UNKNOWN");
    expect(outcomeOf("fight_style.dungeonroute", resolved.bindings)).toBe("UNKNOWN");
  });

  it("names no build for a fight the calendar does not prove", () => {
    const state = NO_MEMBER();
    expect(provenGameBuildOf(state.fight)).toBeNull();
    expect(
      withEncounterStateAt(BINDINGS, state, SUBJECT, lastPosition(state), { authority: ROGUE })
        .fallbackNotApplied,
    ).toBe("BUILD_UNRESOLVED");
  });

  it("the production fallback defaults to the calendar and the committed record", () => {
    expect(PRODUCTION_SIMC_PROFILE_FALLBACK.resolve(ROGUE, NO_MEMBER().fight)).toEqual({
      state: "NOT_PROVEN",
      reason: "BUILD_UNRESOLVED",
    });
  });
});

// ---------------------------------------------------------------------------
// The other facts
// ---------------------------------------------------------------------------

describe("what the profile establishes, and what it leaves open", () => {
  const bindings = (): AtomBindings => resolveAt(ONE_MEMBER()).bindings;

  it("fight_style is a name comparison, case-insensitively", () => {
    expect(outcomeOf("fight_style.dungeonroute", bindings())).toBe("FALSE");
    expect(outcomeOf("fight_style.patchwerk", bindings())).toBe("TRUE");
  });

  it("with no raid event, `in` is the largest timespan and any other filter 0", () => {
    expect(outcomeOf("raid_event.adds.exists", bindings())).toBe("FALSE");
    expect(outcomeOf("raid_event.pull.exists", bindings())).toBe("FALSE");
    expect(outcomeOf("raid_event.adds.in>600", bindings())).toBe("TRUE");
    expect(outcomeOf("raid_event.adds.remains>0", bindings())).toBe("FALSE");
    expect(outcomeOf("raid_event.movement.in<15", bindings())).toBe("FALSE");
    expect(outcomeOf("raid_event.movement.distance>0", bindings())).toBe("FALSE");
    expect(TIMESPAN_MAX_SECONDS).toBeCloseTo(9223372036854776, -3);
  });

  it("spell_targets is the pinned constant 1, bare and by ability", () => {
    expect(outcomeOf("spell_targets=1", bindings())).toBe("TRUE");
    expect(outcomeOf("spell_targets.cleave>=2", bindings())).toBe("FALSE");
  });

  it("an atom the caller already holds stands: an action's own count is stronger", () => {
    const held: AtomBindings = {
      ...BINDINGS,
      specAtoms: {
        vocabulary: VOCABULARY,
        bound: [
          {
            key: "spell_targets.cleave",
            actionToken: null,
            value: { kind: "MAGNITUDE", binding: knownNumber(4) },
          },
        ],
      },
    };
    const resolved = resolveAt(ONE_MEMBER(), {}, held);
    expect(outcomeOf("spell_targets.cleave>=2", resolved.bindings)).toBe("TRUE");
    expect(factAtoms(resolved)).not.toContain("spell_targets.cleave");
  });

  it("a resolver's UNKNOWN placeholder is no reading, and the profile replaces it (SIMC-FB-R)", () => {
    const placeholder: AtomBindings = {
      ...BINDINGS,
      specAtoms: {
        vocabulary: VOCABULARY,
        bound: [
          {
            key: "spell_targets.cleave",
            actionToken: null,
            value: { kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") },
          },
        ],
      },
    };
    const resolved = resolveAt(ONE_MEMBER(), {}, placeholder);
    expect(outcomeOf("spell_targets.cleave>=2", resolved.bindings)).toBe("FALSE");
    expect(factAtoms(resolved)).toContain("spell_targets.cleave");
    expect(
      resolved.bindings.specAtoms?.bound.filter((entry) => entry.key === "spell_targets.cleave"),
    ).toHaveLength(1);
  });

  it("a contradiction leaves that placeholder UNKNOWN: a proven enemy says nothing about the geometry", () => {
    const placeholder: AtomBindings = {
      ...BINDINGS,
      specAtoms: {
        vocabulary: VOCABULARY,
        bound: [
          {
            key: "spell_targets.cleave",
            actionToken: null,
            value: { kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") },
          },
        ],
      },
    };
    const resolved = resolveAt(TWO_MEMBERS(), {}, placeholder);
    expect(outcomeOf("spell_targets.cleave>=2", resolved.bindings)).toBe("UNKNOWN");
    expect(factAtoms(resolved)).not.toContain("spell_targets.cleave");
  });

  it("answers nothing the profile leaves open: a variable, a target's state, a predictive read", () => {
    const resolved = bindings();
    expect(outcomeOf("max_prio_damage", resolved)).toBe("UNKNOWN");
    expect(outcomeOf("player_flag", resolved)).toBe("UNKNOWN");
    expect(outcomeOf("debuff.bar.down", resolved)).toBe("UNKNOWN");
    expect(outcomeOf("target_magnitude>0", resolved)).toBe("UNKNOWN");
    expect(outcomeOf("fight_remains>10", resolved)).toBe("UNKNOWN");
  });

  it("refuses a self-addressing declaration, a malformed identifier and another environment", () => {
    const environment = SIMC_PROFILE_ENVIRONMENT.engineDefaultEnvironment;
    expect(profileAtomBinding(declare("spell_targets", "NUMERIC", true), environment)).toBeNull();
    expect(profileAtomBinding(declare("raid_event.adds", "NUMERIC"), environment)).toBeNull();
    expect(profileAtomBinding(declare("fight_style", "BOOLEAN"), environment)).toBeNull();
    expect(profileAtomBinding(declare("active_dot.x", "NUMERIC"), environment)).toBeNull();
    for (const other of [
      { ...environment, raidEventCount: 1 },
      { ...environment, targetCount: 2 },
      { ...environment, distanceTargetingEnabled: true },
    ]) {
      expect(profileAtomBinding(declare("spell_targets.x", "NUMERIC"), other)).toBeNull();
    }
    expect(
      profileAtomBinding(declare("raid_event.adds.exists", "BOOLEAN"), { ...environment, raidEventCount: 1 }),
    ).toBeNull();
  });

  it("a list that declares none of these gains nothing", () => {
    const unrelated = defineSpecAtomVocabulary(
      "test/other",
      [declare("player_flag", "BOOLEAN")],
      isBuiltinIdentifier,
    );
    const input: AtomBindings = { ...BINDINGS, specAtoms: { vocabulary: unrelated, bound: [] } };
    const resolved = resolveAt(ONE_MEMBER(), {}, input);
    expect(resolved.bindings.specAtoms?.bound).toEqual([]);
    expect(resolved.profileFacts).toEqual([]);
    const { specAtoms: _ignored, ...noAtoms } = BINDINGS;
    expect(resolveAt(ONE_MEMBER(), {}, noAtoms).fallbackNotApplied).toBe("NO_DECLARED_ATOMS");
  });
});

// ---------------------------------------------------------------------------
// target_if
// ---------------------------------------------------------------------------

describe("target_if over the profile's one target", () => {
  const ATTESTED = { soleTargetAttestations: [{ simcToken: "x", provenance: "test citation" }] } as const;
  const overProfile = (base: AtomBindings = BINDINGS) => resolveAt(ONE_MEMBER(), ATTESTED, base).bindings;
  const verdict = (line: string, bindings: AtomBindings = overProfile()) =>
    targetIfVerdict(actionOf(line), bindings);
  const withDown = (value: boolean): AtomBindings => ({
    ...BINDINGS,
    specAtoms: {
      vocabulary: VOCABULARY,
      bound: [{ key: "debuff.bar.down", actionToken: null, value: { kind: "TRUTH", value } }],
    },
  });

  it("an action its owner did not attest gets no domain, and reads as before", () => {
    const unattested = resolveAt(ONE_MEMBER()).bindings;
    expect(unattested.targetDomainFor).toBeUndefined();
    expect(verdict("x,target_if=first:debuff.bar.down", unattested)).toMatchObject({
      kind: "REFUSED",
      reason: "FIRST_MODE_NEEDS_ENEMY_SET",
    });
    expect(overProfile().targetDomainFor?.("other_action")).toBeNull();
    const noCitation = resolveAt(ONE_MEMBER(), {
      soleTargetAttestations: [{ simcToken: "x", provenance: "" }],
    }).bindings;
    expect(noCitation.targetDomainFor).toBeUndefined();
  });

  it("states one closed candidate, never an observed actor", () => {
    const domain = overProfile().targetDomainFor?.("x");
    expect(domain).toMatchObject({ closure: "CLOSED", universe: "PROFILE_SOLE_TARGET" });
    expect(domain?.candidates.map((candidate) => candidate.key)).toEqual(["SIMC_PROFILE_TARGET"]);
    expect(domain?.candidates[0]?.overlay).toEqual({});
    expect(domain?.provenance).toContain("TARGET_IF_WITH_ONE_CANDIDATE");
  });

  it("MIN and MAX need no score: the pinned branch returns the target without evaluating it", () => {
    expect(verdict("x,target_if=min:debuff.foo.remains")).toMatchObject({
      kind: "TARGET_SELECTION_IGNORABLE",
      scoreFiniteness: null,
      condition: "ABSENT",
    });
    expect(verdict("x,target_if=max:target_magnitude,if=combo_points>=5")).toMatchObject({
      kind: "TARGET_SELECTION_IGNORABLE",
      condition: "PLAYER_SCOPED",
    });
  });

  it("a closed domain of one observed enemy gets no such rule", () => {
    const observed: AtomBindings = {
      ...BINDINGS,
      targetDomainFor: () => ({
        closure: "CLOSED",
        candidates: [{ key: "a", targetReady: "PROVEN_READY", overlay: {} }],
        provenance: "curated",
      }),
    };
    expect(verdict("x,target_if=min:debuff.foo.remains", observed)).toMatchObject({ kind: "REFUSED" });
  });

  it("a target-scoped `if=` reads what an ordinary line reads on the real target, and stays open when that is unbound", () => {
    const line = "x,target_if=min:debuff.foo.remains,if=debuff.bar.down";
    expect(verdict(line)).toMatchObject({ kind: "REFUSED", reason: "TARGET_DOMAIN_NOT_CONVERGED" });
    expect(verdict(line, overProfile(withDown(true)))).toMatchObject({
      kind: "TARGET_SELECTION_IGNORABLE",
      condition: "TRUE_ON_EVERY_CANDIDATE",
    });
    expect(verdict(line, overProfile(withDown(false)))).toMatchObject({
      kind: "ELIMINATED_FOR_EVERY_TARGET",
    });
  });

  it("FIRST reads its score on the one target, truth-valued or not at all", () => {
    expect(verdict("x,target_if=first:debuff.bar.down", overProfile(withDown(false)))).toMatchObject({
      kind: "ELIMINATED_FOR_EVERY_TARGET",
    });
    expect(verdict("x,target_if=first:debuff.bar.down", overProfile(withDown(true)))).toMatchObject({
      kind: "TARGET_SELECTION_IGNORABLE",
    });
    expect(verdict("x,target_if=first:debuff.bar.down")).toMatchObject({ kind: "REFUSED" });
    expect(verdict("x,target_if=first:target_magnitude")).toMatchObject({ kind: "REFUSED" });
  });

  it("no domain on a contradiction, on a curated closed one, or over one the owner stated", () => {
    expect(resolveAt(TWO_MEMBERS(), ATTESTED).bindings.targetDomainFor).toBeUndefined();
    const curatedClosed: EncounterStateSupplier = {
      upperBoundAt: () => null,
      targetDomainClosureAt: () => ({ closure: "CLOSED", provenance: "curated" }),
    };
    expect(
      resolveAt(ONE_MEMBER(), { ...ATTESTED, supplier: curatedClosed }).bindings.targetDomainFor?.("x"),
    ).toBeNull();
    const own = { closure: "OPEN", candidates: [], provenance: "" } as const;
    expect(overProfile({ ...BINDINGS, targetDomainFor: () => own }).targetDomainFor?.("x")).toBe(own);
  });
});

// ---------------------------------------------------------------------------
// Provenance and boundaries
// ---------------------------------------------------------------------------

describe("provenance", () => {
  it("names the pin, the build, the profile, the environment and the semantic of every binding", () => {
    const resolved = resolveAt(ONE_MEMBER());
    const count = resolved.profileFacts.find((fact) => fact.atomKey === "active_enemies");
    expect(count).toMatchObject({
      category: "SIMC_PROFILE_FALLBACK",
      fact: "ACTIVE_ENEMIES",
      simcCommit: ANALYZER_AUTHORITY_MODEL.simcCommit,
      clientBuild: COVERED_BUILD,
      aplAuthorityId: ROGUE.authorityId,
      profilePath: "profiles/MID1/MID1_Rogue_Assassination.simc",
      environment: { fightStyle: "Patchwerk", targetCount: 1, raidEventCount: 0 },
      semantic: { semanticId: "ACTIVE_ENEMIES_IS_CONSTANT_ONE", sourcePath: "engine/sim/sim.cpp" },
    });
    expect(
      resolved.profileFacts.find((fact) => fact.atomKey === "spell_targets.cleave")?.semantic.semanticId,
    ).toBe("SPELL_TARGETS_WITHOUT_DISTANCE_TARGETING");
  });

  it("is never observed evidence: nothing in it claims Warcraft Logs, a capture or a report", () => {
    const resolved = resolveAt(ONE_MEMBER());
    expect(resolved.profileFacts.length).toBeGreaterThan(0);
    for (const fact of resolved.profileFacts) {
      expect(fact.category).toBe("SIMC_PROFILE_FALLBACK");
      expect(Object.keys(fact)).not.toEqual(expect.arrayContaining(["reportCode"]));
      expect(JSON.stringify(fact)).not.toMatch(
        /WCL|warcraftlogs|reportCode|ARCHIVED_CAPTURE|SANITIZED_CAPTURE/i,
      );
    }
    expect(resolved.enemyCount?.tier).not.toBe("OBSERVED_OR_PROVEN");
  });

  it("every fact is reported, and a binding with no reported fact does not exist", () => {
    const resolved = resolveAt(ONE_MEMBER());
    const bound = resolved.bindings.specAtoms?.bound.map((entry) => entry.key) ?? [];
    expect([...bound].sort()).toEqual(
      resolved.profileFacts.flatMap((fact) => (fact.atomKey === null ? [] : [fact.atomKey])).sort(),
    );
  });
});

describe("boundaries", () => {
  const source = (path: string): string => readFileSync(path, "utf8");
  const code = (path: string): string =>
    source(path)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  const SHARED = [
    "src/findings/simc-profile-fallback.ts",
    "src/findings/proven-fight-build.ts",
    "src/simc/expression/profile-environment-atoms.ts",
    "src/data/simc-profile/simc-profile-environment.ts",
  ];

  it("the shared code knows no specialization and no encounter", () => {
    for (const path of SHARED) {
      expect(code(path), path).not.toMatch(
        /b(deathknight|paladin|rogue|monk|warlock|warrior|hunter|druid|mage|priest|shaman|evoker|demonhunter|assassination|specId|encounterId)b/i,
      );
    }
  });

  it("it answers APL inputs and makes no decision actionable", () => {
    for (const path of SHARED) {
      expect(code(path), path).not.toMatch(/ACTIONABLE|actionability/i);
    }
  });

  it("no public analyzer and no public path reads it", () => {
    const importsIt = (path: string): boolean =>
      /simc-profile-fallback|proven-fight-build|profile-environment-atoms|simc-profile-environment/.test(
        source(path),
      );
    const files = (directory: string): string[] =>
      readdirSync(directory, { recursive: true, withFileTypes: false })
        .filter((name) => name.endsWith(".ts"))
        .map((name) => join(directory, name));
    for (const spec of PUBLIC_SPEC_IDS) {
      for (const path of files(join("src/specs", spec))) expect(importsIt(path), path).toBe(false);
    }
    for (const root of ["src/api", "src/mcp", "src/contracts", "src/services", "src/reporting"]) {
      for (const path of files(root)) expect(importsIt(path), path).toBe(false);
    }
  });

  it("no production path passes a curated upper bound yet, so tier 2 is honestly empty", () => {
    const state = ONE_MEMBER();
    expect(
      PRODUCTION_ENCOUNTER_STATE_SUPPLIER.upperBoundAt(state, {
        anchor: "BEFORE_EVENT",
        position: lastPosition(state),
      }),
    ).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Real evidence
// ---------------------------------------------------------------------------

describe("real evidence: b1PmaKrd6CDfzngc fight 48, the whole-fight Blood capture", () => {
  const BLOOD_ACTOR = 15;
  let fight: CombatFight;
  let state: CombatState;
  let casts: readonly number[];
  let authority: AplAuthorityIdentity;

  beforeAll(async () => {
    const loaded = await loadCommittedEvidenceArchive();
    if (!loaded.ok) throw new Error("archive does not load");
    const segments = ["0-45", "45-113", "113-151", "151-214", "214-263", "263-311", "311-345"].map(
      (name) => `wcl-blood-death-knight-b1pm-full-fight-owned-pets.seg-${name}`,
    );
    const captured = bundleOf(loaded.archive, segments, [], {
      catalogArtifactId: "wcl-fight-context-b1pm-fight-48",
    }).fight;
    // The bundle's report header is a stand-in, so the real report's time and region are restated from
    // the committed context and region captures, which `subjectRegion` checks against each other.
    const { code, reportStartUnixMs } = subjectContextFight();
    fight = {
      ...captured,
      report: { ...captured.report, code, startTimeUnixMs: reportStartUnixMs, region: subjectRegion() },
    };
    state = createCombatState(fight);
    casts = fight.events.flatMap((event, position) =>
      event.kind === "CAST" && event.source?.actorId === BLOOD_ACTOR ? [position] : [],
    );
    const apl = loadAplAuthority(
      JSON.parse(readFileSync("src/simc/data/deathknight-blood.apl.json", "utf8")),
    );
    if (!apl.ok) throw new Error(apl.detail);
    authority = aplAuthorityIdentityOf(apl.authority);
  });

  const atCast = (position: number): EncounterStateResolution =>
    withEncounterStateAt(BINDINGS, state, BLOOD_ACTOR, position, { authority });

  it("the calendar proves this fight's build, and the record covers it", () => {
    expect(provenGameBuildOf(fight)).toBe(COVERED_BUILD);
    expect(PRODUCTION_SIMC_PROFILE_FALLBACK.resolve(authority, fight).state).toBe("PROVEN");
  });

  it("the same fight with no region is not proven, so nothing is bound", () => {
    const { region: _region, ...report } = fight.report;
    const unproven: CombatFight = { ...fight, report: { ...report, region: { state: "NOT_RETRIEVED" } } };
    expect(provenGameBuildOf(unproven)).toBeNull();
    expect(PRODUCTION_SIMC_PROFILE_FALLBACK.resolve(authority, unproven)).toEqual({
      state: "NOT_PROVEN",
      reason: "BUILD_UNRESOLVED",
    });
  });

  it("every real decision reads tier 3 only where no real enemy contradicts it", () => {
    const seen = { fallback: 0, contradicted: 0 };
    expect(casts.length).toBeGreaterThan(0);
    for (const position of casts) {
      const resolved = atCast(position);
      const lowerBound = resolved.enemyCount?.observedLowerBound ?? 0;
      if (lowerBound <= 1) {
        expect(resolved.enemyCount?.tier, String(position)).toBe("SIMC_PROFILE_FALLBACK");
        expect(outcomeOf("active_enemies=1", resolved.bindings), String(position)).toBe("TRUE");
        seen.fallback += 1;
      } else {
        expect(resolved.enemyCount?.reason, String(position)).toBe("PROVEN_ABOVE_PROFILE");
        expect(outcomeOf("active_enemies=1", resolved.bindings), String(position)).toBe("FALSE");
        expect(outcomeOf("spell_targets.cleave=1", resolved.bindings), String(position)).toBe("UNKNOWN");
        expect(factAtoms(resolved), String(position)).not.toContain("active_enemies");
        // The real bound is what is read, exactly as with no fallback.
        const plain = withEnemyCountAt(BINDINGS, state, BLOOD_ACTOR, position);
        expect(
          resolved.bindings.specAtoms?.bound.find((entry) => entry.key === "active_enemies"),
          String(position),
        ).toEqual(plain.specAtoms?.bound.find((entry) => entry.key === "active_enemies"));
        seen.contradicted += 1;
      }
    }
    expect(seen).toEqual({ fallback: REAL_FALLBACK_DECISIONS, contradicted: REAL_CONTRADICTED_DECISIONS });
  });

  it("no future evidence: dropping every event after a decision leaves its reading unchanged", () => {
    const position = casts[Math.floor(casts.length / 2)];
    if (position === undefined) throw new Error("no cast");
    const truncated = createCombatState({ ...fight, events: fight.events.slice(0, position + 1) });
    const later = withEncounterStateAt(BINDINGS, truncated, BLOOD_ACTOR, position, { authority });
    expect(later.enemyCount).toEqual(atCast(position).enemyCount);
    expect(later.bindings.specAtoms?.bound).toEqual(atCast(position).bindings.specAtoms?.bound);
  });
});

/** Measured on the committed capture. A change here is a change in what real evidence proves. */
const REAL_FALLBACK_DECISIONS = 661;
const REAL_CONTRADICTED_DECISIONS = 7;
