/**
 * The M5-D2 real single-target decision corpus.
 *
 * SEVEN REAL DECISIONS from one real pull, each chosen MECHANICALLY from the
 * full-fight cast census rather than picked because it produced a nice answer.
 * The selection rule for each case is recorded on the case itself, so a reader
 * can re-derive the choice instead of trusting it.
 *
 * WHAT THE CORPUS IS FOR
 *
 * Two different jobs, kept apart:
 *
 *   Cases 1, 3, 4, 5   AUTHORITY VERIFICATION of an OBSERVED decision. The query
 *                      position IS a cast the player made, and the observed
 *                      execution is what proves the action was usable. These ask
 *                      "given that this fired, what does the pinned authority
 *                      select here, and can we name it exactly?"
 *
 *   Cases 2, 6, 7      EPISTEMIC BOUNDARIES. Each is expected to stay UNKNOWN,
 *                      for a different and permanent reason. They exist so the
 *                      refusals cannot silently become answers.
 *
 * WHAT THE CORPUS IS NOT
 *
 * It is not next-action prediction. This build cannot say what the authority
 * would select at an arbitrary moment, because its only positive usability proof
 * is the observed execution — see case 2, which measures exactly that boundary.
 *
 * And no case is a coaching verdict. Nothing here says the player was right or
 * wrong. `EXACT_ENTRY` means the authority's choice was identified, not endorsed.
 */

import { RESOURCE_WIRE_CONTRACTS } from "../../src/data/wcl-wire/resource-types.js";
import { resolveModelledTalents } from "../../src/data/game/rogue-talents.js";
import { pinnedAssassinationAuthority } from "../../src/simc/pinned-authority.js";
import type { AplAuthority } from "../../src/simc/apl-authority.js";
import type { RotationalGcdResult } from "../../src/simc/first-gcd-selection.js";
import { rotationalBindingsAt } from "../../src/specs/rogue/assassination/rotational-traversal.js";
import { authorityProfileFor } from "../../src/specs/rogue/assassination/observed-profile.js";
import {
  firstGcdSelectionAt,
  type FirstGcdQueryOutcome,
} from "../../src/specs/rogue/assassination/first-gcd-adapter.js";
import { resolveOneForegroundScan, type TraversalStep } from "../../src/simc/nested-selection.js";
import {
  resolveApplicability,
  resolveUsability,
} from "../../src/specs/rogue/assassination/action-profile.js";
import { resolveItemGateIrrelevance } from "../../src/specs/rogue/assassination/item-gate-irrelevance.js";
import { tryAbilityIdentityFor } from "../../src/data/game/rogue-abilities.js";
import {
  classifyDecision,
  type DecisionBlockerClass,
  type DecisionCoverage,
  type DecisionCoverageResult,
} from "../../src/specs/rogue/assassination/decision-coverage.js";
import type { CombatState } from "../../src/engine/state/combat-state.js";
import {
  M5D2_ACTOR,
  M5D2_IDS,
  M5D2_TARGET,
  findCastAt,
  findSoleEventAt,
  m5d2State,
  m5d2TalentEntries,
} from "./m5d2-fixture.js";

/** How a case locates its query position. */
export type QueryPoint =
  /** The position of an observed COMPLETE cast by actor 19. */
  | { readonly kind: "OBSERVED_CAST"; readonly reportTimeMs: number; readonly abilityGameId: number }
  /** The sole event at a timestamp, used where the query is NOT at a cast. */
  | { readonly kind: "SOLE_EVENT"; readonly reportTimeMs: number };

/**
 * The spell id the query is told was observed.
 *
 * `SUPPRESSED` is the case-2 mechanism: a sentinel matching no ability, so the
 * observed-execution usability rule cannot fire for anything. It is NOT a claim
 * that nothing was cast — it is a claim that no cast is being USED as evidence.
 */
export const SUPPRESSED_OBSERVATION = -1;

export interface CorpusCase {
  readonly id: number;
  readonly name: string;
  /** How this decision was picked from the census. Re-derivable, not asserted. */
  readonly selectionRule: string;
  readonly purpose: "AUTHORITY_VERIFICATION" | "EPISTEMIC_BOUNDARY";
  readonly queryPoint: QueryPoint;
  readonly observedAbilityGameId: number;
  readonly expectedCoverage: DecisionCoverage;
  /** `null` when the case is expected to resolve. */
  readonly expectedBlockerClass: DecisionBlockerClass | null;
  /** Why this outcome is the honest one. Prose for the reader, not an assertion. */
  readonly rationale: string;
}

export const M5D2_CORPUS: readonly CorpusCase[] = [
  {
    id: 1,
    name: "post-Vanish Garrote at Q",
    selectionRule: "the M5-C3c1 decision point Q, carried forward unchanged as the regression anchor",
    purpose: "AUTHORITY_VERIFICATION",
    queryPoint: { kind: "OBSERVED_CAST", reportTimeMs: 2_176_580, abilityGameId: M5D2_IDS.garrote },
    observedAbilityGameId: M5D2_IDS.garrote,
    expectedCoverage: "EXACT_ENTRY",
    expectedBlockerClass: null,
    rationale:
      "Stealth from Vanish makes cds[5]'s `!stealthed.rogue` FALSE, so the unsupported vanish list is " +
      "never entered; the Garrote DoT anchor at 2,164,326 makes core_dot[0]'s remainder term derivable; " +
      "and the observed cast proves usability. Every other case fails at one of those three.",
  },
  {
    id: 2,
    name: "post-Vanish Garrote WITHOUT the observed cast",
    selectionRule:
      "the sole event at 2,176,491 — strictly after the Vanish cast at 2,176,120 and strictly before " +
      "the Garrote cast at 2,176,580 — with the observation suppressed",
    purpose: "EPISTEMIC_BOUNDARY",
    queryPoint: { kind: "SOLE_EVENT", reportTimeMs: 2_176_491 },
    observedAbilityGameId: SUPPRESSED_OBSERVATION,
    expectedCoverage: "UNKNOWN",
    expectedBlockerClass: "OBSERVED_STATE_MISSING",
    rationale:
      "THE BOUNDARY CASE. core_dot[0]'s CONDITION resolves TRUE here on real state — the D1 primitives " +
      "all do their work — and the decision still cannot be named, because Garrote is not PROVEN_USABLE. " +
      "This build has exactly one positive usability proof and it is the observed execution. See " +
      "`agent/architecture.md`; this is authority verification, not next-action prediction.",
  },
  {
    id: 3,
    name: "max-combo-point Envenom, first after Q",
    selectionRule: "the first Envenom cast strictly after Q whose PRE_COST combo points are 7 of 7",
    purpose: "AUTHORITY_VERIFICATION",
    queryPoint: { kind: "OBSERVED_CAST", reportTimeMs: 2_178_582, abilityGameId: M5D2_IDS.envenom },
    observedAbilityGameId: M5D2_IDS.envenom,
    expectedCoverage: "UNKNOWN",
    // M11-D3-0: DIVERGENT_WORLDS until then, a divergence that rested on the
    // decision's stale PRE_COST Energy reused after a hypothetical Thistle Tea
    // (PLAYER_ENERGY); the post-Tea rescan now fails closed on unobserved Energy.
    expectedBlockerClass: "OBSERVED_STATE_MISSING",
    rationale:
      "The one-scan gets all the way to `spend[1] envenom SELECTED` — the Vanish cooldown anchor " +
      "eliminates the vanish list, and 7 of 7 combo points make default[7] FALSE and default[8] TRUE. " +
      "But a world in which Thistle Tea fires first must rescan, and Tea's contract writes PLAYER_ENERGY " +
      "without establishing the new amount, so that rescan reads `energy.pct` as not established and " +
      "blocks at default[3] `thistle_tea,if=energy.pct<30|fight_remains<10`. Before M11-D3-0 the rescan " +
      "reused the pre-Tea PRE_COST Energy and diverged between Garrote and Rupture instead. Either way the " +
      "lower-priority Envenom is not picked: that would be the priority short-circuit CLAUDE.md forbids.",
  },
  {
    id: 4,
    name: "max-combo-point Envenom, 14.8 s after the Vanish anchor",
    selectionRule:
      "the last Envenom cast at 7 of 7 combo points strictly before the first Fan of Knives after Q",
    purpose: "AUTHORITY_VERIFICATION",
    queryPoint: { kind: "OBSERVED_CAST", reportTimeMs: 2_190_902, abilityGameId: M5D2_IDS.envenom },
    observedAbilityGameId: M5D2_IDS.envenom,
    expectedCoverage: "UNKNOWN",
    // M11-D3-0: DIVERGENT_WORLDS until then, a divergence that rested on the
    // decision's stale PRE_COST Energy reused after a hypothetical Thistle Tea
    // (PLAYER_ENERGY); the post-Tea rescan now fails closed on unobserved Energy.
    expectedBlockerClass: "OBSERVED_STATE_MISSING",
    rationale:
      "The same shape as case 3, 12.3 s later, and it exists to prove the Vanish CHARGE cooldown is " +
      "what governs: 14,782 ms after the anchor, well inside 120,000 ms, so vanish[0] and vanish[1] are " +
      "still PROVEN_UNUSABLE. Read against the nominal 1,000 ms `_cooldown` this entry would have " +
      "re-opened and the scan would block earlier.",
  },
  {
    id: 5,
    name: "Rupture DoT maintenance",
    selectionRule: "the first Rupture cast strictly after Q",
    purpose: "AUTHORITY_VERIFICATION",
    queryPoint: { kind: "OBSERVED_CAST", reportTimeMs: 2_194_927, abilityGameId: M5D2_IDS.rupture },
    observedAbilityGameId: M5D2_IDS.rupture,
    expectedCoverage: "UNKNOWN",
    expectedBlockerClass: "OBSERVED_STATE_MISSING",
    rationale:
      "Rupture is PROVEN_USABLE from the observed cast and core_dot[3] is reached, but its condition " +
      "needs `refreshable`, and Rupture's nearest anchor on this target is a REFRESH with no derivable " +
      "duration. The scan then reaches spend[2], whose `target.time_to_die` and `spell_targets` refuse " +
      "outright. The DoT gap is an evidence gap; it is not repaired by assuming a duration.",
  },
  {
    id: 6,
    name: "Deathmark, held to UNKNOWN by predictive state",
    selectionRule: "the last Deathmark cast strictly before Q",
    purpose: "EPISTEMIC_BOUNDARY",
    queryPoint: { kind: "OBSERVED_CAST", reportTimeMs: 2_172_777, abilityGameId: M5D2_IDS.deathmark },
    observedAbilityGameId: M5D2_IDS.deathmark,
    expectedCoverage: "UNKNOWN",
    expectedBlockerClass: "OBSERVED_STATE_MISSING",
    rationale:
      "Deathmark is PROVEN_USABLE from the observed cast and cds[0] is reached as a live candidate — " +
      "yet its condition ends `(target.time_to_die>10|fight_remains<20)`, both permanently unbindable, " +
      "so it can never evaluate TRUE. A ready major cooldown that was actually used still does not " +
      "become a selectable one. The scan's own earliest refusal is the unresolved prefix, which is what " +
      "the blocker class reports; `m5d2-decision-corpus.test.ts` asserts the cds[0] step directly.",
  },
  {
    id: 7,
    name: "Fan of Knives, held to UNKNOWN by target count",
    selectionRule: "the first Fan of Knives cast strictly after Q",
    purpose: "EPISTEMIC_BOUNDARY",
    queryPoint: { kind: "OBSERVED_CAST", reportTimeMs: 2_191_906, abilityGameId: M5D2_IDS.fanOfKnives },
    observedAbilityGameId: M5D2_IDS.fanOfKnives,
    expectedCoverage: "UNKNOWN",
    expectedBlockerClass: "OBSERVED_STATE_MISSING",
    rationale:
      "The player really did press Fan of Knives, and the analyzer still refuses. Every generate entry " +
      "is gated on `spell_targets.fan_of_knives`, which counts the SIMULATION's enemy roster and has no " +
      "Warcraft Logs equivalent, so the builder list cannot be entered at all. Observing the cast does " +
      "not license reading a target count back out of it.",
  },
];

export interface CorpusRun {
  readonly kase: CorpusCase;
  readonly position: number;
  readonly outcome: FirstGcdQueryOutcome;
  readonly result: RotationalGcdResult;
  readonly classified: DecisionCoverageResult;
  /**
   * The ONE-SCAN steps behind the answer.
   *
   * The top-level result says whether the decision resolved. It cannot say WHICH
   * entry the evidence actually died on, because the first-GCD engine reports
   * the earliest unresolved candidate rather than the most interesting one. Two
   * cases can share a blocker name and be blocked by entirely different things,
   * so the corpus asserts the step as well as the verdict.
   */
  readonly steps: readonly TraversalStep[];
  readonly state: CombatState;
  readonly authority: AplAuthority;
}

/** The one-scan step for an entry, or `null` when the scan never reached it. */
export function stepAt(run: CorpusRun, listName: string, priorityOrdinal: number): TraversalStep | null {
  return run.steps.find((s) => s.listName === listName && s.priorityOrdinal === priorityOrdinal) ?? null;
}

function wireTypeFor(resourceId: string): number {
  const contract = RESOURCE_WIRE_CONTRACTS.find((entry) => entry.resourceId === resourceId);
  if (contract === undefined) throw new Error(`no wire contract for ${resourceId}`);
  return contract.wireType;
}

export function authorityOrThrow(): AplAuthority {
  const loaded = pinnedAssassinationAuthority();
  if (!loaded.ok) throw new Error(`pinned authority unavailable: ${loaded.reason}`);
  return loaded.authority;
}

export function positionOf(state: CombatState, point: QueryPoint): number {
  return point.kind === "OBSERVED_CAST"
    ? findCastAt(state, {
        actorId: M5D2_ACTOR,
        reportTimeMs: point.reportTimeMs,
        abilityGameId: point.abilityGameId,
      })
    : findSoleEventAt(state, point.reportTimeMs);
}

/**
 * Runs one corpus case end to end against the committed fixture.
 *
 * Every case goes through the SAME path — no case gets a bespoke input — so a
 * difference between two cases is a difference in the evidence, never in how the
 * question was asked.
 */
export function runCase(kase: CorpusCase, state: CombatState = m5d2State()): CorpusRun {
  const authority = authorityOrThrow();
  const profile = authorityProfileFor(state, M5D2_ACTOR);
  if (profile === null) throw new Error("the fixture must carry combatantinfo for actor 19");
  const position = positionOf(state, kase.queryPoint);

  const { bindings } = rotationalBindingsAt({
    state,
    actorId: M5D2_ACTOR,
    targetActorId: M5D2_TARGET,
    position,
    observedAbilityGameId: kase.observedAbilityGameId,
    authority,
    comboPointWireType: wireTypeFor("COMBO_POINTS"),
    energyWireType: wireTypeFor("ENERGY"),
    comboPointResourceId: "COMBO_POINTS",
    energyResourceId: "ENERGY",
    knownTalents: resolveModelledTalents(m5d2TalentEntries(state)),
  });

  const outcome = firstGcdSelectionAt({
    state,
    actorId: M5D2_ACTOR,
    position,
    authority,
    profile,
    bindings,
    observedAbilityGameId: kase.observedAbilityGameId,
    engagementTargetActorId: M5D2_TARGET,
  });

  const profileInput = {
    state,
    actorId: M5D2_ACTOR,
    position,
    profile,
    engagementTargetActorId: M5D2_TARGET,
  };
  const abilityIdFor = (token: string): number | null => tryAbilityIdentityFor(token)?.spellId ?? null;
  const scan = resolveOneForegroundScan({
    authority,
    entryListName: "default",
    bindings,
    usabilityFor: (action) =>
      resolveUsability(profileInput, action, kase.observedAbilityGameId, abilityIdFor),
    applicabilityFor: (action) => resolveApplicability(profileInput, action),
    gateIrrelevanceFor: (action) => resolveItemGateIrrelevance({ observed: profile.observed }, action),
  });

  return {
    kase,
    position,
    outcome,
    result: outcome.result,
    classified: classifyDecision(outcome.result),
    steps: scan.steps,
    state,
    authority,
  };
}

/** Runs every case once, against one shared state. */
export function runCorpus(): readonly CorpusRun[] {
  const state = m5d2State();
  return M5D2_CORPUS.map((kase) => runCase(kase, state));
}
