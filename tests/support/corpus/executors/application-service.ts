/**
 * APPLICATION_SERVICE executors: the real application service over an
 * artifact, with only its two Warcraft Logs ports faked. No transport.
 *
 * What the service owns and the corpus pins here: which specialization and
 * analyzer it recognizes for a preflight identity, what ingestion scope it
 * DERIVES from the enabled analyzers (never chosen by a caller), and the
 * status it reports — including the explicit SPEC_NOT_SUPPORTED that keeps an
 * unsupported specialization from reading as clean play.
 */

import { analyzeFight, type AnalysisServiceDeps } from "../../../../src/services/analysis-service.js";
import type { CombatFight } from "../../../../src/engine/normalization/combat-fight.js";
import type { FightIdentity } from "../../../../src/wcl/types.js";
import { MCP_TEST_ENV } from "../../analysis-transports.js";
import { fightOf } from "../fight.js";
import type { LoadedArtifact, LoadedCorpus } from "../loader.js";
import { fail, pass, type AssertionOutcome } from "./outcome.js";
import type { ParamsOf } from "./params.js";

function identityFor(
  fight: CombatFight,
  subject: { readonly actorId: number; readonly className: string; readonly specName: string },
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

export async function fightAnalysis(
  corpus: LoadedCorpus,
  artifact: LoadedArtifact,
  params: ParamsOf<"APPLICATION_SERVICE.FIGHT_ANALYSIS">,
): Promise<AssertionOutcome> {
  const fight = fightOf(corpus, artifact);
  const identity = identityFor(fight, params.subject);
  const deps: AnalysisServiceDeps = {
    env: MCP_TEST_ENV,
    preflight: async () => ({ ok: true, identity, rateLimit: undefined }),
    ingest: async () => ({ ok: true, fight, rateLimit: undefined }),
  };
  const result = await analyzeFight(
    { reportCode: fight.report.code, fightId: fight.fight.id, sourceId: params.subject.actorId },
    deps,
  );
  if (!result.ok) {
    return fail("the service refused the request", {
      expected: { ok: true },
      actual: { ok: false, code: result.error.code },
    });
  }
  const actual = {
    status: result.analysis.analysis.status,
    specId: result.analysis.specId,
    analyzerId: result.analysis.analyzerId,
    scope: result.analysis.scope,
  };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the service produced a different analysis envelope than the case pins", {
      expected: params.expected,
      actual,
    });
  }
  return pass();
}
