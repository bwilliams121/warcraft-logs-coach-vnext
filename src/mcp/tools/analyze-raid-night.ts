/**
 * `analyze_raid_night` — the raid-night MCP tool.
 *
 * AN ADAPTER, AND DELIBERATELY NOTHING MORE. It validates the shape of a tool
 * call, parses it with the SAME function REST uses, meters it against the SAME
 * budget, hands it to the SAME runner, and returns. Every judgement in the output
 * was made several layers below this one.
 *
 * WHAT IT IS STRUCTURALLY INCAPABLE OF
 *
 * Analysing anything. It imports no specialization evaluator, no combat state, no
 * Warcraft Logs client, no aggregator and no SimulationCraft machinery — a
 * layering test enforces that. It cannot assemble the pipeline because it cannot
 * see it; it can only call the one runner it is given.
 *
 * THE DESCRIPTION IS PART OF THE SAFETY CONTRACT
 *
 * A tool description is the only documentation a model reads before deciding what
 * a result means, and an aggregate invites a summariser to produce a leaderboard.
 * So the description states the limits in the same breath as the capability, and
 * the critical phrases are pinned by test so a future tidy-up cannot soften them.
 */

import * as z from "zod";
import type { McpServer } from "@modelcontextprotocol/server";

import { PublicRaidNightResultSchema } from "../../contracts/raid-night-contract.js";
import { projectRaidNightResult } from "../../contracts/raid-night-projection.js";
import { checkAnalysisRateLimitCost, type RateLimiterPort } from "../../runtime/rate-limit.js";
import {
  MAX_RAID_NIGHT_FIGHTS,
  MAX_RAID_NIGHT_PLAYERS,
  parseRaidNightRequest,
} from "../../services/raid-night-request.js";
import type { RaidNightRunner } from "../../services/raid-night-runner.js";
import { toolErrorBody, toolErrorForServiceCode, transportToolError } from "../tool-errors.js";

export const RAID_NIGHT_TOOL_NAME = "analyze_raid_night";

export const RAID_NIGHT_TOOL_TITLE = "Analyze a Warcraft Logs raid night across selected fights";

/**
 * What the tool tells a model about itself.
 *
 * Ordered so the limits arrive with the capability. The failure this guards
 * against is a summarising agent keeping the first sentence and discarding the
 * rest — so the first sentence already says "factual evidence" rather than
 * "analyzes a raid".
 *
 * The "Supported specializations: …" sentence is INJECTED by the composition
 * root, derived from the PUBLIC registrations of the production analyzer
 * catalog (M11-A1) — the same derivation the single-fight tool receives, so
 * the two descriptions cannot name different sets. See
 * `analyzeToolDescription` in `./analyze-warcraft-log.ts` for the reasoning.
 */
export function raidNightToolDescription(supportedSpecializations: string): string {
  return [
    "Aggregates FACTUAL evidence across an explicit, bounded set of fights from ONE Warcraft Logs",
    `report: who was present, what they played, which fight/player results exist, and integer decision`,
    "counts where gameplay analysis was possible.",
    "",
    `Requires an explicit list of 1 to ${String(MAX_RAID_NIGHT_FIGHTS)} fight IDs. There is no "whole report" form, because its cost`,
    `cannot be bounded in advance. At most ${String(MAX_RAID_NIGHT_PLAYERS)} players are analyzed per request.`,
    "",
    `Gameplay support depends on registered analyzers. ${supportedSpecializations}`,
    "Every other specialization appears as a factual SPEC_NOT_SUPPORTED cell —",
    "a limit of this build's coverage, NOT a statement that the player did badly.",
    "",
    "Protection Paladin cells count only observed OFFENSIVE global-cooldown decisions compared against",
    "pinned authority. They do NOT evaluate defensive cooldowns, active mitigation, self-healing,",
    "interrupts, or survival; off-global-cooldown actions such as Shield of the Righteous are excluded,",
    "not judged.",
    "",
    "Cell kinds are distinct and must not be conflated. ABSENT means the player was not in that pull.",
    "SPEC_NOT_SUPPORTED means no analyzer exists for their specialization. ANALYSIS_UNAVAILABLE means",
    "nothing was attempted, because the fight's evidence did not arrive or Warcraft Logs supplied no",
    "usable specialization. None of these is poor performance, and none carries decision counts.",
    "",
    "MATCH means authority-compatible only: the supported analysis resolved the same action that was",
    "observed. MATCH does NOT mean correct, optimal, ideal, best or mistake-free. REJECTED means the",
    "authority positively established the observed action was not selectable. UNKNOWN means the",
    "analyzer could not prove the comparison — a legitimate result, never a fault and never a miss:",
    "the available evidence cannot establish the result, not that a mistake was made.",
    "",
    "evidenceLimitations describes why the ANALYZER could not conclude; exclusionPatterns describes",
    "casts it did not evaluate. Neither says anything about the player. Only rejectedPatterns carries",
    "gameplay evidence, and on current coverage it is frequently empty.",
    "",
    "trendEvidence is an ordered factual series with explicit comparability flags. It contains NO",
    "improvement or regression judgement, because movement in these counts tracks analyzer coverage at",
    "least as much as it tracks play.",
    "",
    "This tool does NOT predict an arbitrary next action, does NOT score or grade any player or the",
    "raid, does NOT rank anyone, and does NOT compare against other logs or guilds. There is no rating,",
    "percentage or accuracy anywhere in its output, and status NO_ANALYZED_CELLS does NOT mean clean",
    "play — it means no gameplay analysis was produced at all.",
    "",
    "Partial coverage is expected. Read the coverage block before characterizing a night, and do not",
    "compute a correctness percentage from the counts.",
    "",
    "Requires a public or unlisted Warcraft Logs report.",
  ].join("\n");
}

/**
 * The tool's input.
 *
 * A TAGGED UNION RATHER THAN OPTIONAL FIELDS, matching the single-fight tool. The
 * application parser already rejects a request mixing a URL with a report code,
 * but "reportUrl is present and so is reportCode" is a rule a model has to infer.
 * `source` makes the two forms visibly exclusive in the JSON Schema the client
 * reads, so a mixed call fails at validation with a shape error rather than
 * arriving as a semantic conflict.
 *
 * The discriminator is MCP ergonomics and never enters application semantics —
 * `toApplicationInput` drops it, and both variants become the same canonical
 * request REST produces.
 *
 * WHAT THIS SCHEMA DELIBERATELY DOES NOT CHECK
 *
 * Whether the URL is a Warcraft Logs URL, or whether a report code is well
 * formed. That is Warcraft Logs knowledge and it already lives in the application
 * parser; restating it here would create a second authority that drifts.
 */
const fightIdsSchema = z
  .array(z.number().int().nonnegative())
  .min(1)
  .max(MAX_RAID_NIGHT_FIGHTS)
  .describe(
    `Fight IDs within the report, 1 to ${String(MAX_RAID_NIGHT_FIGHTS)} of them. Not encounter IDs and not pull numbers. Duplicates are collapsed.`,
  );

const sourceIdsSchema = z
  .array(z.number().int().nonnegative())
  .min(1)
  .max(MAX_RAID_NIGHT_PLAYERS)
  .describe(
    `Optional Warcraft Logs actor (source) IDs to analyze. Omit to analyze every player in the selected fights. Actor ID 0 is valid; -1 is the unknown-actor sentinel and is rejected.`,
  );

export const AnalyzeRaidNightInputSchema = z.discriminatedUnion("source", [
  z
    .object({
      source: z.literal("url"),
      reportUrl: z
        .string()
        .url()
        .describe(
          "Full Warcraft Logs report URL, for example https://www.warcraftlogs.com/reports/<code> . " +
            "Fight and player selectors in the URL are ignored: name the fights in fightIds instead.",
        ),
      fightIds: fightIdsSchema,
      sourceIds: sourceIdsSchema.optional(),
    })
    .strict(),
  z
    .object({
      source: z.literal("ids"),
      reportCode: z.string().describe("Warcraft Logs report code: the alphanumeric segment after /reports/."),
      fightIds: fightIdsSchema,
      sourceIds: sourceIdsSchema.optional(),
    })
    .strict(),
]);

export type AnalyzeRaidNightInput = z.infer<typeof AnalyzeRaidNightInputSchema>;

export interface RaidNightToolDeps {
  readonly analyzeRaidNight: RaidNightRunner;
  /** Absent means unmetered, which this tool treats as a refusal. */
  readonly rateLimiter?: RateLimiterPort | undefined;
  /** The derived "Supported specializations: …" sentence, from the composition root. */
  readonly supportedSpecializations: string;
}

/**
 * Drops the `source` discriminant on the way into the application.
 *
 * It exists to help a model call the tool; it is not Warcraft Logs vocabulary and
 * the application parser has no field for it. Passing it through would hand the
 * parser a key it would rightly reject.
 */
function toApplicationInput(input: AnalyzeRaidNightInput): unknown {
  const shared = {
    fightIds: input.fightIds,
    ...(input.sourceIds === undefined ? {} : { sourceIds: input.sourceIds }),
  };
  return input.source === "url"
    ? { reportUrl: input.reportUrl, ...shared }
    : { reportCode: input.reportCode, ...shared };
}

function errorResult(error: ReturnType<typeof transportToolError>) {
  // No `structuredContent`. The declared output schema describes a successful
  // raid night, and a failure must not be parseable as one.
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
 *      depends on the fight count.
 *   3. METER, one unit per fight, on the shared key.
 *   4. Run the one shared runner.
 *   5. A run failure becomes a tool error; a raid night becomes a result.
 */
export function registerAnalyzeRaidNightTool(server: McpServer, deps: RaidNightToolDeps): void {
  server.registerTool(
    RAID_NIGHT_TOOL_NAME,
    {
      title: RAID_NIGHT_TOOL_TITLE,
      description: raidNightToolDescription(deps.supportedSpecializations),
      inputSchema: AnalyzeRaidNightInputSchema,
      // The M7-E public contract, unchanged. There is no MCP-shaped raid-night
      // DTO: the SDK validates `structuredContent` against this before the result
      // leaves the server, so a projection defect fails loudly here.
      outputSchema: PublicRaidNightResultSchema,
      annotations: {
        title: RAID_NIGHT_TOOL_TITLE,
        // Reads Warcraft Logs and computes. Mutates nothing, anywhere.
        readOnlyHint: true,
        // Reaches an external system: the Warcraft Logs API.
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const parsed = parseRaidNightRequest(toApplicationInput(input));
        if (!parsed.ok) {
          // Refused before metering: it will spend no Warcraft Logs quota, so
          // charging for it would charge for work that cannot happen.
          return errorResult(toolErrorForServiceCode("INVALID_REQUEST"));
        }

        const decision = await checkAnalysisRateLimitCost(deps.rateLimiter, parsed.request.fightIds.length);
        if (decision === "DENIED") return errorResult(transportToolError("RATE_LIMITED"));
        if (decision === "UNAVAILABLE") {
          // Fail closed: an undecided limiter must not become unmetered access to
          // a paid, finite quota.
          return errorResult(transportToolError("RATE_LIMITER_UNAVAILABLE"));
        }

        const run = await deps.analyzeRaidNight(parsed.request);
        if (!run.ok) {
          return errorResult(toolErrorForServiceCode(run.error.code));
        }

        // Every raid-night status is a SUCCESSFUL tool result, including
        // NO_ANALYZED_CELLS and a night whose fights partly failed. Marking those
        // as errors would teach a client to retry or discard a correct answer.
        // Projected HERE, by the same pure function REST calls. One projection
        // definition, two call sites, byte-identical output — asserted, not
        // assumed.
        const projected = projectRaidNightResult(run.aggregate);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(projected) }],
          structuredContent: projected,
        };
      } catch {
        // The thrown value is never read. It can carry configuration, a
        // credential, or upstream text this project has not vetted.
        return errorResult({
          code: "INTERNAL_ERROR",
          message: "An unexpected internal error occurred.",
          retryable: false,
        });
      }
    },
  );
}
