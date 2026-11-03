/**
 * M15-F contract: the coverage-disclosure vocabularies and shapes.
 *
 * - The raid night's disclosure codes are declared in the contract and pinned
 *   equal to the aggregation domain's; the single-fight TLDR/report codes
 *   gained exactly the two unsummarized-block codes, appended, and HEAL-AP
 *   appended two more after them.
 * - The schema can only express a PARTIAL, non-empty disclosure: no other
 *   scope, no empty list, no unknown code, and nowhere to put a score.
 */

import { describe, expect, it } from "vitest";

import {
  RAID_NIGHT_DISCLOSURES,
  RAID_NIGHT_DISCLOSURE_REVISION,
} from "../../src/aggregation/raid-night-disclosure.js";
import { PUBLIC_TLDR_DISCLOSURES } from "../../src/contracts/analysis-contract.js";
import {
  PUBLIC_RAID_NIGHT_DISCLOSURES,
  RaidNightCoverageDisclosureSchema,
} from "../../src/contracts/raid-night-contract.js";
import { TLDR_DISCLOSURES, UNSUMMARIZED_BLOCKS } from "../../src/reporting/tldr.js";

const VALID = {
  revision: "raid-night-coverage-disclosure/1",
  assessmentScope: "PARTIAL",
  disclosures: ["NO_CELL_ANALYZED", "PER_FIGHT_PRESENTATION_NOT_INCLUDED"],
  lines: ["No player-fight cell was analyzed."],
};

describe("the vocabularies", () => {
  it("the public raid-night codes equal the domain's, and the revision is the published literal", () => {
    expect([...PUBLIC_RAID_NIGHT_DISCLOSURES]).toEqual([...RAID_NIGHT_DISCLOSURES]);
    expect(RAID_NIGHT_DISCLOSURE_REVISION).toBe(VALID.revision);
  });

  it("the single-fight codes equal the reporting module's; M15-F appended two and HEAL-AP two more", () => {
    expect([...PUBLIC_TLDR_DISCLOSURES]).toEqual([...TLDR_DISCLOSURES]);
    expect(PUBLIC_TLDR_DISCLOSURES.slice(-4)).toEqual([
      "SUPPORT_OBSERVATIONS_NOT_SUMMARIZED",
      "RAID_COOLDOWN_PLAN_NOT_EVALUATED",
      "HEALER_FINDINGS_NOT_SUMMARIZED",
      "RAID_COOLDOWN_PLAN_NOT_SUMMARIZED",
    ]);
    expect([...UNSUMMARIZED_BLOCKS]).toEqual([
      "SUPPORT_OBSERVATIONS",
      "RAID_COOLDOWN_PLAN",
      "HEALER_FINDINGS",
      "RAID_COOLDOWN_PLAN_EVALUATED",
    ]);
  });
});

describe("the raid-night disclosure schema", () => {
  it("accepts a PARTIAL, non-empty disclosure", () => {
    expect(RaidNightCoverageDisclosureSchema.safeParse(VALID).success).toBe(true);
  });

  it("refuses any other scope, an empty list, an unknown code, no lines, or an extra field", () => {
    for (const invalid of [
      { ...VALID, assessmentScope: "COMPLETE" },
      { ...VALID, disclosures: [] },
      { ...VALID, disclosures: ["CLEAN_PLAY"] },
      { ...VALID, lines: [] },
      { ...VALID, score: 100 },
      { ...VALID, revision: "raid-night-coverage-disclosure/2" },
    ]) {
      expect(RaidNightCoverageDisclosureSchema.safeParse(invalid).success, JSON.stringify(invalid)).toBe(
        false,
      );
    }
  });
});
