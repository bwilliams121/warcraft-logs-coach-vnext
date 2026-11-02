import { describe, expect, it } from "vitest";

import { describeFailures, type HarnessResult } from "../support/corpus/harness.js";
import {
  committedEvidenceReport,
  loadCommittedEvidenceArchive,
  runEvidenceArchiveHarness,
} from "../support/corpus/evidence-archive.js";
import { machineReport, reportDrift, serializeMachineReport } from "../support/corpus/machine-report.js";

/**
 * THE EVIDENCE-ARCHIVE GATE (M11-C4e).
 *
 * Every archive case, executed inside real workerd over the archive and the
 * regression corpus it depends on, with zero FAILED and zero NOT_EXECUTED.
 * `npm run test:evidence` (scripts/corpus/gate.mjs --root evidence) runs this
 * file in its own vitest process, twice, reads the machine-readable report
 * each run attaches to its task metadata, requires the two to be
 * byte-identical, and holds them against the committed
 * `tests/evidence/report.json`. That committed report is what the promotion
 * evidence gate reads for archive cases — and this is what re-proves it.
 *
 * The regression-corpus gate (`m9b-corpus-gate.test.ts`) never imports the
 * archive; this file is the archive's only executor.
 */

async function runAll(): Promise<Extract<HarnessResult, { ok: true }>> {
  const result = await runEvidenceArchiveHarness({ kind: "ALL" }, { runtime: "WORKERD" });
  if (!result.ok) throw new Error(describeFailures(result));
  return result;
}

async function archive() {
  const loaded = await loadCommittedEvidenceArchive();
  if (!loaded.ok)
    throw new Error(loaded.errors.map((error) => `[${error.code}] ${error.message}`).join("\n"));
  return loaded.archive;
}

const GATE_TIMEOUT_MS = 60_000;

describe("the committed evidence archive executes clean under workerd", { timeout: GATE_TIMEOUT_MS }, () => {
  it("passes every assertion of every archive case", async ({ task }) => {
    const result = await runAll();
    // The report of THIS execution, for scripts/corpus/gate.mjs to collect.
    task.meta.corpusReport = machineReport(result, await archive());

    expect(describeFailures(result)).toBe("");
    expect(result.summary.failed).toBe(0);
    expect(result.summary.notExecuted).toBe(0);
    expect(result.complete).toBe(true);
    expect(result.declaredInCorpus).toBe(0);
    expect(result.runtime).toBe("WORKERD");
    // M11-C4e: the Brewmaster full-fight evidence migrated from M11-C4b —
    // the 165 s–fight-end segment's census (five), the three-part cross-tier
    // composition (one), the full-fight coverage, distribution and state
    // census (three), and the first full-fight-segment MATCH over the
    // cross-tier bundle (one). Measured, then pinned.
    // M11-C4f added the neutral second subject's fixed 165 s window: the
    // 20–165 s segment census (five), the cross-root composition (one) and the
    // measurement — coverage, distribution and state census (three).
    // M11-C4i: plus the second subject's resolved REJECTED (one case, one assertion).
    // M12-B: plus one normalization census per friendly-players raid damage
    // segment (three cases, three assertions each).
    // M12-D: plus one normalization census per Restoration Shaman cast segment
    // (two cases, three assertions each).
    // M13-A: plus one normalization census per merged Augmentation support
    // segment (two cases, three assertions each).
    expect(result.summary.cases).toBe(16);
    expect(result.summary.assertions).toBe(42);
    expect(result.summary.passed).toBe(42);
  });

  it("is deterministic across runs", async () => {
    const first = await runEvidenceArchiveHarness({ kind: "ALL" }, { runtime: "WORKERD" });
    const second = await runEvidenceArchiveHarness({ kind: "ALL" }, { runtime: "WORKERD" });

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("matches the committed machine-readable report, field for field", async () => {
    // DRIFT CHECK, and the archive's fail-closed rule: an archive with no
    // committed report cannot be read by the promotion gate at all.
    const actual = machineReport(await runAll(), await archive());
    const committed = committedEvidenceReport();

    expect(committed, "tests/evidence/report.json is not committed").not.toBeNull();
    expect(reportDrift(committed, actual)).toBeNull();
    expect(serializeMachineReport(actual)).not.toMatch(/\d{4}-\d{2}-\d{2}T|[A-Z]:\\\\|\/home\/|\/Users\//);
  });
});
