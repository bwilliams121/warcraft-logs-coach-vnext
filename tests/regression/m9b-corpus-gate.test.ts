import { describe, expect, it } from "vitest";

import { OWNING_LAYER_IDS } from "../support/corpus/contract.js";
import { describeFailures, runCorpusHarness } from "../support/corpus/harness.js";

/**
 * THE COMPLETE-CORPUS GATE.
 *
 * Every case of every layer, executed inside real workerd, with zero FAILED and
 * zero NOT_EXECUTED. This is the one run that includes PUBLIC_CONTRACT parity —
 * the real Worker and MCP handler over the D2 corpus — which needs the Workers
 * runtime for its bearer-auth primitive and cannot run under plain Node.
 *
 * M9-C wires this into a dedicated CI command. Until then it runs as part of
 * `npm test`, and a regression anywhere in M3–M8 that the corpus can see fails
 * here with the case, artifact, layer, kind, expected and actual results.
 */

describe("the committed corpus executes clean under workerd", () => {
  it("passes every assertion of every case, in every layer", async () => {
    const result = await runCorpusHarness({ kind: "ALL" }, { runtime: "WORKERD" });
    if (!result.ok) throw new Error(describeFailures(result));

    expect(describeFailures(result)).toBe("");
    expect(result.summary.failed).toBe(0);
    expect(result.summary.notExecuted).toBe(0);
    expect(result.complete).toBe(true);
    expect(result.declaredInCorpus).toBe(0);
    expect(result.runtime).toBe("WORKERD");
    // All 31 cases and all 74 assertions, executed here and nowhere else.
    expect(result.summary.cases).toBe(31);
    expect(result.summary.assertions).toBe(74);
    expect(result.summary.passed).toBe(74);
  });

  it("covers every layer that owns a corpus case, and names the one that does not", async () => {
    const result = await runCorpusHarness({ kind: "ALL" }, { runtime: "WORKERD" });
    if (!result.ok) throw new Error(describeFailures(result));
    const covered = result.summary.byLayer
      .filter((layer) => layer.cases > 0)
      .map((layer) => layer.owningLayer);

    // APPLICATION_SERVICE has no corpus case yet: its contracts are exercised
    // through PUBLIC_CONTRACT parity, which composes the services, and through
    // the existing service tests. Recorded here so the gap is a decision.
    expect(covered).toEqual(OWNING_LAYER_IDS.filter((layer) => layer !== "APPLICATION_SERVICE"));
  });

  it("is deterministic across runs", async () => {
    const first = await runCorpusHarness({ kind: "ALL" }, { runtime: "WORKERD" });
    const second = await runCorpusHarness({ kind: "ALL" }, { runtime: "WORKERD" });

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
