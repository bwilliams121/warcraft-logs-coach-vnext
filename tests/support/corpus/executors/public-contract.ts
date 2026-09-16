/**
 * PUBLIC_CONTRACT executors: REST/MCP parity over one artifact, through the
 * real Worker, the real MCP handler, the real services and the real
 * projections — with every Warcraft Logs port replaced by an offline fake that
 * answers from the artifact.
 *
 * WHAT "PARITY" MEANS HERE
 *
 * `JSON.parse(REST body)`, MCP `structuredContent`, and `JSON.parse(MCP text)`
 * are deeply equal, and all three validate against the frozen public schema.
 * Structures, never bytes: key order is a serialiser detail. On top of that
 * the case pins a FEW semantic facts — a status, a cell count — so a parity
 * that held between two identically wrong documents would still be caught.
 *
 * NO NETWORK. `createWorker(...).fetch` is invoked directly with a `Request`;
 * no socket is opened. The runners are the production services over fake
 * ports. Nothing here can reach Warcraft Logs.
 */

import { createWorker } from "../../../../src/api/worker.js";
import type { Env } from "../../../../src/config/env.js";
import { PublicAnalysisResultSchema } from "../../../../src/contracts/analysis-contract.js";
import { PublicEncounterContextResultSchema } from "../../../../src/contracts/encounter-context-contract.js";
import { PublicRaidNightResultSchema } from "../../../../src/contracts/raid-night-contract.js";
import { handleMcpRequest } from "../../../../src/mcp/server.js";
import { ENCOUNTER_CONTEXT_TOOL_NAME } from "../../../../src/mcp/tools/analyze-encounter-context.js";
import { RAID_NIGHT_TOOL_NAME } from "../../../../src/mcp/tools/analyze-raid-night.js";
import { ANALYZE_TOOL_NAME } from "../../../../src/mcp/tools/analyze-warcraft-log.js";
import { analyzeFight, type AnalysisServiceDeps } from "../../../../src/services/analysis-service.js";
import type { AnalysisRunner } from "../../../../src/services/analysis-runner.js";
import { analyzeEncounterContext } from "../../../../src/services/encounter-context-service.js";
import type { EncounterContextRunner } from "../../../../src/services/encounter-context-runner.js";
import { analyzeRaidNight } from "../../../../src/services/raid-night-service.js";
import type { RaidNightRunner } from "../../../../src/services/raid-night-runner.js";
import type { CombatFight } from "../../../../src/engine/normalization/combat-fight.js";
import type { ExternalDiscoveryPorts } from "../../../../src/external-context/external-discovery.js";
import { decodeRankingPayload } from "../../../../src/wcl/rankings/rankings-decoder.js";
import { decodeEncounterRankings } from "../../../../src/wcl/rankings/rankings-query.js";
import type { FightIdentity } from "../../../../src/wcl/types.js";
import type { ZodType } from "zod";
import { ALLOWING_LIMITER, MCP_TEST_ENV, authHeaders, workerDepsFor } from "../../analysis-transports.js";
import { candidateReport } from "../../m8f-fixture.js";
import { REPORT_CODE, assassinationSnapshot, fakePorts } from "../../raid-night-orchestration-fixture.js";
import { fightOf } from "../fight.js";
import type { LoadedArtifact, LoadedCorpus } from "../loader.js";
import { fail, pass, type AssertionOutcome } from "./outcome.js";
import type { ParamsOf } from "./params.js";

const HOST = "warcraft-logs-coach-vnext.brandon-williams-323.workers.dev";
const MODERN_META = {
  "io.modelcontextprotocol/protocolVersion": "2026-07-28",
  "io.modelcontextprotocol/clientInfo": { name: "m9b-corpus-parity", version: "1.0.0" },
  "io.modelcontextprotocol/clientCapabilities": {},
} as const;

/**
 * The one artifact the raid-night orchestration fixture is built over. Its
 * fake ports normalize the D2 events under the D2 window and fan them out per
 * participant; running them over any other artifact would silently apply the
 * wrong window. Stated as a limitation rather than papered over.
 */
const RAID_NIGHT_ARTIFACT = "wcl-assassination-d2-decision-corpus";

interface McpToolResult {
  readonly isError?: boolean;
  readonly structuredContent?: unknown;
  readonly content?: readonly { readonly type: string; readonly text: string }[];
}

interface Surfaces {
  readonly rest: { readonly status: number; readonly body: unknown };
  readonly mcp: McpToolResult;
}

let nextId = 1;

async function rest(path: string, body: unknown, runners: Runners): Promise<Surfaces["rest"]> {
  const response = await createWorker(workerDepsFor({ ...runners, rateLimiter: ALLOWING_LIMITER })).fetch(
    new Request(`https://${HOST}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...authHeaders() },
      body: JSON.stringify(body),
    }),
    MCP_TEST_ENV,
  );
  return { status: response.status, body: await response.json() };
}

interface Runners {
  readonly analyze?: AnalysisRunner;
  readonly raidNight?: RaidNightRunner;
  readonly encounterContext?: EncounterContextRunner;
}

async function mcp(tool: string, args: unknown, runners: Runners): Promise<McpToolResult> {
  const response = await handleMcpRequest(
    new Request(`https://${HOST}/mcp`, {
      method: "POST",
      headers: {
        host: HOST,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...authHeaders(),
        "mcp-method": "tools/call",
        "mcp-name": tool,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: nextId++,
        method: "tools/call",
        params: { name: tool, arguments: args, _meta: MODERN_META },
      }),
    }),
    MCP_TEST_ENV,
    {
      ...(runners.analyze === undefined ? {} : { analyze: runners.analyze }),
      ...(runners.raidNight === undefined ? {} : { analyzeRaidNight: runners.raidNight }),
      ...(runners.encounterContext === undefined
        ? {}
        : { analyzeEncounterContext: runners.encounterContext }),
      rateLimiter: ALLOWING_LIMITER,
    },
  );
  const payload = JSON.parse(await response.text()) as { result: McpToolResult };
  return payload.result;
}

/** The three-way equality plus schema validity. `null` when they agree; the mismatch otherwise. */
function parityViolation(surfaces: Surfaces, schema: ZodType): AssertionOutcome | null {
  const { rest: restResult, mcp: mcpResult } = surfaces;
  if (restResult.status !== 200) {
    return fail("REST did not answer 200", {
      expected: { status: 200 },
      actual: { status: restResult.status, body: restResult.body },
    });
  }
  if (mcpResult.isError !== undefined) {
    return fail("MCP answered a tool error", {
      expected: { isError: undefined },
      actual: { isError: mcpResult.isError, text: mcpResult.content?.[0]?.text?.slice(0, 300) ?? null },
    });
  }
  const fromText: unknown = JSON.parse(mcpResult.content?.[0]?.text ?? "null");
  const restText = JSON.stringify(sortKeys(restResult.body));
  if (JSON.stringify(sortKeys(mcpResult.structuredContent)) !== restText) {
    return fail("MCP structuredContent differs from the REST body", {
      expected: "equal documents",
      actual: "documents differ",
    });
  }
  if (JSON.stringify(sortKeys(fromText)) !== restText) {
    return fail("the JSON inside the MCP text block differs from the REST body", {
      expected: "equal documents",
      actual: "documents differ",
    });
  }
  const parsed = schema.safeParse(restResult.body);
  if (!parsed.success) {
    return fail("the shared document does not validate against the frozen public schema", {
      expected: "schema-valid document",
      actual: parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.map(String).join(".")}: ${issue.message}`),
    });
  }
  return null;
}

/**
 * The one overall comparability every qualified reference carries, or `NONE`
 * when nothing qualified. Two different values would be a defect in the
 * assessment (M8-B answers the same across-report question the same way), and
 * are reported verbatim so the failure names them.
 */
function comparabilityOf(values: readonly string[]): string {
  const distinct = [...new Set(values)];
  if (distinct.length === 0) return "NONE";
  return distinct.length === 1 ? (distinct[0] ?? "NONE") : distinct.join("|");
}

/** Key-sorted deep copy, so structural equality ignores serialiser key order. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === "object" && value !== null) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

function identityFor(
  fight: CombatFight,
  subject: { actorId: number; className: string; specName: string },
): FightIdentity {
  return {
    report: {
      code: fight.report.code,
      revision: fight.report.revision,
      startTime: fight.report.startTimeUnixMs,
      endTime: fight.report.endTimeUnixMs,
    },
    data: fight.data,
    fight: {
      id: fight.fight.id,
      name: fight.fight.name,
      encounterId: fight.fight.encounterId,
      difficulty: fight.fight.difficulty,
      startTime: fight.fight.startTimeMs,
      endTime: fight.fight.endTimeMs,
    },
    player: {
      sourceId: subject.actorId,
      name: "Corpusplayer",
      className: subject.className,
      specName: subject.specName,
    },
  };
}

async function analysisParity(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: Extract<ParamsOf<"PUBLIC_CONTRACT.REST_MCP_PARITY">, { document: "ANALYSIS" }>,
): Promise<AssertionOutcome> {
  const fight = fightOf(corpus, artifact);
  const identity = identityFor(fight, params.subject);
  const deps: AnalysisServiceDeps = {
    env: MCP_TEST_ENV,
    preflight: async () => ({ ok: true, identity, rateLimit: undefined }),
    ingest: async () => ({ ok: true, fight, rateLimit: undefined }),
  };
  const analyze: AnalysisRunner = async (input) => await analyzeFight(input, deps);
  const ids = { reportCode: fight.report.code, fightId: fight.fight.id, sourceId: params.subject.actorId };

  const surfaces: Surfaces = {
    rest: await rest("/v1/analysis", ids, { analyze }),
    mcp: await mcp(ANALYZE_TOOL_NAME, { source: "ids", ...ids }, { analyze }),
  };
  const violation = parityViolation(surfaces, PublicAnalysisResultSchema);
  if (violation !== null) return violation;

  const document = surfaces.rest.body as { status: string; capability?: { matchMeaning?: string } };
  if (document.status !== params.expected.status) {
    return fail("the shared analysis document carries a different status", {
      expected: { status: params.expected.status },
      actual: { status: document.status },
    });
  }
  if (document.status === "ANALYZED" && document.capability?.matchMeaning !== "AUTHORITY_COMPATIBLE_ONLY") {
    return fail("an analyzed document must publish MATCH as AUTHORITY_COMPATIBLE_ONLY", {
      expected: { matchMeaning: "AUTHORITY_COMPATIBLE_ONLY" },
      actual: { matchMeaning: document.capability?.matchMeaning ?? null },
    });
  }
  return pass();
}

function raidNightPorts(
  fightIds: readonly number[],
  actorId: number,
  subjectFight?: { encounterId: number; difficulty: number; durationMs: number },
) {
  const fightFacts =
    subjectFight === undefined
      ? {}
      : {
          fightFacts: {
            encounterId: subjectFight.encounterId,
            difficulty: subjectFight.difficulty,
            kill: true,
            startTimeMs: 1_000,
            endTimeMs: 1_000 + subjectFight.durationMs,
          },
        };
  return fakePorts({ snapshot: assassinationSnapshot({ fightIds, sourceIds: [actorId], ...fightFacts }) });
}

type ExternalSpec = NonNullable<
  Extract<ParamsOf<"PUBLIC_CONTRACT.REST_MCP_PARITY">, { document: "ENCOUNTER_CONTEXT" }>["external"]
>;

interface ExternalPortDouble {
  readonly ports: ExternalDiscoveryPorts;
  rankingRequests(): number;
  metadataRequests(): number;
}

/**
 * M8-F's two ports, entirely offline.
 *
 * The ranking page is the sanitized capture, decoded by the REAL decoder. The
 * per-candidate metadata is a SYNTHETIC report (a stated test premise: the
 * corpus holds no third-party report) whose single player carries the row's
 * remapped name and no server, so identity resolution has exactly one way to
 * succeed. A `TRANSPORT_FAILURE` ranking port answers what the production
 * adapter answers when the GraphQL call fails: PAYLOAD_UNRECOGNISED, never an
 * empty pool. A candidate named in `metadataUnavailableFor` answers `null`,
 * which is the port's "report not served" and must become a candidate-local
 * failure that leaves every other candidate untouched.
 */
function externalPortDouble(
  rankings: LoadedArtifact,
  spec: ExternalSpec,
  subject: { encounterId: number; difficulty: number },
): ExternalPortDouble {
  let rankingRequests = 0;
  let metadataRequests = 0;
  const rowNames = new Map<string, string>();
  const decodedEnvelope = decodeEncounterRankings(rankings.json);
  if (decodedEnvelope.ok) {
    const page = decodedEnvelope.value.rankings as { rankings?: unknown[] } | undefined;
    for (const row of page?.rankings ?? []) {
      const record = row as { name?: unknown; report?: { code?: unknown; fightID?: unknown } };
      if (typeof record.name === "string" && typeof record.report?.code === "string") {
        rowNames.set(`${record.report.code}:${String(record.report.fightID)}`, record.name);
      }
    }
  }
  const unavailable = new Set(spec.metadataUnavailableFor);
  return {
    ports: {
      rankingPage: async () => {
        rankingRequests += 1;
        if (spec.rankingPort === "TRANSPORT_FAILURE" || !decodedEnvelope.ok) {
          return { outcome: "PAYLOAD_UNRECOGNISED", defect: "RANKINGS_NOT_A_RECORD" };
        }
        return decodeRankingPayload(decodedEnvelope.value.rankings);
      },
      candidateMetadata: async (reportCode, fightId) => {
        metadataRequests += 1;
        if (unavailable.has(reportCode)) return null;
        const name = rowNames.get(`${reportCode}:${String(fightId)}`) ?? "Unlisted";
        return candidateReport({
          code: reportCode,
          fightId,
          encounterId: subject.encounterId,
          difficulty: subject.difficulty,
          actors: [
            { id: 25, name, server: null, type: "Player", subType: "Rogue" },
            { id: 90, name: "Boss", type: "NPC", subType: "Boss" },
          ],
        });
      },
    },
    rankingRequests: () => rankingRequests,
    metadataRequests: () => metadataRequests,
  };
}

async function raidNightParity(
  artifact: LoadedArtifact,
  params: Extract<ParamsOf<"PUBLIC_CONTRACT.REST_MCP_PARITY">, { document: "RAID_NIGHT" }>,
): Promise<AssertionOutcome> {
  if (artifact.record.artifactId !== RAID_NIGHT_ARTIFACT) {
    return fail(
      `raid-night parity runs over ${RAID_NIGHT_ARTIFACT} only; the orchestration fixture normalizes that artifact under its own window`,
    );
  }
  const ports = raidNightPorts(params.fightIds, params.subject.actorId);
  const raidNight: RaidNightRunner = async (request) => await analyzeRaidNight(request, ports.deps);
  const args = { reportCode: REPORT_CODE, fightIds: [...params.fightIds] };

  const surfaces: Surfaces = {
    rest: await rest("/v1/raid-night", args, { raidNight }),
    mcp: await mcp(RAID_NIGHT_TOOL_NAME, { source: "ids", ...args }, { raidNight }),
  };
  const violation = parityViolation(surfaces, PublicRaidNightResultSchema);
  if (violation !== null) return violation;

  const document = surfaces.rest.body as { cells: readonly { kind: string }[] };
  const analyzedCells = document.cells.filter((cell) => cell.kind === "ANALYZED").length;
  if (analyzedCells !== params.expected.analyzedCells) {
    return fail("the shared raid-night document analyzed a different number of cells", {
      expected: { analyzedCells: params.expected.analyzedCells },
      actual: { analyzedCells, cellKinds: document.cells.map((cell) => cell.kind) },
    });
  }
  return pass();
}

async function encounterContextParity(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: Extract<ParamsOf<"PUBLIC_CONTRACT.REST_MCP_PARITY">, { document: "ENCOUNTER_CONTEXT" }>,
): Promise<AssertionOutcome> {
  if (artifact.record.artifactId !== RAID_NIGHT_ARTIFACT) {
    return fail(
      `encounter-context parity runs over ${RAID_NIGHT_ARTIFACT} only; the orchestration fixture normalizes that artifact under its own window`,
    );
  }
  const ports = raidNightPorts(params.fightIds, params.subject.actorId, params.subjectFight);
  const { env: _env, ...raidNightDeps } = ports.deps;
  const env: Env = MCP_TEST_ENV;

  // One fresh port double PER SURFACE, so the request counts below are what
  // one document costs and both transports are shown to spend the same.
  let doubles: { readonly rest: ExternalPortDouble; readonly mcp: ExternalPortDouble } | null = null;
  if (params.external !== undefined) {
    if (params.subjectFight === undefined) {
      return fail("an external-enabled case must state the subject fight's encounter facts");
    }
    const rankingsArtifactId = params.external.rankingsArtifactId;
    const rankings = corpus.artifacts.find((candidate) => candidate.record.artifactId === rankingsArtifactId);
    if (rankings === undefined) {
      return fail(`rankings artifact ${rankingsArtifactId} is not in the corpus`);
    }
    doubles = {
      rest: externalPortDouble(rankings, params.external, params.subjectFight),
      mcp: externalPortDouble(rankings, params.external, params.subjectFight),
    };
  }
  const runnerOver = (external: ExternalPortDouble | null): EncounterContextRunner => {
    return async (request) =>
      await analyzeEncounterContext(request, {
        env,
        raidNight: raidNightDeps,
        ...(external === null ? {} : { external: external.ports }),
      });
  };
  const args = {
    reportCode: REPORT_CODE,
    fightIds: [...params.fightIds],
    ...(params.external === undefined
      ? {}
      : {
          externalReferences: {
            mode: "ENABLED",
            subjectFightId: params.subjectFightId,
            className: params.external.className,
            specName: params.external.specName,
            metric: "dps",
            partition: { mode: "PINNED", partition: 1 },
          },
        }),
  };

  const surfaces: Surfaces = {
    rest: await rest("/v1/encounter-context", args, {
      encounterContext: runnerOver(doubles?.rest ?? null),
    }),
    mcp: await mcp(
      ENCOUNTER_CONTEXT_TOOL_NAME,
      { source: "ids", ...args },
      {
        encounterContext: runnerOver(doubles?.mcp ?? null),
      },
    ),
  };
  const violation = parityViolation(surfaces, PublicEncounterContextResultSchema);
  if (violation !== null) return violation;

  const spent = (double: ExternalPortDouble | null) => ({
    metadataRequests: double?.metadataRequests() ?? 0,
    rankingRequests: double?.rankingRequests() ?? 0,
  });
  const external = doubles?.rest ?? null;
  if (doubles !== null && JSON.stringify(spent(doubles.rest)) !== JSON.stringify(spent(doubles.mcp))) {
    return fail("REST and MCP spent different external requests for the same document", {
      expected: spent(doubles.rest),
      actual: spent(doubles.mcp),
    });
  }

  const document = surfaces.rest.body as {
    encounters: readonly { pulls: readonly unknown[] }[];
    unresolvedPulls: readonly unknown[];
    externalReferences: {
      status: string;
      qualified?: readonly {
        comparability: { comparability: string };
        reportCode: string;
        fightId: number;
      }[];
      failures?: readonly unknown[];
      ineligible?: readonly unknown[];
    };
  };
  const section = document.externalReferences;
  if (section.status !== params.expected.externalReferenceStatus) {
    return fail("the shared encounter-context document carries a different external-reference status", {
      expected: { externalReferenceStatus: params.expected.externalReferenceStatus },
      actual: { externalReferenceStatus: section.status },
    });
  }
  // Whatever the external half did, the local half stands: the subject's own
  // pulls are published. An external failure that emptied local progression
  // would be a defect the status alone could not show.
  const localPulls =
    document.encounters.reduce((sum, e) => sum + e.pulls.length, 0) + document.unresolvedPulls.length;
  if (localPulls !== params.fightIds.length) {
    return fail("local progression does not carry every requested pull", {
      expected: { localPulls: params.fightIds.length },
      actual: { localPulls },
    });
  }
  if (params.expected.externalReferenceStatus === "COMPLETED") {
    const qualified = section.qualified ?? [];
    const ordered = qualified.every((reference, index) => {
      const previous = qualified[index - 1];
      if (previous === undefined) return true;
      return (
        previous.reportCode < reference.reportCode ||
        (previous.reportCode === reference.reportCode && previous.fightId < reference.fightId)
      );
    });
    const actual = {
      qualified: qualified.length,
      failures: section.failures?.length ?? 0,
      ineligible: section.ineligible?.length ?? 0,
      comparability: comparabilityOf(qualified.map((reference) => reference.comparability.comparability)),
      metadataRequests: external?.metadataRequests() ?? 0,
      rankingRequests: external?.rankingRequests() ?? 0,
    };
    const { externalReferenceStatus: _status, ...expected } = params.expected;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      return fail("the external-reference section differs from what the case pins", { expected, actual });
    }
    if (!ordered) {
      return fail("qualified references are not in ascending (reportCode, fightId) order", {
        expected: "ascending by coordinate",
        actual: qualified.map((reference) => `${reference.reportCode}:${String(reference.fightId)}`),
      });
    }
  } else if (external !== null) {
    // A discovery that did not complete must not have spent metadata requests.
    const metadataRequests = external.metadataRequests();
    if (metadataRequests !== 0) {
      return fail("a discovery that did not complete still issued candidate metadata requests", {
        expected: { metadataRequests: 0 },
        actual: { metadataRequests },
      });
    }
  }
  return pass();
}

export async function restMcpParity(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"PUBLIC_CONTRACT.REST_MCP_PARITY">,
): Promise<AssertionOutcome> {
  switch (params.document) {
    case "ANALYSIS":
      return await analysisParity(corpus, artifact, params);
    case "RAID_NIGHT":
      return await raidNightParity(artifact, params);
    case "ENCOUNTER_CONTEXT":
      return await encounterContextParity(corpus, artifact, params);
  }
}
