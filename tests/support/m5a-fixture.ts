/**
 * Loads the committed Assassination fixture into a real `CombatState`.
 *
 * The fixture is a sanitized slice of report `A7R6kxPJ1hC8YQ4w` fight 7 at
 * revision 30. Events are driven through the REAL normalizer and the REAL M4
 * state engine, so tests exercise the same path production would.
 *
 * EVENTS ARE LOCATED BY FACT, NEVER BY CANONICAL POSITION. A slice renumbers
 * everything relative to the full fight, and a re-export renumbers it again, so
 * a test pinned to an index would be pinned to an artifact of the slicing rather
 * than to the evidence. `findCast` addresses an event the way the evidence
 * identifies it: actor, numeric ability id and report timestamp.
 */

import type { Finding } from "../../src/findings/finding.js";
import type { ObservedActionJudgment } from "../../src/findings/judgment.js";
import type { ScopedActionSelection } from "../../src/findings/scoped-selection.js";
import type { CombatFight } from "../../src/engine/normalization/combat-fight.js";
import { createCombatState, type CombatState } from "../../src/engine/state/combat-state.js";
import { committedEventArray } from "./corpus/artifacts.js";
import { corpusFight } from "./corpus/fight.js";

/** The canonical corpus artifact; provenance in tests/corpus/manifest.json. */
const fixture = committedEventArray("wcl-assassination-envenom-combo-points");

/** The source capture, recorded so a drifting fixture is traceable. */
export const M5A_FIXTURE_PROVENANCE = {
  reportCode: "A7R6kxPJ1hC8YQ4w",
  fightId: 7,
  reportRevision: 30,
  gameVersion: 1,
  logVersion: 17,
} as const;

export const ENVENOM_SPELL_ID = 32_645;
export const ASSASSINATION_ACTOR_A = 19;
export const ASSASSINATION_ACTOR_B = 13;

/** Report timestamps of the decision points the fixture was built around. */
export const M5A_EVENTS = {
  /** Envenom at 3 of 7 combo points. The first exact gameplay judgment. */
  envenomAtThree: { actorId: ASSASSINATION_ACTOR_B, reportTimeMs: 2_150_252 },
  envenomAtFive: { actorId: ASSASSINATION_ACTOR_A, reportTimeMs: 2_028_273 },
  envenomAtSix: { actorId: ASSASSINATION_ACTOR_A, reportTimeMs: 2_016_360 },
  envenomAtSeven: { actorId: ASSASSINATION_ACTOR_A, reportTimeMs: 2_013_095 },
  /** A real Envenom whose snapshot omits the combo-point entry entirely. */
  envenomWithoutComboPointEntry: { actorId: ASSASSINATION_ACTOR_A, reportTimeMs: 2_090_898 },
  /**
   * M5-B. Full combo points AND Energy at exactly 250/250, so `energy.pct` is
   * 100. The first exact scoped action selection rests on this event.
   */
  envenomAtSevenFullEnergy: { actorId: ASSASSINATION_ACTOR_A, reportTimeMs: 2_039_278 },
  /**
   * M5-B. Full combo points and Energy at 233/250, so `energy.pct` is 93.2.
   *
   * Load-bearing precisely because it is NOT at cap: an implementation that
   * special-cased `amount == max` instead of computing the ratio would pass the
   * 100% case and fail here.
   */
  envenomAtSevenHighEnergy: { actorId: ASSASSINATION_ACTOR_A, reportTimeMs: 2_019_463 },
} as const;

export const M5A_RAW_EVENTS = fixture as unknown as readonly Record<string, unknown>[];

/**
 * The fight, through the shared corpus coverage interpreter.
 *
 * This artifact was assembled from narrow, non-adjacent windows and retains
 * NO coverage grant, so every category is OBSERVABLE with nothing covered.
 * Every M5-A/B claim rests on the cast's own attached PRE_COST snapshot and on
 * the observed combatantinfo, neither of which needs coverage; anything that
 * would need an absence or a carry-forward is UNKNOWN here, honestly.
 */
function normalizeFixture(): CombatFight {
  return corpusFight("wcl-assassination-envenom-combo-points");
}

export function m5aFight(): CombatFight {
  return normalizeFixture();
}

export function m5aState(): CombatState {
  return createCombatState(normalizeFixture());
}

/**
 * A `CombatState` whose compatibility keys have been altered.
 *
 * Used to prove the wire contract fails closed. Only `provenance` is replaced;
 * every observation stays exactly as captured, so the test isolates the version
 * gate rather than also changing the evidence.
 */
export function m5aStateWithVersions(overrides: {
  readonly gameVersion?: number | null;
  readonly logVersion?: number;
}): CombatState {
  const fight = normalizeFixture();
  return createCombatState({
    ...fight,
    provenance: {
      ...fight.provenance,
      gameVersion: overrides.gameVersion === undefined ? fight.provenance.gameVersion : overrides.gameVersion,
      logVersion: overrides.logVersion ?? fight.provenance.logVersion,
    },
  });
}

/**
 * The canonical position of one observed cast, addressed by fact.
 *
 * Throws when the fixture does not contain it, because a silently absent event
 * would turn a real assertion into a vacuous one.
 */
export function findCast(
  state: CombatState,
  criteria: { readonly actorId: number; readonly reportTimeMs: number; readonly abilityGameId?: number },
): number {
  const abilityGameId = criteria.abilityGameId ?? ENVENOM_SPELL_ID;
  for (let position = 0; position < state.fight.events.length; position += 1) {
    const event = state.fight.events[position];
    if (event === undefined || event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    if (event.source?.actorId !== criteria.actorId) continue;
    if (event.abilityGameId !== abilityGameId) continue;
    if (event.reportTimeMs !== criteria.reportTimeMs) continue;
    return position;
  }
  throw new Error(
    `fixture has no COMPLETE cast of ${abilityGameId} by actor ${criteria.actorId} at ${criteria.reportTimeMs}`,
  );
}

/**
 * Narrows a finding's judgment to the OBSERVED-ACTION family.
 *
 * `Finding.judgment` is a union of two families, and a test asserting about a
 * `trace` or an `observedState` has to say which family it means. Throwing on a
 * mismatch keeps that explicit: a scoped result reaching an M5-A assertion is a
 * real defect, not something to silently skip past.
 */
export function observedActionJudgmentOf(finding: Finding): ObservedActionJudgment {
  const judgment = finding.judgment;
  if (judgment.kind !== "OBSERVED_ACTION_JUDGMENT") {
    throw new Error(`expected an observed-action judgment, got ${judgment.kind}`);
  }
  return judgment;
}

/** Narrows a finding's judgment to the SCOPED-SELECTION family. */
export function scopedSelectionOf(finding: Finding): ScopedActionSelection {
  const judgment = finding.judgment;
  if (judgment.kind !== "SCOPED_ACTION_SELECTION") {
    throw new Error(`expected a scoped action selection, got ${judgment.kind}`);
  }
  return judgment;
}
