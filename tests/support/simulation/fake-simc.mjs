// A FAKE SimulationCraft engine for runner tests (M11-G3-1). Never a source of
// numbers: it exists to exercise the process boundary (arguments, temp
// directory, exit codes, timeouts, output caps) without the real binary.
//
// Usage (by DirectLauncher): node fake-simc.mjs <mode> <dir>/job.simc json2=<dir>/out.json
//
// It parses the builder's option text INDEPENDENTLY of the TypeScript builder
// and echoes it the way the pinned report_json.cpp does, so a passing
// end-to-end test cross-checks the builder against an engine-shaped echo.
import { readFileSync, writeFileSync } from "node:fs";

const [mode, jobPath, jsonArg, ...rest] = process.argv.slice(2);
if (rest.length > 0 || !jsonArg?.startsWith("json2=")) {
  process.stderr.write(`unexpected arguments: ${process.argv.slice(3).join(" ")}\n`);
  process.exit(64);
}
const outPath = jsonArg.slice("json2=".length);

if (mode === "exit-nonzero") {
  process.stderr.write(`Error: failed to parse ${jobPath}\n`);
  process.exit(3);
}
if (mode === "hang") {
  setInterval(() => undefined, 1000);
} else if (mode === "no-output") {
  process.exit(0);
} else if (mode === "oversize") {
  writeFileSync(outPath, " ".repeat(5 * 1024 * 1024 + 1));
  process.exit(0);
} else if (mode === "echo-args") {
  writeFileSync(
    outPath,
    JSON.stringify({ argv: process.argv.slice(2), env: Object.keys(process.env), cwd: process.cwd() }),
  );
  process.exit(0);
} else {
  const lines = readFileSync(jobPath, "utf8")
    .split("\n")
    .filter((line) => line !== "");
  const sim = {};
  const player = {};
  const gear = {};
  let section = "sim";
  for (const line of lines) {
    const at = line.indexOf("=");
    const key = line.slice(0, at);
    const value = line.slice(at + 1);
    if (key === "tank_dummy") section = "target";
    else if (key === "deathknight") section = "player";
    // Like the pinned report (report_json.cpp:387), stat-less items (here the
    // cosmetic shirt and tabard) are not echoed.
    if (section === "player" && value.startsWith(",id=")) {
      if (key !== "shirt" && key !== "tabard") gear[key] = { encoded_item: `item${value}` };
    } else if (section === "player") player[key] = value;
    else sim[key] = value;
  }
  const num = (text) => Number(text);
  const secs = (text) => Math.trunc(Number(text) * 1000) / 1000;
  const iterations = num(sim.iterations);
  const threads = num(sim.threads);
  const overrides = {};
  for (const buff of [
    "arcane_intellect",
    "battle_shout",
    "power_word_fortitude",
    "chaos_brand",
    "mystic_touch",
    "mortal_wounds",
    "bleeding",
  ]) {
    if (sim[`override.${buff}`] === "1") overrides[buff] = 1;
  }
  if (sim["override.bloodlust"] === "1") {
    overrides.bloodlust = 1;
    if (secs(sim.bloodlust_time) !== 0) overrides.bloodlust_time = secs(sim.bloodlust_time);
  }
  const duration = secs(sim.max_time);
  const meanDps = mode === "zero-dps" ? 0 : 50_000;
  const sample = (mean, sd, count) => ({
    sum: mean * count,
    count,
    mean,
    min: mean,
    max: mean,
    median: mean,
    variance: sd * sd,
    std_dev: sd,
    mean_variance: (sd * sd) / count,
    mean_std_dev: sd / Math.sqrt(count),
  });
  const report = {
    version: "1210-01",
    report_version: "2.0.0",
    ptr_enabled: 0,
    beta_enabled: 0,
    build_date: "Jan  1 2026",
    build_time: "00:00:00",
    timestamp: 1,
    no_networking: true,
    git_revision: mode === "wrong-revision" ? "af05b9e" : "33622e9",
    git_branch: "midnight",
    sim: {
      options: {
        max_time: duration,
        expected_iteration_time: duration,
        vary_combat_length: num(sim.vary_combat_length),
        iterations,
        target_error: num(sim.target_error),
        threads,
        // Like the pinned engine with deterministic=1 (sim.cpp:1810), the echoed
        // seed is the last iteration reseed, not the configured one.
        seed: 7596449901710748000,
        queue_lag: secs(sim.queue_lag),
        queue_lag_stddev: secs(sim.queue_lag_stddev),
        gcd_lag: secs(sim.gcd_lag),
        gcd_lag_stddev: secs(sim.gcd_lag_stddev),
        channel_lag: secs(sim.channel_lag),
        channel_lag_stddev: secs(sim.channel_lag_stddev),
        queue_gcd_reduction: secs(sim.queue_gcd_reduction),
        strict_gcd_queue: sim.strict_gcd_queue === "1",
        confidence: 0.95,
        confidence_estimator: 1.9599639854088815,
        world_lag: secs(sim.default_world_lag),
        world_lag_stddev: secs(sim.default_world_lag_stddev),
        travel_variance: num(sim.travel_variance),
        default_skill: num(sim.default_skill),
        reaction_time: secs(sim.reaction_time),
        fixed_time: sim.fixed_time === "1",
        optimal_raid: num(sim.optimal_raid),
        deterministic: num(sim.deterministic),
        average_range: num(sim.average_range),
        average_gauss: num(sim.average_gauss),
        default_aura_delay: secs(sim.default_aura_delay),
        default_aura_delay_stddev: secs(sim.default_aura_delay_stddev),
        dbc: {
          Live: { build_level: 69587, wow_version: "12.1.0.69587", hotfix_hash: "f".repeat(64) },
          version_used: "Live",
        },
      },
      overrides,
      statistics: {
        elapsed_cpu_seconds: 1,
        elapsed_time_seconds: 1,
        total_events_processed: 1,
        simulation_length: sample(duration, 0, iterations - threads),
      },
      players: [
        {
          name: "Subject",
          race: player.race,
          level: num(player.level),
          role: player.role,
          specialization: "Blood Death Knight",
          talents: player.talents,
          reaction_offset: secs(player.reaction_time_offset),
          reaction_max: secs(player.reaction_time_max),
          reaction_mean: secs(player.reaction_time_mean),
          reaction_stddev: secs(player.reaction_time_stddev),
          reaction_nu: secs(player.reaction_time_nu),
          world_lag: secs(player.world_lag),
          world_lag_stddev: secs(player.world_lag_stddev),
          brain_lag: secs(player.brain_lag),
          brain_lag_stddev: secs(player.brain_lag_stddev),
          potion: player.potion,
          flask: player.flask,
          food: player.food,
          augmentation: player.augmentation,
          temporary_enchant: player.temporary_enchant,
          collected_data: { dps: sample(meanDps, meanDps * 0.034, iterations - threads) },
          stats: [
            {
              id: 206930,
              name: "heart_strike",
              type: "damage",
              compound_amount: 1_000_000,
              num_executes: { mean: 100 },
            },
          ],
          stats_pets: {
            bloodworm: [
              {
                id: 0,
                name: "auto_attack_mh",
                type: "damage",
                compound_amount: 10_000,
                num_executes: { mean: 50 },
              },
            ],
          },
          gear,
        },
      ],
      targets: [{ name: "Target" }],
      raid_events: [{ name: "tank_heal", type: "heal" }],
    },
  };
  writeFileSync(outPath, JSON.stringify(report));
  process.exit(0);
}
