/**
 * M11-A1: the public "Supported specializations: …" wording is DERIVED from
 * the production analyzer catalog, not hand-listed.
 *
 * THE FAILURE THIS GUARDS AGAINST
 *
 * Before M11-A1 both MCP tool descriptions carried the sentence as a literal,
 * and two contract tests pinned that literal. Three modules had to agree by
 * hand — and a specialization could be made PUBLIC in the catalog while one
 * description still said otherwise, or be named in a description before its
 * registration existed. The derivation makes the sentence a pure function of
 * the same PUBLIC set the dispatcher selects from.
 *
 * WHAT IS PINNED
 *
 *   - the production sentence, as a reviewed snapshot (it changes exactly
 *     when a specialization becomes public, and this file changes with it);
 *   - PUBLIC filtering: an INTERNAL_ONLY row never appears;
 *   - determinism: registration order cannot change the wording;
 *   - the source of names: each registration's `displayName`, which the
 *     registry refuses blank;
 *   - injection: both tool descriptions carry the derived sentence verbatim,
 *     and neither module could have hand-listed a specialization instead.
 */

import { describe, expect, it } from "vitest";

import { PUBLIC_SPEC_IDS } from "../../src/findings/spec-id.js";
import { analyzeToolDescription } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { raidNightToolDescription } from "../../src/mcp/tools/analyze-raid-night.js";
import {
  ANALYZER_REGISTRATIONS,
  PRODUCTION_CATALOG,
  PUBLIC_SPECIALIZATION_DESCRIPTIONS,
  publicAnalyzers,
  publicSpecializationDescriptions,
  requireValidatedCatalog,
  SUPPORTED_SPECIALIZATIONS_SENTENCE,
  supportedSpecializationsSentence,
  validateAnalyzerCatalog,
} from "../../src/services/analyzer-registry.js";
import { fixtureRegistration } from "../support/fixture-registration.js";

const TOOL_SOURCES: Record<string, string> = import.meta.glob("../../src/mcp/tools/*.ts", {
  eager: true,
  query: "?raw",
  import: "default",
});

describe("the production sentence", () => {
  it("is the reviewed snapshot for the nine public specializations", () => {
    // Reviewed, not the rule. The third specialization became public in
    // M11-A5, the fourth in M11-B12, the fifth in M11-C4j and the sixth
    // (Augmentation Evoker, support observations only) in M13-F and the seventh
    // (Restoration Shaman, healer findings only) in HEAL-AP, and the eighth and ninth (Holy Paladin and
    // Mistweaver Monk, healer findings only) in HEAL-B1P; each time this line changed in the
    // same commit as the five-site move, as the previous snapshot said it
    // would. The display names are in code-point order, which is why Blood
    // Death Knight sits second and not last.
    expect(SUPPORTED_SPECIALIZATIONS_SENTENCE).toBe(
      "Supported specializations: Assassination Rogue, Augmentation Evoker, Blood Death Knight, Brewmaster Monk, Holy Paladin, Holy Priest, Mistweaver Monk, Protection Paladin, Restoration Shaman and Retribution Paladin.",
    );
  });

  it("names exactly the PUBLIC registrations' display names, in code-point order", () => {
    const names = publicAnalyzers(PRODUCTION_CATALOG).map((registration) => registration.displayName);
    expect(names.length).toBe(PUBLIC_SPEC_IDS.length);
    for (const name of names) expect(SUPPORTED_SPECIALIZATIONS_SENTENCE).toContain(name);
    const sorted = [...names].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));
    expect(SUPPORTED_SPECIALIZATIONS_SENTENCE.indexOf(String(sorted[0]))).toBeLessThan(
      SUPPORTED_SPECIALIZATIONS_SENTENCE.indexOf(String(sorted[sorted.length - 1])),
    );
  });

  it("is a pure function of the catalog: reversing registration order changes nothing", () => {
    const reversed = requireValidatedCatalog([...ANALYZER_REGISTRATIONS].reverse());
    expect(supportedSpecializationsSentence(reversed)).toBe(SUPPORTED_SPECIALIZATIONS_SENTENCE);
    expect(supportedSpecializationsSentence(PRODUCTION_CATALOG)).toBe(SUPPORTED_SPECIALIZATIONS_SENTENCE);
  });

  it("never names an INTERNAL_ONLY registration", () => {
    // A fixture row for a spec id the partition keeps internal cannot exist
    // today (the internal set is empty and the registry refuses an unknown
    // id), so the internal-only case is proven on an injected INTERNAL_ONLY
    // duplicate of a public spec being REFUSED, and on the filter itself.
    const internal = fixtureRegistration({ analyzerId: "dormant-fixture", exposure: "INTERNAL_ONLY" });
    const validation = validateAnalyzerCatalog([...ANALYZER_REGISTRATIONS, internal]);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      expect(validation.defects.map((defect) => defect.defect)).toContain("DUPLICATE_SPEC_ID");
    }
    expect(publicAnalyzers(PRODUCTION_CATALOG).every((row) => row.exposure === "PUBLIC")).toBe(true);
    expect(SUPPORTED_SPECIALIZATIONS_SENTENCE).not.toContain("Fixture");
  });
});

describe("display names are registration data the registry validates", () => {
  it("every production registration carries a non-blank display name", () => {
    for (const registration of ANALYZER_REGISTRATIONS) {
      expect(registration.displayName.trim().length, registration.analyzerId).toBeGreaterThan(0);
    }
  });

  it("a blank display name is an INVALID_DISPLAY_NAME catalog defect", () => {
    const blank = { ...fixtureRegistration({ analyzerId: "blank-name" }), displayName: "   " };
    const validation = validateAnalyzerCatalog([...ANALYZER_REGISTRATIONS, blank]);
    expect(validation.ok).toBe(false);
    if (!validation.ok) {
      const defects = validation.defects.filter((defect) => defect.analyzerId === "blank-name");
      expect(defects.map((defect) => defect.defect)).toContain("INVALID_DISPLAY_NAME");
    }
  });

  it("the validated snapshot carries the display name, frozen", () => {
    for (const row of PRODUCTION_CATALOG.registrations) {
      expect(typeof row.displayName).toBe("string");
      expect(() => {
        (row as { displayName: string }).displayName = "changed";
      }).toThrow(TypeError);
    }
  });
});

describe("the production descriptions object carries the sentence and per-spec limits in one order", () => {
  it("is the sentence plus one limits entry per PUBLIC registration, in display-name order", () => {
    expect(PUBLIC_SPECIALIZATION_DESCRIPTIONS.sentence).toBe(SUPPORTED_SPECIALIZATIONS_SENTENCE);
    const ordered = [...publicAnalyzers(PRODUCTION_CATALOG)].sort((left, right) =>
      left.displayName < right.displayName ? -1 : left.displayName > right.displayName ? 1 : 0,
    );
    expect(PUBLIC_SPECIALIZATION_DESCRIPTIONS.limits).toEqual(
      ordered.map((registration) => ({
        analysis: registration.publicLimits.analysis,
        raidNight: registration.publicLimits.raidNight,
      })),
    );
  });

  it("is a pure function of the catalog: reversing registration order changes nothing", () => {
    const reversed = requireValidatedCatalog([...ANALYZER_REGISTRATIONS].reverse());
    expect(publicSpecializationDescriptions(reversed)).toEqual(PUBLIC_SPECIALIZATION_DESCRIPTIONS);
  });
});

describe("both tool descriptions carry the derived sentence and nothing hand-listed", () => {
  it("analyze_warcraft_log embeds the injected sentence verbatim", () => {
    const description = analyzeToolDescription(PUBLIC_SPECIALIZATION_DESCRIPTIONS);
    expect(description).toContain(SUPPORTED_SPECIALIZATIONS_SENTENCE);
    expect(description.split(SUPPORTED_SPECIALIZATIONS_SENTENCE)).toHaveLength(2);
  });

  it("analyze_raid_night embeds the injected sentence verbatim", () => {
    const description = raidNightToolDescription(PUBLIC_SPECIALIZATION_DESCRIPTIONS);
    expect(description).toContain(SUPPORTED_SPECIALIZATIONS_SENTENCE);
    expect(description.split(SUPPORTED_SPECIALIZATIONS_SENTENCE)).toHaveLength(2);
  });

  it("an injected description is the only way a specialization list or limit reaches either tool", () => {
    // A different sentence produces a different description and no residue of
    // the production names or the production limits: proof the modules hold
    // no list and no limitation paragraph of their own.
    const probe = {
      sentence: "Supported specializations: Probe One and Probe Two.",
      limits: [
        { analysis: "Probe One limits (analysis).", raidNight: "Probe One limits (raid night)." },
        { analysis: "", raidNight: "" },
      ],
    };
    const analysis = analyzeToolDescription(probe);
    const raidNight = raidNightToolDescription(probe);
    for (const description of [analysis, raidNight]) {
      expect(description).toContain(probe.sentence);
      expect(description).not.toContain("Assassination Rogue and Protection Paladin");
      expect(description).not.toContain("Protection Paladin and Retribution Paladin");
      expect(description).not.toContain("Shield of the Righteous");
      expect(description).not.toContain("Holy Power SPENDER");
    }
    expect(analysis).toContain("Probe One limits (analysis).\n\n");
    expect(analysis).not.toContain("raid night");
    expect(raidNight).toContain("Probe One limits (raid night).\n\n");
    expect(raidNight).not.toContain("(analysis)");
  });

  it("no tool module names the support sentence or a display name as a literal in code", () => {
    for (const [key, source] of Object.entries(TOOL_SOURCES)) {
      const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(code, key).not.toMatch(/Supported specializations:\s*[A-Z]/);
      // A LIMITS paragraph legitimately names its own specialization; what
      // must never appear is the support LIST spelled by hand.
      expect(code, key).not.toContain("Assassination Rogue and Protection Paladin");
      expect(code, key).not.toContain("Protection Paladin and Retribution Paladin");
      expect(code, key).not.toContain("Assassination Rogue, Protection Paladin");
    }
  });
});
