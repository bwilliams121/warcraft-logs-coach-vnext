/**
 * Application service — the single analysis entry point.
 *
 * Every interface (REST today, MCP later) calls this. None of them may contain
 * a separate analyzer.
 *
 * This module is use-case orchestration only. It contains no gameplay rules, no
 * Warcraft Logs GraphQL shapes, and no Cloudflare-specific types, so it runs
 * under a plain Node test project with no Workers runtime present.
 *
 * It composes the whole path: authenticate, establish factual Warcraft Logs
 * identity, resolve the specialization, select the analyzer registered for it,
 * retrieve and normalize combat events at the scope that analyzer declared,
 * derive state, and invoke the analyzer's facade. Every gameplay judgement in
 * the result was made behind that facade.
 *
 * WHAT ORCHESTRATION MEANS HERE, PRECISELY
 *
 * Selecting and sequencing. This module holds no gameplay rule, no Warcraft
 * Logs GraphQL shape and no Cloudflare type — it runs under a plain Node test
 * project with no Workers runtime present, which is the mechanical proof that
 * both REST and MCP can reach identical gameplay truth through it.
 *
 * It does not reshape, rank, summarise or reinterpret what an analyzer returns.
 * An application layer that edited a gameplay result would be a second analyzer
 * with a smaller vocabulary, and the point of having one path is that there is
 * only one place gameplay truth is decided.
 */

import { loadConfig, type Env } from "../config/env.js";
import { createCombatState } from "../engine/state/combat-state.js";
import type { IngestionFailureReason } from "../wcl/ingest-fight.js";
import type { FightIdentity, PreflightPort, WclFailureReason } from "../wcl/types.js";
import { parseAnalysisRequest } from "./analysis-request.js";
import {
  analyzerForSpec,
  catalogFor,
  describeCatalogDefects,
  observedDecisionViewOf,
  runAnalyzer,
  specNotSupported,
  type AnalyzerRegistration,
} from "./analyzer-registry.js";
import type { CombatIngestionPort } from "./ingestion-port.js";
import { deriveIngestionScopeFor } from "./ingestion-scope.js";
import {
  assertNever,
  serviceFailure,
  type AnalysisResultState,
  type AnalysisServiceResult,
  type FightAnalysis,
  type ServiceErrorCode,
} from "./result.js";
import { resolveSpecIdentity } from "./spec-identity.js";

export { ENABLED_ANALYSIS_REQUIREMENTS } from "./analyzer-registry.js";

/**
 * What the service needs to run one analysis.
 *
 * NOTE WHAT IS ABSENT: there is no list of enabled analyzer REQUIREMENTS here.
 * One request analyzes one player in one specialization, so exactly one
 * analyzer runs, and its own registration carries everything the ingestion
 * request needs. Handing the service the whole set would give it the materials
 * to union requirements across analyzers that are not running — which is the
 * defect this shape exists to make unrepresentable rather than merely
 * discouraged.
 *
 * `ENABLED_ANALYSIS_REQUIREMENTS` still exists as build capability metadata —
 * what this deployment supports — and is a different question from what THIS
 * request should retrieve.
 */
export interface AnalysisServiceDeps {
  readonly env: Env;
  /**
   * Warcraft Logs identity preflight, injected as a port. The service holds no
   * transport of its own and cannot reach the network without it.
   */
  readonly preflight: PreflightPort;
  /**
   * Combat event retrieval and normalization.
   *
   * REQUIRED. It was optional through M6-B/M6-D only so the REST route could
   * hold its pre-M6-E behaviour without spending Warcraft Logs points; M6-E
   * binds the real ingestor at the single production composition root, and the
   * temporary seam is gone.
   *
   * Requiring it makes "somebody forgot to wire ingestion" a compile error
   * rather than a runtime status a caller has to interpret. There is no longer
   * any way for a deployed Worker to report that analysis exists but was not
   * connected — the composition either type-checks or it does not.
   */
  readonly ingest: CombatIngestionPort;
  /**
   * The analyzer CATALOG — every registration, public and internal-only.
   * Injected so a test can prove dispatch and invocation counts without
   * reaching into module state.
   *
   * The service validates it and dispatches through its PUBLIC subset only. An
   * internal-only registration in this list is never selected, never ingested
   * for, and never run by a public request; a test that injects one proves
   * exactly that.
   */
  readonly registry?: readonly AnalyzerRegistration[] | undefined;
}

/**
 * Author-written messages for every preflight outcome.
 *
 * Nothing upstream is interpolated: not a GraphQL error string, not a caught
 * exception, not an environment value. Any of those can carry a credential or
 * text we have not vetted.
 */
function describePreflightFailure(reason: WclFailureReason): {
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
    case "FIGHT_NOT_FOUND":
      return { code: "FIGHT_NOT_FOUND", message: "That report does not contain the requested fight." };
    case "SOURCE_NOT_FOUND":
      return {
        code: "SOURCE_NOT_FOUND",
        message: "That report does not contain an actor with the requested source ID.",
      };
    case "SOURCE_NOT_A_PLAYER":
      return {
        code: "SOURCE_NOT_A_PLAYER",
        message:
          "The requested source ID belongs to a pet or NPC, not a player. Select the player on Warcraft Logs and copy the URL again.",
      };
    case "SOURCE_NOT_IN_FIGHT":
      return {
        code: "SOURCE_NOT_IN_FIGHT",
        message: "That player is in the report but did not participate in the requested fight.",
      };
    case "IDENTITY_UNRESOLVED":
      return {
        code: "IDENTITY_UNRESOLVED",
        message:
          "Warcraft Logs did not supply a complete identity (name, class and specialization) for that player, so the fight cannot be analyzed.",
      };
    case "UPSTREAM_DATA_INVALID":
      return {
        code: "UPSTREAM_DATA_INVALID",
        message: "Warcraft Logs returned a response that could not be trusted.",
      };
    case "UPSTREAM_AUTH_FAILED":
      return {
        code: "UPSTREAM_AUTH_FAILED",
        message: "Warcraft Logs rejected this deployment's API credentials.",
      };
    case "UPSTREAM_RATE_LIMITED":
      return {
        code: "UPSTREAM_RATE_LIMITED",
        message: "Warcraft Logs rate limit reached. Try again later.",
      };
    case "UPSTREAM_UNAVAILABLE":
      return { code: "UPSTREAM_UNAVAILABLE", message: "Warcraft Logs could not be reached." };
    case "CREDENTIALS_NOT_ENCODABLE":
      // A deployment problem, not an upstream one. Names no value.
      return {
        code: "CONFIGURATION_ERROR",
        message:
          "The service is not configured correctly. The configured Warcraft Logs credentials are unusable.",
      };
    default:
      return assertNever(reason);
  }
}

/**
 * Author-written messages for every M3 ingestion outcome.
 *
 * Each variant is mapped on purpose rather than collapsed into one upstream
 * error. The distinctions M3 draws are ones a reader can act on — retry, fix the
 * link, or give up — and flattening them would throw that away at the last step.
 *
 * Two share a code without losing their meaning: `FIGHT_RANGE_INVALID` and
 * `EVENT_RETRIEVAL_ABSENT` both mean the retrieved data cannot be trusted or was
 * never obtained, and neither gives a caller a different action. Every other
 * variant keeps its own code.
 */
function describeIngestionFailure(reason: IngestionFailureReason): {
  readonly code: ServiceErrorCode;
  readonly message: string;
} {
  switch (reason) {
    case "REPORT_NOT_ACCESSIBLE":
      return {
        code: "REPORT_NOT_ACCESSIBLE",
        message:
          "Warcraft Logs did not return that report when retrieving combat events. It may not exist, or it may be private.",
      };
    case "REPORT_ARCHIVED_INACCESSIBLE":
      return {
        code: "REPORT_ARCHIVED_INACCESSIBLE",
        message:
          "That report is archived on Warcraft Logs, so its combat events cannot be retrieved by this service.",
      };
    case "REPORT_REVISION_CHANGED":
      return {
        code: "REPORT_REVISION_CHANGED",
        message:
          "That report was re-uploaded while its combat events were being retrieved, so the evidence could not be read from a single consistent version. Try again.",
      };
    case "FIGHT_NOT_FOUND":
      return {
        code: "FIGHT_NOT_FOUND",
        message: "That report does not contain the requested fight.",
      };
    case "FIGHT_RANGE_INVALID":
      return {
        code: "UPSTREAM_DATA_INVALID",
        message: "Warcraft Logs reported a fight time range that could not be used to retrieve events.",
      };
    case "EVENT_RETRIEVAL_ABSENT":
      return {
        code: "UPSTREAM_DATA_INVALID",
        // Deliberately not "the player did nothing". A failed retrieval is not
        // an empty fight, and must never be reported as one.
        message:
          "No combat events could be retrieved for that fight. This is a retrieval failure, not a record of an inactive player.",
      };
    case "UPSTREAM_DATA_INVALID":
      return {
        code: "UPSTREAM_DATA_INVALID",
        message: "Warcraft Logs returned combat event data that could not be trusted.",
      };
    case "UPSTREAM_AUTH_FAILED":
      return {
        code: "UPSTREAM_AUTH_FAILED",
        message: "Warcraft Logs rejected this deployment's API credentials while retrieving combat events.",
      };
    case "UPSTREAM_RATE_LIMITED":
      return {
        code: "UPSTREAM_RATE_LIMITED",
        message: "Warcraft Logs rate limit reached while retrieving combat events. Try again later.",
      };
    case "UPSTREAM_UNAVAILABLE":
      return {
        code: "UPSTREAM_UNAVAILABLE",
        message: "Warcraft Logs could not be reached while retrieving combat events.",
      };
    default:
      return assertNever(reason);
  }
}

/**
 * Projects an analyzer's own status onto the service-level result state.
 *
 * TWO VOCABULARIES, KEPT APART. The analyzer's `status` says what IT could
 * establish about gameplay; `AnalysisResultState` says what the SERVICE produced.
 * They are related but not the same question, and the mapping is written out
 * here so neither drifts into the other.
 *
 * `ANALYZED` maps to `PARTIAL`, never `COMPLETE`, and that is not a placeholder.
 * This build supports a narrow slice of Assassination's decisions; most observed
 * decisions resolve to UNKNOWN by design, and every run excludes casts whose
 * execution lane is not established. Reporting that as a COMPLETE assessment
 * would be the exact failure the coverage disclosure exists to prevent — a
 * reader concluding "nothing to fix" from "we could not look at most of it".
 *
 * `COMPLETE` is therefore unreachable today. It becomes reachable when an
 * analyzer can actually say it examined everything it claims to cover.
 */
function resultStateFor(analysis: FightAnalysis): AnalysisResultState {
  const status = analysis.analysis.status;
  switch (status) {
    case "ANALYZED":
      return "PARTIAL";
    case "SPEC_NOT_SUPPORTED":
      return "SPEC_NOT_SUPPORTED";
    // The authority artifact, the combatant profile or the required wire
    // contracts were unavailable. All three are truthful analysis-domain
    // outcomes rather than failures: the service ran, and the honest answer is
    // that it could not establish enough to evaluate anything.
    case "AUTHORITY_NOT_AVAILABLE":
    case "PROFILE_NOT_RESOLVED":
    case "INSUFFICIENT_EVIDENCE":
      return "PARTIAL";
    default:
      return assertNever(status);
  }
}

/**
 * The successful result for a specialization no analyzer covers.
 *
 * A SUCCESS, not a failure. The service did its job: it established who the
 * player was and reported truthfully that this build cannot analyze that
 * specialization. Returning an error instead would push callers toward retrying
 * or discarding a perfectly correct answer.
 *
 * Every analyzer-specific field is `null` because no analyzer ran, and no
 * combat events were retrieved to produce it.
 */
function unsupportedSpec(identity: FightIdentity, observedSpecId: string): AnalysisServiceResult {
  const analysis: FightAnalysis = {
    identity,
    specId: null,
    analyzerId: null,
    scope: null,
    analysis: specNotSupported(observedSpecId),
    observedDecisions: null,
  };
  return { ok: true, state: resultStateFor(analysis), analysis };
}

/**
 * Validates a request, resolves configuration, establishes factual Warcraft Logs
 * identity, and would then run analysis.
 *
 * The ordering is load-bearing. A malformed request or a misconfigured
 * deployment is diagnosed for its own reason rather than being masked by a
 * later failure — and preflight runs before the not-implemented boundary so a
 * bad report, fight or source ID is reported as such rather than as "analysis
 * is not implemented".
 *
 * Preflight deliberately runs even though the route invokes no analyzer.
 * Identity metadata is a prerequisite to selecting an analyzer at all, and it is
 * scope-independent: derived ingestion scope governs how much combat-event
 * breadth is retrieved, which is a later milestone's concern.
 *
 * THE COMPOSITION, AND THE ORDER IT RUNS IN
 *
 *     parse -> configure -> M2 identity -> resolve spec -> select analyzer
 *           -> derive scope -> M3 ingest -> M4 state -> M5 analyze
 *
 * Every stage is ordered so a condition is diagnosed for its own reason rather
 * than being masked by a later failure, and so nothing expensive runs before the
 * cheap facts that could rule it out. Two placements carry most of that weight:
 *
 * SPEC RESOLUTION RUNS BEFORE INGESTION. An unsupported specialization is fully
 * determined by M2 identity, so answering it here avoids paginating an entire
 * combat log in order to report that we were never going to analyze it. Nothing
 * is lost: the analyzer's own spec gate would reach the same status from the
 * same fact, and the status returned is the one it would have produced.
 *
 * SCOPE IS DERIVED FROM THE SELECTED ANALYZER. Not from the request, not from a
 * transport, not from a constant. The analyzer declares what evidence it needs
 * and retrieval follows, which is what makes silent under-fetching structurally
 * impossible rather than something review has to catch.
 *
 * WHAT THIS FUNCTION IS NOT
 *
 * It is not an analyzer. It selects one, hands it factual state, and returns
 * what it said. It reads no ability, no resource, no talent and no authority
 * line — every gameplay judgement in the result was made behind the facade, and
 * this layer neither adds to it nor edits it.
 */
export async function analyzeFight(
  input: unknown,
  deps: AnalysisServiceDeps,
): Promise<AnalysisServiceResult> {
  const parsed = parseAnalysisRequest(input);
  if (!parsed.ok) {
    return serviceFailure("INVALID_REQUEST", "The analysis request was not valid.", parsed.issues);
  }

  const config = loadConfig(deps.env);
  if (!config.ok) {
    // Names only. Never the values, and never an indication of what was present.
    return serviceFailure(
      "CONFIGURATION_ERROR",
      `The service is not configured. Missing required configuration: ${config.missing.join(", ")}.`,
    );
  }

  // ---- registry integrity, before a single Warcraft Logs point is spent ----
  //
  // A deployment concern, diagnosed next to configuration for the same reason:
  // a corrupt catalog is not a fact about this report or this player, and no
  // request should proceed to preflight on the strength of a dispatch table
  // that cannot be trusted. An injected catalog is snapshotted and validated
  // on every request — nothing is cached, so nothing can go stale — and the
  // production catalog was validated once, at module load.
  const catalog = catalogFor(deps.registry);
  if (!catalog.ok) {
    return serviceFailure("INTERNAL_ERROR", describeCatalogDefects(catalog.defects));
  }

  const preflight = await deps.preflight(parsed.request, config.config.wcl);
  if (!preflight.ok) {
    const { code, message } = describePreflightFailure(preflight.failure.reason);
    return serviceFailure(code, message);
  }

  const identity = preflight.identity;

  // ---- specialization identity, resolved before any evidence is retrieved ----
  //
  // Ordering is deliberate and it is about cost as much as correctness. An
  // unsupported specialization is fully determined by M2 identity, so answering
  // it here avoids paginating an entire combat log in order to report that we
  // were never going to analyze it. Nothing is lost by answering early: the
  // analyzer's own spec gate would return the same status from the same fact.
  const resolved = resolveSpecIdentity(identity.player);
  if (!resolved.ok) {
    if (resolved.reason === "IDENTITY_NOT_USABLE") {
      // Not a coverage gap — a data problem. Preflight refuses to resolve an
      // identity without a usable class and spec, so arriving here means the
      // identity is not trustworthy and analysis must not proceed on it.
      return serviceFailure(
        "IDENTITY_UNRESOLVED",
        "Warcraft Logs did not supply a usable class and specialization for that player, so the fight cannot be analyzed.",
      );
    }
    const { className, specName } = resolved.observed;
    return unsupportedSpec(identity, `${className}/${specName}`);
  }

  // PUBLIC lookup only. An internal-only registration for this specialization
  // is invisible here by construction. A resolved identity with no public
  // analyzer is unreachable — catalog validation already proved the identity
  // table and the public set agree — and is handled rather than asserted
  // because the honest answer is identical: no analyzer ran, nothing was
  // evaluated.
  const analyzer = analyzerForSpec(resolved.specId, catalog.catalog);
  if (analyzer === null) {
    return unsupportedSpec(identity, resolved.specId);
  }

  // ---- evidence breadth, from THE SELECTED ANALYZER AND NOTHING ELSE ----
  //
  // Derived from `analyzer.requirement` alone — itself derived from the
  // registration's declared decision capabilities — not from the enabled set.
  // One request analyzes one player in one specialization, so exactly one
  // analyzer runs, and an analyzer that is not running has no claim on what
  // this request retrieves.
  //
  // Unioning the whole registry would be invisible today, with one analyzer
  // registered, and wrong the moment a second arrives: registering a FULL_RAID
  // healer analyzer would silently widen every Rogue request to raid-wide
  // retrieval, paying for ally evidence the Rogue analyzer cannot read.
  //
  // `deriveIngestionScope` still does the deciding, so scope remains one
  // function's job — it is simply asked about the requirement that actually
  // applies.
  const requirement = analyzer.requirement;
  const scope = deriveIngestionScopeFor([analyzer]);
  if (!scope.ok) {
    // Unreachable by construction: derivation fails only on an empty list, and
    // the list is one selected analyzer. Handled rather than asserted because a
    // thrown error here would surface as an opaque 500, and this is the honest
    // thing to say if the invariant ever stops holding.
    return serviceFailure(
      "INTERNAL_ERROR",
      "No ingestion scope could be derived for the selected analyzer, so no combat events were retrieved.",
    );
  }

  // ---- M3: retrieve and normalize ----
  //
  // Every analyzer-specific field is copied from the requirement. This service
  // does not know which resources the analyzer reads, or that it reads any — it
  // knows only that the registration asked for them.
  const ingested = await deps.ingest(
    {
      reportCode: parsed.request.reportCode,
      fightId: parsed.request.fightId,
      sourceId: parsed.request.sourceId,
      scope: scope.scope,
      includeResources: requirement.includeResources,
      ...(scope.ownedPetEvidence === true ? { ownedPetEvidence: true as const } : {}),
    },
    config.config.wcl,
  );
  if (!ingested.ok) {
    const { code, message } = describeIngestionFailure(ingested.failure.reason);
    return serviceFailure(code, message);
  }

  // ---- identity consistency across two round trips ----
  //
  // Preflight and ingestion are separate requests, and a report can be
  // re-uploaded between them. M3 rechecks the revision WITHIN its own retrieval,
  // but nothing compares its result against the identity M2 established — so a
  // report replaced in that gap would be analyzed as though the earlier identity
  // still described it. This is the minimum check that closes that window, and
  // it reuses M3's own vocabulary rather than inventing a reconciliation layer.
  if (ingested.fight.report.revision !== identity.report.revision) {
    const { code, message } = describeIngestionFailure("REPORT_REVISION_CHANGED");
    return serviceFailure(code, message);
  }

  // ---- M4: derived factual state ----
  const state = createCombatState(ingested.fight);

  // ---- M5: the analyzer's own facade, invoked exactly once ----
  //
  // `targetActorId: null` on purpose. The facade resolves each decision's target
  // from the observed cast that decision is about, which is a fact per event;
  // choosing one fight-level enemy here would overwrite that with a guess.
  //
  // Through `runAnalyzer`, which checks the result is the registration's own.
  // A registration that answers about another specialization is a defect in
  // the deployment, reported as such — never as an unsupported specialization
  // and never as a document with `specId: null`.
  const run = runAnalyzer(analyzer, {
    state,
    actorId: identity.player.sourceId,
    specId: analyzer.specId,
    targetActorId: null,
  });
  if (!run.ok) {
    return serviceFailure(
      "INTERNAL_ERROR",
      `The selected analyzer returned a result it does not own, so no analysis was published. ${run.detail}`,
    );
  }
  const { analysis } = run;

  const fightAnalysis: FightAnalysis = {
    identity,
    specId: analyzer.specId,
    analyzerId: analyzer.analyzerId,
    scope: scope.scope,
    analysis,
    // The registration's own projection of its result — the only form in which
    // shared projectors read the analysis. Built here, next to the analysis it
    // describes, by the registration that produced it.
    observedDecisions:
      analysis.status === "ANALYZED" ? observedDecisionViewOf(catalog.catalog, analysis) : null,
  };

  return { ok: true, state: resultStateFor(fightAnalysis), analysis: fightAnalysis };
}
