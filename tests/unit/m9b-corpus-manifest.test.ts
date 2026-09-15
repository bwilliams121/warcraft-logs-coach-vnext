import { describe, expect, it } from "vitest";

import { CORPUS_CONTRACT_VERSION, PINNED_AUTHORITY_REVISIONS } from "../support/corpus/contract.js";
import { committedEventArray } from "../support/corpus/artifacts.js";
import { committedCorpusFiles, loadCorpusOrThrow, type LoadedCorpus } from "../support/corpus/loader.js";

/**
 * The committed corpus manifest: it loads, its provenance is honest about
 * lineage and coverage, and its evidence is what the layers' own tests read.
 *
 * WHAT THIS PROVES AND WHAT IT DOES NOT
 *
 * It proves the CORPUS as data: seventeen artifacts with structured provenance,
 * thirty-one cases addressing them, no legacy copy left behind, no coverage
 * granted that a transformation record does not support. Whether the cases'
 * expectations hold is the harness's job (`m9b-corpus-harness.test.ts` and the
 * workerd gate); this file is about the manifest telling the truth.
 */

async function corpus(): Promise<LoadedCorpus> {
  return loadCorpusOrThrow(committedCorpusFiles());
}

function artifact(loaded: LoadedCorpus, id: string) {
  const found = loaded.artifacts.find((entry) => entry.record.artifactId === id);
  if (found === undefined) throw new Error(`artifact ${id} missing`);
  return found;
}

describe("the committed corpus loads", () => {
  it("validates with zero errors at contract version 2", async () => {
    const loaded = await corpus();

    expect(loaded.manifest.contractVersion).toBe(CORPUS_CONTRACT_VERSION);
    expect(loaded.manifest.contractVersion).toBe(2);
    expect(loaded.artifacts).toHaveLength(17);
    expect(loaded.cases).toHaveLength(31);
    expect(loaded.coverage.declared).toBe(0);
  });

  it("enumerates artifacts and cases in code-point order", async () => {
    const loaded = await corpus();
    const artifactIds = loaded.artifacts.map((entry) => entry.record.artifactId);
    const caseIds = loaded.cases.map((entry) => entry.record.caseId);

    expect(artifactIds).toEqual([...artifactIds].sort());
    expect(caseIds).toEqual([...caseIds].sort());
  });

  it("holds the eleven migrated captures, one derivation and five synthetics", async () => {
    const loaded = await corpus();
    const byKind = new Map<string, string[]>();
    for (const entry of loaded.artifacts) {
      const kind = entry.record.provenance.kind;
      byKind.set(kind, [...(byKind.get(kind) ?? []), entry.record.artifactId]);
    }

    expect(byKind.get("REAL_CAPTURE")).toBeUndefined();
    expect(byKind.get("SANITIZED_CAPTURE")).toEqual([
      "wcl-assassination-d2-decision-corpus",
      "wcl-assassination-envenom-combo-points",
      "wcl-assassination-garrote-dot-remains",
      "wcl-assassination-kingsbane-cooldown",
      "wcl-assassination-vanish-ambush-gate",
      "wcl-aura-stack-absolute",
      "wcl-boss-sourced",
      "wcl-cast-resource-pre-cost",
      "wcl-midfight-window",
      "wcl-no-actor-sentinel-source",
      "wcl-pull-window-with-resources",
    ]);
    expect(byKind.get("DERIVED_FROM_CAPTURE")).toEqual(["wcl-no-actor-sentinel-source.unusable-negative"]);
    expect(byKind.get("SYNTHETIC")).toEqual([
      "synthetic.actor-zero-cast",
      "synthetic.graphql-event-page-null-data",
      "synthetic.graphql-page-sequence-malformed-second-page",
      "synthetic.graphql-page-sequence-two-pages",
      "synthetic.unsupported-type-event",
    ]);
  });

  it("references every artifact from at least one case", async () => {
    const loaded = await corpus();
    const referenced = new Set(loaded.cases.map((entry) => entry.artifact.record.artifactId));
    for (const entry of loaded.artifacts) {
      expect(referenced.has(entry.record.artifactId), entry.record.artifactId).toBe(true);
    }
  });

  it("stays well inside the storage ceilings", async () => {
    const loaded = await corpus();
    // ~484 KB of artifacts against a 6 MiB corpus ceiling; the largest is the
    // 226 KB D2 slice against 512 KiB. Recorded as a fact, not a target.
    expect(loaded.totalArtifactBytes).toBeLessThan(600 * 1024);
    for (const entry of loaded.artifacts) {
      expect(entry.canonicalByteLength, entry.record.artifactId).toBeLessThan(256 * 1024);
    }
  });
});

describe("provenance is honest about lineage", () => {
  it("labels the mutated slice DERIVED and points it at its parent", async () => {
    const derived = artifact(await corpus(), "wcl-no-actor-sentinel-source.unusable-negative");

    expect(derived.record.provenance.kind).toBe("DERIVED_FROM_CAPTURE");
    expect(derived.record.provenance.parentArtifactId).toBe("wcl-no-actor-sentinel-source");
    expect(derived.record.provenance.source).toBeNull();
    expect(
      derived.record.provenance.transformations.some(
        (entry) => entry.kind === "VALUE_MUTATION" && entry.invalidates.includes("OBSERVED_BEHAVIOUR"),
      ),
    ).toBe(true);
  });

  it("keeps the derived bytes one token away from the parent, as the transformation says", async () => {
    const loaded = await corpus();
    const parent = artifact(loaded, "wcl-no-actor-sentinel-source");
    const derived = artifact(loaded, "wcl-no-actor-sentinel-source.unusable-negative");

    expect(parent.text.replace('"sourceID": -1,', '"sourceID": -5,')).toBe(derived.text);
    expect(parent.text).not.toBe(derived.text);
  });

  it("records every migrated capture's copy step and its sanitizing selection", async () => {
    const loaded = await corpus();
    for (const entry of loaded.artifacts) {
      if (entry.record.provenance.kind !== "SANITIZED_CAPTURE") continue;
      const kinds = entry.record.provenance.transformations.map((t) => t.kind);
      expect(kinds, entry.record.artifactId).toContain("SUBSET_SELECTION");
      expect(kinds, entry.record.artifactId).toContain("CREDENTIAL_SHAPE_SCAN");
      expect(kinds, entry.record.artifactId).toContain("LEGACY_FIXTURE_COPY");
    }
  });

  it("marks unrecorded tooling revisions UNAVAILABLE rather than inventing them", async () => {
    // The slicer had no version field when any committed slice was cut.
    const loaded = await corpus();
    for (const entry of loaded.artifacts) {
      for (const transformation of entry.record.provenance.transformations) {
        if (transformation.tooling.name === "scripts/sanitize-probe.mjs") {
          expect(transformation.tooling.revision, entry.record.artifactId).toBe("UNAVAILABLE");
        }
      }
    }
  });

  it("records the truncated-prefix pagination evidence on the resource capture verbatim", async () => {
    const source = artifact(await corpus(), "wcl-cast-resource-pre-cost").record.provenance.source;

    expect(source?.completeness.nextPageTimestamp).toBe(2_191_432);
    expect(source?.completeness.state).toBe("PARTIAL");
    expect(source?.query.includeResources).toBe(true);
  });

  it("shares one source capture between the four slices cut from the mid-fight window", async () => {
    const loaded = await corpus();
    const sources = [
      "wcl-midfight-window",
      "wcl-boss-sourced",
      "wcl-no-actor-sentinel-source",
      "wcl-aura-stack-absolute",
    ].map((id) => JSON.stringify(artifact(loaded, id).record.provenance.source));
    expect(new Set(sources).size).toBe(1);
  });
});

describe("retained coverage is granted only where the capture predicate supports it", () => {
  const PREDICATE_SLICES = [
    "wcl-assassination-garrote-dot-remains",
    "wcl-assassination-kingsbane-cooldown",
    "wcl-assassination-d2-decision-corpus",
  ];

  it("grants nothing on any property-based or index-based selection", async () => {
    const loaded = await corpus();
    for (const entry of loaded.artifacts) {
      if (PREDICATE_SLICES.includes(entry.record.artifactId)) continue;
      expect(entry.record.provenance.retainedCoverage.grants, entry.record.artifactId).toEqual([]);
    }
  });

  it("grants AURAS for targets 19 and 21 on every in-place-filtered slice", async () => {
    const loaded = await corpus();
    for (const id of PREDICATE_SLICES) {
      const grant = artifact(loaded, id).record.provenance.retainedCoverage.grants.find((g) =>
        g.categories.includes("AURAS"),
      );
      expect(grant?.actorScope, id).toEqual([19, 21]);
    }
  });

  it("grants CASTS for actor 19 only where every actor-19 cast was retained", async () => {
    const loaded = await corpus();
    const castsGrant = (id: string) =>
      artifact(loaded, id).record.provenance.retainedCoverage.grants.find((g) =>
        g.categories.includes("CASTS"),
      );

    // C3a kept two decision casts: no CASTS grant, honestly.
    expect(castsGrant("wcl-assassination-garrote-dot-remains")).toBeUndefined();
    expect(castsGrant("wcl-assassination-kingsbane-cooldown")?.actorScope).toEqual([19]);
    expect(castsGrant("wcl-assassination-d2-decision-corpus")?.actorScope).toEqual([19]);
  });
});

describe("the corpus is the canonical payload", () => {
  it("serves the same events the migrated layer tests read", async () => {
    const loaded = await corpus();
    for (const entry of loaded.artifacts) {
      if (entry.record.payloadKind !== "WCL_EVENT_ARRAY") continue;
      expect(committedEventArray(entry.record.artifactId)).toEqual(entry.json);
    }
  });

  it("keeps four events on one timestamp, unsorted and undeduplicated", async () => {
    const events = artifact(await corpus(), "wcl-no-actor-sentinel-source").json as readonly {
      timestamp: number;
      sourceID: number;
      targetID: number;
    }[];

    expect(events).toHaveLength(4);
    expect(new Set(events.map((event) => event.timestamp)).size).toBe(1);
    expect(events.map((event) => event.targetID)).toEqual([14, 16, 3, 21]);
  });

  it("does not mutate the file table it was given", async () => {
    const files = committedCorpusFiles();
    const before = JSON.stringify(files);

    await loadCorpusOrThrow(files);

    expect(JSON.stringify(files)).toBe(before);
  });
});

describe("authority references reconcile with the committed artifacts", () => {
  it("pins every authority-dependent case to the committed revisions", async () => {
    const loaded = await corpus();
    const pinned = loaded.cases.filter((entry) => entry.record.authority !== null);

    expect(pinned.length).toBeGreaterThanOrEqual(5);
    for (const entry of pinned) {
      const authority = entry.record.authority;
      if (authority === null) continue;
      expect(PINNED_AUTHORITY_REVISIONS[authority.authorityId], entry.record.caseId).toBe(
        authority.artifactRevision,
      );
      expect(authority.requiredStateEvidence.length, entry.record.caseId).toBeGreaterThan(0);
    }
  });

  it("reads the Assassination revision from the artifact, not from a constant", () => {
    expect(PINNED_AUTHORITY_REVISIONS["SIMC_APL_ROGUE_ASSASSINATION"]).toBe("simc-33622e9d-1");
  });
});
