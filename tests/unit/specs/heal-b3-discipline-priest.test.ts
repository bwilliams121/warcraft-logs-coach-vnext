/**
 * HEAL-B3: the Discipline Priest evaluator and its registration
 * (INTERNAL_ONLY), over what is specific to it. The cases every healer
 * evaluator and registration shares (identity refusals, no-plan
 * NO_AUTHORITY_AVAILABLE, plan outcomes, coverage gaps, roster scope,
 * exposure) run it through the HEAL-B1 parametrized files, which list
 * Discipline Priest as a fifth case.
 *
 * What is pinned here:
 * - the pinned healing-cooldown artifact identifies exactly Power Word:
 *   Barrier and Ultimate Penitence (one choice node) and Evangelism;
 * - the pinned Atonement artifact names the buff (194384) and the heal
 *   (81751), and lists every other pinned same-name spell, failing closed on
 *   a tampered row or an incoherent role set;
 * - the ATONEMENT observation, on synthetic fights: applications and refreshes
 *   from the subject's sources only (never another priest's, never a removal,
 *   never a debuff of the same id, never outside the encounter); the heals
 *   Warcraft Logs reports, as counts with no amount; each listing COMPLETE
 *   only under actor-global coverage with nothing unattributable, otherwise
 *   UNKNOWN with the reason, never an empty "none"; the damage-to-heal link
 *   always UNKNOWN; and nothing in it reaches the finding set;
 * - over committed real evidence (no new Warcraft Logs request): the M13-A
 *   Discipline Priest (actor 9) cast Evangelism twice and Ultimate Penitence
 *   once, raw-checked, with every listing UNKNOWN (filtered capture); the
 *   stated Discipline Priest of the G2 cohort246 fight 33 capture (actor 88)
 *   applied Atonement to the capture's subject seven times, raw-checked; the
 *   capture is a PLAYER_CONTEXT capture of another player whose query
 *   excluded heals, so both listings are UNKNOWN (INSUFFICIENT_COVERAGE),
 *   never "these were all" and never "no Atonement healing";
 * - the M13-A Holy and Shadow Priests (actors 2 and 10) are refused: the class
 *   alone is not the specialization.
 */

import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

import atonementJson from "../../../src/data/game/priest-discipline-atonement.json";
import {
  parseDisciplinePriestAtonement,
  pinnedDisciplinePriestAtonement,
} from "../../../src/data/game/priest-discipline-atonement.js";
import { pinnedDisciplinePriestHealingCooldowns } from "../../../src/data/game/priest-discipline-healing-cooldowns.js";
import { inclusiveRange } from "../../../src/engine/evidence/coverage.js";
import type { CombatActor } from "../../../src/engine/normalization/actors.js";
import type { CombatFight } from "../../../src/engine/normalization/combat-fight.js";
import type { CategoryEvidence } from "../../../src/engine/normalization/completeness.js";
import { createNormalizer } from "../../../src/engine/normalization/event-normalizer.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../../src/engine/normalization/raw-event-fields.js";
import {
  indexContracts,
  SUPPORTED_TYPE_CONTRACTS,
} from "../../../src/engine/normalization/supported-families.js";
import { createCombatState } from "../../../src/engine/state/combat-state.js";
import type { HealerFindingSet } from "../../../src/findings/healer-finding.js";
import { healerFindingSetOf } from "../../../src/findings/healer-finding-projection.js";
import {
  internalAnalyzerForSpec,
  PRODUCTION_CATALOG,
  runAnalyzer,
} from "../../../src/services/analyzer-registry.js";
import { evaluateDisciplinePriest } from "../../../src/specs/priest/discipline/evaluator.js";
import type { DisciplinePriestAnalysis } from "../../../src/specs/priest/discipline/registration.js";
import type { EvidenceCategory } from "../../../src/wcl/evidence-capability.js";
import { loadCommittedEvidenceArchive } from "../../support/corpus/evidence-archive.js";
import { bundleOf } from "../../support/corpus/fight.js";
import { observableCategory, partialCategory, syntheticFight } from "../../support/synthetic-fight.js";

const POWER_WORD_BARRIER = 62618;
const ULTIMATE_PENITENCE = 421453;
const EVANGELISM = 472433;
const ATONEMENT_BUFF = 194384;
const ATONEMENT_HEAL = 81751;
/** A pinned same-name aura row the dataset has not reviewed. */
const SAME_NAME_AURA = 451577;

describe("the pinned Discipline Priest runtime data", () => {
  it("identifies exactly Power Word: Barrier and Ultimate Penitence (one choice node) and Evangelism", () => {
    const load = pinnedDisciplinePriestHealingCooldowns();
    if (!load.ok) throw new Error(load.reason);
    expect(load.datasetId).toBe("SIMC_DBC_PRIEST_DISCIPLINE_HEALING_COOLDOWNS");
    expect(load.commitSha).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    expect(
      load.cooldowns.map((entry) => [
        entry.abilityGameId,
        entry.displayNameEn,
        entry.nodeType,
        entry.choiceSiblingAbilityGameIds,
      ]),
    ).toEqual([
      [POWER_WORD_BARRIER, "Power Word: Barrier", "CHOICE", [ULTIMATE_PENITENCE]],
      [ULTIMATE_PENITENCE, "Ultimate Penitence", "CHOICE", [POWER_WORD_BARRIER]],
      [EVANGELISM, "Evangelism", "NORMAL", []],
    ]);
    // Pain Suppression is an external, never an identified healing cooldown.
    expect(load.cooldowns.map((entry) => entry.abilityGameId)).not.toContain(33206);
  });

  it("names the Atonement buff and heal, and lists every other pinned same-name spell", () => {
    const load = pinnedDisciplinePriestAtonement();
    if (!load.ok) throw new Error(load.reason);
    expect(load.datasetId).toBe("SIMC_DBC_PRIEST_DISCIPLINE_ATONEMENT");
    expect(load.commitSha).toBe("33622e9d1662ff0e451691edf85a6b49cc9d11d9");
    expect(load.buffAbilityGameId).toBe(ATONEMENT_BUFF);
    expect(load.healAbilityGameId).toBe(ATONEMENT_HEAL);
    expect(load.sameNameAbilityGameIds).toEqual([81749, 94472, 451577, 451769]);
    for (const spell of load.spells) expect(spell.pinnedSpellRow).toMatch(/^\{ "Atonement"\s*,/);
    // Identity only: nothing about duration, amount or transfer rate is claimed.
    for (const entry of atonementJson.spells) {
      for (const key of Object.keys(entry)) expect(key).not.toMatch(/duration|amount|rate|cap|ms$/i);
    }
  });

  it("fails closed on a tampered row, an incoherent role set or another specialization", () => {
    const tampered = structuredClone(atonementJson);
    tampered.spells[0]!.abilityGameId = 194385;
    expect(parseDisciplinePriestAtonement(tampered)).toEqual({ ok: false, reason: "PINNED_ROW_MISMATCH" });
    const twoBuffs = structuredClone(atonementJson);
    twoBuffs.spells[4]!.role = "ATONEMENT_BUFF";
    expect(parseDisciplinePriestAtonement(twoBuffs)).toEqual({ ok: false, reason: "ROLE_INCOHERENT" });
    const holy = structuredClone(atonementJson);
    holy.provenance.specId = 257;
    expect(parseDisciplinePriestAtonement(holy)).toEqual({ ok: false, reason: "SPECIALIZATION_MISMATCH" });
  });
});

// ---------------------------------------------------------------------------
// The Atonement observation, on synthetic fights
// ---------------------------------------------------------------------------

describe("the Atonement observation", () => {
  const START = 1_000;
  const END = 100_000;
  const SUBJECT = 30;
  const PET = 31;
  const ALLY = 5;
  const TANK = 6;
  const OTHER_PRIEST = 9;
  const BOSS = 161;
  const WHOLE = inclusiveRange(START, END);

  const actor = (actorId: number, subType: string, petOwner: number | null = null): CombatActor => ({
    actorId,
    gameId: null,
    name: actorId === SUBJECT ? "Subject" : null,
    server: null,
    actorType: petOwner === null ? "PLAYER" : "PET",
    rawType: petOwner === null ? "Player" : "Pet",
    subType,
    petOwnerActorId: petOwner,
  });

  type Raw = Record<string, unknown>;
  const aura = (
    timestamp: number,
    type: string,
    source: number | null,
    target: number,
    ability: number,
  ): Raw => ({
    timestamp,
    type,
    ...(source === null ? {} : { sourceID: source }),
    targetID: target,
    abilityGameID: ability,
    fight: 1,
  });
  const heal = (timestamp: number, source: number | null, target: number, ability: number | null): Raw => ({
    timestamp,
    type: "heal",
    ...(source === null ? {} : { sourceID: source }),
    targetID: target,
    ...(ability === null ? {} : { abilityGameID: ability }),
    hitType: 1,
    amount: 1_000,
    overheal: 200,
    fight: 1,
  });

  function fightOf(
    raw: readonly Raw[],
    categories: Partial<Record<EvidenceCategory, CategoryEvidence>> = {},
  ): CombatFight {
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
        AURAS: observableCategory(WHOLE, null),
        DAMAGE: observableCategory(WHOLE, null),
        HEALING: observableCategory(WHOLE, null),
        ABSORBS: observableCategory(WHOLE, null),
        ...categories,
      },
      actors: new Map([
        [SUBJECT, actor(SUBJECT, "Priest")],
        [PET, actor(PET, "Pet", SUBJECT)],
        [ALLY, actor(ALLY, "Warrior")],
        [TANK, actor(TANK, "Paladin")],
        [OTHER_PRIEST, actor(OTHER_PRIEST, "Priest")],
      ]),
      scope: "FULL_RAID",
      friendlyActorsInScope: [ALLY, TANK, OTHER_PRIEST, SUBJECT],
    });
  }

  function atonementOf(fight: CombatFight) {
    const result = evaluateDisciplinePriest({
      fight,
      identity: {
        report: { code: fight.report.code },
        fight: { id: fight.fight.id },
        player: { sourceId: SUBJECT, className: "Priest", specName: "Discipline", name: "Subject" },
      },
      plan: null,
    });
    if (result.state !== "EVALUATED") throw new Error(result.state);
    return { result, atonement: result.atonement };
  }

  const NOTHING_UNATTRIBUTABLE = {
    unattributedEvents: 0,
    unidentifiedSubjectEvents: 0,
    sameNameSpellEvents: 0,
  };

  it("lists the subject's applications and refreshes, per target, and nothing else", () => {
    const fight = fightOf([
      aura(500, "applybuff", SUBJECT, ALLY, ATONEMENT_BUFF), // before the encounter
      aura(10_000, "applybuff", SUBJECT, ALLY, ATONEMENT_BUFF),
      aura(12_000, "applybuff", SUBJECT, TANK, ATONEMENT_BUFF),
      aura(14_000, "refreshbuff", SUBJECT, ALLY, ATONEMENT_BUFF),
      // A stack change is normalized APPLIED with isStackChange: never an application.
      { ...aura(15_000, "applybuffstack", SUBJECT, TANK, ATONEMENT_BUFF), stack: 2 },
      { ...aura(16_000, "removebuffstack", SUBJECT, TANK, ATONEMENT_BUFF), stack: 1 },
      aura(20_000, "removebuff", SUBJECT, ALLY, ATONEMENT_BUFF), // a removal: no interval is claimed
      aura(21_000, "applybuff", OTHER_PRIEST, TANK, ATONEMENT_BUFF), // another priest's Atonement
      aura(22_000, "applydebuff", SUBJECT, BOSS, ATONEMENT_BUFF), // a debuff of the same id is another fact
      aura(23_000, "applybuff", SUBJECT, SUBJECT, 17), // another buff
    ]);
    const { atonement } = atonementOf(fight);
    expect(atonement.category).toBe("ATONEMENT");
    expect(atonement.authority).toBe("WCL_OBSERVED_FACT");
    expect(atonement.applications.listing).toEqual({ state: "COMPLETE" });
    expect(
      atonement.applications.events.map((event) => [
        event.reportTimeMs,
        event.operation,
        event.sourceActorId,
        event.targetActorId,
      ]),
    ).toEqual([
      [10_000, "APPLIED", SUBJECT, ALLY],
      [12_000, "APPLIED", SUBJECT, TANK],
      [14_000, "REFRESHED", SUBJECT, ALLY],
    ]);
    expect(atonement.applications.byTarget).toEqual([
      { targetActorId: ALLY, events: 2 },
      { targetActorId: TANK, events: 1 },
    ]);
    for (const event of atonement.applications.events) expect(event.locator).toBeDefined();
  });

  it("lists the Atonement heals Warcraft Logs reports from the subject's sources, as counts with no amount", () => {
    const fight = fightOf([
      heal(10_000, SUBJECT, ALLY, ATONEMENT_HEAL),
      heal(10_001, SUBJECT, TANK, ATONEMENT_HEAL),
      heal(11_000, PET, ALLY, ATONEMENT_HEAL), // its stated pet: listed under its reported source
      heal(11_500, SUBJECT, ALLY, 2061), // Flash Heal: not Atonement
      heal(12_000, OTHER_PRIEST, ALLY, ATONEMENT_HEAL), // another priest's Atonement
    ]);
    const { atonement } = atonementOf(fight);
    expect(atonement.healingAsReported.listing).toEqual({ state: "COMPLETE" });
    expect(
      atonement.healingAsReported.events.map((event) => [
        event.reportTimeMs,
        event.sourceActorId,
        event.targetActorId,
      ]),
    ).toEqual([
      [10_000, SUBJECT, ALLY],
      [10_001, SUBJECT, TANK],
      [11_000, PET, ALLY],
    ]);
    expect(atonement.healingAsReported.byTarget).toEqual([
      { targetActorId: ALLY, events: 2 },
      { targetActorId: TANK, events: 1 },
    ]);
    // Which damage produced which heal is not reported, so it is never reconstructed.
    expect(atonement.damageEventLink).toEqual({ state: "UNKNOWN", reason: "DAMAGE_EVENT_LINK_NOT_REPORTED" });
    expect(JSON.stringify(atonement)).not.toMatch(/amount|overheal|total|hps|score|quality|should|missed/i);
  });

  it("an empty listing under full coverage is 'none'; under actor-scoped coverage it is UNKNOWN, never 'none'", () => {
    const covered = atonementOf(fightOf([])).atonement;
    expect(covered.applications).toMatchObject({ listing: { state: "COMPLETE" }, events: [] });
    expect(covered.healingAsReported).toMatchObject({ listing: { state: "COMPLETE" }, events: [] });

    // A capture that vouches for the subject alone cannot vouch for every ally it could have applied Atonement to.
    const scoped = atonementOf(
      fightOf([aura(10_000, "applybuff", SUBJECT, ALLY, ATONEMENT_BUFF)], {
        AURAS: observableCategory(WHOLE, [SUBJECT]),
        HEALING: observableCategory(WHOLE, [SUBJECT]),
      }),
    ).atonement;
    expect(scoped.applications.listing).toEqual({
      state: "UNKNOWN",
      reason: "INSUFFICIENT_SCOPE",
      ...NOTHING_UNATTRIBUTABLE,
    });
    // The observed application is kept as a fact.
    expect(scoped.applications.events).toHaveLength(1);
    expect(scoped.healingAsReported.listing).toMatchObject({
      state: "UNKNOWN",
      reason: "INSUFFICIENT_SCOPE",
    });
  });

  it("a retrieval gap makes the listing UNKNOWN, never inactivity", () => {
    const gap = atonementOf(
      fightOf([], {
        AURAS: partialCategory([inclusiveRange(START, 40_000), inclusiveRange(70_000, END)]),
        HEALING: partialCategory([inclusiveRange(START, 40_000)]),
      }),
    ).atonement;
    expect(gap.applications.listing).toEqual({
      state: "UNKNOWN",
      reason: "INSUFFICIENT_COVERAGE",
      ...NOTHING_UNATTRIBUTABLE,
    });
    expect(gap.healingAsReported.listing).toMatchObject({
      state: "UNKNOWN",
      reason: "INSUFFICIENT_COVERAGE",
    });
  });

  it("an Atonement event with no source makes its listing UNKNOWN: it could be the subject's", () => {
    const { atonement } = atonementOf(
      fightOf([
        aura(10_000, "applybuff", null, ALLY, ATONEMENT_BUFF),
        heal(10_000, null, ALLY, ATONEMENT_HEAL),
      ]),
    );
    expect(atonement.applications.listing).toEqual({
      state: "UNKNOWN",
      reason: "UNATTRIBUTED_EVENT",
      unattributedEvents: 1,
      unidentifiedSubjectEvents: 0,
      sameNameSpellEvents: 0,
    });
    expect(atonement.applications.events).toEqual([]);
    expect(atonement.healingAsReported.listing).toMatchObject({
      state: "UNKNOWN",
      reason: "UNATTRIBUTED_EVENT",
    });
  });

  it("a subject event with no ability id, or of an unreviewed same-name id, makes its listing UNKNOWN", () => {
    const { atonement } = atonementOf(
      fightOf([aura(10_000, "applybuff", SUBJECT, ALLY, SAME_NAME_AURA), heal(10_000, SUBJECT, ALLY, null)]),
    );
    expect(atonement.applications.listing).toEqual({
      state: "UNKNOWN",
      reason: "SAME_NAME_SPELL_FROM_SUBJECT",
      unattributedEvents: 0,
      unidentifiedSubjectEvents: 0,
      sameNameSpellEvents: 1,
    });
    expect(atonement.healingAsReported.listing).toEqual({
      state: "UNKNOWN",
      reason: "UNIDENTIFIED_SUBJECT_EVENT",
      unattributedEvents: 0,
      unidentifiedSubjectEvents: 1,
      sameNameSpellEvents: 0,
    });
    // Another priest's same-name event says nothing about the subject.
    const other = atonementOf(
      fightOf([aura(10_000, "applybuff", OTHER_PRIEST, ALLY, SAME_NAME_AURA)]),
    ).atonement;
    expect(other.applications.listing).toEqual({ state: "COMPLETE" });
  });

  it("the Atonement facts are no finding: the finding set is the shared three-category healer set", () => {
    const fight = fightOf([
      aura(10_000, "applybuff", SUBJECT, ALLY, ATONEMENT_BUFF),
      heal(10_000, SUBJECT, ALLY, ATONEMENT_HEAL),
    ]);
    const { result } = atonementOf(fight);
    expect(result.atonement.applications.events).toHaveLength(1);
    expect(result.atonement.healingAsReported.events).toHaveLength(1);
    const set = healerFindingSetOf("priest/discipline", result, null);
    expect(set.categories.map((category) => category.category)).toEqual([
      "ASSIGNMENT",
      "COOLDOWN",
      "HEALING_DECISION",
    ]);
    // No cooldown was cast, so there is no finding at all: the Atonement facts add none.
    expect(set.findings).toEqual([]);
    expect(JSON.stringify(set)).not.toMatch(/atonement|194384|81751/i);
    expect(result.healingDecision).toEqual({
      category: "HEALING_DECISION",
      status: "NO_AUTHORITY_AVAILABLE",
      reason: "NO_APPROVED_PER_CAST_HEALER_MODEL",
    });
  });
});

// ---------------------------------------------------------------------------
// Committed real evidence
// ---------------------------------------------------------------------------

describe("the Discipline Priest registration over committed real evidence", () => {
  let m13a: CombatFight;
  let g2: CombatFight;
  const G2_SEGMENTS = [
    "seg-0-46",
    "seg-46-106",
    "seg-106-144",
    "seg-144-197",
    "seg-197-228",
    "seg-228-284",
    "seg-284-315",
    "seg-315-329",
  ];

  beforeAll(async () => {
    const loaded = await loadCommittedEvidenceArchive();
    if (!loaded.ok) throw new Error(loaded.errors.map((error) => error.message).join("\n"));
    m13a = bundleOf(
      loaded.archive,
      ["wcl-m13a-aug1-fight-1-support.seg-0-75", "wcl-m13a-aug1-fight-1-support.seg-75-151"],
      [],
      { catalogArtifactId: "wcl-m13a-fight-context-aug1-fight-1" },
    ).fight;
    g2 = bundleOf(
      loaded.archive,
      G2_SEGMENTS.map((segment) => `wcl-g2-cohort246-f33-owned-pets.${segment}`),
      [],
      { catalogArtifactId: "wcl-g2-fight-context-cohort246-fight-33" },
    ).fight;
  });

  function internalRun(fight: CombatFight, actorId: number): DisciplinePriestAnalysis {
    const registration = internalAnalyzerForSpec("priest/discipline", PRODUCTION_CATALOG);
    if (registration === null) throw new Error("no priest/discipline registration");
    const run = runAnalyzer(registration, {
      state: createCombatState(fight),
      actorId,
      specId: "priest/discipline",
      targetActorId: null,
      raidCooldownPlan: null,
    });
    if (!run.ok) throw new Error(run.detail);
    expect(run.analysis.status).not.toBe("ANALYZED");
    return run.analysis as unknown as DisciplinePriestAnalysis;
  }

  function setOf(analysis: DisciplinePriestAnalysis): HealerFindingSet {
    if (analysis.healerFindings.assessment !== "ASSESSED") {
      throw new Error(`not assessed: ${analysis.healerFindings.reason}`);
    }
    return analysis.healerFindings.set;
  }

  it("the raw M13-A segments hold exactly these identified casts by actor 9", () => {
    const found: string[] = [];
    for (const segment of ["seg-0-75", "seg-75-151"]) {
      const raw = readFileSync(
        `tests/evidence/artifacts/wcl-events/wcl-m13a-aug1-fight-1-support.${segment}.json`,
        "utf8",
      );
      for (const match of raw.matchAll(
        /\{[^{}]*"type":"cast","sourceID":9,[^{}]*"abilityGameID":(?:62618|421453|472433),[^{}]*\}/g,
      )) {
        found.push(match[0]);
      }
    }
    expect(found).toEqual([
      '{"timestamp":190592,"type":"cast","sourceID":9,"targetID":9,"abilityGameID":472433,"fight":1}',
      '{"timestamp":232488,"type":"cast","sourceID":9,"targetID":21,"abilityGameID":421453,"fight":1}',
      '{"timestamp":281877,"type":"cast","sourceID":9,"targetID":9,"abilityGameID":472433,"fight":1}',
    ]);
  });

  it("the M13-A Discipline Priest (actor 9): its observed casts, as facts, with every listing UNKNOWN", () => {
    const analysis = internalRun(m13a, 9);
    expect(analysis.status).toBe("AUTHORITY_NOT_AVAILABLE");
    expect(analysis.subjectSpecialization).toMatchObject({
      state: "STATED",
      className: "Priest",
      specName: "Discipline",
    });
    const evaluation = analysis.evaluation;
    if (evaluation?.state !== "EVALUATED") throw new Error("not evaluated");
    expect(evaluation.cooldowns.uses.map((use) => [use.cast.abilityGameId, use.cast.reportTimeMs])).toEqual([
      [EVANGELISM, 190_592],
      [ULTIMATE_PENITENCE, 232_488],
      [EVANGELISM, 281_877],
    ]);
    // The capture is filtered: the uses it holds are facts, not every use, and no overlap list is claimed.
    expect(evaluation.cooldowns.uses.map((use) => use.overlap.state)).toEqual([
      "ROSTER_NOT_IN_SCOPE",
      "ROSTER_NOT_IN_SCOPE",
      "ROSTER_NOT_IN_SCOPE",
    ]);
    expect(evaluation.cooldowns.listing).toMatchObject({ state: "UNKNOWN" });
    expect(evaluation.atonement.applications.listing).toMatchObject({ state: "UNKNOWN" });
    expect(evaluation.atonement.healingAsReported.listing).toMatchObject({ state: "UNKNOWN" });
    expect(evaluation.atonement.damageEventLink.state).toBe("UNKNOWN");
    expect(setOf(analysis).spec).toBe("priest/discipline");
    expect(JSON.stringify(analysis)).not.toMatch(/MISSED|wrong|incorrect|mistake|should/i);
  });

  it("the raw G2 segments hold these Atonement applications by actor 88", () => {
    const found: string[] = [];
    for (const segment of G2_SEGMENTS) {
      const raw = readFileSync(
        `tests/evidence/artifacts/wcl-events/wcl-g2-cohort246-f33-owned-pets.${segment}.json`,
        "utf8",
      );
      for (const match of raw.matchAll(/\{[^{}]*"sourceID":88,[^{}]*"abilityGameID":194384,[^{}]*\}/g)) {
        found.push(match[0]);
      }
    }
    // Seven applications and seven removals, every one by actor 88 onto actor 7 (the capture's subject).
    expect(found.map((event) => JSON.parse(event) as Record<string, unknown>)).toEqual(
      [
        [6_451_610, 6_470_601],
        [6_502_090, 6_523_087],
        [6_544_285, 6_567_269],
        [6_609_773, 6_628_795],
        [6_674_404, 6_693_401],
        [6_705_169, 6_730_175],
        [6_736_540, 6_747_055],
      ].flatMap(([applied, removed]) =>
        [
          [applied, "applybuff"],
          [removed, "removebuff"],
        ].map(([timestamp, type]) => ({
          timestamp,
          type,
          sourceID: 88,
          targetID: 7,
          abilityGameID: ATONEMENT_BUFF,
          fight: 33,
          targetMarker: 4,
        })),
      ),
    );
  });

  it("the G2 cohort246 Discipline Priest (actor 88): its observed Atonement applications, as facts, listing UNKNOWN", () => {
    const analysis = internalRun(g2, 88);
    expect(analysis.status).toBe("AUTHORITY_NOT_AVAILABLE");
    expect(analysis.subjectSpecialization).toMatchObject({ state: "STATED", specName: "Discipline" });
    const evaluation = analysis.evaluation;
    if (evaluation?.state !== "EVALUATED") throw new Error("not evaluated");
    const { atonement } = evaluation;
    expect(
      atonement.applications.events.map((event) => [
        event.reportTimeMs,
        event.operation,
        event.sourceActorId,
        event.targetActorId,
      ]),
    ).toEqual(
      [6_451_610, 6_502_090, 6_544_285, 6_609_773, 6_674_404, 6_705_169, 6_736_540].map((time) => [
        time,
        "APPLIED",
        88,
        7,
      ]),
    );
    expect(atonement.applications.byTarget).toEqual([{ targetActorId: 7, events: 7 }]);
    // A capture of another player's events: these applications are facts, never "every application".
    expect(atonement.applications.listing).toEqual({
      state: "UNKNOWN",
      reason: "INSUFFICIENT_COVERAGE",
      unattributedEvents: 0,
      unidentifiedSubjectEvents: 0,
      sameNameSpellEvents: 0,
    });
    // The capture's query excluded heal events: none is listed, and the listing says UNKNOWN, never "no Atonement healing".
    expect(atonement.healingAsReported).toEqual({
      listing: {
        state: "UNKNOWN",
        reason: "INSUFFICIENT_COVERAGE",
        unattributedEvents: 0,
        unidentifiedSubjectEvents: 0,
        sameNameSpellEvents: 0,
      },
      events: [],
      byTarget: [],
    });
    expect(atonement.damageEventLink).toEqual({ state: "UNKNOWN", reason: "DAMAGE_EVENT_LINK_NOT_REPORTED" });
    expect(JSON.stringify(analysis)).not.toMatch(/MISSED|wrong|incorrect|mistake|should/i);
  });

  it.each([
    ["Holy", 2],
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
});
