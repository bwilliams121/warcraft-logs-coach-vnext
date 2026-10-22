/**
 * M11-G3-4: environment evidence on the APPROVED exact-pin engine.
 *
 * Descriptive and verifying only — no number here is a ceiling, a loss or a
 * player's performance, and none is published.
 *
 *   1. MATERIALITY (development Blood character, ELITE_REALISTIC_V1): from a
 *      baseline carrying the subject's PROVEN environment (six whole-fight raid
 *      buffs, Heroism at the observed 471 ms, flask rank 2 and the observed
 *      oil; no food, rune or potion), change ONE unresolved field at a time
 *      under STANDARD_SIM_V1; then, single-threaded (bit-reproducible), toggle
 *      each raid-buff override to classify it inert or active. The results
 *      must equal BLOOD_ENVIRONMENT_FACTS (single-thread exactly; STANDARD to
 *      1e-9, its thread merge order is not fixed).
 *   2. STAT RECONCILIATION REVISIT: the subject's gear (the development
 *      character's gear IS the subject's) with race `none` (raw-input edit, a
 *      measurement only — race stays unresolved), the proven pull environment
 *      and each flask rank: engine buffed stats at combat start. With
 *      WRITE_GOLDEN=1 the projection is re-cut into
 *      tests/fixtures/environment/simc-33622e9d-subject-stat-revisit.json;
 *      otherwise it must equal the committed fixture.
 *   3. DIAGNOSTIC ROUND TRIP: the subject's reconstructed environment,
 *      translated BOSS_ONLY_DIAGNOSTIC, on the development character — EVERY
 *      rank-envelope variant (flask × potion ranks; the potion at the elite
 *      APL's timing) — through the full parser (duration, override, Bloodlust
 *      and consumable echoes), plus the report's own evidence: one target, the
 *      constant raid buffs exactly the translated set, exactly one Bloodlust
 *      per iteration, the standardized tank-heal raid event only, a fixed
 *      simulation length, and pairwise-distinct variant results. No DPS is
 *      recorded.
 *   4. RANK TOKENS (single thread): each rank token selects a distinct item
 *      level, a same-level "Fleeting" token is bit-identical (so the extractor's
 *      candidate sets are equivalent), and the user-providable rune and feast
 *      tokens are accepted and active.
 *
 * Output: .probe/m11g3/g34/report.json. Docker `--network none`.
 *
 *     SIMC_IMAGE=sha256:<id> npx vitest run --config scripts/bench/vitest.config.ts scripts/bench/m11g34-environment.bench.ts
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { APPROVED_ENGINE_ARTIFACTS } from "../../runner/approved-artifacts.js";
import { DockerLauncher } from "../../runner/engine-launcher.js";
import { DEFAULT_RUNNER_LIMITS } from "../../runner/limits.js";
import { RUNNER_SPEC_BINDINGS } from "../../runner/spec-bindings.js";
import { assessEnvironmentPublishability } from "../../src/environment/publishability.js";
import { reconstructEnvironment } from "../../src/environment/reconstruct.js";
import { translateEnvironment } from "../../src/environment/translate.js";
import { prepareSimulation } from "../../src/simulation/prepare.js";
import { parseSimcJson } from "../../src/simulation/result-parser.js";
import { RAID_BUFFS } from "../../src/simulation/job.js";
import { BLOOD_ENVIRONMENT_FACTS } from "../../src/specs/deathknight/blood/environment-facts.js";
import { subjectEnvironmentInput } from "../../tests/support/environment/subject-environment.js";
import { devBloodJob, jsonBytes } from "../../tests/support/simulation/dev-blood-job.js";

declare const process: any;

const IMAGE: string | undefined = process.env["SIMC_IMAGE"];
const OUT = join(".probe", "m11g3", "g34");
const STAT_FIXTURE = join("tests", "fixtures", "environment", "simc-33622e9d-subject-stat-revisit.json");
const PROVEN_BUFFS = [
  "arcane_intellect",
  "battle_shout",
  "blessing_of_the_bronze",
  "mark_of_the_wild",
  "power_word_fortitude",
  "skyfury",
] as const;
/** The engine's buff names for the player-side overrides (constant buffs in the report). */
const CONSTANT_BUFF_NAME: Record<string, string> = {
  arcane_intellect: "arcane_intellect",
  battle_shout: "battle_shout",
  blessing_of_the_bronze: "blessing_of_the_bronze",
  mark_of_the_wild: "mark_of_the_wild",
  power_word_fortitude: "power_word_fortitude",
  skyfury: "skyfury",
};

type Json = Record<string, any>;

describe.skipIf(IMAGE === undefined)("M11-G3-4 environment on the exact pin", () => {
  it(
    "measures materiality, revisits stats, round-trips the diagnostic environment",
    { timeout: 3_600_000 },
    async () => {
      mkdirSync(OUT, { recursive: true });
      const artifact = APPROVED_ENGINE_ARTIFACTS[0];
      if (artifact === undefined) throw new Error("no approved artifact");
      const launcher = new DockerLauncher(
        {
          imageRef: IMAGE ?? "",
          dockerExecutable: process.env["DOCKER_EXE"] ?? "docker",
          cpus: 8,
          cliEnv: process.env,
        },
        { ...DEFAULT_RUNNER_LIMITS, maxWallClockMs: 120_000 },
      );
      expect(await launcher.resolveBinarySha256()).toBe(artifact.binarySha256);
      const report: Json = { binarySha256: artifact.binarySha256 };
      const save = () => writeFileSync(join(OUT, "report.json"), JSON.stringify(report, null, 1), "utf8");

      const raw = async (input: string): Promise<{ json: Json; text: string; bytes: number }> => {
        const launched = await launcher.launch({ input, timeoutMs: 120_000 });
        if (launched.kind !== "COMPLETED")
          throw new Error(`${launched.kind} ${"detail" in launched ? launched.detail : ""}`);
        return { json: JSON.parse(launched.json) as Json, text: launched.json, bytes: launched.jsonBytes };
      };
      const dpsOf = (json: Json): number => json["sim"].players[0].collected_data.dps.mean as number;

      // ---- 1. materiality ----
      const baselineInput = async (policyId: string) => {
        const job = devBloodJob(policyId, "ELITE_REALISTIC_V1") as Json;
        job["environment"].raidBuffs = { provenance: "DEVELOPMENT_FIXTURE", active: [...PROVEN_BUFFS] };
        job["environment"].bloodlust = { kind: "AT", provenance: "DEVELOPMENT_FIXTURE", atMs: 471 };
        Object.assign(job["character"].consumables, {
          potion: "NONE",
          flask: "flask_of_thalassian_resistance_2",
          food: "NONE",
          augmentation: "NONE",
          temporaryEnchants: [{ slot: "main_hand", enchant: "thalassian_phoenix_oil_2" }],
        });
        const prepared = await prepareSimulation(job, jsonBytes(job), artifact, RUNNER_SPEC_BINDINGS);
        if (!prepared.ok) throw new Error(`${prepared.failure.code} ${prepared.failure.detail}`);
        return prepared.value.input;
      };
      const edit = (input: string, from: string, to: string): string => {
        if (!input.includes(from)) throw new Error(`anchor missing: ${from}`);
        return input.replace(from, to);
      };
      const standard = await baselineInput("STANDARD_SIM_V1");
      const baseline = dpsOf((await raw(standard)).json);
      const variant = async (from: string, to: string): Promise<number> =>
        dpsOf((await raw(edit(standard, from, to))).json);
      const potion2 = await variant("potion=disabled", "potion=potion_of_recklessness_2");
      const potion1 = await variant("potion=disabled", "potion=potion_of_recklessness_1");
      const measured: Json = {
        FLASK_RANK:
          (await variant(
            "flask=flask_of_thalassian_resistance_2",
            "flask=flask_of_thalassian_resistance_1",
          )) /
            baseline -
          1,
        FLASK_PRESENCE:
          (await variant("flask=flask_of_thalassian_resistance_2", "flask=disabled")) / baseline - 1,
        FOOD_PRESENCE: (await variant("food=disabled", "food=silvermoon_parade")) / baseline - 1,
        AUGMENTATION_PRESENCE:
          (await variant("augmentation=disabled", "augmentation=void_touched")) / baseline - 1,
        POTION_PRESENCE: potion2 / baseline - 1,
        POTION_RANK: potion1 / potion2 - 1,
        BLOODLUST_WHOLE_SECOND: (await variant("bloodlust_time=0.471", "bloodlust_time=0")) / baseline - 1,
        BLOODLUST_PRESENCE:
          (await variant(
            "override.bloodlust=1\nbloodlust_percent=0\nbloodlust_time=0.471",
            "override.bloodlust=0",
          )) /
            baseline -
          1,
      };
      for (const buff of ["chaos_brand", "mystic_touch", "hunters_mark", "mortal_wounds", "bleeding"]) {
        measured[`RAID_BUFF:${buff}`] =
          (await variant(`override.${buff}=0`, `override.${buff}=1`)) / baseline - 1;
      }
      report.materiality = {
        baseline: "development character + proven subject environment (no DPS recorded)",
        measured,
      };
      save();

      const single = await baselineInput("BENCHMARK_300_T1");
      const single0 = dpsOf((await raw(single)).json);
      const identical: Json = {};
      for (const buff of RAID_BUFFS) {
        const proven = (PROVEN_BUFFS as readonly string[]).includes(buff);
        const toggled = dpsOf(
          (
            await raw(
              edit(single, `override.${buff}=${proven ? 1 : 0}`, `override.${buff}=${proven ? 0 : 1}`),
            )
          ).json,
        );
        identical[buff] = { identical: toggled === single0, relative: toggled / single0 - 1 };
        if (proven) measured[`RAID_BUFF:${buff}`] = toggled / single0 - 1;
      }
      report.singleThread = identical;
      save();

      // Compared at the end, so one run reports every disagreement.
      const factMismatches: string[] = [];
      for (const fact of BLOOD_ENVIRONMENT_FACTS.measurements) {
        const buff = fact.field.startsWith("RAID_BUFF:") ? fact.field.slice("RAID_BUFF:".length) : null;
        const expectedIdentical = buff === null ? false : (identical[buff].identical as boolean);
        // STANDARD_SIM_V1 merges threads in a non-fixed order (last-bit drift); single-thread runs are exact.
        const tolerance = fact.simulationPolicy === "BENCHMARK_300_T1" ? 0 : 1e-9;
        if (
          Math.abs((measured[fact.field] as number) - fact.relativeChange) > tolerance ||
          fact.identicalResult !== expectedIdentical
        ) {
          factMismatches.push(
            `${fact.field}: measured ${String(measured[fact.field])} identical ${String(expectedIdentical)}`,
          );
        }
      }
      report.factMismatches = factMismatches;
      save();

      // ---- 2. stat reconciliation revisit ----
      const statsOf = (json: Json) => {
        const b = json["sim"].players[0].collected_data.buffed_stats;
        return {
          strength: b.attribute.strength,
          stamina: b.attribute.stamina,
          critRating: b.stats.crit_rating,
          hasteRating: b.stats.haste_rating,
          masteryRating: b.stats.mastery_rating,
          versatilityRating: b.stats.versatility_rating,
          armor: b.stats.armor,
        };
      };
      const raceNone = single
        .replace(/\nrace=[a-z_]+\n/, "\nrace=none\n")
        .replace(
          /\noverride\.bloodlust=1\nbloodlust_percent=0\nbloodlust_time=0\.471\n/,
          "\noverride.bloodlust=0\n",
        );
      const stats = {
        source: `approved engine ${artifact.binarySha256}`,
        basis:
          "development (= subject) gear and talents, race none (measurement only), the proven pull environment: six whole-fight raid buffs, flask, main-hand oil; no lust, potion, food or rune; buffed_stats at combat start",
        flaskRank2: statsOf((await raw(raceNone)).json),
        flaskRank1: statsOf(
          (
            await raw(
              edit(
                raceNone,
                "flask=flask_of_thalassian_resistance_2",
                "flask=flask_of_thalassian_resistance_1",
              ),
            )
          ).json,
        ),
      };
      report.statRevisit = stats;
      save();
      if (process.env["WRITE_GOLDEN"] === "1") {
        mkdirSync(join("tests", "fixtures", "environment"), { recursive: true });
        writeFileSync(STAT_FIXTURE, `${JSON.stringify(stats, null, 1)}\n`, "utf8");
      }
      const statFixtureMatches =
        JSON.stringify(JSON.parse(readFileSync(STAT_FIXTURE, "utf8"))) === JSON.stringify(stats);

      // ---- 3. diagnostic round trip: EVERY rank-envelope variant ----
      const reconstruction = reconstructEnvironment(await subjectEnvironmentInput());
      const publishability = assessEnvironmentPublishability(reconstruction, BLOOD_ENVIRONMENT_FACTS);
      expect(publishability.status).toBe("BLOCKED");
      const translated = translateEnvironment(reconstruction, publishability, "BOSS_ONLY_DIAGNOSTIC");
      if (!translated.ok) throw new Error(translated.problems.join("; "));
      const translatedActive = translated.translation.environment.raidBuffs.active;
      const echoes: Json[] = [];
      const variantDps: number[] = [];
      for (const variant of translated.translation.consumableVariants) {
        const job = devBloodJob("STANDARD_SIM_V1", "ELITE_REALISTIC_V1") as Json;
        job["environment"] = translated.translation.environment;
        job["character"].consumables = variant.consumables;
        const prepared = await prepareSimulation(job, jsonBytes(job), artifact, RUNNER_SPEC_BINDINGS);
        if (!prepared.ok) throw new Error(`${prepared.failure.code} ${prepared.failure.detail}`);
        const run = await raw(prepared.value.input);
        const parsed = parseSimcJson(run.text, run.bytes, {
          job: prepared.value.job,
          binding: prepared.value.binding,
          profile: prepared.value.profile,
          policy: prepared.value.policy,
          approved: artifact,
          executedBinarySha256: artifact.binarySha256,
          profileHash: prepared.value.keys.profileHash,
          environmentHash: prepared.value.keys.environmentHash,
          executionProfileRevision: prepared.value.keys.executionProfileRevision,
        });
        if (!parsed.ok) throw new Error(`${variant.id}: ${parsed.failure.code} ${parsed.failure.detail}`);
        // Kept in memory only to show the variants differ; never written or reported.
        variantDps.push(dpsOf(run.json));
        const sim = run.json["sim"];
        const player = sim.players[0];
        const constant = new Set((player.buffs_constant as Json[]).map((buff) => buff["name"] as string));
        const lust = (player.buffs as Json[]).filter((buff) => buff["name"] === "bloodlust");
        echoes.push({
          variant: variant.id,
          targets: (sim.targets as Json[]).length,
          raidEvents: (sim.raid_events as Json[]).map((event) => event["name"] as string),
          simulationLength: {
            min: sim.statistics.simulation_length.min,
            max: sim.statistics.simulation_length.max,
          },
          constantRaidBuffs: Object.values(CONSTANT_BUFF_NAME)
            .filter((name) => constant.has(name))
            .sort(),
          bloodlust: lust.map((buff) => ({ spell: buff["spell"], startCount: buff["start_count"] })),
          bloodlustTime: sim.overrides?.bloodlust_time ?? null,
          consumables: {
            potion: player.potion,
            flask: player.flask,
            food: player.food,
            augmentation: player.augmentation,
            temporaryEnchant: player.temporary_enchant,
          },
          expected: variant.consumables,
          options: {
            maxTime: sim.options.max_time,
            fixedTime: sim.options.fixed_time,
            varyCombatLength: sim.options.vary_combat_length,
            optimalRaid: sim.options.optimal_raid,
            desiredTargets: sim.options.desired_targets,
          },
        });
      }
      report.roundTrip = {
        purpose: translated.translation.purpose,
        variants: translated.translation.consumableVariants.map((variant) => variant.id),
        ledger: translated.translation.ledger,
        echoes,
        variantsDistinct: new Set(variantDps).size === variantDps.length,
      };
      save();

      // ---- 4. rank tokens at the pin (single thread, bit-reproducible) ----
      const tokenRun = async (from: string, to: string) => dpsOf((await raw(edit(single, from, to))).json);
      const flask2 = single0;
      const tokens = {
        flaskRank1Differs:
          (await tokenRun(
            "flask=flask_of_thalassian_resistance_2",
            "flask=flask_of_thalassian_resistance_1",
          )) !== flask2,
        flaskFleetingRank2Identical:
          (await tokenRun(
            "flask=flask_of_thalassian_resistance_2",
            "flask=fleeting_flask_of_thalassian_resistance_2",
          )) === flask2,
        potionRank1VsRank2Differ:
          (await tokenRun("potion=disabled", "potion=potion_of_recklessness_1")) !==
          (await tokenRun("potion=disabled", "potion=potion_of_recklessness_2")),
        potionFleetingRank2Identical:
          (await tokenRun("potion=disabled", "potion=fleeting_potion_of_recklessness_2")) ===
          (await tokenRun("potion=disabled", "potion=potion_of_recklessness_2")),
        runeTokenActive: (await tokenRun("augmentation=disabled", "augmentation=void_touched")) !== single0,
      };
      report.rankTokens = tokens;
      save();

      expect(factMismatches).toEqual([]);
      expect(statFixtureMatches).toBe(true);
      expect(Object.values(tokens).every(Boolean)).toBe(true);
      expect(translated.translation.consumableVariants).toHaveLength(4);
      expect(report.roundTrip.variantsDistinct).toBe(true);
      for (const echo of echoes) {
        expect(echo.targets).toBe(1);
        expect(echo.raidEvents).toEqual(["tank_heal"]);
        expect(echo.simulationLength).toEqual({ min: 345.177, max: 345.177 });
        expect(echo.constantRaidBuffs).toEqual(
          [...translatedActive].map((name) => CONSTANT_BUFF_NAME[name]).sort(),
        );
        expect(echo.bloodlust).toEqual([{ spell: 2825, startCount: 1 }]);
        const want = (value: string) => (value === "NONE" ? "disabled" : value);
        expect(echo.consumables).toEqual({
          potion: want(echo.expected.potion),
          flask: want(echo.expected.flask),
          food: "disabled",
          augmentation: "disabled",
          temporaryEnchant: "main_hand:thalassian_phoenix_oil_2",
        });
        expect(echo.options).toEqual({
          maxTime: 345.177,
          fixedTime: true,
          varyCombatLength: 0,
          optimalRaid: 0,
          desiredTargets: 1,
        });
      }
    },
  );
});
