/**
 * M11-G3-4: the semantic environment hash (Y, Z, AA), the stat-reconciliation
 * revisit (AB), the pinned raid-environment data, and the internal report
 * (no DPS, no coaching).
 */

import { readFileSync } from "node:fs";

import { beforeAll, describe, expect, it } from "vitest";

import { readCombatantPullFacts } from "../../../src/character-profile/pull-facts.js";
import {
  engineAcceptsToken,
  pinnedTokenAcceptance,
} from "../../../src/data/game/consumable-token-acceptance.js";
import {
  lustFamilyMember,
  pinnedRaidEnvironment,
  raidBuffOverrideForAura,
} from "../../../src/data/game/raid-environment.js";
import { semanticEnvironment, simulationEnvironmentHash } from "../../../src/environment/hash.js";
import type {
  EnvironmentReconstructionResult,
  SimulationEnvironment,
} from "../../../src/environment/model.js";
import { assessEnvironmentPublishability } from "../../../src/environment/publishability.js";
import { reconstructEnvironment } from "../../../src/environment/reconstruct.js";
import { renderEnvironmentReport } from "../../../src/environment/report.js";
import {
  revisitStatReconciliation,
  type EngineBuffedStats,
} from "../../../src/environment/stat-reconciliation.js";
import { BLOOD_ENVIRONMENT_FACTS } from "../../../src/specs/deathknight/blood/environment-facts.js";
import { subjectEvidence } from "../../support/character/subject.js";
import { subjectEnvironmentInput } from "../../support/environment/subject-environment.js";

let result: EnvironmentReconstructionResult;
let env: SimulationEnvironment;
let hash: string;

beforeAll(async () => {
  result = reconstructEnvironment(await subjectEnvironmentInput());
  env = result.environment;
  hash = await simulationEnvironmentHash(env);
}, 120_000);

const rehash = async (change: Partial<SimulationEnvironment>) =>
  await simulationEnvironmentHash({ ...env, ...change });

describe("M11-G3-4 environment hash", () => {
  it("Y: the same semantic environment hashes identically, twice and after an independent rebuild", async () => {
    expect(await simulationEnvironmentHash(env)).toBe(hash);
    const again = reconstructEnvironment(await subjectEnvironmentInput());
    expect(await simulationEnvironmentHash(again.environment)).toBe(hash);
    expect(hash).toBe("874c2a74c82d3675f5f2f382ba988064b40fb4690e7d7fcb925b563d2fe9b98a");
  });

  it("Z: duration, raid buffs, lust timing, consumables, tank-load version, target schedule and assumptions each move it", async () => {
    const interval = env.duration.interval;
    if (interval.state !== "KNOWN") throw new Error("interval");
    const apps = env.bloodlust.applications;
    if (apps.state !== "KNOWN") throw new Error("lust");
    const changed = [
      await rehash({
        duration: {
          ...env.duration,
          interval: { ...interval, value: { ...interval.value, durationMs: 345_176 } },
        },
      }),
      await rehash({
        raidBuffs: env.raidBuffs.map((e) =>
          e.override === "skyfury" ? { ...e, presence: { state: "UNKNOWN", reason: "x", source: null } } : e,
        ),
      }),
      await rehash({
        bloodlust: {
          ...env.bloodlust,
          applications: {
            ...apps,
            value: apps.value.map((a) => ({
              ...a,
              startMs: { state: "KNOWN", value: 472, source: { kind: "WCL_EVENTS", field: "x" } },
            })),
          },
        },
      }),
      await rehash({ consumables: { ...env.consumables, temporaryEnchants: [] } }),
      await rehash({ tankLoad: { ...env.tankLoad, version: 2 } }),
      await rehash({
        targetSchedule: { ...env.targetSchedule, candidates: env.targetSchedule.candidates.slice(1) },
      }),
      await rehash({ assumptions: env.assumptions.slice(1) }),
    ];
    for (const [index, value] of changed.entries()) expect(value, String(index)).not.toBe(hash);
    expect(new Set(changed).size).toBe(changed.length);
  });

  it("AA: report identity — fight, actor ids, sources, documents, report timestamps, observations — never moves it", async () => {
    const interval = env.duration.interval;
    if (interval.state !== "KNOWN") throw new Error("interval");
    const renamed: SimulationEnvironment = {
      ...env,
      evidence: { subject: { fightRef: "OTHERREPORT#1", actorId: 99 }, documents: [] },
      duration: {
        ...env.duration,
        interval: { ...interval, value: { ...interval.value, startReportMs: 1, endReportMs: 345_178 } },
      },
      primaryTarget: {
        ...env.primaryTarget,
        identity:
          env.primaryTarget.identity.state === "KNOWN"
            ? { ...env.primaryTarget.identity, value: { ...env.primaryTarget.identity.value, actorId: 999 } }
            : env.primaryTarget.identity,
        engagement: null,
        availabilityEvidence: [],
      },
      raidBuffs: env.raidBuffs.map((e) =>
        e.presence.state === "KNOWN" && e.presence.value.kind === "WHOLE_FIGHT"
          ? {
              ...e,
              presence: {
                ...e.presence,
                value: { ...e.presence.value, sourceActorId: 1, refreshedAtMs: [] },
              },
            }
          : e,
      ),
      targetSchedule: {
        ...env.targetSchedule,
        candidates: [...env.targetSchedule.candidates].reverse().map((c) => ({
          ...c,
          actorId: c.actorId + 1000,
          engagement: null,
          observedClusters: [],
          availabilityEvidence: [],
        })),
      },
    };
    expect(await simulationEnvironmentHash(renamed)).toBe(hash);
    expect(JSON.stringify(semanticEnvironment(env))).not.toMatch(
      /b1PmaKrd6CDfzngc|7436292|"actorId"|sourceActorId/,
    );
  });
});

describe("M11-G3-4 stat reconciliation revisit", () => {
  const fixture = JSON.parse(
    readFileSync("tests/fixtures/environment/simc-33622e9d-subject-stat-revisit.json", "utf8"),
  ) as {
    basis: string;
    flaskRank2: EngineBuffedStats;
    flaskRank1: EngineBuffedStats;
  };

  it("AB: the proven environment explains versatility (flask rank 2 only) and most of stamina — PARTIALLY_RECONCILED, never upgraded", async () => {
    const pull = readCombatantPullFacts((await subjectEvidence()).rawCombatantInfo);
    const revisit = revisitStatReconciliation(
      pull?.stats ?? null,
      fixture.flaskRank2,
      fixture.basis,
      result,
      false,
    );
    expect(revisit.status).toBe("PARTIALLY_RECONCILED");
    expect(Object.fromEntries(revisit.fields.map((f) => [f.field, f.residual]))).toEqual({
      strength: 52,
      stamina: 184,
      critRating: 3,
      hasteRating: 229,
      masteryRating: -231,
      versatilityRating: 0,
      armor: 0.274,
    });
    expect(revisit.semanticComparability.proven).toBe(false);
    expect(revisit.publicationBlocking).toBe(false);
    const rank1 = revisitStatReconciliation(
      pull?.stats ?? null,
      fixture.flaskRank1,
      fixture.basis,
      result,
      false,
    );
    expect(rank1.fields.find((f) => f.field === "versatilityRating")?.residual).toBe(14);
  });

  it("AB: a residual blocks only when comparability is PROVEN — the gate exists, and nothing here passes it", () => {
    const stats = {
      strength: 10,
      stamina: 10,
      critRating: 10,
      hasteRating: 10,
      masteryRating: 10,
      versatilityRating: 10,
      armor: 10,
    };
    const clean: EnvironmentReconstructionResult = {
      ...result,
      environment: {
        ...env,
        raidBuffs: [],
        consumables: { ...env.consumables, setup: [] },
        pullAuras: [],
      },
    };
    const proven = revisitStatReconciliation(
      { ...stats, agility: null, intellect: null },
      { ...stats, hasteRating: 50 },
      "synthetic",
      clean,
      true,
    );
    expect(proven.semanticComparability.proven).toBe(true);
    expect(proven.publicationBlocking).toBe(true);
    expect(
      revisitStatReconciliation(
        { ...stats, agility: null, intellect: null },
        { ...stats, hasteRating: 50 },
        "synthetic",
        clean,
        false,
      ).publicationBlocking,
    ).toBe(false);
  });
});

describe("M11-G3-4 pinned raid-environment data", () => {
  it("loads at the pin with the spell-data source hash the Blood datasets cite", () => {
    const loaded = pinnedRaidEnvironment();
    if (!loaded.ok) throw new Error(loaded.detail);
    expect(loaded.data.provenance.sources[0]?.sha256).toBe(
      "d8e3d1970520f2161de6d5a59aa5ea0e7c81eaef14c6bc980d5a208ed33b4c62",
    );
    expect(loaded.data.engineBloodlust).toEqual({ spellId: 2825, durationMs: 40_000 });
  });

  it("lust equivalence is by effect rows, not names: Heroism is equivalent; Time Warp, Primal Rage and Fury of the Aspects are not", () => {
    expect(lustFamilyMember(2825)?.equivalentToEngineBloodlust).toBe(true);
    expect(lustFamilyMember(32182)?.equivalentToEngineBloodlust).toBe(true);
    for (const id of [80353, 264667, 390386])
      expect(lustFamilyMember(id)?.equivalentToEngineBloodlust, String(id)).toBe(false);
    expect(lustFamilyMember(1)).toBeNull();
  });

  it("Blessing of the Bronze is one aura per class; the Death Knight's (effect index 0) is 381732", () => {
    expect(raidBuffOverrideForAura(381732)?.override).toBe("blessing_of_the_bronze");
    expect(raidBuffOverrideForAura(1459)?.override).toBe("arcane_intellect");
    expect(raidBuffOverrideForAura(465)).toBeNull();
  });
});

describe("M11-G3-4 engine token acceptance", () => {
  it("representability is the approved engine's verdict, not a name match", () => {
    expect(engineAcceptsToken(1235057, "flask_of_thalassian_resistance_1")).toBe(true);
    expect(engineAcceptsToken(1235057, "flask_of_thalassian_resistance_2")).toBe(true);
    expect(engineAcceptsToken(1236994, "potion_of_recklessness_1")).toBe(true);
    expect(engineAcceptsToken(1236994, "potion_of_recklessness_2")).toBe(true);
    expect(engineAcceptsToken(1264426, "void_touched")).toBe(true);
    expect(engineAcceptsToken(1278929, "hearty_harandar_celebration")).toBe(false);
    expect(engineAcceptsToken(1235057, "potion_of_recklessness_1")).toBe(false);
    const loaded = pinnedTokenAcceptance();
    if (!loaded.ok) throw new Error(loaded.detail);
    expect(loaded.data.provenance.binarySha256).toBe(
      "41347bc4203bd1b073a617cd9cd147a96c9c09a36f8c7af5c013ca7be273cb77",
    );
    expect(loaded.data.tokens.filter((t) => t.kind === "FOOD" && t.accepted)).toEqual([]);
  });
});

describe("M11-G3-4 internal report", () => {
  it("renders every required section and no DPS, ceiling or coaching", () => {
    const gate = assessEnvironmentPublishability(result, BLOOD_ENVIRONMENT_FACTS);
    const text = renderEnvironmentReport(result, gate, hash, null);
    for (const fragment of [
      "environment readiness: NOT_REPRESENTABLE",
      "publishability: BLOCKED",
      `environment hash: ${hash}`,
      "duration: 345177 ms",
      "RETROSPECTIVE_EXACT_FIGHT_END@1",
      "presence: WHOLE_ENCOUNTER [MODEL_ASSUMPTION PRIMARY_TARGET_CONTINUOUS_V1@1]",
      "spell 32182 ENGINE_BLOODLUST_EQUIVALENT, 0.471 s → 40.475 s",
      "POTION: identity spell 1236994",
      "timing ELITE_APL_TIMING; observed uses (evidence only) 1.921 s–31.951 s, 303.773 s–333.776 s",
      "envelope: 278→flask_of_thalassian_resistance_1, 295→flask_of_thalassian_resistance_2",
      "BLOODLUST_WHOLE_SECOND_START_V1: observed spell 32182 start 471 ms; engine Bloodlust (2825) start 1000 ms",
      "temporary enchant main_hand: 8052 → thalassian_phoenix_oil_2",
      "STANDARD_TANK_LOAD_V1 v1",
      "actor 179 (game id 260895): availability UNKNOWN",
      "MODEL_BUILD_LAG",
    ]) {
      expect(text).toContain(fragment);
    }
    expect(text).not.toMatch(/\bdps\b|ceiling|attainable|conservative|should have|missed|lost \d/i);
  });
});
