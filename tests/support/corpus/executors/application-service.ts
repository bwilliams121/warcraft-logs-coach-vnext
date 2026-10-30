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
import {
  analyzerForSpec,
  internalAnalyzerForSpec,
  requireValidatedCatalog,
  ANALYZER_REGISTRATIONS,
  PRODUCTION_CATALOG,
} from "../../../../src/services/analyzer-registry.js";
import type { PreparationOutcome } from "../../../../src/services/result.js";
import { resolveSpecIdentity } from "../../../../src/services/spec-identity.js";
import type { ConsumableStatus } from "../../../../src/analysis/preparation/consumable-status.js";
import { isSpecId } from "../../../../src/findings/spec-id.js";
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

/**
 * The service's preparation outcome in the case's compact form: per
 * consumable, the count state with its count or lower bound, the reason codes
 * when UNKNOWN, and each use's spell and timing. NOT_ASSESSED is kept as such,
 * so it can never compare equal to an assessed expectation.
 */
function preparationView(outcome: PreparationOutcome): unknown {
  if (outcome.state === "NOT_ASSESSED") return { notAssessed: outcome.reason };
  const view = (status: ConsumableStatus) => {
    const uses = status.uses.map((use) => ({ spellId: use.spellId, timing: use.timing }));
    return status.state === "OBSERVED"
      ? { countState: "OBSERVED", count: status.count, uses }
      : {
          countState: "UNKNOWN",
          observedAtLeast: status.observedAtLeast,
          reasonCodes: status.reasons.map((reason) => reason.code),
          uses,
        };
  };
  const { statuses } = outcome.report;
  return {
    healthPotion: view(statuses.HEALTH_POTION),
    healthstone: view(statuses.HEALTHSTONE),
    combatPotion: view(statuses.COMBAT_POTION),
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
    // PREP-4: compared only when the case pins it.
    ...(params.expected.preparation === undefined
      ? {}
      : { preparation: preparationView(result.analysis.preparation) }),
  };
  if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
    return fail("the service produced a different analysis envelope than the case pins", {
      expected: params.expected,
      actual,
    });
  }
  return pass();
}

/**
 * The registry's two lookups for one specialization, and the identity table
 * beside them — over the production catalog AND a reversed one, so catalog
 * order is proven not to matter by the same assertion.
 */
export function internalRegistration(
  params: ParamsOf<"APPLICATION_SERVICE.INTERNAL_REGISTRATION">,
): AssertionOutcome {
  if (!isSpecId(params.specId)) {
    return fail("the case names a specialization this build does not know", {
      expected: { specId: params.specId },
      actual: { known: false },
    });
  }
  const specId = params.specId;
  const reversed = requireValidatedCatalog([...ANALYZER_REGISTRATIONS].reverse());
  const outcomes = [PRODUCTION_CATALOG, reversed].map((catalog) => {
    const internal = internalAnalyzerForSpec(specId, catalog);
    const publicRow = analyzerForSpec(specId, catalog);
    const [className, specName] = specId.split("/");
    return {
      internalAnalyzerId: internal?.analyzerId ?? null,
      publicAnalyzerId: publicRow?.analyzerId ?? null,
      exposure: internal?.exposure ?? null,
      identityResolvesPublicly: resolveSpecIdentity({ className: className ?? "", specName: specName ?? "" })
        .ok,
    };
  });
  for (const actual of outcomes) {
    if (JSON.stringify(actual) !== JSON.stringify(params.expected)) {
      return fail("the catalog answered the lookups differently than the case pins", {
        expected: params.expected,
        actual,
      });
    }
  }
  return pass();
}
