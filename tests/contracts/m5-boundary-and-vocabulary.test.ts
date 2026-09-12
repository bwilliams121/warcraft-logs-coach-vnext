import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { ACTIONABILITY_STATUSES } from "../../src/findings/actionability.js";

/**
 * The M5 layer boundary, swept mechanically.
 *
 * M4 has `tests/contracts/m4-state-vocabulary.test.ts`, which bans
 * decision-authority vocabulary across ALL of `src/engine`. That contract is
 * deliberately left intact and unexempted: findings live in `src/findings`
 * precisely so the engine sweep never needs a hole cut in it.
 *
 * What this file protects is the other direction — the ways M5 could quietly
 * undo an M3/M4 guarantee or reintroduce a rejected shortcut:
 *
 *     name-based ability matching        the identity failure
 *     a hard-coded resource wire type    the magic-constant failure
 *     delta replay or stale state        the invented-state failure
 *     an actionability default           the fail-open failure
 *     a positive gameplay verdict        the unearned-certainty failure
 *     engine depending on findings       the layering failure
 */

function filesUnder(root: string): readonly string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { recursive: true, withFileTypes: false })
    .map((entry) => `${root}/${String(entry).replace(/\\/g, "/")}`)
    .filter((path) => statSync(path).isFile() && path.endsWith(".ts"));
}

/** Source with comments stripped: the prohibition is on CODE, and the doc comments must name what they forbid. */
function codeOf(path: string): string {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const M5_ROOTS = ["src/findings", "src/simc", "src/specs", "src/data"];
const M5_FILES = M5_ROOTS.flatMap(filesUnder);
const ENGINE_FILES = filesUnder("src/engine");

describe("the sweep has something to sweep", () => {
  it("finds M5 sources under every declared root", () => {
    expect(M5_FILES.length).toBeGreaterThan(0);
    for (const root of M5_ROOTS) {
      expect(filesUnder(root).length, `${root} is empty`).toBeGreaterThan(0);
    }
  });

  it("keeps findings out of the engine tree", () => {
    // src/engine owns factual and derived state. Findings are downstream
    // interpretive judgments, and separating them is what lets the M4
    // vocabulary contract stay absolute.
    expect(existsSync("src/engine/findings")).toBe(false);
    expect(existsSync("src/findings")).toBe(true);
  });
});

describe("layering is one-way", () => {
  it("never lets the engine depend on M5", () => {
    for (const path of ENGINE_FILES) {
      const code = codeOf(path);
      for (const forbidden of ["/findings/", "/simc/", "/specs/", "/data/game/", "/data/wcl-wire/"]) {
        expect(code, `${path} imports ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("never lets shared findings depend on a specialization", () => {
    for (const path of filesUnder("src/findings")) {
      expect(codeOf(path), `${path} imports a spec`).not.toContain("/specs/");
    }
  });

  it("never lets SimulationCraft code depend on Warcraft Logs or a specialization", () => {
    for (const path of filesUnder("src/simc")) {
      const code = codeOf(path);
      expect(code, `${path} imports a spec`).not.toContain("/specs/");
      expect(code, `${path} imports the WCL layer`).not.toContain("/wcl/");
    }
  });

  it("never lets M5 reach raw Warcraft Logs payloads", () => {
    for (const path of M5_FILES) {
      const code = codeOf(path);
      expect(code, `${path} imports raw retrieval types`).not.toContain("retrieval-types.js");
      expect(code, `${path} imports the events query`).not.toContain("events-query.js");
      expect(code, `${path} imports the paginator`).not.toContain("paginator.js");
    }
  });
});

describe("ability identity is numeric, never a name", () => {
  it("declares the Envenom spell id in exactly one module", () => {
    const declaring = filesUnder("src").filter((path) => codeOf(path).includes("32645"));
    expect(declaring).toEqual(["src/data/game/rogue-abilities.ts"]);
  });

  it("never compares a Warcraft Logs ability name", () => {
    for (const path of M5_FILES) {
      const code = codeOf(path);
      for (const forbidden of [
        "ability.name ===",
        '.name === "Envenom"',
        "displayNameEn ===",
        "abilities.get(",
        "nameToAbility",
      ]) {
        expect(code, `${path} matches on a name`).not.toContain(forbidden);
      }
      expect(code, `${path} regex-matches an ability name`).not.toMatch(/\/envenom\/i/);
    }
  });
});

describe("the resource wire type is never a magic constant", () => {
  it("declares the wire contract in exactly one module", () => {
    const declaring = filesUnder("src").filter((path) => /RESOURCE_WIRE_CONTRACTS\s*:/.test(codeOf(path)));
    expect(declaring).toEqual(["src/data/wcl-wire/resource-types.ts"]);
  });

  it("never passes a numeric literal as a resource type", () => {
    for (const path of M5_FILES) {
      expect(codeOf(path), `${path} calls observationOnEvent with a literal resource type`).not.toMatch(
        /observationOnEvent\([^)]*,\s*\d+\s*\)/,
      );
    }
  });

  it("resolves the wire type through the gated accessor", () => {
    const evaluator = codeOf("src/specs/rogue/assassination/evaluator.ts");
    expect(evaluator).toContain("resourceWireTypeFor");
  });
});

describe("M5 invents no combat state", () => {
  it("never replays resource changes or reads stale values", () => {
    for (const path of M5_FILES) {
      const code = codeOf(path);
      // Identifier names, not substrings: a provenance note is allowed to use
      // an English word that happens to contain a banned identifier.
      for (const forbidden of [
        "latestObservedAtOrBefore",
        "standaloneChangeOnEvent",
        "standaloneChangePositionsFor",
        "resourceChange",
        "replayChanges",
        "regenRate",
        "regenerationModel",
        "energyPerSecond",
        "interpolateAmount",
        "projectedAmount",
      ]) {
        expect(code, `${path} mentions ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("never reads aura state, so no absence can become inactivity", () => {
    for (const path of M5_FILES) {
      const code = codeOf(path);
      for (const forbidden of ["presenceAt", "lastObservedTransition", "anySource(", "fromSource("]) {
        expect(code, `${path} queries aura state`).not.toContain(forbidden);
      }
    }
  });

  it("never indexes the canonical event array by an ingestion ordinal", () => {
    for (const path of M5_FILES) {
      const code = codeOf(path);
      expect(code, `${path} indexes events directly`).not.toMatch(/events\[/);
      expect(code, `${path} uses an ingestion ordinal as an index`).not.toMatch(
        /\[\s*\w*[iI]ngestionOrdinal\s*\]/,
      );
    }
  });
});

describe("M5 forms no unearned verdict", () => {
  it("declares no positive gameplay status", () => {
    for (const path of M5_FILES) {
      const code = codeOf(path);
      for (const forbidden of [
        '"CORRECT"',
        '"MATCH"',
        '"OPTIMAL"',
        '"APPROVED"',
        "wasCorrect",
        "isOptimal",
        "expectedAction",
        "idealAction",
      ]) {
        expect(code, `${path} declares ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  it("introduces no subjective confidence scale", () => {
    for (const path of M5_FILES) {
      const code = codeOf(path);
      for (const forbidden of ["confidence", "severity", '"HIGH"', '"MEDIUM"', '"LOW"']) {
        expect(code, `${path} declares ${forbidden}`).not.toContain(forbidden);
      }
    }
  });

  /**
   * RE-POINTED for M5-B, and deliberately no longer load-bearing on a substring.
   *
   * The previous version asserted that no M5 file contained the literal
   * `"ACTIONABLE"`. That would have passed for
   * `"PROVEN_ACTIONABLE_BY_OBSERVED_EXECUTION"` only because the character before
   * `ACTIONABLE` is an underscore rather than a quote — an accident of spelling,
   * not a decision. The same accident would have let `"NEVER_ACTIONABLE"` and
   * `"NOT_YET_ACTIONABLE"` through, which is exactly what the rule exists to
   * stop.
   *
   * So the guarantee is asserted STRUCTURALLY over the exported union, which no
   * prefix can evade. The substring sweeps are kept underneath as a cheap
   * backstop against the bare literals, and neither of them needs an exception.
   */
  it("permits exactly the authorized actionability statuses", () => {
    expect([...ACTIONABILITY_STATUSES]).toEqual(["NOT_EVALUATED", "PROVEN_ACTIONABLE_BY_OBSERVED_EXECUTION"]);
  });

  it("declares no negative actionability state at all", () => {
    // Absence of an observed restriction is not evidence of availability, and
    // absence of an observed cast is not evidence of unavailability. This guards
    // the second: there is no member to infer into.
    for (const status of ACTIONABILITY_STATUSES) {
      expect(status, `${status} reads as a negative claim`).not.toMatch(
        /NOT_ACTIONABLE|UNAVAILABLE|IMPOSSIBLE|UNUSABLE|BLOCKED/,
      );
    }
  });

  it("names the evidence in every positive actionability status", () => {
    // A positive member must say what proved it, so a future member cannot mean
    // "we assumed it was actionable".
    for (const status of ACTIONABILITY_STATUSES) {
      if (status === "NOT_EVALUATED") continue;
      expect(status, `${status} claims actionability without naming evidence`).toMatch(
        /^PROVEN_ACTIONABLE_BY_/,
      );
    }
  });

  it("never declares a bare ACTIONABLE or NOT_ACTIONABLE literal", () => {
    for (const path of M5_FILES) {
      const code = codeOf(path);
      expect(code, `${path} declares ACTIONABLE`).not.toContain('"ACTIONABLE"');
      expect(code, `${path} declares NOT_ACTIONABLE`).not.toContain('"NOT_ACTIONABLE"');
    }
  });

  it("makes the honest actionability default explicit rather than implied", () => {
    // `createFinding` requires the field, so "fine by omission" is unreachable.
    const finding = codeOf("src/findings/finding.ts");
    expect(finding).toContain("readonly actionability: ActionabilityEvidence");
    expect(finding).not.toContain('actionability: "NOT_EVALUATED"');
    // And the M5-A producer states it at the call site.
    expect(codeOf("src/specs/rogue/assassination/evaluator.ts")).toContain("notEvaluatedActionability()");
  });

  it("uses no comparison or top-log input at all", () => {
    for (const path of M5_FILES) {
      const code = codeOf(path);
      for (const forbidden of ["topLog", "comparison", "consensus", "percentile", "ranking"]) {
        expect(code, `${path} mentions ${forbidden}`).not.toContain(forbidden);
      }
    }
  });
});
