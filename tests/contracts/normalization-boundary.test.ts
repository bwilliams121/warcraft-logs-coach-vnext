import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { SUPPORTED_TYPE_CONTRACTS } from "../../src/engine/normalization/supported-families.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../src/engine/normalization/raw-event-fields.js";
import { NORMALIZATION_REVISION } from "../../src/engine/normalization/combat-fight.js";
import { committedEventArrays } from "../support/corpus/artifacts.js";
import { committedEvidenceArchiveFiles } from "../support/corpus/evidence-archive.js";

/**
 * Raw types present in the committed EVIDENCE ARCHIVE artifact a citation
 * names (M11-F, N3). Synchronous, by manifest path; digest and root identity
 * are resolved in tests/contracts/m11f-evidence-root-citations.test.ts.
 */
function archivedRawTypes(fixtureId: string): Set<string> {
  const files = committedEvidenceArchiveFiles();
  const manifest = JSON.parse(files["manifest.json"] ?? "null") as {
    artifacts: { artifactId: string; path: string; payloadKind: string }[];
  };
  const record = manifest.artifacts.find((entry) => entry.artifactId === fixtureId);
  const types = new Set<string>();
  if (record === undefined || record.payloadKind !== "WCL_EVENT_ARRAY") return types;
  for (const event of JSON.parse(files[record.path] ?? "[]") as { type?: unknown }[]) {
    if (typeof event.type === "string") types.add(event.type);
  }
  return types;
}

function filesUnder(root: string): readonly string[] {
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { recursive: true, withFileTypes: false })
    .map((entry) => `${root}/${String(entry).replace(/\\/g, "/")}`)
    .filter((path) => statSync(path).isFile());
}

const SOURCE_FILES = filesUnder("src").filter((path) => path.endsWith(".ts"));
const NORMALIZATION_FILES = SOURCE_FILES.filter((path) => path.includes("engine/normalization"));

describe("every recognised raw type is evidence-gated", () => {
  it("requires committed evidence for each contract, envelope-only included", () => {
    // Decoding no family fields lowers the SIZE of a contract, not the evidence
    // bar for it. Naming a type is still a claim about a non-frozen upstream.
    for (const contract of SUPPORTED_TYPE_CONTRACTS) {
      expect(contract.evidence, `${contract.rawType} has no evidence`).toBeDefined();
      expect(["SANITIZED_CAPTURE", "SCHEMA_TYPED_FIELD", "ARCHIVED_CAPTURE"]).toContain(
        contract.evidence.kind,
      );
      if (contract.evidence.kind === "SANITIZED_CAPTURE" || contract.evidence.kind === "ARCHIVED_CAPTURE") {
        expect(contract.evidence.fixtureId.length).toBeGreaterThan(0);
      }
    }
  });

  it("recognises only raw type strings that appear in a committed corpus artifact", () => {
    // The registry is no longer empty, so the gate has to be enforced against
    // the evidence itself rather than against emptiness. The evidence is the
    // regression corpus: every committed WCL event array, synthetic ones
    // included — a synthetic type string is deliberately one no contract names.
    const committed = new Set<string>();
    for (const events of committedEventArrays().values()) {
      for (const event of events as { type?: string }[]) {
        if (typeof event.type === "string") {
          committed.add(event.type);
        }
      }
    }

    for (const contract of SUPPORTED_TYPE_CONTRACTS) {
      // M11-F (N3): a contract citing the evidence archive is held to the
      // artifact it names there — never to "some file somewhere".
      const present =
        contract.evidence.kind === "ARCHIVED_CAPTURE"
          ? archivedRawTypes(contract.evidence.fixtureId).has(contract.rawType)
          : committed.has(contract.rawType);
      expect(present, `${contract.rawType} is recognised in code but appears in no committed fixture`).toBe(
        true,
      );
    }
  });

  it("uses the source/target field names the captures verified", () => {
    expect(VERIFIED_DIRECTION_FIELDS).toEqual({
      sourceId: "sourceID",
      sourceInstance: "sourceInstance",
      targetId: "targetID",
      targetInstance: "targetInstance",
      abilityGameId: "abilityGameID",
    });
  });

  it("cites a corpus artifact that actually exists for every capture-backed contract", () => {
    // `fixtureId` in production evidence IS the corpus artifact id. Renaming an
    // artifact without re-citing it here fails the build, as it should.
    const artifacts = committedEventArrays();
    for (const contract of SUPPORTED_TYPE_CONTRACTS) {
      if (contract.evidence.kind !== "SANITIZED_CAPTURE") {
        continue;
      }
      expect(
        artifacts.has(contract.evidence.fixtureId),
        `${contract.rawType} cites fixtureId ${contract.evidence.fixtureId}, which is not a committed corpus artifact`,
      ).toBe(true);
    }
  });
});

describe("the normalized model contains no gameplay vocabulary", () => {
  /**
   * Words that would mean the normalizer had started coaching. M3 records what
   * was observed; it does not record what should have happened.
   */
  const BANNED = [
    "shouldHave",
    "wasActive",
    "wasWasted",
    "wasLate",
    "wasCorrect",
    "wasOptimal",
    "expectedAction",
    "idealAction",
    "mistake",
    "atCap",
    "wastedResource",
    "rotationError",
    "isBis",
    "isOptimal",
    "correctEnchant",
  ];

  it.each(BANNED)("does not mention %s anywhere in normalization", (word) => {
    for (const path of NORMALIZATION_FILES) {
      const contents = readFileSync(path, "utf8");
      // Strip comments: the prohibition is on the vocabulary of the MODEL, and
      // the doc comments necessarily name the failures they prevent.
      const code = contents.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(code, `${path} mentions ${word}`).not.toContain(word);
    }
  });

  it("records a normalization revision so results stay traceable", () => {
    expect(NORMALIZATION_REVISION).toMatch(/^m\d+\.\d+$/);
    // M11-F: bumped for the M11-E1 and M11-F model changes (shape and meaning).
    // M11-G4-1: bumped for the additive `report.region`.
    // M13-B: bumped for the additive `friendlySpecializations`.
    // A model change without a bump is what this pin makes visible in review.
    expect(NORMALIZATION_REVISION).toBe("m3.5");
  });
});

describe("the raw boundary holds", () => {
  it("keeps RawEventPage out of everything except the normalizer", () => {
    const allowed = ["src/wcl/", "src/engine/normalization/"];
    for (const path of SOURCE_FILES) {
      if (!readFileSync(path, "utf8").includes("retrieval-types.js")) {
        continue;
      }
      expect(
        allowed.some((prefix) => path.startsWith(prefix)),
        `${path} imports raw retrieval types from outside the boundary`,
      ).toBe(true);
    }
  });

  it("keeps `unknown` out of the normalized model surface", () => {
    // `unknown` is expected in DECODER INPUTS — that is what a decoder is for.
    // What must never happen is `unknown` surviving into the model that
    // Milestone 4 reasons over, because then raw Warcraft Logs JSON would have
    // crossed the boundary wearing a domain type's name.
    const MODEL_SURFACE = [
      "src/engine/normalization/normalized-events.ts",
      "src/engine/normalization/combat-fight.ts",
      "src/engine/normalization/friendly-specializations.ts",
      "src/engine/normalization/completeness.ts",
      "src/engine/evidence/locator.ts",
      "src/engine/evidence/coverage.ts",
    ];

    for (const path of MODEL_SURFACE) {
      const code = readFileSync(path, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      expect(code, `${path} exposes unknown in the normalized model`).not.toContain("unknown");
    }
  });

  it("declares the raw event array only inside the Warcraft Logs layer", () => {
    // Two declarations exist and both are intentional: the decoder's output
    // (`events-query.ts`) and the page handed to the normalizer
    // (`retrieval-types.ts`). Both sit below the boundary. What matters is that
    // no third one appears above it.
    // M11-G2 adds a third, also below the boundary: the comparison CAPTURE
    // tool (`src/wcl/comparison/comparison-capture.ts`) hands raw pages to its
    // window callback. No analyzer path imports it (m11g2 layering contract).
    const declarations = SOURCE_FILES.filter((path) =>
      /events: readonly unknown\[\]/.test(readFileSync(path, "utf8")),
    );
    expect(declarations.sort()).toEqual([
      "src/wcl/comparison/comparison-capture.ts",
      "src/wcl/events-query.ts",
      "src/wcl/retrieval-types.ts",
    ]);
  });

  it("keeps Warcraft Logs wire types out of the service layer", () => {
    for (const path of SOURCE_FILES.filter((file) => file.startsWith("src/services/"))) {
      const contents = readFileSync(path, "utf8");
      expect(contents, `${path} imports a raw page type`).not.toContain("retrieval-types.js");
      expect(contents, `${path} imports the events query`).not.toContain("events-query.js");
      expect(contents, `${path} imports the paginator`).not.toContain("paginator.js");
    }
  });
});

describe("no committed fixture carries a credential", () => {
  const CREDENTIAL_PATTERNS = [
    "client_secret",
    "access_token",
    "authorization",
    "bearer ",
    "wcl_client_secret",
  ];

  /**
   * Fixture PAYLOADS only.
   *
   * Provenance documentation is excluded because it has to be able to name the
   * things it forbids — "never store a client_secret" would otherwise fail the
   * very check it describes. The payloads are what could actually leak.
   */
  const FIXTURE_PAYLOADS = filesUnder("tests/fixtures").filter((path) => !path.endsWith(".md"));

  it.each(CREDENTIAL_PATTERNS)("contains no %s", (pattern) => {
    for (const path of FIXTURE_PAYLOADS) {
      const contents = readFileSync(path, "utf8").toLowerCase();
      expect(contents, `${path} contains ${pattern}`).not.toContain(pattern);
    }
  });

  it("scans at least one fixture payload, so the sweep cannot pass vacuously", () => {
    expect(FIXTURE_PAYLOADS.length).toBeGreaterThan(0);
  });

  it("keeps raw probe output out of the repository", () => {
    // Raw captures are gitignored and disposable; only reviewed, sanitized
    // slices may enter tests/fixtures.
    expect(readFileSync(".gitignore", "utf8")).toContain(".probe/");
  });
});
