/**
 * The Protection Paladin atom resolver (M10-C).
 *
 * WHAT THIS IS
 *
 * The specialization-owned half of the resolver seam. The shared parser
 * admits the identifiers `vocabulary.ts` declares; THIS module says what each
 * one is worth at one decision point, from M4 state and the pinned Paladin
 * facts, and nothing else. Every value it binds is a positive claim with a
 * named source; everything it cannot establish it leaves unbound, and the
 * shared evaluator enumerates an unbound truth and refuses an unbound
 * magnitude. There is no path here from "not observed" to a value.
 *
 * WHAT IT READS
 *
 *     M4 state          the actor's completed casts (for `prev_gcd`)
 *     combatant info    the observed talent tree (for talents, hero tree, apex)
 *     pinned facts      paladin-protection-talents.json,
 *                       paladin-protection-gcd-semantics.json,
 *                       and the source readings recorded in `vocabulary.ts`
 *
 * It reads no Rogue module, no Rogue artifact and no Rogue authority; the
 * cross-spec sweep pins that structurally.
 *
 * THE IDENTIFIERS, ONE BY ONE
 *
 *   talent.righteous_protector.enabled
 *       The pinned talent's three-way selection. SELECTED -> TRUE,
 *       NOT_SELECTED -> FALSE, UNKNOWN -> unbound.
 *   hero_tree.lightsmith
 *       Hero-tree MEMBERSHIP of the observed entries against the two pinned
 *       sub-trees. Lightsmith entries observed -> TRUE; entries of the OTHER
 *       pinned tree observed and none of Lightsmith -> FALSE; nothing pinned
 *       observed, or both -> unbound. Never inferred from a cast.
 *   apex.3
 *       The third pinned tiered trait, by the same three-way rule.
 *   prev_gcd.1.divine_toll
 *       The most recent GCD-CONSUMING foreground cast before the decision, by
 *       the pinned lane of each cast walked back from the decision. A melee
 *       swing (Warcraft Logs' `melee` flag) is a background attack and is
 *       stepped over; a cast whose lane the dataset does not establish stops
 *       the walk UNBOUND; and the claim is made only when CASTS coverage for
 *       the actor is COMPLETE from the found cast to the decision, so an
 *       unretrieved press in between cannot be mistaken for none. No prior
 *       GCD cast in the fight -> unbound: what was pressed before the pull is
 *       not in the log.
 *   next_armament
 *       -1 (KNOWN) when the hero tree is RESOLVED and is not Lightsmith,
 *       because sc_paladin.cpp:5205-5208 returns -1 before consulting the
 *       armament state. Under Lightsmith, KNOWN from the last observed Holy
 *       Armaments HARDCAST strictly before the decision under complete CASTS
 *       coverage since (`armament-state.ts`, M10-C5 Phase B); otherwise
 *       UNKNOWN_NUMBER / STATE_NOT_ESTABLISHED with the state machine's
 *       reason — the alternation starts from a pre-pull state this build
 *       cannot observe, and a buff transition never anchors it.
 *   sacred_weapon, holy_bulwark
 *       KNOWN constants 1 and 0 (sc_paladin.hpp:25-29).
 *   consecration.up
 *       SimulationCraft's `active_consecration != nullptr` (sc_paladin.cpp:
 *       5036-5038) is whether the actor's own hardcast Consecration ground
 *       effect is alive — not whether they stand in it. M10-C5 Phase B binds
 *       it from the last observed Consecration cast and the pinned duration
 *       (`bindGroundEffectPresence`): TRUE only while the elapsed time is at
 *       most the shortest admissible duration less the last-pulse allowance
 *       (the ground aoe dies at its last hasted pulse, inside (D − 1 s, D]);
 *       FALSE only when the whole longest duration before the decision lies
 *       inside the log under complete CASTS coverage; UNKNOWN (unbound,
 *       enumerated) in between and whenever the cast state or the duration
 *       modifiers are not established.
 *   full_recharge_time, charges, gcd
 *       UNKNOWN_NUMBER / STATE_NOT_MODELLED, stated per action token for the
 *       two self-addressing ones. No charge or GCD-length model exists.
 */

import type { CombatState } from "../../../engine/state/combat-state.js";
import { gateAbsenceClaim } from "../../../engine/state/state-result.js";
import { inclusiveRange } from "../../../engine/evidence/coverage.js";
import type { EvidenceLocator } from "../../../engine/evidence/locator.js";
import { knownNumber, unknownNumber } from "../../../simc/expression/evaluate.js";
import { armamentStateAt, type ArmamentState } from "./armament-state.js";
import { bindGroundEffectPresence, type GroundEffectPresence } from "./cooldown-bindings.js";
import type { SpecAtomBinding, SpecAtomBindings } from "../../../simc/expression/spec-vocabulary.js";
import {
  protectionExecutionLaneForAbility,
  protectionTokenBinding,
} from "../../../data/game/paladin-protection-gcd-semantics.js";
import {
  resolveProtectionApexTrait,
  resolveProtectionHeroTree,
  resolveProtectionModelledTalents,
  resolveProtectionTalent,
} from "../../../data/game/paladin-protection-talents.js";
import type { ObservedTalentEntry } from "../../../data/game/talent-selection.js";
import type { HeroTreeResolution, TalentResolution } from "../../../data/game/talent-selection.js";
import {
  CONSECRATION_UP,
  APEX_3,
  CHARGES,
  FULL_RECHARGE_TIME,
  GCD,
  HERO_TREE_LIGHTSMITH,
  HOLY_BULWARK,
  NEXT_ARMAMENT,
  PREV_GCD_1_DIVINE_TOLL,
  PROTECTION_ATOM_VOCABULARY,
  SACRED_WEAPON,
  TALENT_RIGHTEOUS_PROTECTOR_ENABLED,
} from "./vocabulary.js";

/** `armament` enum values, sc_paladin.hpp:25-29. */
export const ARMAMENT_HOLY_BULWARK = 0;
export const ARMAMENT_SACRED_WEAPON = 1;
/** `next_armament_expr_t::evaluate` when `!paladin.lightsmith()`, sc_paladin.cpp:5205-5208. */
export const NEXT_ARMAMENT_WHEN_NOT_LIGHTSMITH = -1;

export const LIGHTSMITH_HERO_TREE_NAME = "lightsmith";
export const DIVINE_TOLL_TOKEN = "divine_toll";

/**
 * The previous GCD-consuming cast, or why it is not established.
 *
 * A REUSABLE query over M4's own indexes. It names no Paladin ability: the
 * lane oracle is supplied, so the same walk answers `prev_gcd` for any
 * specialization that hands it its own pinned lanes.
 */
export type PreviousGcdCast =
  | {
      readonly state: "ESTABLISHED";
      readonly position: number;
      readonly locator: EvidenceLocator;
      readonly abilityGameId: number;
      readonly reportTimeMs: number;
    }
  | {
      readonly state: "UNKNOWN";
      readonly reason:
        /** A foreground cast whose lane the dataset does not establish was met first. */
        | "LANE_NOT_ESTABLISHED"
        /** No GCD cast by the actor precedes the decision in the retrieved evidence. */
        | "NO_PRIOR_GCD_CAST_IN_EVIDENCE"
        /** CASTS coverage for the actor is not COMPLETE from the found cast to the decision. */
        | "INSUFFICIENT_COVERAGE"
        /** The decision position names no event. */
        | "POSITION_UNRESOLVED";
      /** The cast the walk stopped at, when it stopped at one. */
      readonly stoppedAtPosition: number | null;
    };

export function previousGcdCastAt(
  state: CombatState,
  actorId: number,
  position: number,
  laneFor: (abilityGameId: number) => "GCD_CONSUMING" | "NON_GCD" | "UNKNOWN_LANE",
): PreviousGcdCast {
  const decision = state.eventAt(position);
  if (decision === null) return { state: "UNKNOWN", reason: "POSITION_UNRESOLVED", stoppedAtPosition: null };

  const positions = state.positionsBySourceActor(actorId);
  for (let index = positions.length - 1; index >= 0; index -= 1) {
    const candidate = positions[index];
    if (candidate === undefined || candidate >= position) continue;
    const event = state.eventAt(candidate);
    if (event === null || event.kind !== "CAST" || event.castPhase !== "COMPLETE") continue;
    if (event.source?.actorId !== actorId) continue;
    // A melee swing is a background attack, never a foreground press: it is
    // stepped over, exactly as `prev_gcd_actions` never receives one.
    if (event.isMelee === true) continue;
    const abilityGameId = event.abilityGameId;
    if (abilityGameId === null) {
      return { state: "UNKNOWN", reason: "LANE_NOT_ESTABLISHED", stoppedAtPosition: candidate };
    }
    const lane = laneFor(abilityGameId);
    if (lane === "UNKNOWN_LANE") {
      return { state: "UNKNOWN", reason: "LANE_NOT_ESTABLISHED", stoppedAtPosition: candidate };
    }
    if (lane === "NON_GCD") continue;

    // Found. The claim "this was the previous GCD action" is an absence claim
    // about the interval between the two casts, and is gated as one.
    const gate = gateAbsenceClaim({
      completeness: state.fight.completeness,
      category: "CASTS",
      range: inclusiveRange(event.reportTimeMs, decision.reportTimeMs),
      actorId,
    });
    if (!gate.ok) {
      return { state: "UNKNOWN", reason: "INSUFFICIENT_COVERAGE", stoppedAtPosition: candidate };
    }
    return {
      state: "ESTABLISHED",
      position: candidate,
      locator: event.locator,
      abilityGameId,
      reportTimeMs: event.reportTimeMs,
    };
  }
  return { state: "UNKNOWN", reason: "NO_PRIOR_GCD_CAST_IN_EVIDENCE", stoppedAtPosition: null };
}

export interface ProtectionResolverInput {
  readonly state: CombatState;
  readonly actorId: number;
  /** Canonical index of the decision point. */
  readonly position: number;
  /** The actor's observed talent tree, from its combatant info. */
  readonly observedTalents: readonly ObservedTalentEntry[];
  /** Every action token in the authority, for the self-addressing magnitudes. */
  readonly actionTokens: readonly string[];
}

/** What the resolver established, for the payload and for tests. */
export interface ProtectionResolverDiagnostics {
  readonly righteousProtector: TalentResolution;
  readonly heroTree: HeroTreeResolution;
  readonly apex3: TalentResolution;
  readonly previousGcdCast: PreviousGcdCast;
  /** The Lightsmith alternation at this decision (M10-C5 Phase B); `null` when the tree is not Lightsmith. */
  readonly armament: ArmamentState | null;
  /** The actor's own Consecration ground effect at this decision (M10-C5 Phase B). */
  readonly consecration: GroundEffectPresence;
  /** The modelled talents that resolved, in `knownTalents` shape. */
  readonly knownTalents: readonly { readonly name: string; readonly taken: boolean }[];
}

export interface ProtectionResolution {
  readonly specAtoms: SpecAtomBindings;
  readonly diagnostics: ProtectionResolverDiagnostics;
}

function truth(key: string, value: boolean): SpecAtomBinding {
  return { key, actionToken: null, value: { kind: "TRUTH", value } };
}

function magnitude(key: string, value: number, actionToken: string | null = null): SpecAtomBinding {
  return { key, actionToken, value: { kind: "MAGNITUDE", binding: knownNumber(value) } };
}

function notModelled(key: string, actionToken: string | null = null): SpecAtomBinding {
  return { key, actionToken, value: { kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_MODELLED") } };
}

/** Modelled, but not established by this evidence at this decision. */
function notEstablished(key: string, actionToken: string | null = null): SpecAtomBinding {
  return { key, actionToken, value: { kind: "MAGNITUDE", binding: unknownNumber("STATE_NOT_ESTABLISHED") } };
}

/** Binds every declared atom this evidence supports; leaves the rest unbound. */
export function resolveProtectionAtoms(input: ProtectionResolverInput): ProtectionResolution {
  const { state, actorId, position, observedTalents } = input;
  const bound: SpecAtomBinding[] = [];

  // ---- talents: the pinned three-way rule, never a default ----
  const righteousProtector = resolveProtectionTalent(observedTalents, "righteous_protector");
  if (righteousProtector.selection !== "UNKNOWN") {
    bound.push(truth(TALENT_RIGHTEOUS_PROTECTOR_ENABLED, righteousProtector.selection === "SELECTED"));
  }

  // ---- hero tree: membership of observed entries in the pinned sub-trees ----
  const heroTree = resolveProtectionHeroTree(observedTalents);
  let armament: ArmamentState | null = null;
  if (heroTree.state === "RESOLVED") {
    const lightsmith = heroTree.simcName === LIGHTSMITH_HERO_TREE_NAME;
    bound.push(truth(HERO_TREE_LIGHTSMITH, lightsmith));
    // `next_armament` is -1 the moment the tree is not Lightsmith. Under
    // Lightsmith it is KNOWN only from an observed hardcast strictly before
    // the decision under complete coverage since; otherwise a refusal with the
    // state machine's reason, never the constructor's initial value.
    if (!lightsmith) {
      bound.push(magnitude(NEXT_ARMAMENT, NEXT_ARMAMENT_WHEN_NOT_LIGHTSMITH));
    } else {
      armament = armamentStateAt({ state, actorId, position });
      if (armament.state === "KNOWN") bound.push(magnitude(NEXT_ARMAMENT, armament.nextArmament));
      else bound.push(notEstablished(NEXT_ARMAMENT));
    }
  } else {
    bound.push(notModelled(NEXT_ARMAMENT));
  }

  // ---- apex.3: the third pinned tiered trait ----
  const apex3 = resolveProtectionApexTrait(observedTalents, 3);
  if (apex3.selection !== "UNKNOWN") bound.push(truth(APEX_3, apex3.selection === "SELECTED"));

  // ---- prev_gcd.1.divine_toll: the previous GCD cast, by pinned lane ----
  const previousGcdCast = previousGcdCastAt(state, actorId, position, protectionExecutionLaneForAbility);
  if (previousGcdCast.state === "ESTABLISHED") {
    const divineToll = protectionTokenBinding(DIVINE_TOLL_TOKEN);
    const divineTollIds =
      divineToll.kind === "KNOWN_ONE"
        ? [divineToll.abilityGameId]
        : divineToll.kind === "KNOWN_SET"
          ? divineToll.abilityGameIds
          : [];
    // A token the dataset does not bind cannot be compared against; the atom
    // then stays unbound rather than becoming FALSE.
    if (divineTollIds.length > 0) {
      bound.push(truth(PREV_GCD_1_DIVINE_TOLL, divineTollIds.includes(previousGcdCast.abilityGameId)));
    }
  }

  // ---- the pinned constants ----
  bound.push(magnitude(SACRED_WEAPON, ARMAMENT_SACRED_WEAPON));
  bound.push(magnitude(HOLY_BULWARK, ARMAMENT_HOLY_BULWARK));

  // ---- magnitudes this build models nothing of, stated as such ----
  bound.push(notModelled(GCD));
  for (const token of input.actionTokens) {
    bound.push(notModelled(FULL_RECHARGE_TIME, token));
    bound.push(notModelled(CHARGES, token));
  }

  // ---- consecration.up: the ground effect's lifetime from its last cast ----
  const consecration = bindGroundEffectPresence(
    { state, actorId, position, observedTalents },
    "consecration",
  );
  if (consecration.state === "BOUND") bound.push(truth(CONSECRATION_UP, consecration.up));

  return {
    specAtoms: { vocabulary: PROTECTION_ATOM_VOCABULARY, bound },
    diagnostics: {
      righteousProtector,
      heroTree,
      apex3,
      previousGcdCast,
      armament,
      consecration,
      knownTalents: resolveProtectionModelledTalents(observedTalents),
    },
  };
}
