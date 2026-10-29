/**
 * M11-G4-5: the hardened SimulationCraft engine recipe `simc-build/2`
 * (runner/simc-build/v2/), as text. Owner decision (M11 closeout): the next
 * model build pins the immutable base AND the exact package and toolchain
 * inputs as far as practical.
 *
 * - The base is a committed digest; no stage resolves a tag.
 * - Each stage installs its full lockfile closure at exact versions and fails
 *   unless the installed set equals the lock.
 * - The PGO training run is deterministic; SIMC_COMMIT has no default.
 * - simc-build/1 is unchanged (its artifacts keep their recipe).
 *
 * Building is not run here (about 30 minutes, network); the build script
 * re-checks the image against the locks offline and records the result.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const V2 = join(process.cwd(), "runner/simc-build/v2");
const text = (name: string): string => readFileSync(join(V2, name), "utf8");
const lockEntries = (name: string): string[] =>
  text(name)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));
const dockerfileCode = (): string =>
  text("Dockerfile")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");

describe("simc-build/2 recipe", () => {
  it("the base is a committed sha256 digest, and every stage is FROM that digest", () => {
    expect(text("alpine.digest").trim()).toMatch(/^sha256:[0-9a-f]{64}$/);
    const froms = dockerfileCode().match(/^FROM .*$/gm) ?? [];
    expect(froms).toEqual(["FROM alpine@${ALPINE_DIGEST} AS build", "FROM alpine@${ALPINE_DIGEST}"]);
    expect(dockerfileCode()).toMatch(/^ARG ALPINE_DIGEST$/m);
  });

  it("each lock is a sorted, duplicate-free list of exact apk versions (name-version-rN)", () => {
    for (const lock of ["toolchain-build.lock", "toolchain-runtime.lock"]) {
      const entries = lockEntries(lock);
      expect(entries.length, lock).toBeGreaterThan(0);
      for (const entry of entries)
        expect(entry, lock).toMatch(/^[a-z0-9][a-z0-9._+-]*-[0-9][^-\s]*-r[0-9]+$/);
      expect([...entries].sort(), lock).toEqual(entries);
      expect(new Set(entries).size, lock).toBe(entries.length);
    }
    // The compiler the official recipe uses is in the build closure.
    expect(lockEntries("toolchain-build.lock").some((entry) => /^clang[0-9]*-[0-9]/.test(entry))).toBe(true);
  });

  it("each stage installs ITS lock at exact versions and fails unless the installed set equals it", () => {
    const code = dockerfileCode();
    for (const [lock, manifest] of [
      ["toolchain-build.lock", "/toolchain-packages.txt"],
      ["toolchain-runtime.lock", "/runtime-packages.txt"],
    ] as const) {
      expect(code).toContain(`COPY ${lock} /${lock}`);
      expect(code).toContain(`grep -v '^#' /${lock} | sed -E 's/^(.+)-([^-]+-r[0-9]+)$/\\1=\\2/'`);
      expect(code).toContain(`apk info -v | sort > ${manifest}`);
      expect(code).toContain(`grep -v '^#' /${lock} | sort | diff - ${manifest}`);
    }
    // No unpinned install anywhere.
    for (const install of code.match(/apk [^\n]*add[^\n]*/g) ?? []) {
      expect(install).toMatch(/\$\(cat \/toolchain-(build|runtime)\.pins\)/);
    }
  });

  it("the commit has no default and is verified; PGO training is deterministic; no networking in the engine", () => {
    const code = dockerfileCode();
    expect(code).toMatch(/^ARG SIMC_COMMIT$/m);
    expect(code).toContain('test -n "${SIMC_COMMIT}"');
    expect(code).toContain('test "$(git rev-parse HEAD)" = "${SIMC_COMMIT}"');
    expect(code).toMatch(/single_actor_batch=1 iterations=100 deterministic=1/);
    expect(code.match(/SC_NO_NETWORKING=1/g)?.length).toBe(2);
    expect(code).toContain("USER simc");
  });

  it("the build script names the recipe revision and holds the image to both locks", () => {
    const script = text("build.mjs");
    expect(script).toContain('const RECIPE_REVISION = "simc-build/2";');
    expect(script).toContain('lockLines("toolchain-build.lock")');
    expect(script).toContain('lockLines("toolchain-runtime.lock")');
    expect(script).toContain("TOOLCHAIN_DRIFT");
    expect(script).toContain("shell: false");
  });

  it("simc-build/1 is unchanged: its approved artifacts keep the recipe they were built with", () => {
    const v1 = createHash("sha256")
      .update(readFileSync(join(process.cwd(), "runner/simc-build/Dockerfile")))
      .digest("hex");
    for (const record of V1_BUILD_RECORDS) {
      const recorded = JSON.parse(readFileSync(join(process.cwd(), "runner/simc-build", record), "utf8"));
      expect(recorded.buildRecipeRevision, record).toBe("simc-build/1");
      expect(recorded.recipeSha256, record).toBe(v1);
    }
  });
});

const V1_BUILD_RECORDS = ["build-record.json", "build-record-0a72e6a7.json"] as const;
