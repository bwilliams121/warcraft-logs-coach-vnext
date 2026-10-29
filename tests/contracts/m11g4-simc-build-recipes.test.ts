/**
 * The hardened SimulationCraft engine recipes, as text.
 *
 * - simc-build/2 (M11-G4-5, runner/simc-build/v2/). Owner decision (M11
 *   closeout): the next model build pins the immutable base AND the exact
 *   package and toolchain inputs as far as practical.
 *   - The base is a committed digest; no stage resolves a tag.
 *   - Each stage installs its full lockfile closure at exact versions and
 *     fails unless the installed set equals the lock.
 *   - PGO training uses fixed seeds; SIMC_COMMIT has no default.
 *   - Two --no-cache builds still differed (embedded build time,
 *     multi-threaded PGO training).
 * - simc-build/3 (M11-G4-6, runner/simc-build/v3/) keeps every simc-build/2
 *   pin and adds:
 *   - SOURCE_DATE_EPOCH = the commit's own committer time, which fixes the
 *     embedded build time;
 *   - a single-threaded training run.
 *   - Its build script fails NOT_REPRODUCED when a rebuild does not hash as
 *     expected.
 *   - The PGO profile still varies between builds, so binaries still differ.
 *     scripts/bench/m11g46-functional-reproduction.bench.ts compares engine
 *     RESULTS for the jobs it runs; that is evidence for those jobs only.
 * - simc-build/1 and /2 are frozen: their artifacts keep the recipe they were
 *   built with.
 *
 * Building is not run here (about 30 minutes, network). The build scripts
 * re-check the image against the locks offline and record the result.
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

declare const process: { cwd(): string };

const ROOT = join(process.cwd(), "runner/simc-build");
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

const HARDENED = [
  { dir: "v2", revision: "simc-build/2", training: "single_actor_batch=1 iterations=100 deterministic=1" },
  {
    dir: "v3",
    revision: "simc-build/3",
    training: "single_actor_batch=1 iterations=100 deterministic=1 threads=1",
  },
] as const;

describe.each(HARDENED)("$revision recipe", ({ dir, revision, training }) => {
  const text = (name: string): string => readFileSync(join(ROOT, dir, name), "utf8");
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

  it("the commit has no default and is verified; PGO training is pinned; no networking in the engine", () => {
    const code = dockerfileCode();
    expect(code).toMatch(/^ARG SIMC_COMMIT$/m);
    expect(code).toContain('test -n "${SIMC_COMMIT}"');
    expect(code).toContain('test "$(git rev-parse HEAD)" = "${SIMC_COMMIT}"');
    // The whole option list, up to the RUN's line continuation.
    expect(code).toContain(`./engine/simc "\${PGO_PROFILE}" ${training} \\\n`);
    expect(code.match(/SC_NO_NETWORKING=1/g)?.length).toBe(2);
    expect(code).toContain("USER simc");
  });

  it("the build script names the recipe revision and holds the image to both locks", () => {
    const script = text("build.mjs");
    expect(script).toContain(`const RECIPE_REVISION = "${revision}";`);
    expect(script).toContain('lockLines("toolchain-build.lock")');
    expect(script).toContain('lockLines("toolchain-runtime.lock")');
    expect(script).toContain("TOOLCHAIN_DRIFT");
    expect(script).toContain("shell: false");
  });
});

describe("simc-build/3: reproducibility", () => {
  const text = (name: string): string => readFileSync(join(ROOT, "v3", name), "utf8");
  const code = (): string =>
    text("Dockerfile")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");

  it("reuses simc-build/2's base and exact package closures unchanged", () => {
    const entries = (dir: string, name: string): string =>
      readFileSync(join(ROOT, dir, name), "utf8")
        .split("\n")
        .filter((line) => line.trim() !== "" && !line.startsWith("#"))
        .join("\n");
    expect(text("alpine.digest")).toBe(readFileSync(join(ROOT, "v2", "alpine.digest"), "utf8"));
    for (const lock of ["toolchain-build.lock", "toolchain-runtime.lock"]) {
      expect(entries("v3", lock), lock).toBe(entries("v2", lock));
    }
  });

  it("SOURCE_DATE_EPOCH is the checked-out commit's committer time, exported for both compiles", () => {
    expect(code()).toContain("git log -1 --format=%ct HEAD > /simc.source-date-epoch");
    expect(code()).toContain("grep -Eq '^[0-9]+$' /simc.source-date-epoch");
    // Exported in the same RUN as both make invocations (the generate and use builds).
    const makeRun = code()
      .split(/\nRUN /)
      .find((run) => run.includes("LLVM_PGO_USE"));
    expect(makeRun).toContain('export SOURCE_DATE_EPOCH="$(cat /simc.source-date-epoch)"');
    expect(makeRun?.indexOf("export SOURCE_DATE_EPOCH")).toBeLessThan(
      makeRun?.indexOf("make -C engine") ?? -1,
    );
    expect(makeRun).toContain("LLVM_PGO_GENERATE=1");
  });

  it("the image carries the epoch and the PGO profile hash; the script records them and fails NOT_REPRODUCED", () => {
    expect(code()).toContain("sha256sum engine/code.profdata > /simc.profdata.sha256");
    expect(code()).toMatch(/COPY --from=build [^\n]*\/simc\.source-date-epoch \/simc\.profdata\.sha256/);
    const script = text("build.mjs");
    expect(script).toContain('schemaVersion: "simc-build-record/3"');
    expect(script).toContain("pgoProfileSha256");
    expect(script).toContain('"NOT_REPRODUCED"');
    expect(script).toContain("throw new Error(`NOT_REPRODUCED:");
  });
});

describe("frozen recipes", () => {
  it("simc-build/1 is unchanged: its approved artifacts keep the recipe they were built with", () => {
    const v1 = sha256(readFileSync(join(ROOT, "Dockerfile")));
    for (const record of V1_BUILD_RECORDS) {
      const recorded = JSON.parse(readFileSync(join(ROOT, record), "utf8"));
      expect(recorded.buildRecipeRevision, record).toBe("simc-build/1");
      expect(recorded.recipeSha256, record).toBe(v1);
    }
  });

  it("simc-build/2 is unchanged: it built the 12.1.5 candidate (record recipeSha256 4005f4d4…)", () => {
    expect(sha256(readFileSync(join(ROOT, "v2", "Dockerfile")))).toBe(V2_DOCKERFILE_SHA256);
  });
});

const V1_BUILD_RECORDS = ["build-record.json", "build-record-0a72e6a7.json"] as const;
/** The recipe hash in the M11-G4-5 candidate build record (ec3422d6, binary b1913546…). */
const V2_DOCKERFILE_SHA256 = "4005f4d47431aefee5b741aa9523d8caa043eb8fcfbac6b633594a0488bb7a29";
