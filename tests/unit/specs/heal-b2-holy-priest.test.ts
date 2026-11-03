/**
 * HEAL-B2: the Holy Priest evaluator and its INTERNAL_ONLY registration, over
 * what is specific to it. The cases every healer evaluator and registration
 * shares (identity refusals, no-plan NO_AUTHORITY_AVAILABLE, plan outcomes,
 * coverage gaps, roster scope, exposure) run it through the HEAL-B1
 * parametrized files, which list Holy Priest as a fourth case.
 *
 * What is pinned here:
 * - Divine Hymn is a channel: its use is the completed cast of 64843, once.
 *   Its healing pulses are cast events of 64844 (as the committed capture
 *   records), which is not identified and is never a use, so an assignment
 *   window holding only pulses is not MET;
 * - the pinned artifact identifies exactly Divine Hymn and Apotheosis;
 * - over committed real evidence (no new Warcraft Logs request): the Holy
 *   Priest of the M13-A capture (actor 2) cast Apotheosis at 168,785, Divine
 *   Hymn at 249,326 and Apotheosis at 289,544, checked against the raw
 *   segment bytes; the capture
 *   is filtered, so the listing is UNKNOWN (INSUFFICIENT_COVERAGE), never
 *   "these were all";
 * - the Holy Priest of b1PmaKrd6CDfzngc fight 48 (actor 2), over the
 *   friendly-players window that carries no cast of its own: no use is
 *   listed, and the listing is UNKNOWN, never "no cooldown was used"; its
 *   sources are itself and its Warcraft Logs-stated pet (94);
 * - the M13-A Discipline and Shadow Priests (actors 9 and 10) are refused:
 *   the class alone is not the specialization.
 */

import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

import { pinnedHolyPriestHealingCooldowns } from "../../../src/data/game/priest-holy-healing-cooldowns.js";
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
import type { HealerFindingSet } from "../../../src/findings/healer-finding.js";
import type { RaidCooldownPlan } from "../../../src/raid-plan/raid-cooldown-plan.js";
import {
  internalAnalyzerForSpec,
  PRODUCTION_CATALOG,
  runAnalyzer,
} from "../../../src/services/analyzer-registry.js";
import { evaluateHolyPriest } from "../../../src/specs/priest/holy/evaluator.js";
import type { HolyPriestAnalysis } from "../../../src/specs/priest/holy/registration.js";
import { loadCommittedEvidenceArchive } from "../../support/corpus/evidence-archive.js";
import { bundleOf } from "../../support/corpus/fight.js";
import { observableCategory, syntheticFight } from "../../support/synthetic-fight.js";

const DIVINE_HYMN = 64843;
const DIVINE_HYMN_PULSE = 64844;
const APOTHEOSIS = 200183;

describe("the pinned Holy Priest healing-cooldown identity", () => {
  it("identifies exactly Divine Hymn and Apotheosis, each on a node of its own", () => {
    const load = pinnedHolyPriestHealingCooldowns();
    if (!load.ok) throw new Error(load.reason);
    expect(load.datasetId).toBe("SIMC_DBC_PRIEST_HOLY_HEALING_COOLDOWNS");
    expect(load.commitSha).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    expect(load.cooldowns.map((entry) => [entry.abilityGameId, entry.displayNameEn, entry.nodeType])).toEqual(
      [
        [DIVINE_HYMN, "Divine Hymn", "NORMAL"],
        [APOTHEOSIS, "Apotheosis", "NORMAL"],
      ],
    );
    expect(load.cooldowns.map((entry) => entry.abilityGameId)).not.toContain(DIVINE_HYMN_PULSE);
  });
});

describe("Divine Hymn's healing pulses are not uses", () => {
  const START = 1_000;
  const END = 100_000;
  const SUBJECT = 2;
  const WHOLE = inclusiveRange(START, END);
  const actor = (actorId: number, subType: string): CombatActor => ({
    actorId,
    gameId: null,
    name: actorId === SUBJECT ? "Subject" : null,
    server: null,
    actorType: "PLAYER",
    rawType: "Player",
    subType,
    petOwnerActorId: null,
  });
  const cast = (timestamp: number, ability: number) => ({
    timestamp,
    type: "cast",
    sourceID: SUBJECT,
    targetID: -1,
    abilityGameID: ability,
    fight: 1,
  });

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
      actors: new Map([[SUBJECT, actor(SUBJECT, "Priest")]]),
      scope: "FULL_RAID",
      friendlyActorsInScope: [SUBJECT],
    });
  }

  const plan = (plannedReportTimeMs: number): RaidCooldownPlan => ({
    schema: "raid-cooldown-plan/1",
    authority: "USER_PROVIDED_RAID_PLAN",
    encounter: { encounterId: 2900, difficulty: 5 },
    source: { format: "STRUCTURED", label: "test plan" },
    tolerance: { defaultToleranceMs: null },
    assignments: [
      {
        assignmentId: "hymn",
        player: { name: "Subject", realm: null },
        abilityId: DIVINE_HYMN,
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
    evaluateHolyPriest({
      fight,
      identity: {
        report: { code: fight.report.code },
        fight: { id: fight.fight.id },
        player: { sourceId: SUBJECT, className: "Priest", specName: "Holy", name: "Subject" },
      },
      plan: supplied,
    });

  it("the channel is one use at its cast; its pulses add none", () => {
    // The committed capture's shape: the 64843 cast, then 64844 pulse casts about a second apart.
    const fight = fightOf([
      cast(10_000, DIVINE_HYMN),
      cast(10_001, DIVINE_HYMN_PULSE),
      cast(11_050, DIVINE_HYMN_PULSE),
      cast(12_090, DIVINE_HYMN_PULSE),
    ]);
    const result = evaluate(fight, null);
    if (result.state !== "EVALUATED") throw new Error(result.state);
    expect(result.cooldowns.listing).toEqual({ state: "COMPLETE" });
    expect(result.cooldowns.uses.map((use) => [use.cast.abilityGameId, use.cast.reportTimeMs])).toEqual([
      [DIVINE_HYMN, 10_000],
    ]);
  });

  it("a window holding only pulses is not MET, and is UNKNOWN rather than missed", () => {
    // Pulses inside the assignment's window, the cast itself well before it.
    const fight = fightOf([cast(10_000, DIVINE_HYMN), cast(30_000, DIVINE_HYMN_PULSE)]);
    const result = evaluate(fight, plan(30_000));
    if (result.state !== "EVALUATED" || result.assignment.status !== "EVALUATED") {
      throw new Error("expected an evaluated plan");
    }
    expect(
      result.assignment.results.map((entry) => [
        entry.status,
        entry.status === "ASSIGNMENT_UNKNOWN" ? entry.reason : null,
      ]),
    ).toEqual([["ASSIGNMENT_UNKNOWN", "READINESS_NOT_ESTABLISHED"]]);
  });
});

describe("the internal Holy Priest registration over committed real evidence", () => {
  let m13a: CombatFight;
  let b1pm: CombatFight;

  beforeAll(async () => {
    const loaded = await loadCommittedEvidenceArchive();
    if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join("\n"));
    m13a = bundleOf(
      loaded.archive,
      ["wcl-m13a-aug1-fight-1-support.seg-0-75", "wcl-m13a-aug1-fight-1-support.seg-75-151"],
      [],
      { catalogArtifactId: "wcl-m13a-fight-context-aug1-fight-1" },
    ).fight;
    b1pm = bundleOf(
      loaded.archive,
      [
        "wcl-b1pm-fight-48-friendly-players.seg-69500-72500",
        "wcl-b1pm-fight-48-friendly-players.seg-72500-75500",
        "wcl-b1pm-fight-48-friendly-players.seg-75500-77000",
      ],
      [],
      { catalogArtifactId: "wcl-fight-context-b1pm-fight-48" },
    ).fight;
  });

  function internalRun(fight: CombatFight, actorId: number): HolyPriestAnalysis {
    const registration = internalAnalyzerForSpec("priest/holy", PRODUCTION_CATALOG);
    if (registration === null) throw new Error("no priest/holy registration");
    const run = runAnalyzer(registration, {
      state: createCombatState(fight),
      actorId,
      specId: "priest/holy",
      targetActorId: null,
      raidCooldownPlan: null,
    });
    if (!run.ok) throw new Error(run.detail);
    expect(run.analysis.status).not.toBe("ANALYZED");
    return run.analysis as unknown as HolyPriestAnalysis;
  }

  function setOf(analysis: HolyPriestAnalysis): HealerFindingSet {
    if (analysis.healerFindings.assessment !== "ASSESSED") {
      throw new Error(`not assessed: ${analysis.healerFindings.reason}`);
    }
    return analysis.healerFindings.set;
  }

  it("the raw M13-A segments hold exactly these identified casts by actor 2", () => {
    const found: string[] = [];
    for (const segment of ["seg-0-75", "seg-75-151"]) {
      const raw = readFileSync(
        `tests/evidence/artifacts/wcl-events/wcl-m13a-aug1-fight-1-support.${segment}.json`,
        "utf8",
      );
      for (const match of raw.matchAll(
        /\{[^{}]*"sourceID":2,[^{}]*"abilityGameID":(?:64843|200183),[^{}]*\}/g,
      )) {
        found.push(match[0]);
      }
    }
    expect(found).toEqual([
      '{"timestamp":168785,"type":"cast","sourceID":2,"targetID":-1,"abilityGameID":200183,"fight":1}',
      '{"timestamp":249326,"type":"cast","sourceID":2,"targetID":-1,"abilityGameID":64843,"fight":1}',
      '{"timestamp":289544,"type":"cast","sourceID":2,"targetID":-1,"abilityGameID":200183,"fight":1}',
    ]);
  });

  it("the M13-A Holy Priest (actor 2): its three observed casts, as facts, with an UNKNOWN listing", () => {
    const analysis = internalRun(m13a, 2);
    expect(analysis.status).toBe("AUTHORITY_NOT_AVAILABLE");
    expect(analysis.subjectSpecialization).toMatchObject({
      state: "STATED",
      className: "Priest",
      specName: "Holy",
    });
    const evaluation = analysis.evaluation;
    if (evaluation?.state !== "EVALUATED") throw new Error("not evaluated");
    const { cooldowns } = evaluation;
    expect(cooldowns.uses.map((use) => [use.cast.abilityGameId, use.cast.reportTimeMs])).toEqual([
      [APOTHEOSIS, 168_785],
      [DIVINE_HYMN, 249_326],
      [APOTHEOSIS, 289_544],
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
    expect(set.spec).toBe("priest/holy");
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

  it.each([
    ["Discipline", 9],
    ["Shadow", 10],
  ] as const)(
    "the M13-A %s Priest (actor %i) is refused: the class alone is not the specialization",
    (_spec, actorId) => {
      const analysis = internalRun(m13a, actorId);
      expect(analysis.status).toBe("INSUFFICIENT_EVIDENCE");
      expect(analysis.evaluation).toMatchObject({
        state: "IDENTITY_REFUSED",
        reason: "NOT_THIS_SPECIALIZATION",
      });
      expect(analysis.healerFindings).toEqual({ assessment: "NOT_ASSESSED", reason: "IDENTITY_REFUSED" });
    },
  );

  it("b1pm fight 48 Holy Priest (actor 2): a window with none of its casts lists no use and says UNKNOWN, never 'none used'", () => {
    const analysis = internalRun(b1pm, 2);
    expect(analysis.status).toBe("AUTHORITY_NOT_AVAILABLE");
    const evaluation = analysis.evaluation;
    if (evaluation?.state !== "EVALUATED") throw new Error("not evaluated");
    expect(evaluation.cooldowns.uses).toEqual([]);
    expect(evaluation.cooldowns.listing).toEqual({
      state: "UNKNOWN",
      reason: "INSUFFICIENT_COVERAGE",
      unidentifiedCasts: 0,
    });
    expect(evaluation.cooldowns.subjectSources).toEqual([2, 94]);
    expect(setOf(analysis).findings).toEqual([]);
    expect(setOf(analysis).categories[1]).toMatchObject({ listing: { completeness: "UNKNOWN" } });
  });
});
