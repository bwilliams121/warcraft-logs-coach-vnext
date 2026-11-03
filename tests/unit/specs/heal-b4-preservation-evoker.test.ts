/**
 * HEAL-B4: the Preservation Evoker evaluator and its registration
 * (INTERNAL_ONLY in HEAL-B4, PUBLIC since HEAL-B4P), over what is specific to it. The cases every healer
 * evaluator and registration shares (identity refusals, no-plan
 * NO_AUTHORITY_AVAILABLE, plan outcomes, coverage gaps, roster scope,
 * exposure) run it through the HEAL-B1 parametrized files, which list
 * Preservation Evoker as a case.
 *
 * What is pinned here:
 * - the pinned artifact identifies exactly Rewind (a node of its own) and
 *   Dream Flight and Stasis (one choice node), and no empowered spell;
 * - EMPOWERED CASTS: the committed M13-A capture records an empowered cast as
 *   `empowerstart`, a `cast` of the same spell at that start, and a later
 *   `empowerend` (checked against the raw bytes for its six Dream Breaths, each
 *   `cast` in its `empowerstart`'s millisecond). Such a `cast` is a
 *   start, not a completed cast. An empowered spell that is not identified
 *   adds no use and does not disturb the listing; an empower envelope from
 *   the player of an IDENTIFIED ability contradicts the data, and evaluation
 *   stops as RUNTIME_DATA_CONTRADICTED with the envelopes as evidence, never
 *   a use and never a finding. Another actor's envelope does not;
 * - Stasis's release is a cast of another spell (370564), never a use, so an
 *   assignment window holding only a release is not MET;
 * - ROLE: the pinned roster states Preservation's role UNKNOWN, and the
 *   module carries it so; nothing guesses HEALER;
 * - over committed real evidence (no new Warcraft Logs request): the
 *   Preservation Evoker of the M13-A capture (actor 8) cast Stasis at 176,828
 *   and 272,401 and Rewind at 284,626, checked against the raw segment bytes;
 *   the capture is filtered, so the listing is UNKNOWN (INSUFFICIENT_COVERAGE),
 *   never "these were all";
 * - HEAL-B4P: the Preservation Evoker of gtKb fight 22 (actor 15) over its
 *   whole-fight casts (cut from the retained captures, no actor filter): three
 *   Stasis and one Rewind, the listing COMPLETE; its Stasis releases and its
 *   empowered Dream Breaths are never uses, and no envelope names an identified
 *   ability on the raw bytes;
 * - the M13-A Augmentation Evoker (actor 1) is refused: the class alone is
 *   not the specialization.
 */

import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

import { pinnedPreservationEvokerHealingCooldowns } from "../../../src/data/game/evoker-preservation-healing-cooldowns.js";
import { rosterSpecialization } from "../../../src/data/game/spec-roster.js";
import { inclusiveRange } from "../../../src/engine/evidence/coverage.js";
import type { CombatActor } from "../../../src/engine/normalization/actors.js";
import type { CombatFight } from "../../../src/engine/normalization/combat-fight.js";
import { createNormalizer } from "../../../src/engine/normalization/event-normalizer.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../../src/engine/normalization/supported-families.js";
import { createCombatState } from "../../../src/engine/state/combat-state.js";
import { PUBLIC_HEALER_NOT_ASSESSED_REASONS } from "../../../src/contracts/analysis-contract.js";
import type { HealerFindingSet } from "../../../src/findings/healer-finding.js";
import type { RaidCooldownPlan } from "../../../src/raid-plan/raid-cooldown-plan.js";
import {
  internalAnalyzerForSpec,
  PRODUCTION_CATALOG,
  runAnalyzer,
} from "../../../src/services/analyzer-registry.js";
import { evaluatePreservationEvoker } from "../../../src/specs/evoker/preservation/evaluator.js";
import {
  analyzePreservationEvoker,
  PRESERVATION_EVOKER_MODULE,
  PRESERVATION_EVOKER_REGISTRATION,
  preservationEvokerHealerViewOf,
  type PreservationEvokerAnalysis,
} from "../../../src/specs/evoker/preservation/registration.js";
import { loadCommittedEvidenceArchive } from "../../support/corpus/evidence-archive.js";
import { bundleOf } from "../../support/corpus/fight.js";
import { observableCategory, syntheticFight } from "../../support/synthetic-fight.js";

const REWIND = 363534;
const DREAM_FLIGHT = 359816;
const STASIS = 370537;
const STASIS_RELEASE = 370564;
const DREAM_BREATH = 355936;
const FIRE_BREATH = 357208;
const M13A_SEGMENTS = ["seg-0-75", "seg-75-151"] as const;

describe("the pinned Preservation Evoker healing-cooldown identity", () => {
  it("identifies exactly Rewind, and Dream Flight and Stasis on one choice node", () => {
    const load = pinnedPreservationEvokerHealingCooldowns();
    if (!load.ok) throw new Error(load.reason);
    expect(load.datasetId).toBe("SIMC_DBC_EVOKER_PRESERVATION_HEALING_COOLDOWNS");
    expect(load.commitSha).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    expect(
      load.cooldowns.map((entry) => [
        entry.abilityGameId,
        entry.displayNameEn,
        entry.nodeType,
        entry.traitNodeId,
        entry.choiceSiblingAbilityGameIds,
      ]),
    ).toEqual([
      [REWIND, "Rewind", "NORMAL", 93337, []],
      [DREAM_FLIGHT, "Dream Flight", "CHOICE", 93267, [STASIS]],
      [STASIS, "Stasis", "CHOICE", 93267, [DREAM_FLIGHT]],
    ]);
    const ids = load.cooldowns.map((entry) => entry.abilityGameId);
    for (const notIdentified of [STASIS_RELEASE, DREAM_BREATH, FIRE_BREATH]) {
      expect(ids).not.toContain(notIdentified);
    }
  });
});

describe("ROLE: the pinned roster's UNKNOWN is carried, never replaced by a guess", () => {
  it("the roster states UNKNOWN with no evidence, and the module identity carries it", () => {
    expect(rosterSpecialization("evoker/preservation")).toMatchObject({
      role: "UNKNOWN",
      roleEvidence: null,
    });
    expect(PRESERVATION_EVOKER_MODULE.identity.role).toBe("UNKNOWN");
    expect(PRESERVATION_EVOKER_MODULE.identity.simcSpecId).toBe(1468);
    expect(PRESERVATION_EVOKER_MODULE.exposure).toBe("PUBLIC");
  });
});

describe("empowered casts and Stasis releases are not uses", () => {
  const START = 1_000;
  const END = 100_000;
  const SUBJECT = 8;
  const OTHER = 12;
  const WHOLE = inclusiveRange(START, END);
  const actor = (actorId: number): CombatActor => ({
    actorId,
    gameId: null,
    name: actorId === SUBJECT ? "Subject" : "Other",
    server: null,
    actorType: "PLAYER",
    rawType: "Player",
    subType: "Evoker",
    petOwnerActorId: null,
  });
  const event = (timestamp: number, type: string, ability: number, sourceID = SUBJECT) => ({
    timestamp,
    type,
    sourceID,
    targetID: -1,
    abilityGameID: ability,
    fight: 1,
  });
  /** The committed capture's empowered-cast shape: start and cast in one millisecond, the release later. */
  const empowered = (timestamp: number, ability: number, sourceID = SUBJECT) => [
    event(timestamp, "empowerstart", ability, sourceID),
    event(timestamp, "cast", ability, sourceID),
    { ...event(timestamp + 700, "empowerend", ability, sourceID), empowermentLevel: 1 },
  ];

  function fightOf(raw: readonly Record<string, unknown>[]): CombatFight {
    const normalizer = createNormalizer({
      fightStartTimeMs: START,
      requestedRange: WHOLE,
      contracts: indexContracts(SUPPORTED_TYPE_CONTRACTS),
      directionFields: VERIFIED_DIRECTION_FIELDS,
    });
    normalizer.accept({
      streamId: "all",
      pageOrdinal: 0,
      requestedStartTimeMs: START,
      nextPageTimestamp: null,
      events: raw,
    });
    const output = normalizer.finish();
    return syntheticFight({
      events: output.events,
      malformedObservations: output.malformedObservations,
      startTimeMs: START,
      endTimeMs: END,
      categories: {
        CASTS: observableCategory(WHOLE, null),
        DAMAGE: observableCategory(WHOLE, null),
        HEALING: observableCategory(WHOLE, null),
        ABSORBS: observableCategory(WHOLE, null),
      },
      actors: new Map([
        [SUBJECT, actor(SUBJECT)],
        [OTHER, actor(OTHER)],
      ]),
      scope: "FULL_RAID",
      friendlyActorsInScope: [SUBJECT, OTHER],
    });
  }

  const plan = (abilityId: number, plannedReportTimeMs: number): RaidCooldownPlan => ({
    schema: "raid-cooldown-plan/1",
    authority: "USER_PROVIDED_RAID_PLAN",
    encounter: { encounterId: 2900, difficulty: 5 },
    source: { format: "STRUCTURED", label: "test plan" },
    tolerance: { defaultToleranceMs: null },
    assignments: [
      {
        assignmentId: "stasis",
        player: { name: "Subject", realm: null },
        abilityId,
        plannedTime: { kind: "FIGHT_RELATIVE", offsetMs: plannedReportTimeMs - START },
        toleranceMs: 2_000,
        toleranceSource: "ASSIGNMENT",
        source: { lineNumber: null, index: 0, rawLine: null },
        context: { bossSpellId: null },
      },
    ],
    importDiagnostics: [],
  });

  const evaluate = (fight: CombatFight, supplied: RaidCooldownPlan | null) =>
    evaluatePreservationEvoker({
      fight,
      identity: {
        report: { code: fight.report.code },
        fight: { id: fight.fight.id },
        player: { sourceId: SUBJECT, className: "Evoker", specName: "Preservation", name: "Subject" },
      },
      plan: supplied,
    });

  it("an unidentified empowered spell adds no use and leaves the listing COMPLETE", () => {
    const fight = fightOf([
      ...empowered(5_000, DREAM_BREATH),
      ...empowered(9_000, FIRE_BREATH),
      // An empowered spell made instant (Tip the Scales) records the cast alone.
      event(20_000, "cast", FIRE_BREATH),
      event(30_000, "cast", REWIND),
    ]);
    const result = evaluate(fight, null);
    if (result.state !== "EVALUATED") throw new Error(result.state);
    expect(result.cooldowns.listing).toEqual({ state: "COMPLETE" });
    expect(result.cooldowns.uses.map((use) => [use.cast.abilityGameId, use.cast.reportTimeMs])).toEqual([
      [REWIND, 30_000],
    ]);
  });

  it("Stasis is one use at its cast; its release adds none, and a window holding only the release is not MET", () => {
    const fight = fightOf([event(10_000, "cast", STASIS), event(30_000, "cast", STASIS_RELEASE)]);
    const listed = evaluate(fight, null);
    if (listed.state !== "EVALUATED") throw new Error(listed.state);
    expect(listed.cooldowns.uses.map((use) => [use.cast.abilityGameId, use.cast.reportTimeMs])).toEqual([
      [STASIS, 10_000],
    ]);
    const planned = evaluate(fight, plan(STASIS, 30_000));
    if (planned.state !== "EVALUATED" || planned.assignment.status !== "EVALUATED") {
      throw new Error("expected an evaluated plan");
    }
    expect(
      planned.assignment.results.map((entry) => [
        entry.status,
        entry.status === "ASSIGNMENT_UNKNOWN" ? entry.reason : null,
      ]),
    ).toEqual([["ASSIGNMENT_UNKNOWN", "READINESS_NOT_ESTABLISHED"]]);
  });

  it("an empower envelope of an identified ability contradicts the data: nothing is evaluated and nothing is a use", () => {
    const fight = fightOf([...empowered(12_000, REWIND), event(40_000, "cast", STASIS)]);
    const result = evaluate(fight, plan(REWIND, 12_000));
    expect(result.state).toBe("RUNTIME_DATA_CONTRADICTED");
    if (result.state !== "RUNTIME_DATA_CONTRADICTED") return;
    expect(result.reason).toBe("IDENTIFIED_ABILITY_OBSERVED_EMPOWERED");
    expect(result.evidence.map((entry) => [entry.rawType, entry.abilityGameId, entry.reportTimeMs])).toEqual([
      ["empowerstart", REWIND, 12_000],
      ["empowerend", REWIND, 12_700],
    ]);
    expect(result.evidence.every((entry) => entry.locator !== undefined)).toBe(true);
    expect(JSON.stringify(result)).not.toMatch(/ASSIGNMENT_MET|MISSED|wrong|incorrect|mistake|should/i);
  });

  it("the registration reports the contradiction as INSUFFICIENT_EVIDENCE with no healer finding set", () => {
    const fight = fightOf([...empowered(12_000, REWIND)]);
    const stated: CombatFight = {
      ...fight,
      friendlySpecializations: {
        source: "WCL_FIGHT_CONTEXT_FRIENDLY_SPECS",
        byActorId: new Map([
          [SUBJECT, { state: "STATED", className: "Evoker", specName: "Preservation", rosterIndex: 0 }],
        ]),
      },
    };
    const analysis = analyzePreservationEvoker(
      {
        state: createCombatState(stated),
        actorId: SUBJECT,
        specId: "evoker/preservation",
        targetActorId: null,
      },
      PRESERVATION_EVOKER_REGISTRATION.authority,
    );
    expect(analysis.evaluation?.state).toBe("RUNTIME_DATA_CONTRADICTED");
    expect(analysis.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(analysis.healerFindings).toEqual({
      assessment: "NOT_ASSESSED",
      reason: "RUNTIME_DATA_CONTRADICTED",
    });
  });

  it("another actor's empower envelope of an identified id is not the subject's and contradicts nothing", () => {
    const fight = fightOf([...empowered(12_000, REWIND, OTHER), event(30_000, "cast", REWIND)]);
    const result = evaluate(fight, null);
    if (result.state !== "EVALUATED") throw new Error(result.state);
    expect(result.cooldowns.uses.map((use) => [use.cast.abilityGameId, use.cast.reportTimeMs])).toEqual([
      [REWIND, 30_000],
    ]);
  });
});

describe("the Preservation Evoker registration over committed real evidence", () => {
  let m13a: CombatFight;

  beforeAll(async () => {
    const loaded = await loadCommittedEvidenceArchive();
    if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join("\n"));
    m13a = bundleOf(
      loaded.archive,
      M13A_SEGMENTS.map((segment) => `wcl-m13a-aug1-fight-1-support.${segment}`),
      [],
      { catalogArtifactId: "wcl-m13a-fight-context-aug1-fight-1" },
    ).fight;
  });

  function rawEventsOf(pattern: RegExp): string[] {
    const found: string[] = [];
    for (const segment of M13A_SEGMENTS) {
      const raw = readFileSync(
        `tests/evidence/artifacts/wcl-events/wcl-m13a-aug1-fight-1-support.${segment}.json`,
        "utf8",
      );
      for (const match of raw.matchAll(pattern)) found.push(match[0]);
    }
    return found;
  }

  function internalRun(fight: CombatFight, actorId: number): PreservationEvokerAnalysis {
    const registration = internalAnalyzerForSpec("evoker/preservation", PRODUCTION_CATALOG);
    if (registration === null) throw new Error("no evoker/preservation registration");
    const run = runAnalyzer(registration, {
      state: createCombatState(fight),
      actorId,
      specId: "evoker/preservation",
      targetActorId: null,
      raidCooldownPlan: null,
    });
    if (!run.ok) throw new Error(run.detail);
    expect(run.analysis.status).not.toBe("ANALYZED");
    return run.analysis as unknown as PreservationEvokerAnalysis;
  }

  function setOf(analysis: PreservationEvokerAnalysis): HealerFindingSet {
    if (analysis.healerFindings.assessment !== "ASSESSED") {
      throw new Error(`not assessed: ${analysis.healerFindings.reason}`);
    }
    return analysis.healerFindings.set;
  }

  it("the raw M13-A segments hold exactly these identified casts and Stasis releases by actor 8, and no empower event of them", () => {
    expect(
      rawEventsOf(/\{[^{}]*"sourceID":8,[^{}]*"abilityGameID":(?:363534|359816|370537|370564)[,}][^{}]*\}?/g),
    ).toEqual([
      '{"timestamp":176828,"type":"cast","sourceID":8,"targetID":-1,"abilityGameID":370537,"fight":1}',
      '{"timestamp":199450,"type":"cast","sourceID":8,"targetID":-1,"abilityGameID":370564,"fight":1}',
      '{"timestamp":272401,"type":"cast","sourceID":8,"targetID":-1,"abilityGameID":370537,"fight":1}',
      '{"timestamp":284626,"type":"cast","sourceID":8,"targetID":-1,"abilityGameID":363534,"fight":1}',
      '{"timestamp":288323,"type":"cast","sourceID":8,"targetID":-1,"abilityGameID":370564,"fight":1}',
    ]);
  });

  it("the raw M13-A segments record each empowered Dream Breath as empowerstart and cast in one millisecond, then empowerend", () => {
    const shape = rawEventsOf(
      /\{[^{}]*"type":"(?:empowerstart|cast|empowerend)","sourceID":8,[^{}]*"abilityGameID":355936,[^{}]*\}/g,
    ).map((raw) => {
      const parsed = JSON.parse(raw) as { timestamp: number; type: string };
      return [parsed.type, parsed.timestamp] as const;
    });
    expect(shape).toHaveLength(18);
    for (let index = 0; index < shape.length; index += 3) {
      const [start, cast, end] = [shape[index], shape[index + 1], shape[index + 2]];
      expect([start?.[0], cast?.[0], end?.[0]]).toEqual(["empowerstart", "cast", "empowerend"]);
      expect(cast?.[1]).toBe(start?.[1]);
      expect((end?.[1] ?? 0) > (start?.[1] ?? 0)).toBe(true);
    }
  });

  it("the M13-A Preservation Evoker (actor 8): its three observed casts, as facts, with an UNKNOWN listing", () => {
    const analysis = internalRun(m13a, 8);
    expect(analysis.status).toBe("AUTHORITY_NOT_AVAILABLE");
    expect(analysis.subjectSpecialization).toMatchObject({
      state: "STATED",
      className: "Evoker",
      specName: "Preservation",
    });
    const evaluation = analysis.evaluation;
    if (evaluation?.state !== "EVALUATED") throw new Error("not evaluated");
    const { cooldowns } = evaluation;
    expect(cooldowns.uses.map((use) => [use.cast.abilityGameId, use.cast.reportTimeMs])).toEqual([
      [STASIS, 176_828],
      [STASIS, 272_401],
      [REWIND, 284_626],
    ]);
    // The capture is filtered: the uses it holds are facts, not every use.
    expect(cooldowns.listing).toEqual({
      state: "UNKNOWN",
      reason: "INSUFFICIENT_COVERAGE",
      unidentifiedCasts: 0,
    });
    // The capture is no FULL_RAID retrieval: no overlap list is claimed.
    expect(cooldowns.uses.map((use) => use.overlap.state)).toEqual([
      "ROSTER_NOT_IN_SCOPE",
      "ROSTER_NOT_IN_SCOPE",
      "ROSTER_NOT_IN_SCOPE",
    ]);
    const set = setOf(analysis);
    expect(set.spec).toBe("evoker/preservation");
    expect(set.categories).toEqual([
      { category: "ASSIGNMENT", resolution: "NO_AUTHORITY_AVAILABLE", reason: "NO_RAID_COOLDOWN_PLAN" },
      {
        category: "COOLDOWN",
        resolution: "OBSERVED",
        authority: "WCL_OBSERVED_FACT",
        listing: { completeness: "UNKNOWN", reason: "INSUFFICIENT_COVERAGE" },
      },
      {
        category: "HEALING_DECISION",
        resolution: "NO_AUTHORITY_AVAILABLE",
        reason: "NO_APPROVED_PER_CAST_HEALER_MODEL",
      },
    ]);
    expect(set.findings.map((finding) => [finding.category, finding.authority])).toEqual([
      ["COOLDOWN", "WCL_OBSERVED_FACT"],
      ["COOLDOWN", "WCL_OBSERVED_FACT"],
      ["COOLDOWN", "WCL_OBSERVED_FACT"],
    ]);
    expect(JSON.stringify(analysis)).not.toMatch(/MISSED|wrong|incorrect|mistake|should/i);
  });

  it("gtKb fight 22 Preservation Evoker (actor 15) over its whole-fight casts (HEAL-B4P): four uses, a COMPLETE listing, and no release or empowered cast is a use", async () => {
    const loaded = await loadCommittedEvidenceArchive();
    if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join("\n"));
    const segments = ["seg-0-20", "seg-20-165", "seg-165-285"].map(
      (segment) => `wcl-gtkb-fight-22-preservation-evoker-15-casts.${segment}`,
    );
    const whole = bundleOf(loaded.archive, segments, [], {
      catalogArtifactId: "wcl-fight-context-gtkb-fight-22",
    }).fight;
    // The raw bytes: what the listing must not count, and what the check must not fire on.
    const raw = segments
      .map((segment) => readFileSync(`tests/evidence/artifacts/wcl-events/${segment}.json`, "utf8"))
      .join("");
    const count = (pattern: RegExp) => [...raw.matchAll(pattern)].length;
    const CAST_OF = (id: number) =>
      new RegExp(`"type":"cast","sourceID":15,[^{}]*"abilityGameID":${String(id)}[,}]`, "g");
    expect(count(CAST_OF(STASIS_RELEASE))).toBe(3);
    expect(count(CAST_OF(DREAM_BREATH))).toBeGreaterThan(0);
    expect(count(/"type":"empowerstart","sourceID":15,/g)).toBe(25);
    expect(
      count(/"type":"empower(start|end)","sourceID":15,[^{}]*"abilityGameID":(363534|359816|370537)[,}]/g),
    ).toBe(0);

    const analysis = internalRun(whole, 15);
    expect(analysis.status).toBe("AUTHORITY_NOT_AVAILABLE");
    const evaluation = analysis.evaluation;
    if (evaluation?.state !== "EVALUATED") throw new Error("not evaluated");
    expect(evaluation.cooldowns.uses.map((use) => [use.cast.abilityGameId, use.cast.reportTimeMs])).toEqual([
      [STASIS, 2_418_645],
      [REWIND, 2_515_073],
      [STASIS, 2_516_125],
      [STASIS, 2_625_623],
    ]);
    // The cut is from captures retrieved with no actor filter: these are all of them.
    expect(evaluation.cooldowns.listing).toMatchObject({ state: "COMPLETE" });
    expect(setOf(analysis).categories[1]).toMatchObject({ listing: { completeness: "COMPLETE" } });
    expect(JSON.stringify(analysis)).not.toMatch(/MISSED|wrong|incorrect|mistake|should/i);
  });

  it("the public view passes a contradiction through as NOT_ASSESSED with its reason, and the public schema accepts it (HEAL-B4P)", () => {
    const contradicted = {
      healerFindings: { assessment: "NOT_ASSESSED", reason: "RUNTIME_DATA_CONTRADICTED" },
    } as unknown as PreservationEvokerAnalysis;
    expect(preservationEvokerHealerViewOf(contradicted)).toEqual({
      assessment: "NOT_ASSESSED",
      reason: "RUNTIME_DATA_CONTRADICTED",
    });
    expect(PUBLIC_HEALER_NOT_ASSESSED_REASONS).toContain("RUNTIME_DATA_CONTRADICTED");
  });

  it("the M13-A Augmentation Evoker (actor 1) is refused: the class alone is not the specialization", () => {
    const analysis = internalRun(m13a, 1);
    expect(analysis.status).toBe("INSUFFICIENT_EVIDENCE");
    expect(analysis.evaluation).toMatchObject({
      state: "IDENTITY_REFUSED",
      reason: "NOT_THIS_SPECIALIZATION",
    });
    expect(analysis.healerFindings).toEqual({ assessment: "NOT_ASSESSED", reason: "IDENTITY_REFUSED" });
  });
});
