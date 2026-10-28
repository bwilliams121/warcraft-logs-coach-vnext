/**
 * The SIMULATION ENVIRONMENT (M11-G3-4): the logged fight's environment,
 * reconstructed component by component with the evidence for each.
 *
 * FACTUAL RECONSTRUCTION is kept apart from SIMC TRANSLATION. Nothing in this
 * model is engine text: `translate.ts` is the only place a reconstructed fact
 * becomes a G3-1 `SimulationEnvironmentInput`, and only under the rules there.
 *
 * Every fact is an `Evidenced<T>` (the G3-2 state vocabulary):
 *
 *   KNOWN             observed, or resolved from observed ids via pinned data
 *   KNOWN_NONE        observed absence under a stated contract
 *   UNKNOWN           not established — never absent, never a default, never
 *                     the engine's full raid package, never a pull Lust, never
 *                     an ideal consumable
 *   NOT_APPLICABLE    the question does not arise
 *   MODEL_ASSUMPTION  not observed; a versioned assumption visible in
 *                     provenance, with its own owner-approval state
 *
 * TIMES are FIGHT-RELATIVE milliseconds (0 = the encounter's start).
 *
 * TARGETS: an OBSERVED_ENGAGEMENT_SPAN (first/last observed hit) is an
 * observation summary. It is never a SIMULATED_TARGET_AVAILABLE_INTERVAL, and
 * nothing here converts one into the other.
 */

import type { Evidenced, ModelAssumption } from "../character-profile/profile.js";
import type { RAID_BUFFS, TANK_MODELS } from "../simulation/job.js";

export const ENVIRONMENT_RECONSTRUCTION_SCHEMA_VERSION = "simulation-environment-reconstruction/1";

export type RaidBuffName = (typeof RAID_BUFFS)[number];
export type TankModelId = (typeof TANK_MODELS)[number];

export interface EnvironmentAssumption extends ModelAssumption {
  /** Only an OWNER_APPROVED assumption may stand in a publishable environment. */
  readonly approval: "OWNER_APPROVED" | "PENDING_OWNER_APPROVAL";
}

// ---------------------------------------------------------------------------
// Duration
// ---------------------------------------------------------------------------

export interface FightInterval {
  readonly startReportMs: number;
  readonly endReportMs: number;
  readonly durationMs: number;
}

export interface DurationComponent {
  readonly interval: Evidenced<FightInterval>;
  readonly finality: "COMPLETED" | "IN_PROGRESS" | "UNKNOWN";
  /** The simulated APL knows the exact fight end: RETROSPECTIVE_EXACT_FIGHT_END@1, never observed knowledge. */
  readonly fightEndKnowledge: Evidenced<"EXACT_FIGHT_END">;
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

/** First/last observed hit and the largest silence between hits. An observation, not an interval of anything. */
export interface ObservedEngagementSpan {
  readonly kind: "OBSERVED_ENGAGEMENT_SPAN";
  readonly observer: "SUBJECT_AND_OWNED_PETS_DAMAGE";
  readonly firstObservedMs: number;
  readonly lastObservedMs: number;
  readonly observationCount: number;
  readonly largestGapMs: number;
}

/** A descriptive grouping of observations separated by more than `OBSERVATION_CLUSTER_GAP_MS`. Not availability. */
export interface ObservationCluster {
  readonly firstObservedMs: number;
  readonly lastObservedMs: number;
  readonly observationCount: number;
}

export interface SimulatedTargetAvailableInterval {
  readonly kind: "SIMULATED_TARGET_AVAILABLE_INTERVAL";
  readonly fromMs: number;
  readonly toMs: number;
}

export type AvailabilitySource =
  | "TARGETABILITY"
  | "ENCOUNTER_PHASES"
  | "SUMMONS"
  | "DEATHS"
  | "OBSERVED_ENGAGEMENT"
  | "ACTOR_CATALOG"
  /** A recorded, owner-authorized live investigation of this fight's Warcraft Logs surfaces. */
  | "WCL_INVESTIGATION"
  /** A recorded read-only audit of pinned encounter/game data for a deterministic add schedule. */
  | "PINNED_ENCOUNTER_DATA";

export type AvailabilitySourceStatus =
  /** The evidence category's capability is not established for this fight. */
  | "CAPABILITY_NOT_ESTABLISHED"
  /** The retrieved evidence does not vouch for this actor. */
  | "OUT_OF_SCOPE"
  /** No metadata exists for this encounter. */
  | "NO_METADATA"
  /** The surface exists but its semantics cannot establish availability. */
  | "NOT_AVAILABILITY_EVIDENCE"
  /** At most an end boundary (a death), never a start. */
  | "ENDPOINT_ONLY"
  /** An investigation found no surface whose semantics establish an availability boundary. */
  | "AUTHORITY_NOT_FOUND";

export interface AvailabilitySourceAudit {
  readonly source: AvailabilitySource;
  readonly status: AvailabilitySourceStatus;
  readonly detail: string;
}

export interface PrimaryTargetComponent {
  /** Encounter metadata (WCL_BOSS_SUBTYPE) only: not targetability, attackability or hostility. */
  readonly identity: Evidenced<{ readonly actorId: number; readonly gameId: number | null }>;
  /** Present for the whole fixed encounter: a MODEL_ASSUMPTION unless proven. */
  readonly availability: Evidenced<"WHOLE_ENCOUNTER">;
  readonly engagement: ObservedEngagementSpan | null;
  readonly availabilityEvidence: readonly AvailabilitySourceAudit[];
}

export interface TargetCandidate {
  readonly actorId: number;
  readonly gameId: number | null;
  readonly engagement: ObservedEngagementSpan | null;
  readonly observedClusters: readonly ObservationCluster[];
  readonly availabilityEvidence: readonly AvailabilitySourceAudit[];
  readonly availability: Evidenced<readonly SimulatedTargetAvailableInterval[]>;
}

export interface TargetScheduleComponent {
  /** NPC actors the subject or its owned pets were observed damaging, other than the primary target. */
  readonly candidates: readonly TargetCandidate[];
  /** The additional targets to simulate. KNOWN only from availability evidence; UNKNOWN otherwise. */
  readonly schedule: Evidenced<
    readonly {
      readonly gameId: number | null;
      readonly intervals: readonly SimulatedTargetAvailableInterval[];
    }[]
  >;
}

// ---------------------------------------------------------------------------
// Raid buffs and Bloodlust
// ---------------------------------------------------------------------------

export type RaidBuffPresence =
  | {
      readonly kind: "WHOLE_FIGHT";
      readonly auraSpellId: number;
      readonly sourceActorId: number | null;
      readonly refreshedAtMs: readonly number[];
    }
  | {
      readonly kind: "TIMED";
      readonly auraSpellId: number;
      readonly transitions: readonly { readonly atMs: number; readonly operation: string }[];
    };

export interface RaidBuffEntry {
  readonly override: RaidBuffName;
  readonly side: "PLAYER_AURA" | "TARGET_DEBUFF";
  readonly auraSpellIds: readonly number[];
  readonly presence: Evidenced<RaidBuffPresence>;
}

export interface LustApplication {
  readonly spellId: number;
  readonly equivalence: "ENGINE_BLOODLUST_EQUIVALENT" | "NOT_EQUIVALENT";
  readonly sourceActorId: number | null;
  readonly startMs: Evidenced<number>;
  readonly endMs: Evidenced<number>;
}

export interface BloodlustComponent {
  readonly applications: Evidenced<readonly LustApplication[]>;
  /** Sated-family debuffs observed on the subject (a lockout, not a lust). */
  readonly satedObservations: readonly { readonly spellId: number; readonly atMs: number }[];
}

// ---------------------------------------------------------------------------
// Consumables
// ---------------------------------------------------------------------------

export interface ConsumableIdentity {
  readonly spellId: number;
  readonly itemIds: readonly number[];
}

/** A rank is the item level shared by every pinned item that applies the aura. */
export interface ConsumableRank {
  readonly itemLevel: number;
}

/**
 * One PLAUSIBLE rank of an identified consumable (pinned data): its item
 * level, the engine token that selects it, and whether that selection is
 * unambiguous at the pin. The complete set is the rank-uncertainty envelope.
 */
export interface RankOption {
  readonly itemLevel: number;
  readonly token: string;
  readonly representable: boolean;
}

export type SetupConsumableKind = "FLASK" | "FOOD" | "AUGMENTATION";

export interface SetupConsumable {
  readonly kind: SetupConsumableKind;
  readonly identity: Evidenced<ConsumableIdentity>;
  /** Several items (quality ranks) may apply one aura: identity does not prove rank. */
  readonly rank: Evidenced<ConsumableRank>;
  /** Every plausible rank, each with its engine representation; empty when identity is not KNOWN. */
  readonly rankOptions: readonly RankOption[];
  readonly presence: Evidenced<"WHOLE_FIGHT">;
  /** For an UNKNOWN identity: subject-sourced pull auras no pinned table names (possible candidates, never resolved). */
  readonly unclassifiedCandidates: readonly number[];
}

export interface PotionUse {
  readonly activeFromMs: Evidenced<number>;
  readonly activeToMs: Evidenced<number>;
}

/**
 * Identity (what was available) is kept apart from timed use (when).
 *
 * Owner policy (M11-G3-4): a current-setup simulation uses the ACTUAL potion
 * identity/availability and the elite APL's TIMING. The observed uses are
 * factual evidence for later causal analysis; they are never replayed.
 */
export interface PotionComponent {
  readonly identity: Evidenced<ConsumableIdentity>;
  readonly rank: Evidenced<ConsumableRank>;
  readonly rankOptions: readonly RankOption[];
  readonly timingPolicy: "ELITE_APL_TIMING";
  /** The potion's observed aura intervals on the subject — evidence, not simulation input. */
  readonly uses: Evidenced<readonly PotionUse[]>;
  /** The subject's own potion casts, verbatim (fight-relative). */
  readonly castsAtMs: readonly number[];
}

export interface TemporaryEnchantComponent {
  readonly slot: "main_hand" | "off_hand";
  readonly enchant: Evidenced<{ readonly enchantId: number; readonly engineToken: string | null }>;
  readonly persistence: Evidenced<"WHOLE_FIGHT">;
}

export interface ConsumablesComponent {
  readonly setup: readonly SetupConsumable[];
  readonly potion: PotionComponent;
  readonly temporaryEnchants: readonly TemporaryEnchantComponent[];
}

// ---------------------------------------------------------------------------
// Pull auras, tank load
// ---------------------------------------------------------------------------

export type PullAuraClass =
  | "RAID_BUFF"
  | "LUST_FAMILY"
  | "SATED"
  | "CONSUMABLE"
  | "CHARACTER_TALENT"
  /** Subject-sourced, and no pinned table names it: an unmodelled setup effect is possible. */
  | "UNCLASSIFIED_SELF"
  /** Ally-sourced, on the owner-approved defensive list (pinned non-offensive effects): excluded under STANDARD_TANK_LOAD_V1. */
  | "DEFENSIVE_ALLY_EXCLUDED"
  /** Ally-sourced and not an engine raid-buff override: the engine has no player-side representation. */
  | "UNCLASSIFIED_ALLY"
  | "UNCLASSIFIED_UNKNOWN_SOURCE";

export interface PullAuraRecord {
  readonly spellId: number;
  readonly sourceRole: "SUBJECT" | "ALLY" | "UNKNOWN";
  readonly classification: PullAuraClass;
}

export interface TankLoadComponent {
  readonly model: TankModelId;
  readonly version: number;
  /** SHA-256 of the canonical generated directives: a change to them is a new revision. */
  readonly revision: string;
  readonly directives: readonly string[];
  readonly load: Evidenced<TankModelId>;
}

// ---------------------------------------------------------------------------
// Environment and reconstruction result
// ---------------------------------------------------------------------------

export type EnvironmentReadiness = "READY" | "PARTIAL" | "NOT_REPRESENTABLE";

export interface EnvironmentEvidenceDocument {
  readonly id: string;
  readonly sha256: string;
}

export interface SimulationEnvironment {
  readonly schemaVersion: typeof ENVIRONMENT_RECONSTRUCTION_SCHEMA_VERSION;
  readonly duration: DurationComponent;
  readonly primaryTarget: PrimaryTargetComponent;
  readonly raidBuffs: readonly RaidBuffEntry[];
  readonly bloodlust: BloodlustComponent;
  readonly consumables: ConsumablesComponent;
  readonly tankLoad: TankLoadComponent;
  readonly targetSchedule: TargetScheduleComponent;
  readonly pullAuras: readonly PullAuraRecord[];
  readonly assumptions: readonly EnvironmentAssumption[];
  /** Provenance only — never part of the semantic environment hash. */
  readonly evidence: {
    readonly subject: { readonly fightRef: string; readonly actorId: number };
    readonly documents: readonly EnvironmentEvidenceDocument[];
  };
  readonly reconstructionStatus: EnvironmentReadiness;
}

export type EnvironmentComponent =
  | "duration"
  | "primaryTarget"
  | "raidBuffs"
  | "bloodlust"
  | "consumables"
  | "tankLoad"
  | "targetSchedule"
  | "pullAuras";

export type EnvironmentIssueCode =
  // Readiness (factual) issues.
  | "DURATION_UNRESOLVED"
  | "PRIMARY_TARGET_UNRESOLVED"
  | "RAID_BUFF_UNKNOWN"
  | "RAID_BUFF_TIMED"
  | "BLOODLUST_TIMING_UNRESOLVED"
  | "BLOODLUST_NOT_EQUIVALENT"
  | "BLOODLUST_MULTIPLE"
  | "CONSUMABLE_UNKNOWN"
  | "CONSUMABLE_RANK_UNRESOLVED"
  | "CONSUMABLE_RANK_NOT_REPRESENTABLE"
  | "TARGET_SCHEDULE_UNRESOLVED"
  | "SETUP_AURA_UNCLASSIFIED"
  /** A specific observed effect the pinned model cannot represent because it is absent from the pinned data. */
  | "PINNED_MODEL_MISSING_OBSERVED_EFFECT"
  | "USER_PROVIDED_INVALID"
  | "USER_PROVIDED_CONFLICT"
  | "EVIDENCE_ACTOR_MISMATCH"
  | "PINNED_DATA_UNAVAILABLE"
  // Diagnostics.
  | "ASSUMPTION_RECORDED"
  | "BLOODLUST_ENGINE_WHOLE_SECOND"
  | "ALLY_AURA_NOT_REPRESENTABLE"
  /** The log postdates the model's data snapshot and no validated applicability window covers the fight. */
  | "MODEL_BUILD_LAG"
  /**
   * Informational only: the log postdates the model's data snapshot, but the
   * fight is inside an explicitly validated applicability window, so model
   * chronology is discharged. Not compatibility uncertainty.
   */
  | "MODEL_SNAPSHOT_PRECEDES_LOG"
  | "OBSERVED_ENGAGEMENT_ONLY"
  | "USER_PROVIDED_RECORDED"
  | "RANK_ENVELOPE_RECORDED"
  | "ENGINE_APPROXIMATION_RECORDED";

/**
 * The simulation model's validated applicability for this fight, as produced
 * by model selection (a spec's production validation whose window contains
 * the fight start). Declared here structurally: the environment does not read
 * the model registry or any spec.
 */
export interface ValidatedModelApplicability {
  readonly modelId: string;
  readonly specKey: string;
  readonly gameBuild: string;
  readonly fightStartUtc: string;
  readonly window: { readonly fromUtc: string; readonly toUtc: string };
  readonly windowBasis: string;
}

export interface EnvironmentIssue {
  readonly code: EnvironmentIssueCode;
  readonly component: EnvironmentComponent;
  readonly detail: string;
}

export interface EnvironmentCheck {
  readonly component: EnvironmentComponent;
  readonly state: "RESOLVED" | "UNRESOLVED" | "NOT_REPRESENTABLE";
  readonly detail: string;
}

export interface EnvironmentReconstructionResult {
  readonly schemaVersion: typeof ENVIRONMENT_RECONSTRUCTION_SCHEMA_VERSION;
  /** Environment readiness says nothing about the character profile's readiness. */
  readonly status: EnvironmentReadiness;
  readonly environment: SimulationEnvironment;
  readonly checks: readonly EnvironmentCheck[];
  /** Every unresolved or unrepresentable fact. Materiality is applied later, by publishability. */
  readonly blockers: readonly EnvironmentIssue[];
  readonly diagnostics: readonly EnvironmentIssue[];
  readonly assumptions: readonly EnvironmentAssumption[];
  readonly provenance: {
    readonly subject: { readonly fightRef: string; readonly actorId: number };
    readonly documents: readonly EnvironmentEvidenceDocument[];
    readonly pinnedData: readonly { readonly datasetId: string; readonly revision: string }[];
    /** Owner-approved, bounded engine approximations applied to observed facts, with both values. */
    readonly engineApproximations: readonly EngineApproximation[];
    readonly model: { readonly simcCommit: string; readonly gameDataBuild: string };
    /** The applicability the caller supplied, and whether it covers THIS model and fight. */
    readonly modelApplicability: {
      readonly supplied: ValidatedModelApplicability | null;
      readonly coversFight: boolean;
    };
  };
}

export interface EngineApproximation {
  readonly id: string;
  readonly observed: string;
  readonly engine: string;
  readonly bound: string;
}

export const known = <T>(
  value: T,
  kind: "WCL_COMBATANTINFO" | "WCL_FIGHT_CONTEXT" | "WCL_EVENTS" | "PINNED_GAME_DATA",
  field: string,
): Evidenced<T> => ({
  state: "KNOWN",
  value,
  source: { kind, field },
});

export const unknownFact = <T>(
  reason: string,
  kind: "WCL_COMBATANTINFO" | "WCL_FIGHT_CONTEXT" | "WCL_EVENTS" | "PINNED_GAME_DATA" | null,
  field: string,
): Evidenced<T> => ({ state: "UNKNOWN", reason, source: kind === null ? null : { kind, field } });

export const assumed = <T>(value: T, assumption: EnvironmentAssumption): Evidenced<T> => ({
  state: "MODEL_ASSUMPTION",
  value,
  assumption: { id: assumption.id, version: assumption.version, statement: assumption.statement },
});
