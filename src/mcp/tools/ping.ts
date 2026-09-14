/**
 * `ping` — the M6-A transport probe.
 *
 * TEMPORARY. THIS FILE IS DELETED IN M6-D.
 *
 * M6-D introduces the real `analyze_warcraft_log` tool. At that point this
 * module, its registration call in `../server.ts`, and the tests that name
 * `ping` are removed together. Nothing may come to depend on it: it is not part
 * of the public MCP surface, it is not versioned, and it answers no question
 * about Warcraft Logs.
 *
 * WHY A PROBE TOOL EXISTS AT ALL
 *
 * M6-A proves the transport, not the product. A tool that returns a constant is
 * the smallest thing that exercises `tools/list`, `tools/call`, input schema
 * conversion, output schema validation and `structuredContent` — so a failure in
 * any of those surfaces here, before the real analyzer is anywhere near the wire.
 *
 * It deliberately reads nothing: no environment, no request, no Warcraft Logs,
 * no gameplay state. A probe that touched real inputs would stop being a probe.
 */

import * as z from "zod";
import type { McpServer } from "@modelcontextprotocol/server";

/** The one permitted service identifier. A literal, so drift is a type error. */
export const PING_SERVICE_ID = "warcraft-logs-coach-vnext";

/**
 * The probe's output contract.
 *
 * Both fields are literals. There is no input this tool can vary on, so a
 * response that differs from this object at all is a transport defect rather
 * than a legitimate result.
 */
export const PING_OUTPUT_SCHEMA = z.object({
  ok: z.literal(true).describe("Always true. The probe has no failure result."),
  service: z.literal(PING_SERVICE_ID).describe("Identifies which deployment answered."),
});

export type PingOutput = z.infer<typeof PING_OUTPUT_SCHEMA>;

const PING_OUTPUT: PingOutput = { ok: true, service: PING_SERVICE_ID };

/**
 * Registers the probe on one per-request server instance.
 *
 * Called from the factory, so every request gets its own registration. Nothing
 * is cached across requests.
 */
export function registerPingTool(server: McpServer): void {
  server.registerTool(
    "ping",
    {
      title: "Connectivity probe (temporary)",
      description:
        "Temporary Milestone 6-A transport probe. Returns a fixed value and reads nothing. " +
        "It performs no Warcraft Logs analysis and answers no question about a log, a player " +
        "or a specialization. It is removed when the real analysis tool is introduced.",
      // No parameters. `additionalProperties: false` is the specification's
      // recommended shape for a no-argument tool: it accepts only `{}` rather
      // than silently tolerating whatever a client sends.
      inputSchema: z.object({}).strict(),
      outputSchema: PING_OUTPUT_SCHEMA,
      annotations: {
        title: "Connectivity probe (temporary)",
        readOnlyHint: true,
        // Nothing outside this Worker is contacted. The real analysis tool will
        // set this to `true`, because it reaches Warcraft Logs.
        openWorldHint: false,
        idempotentHint: true,
      },
    },
    // The serialized JSON also goes out as a text block: the specification says
    // a tool returning structured content SHOULD do so, for clients that do not
    // read `structuredContent`.
    async () => ({
      content: [{ type: "text", text: JSON.stringify(PING_OUTPUT) }],
      structuredContent: PING_OUTPUT,
    }),
  );
}
