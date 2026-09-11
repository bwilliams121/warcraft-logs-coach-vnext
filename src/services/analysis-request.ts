/**
 * Canonical analysis request.
 *
 * A request identifies exactly one player in exactly one fight in one report.
 * All three identifiers are required: a fight contains many actors, and nothing
 * downstream can infer which player the user meant. A future web UI may add
 * player selection; that changes the UI, not the analyzer.
 *
 * There is deliberately no ingestion-scope field. Callers do not select scope —
 * see `ingestion-scope.ts`.
 */

import { parseReportUrl } from "../wcl/report-url.js";
import type { RequestIssue } from "./result.js";

export interface AnalysisRequestInput {
  readonly reportUrl?: string;
  readonly reportCode?: string;
  readonly fightId?: number;
  readonly sourceId?: number;
}

export interface AnalysisRequest {
  readonly reportCode: string;
  readonly fightId: number;
  readonly sourceId: number;
}

export type AnalysisRequestParseResult =
  | { readonly ok: true; readonly request: AnalysisRequest }
  | { readonly ok: false; readonly issues: readonly RequestIssue[] };

/** Field names that would let a caller influence ingestion scope. Rejected outright. */
const SCOPE_FIELD_NAMES = ["scope", "ingestionScope", "ingestion_scope"] as const;

const REPORT_CODE_PATTERN = /^[a-zA-Z0-9]{8,}$/;

const EXPLICIT_FIELDS = ["reportCode", "fightId", "sourceId"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateId(
  value: unknown,
  field: "fightId" | "sourceId",
  missingCode: "MISSING_FIGHT_ID" | "MISSING_SOURCE_ID",
  invalidCode: "INVALID_FIGHT_ID" | "INVALID_SOURCE_ID",
  issues: RequestIssue[],
): number | undefined {
  if (value === undefined || value === null) {
    issues.push({
      code: missingCode,
      field,
      message: `${field} is required.`,
    });
    return undefined;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    issues.push({
      code: invalidCode,
      field,
      message: `${field} must be a non-negative integer.`,
    });
    return undefined;
  }
  return value;
}

/**
 * Normalizes caller input into a canonical `AnalysisRequest`.
 *
 * Accepts either a Warcraft Logs URL or the explicit identifier triple, never a
 * mixture: a conflicting request is rejected rather than resolved by a silent
 * precedence rule the caller cannot see.
 */
export function parseAnalysisRequest(input: unknown): AnalysisRequestParseResult {
  if (!isRecord(input)) {
    return {
      ok: false,
      issues: [
        {
          code: "NOT_AN_OBJECT",
          field: "body",
          message: "Request body must be a JSON object.",
        },
      ],
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
            "Ingestion scope is not selectable by callers. It is derived from the enabled analysis requirements.",
        },
      ],
    };
  }

  const hasUrl = input["reportUrl"] !== undefined && input["reportUrl"] !== null;
  const suppliedExplicitFields = EXPLICIT_FIELDS.filter(
    (field) => input[field] !== undefined && input[field] !== null,
  );

  if (hasUrl && suppliedExplicitFields.length > 0) {
    return {
      ok: false,
      issues: [
        {
          code: "CONFLICTING_REQUEST_FIELDS",
          field: "reportUrl",
          message: `Provide either reportUrl or ${EXPLICIT_FIELDS.join("/")}, not both.`,
        },
      ],
    };
  }

  if (hasUrl) {
    const reportUrl = input["reportUrl"];
    if (typeof reportUrl !== "string") {
      return {
        ok: false,
        issues: [
          {
            code: "INVALID_REPORT_URL",
            field: "reportUrl",
            message: "reportUrl must be a string.",
          },
        ],
      };
    }

    const parsed = parseReportUrl(reportUrl);
    return parsed.ok ? { ok: true, request: parsed.value } : { ok: false, issues: parsed.issues };
  }

  if (suppliedExplicitFields.length === 0) {
    return {
      ok: false,
      issues: [
        {
          code: "MISSING_REQUEST_INPUT",
          field: "body",
          message: `Provide either reportUrl or ${EXPLICIT_FIELDS.join("/")}.`,
        },
      ],
    };
  }

  const issues: RequestIssue[] = [];

  const rawReportCode = input["reportCode"];
  let reportCode: string | undefined;
  if (rawReportCode === undefined || rawReportCode === null) {
    issues.push({
      code: "MISSING_REPORT_CODE",
      field: "reportCode",
      message: "reportCode is required.",
    });
  } else if (typeof rawReportCode !== "string" || !REPORT_CODE_PATTERN.test(rawReportCode)) {
    issues.push({
      code: "INVALID_REPORT_CODE",
      field: "reportCode",
      message: "reportCode must be a valid Warcraft Logs report code.",
    });
  } else {
    reportCode = rawReportCode;
  }

  const fightId = validateId(input["fightId"], "fightId", "MISSING_FIGHT_ID", "INVALID_FIGHT_ID", issues);
  const sourceId = validateId(
    input["sourceId"],
    "sourceId",
    "MISSING_SOURCE_ID",
    "INVALID_SOURCE_ID",
    issues,
  );

  if (issues.length > 0 || reportCode === undefined || fightId === undefined || sourceId === undefined) {
    return { ok: false, issues };
  }

  return { ok: true, request: { reportCode, fightId, sourceId } };
}
