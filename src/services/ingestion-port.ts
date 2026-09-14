/**
 * The combat ingestion port.
 *
 * `AnalysisServiceDeps` now carries this, and the composed path calls it: an
 * analyzer is registered, it declares what evidence it needs, and retrieval
 * finally has a caller and a reason. That was always the condition — ingestion
 * was built in Milestone 3 and deliberately left unbound until something asked
 * for it.
 *
 * WHAT HAS NOT CHANGED IS WHERE THE REAL IMPLEMENTATION IS BOUND.
 *
 * Nothing binds it at a production composition root yet. `/v1/analysis` supplies
 * no ingestion port, so the live route still cannot retrieve a single event —
 * and because the capability is a missing DEPENDENCY rather than a disabled
 * flag, that is structural rather than a promise. There is no toggle to flip by
 * accident, and no path that spends Warcraft Logs points on evidence nothing
 * reads. M6-E binds the real ingestor when the public contract is ready for it.
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
