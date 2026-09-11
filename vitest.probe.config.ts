import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

/**
 * Configuration for the MANUAL live Warcraft Logs probe.
 *
 * This is NOT part of `npm test`. The default `vitest.config.ts` includes only
 * `tests/`, so nothing here can be picked up by the normal suite or by CI, and
 * the correctness suite stays fully offline.
 *
 * Vitest is used as the runner purely because Node cannot resolve this
 * project's `./module.js` import specifiers to their `.ts` sources, and the
 * probe must exercise the REAL production transport rather than a parallel
 * reimplementation of it. Adding a TypeScript runner as a dependency would
 * violate the no-new-dependencies constraint; Vite's resolver is already here.
 *
 * Credentials are read from `.dev.vars`, which is gitignored. They are loaded
 * into `process.env` for the probe process only, and the probe never prints or
 * persists them.
 */
function loadDevVars(): Record<string, string> {
  let contents: string;
  try {
    contents = readFileSync(".dev.vars", "utf8");
  } catch {
    // Absent .dev.vars is not an error here. The probe itself reports the
    // missing credential clearly rather than failing with a parse error.
    return {};
  }

  const values: Record<string, string> = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    const separator = trimmed.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separator).trim();
    const raw = trimmed.slice(separator + 1).trim();
    values[key] = raw.replace(/^["']|["']$/g, "");
  }
  return values;
}

for (const [key, value] of Object.entries(loadDevVars())) {
  process.env[key] ??= value;
}

export default defineConfig({
  test: {
    name: "probe",
    environment: "node",
    include: ["scripts/probe/**/*.probe.ts"],
    // A full-fight pagination pass against the live API is not a 5-second job.
    testTimeout: 600_000,
    hookTimeout: 600_000,
    // Live, ordered, and stateful. Parallelism would interleave API-point
    // measurements and make them meaningless.
    fileParallelism: false,
    maxConcurrency: 1,
  },
});
