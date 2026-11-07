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
import { RaidCooldownPlanInputSchema } from "../../contracts/raid-cooldown-plan-input-contract.js";
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
 *
 * THE SUPPORTED-SPECIALIZATION SENTENCE IS INJECTED, NOT WRITTEN HERE (M11-A1).
 * It is derived from the PUBLIC registrations of the production analyzer
 * catalog (`supportedSpecializationsSentence` in the application layer) and
 * handed to this module by the composition root, exactly as the runner is.
 * This module cannot compute it — it imports no registry and no analyzer —
 * and must not hand-list specializations, because a name typed here could
 * disagree with what the dispatcher actually selects. Everything else in the
 * description is this tool's own prose: the per-specialization LIMITS stay
 * author-written because they are claims about what an analyzer refuses to
 * judge, which no registry field can generate.
 */
/**
 * What the composition root hands the tools about specializations (M11-A2):
 * the derived support sentence, and each PUBLIC specialization's own
 * limitation prose per surface, in the sentence's order. Declared here as a
 * STRUCTURAL type — this layer imports no registry — and satisfied by the
 * application layer's `PublicSpecializationDescriptions`.
 */
export interface PublicSpecializationDescriptions {
  readonly sentence: string;
  readonly limits: readonly { readonly analysis: string; readonly raidNight: string }[];
}

/** Each non-empty limitation paragraph followed by a blank line, in order. */
export function limitsParagraphs(
  descriptions: PublicSpecializationDescriptions,
  surface: "analysis" | "raidNight",
): readonly string[] {
  return descriptions.limits.flatMap((limits) => (limits[surface].length === 0 ? [] : [limits[surface], ""]));
}

export function analyzeToolDescription(descriptions: PublicSpecializationDescriptions): string {
  return [
    "Verifies the rotational decisions a player ACTUALLY MADE in one Warcraft Logs raid fight, by",
    "comparing each observed cast against a pinned SimulationCraft action priority list.",
    "",
    `${descriptions.sentence} Any other specialization`,
    "returns status SPEC_NOT_SUPPORTED with no decision analysis, which is a complete and truthful",
    "result — it is not evidence of clean play.",
    "",
    ...limitsParagraphs(descriptions, "analysis"),
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
    "Every result, on every status including SPEC_NOT_SUPPORTED, also carries preparation: the",
    "player's observed health potion, healthstone and combat potion use in the fight. It is",
    "specialization-independent and is not gameplay analysis. Each consumable is countState OBSERVED,",
    "a complete count, or UNKNOWN, with its reasons and observedAtLeast, which is a lower bound and",
    "NOT a count. Zero is reported only under complete coverage, so an UNKNOWN must never be read as",
    "zero use. assessment NOT_ASSESSED means the fight was not retrieved and nothing is claimed about",
    "consumables. These are observed facts only: they do NOT say a consumable should have been used.",
    "",
    "An optional raidCooldownPlan supplies the raid's own cooldown assignment plan, as structured",
    "assignments or as a timeline note (time:3;ph:2;tag:Name;spellid:98008;). It is the only authority",
    "for assignments: none is ever inferred when it is absent. When supplied, the result carries",
    "raidCooldownPlan with its digest, whether it is bound to this fight's encounter and difficulty,",
    "and the note lines not imported. Its assignmentEvaluation is NOT_EVALUATED, with the reason, unless",
    "a healer analyzer judged the player's entries against it: then it is EVALUATED_IN_HEALER_FINDINGS and",
    "every result is in healerFindings, citing the plan. Only a plan bound to this fight is applied, and",
    "the disclosure itself never says whether an assignment was met, missed, early or late.",
    "",
    "An ANALYZED result also carries diagnosis. assessment NOT_ASSESSED, with its reason, means no",
    "comparison fights were available and nothing is claimed about the fight's damage; this service",
    "currently retrieves none, so it reports COMPARISON_EVIDENCE_NOT_RETRIEVED. When ASSESSED, each",
    "damage difference from a comparison fight is either a statement, which exists only where",
    "REJECTED decisions in the same ability and window are linked to a proven higher figure, or an",
    "observation with its cause. An observation is not a cause, a statement does NOT say how much",
    "of the difference the decisions account for, and comparison fights are context, never authority.",
    "",
    "A decision with encounterState was evaluated under the pinned SimC profile assumptions: part of",
    "its encounter state, such as the enemy count, is the profile's model and was not observed in",
    "this fight. It answers what the priority would select under those assumptions, and it does NOT",
    "say how many enemies or targets the fight held. Its stateEvidence is SIMC_PROFILE_RELATIVE, it ranks",
    "after proven findings, and simcProfileEvaluation states how many decisions rest on it and which",
    "profile answered. A decision without encounterState is an observed-fight evaluation.",
    "",
    "Every result also carries tldr, a short summary built only from the findings and coverage",
    "above. Its assessmentScope is always PARTIAL and its first line states how much of the fight",
    'was analyzed: "we could only analyze part of this fight" is NOT the same as "found little to',
    'fix". Its headline speaks about the analyzed decisions only, so the headline',
    "NO_AUTHORITY_DIVERGENCE_IN_ANALYZED_DECISIONS is not an endorsement of the fight, and",
    "GAMEPLAY_NOT_ANALYZED is not evidence of clean play. Highlights are REJECTED decisions in evidence and",
    "actionability order, never by damage or impact, and each says whether the authority's",
    "alternative was proven possible. UNKNOWN is counted, never treated as a finding or as zero.",
    "",
    "Every result also carries report: the same findings in full, grouped by decision category,",
    "each with its producer, authority, state evidence, actionability and evidence locators, plus every",
    "suppression with its named environmental reason, and a coverage section that comes first. Its",
    "assessmentScope is always PARTIAL. Entries are PRIORITIZED (REJECTED decisions in evidence and",
    "actionability order, never by damage or impact), INFORMATIONAL (MATCH results and observed facts,",
    "never an endorsement) or CARRIED (UNKNOWN, SUPPRESSED and other non-assessments, with their",
    "reasons, never a fault). report.markdown is the same report as text, rendered only from those fields.",
    "Neither tldr nor report summarizes supportObservations, healerFindings or raidCooldownPlan; when the",
    "result carries one, its disclosure says so (SUPPORT_OBSERVATIONS_NOT_SUMMARIZED,",
    "HEALER_FINDINGS_NOT_SUMMARIZED, RAID_COOLDOWN_PLAN_NOT_EVALUATED or RAID_COOLDOWN_PLAN_NOT_SUMMARIZED).",
    "",
    "Partial coverage is expected: most decisions typically resolve to UNKNOWN, and casts whose",
    "execution lane is not established are excluded from the denominator entirely. Read the coverage",
    "disclosure before characterizing the fight, and do not compute a correctness percentage from",
    "the counts.",
    "",
    "Requires a public or unlisted Warcraft Logs report, and one specific fight and one specific",
    "player within it.",
  ].join("\n");
}

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
      raidCooldownPlan: RaidCooldownPlanInputSchema.optional(),
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
      raidCooldownPlan: RaidCooldownPlanInputSchema.optional(),
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
  /**
   * The derived support sentence and per-specialization limitation prose,
   * from the composition root. See `analyzeToolDescription`.
   */
  readonly publicSpecializations: PublicSpecializationDescriptions;
}

/**
 * Drops the `source` discriminant on the way into the application.
 *
 * `source` exists to help a model call the tool; it is not Warcraft Logs
 * vocabulary and the application parser has no field for it. Passing it through
 * would be handing the service a key it would rightly reject.
 */
function toApplicationInput(input: AnalyzeWarcraftLogInput): unknown {
  // The plan passes through unchanged: the application parser alone decides
  // what it means, exactly as for a REST body.
  const plan = input.raidCooldownPlan === undefined ? {} : { raidCooldownPlan: input.raidCooldownPlan };
  return input.source === "url"
    ? { reportUrl: input.reportUrl, ...plan }
    : { reportCode: input.reportCode, fightId: input.fightId, sourceId: input.sourceId, ...plan };
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
      description: analyzeToolDescription(deps.publicSpecializations),
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
