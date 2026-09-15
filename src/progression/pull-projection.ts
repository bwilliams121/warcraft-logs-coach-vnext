/**
 * The adapter that lets M8-B judge M7 pulls, without M8-B learning about them.
 *
 * WHY THIS MODULE EXISTS AT ALL
 *
 * `src/comparison/` is pure and stays pure: it takes plain values and imports no
 * normalized fight, no engine state, no service and no contract. That is asserted
 * by `m8b-comparison-layering.test.ts`, and M8-D does not weaken it by one line.
 *
 * But comparability is useless until something real is fed to it. Somebody has
 * to turn a `FightSummary` plus a `RaidNightIdentity` plus M8-C's encounter facts
 * into a `PullContext`. Doing that inside `src/comparison/` would have given the
 * domain a dependency on the M7 aggregate; doing it inside `src/aggregation/`
 * would have given the M7 domain a dependency on comparison. So it lives here, in
 * a third place that is allowed to know about both and is depended on by neither.
 *
 * THE DIRECTION OF EVERY IMPORT IN THIS FILE IS INWARD. It reads M7 types, M8-C
 * types and M8-B types; nothing reads it except M8-D's own aggregation.
 *
 * WHAT IT REFUSES TO DECIDE
 *
 * Whether two pulls are comparable. That is `assessPullComparability`'s job and
 * this module does not restate one of its rules — not the trash-id rule, not the
 * null-difficulty rule, not the version rule. It only supplies the values.
 */

import type { RaidNightIdentity } from "../wcl/roster-snapshot.js";
import type { FightSummary } from "../aggregation/raid-night.js";
import { pullOutcomeOf, type PullContext, type PullIdentity } from "../comparison/pull-identity.js";
import type { PullVersionEvidence } from "../comparison/version-evidence.js";
import type { EncounterOutcomeFacts, ZoneMetadata } from "../engine/normalization/encounter-facts.js";

/**
 * M8-C's per-fight context, as M8-D receives it.
 *
 * Supplied by the caller rather than read from a normalized core, because this
 * domain performs no ingestion and holds no `NormalizedFightCore`. A later
 * checkpoint wiring the runtime collects these from the cores it already built.
 */
export interface FightEncounterFacts {
  readonly fightId: number;
  readonly outcome: EncounterOutcomeFacts;
  readonly zone: ZoneMetadata | null;
}

/**
 * The version evidence a same-report raid night can honestly state.
 *
 * `partition` IS ALWAYS NULL HERE, AND THAT IS A FACT RATHER THAN A GAP. M8-A
 * found partition only on the untyped ranking payloads; no typed `ReportFight`
 * or `Report` field carries it, and M8-D issues no ranking query. Writing
 * anything else would be inventing evidence.
 *
 * It costs nothing today: every pull in one raid night shares one report code
 * and one revision, so `assessVersionCompatibility` resolves them COMPATIBLE on
 * the `SAME_REPORT_REVISION` basis — provenance identity, which needs no field
 * comparison at all.
 */
function versionEvidenceOf(identity: RaidNightIdentity): PullVersionEvidence {
  return {
    gameVersion: identity.gameVersion,
    logVersion: identity.logVersion,
    partition: null,
  };
}

export function pullIdentityOf(identity: RaidNightIdentity, fight: FightSummary): PullIdentity {
  return {
    reportCode: identity.reportCode,
    // R0. The one revision M7 pinned for the whole batch.
    reportRevision: identity.reportRevision,
    fightId: fight.fightId,
    // Passed straight through, INCLUDING `0`. Zero identifies trash and is a
    // real value; `assessEncounterCompatibility` is the only thing that decides
    // what it means, and it decides the same way for every caller.
    encounterId: fight.encounterId,
    difficulty: fight.difficulty,
    version: versionEvidenceOf(identity),
  };
}

export function pullContextOf(identity: RaidNightIdentity, fight: FightSummary): PullContext {
  return {
    identity: pullIdentityOf(identity, fight),
    // `kill` is nullable upstream and `pullOutcomeOf` maps null to UNRESOLVED
    // rather than to WIPE. A pull whose outcome Warcraft Logs did not report is
    // not a wipe.
    outcome: pullOutcomeOf(fight.kill),
    durationMs: fight.durationMs,
    raidSize: fight.size,
  };
}
