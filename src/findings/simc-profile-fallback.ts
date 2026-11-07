/**
 * The encounter state one decision reads, by precedence (SIMC-FB-A; agent/architecture.md "Owner
 * decision (2026-11-06): SimC profile fallback").
 *
 *     1  observed or proven fight evidence, when sufficient
 *     2  approved curated encounter authority, if one exists
 *     3  the pinned SimulationCraft profile, when the first two cannot establish the fact
 *     4  UNKNOWN, when none of them can answer
 *
 * Tier 3 answers "under the pinned profile and environment, what would the authoritative list read
 * here?" It never says what the real encounter held, and everything it binds carries a
 * `SIMC_PROFILE_FALLBACK` provenance that names no Warcraft Logs source.
 *
 * WHEN TIER 3 APPLIES TO THE ENEMY COUNT. Only when the first two left it open: a positive lower bound
 * at or below the profile's count with no upper bound, or no positive member at all. Otherwise:
 *
 *     a lower bound above the profile's count   contradiction: the bound stands, so 2 makes
 *                                               `active_enemies=1` FALSE and leaves `>=3` UNKNOWN
 *     a curated upper bound                     the two-sided range stands
 *     an unreadable set or conflicting proofs   UNKNOWN stands: nothing shows the gap is only a gap
 *     the subject's auras or damage not fully   UNKNOWN stands, or the bound: a failed page is missing
 *     retrieved from the pull's start to D      evidence that could contradict, not an unobservable gap
 *
 * WHAT A CONTRADICTION TAKES AWAY. Every fact that rests on the profile's enemy count: `active_enemies`,
 * `spell_targets`, the target domain and the add and pull schedule. A proven enemy says nothing about
 * `spell_targets`, whose geometry is action-owned, so that stays unbound rather than reading the bound.
 * The fight style and other scheduled events do not rest on the count, and stay.
 *
 * `target_if`. The profile's universe is its one target. A candidate's reads are the base bindings,
 * because at the pin `select_target` starts from the player's own target: it is read as the player's
 * real target at the decision, through exactly what an ordinary line reads, and an atom the
 * specialization did not bind stays undecided. Observed actors are never candidates, and no order
 * exists to invent.
 *
 * WHY READINESS IS ATTESTED. Whether the chosen target is certain depends on `target_list()`, and at the
 * pin 21 `available_targets` overrides and 48 `target_filter_callback` assignments can change it for
 * one action. That is action-owned, so a specialization attests each `target_if` action with a citation
 * (`SoleTargetAttestation`). An unattested action gets no domain, and its line reads as it did before.
 *
 * BUILD. Tier 3 needs a proven build the dataset lists, and a record whose pin is the list's. Otherwise
 * nothing is bound.
 *
 * ACTIONABILITY IS NOT HERE. This answers APL inputs. It makes no decision ACTIONABLE, and an observed
 * intermission or unavailability stands.
 *
 * OPT-IN. Nothing calls this unless a specialization does, and a caller that declares none of these
 * atoms gains nothing.
 */

import type { CombatFight } from "../engine/normalization/combat-fight.js";
import { enemySetAt, type EnemySetState } from "../engine/game-state/enemies/enemy-set.js";
import { inclusiveRange } from "../engine/evidence/coverage.js";
import type { CombatState } from "../engine/state/combat-state.js";
import { gateAbsenceClaim } from "../engine/state/state-result.js";
import {
  SIMC_PROFILE_ENVIRONMENT,
  type SimcProfileEnvironmentDataset,
  type SimcProfileModel,
  type SimcProfileSemantic,
  type SimcProfileSpecialization,
} from "../data/simc-profile/simc-profile-environment.js";
import { withActiveEnemies, type EnemyCountEvidence } from "../simc/expression/enemy-count.js";
import type { AtomBindings, TargetDomain } from "../simc/expression/evaluate.js";
import {
  profileAtomBinding,
  profileAtomFactOf,
  type ProfileAtomFact,
  type ProfileEnvironment,
} from "../simc/expression/profile-environment-atoms.js";
import type { SpecAtomBinding, SpecAtomBindings } from "../simc/expression/spec-vocabulary.js";
import {
  PRODUCTION_ENCOUNTER_STATE_SUPPLIER,
  type EncounterStateSupplier,
} from "./encounter-state-supplier.js";
import { provenGameBuildOf } from "./proven-fight-build.js";

/** Which authority answered. Tier 3 is never reported as anything but itself. */
export type EncounterStateTier =
  "OBSERVED_OR_PROVEN" | "CURATED" | "SIMC_PROFILE_FALLBACK" | "NOT_ESTABLISHED";

export type SimcProfileFact = "ACTIVE_ENEMIES" | "TARGET_DOMAIN" | ProfileAtomFact;

/** Where one tier-3 binding came from. It names no Warcraft Logs source, because it has none. */
export interface SimcProfileProvenance {
  readonly category: "SIMC_PROFILE_FALLBACK";
  readonly fact: SimcProfileFact;
  /** The atom bound, or `null` for the target domain. */
  readonly atomKey: string | null;
  readonly datasetId: string;
  readonly datasetRevision: string;
  /** The analyzer pin the list and the profile came from. */
  readonly simcCommit: string;
  /** The fight's proven build, and the model whose lines were read for it. */
  readonly clientBuild: string;
  readonly environmentCommit: string;
  readonly aplAuthorityId: string;
  readonly profilePath: string;
  readonly profileSha256: string;
  readonly environment: ProfileEnvironment;
  readonly semantic: SimcProfileSemantic;
}

export type ProfileNotProvenReason =
  /** The fight's build is not proven by the deploy calendar. */
  | "BUILD_UNRESOLVED"
  /** The build is proven, and the dataset holds no model for it. */
  | "BUILD_NOT_COVERED"
  /** The dataset names no profile for this list. */
  | "NO_PROFILE_RECORD"
  /** The list and the dataset come from different pins. */
  | "PIN_MISMATCH"
  /** A profile sets an environment option, which this model does not read. */
  | "PROFILE_SETS_ENVIRONMENT";

export type FallbackNotAppliedReason =
  | ProfileNotProvenReason
  /** The decision's position is not established, so nothing can be read at it. */
  | "POSITION_NOT_ESTABLISHED"
  /** The caller's bindings declare no atoms. */
  | "NO_DECLARED_ATOMS";

/**
 * What the first two tiers left of the count. OPEN means nothing closes it, so the profile may. The
 * last means the events that could prove another enemy were not fully retrieved up to the decision.
 */
export type EnemyCountTierReason =
  | "OPEN"
  | "PROVEN_ABOVE_PROFILE"
  | "CURATED_UPPER_BOUND"
  | "ENEMY_STATE_UNREADABLE"
  | "ENEMY_EVIDENCE_INCOMPLETE";

/** The one profile that may answer for this list on this fight, or why none may. */
export type SimcProfileResolution =
  | {
      readonly state: "PROVEN";
      readonly dataset: SimcProfileEnvironmentDataset;
      readonly model: SimcProfileModel;
      readonly specialization: SimcProfileSpecialization;
      readonly clientBuild: string;
    }
  | { readonly state: "NOT_PROVEN"; readonly reason: ProfileNotProvenReason };

/** The APL authority's identity, structurally. */
export interface AplAuthorityIdentity {
  readonly authorityId: string;
  readonly simcCommit: string;
}

/** The identity of a loaded authority's artifact. */
export function aplAuthorityIdentityOf(authority: {
  readonly artifact: { readonly authorityId: string; readonly provenance: { readonly commitSha: string } };
}): AplAuthorityIdentity {
  return { authorityId: authority.artifact.authorityId, simcCommit: authority.artifact.provenance.commitSha };
}

/** The profile for one list on one fight's build. Never inferred from a date or a nearest build. */
export function resolveSimcProfile(
  dataset: SimcProfileEnvironmentDataset,
  authority: AplAuthorityIdentity,
  fightBuild: string | null,
): SimcProfileResolution {
  const notProven = (reason: ProfileNotProvenReason): SimcProfileResolution => ({
    state: "NOT_PROVEN",
    reason,
  });
  if (fightBuild === null) return notProven("BUILD_UNRESOLVED");
  const model = dataset.models.find((candidate) => candidate.gameDataBuild === fightBuild);
  if (model === undefined) return notProven("BUILD_NOT_COVERED");
  const specialization = dataset.specializations.find(
    (candidate) => candidate.aplAuthorityId === authority.authorityId,
  );
  if (specialization === undefined) return notProven("NO_PROFILE_RECORD");
  if (authority.simcCommit !== dataset.source.analyzerPin) return notProven("PIN_MISMATCH");
  if (specialization.profiles.some((profile) => profile.environmentOptionLines.length > 0)) {
    return notProven("PROFILE_SETS_ENVIRONMENT");
  }
  return { state: "PROVEN", dataset, model, specialization, clientBuild: fightBuild };
}

export interface SimcProfileFallback {
  resolve(authority: AplAuthorityIdentity, fight: CombatFight): SimcProfileResolution;
}

export function createSimcProfileFallback(input: {
  readonly dataset: SimcProfileEnvironmentDataset;
  readonly gameBuildOf: (fight: CombatFight) => string | null;
}): SimcProfileFallback {
  return {
    resolve: (authority, fight) => resolveSimcProfile(input.dataset, authority, input.gameBuildOf(fight)),
  };
}

export const PRODUCTION_SIMC_PROFILE_FALLBACK: SimcProfileFallback = createSimcProfileFallback({
  dataset: SIMC_PROFILE_ENVIRONMENT,
  gameBuildOf: provenGameBuildOf,
});

/**
 * One action's owner stating that, at the pin, its `target_list()` under the profile is the one target
 * and `target_ready` holds on it. A positive claim, so it needs a citation, and one with none counts
 * for nothing.
 */
export interface SoleTargetAttestation {
  readonly simcToken: string;
  readonly provenance: string;
}

export interface EncounterStateQuery {
  readonly authority: AplAuthorityIdentity;
  readonly soleTargetAttestations?: readonly SoleTargetAttestation[];
  readonly fallback?: SimcProfileFallback;
  readonly supplier?: EncounterStateSupplier;
}

export interface EnemyCountReading {
  readonly tier: EncounterStateTier;
  readonly evidence: EnemyCountEvidence;
  /** The observed lower bound beside a tier-3 count, which it does not contradict. */
  readonly observedLowerBound: number;
  readonly reason: EnemyCountTierReason;
}

export interface EncounterStateResolution {
  readonly bindings: AtomBindings;
  readonly enemyCount: EnemyCountReading | null;
  /** Every tier-3 binding made here, in order. Empty when the fallback bound nothing. */
  readonly profileFacts: readonly SimcProfileProvenance[];
  /** Why the fallback was not read at all. `null` when it was. */
  readonly fallbackNotApplied: FallbackNotAppliedReason | null;
}

const SEMANTIC_OF_FACT: Readonly<Record<SimcProfileFact, string>> = {
  ACTIVE_ENEMIES: "ACTIVE_ENEMIES_IS_CONSTANT_ONE",
  TARGET_DOMAIN: "TARGET_IF_WITH_ONE_CANDIDATE",
  FIGHT_STYLE: "FIGHT_STYLE_IS_A_NAME_COMPARISON",
  ADD_AND_PULL_SCHEDULE: "RAID_EVENT_ABSENT_VALUES",
  OTHER_RAID_EVENT_SCHEDULE: "RAID_EVENT_ABSENT_VALUES",
  SPELL_TARGETS: "SPELL_TARGETS_WITHOUT_DISTANCE_TARGETING",
};

/** Whether stronger evidence leaves the count open for the profile, and if not, what holds it. */
function enemyCountTierReason(enemySet: EnemySetState, profileCount: number): EnemyCountTierReason {
  const { count } = enemySet;
  switch (count.kind) {
    case "EXACT":
      return "CURATED_UPPER_BOUND";
    case "BOUNDED":
      if (count.upperBound !== null) return "CURATED_UPPER_BOUND";
      return count.lowerBound > profileCount ? "PROVEN_ABOVE_PROFILE" : "OPEN";
    case "UNKNOWN":
      return count.reason === "NO_POSITIVE_MEMBER" ? "OPEN" : "ENEMY_STATE_UNREADABLE";
  }
}

/** Whether the subject's aura and damage evidence was retrieved from the pull's start to the position. */
function enemyEvidenceRetrieved(state: CombatState, subjectActorId: number, position: number): boolean {
  const resolved = state.resolveTemporalPosition({ anchor: "BEFORE_EVENT", position });
  if (!resolved.ok) return false;
  const range = inclusiveRange(state.fight.fight.startTimeMs, resolved.prefix.boundaryReportTimeMs);
  return (["AURAS", "DAMAGE"] as const).every(
    (category) =>
      gateAbsenceClaim({
        completeness: state.fight.completeness,
        category,
        range,
        actorId: subjectActorId,
      }).ok,
  );
}

function strongerTier(reason: EnemyCountTierReason, count: EnemySetState["count"]): EncounterStateTier {
  if (reason === "CURATED_UPPER_BOUND") return "CURATED";
  return count.kind === "UNKNOWN" ? "NOT_ESTABLISHED" : "OBSERVED_OR_PROVEN";
}

/** The tiers' answer, as `withEnemyCountAt` reads it, with what the fallback may add. */
export function withEncounterStateAt(
  bindings: AtomBindings,
  state: CombatState,
  subjectActorId: number,
  position: number | null,
  query: EncounterStateQuery,
): EncounterStateResolution {
  const fallback = query.fallback ?? PRODUCTION_SIMC_PROFILE_FALLBACK;
  const supplier = query.supplier ?? PRODUCTION_ENCOUNTER_STATE_SUPPLIER;
  const unread = (reason: FallbackNotAppliedReason): EncounterStateResolution => ({
    bindings,
    enemyCount: null,
    profileFacts: [],
    fallbackNotApplied: reason,
  });
  if (bindings.specAtoms === undefined) return unread("NO_DECLARED_ATOMS");
  if (position === null) return unread("POSITION_NOT_ESTABLISHED");
  const specAtoms: SpecAtomBindings = bindings.specAtoms;

  const at = { anchor: "BEFORE_EVENT", position } as const;
  const upperBound = supplier.upperBoundAt(state, at);
  const enemySet = enemySetAt(state, { subjectActorId, at, ...(upperBound === null ? {} : { upperBound }) });
  const observedLowerBound = enemySet.members.length;
  const resolution = fallback.resolve(query.authority, state.fight);

  if (resolution.state !== "PROVEN") {
    // No profile can contradict anything, so nothing is compared with one.
    const reason = enemyCountTierReason(enemySet, Number.POSITIVE_INFINITY);
    return {
      bindings: { ...bindings, specAtoms: withActiveEnemies(specAtoms, enemySet.count) },
      enemyCount: {
        tier: strongerTier(reason, enemySet.count),
        evidence: enemySet.count,
        observedLowerBound,
        reason,
      },
      profileFacts: [],
      fallbackNotApplied: resolution.reason,
    };
  }

  const { dataset, model, specialization, clientBuild } = resolution;
  const environment = dataset.engineDefaultEnvironment;
  const [profile] = specialization.profiles;
  const semanticOf = (fact: SimcProfileFact): SimcProfileSemantic | undefined =>
    model.semantics.find((semantic) => semantic.semanticId === SEMANTIC_OF_FACT[fact]);
  const facts: SimcProfileProvenance[] = [];
  const record = (fact: SimcProfileFact, atomKey: string | null): boolean => {
    const semantic = semanticOf(fact);
    if (semantic === undefined || profile === undefined) return false;
    facts.push({
      category: "SIMC_PROFILE_FALLBACK",
      fact,
      atomKey,
      datasetId: dataset.datasetId,
      datasetRevision: dataset.datasetRevision,
      simcCommit: dataset.source.analyzerPin,
      clientBuild,
      environmentCommit: model.simcCommit,
      aplAuthorityId: specialization.aplAuthorityId,
      profilePath: profile.path,
      profileSha256: profile.sha256,
      environment,
      semantic,
    });
    return true;
  };

  // ---- the count ----
  const stated = enemyCountTierReason(enemySet, environment.targetCount);
  const reason =
    stated === "OPEN" && !enemyEvidenceRetrieved(state, subjectActorId, position)
      ? "ENEMY_EVIDENCE_INCOMPLETE"
      : stated;
  const open = reason === "OPEN";
  const declaresCount = specAtoms.vocabulary.lookup("active_enemies") !== null;
  const profileCount: EnemyCountEvidence = { kind: "EXACT", count: environment.targetCount };
  const appliesToCount = open && (!declaresCount || record("ACTIVE_ENEMIES", "active_enemies"));
  const counted = withActiveEnemies(specAtoms, appliesToCount ? profileCount : enemySet.count);

  // ---- the other declared atoms ----
  const bound: SpecAtomBinding[] = [];
  for (const declaration of counted.vocabulary.declarations) {
    const fact = profileAtomFactOf(declaration.identifier);
    if (fact === null) continue;
    // A stronger reading the caller already holds, such as an action's own registration, stands.
    if (counted.bound.some((entry) => entry.key === declaration.identifier)) continue;
    if ((fact === "ADD_AND_PULL_SCHEDULE" || fact === "SPELL_TARGETS") && !appliesToCount) continue;
    const binding = profileAtomBinding(declaration, environment);
    if (binding !== null && record(fact, declaration.identifier)) bound.push(binding);
  }

  // ---- the target domain ----
  const attested = new Map(
    (query.soleTargetAttestations ?? [])
      .filter((attestation) => attestation.provenance.length > 0)
      .map((attestation) => [attestation.simcToken, attestation.provenance]),
  );
  const domainAllowed = appliesToCount && attested.size > 0 && record("TARGET_DOMAIN", null);
  const baseDomainFor = bindings.targetDomainFor;
  const targetDomainFor = (actionToken: string): TargetDomain | null => {
    const stated = baseDomainFor?.(actionToken) ?? null;
    if (stated !== null) return stated;
    const provenance = attested.get(actionToken);
    if (provenance === undefined) return null;
    if (supplier.targetDomainClosureAt(state, actionToken, at).closure === "CLOSED") return null;
    return {
      closure: "CLOSED",
      universe: "PROFILE_SOLE_TARGET",
      candidates: [{ key: "SIMC_PROFILE_TARGET", targetReady: "PROVEN_READY", overlay: {} }],
      provenance: `${dataset.datasetRevision}#${SEMANTIC_OF_FACT.TARGET_DOMAIN};${provenance}`,
    };
  };

  return {
    bindings: {
      ...bindings,
      specAtoms: { vocabulary: counted.vocabulary, bound: [...counted.bound, ...bound] },
      ...(domainAllowed ? { targetDomainFor } : {}),
    },
    enemyCount: {
      tier: appliesToCount ? "SIMC_PROFILE_FALLBACK" : strongerTier(reason, enemySet.count),
      evidence: appliesToCount ? profileCount : enemySet.count,
      observedLowerBound,
      reason,
    },
    profileFacts: facts,
    fallbackNotApplied: null,
  };
}
