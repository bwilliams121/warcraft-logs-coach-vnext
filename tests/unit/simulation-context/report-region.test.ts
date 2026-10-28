/**
 * M11-G4-1: `Report.region` is requested by the production fight-context query
 * and decoded as evidence. Absence is never a region, and a missing region
 * never fails an otherwise sound ingestion.
 */

import { describe, expect, it } from "vitest";

import {
  decodeFightContext,
  decodeReportRegion,
  FIGHT_CONTEXT_QUERY,
} from "../../../src/wcl/fight-context-query.js";
import { artifactJson, SUBJECT } from "../../support/m11/g2-four-fights.js";

describe("report region evidence", () => {
  it("the production fight-context query requests region { slug }", () => {
    expect(FIGHT_CONTEXT_QUERY).toMatch(/region \{\s+slug\s+\}/);
  });

  it("KNOWN only for a non-empty slug; null or malformed is NOT_SUPPLIED; an absent key is NOT_RETRIEVED", () => {
    expect(decodeReportRegion({ region: { id: 1, slug: "US", name: "United States" } })).toEqual({
      state: "KNOWN",
      slug: "US",
    });
    expect(decodeReportRegion({ region: null })).toEqual({ state: "NOT_SUPPLIED" });
    expect(decodeReportRegion({ region: { slug: "" } })).toEqual({ state: "NOT_SUPPLIED" });
    expect(decodeReportRegion({ region: { slug: 1 } })).toEqual({ state: "NOT_SUPPLIED" });
    expect(decodeReportRegion({ region: "US" })).toEqual({ state: "NOT_SUPPLIED" });
    expect(decodeReportRegion({})).toEqual({ state: "NOT_RETRIEVED" });
  });

  it("a committed capture made before the field was requested decodes as NOT_RETRIEVED, not as a failure", () => {
    const decoded = decodeFightContext(artifactJson(SUBJECT.contextId));
    if (!decoded.ok || decoded.value.report === null) throw new Error("decode");
    expect(decoded.value.report.region).toEqual({ state: "NOT_RETRIEVED" });
  });
});
