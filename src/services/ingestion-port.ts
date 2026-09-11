/**
 * The combat ingestion port.
 *
 * A TYPE ONLY. There is no production implementation bound to it, and
 * `AnalysisServiceDeps` does not carry it.
 *
 * That is deliberate. Milestone 3 builds the ingestion capability; it does not
 * switch it on. No feature flag, no environment toggle, no conditional in
 * `analyzeFight` — anything of that shape is a path that can be enabled by
 * accident, and enabling it today would make `/v1/analysis` spend Warcraft Logs
 * points retrieving evidence that no analyzer has asked for and nothing would
 * read.
 *
 * Milestone 5 adds this to the service dependencies at the same time as the
 * first analyzer declares its required inputs, so ingestion acquires a caller
 * and a reason on the same commit.
 *
 * Note what does NOT appear here: no GraphQL shape, no page type, no
 * `RawEventPage`, no `unknown`. The service layer depends on the normalized
 * model and the request, and on nothing from the Warcraft Logs wire format.
 */

import type { WclCredentials } from "../config/env.js";
import type { FightIngestionRequest, FightIngestionResult } from "../wcl/ingest-fight.js";

export type CombatIngestionPort = (
  request: FightIngestionRequest,
  credentials: WclCredentials,
) => Promise<FightIngestionResult>;
