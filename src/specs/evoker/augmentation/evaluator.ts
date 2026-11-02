/**
 * AUGMENTATION EVOKER EVALUATOR (M13-A): the Augmentation Foundation,
 * internal.
 *
 * Owner decision (2026-11-01, agent/autopilot-queue.md "M13-A"): the
 * foundation establishes OBSERVABLE FACTS only.
 *
 * SUPPORT_TARGETING. No approved, machine-usable recipient-quality model
 * exists, so recipient quality is NO_AUTHORITY_AVAILABLE, whoever received
 * the buff. If a model is later declared but the ally state it needs was not
 * retrieved, the answer is UNKNOWN (`supportTargetingStatus`). Neither ever
 * says "wrong Prescience target", and neither is inferred from a higher
 * parse or another raid's recipients.
 *
 * SUPPORT_TIMING. No timing standard is approved either: NO_AUTHORITY_AVAILABLE.
 * The timing FACTS are reported: when each support ability was cast.
 *
 * Observations (authority WCL_OBSERVED_FACT), all from shared `src/support/`
 * primitives over the specialization's own pinned identities:
 * - each Ebon Might and Prescience window on each recipient, with recipient
 *   identity from the actor catalog, its observed deaths inside the observed
 *   span (never "alive"), and the recipient's own casts of its reviewed
 *   cooldowns inside it. Since M13-C the ids come from the shared reviewed
 *   registry (`src/data/game/recipient-cooldown-identities.ts`), looked up by
 *   the recipient's stated specialization; each window carries that lookup,
 *   so NO_COOLDOWN_IDENTITY always says why (specialization UNKNOWN, or no
 *   reviewed identity: UNSUPPORTED). The ids are a REVIEWED_SUBSET: "none of
 *   these was cast" is never "no cooldown was used";
 * - each recipient's Warcraft Logs-stated specialization (M13-B), read from
 *   `CombatFight.friendlySpecializations`: UNKNOWN with the reason when none
 *   is established, and a pet recipient is NOT_IN_FRIENDLY_ROSTER, never its
 *   owner's. Read here rather than in `src/support/`, which holds no
 *   specialization vocabulary;
 * - the Evoker's own Ebon Might windows;
 * - proven support time per ability (active spans only: continuity
 *   established): always a lower bound, since a carried-in buff is never
 *   excluded, and UNKNOWN when nothing is proven;
 * - every support-ability cast, Breath of Eons included, with its listing
 *   completeness.
 *
 * Nothing here is a finding: there is no expected action and no player
 * failure. Actionability is therefore not evaluated.
 */

import { inclusiveRange } from "../../../engine/evidence/coverage.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import type { CombatFight } from "../../../engine/normalization/combat-fight.js";
import {
  statedSpecializationOf,
  type StatedSpecialization,
} from "../../../engine/normalization/friendly-specializations.js";
import {
  gateAbsenceClaim,
  gateCertifiedAbsenceClaim,
  type UnknownReason,
} from "../../../engine/state/state-result.js";
import {
  AUGMENTATION_SUPPORT_ABILITY_KEYS,
  pinnedAugmentationSupportAbilities,
  type AugmentationSupportAbilityKey,
  type AugmentationSupportAbilityLoad,
} from "../../../data/game/evoker-augmentation-support-abilities.js";
import {
  pinnedRecipientCooldownIdentities,
  recipientCooldownIdentityOf,
  type RecipientCooldownIdentityResolution,
  type RecipientCooldownRegistryLoad,
} from "../../../data/game/recipient-cooldown-identities.js";
import {
  recipientCooldownOverlap,
  recipientSurvivalDuring,
  supportTimeOf,
  type CooldownOverlap,
  type RecipientSurvival,
  type SupportTime,
} from "../../../support/recipient-facts.js";
import {
  supportAuraWindowsOf,
  type SupportAuraWindow,
  type SupportAuraWindows,
} from "../../../support/support-aura-windows.js";
import type { EvidenceCategory } from "../../../wcl/evidence-capability.js";
import type { FightIdentity } from "../../../wcl/types.js";

import {
  AUGMENTATION_EVOKER_EVALUATOR_REVISION,
  AUGMENTATION_EVOKER_WCL_CLASS_NAME,
  AUGMENTATION_EVOKER_WCL_SPEC_NAME,
} from "./spec.js";

// ---------------------------------------------------------------------------
// SUPPORT_TARGETING authority
// ---------------------------------------------------------------------------

/**
 * A recipient-quality model, should one ever be approved: its id and the ally
 * evidence it needs for every recipient. None exists in v1.
 */
export interface RecipientQualityModelDeclaration {
  readonly modelId: string;
  readonly requiredAllyCategories: readonly EvidenceCategory[];
}

export type SupportTargetingStatus =
  | {
      readonly category: "SUPPORT_TARGETING";
      readonly status: "NO_AUTHORITY_AVAILABLE";
      readonly reason: "NO_APPROVED_RECIPIENT_QUALITY_MODEL";
    }
  | {
      readonly category: "SUPPORT_TARGETING";
      readonly status: "UNKNOWN";
      readonly modelId: string;
      /** The first recipient whose required ally evidence is missing, and why. */
      readonly missing: {
        readonly recipientActorId: number;
        readonly category: EvidenceCategory;
        readonly reason: UnknownReason;
      };
    }
  | {
      readonly category: "SUPPORT_TARGETING";
      /** The declared model could be applied. No v1 caller reaches this: no model exists. */
      readonly status: "ALLY_STATE_SUFFICIENT";
      readonly modelId: string;
    };

/**
 * Which failure state recipient quality is in. No model: NO_AUTHORITY_AVAILABLE
 * (no standard). A model whose ally evidence is missing for any recipient
 * over its window: UNKNOWN (a standard, without the evidence to apply it).
 */
export function supportTargetingStatus(
  fight: CombatFight,
  windows: readonly SupportAuraWindow[],
  model: RecipientQualityModelDeclaration | null,
): SupportTargetingStatus {
  if (model === null) {
    return {
      category: "SUPPORT_TARGETING",
      status: "NO_AUTHORITY_AVAILABLE",
      reason: "NO_APPROVED_RECIPIENT_QUALITY_MODEL",
    };
  }
  for (const window of windows) {
    for (const category of model.requiredAllyCategories) {
      const gate = gateAbsenceClaim({
        completeness: fight.completeness,
        category,
        range: window.observedSpan,
        actorId: window.recipient.actorId,
      });
      if (!gate.ok) {
        return {
          category: "SUPPORT_TARGETING",
          status: "UNKNOWN",
          modelId: model.modelId,
          missing: { recipientActorId: window.recipient.actorId, category, reason: gate.reason },
        };
      }
    }
  }
  return { category: "SUPPORT_TARGETING", status: "ALLY_STATE_SUFFICIENT", modelId: model.modelId };
}

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export interface RecipientWindowFacts {
  readonly window: SupportAuraWindow;
  /** M13-B: the recipient's stated specialization, observed identity only. */
  readonly recipientSpecialization: StatedSpecialization;
  /** M13-C: the reviewed cooldown ids `cooldownOverlap` used, or why there are none. */
  readonly recipientCooldownIdentity: RecipientCooldownIdentityResolution;
  readonly survival: RecipientSurvival;
  readonly cooldownOverlap: CooldownOverlap;
}

export interface AllyBuffObservation {
  readonly ability: AugmentationSupportAbilityKey;
  readonly auraAbilityGameId: number;
  /** Whether `windows` is every window of this buff from the Evoker in the fight. */
  readonly listing: SupportAuraWindows["listing"];
  readonly windows: readonly RecipientWindowFacts[];
  readonly supportTime: SupportTime;
  /** Transitions that might be the Evoker's but cannot be attributed. Never read as the Evoker's. */
  readonly ambiguousTransitions: number;
}

export interface SupportCast {
  readonly ability: AugmentationSupportAbilityKey;
  readonly abilityGameId: number;
  readonly reportTimeMs: number;
  readonly locator: EvidenceLocator;
}

export interface SupportTimingObservation {
  readonly category: "SUPPORT_TIMING";
  /** Timing quality: no approved standard. */
  readonly status: "NO_AUTHORITY_AVAILABLE";
  readonly reason: "NO_APPROVED_SUPPORT_TIMING_STANDARD";
  readonly authorityForFacts: "WCL_OBSERVED_FACT";
  readonly casts: readonly SupportCast[];
  /**
   * COMPLETE: every support-ability cast by the Evoker in the fight is listed.
   * Needs the Evoker's CASTS coverage over the fight (or, M13-D, certified
   * coverage of its completed casts of every support cast id), no completed cast of the
   * Evoker without an ability id, and no completed support-ability (or
   * ability-less) cast whose source is not stated: any of those could be an
   * unlisted support cast.
   */
  readonly listing:
    | { readonly state: "COMPLETE" }
    | {
        readonly state: "UNKNOWN";
        readonly reason: UnknownReason | "UNIDENTIFIED_SUBJECT_CAST" | "UNATTRIBUTED_CAST";
        readonly unidentifiedCasts: number;
        readonly unattributedCasts: number;
      };
}

export type AugmentationEvokerEvaluation =
  | {
      readonly revision: typeof AUGMENTATION_EVOKER_EVALUATOR_REVISION;
      readonly state: "IDENTITY_REFUSED";
      readonly reason:
        "IDENTITY_MISMATCH" | "NOT_THIS_SPECIALIZATION" | "IDENTITY_UNRESOLVED" | "IDENTITY_CONFLICT";
    }
  | {
      readonly revision: typeof AUGMENTATION_EVOKER_EVALUATOR_REVISION;
      readonly state: "RUNTIME_DATA_UNAVAILABLE";
      readonly reason: string;
    }
  | {
      readonly revision: typeof AUGMENTATION_EVOKER_EVALUATOR_REVISION;
      readonly state: "EVALUATED";
      readonly subjectActorId: number;
      readonly dataset: { readonly datasetId: string; readonly artifactRevision: string };
      /** Ebon Might and Prescience on their recipients. */
      readonly allyBuffs: readonly AllyBuffObservation[];
      /** The Evoker's own Ebon Might windows. */
      readonly selfBuffs: readonly {
        readonly ability: AugmentationSupportAbilityKey;
        readonly auraAbilityGameId: number;
        readonly windows: SupportAuraWindows;
      }[];
      readonly supportTiming: SupportTimingObservation;
      readonly supportTargeting: SupportTargetingStatus;
    };

/**
 * The subject identity the gate reads. The identity preflight's
 * `FightIdentity` is one; M13-E's registration facade builds one from the
 * normalized fight's own report, fight and stated specialization.
 */
export interface AugmentationSubjectIdentity {
  readonly report: Pick<FightIdentity["report"], "code">;
  readonly fight: Pick<FightIdentity["fight"], "id">;
  readonly player: Pick<FightIdentity["player"], "sourceId" | "className" | "specName">;
}

export interface AugmentationEvokerInput {
  readonly fight: CombatFight;
  /** The identity of the player under evaluation (the preflight's, or the facade's). */
  readonly identity: AugmentationSubjectIdentity;
  /** Test seam: the runtime dataset. */
  readonly dataset?: AugmentationSupportAbilityLoad;
  /** Test seam: the shared reviewed recipient cooldown registry. */
  readonly cooldownRegistry?: RecipientCooldownRegistryLoad;
}

type Refusal = Extract<AugmentationEvokerEvaluation, { state: "IDENTITY_REFUSED" }>["reason"];

function identityRefusal(fight: CombatFight, identity: AugmentationSubjectIdentity): Refusal | null {
  if (identity.report.code !== fight.report.code || identity.fight.id !== fight.fight.id) {
    return "IDENTITY_MISMATCH";
  }
  const { player } = identity;
  if (
    player.className !== AUGMENTATION_EVOKER_WCL_CLASS_NAME ||
    player.specName !== AUGMENTATION_EVOKER_WCL_SPEC_NAME
  ) {
    return "NOT_THIS_SPECIALIZATION";
  }
  const actor = fight.actors.get(player.sourceId);
  if (actor === undefined) return "IDENTITY_UNRESOLVED";
  if (actor.actorType !== "PLAYER" || actor.subType !== AUGMENTATION_EVOKER_WCL_CLASS_NAME) {
    return "IDENTITY_CONFLICT";
  }
  return null;
}

/** Evaluates one Augmentation Evoker in one fight. Pure. */
export function evaluateAugmentationEvoker(input: AugmentationEvokerInput): AugmentationEvokerEvaluation {
  const revision = AUGMENTATION_EVOKER_EVALUATOR_REVISION;
  const { fight, identity } = input;
  const refusal = identityRefusal(fight, identity);
  if (refusal !== null) return { revision, state: "IDENTITY_REFUSED", reason: refusal };
  const dataset = input.dataset ?? pinnedAugmentationSupportAbilities();
  if (!dataset.ok) return { revision, state: "RUNTIME_DATA_UNAVAILABLE", reason: dataset.reason };

  const subject = identity.player.sourceId;
  const registry = input.cooldownRegistry ?? pinnedRecipientCooldownIdentities();
  // One lookup per recipient actor, by its own stated specialization: a pet is
  // NOT_IN_FRIENDLY_ROSTER, never its owner's.
  const lookups = new Map<number, RecipientCooldownIdentityResolution>();
  const cooldownIdentity = new Map<number, readonly number[]>();
  const lookupOf = (actorId: number): RecipientCooldownIdentityResolution => {
    const known = lookups.get(actorId);
    if (known !== undefined) return known;
    const resolved = recipientCooldownIdentityOf(
      statedSpecializationOf(fight.friendlySpecializations, actorId),
      registry,
    );
    lookups.set(actorId, resolved);
    if (resolved.state === "IDENTIFIED") cooldownIdentity.set(actorId, resolved.abilityGameIds);
    return resolved;
  };
  const fightRange = inclusiveRange(fight.fight.startTimeMs, fight.fight.endTimeMs);

  const allyBuffs: AllyBuffObservation[] = [];
  const selfBuffs: {
    ability: AugmentationSupportAbilityKey;
    auraAbilityGameId: number;
    windows: SupportAuraWindows;
  }[] = [];
  const allyWindows: SupportAuraWindow[] = [];
  const supportAbilities = dataset.abilities;
  for (const key of AUGMENTATION_SUPPORT_ABILITY_KEYS) {
    const ability = supportAbilities.get(key);
    if (ability === undefined) continue;
    if (ability.allyAura !== null) {
      const auraId = ability.allyAura.abilityGameId;
      const listed = supportAuraWindowsOf(
        fight,
        { supporterActorId: subject, auraAbilityGameIds: [auraId] },
        fightRange,
      );
      // The Evoker's own copy of an ally aura id is not support to an ally.
      const toAllies = listed.windows.filter((window) => window.recipient.actorId !== subject);
      allyWindows.push(...toAllies);
      allyBuffs.push({
        ability: key,
        auraAbilityGameId: auraId,
        listing: listed.listing,
        windows: toAllies.map((window) => {
          const recipientCooldownIdentity = lookupOf(window.recipient.actorId);
          return {
            window,
            recipientSpecialization: statedSpecializationOf(
              fight.friendlySpecializations,
              window.recipient.actorId,
            ),
            recipientCooldownIdentity,
            survival: recipientSurvivalDuring(fight, window),
            cooldownOverlap: recipientCooldownOverlap(fight, window, cooldownIdentity),
          };
        }),
        supportTime: supportTimeOf({ ...listed, windows: toAllies }, [auraId]),
        ambiguousTransitions: listed.ambiguousTransitions.length,
      });
    }
    if (ability.selfAura !== null) {
      const auraId = ability.selfAura.abilityGameId;
      const listed = supportAuraWindowsOf(
        fight,
        { supporterActorId: subject, auraAbilityGameIds: [auraId] },
        fightRange,
      );
      selfBuffs.push({
        ability: key,
        auraAbilityGameId: auraId,
        windows: {
          ...listed,
          windows: listed.windows.filter((window) => window.recipient.actorId === subject),
        },
      });
    }
  }

  // Support-ability casts, and whether the list is complete.
  const castKeys = new Map<number, AugmentationSupportAbilityKey>();
  for (const ability of dataset.abilities.values()) {
    for (const id of ability.castAbilityGameIds) castKeys.set(id, ability.key);
  }
  const casts: SupportCast[] = [];
  let unidentifiedCasts = 0;
  let unattributedCasts = 0;
  for (const event of fight.events) {
    if (event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    if (event.reportTimeMs < fight.fight.startTimeMs || event.reportTimeMs > fight.fight.endTimeMs) continue;
    if (event.source === null) {
      // No stated source: it could be the Evoker's.
      if (event.abilityGameId === null || castKeys.has(event.abilityGameId)) unattributedCasts += 1;
      continue;
    }
    if (event.source.actorId !== subject) continue;
    if (event.abilityGameId === null) {
      unidentifiedCasts += 1;
      continue;
    }
    const key = castKeys.get(event.abilityGameId);
    if (key === undefined) continue;
    casts.push({
      ability: key,
      abilityGameId: event.abilityGameId,
      reportTimeMs: event.reportTimeMs,
      locator: event.locator,
    });
  }
  const castGate = gateCertifiedAbsenceClaim({
    completeness: fight.completeness,
    category: "CASTS",
    range: fightRange,
    actorId: subject,
    // M13-D: certified coverage must prove EVERY support cast id, a never-cast one included.
    predicate: { kind: "COMPLETED_CASTS", sourceActorId: subject, abilityGameIds: [...castKeys.keys()] },
  });
  const listing: SupportTimingObservation["listing"] = !castGate.ok
    ? { state: "UNKNOWN", reason: castGate.reason, unidentifiedCasts, unattributedCasts }
    : unidentifiedCasts > 0
      ? { state: "UNKNOWN", reason: "UNIDENTIFIED_SUBJECT_CAST", unidentifiedCasts, unattributedCasts }
      : unattributedCasts > 0
        ? { state: "UNKNOWN", reason: "UNATTRIBUTED_CAST", unidentifiedCasts, unattributedCasts }
        : { state: "COMPLETE" };

  return {
    revision,
    state: "EVALUATED",
    subjectActorId: subject,
    dataset: { datasetId: dataset.datasetId, artifactRevision: dataset.artifactRevision },
    allyBuffs,
    selfBuffs,
    supportTiming: {
      category: "SUPPORT_TIMING",
      status: "NO_AUTHORITY_AVAILABLE",
      reason: "NO_APPROVED_SUPPORT_TIMING_STANDARD",
      authorityForFacts: "WCL_OBSERVED_FACT",
      casts,
      listing,
    },
    // v1: no recipient-quality model exists, so none is declared.
    supportTargeting: supportTargetingStatus(fight, allyWindows, null),
  };
}
