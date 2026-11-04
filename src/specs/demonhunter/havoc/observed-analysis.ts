/**
 * The Havoc Demon Hunter observed-decision facade (ONB-A1; PUBLIC since ONB-A1P).
 *
 * One pure function over an ALREADY-INGESTED normalized fight. It enumerates the
 * observed foreground casts of one Havoc Demon Hunter, evaluates each cast of a
 * SUPPORTED token against the pinned offensive authority through the nested
 * unselectability proof and the shared first-GCD query, and reports the decision
 * domains separately.
 *
 * WHAT IT DELIBERATELY IS NOT. Not a fetcher, a transport or a coach: no network, no
 * score, no severity. Not a resource simulator: only the decision cast's own PRE_COST
 * Fury is read. Not a racial, potion or trinket evaluator (`domain-boundary.ts`).
 *
 * THE DECISION POPULATION, STATED
 *
 * Every COMPLETE cast by the actor, in canonical order, classified:
 *
 *     melee swing                           excluded  MELEE_SWING
 *     pinned lane NON_GCD                   excluded  NON_GCD_ACTION
 *     no pinned lane record                 excluded  EXECUTION_LANE_NOT_ESTABLISHED
 *     GCD lane, no authority token          excluded  NO_AUTHORITY_TOKEN_BINDING
 *     throw_glaive, the_hunt                excluded  OUTSIDE_FIRST_SLICE
 *     every other GCD token                 ELIGIBLE  -> proof + first-GCD query -> comparison
 *
 * WHY THROW GLAIVE AND THE HUNT ARE NOT JUDGED. A logged 185123 is not always a
 * press: on the retained subject every one of 48 sits within 2 ms of a Blade Dance or
 * Death Sweep, because Screaming Brutality executes a background copy on the same
 * spell. Judging them against `default[14]`, whose gate is false, would report 48
 * mistakes the player never made. The Hunt has a cast time, so it is decided at its
 * `begincast`; this facade evaluates state at the observed `cast`, which would ask the
 * wrong moment. Metamorphosis never reaches this table as a press: the log reports its
 * impact, which has a NON_GCD lane record.
 *
 * MATCH MEANS AUTHORITY_COMPATIBLE_ONLY, after the non-domain exclusion.
 *
 * VALIDATED FOR ALDRACHI REAVER ONLY. The hero tree resolved from the observed
 * talent entries is checked before any decision is read (`supported-profile.ts`):
 * Fel-Scarred is AUTHORITY_NOT_AVAILABLE, an unresolved or contradictory tree
 * PROFILE_NOT_RESOLVED.
 */

import type { CombatState } from "../../../engine/state/combat-state.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import type {
  AnalysisAuthorityMetadata,
  AnalysisStatus,
  SpecAnalysisEnvelope,
  SpecAnalysisInput,
} from "../../../findings/analysis-envelope.js";
import type { AuthorityAccess } from "../../../findings/authority-domain.js";
import type { AplAuthority } from "../../../simc/apl-authority.js";
import type { RotationalGcdResult } from "../../../simc/first-gcd-selection.js";
import { unknownNumber, type AtomBindings } from "../../../simc/expression/evaluate.js";
import {
  compareObservedAction,
  COMPARISON_BASES,
  type ComparisonBasis,
  type ObservedActionComparison,
  type ObservedRotationalDecision,
} from "../../../findings/observed-comparison.js";
import {
  DECISION_BLOCKER_CLASSES,
  DECISION_COVERAGES,
  type DecisionBlockerClass,
  type DecisionCoverage,
} from "../../../simc/decision-coverage.js";
import {
  havocBaseGcdMsForAbility,
  havocExecutionLaneForAbility,
  havocTokenByAbilityId,
} from "../../../data/game/demonhunter-havoc-gcd-semantics.js";
import {
  havocModelledTalentNames,
  resolveHavocHeroTree,
  resolveHavocTalent,
} from "../../../data/game/demonhunter-havoc-talents.js";
import type {
  HeroTreeResolution,
  ObservedTalentEntry,
  TalentResolution,
} from "../../../data/game/talent-selection.js";
import type { HavocBuildFacts, HavocReadinessFact } from "./action-profile.js";
import type { ReaversGlaiveReadinessFact } from "./aura-bindings.js";
import {
  bindSupportedHavocAuras,
  havocBuffBindingsFrom,
  havocBuffUpByName,
  reaversGlaiveReadinessFact,
  type HavocAuraBinding,
} from "./aura-bindings.js";
import {
  havocCooldownBindingsFrom,
  havocCooldownsProvenDown,
  deriveSupportedHavocCooldowns,
  type HavocTokenCooldown,
} from "./cooldown-bindings.js";
import { standaloneHavocAuthorityAccess } from "./authority-bindings.js";
import { havocDomainResults, type HavocDomainResults } from "./domains.js";
import {
  havocFirstGcdSelectionAt,
  type HavocDispatchStep,
  type HavocFirstGcdQueryOutcome,
  type HavocStoppingPoint,
  type HavocUndecidedCandidate,
} from "./first-gcd-adapter.js";
import {
  proveObservedActionUnselectable,
  type ObservedActionUnselectability,
} from "./observed-action-gate.js";
import {
  exactFury,
  felScarredDisproved,
  resolveHavocAtoms,
  VIOLENT_TRANSFORMATION,
  type HavocResolverDiagnostics,
} from "./resolver.js";
import { resolveHavocPositiveUsability } from "./positive-usability.js";
import type { PositiveUsability } from "../../../findings/usability/usability-completeness.js";
import { ownCastResourceAt } from "../../../findings/resources/own-cast-resource.js";
import { HAVOC_DEMON_HUNTER_SPEC_ID } from "./spec.js";
import { havocValidatedProfile } from "./supported-profile.js";

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** The observed in-domain GCD tokens the slice does not judge. Why: the module header. */
export const OUTSIDE_FIRST_SLICE_TOKENS = Object.freeze(["throw_glaive", "the_hunt"] as const);

/** Why an observed cast is NOT an eligible decision. Counted, never dropped. */
export type HavocExclusionReason =
  /** Warcraft Logs flags the cast `melee`: an auto-attack swing, not a foreground press. */
  | "MELEE_SWING"
  /** Proven off-GCD by the pinned lane data (Vengeful Retreat, a Metamorphosis impact, The Hunt's impact, ...). */
  | "NON_GCD_ACTION"
  /** The pinned dataset carries no lane record for the ability (Fel Rush, Blur, Darkness, a potion, ...). */
  | "EXECUTION_LANE_NOT_ESTABLISHED"
  /** A GCD action with no pinned authority token. */
  | "NO_AUTHORITY_TOKEN_BINDING"
  /** An in-domain GCD action the slice observes but does not judge (Throw Glaive, The Hunt). */
  | "OUTSIDE_FIRST_SLICE";

export const HAVOC_EXCLUSION_REASONS = [
  "MELEE_SWING",
  "NON_GCD_ACTION",
  "EXECUTION_LANE_NOT_ESTABLISHED",
  "NO_AUTHORITY_TOKEN_BINDING",
  "OUTSIDE_FIRST_SLICE",
] as const satisfies readonly HavocExclusionReason[];

export interface ExcludedHavocCast {
  readonly position: number;
  readonly locator: EvidenceLocator;
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  readonly reason: HavocExclusionReason;
}

export interface CountOf<T extends string> {
  readonly key: T;
  readonly count: number;
}

/** The coverage disclosure. The denominator is `eligibleDecisions` and nothing else. */
export interface HavocDecisionCoverage {
  readonly actorId: number;
  readonly eligibleDecisions: number;
  readonly match: number;
  readonly rejected: number;
  readonly unknown: number;
  readonly resolvedComparisons: number;
  readonly exactEntryMatches: number;
  readonly tokenConvergedMatches: number;
  readonly selectionPrecision: readonly CountOf<DecisionCoverage>[];
  readonly unknownBases: readonly CountOf<ComparisonBasis>[];
  readonly unknownBlockerClasses: readonly CountOf<DecisionBlockerClass>[];
  readonly exclusions: readonly CountOf<HavocExclusionReason>[];
  readonly excludedCastCount: number;
  /** Every eligible decision's observed token -> count. */
  readonly eligibleTokens: readonly CountOf<string>[];
  /**
   * Every UNKNOWN decision's engine refusal, as `<raw blocker> @ <list[ordinal] token>` -> count: the
   * blocker the first-GCD query returned and the entry it names (the refused NON_GCD branch, or the
   * head of the diverging worlds). The root scan may resolve and the query still refuse, so this is
   * the tally that says why each UNKNOWN is UNKNOWN.
   */
  readonly unresolvedAt: readonly CountOf<string>[];
  /** Every eligible decision's root-scan stopping entry -> count (`(root scan resolved)` when none). */
  readonly stoppingEntries: readonly CountOf<string>[];
  /** Every eligible decision's root-scan stopping entry AND atom, as `list[ordinal] token | atom` -> count. */
  readonly stoppingAtoms: readonly CountOf<string>[];
  /** Every dispatch step of every eligible decision's root scan, as `list[ordinal] -> callee : outcome` -> count. */
  readonly dispatchOutcomes: readonly CountOf<string>[];
  /**
   * Every GCD_CONSUMING entry some eligible decision's root scan recorded
   * MAY_SELECT, as `list[ordinal] token | atom` -> count: the competing
   * candidates a reader needs before believing a stopping point is the ONLY
   * obstacle.
   */
  readonly undecidedGcdCandidates: readonly CountOf<string>[];
  /** Every NON_GCD entry some eligible decision's root scan recorded MAY_SELECT, same keying. */
  readonly undecidedNonGcdCandidates: readonly CountOf<string>[];
  /** Every eligible decision's `buff.<name>.up` evidence, as `atom | up <bool> (<proof>) / <reason>` -> count. */
  readonly auraEvidence: readonly CountOf<string>[];
  /** Every eligible decision's Reaver's Glaive readiness fact -> count. */
  readonly reaversGlaiveEvidence: readonly CountOf<string>[];
  /** Every eligible decision's cooldown readiness per pinned token, as `token | <readiness or reason>` -> count. */
  readonly cooldownReadiness: readonly CountOf<string>[];
  /**
   * Every eligible decision's positive usability conclusion per supported
   * unobserved token (M11-C4i), as `token | PROVEN_USABLE` or
   * `token | NOT_PROVEN: <dimension>(<reason>)` naming the FIRST unresolved
   * dimension -> count.
   */
  readonly positiveUsability: readonly CountOf<string>[];
  /**
   * Every non-melee COMPLETE cast by the actor, by pinned execution lane and
   * base GCD, as `<lane> | <baseGcdMs> ms` (`no record` when the dataset has
   * none) -> count.
   */
  readonly gcdDistribution: readonly CountOf<string>[];
}

/** The build facts the evaluator resolved once from the actor's combatant info. */
export interface HavocBuildResolution {
  readonly talents: Readonly<Record<string, TalentResolution>>;
  readonly heroTree: HeroTreeResolution;
  /** Talents proven not taken, by the three-way rule or by the resolved hero tree. */
  readonly talentsProvenAbsent: readonly string[];
}

/** One derived cooldown at a decision, as the payload carries it. */
export interface HavocCooldownDiagnostics {
  readonly simcToken: string;
  readonly readiness: HavocTokenCooldown["readiness"];
  readonly readinessAbilityGameId: number | null;
  readonly remainsSeconds: HavocTokenCooldown["remainsSeconds"];
  readonly perAbility: readonly {
    readonly abilityGameId: number;
    readonly effectiveBase: HavocTokenCooldown["perAbility"][number]["effectiveBase"];
    readonly cooldown:
      | { readonly state: "UNKNOWN"; readonly reason: string; readonly anchorPosition: number | null }
      | {
          readonly state: "EXACT" | "BOUNDED";
          readonly atLeastRemainingMs: number;
          readonly baseCooldownMs: number;
          readonly elapsedMs: number;
          readonly anchorPosition: number;
          readonly anchorLocator: EvidenceLocator;
        };
  }[];
}

/** The engine's own account of one first-GCD query, reduced to what evidence needs. */
export interface HavocSelectionDiagnostics {
  readonly kind: RotationalGcdResult["kind"];
  /** The entry the engine stopped at, as `list[ordinal] token`, or `null`. */
  readonly blockedAt: string | null;
  readonly detail: string | null;
  /** The ROOT scan's innermost BLOCKED step, as `list[ordinal] token`, or null. */
  readonly rootScanBlockedAt: string | null;
  readonly rootScanBlocker: string | null;
  /** Every dispatch entry the ROOT scan visited, in visit order. */
  readonly dispatches: readonly HavocDispatchStep[];
  /** The ROOT scan's stopping point with its atoms, or null when it resolved. */
  readonly stoppingPoint: HavocStoppingPoint | null;
  /** Every MAY_SELECT step of the ROOT scan, in visit order. */
  readonly undecidedCandidates: readonly HavocUndecidedCandidate[];
  /** When the query SELECTED, the selecting authority entry as `list[ordinal] token`, else null (M11-C4i). */
  readonly selectedEntry: string | null;
  /** When the query SELECTED, the selecting entry's action string verbatim (its condition), else null. */
  readonly selectedEntryAction: string | null;
}

/** The unselectability proof's outcome, reduced to what evidence needs. */
export interface HavocUnselectabilityDiagnostics {
  readonly proven: boolean;
  readonly refusal: string | null;
  readonly at: string | null;
}

/** What Havoc attaches to an analyzed envelope: ITS payload. */
export interface HavocDemonHunterPayload {
  readonly comparisons: readonly ObservedActionComparison[];
  readonly excluded: readonly ExcludedHavocCast[];
  readonly coverage: HavocDecisionCoverage;
  readonly domains: HavocDomainResults;
  readonly build: HavocBuildResolution;
  /** The resolver's diagnostics at each eligible decision, by position. */
  readonly resolved: readonly {
    readonly position: number;
    readonly diagnostics: HavocResolverDiagnostics;
    readonly auras: readonly HavocAuraBinding[];
    readonly reaversGlaive: ReaversGlaiveReadinessFact["state"];
    readonly cooldowns: readonly HavocCooldownDiagnostics[];
    readonly selection: HavocSelectionDiagnostics;
    readonly unselectability: HavocUnselectabilityDiagnostics;
    /**
     * Every supported unobserved token's positive usability conclusion at this
     * decision (M11-C4i), with every dimension's evidence: what a coaching
     * layer needs to say WHY an alternative was definitely available.
     */
    readonly positiveUsability: readonly PositiveUsability[];
  }[];
}

export type HavocDemonHunterAnalysis = SpecAnalysisEnvelope<
  typeof HAVOC_DEMON_HUNTER_SPEC_ID,
  HavocDemonHunterPayload
>;

export interface HavocAnalysisInput extends SpecAnalysisInput {
  /** The registration's authority access; omitted, the standalone access over the SAME bindings. */
  readonly authority?: AuthorityAccess;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unsupported(
  status: Exclude<AnalysisStatus, "ANALYZED">,
  specId: string,
  detail: string,
): HavocDemonHunterAnalysis {
  return { status, specId, detail };
}

function tally<T extends string>(order: readonly T[], counts: ReadonlyMap<T, number>): readonly CountOf<T>[] {
  const rows: CountOf<T>[] = [];
  for (const key of order) {
    const count = counts.get(key) ?? 0;
    if (count > 0) rows.push({ key, count });
  }
  return rows;
}

/** A tally over an open key space, in first-seen order. */
function tallyOpen(counts: ReadonlyMap<string, number>): readonly CountOf<string>[] {
  return [...counts].map(([key, count]) => ({ key, count }));
}

function bump(counts: Map<string, number>, key: string): void {
  counts.set(key, (counts.get(key) ?? 0) + 1);
}

/** The actor's combatant snapshot: talents, or `null` when none was captured. */
function combatantSnapshotFor(
  state: CombatState,
  actorId: number,
): { readonly talents: readonly ObservedTalentEntry[] } | null {
  for (const position of state.positionsOfKind("COMBATANT_INFO")) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "COMBATANT_INFO") continue;
    if (event.snapshot.actorId !== actorId) continue;
    return { talents: event.snapshot.talentTree.map((entry) => ({ id: entry.id, nodeId: entry.nodeId })) };
  }
  return null;
}

function metadataOf(authority: AplAuthority): AnalysisAuthorityMetadata {
  const { artifact } = authority;
  const { provenance } = artifact;
  return {
    authorityId: artifact.authorityId,
    artifactRevision: artifact.artifactRevision,
    repository: provenance.repository,
    branch: provenance.branch,
    commitSha: provenance.commitSha,
    sourcePath: provenance.sourcePath,
    sourceSha256: provenance.sourceSha256,
    specName: artifact.spec.specName,
    className: artifact.spec.className,
  };
}

function stepLabel(step: { listName: string; priorityOrdinal: number; actionToken: string }): string {
  return `${step.listName}[${String(step.priorityOrdinal)}] ${step.actionToken}`;
}

function selectionDiagnosticsOf(outcome: HavocFirstGcdQueryOutcome): HavocSelectionDiagnostics {
  const { result, rootScan } = outcome;
  // Only a selection carries its selecting step (a converged token names no
  // single entry); narrowing on the field keeps this module out of the
  // enumerated readers of the result vocabulary.
  const selectingStep = "selectingStep" in result ? result.selectingStep : null;
  const root = {
    rootScanBlockedAt: rootScan.blockedStep,
    rootScanBlocker: rootScan.blocker,
    dispatches: rootScan.dispatches,
    stoppingPoint: rootScan.stoppingPoint,
    undecidedCandidates: rootScan.undecidedCandidates,
    selectedEntry: selectingStep === null ? null : stepLabel(selectingStep),
    selectedEntryAction: selectingStep === null ? null : selectingStep.actionStringVerbatim,
  };
  if (result.kind !== "ROTATIONAL_GCD_UNKNOWN")
    return { kind: result.kind, blockedAt: null, detail: null, ...root };
  const step = result.blockedAt;
  return {
    kind: result.kind,
    blockedAt: step === null ? null : stepLabel(step),
    detail: result.detail,
    ...root,
  };
}

function unselectabilityDiagnosticsOf(
  result: ObservedActionUnselectability,
): HavocUnselectabilityDiagnostics {
  if (result.proven) return { proven: true, refusal: null, at: null };
  return {
    proven: false,
    refusal: result.refusal,
    at: result.at === null ? null : `${result.at.listName}[${String(result.at.priorityOrdinal)}]`,
  };
}

/** One derived cooldown, reduced to what evidence needs. */
function cooldownDiagnosticsOf(entry: HavocTokenCooldown): HavocCooldownDiagnostics {
  return {
    simcToken: entry.simcToken,
    readiness: entry.readiness,
    readinessAbilityGameId: entry.readinessAbilityGameId,
    remainsSeconds: entry.remainsSeconds,
    perAbility: entry.perAbility.map((derived) => ({
      abilityGameId: derived.abilityGameId,
      effectiveBase: derived.effectiveBase,
      cooldown:
        derived.cooldown.state === "UNKNOWN"
          ? {
              state: "UNKNOWN",
              reason: derived.cooldown.reason,
              anchorPosition: derived.cooldown.anchor?.position ?? null,
            }
          : {
              state: derived.cooldown.state,
              atLeastRemainingMs:
                derived.cooldown.state === "EXACT"
                  ? derived.cooldown.remainingMs
                  : derived.cooldown.atLeastRemainingMs,
              baseCooldownMs: derived.cooldown.baseCooldownMs,
              elapsedMs: derived.cooldown.elapsedMs,
              anchorPosition: derived.cooldown.anchor.position,
              anchorLocator: derived.cooldown.anchor.locator,
            },
    })),
  };
}

/** Every modelled talent's three-way resolution, by name. UNKNOWN is a refusal, kept as one. */
function resolveAllModelledTalents(
  observedTalents: readonly ObservedTalentEntry[],
): Readonly<Record<string, TalentResolution>> {
  const talents: Record<string, TalentResolution> = {};
  for (const simcName of havocModelledTalentNames()) {
    talents[simcName] = resolveHavocTalent(observedTalents, simcName);
  }
  return talents;
}

/** The talents proven not taken: the three-way rule, and the resolved tree's own proof. */
function talentsProvenAbsentFrom(
  talents: Readonly<Record<string, TalentResolution>>,
  heroTree: HeroTreeResolution,
): ReadonlySet<string> {
  const absent = new Set<string>();
  for (const [name, resolution] of Object.entries(talents)) {
    if (resolution.selection === "NOT_SELECTED") absent.add(name);
  }
  if (felScarredDisproved(heroTree)) {
    absent.add("demonsurge");
    absent.add(VIOLENT_TRANSFORMATION);
  }
  if (heroTree.state === "RESOLVED" && heroTree.simcName === "felscarred") absent.add("art_of_the_glaive");
  return absent;
}

/** What `AtomBindings.knownTalents` may state: never an UNKNOWN. */
function knownTalentsFrom(
  talents: Readonly<Record<string, TalentResolution>>,
  absent: ReadonlySet<string>,
): readonly { readonly name: string; readonly taken: boolean }[] {
  const known = new Map<string, boolean>();
  for (const [name, resolution] of Object.entries(talents)) {
    if (resolution.selection === "SELECTED") known.set(name, true);
  }
  for (const name of absent) if (!known.has(name)) known.set(name, false);
  return [...known].map(([name, taken]) => ({ name, taken }));
}

// ---------------------------------------------------------------------------
// The facade
// ---------------------------------------------------------------------------

/**
 * Analyses one Havoc Demon Hunter's observed rotational decisions.
 *
 * Decisions are enumerated MECHANICALLY from the normalized fight — every
 * COMPLETE cast by the actor, through M4's own source-actor index, in
 * canonical order. Nothing here indexes the event array, nothing treats an
 * ingestion ordinal as a position, and no timestamp is hard-coded.
 */
export function analyzeObservedHavocDemonHunterDecisions(
  input: HavocAnalysisInput,
): HavocDemonHunterAnalysis {
  const { state, actorId, specId } = input;

  // ---- spec gate, before any Havoc rule runs ----
  if (specId !== HAVOC_DEMON_HUNTER_SPEC_ID) {
    return unsupported(
      "SPEC_NOT_SUPPORTED",
      specId,
      `This evaluator supports '${HAVOC_DEMON_HUNTER_SPEC_ID}' only. No gameplay evaluation was attempted for this specialization.`,
    );
  }

  const access = input.authority ?? standaloneHavocAuthorityAccess();
  const offensive = access.forDomain("OFFENSIVE_ROTATION");
  if (offensive.outcome !== "AUTHORITY_AVAILABLE") {
    return unsupported(
      "AUTHORITY_NOT_AVAILABLE",
      specId,
      "The pinned SimulationCraft Havoc Demon Hunter authority artifact could not be resolved, so no offensive decision was evaluated.",
    );
  }
  const authority = offensive.authority;

  const snapshot = combatantSnapshotFor(state, actorId);
  if (snapshot === null) {
    return unsupported(
      "PROFILE_NOT_RESOLVED",
      specId,
      "No combatant profile was resolved for this actor, so build facts and action applicability could not be established.",
    );
  }

  // ---- build facts, resolved once ----
  const observedTalents = snapshot.talents;
  const talents = resolveAllModelledTalents(observedTalents);
  const heroTree = resolveHavocHeroTree(observedTalents);

  // ---- the validated-profile gate (ONB-A1P), before any decision is read ----
  const profile = havocValidatedProfile(heroTree);
  if (!profile.supported) {
    return unsupported(profile.status, specId, profile.detail);
  }

  const talentsProvenAbsent = talentsProvenAbsentFrom(talents, heroTree);
  const buildFacts: HavocBuildFacts = { talents, talentsProvenAbsent };
  const build: HavocBuildResolution = {
    talents,
    heroTree,
    talentsProvenAbsent: [...talentsProvenAbsent],
  };
  const knownTalents = knownTalentsFrom(talents, talentsProvenAbsent);
  const demonsurge = talents["demonsurge"] ?? resolveHavocTalent(observedTalents, "demonsurge");
  const tokens = havocTokenByAbilityId();

  const comparisons: ObservedActionComparison[] = [];
  const excluded: ExcludedHavocCast[] = [];
  const gcdDistribution = new Map<string, number>();
  const resolved: HavocDemonHunterPayload["resolved"][number][] = [];

  for (const position of state.positionsBySourceActor(actorId)) {
    const event = state.eventAt(position);
    if (event === null || event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    if (event.source?.actorId !== actorId) continue;
    const abilityGameId = event.abilityGameId;
    if (abilityGameId === null) continue;

    const exclude = (reason: HavocExclusionReason): void => {
      excluded.push({
        position,
        locator: event.locator,
        abilityGameId,
        reportTimeMs: event.reportTimeMs,
        reason,
      });
    };

    if (event.isMelee === true) {
      exclude("MELEE_SWING");
      continue;
    }

    const lane = havocExecutionLaneForAbility(abilityGameId);
    const baseGcdMs = havocBaseGcdMsForAbility(abilityGameId);
    bump(gcdDistribution, `${lane} | ${baseGcdMs === null ? "no record" : `${String(baseGcdMs)} ms`}`);
    if (lane === "NON_GCD") {
      exclude("NON_GCD_ACTION");
      continue;
    }
    if (lane === "UNKNOWN_LANE") {
      exclude("EXECUTION_LANE_NOT_ESTABLISHED");
      continue;
    }
    const observedToken = tokens.get(abilityGameId);
    if (observedToken === undefined) {
      exclude("NO_AUTHORITY_TOKEN_BINDING");
      continue;
    }
    if ((OUTSIDE_FIRST_SLICE_TOKENS as readonly string[]).includes(observedToken)) {
      exclude("OUTSIDE_FIRST_SLICE");
      continue;
    }

    const targetActorId = input.targetActorId ?? event.target?.actorId ?? null;
    const decision: ObservedRotationalDecision = {
      position,
      locator: event.locator,
      actorId,
      abilityGameId,
      observedToken,
      reportTimeMs: event.reportTimeMs,
      fightTimeMs: event.fightTimeMs,
      targetActorId,
    };

    // ---- bindings: only what is POSITIVELY established ----
    const auras = bindSupportedHavocAuras({
      state,
      actorId,
      position,
      talentsProvenAbsent,
      decisionReportTimeMs: event.reportTimeMs,
      observedToken,
    });
    const cooldowns = deriveSupportedHavocCooldowns({ state, actorId, position, observedTalents });
    const reaversGlaive = reaversGlaiveReadinessFact(auras, event.reportTimeMs);
    const positiveUsability = resolveHavocPositiveUsability(
      {
        actorId,
        authority,
        buildFacts,
        reaversGlaive,
        observedAbilityGameId: abilityGameId,
        observedLocator: event.locator,
        observedTargetActorId: event.target?.actorId ?? null,
        decisionTargetActorId: targetActorId,
      },
      observedToken,
    );
    const ownFury = ownCastResourceAt(state, { position, actorId, resourceId: "FURY" });
    const resolution = resolveHavocAtoms({
      heroTree,
      demonsurge,
      fury:
        ownFury.state === "EXACT_PRE_COST"
          ? exactFury(ownFury.amount)
          : unknownNumber("STATE_NOT_ESTABLISHED"),
      buffUp: havocBuffUpByName(auras),
      cooldownProvenDown: havocCooldownsProvenDown(cooldowns),
    });
    const bindings: AtomBindings = {
      comboPoints: unknownNumber("STATE_NOT_MODELLED"),
      comboPointsDeficit: unknownNumber("STATE_NOT_MODELLED"),
      energyPct: unknownNumber("STATE_NOT_MODELLED"),
      knownBuffs: havocBuffBindingsFrom(auras),
      knownTalents,
      knownCooldownRemainsSeconds: havocCooldownBindingsFrom(cooldowns),
      specAtoms: resolution.specAtoms,
    };

    const readiness: HavocReadinessFact[] = cooldowns.map((entry) => ({
      simcToken: entry.simcToken,
      readiness: entry.readiness,
      abilityGameId: entry.readinessAbilityGameId,
    }));

    const outcome = havocFirstGcdSelectionAt({
      authority,
      bindings,
      buildFacts,
      observedAbilityGameId: abilityGameId,
      readiness,
      reaversGlaive,
      positiveUsability,
    });

    // Havoc's own proof that the authority could not have selected the observed
    // action here, across every list (`observed-action-gate.ts`).
    const unselectable = proveObservedActionUnselectable({ authority, observedToken, bindings, buildFacts });

    resolved.push({
      position,
      diagnostics: resolution.diagnostics,
      auras,
      reaversGlaive: reaversGlaive.state,
      cooldowns: cooldowns.map(cooldownDiagnosticsOf),
      selection: selectionDiagnosticsOf(outcome),
      unselectability: unselectabilityDiagnosticsOf(unselectable),
      positiveUsability: [...positiveUsability.values()],
    });

    comparisons.push(
      compareObservedAction({
        decision,
        authorityResult: outcome.result,
        observedActionJudgment: null,
        observedActionUnselectable: unselectable.proven ? unselectable.proof : null,
        usabilityProvenance: "OBSERVED_EXECUTION",
      }),
    );
  }

  return {
    status: "ANALYZED",
    specId: HAVOC_DEMON_HUNTER_SPEC_ID,
    authority: metadataOf(authority),
    comparisons,
    excluded,
    coverage: summarizeHavocDecisions(actorId, comparisons, excluded, resolved, gcdDistribution),
    domains: havocDomainResults(access, state.fight.completeness.categories.INTERRUPTS.capability),
    build,
    resolved,
  };
}

/** The label the tallies use when a root scan resolved. */
export const ROOT_SCAN_RESOLVED = "(root scan resolved)";

/** The census key of one aura binding. */
export function auraEvidenceKeyOf(binding: HavocAuraBinding): string {
  if (binding.state === "UNBOUND") return `${binding.atomName} | ${binding.reason}`;
  return `${binding.atomName} | up ${String(binding.up)} (${binding.proof})`;
}

/** The census key of one positive usability conclusion: PROVEN_USABLE, or the FIRST unresolved dimension. */
export function positiveUsabilityKeyOf(conclusion: PositiveUsability): string {
  if (conclusion.kind === "PROVEN_USABLE") return `${conclusion.simcToken} | PROVEN_USABLE`;
  const first = conclusion.unresolved[0];
  const resolution = first === undefined ? undefined : conclusion.dimensions[first];
  const reason = resolution?.state === "UNKNOWN" ? resolution.reason : "?";
  return `${conclusion.simcToken} | NOT_PROVEN: ${String(first)}(${reason})`;
}

/** The census key of one token's derived readiness. */
export function cooldownReadinessKeyOf(entry: HavocCooldownDiagnostics): string {
  return `${entry.simcToken} | ${entry.readiness.state === "PROVEN_NOT_READY" ? entry.readiness.state : entry.readiness.reason}`;
}

/** Counts the comparisons. The three outcomes partition the eligible decisions exactly. */
export function summarizeHavocDecisions(
  actorId: number,
  comparisons: readonly ObservedActionComparison[],
  excluded: readonly ExcludedHavocCast[],
  resolved: HavocDemonHunterPayload["resolved"],
  gcdDistribution: ReadonlyMap<string, number> = new Map(),
): HavocDecisionCoverage {
  let match = 0;
  let rejected = 0;
  let unknown = 0;
  let exactEntryMatches = 0;
  let tokenConvergedMatches = 0;
  const precision = new Map<DecisionCoverage, number>();
  const bases = new Map<ComparisonBasis, number>();
  const blockers = new Map<DecisionBlockerClass, number>();
  const exclusions = new Map<HavocExclusionReason, number>();
  const eligibleTokens = new Map<string, number>();
  const unresolvedAt = new Map<string, number>();
  const stoppingEntries = new Map<string, number>();
  const stoppingAtoms = new Map<string, number>();
  const dispatchOutcomes = new Map<string, number>();
  const undecidedGcdCandidates = new Map<string, number>();
  const undecidedNonGcdCandidates = new Map<string, number>();
  const auraEvidence = new Map<string, number>();
  const reaversGlaiveEvidence = new Map<string, number>();
  const cooldownReadiness = new Map<string, number>();
  const positiveUsability = new Map<string, number>();

  comparisons.forEach((comparison, index) => {
    bump(eligibleTokens, comparison.decision.observedToken);
    precision.set(comparison.authorityCoverage, (precision.get(comparison.authorityCoverage) ?? 0) + 1);
    if (comparison.outcome === "MATCH") {
      match += 1;
      if (comparison.selectionPrecision === "EXACT_ENTRY") exactEntryMatches += 1;
      if (comparison.selectionPrecision === "TOKEN_CONVERGED") tokenConvergedMatches += 1;
    } else if (comparison.outcome === "REJECTED") {
      rejected += 1;
    } else {
      unknown += 1;
      bases.set(comparison.basis, (bases.get(comparison.basis) ?? 0) + 1);
      if (comparison.decisiveBlocker !== null) {
        blockers.set(comparison.decisiveBlocker, (blockers.get(comparison.decisiveBlocker) ?? 0) + 1);
      }
      const at = resolved[index]?.selection.blockedAt ?? "(no entry)";
      bump(unresolvedAt, `${comparison.rawBlocker ?? "(no blocker)"} @ ${at}`);
    }
  });
  for (const cast of excluded) exclusions.set(cast.reason, (exclusions.get(cast.reason) ?? 0) + 1);
  for (const entry of resolved) {
    const { stoppingPoint, dispatches } = entry.selection;
    if (stoppingPoint === null) {
      bump(stoppingEntries, ROOT_SCAN_RESOLVED);
    } else {
      bump(stoppingEntries, stoppingPoint.at);
      for (const atom of stoppingPoint.atoms) bump(stoppingAtoms, `${stoppingPoint.at} | ${atom}`);
    }
    for (const dispatch of dispatches) {
      bump(dispatchOutcomes, `${dispatch.at} -> ${dispatch.calleeListName ?? "?"} : ${dispatch.outcome}`);
    }
    for (const candidate of entry.selection.undecidedCandidates) {
      const target = candidate.lane === "GCD_CONSUMING" ? undecidedGcdCandidates : undecidedNonGcdCandidates;
      for (const atom of candidate.atoms) bump(target, `${candidate.at} | ${atom}`);
    }
    for (const binding of entry.auras) bump(auraEvidence, auraEvidenceKeyOf(binding));
    bump(reaversGlaiveEvidence, entry.reaversGlaive);
    for (const cooldown of entry.cooldowns) bump(cooldownReadiness, cooldownReadinessKeyOf(cooldown));
    for (const conclusion of entry.positiveUsability)
      bump(positiveUsability, positiveUsabilityKeyOf(conclusion));
  }

  return {
    actorId,
    eligibleDecisions: comparisons.length,
    match,
    rejected,
    unknown,
    resolvedComparisons: match + rejected,
    exactEntryMatches,
    tokenConvergedMatches,
    selectionPrecision: tally(DECISION_COVERAGES, precision),
    unknownBases: tally(COMPARISON_BASES, bases),
    unknownBlockerClasses: tally(DECISION_BLOCKER_CLASSES, blockers),
    exclusions: tally(HAVOC_EXCLUSION_REASONS, exclusions),
    excludedCastCount: excluded.length,
    eligibleTokens: tallyOpen(eligibleTokens),
    unresolvedAt: tallyOpen(unresolvedAt),
    stoppingEntries: tallyOpen(stoppingEntries),
    stoppingAtoms: tallyOpen(stoppingAtoms),
    dispatchOutcomes: tallyOpen(dispatchOutcomes),
    undecidedGcdCandidates: tallyOpen(undecidedGcdCandidates),
    undecidedNonGcdCandidates: tallyOpen(undecidedNonGcdCandidates),
    auraEvidence: tallyOpen(auraEvidence),
    reaversGlaiveEvidence: tallyOpen(reaversGlaiveEvidence),
    cooldownReadiness: tallyOpen(cooldownReadiness),
    positiveUsability: tallyOpen(positiveUsability),
    gcdDistribution: tallyOpen(gcdDistribution),
  };
}
