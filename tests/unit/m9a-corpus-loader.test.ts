import { describe, expect, it } from "vitest";

import {
  CORPUS_CONTRACT_VERSION,
  MAX_ARTIFACT_BYTES,
  MAX_CORPUS_BYTES,
  PINNED_AUTHORITY_REVISIONS,
} from "../support/corpus/contract.js";
import {
  canonicalBytesOf,
  pathViolation,
  sha256Hex,
  validateCorpus,
  type CorpusErrorCode,
  type CorpusFileTable,
} from "../support/corpus/loader.js";

/**
 * The corpus loader's rejection rules, each exercised on an in-memory file
 * table so the committed corpus is never touched and every failure is
 * constructed on purpose.
 *
 * A loader that can only say "ok" is not validation. Every rule below is a
 * way a manifest could quietly lie — about identity, lineage, bytes, size or
 * ownership — and each test proves the lie is named, with the case or artifact
 * it was found on.
 */

// --------------------------------------------------------------------------
// A minimal valid corpus, built rather than typed so digests are always right
// --------------------------------------------------------------------------

const EVENTS_TEXT = `[
  { "timestamp": 100, "type": "damage", "sourceID": -1, "targetID": 3, "abilityGameID": 9, "fight": 1 },
  { "timestamp": 100, "type": "damage", "sourceID": -1, "targetID": 3, "abilityGameID": 9, "fight": 1 }
]
`;

const PAGE_TEXT = `{ "reportData": { "report": { "events": { "data": null, "nextPageTimestamp": null } } } }\n`;

type Json = Record<string, unknown>;

async function artifactRecord(
  artifactId: string,
  path: string,
  text: string,
  overrides: Json = {},
  provenanceOverrides: Json = {},
): Promise<Json> {
  const bytes = canonicalBytesOf(text);
  return {
    artifactId,
    path,
    encoding: "JSON",
    payloadKind: "WCL_EVENT_ARRAY",
    sha256: await sha256Hex(bytes),
    byteLength: bytes.byteLength,
    provenance: {
      kind: "SANITIZED_CAPTURE",
      parentArtifactId: null,
      source: {
        reportCode: "aBcDeFgH12345678",
        fightId: 1,
        reportRevision: 1,
        sourceActorId: 5,
        encounterId: 1000,
        difficulty: 5,
        capturedOn: "2026-09-11",
        gameVersion: 1,
        logVersion: 17,
        ingestionScope: "PLAYER_CONTEXT",
        query: {
          dataType: "All",
          hostilityType: "OMITTED",
          actorFilter: "NONE",
          includeResources: false,
          limit: 10000,
          startTimeMs: 0,
          endTimeMs: 1000,
        },
        completeness: {
          eventsReturned: 50,
          pagesRetrieved: 1,
          nextPageTimestamp: null,
          state: "COMPLETE",
          evidence: "in-memory test corpus",
        },
        captureTooling: { name: "test", revision: "UNAVAILABLE", invocation: "UNAVAILABLE" },
        rawCaptureRetained: false,
        rawCaptureLocation: "NOT_APPLICABLE",
      },
      transformations: [
        {
          kind: "SUBSET_SELECTION",
          tooling: { name: "test", revision: "UNAVAILABLE", invocation: "--head 2" },
          detail: "kept two events",
          invalidates: ["WINDOW_COVERAGE", "ABSENCE_PROOF"],
        },
      ],
      retainedCoverage: { ranges: [], basis: "head slice" },
      retainedFor: "loader tests",
      limitations: [],
      ...provenanceOverrides,
    },
    ...overrides,
  };
}

function caseRecord(caseId: string, artifactId: string, overrides: Json = {}): Json {
  return {
    caseId,
    artifactId,
    owningLayer: "NORMALIZATION",
    contractUnderTest: "test",
    purpose: "test",
    assertions: [{ kind: "NORMALIZATION.EVENT_COUNT_PRESERVED", params: { expectedEventCount: 2 } }],
    rationale: { basis: ["OWNED_CONTRACT"], text: "test" },
    authority: null,
    limitations: [],
    relatedTests: [],
    ...overrides,
  };
}

interface Built {
  files: Record<string, string>;
  readonly manifest: { contractVersion: number; corpusId: string; artifacts: Json[]; cases: Json[] };
}

async function minimalCorpus(): Promise<Built> {
  const manifest = {
    contractVersion: CORPUS_CONTRACT_VERSION,
    corpusId: "test.corpus",
    artifacts: [await artifactRecord("events.a", "artifacts/events/a.json", EVENTS_TEXT)],
    cases: [caseRecord("case.one", "events.a")],
  };
  return { files: { "artifacts/events/a.json": EVENTS_TEXT }, manifest };
}

function tableOf(built: Built): CorpusFileTable {
  return { ...built.files, "manifest.json": JSON.stringify(built.manifest) };
}

async function codesOf(table: CorpusFileTable): Promise<readonly CorpusErrorCode[]> {
  const result = await validateCorpus(table);
  return result.ok ? [] : result.errors.map((error) => error.code);
}

async function errorsOf(table: CorpusFileTable) {
  const result = await validateCorpus(table);
  return result.ok ? [] : result.errors;
}

// --------------------------------------------------------------------------

describe("a minimal corpus loads", () => {
  it("accepts one artifact and one case", async () => {
    const built = await minimalCorpus();
    const result = await validateCorpus(tableOf(built));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.corpus.artifacts).toHaveLength(1);
    expect(result.corpus.cases).toHaveLength(1);
    expect(result.corpus.coverage).toEqual({ executable: 1, declared: 0 });
    expect(result.corpus.totalArtifactBytes).toBe(canonicalBytesOf(EVENTS_TEXT).byteLength);
  });

  it("returns the artifact text exactly as given", async () => {
    const built = await minimalCorpus();
    const result = await validateCorpus(tableOf(built));

    if (!result.ok) return;
    expect(result.corpus.artifacts[0]?.text).toBe(EVENTS_TEXT);
  });
});

describe("the manifest itself", () => {
  it("is required", async () => {
    expect(await codesOf({ "artifacts/events/a.json": EVENTS_TEXT })).toEqual(["MANIFEST_MISSING"]);
  });

  it("must be JSON", async () => {
    expect(await codesOf({ "manifest.json": "{ not json" })).toEqual(["MANIFEST_NOT_JSON"]);
  });

  it("rejects an unsupported contract version before reading anything else", async () => {
    const built = await minimalCorpus();
    built.manifest.contractVersion = CORPUS_CONTRACT_VERSION + 1;
    const errors = await errorsOf(tableOf(built));

    expect(errors.map((e) => e.code)).toEqual(["CONTRACT_VERSION_UNSUPPORTED"]);
    expect(errors[0]?.message).toContain(String(CORPUS_CONTRACT_VERSION + 1));
  });

  it("rejects a missing contract version the same way", async () => {
    const built = await minimalCorpus();
    const { contractVersion: _dropped, ...rest } = built.manifest;
    const table = { ...built.files, "manifest.json": JSON.stringify(rest) };

    expect(await codesOf(table)).toEqual(["CONTRACT_VERSION_UNSUPPORTED"]);
  });

  it("rejects unknown keys anywhere, so a typo cannot become silent metadata", async () => {
    const built = await minimalCorpus();
    (built.manifest.artifacts[0] as Json)["capturedOn"] = "2026-09-11";
    const errors = await errorsOf(tableOf(built));

    expect(errors.map((e) => e.code)).toEqual(["MANIFEST_SHAPE_INVALID"]);
    expect(errors[0]?.message).toContain("artifacts.0");
  });

  it("rejects a wall-clock-shaped capture date that is not YYYY-MM-DD or a marker", async () => {
    const built = await minimalCorpus();
    ((built.manifest.artifacts[0] as Json)["provenance"] as Json)["source"] = {
      ...(((built.manifest.artifacts[0] as Json)["provenance"] as Json)["source"] as Json),
      capturedOn: "2026-09-11T10:00:00Z",
    };

    expect(await codesOf(tableOf(built))).toEqual(["MANIFEST_SHAPE_INVALID"]);
  });
});

describe("identity", () => {
  it("rejects a duplicate artifact id", async () => {
    const built = await minimalCorpus();
    built.manifest.artifacts.push(await artifactRecord("events.a", "artifacts/events/b.json", EVENTS_TEXT));
    built.files["artifacts/events/b.json"] = EVENTS_TEXT;

    expect(await codesOf(tableOf(built))).toContain("ARTIFACT_ID_DUPLICATE");
  });

  it("rejects two artifacts on one path", async () => {
    const built = await minimalCorpus();
    built.manifest.artifacts.push(await artifactRecord("events.b", "artifacts/events/a.json", EVENTS_TEXT));

    expect(await codesOf(tableOf(built))).toContain("ARTIFACT_PATH_DUPLICATE");
  });

  it("rejects a duplicate case id", async () => {
    const built = await minimalCorpus();
    built.manifest.cases.push(caseRecord("case.one", "events.a"));

    expect(await codesOf(tableOf(built))).toContain("CASE_ID_DUPLICATE");
  });

  it("rejects an id with upper case or spaces at the schema", async () => {
    const built = await minimalCorpus();
    (built.manifest.cases[0] as Json)["caseId"] = "Case One";

    expect(await codesOf(tableOf(built))).toEqual(["MANIFEST_SHAPE_INVALID"]);
  });
});

describe("paths stay inside the corpus root", () => {
  it.each([
    ["../manifest.json", "`..`"],
    ["artifacts/../../src/x.json", "`..`"],
    ["/artifacts/a.json", "absolute"],
    ["C:/artifacts/a.json", "absolute"],
    ["artifacts\\events\\a.json", "backslash"],
    ["fixtures/a.json", "artifacts/"],
    ["artifacts/./a.json", "`.`"],
  ])("rejects %s (%s)", async (path) => {
    const built = await minimalCorpus();
    (built.manifest.artifacts[0] as Json)["path"] = path;
    const errors = await errorsOf(tableOf(built));

    expect(errors.map((e) => e.code)).toContain("ARTIFACT_PATH_OUTSIDE_ROOT");
    expect(errors.find((e) => e.code === "ARTIFACT_PATH_OUTSIDE_ROOT")?.subject).toEqual({
      artifactId: "events.a",
    });
  });

  it("accepts a nested forward-slash path under artifacts/", () => {
    expect(pathViolation("artifacts/wcl-events/deep/er/file.json")).toBeNull();
  });
});

describe("bytes", () => {
  it("rejects a missing artifact file, naming the artifact", async () => {
    const built = await minimalCorpus();
    delete built.files["artifacts/events/a.json"];
    const errors = await errorsOf(tableOf(built));

    expect(errors.map((e) => e.code)).toEqual(["ARTIFACT_FILE_MISSING"]);
    expect(errors[0]?.subject).toEqual({ artifactId: "events.a" });
  });

  it("rejects a digest mismatch and reports both digests", async () => {
    const built = await minimalCorpus();
    built.files["artifacts/events/a.json"] = EVENTS_TEXT.replace('"targetID": 3', '"targetID": 4');
    const errors = await errorsOf(tableOf(built));
    const digest = errors.find((e) => e.code === "ARTIFACT_DIGEST_MISMATCH");

    expect(digest).toBeDefined();
    expect(digest?.message).toContain((built.manifest.artifacts[0] as Json)["sha256"] as string);
    expect(digest?.message).toContain("hashes to");
  });

  it("rejects a byte-length mismatch independently of the digest", async () => {
    const built = await minimalCorpus();
    (built.manifest.artifacts[0] as Json)["byteLength"] = 1;

    const codes = await codesOf(tableOf(built));
    expect(codes).toContain("ARTIFACT_BYTE_LENGTH_MISMATCH");
    expect(codes).not.toContain("ARTIFACT_DIGEST_MISMATCH");
  });

  it("treats CRLF and LF checkouts of the same artifact as the same bytes", async () => {
    // JSON cannot carry a raw CR inside a string, so folding CRLF touches only
    // whitespace. A checkout under core.autocrlf=true must not fail the corpus.
    const built = await minimalCorpus();
    built.files["artifacts/events/a.json"] = EVENTS_TEXT.replaceAll("\n", "\r\n");

    const result = await validateCorpus(tableOf(built));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The text is still returned as given — canonicalization is for the
    // digest only, never a rewrite of the evidence.
    expect(result.corpus.artifacts[0]?.text).toContain("\r\n");
  });

  it("rejects an artifact above the per-artifact ceiling", async () => {
    const built = await minimalCorpus();
    const big = `[${"1,".repeat(MAX_ARTIFACT_BYTES / 2)}1]`;
    built.files["artifacts/events/a.json"] = big;
    built.manifest.artifacts = [await artifactRecord("events.a", "artifacts/events/a.json", big)];

    expect(await codesOf(tableOf(built))).toContain("ARTIFACT_TOO_LARGE");
  });

  it("rejects a corpus above the total ceiling even when every artifact is within its own", async () => {
    const built = await minimalCorpus();
    const chunk = `[${"1,".repeat(MAX_ARTIFACT_BYTES / 2 - 8)}1]`;
    const needed = Math.ceil(MAX_CORPUS_BYTES / canonicalBytesOf(chunk).byteLength) + 1;
    built.manifest.artifacts = [];
    built.files = {};
    for (let index = 0; index < needed; index += 1) {
      const path = `artifacts/events/${String(index)}.json`;
      built.files[path] = chunk;
      built.manifest.artifacts.push(await artifactRecord(`events.n${String(index)}`, path, chunk));
    }
    built.manifest.cases = [
      caseRecord("case.one", "events.n0", {
        assertions: [{ kind: "NORMALIZATION.EVENT_COUNT_PRESERVED", params: { expectedEventCount: 1 } }],
      }),
    ];

    const codes = await codesOf(tableOf(built));
    expect(codes).toContain("CORPUS_TOO_LARGE");
    expect(codes).not.toContain("ARTIFACT_TOO_LARGE");
  });

  it("rejects a file under artifacts/ that no artifact references", async () => {
    const built = await minimalCorpus();
    built.files["artifacts/events/orphan.json"] = EVENTS_TEXT;
    const errors = await errorsOf(tableOf(built));

    expect(errors.map((e) => e.code)).toEqual(["CORPUS_FILE_UNREFERENCED"]);
    expect(errors[0]?.message).toContain("artifacts/events/orphan.json");
  });
});

describe("encoding and payload kind are structural, never combat validity", () => {
  it("rejects a JSON artifact whose bytes do not parse, pointing at RAW_TEXT", async () => {
    const built = await minimalCorpus();
    const broken = '[{"timestamp": 1';
    built.files["artifacts/events/a.json"] = broken;
    built.manifest.artifacts = [await artifactRecord("events.a", "artifacts/events/a.json", broken)];
    const errors = await errorsOf(tableOf(built));

    expect(errors.map((e) => e.code)).toEqual(["ARTIFACT_NOT_JSON"]);
    expect(errors[0]?.message).toContain("RAW_TEXT");
  });

  it("accepts unparseable bytes declared RAW_TEXT, so malformed input can be a first-class artifact", async () => {
    const built = await minimalCorpus();
    const broken = '{"reportData":{"report":{"events":{"data":[{"timestamp":1';
    built.files["artifacts/raw/truncated.txt"] = broken;
    built.manifest.artifacts.push(
      await artifactRecord(
        "raw.truncated",
        "artifacts/raw/truncated.txt",
        broken,
        { encoding: "RAW_TEXT", payloadKind: "RAW_TEXT" },
        { kind: "SYNTHETIC", source: null, transformations: [] },
      ),
    );

    const result = await validateCorpus(tableOf(built));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const raw = result.corpus.artifacts.find((e) => e.record.artifactId === "raw.truncated");
    expect(raw?.text).toBe(broken);
    expect(raw?.json).toBeUndefined();
  });

  it("accepts a well-formed JSON page whose combat payload is malformed by design", async () => {
    const built = await minimalCorpus();
    built.files["artifacts/pages/null.json"] = PAGE_TEXT;
    built.manifest.artifacts.push(
      await artifactRecord(
        "pages.null",
        "artifacts/pages/null.json",
        PAGE_TEXT,
        { payloadKind: "WCL_GRAPHQL_DATA" },
        { kind: "SYNTHETIC", source: null, transformations: [] },
      ),
    );

    expect(await codesOf(tableOf(built))).toEqual([]);
  });

  it("rejects an event array that is not an array", async () => {
    const built = await minimalCorpus();
    built.files["artifacts/events/a.json"] = PAGE_TEXT;
    built.manifest.artifacts = [await artifactRecord("events.a", "artifacts/events/a.json", PAGE_TEXT)];

    expect(await codesOf(tableOf(built))).toContain("ARTIFACT_PAYLOAD_KIND_MISMATCH");
  });

  it("rejects RAW_TEXT encoding paired with a JSON payload kind, and the reverse", async () => {
    const built = await minimalCorpus();
    (built.manifest.artifacts[0] as Json)["encoding"] = "RAW_TEXT";
    expect(await codesOf(tableOf(built))).toContain("ARTIFACT_ENCODING_KIND_MISMATCH");

    const other = await minimalCorpus();
    (other.manifest.artifacts[0] as Json)["payloadKind"] = "RAW_TEXT";
    expect(await codesOf(tableOf(other))).toContain("ARTIFACT_ENCODING_KIND_MISMATCH");
  });

  it("does not sort, deduplicate or repair the events it loads", async () => {
    const built = await minimalCorpus();
    const unordered = `[
  { "timestamp": 200, "type": "cast", "sourceID": 0, "targetID": -1, "fight": 1 },
  { "timestamp": 100, "type": "cast", "sourceID": 0, "targetID": -1, "fight": 1 },
  { "timestamp": 100, "type": "cast", "sourceID": 0, "targetID": -1, "fight": 1 }
]
`;
    built.files["artifacts/events/a.json"] = unordered;
    built.manifest.artifacts = [await artifactRecord("events.a", "artifacts/events/a.json", unordered)];
    built.manifest.cases = [
      caseRecord("case.one", "events.a", {
        assertions: [{ kind: "NORMALIZATION.EVENT_COUNT_PRESERVED", params: { expectedEventCount: 3 } }],
      }),
    ];

    const result = await validateCorpus(tableOf(built));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const events = result.corpus.artifacts[0]?.json as {
      timestamp: number;
      sourceID: number;
      targetID: number;
    }[];
    expect(events.map((e) => e.timestamp)).toEqual([200, 100, 100]);
    expect(events.map((e) => e.sourceID)).toEqual([0, 0, 0]);
    expect(events.map((e) => e.targetID)).toEqual([-1, -1, -1]);
  });
});

describe("lineage must match what was done to the bytes", () => {
  async function withProvenance(overrides: Json): Promise<CorpusFileTable> {
    const built = await minimalCorpus();
    built.manifest.artifacts = [
      await artifactRecord("events.a", "artifacts/events/a.json", EVENTS_TEXT, {}, overrides),
    ];
    return tableOf(built);
  }

  it("rejects a REAL_CAPTURE that lists a transformation", async () => {
    expect(await codesOf(await withProvenance({ kind: "REAL_CAPTURE" }))).toContain(
      "PROVENANCE_REAL_CAPTURE_TRANSFORMED",
    );
  });

  it("rejects a SANITIZED_CAPTURE with no sanitizing transformation", async () => {
    expect(await codesOf(await withProvenance({ transformations: [] }))).toContain(
      "PROVENANCE_SANITIZED_WITHOUT_TRANSFORMATION",
    );
  });

  it("rejects a SANITIZED_CAPTURE that carries a mutation — that is DERIVED", async () => {
    const codes = await codesOf(
      await withProvenance({
        transformations: [
          {
            kind: "VALUE_MUTATION",
            tooling: { name: "test", revision: "NOT_APPLICABLE", invocation: "NOT_APPLICABLE" },
            detail: "changed a value",
            invalidates: ["OBSERVED_BEHAVIOUR"],
          },
        ],
      }),
    );
    expect(codes).toContain("PROVENANCE_SANITIZED_CARRIES_DERIVATION");
  });

  it("rejects a capture kind without a source, and a synthetic with one", async () => {
    expect(await codesOf(await withProvenance({ source: null }))).toContain("PROVENANCE_SOURCE_REQUIRED");
    expect(await codesOf(await withProvenance({ kind: "SYNTHETIC", transformations: [] }))).toContain(
      "PROVENANCE_SOURCE_FORBIDDEN",
    );
  });

  it("rejects a SYNTHETIC artifact that names a parent", async () => {
    const codes = await codesOf(
      await withProvenance({
        kind: "SYNTHETIC",
        source: null,
        transformations: [],
        parentArtifactId: "events.a",
      }),
    );
    expect(codes).toContain("PROVENANCE_PARENT_FORBIDDEN");
  });

  describe("DERIVED_FROM_CAPTURE", () => {
    const mutation = {
      kind: "VALUE_MUTATION",
      tooling: { name: "test", revision: "NOT_APPLICABLE", invocation: "NOT_APPLICABLE" },
      detail: "changed a value",
      invalidates: ["OBSERVED_BEHAVIOUR"],
    };

    async function withDerived(overrides: Json): Promise<Built> {
      const built = await minimalCorpus();
      const derivedText = EVENTS_TEXT.replace('"sourceID": -1', '"sourceID": -5');
      built.files["artifacts/events/a.derived.json"] = derivedText;
      built.manifest.artifacts.push(
        await artifactRecord(
          "events.a.derived",
          "artifacts/events/a.derived.json",
          derivedText,
          {},
          {
            kind: "DERIVED_FROM_CAPTURE",
            parentArtifactId: "events.a",
            source: null,
            transformations: [mutation],
            ...overrides,
          },
        ),
      );
      return built;
    }

    it("accepts a derivation with a parent, no source, and a mutation that invalidates observed behaviour", async () => {
      expect(await codesOf(tableOf(await withDerived({})))).toEqual([]);
    });

    it("requires a parent", async () => {
      expect(await codesOf(tableOf(await withDerived({ parentArtifactId: null })))).toContain(
        "PROVENANCE_PARENT_REQUIRED",
      );
    });

    it("rejects an unknown parent", async () => {
      expect(await codesOf(tableOf(await withDerived({ parentArtifactId: "events.missing" })))).toContain(
        "PROVENANCE_PARENT_UNKNOWN",
      );
    });

    it("rejects a derivation with no deriving transformation — that is a sanitized copy", async () => {
      const built = await withDerived({
        transformations: [
          {
            kind: "SUBSET_SELECTION",
            tooling: { name: "test", revision: "UNAVAILABLE", invocation: "UNAVAILABLE" },
            detail: "sliced",
            invalidates: [],
          },
        ],
      });
      expect(await codesOf(tableOf(built))).toContain("PROVENANCE_DERIVED_WITHOUT_MUTATION");
    });

    it("rejects a mutation that does not admit it invalidates observed behaviour", async () => {
      const built = await withDerived({ transformations: [{ ...mutation, invalidates: [] }] });
      expect(await codesOf(tableOf(built))).toContain(
        "PROVENANCE_DERIVATION_MUST_INVALIDATE_OBSERVED_BEHAVIOUR",
      );
    });

    it("rejects restating the source on the derivation", async () => {
      const built = await withDerived({});
      const parentSource = ((built.manifest.artifacts[0] as Json)["provenance"] as Json)["source"];
      ((built.manifest.artifacts[1] as Json)["provenance"] as Json)["source"] = parentSource;
      expect(await codesOf(tableOf(built))).toContain("PROVENANCE_SOURCE_FORBIDDEN");
    });

    it("rejects a synthetic parent", async () => {
      const built = await withDerived({});
      ((built.manifest.artifacts[0] as Json)["provenance"] as Json)["kind"] = "SYNTHETIC";
      ((built.manifest.artifacts[0] as Json)["provenance"] as Json)["source"] = null;
      ((built.manifest.artifacts[0] as Json)["provenance"] as Json)["transformations"] = [];
      expect(await codesOf(tableOf(built))).toContain("PROVENANCE_PARENT_SYNTHETIC");
    });

    it("rejects a parent cycle", async () => {
      const built = await withDerived({});
      const parent = (built.manifest.artifacts[0] as Json)["provenance"] as Json;
      parent["kind"] = "DERIVED_FROM_CAPTURE";
      parent["source"] = null;
      parent["parentArtifactId"] = "events.a.derived";
      parent["transformations"] = [mutation];
      expect(await codesOf(tableOf(built))).toContain("PROVENANCE_PARENT_CYCLE");
    });
  });

  it("rejects retained coverage wider than the source window", async () => {
    const codes = await codesOf(
      await withProvenance({
        retainedCoverage: { ranges: [{ fromReportTimeMs: 0, toReportTimeMs: 5000 }], basis: "too wide" },
      }),
    );
    expect(codes).toContain("PROVENANCE_RETAINED_COVERAGE_EXCEEDS_SOURCE");
  });
});

describe("cases may only claim what their layer owns, in a registered vocabulary", () => {
  it("rejects a case whose artifact does not exist", async () => {
    const built = await minimalCorpus();
    built.manifest.cases = [caseRecord("case.one", "events.missing")];
    const errors = await errorsOf(tableOf(built));

    expect(errors.map((e) => e.code)).toEqual(["CASE_ARTIFACT_UNKNOWN"]);
    expect(errors[0]?.subject).toEqual({ caseId: "case.one" });
  });

  it("rejects an unregistered assertion kind — there is no free-form assertion", async () => {
    const built = await minimalCorpus();
    built.manifest.cases = [
      caseRecord("case.one", "events.a", {
        assertions: [{ kind: "NORMALIZATION.EXPECT", params: { js: "1 === 1" } }],
      }),
    ];
    expect(await codesOf(tableOf(built))).toEqual(["CASE_ASSERTION_KIND_UNKNOWN"]);
  });

  it("rejects malformed parameters and names the field", async () => {
    const built = await minimalCorpus();
    built.manifest.cases = [
      caseRecord("case.one", "events.a", {
        assertions: [{ kind: "NORMALIZATION.EVENT_COUNT_PRESERVED", params: { expectedEventCount: "two" } }],
      }),
    ];
    const errors = await errorsOf(tableOf(built));

    expect(errors.map((e) => e.code)).toEqual(["CASE_ASSERTION_PARAMS_INVALID"]);
    expect(errors[0]?.message).toContain("expectedEventCount");
  });

  it("rejects extra parameters, so a misspelled param cannot be silently ignored", async () => {
    const built = await minimalCorpus();
    built.manifest.cases = [
      caseRecord("case.one", "events.a", {
        assertions: [
          { kind: "NORMALIZATION.EVENT_COUNT_PRESERVED", params: { expectedEventCount: 2, strict: true } },
        ],
      }),
    ];
    expect(await codesOf(tableOf(built))).toEqual(["CASE_ASSERTION_PARAMS_INVALID"]);
  });

  it("rejects an assertion owned by a different layer than the case", async () => {
    const built = await minimalCorpus();
    built.manifest.cases = [caseRecord("case.one", "events.a", { owningLayer: "COMBAT_STATE" })];
    const errors = await errorsOf(tableOf(built));

    expect(errors.map((e) => e.code)).toEqual(["CASE_ASSERTION_LAYER_MISMATCH"]);
    expect(errors[0]?.message).toContain("NORMALIZATION");
    expect(errors[0]?.message).toContain("COMBAT_STATE");
  });

  it("rejects an assertion asked about the wrong payload kind", async () => {
    const built = await minimalCorpus();
    built.manifest.cases = [
      caseRecord("case.one", "events.a", {
        owningLayer: "WCL_TRANSPORT",
        assertions: [{ kind: "WCL_DECODE.EVENT_PAGE_OUTCOME", params: { expected: "MALFORMED_PAGINATOR" } }],
      }),
    ];
    expect(await codesOf(tableOf(built))).toEqual(["CASE_ASSERTION_PAYLOAD_KIND_MISMATCH"]);
  });

  it("counts DECLARED assertions separately and never as executable coverage", async () => {
    const built = await minimalCorpus();
    built.manifest.cases = [
      caseRecord("case.one", "events.a"),
      caseRecord("case.two", "events.a", {
        owningLayer: "PUBLIC_CONTRACT",
        assertions: [{ kind: "PUBLIC_CONTRACT.REST_MCP_PARITY", params: { surface: "ANALYSIS" } }],
      }),
    ];
    const result = await validateCorpus(tableOf(built));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.corpus.coverage).toEqual({ executable: 1, declared: 1 });
    expect(result.corpus.cases[1]?.assertions[0]?.execution).toBe("DECLARED");
  });

  it("requires a case to have at least one assertion — purpose text alone is not a case", async () => {
    const built = await minimalCorpus();
    built.manifest.cases = [caseRecord("case.one", "events.a", { assertions: [] })];
    expect(await codesOf(tableOf(built))).toEqual(["MANIFEST_SHAPE_INVALID"]);
  });

  it("requires a rationale with a listed basis", async () => {
    const built = await minimalCorpus();
    built.manifest.cases = [
      caseRecord("case.one", "events.a", {
        rationale: { basis: ["CURRENT_OUTPUT"], text: "it is what the code does" },
      }),
    ];
    expect(await codesOf(tableOf(built))).toEqual(["MANIFEST_SHAPE_INVALID"]);
  });
});

describe("authority-dependent expectations", () => {
  const authorityCase = (authority: Json | null): Json =>
    caseRecord("case.authority", "events.a", {
      owningLayer: "SPEC_ASSASSINATION",
      assertions: [
        {
          kind: "SPEC_ASSASSINATION.DECISION_COVERAGE",
          params: {
            actorId: 19,
            targetActorId: 21,
            observedCast: { reportTimeMs: 100, abilityGameId: 703 },
            expectedCoverage: "UNKNOWN",
          },
        },
      ],
      authority,
    });

  it("requires the case to pin an authority when any assertion depends on one", async () => {
    const built = await minimalCorpus();
    built.manifest.cases = [authorityCase(null)];
    expect(await codesOf(tableOf(built))).toEqual(["CASE_AUTHORITY_REQUIRED"]);
  });

  it("rejects an authority that is not a committed artifact", async () => {
    const built = await minimalCorpus();
    built.manifest.cases = [
      authorityCase({ authorityId: "WCL_TOP_LOGS", artifactRevision: "1", requiredStateEvidence: ["x"] }),
    ];
    expect(await codesOf(tableOf(built))).toEqual(["CASE_AUTHORITY_UNKNOWN"]);
  });

  it("rejects a revision that is no longer the committed one, rather than silently re-pinning", async () => {
    const built = await minimalCorpus();
    built.manifest.cases = [
      authorityCase({
        authorityId: "SIMC_APL_ROGUE_ASSASSINATION",
        artifactRevision: "simc-00000000-0",
        requiredStateEvidence: ["Garrote applydebuff anchor"],
      }),
    ];
    const errors = await errorsOf(tableOf(built));

    expect(errors.map((e) => e.code)).toEqual(["CASE_AUTHORITY_REVISION_STALE"]);
    expect(errors[0]?.message).toContain(PINNED_AUTHORITY_REVISIONS["SIMC_APL_ROGUE_ASSASSINATION"]);
  });

  it("accepts the committed revision, as a DECLARED assertion", async () => {
    const built = await minimalCorpus();
    built.manifest.cases = [
      authorityCase({
        authorityId: "SIMC_APL_ROGUE_ASSASSINATION",
        artifactRevision: PINNED_AUTHORITY_REVISIONS["SIMC_APL_ROGUE_ASSASSINATION"] ?? "",
        requiredStateEvidence: ["Garrote applydebuff anchor"],
      }),
    ];
    const result = await validateCorpus(tableOf(built));

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.corpus.coverage).toEqual({ executable: 0, declared: 1 });
  });
});

describe("determinism", () => {
  it("returns artifacts and cases in code-point order regardless of manifest order", async () => {
    const built = await minimalCorpus();
    built.files["artifacts/events/b.json"] = EVENTS_TEXT;
    built.manifest.artifacts.unshift(
      await artifactRecord("events.z", "artifacts/events/b.json", EVENTS_TEXT),
    );
    built.manifest.cases.unshift(caseRecord("case.zzz", "events.z"));
    built.manifest.cases.push(caseRecord("case.aaa", "events.a"));

    const result = await validateCorpus(tableOf(built));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.corpus.artifacts.map((e) => e.record.artifactId)).toEqual(["events.a", "events.z"]);
    expect(result.corpus.cases.map((e) => e.record.caseId)).toEqual(["case.aaa", "case.one", "case.zzz"]);
  });

  it("reports every error, not only the first", async () => {
    const built = await minimalCorpus();
    delete built.files["artifacts/events/a.json"];
    built.manifest.cases = [caseRecord("case.one", "events.missing"), caseRecord("case.one", "events.a")];
    const codes = await codesOf(tableOf(built));

    expect(codes).toContain("ARTIFACT_FILE_MISSING");
    expect(codes).toContain("CASE_ARTIFACT_UNKNOWN");
    expect(codes).toContain("CASE_ID_DUPLICATE");
  });

  it("is a pure function of the file table", async () => {
    const built = await minimalCorpus();
    const table = tableOf(built);
    const first = await validateCorpus(table);
    const second = await validateCorpus(table);

    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});
