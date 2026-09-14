import { defineConfig } from "vitest/config";

/**
 * Configuration for OFFLINE local benchmarks.
 *
 * SEPARATE FROM THE PROBE CONFIG, AND THAT SEPARATION IS THE POINT.
 *
 * `vitest.probe.config.ts` loads Warcraft Logs credentials from `.dev.vars` and
 * globs `scripts/probe/**` — every file it matches spends real, paid, finite API
 * points. A benchmark that merely wanted a place to live does not belong in that
 * glob: anyone running it would spend points on a measurement that needs no
 * network, and a mistyped file filter would spend them silently.
 *
 * So benchmarks get their own root, their own config, and NO credential loading
 * whatsoever. Nothing reachable from here can make a Warcraft Logs request,
 * because nothing here has anything to authenticate with.
 *
 * It is also invisible to `npm test`: the default config includes only `tests/`,
 * so a wall-clock number can never fail CI on a slow runner.
 *
 * Run it deliberately:
 *
 *     npx vitest run --config scripts/bench/vitest.config.ts
 *
 * There is no `npm run` alias on purpose — an npm script is the thing people
 * invoke by habit, and these measurements are meant to be asked for.
 */
export default defineConfig({
  test: {
    name: "bench",
    environment: "node",
    include: ["scripts/bench/**/*.bench.ts"],
    // Measurements are meaningless when they interleave.
    fileParallelism: false,
    maxConcurrency: 1,
    testTimeout: 120_000,
  },
});
