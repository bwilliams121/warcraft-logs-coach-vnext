import { describe, expect, it } from "vitest";

import { describeFailures, runCorpusHarness, type HarnessResult } from "../support/corpus/harness.js";
import { committedCorpusFiles, loadCorpusOrThrow } from "../support/corpus/loader.js";
import {
  canonicalize,
  committedMachineReport,
  machineReport,
  reportDrift,
  serializeMachineReport,
  type MachineReport,
} from "../support/corpus/machine-report.js";
import { KNOWN_EVIDENCE_GAPS } from "../support/corpus/report.js";

/**
 * The machine-readable report is derived from an execution and must be the
 * same document whoever derives it, wherever, however many times. These tests
 * pin that on a Node run of the Node-executable layers; the workerd gate pins
 * the complete run against the committed report.
 */

async function nodeRun(): Promise<Extract<HarnessResult, { ok: true }>> {
  const result = await runCorpusHarness({ kind: "LAYER", owningLayer: "NORMALIZATION" }, { runtime: "NODE" });
  if (!result.ok) throw new Error(describeFailures(result));
  return result;
}

describe("the machine-readable report", () => {
  it("serialises identically from two independent executions", async () => {
    const corpus = await loadCorpusOrThrow(committedCorpusFiles());
    const first = serializeMachineReport(machineReport(await nodeRun(), corpus));
    const second = serializeMachineReport(machineReport(await nodeRun(), corpus));

    expect(second).toBe(first);
  });

  it("carries no timestamp, duration, random id, absolute path or environment value", async () => {
    const corpus = await loadCorpusOrThrow(committedCorpusFiles());
    const text = serializeMachineReport(machineReport(await nodeRun(), corpus));

    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}/);
    expect(text).not.toMatch(/"duration|"elapsed|"startedAt|"timestamp"/i);
    expect(text).not.toMatch(/[A-Za-z]:\\\\|\/home\/|\/Users\/|\/tmp\//);
    expect(text).not.toMatch(/fake-client|fake-analysis|client_secret|bearer /i);
    expect(text).not.toMatch(/"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"/);
  });

  it("marks a case the selection did not run NOT_EXECUTED, never PASSED", async () => {
    const corpus = await loadCorpusOrThrow(committedCorpusFiles());
    const report = machineReport(await nodeRun(), corpus);
    const statuses = new Map<string, Set<string>>();
    for (const entry of report.cases) {
      statuses.set(entry.owningLayer, new Set(entry.assertions.map((assertion) => assertion.status)));
    }

    expect(statuses.get("NORMALIZATION")).toEqual(new Set(["PASSED"]));
    expect(statuses.get("PUBLIC_CONTRACT")).toEqual(new Set(["NOT_EXECUTED"]));
    expect(report.totals.cases).toBe(report.byLayer.find((l) => l.owningLayer === "NORMALIZATION")?.cases);
  });

  it("orders keys canonically so serialiser order cannot leak", () => {
    expect(JSON.stringify(canonicalize({ b: [{ z: 1, a: 2 }], a: null }))).toBe(
      '{"a":null,"b":[{"a":2,"z":1}]}',
    );
  });

  it("names the first drifting field with both values", () => {
    const base = {
      totals: { cases: 42, passed: 100 },
      cases: [{ caseId: "x", assertions: [{ status: "PASSED" }] }],
    };
    const changed = { totals: { cases: 42, passed: 99 }, cases: base.cases };
    const missing = { totals: { cases: 42, passed: 100 }, cases: [] };
    const statusFlip = {
      totals: base.totals,
      cases: [{ caseId: "x", assertions: [{ status: "FAILED" }] }],
    };

    expect(reportDrift(base, base)).toBeNull();
    expect(reportDrift(base, changed)).toBe("report.totals.passed: committed 100, this run 99");
    expect(reportDrift(base, missing)).toBe("report.cases: committed has 1 entries, this run has 0");
    expect(reportDrift(base, statusFlip)).toBe(
      'report.cases[0].assertions[0].status: committed "PASSED", this run "FAILED"',
    );
    expect(reportDrift({ a: 1 }, { a: 1, b: 2 })).toBe("report.b: absent from the committed report");
  });

  it("the committed report is the complete workerd run, with every gap disposition it was written with", () => {
    const committed = committedMachineReport() as MachineReport;

    expect(committed.runtime).toBe("WORKERD");
    expect(committed.selection).toBe("ALL");
    expect(committed.totals.failed).toBe(0);
    expect(committed.totals.notExecuted).toBe(0);
    expect(committed.totals.declared).toBe(0);
    expect(committed.totals.passed).toBe(committed.totals.assertions);
    expect(committed.cases.flatMap((c) => c.assertions.map((a) => a.status))).toEqual(
      Array.from({ length: committed.totals.assertions }, () => "PASSED"),
    );
    expect(committed.gaps.map((gap) => [gap.id, gap.disposition])).toEqual(
      KNOWN_EVIDENCE_GAPS.map((gap) => [gap.id, gap.disposition]),
    );
    // The committed digests are the manifest's; a re-sliced artifact shows here too.
    expect(committed.artifacts.map((a) => a.sha256).every((sha) => /^[0-9a-f]{64}$/.test(sha))).toBe(true);
  });
});
