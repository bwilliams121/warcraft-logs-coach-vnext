/**
 * Non-ASCII player names survive both transports, byte for byte.
 *
 * THE PRODUCTION DEFECT THIS PINS
 *
 * The M7-F production smoke ran one real raid night through both surfaces. Every
 * structural invariant matched — revision 30, 3 fights, 20 players, 60 cells —
 * and one thing did not:
 *
 *     $.roster[6].name   REST  Dìssar
 *                        MCP   DÃ¬ssar
 *
 * Classic UTF-8 mojibake: the bytes of `ì` (c3 ac) read as two ISO-8859-1
 * characters.
 *
 * WHERE IT ACTUALLY WENT WRONG, WHICH IS NOT WHERE IT LOOKED
 *
 * Nothing in this Worker ever corrupted the string. Both transports emit the same
 * correct UTF-8 bytes — `44 c3 ac 73 73 61 72` — and the offline suite could not
 * see a problem because `Response.text()` decodes as UTF-8 regardless.
 *
 * The difference was one HTTP header. REST answers
 * `application/json; charset=utf-8`; the MCP SDK answered `application/json` with
 * no charset parameter. JSON without a charset IS UTF-8, but HTTP's legacy
 * default for a text response is ISO-8859-1, and real clients still apply it —
 * PowerShell 5.1's `Invoke-WebRequest` among them. The client decoded correct
 * bytes with the wrong table.
 *
 * That also explains the shape of the evidence exactly: `structuredContent` and
 * the text block were corrupted IDENTICALLY, because they are not two encodings —
 * they are two fields inside one body that the client decoded once.
 *
 * So this file asserts two different things, and both are necessary:
 *
 *     the payload   the exact code points survive projection and both transports
 *     the header    the response SAYS which encoding those bytes are in
 *
 * A test of the payload alone would have passed throughout the defect.
 *
 * WHAT IS DELIBERATELY NOT TESTED
 *
 * Unicode normalization equivalence. `Dìssar` composed and `Dìssar` decomposed are
 * different code point sequences and must stay different — the requirement is
 * preservation, not comparison. Nothing here may normalize, fold, strip or
 * transliterate, and a name is the ideal probe for that because no layer in this
 * system interprets one: identity flows through `sourceId`.
 */

import { describe, expect, it } from "vitest";

import { createWorker } from "../../src/api/worker.js";
import { handleMcpRequest } from "../../src/mcp/server.js";
import { projectRaidNightResult } from "../../src/contracts/raid-night-projection.js";
import { PublicRaidNightResultSchema } from "../../src/contracts/raid-night-contract.js";
import { ANALYZE_TOOL_NAME } from "../../src/mcp/tools/analyze-warcraft-log.js";
import { RAID_NIGHT_TOOL_NAME } from "../../src/mcp/tools/analyze-raid-night.js";
import type { RaidNightAnalysis } from "../../src/aggregation/raid-night.js";
import {
  aggregateOf,
  analyzedCell,
  REPORT_CODE,
  rosterFightFor,
  rosterPlayerFor,
} from "../support/raid-night-fixture.js";
import {
  ALLOWING_LIMITER,
  authHeaders,
  D2_REQUEST,
  fixedRaidNightRunner,
  fixtureAnalysisRunner,
  MCP_TEST_ENV,
  workerDepsFor,
} from "../support/analysis-transports.js";

const HOST = "warcraft-logs-coach-vnext.brandon-williams-323.workers.dev";
const TOKEN = "fake-analysis-token-not-real";

const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "m7f-unicode", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;

let nextId = 1;

/**
 * Real names, written as ESCAPES rather than literal characters.
 *
 * Deliberate: a test about encoding must not depend on this file's own encoding
 * surviving an editor, a checkout or a patch. `ì` is unambiguous; a literal
 * `ì` is a reviewer trusting their terminal. It also makes the composed and
 * decomposed entries below visibly different, which is the point of having both.
 */
const NAMES = {
  /** Plain ASCII. The control: if this broke, everything is broken. */
  ascii: "Saruxoxo",
  /** THE PRODUCTION CASE. U+00EC, two bytes in UTF-8. */
  production: "D\u00ecssar",
  /** U+00EB, a second two-byte Latin character. */
  latin: "Zo\u00eb",
  /** U+674E. Three bytes in UTF-8, outside Latin-1 entirely. */
  han: "\u674e",
  /** U+1F409 as a surrogate pair. Four bytes, and two JS code units. */
  emoji: "Ryu\u{1f409}",
  /**
   * `D` + `i` + COMBINING GRAVE ACCENT — the same GRAPHEME as `production`, and a
   * different code point sequence. Both must survive AS THEMSELVES.
   */
  decomposed: "Di\u0300ssar",
} as const;

const ROSTER = Object.values(NAMES);

/** The mojibake the production smoke saw. Written out so the test names it. */
const MOJIBAKE = "D\u00c3\u00acssar";

function unicodeAggregate(): RaidNightAnalysis {
  const sourceIds = ROSTER.map((_name, index) => index);
  return aggregateOf({
    players: sourceIds.map((sourceId) =>
      rosterPlayerFor({ sourceId, name: ROSTER[sourceId] ?? "unreachable" }),
    ),
    fights: [
      rosterFightFor({
        fightId: 1,
        participants: sourceIds.map((sourceId) => ({ sourceId, specName: "Assassination" })),
      }),
    ],
    cells: sourceIds.map((sourceId) => analyzedCell({ fightId: 1, sourceId })),
  });
}

const AGGREGATE = unicodeAggregate();
const PUBLISHED = projectRaidNightResult(AGGREGATE);

interface ToolResult {
  readonly isError?: boolean;
  readonly structuredContent?: Record<string, unknown>;
  readonly content?: readonly { readonly type: string; readonly text: string }[];
}

async function restResponse(): Promise<Response> {
  const runner = fixedRaidNightRunner(AGGREGATE);
  return await createWorker(workerDepsFor({ raidNight: runner.runner, rateLimiter: ALLOWING_LIMITER })).fetch(
    new Request(`https://${HOST}/v1/raid-night`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify({ reportCode: REPORT_CODE, fightIds: [1] }),
    }),
    MCP_TEST_ENV,
  );
}

async function mcpResponse(toolName: string, args: unknown): Promise<Response> {
  const runner = fixedRaidNightRunner(AGGREGATE);
  return await handleMcpRequest(
    new Request(`https://${HOST}/mcp`, {
      method: "POST",
      headers: {
        host: HOST,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${TOKEN}`,
        "mcp-method": "tools/call",
        "mcp-name": toolName,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: nextId++,
        method: "tools/call",
        params: { name: toolName, arguments: args, _meta: MODERN_META },
      }),
    }),
    MCP_TEST_ENV,
    {
      analyze: fixtureAnalysisRunner({ playerName: NAMES.production }),
      analyzeRaidNight: runner.runner,
      rateLimiter: ALLOWING_LIMITER,
    },
  );
}

async function toolResultFrom(response: Response): Promise<ToolResult> {
  const payload = JSON.parse(await response.text()) as { result?: ToolResult };
  if (payload.result === undefined) throw new Error("expected a tool result");
  return payload.result;
}

const RAID_NIGHT_ARGS = { source: "ids", reportCode: REPORT_CODE, fightIds: [1] } as const;

/** Every name in a published roster, in order. */
function rosterNames(document: unknown): readonly string[] {
  return (document as { roster: readonly { name: string }[] }).roster.map((player) => player.name);
}

// ---------------------------------------------------------------------------
// The payload
// ---------------------------------------------------------------------------

describe("the application projection carries the exact code points", () => {
  it("publishes every name unchanged, before any transport is involved", () => {
    // The baseline. If this failed, the defect would be in the domain rather
    // than the transport, and the rest of this file would be measuring the wrong
    // thing.
    expect(rosterNames(PUBLISHED)).toEqual(ROSTER);
  });

  it("keeps composed and decomposed forms distinct", () => {
    // NOT a normalization-equivalence test — the opposite. These two names render
    // identically and must remain different strings, because a layer that
    // "helpfully" normalized would be rewriting what Warcraft Logs reported.
    expect(NAMES.production).not.toBe(NAMES.decomposed);
    expect(rosterNames(PUBLISHED)).toContain(NAMES.production);
    expect(rosterNames(PUBLISHED)).toContain(NAMES.decomposed);
  });

  it("preserves code points rather than a rendering of them", () => {
    const published = rosterNames(PUBLISHED);
    expect([...(published[1] ?? "")].map((char) => char.codePointAt(0))).toEqual([
      0x44, 0x00ec, 0x73, 0x73, 0x61, 0x72,
    ]);
    // The astral character survives as one code point, not two lone surrogates.
    expect([...(published[4] ?? "")].map((char) => char.codePointAt(0))).toEqual([0x52, 0x79, 0x75, 0x1f409]);
  });
});

describe("REST preserves the exact Unicode", () => {
  it("returns every name unchanged", async () => {
    const body = await (await restResponse()).json();
    expect(rosterNames(body)).toEqual(ROSTER);
    expect(PublicRaidNightResultSchema.safeParse(body).success).toBe(true);
  });

  it("declares the encoding of the bytes it sent", async () => {
    expect((await restResponse()).headers.get("content-type")).toBe("application/json; charset=utf-8");
  });
});

describe("MCP preserves the exact Unicode", () => {
  it("returns every name unchanged in structuredContent", async () => {
    const result = await toolResultFrom(await mcpResponse(RAID_NIGHT_TOOL_NAME, RAID_NIGHT_ARGS));
    expect(result.isError).toBeUndefined();
    expect(rosterNames(result.structuredContent)).toEqual(ROSTER);
  });

  it("returns every name unchanged in the text block", async () => {
    const result = await toolResultFrom(await mcpResponse(RAID_NIGHT_TOOL_NAME, RAID_NIGHT_ARGS));
    expect(rosterNames(JSON.parse(result.content?.[0]?.text ?? "null"))).toEqual(ROSTER);
  });

  it("contains the production name and never the mojibake", async () => {
    // Named explicitly, so a regression reads as the thing that actually
    // happened rather than as an abstract parity failure.
    const serialized = await (await mcpResponse(RAID_NIGHT_TOOL_NAME, RAID_NIGHT_ARGS)).text();
    expect(serialized).toContain(NAMES.production);
    expect(serialized).not.toContain(MOJIBAKE);
  });
});

// ---------------------------------------------------------------------------
// The header — the actual defect
// ---------------------------------------------------------------------------

describe("MCP declares the encoding of the bytes it sends", () => {
  it("answers with charset=utf-8, as REST always did", async () => {
    // THE REGRESSION. Before the fix this was bare `application/json`, and a
    // client applying HTTP's legacy ISO-8859-1 default produced DÃ¬ssar from
    // bytes that were never wrong.
    const contentType = (await mcpResponse(RAID_NIGHT_TOOL_NAME, RAID_NIGHT_ARGS)).headers.get(
      "content-type",
    );
    expect(contentType).toContain("application/json");
    expect(contentType).toContain("charset=utf-8");
  });

  it("sends correct UTF-8 bytes, and the header is what tells a client so", async () => {
    // This is the whole defect in one test. The same bytes, read two ways:
    // decoded as UTF-8 they are the real name; decoded as Latin-1 they are
    // exactly the production mojibake. The server cannot control which a client
    // picks — it can only say, which is what the header now does.
    const bytes = await (await mcpResponse(RAID_NIGHT_TOOL_NAME, RAID_NIGHT_ARGS)).arrayBuffer();

    expect(new TextDecoder("utf-8").decode(bytes)).toContain(NAMES.production);
    expect(new TextDecoder("iso-8859-1").decode(bytes)).toContain(MOJIBAKE);
  });

  it("does not re-encode the body it passes through", async () => {
    // The fix adds a header and nothing else. `ì` must still be the two bytes
    // c3 ac — a double encoding would show up here as c3 83 c2 ac, which is the
    // mojibake baked into the payload instead of merely displayed.
    const bytes = new Uint8Array(
      await (await mcpResponse(RAID_NIGHT_TOOL_NAME, RAID_NIGHT_ARGS)).arrayBuffer(),
    );
    const start = bytes.findIndex(
      (byte, index) => byte === 0x44 && bytes[index + 1] === 0xc3 && bytes[index + 2] === 0xac,
    );
    expect(start).toBeGreaterThan(-1);
    expect([...bytes.slice(start, start + 7)]).toEqual([0x44, 0xc3, 0xac, 0x73, 0x73, 0x61, 0x72]);
  });
});

// ---------------------------------------------------------------------------
// Parity, with Unicode in it
// ---------------------------------------------------------------------------

describe("REST and MCP agree on Unicode, not merely on structure", () => {
  it("REST body deep-equals MCP structuredContent deep-equals MCP text", async () => {
    const restBody = await (await restResponse()).json();
    const result = await toolResultFrom(await mcpResponse(RAID_NIGHT_TOOL_NAME, RAID_NIGHT_ARGS));
    const text = JSON.parse(result.content?.[0]?.text ?? "null");

    expect(restBody).toEqual(result.structuredContent);
    expect(text).toEqual(restBody);
    // And non-vacuously: the thing being compared actually contains the
    // characters the production smoke disagreed about.
    expect(rosterNames(restBody)).toEqual(ROSTER);
  });
});

// ---------------------------------------------------------------------------
// The M6 single-fight tool shared the same transport
// ---------------------------------------------------------------------------

describe("the single-fight MCP tool preserves Unicode too", () => {
  const SINGLE_FIGHT_ARGS = { source: "ids", ...D2_REQUEST } as const;

  it("carries a non-ASCII player name through structuredContent and text", async () => {
    // `analyze_warcraft_log` was equally exposed: the defect was in the shared
    // `/mcp` response, not in either tool. One central fix covers both, and this
    // proves the older surface is covered rather than assuming it.
    const response = await mcpResponse(ANALYZE_TOOL_NAME, SINGLE_FIGHT_ARGS);
    const result = await toolResultFrom(response);

    expect(result.isError).toBeUndefined();
    const structured = result.structuredContent as { identity: { player: { name: string } } };
    expect(structured.identity.player.name).toBe(NAMES.production);

    const text = JSON.parse(result.content?.[0]?.text ?? "null") as typeof structured;
    expect(text.identity.player.name).toBe(NAMES.production);
  });

  it("declares charset=utf-8 on the single-fight response as well", async () => {
    const response = await mcpResponse(ANALYZE_TOOL_NAME, SINGLE_FIGHT_ARGS);
    expect(response.headers.get("content-type")).toContain("charset=utf-8");
  });
});
