// M11-G4-5: build a SimulationCraft engine image with the HARDENED recipe
// simc-build/2 and write its build record.
//
//   node runner/simc-build/v2/build.mjs --simc-commit <40-hex> --out <record.json> [--threads 8]
//     [--no-cache] [--tag <image tag>]
//
// --no-cache rebuilds every layer from scratch: a second build with it is how
// the recipe's reproducibility is checked (the binary SHA-256 must match).
//
// The base is the committed digest (alpine.digest), pulled by digest if it is
// not local; no tag is ever resolved. Both stages install the exact package
// closure in the lockfiles and fail unless the installed set equals it; this
// script checks the image's manifests against the locks again, offline.
//
// Network reads during the build: the Alpine base (by digest), the Alpine
// package mirrors (exact versions only) and github.com/simulationcraft/simc at
// the named commit. The image itself runs with --network none.
//
// Every docker call is a fixed argument vector (no shell). The record holds no
// host path, user or credential. This script does NOT approve the artifact:
// scripts/bench/m11g3-simc-exact-pin.bench.ts verifies the engine's own
// identity first, and approval is a reviewed registry change.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RECIPE_REVISION = "simc-build/2";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] !== undefined ? args[at + 1] : fallback;
};
const simcCommit = option("--simc-commit", "");
const out = option("--out", "");
const threads = option("--threads", "8");
if (!/^[0-9a-f]{40}$/.test(simcCommit)) throw new Error("--simc-commit must be a full 40-hex commit");
if (out === "") throw new Error("--out <record.json> is required");
if (!/^[0-9]{1,2}$/.test(threads)) throw new Error("invalid --threads");

const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const read = (name) => readFileSync(join(HERE, name));
const lockLines = (name) =>
  read(name)
    .toString("utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"))
    .sort();

const alpineDigest = read("alpine.digest").toString("utf8").trim();
if (!/^sha256:[0-9a-f]{64}$/.test(alpineDigest)) throw new Error("alpine.digest is not a sha256 digest");
const noCache = args.includes("--no-cache");
const tag = option("--tag", `wlc-simc:${simcCommit.slice(0, 8)}-r2`);
if (!/^[a-z0-9][a-z0-9._:-]{0,127}$/.test(tag)) throw new Error("invalid --tag");

function docker(argv, { inherit = false } = {}) {
  const result = spawnSync("docker", argv, {
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    stdio: inherit ? ["ignore", "inherit", "inherit"] : ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(
      `docker ${argv[0]} failed (${String(result.status)}): ${(result.stderr ?? "").slice(-2000)}`,
    );
  }
  return (result.stdout ?? "").trim();
}

// 1. The immutable base, by digest only.
docker(["pull", `alpine@${alpineDigest}`], { inherit: true });

// 2. Build.
const started = Date.now();
docker(
  [
    "build",
    "--pull=false",
    ...(noCache ? ["--no-cache"] : []),
    "--build-arg",
    `ALPINE_DIGEST=${alpineDigest}`,
    "--build-arg",
    `THREADS=${threads}`,
    "--build-arg",
    `SIMC_COMMIT=${simcCommit}`,
    "-t",
    tag,
    HERE,
  ],
  { inherit: true },
);
const buildSeconds = Math.round((Date.now() - started) / 1000);
const imageId = docker(["image", "inspect", "--format", "{{.Id}}", tag]);
if (!/^sha256:[0-9a-f]{64}$/.test(imageId)) throw new Error(`unexpected image id ${imageId}`);

// 3. Read the image's own manifests, offline, and hold them to the locks.
const inImage = (...argv) =>
  docker(["run", "--rm", "--network", "none", "--entrypoint", argv[0], imageId, ...argv.slice(1)]);
const buildStageSha = /^([0-9a-f]{64})\s/.exec(inImage("cat", "/opt/simc/simc.sha256"))?.[1];
const finalImageSha = /^([0-9a-f]{64})\s/.exec(inImage("sha256sum", "/opt/simc/simc"))?.[1];
const commit = inImage("cat", "/opt/simc/simc.commit");
const compiler = inImage("cat", "/opt/simc/toolchain-compiler.txt");
const buildPackages = inImage("cat", "/opt/simc/toolchain-packages.txt");
const runtimePackages = inImage("cat", "/opt/simc/runtime-packages.txt");
const alpineRelease = inImage("cat", "/etc/alpine-release");
if (commit !== simcCommit)
  throw new Error(`MODEL_PROVENANCE_MISMATCH: the build checked out ${commit}, not ${simcCommit}`);
if (buildStageSha === undefined || buildStageSha !== finalImageSha) {
  throw new Error("MODEL_PROVENANCE_MISMATCH: the final image's binary differs from the build stage's");
}
const sameList = (actual, expected) =>
  JSON.stringify(
    actual
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .sort(),
  ) === JSON.stringify(expected);
if (!sameList(buildPackages, lockLines("toolchain-build.lock")))
  throw new Error("TOOLCHAIN_DRIFT: build stage packages differ from toolchain-build.lock");
if (!sameList(runtimePackages, lockLines("toolchain-runtime.lock")))
  throw new Error("TOOLCHAIN_DRIFT: runtime packages differ from toolchain-runtime.lock");

const record = {
  schemaVersion: "simc-build-record/2",
  buildRecipeRevision: RECIPE_REVISION,
  recipeSha256: sha256(read("Dockerfile")),
  lockSha256: {
    build: sha256(read("toolchain-build.lock")),
    runtime: sha256(read("toolchain-runtime.lock")),
  },
  simcCommit,
  base: { image: "alpine", digest: alpineDigest, release: alpineRelease },
  buildArgs: {
    THREADS: threads,
    PGO_PROFILE: "CI.simc",
    PGO_TRAINING: "single_actor_batch=1 iterations=100 deterministic=1",
    make: 'release CXX=clang++ LTO_THIN=1 LLVM_PGO_GENERATE=1 / LLVM_PGO_USE OPTS+="-Os -mtune=generic" SC_NO_NETWORKING=1',
  },
  toolchain: {
    compiler: compiler.split("\n")[0] ?? "",
    packagesSha256: sha256(buildPackages),
    runtimePackagesSha256: sha256(runtimePackages),
    lockVerified: true,
  },
  imageTag: tag,
  imageId,
  binarySha256: finalImageSha,
  buildSeconds,
  verification: "PENDING: run scripts/bench/m11g3-simc-exact-pin.bench.ts",
};
writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`, "utf8");
process.stdout.write(`image ${imageId}\nbinary sha256 ${finalImageSha}\n`);
