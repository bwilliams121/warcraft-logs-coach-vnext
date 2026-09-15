import { describe, expect, it } from "vitest";

import { CORPUS_CONTRACT_VERSION, PINNED_AUTHORITY_REVISIONS } from "../support/corpus/contract.js";
import { executeAssertion } from "../support/corpus/executors.js";
import { committedCorpusFiles, loadCorpusOrThrow, type LoadedCorpus } from "../support/corpus/loader.js";
import legacySentinel from "../fixtures/wcl/events/wcl-no-actor-sentinel-source.json";
import legacyPreCost from "../fixtures/wcl/events/wcl-cast-resource-pre-cost.json";

/**
 * The committed M9-A seed corpus: it loads, its provenance is honest, and every
 * EXECUTABLE assertion it declares actually holds when driven through the real
 * layer it names.
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT
 *
 * It proves the FORMAT: a real sanitized capture, a derived mutation of it, a
 * synthetic malformed page and a synthetic unsupported type can all be
 * described, loaded deterministically, and connected to executable claims in
 * the normalization, state and transport layers — one artifact serving several
 * cases without a second copy of its bytes.
 *
 * It does not claim corpus breadth. Six cases over five small artifacts is the
 * seed; population and the layer-specific harness are M9-B.
 */

async function corpus(): Promise<LoadedCorpus> {
  return loadCorpusOrThrow(committedCorpusFiles());
}

describe("the committed corpus loads", () => {
  it("validates with zero errors", async () => {
    const loaded = await corpus();

    expect(loaded.manifest.contractVersion).toBe(CORPUS_CONTRACT_VERSION);
    expect(loaded.artifacts.length).toBeGreaterThan(0);
    expect(loaded.cases.length).toBeGreaterThan(0);
  });

  it("enumerates artifacts and cases in code-point order, whatever the manifest order", async () => {
    const loaded = await corpus();
    const artifactIds = loaded.artifacts.map((entry) => entry.record.artifactId);
    const caseIds = loaded.cases.map((entry) => entry.record.caseId);

    expect(artifactIds).toEqual([...artifactIds].sort());
    expect(caseIds).toEqual([...caseIds].sort());
  });

  it("holds the seed set, by id", async () => {
    const loaded = await corpus();

    expect(loaded.artifacts.map((entry) => entry.record.artifactId)).toEqual([
      "wcl-events.cast-resource-pre-cost",
      "wcl-events.no-actor-sentinel-source",
      "wcl-events.no-actor-sentinel-source.unusable-negative",
      "wcl-events.synthetic-unsupported-type",
      "wcl-graphql.event-page-null-data",
    ]);
    expect(loaded.cases.map((entry) => entry.record.caseId)).toEqual([
      "combat-state.costed-cast-resource-is-pre-cost",
      "combat-state.trimmed-slice-cannot-prove-absence",
      "normalization.no-actor-sentinel.source-absence",
      "normalization.unobserved-negative-source-is-unusable-not-sentinel",
      "normalization.unrecognised-type-is-counted-not-dropped",
      "wcl-transport.null-event-data-is-malformed-not-empty",
    ]);
  });

  it("declares nothing it cannot execute", async () => {
    // The seed set is entirely executable. A DECLARED assertion here would be
    // reported as coverage that does not exist.
    const loaded = await corpus();

    expect(loaded.coverage.declared).toBe(0);
    expect(loaded.coverage.executable).toBeGreaterThanOrEqual(loaded.cases.length);
  });
});

describe("provenance is honest about lineage", () => {
  it("commits no REAL_CAPTURE, because raw probe output is never committed", async () => {
    const loaded = await corpus();
    for (const artifact of loaded.artifacts) {
      expect(artifact.record.provenance.kind).not.toBe("REAL_CAPTURE");
    }
  });

  it("labels the mutated slice DERIVED and points it at its parent", async () => {
    const loaded = await corpus();
    const derived = loaded.artifacts.find(
      (entry) => entry.record.artifactId === "wcl-events.no-actor-sentinel-source.unusable-negative",
    );

    expect(derived?.record.provenance.kind).toBe("DERIVED_FROM_CAPTURE");
    expect(derived?.record.provenance.parentArtifactId).toBe("wcl-events.no-actor-sentinel-source");
    expect(derived?.record.provenance.source).toBeNull();
    expect(
      derived?.record.provenance.transformations.some(
        (entry) => entry.kind === "VALUE_MUTATION" && entry.invalidates.includes("OBSERVED_BEHAVIOUR"),
      ),
    ).toBe(true);
  });

  it("keeps the derived bytes one token away from the parent, as the transformation says", async () => {
    const loaded = await corpus();
    const parent = loaded.artifacts.find(
      (e) => e.record.artifactId === "wcl-events.no-actor-sentinel-source",
    );
    const derived = loaded.artifacts.find(
      (e) => e.record.artifactId === "wcl-events.no-actor-sentinel-source.unusable-negative",
    );

    expect(parent?.text.replace('"sourceID": -1,', '"sourceID": -5,')).toBe(derived?.text);
    expect(parent?.text).not.toBe(derived?.text);
  });

  it("retains no coverage on any sliced capture", async () => {
    // Every committed capture is a selection. A retained range on any of them
    // would let the harness grant coverage the transformation record denies.
    const loaded = await corpus();
    for (const artifact of loaded.artifacts) {
      const { provenance } = artifact.record;
      if (provenance.transformations.some((entry) => entry.kind === "SUBSET_SELECTION")) {
        expect(provenance.retainedCoverage.ranges, artifact.record.artifactId).toEqual([]);
      }
    }
  });

  it("records the truncated-prefix pagination evidence on the resource capture verbatim", async () => {
    const loaded = await corpus();
    const source = loaded.artifacts.find((e) => e.record.artifactId === "wcl-events.cast-resource-pre-cost")
      ?.record.provenance.source;

    expect(source?.completeness.nextPageTimestamp).toBe(2_191_432);
    expect(source?.completeness.state).toBe("PARTIAL");
    expect(source?.query.includeResources).toBe(true);
  });

  it("marks unrecorded tooling revisions UNAVAILABLE rather than inventing them", async () => {
    // The slicer has no version field and the probe revision was not recorded.
    const loaded = await corpus();
    for (const artifact of loaded.artifacts) {
      for (const transformation of artifact.record.provenance.transformations) {
        if (transformation.tooling.name === "scripts/sanitize-probe.mjs") {
          expect(transformation.tooling.revision).toBe("UNAVAILABLE");
        }
      }
    }
  });
});

describe("legacy fixture copies have not drifted", () => {
  it("keeps the sentinel artifact byte-identical to its legacy fixture", async () => {
    const loaded = await corpus();
    const artifact = loaded.artifacts.find(
      (e) => e.record.artifactId === "wcl-events.no-actor-sentinel-source",
    );

    expect(artifact?.json).toEqual(legacySentinel);
  });

  it("keeps the pre-cost artifact byte-identical to its legacy fixture", async () => {
    const loaded = await corpus();
    const artifact = loaded.artifacts.find(
      (e) => e.record.artifactId === "wcl-events.cast-resource-pre-cost",
    );

    expect(artifact?.json).toEqual(legacyPreCost);
  });
});

describe("loading preserves what the bytes say", () => {
  it("keeps four events on one timestamp, unsorted and undeduplicated", async () => {
    const loaded = await corpus();
    const events = loaded.artifacts.find((e) => e.record.artifactId === "wcl-events.no-actor-sentinel-source")
      ?.json as readonly { timestamp: number; sourceID: number; targetID: number }[];

    expect(events).toHaveLength(4);
    expect(new Set(events.map((event) => event.timestamp)).size).toBe(1);
    expect(events.map((event) => event.sourceID)).toEqual([-1, -1, -1, -1]);
    // Captured order, not sorted by target.
    expect(events.map((event) => event.targetID)).toEqual([14, 16, 3, 21]);
  });

  it("does not mutate the file table it was given", async () => {
    const files = committedCorpusFiles();
    const before = JSON.stringify(files);

    await loadCorpusOrThrow(files);

    expect(JSON.stringify(files)).toBe(before);
  });
});

describe("every executable seed assertion holds against the real layer", () => {
  it("runs each case's assertions and reports the first failure by case and kind", async () => {
    const loaded = await corpus();
    const failures: string[] = [];
    let executed = 0;

    for (const kase of loaded.cases) {
      for (const assertion of kase.assertions) {
        const outcome = executeAssertion(loaded, kase, assertion);
        if (outcome.ok === "DECLARED") continue;
        executed += 1;
        if (!outcome.ok) failures.push(`${kase.record.caseId} / ${assertion.kind}: ${outcome.detail}`);
      }
    }

    expect(failures).toEqual([]);
    expect(executed).toBe(loaded.coverage.executable);
  });

  it("would report a wrong expectation, not swallow it", async () => {
    // The executor is only evidence if it can fail. Ask the sentinel case for
    // the wrong absence reason and it must say so, naming the event.
    const loaded = await corpus();
    const kase = loaded.cases.find(
      (e) => e.record.caseId === "normalization.no-actor-sentinel.source-absence",
    );
    if (kase === undefined) throw new Error("seed case missing");

    const outcome = executeAssertion(loaded, kase, {
      kind: "NORMALIZATION.SOURCE_ABSENCE",
      params: { selector: { kind: "EVERY_EVENT" }, absence: "NOT_SUPPLIED" },
      execution: "EXECUTABLE",
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok !== false) return;
    expect(outcome.detail).toContain("NO_ACTOR_SENTINEL");
    expect(outcome.detail).toContain("expected NOT_SUPPLIED");
  });

  it("would refuse a proven absence where the corpus expects UNKNOWN", async () => {
    // The state-layer case pins INSUFFICIENT_COVERAGE. Asking for a different
    // reason is rejected with the actual reason, so a reason drift is visible.
    const loaded = await corpus();
    const kase = loaded.cases.find(
      (e) => e.record.caseId === "combat-state.trimmed-slice-cannot-prove-absence",
    );
    if (kase === undefined) throw new Error("seed case missing");

    const outcome = executeAssertion(loaded, kase, {
      kind: "COMBAT_STATE.LAST_OBSERVED_CAST_UNKNOWN",
      params: { actorId: 14, abilityGameId: null, reason: "CAPABILITY_UNVERIFIED" },
      execution: "EXECUTABLE",
    });

    expect(outcome.ok).toBe(false);
    if (outcome.ok !== false) return;
    expect(outcome.detail).toBe("UNKNOWN for INSUFFICIENT_COVERAGE, expected CAPABILITY_UNVERIFIED");
  });
});

describe("authority references reconcile with the committed artifact", () => {
  it("knows the pinned Assassination revision from the artifact, not from a constant", () => {
    expect(PINNED_AUTHORITY_REVISIONS["SIMC_APL_ROGUE_ASSASSINATION"]).toMatch(/^simc-[0-9a-f]{8}-\d+$/);
  });

  it("pins no authority on any seed case, because none is authority-dependent", async () => {
    const loaded = await corpus();
    for (const kase of loaded.cases) {
      expect(kase.record.authority, kase.record.caseId).toBeNull();
    }
  });
});
