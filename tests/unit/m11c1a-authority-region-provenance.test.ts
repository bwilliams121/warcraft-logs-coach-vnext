/**
 * M11-C1a: the APL authority artifact's REGION provenance, in two honest forms.
 *
 *   MARKER LINES        `regionStartMarker` / `regionEndMarker` — the literal
 *                       marker comment lines. Every committed artifact has this
 *                       form; its meaning and its bytes are unchanged.
 *   NAMESPACE_FUNCTION  `regionSelector` — source-coordinate selection (the
 *                       enclosing namespace, the exact function header, the
 *                       player identifier the lists are declared on) and NO
 *                       marker field, because a namespace boundary is not a
 *                       marker.
 *
 * The runtime validator admits exactly one form. This file proves the four
 * committed artifacts are untouched by the extension, that an artifact built
 * by the extractor's own `buildArtifact` for the Brewmaster target is valid
 * in the new form, and that mixed, partial, empty and unknown provenance is
 * refused. The provenance is metadata: no consumer outside the validator
 * reads the region fields.
 */

import { describe, expect, it } from "vitest";

import {
  AUTHORITY_REGION_SELECTOR_KINDS,
  validateAuthorityArtifact,
} from "../../src/simc/authority-artifact.js";
import {
  TARGETS,
  buildArtifact,
  extract,
  type AplExtractionTarget,
} from "../../scripts/authority/extract-simc-apl.mjs";
import assassinationArtifact from "../../src/simc/data/rogue-assassination.apl.json";
import protectionArtifact from "../../src/simc/data/paladin-protection.apl.json";
import retributionArtifact from "../../src/simc/data/paladin-retribution.apl.json";
import bloodArtifact from "../../src/simc/data/deathknight-blood.apl.json";

const PINNED_COMMIT = "33622e9d1662ff0e451691edf85a6b49cc9d11d9";

// ---------------------------------------------------------------------------
// Legacy marker artifacts
// ---------------------------------------------------------------------------

describe("the four committed marker-selected artifacts", () => {
  const CASES: readonly [string, unknown, string, string][] = [
    ["rogue-assassination", assassinationArtifact, "//assassination_apl_start", "//assassination_apl_end"],
    ["paladin-protection", protectionArtifact, "//protection_apl_start", "//protection_apl_end"],
    ["paladin-retribution", retributionArtifact, "//retribution_apl_start", "//retribution_apl_end"],
    ["deathknight-blood", bloodArtifact, "//blood_apl_start", "//blood_apl_end"],
  ];

  it.each(CASES)(
    "%s still validates, keeps its exact marker lines and carries no selector",
    (name, raw, start, end) => {
      const validation = validateAuthorityArtifact(raw);
      expect(validation.ok, name).toBe(true);
      if (!validation.ok) return;
      expect(validation.artifact.provenance.regionStartMarker).toBe(start);
      expect(validation.artifact.provenance.regionEndMarker).toBe(end);
      expect("regionSelector" in validation.artifact.provenance).toBe(false);
      // The committed JSON itself — not only the validated view — is the marker form.
      const provenance = (raw as { provenance: Record<string, unknown> }).provenance;
      expect(provenance["regionStartMarker"]).toBe(start);
      expect(provenance["regionEndMarker"]).toBe(end);
      expect("regionSelector" in provenance).toBe(false);
    },
  );

  it.each(CASES)("%s: its target still selects by marker lines", (name, _raw, start, end) => {
    const target = TARGETS[name];
    expect(target?.regionStart).toBe(start);
    expect(target?.regionEnd).toBe(end);
    expect(target?.enclosingNamespace).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// The namespace/function form, built by the extractor itself
// ---------------------------------------------------------------------------

const BREWMASTER = TARGETS["monk-brewmaster"] as AplExtractionTarget;

/** A minimal Brewmaster-shaped file; the real pinned file is validated locally. */
const SOURCE = [
  "namespace brewmaster",
  "{",
  "void default_apl( monk_t* player )",
  "{",
  '  action_priority_list_t* def = player->get_action_priority_list( "default" );',
  '  def->add_action( "auto_attack" );',
  "}",
  "};  // namespace brewmaster",
].join("\n");

function brewmasterArtifact(): Record<string, unknown> {
  return buildArtifact({
    target: BREWMASTER,
    extracted: extract(SOURCE, BREWMASTER),
    sourceSha256: "a8b7e2afe48425089cdc97a369fc4abe87784a818d0423ba0706fb60f1f53c20",
    sourceByteLength: SOURCE.length,
    sha: PINNED_COMMIT,
    branch: "midnight",
    commitDate: "2026-09-12",
    extractedOn: "2026-09-24",
  }) as Record<string, unknown>;
}

function withProvenance(patch: (provenance: Record<string, unknown>) => void): Record<string, unknown> {
  const artifact = structuredClone(brewmasterArtifact());
  patch(artifact["provenance"] as Record<string, unknown>);
  return artifact;
}

describe("the namespace/function selector provenance", () => {
  it("is one of the two selector kinds this build accepts", () => {
    // ONB-B2 added CLASS_METHOD, proven in onb-b2-class-method-extraction.
    expect(AUTHORITY_REGION_SELECTOR_KINDS).toEqual(["NAMESPACE_FUNCTION", "CLASS_METHOD", "INCLUDED_FILE"]);
  });

  it("an artifact built for the Brewmaster target validates and names its source coordinates", () => {
    const validation = validateAuthorityArtifact(brewmasterArtifact());
    expect(validation.ok).toBe(true);
    if (!validation.ok) return;
    expect(validation.artifact.provenance.regionSelector).toEqual({
      kind: "NAMESPACE_FUNCTION",
      enclosingNamespace: "brewmaster",
      functionHeader: "void default_apl( monk_t* player )",
      playerIdentifier: "player",
    });
  });

  it("does not claim a namespace line is a region marker", () => {
    const provenance = brewmasterArtifact()["provenance"] as Record<string, unknown>;
    expect("regionStartMarker" in provenance).toBe(false);
    expect("regionEndMarker" in provenance).toBe(false);
    expect(JSON.stringify(provenance)).not.toContain("namespace brewmaster");
  });

  it("sits where the marker fields sit, so marker artifacts serialise as before", () => {
    const keys = Object.keys(brewmasterArtifact()["provenance"] as Record<string, unknown>);
    expect(keys.indexOf("regionSelector")).toBe(keys.indexOf("sourceByteLength") + 1);
    expect(
      Object.keys((bloodArtifact as { provenance: object }).provenance).indexOf("regionStartMarker"),
    ).toBe(Object.keys((bloodArtifact as { provenance: object }).provenance).indexOf("sourceByteLength") + 1);
  });
});

// ---------------------------------------------------------------------------
// Refusals
// ---------------------------------------------------------------------------

describe("malformed region provenance is refused", () => {
  const REFUSED: readonly [string, (provenance: Record<string, unknown>) => void][] = [
    [
      "a selector missing its namespace",
      (p) => delete (p["regionSelector"] as Record<string, unknown>)["enclosingNamespace"],
    ],
    [
      "a selector missing its function header",
      (p) => delete (p["regionSelector"] as Record<string, unknown>)["functionHeader"],
    ],
    [
      "a selector missing its player identifier",
      (p) => delete (p["regionSelector"] as Record<string, unknown>)["playerIdentifier"],
    ],
    [
      "an empty namespace",
      (p) => ((p["regionSelector"] as Record<string, unknown>)["enclosingNamespace"] = ""),
    ],
    [
      "an empty function header",
      (p) => ((p["regionSelector"] as Record<string, unknown>)["functionHeader"] = ""),
    ],
    [
      "an empty player identifier",
      (p) => ((p["regionSelector"] as Record<string, unknown>)["playerIdentifier"] = ""),
    ],
    [
      "a namespace that is not an identifier",
      (p) => ((p["regionSelector"] as Record<string, unknown>)["enclosingNamespace"] = "brew master"),
    ],
    [
      "an unknown selector kind",
      (p) => ((p["regionSelector"] as Record<string, unknown>)["kind"] = "MARKER_LINES"),
    ],
    [
      "a selector with an unknown key",
      (p) => ((p["regionSelector"] as Record<string, unknown>)["regionStartMarker"] = "namespace brewmaster"),
    ],
    ["a selector that is not an object", (p) => (p["regionSelector"] = "NAMESPACE_FUNCTION")],
    ["a selector beside a start marker", (p) => (p["regionStartMarker"] = "namespace brewmaster")],
    ["a selector beside an end marker", (p) => (p["regionEndMarker"] = "};  // namespace brewmaster")],
    [
      "a selector beside both markers",
      (p) => {
        p["regionStartMarker"] = "//x_apl_start";
        p["regionEndMarker"] = "//x_apl_end";
      },
    ],
    ["no region provenance at all", (p) => delete p["regionSelector"]],
  ];

  it.each(REFUSED)("%s", (_label, patch) => {
    const validation = validateAuthorityArtifact(withProvenance(patch));
    expect(validation.ok).toBe(false);
    if (validation.ok) return;
    expect(validation.reason).toBe("MALFORMED_PROVENANCE");
  });

  it.each([
    ["a marker artifact missing its end marker", "regionEndMarker"],
    ["a marker artifact missing its start marker", "regionStartMarker"],
  ] as const)("%s", (_label, key) => {
    const artifact = structuredClone(bloodArtifact) as { provenance: Record<string, unknown> };
    delete artifact.provenance[key];
    const validation = validateAuthorityArtifact(artifact);
    expect(validation.ok).toBe(false);
  });
});
