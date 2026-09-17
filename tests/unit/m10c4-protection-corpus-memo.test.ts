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
 *   - the opener and its gap derivative are distinct inputs, and so are the
 *     M10-C5 Phase B2 bundle and its gap bundle (every part and every
 *     declared hole is in the key);
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
  "SPEC_PROTECTION_PALADIN.COOLDOWN_READINESS_AT",
  "SPEC_PROTECTION_PALADIN.AURA_BINDING_AT",
  "SPEC_PROTECTION_PALADIN.UNKNOWN_BLOCKER_DISTRIBUTION",
  "SPEC_PROTECTION_PALADIN.ARMAMENT_STATE_AT",
]);

interface BundleParams {
  readonly historyArtifactIds?: readonly string[];
  readonly declaredHoles?: readonly { fromReportTimeMs: number; toReportTimeMs: number }[];
}

/** The parts an assertion's analysis is over: its history, then its own artifact. */
function partsOf(artifactId: string, params: BundleParams): readonly string[] {
  return [...(params.historyArtifactIds ?? []), artifactId];
}

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
      const params = assertion.params as { actorId: number; targetActorId?: number | null } & BundleParams;
      const input = JSON.stringify({
        parts: partsOf(kase.artifact.record.artifactId, params),
        declaredHoles: params.declaredHoles ?? [],
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
  // Measured at M10-C5 Phase B2 in isolation: one layer run is ~2.8 s (six
  // real analyses, two of them over the composed 3,720-event fight), so the
  // two-run test below is ~5 s and the default 5 s per-test timeout is
  // inadequate for it. The same 20 s reading as the harness test's layer
  // block is used for this block: the work is still bounded and pinned to
  // exactly six analyses per run.
  const LAYER_TIMEOUT_MS = 20_000;

  it(
    "analyzes each distinct (artifact, actor, target) input once and serves every other assertion from it",
    async () => {
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
      // and the manifest says there are six: the opener, the M10-C5 45-second
      // slice, each one's gap derivative, the Phase B2 five-part bundle and its
      // three-part gap bundle.
      expect(expected.inputs.size).toBe(6);
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
        const { parts, declaredHoles } = JSON.parse(input) as { parts: string[]; declaredHoles: unknown[] };
        const stat = stats.find((candidate) => {
          const key = JSON.parse(candidate.key) as {
            parts: { artifactId: string }[];
            declaredHoles: unknown[];
          };
          return (
            JSON.stringify(key.parts.map((part) => part.artifactId)) === JSON.stringify(parts) &&
            JSON.stringify(key.declaredHoles) === JSON.stringify(declaredHoles)
          );
        });
        expect(stat, input).toBeDefined();
        expect((stat?.computed ?? 0) + (stat?.served ?? 0), input).toBe(count);
      }
    },
    LAYER_TIMEOUT_MS,
  );

  it(
    "keys the memo by every analysis input, so the opener and its gap derivative never collide",
    async () => {
      const { contexts } = await runLayerCapturingContext();
      const [context] = contexts;
      if (context === undefined) throw new Error("no context");
      const keys = context.memo
        .stats()
        .filter((stat) => stat.key.includes(DERIVATION))
        .map((stat) => JSON.parse(stat.key) as Record<string, unknown>);

      const partsOfKey = (key: Record<string, unknown>) =>
        (key["parts"] as { artifactId: string; artifactSha256: string }[]).map((part) => part.artifactId);
      const B2 = "wcl-protection-paladin-a7r6-rotational-165s";
      expect(keys.map((key) => partsOfKey(key).join(" > ")).sort()).toEqual(
        [
          "wcl-protection-paladin-a7r6-opener",
          "wcl-protection-paladin-a7r6-opener.gap-before-2010000",
          "wcl-protection-paladin-a7r6-rotational-45s",
          "wcl-protection-paladin-a7r6-rotational-45s.gap-before-2026589",
          `wcl-protection-paladin-a7r6-rotational-45s > ${B2}.seg-45-60 > ${B2}.seg-60-90 > ${B2}.seg-90-120 > ${B2}.seg-120-165`,
          `wcl-protection-paladin-a7r6-rotational-45s > ${B2}.seg-45-60 > ${B2}.seg-120-165`,
        ].sort(),
      );
      for (const key of keys) {
        expect(Object.keys(key).sort()).toEqual(
          ["derivation", "analyzerId", "parts", "declaredHoles", "actorId", "specId", "targetActorId"].sort(),
        );
        for (const part of key["parts"] as { artifactSha256: string; provenance: unknown }[]) {
          expect(part.artifactSha256).toMatch(/^[0-9a-f]{64}$/);
          expect(part.provenance).toBeDefined();
        }
        expect(key["specId"]).toBe("paladin/protection");
      }
      // Every key names a different set of digests (with its holes): the gap
      // bundle differs from the full bundle by the two parts it lacks.
      const identities = new Set(
        keys.map((key) =>
          JSON.stringify([
            (key["parts"] as { artifactSha256: string }[]).map((part) => part.artifactSha256),
            key["declaredHoles"],
          ]),
        ),
      );
      expect(identities.size).toBe(keys.length);
      const gapBundle = keys.find((key) => (key["declaredHoles"] as unknown[]).length === 1);
      expect(gapBundle?.["declaredHoles"]).toEqual([{ fromReportTimeMs: 2064590, toReportTimeMs: 2124589 }]);
    },
    LAYER_TIMEOUT_MS,
  );

  it(
    "shares nothing between runs: a second run gets its own context and performs the real work again",
    async () => {
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
      expect(computedIn(firstContext)).toBe(6);
      expect(computedIn(secondContext)).toBe(6);
      expect(JSON.stringify(second.result.results)).toBe(JSON.stringify(first.result.results));
      expect(second.result.summary).toEqual(first.result.summary);
    },
    LAYER_TIMEOUT_MS,
  );
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
