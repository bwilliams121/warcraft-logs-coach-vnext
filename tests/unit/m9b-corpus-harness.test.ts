import { describe, expect, it } from "vitest";

import { ASSERTION_KINDS, OWNING_LAYER_IDS } from "../support/corpus/contract.js";
import { committedCorpusFiles, MANIFEST_PATH } from "../support/corpus/loader.js";
import {
  describeFailures,
  runCorpusHarness,
  type AssertionExecutor,
  type HarnessResult,
} from "../support/corpus/harness.js";

/**
 * The regression-corpus harness over the committed corpus under plain Node,
 * and the harness's own contract: what it selects, what it refuses, what it
 * reports, and that it cannot look away.
 *
 * RUNTIME BOUNDARY
 *
 * This file runs as the `node` Vitest project. PUBLIC_CONTRACT cases drive the
 * real Worker and MCP handler and need workerd, so this file never selects
 * them: the layers it runs are the ones whose kinds declare `runtime: "ANY"`,
 * and the harness's refusal to select a WORKERD case under Node is asserted
 * here as a SELECTION failure — never as an executed result. The complete
 * corpus, PUBLIC_CONTRACT included, is `tests/regression/m9b-corpus-gate.test.ts`
 * in the `workers` project.
 */

const NODE = { runtime: "NODE" } as const;

/** Layers whose every registered kind runs under plain Node. */
const NODE_LAYERS = OWNING_LAYER_IDS.filter((layer) => {
  const kinds = Object.values(ASSERTION_KINDS).filter((def) => def.owningLayer === layer);
  return kinds.length > 0 && kinds.every((def) => def.runtime === "ANY");
});

async function layer(
  owningLayer: (typeof OWNING_LAYER_IDS)[number],
): Promise<Extract<HarnessResult, { ok: true }>> {
  const result = await runCorpusHarness({ kind: "LAYER", owningLayer }, NODE);
  if (!result.ok) throw new Error(describeFailures(result));
  return result;
}

describe("every Node-executable layer of the corpus executes clean", () => {
  it("names the Node-executable layers from the registry, not from a list", () => {
    expect(NODE_LAYERS).toEqual([
      "WCL_TRANSPORT",
      "NORMALIZATION",
      "COMBAT_STATE",
      "SPEC_ASSASSINATION",
      "APPLICATION_SERVICE",
    ]);
  });

  it.each(NODE_LAYERS)(
    "%s passes every assertion of every case, with nothing left unexecuted",
    async (owningLayer) => {
      const result = await layer(owningLayer);

      expect(describeFailures(result)).toBe("");
      expect(result.summary.failed).toBe(0);
      expect(result.summary.notExecuted).toBe(0);
      expect(result.complete).toBe(true);
      expect(result.runtime).toBe("NODE");
    },
  );

  it("declares nothing anywhere in the corpus", async () => {
    const result = await layer("NORMALIZATION");
    expect(result.declaredInCorpus).toBe(0);
  });

  it("is deterministic across runs", async () => {
    const first = await layer("COMBAT_STATE");
    const second = await layer("COMBAT_STATE");

    expect(JSON.stringify(second.results)).toBe(JSON.stringify(first.results));
    expect(second.summary).toEqual(first.summary);
  });

  it("addresses every result stably by case id and assertion ordinal", async () => {
    const result = await layer("NORMALIZATION");
    const coordinates = result.results.map((entry) => `${entry.caseId}#${String(entry.assertionOrdinal)}`);

    expect(new Set(coordinates).size).toBe(coordinates.length);
    expect(coordinates).toEqual([...coordinates].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });
});

describe("the runtime boundary is a selection decision, never a result", () => {
  it("refuses to select a PUBLIC_CONTRACT case under Node, naming the case and the runtime it needs", async () => {
    const result = await runCorpusHarness({ kind: "LAYER", owningLayer: "PUBLIC_CONTRACT" }, NODE);

    expect(result.ok).toBe(false);
    if (result.ok || result.stage !== "SELECTION") throw new Error("expected a selection refusal");
    expect(result.detail).toContain("NODE runtime cannot execute");
    expect(result.detail).toContain("workers project");
    expect(result.detail).toContain("PUBLIC_CONTRACT.REST_MCP_PARITY");
    expect(result.detail).toContain("public-contract.analysis-parity-over-the-d2-corpus");
  });

  it("refuses ALL under Node for the same reason, and executes nothing", async () => {
    // Not a partial run with the workerd cases missing: the caller asked for
    // everything, and Node cannot give it. Coverage totals only ever come from
    // a runtime that could execute what was selected.
    let executions = 0;
    const counting: AssertionExecutor = async () => {
      executions += 1;
      return { ok: true };
    };
    const result = await runCorpusHarness({ kind: "ALL" }, { runtime: "NODE", execute: counting });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe("SELECTION");
    expect(executions).toBe(0);
  });

  it("selects a single Node-executable case under Node without complaint", async () => {
    const result = await runCorpusHarness(
      { kind: "CASE", caseId: "normalization.no-actor-sentinel.source-absence" },
      NODE,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.cases).toBe(1);
    expect(result.complete).toBe(true);
  });
});

describe("executor exceptions are FAILED results, never passes and never crashes", () => {
  it("reports an injected throwing executor as FAILED with the throw as its detail", async () => {
    // A test double, not a missing runtime API: the harness's own handling is
    // what is under test, independent of any environment.
    const throwing: AssertionExecutor = async (_corpus, kase, assertion) => {
      throw new Error(`boom in ${kase.record.caseId} #${assertion.kind}`);
    };
    const result = await runCorpusHarness(
      { kind: "CASE", caseId: "normalization.no-actor-sentinel.source-absence" },
      { runtime: "NODE", execute: throwing },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.complete).toBe(false);
    expect(result.results.length).toBeGreaterThan(0);
    for (const entry of result.results) {
      expect(entry.status).toBe("FAILED");
      expect(entry.detail).toContain(
        "executor threw: boom in normalization.no-actor-sentinel.source-absence",
      );
    }
    expect(result.summary.failed).toBe(result.results.length);
    expect(result.summary.passed).toBe(0);
  });

  it("keeps running the remaining assertions after one throws", async () => {
    let calls = 0;
    const flaky: AssertionExecutor = async () => {
      calls += 1;
      if (calls === 1) throw new Error("first one throws");
      return { ok: true };
    };
    const result = await runCorpusHarness(
      { kind: "CASE", caseId: "normalization.no-actor-sentinel.source-absence" },
      { runtime: "NODE", execute: flaky },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.failed).toBe(1);
    expect(result.summary.passed).toBe(result.results.length - 1);
    expect(result.results[0]?.status).toBe("FAILED");
  });

  it("reports an executor answering DECLARED for an EXECUTABLE kind as NOT_EXECUTED, never a pass", async () => {
    const declaring: AssertionExecutor = async () => ({ ok: "DECLARED" });
    const result = await runCorpusHarness(
      { kind: "CASE", caseId: "normalization.no-actor-sentinel.source-absence" },
      { runtime: "NODE", execute: declaring },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.complete).toBe(false);
    expect(result.summary.notExecuted).toBe(result.results.length);
    expect(result.summary.passed).toBe(0);
  });
});

describe("selection", () => {
  it("runs every case of one layer and no other", async () => {
    const result = await runCorpusHarness({ kind: "LAYER", owningLayer: "COMBAT_STATE" }, NODE);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.summary.cases).toBeGreaterThan(0);
    expect(result.results.every((entry) => entry.owningLayer === "COMBAT_STATE")).toBe(true);
    expect(result.summary.byLayer.map((layer) => layer.owningLayer)).toEqual(["COMBAT_STATE"]);
  });

  it("validates without executing", async () => {
    const result = await runCorpusHarness({ kind: "VALIDATE_ONLY" }, NODE);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.results).toEqual([]);
    expect(result.summary.cases).toBe(0);
    expect(result.complete).toBe(true);
  });

  it("refuses an unknown case id rather than reporting an empty pass", async () => {
    const result = await runCorpusHarness({ kind: "CASE", caseId: "no.such-case" }, NODE);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe("SELECTION");
  });

  it("refuses a layer with no cases rather than reporting an empty pass", async () => {
    // Every layer owns a case since M9-C, so the empty layer is constructed:
    // the committed manifest with its two APPLICATION_SERVICE cases removed.
    const files = { ...committedCorpusFiles() };
    const manifest = JSON.parse(files[MANIFEST_PATH] ?? "{}") as { cases: { owningLayer: string }[] };
    manifest.cases = manifest.cases.filter((entry) => entry.owningLayer !== "APPLICATION_SERVICE");
    files[MANIFEST_PATH] = JSON.stringify(manifest);
    const result = await runCorpusHarness({ kind: "LAYER", owningLayer: "APPLICATION_SERVICE" }, NODE, files);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.stage).toBe("SELECTION");
  });
});

describe("the harness does not execute an invalid corpus", () => {
  it("stops at validation and executes nothing when the manifest is broken", async () => {
    const files = { ...committedCorpusFiles() };
    const manifest = JSON.parse(files[MANIFEST_PATH] ?? "{}") as { artifacts: { sha256: string }[] };
    const first = manifest.artifacts[0];
    if (first === undefined) throw new Error("no artifacts");
    first.sha256 = "0".repeat(64);
    files[MANIFEST_PATH] = JSON.stringify(manifest);

    let executions = 0;
    const counting: AssertionExecutor = async () => {
      executions += 1;
      return { ok: true };
    };
    const result = await runCorpusHarness({ kind: "ALL" }, { runtime: "WORKERD", execute: counting }, files);

    expect(result.ok).toBe(false);
    if (result.ok || result.stage !== "VALIDATION") throw new Error("expected a validation failure");
    expect(result.errors.map((error) => error.code)).toContain("ARTIFACT_DIGEST_MISMATCH");
    expect(executions).toBe(0);
  });
});
