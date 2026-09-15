/**
 * Raid-night orchestration.
 *
 * SELECTING AND SEQUENCING, AND NOTHING ELSE. This module holds no gameplay rule,
 * no aggregation arithmetic and no Warcraft Logs GraphQL shape. Every judgement in
 * its output was made by a layer that already existed:
 *
 *     M7-C  who was there, what they played, which revision  (roster port)
 *     M7-B  one reusable fight core, one focused view per player
 *     M4    combat state
 *     M5    the gameplay verdict, behind its own facade
 *     M7-D  cells, the input gate, the aggregate
 *     M7-E  the public document
 *
 * It runs under a plain Node test project with no Workers runtime present, which
 * is the mechanical proof that both REST and MCP reach identical truth through it.
 *
 * THE COST PROPERTIES THIS FILE IS RESPONSIBLE FOR
 *
 * Three, and they are the reason raid-night analysis is viable at all:
 *
 *   ONE roster query per request, never one per fight or per player.
 *   ONE ingestion per fight that NEEDS one — reused across every analyzed player.
 *   ZERO ingestion for a fight no selected player needs analyzed.
 *
 * The third is the largest saving on a real mixed roster and the easiest to lose:
 * an `ingestFightCore` call moved above the "does anyone need this" check would
 * still pass every correctness test while spending a full pagination per pull.
 *
 * MEMORY DISCIPLINE IS STRUCTURAL
 *
 * Fights are processed in a loop, one core alive at a time; players likewise, one
 * `CombatState` at a time. Nothing accumulates cores or states in an array. What
 * survives a loop iteration is the small cell — a few dozen integers — which is
 * the whole reason the M7-D projection exists.
 *
 * WHAT THAT DOES AND DOES NOT ESTABLISH
 *
 * Cloudflare documents 128 MB per isolate. The sequential loop is what rules out
 * the obviously fatal shape — twenty `CombatState`s resident at once — but it
 * does not prove the surviving shape fits: one fight core, plus one
 * `CombatState`, plus the accumulated cells and snapshot facts, still has to live
 * inside that isolate.
 *
 * Nothing in this repository has measured that. The offline Node benchmark in
 * `scripts/bench/` is engineering evidence about relative cost on a developer
 * machine, under Node's allocator and GC; it is not a Cloudflare-isolate
 * measurement and must not be read as one. Single-fight production behaviour is
 * the nearest real evidence, and the raid-night production smoke is the actual
 * proof.
 */

import { createCombatState } from "../engine/state/combat-state.js";
import { absentCell, analysisUnavailableCell, toPlayerFightCell } from "../aggregation/cell-projection.js";
import type { PlayerFightResult } from "../aggregation/cell.js";
import { aggregateRaidNight } from "../aggregation/roster-aggregator.js";
import {
  verifyRaidNightInput,
  type FightProcessingOutcome,
  type FightProcessingRecord,
} from "../aggregation/raid-night.js";
import { loadConfig, type Env } from "../config/env.js";
import { focusedFightFor } from "../engine/normalization/fight-core.js";
import type { EncounterOutcomeFacts, ZoneMetadata } from "../engine/normalization/encounter-facts.js";
import type { IngestionFailureReason } from "../wcl/ingest-fight.js";
import type { RevisionCheck } from "../wcl/report-revision.js";
import type { ReportRosterFailureReason } from "../wcl/report-roster.js";
import {
  participationFor,
  playerKeyOf,
  type ReportRosterSnapshot,
  type RosterPlayer,
} from "../wcl/roster-snapshot.js";
import { analyzerForSpec, ENABLED_ANALYZERS, type RegisteredAnalyzer } from "./analyzer-registry.js";
import { deriveIngestionScope, type AnalyzerRequirement } from "./ingestion-scope.js";
import type { FightCoreIngestionPort, ReportRevisionPort, RosterDiscoveryPort } from "./raid-night-ports.js";
import { MAX_RAID_NIGHT_CELLS, MAX_RAID_NIGHT_PLAYERS, type RaidNightRequest } from "./raid-night-request.js";
import type { RaidNightRunResult } from "./raid-night-runner.js";
import { resolveSpecIdentity } from "./spec-identity.js";
import { serviceFailure, type ServiceErrorCode } from "./result.js";

export interface RaidNightServiceDeps {
  readonly env: Env;
  /** M7-C roster discovery. Called exactly once per request. */
  readonly discoverRoster: RosterDiscoveryPort;
  /** M7-B actor-independent fight retrieval. Called at most once per needed fight. */
  readonly ingestFightCore: FightCoreIngestionPort;
  /** M7-C's revision guard, for the one final confirmation. */
  readonly checkRevision: ReportRevisionPort;
  /** Injected so a test can prove dispatch without reaching into module state. */
  readonly registry?: readonly RegisteredAnalyzer[] | undefined;
  /**
   * Optional notification of one ingested fight's M8-C context facts.
   *
   * THE SEAM M8-G USES INSTEAD OF A SECOND INGESTION. Encounter-context
   * progression needs each pull's outcome facts and zone, and this loop already
   * holds the core they live on. Re-fetching the fight to read two fields would
   * double the metered cost of a raid night for metadata that was already paid
   * for.
   *
   * It receives the FACTS, not the core. Handing over the core would let a
   * consumer retain the whole event array, which is exactly the memory cost the
   * cell projection exists to avoid — twenty players share one core precisely so
   * nothing outlives this loop holding it.
   *
   * Absent by default, so every existing caller is unaffected and the raid-night
   * result is unchanged.
   */
  readonly observeEncounterFacts?: EncounterFactsObserver | undefined;
}

/**
 * Receives one ingested fight's context facts.
 *
 * Called once per SUCCESSFULLY ingested fight, after the revision recheck that
 * vouches for it. A fight whose evidence never arrived produces no call, which
 * is what keeps "we hold no facts for this pull" distinct from "the facts were
 * all null".
 */
export type EncounterFactsObserver = (facts: {
  readonly fightId: number;
  readonly outcome: EncounterOutcomeFacts;
  readonly zone: ZoneMetadata | null;
}) => void;

function failure(code: ServiceErrorCode, message: string): RaidNightRunResult {
  const result = serviceFailure(code, message);
  // `serviceFailure` builds the shared envelope; only its error half applies here.
  return result.ok ? { ok: false, error: { code, message } } : { ok: false, error: result.error };
}

/** Author-written messages for every roster-discovery outcome. Nothing interpolated. */
function describeRosterFailure(reason: ReportRosterFailureReason): {
  readonly code: ServiceErrorCode;
  readonly message: string;
} {
  switch (reason) {
    case "REPORT_NOT_ACCESSIBLE":
      return {
        code: "REPORT_NOT_ACCESSIBLE",
        message:
          "Warcraft Logs did not return that report. It may not exist, or it may be private. Only public and unlisted reports can be analyzed.",
      };
    case "NO_FIGHTS_REQUESTED":
      // Unreachable: the parser refuses an empty selection. Reported rather than
      // asserted, because an opaque 500 would be the worse failure mode.
      return { code: "INVALID_REQUEST", message: "No fights were selected for analysis." };
    case "ROSTER_DATA_INVALID":
      return {
        code: "UPSTREAM_DATA_INVALID",
        message:
          "Warcraft Logs returned roster data for those fights that could not be trusted, so no raid night was assembled.",
      };
    case "UPSTREAM_AUTH_FAILED":
      return {
        code: "UPSTREAM_AUTH_FAILED",
        message: "Warcraft Logs rejected this deployment's API credentials.",
      };
    case "UPSTREAM_RATE_LIMITED":
      return { code: "UPSTREAM_RATE_LIMITED", message: "Warcraft Logs rate limit reached. Try again later." };
    case "UPSTREAM_UNAVAILABLE":
      return { code: "UPSTREAM_UNAVAILABLE", message: "Warcraft Logs could not be reached." };
    case "UPSTREAM_DATA_INVALID":
      return {
        code: "UPSTREAM_DATA_INVALID",
        message: "Warcraft Logs returned a response that could not be trusted.",
      };
  }
}

/**
 * Which ingestion failures invalidate the WHOLE night rather than one fight.
 *
 * THE DISTINCTION IS ABOUT TRUST, NOT SEVERITY. A fight whose pages failed to
 * decode is a gap in one pull, and the other pulls remain true — so it becomes a
 * per-fight failure and its players get an explicit unavailability.
 *
 * But a rejected credential, an upstream rate limit or a moved report revision
 * say something about the whole run: every remaining fight would hit the same
 * wall, or would describe a different version of the report. Continuing would
 * produce an aggregate whose completeness is an accident of where the failure
 * happened to start.
 */
function isFatalIngestionFailure(reason: IngestionFailureReason): boolean {
  switch (reason) {
    case "UPSTREAM_AUTH_FAILED":
    case "UPSTREAM_RATE_LIMITED":
    case "REPORT_REVISION_CHANGED":
    case "REPORT_NOT_ACCESSIBLE":
    case "REPORT_ARCHIVED_INACCESSIBLE":
      return true;
    // A gap in one pull. The night survives it.
    case "FIGHT_NOT_FOUND":
    case "FIGHT_RANGE_INVALID":
    case "EVENT_RETRIEVAL_ABSENT":
    case "UPSTREAM_DATA_INVALID":
    case "UPSTREAM_UNAVAILABLE":
      return false;
  }
}

function describeFatalIngestionFailure(reason: IngestionFailureReason): {
  readonly code: ServiceErrorCode;
  readonly message: string;
} {
  switch (reason) {
    case "REPORT_REVISION_CHANGED":
      return {
        code: "REPORT_REVISION_CHANGED",
        message:
          "That report was re-uploaded while the raid night was being analyzed, so the fights could not be read from a single consistent version. Try again.",
      };
    case "UPSTREAM_AUTH_FAILED":
      return {
        code: "UPSTREAM_AUTH_FAILED",
        message: "Warcraft Logs rejected this deployment's API credentials.",
      };
    case "UPSTREAM_RATE_LIMITED":
      return {
        code: "UPSTREAM_RATE_LIMITED",
        message: "Warcraft Logs rate limit reached while retrieving combat events. Try again later.",
      };
    case "REPORT_NOT_ACCESSIBLE":
      return {
        code: "REPORT_NOT_ACCESSIBLE",
        message: "Warcraft Logs stopped serving that report while the raid night was being analyzed.",
      };
    case "REPORT_ARCHIVED_INACCESSIBLE":
      return {
        code: "REPORT_ARCHIVED_INACCESSIBLE",
        message:
          "That report is archived on Warcraft Logs, so its combat events cannot be retrieved by this service.",
      };
    default:
      // Non-fatal reasons never reach here; `isFatalIngestionFailure` gates it.
      return { code: "INTERNAL_ERROR", message: "An unexpected internal error occurred." };
  }
}

/** One selected player's classification on one fight, before any retrieval. */
type PlannedPlayer =
  | { readonly kind: "ABSENT"; readonly sourceId: number }
  /** Present, and an analyzer is registered for the specialization WCL reported. */
  | {
      readonly kind: "SUPPORTED";
      readonly sourceId: number;
      readonly specName: string;
      readonly analyzer: RegisteredAnalyzer;
    }
  /** Present, specialization identified, no analyzer registered for it. */
  | { readonly kind: "UNSUPPORTED"; readonly sourceId: number; readonly specName: string }
  /** Present, but Warcraft Logs supplied no usable specialization. */
  | { readonly kind: "SPEC_UNRESOLVED"; readonly sourceId: number };

/**
 * Classifies one fight's selected roster WITHOUT retrieving anything.
 *
 * This is what makes zero-ingestion possible: whether a fight needs event
 * evidence is fully determined by roster facts plus the analyzer registry, both
 * of which are already in hand. Nothing here reads a cast.
 */
function planFight(
  snapshot: ReportRosterSnapshot,
  fightId: number,
  selected: readonly RosterPlayer[],
  registry: readonly RegisteredAnalyzer[],
): readonly PlannedPlayer[] {
  return selected.map((player): PlannedPlayer => {
    const participation = participationFor(snapshot, fightId, player.sourceId);
    if (participation.kind !== "PRESENT") {
      // FIGHT_NOT_IN_SNAPSHOT and NOT_IN_ROSTER are unreachable here — the fight
      // is included and the player came from the snapshot's own roster — and
      // ABSENT is the only other answer. Treating any of them as absent is
      // truthful: none of them is a player who was in this pull.
      return { kind: "ABSENT", sourceId: player.sourceId };
    }

    if (participation.specName === null) {
      // M7-C preserved an unusable `friendlySpecs` entry rather than guessing.
      // We cannot ask whether an analyzer exists for a specialization we never
      // identified, so this is NOT "unsupported".
      return { kind: "SPEC_UNRESOLVED", sourceId: player.sourceId };
    }

    const resolved = resolveSpecIdentity({
      className: player.className,
      specName: participation.specName,
    });
    if (!resolved.ok) {
      return { kind: "UNSUPPORTED", sourceId: player.sourceId, specName: participation.specName };
    }
    const analyzer = analyzerForSpec(resolved.specId, registry);
    return analyzer === null
      ? { kind: "UNSUPPORTED", sourceId: player.sourceId, specName: participation.specName }
      : { kind: "SUPPORTED", sourceId: player.sourceId, specName: participation.specName, analyzer };
  });
}

/**
 * Analyzes one raid night.
 *
 * ORDERING IS LOAD-BEARING THROUGHOUT. Every check sits at the earliest point its
 * facts exist, so nothing expensive runs before something cheap could have ruled
 * it out — and the report says honestly which bounds are enforced before Warcraft
 * Logs is touched at all and which cannot be.
 */
export async function analyzeRaidNight(
  request: RaidNightRequest,
  deps: RaidNightServiceDeps,
): Promise<RaidNightRunResult> {
  const config = loadConfig(deps.env);
  if (!config.ok) {
    // Names only. Never the values, and never an indication of what was present.
    return failure(
      "CONFIGURATION_ERROR",
      `The service is not configured. Missing required configuration: ${config.missing.join(", ")}.`,
    );
  }
  const credentials = config.config.wcl;
  const registry = deps.registry ?? ENABLED_ANALYZERS;

  // ---- ONE roster query. Establishes R0 and every roster fact. ----
  const roster = await deps.discoverRoster(
    { reportCode: request.reportCode, fightIds: request.fightIds },
    credentials,
  );
  if (!roster.ok) {
    const { code, message } = describeRosterFailure(roster.failure.reason);
    return failure(code, message);
  }
  const snapshot = roster.snapshot;
  const r0 = snapshot.identity.reportRevision;

  // ---- the selected roster ----
  //
  // An explicitly requested player who is not in the selected-fight roster is a
  // request error, not an absence: the caller named somebody who could not have
  // been there. Checked HERE because roster discovery is the first moment the
  // fact exists, and before any event ingestion so it costs nothing extra.
  let selected: readonly RosterPlayer[];
  if (request.sourceIds === undefined) {
    selected = snapshot.players;
  } else {
    const byId = new Map(snapshot.players.map((player) => [player.sourceId, player]));
    const missing = request.sourceIds.filter((sourceId) => !byId.has(sourceId));
    if (missing.length > 0) {
      return failure(
        "INVALID_REQUEST",
        `Requested source ids not present in the selected fights' roster: ${missing.join(", ")}. No player was invented for them.`,
      );
    }
    selected = request.sourceIds.map((sourceId) => {
      const player = byId.get(sourceId);
      if (player === undefined) throw new Error("unreachable: membership checked above");
      return player;
    });
  }

  // ---- discovered bounds, before any event ingestion ----
  //
  // These cannot be enforced before the roster query: with no explicit filter,
  // the player count is a fact only Warcraft Logs can supply. They ARE enforced
  // before the expensive part, which is what the bound is for.
  if (selected.length > MAX_RAID_NIGHT_PLAYERS) {
    return failure(
      "INVALID_REQUEST",
      `Those fights involve ${String(selected.length)} players, above the ${String(MAX_RAID_NIGHT_PLAYERS)} this service analyzes in one request. Name a smaller set of players explicitly.`,
    );
  }
  const includedFightIds = snapshot.identity.includedFightIds;
  const projectedCells = includedFightIds.length * selected.length;
  if (projectedCells > MAX_RAID_NIGHT_CELLS) {
    return failure(
      "INVALID_REQUEST",
      `That selection would require ${String(projectedCells)} fight/player results, above the ${String(MAX_RAID_NIGHT_CELLS)} this service produces in one request.`,
    );
  }

  // ---- the snapshot THIS ANALYSIS IS ABOUT ----
  //
  // The discovered roster narrowed to the selected players, and narrowed in that
  // one respect only: the identity, the included fights and every fight's true
  // participant list are the facts M7-C discovered and are passed through
  // untouched.
  //
  // WHY NARROWING IS NECESSARY RATHER THAN COSMETIC
  //
  // The M7-D gate derives the cell matrix's required shape — the DENOMINATOR every
  // coverage count is computed against — from the snapshot's own roster. A request
  // that names three of twenty raiders must therefore be described by a snapshot
  // whose roster is those three, or the gate would demand seventeen cells for
  // players this request never selected and the aggregate would be refused.
  //
  // The alternative, teaching the gate about request selection, would make the
  // aggregation domain aware of requests. This keeps it a pure function of facts:
  // narrowing WHICH FACTS is orchestration's job, and it is done here, once.
  //
  // `participantCount` on each fight summary stays the real size of the pull,
  // because it is read from the untouched participant lists — so a three-player
  // request cannot read as a three-player raid.
  const analysisSnapshot: ReportRosterSnapshot = {
    ...snapshot,
    players: [...selected].sort((left, right) => left.sourceId - right.sourceId),
  };

  // ---- process INCLUDED fights, sequentially, ascending ----
  const cells: PlayerFightResult[] = [];
  const fightOutcomes: FightProcessingRecord[] = [];

  for (const fightId of includedFightIds) {
    const planned = planFight(analysisSnapshot, fightId, selected, registry);
    const supported = planned.filter(
      (entry): entry is Extract<PlannedPlayer, { kind: "SUPPORTED" }> => entry.kind === "SUPPORTED",
    );
    const unanalyzable = planned.filter(
      (entry): entry is Exclude<PlannedPlayer, { kind: "SUPPORTED" }> => entry.kind !== "SUPPORTED",
    );

    // ---- ZERO INGESTION when nobody needs it ----
    //
    // Everybody absent, every present specialization unsupported, or a mix. The
    // fight is still in the snapshot and still gets a summary; what it does not
    // get is a pagination nothing would have read.
    //
    // Expressed as "every planned player is unanalyzable" rather than
    // "supported.length === 0" so the narrowing is the condition itself — the two
    // cannot drift apart, and the loop below cannot be handed a supported player.
    if (unanalyzable.length === planned.length) {
      fightOutcomes.push({ fightId, outcome: "NOT_INGESTED" satisfies FightProcessingOutcome });
      for (const entry of unanalyzable) {
        cells.push(cellForUnanalyzed(analysisSnapshot, fightId, entry));
      }
      continue;
    }

    // ---- the ingestion requirement, from the SELECTED analyzers only ----
    //
    // Unioned across the analyzers actually running on THIS fight. An analyzer
    // that is registered but not selected has no claim on what this request
    // retrieves, and unioning the whole registry would pay for evidence nothing
    // here can read.
    const requirements: readonly AnalyzerRequirement[] = supported.map((entry) => entry.analyzer.requirement);
    const scope = deriveIngestionScope(requirements);
    if (!scope.ok) {
      return failure(
        "INTERNAL_ERROR",
        "No ingestion scope could be derived for the selected analyzers, so no combat events were retrieved.",
      );
    }
    const includeResources = requirements.some((requirement) => requirement.includeResources);

    // ---- ONE ingestion for this fight, pinned to R0 ----
    const ingested = await deps.ingestFightCore(
      {
        reportCode: request.reportCode,
        fightId,
        // The context query's only per-actor field is the talent import code,
        // which nothing here reads. One supported player is named so the request
        // is well-formed; the focused views decide who it describes.
        talentImportActorId: supported[0]?.sourceId ?? 0,
        includeResources,
        expectedReportRevision: r0,
      },
      credentials,
    );

    if (!ingested.ok) {
      if (isFatalIngestionFailure(ingested.failure.reason)) {
        const { code, message } = describeFatalIngestionFailure(ingested.failure.reason);
        return failure(code, message);
      }
      // One pull's evidence is missing. The night survives, and the players who
      // were in it get an explicit unavailability rather than zero counts or
      // manufactured UNKNOWN decisions.
      fightOutcomes.push({ fightId, outcome: "INGESTION_FAILED" });
      for (const entry of planned) {
        cells.push(
          entry.kind === "ABSENT"
            ? absentCell({
                fightId,
                reportCode: analysisSnapshot.identity.reportCode,
                sourceId: entry.sourceId,
              })
            : analysisUnavailableCell({
                fightId,
                reportCode: analysisSnapshot.identity.reportCode,
                sourceId: entry.sourceId,
                specName: specNameOf(analysisSnapshot, fightId, entry.sourceId),
                reason: "FIGHT_INGESTION_FAILED",
              }),
        );
      }
      continue;
    }

    const core = ingested.core;
    // Belt and braces: the pre-pagination gate already refused a mismatch, and
    // the produced core is checked too rather than trusting one query.
    if (core.report.revision !== r0) {
      const { code, message } = describeFatalIngestionFailure("REPORT_REVISION_CHANGED");
      return failure(code, message);
    }
    fightOutcomes.push({ fightId, outcome: "INGESTED" });

    // The one place M8 context facts are read. Carried out of the loop by value
    // so the core itself stays local and releasable.
    deps.observeEncounterFacts?.({
      fightId,
      outcome: core.encounterOutcome,
      zone: core.zone,
    });

    // ---- one player at a time, over the ONE shared core ----
    for (const entry of planned) {
      if (entry.kind !== "SUPPORTED") {
        cells.push(cellForUnanalyzed(analysisSnapshot, fightId, entry));
        continue;
      }

      // One focused view, one state. Both fall out of scope at the end of this
      // iteration; nothing accumulates them.
      const focused = focusedFightFor(core, entry.sourceId, scope.scope);
      const state = createCombatState(focused);
      const analysis = entry.analyzer.analyze({
        state,
        actorId: entry.sourceId,
        specId: entry.analyzer.specId,
        // The facade resolves each decision's target from the observed cast that
        // decision is about. Choosing one fight-level enemy here would overwrite
        // a per-event fact with a guess.
        targetActorId: null,
      });

      const projection = toPlayerFightCell({
        analysis: {
          identity: identityForPlayer(analysisSnapshot, fightId, entry.sourceId, entry.specName),
          specId: entry.analyzer.specId,
          analyzerId: entry.analyzer.analyzerId,
          scope: scope.scope,
          analysis,
        },
        // From the core that actually produced this analysis, never a literal.
        normalizationRevision: core.provenance.normalizationRevision,
      });
      if (!projection.ok) {
        // The analysis contradicts itself arithmetically. Aggregating it would
        // build a confident total on a defect.
        return failure(
          "INTERNAL_ERROR",
          "An analysis result could not be reconciled, so no raid night was assembled.",
        );
      }
      cells.push(projection.cell);
    }
  }

  // ---- ONE final revision confirmation, after every fight, before publishing ----
  const finalCheck = await deps.checkRevision(request.reportCode, r0, credentials);
  const revisionFailure = describeRevisionCheck(finalCheck, r0);
  if (revisionFailure !== null) {
    return failure(revisionFailure.code, revisionFailure.message);
  }

  // ---- the M7-D gate, then aggregation, then the public document ----
  //
  // Not bypassed because orchestration "already knows" it built the cells
  // correctly. That gate exists precisely as a defence against this function
  // having a bug, and skipping it would remove the only check on the matrix.
  const verification = verifyRaidNightInput(finalCheck, {
    snapshot: analysisSnapshot,
    fightOutcomes,
    cells,
  });
  if (!verification.ok) {
    if (verification.reason === "REPORT_REVISION_CHANGED") {
      const { code, message } = describeFatalIngestionFailure("REPORT_REVISION_CHANGED");
      return failure(code, message);
    }
    if (verification.reason === "REPORT_REVISION_UNVERIFIED") {
      return failure("REPORT_REVISION_UNVERIFIED", REVISION_UNVERIFIED_MESSAGE);
    }
    return failure(
      "INTERNAL_ERROR",
      "The assembled raid night was not internally consistent, so it was not published.",
    );
  }

  // The INTERNAL aggregate. Projecting it is the transport's job — see
  // `raid-night-runner.ts` for why the application layer holds no wire schema.
  return { ok: true, aggregate: aggregateRaidNight(verification.verified) };
}

const REVISION_UNVERIFIED_MESSAGE =
  "The Warcraft Logs report revision could not be confirmed after analysis, so the raid night was refused rather than published from evidence that might span two versions of the report. Try again.";

/** What a final revision check permits. `null` means the night may be published. */
function describeRevisionCheck(
  check: RevisionCheck,
  expected: number,
): { readonly code: ServiceErrorCode; readonly message: string } | null {
  switch (check.outcome) {
    case "MATCHES":
      return check.revision === expected
        ? null
        : // A check that confirmed some OTHER revision confirms nothing here.
          { code: "REPORT_REVISION_UNVERIFIED", message: REVISION_UNVERIFIED_MESSAGE };
    case "CHANGED":
      return describeFatalIngestionFailure("REPORT_REVISION_CHANGED");
    case "UNVERIFIED":
      // NOT a softer MATCHES. Nothing was established, so nothing is published.
      return { code: "REPORT_REVISION_UNVERIFIED", message: REVISION_UNVERIFIED_MESSAGE };
  }
}

/** M7-C's per-fight specialization fact for one participant. */
function specNameOf(snapshot: ReportRosterSnapshot, fightId: number, sourceId: number): string | null {
  const participation = participationFor(snapshot, fightId, sourceId);
  return participation.kind === "PRESENT" ? participation.specName : null;
}

/**
 * The cell for a selected player no analyzer ran for.
 *
 * Each branch is the narrowest truthful statement available, and the three are
 * deliberately different: absence is a roster fact, an unsupported
 * specialization is a coverage limit, and an unresolvable specialization is
 * missing upstream identity data. Collapsing any pair would launder one as
 * another.
 */
function cellForUnanalyzed(
  snapshot: ReportRosterSnapshot,
  fightId: number,
  entry: Exclude<PlannedPlayer, { kind: "SUPPORTED" }>,
): PlayerFightResult {
  const reportCode = snapshot.identity.reportCode;
  switch (entry.kind) {
    case "ABSENT":
      return absentCell({ fightId, reportCode, sourceId: entry.sourceId });
    case "UNSUPPORTED":
      return {
        kind: "NOT_ANALYZED",
        fightId,
        playerKey: playerKeyOf(reportCode, entry.sourceId),
        sourceId: entry.sourceId,
        specName: entry.specName,
        status: "SPEC_NOT_SUPPORTED",
        detail:
          `No gameplay analyzer is registered for '${entry.specName}', so no rotational decision was evaluated ` +
          `and no gameplay analysis was attempted. This is a limit of the analyzer's current coverage, not a ` +
          `statement about how the fight was played.`,
      };
    case "SPEC_UNRESOLVED":
      return analysisUnavailableCell({
        fightId,
        reportCode,
        sourceId: entry.sourceId,
        // Null, faithfully. M7-C supplied no usable specialization and this layer
        // does not invent one.
        specName: null,
        reason: "SPECIALIZATION_UNRESOLVED",
      });
  }
}

/**
 * The `FightIdentity` the cell projection reads.
 *
 * Assembled from roster facts rather than a second preflight: M7-C already
 * established every field, and issuing a per-player identity query would
 * reintroduce exactly the per-player cost this architecture removed.
 */
function identityForPlayer(
  snapshot: ReportRosterSnapshot,
  fightId: number,
  sourceId: number,
  specName: string,
) {
  const fight = snapshot.fights.find((candidate) => candidate.fightId === fightId);
  const player = snapshot.players.find((candidate) => candidate.sourceId === sourceId);
  if (fight === undefined || player === undefined) {
    throw new Error("unreachable: fight and player came from this snapshot");
  }
  return {
    report: {
      code: snapshot.identity.reportCode,
      revision: snapshot.identity.reportRevision,
      startTime: snapshot.identity.reportStartTimeUnixMs,
      endTime: snapshot.identity.reportEndTimeUnixMs,
    },
    data: { logVersion: snapshot.identity.logVersion, gameVersion: snapshot.identity.gameVersion },
    fight: {
      id: fight.fightId,
      name: fight.name,
      encounterId: fight.encounterId,
      difficulty: fight.difficulty,
      startTime: fight.startTimeMs,
      endTime: fight.endTimeMs,
    },
    player: { sourceId, name: player.name, className: player.className, specName },
  };
}
