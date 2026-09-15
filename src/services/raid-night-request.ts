/**
 * The canonical raid-night request, its bounds, and the cost gate.
 *
 * ONE PARSER FOR BOTH TRANSPORTS. REST and MCP shape their inputs differently —
 * MCP needs a discriminated union so a model can see the two forms are exclusive
 * — but both funnel through `parseRaidNightRequest`, so there is exactly one
 * authority on what a valid raid-night request is. A second parser would drift,
 * and the drift would be invisible until the two disagreed about a real URL.
 *
 * WHY FIGHT IDS ARE REQUIRED, AND WHY THERE IS NO "ALL FIGHTS"
 *
 * Cost must be knowable before anything expensive runs. An explicit list makes
 * the worst case arithmetic; "the whole report" makes it unbounded, and a caller
 * pasting a twelve-hour log would spend a paid quota nobody budgeted. M7-C
 * already refuses an empty selection for the same reason: omitting `fightIDs`
 * upstream returns every fight, so "the fights I chose" would silently become
 * "everything".
 *
 * WHAT THIS MODULE DELIBERATELY DOES NOT DO
 *
 * No network, no clock, no randomness. It cannot tell whether a report exists,
 * whether a fight is in it, or who played — those are facts only roster
 * discovery can establish, and pretending to check them here would just move the
 * lie earlier.
 */

import { parseReportCodeFromUrl } from "../wcl/report-url.js";
import { MAX_PAGES } from "../wcl/retrieval-plan.js";
import type { RequestIssue } from "./result.js";

/**
 * The most fights one raid-night request may name.
 *
 * DERIVED FROM THIS PROJECT'S OWN SAFETY BUDGET, not from a platform ceiling.
 * See `projectWorstCaseRaidNightSubrequests`: at `MAX_PAGES` per fight, five
 * fights exceed `RAID_NIGHT_SUBREQUEST_SAFETY_BUDGET` and four do not.
 *
 * SAY THIS PRECISELY. Four is the largest fight count permitted by M7's
 * deliberately conservative 1000-subrequest APPLICATION budget under
 * `MAX_PAGES = 200`. It is NOT the largest count Cloudflare permits — the
 * Workers Paid platform currently allows far more (see the budget constant) — and
 * describing it as a platform maximum would misrepresent a product decision as a
 * physical constraint, which is exactly the kind of claim that survives long
 * after the number behind it has changed.
 */
export const MAX_RAID_NIGHT_FIGHTS = 4;

/**
 * The most players one raid-night request may analyze.
 *
 * A CONSERVATIVE PRODUCT BOUND, and honestly not a proven one.
 *
 * WHAT THE PLATFORM DOCUMENTS (September 2026), and what it does not settle:
 *
 *     memory per isolate            128 MB
 *     Workers Paid CPU, default     30 seconds
 *     Workers Paid CPU, max         5 minutes (configurable)
 *
 * This repository requests no CPU override — `wrangler.jsonc` carries no
 * `limits.cpu_ms` — so the default applies.
 *
 * Those are platform numbers, not measurements of THIS workload inside a
 * Cloudflare isolate, and nothing here has measured that. Orchestration builds
 * one `CombatState` at a time and releases it, so peak memory does not scale with
 * player count; CPU does. What must fit the 128 MB isolate is one fight core plus
 * one `CombatState` plus the accumulated cells — not twenty states — and that
 * shape is what the sequential loop exists to guarantee.
 *
 * 25 covers a mythic roster with room to spare. It is chosen to sit well below
 * limits this workload has not been measured against, and it should move on
 * measurements rather than on intuition. The production smoke is the first real
 * evidence.
 */
export const MAX_RAID_NIGHT_PLAYERS = 25;

/** Derived, never independent: `MAX_RAID_NIGHT_FIGHTS × MAX_RAID_NIGHT_PLAYERS`. */
export const MAX_RAID_NIGHT_CELLS = MAX_RAID_NIGHT_FIGHTS * MAX_RAID_NIGHT_PLAYERS;

/**
 * M7's self-imposed subrequest ceiling for one raid-night request.
 *
 * AN APPLICATION SAFETY BUDGET, NOT THE PLATFORM LIMIT. The Cloudflare Workers
 * Paid plan currently documents 10,000 subrequests per invocation; M7 holds
 * itself to a tenth of that for its first production slice.
 *
 * WHY DELIBERATELY STRICTER
 *
 * A subrequest ceiling is not the only thing a long request can exhaust. Each
 * page costs CPU to normalize and wall-clock to fetch, and this workload has
 * never run inside a Cloudflare isolate at raid-night scale. Spending the whole
 * platform allowance would mean discovering the real constraint — CPU, memory, or
 * an upstream that slowed down — after several minutes and most of a paid
 * Warcraft Logs quota had already gone. A tighter budget fails the request
 * cheaply, before anything is spent, and nothing is lost: it is a product
 * decision that can be widened on evidence.
 *
 * An earlier revision of this file called 1000 the paid platform allowance. That
 * was stale, and the correction matters beyond tidiness: a number believed to be
 * a physical limit gets treated as unarguable, while a number known to be a
 * choice gets revisited with measurements.
 *
 * Raising this is a deliberate M8+ decision, not a fix for a caller who wants a
 * fifth fight.
 */
export const RAID_NIGHT_SUBREQUEST_SAFETY_BUDGET = 1000;

/**
 * Fixed per-report calls a raid night makes regardless of fight count.
 *
 * One roster discovery query, and one final report-revision confirmation.
 */
export const RAID_NIGHT_FIXED_SUBREQUESTS = 2;

/** Worst case per ingested fight: one context query, `MAX_PAGES` event pages, one revision recheck. */
export const WORST_CASE_SUBREQUESTS_PER_FIGHT = MAX_PAGES + 2;

/**
 * The worst-case subrequest count for a raid night of `fightCount` fights.
 *
 * WORST CASE, NOT EXPECTED CASE, AND THAT IS THE POINT. A measured full heroic
 * pull took 40 pages, so an average-case estimate would permit far more fights —
 * and then one unusually long pull would blow the budget mid-request, after most
 * of the paid Warcraft Logs quota had already been spent. The bound is what
 * `MAX_PAGES` actually allows, so a request that passes this gate cannot exceed
 * the application budget no matter what the report contains.
 *
 * Fight duration is deliberately not consulted. It would be a guess at page
 * count dressed as a calculation.
 */
export function projectWorstCaseRaidNightSubrequests(fightCount: number): number {
  return RAID_NIGHT_FIXED_SUBREQUESTS + fightCount * WORST_CASE_SUBREQUESTS_PER_FIGHT;
}

/**
 * Whether a fight count fits M7's OWN subrequest safety budget.
 *
 * Not "whether Cloudflare would permit it". The platform would permit
 * considerably more; this asks whether the request stays inside the ceiling this
 * milestone chose for itself.
 */
export function fitsSubrequestBudget(fightCount: number): boolean {
  return projectWorstCaseRaidNightSubrequests(fightCount) <= RAID_NIGHT_SUBREQUEST_SAFETY_BUDGET;
}

/**
 * The `-1` no-actor sentinel, refused as a requested player.
 *
 * Imported as a literal rather than from the normalization layer: this module
 * sits in the application layer and has no business reaching into the event
 * normalizer. The value is pinned by a test against the canonical constant so
 * the two cannot drift.
 */
const NO_ACTOR_SENTINEL = -1;

export interface RaidNightRequestInput {
  readonly reportUrl?: string;
  readonly reportCode?: string;
  readonly fightIds?: readonly number[];
  readonly sourceIds?: readonly number[];
}

/**
 * One raid-night request, normalized.
 *
 * `fightIds` is deduplicated and ascending. `sourceIds` is absent when the
 * caller wants every player in the selected-fight roster — absent rather than
 * an empty array, so "everyone" and "nobody" cannot be confused.
 */
export interface RaidNightRequest {
  readonly reportCode: string;
  readonly fightIds: readonly number[];
  readonly sourceIds?: readonly number[];
}

export type RaidNightRequestParseResult =
  | { readonly ok: true; readonly request: RaidNightRequest }
  | { readonly ok: false; readonly issues: readonly RequestIssue[] };

/** Field names that would let a caller influence ingestion scope. Rejected outright. */
const SCOPE_FIELD_NAMES = ["scope", "ingestionScope", "ingestion_scope"] as const;

const REPORT_CODE_PATTERN = /^[a-zA-Z0-9]{8,}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads a list of actor-or-fight ids.
 *
 * Deduplicates and sorts ascending. Duplicated requested work has no meaning —
 * `[7, 7, 8]` asks for the same two fights as `[7, 8]` — so it is normalized
 * rather than rejected, and the canonical form is what everything downstream
 * counts, charges and orders by.
 *
 * Every comparison is explicit. Actor id `0` is a real id in this data, so a
 * truthiness test anywhere here would silently drop a real player.
 */
function readIdList(
  value: unknown,
  field: "fightIds" | "sourceIds",
  issues: RequestIssue[],
): readonly number[] | undefined {
  if (!Array.isArray(value)) {
    issues.push({
      code: "INVALID_REQUEST_SHAPE",
      field,
      message: `${field} must be an array of integers.`,
    });
    return undefined;
  }

  const seen = new Set<number>();
  for (const entry of value) {
    if (typeof entry !== "number" || !Number.isSafeInteger(entry)) {
      issues.push({
        code: "INVALID_REQUEST_SHAPE",
        field,
        message: `${field} must contain only safe integers.`,
      });
      return undefined;
    }
    if (entry === NO_ACTOR_SENTINEL) {
      issues.push({
        code: "INVALID_REQUEST_SHAPE",
        field,
        // `-1` is Warcraft Logs' explicit "no actor was identified". It is not an
        // actor that happens to be missing, and it must never become a player.
        message: `${field} must not contain -1, which is the unknown-actor sentinel rather than a real id.`,
      });
      return undefined;
    }
    if (entry < 0) {
      issues.push({
        code: "INVALID_REQUEST_SHAPE",
        field,
        message: `${field} must contain only non-negative integers.`,
      });
      return undefined;
    }
    seen.add(entry);
  }

  return [...seen].sort((left, right) => left - right);
}

/**
 * Normalizes caller input into a canonical `RaidNightRequest`.
 *
 * Accepts either a Warcraft Logs report URL or an explicit report code, never a
 * mixture: a conflicting request is rejected rather than resolved by a silent
 * precedence rule the caller cannot see. That is the same rule
 * `parseAnalysisRequest` applies, for the same reason.
 */
export function parseRaidNightRequest(input: unknown): RaidNightRequestParseResult {
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [{ code: "NOT_AN_OBJECT", field: "body", message: "Request body must be a JSON object." }],
    };
  }

  const suppliedScopeField = SCOPE_FIELD_NAMES.find((name) => input[name] !== undefined);
  if (suppliedScopeField !== undefined) {
    return {
      ok: false,
      issues: [
        {
          code: "CLIENT_SCOPE_NOT_ACCEPTED",
          field: suppliedScopeField,
          message:
            "Ingestion scope is not selectable by callers. It is derived from the analyzers selected for each fight.",
        },
      ],
    };
  }

  const hasUrl = input["reportUrl"] !== undefined && input["reportUrl"] !== null;
  const hasCode = input["reportCode"] !== undefined && input["reportCode"] !== null;

  if (hasUrl && hasCode) {
    return {
      ok: false,
      issues: [
        {
          code: "CONFLICTING_REQUEST_FIELDS",
          field: "reportUrl",
          message: "Provide either reportUrl or reportCode, not both.",
        },
      ],
    };
  }
  if (!hasUrl && !hasCode) {
    return {
      ok: false,
      issues: [
        {
          code: "MISSING_REQUEST_INPUT",
          field: "body",
          message: "Provide either reportUrl or reportCode.",
        },
      ],
    };
  }

  const issues: RequestIssue[] = [];
  let reportCode: string | undefined;

  if (hasUrl) {
    const raw = input["reportUrl"];
    if (typeof raw !== "string") {
      issues.push({ code: "INVALID_REPORT_URL", field: "reportUrl", message: "reportUrl must be a string." });
    } else {
      // The SAME host and code rules the single-fight parser uses. A raid-night
      // link carries no fight or source selector, so only the code is read.
      const parsed = parseReportCodeFromUrl(raw);
      if (parsed.ok) {
        reportCode = parsed.reportCode;
      } else {
        issues.push(...parsed.issues);
      }
    }
  } else {
    const raw = input["reportCode"];
    if (typeof raw !== "string" || !REPORT_CODE_PATTERN.test(raw)) {
      issues.push({
        code: "INVALID_REPORT_CODE",
        field: "reportCode",
        message: "reportCode must be a valid Warcraft Logs report code.",
      });
    } else {
      reportCode = raw;
    }
  }

  // ---- fights: required, explicit, bounded ----
  const rawFights = input["fightIds"];
  let fightIds: readonly number[] | undefined;
  if (rawFights === undefined || rawFights === null) {
    issues.push({
      code: "MISSING_REQUEST_INPUT",
      field: "fightIds",
      message: `fightIds is required. Name 1 to ${String(MAX_RAID_NIGHT_FIGHTS)} fights explicitly; there is no "all fights" form, because its cost cannot be bounded in advance.`,
    });
  } else {
    fightIds = readIdList(rawFights, "fightIds", issues);
    if (fightIds !== undefined) {
      if (fightIds.length === 0) {
        issues.push({
          code: "MISSING_REQUEST_INPUT",
          field: "fightIds",
          // Empty would mean "every fight" upstream, which is the silent
          // widening this refusal exists to prevent.
          message: "fightIds must name at least one fight.",
        });
        fightIds = undefined;
      } else if (fightIds.length > MAX_RAID_NIGHT_FIGHTS) {
        issues.push({
          code: "REQUEST_LIMIT_EXCEEDED",
          field: "fightIds",
          message: `A raid-night request may name at most ${String(MAX_RAID_NIGHT_FIGHTS)} distinct fights. This one names ${String(fightIds.length)}.`,
        });
        fightIds = undefined;
      } else if (!fitsSubrequestBudget(fightIds.length)) {
        // Unreachable while the cap above is derived from this budget. Checked
        // anyway so a future constant change cannot silently invalidate it.
        issues.push({
          code: "REQUEST_LIMIT_EXCEEDED",
          field: "fightIds",
          message: `That many fights could exceed this deployment's request budget in the worst case.`,
        });
        fightIds = undefined;
      }
    }
  }

  // ---- players: optional, bounded when explicit ----
  const rawSources = input["sourceIds"];
  let sourceIds: readonly number[] | undefined;
  let sourcesInvalid = false;
  if (rawSources !== undefined && rawSources !== null) {
    sourceIds = readIdList(rawSources, "sourceIds", issues);
    if (sourceIds === undefined) {
      sourcesInvalid = true;
    } else if (sourceIds.length === 0) {
      issues.push({
        code: "INVALID_REQUEST_SHAPE",
        field: "sourceIds",
        // Omit the field to mean "everyone". An empty list would be ambiguous
        // between that and "nobody", and one of those readings is useless.
        message: "sourceIds must not be empty. Omit it entirely to analyze every player in the selection.",
      });
      sourcesInvalid = true;
    } else if (sourceIds.length > MAX_RAID_NIGHT_PLAYERS) {
      issues.push({
        code: "REQUEST_LIMIT_EXCEEDED",
        field: "sourceIds",
        message: `A raid-night request may name at most ${String(MAX_RAID_NIGHT_PLAYERS)} distinct players. This one names ${String(sourceIds.length)}.`,
      });
      sourcesInvalid = true;
    }
  }

  if (issues.length > 0 || reportCode === undefined || fightIds === undefined || sourcesInvalid) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    request: { reportCode, fightIds, ...(sourceIds === undefined ? {} : { sourceIds }) },
  };
}
