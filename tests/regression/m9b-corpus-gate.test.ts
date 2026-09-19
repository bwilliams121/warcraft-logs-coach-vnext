import { describe, expect, it } from "vitest";

import { OWNING_LAYER_IDS } from "../support/corpus/contract.js";
import { describeFailures, runCorpusHarness, type HarnessResult } from "../support/corpus/harness.js";
import { committedCorpusFiles, loadCorpusOrThrow } from "../support/corpus/loader.js";
import {
  committedMachineReport,
  machineReport,
  reportDrift,
  serializeMachineReport,
} from "../support/corpus/machine-report.js";

/**
 * THE COMPLETE-CORPUS GATE.
 *
 * Every case of every layer, executed inside real workerd, with zero FAILED and
 * zero NOT_EXECUTED. This is the one run that includes PUBLIC_CONTRACT parity —
 * the real Worker and MCP handler over the D2 corpus — which needs the Workers
 * runtime for its bearer-auth primitive and cannot run under plain Node.
 *
 * `npm run test:corpus` (scripts/corpus/gate.mjs) runs this file in its own
 * vitest process, twice, and reads the machine-readable report each run
 * attaches to its task metadata: that is how the report reaches disk without
 * the corpus machinery ever touching a filesystem, and how two separate
 * processes are shown to produce one identical document. It also runs as part
 * of `npm test`, so a regression anywhere in M3–M8 that the corpus can see
 * fails here with the case, artifact, layer, kind, expected and actual results.
 */

async function runAll(): Promise<Extract<HarnessResult, { ok: true }>> {
  const result = await runCorpusHarness({ kind: "ALL" }, { runtime: "WORKERD" });
  if (!result.ok) throw new Error(describeFailures(result));
  return result;
}

// One ALL run drives six REST+MCP parity cases besides the rest; two of them
// back to back under a loaded full-suite run exceed the default 5 s.
const GATE_TIMEOUT_MS = 60_000;

describe("the committed corpus executes clean under workerd", { timeout: GATE_TIMEOUT_MS }, () => {
  it("passes every assertion of every case, in every layer", async ({ task }) => {
    const result = await runAll();
    // The report of THIS execution, for scripts/corpus/gate.mjs to collect.
    // Attached before any assertion so a failing run still reports what it ran.
    task.meta.corpusReport = machineReport(result, await loadCorpusOrThrow(committedCorpusFiles()));

    expect(describeFailures(result)).toBe("");
    expect(result.summary.failed).toBe(0);
    expect(result.summary.notExecuted).toBe(0);
    expect(result.complete).toBe(true);
    expect(result.declaredInCorpus).toBe(0);
    expect(result.runtime).toBe("WORKERD");
    // Every case and every assertion, executed here and nowhere else. 31/74
    // at M9-B; M9-C added twelve cases and twenty-seven assertions; the M9-C
    // correction's second Assassination subject added eleven cases and
    // forty-one assertions; M10-B's Protection Paladin evidence added twenty
    // cases and forty-seven assertions; M10-C's internal Protection Paladin
    // evaluator added twelve cases and thirty-nine assertions; the M10-C
    // correction's SHARED_DECISION_ENGINE layer added three cases and three
    // assertions; M10-C2 added the measured use_items sub-action-set case;
    // M10-C5 Phase A added the 45-second rotational slice and its gap
    // derivative with seven cases and thirty assertions; M10-C5 Phase B2
    // added the four steady-state segments, the bundle compositions and the
    // evaluator over the composed 165 s fight: twelve cases and seventy-three
    // assertions; M10-D's public Protection integration added three cases
    // and four assertions (the Arms Warrior through the service and both
    // transports, the mixed-roster raid night, and actor 4's identity) and
    // repurposed four cases in place; M11-A4 added the four Retribution
    // Paladin slices and sixteen cases with sixty-eight assertions (the
    // INTERNAL_ONLY analyzer through its registration, the bundle, the
    // exact-zero stack proofs, the domain boundary, the public refusal on
    // the same subject); M11-A5's public Retribution promotion added three
    // cases and three assertions over the same slices (the public
    // projection with the slice boundary named, REST/MCP parity for the
    // subject, a mixed raid night over its own evidence) and repurposed the
    // application-service case in place; M11-B1's generic run_action_list
    // control flow added one SYNTHETIC authority artifact and seven
    // SHARED_DECISION_ENGINE cases with seven assertions (FALSE skip, TRUE
    // transfer, child NO_ACTION, the call contrast, the undecided gate, a
    // nested run, a run cycle); M11-B2's INTERNAL_ONLY Blood Death Knight
    // measurement slice added four SANITIZED_CAPTURE slices of the same three
    // captures and sixteen cases with ninety-four assertions (four
    // normalization, one bundle composition, ten evaluator — the stopping
    // points, the dispatch trace, the exact Bone Shield counts, the resource
    // observations, the domains — and the public refusal on the same subject
    // beside its internal registration); M11-B3's decimal literals moved the
    // Blood stopping points from syntax to state and re-pinned those cases
    // in place, adding one dispatch-trace assertion for the sanlayn list
    // entered outside the Gift window; M11-B4's buff remainders re-pinned the
    // Blood cases again (21 of 123 now resolve) and added twenty assertions:
    // eighteen remains bindings at the pinned decisions and the two remains
    // evidence censuses. Measured, then pinned.
    expect(result.summary.cases).toBe(154);
    expect(result.summary.assertions).toBe(532);
    expect(result.summary.passed).toBe(532);
  });

  it("covers every layer", async () => {
    const result = await runAll();
    const covered = result.summary.byLayer
      .filter((layer) => layer.cases > 0)
      .map((layer) => layer.owningLayer);

    // APPLICATION_SERVICE gained its own cases in M9-C; no layer is exercised
    // only through another layer's composition any more.
    expect(covered).toEqual([...OWNING_LAYER_IDS]);
  });

  it("is deterministic across runs", async () => {
    const first = await runCorpusHarness({ kind: "ALL" }, { runtime: "WORKERD" });
    const second = await runCorpusHarness({ kind: "ALL" }, { runtime: "WORKERD" });

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it("matches the committed machine-readable report, field for field", async () => {
    // DRIFT CHECK. tests/corpus/report.json was written from an execution by
    // `npm run test:corpus -- --write-report`; if this run says anything
    // different — a total, a status, a digest, a gap disposition — the
    // committed report is stale and the message names the first field.
    const corpus = await loadCorpusOrThrow(committedCorpusFiles());
    const actual = machineReport(await runAll(), corpus);
    const committed = committedMachineReport();

    expect(reportDrift(committed, actual)).toBeNull();
    // And the serialisation the script writes is the one canonical form.
    expect(serializeMachineReport(actual)).toBe(serializeMachineReport(actual));
    expect(serializeMachineReport(actual)).not.toMatch(/\d{4}-\d{2}-\d{2}T|[A-Z]:\\\\|\/home\/|\/Users\//);
  });
});
