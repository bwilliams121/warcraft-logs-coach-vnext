/**
 * M11-G3-4: publishability, materiality and SimC translation.
 *
 * Covers B (exact-duration directives), E/F (no UNKNOWN -> absent, no default
 * raid package), H (no default pull Lust), K/L/M (no ideal or chosen-rank
 * consumable), O (no consumable the environment did not prove), U (a
 * BOSS_ONLY_DIAGNOSTIC can never become a ceiling), V (no UPPER/add
 * environment without interval evidence) and W (the blocker gate).
 */

import { beforeAll, describe, expect, it } from "vitest";

import {
  classifyMateriality,
  ENVIRONMENT_MATERIALITY_POLICY,
  type EnvironmentSpecFacts,
} from "../../../src/environment/materiality.js";
import type {
  EnvironmentReconstructionResult,
  SimulationEnvironment,
} from "../../../src/environment/model.js";
import {
  assessEnvironmentPublishability,
  ceilingEligibility,
  type EnvironmentPublishability,
} from "../../../src/environment/publishability.js";
import {
  primaryTargetContinuous,
  UNREPRESENTABLE_ALLY_AURAS_EXCLUDED,
} from "../../../src/environment/assumptions.js";
import { reconstructEnvironment } from "../../../src/environment/reconstruct.js";
import { translateEnvironment } from "../../../src/environment/translate.js";
import { prepareSimulation } from "../../../src/simulation/prepare.js";
import { RAID_BUFFS } from "../../../src/simulation/job.js";
import { RUNNER_SPEC_BINDINGS } from "../../../runner/spec-bindings.js";
import {
  BLOOD_APL_POTION_LINES,
  BLOOD_ENVIRONMENT_FACTS,
} from "../../../src/specs/deathknight/blood/environment-facts.js";
import apl from "../../../src/simc/data/deathknight-blood.apl.json";
import { subjectEnvironmentInput } from "../../support/environment/subject-environment.js";
import { devBloodJob, jsonBytes, TEST_ARTIFACT } from "../../support/simulation/dev-blood-job.js";

let subject: EnvironmentReconstructionResult;
let subjectGate: EnvironmentPublishability;

beforeAll(async () => {
  subject = reconstructEnvironment(await subjectEnvironmentInput());
  subjectGate = assessEnvironmentPublishability(subject, BLOOD_ENVIRONMENT_FACTS);
}, 120_000);

const NONE_BASIS = { kind: "WCL_EVENTS" as const, field: "synthetic test evidence" };

/** The subject with every unresolved component replaced by an established one — a PUBLISHABLE fixture. */
function resolved(
  base: EnvironmentReconstructionResult,
  change: (env: SimulationEnvironment) => Partial<SimulationEnvironment> = () => ({}),
): EnvironmentReconstructionResult {
  const env = base.environment;
  const known: SimulationEnvironment = {
    ...env,
    primaryTarget: {
      ...env.primaryTarget,
      availability: { state: "KNOWN", value: "WHOLE_ENCOUNTER", source: NONE_BASIS },
    },
    raidBuffs: env.raidBuffs.map((entry) =>
      entry.presence.state === "UNKNOWN"
        ? { ...entry, presence: { state: "KNOWN_NONE", source: NONE_BASIS, basis: "synthetic" } }
        : entry,
    ),
    bloodlust: {
      applications: { state: "KNOWN_NONE", source: NONE_BASIS, basis: "synthetic" },
      satedObservations: [],
    },
    consumables: {
      setup: env.consumables.setup.map((entry) => ({
        ...entry,
        identity: { state: "KNOWN_NONE", source: NONE_BASIS, basis: "synthetic" },
        rank: { state: "NOT_APPLICABLE", reason: "none" },
        rankOptions: [],
        presence: { state: "NOT_APPLICABLE", reason: "none" },
        unclassifiedCandidates: [],
      })),
      potion: {
        identity: { state: "NOT_APPLICABLE", reason: "none" },
        rank: { state: "NOT_APPLICABLE", reason: "none" },
        rankOptions: [],
        timingPolicy: "ELITE_APL_TIMING",
        uses: { state: "KNOWN_NONE", source: NONE_BASIS, basis: "synthetic" },
        castsAtMs: [],
      },
      temporaryEnchants: env.consumables.temporaryEnchants.map((entry) => ({
        ...entry,
        persistence: { state: "KNOWN", value: "WHOLE_FIGHT", source: NONE_BASIS },
      })),
    },
    targetSchedule: { candidates: [], schedule: { state: "KNOWN", value: [], source: NONE_BASIS } },
    pullAuras: env.pullAuras.filter((aura) => !aura.classification.startsWith("UNCLASSIFIED")),
    assumptions: env.assumptions.filter((assumption) => assumption.approval === "OWNER_APPROVED"),
  };
  const environment = { ...known, ...change(known) };
  return {
    ...base,
    status: "READY",
    environment,
    blockers: [],
    diagnostics: [],
    assumptions: environment.assumptions,
  };
}

const blockerCodes = (gate: EnvironmentPublishability) =>
  [...new Set(gate.blockers.map((b) => b.code))].sort();

describe("M11-G3-4 publishability", () => {
  it("W: the canonical subject is BLOCKED, for exactly the audited reasons", () => {
    expect(subjectGate.status).toBe("BLOCKED");
    expect(blockerCodes(subjectGate)).toEqual([
      "ENVIRONMENT_TRANSLATION_UNSUPPORTED",
      "MATERIAL_CONSUMABLE_UNKNOWN",
      "MATERIAL_RAID_BUFF_UNKNOWN",
      "PINNED_MODEL_MISSING_OBSERVED_EFFECT",
      "SETUP_AURA_UNCLASSIFIED",
      "TARGET_SCHEDULE_UNRESOLVED",
    ]);
    const decided = Object.fromEntries(subjectGate.materiality.map((m) => [m.field, m.classification]));
    expect(decided).toEqual({
      "RAID_BUFF:chaos_brand": "PUBLISHABILITY_BLOCKING",
      "RAID_BUFF:mystic_touch": "PUBLISHABILITY_BLOCKING",
      "RAID_BUFF:hunters_mark": "PUBLISHABILITY_BLOCKING",
      "RAID_BUFF:mortal_wounds": "NON_BLOCKING",
      "RAID_BUFF:bleeding": "NON_BLOCKING",
      FOOD_PRESENCE: "PUBLISHABILITY_BLOCKING",
      AUGMENTATION_PRESENCE: "PUBLISHABILITY_BLOCKING",
      BLOODLUST_WHOLE_SECOND: "NON_BLOCKING",
    });
    // Every remaining assumption is owner-approved; ranks are envelopes, not blockers.
    expect(subjectGate.blockers.filter((b) => b.code === "ASSUMPTION_NOT_OWNER_APPROVED")).toEqual([]);
    expect(
      subjectGate.diagnostics.filter((d) => d.code === "RANK_ENVELOPE").map((d) => d.detail.split(" ")[0]),
    ).toEqual(["FLASK", "POTION"]);
    expect(
      subjectGate.blockers
        .filter((b) => b.code === "PINNED_MODEL_MISSING_OBSERVED_EFFECT")
        .map((b) => /pull aura (\d+)/.exec(b.detail)?.[1]),
    ).toEqual(["1296934", "1303184", "1285644"]);
    expect(subjectGate.disclosures).toEqual([
      "Standardized incoming tank damage used for offensive Blood DK simulation; does not reconstruct encounter-specific incoming damage.",
    ]);
  });

  it("W: a fully established environment is PUBLISHABLE and translates; each condition alone blocks", () => {
    const base = resolved(subject);
    const gate = assessEnvironmentPublishability(base, BLOOD_ENVIRONMENT_FACTS);
    expect(gate.blockers).toEqual([]);
    expect(gate.status).toBe("PUBLISHABLE");
    const translated = translateEnvironment(base, gate, "CURRENT_SETUP");
    expect(translated.ok).toBe(true);

    const flip = (change: (env: SimulationEnvironment) => Partial<SimulationEnvironment>) =>
      assessEnvironmentPublishability(resolved(subject, change), BLOOD_ENVIRONMENT_FACTS);
    const chaos = flip((env) => ({
      raidBuffs: env.raidBuffs.map((entry) =>
        entry.override === "chaos_brand"
          ? { ...entry, presence: { state: "UNKNOWN", reason: "t", source: null } }
          : entry,
      ),
    }));
    expect(blockerCodes(chaos)).toEqual([
      "ENVIRONMENT_TRANSLATION_UNSUPPORTED",
      "MATERIAL_RAID_BUFF_UNKNOWN",
    ]);
    const schedule = flip(() => ({ targetSchedule: subject.environment.targetSchedule }));
    expect(blockerCodes(schedule)).toEqual(["ENVIRONMENT_TRANSLATION_UNSUPPORTED"]);
    const pending = flip((env) => ({
      assumptions: [...env.assumptions, UNREPRESENTABLE_ALLY_AURAS_EXCLUDED],
    }));
    expect(blockerCodes({ ...pending, blockers: pending.blockers })).toEqual([
      "ASSUMPTION_NOT_OWNER_APPROVED",
    ]);
    const pendingResult = resolved(subject, (env) => ({
      assumptions: [...env.assumptions, primaryTargetContinuous("OTHERREPORT#1", 3455)],
    }));
    expect(
      blockerCodes(
        assessEnvironmentPublishability(
          { ...pendingResult, assumptions: pendingResult.environment.assumptions },
          BLOOD_ENVIRONMENT_FACTS,
        ),
      ),
    ).toEqual(["ASSUMPTION_NOT_OWNER_APPROVED"]);
  });

  it("an inert UNKNOWN debuff does not block, and is written 0 only as INERT_AT_PIN", () => {
    const result = resolved(subject, (env) => ({
      raidBuffs: env.raidBuffs.map((entry) =>
        entry.override === "mortal_wounds"
          ? { ...entry, presence: { state: "UNKNOWN", reason: "t", source: null } }
          : entry,
      ),
    }));
    const gate = assessEnvironmentPublishability(result, BLOOD_ENVIRONMENT_FACTS);
    expect(gate.status).toBe("PUBLISHABLE");
    const translated = translateEnvironment(result, gate, "CURRENT_SETUP");
    if (!translated.ok) throw new Error(translated.problems.join("; "));
    expect(
      translated.translation.ledger.find((e) => e.component === "raidBuffs.mortal_wounds"),
    ).toMatchObject({ written: "0", basis: "INERT_AT_PIN" });
  });

  it("the materiality policy fails closed: no measurement, or one example below threshold, blocks", () => {
    const empty: EnvironmentSpecFacts = { ...BLOOD_ENVIRONMENT_FACTS, measurements: [] };
    expect(classifyMateriality("FLASK_RANK", empty).classification).toBe("PUBLISHABILITY_BLOCKING");
    const example: EnvironmentSpecFacts = {
      ...BLOOD_ENVIRONMENT_FACTS,
      measurements: [
        {
          field: "FOOD_PRESENCE",
          comparison: "x",
          relativeChange: 0.001,
          identicalResult: false,
          coverage: "EXAMPLE_ONLY",
          simulationPolicy: "S",
        },
      ],
    };
    expect(classifyMateriality("FOOD_PRESENCE", example).classification).toBe("PUBLISHABILITY_BLOCKING");
    const bounded: EnvironmentSpecFacts = {
      ...BLOOD_ENVIRONMENT_FACTS,
      measurements: [
        {
          field: "FLASK_RANK",
          comparison: "x",
          relativeChange: 0.004999,
          identicalResult: false,
          coverage: "BOUNDS_ALL_PLAUSIBLE",
          simulationPolicy: "S",
        },
      ],
    };
    expect(classifyMateriality("FLASK_RANK", bounded).classification).toBe("NON_BLOCKING");
    expect(
      classifyMateriality("FLASK_RANK", {
        ...bounded,
        measurements: [{ ...bounded.measurements[0]!, relativeChange: -0.005 }],
      }).classification,
    ).toBe("PUBLISHABILITY_BLOCKING");
    expect(ENVIRONMENT_MATERIALITY_POLICY.relativeDpsThreshold).toBe(0.005);
  });

  it("M: an unresolved rank is never chosen — the complete plausible set becomes an envelope of variants", () => {
    const actual = subject.environment.consumables;
    const flask = actual.setup.find((s) => s.kind === "FLASK")!;
    const result = resolved(subject, (env) => ({
      consumables: {
        ...env.consumables,
        setup: env.consumables.setup.map((entry) => (entry.kind === "FLASK" ? flask : entry)),
        potion: actual.potion,
      },
    }));
    const gate = assessEnvironmentPublishability(result, BLOOD_ENVIRONMENT_FACTS);
    expect(gate.blockers).toEqual([]);
    expect(gate.status).toBe("PUBLISHABLE");
    const translated = translateEnvironment(result, gate, "CURRENT_SETUP");
    if (!translated.ok) throw new Error(translated.problems.join("; "));
    const variants = translated.translation.consumableVariants;
    expect(variants.map((v) => [v.consumables.flask, v.consumables.potion])).toEqual([
      ["flask_of_thalassian_resistance_1", "potion_of_recklessness_1"],
      ["flask_of_thalassian_resistance_1", "potion_of_recklessness_2"],
      ["flask_of_thalassian_resistance_2", "potion_of_recklessness_1"],
      ["flask_of_thalassian_resistance_2", "potion_of_recklessness_2"],
    ]);
    for (const variant of variants) expect(variant.ranks.map((r) => r.slot)).toEqual(["flask", "potion"]);
    // An unrepresentable plausible rank is never dropped from the set: the translation refuses.
    const broken = resolved(subject, (env) => ({
      consumables: {
        ...env.consumables,
        setup: env.consumables.setup.map((entry) =>
          entry.kind === "FLASK"
            ? {
                ...flask,
                rankOptions: flask.rankOptions.map((o, i) => (i === 0 ? { ...o, representable: false } : o)),
              }
            : entry,
        ),
      },
    }));
    const brokenGate = assessEnvironmentPublishability(broken, BLOOD_ENVIRONMENT_FACTS);
    expect(translateEnvironment(broken, brokenGate, "CURRENT_SETUP").ok).toBe(false);
  });

  it("I: potion = actual availability + elite APL timing; observed timestamps are never replayed", () => {
    const actual = subject.environment.consumables;
    const result = resolved(subject, (env) => ({
      consumables: { ...env.consumables, potion: actual.potion },
    }));
    const gate = assessEnvironmentPublishability(result, BLOOD_ENVIRONMENT_FACTS);
    const translated = translateEnvironment(result, gate, "CURRENT_SETUP");
    if (!translated.ok) throw new Error(translated.problems.join("; "));
    expect(translated.translation.consumableVariants.map((v) => v.consumables.potion)).toEqual([
      "potion_of_recklessness_1",
      "potion_of_recklessness_2",
    ]);
    expect(translated.translation.ledger.find((e) => e.component === "consumables.potion")).toMatchObject({
      basis: "ACTUAL_SETUP_APL_TIMING",
    });
    // The job has no field that could carry a potion time; the observed uses stay evidence.
    expect(JSON.stringify(translated.translation)).not.toMatch(/1921|303773|31951|333776/);
    expect(actual.potion.uses.state).toBe("KNOWN");
    expect(actual.potion.timingPolicy).toBe("ELITE_APL_TIMING");
  });
});

describe("M11-G3-4 translation", () => {
  it("U: CURRENT_SETUP is refused while BLOCKED; the diagnostic is labelled and never ceiling-eligible", () => {
    const refused = translateEnvironment(subject, subjectGate, "CURRENT_SETUP");
    expect(refused.ok).toBe(false);
    const diagnostic = translateEnvironment(subject, subjectGate, "BOSS_ONLY_DIAGNOSTIC");
    if (!diagnostic.ok) throw new Error(diagnostic.problems.join("; "));
    const t = diagnostic.translation;
    expect(t.purpose).toBe("BOSS_ONLY_DIAGNOSTIC");
    expect([
      t.environment.raidBuffs.provenance,
      t.environment.bloodlust.provenance,
      ...t.consumableVariants.map((v) => v.consumables.provenance),
    ]).toEqual(Array(2 + t.consumableVariants.length).fill("DIAGNOSTIC_RECONSTRUCTION"));
    const job = {
      ...devBloodJob(),
      environment: t.environment,
      character: { ...devBloodJob().character, consumables: t.consumableVariants[0]!.consumables },
    };
    expect(ceilingEligibility(job as never)).toMatchObject({ eligible: false });
    expect(ceilingEligibility(job as never).reasons).toContain(
      "raidBuffs provenance DIAGNOSTIC_RECONSTRUCTION",
    );
  });

  it("U: the gate itself refuses CURRENT_SETUP for a translatable environment that is BLOCKED", () => {
    const pending = resolved(subject, (env) => ({
      assumptions: [...env.assumptions, UNREPRESENTABLE_ALLY_AURAS_EXCLUDED],
    }));
    const blocked = { ...pending, assumptions: pending.environment.assumptions };
    const gate = assessEnvironmentPublishability(blocked, BLOOD_ENVIRONMENT_FACTS);
    expect(gate.status).toBe("BLOCKED");
    expect(blockerCodes(gate)).toEqual(["ASSUMPTION_NOT_OWNER_APPROVED"]);
    const refused = translateEnvironment(blocked, gate, "CURRENT_SETUP");
    expect(refused).toEqual({
      ok: false,
      problems: [expect.stringContaining("environment is BLOCKED: ASSUMPTION_NOT_OWNER_APPROVED")],
    });
  });

  it("U: the job schema refuses a diagnostic environment mixed into an observed one", async () => {
    const diagnostic = translateEnvironment(subject, subjectGate, "BOSS_ONLY_DIAGNOSTIC");
    if (!diagnostic.ok) throw new Error("diagnostic");
    const job = devBloodJob() as Record<string, any>;
    job["environment"] = diagnostic.translation.environment;
    job["character"].consumables = {
      ...diagnostic.translation.consumableVariants[0]!.consumables,
      provenance: "ACTUAL_OBSERVED",
    };
    const prepared = await prepareSimulation(job, jsonBytes(job), TEST_ARTIFACT, RUNNER_SPEC_BINDINGS);
    expect(prepared.ok).toBe(false);
    expect(!prepared.ok && prepared.failure.detail).toContain("DIAGNOSTIC_RECONSTRUCTION must label");
  });

  it("E/F/K/L/M: the diagnostic writes only proven facts and records every omission as not-a-claim-of-absence", () => {
    const diagnostic = translateEnvironment(subject, subjectGate, "BOSS_ONLY_DIAGNOSTIC");
    if (!diagnostic.ok) throw new Error("diagnostic");
    const t = diagnostic.translation;
    expect(t.environment.raidBuffs.active).toEqual([
      "arcane_intellect",
      "battle_shout",
      "blessing_of_the_bronze",
      "mark_of_the_wild",
      "power_word_fortitude",
      "skyfury",
    ]);
    expect(t.consumableVariants).toHaveLength(4);
    for (const variant of t.consumableVariants) {
      expect(variant.consumables).toMatchObject({
        food: "NONE",
        augmentation: "NONE",
        temporaryEnchants: [{ slot: "main_hand", enchant: "thalassian_phoenix_oil_2" }],
      });
      expect(variant.consumables.flask).toMatch(/^flask_of_thalassian_resistance_[12]$/);
      expect(variant.consumables.potion).toMatch(/^potion_of_recklessness_[12]$/);
    }
    const omitted = t.ledger
      .filter((entry) => entry.basis === "OMITTED_UNRESOLVED")
      .map((entry) => entry.component);
    expect(omitted).toEqual([
      "raidBuffs.chaos_brand",
      "raidBuffs.mystic_touch",
      "raidBuffs.hunters_mark",
      "consumables.food",
      "consumables.augmentation",
      "targetSchedule",
    ]);
    for (const entry of t.ledger.filter((e) => e.basis === "OMITTED_UNRESOLVED"))
      expect(entry.detail).toContain("not a claim");
    expect(t.ledger.find((e) => e.component === "raidBuffs.mortal_wounds")).toMatchObject({
      basis: "INERT_AT_PIN",
    });
  });

  it("B/F/H/O: generated engine text — exact duration, every override explicit, the observed lust only, no implicit consumable", async () => {
    const diagnostic = translateEnvironment(subject, subjectGate, "BOSS_ONLY_DIAGNOSTIC");
    if (!diagnostic.ok) throw new Error("diagnostic");
    const job = devBloodJob("STANDARD_SIM_V1", "ELITE_REALISTIC_V1") as Record<string, any>;
    job["environment"] = diagnostic.translation.environment;
    job["character"].consumables = diagnostic.translation.consumableVariants[0]!.consumables;
    const prepared = await prepareSimulation(job, jsonBytes(job), TEST_ARTIFACT, RUNNER_SPEC_BINDINGS);
    if (!prepared.ok) throw new Error(prepared.failure.detail);
    const lines = prepared.value.input.split("\n");
    // B: exact duration, no variation
    expect(lines).toEqual(
      expect.arrayContaining(["max_time=345.177", "fixed_time=1", "vary_combat_length=0"]),
    );
    expect(
      lines.filter((line) =>
        /^(max_time|fixed_time|vary_combat_length|target_health|override\.target_health)=/.test(line),
      ),
    ).toHaveLength(3);
    // F: the raid package is cleared, then every override is written explicitly
    expect(lines).toContain("optimal_raid=0");
    for (const buff of RAID_BUFFS) {
      const expected = diagnostic.translation.environment.raidBuffs.active.includes(buff) ? "1" : "0";
      expect(lines.filter((line) => line.startsWith(`override.${buff}=`))).toEqual([
        `override.${buff}=${expected}`,
      ]);
    }
    // H: the observed lust and nothing else — no percent trigger, no pull default
    expect(lines).toEqual(
      expect.arrayContaining(["override.bloodlust=1", "bloodlust_percent=0", "bloodlust_time=0.471"]),
    );
    expect(lines.filter((line) => line.startsWith("bloodlust_"))).toEqual([
      "bloodlust_percent=0",
      "bloodlust_time=0.471",
    ]);
    // O: every consumable option written (an empty one means the class default), APL timing cannot add one
    for (const option of [
      "potion=potion_of_recklessness_1",
      "flask=flask_of_thalassian_resistance_1",
      "food=disabled",
      "augmentation=disabled",
      "temporary_enchant=main_hand:thalassian_phoenix_oil_2",
    ]) {
      expect(lines).toContain(option);
    }
    expect(lines.some((line) => /^(potion|flask|food|augmentation|temporary_enchant)=$/.test(line))).toBe(
      false,
    );
  });

  it("H: an observed KNOWN_NONE lust writes override.bloodlust=0 — never a pull lust", () => {
    const result = resolved(subject);
    const gate = assessEnvironmentPublishability(result, BLOOD_ENVIRONMENT_FACTS);
    const translated = translateEnvironment(result, gate, "CURRENT_SETUP");
    if (!translated.ok) throw new Error(translated.problems.join("; "));
    expect(translated.translation.environment.bloodlust).toEqual({
      kind: "NONE",
      provenance: "ACTUAL_OBSERVED",
    });
  });

  it("O: the only consumable action in the Blood APL is the potion line, which the potion option gates", () => {
    const consumableActions = apl.lists.flatMap((list) =>
      list.actions
        .map((action) => action.actionStringVerbatim)
        .filter((text) => /^(potion|flask|food|augmentation|elixir|oil)(,|$)/.test(text)),
    );
    expect(consumableActions).toEqual([
      "potion,if=cooldown.dancing_rune_weapon.remains>78|fight_remains<=30",
    ]);
    expect(BLOOD_APL_POTION_LINES).toEqual(consumableActions);
    expect(BLOOD_ENVIRONMENT_FACTS.potionTiming.owner).toBe("BUILT_IN_APL");
  });

  it("V: no add/UPPER environment — the translation never emits an additional target, and the runner refuses one", async () => {
    const diagnostic = translateEnvironment(subject, subjectGate, "BOSS_ONLY_DIAGNOSTIC");
    if (!diagnostic.ok) throw new Error("diagnostic");
    expect(diagnostic.translation.environment.additionalTargets).toEqual([]);
    expect(diagnostic.translation.environment.primaryTarget).toBe("SINGLE_TARGET");
    const job = devBloodJob() as Record<string, any>;
    job["environment"] = {
      ...diagnostic.translation.environment,
      additionalTargets: [{ fromMs: 26_935, toMs: 289_635 }],
    };
    job["character"].consumables = diagnostic.translation.consumableVariants[0]!.consumables;
    const prepared = await prepareSimulation(job, jsonBytes(job), TEST_ARTIFACT, RUNNER_SPEC_BINDINGS);
    expect(!prepared.ok && prepared.failure.code).toBe("ENVIRONMENT_NOT_REPRESENTABLE");
  });
});
