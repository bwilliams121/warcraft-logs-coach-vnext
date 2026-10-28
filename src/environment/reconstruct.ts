/**
 * RECONSTRUCT the logged fight's environment (M11-G3-4).
 *
 * Inputs are the normalized fight (with its completeness), the subject's pull
 * facts, the subject's temporary-enchant evidence and the spell ids its
 * character profile owns. Every subject-scoped input carries its actor id and
 * a foreign one is refused (EVIDENCE_ACTOR_MISMATCH).
 *
 * Rules that make this fail closed:
 *
 * - A raid buff is KNOWN only from the subject's own aura evidence: on the
 *   pull's combatantinfo aura list, and with no in-fight removal under
 *   COMPLETE subject aura coverage. Raid composition, comparison players and
 *   the engine's raid package never establish one. The pull list is not proven
 *   exhaustive, so a buff missing from it is UNKNOWN, never absent.
 * - Target debuffs live on the primary target; when the retrieved aura
 *   evidence does not vouch for that actor they are UNKNOWN.
 * - Bloodlust is keyed by the pinned lust family, never by name. KNOWN_NONE
 *   needs COMPLETE subject aura coverage, no lust-family transition and no
 *   lockout debuff; a lockout seen without a recognised lust is UNKNOWN.
 * - Consumable identity comes from pinned consumable data; an aura that
 *   identifies a consumable does not identify its rank. An unresolved rank is
 *   carried as its complete set of plausible ranks (each with its engine
 *   token), never chosen. Food and augment rune never default: an explicit
 *   USER_PROVIDED statement may fill an UNKNOWN identity, validated against the
 *   pinned data, and never overrides an observed one.
 * - Potions: actual identity/availability; timing is the elite APL's (owner
 *   policy). Observed uses are kept as evidence only.
 * - Targets: an observed engagement span (first/last hit), catalog membership,
 *   a summon or a death never becomes availability. No approved evidence
 *   source establishes an add's availability, so every candidate's
 *   availability is UNKNOWN and so is the schedule.
 */

import type {
  EvidenceSource,
  Evidenced,
  TemporaryEnchantEvidence,
  UserProvidedProvenance,
} from "../character-profile/profile.js";
import type { CombatantPullFacts } from "../character-profile/pull-facts.js";
import { actorsOwnedBy, bossSubtypeOf } from "../combat-facts/descriptors.js";
import {
  consumableAuraFor,
  defensiveAllyAura,
  engineAcceptsToken,
  isSatedSpell,
  lustFamilyMember,
  raidBuffOverrideForAura,
  spellPresence,
  type ConsumableAura,
  type RaidBuffOverrideIdentity,
  type SimulationModelData,
} from "../data/simulation-models/index.js";
import { inclusiveRange } from "../engine/evidence/coverage.js";
import type { CombatFight } from "../engine/normalization/combat-fight.js";
import type { AuraEvent, CombatEvent } from "../engine/normalization/normalized-events.js";
import { gateAbsenceClaim } from "../engine/state/state-result.js";
import { RAID_BUFFS } from "../simulation/job.js";
import type { EvidenceCategory } from "../wcl/evidence-capability.js";
import {
  BLOODLUST_WHOLE_SECOND_START,
  DEFENSIVE_ALLY_AURAS_EXCLUDED,
  POTION_TIMING_ELITE_APL,
  primaryTargetContinuous,
  RETROSPECTIVE_EXACT_FIGHT_END,
  BOSS_DEBUFF_CERTIFICATION_ATTEMPTS,
  ENCOUNTER_SCHEDULE_AUTHORITY_AUDITS,
  TARGET_AVAILABILITY_INVESTIGATIONS,
  STANDARD_TANK_LOAD,
  TANK_LOAD_REVISIONS,
  TANK_LOAD_VERSION,
  TEMPORARY_ENCHANT_WHOLE_FIGHT,
  UNREPRESENTABLE_ALLY_AURAS_EXCLUDED,
  tankLoadDirectives,
} from "./assumptions.js";
import {
  assumed,
  ENVIRONMENT_RECONSTRUCTION_SCHEMA_VERSION,
  known,
  unknownFact,
  type AvailabilitySourceAudit,
  type BloodlustComponent,
  type ConsumableIdentity,
  type ConsumableRank,
  type ConsumablesComponent,
  type DurationComponent,
  type EngineApproximation,
  type EnvironmentAssumption,
  type EnvironmentCheck,
  type EnvironmentComponent,
  type EnvironmentEvidenceDocument,
  type EnvironmentIssue,
  type EnvironmentReadiness,
  type EnvironmentReconstructionResult,
  type FightInterval,
  type LustApplication,
  type ObservationCluster,
  type ObservedEngagementSpan,
  type PotionComponent,
  type PotionUse,
  type PrimaryTargetComponent,
  type PullAuraRecord,
  type RaidBuffEntry,
  type RaidBuffName,
  type RankOption,
  type SetupConsumable,
  type SetupConsumableKind,
  type TankLoadComponent,
  type TargetCandidate,
  type TargetScheduleComponent,
  type TemporaryEnchantComponent,
  type ValidatedModelApplicability,
} from "./model.js";

export interface EnvironmentReconstructionInput {
  readonly subject: { readonly fightRef: string; readonly actorId: number };
  /**
   * The simulation model the environment is reconstructed FOR (M11 model
   * registry): its pinned consumable, token-acceptance and raid-environment
   * data and its client-data build. Named by the caller; there is no default.
   */
  readonly simulationModel: SimulationModelData;
  /** The normalized fight, with its completeness. */
  readonly fight: CombatFight;
  /** The subject's raw pull facts (combatantinfo stats and aura list). */
  readonly pullFacts: { readonly actorId: number; readonly facts: CombatantPullFacts } | null;
  /** The subject's weapon temporary enchants, from its character profile. */
  readonly temporaryEnchants: {
    readonly actorId: number;
    readonly slots: readonly {
      readonly slot: "main_hand" | "off_hand";
      readonly evidence: TemporaryEnchantEvidence;
    }[];
  } | null;
  /** Spell ids the subject's own character profile owns (selected talents): a pull aura of these is the character's, not the environment's. */
  readonly characterOwnedSpellIds: { readonly actorId: number; readonly spellIds: readonly number[] } | null;
  readonly documents: readonly EnvironmentEvidenceDocument[];
  /**
   * The model's validated applicability for this fight, from model selection;
   * null when the caller has none (e.g. a diagnostic run on a model chosen
   * without a log context). Explicit: there is no default. It only discharges
   * model chronology; it never resolves a specific missing effect.
   */
  readonly modelApplicability: ValidatedModelApplicability | null;
  /**
   * Explicit user statements (owner policy, M11-G3-4): an engine consumable
   * token, or "NONE". Used ONLY to fill an UNKNOWN identity; validated against
   * the pinned data; never a default; the provenance is kept.
   */
  readonly userProvided?: {
    readonly food?: UserProvidedConsumable;
    readonly augmentation?: UserProvidedConsumable;
  };
}

export interface UserProvidedConsumable {
  readonly token: string;
  readonly provenance: UserProvidedProvenance;
}

/** The identity value of a user's explicit "none was used" statement (USER_PROVIDED only). */
export const USER_STATED_NONE: ConsumableIdentity = { spellId: 0, itemIds: [] };

/** Observations further apart than this start a new descriptive cluster. Never an availability boundary. */
export const OBSERVATION_CLUSTER_GAP_MS = 10_000;

const SUBJECT_AURAS_FIELD = "subject aura events";

interface Ctx {
  readonly fight: CombatFight;
  /** The named simulation model's pinned data. */
  readonly data: SimulationModelData;
  readonly fightRef: string;
  readonly subjectId: number;
  readonly approximations: EngineApproximation[];
  readonly startMs: number;
  readonly endMs: number;
  readonly blockers: EnvironmentIssue[];
  readonly diagnostics: EnvironmentIssue[];
  readonly checks: EnvironmentCheck[];
  readonly assumptions: Map<string, EnvironmentAssumption>;
}

type Gate = { readonly ok: true } | { readonly ok: false; readonly reason: string };

function gate(ctx: Ctx, category: EvidenceCategory, actorId: number | null): Gate {
  const result = gateAbsenceClaim({
    completeness: ctx.fight.completeness,
    category,
    actorId,
    range: inclusiveRange(ctx.startMs, ctx.endMs),
  });
  if (!result.ok) return { ok: false, reason: result.reason };
  const evidence = ctx.fight.completeness.categories[category];
  if (evidence.capability === "OBSERVABLE" && evidence.coverage.reason === "MALFORMED_EVENT_CONTENT") {
    return { ok: false, reason: "DECODE_DEGRADED" };
  }
  return { ok: true };
}

const rel = (ctx: Ctx, reportMs: number): number => reportMs - ctx.startMs;

function auraEventsOn(ctx: Ctx, actorId: number, spellIds: readonly number[]): AuraEvent[] {
  const ids = new Set(spellIds);
  return ctx.fight.events.filter(
    (event): event is AuraEvent =>
      event.kind === "AURA" &&
      event.target?.actorId === actorId &&
      event.abilityGameId !== null &&
      ids.has(event.abilityGameId),
  );
}

export function reconstructEnvironment(
  input: EnvironmentReconstructionInput,
): EnvironmentReconstructionResult {
  const fight = input.fight;
  const ctx: Ctx = {
    fight,
    data: input.simulationModel,
    fightRef: input.subject.fightRef,
    approximations: [],
    subjectId: input.subject.actorId,
    startMs: fight.fight.startTimeMs,
    endMs: fight.fight.endTimeMs,
    blockers: [],
    diagnostics: [],
    checks: [],
    assumptions: new Map(),
  };
  const block = (component: EnvironmentComponent, code: EnvironmentIssue["code"], detail: string) => {
    ctx.blockers.push({ code, component, detail });
  };
  const note = (component: EnvironmentComponent, code: EnvironmentIssue["code"], detail: string) => {
    ctx.diagnostics.push({ code, component, detail });
  };
  const use = (assumption: EnvironmentAssumption) => {
    ctx.assumptions.set(assumption.id, assumption);
  };

  // Subject-scoped inputs must be the subject's.
  const own = <T extends { readonly actorId: number }>(
    value: T | null,
    what: string,
    component: EnvironmentComponent,
  ): T | null => {
    if (value === null) return null;
    if (value.actorId === ctx.subjectId) return value;
    block(
      component,
      "EVIDENCE_ACTOR_MISMATCH",
      `${what} are actor ${String(value.actorId)}, not ${String(ctx.subjectId)}`,
    );
    return null;
  };
  const pull = own(input.pullFacts, "pull facts", "pullAuras")?.facts ?? null;
  const enchants = own(input.temporaryEnchants, "temporary enchants", "consumables");
  const talentSpells = new Set(
    own(input.characterOwnedSpellIds, "character-owned spells", "pullAuras")?.spellIds ?? [],
  );
  const subjectAuras = gate(ctx, "AURAS", ctx.subjectId);

  const duration = reconstructDuration(ctx);
  use(RETROSPECTIVE_EXACT_FIGHT_END);
  const continuity = primaryTargetContinuous(ctx.fightRef, fight.fight.encounterId);
  const primaryTarget = reconstructPrimaryTarget(ctx, continuity);
  if (primaryTarget.availability.state === "MODEL_ASSUMPTION") use(continuity);
  const raidBuffs = reconstructRaidBuffs(
    ctx,
    ctx.data.raidEnvironment.raidBuffOverrides,
    pull,
    subjectAuras,
    primaryTarget,
  );
  const bloodlust = reconstructBloodlust(ctx, subjectAuras);
  const pullAuras = classifyPullAuras(ctx, pull, talentSpells);
  const consumables = reconstructConsumables(
    ctx,
    pull,
    pullAuras,
    subjectAuras,
    enchants?.slots ?? null,
    input.userProvided ?? {},
    block,
    note,
  );
  if (consumables.temporaryEnchants.some((entry) => entry.persistence.state === "MODEL_ASSUMPTION")) {
    use(TEMPORARY_ENCHANT_WHOLE_FIGHT);
  }
  if (consumables.potion.identity.state === "KNOWN") use(POTION_TIMING_ELITE_APL);
  if (pullAuras.some((aura) => aura.classification === "DEFENSIVE_ALLY_EXCLUDED")) {
    use(DEFENSIVE_ALLY_AURAS_EXCLUDED);
  }
  const tankLoad = reconstructTankLoad();
  use(STANDARD_TANK_LOAD);
  const targetSchedule = reconstructTargetSchedule(ctx, primaryTarget);

  // ---- checks (factual readiness; materiality is publishability's job) ----
  const check = (component: EnvironmentComponent, state: EnvironmentCheck["state"], detail: string) =>
    ctx.checks.push({ component, state, detail });

  if (duration.interval.state === "KNOWN" && duration.finality === "COMPLETED") {
    check("duration", "RESOLVED", `${String(duration.interval.value.durationMs)} ms, completed`);
  } else {
    block(
      "duration",
      "DURATION_UNRESOLVED",
      `interval ${duration.interval.state}, finality ${duration.finality}`,
    );
    check("duration", "UNRESOLVED", "exact completed fight interval not established");
  }

  if (primaryTarget.identity.state === "KNOWN") {
    check(
      "primaryTarget",
      "RESOLVED",
      `boss-subtype actor ${String(primaryTarget.identity.value.actorId)}; presence ${primaryTarget.availability.state}`,
    );
  } else {
    block(
      "primaryTarget",
      "PRIMARY_TARGET_UNRESOLVED",
      primaryTarget.identity.state === "UNKNOWN" ? primaryTarget.identity.reason : "not known",
    );
    check("primaryTarget", "UNRESOLVED", "no single WCL boss-subtype actor");
  }

  const buffProblems: string[] = [];
  let buffsRepresentable = true;
  for (const entry of raidBuffs) {
    if (entry.presence.state === "UNKNOWN") {
      block("raidBuffs", "RAID_BUFF_UNKNOWN", `${entry.override}: ${entry.presence.reason}`);
      buffProblems.push(`${entry.override} UNKNOWN`);
    } else if (entry.presence.state === "KNOWN" && entry.presence.value.kind === "TIMED") {
      block(
        "raidBuffs",
        "RAID_BUFF_TIMED",
        `${entry.override}: timed presence; the engine override is whole-fight only`,
      );
      buffProblems.push(`${entry.override} TIMED`);
      buffsRepresentable = false;
    }
  }
  check(
    "raidBuffs",
    !buffsRepresentable ? "NOT_REPRESENTABLE" : buffProblems.length > 0 ? "UNRESOLVED" : "RESOLVED",
    buffProblems.length > 0 ? buffProblems.join("; ") : "every override's presence established",
  );

  if (checkBloodlust(bloodlust, block, note, check, ctx.approximations)) use(BLOODLUST_WHOLE_SECOND_START);
  checkConsumables(consumables, block, note, check);

  check("tankLoad", "RESOLVED", `${tankLoad.model} v${String(tankLoad.version)} (MODEL_ASSUMPTION)`);

  if (targetSchedule.schedule.state === "UNKNOWN") {
    block(
      "targetSchedule",
      "TARGET_SCHEDULE_UNRESOLVED",
      `${targetSchedule.schedule.reason}; candidates: ${targetSchedule.candidates.map((c) => `${String(c.actorId)}${c.gameId === null ? "" : `/${String(c.gameId)}`}`).join(", ") || "none observed"}`,
    );
    for (const candidate of targetSchedule.candidates) {
      if (candidate.engagement !== null) {
        note(
          "targetSchedule",
          "OBSERVED_ENGAGEMENT_ONLY",
          `actor ${String(candidate.actorId)}: observed ${String(candidate.engagement.firstObservedMs)}–${String(candidate.engagement.lastObservedMs)} ms in ${String(candidate.observedClusters.length)} clusters; observations, not availability`,
        );
      }
    }
    check(
      "targetSchedule",
      targetSchedule.candidates.length > 0 ? "NOT_REPRESENTABLE" : "UNRESOLVED",
      targetSchedule.candidates.length > 0
        ? "additional targets were engaged but no availability interval is established, and the job admits no additional target"
        : "no evidence source establishes that no additional target existed",
    );
  } else {
    check("targetSchedule", "RESOLVED", "schedule established");
  }

  const unclassifiedSelf = pullAuras.filter(
    (aura) =>
      aura.classification === "UNCLASSIFIED_SELF" || aura.classification === "UNCLASSIFIED_UNKNOWN_SOURCE",
  );
  const unclassifiedAlly = pullAuras.filter((aura) => aura.classification === "UNCLASSIFIED_ALLY");
  if (pull === null || pull.auras === null) {
    block("pullAuras", "SETUP_AURA_UNCLASSIFIED", "no readable pull aura list for the subject");
    check("pullAuras", "UNRESOLVED", "no pull aura list");
  } else {
    if (unclassifiedSelf.length > 0) {
      block(
        "pullAuras",
        "SETUP_AURA_UNCLASSIFIED",
        `subject pull auras no pinned table names (unknown simulation effect): ${unclassifiedSelf.map((aura) => String(aura.spellId)).join(", ")}`,
      );
    }
    const excluded = pullAuras.filter((aura) => aura.classification === "DEFENSIVE_ALLY_EXCLUDED");
    if (excluded.length > 0) {
      note(
        "pullAuras",
        "ASSUMPTION_RECORDED",
        `pinned defensive ally auras excluded under ${DEFENSIVE_ALLY_AURAS_EXCLUDED.id}: ${excluded.map((aura) => String(aura.spellId)).join(", ")}`,
      );
    }
    if (unclassifiedAlly.length > 0) {
      use(UNREPRESENTABLE_ALLY_AURAS_EXCLUDED);
      note(
        "pullAuras",
        "ALLY_AURA_NOT_REPRESENTABLE",
        `ally-sourced pull auras with no engine player-side representation: ${unclassifiedAlly.map((aura) => String(aura.spellId)).join(", ")}`,
      );
    }
    check(
      "pullAuras",
      unclassifiedSelf.length > 0 ? "UNRESOLVED" : "RESOLVED",
      `${String(pullAuras.length)} pull auras; ${String(unclassifiedSelf.length)} subject-sourced unclassified; ${String(excluded.length)} defensive ally excluded; ${String(unclassifiedAlly.length)} ally-sourced unrepresentable`,
    );
  }

  // Model chronology. A SPECIFIC observed effect that is absent from the pinned
  // spell data (audited) cannot be represented by the pinned model: that is a
  // material incompatibility and blocks, whatever the applicability. Age alone
  // is MODEL_BUILD_LAG (a diagnostic) unless a validated applicability window
  // for THIS model contains the fight start: then chronology is discharged and
  // only the informational MODEL_SNAPSHOT_PRECEDES_LOG is recorded.
  const logDate = new Date(fight.report.startTimeUnixMs).toISOString().slice(0, 10);
  const applicabilityCovers = coversFight(input.modelApplicability, ctx.data, fight);
  const absent = unclassifiedSelf.filter((aura) => spellPresence(ctx.data, aura.spellId) === false);
  for (const aura of absent) {
    block(
      "pullAuras",
      "PINNED_MODEL_MISSING_OBSERVED_EFFECT",
      `subject pull aura ${String(aura.spellId)} is absent from the pinned spell data (client data ${ctx.data.manifest.gameDataBuild}, hotfix ${ctx.data.manifest.hotfixDate}; log ${logDate}): its effect cannot be represented`,
    );
  }
  if (logDate > ctx.data.manifest.hotfixDate && applicabilityCovers && input.modelApplicability !== null) {
    const applicability = input.modelApplicability;
    note(
      "duration",
      "MODEL_SNAPSHOT_PRECEDES_LOG",
      `informational: log ${logDate} follows the model's client-data snapshot (hotfix ${ctx.data.manifest.hotfixDate}, ${ctx.data.manifest.gameDataBuild}); the fight is inside the validated applicability window [${applicability.window.fromUtc}, ${applicability.window.toUtc}) for ${applicability.specKey} (${applicability.windowBasis}): model chronology discharged`,
    );
  } else if (logDate > ctx.data.manifest.hotfixDate) {
    const specific = [
      ...unclassifiedSelf.map(
        (aura) =>
          `pull aura ${String(aura.spellId)} has no identity in the pinned raid-environment, consumable or talent tables`,
      ),
      ...consumables.setup
        .filter((entry) => entry.identity.state === "UNKNOWN")
        .map((entry) => `${entry.kind} identity not in pinned consumable data`),
    ];
    note(
      "duration",
      "MODEL_BUILD_LAG",
      `log ${logDate} is newer than the pinned client data (hotfix ${ctx.data.manifest.hotfixDate}, ${ctx.data.manifest.gameDataBuild}); age alone does not block${specific.length > 0 ? `; specific gaps (each blocks under its own code): ${specific.join("; ")}` : ""}`,
    );
  }

  const assumptions = [...ctx.assumptions.values()];
  for (const assumption of assumptions) {
    note(
      "duration",
      "ASSUMPTION_RECORDED",
      `${assumption.id}@${String(assumption.version)} (${assumption.approval})`,
    );
  }

  const status: EnvironmentReadiness = ctx.checks.some((entry) => entry.state === "NOT_REPRESENTABLE")
    ? "NOT_REPRESENTABLE"
    : ctx.checks.some((entry) => entry.state === "UNRESOLVED") || ctx.blockers.length > 0
      ? "PARTIAL"
      : "READY";

  const pinnedDataRevisions = [
    ctx.data.revisions.find((entry) => entry.datasetId === "SIMC_RAID_ENVIRONMENT"),
    ctx.data.revisions.find((entry) => entry.datasetId === "SIMC_CONSUMABLES"),
  ].filter((entry) => entry !== undefined);

  return {
    schemaVersion: ENVIRONMENT_RECONSTRUCTION_SCHEMA_VERSION,
    status,
    environment: {
      schemaVersion: ENVIRONMENT_RECONSTRUCTION_SCHEMA_VERSION,
      duration,
      primaryTarget,
      raidBuffs,
      bloodlust,
      consumables,
      tankLoad,
      targetSchedule,
      pullAuras,
      assumptions,
      evidence: { subject: input.subject, documents: input.documents },
      reconstructionStatus: status,
    },
    checks: ctx.checks,
    blockers: ctx.blockers,
    diagnostics: ctx.diagnostics,
    assumptions,
    provenance: {
      subject: input.subject,
      documents: input.documents,
      pinnedData: pinnedDataRevisions,
      engineApproximations: ctx.approximations,
      model: { simcCommit: ctx.data.manifest.simcCommit, gameDataBuild: ctx.data.manifest.gameDataBuild },
      modelApplicability: { supplied: input.modelApplicability, coversFight: applicabilityCovers },
    },
  };
}

/**
 * A supplied applicability discharges chronology only when it names THIS
 * model and build and its half-open window contains this fight's start.
 * Anything else (absent, another model, another build, outside the window,
 * unparseable times) leaves chronology undischarged.
 */
function coversFight(
  applicability: ValidatedModelApplicability | null,
  data: SimulationModelData,
  fight: CombatFight,
): boolean {
  if (applicability === null) return false;
  if (applicability.modelId !== data.manifest.modelId) return false;
  if (applicability.gameBuild !== data.manifest.gameDataBuild) return false;
  const start = fight.report.startTimeUnixMs + fight.fight.startTimeMs;
  const from = Date.parse(applicability.window.fromUtc);
  const to = Date.parse(applicability.window.toUtc);
  if (!Number.isFinite(start) || Number.isNaN(from) || Number.isNaN(to)) return false;
  return from <= start && start < to;
}

// ---------------------------------------------------------------------------
// Duration and primary target
// ---------------------------------------------------------------------------

function reconstructDuration(ctx: Ctx): DurationComponent {
  const meta = ctx.fight.fight;
  const interval =
    Number.isSafeInteger(meta.startTimeMs) &&
    Number.isSafeInteger(meta.endTimeMs) &&
    meta.endTimeMs > meta.startTimeMs
      ? known(
          {
            startReportMs: meta.startTimeMs,
            endReportMs: meta.endTimeMs,
            durationMs: meta.endTimeMs - meta.startTimeMs,
          },
          "WCL_FIGHT_CONTEXT",
          "fights[].startTime/endTime",
        )
      : unknownFact<FightInterval>(
          "fight interval missing or empty",
          "WCL_FIGHT_CONTEXT",
          "fights[].startTime/endTime",
        );
  return {
    interval,
    finality: meta.finality,
    fightEndKnowledge: assumed("EXACT_FIGHT_END" as const, RETROSPECTIVE_EXACT_FIGHT_END),
  };
}

function engagementOf(
  ctx: Ctx,
  targetId: number,
  observers: ReadonlySet<number>,
): { span: ObservedEngagementSpan | null; clusters: ObservationCluster[] } {
  const times = ctx.fight.events
    .filter(
      (event: CombatEvent) =>
        event.kind === "DAMAGE" &&
        event.target?.actorId === targetId &&
        event.source !== null &&
        observers.has(event.source.actorId),
    )
    .map((event) => rel(ctx, event.reportTimeMs))
    .sort((a, b) => a - b);
  if (times.length === 0) return { span: null, clusters: [] };
  let largestGapMs = 0;
  const clusters: ObservationCluster[] = [];
  let first = times[0] ?? 0;
  let last = first;
  let count = 0;
  for (const [index, time] of times.entries()) {
    if (index > 0) {
      const gapMs = time - last;
      if (gapMs > largestGapMs) largestGapMs = gapMs;
      if (gapMs > OBSERVATION_CLUSTER_GAP_MS) {
        clusters.push({ firstObservedMs: first, lastObservedMs: last, observationCount: count });
        first = time;
        count = 0;
      }
    }
    last = time;
    count += 1;
  }
  clusters.push({ firstObservedMs: first, lastObservedMs: last, observationCount: count });
  return {
    span: {
      kind: "OBSERVED_ENGAGEMENT_SPAN",
      observer: "SUBJECT_AND_OWNED_PETS_DAMAGE",
      firstObservedMs: times[0] ?? 0,
      lastObservedMs: times[times.length - 1] ?? 0,
      observationCount: times.length,
      largestGapMs,
    },
    clusters,
  };
}

function observersOf(ctx: Ctx): ReadonlySet<number> {
  return new Set([ctx.subjectId, ...actorsOwnedBy(ctx.fight, ctx.subjectId)]);
}

function capabilityAudit(
  ctx: Ctx,
  category: EvidenceCategory,
  source: AvailabilitySourceAudit["source"],
  observable: AvailabilitySourceAudit["status"],
  detail: string,
): AvailabilitySourceAudit {
  const evidence = ctx.fight.completeness.categories[category];
  if (evidence.capability !== "OBSERVABLE") {
    return {
      source,
      status: "CAPABILITY_NOT_ESTABLISHED",
      detail: `${category} capability ${evidence.capability}`,
    };
  }
  return { source, status: observable, detail };
}

function availabilityAudits(ctx: Ctx, actorId: number): AvailabilitySourceAudit[] {
  const summons = gate(ctx, "SUMMONS", actorId);
  return [
    capabilityAudit(
      ctx,
      "TARGETABILITY",
      "TARGETABILITY",
      "NOT_AVAILABILITY_EVIDENCE",
      "no approved contract maps targetability events to an availability interval",
    ),
    ctx.fight.phases.length === 0
      ? capabilityAudit(
          ctx,
          "ENCOUNTER_PHASES",
          "ENCOUNTER_PHASES",
          "NO_METADATA",
          "no phase transition is recorded for this fight",
        )
      : capabilityAudit(
          ctx,
          "ENCOUNTER_PHASES",
          "ENCOUNTER_PHASES",
          "NOT_AVAILABILITY_EVIDENCE",
          "phase transitions carry no per-actor availability",
        ),
    summons.ok
      ? {
          source: "SUMMONS",
          status: "NOT_AVAILABILITY_EVIDENCE",
          detail: "a summon event establishes neither ownership nor targetable-from-summon",
        }
      : {
          source: "SUMMONS",
          status: summons.reason === "INSUFFICIENT_SCOPE" ? "OUT_OF_SCOPE" : "CAPABILITY_NOT_ESTABLISHED",
          detail: `summon evidence for this actor: ${summons.reason}`,
        },
    capabilityAudit(
      ctx,
      "DEATHS",
      "DEATHS",
      "ENDPOINT_ONLY",
      "a positive death bounds the end only; it never establishes when the actor became available",
    ),
    {
      source: "OBSERVED_ENGAGEMENT",
      status: "NOT_AVAILABILITY_EVIDENCE",
      detail: "first/last observed hits are observations; the time between them is not filled",
    },
    {
      source: "ACTOR_CATALOG",
      status: "NOT_AVAILABILITY_EVIDENCE",
      detail: "catalog membership (and the boss subtype) is not presence, hostility or targetability",
    },
    ...ENCOUNTER_SCHEDULE_AUTHORITY_AUDITS.filter(
      (entry) => entry.encounterId === ctx.fight.fight.encounterId,
    ).map((entry): AvailabilitySourceAudit => ({
      source: "PINNED_ENCOUNTER_DATA",
      status: "AUTHORITY_NOT_FOUND",
      detail: `${entry.result} (${entry.auditedOn}): ${entry.finding}`,
    })),
    ...TARGET_AVAILABILITY_INVESTIGATIONS.filter((entry) => entry.fightRef === ctx.fightRef).map(
      (entry): AvailabilitySourceAudit => ({
        source: "WCL_INVESTIGATION",
        status: "AUTHORITY_NOT_FOUND",
        detail: `${entry.result} (${entry.investigatedOn}): ${entry.finding}`,
      }),
    ),
  ];
}

/**
 * The primary target is the single WCL boss-subtype actor OBSERVED in this
 * fight's events. The catalog is report-wide (every boss of the report is
 * listed), so catalog membership alone names no fight's boss; being observed
 * names it and proves nothing about its availability.
 */
function reconstructPrimaryTarget(ctx: Ctx, continuity: EnvironmentAssumption): PrimaryTargetComponent {
  const observed = new Set<number>();
  for (const event of ctx.fight.events) {
    if (event.source !== null) observed.add(event.source.actorId);
    if (event.target !== null) observed.add(event.target.actorId);
  }
  const bosses = [...ctx.fight.actors.values()].filter(
    (actor) => observed.has(actor.actorId) && bossSubtypeOf(ctx.fight, actor.actorId) === "WCL_BOSS_SUBTYPE",
  );
  const boss = bosses.length === 1 ? bosses[0] : undefined;
  if (boss === undefined) {
    return {
      identity: unknownFact(
        `${String(bosses.length)} WCL boss-subtype actors observed in this fight's events: a single primary target is not established`,
        "WCL_FIGHT_CONTEXT",
        "masterData.actors",
      ),
      availability: unknownFact("no primary target", null, "primaryTarget"),
      engagement: null,
      availabilityEvidence: [],
    };
  }
  return {
    identity: known(
      { actorId: boss.actorId, gameId: boss.gameId },
      "WCL_FIGHT_CONTEXT",
      "masterData.actors subType=Boss, observed in this fight's events",
    ),
    availability: assumed("WHOLE_ENCOUNTER" as const, continuity),
    engagement: engagementOf(ctx, boss.actorId, observersOf(ctx)).span,
    availabilityEvidence: availabilityAudits(ctx, boss.actorId),
  };
}

function reconstructTargetSchedule(ctx: Ctx, primary: PrimaryTargetComponent): TargetScheduleComponent {
  const observers = observersOf(ctx);
  const primaryId = primary.identity.state === "KNOWN" ? primary.identity.value.actorId : null;
  const engaged = new Set<number>();
  for (const event of ctx.fight.events) {
    if (
      event.kind === "DAMAGE" &&
      event.source !== null &&
      observers.has(event.source.actorId) &&
      event.target !== null
    ) {
      engaged.add(event.target.actorId);
    }
  }
  const candidates: TargetCandidate[] = [...engaged]
    .filter(
      (actorId) =>
        actorId !== primaryId &&
        !observers.has(actorId) &&
        ctx.fight.actors.get(actorId)?.actorType === "NPC",
    )
    .sort((a, b) => a - b)
    .map((actorId) => {
      const { span, clusters } = engagementOf(ctx, actorId, observers);
      return {
        actorId,
        gameId: ctx.fight.actors.get(actorId)?.gameId ?? null,
        engagement: span,
        observedClusters: clusters,
        availabilityEvidence: availabilityAudits(ctx, actorId),
        availability: unknownFact(
          "no approved evidence source establishes this actor's availability boundaries",
          null,
          "targetAvailability",
        ),
      };
    });
  return {
    candidates,
    schedule: unknownFact(
      candidates.length > 0
        ? "additional targets were engaged and no availability interval is established for any of them"
        : "no approved evidence source establishes that no additional target existed",
      null,
      "targetSchedule",
    ),
  };
}

// ---------------------------------------------------------------------------
// Raid buffs and Bloodlust
// ---------------------------------------------------------------------------

function reconstructRaidBuffs(
  ctx: Ctx,
  overrides: readonly RaidBuffOverrideIdentity[],
  pull: CombatantPullFacts | null,
  subjectAuras: Gate,
  primary: PrimaryTargetComponent,
): RaidBuffEntry[] {
  return RAID_BUFFS.map((name: RaidBuffName) => {
    const identity = overrides.find((entry) => entry.override === name);
    if (identity === undefined) {
      return {
        override: name,
        side: "PLAYER_AURA",
        auraSpellIds: [],
        presence: unknownFact(
          `no pinned identity for override ${name}`,
          "PINNED_GAME_DATA",
          "raid-environment",
        ),
      };
    }
    const base = { override: name, side: identity.side, auraSpellIds: identity.auraSpellIds };
    if (identity.side === "TARGET_DEBUFF")
      return { ...base, presence: targetDebuffPresence(ctx, identity, primary) };
    return { ...base, presence: playerAuraPresence(ctx, identity, pull, subjectAuras) };
  });
}

function playerAuraPresence(
  ctx: Ctx,
  identity: RaidBuffOverrideIdentity,
  pull: CombatantPullFacts | null,
  subjectAuras: Gate,
): RaidBuffEntry["presence"] {
  if (pull?.auras === null || pull === null) {
    return unknownFact("no readable pull aura list for the subject", "WCL_COMBATANTINFO", "auras");
  }
  const atPull = pull.auras.find((aura) => identity.auraSpellIds.includes(aura.spellId));
  const events = auraEventsOn(ctx, ctx.subjectId, identity.auraSpellIds);
  if (!subjectAuras.ok) {
    return unknownFact(
      `${atPull === undefined ? "not on the pull aura list" : "on the pull aura list"}; continuity unproven: subject aura coverage ${subjectAuras.reason}`,
      "WCL_EVENTS",
      SUBJECT_AURAS_FIELD,
    );
  }
  if (events.some((event) => event.source === null)) {
    return unknownFact(
      "a transition of this aura on the subject carried no source",
      "WCL_EVENTS",
      SUBJECT_AURAS_FIELD,
    );
  }
  const removals = events.filter((event) => event.operation === "REMOVED" && !event.isStackChange);
  if (atPull !== undefined && removals.length === 0) {
    return known(
      {
        kind: "WHOLE_FIGHT" as const,
        auraSpellId: atPull.spellId,
        sourceActorId: atPull.sourceId,
        refreshedAtMs: events
          .filter((event) => event.operation !== "REMOVED")
          .map((event) => rel(ctx, event.reportTimeMs)),
      },
      "WCL_COMBATANTINFO",
      `auras[${String(atPull.spellId)}] + no removal under COMPLETE subject aura coverage`,
    );
  }
  if (events.length > 0) {
    return known(
      {
        kind: "TIMED" as const,
        auraSpellId: events[0]?.abilityGameId ?? 0,
        transitions: events.map((event) => ({
          atMs: rel(ctx, event.reportTimeMs),
          operation: event.operation,
        })),
      },
      "WCL_EVENTS",
      SUBJECT_AURAS_FIELD,
    );
  }
  return unknownFact(
    "not on the pull aura list (not proven exhaustive) and no in-fight transition: presence is not established either way",
    "WCL_COMBATANTINFO",
    "auras",
  );
}

function targetDebuffPresence(
  ctx: Ctx,
  identity: RaidBuffOverrideIdentity,
  primary: PrimaryTargetComponent,
): RaidBuffEntry["presence"] {
  if (identity.auraSpellIds.length === 0) {
    return unknownFact(
      "the engine's generic debuff has no single aura identity to observe",
      "PINNED_GAME_DATA",
      "raid-environment",
    );
  }
  if (primary.identity.state !== "KNOWN") return unknownFact("no primary target", null, "primaryTarget");
  const targetId = primary.identity.value.actorId;
  const coverage = gate(ctx, "AURAS", targetId);
  if (!coverage.ok) {
    const attempt = BOSS_DEBUFF_CERTIFICATION_ATTEMPTS.find((entry) => entry.fightRef === ctx.fightRef);
    return unknownFact(
      `aura evidence on the primary target is not vouched: ${coverage.reason}${attempt === undefined ? "" : `; ${attempt.result} (${attempt.investigatedOn}): ${attempt.finding}`}`,
      "WCL_EVENTS",
      "primary-target aura events",
    );
  }
  const events = auraEventsOn(ctx, targetId, identity.auraSpellIds);
  if (events.length === 0) {
    return unknownFact(
      "no transition observed and no pull-state list exists for an NPC: presence is not established either way",
      "WCL_EVENTS",
      "primary-target aura events",
    );
  }
  return known(
    {
      kind: "TIMED" as const,
      auraSpellId: events[0]?.abilityGameId ?? 0,
      transitions: events.map((event) => ({
        atMs: rel(ctx, event.reportTimeMs),
        operation: event.operation,
      })),
    },
    "WCL_EVENTS",
    "primary-target aura events",
  );
}

function reconstructBloodlust(ctx: Ctx, subjectAuras: Gate): BloodlustComponent {
  const lustEvents = ctx.fight.events.filter(
    (event): event is AuraEvent =>
      event.kind === "AURA" &&
      event.target?.actorId === ctx.subjectId &&
      event.abilityGameId !== null &&
      lustFamilyMember(ctx.data, event.abilityGameId)?.inPinnedData === true,
  );
  const satedObservations = ctx.fight.events
    .filter(
      (event): event is AuraEvent =>
        event.kind === "AURA" &&
        event.target?.actorId === ctx.subjectId &&
        event.abilityGameId !== null &&
        event.operation === "APPLIED" &&
        isSatedSpell(ctx.data, event.abilityGameId),
    )
    .map((event) => ({ spellId: event.abilityGameId ?? 0, atMs: rel(ctx, event.reportTimeMs) }));
  const field = "subject lust-family aura events";
  if (!subjectAuras.ok) {
    return {
      applications: unknownFact(`subject aura coverage ${subjectAuras.reason}`, "WCL_EVENTS", field),
      satedObservations,
    };
  }
  if (lustEvents.some((event) => event.source === null)) {
    return {
      applications: unknownFact("a lust-family transition carried no source", "WCL_EVENTS", field),
      satedObservations,
    };
  }
  if (lustEvents.length === 0) {
    if (satedObservations.length > 0) {
      return {
        applications: unknownFact(
          "a lockout debuff was applied with no recognised lust-family aura: an unrecognised lust is possible",
          "WCL_EVENTS",
          field,
        ),
        satedObservations,
      };
    }
    return {
      applications: {
        state: "KNOWN_NONE",
        source: { kind: "WCL_EVENTS", field },
        basis:
          "no lust-family transition and no lockout debuff on the subject under COMPLETE subject aura coverage",
      },
      satedObservations,
    };
  }
  const applications: LustApplication[] = [];
  const open = new Map<number, AuraEvent>();
  const source: EvidenceSource = { kind: "WCL_EVENTS", field };
  const at = (event: AuraEvent): Evidenced<number> => ({
    state: "KNOWN",
    value: rel(ctx, event.reportTimeMs),
    source,
  });
  const equivalence = (spellId: number): LustApplication["equivalence"] =>
    lustFamilyMember(ctx.data, spellId)?.equivalentToEngineBloodlust === true
      ? "ENGINE_BLOODLUST_EQUIVALENT"
      : "NOT_EQUIVALENT";
  for (const event of lustEvents) {
    const spellId = event.abilityGameId ?? 0;
    if (event.operation === "APPLIED") {
      open.set(spellId, event);
    } else if (event.operation === "REMOVED" && !event.isStackChange) {
      const started = open.get(spellId);
      open.delete(spellId);
      applications.push({
        spellId,
        equivalence: equivalence(spellId),
        sourceActorId: event.source?.actorId ?? null,
        startMs:
          started === undefined
            ? unknownFact("applied before the observed interval: no application event", "WCL_EVENTS", field)
            : at(started),
        endMs: at(event),
      });
    }
  }
  for (const [spellId, started] of open) {
    applications.push({
      spellId,
      equivalence: equivalence(spellId),
      sourceActorId: started.source?.actorId ?? null,
      startMs: at(started),
      endMs: unknownFact("no removal before the fight ended", "WCL_EVENTS", field),
    });
  }
  applications.sort(
    (a, b) =>
      (a.startMs.state === "KNOWN" ? a.startMs.value : -1) -
      (b.startMs.state === "KNOWN" ? b.startMs.value : -1),
  );
  return { applications: known(applications, "WCL_EVENTS", field), satedObservations };
}

function checkBloodlust(
  bloodlust: BloodlustComponent,
  block: (component: EnvironmentComponent, code: EnvironmentIssue["code"], detail: string) => void,
  note: (component: EnvironmentComponent, code: EnvironmentIssue["code"], detail: string) => void,
  check: (component: EnvironmentComponent, state: EnvironmentCheck["state"], detail: string) => void,
  approximations: EngineApproximation[],
): boolean {
  const apps = bloodlust.applications;
  if (apps.state === "UNKNOWN") {
    block("bloodlust", "BLOODLUST_TIMING_UNRESOLVED", apps.reason);
    check("bloodlust", "UNRESOLVED", "lust presence/timing not established");
    return false;
  }
  if (apps.state !== "KNOWN") {
    check("bloodlust", "RESOLVED", "no lust (KNOWN_NONE)");
    return false;
  }
  let approximated = false;
  let representable = true;
  let resolved = true;
  if (apps.value.length > 1) {
    block(
      "bloodlust",
      "BLOODLUST_MULTIPLE",
      `${String(apps.value.length)} applications; the engine applies one lust per iteration`,
    );
    representable = false;
  }
  for (const app of apps.value) {
    if (app.equivalence !== "ENGINE_BLOODLUST_EQUIVALENT") {
      block(
        "bloodlust",
        "BLOODLUST_NOT_EQUIVALENT",
        `spell ${String(app.spellId)} is not effect-identical to the engine's Bloodlust (2825)`,
      );
      representable = false;
    }
    if (app.startMs.state !== "KNOWN") {
      block(
        "bloodlust",
        "BLOODLUST_TIMING_UNRESOLVED",
        `spell ${String(app.spellId)}: start ${app.startMs.state}`,
      );
      resolved = false;
    } else if (app.startMs.value % 1000 !== 0) {
      const engineMs = Math.ceil(app.startMs.value / 1000) * 1000;
      note(
        "bloodlust",
        "BLOODLUST_ENGINE_WHOLE_SECOND",
        `observed start ${String(app.startMs.value)} ms; the pinned engine checks Bloodlust at whole seconds (sim.cpp bloodlust_check_t), so it begins at ${String(engineMs)} ms`,
      );
      approximations.push({
        id: BLOODLUST_WHOLE_SECOND_START.id,
        observed: `spell ${String(app.spellId)} start ${String(app.startMs.value)} ms`,
        engine: `Bloodlust (2825) start ${String(engineMs)} ms`,
        bound: `offset ${String(engineMs - app.startMs.value)} ms (< 1 s); measured effect of the full 0–1 s offset in the spec's BLOODLUST_WHOLE_SECOND measurement`,
      });
      note(
        "bloodlust",
        "ENGINE_APPROXIMATION_RECORDED",
        `${BLOODLUST_WHOLE_SECOND_START.id}: observed ${String(app.startMs.value)} ms, engine ${String(engineMs)} ms`,
      );
      approximated = true;
    }
  }
  check(
    "bloodlust",
    !representable ? "NOT_REPRESENTABLE" : !resolved ? "UNRESOLVED" : "RESOLVED",
    apps.value
      .map(
        (app) =>
          `${String(app.spellId)} ${app.equivalence} ${app.startMs.state === "KNOWN" ? String(app.startMs.value) : "?"}→${app.endMs.state === "KNOWN" ? String(app.endMs.value) : "?"} ms`,
      )
      .join("; "),
  );
  return approximated;
}

// ---------------------------------------------------------------------------
// Pull auras and consumables
// ---------------------------------------------------------------------------

function classifyPullAuras(
  ctx: Ctx,
  pull: CombatantPullFacts | null,
  talentSpells: ReadonlySet<number>,
): PullAuraRecord[] {
  return (pull?.auras ?? []).map((aura) => {
    const sourceRole: PullAuraRecord["sourceRole"] =
      aura.sourceId === null ? "UNKNOWN" : aura.sourceId === ctx.subjectId ? "SUBJECT" : "ALLY";
    let classification: PullAuraRecord["classification"];
    if (raidBuffOverrideForAura(ctx.data, aura.spellId) !== null) classification = "RAID_BUFF";
    else if (lustFamilyMember(ctx.data, aura.spellId)?.inPinnedData === true) classification = "LUST_FAMILY";
    else if (isSatedSpell(ctx.data, aura.spellId)) classification = "SATED";
    else if (consumableAuraFor(ctx.data, aura.spellId) !== null) classification = "CONSUMABLE";
    else if (sourceRole === "SUBJECT" && talentSpells.has(aura.spellId)) classification = "CHARACTER_TALENT";
    else if (sourceRole === "ALLY" && defensiveAllyAura(ctx.data, aura.spellId) !== null)
      classification = "DEFENSIVE_ALLY_EXCLUDED";
    else
      classification =
        sourceRole === "SUBJECT"
          ? "UNCLASSIFIED_SELF"
          : sourceRole === "ALLY"
            ? "UNCLASSIFIED_ALLY"
            : "UNCLASSIFIED_UNKNOWN_SOURCE";
    return { spellId: aura.spellId, sourceRole, classification };
  });
}

function rankOf(aura: ConsumableAura): Evidenced<ConsumableRank> {
  const levels = [...new Set(aura.items.map((item) => item.itemLevel))].sort((a, b) => a - b);
  if (levels.length === 1 && levels[0] !== undefined) {
    return known({ itemLevel: levels[0] }, "PINNED_GAME_DATA", `items applying ${String(aura.spellId)}`);
  }
  return unknownFact(
    `items at item levels ${levels.join("/")} apply aura ${String(aura.spellId)}: the aura identifies the consumable, not its rank`,
    "PINNED_GAME_DATA",
    `items applying ${String(aura.spellId)}`,
  );
}

/**
 * Every plausible rank of an identified consumable, with its pinned engine
 * token (none chosen). Representable only when the token selects one item level
 * unambiguously AND the approved engine accepted it (token-acceptance table).
 */
function rankOptionsOf(data: SimulationModelData, aura: ConsumableAura): RankOption[] {
  return aura.rankOptions.map((option) => ({
    itemLevel: option.itemLevel,
    token: option.token,
    representable: option.unambiguous && engineAcceptsToken(data, aura.spellId, option.token),
  }));
}

const CONSUMABLE_KIND: Partial<Record<ConsumableAura["kind"], SetupConsumableKind>> = {
  FLASK: "FLASK",
  FOOD: "FOOD",
  OTHER: "AUGMENTATION",
};

type Report = (component: EnvironmentComponent, code: EnvironmentIssue["code"], detail: string) => void;

/** Resolves a user-stated consumable token against the pinned data: the aura it selects, or why it cannot. */
function userConsumable(
  data: SimulationModelData,
  kind: SetupConsumableKind,
  stated: UserProvidedConsumable,
):
  | { readonly ok: true; readonly entry: Omit<SetupConsumable, "kind"> }
  | { readonly ok: false; readonly detail: string } {
  if (stated.provenance.source !== "USER_PROVIDED")
    return { ok: false, detail: "provenance is not USER_PROVIDED" };
  if (stated.token === "NONE") {
    return {
      ok: true,
      entry: {
        identity: { state: "USER_PROVIDED", value: USER_STATED_NONE, provenance: stated.provenance },
        rank: { state: "NOT_APPLICABLE", reason: "the user stated none was used" },
        rankOptions: [],
        presence: { state: "NOT_APPLICABLE", reason: "the user stated none was used" },
        unclassifiedCandidates: [],
      },
    };
  }
  for (const aura of data.consumables.consumableAuras) {
    if (CONSUMABLE_KIND[aura.kind] !== kind) continue;
    const option = aura.rankOptions.find((candidate) => candidate.token === stated.token);
    if (option === undefined) continue;
    if (!option.unambiguous) {
      return {
        ok: false,
        detail: `token ${stated.token} does not select one item level unambiguously at the pin`,
      };
    }
    if (!engineAcceptsToken(data, aura.spellId, option.token)) {
      return {
        ok: false,
        detail: `token ${stated.token} names a pinned ${kind.toLowerCase()}, but the approved engine cannot build its effect (token-acceptance table): not representable, so the statement cannot make the environment simulation-ready`,
      };
    }
    return {
      ok: true,
      entry: {
        identity: {
          state: "USER_PROVIDED",
          value: { spellId: aura.spellId, itemIds: aura.items.map((item) => item.itemId) },
          provenance: stated.provenance,
        },
        rank: {
          state: "USER_PROVIDED",
          value: { itemLevel: option.itemLevel },
          provenance: stated.provenance,
        },
        rankOptions: [{ itemLevel: option.itemLevel, token: option.token, representable: true }],
        presence: { state: "USER_PROVIDED", value: "WHOLE_FIGHT", provenance: stated.provenance },
        unclassifiedCandidates: [],
      },
    };
  }
  return {
    ok: false,
    detail: `"${stated.token}" is not a pinned ${kind.toLowerCase()} the engine can represent`,
  };
}

function reconstructConsumables(
  ctx: Ctx,
  pull: CombatantPullFacts | null,
  pullAuras: readonly PullAuraRecord[],
  subjectAuras: Gate,
  enchantSlots:
    | readonly { readonly slot: "main_hand" | "off_hand"; readonly evidence: TemporaryEnchantEvidence }[]
    | null,
  userProvided: NonNullable<EnvironmentReconstructionInput["userProvided"]>,
  block: Report,
  note: Report,
): ConsumablesComponent {
  const unclassified = pullAuras
    .filter((aura) => aura.classification === "UNCLASSIFIED_SELF")
    .map((aura) => aura.spellId);
  const statedFor: Partial<Record<SetupConsumableKind, UserProvidedConsumable>> = {
    ...(userProvided.food === undefined ? {} : { FOOD: userProvided.food }),
    ...(userProvided.augmentation === undefined ? {} : { AUGMENTATION: userProvided.augmentation }),
  };
  const setup: SetupConsumable[] = (["FLASK", "FOOD", "AUGMENTATION"] as const).map((kind) => {
    const stated = statedFor[kind];
    const hit = (pull?.auras ?? [])
      .filter((aura) => aura.sourceId === ctx.subjectId)
      .map((aura) => consumableAuraFor(ctx.data, aura.spellId))
      .find((aura): aura is ConsumableAura => aura !== null && CONSUMABLE_KIND[aura.kind] === kind);
    if (hit === undefined) {
      if (stated !== undefined) {
        const resolved = userConsumable(ctx.data, kind, stated);
        if (resolved.ok) {
          note(
            "consumables",
            "USER_PROVIDED_RECORDED",
            `${kind}: "${stated.token}" as stated by the user (${stated.provenance.reference}); not observed`,
          );
          return { kind, ...resolved.entry };
        }
        block("consumables", "USER_PROVIDED_INVALID", `${kind}: ${resolved.detail}`);
      }
      return {
        kind,
        identity: unknownFact(
          pull?.auras === null || pull === null
            ? "no readable pull aura list"
            : `no subject pull aura is a pinned ${kind.toLowerCase()} (the pull list is not proven exhaustive, and an aura the pinned data cannot name cannot identify one)`,
          "WCL_COMBATANTINFO",
          "auras",
        ),
        rank: { state: "NOT_APPLICABLE", reason: "identity unknown" },
        rankOptions: [],
        presence: unknownFact("identity unknown", "WCL_COMBATANTINFO", "auras"),
        unclassifiedCandidates: unclassified,
      };
    }
    if (stated !== undefined) {
      // Warcraft Logs is authoritative for what was observed; a statement never overrides it.
      const agrees =
        stated.token !== "NONE" && hit.rankOptions.some((option) => option.token === stated.token);
      if (!agrees) {
        block(
          "consumables",
          "USER_PROVIDED_CONFLICT",
          `${kind}: the user stated "${stated.token}" but the pull shows pinned aura ${String(hit.spellId)}; the observation stands`,
        );
      }
    }
    const identity: ConsumableIdentity = {
      spellId: hit.spellId,
      itemIds: hit.items.map((item) => item.itemId),
    };
    const events = auraEventsOn(ctx, ctx.subjectId, [hit.spellId]);
    const presence: Evidenced<"WHOLE_FIGHT"> = !subjectAuras.ok
      ? unknownFact(
          `continuity unproven: subject aura coverage ${subjectAuras.reason}`,
          "WCL_EVENTS",
          SUBJECT_AURAS_FIELD,
        )
      : events.some((event) => event.operation === "REMOVED" && !event.isStackChange)
        ? unknownFact(
            "removed during the fight: a timed consumable is not representable",
            "WCL_EVENTS",
            SUBJECT_AURAS_FIELD,
          )
        : known(
            "WHOLE_FIGHT" as const,
            "WCL_COMBATANTINFO",
            `auras[${String(hit.spellId)}] + no removal under COMPLETE subject aura coverage`,
          );
    return {
      kind,
      identity: known(identity, "WCL_COMBATANTINFO", `auras[${String(hit.spellId)}]`),
      rank: rankOf(hit),
      rankOptions: rankOptionsOf(ctx.data, hit),
      presence,
      unclassifiedCandidates: [],
    };
  });
  return {
    setup,
    potion: reconstructPotion(ctx, subjectAuras),
    temporaryEnchants: (enchantSlots ?? []).flatMap((entry) => temporaryEnchantOf(ctx, entry)),
  };
}

/**
 * Owner decision: a temporary enchant PROVEN at pull persists for the whole
 * fight unless the retained evidence holds a contradictory replacement — a
 * subject cast of any pinned temporary-enchant spell. That needs COMPLETE
 * subject cast coverage; otherwise persistence is UNKNOWN. An unknown enchant
 * is never given whole-fight presence.
 */
function temporaryEnchantOf(
  ctx: Ctx,
  entry: { readonly slot: "main_hand" | "off_hand"; readonly evidence: TemporaryEnchantEvidence },
): TemporaryEnchantComponent[] {
  if (entry.evidence.state === "KNOWN_NONE" || entry.evidence.state === "NOT_APPLICABLE") return [];
  if (entry.evidence.state !== "KNOWN") {
    return [
      {
        slot: entry.slot,
        enchant: entry.evidence as Evidenced<{ enchantId: number; engineToken: string | null }>,
        persistence: unknownFact("enchant unknown", null, "temporaryEnchant"),
      },
    ];
  }
  const casts = gate(ctx, "CASTS", ctx.subjectId);
  if (!casts.ok) {
    return [
      {
        slot: entry.slot,
        enchant: entry.evidence,
        persistence: unknownFact(
          `subject cast coverage ${casts.reason}: a replacement cannot be ruled out`,
          "WCL_EVENTS",
          "subject casts",
        ),
      },
    ];
  }
  const enchantSpells = new Set(ctx.data.consumables.temporaryEnchants.map((row) => row.spellId));
  const replacement = ctx.fight.events.find(
    (event) =>
      event.kind === "CAST" &&
      event.source?.actorId === ctx.subjectId &&
      event.abilityGameId !== null &&
      enchantSpells.has(event.abilityGameId),
  );
  if (replacement !== undefined) {
    return [
      {
        slot: entry.slot,
        enchant: entry.evidence,
        persistence: unknownFact(
          replacement === undefined
            ? "pinned temporary-enchant data unavailable"
            : `the subject applied temporary-enchant spell ${String(replacement.abilityGameId)} at ${String(rel(ctx, replacement.reportTimeMs))} ms`,
          "WCL_EVENTS",
          "subject casts",
        ),
      },
    ];
  }
  return [
    {
      slot: entry.slot,
      enchant: entry.evidence,
      persistence: assumed("WHOLE_FIGHT" as const, TEMPORARY_ENCHANT_WHOLE_FIGHT),
    },
  ];
}

function reconstructPotion(ctx: Ctx, subjectAuras: Gate): PotionComponent {
  const casts = ctx.fight.events.filter(
    (event) =>
      event.kind === "CAST" &&
      event.castPhase === "COMPLETE" &&
      event.source?.actorId === ctx.subjectId &&
      event.abilityGameId !== null &&
      consumableAuraFor(ctx.data, event.abilityGameId)?.kind === "POTION",
  );
  const potionAuraEvents = ctx.fight.events.filter(
    (event): event is AuraEvent =>
      event.kind === "AURA" &&
      event.target?.actorId === ctx.subjectId &&
      event.abilityGameId !== null &&
      consumableAuraFor(ctx.data, event.abilityGameId)?.kind === "POTION",
  );
  const castCoverage = gate(ctx, "CASTS", ctx.subjectId);
  const spellIds = [...new Set([...casts, ...potionAuraEvents].map((event) => event.abilityGameId ?? 0))];
  const castsAtMs = casts.map((event) => rel(ctx, event.reportTimeMs));
  const base = { timingPolicy: "ELITE_APL_TIMING" as const, castsAtMs };
  if (spellIds.length === 0) {
    if (castCoverage.ok && subjectAuras.ok) {
      const none = {
        state: "KNOWN_NONE" as const,
        source: { kind: "WCL_EVENTS" as const, field: "subject casts and auras" },
        basis: "no pinned potion cast or aura under COMPLETE subject cast and aura coverage",
      };
      return {
        ...base,
        identity: { state: "NOT_APPLICABLE", reason: "no potion used" },
        rank: { state: "NOT_APPLICABLE", reason: "no potion used" },
        rankOptions: [],
        uses: none,
      };
    }
    const reason = `subject cast coverage ${castCoverage.ok ? "COMPLETE" : castCoverage.reason}, aura coverage ${subjectAuras.ok ? "COMPLETE" : subjectAuras.reason}`;
    return {
      ...base,
      identity: unknownFact(reason, "WCL_EVENTS", "subject casts"),
      rank: { state: "NOT_APPLICABLE", reason: "identity unknown" },
      rankOptions: [],
      uses: unknownFact(reason, "WCL_EVENTS", "subject casts"),
    };
  }
  if (spellIds.length > 1) {
    const reason = `several potions observed (${spellIds.join(", ")})`;
    return {
      ...base,
      identity: unknownFact(reason, "WCL_EVENTS", "subject casts"),
      rank: { state: "NOT_APPLICABLE", reason },
      rankOptions: [],
      uses: unknownFact(reason, "WCL_EVENTS", "subject auras"),
    };
  }
  const spellId = spellIds[0] ?? 0;
  const aura = consumableAuraFor(ctx.data, spellId);
  const identity =
    aura === null
      ? unknownFact<ConsumableIdentity>("not in pinned data", "PINNED_GAME_DATA", "consumables")
      : known(
          { spellId, itemIds: aura.items.map((item) => item.itemId) },
          "WCL_EVENTS",
          `cast/aura ${String(spellId)}`,
        );
  const rank: Evidenced<ConsumableRank> =
    aura === null ? { state: "NOT_APPLICABLE", reason: "identity unknown" } : rankOf(aura);
  const rankOptions = aura === null ? [] : rankOptionsOf(ctx.data, aura);
  if (!subjectAuras.ok) {
    return {
      ...base,
      identity,
      rank,
      rankOptions,
      uses: unknownFact(`subject aura coverage ${subjectAuras.reason}`, "WCL_EVENTS", "subject potion auras"),
    };
  }
  const field = "subject potion aura events";
  const source: EvidenceSource = { kind: "WCL_EVENTS", field };
  const uses: PotionUse[] = [];
  let openFrom: number | null = null;
  for (const event of potionAuraEvents) {
    const time = rel(ctx, event.reportTimeMs);
    if (event.operation === "APPLIED") {
      openFrom = time;
    } else if (event.operation === "REMOVED" && !event.isStackChange) {
      uses.push({
        activeFromMs:
          openFrom === null
            ? unknownFact("active before the observed interval (no application event)", "WCL_EVENTS", field)
            : { state: "KNOWN", value: openFrom, source },
        activeToMs: { state: "KNOWN", value: time, source },
      });
      openFrom = null;
    }
  }
  if (openFrom !== null) {
    uses.push({
      activeFromMs: { state: "KNOWN", value: openFrom, source },
      activeToMs: unknownFact("no removal before the fight ended", "WCL_EVENTS", field),
    });
  }
  return { ...base, identity, rank, rankOptions, uses: known(uses, "WCL_EVENTS", field) };
}

/** An unresolved rank is acceptable only as a complete, fully representable rank set. */
function rankProblem(
  label: string,
  rank: Evidenced<ConsumableRank>,
  options: readonly RankOption[],
  block: Report,
  note: Report,
): "NONE" | "ENVELOPE" | "NOT_REPRESENTABLE" {
  if (rank.state !== "UNKNOWN") return "NONE";
  const unrepresentable = options.filter((option) => !option.representable);
  if (options.length === 0 || unrepresentable.length > 0) {
    block(
      "consumables",
      "CONSUMABLE_RANK_NOT_REPRESENTABLE",
      `${label}: rank UNKNOWN and ${options.length === 0 ? "no plausible rank is pinned" : `rank(s) ${unrepresentable.map((option) => String(option.itemLevel)).join("/")} have no unambiguous engine token`}`,
    );
    return "NOT_REPRESENTABLE";
  }
  note(
    "consumables",
    "RANK_ENVELOPE_RECORDED",
    `${label}: rank UNKNOWN; carried as the complete plausible rank set ${options.map((option) => `${String(option.itemLevel)}→${option.token}`).join(", ")} (an uncertainty envelope, never a chosen rank)`,
  );
  return "ENVELOPE";
}

function checkConsumables(
  consumables: ConsumablesComponent,
  block: Report,
  note: Report,
  check: (component: EnvironmentComponent, state: EnvironmentCheck["state"], detail: string) => void,
): void {
  const problems: string[] = [];
  const envelopes: string[] = [];
  let representable = true;
  for (const entry of consumables.setup) {
    if (entry.identity.state === "UNKNOWN") {
      block("consumables", "CONSUMABLE_UNKNOWN", `${entry.kind}: ${entry.identity.reason}`);
      problems.push(`${entry.kind} UNKNOWN`);
    } else {
      const outcome = rankProblem(entry.kind, entry.rank, entry.rankOptions, block, note);
      if (outcome === "NOT_REPRESENTABLE") {
        problems.push(`${entry.kind} rank not representable`);
        representable = false;
      } else if (outcome === "ENVELOPE") envelopes.push(`${entry.kind} rank envelope`);
    }
    if (entry.identity.state === "KNOWN" && entry.presence.state === "UNKNOWN") {
      block("consumables", "CONSUMABLE_UNKNOWN", `${entry.kind} presence: ${entry.presence.reason}`);
      problems.push(`${entry.kind} presence UNKNOWN`);
    }
  }
  const potion = consumables.potion;
  if (potion.identity.state === "UNKNOWN") {
    block("consumables", "CONSUMABLE_UNKNOWN", `POTION: ${potion.identity.reason}`);
    problems.push("POTION UNKNOWN");
  } else {
    const outcome = rankProblem("POTION", potion.rank, potion.rankOptions, block, note);
    if (outcome === "NOT_REPRESENTABLE") {
      problems.push("POTION rank not representable");
      representable = false;
    } else if (outcome === "ENVELOPE") envelopes.push("POTION rank envelope");
  }
  if (potion.uses.state === "UNKNOWN") {
    block("consumables", "CONSUMABLE_UNKNOWN", `POTION uses: ${potion.uses.reason}`);
    problems.push("POTION uses UNKNOWN");
  }
  for (const entry of consumables.temporaryEnchants) {
    if (entry.enchant.state === "UNKNOWN") {
      block("consumables", "CONSUMABLE_UNKNOWN", `${entry.slot} temporary enchant: ${entry.enchant.reason}`);
      problems.push(`${entry.slot} temporary enchant UNKNOWN`);
    } else if (entry.enchant.state === "KNOWN" && entry.enchant.value.engineToken === null) {
      block(
        "consumables",
        "CONSUMABLE_UNKNOWN",
        `${entry.slot} temporary enchant ${String(entry.enchant.value.enchantId)} has no pinned engine token`,
      );
      problems.push(`${entry.slot} temporary enchant unnamed`);
    } else if (entry.persistence.state === "UNKNOWN") {
      block(
        "consumables",
        "CONSUMABLE_UNKNOWN",
        `${entry.slot} temporary enchant persistence: ${entry.persistence.reason}`,
      );
      problems.push(`${entry.slot} temporary enchant persistence UNKNOWN`);
    }
  }
  check(
    "consumables",
    !representable ? "NOT_REPRESENTABLE" : problems.length > 0 ? "UNRESOLVED" : "RESOLVED",
    [...problems, ...envelopes].join("; ") || "every consumable established",
  );
}

// ---------------------------------------------------------------------------
// Tank load
// ---------------------------------------------------------------------------

function reconstructTankLoad(): TankLoadComponent {
  return {
    model: "STANDARD_TANK_LOAD_V1",
    version: TANK_LOAD_VERSION,
    revision: TANK_LOAD_REVISIONS.STANDARD_TANK_LOAD_V1,
    directives: tankLoadDirectives("STANDARD_TANK_LOAD_V1"),
    load: assumed("STANDARD_TANK_LOAD_V1" as const, STANDARD_TANK_LOAD),
  };
}
