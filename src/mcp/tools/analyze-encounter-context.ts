/**
 * `analyze_encounter_context` — the encounter-context MCP tool.
 *
 * AN ADAPTER, AND DELIBERATELY NOTHING MORE. It validates the shape of a tool
 * call, parses it with the SAME function REST uses, meters it with the SAME
 * formula against the SAME budget, hands it to the SAME runner, and projects with
 * the SAME pure function. Every judgement in the output was made several layers
 * below this one.
 *
 * THE DESCRIPTION IS PART OF THE SAFETY CONTRACT
 *
 * A tool description is the only documentation a model reads before deciding what
 * a result means, and "external references" is the single most misreadable thing
 * this product publishes. A summarising agent that keeps the first sentence and
 * discards the rest must still be unable to conclude that a ranked player's log
 * is a standard — so the first sentence says what the references are NOT, and the
 * critical phrases are pinned by test against a future tidy-up.
 */

import * as z from "zod";
import type { McpServer } from "@modelcontextprotocol/server";

import { PublicEncounterContextResultSchema } from "../../contracts/encounter-context-contract.js";
import { projectEncounterContextResult } from "../../contracts/encounter-context-projection.js";
import { checkAnalysisRateLimitCost, type RateLimiterPort } from "../../runtime/rate-limit.js";
import { MAX_RAID_NIGHT_FIGHTS, MAX_RAID_NIGHT_PLAYERS } from "../../services/raid-night-request.js";
import {
  parseEncounterContextRequest,
  SUPPORTED_RANKING_METRICS,
} from "../../services/encounter-context-request.js";
import {
  encounterContextAdmissionUnits,
  type EncounterContextRunner,
} from "../../services/encounter-context-runner.js";
import { toolErrorBody, toolErrorForServiceCode, transportToolError } from "../tool-errors.js";

export const ENCOUNTER_CONTEXT_TOOL_NAME = "analyze_encounter_context";

export const ENCOUNTER_CONTEXT_TOOL_TITLE =
  "Factual encounter progression context across pulls of one Warcraft Logs report";

export const ENCOUNTER_CONTEXT_TOOL_DESCRIPTION = [
  "Reports FACTUAL, DESCRIPTIVE encounter context for pulls of the same encounter within ONE",
  "Warcraft Logs report: pull order, duration, kill/wipe transitions, phase-summary metadata, and",
  "which players were present. It is NOT a score, NOT a rating, and NOT a ranking.",
  "",
  `Requires an explicit list of 1 to ${String(MAX_RAID_NIGHT_FIGHTS)} fight IDs from one report. At most ${String(MAX_RAID_NIGHT_PLAYERS)} players are`,
  "included per request.",
  "",
  "OPTIONAL external references are bounded context from ONE page of a Warcraft Logs ranking board.",
  "They are COMPARISON CONTEXT ONLY and are never gameplay authority: a ranked player's log does",
  "not establish what this player should have pressed. The pool is a rankings-derived reference",
  "pool, NOT a representative or typical population, and no ranking position, parse score or",
  "percentile is ever returned.",
  "",
  "A reference can be qualification=QUALIFIED and comparability=UNKNOWN at the same time. Those are",
  "different facts: qualification means the external pull and player identity were established;",
  "comparability means whether the two pulls may be compared at all, which across reports is",
  "currently UNKNOWN because version semantics are unproven. Do not present an UNKNOWN comparison",
  "as a similar, close or equivalent pull.",
  "",
  "External discovery is OFF unless requested, and requires an explicit partition choice: PINNED",
  "for a reproducible retrieval, or LATEST which can return a different pool after a partition",
  "rollover. There is no default.",
].join("\n");

const fightIdsSchema = z
  .array(z.number().int().nonnegative())
  .min(1)
  .max(MAX_RAID_NIGHT_FIGHTS)
  .describe(
    `Fight IDs within the report, 1 to ${String(MAX_RAID_NIGHT_FIGHTS)} of them. Not encounter IDs and not pull numbers.`,
  );

const sourceIdsSchema = z
  .array(z.number().int().nonnegative())
  .min(1)
  .max(MAX_RAID_NIGHT_PLAYERS)
  .describe(
    "Optional Warcraft Logs actor (source) IDs. Omit to include every player in the selected fights.",
  );

/**
 * The external-reference option.
 *
 * `partition` is REQUIRED on the enabled branch, with no default anywhere in the
 * schema. Warcraft Logs resolves its own default to the latest partition, which
 * moves across a rollover, and M8-F found no typed subject field to derive one
 * from — so the caller states which they want and the result records it.
 */
const externalReferencesSchema = z
  .discriminatedUnion("mode", [
    z.object({ mode: z.literal("DISABLED") }).strict(),
    z
      .object({
        mode: z.literal("ENABLED"),
        subjectFightId: z
          .number()
          .int()
          .positive()
          .describe("Which of the selected fightIds the references are gathered for."),
        className: z.string().min(1).describe("Warcraft Logs class slug, for example Rogue."),
        specName: z.string().min(1).describe("Warcraft Logs spec slug, for example Assassination."),
        metric: z.enum(SUPPORTED_RANKING_METRICS).describe("Ranking metric to query the board with."),
        partition: z
          .discriminatedUnion("mode", [
            z
              .object({ mode: z.literal("PINNED"), partition: z.number().int().nonnegative() })
              .strict()
              .describe("A specific partition. Retrieval is reproducible while that partition exists."),
            z
              .object({ mode: z.literal("LATEST") })
              .strict()
              .describe(
                "Warcraft Logs' moving latest partition. NOT reproducible: a later call can return a different pool.",
              ),
          ])
          .describe("Required. There is no default partition."),
      })
      .strict(),
  ])
  .describe("Omit for local-only context. External discovery costs additional rate-limit units.");

export const AnalyzeEncounterContextInputSchema = z.discriminatedUnion("source", [
  z
    .object({
      source: z.literal("url"),
      reportUrl: z
        .string()
        .url()
        .describe("Full Warcraft Logs report URL, for example https://www.warcraftlogs.com/reports/<code> ."),
      fightIds: fightIdsSchema,
      sourceIds: sourceIdsSchema.optional(),
      externalReferences: externalReferencesSchema.optional(),
    })
    .strict(),
  z
    .object({
      source: z.literal("ids"),
      reportCode: z.string().describe("Warcraft Logs report code: the alphanumeric segment after /reports/."),
      fightIds: fightIdsSchema,
      sourceIds: sourceIdsSchema.optional(),
      externalReferences: externalReferencesSchema.optional(),
    })
    .strict(),
]);

export type AnalyzeEncounterContextInput = z.infer<typeof AnalyzeEncounterContextInputSchema>;

export interface EncounterContextToolDeps {
  readonly analyzeEncounterContext: EncounterContextRunner;
  /** Absent means unmetered, which this tool treats as a refusal. */
  readonly rateLimiter?: RateLimiterPort | undefined;
}

/**
 * Drops the `source` discriminant on the way into the application.
 *
 * It exists to help a model call the tool; it is not Warcraft Logs vocabulary and
 * the application parser has no field for it.
 */
function toApplicationInput(input: AnalyzeEncounterContextInput): unknown {
  const shared = {
    fightIds: input.fightIds,
    ...(input.sourceIds === undefined ? {} : { sourceIds: input.sourceIds }),
    ...(input.externalReferences === undefined ? {} : { externalReferences: input.externalReferences }),
  };
  return input.source === "url"
    ? { reportUrl: input.reportUrl, ...shared }
    : { reportCode: input.reportCode, ...shared };
}

function errorResult(error: ReturnType<typeof transportToolError>) {
  // No `structuredContent`. The declared output schema describes a successful
  // document, and a failure must not be parseable as one.
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: toolErrorBody(error) }],
  };
}

/**
 * Registers the tool.
 *
 * ORDER IS LOAD-BEARING, AND MIRRORS THE REST ROUTE.
 *
 *   1. The SDK validates the input schema. A malformed call never reaches here
 *      and therefore never spends metering quota.
 *   2. PARSE, with the shared application parser — because the meter's cost
 *      depends on the fight count and on whether external references were asked
 *      for.
 *   3. METER, `encounterContextAdmissionUnits`, on the shared key.
 *   4. Run the one shared runner.
 *   5. A LOCAL run failure becomes a tool error; a document becomes a result.
 *
 * AN EXTERNAL FAILURE IS NOT A TOOL ERROR. A rejected ranking request or an
 * unrecognised payload still produces a complete document carrying the full local
 * progression, and marking that an error would teach a client to discard a
 * correct answer because a third-party leaderboard was unavailable.
 */
export function registerAnalyzeEncounterContextTool(server: McpServer, deps: EncounterContextToolDeps): void {
  server.registerTool(
    ENCOUNTER_CONTEXT_TOOL_NAME,
    {
      title: ENCOUNTER_CONTEXT_TOOL_TITLE,
      description: ENCOUNTER_CONTEXT_TOOL_DESCRIPTION,
      inputSchema: AnalyzeEncounterContextInputSchema,
      // The M8-G public contract, unchanged. There is no MCP-shaped DTO: the SDK
      // validates `structuredContent` against this before the result leaves the
      // server, so a projection defect fails loudly here.
      outputSchema: PublicEncounterContextResultSchema,
      annotations: {
        title: ENCOUNTER_CONTEXT_TOOL_TITLE,
        // Reads Warcraft Logs and computes. Mutates nothing, anywhere.
        readOnlyHint: true,
        // Reaches an external system: the Warcraft Logs API.
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const parsed = parseEncounterContextRequest(toApplicationInput(input));
        if (!parsed.ok) {
          // Refused before metering: it will spend no Warcraft Logs quota, so
          // charging for it would charge for work that cannot happen.
          return errorResult(toolErrorForServiceCode("INVALID_REQUEST"));
        }

        const decision = await checkAnalysisRateLimitCost(
          deps.rateLimiter,
          encounterContextAdmissionUnits(parsed.request),
        );
        if (decision === "DENIED") return errorResult(transportToolError("RATE_LIMITED"));
        if (decision === "UNAVAILABLE") {
          // Fail closed: an undecided limiter must not become unmetered access to
          // a paid, finite quota.
          return errorResult(transportToolError("RATE_LIMITER_UNAVAILABLE"));
        }

        const run = await deps.analyzeEncounterContext(parsed.request);
        if (!run.ok) {
          return errorResult(toolErrorForServiceCode(run.error.code));
        }

        // Projected HERE, by the same pure function REST calls. One projection
        // definition, two call sites, byte-identical output — asserted, not
        // assumed.
        const projected = projectEncounterContextResult(run.analysis);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(projected) }],
          structuredContent: projected,
        };
      } catch {
        // Never surface the thrown value: it can carry configuration or
        // credential data that must not leave the backend.
        return errorResult(toolErrorForServiceCode("INTERNAL_ERROR"));
      }
    },
  );
}
