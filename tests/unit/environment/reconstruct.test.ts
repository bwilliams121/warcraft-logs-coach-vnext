/**
 * M11-G3-4: environment reconstruction of the canonical subject from committed
 * evidence, and the negative cases that keep it fail-closed.
 *
 * Covers A (exact duration), C (retrospective fight-end assumption), D/E (raid
 * buffs only from the subject's own evidence; UNKNOWN stays UNKNOWN), G/I
 * (Bloodlust identity/timing; missing timing stays UNKNOWN), J–N
 * (consumables), P (tank load), Q–T (no availability from engagement,
 * membership, summons or deaths), X (character readiness is separate) and AC
 * (model build lag is a diagnostic).
 */

import { beforeAll, describe, expect, it } from "vitest";

import { reconstructCharacterProfile } from "../../../src/character-profile/reconstruct.js";
import { TANK_LOAD_REVISIONS, tankLoadDirectives } from "../../../src/environment/assumptions.js";
import type { EnvironmentReconstructionResult } from "../../../src/environment/model.js";
import {
  reconstructEnvironment,
  USER_STATED_NONE,
  type EnvironmentReconstructionInput,
} from "../../../src/environment/reconstruct.js";
import type { CombatEvent } from "../../../src/engine/normalization/normalized-events.js";
import { canonicalJson, sha256Hex } from "../../../src/simulation/canonical.js";
import { BLOOD_CHARACTER_BINDING } from "../../../src/specs/deathknight/blood/character-binding.js";
import { reconstructionInputOf, subjectEvidence } from "../../support/character/subject.js";
import {
  subjectContextFight,
  subjectEnvironmentInput,
} from "../../support/environment/subject-environment.js";

let input: EnvironmentReconstructionInput;
let result: EnvironmentReconstructionResult;

beforeAll(async () => {
  input = await subjectEnvironmentInput();
  result = reconstructEnvironment(input);
}, 120_000);

const withEvents = (
  base: EnvironmentReconstructionInput,
  keep: (event: CombatEvent) => boolean,
  extra: CombatEvent[] = [],
): EnvironmentReconstructionInput => ({
  ...base,
  fight: {
    ...base.fight,
    events: [...base.fight.events.filter(keep), ...extra].sort((a, b) => a.reportTimeMs - b.reportTimeMs),
  },
});
const codes = (r: EnvironmentReconstructionResult) => r.blockers.map((issue) => issue.code);
const buff = (r: EnvironmentReconstructionResult, name: string) =>
  r.environment.raidBuffs.find((entry) => entry.override === name);

describe("M11-G3-4 environment reconstruction — canonical subject", () => {
  it("A: reconstructs the exact committed fight interval", () => {
    const { fight } = subjectContextFight();
    expect(fight.endTime - fight.startTime).toBe(345_177);
    expect(result.environment.duration.interval).toMatchObject({
      state: "KNOWN",
      value: { startReportMs: fight.startTime, endReportMs: fight.endTime, durationMs: 345_177 },
    });
    expect(result.environment.duration.finality).toBe("COMPLETED");
  });

  it("C: records RETROSPECTIVE_EXACT_FIGHT_END@1 as an owner-approved assumption in provenance, never as observed knowledge", () => {
    expect(result.environment.duration.fightEndKnowledge).toMatchObject({
      state: "MODEL_ASSUMPTION",
      assumption: { id: "RETROSPECTIVE_EXACT_FIGHT_END", version: 1 },
    });
    expect(result.assumptions.find((a) => a.id === "RETROSPECTIVE_EXACT_FIGHT_END")).toMatchObject({
      approval: "OWNER_APPROVED",
    });
    expect(
      result.diagnostics.some(
        (d) => d.code === "ASSUMPTION_RECORDED" && d.detail.startsWith("RETROSPECTIVE_EXACT_FIGHT_END@1"),
      ),
    ).toBe(true);
  });

  it("primary target: the one boss-subtype actor observed in the fight; continuity PRIMARY_TARGET_CONTINUOUS_V1, approved for this fight only", () => {
    const primary = result.environment.primaryTarget;
    expect(primary.identity).toMatchObject({ state: "KNOWN", value: { actorId: 161, gameId: 259181 } });
    expect(primary.availability).toMatchObject({
      state: "MODEL_ASSUMPTION",
      assumption: { id: "PRIMARY_TARGET_CONTINUOUS_V1", version: 1 },
    });
    expect(result.assumptions.find((a) => a.id === "PRIMARY_TARGET_CONTINUOUS_V1")?.approval).toBe(
      "OWNER_APPROVED",
    );
    // Not generalized: the same evidence under another fight reference stays PENDING.
    const other = reconstructEnvironment({
      ...input,
      subject: { ...input.subject, fightRef: "OTHERREPORT#48" },
    });
    expect(other.assumptions.find((a) => a.id === "PRIMARY_TARGET_CONTINUOUS_V1")?.approval).toBe(
      "PENDING_OWNER_APPROVAL",
    );
    const otherEncounter = reconstructEnvironment({
      ...input,
      fight: { ...input.fight, fight: { ...input.fight.fight, encounterId: 9999 } },
    });
    expect(otherEncounter.assumptions.find((a) => a.id === "PRIMARY_TARGET_CONTINUOUS_V1")?.approval).toBe(
      "PENDING_OWNER_APPROVAL",
    );
    expect(primary.engagement).toMatchObject({
      kind: "OBSERVED_ENGAGEMENT_SPAN",
      firstObservedMs: 649,
      lastObservedMs: 345_089,
      largestGapMs: 2475,
    });
    expect(primary.availabilityEvidence.find((a) => a.source === "TARGETABILITY")?.status).toBe(
      "CAPABILITY_NOT_ESTABLISHED",
    );
  });

  it("raid buffs: six player auras whole-fight from the subject's pull auras; target debuffs UNKNOWN (not vouched)", () => {
    for (const [name, spellId] of [
      ["arcane_intellect", 1459],
      ["battle_shout", 6673],
      ["blessing_of_the_bronze", 381732],
      ["mark_of_the_wild", 1126],
      ["power_word_fortitude", 21562],
      ["skyfury", 462854],
    ] as const) {
      expect(buff(result, name)?.presence, name).toMatchObject({
        state: "KNOWN",
        value: { kind: "WHOLE_FIGHT", auraSpellId: spellId },
      });
    }
    expect(buff(result, "mark_of_the_wild")?.presence).toMatchObject({
      value: { refreshedAtMs: [326_041, 326_977] },
    });
    for (const name of ["chaos_brand", "mystic_touch", "hunters_mark", "mortal_wounds", "bleeding"]) {
      expect(buff(result, name)?.presence.state, name).toBe("UNKNOWN");
    }
  });

  it("D: a raid buff is never inferred from raid composition — the caster in the catalog proves nothing", () => {
    const facts = input.pullFacts?.facts;
    if (facts?.auras === null || facts === undefined) throw new Error("no pull auras");
    const withoutIntellect: EnvironmentReconstructionInput = {
      ...input,
      pullFacts: {
        actorId: 15,
        facts: { ...facts, auras: facts.auras.filter((aura) => aura.spellId !== 1459) },
      },
    };
    // The Arcane Intellect caster (actor 7) is still in the catalog and in the raid.
    expect(input.fight.actors.has(7)).toBe(true);
    const r = reconstructEnvironment(withoutIntellect);
    expect(buff(r, "arcane_intellect")?.presence.state).toBe("UNKNOWN");
  });

  it("E: an UNKNOWN raid buff never becomes KNOWN_NONE, even with COMPLETE subject aura coverage", () => {
    for (const entry of result.environment.raidBuffs) expect(entry.presence.state).not.toBe("KNOWN_NONE");
    expect(codes(result).filter((code) => code === "RAID_BUFF_UNKNOWN")).toHaveLength(5);
  });

  it("a removal mid-fight makes a buff TIMED (not representable), never silently whole-fight", () => {
    const removal = {
      ...(input.fight.events.find((e) => e.kind === "AURA" && e.abilityGameId === 1126) as CombatEvent),
      operation: "REMOVED",
    } as CombatEvent;
    const r = reconstructEnvironment(withEvents(input, () => true, [removal]));
    expect(buff(r, "mark_of_the_wild")?.presence).toMatchObject({ state: "KNOWN", value: { kind: "TIMED" } });
    expect(codes(r)).toContain("RAID_BUFF_TIMED");
    expect(r.checks.find((c) => c.component === "raidBuffs")?.state).toBe("NOT_REPRESENTABLE");
  });

  it("G: Bloodlust is the pinned-equivalent Heroism on the subject, with its exact observed start and end", () => {
    expect(result.environment.bloodlust.applications).toMatchObject({
      state: "KNOWN",
      value: [
        {
          spellId: 32182,
          equivalence: "ENGINE_BLOODLUST_EQUIVALENT",
          sourceActorId: 8,
          startMs: { state: "KNOWN", value: 471 },
          endMs: { state: "KNOWN", value: 40_475 },
        },
      ],
    });
    expect(result.environment.bloodlust.satedObservations).toEqual([{ spellId: 57723, atMs: 471 }]);
    expect(result.diagnostics.find((d) => d.code === "BLOODLUST_ENGINE_WHOLE_SECOND")?.detail).toContain(
      "begins at 1000 ms",
    );
  });

  it("I: missing lust timing stays UNKNOWN — no application event, or incomplete coverage", () => {
    const noStart = reconstructEnvironment(
      withEvents(
        input,
        (e) => !(e.kind === "AURA" && e.abilityGameId === 32182 && e.operation === "APPLIED"),
      ),
    );
    const apps = noStart.environment.bloodlust.applications;
    expect(apps.state === "KNOWN" && apps.value[0]?.startMs.state).toBe("UNKNOWN");
    expect(codes(noStart)).toContain("BLOODLUST_TIMING_UNRESOLVED");

    const auras = input.fight.completeness.categories.AURAS;
    if (auras.capability !== "OBSERVABLE") throw new Error("expected observable auras");
    const partial: EnvironmentReconstructionInput = {
      ...input,
      fight: {
        ...input.fight,
        completeness: {
          ...input.fight.completeness,
          categories: {
            ...input.fight.completeness.categories,
            AURAS: {
              ...auras,
              coverage: {
                ...auras.coverage,
                state: "PARTIAL",
                coveredRanges: [
                  {
                    ...auras.coverage.coveredRanges[0]!,
                    toReportTimeMs: input.fight.fight.startTimeMs + 100_000,
                  },
                ],
              },
            },
          },
        },
      },
    };
    const r = reconstructEnvironment(partial);
    expect(r.environment.bloodlust.applications.state).toBe("UNKNOWN");
    expect(codes(r)).toContain("BLOODLUST_TIMING_UNRESOLVED");
    // and nothing became whole-fight through the gap
    for (const name of ["battle_shout", "skyfury"]) expect(buff(r, name)?.presence.state).toBe("UNKNOWN");
  });

  it("a lockout without a recognised lust is UNKNOWN, never KNOWN_NONE", () => {
    const r = reconstructEnvironment(
      withEvents(input, (e) => !(e.kind === "AURA" && e.abilityGameId === 32182)),
    );
    expect(r.environment.bloodlust.applications.state).toBe("UNKNOWN");
    const none = reconstructEnvironment(
      withEvents(
        input,
        (e) => !(e.kind === "AURA" && (e.abilityGameId === 32182 || e.abilityGameId === 57723)),
      ),
    );
    expect(none.environment.bloodlust.applications.state).toBe("KNOWN_NONE");
  });

  it("J: the observed temporary enchant (8052) resolves to its pinned token; persistence is a pending assumption", () => {
    expect(result.environment.consumables.temporaryEnchants).toEqual([
      expect.objectContaining({
        slot: "main_hand",
        enchant: expect.objectContaining({
          state: "KNOWN",
          value: { enchantId: 8052, engineToken: "thalassian_phoenix_oil_2" },
        }),
        persistence: expect.objectContaining({
          state: "MODEL_ASSUMPTION",
          assumption: expect.objectContaining({ id: "TEMPORARY_ENCHANT_PERSISTS_WHOLE_FIGHT" }),
        }),
      }),
    ]);
  });

  it("K/L: food and augment rune stay UNKNOWN, with the unclassified pull auras kept as candidates only", () => {
    for (const kind of ["FOOD", "AUGMENTATION"] as const) {
      const entry = result.environment.consumables.setup.find((s) => s.kind === kind);
      expect(entry?.identity.state, kind).toBe("UNKNOWN");
      expect(entry?.presence.state, kind).toBe("UNKNOWN");
      expect(entry?.unclassifiedCandidates, kind).toEqual([1296934, 1303171, 1303184, 1285644]);
    }
  });

  it("M: flask and potion identities are known, their ranks are not (two item levels apply each aura)", () => {
    const flask = result.environment.consumables.setup.find((s) => s.kind === "FLASK");
    expect(flask?.identity).toMatchObject({ state: "KNOWN", value: { spellId: 1235057 } });
    expect(flask?.rank.state).toBe("UNKNOWN");
    expect(flask?.presence.state).toBe("KNOWN");
    expect(result.environment.consumables.potion.identity).toMatchObject({
      state: "KNOWN",
      value: { spellId: 1236994 },
    });
    expect(result.environment.consumables.potion.rank.state).toBe("UNKNOWN");
    // H: the complete plausible rank set, each with its pinned engine token — never a chosen rank.
    expect(flask?.rankOptions).toEqual([
      { itemLevel: 278, token: "flask_of_thalassian_resistance_1", representable: true },
      { itemLevel: 295, token: "flask_of_thalassian_resistance_2", representable: true },
    ]);
    expect(result.environment.consumables.potion.rankOptions).toEqual([
      { itemLevel: 278, token: "potion_of_recklessness_1", representable: true },
      { itemLevel: 295, token: "potion_of_recklessness_2", representable: true },
    ]);
    expect(codes(result)).not.toContain("CONSUMABLE_RANK_UNRESOLVED");
    expect(codes(result)).not.toContain("CONSUMABLE_RANK_NOT_REPRESENTABLE");
    expect(result.diagnostics.filter((d) => d.code === "RANK_ENVELOPE_RECORDED")).toHaveLength(2);
  });

  it("N: the potion's two observed uses are preserved exactly, separate from identity", () => {
    const potion = result.environment.consumables.potion;
    expect(potion.uses).toMatchObject({
      state: "KNOWN",
      value: [
        { activeFromMs: { state: "KNOWN", value: 1921 }, activeToMs: { state: "KNOWN", value: 31_951 } },
        { activeFromMs: { state: "KNOWN", value: 303_773 }, activeToMs: { state: "KNOWN", value: 333_776 } },
      ],
    });
    expect(potion.castsAtMs).toEqual([1922, 303_773]);
    // I: potion timing is the elite APL's (owner policy); the observed uses are evidence only.
    expect(potion.timingPolicy).toBe("ELITE_APL_TIMING");
    expect(result.assumptions.find((a) => a.id === "POTION_TIMING_ELITE_APL_V1")?.approval).toBe(
      "OWNER_APPROVED",
    );
    expect(JSON.stringify(result.blockers)).not.toMatch(/POTION_TIMING|potion timing/i);
  });

  it("P: STANDARD_TANK_LOAD_V1 is explicit, versioned, and its revision is the hash of its directives", async () => {
    const tank = result.environment.tankLoad;
    expect(tank).toMatchObject({
      model: "STANDARD_TANK_LOAD_V1",
      version: 1,
      directives: ["tank_dummy=<primary target>", "tank_dummy_type=mythic"],
    });
    expect(tank.load).toMatchObject({
      state: "MODEL_ASSUMPTION",
      assumption: { id: "STANDARD_TANK_LOAD_V1" },
    });
    expect(
      await sha256Hex(
        canonicalJson({
          model: "STANDARD_TANK_LOAD_V1",
          version: 1,
          directives: tankLoadDirectives("STANDARD_TANK_LOAD_V1"),
        }),
      ),
    ).toBe(TANK_LOAD_REVISIONS.STANDARD_TANK_LOAD_V1);
  });

  it("Q: first/last observed hits never become availability, however dense", () => {
    const schedule = result.environment.targetSchedule;
    expect(schedule.candidates.map((c) => [c.actorId, c.gameId])).toEqual([
      [179, 260_895],
      [180, 260_905],
    ]);
    for (const candidate of schedule.candidates) {
      expect(candidate.engagement?.kind).toBe("OBSERVED_ENGAGEMENT_SPAN");
      expect(candidate.availability.state).toBe("UNKNOWN");
      expect(candidate.availabilityEvidence.find((a) => a.source === "OBSERVED_ENGAGEMENT")?.status).toBe(
        "NOT_AVAILABILITY_EVIDENCE",
      );
    }
    expect(schedule.candidates[0]?.observedClusters).toHaveLength(4);
    expect(schedule.schedule.state).toBe("UNKNOWN");
    expect(codes(result)).toContain("TARGET_SCHEDULE_UNRESOLVED");
    // A hit every second for the whole fight is still only observations.
    const template = input.fight.events.find(
      (e) => e.kind === "DAMAGE" && e.target?.actorId === 179,
    ) as CombatEvent;
    const dense = Array.from(
      { length: 345 },
      (_, i) => ({ ...template, reportTimeMs: input.fight.fight.startTimeMs + i * 1000 }) as CombatEvent,
    );
    const r = reconstructEnvironment(withEvents(input, () => true, dense));
    expect(r.environment.targetSchedule.candidates.find((c) => c.actorId === 179)?.availability.state).toBe(
      "UNKNOWN",
    );
  });

  it("R: catalog (enemy NPC) membership never becomes a candidate or availability", () => {
    const unengaged = [...input.fight.actors.values()].filter(
      (actor) =>
        actor.actorType === "NPC" &&
        !result.environment.targetSchedule.candidates.some((c) => c.actorId === actor.actorId) &&
        actor.actorId !== 161,
    );
    expect(unengaged.length).toBeGreaterThan(0);
    expect(
      result.environment.targetSchedule.candidates.some((c) =>
        unengaged.some((actor) => actor.actorId === c.actorId),
      ),
    ).toBe(false);
  });

  it("S/T: a summon observation or a death endpoint never creates an availability interval", () => {
    const template = input.fight.events.find(
      (e) => e.kind === "DAMAGE" && e.target?.actorId === 180,
    ) as CombatEvent;
    const start = input.fight.fight.startTimeMs;
    const summon = {
      ...template,
      kind: "SUMMON",
      rawType: "summon",
      reportTimeMs: start + 27_000,
      source: template.target,
      target: template.target,
    } as unknown as CombatEvent;
    const death = {
      ...template,
      kind: "DEATH",
      rawType: "death",
      reportTimeMs: start + 75_000,
      killer: "NOT_SUPPLIED",
      killingAbilityGameId: "NOT_SUPPLIED",
    } as unknown as CombatEvent;
    const r = reconstructEnvironment(withEvents(input, () => true, [summon, death]));
    const candidate = r.environment.targetSchedule.candidates.find((c) => c.actorId === 180);
    expect(candidate?.availability.state).toBe("UNKNOWN");
    expect(candidate?.availabilityEvidence.find((a) => a.source === "SUMMONS")?.status).not.toBe(
      "ESTABLISHED",
    );
    expect(r.environment.targetSchedule.schedule.state).toBe("UNKNOWN");
  });

  it("X: environment readiness says nothing about the character profile, and neither hides the other", async () => {
    const profile = reconstructCharacterProfile(
      reconstructionInputOf(await subjectEvidence()),
      BLOOD_CHARACTER_BINDING,
    );
    expect(profile.reconstructionStatus).toBe("PROFILE_NOT_SIMULATION_READY");
    expect(profile.blockers.map((b) => b.code)).toEqual(["RACE_UNRESOLVED"]);
    expect(JSON.stringify(result)).not.toMatch(/RACE|race/);
    expect(result.status).toBe("NOT_REPRESENTABLE");
  });

  it("AC: MODEL_BUILD_LAG by age is a diagnostic; a specific effect absent from the pinned data is a material incompatibility", () => {
    const lag = result.diagnostics.find((d) => d.code === "MODEL_BUILD_LAG");
    expect(lag?.detail).toContain("log 2026-10-01 is newer than the pinned client data (hotfix 2026-09-10");
    expect(codes(result)).not.toContain("MODEL_BUILD_LAG");
    expect(codes(result)).toContain("SETUP_AURA_UNCLASSIFIED");
    // 1303171 (Vantus Rune: Tides) IS in the pinned spell data: unclassified, but not lag.
    // One blocker per missing observed effect.
    expect(
      result.blockers.filter((b) => b.code === "PINNED_MODEL_MISSING_OBSERVED_EFFECT").map((b) => b.detail),
    ).toEqual(
      [1296934, 1303184, 1285644].map(
        (spellId) =>
          `subject pull aura ${String(spellId)} is absent from the pinned spell data (client data 12.1.0.69587, hotfix 2026-09-10; log 2026-10-01): its effect cannot be represented`,
      ),
    );
  });

  it("recorded audits: no pinned encounter schedule authority, and no certified boss-debuff windows — neither creates a fact", () => {
    for (const candidate of result.environment.targetSchedule.candidates) {
      expect(candidate.availabilityEvidence.find((a) => a.source === "PINNED_ENCOUNTER_DATA")).toMatchObject({
        status: "AUTHORITY_NOT_FOUND",
        detail: expect.stringContaining("PINNED_ENCOUNTER_SCHEDULE_AUTHORITY_NOT_FOUND"),
      });
      expect(candidate.availability.state).toBe("UNKNOWN");
    }
    expect(result.environment.targetSchedule.schedule.state).toBe("UNKNOWN");
    for (const name of ["chaos_brand", "mystic_touch", "hunters_mark"]) {
      const presence = buff(result, name)?.presence;
      expect(presence?.state, name).toBe("UNKNOWN");
      expect(presence?.state === "UNKNOWN" && presence.reason, name).toContain(
        "WCL_DEBUFF_INTERVAL_CERTIFICATION_NOT_ACHIEVED",
      );
    }
    // Another encounter carries no schedule audit; another fight no certification attempt.
    const otherEncounter = reconstructEnvironment({
      ...input,
      fight: { ...input.fight, fight: { ...input.fight.fight, encounterId: 9999 } },
    });
    expect(
      otherEncounter.environment.targetSchedule.candidates
        .flatMap((c) => c.availabilityEvidence)
        .some((a) => a.source === "PINNED_ENCOUNTER_DATA"),
    ).toBe(false);
  });

  it("unidentified auras stay blocking; a WCL display name never identifies them", () => {
    for (const spellId of [1285644, 1296934, 1303171, 1303184]) {
      expect(result.environment.pullAuras.find((a) => a.spellId === spellId)?.classification).toBe(
        "UNCLASSIFIED_SELF",
      );
    }
    expect(JSON.stringify(result.environment)).not.toMatch(/Hearty Well Fed|Fury of the Dead/);
  });

  it("defensive ally auras: the pinned list is excluded under the approved assumption; any other ally aura stays pending", () => {
    const excluded = result.environment.pullAuras.filter(
      (a) => a.classification === "DEFENSIVE_ALLY_EXCLUDED",
    );
    expect(excluded.map((a) => a.spellId)).toEqual([465, 465, 1246768, 41635]);
    expect(result.assumptions.find((a) => a.id === "DEFENSIVE_ALLY_AURAS_EXCLUDED_V1")?.approval).toBe(
      "OWNER_APPROVED",
    );
    expect(result.assumptions.find((a) => a.id === "UNREPRESENTABLE_ALLY_AURAS_EXCLUDED")).toBeUndefined();
    const facts = input.pullFacts?.facts;
    if (facts?.auras === null || facts === undefined) throw new Error("no pull auras");
    const withOther: EnvironmentReconstructionInput = {
      ...input,
      pullFacts: {
        actorId: 15,
        facts: { ...facts, auras: [...facts.auras, { sourceId: 2, spellId: 10060, stacks: 1 }] },
      },
    };
    const r = reconstructEnvironment(withOther);
    expect(r.environment.pullAuras.find((a) => a.spellId === 10060)?.classification).toBe(
      "UNCLASSIFIED_ALLY",
    );
    expect(r.assumptions.find((a) => a.id === "UNREPRESENTABLE_ALLY_AURAS_EXCLUDED")?.approval).toBe(
      "PENDING_OWNER_APPROVAL",
    );
  });

  it("the WCL add-boundary investigation is recorded as AUTHORITY_NOT_FOUND and creates no interval", () => {
    for (const candidate of result.environment.targetSchedule.candidates) {
      expect(candidate.availabilityEvidence.find((a) => a.source === "WCL_INVESTIGATION")).toMatchObject({
        status: "AUTHORITY_NOT_FOUND",
        detail: expect.stringContaining("WCL_TARGET_AVAILABILITY_AUTHORITY_NOT_FOUND"),
      });
      expect(candidate.availability.state).toBe("UNKNOWN");
    }
    const other = reconstructEnvironment({
      ...input,
      subject: { ...input.subject, fightRef: "OTHERREPORT#48" },
    });
    expect(
      other.environment.targetSchedule.candidates
        .flatMap((c) => c.availabilityEvidence)
        .some((a) => a.source === "WCL_INVESTIGATION"),
    ).toBe(false);
  });

  it("Bloodlust: the approved whole-second approximation is recorded in provenance with both values", () => {
    expect(result.provenance.engineApproximations).toEqual([
      expect.objectContaining({
        id: "BLOODLUST_WHOLE_SECOND_START_V1",
        observed: "spell 32182 start 471 ms",
        engine: "Bloodlust (2825) start 1000 ms",
      }),
    ]);
    expect(result.assumptions.find((a) => a.id === "BLOODLUST_WHOLE_SECOND_START_V1")?.approval).toBe(
      "OWNER_APPROVED",
    );
  });

  it("weapon oil: whole-fight only with COMPLETE subject casts and no replacement; never for an unknown enchant", () => {
    const casts = input.fight.completeness.categories.CASTS;
    if (casts.capability !== "OBSERVABLE") throw new Error("casts");
    const partialCasts = reconstructEnvironment({
      ...input,
      fight: {
        ...input.fight,
        completeness: {
          ...input.fight.completeness,
          categories: {
            ...input.fight.completeness.categories,
            CASTS: {
              ...casts,
              coverage: {
                ...casts.coverage,
                state: "PARTIAL",
                coveredRanges: [
                  {
                    ...casts.coverage.coveredRanges[0]!,
                    toReportTimeMs: input.fight.fight.startTimeMs + 1000,
                  },
                ],
              },
            },
          },
        },
      },
    });
    expect(partialCasts.environment.consumables.temporaryEnchants[0]?.persistence.state).toBe("UNKNOWN");
    const template = input.fight.events.find(
      (e) => e.kind === "CAST" && e.source?.actorId === 15,
    ) as CombatEvent;
    const reapply = {
      ...template,
      abilityGameId: 1237006,
      reportTimeMs: input.fight.fight.startTimeMs + 60_000,
    } as CombatEvent;
    const replaced = reconstructEnvironment(withEvents(input, () => true, [reapply]));
    const persistence = replaced.environment.consumables.temporaryEnchants[0]?.persistence;
    expect(persistence?.state === "UNKNOWN" && persistence.reason).toContain(
      "applied temporary-enchant spell",
    );
    const unknownEnchant = reconstructEnvironment({
      ...input,
      temporaryEnchants: {
        actorId: 15,
        slots: [{ slot: "main_hand", evidence: { state: "UNKNOWN", reason: "t", source: null } }],
      },
    });
    expect(unknownEnchant.environment.consumables.temporaryEnchants[0]?.persistence.state).toBe("UNKNOWN");
  });

  it("food / rune: USER_PROVIDED fills an UNKNOWN only with a pinned, representable token, keeps provenance, never overrides observation", () => {
    const provenance = {
      source: "USER_PROVIDED" as const,
      reference: "test-statement-1",
      providedAt: "2026-10-22T00:00:00Z",
    };
    const stated = reconstructEnvironment({
      ...input,
      userProvided: {
        food: { token: "NONE", provenance },
        augmentation: { token: "void_touched", provenance },
      },
    });
    const rune = stated.environment.consumables.setup.find((s) => s.kind === "AUGMENTATION");
    expect(rune?.identity).toMatchObject({ state: "USER_PROVIDED", value: { spellId: 1264426 }, provenance });
    expect(rune?.rankOptions).toEqual([{ itemLevel: 90, token: "void_touched", representable: true }]);
    const food = stated.environment.consumables.setup.find((s) => s.kind === "FOOD");
    expect(food?.identity).toMatchObject({ state: "USER_PROVIDED", value: USER_STATED_NONE });
    expect(stated.diagnostics.filter((d) => d.code === "USER_PROVIDED_RECORDED")).toHaveLength(2);
    // The unidentified pull auras still block: a statement does not identify them.
    expect(stated.blockers.map((b) => b.code)).toContain("SETUP_AURA_UNCLASSIFIED");
    // An unpinned or ambiguous token is refused, and the field stays UNKNOWN.
    const invalid = reconstructEnvironment({
      ...input,
      userProvided: { food: { token: "best_food", provenance } },
    });
    expect(invalid.environment.consumables.setup.find((s) => s.kind === "FOOD")?.identity.state).toBe(
      "UNKNOWN",
    );
    expect(invalid.blockers.map((b) => b.code)).toContain("USER_PROVIDED_INVALID");
    // A pinned food the approved engine cannot build is not representable: the statement does not help.
    const unbuildable = reconstructEnvironment({
      ...input,
      userProvided: { food: { token: "hearty_harandar_celebration", provenance } },
    });
    expect(unbuildable.environment.consumables.setup.find((s) => s.kind === "FOOD")?.identity.state).toBe(
      "UNKNOWN",
    );
    expect(unbuildable.blockers.find((b) => b.code === "USER_PROVIDED_INVALID")?.detail).toContain(
      "the approved engine cannot build its effect",
    );
    // A statement that contradicts an observed pinned consumable never overrides it.
    const facts = input.pullFacts?.facts;
    if (facts?.auras === null || facts === undefined) throw new Error("no pull auras");
    const observedRune = reconstructEnvironment({
      ...input,
      pullFacts: {
        actorId: 15,
        facts: { ...facts, auras: [...facts.auras, { sourceId: 15, spellId: 1264426, stacks: 1 }] },
      },
      userProvided: { augmentation: { token: "NONE", provenance } },
    });
    expect(
      observedRune.environment.consumables.setup.find((s) => s.kind === "AUGMENTATION")?.identity,
    ).toMatchObject({
      state: "KNOWN",
      value: { spellId: 1264426 },
    });
    expect(observedRune.blockers.map((b) => b.code)).toContain("USER_PROVIDED_CONFLICT");
  });

  it("refuses evidence of another actor", () => {
    const r = reconstructEnvironment({
      ...input,
      pullFacts: input.pullFacts === null ? null : { ...input.pullFacts, actorId: 16 },
    });
    expect(codes(r)).toContain("EVIDENCE_ACTOR_MISMATCH");
    expect(buff(r, "battle_shout")?.presence.state).toBe("UNKNOWN");
  });

  it("subject readiness: NOT_REPRESENTABLE, with each check's state", () => {
    expect(Object.fromEntries(result.checks.map((c) => [c.component, c.state]))).toEqual({
      duration: "RESOLVED",
      primaryTarget: "RESOLVED",
      raidBuffs: "UNRESOLVED",
      bloodlust: "RESOLVED",
      consumables: "UNRESOLVED",
      tankLoad: "RESOLVED",
      targetSchedule: "NOT_REPRESENTABLE",
      pullAuras: "UNRESOLVED",
    });
  });
});
