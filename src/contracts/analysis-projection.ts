/**
 * Projecting an application analysis into the public contract.
 *
 * ONE DIRECTION, ENFORCED BY POSITION IN THE TREE:
 *
 *     M5 / engine
 *          ^
 *     src/services      (application composition — knows nothing of this file)
 *          ^
 *     src/contracts     (you are here: reads domain types, publishes a shape)
 *          ^
 *     MCP / REST        (later: consume the published shape)
 *
 * This module may read application-domain types. Nothing below it may read
 * this module, which is what keeps the service free of a wire schema and lets
 * the public contract change without touching the analyzer.
 *
 * IT HAS NO ACCESS TO ANYTHING DANGEROUS. The projection takes an analysis
 * result and returns data. It does not receive `Env`, cannot read a credential,
 * performs no I/O, and reads no clock — so there is no path by which a secret,
 * a request id or a timestamp could reach the public payload.
 *
 * EVERY FIELD IS COPIED BY NAME. No spreads from internal objects, no
 * `as PublicThing` casts over an internal shape. It is tedious on purpose: a
 * field reaches the public contract because someone wrote it here, not because
 * it happened to exist upstream. That is the difference between publishing a
 * result and leaking one.
 *
 * IT READS NO SPECIALIZATION PAYLOAD. Since M10-A the analyzed content reaches
 * this module as `FightAnalysis.observedDecisions` — the view the analyzer's
 * own registration produced — and the internal `specId` is narrowed through
 * `requirePublicSpecId`. An internal-only analysis cannot be projected as an
 * unsupported document or as `specId: null`: it throws, and the transport
 * reports an internal error. `null` keeps its one meaning — no public analyzer
 * was selected.
 */

import type {
  CoachingStatement,
  DeltaComponent,
  DeltaValue,
  DiagnosisObservation,
  DiagnosisOutcome,
} from "../diagnosis/diagnosis.js";
import type { EvidenceLocator } from "../engine/evidence/locator.js";
import type { ObservedDecisionView } from "../findings/observed-decision-view.js";
import { requirePublicSpecId } from "../findings/spec-id.js";
import type {
  ConsumableStatus,
  ConsumableUnknownReason,
  ConsumableUse,
} from "../analysis/preparation/consumable-status.js";
import {
  assertNever,
  type FightAnalysis,
  type PreparationOutcome,
  type RaidCooldownPlanDisclosure,
} from "../services/result.js";
import {
  CAPABILITY,
  PUBLIC_ANALYSIS_SCHEMA_VERSION,
  PublicAnalysisResultSchema,
  type PublicAnalysisResult,
  type PublicEvidenceLocator,
  type PublicIdentity,
} from "./analysis-contract.js";

/**
 * The analyzed payload as this module assembles it, BEFORE schema validation.
 *
 * The vocabulary fields are strings here because the view carries them as
 * strings; `PublicAnalysisResultSchema.parse` at the end of the projection is
 * what proves each value is a member of the frozen public enum. The keys are
 * exactly the schema's keys, so a field reaches the wire only because it is
 * written here.
 */
interface ProjectedDecision {
  readonly locator: PublicEvidenceLocator;
  readonly position: number;
  readonly fightTimeMs: number;
  readonly targetActorId: number | null;
  readonly observedAbilityGameId: number;
  readonly observedToken: string;
  readonly outcome: string;
  readonly basis: string;
  readonly authorityCoverage: string;
  readonly authorityToken: string | null;
  readonly selectionPrecision: string | null;
  readonly decisiveBlocker: string | null;
  readonly usabilityProvenance: string;
}

interface ProjectedExclusion {
  readonly locator: PublicEvidenceLocator;
  readonly position: number;
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  readonly reason: string;
}

interface ProjectedTally {
  readonly key: string;
  readonly count: number;
}

interface ProjectedCoverage {
  readonly eligibleDecisions: number;
  readonly match: number;
  readonly rejected: number;
  readonly unknown: number;
  readonly resolvedComparisons: number;
  readonly exactEntryMatches: number;
  readonly tokenConvergedMatches: number;
  readonly selectionPrecision: readonly ProjectedTally[];
  readonly unknownBases: readonly ProjectedTally[];
  readonly unknownBlockerClasses: readonly ProjectedTally[];
  readonly exclusions: readonly ProjectedTally[];
  readonly excludedCastCount: number;
}

function projectLocator(locator: EvidenceLocator): PublicEvidenceLocator {
  return {
    streamId: locator.streamId,
    pageOrdinal: locator.pageOrdinal,
    indexInPage: locator.indexInPage,
    ingestionOrdinal: locator.ingestionOrdinal,
    rawType: locator.rawType,
    reportTimeMs: locator.reportTimeMs,
  };
}

/**
 * The shared preparation producer's report, field for field. Nothing is
 * derived or judged here: the kinds are renamed to the public keys, and the
 * internal identity-load detail (a validation message) is not published.
 */
function projectPreparation(preparation: PreparationOutcome) {
  if (preparation.state === "NOT_ASSESSED") {
    return { assessment: "NOT_ASSESSED", reason: preparation.reason } as const;
  }
  const { report } = preparation;
  return {
    assessment: "ASSESSED",
    category: report.category,
    authority: report.authority,
    identityData: report.identityData,
    statuses: {
      healthPotion: projectConsumableStatus(report.statuses.HEALTH_POTION),
      healthstone: projectConsumableStatus(report.statuses.HEALTHSTONE),
      combatPotion: projectConsumableStatus(report.statuses.COMBAT_POTION),
    },
  } as const;
}

function projectConsumableUse(use: ConsumableUse) {
  return { spellId: use.spellId, name: use.name, timing: use.timing, evidence: projectLocator(use.evidence) };
}

function projectConsumableReason(reason: ConsumableUnknownReason) {
  switch (reason.code) {
    case "CAST_COVERAGE":
    case "AURA_COVERAGE":
      // The gate's vocabulary is validated against the public enum by the
      // final parse; a gate outside it fails the projection closed.
      return { code: reason.code, gate: reason.gate };
    case "FIGHT_SHORTER_THAN_LONGEST_COMBAT_POTION_BUFF":
      return {
        code: reason.code,
        fightDurationMs: reason.fightDurationMs,
        longestBuffMs: reason.longestBuffMs,
      };
    case "UNCLASSIFIED_CANDIDATE":
      return { code: reason.code, spellId: reason.spellId, abilityName: reason.abilityName };
    case "IDENTITY_DATA_UNAVAILABLE":
      return { code: reason.code };
    default:
      return assertNever(reason);
  }
}

function projectConsumableStatus(status: ConsumableStatus) {
  const uses = status.uses.map(projectConsumableUse);
  return status.state === "OBSERVED"
    ? ({ countState: "OBSERVED", count: status.count, uses } as const)
    : ({
        countState: "UNKNOWN",
        reasons: status.reasons.map(projectConsumableReason),
        observedAtLeast: status.observedAtLeast,
        uses,
      } as const);
}

function projectIdentity(analysis: FightAnalysis): PublicIdentity {
  const { identity } = analysis;
  return {
    report: { code: identity.report.code, revision: identity.report.revision },
    fight: {
      id: identity.fight.id,
      name: identity.fight.name,
      encounterId: identity.fight.encounterId,
      difficulty: identity.fight.difficulty,
      // Renamed to state the unit. Values unchanged.
      startTimeMs: identity.fight.startTime,
      endTimeMs: identity.fight.endTime,
    },
    player: {
      sourceId: identity.player.sourceId,
      name: identity.player.name,
      // The factual Warcraft Logs strings, published even when the engine has
      // no internal name for the specialization. That is how an unsupported
      // spec stays identifiable without being fabricated into a `SpecId`.
      className: identity.player.className,
      specName: identity.player.specName,
    },
    data: { logVersion: identity.data.logVersion, gameVersion: identity.data.gameVersion },
  };
}

/** The supplied plan's disclosure, field for field (M12-E). */
function projectRaidCooldownPlan(plan: RaidCooldownPlanDisclosure) {
  return {
    authority: plan.authority,
    schema: plan.schema,
    format: plan.format,
    label: plan.label,
    digest: plan.digest,
    encounter: { encounterId: plan.encounter.encounterId, difficulty: plan.encounter.difficulty },
    encounterBinding: plan.encounterBinding,
    assignmentCount: plan.assignmentCount,
    importDiagnostics: plan.importDiagnostics.map((row) => ({ key: row.code, count: row.count })),
    assignmentEvaluation: {
      state: plan.assignmentEvaluation.state,
      reason: plan.assignmentEvaluation.reason,
    },
  } as const;
}

function projectComponent(component: DeltaComponent) {
  switch (component.dimension) {
    case "TOTAL":
      return { dimension: component.dimension };
    case "BY_SOURCE":
      return { dimension: component.dimension, sourceKind: component.sourceKind };
    case "BY_ABILITY":
      return {
        dimension: component.dimension,
        sourceKind: component.sourceKind,
        abilityGameId: component.abilityGameId,
      };
    case "BY_TARGET_CLASS":
      return { dimension: component.dimension, targetClass: component.targetClass };
    case "BY_WCL_TARGET_TYPE":
      return { dimension: component.dimension, wclTargetType: component.wclTargetType };
    default:
      return assertNever(component);
  }
}

function projectDelta(delta: DeltaValue) {
  return delta.kind === "UNKNOWN"
    ? { kind: delta.kind, reason: delta.reason }
    : { kind: delta.kind, value: delta.value };
}

function projectPair(pair: CoachingStatement | DiagnosisObservation) {
  return {
    rowId: pair.rowId,
    windowId: pair.windowId,
    measure: pair.measure,
    component: projectComponent(pair.component),
    comparisonFightRef: pair.comparisonFightRef,
    perMinuteDelta: projectDelta(pair.perMinuteDelta),
    limits: [...pair.limits],
  };
}

/** The reviewed diagnosis projection's outcome, field for field (M14-F). Nothing is derived here. */
function projectDiagnosis(outcome: DiagnosisOutcome) {
  if (outcome.state === "NOT_ASSESSED")
    return { assessment: "NOT_ASSESSED", reason: outcome.reason } as const;
  const { diagnosis } = outcome;
  return {
    assessment: "ASSESSED",
    comparisonFights: diagnosis.comparisonFightRefs.map((fightRef) => ({ fightRef })),
    windowIds: [...diagnosis.windowIds],
    statements: diagnosis.statements.map((statement) => ({
      statementKind: statement.statementKind,
      ...projectPair(statement),
      direction: statement.direction,
      findings: statement.findings.map(projectLocator),
      environmentalContext: statement.environmentalContext.map((entry) => ({
        itemId: entry.itemId,
        reason: entry.reason,
      })),
      magnitudeAttribution: statement.magnitudeAttribution,
    })),
    observations: diagnosis.observations.map((observation) => ({
      ...projectPair(observation),
      direction: observation.direction,
      cause: observation.cause,
    })),
    coverage: {
      deltaRows: diagnosis.coverage.deltaRows,
      pairs: diagnosis.coverage.pairs,
      statements: diagnosis.coverage.statements,
      observations: diagnosis.coverage.observations,
      observationCauses: diagnosis.coverage.observationCauses.map((row) => ({
        key: row.key,
        count: row.count,
      })),
      decisionEvidence: {
        records: diagnosis.coverage.decisionEvidence.records,
        resolved: diagnosis.coverage.decisionEvidence.resolved,
        unknown: diagnosis.coverage.decisionEvidence.unknown,
        inNoComponent: diagnosis.coverage.decisionEvidence.inNoComponent,
      },
    },
    encounterStateEvidence: diagnosis.encounterStateEvidence.map((entry) => ({
      fightRef: entry.fightRef,
      phaseEvidence: entry.phaseEvidence,
    })),
    strategyThresholds: { id: diagnosis.strategyThresholds.id, status: diagnosis.strategyThresholds.status },
    comparisonCoverage: diagnosis.comparisonCoverage,
    comparisonRole: diagnosis.comparisonRole,
    decisionEvidenceSide: diagnosis.decisionEvidenceSide,
    magnitudeAttribution: diagnosis.magnitudeAttribution,
    findingEffect: {
      suppression: diagnosis.findingEffect.suppression,
      confidence: diagnosis.findingEffect.confidence,
    },
  } as const;
}

type TldrOutcome = NonNullable<FightAnalysis["tldr"]>;
type TldrConsumableOutcome = Extract<
  Extract<TldrOutcome, { assessment: "ASSESSED" }>["preparation"],
  { assessment: "ASSESSED" }
>["healthPotion"];

function projectTldrConsumable(consumable: TldrConsumableOutcome) {
  return consumable.countState === "OBSERVED"
    ? { countState: consumable.countState, count: consumable.count }
    : { countState: consumable.countState };
}

type TldrAssessedOutcome = Extract<TldrOutcome, { assessment: "ASSESSED" }>;

function projectTldrGameplay(gameplay: TldrAssessedOutcome["gameplay"]) {
  return gameplay.status === "ANALYZED"
    ? {
        status: gameplay.status,
        eligibleDecisions: gameplay.eligibleDecisions,
        resolvedDecisions: gameplay.resolvedDecisions,
        unknownDecisions: gameplay.unknownDecisions,
        excludedCasts: gameplay.excludedCasts,
      }
    : { status: gameplay.status };
}

function projectTldrPreparation(preparation: TldrAssessedOutcome["preparation"]) {
  return preparation.assessment === "ASSESSED"
    ? {
        assessment: preparation.assessment,
        healthPotion: projectTldrConsumable(preparation.healthPotion),
        healthstone: projectTldrConsumable(preparation.healthstone),
        combatPotion: projectTldrConsumable(preparation.combatPotion),
      }
    : { assessment: preparation.assessment, reason: preparation.reason };
}

function projectTldrDiagnosis(damageDiagnosis: TldrAssessedOutcome["damageDiagnosis"]) {
  return damageDiagnosis === null
    ? null
    : damageDiagnosis.assessment === "ASSESSED"
      ? { assessment: damageDiagnosis.assessment, statements: damageDiagnosis.statements }
      : { assessment: damageDiagnosis.assessment, reason: damageDiagnosis.reason };
}

/** The TLDR, field for field (M15-B). Nothing is derived or reworded here. */
function projectTldr(tldr: TldrOutcome) {
  if (tldr.assessment === "NOT_ASSESSED")
    return { assessment: tldr.assessment, revision: tldr.revision, reason: tldr.reason } as const;
  return {
    assessment: tldr.assessment,
    revision: tldr.revision,
    assessmentScope: tldr.assessmentScope,
    headline: tldr.headline,
    gameplay: projectTldrGameplay(tldr.gameplay),
    highlights: tldr.highlights.map((highlight) => ({
      position: highlight.position,
      itemKind: highlight.itemKind,
      category: highlight.category,
      standing: highlight.standing,
      subjectToken: highlight.subjectToken,
      occurrences: highlight.occurrences,
      firstFightTimeMs: highlight.firstFightTimeMs,
      lastFightTimeMs: highlight.lastFightTimeMs,
      evidence: highlight.evidence.map(projectLocator),
    })),
    divergences: {
      items: tldr.divergences.items,
      records: tldr.divergences.records,
      actionableRecords: tldr.divergences.actionableRecords,
      notListedItems: tldr.divergences.notListedItems,
    },
    notAssessed: tldr.notAssessed.map((row) => ({
      category: row.category,
      disposition: row.disposition,
      records: row.records,
    })),
    preparation: projectTldrPreparation(tldr.preparation),
    damageDiagnosis: projectTldrDiagnosis(tldr.damageDiagnosis),
    disclosures: [...tldr.disclosures],
    lines: [...tldr.lines],
    magnitude: tldr.magnitude,
    findingEffect: {
      confidence: tldr.findingEffect.confidence,
      suppression: tldr.findingEffect.suppression,
    },
  } as const;
}

type ReportOutcome = NonNullable<FightAnalysis["report"]>;
type ReportEntryOutcome = Extract<
  ReportOutcome,
  { assessment: "ASSESSED" }
>["categories"][number]["carried"][number];

function projectReportEntry(entry: ReportEntryOutcome) {
  return {
    section: entry.section,
    position: entry.position,
    itemKind: entry.itemKind,
    disposition: entry.disposition,
    standing: entry.standing,
    producer: entry.producer,
    authority: entry.authority,
    stateEvidence: entry.stateEvidence,
    actionability: entry.actionability,
    reasonCode: entry.reasonCode,
    suppressionReason: entry.suppressionReason,
    subjectToken: entry.subjectToken,
    occurrences: entry.occurrences,
    firstFightTimeMs: entry.firstFightTimeMs,
    lastFightTimeMs: entry.lastFightTimeMs,
    evidence: entry.evidence.map(projectLocator),
  };
}

/**
 * The report (M15-D), field for field. Nothing is derived or reworded here:
 * the markdown is the reporting module's, rendered from these same fields.
 * The coverage sub-blocks share the TLDR's shapes.
 */
function projectReport(report: ReportOutcome) {
  if (report.assessment === "NOT_ASSESSED")
    return { assessment: report.assessment, revision: report.revision, reason: report.reason } as const;
  const { coverage } = report;
  return {
    assessment: report.assessment,
    revision: report.revision,
    assessmentScope: report.assessmentScope,
    coverage: {
      gameplay: projectTldrGameplay(coverage.gameplay),
      preparation: projectTldrPreparation(coverage.preparation),
      damageDiagnosis: projectTldrDiagnosis(coverage.damageDiagnosis),
      recordsByDisposition: coverage.recordsByDisposition.map((row) => ({
        disposition: row.disposition,
        records: row.records,
      })),
      disclosures: [...coverage.disclosures],
    },
    categories: report.categories.map((section) => ({
      category: section.category,
      prioritized: section.prioritized.map(projectReportEntry),
      informational: section.informational.map(projectReportEntry),
      carried: section.carried.map(projectReportEntry),
    })),
    suppressions: report.suppressions.map((row) => ({
      category: row.category,
      suppressionReason: row.suppressionReason,
      reasonCode: row.reasonCode,
      subjectToken: row.subjectToken,
      records: row.records,
    })),
    markdown: report.markdown,
    magnitude: report.magnitude,
    findingEffect: {
      confidence: report.findingEffect.confidence,
      suppression: report.findingEffect.suppression,
    },
  } as const;
}

/**
 * Common fields, identical across every status.
 *
 * `gameplaySupported` is derived from whether an analyzer actually ran, not
 * from whether the analysis succeeded. A supported specialization whose
 * authority artifact was unavailable is still supported — the evidence failed,
 * not the coverage — and conflating the two would misreport a temporary
 * condition as a permanent limitation.
 */
function projectCommon(analysis: FightAnalysis) {
  return {
    schemaVersion: PUBLIC_ANALYSIS_SCHEMA_VERSION,
    identity: projectIdentity(analysis),
    specialization: {
      // Narrowed, never mapped. An internal-only id here is an orchestration
      // defect and fails closed; `null` still means only "no public analyzer".
      specId: analysis.specId === null ? null : requirePublicSpecId(analysis.specId),
      gameplaySupported: analysis.analyzerId !== null,
    },
    capability: CAPABILITY,
    analyzerId: analysis.analyzerId,
    // Specialization-independent, on every status (PREP-2).
    preparation: projectPreparation(analysis.preparation),
    // Only when a plan was supplied: a request without one projects unchanged.
    ...(analysis.raidCooldownPlan === undefined
      ? {}
      : { raidCooldownPlan: projectRaidCooldownPlan(analysis.raidCooldownPlan) }),
    // Only when the service built one (M15-B); the single-fight service always does.
    ...(analysis.tldr === undefined ? {} : { tldr: projectTldr(analysis.tldr) }),
    // M15-D: likewise the report.
    ...(analysis.report === undefined ? {} : { report: projectReport(analysis.report) }),
    // `analysis.scope` is NOT projected. It is ingestion orchestration — which
    // evidence to fetch — and publishing it would let a retrieval setting be
    // read as analysis completeness. The coverage block is what discloses that.
  } as const;
}

/**
 * The view's vocabulary fields are plain strings — owned by the producing
 * specialization and frozen by the schema — so each is validated by the
 * `parse` at the end of the projection rather than by a type here. What the
 * view deliberately does NOT carry (the engine's raw blocker, the three-state
 * rejection flag, the per-decision actor id) was decided by the registration
 * that built it; see `src/specs/rogue/assassination/registration.ts`.
 */
function projectDecisions(view: ObservedDecisionView): readonly ProjectedDecision[] {
  return view.decisions.map((decision) => ({
    locator: projectLocator(decision.locator),
    position: decision.position,
    fightTimeMs: decision.fightTimeMs,
    targetActorId: decision.targetActorId,
    observedAbilityGameId: decision.observedAbilityGameId,
    observedToken: decision.observedToken,
    outcome: decision.outcome,
    basis: decision.basis,
    authorityCoverage: decision.authorityCoverage,
    authorityToken: decision.authorityToken,
    selectionPrecision: decision.selectionPrecision,
    decisiveBlocker: decision.decisiveBlocker,
    usabilityProvenance: decision.usabilityProvenance,
  }));
}

function projectExclusions(view: ObservedDecisionView): readonly ProjectedExclusion[] {
  return view.exclusions.map((cast) => ({
    locator: projectLocator(cast.locator),
    position: cast.position,
    abilityGameId: cast.abilityGameId,
    reportTimeMs: cast.reportTimeMs,
    reason: cast.reason,
  }));
}

function projectCoverage(view: ObservedDecisionView): ProjectedCoverage {
  const { coverage } = view;
  return {
    eligibleDecisions: coverage.eligibleDecisions,
    match: coverage.match,
    rejected: coverage.rejected,
    unknown: coverage.unknown,
    resolvedComparisons: coverage.resolvedComparisons,
    exactEntryMatches: coverage.exactEntryMatches,
    tokenConvergedMatches: coverage.tokenConvergedMatches,
    // Tallies are rebuilt element by element rather than passed through, so a
    // future extra field on the internal tally cannot ride along.
    selectionPrecision: coverage.selectionPrecision.map((row) => ({ key: row.key, count: row.count })),
    unknownBases: coverage.unknownBases.map((row) => ({ key: row.key, count: row.count })),
    unknownBlockerClasses: coverage.unknownBlockerClasses.map((row) => ({
      key: row.key,
      count: row.count,
    })),
    exclusions: coverage.exclusions.map((row) => ({ key: row.key, count: row.count })),
    excludedCastCount: coverage.excludedCastCount,
  };
}

/**
 * Projects one application analysis result into the public contract.
 *
 * TOTAL OVER EVERY ANALYSIS STATUS. The switch is exhaustive and ends in
 * `assertNever`, so adding a status to the analysis vocabulary becomes a
 * compile error here. A new state cannot reach the wire without somebody
 * deciding what it should look like.
 *
 * THE RESULT IS VALIDATED BEFORE IT IS RETURNED. Not as input sanitisation —
 * the input is trusted domain data — but because a projection bug is otherwise
 * invisible until a consumer chokes on it. `parse` throws on mismatch, and
 * that throw is correct: an invalid public shape is an internal defect, not a
 * condition to be downgraded into `UNKNOWN` or an empty result. How a transport
 * reports such a defect is M6-D/M6-E's decision, not this layer's.
 */
export function projectAnalysisResult(analysis: FightAnalysis): PublicAnalysisResult {
  const common = projectCommon(analysis);
  const result = analysis.analysis;

  switch (result.status) {
    case "ANALYZED": {
      // An analyzed result without its registration's view is a service
      // defect, not a shape to be filled with empty lists — that would publish
      // "no decisions" for a fight that had them.
      const view = analysis.observedDecisions;
      if (view === null) {
        throw new Error(
          "an ANALYZED result reached the public projection without its observed-decision view",
        );
      }
      return PublicAnalysisResultSchema.parse({
        ...common,
        status: "ANALYZED",
        authority: {
          authorityId: result.authority.authorityId,
          artifactRevision: result.authority.artifactRevision,
          repository: result.authority.repository,
          branch: result.authority.branch,
          commitSha: result.authority.commitSha,
          sourcePath: result.authority.sourcePath,
          sourceSha256: result.authority.sourceSha256,
          specName: result.authority.specName,
          className: result.authority.className,
        },
        decisions: projectDecisions(view),
        exclusions: projectExclusions(view),
        coverage: projectCoverage(view),
        // Only when the service ran the diagnosis projection (M14-F); the
        // single-fight service always does on ANALYZED.
        ...(analysis.diagnosis === undefined ? {} : { diagnosis: projectDiagnosis(analysis.diagnosis) }),
      });
    }

    // The four non-analyzed states share a shape because the analyzer produces
    // one: each carries an author-written `detail` and nothing else. They are
    // listed individually rather than grouped so that a future status with
    // different content cannot be absorbed silently by a catch-all branch.
    case "SPEC_NOT_SUPPORTED":
    case "AUTHORITY_NOT_AVAILABLE":
    case "PROFILE_NOT_RESOLVED":
    case "INSUFFICIENT_EVIDENCE":
      return PublicAnalysisResultSchema.parse({
        ...common,
        status: result.status,
        detail: result.detail,
      });

    default:
      return assertNever(result);
  }
}
