import { describe, expect, it } from "vitest";

import { executeAssertion } from "../support/corpus/executors.js";
import { committedCorpusFiles, loadCorpusOrThrow } from "../support/corpus/loader.js";

/**
 * The corpus loads and executes inside real workerd, exactly as it does under
 * plain Node.
 *
 * WHY THIS MATTERS BEFORE M9-B
 *
 * The transport-parity assertions M9-B will make — REST and MCP projections of
 * one analysis over one artifact — can only run in the `workers` project,
 * because that is where the real Worker is. A loader that needed `node:fs` or
 * `node:crypto` would confine the corpus to the `node` project and force a
 * second, parallel loader for parity. Binding the files at build time and
 * hashing with Web Crypto is what avoids that, and this test is the proof
 * rather than the intention.
 *
 * The digests below are recomputed by workerd's `crypto.subtle`. If the
 * runtime's SHA-256 ever disagreed with Node's, this would fail rather than
 * silently accept a different identity for the same bytes.
 */

describe("the committed corpus under workerd", () => {
  it("loads with zero errors and the same enumeration as under Node", async () => {
    const corpus = await loadCorpusOrThrow(committedCorpusFiles());

    expect(corpus.artifacts.map((entry) => entry.record.artifactId)).toEqual([
      "wcl-events.cast-resource-pre-cost",
      "wcl-events.no-actor-sentinel-source",
      "wcl-events.no-actor-sentinel-source.unusable-negative",
      "wcl-events.synthetic-unsupported-type",
      "wcl-graphql.event-page-null-data",
    ]);
    expect(corpus.coverage.declared).toBe(0);
  });

  it("executes every seed assertion against the real layers", async () => {
    const corpus = await loadCorpusOrThrow(committedCorpusFiles());
    const failures: string[] = [];

    for (const kase of corpus.cases) {
      for (const assertion of kase.assertions) {
        const outcome = executeAssertion(corpus, kase, assertion);
        if (outcome.ok === false)
          failures.push(`${kase.record.caseId} / ${assertion.kind}: ${outcome.detail}`);
      }
    }

    expect(failures).toEqual([]);
  });
});
