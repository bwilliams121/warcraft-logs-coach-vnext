import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { SUPPORTED_TYPE_CONTRACTS } from "../../src/engine/normalization/supported-families.js";
import { VERIFIED_DIRECTION_FIELDS } from "../../src/engine/normalization/raw-event-fields.js";
import { NORMALIZATION_REVISION } from "../../src/engine/normalization/combat-fight.js";

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
      expect(["SANITIZED_CAPTURE", "SCHEMA_TYPED_FIELD"]).toContain(contract.evidence.kind);
      if (contract.evidence.kind === "SANITIZED_CAPTURE") {
        expect(contract.evidence.fixtureId.length).toBeGreaterThan(0);
      }
    }
  });

  it("recognises only raw type strings that appear in a committed fixture", () => {
    // The registry is no longer empty, so the gate has to be enforced against
    // the fixtures themselves rather than against emptiness.
    const committed = new Set<string>();
    for (const path of filesUnder("tests/fixtures/wcl/events").filter((file) => file.endsWith(".json"))) {
      for (const event of JSON.parse(readFileSync(path, "utf8")) as { type?: string }[]) {
        if (typeof event.type === "string") {
          committed.add(event.type);
        }
      }
    }

    for (const contract of SUPPORTED_TYPE_CONTRACTS) {
      expect(
        committed.has(contract.rawType),
        `${contract.rawType} is recognised in code but appears in no committed fixture`,
      ).toBe(true);
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

  it("cites a fixture that actually exists for every capture-backed contract", () => {
    for (const contract of SUPPORTED_TYPE_CONTRACTS) {
      if (contract.evidence.kind !== "SANITIZED_CAPTURE") {
        continue;
      }
      const fixtures = filesUnder("tests/fixtures/wcl/events");
      expect(
        fixtures.some((path) =>
          path.includes(contract.evidence.kind === "SANITIZED_CAPTURE" ? contract.evidence.fixtureId : ""),
        ),
        `fixture ${contract.rawType} cited but not committed`,
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
    const declarations = SOURCE_FILES.filter((path) =>
      /events: readonly unknown\[\]/.test(readFileSync(path, "utf8")),
    );
    expect(declarations.sort()).toEqual(["src/wcl/events-query.ts", "src/wcl/retrieval-types.ts"]);
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
