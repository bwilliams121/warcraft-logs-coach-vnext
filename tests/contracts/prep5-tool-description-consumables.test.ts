/**
 * PREP-5: both MCP tool descriptions tell a model about the consumable status
 * every result already carries (PREP-2, PREP-3).
 *
 * A tool description is the only documentation a model reads before deciding
 * what a result means. The outputSchema advertised `preparation` but no prose
 * said what it was, so nothing stopped a model reading an UNKNOWN count's
 * `observedAtLeast` as the count, or a missing use as "should have used one".
 *
 * Three things are pinned, phrase by phrase so a tidy-up cannot soften them:
 *
 *   - the status is always there, unsupported specializations included;
 *   - UNKNOWN is never zero, and `observedAtLeast` is a lower bound;
 *   - the status is an observed fact with no "should have used" judgment.
 *
 * And one thing ties the prose to the contract: every field and value the
 * description names exists in that tool's advertised output schema, so the
 * description cannot drift to a name the client will never see.
 */

import { describe, expect, it } from "vitest";
import * as z from "zod";

import { PublicAnalysisResultSchema } from "../../src/contracts/analysis-contract.js";
import { PublicRaidNightResultSchema } from "../../src/contracts/raid-night-contract.js";
import { raidNightToolDescription } from "../../src/mcp/tools/analyze-raid-night.js";
import { analyzeToolDescription } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { PUBLIC_SPECIALIZATION_DESCRIPTIONS } from "../../src/services/analyzer-registry.js";

const flatten = (text: string): string => text.replace(/\s+/g, " ");

const SURFACES = [
  {
    label: "analyze_warcraft_log",
    description: flatten(analyzeToolDescription(PUBLIC_SPECIALIZATION_DESCRIPTIONS)),
    schemaJson: JSON.stringify(z.toJSONSchema(PublicAnalysisResultSchema, { io: "output" })),
    always: "Every result, on every status including SPEC_NOT_SUPPORTED, also carries preparation",
    namedFields: [
      "preparation",
      "countState",
      "OBSERVED",
      "UNKNOWN",
      "reasons",
      "observedAtLeast",
      "NOT_ASSESSED",
    ],
  },
  {
    label: "analyze_raid_night",
    description: flatten(raidNightToolDescription(PUBLIC_SPECIALIZATION_DESCRIPTIONS)),
    schemaJson: JSON.stringify(z.toJSONSchema(PublicRaidNightResultSchema, { io: "output" })),
    always: "Every present cell, whatever its kind, also carries preparation",
    namedFields: [
      "preparation",
      "countState",
      "OBSERVED",
      "UNKNOWN",
      "reasonCodes",
      "observedAtLeast",
      "NOT_ASSESSED",
    ],
  },
] as const;

const SHARED_PHRASES = [
  "health potion, healthstone and combat potion use",
  "specialization-independent and is not gameplay analysis",
  "observedAtLeast, which is a lower bound and NOT a count",
  "Zero is reported only under complete coverage",
  "an UNKNOWN must never be read as zero use",
  "nothing is claimed about consumables",
  "they do NOT say a consumable should have been used",
] as const;

describe("PREP-5: the tool descriptions state the consumable status", () => {
  for (const surface of SURFACES) {
    it(`${surface.label}: says the status is always carried`, () => {
      expect(surface.description).toContain(surface.always);
    });

    it(`${surface.label}: states what an OBSERVED and an UNKNOWN count mean, and that it is not a judgment`, () => {
      for (const phrase of SHARED_PHRASES) expect(surface.description, phrase).toContain(phrase);
    });

    it(`${surface.label}: names only fields the advertised output schema carries`, () => {
      for (const field of surface.namedFields) {
        expect(surface.description, field).toContain(field);
        expect(surface.schemaJson, field).toContain(`"${field}"`);
      }
    });

    it(`${surface.label}: makes no consumable judgment`, () => {
      for (const claim of ["should use", "forgot", "missed a potion", "failed to use", "potion score"]) {
        expect(surface.description, claim).not.toContain(claim);
      }
    });
  }
});
