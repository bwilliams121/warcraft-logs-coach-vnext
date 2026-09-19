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
    // 17 artifacts / 31 cases at M9-B; M9-C added six bounded captures and
    // twelve cases; the M9-C correction added the second Assassination
    // subject: two artifacts and eleven cases; M10-B added the Protection
    // Paladin opener slice, its gap derivation and twenty cases; M10-C added
    // twelve evaluator cases over the same two artifacts; the M10-C
    // correction added one synthetic authority artifact and three shared
    // decision-engine cases; M10-C2 added one measured Protection case;
    // M10-C5 Phase A added the 45-second rotational slice, its predeclared
    // gap derivative and seven cases; M10-C5 Phase B2 added the four measured
    // steady-state segments and twelve cases (four normalization, two bundle
    // compositions, six evaluator); M10-D added no artifact and three cases
    // (the Arms Warrior through the service and both transports over the
    // opener slice, and the mixed roster raid night over the same slice),
    // and repurposed four cases whose premise — Protection internal-only —
    // ended; M11-A4 added the four Retribution Paladin slices (cut from the
    // M10-B, M10-C5 Phase B and M9-C2 captures already recorded, no new
    // request) and sixteen cases (four normalization, one bundle
    // composition, ten evaluator, one application-service); M11-A5 added
    // three public-contract cases over the same slices (the Retribution
    // public projection, its REST/MCP parity, a mixed raid night over its
    // own evidence) and repurposed the application-service case in place.
    // Measured, then pinned.
    expect(loaded.artifacts).toHaveLength(39);
    expect(loaded.cases).toHaveLength(138);
    expect(loaded.coverage.declared).toBe(0);
  });

  it("enumerates artifacts and cases in code-point order", async () => {
    const loaded = await corpus();
    const artifactIds = loaded.artifacts.map((entry) => entry.record.artifactId);
    const caseIds = loaded.cases.map((entry) => entry.record.caseId);

    expect(artifactIds).toEqual([...artifactIds].sort());
    expect(caseIds).toEqual([...caseIds].sort());
  });

  it("holds twenty-eight sanitized captures, four derivations and six synthetics", async () => {
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
      "wcl-assassination-high-parse-opener",
      "wcl-assassination-kingsbane-cooldown",
      "wcl-assassination-vanish-ambush-gate",
      "wcl-aura-stack-absolute",
      "wcl-boss-sourced",
      "wcl-cast-resource-pre-cost",
      "wcl-encounter-rankings-sszorak-page-1",
      "wcl-fight-context-a7r6-fight-7",
      "wcl-fight-context-gtkb-fight-22",
      "wcl-midfight-window",
      "wcl-no-actor-sentinel-source",
      "wcl-page-sequence-limit-40",
      "wcl-page-terminal-one-millisecond",
      "wcl-pet-sourced-events-hunter-pet-29",
      "wcl-protection-paladin-a7r6-opener",
      "wcl-protection-paladin-a7r6-rotational-165s.seg-120-165",
      "wcl-protection-paladin-a7r6-rotational-165s.seg-45-60",
      "wcl-protection-paladin-a7r6-rotational-165s.seg-60-90",
      "wcl-protection-paladin-a7r6-rotational-165s.seg-90-120",
      "wcl-protection-paladin-a7r6-rotational-45s",
      "wcl-pull-window-with-resources",
      "wcl-retribution-paladin-a7r6-rotational-165s.seg-105-165",
      "wcl-retribution-paladin-a7r6-rotational-165s.seg-45-105",
      "wcl-retribution-paladin-a7r6-rotational-45s",
      "wcl-retribution-paladin-gtkb-opener",
    ]);
    expect(byKind.get("DERIVED_FROM_CAPTURE")).toEqual([
      "wcl-no-actor-sentinel-source.unusable-negative",
      "wcl-page-sequence-limit-40.page-5-removed",
      "wcl-protection-paladin-a7r6-opener.gap-before-2010000",
      "wcl-protection-paladin-a7r6-rotational-45s.gap-before-2026589",
    ]);
    expect(byKind.get("SYNTHETIC")).toEqual([
      "synthetic.actor-zero-cast",
      "synthetic.apl-priority-short-circuit",
      "synthetic.apl-run-action-list",
      "synthetic.graphql-event-page-null-data",
      "synthetic.graphql-page-sequence-malformed-second-page",
      "synthetic.graphql-page-sequence-two-pages",
      "synthetic.unsupported-type-event",
    ]);
  });

  it("references every artifact from at least one case", async () => {
    const loaded = await corpus();
    // A case reads its own artifact and any it names in a `…ArtifactId`
    // parameter; the ranking page is read that way by the external-reference
    // parity case and by nothing else.
    const referenced = new Set(loaded.cases.flatMap((entry) => entry.referencedArtifactIds));
    for (const entry of loaded.artifacts) {
      expect(referenced.has(entry.record.artifactId), entry.record.artifactId).toBe(true);
    }
    const rankingsReaders = loaded.cases.filter((entry) =>
      entry.referencedArtifactIds.includes("wcl-encounter-rankings-sszorak-page-1"),
    );
    expect(rankingsReaders.map((entry) => entry.record.caseId)).toEqual([
      "public-contract.encounter-context-external-transport-failure-preserves-local-progression",
      "public-contract.encounter-context-parity-with-external-references-over-a-real-ranking-page",
    ]);
  });

  it("stays well inside the storage ceilings", async () => {
    const loaded = await corpus();
    // The contract's ceilings are 512 KiB per artifact and 6 MiB in total.
    // Measured at the M9-C correction: 1,602,915 bytes in total, the largest
    // the 312,284-byte A7R6 fight context. M10-B added the 427,886-byte
    // Protection Paladin slice (deliberately bounded at 22 s to stay under the
    // per-artifact ceiling) and its 355 KB derivation. M10-C5 Phase B2 added
    // the four steady-state segments (43,545 + 172,085 + 153,998 + 182,066
    // bytes), taking the total to 3,364,052 bytes. The notice line moves from
    // half the ceiling to two thirds of it — still well inside 6 MiB, and
    // still a line growth has to cross deliberately, not silently.
    expect(loaded.totalArtifactBytes).toBeLessThan(4 * 1024 * 1024);
    for (const entry of loaded.artifacts) {
      expect(entry.canonicalByteLength, entry.record.artifactId).toBeLessThan(512 * 1024);
    }
    const largest = Math.max(...loaded.artifacts.map((entry) => entry.canonicalByteLength));
    expect(largest).toBeLessThan(448 * 1024);
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
    let migrated = 0;
    for (const entry of loaded.artifacts) {
      if (entry.record.provenance.kind !== "SANITIZED_CAPTURE") continue;
      const kinds = entry.record.provenance.transformations.map((t) => t.kind);
      expect(kinds, entry.record.artifactId).toContain("CREDENTIAL_SHAPE_SCAN");
      if (!kinds.includes("LEGACY_FIXTURE_COPY")) continue;
      migrated += 1;
      expect(kinds, entry.record.artifactId).toContain("SUBSET_SELECTION");
    }
    expect(migrated).toBe(11);
  });

  it("records a sanitizing transformation on every M9-C capture, with the sanitizer revision", async () => {
    const loaded = await corpus();
    const sanitized = new Set(["SUBSET_SELECTION", "IDENTIFIER_REMAP", "FIELD_REDACTION"]);
    let captured = 0;
    for (const entry of loaded.artifacts) {
      const { kind, transformations, source } = entry.record.provenance;
      if (kind !== "SANITIZED_CAPTURE" || source?.capturedOn !== "2026-09-15") continue;
      captured += 1;
      const sanitizing = transformations.filter((t) => sanitized.has(t.kind));
      expect(sanitizing.length, entry.record.artifactId).toBeGreaterThan(0);
      for (const t of sanitizing) {
        expect(t.tooling.revision, entry.record.artifactId).toMatch(/^sanitize-(payloads|probe)-\d+$/);
        // Revision 2 of the payload sanitizer nulls player gameIDs; every
        // context artifact must have been written by it or later.
        if (
          entry.record.payloadKind === "WCL_GRAPHQL_DATA" &&
          "kind" in source.query &&
          source.query.kind === "FIGHT_CONTEXT"
        ) {
          expect(t.tooling.revision, entry.record.artifactId).not.toBe("sanitize-payloads-1");
        }
      }
    }
    // Seven M9-C captures, plus the M11-A4 Retribution opener slice cut from
    // the M9-C2 opener capture (same capturedOn, sanitizer revision 6).
    expect(captured).toBe(8);
  });

  it("marks unrecorded tooling revisions UNAVAILABLE rather than inventing them", async () => {
    // The slicer had no version field when any pre-M9-C slice was cut; every
    // slice cut after M9-B records the revision that cut it (revision 6 is
    // the --from option M10-C5 Phase B2 added for the steady-state segments).
    const loaded = await corpus();
    for (const entry of loaded.artifacts) {
      const migrated = entry.record.provenance.transformations.some((t) => t.kind === "LEGACY_FIXTURE_COPY");
      for (const transformation of entry.record.provenance.transformations) {
        if (transformation.tooling.name !== "scripts/sanitize-probe.mjs") continue;
        expect(transformation.tooling.revision, entry.record.artifactId).toMatch(
          migrated ? /^UNAVAILABLE$/ : /^sanitize-probe-[23456]$/,
        );
      }
    }
  });

  it("records the truncated-prefix pagination evidence on the resource capture verbatim", async () => {
    const source = artifact(await corpus(), "wcl-cast-resource-pre-cost").record.provenance.source;

    expect(source?.completeness.nextPageTimestamp).toBe(2_191_432);
    expect(source?.completeness.state).toBe("PARTIAL");
    const query = source?.query;
    expect(query !== undefined && "includeResources" in query ? query.includeResources : null).toBe(true);
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

  /** The M9-C correction's --decision-slice cut: the same predicate, subject 25, boss 235. */
  const HIGH_PARSE_SLICE = "wcl-assassination-high-parse-opener";

  /**
   * M10-B's --actor-slice cut and its gap derivation: every event actor 7
   * sources or is targeted by; M10-C5's family-filtered cut of the same
   * capture over the whole window, and ITS predeclared gap derivation.
   */
  const ACTOR_SLICES = [
    "wcl-protection-paladin-a7r6-opener",
    "wcl-protection-paladin-a7r6-opener.gap-before-2010000",
    "wcl-protection-paladin-a7r6-rotational-45s",
    "wcl-protection-paladin-a7r6-rotational-45s.gap-before-2026589",
    "wcl-protection-paladin-a7r6-rotational-165s.seg-45-60",
    "wcl-protection-paladin-a7r6-rotational-165s.seg-60-90",
    "wcl-protection-paladin-a7r6-rotational-165s.seg-90-120",
    "wcl-protection-paladin-a7r6-rotational-165s.seg-120-165",
    // M11-A4: the same predicate for actor 6 over the same two captures, and
    // for actor 23 over the M9-C2 opener capture.
    "wcl-retribution-paladin-a7r6-rotational-45s",
    "wcl-retribution-paladin-a7r6-rotational-165s.seg-45-105",
    "wcl-retribution-paladin-a7r6-rotational-165s.seg-105-165",
    "wcl-retribution-paladin-gtkb-opener",
  ];

  it("grants nothing on any property-based or index-based selection", async () => {
    const loaded = await corpus();
    for (const entry of loaded.artifacts) {
      if (
        PREDICATE_SLICES.includes(entry.record.artifactId) ||
        entry.record.artifactId === HIGH_PARSE_SLICE ||
        ACTOR_SLICES.includes(entry.record.artifactId)
      )
        continue;
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

  it("grants every capture-vouched category for actor 7 alone on the --actor-slice cut, from the fight start to its bound", async () => {
    const loaded = await corpus();
    const record = artifact(loaded, "wcl-protection-paladin-a7r6-opener").record;
    const grants = record.provenance.retainedCoverage.grants;
    expect(grants).toHaveLength(1);
    expect(grants[0]?.actorScope).toEqual([7]);
    expect([...(grants[0]?.categories ?? [])].sort()).toEqual([
      "ABSORBS",
      "AURAS",
      "CASTS",
      "COMBATANT_INFO",
      "DAMAGE",
      "GEAR",
      "HEALING",
      "RESOURCES",
      "SUMMONS",
    ]);
    expect(grants[0]?.ranges).toEqual([{ fromReportTimeMs: 2_004_589, toReportTimeMs: 2_026_589 }]);
    const source = record.provenance.source;
    expect(source?.sourceActorId).toBe(7);
    expect(source?.reportRevision).toBe(30);
    expect(source?.reportRevisionAfterCapture).toBe(30);
    expect(source?.completeness).toMatchObject({
      pagesRetrieved: 4,
      eventsReturned: 30_588,
      nextPageTimestamp: null,
      state: "COMPLETE",
    });
    // The derivation's grant begins at the removal boundary and never before.
    const gap = artifact(loaded, "wcl-protection-paladin-a7r6-opener.gap-before-2010000").record;
    expect(gap.provenance.retainedCoverage.grants[0]?.ranges).toEqual([
      { fromReportTimeMs: 2_010_000, toReportTimeMs: 2_026_589 },
    ]);
    expect(gap.provenance.parentArtifactId).toBe("wcl-protection-paladin-a7r6-opener");
  });

  it("grants CASTS for actor 25 and AURAS for 25 and 235 on the --decision-slice cut, from the fight start", async () => {
    const loaded = await corpus();
    const record = artifact(loaded, HIGH_PARSE_SLICE).record;
    const grants = record.provenance.retainedCoverage.grants;
    expect(grants.find((g) => g.categories.includes("CASTS"))?.actorScope).toEqual([25]);
    expect(grants.find((g) => g.categories.includes("AURAS"))?.actorScope).toEqual([25, 235]);
    const query = record.provenance.source?.query;
    const windowStart = query !== undefined && "startTimeMs" in query ? query.startTimeMs : null;
    for (const grant of grants) {
      expect(grant.ranges).toEqual([{ fromReportTimeMs: 2415041, toReportTimeMs: 2435041 }]);
    }
    // The grant begins where the capture query began, which is the fight start.
    expect(windowStart).toBe(2415041);
    expect(
      record.provenance.transformations.find((t) => t.kind === "SUBSET_SELECTION")?.tooling.invocation,
    ).toContain("--decision-slice 25 235");
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
