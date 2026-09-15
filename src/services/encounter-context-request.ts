/**
 * One encounter-context request, normalized.
 *
 * REUSES M7's PARSER RATHER THAN RESTATING ITS LIMITS. The subject half of this
 * request is exactly a raid-night selection — a report and up to four fights —
 * so `parseRaidNightRequest` does that work and `MAX_RAID_NIGHT_FIGHTS`,
 * `MAX_RAID_NIGHT_PLAYERS` and the subrequest budget are inherited rather than
 * copied. A second set of bounds would be a second thing to raise by accident.
 *
 * THE ONE ADDITION IS EXTERNAL REFERENCES, AND IT IS OPT-IN
 *
 * Omitting the field means DISABLED, which costs zero ranking queries and zero
 * external metadata lookups. That default is deliberate: external discovery
 * spends metered quota on a third party's data to produce context that M8-B
 * currently cannot prove comparable, so nobody should pay for it without asking.
 *
 * PARTITION HAS NO DEFAULT, AND THAT IS THE POINT
 *
 * When external references are enabled the caller must state a partition mode.
 * Warcraft Logs defaults `partition` to "latest", which moves across a rollover,
 * and M8-F found no typed subject field from which a partition could be derived.
 * So the choice is made explicitly by a caller who can be told what it means,
 * never silently by this parser. See `externalReferencesIssue`.
 */

import { isRecord } from "../wcl/decode.js";
import type { RequestIssue } from "./result.js";
import { parseRaidNightRequest, type RaidNightRequest } from "./raid-night-request.js";
import {
  SUPPORTED_RANKING_METRICS,
  type RankingMetric,
  type RankingPartitionSelection,
} from "../wcl/rankings/rankings-query.js";

/**
 * Whether the caller wants external reference discovery, and on what terms.
 *
 * `DISABLED` is a complete, ordinary answer, not a degraded one: local
 * progression is the primary product of this request and stands alone.
 */
export type ExternalReferenceOption =
  | { readonly mode: "DISABLED" }
  | {
      readonly mode: "ENABLED";
      /**
       * The pull references are gathered for.
       *
       * Named explicitly rather than inferred from the selection. A night may
       * hold several encounters, and picking one by a rule ("the last", "the
       * longest") would make the spent quota depend on a heuristic the caller
       * never saw. The encounter and difficulty are then read from this fight's
       * own typed facts.
       */
      readonly subjectFightId: number;
      /** Warcraft Logs class and spec slugs. The ranking board is per-spec. */
      readonly className: string;
      readonly specName: string;
      readonly metric: RankingMetric;
      readonly partition: RankingPartitionSelection;
    };

export interface EncounterContextRequest {
  readonly subject: RaidNightRequest;
  readonly externalReferences: ExternalReferenceOption;
}

export type EncounterContextRequestParseResult =
  | { readonly ok: true; readonly request: EncounterContextRequest }
  | { readonly ok: false; readonly issues: readonly RequestIssue[] };

function issue(code: RequestIssue["code"], field: string, message: string): RequestIssue {
  return { code, field, message };
}

const PARTITION_MODES = ["PINNED", "LATEST"] as const;

/**
 * Parses the `externalReferences` field.
 *
 * Every rejection below is a caller mistake with a specific remedy, and the
 * messages are author-written: nothing is interpolated from the input, so a
 * malformed body cannot echo itself back.
 */
function parseExternalReferences(
  raw: unknown,
):
  | { readonly ok: true; readonly option: ExternalReferenceOption }
  | { readonly ok: false; readonly issues: readonly RequestIssue[] } {
  if (raw === undefined) {
    // Omission is DISABLED. It is never LATEST, and never ENABLED.
    return { ok: true, option: { mode: "DISABLED" } };
  }
  if (!isRecord(raw)) {
    return {
      ok: false,
      issues: [issue("INVALID_REQUEST_SHAPE", "externalReferences", "externalReferences must be an object.")],
    };
  }

  const mode = raw["mode"];
  if (mode === "DISABLED") {
    return { ok: true, option: { mode: "DISABLED" } };
  }
  if (mode !== "ENABLED") {
    return {
      ok: false,
      issues: [
        issue(
          "INVALID_REQUEST_SHAPE",
          "externalReferences.mode",
          'externalReferences.mode must be "DISABLED" or "ENABLED".',
        ),
      ],
    };
  }

  const issues: RequestIssue[] = [];

  const subjectFightId = raw["subjectFightId"];
  if (typeof subjectFightId !== "number" || !Number.isSafeInteger(subjectFightId) || subjectFightId < 1) {
    issues.push(
      issue(
        "INVALID_FIGHT_ID",
        "externalReferences.subjectFightId",
        "externalReferences.subjectFightId must be a positive integer naming one selected fight.",
      ),
    );
  }

  const className = raw["className"];
  const specName = raw["specName"];
  for (const [field, value] of [
    ["className", className],
    ["specName", specName],
  ] as const) {
    if (typeof value !== "string" || value.trim().length === 0) {
      issues.push(
        issue(
          "INVALID_REQUEST_SHAPE",
          `externalReferences.${field}`,
          `externalReferences.${field} must be a non-empty Warcraft Logs slug.`,
        ),
      );
    }
  }

  const metric = raw["metric"];
  if (typeof metric !== "string" || !(SUPPORTED_RANKING_METRICS as readonly string[]).includes(metric)) {
    issues.push(
      issue(
        "INVALID_REQUEST_SHAPE",
        "externalReferences.metric",
        `externalReferences.metric must be one of: ${SUPPORTED_RANKING_METRICS.join(", ")}.`,
      ),
    );
  }

  const partition = parsePartition(raw["partition"]);
  if (!partition.ok) {
    issues.push(...partition.issues);
  }

  if (issues.length > 0 || !partition.ok) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    option: {
      mode: "ENABLED",
      subjectFightId: subjectFightId as number,
      className: (className as string).trim(),
      specName: (specName as string).trim(),
      metric: metric as RankingMetric,
      partition: partition.selection,
    },
  };
}

function parsePartition(
  raw: unknown,
):
  | { readonly ok: true; readonly selection: RankingPartitionSelection }
  | { readonly ok: false; readonly issues: readonly RequestIssue[] } {
  if (!isRecord(raw)) {
    return {
      ok: false,
      issues: [
        issue(
          "MISSING_REQUEST_INPUT",
          "externalReferences.partition",
          `externalReferences.partition is required when external references are enabled, and must state a mode: ${PARTITION_MODES.join(" or ")}. There is no default, because the Warcraft Logs default moves across a partition rollover.`,
        ),
      ],
    };
  }

  const mode = raw["mode"];
  if (mode === "LATEST") {
    // An explicit choice to accept a moving target. Recorded as such in
    // provenance, and never described as reproducible.
    return { ok: true, selection: { kind: "WCL_DEFAULT_LATEST" } };
  }
  if (mode !== "PINNED") {
    return {
      ok: false,
      issues: [
        issue(
          "INVALID_REQUEST_SHAPE",
          "externalReferences.partition.mode",
          `externalReferences.partition.mode must be one of: ${PARTITION_MODES.join(", ")}.`,
        ),
      ],
    };
  }

  const partition = raw["partition"];
  if (typeof partition !== "number" || !Number.isSafeInteger(partition) || partition < 0) {
    return {
      ok: false,
      issues: [
        issue(
          "INVALID_REQUEST_SHAPE",
          "externalReferences.partition.partition",
          "A PINNED partition requires a non-negative integer partition value.",
        ),
      ],
    };
  }
  return { ok: true, selection: { kind: "EXPLICIT", partition } };
}

export function parseEncounterContextRequest(input: unknown): EncounterContextRequestParseResult {
  // The subject selection, its limits and its scope-field rejection are M7's.
  const subject = parseRaidNightRequest(input);
  if (!subject.ok) {
    return { ok: false, issues: subject.issues };
  }

  const external = parseExternalReferences(isRecord(input) ? input["externalReferences"] : undefined);
  if (!external.ok) {
    return { ok: false, issues: external.issues };
  }

  // A named subject fight must be one the request actually selected. Otherwise
  // the discovery would target a pull this analysis never looked at.
  if (
    external.option.mode === "ENABLED" &&
    !subject.request.fightIds.includes(external.option.subjectFightId)
  ) {
    return {
      ok: false,
      issues: [
        issue(
          "INVALID_FIGHT_ID",
          "externalReferences.subjectFightId",
          "externalReferences.subjectFightId must name one of the selected fightIds.",
        ),
      ],
    };
  }

  return { ok: true, request: { subject: subject.request, externalReferences: external.option } };
}
