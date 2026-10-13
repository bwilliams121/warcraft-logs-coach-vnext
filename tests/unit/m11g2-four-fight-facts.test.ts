import { beforeAll, describe, expect, it } from "vitest";

import type { CombatActor } from "../../src/engine/normalization/actors.js";
import type { CombatEvent } from "../../src/engine/normalization/normalized-events.js";
import { summarizeCasts } from "../../src/comparison-facts/cast-facts.js";
import {
  observeCooldownWindows,
  type CooldownWindowDefinition,
} from "../../src/comparison-facts/cooldown-windows.js";
import { buildDamageLedger } from "../../src/comparison-facts/damage-ledger.js";
import { comparisonFightFacts, type FightFacts } from "../../src/comparison-facts/fight-facts.js";
import {
  g1AgreementOf,
  renderFourFightReport,
  type ReportedFight,
} from "../../src/comparison-facts/four-fight-report.js";
import { buildSubActorTree } from "../../src/comparison-facts/sub-actor-tree.js";
import { describeTargetActor } from "../../src/comparison-facts/target-classification.js";
import { RAW_AMOUNT_MEANING, type EvidenceBasis } from "../../src/comparison-facts/evidence-basis.js";
import { BLOOD_POST_HOC_DEFINITION } from "../../src/specs/deathknight/blood/post-hoc-definition.js";
import { bloodCooldownAbilitiesFor } from "../../src/data/game/deathknight-blood-cooldowns.js";
import { DANCING_RUNE_WEAPON_BUFF_SPELL_ID } from "../../src/data/game/deathknight-blood-aura-authority.js";
import {
  auraEvent,
  castEvent,
  damageEvent,
  summonEvent,
  syntheticFight,
} from "../support/synthetic-fight.js";
import {
  COMPARISONS,
  comparisonInput,
  committedG1Cohort,
  subjectInput,
  subjectObservedPerformance,
} from "../support/m11/g2-four-fights.js";

/**
 * M11-G2 post-hoc comparison facts over the four committed fights (the
 * subject: COVERAGE_VOUCHED; the three G1 members: UNCERTIFIED_FILTERED_CAPTURE),
 * plus synthetic negatives. Every pinned number below was observed in the
 * committed bytes; none is a judgement.
 */

const DEFINITION = BLOOD_POST_HOC_DEFINITION as unknown as Parameters<typeof comparisonFightFacts>[1];
let subject: FightFacts;
let comparisons: FightFacts[];

beforeAll(async () => {
  subject = comparisonFightFacts(await subjectInput(), DEFINITION);
  comparisons = [];
  for (const fixture of COMPARISONS)
    comparisons.push(comparisonFightFacts(await comparisonInput(fixture), DEFINITION));
}, 120_000);

const exact = (value: number) => ({ kind: "EXACT", value });
const atLeast = (value: number) => ({ kind: "AT_LEAST", value });
const child = (facts: FightFacts, kind: string) =>
  facts.subActors.children.filter((entry) => entry.kind === kind);

// ---------------------------------------------------------------------------
// Blood definition authority
// ---------------------------------------------------------------------------

describe("the Blood post-hoc definition reads its ids from the pinned authorities", () => {
  it("DRW cast 49028 from the SimC DBC cooldown dataset, aura 81256 from the aura authority", () => {
    const window = BLOOD_POST_HOC_DEFINITION.cooldownWindows[0];
    expect(window.triggerCastAbilityGameIds).toEqual(
      bloodCooldownAbilitiesFor("dancing_rune_weapon").map((entry) => entry.abilityGameId),
    );
    expect(window.triggerCastAbilityGameIds).toEqual([49028]);
    expect(window.activeAuraAbilityGameId).toBe(DANCING_RUNE_WEAPON_BUFF_SPELL_ID);
    expect(window.activeAuraAbilityGameId).toBe(81256);
  });
});

// ---------------------------------------------------------------------------
// A/B/S/T: the sub-actor tree
// ---------------------------------------------------------------------------

describe("A/B/S/T: the sub-actor tree derives from WCL petOwner only", () => {
  it("A/S: the children are exactly each fight's petOwner set, classified by catalog gameID", () => {
    expect(subject.subActors.children.map((entry) => [entry.actorId, entry.kind, entry.gameId])).toEqual([
      [44, "RUNE_WEAPON", 27893],
      [45, "BLOOD_BEAST", 217228],
      [47, "RISEN_GHOUL", 26125],
      [224, "UNCLASSIFIED_OWNED_ACTOR", 218381],
    ]);
    expect(comparisons.map((facts) => facts.subActors.children.map((entry) => entry.actorId))).toEqual(
      COMPARISONS.map((fixture) => fixture.ownedActorIds),
    );
    for (const facts of [subject, ...comparisons])
      expect(facts.subActors.ownershipAuthority).toBe("WCL_PET_OWNER");
  });

  it("B: another player's or an ownerless Rune Weapon in the same report is not the focus's child", () => {
    // COHORT246#33 catalogs a second Rune Weapon (gameID 27893) with no petOwner, and two other Death Knights.
    const c1 = comparisons[0];
    if (c1 === undefined) throw new Error("no comparison");
    expect(
      c1.subActors.children.filter((entry) => entry.kind === "RUNE_WEAPON").map((entry) => entry.actorId),
    ).toEqual([15]);
  });

  it("S: no pet of a pet, no ownerless pet, no other player's pet — and a summon event establishes nothing", () => {
    const actor = (
      actorId: number,
      type: CombatActor["actorType"],
      petOwner: number | null,
      gameId: number | null,
    ): [number, CombatActor] => [
      actorId,
      {
        actorId,
        gameId,
        name: null,
        server: null,
        actorType: type,
        rawType: type === "PLAYER" ? "Player" : "Pet",
        subType: null,
        petOwnerActorId: petOwner,
      },
    ];
    const fight = syntheticFight({
      focusActorId: 5,
      actors: new Map([
        actor(5, "PLAYER", null, 1),
        actor(6, "PLAYER", null, 2),
        actor(10, "PET", 5, 27893),
        actor(11, "PET", 10, 27893),
        actor(12, "PET", null, 217228),
        actor(13, "PET", 6, 26125),
      ]),
      events: [
        summonEvent({ ordinal: 0, reportTimeMs: 1100, sourceActorId: 5, targetActorId: 12 }),
        summonEvent({
          ordinal: 1,
          reportTimeMs: 1200,
          sourceActorId: 5,
          targetActorId: 10,
          targetInstanceId: 1,
        }),
      ],
      observedCategories: ["DAMAGE", "CASTS", "SUMMONS"],
      actorScope: [5, 10],
    });
    const tree = buildSubActorTree(
      fight,
      { kind: "COVERAGE_VOUCHED" },
      5,
      BLOOD_POST_HOC_DEFINITION.subActorKinds,
      [],
      {
        kind: "NOT_RETRIEVED",
        reason: "synthetic",
      },
    );
    expect(tree.children.map((entry) => entry.actorId)).toEqual([10]);
    expect(tree.children[0]?.summons.items.map((summon) => summon.instance)).toEqual([
      { actorId: 10, instanceId: 1 },
    ]);
  });

  it("T: a zero-activity owned actor stays in the tree — EXACT 0 under vouched coverage, never 'at least 0' when uncertified", () => {
    const vouched = subject.subActors.children.find((entry) => entry.actorId === 224);
    expect(vouched?.instances).toEqual({ items: [], claim: "EXHAUSTIVE" });
    expect(vouched?.damage.damageEventCount).toEqual(exact(0));
    expect(vouched?.castCompleteEventCount).toEqual(exact(0));
    const uncertified = comparisons[0]?.subActors.children.find((entry) => entry.actorId === 92);
    expect(uncertified?.instances).toEqual({ items: [], claim: "OBSERVED_ONLY" });
    expect(uncertified?.damage.damageEventCount).toEqual({
      kind: "UNKNOWN",
      reason: "NO_INFORMATIVE_LOWER_BOUND",
    });
  });
});

// ---------------------------------------------------------------------------
// D/E/G/H: identity, coverage, casts
// ---------------------------------------------------------------------------

describe("D/E/G/H: instances, coverage composition and cast semantics", () => {
  it("D: every Rune Weapon instance is kept as its own ActorKey (instances are never merged)", () => {
    const instances = (facts: FightFacts) =>
      child(facts, "RUNE_WEAPON").flatMap((entry) => entry.instances.items.map((item) => item.key));
    expect([subject, ...comparisons].map((facts) => instances(facts).length)).toEqual([33, 30, 33, 30]);
    for (const facts of [subject, ...comparisons]) {
      const keys = instances(facts).map((key) => `${String(key.actorId)}#${String(key.instanceId)}`);
      expect(new Set(keys).size).toBe(keys.length);
    }
    for (const cell of subject.ledger.cells.items) expect(cell.source).toHaveProperty("instanceId");
  });

  it("E: the subject's seven granted segments compose into EXACT whole-fight facts; the comparisons are AT_LEAST", () => {
    expect(subject.basis).toEqual({ kind: "COVERAGE_VOUCHED" });
    expect(subject.environment.focusDamage.state.state).toBe("COMPLETE");
    expect(subject.environment.focusDamage.damageEventCount).toEqual(exact(2324));
    expect(subject.ledger.cells.claim).toBe("EXHAUSTIVE");
    expect(comparisons.map((facts) => facts.environment.focusDamage.damageEventCount)).toEqual([
      atLeast(2749),
      atLeast(2855),
      atLeast(2557),
    ]);
    for (const facts of comparisons) {
      expect(facts.basis.kind).toBe("UNCERTIFIED_FILTERED_CAPTURE");
      expect(facts.ledger.cells.claim).toBe("OBSERVED_ONLY");
    }
  });

  it("G: BEGIN and COMPLETE cast events are counted apart and never merged", () => {
    expect(subject.focusCasts.completeEventCount).toEqual(exact(668));
    expect(subject.focusCasts.beginEventCount).toEqual(exact(0));
    expect(comparisons.map((facts) => facts.focusCasts.completeEventCount)).toEqual([
      atLeast(671),
      atLeast(733),
      atLeast(727),
    ]);
    const fight = syntheticFight({
      focusActorId: 5,
      events: [
        castEvent({ ordinal: 0, reportTimeMs: 1100, sourceActorId: 5, abilityGameId: 7, castPhase: "BEGIN" }),
        castEvent({
          ordinal: 1,
          reportTimeMs: 1600,
          sourceActorId: 5,
          abilityGameId: 7,
          castPhase: "COMPLETE",
        }),
      ],
      observedCategories: ["CASTS"],
      actorScope: [5],
    });
    const casts = summarizeCasts(fight, { kind: "COVERAGE_VOUCHED" }, [5], { startMs: 1000, endMs: 5000 });
    expect(casts.byAbility.items).toEqual([
      { abilityGameId: 7, beginEventCount: exact(1), completeEventCount: exact(1) },
    ]);
  });

  it("H: cast events sharing a millisecond keep retrieval order, marked not proven", () => {
    const fight = syntheticFight({
      focusActorId: 5,
      events: [
        castEvent({
          ordinal: 0,
          reportTimeMs: 1100,
          sourceActorId: 5,
          abilityGameId: 1,
          castPhase: "COMPLETE",
        }),
        castEvent({
          ordinal: 1,
          reportTimeMs: 1100,
          sourceActorId: 5,
          abilityGameId: 2,
          castPhase: "COMPLETE",
        }),
        castEvent({
          ordinal: 2,
          reportTimeMs: 1200,
          sourceActorId: 5,
          abilityGameId: 3,
          castPhase: "COMPLETE",
        }),
      ],
      observedCategories: ["CASTS"],
      actorScope: [5],
    });
    const sequence = summarizeCasts(fight, { kind: "COVERAGE_VOUCHED" }, [5], { startMs: 1000, endMs: 5000 })
      .sequence.items;
    expect(sequence.map((entry) => [entry.abilityGameId, entry.order])).toEqual([
      [1, "RETRIEVAL_ORDER_NOT_PROVEN_AUTHORITATIVE"],
      [2, "RETRIEVAL_ORDER_NOT_PROVEN_AUTHORITATIVE"],
      [3, "UNIQUE_TIMESTAMP"],
    ]);
    const tied = subject.focusCasts.sequence.items.filter((entry) => entry.order !== "UNIQUE_TIMESTAMP");
    expect(tied.length).toBeGreaterThan(0);
    for (const entry of tied) {
      expect(
        subject.focusCasts.sequence.items.filter((other) => other.reportTimeMs === entry.reportTimeMs).length,
      ).toBeGreaterThan(1);
    }
  });
});

// ---------------------------------------------------------------------------
// I/J/K/L: amounts and raw fields
// ---------------------------------------------------------------------------

describe("I/J/K/L: raw amount never masquerades as Warcraft Logs damage; hitType stays raw", () => {
  it("I/K: every ledger cell names RAW_AMOUNT_FIELD_SUM and M1 NOT_YET_PROVEN; the raw sum is not WCL's total", () => {
    expect(RAW_AMOUNT_MEANING).toBe("NOT_YET_PROVEN");
    for (const cell of [...subject.ledger.cells.items, ...(comparisons[0]?.ledger.cells.items ?? [])]) {
      expect(cell.amountAuthority).toBe("RAW_AMOUNT_FIELD_SUM");
      expect(cell.rawAmountMeaning).toBe("NOT_YET_PROVEN");
    }
    expect(subject.environment.focusDamage.rawAmountFieldSum).toEqual({
      kind: "EXACT",
      value: { sumOfSuppliedValues: 37386630, eventsSupplyingField: 2324, eventsNotSupplyingField: 0 },
    });
    // The WCL raid entry (focus + pets) is a different quantity, kept apart.
    expect(subject.wclComputed.focusRaidEntry).toMatchObject({
      amountAuthority: "WCL_RAID_DAMAGE_DONE_TABLE",
      total: 45802009,
    });
    // Under an uncertified capture no raw sum is claimed at all.
    for (const facts of comparisons) {
      expect(facts.environment.focusDamage.rawAmountFieldSum).toEqual({
        kind: "UNKNOWN",
        reason: "FIELD_DOMAIN_NOT_PROVEN",
      });
    }
  });

  it("J: every Warcraft Logs-computed amount states its authority and interval", () => {
    for (const facts of comparisons) {
      expect(facts.wclComputed.focusRaidEntry?.amountAuthority).toBe("WCL_RAID_DAMAGE_DONE_TABLE");
      const perActor = facts.wclComputed.perActor;
      if (perActor === "NO_PER_ACTOR_TABLES") throw new Error("comparison tables missing");
      for (const entry of perActor) expect(entry.amountAuthority).toBe("WCL_DAMAGE_DONE_TABLE");
    }
    expect(subject.wclComputed.perActor).toBe("NO_PER_ACTOR_TABLES");
    expect(subject.wclComputed.petsInRaidEntry.map((pet) => [pet.actorId, pet.total])).toEqual([
      [44, 7344648],
      [45, 1333469],
      [47, 248333],
    ]);
  });

  it("L: hitType distributions are raw numbers with no mapping anywhere in the facts", () => {
    expect(subject.environment.focusDamage.hitTypeRaw).toEqual({
      items: [
        { hitTypeRaw: 1, observedEventCount: 1781 },
        { hitTypeRaw: 2, observedEventCount: 531 },
        { hitTypeRaw: 10, observedEventCount: 12 },
      ],
      claim: "EXHAUSTIVE",
    });
    const text = JSON.stringify([subject, ...comparisons], (_key, value: unknown) =>
      value instanceof Set ? [...value] : value,
    );
    expect(text).not.toMatch(/"(CRIT|CRITICAL|NORMAL_HIT|MISS|IMMUNE|PARRY|DODGE|GLANCING)"/);
  });
});

// ---------------------------------------------------------------------------
// M/N/O: target classification
// ---------------------------------------------------------------------------

describe("M/N/O: target labels are metadata, never hostility", () => {
  it("M/N: boss-subtype and enemy-listed targets carry hostility and targetability UNKNOWN", () => {
    for (const facts of [subject, ...comparisons]) {
      for (const entry of facts.environment.focusDamage.participation.items) {
        expect(entry.description.hostility).toBe("UNKNOWN");
        expect(entry.description.targetability).toBe("UNKNOWN");
      }
    }
    const c1Labels = comparisons[0]?.environment.focusDamage.byTargetLabel.items.map((entry) => entry.label);
    expect(c1Labels).toEqual(["WCL_BOSS_SUBTYPE", "WCL_ENEMY_NPC_CLASSIFIED"]);
  });

  it("O: a player hit by the focus stays OBSERVED_PLAYER_TARGET — the E2 friendly-target edge, and C2's", () => {
    const players = (facts: FightFacts) =>
      facts.environment.focusDamage.byTargetLabel.items.find(
        (entry) => entry.label === "OBSERVED_PLAYER_TARGET",
      )?.damageEventCount;
    expect(players(subject)).toEqual(exact(44));
    expect(players(comparisons[1] as FightFacts)).toEqual(atLeast(95));
    const fight = syntheticFight({
      actors: new Map([
        [
          9,
          {
            actorId: 9,
            gameId: 1,
            name: null,
            server: null,
            actorType: "PLAYER",
            rawType: "Player",
            subType: "Paladin",
            petOwnerActorId: null,
          },
        ],
      ]),
    });
    // Even a (malformed) enemy list naming a player never makes it an enemy-classified target.
    expect(describeTargetActor(fight, 9, { kind: "RETRIEVED", actorIds: new Set([9]) }).label).toBe(
      "OBSERVED_PLAYER_TARGET",
    );
  });

  it("the subject's enemy list is not held, so no target of it is called enemy-classified", () => {
    expect(subject.environment.enemyNpcs).toEqual({
      kind: "NOT_RETRIEVED",
      reason: "SUBJECT_NEVER_REFETCHED",
    });
    expect(subject.environment.focusDamage.byTargetLabel.items.map((entry) => entry.label)).not.toContain(
      "WCL_ENEMY_NPC_CLASSIFIED",
    );
    expect(comparisons[2]?.environment.enemyListedNotObservedHitByFocus).toEqual([321]);
  });
});

// ---------------------------------------------------------------------------
// P/Q/R: cooldown windows
// ---------------------------------------------------------------------------

const DRW = BLOOD_POST_HOC_DEFINITION.cooldownWindows[0] as unknown as CooldownWindowDefinition;

describe("P/Q/R: Dancing Rune Weapon windows come from observed aura transitions", () => {
  it("P: the subject's 17 windows, their lengths, and the four casts' temporal association", () => {
    const facts = subject.cooldowns[0]?.windows;
    expect(facts?.windows.claim).toBe("EXHAUSTIVE");
    expect(
      facts?.windows.items.map((window) =>
        window.length.kind === "OBSERVED" ? window.length.durationMs : null,
      ),
    ).toEqual([
      18655, 8025, 15889, 8018, 14080, 17936, 8010, 8008, 21859, 13019, 8004, 8008, 8002, 8023, 8007, 25528,
      8002,
    ]);
    expect(facts?.triggerCasts.items.map((cast) => cast.association)).toEqual([
      { kind: "AT_WINDOW_START", windowIndex: 1 },
      { kind: "DURING_ACTIVE_WINDOW", windowIndex: 6 },
      { kind: "DURING_ACTIVE_WINDOW", windowIndex: 10 },
      { kind: "AT_WINDOW_START", windowIndex: 16 },
    ]);
    expect(comparisons.map((entry) => entry.cooldowns[0]?.windows.windows.items.length)).toEqual([
      19, 18, 19,
    ]);
  });

  it("Q: an unobserved end is UNKNOWN — never a nominal duration; the comparisons' last windows prove it on real bytes", () => {
    for (const facts of comparisons) {
      const last = facts.cooldowns[0]?.windows.windows.items.at(-1);
      expect(last?.end).toEqual({ kind: "UNKNOWN", reason: "NO_REMOVAL_OBSERVED" });
      expect(last?.length).toEqual({ kind: "UNKNOWN", reason: "END_NOT_OBSERVED" });
    }
    const aura = (ordinal: number, at: number, operation: "APPLIED" | "REFRESHED" | "REMOVED") =>
      auraEvent({
        ordinal,
        reportTimeMs: at,
        sourceActorId: 5,
        targetActorId: 5,
        abilityGameId: 81256,
        operation,
        auraClass: "BUFF",
      });
    const fight = syntheticFight({
      focusActorId: 5,
      events: [
        aura(0, 1100, "REFRESHED"),
        aura(1, 1300, "REMOVED"),
        aura(2, 2000, "APPLIED"),
        aura(3, 2500, "APPLIED"),
        aura(4, 3000, "REMOVED"),
        castEvent({
          ordinal: 5,
          reportTimeMs: 2002,
          sourceActorId: 5,
          abilityGameId: 49028,
          castPhase: "COMPLETE",
        }),
        aura(6, 4000, "APPLIED"),
      ] as CombatEvent[],
      observedCategories: ["AURAS", "CASTS"],
      actorScope: [5],
    });
    const windows = observeCooldownWindows(fight, { kind: "COVERAGE_VOUCHED" }, 5, DRW).windows.items;
    expect(windows.map((window) => [window.start, window.end, window.length])).toEqual([
      [
        { kind: "UNKNOWN", reason: "NO_APPLICATION_OBSERVED" },
        { kind: "OBSERVED", reportTimeMs: 1300 },
        { kind: "UNKNOWN", reason: "START_NOT_OBSERVED" },
      ],
      [
        { kind: "OBSERVED", reportTimeMs: 2000 },
        { kind: "UNKNOWN", reason: "APPLIED_AGAIN_WITHOUT_OBSERVED_REMOVAL" },
        { kind: "UNKNOWN", reason: "END_NOT_OBSERVED" },
      ],
      [
        { kind: "OBSERVED", reportTimeMs: 2500 },
        { kind: "OBSERVED", reportTimeMs: 3000 },
        { kind: "OBSERVED", durationMs: 500 },
      ],
      [
        { kind: "OBSERVED", reportTimeMs: 4000 },
        { kind: "UNKNOWN", reason: "NO_REMOVAL_OBSERVED" },
        { kind: "UNKNOWN", reason: "END_NOT_OBSERVED" },
      ],
    ]);
    expect(windows[1]?.trigger).toEqual({ kind: "CAST_AT_START", castAtMs: 2002, offsetMs: 2 });
  });

  it("R: Rune Weapon instances attach to windows by observed span — many instances, four casts, ambiguity kept", () => {
    const tally = (facts: FightFacts) => {
      const counts: Record<string, number> = {};
      for (const entry of child(facts, "RUNE_WEAPON")) {
        for (const instance of entry.instances.items)
          counts[instance.windowAssociation.kind] = (counts[instance.windowAssociation.kind] ?? 0) + 1;
      }
      return counts;
    };
    expect(tally(subject)).toEqual({
      OVERLAPS_SEVERAL_WINDOWS: 26,
      WITHIN_ONE_WINDOW: 3,
      OVERLAPS_ONE_WINDOW_PARTIALLY: 4,
    });
    expect(tally(comparisons[0] as FightFacts)).toEqual({
      OVERLAPS_SEVERAL_WINDOWS: 23,
      OVERLAPS_ONE_WINDOW_PARTIALLY: 1,
      WITHIN_ONE_WINDOW: 1,
      AMBIGUOUS_WINDOW_BOUND_NOT_OBSERVED: 5,
    });
    // Instances outnumber casts: one cast is never one instance.
    expect(child(subject, "RUNE_WEAPON")[0]?.instances.items.length).toBeGreaterThan(
      subject.cooldowns[0]?.windows.triggerCasts.items.length ?? 0,
    );
  });
});

// ---------------------------------------------------------------------------
// U/V: Blood Beast and deaths
// ---------------------------------------------------------------------------

describe("U/V: the Blood Beast decomposition, and deaths as positive facts", () => {
  it("U: summons, casts, hits, boss vs other targets, target count and both amount authorities", () => {
    const beast = child(subject, "BLOOD_BEAST")[0];
    expect({
      instances: beast?.instances.items.length,
      summons: beast?.summons.items.length,
      casts: beast?.castCompleteEventCount,
      hits: beast?.damage.damageEventCount,
      boss: beast?.damage.byTargetLabel.items.find((entry) => entry.label === "WCL_BOSS_SUBTYPE")
        ?.damageEventCount,
      targets: beast?.damage.distinctTargets,
      raw: beast?.damage.rawAmountFieldSum,
    }).toEqual({
      instances: 4,
      summons: 4,
      casts: exact(102),
      hits: exact(110),
      boss: exact(81),
      targets: exact(12),
      raw: {
        kind: "EXACT",
        value: { sumOfSuppliedValues: 1014118, eventsSupplyingField: 110, eventsNotSupplyingField: 0 },
      },
    });
    expect(subject.wclComputed.petsInRaidEntry.find((pet) => pet.actorId === 45)?.total).toBe(1333469);
    expect(comparisons.map((facts) => child(facts, "BLOOD_BEAST")[0]?.damage.damageEventCount)).toEqual([
      atLeast(121),
      atLeast(124),
      atLeast(119),
    ]);
    for (const facts of [subject, ...comparisons]) {
      for (const instance of child(facts, "BLOOD_BEAST")[0]?.instances.items ?? []) {
        expect(["WITHIN_ONE_WINDOW", "OVERLAPS_SEVERAL_WINDOWS"]).toContain(instance.windowAssociation.kind);
      }
    }
  });

  it("V: deaths are positive facts only; nothing anywhere says alive", () => {
    expect(subject.environment.deaths.map((death) => death.actor.actorId)).toEqual([45, 45, 45, 45]);
    expect(subject.environment.deathAbsenceSemantics).toBe("NONE");
    expect(JSON.stringify(subject.environment)).not.toMatch(/alive|survived|ALIVE/i);
  });
});

// ---------------------------------------------------------------------------
// The four-fight report and the G1 join of ACTUAL_DPS
// ---------------------------------------------------------------------------

describe("the four-fight report", () => {
  it("re-checks every comparison's raid entry against G1's ACTUAL_DPS: EQUAL, and EVIDENCE_MISMATCH when it is not", async () => {
    const g1 = await committedG1Cohort();
    comparisons.forEach((facts, index) => {
      const member = g1.cohort.members[index];
      const raid = facts.wclComputed.focusRaidEntry;
      if (member === undefined || raid === null) throw new Error("missing");
      expect(g1AgreementOf(raid.total, raid.interval.toMs - raid.interval.fromMs, member.dps)).toBe("EQUAL");
      expect(g1AgreementOf(raid.total + 10_000, raid.interval.toMs - raid.interval.fromMs, member.dps)).toBe(
        "EVIDENCE_MISMATCH",
      );
    });
    const subjectPerformance = subjectObservedPerformance();
    expect(subjectPerformance.actualDps).toMatchObject({ status: "OBSERVED", evidence: { total: 45802009 } });
  });

  it("is deterministic, labels its authorities, and states no judgement", () => {
    const fights: ReportedFight[] = [subject, ...comparisons].map((facts, index) => ({
      label: index === 0 ? "Subject" : `C${String(index)}`,
      role: index === 0 ? "SUBJECT" : "COMPARISON",
      performance: {
        actualDps: { value: 1, source: "test" },
        durationMs: 1,
        itemLevel: null,
        g1Agreement: "EQUAL",
      },
      facts,
    }));
    const names = new Map([[49998, "Death Strike"]]);
    const first = renderFourFightReport(fights, names);
    expect(renderFourFightReport(fights, names)).toBe(first);
    expect(first).toContain("(WCL table)");
    expect(first).toContain("(raw amount, M1)");
    expect(first).toContain("label unavailable (enemy list not retrieved)");
    expect(first).not.toMatch(/\b(should|better|worse|ceiling|efficiency|recommend\w*|blame|lost|loss)\b/i);
  });

  it("an uncertified capture never reads as zero: absent abilities are 'none observed', not 0", () => {
    const basis: EvidenceBasis = { kind: "UNCERTIFIED_FILTERED_CAPTURE", reason: "test" };
    const fight = syntheticFight({
      focusActorId: 5,
      events: [damageEvent({ ordinal: 0, reportTimeMs: 1100, sourceActorId: 5, targetActorId: 9 })],
    });
    const ledger = buildDamageLedger(fight, basis, [5], [{ sliceId: "FIGHT", startMs: 1000, endMs: 5000 }], {
      kind: "NOT_RETRIEVED",
      reason: "test",
    });
    expect(ledger.cells.items[0]?.eventCount).toEqual(atLeast(1));
    expect(ledger.cells.items[0]?.rawAmountFieldSum).toEqual({
      kind: "UNKNOWN",
      reason: "FIELD_DOMAIN_NOT_PROVEN",
    });
  });
});
