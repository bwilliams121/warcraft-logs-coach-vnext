/**
 * M10-C4 CI correction: the Protection Paladin corpus layer performs a BOUNDED,
 * EXACT amount of real work per run — one registration analysis per distinct
 * analysis input — and nothing survives the run.
 *
 * Before this correction every one of the layer's analysis-reading assertions
 * re-ran the real evaluator over byte-identical input: thirty-six analyses for
 * two distinct inputs, ten seconds in isolation and past the layer's timeout
 * under a loaded CI runner. The fix is the run-scoped `CorpusExecutionContext`
 * memo, and this file pins what it may and may not do:
 *
 *   - real analysis runs exactly once per distinct input per run;
 *   - every assertion still executes against that result;
 *   - the opener and its gap derivative are distinct inputs;
 *   - two runs share nothing and each performs the real work again;
 *   - the memoized value is frozen, so no assertion can change what the next
 *     one reads;
 *   - the context is created per run, never module state.
 */

import { describe, expect, it } from "vitest";

import {
  createExecutionContext,
  deepFreezePlainData,
  type CorpusExecutionContext,
} from "../support/corpus/execution-context.js";
import { executeAssertion } from "../support/corpus/executors.js";
import { describeFailures, runCorpusHarness, type AssertionExecutor } from "../support/corpus/harness.js";
import { committedCorpusFiles, loadCorpusOrThrow } from "../support/corpus/loader.js";

const LAYER = "SPEC_PROTECTION_PALADIN" as const;
const DERIVATION = "PROTECTION_PALADIN_REGISTRATION.analyze";

/**
 * The layer's kinds whose executor reads the registration's analysis. The two
 * others — SPEC_GATE drives the facade's refusal of a foreign spec, and
 * USE_ITEMS_SUB_ACTION_SET reads the combatant snapshot directly — never
 * analyze the actor and never touch the memo.
 */
const ANALYZING_KINDS = new Set([
  "SPEC_PROTECTION_PALADIN.AUTHORITY_PROVENANCE",
  "SPEC_PROTECTION_PALADIN.DECISION_COVERAGE",
  "SPEC_PROTECTION_PALADIN.COVERAGE_SUMMARY",
  "SPEC_PROTECTION_PALADIN.HOLY_POWER_OBSERVATION",
  "SPEC_PROTECTION_PALADIN.HOLY_POWER_NOT_OBSERVED",
  "SPEC_PROTECTION_PALADIN.DOMAIN_RESULT",
  "SPEC_PROTECTION_PALADIN.BUILD_RESOLUTION",
  "SPEC_PROTECTION_PALADIN.RESOLVED_ATOM",
  "SPEC_PROTECTION_PALADIN.NOT_PUBLICLY_PROJECTABLE",
]);

/** What the committed manifest says the layer will ask the memo for. */
async function expectedWork() {
  const corpus = await loadCorpusOrThrow(committedCorpusFiles());
  const cases = corpus.cases.filter((entry) => entry.record.owningLayer === LAYER);
  const inputs = new Map<string, number>();
  let analyzingAssertions = 0;
  for (const kase of cases) {
    for (const assertion of kase.assertions) {
      if (!ANALYZING_KINDS.has(assertion.kind)) continue;
      analyzingAssertions += 1;
      const params = assertion.params as { actorId: number; targetActorId?: number | null };
      const input = JSON.stringify({
        artifactId: kase.artifact.record.artifactId,
        actorId: params.actorId,
        targetActorId: params.targetActorId ?? null,
      });
      inputs.set(input, (inputs.get(input) ?? 0) + 1);
    }
  }
  return { cases, inputs, analyzingAssertions };
}

/** Runs the layer with the real dispatcher, capturing the context the harness created. */
async function runLayerCapturingContext() {
  const contexts = new Set<CorpusExecutionContext>();
  const execute: AssertionExecutor = async (corpus, kase, assertion, context) => {
    contexts.add(context);
    return executeAssertion(corpus, kase, assertion, context);
  };
  const result = await runCorpusHarness({ kind: "LAYER", owningLayer: LAYER }, { runtime: "NODE", execute });
  if (!result.ok) throw new Error(describeFailures(result));
  return { result, contexts };
}

describe("the Protection Paladin layer performs exactly one real analysis per distinct input per run", () => {
  it("analyzes each distinct (artifact, actor, target) input once and serves every other assertion from it", async () => {
    const expected = await expectedWork();
    const { result, contexts } = await runLayerCapturingContext();

    // Every assertion executed; nothing skipped, nothing declared.
    expect(result.summary.cases).toBe(expected.cases.length);
    expect(result.summary.passed).toBe(result.summary.assertions);
    expect(result.summary.failed).toBe(0);
    expect(result.summary.notExecuted).toBe(0);

    // One context for the whole run, handed to every assertion.
    expect(contexts.size).toBe(1);
    const [context] = contexts;
    if (context === undefined) throw new Error("no context");
    const stats = context.memo.stats().filter((stat) => stat.key.includes(DERIVATION));

    // Exactly as many real analyses as distinct inputs, each computed once —
    // and the manifest says there are two: the opener and its gap derivative.
    expect(expected.inputs.size).toBe(2);
    expect(stats.length).toBe(expected.inputs.size);
    for (const stat of stats) expect(stat.computed, stat.key).toBe(1);

    // Every analysis-reading assertion was served, and none re-ran the evaluator.
    const served = stats.reduce((sum, stat) => sum + stat.served, 0);
    const computed = stats.reduce((sum, stat) => sum + stat.computed, 0);
    expect(computed + served).toBe(expected.analyzingAssertions);
    expect(expected.analyzingAssertions).toBeGreaterThan(computed);

    // Per input: the manifest's count of assertions over that input equals
    // computed + served for the key naming that artifact.
    for (const [input, count] of expected.inputs) {
      const { artifactId } = JSON.parse(input) as { artifactId: string };
      const stat = stats.find((candidate) => {
        const key = JSON.parse(candidate.key) as { artifactId: string };
        return key.artifactId === artifactId;
      });
      expect(stat, artifactId).toBeDefined();
      expect((stat?.computed ?? 0) + (stat?.served ?? 0), artifactId).toBe(count);
    }
  });

  it("keys the memo by every analysis input, so the opener and its gap derivative never collide", async () => {
    const { contexts } = await runLayerCapturingContext();
    const [context] = contexts;
    if (context === undefined) throw new Error("no context");
    const keys = context.memo
      .stats()
      .filter((stat) => stat.key.includes(DERIVATION))
      .map((stat) => JSON.parse(stat.key) as Record<string, unknown>);

    expect(keys.map((key) => key["artifactId"]).sort()).toEqual([
      "wcl-protection-paladin-a7r6-opener",
      "wcl-protection-paladin-a7r6-opener.gap-before-2010000",
    ]);
    for (const key of keys) {
      expect(Object.keys(key).sort()).toEqual(
        [
          "derivation",
          "analyzerId",
          "artifactId",
          "artifactSha256",
          "provenance",
          "actorId",
          "specId",
          "targetActorId",
        ].sort(),
      );
      expect(key["artifactSha256"]).toMatch(/^[0-9a-f]{64}$/);
      expect(key["specId"]).toBe("paladin/protection");
    }
    const digests = new Set(keys.map((key) => key["artifactSha256"]));
    expect(digests.size).toBe(keys.length);
  });

  it("shares nothing between runs: a second run gets its own context and performs the real work again", async () => {
    const first = await runLayerCapturingContext();
    const second = await runLayerCapturingContext();
    const [firstContext] = first.contexts;
    const [secondContext] = second.contexts;
    if (firstContext === undefined || secondContext === undefined) throw new Error("no context");

    expect(secondContext).not.toBe(firstContext);
    const computedIn = (context: CorpusExecutionContext) =>
      context.memo
        .stats()
        .filter((stat) => stat.key.includes(DERIVATION))
        .reduce((sum, stat) => sum + stat.computed, 0);
    expect(computedIn(firstContext)).toBe(2);
    expect(computedIn(secondContext)).toBe(2);
    expect(JSON.stringify(second.result.results)).toBe(JSON.stringify(first.result.results));
    expect(second.result.summary).toEqual(first.result.summary);
  });
});

describe("the execution context itself", () => {
  it("computes once per key, serves frozen, and accounts deterministically", () => {
    const context = createExecutionContext();
    let computations = 0;
    const compute = () => {
      computations += 1;
      return { nested: { list: [1, 2, 3] }, value: computations };
    };

    const first = context.memo.once("k", compute);
    const second = context.memo.once("k", compute);
    const other = context.memo.once("other", compute);

    expect(computations).toBe(2);
    expect(second).toBe(first);
    expect(other).not.toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.nested)).toBe(true);
    expect(Object.isFrozen(first.nested.list)).toBe(true);
    expect(() => {
      (first as { value: number }).value = 99;
    }).toThrow(TypeError);
    expect(context.memo.stats()).toEqual([
      { key: "k", computed: 1, served: 1 },
      { key: "other", computed: 1, served: 0 },
    ]);
  });

  it("is never module state: two contexts know nothing of each other", () => {
    const a = createExecutionContext();
    const b = createExecutionContext();
    let computations = 0;
    a.memo.once("k", () => (computations += 1));
    b.memo.once("k", () => (computations += 1));
    expect(computations).toBe(2);
    expect(a.memo.stats()).toEqual([{ key: "k", computed: 1, served: 0 }]);
    expect(b.memo.stats()).toEqual([{ key: "k", computed: 1, served: 0 }]);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.memo)).toBe(true);
  });

  it("freezes plain data only, and leaves what freezing could not make immutable alone", () => {
    class Box {
      value = 1;
    }
    const map = new Map<string, number>([["a", 1]]);
    const data = deepFreezePlainData({ box: new Box(), map, plain: { deep: [{ x: 1 }] } });

    expect(Object.isFrozen(data)).toBe(true);
    expect(Object.isFrozen(data.plain.deep[0])).toBe(true);
    expect(Object.isFrozen(data.box)).toBe(false);
    expect(Object.isFrozen(data.map)).toBe(false);
    map.set("b", 2);
    expect(map.size).toBe(2);
  });
});
