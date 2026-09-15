/**
 * The raid-night request parser, its bounds, and the cost gate.
 *
 * WHAT THESE TESTS DEFEND
 *
 * Every bound here exists to be enforced BEFORE Warcraft Logs is touched, because
 * that is the only point where refusing is free. A limit checked after the first
 * query has already spent a paid quota on a request it was going to reject.
 *
 * And the fight cap is not a preference. It is derived from M7's OWN subrequest
 * safety budget and from `MAX_PAGES`, so the arithmetic is asserted rather than
 * the number: a future change to either constant must not silently make a
 * four-fight request unsafe.
 *
 * THE BUDGET IS OURS, NOT CLOUDFLARE'S. `RAID_NIGHT_SUBREQUEST_SAFETY_BUDGET` is
 * a product decision — the platform currently permits considerably more — and
 * these tests say so, because a cap believed to be a platform limit never gets
 * revisited. What they deliberately do not do is assert anything about
 * Cloudflare's documented maximum: a test encoding an external vendor number
 * would fail for reasons unrelated to this code.
 */

import { describe, expect, it } from "vitest";

import {
  fitsSubrequestBudget,
  MAX_RAID_NIGHT_CELLS,
  MAX_RAID_NIGHT_FIGHTS,
  MAX_RAID_NIGHT_PLAYERS,
  parseRaidNightRequest,
  projectWorstCaseRaidNightSubrequests,
  RAID_NIGHT_FIXED_SUBREQUESTS,
  RAID_NIGHT_SUBREQUEST_SAFETY_BUDGET,
  WORST_CASE_SUBREQUESTS_PER_FIGHT,
} from "../../src/services/raid-night-request.js";
import { MAX_PAGES } from "../../src/wcl/retrieval-plan.js";
import { NO_ACTOR_SENTINEL } from "../../src/engine/normalization/raw-event-fields.js";

const REPORT = "aBcDeFgH12345678";

function parse(input: unknown) {
  return parseRaidNightRequest(input);
}

function issuesOf(input: unknown): readonly string[] {
  const result = parse(input);
  if (result.ok) throw new Error("expected the request to be refused");
  return result.issues.map((issue) => issue.code);
}

describe("the report locator", () => {
  it("accepts an explicit report code", () => {
    const result = parse({ reportCode: REPORT, fightIds: [1] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.reportCode).toBe(REPORT);
  });

  it("accepts a Warcraft Logs report URL with no fight or source selector", () => {
    // A raid-night link names its fights separately, so requiring `#fight=` and
    // `#source=` — as the single-fight parser must — would reject a good link.
    const result = parse({
      reportUrl: `https://www.warcraftlogs.com/reports/${REPORT}`,
      fightIds: [3, 1],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.reportCode).toBe(REPORT);
  });

  it("ignores fight and source selectors present in the URL", () => {
    // They are single-fight vocabulary. `fightIds` is the authority here, and
    // silently honouring a URL selector would give one request two answers.
    const result = parse({
      reportUrl: `https://www.warcraftlogs.com/reports/${REPORT}#fight=9&source=42`,
      fightIds: [1],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.fightIds).toEqual([1]);
    expect(result.request.sourceIds).toBeUndefined();
  });

  it("reuses the single-fight host rule rather than inventing a second one", () => {
    expect(issuesOf({ reportUrl: "https://example.com/reports/abc12345", fightIds: [1] })).toContain(
      "NOT_A_WARCRAFT_LOGS_URL",
    );
    expect(issuesOf({ reportUrl: "not-a-url", fightIds: [1] })).toContain("INVALID_REPORT_URL");
    expect(issuesOf({ reportUrl: "https://www.warcraftlogs.com/zone/statistics", fightIds: [1] })).toContain(
      "MISSING_REPORT_CODE",
    );
  });

  it("refuses a request that supplies both a URL and a code", () => {
    // Resolved by a silent precedence rule the caller cannot see would be worse
    // than refusing.
    expect(
      issuesOf({
        reportUrl: `https://www.warcraftlogs.com/reports/${REPORT}`,
        reportCode: REPORT,
        fightIds: [1],
      }),
    ).toContain("CONFLICTING_REQUEST_FIELDS");
  });

  it("refuses a request that supplies neither", () => {
    expect(issuesOf({ fightIds: [1] })).toContain("MISSING_REQUEST_INPUT");
  });

  it("refuses a caller-supplied ingestion scope", () => {
    expect(issuesOf({ reportCode: REPORT, fightIds: [1], scope: "FULL_RAID" })).toContain(
      "CLIENT_SCOPE_NOT_ACCEPTED",
    );
  });

  it("refuses a non-object body", () => {
    expect(issuesOf("nope")).toContain("NOT_AN_OBJECT");
    expect(issuesOf(null)).toContain("NOT_AN_OBJECT");
    expect(issuesOf([1, 2])).toContain("NOT_AN_OBJECT");
  });
});

describe("fight selection is explicit and bounded", () => {
  it("refuses an omitted fight list", () => {
    // There is no "whole report" form: its cost cannot be bounded in advance.
    expect(issuesOf({ reportCode: REPORT })).toContain("MISSING_REQUEST_INPUT");
  });

  it("refuses an empty fight list", () => {
    // Empty would mean "every fight" upstream — the silent widening this refusal
    // exists to prevent.
    expect(issuesOf({ reportCode: REPORT, fightIds: [] })).toContain("MISSING_REQUEST_INPUT");
  });

  it("accepts one fight", () => {
    // No epistemic reason to demand two: a one-pull raid night is a real request.
    expect(parse({ reportCode: REPORT, fightIds: [7] }).ok).toBe(true);
  });

  it(`accepts ${String(MAX_RAID_NIGHT_FIGHTS)} fights`, () => {
    const result = parse({ reportCode: REPORT, fightIds: [1, 2, 3, 4] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.fightIds).toHaveLength(MAX_RAID_NIGHT_FIGHTS);
  });

  it(`refuses ${String(MAX_RAID_NIGHT_FIGHTS + 1)} fights, before any Warcraft Logs request`, () => {
    // Purely syntactic, so it costs nothing to refuse.
    expect(issuesOf({ reportCode: REPORT, fightIds: [1, 2, 3, 4, 5] })).toContain("REQUEST_LIMIT_EXCEEDED");
  });

  it("deduplicates and sorts ascending", () => {
    // Duplicated requested work has no meaning, so it is normalized rather than
    // rejected — and the canonical form is what gets charged, ordered and counted.
    const result = parse({ reportCode: REPORT, fightIds: [8, 7, 7] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.fightIds).toEqual([7, 8]);
  });

  it("counts fights AFTER deduplication against the cap", () => {
    // Five entries, four distinct fights. The request asks for four fights' work.
    const result = parse({ reportCode: REPORT, fightIds: [1, 1, 2, 3, 4] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.fightIds).toEqual([1, 2, 3, 4]);
  });

  it("refuses malformed fight ids", () => {
    expect(issuesOf({ reportCode: REPORT, fightIds: "1,2" })).toContain("INVALID_REQUEST_SHAPE");
    expect(issuesOf({ reportCode: REPORT, fightIds: [1.5] })).toContain("INVALID_REQUEST_SHAPE");
    expect(issuesOf({ reportCode: REPORT, fightIds: ["1"] })).toContain("INVALID_REQUEST_SHAPE");
    expect(issuesOf({ reportCode: REPORT, fightIds: [-2] })).toContain("INVALID_REQUEST_SHAPE");
  });
});

describe("player selection", () => {
  it("is absent when omitted, meaning every player in the selection", () => {
    const result = parse({ reportCode: REPORT, fightIds: [1] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Absent rather than an empty array, so "everyone" and "nobody" cannot be
    // confused.
    expect("sourceIds" in result.request).toBe(false);
  });

  it("accepts actor id 0", () => {
    // A real id in this data. A truthiness test anywhere on this path would drop
    // a real player.
    const result = parse({ reportCode: REPORT, fightIds: [1], sourceIds: [0] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.sourceIds).toEqual([0]);
  });

  it("refuses the -1 unknown-actor sentinel", () => {
    expect(issuesOf({ reportCode: REPORT, fightIds: [1], sourceIds: [19, NO_ACTOR_SENTINEL] })).toContain(
      "INVALID_REQUEST_SHAPE",
    );
  });

  it("pins the sentinel it refuses against the canonical constant", () => {
    // The parser hard-codes -1 to avoid reaching into the normalization layer.
    // This is what keeps the two from drifting.
    expect(NO_ACTOR_SENTINEL).toBe(-1);
  });

  it("refuses an empty explicit list", () => {
    expect(issuesOf({ reportCode: REPORT, fightIds: [1], sourceIds: [] })).toContain("INVALID_REQUEST_SHAPE");
  });

  it(`accepts ${String(MAX_RAID_NIGHT_PLAYERS)} players`, () => {
    const sourceIds = Array.from({ length: MAX_RAID_NIGHT_PLAYERS }, (_, index) => index);
    const result = parse({ reportCode: REPORT, fightIds: [1], sourceIds });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.sourceIds).toHaveLength(MAX_RAID_NIGHT_PLAYERS);
  });

  it(`refuses ${String(MAX_RAID_NIGHT_PLAYERS + 1)} players, before any Warcraft Logs request`, () => {
    const sourceIds = Array.from({ length: MAX_RAID_NIGHT_PLAYERS + 1 }, (_, index) => index);
    expect(issuesOf({ reportCode: REPORT, fightIds: [1], sourceIds })).toContain("REQUEST_LIMIT_EXCEEDED");
  });

  it("deduplicates and sorts ascending, with 0 first", () => {
    const result = parse({ reportCode: REPORT, fightIds: [1], sourceIds: [19, 0, 19, 7] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.sourceIds).toEqual([0, 7, 19]);
  });
});

describe("the worst-case cost gate measures against OUR budget, not the platform's", () => {
  it("is built from the constants it claims to be built from", () => {
    // The fight cap is DERIVED. Asserting the arithmetic rather than the number
    // means a change to `MAX_PAGES` or the budget cannot silently invalidate it.
    expect(WORST_CASE_SUBREQUESTS_PER_FIGHT).toBe(MAX_PAGES + 2);
    expect(RAID_NIGHT_FIXED_SUBREQUESTS).toBe(2);
    expect(projectWorstCaseRaidNightSubrequests(3)).toBe(2 + 3 * (MAX_PAGES + 2));
  });

  it("reads M3's page ceiling rather than a copy of it", () => {
    // M7-F reframed the budget as an application safety ceiling and touched M3's
    // COMMENT only. This pins that nothing about M3's retrieval behaviour moved
    // with it: the gate's per-fight cost is still whatever `MAX_PAGES` currently
    // is, and that is still 200.
    expect(MAX_PAGES).toBe(200);
    expect(projectWorstCaseRaidNightSubrequests(MAX_RAID_NIGHT_FIGHTS)).toBe(810);
    expect(projectWorstCaseRaidNightSubrequests(MAX_RAID_NIGHT_FIGHTS + 1)).toBe(1012);
  });

  it("names the budget as an application safety ceiling", () => {
    // THE DISTINCTION THIS PINS. 1000 is a number M7 chose for itself; Cloudflare
    // Workers Paid currently documents 10,000 subrequests per invocation. The
    // exported name has to say which kind of number it is, because a value
    // believed to be a platform limit gets treated as unarguable while a value
    // known to be a choice gets revisited with evidence.
    //
    // Deliberately NOT asserted here: anything about Cloudflare's current
    // documented maximum. A test that encoded an external vendor number would be
    // a tripwire on someone else's documentation, and would fail for a reason
    // that has nothing to do with this code. That number belongs in comments.
    expect(RAID_NIGHT_SUBREQUEST_SAFETY_BUDGET).toBe(1000);
  });

  it(`fits the application budget at ${String(MAX_RAID_NIGHT_FIGHTS)} fights`, () => {
    expect(projectWorstCaseRaidNightSubrequests(MAX_RAID_NIGHT_FIGHTS)).toBeLessThanOrEqual(
      RAID_NIGHT_SUBREQUEST_SAFETY_BUDGET,
    );
    expect(fitsSubrequestBudget(MAX_RAID_NIGHT_FIGHTS)).toBe(true);
  });

  it(`exceeds the application budget at ${String(MAX_RAID_NIGHT_FIGHTS + 1)} fights`, () => {
    // This is WHY the cap is 4 — and it says four is the most OUR budget allows,
    // not the most Cloudflare allows. Asserted independently of the parser, which
    // also refuses five, so raising the cap alone would still fail here.
    expect(projectWorstCaseRaidNightSubrequests(MAX_RAID_NIGHT_FIGHTS + 1)).toBeGreaterThan(
      RAID_NIGHT_SUBREQUEST_SAFETY_BUDGET,
    );
    expect(fitsSubrequestBudget(MAX_RAID_NIGHT_FIGHTS + 1)).toBe(false);
  });

  it("proves the cap is the largest value that fits that budget", () => {
    // Both halves together are the derivation: 4 fits, 5 does not, so 4 is it.
    expect(fitsSubrequestBudget(MAX_RAID_NIGHT_FIGHTS)).toBe(true);
    expect(fitsSubrequestBudget(MAX_RAID_NIGHT_FIGHTS + 1)).toBe(false);
  });

  it("derives the cell cap from the two it depends on", () => {
    expect(MAX_RAID_NIGHT_CELLS).toBe(MAX_RAID_NIGHT_FIGHTS * MAX_RAID_NIGHT_PLAYERS);
    expect(MAX_RAID_NIGHT_CELLS).toBe(100);
  });
});
