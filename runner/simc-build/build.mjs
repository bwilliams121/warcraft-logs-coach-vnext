// M11-G3-1: build the exact-pin SimulationCraft runner image and write
// runner/simc-build/build-record.json.
//
//   node runner/simc-build/build.mjs [--alpine-tag latest] [--threads 8]
//
// The default tag is the official recipe's `latest`, resolved ONCE to a
// digest that both stages then use; the record keeps that digest and the
// Alpine release it turned out to be.
//
// Requires Docker (Desktop/WSL2 on Windows). Network reads during the build are
// limited to the official recipe's sources: the Alpine base image and package
// mirrors, and github.com/simulationcraft/simc at the pinned commit. The image
// itself runs with --network none.
//
// Every docker call is a fixed argument vector (no shell). The record holds
// the base image digest, build arguments, toolchain manifest, the image id
// and the binary SHA-256 measured twice (in the build stage, and again from
// the final image). It never holds a host path, user or credential.
//
// This script does NOT approve the artifact. The engine's own JSON identity
// is verified by scripts/bench/m11g3-simc-exact-pin.bench.ts; only then is
// the binary hash entered in runner/approved-artifacts.ts.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SIMC_COMMIT = "33622e9d1662ff0e451691edf85a6b49cc9d11d9";
const TAG = "wlc-simc:33622e9d";
const RECIPE_REVISION = "simc-build/1";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const at = args.indexOf(name);
  return at >= 0 && args[at + 1] !== undefined ? args[at + 1] : fallback;
};
const alpineTag = option("--alpine-tag", "latest");
const threads = option("--threads", "8");
if (!/^(latest|[0-9]+(\.[0-9]+)*)$/.test(alpineTag) || !/^[0-9]{1,2}$/.test(threads)) {
  throw new Error("invalid --alpine-tag or --threads");
}

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

// 1. Pin the base image by digest.
docker(["pull", `alpine:${alpineTag}`], { inherit: true });
const repoDigest = docker([
  "image",
  "inspect",
  "--format",
  "{{index .RepoDigests 0}}",
  `alpine:${alpineTag}`,
]);
const alpineDigest = /@(sha256:[0-9a-f]{64})$/.exec(repoDigest)?.[1];
if (alpineDigest === undefined) throw new Error(`could not resolve the alpine:${alpineTag} digest`);

// 2. Build.
const started = Date.now();
docker(
  [
    "build",
    "--pull=false",
    "--build-arg",
    `ALPINE_DIGEST=${alpineDigest}`,
    "--build-arg",
    `THREADS=${threads}`,
    "--build-arg",
    `SIMC_COMMIT=${SIMC_COMMIT}`,
    "-t",
    TAG,
    HERE,
  ],
  { inherit: true },
);
const buildSeconds = Math.round((Date.now() - started) / 1000);
const imageId = docker(["image", "inspect", "--format", "{{.Id}}", TAG]);
if (!/^sha256:[0-9a-f]{64}$/.test(imageId)) throw new Error(`unexpected image id ${imageId}`);

// 3. Read the image's own manifests, offline.
const inImage = (...argv) =>
  docker(["run", "--rm", "--network", "none", "--entrypoint", argv[0], imageId, ...argv.slice(1)]);
const buildStageSha = /^([0-9a-f]{64})\s/.exec(inImage("cat", "/opt/simc/simc.sha256"))?.[1];
const finalImageSha = /^([0-9a-f]{64})\s/.exec(inImage("sha256sum", "/opt/simc/simc"))?.[1];
const commit = inImage("cat", "/opt/simc/simc.commit");
const compiler = inImage("cat", "/opt/simc/toolchain-compiler.txt");
const packages = inImage("cat", "/opt/simc/toolchain-packages.txt");
const alpineRelease = inImage("cat", "/etc/alpine-release");
if (commit !== SIMC_COMMIT)
  throw new Error(`MODEL_PROVENANCE_MISMATCH: the build checked out ${commit}, not ${SIMC_COMMIT}`);
if (buildStageSha === undefined || buildStageSha !== finalImageSha) {
  throw new Error("MODEL_PROVENANCE_MISMATCH: the final image's binary differs from the build stage's");
}

const record = {
  schemaVersion: "simc-build-record/1",
  buildRecipeRevision: RECIPE_REVISION,
  recipeSha256: createHash("sha256")
    .update(readFileSync(join(HERE, "Dockerfile")))
    .digest("hex"),
  simcCommit: SIMC_COMMIT,
  base: { image: "alpine", tag: alpineTag, digest: alpineDigest, release: alpineRelease },
  buildArgs: {
    THREADS: threads,
    PGO_PROFILE: "CI.simc",
    make: 'release CXX=clang++ LTO_THIN=1 LLVM_PGO_GENERATE=1 / LLVM_PGO_USE OPTS+="-Os -mtune=generic" SC_NO_NETWORKING=1',
  },
  toolchain: {
    compiler: compiler.split("\n")[0] ?? "",
    packagesSha256: createHash("sha256").update(packages).digest("hex"),
    packages: packages.split("\n"),
  },
  imageTag: TAG,
  imageId,
  binarySha256: finalImageSha,
  buildSeconds,
  verification: "PENDING: run scripts/bench/m11g3-simc-exact-pin.bench.ts",
};
writeFileSync(join(HERE, "build-record.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
process.stdout.write(`image ${imageId}\nbinary sha256 ${finalImageSha}\n`);
