/**
 * M11-A1: the REAL Worker's `tools/list` publishes the DERIVED
 * supported-specialization sentence in both analysis tool descriptions.
 *
 * `analyzeToolDescription` / `raidNightToolDescription` take the sentence as
 * an argument and the MCP layer holds an "unbound" sentinel for a handler
 * constructed without one. So the contract tests can prove the builders, but
 * only a request through the deployed composition root (`src/api/worker.ts`
 * -> `handleMcpRequest`) proves that production actually binds the sentence
 * the catalog derives. That is this test: no injected deps, the default
 * export, the sentinel bearer the pool configures.
 */

import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { PRODUCTION_MCP_HOSTNAME } from "../../src/mcp/server.js";
import { ANALYZE_TOOL_NAME } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { RAID_NIGHT_TOOL_NAME } from "../../src/mcp/tools/analyze-raid-night.js";
import { SUPPORTED_SPECIALIZATIONS_SENTENCE } from "../../src/services/analyzer-registry.js";

/** Matches the binding in vitest.config.ts. An obvious sentinel, never a real token. */
const TEST_TOKEN = "fake-analysis-token-not-real";
const MCP_URL = `https://${PRODUCTION_MCP_HOSTNAME}/mcp`;

const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "m11a-test-client", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;

async function toolsList(): Promise<readonly { readonly name: string; readonly description: string }[]> {
  const response = await SELF.fetch(
    new Request(MCP_URL, {
      method: "POST",
      headers: {
        host: new URL(MCP_URL).host,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${TEST_TOKEN}`,
        "mcp-method": "tools/list",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: { _meta: MODERN_META } }),
    }),
  );
  expect(response.status).toBe(200);
  const text = await response.text();
  const payload = (
    (response.headers.get("content-type") ?? "").includes("text/event-stream")
      ? JSON.parse(
          (text.split("\n").find((line) => line.startsWith("data: ")) ?? "data: {}").slice("data: ".length),
        )
      : JSON.parse(text)
  ) as {
    readonly result?: { readonly tools?: readonly { readonly name: string; readonly description: string }[] };
  };
  const tools = payload.result?.tools;
  if (tools === undefined) throw new Error(`tools/list returned no tools: ${text}`);
  return tools;
}

describe("the deployed composition binds the derived supported-specialization sentence", () => {
  it("both analysis tools carry it verbatim, and neither carries the unbound sentinel", async () => {
    const tools = await toolsList();
    for (const name of [ANALYZE_TOOL_NAME, RAID_NIGHT_TOOL_NAME]) {
      const tool = tools.find((candidate) => candidate.name === name);
      expect(tool, name).toBeDefined();
      expect(tool?.description, name).toContain(SUPPORTED_SPECIALIZATIONS_SENTENCE);
      expect(tool?.description, name).not.toContain("composition defect");
    }
  });

  it("the sentence names Assassination Rogue, Augmentation Evoker, Blood Death Knight, Brewmaster Monk, Holy Paladin, Mistweaver Monk, Protection Paladin, Restoration Shaman and Retribution Paladin and nothing else", async () => {
    // The reviewed snapshot, seen through the wire rather than the constant.
    const tools = await toolsList();
    const analyze = tools.find((candidate) => candidate.name === ANALYZE_TOOL_NAME);
    expect(analyze?.description).toContain(
      "Supported specializations: Assassination Rogue, Augmentation Evoker, Blood Death Knight, Brewmaster Monk, Holy Paladin, Mistweaver Monk, Protection Paladin, Restoration Shaman and Retribution Paladin.",
    );
    // M11-B12: Blood's limits paragraph is composed through the same seam,
    // on both tools, and names the validated hero tree rather than a rotation.
    expect(analyze?.description).toContain(
      "Blood Death Knight analysis evaluates observed offensive global-cooldown decisions",
    );
    expect(analyze?.description).toContain("VALIDATED FOR THE SAN'LAYN HERO TREE ONLY");
    // M11-A5: the Retribution limits paragraph is composed through the same
    // seam as Protection's, on both tools, and says what the slice is.
    const raidNight = tools.find((candidate) => candidate.name === RAID_NIGHT_TOOL_NAME);
    expect(analyze?.description).toContain(
      "Retribution Paladin analysis currently evaluates only observed Holy Power SPENDER decisions",
    );
    expect(analyze?.description).toContain("OUTSIDE_SUPPORTED_SLICE");
    expect(raidNight?.description).toContain(
      "Retribution Paladin cells count only observed Holy Power SPENDER decisions",
    );
    expect(analyze?.description).not.toContain("full Retribution rotation");
  });
});
