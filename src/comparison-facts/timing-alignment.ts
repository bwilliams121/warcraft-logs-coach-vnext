/**
 * TIMING ALIGNMENT (M14-A): a subject fight and its comparison fights placed
 * on shared encounter LANDMARKS, post-hoc. It answers one question: "at the
 * same encounter moment, what did each fight show?" It never says which fight
 * did it right.
 *
 * A LANDMARK IS AN OBSERVED INSTANT, OR UNKNOWN
 *
 *   PULL                          the fight's recorded start (metadata): EXACT
 *                                 in every fight, offset 0 by definition
 *   RECORDED_FIGHT_END            the recorded end: EXACT only when finality is
 *                                 COMPLETED (otherwise where the record stops)
 *   PHASE_START (phaseId)         the typed phase transition; behind the same
 *                                 ENCOUNTER_PHASES absence gate M4's phaseAt
 *                                 uses, so an unverified or partial transition
 *                                 list is UNKNOWN, never "no phases"
 *   INTERMISSION_START (ordinal)  the k-th phase interval flagged INTERMISSION;
 *                                 an unstated flag before it makes the ordinal
 *                                 unprovable
 *   FIRST_FOCUS_DAMAGE_EVENT_ON_NPC (gameId)
 *                                 the focus's first observed damage event on any
 *                                 NPC instance of that game id (game ids, not
 *                                 report-local actor ids, are shared across
 *                                 reports): a target transition
 *   COOLDOWN_WINDOW_START (windowKind, ordinal)
 *                                 the k-th observed window start of a cooldown
 *                                 the specialization's post-hoc definition names
 *
 * How sure an anchor is follows the evidence basis, never more:
 *
 *   EXACT          observed, from an EXHAUSTIVE collection (or metadata)
 *   NO_LATER_THAN  observed, from an OBSERVED_ONLY collection: an unseen earlier
 *                  event may exist, and the k-th smallest of a superset is never
 *                  later than the k-th observed. M11-G2's AT_LEAST, for an instant.
 *   UNKNOWN        not observed, or not provable, with the reason
 *
 * A landmark absent from a fight is UNKNOWN. Nothing is interpolated, scaled,
 * shifted from another fight or filled from a nominal duration. No anchor
 * implies any certification of a comparison capture.
 *
 * Moment facts are computed only around an EXACT anchor, over a window that
 * lies inside the recorded fight, with the existing G2 summaries, so their
 * counts keep G2's EXACT / AT_LEAST / UNKNOWN semantics.
 *
 * POST-HOC. It reads completed fights, so nothing on the authority branch
 * imports it (tests/contracts/m11g2-comparison-facts-layering.test.ts).
 */

import type { CombatFight } from "../engine/normalization/combat-fight.js";
import { inclusiveRange } from "../engine/evidence/coverage.js";
import { derivePhaseIntervals, type PhaseInterval } from "../engine/state/encounter-state.js";
import { gateAbsenceClaim } from "../engine/state/state-result.js";
import { summarizeCasts, type CastSummary } from "./cast-facts.js";
import { observeCooldownWindows } from "./cooldown-windows.js";
import { summarizeDamage, type DamageSummary } from "./damage-ledger.js";
import type { FactCollectionClaim } from "./evidence-basis.js";
import type { ComparisonFightInput, PostHocDefinition } from "./fight-facts.js";

export type LandmarkKey =
  | { readonly kind: "PULL" }
  | { readonly kind: "RECORDED_FIGHT_END" }
  | { readonly kind: "PHASE_START"; readonly phaseId: number }
  | { readonly kind: "INTERMISSION_START"; readonly ordinal: number }
  | { readonly kind: "FIRST_FOCUS_DAMAGE_EVENT_ON_NPC"; readonly gameId: number }
  | { readonly kind: "COOLDOWN_WINDOW_START"; readonly windowKind: string; readonly ordinal: number };

export type LandmarkUnknownReason =
  | "NOT_OBSERVED_IN_FIGHT"
  | "FIGHT_NOT_COMPLETED"
  | "PHASE_TIMELINE_UNORDERED"
  | "INTERMISSION_FLAG_NOT_STATED_BEFORE_ORDINAL"
  | "WINDOW_START_NOT_OBSERVED_BEFORE_ORDINAL"
  | { readonly phaseEvidenceGate: string };

export type LandmarkAnchor =
  | {
      readonly kind: "EXACT";
      readonly reportTimeMs: number;
      readonly fightTimeMs: number;
      readonly evidence: string;
    }
  | {
      readonly kind: "NO_LATER_THAN";
      readonly reportTimeMs: number;
      readonly fightTimeMs: number;
      readonly evidence: string;
      readonly reason: "OBSERVED_ONLY_COLLECTION";
    }
  | { readonly kind: "UNKNOWN"; readonly reason: LandmarkUnknownReason };

export type AlignmentRole = "SUBJECT" | "COMPARISON";

export interface AlignedFight {
  readonly fightRef: string;
  readonly role: AlignmentRole;
  readonly basis: ComparisonFightInput["basis"]["kind"];
  readonly focusActorId: number;
  readonly fightStartMs: number;
  readonly fightEndMs: number;
  readonly finality: CombatFight["fight"]["finality"];
  /**
   * Whether this fight's phase transitions are held at all. With no phase row
   * in the alignment, this is what keeps "no phase landmark" from reading as
   * "the encounter had no phases".
   */
  readonly phaseEvidence:
    | { readonly kind: "HELD"; readonly transitions: number }
    | { readonly kind: "UNKNOWN"; readonly reason: LandmarkUnknownReason };
}

export interface LandmarkRow {
  /** A stable text id, e.g. `COOLDOWN_WINDOW_START:<kind>#2`. */
  readonly landmarkId: string;
  readonly key: LandmarkKey;
  /** One anchor per fight, in the alignment's fight order. */
  readonly anchors: readonly { readonly fightRef: string; readonly anchor: LandmarkAnchor }[];
}

export type AlignmentRefusal =
  "DUPLICATE_FIGHT_REF" | "ENCOUNTER_MISMATCH" | "DIFFICULTY_NOT_ESTABLISHED" | "DIFFICULTY_MISMATCH";

export type TimingAlignment =
  | {
      readonly kind: "ALIGNED";
      readonly encounterId: number;
      readonly difficulty: number;
      readonly fights: readonly AlignedFight[];
      readonly landmarks: readonly LandmarkRow[];
      /** M11-G2: comparison counts stay AT_LEAST; an anchor certifies nothing. */
      readonly comparisonCoverage: "AT_LEAST_UNCERTIFIED";
      readonly interpolation: "NONE";
    }
  | { readonly kind: "REFUSED"; readonly reason: AlignmentRefusal };

export interface AlignmentInput {
  readonly subject: ComparisonFightInput;
  readonly comparisons: readonly ComparisonFightInput[];
}

const NPC_LABELS = new Set(["WCL_BOSS_SUBTYPE", "WCL_ENEMY_NPC_CLASSIFIED", "OBSERVED_NPC_OTHER"]);

export function landmarkIdOf(key: LandmarkKey): string {
  switch (key.kind) {
    case "PULL":
    case "RECORDED_FIGHT_END":
      return key.kind;
    case "PHASE_START":
      return `PHASE_START:${String(key.phaseId)}`;
    case "INTERMISSION_START":
      return `INTERMISSION_START#${String(key.ordinal)}`;
    case "FIRST_FOCUS_DAMAGE_EVENT_ON_NPC":
      return `FIRST_FOCUS_DAMAGE_EVENT_ON_NPC:${String(key.gameId)}`;
    case "COOLDOWN_WINDOW_START":
      return `COOLDOWN_WINDOW_START:${key.windowKind}#${String(key.ordinal)}`;
  }
}

const KIND_ORDER: readonly LandmarkKey["kind"][] = [
  "PULL",
  "PHASE_START",
  "INTERMISSION_START",
  "FIRST_FOCUS_DAMAGE_EVENT_ON_NPC",
  "COOLDOWN_WINDOW_START",
  "RECORDED_FIGHT_END",
];

function compareKeys(left: LandmarkKey, right: LandmarkKey): number {
  const byKind = KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind);
  if (byKind !== 0) return byKind;
  if (left.kind === "PHASE_START" && right.kind === "PHASE_START") return left.phaseId - right.phaseId;
  if (left.kind === "INTERMISSION_START" && right.kind === "INTERMISSION_START")
    return left.ordinal - right.ordinal;
  if (left.kind === "FIRST_FOCUS_DAMAGE_EVENT_ON_NPC" && right.kind === "FIRST_FOCUS_DAMAGE_EVENT_ON_NPC")
    return left.gameId - right.gameId;
  if (left.kind === "COOLDOWN_WINDOW_START" && right.kind === "COOLDOWN_WINDOW_START")
    return left.windowKind === right.windowKind
      ? left.ordinal - right.ordinal
      : left.windowKind < right.windowKind
        ? -1
        : 1;
  return 0;
}

/** An observed instant under a collection claim: EXACT or NO_LATER_THAN, never more. */
function observedAnchor(
  fight: CombatFight,
  reportTimeMs: number,
  claim: FactCollectionClaim,
  evidence: string,
): LandmarkAnchor {
  const fightTimeMs = reportTimeMs - fight.fight.startTimeMs;
  return claim === "EXHAUSTIVE"
    ? { kind: "EXACT", reportTimeMs, fightTimeMs, evidence }
    : { kind: "NO_LATER_THAN", reportTimeMs, fightTimeMs, evidence, reason: "OBSERVED_ONLY_COLLECTION" };
}

/** Per fight: the phase intervals, only when the whole transition list passes M4's gate. */
type PhaseEvidence =
  | { readonly kind: "HELD"; readonly intervals: readonly PhaseInterval[] }
  | { readonly kind: "UNKNOWN"; readonly reason: LandmarkUnknownReason };

function phaseEvidenceOf(fight: CombatFight): PhaseEvidence {
  const gate = gateAbsenceClaim({
    completeness: fight.completeness,
    category: "ENCOUNTER_PHASES",
    range: inclusiveRange(fight.fight.startTimeMs, fight.fight.endTimeMs),
    actorId: null,
  });
  if (!gate.ok) return { kind: "UNKNOWN", reason: { phaseEvidenceGate: gate.reason } };
  const intervals = derivePhaseIntervals(fight);
  if (intervals.length === 0 && fight.phases.length > 0)
    return { kind: "UNKNOWN", reason: "PHASE_TIMELINE_UNORDERED" };
  return { kind: "HELD", intervals };
}

/** Everything one fight observed, keyed by landmark id. */
interface FightLandmarks {
  readonly keys: readonly LandmarkKey[];
  anchorOf(key: LandmarkKey): LandmarkAnchor;
}

function fightLandmarks(input: ComparisonFightInput, definition: PostHocDefinition): FightLandmarks {
  const { fight, basis, focusActorId, enemyNpcs } = input;
  const keys: LandmarkKey[] = [{ kind: "PULL" }, { kind: "RECORDED_FIGHT_END" }];
  const anchors = new Map<string, LandmarkAnchor>();
  const put = (key: LandmarkKey, anchor: LandmarkAnchor): void => {
    keys.push(key);
    anchors.set(landmarkIdOf(key), anchor);
  };

  // Ordinals past an unprovable predecessor: from this ordinal on, UNKNOWN.
  let intermissionBlockedFrom: number | null = null;
  const windowsBlockedFrom = new Map<string, number>();

  const phases = phaseEvidenceOf(fight);
  if (phases.kind === "HELD") {
    const seen = new Set<number>();
    for (const interval of phases.intervals) {
      if (seen.has(interval.phaseId)) continue;
      seen.add(interval.phaseId);
      put(
        { kind: "PHASE_START", phaseId: interval.phaseId },
        observedAnchor(
          fight,
          interval.startTimeMs,
          "EXHAUSTIVE",
          `fight.phases[${String(interval.phaseIndex)}]`,
        ),
      );
    }
    let ordinal = 0;
    for (const interval of phases.intervals) {
      if (interval.intermission === "UNKNOWN") {
        intermissionBlockedFrom = ordinal + 1;
        break;
      }
      if (interval.intermission !== "INTERMISSION") continue;
      ordinal += 1;
      put(
        { kind: "INTERMISSION_START", ordinal },
        observedAnchor(
          fight,
          interval.startTimeMs,
          "EXHAUSTIVE",
          `fight.phases[${String(interval.phaseIndex)}]`,
        ),
      );
    }
  }

  const fightWindow = { startMs: fight.fight.startTimeMs, endMs: fight.fight.endTimeMs };
  const damage = summarizeDamage(fight, basis, [focusActorId], fightWindow, enemyNpcs);
  const firstByGameId = new Map<number, number>();
  for (const entry of damage.participation.items) {
    const gameId = entry.description.gameId;
    if (gameId === null || !NPC_LABELS.has(entry.description.label)) continue;
    const known = firstByGameId.get(gameId);
    if (known === undefined || entry.firstObservedHitMs < known)
      firstByGameId.set(gameId, entry.firstObservedHitMs);
  }
  for (const [gameId, at] of firstByGameId) {
    put(
      { kind: "FIRST_FOCUS_DAMAGE_EVENT_ON_NPC", gameId },
      observedAnchor(
        fight,
        at,
        damage.participation.claim,
        `focus ${String(focusActorId)} damage participation`,
      ),
    );
  }

  for (const cooldown of definition.cooldownWindows) {
    const facts = observeCooldownWindows(fight, basis, focusActorId, cooldown);
    let ordinal = 0;
    for (const window of facts.windows.items) {
      if (window.start.kind !== "OBSERVED") {
        windowsBlockedFrom.set(cooldown.windowKind, ordinal + 1);
        break;
      }
      ordinal += 1;
      put(
        { kind: "COOLDOWN_WINDOW_START", windowKind: cooldown.windowKind, ordinal },
        observedAnchor(
          fight,
          window.start.reportTimeMs,
          facts.windows.claim,
          `${cooldown.windowKind} window ${String(window.index)}`,
        ),
      );
    }
  }

  return {
    keys,
    anchorOf(key) {
      switch (key.kind) {
        case "PULL":
          return {
            kind: "EXACT",
            reportTimeMs: fight.fight.startTimeMs,
            fightTimeMs: 0,
            evidence: "fight.startTimeMs",
          };
        case "RECORDED_FIGHT_END":
          return fight.fight.finality === "COMPLETED"
            ? {
                kind: "EXACT",
                reportTimeMs: fight.fight.endTimeMs,
                fightTimeMs: fight.fight.endTimeMs - fight.fight.startTimeMs,
                evidence: "fight.endTimeMs",
              }
            : { kind: "UNKNOWN", reason: "FIGHT_NOT_COMPLETED" };
        default: {
          const held = anchors.get(landmarkIdOf(key));
          if (held !== undefined) return held;
          if ((key.kind === "PHASE_START" || key.kind === "INTERMISSION_START") && phases.kind === "UNKNOWN")
            return { kind: "UNKNOWN", reason: phases.reason };
          if (
            key.kind === "INTERMISSION_START" &&
            intermissionBlockedFrom !== null &&
            key.ordinal >= intermissionBlockedFrom
          )
            return { kind: "UNKNOWN", reason: "INTERMISSION_FLAG_NOT_STATED_BEFORE_ORDINAL" };
          if (key.kind === "COOLDOWN_WINDOW_START") {
            const blocked = windowsBlockedFrom.get(key.windowKind);
            if (blocked !== undefined && key.ordinal >= blocked)
              return { kind: "UNKNOWN", reason: "WINDOW_START_NOT_OBSERVED_BEFORE_ORDINAL" };
          }
          return { kind: "UNKNOWN", reason: "NOT_OBSERVED_IN_FIGHT" };
        }
      }
    },
  };
}

/** Align the subject and its comparisons on every landmark any of them observed. */
export function alignFights(input: AlignmentInput, definition: PostHocDefinition): TimingAlignment {
  const all = [
    { role: "SUBJECT" as const, entry: input.subject },
    ...input.comparisons.map((entry) => ({ role: "COMPARISON" as const, entry })),
  ];
  const refs = new Set(all.map(({ entry }) => entry.fightRef));
  if (refs.size !== all.length) return { kind: "REFUSED", reason: "DUPLICATE_FIGHT_REF" };
  const { encounterId, difficulty } = input.subject.fight.fight;
  if (all.some(({ entry }) => entry.fight.fight.encounterId !== encounterId))
    return { kind: "REFUSED", reason: "ENCOUNTER_MISMATCH" };
  if (difficulty === null || all.some(({ entry }) => entry.fight.fight.difficulty === null))
    return { kind: "REFUSED", reason: "DIFFICULTY_NOT_ESTABLISHED" };
  if (all.some(({ entry }) => entry.fight.fight.difficulty !== difficulty))
    return { kind: "REFUSED", reason: "DIFFICULTY_MISMATCH" };

  const perFight = all.map(({ entry }) => fightLandmarks(entry, definition));
  const union = new Map<string, LandmarkKey>();
  for (const landmarks of perFight) for (const key of landmarks.keys) union.set(landmarkIdOf(key), key);
  const keys = [...union.values()].sort(compareKeys);
  return {
    kind: "ALIGNED",
    encounterId,
    difficulty,
    fights: all.map(({ role, entry }) => ({
      fightRef: entry.fightRef,
      role,
      basis: entry.basis.kind,
      focusActorId: entry.focusActorId,
      fightStartMs: entry.fight.fight.startTimeMs,
      fightEndMs: entry.fight.fight.endTimeMs,
      finality: entry.fight.fight.finality,
      phaseEvidence: (() => {
        const phases = phaseEvidenceOf(entry.fight);
        return phases.kind === "HELD"
          ? { kind: "HELD" as const, transitions: phases.intervals.length }
          : { kind: "UNKNOWN" as const, reason: phases.reason };
      })(),
    })),
    landmarks: keys.map((key) => ({
      landmarkId: landmarkIdOf(key),
      key,
      anchors: all.map(({ entry }, index) => ({
        fightRef: entry.fightRef,
        anchor: (perFight[index] as FightLandmarks).anchorOf(key),
      })),
    })),
    comparisonCoverage: "AT_LEAST_UNCERTIFIED",
    interpolation: "NONE",
  };
}

// ---------------------------------------------------------------------------
// What each fight showed at the same encounter moment
// ---------------------------------------------------------------------------

export interface MomentOffsets {
  /** Relative to the landmark, in ms; the window is [from, to). */
  readonly fromMs: number;
  readonly toMs: number;
}

export type MomentFightFacts =
  | {
      readonly fightRef: string;
      readonly kind: "SLICED";
      readonly window: { readonly startMs: number; readonly endMs: number };
      readonly focusCasts: CastSummary;
      readonly focusDamage: DamageSummary;
    }
  | {
      readonly fightRef: string;
      readonly kind: "UNKNOWN";
      readonly reason: "ANCHOR_NOT_EXACT" | "ANCHOR_UNKNOWN" | "WINDOW_OUTSIDE_RECORDED_FIGHT";
      readonly anchor: LandmarkAnchor;
    };

export type MomentFacts =
  | {
      readonly kind: "MOMENT";
      readonly landmarkId: string;
      readonly offsets: MomentOffsets;
      readonly fights: readonly MomentFightFacts[];
    }
  | {
      readonly kind: "REFUSED";
      readonly reason: "ALIGNMENT_REFUSED" | "UNKNOWN_LANDMARK" | "INVALID_OFFSETS";
    };

/**
 * The same encounter moment in every fight: [landmark + from, landmark + to).
 * Only an EXACT anchor places a window; a NO_LATER_THAN anchor is a bound,
 * and a window placed on a bound would be a guessed instant.
 *
 * The alignment is recomputed from exactly these inputs and never accepted
 * from the caller, so an anchor can only come from the fight, focus and
 * evidence it slices: a stale alignment cannot be applied to a changed focus
 * or changed evidence under the same fight ref.
 */
export function factsAtAlignedMoment(
  input: AlignmentInput,
  definition: PostHocDefinition,
  landmarkId: string,
  offsets: MomentOffsets,
): MomentFacts {
  if (
    !Number.isSafeInteger(offsets.fromMs) ||
    !Number.isSafeInteger(offsets.toMs) ||
    offsets.fromMs >= offsets.toMs
  )
    return { kind: "REFUSED", reason: "INVALID_OFFSETS" };
  const alignment = alignFights(input, definition);
  if (alignment.kind === "REFUSED") return { kind: "REFUSED", reason: "ALIGNMENT_REFUSED" };
  const row = alignment.landmarks.find((entry) => entry.landmarkId === landmarkId);
  if (row === undefined) return { kind: "REFUSED", reason: "UNKNOWN_LANDMARK" };
  const inputs = [input.subject, ...input.comparisons];
  return {
    kind: "MOMENT",
    landmarkId,
    offsets,
    fights: inputs.map((entry, index): MomentFightFacts => {
      const anchor = (row.anchors[index] as (typeof row.anchors)[number]).anchor;
      if (anchor.kind === "UNKNOWN")
        return { fightRef: entry.fightRef, kind: "UNKNOWN", reason: "ANCHOR_UNKNOWN", anchor };
      if (anchor.kind !== "EXACT")
        return { fightRef: entry.fightRef, kind: "UNKNOWN", reason: "ANCHOR_NOT_EXACT", anchor };
      const window = {
        startMs: anchor.reportTimeMs + offsets.fromMs,
        endMs: anchor.reportTimeMs + offsets.toMs,
      };
      const { fight, basis, focusActorId, enemyNpcs } = entry;
      if (window.startMs < fight.fight.startTimeMs || window.endMs > fight.fight.endTimeMs)
        return { fightRef: entry.fightRef, kind: "UNKNOWN", reason: "WINDOW_OUTSIDE_RECORDED_FIGHT", anchor };
      return {
        fightRef: entry.fightRef,
        kind: "SLICED",
        window,
        focusCasts: summarizeCasts(fight, basis, [focusActorId], window),
        focusDamage: summarizeDamage(fight, basis, [focusActorId], window, enemyNpcs),
      };
    }),
  };
}
