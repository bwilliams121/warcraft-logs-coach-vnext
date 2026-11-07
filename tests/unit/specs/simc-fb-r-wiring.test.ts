/**
 * SIMC-FB-R: each INTERNAL_ONLY specialization reads the shared SimC profile fallback, and discloses it.
 *
 * The contract test in `simc-fb-b-disclosure-contract` checks a tree and not a decision, so this checks
 * each wiring, through the production row: the analyzer the catalog lists and the view shared code reads.
 *
 * It proves the wiring and no gameplay result. Casts here are synthetic, so nothing here is observation
 * evidence, and the real replay's numbers are in agent/architecture.md "SIMC-FB-R".
 */

import { existsSync, readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

import { inclusiveRange } from "../../../src/engine/evidence/coverage.js";
import type { CombatActor } from "../../../src/engine/normalization/actors.js";
import type { CombatFight } from "../../../src/engine/normalization/combat-fight.js";
import { createNormalizer } from "../../../src/engine/normalization/event-normalizer.js";
import type { CombatEvent } from "../../../src/engine/normalization/normalized-events.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../../src/engine/normalization/supported-families.js";
import { createCombatState } from "../../../src/engine/state/combat-state.js";
import type { AnalyzedEnvelope } from "../../../src/findings/analysis-envelope.js";
import type { ObservedDecisionView } from "../../../src/findings/observed-decision-view.js";
import { provenGameBuildOf } from "../../../src/findings/proven-fight-build.js";
import {
  withEncounterStateAt,
  type SimcProfileProvenance,
  type SoleTargetAttestation,
} from "../../../src/findings/simc-profile-fallback.js";
import type { SpecId } from "../../../src/findings/spec-id.js";
import { internalAnalyzerForSpec } from "../../../src/services/analyzer-registry.js";
import { ANALYZER_AUTHORITY_MODEL } from "../../../src/simc/analyzer-authority-model.js";
import { knownNumber } from "../../../src/simc/expression/evaluate.js";
import { isBuiltinIdentifier } from "../../../src/simc/expression/parse.js";
import { defineSpecAtomVocabulary } from "../../../src/simc/expression/spec-vocabulary.js";
import { DEATHKNIGHT_FROST_SOLE_TARGET_ATTESTATIONS } from "../../../src/specs/deathknight/frost/sole-target-attestations.js";
import { loadCommittedEvidenceArchive } from "../../support/corpus/evidence-archive.js";
import { stateOf } from "../../support/corpus/fight.js";
import { subjectContextFight, subjectRegion } from "../../support/environment/subject-environment.js";
import {
  castEvent,
  observableCategory,
  syntheticFight,
  UNVERIFIED_CATEGORY,
} from "../../support/synthetic-fight.js";

const START = 1_000;
const END = 90_000;
const SUBJECT = 7;
const BOSS = 21;
const OTHER_BOSS = 22;
/** Inside the US interval the deploy calendar proves for 12.1.0.69933. */
const REPORT_START = Date.parse("2026-10-01T01:00:00.000Z");
const PROVEN_BUILD = "12.1.0.69933";

const WIRED: readonly SpecId[] = [
  "warrior/arms",
  "warrior/fury",
  "warrior/protection",
  "deathknight/frost",
  "deathknight/unholy",
  "shaman/enhancement",
  "shaman/elemental",
  "demonhunter/devourer",
  "demonhunter/vengeance",
  "druid/feral",
  "druid/balance",
  "druid/guardian",
  "rogue/outlaw",
  "rogue/subtlety",
  "monk/windwalker",
  "hunter/beast_mastery",
  "hunter/survival",
  "hunter/marksmanship",
  "warlock/destruction",
  "warlock/affliction",
  "warlock/demonology",
  "priest/shadow",
  "mage/arcane",
  "mage/fire",
  "mage/frost",
  "evoker/devastation",
];

/** Facts resting on the profile's enemy count, which real evidence can take away. */
const COUNT_FACTS = ["ACTIVE_ENEMIES", "SPELL_TARGETS", "ADD_AND_PULL_SCHEDULE", "TARGET_DOMAIN"];

interface Row {
  readonly simcToken: string;
  readonly candidateAbilityGameIds: readonly number[];
}

/** One id per token the pinned lane data calls a GCD action, so each spec has presses to judge. */
function pressesOf(specId: SpecId): readonly number[] {
  const data = JSON.parse(
    readFileSync(`src/data/game/${specId.replace("/", "-")}-gcd-semantics.json`, "utf8"),
  ) as {
    abilities: readonly { abilityGameId: number; baseGcdMs: number | null }[];
    tokenBindings: readonly Row[];
  };
  const onGcd = new Set(
    data.abilities.filter((row) => (row.baseGcdMs ?? 0) > 0).map((row) => row.abilityGameId),
  );
  return data.tokenBindings
    .map((row) => row.candidateAbilityGameIds.find((id) => onGcd.has(id)))
    .filter((id): id is number => id !== undefined)
    .slice(0, 20);
}

function combatantInfo(): CombatEvent {
  return {
    locator: {
      streamId: "all",
      pageOrdinal: 0,
      indexInPage: 0,
      ingestionOrdinal: 0,
      rawType: "combatantinfo",
      reportTimeMs: START,
    },
    ingestionOrdinal: 0,
    reportTimeMs: START,
    fightTimeMs: 0,
    rawType: "combatantinfo",
    source: { actorId: SUBJECT, instanceId: null },
    target: null,
    sourceAbsence: null,
    targetAbsence: "NOT_SUPPLIED",
    abilityGameId: null,
    attachedResources: null,
    outsideRequestedRange: false,
    kind: "COMBATANT_INFO",
    snapshot: { actorId: SUBJECT, specId: 0, gear: [], malformedGearRows: [], talentTree: [] },
  } as unknown as CombatEvent;
}

type Region = CombatFight["report"]["region"];

function fightOf(specId: SpecId, region: Region, damageRetrieved = true): CombatFight {
  const events: CombatEvent[] = [combatantInfo()];
  pressesOf(specId).forEach((abilityGameId, index) => {
    events.push(
      castEvent({
        ordinal: index + 1,
        reportTimeMs: START + 2_000 * (index + 1),
        sourceActorId: SUBJECT,
        targetActorId: BOSS,
        abilityGameId,
        castPhase: "COMPLETE",
      }),
    );
  });
  const whole = observableCategory(inclusiveRange(START, END), null);
  const fight = syntheticFight({
    focusActorId: SUBJECT,
    events,
    startTimeMs: START,
    endTimeMs: END,
    categories: { CASTS: whole, AURAS: whole, DAMAGE: damageRetrieved ? whole : UNVERIFIED_CATEGORY },
  });
  return { ...fight, report: { ...fight.report, startTimeUnixMs: REPORT_START, region } };
}

function run(specId: SpecId, fight: CombatFight) {
  const row = internalAnalyzerForSpec(specId);
  if (row === null) throw new Error(`no row for ${specId}`);
  const analysis = row.analyze({
    state: createCombatState(fight),
    actorId: SUBJECT,
    specId,
    targetActorId: null,
  });
  if (analysis.status !== "ANALYZED") throw new Error(`${specId}: ${analysis.status}`);
  const envelope = analysis as AnalyzedEnvelope & {
    readonly resolved: readonly { readonly profileFacts: readonly SimcProfileProvenance[] }[];
  };
  return { envelope, view: row.observedDecisionView(envelope) };
}

const factsOf = (view: ObservedDecisionView): readonly string[] =>
  view.decisions.flatMap((decision) => (decision.simcProfileFacts ?? []).map((fact) => fact.fact));

const US: Region = { state: "KNOWN", slug: "US" };

describe.each(WIRED)("%s reads the fallback", (specId) => {
  it("is INTERNAL_ONLY: nothing here reaches a public caller", () => {
    expect(internalAnalyzerForSpec(specId)?.exposure).toBe("INTERNAL_ONLY");
  });

  it("carries each decision's tier-3 facts into its view, decision by decision", () => {
    const fight = fightOf(specId, US);
    expect(provenGameBuildOf(fight)).toBe(PROVEN_BUILD);
    const { envelope, view } = run(specId, fight);
    expect(view.decisions.length).toBeGreaterThan(0);
    expect(envelope.resolved).toHaveLength(view.decisions.length);
    expect(factsOf(view).length).toBeGreaterThan(0);
    view.decisions.forEach((decision, index) => {
      const facts = envelope.resolved[index]?.profileFacts ?? [];
      if (facts.length === 0) expect(decision).not.toHaveProperty("simcProfileFacts");
      else expect(decision.simcProfileFacts).toEqual(facts);
      for (const fact of facts) {
        expect(fact.category).toBe("SIMC_PROFILE_FALLBACK");
        expect(fact.clientBuild).toBe(PROVEN_BUILD);
      }
    });
  });

  it("names no report or Warcraft Logs source in what it discloses", () => {
    const { view } = run(specId, fightOf(specId, US));
    const disclosed = JSON.stringify(view.decisions.flatMap((decision) => decision.simcProfileFacts ?? []));
    expect(disclosed).not.toMatch(/aBcDeFgH12345678|warcraftlogs|WCL_/i);
  });

  it("binds nothing on a fight whose build is not proven, and states no profile fact", () => {
    for (const region of [{ state: "NOT_RETRIEVED" }, { state: "NOT_SUPPLIED" }] as const) {
      const { envelope, view } = run(specId, fightOf(specId, region));
      expect(factsOf(view)).toEqual([]);
      expect(view.decisions.every((decision) => !("simcProfileFacts" in decision))).toBe(true);
      expect(envelope.resolved.every((row) => row.profileFacts.length === 0)).toBe(true);
    }
  });

  it("does not read a failed page as an unobservable gap: nothing resting on the count is bound", () => {
    const { view } = run(specId, fightOf(specId, US, false));
    expect(factsOf(view).filter((fact) => COUNT_FACTS.includes(fact))).toEqual([]);
  });

  it("moves no actionability or usability claim", () => {
    const proven = run(specId, fightOf(specId, US)).view;
    const unproven = run(specId, fightOf(specId, { state: "NOT_RETRIEVED" })).view;
    expect(proven.decisions.map((decision) => decision.usabilityProvenance)).toEqual(
      unproven.decisions.map((decision) => decision.usabilityProvenance),
    );
  });
});

describe("what each owner attests for `target_if`", () => {
  const attestationsOf = async (specId: SpecId): Promise<readonly SoleTargetAttestation[] | null> => {
    const path = `src/specs/${specId}/sole-target-attestations.ts`;
    if (!existsSync(path)) return null;
    const module = (await import(`../../../${path}`)) as Record<string, unknown>;
    const [list] = Object.values(module);
    return list as readonly SoleTargetAttestation[];
  };
  const targetIfTokensOf = (specId: SpecId): ReadonlySet<string> => {
    const artifact = JSON.parse(
      readFileSync(`src/simc/data/${specId.replace("/", "-")}.apl.json`, "utf8"),
    ) as { lists: readonly { actions: readonly { actionStringVerbatim: string }[] }[] };
    return new Set(
      artifact.lists
        .flatMap((list) => list.actions)
        .map((action) => action.actionStringVerbatim)
        .filter((line) => /(^|,)target_if=/.test(line))
        .map((line) => line.split(",")[0] ?? ""),
    );
  };

  it.each(WIRED)("%s attests only its own list's target_if tokens, each with a citation", async (specId) => {
    const list = await attestationsOf(specId);
    const tokens = targetIfTokensOf(specId);
    // A list with `target_if` lines has a file, which records what it refused as well as what it attests.
    expect(list === null).toBe(tokens.size === 0);
    for (const row of list ?? []) {
      expect(tokens.has(row.simcToken), row.simcToken).toBe(true);
      expect(row.provenance).toMatch(/^engine\/class_modules\/\S+:\d+ \w+\. /);
    }
    if (list !== null) {
      expect(readFileSync(`src/specs/${specId}/observed-analysis.ts`, "utf8")).toContain(
        "_SOLE_TARGET_ATTESTATIONS",
      );
    }
  });

  it("no pseudo-action or self-aimed action is attested, nor anything from a warlock list", async () => {
    const never = new Set([
      "run_action_list",
      "variable",
      "retarget",
      "retarget_auto_attack",
      "prowl",
      "shadowmeld",
    ]);
    for (const specId of WIRED) {
      for (const row of (await attestationsOf(specId)) ?? []) {
        expect(never.has(row.simcToken), row.simcToken).toBe(false);
      }
    }
    for (const specId of ["warlock/affliction", "warlock/demonology", "warlock/destruction"] as const) {
      expect(await attestationsOf(specId)).toEqual([]);
    }
  });

  it("an attested action gets the profile's one target, and an unattested one gets no domain", () => {
    const fight = fightOf("deathknight/frost", US);
    const vocabulary = defineSpecAtomVocabulary(
      "deathknight/frost",
      [{ identifier: "active_enemies", shape: "NUMERIC", scope: "PLAYER_SCOPED", selfAddressing: false }],
      isBuiltinIdentifier,
    );
    const { bindings } = withEncounterStateAt(
      {
        comboPoints: knownNumber(0),
        comboPointsDeficit: knownNumber(0),
        energyPct: knownNumber(0),
        dotRemainsSecondsByAction: [],
        knownBuffs: [],
        specAtoms: { vocabulary, bound: [] },
      },
      createCombatState(fight),
      SUBJECT,
      1,
      {
        authority: {
          authorityId: "SIMC_APL_DEATHKNIGHT_FROST",
          simcCommit: ANALYZER_AUTHORITY_MODEL.simcCommit,
        },
        soleTargetAttestations: DEATHKNIGHT_FROST_SOLE_TARGET_ATTESTATIONS,
      },
    );
    expect(bindings.targetDomainFor?.("reapers_mark")).toMatchObject({
      closure: "CLOSED",
      universe: "PROFILE_SOLE_TARGET",
    });
    expect(bindings.targetDomainFor?.("not_attested") ?? null).toBeNull();
  });
});

describe("real evidence stands over the profile, through a real facade", () => {
  const WITHER_DEBUFF = 445474;
  const CONFLAGRATE = 17962;

  const actor = (actorId: number, actorType: CombatActor["actorType"]): [number, CombatActor] => [
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

  /** Destruction's own debuff on two enemies before the last press. */
  function destruction(): readonly (readonly string[])[] {
    const raw = [
      {
        timestamp: START,
        type: "combatantinfo",
        sourceID: SUBJECT,
        specID: 267,
        gear: [],
        fight: 1,
        talentTree: [],
      },
      {
        timestamp: 2_000,
        type: "cast",
        sourceID: SUBJECT,
        targetID: BOSS,
        abilityGameID: CONFLAGRATE,
        fight: 1,
      },
      ...[BOSS, OTHER_BOSS].map((targetID) => ({
        timestamp: 3_000,
        type: "damage",
        sourceID: SUBJECT,
        targetID,
        abilityGameID: CONFLAGRATE,
        amount: 100,
        fight: 1,
      })),
      ...[BOSS, OTHER_BOSS].map((targetID) => ({
        timestamp: 3_001,
        type: "applydebuff",
        sourceID: SUBJECT,
        targetID,
        abilityGameID: WITHER_DEBUFF,
        fight: 1,
      })),
      {
        timestamp: 4_000,
        type: "cast",
        sourceID: SUBJECT,
        targetID: BOSS,
        abilityGameID: CONFLAGRATE,
        fight: 1,
      },
    ];
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
    const whole = observableCategory(inclusiveRange(START, END), null);
    const fight = syntheticFight({
      focusActorId: SUBJECT,
      events: normalizer.finish().events,
      startTimeMs: START,
      endTimeMs: END,
      actors: new Map([actor(SUBJECT, "PLAYER"), actor(BOSS, "NPC"), actor(OTHER_BOSS, "NPC")]),
      categories: { CASTS: whole, AURAS: whole, DAMAGE: whole },
    });
    const { envelope } = run("warlock/destruction", {
      ...fight,
      report: { ...fight.report, startTimeUnixMs: REPORT_START, region: US },
    });
    return envelope.resolved.map((row) => row.profileFacts.map((fact) => fact.fact));
  }

  it("a proven second enemy takes the count from the profile, and the fight style stays", () => {
    const [before, after] = destruction();
    expect(before).toContain("ACTIVE_ENEMIES");
    expect(after).not.toContain("ACTIVE_ENEMIES");
    expect(after).not.toContain("ADD_AND_PULL_SCHEDULE");
  });
});

describe("real evidence: b1PmaKrd6CDfzngc fight 48, the committed first seconds of Arms Warrior", () => {
  let fight: CombatFight;

  beforeAll(async () => {
    const loaded = await loadCommittedEvidenceArchive();
    if (!loaded.ok) throw new Error("archive does not load");
    const artifact = loaded.archive.artifacts.find(
      (entry) => entry.record.artifactId === "wcl-b1pm-fight-48-arms-warrior-5-decisions.seg-0-6",
    );
    if (artifact === undefined) throw new Error("no Arms Warrior segment");
    const captured = stateOf(loaded.archive, artifact).fight;
    // The artifact's report header is a stand-in, so the report's time and region are restated from the
    // committed context and region captures, which `subjectRegion` checks against each other.
    const { code, reportStartUnixMs } = subjectContextFight();
    fight = {
      ...captured,
      report: { ...captured.report, code, startTimeUnixMs: reportStartUnixMs, region: subjectRegion() },
    };
  });

  it("on a proven build, a slice with no retained DAMAGE reads nothing from the profile, and none resolves", () => {
    // The slice grants CASTS, AURAS, RESOURCES and COMBATANT_INFO. Damage it does not hold could prove another
    // enemy, so the gap is missing evidence and not an unobservable one, as a failed page would be.
    expect(provenGameBuildOf(fight)).toBe(PROVEN_BUILD);
    const row = internalAnalyzerForSpec("warrior/arms");
    if (row === null) throw new Error("no row");
    const analysis = row.analyze({
      state: createCombatState(fight),
      actorId: 5,
      specId: "warrior/arms",
      targetActorId: null,
    });
    if (analysis.status !== "ANALYZED") throw new Error(analysis.status);
    const view = row.observedDecisionView(analysis as AnalyzedEnvelope);
    expect(view.decisions).toHaveLength(6);
    expect(view.coverage.unknown).toBe(6);
    expect(view.coverage.match).toBe(0);
    expect(view.coverage.rejected).toBe(0);
    expect(factsOf(view)).toEqual([]);
  });
});
