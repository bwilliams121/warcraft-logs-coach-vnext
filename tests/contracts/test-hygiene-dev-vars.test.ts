/**
 * TEST-HYGIENE: the default `npm test` reads no `.dev.vars`.
 *
 * Wrangler loads `.dev.vars` (or `.env`) from the directory of the config file
 * it is given, and @cloudflare/vitest-pool-workers passes it only a config
 * path. The `workers` project therefore points at a test-only copy of the
 * production config in tests/workers/, a directory that never holds either
 * file. The developer's real Warcraft Logs credentials in the repository-root
 * `.dev.vars` are read only by the manual probe config, vitest.probe.config.ts.
 *
 * This file pins three things:
 * - the copy is the production config, setting for setting, so the Worker the
 *   tests boot is the Worker that ships;
 * - the copy yields no binding but the configured `vars`, which is what
 *   reading no secrets file looks like from the outside;
 * - the pool is pointed at the copy, and nothing can be dropped beside it.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { unstable_getMiniflareWorkerOptions, unstable_readConfig } from "wrangler";

declare const process: { cwd(): string };

const ROOT = process.cwd();
const PRODUCTION_CONFIG = join(ROOT, "wrangler.jsonc");
const TEST_CONFIG_DIR = join(ROOT, "tests/workers");
const TEST_CONFIG = join(TEST_CONFIG_DIR, "wrangler.jsonc");

// Wrangler's env-file names: `.dev.vars`, `.dev.vars.<env>`, `.env`, `.env.<env>`
// and their `.local` variants.
const SECRETS_FILE = /^\.(dev\.vars|env)(\..*)?$/;

/** The normalized config without the two fields that name the file itself. */
function settings(configPath: string): Record<string, unknown> {
  const {
    configPath: _configPath,
    userConfigPath: _userConfigPath,
    ...rest
  } = unstable_readConfig({
    config: configPath,
  }) as unknown as Record<string, unknown>;
  return rest;
}

// Loading wrangler and normalizing two configs is slow under a loaded full run.
describe("the workers test pool reads no .dev.vars", { timeout: 60_000 }, () => {
  it("is pointed at the test-only copy of the wrangler config", () => {
    const vitestConfig = readFileSync(join(ROOT, "vitest.config.ts"), "utf8");
    const configPaths = [...vitestConfig.matchAll(/configPath:\s*"([^"]*)"/g)].map((match) => match[1]);

    expect(configPaths).toEqual(["./tests/workers/wrangler.jsonc"]);
    expect(existsSync(TEST_CONFIG)).toBe(true);
  });

  it("boots the production Worker: every normalized setting equals the production config's", () => {
    const production = settings(PRODUCTION_CONFIG);
    const test = settings(TEST_CONFIG);

    expect(test).toEqual(production);
    // Not vacuous: the entry point resolves to the one Worker source.
    expect(test.main).toBe(join(ROOT, "src/api/worker.ts"));
  });

  it("has no secrets file beside it to read", () => {
    const secretsFiles = readdirSync(TEST_CONFIG_DIR, { recursive: false, withFileTypes: false }).filter(
      (name) => SECRETS_FILE.test(name),
    );

    expect(secretsFiles).toEqual([]);
  });

  it("yields only the configured vars as bindings, whatever the repository root holds", () => {
    // The same Miniflare options the pool builds from this config. Were a
    // secrets file read, its keys would appear here beside ENVIRONMENT.
    const { workerOptions } = unstable_getMiniflareWorkerOptions(TEST_CONFIG);

    expect(Object.keys(workerOptions.bindings ?? {})).toEqual(["ENVIRONMENT"]);
  });
});
