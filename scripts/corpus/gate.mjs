/**
 * `npm run test:corpus` — the dedicated regression-corpus command.
 *
 * One command, one exit code, the same on a developer's PowerShell and on
 * GitHub Actions' Linux runner. It is plain Node with no dependency beyond
 * the repository's own devDependencies, and it does, in order:
 *
 *   1. MANIFEST CURRENCY   regenerates the manifest to a temporary path and
 *                          compares it, parsed, with the committed one. A
 *                          re-sliced artifact or an edited generator that was
 *                          not followed by regeneration fails here, before
 *                          any test runs.
 *   2. NODE CORPUS SUITE   the loader, contract, harness, coverage, layering
 *                          and agreement tests under the `node` project. This
 *                          is where contract version 2 is enforced, every
 *                          digest is recomputed, and every Node-executable
 *                          layer's cases run.
 *   3. WORKERD GATE, TWICE the complete corpus — every case of every layer
 *                          including PUBLIC_CONTRACT — inside real workerd,
 *                          in two SEPARATE vitest processes. Each run attaches
 *                          the machine-readable report of its own execution
 *                          to task metadata; the script reads both back from
 *                          the JSON reporter's output and requires them to be
 *                          byte-identical, and each to be complete: zero
 *                          failed, zero not-executed, zero declared.
 *   4. REPORT DRIFT        the executed report must equal the committed
 *                          `tests/corpus/report.json`. `--write-report`
 *                          writes it instead, FROM THE EXECUTION — the
 *                          script never composes a total itself.
 *
 * NO NETWORK, NO SECRETS. Every child process is started with the Warcraft
 * Logs and analysis credentials removed from its environment, whatever the
 * parent shell holds, so a run cannot be quietly "helped" by a developer's
 * `.dev.vars`. The workers project's outbound service answers 503 to any
 * fetch the corpus might attempt, and a dedicated test proves that path
 * fails actionably.
 *
 * Failures are printed as the vitest output already names them — case,
 * artifact, layer, kind, expected, actual — plus one line from this script
 * saying which step failed. Exit code is 1 on any failure.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const VITEST = join(ROOT, "node_modules", "vitest", "vitest.mjs");
const MANIFEST = join(ROOT, "tests", "corpus", "manifest.json");
const REPORT = join(ROOT, "tests", "corpus", "report.json");
const GATE_TEST = "tests/regression/m9b-corpus-gate.test.ts";
const ISOLATION_TEST = "tests/regression/m9c-corpus-network-isolation.test.ts";

const NODE_CORPUS_TESTS = [
  "tests/unit/m9a-corpus-loader.test.ts",
  "tests/unit/m9a-corpus-seed-cases.test.ts",
  "tests/contracts/m9a-corpus-layering.test.ts",
  "tests/unit/m9b-corpus-manifest.test.ts",
  "tests/unit/m9b-corpus-harness.test.ts",
  "tests/unit/m9b-corpus-failure-demonstration.test.ts",
  "tests/unit/m9b-corpus-coverage-report.test.ts",
  "tests/unit/m9b-corpus-and-m5d2-agree.test.ts",
  "tests/unit/m9c-corpus-machine-report.test.ts",
  "tests/unit/m9c-sanitize-payloads.test.ts",
  "tests/unit/sanitize-probe.test.ts",
];

/** Credentials never reach a corpus run, whatever the parent shell holds. */
const STRIPPED_ENV_KEYS = ["WCL_CLIENT_ID", "WCL_CLIENT_SECRET", "ANALYSIS_AUTH_TOKEN"];

const writeReport = process.argv.includes("--write-report");

function childEnv() {
  const env = { ...process.env };
  for (const key of STRIPPED_ENV_KEYS) delete env[key];
  // Colour and TTY-dependent output make logs differ between local and CI
  // runs; the content is what matters.
  env["FORCE_COLOR"] = "0";
  env["CI"] = env["CI"] ?? "1";
  return env;
}

function run(label, args, options = {}) {
  const started = Date.now();
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: childEnv(),
    stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  if (options.capture && result.status !== 0) {
    process.stdout.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
  }
  console.log(`corpus gate: ${label} ${result.status === 0 ? "ok" : "FAILED"} (${elapsed} s)`);
  return result;
}

function fail(message) {
  console.error(`corpus gate: FAILED — ${message}`);
  process.exit(1);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

const serialize = (report) => `${JSON.stringify(canonicalize(report), null, 2)}\n`;

// --------------------------------------------------------------------------
// 1. Manifest currency
// --------------------------------------------------------------------------

const scratch = mkdtempSync(join(tmpdir(), "wlc-corpus-gate-"));
try {
  const regenerated = join(scratch, "manifest.json");
  const generation = run("regenerate manifest", ["scripts/corpus/build-manifest.mjs", "--out", regenerated], {
    capture: true,
  });
  if (generation.status !== 0) fail("the manifest generator did not run");
  const committed = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const fresh = JSON.parse(readFileSync(regenerated, "utf8"));
  if (serialize(committed) !== serialize(fresh)) {
    fail(
      "tests/corpus/manifest.json is not what scripts/corpus/build-manifest.mjs produces from the committed artifacts; regenerate it (node scripts/corpus/build-manifest.mjs && npx prettier --write tests/corpus/manifest.json) and review the diff",
    );
  }
  console.log(
    `corpus gate: manifest current — contract version ${String(fresh.contractVersion)}, ${String(fresh.artifacts.length)} artifacts, ${String(fresh.cases.length)} cases`,
  );

  // ------------------------------------------------------------------------
  // 2. Node corpus suite
  // ------------------------------------------------------------------------

  // In --write-report mode the Node suite runs AFTER the report is written,
  // because part of it reads the committed report.
  const runNodeSuite = () => {
    const node = run("node corpus suite", [VITEST, "run", "--project", "node", ...NODE_CORPUS_TESTS]);
    if (node.status !== 0) fail("the Node corpus suite did not pass");
  };
  if (!writeReport) runNodeSuite();

  // ------------------------------------------------------------------------
  // 3. Workerd gate, twice, in separate processes
  // ------------------------------------------------------------------------

  const reports = [];
  for (const attempt of [1, 2]) {
    const outputFile = join(scratch, `gate-${String(attempt)}.json`);
    const gate = run(`workerd gate run ${String(attempt)} of 2`, [
      VITEST,
      "run",
      "--project",
      "workers",
      GATE_TEST,
      ISOLATION_TEST,
      "--reporter=default",
      "--reporter=json",
      `--outputFile=${outputFile}`,
    ]);
    let output;
    try {
      output = JSON.parse(readFileSync(outputFile, "utf8"));
    } catch {
      fail(`workerd gate run ${String(attempt)} produced no JSON reporter output`);
    }
    const gateFile = output.testResults.find((file) => file.name.replaceAll("\\", "/").endsWith(GATE_TEST));
    const carrier = gateFile?.assertionResults.find((test) => test.meta?.corpusReport !== undefined);
    if (carrier === undefined) fail(`workerd gate run ${String(attempt)} attached no corpus report`);
    const report = carrier.meta.corpusReport;
    const { totals } = report;
    console.log(
      `corpus gate: run ${String(attempt)} executed ${String(totals.cases)} cases / ${String(totals.assertions)} assertions under ${report.runtime}: passed ${String(totals.passed)}, failed ${String(totals.failed)}, not executed ${String(totals.notExecuted)}, declared ${String(totals.declared)}`,
    );
    if (gate.status !== 0 && !writeReport) fail(`workerd gate run ${String(attempt)} did not pass`);
    if (totals.failed !== 0 || totals.notExecuted !== 0 || totals.declared !== 0) {
      fail(`workerd gate run ${String(attempt)} is not complete (see the failures above)`);
    }
    if (totals.cases === 0 || totals.assertions === 0) fail("the corpus executed nothing");
    // In --write-report mode the only permitted failure is the drift test.
    if (gate.status !== 0 && writeReport) {
      const failing = (gateFile?.assertionResults ?? []).filter((test) => test.status === "failed");
      const onlyDrift =
        failing.length > 0 &&
        failing.every((test) => test.title.includes("committed machine-readable report"));
      if (!onlyDrift) fail(`workerd gate run ${String(attempt)} failed on something other than report drift`);
    }
    reports.push(serialize(report));
  }
  if (reports[0] !== reports[1]) {
    fail("two separate workerd processes produced different corpus reports; the corpus is not deterministic");
  }
  console.log("corpus gate: two separate workerd processes produced byte-identical reports");

  // ------------------------------------------------------------------------
  // 4. Report drift, or write
  // ------------------------------------------------------------------------

  const executed = reports[0];
  if (writeReport) {
    writeFileSync(REPORT, executed, "utf8");
    console.log(
      `corpus gate: wrote tests/corpus/report.json from the execution (${String(executed.length)} bytes)`,
    );
    const format = run("format report", [
      join(ROOT, "node_modules", "prettier", "bin", "prettier.cjs"),
      "--write",
      "tests/corpus/report.json",
    ]);
    if (format.status !== 0) fail("prettier could not format the report");
    runNodeSuite();
  } else {
    let committedReport;
    try {
      committedReport = readFileSync(REPORT, "utf8");
    } catch {
      fail("tests/corpus/report.json is not committed; run `npm run test:corpus -- --write-report`");
    }
    if (serialize(JSON.parse(committedReport)) !== executed) {
      fail(
        "tests/corpus/report.json differs from this execution (the gate test above names the first field); if the change is intended, run `npm run test:corpus -- --write-report` and review the diff",
      );
    }
    console.log("corpus gate: committed report matches this execution");
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

console.log("corpus gate: PASSED");
