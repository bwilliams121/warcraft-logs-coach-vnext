/**
 * `analyze_warcraft_log` — the real MCP tool.
 *
 * WHAT THIS FILE IS
 *
 * An adapter, and deliberately nothing more. It validates the shape of a tool
 * call, meters it, hands it to the application service, projects the result
 * through the public contract, and returns. Every gameplay judgement in the
 * output was made behind the M5 facade, several layers below this one.
 *
 * WHAT IT IS STRUCTURALLY INCAPABLE OF
 *
 * Analysing anything. It imports no specialization evaluator, no combat state,
 * no Warcraft Logs client and no SimulationCraft machinery — a layering test
 * enforces that. It cannot assemble M2 -> M3 -> M4 -> M5 because it cannot see
 * those modules; it can only call the one runner it is given.
 *
 * THE DESCRIPTION IS PART OF THE SAFETY CONTRACT
 *
 * A tool description is the only documentation a model reads before deciding
 * what a result means. This one states the engine's limits in the same place it
 * states its capability, because a model that learns "analyzes Warcraft Logs"
 * and nothing else will confidently report a MATCH as correct play. The
 * critical phrases are pinned by test so a future tidy-up cannot soften them.
 */

import * as z from "zod";
import type { McpServer } from "@modelcontextprotocol/server";

import { projectAnalysisResult } from "../../contracts/analysis-projection.js";
import { PublicAnalysisResultSchema } from "../../contracts/analysis-contract.js";
import type { AnalysisRunner } from "../../services/analysis-runner.js";
import { checkAnalysisRateLimit, type RateLimiterPort } from "../../runtime/rate-limit.js";
import { toolErrorBody, toolErrorForServiceCode, transportToolError } from "../tool-errors.js";

export const ANALYZE_TOOL_NAME = "analyze_warcraft_log";

export const ANALYZE_TOOL_TITLE = "Analyze Warcraft Logs observed rotational decisions";

/**
 * What the tool tells a model about itself.
 *
 * Ordered so the limits arrive with the capability rather than after it. The
 * failure this guards against is a summarising agent keeping the first sentence
 * and discarding the rest, so the first sentence already says "verifies
 * decisions the player actually made" rather than "analyzes a log".
 */
export const ANALYZE_TOOL_DESCRIPTION = [
  "Verifies the rotational decisions a player ACTUALLY MADE in one Warcraft Logs raid fight, by",
  "comparing each observed cast against a pinned SimulationCraft action priority list.",
  "",
  "Supported specializations: Assassination Rogue and Protection Paladin. Any other specialization",
  "returns status SPEC_NOT_SUPPORTED with no decision analysis, which is a complete and truthful",
  "result — it is not evidence of clean play.",
  "",
  "Protection Paladin analysis compares only observed OFFENSIVE global-cooldown decisions against",
  "pinned authority. It does NOT evaluate defensive cooldowns, active mitigation, self-healing,",
  "interrupts, or survival. Off-global-cooldown actions such as Shield of the Righteous are excluded,",
  "not judged.",
  "",
  "Each observed decision resolves to MATCH, REJECTED or UNKNOWN.",
  "MATCH means authority-compatible only: the supported analysis resolved the same action that was",
  "observed. MATCH does NOT mean correct, optimal, ideal, best, recommended or mistake-free.",
  "REJECTED means the authority can positively establish the observed action was not selectable in",
  "the proven state; it does not name what should have been done instead.",
  "UNKNOWN means the evidence or the authority could not prove the comparison. UNKNOWN is a",
  "legitimate successful result and must never be read as a fault: it means the available evidence",
  "cannot establish the result, not that a mistake was made.",
  "",
  "This tool does NOT predict an arbitrary next action, does NOT tell the player what they should",
  "have pressed at a moment they pressed nothing, and does NOT score performance. There is no",
  "rating, grade or accuracy anywhere in its output.",
  "",
  "Partial coverage is expected: most decisions typically resolve to UNKNOWN, and casts whose",
  "execution lane is not established are excluded from the denominator entirely. Read the coverage",
  "disclosure before characterizing the fight, and do not compute a correctness percentage from",
  "the counts.",
  "",
  "Requires a public or unlisted Warcraft Logs report, and one specific fight and one specific",
  "player within it.",
].join("\n");

/**
 * The tool's input.
 *
 * A TAGGED UNION RATHER THAN OPTIONAL FIELDS. The application parser already
 * rejects a request mixing a URL with explicit identifiers, but "reportUrl is
 * present and so is fightId" is a rule a model has to infer. `source` makes the
 * two forms visibly exclusive in the JSON Schema the client reads, so a mixed
 * call fails at validation with a shape error instead of arriving as a
 * semantic conflict.
 *
 * WHAT THIS SCHEMA DELIBERATELY DOES NOT CHECK
 *
 * Whether the URL is a Warcraft Logs URL, whether it names a fight and a
 * player, whether `fight=last` was used, whether the report code is well
 * formed. All of that is Warcraft Logs knowledge and it already lives in
 * `parseAnalysisRequest`. Restating it here would create a second parser that
 * drifts, and the drift would be invisible until the two disagreed about a real
 * URL. This schema establishes only the shape needed to call the tool reliably.
 */
export const AnalyzeWarcraftLogInputSchema = z.discriminatedUnion("source", [
  z
    .object({
      source: z.literal("url"),
      reportUrl: z
        .string()
        .url()
        .describe(
          "Full Warcraft Logs report URL identifying one fight and one player, for example " +
            "https://www.warcraftlogs.com/reports/<code>#fight=8&source=15 . Select the player on " +
            "Warcraft Logs before copying the URL. fight=last is not supported.",
        ),
    })
    .strict(),
  z
    .object({
      source: z.literal("ids"),
      reportCode: z.string().describe("Warcraft Logs report code: the alphanumeric segment after /reports/."),
      fightId: z
        .number()
        .int()
        .nonnegative()
        .describe("Fight ID within the report. Not the encounter ID and not the pull number."),
      sourceId: z
        .number()
        .int()
        .nonnegative()
        .describe("Warcraft Logs actor (source) ID of the player to analyze."),
    })
    .strict(),
]);

export type AnalyzeWarcraftLogInput = z.infer<typeof AnalyzeWarcraftLogInputSchema>;

/**
 * The application entry point this tool is allowed to reach.
 *
 * Re-exported from the transport-neutral home so existing MCP consumers keep
 * one import, while the TYPE is owned by the application layer both transports
 * share. MCP must not own an abstraction REST also depends on.
 */
export type { AnalysisRunner };

export interface AnalyzeToolDeps {
  readonly analyze: AnalysisRunner;
  /** Absent means unmetered, which this tool treats as a refusal. See `../rate-limit.ts`. */
  readonly rateLimiter?: RateLimiterPort | undefined;
}

/**
 * Drops the `source` discriminant on the way into the application.
 *
 * `source` exists to help a model call the tool; it is not Warcraft Logs
 * vocabulary and the application parser has no field for it. Passing it through
 * would be handing the service a key it would rightly reject.
 */
function toApplicationInput(input: AnalyzeWarcraftLogInput): unknown {
  return input.source === "url"
    ? { reportUrl: input.reportUrl }
    : { reportCode: input.reportCode, fightId: input.fightId, sourceId: input.sourceId };
}

function errorResult(error: ReturnType<typeof transportToolError>) {
  // No `structuredContent`. The declared output schema describes a successful
  // analysis, and a failure must not be parseable as one.
  return { content: [{ type: "text" as const, text: toolErrorBody(error) }], isError: true };
}

/**
 * Registers the tool on one per-request server instance.
 *
 * The handler's order is the point of the whole file:
 *
 *   1. The SDK validates arguments against the input schema. A malformed call
 *      never reaches this function, and therefore never spends metering quota —
 *      which is why the limiter check is HERE and not at the HTTP boundary.
 *   2. Meter. A denied or undecidable call does not reach the service.
 *   3. Run the application service. One call, one result.
 *   4. A service failure becomes a tool error; an analysis becomes a result.
 */
export function registerAnalyzeWarcraftLogTool(server: McpServer, deps: AnalyzeToolDeps): void {
  server.registerTool(
    ANALYZE_TOOL_NAME,
    {
      title: ANALYZE_TOOL_TITLE,
      description: ANALYZE_TOOL_DESCRIPTION,
      inputSchema: AnalyzeWarcraftLogInputSchema,
      // The M6-C public contract, unchanged. There is no MCP-shaped analysis
      // DTO: the SDK validates `structuredContent` against this before the
      // result leaves the server, so a projection defect fails loudly here.
      outputSchema: PublicAnalysisResultSchema,
      annotations: {
        title: ANALYZE_TOOL_TITLE,
        // Reads Warcraft Logs and computes. Mutates nothing, anywhere.
        readOnlyHint: true,
        // Reaches an external system: the Warcraft Logs API.
        openWorldHint: true,
      },
    },
    async (input) => {
      try {
        const decision = await checkAnalysisRateLimit(deps.rateLimiter);
        if (decision === "DENIED") return errorResult(transportToolError("RATE_LIMITED"));
        if (decision === "UNAVAILABLE") {
          // Fail closed: an undecided limiter must not become unmetered access
          // to a paid, finite quota.
          return errorResult(transportToolError("RATE_LIMITER_UNAVAILABLE"));
        }

        const result = await deps.analyze(toApplicationInput(input));

        if (!result.ok) {
          return errorResult(toolErrorForServiceCode(result.error.code));
        }

        // Every analysis status is a SUCCESSFUL tool result, including
        // SPEC_NOT_SUPPORTED and an ANALYZED run that resolved nothing. Marking
        // those as errors would teach a client to retry or discard a correct
        // answer, and would turn honest uncertainty into apparent malfunction.
        const projected = projectAnalysisResult(result.analysis);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(projected) }],
          structuredContent: projected,
        };
      } catch {
        // The thrown value is never read. It can carry configuration, a
        // credential, or upstream text this project has not vetted — and none
        // of that improves the answer. A bug is reported as a bug, never
        // downgraded into gameplay UNKNOWN.
        return errorResult({
          code: "INTERNAL_ERROR",
          message: "An unexpected internal error occurred.",
          retryable: false,
        });
      }
    },
  );
}
