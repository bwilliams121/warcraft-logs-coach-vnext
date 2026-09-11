/**
 * Warcraft Logs report URL parsing.
 *
 * URL shape is Warcraft Logs knowledge, so it lives behind the WCL boundary.
 * This module performs no network access — it only reads a URL a user pasted.
 *
 * Warcraft Logs places fight and actor selectors in either the query string
 * (`?fight=3&source=12`) or, more commonly, the fragment
 * (`#fight=8&type=damage-done&source=15`). Both are supported.
 *
 * Everything here fails closed. A URL that does not identify exactly one fight
 * and exactly one actor is rejected with a typed issue rather than partially
 * parsed, because nothing downstream can pick the intended player for the user.
 */

import type { RequestIssue } from "../services/result.js";

export interface ParsedReportUrl {
  readonly reportCode: string;
  readonly fightId: number;
  readonly sourceId: number;
}

export type ReportUrlParseResult =
  | { readonly ok: true; readonly value: ParsedReportUrl }
  | { readonly ok: false; readonly issues: readonly RequestIssue[] };

const WCL_HOST = "warcraftlogs.com";

/**
 * Lenient shape check. Report codes are alphanumeric; authoritative validation
 * happens when the report is actually requested from Warcraft Logs.
 */
const REPORT_CODE_PATTERN = /^[a-zA-Z0-9]{8,}$/;

function isWarcraftLogsHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return host === WCL_HOST || host.endsWith(`.${WCL_HOST}`);
}

/** Reads a selector from the query string, falling back to the URL fragment. */
function readSelector(url: URL, name: string): string | undefined {
  const fromQuery = url.searchParams.get(name);
  if (fromQuery !== null) {
    return fromQuery;
  }

  const fragment = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  if (fragment.length === 0) {
    return undefined;
  }

  const fromFragment = new URLSearchParams(fragment).get(name);
  return fromFragment === null ? undefined : fromFragment;
}

function parsePositiveInteger(raw: string): number | undefined {
  if (!/^\d+$/.test(raw)) {
    return undefined;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function extractReportCode(url: URL): string | undefined {
  const segments = url.pathname.split("/").filter((segment) => segment.length > 0);
  const reportsIndex = segments.indexOf("reports");
  if (reportsIndex === -1) {
    return undefined;
  }
  return segments[reportsIndex + 1];
}

export function parseReportUrl(raw: string): ReportUrlParseResult {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return {
      ok: false,
      issues: [
        {
          code: "INVALID_REPORT_URL",
          field: "reportUrl",
          message: "reportUrl is not a valid URL.",
        },
      ],
    };
  }

  if (!isWarcraftLogsHost(url.hostname)) {
    return {
      ok: false,
      issues: [
        {
          code: "NOT_A_WARCRAFT_LOGS_URL",
          field: "reportUrl",
          message: "reportUrl must be a warcraftlogs.com report URL.",
        },
      ],
    };
  }

  const issues: RequestIssue[] = [];

  const reportCode = extractReportCode(url);
  if (reportCode === undefined) {
    issues.push({
      code: "MISSING_REPORT_CODE",
      field: "reportUrl",
      message: "reportUrl does not contain a report code (expected /reports/<code>).",
    });
  } else if (!REPORT_CODE_PATTERN.test(reportCode)) {
    issues.push({
      code: "INVALID_REPORT_CODE",
      field: "reportUrl",
      message: "The report code in reportUrl is not a valid Warcraft Logs report code.",
    });
  }

  const rawFight = readSelector(url, "fight");
  let fightId: number | undefined;
  if (rawFight === undefined || rawFight.length === 0) {
    issues.push({
      code: "MISSING_FIGHT_ID",
      field: "fight",
      message: "reportUrl must identify a single fight (for example #fight=8).",
    });
  } else if (rawFight === "last") {
    // Resolving "last" requires report data this layer does not have, and
    // guessing a fight would silently analyze the wrong pull.
    issues.push({
      code: "UNSUPPORTED_FIGHT_SELECTOR",
      field: "fight",
      message: "fight=last is not supported. Link a specific fight, for example #fight=8.",
    });
  } else {
    fightId = parsePositiveInteger(rawFight);
    if (fightId === undefined) {
      issues.push({
        code: "INVALID_FIGHT_ID",
        field: "fight",
        message: "fight must be a non-negative integer.",
      });
    }
  }

  const rawSource = readSelector(url, "source");
  let sourceId: number | undefined;
  if (rawSource === undefined || rawSource.length === 0) {
    // Required. A fight contains many actors and nothing downstream can infer
    // which player the user meant.
    issues.push({
      code: "MISSING_SOURCE_ID",
      field: "source",
      message:
        "reportUrl must identify a single player (for example #source=15). Select the player on Warcraft Logs, then copy the URL.",
    });
  } else {
    sourceId = parsePositiveInteger(rawSource);
    if (sourceId === undefined) {
      issues.push({
        code: "INVALID_SOURCE_ID",
        field: "source",
        message: "source must be a non-negative integer.",
      });
    }
  }

  if (issues.length > 0 || reportCode === undefined || fightId === undefined || sourceId === undefined) {
    return { ok: false, issues };
  }

  return { ok: true, value: { reportCode, fightId, sourceId } };
}
